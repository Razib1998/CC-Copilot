/**
 * SQLite-spezifische Store-Helfer (sql.js).
 * Parität zu {@link ../db/mysql-store.js} wo sinnvoll.
 */

/**
 * Eine Zeile: `firmen` + optionale FUSA-/CC-Intern-Extras (wie MySQL `getFirmaKundeStammById`).
 *
 * @param {(db: import('sql.js').Database, sql: string, params?: unknown[]) => Record<string, unknown>|null} stmtGet
 * @param {import('sql.js').Database} db
 * @param {string} id
 * @returns {Record<string, unknown>|null}
 */
export function getFirmaKundeStammByIdSqlite(stmtGet, db, id) {
  const fid = typeof id === 'string' ? id.trim() : '';
  if (!fid) return null;
  return stmtGet(
    db,
    `SELECT f.*, x.segment AS fusa_segment, x.hinweis AS fusa_hinweis, x.updated_at AS fusa_extra_updated_at,
            c.crm_status AS ccintern_crm_status, c.betreuer AS ccintern_betreuer, c.updated_at AS ccintern_extra_updated_at
     FROM firmen f
     LEFT JOIN fusa_kunden_extra x ON x.firma_id = f.id
     LEFT JOIN ccintern_kunden_extra c ON c.firma_id = f.id
     WHERE f.id = ? LIMIT 1`,
    [fid],
  );
}
