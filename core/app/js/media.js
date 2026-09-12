/* 問題に付随するメディア（画像・音声・動画）の描画。
   カートリッジの media 配列を受け取り、DOM を組み立てて差し込む。
   innerHTML は使わず createElement で構築する（HTML 断片を持ち込ませない）。 */
(function () {
  const API = window._API_BASE || '';
  const BASE = API + '/cartridge/';
  const KINDS = ['image', 'audio', 'video'];

  // カートリッジ内の相対パスだけを許可する（外部URL・絶対パス・親参照は拒否）
  function safeSrc(src) {
    if (typeof src !== 'string' || !src) return null;
    if (src.includes('://') || src.startsWith('//')) return null;
    if (src.startsWith('/')) return null;
    if (src.split('/').includes('..')) return null;
    return BASE + src;
  }

  // 言語に応じた代替テキスト（alt_ja があれば日本語を優先）
  function altText(m, lang) {
    return (lang === 'ja' && m.alt_ja) || m.alt || '';
  }

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function createOne(m, lang) {
    if (!m || KINDS.indexOf(m.kind) < 0) return null;
    const url = safeSrc(m.src);
    if (!url) { console.warn('メディアの src が不正です:', m.src); return null; }

    const wrap = el('figure', 'media media-' + m.kind);
    // 取得に失敗したら壊れた表示を残さず、枠ごと取り除く
    const onError = () => {
      console.warn('メディアを読み込めませんでした:', m.src);
      const box = wrap.parentElement;
      wrap.remove();
      if (box && !box.children.length) box.classList.add('hidden');
    };

    if (m.kind === 'image') {
      const img = el('img');
      img.src = url;
      img.alt = altText(m, lang);
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', onError);
      wrap.appendChild(img);
    } else {
      // 音声・動画：自動再生はせず、必ず操作UIを出す
      const media = el(m.kind);
      media.src = url;
      media.controls = true;
      media.preload = 'metadata';   // 冒頭だけ取得し、再生されるまで本体は落とさない
      if (m.kind === 'video') {
        media.playsInline = true;
        const poster = safeSrc(m.poster);
        if (poster) media.poster = poster;
      }
      const label = altText(m, lang);
      if (label) media.setAttribute('aria-label', label);
      media.addEventListener('error', onError);
      // 同時に複数が鳴らないよう、再生開始時に他を止める
      media.addEventListener('play', () => Media.stopAll(media));
      wrap.appendChild(media);
    }
    const cap = (lang === 'ja' && m.caption_ja) || m.caption;
    if (cap) {
      const fc = el('figcaption');
      fc.textContent = cap;
      wrap.appendChild(fc);
    }
    return wrap;
  }

  const Media = {
    has(list) { return Array.isArray(list) && list.some((m) => m && KINDS.indexOf(m.kind) >= 0); },

    // container の中身をメディアで置き換える。list が空なら container を隠す
    render(container, list, lang) {
      if (!container) return;
      container.textContent = '';
      const items = (Array.isArray(list) ? list : [])
        .map((m) => createOne(m, lang)).filter(Boolean);
      items.forEach((n) => container.appendChild(n));
      container.classList.toggle('hidden', !items.length);
    },

    // 再生中の音声・動画を止める（画面遷移・次問・効果音の前に呼ぶ）
    // except を渡すと、その要素だけは止めない
    stopAll(except) {
      document.querySelectorAll('.media audio, .media video').forEach((el) => {
        if (el === except) return;
        try { el.pause(); } catch (e) { /* 再生前などは無視 */ }
      });
    },

    // 参照されているメディアを Service Worker に先読みさせる（オフライン学習用）
    precache(srcs) {
      if (!Array.isArray(srcs) || !srcs.length) return;
      if (!('serviceWorker' in navigator)) return;
      const urls = srcs.map(safeSrc).filter(Boolean);
      if (!urls.length) return;
      navigator.serviceWorker.ready
        .then((reg) => reg.active && reg.active.postMessage({ type: 'precache', urls }))
        .catch(() => { });
    },
  };

  window.Media = Media;
})();
