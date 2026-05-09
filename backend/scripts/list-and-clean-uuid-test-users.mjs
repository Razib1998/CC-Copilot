/**
 * 1) User auflisten.
 * 2) Löschen: (a) name wie UUID + Test-/Leer-Email, nicht geschützt
 *    (b) Auto-Invite-/Experiment-Emails @cc-cockpit.local (invite.auto.*, invite.exp.*, rest.exp.*)
 * Geschützt: Celal Cetinkaya, Testbenutzer, Viewer Demo, Invitee Demo (Name oder E-Mail).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'cc-cockpit.db');

const PROTECTED_EMAILS = new Set(
  ['info@cc-werbung.de', 'test@cc-cockpit.local', 'viewer@cc-cockpit.local', 'invitee@cc-cockpit.local'].map((e) =>
    e.toLowerCase(),
  ),
);

function looksLikeUuidName(name) {
  const s = name != null ? String(name).trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s);
}

function emailEmptyOrTest(email) {
  const e = email != null ? String(email).trim().toLowerCase() : '';
  if (!e) return true;
  if (e.includes('@example.')) return true;
  if (e.startsWith('test@')) return true;
  if (e.endsWith('@test.local')) return true;
  return false;
}

function isAutoInviteOrExpEmail(email) {
  const e = email != null ? String(email).trim().toLowerCase() : '';
  if (!e.endsWith('@cc-cockpit.local')) return false;
  if (e.startsWith('invite.auto.')) return true;
  if (e.startsWith('invite.exp.')) return true;
  if (e.startsWith('rest.exp.')) return true;
  return false;
}

function isProtected(row) {
  const name = String(row.name || '').trim();
  const email = String(row.email || '').trim().toLowerCase();
  if (PROTECTED_EMAILS.has(email)) return true;
  if (/celal/i.test(name) && /cetinkaya/i.test(name)) return true;
  if (name === 'Celal Cetinkaya') return true;
  if (name === 'Testbenutzer') return true;
  if (name === 'Viewer Demo' || name === 'Invitee Demo') return true;
  return false;
}

function shouldDelete(row) {
  if (isProtected(row)) return false;
  const email = String(row.email || '').trim().toLowerCase();
  if (isAutoInviteOrExpEmail(email)) return true;
  if (looksLikeUuidName(row.name) && emailEmptyOrTest(row.email)) return true;
  return false;
}

const SQL = await initSqlJs();
if (!fs.existsSync(dbPath)) {
  console.error('DB fehlt:', dbPath);
  process.exit(1);
}
const db = new SQL.Database(fs.readFileSync(dbPath));

const all = [];
{
  const stmt = db.prepare('SELECT id, email, name, global_role FROM users ORDER BY email');
  while (stmt.step()) all.push(stmt.getAsObject());
  stmt.free();
}

console.log('SQLite:', dbPath);
console.log('--- Alle User (' + all.length + ') ---');
for (const r of all) {
  console.log((r.email || '') + '\t' + (r.name == null ? '(null)' : r.name) + '\t' + r.id);
}

const toDelete = all.filter(shouldDelete);

console.log('\n--- Zu löschen: ' + toDelete.length + ' ---');
toDelete.forEach(function (r) {
  console.log(r.email, '|', r.name, '|', r.id);
});

if (process.argv.includes('--apply')) {
  for (const r of toDelete) {
    db.run('DELETE FROM users WHERE id = ?', [String(r.id)]);
  }
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log('\nGespeichert:', toDelete.length, 'Zeilen entfernt.');
} else {
  console.log('\nHinweis: Ausführung mit node scripts/list-and-clean-uuid-test-users.mjs --apply');
}

db.close();
