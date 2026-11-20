// =====================================================================================
//  COMPOSITE 3..5 — physically based bloom (convolution approximation of a camera PSF).
//  Pass 3: 13-tap Karis-weighted downsample of mips 2..8 into a tile atlas (colortex12)
//  Pass 4/5: separable 9-tap gaussian per tile (BLOOM_PASS = 1 horizontal, 2 vertical)
// =====================================================================================
#include "/lib/common.glsl"
#include "/lib/bloomtiles.glsl"

uniform sampler2D colortex7;
uniform sampler2D colortex12;

#if BLOOM_PASS == 0
const bool colortex7MipmapEnabled = true;
#endif

#include "/lib/fullscreen.glsl"

#ifdef FSH
/* RENDERTARGETS: 12 */
layout(location = 0) out vec4 outBloom;

void main() {
    vec2 uv = texcoord;
    int tile = bloomTileAt(uv);
    if (tile < 0) { outBloom = vec4(0.0); return; }
    vec4 rect = bloomTileRect(tile);
    vec2 res = vec2(viewWidth, viewHeight);

#if BLOOM_PASS == 0
    vec2 local = (uv - rect.xy) / (rect.zw - rect.xy);
    float lod = float(tile + BLOOM_FIRST_LOD);
    vec2 texel = exp2(lod) / res;
    // 13-tap downsample (Jimenez 2014) on the previous mip
    vec3 a = textureLod(colortex7, local + texel * vec2(-1.0, -1.0), lod - 1.0).rgb;
    vec3 b = textureLod(colortex7, local + texel * vec2( 0.0, -1.0), lod - 1.0).rgb;
    vec3 c = textureLod(colortex7, local + texel * vec2( 1.0, -1.0), lod - 1.0).rgb;
    vec3 d = textureLod(colortex7, local + texel * vec2(-0.5, -0.5), lod - 1.0).rgb;
    vec3 e = textureLod(colortex7, local + texel * vec2( 0.5, -0.5), lod - 1.0).rgb;
    vec3 f = textureLod(colortex7, local + texel * vec2(-1.0,  0.0), lod - 1.0).rgb;
    vec3 g = textureLod(colortex7, local, lod - 1.0).rgb;
    vec3 h = textureLod(colortex7, local + texel * vec2( 1.0,  0.0), lod - 1.0).rgb;
    vec3 i = textureLod(colortex7, local + texel * vec2(-0.5,  0.5), lod - 1.0).rgb;
    vec3 j = textureLod(colortex7, local + texel * vec2( 0.5,  0.5), lod - 1.0).rgb;
    vec3 k = textureLod(colortex7, local + texel * vec2(-1.0,  1.0), lod - 1.0).rgb;
    vec3 l = textureLod(colortex7, local + texel * vec2( 0.0,  1.0), lod - 1.0).rgb;
    vec3 m = textureLod(colortex7, local + texel * vec2( 1.0,  1.0), lod - 1.0).rgb;
    vec3 col = (d + e + i + j) * 0.125 + (a + b + g + f) * 0.03125 + (b + c + h + g) * 0.03125 +
               (f + g + l + k) * 0.03125 + (g + h + m + l) * 0.03125;
    if (tile == 0) col /= 1.0 + luminance(col) * 0.02; // Karis-style firefly suppression
    outBloom = vec4(col, 1.0);
#else
    const float w[5] = float[5](0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);
  #if BLOOM_PASS == 1
    vec2 dir = vec2(1.0 / res.x, 0.0);
  #else
    vec2 dir = vec2(0.0, 1.0 / res.y);
  #endif
    vec2 lo = rect.xy + 0.5 / res, hi = rect.zw - 0.5 / res;
    vec3 col = textureLod(colortex12, uv, 0.0).rgb * w[0];
    for (int s = 1; s < 5; s++) {
        col += textureLod(colortex12, clamp(uv + dir * float(s) * 1.5, lo, hi), 0.0).rgb * w[s];
        col += textureLod(colortex12, clamp(uv - dir * float(s) * 1.5, lo, hi), 0.0).rgb * w[s];
    }
    outBloom = vec4(col, 1.0);
#endif
}
#endif
