/**
 * Einmal-Import: Artikel aus RG-26-05803 ins Materiallager (nur Stamm, keine Buchungen).
 * Entspricht fachlich GET-Prüfung + POST /api/v1/lager über denselben Store.
 *
 * Voraussetzung: SQLite wie der laufende Server (kein MYSQL_HOST).
 *
 *   cd backend && node scripts/import-rg-lager-artikel.mjs
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Live-DB: nur diese Datei (entspricht C:\\Users\\CC\\Desktop\\CC Cockpit\\backend\\data\\cc-cockpit.db). */
process.env.SQLITE_DB_PATH = path.resolve(__dirname, '..', 'data', 'cc-cockpit.db');

/** CC Werbung Test — Live-Kontext / bestehende Lagerzeile */
const TARGET_FIRMA_ID = 'b0864024-7a4e-460a-9f1a-e98035ffa58a';

const ARTIKEL = [
  {
    artikelnummer: '97601711',
    name: 'ORAGUARD® 215M clear MATT',
    beschreibung: 'UV-Schutz 75µ, 105cm x lfm',
    einheit: 'M',
    kategorie: 'folie',
  },
  {
    artikelnummer: '97600831',
    name: 'ORAGUARD® 200M clear MATT',
    beschreibung: 'UV-Schutz 70µ, 105cm x lfm',
    einheit: 'M',
    kategorie: 'folie',
  },
  {
    artikelnummer: '6998291001',
    name: 'MACal® 9800 Cast™ 9829-100 CAST white GLOSSY',
    beschreibung: '123cm x lfm',
    einheit: 'M',
    kategorie: 'folie',
  },
  {
    artikelnummer: '6998881001',
    name: 'MACal® 9800 Cast™ 9888-100 CAST black MATT',
    beschreibung: '123cm x lfm',
    einheit: 'M',
    kategorie: 'folie',
  },
  {
    artikelnummer: '8926081',
    name: 'ORACAL® 751G-608 petrol GLOSSY High Performance Cast',
    beschreibung: '126cm x lfm',
    einheit: 'M',
    kategorie: 'folie',
  },
  {
    artikelnummer: '25100004',
    name: 'VakoSun Protect 20I INDOOR silver dark',
    beschreibung: '152cm x lfm',
    einheit: 'M',
    kategorie: 'folie',
  },
  {
    artikelnummer: '25100068',
    name: 'VakoSun Protect 20A OUTDOOR silver dark',
    beschreibung: '182cm x lfm',
    einheit: 'M',
    kategorie: 'folie',
  },
  {
    artikelnummer: '4990016',
    name: 'Avery Dennison® Surface Cleaner 1L',
    beschreibung: 'Gebinde + Sprühkopf',
    einheit: 'STK',
    kategorie: 'reinigung',
  },
];

function normAnr(v) {
  return v != null ? String(v).trim() : '';
}

function displayName(a) {
  const n = String(a.name || '').trim();
  const b = String(a.beschreibung || '').trim();
  return b ? `${n} — ${b}` : n;
}

async function main() {
  if (process.env.MYSQL_HOST?.trim()) {
    console.error('[import-rg-lager] Abbruch: MYSQL_HOST gesetzt — bitte Artikel per API anlegen oder Skript an MySQL anpassen.');
    process.exit(1);
  }

  const dbPath = process.env.SQLITE_DB_PATH;
  if (!fs.existsSync(dbPath)) {
    console.error('DB nicht gefunden:', dbPath);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const raw = new SQL.Database(fs.readFileSync(dbPath));
  const cntMatBefore = raw.exec('SELECT COUNT(*) AS c FROM lager_material');
  const cntBuchBefore = raw.exec('SELECT COUNT(*) AS c FROM lager_buchungen');
  const nMatBefore = Number(cntMatBefore[0]?.values?.[0]?.[0] ?? 0);
  const nBuchBefore = Number(cntBuchBefore[0]?.values?.[0]?.[0] ?? 0);
  console.log('lager_material vorher:', nMatBefore, '| lager_buchungen vorher:', nBuchBefore);

  const qCheck = raw.exec(
    'SELECT firma_id FROM lager_material WHERE firma_id = ' + JSON.stringify(TARGET_FIRMA_ID) + ' LIMIT 1',
  );
  const qAny = raw.exec('SELECT firma_id FROM lager_material LIMIT 1');
  raw.close();

  if (qAny[0]?.values?.[0]?.[0] && String(qAny[0].values[0][0]) !== TARGET_FIRMA_ID) {
    console.warn(
      '[import-rg-lager] Hinweis: bestehende Lagerzeile hat andere firma_id als TARGET — Import nutzt trotzdem TARGET_FIRMA_ID.',
    );
  } else if (!qCheck[0]?.values?.length && qAny[0]?.values?.length) {
    console.warn('[import-rg-lager] Hinweis: keine Zeile mit TARGET_FIRMA_ID — Import nutzt TARGET_FIRMA_ID.');
  }

  const firmaId = TARGET_FIRMA_ID;

  const { openDatabase } = await import('../src/db/database.js');
  const store = await openDatabase();

  console.log('Ziel-firma_id (fest):', firmaId);
  console.log('--- Vorher (wie GET /api/v1/lager: listLagerMaterialByFirma) ---');
  const before = await store.listLagerMaterialByFirma(firmaId, { limit: 500, offset: 0 });
  const byAnr = new Map();
  for (const row of before) {
    const k = normAnr(row.artikelnummer);
    if (k) byAnr.set(k, row);
  }
  let pdfVorher = 0;
  for (const a of ARTIKEL) {
    if (byAnr.has(normAnr(a.artikelnummer))) pdfVorher++;
  }
  console.log('Anzahl Materialzeilen:', before.length, '| PDF-Artikel vorher (von 8):', pdfVorher);

  const results = [];

  for (const a of ARTIKEL) {
    const anr = normAnr(a.artikelnummer);
    const existing = byAnr.get(anr);
    const wantName = displayName(a);
    if (existing) {
      const sameName = String(existing.name || '').trim() === wantName;
      results.push({
        artikelnummer: anr,
        status: 'bereits vorhanden',
        detail: sameName ? 'Name/Beschreibung identisch' : `abweichender Name in DB: "${existing.name}"`,
      });
      continue;
    }
    try {
      const row = await store.insertLagerMaterial({
        id: randomUUID(),
        name: wantName,
        kategorie: a.kategorie,
        menge: 0,
        einheit: a.einheit,
        mindestbestand: 0,
        artikelnummer: anr,
        lagerort: null,
        firma_id: firmaId,
      });
      byAnr.set(anr, row);
      results.push({ artikelnummer: anr, status: 'angelegt', id: row.id });
    } catch (e) {
      results.push({
        artikelnummer: anr,
        status: 'Fehler',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log('\n--- Ergebnis je Artikel ---');
  for (const x of results) {
    console.log(JSON.stringify(x));
  }

  const after = await store.listLagerMaterialByFirma(firmaId, { limit: 500, offset: 0 });
  const byNach = new Map();
  for (const row of after) {
    const k = normAnr(row.artikelnummer);
    if (k) byNach.set(k, row);
  }
  let pdfNachher = 0;
  for (const a of ARTIKEL) {
    if (byNach.has(normAnr(a.artikelnummer))) pdfNachher++;
  }
  console.log('\n--- Nachher: Anzahl Materialzeilen:', after.length, '| PDF-Artikel (von 8):', pdfNachher, '---');

  const raw2 = new SQL.Database(fs.readFileSync(dbPath));
  const nMatAfter = Number(raw2.exec('SELECT COUNT(*) AS c FROM lager_material')[0]?.values?.[0]?.[0] ?? 0);
  const nBuchAfter = Number(raw2.exec('SELECT COUNT(*) AS c FROM lager_buchungen')[0]?.values?.[0]?.[0] ?? 0);
  raw2.close();
  console.log('lager_material nachher:', nMatAfter, '| lager_buchungen nachher:', nBuchAfter);
  console.log(
    'lager_buchungen unverändert:',
    nBuchBefore === nBuchAfter ? 'ja' : 'nein (' + nBuchBefore + ' → ' + nBuchAfter + ')',
  );

  const angelegt = results.filter((r) => r.status === 'angelegt').length;
  const vorhanden = results.filter((r) => r.status === 'bereits vorhanden').length;
  console.log('--- Summary: angelegt:', angelegt, '| bereits vorhanden:', vorhanden, '---');

  process.exit(0);
}

await main();
