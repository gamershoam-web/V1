#ifndef COMMON_GLSL
#define COMMON_GLSL

#include "/lib/settings.glsl"
#include "/lib/uniforms.glsl"

// ------------------------------------------------------------------ constants -------
const float PI      = 3.14159265359;
const float TAU     = 6.28318530718;
const float INV_PI  = 0.31830988618;
const float GOLDEN  = 2.39996322973;   // golden angle
const float EPS     = 1e-5;

// material ids stored in colortex3.b (x255)
const int MAT_NONE      = 0;
const int MAT_SOLID     = 1;
const int MAT_LEAVES    = 2;
const int MAT_PLANT     = 3;
const int MAT_EMISSIVE  = 4;
const int MAT_HAND      = 5;
const int MAT_ENTITY    = 6;
const int MAT_LAVA      = 7;
const int MAT_SMALL_EMIT= 8;
const int MAT_WATER     = 9;
const int MAT_GLASS     = 10;
const int MAT_TRANSLUCENT = 11;
const int MAT_PARTICLE  = 12;

// block.properties ids
const int ID_LEAVES     = 10001;
const int ID_PLANT      = 10002;
const int ID_PLANT_TALL = 10003;
const int ID_WATER      = 10004;
const int ID_GLASS      = 10005;
const int ID_ICE        = 10006;
const int ID_EMISSIVE   = 10010;
const int ID_TORCH      = 10011;
const int ID_SOUL       = 10012;
const int ID_REDSTONE   = 10013;
const int ID_LAVA       = 10014;
const int ID_FIRE       = 10015;
const int ID_END_LIGHT  = 10016;
const int ID_DIM_EMIT   = 10017;
const int ID_NONSOLID   = 10020;

// ------------------------------------------------------------------ helpers ---------
float sqr(float x) { return x * x; }
float pow2(float x) { return x * x; }
float pow5(float x) { float x2 = x * x; return x2 * x2 * x; }
float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec2  saturate(vec2 x)  { return clamp(x, 0.0, 1.0); }
vec3  saturate(vec3 x)  { return clamp(x, 0.0, 1.0); }
float maxOf(vec3 v) { return max(v.x, max(v.y, v.z)); }
float minOf(vec3 v) { return min(v.x, min(v.y, v.z)); }
float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float remap(float x, float a, float b) { return saturate((x - a) / (b - a)); }

vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
    c = max(c, 0.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// ------------------------------------------------------------------ transforms ------
vec3 projectAndDivide(mat4 m, vec3 p) {
    vec4 h = m * vec4(p, 1.0);
    return h.xyz / h.w;
}
vec3 screenToView(vec3 screen) {
    return projectAndDivide(gbufferProjectionInverse, screen * 2.0 - 1.0);
}
vec3 viewToScreen(vec3 view) {
    return projectAndDivide(gbufferProjection, view) * 0.5 + 0.5;
}
vec3 viewToPlayer(vec3 view) {
    return mat3(gbufferModelViewInverse) * view + gbufferModelViewInverse[3].xyz;
}
vec3 playerToView(vec3 player) {
    return mat3(gbufferModelView) * player + gbufferModelView[3].xyz;
}
float linearizeDepth(float d) {
    float ndc = d * 2.0 - 1.0;
    return (2.0 * near * far) / (far + near - ndc * (far - near));
}

// world-space directions of the celestial bodies
vec3 worldSunDir()   { return normalize(mat3(gbufferModelViewInverse) * sunPosition); }
vec3 worldMoonDir()  { return normalize(mat3(gbufferModelViewInverse) * moonPosition); }
vec3 worldLightDir() { return normalize(mat3(gbufferModelViewInverse) * shadowLightPosition); }

// ------------------------------------------------------------------ encoding --------
vec2 octWrap(vec2 v) { return (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0); }
vec2 encodeNormal(vec3 n) {
    n /= (abs(n.x) + abs(n.y) + abs(n.z));
    n.xy = n.z >= 0.0 ? n.xy : octWrap(n.xy);
    return n.xy * 0.5 + 0.5;
}
vec3 decodeNormal(vec2 e) {
    e = e * 2.0 - 1.0;
    vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
    float t = saturate(-n.z);
    n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t);
    return normalize(n);
}

// normal packed into one float (2 x 11 bit, exactly representable in fp32)
float packNormalFloat(vec3 n) {
    vec2 e = floor(encodeNormal(n) * 2047.0 + 0.5);
    return e.x * 2048.0 + e.y;
}
vec3 unpackNormalFloat(float f) {
    float x = floor(f / 2048.0);
    float y = f - x * 2048.0;
    return decodeNormal(vec2(x, y) / 2047.0);
}

// ------------------------------------------------------------------ noise -----------
uint pcgHash(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}
struct RNG { uint state; };
RNG rngInit(ivec2 pixel, int frame) {
    RNG r;
    r.state = pcgHash(uint(pixel.x) + pcgHash(uint(pixel.y) + pcgHash(uint(frame))));
    return r;
}
float rngNext(inout RNG r) {
    r.state = r.state * 747796405u + 2891336453u;
    uint w = ((r.state >> ((r.state >> 28u) + 4u)) ^ r.state) * 277803737u;
    w = (w >> 22u) ^ w;
    return float(w) * (1.0 / 4294967296.0);
}
vec2 rngNext2(inout RNG r) { return vec2(rngNext(r), rngNext(r)); }

float interleavedGradientNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
float temporalIGN(vec2 p) {
    return interleavedGradientNoise(p + 5.588238 * float(frameCounter % 64));
}
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}
float valueNoise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash13(i);
    float b = hash13(i + vec3(1, 0, 0));
    float c = hash13(i + vec3(0, 1, 0));
    float d = hash13(i + vec3(1, 1, 0));
    float e = hash13(i + vec3(0, 0, 1));
    float g = hash13(i + vec3(1, 0, 1));
    float h = hash13(i + vec3(0, 1, 1));
    float k = hash13(i + vec3(1, 1, 1));
    return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}

// Vogel disk sample
vec2 vogelDisk(int i, int n, float phi) {
    float r = sqrt((float(i) + 0.5) / float(n));
    float theta = float(i) * GOLDEN + phi;
    return r * vec2(cos(theta), sin(theta));
}

// cosine weighted hemisphere around n
vec3 cosineHemisphere(vec3 n, vec2 xi) {
    float phi = TAU * xi.x;
    float r = sqrt(xi.y);
    vec3 t = normalize(abs(n.y) < 0.999 ? cross(n, vec3(0, 1, 0)) : cross(n, vec3(1, 0, 0)));
    vec3 b = cross(n, t);
    return normalize(t * (r * cos(phi)) + b * (r * sin(phi)) + n * sqrt(max(0.0, 1.0 - xi.y)));
}

mat3 tbnFromNormal(vec3 n) {
    vec3 t = normalize(abs(n.y) < 0.999 ? cross(n, vec3(0, 1, 0)) : cross(n, vec3(1, 0, 0)));
    return mat3(t, cross(n, t), n);
}

// ------------------------------------------------------------------ TAA jitter ------
vec2 halton2(int i) {
    vec2 r = vec2(0.0);
    vec2 f = vec2(1.0);
    int a = i, b = i;
    for (int k = 0; k < 8; k++) {
        f.x *= 0.5;      if (a > 0) { r.x += f.x * float(a % 2); a /= 2; }
        f.y /= 3.0;      if (b > 0) { r.y += f.y * float(b % 3); b /= 3; }
    }
    return r;
}
vec2 taaOffset() {
#ifdef TAA
    return (halton2(frameCounter % 16 + 1) - 0.5) * 2.0 / vec2(viewWidth, viewHeight); // NDC units
#else
    return vec2(0.0);
#endif
}

// ------------------------------------------------------------------ lightmap --------
vec2 normalizeLightmap(vec2 lm) {
    return saturate((lm - 1.0 / 32.0) * (16.0 / 15.0));
}

#endif
