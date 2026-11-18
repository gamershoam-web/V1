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

// three.js add-ons used by the 3D hub and Starfighter (resolved through the import map in index.html).
const ADDONS = [
  'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js', 'postprocessing/ShaderPass.js', 'postprocessing/MaskPass.js', 'postprocessing/Pass.js',
  'objects/Lensflare.js', 'shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js', 'shaders/OutputShader.js',
];
for (const f of ADDONS) copy(`node_modules/three/examples/jsm/${f}`, `site/vendor/addons/${f}`);

