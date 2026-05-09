/**
 * Löscht Kalendereinträge in kalender_termine, behält nur Termine zu
 * AU-2026-042 / AU-2026-041 (Join ccintern_auftraege oder Titel-Match).
 * Aufträge (ccintern_auftraege) werden nicht angefasst.
 *
 * Ausführung (Ordner backend):
 *   node src/scripts/cleanup-kalender-termine-keep-au.js           # Dry-Run
 *   node src/scripts/cleanup-kalender-termine-keep-au.js --execute # Schreibend
 *
 * Backend bei SQLite vorher stoppen (Dateisperre). MySQL: Verbindung wie Server (.env).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import mysql from 'mysql2/promise';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoBackendRoot = path.join(__dirname, '..', '..');
const defaultDbPath = path.join(repoBackendRoot, 'data', 'cc-cockpit.db');
const dbPath = String(process.env.SQLITE_DB_PATH || '').trim() || defaultDbPath;

const KEEP_NUMMERN = ['AU-2026-042', 'AU-2026-044', 'AU-2026-045', 'AU-2026-046', 'AU-2026-047'];

const LIST_SQL = `
SELECT kt.id, kt.titel, kt.auftrag_id, kt.quelle, kt.typ, kt.start, kt.ende, a.auftragsnummer
FROM kalender_termine kt
LEFT JOIN ccintern_auftraege a ON a.id = kt.auftrag_id
ORDER BY kt.start
`;

const KEEP_SQL = `
SELECT kt.id
FROM kalender_termine kt
LEFT JOIN ccintern_auftraege a ON a.id = kt.auftrag_id
WHERE a.auftragsnummer IN ('AU-2026-042', 'AU-2026-044', 'AU-2026-045', 'AU-2026-046', 'AU-2026-047')
   OR kt.titel LIKE '%AU-2026-042%'
   OR kt.titel LIKE '%AU-2026-044%'
   OR kt.titel LIKE '%AU-2026-045%'
   OR kt.titel LIKE '%AU-2026-046%'
   OR kt.titel LIKE '%AU-2026-047%'
`;

function mysqlConfigured() {
  const host = String(process.env.MYSQL_HOST || '').trim();
  const user = String(process.env.MYSQL_USER || '').trim();
  const database = String(process.env.MYSQL_DATABASE || '').trim();
  return Boolean(host && user && database);
}

/** @param {import('sql.js').Database} db */
function sqliteAll(db, sql) {
  const out = [];
  const stmt = db.prepare(sql);
  while (stmt.step()) {
    out.push(stmt.getAsObject());
  }
  stmt.free();
  return out;
}

async function runMysql(execute) {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT || 3306),
    ssl: String(process.env.MYSQL_SSL || '').trim() === '1' ? {} : undefined,
  });

  try {
    const [beforeRows] = await pool.execute(LIST_SQL);
    const list = /** @type {any[]} */ (beforeRows);
    console.log(`[mysql] kalender_termine vorher: ${list.length}`);
    for (const r of list) {
      console.log(
        `  id=${r.id} start=${r.start} titel=${JSON.stringify(r.titel)} auftrag=${r.auftragsnummer ?? r.auftrag_id}`,
      );
    }

    const [keepRows] = await pool.execute(KEEP_SQL);
    const keepIds = /** @type {{ id: string }[]} */ (keepRows).map((x) => String(x.id));
    if (keepIds.length === 0) {
      console.error('[mysql] Keine Zeilen gemäß KEEP-Kriterien — Abbruch (nichts gelöscht).');
      process.exit(1);
    }

    const keepSet = new Set(keepIds);
    const toDelete = list.map((r) => String(r.id)).filter((id) => !keepSet.has(id));
    console.log(`[mysql] Behalten (${keepIds.length}): ${keepIds.join(', ')}`);
    console.log(`[mysql] Zu löschen: ${toDelete.length}`);

    if (!execute) {
      console.log('[mysql] Dry-Run — zum Anwenden: --execute');
      return;
    }

    if (toDelete.length > 0) {
      const ph = toDelete.map(() => '?').join(',');
      const [res] = await pool.execute(`DELETE FROM kalender_termine WHERE id IN (${ph})`, toDelete);
      const info = /** @type {import('mysql2').ResultSetHeader} */ (res);
      console.log(`[mysql] Gelöscht: ${info.affectedRows}`);
    } else {
      console.log('[mysql] Nichts zu löschen.');
    }

    const [afterRows] = await pool.execute(LIST_SQL);
    const after = /** @type {any[]} */ (afterRows);
    console.log(`[mysql] kalender_termine nachher: ${after.length}`);
    for (const r of after) {
      console.log(
        `  id=${r.id} start=${r.start} titel=${JSON.stringify(r.titel)} auftrag=${r.auftragsnummer ?? r.auftrag_id}`,
      );
    }
  } finally {
    await pool.end();
  }
}

async function runSqlite(execute) {
  if (!fs.existsSync(dbPath)) {
    console.error(`[sqlite] Datei fehlt: ${dbPath}`);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const fileBuf = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuf);

  try {
    const list = sqliteAll(db, LIST_SQL);
    console.log(`[sqlite] kalender_termine vorher: ${list.length}`);
    for (const r of list) {
      console.log(
        `  id=${r.id} start=${r.start} titel=${JSON.stringify(r.titel)} auftrag=${r.auftragsnummer ?? r.auftrag_id}`,
      );
    }

    const keepRows = sqliteAll(db, KEEP_SQL);
    const keepIds = keepRows.map((x) => String(x.id));
    if (keepIds.length === 0) {
      console.error('[sqlite] Keine Zeilen gemäß KEEP-Kriterien — Abbruch (nichts gelöscht).');
      process.exit(1);
    }

    const keepSet = new Set(keepIds);
    const toDelete = list.map((r) => String(r.id)).filter((id) => !keepSet.has(id));
    console.log(`[sqlite] Behalten (${keepIds.length}): ${keepIds.join(', ')}`);
    console.log(`[sqlite] Zu löschen: ${toDelete.length}`);

    if (!execute) {
      console.log('[sqlite] Dry-Run — zum Anwenden: --execute');
      return;
    }

    for (const id of toDelete) {
      db.run('DELETE FROM kalender_termine WHERE id = ?', [id]);
    }

    const out = db.export();
    fs.writeFileSync(dbPath, Buffer.from(out));
    console.log(`[sqlite] Gelöscht: ${toDelete.length} (Datei geschrieben: ${dbPath})`);

    const after = sqliteAll(db, LIST_SQL);
    console.log(`[sqlite] kalender_termine nachher: ${after.length}`);
    for (const r of after) {
      console.log(
        `  id=${r.id} start=${r.start} titel=${JSON.stringify(r.titel)} auftrag=${r.auftragsnummer ?? r.auftrag_id}`,
      );
    }
  } finally {
    db.close();
  }
}

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(`Ziel: nur Termine zu ${KEEP_NUMMERN.join(' / ')} behalten (Kalender, keine Aufträge).`);
  if (mysqlConfigured()) {
    await runMysql(execute);
  } else {
    console.log(`[sqlite] DB-Pfad: ${dbPath}`);
    await runSqlite(execute);
  }
}

await main().catch((e) => {
  console.error(e);
  process.exit(1);
});
