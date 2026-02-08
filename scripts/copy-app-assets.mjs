import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

const assets = [
  ['src/renderer/index.html', 'dist/renderer/index.html'],
  ['src/renderer/styles.css', 'dist/renderer/styles.css'],
  ['src/preload/electronPreload.cjs', 'dist/preload/electronPreload.cjs'],
  ['node_modules/pdfjs-dist/legacy/build/pdf.mjs', 'dist/renderer/vendor/pdfjs/pdf.mjs'],
  ['node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'dist/renderer/vendor/pdfjs/pdf.worker.mjs']
];

for (const [source, target] of assets) {
  const from = join(repoRoot, source);
  const to = join(repoRoot, target);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

console.log('Copied renderer assets to dist/renderer');
