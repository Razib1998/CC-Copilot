/**
 * Seed: ccintern_checklisten_zuordnung — Produkt × Schritt → Checkliste (CC Werbung).
 *
 * Voraussetzung: Backend gestoppt (SQLite-Dateisperre).
 *
 * Ausführung (von `backend/`):
 *   node src/scripts/seed-checklisten-zuordnung.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../data/cc-cockpit.db');

const FIRMA_ID = '651b31ab-194d-467d-a745-199323b4df6e';

const PRODUKTE = [
  'pkw_beschr',
  'pkw_voll',
  'pkw_teil',
  'van_voll',
  'van_teil',
  'van_beschr',
  'bus_voll',
  'bus_teil',
  'bus_heck',
  'bus_traffic_board',
  'banner_pvc',
  'dibond_schild',
  'fenster_bekl',
  'freie_leistung',
];

/** @type {Record<string, string>} */
const SCHRITT_CHECKLISTE = {
  grafik: 'b3e23e18-6216-434c-9722-a74ac13d1924',
  druck: '7bc43aa5-15f1-49a9-8c17-194211c179e0',
  laminat: '61d0dc8a-d73f-4ad2-8110-093773643aee',
  montage: 'fdc28c3c-c7a3-441b-a7ee-878f7c281871',
  doku: 'b3a4c7e5-8e3c-4bbc-98c7-24b5c4eda224',
};

const INSERT_SQL = `
INSERT OR IGNORE INTO ccintern_checklisten_zuordnung (
  id, firma_id, produkt_id, schritt, checkliste_id, sortierung, aktiv, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, 0, 1, datetime('now'), NULL)
`;

/** @param {string} firmaId @param {string} produktId @param {string} schritt */
function stableRowId(firmaId, produktId, schritt) {
  const h = createHash('sha1').update(`${firmaId}|${produktId}|${schritt}`, 'utf8').digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** @param {import('sql.js').Database} db @param {string} sql @param {unknown[]} [params] */
function scalarCount(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let n = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    n = Number(row.n ?? row.N ?? 0);
  }
  stmt.free();
  return n;
}

/** @param {import('sql.js').Database} db */
function ensureTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ccintern_checklisten_zuordnung (
    id TEXT PRIMARY KEY,
    firma_id TEXT NOT NULL,
    produkt_id TEXT NOT NULL,
    schritt TEXT NOT NULL,
    checkliste_id TEXT NOT NULL,
    sortierung INTEGER NOT NULL DEFAULT 0,
    aktiv INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
    FOREIGN KEY (checkliste_id) REFERENCES checklisten (id) ON DELETE CASCADE,
    CHECK (schritt IN ('grafik','druck','laminat','montage','doku'))
  )`);
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`[seed-checklisten-zuordnung] SQLite-Datei fehlt: ${dbPath}`);
    process.exit(1);
  }

  console.log('[seed-checklisten-zuordnung] DB:', dbPath);
  console.log('[seed-checklisten-zuordnung] firma_id:', FIRMA_ID);

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  try {
    ensureTable(db);

    const countBefore = scalarCount(
      db,
      `SELECT COUNT(*) AS n FROM ccintern_checklisten_zuordnung WHERE firma_id = ?`,
      [FIRMA_ID],
    );

    let attempted = 0;
    for (const produkt_id of PRODUKTE) {
      for (const [schritt, checkliste_id] of Object.entries(SCHRITT_CHECKLISTE)) {
        const id = stableRowId(FIRMA_ID, produkt_id, schritt);
        db.run(INSERT_SQL, [id, FIRMA_ID, produkt_id, schritt, checkliste_id]);
        attempted += 1;
      }
    }

    const countAfter = scalarCount(
      db,
      `SELECT COUNT(*) AS n FROM ccintern_checklisten_zuordnung WHERE firma_id = ?`,
      [FIRMA_ID],
    );
    const inserted = countAfter - countBefore;

    fs.writeFileSync(dbPath, Buffer.from(db.export()));

    console.log(
      `[seed-checklisten-zuordnung] ${attempted} Zeile(n) versucht, ${inserted} neu, gesamt firma: ${countAfter}`,
    );
    console.log('[seed-checklisten-zuordnung] SQLite gespeichert.');
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('[seed-checklisten-zuordnung]', err instanceof Error ? err.message : err);
  process.exit(1);
});
