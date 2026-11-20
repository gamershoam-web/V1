// =====================================================================================
//  DEFERRED 0 — world-space voxel path traced global illumination (raw, 1 path/pixel
//  per GI_SAMPLES, up to GI_BOUNCES bounces). Output: colortex5 = radiance | valid.
// =====================================================================================
#define NEED_LIGHT
#include "/lib/common.glsl"

uniform sampler2D depthtex0;
uniform sampler2D colortex1;
uniform sampler2D colortex3;
uniform sampler2D shadowtex0;
uniform sampler2D shadowtex1;
uniform sampler2D shadowcolor0;
uniform sampler2D shadowcolor1;

#include "/lib/shadows.glsl"
#include "/lib/lighting.glsl"
#include "/lib/fullscreen.glsl"

#ifdef FSH
/* RENDERTARGETS: 5 */
layout(location = 0) out vec4 outGI;

void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    float depth = texelFetch(depthtex0, px, 0).r;
    vec4 info = texelFetch(colortex3, px, 0);
    int mat = int(info.z * 255.0 + 0.5);
    if (depth >= 1.0 || mat == MAT_HAND || mat == MAT_NONE) { outGI = vec4(0.0); return; }

    vec4 nrm = texelFetch(colortex1, px, 0);
    vec3 n  = decodeNormal(nrm.xy);
    vec3 gn = decodeNormal(nrm.zw);
    vec3 player = viewToPlayer(screenToView(vec3(texcoord, depth)));

    RNG rng = rngInit(px, frameCounter);
    outGI = pathTraceGI(player, gn, n, info.y, rng, getLightContext());
}
#endif
