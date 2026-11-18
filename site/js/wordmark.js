// Animated cursive wordmarks: wavy coloured lines sweep in, weave together and settle into the word,
// then a neon "pen" writes it and the ink glows in. Letter shapes come from the Sacramento script font,
// pre-converted to SVG paths at build time (scripts/build-wordmarks.mjs -> wordmark-data.js).
// This module has no DOM access at import time so the build script can reuse it to render the intro.
import { WORDMARKS } from './wordmark-data.js';

let uid = 0;

function wavePaths(w, baseline, h, seed) {
  const pts = 48;
  const lines = [];
  for (let k = 0; k < 3; k++) {
    const amp = h * (0.32 - k * 0.07);
    const freq = 2.2 + k * 0.9 + seed * 0.1;
    const phase = k * 1.7 + seed;
    let wavy = '', flat = '';
    for (let i = 0; i <= pts; i++) {
      const x = (i / pts) * w;
      const env = Math.sin((i / pts) * Math.PI); // taper at both ends
      const y = baseline + Math.sin((i / pts) * Math.PI * 2 * freq + phase) * amp * env;
      wavy += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      flat += `${i ? 'L' : 'M'}${x.toFixed(1)} ${baseline.toFixed(1)}`;
    }
    lines.push({ wavy, flat, color: ['#22d3ee', '#a855f7', '#f472b6'][k] });
  }
  return lines;
}

/**
 * Returns SVG markup for a cursive wordmark.
 * options: cls, label, waves (bool), begin (seconds after page load, or null for manual play via playWordmark)
 */
export function wordmarkSVG(text, { cls = '', label = text, waves = true, begin = null, idPrefix = 'wm' } = {}) {
  const data = WORDMARKS[text];
  if (!data) return `<span class="${cls}">${label}</span>`;
  const u = `${idPrefix}${++uid}`;
  const { w, h, baseline, glyphs } = data;
  const smilBegin = begin == null ? 'indefinite' : `${begin}s`;
  const style = begin == null ? '' : ` style="--wm-delay:${begin}s"`;
  const defs = glyphs.map((g, i) => `<path id="${u}-g${i}" d="${g.d}" pathLength="1" vector-effect="non-scaling-stroke"/>`).join('');
  const uses = (extra = '') => glyphs.map((g, i) => `<use href="#${u}-g${i}" style="--d:${g.t.toFixed(3)}"${extra}/>`).join('');
  const wv = waves ? wavePaths(w, baseline, h, text.length % 5) : [];
  return `<svg class="wordmark ${cls}${begin == null ? '' : ' wm-play'}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" data-wm${style} preserveAspectRatio="xMidYMid meet">
  <defs>
    ${defs}
    <linearGradient id="${u}-grad" x1="0" y1="0" x2="${w}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7dedfb"/><stop offset=".5" stop-color="#c7b8ff"/><stop offset="1" stop-color="#f9a8d4"/>
    </linearGradient>
    <filter id="${u}-wave" x="-8%" y="-60%" width="116%" height="220%">
      <feTurbulence type="fractalNoise" baseFrequency="0.009 0.05" numOctaves="2" seed="${(text.length * 7) % 97}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G">
        <animate class="wm-smil" attributeName="scale" values="${(h * 0.9).toFixed(0)};${(h * 0.3).toFixed(0)};0" keyTimes="0;.55;1" dur="1.9s" begin="${smilBegin}" fill="freeze"/>
      </feDisplacementMap>
    </filter>
    <filter id="${u}-glow" x="-10%" y="-50%" width="120%" height="200%">
      <feGaussianBlur stdDeviation="${(h * 0.03).toFixed(2)}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  ${waves ? `<g class="wm-waves" fill="none" stroke-linecap="round">${wv.map((l) => `
    <path d="${l.wavy}" stroke="${l.color}" opacity="0" vector-effect="non-scaling-stroke">
      <animate class="wm-smil" attributeName="d" values="${l.wavy};${l.flat}" dur="1.5s" begin="${smilBegin}" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .2 1"/>
      <animate class="wm-smil" attributeName="opacity" values="0;.9;.9;0" keyTimes="0;.15;.7;1" dur="1.9s" begin="${smilBegin}" fill="freeze"/>
    </path>`).join('')}</g>` : ''}
  <g class="wm-threads" filter="url(#${u}-wave)" fill="none">
    <g class="wm-thread t1" stroke="#22d3ee">${uses()}</g>
    <g class="wm-thread t2" stroke="#a855f7">${uses()}</g>
    <g class="wm-thread t3" stroke="#f472b6">${uses()}</g>
  </g>
  <g class="wm-ink" filter="url(#${u}-glow)">
    <g class="wm-fill" fill="url(#${u}-grad)" stroke="url(#${u}-grad)">${uses()}</g>
    <g class="wm-pen" fill="none" stroke="#ffffff">${uses()}</g>
  </g>
</svg>`;
}

/** (Re)plays a wordmark's animation. */
export function playWordmark(svg) {
  if (!svg) return;
  svg.classList.remove('wm-play');
  void svg.getBoundingClientRect();
  svg.classList.add('wm-play');
  svg.querySelectorAll('.wm-smil').forEach((a) => { try { a.beginElement(); } catch { /* SMIL unsupported */ } });
}
