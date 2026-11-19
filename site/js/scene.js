// Three.js hub: realistic space (Milky Way sky, sun, planets, asteroid belt) + sector nodes and camera rig.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  createSkyCubeAsync, makePlanet, makeSun, makeAsteroidBelt, makeAtmosphere, glowTexture, makeGlowSprite, canvasTexture, seededRandom,
} from './space-assets.js';

const TAU = Math.PI * 2;
const SUN_DIR = new THREE.Vector3(-0.86, 0.3, 0.42).normalize();

/* Pixel-art block textures for the Minecraft planet */
function blockTexture(base, speckles, seed, { stripe = null } = {}) {
  const rand = seededRandom(seed);
  const t = canvasTexture(16, 16, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = speckles[Math.floor(rand() * speckles.length)];
      g.fillRect(Math.floor(rand() * 16), Math.floor(rand() * 16), 1, 1);
    }
    if (stripe) { g.fillStyle = stripe; g.fillRect(0, 0, 16, 4); for (let x = 0; x < 16; x++) if (rand() > 0.5) g.fillRect(x, 4, 1, 1 + Math.floor(rand() * 2)); }
  });
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  return t;
}

/* Hull and solar-cell textures for the station */
const hullTexture = () => canvasTexture(512, 256, (g, w, h) => {
  const rand = seededRandom(5);
  g.fillStyle = '#b9bec7'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const v = 150 + Math.floor(rand() * 60);
    g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    g.fillRect(Math.floor(rand() * 16) * 32, Math.floor(rand() * 8) * 32, 32 * (1 + Math.floor(rand() * 3)), 32);
  }
  g.strokeStyle = 'rgba(40,44,52,0.55)'; g.lineWidth = 2;
  for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = 'rgba(30,32,38,0.7)';
  for (let i = 0; i < 40; i++) g.fillRect(rand() * w, rand() * h, 4, 4);
});
const windowTexture = () => canvasTexture(512, 64, (g, w, h) => {
  const rand = seededRandom(9);
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let x = 6; x < w; x += 12) {
    if (rand() < 0.75) { g.fillStyle = rand() < 0.8 ? '#ffd9a0' : '#bfe6ff'; g.fillRect(x, 26, 6, 10); }
  }
});
const solarTexture = () => canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#0d1b3d'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
    const v = 26 + Math.floor(Math.random() * 18);
    g.fillStyle = `rgb(${v - 10},${v + 4},${v + 50})`;
    g.fillRect(x + 1, y + 1, 14, 14);
  }
  g.strokeStyle = 'rgba(200,210,230,0.5)'; g.lineWidth = 1;
  for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
});

export class SpaceScene {
  constructor(canvas, { labelsEl, onSelect, onHover, viewInsets, intro = false, calm = false } = {}) {
    this.calm = calm;
    this.canvas = canvas;
    this.viewInsets = viewInsets;
    this.holding = intro;
    this.labelsEl = labelsEl;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.paused = false;
    this.built = false;
    this.covered = intro; // the opening sequence hides the scene: build it, but don't render frames yet
    this.coarse = window.matchMedia('(pointer: coarse)').matches;
    // Phones and low-power devices get lighter textures and fewer asteroids.
    this.lite = this.coarse || document.documentElement.classList.contains('lite');

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lite ? 1.35 : 1.75));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.nodes = [];
    this.pickables = [];
    this.raycaster = new THREE.Raycaster();
    this.glow = glowTexture();
    this.anims = [];

    this.rig = {
      target: new THREE.Vector3(), targetGoal: new THREE.Vector3(),
      r: intro && !calm ? 760 : 320, rGoal: intro && !calm ? 760 : 82, theta: intro ? 2.6 : 0.9, thetaGoal: intro ? 2.6 : 0.5,
      phi: intro ? 0.55 : 1.12, phiGoal: intro ? 0.55 : 1.12,
      focus: null, lastInteract: 0,
    };
    this.mouse = new THREE.Vector2(); this.mouseSmooth = new THREE.Vector2();
    this.hovered = null;

    this._loop = this._loop.bind(this);
    this._onResize = () => this.resize();
    this.progress = 0;
    this.onProgress = null;
    // Built in small steps across frames so the page (and the intro animation) never freezes.
    this.ready = this.build();
  }

  /* ---------- construction ---------- */
  async build() {
    // Between steps, wait for the next frame and for the GPU to finish the previous step's work (texture bakes),
    // so GPU jobs never pile up into one long stall that freezes the page.
    const gl = this.renderer.getContext();
    const fences = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const raf = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const nextFrame = async () => {
      const sync = fences ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (sync) gl.flush();
      await raf();
      if (!sync) return;
      const t0 = performance.now();
      while (gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED && performance.now() - t0 < 4000) await raf();
      gl.deleteSync(sync);
    };
    const report = (p) => { this.progress = p; this.onProgress?.(p); };
    // Step timings (ms), shown in the ?diag panel
    this.buildLog = [];
    const timed = (name, fn) => { const t0 = performance.now(); const out = fn(); this.buildLog.push([name, Math.round(performance.now() - t0), Math.round(t0)]); return out; };
    this._timed = timed;
    const t0 = performance.now();
    await this.buildSky(nextFrame);
    this.buildLog.push(['sky (total)', Math.round(performance.now() - t0)]);
    report(0.4);
    const steps = [
      ['sun', () => this.buildSun()], ['backdrop', () => this.buildBackdrop()], ['belt', () => this.buildBelt()], ['station', () => this.buildStation()],
      ['minecraft', () => this.buildMinecraftPlanet()], ['arcade', () => this.buildArcadePlanet()], ['comms', () => this.buildCommsPlanet()],
      ['ui', () => { this.buildLabels(); this.bindControls(); this.buildComposer(); }],
    ];
    for (let i = 0; i < steps.length; i++) {
      await nextFrame();
      timed(steps[i][0], steps[i][1]);
      report(0.4 + 0.45 * ((i + 1) / steps.length));
    }
    window.addEventListener('resize', this._onResize);
    this.resize();
    await nextFrame();
    // Compile every shader before the first visible frame (in the background where the browser supports it).
    const tc = performance.now();
    try {
      if (this.renderer.extensions.has('KHR_parallel_shader_compile')) await this.renderer.compileAsync(this.scene, this.camera);
      else this.renderer.compile(this.scene, this.camera);
    } catch (e) { console.warn(e); }
    this.buildLog.push(['shaders', Math.round(performance.now() - tc)]);
    await nextFrame();
    // Warm up one group per frame (drawn into a single pixel): shader set-up and geometry/texture uploads
    // happen in small pieces while the intro still covers the screen, instead of one long first frame.
    this.update(0, 0);
    const r = this.renderer, kids = this.scene.children.slice(), shown = kids.map((k) => k.visible), bg = this.scene.background;
    r.setScissorTest(true);
    r.setScissor(0, 0, 1, 1);
    for (let i = 0; i < kids.length; i++) {
      kids.forEach((k, j) => { k.visible = j === i && shown[j]; });
      this.scene.background = i === 0 ? bg : null;
      if (!shown[i]) continue;
      timed(`warm ${i}`, () => r.render(this.scene, this.camera));
      if (i % 3 === 2) await nextFrame();
    }
    kids.forEach((k, j) => { k.visible = shown[j]; });
    this.scene.background = bg;
    r.setScissorTest(false);
    await nextFrame();
    timed('first frame', () => this.renderFrame());
    report(1);
    this.built = true;
    this.clock.getDelta();
    if (!this.paused) this._raf = requestAnimationFrame(this._loop);
  }

  async buildSky(nextFrame) {
    const sky = await createSkyCubeAsync(this.renderer, { size: this.lite ? 512 : 1536 }, nextFrame);
    await nextFrame();
    this.scene.background = sky;
    this._timed('sky reflections', () => {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromCubemap(sky).texture;
      pmrem.dispose();
    });

    // A sparse layer of the brightest stars as crisp points, with a very gentle shimmer.
    const rand = seededRandom(42);
    const count = 260, pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count), phase = new Float32Array(count);
    const tints = [[0.7, 0.8, 1], [0.92, 0.95, 1], [1, 1, 1], [1, 0.94, 0.82], [1, 0.8, 0.6], [1, 0.66, 0.5]];
    for (let i = 0; i < count; i++) {
      const u = rand() * 2 - 1, th = rand() * TAU, s = Math.sqrt(1 - u * u), rad = 2600;
      pos.set([Math.cos(th) * s * rad, u * rad, Math.sin(th) * s * rad], i * 3);
      col.set(tints[Math.floor(Math.pow(rand(), 1.4) * tints.length)], i * 3);
      size[i] = 1.1 + Math.pow(rand(), 6) * 2.2;
      phase[i] = rand() * TAU;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    this.starUniforms = { uTime: { value: 0 }, uPixel: { value: this.renderer.getPixelRatio() } };
    this.stars = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: `
        attribute float size; attribute float phase; attribute vec3 color;
        uniform float uTime; uniform float uPixel; varying vec3 vColor; varying float vA;
        void main(){
          vColor = color;
          vA = 0.8 + 0.2 * sin(uTime * (0.6 + phase * 0.25) + phase * 7.0);
          gl_PointSize = size * uPixel;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * vA * 0.9, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  buildSun() {
    const sun = makeSun({ radius: 55, withFlare: true });
    sun.group.position.copy(SUN_DIR).multiplyScalar(1700);
    this.scene.add(sun.group);
    this.sun = sun;
    const light = new THREE.DirectionalLight(0xfff2e0, 2.6);
    light.position.copy(SUN_DIR).multiplyScalar(200);
    this.scene.add(light, light.target);
    this.scene.add(new THREE.AmbientLight(0x5b6b8c, 0.18));
    this.scene.add(new THREE.HemisphereLight(0x8fa6c8, 0x1a1410, 0.12));
  }

  buildBackdrop() {
    const earth = makePlanet(this.renderer, {
      type: 'earth', radius: 70, seed: 3, sunDir: SUN_DIR, segments: 128,
      atmosphere: { color: 0x5aa8ff, intensity: 1.6, power: 2.6, scale: 1.035 }, size: this.lite ? 512 : 2048,
    });
    earth.group.position.set(-330, -90, -520);
    earth.group.rotation.z = 0.41;
    this.scene.add(earth.group);
    const moon = makePlanet(this.renderer, { type: 'rock', radius: 13, seed: 8, tint: '#a3a09a', size: this.lite ? 384 : 1024 });
    moon.group.position.set(-205, -40, -455);
    this.scene.add(moon.group);
    this.backdrop = { earth, moon };
  }

  buildBelt() {
    this.belt = makeAsteroidBelt({ count: this.lite ? 260 : 1100, inner: 100, outer: 128, thickness: 5, sizeMax: 1.1 });
    this.belt.rotation.x = 0.04;
    this.scene.add(this.belt);
  }

  makeGlow(color, scale, opacity = 0.6) { return makeGlowSprite(this.glow, color, scale, opacity); }

  buildStation() {
    const g = new THREE.Group();
    const hullTex = hullTexture();
    hullTex.wrapS = hullTex.wrapT = THREE.RepeatWrapping;
    const metal = new THREE.MeshStandardMaterial({ color: 0xd8dce3, map: hullTex, metalness: 0.55, roughness: 0.5, envMapIntensity: 1.0 });
    const ringTex = hullTex.clone(); ringTex.needsUpdate = true; ringTex.repeat.set(10, 1);
    const winTex = windowTexture(); winTex.wrapS = THREE.RepeatWrapping; winTex.repeat.set(6, 1);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xd8dce3, map: ringTex, emissiveMap: winTex, emissive: 0xffd9a0, emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.5, envMapIntensity: 1.0 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3b3f48, metalness: 0.6, roughness: 0.55 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe8eaee, metalness: 0.1, roughness: 0.7 });
    const solar = new THREE.MeshStandardMaterial({ map: solarTexture(), metalness: 0.55, roughness: 0.25, envMapIntensity: 2 });

    const spin = new THREE.Group();
    g.add(spin);
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(9, 1.15, 24, 128), ringMat));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 7.8, 10), dark);
      spoke.rotation.z = Math.PI / 2; spoke.rotation.y = -a;
      spoke.position.set(Math.cos(a) * 4.9, 0, Math.sin(a) * 4.9);
      spin.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 4.2, 32), metal);
    g.add(hub);
    [-1, 1].forEach((s) => {
      const mod = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 4.5, 24), metal);
      mod.position.y = s * 4.35; g.add(mod);
      const port = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.8, 20), dark);
      port.position.y = s * 6.9; g.add(port);
    });
    // Truss with solar arrays and radiators
    const truss = new THREE.Mesh(new THREE.BoxGeometry(0.45, 30, 0.45), dark);
    truss.position.y = 0; truss.rotation.z = Math.PI / 2; truss.position.set(0, 7.6, 0);
    g.add(truss);
    [-1, 1].forEach((s) => {
      for (let k = 0; k < 2; k++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 2.6), solar);
        panel.position.set(s * (8.5 + k * 5.6), 7.6, 1.7);
        g.add(panel);
        const panel2 = panel.clone(); panel2.position.z = -1.7; g.add(panel2);
      }
      const rad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.6), white);
      rad.position.set(s * 4.2, 7.6, 0); rad.rotation.x = Math.PI / 2;
      g.add(rad);
    });
    // Comms dish
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 12, 0, TAU, 0, Math.PI * 0.32), white);
    dish.material = white.clone(); dish.material.side = THREE.DoubleSide;
    dish.position.set(0, -7.9, 0); dish.rotation.x = Math.PI;
    g.add(dish);

    // Navigation lights: red (port), green (starboard), white strobes
    this.navLights = [];
    const addLight = (color, pos, period, offset) => {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color }));
      bulb.position.copy(pos);
      const halo = this.makeGlow(color, 2.2, 0.9);
      halo.position.copy(pos);
      g.add(bulb, halo);
      this.navLights.push({ bulb, halo, period, offset });
    };
    addLight(0xff3344, new THREE.Vector3(-19.8, 7.6, 0), 1.6, 0);
    addLight(0x33ff77, new THREE.Vector3(19.8, 7.6, 0), 1.6, 0);
    addLight(0xffffff, new THREE.Vector3(0, 7.3, 0), 2.4, 0.3);
    addLight(0xffffff, new THREE.Vector3(0, -7.4, 0), 2.4, 1.5);

    g.rotation.x = 0.32;
    g.rotation.z = -0.12;
    this.station = { group: g, spin };
    this.addNode('station', g, { label: 'Orbit Station', sub: 'Command Deck', focusDist: 38, radius: 10, hitRadius: 11 });
  }

  buildMinecraftPlanet() {
    const g = new THREE.Group();
    const R = 4.6, rand = seededRandom(1337);
    const TYPES = {
      grass: { tex: blockTexture('#5d9b3a', ['#4f8a2f', '#6caf45', '#7cbc52', '#467f2a'], 1) },
      dirt: { tex: blockTexture('#7a5534', ['#6b4a2c', '#8a6240', '#5e4126', '#946b47'], 2) },
      stone: { tex: blockTexture('#7d7d7d', ['#6e6e6e', '#8c8c8c', '#5f5f5f', '#999999'], 3) },
      sand: { tex: blockTexture('#dccf9a', ['#cfc189', '#e6dba8', '#c7b87d'], 4) },
      water: { tex: blockTexture('#2f5fd0', ['#2a55bd', '#3a6ee0', '#2549a8'], 5), water: true },
      snow: { tex: blockTexture('#f2f6fa', ['#e3e9f0', '#ffffff', '#d7dee8'], 6) },
      leaves: { tex: blockTexture('#2f6b1f', ['#285e1a', '#3a7c27', '#20521a'], 7) },
    };
    const buckets = Object.fromEntries(Object.keys(TYPES).map((k) => [k, []]));
    for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) for (let z = -5; z <= 5; z++) {
      const d = Math.sqrt(x * x + y * y + z * z);
      if (d > R || d <= R - 2) continue;
      const outer = d > R - 1;
      const n = Math.sin(x * 1.3 + 2) * Math.cos(z * 1.1 - 1) + Math.sin(y * 0.9 + x * 0.4) * 0.8 + (rand() - 0.5) * 0.3;
      let type;
      if (!outer) type = n > 0.6 ? 'stone' : 'dirt';
      else if (Math.abs(y) >= 4) type = 'snow';
      else if (n < -0.75) type = 'water';
      else if (n < -0.45) type = 'sand';
      else if (n > 1.05) type = 'stone';
      else type = rand() > 0.88 ? 'leaves' : 'grass';
      buckets[type].push([x, y, z]);
    }
    const planet = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Matrix4();
    Object.entries(buckets).forEach(([type, cells]) => {
      if (!cells.length) return;
      const def = TYPES[type];
      const mat = new THREE.MeshStandardMaterial({ map: def.tex, roughness: def.water ? 0.25 : 0.95, metalness: 0, envMapIntensity: def.water ? 1.4 : 0.4 });
      const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
      cells.forEach(([x, y, z], i) => { m.makeTranslation(x, y, z); mesh.setMatrixAt(i, m); });
      planet.add(mesh);
    });
    g.add(planet);

    // Minecraft-style flat clouds drifting around the planet
    const clouds = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rand() * 0.3;
      const tilt = (rand() - 0.5) * 1.6;
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.4 + rand() * 1.6, 0.9 + rand() * 0.8, 0.25), cloudMat); // thin along local z, which lookAt points at the planet
      const r = R + 1.6;
      c.position.set(Math.cos(a) * Math.cos(tilt) * r, Math.sin(tilt) * r, Math.sin(a) * Math.cos(tilt) * r);
      c.lookAt(0, 0, 0);
      clouds.add(c);
    }
    g.add(clouds);
    g.add(makeAtmosphere(R + 0.3, 0x86c8ff, SUN_DIR, { intensity: 1.1, power: 2.8, scale: 1.18 }));

    // Beacon: block + soft light beam
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x9be8ff, emissive: 0x7fe3ff, emissiveIntensity: 2.2, roughness: 0.2 }));
    beacon.position.y = R + 0.6;
    g.add(beacon);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.38, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = R + 16;
    g.add(beam);

    this.mc = { planet, clouds, beam, beacon };
    this.addNode('minecraft', g, {
      label: 'Minecraft Server', sub: 'Orbitnetwork.net', focusDist: 24, radius: 5,
      orbit: { radius: 30, speed: 0.05, phase: 0.6, tilt: 0.12 },
    });
  }

  buildArcadePlanet() {
    const g = new THREE.Group();
    const giant = makePlanet(this.renderer, { type: 'gas', radius: 5.2, seed: 21, palette: 'saturn', rings: true, sunDir: SUN_DIR, atmosphere: { color: 0xffe2b0, intensity: 0.5, power: 3.5, scale: 1.03 }, size: this.lite ? 384 : 1024 });
    giant.group.rotation.set(0.5, 0, 0.32);
    g.add(giant.group);
    const moons = [];
    [[9.5, 0.5, 0.42, 31], [12.5, 0.36, 0.27, 32]].forEach(([dist, r, speed, seed], i) => {
      const pivot = new THREE.Group();
      const moon = makePlanet(this.renderer, { type: 'rock', radius: r, seed, tint: i ? '#b9a58c' : '#9c9a96', segments: 32, size: 256 });
      moon.group.position.set(dist, 0, 0);
      pivot.add(moon.group);
      pivot.rotation.z = 0.2 + i * 0.15;
      g.add(pivot);
      moons.push({ pivot, speed });
    });
    this.arcade = { planet: giant.surface, ring: giant.ring, moons };
    this.addNode('arcade', g, {
      label: 'Arcade Sector', sub: 'Full games + 12 minis', focusDist: 30, radius: 5.5, hitRadius: 9,
      orbit: { radius: 48, speed: 0.032, phase: 2.6, tilt: -0.08, tiltZ: 0.05 },
    });
  }

  buildCommsPlanet() {
    const g = new THREE.Group();
    const ice = makePlanet(this.renderer, { type: 'ice', radius: 3.4, seed: 77, sunDir: SUN_DIR, atmosphere: { color: 0x7fd4ff, intensity: 1.4, power: 2.6, scale: 1.06 }, size: this.lite ? 384 : 1024 });
    g.add(ice.group);
    // Relay satellite in orbit
    const satPivot = new THREE.Group();
    const sat = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0xd9b45a, metalness: 0.8, roughness: 0.3 }));
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.5), new THREE.MeshStandardMaterial({ map: solarTexture(), metalness: 0.5, roughness: 0.3 }));
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 8, 0, TAU, 0, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: 0xeeeeee, side: THREE.DoubleSide, roughness: 0.6 }));
    dish.position.z = 0.5; dish.rotation.x = Math.PI / 2;
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4455 }));
    blink.position.y = 0.32;
    sat.add(body, wing, dish, blink);
    sat.position.set(5.6, 0.6, 0);
    satPivot.add(sat);
    satPivot.rotation.x = 0.35;
    g.add(satPivot);
    this.comms = { planet: ice.surface, satPivot, sat, blink };
    this.addNode('comms', g, {
      label: 'Comms Relay', sub: 'Discord & community', focusDist: 18, radius: 3.5, hitRadius: 5.5,
      orbit: { radius: 64, speed: 0.022, phase: 4.4, tilt: 0.16 },
    });
  }

  buildComposer() {
    this.useBloom = !this.lite;
    if (!this.useBloom) return;
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.42, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  addNode(id, object, { label, sub, focusDist, radius, orbit, hitRadius }) {
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(hitRadius || radius * 1.4, 16, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hit.userData.nodeId = id;
    object.add(hit);
    this.pickables.push(hit);

    let pivot = null;
    if (orbit) {
      pivot = new THREE.Group();
      pivot.rotation.set(orbit.tilt || 0, 0, orbit.tiltZ || 0);
      pivot.add(object);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(orbit.radius - 0.08, orbit.radius + 0.08, 160),
        new THREE.MeshBasicMaterial({ color: 0xc8d6ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      pivot.add(ring);
      this.scene.add(pivot);
    } else {
      this.scene.add(object);
    }
    const node = { id, object, pivot, label, sub, focusDist, radius, orbit, scale: 1 };
    this.nodes.push(node);
    return node;
  }

  buildLabels() {
    if (!this.labelsEl) return;
    this.nodes.forEach((node) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `space-label label-${node.id}`;
      el.innerHTML = '<span class="space-label-dot"></span><span class="space-label-text"><strong></strong><small></small></span>';
      el.querySelector('strong').textContent = node.label;
      el.querySelector('small').textContent = node.sub;
      el.addEventListener('click', () => this.onSelect?.(node.id));
      el.addEventListener('pointerenter', () => this.setHovered(node));
      el.addEventListener('pointerleave', () => this.setHovered(null));
      this.labelsEl.appendChild(el);
      node.labelEl = el;
    });
  }

  /* ---------- controls ---------- */
  bindControls() {
    const c = this.canvas;
    const pointers = new Map();
    let downPos = null, moved = 0, pinchDist = 0;

    const ndc = (e) => {
      const rect = c.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };

    c.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      c.setPointerCapture(e.pointerId);
      downPos = { x: e.clientX, y: e.clientY };
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      this.rig.lastInteract = this.time;
    });

    c.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.mouse.copy(ndc(e));
      const p = pointers.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') this.pick(ndc(e), true); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.zoom(pinchDist / d);
        pinchDist = d;
        moved += 10;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      this.rig.thetaGoal -= dx * 0.0055;
      this.rig.phiGoal = THREE.MathUtils.clamp(this.rig.phiGoal - dy * 0.0045, 0.35, 2.5);
      this.rig.lastInteract = this.time;
    });

    const up = (e) => {
      const had = pointers.delete(e.pointerId);
      if (had && pointers.size === 0 && moved < 8 && downPos) {
        const id = this.pick(ndc(e), false);
        if (id) this.onSelect?.(id);
      }
      if (pointers.size < 2) pinchDist = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); pinchDist = 0; });
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.mouse.set(0, 0); this.setHovered(null); } });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(1 + Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0012));
      this.rig.lastInteract = this.time;
    }, { passive: false });
  }

  zoom(f) {
    const min = this.rig.focus ? this.rig.focus.focusDist * 0.55 : 30;
    this.rig.rGoal = THREE.MathUtils.clamp(this.rig.rGoal * f, min, 240);
  }

  pick(v, hoverOnly) {
    this.raycaster.setFromCamera(v, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    const node = hit ? this.nodes.find((n) => n.id === hit.object.userData.nodeId) : null;
    if (hoverOnly) this.setHovered(node);
    return node?.id || null;
  }

  setHovered(node) {
    if (this.hovered === node) return;
    this.hovered?.labelEl?.classList.remove('hover');
    this.hovered = node;
    node?.labelEl?.classList.add('hover');
    this.canvas.style.cursor = node ? 'pointer' : 'grab';
    if (node) this.onHover?.(node.id);
  }

  /* ---------- navigation API ---------- */
  flyTo(id) {
    const node = this.nodes.find((n) => n.id === id);
    if (!node) return;
    this.rig.focus = node;
    this.rig.rGoal = node.focusDist;
    this.rig.phiGoal = THREE.MathUtils.clamp(this.rig.phiGoal, 0.9, 1.45);
    this.rig.lastInteract = this.time;
    this.labelsEl?.classList.add('focused');
    this.nodes.forEach((n) => n.labelEl?.classList.toggle('active', n === node));
  }

  flyHome() {
    this.rig.focus = null;
    this.rig.targetGoal.set(0, 0, 0);
    this.rig.rGoal = this.homeDistance();
    this.labelsEl?.classList.remove('focused');
    this.nodes.forEach((n) => n.labelEl?.classList.remove('active'));
  }

  homeDistance() { return this.camera.aspect < 0.8 ? 98 : 74; }

  setPaused(p) {
    if (p === this.paused) return;
    this.paused = p;
    if (p) {
      cancelAnimationFrame(this._raf);
      this.labelsEl?.classList.add('paused');
    } else {
      this.clock.getDelta();
      this.labelsEl?.classList.remove('paused');
      if (this.built) this._raf = requestAnimationFrame(this._loop);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.fov = this.camera.aspect < 0.8 ? 68 : 55;
    const ins = this.viewInsets?.() || { top: 0, bottom: 0 };
    const shift = Math.round((ins.top - ins.bottom) / 2);
    if (shift) this.camera.setViewOffset(w, h, 0, -shift, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.size = { w, h };
    if (this.holding) return;
    if (!this.rig.focus) this.rig.rGoal = this.homeDistance();
  }

  // Cinematic fly-in from deep space (called when the intro overlay lifts).
  reveal() {
    this.covered = false;
    if (!this.holding) return;
    this.holding = false;
    const rig = this.rig;
    rig.rGoal = this.homeDistance();
    rig.thetaGoal = 0.5;
    rig.phiGoal = 1.12;
    rig.lastInteract = this.time + 2;
    // Calm mode: no sweeping fly-in, start at the home view.
    if (this.calm) { rig.r = rig.rGoal; rig.theta = rig.thetaGoal; rig.phi = rig.phiGoal; }
  }

  setCalm(calm) { this.calm = calm; }

  /* ---------- frame loop ---------- */
  _loop() {
    if (this.paused || !this.built) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.covered) return; // hidden behind the opening sequence
    this.time += dt;
    this.update(dt, this.time);
    this.renderFrame(dt);
  }

  renderFrame(dt = 0) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  update(dt, t) {
    this.starUniforms.uTime.value = t;
    this.sun.uniforms.uTime.value = t;
    this.backdrop.earth.surface.rotation.y = t * 0.012;
    if (this.backdrop.earth.clouds) this.backdrop.earth.clouds.rotation.y = t * 0.017;
    this.belt.rotation.y = t * 0.004;

    // Station
    this.station.spin.rotation.y = t * 0.16;
    this.station.group.rotation.y = t * 0.015;
    this.navLights.forEach((l) => {
      const on = ((t + l.offset) % l.period) < (l.period > 2 ? 0.12 : 0.7);
      l.bulb.visible = on;
      l.halo.material.opacity = on ? 0.95 : 0;
    });

    // Orbits
    for (const n of this.nodes) {
      if (n.orbit) {
        const a = n.orbit.phase + t * n.orbit.speed;
        n.object.position.set(Math.cos(a) * n.orbit.radius, 0, Math.sin(a) * n.orbit.radius);
      }
      const goal = this.hovered === n ? 1.12 : 1;
      n.scale += (goal - n.scale) * Math.min(1, dt * 8);
      n.object.scale.setScalar(n.scale);
    }
    this.mc.planet.rotation.y = t * 0.12;
    this.mc.clouds.rotation.y = t * 0.05;
    this.mc.beam.material.opacity = 0.18 + Math.sin(t * 2.4) * 0.05;
    this.mc.beacon.rotation.y = t * 0.8;
    this.arcade.planet.rotation.y = t * 0.08;
    this.arcade.moons.forEach((m) => { m.pivot.rotation.y = t * m.speed; });
    this.comms.planet.rotation.y = t * 0.1;
    this.comms.satPivot.rotation.y = t * 0.3;
    this.comms.sat.rotation.y = -t * 0.3;
    this.comms.blink.visible = (t % 1.4) < 0.15;

    // Camera rig
    const rig = this.rig;
    if (rig.focus) rig.focus.object.getWorldPosition(rig.targetGoal);
    else if (this.holding) rig.thetaGoal += dt * 0.05;
    else if (t - rig.lastInteract > 5) rig.thetaGoal += dt * 0.03;
    const kT = 1 - Math.exp(-dt * (rig.focus ? 3.2 : 2.2));
    const kR = 1 - Math.exp(-dt * 2.4);
    const kA = 1 - Math.exp(-dt * 6);
    rig.target.lerp(rig.targetGoal, kT);
    rig.r += (rig.rGoal - rig.r) * kR;
    rig.theta += (rig.thetaGoal - rig.theta) * kA;
    rig.phi += (rig.phiGoal - rig.phi) * kA;
    this.mouseSmooth.lerp(this.mouse, 1 - Math.exp(-dt * 3));

    const sp = Math.sin(rig.phi);
    this.camera.position.set(
      rig.target.x + rig.r * sp * Math.sin(rig.theta),
      rig.target.y + rig.r * Math.cos(rig.phi),
      rig.target.z + rig.r * sp * Math.cos(rig.theta),
    );
    this.camera.lookAt(rig.target);
    // Mouse parallax: shift the camera slightly along its own right/up axes.
    const par = this.calm ? 0 : rig.r * 0.045;
    this.camera.translateX(this.mouseSmooth.x * par);
    this.camera.translateY(this.mouseSmooth.y * par * 0.6);
    this.camera.lookAt(rig.target);

    this.updateLabels();
  }

  updateLabels() {
    if (!this.labelsEl || !this.size) return;
    this._labelTick = (this._labelTick || 0) + 1;
    const placed = [];
    const v = new THREE.Vector3();
    for (const n of this.nodes) {
      if (!n.labelEl) continue;
      n.object.getWorldPosition(v);
      v.y += n.radius * n.scale + 1.2;
      v.project(this.camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
      n.labelEl.classList.toggle('offscreen', !visible);
      if (!visible) continue;
      let x = (v.x * 0.5 + 0.5) * this.size.w;
      let y = (-v.y * 0.5 + 0.5) * this.size.h;
      if (!n.labelSize || this._labelTick % 30 === 0) n.labelSize = [n.labelEl.offsetWidth, n.labelEl.offsetHeight];
      const [lw, lh] = n.labelSize;
      x = Math.min(Math.max(x, lw / 2 + 6), this.size.w - lw / 2 - 6);
      y = Math.max(y, lh + 6);
      n._rawY = y;
      placed.push({ n, x, y, w: lw, h: lh });
    }
    // Resolve overlaps: push lower labels further down, then ease toward the target so nothing jumps.
    placed.sort((a, b) => a.y - b.y);
    for (let i = 0; i < placed.length; i++) {
      const cur = placed[i];
      for (let j = 0; j < i; j++) {
        const o = placed[j];
        if (Math.abs(cur.x - o.x) < (cur.w + o.w) / 2 + 4 && Math.abs(cur.y - o.y) < cur.h + 4) cur.y = o.y + cur.h + 4;
      }
      const off = cur.y - cur.n._rawY;
      cur.n._off = (cur.n._off || 0) + (off - (cur.n._off || 0)) * 0.3;
      const y = cur.n._rawY + cur.n._off;
      cur.n.labelEl.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  }
}
