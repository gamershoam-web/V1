#ifndef REFLECTIONS_GLSL
#define REFLECTIONS_GLSL
// -------------------------------------------------------------------------------------
//  Multi-layer reflections:
//    layer 1  screen-space ray march (hierarchical refinement) against depthtex1
//    layer 2  world-space voxel ray tracing for off-screen / occluded geometry
//    layer 3  physical sky, occluded by the surface's sky light
//  Glossy lobes are importance sampled (GGX VNDF) and resolved by TAA.
//  Requires: depthtex1, colortex7 (lit scene), shadowcolor1 (voxels), shadow samplers.
// -------------------------------------------------------------------------------------

bool traceScreenSpace(vec3 viewPos, vec3 dirView, float dither, out vec2 hitUV, out float hitDist) {
    hitUV = vec2(0.0); hitDist = 0.0;
#ifdef SSR
    float maxLen = far * 1.5;
    if (dirView.z > 0.0) maxLen = min(maxLen, (-near * 1.01 - viewPos.z) / dirView.z);
    vec3 s0 = viewToScreen(viewPos);
    vec3 s1 = viewToScreen(viewPos + dirView * maxLen);
    vec3 d = s1 - s0;
    // clip the screen-space segment to the viewport
    float t = 1.0;
    if (d.x > 0.0) t = min(t, (1.0 - s0.x) / d.x); else if (d.x < 0.0) t = min(t, -s0.x / d.x);
    if (d.y > 0.0) t = min(t, (1.0 - s0.y) / d.y); else if (d.y < 0.0) t = min(t, -s0.y / d.y);
    d *= max(t, 0.0);

    vec3 stepV = d / float(SSR_STEPS);
    vec3 p = s0 + stepV * (dither + 0.05);
    for (int i = 0; i < SSR_STEPS; i++) {
        float sceneD = textureLod(depthtex1, p.xy, 0.0).r;
        if (p.z > sceneD && sceneD > 0.56) {
            float lr = linearizeDepth(p.z), ls = linearizeDepth(sceneD);
            float tol = abs(linearizeDepth(p.z) - linearizeDepth(max(p.z - stepV.z, 0.0))) * 2.0 + 0.3 + lr * 0.01;
            if (lr - ls < tol) {
                // binary refinement
                vec3 a = p - stepV, b = p;
                for (int j = 0; j < SSR_REFINE; j++) {
                    vec3 mid = (a + b) * 0.5;
                    if (mid.z > textureLod(depthtex1, mid.xy, 0.0).r) b = mid; else a = mid;
                }
                hitUV = b.xy;
                hitDist = length(screenToView(vec3(b.xy, textureLod(depthtex1, b.xy, 0.0).r)) - viewPos);
                return sceneD < 1.0;
            }
        }
        p += stepV;
        if (p.z >= 1.0) break;
    }
#endif
    return false;
}

vec3 shadeVoxelHit(VoxelHit h, LightContext ctx, float skyOcc) {
    vec3 hp = voxelToPlayer(h.pos + h.normal * 0.01);
    if (voxelIsEmitter(h.type)) return voxelEmission(h.type, h.albedo) * EMISSION_STRENGTH;
    float NdotL = saturate(dot(h.normal, ctx.lightDir));
    vec3 sun = NdotL > 0.0 ? ctx.lightColor * NdotL * INV_PI * shadowSimple(hp + h.normal * 0.05, true) : vec3(0.0);
    vec3 amb = giSkyRadiance(normalize(h.normal + vec3(0.0, 0.5, 0.0)), ctx) * skyOcc * 0.6 + vec3(0.002);
    return h.albedo * (sun + amb);
}

vec3 reflectionSky(vec3 R, LightContext ctx) {
#if defined DIM_NETHER || defined DIM_END
    return ctx.skyHorizon;
#else
    return skyScatter(R, ctx.sunDir, ctx.sunIllum, worldMoonDir(), moonIlluminance(worldMoonDir()));
#endif
}

// returns reflected radiance; R is the (sampled) reflection direction in world space
vec3 traceReflection(vec3 viewPos, vec3 playerPos, vec3 N, vec3 R, float skyLight, float dither, LightContext ctx) {
    float skyOcc = smoothstep(0.0, 0.9, skyLight);
    vec3 Rv = mat3(gbufferModelView) * R;

    vec2 hitUV; float hitDist;
    float ssrWeight = 0.0;
    vec3 ssrColor = vec3(0.0);
    if (traceScreenSpace(viewPos, Rv, dither, hitUV, hitDist)) {
        vec2 edge = min(hitUV, 1.0 - hitUV);
        ssrWeight = saturate(min(edge.x, edge.y) * 12.0);
        ssrColor = textureLod(colortex7, hitUV, 0.0).rgb;
        if (ssrWeight >= 0.999) return ssrColor;
    }

    vec3 fallback;
#ifdef RT_REFLECTIONS
    vec3 origin = playerToVoxel(playerPos + N * 0.02);
    VoxelHit h;
    h.hit = false;
    if (insideVoxelVolume(origin)) h = traceVoxels(origin, R, RT_REFLECTION_STEPS, 768.0);
    if (h.hit) fallback = shadeVoxelHit(h, ctx, skyOcc);
    else fallback = reflectionSky(R, ctx) * skyOcc;
#else
    fallback = reflectionSky(R, ctx) * skyOcc;
#endif
    return mix(fallback, ssrColor, ssrWeight);
}

vec3 sampleReflectionDir(vec3 V /*eye->surface*/, vec3 N, float roughness, vec2 xi) {
    if (roughness < 0.002) return reflect(V, N);
    mat3 tbn = tbnFromNormal(N);
    vec3 Ve = -V * tbn;
    vec3 H = tbn * sampleGGXVNDF(Ve, roughness, xi);
    vec3 R = reflect(V, H);
    return dot(R, N) > 0.0 ? R : reflect(V, N);
}

#endif
