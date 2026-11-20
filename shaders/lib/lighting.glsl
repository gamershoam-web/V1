#ifndef LIGHTING_GLSL
#define LIGHTING_GLSL
// shared light context construction + lightmap fallbacks
#include "/lib/atmosphere.glsl"
#include "/lib/ptgi.glsl"

const vec3 blockLightTint = vec3(1.0, 0.56, 0.26);

// inverse-square-like falloff reconstructed from the vanilla lightmap
vec3 lightmapBlockLight(float lm) {
    float d = 15.0 * (1.0 - lm);              // approximate distance to source in blocks
    float falloff = lm * lm / (1.0 + d * d * 0.35);
    return blockLightTint * falloff * EMISSION_STRENGTH * 0.5;
}

vec3 netherAmbient() { return vec3(0.12, 0.035, 0.02); }
vec3 endAmbient()    { return vec3(0.045, 0.035, 0.07); }

// cheap analytic sky colours (used per-vertex / per-fragment in gbuffers)
void skyColorsApprox(vec3 sunDir, vec3 sunIllum, vec3 moonIllum, out vec3 zenith, out vec3 horizon) {
    vec3 e = sunIllum + moonIllum;
    float twilight = pow(saturate(1.0 - abs(sunDir.y) * 3.0), 2.0);
    // fitted to skyScatter() for a mid-day sun (radiance / sun irradiance)
    zenith  = e * vec3(0.0080, 0.0160, 0.0340) * SKY_BRIGHTNESS;
    horizon = e * mix(vec3(0.028, 0.045, 0.060), vec3(0.045, 0.030, 0.016), twilight) * SKY_BRIGHTNESS;
    zenith  += vec3(0.0006, 0.0008, 0.0014);   // airglow floor
    horizon += vec3(0.0006, 0.0008, 0.0012);
}

LightContext buildLightContext(bool fullSky) {
    LightContext c;
    vec3 sunDir  = worldSunDir();
    vec3 moonDir = worldMoonDir();
    c.sunDir   = sunDir;
    c.lightDir = worldLightDir();
#if defined DIM_NETHER
    c.sunIllum = vec3(0.0);
    c.lightColor = vec3(0.0);
    c.skyZenith = c.skyHorizon = netherAmbient();
#elif defined DIM_END
    c.sunIllum = vec3(0.0);
    c.lightColor = vec3(0.30, 0.25, 0.45);
    c.skyZenith = c.skyHorizon = endAmbient();
#else
    vec3 sunI  = sunIlluminance(sunDir);
    vec3 moonI = moonIlluminance(moonDir);
    c.sunIllum = sunI;
    c.lightColor = (sunDir.y > -0.02 ? sunI : moonI) * (1.0 - rainStrength * 0.85);
    if (fullSky) {
        vec3 h = normalize(vec3(sunDir.x, 0.0, sunDir.z) + vec3(1e-4));
        vec3 side = normalize(cross(h, vec3(0.0, 1.0, 0.0)));
        c.skyZenith  = skyScatter(vec3(0.0, 1.0, 0.0), sunDir, sunI, moonDir, moonI);
        c.skyHorizon = (skyScatter(normalize(h + vec3(0, 0.1, 0)), sunDir, sunI, moonDir, moonI) +
                        skyScatter(normalize(-h + vec3(0, 0.1, 0)), sunDir, sunI, moonDir, moonI) +
                        skyScatter(normalize(side + vec3(0, 0.1, 0)), sunDir, sunI, moonDir, moonI) * 2.0) * 0.25;
        c.skyZenith  += vec3(0.0006, 0.0008, 0.0014);
        c.skyHorizon += vec3(0.0006, 0.0008, 0.0012);
    } else {
        skyColorsApprox(sunDir, sunI, moonI, c.skyZenith, c.skyHorizon);
    }
    float rainDim = 1.0 - rainStrength * 0.6;
    c.skyZenith  = mix(c.skyZenith * rainDim, vec3(luminance(c.skyZenith)) * rainDim, rainStrength * 0.7);
    c.skyHorizon = mix(c.skyHorizon * rainDim, vec3(luminance(c.skyHorizon)) * rainDim, rainStrength * 0.7);
#endif
    return c;
}

// ambient irradiance factor (= average incident radiance) without PTGI
vec3 fallbackAmbient(vec3 n, vec2 lm, LightContext c) {
    vec3 sky = giSkyRadiance(normalize(n + vec3(0.0, 0.6, 0.0)), c);
#if defined DIM_NETHER || defined DIM_END
    return sky + lightmapBlockLight(lm.x) + vec3(0.002);
#else
    return sky * lm.y * lm.y + lightmapBlockLight(lm.x) + vec3(0.0015) * (1.0 + nightVision * 20.0);
#endif
}

#endif
