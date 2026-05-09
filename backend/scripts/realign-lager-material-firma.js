/**
 * Setzt bei allen Zeilen in `lager_material` die Spalte `firma_id` auf die Ziel-Firma,
 * die `resolveFirmaIdForLagerSeed` ermittelt (gleiche Logik wie `npm run seed:lager`).
 *
 *   npm run fix:lager-firma
 *
 * Produktion: Abbruch ohne ALLOW_DEV_SEEDS_IN_PRODUCTION=1.
 */
import 'dotenv/config';
import { openDatabase } from '../src/db/database.js';
import { assertSeedSafeEnvironment } from '../src/lib/seed-production-guard.js';
import { resolveFirmaIdForLagerSeed } from './lib/lager-seed-firma-id.js';

async function main() {
  assertSeedSafeEnvironment('fix:lager-firma');
  const store = await openDatabase();
  const firmaId = await resolveFirmaIdForLagerSeed(store);
  if (typeof store.reassignAllLagerMaterialFirmaId !== 'function') {
    console.error('[fix:lager-firma] Store unterstützt reassignAllLagerMaterialFirmaId nicht.');
    process.exit(1);
  }
  const res = await store.reassignAllLagerMaterialFirmaId(firmaId);
  console.log('[fix:lager-firma] Ziel-firma_id:', firmaId);
  console.log('[fix:lager-firma] Aktualisierte Zeilen:', res && res.changed != null ? res.changed : '?');
}

await main();
