#ifndef SHADOWSPACE_GLSL
#define SHADOWSPACE_GLSL
// -------------------------------------------------------------------------------------
//  Dual-cascade shadow atlas mapping.
//  The vanilla shadow projection (ortho, half-size = shadowDistance) is used for the
//  depth axis of both cascades. XY is re-scaled per cascade and packed into the left
//  half of the 16384² atlas:
//      cascade 0 (near, CASCADE_NEAR_RADIUS)  -> atlas uv [0,0.5) x [0,0.5)
//      cascade 1 (far,  shadowDistance)       -> atlas uv [0,0.5) x [0.5,1)
//  The right half [0.5,1) x [0,1) holds the PTGI voxel volume (see voxel.glsl).
// -------------------------------------------------------------------------------------

const float shadowRegionRes = float(shadowMapResolution) * 0.5;

float shadowHalfSize() { return 1.0 / shadowProjection[0][0]; }

float cascadeScale(int c) {
    return c == 0 ? max(shadowHalfSize() / CASCADE_NEAR_RADIUS, 1.0) : 1.0;
}
vec2 cascadeOffset(int c) {
    return c == 0 ? vec2(-0.5, -0.5) : vec2(-0.5, 0.5);
}
// atlas uv rectangle of a cascade (min.xy, max.xy)
vec4 cascadeRect(int c) {
    return c == 0 ? vec4(0.0, 0.0, 0.5, 0.5) : vec4(0.0, 0.5, 0.5, 1.0);
}

vec3 playerToShadowView(vec3 playerPos) {
    return mat3(shadowModelView) * playerPos + shadowModelView[3].xyz;
}
vec3 shadowViewToClip(vec3 sv) {
    return vec3(shadowProjection[0][0] * sv.x + shadowProjection[3][0],
                shadowProjection[1][1] * sv.y + shadowProjection[3][1],
                shadowProjection[2][2] * sv.z + shadowProjection[3][2]);
}
// full-projection clip -> atlas NDC of cascade c
vec3 clipToCascadeNDC(vec3 clip, int c) {
    return vec3(clip.xy * cascadeScale(c) * 0.5 + cascadeOffset(c), clip.z);
}

// choose the sharpest cascade containing the point; -1 if outside the shadow map
int selectCascade(vec3 clip, float margin) {
    vec2 c0 = abs(clip.xy * cascadeScale(0));
    if (max(c0.x, c0.y) < 1.0 - margin) return 0;
    if (max(abs(clip.x), abs(clip.y)) < 1.0 - margin * 0.25) return 1;
    return -1;
}

// world blocks covered by one atlas texel in cascade c
float cascadeTexelWorld(int c) {
    return 2.0 * shadowHalfSize() / cascadeScale(c) / shadowRegionRes;
}
// atlas uv per world block in cascade c
float cascadeUVPerBlock(int c) {
    return 0.25 * cascadeScale(c) / shadowHalfSize();
}
// shadow texture depth difference -> blocks
float shadowDepthToBlocks(float dd) {
    return 2.0 * dd / abs(shadowProjection[2][2]);
}

#endif
