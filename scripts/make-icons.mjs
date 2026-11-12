// Génère les icônes PWA (PNG) à partir d'un SVG, via Chromium/Playwright (déjà installé dans l'environnement de dev).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Playwright : installé localement, ou indiqué via PW_REQUIRE=/chemin/vers/node_modules/../package.json
const { chromium } = createRequire(process.env.PW_REQUIRE ?? import.meta.url)('playwright');
const fontDir = require.resolve('@fontsource/scheherazade-new/package.json').replace('package.json', 'files/');
const font = readFileSync(fontDir + 'scheherazade-new-arabic-700-normal.woff2').toString('base64');

const svg = (maskable) => {
  const r = maskable ? 0 : 112;
  const size = maskable ? 250 : 300; // la version « maskable » garde une marge de sécurité
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <style>@font-face{font-family:S;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:700}</style>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#386d57"/><stop offset="1" stop-color="#274c3c"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="url(#g)"/>
  <text x="256" y="${maskable ? 318 : 335}" text-anchor="middle" font-family="S" font-weight="700" font-size="${size}" fill="#f7f3ea">وِرْد</text>
</svg>`;
};


const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function shot(markup, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${markup.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, omitBackground: true });
}
await shot(svg(false), 192, 'public/icons/icon-192.png');
await shot(svg(false), 512, 'public/icons/icon-512.png');
await shot(svg(true), 512, 'public/icons/icon-maskable-512.png');
await shot(svg(true), 180, 'public/icons/apple-touch-icon.png'); // iOS applique lui-même les coins arrondis
// Badge monochrome (notifications Android)
await shot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><style>@font-face{font-family:S;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:700}</style><text x="256" y="360" text-anchor="middle" font-family="S" font-weight="700" font-size="300" fill="#fff">وِرْد</text></svg>`, 96, 'public/icons/badge-96.png');
await browser.close();
console.log('icônes générées');
