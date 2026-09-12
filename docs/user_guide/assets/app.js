/* ==========================================================================
   anyexam-prepkit — ユーザーガイド · app.js
   ダーク/ライト切替・読了プログレスバー・コードのコピーボタン・目次の追従
   ========================================================================== */

(function () {
  const MODE_KEY = 'aep-guide-mode';
  const root = document.documentElement;

  /* ── ダーク / ライト ── */
  function applyMode(mode) {
    const m = mode === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', 'void');
    root.setAttribute('data-mode', m);
    const btn = document.querySelector('[data-mode-toggle]');
    if (btn) btn.textContent = m === 'light' ? '☾ Dark' : '☀ Light';
  }

  function setMode(m) {
    try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* プライベートモード等 */ }
    applyMode(m);
  }

  function storedMode() {
    try { return localStorage.getItem(MODE_KEY); } catch (e) { return null; }
  }

  // 初期表示のちらつきを防ぐため、DOMContentLoaded を待たずに適用する
  applyMode(storedMode() || (window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

  /* ── 読了プログレスバー ── */
  function initProgress() {
    const bar = document.getElementById('read-progress');
    if (!bar) return;
    function update() {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      bar.style.width = max > 0 ? (window.scrollY / max * 100) + '%' : '0%';
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* ── コードのコピーボタン ── */
  const ICON_COPY = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg> copy';
  const ICON_OK = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg> copied!';

  function initCopy() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.innerHTML = ICON_COPY;
      btn.addEventListener('click', () => {
        const pre = btn.closest('.code-wrap')?.querySelector('pre');
        if (!pre || !navigator.clipboard) return;
        navigator.clipboard.writeText(pre.textContent.trim()).then(() => {
          btn.classList.add('copied');
          btn.innerHTML = ICON_OK;
          setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = ICON_COPY; }, 2000);
        });
      });
    });
  }

  /* ── サイドバー目次：いま読んでいる節をハイライト ── */
  function initTocHighlight() {
    const links = [...document.querySelectorAll('.sidebar-list a[href^="#"]')];
    if (!links.length || !('IntersectionObserver' in window)) return;
    const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const seen = new Set();

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
      const current = [...byId.keys()].find(id => seen.has(id));
      links.forEach(a => a.classList.toggle('active', a === byId.get(current)));
    }, { rootMargin: '-72px 0px -70% 0px' });

    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  /* ── 起動 ── */
  document.addEventListener('DOMContentLoaded', () => {
    applyMode(root.getAttribute('data-mode'));
    initProgress();
    initCopy();
    initTocHighlight();
    document.addEventListener('click', e => {
      if (e.target.closest('[data-mode-toggle]')) {
        setMode(root.getAttribute('data-mode') === 'dark' ? 'light' : 'dark');
      }
    });
  });
})();
