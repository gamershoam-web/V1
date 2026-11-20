// =====================================================================================
//  DEFERRED 6 — opaque lighting resolve -> colortex7 (HDR scene radiance)
//  Direct: PCSS + contact shadows + POM self shadows, GGX specular, Burley diffuse,
//  subsurface transmission. Indirect: denoised PTGI (lightmap fallback outside the
//  voxel volume). Emission. Sky: physical atmosphere + sun / moon / stars.
// =====================================================================================
#define NEED_LIGHT
#include "/lib/common.glsl"

uniform sampler2D depthtex0;
uniform sampler2D colortex0;
uniform sampler2D colortex1;
uniform sampler2D colortex2;
uniform sampler2D colortex3;
uniform sampler2D colortex5;
uniform sampler2D shadowtex0;
uniform sampler2D shadowtex1;
uniform sampler2D shadowcolor0;
uniform sampler2D shadowcolor1;

#include "/lib/shadows.glsl"
#include "/lib/lighting.glsl"
#include "/lib/brdf.glsl"
#include "/lib/fullscreen.glsl"

#ifdef FSH
/* RENDERTARGETS: 7 */
layout(location = 0) out vec4 outColor;

vec3 renderSky(vec3 dir, LightContext ctx) {
#if defined DIM_NETHER
    return netherAmbient() * 0.6;
#elif defined DIM_END
    return endAmbient() * 0.4 + starField(dir) * 2.0;
#else
    vec3 moonDir = worldMoonDir();
    vec3 moonI = moonIlluminance(moonDir);
    vec3 trans;
    vec3 sky = skyScatter(dir, ctx.sunDir, ctx.sunIllum, moonDir, moonI, trans);
    float horizonMask = smoothstep(-0.02, 0.02, dir.y);
    sky += (sunDisk(dir, ctx.sunDir, vec3(SUN_ILLUMINANCE)) * trans +
            moonDisk(dir, moonDir, ctx.sunDir, moonI) +
            starField(dir) * saturate(1.0 - luminance(sky) * 40.0)) * horizonMask * (1.0 - rainStrength);
    return sky;
#endif
}

void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    float depth = texelFetch(depthtex0, px, 0).r;
    LightContext ctx = getLightContext();
    vec3 view = screenToView(vec3(texcoord, depth));
    vec3 player = viewToPlayer(view);
    vec3 dir = normalize(player);

    if (depth >= 1.0) {
        outColor = vec4(renderSky(dir, ctx), 1.0);
        return;
    }

    vec4 albedoAO = texelFetch(colortex0, px, 0);
    vec4 nrm  = texelFetch(colortex1, px, 0);
    vec4 spec = texelFetch(colortex2, px, 0);
    vec4 info = texelFetch(colortex3, px, 0);
    int  mat  = int(info.z * 255.0 + 0.5);
    vec2 lm   = info.xy;
    float pomShadow = info.w;

    vec3 albedo = srgbToLinear(albedoAO.rgb);
    Material m = decodeMaterial(albedo, spec, albedoAO.a);
    vec3 N  = decodeNormal(nrm.xy);
    vec3 GN = decodeNormal(nrm.zw);
    vec3 V  = -dir;
    vec3 L  = ctx.lightDir;
    float NdotL  = dot(N, L);
    float GNdotL = dot(GN, L);
    float NdotV  = max(dot(N, V), 1e-4);
    float dither = temporalIGN(gl_FragCoord.xy);

    bool foliage = mat == MAT_LEAVES || mat == MAT_PLANT;
    float sssAmount = foliage ? (mat == MAT_LEAVES ? 1.0 : 0.8) : m.sss;
#ifndef SSS
    sssAmount = 0.0;
#endif

    // ------------------------------------------------------------- direct light -----
    vec3 direct = vec3(0.0);
    vec3 shadow = vec3(0.0);
    if ((GNdotL > 0.0 || sssAmount > 0.0) && maxOf(ctx.lightColor) > 1e-6) {
#ifdef SHADOWS
        float blockerDist;
        vec3 sn = foliage ? L : GN;
        shadow = shadowPCSS(player, sn, max(abs(GNdotL), 0.05), dither, blockerDist);
        if (mat != MAT_HAND) {
            vec3 lightView = mat3(gbufferModelView) * L;
            shadow *= contactShadow(depthtex0, view + mat3(gbufferModelView) * GN * 0.01, lightView, dither);
        }
#else
        shadow = vec3(1.0);
#endif
        shadow *= pomShadow;

        if (GNdotL > 0.0 || foliage) {
            float nl = foliage ? abs(NdotL) * 0.5 + 0.5 * saturate(NdotL) : saturate(NdotL);
            vec3 H = normalize(V + L);
            float LdotH = saturate(dot(L, H));
            vec3 F = materialFresnel(m, LdotH);
            vec3 diffuse = m.metal ? vec3(0.0) :
                           m.albedo * (1.0 - F) * diffuseBurley(nl, NdotV, LdotH, m.roughness);
            vec3 specTerm = mat == MAT_PLANT ? vec3(0.0) : specularGGX(m, N, V, L);
            direct = ctx.lightColor * shadow * (diffuse + specTerm) * nl;
        }

        // ---------------------------------------------------------- subsurface ------
        if (sssAmount > 0.0) {
            float thickness = shadowThickness(player, GN);
            // Beer-Lambert through the medium + diffusion profile approximation
            vec3 sigma = (1.0 - sqrt(m.albedo)) * 4.0 / SSS_DEPTH + 0.25 / SSS_DEPTH;
            vec3 transmit = exp(-sigma * thickness * (foliage ? 1.0 : 2.0));
            float VdotL = dot(-V, L);
            // VdotL = cos(light propagation, direction to eye): forward lobe glows when backlit
            float phase = mix(phaseHG(VdotL, 0.45), 0.25 * INV_PI, 0.4) * 4.0 * PI;
            float backLit = saturate(-GNdotL) * 0.6 + 0.4;
            vec3 sssLight = m.albedo * ctx.lightColor * transmit * phase * backLit * INV_PI;
            // light reaching the far side must not be blocked by unrelated geometry
            vec3 vis = shadowSimple(player + L * min(thickness, 2.0), true);
            direct += sssLight * sssAmount * SSS_STRENGTH * vis;
        }
    }

    // ------------------------------------------------------------- indirect ---------
    vec3 irradiance;
    vec3 fallback = fallbackAmbient(N, lm, ctx);
#ifdef PTGI
    if (mat != MAT_HAND) {
        vec3 vp = playerToVoxel(player + GN * 0.01);
        vec3 edge = min(vp, vec3(voxelSize) - vp);
        float inside = insideVoxelVolume(vp) ? smoothstep(0.0, 24.0, minOf(edge)) : 0.0;
        vec3 gi = texelFetch(colortex5, px, 0).rgb;
        // lightmap assist only inside the volume (the fallback already contains it)
        irradiance = mix(fallback, gi + lightmapBlockLight(lm.x) * LIGHTMAP_BLOCKLIGHT, inside);
    } else {
        irradiance = fallback;
    }
#else
    irradiance = fallback;
#endif

    // dynamic held light
    if (heldBlockLightValue > 0) {
        float d = length(player);
        irradiance += blockLightTint * float(heldBlockLightValue) / 15.0 * EMISSION_STRENGTH * 0.4 / (1.0 + d * d * 0.25);
    }

    vec2 env = envBRDFApprox(NdotV, m.roughness);
    vec3 envF = m.hardcodedMetal ? m.f0 : m.f0 * env.x + env.y;
    vec3 diffuseIndirect = m.metal ? vec3(0.0) : m.albedo * (1.0 - envF) * irradiance * m.ao;

    // ------------------------------------------------------------- emission ---------
    vec3 emission = m.albedo * m.emission * EMISSION_STRENGTH * (mat == MAT_LAVA ? 1.6 : 1.0);

    vec3 color = direct + diffuseIndirect + emission;

#if DEBUG_VIEW == 1
    color = albedo;
#elif DEBUG_VIEW == 2
    color = N * 0.5 + 0.5;
#elif DEBUG_VIEW == 3 || DEBUG_VIEW == 4
    color = irradiance;
#elif DEBUG_VIEW == 5
    color = shadow;
#endif

    outColor = vec4(max(color, 0.0), 1.0);
}
#endif
