// =====================================================================================
//  ABYSSAL PATHTRACER — global settings
//  Every #define below is exposed in the in-game shader options menu (OptiFine & Iris).
//  Defaults = UNRESTRICTED profile. Lower profiles are defined in shaders.properties.
// =====================================================================================
#ifndef SETTINGS_GLSL
#define SETTINGS_GLSL

// ---------------------------------------------------------------- Shadows -----------
// Atlas layout (16384²): [0,0.5)x[0,0.5) near cascade, [0,0.5)x[0.5,1) far cascade,
// [0.5,1)x[0,1) world-space voxel volume used by PTGI and ray-traced reflections.
const int   shadowMapResolution     = 16384; // [4096 8192 16384]
const float shadowDistance          = 256.0; // [128.0 192.0 256.0 384.0 512.0]
const float shadowDistanceRenderMul = 1.0;
const float shadowIntervalSize      = 2.0;
const float sunPathRotation         = -25.0; // [-45.0 -40.0 -35.0 -30.0 -25.0 -20.0 -15.0 -10.0 -5.0 0.0 5.0 10.0 15.0 20.0 25.0 30.0 35.0 40.0 45.0]
const bool  shadowHardwareFiltering = false;
const bool  shadowtex0Nearest       = true;
const bool  shadowtex1Nearest       = true;
const bool  shadowcolor0Nearest     = true;
const bool  shadowcolor1Nearest     = true;

#define SHADOWS
#define CASCADE_NEAR_RADIUS 48.0      // [16.0 24.0 32.0 48.0 64.0 96.0 128.0]
#define PCSS_BLOCKER_SAMPLES 32       // [8 12 16 24 32 48 64]
#define PCSS_FILTER_SAMPLES 64        // [8 16 24 32 48 64 96 128]
#define SUN_ANGULAR_RADIUS 0.267      // [0.1 0.267 0.5 0.75 1.0 1.5 2.0 3.0] Physical sun = 0.267 degrees
#define PCSS_MAX_PENUMBRA 4.0         // [1.0 2.0 4.0 8.0 16.0] Max penumbra width in blocks
#define PCSS_MIN_PENUMBRA 0.75        // [0.5 0.75 1.0 1.5 2.0] Minimum filter width in shadow texels
#define CONTACT_SHADOWS
#define CONTACT_SHADOW_STEPS 24       // [8 12 16 24 32 48 64]
#define CONTACT_SHADOW_LENGTH 0.75    // [0.25 0.5 0.75 1.0 1.5 2.0]
#define COLORED_SHADOWS
#define WATER_CAUSTICS
#define CAUSTICS_STRENGTH 1.0         // [0.25 0.5 0.75 1.0 1.5 2.0 3.0]

// ---------------------------------------------------------------- PTGI --------------
#define PTGI
#define GI_BOUNCES 8                  // [1 2 3 4 5 6 7 8]
#define GI_SAMPLES 1                  // [1 2 3 4 6 8 12 16]
#define GI_MAX_STEPS 128              // [32 48 64 96 128 192 256]
#define VOXEL_SIZE_XZ 512             // [128 256 512]
#define VOXEL_SIZE_Y 256              // [128 256]
#define GI_SKY_STRENGTH 1.0           // [0.0 0.25 0.5 0.75 1.0 1.25 1.5 2.0]
#define GI_SUN_STRENGTH 1.0           // [0.0 0.25 0.5 0.75 1.0 1.25 1.5 2.0]
#define EMISSION_STRENGTH 6.0         // [1.0 2.0 3.0 4.0 6.0 8.0 12.0 16.0 24.0]
#define GI_RUSSIAN_ROULETTE 3         // [1 2 3 4 5 6 8] First bounce at which Russian roulette may terminate paths
#define LIGHTMAP_BLOCKLIGHT 0.15      // [0.0 0.05 0.1 0.15 0.25 0.5 1.0] Lightmap blocklight assist (reduces noise near small emitters)

// SVGF denoiser
#define SVGF
#define SVGF_TEMPORAL_FRAMES 64       // [8 16 24 32 48 64 96 128]
#define SVGF_ATROUS_PASSES 4          // [0 1 2 3 4]
#define SVGF_PHI_COLOR 4.0            // [1.0 2.0 4.0 8.0 16.0]
#define SVGF_PHI_NORMAL 128.0         // [16.0 32.0 64.0 128.0 256.0]
#define SVGF_PHI_DEPTH 1.0            // [0.25 0.5 1.0 2.0 4.0]

// ---------------------------------------------------------------- Volumetrics -------
#define VOLUMETRIC_FOG
#define VL_STEPS 256                  // [32 48 64 96 128 192 256 384 512]
#define VL_DISTANCE 384.0             // [64.0 128.0 192.0 256.0 384.0 512.0]
#define FOG_DENSITY 1.0               // [0.0 0.25 0.5 0.75 1.0 1.5 2.0 3.0 4.0 6.0 8.0]
#define FOG_HEIGHT 72.0               // [40.0 56.0 64.0 72.0 80.0 96.0 128.0]
#define FOG_FALLOFF 24.0              // [8.0 12.0 16.0 24.0 32.0 48.0 64.0]
#define FOG_ANISOTROPY 0.76           // [0.0 0.3 0.5 0.65 0.76 0.85 0.92]
#define FOG_NOISE
#define ATMOSPHERE_STEPS 24           // [8 12 16 24 32 48]
#define RAIN_FOG 3.0                  // [0.0 1.0 2.0 3.0 4.0 6.0]

// ---------------------------------------------------------------- Reflections -------
#define SSR
#define SSR_STEPS 64                  // [16 24 32 48 64 96 128]
#define SSR_REFINE 8                  // [0 2 4 6 8 12 16]
#define RT_REFLECTIONS
#define RT_REFLECTION_STEPS 192       // [32 64 96 128 192 256]
#define ROUGH_REFLECTION_THRESHOLD 0.65 // [0.3 0.4 0.5 0.65 0.8 1.0]

// ---------------------------------------------------------------- Water -------------
#define WATER_WAVES
#define WATER_WAVE_HEIGHT 1.0         // [0.0 0.25 0.5 0.75 1.0 1.5 2.0]
#define WATER_WAVE_SPEED 1.0          // [0.25 0.5 0.75 1.0 1.5 2.0]
#define WATER_REFRACTION 1.0          // [0.0 0.25 0.5 0.75 1.0 1.5 2.0]
#define WATER_ABSORPTION 1.0          // [0.25 0.5 0.75 1.0 1.5 2.0 3.0]
#define WATER_SCATTERING 1.0          // [0.0 0.25 0.5 0.75 1.0 1.5 2.0]

// ---------------------------------------------------------------- Materials ---------
#define LABPBR
#define POM
#define POM_STEPS 512                 // [32 64 96 128 192 256 384 512]
#define POM_DEPTH 0.25                // [0.05 0.1 0.15 0.2 0.25 0.3 0.4 0.5]
#define POM_DISTANCE 48.0             // [8.0 16.0 24.0 32.0 48.0 64.0 96.0]
#define POM_SHADOWS
#define POM_SHADOW_STEPS 128          // [16 32 64 96 128 192 256]
#define SPECULAR_AA
#define SPECULAR_AA_VARIANCE 0.25     // [0.05 0.1 0.15 0.25 0.35 0.5]
#define SPECULAR_AA_THRESHOLD 0.18    // [0.05 0.1 0.18 0.25 0.35]
#define NORMAL_MAP_STRENGTH 1.0       // [0.0 0.25 0.5 0.75 1.0 1.25 1.5 2.0]
#define VANILLA_AO 0.35               // [0.0 0.1 0.2 0.35 0.5 0.75 1.0]
#define HARDCODED_EMISSION
#define SSS
#define SSS_STRENGTH 1.0              // [0.0 0.25 0.5 0.75 1.0 1.5 2.0 3.0]
#define SSS_DEPTH 2.0                 // [0.5 1.0 1.5 2.0 3.0 4.0 6.0] Scattering mean free path in blocks
#define WAVING_PLANTS
#define WAVING_SPEED 1.0              // [0.25 0.5 0.75 1.0 1.5 2.0]

// ---------------------------------------------------------------- Camera / post -----
#define TAA
#define TAA_BLEND 0.92                // [0.8 0.85 0.88 0.9 0.92 0.94 0.96]
#define AUTO_EXPOSURE
#define EXPOSURE 0.0                  // [-4.0 -3.0 -2.0 -1.5 -1.0 -0.5 0.0 0.5 1.0 1.5 2.0 3.0 4.0] EV bias
#define EXPOSURE_SPEED 1.5            // [0.25 0.5 1.0 1.5 2.0 4.0 8.0]
#define BLOOM
#define BLOOM_STRENGTH 0.06           // [0.01 0.02 0.04 0.06 0.08 0.12 0.16 0.24]
#define TONEMAP_SATURATION 1.0        // [0.6 0.8 0.9 1.0 1.1 1.2 1.4]
#define TONEMAP_CONTRAST 1.0          // [0.8 0.9 1.0 1.1 1.2]
#define SUN_ILLUMINANCE 4.0           // [1.0 2.0 3.0 4.0 6.0 8.0]
#define MOON_ILLUMINANCE 0.02         // [0.005 0.01 0.02 0.04 0.08]
#define SKY_BRIGHTNESS 1.0            // [0.5 0.75 1.0 1.25 1.5 2.0]
#define STARS

// ---------------------------------------------------------------- Debug -------------
#define DEBUG_VIEW 0                  // [0 1 2 3 4 5 6 7] 0=Off 1=Albedo 2=Normals 3=GI raw 4=GI denoised 5=Shadows 6=Voxels 7=Volumetrics

// ----------------------------------------------------------------- Derived -----------
const float sunAngularRadius = SUN_ANGULAR_RADIUS * 0.01745329;

#endif
