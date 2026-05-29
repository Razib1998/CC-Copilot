/**
 * Nur Lesen: CC-Intern-Aufträge (ccintern_auftraege) und abhängige Tabellen.
 * Kein INSERT / UPDATE / DELETE.
 *
 * Ausführung (von backend/):
 *   node scripts/analyse-ccintern-auftraege.mjs
 *
 * MySQL: .env wie Server (MYSQL_*). Sonst SQLite: data/cc-cockpit.db
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import mysql from 'mysql2/promise';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoBackendRoot = path.join(__dirname, '..');
const defaultDbPath = path.join(repoBackendRoot, 'data', 'cc-cockpit.db');
const dbPath = String(process.env.SQLITE_DB_PATH || '').trim() || defaultDbPath;

/** @type {Array<{ table: string, column: string, label?: string }>} */
const DEPENDENCIES = [
  { table: 'ccintern_auftrag_kommentare', column: 'auftrag_id', label: 'Kommentare' },
  { table: 'ccintern_auftrag_dateien', column: 'auftrag_id', label: 'Datei-Metadaten (DB)' },
  { table: 'produktion_auftraege', column: 'auftrag_id', label: 'Produktion' },
  { table: 'ccintern_mitarbeiter_zeiten', column: 'ccintern_auftrag_id', label: 'MA-Zeiten (App)' },
  { table: 'kalender_termine', column: 'auftrag_id', label: 'Kalender (CC-Intern-Link)' },
  { table: 'ccintern_rechnungen', column: 'auftrag_id', label: 'Rechnungen (RESTRICT!)' },
  { table: 'lager_buchungen', column: 'auftrag_id', label: 'Lager-Buchungen' },
  { table: 'aufgaben', column: 'auftrag_id', label: 'Aufgaben' },
  { table: 'checklisten', column: 'auftrag_id', label: 'Checklisten (optional am Auftrag)' },
];

function mysqlConfigured() {
  const host = String(process.env.MYSQL_HOST || '').trim();
  const user = String(process.env.MYSQL_USER || '').trim();
  const database = String(process.env.MYSQL_DATABASE || '').trim();
  return Boolean(host && user && database);
}

/** @param {import('sql.js').Database} db */
function sqliteAll(db, sql, params = []) {
  const out = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    out.push(stmt.getAsObject());
  }
  stmt.free();
  return out;
}

/** @param {import('mysql2/promise').Pool} pool */
async function mysqlAll(pool, sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return /** @type {Record<string, unknown>[]} */ (rows);
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]> }} ctx
 */
async function countForAuftrag(ctx, auftragId, dep) {
  const col = dep.column;
  const sql = `SELECT COUNT(*) AS c FROM ${dep.table} WHERE ${col} = ?`;
  const rows = await ctx.query(sql, [auftragId]);
  return rows[0] && rows[0].c != null ? Number(rows[0].c) : 0;
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]> }} ctx
 */
async function analyse(ctx, driverLabel) {
  const totalRow = await ctx.query(
    `SELECT COUNT(*) AS c FROM ccintern_auftraege`,
    [],
  );
  const total = totalRow[0] && totalRow[0].c != null ? Number(totalRow[0].c) : 0;

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`CC-Intern Aufträge — Analyse (${driverLabel})`);
  console.log('══════════════════════════════════════════════════════════');
  console.log(`Gesamt ccintern_auftraege: ${total}\n`);

  const auftraege = await ctx.query(
    `SELECT id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum,
            firma_id, fusa_auftrag_id, quelle, erstellt_am, aktualisiert_am
     FROM ccintern_auftraege
     ORDER BY auftragsnummer`,
    [],
  );

  for (let i = 0; i < auftraege.length; i++) {
    const a = auftraege[i];
    const id = String(a.id || '');
    console.log('──────────────────────────────────────────────────────────');
    console.log(`#${i + 1} ${a.auftragsnummer}`);
    console.log(`  id:              ${id}`);
    console.log(`  kunde:           ${a.kunde ?? '—'}`);
    console.log(`  firma_id:        ${a.firma_id ?? '—'}`);
    console.log(`  status:          ${a.status ?? '—'}`);
    console.log(`  schritt:         ${a.schritt ?? '—'}`);
    console.log(`  prioritaet:      ${a.prioritaet ?? '—'}`);
    console.log(`  lieferdatum:     ${a.lieferdatum ?? '—'}`);
    console.log(`  montage_datum:   ${a.montage_datum ?? '—'}`);
    console.log(`  quelle:          ${a.quelle ?? '—'}`);
    console.log(`  fusa_auftrag_id: ${a.fusa_auftrag_id ?? '—'}`);
    console.log(`  erstellt_am:     ${a.erstellt_am ?? '—'}`);

    const deps = {};
    for (const dep of DEPENDENCIES) {
      try {
        deps[dep.label || dep.table] = await countForAuftrag(ctx, id, dep);
      } catch (e) {
        deps[dep.label || dep.table] = `(Tabelle fehlt: ${e instanceof Error ? e.message : String(e)})`;
      }
    }
    console.log('  Abhängigkeiten:');
    for (const [label, n] of Object.entries(deps)) {
      console.log(`    ${label}: ${n}`);
    }
  }

  console.log('\n──────────────────────────────────────────────────────────');
  console.log('Summen je abhängiger Tabelle (alle Aufträge):');
  for (const dep of DEPENDENCIES) {
    try {
      const sumRows = await ctx.query(
        `SELECT COUNT(*) AS c FROM ${dep.table} WHERE ${dep.column} IS NOT NULL AND TRIM(CAST(${dep.column} AS CHAR)) != ''`,
        [],
      );
      const linked = sumRows[0] && sumRows[0].c != null ? Number(sumRows[0].c) : 0;
      console.log(`  ${dep.label || dep.table}: ${linked} Zeilen mit ${dep.column}`);
    } catch (e) {
      console.log(`  ${dep.label || dep.table}: (nicht lesbar — ${e instanceof Error ? e.message : String(e)})`);
    }
  }
  console.log('');
}

async function runMysql() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT || 3306),
    ssl: String(process.env.MYSQL_SSL || '').trim() === '1' ? {} : undefined,
  });
  try {
    await analyse(
      {
        query: (sql, params) => mysqlAll(pool, sql, params),
      },
      'MySQL',
    );
  } finally {
    await pool.end();
  }
}

async function runSqlite() {
  if (!fs.existsSync(dbPath)) {
    console.error(`[sqlite] Datei fehlt: ${dbPath}`);
    process.exit(1);
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  try {
    sqliteAll(db, 'PRAGMA foreign_keys = ON');
    await analyse(
      {
        query: (sql, params) => Promise.resolve(sqliteAll(db, sql, params)),
      },
      `SQLite (${dbPath})`,
    );
  } finally {
    db.close();
  }
}

async function main() {
  console.log('[analyse-ccintern-auftraege] Nur SELECT — keine Schreiboperationen.');
  if (mysqlConfigured()) {
    await runMysql();
  } else {
    console.log(`[sqlite] Keine MYSQL_* in .env — nutze ${dbPath}`);
    await runSqlite();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
