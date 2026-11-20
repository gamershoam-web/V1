// =====================================================================================
//  Block breaking overlay: multiplicative blend straight onto the albedo buffer.
//  Vanilla blend (DST_COLOR, SRC_COLOR) => result = 2 * src * dst. Alpha written as 0.5
//  keeps the AO channel intact (0.5 * ao + ao * 0.5).
// =====================================================================================
#include "/lib/common.glsl"

#ifdef VSH
out vec2 vUV;
out vec4 vColor;
void main() {
    vUV = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    vColor = gl_Color;
    gl_Position = ftransform();
    gl_Position.xy += taaOffset() * gl_Position.w;
}
#endif

#ifdef FSH
uniform sampler2D tex;
in vec2 vUV;
in vec4 vColor;
/* RENDERTARGETS: 0 */
layout(location = 0) out vec4 outColor;
void main() {
    vec4 c = texture(tex, vUV) * vColor;
    if (c.a < 0.01) discard;
    outColor = vec4(c.rgb, 0.5);
}
#endif
