// Usage: node render.js <shader.frag> <width> <height> <out.png> [ss]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [,, frag, W, H, out, SS='2'] = process.argv;
  const ss = +SS, w = +W * ss, h = +H * ss;
  const common = fs.readFileSync(path.join(__dirname, 'common.glsl'), 'utf8');
  const src = common + '\n' + fs.readFileSync(frag, 'utf8') + '\nvoid main(){ vec4 c; mainImage(c, gl_FragCoord.xy); fragColor = vec4(c.rgb,1.); }';
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('console', m => console.log('[page]', m.text()));
  const t0 = Date.now();
  const data = await p.evaluate(async ({ src, w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const gl = c.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
    const vs = `#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, src)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(pr, 'uRes'), w, h);
    gl.viewport(0, 0, w, h); gl.enable(gl.SCISSOR_TEST);
    const T = 256;
    for (let y = 0; y < h; y += T) for (let x = 0; x < w; x += T) {
      gl.scissor(x, y, T, T); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish();
      await new Promise(r => setTimeout(r, 0));
    }
    return c.toDataURL('image/png');
  }, { src, w, h });
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`${path.basename(frag)} -> ${out} ${w}x${h} in ${((Date.now()-t0)/1000).toFixed(1)}s`);
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
