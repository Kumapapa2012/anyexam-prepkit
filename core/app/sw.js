/* Service Worker：オフライン学習のためにアプリ一式をキャッシュ。
   方針＝ネットワーク優先（オンライン時は常に最新、失敗時のみキャッシュ）。
   /api/ はサーバー記録のため常にネットワーク直行（キャッシュしない）。 */
const CACHE = 'quiz-v16';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/cartridge.js',
  './js/media.js',
  './js/mascot.js',
  './js/audio.js',
  './js/storage.js',
  './js/app.js',
  './cartridge/cartridge.json',
  './cartridge/questions.json',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// アプリのベースパス。nginx サブパス配信（URL_PREFIX）でも API を正しく判別するため、
// 固定の '/api/' ではなく登録スコープを基準にする
const SCOPE = new URL(self.registration.scope).pathname;

// 問題のメディアなど、可変のファイルをアプリからの指示で後追いキャッシュする
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'precache' || !Array.isArray(d.urls) || !d.urls.length) return;
  e.waitUntil(caches.open(CACHE).then((c) =>
    Promise.all(d.urls.map((u) => c.add(u).catch(() => { })))));   // 1件の失敗で全体を落とさない
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // API はキャッシュせずネットワーク直行（サーバー記録が正）
  if (new URL(e.request.url).pathname.startsWith(SCOPE + 'api/')) return;
  // ネットワーク優先：成功すればキャッシュ更新、失敗時のみキャッシュへフォールバック
  e.respondWith(
    fetch(e.request).then((res) => {
      // 成功応答だけ保存する（404 などを保存するとオフライン時に誤って返してしまう）
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => { });
      }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => {
      if (hit) return hit;
      // 画面遷移だけ index.html で代替する。画像や音声まで HTML を返すと
      // 200 で中身が違う応答になり、再生エラーの原因が分からなくなる
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }))
  );
});
