import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { env, watchVisibility, onResize, lerp, smoothstep, loadImage } from './env.js';
import { simplex3 } from './glsl.js';

const vertex = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform float uSize;
  attribute vec3 aColor;
  attribute vec4 aRnd;
  attribute vec2 aGrid;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vE;
  ${simplex3}
  mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
  void main(){
    float delay = aGrid.x * 0.55 + aRnd.x * 0.22;
    float t = clamp((uProgress * 1.35 - delay) / 0.55, 0.0, 1.0);
    float e = t * t * (3.0 - 2.0 * t);
    vec3 p = position;
    float n1 = snoise(vec3(position.xy * 0.32, uTime * 0.12 + aRnd.y * 2.0));
    float n2 = snoise(vec3(position.yx * 0.32 + 4.0, uTime * 0.12 + aRnd.z * 2.0));
    vec3 dir = vec3(aRnd.y * 2.0 - 1.0, aRnd.z * 2.0 - 0.4, aRnd.w * 2.0 - 1.0);
    p += vec3(n1, n2, 0.0) * 2.4 * e + dir * e * vec3(2.6, 2.2, 7.0);
    p.y += e * e * 1.4 * aRnd.w;
    p.xy = rot2(e * e * (0.6 + aRnd.x)) * p.xy;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 - 0.55 * e) / -mv.z;
    float glow = smoothstep(0.0, 0.25, e) * (1.0 - smoothstep(0.25, 0.9, e));
    vColor = mix(aColor, vec3(1.0, 0.45, 0.16) * 1.35, glow * 0.75);
    vAlpha = 1.0 - smoothstep(0.55, 1.0, e) * 0.82;
    vE = e;
  }
`;
const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vE;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    float roundMask = smoothstep(0.5, 0.38, r);
    float a = mix(1.0, roundMask, smoothstep(0.0, 0.12, vE)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export function initDissolve() {
  const section = document.querySelector('.dissolve');
  const pin = section.querySelector('.dissolve__pin');
  const canvas = section.querySelector('.dissolve__canvas');
  const fallback = section.querySelector('.dissolve__fallback');
  const titleA = section.querySelector('.dissolve__title--a');
  const titleB = section.querySelector('.dissolve__title--b');
  const hint = section.querySelector('.dissolve__hint');
  const state = { target: 0, p: 0, visible: false };

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => '+=' + Math.round(window.innerHeight * 2.6),
    pin,
    scrub: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => { state.target = self.progress; },
  });

  function overlay(p) {
    const a = 1 - smoothstep(0.08, 0.3, p);
    titleA.style.opacity = a.toFixed(3);
    titleA.style.transform = `translate3d(0, ${(-(1 - a) * 60).toFixed(1)}px, 0)`;
    const b = smoothstep(0.42, 0.62, p);
    titleB.style.opacity = b.toFixed(3);
    titleB.style.transform = `translate3d(0, calc(-50% + ${((1 - b) * 50).toFixed(1)}px), 0)`;
    hint.style.opacity = (1 - smoothstep(0.02, 0.12, p)).toFixed(3);
  }
  overlay(0);

  if (!env.webgl || document.documentElement.classList.contains('no-webgl')) {
    ScrollTrigger.create({ trigger: section, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * 2.6), onUpdate: (s) => overlay(s.progress) });
    return { ready: Promise.resolve() };
  }

  // the crisp source image sits on top until the dissolve starts
  fallback.style.display = 'block';
  fallback.style.zIndex = '1';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x0b0b0c, 1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are pre-baked sRGB values
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const DIST = 10;
  camera.position.set(0, 0, DIST);

  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uSize: { value: 10 } },
    transparent: true,
    depthWrite: false,
  });
  let points = null;
  let img = null;

  function build() {
    if (!img) return;
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    const dpr = env.dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const A = w / h;
    const cols = Math.round(Math.min(340, Math.max(110, w / (env.mobile ? 3.2 : 4.6))));
    const rows = Math.max(2, Math.round(cols / A));
    const vh = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const vw = vh * A;

    // object-fit: cover crop, averaged down to one sample per particle
    const cnv = document.createElement('canvas');
    cnv.width = cols; cnv.height = rows;
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    const B = img.width / img.height;
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (A > B) { sh = img.width / A; sy = (img.height - sh) / 2; } else { sw = img.height * A; sx = (img.width - sw) * 0.62; }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
    const data = ctx.getImageData(0, 0, cols, rows).data;

    const n = cols * rows;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 4);
    const grid = new Float32Array(n * 2);
    let k = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++, k++) {
        const u = i / (cols - 1);
        const v = j / (rows - 1);
        pos[k * 3] = (u - 0.5) * vw;
        pos[k * 3 + 1] = (0.5 - v) * vh;
        pos[k * 3 + 2] = 0;
        const di = (j * cols + i) * 4;
        col[k * 3] = data[di] / 255;
        col[k * 3 + 1] = data[di + 1] / 255;
        col[k * 3 + 2] = data[di + 2] / 255;
        rnd[k * 4] = Math.random(); rnd[k * 4 + 1] = Math.random(); rnd[k * 4 + 2] = Math.random(); rnd[k * 4 + 3] = Math.random();
        grid[k * 2] = u; grid[k * 2 + 1] = v;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    geo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
    if (points) { points.geometry.dispose(); scene.remove(points); }
    points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    scene.add(points);
    const spacingPx = (vw / (cols - 1)) * (h / vh);
    material.uniforms.uSize.value = spacingPx * dpr * DIST * 1.18;
  }

  const ready = loadImage('/media/dunes.webp').then((image) => { img = image; build(); });
  onResize(pin, build);
  watchVisibility(section, (v) => { state.visible = v; });

  gsap.ticker.add((time) => {
    if (!state.visible) return;
    state.p = lerp(state.p, state.target, 0.08);
    if (Math.abs(state.p - state.target) < 0.0002) state.p = state.target;
    overlay(state.p);
    fallback.style.opacity = (1 - smoothstep(0.0, 0.05, state.p)).toFixed(3);
    material.uniforms.uProgress.value = state.p;
    material.uniforms.uTime.value = time;
    camera.position.z = DIST - state.p * 1.2;
    camera.position.x = Math.sin(time * 0.2) * 0.05 * state.p;
    if (points) renderer.render(scene, camera);
  });

  return { ready };
}
