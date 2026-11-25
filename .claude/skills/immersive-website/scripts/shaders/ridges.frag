// Layered mountains under night sky with ember horizon
float ridge(float x, float s){ float h=0., a=.5, f=1.; for(int i=0;i<7;i++){ h += a*(1.-abs(noise(vec2(x*f+s*13.1, s*7.)) *2.-1.)); f*=2.1; a*=.48; } return h; }
void mainImage(out vec4 o, vec2 fc){
  vec2 q = fc/uRes; vec2 p = vec2((fc.x-.5*uRes.x)/uRes.y, q.y);
  vec3 sky = mix(vec3(1.,.42,.15)*1.1, vec3(.035,.04,.08), pow(clamp((q.y-.22)/.75,0.,1.),.45));
  sky += vec3(1.,.5,.2)*.5*exp(-abs(q.y-.3)*9.);
  // stars
  vec2 sg = fc/uRes.y*220.; vec2 id = floor(sg); vec2 f = fract(sg)-.5; vec2 r = hash22(id)-.5;
  float st = smoothstep(.06,.0,length(f-r*.7))*step(.985,hash21(id+3.))*smoothstep(.45,.85,q.y);
  sky += vec3(.9,.92,1.)*st*1.5;
  vec3 col = sky;
  for(int i=0;i<6;i++){
    float fi = float(i);
    float base = .52 - fi*.07;
    float amp = .24 - fi*.018;
    float y = base + amp*ridge(p.x*(1.2+fi*.35)+fi*3.7, fi) - .12;
    float m = smoothstep(.0015, -.0015, q.y - y);
    float depth = fi/5.;
    vec3 mc = mix(vec3(.55,.2,.12), vec3(.012,.012,.02), pow(depth,.6));
    mc += vec3(1.,.45,.2)*.18*(1.-depth)*smoothstep(.0,.08,q.y-(y-.08));
    col = mix(col, mc, m);
  }
  col = aces(col);
  col *= vignette(q,.3);
  o = vec4(grain(toSRGB(col), fc, .03),1.);
}
