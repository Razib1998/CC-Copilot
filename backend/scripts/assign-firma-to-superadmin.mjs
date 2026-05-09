/**
 * Zeigt Firmen und SUPER_ADMIN-User ohne company_id; optional --apply:
 * weist allen SUPER_ADMINs ohne company_id (oder einem --email=…) die erste Firma zu.
 *
 *   node scripts/assign-firma-to-superadmin.mjs
 *   node scripts/assign-firma-to-superadmin.mjs --apply
 *   node scripts/assign-firma-to-superadmin.mjs --apply --email=ccwerbung@googlemail.com
 *   node scripts/assign-firma-to-superadmin.mjs --apply --firma-id=<uuid> --email=...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'cc-cockpit.db');

const emailFilter = (() => {
  const a = process.argv.find((x) => x.startsWith('--email='));
  if (!a) return null;
  return a.slice('--email='.length).trim().toLowerCase();
})();

const firmaIdArg = (() => {
  const a = process.argv.find((x) => x.startsWith('--firma-id='));
  if (!a) return null;
  return a.slice('--firma-id='.length).trim();
})();

const SQL = await initSqlJs();
if (!fs.existsSync(dbPath)) {
  console.error('DB fehlt:', dbPath);
  process.exit(1);
}
const db = new SQL.Database(fs.readFileSync(dbPath));

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

console.log('SQLite:', dbPath);

const firmen = all(
  'SELECT id, name FROM firmen ORDER BY name COLLATE NOCASE ASC LIMIT 10',
  [],
);
console.log('\n--- Firmen (max. 10) ---');
if (!firmen.length) {
  console.log('(keine Firmen in der Datenbank)');
  db.close();
  process.exit(1);
}
firmen.forEach((f) => console.log(String(f.id), '\t', f.name));

function pickDefaultFirmaId(rows) {
  const exact = rows.find((f) => String(f?.name || '').trim().toLowerCase() === 'cc werbung');
  const pick = exact && exact.id != null ? exact : rows[0];
  return String(pick?.id || '').trim();
}

const allFirmen = all(
  'SELECT id, name FROM firmen ORDER BY name COLLATE NOCASE ASC',
  [],
);
const firstFirmaId = firmaIdArg && firmaIdArg.length ? firmaIdArg : pickDefaultFirmaId(allFirmen.length ? allFirmen : firmen);
if (!firstFirmaId) {
  console.error('Ungültige Firmen-ID.');
  db.close();
  process.exit(1);
}
const firstFirmaName =
  (allFirmen.length ? allFirmen : firmen).find((f) => String(f.id) === String(firstFirmaId))?.name || '';

let usersSql =
  "SELECT id, email, name, global_role, company_id FROM users WHERE global_role = 'SUPER_ADMIN'";
const params = [];
if (emailFilter) {
  usersSql += ' AND LOWER(email) = ?';
  params.push(emailFilter);
} else {
  usersSql += " AND (company_id IS NULL OR TRIM(company_id) = '')";
}

const admins = all(usersSql, params);
console.log('\n--- Betroffene User ---');
if (!admins.length) {
  console.log(emailFilter ? 'Kein User für diese E-Mail / Rolle.' : 'Kein SUPER_ADMIN ohne company_id.');
} else {
  admins.forEach((u) =>
    console.log(u.email, '|', u.name || '(null)', '| company_id:', u.company_id || '(null)', '|', u.id),
  );
}

if (!process.argv.includes('--apply')) {
  console.log('\nHinweis: Mit --apply erste Firma zuweisen' + (emailFilter ? ' (nur gefilterte Zeilen).' : '.'));
  db.close();
  process.exit(0);
}

if (!admins.length) {
  db.close();
  process.exit(0);
}

for (const u of admins) {
  db.run('UPDATE users SET company_id = ? WHERE id = ?', [firstFirmaId, String(u.id)]);
}
fs.writeFileSync(dbPath, Buffer.from(db.export()));
console.log('\nOK: company_id =', firstFirmaId, '(' + firstFirmaName + ') für', admins.length, 'User(s).');

db.close();
