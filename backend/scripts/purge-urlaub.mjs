/**
 * Löscht alle Urlaubs-/Abwesenheits-Anträge (Testdaten): DELETE urlaub_antraege.
 * Gleiche DB wie der Server (.env), analog zu purge-kalender.mjs.
 *
 * Ausführung (von `backend/`):
 *   node scripts/purge-urlaub.mjs
 *
 * SQLite: Backend stoppen, bevor die Datei geschrieben wird.
 * MySQL: MYSQL_* in .env.
 *
 * Schutz: NODE_ENV=production → Abbruch, außer PURGE_URLAUB_ALLOW_PROD=1.
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
  if (String(process.env.PURGE_URLAUB_ALLOW_PROD || '').trim() === '1') {
    console.warn('[purge-urlaub] WARNUNG: NODE_ENV=production und PURGE_URLAUB_ALLOW_PROD=1 — urlaub_antraege wird geleert.');
    return;
  }
  console.error(
    '[purge-urlaub] Abbruch: NODE_ENV=production. Nur mit PURGE_URLAUB_ALLOW_PROD=1 und bewusster Ziel-DB ausführen.',
  );
  process.exit(1);
}

/** @param {import('mysql2/promise').Pool} pool */
async function mysqlAll(pool, sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return /** @type {Record<string, unknown>[]} */ (rows);
}

/** @param {import('mysql2/promise').Pool} pool */
async function printCheckMySql(pool) {
  const rows = await mysqlAll(pool, 'SELECT COUNT(*) AS c FROM urlaub_antraege', []);
  const n = rows[0]?.c != null ? Number(rows[0].c) : -1;
  console.log('\n[purge-urlaub] Prüfung (erwartet 0):');
  console.log('  cnt_urlaub_antraege:', n);
  if (n !== 0) {
    console.error('[purge-urlaub] FEHLER: Zähler ist nicht 0.');
    process.exit(1);
  }
  console.log('[purge-urlaub] OK (MySQL).');
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
      await conn.execute('DELETE FROM urlaub_antraege');
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await printCheckMySql(pool);
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
function sqlitePrintCheck(db) {
  const r = sqliteGet(db, 'SELECT COUNT(*) AS c FROM urlaub_antraege', []);
  const n = r?.c != null ? Number(r.c) : -1;
  console.log('\n[purge-urlaub] Prüfung (erwartet 0):');
  console.log('  cnt_urlaub_antraege:', n);
  if (n !== 0) {
    console.error('[purge-urlaub] FEHLER: Zähler ist nicht 0.');
    process.exit(1);
  }
}

async function runSqlite() {
  if (!fs.existsSync(dbPath)) {
    console.error(`[purge-urlaub] SQLite-Datei fehlt: ${dbPath}`);
    process.exit(1);
  }
  console.warn('[purge-urlaub] Backend stoppen, bevor die SQLite-Datei geschrieben wird.');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  try {
    db.run('PRAGMA foreign_keys = ON');
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM urlaub_antraege');
    db.run('COMMIT');
    sqlitePrintCheck(db);
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log('[purge-urlaub] OK — DB geschrieben:', dbPath);
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
  console.log('[purge-urlaub] Tabelle urlaub_antraege leeren (DELETE ALL).');
  assertNotProductionUnlessFlag();
  if (mysqlConfigured()) {
    console.log('[purge-urlaub] Treiber: MySQL', process.env.MYSQL_DATABASE || '');
    await runMysql();
  } else {
    console.log('[purge-urlaub] Treiber: SQLite —', dbPath);
    await runSqlite();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
