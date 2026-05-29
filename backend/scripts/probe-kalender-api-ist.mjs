/**
 * IST-Analyse: Kalender-API vs. SQLite (gleiche Store-Logik wie GET /api/v1/stammdaten/kalender).
 *   cd backend && node scripts/probe-kalender-api-ist.mjs
 * Optional: FIRMA_ID=uuid node scripts/probe-kalender-api-ist.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { openDatabase } from '../src/db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = path.join(__dirname, '..', 'data', 'cc-cockpit.db');
const dbPath = String(process.env.SQLITE_DB_PATH || '').trim() || defaultDbPath;

function mysqlConfigured() {
  const host = String(process.env.MYSQL_HOST || '').trim();
  const user = String(process.env.MYSQL_USER || '').trim();
  const database = String(process.env.MYSQL_DATABASE || '').trim();
  return Boolean(host && user && database);
}

async function sqliteTableCount(table) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const r = db.exec(`SELECT COUNT(*) AS c FROM ${table}`);
  const n = r[0]?.values?.[0]?.[0] ?? -1;
  db.close();
  return Number(n);
}

async function main() {
  console.log('[probe-kalender-api-ist] kalenderFusionCache: nur Frontend (cockpit-kalender-view.js), nicht Backend');
  console.log('[probe-kalender-api-ist] Befüllung: bei jedem Render aus API-Feed; Invalidierung: ccwInvalidateKalenderEventCache()');

  if (mysqlConfigured()) {
    console.log('[probe-kalender-api-ist] Treiber: MySQL', process.env.MYSQL_DATABASE);
  } else {
    console.log('[probe-kalender-api-ist] Treiber: SQLite', dbPath);
    if (!fs.existsSync(dbPath)) {
      console.error('[probe-kalender-api-ist] DB-Datei fehlt');
      process.exit(1);
    }
    const n = await sqliteTableCount('kalender_termine');
    console.log('[probe-kalender-api-ist] COUNT(*) kalender_termine (ganze Tabelle):', n);
  }

  const store = await openDatabase();
  const firmen = await store.listFirmen?.({ offset: 0, limit: 50 });
  const firmaList = Array.isArray(firmen) ? firmen : [];
  const firmaId =
    String(process.env.FIRMA_ID || '').trim() ||
    (firmaList[0]?.id != null ? String(firmaList[0].id) : '');

  const now = new Date();
  const vonD = new Date(now);
  vonD.setDate(vonD.getDate() - 400);
  const bisD = new Date(now);
  bisD.setDate(bisD.getDate() + 730);
  const von = vonD.toISOString().slice(0, 10);
  const bis = bisD.toISOString().slice(0, 10);

  console.log('[probe-kalender-api-ist] firmaId:', firmaId || '(leer)');
  console.log('[probe-kalender-api-ist] zeitraum:', von, '…', bis);

  if (!firmaId) {
    console.error('[probe-kalender-api-ist] Keine firma_id — FIRMA_ID setzen oder Firmen seeden.');
    process.exit(1);
  }

  const total = await store.countKalenderTermineByFirma(firmaId, { von, bis });
  const rows = await store.listKalenderTermineByFirma(firmaId, { offset: 0, limit: 200, von, bis });
  const titel = rows.slice(0, 5).map((r) => r?.titel ?? null);

  console.log('[probe-kalender-api-ist] countKalenderTermineByFirma (wie API):', total);
  console.log('[probe-kalender-api-ist] listKalenderTermineByFirma rows:', rows.length);
  console.log('[probe-kalender-api-ist] erste 5 Titel:', titel);
  console.log('[probe-kalender-api-ist] quellen:', [...new Set(rows.map((r) => r?.quelle).filter(Boolean))]);

  if (rows.length > 0) {
    console.log('[probe-kalender-api-ist] erste Zeile (Roh-DB):', rows[0]);
  } else {
    console.log('[probe-kalender-api-ist] API würde termine: [] liefern (keine synthetischen Zeilen in der Route).');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
