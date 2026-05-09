/**
 * Einmalige Migration: fehlende `produktion_auftraege` für CC-Intern-Aufträge mit
 * `bemerkung` im Format __ccintern_v1 und `payload.schritte`.
 *
 * WICHTIG: Backend stoppen, bevor dieses Skript die SQLite-Datei schreibt.
 *
 * Ausführung (von `backend/`):
 *   node scripts/migrate-produktion-rows.mjs
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import {
  findSchrittObjektFuerSchritt,
  parseCcinternBemerkungPayload,
  workflowCurrentStepFromAuftragRow,
} from '../src/lib/ccintern-workflow-bemerkung.js';

const BEM_PREFIX = '{"__ccintern_v1"';

/**
 * @param {Record<string, unknown>|null|undefined} sch
 * @returns {string}
 */
function verantwortlichUuidFromCcinternSchrittObjekt(sch) {
  if (!sch || typeof sch !== 'object') return '';
  const pick = (v) => (v != null && String(v).trim() ? String(v).trim() : '');
  let u = pick(sch.verantwortlicher);
  if (u) return u;
  u = pick(sch.werId);
  if (u) return u;
  u = pick(sch.maId);
  if (u) return u;
  if (Array.isArray(sch.maIds)) {
    for (let i = 0; i < sch.maIds.length; i++) {
      u = pick(sch.maIds[i]);
      if (u) return u;
    }
  }
  if (Array.isArray(sch.teamMaIds)) {
    for (let j = 0; j < sch.teamMaIds.length; j++) {
      u = pick(sch.teamMaIds[j]);
      if (u) return u;
    }
  }
  return '';
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'cc-cockpit.db');

/** @param {import('sql.js').Database} db */
function stmtGet(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

/** @param {import('sql.js').Database} db */
function all(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

const SQL = await initSqlJs();
if (!fs.existsSync(dbPath)) {
  console.error('DB fehlt:', dbPath);
  process.exit(1);
}

const db = new SQL.Database(fs.readFileSync(dbPath));

const allRows = all(
  db,
  `SELECT id, firma_id, schritt, bemerkung, auftragsnummer FROM ccintern_auftraege
   WHERE bemerkung IS NOT NULL AND TRIM(bemerkung) != ''`,
  [],
);
const rows = allRows.filter((r) => {
  const b = r.bemerkung != null ? String(r.bemerkung).trim() : '';
  return b.startsWith(BEM_PREFIX);
});

let inserted = 0;
let skippedHasRow = 0;
let skippedNoPayload = 0;
let skippedNoStep = 0;
let skippedNoVerantwortlich = 0;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const aid = row.id != null ? String(row.id).trim() : '';
  const fid = row.firma_id != null ? String(row.firma_id).trim() : '';
  if (!aid || !fid) continue;

  const cntRow = stmtGet(
    db,
    `SELECT COUNT(*) AS c FROM produktion_auftraege WHERE auftrag_id = ? AND firma_id = ?`,
    [aid, fid],
  );
  if (Number(cntRow?.c || 0) > 0) {
    skippedHasRow += 1;
    continue;
  }

  const bem = row.bemerkung != null ? String(row.bemerkung) : '';
  const payload = parseCcinternBemerkungPayload(bem);
  if (!payload || !payload.schritte || typeof payload.schritte !== 'object') {
    skippedNoPayload += 1;
    continue;
  }
  const schritte = /** @type {Record<string, unknown>} */ (payload.schritte);
  if (!Object.keys(schritte).length) {
    skippedNoPayload += 1;
    continue;
  }

  const dbSchritt = row.schritt != null ? String(row.schritt) : '';
  const stepRaw = workflowCurrentStepFromAuftragRow(bem, dbSchritt);
  if (!stepRaw || String(stepRaw).trim() === '') {
    skippedNoStep += 1;
    continue;
  }

  const sch = findSchrittObjektFuerSchritt(schritte, stepRaw);
  const vid = verantwortlichUuidFromCcinternSchrittObjekt(sch);
  if (!vid) {
    skippedNoVerantwortlich += 1;
    continue;
  }

  const newId = randomUUID();
  const schritt = String(stepRaw).trim();
  db.run(
    `INSERT INTO produktion_auftraege (id, auftrag_id, schritt, fortschritt, verantwortlich, notiz, gestartet_am, abgeschlossen_am, firma_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId, aid, schritt, 0, vid, null, null, null, fid],
  );
  inserted += 1;
  const auNr = row.auftragsnummer != null ? String(row.auftragsnummer) : '';
  console.log('INSERT produktion_auftraege', { auftrag_id: aid, auftragsnummer: auNr, schritt, produktion_id: newId });
}

if (inserted > 0) {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

const totalRow = stmtGet(db, `SELECT COUNT(*) AS c FROM produktion_auftraege`, []);

console.log('');
console.log('SQLite:', dbPath);
console.log('CC-Intern-Kandidaten (__ccintern_v1 Präfix):', rows.length);
console.log('Neu eingefügte produktion_auftraege:', inserted);
console.log('Übersprungen (Zeile existierte):', skippedHasRow);
console.log('Übersprungen (kein payload.schritte):', skippedNoPayload);
console.log('Übersprungen (kein Schritt):', skippedNoStep);
console.log('Übersprungen (kein verantwortlich):', skippedNoVerantwortlich);
console.log('SELECT COUNT(*) FROM produktion_auftraege →', Number(totalRow?.c || 0));

db.close();
