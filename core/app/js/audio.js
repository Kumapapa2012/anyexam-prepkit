/* Web Audio で効果音を合成。音源ファイル不要・オフライン可。
   端末のミュート設定や初回タップ後に有効化される。 */
(function () {
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) ctx = new C();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 単音
  function tone(freq, start, dur, type = 'sine', gain = 0.18) {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  const Sound = {
    enable(v) { enabled = v; },
    unlock() { ac(); }, // 初回ユーザー操作で呼ぶ
    correct() {
      if (!enabled) return;
      tone(659.25, 0, 0.12, 'triangle');     // E5
      tone(987.77, 0.10, 0.20, 'triangle');  // B5
    },
    wrong() {
      if (!enabled) return;
      tone(196.0, 0, 0.18, 'sawtooth', 0.12); // G3
      tone(155.56, 0.12, 0.26, 'sawtooth', 0.12); // D#3
    },
    finish() {
      if (!enabled) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, i * 0.12, 0.28, 'triangle', 0.16)); // C E G C arpeggio
    },
    tap() {
      if (!enabled) return;
      tone(440, 0, 0.05, 'sine', 0.06);
    },
  };
  window.Sound = Sound;
})();
