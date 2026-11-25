const html = document.documentElement;

function detectWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

export const env = {
  touch: window.matchMedia('(hover: none), (pointer: coarse)').matches,
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  webgl: detectWebGL(),
  get mobile() { return window.innerWidth < 768; },
  get dpr() { return Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 1.75); },
};

html.classList.remove('no-js');
html.classList.toggle('is-touch', env.touch);
html.classList.toggle('no-webgl', !env.webgl);
html.classList.toggle('reduced-motion', env.reduced);

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Run `cb(isVisible)` whenever the element enters/leaves the viewport (with a margin). */
export function watchVisibility(el, cb, margin = '120px') {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => cb(e.isIntersecting));
  }, { rootMargin: margin });
  io.observe(el);
  return io;
}

/** Load an image and resolve when decoded; never rejects. */
export function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Debounced resize observer. */
export function onResize(el, cb, delay = 120) {
  let t;
  let first = true;
  const ro = new ResizeObserver(() => {
    if (first) { first = false; return; }
    clearTimeout(t);
    t = setTimeout(cb, delay);
  });
  ro.observe(el);
  return ro;
}

/** Shared pointer state in normalized device coords (-1..1). */
export const pointer = { x: 0, y: 0, cx: window.innerWidth / 2, cy: window.innerHeight / 2 };
window.addEventListener('pointermove', (e) => {
  pointer.cx = e.clientX;
  pointer.cy = e.clientY;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
}, { passive: true });
