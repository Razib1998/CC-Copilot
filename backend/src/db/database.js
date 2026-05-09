import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { defaultFlagsForRole } from '../auth/project-access-rules.js';
import { bereicheForModule, normalizeRightsJson, rightsJsonFullForModule } from '../auth/rights-spec.js';
import { createMysqlStore } from './mysql-store.js';
import {
  attachFahrzeugFelderToFusaRows,
  collectAllFahrzeugIdsFromAuftragRows,
  nullifyEmptyStringFields,
} from './fusa-auftraege-enrich.js';
import { promisifyStore } from './promisify-store.js';
import { getFirmaKundeStammByIdSqlite } from './sqlite-store.js';
import { auftragTermineZuBelegungIso } from '../lib/fusa-belegung-dates.js';
import { pruefeFusaBuchungVorBelegung } from '../lib/fusa-fahrzeug-verfuegbarkeit.js';
import { computeNextSystemKundennummer, isUniqueConstraintError } from '../lib/system-kundennummer.js';
import {
  findSchrittObjektFuerSchritt,
  parseCcinternBemerkungPayload,
  userAssignedToProduktionSchrittInBemerkung,
  userReferencedInAnyWorkflowSchritt,
  workflowCurrentStepFromAuftragRow,
} from '../lib/ccintern-workflow-bemerkung.js';

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

/** @param {unknown} v */
function normAuftragTerminStr(v) {
  if (v == null || String(v).trim() === '') return '';
  return String(v).trim();
}

/**
 * Stabiler Vergleichsschlüssel für fusa_fahrzeug_ids (JSON-Array).
 * @param {unknown} raw
 */
function canonicalAuftragFzIdsKey(raw) {
  if (raw == null || String(raw).trim() === '' || String(raw).trim() === '[]') return '__empty__';
  try {
    const a = JSON.parse(String(raw));
    if (!Array.isArray(a)) return `__raw__:${String(raw)}`;
    const ids = [...new Set(a.map((x) => String(x).trim()).filter(Boolean))].sort();
    return ids.join('\u001f');
  } catch {
    return `__raw__:${String(raw)}`;
  }
}

/**
 * @param {unknown} termin
 * @param {unknown} terminEnde
 * @param {unknown} fzJson
 */
function belegungTripleKey(termin, terminEnde, fzJson) {
  return `${normAuftragTerminStr(termin)}|${normAuftragTerminStr(terminEnde)}|${canonicalAuftragFzIdsKey(fzJson)}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoBackendRoot = path.join(__dirname, '..', '..');
const defaultDataDir = path.join(repoBackendRoot, 'data');
const defaultDbPath = path.join(defaultDataDir, 'cc-cockpit.db');
const sqliteDbPathFromEnv = String(process.env.SQLITE_DB_PATH || '').trim();
const dbPath = sqliteDbPathFromEnv || defaultDbPath;
const sqliteDataDir = path.dirname(dbPath);
const schemaPath = path.join(__dirname, 'schema.sql');

function stmtGet(db, sql, params) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

function stmtRun(db, sql, params) {
  db.run(sql, params);
}

function stmtAll(db, sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * @param {import('sql.js').Database} db
 */
function sqliteTableExists(db, tableName) {
  const row = stmtGet(
    db,
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName],
  );
  return row != null && Number(row.ok) === 1;
}

/**
 * @param {import('sql.js').Database} db
 * @param {string} tableName
 * @returns {Set<string>}
 */
function sqliteTableColumnsSet(db, tableName) {
  if (!sqliteTableExists(db, tableName)) return new Set();
  const info = stmtAll(db, `PRAGMA table_info(${tableName})`, []);
  return new Set(info.map((r) => String(r.name || '')));
}

/**
 * Alte SQLite-Dateien: Tabellen existieren bereits ohne `project_id`, aber `schema.sql`
 * legt danach Indizes auf `project_id` an → `db.exec(schema)` scheitert mit
 * „no such column: project_id“. Fehlende Spalte per ALTER nachziehen (vor dem Schema-Exec).
 *
 * @param {import('sql.js').Database} db
 * @param {() => void} persist
 */
function migrateSqlitePreSchemaProjectId(db, persist) {
  /** Nur feste Identifier — niemals externe Namen einfügen. */
  const tables = [
    'auftraege',
    'fahrzeuge',
    'fusa_belegungen',
    'schaeden',
    'angebote',
    'project_access',
    'project_invites',
  ];
  let changed = false;
  for (const t of tables) {
    if (!sqliteTableExists(db, t)) continue;
    const info = stmtAll(db, `PRAGMA table_info(${t})`, []);
    const names = new Set(info.map((r) => String(r.name || '')));
    if (names.has('project_id')) continue;
    db.run(`ALTER TABLE ${t} ADD COLUMN project_id TEXT`);
    changed = true;
  }
  if (changed) persist();
}

/**
 * Ältere `fusa_belegungen`-Variante (Legacy-FUSA): Spalten `start` / `ende` statt
 * `startdatum` / `enddatum`, teils ohne `updated_at`. Ohne Angleichung schlägt
 * `CREATE INDEX … (startdatum, …)` in schema.sql fehl.
 *
 * @param {import('sql.js').Database} db
 * @param {() => void} persist
 */
function migrateSqlitePreSchemaFusaBelegungenColumns(db, persist) {
  if (!sqliteTableExists(db, 'fusa_belegungen')) return;
  let changed = false;
  const readNames = () =>
    new Set(stmtAll(db, 'PRAGMA table_info(fusa_belegungen)', []).map((r) => String(r.name || '')));

  let names = readNames();

  if (!names.has('startdatum')) {
    db.run('ALTER TABLE fusa_belegungen ADD COLUMN startdatum TEXT');
    if (names.has('start')) {
      db.run(
        `UPDATE fusa_belegungen SET startdatum = COALESCE(NULLIF(TRIM(start), ''), date('now')) WHERE startdatum IS NULL`,
      );
    } else {
      db.run(`UPDATE fusa_belegungen SET startdatum = date('now') WHERE startdatum IS NULL`);
    }
    changed = true;
    names = readNames();
  }

  if (!names.has('enddatum')) {
    db.run('ALTER TABLE fusa_belegungen ADD COLUMN enddatum TEXT');
    if (names.has('ende')) {
      db.run(
        `UPDATE fusa_belegungen SET enddatum = COALESCE(NULLIF(TRIM(ende), ''), date('now')) WHERE enddatum IS NULL`,
      );
    } else {
      db.run(`UPDATE fusa_belegungen SET enddatum = date('now') WHERE enddatum IS NULL`);
    }
    changed = true;
    names = readNames();
  }

  if (!names.has('updated_at')) {
    db.run("ALTER TABLE fusa_belegungen ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
    changed = true;
  }

  if (changed) persist();
}

/**
 * Alte SQLite-Dateien: einzelne Legacy-Tabellen existieren bereits ohne `firma_id`,
 * während `schema.sql` Indizes auf `firma_id` anlegt. Fehlende Spalten vor
 * `db.exec(schema)` additiv nachziehen, damit der Schema-Import nicht abbricht.
 *
 * @param {import('sql.js').Database} db
 * @param {() => void} persist
 */
function migrateSqlitePreSchemaFirmaIdColumns(db, persist) {
  /** Nur feste interne Tabellennamen. */
  const tables = [
    'cockpit_invites',
    'fusa_kunden_extra',
    'ccintern_kunden_extra',
    'ccintern_auftraege',
    'kalender_termine',
    'mitarbeiter',
    'checklisten',
    'produktion_auftraege',
    'urlaub_antraege',
    'lager_material',
    'ccintern_anfragen',
    'aufgaben',
    'ccintern_rechnungen',
    'messeflow_projekte',
    'geraete',
    'crm_pipeline_stages',
    'crm_aktivitaeten',
    'crm_wiedervorlage',
  ];
  let changed = false;
  for (const t of tables) {
    const names = sqliteTableColumnsSet(db, t);
    if (!names.size || names.has('firma_id')) continue;
    db.run(`ALTER TABLE ${t} ADD COLUMN firma_id TEXT`);
    changed = true;
  }
  if (changed) persist();
}

/** Bestehende SQLite-DBs: Spalten Phase 14 (Werkstatt + Fotos). */
function migratePhase14WerkstattUndFotos(db, persist) {
  try {
    const info = stmtAll(db, 'PRAGMA table_info(schaeden)', []);
    const names = new Set(info.map((r) => String(r.name || '')));
    if (!names.has('werkstatt_status')) {
      db.run("ALTER TABLE schaeden ADD COLUMN werkstatt_status TEXT NOT NULL DEFAULT 'offen'");
    }
    if (!names.has('bearbeitet_von')) {
      db.run('ALTER TABLE schaeden ADD COLUMN bearbeitet_von TEXT');
    }
    if (!names.has('bearbeitet_am')) {
      db.run('ALTER TABLE schaeden ADD COLUMN bearbeitet_am TEXT');
    }
  } catch (e) {
    console.error('[migratePhase14] schaeden', e);
  }
  persist();
}

/**
 * Phase 16: Tabelle kunden + projects.kunden_id.
 *
 * LEGACY — nur Markierung, keine Migration: Tabelle **kunden** ist das alte Projekt-Kundenmodell. Neue Entwicklung muss **firmen** bzw. `/api/v1/firmen` oder `/api/v1/stammdaten/kunden` verwenden. **projects.kunden_id** bleibt bis zu einer separaten Migration unverändert.
 */
function migratePhase16KundenUndProjektKunde(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS kunden (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ansprechpartner TEXT,
      telefon TEXT,
      email TEXT,
      adresse TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_kunden_name ON kunden (name)');
  } catch (e) {
    console.error('[migratePhase16] kunden', e);
  }
  try {
    const pinfo = stmtAll(db, 'PRAGMA table_info(projects)', []);
    const pnames = new Set(pinfo.map((r) => String(r.name || '')));
    if (!pnames.has('kunden_id')) {
      db.run('ALTER TABLE projects ADD COLUMN kunden_id TEXT');
    }
  } catch (e) {
    console.error('[migratePhase16] projects.kunden_id', e);
  }
  persist();
}

/**
 * Phase 17: Tabelle angebote.
 *
 * LEGACY: Tabelle **angebote** ist das alte Projekt-Angebotsmodell. Neue Entwicklung nutzt **fusa_angebote** oder **ccintern_angebote**. Nicht für neue Features verwenden.
 */
function migratePhase17Angebote(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS angebote (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      titel TEXT NOT NULL,
      angebotsnummer TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'entwurf',
      betrag_netto REAL,
      notiz TEXT,
      erstellt_von TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_angebote_project ON angebote (project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_angebote_created ON angebote (created_at)');
  } catch (e) {
    console.error('[migratePhase17] angebote', e);
  }
  persist();
}

/** Phase 18: Fahrzeug-Zusatzfelder (Formular → JSON, ohne neue Endpunkte). */
function migratePhase18FahrzeugDetailsJson(db, persist) {
  try {
    const info = stmtAll(db, 'PRAGMA table_info(fahrzeuge)', []);
    const names = new Set(info.map((r) => String(r.name || '')));
    if (!names.has('details_json')) {
      db.run('ALTER TABLE fahrzeuge ADD COLUMN details_json TEXT');
    }
  } catch (e) {
    console.error('[migratePhase18] fahrzeuge.details_json', e);
  }
  persist();
}

/** Globale Rollen, Modulzugriff, Bereichsrechte (nicht projektbezogen). */
function migratePhase19GlobalRights(db, persist) {
  try {
    const uinfo = stmtAll(db, 'PRAGMA table_info(users)', []);
    const unames = new Set(uinfo.map((r) => String(r.name || '')));
    if (!unames.has('global_role')) {
      db.run("ALTER TABLE users ADD COLUMN global_role TEXT NOT NULL DEFAULT 'INTERN'");
    }
  } catch (e) {
    console.error('[migratePhase19] users.global_role', e);
  }
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS user_modules (
      user_id TEXT NOT NULL,
      module TEXT NOT NULL,
      PRIMARY KEY (user_id, module),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS user_rights (
      user_id TEXT NOT NULL,
      module TEXT NOT NULL,
      bereich TEXT NOT NULL,
      rechte_json TEXT NOT NULL,
      PRIMARY KEY (user_id, module, bereich),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_user_rights_user ON user_rights (user_id)');
  } catch (e) {
    console.error('[migratePhase19] user_modules/user_rights', e);
  }
  try {
    const cnt = stmtGet(db, 'SELECT COUNT(*) AS c FROM user_rights', []);
    const n = cnt && cnt.c != null ? Number(cnt.c) : 0;
    if (n > 0) {
      persist();
      return;
    }
    const users = stmtAll(db, 'SELECT id FROM users', []);
    const oldest = stmtGet(db, 'SELECT id FROM users ORDER BY datetime(created_at) ASC LIMIT 1', []);
    const superId = oldest && oldest.id ? String(oldest.id) : null;
    for (const u of users) {
      const id = String(u.id);
      const role = superId && id === superId ? 'SUPER_ADMIN' : 'INTERN';
      stmtRun(db, 'UPDATE users SET global_role = ? WHERE id = ?', [role, id]);
      for (const mod of /** @type {const} */ (['cockpit', 'fusa', 'ccintern'])) {
        stmtRun(db, 'INSERT OR IGNORE INTO user_modules (user_id, module) VALUES (?, ?)', [id, mod]);
        for (const b of bereicheForModule(mod)) {
          stmtRun(
            db,
            'INSERT OR REPLACE INTO user_rights (user_id, module, bereich, rechte_json) VALUES (?, ?, ?, ?)',
            [id, mod, b, rightsJsonFullForModule(mod)],
          );
        }
      }
    }
  } catch (e) {
    console.error('[migratePhase19] seed rights', e);
  }
  persist();
}

function migratePhase20RoleTemplates(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS role_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      modules_json TEXT NOT NULL DEFAULT '[]',
      rights_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {
    console.error('[migratePhase20] role_templates', e);
  }
  persist();
}

/** CC Intern: Bereichs-Slug `mitarbeiter_app` → `mitarbeiterapp` (Schritt 4 Ergänzung). */
function migratePhase21CcinternMitarbeiterappSlug(db, persist) {
  try {
    stmtRun(db, 'UPDATE user_rights SET bereich = ? WHERE module = ? AND bereich = ?', [
      'mitarbeiterapp',
      'ccintern',
      'mitarbeiter_app',
    ]);
  } catch (e) {
    console.error('[migratePhase21] user_rights mitarbeiterapp', e);
  }
  persist();
}

/** Firmen-Tabelle + Cockpit-Einladungen (global, nicht projektbezogen). */
function migratePhase22FirmenUndCockpitInvites(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS firmen (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kundennummer TEXT,
      typ TEXT,
      intern_extern TEXT,
      umsatzsteuer_id TEXT,
      strasse TEXT,
      plz TEXT,
      stadt TEXT,
      land TEXT DEFAULT 'Deutschland',
      telefon TEXT,
      email TEXT,
      website TEXT,
      ansprechpartner_anrede TEXT,
      ansprechpartner_vorname TEXT,
      ansprechpartner_nachname TEXT,
      ansprechpartner_email TEXT,
      ansprechpartner_telefon TEXT,
      interne_notiz TEXT,
      status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    const finfo = stmtAll(db, 'PRAGMA table_info(firmen)', []);
    const fnames = new Set(finfo.map((r) => String(r.name || '')));
    if (!fnames.has('kundennummer')) db.run('ALTER TABLE firmen ADD COLUMN kundennummer TEXT');
    if (!fnames.has('altnummer')) db.run('ALTER TABLE firmen ADD COLUMN altnummer TEXT');
    if (!fnames.has('intern_extern')) db.run('ALTER TABLE firmen ADD COLUMN intern_extern TEXT');
    if (!fnames.has('umsatzsteuer_id')) db.run('ALTER TABLE firmen ADD COLUMN umsatzsteuer_id TEXT');
    if (!fnames.has('strasse')) db.run('ALTER TABLE firmen ADD COLUMN strasse TEXT');
    if (!fnames.has('plz')) db.run('ALTER TABLE firmen ADD COLUMN plz TEXT');
    if (!fnames.has('stadt')) db.run('ALTER TABLE firmen ADD COLUMN stadt TEXT');
    if (!fnames.has('land')) db.run("ALTER TABLE firmen ADD COLUMN land TEXT DEFAULT 'Deutschland'");
    if (!fnames.has('telefon')) db.run('ALTER TABLE firmen ADD COLUMN telefon TEXT');
    if (!fnames.has('email')) db.run('ALTER TABLE firmen ADD COLUMN email TEXT');
    if (!fnames.has('website')) db.run('ALTER TABLE firmen ADD COLUMN website TEXT');
    if (!fnames.has('ansprechpartner_anrede'))
      db.run('ALTER TABLE firmen ADD COLUMN ansprechpartner_anrede TEXT');
    if (!fnames.has('ansprechpartner_vorname'))
      db.run('ALTER TABLE firmen ADD COLUMN ansprechpartner_vorname TEXT');
    if (!fnames.has('ansprechpartner_nachname'))
      db.run('ALTER TABLE firmen ADD COLUMN ansprechpartner_nachname TEXT');
    if (!fnames.has('ansprechpartner_email'))
      db.run('ALTER TABLE firmen ADD COLUMN ansprechpartner_email TEXT');
    if (!fnames.has('ansprechpartner_telefon'))
      db.run('ALTER TABLE firmen ADD COLUMN ansprechpartner_telefon TEXT');
    if (!fnames.has('interne_notiz')) db.run('ALTER TABLE firmen ADD COLUMN interne_notiz TEXT');
    if (!fnames.has('erweiterung_json')) db.run('ALTER TABLE firmen ADD COLUMN erweiterung_json TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_firmen_kundennummer ON firmen (kundennummer)');
    try {
      db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_firmen_kundennummer ON firmen(kundennummer) WHERE kundennummer IS NOT NULL AND kundennummer != \'\'',
      );
    } catch {
      /* Altbestand: Duplikate o. Ä. */
    }
    db.exec(`CREATE TABLE IF NOT EXISTS fusa_kunden_extra (
      firma_id TEXT PRIMARY KEY,
      hinweis TEXT,
      segment TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS ccintern_kunden_extra (
      firma_id TEXT PRIMARY KEY,
      crm_status TEXT,
      betreuer TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS cockpit_invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      global_role TEXT NOT NULL,
      modules_json TEXT NOT NULL DEFAULT '[]',
      areas_json TEXT NOT NULL DEFAULT '[]',
      rights_json TEXT NOT NULL DEFAULT '{}',
      firma_id TEXT,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'offen',
      expires_at TEXT NOT NULL,
      redeemed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by_user_id TEXT,
      FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_cockpit_invites_status ON cockpit_invites (status)');
    const iinfo = stmtAll(db, 'PRAGMA table_info(cockpit_invites)', []);
    const names = new Set(iinfo.map((r) => String(r.name || '')));
    if (!names.has('areas_json')) {
      db.run("ALTER TABLE cockpit_invites ADD COLUMN areas_json TEXT NOT NULL DEFAULT '[]'");
    }
    if (!names.has('rights_json')) {
      db.run("ALTER TABLE cockpit_invites ADD COLUMN rights_json TEXT NOT NULL DEFAULT '{}'");
    }
    if (!names.has('redeemed_at')) {
      db.run('ALTER TABLE cockpit_invites ADD COLUMN redeemed_at TEXT');
    }
    if (!names.has('firma_id')) {
      db.run('ALTER TABLE cockpit_invites ADD COLUMN firma_id TEXT');
    }
    db.run("UPDATE cockpit_invites SET status = 'offen' WHERE status = 'pending'");
    db.run("UPDATE cockpit_invites SET status = 'eingeloest' WHERE status = 'accepted'");
    db.run("UPDATE cockpit_invites SET status = 'abgelaufen' WHERE status = 'expired'");
    db.run("UPDATE cockpit_invites SET status = 'widerrufen' WHERE status = 'revoked'");
  } catch (e) {
    console.error('[migratePhase22] firmen/cockpit_invites', e);
  }
  persist();
}

/** Phase 23: users.status (aktiv/deaktiviert). */
function migratePhase23UserStatus(db, persist) {
  try {
    const info = stmtAll(db, 'PRAGMA table_info(users)', []);
    const names = new Set(info.map((r) => String(r.name || '')));
    if (!names.has('status')) {
      db.run("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'aktiv'");
    }
    if (!names.has('company_id')) {
      db.run('ALTER TABLE users ADD COLUMN company_id TEXT');
    }
  } catch (e) {
    console.error('[migratePhase23] users.status', e);
  }
  persist();
}

/** Phase 24: projects.deadline (Kalender Liefertermin/Deadline). */
function migratePhase24ProjectsDeadline(db, persist) {
  try {
    const pinfo = stmtAll(db, 'PRAGMA table_info(projects)', []);
    const pnames = new Set(pinfo.map((r) => String(r.name || '')));
    if (!pnames.has('deadline')) {
      db.run('ALTER TABLE projects ADD COLUMN deadline TEXT');
    }
  } catch (e) {
    console.error('[migratePhase24] projects.deadline', e);
  }
  persist();
}

/** Phase 25: auftraege.termin_ende (optionales Terminende für Kalender-Mapping). */
function migratePhase25AuftraegeTerminEnde(db, persist) {
  try {
    const info = stmtAll(db, 'PRAGMA table_info(auftraege)', []);
    const names = new Set(info.map((r) => String(r.name || '')));
    if (!names.has('termin_ende')) {
      db.run('ALTER TABLE auftraege ADD COLUMN termin_ende TEXT');
    }
  } catch (e) {
    console.error('[migratePhase25] auftraege.termin_ende', e);
  }
  persist();
}

/** Phase 26: FUSA-Metadaten auf auftraege (Parität zu MySQL ensureMysqlFusaApiSupport). */
function migratePhase26AuftraegeFusaColumns(db, persist) {
  try {
    const info = stmtAll(db, 'PRAGMA table_info(auftraege)', []);
    const names = new Set(info.map((r) => String(r.name || '')));
    if (!names.has('fusa_original_id')) {
      db.run('ALTER TABLE auftraege ADD COLUMN fusa_original_id TEXT');
    }
    if (!names.has('fusa_kunde_id')) {
      db.run('ALTER TABLE auftraege ADD COLUMN fusa_kunde_id TEXT');
    }
    if (!names.has('fusa_fahrzeug_ids')) {
      db.run('ALTER TABLE auftraege ADD COLUMN fusa_fahrzeug_ids TEXT');
    }
    if (!names.has('fusa_extra_json')) {
      db.run('ALTER TABLE auftraege ADD COLUMN fusa_extra_json TEXT');
    }
  } catch (e) {
    console.error('[migratePhase26] auftraege FUSA columns', e);
  }
  persist();
}

/** Phase 27: FUSA-Belegungen (persistente Fahrzeug-Zeitraum-Zuordnung). */
function migratePhase27FusaBelegungen(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS fusa_belegungen (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      auftrag_id TEXT NOT NULL,
      fahrzeug_id TEXT NOT NULL,
      startdatum TEXT NOT NULL,
      enddatum TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aktiv',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (auftrag_id) REFERENCES auftraege (id) ON DELETE CASCADE,
      FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge (id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_fusa_belegungen_project ON fusa_belegungen (project_id)');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_fusa_belegungen_fz ON fusa_belegungen (project_id, fahrzeug_id, startdatum, enddatum)',
    );
  } catch (e) {
    console.error('[migratePhase27] fusa_belegungen', e);
  }
  persist();
}

/** Phase 28: schaeden.extra_json — neue fachliche Felder (Typ, Priorität, Abrechnung, WV, Melder). */
function migratePhase28SchadenExtraJson(db, persist) {
  try {
    const info = stmtAll(db, 'PRAGMA table_info(schaeden)', []);
    const names = new Set(info.map((r) => String(r.name || '')));
    if (!names.has('extra_json')) {
      db.run('ALTER TABLE schaeden ADD COLUMN extra_json TEXT');
    }
  } catch (e) {
    console.error('[migratePhase28] schaeden.extra_json', e);
  }
  persist();
}

/** Phase 29: FUSA-Rechnungen (MySQL-Äquivalent zu `ensureMysqlFusaApiSupport`). */
function migratePhase29FusaRechnungen(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS fusa_rechnungen (
      id TEXT PRIMARY KEY NOT NULL,
      original_id TEXT,
      auftrag_id TEXT,
      kunde_id TEXT,
      von TEXT,
      bis TEXT,
      netto REAL,
      mwst REAL,
      brutto REAL,
      faellig_am TEXT,
      status TEXT,
      quartal TEXT,
      notiz TEXT,
      extra_json TEXT,
      bezahlt_am TEXT,
      rechnungsdatum TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {
    console.error('[migratePhase29] fusa_rechnungen', e);
  }
  persist();
}

/** Phase 30: MesseFlow Arbeitsbereich (JSON-Blob, ein gemeinsamer Datensatz). */
function migratePhase30MesseflowWorkspace(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS messeflow_workspace (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {
    console.error('[migratePhase30] messeflow_workspace', e);
  }
  persist();
}

/** Phase 31: CC-Intern Aufträge + Kommentare (mandantenfähig). */
function migratePhase31CcInternAuftraege(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ccintern_auftraege (
      id TEXT PRIMARY KEY,
      auftragsnummer TEXT NOT NULL UNIQUE,
      kunde TEXT NOT NULL,
      status TEXT,
      schritt TEXT,
      prioritaet TEXT,
      lieferdatum TEXT,
      montage_datum TEXT,
      bemerkung TEXT,
      fusa_auftrag_id TEXT,
      quelle TEXT NOT NULL DEFAULT 'manuell',
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      aktualisiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      erstellt_von TEXT,
      firma_id TEXT NOT NULL,
      FOREIGN KEY (fusa_auftrag_id) REFERENCES auftraege (id) ON DELETE SET NULL,
      FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    )`);
  } catch (e) {
    console.error('[migratePhase31] ccintern_auftraege', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_ccintern_auftraege_firma ON ccintern_auftraege (firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ccintern_auftraege_erstellt ON ccintern_auftraege (erstellt_am)');
  } catch (e) {
    console.error('[migratePhase31] ccintern_auftraege indexes', e);
  }
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ccintern_auftrag_kommentare (
      id TEXT PRIMARY KEY,
      auftrag_id TEXT NOT NULL,
      text TEXT NOT NULL,
      autor_id TEXT,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE CASCADE,
      FOREIGN KEY (autor_id) REFERENCES users (id) ON DELETE SET NULL
    )`);
  } catch (e) {
    console.error('[migratePhase31] ccintern_auftrag_kommentare', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_ccintern_auftrag_kommentare_auftrag ON ccintern_auftrag_kommentare (auftrag_id, erstellt_am)');
  } catch (e) {
    console.error('[migratePhase31] ccintern_auftrag_kommentare indexes', e);
  }
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ccintern_auftrag_dateien (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      auftrag_id TEXT NOT NULL,
      kunde_id TEXT,
      typ TEXT NOT NULL,
      bereich TEXT,
      phase TEXT,
      position TEXT,
      filename TEXT NOT NULL,
      originalname TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER NOT NULL,
      server_path TEXT NOT NULL,
      public_url TEXT NOT NULL,
      uploaded_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
    )`);
  } catch (e) {
    console.error('[migratePhase31] ccintern_auftrag_dateien', e);
  }
  try {
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_ccintern_auftrag_dateien_auftrag ON ccintern_auftrag_dateien (auftrag_id, created_at)',
    );
  } catch (e) {
    console.error('[migratePhase31] ccintern_auftrag_dateien indexes', e);
  }
  persist();
}

/** Phase 32: gemeinsamer Kalender. */
function migratePhase32KalenderTermine(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS kalender_termine (
      id TEXT PRIMARY KEY,
      titel TEXT NOT NULL,
      start TEXT NOT NULL,
      ende TEXT,
      ganztag INTEGER NOT NULL DEFAULT 0,
      typ TEXT NOT NULL DEFAULT 'allgemein',
      quelle TEXT NOT NULL DEFAULT 'manuell',
      mitarbeiter_ids TEXT NOT NULL DEFAULT '[]',
      auftrag_id TEXT,
      fusa_auftrag_id TEXT,
      farbe TEXT,
      notiz TEXT,
      firma_id TEXT NOT NULL,
      erstellt_von TEXT,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      aktualisiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE SET NULL,
      FOREIGN KEY (fusa_auftrag_id) REFERENCES auftraege (id) ON DELETE SET NULL,
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
      FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
    )`);
  } catch (e) {
    console.error('[migratePhase32] kalender_termine table', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_kalender_termine_firma ON kalender_termine (firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_kalender_termine_start ON kalender_termine (start)');
  } catch (e) {
    console.error('[migratePhase32] kalender_termine indexes', e);
  }
  persist();
}

/** Phase 41: FUSA-CC-Intern-Bruecke + gemeinsame Kalenderquelle. */
function migratePhase42CcInternMitarbeiter(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS mitarbeiter (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      firma_id TEXT NOT NULL,
      vertrag_typ TEXT,
      soll_stunden REAL,
      eintrittsdatum TEXT,
      austrittsdatum TEXT,
      position TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (firma_id) REFERENCES firmen (id)
    )`);
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_mitarbeiter_user_firma ON mitarbeiter(user_id, firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_mitarbeiter_firma ON mitarbeiter(firma_id)');
    persist();
  } catch (e) {
    console.error('[migratePhase42] mitarbeiter', e);
  }
}

/** Phase 43: CC Intern — Checklisten + Einträge. */
function migratePhase43CcInternChecklisten(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS checklisten (
      id TEXT PRIMARY KEY,
      titel TEXT NOT NULL,
      firma_id TEXT NOT NULL,
      auftrag_id TEXT,
      erstellt_von TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firma_id) REFERENCES firmen (id),
      FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE SET NULL,
      FOREIGN KEY (erstellt_von) REFERENCES users (id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_checklisten_firma ON checklisten (firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_checklisten_auftrag ON checklisten (auftrag_id)');
    db.exec(`CREATE TABLE IF NOT EXISTS checklisten_eintraege (
      id TEXT PRIMARY KEY,
      checkliste_id TEXT NOT NULL,
      text TEXT NOT NULL,
      erledigt INTEGER NOT NULL DEFAULT 0,
      reihenfolge INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (checkliste_id) REFERENCES checklisten (id) ON DELETE CASCADE
    )`);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_checklisten_eintraege_liste ON checklisten_eintraege (checkliste_id, reihenfolge)',
    );
    persist();
  } catch (e) {
    console.error('[migratePhase43] checklisten', e);
  }
}

/** Phase 44: CC Intern — Produktionsaufträge (an ccintern_auftraege gekoppelt). */
function migratePhase44CcInternProduktionAuftraege(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS produktion_auftraege (
      id TEXT PRIMARY KEY,
      auftrag_id TEXT NOT NULL,
      schritt TEXT NOT NULL,
      fortschritt INTEGER NOT NULL DEFAULT 0,
      verantwortlich TEXT,
      notiz TEXT,
      gestartet_am TEXT,
      abgeschlossen_am TEXT,
      firma_id TEXT NOT NULL,
      FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE CASCADE,
      FOREIGN KEY (verantwortlich) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (firma_id) REFERENCES firmen (id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_produktion_auftraege_firma ON produktion_auftraege (firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_produktion_auftraege_auftrag ON produktion_auftraege (auftrag_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_produktion_auftraege_verantwortlich ON produktion_auftraege (verantwortlich)');
    persist();
  } catch (e) {
    console.error('[migratePhase44] produktion_auftraege', e);
  }
}

/** Phase 45: FUSA — Dokument-Metadaten (kein File-Storage). */
function migratePhase45FusaDokumente(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS fusa_dokumente (
      id TEXT PRIMARY KEY,
      auftrag_id TEXT NOT NULL,
      fahrzeug_id TEXT,
      name TEXT NOT NULL,
      typ TEXT NOT NULL,
      url TEXT NOT NULL,
      groesse REAL NOT NULL DEFAULT 0,
      hochgeladen_von TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      project_id TEXT NOT NULL,
      FOREIGN KEY (auftrag_id) REFERENCES auftraege (id) ON DELETE CASCADE,
      FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge (id) ON DELETE SET NULL,
      FOREIGN KEY (hochgeladen_von) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    )`);
    /**
     * Legacy-Schutz für alte fusa_dokumente-Tabellen: fehlende neue Spalten werden nullable ergänzt, damit Alt-DBs starten und Indizes sicher angelegt werden können. Fachliche Datenmigration erfolgt separat.
     */
    if (sqliteTableExists(db, 'fusa_dokumente')) {
      let cols = sqliteTableColumnsSet(db, 'fusa_dokumente');
      /** @type {[string, string][]} feste Whitelist — keine dynamischen Spaltennamen aus Außen */
      const legacyFusaDokumenteScalarAdds = [
        ['auftrag_id', 'TEXT'],
        ['fahrzeug_id', 'TEXT'],
        ['name', 'TEXT'],
        ['typ', 'TEXT'],
        ['url', 'TEXT'],
        ['groesse', 'INTEGER'],
        ['project_id', 'TEXT'],
      ];
      let addedAnyColumn = false;
      for (const [colName, sqlType] of legacyFusaDokumenteScalarAdds) {
        if (!cols.has(colName)) {
          db.run(`ALTER TABLE fusa_dokumente ADD COLUMN ${colName} ${sqlType}`);
          addedAnyColumn = true;
          cols = sqliteTableColumnsSet(db, 'fusa_dokumente');
        }
      }
      if (addedAnyColumn) {
        persist();
      }
      if (cols.has('project_id') && cols.has('auftrag_id')) {
        try {
          db.run(
            `UPDATE fusa_dokumente
             SET project_id = (SELECT a.project_id FROM auftraege a WHERE a.id = fusa_dokumente.auftrag_id)
             WHERE (project_id IS NULL OR TRIM(COALESCE(project_id, '')) = '')
               AND auftrag_id IS NOT NULL AND TRIM(COALESCE(auftrag_id, '')) != ''`,
          );
        } catch {
          /* auftraege.project_id kann in sehr alten Dateien fehlen — Werte bleiben unverändert */
        }
        persist();
      }
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_fusa_dokumente_project ON fusa_dokumente (project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_fusa_dokumente_auftrag ON fusa_dokumente (auftrag_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_fusa_dokumente_fahrzeug ON fusa_dokumente (fahrzeug_id)');
    persist();
  } catch (e) {
    console.error('[migratePhase45] fusa_dokumente', e);
  }
}

/** Phase 46: FUSA — Angebote (Metadaten + angebots_json). */
function migratePhase46FusaAngebote(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS fusa_angebote (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      fusa_kunde_id TEXT NOT NULL,
      titel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'entwurf',
      gueltig_bis TEXT,
      angebots_json TEXT NOT NULL,
      erstellt_von TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (fusa_kunde_id) REFERENCES firmen (id),
      FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_fusa_angebote_project ON fusa_angebote (project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_fusa_angebote_kunde ON fusa_angebote (fusa_kunde_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_fusa_angebote_status ON fusa_angebote (status)');
    persist();
  } catch (e) {
    console.error('[migratePhase46] fusa_angebote', e);
  }
}

function migratePhase41AuftragBrueckenUndKalenderQuelle(db, persist) {
  try {
    const cciCols = sqliteTableColumnsSet(db, 'ccintern_auftraege');
    if (!cciCols.has('fusa_auftrag_id')) {
      db.run('ALTER TABLE ccintern_auftraege ADD COLUMN fusa_auftrag_id TEXT');
    }
    if (!cciCols.has('quelle')) {
      db.run("ALTER TABLE ccintern_auftraege ADD COLUMN quelle TEXT NOT NULL DEFAULT 'manuell'");
    }
  } catch (e) {
    console.error('[migratePhase41] ccintern_auftraege columns', e);
  }
  try {
    const kalCols = sqliteTableColumnsSet(db, 'kalender_termine');
    if (!kalCols.has('quelle')) {
      db.run("ALTER TABLE kalender_termine ADD COLUMN quelle TEXT NOT NULL DEFAULT 'manuell'");
    }
    if (!kalCols.has('fusa_auftrag_id')) {
      db.run('ALTER TABLE kalender_termine ADD COLUMN fusa_auftrag_id TEXT');
    }
    if (kalCols.has('typ')) {
      db.run("UPDATE kalender_termine SET typ = 'allgemein' WHERE typ IS NULL OR TRIM(typ) = ''");
    }
  } catch (e) {
    console.error('[migratePhase41] kalender_termine columns', e);
  }
  persist();
}

/** Phase 33: Urlaubsanträge. */
function migratePhase33UrlaubAntraege(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS urlaub_antraege (
      id TEXT PRIMARY KEY,
      mitarbeiter_id TEXT NOT NULL,
      von TEXT NOT NULL,
      bis TEXT NOT NULL,
      tage REAL NOT NULL,
      typ TEXT NOT NULL DEFAULT 'urlaub',
      status TEXT NOT NULL DEFAULT 'offen',
      bemerkung TEXT,
      entschieden_von TEXT,
      entschieden_am TEXT,
      kalender_termin_id TEXT,
      kalender_termin_ids TEXT,
      firma_id TEXT NOT NULL,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      aktualisiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (mitarbeiter_id) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (entschieden_von) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (kalender_termin_id) REFERENCES kalender_termine (id) ON DELETE SET NULL,
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    )`);
  } catch (e) {
    console.error('[migratePhase33] urlaub_antraege table', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_urlaub_antraege_firma ON urlaub_antraege (firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_urlaub_antraege_mitarbeiter ON urlaub_antraege (mitarbeiter_id)');
  } catch (e) {
    console.error('[migratePhase33] urlaub_antraege indexes', e);
  }
  persist();
}

/** Phase 34: Lager. */
function migratePhase34Lager(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS lager_material (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kategorie TEXT,
      menge REAL NOT NULL DEFAULT 0,
      einheit TEXT NOT NULL,
      mindestbestand REAL NOT NULL DEFAULT 0,
      artikelnummer TEXT,
      lagerort TEXT,
      firma_id TEXT NOT NULL,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      aktualisiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    )`);
  } catch (e) {
    console.error('[migratePhase34] lager_material table', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_lager_material_firma ON lager_material (firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_lager_material_name ON lager_material (name)');
  } catch (e) {
    console.error('[migratePhase34] lager_material indexes', e);
  }
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS lager_buchungen (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL,
      menge REAL NOT NULL,
      typ TEXT NOT NULL,
      mitarbeiter_id TEXT,
      auftrag_id TEXT,
      bemerkung TEXT,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (material_id) REFERENCES lager_material (id) ON DELETE CASCADE,
      FOREIGN KEY (mitarbeiter_id) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE SET NULL
    )`);
  } catch (e) {
    console.error('[migratePhase34] lager_buchungen table', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_lager_buchungen_material ON lager_buchungen (material_id, erstellt_am)');
  } catch (e) {
    console.error('[migratePhase34] lager_buchungen indexes', e);
  }
  persist();
}

/** Phase 56: Lager — eigene Spalte `artikelnummer` (Art.-Nr.), Migration aus `lagerort`-Seed-Marker. */
function migratePhase56LagerMaterialArtikelnummer(db, persist) {
  try {
    const cols = sqliteTableColumnsSet(db, 'lager_material');
    if (!cols.has('artikelnummer')) {
      db.exec('ALTER TABLE lager_material ADD COLUMN artikelnummer TEXT');
      persist();
    }
    const rows = stmtAll(
      db,
      `SELECT id, firma_id, lagerort FROM lager_material WHERE lagerort LIKE '__cc_seed_nr:%'`,
      [],
    );
    for (const r of rows) {
      const lo = String((r && r.lagerort) || '');
      const m = lo.replace(/^__cc_seed_nr:/, '').trim();
      if (!m) continue;
      stmtRun(
        db,
        `UPDATE lager_material SET artikelnummer = CASE WHEN COALESCE(TRIM(artikelnummer), '') = '' THEN ? ELSE artikelnummer END, lagerort = NULL WHERE id = ? AND firma_id = ?`,
        [m, String(r.id), String(r.firma_id)],
      );
    }
    persist();
  } catch (e) {
    console.error('[migratePhase56] lager_material artikelnummer', e);
  }
}

/** Phase 57: Urlaub — JSON-Liste aller Kalender-Termin-IDs (mehrere Kurz-Termine pro Antrag). */
function migratePhase57UrlaubKalenderTerminIds(db, persist) {
  try {
    const cols = sqliteTableColumnsSet(db, 'urlaub_antraege');
    if (!cols.has('kalender_termin_ids')) {
      db.exec('ALTER TABLE urlaub_antraege ADD COLUMN kalender_termin_ids TEXT');
      persist();
    }
  } catch (e) {
    console.error('[migratePhase57] urlaub_antraege kalender_termin_ids', e);
  }
}

/** Phase 58: CC-Intern Auftragsdateien — updated_at für erneuten Upload (gleicher Slot). */
function migratePhase58CcInternAuftragDateiUpdatedAt(db, persist) {
  try {
    const cols = sqliteTableColumnsSet(db, 'ccintern_auftrag_dateien');
    if (!cols.has('updated_at')) {
      db.exec('ALTER TABLE ccintern_auftrag_dateien ADD COLUMN updated_at TEXT');
      db.run('UPDATE ccintern_auftrag_dateien SET updated_at = created_at WHERE updated_at IS NULL');
      persist();
    }
  } catch (e) {
    console.error('[migratePhase58] ccintern_auftrag_dateien.updated_at', e);
  }
}

/** Phase 35: CC Intern Anfragen. */
function migratePhase35CcInternAnfragen(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ccintern_anfragen (
      id TEXT PRIMARY KEY,
      anfragen_nr TEXT NOT NULL UNIQUE,
      kunde_id TEXT,
      betreff TEXT NOT NULL,
      beschreibung TEXT,
      status TEXT NOT NULL DEFAULT 'offen',
      zugewiesen_an TEXT,
      antwort_bis TEXT,
      firma_id TEXT NOT NULL,
      erstellt_von TEXT,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      aktualisiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (kunde_id) REFERENCES firmen (id) ON DELETE SET NULL,
      FOREIGN KEY (zugewiesen_an) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    )`);
  } catch (e) {
    console.error('[migratePhase35] ccintern_anfragen table', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_ccintern_anfragen_firma ON ccintern_anfragen (firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ccintern_anfragen_status ON ccintern_anfragen (status)');
  } catch (e) {
    console.error('[migratePhase35] ccintern_anfragen indexes', e);
  }
  persist();
}

/** Phase 36: Aufgaben. */
function migratePhase36Aufgaben(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS aufgaben (
      id TEXT PRIMARY KEY,
      titel TEXT NOT NULL,
      beschreibung TEXT,
      zugewiesen_an TEXT,
      auftrag_id TEXT,
      faellig_am TEXT,
      status TEXT NOT NULL DEFAULT 'offen',
      prioritaet TEXT NOT NULL DEFAULT 'normal',
      firma_id TEXT NOT NULL,
      erstellt_von TEXT,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      aktualisiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (zugewiesen_an) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE SET NULL,
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
      FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
    )`);
  } catch (e) {
    console.error('[migratePhase36] aufgaben table', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_aufgaben_firma ON aufgaben (firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_aufgaben_status ON aufgaben (status)');
  } catch (e) {
    console.error('[migratePhase36] aufgaben indexes', e);
  }
  persist();
}

/** Phase 37: CC Intern Rechnungen (statusbasiert). */
function migratePhase37CcInternRechnungen(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ccintern_rechnungen (
      id TEXT PRIMARY KEY,
      rechnungsnummer TEXT NOT NULL UNIQUE,
      auftrag_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offen',
      faellig_am TEXT,
      bezahlt_am TEXT,
      bemerkung TEXT,
      firma_id TEXT NOT NULL,
      erstellt_von TEXT,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      aktualisiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE RESTRICT,
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
      FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
    )`);
  } catch (e) {
    console.error('[migratePhase37] ccintern_rechnungen table', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_ccintern_rechnungen_firma ON ccintern_rechnungen (firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ccintern_rechnungen_status ON ccintern_rechnungen (status)');
  } catch (e) {
    console.error('[migratePhase37] ccintern_rechnungen indexes', e);
  }
  persist();
}

/** Phase 47: CC Intern Angebote (project-basiert, Soft-Delete). */
function migratePhase47CcInternAngebote(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ccintern_angebote (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kunde_id TEXT,
      titel TEXT NOT NULL,
      beschreibung TEXT,
      betrag_cent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'offen',
      origin TEXT NOT NULL DEFAULT 'ccintern',
      erstellt_von TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT DEFAULT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (kunde_id) REFERENCES firmen (id) ON DELETE SET NULL,
      FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
    )`);
  } catch (e) {
    console.error('[migratePhase47] ccintern_angebote table', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_ccintern_angebote_project ON ccintern_angebote (project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ccintern_angebote_deleted ON ccintern_angebote (deleted_at)');
  } catch (e) {
    console.error('[migratePhase47] ccintern_angebote indexes', e);
  }
  persist();
}

/** Phase 48: ccintern_anfragen — Soft-Delete-Spalte (nur wenn fehlend). */
function migratePhase48CcInternAnfragenDeletedAt(db, persist) {
  try {
    const cols = new Set(stmtAll(db, 'PRAGMA table_info(ccintern_anfragen)', []).map((r) => String(r.name || '')));
    if (!cols.has('deleted_at')) {
      db.run('ALTER TABLE ccintern_anfragen ADD COLUMN deleted_at TEXT DEFAULT NULL');
    }
  } catch (e) {
    console.error('[migratePhase48] ccintern_anfragen.deleted_at', e);
  }
  persist();
}

/** Phase 49: ccintern_rechnungen — Soft-Delete-Spalte (nur wenn fehlend). */
function migratePhase49CcInternRechnungenDeletedAt(db, persist) {
  try {
    const cols = new Set(stmtAll(db, 'PRAGMA table_info(ccintern_rechnungen)', []).map((r) => String(r.name || '')));
    if (!cols.has('deleted_at')) {
      db.run('ALTER TABLE ccintern_rechnungen ADD COLUMN deleted_at TEXT DEFAULT NULL');
    }
  } catch (e) {
    console.error('[migratePhase49] ccintern_rechnungen.deleted_at', e);
  }
  persist();
}

/** Phase 50: audit_log (Schreib-Audit, ohne FK). */
/** Phase B3: Cockpit Geräte (Hardware). */
function migratePhase51Geraete(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS geraete (
      id TEXT PRIMARY KEY NOT NULL,
      firma_id TEXT NOT NULL,
      project_id TEXT,
      typ TEXT NOT NULL,
      seriennummer TEXT,
      zugewiesen_an_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'aktiv',
      notiz TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL,
      FOREIGN KEY (zugewiesen_an_user_id) REFERENCES users (id) ON DELETE SET NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_geraete_firma ON geraete(firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_geraete_project ON geraete(project_id)');
    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_geraete_seriennummer ON geraete(seriennummer) WHERE seriennummer IS NOT NULL AND LENGTH(TRIM(seriennummer)) > 0',
    );
  } catch (e) {
    console.error('[migratePhase51] geraete', e);
  }
  persist();
}

/** Phase B5: CRM (CC Intern — Pipeline, Aktivitäten, Wiedervorlage). */
function migratePhase52Crm(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
      id TEXT PRIMARY KEY NOT NULL,
      firma_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_pipeline_firma ON crm_pipeline_stages(firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_pipeline_sort ON crm_pipeline_stages(firma_id, sort_order)');

    db.exec(`CREATE TABLE IF NOT EXISTS crm_aktivitaeten (
      id TEXT PRIMARY KEY NOT NULL,
      firma_id TEXT NOT NULL,
      kunde_id TEXT NOT NULL,
      typ TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      user_id TEXT,
      datum TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
      FOREIGN KEY (kunde_id) REFERENCES firmen (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_akt_firma ON crm_aktivitaeten(firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_akt_kunde ON crm_aktivitaeten(firma_id, kunde_id)');

    db.exec(`CREATE TABLE IF NOT EXISTS crm_wiedervorlage (
      id TEXT PRIMARY KEY NOT NULL,
      firma_id TEXT NOT NULL,
      kunde_id TEXT NOT NULL,
      titel TEXT NOT NULL DEFAULT '',
      datum TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offen',
      user_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
      FOREIGN KEY (kunde_id) REFERENCES firmen (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_wv_firma ON crm_wiedervorlage(firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_wv_kunde ON crm_wiedervorlage(firma_id, kunde_id)');
  } catch (e) {
    console.error('[migratePhase52] crm', e);
  }
  persist();
}

/** Phase B6: Refresh-Token + Mitarbeiter-Zeiterfassung (CC Intern Mobile). */
function migratePhase53B6RefreshUndMitarbeiterZeiten(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      device_id TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at)');

    db.exec(`CREATE TABLE IF NOT EXISTS ccintern_mitarbeiter_zeiten (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      firma_id TEXT NOT NULL,
      ccintern_auftrag_id TEXT NOT NULL,
      minuten INTEGER NOT NULL,
      notiz TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
      FOREIGN KEY (ccintern_auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_cc_me_zeiten_user ON ccintern_mitarbeiter_zeiten(user_id, created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cc_me_zeiten_auftrag ON ccintern_mitarbeiter_zeiten(ccintern_auftrag_id)');
  } catch (e) {
    console.error('[migratePhase53B6] refresh/zeiten', e);
  }
  persist();
}

/** CC Intern: Tages-Quick-Status + Anwesenheit (API-persistiert). */
function migratePhase54CcInternMitarbeiterOperativ(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ccintern_mitarbeiter_status (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      user_id TEXT NOT NULL,
      firma_id TEXT NOT NULL,
      status TEXT NOT NULL,
      datum TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    )`);
    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_ma_stat_firma_user_datum ON ccintern_mitarbeiter_status(firma_id, user_id, datum)',
    );

    db.exec(`CREATE TABLE IF NOT EXISTS ccintern_mitarbeiter_anwesenheit (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      user_id TEXT NOT NULL,
      firma_id TEXT NOT NULL,
      datum TEXT NOT NULL,
      start TEXT,
      ende TEXT,
      pause_minuten INTEGER NOT NULL DEFAULT 0,
      dauer_minuten INTEGER,
      typ TEXT NOT NULL DEFAULT 'anwesenheit',
      notiz TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    )`);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_cc_ma_anw_firma_user_datum ON ccintern_mitarbeiter_anwesenheit(firma_id, user_id, datum)',
    );
  } catch (e) {
    console.error('[migratePhase54] mitarbeiter operativ', e);
  }
  persist();
}

/**
 * Nutzer mit Cockpit oder CC-Intern, aber ohne FUSA-Modul: Modul `fusa` + volle FUSA-Berechtigungen.
 * Behebt 403 auf GET /api/v1/fusa/dashboard (requireDashboardModule) und fehlende requireRight-Pfade.
 */
function migratePhase55EnsureFusaModuleForCollaboratorUsers(db, persist) {
  try {
    const rows = stmtAll(
      db,
      `SELECT DISTINCT u.id AS uid FROM users u
       WHERE EXISTS (
         SELECT 1 FROM user_modules um WHERE um.user_id = u.id AND um.module IN ('cockpit','ccintern')
       )
       AND NOT EXISTS (
         SELECT 1 FROM user_modules um2 WHERE um2.user_id = u.id AND um2.module = 'fusa'
       )`,
      [],
    );
    const fj = rightsJsonFullForModule('fusa');
    for (const r of rows) {
      const uid = String(r.uid);
      stmtRun(db, 'INSERT OR IGNORE INTO user_modules (user_id, module) VALUES (?, ?)', [uid, 'fusa']);
      for (const b of bereicheForModule('fusa')) {
        stmtRun(
          db,
          'INSERT OR REPLACE INTO user_rights (user_id, module, bereich, rechte_json) VALUES (?, ?, ?, ?)',
          [uid, 'fusa', b, fj],
        );
      }
    }
  } catch (e) {
    console.error('[migratePhase55] FUSA-Modul für bestehende Nutzer', e);
  }
  persist();
}

function migratePhase50AuditLog(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY NOT NULL,
      ts TEXT NOT NULL,
      user_id TEXT,
      modul TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      project_id TEXT,
      payload_json TEXT
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_project ON audit_log(project_id)');
  } catch (e) {
    console.error('[migratePhase50] audit_log', e);
  }
  persist();
}

/** Phase 38: MesseFlow Projekte + Wände + Dateien. */
function migratePhase38MesseflowProjekte(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS messeflow_projekte (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kunde TEXT,
      agentur_id TEXT,
      lieferdatum TEXT,
      status TEXT NOT NULL DEFAULT 'neu',
      messe TEXT,
      stand TEXT,
      prioritaet TEXT,
      bemerkung TEXT,
      firma_id TEXT NOT NULL,
      erstellt_von TEXT,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      aktualisiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agentur_id) REFERENCES firmen (id) ON DELETE SET NULL,
      FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
      FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS messeflow_waende (
      id TEXT PRIMARY KEY,
      projekt_id TEXT NOT NULL,
      name TEXT NOT NULL,
      breite REAL,
      hoehe REAL,
      einheit TEXT,
      material TEXT,
      status TEXT,
      bemerkung TEXT,
      sort_index INTEGER NOT NULL DEFAULT 0,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      aktualisiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (projekt_id) REFERENCES messeflow_projekte (id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS messeflow_wand_dateien (
      id TEXT PRIMARY KEY,
      wand_id TEXT NOT NULL,
      name TEXT NOT NULL,
      pfad TEXT,
      mime_type TEXT,
      groesse INTEGER,
      status TEXT,
      bemerkung TEXT,
      meta_json TEXT,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      aktualisiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (wand_id) REFERENCES messeflow_waende (id) ON DELETE CASCADE
    )`);
  } catch (e) {
    console.error('[migratePhase38] messeflow tables', e);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_messeflow_projekte_firma ON messeflow_projekte (firma_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_messeflow_projekte_status ON messeflow_projekte (status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_messeflow_waende_projekt ON messeflow_waende (projekt_id, sort_index)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_messeflow_wand_dateien_wand ON messeflow_wand_dateien (wand_id, erstellt_am)');
  } catch (e) {
    console.error('[migratePhase38] messeflow indexes', e);
  }
  persist();
}

/** Phase 39: strukturierte MesseFlow Domänen-Tabellen (mf_*). */
function migratePhase39MesseflowDomain(db, persist) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS mf_projekte (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'aktiv',
      verantwortlicher TEXT,
      messe_name TEXT,
      messe_datum_von TEXT,
      messe_datum_bis TEXT,
      ort TEXT,
      notizen TEXT,
      extra_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS mf_projekt_users (
      projekt_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rolle TEXT NOT NULL DEFAULT 'mitarbeiter',
      PRIMARY KEY (projekt_id, user_id),
      FOREIGN KEY (projekt_id) REFERENCES mf_projekte (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS mf_aufgaben (
      id TEXT PRIMARY KEY,
      projekt_id TEXT NOT NULL,
      titel TEXT NOT NULL DEFAULT '',
      beschreibung TEXT,
      status TEXT NOT NULL DEFAULT 'offen',
      prioritaet TEXT DEFAULT 'normal',
      faellig_am TEXT,
      zugewiesen_an TEXT,
      extra_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (projekt_id) REFERENCES mf_projekte (id) ON DELETE CASCADE,
      FOREIGN KEY (zugewiesen_an) REFERENCES users (id) ON DELETE SET NULL
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS mf_dokumente (
      id TEXT PRIMARY KEY,
      projekt_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      typ TEXT,
      url TEXT,
      pruef_status TEXT DEFAULT 'ausstehend',
      pruef_ergebnis_json TEXT,
      uploaded_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (projekt_id) REFERENCES mf_projekte (id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_mf_projekte_created ON mf_projekte (created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_mf_aufgaben_projekt ON mf_aufgaben (projekt_id, created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_mf_dokumente_projekt ON mf_dokumente (projekt_id, created_at)');
  } catch (e) {
    console.error('[migratePhase39] mf_* tables', e);
  }
  persist();
}

/** CC Intern: Sollstunden/Monat + Urlaubstage pro Benutzer (Mitarbeiter-Einstellungen). */
function migratePhase40UsersSollUrlaub(db, persist) {
  try {
    const info = stmtAll(db, 'PRAGMA table_info(users)', []);
    const names = new Set(info.map((r) => String(r.name || '')));
    if (!names.has('soll')) {
      db.run('ALTER TABLE users ADD COLUMN soll INTEGER NOT NULL DEFAULT 160');
    }
    if (!names.has('urlaub')) {
      db.run('ALTER TABLE users ADD COLUMN urlaub INTEGER NOT NULL DEFAULT 28');
    }
  } catch (e) {
    console.error('[migratePhase40] users.soll/urlaub', e);
  }
  persist();
}

async function buildSqliteStore() {
  fs.mkdirSync(sqliteDataDir, { recursive: true });
  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  const persist = () => {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  };

  /** Vor `db.exec(schema)`: Legacy-Tabellen ohne project_id sonst Index-Fehler. */
  migrateSqlitePreSchemaProjectId(db, persist);
  migrateSqlitePreSchemaFusaBelegungenColumns(db, persist);
  migrateSqlitePreSchemaFirmaIdColumns(db, persist);

  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  db.run('PRAGMA foreign_keys = ON');

  migratePhase14WerkstattUndFotos(db, persist);
  migratePhase16KundenUndProjektKunde(db, persist);
  migratePhase17Angebote(db, persist);
  migratePhase18FahrzeugDetailsJson(db, persist);
  migratePhase19GlobalRights(db, persist);
  migratePhase20RoleTemplates(db, persist);
  migratePhase21CcinternMitarbeiterappSlug(db, persist);
  migratePhase22FirmenUndCockpitInvites(db, persist);
  migratePhase23UserStatus(db, persist);
  migratePhase24ProjectsDeadline(db, persist);
  migratePhase25AuftraegeTerminEnde(db, persist);
  migratePhase26AuftraegeFusaColumns(db, persist);
  migratePhase27FusaBelegungen(db, persist);
  migratePhase28SchadenExtraJson(db, persist);
  migratePhase29FusaRechnungen(db, persist);
  migratePhase30MesseflowWorkspace(db, persist);
  migratePhase31CcInternAuftraege(db, persist);
  migratePhase32KalenderTermine(db, persist);
  migratePhase33UrlaubAntraege(db, persist);
  migratePhase34Lager(db, persist);
  migratePhase35CcInternAnfragen(db, persist);
  migratePhase36Aufgaben(db, persist);
  migratePhase37CcInternRechnungen(db, persist);
  migratePhase38MesseflowProjekte(db, persist);
  migratePhase39MesseflowDomain(db, persist);
  migratePhase40UsersSollUrlaub(db, persist);
  migratePhase41AuftragBrueckenUndKalenderQuelle(db, persist);
  migratePhase42CcInternMitarbeiter(db, persist);
  migratePhase43CcInternChecklisten(db, persist);
  migratePhase44CcInternProduktionAuftraege(db, persist);
  migratePhase45FusaDokumente(db, persist);
  migratePhase46FusaAngebote(db, persist);
  migratePhase47CcInternAngebote(db, persist);
  migratePhase48CcInternAnfragenDeletedAt(db, persist);
  migratePhase49CcInternRechnungenDeletedAt(db, persist);
  migratePhase50AuditLog(db, persist);
  migratePhase51Geraete(db, persist);
  migratePhase52Crm(db, persist);
  migratePhase53B6RefreshUndMitarbeiterZeiten(db, persist);
  migratePhase54CcInternMitarbeiterOperativ(db, persist);
  migratePhase55EnsureFusaModuleForCollaboratorUsers(db, persist);
  migratePhase56LagerMaterialArtikelnummer(db, persist);
  migratePhase57UrlaubKalenderTerminIds(db, persist);
  migratePhase58CcInternAuftragDateiUpdatedAt(db, persist);

  return {
    db,
    persist,
    getUserByEmail(email) {
      return stmtGet(
        db,
        'SELECT id, email, password_hash, name, global_role, created_at FROM users WHERE email = ? COLLATE NOCASE LIMIT 1',
        [email],
      );
    },
    getUserById(id) {
      return stmtGet(
        db,
        'SELECT id, email, name, global_role, company_id, status, soll, urlaub, created_at FROM users WHERE id = ? LIMIT 1',
        [id],
      );
    },
    insertUser({ id, email, passwordHash, name, globalRole, soll, urlaub }) {
      const gr =
        globalRole === 'SUPER_ADMIN' || globalRole === 'INTERN' || globalRole === 'EXTERN'
          ? globalRole
          : 'INTERN';
      let sollN = 160;
      if (soll != null && Number.isFinite(Number(soll))) {
        const s = Math.round(Number(soll));
        if (s >= 0 && s <= 400) sollN = s;
      }
      let urlaubN = 28;
      if (urlaub != null && Number.isFinite(Number(urlaub))) {
        const u = Math.round(Number(urlaub));
        if (u >= 0 && u <= 365) urlaubN = u;
      }
      stmtRun(
        db,
        'INSERT INTO users (id, email, password_hash, name, global_role, soll, urlaub) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, email, passwordHash, name, gr, sollN, urlaubN],
      );
      persist();
    },
    userExistsByEmail(email) {
      const row = stmtGet(
        db,
        'SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1',
        [email],
      );
      return row != null;
    },
    listUsers() {
      return stmtAll(
        db,
        `SELECT u.id, u.email, u.name, u.global_role, u.company_id, u.status, u.soll, u.urlaub, u.created_at,
            m.position AS kuerzel,
            IFNULL((SELECT GROUP_CONCAT(um.module) FROM user_modules um WHERE um.user_id = u.id), '') AS modules_csv
         FROM users u
         LEFT JOIN mitarbeiter m ON m.user_id = u.id
         ORDER BY datetime(u.created_at) ASC`,
        [],
      );
    },
    updateUserStatus(userId, status) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const st = status === 'deaktiviert' ? 'deaktiviert' : 'aktiv';
      if (!uid) return false;
      stmtRun(db, 'UPDATE users SET status = ? WHERE id = ?', [st, uid]);
      persist();
      return true;
    },
    updateUserPasswordHash(userId, passwordHash) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid || typeof passwordHash !== 'string' || !passwordHash) return false;
      stmtRun(db, 'UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, uid]);
      persist();
      return true;
    },
    updateUserCompany(userId, companyId) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid) return false;
      const cid = typeof companyId === 'string' && companyId.trim() ? companyId.trim() : null;
      stmtRun(db, 'UPDATE users SET company_id = ? WHERE id = ?', [cid, uid]);
      persist();
      return true;
    },
    /**
     * @param {string} userId
     * @param {{ name?: string|null, global_role?: string, status?: string, soll?: number, urlaub?: number }} patch
     */
    updateUserProfile(userId, patch) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid || !patch || typeof patch !== 'object') return null;
      const row = this.getUserById(uid);
      if (!row) return null;
      let name = row.name;
      let globalRole = row.global_role || 'INTERN';
      let status = row.status != null ? String(row.status) : 'aktiv';
      let soll = row.soll != null ? Math.round(Number(row.soll)) : 160;
      if (!Number.isFinite(soll) || soll < 0) soll = 160;
      if (soll > 400) soll = 400;
      let urlaub = row.urlaub != null ? Math.round(Number(row.urlaub)) : 28;
      if (!Number.isFinite(urlaub) || urlaub < 0) urlaub = 28;
      if (urlaub > 365) urlaub = 365;
      if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
        const raw = patch.name;
        name = raw == null || String(raw).trim() === '' ? null : String(raw).trim();
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'global_role')) {
        const g = String(patch.global_role || '').trim();
        if (g === 'SUPER_ADMIN' || g === 'EXTERN' || g === 'INTERN') globalRole = g;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
        status = patch.status === 'deaktiviert' ? 'deaktiviert' : 'aktiv';
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'soll')) {
        const s = Math.round(Number(patch.soll));
        if (Number.isFinite(s) && s >= 0 && s <= 400) soll = s;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'urlaub')) {
        const u = Math.round(Number(patch.urlaub));
        if (Number.isFinite(u) && u >= 0 && u <= 365) urlaub = u;
      }
      stmtRun(db, 'UPDATE users SET name = ?, global_role = ?, status = ?, soll = ?, urlaub = ? WHERE id = ?', [
        name,
        globalRole,
        status,
        soll,
        urlaub,
        uid,
      ]);
      persist();
      return this.getUserById(uid);
    },
    deleteUserById(userId) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid) return false;
      stmtRun(db, 'DELETE FROM users WHERE id = ?', [uid]);
      persist();
      return true;
    },
    listRoleTemplates() {
      return stmtAll(
        db,
        'SELECT id, name, description, modules_json, rights_json, created_at FROM role_templates ORDER BY datetime(created_at) DESC',
        [],
      );
    },
    getRoleTemplateById(id) {
      if (typeof id !== 'string' || !id.trim()) return null;
      return stmtGet(
        db,
        'SELECT id, name, description, modules_json, rights_json, created_at FROM role_templates WHERE id = ? LIMIT 1',
        [id.trim()],
      );
    },
    insertRoleTemplate({ id, name, description, modules, rights }) {
      const tid = typeof id === 'string' && id.trim() ? id.trim() : '';
      if (!tid) throw new Error('insertRoleTemplate: id fehlt');
      const mods = JSON.stringify(Array.isArray(modules) ? modules : []);
      const rj = JSON.stringify(rights && typeof rights === 'object' ? rights : {});
      stmtRun(db, 'INSERT INTO role_templates (id, name, description, modules_json, rights_json) VALUES (?, ?, ?, ?, ?)', [
        tid,
        String(name || '').trim() || 'Vorlage',
        description != null ? String(description) : '',
        mods,
        rj,
      ]);
      persist();
    },
    deleteRoleTemplate(id) {
      if (typeof id !== 'string' || !id.trim()) return;
      stmtRun(db, 'DELETE FROM role_templates WHERE id = ?', [id.trim()]);
      persist();
    },
    listUserModules(userId) {
      if (typeof userId !== 'string' || !userId.trim()) return [];
      return stmtAll(db, 'SELECT module FROM user_modules WHERE user_id = ? ORDER BY module', [
        userId.trim(),
      ]);
    },
    listUserRights(userId) {
      if (typeof userId !== 'string' || !userId.trim()) return [];
      return stmtAll(
        db,
        'SELECT module, bereich, rechte_json FROM user_rights WHERE user_id = ? ORDER BY module, bereich',
        [userId.trim()],
      );
    },
    ensureUserModule(userId, module) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const mod = typeof module === 'string' ? module.trim() : '';
      if (!uid || !mod) return;
      stmtRun(db, 'INSERT OR IGNORE INTO user_modules (user_id, module) VALUES (?, ?)', [uid, mod]);
      persist();
    },
    /**
     * Eine Rechte-Zeile setzen (kein Löschen anderer Zeilen).
     * @param {string} userId
     * @param {'cockpit'|'fusa'|'ccintern'} module
     * @param {string} bereich
     * @param {unknown} rights Roh-Flags oder Objekt für {@link normalizeRightsJson}
     */
    upsertUserRight(userId, module, bereich, rights) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const mod = typeof module === 'string' ? module.trim() : '';
      const ber = typeof bereich === 'string' ? bereich.trim() : '';
      if (!uid || !mod || !ber) return;
      const flags = normalizeRightsJson(rights);
      stmtRun(db, 'INSERT OR REPLACE INTO user_rights (user_id, module, bereich, rechte_json) VALUES (?, ?, ?, ?)', [
        uid,
        mod,
        ber,
        JSON.stringify(flags),
      ]);
      persist();
    },
    replaceUserAccessBundle({ userId, globalRole, modules, rights }) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid) throw new Error('replaceUserAccessBundle: userId fehlt');
      const gr =
        globalRole === 'SUPER_ADMIN' || globalRole === 'INTERN' || globalRole === 'EXTERN'
          ? globalRole
          : 'INTERN';
      db.run('BEGIN');
      try {
        stmtRun(db, 'UPDATE users SET global_role = ? WHERE id = ?', [gr, uid]);
        stmtRun(db, 'DELETE FROM user_modules WHERE user_id = ?', [uid]);
        stmtRun(db, 'DELETE FROM user_rights WHERE user_id = ?', [uid]);
        const modList = Array.isArray(modules) ? modules : [];
        for (const m of modList) {
          if (typeof m !== 'string' || !m.trim()) continue;
          stmtRun(db, 'INSERT INTO user_modules (user_id, module) VALUES (?, ?)', [uid, m.trim()]);
        }
        if (rights && typeof rights === 'object') {
          for (const mod of Object.keys(rights)) {
            const bereiche = /** @type {Record<string, unknown>} */ (rights)[mod];
            if (!bereiche || typeof bereiche !== 'object') continue;
            for (const b of Object.keys(bereiche)) {
              const flags = normalizeRightsJson(
                /** @type {Record<string, unknown>} */ (bereiche)[b],
              );
              stmtRun(
                db,
                'INSERT OR REPLACE INTO user_rights (user_id, module, bereich, rechte_json) VALUES (?, ?, ?, ?)',
                [uid, mod, b, JSON.stringify(flags)],
              );
            }
          }
        }
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
      persist();
    },
    listProjects() {
      return stmtAll(
        db,
        `SELECT p.id, p.name, p.kunden_id, p.deadline, p.created_at,
                k.name AS kunde_name, k.ansprechpartner AS kunde_ansprechpartner
         FROM projects p
         LEFT JOIN kunden k ON k.id = p.kunden_id
         ORDER BY datetime(p.created_at) DESC`,
        [],
      );
    },
    listProjectsForUser(_userId) {
      return stmtAll(
        db,
        `SELECT p.id, p.name, p.kunden_id, p.deadline, p.created_at,
                k.name AS kunde_name, k.ansprechpartner AS kunde_ansprechpartner
         FROM projects p
         LEFT JOIN kunden k ON k.id = p.kunden_id
         ORDER BY datetime(p.created_at) DESC`,
        [],
      );
    },
    getProjectById(id) {
      return stmtGet(
        db,
        `SELECT p.id, p.name, p.kunden_id, p.deadline, p.created_at,
                k.name AS kunde_name, k.ansprechpartner AS kunde_ansprechpartner
         FROM projects p
         LEFT JOIN kunden k ON k.id = p.kunden_id
         WHERE p.id = ? LIMIT 1`,
        [id],
      );
    },
    insertProject({ id, name, kundenId }) {
      stmtRun(db, 'INSERT INTO projects (id, name, kunden_id) VALUES (?, ?, ?)', [
        id,
        name,
        kundenId != null && String(kundenId).trim() ? String(kundenId).trim() : null,
      ]);
      persist();
    },
    /**
     * Projekt anlegen + sofort admin-Zugriff für Ersteller (transaktional).
     */
    createProjectWithOwnerAccess({ projectId, name, userId, kundenId }) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid) throw new Error('createProjectWithOwnerAccess: userId fehlt');
      const kid =
        kundenId != null && String(kundenId).trim() !== '' ? String(kundenId).trim() : null;
      if (kid) {
        const kr = stmtGet(db, 'SELECT id FROM kunden WHERE id = ? LIMIT 1', [kid]);
        if (!kr) throw new Error('createProjectWithOwnerAccess: Kunde nicht gefunden');
      }
      stmtRun(db, 'INSERT INTO projects (id, name, kunden_id) VALUES (?, ?, ?)', [
        projectId,
        name,
        kid,
      ]);
      persist();
    },
    updateProject(projectId, patch) {
      const row = stmtGet(
        db,
        'SELECT id, name, kunden_id, deadline FROM projects WHERE id = ? LIMIT 1',
        [projectId],
      );
      if (!row) return null;
      let nextName = row.name;
      if (patch.name !== undefined) {
        if (typeof patch.name !== 'string' || !patch.name.trim()) {
          return { error: 'INVALID_NAME' };
        }
        nextName = patch.name.trim();
      }
      let nextKundenId = row.kunden_id;
      if (Object.prototype.hasOwnProperty.call(patch, 'kunden_id')) {
        const v = patch.kunden_id;
        if (v == null || v === '') {
          nextKundenId = null;
        } else if (typeof v === 'string' && v.trim()) {
          const krow = stmtGet(db, 'SELECT id FROM kunden WHERE id = ? LIMIT 1', [v.trim()]);
          if (!krow) return { error: 'KUNDE_NOT_FOUND' };
          nextKundenId = v.trim();
        } else {
          return { error: 'INVALID_KUNDEN_ID' };
        }
      }
      let nextDeadline = row.deadline;
      if (Object.prototype.hasOwnProperty.call(patch, 'deadline')) {
        const v = patch.deadline;
        if (v == null || v === '') {
          nextDeadline = null;
        } else if (typeof v === 'string' && v.trim()) {
          const d = new Date(v.trim());
          if (Number.isNaN(d.getTime())) {
            return { error: 'INVALID_DEADLINE' };
          }
          nextDeadline = v.trim();
        } else {
          return { error: 'INVALID_DEADLINE' };
        }
      }
      stmtRun(db, 'UPDATE projects SET name = ?, kunden_id = ?, deadline = ? WHERE id = ?', [
        nextName,
        nextKundenId,
        nextDeadline,
        projectId,
      ]);
      persist();
      return stmtGet(
        db,
        `SELECT p.id, p.name, p.kunden_id, p.deadline, p.created_at,
                k.name AS kunde_name, k.ansprechpartner AS kunde_ansprechpartner
         FROM projects p
         LEFT JOIN kunden k ON k.id = p.kunden_id
         WHERE p.id = ? LIMIT 1`,
        [projectId],
      );
    },
    listProjectAccessWithUsers(projectId) {
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!pid) return [];
      return stmtAll(
        db,
        `SELECT a.id, a.user_id, a.project_id, a.role, a.can_view_prices, a.can_edit, a.can_create_auftraege, a.created_at,
                u.email AS user_email, u.name AS user_name
         FROM project_access a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.project_id = ?
         ORDER BY datetime(a.created_at) DESC`,
        [pid],
      );
    },
    getProjectAccessByUserAndProject(userId, projectId) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!uid || !pid) return null;
      return stmtGet(
        db,
        `SELECT id, user_id, project_id, role, can_view_prices, can_edit, can_create_auftraege, created_at
         FROM project_access
         WHERE user_id = ? AND project_id = ?
         LIMIT 1`,
        [uid, pid],
      );
    },
    insertProjectAccess({ id, userId, projectId, role, canViewPrices, canEdit, canCreateAuftraege }) {
      stmtRun(
        db,
        `INSERT INTO project_access (id, user_id, project_id, role, can_view_prices, can_edit, can_create_auftraege)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          projectId,
          role,
          canViewPrices ? 1 : 0,
          canEdit ? 1 : 0,
          canCreateAuftraege ? 1 : 0,
        ],
      );
      persist();
    },
    getProjectAccessByIdAndProject(accessId, projectId) {
      const aid = typeof accessId === 'string' ? accessId.trim() : '';
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!aid || !pid) return null;
      return stmtGet(
        db,
        `SELECT a.id, a.user_id, a.project_id, a.role, a.can_view_prices, a.can_edit, a.can_create_auftraege, a.created_at,
                u.email AS user_email, u.name AS user_name
         FROM project_access a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.id = ? AND a.project_id = ?
         LIMIT 1`,
        [aid, pid],
      );
    },
    updateProjectAccess(accessId, projectId, patch) {
      const cur = this.getProjectAccessByIdAndProject(accessId, projectId);
      if (!cur) return null;
      const next = {
        ...cur,
        ...patch,
      };
      stmtRun(
        db,
        `UPDATE project_access
         SET role = ?, can_view_prices = ?, can_edit = ?, can_create_auftraege = ?
         WHERE id = ? AND project_id = ?`,
        [
          next.role,
          next.can_view_prices ? 1 : 0,
          next.can_edit ? 1 : 0,
          next.can_create_auftraege ? 1 : 0,
          String(accessId).trim(),
          String(projectId).trim(),
        ],
      );
      persist();
      return this.getProjectAccessByIdAndProject(accessId, projectId);
    },
    deleteProjectAccess(accessId, projectId) {
      stmtRun(db, 'DELETE FROM project_access WHERE id = ? AND project_id = ?', [
        String(accessId || '').trim(),
        String(projectId || '').trim(),
      ]);
      persist();
    },
    listProjectInvites(projectId) {
      const pid = String(projectId || '').trim();
      if (!pid) return [];
      return stmtAll(db, 'SELECT * FROM project_invites WHERE project_id = ? ORDER BY datetime(created_at) DESC', [pid]);
    },
    insertProjectInvite({
      id,
      projectId,
      email,
      role,
      canViewPrices,
      canEdit,
      canCreateAuftraege,
      token,
      expiresAtIso,
      createdByUserId,
    }) {
      stmtRun(
        db,
        `INSERT INTO project_invites (id, project_id, email, role, can_view_prices, can_edit, can_create_auftraege, token, status, expires_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          id,
          projectId,
          String(email || '').trim().toLowerCase(),
          role,
          canViewPrices ? 1 : 0,
          canEdit ? 1 : 0,
          canCreateAuftraege ? 1 : 0,
          token,
          expiresAtIso,
          createdByUserId || null,
        ],
      );
      persist();
    },
    getProjectInviteByToken(token) {
      const t = String(token || '').trim();
      if (!t) return null;
      return stmtGet(db, 'SELECT * FROM project_invites WHERE token = ? LIMIT 1', [t]);
    },
    getProjectInviteByIdAndProject(inviteId, projectId) {
      return stmtGet(db, 'SELECT * FROM project_invites WHERE id = ? AND project_id = ? LIMIT 1', [
        inviteId,
        projectId,
      ]);
    },
    getPendingProjectInviteByProjectAndEmail(projectId, email) {
      return stmtGet(
        db,
        `SELECT * FROM project_invites WHERE project_id = ? AND LOWER(email) = ? AND status = 'pending' LIMIT 1`,
        [projectId, String(email || '').trim().toLowerCase()],
      );
    },
    updateProjectInviteStatus(inviteId, projectId, status) {
      stmtRun(db, 'UPDATE project_invites SET status = ? WHERE id = ? AND project_id = ?', [
        status,
        inviteId,
        projectId,
      ]);
      persist();
    },
    updateProjectInviteExpiry(inviteId, projectId, expiresAtIso) {
      stmtRun(db, 'UPDATE project_invites SET expires_at = ? WHERE id = ? AND project_id = ?', [
        expiresAtIso,
        inviteId,
        projectId,
      ]);
      persist();
    },
    deleteProjectInviteIfPending(inviteId, projectId) {
      const cur = stmtGet(
        db,
        `SELECT id FROM project_invites WHERE id = ? AND project_id = ? AND status = 'pending' LIMIT 1`,
        [inviteId, projectId],
      );
      if (!cur) return false;
      stmtRun(db, `DELETE FROM project_invites WHERE id = ? AND project_id = ? AND status = 'pending'`, [
        inviteId,
        projectId,
      ]);
      persist();
      return true;
    },
    /**
     * @param {string} firmaId
     * @returns {string|null}
     */
    assignSystemKundennummerIfMissing(firmaId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return null;
      const cur = this.getFirmaById(fid);
      if (!cur) return null;
      const existing = cur.kundennummer != null ? String(cur.kundennummer).trim() : '';
      if (existing !== '') return existing;
      const year = new Date().getFullYear();
      for (let attempt = 0; attempt < 64; attempt += 1) {
        const rows = stmtAll(db, 'SELECT kundennummer FROM firmen WHERE kundennummer LIKE ?', [
          `KD-${year}-%`,
        ]);
        const candidate = computeNextSystemKundennummer(
          year,
          rows.map(r => r.kundennummer),
        );
        try {
          stmtRun(
            db,
            `UPDATE firmen SET kundennummer = ? WHERE id = ? AND (kundennummer IS NULL OR TRIM(kundennummer) = '')`,
            [candidate, fid],
          );
          persist();
          const check = this.getFirmaById(fid);
          const got = check?.kundennummer != null ? String(check.kundennummer).trim() : '';
          if (got === candidate) return candidate;
          if (got !== '') return got;
        } catch (e) {
          if (isUniqueConstraintError(e)) continue;
          throw e;
        }
      }
      throw new Error('assignSystemKundennummerIfMissing: keine freie Nummer zugeteilt');
    },
    listFirmen() {
      return stmtAll(
        db,
        `SELECT f.id, f.name, f.kundennummer, f.altnummer, f.typ, f.intern_extern, f.umsatzsteuer_id,
                f.strasse, f.plz, f.stadt, f.land, f.telefon, f.email, f.website,
                f.ansprechpartner_anrede, f.ansprechpartner_vorname, f.ansprechpartner_nachname,
                f.ansprechpartner_email, f.ansprechpartner_telefon, f.interne_notiz, f.status, f.erweiterung_json, f.created_at
         FROM firmen f ORDER BY f.name COLLATE NOCASE ASC`,
        [],
      );
    },
    getFirmaById(id) {
      const fid = typeof id === 'string' ? id.trim() : '';
      if (!fid) return null;
      return stmtGet(
        db,
        `SELECT f.id, f.name, f.kundennummer, f.altnummer, f.typ, f.intern_extern, f.umsatzsteuer_id,
                f.strasse, f.plz, f.stadt, f.land, f.telefon, f.email, f.website,
                f.ansprechpartner_anrede, f.ansprechpartner_vorname, f.ansprechpartner_nachname,
                f.ansprechpartner_email, f.ansprechpartner_telefon, f.interne_notiz, f.status, f.erweiterung_json, f.created_at
         FROM firmen f
         WHERE f.id = ? LIMIT 1`,
        [fid],
      );
    },
    getFirmaKundeStammById(id) {
      return getFirmaKundeStammByIdSqlite(stmtGet, db, id);
    },
    insertFirma(p) {
      const id = p.id != null ? String(p.id).trim() : '';
      if (!id) throw new Error('insertFirma: id fehlt');
      stmtRun(
        db,
        `INSERT INTO firmen (id, name, kundennummer, altnummer, typ, intern_extern, umsatzsteuer_id, strasse, plz, stadt, land,
                telefon, email, website, ansprechpartner_anrede, ansprechpartner_vorname, ansprechpartner_nachname,
                ansprechpartner_email, ansprechpartner_telefon, interne_notiz, status, erweiterung_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          String(p.name || '').trim(),
          p.kundennummer ?? null,
          p.altnummer ?? null,
          p.typ ?? null,
          p.internExtern ?? null,
          p.umsatzsteuerId ?? null,
          p.strasse ?? null,
          p.plz ?? null,
          p.stadt ?? null,
          p.land ?? 'Deutschland',
          p.telefon ?? null,
          p.email ?? null,
          p.website ?? null,
          p.ansprechpartnerAnrede ?? null,
          p.ansprechpartnerVorname ?? null,
          p.ansprechpartnerNachname ?? null,
          p.ansprechpartnerEmail ?? null,
          p.ansprechpartnerTelefon ?? null,
          p.interneNotiz ?? null,
          p.status ?? null,
          p.erweiterungJson != null ? String(p.erweiterungJson) : null,
        ],
      );
      persist();
      return this.getFirmaById(id);
    },
    updateFirmaById(firmaId, patch) {
      const fid = String(firmaId || '').trim();
      if (!fid) return null;
      const row = this.getFirmaById(fid);
      if (!row) return null;
      const next = { ...row, ...patch };
      stmtRun(
        db,
        `UPDATE firmen SET name = ?, kundennummer = ?, altnummer = ?, typ = ?, intern_extern = ?, umsatzsteuer_id = ?,
                strasse = ?, plz = ?, stadt = ?, land = ?, telefon = ?, email = ?, website = ?,
                ansprechpartner_anrede = ?, ansprechpartner_vorname = ?, ansprechpartner_nachname = ?,
                ansprechpartner_email = ?, ansprechpartner_telefon = ?, interne_notiz = ?, status = ?, erweiterung_json = ?
         WHERE id = ?`,
        [
          next.name,
          next.kundennummer ?? null,
          next.altnummer ?? null,
          next.typ ?? null,
          next.intern_extern ?? null,
          next.umsatzsteuer_id ?? null,
          next.strasse ?? null,
          next.plz ?? null,
          next.stadt ?? null,
          next.land ?? 'Deutschland',
          next.telefon ?? null,
          next.email ?? null,
          next.website ?? null,
          next.ansprechpartner_anrede ?? null,
          next.ansprechpartner_vorname ?? null,
          next.ansprechpartner_nachname ?? null,
          next.ansprechpartner_email ?? null,
          next.ansprechpartner_telefon ?? null,
          next.interne_notiz ?? null,
          next.status ?? null,
          next.erweiterung_json ?? null,
          fid,
        ],
      );
      persist();
      return this.getFirmaById(fid);
    },
    listCockpitInvites() {
      return stmtAll(
        db,
        `SELECT i.*, f.name AS firma_name, f.kundennummer AS firma_kundennummer
         FROM cockpit_invites i
         LEFT JOIN firmen f ON f.id = i.firma_id
         ORDER BY datetime(i.created_at) DESC`,
        [],
      );
    },
    getPendingCockpitInviteByEmail(email) {
      const em = String(email || '').trim().toLowerCase();
      if (!em) return null;
      return stmtGet(
        db,
        `SELECT * FROM cockpit_invites WHERE LOWER(email) = ? AND status = 'offen' ORDER BY datetime(expires_at) DESC LIMIT 1`,
        [em],
      );
    },
    insertCockpitInvite({
      id,
      email,
      globalRole,
      modulesJson,
      areasJson,
      rightsJson,
      firmaId,
      token,
      expiresAtIso,
      createdByUserId,
    }) {
      stmtRun(
        db,
        `INSERT INTO cockpit_invites (id, email, global_role, modules_json, areas_json, rights_json, firma_id, token, status, expires_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offen', ?, ?)`,
        [
          id,
          email,
          globalRole,
          modulesJson,
          areasJson,
          rightsJson,
          firmaId || null,
          token,
          expiresAtIso,
          createdByUserId || null,
        ],
      );
      persist();
    },
    revokeCockpitInvite(inviteId) {
      const iid = String(inviteId || '').trim();
      if (!iid) return false;
      const cur = stmtGet(db, "SELECT id FROM cockpit_invites WHERE id = ? AND status = 'offen' LIMIT 1", [iid]);
      if (!cur) return false;
      stmtRun(db, `UPDATE cockpit_invites SET status = 'widerrufen' WHERE id = ? AND status = 'offen'`, [iid]);
      persist();
      return true;
    },
    getCockpitInviteByToken(token) {
      const t = String(token || '').trim();
      if (!t) return null;
      return stmtGet(db, 'SELECT * FROM cockpit_invites WHERE token = ? LIMIT 1', [t]);
    },
    redeemCockpitInviteAtomic(token, passwordHash) {
      const t = String(token || '').trim();
      if (!t) return { ok: false, code: 'INVITE_NOT_FOUND' };
      try {
        const inv = stmtGet(db, 'SELECT * FROM cockpit_invites WHERE token = ? LIMIT 1', [t]);
        if (!inv) return { ok: false, code: 'INVITE_NOT_FOUND' };
        if (String(inv.status) !== 'offen') return { ok: false, code: 'INVITE_INVALID_STATE' };
        const exp = new Date(String(inv.expires_at)).getTime();
        if (Number.isNaN(exp) || exp < Date.now()) {
          stmtRun(db, `UPDATE cockpit_invites SET status = 'abgelaufen' WHERE id = ?`, [inv.id]);
          persist();
          return { ok: false, code: 'INVITE_EXPIRED' };
        }
        const email = String(inv.email || '').trim().toLowerCase();
        const fidRaw = inv.firma_id != null ? String(inv.firma_id).trim() : '';
        const companyIdForUser = fidRaw !== '' ? fidRaw : null;
        const existing = stmtGet(db, 'SELECT id FROM users WHERE lower(email) = ? LIMIT 1', [email]);
        /** @type {string} */
        let uid;
        if (!existing || existing.id == null) {
          uid = randomUUID();
          const nm = email.split('@')[0] || 'Benutzer';
          const gr = String(inv.global_role || 'INTERN');
          stmtRun(
            db,
            'INSERT INTO users (id, email, password_hash, name, global_role, soll, urlaub, company_id, status) VALUES (?, ?, ?, ?, ?, 160, 28, ?, ?)',
            [uid, email, passwordHash, nm, gr, companyIdForUser, 'aktiv'],
          );
        } else {
          uid = String(existing.id);
          if (companyIdForUser) {
            stmtRun(db, 'UPDATE users SET password_hash = ?, company_id = ? WHERE id = ?', [
              passwordHash,
              companyIdForUser,
              uid,
            ]);
          } else {
            stmtRun(db, 'UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, uid]);
          }
        }
        let mods = [];
        try {
          mods = JSON.parse(String(inv.modules_json || '[]'));
        } catch {
          mods = [];
        }
        let rights = {};
        try {
          rights = JSON.parse(String(inv.rights_json || '{}'));
        } catch {
          rights = {};
        }
        const gr = String(inv.global_role || 'INTERN');
        this.replaceUserAccessBundle({ userId: uid, globalRole: gr, modules: mods, rights });
        stmtRun(
          db,
          `UPDATE cockpit_invites SET status = 'eingeloest', redeemed_at = datetime('now') WHERE id = ?`,
          [inv.id],
        );
        persist();
        return { ok: true, user: this.getUserById(uid) };
      } catch {
        return { ok: false, code: 'DATABASE_ERROR' };
      }
    },
    listFusaKundenExtraAll() {
      return stmtAll(db, 'SELECT firma_id, hinweis, segment, updated_at FROM fusa_kunden_extra ORDER BY firma_id', []);
    },
    listCcInternKundenExtraAll() {
      return stmtAll(
        db,
        'SELECT firma_id, crm_status, betreuer, updated_at AS ccintern_updated_at FROM ccintern_kunden_extra ORDER BY firma_id',
        [],
      );
    },
    upsertFusaKundenExtra(firmaId, patch) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return false;
      const exists = stmtGet(db, 'SELECT id FROM firmen WHERE id = ? LIMIT 1', [fid]);
      if (!exists) return false;
      const cur = stmtGet(db, 'SELECT firma_id, hinweis, segment FROM fusa_kunden_extra WHERE firma_id = ? LIMIT 1', [fid]);
      const nextHinweis =
        patch?.hinweis === undefined ? (cur?.hinweis ?? null) : (patch?.hinweis == null || String(patch.hinweis).trim() === '' ? null : String(patch.hinweis).trim());
      const nextSegment =
        patch?.segment === undefined ? (cur?.segment ?? null) : (patch?.segment == null || String(patch.segment).trim() === '' ? null : String(patch.segment).trim());
      stmtRun(
        db,
        `INSERT INTO fusa_kunden_extra (firma_id, hinweis, segment, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(firma_id) DO UPDATE SET
           hinweis = excluded.hinweis,
           segment = excluded.segment,
           updated_at = datetime('now')`,
        [fid, nextHinweis, nextSegment],
      );
      persist();
      return true;
    },
    upsertCcInternKundenExtra(firmaId, patch) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return false;
      const exists = stmtGet(db, 'SELECT id FROM firmen WHERE id = ? LIMIT 1', [fid]);
      if (!exists) return false;
      const cur = stmtGet(db, 'SELECT firma_id, crm_status, betreuer FROM ccintern_kunden_extra WHERE firma_id = ? LIMIT 1', [fid]);
      const nextCrm =
        patch?.crm_status === undefined ? (cur?.crm_status ?? null) : (patch?.crm_status == null || String(patch.crm_status).trim() === '' ? null : String(patch.crm_status).trim());
      const nextBet =
        patch?.betreuer === undefined ? (cur?.betreuer ?? null) : (patch?.betreuer == null || String(patch.betreuer).trim() === '' ? null : String(patch.betreuer).trim());
      stmtRun(
        db,
        `INSERT INTO ccintern_kunden_extra (firma_id, crm_status, betreuer, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(firma_id) DO UPDATE SET
           crm_status = excluded.crm_status,
           betreuer = excluded.betreuer,
           updated_at = datetime('now')`,
        [fid, nextCrm, nextBet],
      );
      persist();
      return true;
    },
    /** LEGACY: Tabelle `kunden` — nicht für neue Features nutzen; siehe firmen / `/api/v1/firmen` / `/api/v1/stammdaten/kunden`. **projects.kunden_id** bleibt bis zur Migration unverändert. */
    listKunden() {
      return stmtAll(
        db,
        'SELECT id, name, ansprechpartner, telefon, email, adresse, created_at FROM kunden ORDER BY name COLLATE NOCASE ASC',
        [],
      );
    },
    /** LEGACY: Tabelle `kunden` — nicht für neue Features nutzen; siehe firmen / `/api/v1/firmen` / `/api/v1/stammdaten/kunden`. **projects.kunden_id** bleibt bis zur Migration unverändert. */
    getKundeById(id) {
      return stmtGet(
        db,
        'SELECT id, name, ansprechpartner, telefon, email, adresse, created_at FROM kunden WHERE id = ? LIMIT 1',
        [id],
      );
    },
    /** LEGACY: Tabelle `kunden` — nicht für neue Features nutzen; siehe firmen / `/api/v1/firmen` / `/api/v1/stammdaten/kunden`. **projects.kunden_id** bleibt bis zur Migration unverändert. */
    insertKunde({ id, name, ansprechpartner, telefon, email, adresse }) {
      stmtRun(
        db,
        'INSERT INTO kunden (id, name, ansprechpartner, telefon, email, adresse) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, ansprechpartner ?? null, telefon ?? null, email ?? null, adresse ?? null],
      );
      persist();
    },
    /** LEGACY: Tabelle `kunden` — nicht für neue Features nutzen; siehe firmen / `/api/v1/firmen` / `/api/v1/stammdaten/kunden`. **projects.kunden_id** bleibt bis zur Migration unverändert. */
    updateKunde(kundeId, patch) {
      const row = stmtGet(
        db,
        'SELECT id, name, ansprechpartner, telefon, email, adresse, created_at FROM kunden WHERE id = ? LIMIT 1',
        [kundeId],
      );
      if (!row) return null;
      let nextName = row.name;
      if (patch.name !== undefined) {
        if (typeof patch.name !== 'string' || !patch.name.trim()) {
          return { error: 'INVALID_NAME' };
        }
        nextName = patch.name.trim();
      }
      let nextAp = row.ansprechpartner;
      if (patch.ansprechpartner !== undefined) {
        if (patch.ansprechpartner == null || patch.ansprechpartner === '') nextAp = null;
        else if (typeof patch.ansprechpartner === 'string') nextAp = patch.ansprechpartner.trim() || null;
        else return { error: 'INVALID_ANSPRECHPARTNER' };
      }
      let nextTel = row.telefon;
      if (patch.telefon !== undefined) {
        if (patch.telefon == null || patch.telefon === '') nextTel = null;
        else if (typeof patch.telefon === 'string') nextTel = patch.telefon.trim() || null;
        else return { error: 'INVALID_TELEFON' };
      }
      let nextEmail = row.email;
      if (patch.email !== undefined) {
        if (patch.email == null || patch.email === '') nextEmail = null;
        else if (typeof patch.email === 'string') nextEmail = patch.email.trim() || null;
        else return { error: 'INVALID_EMAIL' };
      }
      let nextAdr = row.adresse;
      if (patch.adresse !== undefined) {
        if (patch.adresse == null || patch.adresse === '') nextAdr = null;
        else if (typeof patch.adresse === 'string') nextAdr = patch.adresse.trim() || null;
        else return { error: 'INVALID_ADRESSE' };
      }
      stmtRun(
        db,
        'UPDATE kunden SET name = ?, ansprechpartner = ?, telefon = ?, email = ?, adresse = ? WHERE id = ?',
        [nextName, nextAp, nextTel, nextEmail, nextAdr, kundeId],
      );
      persist();
      return stmtGet(
        db,
        'SELECT id, name, ansprechpartner, telefon, email, adresse, created_at FROM kunden WHERE id = ? LIMIT 1',
        [kundeId],
      );
    },
    /** LEGACY: Tabelle `angebote` — nicht für neue Features; nutze **fusa_angebote** / **ccintern_angebote**. */
    listAngeboteForUser(_userId) {
      return stmtAll(
        db,
        `SELECT a.id, a.project_id, a.titel, a.angebotsnummer, a.status, a.betrag_netto, a.notiz,
                a.erstellt_von, a.created_at, a.updated_at,
                p.name AS project_name,
                k.name AS kunde_name
         FROM angebote a
         INNER JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         ORDER BY datetime(a.created_at) DESC`,
        [],
      );
    },
    /** LEGACY: Tabelle `angebote` — nicht für neue Features; nutze **fusa_angebote** / **ccintern_angebote**. */
    getAngebotById(id) {
      return stmtGet(
        db,
        `SELECT a.id, a.project_id, a.titel, a.angebotsnummer, a.status, a.betrag_netto, a.notiz,
                a.erstellt_von, a.created_at, a.updated_at,
                p.name AS project_name,
                k.name AS kunde_name
         FROM angebote a
         INNER JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         WHERE a.id = ? LIMIT 1`,
        [id],
      );
    },
    /** LEGACY: Tabelle `angebote` — nicht für neue Features; nutze **fusa_angebote** / **ccintern_angebote**. */
    nextAngebotsnummerFallback() {
      const year = new Date().getFullYear();
      const prefix = `ANG-${year}-`;
      const row = stmtGet(db, 'SELECT COUNT(*) AS n FROM angebote WHERE angebotsnummer LIKE ?', [
        `${prefix}%`,
      ]);
      const n = row && row.n != null ? Number(row.n) + 1 : 1;
      return `${prefix}${String(n).padStart(3, '0')}`;
    },
    /** LEGACY: Tabelle `angebote` — nicht für neue Features; nutze **fusa_angebote** / **ccintern_angebote**. */
    insertAngebot({ id, projectId, titel, angebotsnummer, status, betragNetto, notiz, erstelltVon }) {
      stmtRun(
        db,
        `INSERT INTO angebote (id, project_id, titel, angebotsnummer, status, betrag_netto, notiz, erstellt_von, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          id,
          projectId,
          titel,
          angebotsnummer,
          status,
          betragNetto == null ? null : Number(betragNetto),
          notiz ?? null,
          erstelltVon ?? null,
        ],
      );
      persist();
    },
    /** LEGACY: Tabelle `angebote` — nicht für neue Features; nutze **fusa_angebote** / **ccintern_angebote**. */
    updateAngebot(angebotId, patch) {
      const row = stmtGet(
        db,
        'SELECT id, project_id, titel, angebotsnummer, status, betrag_netto, notiz, created_at, updated_at FROM angebote WHERE id = ? LIMIT 1',
        [angebotId],
      );
      if (!row) return null;
      let nextTitel = row.titel;
      if (patch.titel !== undefined) {
        if (typeof patch.titel !== 'string' || !patch.titel.trim()) {
          return { error: 'INVALID_TITEL' };
        }
        nextTitel = patch.titel.trim();
      }
      let nextNr = row.angebotsnummer;
      if (patch.angebotsnummer !== undefined) {
        if (typeof patch.angebotsnummer !== 'string' || !patch.angebotsnummer.trim()) {
          return { error: 'INVALID_ANGEBOTSNUMMER' };
        }
        nextNr = patch.angebotsnummer.trim();
      }
      let nextStatus = row.status;
      if (patch.status !== undefined) {
        if (typeof patch.status !== 'string' || !patch.status.trim()) {
          return { error: 'INVALID_STATUS' };
        }
        nextStatus = patch.status.trim();
      }
      let nextBetrag = row.betrag_netto;
      if (Object.prototype.hasOwnProperty.call(patch, 'betrag_netto')) {
        const b = patch.betrag_netto;
        if (b == null || b === '') {
          nextBetrag = null;
        } else if (typeof b === 'number' && Number.isFinite(b)) {
          nextBetrag = b;
        } else if (typeof b === 'string' && b.trim()) {
          const x = Number.parseFloat(b.replace(',', '.'));
          if (!Number.isFinite(x)) return { error: 'INVALID_BETRAG' };
          nextBetrag = x;
        } else {
          return { error: 'INVALID_BETRAG' };
        }
      }
      let nextNotiz = row.notiz;
      if (patch.notiz !== undefined) {
        if (patch.notiz == null || patch.notiz === '') nextNotiz = null;
        else if (typeof patch.notiz === 'string') nextNotiz = patch.notiz.trim() || null;
        else return { error: 'INVALID_NOTIZ' };
      }
      stmtRun(
        db,
        `UPDATE angebote SET titel = ?, angebotsnummer = ?, status = ?, betrag_netto = ?, notiz = ?, updated_at = datetime('now') WHERE id = ?`,
        [nextTitel, nextNr, nextStatus, nextBetrag, nextNotiz, angebotId],
      );
      persist();
      return stmtGet(
        db,
        `SELECT a.id, a.project_id, a.titel, a.angebotsnummer, a.status, a.betrag_netto, a.notiz,
                a.erstellt_von, a.created_at, a.updated_at,
                p.name AS project_name,
                k.name AS kunde_name
         FROM angebote a
         INNER JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         WHERE a.id = ? LIMIT 1`,
        [angebotId],
      );
    },
    listAuftraege() {
      return stmtAll(
        db,
        'SELECT id, title, project_id, status, termin, termin_ende, created_at FROM auftraege ORDER BY datetime(created_at) DESC',
        [],
      );
    },
    listAuftraegeForUser(_userId) {
      return stmtAll(
        db,
        `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                COALESCE(fusaf.name, k.name) AS kunde_name,
                COALESCE(NULLIF(TRIM(COALESCE(fusaf.ansprechpartner_vorname,'') || ' ' || COALESCE(fusaf.ansprechpartner_nachname,'')), ''), k.ansprechpartner) AS kunde_ansprechpartner
         FROM auftraege a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
         WHERE a.project_id IS NOT NULL
         ORDER BY datetime(a.created_at) DESC`,
        [],
      );
    },
    insertAuftrag({
      id,
      title,
      projectId,
      status,
      termin,
      terminEnde,
      fusaOriginalId,
      fusaKundeId,
      fusaFahrzeugIds,
      fusaExtraJson,
    }) {
      stmtRun(
        db,
        `INSERT INTO auftraege (id, title, project_id, status, termin, termin_ende,
                fusa_original_id, fusa_kunde_id, fusa_fahrzeug_ids, fusa_extra_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          title,
          projectId,
          status,
          termin,
          terminEnde ?? null,
          fusaOriginalId ?? null,
          fusaKundeId ?? null,
          fusaFahrzeugIds ?? null,
          fusaExtraJson ?? null,
        ],
      );
      persist();
    },
    /**
     * FUSA-Auftrag anlegen inkl. fusa_belegungen (transaktional). Ohne Fahrzeuge = wie insertAuftrag.
     * Regel: fusa_fahrzeug_ids spiegelt dieselbe Fahrzeugmenge wie die Belegungszeilen.
     * @returns {{ ok: true } | { ok: false, code: string, message: string, konflikt?: Record<string, unknown> }}
     */
    insertAuftragWithFusaBelegungen({
      id,
      title,
      projectId,
      status,
      termin,
      terminEnde,
      fusaOriginalId,
      fusaKundeId,
      fusaFahrzeugIds,
      fusaExtraJson,
      fusaBelegungStatus,
    }) {
      const insertAuftragRow = () => {
        stmtRun(
          db,
          `INSERT INTO auftraege (id, title, project_id, status, termin, termin_ende,
                  fusa_original_id, fusa_kunde_id, fusa_fahrzeug_ids, fusa_extra_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            title,
            projectId,
            status,
            termin,
            terminEnde ?? null,
            fusaOriginalId ?? null,
            fusaKundeId ?? null,
            fusaFahrzeugIds ?? null,
            fusaExtraJson ?? null,
          ],
        );
      };

      /** @type {string[]} */
      let fahrzeugIds = [];
      if (fusaFahrzeugIds) {
        try {
          const a = JSON.parse(String(fusaFahrzeugIds));
          if (!Array.isArray(a)) {
            return {
              ok: false,
              code: 'INVALID_FAHRZEUG_IDS',
              message: 'fusa_fahrzeug_ids muss ein JSON-Array sein.',
            };
          }
          const seen = new Set();
          for (const x of a) {
            if (x == null) continue;
            const s = typeof x === 'string' ? x.trim() : String(x).trim();
            if (!s) {
              return {
                ok: false,
                code: 'INVALID_FAHRZEUG_IDS',
                message: 'fusa_fahrzeug_ids enthält eine leere ID.',
              };
            }
            if (!seen.has(s)) {
              seen.add(s);
              fahrzeugIds.push(s);
            }
          }
        } catch {
          return { ok: false, code: 'INVALID_FAHRZEUG_IDS', message: 'fusa_fahrzeug_ids ist kein gültiges JSON.' };
        }
      }

      if (fahrzeugIds.length === 0) {
        insertAuftragRow();
        persist();
        return { ok: true };
      }

      const z = auftragTermineZuBelegungIso(termin, terminEnde);
      if (!z.ok) {
        return { ok: false, code: z.code, message: z.message };
      }

      const st0 = String(fusaBelegungStatus || 'aktiv').toLowerCase();
      const belegStatus = ['reserviert', 'aktiv', 'beendet', 'storniert'].includes(st0) ? st0 : 'aktiv';

      const overlapRows = this.listFusaBelegungenOverlappendMitAuftragExtra(
        projectId,
        z.startdatum,
        z.enddatum,
        null,
      );
      const kennungenById = this.getFahrzeugKennungenByIds(fahrzeugIds);
      const fzRowsIns = this.getFahrzeugeByIds(fahrzeugIds);
      const fzByIdIns = Object.fromEntries(fzRowsIns.map((r) => [String(r.id), r]));
      const schaedenProjIns = this.listSchaedenForProject(projectId);
      const fcIns = pruefeFusaBuchungVorBelegung({
        projectId,
        overlapRows,
        fahrzeugIds,
        fusaExtraJsonStr: fusaExtraJson,
        excludeAuftragId: null,
        kennungenById,
        fahrzeugRowsById: fzByIdIns,
        schaedenRowsAll: schaedenProjIns,
        startdatum: z.startdatum,
        enddatum: z.enddatum,
      });
      if (!fcIns.ok) return fcIns;

      try {
        db.run('BEGIN IMMEDIATE');
        insertAuftragRow();
        for (const vid of fahrzeugIds) {
          const bid = randomUUID();
          stmtRun(
            db,
            `INSERT INTO fusa_belegungen (id, project_id, auftrag_id, fahrzeug_id, startdatum, enddatum, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [bid, projectId, id, vid, z.startdatum, z.enddatum, belegStatus],
          );
        }
        db.run('COMMIT');
      } catch {
        try {
          db.run('ROLLBACK');
        } catch {
          /* ignore */
        }
        return {
          ok: false,
          code: 'DATABASE_ERROR',
          message: 'Auftrag/Belegung konnte nicht gespeichert werden.',
        };
      }
      persist();
      return { ok: true };
    },
    /**
     * Belegungen eines Auftrags ersetzen (ohne API; Konfliktprüfung gegen andere Aufträge).
     * Leere Fahrzeugliste → alle Belegungszeilen dieses Auftrags löschen.
     * @returns {{ ok: true } | { ok: false, code: string, message: string, konflikt?: Record<string, unknown> }}
     */
    replaceFusaBelegungenForAuftrag({
      auftragId,
      projectId,
      termin,
      terminEnde,
      fusaFahrzeugIds,
      fusaBelegungStatus,
    }) {
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!aid || !pid) {
        return { ok: false, code: 'VALIDATION', message: 'auftrag_id und project_id sind erforderlich.' };
      }
      const row = stmtGet(db, 'SELECT id, project_id FROM auftraege WHERE id = ? LIMIT 1', [aid]);
      if (!row) {
        return { ok: false, code: 'NOT_FOUND', message: 'Auftrag wurde nicht gefunden.' };
      }
      if (String(row.project_id || '') !== pid) {
        return { ok: false, code: 'PROJECT_MISMATCH', message: 'Projekt passt nicht zum Auftrag.' };
      }

      /** @type {string[]} */
      let fahrzeugIds = [];
      if (fusaFahrzeugIds) {
        try {
          const a = JSON.parse(String(fusaFahrzeugIds));
          if (!Array.isArray(a)) {
            return {
              ok: false,
              code: 'INVALID_FAHRZEUG_IDS',
              message: 'fusa_fahrzeug_ids muss ein JSON-Array sein.',
            };
          }
          const seen = new Set();
          for (const x of a) {
            if (x == null) continue;
            const s = typeof x === 'string' ? x.trim() : String(x).trim();
            if (!s) {
              return {
                ok: false,
                code: 'INVALID_FAHRZEUG_IDS',
                message: 'fusa_fahrzeug_ids enthält eine leere ID.',
              };
            }
            if (!seen.has(s)) {
              seen.add(s);
              fahrzeugIds.push(s);
            }
          }
        } catch {
          return { ok: false, code: 'INVALID_FAHRZEUG_IDS', message: 'fusa_fahrzeug_ids ist kein gültiges JSON.' };
        }
      }

      if (fahrzeugIds.length === 0) {
        stmtRun(db, 'DELETE FROM fusa_belegungen WHERE auftrag_id = ?', [aid]);
        persist();
        return { ok: true };
      }

      const z = auftragTermineZuBelegungIso(termin, terminEnde);
      if (!z.ok) {
        return { ok: false, code: z.code, message: z.message };
      }
      const st0 = String(fusaBelegungStatus || 'aktiv').toLowerCase();
      const belegStatus = ['reserviert', 'aktiv', 'beendet', 'storniert'].includes(st0) ? st0 : 'aktiv';

      const exRowSqlite = stmtGet(db, 'SELECT fusa_extra_json FROM auftraege WHERE id = ? LIMIT 1', [aid]);
      const overlapRowsRep = this.listFusaBelegungenOverlappendMitAuftragExtra(
        pid,
        z.startdatum,
        z.enddatum,
        aid,
      );
      const kennRep = this.getFahrzeugKennungenByIds(fahrzeugIds);
      const fzRowsRep = this.getFahrzeugeByIds(fahrzeugIds);
      const fzByIdRep = Object.fromEntries(fzRowsRep.map((r) => [String(r.id), r]));
      const schaedenProjRep = this.listSchaedenForProject(pid);
      const fcRep = pruefeFusaBuchungVorBelegung({
        projectId: pid,
        overlapRows: overlapRowsRep,
        fahrzeugIds,
        fusaExtraJsonStr: exRowSqlite?.fusa_extra_json,
        excludeAuftragId: aid,
        kennungenById: kennRep,
        fahrzeugRowsById: fzByIdRep,
        schaedenRowsAll: schaedenProjRep,
        startdatum: z.startdatum,
        enddatum: z.enddatum,
      });
      if (!fcRep.ok) return fcRep;

      try {
        db.run('BEGIN IMMEDIATE');
        stmtRun(db, 'DELETE FROM fusa_belegungen WHERE auftrag_id = ?', [aid]);
        for (const vid of fahrzeugIds) {
          const bid = randomUUID();
          stmtRun(
            db,
            `INSERT INTO fusa_belegungen (id, project_id, auftrag_id, fahrzeug_id, startdatum, enddatum, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [bid, pid, aid, vid, z.startdatum, z.enddatum, belegStatus],
          );
        }
        db.run('COMMIT');
      } catch {
        try {
          db.run('ROLLBACK');
        } catch {
          /* ignore */
        }
        return {
          ok: false,
          code: 'DATABASE_ERROR',
          message: 'Belegungen konnten nicht aktualisiert werden.',
        };
      }
      persist();
      return { ok: true };
    },
    getAuftragById(id) {
      return stmtGet(
        db,
        `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                COALESCE(fusaf.name, k.name) AS kunde_name,
                COALESCE(NULLIF(TRIM(COALESCE(fusaf.ansprechpartner_vorname,'') || ' ' || COALESCE(fusaf.ansprechpartner_nachname,'')), ''), k.ansprechpartner) AS kunde_ansprechpartner
         FROM auftraege a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
         WHERE a.id = ? LIMIT 1`,
        [id],
      );
    },
    listFahrzeugeForUser(_userId) {
      return stmtAll(
        db,
        `SELECT f.id, f.project_id, f.kennung, f.typ, f.kennzeichen, f.status, f.details_json, f.created_at
         FROM fahrzeuge f
         ORDER BY datetime(f.created_at) DESC, f.kennung COLLATE NOCASE`,
        [],
      );
    },
    getFahrzeugById(id) {
      return stmtGet(
        db,
        'SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at FROM fahrzeuge WHERE id = ? LIMIT 1',
        [id],
      );
    },
    insertFahrzeug({ id, projectId, kennung, typ, kennzeichen, status, detailsJson }) {
      stmtRun(
        db,
        'INSERT INTO fahrzeuge (id, project_id, kennung, typ, kennzeichen, status, details_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, projectId, kennung, typ, kennzeichen ?? null, status ?? null, detailsJson ?? null],
      );
      persist();
    },
    updateFahrzeug(fahrzeugId, patch) {
      const row = stmtGet(
        db,
        'SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at FROM fahrzeuge WHERE id = ? LIMIT 1',
        [fahrzeugId],
      );
      if (!row) return null;
      let nextKennung = row.kennung;
      if (patch.kennung !== undefined) {
        if (typeof patch.kennung !== 'string' || !patch.kennung.trim()) {
          return { error: 'INVALID_KENNUNG' };
        }
        nextKennung = patch.kennung.trim();
      }
      let nextTyp = row.typ;
      if (patch.typ !== undefined) {
        if (typeof patch.typ !== 'string' || !patch.typ.trim()) {
          return { error: 'INVALID_TYP' };
        }
        nextTyp = patch.typ.trim();
      }
      let nextKennzeichen = row.kennzeichen;
      if (patch.kennzeichen !== undefined) {
        if (patch.kennzeichen == null || patch.kennzeichen === '') nextKennzeichen = null;
        else if (typeof patch.kennzeichen === 'string') nextKennzeichen = patch.kennzeichen.trim() || null;
        else return { error: 'INVALID_KENNZEICHEN' };
      }
      let nextStatus = row.status;
      if (patch.status !== undefined) {
        if (patch.status == null || patch.status === '') nextStatus = null;
        else if (typeof patch.status === 'string') nextStatus = patch.status.trim() || null;
        else return { error: 'INVALID_STATUS' };
      }
      stmtRun(
        db,
        'UPDATE fahrzeuge SET kennung = ?, typ = ?, kennzeichen = ?, status = ? WHERE id = ?',
        [nextKennung, nextTyp, nextKennzeichen, nextStatus, fahrzeugId],
      );
      persist();
      return stmtGet(
        db,
        'SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at FROM fahrzeuge WHERE id = ? LIMIT 1',
        [fahrzeugId],
      );
    },
    setFahrzeugDetailsJson(fahrzeugId, detailsJson) {
      stmtRun(db, 'UPDATE fahrzeuge SET details_json = ? WHERE id = ?', [detailsJson ?? null, fahrzeugId]);
      persist();
      return stmtGet(
        db,
        'SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at FROM fahrzeuge WHERE id = ? LIMIT 1',
        [fahrzeugId],
      );
    },
    listSchaedenForUser(_userId) {
      return stmtAll(
        db,
        `SELECT s.id, s.project_id, s.fahrzeug_id, s.titel, s.beschreibung, s.status,
                s.werkstatt_status, s.bearbeitet_von, s.bearbeitet_am, s.extra_json, s.created_at,
                f.kennung AS fahrzeug_kennung,
                (SELECT COUNT(*) FROM schaden_fotos sf WHERE sf.schaden_id = s.id) AS foto_count
         FROM schaeden s
         LEFT JOIN fahrzeuge f ON f.id = s.fahrzeug_id
         ORDER BY datetime(s.created_at) DESC`,
        [],
      );
    },
    listSchaedenForProject(projectId) {
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!pid) return [];
      return stmtAll(
        db,
        `SELECT s.id, s.project_id, s.fahrzeug_id, s.titel, s.beschreibung, s.status,
                s.werkstatt_status, s.bearbeitet_von, s.bearbeitet_am, s.extra_json, s.created_at,
                f.kennung AS fahrzeug_kennung,
                (SELECT COUNT(*) FROM schaden_fotos sf WHERE sf.schaden_id = s.id) AS foto_count
         FROM schaeden s
         LEFT JOIN fahrzeuge f ON f.id = s.fahrzeug_id
         WHERE s.project_id = ?
         ORDER BY datetime(s.created_at) DESC`,
        [pid],
      );
    },
    getSchadenById(id) {
      return stmtGet(
        db,
        `SELECT s.id, s.project_id, s.fahrzeug_id, s.titel, s.beschreibung, s.status,
                s.werkstatt_status, s.bearbeitet_von, s.bearbeitet_am, s.extra_json, s.created_at,
                f.kennung AS fahrzeug_kennung,
                (SELECT COUNT(*) FROM schaden_fotos sf WHERE sf.schaden_id = s.id) AS foto_count
         FROM schaeden s
         LEFT JOIN fahrzeuge f ON f.id = s.fahrzeug_id
         WHERE s.id = ? LIMIT 1`,
        [id],
      );
    },
    insertSchaden({ id, projectId, fahrzeugId, titel, beschreibung, status, extraJson }) {
      stmtRun(
        db,
        `INSERT INTO schaeden (id, project_id, fahrzeug_id, titel, beschreibung, status, werkstatt_status, bearbeitet_von, bearbeitet_am, extra_json)
         VALUES (?, ?, ?, ?, ?, ?, 'offen', NULL, NULL, ?)`,
        [id, projectId, fahrzeugId, titel, beschreibung ?? null, status, extraJson ?? null],
      );
      persist();
    },
    updateSchadenWerkstatt(schadenId, werkstattStatus, userId) {
      const allowed = new Set(['offen', 'in_arbeit', 'fertig']);
      if (!allowed.has(werkstattStatus)) {
        return { error: 'INVALID_WERKSTATT_STATUS' };
      }
      const row = stmtGet(db, 'SELECT id FROM schaeden WHERE id = ? LIMIT 1', [schadenId]);
      if (!row) return null;
      const now = new Date().toISOString();
      stmtRun(
        db,
        'UPDATE schaeden SET werkstatt_status = ?, bearbeitet_von = ?, bearbeitet_am = ? WHERE id = ?',
        [werkstattStatus, userId, now, schadenId],
      );
      persist();
      return stmtGet(
        db,
        `SELECT s.id, s.project_id, s.fahrzeug_id, s.titel, s.beschreibung, s.status,
                s.werkstatt_status, s.bearbeitet_von, s.bearbeitet_am, s.extra_json, s.created_at,
                f.kennung AS fahrzeug_kennung,
                (SELECT COUNT(*) FROM schaden_fotos sf WHERE sf.schaden_id = s.id) AS foto_count
         FROM schaeden s
         LEFT JOIN fahrzeuge f ON f.id = s.fahrzeug_id
         WHERE s.id = ? LIMIT 1`,
        [schadenId],
      );
    },
    listSchadenFotos(schadenId) {
      return stmtAll(
        db,
        'SELECT id, schaden_id, file_path, created_at FROM schaden_fotos WHERE schaden_id = ? ORDER BY datetime(created_at) ASC',
        [schadenId],
      );
    },
    getSchadenFotoById(fotoId) {
      return stmtGet(
        db,
        'SELECT id, schaden_id, file_path, created_at FROM schaden_fotos WHERE id = ? LIMIT 1',
        [fotoId],
      );
    },
    insertSchadenFoto({ id, schadenId, filePath }) {
      stmtRun(db, 'INSERT INTO schaden_fotos (id, schaden_id, file_path) VALUES (?, ?, ?)', [
        id,
        schadenId,
        filePath,
      ]);
      persist();
    },
    updateSchaden(schadenId, patch) {
      const row = stmtGet(
        db,
        `SELECT id, project_id, fahrzeug_id, titel, beschreibung, status,
                werkstatt_status, bearbeitet_von, bearbeitet_am, extra_json, created_at
         FROM schaeden WHERE id = ? LIMIT 1`,
        [schadenId],
      );
      if (!row) return null;
      let nextTitel = row.titel;
      if (patch.titel !== undefined) {
        if (typeof patch.titel !== 'string' || !patch.titel.trim()) {
          return { error: 'INVALID_TITEL' };
        }
        nextTitel = patch.titel.trim();
      }
      let nextBeschreibung = row.beschreibung;
      if (patch.beschreibung !== undefined) {
        if (patch.beschreibung == null || patch.beschreibung === '') nextBeschreibung = null;
        else if (typeof patch.beschreibung === 'string') nextBeschreibung = patch.beschreibung.trim() || null;
        else return { error: 'INVALID_BESCHREIBUNG' };
      }
      let nextStatus = row.status;
      if (patch.status !== undefined) {
        if (typeof patch.status !== 'string' || !patch.status.trim()) {
          return { error: 'INVALID_STATUS' };
        }
        nextStatus = patch.status.trim();
      }
      // extra_json: merge bestehende Daten mit Patch-Daten
      let nextExtraJson = row.extra_json != null ? row.extra_json : null;
      if (patch.extra !== undefined && patch.extra !== null && typeof patch.extra === 'object') {
        let existing = {};
        try { existing = nextExtraJson ? JSON.parse(String(nextExtraJson)) : {}; } catch { existing = {}; }
        const merged = Object.assign({}, existing, patch.extra);
        nextExtraJson = JSON.stringify(merged);
      }
      stmtRun(
        db,
        'UPDATE schaeden SET titel = ?, beschreibung = ?, status = ?, extra_json = ? WHERE id = ?',
        [nextTitel, nextBeschreibung, nextStatus, nextExtraJson, schadenId],
      );
      persist();
      return stmtGet(
        db,
        `SELECT s.id, s.project_id, s.fahrzeug_id, s.titel, s.beschreibung, s.status,
                s.werkstatt_status, s.bearbeitet_von, s.bearbeitet_am, s.extra_json, s.created_at,
                f.kennung AS fahrzeug_kennung,
                (SELECT COUNT(*) FROM schaden_fotos sf WHERE sf.schaden_id = s.id) AS foto_count
         FROM schaeden s
         LEFT JOIN fahrzeuge f ON f.id = s.fahrzeug_id
         WHERE s.id = ? LIMIT 1`,
        [schadenId],
      );
    },
    deleteSchadenByProject(schadenId, projectId) {
      const sid = typeof schadenId === 'string' ? schadenId.trim() : '';
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!sid || !pid) return false;
      const row = stmtGet(db, 'SELECT id, project_id FROM schaeden WHERE id = ? LIMIT 1', [sid]);
      if (!row || String(row.project_id) !== pid) return false;
      stmtRun(db, 'DELETE FROM schaeden WHERE id = ? AND project_id = ?', [sid, pid]);
      persist();
      return true;
    },
    updateAuftrag(auftragId, patch) {
      const row = stmtGet(
        db,
        'SELECT id, title, project_id, status, termin, termin_ende, created_at FROM auftraege WHERE id = ? LIMIT 1',
        [auftragId],
      );
      if (!row) return null;
      let nextTitle = row.title;
      if (patch.title !== undefined) {
        if (typeof patch.title !== 'string' || !patch.title.trim()) {
          return { error: 'INVALID_TITLE' };
        }
        nextTitle = patch.title.trim();
      }
      let nextStatus = row.status;
      if (patch.status !== undefined) {
        if (patch.status == null || patch.status === '') nextStatus = null;
        else if (typeof patch.status === 'string') nextStatus = patch.status.trim() || null;
        else return { error: 'INVALID_STATUS' };
      }
      let nextTermin = row.termin;
      if (patch.termin !== undefined) {
        if (patch.termin == null || patch.termin === '') nextTermin = null;
        else if (typeof patch.termin === 'string') nextTermin = patch.termin.trim() || null;
        else return { error: 'INVALID_TERMIN' };
      }
      let nextTerminEnde = row.termin_ende;
      if (patch.termin_ende !== undefined) {
        if (patch.termin_ende == null || patch.termin_ende === '') nextTerminEnde = null;
        else if (typeof patch.termin_ende === 'string') nextTerminEnde = patch.termin_ende.trim() || null;
        else return { error: 'INVALID_TERMIN_ENDE' };
      }
      stmtRun(
        db,
        'UPDATE auftraege SET title = ?, status = ?, termin = ?, termin_ende = ? WHERE id = ?',
        [nextTitle, nextStatus, nextTermin, nextTerminEnde, auftragId],
      );
      persist();
      return stmtGet(
        db,
        `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                COALESCE(fusaf.name, k.name) AS kunde_name,
                COALESCE(NULLIF(TRIM(COALESCE(fusaf.ansprechpartner_vorname,'') || ' ' || COALESCE(fusaf.ansprechpartner_nachname,'')), ''), k.ansprechpartner) AS kunde_ansprechpartner
         FROM auftraege a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
         WHERE a.id = ? LIMIT 1`,
        [auftragId],
      );
    },
    /**
     * PATCH: Auftrag aktualisieren; bei Änderung von termin / termin_ende / fusa_fahrzeug_ids
     * werden fusa_belegungen transaktional mitgeschrieben (Konfliktprüfung ohne eigene Zeilen).
     * @param {string} auftragId
     * @param {{ title?: unknown, status?: unknown, termin?: unknown, termin_ende?: unknown, fusa_fahrzeug_ids?: string|null, fusa_extra_json?: string|null }} patch
     * @returns {object|null|{ error: string, message?: string, konflikt?: Record<string, unknown> }}
     */
    updateAuftragPatchWithBelegung(auftragId, patch) {
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      if (!aid) return null;
      const row = stmtGet(
        db,
        `SELECT id, title, project_id, status, termin, termin_ende, fusa_kunde_id, fusa_fahrzeug_ids, fusa_extra_json FROM auftraege WHERE id = ? LIMIT 1`,
        [aid],
      );
      if (!row) return null;

      let nextTitle = row.title;
      if (patch.title !== undefined) {
        if (typeof patch.title !== 'string' || !patch.title.trim()) {
          return { error: 'INVALID_TITLE' };
        }
        nextTitle = patch.title.trim();
      }
      let nextStatus = row.status;
      if (patch.status !== undefined) {
        if (patch.status == null || patch.status === '') nextStatus = null;
        else if (typeof patch.status === 'string') nextStatus = patch.status.trim() || null;
        else return { error: 'INVALID_STATUS' };
      }
      let nextTermin = row.termin;
      if (patch.termin !== undefined) {
        if (patch.termin == null || patch.termin === '') nextTermin = null;
        else if (typeof patch.termin === 'string') nextTermin = patch.termin.trim() || null;
        else return { error: 'INVALID_TERMIN' };
      }
      let nextTerminEnde = row.termin_ende;
      if (patch.termin_ende !== undefined) {
        if (patch.termin_ende == null || patch.termin_ende === '') nextTerminEnde = null;
        else if (typeof patch.termin_ende === 'string') nextTerminEnde = patch.termin_ende.trim() || null;
        else return { error: 'INVALID_TERMIN_ENDE' };
      }
      let nextFz = row.fusa_fahrzeug_ids;
      if (Object.prototype.hasOwnProperty.call(patch, 'fusa_fahrzeug_ids')) {
        nextFz = patch.fusa_fahrzeug_ids;
      }
      let nextExtra = row.fusa_extra_json;
      if (Object.prototype.hasOwnProperty.call(patch, 'fusa_extra_json')) {
        nextExtra = patch.fusa_extra_json;
      }
      let nextKunde = row.fusa_kunde_id;
      if (Object.prototype.hasOwnProperty.call(patch, 'fusa_kunde_id')) {
        nextKunde = patch.fusa_kunde_id;
      }

      const tripleBefore = belegungTripleKey(row.termin, row.termin_ende, row.fusa_fahrzeug_ids);
      const tripleAfter = belegungTripleKey(nextTermin, nextTerminEnde, nextFz);
      const needsBelegungSync = tripleBefore !== tripleAfter;

      /** @type {string[]} */
      let fahrzeugIds = [];
      try {
        if (nextFz != null && String(nextFz).trim() !== '' && String(nextFz).trim() !== '[]') {
          const a = JSON.parse(String(nextFz));
          if (!Array.isArray(a)) {
            return { error: 'INVALID_FAHRZEUG_IDS', message: 'fusa_fahrzeug_ids muss ein JSON-Array sein.' };
          }
          const seen = new Set();
          for (const x of a) {
            if (x == null) continue;
            const s = typeof x === 'string' ? x.trim() : String(x).trim();
            if (!s) {
              return { error: 'INVALID_FAHRZEUG_IDS', message: 'fusa_fahrzeug_ids enthält eine leere ID.' };
            }
            if (!seen.has(s)) {
              seen.add(s);
              fahrzeugIds.push(s);
            }
          }
        }
      } catch {
        return { error: 'INVALID_FAHRZEUG_IDS', message: 'fusa_fahrzeug_ids ist kein gültiges JSON.' };
      }

      const pid = String(row.project_id || '').trim();
      /** @type {{ ok: true, startdatum: string, enddatum: string } | { ok: false, code: string, message: string }} */
      let zBand = { ok: false, code: 'INVALID_TERMIN', message: 'Zeitraum ungültig.' };
      if (fahrzeugIds.length > 0) {
        const z = auftragTermineZuBelegungIso(nextTermin, nextTerminEnde);
        if (!z.ok) {
          return { error: z.code, message: z.message };
        }
        zBand = { ok: true, startdatum: z.startdatum, enddatum: z.enddatum };
        const overlapRowsPatchSqlite = this.listFusaBelegungenOverlappendMitAuftragExtra(
          pid,
          z.startdatum,
          z.enddatum,
          aid,
        );
        const kennPatchSqlite = this.getFahrzeugKennungenByIds(fahrzeugIds);
        const fzRowsPatch = this.getFahrzeugeByIds(fahrzeugIds);
        const fzByIdPatch = Object.fromEntries(fzRowsPatch.map((r) => [String(r.id), r]));
        const schaedenProjPatch = this.listSchaedenForProject(pid);
        const fcPatchSqlite = pruefeFusaBuchungVorBelegung({
          projectId: pid,
          overlapRows: overlapRowsPatchSqlite,
          fahrzeugIds,
          fusaExtraJsonStr: nextExtra,
          excludeAuftragId: aid,
          kennungenById: kennPatchSqlite,
          fahrzeugRowsById: fzByIdPatch,
          schaedenRowsAll: schaedenProjPatch,
          startdatum: z.startdatum,
          enddatum: z.enddatum,
        });
        if (!fcPatchSqlite.ok) {
          return {
            error: fcPatchSqlite.code || 'BELEGUNG_KONFLIKT',
            message: fcPatchSqlite.message,
            konflikt: fcPatchSqlite.konflikt,
          };
        }
      }

      const fzCell = fahrzeugIds.length > 0 ? JSON.stringify(fahrzeugIds) : null;

      if (!needsBelegungSync) {
        stmtRun(
          db,
          'UPDATE auftraege SET title = ?, status = ?, termin = ?, termin_ende = ?, fusa_kunde_id = ?, fusa_fahrzeug_ids = ?, fusa_extra_json = ? WHERE id = ?',
          [nextTitle, nextStatus, nextTermin, nextTerminEnde, nextKunde, fzCell, nextExtra, aid],
        );
        persist();
        return stmtGet(
          db,
          `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                  a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                  COALESCE(fusaf.name, k.name) AS kunde_name,
                  COALESCE(NULLIF(TRIM(COALESCE(fusaf.ansprechpartner_vorname,'') || ' ' || COALESCE(fusaf.ansprechpartner_nachname,'')), ''), k.ansprechpartner) AS kunde_ansprechpartner
           FROM auftraege a
           LEFT JOIN projects p ON p.id = a.project_id
           LEFT JOIN kunden k ON k.id = p.kunden_id
           LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
           WHERE a.id = ? LIMIT 1`,
          [aid],
        );
      }

      try {
        db.run('BEGIN IMMEDIATE');
        stmtRun(
          db,
          'UPDATE auftraege SET title = ?, status = ?, termin = ?, termin_ende = ?, fusa_kunde_id = ?, fusa_fahrzeug_ids = ?, fusa_extra_json = ? WHERE id = ?',
          [nextTitle, nextStatus, nextTermin, nextTerminEnde, nextKunde, fzCell, nextExtra, aid],
        );
        stmtRun(db, 'DELETE FROM fusa_belegungen WHERE auftrag_id = ?', [aid]);
        if (fahrzeugIds.length > 0 && zBand.ok) {
          for (const vid of fahrzeugIds) {
            const bid = randomUUID();
            stmtRun(
              db,
              `INSERT INTO fusa_belegungen (id, project_id, auftrag_id, fahrzeug_id, startdatum, enddatum, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'aktiv', datetime('now'), datetime('now'))`,
              [bid, pid, aid, vid, zBand.startdatum, zBand.enddatum],
            );
          }
        }
        db.run('COMMIT');
      } catch {
        try {
          db.run('ROLLBACK');
        } catch {
          /* ignore */
        }
        return { error: 'DATABASE_ERROR', message: 'Auftrag/Belegung konnte nicht aktualisiert werden.' };
      }
      persist();
      return stmtGet(
        db,
        `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                COALESCE(fusaf.name, k.name) AS kunde_name,
                COALESCE(NULLIF(TRIM(COALESCE(fusaf.ansprechpartner_vorname,'') || ' ' || COALESCE(fusaf.ansprechpartner_nachname,'')), ''), k.ansprechpartner) AS kunde_ansprechpartner
         FROM auftraege a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
         WHERE a.id = ? LIMIT 1`,
        [aid],
      );
    },
    listFahrzeugeForProject(projectId) {
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!pid) return [];
      return stmtAll(
        db,
        `SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at
         FROM fahrzeuge WHERE project_id = ? ORDER BY datetime(created_at) DESC, kennung ASC`,
        [pid],
      );
    },
    getFahrzeugeByIds(ids) {
      const list = Array.isArray(ids) ? ids.map((x) => String(x).trim()).filter(Boolean) : [];
      if (list.length === 0) return [];
      const ph = list.map(() => '?').join(',');
      return stmtAll(
        db,
        `SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at FROM fahrzeuge WHERE id IN (${ph})`,
        list,
      );
    },
    getFahrzeugKennungenByIds(ids) {
      const rows = this.getFahrzeugeByIds(ids);
      /** @type {Record<string, string>} */
      const out = {};
      for (const r of rows) {
        const id = r.id != null ? String(r.id) : '';
        if (!id) continue;
        const kz = r.kennzeichen != null && String(r.kennzeichen).trim() ? String(r.kennzeichen).trim() : '';
        const kn = r.kennung != null && String(r.kennung).trim() ? String(r.kennung).trim() : '';
        out[id] = kz || kn || id;
      }
      return out;
    },
    listFusaBelegungenOverlappendMitAuftragExtra(projectId, startdatum, enddatum, excludeAuftragId) {
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      const sd = typeof startdatum === 'string' ? startdatum.trim() : '';
      const ed = typeof enddatum === 'string' ? enddatum.trim() : '';
      const ex = excludeAuftragId != null && String(excludeAuftragId).trim() !== '' ? String(excludeAuftragId).trim() : '';
      if (!pid || !sd || !ed) return [];
      return stmtAll(
        db,
        `SELECT b.id, b.project_id, b.auftrag_id, b.fahrzeug_id, b.startdatum, b.enddatum, b.status,
                a.fusa_extra_json AS auftrag_fusa_extra_json
         FROM fusa_belegungen b
         LEFT JOIN auftraege a ON a.id = b.auftrag_id
         WHERE b.project_id = ?
           AND LOWER(COALESCE(b.status,'')) IN ('aktiv','reserviert')
           AND b.startdatum IS NOT NULL AND b.enddatum IS NOT NULL
           AND b.startdatum <= ? AND b.enddatum >= ?
           AND (? = '' OR b.auftrag_id <> ?)`,
        [pid, ed, sd, ex, ex],
      );
    },
    listFusaApiAuftraege() {
      const rows = stmtAll(
        db,
        `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                COALESCE(fusaf.name, k.name) AS kunde_name,
                COALESCE(NULLIF(TRIM(COALESCE(fusaf.ansprechpartner_vorname,'') || ' ' || COALESCE(fusaf.ansprechpartner_nachname,'')), ''), k.ansprechpartner) AS kunde_ansprechpartner
         FROM auftraege a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
         WHERE a.project_id IS NOT NULL
           AND (a.fusa_original_id IS NOT NULL AND TRIM(a.fusa_original_id) <> ''
                OR a.fusa_kunde_id IS NOT NULL
                OR (a.fusa_fahrzeug_ids IS NOT NULL AND TRIM(a.fusa_fahrzeug_ids) NOT IN ('','[]'))
                OR (a.fusa_extra_json IS NOT NULL AND TRIM(a.fusa_extra_json) NOT IN ('','{}')))
         ORDER BY datetime(a.created_at) DESC`,
        [],
      );
      const ids = collectAllFahrzeugIdsFromAuftragRows(rows);
      /** @type {Map<string, string>} */
      const kennungById = new Map();
      if (ids.length > 0) {
        const ph = ids.map(() => '?').join(',');
        const fzRows = stmtAll(
          db,
          `SELECT id, kennung, kennzeichen FROM fahrzeuge WHERE id IN (${ph})`,
          ids,
        );
        for (const f of fzRows) {
          const fid = f.id != null ? String(f.id) : '';
          if (!fid) continue;
          const kz = f.kennzeichen != null && String(f.kennzeichen).trim() ? String(f.kennzeichen).trim() : '';
          const kn = f.kennung != null && String(f.kennung).trim() ? String(f.kennung).trim() : '';
          kennungById.set(fid, kz || kn || fid);
        }
      }
      attachFahrzeugFelderToFusaRows(rows, kennungById);
      return rows;
    },
    listFusaApiFahrzeuge() {
      return stmtAll(
        db,
        `SELECT f.id, f.project_id, f.kennung, f.typ, f.kennzeichen, f.status, f.details_json, f.created_at,
                p.name AS project_name
         FROM fahrzeuge f
         LEFT JOIN projects p ON p.id = f.project_id
         ORDER BY datetime(f.created_at) DESC, f.kennung ASC`,
        [],
      );
    },
    insertFusaRechnungRow(row) {
      const id = row.id != null ? String(row.id).trim() : randomUUID();
      stmtRun(
        db,
        `INSERT INTO fusa_rechnungen (id, original_id, auftrag_id, kunde_id, von, bis, netto, mwst, brutto, faellig_am, status, quartal, notiz, extra_json, bezahlt_am, rechnungsdatum)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          row.original_id ?? null,
          row.auftrag_id ?? null,
          row.kunde_id ?? null,
          row.von ?? null,
          row.bis ?? null,
          row.netto == null ? null : Number(row.netto),
          row.mwst == null ? null : Number(row.mwst),
          row.brutto == null ? null : Number(row.brutto),
          row.faellig_am ?? null,
          row.status != null ? String(row.status) : 'erstellt',
          row.quartal ?? null,
          row.notiz ?? null,
          row.extra_json != null ? String(row.extra_json) : null,
          row.bezahlt_am ?? null,
          row.rechnungsdatum ?? null,
        ],
      );
      persist();
      return stmtGet(db, 'SELECT * FROM fusa_rechnungen WHERE id = ? LIMIT 1', [id]);
    },
    updateFusaRechnungById(rechnungId, patch) {
      const rid = String(rechnungId || '').trim();
      if (!rid) return null;
      const cur = stmtGet(db, 'SELECT * FROM fusa_rechnungen WHERE id = ? LIMIT 1', [rid]);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE fusa_rechnungen SET original_id = ?, auftrag_id = ?, kunde_id = ?, von = ?, bis = ?, netto = ?, mwst = ?, brutto = ?,
                faellig_am = ?, status = ?, quartal = ?, notiz = ?, extra_json = ?, bezahlt_am = ?, rechnungsdatum = ?
         WHERE id = ?`,
        [
          next.original_id ?? null,
          next.auftrag_id ?? null,
          next.kunde_id ?? null,
          next.von ?? null,
          next.bis ?? null,
          next.netto == null ? null : Number(next.netto),
          next.mwst == null ? null : Number(next.mwst),
          next.brutto == null ? null : Number(next.brutto),
          next.faellig_am ?? null,
          next.status != null ? String(next.status) : null,
          next.quartal ?? null,
          next.notiz ?? null,
          next.extra_json != null ? String(next.extra_json) : null,
          next.bezahlt_am ?? null,
          next.rechnungsdatum ?? null,
          rid,
        ],
      );
      persist();
      return stmtGet(db, 'SELECT * FROM fusa_rechnungen WHERE id = ? LIMIT 1', [rid]);
    },
    getFusaRechnungById(rechnungId) {
      const rid = String(rechnungId || '').trim();
      if (!rid) return null;
      return stmtGet(db, 'SELECT * FROM fusa_rechnungen WHERE id = ? LIMIT 1', [rid]);
    },
    listFusaApiRechnungen() {
      try {
        return stmtAll(
          db,
          `SELECT r.id, r.original_id, r.auftrag_id, r.kunde_id, r.von, r.bis, r.netto, r.mwst, r.brutto,
                  r.faellig_am, r.status, r.quartal, r.notiz, r.created_at,
                  r.extra_json, r.bezahlt_am, r.rechnungsdatum
           FROM fusa_rechnungen r
           ORDER BY datetime(r.created_at) DESC`,
          [],
        );
      } catch {
        return [];
      }
    },
    /**
     * SQLite: Tabelle `fusa_termine` wird hier nicht angelegt — Abfrage schlägt fehl und wird im `catch` zu `[]` abgefangen.
     * Das ist **bewusst** (keine leere „aktive“ SQLite-Quelle für FUSA-Termine). MySQL-Store besitzt die Tabelle und liefert Zeilen.
     * Produktive Terminquelle im Projekt: **`kalender_termine`** / gemeinsame Kalenderlogik.
     */
    listFusaApiTermine() {
      try {
        return stmtAll(
          db,
          `SELECT t.id, t.original_id, t.projekt_id, t.auftrag_id, t.fahrzeug_id, t.typ, t.titel, t.start, t.ende, t.status, t.mitarbeiter_ids, t.notiz, t.created_at
           FROM fusa_termine t
           ORDER BY datetime(t.created_at) DESC`,
          [],
        );
      } catch {
        return [];
      }
    },
    listCcInternAuftraegeByFirma(firmaId, { offset = 0, limit = 50 } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      return stmtAll(
        db,
        `SELECT id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum, bemerkung,
                fusa_auftrag_id, quelle, erstellt_am, aktualisiert_am, erstellt_von, firma_id
         FROM ccintern_auftraege
         WHERE firma_id = ?
         ORDER BY datetime(erstellt_am) DESC
         LIMIT ? OFFSET ?`,
        [fid, Number(limit) || 50, Number(offset) || 0],
      );
    },
    countCcInternAuftraegeByFirma(firmaId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      const row = stmtGet(db, 'SELECT COUNT(*) AS c FROM ccintern_auftraege WHERE firma_id = ? LIMIT 1', [fid]);
      return Number(row?.c || 0);
    },
    getCcInternAuftragById(id, firmaId) {
      const aid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!aid || !fid) return null;
      return stmtGet(
        db,
        `SELECT id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum, bemerkung,
                fusa_auftrag_id, quelle, erstellt_am, aktualisiert_am, erstellt_von, firma_id
         FROM ccintern_auftraege
         WHERE id = ? AND firma_id = ? LIMIT 1`,
        [aid, fid],
      );
    },
    getCcInternAuftragByFusaAuftragId(fusaAuftragId, firmaId) {
      const fusaId = typeof fusaAuftragId === 'string' ? fusaAuftragId.trim() : '';
      if (!fusaId) return null;
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (fid) {
        return stmtGet(
          db,
          `SELECT id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum, bemerkung,
                  fusa_auftrag_id, quelle, erstellt_am, aktualisiert_am, erstellt_von, firma_id
           FROM ccintern_auftraege
           WHERE fusa_auftrag_id = ? AND firma_id = ?
           ORDER BY datetime(erstellt_am) DESC
           LIMIT 1`,
          [fusaId, fid],
        );
      }
      return stmtGet(
        db,
        `SELECT id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum, bemerkung,
                fusa_auftrag_id, quelle, erstellt_am, aktualisiert_am, erstellt_von, firma_id
         FROM ccintern_auftraege
         WHERE fusa_auftrag_id = ?
         ORDER BY datetime(erstellt_am) DESC
         LIMIT 1`,
        [fusaId],
      );
    },
    getLastCcInternAuftragsnummerForYear(year) {
      const yy = Number(year);
      if (!Number.isInteger(yy)) return null;
      return stmtGet(
        db,
        `SELECT auftragsnummer
         FROM ccintern_auftraege
         WHERE auftragsnummer LIKE ?
         ORDER BY auftragsnummer DESC
         LIMIT 1`,
        [`AU-${yy}-%`],
      );
    },
    insertCcInternAuftrag(row) {
      stmtRun(
        db,
        `INSERT INTO ccintern_auftraege
          (id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum, bemerkung, fusa_auftrag_id, quelle, erstellt_von, firma_id, erstellt_am, aktualisiert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          row.id,
          row.auftragsnummer,
          row.kunde,
          row.status ?? null,
          row.schritt ?? null,
          row.prioritaet ?? null,
          row.lieferdatum ?? null,
          row.montage_datum ?? null,
          row.bemerkung ?? null,
          row.fusa_auftrag_id ?? null,
          row.quelle ?? 'manuell',
          row.erstellt_von,
          row.firma_id,
        ],
      );
      persist();
    },
    updateCcInternAuftrag(id, firmaId, patch) {
      const cur = this.getCcInternAuftragById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE ccintern_auftraege
         SET kunde = ?, status = ?, schritt = ?, prioritaet = ?, lieferdatum = ?, montage_datum = ?, bemerkung = ?,
             fusa_auftrag_id = ?, quelle = ?, aktualisiert_am = datetime('now')
         WHERE id = ? AND firma_id = ?`,
        [
          next.kunde,
          next.status ?? null,
          next.schritt ?? null,
          next.prioritaet ?? null,
          next.lieferdatum ?? null,
          next.montage_datum ?? null,
          next.bemerkung ?? null,
          next.fusa_auftrag_id ?? null,
          next.quelle ?? 'manuell',
          String(id).trim(),
          String(firmaId).trim(),
        ],
      );
      persist();
      return this.getCcInternAuftragById(id, firmaId);
    },
    deleteCcInternAuftrag(id, firmaId) {
      const cur = this.getCcInternAuftragById(id, firmaId);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM ccintern_auftraege WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      persist();
      return true;
    },
    insertCcInternAuftragKommentar(row) {
      stmtRun(
        db,
        `INSERT INTO ccintern_auftrag_kommentare (id, auftrag_id, text, autor_id, erstellt_am)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [row.id, row.auftrag_id, row.text, row.autor_id],
      );
      persist();
      return stmtGet(
        db,
        `SELECT id, auftrag_id, text, autor_id, erstellt_am
         FROM ccintern_auftrag_kommentare
         WHERE id = ? LIMIT 1`,
        [row.id],
      );
    },
    listCcInternAuftragKommentare(auftragId, firmaId) {
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!aid || !fid) return [];
      return stmtAll(
        db,
        `SELECT c.id, c.auftrag_id, c.text, c.autor_id, c.erstellt_am
         FROM ccintern_auftrag_kommentare c
         INNER JOIN ccintern_auftraege a ON a.id = c.auftrag_id
         WHERE c.auftrag_id = ? AND a.firma_id = ?
         ORDER BY datetime(c.erstellt_am) ASC`,
        [aid, fid],
      );
    },
    listCcInternAuftragDateien(auftragId, firmaId) {
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!aid || !fid) return [];
      return stmtAll(
        db,
        `SELECT d.id, d.project_id, d.auftrag_id, d.kunde_id, d.typ, d.bereich, d.phase, d.position,
                d.filename, d.originalname, d.mimetype, d.size, d.server_path, d.public_url, d.uploaded_by, d.created_at, d.updated_at
         FROM ccintern_auftrag_dateien d
         INNER JOIN ccintern_auftraege a ON a.id = d.auftrag_id
         WHERE d.auftrag_id = ? AND a.firma_id = ?
         ORDER BY datetime(d.created_at) ASC`,
        [aid, fid],
      );
    },
    getCcInternAuftragDateiByIdForFirma(dateiId, firmaId) {
      const did = typeof dateiId === 'string' ? dateiId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!did || !fid) return null;
      return stmtGet(
        db,
        `SELECT d.id, d.project_id, d.auftrag_id, d.kunde_id, d.typ, d.bereich, d.phase, d.position,
                d.filename, d.originalname, d.mimetype, d.size, d.server_path, d.public_url, d.uploaded_by, d.created_at, d.updated_at
         FROM ccintern_auftrag_dateien d
         INNER JOIN ccintern_auftraege a ON a.id = d.auftrag_id
         WHERE d.id = ? AND a.firma_id = ?
         LIMIT 1`,
        [did, fid],
      );
    },
    findCcInternAuftragDateiBySlot(auftragId, firmaId, typ, phase, position) {
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const t = String(typ ?? '')
        .trim()
        .toLowerCase();
      if (!aid || !fid || !t) return null;
      const ph = phase == null || String(phase).trim() === '' ? '' : String(phase).trim();
      const po = position == null || String(position).trim() === '' ? '' : String(position).trim();
      return stmtGet(
        db,
        `SELECT d.id, d.project_id, d.auftrag_id, d.kunde_id, d.typ, d.bereich, d.phase, d.position,
                d.filename, d.originalname, d.mimetype, d.size, d.server_path, d.public_url, d.uploaded_by, d.created_at, d.updated_at
         FROM ccintern_auftrag_dateien d
         INNER JOIN ccintern_auftraege a ON a.id = d.auftrag_id
         WHERE d.auftrag_id = ? AND a.firma_id = ?
           AND d.typ = ?
           AND COALESCE(d.phase, '') = ?
           AND COALESCE(d.position, '') = ?
         LIMIT 1`,
        [aid, fid, t, ph, po],
      );
    },
    insertCcInternAuftragDatei(row) {
      stmtRun(
        db,
        `INSERT INTO ccintern_auftrag_dateien
          (id, project_id, auftrag_id, kunde_id, typ, bereich, phase, position, filename, originalname, mimetype, size, server_path, public_url, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), NULL)`,
        [
          row.id,
          row.project_id ?? null,
          row.auftrag_id,
          row.kunde_id ?? null,
          row.typ,
          row.bereich ?? null,
          row.phase ?? null,
          row.position ?? null,
          row.filename,
          row.originalname,
          row.mimetype,
          row.size,
          row.server_path,
          row.public_url,
          row.uploaded_by ?? null,
        ],
      );
      persist();
      return stmtGet(db, 'SELECT * FROM ccintern_auftrag_dateien WHERE id = ? LIMIT 1', [row.id]);
    },
    updateCcInternAuftragDatei(dateiId, firmaId, patch) {
      const did = typeof dateiId === 'string' ? dateiId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!did || !fid) return null;
      const cur = this.getCcInternAuftragDateiByIdForFirma(did, fid);
      if (!cur) return null;
      stmtRun(
        db,
        `UPDATE ccintern_auftrag_dateien SET filename = ?, originalname = ?, mimetype = ?, size = ?, server_path = ?, public_url = ?, uploaded_by = ?, updated_at = datetime('now') WHERE id = ?`,
        [
          patch.filename,
          patch.originalname,
          patch.mimetype,
          patch.size,
          patch.server_path,
          patch.public_url,
          patch.uploaded_by ?? null,
          did,
        ],
      );
      persist();
      return stmtGet(db, 'SELECT * FROM ccintern_auftrag_dateien WHERE id = ? LIMIT 1', [did]);
    },
    deleteCcInternAuftragDatei(dateiId, firmaId) {
      const cur = this.getCcInternAuftragDateiByIdForFirma(dateiId, firmaId);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM ccintern_auftrag_dateien WHERE id = ?', [String(dateiId).trim()]);
      persist();
      return true;
    },
    listKalenderTermineByFirma(firmaId, { offset = 0, limit = 50, typ = null, von = null, bis = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      if (typ) {
        where += ' AND typ = ?';
        params.push(String(typ).trim());
      }
      if (von) {
        where += ' AND datetime(start) >= datetime(?)';
        params.push(String(von).trim());
      }
      if (bis) {
        where += ' AND datetime(start) <= datetime(?)';
        params.push(String(bis).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return stmtAll(
        db,
        `SELECT id, titel, start, ende, ganztag, typ, mitarbeiter_ids, auftrag_id, farbe, notiz, firma_id, erstellt_von, erstellt_am, aktualisiert_am
                , quelle, fusa_auftrag_id
         FROM kalender_termine
         ${where}
         ORDER BY datetime(start) ASC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    countKalenderTermineByFirma(firmaId, { typ = null, von = null, bis = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      if (typ) {
        where += ' AND typ = ?';
        params.push(String(typ).trim());
      }
      if (von) {
        where += ' AND datetime(start) >= datetime(?)';
        params.push(String(von).trim());
      }
      if (bis) {
        where += ' AND datetime(start) <= datetime(?)';
        params.push(String(bis).trim());
      }
      const row = stmtGet(db, `SELECT COUNT(*) AS c FROM kalender_termine ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    getKalenderTerminById(id, firmaId) {
      const tid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!tid || !fid) return null;
      return stmtGet(
        db,
        `SELECT id, titel, start, ende, ganztag, typ, mitarbeiter_ids, auftrag_id, farbe, notiz, firma_id, erstellt_von, erstellt_am, aktualisiert_am,
                quelle, fusa_auftrag_id
         FROM kalender_termine
         WHERE id = ? AND firma_id = ?
         LIMIT 1`,
        [tid, fid],
      );
    },
    getKalenderTerminByQuelleAndAuftragId(firmaId, quelle, auftragId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const src = typeof quelle === 'string' ? quelle.trim() : '';
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      if (!fid || !src || !aid) return null;
      return stmtGet(
        db,
        `SELECT id, titel, start, ende, ganztag, typ, mitarbeiter_ids, auftrag_id, farbe, notiz, firma_id, erstellt_von, erstellt_am, aktualisiert_am,
                quelle, fusa_auftrag_id
         FROM kalender_termine
         WHERE firma_id = ? AND quelle = ? AND auftrag_id = ?
         ORDER BY datetime(erstellt_am) DESC
         LIMIT 1`,
        [fid, src, aid],
      );
    },
    getKalenderTerminByQuelleAndFusaAuftragId(firmaId, quelle, fusaAuftragId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const src = typeof quelle === 'string' ? quelle.trim() : '';
      const faid = typeof fusaAuftragId === 'string' ? fusaAuftragId.trim() : '';
      if (!fid || !src || !faid) return null;
      return stmtGet(
        db,
        `SELECT id, titel, start, ende, ganztag, typ, mitarbeiter_ids, auftrag_id, farbe, notiz, firma_id, erstellt_von, erstellt_am, aktualisiert_am,
                quelle, fusa_auftrag_id
         FROM kalender_termine
         WHERE firma_id = ? AND quelle = ? AND fusa_auftrag_id = ?
         ORDER BY datetime(erstellt_am) DESC
         LIMIT 1`,
        [fid, src, faid],
      );
    },
    insertKalenderTermin(row) {
      stmtRun(
        db,
        `INSERT INTO kalender_termine
          (id, titel, start, ende, ganztag, typ, quelle, mitarbeiter_ids, auftrag_id, fusa_auftrag_id, farbe, notiz, firma_id, erstellt_von, erstellt_am, aktualisiert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          row.id,
          row.titel,
          row.start,
          row.ende ?? null,
          row.ganztag ? 1 : 0,
          row.typ,
          row.quelle ?? 'manuell',
          row.mitarbeiter_ids,
          row.auftrag_id ?? null,
          row.fusa_auftrag_id ?? null,
          row.farbe ?? null,
          row.notiz ?? null,
          row.firma_id,
          row.erstellt_von ?? null,
        ],
      );
      persist();
      return this.getKalenderTerminById(row.id, row.firma_id);
    },
    updateKalenderTermin(id, firmaId, patch) {
      const cur = this.getKalenderTerminById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE kalender_termine
         SET titel = ?, start = ?, ende = ?, ganztag = ?, typ = ?, quelle = ?, mitarbeiter_ids = ?, auftrag_id = ?, fusa_auftrag_id = ?, farbe = ?, notiz = ?, aktualisiert_am = datetime('now')
         WHERE id = ? AND firma_id = ?`,
        [
          next.titel,
          next.start,
          next.ende ?? null,
          next.ganztag ? 1 : 0,
          next.typ,
          next.quelle ?? 'manuell',
          next.mitarbeiter_ids,
          next.auftrag_id ?? null,
          next.fusa_auftrag_id ?? null,
          next.farbe ?? null,
          next.notiz ?? null,
          String(id).trim(),
          String(firmaId).trim(),
        ],
      );
      persist();
      return this.getKalenderTerminById(id, firmaId);
    },
    deleteKalenderTermin(id, firmaId) {
      const cur = this.getKalenderTerminById(id, firmaId);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM kalender_termine WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      persist();
      return true;
    },
    listUrlaubByFirma(firmaId, { offset = 0, limit = 50, status = null, typ = null, von = null, bis = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE u.firma_id = ?';
      if (status) {
        where += ' AND u.status = ?';
        params.push(String(status).trim());
      }
      if (typ) {
        where += ' AND u.typ = ?';
        params.push(String(typ).trim());
      }
      if (von) {
        where += ' AND datetime(u.von) >= datetime(?)';
        params.push(String(von).trim());
      }
      if (bis) {
        where += ' AND datetime(u.bis) <= datetime(?)';
        params.push(String(bis).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return stmtAll(
        db,
        `SELECT u.id, u.mitarbeiter_id, u.von, u.bis, u.tage, u.typ, u.status, u.bemerkung, u.entschieden_von, u.entschieden_am,
                u.kalender_termin_id, u.kalender_termin_ids, u.firma_id, u.erstellt_am, u.aktualisiert_am,
                m.name AS mitarbeiter_name
         FROM urlaub_antraege u
         LEFT JOIN users m ON m.id = u.mitarbeiter_id
         ${where}
         ORDER BY datetime(u.erstellt_am) DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    countUrlaubByFirma(firmaId, { status = null, typ = null, von = null, bis = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      if (status) {
        where += ' AND status = ?';
        params.push(String(status).trim());
      }
      if (typ) {
        where += ' AND typ = ?';
        params.push(String(typ).trim());
      }
      if (von) {
        where += ' AND datetime(von) >= datetime(?)';
        params.push(String(von).trim());
      }
      if (bis) {
        where += ' AND datetime(bis) <= datetime(?)';
        params.push(String(bis).trim());
      }
      const row = stmtGet(db, `SELECT COUNT(*) AS c FROM urlaub_antraege ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    getUrlaubById(id, firmaId) {
      const uid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!uid || !fid) return null;
      return stmtGet(
        db,
        `SELECT u.id, u.mitarbeiter_id, u.von, u.bis, u.tage, u.typ, u.status, u.bemerkung, u.entschieden_von, u.entschieden_am,
                u.kalender_termin_id, u.kalender_termin_ids, u.firma_id, u.erstellt_am, u.aktualisiert_am,
                m.name AS mitarbeiter_name
         FROM urlaub_antraege u
         LEFT JOIN users m ON m.id = u.mitarbeiter_id
         WHERE u.id = ? AND u.firma_id = ?
         LIMIT 1`,
        [uid, fid],
      );
    },
    insertUrlaubAntrag(row) {
      stmtRun(
        db,
        `INSERT INTO urlaub_antraege
          (id, mitarbeiter_id, von, bis, tage, typ, status, bemerkung, entschieden_von, entschieden_am, kalender_termin_id, kalender_termin_ids, firma_id, erstellt_am, aktualisiert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          row.id,
          row.mitarbeiter_id,
          row.von,
          row.bis,
          Number(row.tage),
          row.typ,
          row.status,
          row.bemerkung ?? null,
          row.entschieden_von ?? null,
          row.entschieden_am ?? null,
          row.kalender_termin_id ?? null,
          row.kalender_termin_ids ?? null,
          row.firma_id,
        ],
      );
      persist();
      return this.getUrlaubById(row.id, row.firma_id);
    },
    updateUrlaubAntrag(id, firmaId, patch) {
      const cur = this.getUrlaubById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE urlaub_antraege
         SET mitarbeiter_id = ?, von = ?, bis = ?, tage = ?, typ = ?, status = ?, bemerkung = ?, entschieden_von = ?, entschieden_am = ?, kalender_termin_id = ?, kalender_termin_ids = ?,
             aktualisiert_am = datetime('now')
         WHERE id = ? AND firma_id = ?`,
        [
          next.mitarbeiter_id,
          next.von,
          next.bis,
          Number(next.tage),
          next.typ,
          next.status,
          next.bemerkung ?? null,
          next.entschieden_von ?? null,
          next.entschieden_am ?? null,
          next.kalender_termin_id ?? null,
          next.kalender_termin_ids ?? null,
          String(id).trim(),
          String(firmaId).trim(),
        ],
      );
      persist();
      return this.getUrlaubById(id, firmaId);
    },
    deleteUrlaubAntrag(id, firmaId) {
      const cur = this.getUrlaubById(id, firmaId);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM urlaub_antraege WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      persist();
      return true;
    },
    upsertCcInternMitarbeiterTagStatus(row) {
      const fid = String(row.firma_id || '').trim();
      const uid = String(row.user_id || '').trim();
      const dat = String(row.datum || '').trim();
      const status = String(row.status || '').trim();
      if (!fid || !uid || !dat || !status) return null;
      const projectId = row.project_id != null ? String(row.project_id).trim() || null : null;
      const existing = stmtGet(
        db,
        'SELECT id FROM ccintern_mitarbeiter_status WHERE firma_id = ? AND user_id = ? AND datum = ? LIMIT 1',
        [fid, uid, dat],
      );
      const id =
        existing && existing.id
          ? String(existing.id)
          : row.id != null && String(row.id).trim()
            ? String(row.id).trim()
            : randomUUID();
      if (existing && existing.id) {
        stmtRun(
          db,
          `UPDATE ccintern_mitarbeiter_status
           SET status = ?, project_id = ?, updated_at = datetime('now')
           WHERE id = ? AND firma_id = ?`,
          [status, projectId, String(existing.id), fid],
        );
      } else {
        stmtRun(
          db,
          `INSERT INTO ccintern_mitarbeiter_status (id, project_id, user_id, firma_id, status, datum, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [id, projectId, uid, fid, status, dat],
        );
      }
      persist();
      return stmtGet(
        db,
        `SELECT id, project_id, user_id, firma_id, status, datum, created_at, updated_at
         FROM ccintern_mitarbeiter_status WHERE firma_id = ? AND user_id = ? AND datum = ? LIMIT 1`,
        [fid, uid, dat],
      );
    },
    listCcInternMitarbeiterStatusByFirma(firmaId, { user_id = null, datum_von = null, datum_bis = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE s.firma_id = ?';
      if (user_id) {
        where += ' AND s.user_id = ?';
        params.push(String(user_id).trim());
      }
      if (datum_von) {
        where += ' AND s.datum >= ?';
        params.push(String(datum_von).trim());
      }
      if (datum_bis) {
        where += ' AND s.datum <= ?';
        params.push(String(datum_bis).trim());
      }
      return stmtAll(
        db,
        `SELECT s.id, s.project_id, s.user_id, s.firma_id, s.status, s.datum, s.created_at, s.updated_at,
                u.name AS mitarbeiter_name
         FROM ccintern_mitarbeiter_status s
         LEFT JOIN users u ON u.id = s.user_id
         ${where}
         ORDER BY s.datum DESC, s.updated_at DESC`,
        params,
      );
    },
    insertCcInternMitarbeiterAnwesenheit(row) {
      stmtRun(
        db,
        `INSERT INTO ccintern_mitarbeiter_anwesenheit
          (id, project_id, user_id, firma_id, datum, start, ende, pause_minuten, dauer_minuten, typ, notiz, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          row.id,
          row.project_id ?? null,
          row.user_id,
          row.firma_id,
          row.datum,
          row.start ?? null,
          row.ende ?? null,
          Number(row.pause_minuten ?? 0) || 0,
          row.dauer_minuten != null
            ? Number(row.dauer_minuten)
            : row.dauer_minutes != null
              ? Number(row.dauer_minutes)
              : null,
          String(row.typ || 'anwesenheit').trim(),
          row.notiz ?? null,
        ],
      );
      persist();
      return this.getCcInternMitarbeiterAnwesenheitById(row.id, row.firma_id);
    },
    getCcInternMitarbeiterAnwesenheitById(id, firmaId) {
      const iid = String(id || '').trim();
      const fid = String(firmaId || '').trim();
      if (!iid || !fid) return null;
      return stmtGet(
        db,
        `SELECT a.id, a.project_id, a.user_id, a.firma_id, a.datum, a.start, a.ende, a.pause_minuten, a.dauer_minuten, a.typ, a.notiz, a.created_at,
                u.name AS mitarbeiter_name
         FROM ccintern_mitarbeiter_anwesenheit a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.id = ? AND a.firma_id = ?
         LIMIT 1`,
        [iid, fid],
      );
    },
    listCcInternMitarbeiterAnwesenheitByFirma(firmaId, { user_id = null, datum_von = null, datum_bis = null, limit = 2000 } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE a.firma_id = ?';
      if (user_id) {
        where += ' AND a.user_id = ?';
        params.push(String(user_id).trim());
      }
      if (datum_von) {
        where += ' AND a.datum >= ?';
        params.push(String(datum_von).trim());
      }
      if (datum_bis) {
        where += ' AND a.datum <= ?';
        params.push(String(datum_bis).trim());
      }
      params.push(Math.min(Number(limit) || 2000, 5000));
      return stmtAll(
        db,
        `SELECT a.id, a.project_id, a.user_id, a.firma_id, a.datum, a.start, a.ende, a.pause_minuten, a.dauer_minuten, a.typ, a.notiz, a.created_at,
                u.name AS mitarbeiter_name
         FROM ccintern_mitarbeiter_anwesenheit a
         LEFT JOIN users u ON u.id = a.user_id
         ${where}
         ORDER BY datetime(a.created_at) DESC
         LIMIT ?`,
        params,
      );
    },
    listLagerMaterialByFirma(firmaId, { offset = 0, limit = 50, kategorie = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      if (kategorie) {
        where += ' AND kategorie = ?';
        params.push(String(kategorie).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return stmtAll(
        db,
        `SELECT id, name, kategorie, menge, einheit, mindestbestand, artikelnummer, lagerort, firma_id, erstellt_am, aktualisiert_am
         FROM lager_material
         ${where}
         ORDER BY name COLLATE NOCASE ASC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    countLagerMaterialByFirma(firmaId, { kategorie = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      if (kategorie) {
        where += ' AND kategorie = ?';
        params.push(String(kategorie).trim());
      }
      const row = stmtGet(db, `SELECT COUNT(*) AS c FROM lager_material ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    getLagerMaterialById(id, firmaId) {
      const mid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!mid || !fid) return null;
      return stmtGet(
        db,
        `SELECT id, name, kategorie, menge, einheit, mindestbestand, artikelnummer, lagerort, firma_id, erstellt_am, aktualisiert_am
         FROM lager_material
         WHERE id = ? AND firma_id = ?
         LIMIT 1`,
        [mid, fid],
      );
    },
    insertLagerMaterial(row) {
      stmtRun(
        db,
        `INSERT INTO lager_material
          (id, name, kategorie, menge, einheit, mindestbestand, artikelnummer, lagerort, firma_id, erstellt_am, aktualisiert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          row.id,
          row.name,
          row.kategorie ?? null,
          Number(row.menge ?? 0),
          row.einheit,
          Number(row.mindestbestand ?? 0),
          row.artikelnummer ?? null,
          row.lagerort ?? null,
          row.firma_id,
        ],
      );
      persist();
      return this.getLagerMaterialById(row.id, row.firma_id);
    },
    updateLagerMaterial(id, firmaId, patch) {
      const cur = this.getLagerMaterialById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE lager_material
         SET name = ?, kategorie = ?, menge = ?, einheit = ?, mindestbestand = ?, artikelnummer = ?, lagerort = ?, aktualisiert_am = datetime('now')
         WHERE id = ? AND firma_id = ?`,
        [
          next.name,
          next.kategorie ?? null,
          Number(next.menge),
          next.einheit,
          Number(next.mindestbestand),
          next.artikelnummer ?? null,
          next.lagerort ?? null,
          String(id).trim(),
          String(firmaId).trim(),
        ],
      );
      persist();
      return this.getLagerMaterialById(id, firmaId);
    },
    deleteLagerMaterial(id, firmaId) {
      const cur = this.getLagerMaterialById(id, firmaId);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM lager_material WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      persist();
      return true;
    },
    /** Setzt `firma_id` aller Lagerzeilen (z. B. nach Seed mit falscher Firma). Nur Dev-Skripte. */
    reassignAllLagerMaterialFirmaId(targetFirmaId) {
      const fid = typeof targetFirmaId === 'string' ? targetFirmaId.trim() : '';
      if (!fid) return { changed: 0 };
      if (!this.getFirmaById(fid)) {
        throw new Error('reassignAllLagerMaterialFirmaId: Ziel-Firma nicht gefunden.');
      }
      const row = stmtGet(db, 'SELECT COUNT(*) AS c FROM lager_material', []);
      const n = Number(row?.c || 0);
      if (n === 0) return { changed: 0 };
      stmtRun(db, 'UPDATE lager_material SET firma_id = ?, aktualisiert_am = datetime("now")', [fid]);
      persist();
      return { changed: n };
    },
    listLagerBuchungenByMaterial(materialId, firmaId, { offset = 0, limit = 50 } = {}) {
      const mid = typeof materialId === 'string' ? materialId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!mid || !fid) return [];
      return stmtAll(
        db,
        `SELECT b.id, b.material_id, b.menge, b.typ, b.mitarbeiter_id, b.auftrag_id, b.bemerkung, b.erstellt_am
         FROM lager_buchungen b
         INNER JOIN lager_material m ON m.id = b.material_id
         WHERE b.material_id = ? AND m.firma_id = ?
         ORDER BY datetime(b.erstellt_am) DESC
         LIMIT ? OFFSET ?`,
        [mid, fid, Number(limit) || 50, Number(offset) || 0],
      );
    },
    countLagerBuchungenByMaterial(materialId, firmaId) {
      const mid = typeof materialId === 'string' ? materialId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!mid || !fid) return 0;
      const row = stmtGet(
        db,
        `SELECT COUNT(*) AS c
         FROM lager_buchungen b
         INNER JOIN lager_material m ON m.id = b.material_id
         WHERE b.material_id = ? AND m.firma_id = ?
         LIMIT 1`,
        [mid, fid],
      );
      return Number(row?.c || 0);
    },
    insertLagerBuchungAndAdjust(materialId, firmaId, row) {
      const mat = this.getLagerMaterialById(materialId, firmaId);
      if (!mat) return { error: 'MATERIAL_NOT_FOUND' };
      const menge = Number(row.menge);
      if (!Number.isFinite(menge) || menge <= 0) return { error: 'INVALID_MENGE' };
      const typ = String(row.typ || '').trim();
      if (!['entnahme', 'zugang', 'korrektur'].includes(typ)) return { error: 'INVALID_TYP' };

      let delta = 0;
      if (typ === 'zugang') delta = Math.abs(menge);
      if (typ === 'entnahme') delta = -Math.abs(menge);
      if (typ === 'korrektur') delta = menge;

      const nextMenge = Number(mat.menge) + delta;
      if (nextMenge < 0) return { error: 'NEGATIVE_STOCK' };

      stmtRun(db, 'BEGIN IMMEDIATE');
      try {
        stmtRun(
          db,
          `INSERT INTO lager_buchungen (id, material_id, menge, typ, mitarbeiter_id, auftrag_id, bemerkung, erstellt_am)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            row.id,
            materialId,
            menge,
            typ,
            row.mitarbeiter_id ?? null,
            row.auftrag_id ?? null,
            row.bemerkung ?? null,
          ],
        );
        stmtRun(
          db,
          `UPDATE lager_material
           SET menge = ?, aktualisiert_am = datetime('now')
           WHERE id = ? AND firma_id = ?`,
          [nextMenge, materialId, firmaId],
        );
        stmtRun(db, 'COMMIT');
      } catch (e) {
        try { stmtRun(db, 'ROLLBACK'); } catch {}
        return { error: 'DATABASE_ERROR', detail: e instanceof Error ? e.message : String(e) };
      }
      persist();
      const nextMaterial = this.getLagerMaterialById(materialId, firmaId);
      const buchung = stmtGet(
        db,
        `SELECT id, material_id, menge, typ, mitarbeiter_id, auftrag_id, bemerkung, erstellt_am
         FROM lager_buchungen WHERE id = ? LIMIT 1`,
        [row.id],
      );
      return { material: nextMaterial, buchung };
    },
    listCcInternAnfragenByFirma(firmaId, { offset = 0, limit = 50, status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE a.firma_id = ? AND (a.deleted_at IS NULL OR TRIM(COALESCE(a.deleted_at, \'\')) = \'\')';
      if (status) {
        where += ' AND a.status = ?';
        params.push(String(status).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return stmtAll(
        db,
        `SELECT a.id, a.anfragen_nr, a.kunde_id, a.betreff, a.beschreibung, a.status, a.zugewiesen_an, a.antwort_bis,
                a.firma_id, a.erstellt_von, a.erstellt_am, a.aktualisiert_am,
                f.name AS kunde_name, u.name AS zugewiesen_name
         FROM ccintern_anfragen a
         LEFT JOIN firmen f ON f.id = a.kunde_id
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         ${where}
         ORDER BY datetime(a.erstellt_am) DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    countCcInternAnfragenByFirma(firmaId, { status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ? AND (deleted_at IS NULL OR TRIM(COALESCE(deleted_at, \'\')) = \'\')';
      if (status) {
        where += ' AND status = ?';
        params.push(String(status).trim());
      }
      const row = stmtGet(db, `SELECT COUNT(*) AS c FROM ccintern_anfragen ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    getCcInternAnfrageById(id, firmaId) {
      const aid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!aid || !fid) return null;
      return stmtGet(
        db,
        `SELECT a.id, a.anfragen_nr, a.kunde_id, a.betreff, a.beschreibung, a.status, a.zugewiesen_an, a.antwort_bis,
                a.firma_id, a.erstellt_von, a.erstellt_am, a.aktualisiert_am,
                f.name AS kunde_name, u.name AS zugewiesen_name
         FROM ccintern_anfragen a
         LEFT JOIN firmen f ON f.id = a.kunde_id
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         WHERE a.id = ? AND a.firma_id = ? AND (a.deleted_at IS NULL OR TRIM(COALESCE(a.deleted_at, \'\')) = \'\')
         LIMIT 1`,
        [aid, fid],
      );
    },
    getLastCcInternAnfragenNrForYear(year) {
      const yy = Number(year);
      if (!Number.isInteger(yy)) return null;
      return stmtGet(
        db,
        `SELECT anfragen_nr
         FROM ccintern_anfragen
         WHERE anfragen_nr LIKE ?
         ORDER BY anfragen_nr DESC
         LIMIT 1`,
        [`ANF-${yy}-%`],
      );
    },
    insertCcInternAnfrage(row) {
      stmtRun(
        db,
        `INSERT INTO ccintern_anfragen
          (id, anfragen_nr, kunde_id, betreff, beschreibung, status, zugewiesen_an, antwort_bis, firma_id, erstellt_von, erstellt_am, aktualisiert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          row.id,
          row.anfragen_nr,
          row.kunde_id ?? null,
          row.betreff,
          row.beschreibung ?? null,
          row.status,
          row.zugewiesen_an ?? null,
          row.antwort_bis ?? null,
          row.firma_id,
          row.erstellt_von ?? null,
        ],
      );
      persist();
      return this.getCcInternAnfrageById(row.id, row.firma_id);
    },
    updateCcInternAnfrage(id, firmaId, patch) {
      const cur = this.getCcInternAnfrageById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE ccintern_anfragen
         SET kunde_id = ?, betreff = ?, beschreibung = ?, status = ?, zugewiesen_an = ?, antwort_bis = ?, aktualisiert_am = datetime('now')
         WHERE id = ? AND firma_id = ? AND (deleted_at IS NULL OR TRIM(COALESCE(deleted_at, \'\')) = \'\')`,
        [
          next.kunde_id ?? null,
          next.betreff,
          next.beschreibung ?? null,
          next.status,
          next.zugewiesen_an ?? null,
          next.antwort_bis ?? null,
          String(id).trim(),
          String(firmaId).trim(),
        ],
      );
      persist();
      return this.getCcInternAnfrageById(id, firmaId);
    },
    deleteCcInternAnfrage(id, firmaId) {
      const aid = String(id).trim();
      const fid = String(firmaId).trim();
      if (!aid || !fid) return false;
      const cur = this.getCcInternAnfrageById(id, firmaId);
      if (!cur) return false;
      stmtRun(
        db,
        `UPDATE ccintern_anfragen
         SET deleted_at = datetime('now'), aktualisiert_am = datetime('now')
         WHERE id = ? AND firma_id = ? AND (deleted_at IS NULL OR TRIM(COALESCE(deleted_at, \'\')) = \'\')`,
        [aid, fid],
      );
      persist();
      return this.getCcInternAnfrageById(id, fid) == null;
    },
    listCcInternAngeboteByProject(projectId, { offset = 0, limit = 200 } = {}) {
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!pid) return [];
      return stmtAll(
        db,
        `SELECT id, project_id, kunde_id, titel, beschreibung, betrag_cent, status, origin,
                erstellt_von, created_at, updated_at, deleted_at
         FROM ccintern_angebote
         WHERE project_id = ? AND deleted_at IS NULL
         ORDER BY datetime(created_at) DESC, id
         LIMIT ? OFFSET ?`,
        [pid, Number(limit) || 200, Number(offset) || 0],
      );
    },
    getCcInternAngebotById(id, projectId) {
      const aid = typeof id === 'string' ? id.trim() : '';
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!aid || !pid) return null;
      return stmtGet(
        db,
        `SELECT id, project_id, kunde_id, titel, beschreibung, betrag_cent, status, origin,
                erstellt_von, created_at, updated_at, deleted_at
         FROM ccintern_angebote
         WHERE id = ? AND project_id = ? AND deleted_at IS NULL
         LIMIT 1`,
        [aid, pid],
      );
    },
    insertCcInternAngebot(row) {
      stmtRun(
        db,
        `INSERT INTO ccintern_angebote
          (id, project_id, kunde_id, titel, beschreibung, betrag_cent, status, origin, erstellt_von, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ccintern', ?, datetime('now'), datetime('now'), NULL)`,
        [
          row.id,
          row.project_id,
          row.kunde_id ?? null,
          row.titel,
          row.beschreibung ?? null,
          Number.parseInt(String(row.betrag_cent ?? 0), 10) || 0,
          row.status ?? 'offen',
          row.erstellt_von ?? null,
        ],
      );
      persist();
      return this.getCcInternAngebotById(row.id, row.project_id);
    },
    updateCcInternAngebot(id, projectId, patch) {
      const cur = this.getCcInternAngebotById(id, projectId);
      if (!cur) return null;
      const next = { ...cur, ...patch, origin: 'ccintern' };
      stmtRun(
        db,
        `UPDATE ccintern_angebote
         SET kunde_id = ?, titel = ?, beschreibung = ?, betrag_cent = ?, status = ?, origin = 'ccintern',
             updated_at = datetime('now')
         WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
        [
          next.kunde_id ?? null,
          next.titel,
          next.beschreibung ?? null,
          Number.parseInt(String(next.betrag_cent ?? 0), 10) || 0,
          next.status ?? 'offen',
          String(id).trim(),
          String(projectId).trim(),
        ],
      );
      persist();
      return this.getCcInternAngebotById(id, projectId);
    },
    softDeleteCcInternAngebot(id, projectId) {
      const cur = this.getCcInternAngebotById(id, projectId);
      if (!cur) return false;
      stmtRun(
        db,
        `UPDATE ccintern_angebote
         SET deleted_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
        [String(id).trim(), String(projectId).trim()],
      );
      persist();
      return true;
    },
    listAufgabenByFirma(firmaId, { offset = 0, limit = 50, status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE a.firma_id = ?';
      if (status) {
        where += ' AND a.status = ?';
        params.push(String(status).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return stmtAll(
        db,
        `SELECT a.id, a.titel, a.beschreibung, a.zugewiesen_an, a.auftrag_id, a.faellig_am,
                a.status, a.prioritaet, a.firma_id, a.erstellt_von, a.erstellt_am, a.aktualisiert_am,
                u.name AS zugewiesen_name
         FROM aufgaben a
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         ${where}
         ORDER BY datetime(a.erstellt_am) DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    countAufgabenByFirma(firmaId, { status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      if (status) {
        where += ' AND status = ?';
        params.push(String(status).trim());
      }
      const row = stmtGet(db, `SELECT COUNT(*) AS c FROM aufgaben ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    getAufgabeById(id, firmaId) {
      const aid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!aid || !fid) return null;
      return stmtGet(
        db,
        `SELECT a.id, a.titel, a.beschreibung, a.zugewiesen_an, a.auftrag_id, a.faellig_am,
                a.status, a.prioritaet, a.firma_id, a.erstellt_von, a.erstellt_am, a.aktualisiert_am,
                u.name AS zugewiesen_name
         FROM aufgaben a
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         WHERE a.id = ? AND a.firma_id = ?
         LIMIT 1`,
        [aid, fid],
      );
    },
    insertAufgabe(row) {
      stmtRun(
        db,
        `INSERT INTO aufgaben
          (id, titel, beschreibung, zugewiesen_an, auftrag_id, faellig_am, status, prioritaet, firma_id, erstellt_von, erstellt_am, aktualisiert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          row.id,
          row.titel,
          row.beschreibung ?? null,
          row.zugewiesen_an ?? null,
          row.auftrag_id ?? null,
          row.faellig_am ?? null,
          row.status,
          row.prioritaet,
          row.firma_id,
          row.erstellt_von ?? null,
        ],
      );
      persist();
      return this.getAufgabeById(row.id, row.firma_id);
    },
    updateAufgabe(id, firmaId, patch) {
      const cur = this.getAufgabeById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE aufgaben
         SET titel = ?, beschreibung = ?, zugewiesen_an = ?, auftrag_id = ?, faellig_am = ?, status = ?, prioritaet = ?, aktualisiert_am = datetime('now')
         WHERE id = ? AND firma_id = ?`,
        [
          next.titel,
          next.beschreibung ?? null,
          next.zugewiesen_an ?? null,
          next.auftrag_id ?? null,
          next.faellig_am ?? null,
          next.status,
          next.prioritaet,
          String(id).trim(),
          String(firmaId).trim(),
        ],
      );
      persist();
      return this.getAufgabeById(id, firmaId);
    },
    deleteAufgabe(id, firmaId) {
      const cur = this.getAufgabeById(id, firmaId);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM aufgaben WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      persist();
      return true;
    },
    listCcInternRechnungenByFirma(firmaId, { offset = 0, limit = 50, status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE r.firma_id = ? AND (r.deleted_at IS NULL OR TRIM(COALESCE(r.deleted_at, \'\')) = \'\')';
      if (status) {
        where += ' AND r.status = ?';
        params.push(String(status).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return stmtAll(
        db,
        `SELECT r.id, r.rechnungsnummer, r.auftrag_id, r.status, r.faellig_am, r.bezahlt_am, r.bemerkung,
                r.firma_id, r.erstellt_von, r.erstellt_am, r.aktualisiert_am,
                a.auftragsnummer, a.kunde
         FROM ccintern_rechnungen r
         LEFT JOIN ccintern_auftraege a ON a.id = r.auftrag_id
         ${where}
         ORDER BY datetime(r.erstellt_am) DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    countCcInternRechnungenByFirma(firmaId, { status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ? AND (deleted_at IS NULL OR TRIM(COALESCE(deleted_at, \'\')) = \'\')';
      if (status) {
        where += ' AND status = ?';
        params.push(String(status).trim());
      }
      const row = stmtGet(db, `SELECT COUNT(*) AS c FROM ccintern_rechnungen ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    getCcInternRechnungById(id, firmaId) {
      const rid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!rid || !fid) return null;
      return stmtGet(
        db,
        `SELECT r.id, r.rechnungsnummer, r.auftrag_id, r.status, r.faellig_am, r.bezahlt_am, r.bemerkung,
                r.firma_id, r.erstellt_von, r.erstellt_am, r.aktualisiert_am,
                a.auftragsnummer, a.kunde
         FROM ccintern_rechnungen r
         LEFT JOIN ccintern_auftraege a ON a.id = r.auftrag_id
         WHERE r.id = ? AND r.firma_id = ? AND (r.deleted_at IS NULL OR TRIM(COALESCE(r.deleted_at, \'\')) = \'\')
         LIMIT 1`,
        [rid, fid],
      );
    },
    getLastCcInternRechnungsnummerForYear(year) {
      const yy = Number(year);
      if (!Number.isInteger(yy)) return null;
      return stmtGet(
        db,
        `SELECT rechnungsnummer
         FROM ccintern_rechnungen
         WHERE rechnungsnummer LIKE ?
         ORDER BY rechnungsnummer DESC
         LIMIT 1`,
        [`RE-${yy}-%`],
      );
    },
    insertCcInternRechnung(row) {
      stmtRun(
        db,
        `INSERT INTO ccintern_rechnungen
          (id, rechnungsnummer, auftrag_id, status, faellig_am, bezahlt_am, bemerkung, firma_id, erstellt_von, erstellt_am, aktualisiert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          row.id,
          row.rechnungsnummer,
          row.auftrag_id,
          row.status,
          row.faellig_am ?? null,
          row.bezahlt_am ?? null,
          row.bemerkung ?? null,
          row.firma_id,
          row.erstellt_von ?? null,
        ],
      );
      persist();
      return this.getCcInternRechnungById(row.id, row.firma_id);
    },
    updateCcInternRechnung(id, firmaId, patch) {
      const cur = this.getCcInternRechnungById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE ccintern_rechnungen
         SET auftrag_id = ?, status = ?, faellig_am = ?, bezahlt_am = ?, bemerkung = ?, aktualisiert_am = datetime('now')
         WHERE id = ? AND firma_id = ? AND (deleted_at IS NULL OR TRIM(COALESCE(deleted_at, \'\')) = \'\')`,
        [
          next.auftrag_id,
          next.status,
          next.faellig_am ?? null,
          next.bezahlt_am ?? null,
          next.bemerkung ?? null,
          String(id).trim(),
          String(firmaId).trim(),
        ],
      );
      persist();
      return this.getCcInternRechnungById(id, firmaId);
    },
    deleteCcInternRechnung(id, firmaId) {
      const cur = this.getCcInternRechnungById(id, firmaId);
      if (!cur) return false;
      stmtRun(
        db,
        `UPDATE ccintern_rechnungen
         SET deleted_at = datetime('now'), aktualisiert_am = datetime('now')
         WHERE id = ? AND firma_id = ? AND (deleted_at IS NULL OR TRIM(COALESCE(deleted_at, \'\')) = \'\')`,
        [String(id).trim(), String(firmaId).trim()],
      );
      persist();
      return this.getCcInternRechnungById(id, firmaId) == null;
    },
    countMitarbeiterByFirma(firmaId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      const row = stmtGet(
        db,
        `SELECT COUNT(*) AS c
         FROM mitarbeiter m
         INNER JOIN users u ON u.id = m.user_id
         WHERE m.firma_id = ?
         LIMIT 1`,
        [fid],
      );
      return Number(row?.c || 0);
    },
    listMitarbeiterByFirma(firmaId, { offset = 0, limit = 50 } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      const lim = Number(limit) || 50;
      const off = Number(offset) || 0;
      return stmtAll(
        db,
        `SELECT m.id, m.user_id, m.firma_id, m.vertrag_typ, m.soll_stunden, m.eintrittsdatum, m.austrittsdatum,
                m.position, m.created_at, u.email AS user_email, u.name AS user_name
         FROM mitarbeiter m
         INNER JOIN users u ON u.id = m.user_id
         WHERE m.firma_id = ?
         ORDER BY datetime(m.created_at) DESC, m.id
         LIMIT ? OFFSET ?`,
        [fid, lim, off],
      );
    },
    getMitarbeiterById(id, firmaId) {
      const mid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!mid || !fid) return null;
      return stmtGet(
        db,
        `SELECT m.id, m.user_id, m.firma_id, m.vertrag_typ, m.soll_stunden, m.eintrittsdatum, m.austrittsdatum,
                m.position, m.created_at, u.email AS user_email, u.name AS user_name
         FROM mitarbeiter m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.id = ? AND m.firma_id = ?
         LIMIT 1`,
        [mid, fid],
      );
    },
    getMitarbeiterByUserAndFirma(userId, firmaId) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!uid || !fid) return null;
      return stmtGet(
        db,
        `SELECT m.id, m.user_id, m.firma_id, m.vertrag_typ, m.soll_stunden, m.eintrittsdatum, m.austrittsdatum,
                m.position, m.created_at, u.email AS user_email, u.name AS user_name
         FROM mitarbeiter m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.user_id = ? AND m.firma_id = ?
         LIMIT 1`,
        [uid, fid],
      );
    },
    insertMitarbeiter(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      stmtRun(
        db,
        `INSERT INTO mitarbeiter (id, user_id, firma_id, vertrag_typ, soll_stunden, eintrittsdatum, austrittsdatum, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          id,
          row.user_id,
          row.firma_id,
          row.vertrag_typ ?? null,
          row.soll_stunden != null && Number.isFinite(Number(row.soll_stunden)) ? Number(row.soll_stunden) : null,
          row.eintrittsdatum ?? null,
          row.austrittsdatum ?? null,
          row.position ?? null,
        ],
      );
      persist();
      return this.getMitarbeiterById(id, row.firma_id);
    },
    updateMitarbeiter(id, firmaId, patch) {
      const cur = this.getMitarbeiterById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE mitarbeiter
         SET user_id = ?, vertrag_typ = ?, soll_stunden = ?, eintrittsdatum = ?, austrittsdatum = ?, position = ?
         WHERE id = ? AND firma_id = ?`,
        [
          String(next.user_id || cur.user_id).trim(),
          next.vertrag_typ ?? null,
          next.soll_stunden != null && Number.isFinite(Number(next.soll_stunden)) ? Number(next.soll_stunden) : null,
          next.eintrittsdatum ?? null,
          next.austrittsdatum ?? null,
          next.position ?? null,
          String(id).trim(),
          String(firmaId).trim(),
        ],
      );
      persist();
      return this.getMitarbeiterById(id, firmaId);
    },
    deleteMitarbeiter(id, firmaId) {
      const mid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!mid || !fid) return false;
      stmtRun(db, 'DELETE FROM mitarbeiter WHERE id = ? AND firma_id = ?', [mid, fid]);
      persist();
      return true;
    },
    countChecklistenByFirma(firmaId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      const row = stmtGet(db, 'SELECT COUNT(*) AS c FROM checklisten WHERE firma_id = ? LIMIT 1', [fid]);
      return Number(row?.c || 0);
    },
    listChecklistenByFirma(firmaId, { offset = 0, limit = 50 } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      const lim = Number(limit) || 50;
      const off = Number(offset) || 0;
      return stmtAll(
        db,
        `SELECT id, titel, firma_id, auftrag_id, erstellt_von, created_at
         FROM checklisten
         WHERE firma_id = ?
         ORDER BY datetime(created_at) DESC, id
         LIMIT ? OFFSET ?`,
        [fid, lim, off],
      );
    },
    getChecklisteById(id, firmaId) {
      const cid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!cid || !fid) return null;
      return stmtGet(
        db,
        'SELECT id, titel, firma_id, auftrag_id, erstellt_von, created_at FROM checklisten WHERE id = ? AND firma_id = ? LIMIT 1',
        [cid, fid],
      );
    },
    listChecklistenEintraegeForCheckliste(checklisteId) {
      const cid = typeof checklisteId === 'string' ? checklisteId.trim() : '';
      if (!cid) return [];
      return stmtAll(
        db,
        'SELECT id, checkliste_id, text, erledigt, reihenfolge FROM checklisten_eintraege WHERE checkliste_id = ? ORDER BY reihenfolge ASC, id ASC',
        [cid],
      );
    },
    nextChecklisteEintragReihenfolge(checklisteId) {
      const cid = typeof checklisteId === 'string' ? checklisteId.trim() : '';
      if (!cid) return 0;
      const row = stmtGet(
        db,
        'SELECT COALESCE(MAX(reihenfolge), -1) AS m FROM checklisten_eintraege WHERE checkliste_id = ? LIMIT 1',
        [cid],
      );
      return Number(row?.m ?? -1) + 1;
    },
    insertCheckliste(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      stmtRun(
        db,
        `INSERT INTO checklisten (id, titel, firma_id, auftrag_id, erstellt_von, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [id, row.titel, row.firma_id, row.auftrag_id ?? null, row.erstellt_von ?? null],
      );
      persist();
      return this.getChecklisteById(id, row.firma_id);
    },
    updateCheckliste(id, firmaId, patch) {
      const cur = this.getChecklisteById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        'UPDATE checklisten SET titel = ?, auftrag_id = ? WHERE id = ? AND firma_id = ?',
        [String(next.titel || '').trim() || cur.titel, next.auftrag_id ?? null, String(id).trim(), String(firmaId).trim()],
      );
      persist();
      return this.getChecklisteById(id, firmaId);
    },
    deleteCheckliste(id, firmaId) {
      const cid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!cid || !fid) return false;
      stmtRun(db, 'DELETE FROM checklisten WHERE id = ? AND firma_id = ?', [cid, fid]);
      persist();
      return true;
    },
    getChecklisteEintragByIdAndFirma(eintragId, firmaId) {
      const eid = typeof eintragId === 'string' ? eintragId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!eid || !fid) return null;
      return stmtGet(
        db,
        `SELECT e.id, e.checkliste_id, e.text, e.erledigt, e.reihenfolge
         FROM checklisten_eintraege e
         INNER JOIN checklisten c ON c.id = e.checkliste_id
         WHERE e.id = ? AND c.firma_id = ?
         LIMIT 1`,
        [eid, fid],
      );
    },
    insertChecklisteEintrag(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      const erl = row.erledigt ? 1 : 0;
      stmtRun(
        db,
        `INSERT INTO checklisten_eintraege (id, checkliste_id, text, erledigt, reihenfolge)
         VALUES (?, ?, ?, ?, ?)`,
        [id, row.checkliste_id, row.text, erl, Number(row.reihenfolge) || 0],
      );
      persist();
      return stmtGet(db, 'SELECT id, checkliste_id, text, erledigt, reihenfolge FROM checklisten_eintraege WHERE id = ? LIMIT 1', [
        id,
      ]);
    },
    updateChecklisteEintrag(eintragId, firmaId, patch) {
      const cur = this.getChecklisteEintragByIdAndFirma(eintragId, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      const erl = next.erledigt ? 1 : 0;
      stmtRun(
        db,
        `UPDATE checklisten_eintraege
         SET text = ?, erledigt = ?, reihenfolge = ?
         WHERE id = ? AND checkliste_id IN (SELECT id FROM checklisten WHERE firma_id = ?)`,
        [String(next.text || '').trim() || cur.text, erl, Number(next.reihenfolge) || 0, String(eintragId).trim(), String(firmaId).trim()],
      );
      persist();
      return this.getChecklisteEintragByIdAndFirma(eintragId, firmaId);
    },
    deleteChecklisteEintrag(eintragId, firmaId) {
      const eid = typeof eintragId === 'string' ? eintragId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!eid || !fid) return false;
      stmtRun(
        db,
        'DELETE FROM checklisten_eintraege WHERE id = ? AND checkliste_id IN (SELECT id FROM checklisten WHERE firma_id = ?)',
        [eid, fid],
      );
      persist();
      return true;
    },
    countProduktionAuftraegeByFirma(firmaId, { auftragId = null, verantwortlich = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      const aid = auftragId != null && String(auftragId).trim() ? String(auftragId).trim() : '';
      if (aid) {
        where += ' AND auftrag_id = ?';
        params.push(aid);
      }
      const vid = verantwortlich != null && String(verantwortlich).trim() ? String(verantwortlich).trim() : '';
      if (vid) {
        where += ' AND verantwortlich = ?';
        params.push(vid);
      }
      const row = stmtGet(db, `SELECT COUNT(*) AS c FROM produktion_auftraege ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    listProduktionAuftraegeByFirma(firmaId, { offset = 0, limit = 50, auftragId = null, verantwortlich = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      const lim = Number(limit) || 50;
      const off = Number(offset) || 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      const aid = auftragId != null && String(auftragId).trim() ? String(auftragId).trim() : '';
      if (aid) {
        where += ' AND auftrag_id = ?';
        params.push(aid);
      }
      const vid = verantwortlich != null && String(verantwortlich).trim() ? String(verantwortlich).trim() : '';
      if (vid) {
        where += ' AND verantwortlich = ?';
        params.push(vid);
      }
      params.push(lim, off);
      return stmtAll(
        db,
        `SELECT id, auftrag_id, schritt, fortschritt, verantwortlich, notiz, gestartet_am, abgeschlossen_am, firma_id
         FROM produktion_auftraege
         ${where}
         ORDER BY id DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    /** Mitarbeiter-App: Produktionszeilen, wenn MA `verantwortlich` ist oder im Workflow-Schritt (bemerkung) vorkommt. */
    listProduktionAuftraegeForMitarbeiterApp(firmaId, userId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!fid || !uid) return [];
      const rows = this.listProduktionAuftraegeByFirma(fid, { offset: 0, limit: 500 });
      /** @type {Map<string, any>} */
      const cache = new Map();
      /** @type {any[]} */
      const out = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const aid = row.auftrag_id != null ? String(row.auftrag_id).trim() : '';
        if (!aid) continue;
        const v = row.verantwortlich != null ? String(row.verantwortlich).trim() : '';
        if (v === uid) {
          out.push(row);
          continue;
        }
        if (!cache.has(aid)) {
          cache.set(aid, this.getCcInternAuftragById(aid, fid));
        }
        const auf = cache.get(aid);
        const bem = auf && auf.bemerkung != null ? String(auf.bemerkung) : '';
        if (
          userAssignedToProduktionSchrittInBemerkung(bem, row.schritt, uid) ||
          userReferencedInAnyWorkflowSchritt(bem, uid)
        ) {
          out.push(row);
        }
      }
      return out;
    },
    /**
     * CC-Intern mit Workflow in `bemerkung`: eine Produktionszeile für die Mitarbeiter-App, falls noch keine existiert.
     * @param {string} auftragId ccintern_auftraege.id
     * @param {string} firmaId
     * @returns {object|null}
     */
    ensureProduktionRowForCcInternAuftrag(auftragId, firmaId) {
      const aid = auftragId != null ? String(auftragId).trim() : '';
      const fid = firmaId != null ? String(firmaId).trim() : '';
      if (!aid || !fid) return null;
      const cntRow = stmtGet(
        db,
        `SELECT COUNT(*) AS c FROM produktion_auftraege WHERE auftrag_id = ? AND firma_id = ?`,
        [aid, fid],
      );
      if (Number(cntRow?.c || 0) > 0) {
        return stmtGet(
          db,
          `SELECT id, auftrag_id, schritt, fortschritt, verantwortlich, notiz, gestartet_am, abgeschlossen_am, firma_id
           FROM produktion_auftraege WHERE auftrag_id = ? AND firma_id = ? ORDER BY id DESC LIMIT 1`,
          [aid, fid],
        );
      }
      const auf = this.getCcInternAuftragById(aid, fid);
      if (!auf) return null;
      const bem = auf.bemerkung != null ? String(auf.bemerkung) : '';
      const payload = parseCcinternBemerkungPayload(bem);
      if (!payload || !payload.schritte || typeof payload.schritte !== 'object') return null;
      const schritte = /** @type {Record<string, unknown>} */ (payload.schritte);
      if (!Object.keys(schritte).length) return null;
      const stepRaw = workflowCurrentStepFromAuftragRow(bem, auf.schritt);
      if (!stepRaw || String(stepRaw).trim() === '') return null;
      const sch = findSchrittObjektFuerSchritt(schritte, stepRaw);
      const vid = verantwortlichUuidFromCcinternSchrittObjekt(sch);
      if (!vid) return null;
      return this.insertProduktionAuftrag({
        auftrag_id: aid,
        schritt: String(stepRaw).trim(),
        fortschritt: 0,
        verantwortlich: vid,
        notiz: null,
        gestartet_am: null,
        abgeschlossen_am: null,
        firma_id: fid,
      });
    },
    getProduktionAuftragById(id, firmaId) {
      const pid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!pid || !fid) return null;
      return stmtGet(
        db,
        `SELECT id, auftrag_id, schritt, fortschritt, verantwortlich, notiz, gestartet_am, abgeschlossen_am, firma_id
         FROM produktion_auftraege
         WHERE id = ? AND firma_id = ?
         LIMIT 1`,
        [pid, fid],
      );
    },
    insertProduktionAuftrag(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      const fort = Math.round(Number(row.fortschritt));
      const f = Number.isFinite(fort) ? fort : 0;
      stmtRun(
        db,
        `INSERT INTO produktion_auftraege (id, auftrag_id, schritt, fortschritt, verantwortlich, notiz, gestartet_am, abgeschlossen_am, firma_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          row.auftrag_id,
          row.schritt,
          f,
          row.verantwortlich ?? null,
          row.notiz != null ? String(row.notiz) : null,
          row.gestartet_am != null && String(row.gestartet_am).trim() !== '' ? String(row.gestartet_am).trim() : null,
          row.abgeschlossen_am != null && String(row.abgeschlossen_am).trim() !== '' ? String(row.abgeschlossen_am).trim() : null,
          row.firma_id,
        ],
      );
      persist();
      return this.getProduktionAuftragById(id, row.firma_id);
    },
    updateProduktionAuftrag(id, firmaId, patch) {
      const cur = this.getProduktionAuftragById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      const fort = Math.round(Number(next.fortschritt));
      const f = Number.isFinite(fort) ? fort : 0;
      stmtRun(
        db,
        `UPDATE produktion_auftraege
         SET auftrag_id = ?, schritt = ?, fortschritt = ?, verantwortlich = ?, notiz = ?, gestartet_am = ?, abgeschlossen_am = ?
         WHERE id = ? AND firma_id = ?`,
        [
          String(next.auftrag_id || '').trim() || cur.auftrag_id,
          String(next.schritt || '').trim() || cur.schritt,
          f,
          next.verantwortlich != null && String(next.verantwortlich).trim() ? String(next.verantwortlich).trim() : null,
          next.notiz != null ? String(next.notiz) : null,
          next.gestartet_am != null && String(next.gestartet_am).trim() !== '' ? String(next.gestartet_am).trim() : null,
          next.abgeschlossen_am != null && String(next.abgeschlossen_am).trim() !== '' ? String(next.abgeschlossen_am).trim() : null,
          String(id).trim(),
          String(firmaId).trim(),
        ],
      );
      persist();
      return this.getProduktionAuftragById(id, firmaId);
    },
    countFusaDokumente({ projectId = null, auftragId = null, fahrzeugId = null } = {}) {
      /** @type {any[]} */
      const params = [];
      let where = 'WHERE 1=1';
      const pid = projectId != null && String(projectId).trim() ? String(projectId).trim() : '';
      if (pid) {
        where += ' AND project_id = ?';
        params.push(pid);
      }
      const aid = auftragId != null && String(auftragId).trim() ? String(auftragId).trim() : '';
      if (aid) {
        where += ' AND auftrag_id = ?';
        params.push(aid);
      }
      const fid = fahrzeugId != null && String(fahrzeugId).trim() ? String(fahrzeugId).trim() : '';
      if (fid) {
        where += ' AND fahrzeug_id = ?';
        params.push(fid);
      }
      const row = stmtGet(db, `SELECT COUNT(*) AS c FROM fusa_dokumente ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    listFusaDokumente({ projectId = null, auftragId = null, fahrzeugId = null, offset = 0, limit = 50 } = {}) {
      /** @type {any[]} */
      const params = [];
      let where = 'WHERE 1=1';
      const pid = projectId != null && String(projectId).trim() ? String(projectId).trim() : '';
      if (pid) {
        where += ' AND project_id = ?';
        params.push(pid);
      }
      const aid = auftragId != null && String(auftragId).trim() ? String(auftragId).trim() : '';
      if (aid) {
        where += ' AND auftrag_id = ?';
        params.push(aid);
      }
      const fzid = fahrzeugId != null && String(fahrzeugId).trim() ? String(fahrzeugId).trim() : '';
      if (fzid) {
        where += ' AND fahrzeug_id = ?';
        params.push(fzid);
      }
      const lim = Number(limit) || 50;
      const off = Number(offset) || 0;
      params.push(lim, off);
      return stmtAll(
        db,
        `SELECT id, auftrag_id, fahrzeug_id, name, typ, url, groesse, hochgeladen_von, created_at, project_id
         FROM fusa_dokumente
         ${where}
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    getFusaDokumentById(id) {
      const did = typeof id === 'string' ? id.trim() : '';
      if (!did) return null;
      return stmtGet(
        db,
        `SELECT id, auftrag_id, fahrzeug_id, name, typ, url, groesse, hochgeladen_von, created_at, project_id
         FROM fusa_dokumente WHERE id = ? LIMIT 1`,
        [did],
      );
    },
    insertFusaDokument(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      const g = Number(row.groesse);
      const groesse = Number.isFinite(g) && g >= 0 ? g : 0;
      stmtRun(
        db,
        `INSERT INTO fusa_dokumente (id, auftrag_id, fahrzeug_id, name, typ, url, groesse, hochgeladen_von, created_at, project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
        [
          id,
          row.auftrag_id,
          row.fahrzeug_id ?? null,
          row.name,
          row.typ,
          row.url,
          groesse,
          row.hochgeladen_von ?? null,
          row.project_id,
        ],
      );
      persist();
      return this.getFusaDokumentById(id);
    },
    deleteFusaDokument(id) {
      const did = typeof id === 'string' ? id.trim() : '';
      if (!did) return false;
      const cur = stmtGet(db, 'SELECT id FROM fusa_dokumente WHERE id = ? LIMIT 1', [did]);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM fusa_dokumente WHERE id = ?', [did]);
      persist();
      return true;
    },
    countFusaAngebote({ projectId = null, fusaKundeId = null, status = null } = {}) {
      /** @type {any[]} */
      const params = [];
      let where = 'WHERE 1=1';
      const pid = projectId != null && String(projectId).trim() ? String(projectId).trim() : '';
      if (pid) {
        where += ' AND project_id = ?';
        params.push(pid);
      }
      const kid = fusaKundeId != null && String(fusaKundeId).trim() ? String(fusaKundeId).trim() : '';
      if (kid) {
        where += ' AND fusa_kunde_id = ?';
        params.push(kid);
      }
      const st = status != null && String(status).trim() ? String(status).trim() : '';
      if (st) {
        where += ' AND status = ?';
        params.push(st);
      }
      const row = stmtGet(db, `SELECT COUNT(*) AS c FROM fusa_angebote ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    listFusaAngebote({ projectId = null, fusaKundeId = null, status = null, offset = 0, limit = 50 } = {}) {
      /** @type {any[]} */
      const params = [];
      let where = 'WHERE 1=1';
      const pid = projectId != null && String(projectId).trim() ? String(projectId).trim() : '';
      if (pid) {
        where += ' AND project_id = ?';
        params.push(pid);
      }
      const kid = fusaKundeId != null && String(fusaKundeId).trim() ? String(fusaKundeId).trim() : '';
      if (kid) {
        where += ' AND fusa_kunde_id = ?';
        params.push(kid);
      }
      const st = status != null && String(status).trim() ? String(status).trim() : '';
      if (st) {
        where += ' AND status = ?';
        params.push(st);
      }
      const lim = Number(limit) || 50;
      const off = Number(offset) || 0;
      params.push(lim, off);
      return stmtAll(
        db,
        `SELECT id, project_id, fusa_kunde_id, titel, status, gueltig_bis, angebots_json, erstellt_von, created_at
         FROM fusa_angebote
         ${where}
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    getFusaAngebotById(id) {
      const aid = typeof id === 'string' ? id.trim() : '';
      if (!aid) return null;
      return stmtGet(
        db,
        `SELECT id, project_id, fusa_kunde_id, titel, status, gueltig_bis, angebots_json, erstellt_von, created_at
         FROM fusa_angebote WHERE id = ? LIMIT 1`,
        [aid],
      );
    },
    insertFusaAngebot(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      stmtRun(
        db,
        `INSERT INTO fusa_angebote (id, project_id, fusa_kunde_id, titel, status, gueltig_bis, angebots_json, erstellt_von, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          id,
          row.project_id,
          row.fusa_kunde_id,
          row.titel,
          row.status,
          row.gueltig_bis != null && String(row.gueltig_bis).trim() !== '' ? String(row.gueltig_bis).trim() : null,
          row.angebots_json,
          row.erstellt_von ?? null,
        ],
      );
      persist();
      return this.getFusaAngebotById(id);
    },
    updateFusaAngebot(id, patch) {
      const cur = this.getFusaAngebotById(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE fusa_angebote
         SET project_id = ?, fusa_kunde_id = ?, titel = ?, status = ?, gueltig_bis = ?, angebots_json = ?
         WHERE id = ?`,
        [
          String(next.project_id || '').trim() || cur.project_id,
          String(next.fusa_kunde_id || '').trim() || cur.fusa_kunde_id,
          String(next.titel || '').trim() || cur.titel,
          String(next.status || '').trim() || cur.status,
          next.gueltig_bis != null && String(next.gueltig_bis).trim() !== '' ? String(next.gueltig_bis).trim() : null,
          String(next.angebots_json ?? cur.angebots_json),
          String(id).trim(),
        ],
      );
      persist();
      return this.getFusaAngebotById(id);
    },
    deleteFusaAngebot(id) {
      const aid = typeof id === 'string' ? id.trim() : '';
      if (!aid) return false;
      const cur = stmtGet(db, 'SELECT id FROM fusa_angebote WHERE id = ? LIMIT 1', [aid]);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM fusa_angebote WHERE id = ?', [aid]);
      persist();
      return true;
    },
    listMesseflowProjekteByFirma(firmaId, { offset = 0, limit = 50, status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE p.firma_id = ?';
      if (status) {
        where += ' AND p.status = ?';
        params.push(String(status).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return stmtAll(
        db,
        `SELECT p.id, p.name, p.kunde, p.agentur_id, p.lieferdatum, p.status, p.messe, p.stand, p.prioritaet, p.bemerkung,
                p.firma_id, p.erstellt_von, p.erstellt_am, p.aktualisiert_am, f.name AS agentur_name
         FROM messeflow_projekte p
         LEFT JOIN firmen f ON f.id = p.agentur_id
         ${where}
         ORDER BY datetime(p.erstellt_am) DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    countMesseflowProjekteByFirma(firmaId, { status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      if (status) {
        where += ' AND status = ?';
        params.push(String(status).trim());
      }
      const row = stmtGet(db, `SELECT COUNT(*) AS c FROM messeflow_projekte ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    getMesseflowProjektById(id, firmaId) {
      const pid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!pid || !fid) return null;
      return stmtGet(
        db,
        `SELECT p.id, p.name, p.kunde, p.agentur_id, p.lieferdatum, p.status, p.messe, p.stand, p.prioritaet, p.bemerkung,
                p.firma_id, p.erstellt_von, p.erstellt_am, p.aktualisiert_am, f.name AS agentur_name
         FROM messeflow_projekte p
         LEFT JOIN firmen f ON f.id = p.agentur_id
         WHERE p.id = ? AND p.firma_id = ?
         LIMIT 1`,
        [pid, fid],
      );
    },
    insertMesseflowProjekt(row) {
      stmtRun(
        db,
        `INSERT INTO messeflow_projekte
          (id, name, kunde, agentur_id, lieferdatum, status, messe, stand, prioritaet, bemerkung, firma_id, erstellt_von, erstellt_am, aktualisiert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          row.id,
          row.name,
          row.kunde ?? null,
          row.agentur_id ?? null,
          row.lieferdatum ?? null,
          row.status,
          row.messe ?? null,
          row.stand ?? null,
          row.prioritaet ?? null,
          row.bemerkung ?? null,
          row.firma_id,
          row.erstellt_von ?? null,
        ],
      );
      persist();
      return this.getMesseflowProjektById(row.id, row.firma_id);
    },
    updateMesseflowProjekt(id, firmaId, patch) {
      const cur = this.getMesseflowProjektById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE messeflow_projekte
         SET name = ?, kunde = ?, agentur_id = ?, lieferdatum = ?, status = ?, messe = ?, stand = ?, prioritaet = ?, bemerkung = ?,
             aktualisiert_am = datetime('now')
         WHERE id = ? AND firma_id = ?`,
        [
          next.name,
          next.kunde ?? null,
          next.agentur_id ?? null,
          next.lieferdatum ?? null,
          next.status,
          next.messe ?? null,
          next.stand ?? null,
          next.prioritaet ?? null,
          next.bemerkung ?? null,
          String(id).trim(),
          String(firmaId).trim(),
        ],
      );
      persist();
      return this.getMesseflowProjektById(id, firmaId);
    },
    deleteMesseflowProjekt(id, firmaId) {
      const cur = this.getMesseflowProjektById(id, firmaId);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM messeflow_projekte WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      persist();
      return true;
    },
    listMesseflowWaendeByProjekt(projektId) {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      if (!pid) return [];
      return stmtAll(
        db,
        `SELECT id, projekt_id, name, breite, hoehe, einheit, material, status, bemerkung, sort_index, erstellt_am, aktualisiert_am
         FROM messeflow_waende
         WHERE projekt_id = ?
         ORDER BY sort_index ASC, datetime(erstellt_am) ASC`,
        [pid],
      );
    },
    getMesseflowWandById(wandId, projektId) {
      const wid = typeof wandId === 'string' ? wandId.trim() : '';
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      if (!wid || !pid) return null;
      return stmtGet(
        db,
        `SELECT id, projekt_id, name, breite, hoehe, einheit, material, status, bemerkung, sort_index, erstellt_am, aktualisiert_am
         FROM messeflow_waende
         WHERE id = ? AND projekt_id = ?
         LIMIT 1`,
        [wid, pid],
      );
    },
    insertMesseflowWand(row) {
      stmtRun(
        db,
        `INSERT INTO messeflow_waende
          (id, projekt_id, name, breite, hoehe, einheit, material, status, bemerkung, sort_index, erstellt_am, aktualisiert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          row.id,
          row.projekt_id,
          row.name,
          row.breite ?? null,
          row.hoehe ?? null,
          row.einheit ?? null,
          row.material ?? null,
          row.status ?? null,
          row.bemerkung ?? null,
          Number.isFinite(Number(row.sort_index)) ? Number(row.sort_index) : 0,
        ],
      );
      persist();
      return this.getMesseflowWandById(row.id, row.projekt_id);
    },
    updateMesseflowWand(wandId, projektId, patch) {
      const cur = this.getMesseflowWandById(wandId, projektId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE messeflow_waende
         SET name = ?, breite = ?, hoehe = ?, einheit = ?, material = ?, status = ?, bemerkung = ?, sort_index = ?, aktualisiert_am = datetime('now')
         WHERE id = ? AND projekt_id = ?`,
        [
          next.name,
          next.breite ?? null,
          next.hoehe ?? null,
          next.einheit ?? null,
          next.material ?? null,
          next.status ?? null,
          next.bemerkung ?? null,
          Number.isFinite(Number(next.sort_index)) ? Number(next.sort_index) : 0,
          String(wandId).trim(),
          String(projektId).trim(),
        ],
      );
      persist();
      return this.getMesseflowWandById(wandId, projektId);
    },
    deleteMesseflowWand(wandId, projektId) {
      const cur = this.getMesseflowWandById(wandId, projektId);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM messeflow_waende WHERE id = ? AND projekt_id = ?', [
        String(wandId).trim(),
        String(projektId).trim(),
      ]);
      persist();
      return true;
    },
    listMesseflowDateienByWand(wandId) {
      const wid = typeof wandId === 'string' ? wandId.trim() : '';
      if (!wid) return [];
      return stmtAll(
        db,
        `SELECT id, wand_id, name, pfad, mime_type, groesse, status, bemerkung, meta_json, erstellt_am, aktualisiert_am
         FROM messeflow_wand_dateien
         WHERE wand_id = ?
         ORDER BY datetime(erstellt_am) ASC`,
        [wid],
      );
    },
    getMesseflowDateiById(dateiId, wandId) {
      const did = typeof dateiId === 'string' ? dateiId.trim() : '';
      const wid = typeof wandId === 'string' ? wandId.trim() : '';
      if (!did || !wid) return null;
      return stmtGet(
        db,
        `SELECT id, wand_id, name, pfad, mime_type, groesse, status, bemerkung, meta_json, erstellt_am, aktualisiert_am
         FROM messeflow_wand_dateien
         WHERE id = ? AND wand_id = ?
         LIMIT 1`,
        [did, wid],
      );
    },
    insertMesseflowDatei(row) {
      stmtRun(
        db,
        `INSERT INTO messeflow_wand_dateien
          (id, wand_id, name, pfad, mime_type, groesse, status, bemerkung, meta_json, erstellt_am, aktualisiert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          row.id,
          row.wand_id,
          row.name,
          row.pfad ?? null,
          row.mime_type ?? null,
          row.groesse ?? null,
          row.status ?? null,
          row.bemerkung ?? null,
          row.meta_json ?? null,
        ],
      );
      persist();
      return this.getMesseflowDateiById(row.id, row.wand_id);
    },
    updateMesseflowDatei(dateiId, wandId, patch) {
      const cur = this.getMesseflowDateiById(dateiId, wandId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE messeflow_wand_dateien
         SET name = ?, pfad = ?, mime_type = ?, groesse = ?, status = ?, bemerkung = ?, meta_json = ?, aktualisiert_am = datetime('now')
         WHERE id = ? AND wand_id = ?`,
        [
          next.name,
          next.pfad ?? null,
          next.mime_type ?? null,
          next.groesse ?? null,
          next.status ?? null,
          next.bemerkung ?? null,
          next.meta_json ?? null,
          String(dateiId).trim(),
          String(wandId).trim(),
        ],
      );
      persist();
      return this.getMesseflowDateiById(dateiId, wandId);
    },
    getMesseflowWorkspace() {
      try {
        return stmtGet(
          db,
          'SELECT id, payload_json, updated_at FROM messeflow_workspace WHERE id = ? LIMIT 1',
          ['default'],
        ) ?? null;
      } catch {
        return null;
      }
    },
    upsertMesseflowWorkspace({ payloadJson }) {
      const raw = typeof payloadJson === 'string' ? payloadJson : JSON.stringify(payloadJson ?? {});
      const current = this.getMesseflowWorkspace();
      if (current) {
        stmtRun(
          db,
          `UPDATE messeflow_workspace
           SET payload_json = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [raw, 'default'],
        );
      } else {
        stmtRun(
          db,
          `INSERT INTO messeflow_workspace (id, payload_json, updated_at)
           VALUES (?, ?, datetime('now'))`,
          ['default', raw],
        );
      }
      persist();
      return this.getMesseflowWorkspace();
    },
    listMfProjekte() {
      return stmtAll(db, 'SELECT * FROM mf_projekte ORDER BY datetime(created_at) DESC', []);
    },
    getMfProjektById(id) {
      const pid = typeof id === 'string' ? id.trim() : '';
      if (!pid) return null;
      return stmtGet(db, 'SELECT * FROM mf_projekte WHERE id = ? LIMIT 1', [pid]);
    },
    insertMfProjekt(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      stmtRun(
        db,
        `INSERT INTO mf_projekte
          (id, name, status, verantwortlicher, messe_name, messe_datum_von, messe_datum_bis, ort, notizen, extra_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          id,
          row?.name ?? '',
          row?.status ?? 'aktiv',
          row?.verantwortlicher ?? null,
          row?.messe_name ?? null,
          row?.messe_datum_von ?? null,
          row?.messe_datum_bis ?? null,
          row?.ort ?? null,
          row?.notizen ?? null,
          row?.extra_json ?? null,
        ],
      );
      persist();
      return this.getMfProjektById(id);
    },
    updateMfProjektById(id, patch) {
      const cur = this.getMfProjektById(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      stmtRun(
        db,
        `UPDATE mf_projekte
         SET name = ?, status = ?, verantwortlicher = ?, messe_name = ?, messe_datum_von = ?, messe_datum_bis = ?,
             ort = ?, notizen = ?, extra_json = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [
          next.name ?? '',
          next.status ?? 'aktiv',
          next.verantwortlicher ?? null,
          next.messe_name ?? null,
          next.messe_datum_von ?? null,
          next.messe_datum_bis ?? null,
          next.ort ?? null,
          next.notizen ?? null,
          next.extra_json ?? null,
          String(id).trim(),
        ],
      );
      persist();
      return this.getMfProjektById(id);
    },
    deleteMfProjektById(id) {
      const pid = typeof id === 'string' ? id.trim() : '';
      if (!pid) return false;
      const cur = this.getMfProjektById(pid);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM mf_projekte WHERE id = ?', [pid]);
      persist();
      return true;
    },
    listMfProjektUsers(projektId) {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      if (!pid) return [];
      return stmtAll(
        db,
        `SELECT pu.projekt_id, pu.user_id, pu.rolle, u.name AS user_name, u.email AS user_email
         FROM mf_projekt_users pu
         LEFT JOIN users u ON u.id = pu.user_id
         WHERE pu.projekt_id = ?
         ORDER BY u.name ASC`,
        [pid],
      );
    },
    upsertMfProjektUser(projektId, userId, rolle = 'mitarbeiter') {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!pid || !uid) return null;
      stmtRun(
        db,
        `INSERT INTO mf_projekt_users (projekt_id, user_id, rolle)
         VALUES (?, ?, ?)
         ON CONFLICT(projekt_id, user_id) DO UPDATE SET rolle = excluded.rolle`,
        [pid, uid, String(rolle || 'mitarbeiter').trim() || 'mitarbeiter'],
      );
      persist();
      return stmtGet(
        db,
        'SELECT projekt_id, user_id, rolle FROM mf_projekt_users WHERE projekt_id = ? AND user_id = ? LIMIT 1',
        [pid, uid],
      );
    },
    deleteMfProjektUser(projektId, userId) {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!pid || !uid) return false;
      stmtRun(db, 'DELETE FROM mf_projekt_users WHERE projekt_id = ? AND user_id = ?', [pid, uid]);
      persist();
      return true;
    },
    listMfAufgaben(projektId) {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      if (!pid) return [];
      return stmtAll(
        db,
        `SELECT a.*, u.name AS zugewiesen_name
         FROM mf_aufgaben a
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         WHERE a.projekt_id = ?
         ORDER BY datetime(a.created_at) DESC`,
        [pid],
      );
    },
    insertMfAufgabe(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      stmtRun(
        db,
        `INSERT INTO mf_aufgaben
          (id, projekt_id, titel, beschreibung, status, prioritaet, faellig_am, zugewiesen_an, extra_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          id,
          row?.projekt_id,
          row?.titel ?? '',
          row?.beschreibung ?? null,
          row?.status ?? 'offen',
          row?.prioritaet ?? 'normal',
          row?.faellig_am ?? null,
          row?.zugewiesen_an ?? null,
          row?.extra_json != null ? JSON.stringify(row.extra_json) : null,
        ],
      );
      return id;
    },
    updateMfAufgabe(id, patch) {
      if (!id) return null;
      const sets = [];
      const vals = [];
      if (patch.titel !== undefined)        { sets.push('titel = ?');        vals.push(String(patch.titel ?? '')); }
      if (patch.beschreibung !== undefined) { sets.push('beschreibung = ?'); vals.push(patch.beschreibung ?? null); }
      if (patch.status !== undefined)       { sets.push('status = ?');       vals.push(patch.status ?? 'offen'); }
      if (patch.prioritaet !== undefined)   { sets.push('prioritaet = ?');   vals.push(patch.prioritaet ?? null); }
      if (patch.faellig_am !== undefined)   { sets.push('faellig_am = ?');   vals.push(patch.faellig_am ?? null); }
      if (patch.zugewiesen_an !== undefined){ sets.push('zugewiesen_an = ?');vals.push(patch.zugewiesen_an ?? null); }
      if (patch.extra_json !== undefined)   { sets.push('extra_json = ?');   vals.push(patch.extra_json != null ? JSON.stringify(patch.extra_json) : null); }
      if (!sets.length) return null;
      sets.push("updated_at = datetime('now')");
      vals.push(String(id));
      stmtRun(db, `UPDATE mf_aufgaben SET ${sets.join(', ')} WHERE id = ?`, vals);
      return stmtGet(db, `SELECT * FROM mf_aufgaben WHERE id = ? LIMIT 1`, [String(id)]) ?? null;
    },
    deleteMfAufgabe(id) {
      if (!id) return false;
      stmtRun(db, `DELETE FROM mf_aufgaben WHERE id = ?`, [String(id)]);
      return true;
    },
    insertAuditLog(row) {
      stmtRun(
        db,
        `INSERT INTO audit_log (id, ts, user_id, modul, action, resource_type, resource_id, project_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.ts,
          row.userId ?? null,
          row.modul,
          row.action,
          row.resourceType ?? null,
          row.resourceId ?? null,
          row.projectId ?? null,
          row.payloadJson ?? null,
        ],
      );
      persist();
    },
    listAuditLogEntries(limit = 100) {
      const lim = Math.min(500, Math.max(1, Number(limit) || 100));
      return stmtAll(
        db,
        `SELECT id, ts, user_id, modul, action, resource_type, resource_id, project_id, payload_json
         FROM audit_log ORDER BY ts DESC LIMIT ?`,
        [lim],
      );
    },
    /**
     * Audit-Liste mit Filtern und Pagination (Phase B1).
     * @param {{ page?: number, limit?: number, modul?: string, userId?: string, action?: string, resourceType?: string, from?: string, to?: string }} filters
     */
    listAuditLogFiltered(filters = {}) {
      const page = Math.max(1, Math.floor(Number(filters.page) || 1));
      let limit = Math.floor(Number(filters.limit));
      if (!Number.isFinite(limit) || limit < 1) limit = 50;
      limit = Math.min(200, Math.max(1, limit));
      const offset = (page - 1) * limit;

      const cond = [];
      /** @type {unknown[]} */
      const params = [];
      const addEq = (col, val) => {
        const t = typeof val === 'string' ? val.trim() : '';
        if (!t) return;
        cond.push(`${col} = ?`);
        params.push(t);
      };
      addEq('modul', filters.modul);
      addEq('user_id', filters.userId);
      addEq('action', filters.action);
      addEq('resource_type', filters.resourceType);
      const from = typeof filters.from === 'string' ? filters.from.trim() : '';
      if (from) {
        cond.push('ts >= ?');
        params.push(from);
      }
      const to = typeof filters.to === 'string' ? filters.to.trim() : '';
      if (to) {
        cond.push('ts <= ?');
        params.push(to);
      }

      const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
      const countRow = stmtGet(db, `SELECT COUNT(*) AS c FROM audit_log ${where}`, params);
      const total = countRow && countRow.c != null ? Number(countRow.c) : 0;
      const rows = stmtAll(
        db,
        `SELECT id, ts, user_id, modul, action, resource_type, resource_id, project_id, payload_json
         FROM audit_log ${where}
         ORDER BY ts DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      return { rows, total, page, limit };
    },
    /** Phase B2: Dashboard-Aggregate (ein Query je Kennzahl, kein N+1). */
    getDashboardCockpitStats() {
      const auf = stmtGet(
        db,
        `SELECT COUNT(*) AS c FROM auftraege WHERE
          status IS NULL OR TRIM(COALESCE(status,'')) = ''
          OR LOWER(TRIM(status)) NOT IN ('abgeschlossen','geschlossen','storniert','erledigt','fertig','beendet')`,
        [],
      );
      const proj = stmtGet(db, 'SELECT COUNT(*) AS c FROM projects', []);
      const term = stmtGet(
        db,
        `SELECT COUNT(*) AS c FROM kalender_termine WHERE date(start) = date('now')`,
        [],
      );
      const u1 = stmtGet(db, 'SELECT COUNT(*) AS c FROM users', []);
      const u2 = stmtGet(
        db,
        `SELECT COUNT(*) AS c FROM users WHERE COALESCE(LOWER(TRIM(status)),'aktiv') = 'aktiv'`,
        [],
      );
      return {
        auftraege_offen: auf && auf.c != null ? Number(auf.c) : 0,
        projekte_aktiv: proj && proj.c != null ? Number(proj.c) : 0,
        termine_heute: term && term.c != null ? Number(term.c) : 0,
        benutzer_gesamt: u1 && u1.c != null ? Number(u1.c) : 0,
        benutzer_aktiv: u2 && u2.c != null ? Number(u2.c) : 0,
      };
    },
    /**
     * @param {{ projectId?: string|null }} opts
     */
    getDashboardFusaStats(opts = {}) {
      const pid = typeof opts.projectId === 'string' && opts.projectId.trim() ? opts.projectId.trim() : null;
      const auf = stmtGet(
        db,
        `SELECT COUNT(*) AS c FROM auftraege WHERE
          fusa_kunde_id IS NOT NULL AND TRIM(fusa_kunde_id) != ''
          AND (status IS NULL OR TRIM(COALESCE(status,'')) = ''
            OR LOWER(TRIM(status)) NOT IN ('abgeschlossen','geschlossen','storniert','erledigt','fertig','beendet'))`,
        [],
      );
      let fzSql = `SELECT COUNT(*) AS c FROM fahrzeuge WHERE (
        status IS NULL OR TRIM(COALESCE(status,'')) = ''
          OR LOWER(TRIM(status)) IN ('aktiv','reserviert')
      )`;
      /** @type {unknown[]} */
      const fzParams = [];
      if (pid) {
        fzSql += ' AND project_id = ?';
        fzParams.push(pid);
      }
      const fz = stmtGet(db, fzSql, fzParams);
      const sch = stmtGet(
        db,
        `SELECT COUNT(*) AS c FROM schaeden WHERE LOWER(COALESCE(TRIM(status),'')) = 'offen'`,
        [],
      );
      const now = new Date();
      const qn = Math.floor(now.getMonth() / 3) + 1;
      const y = now.getFullYear();
      const quartalKey = `${y}-Q${qn}`;
      const sumRow = stmtGet(
        db,
        `SELECT COALESCE(SUM(COALESCE(netto,0)),0) AS s FROM fusa_rechnungen WHERE quartal = ?`,
        [quartalKey],
      );
      return {
        fusa_auftraege_aktiv: auf && auf.c != null ? Number(auf.c) : 0,
        fahrzeuge_verfuegbar: fz && fz.c != null ? Number(fz.c) : 0,
        schaeden_offen: sch && sch.c != null ? Number(sch.c) : 0,
        quartalsvorschau_summe_netto: sumRow && sumRow.s != null ? Number(sumRow.s) : 0,
        quartal: quartalKey,
      };
    },
    getDashboardCcinternStats() {
      const ang = stmtGet(
        db,
        `SELECT COUNT(*) AS c FROM ccintern_angebote WHERE deleted_at IS NULL AND (
          status IS NULL OR TRIM(COALESCE(status,'')) = ''
          OR LOWER(TRIM(status)) NOT IN ('gewonnen','verloren','abgelehnt','abgeschlossen','storniert'))`,
        [],
      );
      const ccA = stmtGet(
        db,
        `SELECT COUNT(*) AS c FROM ccintern_auftraege WHERE
          status IS NULL OR TRIM(COALESCE(status,'')) = ''
          OR LOWER(TRIM(status)) NOT IN ('abgeschlossen','erledigt','storniert','fertig','beendet')`,
        [],
      );
      const anf = stmtGet(
        db,
        `SELECT COUNT(*) AS c FROM ccintern_anfragen WHERE deleted_at IS NULL AND
          LOWER(COALESCE(TRIM(status),'')) IN ('offen','in_bearbeitung')`,
        [],
      );
      return {
        ccintern_angebote_offen: ang && ang.c != null ? Number(ang.c) : 0,
        ccintern_auftraege_aktiv: ccA && ccA.c != null ? Number(ccA.c) : 0,
        ccintern_anfragen_offen: anf && anf.c != null ? Number(anf.c) : 0,
      };
    },
    countGeraeteByFirma(firmaId, filters = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      const pid =
        filters.projectId != null && String(filters.projectId).trim()
          ? String(filters.projectId).trim()
          : null;
      let sql = 'SELECT COUNT(*) AS c FROM geraete WHERE firma_id = ?';
      /** @type {unknown[]} */
      const params = [fid];
      if (pid) {
        sql += ' AND project_id = ?';
        params.push(pid);
      }
      const row = stmtGet(db, sql, params);
      return row && row.c != null ? Number(row.c) : 0;
    },
    listGeraeteByFirma(firmaId, opts = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      const pid =
        opts.projectId != null && String(opts.projectId).trim() ? String(opts.projectId).trim() : null;
      const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
      const offset = Math.max(0, Number(opts.offset) || 0);
      let sql =
        'SELECT * FROM geraete WHERE firma_id = ?';
      /** @type {unknown[]} */
      const params = [fid];
      if (pid) {
        sql += ' AND project_id = ?';
        params.push(pid);
      }
      sql += ' ORDER BY datetime(updated_at) DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      return stmtAll(db, sql, params);
    },
    getGeraetById(id, firmaId) {
      const gid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!gid || !fid) return null;
      return (
        stmtGet(db, 'SELECT * FROM geraete WHERE id = ? AND firma_id = ? LIMIT 1', [gid, fid]) ?? null
      );
    },
    insertGeraet(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const firmaId = typeof row.firmaId === 'string' && row.firmaId.trim() ? row.firmaId.trim() : '';
      if (!id || !firmaId) throw new Error('insertGeraet: id/firmaId fehlt');
      const typ = typeof row.typ === 'string' && row.typ.trim() ? row.typ.trim() : '';
      if (!typ) throw new Error('insertGeraet: typ fehlt');
      let sn =
        row.seriennummer != null && String(row.seriennummer).trim()
          ? String(row.seriennummer).trim()
          : null;
      try {
        stmtRun(
          db,
          `INSERT INTO geraete (id, firma_id, project_id, typ, seriennummer, zugewiesen_an_user_id, status, notiz, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [
            id,
            firmaId,
            row.projectId != null && String(row.projectId).trim() ? String(row.projectId).trim() : null,
            typ,
            sn,
            row.zugewiesenAnUserId != null && String(row.zugewiesenAnUserId).trim()
              ? String(row.zugewiesenAnUserId).trim()
              : null,
            typeof row.status === 'string' && row.status.trim() ? row.status.trim() : 'aktiv',
            row.notiz != null && String(row.notiz).trim() ? String(row.notiz).trim() : null,
          ],
        );
        persist();
      } catch (e) {
        if (isUniqueConstraintError(e)) {
          const err = new Error('SERIENNUMMER_CONFLICT');
          throw err;
        }
        throw e;
      }
      return this.getGeraetById(id, firmaId);
    },
    updateGeraet(id, firmaId, patch) {
      const cur = this.getGeraetById(id, firmaId);
      if (!cur) return null;
      const sets = [];
      /** @type {unknown[]} */
      const vals = [];
      if (patch.typ !== undefined) {
        const t = typeof patch.typ === 'string' ? patch.typ.trim() : '';
        if (!t) throw new Error('VALIDATION_TYP');
        sets.push('typ = ?');
        vals.push(t);
      }
      if (patch.project_id !== undefined) {
        sets.push('project_id = ?');
        vals.push(
          patch.project_id != null && String(patch.project_id).trim()
            ? String(patch.project_id).trim()
            : null,
        );
      }
      if (patch.seriennummer !== undefined) {
        sets.push('seriennummer = ?');
        vals.push(
          patch.seriennummer != null && String(patch.seriennummer).trim()
            ? String(patch.seriennummer).trim()
            : null,
        );
      }
      if (patch.zugewiesen_an_user_id !== undefined) {
        sets.push('zugewiesen_an_user_id = ?');
        vals.push(
          patch.zugewiesen_an_user_id != null && String(patch.zugewiesen_an_user_id).trim()
            ? String(patch.zugewiesen_an_user_id).trim()
            : null,
        );
      }
      if (patch.status !== undefined) {
        sets.push('status = ?');
        vals.push(typeof patch.status === 'string' && patch.status.trim() ? patch.status.trim() : 'aktiv');
      }
      if (patch.notiz !== undefined) {
        sets.push('notiz = ?');
        vals.push(patch.notiz != null && String(patch.notiz).trim() ? String(patch.notiz).trim() : null);
      }
      if (!sets.length) return cur;
      sets.push("updated_at = datetime('now')");
      vals.push(id, firmaId);
      try {
        stmtRun(db, `UPDATE geraete SET ${sets.join(', ')} WHERE id = ? AND firma_id = ?`, vals);
        persist();
      } catch (e) {
        if (isUniqueConstraintError(e)) {
          throw new Error('SERIENNUMMER_CONFLICT');
        }
        throw e;
      }
      return this.getGeraetById(id, firmaId);
    },
    deleteGeraet(id, firmaId) {
      const gid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!gid || !fid) return false;
      const cur = this.getGeraetById(gid, fid);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM geraete WHERE id = ? AND firma_id = ?', [gid, fid]);
      persist();
      return true;
    },
    /** Phase B5: CRM Pipeline — sort_order aufsteigend. */
    listCrmPipelineStagesByFirma(firmaId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      return stmtAll(
        db,
        `SELECT * FROM crm_pipeline_stages WHERE firma_id = ?
         ORDER BY sort_order ASC, datetime(created_at) ASC`,
        [fid],
      );
    },
    getCrmPipelineStageById(id, firmaId) {
      const sid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!sid || !fid) return null;
      return (
        stmtGet(db, 'SELECT * FROM crm_pipeline_stages WHERE id = ? AND firma_id = ? LIMIT 1', [sid, fid]) ??
        null
      );
    },
    insertCrmPipelineStage(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const firmaId = typeof row.firmaId === 'string' && row.firmaId.trim() ? row.firmaId.trim() : '';
      const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : '';
      if (!id || !firmaId || !name) throw new Error('insertCrmPipelineStage: id/firmaId/name fehlt');
      const sortOrder =
        row.sortOrder != null && Number.isFinite(Number(row.sortOrder)) ? Math.round(Number(row.sortOrder)) : 0;
      stmtRun(
        db,
        `INSERT INTO crm_pipeline_stages (id, firma_id, name, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [id, firmaId, name, sortOrder],
      );
      persist();
      return this.getCrmPipelineStageById(id, firmaId);
    },
    updateCrmPipelineStage(id, firmaId, patch) {
      const cur = this.getCrmPipelineStageById(id, firmaId);
      if (!cur) return null;
      /** @type {string[]} */
      const sets = [];
      /** @type {unknown[]} */
      const vals = [];
      if (patch.name !== undefined) {
        const n = typeof patch.name === 'string' ? patch.name.trim() : '';
        if (!n) throw new Error('VALIDATION_NAME');
        sets.push('name = ?');
        vals.push(n);
      }
      if (patch.sort_order !== undefined) {
        const so =
          patch.sort_order != null && Number.isFinite(Number(patch.sort_order))
            ? Math.round(Number(patch.sort_order))
            : 0;
        sets.push('sort_order = ?');
        vals.push(so);
      }
      if (!sets.length) return cur;
      sets.push("updated_at = datetime('now')");
      vals.push(id, firmaId);
      stmtRun(db, `UPDATE crm_pipeline_stages SET ${sets.join(', ')} WHERE id = ? AND firma_id = ?`, vals);
      persist();
      return this.getCrmPipelineStageById(id, firmaId);
    },
    deleteCrmPipelineStage(id, firmaId) {
      const sid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!sid || !fid) return false;
      const cur = this.getCrmPipelineStageById(sid, fid);
      if (!cur) return false;
      stmtRun(db, 'DELETE FROM crm_pipeline_stages WHERE id = ? AND firma_id = ?', [sid, fid]);
      persist();
      return true;
    },
    listCrmAktivitaetenByFirma(firmaId, filters = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      const kid =
        filters.kundeId != null && String(filters.kundeId).trim() ? String(filters.kundeId).trim() : null;
      let sql = 'SELECT * FROM crm_aktivitaeten WHERE firma_id = ?';
      /** @type {unknown[]} */
      const params = [fid];
      if (kid) {
        sql += ' AND kunde_id = ?';
        params.push(kid);
      }
      sql += ' ORDER BY datetime(created_at) DESC';
      return stmtAll(db, sql, params);
    },
    insertCrmAktivitaet(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const firmaId = typeof row.firmaId === 'string' && row.firmaId.trim() ? row.firmaId.trim() : '';
      const kundeId = typeof row.kundeId === 'string' && row.kundeId.trim() ? row.kundeId.trim() : '';
      const typ = typeof row.typ === 'string' && row.typ.trim() ? row.typ.trim() : '';
      const textVal = row.text != null ? String(row.text) : '';
      const datum = typeof row.datum === 'string' && row.datum.trim() ? row.datum.trim() : '';
      if (!id || !firmaId || !kundeId || !typ || !datum) throw new Error('insertCrmAktivitaet: Pflichtfelder fehlen');
      const uid =
        row.userId != null && String(row.userId).trim() ? String(row.userId).trim() : null;
      stmtRun(
        db,
        `INSERT INTO crm_aktivitaeten (id, firma_id, kunde_id, typ, text, user_id, datum, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [id, firmaId, kundeId, typ, textVal, uid, datum],
      );
      persist();
      return stmtGet(db, 'SELECT * FROM crm_aktivitaeten WHERE id = ? LIMIT 1', [id]);
    },
    listCrmWiedervorlageByFirma(firmaId, filters = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      const kid =
        filters.kundeId != null && String(filters.kundeId).trim() ? String(filters.kundeId).trim() : null;
      let sql = 'SELECT * FROM crm_wiedervorlage WHERE firma_id = ?';
      /** @type {unknown[]} */
      const params = [fid];
      if (kid) {
        sql += ' AND kunde_id = ?';
        params.push(kid);
      }
      sql += ' ORDER BY datum ASC, datetime(created_at) ASC';
      return stmtAll(db, sql, params);
    },
    getCrmWiedervorlageById(id, firmaId) {
      const wid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!wid || !fid) return null;
      return stmtGet(db, 'SELECT * FROM crm_wiedervorlage WHERE id = ? AND firma_id = ? LIMIT 1', [wid, fid]) ?? null;
    },
    insertCrmWiedervorlage(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const firmaId = typeof row.firmaId === 'string' && row.firmaId.trim() ? row.firmaId.trim() : '';
      const kundeId = typeof row.kundeId === 'string' && row.kundeId.trim() ? row.kundeId.trim() : '';
      const titel = typeof row.titel === 'string' && row.titel.trim() ? row.titel.trim() : '';
      const datum = typeof row.datum === 'string' && row.datum.trim() ? row.datum.trim() : '';
      if (!id || !firmaId || !kundeId || !datum) throw new Error('insertCrmWiedervorlage: Pflichtfelder fehlen');
      const status =
        typeof row.status === 'string' && row.status.trim() ? row.status.trim() : 'offen';
      const uid =
        row.userId != null && String(row.userId).trim() ? String(row.userId).trim() : null;
      stmtRun(
        db,
        `INSERT INTO crm_wiedervorlage (id, firma_id, kunde_id, titel, datum, status, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [id, firmaId, kundeId, titel || '', datum, status, uid],
      );
      persist();
      return this.getCrmWiedervorlageById(id, firmaId);
    },
    updateCrmWiedervorlage(id, firmaId, patch) {
      const cur = this.getCrmWiedervorlageById(id, firmaId);
      if (!cur) return null;
      /** @type {string[]} */
      const sets = [];
      /** @type {unknown[]} */
      const vals = [];
      if (patch.titel !== undefined) {
        sets.push('titel = ?');
        vals.push(patch.titel != null ? String(patch.titel) : '');
      }
      if (patch.datum !== undefined) {
        const d = typeof patch.datum === 'string' && patch.datum.trim() ? patch.datum.trim() : '';
        if (!d) throw new Error('VALIDATION_DATUM');
        sets.push('datum = ?');
        vals.push(d);
      }
      if (patch.status !== undefined) {
        sets.push('status = ?');
        vals.push(typeof patch.status === 'string' && patch.status.trim() ? patch.status.trim() : 'offen');
      }
      if (patch.user_id !== undefined) {
        sets.push('user_id = ?');
        vals.push(
          patch.user_id != null && String(patch.user_id).trim() ? String(patch.user_id).trim() : null,
        );
      }
      if (!sets.length) return cur;
      vals.push(id, firmaId);
      stmtRun(db, `UPDATE crm_wiedervorlage SET ${sets.join(', ')} WHERE id = ? AND firma_id = ?`, vals);
      persist();
      return this.getCrmWiedervorlageById(id, firmaId);
    },
    /** Phase B6: Refresh-Token (Hash in DB). */
    findValidRefreshTokenByHash(tokenHash) {
      const h = typeof tokenHash === 'string' ? tokenHash.trim() : '';
      if (!h) return null;
      return (
        stmtGet(
          db,
          `SELECT * FROM refresh_tokens
           WHERE token_hash = ?
             AND revoked_at IS NULL
             AND datetime(expires_at) > datetime('now')
           LIMIT 1`,
          [h],
        ) ?? null
      );
    },
    insertRefreshToken(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const userId = typeof row.userId === 'string' && row.userId.trim() ? row.userId.trim() : '';
      const tokenHash =
        typeof row.tokenHash === 'string' && row.tokenHash.trim() ? row.tokenHash.trim() : '';
      const expiresAt =
        typeof row.expiresAt === 'string' && row.expiresAt.trim() ? row.expiresAt.trim() : '';
      if (!id || !userId || !tokenHash || !expiresAt) throw new Error('insertRefreshToken: Pflichtfelder fehlen');
      const deviceId =
        row.deviceId != null && String(row.deviceId).trim() ? String(row.deviceId).trim() : null;
      stmtRun(
        db,
        `INSERT INTO refresh_tokens (id, user_id, token_hash, device_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [id, userId, tokenHash, deviceId, expiresAt],
      );
      persist();
      return stmtGet(db, 'SELECT * FROM refresh_tokens WHERE id = ? LIMIT 1', [id]);
    },
    revokeRefreshTokenById(id) {
      const rid = typeof id === 'string' ? id.trim() : '';
      if (!rid) return false;
      stmtRun(db, `UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?`, [rid]);
      persist();
      return true;
    },
    /** Produktion oder Aufgabe: Nutzer darf auf diesen CC-Auftrag Zeit buchen. */
    userMayReportZeitForCcAuftrag(firmaId, userId, ccinternAuftragId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const aid = typeof ccinternAuftragId === 'string' ? ccinternAuftragId.trim() : '';
      if (!fid || !uid || !aid) return false;
      const p = stmtGet(
        db,
        `SELECT 1 AS x FROM produktion_auftraege
         WHERE firma_id = ? AND auftrag_id = ? AND verantwortlich = ? LIMIT 1`,
        [fid, aid, uid],
      );
      if (p) return true;
      const a = stmtGet(
        db,
        `SELECT 1 AS x FROM aufgaben
         WHERE firma_id = ? AND auftrag_id = ? AND zugewiesen_an = ? LIMIT 1`,
        [fid, aid, uid],
      );
      if (a) return true;
      const auf = this.getCcInternAuftragById(aid, fid);
      const bem = auf && auf.bemerkung != null ? String(auf.bemerkung) : '';
      return userReferencedInAnyWorkflowSchritt(bem, uid);
    },
    insertCcinternMitarbeiterZeit(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const userId = typeof row.userId === 'string' && row.userId.trim() ? row.userId.trim() : '';
      const firmaId = typeof row.firmaId === 'string' && row.firmaId.trim() ? row.firmaId.trim() : '';
      const ccId =
        typeof row.ccinternAuftragId === 'string' && row.ccinternAuftragId.trim()
          ? row.ccinternAuftragId.trim()
          : '';
      const min = row.minuten != null ? Math.round(Number(row.minuten)) : NaN;
      if (!id || !userId || !firmaId || !ccId || !Number.isFinite(min) || min <= 0 || min > 24 * 60) {
        throw new Error('insertCcinternMitarbeiterZeit: ungültige Daten');
      }
      const notiz = row.notiz != null && String(row.notiz).trim() ? String(row.notiz).trim() : null;
      stmtRun(
        db,
        `INSERT INTO ccintern_mitarbeiter_zeiten (id, user_id, firma_id, ccintern_auftrag_id, minuten, notiz, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [id, userId, firmaId, ccId, min, notiz],
      );
      persist();
      return stmtGet(db, 'SELECT * FROM ccintern_mitarbeiter_zeiten WHERE id = ? LIMIT 1', [id]);
    },
    /** CC-Intern-Aufgaben nur für zugewiesenen Nutzer (Mobile). */
    listAufgabenForAssignedUser(firmaId, userId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!fid || !uid) return [];
      return stmtAll(
        db,
        `SELECT a.id, a.titel, a.beschreibung, a.zugewiesen_an, a.auftrag_id, a.faellig_am,
                a.status, a.prioritaet, a.firma_id, a.erstellt_von, a.erstellt_am, a.aktualisiert_am,
                u.name AS zugewiesen_name
         FROM aufgaben a
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         WHERE a.firma_id = ? AND a.zugewiesen_an = ?
         ORDER BY datetime(a.erstellt_am) DESC`,
        [fid, uid],
      );
    },
    /**
     * Phase B4: FUSA-Quartalsaggregation aus `fusa_rechnungen` (Umsatz bevorzugt brutto, fallback netto).
     * Filter Jahr über Datum `COALESCE(rechnungsdatum, von, created_at)`; optional `project_id` über Join auf `auftraege`.
     * @param {{ jahr?: number, projectId?: string|null }} opts
     */
    aggregateFusaQuartale(opts = {}) {
      const yRaw = opts.jahr != null ? Number(opts.jahr) : NaN;
      const y = Number.isFinite(yRaw) && yRaw >= 2000 && yRaw <= 2100 ? Math.floor(yRaw) : new Date().getFullYear();
      const pid =
        opts.projectId != null && String(opts.projectId).trim() ? String(opts.projectId).trim() : null;
      const rows = stmtAll(
        db,
        `SELECT
           ((CAST(strftime('%m', COALESCE(r.rechnungsdatum, r.von, r.created_at)) AS INTEGER) + 2) / 3) AS qb,
           COUNT(DISTINCT CASE WHEN r.auftrag_id IS NOT NULL AND TRIM(COALESCE(r.auftrag_id,'')) != '' THEN r.auftrag_id END) AS auftraege,
           SUM(COALESCE(r.brutto, r.netto, 0)) AS umsatz
         FROM fusa_rechnungen r
         LEFT JOIN auftraege a ON r.auftrag_id = a.id
         WHERE COALESCE(r.rechnungsdatum, r.von, r.created_at) IS NOT NULL
           AND TRIM(COALESCE(r.rechnungsdatum, r.von, r.created_at)) != ''
           AND strftime('%Y', COALESCE(r.rechnungsdatum, r.von, r.created_at)) = ?
           AND (? IS NULL OR (r.auftrag_id IS NOT NULL AND a.project_id = ?))
         GROUP BY 1`,
        [String(y), pid, pid],
      );
      const map = new Map([
        [1, { quartal: 'Q1', auftraege: 0, umsatz: 0 }],
        [2, { quartal: 'Q2', auftraege: 0, umsatz: 0 }],
        [3, { quartal: 'Q3', auftraege: 0, umsatz: 0 }],
        [4, { quartal: 'Q4', auftraege: 0, umsatz: 0 }],
      ]);
      for (const row of rows || []) {
        const qb = row && row.qb != null ? Number(row.qb) : NaN;
        if (!Number.isFinite(qb) || qb < 1 || qb > 4) continue;
        const slot = map.get(qb);
        if (!slot) continue;
        slot.auftraege = row.auftraege != null ? Number(row.auftraege) : 0;
        slot.umsatz = row.umsatz != null ? Number(row.umsatz) : 0;
      }
      const quartale = [1, 2, 3, 4].map((n) => {
        const o = /** @type {{ quartal: string, auftraege: number, umsatz: number, durchschnitt: number }} */ (
          map.get(n)
        );
        const auf = Math.max(0, Math.round(o.auftraege) || 0);
        const um = Number.isFinite(o.umsatz) ? o.umsatz : 0;
        const durch = auf > 0 ? Math.round((um / auf) * 100) / 100 : 0;
        return { quartal: o.quartal, auftraege: auf, umsatz: um, durchschnitt: durch };
      });
      return { jahr: y, quartale };
    },
  };
}

/**
 * Vor `openDatabase()`: Kopie der SQLite-Datei als `cc-cockpit-backup-<timestamp>.db` im selben Ordner.
 * Maximal 5 Backup-Dateien; älteste werden entfernt. No-op bei MySQL oder wenn die DB-Datei noch nicht existiert.
 */
export function backupSqliteDatabaseBeforeOpen() {
  const host = String(process.env.MYSQL_HOST || '').trim();
  const user = String(process.env.MYSQL_USER || '').trim();
  const database = String(process.env.MYSQL_DATABASE || '').trim();
  if (host && user && database) return;
  try {
    if (!fs.existsSync(dbPath)) return;
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_');
    const dest = path.join(dir, `cc-cockpit-backup-${ts}.db`);
    fs.copyFileSync(dbPath, dest);
    console.log('[sqlite] Backup erstellt:', dest);
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    const backups = names.filter((n) => /^cc-cockpit-backup-.+\.db$/i.test(n));
    const withStat = backups.map((n) => {
      const full = path.join(dir, n);
      return { full, t: fs.statSync(full).mtimeMs };
    });
    withStat.sort((a, b) => a.t - b.t);
    while (withStat.length > 5) {
      const victim = withStat.shift();
      if (!victim) break;
      try {
        fs.unlinkSync(victim.full);
        console.log('[sqlite] Altes Backup entfernt:', path.basename(victim.full));
      } catch (e) {
        console.error('[sqlite] Backup löschen fehlgeschlagen:', victim.full, e);
      }
    }
  } catch (e) {
    console.error('[sqlite] backupSqliteDatabaseBeforeOpen:', e);
  }
}

/**
 * Einmaliges Start-Logging: welche DB-Konfiguration der Prozess sieht (keine Datenänderung).
 * DEV/Diagnose — bei Bedarf später entfernen oder hinter Flag legen.
 */
export function logDatabaseStartupDiagnostics() {
  const host = String(process.env.MYSQL_HOST || '').trim();
  const user = String(process.env.MYSQL_USER || '').trim();
  const database = String(process.env.MYSQL_DATABASE || '').trim();
  const mysqlConfigured = Boolean(host && user && database);
  const absSqlite = path.resolve(dbPath);
  const backendRoot = path.resolve(repoBackendRoot);
  let sqliteExists = 'no';
  let sqliteSize = '';
  let sqliteMtime = '';
  if (!mysqlConfigured) {
    try {
      if (fs.existsSync(absSqlite)) {
        sqliteExists = 'yes';
        const st = fs.statSync(absSqlite);
        sqliteSize = String(st.size);
        sqliteMtime = st.mtime.toISOString();
      }
    } catch (e) {
      sqliteExists = 'error:' + (e instanceof Error ? e.message : String(e));
    }
  } else {
    sqliteExists = 'n/a-mysql';
  }
  const dbType = mysqlConfigured ? 'mysql' : 'sqlite';
  console.log('[DB-DIAG] type=' + dbType);
  console.log('[DB-DIAG] cwd=' + process.cwd());
  console.log('[DB-DIAG] backendRoot=' + backendRoot);
  console.log('[DB-DIAG] sqlitePath=' + absSqlite);
  console.log('[DB-DIAG] mysqlActive=' + (mysqlConfigured ? 'yes' : 'no'));
  console.log('[DB-DIAG] sqliteExists=' + sqliteExists);
  console.log('[DB-DIAG] sqliteSize=' + (sqliteSize || 'n/a'));
  console.log('[DB-DIAG] sqliteMtime=' + (sqliteMtime || 'n/a'));
}

/**
 * Öffnet den Store.
 *
 * - Standard: SQLite (`sql.js`) → persistiert nach `data/cc-cockpit.db`
 * - Optional: `SQLITE_DB_PATH=/abs/path/zur.db` (Ordner wird angelegt)
 * - MySQL: wenn `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_DATABASE` gesetzt sind (Passwort darf leer sein)
 */
export async function openDatabase() {
  const host = String(process.env.MYSQL_HOST || '').trim();
  const user = String(process.env.MYSQL_USER || '').trim();
  const database = String(process.env.MYSQL_DATABASE || '').trim();
  const mysqlConfigured = Boolean(host && user && database);
  if (mysqlConfigured) {
    return createMysqlStore();
  }
  return promisifyStore(await buildSqliteStore());
}