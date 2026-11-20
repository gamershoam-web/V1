#ifndef PTGI_GLSL
#define PTGI_GLSL
// -------------------------------------------------------------------------------------
//  World-space voxel path tracer: cosine-weighted multi-bounce diffuse transport with
//  next-event estimation toward the sun/moon (through the shadow map), emissive voxels,
//  sky radiance on escape and Russian roulette.
//  Output = average incident radiance over the cosine lobe (indirect = albedo * GI).
// -------------------------------------------------------------------------------------
#include "/lib/voxel.glsl"

struct LightContext {
    vec3 lightDir;     // world space, sun or moon (whichever casts shadows)
    vec3 lightColor;   // irradiance at normal incidence
    vec3 sunDir;
    vec3 sunIllum;
    vec3 skyZenith;
    vec3 skyHorizon;
};

vec3 giSkyRadiance(vec3 dir, LightContext ctx) {
#if defined DIM_NETHER || defined DIM_END
    return ctx.skyHorizon;
#else
    return skyAmbientCheap(dir, ctx.skyZenith, ctx.skyHorizon, ctx.sunDir, ctx.sunIllum);
#endif
}

// returns vec4(radiance, valid)
vec4 pathTraceGI(vec3 playerPos, vec3 geoNormal, vec3 normal, float skyLight, inout RNG rng, LightContext ctx) {
    vec3 origin = playerToVoxel(playerPos + geoNormal * 0.01);
    if (!insideVoxelVolume(origin)) return vec4(0.0);

    float skyOcclusion = skyLight * skyLight;
    vec3 total = vec3(0.0);

    for (int s = 0; s < GI_SAMPLES; s++) {
        vec3 radiance   = vec3(0.0);
        vec3 throughput = vec3(1.0);
        vec3 pos = origin;
        vec3 n   = normal;
        vec3 gn  = geoNormal;

        for (int b = 0; b < GI_BOUNCES; b++) {
            vec3 dir = cosineHemisphere(n, rngNext2(rng));
            if (dot(dir, gn) < 0.0) dir = reflect(dir, gn);

            VoxelHit h = traceVoxels(pos, dir, GI_MAX_STEPS, 1024.0);
            if (!h.hit) {
                radiance += throughput * giSkyRadiance(dir, ctx) * (GI_SKY_STRENGTH * skyOcclusion);
                break;
            }

            if (voxelIsEmitter(h.type)) {
                vec3 e = voxelEmission(h.type, h.albedo) * EMISSION_STRENGTH;
                // firefly control on deep bounces
                if (b > 0) e = min(e, vec3(8.0 * EMISSION_STRENGTH) / float(b + 1));
                radiance += throughput * e;
                break;
            }

            throughput *= h.albedo;
            vec3 hitPos = h.pos + h.normal * 0.005;

            // next event estimation toward the directional light
            float NdotL = dot(h.normal, ctx.lightDir);
            if (NdotL > 0.0 && maxOf(ctx.lightColor) > 1e-5) {
                vec3 vis = shadowSimple(voxelToPlayer(hitPos) + h.normal * 0.05, true);
                radiance += throughput * ctx.lightColor * (NdotL * INV_PI * GI_SUN_STRENGTH) * vis;
            }

            // russian roulette
            if (b + 1 >= GI_RUSSIAN_ROULETTE) {
                float p = clamp(maxOf(throughput), 0.05, 0.95);
                if (rngNext(rng) > p) break;
                throughput /= p;
            }

            pos = hitPos;
            n = gn = h.normal;
        }
        total += radiance;
    }
    total /= float(GI_SAMPLES);
    // final firefly clamp in luminance
    float l = luminance(total);
    total *= min(1.0, (24.0 + EMISSION_STRENGTH * 4.0) / max(l, 1e-6));
    return vec4(total, 1.0);
}

#endif
