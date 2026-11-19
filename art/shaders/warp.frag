// Domain-warped fluid pigment
void mainImage(out vec4 o, vec2 fc){
  vec2 q = fc/uRes; vec2 p = (fc - .5*uRes)/uRes.y*2.2;
  vec2 a = vec2(fbm(p+vec2(0.,0.)), fbm(p+vec2(5.2,1.3)));
  vec2 b = vec2(fbm(p+3.5*a+vec2(1.7,9.2)), fbm(p+3.5*a+vec2(8.3,2.8)));
  float f = fbm(p+3.2*b);
  vec3 col = mix(vec3(.012,.01,.016), vec3(.2,.035,.03), clamp(f*f*2.4,0.,1.));
  col = mix(col, vec3(1.,.36,.1), clamp(length(b)*.85-.35,0.,1.));
  col = mix(col, vec3(.05,.06,.22), clamp(a.y*a.y*1.4-.3,0.,1.));
  col = mix(col, vec3(1.,.86,.72), smoothstep(.72,.95,f*f*1.6));
  col *= .35 + .9*f;
  // fake lighting from gradient
  float e=.004; float fx = fbm(p+vec2(e,0.)+3.2*b);
  col += vec3(1.,.7,.5)*clamp((fx-f)/e*.04,0.,1.)*.35;
  col = aces(col*1.05);
  col *= vignette(q,.35);
  o = vec4(grain(toSRGB(col), fc, .025),1.);
}
