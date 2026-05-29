/**
 * Alle Kalender-Einträge in SQLite löschen (nur kalender_termine + Urlaub-FK-Freigabe).
 * Ausführung (von backend/): node clear-kalender.js
 * Backend vorher stoppen (Dateisperre auf cc-cockpit.db).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath =
  String(process.env.SQLITE_DB_PATH || '').trim() ||
  path.join(__dirname, 'data', 'cc-cockpit.db');

/** Nur Tabellen, die in sqlite_master existieren und Kalenderdaten betreffen */
const KALENDER_TABLE = 'kalender_termine';

function tableExists(db, name) {
  const row = db.exec(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name='${name.replace(/'/g, "''")}'`,
  );
  return row.length > 0 && row[0].values.length > 0;
}

function countTable(db, name) {
  if (!tableExists(db, name)) return null;
  const r = db.exec(`SELECT COUNT(*) AS c FROM "${name.replace(/"/g, '""')}"`);
  return Number(r[0].values[0][0]);
}

function countUrlaubKalenderRefs(db) {
  if (!tableExists(db, 'urlaub_antraege')) return { termin_id: null, termin_ids: null };
  const r1 = db.exec(
    'SELECT COUNT(*) AS c FROM urlaub_antraege WHERE kalender_termin_id IS NOT NULL',
  );
  const r2 = db.exec(
    'SELECT COUNT(*) AS c FROM urlaub_antraege WHERE kalender_termin_ids IS NOT NULL',
  );
  return {
    termin_id: Number(r1[0].values[0][0]),
    termin_ids: Number(r2[0].values[0][0]),
  };
}

if (!fs.existsSync(dbPath)) {
  console.error('SQLite-Datei fehlt:', dbPath);
  process.exit(1);
}

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(dbPath));
db.run('PRAGMA foreign_keys = ON');

const before = {
  kalender_termine: countTable(db, KALENDER_TABLE),
  urlaub_kalender_termin_id: countUrlaubKalenderRefs(db).termin_id,
  urlaub_kalender_termin_ids: countUrlaubKalenderRefs(db).termin_ids,
};

const deleted = {};

db.run('BEGIN TRANSACTION');
try {
  if (tableExists(db, 'urlaub_antraege')) {
    db.run(
      'UPDATE urlaub_antraege SET kalender_termin_id = NULL WHERE kalender_termin_id IS NOT NULL',
    );
    deleted.urlaub_kalender_termin_id_cleared = before.urlaub_kalender_termin_id ?? 0;
    db.run(
      'UPDATE urlaub_antraege SET kalender_termin_ids = NULL WHERE kalender_termin_ids IS NOT NULL',
    );
    deleted.urlaub_kalender_termin_ids_cleared = before.urlaub_kalender_termin_ids ?? 0;
  }

  if (tableExists(db, KALENDER_TABLE)) {
    db.run(`DELETE FROM ${KALENDER_TABLE}`);
    deleted.kalender_termine = before.kalender_termine ?? 0;
  }

  db.run('COMMIT');
} catch (e) {
  try {
    db.run('ROLLBACK');
  } catch {
    /* ignore */
  }
  db.close();
  throw e;
}

const after = {
  kalender_termine: countTable(db, KALENDER_TABLE),
  urlaub_kalender_termin_id: countUrlaubKalenderRefs(db).termin_id,
  urlaub_kalender_termin_ids: countUrlaubKalenderRefs(db).termin_ids,
};

fs.writeFileSync(dbPath, Buffer.from(db.export()));
db.close();

console.log('Kalender geleert');
console.log(JSON.stringify({ dbPath, before, deleted, after }, null, 2));

if (after.kalender_termine !== 0) {
  console.error('FEHLER: kalender_termine ist nicht leer.');
  process.exit(1);
}
