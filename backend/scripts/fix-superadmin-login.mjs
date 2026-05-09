/**
 * Einmalig: Superadmin info@cc-werbung.de in SQLite wiederherstellen (Passwort, Rolle, Status).
 * Hashing wie Login: bcryptjs, 12 Runden — siehe `src/auth/password.js`.
 *
 * Server stoppen, bevor die DB-Datei geschrieben wird (sql.js im laufenden Server hält sonst RAM-Stand).
 *
 *   cd backend
 *   node scripts/fix-superadmin-login.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import { hashPassword } from '../src/auth/password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'cc-cockpit.db');

/** Fachlich „Superadmin“; in der DB muss der Wert `SUPER_ADMIN` sein (`rights-spec.js`). */
const GLOBAL_ROLE_DB = 'SUPER_ADMIN';
const STATUS = 'aktiv';
const TARGET_EMAIL = 'info@cc-werbung.de';
const PLAIN_PASSWORD = 'demo2026!';

const SQL = await initSqlJs();
if (!fs.existsSync(dbPath)) {
  console.error('DB fehlt:', dbPath);
  process.exit(1);
}

const db = new SQL.Database(fs.readFileSync(dbPath));

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

const passwordHash = hashPassword(PLAIN_PASSWORD);

const existing = get('SELECT id, email, name FROM users WHERE email = ? COLLATE NOCASE LIMIT 1', [
  TARGET_EMAIL.toLowerCase(),
]);

if (existing && existing.id != null) {
  db.run(
    'UPDATE users SET password_hash = ?, global_role = ?, status = ? WHERE id = ?',
    [passwordHash, GLOBAL_ROLE_DB, STATUS, String(existing.id)],
  );
  console.log('Aktualisiert:', TARGET_EMAIL, '| id=', existing.id);
} else {
  const id = randomUUID();
  const name = 'CC Werbung';
  db.run(
    `INSERT INTO users (id, email, password_hash, name, global_role, company_id, status, soll, urlaub)
     VALUES (?, ?, ?, ?, ?, NULL, ?, 160, 28)`,
    [id, TARGET_EMAIL.toLowerCase(), passwordHash, name, GLOBAL_ROLE_DB, STATUS],
  );
  console.log('Angelegt:', TARGET_EMAIL, '| id=', id);
}

const check = get(
  'SELECT id, email, global_role, status, substr(password_hash,1,7) AS hash_prefix FROM users WHERE email = ? COLLATE NOCASE LIMIT 1',
  [TARGET_EMAIL.toLowerCase()],
);
if (!check || String(check.global_role) !== GLOBAL_ROLE_DB || String(check.status) !== STATUS) {
  console.error('Konsistenzprüfung fehlgeschlagen:', check);
  db.close();
  process.exit(1);
}

const rowVerify = get('SELECT password_hash FROM users WHERE email = ? COLLATE NOCASE LIMIT 1', [
  TARGET_EMAIL.toLowerCase(),
]);
if (!rowVerify || !bcrypt.compareSync(PLAIN_PASSWORD, String(rowVerify.password_hash))) {
  console.error('bcrypt.compareSync gegen gespeicherten Hash fehlgeschlagen.');
  db.close();
  process.exit(1);
}

fs.writeFileSync(dbPath, Buffer.from(db.export()));
console.log('OK: DB geschrieben.', dbPath);
console.log('Rolle:', check.global_role, '| Status:', check.status, '| bcryptjs wie `src/auth/password.js`');

db.close();
