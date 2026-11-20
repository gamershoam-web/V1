// =====================================================================================
//  COMPOSITE 0 — ray-marched volumetric fog / atmospheric scattering / underwater
//  scattering with shadow-mapped crepuscular rays. colortex9 = in-scatter | transmittance
// =====================================================================================
#define NEED_LIGHT
#include "/lib/common.glsl"

uniform sampler2D depthtex0;
uniform sampler2D shadowtex0;
uniform sampler2D shadowtex1;
uniform sampler2D shadowcolor0;
uniform sampler2D shadowcolor1;

#include "/lib/shadows.glsl"
#include "/lib/lighting.glsl"
#include "/lib/volumetrics.glsl"
#include "/lib/fullscreen.glsl"

#ifdef FSH
/* RENDERTARGETS: 9 */
layout(location = 0) out vec4 outVL;

void main() {
#ifdef VOLUMETRIC_FOG
    float depth = texelFetch(depthtex0, ivec2(gl_FragCoord.xy), 0).r;
    vec3 player;
    if (depth >= 1.0) {
        player = normalize(viewToPlayer(screenToView(vec3(texcoord, 1.0)))) * VL_DISTANCE;
    } else {
        player = viewToPlayer(screenToView(vec3(texcoord, depth)));
        if (depth < 0.56) player *= 0.0; // hand: no fog in front of it
    }
    float skyExposure = isEyeInWater == 1 ? 1.0 : pow(float(eyeBrightnessSmooth.y) / 240.0, 2.0);
#ifdef DIM_END
    skyExposure = 1.0;
#endif
    outVL = marchVolumetrics(player, temporalIGN(gl_FragCoord.xy), getLightContext(), skyExposure);
#else
    outVL = vec4(0.0, 0.0, 0.0, 1.0);
#endif
}
#endif
