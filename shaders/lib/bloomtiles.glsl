#ifndef BLOOMTILES_GLSL
#define BLOOMTILES_GLSL
// bloom tile atlas: tile i holds mip (i + BLOOM_FIRST_LOD) at scale 2^-(lod), laid out
// left to right with a padding gap so the separable blur never bleeds between tiles
#define BLOOM_FIRST_LOD 2
#define BLOOM_TILES 7
const float bloomPad = 0.012;

vec4 bloomTileRect(int i) {
    float x = 0.0;
    for (int k = 0; k < i; k++) x += exp2(-float(k + BLOOM_FIRST_LOD)) + bloomPad;
    float s = exp2(-float(i + BLOOM_FIRST_LOD));
    return vec4(x, 0.0, x + s, s);
}
int bloomTileAt(vec2 uv) {
    for (int i = 0; i < BLOOM_TILES; i++) {
        vec4 r = bloomTileRect(i);
        if (uv.x >= r.x && uv.x < r.z && uv.y >= r.y && uv.y < r.w) return i;
    }
    return -1;
}
#endif
