FROM python:3.12-slim

WORKDIR /srv

COPY core/server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY core/ ./core/
COPY cartridges/ ./cartridges/

# 配信するカートリッジ。別の試験に差し替えるときはここを変える（--build-arg CARTRIDGE=...）
ARG CARTRIDGE=sample-exam
# dist/ はコミットしないため、イメージビルド時に生成する
RUN python core/tools/build_cartridge.py "cartridges/${CARTRIDGE}"

ENV APP_DIR=/srv/core/app \
    CARTRIDGE_DIR=/srv/cartridges/${CARTRIDGE} \
    DB_PATH=/srv/data/records.db

EXPOSE 8000
WORKDIR /srv/core/server

# gunicorn で本番運用（2ワーカー）。SQLite は WAL モードで低負荷の同時書込に対応。
# 待受ポートは PORT があればそれに従う（Cloud Run など、実行環境がポートを指定する場合）。
CMD exec gunicorn -b 0.0.0.0:${PORT:-8000} -w 2 --timeout 60 --preload app:app
