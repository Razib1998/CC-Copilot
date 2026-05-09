import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFahrzeugTypHaystack,
  fahrzeugBelegtNachFusaBelegungRows,
  fahrzeugPasstZuTypLabel,
  fahrzeugPasstZuDepot,
} from './fusa-belegung-verfuegbarkeit.js';
import { auftragTermineZuBelegungIso } from './fusa-belegung-dates.js';

test('fahrzeugBelegtNachFusaBelegungRows: Überlappung mitte im Zeitraum', () => {
  const rows = [
    {
      fahrzeug_id: 'fz-1',
      auftrag_id: 'a1',
      startdatum: '2026-01-01',
      enddatum: '2026-06-30',
      status: 'aktiv',
    },
  ];
  assert.equal(fahrzeugBelegtNachFusaBelegungRows(rows, 'fz-1', '2026-06-01', '2026-12-31').belegt, true);
});

test('fahrzeugBelegtNachFusaBelegungRows: kein Treffer außerhalb', () => {
  const rows = [
    {
      fahrzeug_id: 'fz-1',
      auftrag_id: 'a1',
      startdatum: '2026-01-01',
      enddatum: '2026-03-31',
      status: 'aktiv',
    },
  ];
  assert.equal(fahrzeugBelegtNachFusaBelegungRows(rows, 'fz-1', '2026-07-01', '2026-12-31').belegt, false);
});

test('fahrzeugBelegtNachFusaBelegungRows: storniert blockiert nicht', () => {
  const rows = [
    {
      fahrzeug_id: 'fz-1',
      auftrag_id: 'a1',
      startdatum: '2026-01-01',
      enddatum: '2026-12-31',
      status: 'storniert',
    },
  ];
  assert.equal(fahrzeugBelegtNachFusaBelegungRows(rows, 'fz-1', '2026-06-01', '2026-06-30').belegt, false);
});

test('auftragTermineZuBelegungIso: ISO und Inklusiv-Ende', () => {
  const r = auftragTermineZuBelegungIso('2026-03-01', '2026-03-31');
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.startdatum, '2026-03-01');
    assert.equal(r.enddatum, '2026-03-31');
  }
});

test('fahrzeugPasstZuTypLabel: modell/typ_kategorie wie FUSA-Liste', () => {
  const row = {
    typ: 'Bus',
    details_json: JSON.stringify({
      modell: 'Solobus 12m',
      typ_kategorie: 'Niederflur',
    }),
  };
  assert.equal(fahrzeugPasstZuTypLabel(row, 'Solobus'), true);
  assert.ok(buildFahrzeugTypHaystack(row).includes('solobus'));
});

test('fahrzeugPasstZuTypLabel: details_json als Objekt (mysql2 / geparst)', () => {
  const row = {
    typ: 'Bus',
    details_json: { modell: 'Solobus', typ_kategorie: 'Niederflur', depot: 'Essen Stadtmitte' },
  };
  assert.equal(fahrzeugPasstZuTypLabel(row, 'Solobus'), true);
  assert.ok(buildFahrzeugTypHaystack(row).includes('solobus'));
});

test('fahrzeugPasstZuTypLabel: U-Bahn vs Stadtbahn', () => {
  const u = { typ: 'U-Bahn', details_json: '{}' };
  const s = { typ: 'Stadtbahn', details_json: '{}' };
  assert.equal(fahrzeugPasstZuTypLabel(u, 'U-Bahn 8 Achsen'), true);
  assert.equal(fahrzeugPasstZuTypLabel(s, 'Stadtbahn 8 Achsen'), true);
  assert.equal(fahrzeugPasstZuTypLabel(u, 'Stadtbahn 8 Achsen'), false);
});

test('fahrzeugPasstZuDepot: ohne Standort kein Treffer bei gefiltertem Depot', () => {
  const row = { details_json: '{}' };
  assert.equal(fahrzeugPasstZuDepot(row, 'Essen Stadtmitte'), false);
  const row2 = { details_json: JSON.stringify({ depot: 'Essen Stadtmitte' }) };
  assert.equal(fahrzeugPasstZuDepot(row2, 'Essen Stadtmitte'), true);
});

test('fahrzeugPasstZuDepot: leerer Filter → kein Treffer', () => {
  assert.equal(fahrzeugPasstZuDepot({ details_json: JSON.stringify({ depot: 'Essen Stadtmitte' }) }, ''), false);
});

test('fahrzeugPasstZuDepot: Top-Level depot wie angereicherte API-Zeile', () => {
  const row = { details_json: '{}', depot: 'Essen Stadtmitte' };
  assert.equal(fahrzeugPasstZuDepot(row, 'Essen Stadtmitte'), true);
});
