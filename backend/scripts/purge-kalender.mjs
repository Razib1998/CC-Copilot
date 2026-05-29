/**
 * Löscht alle Kalender-Termine (Testdaten): zuerst Referenzen in urlaub_antraege,
 * dann DELETE kalender_termine. Nutzt dieselbe DB wie der Server (.env).
 *
 * Ausführung (von `backend/`):
 *   node scripts/purge-kalender.mjs
 *
 * SQLite: Backend stoppen, bevor die Datei geschrieben wird.
 * MySQL: Wie in anderen Scripts (MYSQL_* in .env).
 *
 * Schutz: Bei NODE_ENV=production Abbruch, außer PURGE_KALENDER_ALLOW_PROD=1.
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
  if (String(process.env.PURGE_KALENDER_ALLOW_PROD || '').trim() === '1') {
    console.warn('[purge-kalender] WARNUNG: NODE_ENV=production und PURGE_KALENDER_ALLOW_PROD=1 — Kalender wird geleert.');
    return;
  }
  console.error(
    '[purge-kalender] Abbruch: NODE_ENV=production. Nur mit PURGE_KALENDER_ALLOW_PROD=1 und bewusster Ziel-DB ausführen.',
  );
  process.exit(1);
}

/** @param {import('mysql2/promise').Pool} pool */
async function mysqlAll(pool, sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return /** @type {Record<string, unknown>[]} */ (rows);
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
      await conn.execute(
        'UPDATE urlaub_antraege SET kalender_termin_id = NULL WHERE kalender_termin_id IS NOT NULL',
      );
      await conn.execute(
        'UPDATE urlaub_antraege SET kalender_termin_ids = NULL WHERE kalender_termin_ids IS NOT NULL',
      );
      await conn.execute('DELETE FROM kalender_termine');
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

/** @param {import('mysql2/promise').Pool} pool */
async function printChecksMySql(pool) {
  const c1 = await mysqlAll(pool, 'SELECT COUNT(*) AS c FROM kalender_termine', []);
  const c2 = await mysqlAll(
    pool,
    'SELECT COUNT(*) AS c FROM urlaub_antraege WHERE kalender_termin_id IS NOT NULL',
    [],
  );
  const c3 = await mysqlAll(
    pool,
    'SELECT COUNT(*) AS c FROM urlaub_antraege WHERE kalender_termin_ids IS NOT NULL',
    [],
  );
  const n1 = c1[0]?.c != null ? Number(c1[0].c) : -1;
  const n2 = c2[0]?.c != null ? Number(c2[0].c) : -1;
  const n3 = c3[0]?.c != null ? Number(c3[0].c) : -1;
  console.log('\n[purge-kalender] Prüfungen (erwartet je 0):');
  console.log('  cnt_kalender_termine:', n1);
  console.log('  cnt_urlaub_mit_kalender_termin_id:', n2);
  console.log('  cnt_urlaub_mit_kalender_termin_ids:', n3);
  if (n1 !== 0 || n2 !== 0 || n3 !== 0) {
    console.error('[purge-kalender] FEHLER: Mindestens ein Zähler ist nicht 0.');
    process.exit(1);
  }
  console.log('[purge-kalender] OK (MySQL).');
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
  const r1 = sqliteGet(db, 'SELECT COUNT(*) AS c FROM kalender_termine', []);
  const r2 = sqliteGet(
    db,
    'SELECT COUNT(*) AS c FROM urlaub_antraege WHERE kalender_termin_id IS NOT NULL',
    [],
  );
  const r3 = sqliteGet(
    db,
    'SELECT COUNT(*) AS c FROM urlaub_antraege WHERE kalender_termin_ids IS NOT NULL',
    [],
  );
  const n1 = r1?.c != null ? Number(r1.c) : -1;
  const n2 = r2?.c != null ? Number(r2.c) : -1;
  const n3 = r3?.c != null ? Number(r3.c) : -1;
  console.log('\n[purge-kalender] Prüfungen (erwartet je 0):');
  console.log('  cnt_kalender_termine:', n1);
  console.log('  cnt_urlaub_mit_kalender_termin_id:', n2);
  console.log('  cnt_urlaub_mit_kalender_termin_ids:', n3);
  if (n1 !== 0 || n2 !== 0 || n3 !== 0) {
    console.error('[purge-kalender] FEHLER: Mindestens ein Zähler ist nicht 0.');
    process.exit(1);
  }
}

async function runSqlite() {
  if (!fs.existsSync(dbPath)) {
    console.error(`[purge-kalender] SQLite-Datei fehlt: ${dbPath}`);
    process.exit(1);
  }
  console.warn('[purge-kalender] Backend stoppen, bevor die SQLite-Datei geschrieben wird.');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  try {
    db.run('PRAGMA foreign_keys = ON');
    db.run('BEGIN TRANSACTION');
    db.run(
      'UPDATE urlaub_antraege SET kalender_termin_id = NULL WHERE kalender_termin_id IS NOT NULL',
    );
    db.run(
      'UPDATE urlaub_antraege SET kalender_termin_ids = NULL WHERE kalender_termin_ids IS NOT NULL',
    );
    db.run('DELETE FROM kalender_termine');
    db.run('COMMIT');
    sqlitePrintChecks(db);
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log('[purge-kalender] OK — DB geschrieben:', dbPath);
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
  console.log('[purge-kalender] Kalender leeren (nur urlaub_antraege FK-Felder + kalender_termine).');
  assertNotProductionUnlessFlag();
  if (mysqlConfigured()) {
    console.log('[purge-kalender] Treiber: MySQL', process.env.MYSQL_DATABASE || '');
    await runMysql();
  } else {
    console.log('[purge-kalender] Treiber: SQLite —', dbPath);
    await runSqlite();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
