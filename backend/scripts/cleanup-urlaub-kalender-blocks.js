/**
 * Löscht alte Urlaubs-Blocktermine im Kalender (ganztägig oder mehrtägig / Dauer > 24h)
 * und legt für alle genehmigten Urlaubsanträge die Kurz-Termine (07:00–07:15) neu an.
 *
 * Ausführen (Ordner backend):
 *   npm run cleanup:urlaub-kalender
 *
 * Produktion: Abbruch ohne ALLOW_DEV_SEEDS_IN_PRODUCTION=1 (siehe src/lib/seed-production-guard.js).
 */
import 'dotenv/config';
import { openDatabase } from '../src/db/database.js';
import { assertSeedSafeEnvironment } from '../src/lib/seed-production-guard.js';
import {
  createGenehmigteUrlaubKalenderTermine,
  deleteAllKalenderTermineForUrlaubAntrag,
  isUrlaubLegacyBlockKalenderTermin,
} from '../src/lib/urlaub-kalender-termine.js';

const LIST_LIMIT = 50000;

async function main() {
  assertSeedSafeEnvironment('cleanup:urlaub-kalender');
  const store = await openDatabase();
  const firmen = await store.listFirmen();
  if (!Array.isArray(firmen) || firmen.length === 0) {
    console.log('[cleanup:urlaub-kalender] Keine Firmen — Ende.');
    return;
  }

  let deletedBlocks = 0;
  for (const f of firmen) {
    const fid = f && f.id != null ? String(f.id).trim() : '';
    if (!fid) continue;
    const terms = await store.listKalenderTermineByFirma(fid, {
      typ: 'urlaub',
      limit: LIST_LIMIT,
      offset: 0,
    });
    for (const row of terms) {
      if (isUrlaubLegacyBlockKalenderTermin(row)) {
        await store.deleteKalenderTermin(String(row.id), fid);
        deletedBlocks++;
      }
    }
  }
  console.log(`[cleanup:urlaub-kalender] Gelöschte Block-Termine (urlaub): ${deletedBlocks}`);

  let rebuilt = 0;
  for (const f of firmen) {
    const fid = f && f.id != null ? String(f.id).trim() : '';
    if (!fid) continue;
    const antraege = await store.listUrlaubByFirma(fid, {
      status: 'genehmigt',
      limit: LIST_LIMIT,
      offset: 0,
    });
    for (const u of antraege) {
      const uid = u && u.id != null ? String(u.id).trim() : '';
      if (!uid) continue;
      const fresh = await store.getUrlaubById(uid, fid);
      if (!fresh) continue;
      await deleteAllKalenderTermineForUrlaubAntrag(store, fid, fresh);
      const bemerkung =
        fresh.bemerkung != null && String(fresh.bemerkung).trim() !== '' ? String(fresh.bemerkung).trim() : null;
      const entschiedenVon =
        fresh.entschieden_von != null && String(fresh.entschieden_von).trim() !== ''
          ? String(fresh.entschieden_von).trim()
          : null;
      const created = await createGenehmigteUrlaubKalenderTermine(store, {
        firmaId: fid,
        mitarbeiterId: String(fresh.mitarbeiter_id),
        von: String(fresh.von),
        bis: String(fresh.bis),
        bemerkung,
        erstelltVon: entschiedenVon,
        mitarbeiterName: null,
      });
      await store.updateUrlaubAntrag(uid, fid, {
        kalender_termin_id: created.kalender_termin_id,
        kalender_termin_ids: created.kalender_termin_ids,
      });
      rebuilt++;
    }
  }
  console.log(`[cleanup:urlaub-kalender] Genehmigte Anträge neu angebunden: ${rebuilt}`);
  console.log('[cleanup:urlaub-kalender] Fertig.');
}

await main();
