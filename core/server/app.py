"""
学習クイズアプリ バックエンド（試験非依存のコア）
- Flask + SQLite（軽量・標準ライブラリ＋werkzeug）
- 静的アプリ（../app）とカートリッジ（CARTRIDGE_DIR/dist）の配信、
  ユーザー認証つき成績 API を1プロセスで提供
- ユーザー名（ニックネーム）＋パスワードでログイン。記録はログインユーザーに紐付く。

環境変数:
  APP_DIR        静的アプリのパス（既定: ../app）
  CARTRIDGE_DIR  カートリッジのパス（既定: ../../cartridges 配下に1つだけあるもの）
                 その dist/ を /cartridge/ と /manifest.webmanifest で配信する
  DB_PATH        SQLite ファイルパス（既定: ./data/records.db）
  SECRET_KEY     セッション署名鍵（本番では必ず固定値を設定。未設定だと起動毎に無効化）
  SIGNUP_CODE    設定すると新規登録に招待コードを要求（公開時の無秩序な登録を防止）
  DEMO_MODE      "1" でデモモード。新規登録を塞ぎ、ボタン1つで使い捨てユーザーを
                 作ってログインする（成績は毎回まっさらな状態から始まる）
  COOKIE_SECURE  "1" で Secure クッキー（HTTPS 経由のとき有効化）
  COOKIE_PATH    セッションCookieのパス（nginx サブパス配信時に設定。例: /app-quiz/）
  URL_PREFIX     nginx サブパス配信時のプレフィックス（例: /app-quiz）
  PORT / HOST    ローカル実行時の待受（既定 127.0.0.1:8000）
"""
import glob
import os
import re
import time
import sqlite3
import secrets
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory, Response
from werkzeug.security import generate_password_hash, check_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.abspath(os.environ.get("APP_DIR", os.path.join(BASE, "..", "app")))
def default_cartridge_dir():
    """CARTRIDGE_DIR 未設定時は cartridges/ 配下に1つだけあるカートリッジを使う。"""
    root = os.path.join(BASE, "..", "..", "cartridges")
    found = sorted(d for d in glob.glob(os.path.join(root, "*"))
                   if os.path.isfile(os.path.join(d, "cartridge.json")))
    if len(found) != 1:
        raise RuntimeError(
            f"カートリッジを特定できません（{len(found)}件）。CARTRIDGE_DIR を設定してください。")
    return found[0]


CARTRIDGE_DIR = os.path.abspath(os.environ.get("CARTRIDGE_DIR") or default_cartridge_dir())
CARTRIDGE_DIST = os.path.join(CARTRIDGE_DIR, "dist")
URL_PREFIX = os.environ.get("URL_PREFIX", "").rstrip("/")
DB_PATH = os.path.abspath(os.environ.get("DB_PATH", os.path.join(BASE, "data", "records.db")))
SIGNUP_CODE = os.environ.get("SIGNUP_CODE")
DEMO_MODE = os.environ.get("DEMO_MODE") == "1"

app = Flask(__name__, static_folder=APP_DIR, static_url_path="")
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "0") == "1",
    SESSION_COOKIE_PATH=os.environ.get("COOKIE_PATH", "/"),
    PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 30,  # 30日
)

USERNAME_MAX = 24
PASSWORD_MIN = 6


# ---------- DB ----------
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=4000")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with db() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS profiles(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT UNIQUE NOT NULL,
              password_hash TEXT,
              created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS records(
              profile_id INTEGER NOT NULL,
              qid INTEGER NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              correct INTEGER NOT NULL DEFAULT 0,
              wrong INTEGER NOT NULL DEFAULT 0,
              last_correct INTEGER,
              updated_at INTEGER NOT NULL,
              PRIMARY KEY(profile_id, qid)
            );
            CREATE TABLE IF NOT EXISTS activity(
              profile_id INTEGER NOT NULL,
              day TEXT NOT NULL,
              PRIMARY KEY(profile_id, day)
            );
            """
        )
        # 旧スキーマからの移行（password_hash 列が無ければ追加）
        cols = [r["name"] for r in c.execute("PRAGMA table_info(profiles)")]
        if "password_hash" not in cols:
            c.execute("ALTER TABLE profiles ADD COLUMN password_hash TEXT")


# ---------- 認証 ----------
def login_required(f):
    @wraps(f)
    def wrapper(*a, **k):
        if not session.get("uid"):
            return {"error": "authentication required"}, 401
        return f(*a, **k)
    return wrapper


def now_ms():
    return int(time.time() * 1000)


@app.post("/api/register")
def register():
    if DEMO_MODE:
        return {"error": "デモモードでは新規登録できません"}, 403
    d = request.json or {}
    username = (d.get("username") or "").strip()
    password = d.get("password") or ""
    code = d.get("code") or ""
    if SIGNUP_CODE and code != SIGNUP_CODE:
        return {"error": "招待コードが正しくありません"}, 403
    if not (1 <= len(username) <= USERNAME_MAX):
        return {"error": f"ユーザー名は1〜{USERNAME_MAX}文字で入力してください"}, 400
    if re.search(r"[\x00-\x1f]", username):
        return {"error": "ユーザー名に使えない文字が含まれています"}, 400
    if len(password) < PASSWORD_MIN:
        return {"error": f"パスワードは{PASSWORD_MIN}文字以上にしてください"}, 400
    with db() as c:
        if c.execute("SELECT 1 FROM profiles WHERE name=?", (username,)).fetchone():
            return {"error": "そのユーザー名は既に使われています"}, 409
        cur = c.execute(
            "INSERT INTO profiles(name, password_hash, created_at) VALUES(?,?,?)",
            (username, generate_password_hash(password), now_ms()),
        )
        uid = cur.lastrowid
    session.permanent = True
    session["uid"] = uid
    session["uname"] = username
    return {"ok": True, "user": username}


@app.post("/api/login")
def login():
    d = request.json or {}
    username = (d.get("username") or "").strip()
    password = d.get("password") or ""
    with db() as c:
        row = c.execute(
            "SELECT id, password_hash FROM profiles WHERE name=?", (username,)
        ).fetchone()
    if not row or not row["password_hash"] or not check_password_hash(row["password_hash"], password):
        return {"error": "ユーザー名またはパスワードが違います"}, 401
    session.permanent = True
    session["uid"] = row["id"]
    session["uname"] = username
    return {"ok": True, "user": username}


@app.post("/api/logout")
def logout():
    session.clear()
    return {"ok": True}


@app.get("/api/me")
def me():
    return {"user": session.get("uname"), "demo": DEMO_MODE}


@app.post("/api/demo")
def demo_start():
    """デモ用の使い捨てユーザーを作ってログインする。

    毎回別のユーザーを作るので、成績は常に空から始まる。パスワードは
    ランダムに生成してクライアントへは返さない（再ログインはできない）。
    """
    if not DEMO_MODE:
        return {"error": "デモモードではありません"}, 403
    base = "demo%d" % int(time.time())
    with db() as c:
        name = base
        # 同じ秒に複数人が開始したときだけ、短いランダム文字を足して衝突を避ける
        for _ in range(20):
            if not c.execute("SELECT 1 FROM profiles WHERE name=?", (name,)).fetchone():
                break
            name = base + secrets.token_hex(2)
        else:
            return {"error": "デモユーザーを作成できませんでした"}, 500
        cur = c.execute(
            "INSERT INTO profiles(name, password_hash, created_at) VALUES(?,?,?)",
            (name, generate_password_hash(secrets.token_urlsafe(32)), now_ms()),
        )
        uid = cur.lastrowid
    session.permanent = True
    session["uid"] = uid
    session["uname"] = name
    return {"ok": True, "user": name}


# ---------- 記録（要ログイン。ユーザーはセッションから判定） ----------
@app.get("/api/records")
@login_required
def get_records():
    out = {}
    with db() as c:
        rows = c.execute(
            "SELECT qid, attempts, correct, wrong, last_correct, updated_at "
            "FROM records WHERE profile_id=?", (session["uid"],)
        )
        for r in rows:
            out[str(r["qid"])] = {
                "a": r["attempts"], "c": r["correct"], "w": r["wrong"],
                "last": None if r["last_correct"] is None else bool(r["last_correct"]),
                "ts": r["updated_at"],
            }
    return jsonify(out)


@app.post("/api/records")
@login_required
def post_record():
    d = request.json or {}
    qid = d.get("qid")
    correct = 1 if d.get("correct") else 0
    if qid is None:
        return {"error": "qid required"}, 400
    with db() as c:
        c.execute(
            """
            INSERT INTO records(profile_id, qid, attempts, correct, wrong, last_correct, updated_at)
            VALUES(?, ?, 1, ?, ?, ?, ?)
            ON CONFLICT(profile_id, qid) DO UPDATE SET
              attempts     = records.attempts + 1,
              correct      = records.correct + excluded.correct,
              wrong        = records.wrong + excluded.wrong,
              last_correct = excluded.last_correct,
              updated_at   = excluded.updated_at
            """,
            (session["uid"], qid, correct, 1 - correct, correct, now_ms()),
        )
    return {"ok": True}


@app.post("/api/reset")
@login_required
def reset_records():
    with db() as c:
        c.execute("DELETE FROM records WHERE profile_id=?", (session["uid"],))
        c.execute("DELETE FROM activity WHERE profile_id=?", (session["uid"],))
    return {"ok": True}


# ---------- デイリーストリーク（活動日。日付はクライアントのローカルTZで判定） ----------
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@app.get("/api/activity")
@login_required
def get_activity():
    with db() as c:
        days = [r["day"] for r in c.execute(
            "SELECT day FROM activity WHERE profile_id=? ORDER BY day", (session["uid"],)
        )]
    return jsonify(days)


@app.post("/api/activity")
@login_required
def post_activity():
    d = request.json or {}
    day = d.get("day") or ""
    if not DAY_RE.match(day):
        return {"error": "day must be YYYY-MM-DD"}, 400
    with db() as c:
        c.execute(
            "INSERT OR IGNORE INTO activity(profile_id, day) VALUES(?,?)",
            (session["uid"], day),
        )
    return {"ok": True}


# ---------- カートリッジ（試験ごとのデータ＋設定） ----------
@app.get("/cartridge/<path:filename>")
def cartridge_file(filename):
    return send_from_directory(CARTRIDGE_DIST, filename)


@app.get("/manifest.webmanifest")
def manifest():
    # PWA の scope / start_url をアプリのルート基準に保つため、/cartridge/ ではなくここで配信する
    return send_from_directory(CARTRIDGE_DIST, "manifest.webmanifest")


# ---------- 静的アプリ ----------
@app.get("/")
def index():
    # URL_PREFIX が設定されている場合、index.html に _API_BASE を埋め込む
    if URL_PREFIX:
        html = open(os.path.join(APP_DIR, "index.html"), encoding="utf-8").read()
        inject = f'<script>window._API_BASE="{URL_PREFIX}";</script>'
        html = html.replace("</head>", inject + "\n</head>", 1)
        return Response(html, mimetype="text/html")
    return send_from_directory(APP_DIR, "index.html")


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")
    app.run(host=host, port=port, debug=False)
