// =====================================================================================
//  Vanilla sky / sun / moon / clouds are replaced by the physically based sky and the
//  procedural celestial bodies evaluated in deferred6 -> discard everything here.
// =====================================================================================
#include "/lib/common.glsl"

#ifdef VSH
void main() {
    gl_Position = ftransform();
}
#endif

#ifdef FSH
/* RENDERTARGETS: 0 */
layout(location = 0) out vec4 outColor;
void main() {
    discard;
}
#endif
