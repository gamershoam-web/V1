#ifndef VOXEL_GLSL
#define VOXEL_GLSL
// -------------------------------------------------------------------------------------
//  World-space voxel volume, rasterised during the shadow pass into the right half of
//  shadowcolor1 (RGBA8):  rgb = sqrt(albedo) (or emission tint), a = (voxel type)/255.
//  Each Y layer is an XZ slice; slices are tiled across the 8192 x 16384 region.
// -------------------------------------------------------------------------------------

const int voxelRegionW   = shadowMapResolution / 2;
const int voxelRegionH   = shadowMapResolution;
const int voxelTilesX    = voxelRegionW / VOXEL_SIZE_XZ;
const int voxelTilesY    = voxelRegionH / VOXEL_SIZE_XZ;
const int voxelSizeY     = min(VOXEL_SIZE_Y, voxelTilesX * voxelTilesY);
const ivec3 voxelSize    = ivec3(VOXEL_SIZE_XZ, voxelSizeY, VOXEL_SIZE_XZ);
const vec3  voxelHalf    = vec3(voxelSize / 2);

// voxel types
const int VOXEL_EMPTY     = 0;
const int VOXEL_SOLID     = 1;
const int VOXEL_LEAVES    = 2;
const int VOXEL_EMISSIVE  = 3;   // full block emitter, tint = albedo
const int VOXEL_TORCH     = 4;   // warm small emitter
const int VOXEL_SOUL      = 5;   // cyan small emitter
const int VOXEL_REDSTONE  = 6;   // red small emitter
const int VOXEL_LAVA      = 7;
const int VOXEL_FIRE      = 8;
const int VOXEL_END_LIGHT = 9;   // white/purple emitter
const int VOXEL_DIM_EMIT  = 10;  // weak emitter (ores, sculk, ...)

// player space (camera relative) -> continuous voxel coordinates
vec3 playerToVoxel(vec3 playerPos) {
    return playerPos + fract(cameraPosition) + voxelHalf;
}
vec3 voxelToPlayer(vec3 voxelPos) {
    return voxelPos - voxelHalf - fract(cameraPosition);
}
bool insideVoxelVolume(ivec3 v) {
    return all(greaterThanEqual(v, ivec3(0))) && all(lessThan(v, voxelSize));
}
bool insideVoxelVolume(vec3 v) {
    return all(greaterThanEqual(v, vec3(0.0))) && all(lessThan(v, vec3(voxelSize)));
}
// voxel -> texel in shadowcolor1
ivec2 voxelToTexel(ivec3 v) {
    ivec2 tile = ivec2(v.y % voxelTilesX, v.y / voxelTilesX);
    return ivec2(voxelRegionW, 0) + tile * VOXEL_SIZE_XZ + v.xz;
}

int  voxelType(vec4 data) {
    int t = int(data.a * 255.0 + 0.5);
    return (t >= 255) ? VOXEL_EMPTY : t; // OptiFine clears shadowcolor to white
}
vec3 voxelAlbedo(vec4 data) { return data.rgb * data.rgb; }

bool voxelIsEmitter(int t) { return t >= VOXEL_EMISSIVE; }

vec3 voxelEmission(int t, vec3 albedo) {
    if (t == VOXEL_EMISSIVE)  return albedo * (0.6 + 0.8 * luminance(albedo)) * 1.6;
    // small emitters fill a whole cell in the volume: radiance scaled to real flame area
    if (t == VOXEL_TORCH)     return vec3(1.00, 0.52, 0.20) * 0.65;
    if (t == VOXEL_SOUL)      return vec3(0.25, 0.72, 1.00) * 0.45;
    if (t == VOXEL_REDSTONE)  return vec3(1.00, 0.10, 0.03) * 0.30;
    if (t == VOXEL_LAVA)      return vec3(1.00, 0.36, 0.08) * 1.8;
    if (t == VOXEL_FIRE)      return vec3(1.00, 0.48, 0.15) * 1.0;
    if (t == VOXEL_END_LIGHT) return vec3(0.85, 0.80, 1.00) * 0.6;
    if (t == VOXEL_DIM_EMIT)  return albedo * 0.35;
    return vec3(0.0);
}

// block id (block.properties) -> voxel type, VOXEL_EMPTY = do not voxelize
int blockIdToVoxelType(int id) {
    if (id == ID_LEAVES)     return VOXEL_LEAVES;
    if (id == ID_EMISSIVE)   return VOXEL_EMISSIVE;
    if (id == ID_TORCH)      return VOXEL_TORCH;
    if (id == ID_SOUL)       return VOXEL_SOUL;
    if (id == ID_REDSTONE)   return VOXEL_REDSTONE;
    if (id == ID_LAVA)       return VOXEL_LAVA;
    if (id == ID_FIRE)       return VOXEL_FIRE;
    if (id == ID_END_LIGHT)  return VOXEL_END_LIGHT;
    if (id == ID_DIM_EMIT)   return VOXEL_DIM_EMIT;
    if (id == ID_PLANT || id == ID_PLANT_TALL || id == ID_WATER || id == ID_GLASS ||
        id == ID_ICE || id == ID_NONSOLID) return VOXEL_EMPTY;
    return VOXEL_SOLID;
}

#ifndef VOXEL_NO_TRACE
// -------------------------------------------------------------------------------------
//  Amanatides & Woo DDA through the voxel grid. Requires `uniform sampler2D shadowcolor1`.
// -------------------------------------------------------------------------------------
struct VoxelHit {
    bool  hit;
    bool  escaped;   // left the volume (sky / unknown)
    float t;
    vec3  pos;       // voxel space
    vec3  normal;
    int   type;
    vec3  albedo;
};

VoxelHit traceVoxels(vec3 origin, vec3 dir, int maxSteps, float maxDist) {
    VoxelHit h;
    h.hit = false; h.escaped = false; h.t = 0.0; h.pos = origin; h.normal = vec3(0.0, 1.0, 0.0);
    h.type = VOXEL_EMPTY; h.albedo = vec3(0.0);

    dir = normalize(dir);
    dir = mix(dir, vec3(1e-6), lessThan(abs(dir), vec3(1e-6)));
    vec3  invDir  = 1.0 / dir;
    vec3  stepDir = sign(dir);
    ivec3 voxel   = ivec3(floor(origin));
    vec3  tDelta  = abs(invDir);
    vec3  tMax    = (vec3(voxel) + max(stepDir, 0.0) - origin) * invDir;

    for (int i = 0; i < maxSteps; i++) {
        vec3 mask = step(tMax, tMax.yzx) * step(tMax, tMax.zxy);
        // guard against ties producing a zero mask
        if (dot(mask, vec3(1.0)) < 0.5) mask = vec3(1.0, 0.0, 0.0);
        else if (dot(mask, vec3(1.0)) > 1.5) mask = mask.x > 0.5 ? vec3(1, 0, 0) : vec3(0, 1, 0);
        float t = dot(tMax, mask);
        if (t > maxDist) break;
        voxel += ivec3(mask * stepDir);
        tMax  += mask * tDelta;
        if (!insideVoxelVolume(voxel)) { h.escaped = true; h.t = t; return h; }
        vec4 data = texelFetch(shadowcolor1, voxelToTexel(voxel), 0);
        int  type = voxelType(data);
        if (type != VOXEL_EMPTY) {
            h.hit = true;
            h.t = t;
            h.pos = origin + dir * t;
            h.normal = -mask * stepDir;
            h.type = type;
            h.albedo = voxelAlbedo(data);
            return h;
        }
    }
    h.t = maxDist;
    return h;
}
#endif

#endif
