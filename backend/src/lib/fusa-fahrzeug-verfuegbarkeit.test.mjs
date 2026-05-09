import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFahrzeugEnddatumIso,
  pruefeFahrzeugVerfuegbarkeit,
  schadenBlockiertZeitraum,
} from './fusa-fahrzeug-verfuegbarkeit.js';

test('Restlaufzeit: Auftragsende nach laufzeit_bis → nicht buchbar', () => {
  const fz = {
    id: 'fz1',
    status: 'frei',
    details_json: JSON.stringify({ laufzeit_bis: '2026-06-30' }),
  };
  assert.equal(getFahrzeugEnddatumIso(fz), '2026-06-30');
  const v = pruefeFahrzeugVerfuegbarkeit(fz, 'Heckfläche', { startdatum: '2026-01-01', enddatum: '2026-12-31' }, {
    overlapRows: [],
    schaedenRows: [],
    excludeAuftragId: null,
  });
  assert.equal(v.buchbar, false);
  assert.equal(v.sperrgrund_code, 'RESTLAUFZEIT');
});

test('Eigenwerbung Status → nicht buchbar', () => {
  const fz = { id: 'fz1', status: 'Eigenwerbung', details_json: '{}' };
  const v = pruefeFahrzeugVerfuegbarkeit(fz, 'Heckfläche', { startdatum: '2026-01-01', enddatum: '2026-06-30' }, {
    overlapRows: [],
    schaedenRows: [],
    excludeAuftragId: null,
  });
  assert.equal(v.buchbar, false);
  assert.equal(v.sperrgrund_code, 'EIGENWERBUNG');
});

test('Schaden-Zeitraum: Werkstatt offen überlappt Auftrag', () => {
  const sch = {
    fahrzeug_id: 'fz1',
    status: 'offen',
    werkstatt_status: 'in_arbeit',
    created_at: '2026-03-01T10:00:00.000Z',
    bearbeitet_am: null,
  };
  assert.equal(schadenBlockiertZeitraum(sch, '2026-03-15', '2026-03-20'), true);
  assert.equal(schadenBlockiertZeitraum(sch, '2026-01-01', '2026-02-28'), false);
});

test('Ausfall: überlappender Schaden-Eintrag → nicht buchbar', () => {
  const fz = { id: 'fz1', status: 'frei', details_json: '{}' };
  const sch = {
    fahrzeug_id: 'fz1',
    status: 'offen',
    werkstatt_status: 'in_arbeit',
    created_at: '2026-03-01T10:00:00.000Z',
    bearbeitet_am: null,
  };
  const v = pruefeFahrzeugVerfuegbarkeit(fz, 'Heckfläche', { startdatum: '2026-03-15', enddatum: '2026-03-20' }, {
    overlapRows: [],
    schaedenRows: [sch],
    excludeAuftragId: null,
  });
  assert.equal(v.buchbar, false);
  assert.equal(v.sperrgrund_code, 'AUSFALL');
});

test('Alles frei (ohne Belegung, ohne Schaden)', () => {
  const fz = { id: 'fz1', status: 'frei', details_json: '{}' };
  const v = pruefeFahrzeugVerfuegbarkeit(fz, 'Heckfläche', { startdatum: '2026-01-01', enddatum: '2026-12-31' }, {
    overlapRows: [],
    schaedenRows: [],
    excludeAuftragId: null,
  });
  assert.equal(v.buchbar, true);
});

test('Fläche: eigene Belegung (exclude_auftrag_id) zählt nicht als Konflikt', () => {
  const fz = { id: 'fz1', status: 'frei', details_json: '{}' };
  const overlap = [
    {
      fahrzeug_id: 'fz1',
      auftrag_id: 'meine-id',
      auftrag_fusa_extra_json: JSON.stringify({ paket: 'Heckfläche' }),
    },
  ];
  const ohne = pruefeFahrzeugVerfuegbarkeit(fz, 'Heckfläche', { startdatum: '2026-01-01', enddatum: '2026-06-30' }, {
    overlapRows: overlap,
    schaedenRows: [],
    excludeAuftragId: null,
  });
  assert.equal(ohne.buchbar, false);
  const mit = pruefeFahrzeugVerfuegbarkeit(fz, 'Heckfläche', { startdatum: '2026-01-01', enddatum: '2026-06-30' }, {
    overlapRows: overlap,
    schaedenRows: [],
    excludeAuftragId: 'meine-id',
  });
  assert.equal(mit.buchbar, true);
});
