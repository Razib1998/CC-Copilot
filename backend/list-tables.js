/**
 * Tabellen in der lokalen SQLite-DB auflisten.
 * Ausführung (von backend/): node list-tables.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath =
  String(process.env.SQLITE_DB_PATH || '').trim() ||
  path.join(__dirname, 'data', 'cc-cockpit.db');

if (!fs.existsSync(dbPath)) {
  console.error('SQLite-Datei fehlt:', dbPath);
  process.exit(1);
}

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(dbPath));
const stmt = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
);
const rows = [];
while (stmt.step()) {
  rows.push(stmt.getAsObject());
}
stmt.free();
db.close();

console.log(rows);
