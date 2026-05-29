/**
 * Lokalen Kalender leeren: kalender_termine, Urlaub-Kalender-Verknüpfungen,
 * TEST-/Smoke-Kalenderzeilen. Echte Aufträge (auftraege, ccintern_auftraege) bleiben.
 *
 *   Backend stoppen → node scripts/purge-local-kalender-complete.mjs → Backend starten
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath =
  String(process.env.SQLITE_DB_PATH || '').trim() ||
  path.join(__dirname, '..', 'data', 'cc-cockpit.db');

function runCount(db, sql) {
  const r = db.exec(sql);
  return r[0]?.values?.[0]?.[0] != null ? Number(r[0].values[0][0]) : 0;
}

function runAll(db, sql) {
  const out = [];
  const stmt = db.prepare(sql);
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

if (!fs.existsSync(dbPath)) {
  console.error('[purge-local-kalender] DB fehlt:', dbPath);
  process.exit(1);
}

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(dbPath));
db.run('PRAGMA foreign_keys = ON');

const report = {
  dbPath,
  before: {},
  deleted: {},
  after: {},
};

report.before.kalender_termine = runCount(db, 'SELECT COUNT(*) AS c FROM kalender_termine');
report.before.kalender_test_titel = runCount(
  db,
  "SELECT COUNT(*) AS c FROM kalender_termine WHERE UPPER(titel) LIKE '%TEST%' OR UPPER(titel) LIKE '%SMOKE%'",
);
report.before.kalender_urlaub_typ = runCount(
  db,
  "SELECT COUNT(*) AS c FROM kalender_termine WHERE typ = 'urlaub'",
);
report.before.urlaub_antraege = runCount(db, 'SELECT COUNT(*) AS c FROM urlaub_antraege');
report.before.urlaub_test_bemerkung = runCount(
  db,
  "SELECT COUNT(*) AS c FROM urlaub_antraege WHERE bemerkung IS NOT NULL AND (UPPER(bemerkung) LIKE '%SMOKE%' OR UPPER(bemerkung) LIKE '%TEST%')",
);
report.before.urlaub_mit_kalender_ref = runCount(
  db,
  'SELECT COUNT(*) AS c FROM urlaub_antraege WHERE kalender_termin_id IS NOT NULL OR (kalender_termin_ids IS NOT NULL AND TRIM(kalender_termin_ids) != \'\' AND TRIM(kalender_termin_ids) != \'[]\')',
);

const sampleBefore = runAll(
  db,
  "SELECT id, titel, start, typ, quelle FROM kalender_termine WHERE UPPER(titel) LIKE '%TEST%' OR UPPER(titel) LIKE '%URLAUB%' OR typ = 'urlaub' LIMIT 15",
);
console.log('[purge-local-kalender] Stichprobe kalender_termine vorher:', sampleBefore);

db.run('BEGIN TRANSACTION');
try {
  db.run(
    "DELETE FROM kalender_termine WHERE UPPER(titel) LIKE '%TEST%' OR UPPER(titel) LIKE '%SMOKE%' OR typ = 'urlaub'",
  );
  report.deleted.kalender_test_urlaub_typ = db.getRowsModified();

  db.run('DELETE FROM kalender_termine');
  report.deleted.kalender_all = db.getRowsModified();

  db.run(
    "DELETE FROM urlaub_antraege WHERE bemerkung IS NOT NULL AND (UPPER(bemerkung) LIKE '%SMOKE%' OR UPPER(bemerkung) LIKE '%TEST%')",
  );
  report.deleted.urlaub_test_antraege = db.getRowsModified();

  db.run('UPDATE urlaub_antraege SET kalender_termin_id = NULL, kalender_termin_ids = NULL');
  report.deleted.urlaub_fk_cleared = db.getRowsModified();

  db.run('COMMIT');
} catch (e) {
  try {
    db.run('ROLLBACK');
  } catch {
    /* ignore */
  }
  throw e;
}

report.after.kalender_termine = runCount(db, 'SELECT COUNT(*) AS c FROM kalender_termine');
report.after.urlaub_antraege = runCount(db, 'SELECT COUNT(*) AS c FROM urlaub_antraege');
report.after.urlaub_mit_kalender_ref = runCount(
  db,
  'SELECT COUNT(*) AS c FROM urlaub_antraege WHERE kalender_termin_id IS NOT NULL',
);

fs.writeFileSync(dbPath, Buffer.from(db.export()));
db.close();

console.log('[purge-local-kalender] Fertig.');
console.log(JSON.stringify(report, null, 2));

console.log(`
Browser (nach Backend-Neustart, Strg+Shift+R):
  localStorage.removeItem('ccw-cockpit-general-termine-v1');
  sessionStorage.removeItem('ccw-cockpit-general-termine-v1');
  sessionStorage.removeItem('ccintern_kalender_api_debug');
  // Optional: nur wenn kein anderes Modul betroffen sein soll:
  // localStorage.removeItem('ccwDebugKalender');
`);
