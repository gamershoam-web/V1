// Iridescent liquid chrome sculpture on black
float map(vec3 p){
  vec3 q = p; q.yz *= rot(1.15); q.xy *= rot(.42);
  float a = atan(q.z,q.x);
  vec2 tq = vec2(length(q.xz)-1.2, q.y);
  tq *= rot(a*1.5 + .4);
  float d = (length(tq/vec2(.52,.17))-1.)*.17;
  d = smin(d, length(p - vec3(.78,.62,.55)) - .36, .32);
  d = min(d, length(p - vec3(-1.35,-1.05,.6)) - .2);
  d += .018*sin(5.*p.x+1.3)*sin(4.6*p.y+.7)*sin(5.2*p.z+2.);
  return d*.6;
}
vec3 nor(vec3 p){ vec2 e=vec2(.0008,0.); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx))); }
vec3 env(vec3 d){
  vec3 c = vec3(.004,.004,.008) + vec3(.07,.07,.085)*smoothstep(-.3,1.,d.y);
  // large top softbox
  c += vec3(1.,.97,.95)*3.2*smoothstep(.62,.68,d.y)*smoothstep(.75,.55,abs(d.x));
  // vertical strip left (cool) & right (ember)
  c += vec3(.45,.55,1.)*2.2*smoothstep(.12,.06,abs(d.x+.78))*smoothstep(-.6,.2,d.y)*step(0.,-d.z+.4);
  c += vec3(1.,.38,.12)*2.6*smoothstep(.1,.04,abs(d.x-.82))*smoothstep(-.4,.4,d.y);
  // floor bounce
  c += vec3(.05,.04,.06)*smoothstep(0.,-.6,d.y);
  // thin sharp strips for crisp chrome detail
  c += vec3(1.)*4.*smoothstep(.012,.0,abs(d.y-.25))*smoothstep(.9,.2,abs(d.x));
  c += vec3(1.,.9,.85)*3.*smoothstep(.015,.0,abs(d.x+.3))*smoothstep(-.2,.5,d.y);
  // horizon ring
  c += vec3(.6,.5,.9)*.6*smoothstep(.05,0.,abs(d.y+.05))*(.5+.5*d.x);
  return c;
}
vec3 irid(float t){ return .5+.5*cos(TAU*(vec3(0.,.33,.67)+t)); }
void mainImage(out vec4 o, vec2 fc){
  vec2 uv = (fc - .5*uRes)/uRes.y;
  vec3 ro = vec3(0.,.15,9.4), rd = camLook(ro, vec3(-.1,-.12,0.))*normalize(vec3(uv,2.15));
  float t = 0., d;
  for(int i=0;i<200;i++){ d = map(ro+rd*t); if(d<.0004||t>20.) break; t += d; }
  vec3 col = vec3(0.);
  vec2 q = fc/uRes;
  col += vec3(.035,.032,.045)*smoothstep(1.1,.0,length((q-vec2(.5,.55))*vec2(1.,1.2)));
  if(t<20.){
    vec3 p = ro+rd*t, n = nor(p), r = reflect(rd,n);
    float ndv = clamp(dot(n,-rd),0.,1.);
    float fr = .55 + .45*pow(1.-ndv,3.);
    float th = 1.2*ndv + .35*fbm3(p*2.2) + .15*p.y;
    vec3 tint = mix(vec3(.92), irid(th), .55);
    col = env(r)*tint*fr;
    // second bounce approximation
    vec3 r2 = reflect(r, n);
    col += env(r2)*.05*tint;
    // AO
    float ao = 0.; for(int k=1;k<6;k++){ float h=.06*float(k); ao += (h-map(p+n*h)); } col *= clamp(1.-ao*2.2,0.,1.);
  }
  col = aces(col*1.1);
  col *= vignette(q,.35);
  col = toSRGB(col);
  o = vec4(grain(col, fc, .025),1.);
}
