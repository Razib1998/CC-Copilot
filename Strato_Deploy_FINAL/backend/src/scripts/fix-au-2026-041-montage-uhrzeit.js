/**
 * Setzt montage_datum für AU-2026-041 auf 2026-05-05T12:00:00 (falls abweichend)
 * und synchronisiert den Kalendertermin (syncCcInternMontageTermin).
 *
 *   cd backend && node src/scripts/fix-au-2026-041-montage-uhrzeit.js
 */
import 'dotenv/config';
import { openDatabase } from '../db/database.js';
import { syncCcInternMontageTermin } from '../lib/auftrag-kalender-sync.js';

const NUMMER = 'AU-2026-041';
const ZIEL_MONTAGE = '2026-05-05T12:00:00';

/** @param {any} store */
async function findCcInternAuftragByAuftragsnummer(store, nummer) {
  const firmen = await store.listFirmen();
  for (const f of firmen || []) {
    const fid = String(f.id || '').trim();
    if (!fid) continue;
    const items = await store.listCcInternAuftraegeByFirma(fid, { offset: 0, limit: 10000 });
    const hit = items.find((a) => String(a.auftragsnummer) === nummer);
    if (hit) return hit;
  }
  return null;
}

async function main() {
  const store = await openDatabase();
  const auftrag = await findCcInternAuftragByAuftragsnummer(store, NUMMER);

  if (!auftrag?.id) {
    console.error(`[fix-au041] Auftrag ${NUMMER} nicht gefunden.`);
    process.exit(1);
  }

  console.log('Vorher:', {
    id: auftrag.id,
    auftragsnummer: auftrag.auftragsnummer,
    montage_datum: auftrag.montage_datum,
    firma_id: auftrag.firma_id,
  });

  const current = String(auftrag.montage_datum ?? '').trim();
  if (current === ZIEL_MONTAGE) {
    console.log('[fix-au041] montage_datum bereits korrekt — nur Sync.');
  } else {
    await store.updateCcInternAuftrag(auftrag.id, auftrag.firma_id, {
      montage_datum: ZIEL_MONTAGE,
    });
    console.log('[fix-au041] montage_datum aktualisiert auf', ZIEL_MONTAGE);
  }

  const refreshed = await store.getCcInternAuftragById(auftrag.id, auftrag.firma_id);
  if (!refreshed) {
    console.error('[fix-au041] Auftrag nach Update nicht lesbar.');
    process.exit(1);
  }

  await syncCcInternMontageTermin({
    store,
    ccinternAuftrag: refreshed,
    actorUserId: null,
  });

  const kt = await store.getKalenderTerminByQuelleAndAuftragId(
    refreshed.firma_id,
    'ccintern',
    refreshed.id,
  );
  console.log('Kalendertermin (quelle=ccintern):', kt ? { id: kt.id, start: kt.start, ende: kt.ende } : null);
}

await main().catch((e) => {
  console.error(e);
  process.exit(1);
});
