/**
 * Einmalige Migration: CC-Intern Aufträge (`ccintern_auftraege.bemerkung` JSON-Payload).
 *
 * Ersetzt Mitarbeiter-Kürzel in verschachtelten Strukturen (Schritte, Zeiten, …):
 *   1. MU → MO (Mohammed) — zuerst, damit kein Konflikt mit neuem MU für Muhammet
 *   2. MH → MU (Muhammet)
 *
 * Nur explizite Kurz-Codes an den üblichen Feldern (maId, verantwortlicher, werId,
 * erledigtVonMaId, Arrays maIds / zusatzMa / teamMaIds); rekursiv in payload.schritte,
 * payload.zeiten, etc.
 *
 * Ausführung (von `backend/`):
 *   node scripts/migrate-ccintern-auftraege-ma-codes.mjs           # Dry-Run: zählen
 *   node scripts/migrate-ccintern-auftraege-ma-codes.mjs --apply  # Backup + Migration
 *
 * Nach erfolgreichem --apply wird `data/.ccintern-ma-code-migration-v1.done` angelegt.
 * Erneutes Anstoßen ohne `--force` bricht ab. Bei Bedarf: `--force`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'cc-cockpit.db');
const backupsDir = path.join(dataDir, 'backups');
const markerPath = path.join(dataDir, '.ccintern-ma-code-migration-v1.done');

const BEM_PREFIX = '{"__ccintern_v1"';

const STRING_KEYS = new Set(['maId', 'verantwortlicher', 'werId', 'erledigtVonMaId']);
const ARRAY_KEYS = new Set(['maIds', 'zusatzMa', 'teamMaIds']);

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');

/** @param {string} s */
function muToMo(s) {
  if (typeof s !== 'string') return s;
  const t = s.trim();
  return t.toUpperCase() === 'MU' ? 'MO' : s;
}

/** @param {string} s */
function mhToMu(s) {
  if (typeof s !== 'string') return s;
  const t = s.trim();
  return t.toUpperCase() === 'MH' ? 'MU' : s;
}

/**
 * @param {unknown} obj
 * @param {(s: string) => string} mapper
 */
function transformEmployeeCodesDeep(obj, mapper) {
  if (obj == null) return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const el = obj[i];
      if (el != null && typeof el === 'object') transformEmployeeCodesDeep(el, mapper);
    }
    return;
  }
  if (typeof obj !== 'object') return;
  const o = /** @type {Record<string, unknown>} */ (obj);
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (STRING_KEYS.has(k) && typeof v === 'string') {
      o[k] = mapper(v);
    } else if (ARRAY_KEYS.has(k) && Array.isArray(v)) {
      o[k] = v.map((x) => (typeof x === 'string' ? mapper(x) : x));
    } else if (v != null && typeof v === 'object') {
      transformEmployeeCodesDeep(v, mapper);
    }
  }
}

/**
 * @param {Record<string, unknown>} payload
 */
function migratePayloadClone(payload) {
  const clone = /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(payload)));
  transformEmployeeCodesDeep(clone, muToMo);
  transformEmployeeCodesDeep(clone, mhToMu);
  return clone;
}

/**
 * @param {string | null | undefined} bemerkung
 */
function migrateBemerkungRow(bemerkung) {
  const bemerkungTrim = bemerkung != null ? String(bemerkung).trim() : '';
  if (!bemerkungTrim || !bemerkungTrim.startsWith(BEM_PREFIX)) {
    return { changed: false, next: bemerkung, skipReason: 'no_ccintern_payload' };
  }
  /** @type {{ __ccintern_v1?: number; payload?: Record<string, unknown> }} */
  let parsed;
  try {
    parsed = JSON.parse(bemerkungTrim);
  } catch {
    return { changed: false, next: bemerkung, skipReason: 'json_parse_error' };
  }
  if (parsed.__ccintern_v1 !== 1 || !parsed.payload || typeof parsed.payload !== 'object') {
    return { changed: false, next: bemerkung, skipReason: 'not_v1_payload' };
  }
  const nextPayload = migratePayloadClone(/** @type {Record<string, unknown>} */ (parsed.payload));
  const before = JSON.stringify(parsed.payload);
  const after = JSON.stringify(nextPayload);
  if (before === after) {
    return { changed: false, next: bemerkung, skipReason: 'no_code_hits' };
  }
  const nextObj = { ...parsed, payload: nextPayload };
  return { changed: true, next: JSON.stringify(nextObj), skipReason: null };
}

const SQL = await initSqlJs();
if (!fs.existsSync(dbPath)) {
  console.error('DB fehlt:', dbPath);
  process.exit(1);
}

if (!force && fs.existsSync(markerPath) && apply) {
  console.error(
    'Migration wurde bereits ausgeführt (Marker vorhanden):',
    markerPath,
    '\nErneuter Schreib-Lauf nur mit --force (Backup!). Dry-Run ohne --apply bleibt möglich.',
  );
  process.exit(1);
}

if (!apply && fs.existsSync(markerPath) && !force) {
  console.warn('Hinweis: Marker existiert bereits — Migration war schon erfolgreich. (Dry-Run zur Kontrolle.)\n');
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

const rows = all(
  `SELECT id, auftragsnummer, bemerkung FROM ccintern_auftraege
   WHERE bemerkung IS NOT NULL AND TRIM(bemerkung) != ''`,
  [],
);

let wouldChange = 0;
let skippedNoPayload = 0;
let skippedParse = 0;
let skippedNotV1 = 0;
let skippedNoCodeHits = 0;

/** @type {{ id: string; auftragsnummer?: string }[]} */
const touchedIds = [];

for (const row of rows) {
  const id = row.id != null ? String(row.id) : '';
  const auNr = row.auftragsnummer != null ? String(row.auftragsnummer) : '';
  const r = migrateBemerkungRow(row.bemerkung != null ? String(row.bemerkung) : '');
  if (r.changed) {
    wouldChange += 1;
    touchedIds.push({ id, auftragsnummer: auNr });
  } else if (r.skipReason === 'no_ccintern_payload') skippedNoPayload += 1;
  else if (r.skipReason === 'json_parse_error') skippedParse += 1;
  else if (r.skipReason === 'not_v1_payload') skippedNotV1 += 1;
  else if (r.skipReason === 'no_code_hits') skippedNoCodeHits += 1;
}

console.log('SQLite:', dbPath);
console.log('Zeilen mit nicht-leerer bemerkung:', rows.length);
console.log('[Dry-Run / Vorläufig] Aufträge mit Kürzel-Änderung (MU→MO, dann MH→MU):', wouldChange);
console.log('  übersprungen (kein __ccintern_v1 JSON-Präfix):', skippedNoPayload);
console.log('  übersprungen (JSON-Parse-Fehler):', skippedParse);
console.log('  übersprungen (nicht __ccintern_v1 oder kein payload):', skippedNotV1);
console.log('  ohne Kurz-Codes MU/MH an relevanten Feldern:', skippedNoCodeHits);

if (wouldChange > 0 && wouldChange <= 30) {
  console.log('Betroffene ids:', touchedIds.map((t) => `${t.id} (${t.auftragsnummer || '—'})`).join('\n'));
} else if (wouldChange > 30) {
  console.log('Erste 15 betroffene ids:', touchedIds.slice(0, 15).map((t) => `${t.id} (${t.auftragsnummer || '—'})`).join('\n'));
  console.log('… und', wouldChange - 15, 'weitere.');
}

if (!apply) {
  console.log('\nKein --apply: keine Änderung, kein Backup. Zum Schreiben: node scripts/migrate-ccintern-auftraege-ma-codes.mjs --apply');
  db.close();
  process.exit(0);
}

if (wouldChange === 0) {
  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        updatedRows: 0,
        backupPath: null,
        note: 'no rows needed migration',
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log('\nOK: Nichts zu migrieren. Marker gesetzt:', markerPath);
  db.close();
  process.exit(0);
}

fs.mkdirSync(backupsDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupsDir, `cc-cockpit-pre-ccintern-ma-codes-${ts}.db`);
fs.copyFileSync(dbPath, backupPath);
console.log('\nBackup:', backupPath);

let updated = 0;
for (const row of rows) {
  const id = row.id != null ? String(row.id) : '';
  const r = migrateBemerkungRow(row.bemerkung != null ? String(row.bemerkung) : '');
  if (!r.changed || !r.next) continue;
  db.run('UPDATE ccintern_auftraege SET bemerkung = ?, aktualisiert_am = datetime(\'now\') WHERE id = ?', [
    r.next,
    id,
  ]);
  updated += 1;
}

fs.writeFileSync(dbPath, Buffer.from(db.export()));

fs.writeFileSync(
  markerPath,
  JSON.stringify(
    {
      completedAt: new Date().toISOString(),
      updatedRows: updated,
      backupPath,
      migration: 'MU→MO (Mohammed), dann MH→Muhammet→MU',
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log('Aktualisierte Aufträge:', updated);
console.log('Marker:', markerPath);
console.log('Fertig.');

db.close();
