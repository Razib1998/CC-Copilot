/**
 * Nach `vite build`: manifest.json und icons/ aus frontend/ nach dist/ kopieren
 * (Strato-Webroot = frontend/dist/).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const manifestSrc = path.join(root, 'manifest.json');
const manifestDest = path.join(dist, 'manifest.json');
const iconsSrc = path.join(root, 'icons');
const iconsDest = path.join(dist, 'icons');

if (!fs.existsSync(dist)) {
  console.error('[copy-pwa-assets] dist/ existiert nicht — zuerst vite build ausführen.');
  process.exit(1);
}

if (!fs.existsSync(manifestSrc)) {
  console.error('[copy-pwa-assets] manifest.json fehlt unter frontend/.');
  process.exit(1);
}

fs.copyFileSync(manifestSrc, manifestDest);

if (!fs.existsSync(iconsSrc)) {
  console.error('[copy-pwa-assets] icons/ fehlt unter frontend/.');
  process.exit(1);
}

fs.mkdirSync(iconsDest, { recursive: true });
for (const name of fs.readdirSync(iconsSrc)) {
  if (name === '.gitkeep') continue;
  const from = path.join(iconsSrc, name);
  if (!fs.statSync(from).isFile()) continue;
  fs.copyFileSync(from, path.join(iconsDest, name));
}

/** Vite wandelt `/manifest.json` und `/icons/*` im Entry-HTML in gehashte `/assets/*` um — für feste Webroot-Pfade zurück auf Root setzen. */
const indexHtml = path.join(dist, 'index.html');
if (fs.existsSync(indexHtml)) {
  let html = fs.readFileSync(indexHtml, 'utf8');
  html = html.replace(
    /<link rel="manifest" href="\/assets\/manifest-[^"]+\.json"\s*\/?>/,
    '<link rel="manifest" href="/manifest.json" />'
  );
  html = html.replace(
    /<link rel="icon" href="\/assets\/favicon-[^"]+\.ico"\s*\/?>/,
    '<link rel="icon" href="/icons/favicon.ico" />'
  );
  html = html.replace(
    /<link rel="apple-touch-icon" href="\/assets\/apple-touch-icon-[^"]+\.png"\s*\/?>/,
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />'
  );
  fs.writeFileSync(indexHtml, html);
}

console.log('[copy-pwa-assets] manifest.json → dist/manifest.json, icons/* → dist/icons/, index.html → feste /manifest.json + /icons/*');
