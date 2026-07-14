import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MITARBEITER_KUERZEL_DOPPELT_FEHLER,
  MITARBEITER_KUERZEL_FORMAT_FEHLER,
  normalizeMitarbeiterKuerzelForSave,
  validateMitarbeiterKuerzelListe,
} from './ccintern-cockpit-api.js';

test('Kürzel accepts one character, numbers, punctuation, and longer names', () => {
  assert.deepEqual(normalizeMitarbeiterKuerzelForSave(' x '), { ok: true, norm: 'X' });
  assert.deepEqual(normalizeMitarbeiterKuerzelForSave('team-12'), { ok: true, norm: 'TEAM-12' });
  assert.deepEqual(normalizeMitarbeiterKuerzelForSave('Nachtschicht_2'), {
    ok: true,
    norm: 'NACHTSCHICHT_2',
  });
});

test('Kürzel only rejects blank values and values longer than 32 characters', () => {
  assert.equal(normalizeMitarbeiterKuerzelForSave('  ').ok, false);
  assert.equal(normalizeMitarbeiterKuerzelForSave('A'.repeat(32)).ok, true);
  assert.equal(normalizeMitarbeiterKuerzelForSave('A'.repeat(33)).ok, false);
});

test('Kürzel stays case-insensitively unique for safe staff assignment', () => {
  const result = validateMitarbeiterKuerzelListe([{ k: 'team-1' }, { k: 'TEAM-1' }]);
  assert.deepEqual(result, { ok: false, message: MITARBEITER_KUERZEL_DOPPELT_FEHLER });

  const missing = validateMitarbeiterKuerzelListe([{ k: '' }]);
  assert.deepEqual(missing, { ok: false, message: MITARBEITER_KUERZEL_FORMAT_FEHLER });
});
