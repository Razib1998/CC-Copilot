import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCcInternMontageTermin, syncFusaTerminAndLinkedCcIntern } from './auftrag-kalender-sync.js';

function createMockStore() {
  const kalender = [];
  const ccintern = new Map();
  return {
    kalender,
    ccintern,
    async getKalenderTerminByQuelleAndFusaAuftragId(firmaId, quelle, fusaAuftragId) {
      return kalender.find(
        x => x.firma_id === firmaId && x.quelle === quelle && x.fusa_auftrag_id === fusaAuftragId,
      ) || null;
    },
    async getKalenderTerminByQuelleAndAuftragId(firmaId, quelle, auftragId) {
      return kalender.find(
        x => x.firma_id === firmaId && x.quelle === quelle && x.auftrag_id === auftragId,
      ) || null;
    },
    async insertKalenderTermin(row) {
      kalender.push({ ...row });
      return row;
    },
    async updateKalenderTermin(id, firmaId, patch) {
      const idx = kalender.findIndex(x => x.id === id && x.firma_id === firmaId);
      if (idx < 0) return null;
      kalender[idx] = { ...kalender[idx], ...patch };
      return kalender[idx];
    },
    async deleteKalenderTermin(id, firmaId) {
      const idx = kalender.findIndex(x => x.id === id && x.firma_id === firmaId);
      if (idx >= 0) kalender.splice(idx, 1);
      return idx >= 0;
    },
    async updateCcInternAuftrag(id, firmaId, patch) {
      const cur = ccintern.get(id) || { id, firma_id: firmaId };
      const next = { ...cur, ...patch };
      ccintern.set(id, next);
      return next;
    },
    async getCcInternAuftragById(id, firmaId) {
      const cur = ccintern.get(id);
      if (!cur) return null;
      if (String(cur.firma_id || '') !== String(firmaId || '')) return null;
      return cur;
    },
  };
}

test('syncFusaTerminAndLinkedCcIntern: legt Beklebungstermin an und zieht CC-Intern-Termin mit', async () => {
  const store = createMockStore();
  const linked = { id: 'cc-1', firma_id: 'firma-1', kunde: 'ACME' };
  const res = await syncFusaTerminAndLinkedCcIntern({
    store,
    fusaAuftrag: { id: 'fusa-1', termin: '2026-07-01', termin_ende: '2026-07-03', kunde_name: 'ACME', fusa_kunde_id: 'firma-1' },
    linkedCcInternAuftrag: linked,
    actorUserId: 'u-1',
  });
  assert.equal(res.ok, true);
  assert.equal(store.kalender.length, 2);
  const beklebung = store.kalender.find((x) => x.quelle === 'fusa' && x.typ === 'beklebung');
  assert.ok(beklebung);
  assert.equal(beklebung.fusa_auftrag_id, 'fusa-1');
  const montage = store.kalender.find((x) => x.quelle === 'ccintern' && x.typ === 'montage');
  assert.ok(montage);
  assert.equal(montage.auftrag_id, 'cc-1');
  assert.equal(store.ccintern.get('cc-1').montage_datum, '2026-07-01');
});

test('syncFusaTerminAndLinkedCcIntern: entfernt Kalendereintrag wenn Termin entfernt wird', async () => {
  const store = createMockStore();
  store.kalender.push({
    id: 'k1',
    firma_id: 'firma-1',
    quelle: 'fusa',
    fusa_auftrag_id: 'fusa-1',
    typ: 'beklebung',
  });
  await syncFusaTerminAndLinkedCcIntern({
    store,
    fusaAuftrag: { id: 'fusa-1', termin: null, fusa_kunde_id: 'firma-1' },
    linkedCcInternAuftrag: null,
  });
  assert.equal(store.kalender.length, 0);
});

test('syncCcInternMontageTermin: legt Montagekalender an und bleibt fahrzeugfrei', async () => {
  const store = createMockStore();
  const cci = {
    id: 'cc-1',
    firma_id: 'firma-1',
    kunde: 'ACME',
    auftragsnummer: 'AU-2026-001',
    montage_datum: '2026-08-10',
    lieferdatum: '2026-08-11',
    fusa_auftrag_id: 'fusa-1',
  };
  const res = await syncCcInternMontageTermin({ store, ccinternAuftrag: cci, actorUserId: 'u-1' });
  assert.equal(res.ok, true);
  assert.equal(store.kalender.length, 1);
  assert.equal(store.kalender[0].typ, 'montage');
  assert.equal(store.kalender[0].quelle, 'ccintern');
  assert.equal(Object.prototype.hasOwnProperty.call(store.kalender[0], 'fusa_fahrzeug_ids'), false);
  const mont = store.kalender[0];
  const s = mont.start.length === 10 ? `${mont.start}T00:00:00` : mont.start;
  const e = mont.ende.length === 10 ? `${mont.ende}T00:00:00` : mont.ende;
  assert.equal((new Date(e).getTime() - new Date(s).getTime()) / 3600000, 1);
});

test('syncCcInternMontageTermin: ende ist Start + 1h auch wenn lieferdatum vor Montage liegt', async () => {
  const store = createMockStore();
  const cci = {
    id: 'cc-41',
    firma_id: 'firma-1',
    kunde: 'Test',
    auftragsnummer: 'AU-2026-041',
    montage_datum: '2026-05-05T12:00:00',
    lieferdatum: '2026-04-30',
    fusa_auftrag_id: null,
  };
  const res = await syncCcInternMontageTermin({ store, ccinternAuftrag: cci, actorUserId: 'u-1' });
  assert.equal(res.ok, true);
  const montage = store.kalender.find((x) => x.quelle === 'ccintern' && x.typ === 'montage');
  assert.ok(montage);
  assert.equal(montage.start, '2026-05-05T12:00:00');
  assert.equal(montage.ende, '2026-05-05T13:00:00');
});

test('syncCcInternMontageTermin: entfernt Montagekalender wenn Termin leer', async () => {
  const store = createMockStore();
  store.kalender.push({
    id: 'k2',
    firma_id: 'firma-1',
    quelle: 'ccintern',
    auftrag_id: 'cc-1',
    typ: 'montage',
  });
  await syncCcInternMontageTermin({
    store,
    ccinternAuftrag: { id: 'cc-1', firma_id: 'firma-1', montage_datum: null },
  });
  assert.equal(store.kalender.length, 0);
});
