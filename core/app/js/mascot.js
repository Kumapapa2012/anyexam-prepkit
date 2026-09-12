/* オリジナルマスコット「アジー（Aji）」— 学習のおとも。
   表情を mood で切り替え。SVG なのでオフライン・軽量。 */
(function () {
  const FACES = {
    neutral: '<path d="M44 70 Q60 78 76 70" stroke="#2b6a00" stroke-width="4" fill="none" stroke-linecap="round"/>',
    happy:   '<path d="M42 66 Q60 86 78 66" stroke="#2b6a00" stroke-width="5" fill="none" stroke-linecap="round"/>',
    sad:     '<path d="M44 76 Q60 64 76 76" stroke="#2b6a00" stroke-width="4" fill="none" stroke-linecap="round"/>',
    celebrate:'<path d="M42 64 Q60 90 78 64 Z" fill="#2b6a00"/>',
  };

  function svg(mood) {
    const face = FACES[mood] || FACES.neutral;
    const cheeks = (mood === 'happy' || mood === 'celebrate')
      ? '<circle cx="34" cy="64" r="6" fill="#ff9bb0" opacity=".7"/><circle cx="86" cy="64" r="6" fill="#ff9bb0" opacity=".7"/>' : '';
    const eyes = (mood === 'sad')
      ? '<circle cx="46" cy="52" r="6" fill="#222"/><circle cx="74" cy="52" r="6" fill="#222"/>'
      : '<circle cx="46" cy="50" r="9" fill="#fff"/><circle cx="74" cy="50" r="9" fill="#fff"/>' +
        '<circle cx="47" cy="51" r="4.5" fill="#222"/><circle cx="75" cy="51" r="4.5" fill="#222"/>';
    return `
<svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- antenna -->
  <line x1="60" y1="22" x2="60" y2="34" stroke="#46a302" stroke-width="4"/>
  <path d="M60 8 l4 9 9 1 -7 7 2 9 -8 -5 -8 5 2 -9 -7 -7 9 -1 Z" fill="#ffc800" stroke="#e0a800" stroke-width="1.5"/>
  <!-- body -->
  <rect x="22" y="32" width="76" height="70" rx="26" fill="#58cc02" stroke="#46a302" stroke-width="4"/>
  <ellipse cx="60" cy="44" rx="30" ry="14" fill="#6fe015" opacity=".5"/>
  ${eyes}${cheeks}${face}
  <!-- feet -->
  <ellipse cx="44" cy="104" rx="9" ry="6" fill="#46a302"/>
  <ellipse cx="76" cy="104" rx="9" ry="6" fill="#46a302"/>
</svg>`;
  }

  const Mascot = {
    svg,
    set(el, mood, anim) {
      if (!el) return;
      el.innerHTML = svg(mood);
      el.classList.remove('m-happy', 'm-sad', 'm-spin', 'mascot-idle');
      if (anim) {
        void el.offsetWidth; // reflow でアニメ再実行
        el.classList.add(anim);
      }
    },
  };
  window.Mascot = Mascot;
})();
