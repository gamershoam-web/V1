// Topographic contour field
float hT(vec2 p){ return fbm(p*.55 + vec2(fbm(p*.3), fbm(p*.3+4.))*1.2); }
void mainImage(out vec4 o, vec2 fc){
  vec2 q = fc/uRes; vec2 p = (fc - .5*uRes)/uRes.y*4.;
  float h = hT(p);
  float N = 34.;
  float v = h*N;
  float w = fwidth(v);
  float line = 1.-smoothstep(0., 1.4*w, abs(fract(v)-.5)*2.-1.+1.5*w);
  float f = abs(fract(v)-.5);
  float l = smoothstep(w*1.2, 0., .5-f); // line at fract==0/1
  float major = step(.5, fract(floor(v)/5.+.01)) ;
  float isMajor = 1.-step(.01, mod(floor(v+.5),5.));
  vec3 col = vec3(.018,.017,.02);
  vec3 lc = mix(vec3(.55,.55,.58), vec3(.95,.95,.97), isMajor);
  float band = smoothstep(.02,.0,abs(h-.56));
  lc = mix(lc, vec3(1.,.38,.12), smoothstep(.04,.0,abs(h-.58)));
  col += lc*l*(isMajor>.5?1.:.55);
  col += vec3(1.,.35,.1)*.05*smoothstep(.62,.7,h);
  // fine dots
  vec2 g = fract(p*6.)-.5; col += vec3(.25)*smoothstep(.06,.02,length(g))*.25;
  col *= vignette(q,.5);
  o = vec4(grain(toSRGB(col), fc, .02),1.);
}
