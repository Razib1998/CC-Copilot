/**
 * Datenbank aufräumen (sql.js). Backend vor Ausführung stoppen (Dateizugriff).
 * Geschützt: fahrzeuge, users, mitarbeiter, projects, user_rights, user_modules, role_templates
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'cc-cockpit.db');

const SYSTEM_FIRMA = '70d5b669-164c-4cc0-8778-90611235475f';

/** Tabellen, die dieser Lauf leert (inkl. FK-Vorläufer), für COUNT nach dem Lauf */
const TABLES_COUNT_AFTER = [
  'ccintern_rechnungen',
  'kalender_termine',
  'urlaub_antraege',
  'crm_aktivitaeten',
  'messeflow_projekte',
  'ccintern_kunden_extra',
  'ccintern_auftraege',
  'fusa_belegungen',
  'fusa_dokumente',
  'fusa_kunden_extra',
  'fusa_rechnungen',
  'fusa_termine',
  'auftraege',
  'kunden',
  'cockpit_invites',
  'audit_log',
  'refresh_tokens',
  'angebote',
  'schaeden',
  'schaden_fotos',
  'messeflow_workspace',
];

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(dbPath));
db.run('PRAGMA foreign_keys = ON');

// FK: Rechnungen blockieren Löschen von ccintern_auftraege
db.run('DELETE FROM ccintern_rechnungen');

db.run('DELETE FROM kalender_termine');
db.run('DELETE FROM urlaub_antraege');
db.run('DELETE FROM crm_aktivitaeten');
db.run('DELETE FROM messeflow_projekte');

db.run('DELETE FROM ccintern_auftraege');
db.run('DELETE FROM ccintern_kunden_extra');

db.run('DELETE FROM fusa_belegungen');
db.run('DELETE FROM fusa_dokumente');
db.run('DELETE FROM fusa_kunden_extra');
db.run('DELETE FROM fusa_rechnungen');
db.run('DELETE FROM fusa_termine');

db.run('DELETE FROM auftraege');

db.run('DELETE FROM kunden');
db.run('DELETE FROM cockpit_invites');
db.run('DELETE FROM audit_log');
db.run('DELETE FROM refresh_tokens');
db.run('DELETE FROM angebote');
db.run('DELETE FROM schaeden');
db.run('DELETE FROM schaden_fotos');
db.run('DELETE FROM messeflow_workspace');

db.run(`DELETE FROM firmen WHERE id <> '${SYSTEM_FIRMA}'`);

const data = db.export();
fs.writeFileSync(dbPath, Buffer.from(data));

console.log('=== COUNT(*) nach Reset ===');
for (const t of TABLES_COUNT_AFTER) {
  try {
    const r = db.exec(`SELECT COUNT(*) AS c FROM "${t.replace(/"/g, '""')}"`)[0];
    console.log(`${t}|${r.values[0][0]}`);
  } catch (e) {
    console.log(`${t}|ERROR:${e instanceof Error ? e.message : e}`);
  }
}
console.log(`firmen (gesamt)|${db.exec('SELECT COUNT(*) FROM firmen')[0].values[0][0]}`);
db.close();
