/**
 * Stellt nur die Tabelle `lager_material` aus einer Backup-SQLite wieder her.
 *
 * WICHTIG: Backend stoppen (kein offenes `cc-cockpit.db`), sonst riskiert ihr Locks/Korruption.
 *
 * Backup: standardmäßig die einzige Datei `cc-cockpit_before_pdf_lager_import*.db`
 *         unter `%USERPROFILE%\Desktop\Lager` (oder Umgebung `LAGER_BACKUP_DIR`).
 *
 * Ziel:   `backend/data/cc-cockpit.db` (oder erster CLI-Parameter: Pfad zur Ziel-DB).
 *
 * Ausführung (von `backend/`):
 *   node scripts/restore-lager-material.mjs
 *   node scripts/restore-lager-material.mjs "C:\pfad\zu\cc-cockpit.db"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} ident */
function quoteIdent(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

/** @param {import('sql.js').Database} db */
function tableNamesFromPragma(db) {
  const r = db.exec('PRAGMA table_info(lager_material)');
  if (!r.length || !r[0].values) return [];
  return r[0].values.map((row) => String(row[1]));
}

/**
 * @param {import('sql.js').Database} db
 * @param {string[]} cols
 * @returns {unknown[][]}
 */
function selectAllMaterialRows(db, cols) {
  if (!cols.length) return [];
  const sel = `SELECT ${cols.map(quoteIdent).join(', ')} FROM lager_material`;
  const r = db.exec(sel);
  if (!r.length) return [];
  return /** @type {unknown[][]} */ (r[0].values ?? []);
}

function resolveDefaultBackupPath() {
  const base = process.env.LAGER_BACKUP_DIR || path.join(process.env.USERPROFILE || '', 'Desktop', 'Lager');
  if (!fs.existsSync(base)) {
    throw new Error(`Backup-Ordner fehlt: ${base} (oder LAGER_BACKUP_DIR setzen)`);
  }
  const files = fs
    .readdirSync(base)
    .filter((f) => /^cc-cockpit_before_pdf_lager_import.*\.db$/i.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(`Keine Datei cc-cockpit_before_pdf_lager_import*.db in ${base}`);
  }
  if (files.length > 1) {
    console.warn('[restore-lager-material] Mehrere Treffer — nutze erste ( alphabetisch ):', files.join(', '));
  }
  return path.join(base, files[0]);
}

async function main() {
  const backupPath = resolveDefaultBackupPath();
  const targetPath =
    process.argv[2] && String(process.argv[2]).trim()
      ? path.resolve(String(process.argv[2]).trim())
      : path.join(__dirname, '..', 'data', 'cc-cockpit.db');

  if (!fs.existsSync(backupPath)) throw new Error(`Backup-DB fehlt: ${backupPath}`);
  if (!fs.existsSync(targetPath)) throw new Error(`Ziel-DB fehlt: ${targetPath}`);

  console.log('[restore-lager-material] Backup (read-only im Speicher):', backupPath);
  console.log('[restore-lager-material] Ziel (wird geschrieben):', targetPath);

  const SQL = await initSqlJs();
  const backupU8 = fs.readFileSync(backupPath);
  const targetU8 = fs.readFileSync(targetPath);

  const backupDb = new SQL.Database(backupU8);
  const targetDb = new SQL.Database(targetU8);

  let backupCols;
  try {
    backupCols = tableNamesFromPragma(backupDb);
  } catch {
    backupCols = [];
  }
  if (!backupCols.length) {
    backupDb.close();
    targetDb.close();
    throw new Error('Backup: Tabelle lager_material fehlt oder hat keine Spalten.');
  }

  let targetCols;
  try {
    targetCols = tableNamesFromPragma(targetDb);
  } catch {
    targetCols = [];
  }
  if (!targetCols.length) {
    backupDb.close();
    targetDb.close();
    throw new Error('Ziel: Tabelle lager_material fehlt. Zuerst Migration/App starten, die die Tabelle anlegt.');
  }

  const backupSet = new Set(backupCols);
  const cols = targetCols.filter((c) => backupSet.has(c));
  if (!cols.length) {
    backupDb.close();
    targetDb.close();
    throw new Error('Keine gemeinsamen Spalten zwischen Backup und Ziel für lager_material.');
  }

  const rowsBeforeR = targetDb.exec('SELECT COUNT(*) AS c FROM lager_material');
  const rowsBefore = Number(rowsBeforeR[0]?.values?.[0]?.[0] ?? 0);

  const dataRows = selectAllMaterialRows(backupDb, cols);
  const rowsInBackup = dataRows.length;

  if (rowsInBackup === 0) {
    backupDb.close();
    targetDb.close();
    throw new Error('Backup enthält keine Zeilen in lager_material — Abbruch.');
  }

  const insertSql = `INSERT OR IGNORE INTO lager_material (${cols.map(quoteIdent).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const ins = targetDb.prepare(insertSql);
  for (let i = 0; i < dataRows.length; i++) {
    ins.run(dataRows[i]);
  }
  ins.free();

  const rowsAfterR = targetDb.exec('SELECT COUNT(*) AS c FROM lager_material');
  const rowsAfter = Number(rowsAfterR[0]?.values?.[0]?.[0] ?? 0);
  const inserted = rowsAfter - rowsBefore;

  const out = targetDb.export();
  fs.writeFileSync(targetPath, Buffer.from(out));

  backupDb.close();
  targetDb.close();

  console.log('[restore-lager-material] Spalten (Schnittmenge, Reihenfolge Ziel-DB):', cols.join(', '));
  console.log('[restore-lager-material] Zeilen im Backup:', rowsInBackup);
  console.log('[restore-lager-material] Ziel COUNT vorher:', rowsBefore, '→ nachher:', rowsAfter);
  console.log('[restore-lager-material] Neu eingefügt (netto, OR IGNORE überspringt vorhandene IDs):', inserted);

  if (rowsAfter <= 0) {
    console.error('[restore-lager-material] FEHLER: COUNT(*) nach Restore ist nicht > 0.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[restore-lager-material]', e instanceof Error ? e.message : e);
  process.exit(1);
});
