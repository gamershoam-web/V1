#ifndef TONEMAP_GLSL
#define TONEMAP_GLSL
// -------------------------------------------------------------------------------------
//  ACES filmic: sRGB -> ACEScg (AP1) input transform, RRT + ODT fit (S. Hill),
//  AP1 -> sRGB output transform. Grading happens in AP1 before the RRT.
// -------------------------------------------------------------------------------------

const mat3 ACESInputMat = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777
);
const mat3 ACESOutputMat = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602
);

vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
}

vec3 acesFilmic(vec3 color) {
    color = ACESInputMat * color;
    float l = dot(color, vec3(0.2722287, 0.6740818, 0.0536895));
    color = max(mix(vec3(l), color, TONEMAP_SATURATION), 0.0);
    color = pow(color / 0.18, vec3(TONEMAP_CONTRAST)) * 0.18;
    color = RRTAndODTFit(color);
    color = ACESOutputMat * color;
    return saturate(color);
}

#endif
