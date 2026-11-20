#ifndef BUFFERS_GLSL
#define BUFFERS_GLSL
/*
    ---------------------------------------------------------------- buffer layout ----
    colortex0   RGBA8      albedo (sRGB) | AO                                gbuffers
    colortex1   RGBA16     oct texture normal | oct geometry normal          gbuffers
    colortex2   RGBA8      LabPBR specular                                   gbuffers
    colortex3   RGBA8      lightmap | material id | POM shadow               gbuffers
    colortex4   RGBA16F    translucent premultiplied colour | coverage       gbuffers_water
    colortex5   RGBA16F    GI radiance | variance (ping-pong)                deferred0-5
    colortex6   RGBA16F    GI temporal history | history length  (persist)   deferred1
    colortex7   RGBA16F    HDR scene radiance (mipmapped)                    deferred6+
    colortex8   RGBA32F    SVGF moments | linear depth | packed normal      deferred1
    colortex9   RGBA16F    volumetric in-scatter | transmittance             composite0
    colortex10  RGBA16F    TAA history | exposure                (persist)   composite2
    colortex11  RGBA16     translucent normal | material | smoothness        gbuffers_water
    colortex12  RGBA16F    bloom tile atlas                                  composite3-5
    shadowcolor0 RGBA8     translucent tint / water caustics
    shadowcolor1 RGBA8     PTGI voxel volume (right half of the atlas)

    const int colortex0Format  = RGBA8;
    const int colortex1Format  = RGBA16;
    const int colortex2Format  = RGBA8;
    const int colortex3Format  = RGBA8;
    const int colortex4Format  = RGBA16F;
    const int colortex5Format  = RGBA16F;
    const int colortex6Format  = RGBA16F;
    const int colortex7Format  = RGBA16F;
    const int colortex8Format  = RGBA32F;
    const int colortex9Format  = RGBA16F;
    const int colortex10Format = RGBA16F;
    const int colortex11Format = RGBA16;
    const int colortex12Format = RGBA16F;
    const int shadowcolor0Format = RGBA8;
    const int shadowcolor1Format = RGBA8;

    const bool colortex6Clear  = false;
    const bool colortex8Clear  = false;
    const bool colortex10Clear = false;

    const vec4 colortex0ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
    const vec4 colortex3ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
    const vec4 colortex4ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
    const vec4 colortex11ClearColor = vec4(0.5, 0.5, 0.0, 0.0);
    const vec4 shadowcolor0ClearColor = vec4(1.0, 1.0, 1.0, 1.0);
    const vec4 shadowcolor1ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
*/
const float ambientOcclusionLevel = 1.0;
const float eyeBrightnessHalflife = 4.0;
const float wetnessHalflife = 300.0;
const float drynessHalflife = 60.0;
#endif
