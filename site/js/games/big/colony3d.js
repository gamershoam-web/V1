// Orbit Colony in 3D: the home asteroid with every building standing on its levelled plateau,
// drones ferrying ore and ice from a tumbling rock field, a ringed gas giant and the Milky Way behind.
// Tap the asteroid to mine, drag to look around. colony.js falls back to its 2D view without WebGL.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSkyCubeAsync, makePlanet, makeAsteroidGeometries, glowTexture, makeGlowSprite, seededRandom, canvasTexture } from '../../space-assets.js';
import { buildPlayerShip } from './models.js';

const TAU = Math.PI * 2;
const SUN_DIR = new THREE.Vector3(-0.5, 0.62, 0.6).normalize();
const PLATEAU = 0.5;               // height (unit sphere) where the top is levelled for building
const SHAPE = new THREE.Vector3(1.45, 0.95, 1.2);

// Where each kind of building stands on the plateau (x, z), in visual order; extra copies beyond the slots aren't drawn.
const SLOTS = {
  command: [[-0.1, 0.02]],
  solar: [[-0.86, -0.3], [-0.66, -0.44], [-0.44, -0.52], [-0.95, -0.06], [-0.22, -0.56], [-0.88, 0.18], [0.0, -0.58], [-0.7, 0.36]],
  drone: [[0.24, 0.06]],
  habitat: [[-0.46, 0.26], [-0.24, 0.42], [0.0, 0.46], [0.22, 0.4], [-0.62, 0.48]],
  lab: [[0.2, -0.42], [0.4, -0.48]],
  refinery: [[0.6, -0.3], [0.78, -0.12]],
  harvester: [[0.86, 0.12], [0.74, 0.34], [0.9, -0.3]],
  cargo: [[0.46, 0.24], [0.6, 0.4], [0.5, 0.04], [0.4, 0.56], [0.68, 0.18], [0.24, 0.62]],
  port: [[-0.5, -0.12]],
  reactor: [[0.02, -0.3]],
};

function mats() {
  const grid = canvasTexture(64, 32, (g) => {
    g.fillStyle = '#16307a'; g.fillRect(0, 0, 64, 32);
    g.strokeStyle = 'rgba(170,205,255,0.55)'; g.lineWidth = 1;
    for (let x = 0; x <= 64; x += 8) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 32); g.stroke(); }
    for (let y = 0; y <= 32; y += 8) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(64, y + 0.5); g.stroke(); }
  });
  return {
    hull: new THREE.MeshStandardMaterial({ color: 0xdfe4ec, metalness: 0.55, roughness: 0.32 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.6, roughness: 0.45 }),
    mast: new THREE.MeshStandardMaterial({ color: 0x9aa6b8, metalness: 0.8, roughness: 0.35 }),
    panel: new THREE.MeshStandardMaterial({ map: grid, metalness: 0.55, roughness: 0.25, emissive: 0x1a3a9a, emissiveIntensity: 0.55, emissiveMap: grid }),
    glass: new THREE.MeshStandardMaterial({ color: 0xd8ecff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.42, depthWrite: false, envMapIntensity: 2 }),
    warm: new THREE.MeshBasicMaterial({ color: 0xffd39a }),
    window: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd9a0, emissiveIntensity: 1.6 }),
    red: new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff2233, emissiveIntensity: 2.4 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 2.2 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xf97316, emissiveIntensity: 2.2 }),
    purple: new THREE.MeshStandardMaterial({ color: 0xc4b5fd, emissive: 0x8b5cf6, emissiveIntensity: 2.2 }),
    green: new THREE.MeshStandardMaterial({ color: 0x86efac, emissive: 0x22c55e, emissiveIntensity: 2 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xeab308, emissiveIntensity: 1.8 }),
    crateA: new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.4, roughness: 0.5 }),
    crateB: new THREE.MeshStandardMaterial({ color: 0x14b8a6, metalness: 0.4, roughness: 0.5 }),
    crateC: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.4, roughness: 0.5 }),
  };
}

/* ------------------------------------------------------------------ the home asteroid */
function makeHomeAsteroid(lite) {
  const rand = seededRandom(31);
  const waves = Array.from({ length: 8 }, () => {
    const d = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    return { d, f: 1.6 + rand() * 3.8, p: rand() * TAU, a: 0.04 + rand() * 0.07 };
  });
  const craters = Array.from({ length: 12 }, () => {
    let d;
    do { d = new THREE.Vector3(rand() * 2 - 1, rand() * 1.6 - 1.1, rand() * 2 - 1).normalize(); } while (d.y > 0.25);
    return { d, r: 0.16 + rand() * 0.22, depth: 0.05 + rand() * 0.06 };
  });
  const geo = new THREE.SphereGeometry(1, lite ? 84 : 128, lite ? 56 : 84);
  const pos = geo.attributes.position, v = new THREE.Vector3(), colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0xa49b91), side = new THREE.Color(0x7a7068), deep = new THREE.Color(0x4a433d), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1;
    for (const w of waves) r += w.a * Math.sin(w.f * v.dot(w.d) + w.p);
    let dent = 0;
    for (const k of craters) {
      const ang = Math.acos(Math.min(1, v.dot(k.d)));
      if (ang < k.r) { const q = ang / k.r; r -= k.depth * (1 - q * q); dent = Math.max(dent, 1 - q); }
      else if (ang < k.r * 1.35) r += k.depth * 0.35 * (1 - (ang - k.r) / (k.r * 0.35));
    }
    let x = v.x * r * SHAPE.x, y = v.y * r * SHAPE.y, z = v.z * r * SHAPE.z;
    const plateau = PLATEAU * SHAPE.y;
    let flat = 0;
    // level the top with a rounded rim (smooth blend instead of a sharp edge)
    const k = THREE.MathUtils.smoothstep(y, plateau - 0.14, plateau + 0.1);
    if (k > 0) {
      const levelled = plateau + (y - plateau) * 0.14 + 0.006 * Math.sin(x * 23) * Math.cos(z * 19);
      y = y + (Math.min(y, levelled) - y) * k;
      flat = k;
    }
    pos.setXYZ(i, x, y, z);
    c.copy(side).lerp(top, flat).lerp(deep, dent * 0.8);
    c.multiplyScalar(0.92 + rand() * 0.14);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // fine rocky detail as a bump map
  const bump = canvasTexture(512, 256, (g) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 1400; i++) {
      const x = rand() * 512, y = rand() * 256, r = 1 + Math.pow(rand(), 3) * 9;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = rand() < 0.6;
      grd.addColorStop(0, dark ? 'rgba(40,40,40,0.55)' : 'rgba(210,210,210,0.45)'); grd.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  }, false);
  bump.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.04, bumpMap: bump, bumpScale: 0.9, envMapIntensity: 0.35 });
  return new THREE.Mesh(geo, mat);
}

/* ------------------------------------------------------------------ building models (origin at ground level) */
const B = {
  command(M) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.12, 0.2, 3, 0.03), M.hull); body.position.y = 0.06;
    const deck = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.07, 0.14, 2, 0.02), M.hull); deck.position.set(-0.03, 0.15, 0);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.022, 0.005), M.window); strip.position.set(0, 0.07, 0.1);
    const strip2 = strip.clone(); strip2.position.z = -0.1;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6), M.mast); mast.position.set(0.11, 0.2, 0);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), M.red); light.position.set(0.11, 0.29, 0);
    g.add(body, deck, strip, strip2, mast, light);
    g.userData.blink = { mesh: light, period: 1.4, on: 0.15 };
    return g;
  },
  solar(M) {
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.14, 6), M.mast); mast.position.y = 0.07;
    const pivot = new THREE.Group(); pivot.position.y = 0.15;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.008, 0.14), M.panel);
    pivot.add(panel);
    // lean back toward the sky (and the camera) so the cells catch the light
    pivot.rotation.set(0.62, 0.35, 0, 'YXZ');
    g.add(mast, pivot);
    g.userData.panel = panel;
    return g;
  },
  habitat(M) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.105, 0.025, 24), M.dark); ring.position.y = 0.012;
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), M.warm); inner.position.y = 0.04;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 12, 0, TAU, 0, Math.PI / 2), M.glass); dome.position.y = 0.024;
    const lamps = new THREE.Mesh(new THREE.TorusGeometry(0.096, 0.004, 6, 32), M.window); lamps.rotation.x = Math.PI / 2; lamps.position.y = 0.026;
    g.add(ring, inner, dome, lamps);
    return g;
  },
  lab(M) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 12), M.hull); base.position.y = 0.03;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), M.mast); mast.position.y = 0.12;
    const head = new THREE.Group(); head.position.y = 0.18;
    const pts = Array.from({ length: 8 }, (_, i) => new THREE.Vector2(0.004 + (i / 7) * 0.075, Math.pow(i / 7, 2) * 0.04));
    const dish = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshStandardMaterial({ color: 0xe8edf4, metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide }));
    dish.rotation.x = -0.9;
    const feed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M.purple); feed.position.set(0, 0.035, 0.03);
    head.add(dish, feed);
    g.add(base, mast, head);
    g.userData.spin = head;
    g.userData.blink = { mesh: feed, period: 2, on: 1 };
    return g;
  },
  refinery(M) {
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.32, 14), M.dark); tower.position.y = 0.16;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 24), M.orange); band.rotation.x = Math.PI / 2; band.position.y = 0.22;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.04, 12), M.hull); cap.position.y = 0.34;
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), M.hull); tank.position.set(0.08, 0.05, 0.03);
    g.add(tower, band, cap, tank);
    g.userData.smoke = new THREE.Vector3(0, 0.37, 0);
    return g;
  },
  harvester(M) {
    const g = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16), M.hull); tank.position.y = 0.08;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, TAU, 0, Math.PI / 2), M.hull); top.position.y = 0.16;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.008, 6, 24), M.cyan); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), M.mast); pipe.position.set(-0.07, 0.05, 0); pipe.rotation.z = 0.9;
    g.add(tank, top, ring, pipe);
    return g;
  },
  cargo(M) {
    const g = new THREE.Group();
    const mats = [M.crateA, M.crateB, M.crateC];
    [[0, 0.03, 0, 0], [0, 0.09, 0, 1], [0.0, 0.03, 0.07, 2]].forEach(([x, y, z, k]) => {
      const box = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.06, 0.06, 1, 0.008), mats[k]);
      box.position.set(x, y, z); g.add(box);
    });
    return g;
  },
  drone(M) {
    const g = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 18, 1, false, 0, Math.PI), M.hull);
    roof.rotation.set(0, 0, Math.PI / 2); roof.rotation.order = 'ZYX'; roof.position.y = 0;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), M.green); door.position.set(0, 0.03, 0.101);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 16), M.dark); pad.position.set(0, 0.005, 0.16);
    const padRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 6, 24), M.green); padRing.rotation.x = Math.PI / 2; padRing.position.set(0, 0.012, 0.16);
    g.add(roof, door, pad, padRing);
    g.userData.launch = new THREE.Vector3(0, 0.03, 0.16);
    return g;
  },
  port(M) {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.02, 32), M.dark); pad.position.y = 0.01;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.006, 6, 40), M.yellow); ring.rotation.x = Math.PI / 2; ring.position.y = 0.022;
    g.add(pad, ring);
    const lights = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), M.yellow);
      l.position.set(Math.cos(a) * 0.15, 0.026, Math.sin(a) * 0.15); g.add(l); lights.push(l);
    }
    g.userData.chase = lights;
    return g;
  },
  reactor(M, glowTex) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.05, 20), M.dark); base.position.y = 0.025;
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 12, 32), M.hull); torus.position.y = 0.11; torus.rotation.x = Math.PI / 2;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), M.cyan); core.position.y = 0.11;
    const halo = makeGlowSprite(glowTex, 0x67e8f9, 0.35, 0.8); halo.position.y = 0.11;
    g.add(base, torus, core, halo);
    g.userData.pulse = { core, halo, torus };
    return g;
  },
};

/* ------------------------------------------------------------------ view */
export class ColonyView3D {
  static create(host, colony) {
    try { return new ColonyView3D(host, colony); } catch (e) { console.warn('3D colony view unavailable:', e); return null; }
  }

  constructor(host, colony) {
    this.host = host;
    this.colony = colony;
    this.lite = document.documentElement.classList.contains('lite');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'col-canvas col-gl';
    host.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.lite, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lite ? 1.4 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x02030a, 1);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
    this.glowTex = glowTexture();
    this.M = mats();
    this.time = 0;
    this.items = {};         // building type -> [Group]
    this.drones = [];
    this.particles = [];
    this.smoke = [];
    this.meteors = [];
    this.view = { az: 0, el: 0, azGoal: 0, elGoal: 0, idle: 0 };
    this.target = new THREE.Vector3(0.05, 0.22, 0.05);

    this.hint = document.createElement('span');
    this.hint.className = 'col-hint';
    this.hint.textContent = 'Tap the asteroid to mine';
    this.hint.hidden = true;
    host.appendChild(this.hint);
    this.hintAt = new THREE.Vector3(0.1, -0.35, 0.6);

    this.buildWorld();
    this.bindInput();
    this.resize();
    this.buildSky();
  }

  buildWorld() {
    const s = this.scene;
    const sun = new THREE.DirectionalLight(0xfff1dc, 3.1); sun.position.copy(SUN_DIR).multiplyScalar(20);
    this.sunLight = sun;
    s.add(sun, new THREE.HemisphereLight(0x8aa2d8, 0x1b130d, 0.5), new THREE.AmbientLight(0x404a66, 0.35));
    this.alertLight = new THREE.PointLight(0xff3355, 0, 12); this.alertLight.position.set(0, 2.5, 2); s.add(this.alertLight);
    const sunGlow = makeGlowSprite(this.glowTex, 0xffe6c0, 22, 0.95); sunGlow.position.copy(SUN_DIR).multiplyScalar(70);
    this.sunGlow = sunGlow; s.add(sunGlow);

    // home asteroid
    this.rock = makeHomeAsteroid(this.lite);
    s.add(this.rock);
    this.rock.updateMatrixWorld();

    // rock field to mine
    const geos = makeAsteroidGeometries(4, 21);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8178, roughness: 0.95, flatShading: true, envMapIntensity: 0.3 });
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfe9f5, roughness: 0.4, metalness: 0.1, flatShading: true, emissive: 0x0d3b4a, emissiveIntensity: 0.4 });
    const rand = seededRandom(77);
    this.field = Array.from({ length: 12 }, (_, i) => {
      const a = -0.85 + (i / 11) * 2.3 + (rand() - 0.5) * 0.25, rr = 2.6 + rand() * 1.4;
      const m = new THREE.Mesh(geos[i % geos.length], i % 4 === 3 ? iceMat : rockMat);
      m.position.set(Math.sin(a) * rr + 0.6, -0.5 + rand() * 1.4, -Math.cos(a) * rr * 0.9);
      m.scale.setScalar(0.08 + rand() * 0.16);
      m.userData.spin = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.6);
      m.userData.ice = i % 4 === 3;
      s.add(m);
      return m;
    });

    // ringed gas giant
    try {
      const giant = makePlanet(this.renderer, { type: 'gas', radius: 6, seed: 12, palette: 'jupiter', rings: true, sunDir: SUN_DIR, size: this.lite ? 256 : 512, segments: 48 });
      giant.group.position.set(-1, 8.5, -32);
      giant.group.rotation.set(0.35, 0, 0.32);
      s.add(giant.group);
      this.giant = giant;
    } catch (e) { console.warn(e); }

    // particles (mining dust, sparkles)
    const N = 260;
    this.pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3);
    this.pCol = new Float32Array(N * 3);
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pGeo.setDrawRange(0, 0);
    const pts = new THREE.Points(this.pGeo, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    s.add(pts);
    this.pool = Array.from({ length: N }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() }));

    // orbital shipyard (shown once built)
    const yard = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.012, 8, 48), this.M.mast);
    const frame2 = frame.clone(); frame2.position.z = 0.22;
    const frame3 = frame.clone(); frame3.position.z = -0.22; frame3.visible = false;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.5), this.M.mast);
    [[0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]].forEach(([x, y]) => { const b = beam.clone(); b.position.set(x, y, 0); yard.add(b); });
    yard.add(frame, frame2, frame3);
    const shipGroup = buildPlayerShip(this.glowTex).group;
    shipGroup.scale.setScalar(0.042); shipGroup.rotation.y = Math.PI;
    yard.add(shipGroup);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), this.M.cyan); beacon.position.set(0, 0.34, 0); yard.add(beacon);
    yard.position.set(0.85, 1.35, -0.35);
    yard.rotation.set(0.15, -0.7, 0.1);
    yard.scale.setScalar(0.75);
    yard.visible = false;
    s.add(yard);
    this.yard = { group: yard, ship: shipGroup, beacon };
  }

  async buildSky() {
    try {
      const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const sky = await createSkyCubeAsync(this.renderer, { size: this.lite ? 384 : 768, seed: 23 }, nextFrame);
      if (this.disposed) return;
      this.scene.background = sky;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromCubemap(sky).texture;
      pmrem.dispose();
    } catch (e) { console.warn(e); }
  }

  surfaceY(x, z) {
    if (!this.ray) this.ray = new THREE.Raycaster();
    this.ray.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
    const hit = this.ray.intersectObject(this.rock, false)[0];
    return hit ? hit.point.y : PLATEAU * SHAPE.y;
  }

  // Add or remove building models so the scene matches the colony's building counts.
  syncBuildings(animate) {
    for (const [type, slots] of Object.entries(SLOTS)) {
      const want = type === 'command' ? 1 : Math.min(slots.length, this.colony.count(type)); // the command module is always there
      const list = this.items[type] || (this.items[type] = []);
      while (list.length < want) {
        const [x, z] = slots[list.length];
        const m = B[type](this.M, this.glowTex);
        m.position.set(x, this.surfaceY(x, z) - 0.006, z);
        m.rotation.y = type === 'solar' ? 0 : (x * 0.6 + z) * 0.4;
        m.userData.grow = animate ? 0 : 1;
        m.scale.setScalar(animate ? 0.001 : 1);
        this.scene.add(m);
        list.push(m);
        if (animate) this.sparkle(m.position, type === 'solar' ? 0x93c5fd : 0x67e8f9, 40);
      }
      while (list.length > want) this.scene.remove(list.pop());
    }
    const yards = this.colony.count('shipyard');
    this.yard.group.visible = yards > 0;
    this.yard.ship.visible = yards > 0 && this.colony.s.expeditions.length < yards;
  }

  bindInput() {
    let down = null;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, az: this.view.azGoal, el: this.view.elGoal, moved: false, id: e.pointerId };
      try { c.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    });
    c.addEventListener('pointermove', (e) => {
      if (!down || down.id !== e.pointerId) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.moved && Math.hypot(dx, dy) > 8) down.moved = true;
      if (down.moved) {
        this.view.azGoal = THREE.MathUtils.clamp(down.az - dx * 0.008, -1.4, 1.4);
        this.view.elGoal = THREE.MathUtils.clamp(down.el + dy * 0.005, -0.45, 0.4);
        this.view.idle = 0;
      }
    });
    const up = (e) => {
      if (!down || down.id !== e.pointerId) return;
      const wasTap = !down.moved;
      down = null;
      if (wasTap && e.type === 'pointerup') this.tap(e);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  tap(e) {
    const r = this.canvas.getBoundingClientRect();
    const nd = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!this.ray) this.ray = new THREE.Raycaster();
    this.ray.setFromCamera(nd, this.camera);
    const hit = this.ray.intersectObject(this.rock, false)[0];
    if (!hit) return;
    this.colony.mineByHand(e.clientX - r.left, e.clientY - r.top);
    this.sparkle(hit.point, 0xd6c6b0, 18, hit.face?.normal);
  }

  sparkle(at, color, n = 20, normal = null) {
    const col = new THREE.Color(color);
    for (let i = 0, made = 0; i < this.pool.length && made < n; i++) {
      const p = this.pool[i];
      if (p.life > 0) continue;
      p.life = 0.6 + Math.random() * 0.5;
      p.p.copy(at);
      p.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).multiplyScalar(1.1);
      if (normal) p.v.addScaledVector(normal, 0.6);
      p.c.copy(col);
      made++;
    }
  }

  // "+12 ore" style labels; x, y in view pixels (defaults to just above the command module)
  floatText(text, color, x, y) {
    if (x == null) {
      const v = new THREE.Vector3(-0.1, 0.75, 0).project(this.camera);
      x = (v.x * 0.5 + 0.5) * this.w; y = (-v.y * 0.5 + 0.5) * this.h;
    }
    const el = document.createElement('span');
    el.className = 'col-float';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.host.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  celebrate(id) {
    this.syncBuildings(true);
    this.lastSync = this.time;
    const list = this.items[id];
    if (list?.length) this.sparkle(list[list.length - 1].position, 0x86efac, 30);
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  frame(dt) {
    const t = (this.time += dt), col = this.colony, s = col.s;
    if (!this.synced) { this.syncBuildings(false); this.synced = true; this.lastSync = t; }
    else if (t - this.lastSync > 0.4) { this.syncBuildings(true); this.lastSync = t; }

    // camera: gentle drift plus the player's drag; eases back after a while
    const v = this.view;
    v.idle += dt;
    if (v.idle > 5) { v.azGoal *= 1 - Math.min(1, dt * 0.6); v.elGoal *= 1 - Math.min(1, dt * 0.6); }
    v.az += (v.azGoal - v.az) * Math.min(1, dt * 5);
    v.el += (v.elGoal - v.el) * Math.min(1, dt * 5);
    const aspect = this.w / this.h;
    const dist = aspect < 0.9 ? 6.6 : aspect < 1.3 ? 5.5 : aspect < 1.8 ? 4.9 : 4.6;
    const az = 0.38 + Math.sin(t * 0.06) * 0.22 + v.az;
    const el = 0.56 + Math.sin(t * 0.045) * 0.04 + v.el;
    this.camera.position.set(this.target.x + Math.sin(az) * Math.cos(el) * dist, this.target.y + Math.sin(el) * dist, this.target.z + Math.cos(az) * Math.cos(el) * dist);
    this.camera.lookAt(this.target);

    this.rock.rotation.y = 0; // the colony stays put; the world turns around it via the camera
    for (const m of this.field) { m.rotation.x += m.userData.spin.x * dt; m.rotation.y += m.userData.spin.y * dt; }
    if (this.giant) this.giant.surface.rotation.y = t * 0.03;

    // building life
    const flare = col.flare() > 1;
    this.M.panel.emissive.setHex(flare ? 0xb8860b : 0x1a3a9a);
    this.sunLight.intensity = flare ? 4.2 : 3.1;
    this.sunGlow.scale.setScalar(flare ? 30 + Math.sin(t * 6) * 2 : 22);
    for (const [type, list] of Object.entries(this.items)) {
      for (const m of list) {
        if (m.userData.grow < 1) { m.userData.grow = Math.min(1, m.userData.grow + dt * 2.2); const k = m.userData.grow; m.scale.setScalar(Math.max(0.001, 1 + Math.sin(k * Math.PI) * 0.25 * (1 - k)) * k + (1 - k) * 0.001); }
        const u = m.userData;
        if (u.blink) u.blink.mesh.visible = (t % u.blink.period) < u.blink.on;
        if (u.spin) u.spin.rotation.y = Math.sin(t * 0.35 + m.position.x * 3) * 1.2;
        if (u.pulse) { const k = 0.75 + Math.sin(t * 3 + m.position.x) * 0.25; u.pulse.core.scale.setScalar(k); u.pulse.halo.material.opacity = 0.5 + k * 0.4; u.pulse.torus.rotation.z = t * 0.6; }
        if (u.chase) u.chase.forEach((l, i) => { l.visible = Math.floor(t * 4) % 4 === i; });
        if (u.smoke && Math.random() < dt * 5) {
          const at = u.smoke.clone().multiply(m.scale).add(m.position);
          const p = this.pool.find((q) => q.life <= 0);
          if (p) { p.life = 1.6; p.p.copy(at); p.v.set((Math.random() - 0.5) * 0.06, 0.18 + Math.random() * 0.1, (Math.random() - 0.5) * 0.06); p.c.setRGB(0.32, 0.34, 0.38); }
        }
      }
    }
    if (this.yard.group.visible) {
      this.yard.group.position.y = 1.35 + Math.sin(t * 0.7) * 0.03;
      this.yard.beacon.visible = (t % 1.2) < 0.18;
      this.yard.ship.visible = s.expeditions.length < col.count('shipyard');
    }

    // drones: green carry ore, cyan carry ice
    const want = Math.min(16, col.count('drone') + col.count('harvester'));
    while (this.drones.length < want) {
      const ice = this.drones.length >= col.count('drone');
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), ice ? this.M.cyan : this.M.green);
      m.add(makeGlowSprite(this.glowTex, ice ? 0x67e8f9 : 0x4ade80, 0.22, 0.95));
      this.scene.add(m);
      const rocks = this.field.filter((f) => f.userData.ice === ice);
      this.drones.push({ m, k: Math.random(), speed: 0.12 + Math.random() * 0.1, target: rocks[Math.floor(Math.random() * rocks.length)] || this.field[0], ice });
    }
    while (this.drones.length > want) this.scene.remove(this.drones.pop().m);
    const eff = col.rates().eff;
    const bay = this.items.drone?.[0];
    const from = bay ? bay.userData.launch.clone().add(bay.position) : new THREE.Vector3(0.26, 0.4, 0.2);
    const mid = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const d of this.drones) {
      d.k += dt * d.speed * (0.4 + 0.6 * eff);
      if (d.k > 1) { d.k -= 1; const rocks = this.field.filter((f) => f.userData.ice === d.ice); d.target = rocks[Math.floor(Math.random() * rocks.length)] || d.target; }
      const p = d.k < 0.5 ? d.k * 2 : (1 - d.k) * 2;
      const to = d.target.position;
      mid.copy(from).add(to).multiplyScalar(0.5); mid.y += 0.9;
      a.copy(from).lerp(mid, p); b.copy(mid).lerp(to, p);
      d.m.position.copy(a.lerp(b, p));
    }

    // events
    if (col.meteorFx > 0) {
      col.meteorFx -= dt;
      if (Math.random() < dt * 9) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.002, 0.6, 5), new THREE.MeshBasicMaterial({ color: 0xfdba74, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        const start = new THREE.Vector3(-2 + Math.random() * 6, 3.5, -2 + Math.random() * 3);
        m.position.copy(start);
        const vel = new THREE.Vector3(-0.6, -3.2, 0.4);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vel.clone().negate().normalize());
        this.scene.add(m);
        this.meteors.push({ m, vel, life: 1.6 });
      }
    }
    this.meteors = this.meteors.filter((o) => {
      o.life -= dt; o.m.position.addScaledVector(o.vel, dt);
      if (o.life <= 0) { this.scene.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); return false; }
      return true;
    });
    if (col.pirateFx > 0) { col.pirateFx -= dt; this.alertLight.intensity = 6 + Math.sin(t * 14) * 4; } else this.alertLight.intensity = 0;
    this.host.classList.toggle('col-alert', col.pirateFx > 0);

    // particles
    let n = 0;
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= dt * 0.35;
      p.p.addScaledVector(p.v, dt);
      const fade = Math.max(0, Math.min(1, p.life));
      this.pPos.set([p.p.x, p.p.y, p.p.z], n * 3);
      this.pCol.set([p.c.r * fade, p.c.g * fade, p.c.b * fade], n * 3);
      n++;
    }
    this.pGeo.setDrawRange(0, n);
    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.color.needsUpdate = true;

    // new players: a pulsing hint pinned to the rock until they've mined a few times
    const showHint = s.clicks < 5;
    if (this.hint.hidden === showHint) this.hint.hidden = !showHint;
    if (showHint) {
      const p = this.hintAt.clone().project(this.camera);
      this.hint.style.transform = `translate(${((p.x * 0.5 + 0.5) * this.w).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * this.h).toFixed(1)}px) translate(-50%, -50%)`;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
    });
    if (this.scene.background?.isTexture) this.scene.background.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.hint.remove();
  }
}
