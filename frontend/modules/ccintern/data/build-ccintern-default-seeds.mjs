import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const datenDir = path.resolve(__dirname, '../../../../migration/CCinter_COCKPIT_UMZUG/daten');
const outFile = path.join(__dirname, 'ccintern-default-seeds.js');

const keys = ['cl_vorlagen', 'auftraege', 'angebote', 'anfragen', 'rechnungen'];
const bundle = {};
for (const k of keys) {
  const p = path.join(datenDir, k + '.json');
  bundle[k] = JSON.parse(fs.readFileSync(p, 'utf8'));
}

const json = JSON.stringify(bundle);
const body =
  '(function(){\n' +
  "  window.__CCINTERN_DEFAULT_SEEDS__ = " +
  json +
  ';\n' +
  '})();\n';

fs.writeFileSync(outFile, body, 'utf8');
console.log('Wrote', outFile, 'bytes', Buffer.byteLength(body));
