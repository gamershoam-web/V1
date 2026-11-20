#ifndef VOLUMETRICS_GLSL
#define VOLUMETRICS_GLSL
// -------------------------------------------------------------------------------------
//  Ray-marched participating media: height fog + animated density noise + aerial
//  Rayleigh haze in air, absorbing/scattering water when submerged. Shadow-map
//  visibility per step yields crepuscular rays; integration is energy conserving
//  (Hillaire 2015): S += T * (L_scat - L_scat * exp(-sigma_t ds)) / sigma_t.
//  Requires shadows.glsl, atmosphere.glsl and ptgi.glsl's LightContext.
// -------------------------------------------------------------------------------------

const vec3 airRayleighPerBlock = betaRayleigh * 30.0;

float fogNoise(vec3 wp) {
#ifdef FOG_NOISE
    vec3 wind = vec3(1.0, 0.0, 0.4) * frameTimeCounter * 0.6;
    vec3 p = wp * 0.025 + wind * 0.025;
    float n = valueNoise3D(p) * 0.55 + valueNoise3D(p * 2.7 + 13.1) * 0.3 + valueNoise3D(p * 6.1 - 7.3) * 0.15;
    return saturate(n * 1.9 - 0.35);
#else
    return 0.6;
#endif
}

float fogDensityAt(vec3 wp) {
    float height = exp(-max(wp.y - FOG_HEIGHT, 0.0) / FOG_FALLOFF);
    height = min(height * (1.0 + max(FOG_HEIGHT - wp.y, 0.0) * 0.01), 2.0);
    float morning = 1.0 + 2.0 * pow(saturate(1.0 - abs(worldSunDir().y) * 4.0), 2.0);
    float weather = 1.0 + rainStrength * RAIN_FOG;
    return 0.003 * FOG_DENSITY * height * morning * weather * (0.25 + 1.5 * fogNoise(wp));
}

// returns vec4(in-scattered radiance, mean transmittance)
vec4 marchVolumetrics(vec3 endPlayer, float dither, LightContext ctx, float skyExposure) {
    float dist = min(length(endPlayer), VL_DISTANCE);
    vec3  dir = endPlayer / max(length(endPlayer), 1e-4);
    float ds = dist / float(VL_STEPS);
    float cosT = dot(dir, ctx.lightDir);

    bool water = isEyeInWater == 1;
    float phaseM = water ? phaseHG(cosT, 0.65) : phaseFog(cosT, FOG_ANISOTROPY);
    float phaseR = phaseRayleigh(cosT);
    vec3  ambient = giSkyRadiance(vec3(0.0, 1.0, 0.0), ctx) * skyExposure;

    vec3 T = vec3(1.0);
    vec3 S = vec3(0.0);
    for (int i = 0; i < VL_STEPS; i++) {
        float t = (float(i) + dither) * ds;
        vec3 p = dir * t;
        vec3 sigmaS, sigmaT, scatterLight;
        vec3 vis = shadowSimple(p, true);
        if (water) {
            sigmaS = waterScatterCoeff;
            sigmaT = waterAbsorptionCoeff + sigmaS;
            scatterLight = sigmaS * (ctx.lightColor * vis * phaseM + ambient * 0.25 * INV_PI);
        } else {
#if defined DIM_NETHER
            float d = 0.01 * FOG_DENSITY * (0.4 + fogNoise(p + cameraPosition));
            sigmaS = vec3(d); sigmaT = vec3(d * 1.2);
            scatterLight = sigmaS * ctx.skyHorizon * 0.5;
#else
            float d = fogDensityAt(p + cameraPosition);
            vec3 air = airRayleighPerBlock;
            sigmaS = vec3(d) + air;
            sigmaT = vec3(d * 1.05) + air;
            scatterLight = ctx.lightColor * vis * (d * phaseM + air * phaseR) + ambient * (d + air) * 0.25;
#endif
        }
        vec3 stepT = exp(-sigmaT * ds);
        S += T * scatterLight * (1.0 - stepT) / max(sigmaT, vec3(1e-7));
        T *= stepT;
        if (maxOf(T) < 0.002) break;
    }
    return vec4(S, dot(T, vec3(0.3333)));
}

#endif
