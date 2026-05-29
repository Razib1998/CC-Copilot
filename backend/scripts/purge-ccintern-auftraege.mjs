/**
 * Löscht alle CC-Intern-Aufträge inkl. Rechnungen (Testdaten).
 *
 * Reihenfolge: zuerst `ccintern_rechnungen` (FK RESTRICT auf Auftrag),
 * dann `ccintern_auftraege` — CASCADE entfernt u. a.:
 *   ccintern_auftrag_kommentare, ccintern_auftrag_dateien,
 *   produktion_auftraege, ccintern_mitarbeiter_zeiten
 *
 * Nicht gelöscht: users, firmen, Rechte, kalender_termine, urlaub_antraege.
 * Hinweis: `kalender_termine.auftrag_id` hat ON DELETE SET NULL — Verknüpfung zu
 * CC-Aufträgen wird beim Löschen nur genullt, Terminzeilen bleiben (Felder ggf. NULL).
 *
 * Gleiche DB wie der Server (.env), analog zu purge-kalender.mjs.
 *
 * Ausführung (von `backend/`):
 *   node scripts/purge-ccintern-auftraege.mjs
 *
 * SQLite: Backend stoppen, bevor die Datei geschrieben wird.
 *
 * Schutz: NODE_ENV=production → Abbruch, außer PURGE_CCINTERN_AUFTRAEGE_ALLOW_PROD=1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import mysql from 'mysql2/promise';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoBackendRoot = path.join(__dirname, '..');
const defaultDbPath = path.join(repoBackendRoot, 'data', 'cc-cockpit.db');
const dbPath = String(process.env.SQLITE_DB_PATH || '').trim() || defaultDbPath;

function mysqlConfigured() {
  const host = String(process.env.MYSQL_HOST || '').trim();
  const user = String(process.env.MYSQL_USER || '').trim();
  const database = String(process.env.MYSQL_DATABASE || '').trim();
  return Boolean(host && user && database);
}

function assertNotProductionUnlessFlag() {
  if (process.env.NODE_ENV !== 'production') return;
  if (String(process.env.PURGE_CCINTERN_AUFTRAEGE_ALLOW_PROD || '').trim() === '1') {
    console.warn(
      '[purge-ccintern-auftraege] WARNUNG: NODE_ENV=production und PURGE_CCINTERN_AUFTRAEGE_ALLOW_PROD=1.',
    );
    return;
  }
  console.error(
    '[purge-ccintern-auftraege] Abbruch: NODE_ENV=production. Nur mit PURGE_CCINTERN_AUFTRAEGE_ALLOW_PROD=1 und bewusster Ziel-DB ausführen.',
  );
  process.exit(1);
}

/** @param {import('mysql2/promise').Pool} pool */
async function mysqlAll(pool, sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return /** @type {Record<string, unknown>[]} */ (rows);
}

/** @param {import('mysql2/promise').Pool} pool */
async function printChecksMySql(pool) {
  const q = async (sql) => {
    const rows = await mysqlAll(pool, sql, []);
    return rows[0]?.c != null ? Number(rows[0].c) : -1;
  };
  const n1 = await q('SELECT COUNT(*) AS c FROM ccintern_rechnungen');
  const n2 = await q('SELECT COUNT(*) AS c FROM ccintern_auftraege');
  const n3 = await q('SELECT COUNT(*) AS c FROM produktion_auftraege');
  console.log('\n[purge-ccintern-auftraege] Prüfungen (erwartet je 0):');
  console.log('  cnt_ccintern_rechnungen:', n1);
  console.log('  cnt_ccintern_auftraege:', n2);
  console.log('  cnt_produktion_auftraege:', n3);
  if (n1 !== 0 || n2 !== 0 || n3 !== 0) {
    console.error('[purge-ccintern-auftraege] FEHLER: Mindestens ein Zähler ist nicht 0.');
    process.exit(1);
  }
  console.log('[purge-ccintern-auftraege] OK (MySQL).');
}

async function runMysql() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT || 3306),
    ssl: String(process.env.MYSQL_SSL || '').trim() === '1' ? {} : undefined,
  });
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM ccintern_rechnungen');
      await conn.execute('DELETE FROM ccintern_auftraege');
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await printChecksMySql(pool);
  } finally {
    await pool.end();
  }
}

/** @param {import('sql.js').Database} db */
function sqliteGet(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

/** @param {import('sql.js').Database} db */
function sqlitePrintChecks(db) {
  const pick = (sql) => {
    const r = sqliteGet(db, sql, []);
    return r?.c != null ? Number(r.c) : -1;
  };
  const n1 = pick('SELECT COUNT(*) AS c FROM ccintern_rechnungen');
  const n2 = pick('SELECT COUNT(*) AS c FROM ccintern_auftraege');
  const n3 = pick('SELECT COUNT(*) AS c FROM produktion_auftraege');
  console.log('\n[purge-ccintern-auftraege] Prüfungen (erwartet je 0):');
  console.log('  cnt_ccintern_rechnungen:', n1);
  console.log('  cnt_ccintern_auftraege:', n2);
  console.log('  cnt_produktion_auftraege:', n3);
  if (n1 !== 0 || n2 !== 0 || n3 !== 0) {
    console.error('[purge-ccintern-auftraege] FEHLER: Mindestens ein Zähler ist nicht 0.');
    process.exit(1);
  }
}

async function runSqlite() {
  if (!fs.existsSync(dbPath)) {
    console.error(`[purge-ccintern-auftraege] SQLite-Datei fehlt: ${dbPath}`);
    process.exit(1);
  }
  console.warn('[purge-ccintern-auftraege] Backend stoppen, bevor die SQLite-Datei geschrieben wird.');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  try {
    db.run('PRAGMA foreign_keys = ON');
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM ccintern_rechnungen');
    db.run('DELETE FROM ccintern_auftraege');
    db.run('COMMIT');
    sqlitePrintChecks(db);
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log('[purge-ccintern-auftraege] OK — DB geschrieben:', dbPath);
  } catch (e) {
    try {
      db.run('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    db.close();
  }
}

async function main() {
  console.log('[purge-ccintern-auftraege] ccintern_rechnungen + ccintern_auftraege leeren.');
  assertNotProductionUnlessFlag();
  if (mysqlConfigured()) {
    console.log('[purge-ccintern-auftraege] Treiber: MySQL', process.env.MYSQL_DATABASE || '');
    await runMysql();
  } else {
    console.log('[purge-ccintern-auftraege] Treiber: SQLite —', dbPath);
    await runSqlite();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
