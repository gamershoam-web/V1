#ifndef WATER_GLSL
#define WATER_GLSL
// -------------------------------------------------------------------------------------
//  Procedural water surface (sharp-crested trochoid-like sine sum with domain warp),
//  analytic normals and an area-ratio caustics estimator used in the shadow pass.
// -------------------------------------------------------------------------------------

float waterHeight(vec2 p) {
#ifdef WATER_WAVES
    float t = frameTimeCounter * WATER_WAVE_SPEED;
    float h = 0.0, amp = 1.0, freq = 0.55, total = 0.0, ang = 0.4;
    for (int i = 0; i < 9; i++) {
        vec2  d = vec2(sin(ang), cos(ang));
        float x = dot(d, p) * freq + t * (0.9 + 0.17 * float(i));
        float w = exp(sin(x) - 1.0);
        float dw = w * cos(x);
        h += w * amp;
        total += amp;
        p -= d * dw * amp * 0.28;       // drag the domain toward crests
        amp *= 0.74; freq *= 1.24; ang += 2.399;
    }
    // slow large swell
    h += 0.35 * sin(dot(p, vec2(0.11, 0.07)) + t * 0.4);
    return (h / (total + 0.35)) * 0.18 * WATER_WAVE_HEIGHT;
#else
    return 0.0;
#endif
}

vec3 waterNormal(vec3 worldPos, float distanceFade) {
    const float e = 0.04;
    vec2 p = worldPos.xz;
    float h0 = waterHeight(p);
    float hx = waterHeight(p + vec2(e, 0.0));
    float hz = waterHeight(p + vec2(0.0, e));
    vec3 n = normalize(vec3((h0 - hx) / e, 1.0, (h0 - hz) / e));
    return normalize(mix(vec3(0.0, 1.0, 0.0), n, distanceFade));
}

#ifdef FSH
// Caustic intensity at a water surface fragment for light direction L (towards light).
// Projects the refracted light ray to a virtual floor and measures the area change
// of the wavefront with screen-space (here: shadow-map-space) derivatives.
float waterCaustics(vec3 worldPos, vec3 L) {
    vec3 n = waterNormal(worldPos, 1.0);
    vec3 r0 = refract(-L, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
    vec3 r  = refract(-L, n, 1.0 / 1.333);
    const float floorDepth = 2.5;
    vec3 p0 = worldPos + r0 * (floorDepth / max(-r0.y, 0.1));
    vec3 p1 = worldPos + r  * (floorDepth / max(-r.y, 0.1));
    float a0 = length(cross(dFdx(p0), dFdy(p0)));
    float a1 = length(cross(dFdx(p1), dFdy(p1)));
    float c = a0 / max(a1, 1e-7);
    return clamp(pow(c, 1.4) * 0.85, 0.0, 3.9);
}
#endif

#endif
