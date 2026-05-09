/**
 * Übernimmt users + mitarbeiter (+ optional ccintern_mitarbeiter_*) aus einer SQLite-Backup-Datei
 * in die aktuelle cc-cockpit.db — ohne andere Tabellen zu droppen oder die DB vollständig zu ersetzen.
 *
 * Voraussetzung: Backend gestoppt (sql.js / direkter Dateizugriff).
 *
 *   cd backend
 *   node scripts/import-mitarbeiter-from-backup.mjs           # nur Zähler + Plan
 *   node scripts/import-mitarbeiter-from-backup.mjs --apply   # schreibt Ziel-DB
 *
 * Optional:
 *   --backup=pfad/zur.db
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dstPath = path.join(dataDir, 'cc-cockpit.db');
const backupArg = process.argv.find((x) => x.startsWith('--backup='));
const srcPath = backupArg
  ? path.resolve(backupArg.slice('--backup='.length).trim())
  : path.join(dataDir, 'cc-cockpit.db.backup');
const APPLY = process.argv.includes('--apply');

const OPTIONAL_TABLES = [
  'ccintern_mitarbeiter_zeiten',
  'ccintern_mitarbeiter_status',
  'ccintern_mitarbeiter_anwesenheit',
];

const SQL = await initSqlJs();

function safeIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(name || ''))) {
    throw new Error(`Ungültiger Identifier: ${name}`);
  }
  return String(name);
}

function tableExists(db, name) {
  const t = safeIdent(name);
  const st = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
  );
  st.bind([t]);
  const ok = st.step();
  st.free();
  return ok;
}

function pragmaColumns(db, table) {
  const t = safeIdent(table);
  const st = db.prepare(`PRAGMA table_info(${t})`);
  const cols = [];
  while (st.step()) {
    const o = st.getAsObject();
    if (o.name != null) cols.push(String(o.name));
  }
  st.free();
  return cols;
}

function all(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function getOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function columnIntersection(srcCols, dstCols) {
  const d = new Set(dstCols);
  return srcCols.filter((c) => d.has(c));
}

function insertRow(dst, table, colNames, values) {
  const t = safeIdent(table);
  const quoted = colNames.map((c) => `"${c.replace(/"/g, '""')}"`);
  const ph = colNames.map(() => '?').join(', ');
  dst.run(`INSERT INTO ${t} (${quoted.join(', ')}) VALUES (${ph})`, values);
}

if (!fs.existsSync(srcPath)) {
  console.error('Quelle fehlt:', srcPath);
  process.exit(1);
}
if (!fs.existsSync(dstPath)) {
  console.error('Ziel fehlt:', dstPath);
  process.exit(1);
}

const src = new SQL.Database(fs.readFileSync(srcPath), { readOnly: true });
const dst = new SQL.Database(fs.readFileSync(dstPath));

function count(db, table) {
  if (!tableExists(db, table)) return null;
  const row = getOne(db, `SELECT COUNT(*) AS c FROM ${safeIdent(table)}`, []);
  return row && row.c != null ? Number(row.c) : 0;
}

console.log('Quelle:', srcPath);
console.log('Ziel:  ', dstPath);
console.log('Modus: ', APPLY ? 'SCHREIBEN (--apply)' : 'NUR LESEN (ohne --apply)');

console.log('\n--- Zähler vorher ---');
console.log('users (Quelle):', count(src, 'users'));
console.log('users (Ziel):  ', count(dst, 'users'));
console.log('mitarbeiter (Quelle):', count(src, 'mitarbeiter'));
console.log('mitarbeiter (Ziel):  ', count(dst, 'mitarbeiter'));

if (!tableExists(dst, 'users') || !tableExists(dst, 'mitarbeiter')) {
  console.error('Ziel-DB: users oder mitarbeiter fehlt.');
  src.close();
  dst.close();
  process.exit(1);
}
if (!tableExists(src, 'users') || !tableExists(src, 'mitarbeiter')) {
  console.error('Backup: users oder mitarbeiter fehlt.');
  src.close();
  dst.close();
  process.exit(1);
}

const dstUserCols = pragmaColumns(dst, 'users');
const dstMaCols = pragmaColumns(dst, 'mitarbeiter');
const srcUserCols = pragmaColumns(src, 'users');
const srcMaCols = pragmaColumns(src, 'mitarbeiter');
const userInsertCols = columnIntersection(srcUserCols, dstUserCols);
const maInsertCols = columnIntersection(srcMaCols, dstMaCols);

function targetUserIdExists(id) {
  const r = getOne(dst, 'SELECT 1 AS x FROM users WHERE id = ? LIMIT 1', [String(id)]);
  return Boolean(r);
}

function targetUserEmailTaken(email) {
  const r = getOne(dst, 'SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1', [
    String(email || '').trim(),
  ]);
  return r && r.id != null ? String(r.id) : null;
}

function targetFirmaExists(id) {
  if (!tableExists(dst, 'firmen')) return false;
  const r = getOne(dst, 'SELECT 1 AS x FROM firmen WHERE id = ? LIMIT 1', [String(id)]);
  return Boolean(r);
}

function targetMitarbeiterIdExists(id) {
  const r = getOne(dst, 'SELECT 1 AS x FROM mitarbeiter WHERE id = ? LIMIT 1', [String(id)]);
  return Boolean(r);
}

function targetMitarbeiterUserFirma(userId, firmaId) {
  const r = getOne(dst, 'SELECT 1 AS x FROM mitarbeiter WHERE user_id = ? AND firma_id = ? LIMIT 1', [
    String(userId),
    String(firmaId),
  ]);
  return Boolean(r);
}

let stats = {
  usersInserted: 0,
  usersSkippedId: 0,
  usersSkippedEmail: 0,
  mitarbeiterInserted: 0,
  mitarbeiterSkipped: 0,
  optional: {},
};

function importUsers() {
  const rows = all(src, 'SELECT * FROM users', []);
  for (const raw of rows) {
    const id = raw.id != null ? String(raw.id).trim() : '';
    if (!id) continue;
    if (targetUserIdExists(id)) {
      stats.usersSkippedId += 1;
      continue;
    }
    const em = raw.email != null ? String(raw.email).trim() : '';
    const otherId = em ? targetUserEmailTaken(em) : null;
    if (otherId && otherId !== id) {
      stats.usersSkippedEmail += 1;
      continue;
    }
    const vals = userInsertCols.map((c) => (raw[c] !== undefined ? raw[c] : null));
    insertRow(dst, 'users', userInsertCols, vals);
    stats.usersInserted += 1;
  }
}

function importMitarbeiter() {
  const rows = all(src, 'SELECT * FROM mitarbeiter', []);
  for (const raw of rows) {
    const id = raw.id != null ? String(raw.id).trim() : '';
    const uid = raw.user_id != null ? String(raw.user_id).trim() : '';
    const fid = raw.firma_id != null ? String(raw.firma_id).trim() : '';
    if (!id || !uid || !fid) {
      stats.mitarbeiterSkipped += 1;
      continue;
    }
    if (!targetUserIdExists(uid)) {
      stats.mitarbeiterSkipped += 1;
      continue;
    }
    if (!targetFirmaExists(fid)) {
      stats.mitarbeiterSkipped += 1;
      continue;
    }
    if (targetMitarbeiterIdExists(id)) {
      stats.mitarbeiterSkipped += 1;
      continue;
    }
    if (targetMitarbeiterUserFirma(uid, fid)) {
      stats.mitarbeiterSkipped += 1;
      continue;
    }
    const vals = maInsertCols.map((c) => (raw[c] !== undefined ? raw[c] : null));
    try {
      insertRow(dst, 'mitarbeiter', maInsertCols, vals);
      stats.mitarbeiterInserted += 1;
    } catch (e) {
      stats.mitarbeiterSkipped += 1;
      console.warn('[mitarbeiter] übersprungen (Fehler):', id, e instanceof Error ? e.message : e);
    }
  }
}

function targetAuftragExists(id) {
  if (!tableExists(dst, 'ccintern_auftraege')) return false;
  const r = getOne(dst, 'SELECT 1 AS x FROM ccintern_auftraege WHERE id = ? LIMIT 1', [String(id)]);
  return Boolean(r);
}

function importOptionalTable(table) {
  if (!OPTIONAL_TABLES.includes(table)) return;
  if (!tableExists(src, table) || !tableExists(dst, table)) {
    stats.optional[table] = { skipped: 'Tabelle fehlt in Quelle oder Ziel' };
    return;
  }
  const sCols = pragmaColumns(src, table);
  const dCols = pragmaColumns(dst, table);
  const cols = columnIntersection(sCols, dCols);
  let ins = 0;
  let sk = 0;
  const rows = all(src, `SELECT * FROM ${safeIdent(table)}`, []);
  for (const raw of rows) {
    const id = raw.id != null ? String(raw.id).trim() : '';
    if (!id) {
      sk += 1;
      continue;
    }
    if (getOne(dst, `SELECT 1 AS x FROM ${safeIdent(table)} WHERE id = ? LIMIT 1`, [id])) {
      sk += 1;
      continue;
    }
    const uid = raw.user_id != null ? String(raw.user_id).trim() : '';
    const fid = raw.firma_id != null ? String(raw.firma_id).trim() : '';
    if (!uid || !fid || !targetUserIdExists(uid) || !targetFirmaExists(fid)) {
      sk += 1;
      continue;
    }
    if (table === 'ccintern_mitarbeiter_zeiten') {
      const aid = raw.ccintern_auftrag_id != null ? String(raw.ccintern_auftrag_id).trim() : '';
      if (!aid || !targetAuftragExists(aid)) {
        sk += 1;
        continue;
      }
    }
    const vals = cols.map((c) => (raw[c] !== undefined ? raw[c] : null));
    try {
      insertRow(dst, table, cols, vals);
      ins += 1;
    } catch (e) {
      sk += 1;
      console.warn(`[${table}] übersprungen:`, id, e instanceof Error ? e.message : e);
    }
  }
  stats.optional[table] = { inserted: ins, skipped: sk };
}

if (APPLY) {
  importUsers();
  importMitarbeiter();
  for (const t of OPTIONAL_TABLES) {
    importOptionalTable(t);
  }
  fs.writeFileSync(dstPath, Buffer.from(dst.export()));
  console.log('\n--- Zähler nachher (Ziel) ---');
  console.log('users:', count(dst, 'users'));
  console.log('mitarbeiter:', count(dst, 'mitarbeiter'));
  const sample = all(dst, 'SELECT id, user_id, firma_id, position FROM mitarbeiter LIMIT 5', []);
  console.log('\nmitarbeiter LIMIT 5:', JSON.stringify(sample, null, 2));
} else {
  const toInsertUserIds = new Set(
    all(src, 'SELECT id, email FROM users', [])
      .filter((r) => {
        const id = r.id != null ? String(r.id).trim() : '';
        if (!id || targetUserIdExists(id)) return false;
        const em = r.email != null ? String(r.email).trim() : '';
        const other = em ? targetUserEmailTaken(em) : null;
        if (other && other !== id) return false;
        return true;
      })
      .map((r) => String(r.id).trim()),
  );
  const wouldUsers = toInsertUserIds.size;
  const wouldMa = all(src, 'SELECT * FROM mitarbeiter', []).filter((raw) => {
    const id = raw.id != null ? String(raw.id).trim() : '';
    const uid = raw.user_id != null ? String(raw.user_id).trim() : '';
    const fid = raw.firma_id != null ? String(raw.firma_id).trim() : '';
    if (!id || !uid || !fid) return false;
    if (targetMitarbeiterIdExists(id)) return false;
    if (targetMitarbeiterUserFirma(uid, fid)) return false;
    if (!targetFirmaExists(fid)) return false;
    if (targetUserIdExists(uid)) return true;
    return toInsertUserIds.has(uid);
  }).length;
  console.log('\n(Dry-run) Mit --apply: zuerst users, dann mitarbeiter (+ optional ccintern_mitarbeiter_*).');
  console.log('Geschätzt importierbare users:', wouldUsers);
  console.log('Geschätzt importierbare mitarbeiter-Zeilen (User im Ziel oder in obiger User-Importmenge, Firma im Ziel):', wouldMa);
}

console.log('\n--- Statistik ---');
if (APPLY) console.log(JSON.stringify(stats, null, 2));

if (!APPLY) {
  console.log('\nZum Schreiben: node scripts/import-mitarbeiter-from-backup.mjs --apply');
}

src.close();
dst.close();
