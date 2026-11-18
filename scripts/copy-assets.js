// Copies third-party assets from node_modules into site/ (three.js + self-hosted fonts).
const fs = require('fs');
const path = require('path');

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`copied ${to}`);
};

copy('node_modules/three/build/three.module.min.js', 'site/vendor/three.module.min.js');
for (const w of [500, 700, 900]) copy(`node_modules/@fontsource/orbitron/files/orbitron-latin-${w}-normal.woff2`, `site/fonts/orbitron-latin-${w}-normal.woff2`);
for (const w of [400, 500, 600, 700, 800]) copy(`node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2`, `site/fonts/inter-latin-${w}-normal.woff2`);
