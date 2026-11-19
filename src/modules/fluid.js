import gsap from 'gsap';
import { env, watchVisibility, onResize } from './env.js';

const MAX = 48;
const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
uniform vec3 uPts[${MAX}];
uniform int uCount;
out vec4 o;
void main(){
  vec2 p = gl_FragCoord.xy;
  float f = 0.0;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uCount) break;
    vec3 b = uPts[i];
    vec2 d = p - b.xy;
    f += (b.z * b.z) / (dot(d, d) + 1.0);
  }
  float w = max(fwidth(f), 1e-4);
  float a = clamp((f - 1.0) / w + 0.5, 0.0, 1.0);
  o = vec4(vec3(a), a);
}`;

/** Gooey metaball ink trail that inverts the headline through mix-blend-mode: difference. */
export function initFluid() {
  const stage = document.querySelector('.fluid__stage');
  const canvas = stage.querySelector('.fluid__canvas');
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) { canvas.remove(); return; }

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uPts = gl.getUniformLocation(prog, 'uPts');
  const uCount = gl.getUniformLocation(prog, 'uCount');
  const arr = new Float32Array(MAX * 3);

  let dpr = 1, W = 1, H = 1;
  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = stage.clientWidth; H = stage.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  layout();
  onResize(stage, layout);

  const trail = [];
  const head = { x: W * 0.5, y: H * 0.5, tx: W * 0.5, ty: H * 0.5, r: 0, tr: 0 };
  let lastEmit = { x: -999, y: -999 };
  let lastMove = -10;
  let inside = false;
  let visible = false;
  watchVisibility(stage, (v) => { visible = v; }, '0px');

  const baseR = () => Math.max(38, Math.min(W, H) * (env.mobile ? 0.085 : 0.06));

  const toLocal = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  stage.addEventListener('pointermove', (e) => {
    const l = toLocal(e);
    head.tx = l.x; head.ty = l.y;
    inside = true;
    lastMove = performance.now() / 1000;
  }, { passive: true });
  stage.addEventListener('pointerenter', (e) => { const l = toLocal(e); head.x = head.tx = l.x; head.y = head.ty = l.y; inside = true; });
  stage.addEventListener('pointerleave', () => { inside = false; });
  stage.addEventListener('pointerdown', (e) => {
    const l = toLocal(e);
    lastMove = performance.now() / 1000;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      trail.push({ x: l.x + Math.cos(a) * 30, y: l.y + Math.sin(a) * 30, r: baseR() * 0.9, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2 });
    }
  }, { passive: true });

  gsap.ticker.add((time, delta) => {
    if (!visible) return;
    const dt = Math.min(delta / 1000, 0.05);
    const now = performance.now() / 1000;
    const idle = !inside || now - lastMove > 2.2;

    if (idle) {
      // autonomous wandering ink so the effect is alive on touch devices too
      const t = time * 0.55;
      head.tx = W * (0.5 + 0.36 * Math.sin(t * 1.1) * Math.cos(t * 0.37));
      head.ty = H * (0.5 + 0.22 * Math.sin(t * 1.7 + 1.2));
    }
    const follow = idle ? 0.06 : 0.22;
    head.x += (head.tx - head.x) * follow;
    head.y += (head.ty - head.y) * follow;
    head.tr = baseR() * (idle ? 0.85 : 1.15);
    head.r += (head.tr - head.r) * 0.08;

    const dx = head.x - lastEmit.x, dy = head.y - lastEmit.y;
    if (dx * dx + dy * dy > 18 * 18) {
      trail.push({ x: head.x, y: head.y, r: head.r * 0.82, vx: 0, vy: 0 });
      lastEmit = { x: head.x, y: head.y };
      if (trail.length > MAX - 1) trail.shift();
    }
    const decay = Math.pow(0.945, dt * 60);
    for (let i = trail.length - 1; i >= 0; i--) {
      const b = trail[i];
      b.r *= decay;
      b.x += b.vx; b.y += b.vy;
      b.vx *= 0.92; b.vy *= 0.92;
      b.y += 0.15;
      if (b.r < 3) trail.splice(i, 1);
    }

    let n = 0;
    const put = (b) => {
      arr[n * 3] = b.x * dpr;
      arr[n * 3 + 1] = (H - b.y) * dpr;
      arr[n * 3 + 2] = b.r * dpr;
      n += 1;
    };
    put(head);
    for (let i = trail.length - 1; i >= 0 && n < MAX; i--) put(trail[i]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform3fv(uPts, arr);
    gl.uniform1i(uCount, n);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });
}
