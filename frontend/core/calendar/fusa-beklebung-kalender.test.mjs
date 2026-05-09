import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beklebungsterminIstBestaetigt,
  beklebungsterminZeigtImKalender,
  getFusaKalenderTerminFuerKernel,
  isFusaAuftragKalenderKandidat,
} from './fusa-beklebung-kalender.js';

test('FUSA-Kandidat: fusa_kunde_id reicht', () => {
  assert.equal(isFusaAuftragKalenderKandidat({ fusa_kunde_id: 'x' }), true);
});

test('Kein Kalendertermin ohne beklebung_termin (nur montage_wunschtermin)', () => {
  const row = {
    fusa_kunde_id: 'k1',
    fusa_extra_json: JSON.stringify({
      montage_wunschtermin: '2026-05-10',
      beklebungstermin_status: 'geplant',
    }),
  };
  const t = getFusaKalenderTerminFuerKernel(row);
  assert.equal(t, null);
});

test('offen zeigt nicht (Migration über Wizard auf geplant)', () => {
  const row = {
    fusa_kunde_id: 'k1',
    fusa_extra_json: JSON.stringify({
      beklebung_termin: '2026-05-10',
      beklebungstermin_status: 'offen',
    }),
  };
  const t = getFusaKalenderTerminFuerKernel(row);
  assert.equal(t, null);
});

test('geplant + beklebung_termin → Kalender', () => {
  const row = {
    fusa_kunde_id: 'k1',
    fusa_extra_json: JSON.stringify({
      beklebungstermin_status: 'geplant',
      beklebung_termin: '2026-06-01',
      termin: '2026-01-01',
      termin_ende: '2026-12-31',
    }),
  };
  const t = getFusaKalenderTerminFuerKernel(row);
  assert.equal(t?.termin, '2026-06-01');
  assert.equal(t?.terminEnde, '2026-06-01');
  assert.ok(String(t?.beklebungStatusLabel || '').includes('geplant'));
});

test('verschoben + beklebung_termin → neues Datum sichtbar', () => {
  const row = {
    fusa_kunde_id: 'k1',
    fusa_extra_json: JSON.stringify({
      beklebungstermin_status: 'verschoben',
      beklebung_termin: '2026-08-15',
    }),
  };
  const t = getFusaKalenderTerminFuerKernel(row);
  assert.equal(t?.termin, '2026-08-15');
});

test('bestaetigt + beklebung_termin', () => {
  const row = {
    fusa_kunde_id: 'k1',
    fusa_extra_json: JSON.stringify({
      beklebungstermin_status: 'bestaetigt',
      beklebung_termin: '2026-07-20',
    }),
  };
  const t = getFusaKalenderTerminFuerKernel(row);
  assert.equal(t?.termin, '2026-07-20');
});

test('beklebungsterminZeigtImKalender', () => {
  assert.equal(beklebungsterminZeigtImKalender('geplant'), true);
  assert.equal(beklebungsterminZeigtImKalender('offen'), false);
});

test('beklebungsterminIstBestaetigt Umlaut-Synonym', () => {
  assert.equal(beklebungsterminIstBestaetigt('bestätigt'), true);
});
