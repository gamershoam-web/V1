// =====================================================================================
//  COMPOSITE 1 — translucent resolve & reflections
//   * water: physically based refraction (Snell offset), Beer-Lambert absorption,
//     single-scattering in-scatter, Fresnel, sun glint, multi-layer reflections,
//     total internal reflection when submerged
//   * glass / ice: dual-layer refraction + forward-lit translucent layer + reflections
//   * opaque: GGX importance-sampled SSR / voxel RT / sky reflections (LabPBR F0/metal)
//   * volumetric fog application
// =====================================================================================
#define NEED_LIGHT
#include "/lib/common.glsl"

uniform sampler2D depthtex0;
uniform sampler2D depthtex1;
uniform sampler2D colortex0;
uniform sampler2D colortex1;
uniform sampler2D colortex2;
uniform sampler2D colortex3;
uniform sampler2D colortex4;
uniform sampler2D colortex7;
uniform sampler2D colortex9;
uniform sampler2D colortex11;
uniform sampler2D shadowtex0;
uniform sampler2D shadowtex1;
uniform sampler2D shadowcolor0;
uniform sampler2D shadowcolor1;

#include "/lib/shadows.glsl"
#include "/lib/lighting.glsl"
#include "/lib/brdf.glsl"
#include "/lib/reflections.glsl"
#include "/lib/fullscreen.glsl"

#ifdef FSH
/* RENDERTARGETS: 7 */
layout(location = 0) out vec4 outColor;

void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    vec2 uv = texcoord;
    float d0 = texelFetch(depthtex0, px, 0).r;
    float d1 = texelFetch(depthtex1, px, 0).r;
    LightContext ctx = getLightContext();
    vec3 view0 = screenToView(vec3(uv, d0));
    vec3 player0 = viewToPlayer(view0);
    vec3 V = normalize(player0);                 // eye -> surface
    float dither = temporalIGN(gl_FragCoord.xy);
    RNG rng = rngInit(px, frameCounter + 7919);

    vec3 color = texelFetch(colortex7, px, 0).rgb;
    float eyeSky = float(eyeBrightnessSmooth.y) / 240.0;

    vec4 translucent = texelFetch(colortex4, px, 0);
    vec4 tInfo = texelFetch(colortex11, px, 0);
    int tMat = int(tInfo.z * 255.0 + 0.5);
    bool refractive = d0 < d1 && d0 > 0.56 && (tMat == MAT_WATER || tMat == MAT_GLASS);

    if (refractive) {
        // ============================================================ translucent ====
        vec4 info = tInfo;
        vec3 n = decodeNormal(info.xy);
        int mat = tMat;
        bool water = mat == MAT_WATER;
        bool underwater = isEyeInWater == 1;

        // ---- refraction: offset between refracted and straight rays, projected -----
        float eta = water ? (underwater ? 1.333 : 1.0 / 1.333) : 1.0 / 1.5;
        vec3 view1 = screenToView(vec3(uv, d1));
        float thick = clamp(distance(view0, view1), 0.0, water ? 3.0 : 0.6);
        vec3 nV = mat3(gbufferModelView) * n;
        vec3 vV = normalize(view0);
        vec3 refr = refract(vV, nV, eta);
        if (dot(refr, refr) < 0.5) refr = vV;
        vec3 flatN = mat3(gbufferModelView) * vec3(0.0, sign(n.y + 1e-4), 0.0);
        vec3 refrFlat = refract(vV, water ? flatN : nV, eta);
        if (dot(refrFlat, refrFlat) < 0.5) refrFlat = vV;
        vec2 offs = (viewToScreen(view0 + refr * thick).xy - viewToScreen(view0 + refrFlat * thick).xy) *
                    (water ? WATER_REFRACTION : 1.0);
        vec2 ruv = clamp(uv + offs, vec2(0.001), vec2(0.999));
        float rd1 = textureLod(depthtex1, ruv, 0.0).r;
        if (rd1 < d0) { ruv = uv; rd1 = d1; }  // refracted sample in front of surface
        vec3 behind = textureLod(colortex7, ruv, 0.0).rgb;
        vec3 viewBehind = screenToView(vec3(ruv, rd1));

        if (water && !underwater) {
            float dist = rd1 >= 1.0 ? 64.0 : distance(view0, viewBehind);
            vec3 T = exp(-(waterAbsorptionCoeff + waterScatterCoeff) * dist);
            vec3 sunVis = shadowSimple(player0, false);
            float cosT = dot(V, ctx.lightDir);
            vec3 inLight = ctx.lightColor * sunVis * phaseHG(cosT, 0.6) * 2.0 +
                           giSkyRadiance(vec3(0.0, 1.0, 0.0), ctx) * 0.4 * smoothstep(0.0, 1.0, eyeSky + 0.3);
            vec3 albedoSS = waterScatterCoeff / (waterAbsorptionCoeff + waterScatterCoeff);
            behind = behind * T + inLight * albedoSS * (1.0 - T);
        }
        // translucent (glass / particles) layer "over" the refracted background
        vec3 surface = behind * (1.0 - translucent.a) + translucent.rgb;

        // ---- reflection ------------------------------------------------------------
        {
            float smoothness = water ? 1.0 : info.w;
            float rough = max(sqr(1.0 - smoothness), 0.0005);
            vec3 nn = underwater && water ? -n : n;
            if (dot(nn, -V) < 0.0) nn = -nn;
            float NdotV = saturate(dot(nn, -V));
            float F;
            if (underwater && water) {
                // water -> air: total internal reflection outside Snell's window
                float sinT2 = 1.333 * 1.333 * (1.0 - NdotV * NdotV);
                F = sinT2 >= 1.0 ? 1.0 : fresnelSchlick(sqrt(1.0 - sinT2), vec3(0.02)).x;
            } else {
                F = fresnelSchlick(NdotV, vec3(water ? 0.02 : 0.04)).x;
            }
            vec3 R = sampleReflectionDir(V, nn, rough, rngNext2(rng));
            vec3 refl = traceReflection(view0, player0, nn, R, underwater ? 0.2 : max(eyeSky, 0.35), dither, ctx);
            color = mix(surface, refl, F);
            // sun glint (analytic GGX, sun sized lobe)
            Material wm;
            wm.albedo = vec3(0.0); wm.roughness = rough; wm.smoothness = smoothness;
            wm.f0 = vec3(water ? 0.02 : 0.04); wm.metal = false; wm.hardcodedMetal = false;
            wm.n = vec3(0.0); wm.k = vec3(0.0);
            float NdotL = saturate(dot(nn, ctx.lightDir));
            if (NdotL > 0.0 && !underwater) {
                vec3 vis = shadowSimple(player0 + n * 0.05, true);
                color += specularGGX(wm, nn, -V, ctx.lightDir) * ctx.lightColor * vis * NdotL;
            }
        }
    } else {
      if (d1 < 1.0 && d1 > 0.56) {
        // ============================================================ opaque specular =
        vec3 viewO = screenToView(vec3(uv, d1));
        vec3 playerO = viewToPlayer(viewO);
        vec3 VO = normalize(playerO);
        vec4 spec = texelFetch(colortex2, px, 0);
        vec4 info = texelFetch(colortex3, px, 0);
        vec4 albedoAO = texelFetch(colortex0, px, 0);
        Material m = decodeMaterial(srgbToLinear(albedoAO.rgb), spec, albedoAO.a);
        int mat = int(info.z * 255.0 + 0.5);
        bool reflective = (m.metal || m.smoothness > 0.3 || m.f0.x > 0.06) && mat != MAT_PLANT;
        if (reflective) {
            vec3 N = decodeNormal(texelFetch(colortex1, px, 0).xy);
            float NdotV = max(dot(N, -VO), 1e-4);
            vec2 env = envBRDFApprox(NdotV, m.roughness);
            vec3 F = m.hardcodedMetal ? fresnelConductor(NdotV, m.n, m.k) * env.x + env.y
                                      : m.f0 * env.x + env.y;
            vec3 refl;
            if (m.roughness < ROUGH_REFLECTION_THRESHOLD) {
                vec3 R = sampleReflectionDir(VO, N, m.roughness, rngNext2(rng));
                refl = traceReflection(viewO, playerO, decodeNormal(texelFetch(colortex1, px, 0).zw), R, info.y, dither, ctx);
            } else {
                refl = giSkyRadiance(reflect(VO, N), ctx) * sqr(info.y) + lightmapBlockLight(info.x) * 0.25;
            }
            // specular occlusion (Lagarde) from AO
            float so = saturate(pow(NdotV + m.ao, exp2(-16.0 * m.roughness - 1.0)) - 1.0 + m.ao);
            color += refl * F * so;
        }
      }
        // forward translucent layer without refraction (particles, rain, glint)
        color = color * (1.0 - translucent.a) + translucent.rgb;
    }

    // ================================================================ fog ===========
    vec4 vl = texelFetch(colortex9, px, 0);
    color = color * vl.a + vl.rgb;

    if (isEyeInWater == 2) color = mix(color, vec3(2.0, 0.5, 0.08), 0.95);
    if (isEyeInWater == 3) color = mix(color, vec3(0.5, 0.6, 0.7) * luminance(ctx.skyZenith) * 3.0, 0.9);
    color *= 1.0 - max(blindness, darknessFactor) * saturate(length(player0) / 8.0);

#if DEBUG_VIEW == 6
    VoxelHit dh = traceVoxels(playerToVoxel(vec3(0.0)), V, 512, 512.0);
    color = dh.hit ? dh.albedo * (0.4 + 0.6 * abs(dh.normal.y)) + voxelEmission(dh.type, dh.albedo) : vec3(0.0);
#elif DEBUG_VIEW == 7
    color = vl.rgb;
#endif
    outColor = vec4(max(color, 0.0), 1.0);
}
#endif
