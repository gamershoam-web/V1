import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import gsap from 'gsap';
import { env, watchVisibility, onResize, pointer, lerp } from './env.js';
import { simplex3 } from './glsl.js';

function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060607);
  const geo = new THREE.PlaneGeometry(1, 1);
  const panel = (hex, k, pos, scale) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.scale.set(scale[0], scale[1], 1);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(0xffffff, 4.5, [0, 6, 1], [8, 4]);        // overhead softbox
  panel(0xff5a1f, 2.6, [6, 0.5, -1], [0.9, 8]);   // ember strip, right
  panel(0x7d8cff, 3.4, [-6, 0, -2], [0.9, 8]);    // cool strip, left
  panel(0xffffff, 2.2, [0, 0, -7], [10, 3]);      // soft back wall
  panel(0xffffff, 7, [0, 1.4, 7], [9, 0.22]);     // thin horizontal highlight, front
  panel(0xffffff, 3, [-3.5, -1, 6], [0.18, 5]);   // thin vertical highlight
  panel(0xff8a50, 0.18, [0, -6, 0], [12, 12]);    // warm floor bounce
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  geo.dispose();
  return rt.texture;
}

export function initHero() {
  const section = document.querySelector('.hero');
  const canvas = section.querySelector('.hero__canvas');
  const letters = section.querySelectorAll('.hero__word span');
  const lines = section.querySelectorAll('.hero__title .line > span');
  const fades = section.querySelectorAll('.hero__fade');

  // initial states for the intro
  if (!env.reduced) {
    gsap.set(letters, { yPercent: 105 });
    gsap.set(lines, { yPercent: 110 });
    gsap.set(fades, { opacity: 0, y: 16 });
  }

  const api = { ready: Promise.resolve(), intro: () => {} };
  let three = null;

  if (env.webgl) {
    try {
      three = setupScene();
    } catch (err) {
      console.warn('[hero] WebGL init failed', err);
      document.documentElement.classList.add('no-webgl');
    }
  }

  function setupScene() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(env.dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.environment = buildEnvironment(renderer);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0, 7.4);

    const uniforms = { uTime: { value: 0 }, uAmp: { value: 0.55 }, uFreq: { value: 0.62 } };
    let geo = new THREE.IcosahedronGeometry(1, env.mobile ? 48 : 88);
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    geo = mergeVertices(geo);
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 1, roughness: 0.14,
      iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [160, 640],
      clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.15,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime; uniform float uAmp; uniform float uFreq;
          ${simplex3}
          vec3 dispP(vec3 p){
            vec3 n = normalize(p);
            float t = uTime;
            float f = snoise(n * uFreq + vec3(t * 0.17, t * 0.11, -t * 0.09));
            f += 0.28 * snoise(n * uFreq * 2.0 + vec3(-t * 0.21, t * 0.15, t * 0.19));
            return n * (1.0 + uAmp * f);
          }`)
        .replace('#include <beginnormal_vertex>', `
          vec3 _n = normalize(position);
          vec3 _t = normalize(cross(_n, abs(_n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 _b = normalize(cross(_n, _t));
          vec3 _p = dispP(position);
          vec3 _pt = dispP(position + _t * 0.012);
          vec3 _pb = dispP(position + _b * 0.012);
          vec3 objectNormal = normalize(cross(_pt - _p, _pb - _p));
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif`)
        .replace('#include <begin_vertex>', 'vec3 transformed = _p;');
    };

    const group = new THREE.Group();
    scene.add(group);
    const blob = new THREE.Mesh(geo, mat);
    group.add(blob);

    const state = { visible: true, scroll: 0, intro: 0, rx: 0, ry: 0, w: 1, h: 1, speed: 0, lastX: 0, lastY: 0 };

    function layout() {
      const w = section.clientWidth;
      const h = section.clientHeight;
      state.w = w; state.h = h;
      renderer.setPixelRatio(env.dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const portrait = w / h < 0.8;
      group.userData.baseScale = portrait ? 0.55 : w < 1100 ? 0.95 : w < 1320 ? 0.9 : 1.02;
      group.userData.baseY = portrait ? 1.0 : 0.22;
      group.userData.baseX = portrait ? 0 : 0.35;
    }
    layout();
    onResize(section, layout);
    watchVisibility(section, (v) => { state.visible = v; });

    const tick = (time, delta) => {
      if (!state.visible) return;
      const dt = Math.min(delta / 1000, 0.05);
      const mv = Math.hypot(pointer.x - state.lastX, pointer.y - state.lastY);
      state.lastX = pointer.x; state.lastY = pointer.y;
      state.speed = lerp(state.speed, Math.min(mv * 18, 1.4), 0.06);
      uniforms.uTime.value += dt * (0.9 + state.speed * 1.6);
      uniforms.uAmp.value = lerp(uniforms.uAmp.value, 0.16 + state.speed * 0.07 + (1 - state.intro) * 0.28, 0.05);

      state.rx = lerp(state.rx, -pointer.y * 0.35, 0.04);
      state.ry = lerp(state.ry, pointer.x * 0.5, 0.04);
      blob.rotation.x = state.rx + time * 0.05;
      blob.rotation.y = state.ry + time * 0.08;

      const s = group.userData.baseScale * (0.55 + 0.45 * state.intro) * (1 + state.scroll * 0.35);
      group.scale.setScalar(s);
      group.position.y = group.userData.baseY + state.scroll * 1.1 + Math.sin(time * 0.6) * 0.04;
      group.position.x = group.userData.baseX + pointer.x * 0.12;
      group.rotation.z = Math.sin(time * 0.3) * 0.05;

      renderer.render(scene, camera);
    };
    gsap.ticker.add(tick);
    return { state, renderer, scene, camera };
  }

  // scroll-out choreography
  gsap.timeline({
    scrollTrigger: { trigger: section, start: 'top top', end: 'bottom top', scrub: true,
      onUpdate: (self) => { if (three) three.state.scroll = self.progress; } },
  })
    .to(letters, { yPercent: -30, stagger: { each: 0.03, from: 'center' }, ease: 'none' }, 0)
    .to(section.querySelector('.hero__mid'), { y: -80, opacity: 0, ease: 'none' }, 0)
    .to(section.querySelector('.hero__meta'), { y: -40, opacity: 0, ease: 'none' }, 0);

  api.intro = () => {
    if (env.reduced) { if (three) three.state.intro = 1; return; }
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    if (three) tl.to(three.state, { intro: 1, duration: 2.4, ease: 'expo.out' }, 0);
    tl.to(letters, { yPercent: 0, duration: 1.5, stagger: 0.06 }, 0.1)
      .to(lines, { yPercent: 0, duration: 1.3, stagger: 0.1 }, 0.35)
      .to(fades, { opacity: 1, y: 0, duration: 1.2, stagger: 0.08 }, 0.6);
  };

  return api;
}
