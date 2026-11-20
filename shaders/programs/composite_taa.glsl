// =====================================================================================
//  COMPOSITE 2 — temporal anti-aliasing + auto exposure
//  Closest-depth reprojection, Catmull-Rom history, YCoCg variance clipping, luminance
//  weighted blending (HDR firefly safe). Exposure adapts in log space and is stored in
//  colortex10.a (identical in every texel; final reads texel 0,0).
// =====================================================================================
#include "/lib/common.glsl"

uniform sampler2D depthtex0;
uniform sampler2D colortex7;
uniform sampler2D colortex10;

const bool colortex7MipmapEnabled = true;

#include "/lib/fullscreen.glsl"

#ifdef FSH
/* RENDERTARGETS: 7,10 */
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outHistory;

vec3 rgbToYCoCg(vec3 c) {
    return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25)));
}
vec3 yCoCgToRgb(vec3 c) {
    return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
}

vec3 sampleCatmullRom(sampler2D t, vec2 uv, vec2 res) {
    vec2 pos = uv * res;
    vec2 c = floor(pos - 0.5) + 0.5;
    vec2 f = pos - c;
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    vec2 w3 = f * f * (-0.5 + 0.5 * f);
    vec2 w12 = w1 + w2;
    vec2 o12 = w2 / w12;
    vec2 t0 = (c - 1.0) / res, t3 = (c + 2.0) / res, t12 = (c + o12) / res;
    vec3 r = vec3(0.0);
    r += textureLod(t, vec2(t12.x, t0.y), 0.0).rgb * (w12.x * w0.y);
    r += textureLod(t, vec2(t0.x, t12.y), 0.0).rgb * (w0.x * w12.y);
    r += textureLod(t, t12, 0.0).rgb * (w12.x * w12.y);
    r += textureLod(t, vec2(t3.x, t12.y), 0.0).rgb * (w3.x * w12.y);
    r += textureLod(t, vec2(t12.x, t3.y), 0.0).rgb * (w12.x * w3.y);
    float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
    return max(r / wsum, 0.0);
}

float computeExposure() {
    // log-average luminance from a 5x5 grid on a low mip, centre weighted
    float maxLod = floor(log2(max(viewWidth, viewHeight)));
    float lod = max(maxLod - 4.0, 0.0);
    float sum = 0.0, wsum = 0.0;
    for (int y = 0; y < 5; y++) for (int x = 0; x < 5; x++) {
        vec2 p = (vec2(x, y) + 0.5) / 5.0;
        float w = exp(-dot(p - 0.5, p - 0.5) * 4.0);
        float l = luminance(textureLod(colortex7, p, lod).rgb);
        sum += log2(max(l, 1e-5)) * w;
        wsum += w;
    }
    float avg = exp2(sum / wsum);
    float target = 0.14 / clamp(avg, 0.0004, 8.0);
    target = exp2(log2(target) * 0.85) * exp2(EXPOSURE);
#ifndef AUTO_EXPOSURE
    target = exp2(EXPOSURE) * 0.9;
#endif
    float prev = texelFetch(colortex10, ivec2(0), 0).a;
    if (!(prev > 0.0) || isinf(prev) || isnan(prev)) return target;
    float k = 1.0 - exp(-frameTime * EXPOSURE_SPEED);
    return exp2(mix(log2(prev), log2(target), k));
}

void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    vec2 res = vec2(viewWidth, viewHeight);
    vec3 current = texelFetch(colortex7, px, 0).rgb;
    float exposure = computeExposure();

#ifdef TAA
    // closest depth in 3x3 for stable edges
    float closest = 1.0;
    ivec2 closestPx = px;
    vec3 m1 = vec3(0.0), m2 = vec3(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        ivec2 q = clamp(px + ivec2(x, y), ivec2(0), ivec2(res) - 1);
        float d = texelFetch(depthtex0, q, 0).r;
        if (d < closest) { closest = d; closestPx = q; }
        vec3 c = rgbToYCoCg(texelFetch(colortex7, q, 0).rgb);
        m1 += c; m2 += c * c;
    }
    m1 /= 9.0; m2 /= 9.0;
    vec3 sigma = sqrt(max(m2 - m1 * m1, 0.0));

    vec2 prevUV;
    if (closest < 0.56) {
        prevUV = texcoord; // hand
    } else {
        vec2 cuv = (vec2(closestPx) + 0.5) / res;
        vec3 player = viewToPlayer(screenToView(vec3(cuv, closest)));
        if (closest >= 1.0) player = normalize(player) * 1e4;   // sky: rotation only
        vec3 prevPlayer = player + (closest >= 1.0 ? vec3(0.0) : cameraPosition - previousCameraPosition);
        vec4 pc = gbufferPreviousProjection * (gbufferPreviousModelView * vec4(prevPlayer, 1.0));
        prevUV = texcoord + (pc.xy / pc.w * 0.5 + 0.5 - cuv);
    }

    vec3 result = current;
    if (all(greaterThan(prevUV, vec2(0.0))) && all(lessThan(prevUV, vec2(1.0)))) {
        vec3 hist = rgbToYCoCg(sampleCatmullRom(colortex10, prevUV, res));
        // variance clip toward the neighbourhood mean
        float gamma = 1.25;
        vec3 lo = m1 - gamma * sigma, hi = m1 + gamma * sigma;
        vec3 dir = hist - m1;
        vec3 ext = max(abs(dir) / max(hi - m1, vec3(1e-6)), vec3(1.0));
        hist = m1 + dir / maxOf(ext);
        vec3 h = yCoCgToRgb(hist);

        float speed = length((prevUV - texcoord) * res);
        float blend = TAA_BLEND * mix(1.0, 0.85, saturate(speed / 8.0));
        // luminance weighting suppresses HDR fireflies
        float wc = (1.0 - blend) / (1.0 + luminance(current) * exposure);
        float wh = blend / (1.0 + luminance(h) * exposure);
        result = (current * wc + h * wh) / (wc + wh);
    }
    current = result;
#endif

    outColor   = vec4(current, 1.0);
    outHistory = vec4(current, exposure);
}
#endif
