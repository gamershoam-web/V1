import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { env, watchVisibility, onResize, pointer, lerp, smoothstep } from './env.js';

function grilleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#18171a';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#3a383d';
  const step = 16;
  for (let y = 0; y < 256; y += step) {
    for (let x = 0; x < 256; x += step) {
      const ox = (y / step) % 2 ? step / 2 : 0;
      g.beginPath();
      g.arc(x + ox + step / 2, y + step / 2, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(30,24,20,0.55)');
  grd.addColorStop(0.35, 'rgba(30,24,20,0.28)');
  grd.addColorStop(1, 'rgba(30,24,20,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function buildDevice() {
  const device = new THREE.Group();
  const parts = {};

  const profile = new THREE.SplineCurve([
    [0, -1.2], [0.4, -1.2], [0.55, -1.16], [0.62, -1.02], [0.635, -0.7], [0.635, 0.62],
    [0.62, 0.93], [0.55, 1.09], [0.42, 1.17], [0.22, 1.2], [0, 1.2],
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0xe7e1d6, roughness: 0.38, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: 0xffe8d6,
  });
  parts.body = new THREE.Mesh(new THREE.LatheGeometry(profile.getPoints(100), 160), ceramic);
  device.add(parts.body);

  const grille = new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.92, metalness: 0.05 });
  parts.band = new THREE.Mesh(new THREE.CylinderGeometry(0.641, 0.641, 1.12, 160, 1, true), grille);
  parts.band.position.y = -0.24;
  device.add(parts.band);

  const ember = new THREE.MeshPhysicalMaterial({ color: 0xff5a1f, metalness: 0.75, roughness: 0.28, clearcoat: 1, emissive: 0xff3a0a, emissiveIntensity: 0.12 });
  const ringGeo = new THREE.TorusGeometry(0.643, 0.014, 16, 200);
  parts.ringTop = new THREE.Mesh(ringGeo, ember);
  parts.ringTop.rotation.x = Math.PI / 2;
  parts.ringTop.position.y = 0.32;
  parts.ringBottom = new THREE.Mesh(ringGeo, ember);
  parts.ringBottom.rotation.x = Math.PI / 2;
  parts.ringBottom.position.y = -0.8;
  device.add(parts.ringTop, parts.ringBottom);

  const alu = new THREE.MeshPhysicalMaterial({ color: 0xcfcac2, metalness: 1, roughness: 0.32, clearcoat: 0.4 });
  parts.cap = new THREE.Group();
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.06, 96), alu);
  const knurl = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.012, 12, 120), ember);
  knurl.rotation.x = Math.PI / 2;
  knurl.position.y = 0.03;
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.028, 24, 24), new THREE.MeshBasicMaterial({ color: 0xff6a2a }));
  led.position.set(0.2, 0.035, 0);
  parts.cap.add(dial, knurl, led);
  parts.cap.position.y = 1.205;
  device.add(parts.cap);

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.04, 96), new THREE.MeshStandardMaterial({ color: 0x1a191b, roughness: 0.7 }));
  foot.position.y = -1.215;
  device.add(foot);

  return { device, parts };
}

export function initProduct() {
  const section = document.querySelector('.product');
  const pin = section.querySelector('.product__pin');
  const canvas = section.querySelector('.product__canvas');
  const steps = [...section.querySelectorAll('.product__step')];
  const progressBar = section.querySelector('.product__progress i');
  const state = { target: 0, p: 0, visible: false, step: -1 };
  let three = null;

  function setStep(i) {
    if (i === state.step) return;
    const prev = steps[state.step];
    const next = steps[i];
    const dir = i > state.step ? 1 : -1;
    state.step = i;
    if (prev) gsap.to(prev, { autoAlpha: 0, y: -30 * dir, duration: 0.5, ease: 'power3.in', overwrite: true });
    if (next) gsap.fromTo(next, { autoAlpha: 0, y: 40 * dir }, { autoAlpha: 1, y: 0, duration: 0.9, delay: prev ? 0.35 : 0, ease: 'expo.out', overwrite: true });
  }
  setStep(0);

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => '+=' + Math.round(window.innerHeight * 2.4),
    pin,
    scrub: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      state.target = self.progress;
      setStep(Math.min(steps.length - 1, Math.floor(self.progress * steps.length * 0.999)));
      if (!three) progressBar.style.transform = `scaleX(${self.progress})`;
    },
  });

  if (!env.webgl || document.documentElement.classList.contains('no-webgl')) return { ready: Promise.resolve() };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-3, 4, 4);
  const rim = new THREE.DirectionalLight(0xffa77a, 1.6);
  rim.position.set(4, 2, -3);
  scene.add(key, rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.6, 9);
  camera.lookAt(0, 0, 0);

  const outer = new THREE.Group();
  scene.add(outer);
  const { device, parts } = buildDevice();
  outer.add(device);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.26;
  outer.add(shadow);
  three = { renderer };

  const lay = { x: 0, y: 0, s: 1, portrait: false };
  function layout() {
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    renderer.setPixelRatio(env.dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    lay.portrait = w / h < 0.9;
    lay.x = lay.portrait ? 0 : w < 1100 ? 1.2 : 1.75;
    lay.y = lay.portrait ? -0.12 : -0.14;
    lay.s = lay.portrait ? 0.6 : 1.05;
  }
  layout();
  onResize(pin, layout);
  watchVisibility(section, (v) => { state.visible = v; });

  const rot = { x: 0, y: 0 };
  gsap.ticker.add((time) => {
    if (!state.visible) return;
    state.p = lerp(state.p, state.target, 0.08);
    const p = state.p;
    progressBar.style.transform = `scaleX(${p.toFixed(4)})`;

    // exploded view peaks during the "Design" chapter
    const ex = smoothstep(0.28, 0.45, p) * (1 - smoothstep(0.6, 0.76, p));
    parts.cap.position.y = 1.205 + ex * 0.55;
    parts.ringTop.position.y = 0.32 + ex * 0.28;
    parts.ringBottom.position.y = -0.8 - ex * 0.28;
    parts.ringTop.scale.setScalar(1 + ex * 0.25);
    parts.ringBottom.scale.setScalar(1 + ex * 0.25);
    parts.band.scale.set(1 + ex * 0.1, 1, 1 + ex * 0.1);

    rot.x = lerp(rot.x, pointer.y * 0.12, 0.05);
    rot.y = lerp(rot.y, pointer.x * 0.25, 0.05);
    device.rotation.y = p * Math.PI * 2.4 + rot.y + time * 0.12;
    outer.rotation.x = rot.x * 0.5;
    outer.rotation.z = Math.sin(p * Math.PI * 2) * 0.12;

    const travel = lay.portrait ? 0 : Math.sin(p * Math.PI) * -0.3;
    outer.position.set(lay.x + travel, lay.y + Math.sin(time * 0.8) * 0.03 + ex * -0.15, 0);
    outer.scale.setScalar(lay.s * (0.92 + 0.08 * Math.sin(p * Math.PI)));
    shadow.material.opacity = 1 - ex * 0.45;
    renderer.render(scene, camera);
  });

  return { ready: Promise.resolve() };
}
