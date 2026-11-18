// Custom SVG icon set for Orbit Network Hub (replaces emoji).
//   gameIcon(id)   -> animated illustrated icon for each arcade game (48x48)
//   cosmicArt(lvl) -> animated artwork for Quantum 2048 tiles (40x40)
//   icon(name)     -> simple line icon for UI controls (24x24, uses currentColor)

/* ---------------- UI line icons ---------------- */
const LINE = {
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  pickaxe: '<path d="M14 10 4 20"/><path d="M7.5 5.5c4.5-2.5 9.5-2 12 .5s3 7.5.5 12"/><path d="m12 8 4 4"/>',
  gamepad: '<path d="M6.5 8h11a4.5 4.5 0 0 1 4.4 5.4l-.6 3a3 3 0 0 1-5.1 1.4L14.5 16h-5l-1.7 1.8a3 3 0 0 1-5.1-1.4l-.6-3A4.5 4.5 0 0 1 6.5 8Z"/><path d="M7.5 11v3M6 12.5h3"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/>',
  satellite: '<path d="m13 6.5 4.5 4.5-6.5 6.5L6.5 13Z"/><path d="m9.5 9.5-6-6M14.5 14.5l6 6M3.5 7.5l4-4M16.5 20.5l4-4"/><path d="M15 21a6 6 0 0 0 6-6"/>',
  levelUp: '<path d="M12 20V6M5.5 12.5 12 6l6.5 6.5"/><path d="M5 3h14"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.4A8.5 8.5 0 1 1 21 12Z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  sparkle: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 16v4M17 18h4"/>',
  tree: '<path d="M12 3 18 11h-3l4 6H5l4-6H6Z"/><path d="M12 17v4"/>',
  cloud: '<path d="M7 17a4 4 0 0 1-.6-7.95A6 6 0 0 1 17.8 8.3 4.4 4.4 0 0 1 17.5 17Z"/><path d="M9 21h6"/>',
  swords: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 17.5 21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2"/>',
  party: '<path d="m4 20 4.5-12.5 8 8Z"/><path d="M14 3.5v2M19.5 4.5 18 6M20.5 10h-2M13 9c1.5-1.5 3.5-1.5 5 0"/>',
  bot: '<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 8V4.5"/><circle cx="12" cy="3.5" r="1"/><circle cx="9" cy="13" r="1.2" fill="currentColor"/><circle cx="15" cy="13" r="1.2" fill="currentColor"/><path d="M2 12.5v2M22 12.5v2"/>',
  pencil: '<path d="M4 20l4.2-1 11-11a2.1 2.1 0 0 0-3-3l-11 11Z"/><path d="m14.5 6.5 3 3"/>',
  eraser: '<path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21"/><path d="M22 21H7M5 11l9 9"/>',
  trash: '<path d="M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  skip: '<path d="m5 5 9 7-9 7Z"/><path d="M18 5v14"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12 18.4 5.6"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3Z"/>',
  fire: '<path d="M12 3c.8 3.2 5 5.3 5 10.2a5 5 0 0 1-10 0c0-2.3 1.1-3.8 2.2-4.8.1 1.9 1 3 2.1 3.2-1-3.3.6-6.4.7-8.6Z"/>',
  mine: '<circle cx="12" cy="12" r="5"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5M5.3 5.3l2.4 2.4M16.3 16.3l2.4 2.4M5.3 18.7l2.4-2.4M16.3 7.7l2.4-2.4"/>',
  boom: '<path d="m12 2 2.1 5.7 5.5-2.8-2.8 5.5L22 12l-5.2 1.6 2.8 5.5-5.5-2.8L12 22l-2.1-5.7-5.5 2.8 2.8-5.5L2 12l5.2-1.6-2.8-5.5 5.5 2.8Z"/>',
  laser: '<path d="M4 20 18 6"/><path d="M14 4h6v6"/><path d="M3 15l2 2M8 20l1 1"/>',
  thrust: '<path d="M12 2.5c2.6 3.2 4.5 6.8 4.5 10.5a4.5 4.5 0 0 1-9 0c0-3.7 1.9-7.3 4.5-10.5Z"/><path d="M10 21.5h4"/>',
  rotateL: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  rotateR: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5"/><path d="M20 4v4.5h-4.5"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9.5 18h5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

export function icon(name, cls = 'ico') {
  const body = LINE[name] || LINE.sparkle;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* ---------------- Pixel sprite helper ---------------- */
function pixels(rows, x0, y0, s, fill) {
  let out = '';
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === 'X') out += `<rect x="${x0 + c * s}" y="${y0 + r * s}" width="${s}" height="${s}"/>`;
  });
  return `<g fill="${fill}">${out}</g>`;
}

const STAR4 = 'M0-4.5 1.1-1.1 4.5 0 1.1 1.1 0 4.5-1.1 1.1-4.5 0-1.1-1.1Z';

/* ---------------- Game icons (48x48, animated) ----------------
   Every icon is drawn only with its card's accent colour (--a) plus white/dark,
   so it blends with the card it sits on. Paint classes:
     fa = accent, fa-l = light accent, fa-d = deep accent, fw = white, fk = space-dark
     sa / sa-l / sa-f = accent / light / faint strokes, sw = white stroke
   G  = vertical gradient (light accent -> accent) per shape
   GU = the same gradient across the whole icon (for pixel art / groups)       */
let uid = 0;

const GAME = {
  wordle: (G) => `
    <g class="gi-flip"><rect x="5" y="5" width="17" height="17" rx="4.5" fill="${G}"/><text x="13.5" y="18.3" class="gi-letter gi-letter-dark">O</text></g>
    <g class="gi-flip d1"><rect x="26" y="5" width="17" height="17" rx="4.5" class="fa-d"/><text x="34.5" y="18.3" class="gi-letter">R</text></g>
    <g class="gi-flip d2"><rect x="5" y="26" width="17" height="17" rx="4.5" class="fa-d"/><text x="13.5" y="39.3" class="gi-letter">B</text></g>
    <g class="gi-flip d3"><rect x="27" y="27" width="15" height="15" rx="4" fill="none" class="sa" stroke-width="2"/><rect class="gi-caret fa-l" x="33.5" y="31" width="2" height="7" rx="1"/></g>`,

  sketch: (G) => `
    <path class="gi-draw" pathLength="100" d="M6.5 37.5c4-9 8-14 12-9s5 6 9-2 7-10 11-6" fill="none" stroke="${G}" stroke-width="3.4" stroke-linecap="round"/>
    <g class="gi-bob">
      <path d="M30 7 40 17 25.5 31.5l-6.5 2 2-6.5Z" class="fw"/>
      <path d="m30 7 3-3a2.1 2.1 0 0 1 3 0l4 4a2.1 2.1 0 0 1 0 3l-3 3Z" class="fa-d"/>
      <path d="m19 33.5 2-6.5 4.5 4.5Z" class="fa"/>
      <path d="m26.5 14.5 6 6" class="sa-f" stroke-width="1.3"/>
    </g>
    <path class="gi-twinkle fa-l" transform="translate(10 11) scale(.85)" d="${STAR4}"/>
    <path class="gi-twinkle d2 fa" transform="translate(41 39) scale(.6)" d="${STAR4}"/>`,

  dodger: (G) => `
    <path d="M19 3 8.5 45M29 3l10.5 42" class="sa-f" stroke-width="1.2"/>
    <g transform="translate(15 0)"><g class="gi-fall"><path d="M0-5 4.5-2 4 3-.5 5.5-4.5 2-4-3Z" class="fa-d"/><path d="M0-5 4.5-2 .5-.5-4-3Z" class="fa-l"/></g></g>
    <g transform="translate(33 0)"><g class="gi-fall d2"><path d="M0-4 3.5-1.5 3 2.5-.5 4.5-3.5 1.5-3-2.5Z" class="fa"/></g></g>
    <g transform="translate(24 0)"><g class="gi-fall d4"><circle r="2.8" class="fw"/><circle r="4.6" fill="none" class="sa-l" stroke-width="1.1"/></g></g>
    <g class="gi-strafe"><path class="gi-flame fa-l" d="M21.5 42 24 47.5l2.5-5.5Z"/><path d="m24 28.5 8.5 13.5-8.5-3-8.5 3Z" fill="${G}"/><path d="m24 32.5 2 4.5h-4Z" class="fk"/></g>`,

  pong: (G) => `
    <ellipse cx="24" cy="24" rx="14" ry="5.2" fill="none" stroke="${G}" stroke-width="2" stroke-dasharray="6 4" class="gi-swirl" transform="rotate(-18 24 24)"/>
    <circle cx="24" cy="24" r="7.5" class="fa-d" opacity=".55"/>
    <circle cx="24" cy="24" r="5.8" class="fk"/>
    <circle cx="24" cy="24" r="5.8" fill="none" class="sa-l" stroke-width="1.2"/>
    <rect class="gi-paddle" x="3" y="14" width="3.6" height="13" rx="1.8" fill="${G}"/>
    <rect class="gi-paddle d2 fa-d" x="41.4" y="21" width="3.6" height="13" rx="1.8"/>
    <circle r="2.7" class="fw"><animateMotion dur="2.6s" repeatCount="indefinite" path="M9 20C18 13 26 37 39 28 26 37 18 13 9 20Z"/></circle>`,

  typing: (G) => `
    <g class="gi-hover">
      <ellipse cx="24" cy="11.5" rx="12" ry="4" fill="${G}"/>
      <path d="M17.5 10.5a6.5 5.5 0 0 1 13 0Z" class="fa-l"/>
      <circle cx="17" cy="12" r="1" class="fk"/><circle cx="24" cy="13" r="1" class="fk"/><circle cx="31" cy="12" r="1" class="fk"/>
    </g>
    <path class="gi-beam sa-l" d="M24 37V16" stroke-width="2.4" stroke-linecap="round"/>
    <g fill="none" class="sa-f" stroke-width="1.6"><rect x="4" y="38.5" width="9" height="6.5" rx="1.8"/><rect x="35" y="38.5" width="9" height="6.5" rx="1.8"/></g>
    <rect class="gi-key fa-d sa" x="16" y="38.5" width="16" height="6.5" rx="1.8" stroke-width="1.6"/>`,

  q2048: (G) => `
    <rect x="4" y="4" width="18" height="18" rx="4.5" class="fa-d"/>
    <circle cx="13" cy="13" r="4" class="fw"/><ellipse cx="13" cy="13.5" rx="7.2" ry="2" fill="none" class="sw" stroke-width="1.2" transform="rotate(-15 13 13)"/>
    <rect x="26" y="4" width="18" height="18" rx="4.5" fill="${G}"/>
    <path class="gi-twinkle fk" transform="translate(35 13) scale(1.25)" d="${STAR4}"/>
    <rect x="4" y="26" width="18" height="18" rx="4.5" class="fk"/><rect x="4" y="26" width="18" height="18" rx="4.5" fill="none" class="sa-f" stroke-width="1.2"/>
    <g class="fa-l"><circle class="gi-twinkle" cx="9" cy="31" r="1.3"/><circle class="gi-twinkle d1" cx="16" cy="34" r="1.1"/><circle class="gi-twinkle d2" cx="11" cy="39" r="1.4"/><circle class="gi-twinkle d3" cx="18" cy="40" r="1"/></g>
    <g class="gi-merge"><rect x="26" y="26" width="18" height="18" rx="4.5" class="fa"/><path d="m35 28.8 1.5 4 4-.8-2.6 3.2 2.6 3.2-4-.8L35 41.8l-1.5-4.2-4 .8 2.6-3.2-2.6-3.2 4 .8Z" class="fw"/></g>`,

  lander: (G) => `
    <path d="M40 4.5a5 5 0 1 0 3.5 8.6A4 4 0 0 1 40 4.5Z" class="fa-l"/>
    <path d="m2 44 9-5 5 2.5h16l4-4 10 6.5" fill="none" class="sa-f" stroke-width="1.6" stroke-linejoin="round"/>
    <path class="gi-pad sa" d="M16 41.5h16" stroke-width="2.6" stroke-linecap="round"/>
    <g class="gi-descend">
      <path class="gi-flame fa-l" d="M21.5 30 24 37l2.5-7Z"/>
      <path d="M18.5 26.5 15.5 32M29.5 26.5l3 5.5M14 32h3.5M30.5 32H34" class="sw" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="18" y="21" width="12" height="8" rx="2" fill="${G}"/>
      <path d="M18.5 21a5.5 5.5 0 0 1 11 0Z" class="fw"/>
      <circle cx="24" cy="19.7" r="2.1" class="fk"/>
    </g>`,

  breaker: (G, GU) => `
    <g class="fa-l"><rect x="4" y="6" width="9" height="5" rx="1.6"/><rect x="14.5" y="6" width="9" height="5" rx="1.6"/><rect class="gi-blink" x="25" y="6" width="9" height="5" rx="1.6"/><rect x="35.5" y="6" width="9" height="5" rx="1.6"/></g>
    <g class="fa"><rect x="4" y="12.5" width="9" height="5" rx="1.6"/><rect class="gi-blink d2" x="14.5" y="12.5" width="9" height="5" rx="1.6"/><rect x="25" y="12.5" width="9" height="5" rx="1.6"/><rect x="35.5" y="12.5" width="9" height="5" rx="1.6"/></g>
    <g class="fa-d"><rect x="4" y="19" width="9" height="5" rx="1.6"/><rect x="14.5" y="19" width="9" height="5" rx="1.6"/><rect x="35.5" y="19" width="9" height="5" rx="1.6"/></g>
    <rect class="gi-strafe" x="15" y="40" width="18" height="4.2" rx="2.1" fill="${GU}"/>
    <circle r="2.7" class="fw"><animateMotion dur="2.2s" repeatCount="indefinite" path="M24 37 36 27 28 26 12 32 24 37Z"/></circle>`,

  memory: () => `
    <path d="M9 17 19 8l12 6 7 16-19 7Z" fill="none" class="sa-f" stroke-width="1.2" stroke-dasharray="2 2"/>
    <circle cx="24" cy="22" r="11" class="fa" opacity=".12"/>
    <g transform="translate(9 17)"><path class="gi-seq fw" d="${STAR4}"/></g>
    <g transform="translate(19 8)"><path class="gi-seq d1 fa-l" d="${STAR4}"/></g>
    <g transform="translate(31 14)"><path class="gi-seq d2 fa" d="${STAR4}"/></g>
    <g transform="translate(38 30)"><path class="gi-seq d3 fw" d="${STAR4}"/></g>
    <g transform="translate(19 37)"><path class="gi-seq d4 fa-l" d="${STAR4}"/></g>`,

  mines: () => `
    <circle cx="24" cy="24" r="19.5" class="fa" opacity=".1"/>
    <g fill="none" class="sa-f" stroke-width="1.2"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="12"/><circle cx="24" cy="24" r="5"/><path d="M24 4v40M4 24h40"/></g>
    <path class="gi-sweep fa" d="M24 24V5a19 19 0 0 1 16.5 9.5Z" opacity=".45"/>
    <circle cx="24" cy="24" r="2" class="fa-l"/>
    <circle class="gi-blip fw" cx="32" cy="16" r="2.4"/>
    <circle class="gi-blip d2 fa-l" cx="15" cy="31" r="2"/>
    <circle class="gi-blip d3 fw" cx="31" cy="34" r="1.6"/>`,

  invaders: (G, GU) => `
    <g class="gi-hover">
      <g class="gi-frame-a">${pixels(['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'], 6.4, 6, 3.2, GU)}</g>
      <g class="gi-frame-b">${pixels(['..X.....X..', 'X..X...X..X', 'X.XXXXXXX.X', 'XXX.XXX.XXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..X.....X..', '.X.......X.'], 6.4, 6, 3.2, GU)}</g>
      <rect x="15.9" y="18.8" width="3.2" height="3.2" class="fk"/><rect x="28.7" y="18.8" width="3.2" height="3.2" class="fk"/>
    </g>
    <rect class="gi-shot fw" x="23" y="38" width="2" height="6" rx="1"/>`,

  trivia: (G) => `
    <g class="gi-spin"><circle cx="24" cy="24" r="19" fill="none" stroke="${G}" stroke-width="2.2" stroke-dasharray="14 8" stroke-linecap="round"/></g>
    <g class="gi-spin-rev"><circle cx="24" cy="24" r="13.5" fill="none" class="sa-l" stroke-width="2" stroke-dasharray="9 6" stroke-linecap="round"/></g>
    <circle cx="24" cy="24" r="9" class="fk"/>
    <path class="gi-pulse sw" d="M20.8 21a3.4 3.4 0 1 1 4.6 3.2c-1 .4-1.4 1.1-1.4 2.1v.7" fill="none" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="24" cy="30.2" r="1.4" class="fw"/>
    <circle class="gi-rise fa-l" cx="9" cy="40" r="1.6"/><circle class="gi-rise d2 fa-l" cx="39" cy="42" r="1.2"/>`,
};

export function gameIcon(id, cls = 'gi') {
  const n = ++uid;
  const G = `url(#gig${n})`, GU = `url(#giu${n})`;
  const body = (GAME[id] || GAME.memory)(G, GU);
  return `<svg class="${cls} gi-${id}" viewBox="0 0 48 48" aria-hidden="true">
    <defs>
      <linearGradient id="gig${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-l"/><stop offset="1" class="st-a"/></linearGradient>
      <linearGradient id="giu${n}" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="44"><stop offset="0" class="st-l"/><stop offset="1" class="st-a"/></linearGradient>
    </defs>${body}</svg>`;
}

/* ---------------- Cosmic matter art for Quantum 2048 (40x40) ---------------- */
const COSMIC = [
  null,
  // 1 Space Dust
  () => `<circle cx="20" cy="20" r="14" fill="#a78bfa" opacity=".18"/><g fill="#f5f3ff">${[[12, 14, 2.4], [24, 10, 1.8], [29, 21, 2.6], [16, 25, 2], [23, 30, 2.3], [9, 30, 1.5], [32, 30, 1.6], [19, 18, 1.5]].map(([x, y, r], i) => `<circle class="gi-twinkle d${i % 4}" cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`,
  // 2 Asteroid
  () => `<g class="gi-spin-slow"><path d="M20 7l8 3 5 8-2 9-8 6-9-2-6-8 2-10Z" fill="#78716c"/><path d="M20 7l8 3 5 8-2 9-8 6" fill="none" stroke="#a8a29e" stroke-width="1.2"/><circle cx="16" cy="16" r="3" fill="#57534e"/><circle cx="25" cy="24" r="2.2" fill="#57534e"/><circle cx="14" cy="26" r="1.5" fill="#57534e"/></g>`,
  // 3 Moon
  () => `<g class="gi-float"><path d="M24 6a14 14 0 1 0 10 24A11 11 0 0 1 24 6Z" fill="#e2e8f0"/><circle cx="16" cy="18" r="2.4" fill="#cbd5e1"/><circle cx="20" cy="28" r="1.6" fill="#cbd5e1"/><circle cx="12" cy="26" r="1.2" fill="#cbd5e1"/></g>`,
  // 4 Planet
  () => `<g class="gi-float"><circle cx="20" cy="20" r="10" fill="#38bdf8"/><path d="M11 17c5 2 13 2 18 0M10.5 22.5c5 2 14 2 19 0" stroke="#0369a1" stroke-width="1.6" fill="none"/><ellipse cx="20" cy="21" rx="17" ry="4.6" fill="none" stroke="#e0f2fe" stroke-width="1.6" transform="rotate(-14 20 21)"/></g>`,
  // 5 Star
  () => `<g class="gi-pulse"><circle cx="20" cy="20" r="9" fill="#fde047" opacity=".35"/><path d="M20 6l3.6 9.4L33 19l-9.4 3.6L20 32l-3.6-9.4L7 19l9.4-3.6Z" fill="#fef08a"/><circle cx="20" cy="19.5" r="3.5" fill="#fff"/></g>`,
  // 6 Pulsar
  () => `<g class="gi-spin"><path d="M18.5 20 14 2h12l-4.5 18M18.5 20 14 38h12l-4.5-18" fill="#67e8f9" opacity=".55"/></g><circle cx="20" cy="20" r="5" fill="#ecfeff"/><circle class="gi-pulse" cx="20" cy="20" r="8" fill="none" stroke="#22d3ee" stroke-width="1.4"/>`,
  // 7 Supernova
  () => `<circle class="gi-ring" cx="20" cy="20" r="14" fill="none" stroke="#fdba74" stroke-width="2"/><g class="gi-spin-slow"><path d="M20 3l3 11 10-6-6 10 11 2-11 3 6 10-10-6-3 11-3-11-10 6 6-10-11-3 11-2-6-10 10 6Z" fill="#fb923c"/></g><circle cx="20" cy="20" r="5" fill="#fff7ed"/>`,
  // 8 Black hole
  () => `<g class="gi-spin"><ellipse cx="20" cy="20" rx="17" ry="6" fill="none" stroke="#c084fc" stroke-width="2.4" stroke-dasharray="8 4" transform="rotate(-20 20 20)"/></g><circle cx="20" cy="20" r="7.5" fill="#000" stroke="#f472b6" stroke-width="1.4"/>`,
  // 9 Quasar
  () => `<path class="gi-pulse" d="M18.5 20 20 1l1.5 19L20 39Z" fill="#a5f3fc"/><g class="gi-spin"><ellipse cx="20" cy="20" rx="14" ry="4" fill="none" stroke="#e879f9" stroke-width="2.2" stroke-dasharray="5 3"/></g><circle cx="20" cy="20" r="4" fill="#fff"/>`,
  // 10 Galaxy
  () => `<g class="gi-spin-slow"><path d="M20 20c0-5 6-8 11-5s4 12-3 15-17-1-17-9 8-15 16-13" fill="none" stroke="#c4b5fd" stroke-width="2" stroke-linecap="round"/><path d="M20 20c0 5-6 8-11 5s-4-12 3-15" fill="none" stroke="#67e8f9" stroke-width="2" stroke-linecap="round"/></g><circle cx="20" cy="20" r="3" fill="#fff"/>`,
  // 11 Universe
  () => `<circle cx="20" cy="20" r="16" fill="none" stroke="#f0abfc" stroke-width="1.4"/><g fill="#fff">${[[12, 13], [27, 11], [30, 24], [14, 28], [21, 20], [23, 31], [9, 21]].map(([x, y], i) => `<circle class="gi-twinkle d${i % 4}" cx="${x}" cy="${y}" r="1.4"/>`).join('')}</g>`,
  // 12 Multiverse
  () => `<g class="gi-float"><circle cx="15" cy="16" r="9" fill="#f472b6" opacity=".55"/><circle cx="25" cy="16" r="9" fill="#22d3ee" opacity=".55"/><circle cx="20" cy="25" r="9" fill="#a855f7" opacity=".55"/></g>`,
];

export function cosmicArt(level, cls = 'cosmic') {
  const fn = COSMIC[Math.max(1, Math.min(COSMIC.length - 1, level))];
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true">${fn()}</svg>`;
}
