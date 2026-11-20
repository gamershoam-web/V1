#ifndef ATMOSPHERE_GLSL
#define ATMOSPHERE_GLSL
// -------------------------------------------------------------------------------------
//  Physically based single-scattering atmosphere (Rayleigh + Mie + Ozone absorption),
//  analytic solar transmittance (Kasten-Young air mass) and phase functions.
// -------------------------------------------------------------------------------------

const float planetRadius = 6371e3;
const float atmosRadius  = 6471e3;
const vec3  betaRayleigh = vec3(5.802e-6, 13.558e-6, 33.1e-6);
const float betaMie      = 3.996e-6;
const float mieExtinctionMul = 1.11;
const vec3  betaOzone    = vec3(0.650e-6, 1.881e-6, 0.085e-6);
const float scaleHeightR = 8000.0;
const float scaleHeightM = 1200.0;

// ---------------------------------------------------------------- phase functions ---
float phaseRayleigh(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float phaseHG(float c, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
// Cornette-Shanks (better Mie approximation)
float phaseCS(float c, float g) {
    float g2 = g * g;
    return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + c * c)) /
           ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
// dual lobe for fog: strong forward peak + mild back scatter
float phaseFog(float c, float g) {
    return mix(phaseHG(c, -0.25 * g), phaseHG(c, g), 0.82);
}

// ---------------------------------------------------------------- geometry ----------
vec2 raySphere(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float d = b * b - c;
    if (d < 0.0) return vec2(-1.0);
    d = sqrt(d);
    return vec2(-b - d, -b + d);
}

vec3 atmosphereDensity(float h) {
    h = max(h, 0.0);
    float ozone = max(0.0, 1.0 - abs(h - 25000.0) / 15000.0);
    return vec3(exp(-h / scaleHeightR), exp(-h / scaleHeightM), ozone);
}

vec3 extinctionFromDepth(vec3 od) {
    return betaRayleigh * od.x + betaMie * mieExtinctionMul * od.y + betaOzone * od.z;
}

// ---------------------------------------------------------------- analytic sun ------
vec3 sunTransmittance(vec3 dir) {
    float cz = clamp(dir.y, -1.0, 1.0);
    float zenithDeg = degrees(acos(cz));
    float airMass = 1.0 / (max(cz, 0.0) + 0.50572 * pow(max(96.07995 - zenithDeg, 0.01), -1.6364));
    vec3 tau = betaRayleigh * scaleHeightR + betaMie * mieExtinctionMul * scaleHeightM + betaOzone * 15000.0;
    return exp(-tau * min(airMass, 40.0)) * smoothstep(-0.06, 0.02, cz);
}

vec3 sunIlluminance(vec3 sunDir) {
    return SUN_ILLUMINANCE * vec3(1.0, 0.985, 0.96) * sunTransmittance(sunDir);
}
vec3 moonIlluminance(vec3 moonDir) {
    return MOON_ILLUMINANCE * vec3(0.62, 0.78, 1.0) * sunTransmittance(moonDir);
}

// ---------------------------------------------------------------- sky integrator ----
vec3 lightOpticalDepth(vec3 p, vec3 l) {
    if (raySphere(p, l, planetRadius).x > 0.0) return vec3(1e9); // below horizon: occluded by planet
    float tEnd = raySphere(p, l, atmosRadius).y;
    const int steps = 6;
    float ds = tEnd / float(steps);
    vec3 od = vec3(0.0);
    for (int i = 0; i < steps; i++) {
        vec3 q = p + l * (ds * (float(i) + 0.5));
        od += atmosphereDensity(length(q) - planetRadius) * ds;
    }
    return od;
}

vec3 skyScatter(vec3 dir, vec3 sunDir, vec3 sunIllum, vec3 moonDir, vec3 moonIllum, out vec3 transmittance) {
    vec3 ro = vec3(0.0, planetRadius + 300.0 + max(cameraPosition.y - 64.0, 0.0) * 4.0, 0.0);
    vec2 tA = raySphere(ro, dir, atmosRadius);
    vec2 tP = raySphere(ro, dir, planetRadius);
    float tEnd = tP.x > 0.0 ? tP.x : tA.y;
    float ds = tEnd / float(ATMOSPHERE_STEPS);

    float cs = dot(dir, sunDir), cm = dot(dir, moonDir);
    float pRs = phaseRayleigh(cs), pMs = phaseCS(cs, 0.76);
    float pRm = phaseRayleigh(cm), pMm = phaseCS(cm, 0.76);

    vec3 od = vec3(0.0);
    vec3 scatter = vec3(0.0);
    for (int i = 0; i < ATMOSPHERE_STEPS; i++) {
        vec3 p = ro + dir * (ds * (float(i) + 0.5));
        float h = length(p) - planetRadius;
        vec3 dens = atmosphereDensity(h) * ds;
        od += dens;
        vec3 viewT = exp(-extinctionFromDepth(od));
        vec3 sunT  = exp(-extinctionFromDepth(lightOpticalDepth(p, sunDir)));
        vec3 moonT = exp(-extinctionFromDepth(lightOpticalDepth(p, moonDir)));
        vec3 rs = betaRayleigh * dens.x;
        vec3 ms = vec3(betaMie * dens.y);
        scatter += viewT * ((rs * pRs + ms * pMs) * sunT * sunIllum + (rs * pRm + ms * pMm) * moonT * moonIllum);
    }
    transmittance = exp(-extinctionFromDepth(od));
    // multiple scattering: a 1.5x energy factor on single scattering (calibrated so the
    // clear-sky diffuse fraction lands at ~10-12 % for a high sun) plus an isotropic
    // term that keeps twilight from going black
    vec3 ms = (betaRayleigh * scaleHeightR) * (sunIllum + moonIllum) * 0.06;
    return (scatter * 1.5 + ms * (1.0 - transmittance)) * SKY_BRIGHTNESS;
}

vec3 skyScatter(vec3 dir, vec3 sunDir, vec3 sunIllum, vec3 moonDir, vec3 moonIllum) {
    vec3 t;
    return skyScatter(dir, sunDir, sunIllum, moonDir, moonIllum, t);
}

// cheap analytic sky for GI / rough reflections, built from 3 precomputed colors
vec3 skyAmbientCheap(vec3 dir, vec3 zenith, vec3 horizon, vec3 sunDir, vec3 sunIllum) {
    float up = dir.y;
    vec3 sky = mix(horizon, zenith, pow(saturate(up), 0.45));
    float sunGlow = pow(saturate(dot(dir, sunDir) * 0.5 + 0.5), 6.0);
    sky += sunIllum * sunGlow * 0.04 * SKY_BRIGHTNESS;
    // ground: lit by sky + sun, average albedo 0.25
    vec3 ground = (horizon * 0.6 + sunIllum * saturate(sunDir.y) * INV_PI) * 0.25;
    return mix(ground, sky, smoothstep(-0.12, 0.05, up));
}

// ---------------------------------------------------------------- celestial ---------
vec3 sunDisk(vec3 dir, vec3 sunDir, vec3 sunIllum) {
    float cosR = cos(max(sunAngularRadius, 0.0047));
    float c = dot(dir, sunDir);
    if (c < cosR) return vec3(0.0);
    float r = sqrt(saturate((1.0 - c) / (1.0 - cosR)));
    float mu = sqrt(max(1.0 - r * r, 0.0));
    vec3 limb = pow(vec3(mu), vec3(0.397, 0.503, 0.652)); // wavelength dependent limb darkening
    float solidAngle = TAU * (1.0 - cosR);
    return min(sunIllum * limb / solidAngle, vec3(30000.0));
}

vec3 moonDisk(vec3 dir, vec3 moonDir, vec3 sunDir, vec3 moonIllum) {
    float cosR = cos(0.009);
    float c = dot(dir, moonDir);
    if (c < cosR) return vec3(0.0);
    // spherical moon lit by the sun
    mat3 basis = tbnFromNormal(moonDir);
    vec2 local = vec2(dot(dir, basis[0]), dot(dir, basis[1])) / sin(0.009);
    vec3 n = normalize(basis[0] * local.x + basis[1] * local.y + basis[2] * sqrt(max(1.0 - dot(local, local), 0.0)));
    float lit = saturate(dot(n, sunDir) * 0.5 + 0.55);
    float craters = 0.75 + 0.25 * valueNoise3D(n * 9.0);
    return moonIllum * 400.0 * lit * craters;
}

vec3 starField(vec3 dir) {
#ifdef STARS
    vec3 p = dir * 280.0;
    vec3 cell = floor(p);
    float h = hash13(cell);
    if (h < 0.9965) return vec3(0.0);
    vec3 f = fract(p) - 0.5;
    float star = smoothstep(0.32, 0.0, length(f)) * (h - 0.9965) / 0.0035;
    vec3 tint = mix(vec3(1.0, 0.75, 0.55), vec3(0.65, 0.8, 1.0), hash13(cell + 7.0));
    float twinkle = 0.7 + 0.3 * sin(frameTimeCounter * (2.0 + 6.0 * h) + h * 100.0);
    return tint * star * twinkle * 0.03;
#else
    return vec3(0.0);
#endif
}

#endif
