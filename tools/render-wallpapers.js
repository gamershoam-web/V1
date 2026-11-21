// Renders the still wallpapers (payload/wallpapers) and the picker thumbnails (payload/web/assets/thumbs)
// from the same shader the live wallpaper uses, so "live off" shows the identical picture.
//   node tools/render-wallpapers.js        (needs Playwright with Chromium)
const { chromium } = require('playwright');
const path = require('path');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'payload', 'web');
const VOID = `<!doctype html><html><body style="margin:0;background:#060a10"><canvas id="c"></canvas><script>
const c=document.getElementById('c'),W=innerWidth,H=innerHeight;c.width=W;c.height=H;const x=c.getContext('2d');
x.fillStyle='#060a10';x.fillRect(0,0,W,H);
let g=x.createRadialGradient(W*.78,H*.86,0,W*.78,H*.86,W*.62);g.addColorStop(0,'rgba(39,198,255,.20)');g.addColorStop(.45,'rgba(24,70,110,.10)');g.addColorStop(1,'rgba(6,10,16,0)');x.fillStyle=g;x.fillRect(0,0,W,H);
g=x.createRadialGradient(W*.12,H*.05,0,W*.12,H*.05,W*.5);g.addColorStop(0,'rgba(180,140,255,.07)');g.addColorStop(1,'rgba(6,10,16,0)');x.fillStyle=g;x.fillRect(0,0,W,H);
const d=x.getImageData(0,0,W,H),p=d.data;let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;
for(let i=0;i<p.length;i+=4){const n=(r()-.5)*7;p[i]+=n;p[i+1]+=n;p[i+2]+=n;}x.putImageData(d,0,0);document.title='ready';
<\/script></body></html>`;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function shot(w, h, url, html, out, quality) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    if (html) await p.setContent(html); else await p.goto(url);
    await p.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 });
    await p.screenshot({ path: out, type: 'jpeg', quality });
    await p.close();
    console.log('wrote', path.relative(root, out));
  }
  const wp = (style) => 'file://' + path.join(web, 'wallpaper.html') + `?style=${style}&still=1&t=7.5`;
  for (const style of ['chrome', 'mono']) {
    await shot(3840, 2160, wp(style), null, path.join(root, 'payload', 'wallpapers', style + '.jpg'), 90);
    await shot(640, 400, wp(style), null, path.join(web, 'assets', 'thumbs', style + '.jpg'), 85);
  }
  await shot(3840, 2160, null, VOID, path.join(root, 'payload', 'wallpapers', 'void.jpg'), 92);
  await shot(640, 400, null, VOID, path.join(web, 'assets', 'thumbs', 'void.jpg'), 88);
  await b.close();
})();
