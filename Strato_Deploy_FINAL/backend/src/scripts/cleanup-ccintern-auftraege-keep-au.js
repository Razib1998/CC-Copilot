/**
 * Behält nur ccintern_auftraege mit auftragsnummer AU-2026-042 / 044 / 045 / 046 / 047.
 * Löscht alle anderen CC-Intern-Aufträge plus zugehörige kalender_termine (auftrag_id).
 * ccintern_rechnungen vorher (FK ON DELETE RESTRICT).
 *
 *   node src/scripts/cleanup-ccintern-auftraege-keep-au.js           # Dry-Run
 *   node src/scripts/cleanup-ccintern-auftraege-keep-au.js --execute # Schreibend
 *
 * Backend bei SQLite vorher stoppen. MySQL: .env wie Server.
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
const KEEP_IN = KEEP_NUMMERN.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');

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

/** @param {import('sql.js').Database} db */
function sqliteRun(db, sql, params = []) {
  db.run(sql, params);
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
  const subNotKeep = `SELECT id FROM ccintern_auftraege WHERE auftragsnummer NOT IN (${KEEP_IN})`;
  try {
    const [beforeA] = await pool.execute(
      `SELECT auftragsnummer, id FROM ccintern_auftraege ORDER BY auftragsnummer`,
    );
    const listA = /** @type {any[]} */ (beforeA);
    console.log(`[mysql] ccintern_auftraege vorher: ${listA.length}`);
    listA.forEach((r) => console.log(`  ${r.auftragsnummer} id=${r.id}`));

    const [beforeK] = await pool.execute(
      `SELECT kt.id, kt.titel, kt.auftrag_id, a.auftragsnummer FROM kalender_termine kt LEFT JOIN ccintern_auftraege a ON a.id = kt.auftrag_id WHERE kt.quelle = 'ccintern' ORDER BY kt.start`,
    );
    const listK = /** @type {any[]} */ (beforeK);
    console.log(`[mysql] kalender_termine (ccintern) vorher: ${listK.length}`);

    const [doomedRows] = await pool.execute(`SELECT id FROM ccintern_auftraege WHERE auftragsnummer NOT IN (${KEEP_IN})`);
    const doomed = /** @type {any[]} */ (doomedRows).map((x) => String(x.id));
    const keepRows = listA.filter((r) => KEEP_NUMMERN.includes(String(r.auftragsnummer)));
    console.log(`[mysql] Behalten (Aufträge): ${keepRows.length} — ${keepRows.map((r) => r.auftragsnummer).join(', ')}`);
    console.log(`[mysql] Zu löschende Auftrag-IDs: ${doomed.length}`);

    if (keepRows.length === 0) {
      console.error('[mysql] Keiner der KEEP-Aufträge existiert — Abbruch.');
      process.exit(1);
    }

    if (!execute) {
      console.log('[mysql] Dry-Run — zum Anwenden: --execute');
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r1] = await conn.execute(`DELETE FROM ccintern_rechnungen WHERE auftrag_id IN (${subNotKeep})`);
      console.log(`[mysql] ccintern_rechnungen gelöscht: ${/** @type {any} */ (r1).affectedRows ?? '?'}`);
      const [r2] = await conn.execute(`DELETE FROM kalender_termine WHERE auftrag_id IN (${subNotKeep})`);
      console.log(`[mysql] kalender_termine gelöscht: ${/** @type {any} */ (r2).affectedRows ?? '?'}`);
      const [r3] = await conn.execute(`DELETE FROM ccintern_auftraege WHERE auftragsnummer NOT IN (${KEEP_IN})`);
      console.log(`[mysql] ccintern_auftraege gelöscht: ${/** @type {any} */ (r3).affectedRows ?? '?'}`);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const [afterA] = await pool.execute(`SELECT auftragsnummer FROM ccintern_auftraege ORDER BY auftragsnummer`);
    console.log(`[mysql] ccintern_auftraege nachher: ${/** @type {any[]} */ (afterA).length}`);
    /** @type {any[]} */ (afterA).forEach((r) => console.log(`  ${r.auftragsnummer}`));
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
  const db = new SQL.Database(fs.readFileSync(dbPath));

  try {
    sqliteRun(db, 'PRAGMA foreign_keys = ON');

    const listA = sqliteAll(
      db,
      `SELECT auftragsnummer, id FROM ccintern_auftraege ORDER BY auftragsnummer`,
    );
    console.log(`[sqlite] ccintern_auftraege vorher: ${listA.length}`);
    listA.forEach((r) => console.log(`  ${r.auftragsnummer} id=${r.id}`));

    const listK = sqliteAll(
      db,
      `SELECT kt.id, kt.titel, kt.auftrag_id, a.auftragsnummer FROM kalender_termine kt LEFT JOIN ccintern_auftraege a ON a.id = kt.auftrag_id WHERE kt.quelle = 'ccintern' ORDER BY kt.start`,
    );
    console.log(`[sqlite] kalender_termine (ccintern) vorher: ${listK.length}`);

    const doomedRows = sqliteAll(
      db,
      `SELECT id FROM ccintern_auftraege WHERE auftragsnummer NOT IN (${KEEP_IN})`,
    );
    const doomed = doomedRows.map((x) => String(x.id));
    const keepRows = listA.filter((r) => KEEP_NUMMERN.includes(String(r.auftragsnummer)));
    console.log(`[sqlite] Behalten (Aufträge): ${keepRows.length} — ${keepRows.map((r) => r.auftragsnummer).join(', ')}`);
    console.log(`[sqlite] Zu löschende Auftrag-IDs: ${doomed.length}`);

    if (keepRows.length === 0) {
      console.error('[sqlite] Keiner der KEEP-Aufträge existiert — Abbruch.');
      process.exit(1);
    }

    if (!execute) {
      console.log('[sqlite] Dry-Run — zum Anwenden: --execute');
      return;
    }

    sqliteRun(db, `DELETE FROM ccintern_rechnungen WHERE auftrag_id IN (SELECT id FROM ccintern_auftraege WHERE auftragsnummer NOT IN (${KEEP_IN}))`);
    sqliteRun(db, `DELETE FROM kalender_termine WHERE auftrag_id IN (SELECT id FROM ccintern_auftraege WHERE auftragsnummer NOT IN (${KEEP_IN}))`);
    sqliteRun(db, `DELETE FROM ccintern_auftraege WHERE auftragsnummer NOT IN (${KEEP_IN})`);

    const out = db.export();
    fs.writeFileSync(dbPath, Buffer.from(out));
    console.log(`[sqlite] Transaktion geschrieben: ${dbPath}`);

    const afterA = sqliteAll(db, `SELECT auftragsnummer, schritt, montage_datum FROM ccintern_auftraege ORDER BY auftragsnummer`);
    console.log(`[sqlite] ccintern_auftraege nachher: ${afterA.length}`);
    afterA.forEach((r) => console.log(`  ${r.auftragsnummer} schritt=${r.schritt} montage=${r.montage_datum}`));

    const afterK = sqliteAll(
      db,
      `SELECT titel, start, auftrag_id FROM kalender_termine WHERE quelle = 'ccintern' ORDER BY start`,
    );
    console.log(`[sqlite] kalender_termine (ccintern) nachher: ${afterK.length}`);
    afterK.forEach((r) => console.log(`  ${r.titel} start=${r.start}`));
  } finally {
    db.close();
  }
}

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(`Ziel: nur ccintern_auftraege ${KEEP_NUMMERN.join(' / ')}; andere Aufträge + zugeh. kalender_termine löschen.`);
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
