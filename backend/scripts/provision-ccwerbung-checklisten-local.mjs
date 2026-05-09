/**
 * Lokale CC-Werbung-Standard-Checklisten direkt in SQLite (ohne API/Login).
 * Nur Tabellen: checklisten, checklisten_eintraege.
 *
 * Backend vorher stoppen (Dateisperre auf cc-cockpit.db vermeiden).
 *
 *   cd backend
 *   node scripts/provision-ccwerbung-checklisten-local.mjs
 *
 * Optional: SQLITE_DB_PATH (wie Server).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const defaultDbPath = path.join(backendRoot, 'data', 'cc-cockpit.db');
const dbPath = String(process.env.SQLITE_DB_PATH || '').trim() || defaultDbPath;

/** Gleiche Vorlagen wie `provision-ccwerbung-checklisten-api.mjs` */
const VORLAGEN = [
  {
    titel: 'Druckdatenprüfung',
    punkte: [
      'Datei vorhanden und lesbar',
      'Endformat geprüft',
      'Beschnitt / Überfüllung geprüft',
      'Auflösung ausreichend',
      'Schriften geprüft / eingebettet',
      'Farbmodus geprüft',
      'Kunde / Auftrag / Motiv korrekt',
      'Freigabe vorhanden',
    ],
  },
  {
    titel: 'Fahrzeugbeklebung',
    punkte: [
      'Fahrzeugdaten geprüft',
      'Maße / Modell geprüft',
      'Druckdaten freigegeben',
      'Folie / Laminat passend gewählt',
      'Oberfläche / Reinigung eingeplant',
      'Montage-Termin abgestimmt',
      'Vorher-Fotos erforderlich',
      'Nachher-Fotos erforderlich',
      'Endkontrolle durchgeführt',
    ],
  },
  {
    titel: 'Montage allgemein',
    punkte: [
      'Auftrag vollständig',
      'Material vorbereitet',
      'Werkzeug vorbereitet',
      'Adresse / Einsatzort geprüft',
      'Ansprechpartner bekannt',
      'Montagezeit bestätigt',
      'Fotos vor Ort machen',
      'Abschluss dokumentieren',
    ],
  },
  {
    titel: 'Schilder / Dibond',
    punkte: [
      'Materialstärke geprüft',
      'Format geprüft',
      'Druckdatei freigegeben',
      'Bohrungen / Befestigung geklärt',
      'Kanten / Zuschnitt geprüft',
      'Montageart geklärt',
      'Endkontrolle durchgeführt',
    ],
  },
  {
    titel: 'Fensterfolie / Glasdekor',
    punkte: [
      'Glasfläche gemessen',
      'Folientyp geprüft',
      'Motiv / Schnittdatei freigegeben',
      'Reinigung vorbereitet',
      'Montage-Termin abgestimmt',
      'Blasen / Kanten geprüft',
      'Fotos nach Montage',
    ],
  },
  {
    titel: 'Messewand / MesseFlow',
    punkte: [
      'Wand / Standfläche geprüft',
      'Druckmaß geprüft',
      'Datei geprüft und freigegeben',
      'Kachelung geprüft',
      'Material / Folienbreite geprüft',
      'Produktionsübergabe an Druck geprüft',
      'Montagehilfe / PDF vorhanden',
      'Abschluss dokumentiert',
    ],
  },
];

/** @param {import('sql.js').Database} db */
function sqliteAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const out = [];
  while (stmt.step()) {
    out.push(stmt.getAsObject());
  }
  stmt.free();
  return out;
}

/** @param {import('sql.js').Database} db */
function sqliteOne(db, sql, params = []) {
  const rows = sqliteAll(db, sql, params);
  return rows[0] ?? null;
}

/** @param {import('sql.js').Database} db */
function pragmaColumns(db, table) {
  const rows = sqliteAll(db, `PRAGMA table_info("${table.replace(/"/g, '""')}")`);
  /** @type {Set<string>} */
  const names = new Set();
  for (const r of rows) {
    if (r && r.name != null) names.add(String(r.name));
  }
  return names;
}

/** @param {import('sql.js').Database} db */
function resolveFirmaId(db) {
  const preferName = 'CC Werbung Test';
  let row = sqliteOne(db, `SELECT id, name FROM firmen WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1`, [
    preferName,
  ]);
  if (row?.id) {
    console.log(`Firma (exakt): "${row.name}" → ${row.id}`);
    return String(row.id).trim();
  }
  row = sqliteOne(db, `SELECT id, name FROM firmen WHERE trim(name) LIKE ? LIMIT 1`, [`%${preferName}%`]);
  if (row?.id) {
    console.log(`Firma (LIKE „${preferName}“): "${row.name}" → ${row.id}`);
    return String(row.id).trim();
  }
  const u = sqliteOne(db, `SELECT company_id FROM users WHERE lower(trim(email)) = lower(trim(?)) LIMIT 1`, [
    'info@cc-werbung.de',
  ]);
  const cid = u?.company_id != null ? String(u.company_id).trim() : '';
  if (cid) {
    const f = sqliteOne(db, `SELECT id, name FROM firmen WHERE id = ? LIMIT 1`, [cid]);
    if (f?.id) {
      console.log(`Firma über users.company_id (info@cc-werbung.de): "${f.name}" → ${f.id}`);
      return String(f.id).trim();
    }
    console.error(
      `STOP: users.company_id für info@cc-werbung.de ist "${cid}", aber keine Zeile in firmen mit dieser id.`,
    );
    process.exit(1);
  }
  console.error(
    'STOP: Keine firma_id ermittelbar (weder Firma „CC Werbung Test“ noch users.company_id für info@cc-werbung.de).',
  );
  process.exit(1);
}

/**
 * @param {import('sql.js').Database} db
 * @param {Set<string>} colCl
 * @param {string} firmaId
 * @param {string} titel
 */
function insertChecklisteRow(db, colCl, firmaId, titel) {
  const id = randomUUID();
  /** @type {Record<string, unknown>} */
  const row = { id, titel, firma_id: firmaId };
  if (colCl.has('auftrag_id')) row.auftrag_id = null;
  if (colCl.has('erstellt_von')) row.erstellt_von = null;
  if (colCl.has('created_at')) {
    const ts = sqliteOne(db, `SELECT datetime('now') AS ts`);
    row.created_at = ts?.ts != null ? String(ts.ts) : new Date().toISOString();
  }
  if (colCl.has('aktiv')) row.aktiv = 1;
  if (colCl.has('status')) row.status = 'aktiv';

  const keys = Object.keys(row).filter((k) => colCl.has(k));
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO checklisten (${keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(', ')}) VALUES (${placeholders})`;
  db.run(
    sql,
    keys.map((k) => /** @type {unknown} */ (row[k])),
  );
  return id;
}

/**
 * @param {import('sql.js').Database} db
 * @param {Set<string>} colE
 * @param {string} checklisteId
 * @param {string} text
 * @param {number} reihenfolge
 */
function insertEintragRow(db, colE, checklisteId, text, reihenfolge) {
  const id = randomUUID();
  /** @type {Record<string, unknown>} */
  const row = {
    id,
    checkliste_id: checklisteId,
    text,
    erledigt: 0,
    reihenfolge,
  };
  if (colE.has('created_at')) {
    const ts = sqliteOne(db, `SELECT datetime('now') AS ts`);
    row.created_at = ts?.ts != null ? String(ts.ts) : new Date().toISOString();
  }
  if (colE.has('updated_at')) {
    const ts = sqliteOne(db, `SELECT datetime('now') AS ts`);
    row.updated_at = ts?.ts != null ? String(ts.ts) : new Date().toISOString();
  }

  const keys = Object.keys(row).filter((k) => colE.has(k));
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO checklisten_eintraege (${keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(', ')}) VALUES (${placeholders})`;
  db.run(
    sql,
    keys.map((k) => /** @type {unknown} */ (row[k])),
  );
}

async function main() {
  console.log('Verwendete DB-Datei:', path.resolve(dbPath));
  if (!fs.existsSync(dbPath)) {
    console.error('STOP: Datenbankdatei fehlt.');
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  db.run('PRAGMA foreign_keys = ON');

  const colCl = pragmaColumns(db, 'checklisten');
  const colE = pragmaColumns(db, 'checklisten_eintraege');
  if (!colCl.size || !colE.size) {
    console.error('STOP: Tabellen checklisten / checklisten_eintraege fehlen oder PRAGMA leer.');
    process.exit(1);
  }

  console.log('Spalten checklisten:', [...colCl].join(', '));
  console.log('Spalten checklisten_eintraege:', [...colE].join(', '));

  const firmaId = resolveFirmaId(db);
  console.log('Verwendete firma_id:', firmaId);

  /** @type {string[]} */
  const angelegte = [];
  /** @type {string[]} */
  const uebersprungen = [];
  /** @type {{ titel: string; ergaenzt: number }[]} */
  const ergaenztPro = [];

  db.run('BEGIN IMMEDIATE');

  try {
    for (const v of VORLAGEN) {
      const titel = String(v.titel).trim();
      const existing = sqliteOne(
        db,
        `SELECT id FROM checklisten WHERE firma_id = ? AND titel = ? AND (auftrag_id IS NULL OR trim(COALESCE(auftrag_id,'')) = '') LIMIT 1`,
        [firmaId, titel],
      );

      let checklisteId = existing?.id != null ? String(existing.id) : '';

      if (!checklisteId) {
        checklisteId = insertChecklisteRow(db, colCl, firmaId, titel);
        angelegte.push(titel);
      } else {
        uebersprungen.push(titel);
      }

      const existingEin = sqliteAll(
        db,
        `SELECT trim(text) AS t FROM checklisten_eintraege WHERE checkliste_id = ?`,
        [checklisteId],
      );
      const have = new Set(
        existingEin.map((r) => (r?.t != null ? String(r.t) : '').trim()).filter(Boolean),
      );

      let maxRo = -1;
      const mx = sqliteOne(
        db,
        `SELECT COALESCE(MAX(reihenfolge), -1) AS m FROM checklisten_eintraege WHERE checkliste_id = ?`,
        [checklisteId],
      );
      if (mx && mx.m != null && Number.isFinite(Number(mx.m))) maxRo = Number(mx.m);

      let erg = 0;
      for (const p of v.punkte) {
        const pt = String(p).trim();
        if (!pt) continue;
        if (have.has(pt)) continue;
        maxRo += 1;
        insertEintragRow(db, colE, checklisteId, pt, maxRo);
        have.add(pt);
        erg++;
      }
      ergaenztPro.push({ titel, ergaenzt: erg });
    }

    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }

  const data = db.export();
  db.close();
  fs.writeFileSync(dbPath, Buffer.from(data));

  console.log('\n--- Ergebnis ---');
  console.log('Angelegte Vorlagen (neu):', angelegte.length ? angelegte.join('; ') : '(keine)');
  console.log('Übersprungene vorhandene Vorlagen:', uebersprungen.length ? uebersprungen.join('; ') : '(keine)');
  for (const x of ergaenztPro) {
    console.log(`  Ergänzte Prüfpunkte „${x.titel}“: ${x.ergaenzt}`);
  }

  const SQL2 = await initSqlJs();
  const db2 = new SQL.Database(fs.readFileSync(dbPath));
  const totalCl = sqliteOne(
    db2,
    `SELECT COUNT(*) AS c FROM checklisten WHERE firma_id = ?`,
    [firmaId],
  );
  const templateIds = sqliteAll(
    db2,
    `SELECT id FROM checklisten WHERE firma_id = ? AND titel IN (${VORLAGEN.map(() => '?').join(',')}) AND (auftrag_id IS NULL OR trim(COALESCE(auftrag_id,'')) = '')`,
    [firmaId, ...VORLAGEN.map((x) => x.titel)],
  );
  const ids = templateIds.map((r) => String(r.id));
  let totalE = 0;
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const te = sqliteOne(
      db2,
      `SELECT COUNT(*) AS c FROM checklisten_eintraege WHERE checkliste_id IN (${ph})`,
      ids,
    );
    totalE = te?.c != null ? Number(te.c) : 0;
  }
  db2.close();

  console.log('\nGesamtzahl Checklisten (Firma):', totalCl?.c ?? '?');
  console.log('Gesamtzahl Prüfpunkte (die 6 Standardvorlagen):', totalE);
}

await main();
