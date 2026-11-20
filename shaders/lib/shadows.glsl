#ifndef SHADOWS_GLSL
#define SHADOWS_GLSL
// -------------------------------------------------------------------------------------
//  Percentage-Closer Soft Shadows on the dual-cascade atlas, with translucent / water
//  colored shadows and water caustics, plus screen-space ray-traced contact shadows.
//  Requires the including program to declare:
//      uniform sampler2D shadowtex0, shadowtex1, shadowcolor0;
// -------------------------------------------------------------------------------------
#include "/lib/shadowspace.glsl"

const vec3 waterAbsorptionCoeff = vec3(0.32, 0.075, 0.045) * WATER_ABSORPTION;
const vec3 waterScatterCoeff    = vec3(0.024, 0.056, 0.064) * WATER_SCATTERING;

vec2 clampToRect(vec2 uv, vec4 rect) {
    vec2 h = vec2(0.5 / float(shadowMapResolution));
    return clamp(uv, rect.xy + h, rect.zw - h);
}

// colored visibility of one shadow texel
vec3 shadowTapColored(vec2 uv, float depth) {
    float dOpaque = textureLod(shadowtex1, uv, 0.0).r;
    if (depth > dOpaque) return vec3(0.0);
#ifdef COLORED_SHADOWS
    float dAll = textureLod(shadowtex0, uv, 0.0).r;
    if (depth <= dAll) return vec3(1.0);
    vec4 c = textureLod(shadowcolor0, uv, 0.0);
    if (c.a < 0.5) {
        // water surface: r = caustic intensity / 4, absorption by traversed water depth
        float pathLen = shadowDepthToBlocks(depth - dAll);
    #ifdef WATER_CAUSTICS
        float caustic = mix(1.0, c.r * 4.0, CAUSTICS_STRENGTH * saturate(pathLen * 0.5));
    #else
        float caustic = 1.0;
    #endif
        return caustic * exp(-waterAbsorptionCoeff * pathLen);
    }
    return c.rgb;
#else
    return vec3(1.0);
#endif
}

float shadowTapOpaque(vec2 uv, float depth) {
    return step(depth, textureLod(shadowtex1, uv, 0.0).r);
}

// biased shadow-space position of a surface point (returns atlas uv + depth, cascade)
bool shadowCoord(vec3 playerPos, vec3 geoNormal, float NdotL, out vec3 coord, out int cascade) {
    vec3 clip = shadowViewToClip(playerToShadowView(playerPos));
    cascade = selectCascade(clip, 0.05);
    if (cascade < 0) return false;
    float texel = cascadeTexelWorld(cascade);
    // normal offset + slope scaled bias, both proportional to texel footprint
    float slope = sqrt(saturate(1.0 - NdotL * NdotL)) / max(NdotL, 0.05);
    vec3 biased = playerPos + geoNormal * texel * (1.2 + 1.5 * min(slope, 8.0));
    clip = shadowViewToClip(playerToShadowView(biased));
    vec3 ndc = clipToCascadeNDC(clip, cascade);
    coord = ndc * 0.5 + 0.5;
    coord.z -= texel * 0.25 * abs(shadowProjection[2][2]) * 0.5;
    return true;
}

// ---------------------------------------------------------------- PCSS --------------
vec3 shadowPCSS(vec3 playerPos, vec3 geoNormal, float NdotL, float dither, out float blockerDistance) {
    blockerDistance = 0.0;
    vec3 coord; int cascade;
    if (!shadowCoord(playerPos, geoNormal, NdotL, coord, cascade)) return vec3(1.0);

    vec4  rect      = cascadeRect(cascade);
    float uvPerBlk  = cascadeUVPerBlock(cascade);
    float texelUV   = 1.0 / float(shadowMapResolution);
    float phi       = dither * TAU;
    float tanSun    = tan(sunAngularRadius);

    // 1) blocker search -- radius bounded by the largest physically possible penumbra
    float searchRadius = max(PCSS_MAX_PENUMBRA * 0.5 * uvPerBlk, texelUV * 4.0);
    float blockerSum = 0.0;
    float blockers   = 0.0;
    for (int i = 0; i < PCSS_BLOCKER_SAMPLES; i++) {
        vec2 uv = clampToRect(coord.xy + vogelDisk(i, PCSS_BLOCKER_SAMPLES, phi) * searchRadius, rect);
        float d = textureLod(shadowtex1, uv, 0.0).r;
        if (d < coord.z) {
            // only blockers that can actually cast a penumbra this wide count
            float dist = shadowDepthToBlocks(coord.z - d);
            float reach = dist * tanSun * uvPerBlk + texelUV * 2.0;
            float w = step(length(uv - coord.xy), max(reach, searchRadius * 0.15));
            blockerSum += d * w;
            blockers   += w;
        }
    }
    if (blockers < 0.5) {
        // fully lit by opaque geometry; still resolve translucent tint at center
        return shadowTapColored(coord.xy, coord.z);
    }
    float avgBlocker = blockerSum / blockers;
    blockerDistance  = shadowDepthToBlocks(coord.z - avgBlocker);

    // 2) penumbra estimation: w = 2 * d_blocker * tan(theta_sun) (directional area light)
    float penumbraBlocks = min(2.0 * blockerDistance * tanSun, PCSS_MAX_PENUMBRA);
    float filterRadius   = max(penumbraBlocks * 0.5 * uvPerBlk, PCSS_MIN_PENUMBRA * texelUV);

    // 3) filtering
    vec3 sum = vec3(0.0);
    for (int i = 0; i < PCSS_FILTER_SAMPLES; i++) {
        vec2 uv = clampToRect(coord.xy + vogelDisk(i, PCSS_FILTER_SAMPLES, phi + 1.7) * filterRadius, rect);
        sum += shadowTapColored(uv, coord.z);
    }
    return sum / float(PCSS_FILTER_SAMPLES);
}

// single tap visibility (volumetrics, GI next-event estimation)
vec3 shadowSimple(vec3 playerPos, bool colored) {
    vec3 clip = shadowViewToClip(playerToShadowView(playerPos));
    int cascade = selectCascade(clip, 0.02);
    if (cascade < 0) return vec3(1.0);
    vec3 coord = clipToCascadeNDC(clip, cascade) * 0.5 + 0.5;
    coord.z -= cascadeTexelWorld(cascade) * abs(shadowProjection[2][2]);
    return colored ? shadowTapColored(coord.xy, coord.z) : vec3(shadowTapOpaque(coord.xy, coord.z));
}

// thickness through which light travels before reaching the point (for SSS)
float shadowThickness(vec3 playerPos, vec3 geoNormal) {
    vec3 clip = shadowViewToClip(playerToShadowView(playerPos - geoNormal * 0.02));
    int cascade = selectCascade(clip, 0.02);
    if (cascade < 0) return 0.0;
    vec3 coord = clipToCascadeNDC(clip, cascade) * 0.5 + 0.5;
    float d = textureLod(shadowtex1, coord.xy, 0.0).r;
    return max(shadowDepthToBlocks(coord.z - d), 0.0);
}

// ---------------------------------------------------------------- contact shadows ---
// Screen-space ray march against the depth buffer: recovers sub-texel occlusion and
// contact hardening at the exact point where geometry meets geometry.
float contactShadow(sampler2D depthTex, vec3 viewPos, vec3 lightDirView, float dither) {
#ifdef CONTACT_SHADOWS
    float dist = length(viewPos);
    if (dist > 64.0) return 1.0;
    float rayLen  = CONTACT_SHADOW_LENGTH * (1.0 + dist * 0.02);
    vec3  stepVec = lightDirView * (rayLen / float(CONTACT_SHADOW_STEPS));
    vec3  ray     = viewPos + stepVec * dither + lightDirView * 0.005 * dist;
    float thickness = 0.08 + dist * 0.004;
    for (int i = 0; i < CONTACT_SHADOW_STEPS; i++) {
        ray += stepVec;
        vec3 screen = viewToScreen(ray);
        if (any(lessThan(screen.xy, vec2(0.0))) || any(greaterThan(screen.xy, vec2(1.0)))) break;
        float sceneDepth = textureLod(depthTex, screen.xy, 0.0).r;
        if (sceneDepth < 0.56) continue; // hand
        float delta = linearizeDepth(screen.z) - linearizeDepth(sceneDepth);
        if (delta > 0.0 && delta < thickness) {
            return mix(0.0, 1.0, smoothstep(40.0, 64.0, dist));
        }
    }
#endif
    return 1.0;
}

#endif
