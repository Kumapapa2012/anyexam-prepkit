/* メインアプリ：画面遷移・出題選択・クイズ進行・結果・成績 */
(function () {
  const CONFIG = window.APP_CONFIG || {};
  // 以下はカートリッジ（cartridge.json / questions.json）から起動時に設定される
  let QUESTIONS = [];   // 問題バンク
  let SECTIONS = {};    // セクション定義 {code:{name, ratio}}
  let PASS = 0;         // 合格ライン（0〜1）
  let EXAM_N = 0;       // 本番問題数
  let EXAM_SEC = 0;     // 本番制限時間（秒）
  let NORMAL_N = 0;     // 通常セッションの問題数

  const $ = (id) => document.getElementById(id);
  const passPct = () => Math.round(PASS * 100);

  /* ---------- 回答と正誤判定 ----------
     回答 state.answers[i] は選択キーの配列（未回答は null）。
     単一選択は要素1つ、複数選択は選んだ数だけ入る。 */
  const isMulti = (q) => q.type === 'multi' || q.type === 'multiple';
  // 複数選択は集合の完全一致（過不足はすべて誤答）。単一選択は従来どおり正解集合への包含。
  function isCorrect(q, ans) {
    if (!ans || !ans.length) return false;
    if (!isMulti(q)) return q.correct.includes(ans[0]);
    return ans.length === q.correct.length && ans.every((k) => q.correct.includes(k));
  }
  const answered = (ans) => !!(ans && ans.length);
  const el = (sel) => document.querySelector(sel);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };

  const state = {
    profile: '', mode: 'random', length: '',   // length はカートリッジの通常問題数で初期化
    exam: false, qs: [], idx: 0, answers: [], flagged: [], examReviewing: false, timer: null, remain: 0,
    lang: localStorage.getItem('af_lang') || 'ja',
    phase: 'main',        // 'main' | 'remed'（復習ループ中）
    remedEligible: false, // セットアップ起動の通常セッションのみ復習ループ対象
    remed: null,          // { score, origQs, origAnswers, round }
  };

  /* ---------- 言語（EN/JA） ---------- */
  // 日本語訳があり lang=ja なら和訳、なければ英語原文にフォールバック
  function qHtml(q) {
    return state.lang === 'ja' && q.question_ja
      ? esc(q.question_ja).replace(/\n/g, '<br>') : (q.questionHtml || esc(q.question));
  }
  function cHtml(c) {
    return state.lang === 'ja' && c.text_ja ? esc(c.text_ja) : (c.html || esc(c.text));
  }
  function explHtml(q) {
    return state.lang === 'ja' && q.explanation_ja
      ? esc(q.explanation_ja).replace(/\n/g, '<br>')
      : (q.explanationHtml || esc(q.explanation) || '（解説なし）');
  }
  function updateLangToggles() {
    const label = '🌐 ' + (state.lang === 'ja' ? '日本語' : 'English');
    ['langToggleHome', 'langToggleQuiz'].forEach((id) => { const b = $(id); if (b) b.textContent = label; });
  }
  function setLang(l) {
    state.lang = l; localStorage.setItem('af_lang', l);
    updateLangToggles();
    const cur = [...document.querySelectorAll('.screen')].find((s) => !s.classList.contains('hidden'));
    if (cur && cur.id === 'screen-quiz') refreshQuizLang();
    else if (cur && cur.id === 'screen-review') renderReview();
  }
  // クイズ画面で、回答状態を保ったままテキストだけ言語切替
  function refreshQuizLang() {
    const q = state.qs[state.idx]; if (!q) return;
    $('questionText').innerHTML = qHtml(q);
    document.querySelectorAll('#choices .choice').forEach((btn) => {
      const c = q.choices.find((x) => x.key === btn.dataset.key);
      const span = btn.querySelector('.ctext');
      if (span && c) span.innerHTML = cHtml(c);
    });
    renderChoiceMedia(q);
    Media.render($('questionMedia'), q.media, state.lang);
    if (!$('feedback').classList.contains('hidden')) {
      $('fbExpl').innerHTML = explHtml(q);
      Media.render($('fbMedia'), q.explanationMedia, state.lang);
    }
  }

  /* ---------- メディア ---------- */
  // 選択肢のメディアは、描画済みのボタン内 .cmedia へ差し込む
  function renderChoiceMedia(q) {
    document.querySelectorAll('#choices .choice').forEach((btn) => {
      const c = q.choices.find((x) => x.key === btn.dataset.key);
      Media.render(btn.querySelector('.cmedia'), c && c.media, state.lang);
    });
  }

  /* ---------- 画面遷移 ---------- */
  function show(id) {
    Media.stopAll();   // 画面を離れたら音声・動画は止める
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    $('screen-' + id).classList.remove('hidden');
  }

  // アプリ内「ホームへ」：すでにログイン済みなので Store.me() を再呼び出しせず state.profile を維持
  function goHome() {
    state.phase = 'main'; state.remed = null;
    $('screen-quiz').classList.remove('remed');
    updateStreakBadge();
    stopTimer();
    Mascot.set($('homeMascot'), 'happy');
    $('homeMascot').classList.add('mascot-idle');
    $('bankInfo').textContent = `問題バンク：全 ${QUESTIONS.length} 問`;
    if (state.profile) {
      $('userName').textContent = state.profile;
      $('userPanel').classList.remove('hidden');
      $('authPanel').classList.add('hidden');
    }
    show('home');
  }

  /* ---------- 出題選択ロジック ---------- */
  function pickRandom(n) { return shuffle(QUESTIONS).slice(0, n); }

  function pickRatio(n) {
    const out = [];
    const codes = Object.keys(SECTIONS);
    const pools = {}; codes.forEach((c) => pools[c] = shuffle(QUESTIONS.filter((q) => q.section === c)));
    let assigned = 0;
    codes.forEach((c) => {
      const take = Math.round(n * (SECTIONS[c].ratio || 0));
      out.push(...pools[c].splice(0, take)); assigned += take;
    });
    // 端数調整：残りプールから補充 / 余りは削る
    let rest = shuffle([].concat(...codes.map((c) => pools[c])));
    while (out.length < n && rest.length) out.push(rest.pop());
    return shuffle(out).slice(0, n);
  }

  function pickWeak(n) {
    const rec = Store.records(state.profile);
    const scored = QUESTIONS.map((q) => {
      const r = rec[q.id];
      let w;
      if (!r) w = 100 + Math.random();
      else {
        const wrongRate = r.a ? r.w / r.a : 0;
        w = wrongRate * 60 + (r.last === false ? 20 : 0) + (r.a < 2 ? 10 : 0) + Math.random();
      }
      return { q, w };
    });
    scored.sort((a, b) => b.w - a.w);
    return scored.slice(0, n).map((s) => s.q);
  }

  function buildSession() {
    state.exam = state.length === 'exam';
    const n = state.exam ? EXAM_N : Number(state.length);
    let qs;
    if (state.exam) qs = pickRatio(n);          // 本番は比率で出題
    else if (state.mode === 'random') qs = pickRandom(n);
    else if (state.mode === 'ratio') qs = pickRatio(n);
    else qs = pickWeak(n);
    state.qs = qs; state.idx = 0; state.answers = new Array(qs.length).fill(null);
    state.flagged = new Array(qs.length).fill(false);
    state.examReviewing = false;
  }

  /* ---------- デイリーストリーク ---------- */
  // マイルストーン（3日、7日以降は7日ごと等）に一致したら応援メッセージを1つランダムに返す。
  // 条件・文言は js/config.js（APP_CONFIG.streak.milestones）に記載。
  function streakMessage(n) {
    const ms = (CONFIG.streak && CONFIG.streak.milestones) || [];
    const hit = ms.filter((m) => m.at === n || (m.every && n >= m.at && n % m.every === 0)).pop();
    if (!hit || !hit.messages || !hit.messages.length) return '';
    return hit.messages[(Math.random() * hit.messages.length) | 0];
  }

  function updateStreakBadge() {
    const b = $('streakBadge');
    const { streak, todayDone } = Store.streakInfo();
    if (!streak) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    b.classList.toggle('dim', !todayDone);
    b.textContent = `🔥 連続 ${streak} 日` + (todayDone ? '' : '（今日もやろう！）');
  }

  /* ---------- ホーム / 認証 ---------- */
  let authMode = 'login';

  async function initHome() {
    Mascot.set($('homeMascot'), 'happy');
    $('homeMascot').classList.add('mascot-idle');
    Mascot.set($('loaderMascot'), 'neutral', 'm-spin');
    $('bankInfo').textContent = `問題バンク：全 ${QUESTIONS.length} 問`;
    const user = await Store.me();
    applyDemoMode();
    setAuthView(user);
    if (user) { await Store.loadActivity(); updateStreakBadge(); }
  }

  // デモモード：新規登録を伏せ、入力欄を隠して「デモ開始」の1ボタンにする
  function applyDemoMode() {
    if (!Store.isDemo()) return;
    $('authTabs').classList.add('hidden');      // 登録タブごと伏せる
    ['authUser', 'authPass', 'authCode'].forEach((id) => $(id).classList.add('hidden'));
    $('authSubmit').textContent = 'デモ開始';
    $('authNote').classList.remove('hidden');
  }

  // ログイン状態に応じてパネルを切替
  function setAuthView(user) {
    if (user) {
      state.profile = user;
      $('userName').textContent = user;
      $('userPanel').classList.remove('hidden');
      $('authPanel').classList.add('hidden');
    } else {
      state.profile = '';
      $('userPanel').classList.add('hidden');
      $('authPanel').classList.remove('hidden');
      $('authError').textContent = '';
    }
  }

  function setAuthMode(mode) {
    if (Store.isDemo()) mode = 'login';   // デモモードは登録タブを使わない
    authMode = mode;
    document.querySelectorAll('.auth-tab').forEach((t) =>
      t.classList.toggle('selected', t.dataset.authmode === mode));
    $('authCode').classList.toggle('hidden', mode !== 'register');
    $('authPass').setAttribute('autocomplete', mode === 'register' ? 'new-password' : 'current-password');
    $('authSubmit').textContent = Store.isDemo() ? 'デモ開始'
      : (mode === 'register' ? '登録してはじめる' : 'ログイン');
    $('authError').textContent = '';
  }

  async function submitAuth() {
    Sound.unlock();
    if (Store.isDemo()) return startDemo();
    const u = $('authUser').value.trim();
    const p = $('authPass').value;
    const code = $('authCode').value.trim();
    if (!u || !p) { $('authError').textContent = 'ユーザー名とパスワードを入力してください'; return; }
    const btn = $('authSubmit'); btn.disabled = true;
    try {
      const user = authMode === 'register' ? await Store.register(u, p, code) : await Store.login(u, p);
      $('authPass').value = ''; $('authCode').value = '';
      setAuthView(user);
      await Store.loadActivity(); updateStreakBadge();
      await startPendingQ();
    } catch (e) {
      $('authError').textContent = e.message || '認証に失敗しました';
    } finally { btn.disabled = false; }
  }

  // デモ開始：使い捨てユーザーを作ってそのまま学習へ
  async function startDemo() {
    const btn = $('authSubmit'); btn.disabled = true;
    $('authError').textContent = '';
    try {
      const user = await Store.demoStart();
      setAuthView(user);
      await Store.loadActivity(); updateStreakBadge();
      await startPendingQ();
    } catch (e) {
      $('authError').textContent = e.message || 'デモを開始できませんでした';
    } finally { btn.disabled = false; }
  }

  /* ---------- セットアップ ---------- */
  function markSel(listEl, attr, val) {
    listEl.querySelectorAll('.option').forEach((b) =>
      b.classList.toggle('selected', b.dataset[attr] === String(val)));
  }
  function refreshStart() {
    $('startQuizBtn').disabled = !(state.mode && state.length);
  }

  /* ---------- クイズ描画 ---------- */
  // 本番モードの専用UI（見直しフラグ・次へ即進行など）は復習ループ中は使わず、通常モードと同じ流れにする
  function examUI() { return state.exam && state.phase !== 'remed'; }

  function renderQ() {
    const q = state.qs[state.idx];
    $('progressFill').style.width = ((state.idx) / state.qs.length * 100) + '%';
    $('qSection').textContent = (SECTIONS[q.section] && SECTIONS[q.section].name) || '';
    $('qIndex').textContent = state.phase === 'remed'
      ? `復習${state.remed.round}回目 ${state.idx + 1} / ${state.qs.length}`
      : `${state.idx + 1} / ${state.qs.length}`;
    $('questionText').innerHTML = qHtml(q);
    const chosen = state.answers[state.idx] || [];
    const multi = isMulti(q);
    $('choices').classList.toggle('multi', multi);
    $('multiHint').classList.toggle('hidden', !multi);
    $('choices').innerHTML = q.choices.map((c) =>
      `<button class="choice${chosen.includes(c.key) ? ' selected' : ''}" data-key="${c.key}">
        <span class="key">${c.key.toUpperCase()}</span>
        <span class="cbody"><span class="ctext">${cHtml(c)}</span>
          <span class="cmedia hidden"></span></span></button>`).join('');
    renderChoiceMedia(q);
    Media.render($('questionMedia'), q.media, state.lang);
    $('feedback').classList.add('hidden');
    $('fbExpl').classList.add('hidden');
    $('fbMedia').classList.add('hidden');
    $('nextBtnFb').classList.add('hidden');
    // 見直しフラグ（本番モードのみ、復習ループ中は対象外）
    $('reviewFlagWrap').classList.toggle('hidden', !examUI());
    $('reviewFlagCheck').checked = !!state.flagged[state.idx];
    // ボタン状態
    if (examUI()) {
      $('checkBtn').classList.add('hidden');
      const nb = $('nextBtn'); nb.classList.remove('hidden');
      nb.textContent = state.idx === state.qs.length - 1 ? '採点する' : '次へ';
      nb.disabled = !answered(chosen);
    } else {
      $('checkBtn').classList.remove('hidden');
      $('checkBtn').disabled = !answered(chosen);
      $('nextBtn').classList.add('hidden');
    }
    $('backToListBtn').classList.toggle('hidden', !(examUI() && state.examReviewing));
  }

  function onChoice(key) {
    if (state._locked) return;
    const q = state.qs[state.idx];
    let ans = state.answers[state.idx] || [];
    if (isMulti(q)) {
      // 複数選択：選択済みならトグルで解除。選択順に依存しないよう選択肢順に並べる
      ans = ans.includes(key) ? ans.filter((k) => k !== key) : ans.concat(key);
      const order = q.choices.map((c) => c.key);
      ans.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    } else {
      ans = [key];
    }
    state.answers[state.idx] = ans.length ? ans : null;
    Sound.tap();
    $('choices').querySelectorAll('.choice').forEach((b) =>
      b.classList.toggle('selected', ans.includes(b.dataset.key)));
    if (examUI()) $('nextBtn').disabled = !ans.length;
    else $('checkBtn').disabled = !ans.length;
  }

  // 通常モード：回答チェック → フィードバック
  function checkAnswer() {
    const q = state.qs[state.idx];
    const chosen = state.answers[state.idx] || [];
    const correct = isCorrect(q, chosen);
    state._locked = true;
    Media.stopAll();   // 効果音と重ならないようメディアを止める
    // 選択肢に正誤色。複数選択では「選び漏らした正解」を見分けられるよう印を付ける
    $('choices').querySelectorAll('.choice').forEach((b) => {
      b.disabled = true;
      const isC = q.correct.includes(b.dataset.key);
      const picked = chosen.includes(b.dataset.key);
      if (isC) b.classList.add('correct');
      else if (picked) b.classList.add('wrong');
      if (isC && !picked) {
        b.classList.add('missed');
        const tag = document.createElement('span');
        tag.className = 'ctag';
        tag.textContent = '選び漏れ';
        b.querySelector('.cbody').appendChild(tag);
      }
    });
    if (state.phase !== 'remed') Store.record(q.id, correct); // 復習ループは成績に記録しない
    // フィードバックパネル
    const fb = $('feedback');
    fb.classList.remove('hidden', 'ok', 'ng');
    fb.classList.add(correct ? 'ok' : 'ng');
    $('fbHead').textContent = correct ? '正解！🎉' : '残念…もう一度確認しよう';
    Mascot.set($('fbMascot'), correct ? 'celebrate' : 'sad', correct ? 'm-happy' : 'm-sad');
    $('fbExpl').innerHTML = explHtml(q);
    Media.render($('fbMedia'), q.explanationMedia, state.lang);
    $('fbMedia').classList.add('hidden');   // 解説を開くまでは隠す
    $('explToggle').textContent = '解説を見る ▾';
    if (correct) { Sound.correct(); confettiBurst(12); } else { Sound.wrong(); }
    // 次へボタン（フィードバックパネル内）
    $('checkBtn').classList.add('hidden');
    const nb = $('nextBtnFb'); nb.classList.remove('hidden'); nb.disabled = false;
    if (state.idx === state.qs.length - 1) {
      // 復習ラウンド最終問題ならこの時点で全回答済み → 次ラウンドの有無が分かる
      nb.textContent = (state.phase === 'remed' &&
        state.qs.some((q2, i) => !isCorrect(q2, state.answers[i])))
        ? '次の復習へ' : '結果を見る';
    } else nb.textContent = '次へ';
  }

  function next() {
    // 本番モードは回答を記録（復習ループ中は対象外）
    if (examUI()) {
      const q = state.qs[state.idx];
      const chosen = state.answers[state.idx];
      if (answered(chosen)) Store.record(q.id, isCorrect(q, chosen));
    }
    state._locked = false;
    Media.stopAll();
    if (state.idx < state.qs.length - 1) { state.idx++; renderQ(); }
    else if (examUI()) renderExamList();
    else finish();
  }

  /* ---------- タイマー（本番） ---------- */
  function startTimer() {
    state.remain = EXAM_SEC;
    $('quizTimer').classList.remove('hidden', 'warn');
    tick();
    state.timer = setInterval(tick, 1000);
  }
  function tick() {
    const m = Math.floor(state.remain / 60), s = state.remain % 60;
    const t = $('quizTimer');
    t.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (state.remain <= 600) t.classList.add('warn');
    if (state.remain <= 0) { stopTimer(); finish(true); return; }
    state.remain--;
  }
  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } $('quizTimer').classList.add('hidden'); }

  /* ---------- 結果 ---------- */
  function computeScore() {
    let correctN = 0;
    const bySection = {};
    state.qs.forEach((q, i) => {
      const s = (bySection[q.section] ||= { c: 0, t: 0 });
      s.t += 1;
      if (isCorrect(q, state.answers[i])) { correctN++; s.c += 1; }
    });
    const pct = Math.round(correctN / state.qs.length * 100);
    return { correctN, total: state.qs.length, pct, pass: pct / 100 >= PASS, bySection };
  }

  // デイリーストリーク: セッション達成でその日をカウント（結果画面に表示）
  function markStreak() {
    const firstToday = Store.markActivity();
    const { streak } = Store.streakInfo();
    const sl = $('streakLine');
    sl.textContent = `🔥 連続 ${streak} 日目！`;
    sl.classList.remove('hidden');
    sl.classList.toggle('streak-pop', firstToday);
    const msg = firstToday ? streakMessage(streak) : '';
    $('streakMsg').textContent = msg;
    $('streakMsg').classList.toggle('hidden', !msg);
  }

  // mode: 'final'（ストリーク付与） | 'pending'（復習するか選択中） | 'aborted'（復習中断・付与なし）
  function showResult(score, opts = {}) {
    const { correctN, total, pct, pass, bySection } = score;
    const mode = opts.mode || 'final';
    show('result');
    $('resultTitle').textContent = opts.remedDone ? '復習コンプリート！🎉'
      : opts.timeUp ? '時間切れ！お疲れさま' : 'お疲れさま！';
    $('scorePct').textContent = pct + '%';
    $('scoreRing').style.background =
      `conic-gradient(${pass ? 'var(--green)' : 'var(--yellow)'} ${pct * 3.6}deg, var(--line) 0)`;
    $('resultLine').textContent = `${total}問中 ${correctN}問 正解`;
    const pl = $('passLine');
    pl.textContent = pass
      ? `合格ライン突破！🎊（${passPct()}%）`
      : `あと ${Math.ceil((PASS - correctN / total) * total)}問で合格ライン（${passPct()}%）`;
    pl.className = 'pass-line ' + (pass ? 'pass' : 'fail');
    Mascot.set($('resultMascot'), pass ? 'celebrate' : 'neutral', pass ? 'm-happy' : null);
    // セクション内訳
    $('sectionBreakdown').innerHTML = Object.keys(SECTIONS).filter((c) => bySection[c]).map((c) => {
      const s = bySection[c], p = Math.round(s.c / s.t * 100);
      return `<div class="brk-row"><span class="brk-name">${esc(SECTIONS[c].name)}</span>
        <span class="brk-bar"><span style="width:${p}%"></span></span>
        <span class="brk-num">${s.c}/${s.t}</span></div>`;
    }).join('');
    // ボタン・ストリーク表示の切替
    $('streakLine').classList.add('hidden');
    $('streakMsg').classList.add('hidden');
    $('remedChoice').classList.toggle('hidden', mode !== 'pending');
    $('reviewBtn').classList.toggle('hidden', mode === 'pending');
    $('resultHomeBtn').classList.toggle('hidden', mode === 'pending');
    if (mode === 'final') markStreak();
    Sound.finish();
    if (pass) confettiBurst(120);
  }

  function finish(timeUp) {
    stopTimer();
    state.examReviewing = false;
    if (state.phase === 'remed') { finishRemedRound(); return; }
    const score = computeScore();
    const wrong = state.qs.filter((q, i) => !isCorrect(q, state.answers[i]));
    const complete = state.answers.every(answered); // 途中終了は従来どおり
    if (state.remedEligible && !timeUp && complete && wrong.length) {
      // 点数はここで確定。復習するか選択させ、ストリーク付与は保留
      state.remed = { score, origQs: state.qs, origAnswers: state.answers.slice(), round: 0 };
      showResult(score, { mode: 'pending' });
    } else {
      showResult(score, { timeUp, mode: 'final' });
    }
  }

  /* ---------- 復習ループ（誤答を全問正解するまで再出題） ---------- */
  function startRemediation() {
    const wrong = state.remed.origQs.filter((q, i) =>
      !isCorrect(q, state.remed.origAnswers[i]));
    startRemedRound(wrong);
  }
  // 本番モード：結果画面の「間違えた問題を復習」から、通常モードと同じ復習ループを開始
  function startExamRemediation() {
    const wrong = state.qs.filter((q, i) => !isCorrect(q, state.answers[i]));
    if (!wrong.length) { renderReview(); return; } // 全問正解時は従来の一覧表示のまま
    state.remed = { score: computeScore(), origQs: state.qs, origAnswers: state.answers.slice(), round: 0 };
    startRemediation();
  }
  function startRemedRound(qs) {
    state.phase = 'remed';
    state.remed.round++;
    state.qs = shuffle(qs); state.idx = 0;
    state.answers = new Array(qs.length).fill(null);
    state._locked = false;
    show('quiz');
    $('screen-quiz').classList.add('remed');
    renderQ();
  }
  function finishRemedRound() {
    const stillWrong = state.qs.filter((q, i) => !isCorrect(q, state.answers[i]));
    if (stillWrong.length) { startRemedRound(stillWrong); return; }
    exitRemediation({ mode: 'final', remedDone: true }); // 全問クリア → ストリーク付与
  }
  // 完了・中断の共通後始末：元のセッションと確定スコアを復元して結果画面へ
  function exitRemediation(opts) {
    state.phase = 'main';
    $('screen-quiz').classList.remove('remed');
    state.qs = state.remed.origQs;
    state.answers = state.remed.origAnswers; // renderReview が元の誤答一覧を表示できる
    const score = state.remed.score;
    state.remed = null;
    showResult(score, opts);
  }

  /* ---------- 本番：解答一覧 ---------- */
  function renderExamList() {
    show('examlist');
    $('examList').innerHTML = state.qs.map((q, i) => {
      const ans = state.answers[i];
      const flagged = state.flagged[i];
      return `<div class="examlist-item${flagged ? ' flagged' : ''}" data-idx="${i}">
        <span class="examlist-num">${i + 1}</span>
        <span class="examlist-answer">${answered(ans) ? ans.join('').toUpperCase() : '−'}</span>
        <label class="examlist-flag"><input type="checkbox" class="examlist-flag-check" data-idx="${i}"${flagged ? ' checked' : ''}></label>
      </div>`;
    }).join('');
  }

  /* ---------- 復習 ---------- */
  function renderReview() {
    show('review');
    const wrong = state.qs.map((q, i) => ({ q, a: state.answers[i] || [] }))
      .filter((x) => !isCorrect(x.q, x.a));
    if (!wrong.length) { $('reviewList').innerHTML = '<p style="text-align:center;color:var(--muted);padding:30px">全問正解！復習はありません 🎉</p>'; return; }
    $('reviewList').innerHTML = wrong.map(({ q, a }, ri) =>
      `<div class="rev-item" data-ri="${ri}"><div class="rev-q">${qHtml(q)}</div>
      <div class="media-box hidden" data-rev="q"></div>
      ${q.choices.map((c, ci) => {
        const isC = q.correct.includes(c.key), picked = a.includes(c.key);
        const cls = isC ? ' correct' : (picked ? ' your' : '');
        // 複数選択では「選んだ正解」と「選び漏らした正解」を書き分ける
        const tag = isC ? (isMulti(q) && !picked ? ' ✓（選び漏れ）' : ' ✓')
          : (picked ? ' ←あなたの回答' : '');
        return `<div class="rev-choice${cls}">${c.key.toUpperCase()}. ${cHtml(c)}${tag}
          <span class="cmedia hidden" data-ci="${ci}"></span></div>`;
      }).join('')}
      <div class="rev-expl">${explHtml(q)}</div>
      <div class="media-box hidden" data-rev="e"></div></div>`).join('');
    // メディアは innerHTML を経由せず、描画後に DOM で差し込む
    wrong.forEach(({ q }, ri) => {
      const item = $('reviewList').querySelector(`.rev-item[data-ri="${ri}"]`);
      if (!item) return;
      Media.render(item.querySelector('[data-rev="q"]'), q.media, state.lang);
      Media.render(item.querySelector('[data-rev="e"]'), q.explanationMedia, state.lang);
      item.querySelectorAll('.cmedia[data-ci]').forEach((box) => {
        const c = q.choices[Number(box.dataset.ci)];
        Media.render(box, c && c.media, state.lang);
      });
    });
  }

  /* ---------- 成績 ---------- */
  function renderStats() {
    show('stats');
    $('statsUser').textContent = state.profile || Store.current();
    const sm = Store.summary(QUESTIONS);
    $('statsBody').innerHTML = `
      <div class="stat-cards">
        <div class="stat-card"><div class="num">${sm.attempted}<small>/${QUESTIONS.length}</small></div><div class="lbl">挑戦した問題</div></div>
        <div class="stat-card"><div class="num">${Math.round(sm.accuracy * 100)}%</div><div class="lbl">通算正答率</div></div>
        <div class="stat-card"><div class="num">${sm.totalAttempts}</div><div class="lbl">のべ回答数</div></div>
        <div class="stat-card"><div class="num">${sm.totalCorrect}</div><div class="lbl">のべ正解数</div></div>
        <div class="stat-card"><div class="num">🔥${Store.streakInfo().streak}<small>日</small></div><div class="lbl">連続学習日数</div></div>
      </div>
      <h2 class="section-h">セクション別 正答率</h2>
      <div class="stat-section">${Object.keys(SECTIONS).map((c) => {
        const s = sm.bySection[c] || { a: 0, c: 0, total: 0 };
        const p = s.a ? Math.round(s.c / s.a * 100) : 0;
        return `<div class="brk-row"><span class="brk-name">${esc(SECTIONS[c].name)}</span>
          <span class="brk-bar"><span style="width:${p}%"></span></span>
          <span class="brk-num">${s.a ? p + '%' : '—'}</span></div>`;
      }).join('')}</div>`;
  }

  /* ---------- 紙吹雪 ---------- */
  let confCanvas, confCtx, confParts = [], confRAF = null;
  function confettiBurst(n) {
    confCanvas = $('confetti'); confCanvas.classList.remove('hidden');
    confCanvas.width = innerWidth; confCanvas.height = innerHeight;
    confCtx = confCanvas.getContext('2d');
    const colors = ['#58cc02', '#1cb0f6', '#ffc800', '#ff4b4b', '#ce82ff'];
    for (let i = 0; i < n; i++) confParts.push({
      x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight / 2 - 40,
      vx: (Math.random() - .5) * 8, vy: Math.random() * -9 - 3,
      g: .3 + Math.random() * .2, s: 5 + Math.random() * 6,
      c: colors[(Math.random() * colors.length) | 0], r: Math.random() * 6, vr: (Math.random() - .5) * .4,
    });
    if (!confRAF) confLoop();
  }
  function confLoop() {
    confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
    confParts.forEach((p) => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      confCtx.save(); confCtx.translate(p.x, p.y); confCtx.rotate(p.r);
      confCtx.fillStyle = p.c; confCtx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); confCtx.restore();
    });
    confParts = confParts.filter((p) => p.y < confCanvas.height + 20);
    if (confParts.length) confRAF = requestAnimationFrame(confLoop);
    else { confRAF = null; confCanvas.classList.add('hidden'); }
  }

  /* ---------- ユーティリティ ---------- */
  function esc(s) { return (s || '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

  /* ---------- イベント ---------- */
  function bind() {
    // 認証
    document.querySelectorAll('.auth-tab').forEach((t) =>
      t.onclick = () => { setAuthMode(t.dataset.authmode); Sound.tap(); });
    $('authSubmit').onclick = submitAuth;
    $('authPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
    $('authCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
    $('logoutBtn').onclick = async () => { await Store.logout(); setAuthView(''); };

    // 言語トグル
    ['langToggleHome', 'langToggleQuiz'].forEach((id) => {
      const b = $(id); if (b) b.onclick = () => { Sound.tap(); setLang(state.lang === 'ja' ? 'en' : 'ja'); };
    });

    $('goSetupBtn').onclick = async () => {
      Sound.unlock();
      if (!state.profile) { await initHome(); return; }
      const btn = $('goSetupBtn'); btn.disabled = true;
      $('setupUser').textContent = state.profile;
      await Store.loadRecords();        // 間違え優先・成績のためサーバーから記録を取得
      btn.disabled = false;
      markSel($('modeList'), 'mode', state.mode);
      markSel($('lengthList'), 'length', state.length);
      refreshStart();
      show('setup');
    };
    $('goStatsBtn').onclick = async () => {
      if (!state.profile) { await initHome(); return; }
      await Store.loadRecords();
      renderStats();
    };

    $('modeList').onclick = (e) => { const b = e.target.closest('.option'); if (!b) return; state.mode = b.dataset.mode; markSel($('modeList'), 'mode', state.mode); Sound.tap(); refreshStart(); };
    $('lengthList').onclick = (e) => { const b = e.target.closest('.option'); if (!b) return; state.length = b.dataset.length; markSel($('lengthList'), 'length', state.length); Sound.tap(); refreshStart(); };

    $('startQuizBtn').onclick = () => {
      buildSession();
      if (!state.qs.length) { alert('問題がありません'); return; }
      state.phase = 'main'; state.remed = null;
      state.remedEligible = !state.exam; // 通常セッションのみ復習ループ対象
      $('screen-quiz').classList.remove('remed');
      show('quiz');
      if (state.exam) startTimer(); else stopTimer();
      state._locked = false;
      renderQ();
    };

    $('choices').onclick = (e) => { const b = e.target.closest('.choice'); if (!b || b.disabled) return; onChoice(b.dataset.key); };
    $('checkBtn').onclick = checkAnswer;
    $('nextBtn').onclick = next;
    $('nextBtnFb').onclick = next;
    $('reviewFlagCheck').onchange = (e) => { state.flagged[state.idx] = e.target.checked; };
    $('backToListBtn').onclick = () => renderExamList();
    $('examList').onclick = (e) => {
      const check = e.target.closest('.examlist-flag-check');
      if (check) {
        state.flagged[Number(check.dataset.idx)] = check.checked;
        check.closest('.examlist-item').classList.toggle('flagged', check.checked);
        return;
      }
      const row = e.target.closest('.examlist-item'); if (!row) return;
      state.idx = Number(row.dataset.idx);
      state.examReviewing = true;
      state._locked = false;
      show('quiz');
      renderQ();
    };
    $('examListFinishBtn').onclick = () => finish();
    $('explToggle').onclick = () => {
      const ex = $('fbExpl'); const hidden = ex.classList.toggle('hidden');
      const q = state.qs[state.idx];
      const hasMedia = q && Media.has(q.explanationMedia);
      $('fbMedia').classList.toggle('hidden', hidden || !hasMedia);
      $('explToggle').textContent = hidden ? '解説を見る ▾' : '解説を隠す ▴';
    };
    $('quitBtn').onclick = () => { Media.stopAll(); $('quitSheet').classList.remove('hidden'); };
    $('quitCancel').onclick = () => { $('quitSheet').classList.add('hidden'); };
    $('quitNoSave').onclick = () => { $('quitSheet').classList.add('hidden'); goHome(); };
    $('quitGoResult').onclick = () => {
      $('quitSheet').classList.add('hidden');
      // 復習ループ中断: 確定スコアを表示するがストリークは付与しない
      if (state.phase === 'remed') { stopTimer(); exitRemediation({ mode: 'aborted' }); }
      else finish();
    };

    $('remedStartBtn').onclick = () => { Sound.tap(); startRemediation(); };
    $('remedSkipBtn').onclick = () => { // やめる＝従来動作（ここでストリーク付与）
      Sound.tap();
      markStreak();
      state.remed = null;
      $('remedChoice').classList.add('hidden');
      $('reviewBtn').classList.remove('hidden');
      $('resultHomeBtn').classList.remove('hidden');
    };

    $('reviewBtn').onclick = () => { if (state.exam) startExamRemediation(); else renderReview(); };
    $('resultHomeBtn').onclick = goHome;
    $('reviewHomeBtn').onclick = goHome;
    $('resetStatsBtn').onclick = async () => { if (confirm(`「${state.profile}」の成績をリセットしますか？`)) { await Store.reset(); renderStats(); } };

    document.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
      const t = b.dataset.nav; if (t === 'home') goHome(); else show(t);
    });
  }

  // URL パラメータ ?id=<qid> で特定問題を直接起動（ログイン後も引き継ぐ）
  let _pendingQId = new URLSearchParams(location.search).get('id');
  if (_pendingQId) history.replaceState(null, '', location.pathname);

  async function startPendingQ() {
    if (!_pendingQId || !state.profile) return false;
    const q = QUESTIONS.find((q) => String(q.id) === _pendingQId);
    _pendingQId = null;
    if (!q) return false;
    state.exam = false;
    state.remedEligible = false; // 単問起動は復習ループ対象外
    state.phase = 'main'; state.remed = null;
    state.qs = [q];
    state.idx = 0;
    state.answers = [null];
    state.flagged = [false];
    await Store.loadRecords();
    show('quiz');
    stopTimer();
    state._locked = false;
    renderQ();
    return true;
  }

  /* ---------- 起動 ---------- */
  // カートリッジの値をアプリへ流し込む（試験名などのブランディングは Cartridge.apply が担当）
  function applyCartridge(c) {
    QUESTIONS = c.questions || [];
    SECTIONS = c.sections || {};
    const exam = c.exam || {};
    PASS = exam.passRate || 0;
    EXAM_N = exam.questionCount || 0;
    EXAM_SEC = exam.timeLimitSec || 0;
    NORMAL_N = (c.session && c.session.normalLength) || 10;
    Cartridge.apply(c);
    Media.precache(c.assets);   // オフライン学習のためメディアを先読み
    // セッション選択の見出しはカートリッジの問題数・制限時間から生成
    state.length = NORMAL_N;
    $('optNormal').dataset.length = String(NORMAL_N);
    $('optNormalLabel').textContent = `通常（${NORMAL_N}問）`;
    $('optExamLabel').textContent = `本番モード（${EXAM_N}問・${Math.round(EXAM_SEC / 60)}分）`;
  }

  async function boot() {
    bind();
    setAuthMode('login');
    updateLangToggles();
    await initHome();
    if (!await startPendingQ()) show('home');
    $('app').classList.remove('hidden');
    $('loader').classList.add('hidden');
    // PWA
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  // カートリッジを読み込んでから起動（ロード演出を少し見せる）
  Cartridge.load().then((c) => {
    applyCartridge(c);
    setTimeout(boot, 600);
  }).catch((e) => {
    console.error(e);
    $('loaderMsg').textContent = '問題データを読み込めませんでした。再読み込みしてください。';
  });
})();
