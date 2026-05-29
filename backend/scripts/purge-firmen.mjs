/**
 * Leert Firmen-Stamm: FK-Verknüpfungen in mitarbeiter/checklisten lösen,
 * FUSA-Angebote + Kunden-Extra, dann alle firmen.
 *
 * Reihenfolge:
 *   1. UPDATE mitarbeiter SET firma_id = NULL …
 *   2. UPDATE checklisten SET firma_id = NULL …
 *   3. DELETE fusa_angebote
 *   4. DELETE fusa_kunden_extra
 *   5. DELETE ccintern_kunden_extra
 *   6. DELETE firmen (CASCADE auf mandantenbezogene Tabellen)
 *
 * Prüfung: firmen + Extra + fusa_angebote = 0; Zeilen in mitarbeiter/checklisten
 * wie vor dem Lauf (nicht gelöscht).
 *
 * Vor den UPDATEs: falls `firma_id` in `mitarbeiter` / `checklisten` NOT NULL ist,
 * wird die Spalte kurz nullable gemacht (SQLite: Tabellen-Rebuild; MySQL: ALTER).
 *
 * Gleiche DB wie der Server (.env), analog zu purge-kalender.mjs.
 *
 * Ausführung (von `backend/`):
 *   node scripts/purge-firmen.mjs
 *
 * SQLite: Backend stoppen, bevor die Datei geschrieben wird.
 * Schutz: NODE_ENV=production → Abbruch, außer PURGE_FIRMEN_ALLOW_PROD=1.
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
  if (String(process.env.PURGE_FIRMEN_ALLOW_PROD || '').trim() === '1') {
    console.warn('[purge-firmen] WARNUNG: NODE_ENV=production und PURGE_FIRMEN_ALLOW_PROD=1.');
    return;
  }
  console.error(
    '[purge-firmen] Abbruch: NODE_ENV=production. Nur mit PURGE_FIRMEN_ALLOW_PROD=1 und bewusster Ziel-DB ausführen.',
  );
  process.exit(1);
}

/** @param {import('mysql2/promise').Pool} pool */
async function mysqlAll(pool, sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return /** @type {Record<string, unknown>[]} */ (rows);
}

/** @param {import('mysql2/promise').Pool} pool */
async function mysqlCount(pool, sql) {
  const rows = await mysqlAll(pool, sql, []);
  return rows[0]?.c != null ? Number(rows[0].c) : -1;
}

/** @param {import('mysql2/promise').Pool} pool */
async function ensureMysqlFirmaIdNullable(pool) {
  for (const sql of [
    'ALTER TABLE mitarbeiter MODIFY COLUMN firma_id CHAR(36) NULL',
    'ALTER TABLE checklisten MODIFY COLUMN firma_id CHAR(36) NULL',
  ]) {
    try {
      await pool.execute(sql);
    } catch {
      /* bereits nullable oder Tabelle fehlt */
    }
  }
}

/**
 * SQLite: NOT NULL auf firma_id entfernen (Rebuild), damit UPDATE NULL möglich ist.
 * @param {import('sql.js').Database} db
 */
function ensureSqliteFirmaIdNullable(db) {
  db.run('PRAGMA foreign_keys = OFF');
  try {
    /** @param {string} table */
    const firmaIdIsNotNull = (table) => {
      try {
        const stmt = db.prepare(`PRAGMA table_info(${table})`);
        while (stmt.step()) {
          const row = stmt.getAsObject();
          if (String(row.name) === 'firma_id' && Number(row.notnull) === 1) {
            stmt.free();
            return true;
          }
        }
        stmt.free();
      } catch {
        /* Tabelle fehlt */
      }
      return false;
    };

    if (firmaIdIsNotNull('mitarbeiter')) {
      db.exec(`CREATE TABLE mitarbeiter__purge_firma_null (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        firma_id TEXT,
        vertrag_typ TEXT,
        soll_stunden REAL,
        eintrittsdatum TEXT,
        austrittsdatum TEXT,
        position TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (firma_id) REFERENCES firmen (id)
      )`);
      db.exec('INSERT INTO mitarbeiter__purge_firma_null SELECT * FROM mitarbeiter');
      db.exec('DROP TABLE mitarbeiter');
      db.exec('ALTER TABLE mitarbeiter__purge_firma_null RENAME TO mitarbeiter');
      db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_mitarbeiter_user_firma ON mitarbeiter(user_id, firma_id)',
      );
      db.exec('CREATE INDEX IF NOT EXISTS idx_mitarbeiter_firma ON mitarbeiter(firma_id)');
    }

    if (firmaIdIsNotNull('checklisten')) {
      db.exec(`CREATE TABLE checklisten__purge_firma_null (
        id TEXT PRIMARY KEY NOT NULL,
        titel TEXT NOT NULL,
        firma_id TEXT,
        auftrag_id TEXT,
        erstellt_von TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (firma_id) REFERENCES firmen (id),
        FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE SET NULL,
        FOREIGN KEY (erstellt_von) REFERENCES users (id)
      )`);
      db.exec('INSERT INTO checklisten__purge_firma_null SELECT * FROM checklisten');
      db.exec('DROP TABLE checklisten');
      db.exec('ALTER TABLE checklisten__purge_firma_null RENAME TO checklisten');
      db.exec('CREATE INDEX IF NOT EXISTS idx_checklisten_firma ON checklisten (firma_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_checklisten_auftrag ON checklisten (auftrag_id)');
    }
  } finally {
    db.run('PRAGMA foreign_keys = ON');
  }
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ beforeMitarbeiter: number; beforeChecklisten: number }} baseline
 */
async function verifyAfterMySql(pool, baseline) {
  const nFirmen = await mysqlCount(pool, 'SELECT COUNT(*) AS c FROM firmen');
  const nFusaAng = await mysqlCount(pool, 'SELECT COUNT(*) AS c FROM fusa_angebote');
  const nFusaEx = await mysqlCount(pool, 'SELECT COUNT(*) AS c FROM fusa_kunden_extra');
  const nCciEx = await mysqlCount(pool, 'SELECT COUNT(*) AS c FROM ccintern_kunden_extra');
  const nMa = await mysqlCount(pool, 'SELECT COUNT(*) AS c FROM mitarbeiter');
  const nCl = await mysqlCount(pool, 'SELECT COUNT(*) AS c FROM checklisten');

  console.log('\n[purge-firmen] Prüfungen:');
  console.log('  cnt_firmen (erwartet 0):', nFirmen);
  console.log('  cnt_fusa_angebote (erwartet 0):', nFusaAng);
  console.log('  cnt_fusa_kunden_extra (erwartet 0):', nFusaEx);
  console.log('  cnt_ccintern_kunden_extra (erwartet 0):', nCciEx);
  console.log('  cnt_mitarbeiter (unverändert):', nMa, '| vorher:', baseline.beforeMitarbeiter);
  console.log('  cnt_checklisten (unverändert):', nCl, '| vorher:', baseline.beforeChecklisten);

  if (nFirmen !== 0 || nFusaAng !== 0 || nFusaEx !== 0 || nCciEx !== 0) {
    console.error('[purge-firmen] FEHLER: Leer-Zähler nicht alle 0.');
    process.exit(1);
  }
  if (nMa !== baseline.beforeMitarbeiter || nCl !== baseline.beforeChecklisten) {
    console.error('[purge-firmen] FEHLER: mitarbeiter/checklisten-Zeilenanzahl hat sich geändert.');
    process.exit(1);
  }
  console.log('[purge-firmen] OK (MySQL).');
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
    await ensureMysqlFirmaIdNullable(pool);
    const beforeMitarbeiter = await mysqlCount(pool, 'SELECT COUNT(*) AS c FROM mitarbeiter');
    const beforeChecklisten = await mysqlCount(pool, 'SELECT COUNT(*) AS c FROM checklisten');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE mitarbeiter SET firma_id = NULL WHERE firma_id IS NOT NULL');
      await conn.execute('UPDATE checklisten SET firma_id = NULL WHERE firma_id IS NOT NULL');
      await conn.execute('DELETE FROM fusa_angebote');
      await conn.execute('DELETE FROM fusa_kunden_extra');
      await conn.execute('DELETE FROM ccintern_kunden_extra');
      await conn.execute('DELETE FROM firmen');
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await verifyAfterMySql(pool, { beforeMitarbeiter, beforeChecklisten });
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

function sqliteCount(db, sql) {
  const r = sqliteGet(db, sql, []);
  return r?.c != null ? Number(r.c) : -1;
}

/**
 * @param {import('sql.js').Database} db
 * @param {{ beforeMitarbeiter: number; beforeChecklisten: number }} baseline
 */
function sqliteVerifyAfter(db, baseline) {
  const nFirmen = sqliteCount(db, 'SELECT COUNT(*) AS c FROM firmen');
  const nFusaAng = sqliteCount(db, 'SELECT COUNT(*) AS c FROM fusa_angebote');
  const nFusaEx = sqliteCount(db, 'SELECT COUNT(*) AS c FROM fusa_kunden_extra');
  const nCciEx = sqliteCount(db, 'SELECT COUNT(*) AS c FROM ccintern_kunden_extra');
  const nMa = sqliteCount(db, 'SELECT COUNT(*) AS c FROM mitarbeiter');
  const nCl = sqliteCount(db, 'SELECT COUNT(*) AS c FROM checklisten');

  console.log('\n[purge-firmen] Prüfungen:');
  console.log('  cnt_firmen (erwartet 0):', nFirmen);
  console.log('  cnt_fusa_angebote (erwartet 0):', nFusaAng);
  console.log('  cnt_fusa_kunden_extra (erwartet 0):', nFusaEx);
  console.log('  cnt_ccintern_kunden_extra (erwartet 0):', nCciEx);
  console.log('  cnt_mitarbeiter (unverändert):', nMa, '| vorher:', baseline.beforeMitarbeiter);
  console.log('  cnt_checklisten (unverändert):', nCl, '| vorher:', baseline.beforeChecklisten);

  if (nFirmen !== 0 || nFusaAng !== 0 || nFusaEx !== 0 || nCciEx !== 0) {
    console.error('[purge-firmen] FEHLER: Leer-Zähler nicht alle 0.');
    process.exit(1);
  }
  if (nMa !== baseline.beforeMitarbeiter || nCl !== baseline.beforeChecklisten) {
    console.error('[purge-firmen] FEHLER: mitarbeiter/checklisten-Zeilenanzahl hat sich geändert.');
    process.exit(1);
  }
}

async function runSqlite() {
  if (!fs.existsSync(dbPath)) {
    console.error(`[purge-firmen] SQLite-Datei fehlt: ${dbPath}`);
    process.exit(1);
  }
  console.warn('[purge-firmen] Backend stoppen, bevor die SQLite-Datei geschrieben wird.');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  ensureSqliteFirmaIdNullable(db);
  const beforeMitarbeiter = sqliteCount(db, 'SELECT COUNT(*) AS c FROM mitarbeiter');
  const beforeChecklisten = sqliteCount(db, 'SELECT COUNT(*) AS c FROM checklisten');
  try {
    db.run('PRAGMA foreign_keys = ON');
    db.run('BEGIN TRANSACTION');
    db.run('UPDATE mitarbeiter SET firma_id = NULL WHERE firma_id IS NOT NULL');
    db.run('UPDATE checklisten SET firma_id = NULL WHERE firma_id IS NOT NULL');
    db.run('DELETE FROM fusa_angebote');
    db.run('DELETE FROM fusa_kunden_extra');
    db.run('DELETE FROM ccintern_kunden_extra');
    db.run('DELETE FROM firmen');
    db.run('COMMIT');
    sqliteVerifyAfter(db, { beforeMitarbeiter, beforeChecklisten });
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log('[purge-firmen] OK — DB geschrieben:', dbPath);
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
  console.log(
    '[purge-firmen] mitarbeiter/checklisten firma_id entkoppeln, Angebote+Extra löschen, firmen leeren.',
  );
  assertNotProductionUnlessFlag();
  if (mysqlConfigured()) {
    console.log('[purge-firmen] Treiber: MySQL', process.env.MYSQL_DATABASE || '');
    await runMysql();
  } else {
    console.log('[purge-firmen] Treiber: SQLite —', dbPath);
    await runSqlite();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
