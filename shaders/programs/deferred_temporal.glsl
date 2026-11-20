// =====================================================================================
//  DEFERRED 1 — SVGF temporal accumulation
//  Bilinear reprojection with per-tap depth/normal consistency tests, adaptive history
//  length, luminance moments and per-pixel variance (spatial fallback for young history).
//  colortex5 <- accumulated irradiance | variance     (consumed by the a-trous passes)
//  colortex6 <- accumulated irradiance | history len   (persistent)
//  colortex8 <- moments(m1,m2) | linear depth | packed normal (persistent)
// =====================================================================================
#include "/lib/common.glsl"

uniform sampler2D depthtex0;
uniform sampler2D colortex1;
uniform sampler2D colortex3;
uniform sampler2D colortex5;
uniform sampler2D colortex6;
uniform sampler2D colortex8;

#include "/lib/fullscreen.glsl"

#ifdef FSH
/* RENDERTARGETS: 5,6,8 */
layout(location = 0) out vec4 outFiltered;
layout(location = 1) out vec4 outHistory;
layout(location = 2) out vec4 outMoments;

void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    ivec2 res = ivec2(viewWidth, viewHeight);
    float depth = texelFetch(depthtex0, px, 0).r;
    int mat = int(texelFetch(colortex3, px, 0).z * 255.0 + 0.5);
    vec3 n = decodeNormal(texelFetch(colortex1, px, 0).zw);
    vec3 view = screenToView(vec3(texcoord, depth));
    float linZ = -view.z;

    if (depth >= 1.0 || mat == MAT_HAND || mat == MAT_NONE) {
        outFiltered = vec4(0.0);
        outHistory  = vec4(0.0);
        outMoments  = vec4(0.0, 0.0, 1e6, packNormalFloat(n));
        return;
    }

    vec3 raw = texelFetch(colortex5, px, 0).rgb;
    float lum = luminance(raw);

#ifdef SVGF
    // ---------------------------------------------------------------- reprojection
    vec3 player = viewToPlayer(view);
    vec3 prevPlayer = player + cameraPosition - previousCameraPosition;
    vec3 prevView = (gbufferPreviousModelView * vec4(prevPlayer, 1.0)).xyz;
    vec4 prevClip = gbufferPreviousProjection * vec4(prevView, 1.0);
    vec2 prevUV = prevClip.xy / prevClip.w * 0.5 + 0.5;
    float expectedZ = -prevView.z;

    vec2 pp = prevUV * vec2(res) - 0.5;
    ivec2 base = ivec2(floor(pp));
    vec2 f = fract(pp);
    vec4 histSum = vec4(0.0);
    vec2 momSum = vec2(0.0);
    float wSum = 0.0;
    for (int i = 0; i < 4; i++) {
        ivec2 o = ivec2(i & 1, i >> 1);
        ivec2 q = base + o;
        if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, res))) continue;
        vec4 prevM = texelFetch(colortex8, q, 0);
        vec3 prevN = unpackNormalFloat(prevM.w);
        bool ok = abs(prevM.z - expectedZ) < 0.03 * expectedZ + 0.05 && dot(prevN, n) > 0.85;
        if (!ok) continue;
        float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
        histSum += texelFetch(colortex6, q, 0) * w;
        momSum  += prevM.xy * w;
        wSum    += w;
    }

    float histLen = 0.0;
    vec3 history = raw;
    vec2 prevMoments = vec2(lum, lum * lum);
    if (wSum > 0.01) {
        vec4 h = histSum / wSum;
        history = h.rgb;
        histLen = h.a;
        prevMoments = momSum / wSum;
    }
    histLen = min(histLen + 1.0, float(SVGF_TEMPORAL_FRAMES));
    float alpha = 1.0 / histLen;
    float alphaM = max(alpha, 0.2);
    vec3 accum = mix(history, raw, alpha);
    vec2 moments = mix(prevMoments, vec2(lum, lum * lum), alphaM);
    float variance = max(moments.y - moments.x * moments.x, 0.0);

    if (histLen < 4.0) {
        // spatial variance estimate while history is too short
        vec2 m = vec2(0.0); float wn = 0.0;
        for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
            ivec2 q = clamp(px + ivec2(x, y), ivec2(0), res - 1);
            float l = luminance(texelFetch(colortex5, q, 0).rgb);
            m += vec2(l, l * l); wn += 1.0;
        }
        m /= wn;
        variance = max(m.y - m.x * m.x, 0.0) * (4.0 / histLen);
    }

    outFiltered = vec4(accum, variance);
    outHistory  = vec4(accum, histLen);
    outMoments  = vec4(moments, linZ, packNormalFloat(n));
#else
    outFiltered = vec4(raw, 0.0);
    outHistory  = vec4(raw, 1.0);
    outMoments  = vec4(lum, lum * lum, linZ, packNormalFloat(n));
#endif
}
#endif
