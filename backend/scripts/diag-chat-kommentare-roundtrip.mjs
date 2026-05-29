/**
 * Diagnose: kommentare in bemerkung-Payload (gleiche Serialisierung wie Frontend uiToApiBody).
 * Usage: node scripts/diag-chat-kommentare-roundtrip.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const BEM_TAG = '{"__ccintern_v1"';

function serializeBemerkungPayload(payload) {
  return JSON.stringify({ __ccintern_v1: 1, payload: payload || {} });
}

function parseBemerkung(bemerkung) {
  const raw = bemerkung != null ? String(bemerkung) : '';
  if (!raw.trim().startsWith(BEM_TAG)) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.__ccintern_v1 === 1 && parsed.payload && typeof parsed.payload === 'object') {
      return parsed.payload;
    }
  } catch {
    /* ignore */
  }
  return {};
}

const testText = `DIAG_TEST_${Date.now()}`;
const uiAuftrag = {
  id: 'AU-TEST-001',
  ccApiId: '00000000-0000-4000-8000-000000000099',
  kunde: 'Diag Kunde',
  step: 'montage',
  kommentare: [
    {
      id: 'k_diag',
      text: testText,
      autor: 'Diag',
      ts: new Date().toISOString(),
      autorMaId: 'fb1a90b7-5de9-4e8d-965c-6f8368a9942e',
    },
  ],
};

const bemerkung = serializeBemerkungPayload(uiAuftrag);
const round = parseBemerkung(bemerkung);
const km = Array.isArray(round.kommentare) ? round.kommentare : [];
const found = km.some((k) => k && String(k.text) === testText);

console.log('Testtext:', testText);
console.log('bemerkung chars:', bemerkung.length);
console.log('kommentare nach parse:', km.length);
console.log('Roundtrip OK:', found ? 'ja' : 'NEIN');
if (!found) process.exitCode = 1;
