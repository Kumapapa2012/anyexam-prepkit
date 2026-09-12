/* 認証つき API クライアント。
   ユーザー名＋パスワードでログイン。記録はサーバー（SQLite）にユーザー紐付けで保存。
   記録はメモリキャッシュ＋非同期POSTで、セッション中の参照は即時反映。 */
(function () {
  const API = window._API_BASE || '';  // URL_PREFIX が埋め込まれた場合はそれを使用
  let cache = {};                 // {qid:{a,c,w,last,ts}} ログイン中ユーザー
  let currentName = '';           // ログイン中ユーザー名（メモリ）
  let demoMode = false;           // サーバーがデモモードで動いているか
  let activity = new Set();       // 活動日 'YYYY-MM-DD'（ローカルTZ）ログイン中ユーザー

  // 端末のローカルタイムゾーンでの日付文字列（ストリークの日付判定はすべてこれを使う）
  function localDay(d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  async function jget(url) {
    const r = await fetch(API + url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('GET ' + url + ' -> ' + r.status);
    return r.json();
  }
  async function jpost(url, body) {
    const r = await fetch(API + url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    let data = null; try { data = await r.json(); } catch (e) { }
    if (!r.ok) { const e = new Error((data && data.error) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
    return data;
  }

  const Store = {
    current() { return currentName; },

    isDemo() { return demoMode; },

    // ログイン状態の確認（起動時）。あわせてサーバーのモードを受け取る
    async me() {
      try {
        const d = await jget('/api/me');
        currentName = d.user || '';
        demoMode = !!d.demo;
        return currentName;
      } catch (e) { console.warn(e); currentName = ''; return ''; }
    },

    // デモ開始：使い捨てユーザーを作って即ログイン（成績は空から始まる）
    async demoStart() {
      const d = await jpost('/api/demo');
      currentName = d.user; return d.user;
    },

    async login(username, password) {
      const d = await jpost('/api/login', { username, password });
      currentName = d.user; return d.user;
    },

    async register(username, password, code) {
      const d = await jpost('/api/register', { username, password, code });
      currentName = d.user; return d.user;
    },

    async logout() {
      try { await jpost('/api/logout'); } catch (e) { console.warn(e); }
      currentName = ''; cache = {}; activity = new Set();
    },

    // サーバーから記録を取得しキャッシュへ（セッション開始/成績表示の前に呼ぶ）
    async loadRecords() {
      try { cache = await jget('/api/records'); } catch (e) { console.warn(e); cache = {}; }
      return cache;
    },

    records() { return cache; },   // キャッシュ同期アクセス（loadRecords 済み前提）

    // 1問の結果を記録：キャッシュ即時更新＋サーバーへ非同期送信
    record(qid, correct) {
      const r = cache[qid] || { a: 0, c: 0, w: 0, last: null, ts: 0 };
      r.a += 1; if (correct) r.c += 1; else r.w += 1;
      r.last = !!correct; r.ts = Date.now();
      cache[qid] = r;
      jpost('/api/records', { qid, correct: !!correct }).catch((e) => console.warn(e));
    },

    async reset() {
      try { await jpost('/api/reset'); } catch (e) { console.warn(e); }
      cache = {}; activity = new Set();
    },

    /* ---------- デイリーストリーク ---------- */

    // サーバーから活動日リストを取得しキャッシュへ（起動/ログイン時に呼ぶ）
    async loadActivity() {
      try { activity = new Set(await jget('/api/activity')); }
      catch (e) { console.warn(e); activity = new Set(); }
      return activity;
    },

    // 今日（ローカルTZ）を活動日として記録。その日初の達成なら true
    markActivity() {
      const day = localDay();
      if (activity.has(day)) return false;
      activity.add(day);
      jpost('/api/activity', { day }).catch((e) => console.warn(e));
      return true;
    },

    // 連続日数。今日未達成なら昨日までの連続を「継続中」として数える
    streakInfo() {
      const todayDone = activity.has(localDay());
      const d = new Date();
      if (!todayDone) d.setDate(d.getDate() - 1);
      let streak = 0;
      while (activity.has(localDay(d))) { streak++; d.setDate(d.getDate() - 1); }
      return { streak, todayDone };
    },

    // 集計（キャッシュから算出）
    summary(questions) {
      const rec = cache;
      let attempted = 0, totalA = 0, totalC = 0;
      const bySection = {};
      questions.forEach((q) => {
        const r = rec[q.id];
        const s = (bySection[q.section] ||= { a: 0, c: 0, total: 0 });
        s.total += 1;
        if (r) { attempted += 1; totalA += r.a; totalC += r.c; s.a += r.a; s.c += r.c; }
      });
      return {
        attempted, totalAttempts: totalA, totalCorrect: totalC,
        accuracy: totalA ? totalC / totalA : 0, bySection,
      };
    },
  };
  window.Store = Store;
})();
