import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
const db = new Database('./data/cc-cockpit.db');
const row = db.prepare("SELECT email, password_hash FROM users WHERE email = ?").get('info@cc-werbung.de');
if (!row) { console.log('NOT FOUND'); process.exit(1); }
console.log('Hash:', row.password_hash);
const candidates = ['Admin2026!', 'admin2026!', 'cc-werbung', 'admin', 'Admin1234!', 'password', 'CC2026!', 'cocokit', 'cccc1234', 'Test1234!', 'Werbung2026!', 'CCwerbung2026', 'CCWerbung2026!', 'celal', 'Celal2026!', 'admin123'];
for (const c of candidates) {
  if (bcrypt.compareSync(c, row.password_hash)) {
    console.log('MATCH:', c);
    process.exit(0);
  }
}
console.log('No match');
