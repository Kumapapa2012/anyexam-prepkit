#!/usr/bin/env python3
"""
カートリッジをビルドして、アプリが配信する dist/ を生成する汎用ビルダー。

カートリッジ定義 (cartridge.json) を読み、問題ファイルを1本に統合し、
セクションへ分類したうえで次の3ファイルを <cartridge>/dist/ に出力する。

    cartridge.json      … クライアント向け定義（build キーを除去）
    questions.json      … 統合済みの問題データ
    manifest.webmanifest … PWA マニフェスト（app セクションから生成）

使い方:
    python core/tools/build_cartridge.py cartridges/<id>
"""
import argparse
import glob
import html
import json
import shutil
from pathlib import Path


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def strip_meta(d: dict) -> dict:
    """データファイルのコメント用キー（_ 始まり）を除去する。"""
    return {k: v for k, v in (d or {}).items() if not k.startswith("_")}


def classify(text: str, keywords: dict, sections: dict, fallback: str):
    """重み付きキーワードの合計点が最大のセクションを返す。0点なら fallback。"""
    t = text.lower()
    scores = {code: 0 for code in sections}
    for code, kws in keywords.items():
        if code not in scores:
            continue
        for kw, w in kws:
            if kw.lower() in t:
                scores[code] += w
    best = max(scores, key=lambda c: scores[c]) if scores else fallback
    return (fallback if not scores or scores[best] == 0 else best), scores


MEDIA_FIELDS = ("media", "explanationMedia")
# 起動時に先読みするメディアの上限。これを超えるものは配信はされるが先読みしない
# （オフラインで開いたときに再生できない代わりに、初回起動を重くしない）
DEFAULT_PRECACHE_MAX_BYTES = 2 * 1024 * 1024


def collect_media(questions: list) -> list:
    """問題が参照しているメディアの src を、出現順で重複なく集める。"""
    out = []
    seen = set()

    def take(items):
        for m in items or []:
            for key in ("src", "poster"):     # 動画のポスター画像も対象
                src = (m or {}).get(key)
                if src and src not in seen:
                    seen.add(src)
                    out.append(src)

    for q in questions:
        for f in MEDIA_FIELDS:
            take(q.get(f))
        for c in q.get("choices", []):
            take(c.get("media"))
    return out


def check_media(root: Path, srcs: list) -> list:
    """参照先が実在するか検証し、欠落を警告する。返すのは実在するものだけ。"""
    ok, missing = [], []
    for src in srcs:
        if src.startswith("/") or "://" in src or ".." in src.split("/"):
            missing.append(f"{src}（カートリッジ内の相対パスではありません）")
            continue
        if (root / src).is_file():
            ok.append(src)
        else:
            missing.append(src)
    if missing:
        print(f"⚠ メディアが見つかりません（{len(missing)}件）:")
        for m in missing:
            print(f"    {m}")
    return ok


def build_manifest(cart: dict) -> dict:
    a = cart.get("app", {})
    return {
        "name": a.get("title", cart.get("id", "Quiz")),
        "short_name": a.get("shortName") or a.get("title", "Quiz"),
        "description": a.get("description", ""),
        "lang": a.get("lang", "ja"),
        "start_url": "./index.html",
        "scope": "./",
        "display": "standalone",
        "orientation": "portrait",
        "background_color": a.get("backgroundColor", "#ffffff"),
        "theme_color": a.get("themeColor", "#58cc02"),
        "icons": [
            {"src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
            {"src": "icons/icon-maskable.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "maskable"},
        ],
    }


def main():
    ap = argparse.ArgumentParser(description="カートリッジをビルドして dist/ を生成する")
    ap.add_argument("cartridge", help="カートリッジのディレクトリ（cartridge.json を含む）")
    args = ap.parse_args()

    root = Path(args.cartridge).resolve()
    cart = load_json(root / "cartridge.json")
    if cart is None:
        ap.error(f"cartridge.json が見つかりません: {root}")

    sections = cart["sections"]
    build = cart.get("build", {})
    fallback = build.get("fallbackSection") or next(iter(sections))

    # 手動分類ラベルを優先し、未ラベルの問題だけキーワードで補完する
    labels = strip_meta(load_json(root / build["labels"], {})) if build.get("labels") else {}
    # 出題元の正解設定ミスの修正
    ans_overrides = strip_meta(load_json(root / build["answerOverrides"], {})) if build.get("answerOverrides") else {}
    # 解説が欠落・プレースホルダの問題に対する差し替え
    expl_overrides = strip_meta(load_json(root / build["explanationOverrides"], {})) if build.get("explanationOverrides") else {}

    # 訳文（複数ファイルをマージ）: {qid: {question, choices[], explanation?}}
    translations = {}
    for tname in build.get("translations", []):
        for k, v in strip_meta(load_json(root / tname, {})).items():
            translations.setdefault(k, {}).update(v)

    files = sorted(Path(p) for p in glob.glob(str(root / build["sources"])))
    if not files:
        ap.error(f"問題ファイルが見つかりません: {build['sources']}")

    all_q = []
    n_labeled = n_inline = n_expl = n_tr = 0
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        for q in data["questions"]:
            qid = str(q["id"])
            # 優先順位: ラベルファイル → 問題自身の section → キーワード分類
            if qid in labels:
                section = labels[qid]
                n_labeled += 1
            elif q.get("section") in sections:
                section = q["section"]
                n_inline += 1
            else:
                text = q["question"] + " " + q.get("explanation", "") + " " + \
                       " ".join(c["text"] for c in q["choices"])
                section, _ = classify(text, build.get("keywords", {}), sections, fallback)
            q2 = dict(q)
            q2["quiz"] = f.stem
            q2["section"] = section
            if qid in ans_overrides:
                q2["correct"] = ans_overrides[qid]
            ov = expl_overrides.get(qid)
            if ov:
                q2["explanation"] = ov
                q2["explanationHtml"] = "<p>" + html.escape(ov).replace("\n", "<br>") + "</p>"
                n_expl += 1
            # 訳文の適用（原文は保持し _ja を併存）
            tr = translations.get(qid)
            if tr:
                if tr.get("question"):
                    q2["question_ja"] = tr["question"]
                    n_tr += 1
                tch = tr.get("choices") or []
                if len(tch) == len(q2["choices"]):
                    q2["choices"] = [dict(c, text_ja=tch[i]) for i, c in enumerate(q2["choices"])]
                if tr.get("explanation"):
                    q2["explanation_ja"] = tr["explanation"]
            all_q.append(q2)

    total = len(all_q)
    n_auto = total - n_labeled - n_inline
    print(f"分類: ラベル {n_labeled} 問 / 問題ファイル指定 {n_inline} 問 / キーワード分類 {n_auto} 問")
    print(f"解説オーバーライド適用: {n_expl} 問")
    print(f"訳文適用: {n_tr} 問")

    out_dir = root / "dist"
    out_dir.mkdir(parents=True, exist_ok=True)

    # メディア：参照を集めて実在を確認し、アセットディレクトリごと dist へコピーする
    found = check_media(root, collect_media(all_q))
    # 先読み対象は閾値以下のものだけ（大きい動画で初回起動を重くしない）
    limit = int(build.get("precacheMaxBytes", DEFAULT_PRECACHE_MAX_BYTES))
    assets, skipped = [], []
    for src in found:
        size = (root / src).stat().st_size
        (assets if size <= limit else skipped).append((src, size))
    assets = [src for src, _ in assets]
    assets_dir_name = build.get("assets", "assets")
    src_assets = root / assets_dir_name
    dst_assets = out_dir / assets_dir_name
    if dst_assets.exists():
        shutil.rmtree(dst_assets)
    if src_assets.is_dir():
        shutil.copytree(src_assets, dst_assets)
        n_files = sum(1 for _ in dst_assets.rglob("*") if _.is_file())
        print(f"メディアをコピー: {n_files} ファイル → dist/{assets_dir_name}/")
    if found:
        print(f"問題から参照されているメディア: {len(found)} 件"
              f"（先読み {len(assets)} 件 / 上限 {limit // 1024} KB）")
    for src, size in skipped:
        print(f"    先読み対象外（{size // 1024} KB）: {src}")

    # クライアント向け定義：ビルド専用設定は配信しない
    client_cart = {k: v for k, v in cart.items() if k != "build"}
    client_cart["count"] = total
    client_cart["assets"] = assets   # 起動後に Service Worker へ先読みさせる一覧
    (out_dir / "cartridge.json").write_text(
        json.dumps(client_cart, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "questions.json").write_text(
        json.dumps({"count": total, "questions": all_q}, ensure_ascii=False), encoding="utf-8")
    (out_dir / "manifest.webmanifest").write_text(
        json.dumps(build_manifest(cart), ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"✓ ビルド完了: 全{total}問 → {out_dir}")
    dist = {code: 0 for code in sections}
    for q in all_q:
        dist[q["section"]] += 1
    print(f"{'セクション':<26}{'問題数':>6}{'実比率':>8}{'目標':>7}")
    print("-" * 50)
    for code, s in sections.items():
        n = dist[code]
        print(f"{s['name']:<22}{n:>6}{n / total * 100:>7.1f}%{s.get('ratio', 0) * 100:>6.0f}%")


if __name__ == "__main__":
    main()
