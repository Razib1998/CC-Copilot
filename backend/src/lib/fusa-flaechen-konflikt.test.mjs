import test from 'node:test';
import assert from 'node:assert/strict';
import { beruehrteFlaechenFuerPaket } from './fusa-paket-flaechen.js';
import {
  aggregiereBelegteFlaechenFuerFahrzeug,
  bewertePaketGegenFlaechenbestand,
} from './fusa-flaechen-belegung.js';
import { pruefeFusaBuchungVorBelegung } from './fusa-fahrzeug-verfuegbarkeit.js';

function row(fz, extraJson) {
  return {
    fahrzeug_id: fz,
    auftrag_id: 'a1',
    auftrag_fusa_extra_json: JSON.stringify(extraJson),
  };
}

test('A: Heck vs Heck gleicher Zeitraum → Konflikt', () => {
  const overlap = [row('fz1', { paket: 'Heckfläche' })];
  const b = aggregiereBelegteFlaechenFuerFahrzeug(overlap, 'fz1', null);
  const ev = bewertePaketGegenFlaechenbestand('Heckfläche', b);
  assert.equal(ev.erlaubt, false);
  assert.ok(ev.konfliktflaechen.includes('heck'));
});

test('B: Heck gebucht, Seiten angefragt → erlaubt', () => {
  const overlap = [row('fz1', { paket: 'Heckfläche' })];
  const b = aggregiereBelegteFlaechenFuerFahrzeug(overlap, 'fz1', null);
  const ev = bewertePaketGegenFlaechenbestand('Teilgestaltung ohne Heck', b);
  assert.equal(ev.erlaubt, true);
});

test('C: Seiten gebucht, Ganzgestaltung → blockiert', () => {
  const overlap = [row('fz1', { paket: 'Teilgestaltung ohne Heck' })];
  const b = aggregiereBelegteFlaechenFuerFahrzeug(overlap, 'fz1', null);
  const ev = bewertePaketGegenFlaechenbestand('Ganzgestaltung', b);
  assert.equal(ev.erlaubt, false);
});

test('D: Ganzgestaltung gebucht, Heck neu → blockiert', () => {
  const overlap = [row('fz1', { paket: 'Ganzgestaltung' })];
  const b = aggregiereBelegteFlaechenFuerFahrzeug(overlap, 'fz1', null);
  const ev = bewertePaketGegenFlaechenbestand('Heckfläche', b);
  assert.equal(ev.erlaubt, false);
});

test('E: kein Überlapp (leere overlap-Liste) → erlaubt', () => {
  const b = aggregiereBelegteFlaechenFuerFahrzeug([], 'fz1', null);
  const ev = bewertePaketGegenFlaechenbestand('Heckfläche', b);
  assert.equal(ev.erlaubt, true);
});

test('F: fehlendes Paket in Alt-Belegung → konservativ / unsicher', () => {
  const overlap = [row('fz1', {})];
  const b = aggregiereBelegteFlaechenFuerFahrzeug(overlap, 'fz1', null);
  assert.equal(b.pruefung_unsicher, true);
  assert.equal(b.belegte_flaechen.length, 4);
  const ev = bewertePaketGegenFlaechenbestand('Teilgestaltung ohne Heck', b);
  assert.equal(ev.erlaubt, false);
});

const fzRowFrei = { id: 'fz1', status: 'frei', details_json: '{}' };

test('G: pruefeNeuanlage nutzt preispositionen je Fahrzeug', () => {
  const overlap = [row('fz1', { paket: 'Heckfläche' })];
  const extra = {
    paket: 'Heckfläche',
    preispositionen: [
      { fahrzeug_id: 'fz1', paket: 'Teilgestaltung ohne Heck' },
    ],
  };
  const r = pruefeFusaBuchungVorBelegung({
    projectId: 'p1',
    overlapRows: overlap,
    fahrzeugIds: ['fz1'],
    fusaExtraJsonStr: JSON.stringify(extra),
    excludeAuftragId: null,
    kennungenById: { fz1: 'MH-1' },
    fahrzeugRowsById: { fz1: fzRowFrei },
    schaedenRowsAll: [],
    startdatum: '2026-01-01',
    enddatum: '2026-12-31',
  });
  assert.equal(r.ok, true);
});

test('H: pruefeNeuanlage Heck vs Heck → abgelehnt', () => {
  const overlap = [row('fz1', { paket: 'Heckfläche' })];
  const r = pruefeFusaBuchungVorBelegung({
    projectId: 'p1',
    overlapRows: overlap,
    fahrzeugIds: ['fz1'],
    fusaExtraJsonStr: JSON.stringify({ paket: 'Heckfläche' }),
    excludeAuftragId: null,
    kennungenById: { fz1: 'MH-1' },
    fahrzeugRowsById: { fz1: fzRowFrei },
    schaedenRowsAll: [],
    startdatum: '2026-01-01',
    enddatum: '2026-12-31',
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /MH-1/);
});

test('Unbekanntes Paketlabel → alle Flächen angenommen', () => {
  const m = beruehrteFlaechenFuerPaket('Fantasiepaket XYZ');
  assert.equal(m.quelle, 'unbekannt');
  assert.equal(m.flaechen.length, 4);
});
