// Liquid metal pool with ripples
float hR(vec2 p){
  float d1 = length(p-vec2(.2,0.)), d2 = length(p-vec2(-1.4,-1.8));
  float h = .07*sin(d1*5.5)*exp(-d1*.35)/(1.+d1*.3) + .04*sin(d2*7.+1.)*exp(-d2*.5);
  h += .02*fbm(p*.6);
  return h;
}
vec3 envR(vec3 d){
  vec3 c = vec3(.006,.006,.008) + vec3(.04,.04,.05)*smoothstep(0.,1.,d.y);
  c += vec3(1.)*3.*smoothstep(.02,.0,abs(d.y-.32))*smoothstep(1.,.4,abs(d.x));
  c += vec3(1.,.38,.1)*2.2*smoothstep(.05,.0,abs(d.y-.12))*smoothstep(.9,.2,abs(d.x+.2));
  c += vec3(.5,.6,1.)*.8*smoothstep(.15,.0,abs(d.x-.85))*smoothstep(.0,.4,d.y);
  return c;
}
void mainImage(out vec4 o, vec2 fc){
  vec2 uv = (fc - .5*uRes)/uRes.y; vec2 q = fc/uRes;
  vec3 ro = vec3(0.,1.5,4.5), rd = camLook(ro, vec3(0.,0.,-.6))*normalize(vec3(uv,1.7));
  vec3 col = envR(rd);
  if(rd.y<0.){
    float t = -ro.y/rd.y; vec3 p = ro+rd*t;
    float e=.002; float h=hR(p.xz);
    vec3 n = normalize(vec3(h-hR(p.xz+vec2(e,0.)), e, h-hR(p.xz+vec2(0.,e))));
    vec3 r = reflect(rd,n);
    float fr = .6+.4*pow(1.-clamp(dot(n,-rd),0.,1.),5.);
    col = envR(r)*fr*vec3(.95,.93,.92);
    col = mix(col, vec3(.01), 1.-exp(-t*.05));
  }
  col = aces(col);
  col *= vignette(q,.4);
  o = vec4(grain(toSRGB(col), fc, .025),1.);
}
