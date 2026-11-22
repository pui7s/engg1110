// Bundles the whole app (three.js included) into one self-contained HTML page: dist/dream-home.html.
// Usage: npx esbuild must be available; run `node tools/build-single.mjs` from the repository root.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const js = await build({ entryPoints: ['js/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
const css = readFileSync('css/style.css', 'utf8');
const html = readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const out = `<title>Dream Home Studio</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>${css}</style>
${body.trim()}
<script>${js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/dream-home.html', out);
console.log('dist/dream-home.html', (out.length / 1024).toFixed(0) + ' KB');
