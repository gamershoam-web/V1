// Realistic space toolkit shared by the 3D hub and Starfighter.
// Everything is generated procedurally on the GPU (no image downloads):
//   createSkyCube()  – Milky Way, star field and faint nebulae baked into a cube map
//   bakeTexture()    – equirectangular planet textures from noise shaders
//   makePlanet()     – Earth-like, gas giant, ice giant, rocky moon (+ clouds, atmosphere, rings)
//   makeSun()        – animated photosphere, corona glow, lens flare
//   makeAsteroidGeometries() / makeAsteroidBelt()
import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

/* ------------------------------------------------------------------ GLSL */
export const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p, int octaves){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * snoise(p);
    p = p * 2.03 + vec3(17.1, 9.2, 3.7);
    a *= 0.5;
  }
  return s;
}
float ridged(vec3 p, int octaves){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * (1.0 - abs(snoise(p)));
    p = p * 2.1 + vec3(5.3, 1.7, 8.1);
    a *= 0.5;
  }
  return s;
}
float hash13(vec3 p3){
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
// sRGB-ish authoring colour -> linear
vec3 lin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
`;

/* ------------------------------------------------------------------ helpers */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowTexture(stops = [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]) {
  return canvasTexture(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([o, c]) => grd.addColorStop(o, c));
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });
}

export function makeGlowSprite(texture, color, scale, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  s.scale.set(scale, scale, 1);
  return s;
}

const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Renders a fragment shader into a texture once. `body` must define `vec3 shade(vec3 dir, vec2 uv)` returning
// an authoring-space colour; the sphere direction matches THREE.SphereGeometry's UV layout so there are no seams.
export function bakeTexture(renderer, body, { width = 1024, height = 512, uniforms = {}, alpha = false, srgb = true } = {}) {
  const rt = new THREE.WebGLRenderTarget(width, height, {
    colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  });
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: QUAD_VERT,
    fragmentShader: `${NOISE_GLSL}
      varying vec2 vUv;
      ${body}
      void main(){
        float phi = vUv.x * 6.28318530718;
        float theta = (1.0 - vUv.y) * 3.14159265359;
        vec3 dir = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
        ${alpha ? 'vec4 c = shadeA(dir, vUv); gl_FragColor = vec4(' + (srgb ? 'lin(c.rgb)' : 'c.rgb') + ', c.a);' : 'vec3 c = shade(dir, vUv); gl_FragColor = vec4(' + (srgb ? 'lin(c)' : 'c') + ', 1.0);'}
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const prevTarget = renderer.getRenderTarget();
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt);
  renderer.render(scene, new THREE.Camera());
  renderer.setRenderTarget(prevTarget);
  renderer.toneMapping = prevTone;
  material.dispose();
  quad.geometry.dispose();
  rt.texture.wrapS = THREE.RepeatWrapping;
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return rt.texture;
}

/* ------------------------------------------------------------------ sky */
const SKY_FRAG = /* glsl */ `
uniform vec3 uGalNormal;
uniform vec3 uGalCenter;
uniform float uSeed;
varying vec3 vDir;

vec3 starTint(float t){
  // O/B blue-white -> A white -> G yellow -> K orange -> M red
  vec3 c = mix(vec3(0.66, 0.76, 1.0), vec3(1.0, 1.0, 1.0), smoothstep(0.0, 0.35, t));
  c = mix(c, vec3(1.0, 0.92, 0.78), smoothstep(0.35, 0.65, t));
  c = mix(c, vec3(1.0, 0.72, 0.48), smoothstep(0.65, 0.9, t));
  return mix(c, vec3(1.0, 0.55, 0.42), smoothstep(0.9, 1.0, t));
}

vec3 stars(vec3 dir, float scale, float density, float radius, float bright){
  vec3 p = dir * scale;
  vec3 cell = floor(p);
  vec3 side = step(0.5, fract(p)) * 2.0 - 1.0;   // only the 8 nearest cells can hold a visible star
  vec3 col = vec3(0.0);
  for (int x = 0; x <= 1; x++)
  for (int y = 0; y <= 1; y++)
  for (int z = 0; z <= 1; z++) {
    vec3 c = cell + vec3(float(x), float(y), float(z)) * side;
    if (hash13(c + uSeed) > density) continue;
    vec3 sp = c + vec3(hash13(c + 1.31), hash13(c + 2.71), hash13(c + 4.13));
    vec3 sdir = normalize(sp);
    float d = length(cross(dir, sdir)) * scale;
    if (dot(dir, sdir) < 0.0) continue;
    float mag = pow(hash13(c + 7.77), 9.0);
    float r = radius * (0.6 + mag * 0.9);
    col += starTint(hash13(c + 9.91)) * exp(-d * d / (r * r)) * (0.10 + mag * bright);
  }
  return col;
}

void main(){
  vec3 dir = normalize(vDir);
  float lat = dot(dir, uGalNormal);
  vec3 inPlane = normalize(dir - uGalNormal * lat + 1e-5);
  float toCore = dot(inPlane, uGalCenter) * 0.5 + 0.5;
  float coreAng = acos(clamp(dot(dir, uGalCenter), -1.0, 1.0));

  // Milky Way: a soft band, brighter toward the galactic core, broken up by dust lanes
  float width = 0.13 + 0.05 * snoise(dir * 2.3 + 4.0) + 0.06 * toCore;
  float band = exp(-lat * lat / (width * width));
  float bulge = exp(-coreAng * coreAng / 0.18) * exp(-lat * lat / 0.05);
  float clouds = fbm(dir * 3.2 + 1.0, 6) * 0.5 + 0.5;
  float fine = fbm(dir * 11.0 + 7.0, 5) * 0.5 + 0.5;
  float glow = band * (0.25 + 0.75 * clouds) * (0.55 + 0.45 * fine) * (0.35 + 0.65 * toCore) + bulge * 1.2;
  float lane = smoothstep(0.42, 0.72, fbm(dir * 5.0 + 23.0, 6) * 0.5 + 0.5) * exp(-lat * lat / 0.006);
  glow *= 1.0 - 0.8 * lane;
  vec3 warm = vec3(1.0, 0.84, 0.66), cool = vec3(0.62, 0.70, 0.92);
  vec3 col = mix(cool, warm, clamp(bulge * 1.6 + toCore * 0.35, 0.0, 1.0)) * glow * 0.32;

  // unresolved star clouds inside the band
  col += mix(cool, warm, toCore) * band * pow(max(snoise(dir * 210.0), 0.0), 5.0) * 0.35 * (0.4 + clouds);

  // faint emission (H-alpha red) and reflection (blue) nebulae
  float neb = smoothstep(0.58, 0.88, fbm(dir * 1.7 + 40.0, 4) * 0.5 + 0.5);
  col += vec3(0.80, 0.20, 0.30) * neb * (fbm(dir * 7.0 + 5.0, 5) * 0.5 + 0.5) * 0.07 * (0.3 + band);
  float neb2 = smoothstep(0.62, 0.9, fbm(dir * 1.4 + 90.0, 4) * 0.5 + 0.5);
  col += vec3(0.18, 0.38, 0.70) * neb2 * (fbm(dir * 6.0 + 9.0, 5) * 0.5 + 0.5) * 0.05;

  // resolved stars: a dense faint field plus sparse bright ones (more of both in the band)
  col += stars(dir, 420.0, 0.005 + 0.014 * band, 0.5, 0.9);
  col += stars(dir, 150.0, 0.0022 + 0.002 * band, 0.32, 1.6);

  gl_FragColor = vec4(lin(col), 1.0);
}
`;

export function createSkyCube(renderer, { size = 1024, seed = 7 } = {}) {
  const rt = new THREE.WebGLCubeRenderTarget(size, {
    colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
  });
  const galNormal = new THREE.Vector3(0.32, 0.88, -0.35).normalize();
  const galCenter = new THREE.Vector3(-0.85, 0.1, -0.5);
  galCenter.sub(galNormal.clone().multiplyScalar(galCenter.dot(galNormal))).normalize();
  const material = new THREE.ShaderMaterial({
    uniforms: { uGalNormal: { value: galNormal }, uGalCenter: { value: galCenter }, uSeed: { value: seed } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `${NOISE_GLSL}\n${SKY_FRAG}`,
    side: THREE.BackSide, depthWrite: false,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), material);
  const scene = new THREE.Scene();
  scene.add(sphere);
  const cubeCamera = new THREE.CubeCamera(0.1, 100, rt);
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  cubeCamera.update(renderer, scene);
  renderer.toneMapping = prevTone;
  material.dispose();
  sphere.geometry.dispose();
  return rt.texture;
}

/* ------------------------------------------------------------------ planet surfaces */
const SURFACES = {
  earth: /* glsl */ `
    uniform float uSeed;
    vec3 shade(vec3 dir, vec2 uv){
      vec3 p = dir + uSeed;
      float h = fbm(p * 1.9, 7) + 0.18 * ridged(p * 4.0, 4) - 0.12;
      float moist = fbm(p * 2.6 + 31.0, 5);
      float lat = abs(dir.y);
      vec3 deep = vec3(0.02, 0.07, 0.20), shallow = vec3(0.05, 0.22, 0.38);
      vec3 col = mix(deep, shallow, smoothstep(-0.35, 0.0, h));
      if (h > 0.0) {
        vec3 forest = vec3(0.12, 0.26, 0.10), grass = vec3(0.30, 0.38, 0.17), desert = vec3(0.66, 0.56, 0.38), rock = vec3(0.42, 0.38, 0.33);
        vec3 land = mix(desert, mix(grass, forest, smoothstep(-0.05, 0.25, moist)), smoothstep(-0.25, 0.05, moist + (lat - 0.3) * 0.6));
        land = mix(land, rock, smoothstep(0.32, 0.55, h));
        col = mix(vec3(0.70, 0.64, 0.48), land, smoothstep(0.0, 0.03, h));
      }
      float ice = smoothstep(0.74, 0.86, lat + 0.06 * fbm(p * 6.0, 4)) + smoothstep(0.55, 0.7, h) * 0.6;
      return mix(col, vec3(0.92, 0.95, 0.98), clamp(ice, 0.0, 1.0));
    }`,
  earthRough: /* glsl */ `
    uniform float uSeed;
    vec3 shade(vec3 dir, vec2 uv){
      vec3 p = dir + uSeed;
      float h = fbm(p * 1.9, 7) + 0.18 * ridged(p * 4.0, 4) - 0.12;
      float r = h > 0.0 ? 0.92 : 0.38;
      return vec3(r);
    }`,
  clouds: /* glsl */ `
    uniform float uSeed;
    vec4 shadeA(vec3 dir, vec2 uv){
      vec3 p = dir * 2.2 + uSeed + 50.0;
      vec3 q = vec3(fbm(p, 4), fbm(p + 5.2, 4), fbm(p + 9.1, 4));
      float c = fbm(p * 1.6 + q * 1.4, 6);
      float bands = 0.12 * sin(dir.y * 14.0 + q.x * 3.0);
      float a = smoothstep(0.02, 0.45, c + bands);
      return vec4(vec3(1.0), a * 0.92);
    }`,
  gas: /* glsl */ `
    uniform float uSeed;
    uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
    vec3 shade(vec3 dir, vec2 uv){
      vec3 p = dir + uSeed;
      float warp = fbm(vec3(p.x * 2.0, p.y * 9.0, p.z * 2.0), 5);
      float turb = fbm(p * vec3(3.0, 14.0, 3.0) + warp * 1.6, 5);
      float y = dir.y + 0.035 * warp + 0.012 * turb;
      float b = sin(y * 22.0) * 0.5 + 0.5;
      float b2 = sin(y * 57.0 + 1.3) * 0.5 + 0.5;
      vec3 col = mix(uC1, uC2, b);
      col = mix(col, uC3, b2 * 0.45);
      col = mix(col, uC4, smoothstep(0.55, 0.95, abs(dir.y)) * 0.6);
      // a great storm
      vec3 sp = normalize(vec3(0.6, -0.32, 0.74));
      float storm = smoothstep(0.32, 0.0, length((dir - sp) * vec3(1.0, 2.2, 1.0)));
      col = mix(col, uC4 * 1.1, storm * (0.6 + 0.4 * sin(turb * 12.0)));
      return col * (0.88 + 0.24 * turb);
    }`,
  ice: /* glsl */ `
    uniform float uSeed;
    vec3 shade(vec3 dir, vec2 uv){
      vec3 p = dir + uSeed;
      float warp = fbm(vec3(p.x * 2.0, p.y * 6.0, p.z * 2.0), 4);
      float y = dir.y + 0.05 * warp;
      vec3 col = mix(vec3(0.20, 0.42, 0.78), vec3(0.32, 0.58, 0.88), sin(y * 12.0) * 0.5 + 0.5);
      col = mix(col, vec3(0.12, 0.25, 0.60), smoothstep(0.5, 0.9, abs(dir.y)));
      float streaks = smoothstep(0.55, 0.85, fbm(vec3(p.x * 3.0, p.y * 30.0, p.z * 3.0) + warp, 4) * 0.5 + 0.5);
      col = mix(col, vec3(0.86, 0.94, 1.0), streaks * 0.65);
      vec3 sp = normalize(vec3(-0.5, -0.25, 0.83));
      col = mix(col, vec3(0.07, 0.14, 0.42), smoothstep(0.22, 0.0, length((dir - sp) * vec3(1.0, 1.8, 1.0))) * 0.8);
      return col;
    }`,
  rock: /* glsl */ `
    uniform float uSeed;
    uniform vec3 uTint;
    float craters(vec3 p){
      vec3 cell = floor(p);
      float h = 0.0;
      for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
        vec3 c = cell + vec3(float(x), float(y), float(z));
        if (hash13(c + uSeed) > 0.55) continue;
        vec3 cp = c + vec3(hash13(c + 1.1), hash13(c + 2.2), hash13(c + 3.3));
        float r = 0.25 + 0.4 * hash13(c + 4.4);
        float d = length(p - cp) / r;
        if (d < 1.4) h += (d < 1.0 ? (d * d - 1.0) * 0.6 : 0.0) + 0.25 * exp(-pow((d - 1.0) * 6.0, 2.0));
      }
      return h;
    }
    vec3 shade(vec3 dir, vec2 uv){
      vec3 p = dir * 3.0 + uSeed;
      float h = craters(p) * 0.6 + craters(p * 2.7) * 0.3 + fbm(p * 2.0, 5) * 0.25;
      float maria = smoothstep(0.1, 0.4, fbm(dir * 1.5 + uSeed, 4));
      vec3 col = uTint * (0.62 + 0.38 * maria) * (0.78 + h * 0.5);
      return col;
    }`,
  ring: /* glsl */ `
    uniform float uSeed;
    vec4 shadeA(vec3 dir, vec2 uv){
      float r = uv.x; // radial coordinate 0 (inner) .. 1 (outer)
      float n = fbm(vec3(r * 60.0, uSeed, 0.0), 4) * 0.5 + 0.5;
      float fine = sin(r * 420.0) * 0.5 + 0.5;
      float a = 0.25 + 0.6 * n + 0.15 * fine;
      a *= smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.92, r);
      a *= 1.0 - 0.92 * smoothstep(0.012, 0.0, abs(r - 0.58));   // Cassini-like division
      a *= 1.0 - 0.6 * smoothstep(0.008, 0.0, abs(r - 0.83));
      a *= mix(0.55, 1.0, smoothstep(0.2, 0.35, r));
      vec3 col = mix(vec3(0.62, 0.55, 0.45), vec3(0.88, 0.80, 0.66), n);
      return vec4(col, clamp(a, 0.0, 1.0));
    }`,
};

/* Atmosphere rim: bright on the day side, fading across the terminator. */
export function makeAtmosphere(radius, color, sunDir, { power = 3.2, intensity = 1.2, scale = 1.06 } = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uSun: { value: sunDir }, uPower: { value: power }, uIntensity: { value: intensity } },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldNormal;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize((viewMatrix * wp).xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uSun; uniform float uPower; uniform float uIntensity;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldNormal;
      void main(){
        float rim = pow(clamp(1.0 + dot(vNormal, vView), 0.0, 1.0), uPower);
        float day = smoothstep(-0.35, 0.45, dot(vWorldNormal, uSun));
        gl_FragColor = vec4(uColor * rim * day * uIntensity, rim * day);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * scale, 64, 48), material);
  mesh.renderOrder = 2;
  return mesh;
}

const GAS_PALETTES = {
  saturn: ['#d9c08f', '#b89a68', '#efe0bd', '#8f7a5a'],
  jupiter: ['#c9a27b', '#8a5a3c', '#efe2cf', '#a8714c'],
};

/* Builds a lit planet group. type: earth | gas | ice | rock */
export function makePlanet(renderer, { type = 'rock', radius = 5, seed = 1, sunDir, segments = 96, palette = 'saturn', tint = '#a8a29e', rings = false, clouds = type === 'earth', atmosphere = null, size = 1024 } = {}) {
  const group = new THREE.Group();
  const s = { value: seed * 1.37 };
  let material;
  if (type === 'earth') {
    material = new THREE.MeshStandardMaterial({
      map: bakeTexture(renderer, SURFACES.earth, { width: size, height: size / 2, uniforms: { uSeed: s } }),
      roughnessMap: bakeTexture(renderer, SURFACES.earthRough, { width: size / 2, height: size / 4, uniforms: { uSeed: s }, srgb: false }),
      roughness: 1, metalness: 0,
    });
  } else if (type === 'gas') {
    const pal = (GAS_PALETTES[palette] || GAS_PALETTES.saturn).map((c) => new THREE.Color(c));
    const toVec = (c) => new THREE.Vector3(c.r, c.g, c.b);
    // palette colours are authored in sRGB; THREE.Color stores linear, so convert back for the bake shader
    pal.forEach((c) => c.convertLinearToSRGB());
    material = new THREE.MeshStandardMaterial({
      map: bakeTexture(renderer, SURFACES.gas, { width: size, height: size / 2, uniforms: { uSeed: s, uC1: { value: toVec(pal[0]) }, uC2: { value: toVec(pal[1]) }, uC3: { value: toVec(pal[2]) }, uC4: { value: toVec(pal[3]) } } }),
      roughness: 0.95, metalness: 0,
    });
  } else if (type === 'ice') {
    material = new THREE.MeshStandardMaterial({ map: bakeTexture(renderer, SURFACES.ice, { width: size, height: size / 2, uniforms: { uSeed: s } }), roughness: 0.75 });
  } else {
    const t = new THREE.Color(tint).convertLinearToSRGB();
    const tex = bakeTexture(renderer, SURFACES.rock, { width: size, height: size / 2, uniforms: { uSeed: s, uTint: { value: new THREE.Vector3(t.r, t.g, t.b) } } });
    material = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 2.2, roughness: 1, metalness: 0 });
  }
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments / 2), material);
  group.add(surface);

  let cloudMesh = null;
  if (clouds) {
    const cloudTex = bakeTexture(renderer, SURFACES.clouds, { width: size, height: size / 2, uniforms: { uSeed: s }, alpha: true });
    cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.012, segments, segments / 2),
      new THREE.MeshStandardMaterial({ map: cloudTex, transparent: true, depthWrite: false, roughness: 1 }),
    );
    group.add(cloudMesh);
  }
  if (atmosphere && sunDir) group.add(makeAtmosphere(radius, atmosphere.color, sunDir, atmosphere));

  let ring = null;
  if (rings) {
    const inner = radius * 1.35, outer = radius * 2.35;
    const geo = new THREE.RingGeometry(inner, outer, 160, 1);
    // remap UVs so u = radial position (the bake shader reads uv.x as radius)
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    const ringTex = bakeTexture(renderer, SURFACES.ring, { width: 1024, height: 4, uniforms: { uSeed: s }, alpha: true });
    ringTex.wrapS = THREE.ClampToEdgeWrapping;
    ring = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1, metalness: 0,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 1;
    group.add(ring);
  }
  return { group, surface, clouds: cloudMesh, ring };
}

/* ------------------------------------------------------------------ sun */
export function makeSun({ radius = 60, withFlare = true } = {}) {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 } };
  const photosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 32),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
        void main(){
          vPos = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `${NOISE_GLSL}
        uniform float uTime; varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
        void main(){
          vec3 p = normalize(vPos);
          float gran = fbm(p * 18.0 + vec3(uTime * 0.05), 4) * 0.5 + 0.5;
          float spots = smoothstep(0.62, 0.75, fbm(p * 3.0 + vec3(0.0, uTime * 0.01, 0.0), 3) * 0.5 + 0.5);
          float mu = clamp(dot(vNormal, vView), 0.0, 1.0);
          float limb = pow(mu, 0.45);
          vec3 col = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.93, 0.78), limb);
          col *= (0.82 + 0.3 * gran) * (1.0 - 0.45 * spots);
          gl_FragColor = vec4(col * 6.0 * limb + vec3(1.0, 0.5, 0.2) * 0.6, 1.0);
        }`,
      toneMapped: true,
    }),
  );
  group.add(photosphere);

  const glow = glowTexture([[0, 'rgba(255,250,235,1)'], [0.08, 'rgba(255,236,200,0.85)'], [0.25, 'rgba(255,190,120,0.28)'], [0.6, 'rgba(255,150,90,0.06)'], [1, 'rgba(255,140,80,0)']]);
  const corona = makeGlowSprite(glow, 0xffffff, radius * 9, 1);
  const halo = makeGlowSprite(glow, 0xffc58a, radius * 26, 0.35);
  group.add(corona, halo);

  let flare = null;
  if (withFlare) {
    const disc = glowTexture([[0, 'rgba(255,255,255,0.9)'], [0.55, 'rgba(255,255,255,0.25)'], [0.8, 'rgba(255,255,255,0.05)'], [1, 'rgba(255,255,255,0)']]);
    const ring = canvasTexture(256, 256, (g) => {
      const grd = g.createRadialGradient(128, 128, 90, 128, 128, 128);
      grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(180,220,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    });
    flare = new Lensflare();
    flare.addElement(new LensflareElement(glow, 420, 0, new THREE.Color(1, 0.95, 0.85)));
    flare.addElement(new LensflareElement(disc, 60, 0.45, new THREE.Color(0.45, 0.65, 1.0)));
    flare.addElement(new LensflareElement(disc, 90, 0.62, new THREE.Color(0.9, 0.55, 1.0)));
    flare.addElement(new LensflareElement(ring, 160, 0.82, new THREE.Color(0.6, 0.8, 1.0)));
    flare.addElement(new LensflareElement(disc, 40, 1.0, new THREE.Color(1.0, 0.7, 0.4)));
    group.add(flare);
  }
  return { group, uniforms, photosphere };
}

/* ------------------------------------------------------------------ asteroids */
export function makeAsteroidGeometries(count = 4, seed = 3) {
  const rand = seededRandom(seed);
  const geos = [];
  for (let k = 0; k < count; k++) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const bumps = Array.from({ length: 7 }, () => [new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), 0.15 + rand() * 0.35]);
    const stretch = new THREE.Vector3(0.7 + rand() * 0.6, 0.6 + rand() * 0.5, 0.7 + rand() * 0.6);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      let r = 1;
      bumps.forEach(([d, s]) => { r -= s * Math.max(0, n.dot(d) - 0.55) * 1.4; });
      r += (rand() - 0.5) * 0.08;
      v.copy(n).multiplyScalar(r).multiply(stretch);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    geos.push(g);
  }
  return geos;
}

export function makeAsteroidBelt({ count = 800, inner = 76, outer = 92, thickness = 3.5, seed = 11, sizeMin = 0.15, sizeMax = 0.9 } = {}) {
  const rand = seededRandom(seed);
  const group = new THREE.Group();
  const geos = makeAsteroidGeometries(4, seed);
  const mats = [0x8b8378, 0x6f6a63, 0x9c8f7e, 0x5d5853].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0, flatShading: true }));
  const per = Math.ceil(count / geos.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  geos.forEach((geo, gi) => {
    const mesh = new THREE.InstancedMesh(geo, mats[gi], per);
    for (let i = 0; i < per; i++) {
      const a = rand() * Math.PI * 2;
      const r = inner + Math.pow(rand(), 0.8) * (outer - inner);
      p.set(Math.cos(a) * r, (rand() - 0.5) * thickness * (1 - Math.abs((r - (inner + outer) / 2) / (outer - inner))), Math.sin(a) * r);
      e.set(rand() * 6.3, rand() * 6.3, rand() * 6.3);
      q.setFromEuler(e);
      const s = sizeMin + Math.pow(rand(), 3) * (sizeMax - sizeMin);
      sc.set(s, s, s);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
    }
    group.add(mesh);
  });
  return group;
}
