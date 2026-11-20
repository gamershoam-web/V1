// =====================================================================================
//  FINAL — physical bloom merge (energy conserving), exposure, ACES filmic, sRGB OETF,
//  triangular dither. Also hosts the buffer format / clear configuration.
// =====================================================================================
#include "/lib/common.glsl"
#include "/lib/buffers.glsl"
#include "/lib/tonemap.glsl"
#include "/lib/bloomtiles.glsl"

uniform sampler2D colortex7;
uniform sampler2D colortex10;
uniform sampler2D colortex12;

#include "/lib/fullscreen.glsl"

#ifdef FSH
layout(location = 0) out vec4 fragColor;

vec3 sampleBloomTile(int i, vec2 uv) {
    vec4 r = bloomTileRect(i);
    vec2 res = vec2(viewWidth, viewHeight);
    vec2 p = clamp(r.xy + uv * (r.zw - r.xy), r.xy + 1.0 / res, r.zw - 1.0 / res);
    return textureLod(colortex12, p, 0.0).rgb;
}

void main() {
    vec3 color = texelFetch(colortex7, ivec2(gl_FragCoord.xy), 0).rgb;

#ifdef BLOOM
    // sum of progressively wider gaussians ~ long-tailed lens/eye point spread function
    vec3 bloom = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < BLOOM_TILES; i++) {
        float w = pow(float(i) + 1.0, -0.6);
        bloom += sampleBloomTile(i, texcoord) * w;
        wsum += w;
    }
    bloom /= wsum;
    float strength = BLOOM_STRENGTH * (1.0 + rainStrength + float(isEyeInWater == 1) * 2.0);
    color = mix(color, bloom, saturate(strength));
#endif

    float exposure = texelFetch(colortex10, ivec2(0), 0).a;
    if (!(exposure > 0.0) || isinf(exposure)) exposure = 1.0;
    color *= exposure;

    color = acesFilmic(color);
    color = linearToSrgb(color);

    // triangular-PDF dither to 8 bit
    float n = hash12(gl_FragCoord.xy + float(frameCounter % 64) * 17.0) + hash12(gl_FragCoord.yx * 1.37 + 3.1) - 1.0;
    color += n / 255.0;

    fragColor = vec4(color, 1.0);
}
#endif
