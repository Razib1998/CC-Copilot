/**
 * Statische Pflichtprüfung: Legacy cc_intern_benutzer_v1 darf keinen Cockpit-POST/GET/DELETE /users auslösen.
 * Lauf: node scripts/pflicht-legacy-sync-audit.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const api = read('frontend/modules/ccintern/core/ApiAdapter.js');
const sync = read('frontend/modules/ccintern/core/SyncAdapter.js');

for (const [name, src] of [
  ['ApiAdapter.js', api],
  ['SyncAdapter.js', sync],
]) {
  assert.ok(
    src.includes("key === 'cc_intern_benutzer_v1'") && src.includes('return false'),
    `${name}: erwarteter Guard für cc_intern_benutzer_v1 (save) fehlt`,
  );
}

assert.ok(
  api.includes("if (key === 'cc_intern_benutzer_v1')") && api.includes('callback(null, fallback)'),
  'ApiAdapter.loadAsync: cc_intern_benutzer_v1 muss Fallback liefern (kein GET /users)',
);

assert.ok(
  sync.includes("if (key === 'cc_intern_benutzer_v1')") && sync.includes('_local.load'),
  'SyncAdapter.loadAsync: cc_intern_benutzer_v1 muss über LocalStorage gehen',
);

console.log('[pflicht-legacy-sync-audit] OK — ApiAdapter/SyncAdapter blockieren cc_intern_benutzer_v1 gegen /users');
