import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeMitarbeiterKuerzel } from './mitarbeiter.js';

test('server accepts freely chosen staff abbreviations', () => {
  assert.deepEqual(normalizeMitarbeiterKuerzel(' x '), { ok: true, norm: 'X' });
  assert.deepEqual(normalizeMitarbeiterKuerzel('team-12'), { ok: true, norm: 'TEAM-12' });
  assert.deepEqual(normalizeMitarbeiterKuerzel('Nachtschicht_2'), {
    ok: true,
    norm: 'NACHTSCHICHT_2',
  });
});

test('server rejects only blank or technically too-long abbreviations', () => {
  assert.equal(normalizeMitarbeiterKuerzel(' ').ok, false);
  assert.equal(normalizeMitarbeiterKuerzel('A'.repeat(32)).ok, true);
  assert.equal(normalizeMitarbeiterKuerzel('A'.repeat(33)).ok, false);
});
