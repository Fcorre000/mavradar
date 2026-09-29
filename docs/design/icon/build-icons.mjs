// Builds every MavRadar app icon file from one SVG source (design: canvas "App icon · Material scope").
//
//   node docs/design/icon/build-icons.mjs
//
// Run from the repo root. Needs Google Chrome (headless screenshots) and app/node_modules (pngjs, which
// Expo already pulls in, used to strip the alpha channel from the opaque icons). Writes the source SVGs
// next to this file and the PNGs into app/assets/images.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const IMAGES = join(ROOT, 'app/assets/images');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { PNG } = createRequire(join(ROOT, 'app/package.json'))('pngjs');

// Transit Navy only. The flat look is one color with alpha: Android themed icons and the notification
// icon are tinted by the system from the alpha channel.
const LOOKS = {
  navy: {
    bg1: '#25497E', bg2: '#112749', glow: '#DCE8F8', d1: 0.1, d2: 0.15, d3: 0.22, rim: 0.2, swOp: 0.38,
    shadow: '#081223', shOp: 0.45, eng1: '#F4F8FE', eng2: '#C4D8F4', car1: '#88A9DB', car2: '#5F82BA',
    carOp: 1, hiOp: 0.35, tieOp: 0.35, railOp: 0.75, window: '#112749', depth: true,
  },
  flat: {
    bg1: '#FFFFFF', bg2: '#FFFFFF', glow: '#FFFFFF', d1: 0.25, d2: 0.3, d3: 0.4, rim: 0.6, swOp: 0.6,
    shadow: '#FFFFFF', shOp: 0, eng1: '#FFFFFF', eng2: '#FFFFFF', car1: '#FFFFFF', car2: '#FFFFFF',
    carOp: 0.5, hiOp: 0, tieOp: 0.6, railOp: 1, window: 'transparent', depth: false,
  },
};

// The engine body, tapered at the nose so it reads apart from the boxy freight car.
const ENGINE =
  'M42.4 28.79H55.2L58.6 30.9Q59.4 31.4 59.4 32.3V33.88Q59.4 34.78 58.6 35.28L55.2 37.39H42.4Q41.2 37.39 41.2 36.19V29.99Q41.2 28.79 42.4 28.79Z';
// Train and track are drawn 1.25x around the train and clipped to the outer ring.
const TRAIN_T = 'translate(42.95 28.28) scale(1.25) translate(-42.95 -28.28)';

/** Artwork in a 100 x 100 space, where 0 to 100 is the visible icon. */
function art(look, { background = true } = {}) {
  const c = LOOKS[look];
  const swOp = c.swOp * 1.25;
  const swMid = c.swOp * 0.9;
  const retOp = c.swOp * 1.1;
  const lamp = c.depth ? 0.95 : 0;
  const beamOp = c.depth ? 0.45 : 0.3;
  const depth = (s) => (c.depth ? s : '');
  const ties = Array.from({ length: 15 }, (_, i) => `<rect x="${(23.16 + i * 4.6).toFixed(2)}" y="27.39" width="1.6" height="11.4" rx="0.6"/>`).join('');

  return `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg1}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient>
  <linearGradient id="sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.shadow}" stop-opacity="${c.shOp}"/><stop offset="0.8" stop-color="${c.shadow}" stop-opacity="0"/></linearGradient>
  <linearGradient id="sw" gradientUnits="userSpaceOnUse" x1="19.79" y1="20.82" x2="80.21" y2="20.82"><stop offset="0" stop-color="${c.glow}" stop-opacity="${swMid}"/><stop offset="1" stop-color="${c.glow}" stop-opacity="${swOp}"/></linearGradient>
  <radialGradient id="rg" cx="42.95" cy="28.28" r="20" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.glow}" stop-opacity="${retOp}"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient>
  <linearGradient id="en" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${c.eng1}"/><stop offset="1" stop-color="${c.eng2}"/></linearGradient>
  <linearGradient id="ca" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${c.car1}"/><stop offset="1" stop-color="${c.car2}"/></linearGradient>
  <linearGradient id="lb" gradientUnits="userSpaceOnUse" x1="59.4" y1="33.09" x2="70" y2="33.09"><stop offset="0" stop-color="#FFFFFF" stop-opacity="${beamOp}"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
  <clipPath id="ring"><circle cx="50" cy="50" r="42"/></clipPath>
</defs>
${background ? '<rect x="-50" y="-50" width="200" height="200" fill="url(#bg)"/>' : ''}
${depth('<path d="M79.7 20.3L136.3 76.9L76.9 136.3L20.3 79.7Z" fill="url(#sh)"/>')}
<circle cx="50" cy="50" r="42" fill="${c.glow}" fill-opacity="${c.d1}" stroke="${c.glow}" stroke-opacity="${c.rim}" stroke-width="0.6"/>
<circle cx="50" cy="50" r="28" fill="${c.glow}" fill-opacity="${c.d2}"/>
<circle cx="50" cy="50" r="14" fill="${c.glow}" fill-opacity="${c.d3}"/>
<path d="M50 50L19.79 20.82A42 42 0 0 1 80.21 20.82Z" fill="url(#sw)"/>
<circle cx="42.95" cy="28.28" r="20" fill="url(#rg)"/>
${depth(`<path d="M59.55 29.75L101.95 72.15L68.75 69.22L26.35 26.82L56.61 37.83Z" fill="url(#sh)" transform="${TRAIN_T}"/>`)}
<g clip-path="url(#ring)">
<g transform="${TRAIN_T} rotate(20 56.16 33.09)">
  <g fill="${c.glow}" opacity="${c.tieOp}">${ties}</g>
  <path d="M8 29.59H104M8 36.59H104" stroke="${c.glow}" stroke-opacity="${c.railOp}" stroke-width="1.4" stroke-linecap="round" fill="none"/>
  <path d="M59.4 32.19L70 29.69V36.49L59.4 33.99Z" fill="url(#lb)"/>
  ${depth(`<g fill="${c.shadow}" opacity="0.35" transform="translate(1.16 0.85)"><rect x="26" y="28.99" width="14" height="8.2" rx="1"/><path d="${ENGINE}"/></g>`)}
  <g fill="url(#ca)" opacity="${c.carOp}"><rect x="24.8" y="32.19" width="1.4" height="1.8" rx="0.4"/><rect x="26" y="28.99" width="14" height="8.2" rx="1"/></g>
  <rect x="27.2" y="32.39" width="11.6" height="1.4" rx="0.5" fill="${c.window}" opacity="0.35"/>
  <path d="M29.5 29.8V36.4M33 29.8V36.4M36.5 29.8V36.4" stroke="${c.window}" stroke-opacity="0.3" stroke-width="0.5" fill="none"/>
  <g fill="url(#en)"><rect x="39.8" y="32.19" width="1.6" height="1.8" rx="0.4"/><path d="${ENGINE}"/></g>
  <rect x="42.2" y="30.49" width="8.4" height="5.2" rx="0.8" fill="none" stroke="${c.window}" stroke-opacity="0.35" stroke-width="0.5"/>
  <g fill="none" stroke="${c.window}" stroke-opacity="0.45" stroke-width="0.5"><circle cx="44" cy="33.09" r="1.1"/><circle cx="46.4" cy="33.09" r="1.1"/><circle cx="48.8" cy="33.09" r="1.1"/></g>
  <rect x="51.2" y="29.39" width="4" height="7.4" rx="0.8" fill="${c.window}" opacity="0.5"/>
  <rect x="54.5" y="30.09" width="1" height="6" rx="0.3" fill="${c.window}" opacity="0.8"/>
  <path d="M56.2 31.1L58.4 32.5M56.2 35.08L58.4 33.68" stroke="${c.window}" stroke-opacity="0.35" stroke-width="0.45" stroke-linecap="round" fill="none"/>
  <circle cx="58.5" cy="33.09" r="0.75" fill="#FFFFFF" opacity="${lamp}"/>
  ${depth(`<g fill="#FFFFFF" opacity="${c.hiOp}"><rect x="27" y="29.6" width="8" height="1" rx="0.5"/><rect x="42.2" y="29.4" width="8.6" height="1" rx="0.5"/></g>`)}
</g>
</g>`;
}

const svg = (viewBox, inner, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${extra}>${inner}</svg>\n`;

// An adaptive icon layer is 108 dp, of which the middle 72 dp is visible: 150 units centered on the art.
const LAYER = '-25 -25 150 150';
// A rounded tile for the splash screen and favicon (corner radius 22.5%, transparent corners).
const tile = (inner) =>
  `<defs><clipPath id="tile"><rect width="100" height="100" rx="22.5"/></clipPath></defs><g clip-path="url(#tile)">${inner}</g>`;

const ASSETS = [
  // iOS and the store listing: full bleed, the OS applies its own mask. No alpha channel allowed.
  { name: 'icon', size: 1024, svg: svg('0 0 100 100', art('navy')), opaque: true },
  { name: 'android-icon-background', size: 1024, svg: svg(LAYER, '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#25497E"/><stop offset="1" stop-color="#112749"/></linearGradient></defs><rect x="-25" y="-25" width="150" height="150" fill="url(#bg)"/>'), opaque: true },
  { name: 'android-icon-foreground', size: 1024, svg: svg(LAYER, art('navy', { background: false })) },
  { name: 'android-icon-monochrome', size: 1024, svg: svg(LAYER, art('flat', { background: false })) },
  // Android status bar icon: white with alpha on transparent, 96 px (24 dp at xxxhdpi).
  { name: 'notification-icon', size: 96, svg: svg('4 4 92 92', art('flat', { background: false })) },
  { name: 'splash-icon', size: 1024, svg: svg('0 0 100 100', tile(art('navy'))) },
  { name: 'favicon', size: 48, svg: svg('0 0 100 100', tile(art('navy'))) },
];

const tmp = mkdtempSync(join(tmpdir(), 'mavradar-icons-'));
try {
  for (const a of ASSETS) {
    writeFileSync(join(HERE, `${a.name}.svg`), a.svg);
    const html = join(tmp, `${a.name}.html`);
    const sized = a.svg.replace('<svg ', `<svg width="${a.size}" height="${a.size}" `);
    writeFileSync(html, `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${sized}</body></html>`);
    const out = join(IMAGES, `${a.name}.png`);
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000', `--window-size=${a.size},${a.size}`, `--screenshot=${out}`, `file://${html}`,
    ], { stdio: 'ignore' });
    const png = PNG.sync.read(readFileSync(out));
    if (png.width !== a.size || png.height !== a.size) {
      throw new Error(`${a.name}.png came out ${png.width}x${png.height}, expected ${a.size}`);
    }
    if (a.opaque) writeFileSync(out, PNG.sync.write(png, { colorType: 2, inputHasAlpha: true }));
    console.log(`${a.name}.png  ${a.size}x${a.size}${a.opaque ? '  (no alpha)' : ''}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
