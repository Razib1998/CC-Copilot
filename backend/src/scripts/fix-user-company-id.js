/**
 * Einmal-Fix: users.company_id für alle Nicht-SUPER_ADMIN ohne Firma → CC Werbung.
 * Architektur: docs/ARCHITEKTUR_REGEL.md — eine Firmenquelle (firmen), Kontext über users.company_id.
 *
 * Voraussetzung: Backend/Passenger gestoppt (SQLite-Dateisperre).
 *
 * Dry-Run (Standard, nur Anzahl + Vorschau):
 *   cd backend
 *   node src/scripts/fix-user-company-id.js
 *
 * Schreibend:
 *   cd backend
 *   CONFIRM_FIX=YES node src/scripts/fix-user-company-id.js
 *
 * Optional: SQLITE_DB_PATH, FIX_FIRMA_ID (UUID überschreibt Namensauflösung)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoBackendRoot = path.join(__dirname, '..', '..');
const defaultDbPath = path.join(repoBackendRoot, 'data', 'cc-cockpit.db');
const dbPath = String(process.env.SQLITE_DB_PATH || '').trim() || defaultDbPath;

const CONFIRM = String(process.env.CONFIRM_FIX || '').trim().toUpperCase() === 'YES';
const FIX_FIRMA_ID = String(process.env.FIX_FIRMA_ID || '').trim();

const COUNT_SQL = `
SELECT COUNT(*) AS n
FROM users
WHERE (company_id IS NULL OR TRIM(company_id) = '')
  AND UPPER(COALESCE(global_role, '')) != 'SUPER_ADMIN'
`;

const PREVIEW_SQL = `
SELECT id, email, global_role, company_id
FROM users
WHERE (company_id IS NULL OR TRIM(company_id) = '')
  AND UPPER(COALESCE(global_role, '')) != 'SUPER_ADMIN'
ORDER BY email
LIMIT 50
`;

const UPDATE_SQL = `
UPDATE users
SET company_id = ?
WHERE (company_id IS NULL OR TRIM(company_id) = '')
  AND UPPER(COALESCE(global_role, '')) != 'SUPER_ADMIN'
`;

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

/** @param {import('sql.js').Database} db */
function sqliteOne(db, sql, params = []) {
  const rows = sqliteAll(db, sql, params);
  return rows[0] ?? null;
}

/**
 * @param {{ id: string, name: string }[]} firmen
 * @returns {{ id: string, name: string }}
 */
function resolveCcWerbungFirma(firmen) {
  if (!firmen.length) {
    throw new Error('Keine Firma in `firmen` — Abbruch.');
  }

  const norm = (s) => String(s || '').trim().toLowerCase();
  const exact = firmen.find((f) => norm(f.name) === 'cc werbung');
  if (exact) return exact;

  const contains = firmen.filter((f) => norm(f.name).includes('cc werbung'));
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) {
    const names = contains.map((f) => `${f.name} (${f.id})`).join(', ');
    throw new Error(
      `Mehrere Firmen mit „CC Werbung“ im Namen — bitte FIX_FIRMA_ID setzen. Treffer: ${names}`,
    );
  }

  throw new Error(
    'Keine Firma „CC Werbung“ gefunden — bitte FIX_FIRMA_ID setzen oder Stammdaten prüfen.',
  );
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`[fix-user-company-id] SQLite-Datei fehlt: ${dbPath}`);
    process.exit(1);
  }

  console.log('[fix-user-company-id] DB:', dbPath);
  console.log('[fix-user-company-id] Modus:', CONFIRM ? 'SCHREIBEND (CONFIRM_FIX=YES)' : 'Dry-Run');
  console.log('[fix-user-company-id] Hinweis: Backend vor SQLite-Schreibzugriff stoppen.');

  const SQL = await initSqlJs();
  const fileBuf = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuf);

  try {
    const firmen = sqliteAll(db, 'SELECT id, name FROM firmen ORDER BY name');
    console.log('[fix-user-company-id] firmen:', firmen.length);
    for (const f of firmen) {
      console.log(`  - ${f.name} → ${f.id}`);
    }

    let target;
    if (FIX_FIRMA_ID) {
      target = firmen.find((f) => String(f.id).trim() === FIX_FIRMA_ID);
      if (!target) {
        console.error(`[fix-user-company-id] FIX_FIRMA_ID nicht in firmen: ${FIX_FIRMA_ID}`);
        process.exit(1);
      }
    } else {
      target = resolveCcWerbungFirma(firmen);
    }

    const firmaId = String(target.id).trim();
    console.log(`[fix-user-company-id] Ziel-Firma: ${target.name} (${firmaId})`);

    const countRow = sqliteOne(db, COUNT_SQL);
    const affected = Number(countRow?.n ?? 0);
    console.log(`[fix-user-company-id] Betroffene User (company_id leer, nicht SUPER_ADMIN): ${affected}`);

    const preview = sqliteAll(db, PREVIEW_SQL);
    if (preview.length) {
      console.log('[fix-user-company-id] Vorschau (max. 50):');
      for (const u of preview) {
        console.log(`  ${u.id} | ${u.email} | ${u.global_role}`);
      }
    }

    if (!CONFIRM) {
      console.log('[fix-user-company-id] Dry-Run — zum Anwenden: CONFIRM_FIX=YES node src/scripts/fix-user-company-id.js');
      return;
    }

    if (affected === 0) {
      console.log('[fix-user-company-id] Nichts zu aktualisieren.');
      return;
    }

    db.run(UPDATE_SQL, [firmaId]);
    const after = sqliteOne(db, COUNT_SQL);
    const remaining = Number(after?.n ?? 0);
    const written = affected - remaining;
    console.log(`[fix-user-company-id] Aktualisiert: ${written} Zeile(n), verbleibend ohne company_id: ${remaining}`);

    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log('[fix-user-company-id] SQLite gespeichert:', dbPath);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('[fix-user-company-id]', err instanceof Error ? err.message : err);
  process.exit(1);
});
