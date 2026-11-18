// Animated cover illustrations for the full-size games (SVG, 16:9).
function starDots(seed, n, w = 320, h = 180) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let out = '';
  for (let i = 0; i < n; i++) {
    const big = r() > 0.93;
    out += `<circle cx="${(r() * w).toFixed(1)}" cy="${(r() * h).toFixed(1)}" r="${big ? 0.9 : 0.45}" fill="${['#ffffff', '#cfe0ff', '#ffe8c8'][Math.floor(r() * 3)]}" opacity="${(0.35 + r() * 0.65).toFixed(2)}"${big ? ' class="cv-twinkle"' : ''}/>`;
  }
  return out;
}

const COVERS = {
  starfighter: () => `
    <defs>
      <radialGradient id="cvSfPlanet" cx="35%" cy="8%" r="90%"><stop offset="0" stop-color="#8fd3ff"/><stop offset=".35" stop-color="#2563eb"/><stop offset=".7" stop-color="#0b1f4d"/><stop offset="1" stop-color="#020617"/></radialGradient>
      <radialGradient id="cvSfSun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff7e6"/><stop offset=".25" stop-color="#ffd39a" stop-opacity=".8"/><stop offset="1" stop-color="#ff9a5a" stop-opacity="0"/></radialGradient>
      <linearGradient id="cvSfHull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f5f9"/><stop offset="1" stop-color="#64748b"/></linearGradient>
    </defs>
    <rect width="320" height="180" fill="#03050d"/>
    ${starDots(11, 120)}
    <circle cx="268" cy="34" r="46" fill="url(#cvSfSun)"/>
    <circle cx="150" cy="420" r="300" fill="url(#cvSfPlanet)"/>
    <circle cx="150" cy="420" r="302" fill="none" stroke="#7dd3fc" stroke-opacity=".55" stroke-width="2.5"/>
    <g transform="translate(236 98)" opacity=".9">
      <ellipse rx="26" ry="8" fill="none" stroke="#cbd5e1" stroke-width="3.2"/>
      <ellipse rx="26" ry="8" fill="none" stroke="#ffd9a0" stroke-width="1" stroke-dasharray="1.5 3" opacity=".8"/>
      <rect x="-2.5" y="-16" width="5" height="32" rx="2" fill="#94a3b8"/>
      <rect x="-30" y="-14" width="22" height="5" fill="#1e3a8a" stroke="#94a3b8" stroke-width=".5"/><rect x="8" y="-14" width="22" height="5" fill="#1e3a8a" stroke="#94a3b8" stroke-width=".5"/>
    </g>
    <g fill="#f87171">
      <path d="M40 40l9 3-9 3 2-3Z"><animateTransform attributeName="transform" type="translate" values="0 0;12 4;0 0" dur="4s" repeatCount="indefinite"/></path>
      <path d="M70 26l7 2.5-7 2.5 1.5-2.5Z"><animateTransform attributeName="transform" type="translate" values="0 0;8 6;0 0" dur="5s" repeatCount="indefinite"/></path>
      <path d="M52 62l7 2.5-7 2.5 1.5-2.5Z"><animateTransform attributeName="transform" type="translate" values="0 0;10 -3;0 0" dur="3.6s" repeatCount="indefinite"/></path>
    </g>
    <g stroke="#fb7185" stroke-width="1.4" stroke-linecap="round" opacity=".85">
      <path d="M60 46h14"><animateTransform attributeName="transform" type="translate" values="0 0;80 22" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.4s" repeatCount="indefinite"/></path>
    </g>
    <g class="cv-fighter">
      <animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="3s" repeatCount="indefinite"/>
      <g stroke="#67e8f9" stroke-width="2" stroke-linecap="round">
        <path d="M128 92h22"><animateTransform attributeName="transform" type="translate" values="0 0;-90 -32" dur=".9s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur=".9s" repeatCount="indefinite"/></path>
        <path d="M128 112h22"><animateTransform attributeName="transform" type="translate" values="0 0;-90 -36" dur=".9s" begin=".45s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur=".9s" begin=".45s" repeatCount="indefinite"/></path>
      </g>
      <path d="M210 104c-8-3-30-6-58-6l-14 6 14 6c28 0 50-3 58-6Z" fill="url(#cvSfHull)"/>
      <path d="M190 96l-22-22h-10l12 24ZM190 112l-22 22h-10l12-24Z" fill="#94a3b8"/>
      <path d="M176 101c-6-1.5-12-1.5-16 0l4 3-4 3c4 1.5 10 1.5 16 0Z" fill="#0b1220"/>
      <path d="M163 101.5c4-.8 8-.8 11 0" stroke="#7dd3fc" stroke-width="1" opacity=".8"/>
      <ellipse cx="214" cy="104" rx="9" ry="3.4" fill="#7dd3fc" opacity=".9"><animate attributeName="rx" values="7;12;8;11;7" dur=".5s" repeatCount="indefinite"/></ellipse>
      <ellipse cx="216" cy="104" rx="16" ry="5" fill="#38bdf8" opacity=".25"/>
    </g>`,

  conquest: () => {
    const planets = [
      [52, 110, 16, '#3b82f6', '42'], [96, 52, 10, '#3b82f6', '18'], [148, 120, 9, '#64748b', '12'],
      [196, 66, 13, '#64748b', '20'], [250, 118, 18, '#ef4444', '51'], [276, 46, 11, '#ef4444', '24'], [120, 160, 7, '#64748b', '6'],
    ];
    return `
    <defs>
      <radialGradient id="cvCqNeb" cx="70%" cy="40%" r="60%"><stop offset="0" stop-color="#7f1d1d" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="cvCqNeb2" cx="20%" cy="70%" r="55%"><stop offset="0" stop-color="#1e3a8a" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="320" height="180" fill="#04050c"/>
    <rect width="320" height="180" fill="url(#cvCqNeb)"/><rect width="320" height="180" fill="url(#cvCqNeb2)"/>
    ${starDots(23, 110)}
    <g fill="none" stroke-width="1.2" stroke-dasharray="3 4">
      <path id="cvCqP1" d="M68 104 Q150 70 232 112" stroke="#60a5fa" opacity=".7"><animate attributeName="stroke-dashoffset" values="0;-14" dur="1s" repeatCount="indefinite"/></path>
      <path id="cvCqP2" d="M262 54 Q230 30 206 60" stroke="#f87171" opacity=".7"><animate attributeName="stroke-dashoffset" values="0;-14" dur="1s" repeatCount="indefinite"/></path>
      <path id="cvCqP3" d="M104 58 Q120 100 142 116" stroke="#60a5fa" opacity=".6"><animate attributeName="stroke-dashoffset" values="0;-14" dur="1s" repeatCount="indefinite"/></path>
    </g>
    ${[['cvCqP1', '#93c5fd', 0], ['cvCqP1', '#93c5fd', 0.5], ['cvCqP1', '#93c5fd', 1], ['cvCqP2', '#fca5a5', 0.2], ['cvCqP2', '#fca5a5', 0.9], ['cvCqP3', '#93c5fd', 0.4]].map(([path, c, b]) => `
      <path d="M-3-2 3 0-3 2Z" fill="${c}"><animateMotion dur="3s" begin="${b}s" repeatCount="indefinite" rotate="auto"><mpath href="#${path}"/></animateMotion></path>`).join('')}
    ${planets.map(([x, y, r, c, n]) => `
      <circle cx="${x}" cy="${y}" r="${r + 6}" fill="${c}" opacity=".16"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".9"/>
      <circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.55}" fill="#fff" opacity=".18"/>
      <circle cx="${x}" cy="${y}" r="${r + 2.5}" fill="none" stroke="${c}" stroke-width="1" opacity=".8"/>
      <text x="${x}" y="${y + 3}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="${Math.max(7, r * 0.75)}" fill="#fff">${n}</text>`).join('')}
    <circle cx="250" cy="118" r="26" fill="none" stroke="#fca5a5" stroke-width="1" opacity=".6"><animate attributeName="r" values="20;34" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;0" dur="1.8s" repeatCount="indefinite"/></circle>`;
  },

  colony: () => `
    <defs>
      <radialGradient id="cvClGiant" cx="30%" cy="30%" r="80%"><stop offset="0" stop-color="#fde68a"/><stop offset=".5" stop-color="#b45309"/><stop offset="1" stop-color="#1c0f05"/></radialGradient>
      <linearGradient id="cvClRock" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b8178"/><stop offset="1" stop-color="#3b3530"/></linearGradient>
    </defs>
    <rect width="320" height="180" fill="#04060a"/>
    ${starDots(37, 110)}
    <circle cx="262" cy="40" r="34" fill="url(#cvClGiant)"/>
    <path d="M226 46c20 6 52 2 72-8" stroke="#fcd34d" stroke-opacity=".35" stroke-width="3" fill="none"/>
    <path d="M30 148l18-30 42-10 46 4 34 18 14 28H24Z" fill="url(#cvClRock)"/>
    <path d="M58 132a7 3 0 1 0 14 0 7 3 0 1 0-14 0M112 140a9 3.5 0 1 0 18 0 9 3.5 0 1 0-18 0" fill="#2b2622" opacity=".6"/>
    <path d="M70 120a14 14 0 0 1 28 0Z" fill="#e2e8f0" opacity=".92"/><path d="M76 120a8 8 0 0 1 16 0" fill="none" stroke="#94a3b8"/>
    <path d="M104 122a10 10 0 0 1 20 0Z" fill="#cbd5e1" opacity=".9"/>
    <rect x="132" y="88" width="5" height="34" fill="#94a3b8"/><rect x="128" y="86" width="13" height="5" rx="1" fill="#cbd5e1"/>
    <circle cx="134.5" cy="84" r="2" fill="#f87171"><animate attributeName="opacity" values="1;.1;1" dur="1.4s" repeatCount="indefinite"/></circle>
    <g fill="#ffd9a0"><rect x="78" y="113" width="2" height="2"/><rect x="83" y="111" width="2" height="2"/><rect x="88" y="113" width="2" height="2"/><rect x="110" y="117" width="2" height="2"/><rect x="116" y="117" width="2" height="2"/></g>
    <g fill="url(#cvClRock)">
      <path d="M210 120l8-6 10 2 3 8-6 7-10-1Z"><animateTransform attributeName="transform" type="rotate" values="0 220 122;360 220 122" dur="40s" repeatCount="indefinite"/></path>
      <path d="M250 96l6-4 7 2 1 6-5 4-7-2Z"/>
      <path d="M182 70l5-3 6 2 1 5-4 3-6-1Z"/>
    </g>
    <path id="cvClRoute" d="M136 90 Q180 70 216 118" fill="none" stroke="#4ade80" stroke-opacity=".35" stroke-dasharray="2 3"/>
    <path id="cvClRoute2" d="M136 90 Q200 60 252 96" fill="none" stroke="#4ade80" stroke-opacity=".25" stroke-dasharray="2 3"/>
    ${[0, 1.2, 2.4].map((b) => `<g><circle r="2.2" fill="#86efac"/><circle r="4.5" fill="#4ade80" opacity=".25"/><animateMotion dur="3.6s" begin="${b}s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear"><mpath href="#cvClRoute"/></animateMotion></g>`).join('')}
    <g><circle r="2" fill="#bbf7d0"/><animateMotion dur="5s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear"><mpath href="#cvClRoute2"/></animateMotion></g>`,
};

export function gameCover(id) {
  const fn = COVERS[id];
  return fn ? `<svg class="cover-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${fn()}</svg>` : '';
}
