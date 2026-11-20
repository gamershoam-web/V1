// =====================================================================================
//  DEFERRED 2..5 — SVGF edge-avoiding a-trous wavelet filter (5x5 B3 spline kernel,
//  step 2^i). Edge stopping on linear depth, normals and variance-guided luminance.
//  Requires ATROUS_STEP.
// =====================================================================================
#include "/lib/common.glsl"

uniform sampler2D depthtex0;
uniform sampler2D colortex1;
uniform sampler2D colortex5;

#include "/lib/fullscreen.glsl"

#ifdef FSH
/* RENDERTARGETS: 5 */
layout(location = 0) out vec4 outFiltered;

const float kernel[3] = float[3](3.0 / 8.0, 1.0 / 4.0, 1.0 / 16.0);

void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    ivec2 res = ivec2(viewWidth, viewHeight);
    vec4 center = texelFetch(colortex5, px, 0);
    float depth = texelFetch(depthtex0, px, 0).r;
    if (depth >= 1.0) { outFiltered = center; return; }

    float zC = linearizeDepth(depth);
    vec3  nC = decodeNormal(texelFetch(colortex1, px, 0).zw);
    float lC = luminance(center.rgb);

    // 3x3 gaussian of the variance for a stable luminance edge-stopping function
    float var = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        float w = (x == 0 ? 0.5 : 0.25) * (y == 0 ? 0.5 : 0.25);
        var += texelFetch(colortex5, clamp(px + ivec2(x, y), ivec2(0), res - 1), 0).a * w;
    }
    float phiL = SVGF_PHI_COLOR * sqrt(max(var, 0.0)) + 1e-4;
    float phiZ = SVGF_PHI_DEPTH * (0.004 * zC + 0.02) * float(ATROUS_STEP);

    vec3  sumC = center.rgb;
    float sumV = center.a;
    float sumW = 1.0;
    for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
            if (x == 0 && y == 0) continue;
            ivec2 q = px + ivec2(x, y) * ATROUS_STEP;
            if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, res))) continue;
            float dq = texelFetch(depthtex0, q, 0).r;
            if (dq >= 1.0) continue;
            vec4 s = texelFetch(colortex5, q, 0);
            float zQ = linearizeDepth(dq);
            vec3  nQ = decodeNormal(texelFetch(colortex1, q, 0).zw);
            float wZ = exp(-abs(zC - zQ) / (phiZ * length(vec2(x, y))));
            float wN = pow(max(dot(nC, nQ), 0.0), SVGF_PHI_NORMAL);
            float wL = exp(-abs(lC - luminance(s.rgb)) / phiL);
            float w = kernel[abs(x)] * kernel[abs(y)] / (kernel[0] * kernel[0]) * wZ * wN * wL;
            sumC += s.rgb * w;
            sumV += s.a * w * w;
            sumW += w;
        }
    }
    outFiltered = vec4(sumC / sumW, sumV / (sumW * sumW));
}
#endif
