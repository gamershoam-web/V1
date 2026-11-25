import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { env, watchVisibility, onResize, pointer, lerp, smoothstep } from './env.js';

const IMAGES = ['monolith', 'chrome', 'arches', 'eclipse', 'glass', 'dunes', 'spheres', 'warp', 'ridges', 'ripple', 'topo'];

export function initJourney() {
  const section = document.querySelector('.journey');
  const pin = section.querySelector('.journey__pin');
  const canvas = section.querySelector('.journey__canvas');
  const phrases = [...section.querySelectorAll('.journey__phrase')];
  const depthEl = section.querySelector('.js-depth');
  const track = section.querySelector('.journey__track i');

  const state = { target: 0, p: 0, visible: false };
  const ready = [];

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => '+=' + Math.round(window.innerHeight * 3.4),
    pin,
    scrub: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => { state.target = self.progress; },
  });

  function updateOverlay(p) {
    const centers = [0.12, 0.5, 0.86];
    phrases.forEach((el, i) => {
      const c = centers[i];
      const inn = smoothstep(c - 0.16, c - 0.05, p);
      const out = i === phrases.length - 1 ? 0 : smoothstep(c + 0.06, c + 0.16, p);
      const o = inn * (1 - out);
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(0, ${((1 - inn) * 40 - out * 40).toFixed(1)}px, 0) scale(${(0.96 + 0.04 * inn + out * 0.06).toFixed(3)})`;
    });
    depthEl.textContent = String(Math.round(p * 1100)).padStart(3, '0');
    track.style.transform = `scaleX(${p.toFixed(4)})`;
  }
  updateOverlay(0);

  if (!env.webgl || document.documentElement.classList.contains('no-webgl')) {
    ScrollTrigger.create({ trigger: section, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * 3.4), onUpdate: (s) => updateOverlay(s.progress) });
    return { ready: Promise.resolve() };
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x0b0b0c, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0b0c, 3, 15);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 60);

  const loader = new THREE.TextureLoader();
  const textures = IMAGES.map((name) => new Promise((resolve) => {
    loader.load(`/media/${name}-sm.webp`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      resolve(t);
    }, undefined, () => resolve(null));
  }));
  ready.push(...textures);

  const planes = [];
  const COUNT = 24;
  const SPACING = 2.35;
  const START_Z = 4.2;
  const END_Z = -(COUNT - 1) * SPACING - 0.5;
  let seed = 11;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  Promise.all(textures).then((texs) => {
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < COUNT; i++) {
      const tex = texs[i % texs.length];
      if (!tex) continue;
      const aspect = tex.image.width / tex.image.height;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      const h = 1.25 + rand() * 0.55;
      mesh.scale.set(h * aspect, h, 1);
      const a = i * 2.39996 + 0.7;
      const r = 1.85 + rand() * 0.9;
      mesh.userData = {
        x: Math.cos(a) * r * 1.25,
        y: Math.sin(a) * r * 0.72,
        z: -i * SPACING,
        phase: rand() * Math.PI * 2,
      };
      mesh.position.set(mesh.userData.x, mesh.userData.y, mesh.userData.z);
      mesh.rotation.y = -mesh.userData.x * 0.07;
      mesh.rotation.x = mesh.userData.y * 0.05;
      scene.add(mesh);
      planes.push(mesh);
    }
  });

  function layout() {
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    renderer.setPixelRatio(env.dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 68 : 52;
    camera.updateProjectionMatrix();
  }
  layout();
  onResize(pin, layout);
  watchVisibility(section, (v) => { state.visible = v; });

  const cam = { x: 0, y: 0 };
  gsap.ticker.add((time) => {
    if (!state.visible) return;
    state.p = lerp(state.p, state.target, 0.075);
    if (Math.abs(state.p - state.target) < 0.0002) state.p = state.target;
    const p = state.p;
    updateOverlay(p);

    cam.x = lerp(cam.x, pointer.x * 0.45, 0.05);
    cam.y = lerp(cam.y, pointer.y * 0.3, 0.05);
    camera.position.set(cam.x, cam.y, lerp(START_Z, END_Z, p));
    camera.lookAt(cam.x * 0.4, cam.y * 0.4, camera.position.z - 6);
    camera.rotation.z = Math.sin(p * Math.PI * 2) * 0.04;

    for (const m of planes) {
      const d = camera.position.z - m.userData.z;
      const fadeIn = smoothstep(16, 9, d);
      const fadeOut = smoothstep(0.15, 1.6, d);
      m.material.opacity = fadeIn * fadeOut;
      m.visible = m.material.opacity > 0.005;
      m.position.y = m.userData.y + Math.sin(time * 0.5 + m.userData.phase) * 0.06;
    }
    renderer.render(scene, camera);
  });

  return { ready: Promise.all(ready) };
}
