/* カートリッジ（試験ごとのデータ＋設定）の取得と、ブランディングの反映。
   コアはこのファイル以外から試験固有の値を知らない。
   サーバーは <CARTRIDGE_DIR>/dist/ を /cartridge/ 配下で配信する。 */
(function () {
  const API = window._API_BASE || '';   // URL_PREFIX が埋め込まれた場合はそれを使用
  let data = null;

  async function jget(url) {
    const r = await fetch(API + url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('GET ' + url + ' -> ' + r.status);
    return r.json();
  }

  const Cartridge = {
    get() { return data; },

    // 定義と問題データを取得。{ id, app, exam, session, sections, questions } を返す
    async load() {
      const [def, qs] = await Promise.all([
        jget('/cartridge/cartridge.json'),
        jget('/cartridge/questions.json'),
      ]);
      data = Object.assign({}, def, { questions: (qs && qs.questions) || [] });
      return data;
    },

    // アプリ名・副題・テーマ色など、見た目のブランディングを反映
    apply(c) {
      const a = (c && c.app) || {};
      if (a.title) document.title = a.title;
      if (a.lang) document.documentElement.lang = a.lang;
      if (a.themeColor) {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', a.themeColor);
      }
      const h = document.getElementById('appHeading');
      if (h) h.innerHTML = a.headingHtml || a.title || '';
      const s = document.getElementById('appSubtitle');
      if (s) s.textContent = a.subtitle || '';
    },
  };

  window.Cartridge = Cartridge;
})();
