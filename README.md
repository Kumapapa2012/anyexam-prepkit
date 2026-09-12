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

> 🎓 **アプリを使って勉強する人向け → [ユーザーガイド](https://kumapapa2012.github.io/anyexam-prepkit/user_guide/index.html)**
> — 画面写真つきで、登録から毎日の練習の組み立て方まで。
>
> 📖 **カートリッジを作る・運用する人向け → [Wiki](https://github.com/Kumapapa2012/anyexam-prepkit/wiki)**

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

- **フロント**：静的 PWA（`core/app/`、素の HTML/CSS/JS。ビルドステップなし）
- **バックエンド**：Flask + SQLite（`core/server/`）。画面配信・カートリッジ配信・認証つき成績 API を1プロセスで提供
- **ビルド**：`core/tools/build_cartridge.py` がカートリッジの問題ファイルを統合・分類して `dist/` を生成
- **認証**：ユーザー名＋パスワード（ハッシュ保存／Flask 署名付きセッションクッキー）
- **成績データ**：サーバーの SQLite にユーザー紐付けで保存（オフライン時は記録不可）

→ [アーキテクチャ（Wiki）](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Architecture)

## クイックスタート

```bash
pip install -r core/server/requirements.txt
python core/tools/build_cartridge.py cartridges/sample-exam   # dist/ はコミットしないので初回は必須
python core/server/app.py                                     # http://127.0.0.1:8000/
```

Docker の場合:

```bash
docker compose up -d --build      # http://<HOST>:8000/
```

`cartridges/` にカートリッジが複数ある場合は `CARTRIDGE_DIR=cartridges/<id>` の指定が要る。

> ⚠ **公開する前に**、`SECRET_KEY`（セッション署名鍵）の固定、`SIGNUP_CODE`（招待コード）、
> HTTPS 経由なら `COOKIE_SECURE=1` を必ず設定すること。
> → [デプロイ（Wiki）](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Deployment)

→ [Getting Started（Wiki）](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Getting-Started)

## ドキュメント

アプリを使って勉強する人向けの案内は
📖 **[ユーザーガイド](https://kumapapa2012.github.io/anyexam-prepkit/user_guide/)** にある。
まずは [このアプリでできること](https://kumapapa2012.github.io/anyexam-prepkit/user_guide/01_what_you_can_do.html)
を見ると、画面写真つきで何ができるか分かる。

カートリッジ作成・デプロイなど、作る側・運用する側の詳細はすべて
[Wiki](https://github.com/Kumapapa2012/anyexam-prepkit/wiki) にまとめてある。

| | |
|---|---|
| [Getting Started](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Getting-Started) | インストールからサンプル試験の起動まで |
| [アーキテクチャ](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Architecture) | コア／カートリッジ分離の考え方と3層構成 |
| [カートリッジ作成チュートリアル](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Cartridge-Tutorial) | 自分の試験用カートリッジをゼロから作る通し手順 |
| [cartridge.json リファレンス](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Cartridge-Reference) | 設定キーの全仕様 |
| [問題ファイルの形式](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Question-Format) | 問題・選択肢・メディアのスキーマ |
| [ビルドパイプライン](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Build-Pipeline) | `build_cartridge.py` の挙動とセクション分類 |
| [デプロイ](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Deployment) | Docker / Cloud Run / サブパス配信 / 公開前チェック / 環境変数 |
| [運用](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Operations) | ユーザー管理・デモモード・バックアップ・キャッシュ更新 |
| [サーバー API](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Server-API) | エンドポイント仕様と DB スキーマ |
| [フロントエンド内部](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/Frontend-Internals) | 画面遷移・出題アルゴリズム・各モジュール |
| [FAQ](https://github.com/Kumapapa2012/anyexam-prepkit/wiki/FAQ) | よくある詰まり所とトラブルシューティング |

## 収録カートリッジ

- [`cartridges/sample-exam`](cartridges/sample-exam/README.md) —
  サンプル試験（60問）。単一選択・複数選択・画像・音声動画をひととおり収めた見本。
  素材はすべて自作なので、カートリッジの書き方の参考にそのまま使える

## ライセンス

MIT License. 詳細は [LICENSE](LICENSE) を参照。
