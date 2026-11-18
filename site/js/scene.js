// Three.js space environment: starfield, nebula, space station, orbiting sector planets, camera rig.
import * as THREE from '../vendor/three.module.min.js';

const TAU = Math.PI * 2;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const glowTex = () => canvasTexture(128, 128, (g) => {
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.14)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
});

const cloudTex = (seed) => canvasTexture(256, 256, (g) => {
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = 128 + (r() - 0.5) * 120, y = 128 + (r() - 0.5) * 120, rad = 30 + r() * 80;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(255,255,255,${0.06 + r() * 0.08})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  }
});

function planetTex(seed, palette, { bands = 14, spots = 40, glow = null } = {}) {
  return canvasTexture(512, 256, (g, w, h) => {
    const r = rng(seed);
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const n = Math.sin(t * bands * Math.PI + Math.sin(t * 7 + seed) * 2) * 0.5 + 0.5;
      const idx = Math.min(palette.length - 1, Math.floor(n * palette.length));
      g.fillStyle = palette[idx];
      g.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < spots; i++) {
      g.globalAlpha = 0.08 + r() * 0.18;
      g.fillStyle = palette[Math.floor(r() * palette.length)];
      g.beginPath();
      g.ellipse(r() * w, r() * h, 10 + r() * 50, 3 + r() * 10, 0, 0, TAU);
      g.fill();
    }
    if (glow) {
      g.globalAlpha = 0.7;
      g.strokeStyle = glow; g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const y = r() * h;
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  });
}

const ringTex = () => canvasTexture(512, 512, (g) => {
  const r = rng(7);
  for (let rad = 140; rad < 256; rad += 2) {
    const a = 0.15 + r() * 0.55;
    const hue = 260 + r() * 60;
    g.strokeStyle = `hsla(${hue},90%,${55 + r() * 20}%,${a})`;
    g.lineWidth = 2;
    g.beginPath(); g.arc(256, 256, rad, 0, TAU); g.stroke();
  }
});

export class SpaceScene {
  constructor(canvas, { labelsEl, onSelect, onHover, viewInsets, intro = false } = {}) {
    this.canvas = canvas;
    this.viewInsets = viewInsets;
    this.holding = intro;
    this.labelsEl = labelsEl;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.paused = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setClearColor(0x03020a, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.nodes = [];
    this.pickables = [];
    this.raycaster = new THREE.Raycaster();
    this.glow = glowTex();

    this.rig = {
      target: new THREE.Vector3(), targetGoal: new THREE.Vector3(),
      r: intro ? 760 : 320, rGoal: intro ? 760 : 82, theta: intro ? 2.6 : 0.9, thetaGoal: intro ? 2.6 : 0.5,
      phi: intro ? 0.55 : 1.12, phiGoal: intro ? 0.55 : 1.12,
      focus: null, lastInteract: 0,
    };
    this.mouse = new THREE.Vector2(); this.mouseSmooth = new THREE.Vector2();
    this.hovered = null;

    this.buildLights();
    this.buildStars();
    this.buildNebula();
    this.buildBackdrop();
    this.buildStation();
    this.buildMinecraftPlanet();
    this.buildArcadePlanet();
    this.buildCommsPlanet();
    this.buildLabels();
    this.bindControls();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  /* ---------- construction ---------- */
  buildLights() {
    this.scene.add(new THREE.AmbientLight(0x6b6bd6, 0.55));
    const sun = new THREE.DirectionalLight(0xfff1e0, 1.6);
    sun.position.set(-200, 120, 160);
    this.scene.add(sun);
    this.stationLight = new THREE.PointLight(0x22d3ee, 900, 140, 1.6);
    this.scene.add(this.stationLight);
  }

  buildStars() {
    const count = 6000, r = rng(42);
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const size = new Float32Array(count), phase = new Float32Array(count);
    const palette = [[1, 1, 1], [0.75, 0.85, 1], [1, 0.85, 0.95], [0.7, 1, 1], [1, 0.95, 0.8]];
    for (let i = 0; i < count; i++) {
      const u = r() * 2 - 1, th = r() * TAU, rad = 500 + r() * 1300, s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * rad, u * rad, Math.sin(th) * s * rad], i * 3);
      col.set(palette[Math.floor(r() * palette.length)], i * 3);
      size[i] = 1.2 + Math.pow(r(), 6) * 5;
      phase[i] = r() * TAU;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    this.starUniforms = { uTime: { value: 0 }, uPixel: { value: this.renderer.getPixelRatio() } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: `
        attribute float size; attribute float phase; attribute vec3 color;
        uniform float uTime; uniform float uPixel; varying vec3 vColor; varying float vTw;
        void main(){
          vColor = color;
          vTw = 0.55 + 0.45 * sin(uTime * (0.8 + phase * 0.4) + phase * 6.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uPixel * (900.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vTw;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * (0.6 + vTw), a * vTw);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  buildNebula() {
    this.nebula = new THREE.Group();
    const r = rng(9);
    const colors = [0x7c3aed, 0x22d3ee, 0xdb2777, 0x4f46e5, 0x9333ea];
    const textures = [cloudTex(1), cloudTex(2), cloudTex(3)];
    const clumps = [[-420, 120, -500], [480, -60, -380], [60, 260, 520], [-300, -200, 420]];
    clumps.forEach((c, ci) => {
      for (let i = 0; i < 14; i++) {
        const mat = new THREE.SpriteMaterial({
          map: textures[i % 3], color: colors[(ci + i) % colors.length],
          transparent: true, opacity: 0.35 + r() * 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const s = new THREE.Sprite(mat);
        s.position.set(c[0] + (r() - 0.5) * 320, c[1] + (r() - 0.5) * 180, c[2] + (r() - 0.5) * 320);
        const sc = 220 + r() * 320;
        s.scale.set(sc, sc, 1);
        mat.rotation = r() * TAU;
        this.nebula.add(s);
      }
    });
    this.scene.add(this.nebula);

    // Drifting glowing dust particles closer to the action.
    const count = 900, pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const pal = [new THREE.Color(0xa855f7), new THREE.Color(0x22d3ee), new THREE.Color(0xf472b6)];
    for (let i = 0; i < count; i++) {
      const rad = 40 + r() * 220, th = r() * TAU;
      pos.set([Math.cos(th) * rad, (r() - 0.5) * 90, Math.sin(th) * rad], i * 3);
      const c = pal[i % 3]; col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 1.6, map: this.glow, vertexColors: true, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.dust);
  }

  buildBackdrop() {
    const giant = new THREE.Mesh(
      new THREE.SphereGeometry(70, 48, 32),
      new THREE.MeshStandardMaterial({ map: planetTex(5, ['#1e1b4b', '#312e81', '#4c1d95', '#1e3a8a', '#0e7490'], { bands: 9 }), roughness: 1 }),
    );
    giant.position.set(-330, -90, -520);
    this.backdropPlanet = giant;
    this.scene.add(giant);
    const halo = this.makeGlow(0x6366f1, 260, 0.35);
    halo.position.copy(giant.position);
    this.scene.add(halo);
    const sunGlow = this.makeGlow(0xffd7a8, 340, 0.55);
    sunGlow.position.set(-900, 520, 700);
    this.scene.add(sunGlow);
  }

  makeGlow(color, scale, opacity = 0.6) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    s.scale.set(scale, scale, 1);
    return s;
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
        new THREE.MeshBasicMaterial({ color: orbit.color || 0x6d5dfc, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
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

  buildStation() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa4c7, metalness: 0.75, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f4a, metalness: 0.6, roughness: 0.45 });
    const neon = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const neonP = new THREE.MeshBasicMaterial({ color: 0xa855f7 });

    const spin = new THREE.Group();
    g.add(spin);
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(9, 0.9, 20, 96), metal));
    const strip = new THREE.Mesh(new THREE.TorusGeometry(9, 0.22, 8, 96), neon);
    strip.position.y = 0.75; spin.add(strip);
    const strip2 = strip.clone(); strip2.position.y = -0.75; strip2.material = neonP; spin.add(strip2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 8, 8), dark);
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = -a;
      spoke.position.set(Math.cos(a) * 4.6, 0, Math.sin(a) * 4.6);
      spin.add(spoke);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2.6), metal);
      pod.position.set(Math.cos(a) * 9, 0, Math.sin(a) * 9);
      pod.rotation.y = -a;
      spin.add(pod);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 1.8), i % 2 ? neon : neonP);
      win.position.set(Math.cos(a) * 10.05, 0, Math.sin(a) * 10.05);
      win.rotation.y = -a;
      spin.add(win);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 7, 24), metal);
    g.add(hub);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), neon);
    g.add(core);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 18, 8), dark);
    g.add(mast);
    [-1, 1].forEach((s) => {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.12, 3.2),
        new THREE.MeshStandardMaterial({ color: 0x1d4ed8, emissive: 0x1e3a8a, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.3 }),
      );
      panel.position.set(s * 6.5, s * 7.5, 0);
      g.add(panel);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
      tip.position.y = s * 9.2;
      g.add(tip);
      this.blinkers = (this.blinkers || []).concat(tip);
    });
    const glow = this.makeGlow(0x22d3ee, 34, 0.55);
    g.add(glow);
    g.rotation.x = 0.28;
    this.station = { group: g, spin, core };
    this.addNode('station', g, { label: 'Orbit Station', sub: 'Command Deck', focusDist: 34, radius: 10, hitRadius: 11 });
  }

  buildMinecraftPlanet() {
    const g = new THREE.Group();
    const R = 4.6, r = rng(1337);
    const cells = [];
    for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) for (let z = -5; z <= 5; z++) {
      const d = Math.sqrt(x * x + y * y + z * z);
      if (d <= R && d > R - 1.8) cells.push([x, y, z]);
    }
    const geo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    cells.forEach(([x, y, z], i) => {
      m.makeTranslation(x, y, z);
      mesh.setMatrixAt(i, m);
      const n = Math.sin(x * 1.3 + 2) * Math.cos(z * 1.1 - 1) + Math.sin(y * 0.9 + x * 0.4) * 0.8 + (r() - 0.5) * 0.3;
      let hex;
      if (Math.abs(y) >= 4) hex = r() > 0.3 ? 0xf1f5f9 : 0xcbd5e1; // snowy poles
      else if (n < -0.75) hex = 0x2563eb; // water
      else if (n < -0.45) hex = 0xe7c983; // sand
      else if (n > 1.05) hex = 0x6b7280; // stone
      else hex = [0x4ade80, 0x22c55e, 0x16a34a, 0x15803d][Math.floor(r() * 4)]; // grass
      mesh.setColorAt(i, c.setHex(hex));
    });
    const planet = new THREE.Group();
    planet.add(mesh);
    g.add(planet);

    // Beacon block + beam
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshBasicMaterial({ color: 0x67e8f9 }));
    beacon.position.y = R + 0.9;
    g.add(beacon);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.55, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = R + 16;
    g.add(beam);
    const beamCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.16, 30, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    beamCore.position.y = R + 16;
    g.add(beamCore);
    const glow = this.makeGlow(0x4ade80, 22, 0.35);
    g.add(glow);

    // Floating mini cube-moon
    const moonPivot = new THREE.Group();
    const cubeMoon = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }));
    cubeMoon.position.set(8, 1.5, 0);
    moonPivot.add(cubeMoon);
    g.add(moonPivot);

    this.mc = { planet, beam, beamCore, beacon, moonPivot, cubeMoon };
    this.addNode('minecraft', g, {
      label: 'Minecraft Server', sub: 'Orbitnetwork.net', focusDist: 24, radius: 5,
      orbit: { radius: 30, speed: 0.05, phase: 0.6, tilt: 0.12, color: 0x4ade80 },
    });
  }

  buildArcadePlanet() {
    const g = new THREE.Group();
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(4.8, 48, 32),
      new THREE.MeshStandardMaterial({
        map: planetTex(21, ['#3b0764', '#6b21a8', '#9333ea', '#c026d3', '#db2777', '#4c1d95'], { bands: 16, glow: '#22d3ee' }),
        emissive: 0x3b0764, emissiveIntensity: 0.55, roughness: 0.7,
      }),
    );
    g.add(planet);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(6.4, 10.5, 128),
      new THREE.MeshBasicMaterial({ map: ringTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2 + 0.35;
    g.add(ring);
    const glow = this.makeGlow(0xd946ef, 30, 0.45);
    g.add(glow);
    // Orbiting holo-cubes (one per game)
    const cubes = new THREE.Group();
    const cols = [0x22d3ee, 0xa855f7, 0xf472b6, 0xfacc15];
    for (let i = 0; i < 12; i++) {
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.55, 0.55),
        new THREE.MeshBasicMaterial({ color: cols[i % 4], wireframe: i % 2 === 0 }),
      );
      const a = (i / 12) * TAU;
      cube.position.set(Math.cos(a) * 12.5, Math.sin(a * 3) * 0.8, Math.sin(a) * 12.5);
      cubes.add(cube);
    }
    cubes.rotation.x = 0.35;
    g.add(cubes);
    this.arcade = { planet, ring, cubes };
    this.addNode('arcade', g, {
      label: 'Arcade Sector', sub: '12 mini-games', focusDist: 30, radius: 5.5, hitRadius: 8,
      orbit: { radius: 48, speed: 0.032, phase: 2.6, tilt: -0.08, tiltZ: 0.05, color: 0xd946ef },
    });
  }

  buildCommsPlanet() {
    const g = new THREE.Group();
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 40, 28),
      new THREE.MeshStandardMaterial({
        map: planetTex(77, ['#0e7490', '#0891b2', '#22d3ee', '#a5f3fc', '#164e63'], { bands: 6, spots: 60 }),
        emissive: 0x083344, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.1,
      }),
    );
    g.add(planet);
    const dish = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 0.8, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }),
    );
    dish.position.y = 3.6; dish.rotation.x = Math.PI;
    g.add(dish);
    const pulses = [];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(
        new THREE.TorusGeometry(4, 0.06, 6, 64),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      p.rotation.x = Math.PI / 2;
      p.userData.offset = i / 3;
      g.add(p); pulses.push(p);
    }
    g.add(this.makeGlow(0x22d3ee, 18, 0.35));
    this.comms = { planet, pulses };
    this.addNode('comms', g, {
      label: 'Comms Relay', sub: 'Discord & community', focusDist: 18, radius: 3.5, hitRadius: 5,
      orbit: { radius: 64, speed: 0.022, phase: 4.4, tilt: 0.16, color: 0x22d3ee },
    });
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

  homeDistance() { return this.camera.aspect < 0.8 ? 135 : 92; }

  setPaused(p) {
    if (p === this.paused) return;
    this.paused = p;
    if (p) {
      cancelAnimationFrame(this._raf);
      this.labelsEl?.classList.add('paused');
    } else {
      this.clock.getDelta();
      this.labelsEl?.classList.remove('paused');
      this._raf = requestAnimationFrame(this._loop);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
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
    if (!this.holding) return;
    this.holding = false;
    this.rig.rGoal = this.homeDistance();
    this.rig.thetaGoal = 0.5;
    this.rig.phiGoal = 1.12;
    this.rig.lastInteract = this.time + 2;
  }

  /* ---------- frame loop ---------- */
  _loop() {
    if (this.paused) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.update(dt, this.time);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt, t) {
    this.starUniforms.uTime.value = t;
    this.nebula.rotation.y = t * 0.004;
    this.dust.rotation.y = t * 0.012;
    this.backdropPlanet.rotation.y = t * 0.01;

    // Station
    this.station.spin.rotation.y = t * 0.18;
    this.station.group.rotation.y = t * 0.02;
    this.station.core.scale.setScalar(1 + Math.sin(t * 2.2) * 0.08);
    this.blinkers.forEach((b, i) => { b.visible = Math.sin(t * 3 + i * 1.7) > -0.2; });

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
    this.mc.planet.rotation.y = t * 0.25;
    this.mc.planet.rotation.x = Math.sin(t * 0.3) * 0.08;
    this.mc.beam.material.opacity = 0.22 + Math.sin(t * 3) * 0.08;
    this.mc.beacon.rotation.y = t;
    this.mc.moonPivot.rotation.y = t * 0.6;
    this.mc.cubeMoon.rotation.set(t, t * 0.7, 0);
    this.arcade.planet.rotation.y = t * 0.15;
    this.arcade.cubes.rotation.y = -t * 0.35;
    this.arcade.cubes.children.forEach((c, i) => c.rotation.set(t + i, t * 1.3, 0));
    this.comms.planet.rotation.y = t * 0.3;
    this.comms.pulses.forEach((p) => {
      const k = (t * 0.45 + p.userData.offset) % 1;
      p.scale.setScalar(0.8 + k * 1.8);
      p.material.opacity = (1 - k) * 0.55;
    });

    // Camera rig
    const rig = this.rig;
    if (rig.focus) rig.focus.object.getWorldPosition(rig.targetGoal);
    else if (this.holding) rig.thetaGoal += dt * 0.05;
    else if (t - rig.lastInteract > 5) rig.thetaGoal += dt * 0.035;
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
    const par = rig.r * 0.045;
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
