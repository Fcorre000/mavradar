// Renders docs/artifacts/MavRadar_Architecture_Diagram.png from diagram.html (next to this file).
//
//   node docs/artifacts/architecture/build-diagram.mjs
//
// Run from the repo root. Needs Google Chrome (headless screenshot), app/node_modules (pngjs, to check the
// size) and a network connection (the DejaVu fonts load from jsdelivr). Edit the HTML, not the PNG.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const OUT = join(ROOT, 'docs/artifacts/MavRadar_Architecture_Diagram.png');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { PNG } = createRequire(join(ROOT, 'app/package.json'))('pngjs');

const [W, H] = [2396, 1685];

execFileSync(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--virtual-time-budget=10000', `--window-size=${W},${H}`, `--screenshot=${OUT}`, `file://${join(HERE, 'diagram.html')}`,
], { stdio: 'ignore' });

const png = PNG.sync.read(readFileSync(OUT));
if (png.width !== W || png.height !== H) throw new Error(`came out ${png.width}x${png.height}, expected ${W}x${H}`);
console.log(`MavRadar_Architecture_Diagram.png  ${W}x${H}`);
