/**
 * Einmaliger / idempotenter Seed: CC-Intern-Demo-Lagerbestand → Tabelle `lager_material`.
 *
 * Quelle der Artikel: `frontend/modules/ccintern/views/lager-view.js` → LAGER_CC_DEFAULT_SEED
 * (Felder art, kat, nr, eh, bestand, mindest — status wird nicht persistiert).
 *
 * Deduplizierung pro firma_id:
 *   - gleiche `artikelnummer` wie Seed-`nr`, oder
 *   - `lagerort === '__cc_seed_nr:<Art.-Nr.>'` (ältere Seed-Marker), oder
 *   - gleicher Anzeigename `name` wie `art`.
 *
 * Firma (siehe `scripts/lib/lager-seed-firma-id.js`):
 *   - `SEED_LAGER_FIRMA_ID`, sonst `company_id` von `AUTH_SEED_EMAIL` (Default test@…), sonst erster User mit `company_id`, sonst „CC Werbung“ / erste Firma.
 *
 * Ausführen (im Ordner backend):
 *   npm run seed:lager
 *
 * Produktion: Abbruch ohne ALLOW_DEV_SEEDS_IN_PRODUCTION=1 (siehe src/lib/seed-production-guard.js).
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db/database.js';
import { assertSeedSafeEnvironment } from '../src/lib/seed-production-guard.js';
import { resolveFirmaIdForLagerSeed } from './lib/lager-seed-firma-id.js';

/** @type {{ art: string; kat: string; nr: string; eh: string; bestand: number; mindest: number; status: string }[]} */
const LAGER_CC_DEFAULT_SEED = [
  { art: 'ORAJET® 3551 GLOSSY 137cm', kat: 'folie', nr: 'ORA-3551-G137', eh: 'lfm', bestand: 85, mindest: 20, status: 'ok' },
  { art: 'ORAJET® 3551 GLOSSY 105cm', kat: 'folie', nr: 'ORA-3551-G105', eh: 'lfm', bestand: 42, mindest: 20, status: 'ok' },
  { art: 'ORAJET® 3162 CAST MATT 105cm', kat: 'folie', nr: 'ORA-3162-M105', eh: 'lfm', bestand: 8, mindest: 15, status: 'warn' },
  { art: 'ORAJET® 3162 CAST MATT 137cm', kat: 'folie', nr: 'ORA-3162-M137', eh: 'lfm', bestand: 0, mindest: 15, status: 'leer' },
  { art: 'Avery MPI 1105 EA RS 137cm', kat: 'folie', nr: 'AVY-1105-137', eh: 'lfm', bestand: 23, mindest: 10, status: 'ok' },
  { art: 'VakoSun Protect 20A 152cm', kat: 'folie', nr: 'VAK-20A-152', eh: 'lfm', bestand: 5, mindest: 10, status: 'warn' },
  { art: 'mactac MACal 9888 CAST 123cm', kat: 'folie', nr: 'MAC-9888-123', eh: 'lfm', bestand: 0, mindest: 10, status: 'leer' },
  { art: 'ORAGUARD® 200M MATT 137cm', kat: 'laminat', nr: 'OG-200M-137', eh: 'lfm', bestand: 60, mindest: 20, status: 'ok' },
  { art: 'ORAGUARD® 215G GLOSSY 137cm', kat: 'laminat', nr: 'OG-215G-137', eh: 'lfm', bestand: 55, mindest: 20, status: 'ok' },
  { art: 'ORAGUARD® 215G GLOSSY 105cm', kat: 'laminat', nr: 'OG-215G-105', eh: 'lfm', bestand: 12, mindest: 15, status: 'warn' },
  { art: 'Avery DOL 1460Z GLOSSY 137cm', kat: 'laminat', nr: 'AVY-DOL-137', eh: 'lfm', bestand: 18, mindest: 10, status: 'ok' },
  { art: 'IPA 70% Isopropanol 1L', kat: 'reinigung', nr: 'IPA-70-1L', eh: 'Fl.', bestand: 12, mindest: 5, status: 'ok' },
  { art: 'IPA 70% Isopropanol 5L', kat: 'reinigung', nr: 'IPA-70-5L', eh: 'Fl.', bestand: 3, mindest: 4, status: 'warn' },
  { art: 'Aktivator Primer 250ml', kat: 'reinigung', nr: 'AKT-250', eh: 'Fl.', bestand: 6, mindest: 4, status: 'ok' },
  { art: 'Klebstoff-Entferner 500ml', kat: 'reinigung', nr: 'KLE-500', eh: 'Fl.', bestand: 0, mindest: 3, status: 'leer' },
  { art: 'Rakeln hart (10er Pack)', kat: 'werkzeug', nr: 'RAK-HART-10', eh: 'Pk.', bestand: 4, mindest: 2, status: 'ok' },
  { art: 'Rakeln weich (10er Pack)', kat: 'werkzeug', nr: 'RAK-WEICH-10', eh: 'Pk.', bestand: 1, mindest: 2, status: 'warn' },
  { art: 'Cutter-Klingen 100er', kat: 'werkzeug', nr: 'CUT-100', eh: 'Pk.', bestand: 8, mindest: 3, status: 'ok' },
  { art: 'Heißluftpistole 1800W', kat: 'werkzeug', nr: 'HLP-1800', eh: 'Stk', bestand: 3, mindest: 2, status: 'ok' },
  { art: 'Folienstift silber', kat: 'werkzeug', nr: 'FST-SIL', eh: 'Stk', bestand: 0, mindest: 5, status: 'leer' },
  { art: 'HP 831 Latex Cyan 775ml', kat: 'farbe', nr: 'HP-831-C', eh: 'Fl.', bestand: 3, mindest: 2, status: 'ok' },
  { art: 'HP 831 Latex Magenta 775ml', kat: 'farbe', nr: 'HP-831-M', eh: 'Fl.', bestand: 1, mindest: 2, status: 'warn' },
  { art: 'HP 831 Latex Yellow 775ml', kat: 'farbe', nr: 'HP-831-Y', eh: 'Fl.', bestand: 2, mindest: 2, status: 'ok' },
  { art: 'HP 831 Latex Black 775ml', kat: 'farbe', nr: 'HP-831-K', eh: 'Fl.', bestand: 0, mindest: 2, status: 'leer' },
  { art: 'HP 831 Latex Light Cyan', kat: 'farbe', nr: 'HP-831-LC', eh: 'Fl.', bestand: 2, mindest: 2, status: 'ok' },
  { art: 'HP 831 Latex Light Magenta', kat: 'farbe', nr: 'HP-831-LM', eh: 'Fl.', bestand: 1, mindest: 2, status: 'warn' },
  { art: 'HP Optimierer 775ml', kat: 'farbe', nr: 'HP-OPT', eh: 'Fl.', bestand: 0, mindest: 1, status: 'leer' },
];

const SEED_NR_PREFIX = '__cc_seed_nr:';

/** @param {string} nr */
function seedMarkerForNr(nr) {
  return SEED_NR_PREFIX + String(nr || '').trim();
}

/**
 * @param {any[]} rows
 * @param {string} marker
 * @param {string} nameNorm
 */
function rowExistsForSeed(rows, marker, nameNorm, artikelnummerNorm) {
  const an = String(artikelnummerNorm || '').trim();
  return rows.some((r) => {
    const lo = r && r.lagerort != null ? String(r.lagerort).trim() : '';
    const n = r && r.name != null ? String(r.name).trim() : '';
    const a = r && r.artikelnummer != null ? String(r.artikelnummer).trim() : '';
    return (an && a === an) || lo === marker || n === nameNorm;
  });
}

async function main() {
  assertSeedSafeEnvironment('seed:lager');
  const store = await openDatabase();
  const firmaId = await resolveFirmaIdForLagerSeed(store);
  console.log('[seed:lager] firma_id:', firmaId);

  const existing = await store.listLagerMaterialByFirma(firmaId, { offset: 0, limit: 5000 });
  let inserted = 0;
  let skipped = 0;

  for (const row of LAGER_CC_DEFAULT_SEED) {
    const nr = String(row.nr || '').trim();
    const art = String(row.art || '').trim();
    const marker = seedMarkerForNr(nr);
    if (!nr || !art) {
      console.warn('[seed:lager] Überspringe ungültigen Eintrag:', row);
      skipped++;
      continue;
    }
    if (rowExistsForSeed(existing, marker, art, nr)) {
      skipped++;
      continue;
    }

    const id = randomUUID();
    await store.insertLagerMaterial({
      id,
      name: art,
      kategorie: String(row.kat || '').trim() || null,
      menge: Number(row.bestand ?? 0),
      einheit: String(row.eh || 'Stk').trim() || 'Stk',
      mindestbestand: Number(row.mindest ?? 0),
      artikelnummer: nr,
      lagerort: null,
      firma_id: firmaId,
    });
    existing.push({
      id,
      name: art,
      kategorie: row.kat,
      menge: row.bestand,
      einheit: row.eh,
      mindestbestand: row.mindest,
      artikelnummer: nr,
      lagerort: null,
      firma_id: firmaId,
    });
    inserted++;
  }

  console.log(`[seed:lager] Fertig. Neu: ${inserted}, übersprungen (bereits vorhanden): ${skipped}.`);
}

await main();
