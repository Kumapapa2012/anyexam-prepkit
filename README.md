# anyexam-prepkit — 試験対策アプリ フレームワーク

試験ごとの問題データと設定を「カートリッジ」としてフォルダ1つにまとめ、
コア（`core/`）がそれを読み込んで練習アプリとして動かす構成。
コアは試験の中身を一切知らないため、カートリッジを差し替えるだけで別の試験に対応できる。

```
core/          … 試験非依存のフレームワーク（PWA フロント＋Flask バックエンド＋ビルダー）
cartridges/    … 試験ごとのカートリッジ（1試験＝1ディレクトリ）
```

同梱の[サンプル試験](cartridges/sample-exam/README.md)をそのまま動かして、どんなことができるか
確かめられる。自分の試験に合わせるときは `cartridges/` に新しいディレクトリを1つ足すだけでよい。

## 機能

- **出題形式**：単一選択 / 複数選択（集合完全一致で判定）
- **メディア**：問題文・選択肢・解説に画像・音声・動画を添付可（オフラインでも再生）
- **出題タイプ**：ランダム / 本番比率（試験セクション比率）/ 間違え優先（苦手・未挑戦を優先）
- **セッション**：通常セッション / 本番モード（問題数・制限時間はカートリッジ定義）
- **復習ループ**：誤答を全問正解するまで再出題
- **演出**：マスコット「アジー」＋効果音、正誤フィードバック、紙吹雪
- **記録**：ユーザー別に各問の挑戦回数・正誤を保存（→間違え優先の根拠、成績画面）
- **デイリーストリーク**：ローカルタイムゾーンの1日に1回でもテストを完了すると当日達成。
  マイルストーンの応援メッセージは `core/app/js/config.js`（`APP_CONFIG.streak.milestones`）で編集可
- **言語切替**：原文（英語）と訳文（カートリッジが持つ `*_ja`）をボタンで切替
- **PWA**：ホーム画面に追加・オフライン学習可
- **デモモード**：公開デモ用に、新規登録を塞いでボタン1つで使い捨てユーザーを作る

## アーキテクチャ

- **フロント**：静的 PWA（`core/app/`、素の HTML/CSS/JS）。
  `js/cartridge.js` が起動時に `/cartridge/cartridge.json` と `/cartridge/questions.json` を取得し、
  試験名・合格ライン・問題数・制限時間・セクション定義をアプリへ流し込む
- **バックエンド**：Flask + SQLite（`core/server/`）。画面配信・カートリッジ配信・認証つき成績 API を1プロセスで提供
- **ビルド**：`core/tools/build_cartridge.py` がカートリッジの問題ファイルを統合・分類して `dist/` を生成
- **認証**：ユーザー名＋パスワード（ハッシュ保存／Flask 署名付きセッションクッキー）。新規登録は任意で招待コード制限
- **成績データ**：サーバーの SQLite にユーザー紐付けで保存

## 起動方法

### ローカル開発（Docker なし）

```bash
pip install -r core/server/requirements.txt
python core/tools/build_cartridge.py cartridges/sample-exam
python core/server/app.py                     # http://127.0.0.1:8000/
```

`CARTRIDGE_DIR` は `cartridges/` にカートリッジが1つしかなければ省略できる。
複数置いた場合は `CARTRIDGE_DIR=cartridges/<id>` で指定する（PowerShell なら
`$env:CARTRIDGE_DIR="cartridges/<id>"` としてから実行）。
`PORT` / `HOST` 環境変数で待受を変更できる（既定 `127.0.0.1:8000`）。

### Docker

```bash
docker compose up -d --build      # http://<HOST>:8000/
```

`dist/` はコミットしないため、イメージビルド中に `build_cartridge.py` が実行される。
配信するカートリッジは `docker-compose.yml` の `args.CARTRIDGE` で指定する。

**公開前に `docker-compose.yml` で必ず設定**：

- `SECRET_KEY`（セッション署名鍵。固定の長いランダム値。未設定だと再起動で全員ログアウト）
- `SIGNUP_CODE`（新規登録の招待コード）
- HTTPS 経由なら `COOKIE_SECURE=1`

## デモモード

`DEMO_MODE=1` を設定すると、不特定多数に URL を渡す公開デモ向けの挙動になる。

- 新規登録のタブと入力欄を伏せ、`POST /api/register` も 403 で拒否する
- ログインボタンが「デモ開始」になり、押すと `demo{エポック秒}` を自動作成して即ログインする
  （同じ秒に複数人が開始した場合は短いランダム文字を足して衝突を避ける）
- パスワードはランダム生成してクライアントへは返さないため、同じユーザーで再ログインはできない
- 毎回新しいユーザーになるので**成績は常に空から始まる**。セッションが有効な間は通常どおり記録される

通常モードの画面と動作は変わらない。

## カートリッジの作り方

```
cartridges/<id>/
  cartridge.json   … 試験の定義（唯一の設定ファイル・手編集）
  data/            … 問題ファイルと補助データ
  assets/          … 問題で使う画像など（任意。dist/ へコピーされる）
  tools/           … その試験の取込・整形スクリプト（任意）
  dist/            … ビルド成果物（gitignore）
```

### `cartridge.json`

| キー | 内容 |
|---|---|
| `id` | カートリッジ識別子（ディレクトリ名と揃える） |
| `app.title` | アプリ名。`<title>` と PWA マニフェストの `name` |
| `app.headingHtml` | ホーム画面の見出し（HTML 可。改行は `<br/>`） |
| `app.subtitle` | ホーム画面の副題 |
| `app.shortName` / `app.description` / `app.lang` | PWA マニフェスト用 |
| `app.themeColor` / `app.backgroundColor` | テーマ色（`<meta name="theme-color">` とマニフェスト） |
| `exam.passRate` | 合格ライン（0〜1）。結果画面の判定と文言に使用 |
| `exam.questionCount` | 本番モードの問題数 |
| `exam.timeLimitSec` | 本番モードの制限時間（秒） |
| `session.normalLength` | 通常セッションの問題数 |
| `sections` | `{コード: {name, ratio}}`。表示名と本番出題比率（合計 1.0） |
| `build.sources` | 問題ファイルの glob（カートリッジからの相対パス） |
| `build.labels` | 手動分類ラベル `{問題ID: セクションコード}`（任意） |
| `build.answerOverrides` | 正解の差し替え `{問題ID: ["a"]}`（任意） |
| `build.explanationOverrides` | 解説の差し替え `{問題ID: "解説文"}`（任意） |
| `build.translations` | 訳文ファイルの配列 `{問題ID: {question, choices[], explanation}}`（任意） |
| `build.fallbackSection` | キーワード分類が0点だったときの既定セクション |
| `build.keywords` | `{セクションコード: [[キーワード, 重み], …]}`。未ラベルの問題の自動分類に使用 |
| `build.assets` | メディアを置くディレクトリ名（既定 `assets`）。`dist/` へそのままコピーされる |
| `build.precacheMaxBytes` | 起動時に先読みするメディアの上限バイト数（既定 2097152 = 2MB） |

`build.*` はビルド時だけに使われ、クライアントへは配信されない。
`_` で始まるキーはどのデータファイルでもコメント扱いで無視される。

### 問題ファイルの形式

```jsonc
{
  "title": "Practice Test 1",
  "questions": [
    {
      "id": 163242799,
      "type": "single",                       // single（既定）| multi
      "question": "問題文（プレーンテキスト）",
      "questionHtml": "<p>…</p>",             // 任意。あれば原文表示に優先使用
      "media": [                              // 任意。問題文に添えるメディア
        { "kind": "image", "src": "assets/diagram.svg", "alt": "構成図", "caption": "処理フロー" },
        { "kind": "audio", "src": "assets/tone.mp3", "alt": "設問の音声" },
        { "kind": "video", "src": "assets/clip.mp4", "poster": "assets/poster.png", "alt": "操作の録画" }
      ],
      "choices": [
        { "key": "a", "text": "選択肢", "html": "<p>選択肢</p>",
          "media": [ /* 選択肢ごとの画像も可 */ ] }
      ],
      "correct": ["a"],                       // 正解キーの配列（multi は複数）
      "explanation": "解説（プレーンテキスト）",
      "explanationHtml": "<p>…</p>",          // 任意
      "explanationMedia": [ /* 解説に添える画像 */ ]
    }
  ]
}
```

訳文は `build.translations` 経由でビルド時に `question_ja` / `choices[].text_ja` /
`explanation_ja` として合成される（原文は保持される）。

**メディア**：`media` / `choices[].media` / `explanationMedia` に `image` / `audio` / `video`
を指定できる。`src`（と動画の `poster`）は**カートリッジ内の相対パスのみ**で、
外部URL・絶対パス・`..`・未知の `kind` は描画されない。`alt` は読み上げ用（動画・音声では
`aria-label` になる）で、`alt_ja` / `caption_ja` を併記すると言語切替に追随する。

ファイルは `assets/` に置く。ビルド時に実在チェックが走り、欠落は警告される。
参照メディアは起動時に Service Worker へ先読みされ、オフラインでも再生できる。
ただし **2MB を超えるファイルは先読みしない**（初回起動が重くなるため。オンラインでは
通常どおり再生でき、閾値は `build.precacheMaxBytes` で変更できる）。

音声・動画は**自動再生せず**必ず操作UIを出す。同時に複数は鳴らず、採点時・次の問題へ
進むとき・画面を離れるときに自動で停止する。選択肢内のメディアは縮小表示される
（画像・動画は高さ上限 120px）。

**単一選択と複数選択**：`type` を省略するか `single` にすると1つだけ選ぶ形式になり、
回答が `correct` のいずれかに一致すれば正解。`multi` にすると選択肢がトグルになり、
**`correct` との集合完全一致だけを正解**とする（選び漏れも選びすぎも誤答）。
正解の個数はアプリからは表示しないため、「2つ選択してください」のような指示は
問題文に含めること。採点後は、選び漏らした正解に「選び漏れ」の印が付く
（復習画面では「✓（選び漏れ）」と表示）。

### ビルド

```bash
python core/tools/build_cartridge.py cartridges/<id>
```

`dist/cartridge.json`（クライアント向け定義）、`dist/questions.json`（統合済み問題）、
`dist/manifest.webmanifest`、`dist/assets/`（メディア）が生成され、
セクション別の問題数と目標比率、参照メディアの件数（と先読み対象外になったファイル）が
表示される。

分類の確認には `python core/tools/dump_for_classify.py <問題ファイル>` が使える。

## API（記録系はログイン必須・ユーザーはセッションから判定）

| メソッド | パス | 用途 |
|---|---|---|
| POST | `/api/register` `{username,password,code?}` | 登録（招待コードは `SIGNUP_CODE` 設定時必須）＋自動ログイン |
| POST | `/api/login` `{username,password}` | ログイン |
| POST | `/api/logout` | ログアウト |
| GET | `/api/me` | 現在のログインユーザー `{user}` |
| GET | `/api/records` | 自分の記録 `{qid:{a,c,w,last,ts}}` |
| POST | `/api/records` `{qid,correct}` | 1問の結果を記録（upsert集計） |
| GET | `/api/activity` | 自分の活動日リスト（ストリーク用） |
| POST | `/api/activity` `{day}` | 当日達成を記録（day はクライアントのローカルTZ日付） |
| POST | `/api/reset` | 自分の記録＋活動日を全消去 |
| POST | `/api/demo` | 使い捨てユーザーを作って即ログイン（`DEMO_MODE=1` のときのみ） |
| GET | `/cartridge/<file>` | カートリッジの `dist/` を配信 |
| GET | `/manifest.webmanifest` | カートリッジから生成した PWA マニフェスト |

> オフライン方針：記録は**サーバーのみ**（オフライン時は記録不可）。学習画面は
> Service Worker でオフライン表示可（ネットワーク優先・失敗時キャッシュ）、`/api/` はキャッシュしない。
> フロントを変更したら `core/app/sw.js` の `CACHE` 版数を上げて配信中クライアントを強制更新する。

## サーバーの環境変数

| 変数 | 既定 | 用途 |
|---|---|---|
| `APP_DIR` | `../app` | 静的アプリのパス |
| `CARTRIDGE_DIR` | `cartridges/` 配下の唯一のカートリッジ | 配信するカートリッジ（その `dist/` を配信）。複数ある場合は指定必須 |
| `DB_PATH` | `./data/records.db` | SQLite ファイル |
| `SECRET_KEY` | ランダム | セッション署名鍵（本番では固定必須） |
| `SIGNUP_CODE` | なし | 設定すると新規登録に招待コードを要求 |
| `DEMO_MODE` | なし | `1` でデモモード（新規登録を塞ぎ、使い捨てユーザーで即開始） |
| `COOKIE_SECURE` | `0` | `1` で Secure クッキー |
| `COOKIE_PATH` / `URL_PREFIX` | なし | nginx サブパス配信時に設定 |
| `PORT` / `HOST` | `8000` / `127.0.0.1` | ローカル実行時の待受 |

## ユーザー管理（バックエンド操作）

SQLite を直接操作する。DB パスは環境に合わせて変更すること。

```bash
sqlite3 $DB "SELECT id, name FROM profiles;"            # 一覧
```

パスワード変更（即時反映・再起動不要）:

```bash
sudo docker exec <container> python3 -c "
from werkzeug.security import generate_password_hash
import sqlite3, os
conn = sqlite3.connect(os.environ['DB_PATH'])
cur = conn.execute('UPDATE profiles SET password_hash=? WHERE name=?',
    (generate_password_hash('新パスワード'), 'ユーザー名'))
conn.commit()
print(f'変更完了: {cur.rowcount}件')
"
```

ユーザー削除（成績・活動日も合わせて削除）:

```bash
sqlite3 $DB "
BEGIN;
DELETE FROM records  WHERE profile_id=<id>;
DELETE FROM activity WHERE profile_id=<id>;
DELETE FROM profiles WHERE id=<id>;
COMMIT;
"
```

## 収録カートリッジ

- [`cartridges/sample-exam`](cartridges/sample-exam/README.md) —
  サンプル試験（60問）。単一選択・複数選択・画像・音声動画をひととおり収めた見本。
  素材はすべて自作なので、カートリッジの書き方の参考にそのまま使える

## ライセンス

MIT License. 詳細は [LICENSE](LICENSE) を参照。
