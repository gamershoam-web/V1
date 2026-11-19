// Eclipse: dark planet with ember corona
void mainImage(out vec4 o, vec2 fc){
  vec2 q = fc/uRes; vec2 uv = (fc - .5*uRes)/uRes.y;
  uv -= vec2(.0,.04);
  float r = length(uv), a = atan(uv.y,uv.x);
  float R = .23;
  vec3 col = vec3(.006,.005,.008);
  vec2 sg = fc/uRes.y*260.; vec2 id=floor(sg); vec2 f=fract(sg)-.5; vec2 rr=hash22(id)-.5;
  col += vec3(.85,.88,1.)*smoothstep(.07,.0,length(f-rr*.7))*step(.988,hash21(id+7.))*(.4+.6*hash21(id));
  float rays = fbm(vec2(a*6., r*3.)) * fbm(vec2(a*14.+3., 1.));
  float cor = exp(-(r-R)*9.)*(.55+1.1*rays) + exp(-(r-R)*30.)*1.5;
  cor *= step(R, r);
  col += vec3(1.,.42,.14)*cor*.9;
  col += vec3(1.,.75,.5)*exp(-(r-R)*120.)*step(R,r)*1.2;
  // diamond ring flare
  vec2 dp = uv - R*vec2(cos(.75),sin(.75));
  float dr = length(dp);
  col += vec3(1.,.85,.7)*(exp(-dr*55.)*2.5 + .015/(dr+.01)*.4);
  col += vec3(1.,.8,.6)*.25*exp(-abs(dp.y)*260.)*exp(-abs(dp.x)*4.);
  // planet with faint earthshine rim
  float d = smoothstep(R+.0015, R-.0015, r);
  vec3 pc = vec3(.008,.007,.009) + vec3(.35,.12,.05)*.25*pow(r/R,8.);
  col = mix(col, pc, d);
  col = aces(col);
  col *= vignette(q,.3);
  o = vec4(grain(toSRGB(col), fc, .025),1.);
}
