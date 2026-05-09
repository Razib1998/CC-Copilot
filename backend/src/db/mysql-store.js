/**
 * MySQL-Backend (mysql2/promise) — gleiche Store-API wie SQLite, alle Methoden async.
 * Schema: backend/src/db/schema-mysql8.sql einmalig ausführen.
 * Env: MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE [, MYSQL_PORT=3306] [, MYSQL_SSL=1]
 */
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { defaultFlagsForRole } from '../auth/project-access-rules.js';
import { bereicheForModule, normalizeRightsJson, rightsJsonFullForModule } from '../auth/rights-spec.js';
import {
  attachFahrzeugFelderToFusaRows,
  collectAllFahrzeugIdsFromAuftragRows,
  nullifyEmptyStringFields,
} from './fusa-auftraege-enrich.js';
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

function normAuftragTerminStrMysql(v) {
  if (v == null || String(v).trim() === '') return '';
  return String(v).trim();
}

function canonicalAuftragFzIdsKeyMysql(raw) {
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

function belegungTripleKeyMysql(termin, terminEnde, fzJson) {
  return `${normAuftragTerminStrMysql(termin)}|${normAuftragTerminStrMysql(terminEnde)}|${canonicalAuftragFzIdsKeyMysql(fzJson)}`;
}

/**
 * mysql2 wirft bei `undefined` in den Parametern — in JS-Objekten ist `undefined` leicht dabei.
 * SQL-NULL ist immer `null`.
 * @param {unknown[]} params
 */
function mysqlBindParams(params) {
  return params.map((p) => (p === undefined ? null : p));
}

/** @param {import('mysql2/promise').Pool} pool */
async function qGet(pool, sql, params = []) {
  const [rows] = await pool.execute(sql, mysqlBindParams(params));
  const r = /** @type {any[]} */ (rows);
  return r[0] ?? null;
}

/** @param {import('mysql2/promise').Pool} pool */
async function qAll(pool, sql, params = []) {
  const [rows] = await pool.execute(sql, mysqlBindParams(params));
  return /** @type {any[]} */ (rows);
}

/** @param {import('mysql2/promise').Pool} pool */
async function qRun(pool, sql, params = []) {
  await pool.execute(sql, mysqlBindParams(params));
}

/**
 * Bestehende MySQL-DBs: Spalte/Tabellen + einmaliger Rechte-Seed (wenn user_rights leer).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlGlobalRightsMigration(pool) {
  try {
    await qRun(pool, "ALTER TABLE users ADD COLUMN global_role VARCHAR(32) NOT NULL DEFAULT 'INTERN'", []);
  } catch {
    /* Spalte existiert */
  }
  try {
    await qRun(pool, 'ALTER TABLE users ADD COLUMN company_id CHAR(36) NULL', []);
  } catch {
    /* Spalte existiert */
  }
  try {
    await qRun(pool, "ALTER TABLE users ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'aktiv'", []);
  } catch {
    /* Spalte existiert */
  }
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS user_modules (
      user_id CHAR(36) NOT NULL,
      module VARCHAR(32) NOT NULL,
      PRIMARY KEY (user_id, module),
      CONSTRAINT fk_user_modules_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS user_rights (
      user_id CHAR(36) NOT NULL,
      module VARCHAR(32) NOT NULL,
      bereich VARCHAR(128) NOT NULL,
      rechte_json LONGTEXT NOT NULL,
      PRIMARY KEY (user_id, module, bereich),
      CONSTRAINT fk_user_rights_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      KEY idx_user_rights_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  try {
    await qRun(pool, 'UPDATE user_rights SET bereich = ? WHERE module = ? AND bereich = ?', [
      'mitarbeiterapp',
      'ccintern',
      'mitarbeiter_app',
    ]);
  } catch (e) {
    console.error('[mysql] user_rights mitarbeiter_app → mitarbeiterapp', e);
  }
  const cnt = await qGet(pool, 'SELECT COUNT(*) AS c FROM user_rights');
  const n = Number(cnt?.c ?? 0);
  if (n > 0) return;
  const users = await qAll(pool, 'SELECT id FROM users ORDER BY created_at ASC', []);
  const oldestId = users[0]?.id != null ? String(users[0].id) : null;
  for (const u of users) {
    const id = String(u.id);
    const role = oldestId && id === oldestId ? 'SUPER_ADMIN' : 'INTERN';
    await qRun(pool, 'UPDATE users SET global_role = ? WHERE id = ?', [role, id]);
    for (const mod of /** @type {const} */ (['cockpit', 'fusa', 'ccintern'])) {
      await qRun(pool, 'INSERT IGNORE INTO user_modules (user_id, module) VALUES (?, ?)', [id, mod]);
      for (const b of bereicheForModule(mod)) {
        await qRun(pool, 'REPLACE INTO user_rights (user_id, module, bereich, rechte_json) VALUES (?, ?, ?, ?)', [
          id,
          mod,
          b,
          rightsJsonFullForModule(mod),
        ]);
      }
    }
  }
}

/** Nutzer mit cockpit/ccintern aber ohne fusa: Modul + volle FUSA-Rechte (SQLite migratePhase55). */
async function ensureMysqlFusaModuleForCollaboratorUsers(pool) {
  try {
    const rows = await qAll(
      pool,
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
      await qRun(pool, 'INSERT IGNORE INTO user_modules (user_id, module) VALUES (?, ?)', [uid, 'fusa']);
      for (const b of bereicheForModule('fusa')) {
        await qRun(pool, 'REPLACE INTO user_rights (user_id, module, bereich, rechte_json) VALUES (?, ?, ?, ?)', [
          uid,
          'fusa',
          b,
          fj,
        ]);
      }
    }
  } catch (e) {
    console.error('[mysql] FUSA-Modul für bestehende Nutzer', e);
  }
}

/** @param {import('mysql2/promise').Pool} pool */
async function ensureMysqlRoleTemplatesMigration(pool) {
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS role_templates (
      id CHAR(36) NOT NULL,
      name VARCHAR(500) NOT NULL,
      description TEXT NULL,
      modules_json LONGTEXT NOT NULL,
      rights_json LONGTEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
}

/** Firmen + Cockpit-Einladungen (DDL für bestehende MySQL-DBs). */
async function ensureMysqlUsersSollUrlaubColumns(pool) {
  try {
    await qRun(pool, 'ALTER TABLE users ADD COLUMN soll INT NOT NULL DEFAULT 160', []);
  } catch {
    /* Spalte existiert */
  }
  try {
    await qRun(pool, 'ALTER TABLE users ADD COLUMN urlaub INT NOT NULL DEFAULT 28', []);
  } catch {
    /* Spalte existiert */
  }
}

async function ensureMysqlProjectsDeadlineColumn(pool) {
  try {
    await qRun(pool, 'ALTER TABLE projects ADD COLUMN deadline VARCHAR(100) NULL', []);
  } catch {
    /* Spalte existiert */
  }
}

async function ensureMysqlAuftraegeTerminEndeColumn(pool) {
  try {
    await qRun(pool, 'ALTER TABLE auftraege ADD COLUMN termin_ende VARCHAR(100) NULL', []);
  } catch {
    /* Spalte existiert */
  }
}

/** FUSA-Import-Spalten + Tabellen (SQLite-Migration 01_schema_migration.sql, MySQL-Äquivalent). */
async function ensureMysqlFusaApiSupport(pool) {
  try {
    await qRun(pool, 'ALTER TABLE auftraege ADD COLUMN fusa_original_id VARCHAR(64) NULL', []);
  } catch {}
  try {
    await qRun(pool, 'ALTER TABLE auftraege ADD COLUMN fusa_kunde_id CHAR(36) NULL', []);
  } catch {}
  try {
    await qRun(pool, 'ALTER TABLE auftraege ADD COLUMN fusa_fahrzeug_ids TEXT NULL', []);
  } catch {}
  try {
    await qRun(pool, 'ALTER TABLE auftraege ADD COLUMN fusa_extra_json LONGTEXT NULL', []);
  } catch {}
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS fusa_rechnungen (
      id CHAR(36) NOT NULL,
      original_id VARCHAR(64) NULL,
      auftrag_id CHAR(36) NULL,
      kunde_id CHAR(36) NULL,
      von VARCHAR(100) NULL,
      bis VARCHAR(100) NULL,
      netto DOUBLE NULL,
      mwst DOUBLE NULL,
      brutto DOUBLE NULL,
      faellig_am VARCHAR(100) NULL,
      status VARCHAR(100) NULL,
      quartal VARCHAR(64) NULL,
      notiz TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_fusa_rechnungen_auftrag (auftrag_id),
      KEY idx_fusa_rechnungen_status (status),
      KEY idx_fusa_rechnungen_quartal (quartal),
      CONSTRAINT fk_fusa_rechnungen_auftrag FOREIGN KEY (auftrag_id) REFERENCES auftraege (id) ON DELETE SET NULL,
      CONSTRAINT fk_fusa_rechnungen_kunde FOREIGN KEY (kunde_id) REFERENCES firmen (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS fusa_termine (
      id CHAR(36) NOT NULL,
      original_id VARCHAR(64) NULL,
      projekt_id CHAR(36) NULL,
      auftrag_id CHAR(36) NULL,
      fahrzeug_id CHAR(36) NULL,
      typ VARCHAR(100) NULL,
      titel VARCHAR(500) NULL,
      start VARCHAR(100) NULL,
      ende VARCHAR(100) NULL,
      status VARCHAR(100) NULL,
      mitarbeiter_ids TEXT NULL,
      notiz TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_fusa_termine_projekt (projekt_id),
      KEY idx_fusa_termine_start (start),
      KEY idx_fusa_termine_typ (typ),
      CONSTRAINT fk_fusa_termine_projekt FOREIGN KEY (projekt_id) REFERENCES projects (id) ON DELETE SET NULL,
      CONSTRAINT fk_fusa_termine_auftrag FOREIGN KEY (auftrag_id) REFERENCES auftraege (id) ON DELETE SET NULL,
      CONSTRAINT fk_fusa_termine_fahrzeug FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS fusa_belegungen (
      id CHAR(36) NOT NULL,
      project_id CHAR(36) NOT NULL,
      auftrag_id CHAR(36) NOT NULL,
      fahrzeug_id CHAR(36) NOT NULL,
      startdatum VARCHAR(32) NOT NULL,
      enddatum VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'aktiv',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_fusa_belegungen_project (project_id),
      KEY idx_fusa_belegungen_fz (project_id, fahrzeug_id, startdatum, enddatum),
      CONSTRAINT fk_fusa_belegungen_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      CONSTRAINT fk_fusa_belegungen_auftrag FOREIGN KEY (auftrag_id) REFERENCES auftraege (id) ON DELETE CASCADE,
      CONSTRAINT fk_fusa_belegungen_fahrzeug FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  try {
    await qRun(pool, 'ALTER TABLE fusa_rechnungen ADD COLUMN extra_json LONGTEXT NULL', []);
  } catch {}
  try {
    await qRun(pool, 'ALTER TABLE fusa_rechnungen ADD COLUMN bezahlt_am VARCHAR(100) NULL', []);
  } catch {}
  try {
    await qRun(pool, 'ALTER TABLE fusa_rechnungen ADD COLUMN rechnungsdatum VARCHAR(100) NULL', []);
  } catch {}
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS project_invites (
      id CHAR(36) NOT NULL,
      project_id CHAR(36) NOT NULL,
      email VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL,
      can_view_prices TINYINT(1) NOT NULL DEFAULT 0,
      can_edit TINYINT(1) NOT NULL DEFAULT 0,
      can_create_auftraege TINYINT(1) NOT NULL DEFAULT 0,
      token VARCHAR(128) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      expires_at DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      created_by_user_id CHAR(36) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_project_invites_token (token),
      KEY idx_project_invites_project (project_id),
      KEY idx_project_invites_status (status),
      CONSTRAINT fk_project_invites_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      CONSTRAINT fk_project_invites_creator FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
}

/**
 * FUSA — Dokument-Metadaten (kein File-Storage).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlFusaDokumenteTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS fusa_dokumente (
        id CHAR(36) NOT NULL,
        auftrag_id CHAR(36) NOT NULL,
        fahrzeug_id CHAR(36) NULL,
        name VARCHAR(500) NOT NULL,
        typ VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        groesse BIGINT UNSIGNED NOT NULL DEFAULT 0,
        hochgeladen_von CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        project_id CHAR(36) NOT NULL,
        PRIMARY KEY (id),
        KEY idx_fusa_dokumente_project (project_id),
        KEY idx_fusa_dokumente_auftrag (auftrag_id),
        KEY idx_fusa_dokumente_fahrzeug (fahrzeug_id),
        CONSTRAINT fk_fusa_dokumente_auftrag
          FOREIGN KEY (auftrag_id) REFERENCES auftraege (id) ON DELETE CASCADE,
        CONSTRAINT fk_fusa_dokumente_fahrzeug
          FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge (id) ON DELETE SET NULL,
        CONSTRAINT fk_fusa_dokumente_uploader
          FOREIGN KEY (hochgeladen_von) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT fk_fusa_dokumente_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure fusa_dokumente table', e);
  }
}

/**
 * FUSA — Angebote (Metadaten + angebots_json).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlFusaAngeboteTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS fusa_angebote (
        id CHAR(36) NOT NULL,
        project_id CHAR(36) NOT NULL,
        fusa_kunde_id CHAR(36) NOT NULL,
        titel VARCHAR(500) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'entwurf',
        gueltig_bis VARCHAR(100) NULL,
        angebots_json LONGTEXT NOT NULL,
        erstellt_von CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_fusa_angebote_project (project_id),
        KEY idx_fusa_angebote_kunde (fusa_kunde_id),
        KEY idx_fusa_angebote_status (status),
        CONSTRAINT fk_fusa_angebote_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
        CONSTRAINT fk_fusa_angebote_kunde
          FOREIGN KEY (fusa_kunde_id) REFERENCES firmen (id) ON DELETE RESTRICT,
        CONSTRAINT fk_fusa_angebote_erstellt_von
          FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure fusa_angebote table', e);
  }
}

async function ensureMysqlFirmenCockpitInvitesTables(pool) {
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS firmen (
      id CHAR(36) NOT NULL,
      name VARCHAR(500) NOT NULL,
      kundennummer VARCHAR(64) NULL,
      typ VARCHAR(100) NULL,
      intern_extern VARCHAR(32) NULL,
      umsatzsteuer_id VARCHAR(64) NULL,
      strasse VARCHAR(500) NULL,
      plz VARCHAR(32) NULL,
      stadt VARCHAR(255) NULL,
      land VARCHAR(100) NULL DEFAULT 'Deutschland',
      telefon VARCHAR(100) NULL,
      email VARCHAR(255) NULL,
      website VARCHAR(500) NULL,
      ansprechpartner_anrede VARCHAR(32) NULL,
      ansprechpartner_vorname VARCHAR(255) NULL,
      ansprechpartner_nachname VARCHAR(255) NULL,
      ansprechpartner_email VARCHAR(255) NULL,
      ansprechpartner_telefon VARCHAR(100) NULL,
      interne_notiz TEXT NULL,
      status VARCHAR(100) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_firmen_kundennummer (kundennummer),
      KEY idx_firmen_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN kundennummer VARCHAR(64) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN altnummer VARCHAR(128) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN intern_extern VARCHAR(32) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN umsatzsteuer_id VARCHAR(64) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN strasse VARCHAR(500) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN plz VARCHAR(32) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN stadt VARCHAR(255) NULL', []); } catch {}
  try { await qRun(pool, "ALTER TABLE firmen ADD COLUMN land VARCHAR(100) NULL DEFAULT 'Deutschland'", []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN telefon VARCHAR(100) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN email VARCHAR(255) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN website VARCHAR(500) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN ansprechpartner_anrede VARCHAR(32) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN ansprechpartner_vorname VARCHAR(255) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN ansprechpartner_nachname VARCHAR(255) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN ansprechpartner_email VARCHAR(255) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN ansprechpartner_telefon VARCHAR(100) NULL', []); } catch {}
  try { await qRun(pool, 'ALTER TABLE firmen ADD COLUMN interne_notiz TEXT NULL', []); } catch {}
  try {
    await qRun(pool, 'ALTER TABLE firmen ADD COLUMN erweiterung_json LONGTEXT NULL', []);
  } catch {}
  try { await qRun(pool, 'CREATE INDEX idx_firmen_kundennummer ON firmen (kundennummer)', []); } catch {}
  try {
    await qRun(pool, 'CREATE UNIQUE INDEX uq_firmen_kundennummer ON firmen (kundennummer)', []);
  } catch {
    /* existiert oder Duplikate in Altbestand */
  }
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS fusa_kunden_extra (
      firma_id CHAR(36) NOT NULL,
      hinweis TEXT NULL,
      segment VARCHAR(255) NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (firma_id),
      CONSTRAINT fk_fusa_kunden_extra_firma
        FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS ccintern_kunden_extra (
      firma_id CHAR(36) NOT NULL,
      crm_status VARCHAR(255) NULL,
      betreuer VARCHAR(255) NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (firma_id),
      CONSTRAINT fk_ccintern_kunden_extra_firma
        FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS cockpit_invites (
      id CHAR(36) NOT NULL,
      email VARCHAR(255) NOT NULL,
      global_role VARCHAR(32) NOT NULL,
      modules_json LONGTEXT NOT NULL,
      areas_json LONGTEXT NOT NULL DEFAULT ('[]'),
      rights_json LONGTEXT NOT NULL DEFAULT ('{}'),
      firma_id CHAR(36) NULL,
      token VARCHAR(128) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'offen',
      expires_at DATETIME(3) NOT NULL,
      redeemed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      created_by_user_id CHAR(36) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_cockpit_invites_token (token),
      KEY idx_cockpit_invites_status (status),
      KEY idx_cockpit_invites_firma (firma_id),
      CONSTRAINT fk_cockpit_invites_user
        FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  try {
    await qRun(pool, "ALTER TABLE cockpit_invites ADD COLUMN areas_json LONGTEXT NOT NULL DEFAULT ('[]')", []);
  } catch {}
  try {
    await qRun(pool, "ALTER TABLE cockpit_invites ADD COLUMN rights_json LONGTEXT NOT NULL DEFAULT ('{}')", []);
  } catch {}
  try {
    await qRun(pool, 'ALTER TABLE cockpit_invites ADD COLUMN redeemed_at DATETIME(3) NULL', []);
  } catch {}
  try {
    await qRun(pool, 'ALTER TABLE cockpit_invites ADD COLUMN firma_id CHAR(36) NULL', []);
  } catch {}
  try {
    await qRun(pool, 'CREATE INDEX idx_cockpit_invites_firma ON cockpit_invites (firma_id)', []);
  } catch {}
  await qRun(pool, "UPDATE cockpit_invites SET status = 'offen' WHERE status = 'pending'", []);
  await qRun(pool, "UPDATE cockpit_invites SET status = 'eingeloest' WHERE status = 'accepted'", []);
  await qRun(pool, "UPDATE cockpit_invites SET status = 'abgelaufen' WHERE status = 'expired'", []);
  await qRun(pool, "UPDATE cockpit_invites SET status = 'widerrufen' WHERE status = 'revoked'", []);
  // Phase 28: schaeden.extra_json
  try { await qRun(pool, 'ALTER TABLE schaeden ADD COLUMN extra_json LONGTEXT NULL', []); } catch {}
}

/**
 * MesseFlow: gemeinsamer JSON-Arbeitsbereich (SQLite-Parität).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlMesseflowWorkspaceTable(pool) {
  await qRun(
    pool,
    `CREATE TABLE IF NOT EXISTS messeflow_workspace (
      id VARCHAR(32) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
}

/**
 * CC-Intern Aufträge + Kommentare (mandantenfähig).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlCcInternAuftraegeTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS ccintern_auftraege (
      id CHAR(36) NOT NULL,
      auftragsnummer VARCHAR(32) NOT NULL,
      kunde VARCHAR(500) NOT NULL,
      status VARCHAR(100) NULL,
      schritt VARCHAR(100) NULL,
      prioritaet VARCHAR(50) NULL,
      lieferdatum VARCHAR(100) NULL,
      montage_datum VARCHAR(100) NULL,
      bemerkung TEXT NULL,
      fusa_auftrag_id CHAR(36) NULL,
      quelle VARCHAR(32) NOT NULL DEFAULT 'manuell',
      erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      aktualisiert_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      erstellt_von CHAR(36) NULL,
      firma_id CHAR(36) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_ccintern_auftraege_nummer (auftragsnummer),
      KEY idx_ccintern_auftraege_firma (firma_id),
      KEY idx_ccintern_auftraege_erstellt (erstellt_am),
      KEY idx_ccintern_auftraege_fusa_link (fusa_auftrag_id),
      CONSTRAINT fk_ccintern_auftraege_user
        FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_ccintern_auftraege_fusa_auftrag
        FOREIGN KEY (fusa_auftrag_id) REFERENCES auftraege (id) ON DELETE SET NULL,
      CONSTRAINT fk_ccintern_auftraege_firma
        FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure ccintern_auftraege table', e);
  }
  try { await qRun(pool, 'ALTER TABLE ccintern_auftraege ADD COLUMN fusa_auftrag_id CHAR(36) NULL', []); } catch {}
  try { await qRun(pool, "ALTER TABLE ccintern_auftraege ADD COLUMN quelle VARCHAR(32) NOT NULL DEFAULT 'manuell'", []); } catch {}
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS ccintern_auftrag_kommentare (
      id CHAR(36) NOT NULL,
      auftrag_id CHAR(36) NOT NULL,
      text TEXT NOT NULL,
      autor_id CHAR(36) NULL,
      erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_ccintern_auftrag_kommentare_auftrag (auftrag_id, erstellt_am),
      CONSTRAINT fk_ccintern_auftrag_kommentare_auftrag
        FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE CASCADE,
      CONSTRAINT fk_ccintern_auftrag_kommentare_user
        FOREIGN KEY (autor_id) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure ccintern_auftrag_kommentare table', e);
  }
}

/**
 * CC-Intern: Dateien/Fotos je Auftrag (zentrale Quelle Desktop + Mitarbeiter-App).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlCcInternAuftragDateienTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS ccintern_auftrag_dateien (
      id CHAR(36) NOT NULL,
      project_id CHAR(36) NULL,
      auftrag_id CHAR(36) NOT NULL,
      kunde_id CHAR(36) NULL,
      typ VARCHAR(64) NOT NULL,
      bereich VARCHAR(64) NULL,
      phase VARCHAR(32) NULL,
      position VARCHAR(32) NULL,
      filename VARCHAR(500) NOT NULL,
      originalname VARCHAR(500) NOT NULL,
      mimetype VARCHAR(128) NOT NULL,
      size BIGINT NOT NULL,
      server_path VARCHAR(1024) NOT NULL,
      public_url VARCHAR(1024) NOT NULL,
      uploaded_by CHAR(36) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NULL,
      PRIMARY KEY (id),
      KEY idx_ccintern_auftrag_dateien_auftrag (auftrag_id, created_at),
      CONSTRAINT fk_ccintern_auftrag_dateien_auftrag
        FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE CASCADE,
      CONSTRAINT fk_ccintern_auftrag_dateien_user
        FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure ccintern_auftrag_dateien table', e);
  }
  try {
    await qRun(pool, 'ALTER TABLE ccintern_auftrag_dateien ADD COLUMN updated_at DATETIME(3) NULL', []);
  } catch {
    /* Spalte existiert */
  }
  try {
    await qRun(
      pool,
      'UPDATE ccintern_auftrag_dateien SET updated_at = created_at WHERE updated_at IS NULL',
      [],
    );
  } catch {
    /* ignore */
  }
}

/**
 * Gemeinsame Kalender-Tabelle (Cockpit + CC Intern + FUSA).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlKalenderTermineTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS kalender_termine (
        id CHAR(36) NOT NULL,
        titel VARCHAR(500) NOT NULL,
        start VARCHAR(100) NOT NULL,
        ende VARCHAR(100) NULL,
        ganztag TINYINT(1) NOT NULL DEFAULT 0,
        typ VARCHAR(32) NOT NULL DEFAULT 'allgemein',
        quelle VARCHAR(32) NOT NULL DEFAULT 'manuell',
        mitarbeiter_ids LONGTEXT NOT NULL,
        auftrag_id CHAR(36) NULL,
        fusa_auftrag_id CHAR(36) NULL,
        farbe VARCHAR(32) NULL,
        notiz TEXT NULL,
        firma_id CHAR(36) NOT NULL,
        erstellt_von CHAR(36) NULL,
        erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        aktualisiert_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_kalender_termine_firma (firma_id),
        KEY idx_kalender_termine_start (start),
        KEY idx_kalender_termine_auftrag (auftrag_id),
        KEY idx_kalender_termine_fusa_auftrag (fusa_auftrag_id),
        CONSTRAINT fk_kalender_termine_auftrag
          FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE SET NULL,
        CONSTRAINT fk_kalender_termine_fusa_auftrag
          FOREIGN KEY (fusa_auftrag_id) REFERENCES auftraege (id) ON DELETE SET NULL,
        CONSTRAINT fk_kalender_termine_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
        CONSTRAINT fk_kalender_termine_user
          FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure kalender_termine table', e);
  }
  try { await qRun(pool, "ALTER TABLE kalender_termine ADD COLUMN quelle VARCHAR(32) NOT NULL DEFAULT 'manuell'", []); } catch {}
  try { await qRun(pool, 'ALTER TABLE kalender_termine ADD COLUMN fusa_auftrag_id CHAR(36) NULL', []); } catch {}
}

/**
 * Urlaubstabelle.
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlUrlaubAntraegeTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS urlaub_antraege (
        id CHAR(36) NOT NULL,
        mitarbeiter_id CHAR(36) NOT NULL,
        von VARCHAR(100) NOT NULL,
        bis VARCHAR(100) NOT NULL,
        tage DECIMAL(8,2) NOT NULL,
        typ VARCHAR(32) NOT NULL DEFAULT 'urlaub',
        status VARCHAR(32) NOT NULL DEFAULT 'offen',
        bemerkung TEXT NULL,
        entschieden_von CHAR(36) NULL,
        entschieden_am DATETIME(3) NULL,
        kalender_termin_id CHAR(36) NULL,
        kalender_termin_ids TEXT NULL,
        firma_id CHAR(36) NOT NULL,
        erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        aktualisiert_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_urlaub_antraege_firma (firma_id),
        KEY idx_urlaub_antraege_mitarbeiter (mitarbeiter_id),
        CONSTRAINT fk_urlaub_mitarbeiter
          FOREIGN KEY (mitarbeiter_id) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT fk_urlaub_entschieden_von
          FOREIGN KEY (entschieden_von) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT fk_urlaub_kalender_termin
          FOREIGN KEY (kalender_termin_id) REFERENCES kalender_termine (id) ON DELETE SET NULL,
        CONSTRAINT fk_urlaub_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure urlaub_antraege table', e);
  }
  try {
    await qRun(pool, 'ALTER TABLE urlaub_antraege ADD COLUMN kalender_termin_ids TEXT NULL', []);
  } catch {
    /* Spalte existiert */
  }
}

/** Spalte `artikelnummer` + einmalige Übernahme aus Seed-Marker in `lagerort`. */
async function ensureMysqlLagerMaterialArtikelnummerColumn(pool) {
  try {
    await qRun(pool, 'ALTER TABLE lager_material ADD COLUMN artikelnummer VARCHAR(255) NULL', []);
  } catch {
    /* Spalte existiert */
  }
  try {
    const rows = await qAll(
      pool,
      `SELECT id, firma_id, lagerort FROM lager_material WHERE lagerort LIKE '__cc_seed_nr:%'`,
      [],
    );
    for (const r of rows) {
      const lo = String((r && r.lagerort) || '');
      const m = lo.replace(/^__cc_seed_nr:/, '').trim();
      if (!m) continue;
      await qRun(
        pool,
        `UPDATE lager_material
         SET artikelnummer = IF(COALESCE(TRIM(artikelnummer), '') = '', ?, artikelnummer),
             lagerort = NULL
         WHERE id = ? AND firma_id = ?`,
        [m, String(r.id), String(r.firma_id)],
      );
    }
  } catch (e) {
    console.error('[mysql] lager_material artikelnummer migration', e);
  }
}

/**
 * Schreib-Audit (Phase A5).
 * @param {import('mysql2/promise').Pool} pool
 */
/** Cockpit Geräte (Phase B3). */
async function ensureMysqlGeraeteTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS geraete (
        id CHAR(36) NOT NULL,
        firma_id CHAR(36) NOT NULL,
        project_id CHAR(36) NULL,
        typ VARCHAR(255) NOT NULL,
        seriennummer VARCHAR(191) NULL,
        zugewiesen_an_user_id CHAR(36) NULL,
        status VARCHAR(64) NOT NULL DEFAULT 'aktiv',
        notiz TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uk_geraete_seriennummer (seriennummer),
        KEY idx_geraete_firma (firma_id),
        KEY idx_geraete_project (project_id),
        CONSTRAINT fk_geraete_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
        CONSTRAINT fk_geraete_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL,
        CONSTRAINT fk_geraete_user
          FOREIGN KEY (zugewiesen_an_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure geraete table', e);
  }
}

/** Phase B5: CC Intern CRM */
async function ensureMysqlCrmTables(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
        id CHAR(36) NOT NULL,
        firma_id CHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_crm_pipeline_firma (firma_id),
        KEY idx_crm_pipeline_sort (firma_id, sort_order),
        CONSTRAINT fk_crm_pipeline_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS crm_aktivitaeten (
        id CHAR(36) NOT NULL,
        firma_id CHAR(36) NOT NULL,
        kunde_id CHAR(36) NOT NULL,
        typ VARCHAR(32) NOT NULL,
        text TEXT NOT NULL,
        user_id CHAR(36) NULL,
        datum VARCHAR(64) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_crm_akt_firma (firma_id),
        KEY idx_crm_akt_kunde (firma_id, kunde_id),
        CONSTRAINT fk_crm_akt_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
        CONSTRAINT fk_crm_akt_kunde
          FOREIGN KEY (kunde_id) REFERENCES firmen (id) ON DELETE CASCADE,
        CONSTRAINT fk_crm_akt_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS crm_wiedervorlage (
        id CHAR(36) NOT NULL,
        firma_id CHAR(36) NOT NULL,
        kunde_id CHAR(36) NOT NULL,
        titel VARCHAR(500) NOT NULL DEFAULT '',
        datum VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'offen',
        user_id CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_crm_wv_firma (firma_id),
        KEY idx_crm_wv_kunde (firma_id, kunde_id),
        CONSTRAINT fk_crm_wv_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
        CONSTRAINT fk_crm_wv_kunde
          FOREIGN KEY (kunde_id) REFERENCES firmen (id) ON DELETE CASCADE,
        CONSTRAINT fk_crm_wv_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure crm tables', e);
  }
}

/** Phase B6: Refresh-Token + Mitarbeiter-Zeiten */
async function ensureMysqlRefreshTokensAndMitarbeiterZeiten(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS refresh_tokens (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        token_hash VARCHAR(128) NOT NULL,
        device_id VARCHAR(191) NULL,
        expires_at DATETIME(3) NOT NULL,
        revoked_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uk_refresh_tokens_hash (token_hash),
        KEY idx_refresh_tokens_user (user_id),
        KEY idx_refresh_tokens_expires (expires_at),
        CONSTRAINT fk_refresh_tokens_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS ccintern_mitarbeiter_zeiten (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        firma_id CHAR(36) NOT NULL,
        ccintern_auftrag_id CHAR(36) NOT NULL,
        minuten INT NOT NULL,
        notiz TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_cc_me_zeiten_user (user_id, created_at),
        KEY idx_cc_me_zeiten_auftrag (ccintern_auftrag_id),
        CONSTRAINT fk_cc_me_zeiten_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_cc_me_zeiten_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
        CONSTRAINT fk_cc_me_zeiten_auftrag
          FOREIGN KEY (ccintern_auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure refresh/zeiten tables', e);
  }
}

/** CC Intern: Quick-Status + Anwesenheit */
async function ensureMysqlCcInternMitarbeiterOperativTables(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS ccintern_mitarbeiter_status (
        id CHAR(36) NOT NULL,
        project_id CHAR(36) NULL,
        user_id CHAR(36) NOT NULL,
        firma_id CHAR(36) NOT NULL,
        status VARCHAR(32) NOT NULL,
        datum VARCHAR(32) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uk_cc_ma_stat_firma_user_datum (firma_id, user_id, datum),
        KEY idx_cc_ma_stat_firma (firma_id),
        CONSTRAINT fk_cc_ma_stat_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_cc_ma_stat_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS ccintern_mitarbeiter_anwesenheit (
        id CHAR(36) NOT NULL,
        project_id CHAR(36) NULL,
        user_id CHAR(36) NOT NULL,
        firma_id CHAR(36) NOT NULL,
        datum VARCHAR(32) NOT NULL,
        start VARCHAR(32) NULL,
        ende VARCHAR(32) NULL,
        pause_minuten INT NOT NULL DEFAULT 0,
        dauer_minuten INT NULL,
        typ VARCHAR(32) NOT NULL DEFAULT 'anwesenheit',
        notiz TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_cc_ma_anw_firma_user_datum (firma_id, user_id, datum),
        CONSTRAINT fk_cc_ma_anw_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_cc_ma_anw_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure ccintern mitarbeiter operativ', e);
  }
}

async function ensureMysqlAuditLogTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id CHAR(36) NOT NULL,
        ts DATETIME(3) NOT NULL,
        user_id CHAR(36) NULL,
        modul VARCHAR(64) NOT NULL,
        action VARCHAR(64) NOT NULL,
        resource_type VARCHAR(64) NULL,
        resource_id VARCHAR(128) NULL,
        project_id CHAR(36) NULL,
        payload_json TEXT NULL,
        PRIMARY KEY (id),
        KEY idx_audit_log_ts (ts),
        KEY idx_audit_log_user (user_id),
        KEY idx_audit_log_project (project_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure audit_log table', e);
  }
}

/**
 * Anfragen-Tabelle.
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlCcInternAnfragenTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS ccintern_anfragen (
        id CHAR(36) NOT NULL,
        anfragen_nr VARCHAR(32) NOT NULL,
        kunde_id CHAR(36) NULL,
        betreff VARCHAR(500) NOT NULL,
        beschreibung TEXT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'offen',
        zugewiesen_an CHAR(36) NULL,
        antwort_bis VARCHAR(100) NULL,
        firma_id CHAR(36) NOT NULL,
        erstellt_von CHAR(36) NULL,
        erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        aktualisiert_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL DEFAULT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_ccintern_anfragen_nr (anfragen_nr),
        KEY idx_ccintern_anfragen_firma (firma_id),
        KEY idx_ccintern_anfragen_status (status),
        CONSTRAINT fk_ccintern_anfragen_kunde
          FOREIGN KEY (kunde_id) REFERENCES firmen (id) ON DELETE SET NULL,
        CONSTRAINT fk_ccintern_anfragen_user_assignee
          FOREIGN KEY (zugewiesen_an) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT fk_ccintern_anfragen_user_creator
          FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT fk_ccintern_anfragen_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure ccintern_anfragen table', e);
  }
}

/**
 * ccintern_anfragen: Soft-Delete-Spalte (nur wenn fehlend).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlCcInternAnfragenDeletedAtColumn(pool) {
  try {
    const row = await qGet(
      pool,
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ccintern_anfragen' AND COLUMN_NAME = 'deleted_at'`,
      [],
    );
    if (Number(row?.c || 0) === 0) {
      await qRun(pool, 'ALTER TABLE ccintern_anfragen ADD COLUMN deleted_at DATETIME(3) NULL DEFAULT NULL', []);
    }
  } catch (e) {
    console.error('[mysql] ccintern_anfragen.deleted_at column', e);
  }
}

/**
 * Aufgaben-Tabelle.
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlAufgabenTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS aufgaben (
        id CHAR(36) NOT NULL,
        titel VARCHAR(255) NOT NULL,
        beschreibung TEXT NULL,
        zugewiesen_an CHAR(36) NULL,
        auftrag_id CHAR(36) NULL,
        faellig_am VARCHAR(100) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'offen',
        prioritaet VARCHAR(32) NOT NULL DEFAULT 'normal',
        firma_id CHAR(36) NOT NULL,
        erstellt_von CHAR(36) NULL,
        erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        aktualisiert_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_aufgaben_firma (firma_id),
        KEY idx_aufgaben_status (status),
        KEY idx_aufgaben_auftrag (auftrag_id),
        CONSTRAINT fk_aufgaben_user_assignee
          FOREIGN KEY (zugewiesen_an) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT fk_aufgaben_auftrag
          FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE SET NULL,
        CONSTRAINT fk_aufgaben_creator
          FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT fk_aufgaben_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure aufgaben table', e);
  }
}

/**
 * Rechnungen (statusbasiert, CC Intern).
 * @param {import('mysql2/promise').Pool} pool
 */
/**
 * CC Intern — Mitarbeiter-Stammdaten pro Firma.
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlCcInternMitarbeiterTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS mitarbeiter (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        firma_id CHAR(36) NOT NULL,
        vertrag_typ VARCHAR(64) NULL,
        soll_stunden DOUBLE NULL,
        eintrittsdatum VARCHAR(32) NULL,
        austrittsdatum VARCHAR(32) NULL,
        position VARCHAR(255) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uk_mitarbeiter_user_firma (user_id, firma_id),
        KEY idx_mitarbeiter_firma (firma_id),
        CONSTRAINT fk_mitarbeiter_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_mitarbeiter_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure mitarbeiter table', e);
  }
}

/**
 * CC Intern — Checklisten + Einträge pro Firma.
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlCcInternChecklistenTables(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS checklisten (
        id CHAR(36) NOT NULL,
        titel VARCHAR(500) NOT NULL,
        firma_id CHAR(36) NOT NULL,
        auftrag_id CHAR(36) NULL,
        erstellt_von CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_checklisten_firma (firma_id),
        KEY idx_checklisten_auftrag (auftrag_id),
        CONSTRAINT fk_checklisten_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
        CONSTRAINT fk_checklisten_auftrag
          FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE SET NULL,
        CONSTRAINT fk_checklisten_creator
          FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS checklisten_eintraege (
        id CHAR(36) NOT NULL,
        checkliste_id CHAR(36) NOT NULL,
        text TEXT NOT NULL,
        erledigt TINYINT(1) NOT NULL DEFAULT 0,
        reihenfolge INT NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        KEY idx_checklisten_eintraege_liste (checkliste_id, reihenfolge),
        CONSTRAINT fk_checklisten_eintraege_liste
          FOREIGN KEY (checkliste_id) REFERENCES checklisten (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure checklisten tables', e);
  }
}

/**
 * CC Intern — Produktionsaufträge (an ccintern_auftraege).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlCcInternProduktionAuftraegeTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS produktion_auftraege (
        id CHAR(36) NOT NULL,
        auftrag_id CHAR(36) NOT NULL,
        schritt VARCHAR(500) NOT NULL,
        fortschritt TINYINT UNSIGNED NOT NULL DEFAULT 0,
        verantwortlich CHAR(36) NULL,
        notiz TEXT NULL,
        gestartet_am VARCHAR(100) NULL,
        abgeschlossen_am VARCHAR(100) NULL,
        firma_id CHAR(36) NOT NULL,
        PRIMARY KEY (id),
        KEY idx_produktion_auftraege_firma (firma_id),
        KEY idx_produktion_auftraege_auftrag (auftrag_id),
        KEY idx_produktion_auftraege_verantwortlich (verantwortlich),
        CONSTRAINT fk_produktion_auftraege_auftrag
          FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE CASCADE,
        CONSTRAINT fk_produktion_auftraege_verantwortlich
          FOREIGN KEY (verantwortlich) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT fk_produktion_auftraege_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure produktion_auftraege table', e);
  }
}

async function ensureMysqlCcInternRechnungenTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS ccintern_rechnungen (
        id CHAR(36) NOT NULL,
        rechnungsnummer VARCHAR(32) NOT NULL,
        auftrag_id CHAR(36) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'offen',
        faellig_am VARCHAR(100) NULL,
        bezahlt_am VARCHAR(100) NULL,
        bemerkung TEXT NULL,
        firma_id CHAR(36) NOT NULL,
        erstellt_von CHAR(36) NULL,
        erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        aktualisiert_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL DEFAULT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_ccintern_rechnungen_nr (rechnungsnummer),
        KEY idx_ccintern_rechnungen_firma (firma_id),
        KEY idx_ccintern_rechnungen_status (status),
        KEY idx_ccintern_rechnungen_auftrag (auftrag_id),
        CONSTRAINT fk_ccintern_rechnungen_auftrag
          FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE RESTRICT,
        CONSTRAINT fk_ccintern_rechnungen_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
        CONSTRAINT fk_ccintern_rechnungen_creator
          FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure ccintern_rechnungen table', e);
  }
}

async function ensureMysqlCcInternRechnungenDeletedAtColumn(pool) {
  try {
    const row = await qGet(
      pool,
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ccintern_rechnungen' AND COLUMN_NAME = 'deleted_at'`,
      [],
    );
    if (Number(row?.c || 0) === 0) {
      await qRun(pool, 'ALTER TABLE ccintern_rechnungen ADD COLUMN deleted_at DATETIME(3) NULL DEFAULT NULL', []);
    }
  } catch (e) {
    console.error('[mysql] ccintern_rechnungen.deleted_at column', e);
  }
}

/**
 * CC Intern — Angebote (project-basiert, Soft-Delete).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlCcInternAngeboteTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS ccintern_angebote (
        id CHAR(36) NOT NULL,
        project_id CHAR(36) NOT NULL,
        kunde_id CHAR(36) NULL,
        titel VARCHAR(500) NOT NULL,
        beschreibung TEXT NULL,
        betrag_cent INT NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'offen',
        origin VARCHAR(32) NOT NULL DEFAULT 'ccintern',
        erstellt_von CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY idx_ccintern_angebote_project (project_id),
        KEY idx_ccintern_angebote_deleted (deleted_at),
        CONSTRAINT fk_ccintern_angebote_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
        CONSTRAINT fk_ccintern_angebote_kunde
          FOREIGN KEY (kunde_id) REFERENCES firmen (id) ON DELETE SET NULL,
        CONSTRAINT fk_ccintern_angebote_creator
          FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure ccintern_angebote table', e);
  }
}

/**
 * MesseFlow Projekte + Wände + Dateien.
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlMesseflowProjekteTable(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS messeflow_projekte (
        id CHAR(36) NOT NULL,
        name VARCHAR(500) NOT NULL,
        kunde VARCHAR(500) NULL,
        agentur_id CHAR(36) NULL,
        lieferdatum VARCHAR(100) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'neu',
        messe VARCHAR(255) NULL,
        stand VARCHAR(255) NULL,
        prioritaet VARCHAR(32) NULL,
        bemerkung TEXT NULL,
        firma_id CHAR(36) NOT NULL,
        erstellt_von CHAR(36) NULL,
        erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        aktualisiert_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_messeflow_projekte_firma (firma_id),
        KEY idx_messeflow_projekte_status (status),
        CONSTRAINT fk_messeflow_projekte_agentur
          FOREIGN KEY (agentur_id) REFERENCES firmen (id) ON DELETE SET NULL,
        CONSTRAINT fk_messeflow_projekte_firma
          FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
        CONSTRAINT fk_messeflow_projekte_creator
          FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS messeflow_waende (
        id CHAR(36) NOT NULL,
        projekt_id CHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        breite DECIMAL(12,3) NULL,
        hoehe DECIMAL(12,3) NULL,
        einheit VARCHAR(32) NULL,
        material VARCHAR(100) NULL,
        status VARCHAR(32) NULL,
        bemerkung TEXT NULL,
        sort_index INT NOT NULL DEFAULT 0,
        erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        aktualisiert_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_messeflow_waende_projekt (projekt_id, sort_index),
        CONSTRAINT fk_messeflow_waende_projekt
          FOREIGN KEY (projekt_id) REFERENCES messeflow_projekte (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS messeflow_wand_dateien (
        id CHAR(36) NOT NULL,
        wand_id CHAR(36) NOT NULL,
        name VARCHAR(500) NOT NULL,
        pfad VARCHAR(2000) NULL,
        mime_type VARCHAR(255) NULL,
        groesse BIGINT NULL,
        status VARCHAR(64) NULL,
        bemerkung TEXT NULL,
        meta_json LONGTEXT NULL,
        erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        aktualisiert_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_messeflow_wand_dateien_wand (wand_id, erstellt_am),
        CONSTRAINT fk_messeflow_wand_dateien_wand
          FOREIGN KEY (wand_id) REFERENCES messeflow_waende (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure messeflow project tables', e);
  }
}

/**
 * Strukturierte MesseFlow Domänen-Tabellen (mf_*).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureMysqlMfDomainTables(pool) {
  try {
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS mf_projekte (
        id CHAR(36) NOT NULL,
        name VARCHAR(500) NOT NULL DEFAULT '',
        status VARCHAR(32) NOT NULL DEFAULT 'aktiv',
        verantwortlicher CHAR(36) NULL,
        messe_name VARCHAR(500) NULL,
        messe_datum_von VARCHAR(100) NULL,
        messe_datum_bis VARCHAR(100) NULL,
        ort VARCHAR(255) NULL,
        notizen TEXT NULL,
        extra_json LONGTEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_mf_projekte_created (created_at),
        CONSTRAINT fk_mf_projekte_verantwortlicher
          FOREIGN KEY (verantwortlicher) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS mf_projekt_users (
        projekt_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        rolle VARCHAR(64) NOT NULL DEFAULT 'mitarbeiter',
        PRIMARY KEY (projekt_id, user_id),
        CONSTRAINT fk_mf_projekt_users_projekt
          FOREIGN KEY (projekt_id) REFERENCES mf_projekte (id) ON DELETE CASCADE,
        CONSTRAINT fk_mf_projekt_users_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS mf_aufgaben (
        id CHAR(36) NOT NULL,
        projekt_id CHAR(36) NOT NULL,
        titel VARCHAR(500) NOT NULL DEFAULT '',
        beschreibung TEXT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'offen',
        prioritaet VARCHAR(32) DEFAULT 'normal',
        faellig_am VARCHAR(100) NULL,
        zugewiesen_an CHAR(36) NULL,
        extra_json LONGTEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_mf_aufgaben_projekt (projekt_id, created_at),
        CONSTRAINT fk_mf_aufgaben_projekt
          FOREIGN KEY (projekt_id) REFERENCES mf_projekte (id) ON DELETE CASCADE,
        CONSTRAINT fk_mf_aufgaben_user
          FOREIGN KEY (zugewiesen_an) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
    await qRun(
      pool,
      `CREATE TABLE IF NOT EXISTS mf_dokumente (
        id CHAR(36) NOT NULL,
        projekt_id CHAR(36) NOT NULL,
        name VARCHAR(500) NOT NULL DEFAULT '',
        typ VARCHAR(100) NULL,
        url VARCHAR(2000) NULL,
        pruef_status VARCHAR(64) DEFAULT 'ausstehend',
        pruef_ergebnis_json LONGTEXT NULL,
        uploaded_by CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_mf_dokumente_projekt (projekt_id, created_at),
        CONSTRAINT fk_mf_dokumente_projekt
          FOREIGN KEY (projekt_id) REFERENCES mf_projekte (id) ON DELETE CASCADE,
        CONSTRAINT fk_mf_dokumente_user
          FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (e) {
    console.error('[mysql] ensure mf_* tables', e);
  }
}

export async function createMysqlStore() {
  const host = String(process.env.MYSQL_HOST || '').trim();
  const user = String(process.env.MYSQL_USER || '').trim();
  const password = String(process.env.MYSQL_PASSWORD ?? '');
  const database = String(process.env.MYSQL_DATABASE || '').trim();
  if (!host || !user || !database) {
    throw new Error(
      'MySQL: MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD und MYSQL_DATABASE müssen gesetzt sein.',
    );
  }
  const port = Number.parseInt(String(process.env.MYSQL_PORT || '3306'), 10) || 3306;
  const ssl = String(process.env.MYSQL_SSL || '') === '1' ? { rejectUnauthorized: false } : undefined;

  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 16,
    timezone: 'Z',
    ssl,
    /** Verhindert `bigint` in Zeilenobjekten → `res.json` wirft sonst „Do not know how to serialize a BigInt“. */
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  await ensureMysqlGlobalRightsMigration(pool);
  await ensureMysqlFusaModuleForCollaboratorUsers(pool);
  await ensureMysqlRoleTemplatesMigration(pool);
  await ensureMysqlUsersSollUrlaubColumns(pool);
  await ensureMysqlFirmenCockpitInvitesTables(pool);
  await ensureMysqlProjectsDeadlineColumn(pool);
  await ensureMysqlAuftraegeTerminEndeColumn(pool);
  await ensureMysqlFusaApiSupport(pool);
  await ensureMysqlFusaDokumenteTable(pool);
  await ensureMysqlFusaAngeboteTable(pool);
  await ensureMysqlMesseflowWorkspaceTable(pool);
  await ensureMysqlCcInternAuftraegeTable(pool);
  await ensureMysqlCcInternAuftragDateienTable(pool);
  await ensureMysqlKalenderTermineTable(pool);
  await ensureMysqlUrlaubAntraegeTable(pool);
  await ensureMysqlLagerMaterialArtikelnummerColumn(pool);
  await ensureMysqlCcInternAnfragenTable(pool);
  await ensureMysqlCcInternAnfragenDeletedAtColumn(pool);
  await ensureMysqlAufgabenTable(pool);
  await ensureMysqlCcInternRechnungenTable(pool);
  await ensureMysqlCcInternRechnungenDeletedAtColumn(pool);
  await ensureMysqlCcInternAngeboteTable(pool);
  await ensureMysqlCcInternMitarbeiterTable(pool);
  await ensureMysqlCcInternChecklistenTables(pool);
  await ensureMysqlCcInternProduktionAuftraegeTable(pool);
  await ensureMysqlMesseflowProjekteTable(pool);
  await ensureMysqlMfDomainTables(pool);
  await ensureMysqlAuditLogTable(pool);
  await ensureMysqlGeraeteTable(pool);
  await ensureMysqlCrmTables(pool);
  await ensureMysqlRefreshTokensAndMitarbeiterZeiten(pool);
  await ensureMysqlCcInternMitarbeiterOperativTables(pool);

  return {
    async getUserByEmail(email) {
      return qGet(
        pool,
        'SELECT id, email, password_hash, name, global_role, created_at FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1',
        [email],
      );
    },
    async getUserById(id) {
      return qGet(
        pool,
        'SELECT id, email, name, global_role, company_id, status, soll, urlaub, created_at FROM users WHERE id = ? LIMIT 1',
        [id],
      );
    },
    async insertUser({ id, email, passwordHash, name, globalRole, soll, urlaub }) {
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
      await qRun(pool, 'INSERT INTO users (id, email, password_hash, name, global_role, soll, urlaub) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        id,
        email,
        passwordHash,
        name,
        gr,
        sollN,
        urlaubN,
      ]);
    },
    async userExistsByEmail(email) {
      const row = await qGet(
        pool,
        'SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1',
        [email],
      );
      return row != null;
    },
    async listUsers() {
      return qAll(
        pool,
        `SELECT u.id, u.email, u.name, u.global_role, u.company_id, u.status, u.soll, u.urlaub, u.created_at,
            m.position AS kuerzel,
            COALESCE(
              (SELECT GROUP_CONCAT(um.module ORDER BY um.module SEPARATOR ',')
               FROM user_modules um WHERE um.user_id = u.id),
              ''
            ) AS modules_csv
         FROM users u
         LEFT JOIN mitarbeiter m ON m.user_id = u.id
         ORDER BY u.created_at ASC`,
        [],
      );
    },
    async updateUserStatus(userId, status) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const st = status === 'deaktiviert' ? 'deaktiviert' : 'aktiv';
      if (!uid) return false;
      await qRun(pool, 'UPDATE users SET status = ? WHERE id = ?', [st, uid]);
      return true;
    },
    async updateUserPasswordHash(userId, passwordHash) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid || typeof passwordHash !== 'string' || !passwordHash) return false;
      await qRun(pool, 'UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, uid]);
      return true;
    },
    async updateUserCompany(userId, companyId) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid) return false;
      const cid = typeof companyId === 'string' && companyId.trim() ? companyId.trim() : null;
      await qRun(pool, 'UPDATE users SET company_id = ? WHERE id = ?', [cid, uid]);
      return true;
    },
    async updateUserProfile(userId, patch) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid || !patch || typeof patch !== 'object') return null;
      const row = await this.getUserById(uid);
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
      await qRun(pool, 'UPDATE users SET name = ?, global_role = ?, status = ?, soll = ?, urlaub = ? WHERE id = ?', [
        name,
        globalRole,
        status,
        soll,
        urlaub,
        uid,
      ]);
      return this.getUserById(uid);
    },
    async deleteUserById(userId) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid) return false;
      await qRun(pool, 'DELETE FROM users WHERE id = ?', [uid]);
      return true;
    },
    async listRoleTemplates() {
      return qAll(
        pool,
        'SELECT id, name, description, modules_json, rights_json, created_at FROM role_templates ORDER BY created_at DESC',
        [],
      );
    },
    async getRoleTemplateById(id) {
      if (typeof id !== 'string' || !id.trim()) return null;
      return qGet(pool, 'SELECT id, name, description, modules_json, rights_json, created_at FROM role_templates WHERE id = ? LIMIT 1', [
        id.trim(),
      ]);
    },
    async insertRoleTemplate({ id, name, description, modules, rights }) {
      const tid = typeof id === 'string' && id.trim() ? id.trim() : '';
      if (!tid) throw new Error('insertRoleTemplate: id fehlt');
      const mods = JSON.stringify(Array.isArray(modules) ? modules : []);
      const rj = JSON.stringify(rights && typeof rights === 'object' ? rights : {});
      await qRun(pool, 'INSERT INTO role_templates (id, name, description, modules_json, rights_json) VALUES (?, ?, ?, ?, ?)', [
        tid,
        String(name || '').trim() || 'Vorlage',
        description != null ? String(description) : '',
        mods,
        rj,
      ]);
    },
    async deleteRoleTemplate(id) {
      if (typeof id !== 'string' || !id.trim()) return;
      await qRun(pool, 'DELETE FROM role_templates WHERE id = ?', [id.trim()]);
    },
    async listUserModules(userId) {
      if (typeof userId !== 'string' || !userId.trim()) return [];
      return qAll(pool, 'SELECT module FROM user_modules WHERE user_id = ? ORDER BY module', [userId.trim()]);
    },
    async listUserRights(userId) {
      if (typeof userId !== 'string' || !userId.trim()) return [];
      return qAll(
        pool,
        'SELECT module, bereich, rechte_json FROM user_rights WHERE user_id = ? ORDER BY module, bereich',
        [userId.trim()],
      );
    },
    async ensureUserModule(userId, module) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const mod = typeof module === 'string' ? module.trim() : '';
      if (!uid || !mod) return;
      await qRun(pool, 'INSERT IGNORE INTO user_modules (user_id, module) VALUES (?, ?)', [uid, mod]);
    },
    /**
     * Eine Rechte-Zeile setzen (kein Löschen anderer Zeilen).
     * @param {string} userId
     * @param {'cockpit'|'fusa'|'ccintern'} module
     * @param {string} bereich
     * @param {unknown} rights
     */
    async upsertUserRight(userId, module, bereich, rights) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const mod = typeof module === 'string' ? module.trim() : '';
      const ber = typeof bereich === 'string' ? bereich.trim() : '';
      if (!uid || !mod || !ber) return;
      const flags = normalizeRightsJson(rights);
      await qRun(pool, 'REPLACE INTO user_rights (user_id, module, bereich, rechte_json) VALUES (?, ?, ?, ?)', [
        uid,
        mod,
        ber,
        JSON.stringify(flags),
      ]);
    },
    async replaceUserAccessBundle({ userId, globalRole, modules, rights }) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid) throw new Error('replaceUserAccessBundle: userId fehlt');
      const gr =
        globalRole === 'SUPER_ADMIN' || globalRole === 'INTERN' || globalRole === 'EXTERN'
          ? globalRole
          : 'INTERN';
      const conn = await pool.getConnection();
      await conn.beginTransaction();
      try {
        await conn.execute('UPDATE users SET global_role = ? WHERE id = ?', [gr, uid]);
        await conn.execute('DELETE FROM user_modules WHERE user_id = ?', [uid]);
        await conn.execute('DELETE FROM user_rights WHERE user_id = ?', [uid]);
        const modList = Array.isArray(modules) ? modules : [];
        for (const m of modList) {
          if (typeof m !== 'string' || !m.trim()) continue;
          await conn.execute('INSERT INTO user_modules (user_id, module) VALUES (?, ?)', [uid, m.trim()]);
        }
        if (rights && typeof rights === 'object') {
          for (const mod of Object.keys(rights)) {
            const bereiche = /** @type {Record<string, unknown>} */ (rights)[mod];
            if (!bereiche || typeof bereiche !== 'object') continue;
            for (const b of Object.keys(bereiche)) {
              const flags = normalizeRightsJson(
                /** @type {Record<string, unknown>} */ (bereiche)[b],
              );
              await conn.execute(
                'INSERT INTO user_rights (user_id, module, bereich, rechte_json) VALUES (?, ?, ?, ?)',
                [uid, mod, b, JSON.stringify(flags)],
              );
            }
          }
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
    async listProjects() {
      return qAll(
        pool,
        `SELECT p.id, p.name, p.kunden_id, p.deadline, p.created_at,
                k.name AS kunde_name, k.ansprechpartner AS kunde_ansprechpartner
         FROM projects p
         LEFT JOIN kunden k ON k.id = p.kunden_id
         ORDER BY p.created_at DESC`,
        [],
      );
    },
    async listProjectsForUser(_userId) {
      return qAll(
        pool,
        `SELECT p.id, p.name, p.kunden_id, p.deadline, p.created_at,
                k.name AS kunde_name, k.ansprechpartner AS kunde_ansprechpartner
         FROM projects p
         LEFT JOIN kunden k ON k.id = p.kunden_id
         ORDER BY p.created_at DESC`,
        [],
      );
    },
    async getProjectById(id) {
      return qGet(
        pool,
        `SELECT p.id, p.name, p.kunden_id, p.deadline, p.created_at,
                k.name AS kunde_name, k.ansprechpartner AS kunde_ansprechpartner
         FROM projects p
         LEFT JOIN kunden k ON k.id = p.kunden_id
         WHERE p.id = ? LIMIT 1`,
        [id],
      );
    },
    async insertProject({ id, name, kundenId }) {
      await qRun(pool, 'INSERT INTO projects (id, name, kunden_id) VALUES (?, ?, ?)', [
        id,
        name,
        kundenId != null && String(kundenId).trim() ? String(kundenId).trim() : null,
      ]);
    },
    async createProjectWithOwnerAccess({ projectId, name, userId, kundenId }) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!uid) throw new Error('createProjectWithOwnerAccess: userId fehlt');
      const kid =
        kundenId != null && String(kundenId).trim() !== '' ? String(kundenId).trim() : null;
      if (kid) {
        const kr = await qGet(pool, 'SELECT id FROM kunden WHERE id = ? LIMIT 1', [kid]);
        if (!kr) throw new Error('createProjectWithOwnerAccess: Kunde nicht gefunden');
      }
      await qRun(pool, 'INSERT INTO projects (id, name, kunden_id) VALUES (?, ?, ?)', [
        projectId,
        name,
        kid,
      ]);
    },
    async updateProject(projectId, patch) {
      const row = await qGet(pool, 'SELECT id, name, kunden_id, deadline FROM projects WHERE id = ? LIMIT 1', [
        projectId,
      ]);
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
          const krow = await qGet(pool, 'SELECT id FROM kunden WHERE id = ? LIMIT 1', [v.trim()]);
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
      await qRun(pool, 'UPDATE projects SET name = ?, kunden_id = ?, deadline = ? WHERE id = ?', [
        nextName,
        nextKundenId,
        nextDeadline,
        projectId,
      ]);
      return qGet(
        pool,
        `SELECT p.id, p.name, p.kunden_id, p.deadline, p.created_at,
                k.name AS kunde_name, k.ansprechpartner AS kunde_ansprechpartner
         FROM projects p
         LEFT JOIN kunden k ON k.id = p.kunden_id
         WHERE p.id = ? LIMIT 1`,
        [projectId],
      );
    },
    /** LEGACY: Tabelle `kunden` — nicht für neue Features nutzen; siehe firmen / `/api/v1/firmen` / `/api/v1/stammdaten/kunden`. **projects.kunden_id** bleibt bis zur Migration unverändert. */
    async listKunden() {
      return qAll(
        pool,
        'SELECT id, name, ansprechpartner, telefon, email, adresse, created_at FROM kunden ORDER BY name ASC',
        [],
      );
    },
    /** LEGACY: Tabelle `kunden` — nicht für neue Features nutzen; siehe firmen / `/api/v1/firmen` / `/api/v1/stammdaten/kunden`. **projects.kunden_id** bleibt bis zur Migration unverändert. */
    async getKundeById(id) {
      return qGet(
        pool,
        'SELECT id, name, ansprechpartner, telefon, email, adresse, created_at FROM kunden WHERE id = ? LIMIT 1',
        [id],
      );
    },
    /** LEGACY: Tabelle `kunden` — nicht für neue Features nutzen; siehe firmen / `/api/v1/firmen` / `/api/v1/stammdaten/kunden`. **projects.kunden_id** bleibt bis zur Migration unverändert. */
    async insertKunde({ id, name, ansprechpartner, telefon, email, adresse }) {
      await qRun(
        pool,
        'INSERT INTO kunden (id, name, ansprechpartner, telefon, email, adresse) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, ansprechpartner ?? null, telefon ?? null, email ?? null, adresse ?? null],
      );
    },
    /** LEGACY: Tabelle `kunden` — nicht für neue Features nutzen; siehe firmen / `/api/v1/firmen` / `/api/v1/stammdaten/kunden`. **projects.kunden_id** bleibt bis zur Migration unverändert. */
    async updateKunde(kundeId, patch) {
      const row = await qGet(
        pool,
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
      await qRun(
        pool,
        'UPDATE kunden SET name = ?, ansprechpartner = ?, telefon = ?, email = ?, adresse = ? WHERE id = ?',
        [nextName, nextAp, nextTel, nextEmail, nextAdr, kundeId],
      );
      return qGet(
        pool,
        'SELECT id, name, ansprechpartner, telefon, email, adresse, created_at FROM kunden WHERE id = ? LIMIT 1',
        [kundeId],
      );
    },
    /** LEGACY: Tabelle `angebote` — nicht für neue Features; nutze **fusa_angebote** / **ccintern_angebote**. */
    async listAngeboteForUser(_userId) {
      return qAll(
        pool,
        `SELECT a.id, a.project_id, a.titel, a.angebotsnummer, a.status, a.betrag_netto, a.notiz,
                a.erstellt_von, a.created_at, a.updated_at,
                p.name AS project_name,
                k.name AS kunde_name
         FROM angebote a
         INNER JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         ORDER BY a.created_at DESC`,
        [],
      );
    },
    /** LEGACY: Tabelle `angebote` — nicht für neue Features; nutze **fusa_angebote** / **ccintern_angebote**. */
    async getAngebotById(id) {
      return qGet(
        pool,
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
    async nextAngebotsnummerFallback() {
      const year = new Date().getFullYear();
      const prefix = `ANG-${year}-`;
      const row = await qGet(pool, 'SELECT COUNT(*) AS n FROM angebote WHERE angebotsnummer LIKE ?', [
        `${prefix}%`,
      ]);
      const n = row && row.n != null ? Number(row.n) + 1 : 1;
      return `${prefix}${String(n).padStart(3, '0')}`;
    },
    /** LEGACY: Tabelle `angebote` — nicht für neue Features; nutze **fusa_angebote** / **ccintern_angebote**. */
    async insertAngebot({ id, projectId, titel, angebotsnummer, status, betragNetto, notiz, erstelltVon }) {
      await qRun(
        pool,
        `INSERT INTO angebote (id, project_id, titel, angebotsnummer, status, betrag_netto, notiz, erstellt_von, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
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
    },
    /** LEGACY: Tabelle `angebote` — nicht für neue Features; nutze **fusa_angebote** / **ccintern_angebote**. */
    async updateAngebot(angebotId, patch) {
      const row = await qGet(
        pool,
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
      await qRun(
        pool,
        `UPDATE angebote SET titel = ?, angebotsnummer = ?, status = ?, betrag_netto = ?, notiz = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [nextTitel, nextNr, nextStatus, nextBetrag, nextNotiz, angebotId],
      );
      return qGet(
        pool,
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
    async listAuftraege() {
      return qAll(
        pool,
        'SELECT id, title, project_id, status, termin, termin_ende, created_at FROM auftraege ORDER BY created_at DESC',
        [],
      );
    },
    async listAuftraegeForUser(_userId) {
      return qAll(
        pool,
        `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                COALESCE(fusaf.name, k.name) AS kunde_name,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', fusaf.ansprechpartner_vorname, fusaf.ansprechpartner_nachname)), ''), k.ansprechpartner) AS kunde_ansprechpartner
         FROM auftraege a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
         WHERE a.project_id IS NOT NULL
         ORDER BY a.created_at DESC`,
        [],
      );
    },
    async insertAuftrag({
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
      await qRun(
        pool,
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
    },
    async insertAuftragWithFusaBelegungen({
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
      const insertSql = `INSERT INTO auftraege (id, title, project_id, status, termin, termin_ende,
                fusa_original_id, fusa_kunde_id, fusa_fahrzeug_ids, fusa_extra_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const insertParams = [
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
      ];

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
        await qRun(pool, insertSql, insertParams);
        return { ok: true };
      }

      const z = auftragTermineZuBelegungIso(termin, terminEnde);
      if (!z.ok) {
        return { ok: false, code: z.code, message: z.message };
      }
      const st0 = String(fusaBelegungStatus || 'aktiv').toLowerCase();
      const belegStatus = ['reserviert', 'aktiv', 'beendet', 'storniert'].includes(st0) ? st0 : 'aktiv';

      const overlapRows = await this.listFusaBelegungenOverlappendMitAuftragExtra(
        projectId,
        z.startdatum,
        z.enddatum,
        null,
      );
      const kennungenById = await this.getFahrzeugKennungenByIds(fahrzeugIds);
      const fzRowsIns = await this.getFahrzeugeByIds(fahrzeugIds);
      const fzByIdIns = Object.fromEntries(fzRowsIns.map((r) => [String(r.id), r]));
      const schaedenProjIns = await this.listSchaedenForProject(projectId);
      const fc = pruefeFusaBuchungVorBelegung({
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
      if (!fc.ok) return fc;

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(insertSql, insertParams);
        for (const vid of fahrzeugIds) {
          const bid = randomUUID();
          await conn.execute(
            `INSERT INTO fusa_belegungen (id, project_id, auftrag_id, fahrzeug_id, startdatum, enddatum, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            [bid, projectId, id, vid, z.startdatum, z.enddatum, belegStatus],
          );
        }
        await conn.commit();
      } catch {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        return {
          ok: false,
          code: 'DATABASE_ERROR',
          message: 'Auftrag/Belegung konnte nicht gespeichert werden.',
        };
      } finally {
        conn.release();
      }
      return { ok: true };
    },
    async replaceFusaBelegungenForAuftrag({
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
      const row = await qGet(pool, 'SELECT id, project_id FROM auftraege WHERE id = ? LIMIT 1', [aid]);
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
        await qRun(pool, 'DELETE FROM fusa_belegungen WHERE auftrag_id = ?', [aid]);
        return { ok: true };
      }

      const z = auftragTermineZuBelegungIso(termin, terminEnde);
      if (!z.ok) {
        return { ok: false, code: z.code, message: z.message };
      }
      const st0 = String(fusaBelegungStatus || 'aktiv').toLowerCase();
      const belegStatus = ['reserviert', 'aktiv', 'beendet', 'storniert'].includes(st0) ? st0 : 'aktiv';

      const exRow = await qGet(pool, 'SELECT fusa_extra_json FROM auftraege WHERE id = ? LIMIT 1', [aid]);
      const overlapRows = await this.listFusaBelegungenOverlappendMitAuftragExtra(
        pid,
        z.startdatum,
        z.enddatum,
        aid,
      );
      const kennungenById = await this.getFahrzeugKennungenByIds(fahrzeugIds);
      const fzRowsRep = await this.getFahrzeugeByIds(fahrzeugIds);
      const fzByIdRep = Object.fromEntries(fzRowsRep.map((r) => [String(r.id), r]));
      const schaedenProjRep = await this.listSchaedenForProject(pid);
      const fcRep = pruefeFusaBuchungVorBelegung({
        projectId: pid,
        overlapRows,
        fahrzeugIds,
        fusaExtraJsonStr: exRow?.fusa_extra_json,
        excludeAuftragId: aid,
        kennungenById,
        fahrzeugRowsById: fzByIdRep,
        schaedenRowsAll: schaedenProjRep,
        startdatum: z.startdatum,
        enddatum: z.enddatum,
      });
      if (!fcRep.ok) return fcRep;

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute('DELETE FROM fusa_belegungen WHERE auftrag_id = ?', [aid]);
        for (const vid of fahrzeugIds) {
          const bid = randomUUID();
          await conn.execute(
            `INSERT INTO fusa_belegungen (id, project_id, auftrag_id, fahrzeug_id, startdatum, enddatum, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            [bid, pid, aid, vid, z.startdatum, z.enddatum, belegStatus],
          );
        }
        await conn.commit();
      } catch {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        return {
          ok: false,
          code: 'DATABASE_ERROR',
          message: 'Belegungen konnten nicht aktualisiert werden.',
        };
      } finally {
        conn.release();
      }
      return { ok: true };
    },
    async getAuftragById(id) {
      return qGet(
        pool,
        `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                COALESCE(fusaf.name, k.name) AS kunde_name,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', fusaf.ansprechpartner_vorname, fusaf.ansprechpartner_nachname)), ''), k.ansprechpartner) AS kunde_ansprechpartner
         FROM auftraege a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
         WHERE a.id = ? LIMIT 1`,
        [id],
      );
    },
    async listFahrzeugeForUser(_userId) {
      return qAll(
        pool,
        `SELECT f.id, f.project_id, f.kennung, f.typ, f.kennzeichen, f.status, f.details_json, f.created_at
         FROM fahrzeuge f
         ORDER BY f.created_at DESC, f.kennung ASC`,
        [],
      );
    },
    async getFahrzeugById(id) {
      return qGet(
        pool,
        'SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at FROM fahrzeuge WHERE id = ? LIMIT 1',
        [id],
      );
    },
    async insertFahrzeug({ id, projectId, kennung, typ, kennzeichen, status, detailsJson }) {
      await qRun(
        pool,
        'INSERT INTO fahrzeuge (id, project_id, kennung, typ, kennzeichen, status, details_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, projectId, kennung, typ, kennzeichen ?? null, status ?? null, detailsJson ?? null],
      );
    },
    async updateFahrzeug(fahrzeugId, patch) {
      const row = await qGet(
        pool,
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
      await qRun(
        pool,
        'UPDATE fahrzeuge SET kennung = ?, typ = ?, kennzeichen = ?, status = ? WHERE id = ?',
        [nextKennung, nextTyp, nextKennzeichen, nextStatus, fahrzeugId],
      );
      return qGet(
        pool,
        'SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at FROM fahrzeuge WHERE id = ? LIMIT 1',
        [fahrzeugId],
      );
    },
    async setFahrzeugDetailsJson(fahrzeugId, detailsJson) {
      await qRun(pool, 'UPDATE fahrzeuge SET details_json = ? WHERE id = ?', [detailsJson ?? null, fahrzeugId]);
      return qGet(
        pool,
        'SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at FROM fahrzeuge WHERE id = ? LIMIT 1',
        [fahrzeugId],
      );
    },
    async listSchaedenForUser(_userId) {
      return qAll(
        pool,
        `SELECT s.id, s.project_id, s.fahrzeug_id, s.titel, s.beschreibung, s.status,
                s.werkstatt_status, s.bearbeitet_von, s.bearbeitet_am, s.extra_json, s.created_at,
                f.kennung AS fahrzeug_kennung,
                (SELECT COUNT(*) FROM schaden_fotos sf WHERE sf.schaden_id = s.id) AS foto_count
         FROM schaeden s
         LEFT JOIN fahrzeuge f ON f.id = s.fahrzeug_id
         ORDER BY s.created_at DESC`,
        [],
      );
    },
    async listSchaedenForProject(projectId) {
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!pid) return [];
      return qAll(
        pool,
        `SELECT s.id, s.project_id, s.fahrzeug_id, s.titel, s.beschreibung, s.status,
                s.werkstatt_status, s.bearbeitet_von, s.bearbeitet_am, s.extra_json, s.created_at,
                f.kennung AS fahrzeug_kennung,
                (SELECT COUNT(*) FROM schaden_fotos sf WHERE sf.schaden_id = s.id) AS foto_count
         FROM schaeden s
         LEFT JOIN fahrzeuge f ON f.id = s.fahrzeug_id
         WHERE s.project_id = ?
         ORDER BY s.created_at DESC`,
        [pid],
      );
    },
    async getSchadenById(id) {
      return qGet(
        pool,
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
    async insertSchaden({ id, projectId, fahrzeugId, titel, beschreibung, status, extraJson }) {
      await qRun(
        pool,
        `INSERT INTO schaeden (id, project_id, fahrzeug_id, titel, beschreibung, status, werkstatt_status, bearbeitet_von, bearbeitet_am, extra_json)
         VALUES (?, ?, ?, ?, ?, ?, 'offen', NULL, NULL, ?)`,
        [id, projectId, fahrzeugId, titel, beschreibung ?? null, status, extraJson ?? null],
      );
    },
    async updateSchadenWerkstatt(schadenId, werkstattStatus, userId) {
      const allowed = new Set(['offen', 'in_arbeit', 'fertig']);
      if (!allowed.has(werkstattStatus)) {
        return { error: 'INVALID_WERKSTATT_STATUS' };
      }
      const row = await qGet(pool, 'SELECT id FROM schaeden WHERE id = ? LIMIT 1', [schadenId]);
      if (!row) return null;
      const now = new Date().toISOString();
      await qRun(
        pool,
        'UPDATE schaeden SET werkstatt_status = ?, bearbeitet_von = ?, bearbeitet_am = ? WHERE id = ?',
        [werkstattStatus, userId, now, schadenId],
      );
      return qGet(
        pool,
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
    async listSchadenFotos(schadenId) {
      return qAll(
        pool,
        'SELECT id, schaden_id, file_path, created_at FROM schaden_fotos WHERE schaden_id = ? ORDER BY created_at ASC',
        [schadenId],
      );
    },
    async getSchadenFotoById(fotoId) {
      return qGet(
        pool,
        'SELECT id, schaden_id, file_path, created_at FROM schaden_fotos WHERE id = ? LIMIT 1',
        [fotoId],
      );
    },
    async insertSchadenFoto({ id, schadenId, filePath }) {
      await qRun(pool, 'INSERT INTO schaden_fotos (id, schaden_id, file_path) VALUES (?, ?, ?)', [
        id,
        schadenId,
        filePath,
      ]);
    },
    async updateSchaden(schadenId, patch) {
      const row = await qGet(
        pool,
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
      // extra_json: merge bestehende Daten mit Patch
      let nextExtraJson = row.extra_json != null ? row.extra_json : null;
      if (patch.extra !== undefined && patch.extra !== null && typeof patch.extra === 'object') {
        let existing = {};
        try { existing = nextExtraJson ? JSON.parse(String(nextExtraJson)) : {}; } catch { existing = {}; }
        const merged = Object.assign({}, existing, patch.extra);
        nextExtraJson = JSON.stringify(merged);
      }
      await qRun(
        pool,
        'UPDATE schaeden SET titel = ?, beschreibung = ?, status = ?, extra_json = ? WHERE id = ?',
        [nextTitel, nextBeschreibung, nextStatus, nextExtraJson, schadenId],
      );
      return qGet(
        pool,
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
    async deleteSchadenByProject(schadenId, projectId) {
      const sid = typeof schadenId === 'string' ? schadenId.trim() : '';
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!sid || !pid) return false;
      const row = await qGet(pool, 'SELECT id, project_id FROM schaeden WHERE id = ? LIMIT 1', [sid]);
      if (!row || String(row.project_id) !== pid) return false;
      const [result] = await pool.execute('DELETE FROM schaeden WHERE id = ? AND project_id = ?', [sid, pid]);
      return Boolean(result && typeof result.affectedRows === 'number' && result.affectedRows > 0);
    },
    async updateAuftrag(auftragId, patch) {
      const row = await qGet(
        pool,
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
      await qRun(pool, 'UPDATE auftraege SET title = ?, status = ?, termin = ?, termin_ende = ? WHERE id = ?', [
        nextTitle,
        nextStatus,
        nextTermin,
        nextTerminEnde,
        auftragId,
      ]);
      return qGet(
        pool,
        `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                COALESCE(fusaf.name, k.name) AS kunde_name,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', fusaf.ansprechpartner_vorname, fusaf.ansprechpartner_nachname)), ''), k.ansprechpartner) AS kunde_ansprechpartner
         FROM auftraege a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
         WHERE a.id = ? LIMIT 1`,
        [auftragId],
      );
    },
    async updateAuftragPatchWithBelegung(auftragId, patch) {
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      if (!aid) return null;
      const row = await qGet(
        pool,
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

      const tripleBefore = belegungTripleKeyMysql(row.termin, row.termin_ende, row.fusa_fahrzeug_ids);
      const tripleAfter = belegungTripleKeyMysql(nextTermin, nextTerminEnde, nextFz);
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
        const overlapRowsPatch = await this.listFusaBelegungenOverlappendMitAuftragExtra(
          pid,
          z.startdatum,
          z.enddatum,
          aid,
        );
        const kennPatch = await this.getFahrzeugKennungenByIds(fahrzeugIds);
        const fzRowsPatch = await this.getFahrzeugeByIds(fahrzeugIds);
        const fzByIdPatch = Object.fromEntries(fzRowsPatch.map((r) => [String(r.id), r]));
        const schaedenProjPatch = await this.listSchaedenForProject(pid);
        const fcPatch = pruefeFusaBuchungVorBelegung({
          projectId: pid,
          overlapRows: overlapRowsPatch,
          fahrzeugIds,
          fusaExtraJsonStr: nextExtra,
          excludeAuftragId: aid,
          kennungenById: kennPatch,
          fahrzeugRowsById: fzByIdPatch,
          schaedenRowsAll: schaedenProjPatch,
          startdatum: z.startdatum,
          enddatum: z.enddatum,
        });
        if (!fcPatch.ok) {
          return {
            error: fcPatch.code || 'BELEGUNG_KONFLIKT',
            message: fcPatch.message,
            konflikt: fcPatch.konflikt,
          };
        }
      }

      const fzCell = fahrzeugIds.length > 0 ? JSON.stringify(fahrzeugIds) : null;

      const selectFull = async () =>
        qGet(
          pool,
          `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                  a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                  COALESCE(fusaf.name, k.name) AS kunde_name,
                  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', fusaf.ansprechpartner_vorname, fusaf.ansprechpartner_nachname)), ''), k.ansprechpartner) AS kunde_ansprechpartner
           FROM auftraege a
           LEFT JOIN projects p ON p.id = a.project_id
           LEFT JOIN kunden k ON k.id = p.kunden_id
           LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
           WHERE a.id = ? LIMIT 1`,
          [aid],
        );

      if (!needsBelegungSync) {
        await qRun(pool, 'UPDATE auftraege SET title = ?, status = ?, termin = ?, termin_ende = ?, fusa_kunde_id = ?, fusa_fahrzeug_ids = ?, fusa_extra_json = ? WHERE id = ?', [
          nextTitle,
          nextStatus,
          nextTermin,
          nextTerminEnde,
          nextKunde,
          fzCell,
          nextExtra,
          aid,
        ]);
        return selectFull();
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute('UPDATE auftraege SET title = ?, status = ?, termin = ?, termin_ende = ?, fusa_kunde_id = ?, fusa_fahrzeug_ids = ?, fusa_extra_json = ? WHERE id = ?', [
          nextTitle,
          nextStatus,
          nextTermin,
          nextTerminEnde,
          nextKunde,
          fzCell,
          nextExtra,
          aid,
        ]);
        await conn.execute('DELETE FROM fusa_belegungen WHERE auftrag_id = ?', [aid]);
        if (fahrzeugIds.length > 0 && zBand.ok) {
          for (const vid of fahrzeugIds) {
            const bid = randomUUID();
            await conn.execute(
              `INSERT INTO fusa_belegungen (id, project_id, auftrag_id, fahrzeug_id, startdatum, enddatum, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'aktiv', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
              [bid, pid, aid, vid, zBand.startdatum, zBand.enddatum],
            );
          }
        }
        await conn.commit();
      } catch {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        return { error: 'DATABASE_ERROR', message: 'Auftrag/Belegung konnte nicht aktualisiert werden.' };
      } finally {
        conn.release();
      }
      return selectFull();
    },
    async getProjectAccessByUserAndProject(userId, projectId) {
      return qGet(
        pool,
        `SELECT id, user_id, project_id, role, can_view_prices, can_edit, can_create_auftraege, created_at
         FROM project_access WHERE user_id = ? AND project_id = ? LIMIT 1`,
        [userId, projectId],
      );
    },
    async countProjectAccessForProject(projectId) {
      const row = await qGet(pool, 'SELECT COUNT(*) AS n FROM project_access WHERE project_id = ?', [
        projectId,
      ]);
      return row && row.n != null ? Number(row.n) : 0;
    },
    async listProjectAccessWithUsers(projectId) {
      return qAll(
        pool,
        `SELECT pa.id, pa.user_id, pa.project_id, pa.role, pa.can_view_prices, pa.can_edit, pa.can_create_auftraege, pa.created_at,
                u.email AS user_email, u.name AS user_name
         FROM project_access pa
         JOIN users u ON u.id = pa.user_id
         WHERE pa.project_id = ?
         ORDER BY pa.created_at ASC`,
        [projectId],
      );
    },
    async getProjectAccessByIdAndProject(accessId, projectId) {
      return qGet(
        pool,
        `SELECT id, user_id, project_id, role, can_view_prices, can_edit, can_create_auftraege, created_at
         FROM project_access WHERE id = ? AND project_id = ? LIMIT 1`,
        [accessId, projectId],
      );
    },
    async insertProjectAccess({
      id,
      userId,
      projectId,
      role,
      canViewPrices,
      canEdit,
      canCreateAuftraege,
    }) {
      await qRun(
        pool,
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
    },
    async updateProjectAccess(accessId, projectId, patch) {
      const row = await qGet(
        pool,
        `SELECT id, user_id, project_id, role, can_view_prices, can_edit, can_create_auftraege, created_at
         FROM project_access WHERE id = ? AND project_id = ? LIMIT 1`,
        [accessId, projectId],
      );
      if (!row) return null;
      const role = patch.role != null ? String(patch.role) : String(row.role);
      const cv =
        patch.can_view_prices !== undefined
          ? patch.can_view_prices
            ? 1
            : 0
          : Number(row.can_view_prices);
      const ce =
        patch.can_edit !== undefined ? (patch.can_edit ? 1 : 0) : Number(row.can_edit);
      const cc =
        patch.can_create_auftraege !== undefined ? (patch.can_create_auftraege ? 1 : 0) : Number(row.can_create_auftraege);
      await qRun(
        pool,
        `UPDATE project_access SET role = ?, can_view_prices = ?, can_edit = ?, can_create_auftraege = ? WHERE id = ? AND project_id = ?`,
        [role, cv, ce, cc, accessId, projectId],
      );
      return qGet(
        pool,
        `SELECT id, user_id, project_id, role, can_view_prices, can_edit, can_create_auftraege, created_at
         FROM project_access WHERE id = ? AND project_id = ? LIMIT 1`,
        [accessId, projectId],
      );
    },
    async deleteProjectAccess(accessId, projectId) {
      await qRun(pool, 'DELETE FROM project_access WHERE id = ? AND project_id = ?', [accessId, projectId]);
    },
    async listFahrzeugeForProject(projectId) {
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!pid) return [];
      return qAll(
        pool,
        `SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at
         FROM fahrzeuge WHERE project_id = ? ORDER BY created_at DESC, kennung ASC`,
        [pid],
      );
    },
    async getFahrzeugeByIds(ids) {
      const list = Array.isArray(ids) ? ids.map((x) => String(x).trim()).filter(Boolean) : [];
      if (list.length === 0) return [];
      const ph = list.map(() => '?').join(',');
      return qAll(
        pool,
        `SELECT id, project_id, kennung, typ, kennzeichen, status, details_json, created_at FROM fahrzeuge WHERE id IN (${ph})`,
        list,
      );
    },
    async getFahrzeugKennungenByIds(ids) {
      const rows = await this.getFahrzeugeByIds(ids);
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
    async listFusaBelegungenOverlappendMitAuftragExtra(projectId, startdatum, enddatum, excludeAuftragId) {
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      const sd = typeof startdatum === 'string' ? startdatum.trim() : '';
      const ed = typeof enddatum === 'string' ? enddatum.trim() : '';
      const ex = excludeAuftragId != null && String(excludeAuftragId).trim() !== '' ? String(excludeAuftragId).trim() : '';
      if (!pid || !sd || !ed) return [];
      return qAll(
        pool,
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
    async listFusaApiAuftraege() {
      const rows = await qAll(
        pool,
        `SELECT a.id, a.title, a.project_id, a.status, a.termin, a.termin_ende, a.created_at,
                a.fusa_original_id, a.fusa_kunde_id, a.fusa_fahrzeug_ids, a.fusa_extra_json,
                COALESCE(fusaf.name, k.name) AS kunde_name,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', fusaf.ansprechpartner_vorname, fusaf.ansprechpartner_nachname)), ''), k.ansprechpartner) AS kunde_ansprechpartner
         FROM auftraege a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN kunden k ON k.id = p.kunden_id
         LEFT JOIN firmen fusaf ON fusaf.id = a.fusa_kunde_id
         WHERE a.project_id IS NOT NULL
           AND (a.fusa_original_id IS NOT NULL AND TRIM(a.fusa_original_id) <> ''
                OR a.fusa_kunde_id IS NOT NULL
                OR (a.fusa_fahrzeug_ids IS NOT NULL AND TRIM(a.fusa_fahrzeug_ids) NOT IN ('','[]'))
                OR (a.fusa_extra_json IS NOT NULL AND TRIM(a.fusa_extra_json) NOT IN ('','{}')))
         ORDER BY a.created_at DESC`,
        [],
      );
      const ids = collectAllFahrzeugIdsFromAuftragRows(rows);
      /** @type {Map<string, string>} */
      const kennungById = new Map();
      if (ids.length > 0) {
        const ph = ids.map(() => '?').join(',');
        const fzRows = await qAll(pool, `SELECT id, kennung, kennzeichen FROM fahrzeuge WHERE id IN (${ph})`, ids);
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
    async listFusaApiFahrzeuge() {
      return qAll(
        pool,
        `SELECT f.id, f.project_id, f.kennung, f.typ, f.kennzeichen, f.status, f.details_json, f.created_at,
                p.name AS project_name
         FROM fahrzeuge f
         LEFT JOIN projects p ON p.id = f.project_id
         ORDER BY f.created_at DESC, f.kennung ASC`,
        [],
      );
    },
    async listFusaApiRechnungen() {
      return qAll(
        pool,
        `SELECT r.id, r.original_id, r.auftrag_id, r.kunde_id, r.von, r.bis, r.netto, r.mwst, r.brutto,
                r.faellig_am, r.status, r.quartal, r.notiz, r.created_at,
                r.extra_json, r.bezahlt_am, r.rechnungsdatum
         FROM fusa_rechnungen r
         ORDER BY r.created_at DESC`,
        [],
      );
    },
    /**
     * MySQL: liest aus Tabelle `fusa_termine` (Anlage in `ensureMysqlFusaApiSupport`).
     * Gegenstück SQLite (`database.js`): **keine** Tabelle `fusa_termine` → dort bewusst `[]` aus dem `catch` von `listFusaApiTermine`.
     * Aktive Terminquelle im Cockpit: **`kalender_termine`** — `fusa_termine` nicht als SQLite-Parität voraussetzen.
     */
    async listFusaApiTermine() {
      return qAll(
        pool,
        `SELECT t.id, t.original_id, t.projekt_id, t.auftrag_id, t.fahrzeug_id, t.typ, t.titel, t.start, t.ende, t.status, t.mitarbeiter_ids, t.notiz, t.created_at
         FROM fusa_termine t
         ORDER BY t.created_at DESC`,
        [],
      );
    },
    /**
     * Vergibt eine neue System-Kundennummer (K-JJJJ-NNNNN), wenn die Zeile noch keine hat.
     * `altnummer` bleibt unberührt. Bei Kollision (Parallelität) erneuter Versuch.
     * @param {string} firmaId
     * @returns {Promise<string|null>}
     */
    async assignSystemKundennummerIfMissing(firmaId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return null;
      const cur = await this.getFirmaById(fid);
      if (!cur) return null;
      const existing = cur.kundennummer != null ? String(cur.kundennummer).trim() : '';
      if (existing !== '') return existing;
      const year = new Date().getFullYear();
      for (let attempt = 0; attempt < 64; attempt += 1) {
        const rows = await qAll(pool, 'SELECT kundennummer FROM firmen WHERE kundennummer LIKE ?', [
          `K-${year}-%`,
        ]);
        const candidate = computeNextSystemKundennummer(
          year,
          rows.map(r => r && r.kundennummer),
        );
        try {
          const [res] = await pool.execute(
            `UPDATE firmen SET kundennummer = ? WHERE id = ? AND (kundennummer IS NULL OR TRIM(kundennummer) = '')`,
            mysqlBindParams([candidate, fid]),
          );
          const hdr = /** @type {import('mysql2').ResultSetHeader} */ (res);
          if (hdr.affectedRows >= 1) {
            const again = await this.getFirmaById(fid);
            return again?.kundennummer != null ? String(again.kundennummer).trim() : candidate;
          }
          const again2 = await this.getFirmaById(fid);
          const got = again2?.kundennummer != null ? String(again2.kundennummer).trim() : '';
          if (got !== '') return got;
        } catch (e) {
          if (isUniqueConstraintError(e)) continue;
          throw e;
        }
      }
      throw new Error('assignSystemKundennummerIfMissing: keine freie Nummer zugeteilt');
    },
    async listFirmen() {
      return qAll(
        pool,
        `SELECT f.id, f.name, f.kundennummer, f.altnummer, f.typ, f.intern_extern, f.umsatzsteuer_id,
                f.strasse, f.plz, f.stadt, f.land, f.telefon, f.email, f.website,
                f.ansprechpartner_anrede, f.ansprechpartner_vorname, f.ansprechpartner_nachname,
                f.ansprechpartner_email, f.ansprechpartner_telefon, f.interne_notiz, f.status, f.erweiterung_json, f.created_at
         FROM firmen f ORDER BY f.name ASC`,
        [],
      );
    },
    async getFirmaById(id) {
      const fid = typeof id === 'string' ? id.trim() : '';
      if (!fid) return null;
      return qGet(
        pool,
        `SELECT f.id, f.name, f.kundennummer, f.altnummer, f.typ, f.intern_extern, f.umsatzsteuer_id,
                f.strasse, f.plz, f.stadt, f.land, f.telefon, f.email, f.website,
                f.ansprechpartner_anrede, f.ansprechpartner_vorname, f.ansprechpartner_nachname,
                f.ansprechpartner_email, f.ansprechpartner_telefon, f.interne_notiz, f.status, f.erweiterung_json, f.created_at
         FROM firmen f WHERE f.id = ? LIMIT 1`,
        [fid],
      );
    },
    async getFirmaKundeStammById(id) {
      const fid = typeof id === 'string' ? id.trim() : '';
      if (!fid) return null;
      return qGet(
        pool,
        `SELECT f.*, x.segment AS fusa_segment, x.hinweis AS fusa_hinweis, x.updated_at AS fusa_extra_updated_at,
                c.crm_status AS ccintern_crm_status, c.betreuer AS ccintern_betreuer, c.updated_at AS ccintern_extra_updated_at
         FROM firmen f
         LEFT JOIN fusa_kunden_extra x ON x.firma_id = f.id
         LEFT JOIN ccintern_kunden_extra c ON c.firma_id = f.id
         WHERE f.id = ? LIMIT 1`,
        [fid],
      );
    },
    async insertFirma(p) {
      const id = p.id != null ? String(p.id).trim() : '';
      if (!id) throw new Error('insertFirma: id fehlt');
      await qRun(
        pool,
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
      return this.getFirmaById(id);
    },
    async updateFirmaById(firmaId, patch) {
      const row = await this.getFirmaById(firmaId);
      if (!row) return null;
      const next = { ...row, ...patch };
      await qRun(
        pool,
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
          firmaId,
        ],
      );
      return this.getFirmaById(firmaId);
    },
    async upsertFusaKundenExtra(firmaId, { segment, hinweis }) {
      const fid = String(firmaId || '').trim();
      if (!fid) return false;
      await qRun(
        pool,
        `INSERT INTO fusa_kunden_extra (firma_id, hinweis, segment, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE hinweis = VALUES(hinweis), segment = VALUES(segment), updated_at = CURRENT_TIMESTAMP(3)`,
        [fid, hinweis != null ? String(hinweis) : null, segment != null ? String(segment) : null],
      );
      return true;
    },
    async listFusaKundenExtraAll() {
      return qAll(pool, 'SELECT firma_id, hinweis, segment, updated_at FROM fusa_kunden_extra', []);
    },
    async upsertCcInternKundenExtra(firmaId, { crm_status, betreuer }) {
      const fid = String(firmaId || '').trim();
      if (!fid) return false;
      await qRun(
        pool,
        `INSERT INTO ccintern_kunden_extra (firma_id, crm_status, betreuer, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE crm_status = VALUES(crm_status), betreuer = VALUES(betreuer), updated_at = CURRENT_TIMESTAMP(3)`,
        [fid, crm_status != null ? String(crm_status) : null, betreuer != null ? String(betreuer) : null],
      );
      return true;
    },
    async listCcInternKundenExtraAll() {
      return qAll(pool, 'SELECT firma_id, crm_status, betreuer, updated_at AS ccintern_updated_at FROM ccintern_kunden_extra', []);
    },
    async listCockpitInvites() {
      return qAll(
        pool,
        `SELECT i.*, f.name AS firma_name, f.kundennummer AS firma_kundennummer
         FROM cockpit_invites i
         LEFT JOIN firmen f ON f.id = i.firma_id
         ORDER BY i.created_at DESC`,
        [],
      );
    },
    async getPendingCockpitInviteByEmail(email) {
      const em = String(email || '').trim().toLowerCase();
      if (!em) return null;
      return qGet(
        pool,
        `SELECT * FROM cockpit_invites WHERE LOWER(email) = ? AND status = 'offen' ORDER BY expires_at DESC LIMIT 1`,
        [em],
      );
    },
    async insertCockpitInvite({
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
      await qRun(
        pool,
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
    },
    async revokeCockpitInvite(inviteId) {
      const [r] = await pool.execute(`UPDATE cockpit_invites SET status = 'widerrufen' WHERE id = ? AND status = 'offen'`, [
        inviteId,
      ]);
      return (/** @type {any} */ (r).affectedRows ?? 0) > 0;
    },
    async getCockpitInviteByToken(token) {
      const t = String(token || '').trim();
      if (!t) return null;
      return qGet(pool, 'SELECT * FROM cockpit_invites WHERE token = ? LIMIT 1', [t]);
    },
    async redeemCockpitInviteAtomic(token, passwordHash) {
      const t = String(token || '').trim();
      if (!t) return { ok: false, code: 'INVITE_NOT_FOUND' };
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [invRows] = await conn.execute('SELECT * FROM cockpit_invites WHERE token = ? LIMIT 1 FOR UPDATE', [t]);
        const inv = /** @type {any} */ (invRows)[0] ?? null;
        if (!inv) {
          await conn.rollback();
          return { ok: false, code: 'INVITE_NOT_FOUND' };
        }
        if (String(inv.status) !== 'offen') {
          await conn.rollback();
          return { ok: false, code: 'INVITE_INVALID_STATE' };
        }
        const exp = new Date(String(inv.expires_at)).getTime();
        if (Number.isNaN(exp) || exp < Date.now()) {
          await conn.execute(`UPDATE cockpit_invites SET status = 'abgelaufen' WHERE id = ?`, [inv.id]);
          await conn.commit();
          return { ok: false, code: 'INVITE_EXPIRED' };
        }
        const email = String(inv.email || '').trim().toLowerCase();
        const fidRaw = inv.firma_id != null ? String(inv.firma_id).trim() : '';
        const companyIdForUser = fidRaw !== '' ? fidRaw : null;
        const [uRows] = await conn.execute('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);
        let user = /** @type {any} */ (uRows)[0] ?? null;
        if (!user) {
          const uid = randomUUID();
          const nm = email.split('@')[0] || 'Benutzer';
          await conn.execute(
            'INSERT INTO users (id, email, password_hash, name, global_role, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uid, email, passwordHash, nm, String(inv.global_role || 'INTERN'), 'aktiv', companyIdForUser],
          );
          user = { id: uid };
        } else if (companyIdForUser) {
          await conn.execute('UPDATE users SET password_hash = ?, company_id = ? WHERE id = ?', [
            passwordHash,
            companyIdForUser,
            user.id,
          ]);
        } else {
          await conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
        }
        const uid = String(user.id);
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
        await conn.execute('UPDATE users SET global_role = ? WHERE id = ?', [gr, uid]);
        await conn.execute('DELETE FROM user_modules WHERE user_id = ?', [uid]);
        await conn.execute('DELETE FROM user_rights WHERE user_id = ?', [uid]);
        for (const m of mods) {
          if (typeof m === 'string' && m.trim()) {
            await conn.execute('INSERT INTO user_modules (user_id, module) VALUES (?, ?)', [uid, m.trim()]);
          }
        }
        if (rights && typeof rights === 'object') {
          for (const mod of Object.keys(rights)) {
            const bereiche = /** @type {Record<string, unknown>} */ (rights)[mod];
            if (!bereiche || typeof bereiche !== 'object') continue;
            for (const b of Object.keys(bereiche)) {
              const flags = normalizeRightsJson(/** @type {Record<string, unknown>} */ (bereiche)[b]);
              await conn.execute(
                'INSERT INTO user_rights (user_id, module, bereich, rechte_json) VALUES (?, ?, ?, ?)',
                [uid, mod, b, JSON.stringify(flags)],
              );
            }
          }
        }
        await conn.execute(`UPDATE cockpit_invites SET status = 'eingeloest', redeemed_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [
          inv.id,
        ]);
        await conn.commit();
        return { ok: true, user: await this.getUserById(uid) };
      } catch {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        return { ok: false, code: 'DATABASE_ERROR' };
      } finally {
        conn.release();
      }
    },
    async listProjectInvites(projectId) {
      const pid = String(projectId || '').trim();
      if (!pid) return [];
      return qAll(
        pool,
        'SELECT * FROM project_invites WHERE project_id = ? ORDER BY created_at DESC',
        [pid],
      );
    },
    async insertProjectInvite({
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
      await qRun(
        pool,
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
    },
    async getProjectInviteByToken(token) {
      const t = String(token || '').trim();
      if (!t) return null;
      return qGet(pool, 'SELECT * FROM project_invites WHERE token = ? LIMIT 1', [t]);
    },
    async getProjectInviteByIdAndProject(inviteId, projectId) {
      return qGet(pool, 'SELECT * FROM project_invites WHERE id = ? AND project_id = ? LIMIT 1', [inviteId, projectId]);
    },
    async getPendingProjectInviteByProjectAndEmail(projectId, email) {
      return qGet(
        pool,
        `SELECT * FROM project_invites WHERE project_id = ? AND LOWER(email) = ? AND status = 'pending' LIMIT 1`,
        [projectId, String(email || '').trim().toLowerCase()],
      );
    },
    async updateProjectInviteStatus(inviteId, projectId, status) {
      await qRun(pool, 'UPDATE project_invites SET status = ? WHERE id = ? AND project_id = ?', [
        status,
        inviteId,
        projectId,
      ]);
    },
    async updateProjectInviteExpiry(inviteId, projectId, expiresAtIso) {
      await qRun(pool, 'UPDATE project_invites SET expires_at = ? WHERE id = ? AND project_id = ?', [
        expiresAtIso,
        inviteId,
        projectId,
      ]);
    },
    async deleteProjectInviteIfPending(inviteId, projectId) {
      const [r] = await pool.execute(`DELETE FROM project_invites WHERE id = ? AND project_id = ? AND status = 'pending'`, [
        inviteId,
        projectId,
      ]);
      return (/** @type {any} */ (r).affectedRows ?? 0) > 0;
    },
    async insertFusaRechnungRow(row) {
      const id = row.id != null ? String(row.id).trim() : randomUUID();
      await qRun(
        pool,
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
      return qGet(pool, 'SELECT * FROM fusa_rechnungen WHERE id = ? LIMIT 1', [id]);
    },
    async updateFusaRechnungById(rechnungId, patch) {
      const rid = String(rechnungId || '').trim();
      if (!rid) return null;
      const cur = await qGet(pool, 'SELECT * FROM fusa_rechnungen WHERE id = ? LIMIT 1', [rid]);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
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
      return qGet(pool, 'SELECT * FROM fusa_rechnungen WHERE id = ? LIMIT 1', [rid]);
    },
    async getFusaRechnungById(rechnungId) {
      const rid = String(rechnungId || '').trim();
      if (!rid) return null;
      return qGet(pool, 'SELECT * FROM fusa_rechnungen WHERE id = ? LIMIT 1', [rid]);
    },
    async listCcInternAuftraegeByFirma(firmaId, { offset = 0, limit = 50 } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      return qAll(
        pool,
        `SELECT id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum, bemerkung,
                fusa_auftrag_id, quelle, erstellt_am, aktualisiert_am, erstellt_von, firma_id
         FROM ccintern_auftraege
         WHERE firma_id = ?
         ORDER BY erstellt_am DESC
         LIMIT ? OFFSET ?`,
        [fid, Number(limit) || 50, Number(offset) || 0],
      );
    },
    async countCcInternAuftraegeByFirma(firmaId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      const row = await qGet(pool, 'SELECT COUNT(*) AS c FROM ccintern_auftraege WHERE firma_id = ? LIMIT 1', [fid]);
      return Number(row?.c || 0);
    },
    async getCcInternAuftragById(id, firmaId) {
      const aid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!aid || !fid) return null;
      return qGet(
        pool,
        `SELECT id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum, bemerkung,
                fusa_auftrag_id, quelle, erstellt_am, aktualisiert_am, erstellt_von, firma_id
         FROM ccintern_auftraege
         WHERE id = ? AND firma_id = ? LIMIT 1`,
        [aid, fid],
      );
    },
    async getCcInternAuftragByFusaAuftragId(fusaAuftragId, firmaId) {
      const fusaId = typeof fusaAuftragId === 'string' ? fusaAuftragId.trim() : '';
      if (!fusaId) return null;
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (fid) {
        return qGet(
          pool,
          `SELECT id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum, bemerkung,
                  fusa_auftrag_id, quelle, erstellt_am, aktualisiert_am, erstellt_von, firma_id
           FROM ccintern_auftraege
           WHERE fusa_auftrag_id = ? AND firma_id = ?
           ORDER BY erstellt_am DESC
           LIMIT 1`,
          [fusaId, fid],
        );
      }
      return qGet(
        pool,
        `SELECT id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum, bemerkung,
                fusa_auftrag_id, quelle, erstellt_am, aktualisiert_am, erstellt_von, firma_id
         FROM ccintern_auftraege
         WHERE fusa_auftrag_id = ?
         ORDER BY erstellt_am DESC
         LIMIT 1`,
        [fusaId],
      );
    },
    async getLastCcInternAuftragsnummerForYear(year) {
      const yy = Number(year);
      if (!Number.isInteger(yy)) return null;
      return qGet(
        pool,
        `SELECT auftragsnummer
         FROM ccintern_auftraege
         WHERE auftragsnummer LIKE ?
         ORDER BY auftragsnummer DESC
         LIMIT 1`,
        [`AU-${yy}-%`],
      );
    },
    async insertCcInternAuftrag(row) {
      await qRun(
        pool,
        `INSERT INTO ccintern_auftraege
          (id, auftragsnummer, kunde, status, schritt, prioritaet, lieferdatum, montage_datum, bemerkung, fusa_auftrag_id, quelle, erstellt_von, firma_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    },
    async updateCcInternAuftrag(id, firmaId, patch) {
      const cur = await this.getCcInternAuftragById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE ccintern_auftraege
         SET kunde = ?, status = ?, schritt = ?, prioritaet = ?, lieferdatum = ?, montage_datum = ?, bemerkung = ?,
             fusa_auftrag_id = ?, quelle = ?, aktualisiert_am = CURRENT_TIMESTAMP(3)
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
      return this.getCcInternAuftragById(id, firmaId);
    },
    async deleteCcInternAuftrag(id, firmaId) {
      const cur = await this.getCcInternAuftragById(id, firmaId);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM ccintern_auftraege WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      return true;
    },
    async insertCcInternAuftragKommentar(row) {
      await qRun(
        pool,
        `INSERT INTO ccintern_auftrag_kommentare (id, auftrag_id, text, autor_id)
         VALUES (?, ?, ?, ?)`,
        [row.id, row.auftrag_id, row.text, row.autor_id],
      );
      return qGet(
        pool,
        `SELECT id, auftrag_id, text, autor_id, erstellt_am
         FROM ccintern_auftrag_kommentare
         WHERE id = ? LIMIT 1`,
        [row.id],
      );
    },
    async listCcInternAuftragKommentare(auftragId, firmaId) {
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!aid || !fid) return [];
      return qAll(
        pool,
        `SELECT c.id, c.auftrag_id, c.text, c.autor_id, c.erstellt_am
         FROM ccintern_auftrag_kommentare c
         INNER JOIN ccintern_auftraege a ON a.id = c.auftrag_id
         WHERE c.auftrag_id = ? AND a.firma_id = ?
         ORDER BY c.erstellt_am ASC`,
        [aid, fid],
      );
    },
    async listCcInternAuftragDateien(auftragId, firmaId) {
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!aid || !fid) return [];
      return qAll(
        pool,
        `SELECT d.id, d.project_id, d.auftrag_id, d.kunde_id, d.typ, d.bereich, d.phase, d.position,
                d.filename, d.originalname, d.mimetype, d.size, d.server_path, d.public_url, d.uploaded_by, d.created_at, d.updated_at
         FROM ccintern_auftrag_dateien d
         INNER JOIN ccintern_auftraege a ON a.id = d.auftrag_id
         WHERE d.auftrag_id = ? AND a.firma_id = ?
         ORDER BY d.created_at ASC`,
        [aid, fid],
      );
    },
    async getCcInternAuftragDateiByIdForFirma(dateiId, firmaId) {
      const did = typeof dateiId === 'string' ? dateiId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!did || !fid) return null;
      return qGet(
        pool,
        `SELECT d.id, d.project_id, d.auftrag_id, d.kunde_id, d.typ, d.bereich, d.phase, d.position,
                d.filename, d.originalname, d.mimetype, d.size, d.server_path, d.public_url, d.uploaded_by, d.created_at, d.updated_at
         FROM ccintern_auftrag_dateien d
         INNER JOIN ccintern_auftraege a ON a.id = d.auftrag_id
         WHERE d.id = ? AND a.firma_id = ?
         LIMIT 1`,
        [did, fid],
      );
    },
    async findCcInternAuftragDateiBySlot(auftragId, firmaId, typ, phase, position) {
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const t = String(typ ?? '')
        .trim()
        .toLowerCase();
      if (!aid || !fid || !t) return null;
      const ph = phase == null || String(phase).trim() === '' ? '' : String(phase).trim();
      const po = position == null || String(position).trim() === '' ? '' : String(position).trim();
      return qGet(
        pool,
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
    async insertCcInternAuftragDatei(row) {
      await qRun(
        pool,
        `INSERT INTO ccintern_auftrag_dateien
          (id, project_id, auftrag_id, kunde_id, typ, bereich, phase, position, filename, originalname, mimetype, size, server_path, public_url, uploaded_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
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
      return qGet(pool, 'SELECT * FROM ccintern_auftrag_dateien WHERE id = ? LIMIT 1', [row.id]);
    },
    async updateCcInternAuftragDatei(dateiId, firmaId, patch) {
      const did = typeof dateiId === 'string' ? dateiId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!did || !fid) return null;
      const cur = await this.getCcInternAuftragDateiByIdForFirma(did, fid);
      if (!cur) return null;
      await qRun(
        pool,
        `UPDATE ccintern_auftrag_dateien d
         INNER JOIN ccintern_auftraege a ON a.id = d.auftrag_id
         SET d.filename = ?, d.originalname = ?, d.mimetype = ?, d.size = ?, d.server_path = ?, d.public_url = ?, d.uploaded_by = ?, d.updated_at = CURRENT_TIMESTAMP(3)
         WHERE d.id = ? AND a.firma_id = ?`,
        [
          patch.filename,
          patch.originalname,
          patch.mimetype,
          patch.size,
          patch.server_path,
          patch.public_url,
          patch.uploaded_by ?? null,
          did,
          fid,
        ],
      );
      return qGet(pool, 'SELECT * FROM ccintern_auftrag_dateien WHERE id = ? LIMIT 1', [did]);
    },
    async deleteCcInternAuftragDatei(dateiId, firmaId) {
      const did = typeof dateiId === 'string' ? dateiId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!did || !fid) return false;
      const row = await this.getCcInternAuftragDateiByIdForFirma(did, fid);
      if (!row) return false;
      await qRun(pool, 'DELETE FROM ccintern_auftrag_dateien WHERE id = ?', [did]);
      return true;
    },
    async listKalenderTermineByFirma(firmaId, { offset = 0, limit = 50, typ = null, von = null, bis = null } = {}) {
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
        where += ' AND start >= ?';
        params.push(String(von).trim());
      }
      if (bis) {
        where += ' AND start <= ?';
        params.push(String(bis).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return qAll(
        pool,
        `SELECT id, titel, start, ende, ganztag, typ, quelle, mitarbeiter_ids, auftrag_id, fusa_auftrag_id, farbe, notiz, firma_id, erstellt_von, erstellt_am, aktualisiert_am
         FROM kalender_termine
         ${where}
         ORDER BY start ASC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    async countKalenderTermineByFirma(firmaId, { typ = null, von = null, bis = null } = {}) {
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
        where += ' AND start >= ?';
        params.push(String(von).trim());
      }
      if (bis) {
        where += ' AND start <= ?';
        params.push(String(bis).trim());
      }
      const row = await qGet(pool, `SELECT COUNT(*) AS c FROM kalender_termine ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    async getKalenderTerminById(id, firmaId) {
      const tid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!tid || !fid) return null;
      return qGet(
        pool,
        `SELECT id, titel, start, ende, ganztag, typ, quelle, mitarbeiter_ids, auftrag_id, fusa_auftrag_id, farbe, notiz, firma_id, erstellt_von, erstellt_am, aktualisiert_am
         FROM kalender_termine
         WHERE id = ? AND firma_id = ?
         LIMIT 1`,
        [tid, fid],
      );
    },
    async getKalenderTerminByQuelleAndAuftragId(firmaId, quelle, auftragId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const src = typeof quelle === 'string' ? quelle.trim() : '';
      const aid = typeof auftragId === 'string' ? auftragId.trim() : '';
      if (!fid || !src || !aid) return null;
      return qGet(
        pool,
        `SELECT id, titel, start, ende, ganztag, typ, quelle, mitarbeiter_ids, auftrag_id, fusa_auftrag_id, farbe, notiz, firma_id, erstellt_von, erstellt_am, aktualisiert_am
         FROM kalender_termine
         WHERE firma_id = ? AND quelle = ? AND auftrag_id = ?
         ORDER BY erstellt_am DESC
         LIMIT 1`,
        [fid, src, aid],
      );
    },
    async getKalenderTerminByQuelleAndFusaAuftragId(firmaId, quelle, fusaAuftragId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const src = typeof quelle === 'string' ? quelle.trim() : '';
      const faid = typeof fusaAuftragId === 'string' ? fusaAuftragId.trim() : '';
      if (!fid || !src || !faid) return null;
      return qGet(
        pool,
        `SELECT id, titel, start, ende, ganztag, typ, quelle, mitarbeiter_ids, auftrag_id, fusa_auftrag_id, farbe, notiz, firma_id, erstellt_von, erstellt_am, aktualisiert_am
         FROM kalender_termine
         WHERE firma_id = ? AND quelle = ? AND fusa_auftrag_id = ?
         ORDER BY erstellt_am DESC
         LIMIT 1`,
        [fid, src, faid],
      );
    },
    async insertKalenderTermin(row) {
      await qRun(
        pool,
        `INSERT INTO kalender_termine
          (id, titel, start, ende, ganztag, typ, quelle, mitarbeiter_ids, auftrag_id, fusa_auftrag_id, farbe, notiz, firma_id, erstellt_von)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getKalenderTerminById(row.id, row.firma_id);
    },
    async updateKalenderTermin(id, firmaId, patch) {
      const cur = await this.getKalenderTerminById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE kalender_termine
         SET titel = ?, start = ?, ende = ?, ganztag = ?, typ = ?, quelle = ?, mitarbeiter_ids = ?, auftrag_id = ?, fusa_auftrag_id = ?, farbe = ?, notiz = ?,
             aktualisiert_am = CURRENT_TIMESTAMP(3)
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
      return this.getKalenderTerminById(id, firmaId);
    },
    async deleteKalenderTermin(id, firmaId) {
      const cur = await this.getKalenderTerminById(id, firmaId);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM kalender_termine WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      return true;
    },
    async listUrlaubByFirma(firmaId, { offset = 0, limit = 50, status = null, typ = null, von = null, bis = null } = {}) {
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
        where += ' AND u.von >= ?';
        params.push(String(von).trim());
      }
      if (bis) {
        where += ' AND u.bis <= ?';
        params.push(String(bis).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return qAll(
        pool,
        `SELECT u.id, u.mitarbeiter_id, u.von, u.bis, u.tage, u.typ, u.status, u.bemerkung, u.entschieden_von, u.entschieden_am,
                u.kalender_termin_id, u.kalender_termin_ids, u.firma_id, u.erstellt_am, u.aktualisiert_am,
                m.name AS mitarbeiter_name
         FROM urlaub_antraege u
         LEFT JOIN users m ON m.id = u.mitarbeiter_id
         ${where}
         ORDER BY u.erstellt_am DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    async countUrlaubByFirma(firmaId, { status = null, typ = null, von = null, bis = null } = {}) {
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
        where += ' AND von >= ?';
        params.push(String(von).trim());
      }
      if (bis) {
        where += ' AND bis <= ?';
        params.push(String(bis).trim());
      }
      const row = await qGet(pool, `SELECT COUNT(*) AS c FROM urlaub_antraege ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    async getUrlaubById(id, firmaId) {
      const uid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!uid || !fid) return null;
      return qGet(
        pool,
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
    async insertUrlaubAntrag(row) {
      await qRun(
        pool,
        `INSERT INTO urlaub_antraege
          (id, mitarbeiter_id, von, bis, tage, typ, status, bemerkung, entschieden_von, entschieden_am, kalender_termin_id, kalender_termin_ids, firma_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getUrlaubById(row.id, row.firma_id);
    },
    async updateUrlaubAntrag(id, firmaId, patch) {
      const cur = await this.getUrlaubById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE urlaub_antraege
         SET mitarbeiter_id = ?, von = ?, bis = ?, tage = ?, typ = ?, status = ?, bemerkung = ?, entschieden_von = ?, entschieden_am = ?, kalender_termin_id = ?, kalender_termin_ids = ?,
             aktualisiert_am = CURRENT_TIMESTAMP(3)
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
      return this.getUrlaubById(id, firmaId);
    },
    async deleteUrlaubAntrag(id, firmaId) {
      const cur = await this.getUrlaubById(id, firmaId);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM urlaub_antraege WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      return true;
    },
    async upsertCcInternMitarbeiterTagStatus(row) {
      const fid = String(row.firma_id || '').trim();
      const uid = String(row.user_id || '').trim();
      const dat = String(row.datum || '').trim();
      const status = String(row.status || '').trim();
      if (!fid || !uid || !dat || !status) return null;
      const projectId = row.project_id != null ? String(row.project_id).trim() || null : null;
      const existing = await qGet(
        pool,
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
        await qRun(
          pool,
          `UPDATE ccintern_mitarbeiter_status
           SET status = ?, project_id = ?, updated_at = CURRENT_TIMESTAMP(3)
           WHERE id = ? AND firma_id = ?`,
          [status, projectId, String(existing.id), fid],
        );
      } else {
        await qRun(
          pool,
          `INSERT INTO ccintern_mitarbeiter_status (id, project_id, user_id, firma_id, status, datum)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, projectId, uid, fid, status, dat],
        );
      }
      return qGet(
        pool,
        `SELECT s.id, s.project_id, s.user_id, s.firma_id, s.status, s.datum, s.created_at, s.updated_at,
                u.name AS mitarbeiter_name
         FROM ccintern_mitarbeiter_status s
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.firma_id = ? AND s.user_id = ? AND s.datum = ?
         LIMIT 1`,
        [fid, uid, dat],
      );
    },
    async listCcInternMitarbeiterStatusByFirma(firmaId, { user_id = null, datum_von = null, datum_bis = null } = {}) {
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
      return qAll(
        pool,
        `SELECT s.id, s.project_id, s.user_id, s.firma_id, s.status, s.datum, s.created_at, s.updated_at,
                u.name AS mitarbeiter_name
         FROM ccintern_mitarbeiter_status s
         LEFT JOIN users u ON u.id = s.user_id
         ${where}
         ORDER BY s.datum DESC, s.updated_at DESC`,
        params,
      );
    },
    async insertCcInternMitarbeiterAnwesenheit(row) {
      const dm =
        row.dauer_minuten != null
          ? Number(row.dauer_minuten)
          : row.dauer_minutes != null
            ? Number(row.dauer_minutes)
            : null;
      await qRun(
        pool,
        `INSERT INTO ccintern_mitarbeiter_anwesenheit
          (id, project_id, user_id, firma_id, datum, start, ende, pause_minuten, dauer_minuten, typ, notiz)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.project_id ?? null,
          row.user_id,
          row.firma_id,
          row.datum,
          row.start ?? null,
          row.ende ?? null,
          Number(row.pause_minuten ?? 0) || 0,
          dm,
          String(row.typ || 'anwesenheit').trim(),
          row.notiz ?? null,
        ],
      );
      return this.getCcInternMitarbeiterAnwesenheitById(row.id, row.firma_id);
    },
    async getCcInternMitarbeiterAnwesenheitById(id, firmaId) {
      const iid = String(id || '').trim();
      const fid = String(firmaId || '').trim();
      if (!iid || !fid) return null;
      return qGet(
        pool,
        `SELECT a.id, a.project_id, a.user_id, a.firma_id, a.datum, a.start, a.ende, a.pause_minuten, a.dauer_minuten, a.typ, a.notiz, a.created_at,
                u.name AS mitarbeiter_name
         FROM ccintern_mitarbeiter_anwesenheit a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.id = ? AND a.firma_id = ?
         LIMIT 1`,
        [iid, fid],
      );
    },
    async listCcInternMitarbeiterAnwesenheitByFirma(firmaId, { user_id = null, datum_von = null, datum_bis = null, limit = 2000 } = {}) {
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
      return qAll(
        pool,
        `SELECT a.id, a.project_id, a.user_id, a.firma_id, a.datum, a.start, a.ende, a.pause_minuten, a.dauer_minuten, a.typ, a.notiz, a.created_at,
                u.name AS mitarbeiter_name
         FROM ccintern_mitarbeiter_anwesenheit a
         LEFT JOIN users u ON u.id = a.user_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT ?`,
        params,
      );
    },
    async listLagerMaterialByFirma(firmaId, { offset = 0, limit = 50, kategorie = null } = {}) {
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
      return qAll(
        pool,
        `SELECT id, name, kategorie, menge, einheit, mindestbestand, artikelnummer, lagerort, firma_id, erstellt_am, aktualisiert_am
         FROM lager_material
         ${where}
         ORDER BY name ASC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    async countLagerMaterialByFirma(firmaId, { kategorie = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      if (kategorie) {
        where += ' AND kategorie = ?';
        params.push(String(kategorie).trim());
      }
      const row = await qGet(pool, `SELECT COUNT(*) AS c FROM lager_material ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    async getLagerMaterialById(id, firmaId) {
      const mid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!mid || !fid) return null;
      return qGet(
        pool,
        `SELECT id, name, kategorie, menge, einheit, mindestbestand, artikelnummer, lagerort, firma_id, erstellt_am, aktualisiert_am
         FROM lager_material
         WHERE id = ? AND firma_id = ?
         LIMIT 1`,
        [mid, fid],
      );
    },
    async insertLagerMaterial(row) {
      await qRun(
        pool,
        `INSERT INTO lager_material
          (id, name, kategorie, menge, einheit, mindestbestand, artikelnummer, lagerort, firma_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getLagerMaterialById(row.id, row.firma_id);
    },
    async updateLagerMaterial(id, firmaId, patch) {
      const cur = await this.getLagerMaterialById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE lager_material
         SET name = ?, kategorie = ?, menge = ?, einheit = ?, mindestbestand = ?, artikelnummer = ?, lagerort = ?, aktualisiert_am = CURRENT_TIMESTAMP(3)
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
      return this.getLagerMaterialById(id, firmaId);
    },
    async deleteLagerMaterial(id, firmaId) {
      const cur = await this.getLagerMaterialById(id, firmaId);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM lager_material WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      return true;
    },
    /** Setzt `firma_id` aller Lagerzeilen (z. B. nach Seed mit falscher Firma). Nur Dev-Skripte. */
    async reassignAllLagerMaterialFirmaId(targetFirmaId) {
      const fid = typeof targetFirmaId === 'string' ? targetFirmaId.trim() : '';
      if (!fid) return { changed: 0 };
      const f = await this.getFirmaById(fid);
      if (!f) throw new Error('reassignAllLagerMaterialFirmaId: Ziel-Firma nicht gefunden.');
      const cntRow = await qGet(pool, 'SELECT COUNT(*) AS c FROM lager_material');
      const n = Number(cntRow?.c || 0);
      if (n === 0) return { changed: 0 };
      await qRun(pool, 'UPDATE lager_material SET firma_id = ?, aktualisiert_am = CURRENT_TIMESTAMP(3)', [fid]);
      return { changed: n };
    },
    async listLagerBuchungenByMaterial(materialId, firmaId, { offset = 0, limit = 50 } = {}) {
      const mid = typeof materialId === 'string' ? materialId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!mid || !fid) return [];
      return qAll(
        pool,
        `SELECT b.id, b.material_id, b.menge, b.typ, b.mitarbeiter_id, b.auftrag_id, b.bemerkung, b.erstellt_am
         FROM lager_buchungen b
         INNER JOIN lager_material m ON m.id = b.material_id
         WHERE b.material_id = ? AND m.firma_id = ?
         ORDER BY b.erstellt_am DESC
         LIMIT ? OFFSET ?`,
        [mid, fid, Number(limit) || 50, Number(offset) || 0],
      );
    },
    async countLagerBuchungenByMaterial(materialId, firmaId) {
      const mid = typeof materialId === 'string' ? materialId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!mid || !fid) return 0;
      const row = await qGet(
        pool,
        `SELECT COUNT(*) AS c
         FROM lager_buchungen b
         INNER JOIN lager_material m ON m.id = b.material_id
         WHERE b.material_id = ? AND m.firma_id = ?
         LIMIT 1`,
        [mid, fid],
      );
      return Number(row?.c || 0);
    },
    async insertLagerBuchungAndAdjust(materialId, firmaId, row) {
      const mat = await this.getLagerMaterialById(materialId, firmaId);
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

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(
          `INSERT INTO lager_buchungen (id, material_id, menge, typ, mitarbeiter_id, auftrag_id, bemerkung)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
        await conn.execute(
          `UPDATE lager_material
           SET menge = ?, aktualisiert_am = CURRENT_TIMESTAMP(3)
           WHERE id = ? AND firma_id = ?`,
          [nextMenge, materialId, firmaId],
        );
        await conn.commit();
      } catch (e) {
        try { await conn.rollback(); } catch {}
        conn.release();
        return { error: 'DATABASE_ERROR', detail: e instanceof Error ? e.message : String(e) };
      }
      conn.release();
      const material = await this.getLagerMaterialById(materialId, firmaId);
      const buchung = await qGet(
        pool,
        `SELECT id, material_id, menge, typ, mitarbeiter_id, auftrag_id, bemerkung, erstellt_am
         FROM lager_buchungen WHERE id = ? LIMIT 1`,
        [row.id],
      );
      return { material, buchung };
    },
    async listCcInternAnfragenByFirma(firmaId, { offset = 0, limit = 50, status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE a.firma_id = ? AND a.deleted_at IS NULL';
      if (status) {
        where += ' AND a.status = ?';
        params.push(String(status).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return qAll(
        pool,
        `SELECT a.id, a.anfragen_nr, a.kunde_id, a.betreff, a.beschreibung, a.status, a.zugewiesen_an, a.antwort_bis,
                a.firma_id, a.erstellt_von, a.erstellt_am, a.aktualisiert_am,
                f.name AS kunde_name, u.name AS zugewiesen_name
         FROM ccintern_anfragen a
         LEFT JOIN firmen f ON f.id = a.kunde_id
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         ${where}
         ORDER BY a.erstellt_am DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    async countCcInternAnfragenByFirma(firmaId, { status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ? AND deleted_at IS NULL';
      if (status) {
        where += ' AND status = ?';
        params.push(String(status).trim());
      }
      const row = await qGet(pool, `SELECT COUNT(*) AS c FROM ccintern_anfragen ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    async getCcInternAnfrageById(id, firmaId) {
      const aid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!aid || !fid) return null;
      return qGet(
        pool,
        `SELECT a.id, a.anfragen_nr, a.kunde_id, a.betreff, a.beschreibung, a.status, a.zugewiesen_an, a.antwort_bis,
                a.firma_id, a.erstellt_von, a.erstellt_am, a.aktualisiert_am,
                f.name AS kunde_name, u.name AS zugewiesen_name
         FROM ccintern_anfragen a
         LEFT JOIN firmen f ON f.id = a.kunde_id
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         WHERE a.id = ? AND a.firma_id = ? AND a.deleted_at IS NULL
         LIMIT 1`,
        [aid, fid],
      );
    },
    async getLastCcInternAnfragenNrForYear(year) {
      const yy = Number(year);
      if (!Number.isInteger(yy)) return null;
      return qGet(
        pool,
        `SELECT anfragen_nr
         FROM ccintern_anfragen
         WHERE anfragen_nr LIKE ?
         ORDER BY anfragen_nr DESC
         LIMIT 1`,
        [`ANF-${yy}-%`],
      );
    },
    async insertCcInternAnfrage(row) {
      await qRun(
        pool,
        `INSERT INTO ccintern_anfragen
          (id, anfragen_nr, kunde_id, betreff, beschreibung, status, zugewiesen_an, antwort_bis, firma_id, erstellt_von)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getCcInternAnfrageById(row.id, row.firma_id);
    },
    async updateCcInternAnfrage(id, firmaId, patch) {
      const cur = await this.getCcInternAnfrageById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE ccintern_anfragen
         SET kunde_id = ?, betreff = ?, beschreibung = ?, status = ?, zugewiesen_an = ?, antwort_bis = ?,
             aktualisiert_am = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND firma_id = ? AND deleted_at IS NULL`,
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
      return this.getCcInternAnfrageById(id, firmaId);
    },
    async deleteCcInternAnfrage(id, firmaId) {
      const aid = String(id).trim();
      const fid = String(firmaId).trim();
      if (!aid || !fid) return false;
      const [res] = await pool.execute(
        `UPDATE ccintern_anfragen
         SET deleted_at = CURRENT_TIMESTAMP(3), aktualisiert_am = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND firma_id = ? AND deleted_at IS NULL`,
        mysqlBindParams([aid, fid]),
      );
      return Number(res.affectedRows || 0) > 0;
    },
    async listCcInternAngeboteByProject(projectId, { offset = 0, limit = 200 } = {}) {
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!pid) return [];
      return qAll(
        pool,
        `SELECT id, project_id, kunde_id, titel, beschreibung, betrag_cent, status, origin,
                erstellt_von, created_at, updated_at, deleted_at
         FROM ccintern_angebote
         WHERE project_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC, id
         LIMIT ? OFFSET ?`,
        [pid, Number(limit) || 200, Number(offset) || 0],
      );
    },
    async getCcInternAngebotById(id, projectId) {
      const aid = typeof id === 'string' ? id.trim() : '';
      const pid = typeof projectId === 'string' ? projectId.trim() : '';
      if (!aid || !pid) return null;
      return qGet(
        pool,
        `SELECT id, project_id, kunde_id, titel, beschreibung, betrag_cent, status, origin,
                erstellt_von, created_at, updated_at, deleted_at
         FROM ccintern_angebote
         WHERE id = ? AND project_id = ? AND deleted_at IS NULL
         LIMIT 1`,
        [aid, pid],
      );
    },
    async insertCcInternAngebot(row) {
      await qRun(
        pool,
        `INSERT INTO ccintern_angebote
          (id, project_id, kunde_id, titel, beschreibung, betrag_cent, status, origin, erstellt_von, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ccintern', ?, NULL)`,
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
      return this.getCcInternAngebotById(row.id, row.project_id);
    },
    async updateCcInternAngebot(id, projectId, patch) {
      const cur = await this.getCcInternAngebotById(id, projectId);
      if (!cur) return null;
      const next = { ...cur, ...patch, origin: 'ccintern' };
      await qRun(
        pool,
        `UPDATE ccintern_angebote
         SET kunde_id = ?, titel = ?, beschreibung = ?, betrag_cent = ?, status = ?, origin = 'ccintern',
             updated_at = CURRENT_TIMESTAMP(3)
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
      return this.getCcInternAngebotById(id, projectId);
    },
    async softDeleteCcInternAngebot(id, projectId) {
      const cur = await this.getCcInternAngebotById(id, projectId);
      if (!cur) return false;
      await qRun(
        pool,
        `UPDATE ccintern_angebote
         SET deleted_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
        [String(id).trim(), String(projectId).trim()],
      );
      return true;
    },
    async listAufgabenByFirma(firmaId, { offset = 0, limit = 50, status = null } = {}) {
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
      return qAll(
        pool,
        `SELECT a.id, a.titel, a.beschreibung, a.zugewiesen_an, a.auftrag_id, a.faellig_am,
                a.status, a.prioritaet, a.firma_id, a.erstellt_von, a.erstellt_am, a.aktualisiert_am,
                u.name AS zugewiesen_name
         FROM aufgaben a
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         ${where}
         ORDER BY a.erstellt_am DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    async countAufgabenByFirma(firmaId, { status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      if (status) {
        where += ' AND status = ?';
        params.push(String(status).trim());
      }
      const row = await qGet(pool, `SELECT COUNT(*) AS c FROM aufgaben ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    async getAufgabeById(id, firmaId) {
      const aid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!aid || !fid) return null;
      return qGet(
        pool,
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
    async insertAufgabe(row) {
      await qRun(
        pool,
        `INSERT INTO aufgaben
          (id, titel, beschreibung, zugewiesen_an, auftrag_id, faellig_am, status, prioritaet, firma_id, erstellt_von)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getAufgabeById(row.id, row.firma_id);
    },
    async updateAufgabe(id, firmaId, patch) {
      const cur = await this.getAufgabeById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE aufgaben
         SET titel = ?, beschreibung = ?, zugewiesen_an = ?, auftrag_id = ?, faellig_am = ?, status = ?, prioritaet = ?,
             aktualisiert_am = CURRENT_TIMESTAMP(3)
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
      return this.getAufgabeById(id, firmaId);
    },
    async deleteAufgabe(id, firmaId) {
      const cur = await this.getAufgabeById(id, firmaId);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM aufgaben WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      return true;
    },
    async listCcInternRechnungenByFirma(firmaId, { offset = 0, limit = 50, status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE r.firma_id = ? AND r.deleted_at IS NULL';
      if (status) {
        where += ' AND r.status = ?';
        params.push(String(status).trim());
      }
      params.push(Number(limit) || 50, Number(offset) || 0);
      return qAll(
        pool,
        `SELECT r.id, r.rechnungsnummer, r.auftrag_id, r.status, r.faellig_am, r.bezahlt_am, r.bemerkung,
                r.firma_id, r.erstellt_von, r.erstellt_am, r.aktualisiert_am,
                a.auftragsnummer, a.kunde
         FROM ccintern_rechnungen r
         LEFT JOIN ccintern_auftraege a ON a.id = r.auftrag_id
         ${where}
         ORDER BY r.erstellt_am DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    async countCcInternRechnungenByFirma(firmaId, { status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ? AND deleted_at IS NULL';
      if (status) {
        where += ' AND status = ?';
        params.push(String(status).trim());
      }
      const row = await qGet(pool, `SELECT COUNT(*) AS c FROM ccintern_rechnungen ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    async getCcInternRechnungById(id, firmaId) {
      const rid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!rid || !fid) return null;
      return qGet(
        pool,
        `SELECT r.id, r.rechnungsnummer, r.auftrag_id, r.status, r.faellig_am, r.bezahlt_am, r.bemerkung,
                r.firma_id, r.erstellt_von, r.erstellt_am, r.aktualisiert_am,
                a.auftragsnummer, a.kunde
         FROM ccintern_rechnungen r
         LEFT JOIN ccintern_auftraege a ON a.id = r.auftrag_id
         WHERE r.id = ? AND r.firma_id = ? AND r.deleted_at IS NULL
         LIMIT 1`,
        [rid, fid],
      );
    },
    async getLastCcInternRechnungsnummerForYear(year) {
      const yy = Number(year);
      if (!Number.isInteger(yy)) return null;
      return qGet(
        pool,
        `SELECT rechnungsnummer
         FROM ccintern_rechnungen
         WHERE rechnungsnummer LIKE ?
         ORDER BY rechnungsnummer DESC
         LIMIT 1`,
        [`RE-${yy}-%`],
      );
    },
    async insertCcInternRechnung(row) {
      await qRun(
        pool,
        `INSERT INTO ccintern_rechnungen
          (id, rechnungsnummer, auftrag_id, status, faellig_am, bezahlt_am, bemerkung, firma_id, erstellt_von)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getCcInternRechnungById(row.id, row.firma_id);
    },
    async updateCcInternRechnung(id, firmaId, patch) {
      const cur = await this.getCcInternRechnungById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE ccintern_rechnungen
         SET auftrag_id = ?, status = ?, faellig_am = ?, bezahlt_am = ?, bemerkung = ?, aktualisiert_am = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND firma_id = ? AND deleted_at IS NULL`,
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
      return this.getCcInternRechnungById(id, firmaId);
    },
    async deleteCcInternRechnung(id, firmaId) {
      const rid = String(id).trim();
      const fid = String(firmaId).trim();
      if (!rid || !fid) return false;
      const [res] = await pool.execute(
        `UPDATE ccintern_rechnungen
         SET deleted_at = CURRENT_TIMESTAMP(3), aktualisiert_am = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND firma_id = ? AND deleted_at IS NULL`,
        mysqlBindParams([rid, fid]),
      );
      return Number(res.affectedRows || 0) > 0;
    },
    async countMitarbeiterByFirma(firmaId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      const row = await qGet(
        pool,
        `SELECT COUNT(*) AS c
         FROM mitarbeiter m
         INNER JOIN users u ON u.id = m.user_id
         WHERE m.firma_id = ?
         LIMIT 1`,
        [fid],
      );
      return Number(row?.c || 0);
    },
    async listMitarbeiterByFirma(firmaId, { offset = 0, limit = 50 } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      const lim = Number(limit) || 50;
      const off = Number(offset) || 0;
      return qAll(
        pool,
        `SELECT m.id, m.user_id, m.firma_id, m.vertrag_typ, m.soll_stunden, m.eintrittsdatum, m.austrittsdatum,
                m.position, m.created_at, u.email AS user_email, u.name AS user_name
         FROM mitarbeiter m
         INNER JOIN users u ON u.id = m.user_id
         WHERE m.firma_id = ?
         ORDER BY m.created_at DESC, m.id
         LIMIT ? OFFSET ?`,
        [fid, lim, off],
      );
    },
    async getMitarbeiterById(id, firmaId) {
      const mid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!mid || !fid) return null;
      return qGet(
        pool,
        `SELECT m.id, m.user_id, m.firma_id, m.vertrag_typ, m.soll_stunden, m.eintrittsdatum, m.austrittsdatum,
                m.position, m.created_at, u.email AS user_email, u.name AS user_name
         FROM mitarbeiter m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.id = ? AND m.firma_id = ?
         LIMIT 1`,
        [mid, fid],
      );
    },
    async getMitarbeiterByUserAndFirma(userId, firmaId) {
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!uid || !fid) return null;
      return qGet(
        pool,
        `SELECT m.id, m.user_id, m.firma_id, m.vertrag_typ, m.soll_stunden, m.eintrittsdatum, m.austrittsdatum,
                m.position, m.created_at, u.email AS user_email, u.name AS user_name
         FROM mitarbeiter m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.user_id = ? AND m.firma_id = ?
         LIMIT 1`,
        [uid, fid],
      );
    },
    async insertMitarbeiter(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      await qRun(
        pool,
        `INSERT INTO mitarbeiter (id, user_id, firma_id, vertrag_typ, soll_stunden, eintrittsdatum, austrittsdatum, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getMitarbeiterById(id, row.firma_id);
    },
    async updateMitarbeiter(id, firmaId, patch) {
      const cur = await this.getMitarbeiterById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
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
      return this.getMitarbeiterById(id, firmaId);
    },
    async deleteMitarbeiter(id, firmaId) {
      const mid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!mid || !fid) return false;
      await qRun(pool, 'DELETE FROM mitarbeiter WHERE id = ? AND firma_id = ?', [mid, fid]);
      return true;
    },
    async countChecklistenByFirma(firmaId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      const row = await qGet(pool, 'SELECT COUNT(*) AS c FROM checklisten WHERE firma_id = ? LIMIT 1', [fid]);
      return Number(row?.c || 0);
    },
    async listChecklistenByFirma(firmaId, { offset = 0, limit = 50 } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      const lim = Number(limit) || 50;
      const off = Number(offset) || 0;
      return qAll(
        pool,
        `SELECT id, titel, firma_id, auftrag_id, erstellt_von, created_at
         FROM checklisten
         WHERE firma_id = ?
         ORDER BY created_at DESC, id
         LIMIT ? OFFSET ?`,
        [fid, lim, off],
      );
    },
    async getChecklisteById(id, firmaId) {
      const cid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!cid || !fid) return null;
      return qGet(
        pool,
        'SELECT id, titel, firma_id, auftrag_id, erstellt_von, created_at FROM checklisten WHERE id = ? AND firma_id = ? LIMIT 1',
        [cid, fid],
      );
    },
    async listChecklistenEintraegeForCheckliste(checklisteId) {
      const cid = typeof checklisteId === 'string' ? checklisteId.trim() : '';
      if (!cid) return [];
      return qAll(
        pool,
        'SELECT id, checkliste_id, text, erledigt, reihenfolge FROM checklisten_eintraege WHERE checkliste_id = ? ORDER BY reihenfolge ASC, id ASC',
        [cid],
      );
    },
    async nextChecklisteEintragReihenfolge(checklisteId) {
      const cid = typeof checklisteId === 'string' ? checklisteId.trim() : '';
      if (!cid) return 0;
      const row = await qGet(
        pool,
        'SELECT COALESCE(MAX(reihenfolge), -1) AS m FROM checklisten_eintraege WHERE checkliste_id = ? LIMIT 1',
        [cid],
      );
      return Number(row?.m ?? -1) + 1;
    },
    async insertCheckliste(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      await qRun(
        pool,
        `INSERT INTO checklisten (id, titel, firma_id, auftrag_id, erstellt_von)
         VALUES (?, ?, ?, ?, ?)`,
        [id, row.titel, row.firma_id, row.auftrag_id ?? null, row.erstellt_von ?? null],
      );
      return this.getChecklisteById(id, row.firma_id);
    },
    async updateCheckliste(id, firmaId, patch) {
      const cur = await this.getChecklisteById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(pool, 'UPDATE checklisten SET titel = ?, auftrag_id = ? WHERE id = ? AND firma_id = ?', [
        String(next.titel || '').trim() || cur.titel,
        next.auftrag_id ?? null,
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      return this.getChecklisteById(id, firmaId);
    },
    async deleteCheckliste(id, firmaId) {
      const cid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!cid || !fid) return false;
      await qRun(pool, 'DELETE FROM checklisten WHERE id = ? AND firma_id = ?', [cid, fid]);
      return true;
    },
    async getChecklisteEintragByIdAndFirma(eintragId, firmaId) {
      const eid = typeof eintragId === 'string' ? eintragId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!eid || !fid) return null;
      return qGet(
        pool,
        `SELECT e.id, e.checkliste_id, e.text, e.erledigt, e.reihenfolge
         FROM checklisten_eintraege e
         INNER JOIN checklisten c ON c.id = e.checkliste_id
         WHERE e.id = ? AND c.firma_id = ?
         LIMIT 1`,
        [eid, fid],
      );
    },
    async insertChecklisteEintrag(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      const erl = row.erledigt ? 1 : 0;
      const ro = Number(row.reihenfolge);
      const reihenfolge = Number.isFinite(ro) ? ro : 0;
      await qRun(
        pool,
        `INSERT INTO checklisten_eintraege (id, checkliste_id, text, erledigt, reihenfolge)
         VALUES (?, ?, ?, ?, ?)`,
        [id, row.checkliste_id, row.text, erl, reihenfolge],
      );
      return qGet(pool, 'SELECT id, checkliste_id, text, erledigt, reihenfolge FROM checklisten_eintraege WHERE id = ? LIMIT 1', [
        id,
      ]);
    },
    async updateChecklisteEintrag(eintragId, firmaId, patch) {
      const cur = await this.getChecklisteEintragByIdAndFirma(eintragId, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      const erl = next.erledigt ? 1 : 0;
      const ro = Number(next.reihenfolge);
      const reihenfolge = Number.isFinite(ro) ? ro : 0;
      await qRun(
        pool,
        `UPDATE checklisten_eintraege
         SET text = ?, erledigt = ?, reihenfolge = ?
         WHERE id = ? AND checkliste_id IN (SELECT id FROM checklisten WHERE firma_id = ?)`,
        [String(next.text || '').trim() || cur.text, erl, reihenfolge, String(eintragId).trim(), String(firmaId).trim()],
      );
      return this.getChecklisteEintragByIdAndFirma(eintragId, firmaId);
    },
    async deleteChecklisteEintrag(eintragId, firmaId) {
      const eid = typeof eintragId === 'string' ? eintragId.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!eid || !fid) return false;
      await qRun(
        pool,
        'DELETE FROM checklisten_eintraege WHERE id = ? AND checkliste_id IN (SELECT id FROM checklisten WHERE firma_id = ?)',
        [eid, fid],
      );
      return true;
    },
    async countProduktionAuftraegeByFirma(firmaId, { auftragId = null, verantwortlich = null } = {}) {
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
      const row = await qGet(pool, `SELECT COUNT(*) AS c FROM produktion_auftraege ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    async listProduktionAuftraegeByFirma(firmaId, { offset = 0, limit = 50, auftragId = null, verantwortlich = null } = {}) {
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
      return qAll(
        pool,
        `SELECT id, auftrag_id, schritt, fortschritt, verantwortlich, notiz, gestartet_am, abgeschlossen_am, firma_id
         FROM produktion_auftraege
         ${where}
         ORDER BY id DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    async listProduktionAuftraegeForMitarbeiterApp(firmaId, userId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!fid || !uid) return [];
      const rows = await this.listProduktionAuftraegeByFirma(fid, { offset: 0, limit: 500 });
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
          cache.set(aid, await this.getCcInternAuftragById(aid, fid));
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
    async getProduktionAuftragById(id, firmaId) {
      const pid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!pid || !fid) return null;
      return qGet(
        pool,
        `SELECT id, auftrag_id, schritt, fortschritt, verantwortlich, notiz, gestartet_am, abgeschlossen_am, firma_id
         FROM produktion_auftraege
         WHERE id = ? AND firma_id = ?
         LIMIT 1`,
        [pid, fid],
      );
    },
    /**
     * CC-Intern mit Workflow in `bemerkung`: eine Produktionszeile für die Mitarbeiter-App, falls noch keine existiert.
     * @param {string} auftragId ccintern_auftraege.id
     * @param {string} firmaId
     * @returns {Promise<object|null>}
     */
    async ensureProduktionRowForCcInternAuftrag(auftragId, firmaId) {
      const aid = auftragId != null ? String(auftragId).trim() : '';
      const fid = firmaId != null ? String(firmaId).trim() : '';
      if (!aid || !fid) return null;
      const cntRow = await qGet(
        pool,
        `SELECT COUNT(*) AS c FROM produktion_auftraege WHERE auftrag_id = ? AND firma_id = ?`,
        [aid, fid],
      );
      if (Number(cntRow?.c ?? 0) > 0) {
        return qGet(
          pool,
          `SELECT id, auftrag_id, schritt, fortschritt, verantwortlich, notiz, gestartet_am, abgeschlossen_am, firma_id
           FROM produktion_auftraege WHERE auftrag_id = ? AND firma_id = ? ORDER BY id DESC LIMIT 1`,
          [aid, fid],
        );
      }
      const auf = await this.getCcInternAuftragById(aid, fid);
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
    async insertProduktionAuftrag(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      const fort = Math.round(Number(row.fortschritt));
      const f = Number.isFinite(fort) ? fort : 0;
      await qRun(
        pool,
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
      return this.getProduktionAuftragById(id, row.firma_id);
    },
    async updateProduktionAuftrag(id, firmaId, patch) {
      const cur = await this.getProduktionAuftragById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      const fort = Math.round(Number(next.fortschritt));
      const f = Number.isFinite(fort) ? fort : 0;
      await qRun(
        pool,
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
      return this.getProduktionAuftragById(id, firmaId);
    },
    async countFusaDokumente({ projectId = null, auftragId = null, fahrzeugId = null } = {}) {
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
      const row = await qGet(pool, `SELECT COUNT(*) AS c FROM fusa_dokumente ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    async listFusaDokumente({ projectId = null, auftragId = null, fahrzeugId = null, offset = 0, limit = 50 } = {}) {
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
      return qAll(
        pool,
        `SELECT id, auftrag_id, fahrzeug_id, name, typ, url, groesse, hochgeladen_von, created_at, project_id
         FROM fusa_dokumente
         ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    async getFusaDokumentById(id) {
      const did = typeof id === 'string' ? id.trim() : '';
      if (!did) return null;
      return qGet(
        pool,
        `SELECT id, auftrag_id, fahrzeug_id, name, typ, url, groesse, hochgeladen_von, created_at, project_id
         FROM fusa_dokumente WHERE id = ? LIMIT 1`,
        [did],
      );
    },
    async insertFusaDokument(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      const g = Number(row.groesse);
      const groesse = Number.isFinite(g) && g >= 0 ? Math.floor(g) : 0;
      await qRun(
        pool,
        `INSERT INTO fusa_dokumente (id, auftrag_id, fahrzeug_id, name, typ, url, groesse, hochgeladen_von, project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getFusaDokumentById(id);
    },
    async deleteFusaDokument(id) {
      const did = typeof id === 'string' ? id.trim() : '';
      if (!did) return false;
      const cur = await qGet(pool, 'SELECT id FROM fusa_dokumente WHERE id = ? LIMIT 1', [did]);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM fusa_dokumente WHERE id = ?', [did]);
      return true;
    },
    async countFusaAngebote({ projectId = null, fusaKundeId = null, status = null } = {}) {
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
      const row = await qGet(pool, `SELECT COUNT(*) AS c FROM fusa_angebote ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    async listFusaAngebote({ projectId = null, fusaKundeId = null, status = null, offset = 0, limit = 50 } = {}) {
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
      return qAll(
        pool,
        `SELECT id, project_id, fusa_kunde_id, titel, status, gueltig_bis, angebots_json, erstellt_von, created_at
         FROM fusa_angebote
         ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    async getFusaAngebotById(id) {
      const aid = typeof id === 'string' ? id.trim() : '';
      if (!aid) return null;
      return qGet(
        pool,
        `SELECT id, project_id, fusa_kunde_id, titel, status, gueltig_bis, angebots_json, erstellt_von, created_at
         FROM fusa_angebote WHERE id = ? LIMIT 1`,
        [aid],
      );
    },
    async insertFusaAngebot(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      await qRun(
        pool,
        `INSERT INTO fusa_angebote (id, project_id, fusa_kunde_id, titel, status, gueltig_bis, angebots_json, erstellt_von)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getFusaAngebotById(id);
    },
    async updateFusaAngebot(id, patch) {
      const cur = await this.getFusaAngebotById(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
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
      return this.getFusaAngebotById(id);
    },
    async deleteFusaAngebot(id) {
      const aid = typeof id === 'string' ? id.trim() : '';
      if (!aid) return false;
      const cur = await qGet(pool, 'SELECT id FROM fusa_angebote WHERE id = ? LIMIT 1', [aid]);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM fusa_angebote WHERE id = ?', [aid]);
      return true;
    },
    async listMesseflowProjekteByFirma(firmaId, { offset = 0, limit = 50, status = null } = {}) {
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
      return qAll(
        pool,
        `SELECT p.id, p.name, p.kunde, p.agentur_id, p.lieferdatum, p.status, p.messe, p.stand, p.prioritaet, p.bemerkung,
                p.firma_id, p.erstellt_von, p.erstellt_am, p.aktualisiert_am, f.name AS agentur_name
         FROM messeflow_projekte p
         LEFT JOIN firmen f ON f.id = p.agentur_id
         ${where}
         ORDER BY p.erstellt_am DESC
         LIMIT ? OFFSET ?`,
        params,
      );
    },
    async countMesseflowProjekteByFirma(firmaId, { status = null } = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return 0;
      /** @type {any[]} */
      const params = [fid];
      let where = 'WHERE firma_id = ?';
      if (status) {
        where += ' AND status = ?';
        params.push(String(status).trim());
      }
      const row = await qGet(pool, `SELECT COUNT(*) AS c FROM messeflow_projekte ${where} LIMIT 1`, params);
      return Number(row?.c || 0);
    },
    async getMesseflowProjektById(id, firmaId) {
      const pid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!pid || !fid) return null;
      return qGet(
        pool,
        `SELECT p.id, p.name, p.kunde, p.agentur_id, p.lieferdatum, p.status, p.messe, p.stand, p.prioritaet, p.bemerkung,
                p.firma_id, p.erstellt_von, p.erstellt_am, p.aktualisiert_am, f.name AS agentur_name
         FROM messeflow_projekte p
         LEFT JOIN firmen f ON f.id = p.agentur_id
         WHERE p.id = ? AND p.firma_id = ?
         LIMIT 1`,
        [pid, fid],
      );
    },
    async insertMesseflowProjekt(row) {
      await qRun(
        pool,
        `INSERT INTO messeflow_projekte
          (id, name, kunde, agentur_id, lieferdatum, status, messe, stand, prioritaet, bemerkung, firma_id, erstellt_von)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getMesseflowProjektById(row.id, row.firma_id);
    },
    async updateMesseflowProjekt(id, firmaId, patch) {
      const cur = await this.getMesseflowProjektById(id, firmaId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE messeflow_projekte
         SET name = ?, kunde = ?, agentur_id = ?, lieferdatum = ?, status = ?, messe = ?, stand = ?, prioritaet = ?, bemerkung = ?,
             aktualisiert_am = CURRENT_TIMESTAMP(3)
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
      return this.getMesseflowProjektById(id, firmaId);
    },
    async deleteMesseflowProjekt(id, firmaId) {
      const cur = await this.getMesseflowProjektById(id, firmaId);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM messeflow_projekte WHERE id = ? AND firma_id = ?', [
        String(id).trim(),
        String(firmaId).trim(),
      ]);
      return true;
    },
    async listMesseflowWaendeByProjekt(projektId) {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      if (!pid) return [];
      return qAll(
        pool,
        `SELECT id, projekt_id, name, breite, hoehe, einheit, material, status, bemerkung, sort_index, erstellt_am, aktualisiert_am
         FROM messeflow_waende
         WHERE projekt_id = ?
         ORDER BY sort_index ASC, erstellt_am ASC`,
        [pid],
      );
    },
    async getMesseflowWandById(wandId, projektId) {
      const wid = typeof wandId === 'string' ? wandId.trim() : '';
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      if (!wid || !pid) return null;
      return qGet(
        pool,
        `SELECT id, projekt_id, name, breite, hoehe, einheit, material, status, bemerkung, sort_index, erstellt_am, aktualisiert_am
         FROM messeflow_waende
         WHERE id = ? AND projekt_id = ?
         LIMIT 1`,
        [wid, pid],
      );
    },
    async insertMesseflowWand(row) {
      await qRun(
        pool,
        `INSERT INTO messeflow_waende
          (id, projekt_id, name, breite, hoehe, einheit, material, status, bemerkung, sort_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getMesseflowWandById(row.id, row.projekt_id);
    },
    async updateMesseflowWand(wandId, projektId, patch) {
      const cur = await this.getMesseflowWandById(wandId, projektId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE messeflow_waende
         SET name = ?, breite = ?, hoehe = ?, einheit = ?, material = ?, status = ?, bemerkung = ?, sort_index = ?,
             aktualisiert_am = CURRENT_TIMESTAMP(3)
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
      return this.getMesseflowWandById(wandId, projektId);
    },
    async deleteMesseflowWand(wandId, projektId) {
      const cur = await this.getMesseflowWandById(wandId, projektId);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM messeflow_waende WHERE id = ? AND projekt_id = ?', [
        String(wandId).trim(),
        String(projektId).trim(),
      ]);
      return true;
    },
    async listMesseflowDateienByWand(wandId) {
      const wid = typeof wandId === 'string' ? wandId.trim() : '';
      if (!wid) return [];
      return qAll(
        pool,
        `SELECT id, wand_id, name, pfad, mime_type, groesse, status, bemerkung, meta_json, erstellt_am, aktualisiert_am
         FROM messeflow_wand_dateien
         WHERE wand_id = ?
         ORDER BY erstellt_am ASC`,
        [wid],
      );
    },
    async getMesseflowDateiById(dateiId, wandId) {
      const did = typeof dateiId === 'string' ? dateiId.trim() : '';
      const wid = typeof wandId === 'string' ? wandId.trim() : '';
      if (!did || !wid) return null;
      return qGet(
        pool,
        `SELECT id, wand_id, name, pfad, mime_type, groesse, status, bemerkung, meta_json, erstellt_am, aktualisiert_am
         FROM messeflow_wand_dateien
         WHERE id = ? AND wand_id = ?
         LIMIT 1`,
        [did, wid],
      );
    },
    async insertMesseflowDatei(row) {
      await qRun(
        pool,
        `INSERT INTO messeflow_wand_dateien
          (id, wand_id, name, pfad, mime_type, groesse, status, bemerkung, meta_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getMesseflowDateiById(row.id, row.wand_id);
    },
    async updateMesseflowDatei(dateiId, wandId, patch) {
      const cur = await this.getMesseflowDateiById(dateiId, wandId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE messeflow_wand_dateien
         SET name = ?, pfad = ?, mime_type = ?, groesse = ?, status = ?, bemerkung = ?, meta_json = ?,
             aktualisiert_am = CURRENT_TIMESTAMP(3)
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
      return this.getMesseflowDateiById(dateiId, wandId);
    },
    async listMfProjekte() {
      return qAll(pool, 'SELECT * FROM mf_projekte ORDER BY created_at DESC', []);
    },
    async getMfProjektById(id) {
      const pid = typeof id === 'string' ? id.trim() : '';
      if (!pid) return null;
      return qGet(pool, 'SELECT * FROM mf_projekte WHERE id = ? LIMIT 1', [pid]);
    },
    async insertMfProjekt(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      await qRun(
        pool,
        `INSERT INTO mf_projekte
          (id, name, status, verantwortlicher, messe_name, messe_datum_von, messe_datum_bis, ort, notizen, extra_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      return this.getMfProjektById(id);
    },
    async updateMfProjektById(id, patch) {
      const cur = await this.getMfProjektById(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE mf_projekte
         SET name = ?, status = ?, verantwortlicher = ?, messe_name = ?, messe_datum_von = ?, messe_datum_bis = ?,
             ort = ?, notizen = ?, extra_json = ?, updated_at = CURRENT_TIMESTAMP(3)
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
      return this.getMfProjektById(id);
    },
    async deleteMfProjektById(id) {
      const pid = typeof id === 'string' ? id.trim() : '';
      if (!pid) return false;
      const cur = await this.getMfProjektById(pid);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM mf_projekte WHERE id = ?', [pid]);
      return true;
    },
    async listMfProjektUsers(projektId) {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      if (!pid) return [];
      return qAll(
        pool,
        `SELECT pu.projekt_id, pu.user_id, pu.rolle, u.name AS user_name, u.email AS user_email
         FROM mf_projekt_users pu
         LEFT JOIN users u ON u.id = pu.user_id
         WHERE pu.projekt_id = ?
         ORDER BY u.name ASC`,
        [pid],
      );
    },
    async upsertMfProjektUser(projektId, userId, rolle = 'mitarbeiter') {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!pid || !uid) return null;
      await qRun(
        pool,
        `INSERT INTO mf_projekt_users (projekt_id, user_id, rolle)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE rolle = VALUES(rolle)`,
        [pid, uid, String(rolle || 'mitarbeiter').trim() || 'mitarbeiter'],
      );
      return qGet(
        pool,
        'SELECT projekt_id, user_id, rolle FROM mf_projekt_users WHERE projekt_id = ? AND user_id = ? LIMIT 1',
        [pid, uid],
      );
    },
    async deleteMfProjektUser(projektId, userId) {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!pid || !uid) return false;
      await qRun(pool, 'DELETE FROM mf_projekt_users WHERE projekt_id = ? AND user_id = ?', [pid, uid]);
      return true;
    },
    async listMfAufgaben(projektId) {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      if (!pid) return [];
      return qAll(
        pool,
        `SELECT a.*, u.name AS zugewiesen_name
         FROM mf_aufgaben a
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         WHERE a.projekt_id = ?
         ORDER BY a.created_at DESC`,
        [pid],
      );
    },
    async insertMfAufgabe(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      await qRun(
        pool,
        `INSERT INTO mf_aufgaben
          (id, projekt_id, titel, beschreibung, status, prioritaet, faellig_am, zugewiesen_an, extra_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          row?.projekt_id,
          row?.titel ?? '',
          row?.beschreibung ?? null,
          row?.status ?? 'offen',
          row?.prioritaet ?? 'normal',
          row?.faellig_am ?? null,
          row?.zugewiesen_an ?? null,
          row?.extra_json ?? null,
        ],
      );
      return qGet(pool, 'SELECT * FROM mf_aufgaben WHERE id = ? LIMIT 1', [id]);
    },
    async updateMfAufgabeById(id, patch) {
      const aid = typeof id === 'string' ? id.trim() : '';
      if (!aid) return null;
      const cur = await qGet(pool, 'SELECT * FROM mf_aufgaben WHERE id = ? LIMIT 1', [aid]);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE mf_aufgaben
         SET titel = ?, beschreibung = ?, status = ?, prioritaet = ?, faellig_am = ?, zugewiesen_an = ?, extra_json = ?,
             updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [
          next.titel ?? '',
          next.beschreibung ?? null,
          next.status ?? 'offen',
          next.prioritaet ?? 'normal',
          next.faellig_am ?? null,
          next.zugewiesen_an ?? null,
          next.extra_json ?? null,
          aid,
        ],
      );
      return qGet(pool, 'SELECT * FROM mf_aufgaben WHERE id = ? LIMIT 1', [aid]);
    },
    async deleteMfAufgabeById(id) {
      const aid = typeof id === 'string' ? id.trim() : '';
      if (!aid) return false;
      await qRun(pool, 'DELETE FROM mf_aufgaben WHERE id = ?', [aid]);
      return true;
    },
    async listMfDokumente(projektId) {
      const pid = typeof projektId === 'string' ? projektId.trim() : '';
      if (!pid) return [];
      return qAll(
        pool,
        `SELECT d.*, u.name AS uploaded_by_name
         FROM mf_dokumente d
         LEFT JOIN users u ON u.id = d.uploaded_by
         WHERE d.projekt_id = ?
         ORDER BY d.created_at DESC`,
        [pid],
      );
    },
    async insertMfDokument(row) {
      const id = row?.id != null && String(row.id).trim() ? String(row.id).trim() : randomUUID();
      await qRun(
        pool,
        `INSERT INTO mf_dokumente
          (id, projekt_id, name, typ, url, pruef_status, pruef_ergebnis_json, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          row?.projekt_id,
          row?.name ?? '',
          row?.typ ?? null,
          row?.url ?? null,
          row?.pruef_status ?? 'ausstehend',
          row?.pruef_ergebnis_json ?? null,
          row?.uploaded_by ?? null,
        ],
      );
      return qGet(pool, 'SELECT * FROM mf_dokumente WHERE id = ? LIMIT 1', [id]);
    },
    async updateMfDokumentById(id, patch) {
      const did = typeof id === 'string' ? id.trim() : '';
      if (!did) return null;
      const cur = await qGet(pool, 'SELECT * FROM mf_dokumente WHERE id = ? LIMIT 1', [did]);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await qRun(
        pool,
        `UPDATE mf_dokumente
         SET name = ?, typ = ?, url = ?, pruef_status = ?, pruef_ergebnis_json = ?, uploaded_by = ?
         WHERE id = ?`,
        [
          next.name ?? '',
          next.typ ?? null,
          next.url ?? null,
          next.pruef_status ?? 'ausstehend',
          next.pruef_ergebnis_json ?? null,
          next.uploaded_by ?? null,
          did,
        ],
      );
      return qGet(pool, 'SELECT * FROM mf_dokumente WHERE id = ? LIMIT 1', [did]);
    },
    async deleteMfDokumentById(id) {
      const did = typeof id === 'string' ? id.trim() : '';
      if (!did) return false;
      await qRun(pool, 'DELETE FROM mf_dokumente WHERE id = ?', [did]);
      return true;
    },
    async getMesseflowWorkspace() {
      try {
        return await qGet(pool, 'SELECT id, payload_json, updated_at FROM messeflow_workspace WHERE id = ? LIMIT 1', [
          'default',
        ]);
      } catch {
        return null;
      }
    },
    async upsertMesseflowWorkspace({ payloadJson }) {
      const raw = typeof payloadJson === 'string' ? payloadJson : JSON.stringify(payloadJson ?? {});
      await qRun(
        pool,
        `INSERT INTO messeflow_workspace (id, payload_json) VALUES ('default', ?)
         ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), updated_at = CURRENT_TIMESTAMP(3)`,
        [raw],
      );
      return qGet(pool, 'SELECT id, payload_json, updated_at FROM messeflow_workspace WHERE id = ? LIMIT 1', [
        'default',
      ]);
    },
    async insertAuditLog(row) {
      await qRun(
        pool,
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
    },
    async listAuditLogEntries(limit = 100) {
      const lim = Math.min(500, Math.max(1, Number(limit) || 100));
      return qAll(
        pool,
        `SELECT id, ts, user_id, modul, action, resource_type, resource_id, project_id, payload_json
         FROM audit_log ORDER BY ts DESC LIMIT ?`,
        [lim],
      );
    },
    async listAuditLogFiltered(filters = {}) {
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
      const countRow = await qGet(pool, `SELECT COUNT(*) AS c FROM audit_log ${where}`, params);
      const total = countRow && countRow.c != null ? Number(countRow.c) : 0;
      const rows = await qAll(
        pool,
        `SELECT id, ts, user_id, modul, action, resource_type, resource_id, project_id, payload_json
         FROM audit_log ${where}
         ORDER BY ts DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      return { rows, total, page, limit };
    },
    async getDashboardCockpitStats() {
      const auf = await qGet(
        pool,
        `SELECT COUNT(*) AS c FROM auftraege WHERE
          status IS NULL OR TRIM(COALESCE(status,'')) = ''
          OR LOWER(TRIM(status)) NOT IN ('abgeschlossen','geschlossen','storniert','erledigt','fertig','beendet')`,
        [],
      );
      const proj = await qGet(pool, 'SELECT COUNT(*) AS c FROM projects', []);
      const term = await qGet(
        pool,
        `SELECT COUNT(*) AS c FROM kalender_termine WHERE DATE(start) = CURDATE()`,
        [],
      );
      const u1 = await qGet(pool, 'SELECT COUNT(*) AS c FROM users', []);
      const u2 = await qGet(
        pool,
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
    async getDashboardFusaStats(opts = {}) {
      const pid = typeof opts.projectId === 'string' && opts.projectId.trim() ? opts.projectId.trim() : null;
      const auf = await qGet(
        pool,
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
      const fz = await qGet(pool, fzSql, fzParams);
      const sch = await qGet(
        pool,
        `SELECT COUNT(*) AS c FROM schaeden WHERE LOWER(COALESCE(TRIM(status),'')) = 'offen'`,
        [],
      );
      const now = new Date();
      const qn = Math.floor(now.getMonth() / 3) + 1;
      const y = now.getFullYear();
      const quartalKey = `${y}-Q${qn}`;
      const sumRow = await qGet(
        pool,
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
    async getDashboardCcinternStats() {
      const ang = await qGet(
        pool,
        `SELECT COUNT(*) AS c FROM ccintern_angebote WHERE deleted_at IS NULL AND (
          status IS NULL OR TRIM(COALESCE(status,'')) = ''
          OR LOWER(TRIM(status)) NOT IN ('gewonnen','verloren','abgelehnt','abgeschlossen','storniert'))`,
        [],
      );
      const ccA = await qGet(
        pool,
        `SELECT COUNT(*) AS c FROM ccintern_auftraege WHERE
          status IS NULL OR TRIM(COALESCE(status,'')) = ''
          OR LOWER(TRIM(status)) NOT IN ('abgeschlossen','erledigt','storniert','fertig','beendet')`,
        [],
      );
      const anf = await qGet(
        pool,
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
    async countGeraeteByFirma(firmaId, filters = {}) {
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
      const row = await qGet(pool, sql, params);
      return row && row.c != null ? Number(row.c) : 0;
    },
    async listGeraeteByFirma(firmaId, opts = {}) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      const pid =
        opts.projectId != null && String(opts.projectId).trim() ? String(opts.projectId).trim() : null;
      const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
      const offset = Math.max(0, Number(opts.offset) || 0);
      let sql = 'SELECT * FROM geraete WHERE firma_id = ?';
      /** @type {unknown[]} */
      const params = [fid];
      if (pid) {
        sql += ' AND project_id = ?';
        params.push(pid);
      }
      sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      return qAll(pool, sql, params);
    },
    async getGeraetById(id, firmaId) {
      const gid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!gid || !fid) return null;
      return (
        (await qGet(pool, 'SELECT * FROM geraete WHERE id = ? AND firma_id = ? LIMIT 1', [gid, fid])) ??
        null
      );
    },
    async insertGeraet(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const firmaId = typeof row.firmaId === 'string' && row.firmaId.trim() ? row.firmaId.trim() : '';
      if (!id || !firmaId) throw new Error('insertGeraet: id/firmaId fehlt');
      const typ = typeof row.typ === 'string' && row.typ.trim() ? row.typ.trim() : '';
      if (!typ) throw new Error('insertGeraet: typ fehlt');
      const sn =
        row.seriennummer != null && String(row.seriennummer).trim()
          ? String(row.seriennummer).trim()
          : null;
      try {
        await qRun(
          pool,
          `INSERT INTO geraete (id, firma_id, project_id, typ, seriennummer, zugewiesen_an_user_id, status, notiz)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      } catch (e) {
        if (isUniqueConstraintError(e)) {
          throw new Error('SERIENNUMMER_CONFLICT');
        }
        throw e;
      }
      return this.getGeraetById(id, firmaId);
    },
    async updateGeraet(id, firmaId, patch) {
      const cur = await this.getGeraetById(id, firmaId);
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
      vals.push(id, firmaId);
      try {
        await qRun(pool, `UPDATE geraete SET ${sets.join(', ')} WHERE id = ? AND firma_id = ?`, vals);
      } catch (e) {
        if (isUniqueConstraintError(e)) {
          throw new Error('SERIENNUMMER_CONFLICT');
        }
        throw e;
      }
      return this.getGeraetById(id, firmaId);
    },
    async deleteGeraet(id, firmaId) {
      const gid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!gid || !fid) return false;
      const cur = await this.getGeraetById(gid, fid);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM geraete WHERE id = ? AND firma_id = ?', [gid, fid]);
      return true;
    },
    async listCrmPipelineStagesByFirma(firmaId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!fid) return [];
      return qAll(
        pool,
        `SELECT * FROM crm_pipeline_stages WHERE firma_id = ?
         ORDER BY sort_order ASC, created_at ASC`,
        [fid],
      );
    },
    async getCrmPipelineStageById(id, firmaId) {
      const sid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!sid || !fid) return null;
      return qGet(pool, 'SELECT * FROM crm_pipeline_stages WHERE id = ? AND firma_id = ? LIMIT 1', [sid, fid]);
    },
    async insertCrmPipelineStage(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const firmaId = typeof row.firmaId === 'string' && row.firmaId.trim() ? row.firmaId.trim() : '';
      const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : '';
      if (!id || !firmaId || !name) throw new Error('insertCrmPipelineStage: id/firmaId/name fehlt');
      const sortOrder =
        row.sortOrder != null && Number.isFinite(Number(row.sortOrder)) ? Math.round(Number(row.sortOrder)) : 0;
      await qRun(
        pool,
        `INSERT INTO crm_pipeline_stages (id, firma_id, name, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
        [id, firmaId, name, sortOrder],
      );
      return this.getCrmPipelineStageById(id, firmaId);
    },
    async updateCrmPipelineStage(id, firmaId, patch) {
      const cur = await this.getCrmPipelineStageById(id, firmaId);
      if (!cur) return null;
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
      vals.push(id, firmaId);
      await qRun(pool, `UPDATE crm_pipeline_stages SET ${sets.join(', ')} WHERE id = ? AND firma_id = ?`, vals);
      return this.getCrmPipelineStageById(id, firmaId);
    },
    async deleteCrmPipelineStage(id, firmaId) {
      const sid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!sid || !fid) return false;
      const cur = await this.getCrmPipelineStageById(sid, fid);
      if (!cur) return false;
      await qRun(pool, 'DELETE FROM crm_pipeline_stages WHERE id = ? AND firma_id = ?', [sid, fid]);
      return true;
    },
    async listCrmAktivitaetenByFirma(firmaId, filters = {}) {
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
      sql += ' ORDER BY created_at DESC';
      return qAll(pool, sql, params);
    },
    async insertCrmAktivitaet(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const firmaId = typeof row.firmaId === 'string' && row.firmaId.trim() ? row.firmaId.trim() : '';
      const kundeId = typeof row.kundeId === 'string' && row.kundeId.trim() ? row.kundeId.trim() : '';
      const typ = typeof row.typ === 'string' && row.typ.trim() ? row.typ.trim() : '';
      const textVal = row.text != null ? String(row.text) : '';
      const datum = typeof row.datum === 'string' && row.datum.trim() ? row.datum.trim() : '';
      if (!id || !firmaId || !kundeId || !typ || !datum) throw new Error('insertCrmAktivitaet: Pflichtfelder fehlen');
      const uid =
        row.userId != null && String(row.userId).trim() ? String(row.userId).trim() : null;
      await qRun(
        pool,
        `INSERT INTO crm_aktivitaeten (id, firma_id, kunde_id, typ, text, user_id, datum, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
        [id, firmaId, kundeId, typ, textVal, uid, datum],
      );
      return qGet(pool, 'SELECT * FROM crm_aktivitaeten WHERE id = ? LIMIT 1', [id]);
    },
    async listCrmWiedervorlageByFirma(firmaId, filters = {}) {
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
      sql += ' ORDER BY datum ASC, created_at ASC';
      return qAll(pool, sql, params);
    },
    async getCrmWiedervorlageById(id, firmaId) {
      const wid = typeof id === 'string' ? id.trim() : '';
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      if (!wid || !fid) return null;
      return qGet(pool, 'SELECT * FROM crm_wiedervorlage WHERE id = ? AND firma_id = ? LIMIT 1', [wid, fid]);
    },
    async insertCrmWiedervorlage(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const firmaId = typeof row.firmaId === 'string' && row.firmaId.trim() ? row.firmaId.trim() : '';
      const kundeId = typeof row.kundeId === 'string' && row.kundeId.trim() ? row.kundeId.trim() : '';
      const titel = row.titel != null ? String(row.titel) : '';
      const datum = typeof row.datum === 'string' && row.datum.trim() ? row.datum.trim() : '';
      if (!id || !firmaId || !kundeId || !datum) throw new Error('insertCrmWiedervorlage: Pflichtfelder fehlen');
      const status =
        typeof row.status === 'string' && row.status.trim() ? row.status.trim() : 'offen';
      const uid =
        row.userId != null && String(row.userId).trim() ? String(row.userId).trim() : null;
      await qRun(
        pool,
        `INSERT INTO crm_wiedervorlage (id, firma_id, kunde_id, titel, datum, status, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
        [id, firmaId, kundeId, titel, datum, status, uid],
      );
      return this.getCrmWiedervorlageById(id, firmaId);
    },
    async updateCrmWiedervorlage(id, firmaId, patch) {
      const cur = await this.getCrmWiedervorlageById(id, firmaId);
      if (!cur) return null;
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
      await qRun(pool, `UPDATE crm_wiedervorlage SET ${sets.join(', ')} WHERE id = ? AND firma_id = ?`, vals);
      return this.getCrmWiedervorlageById(id, firmaId);
    },
    async findValidRefreshTokenByHash(tokenHash) {
      const h = typeof tokenHash === 'string' ? tokenHash.trim() : '';
      if (!h) return null;
      return qGet(
        pool,
        `SELECT * FROM refresh_tokens
         WHERE token_hash = ?
           AND revoked_at IS NULL
           AND expires_at > UTC_TIMESTAMP(3)
         LIMIT 1`,
        [h],
      );
    },
    async insertRefreshToken(row) {
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
      const userId = typeof row.userId === 'string' && row.userId.trim() ? row.userId.trim() : '';
      const tokenHash =
        typeof row.tokenHash === 'string' && row.tokenHash.trim() ? row.tokenHash.trim() : '';
      const expiresAt =
        typeof row.expiresAt === 'string' && row.expiresAt.trim() ? row.expiresAt.trim() : '';
      if (!id || !userId || !tokenHash || !expiresAt) throw new Error('insertRefreshToken: Pflichtfelder fehlen');
      const deviceId =
        row.deviceId != null && String(row.deviceId).trim() ? String(row.deviceId).trim() : null;
      await qRun(
        pool,
        `INSERT INTO refresh_tokens (id, user_id, token_hash, device_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        [id, userId, tokenHash, deviceId, expiresAt],
      );
      return qGet(pool, 'SELECT * FROM refresh_tokens WHERE id = ? LIMIT 1', [id]);
    },
    async revokeRefreshTokenById(id) {
      const rid = typeof id === 'string' ? id.trim() : '';
      if (!rid) return false;
      await qRun(pool, `UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE id = ?`, [rid]);
      return true;
    },
    async userMayReportZeitForCcAuftrag(firmaId, userId, ccinternAuftragId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const uid = typeof userId === 'string' ? userId.trim() : '';
      const aid = typeof ccinternAuftragId === 'string' ? ccinternAuftragId.trim() : '';
      if (!fid || !uid || !aid) return false;
      const p = await qGet(
        pool,
        `SELECT 1 AS x FROM produktion_auftraege
         WHERE firma_id = ? AND auftrag_id = ? AND verantwortlich = ? LIMIT 1`,
        [fid, aid, uid],
      );
      if (p) return true;
      const a = await qGet(
        pool,
        `SELECT 1 AS x FROM aufgaben
         WHERE firma_id = ? AND auftrag_id = ? AND zugewiesen_an = ? LIMIT 1`,
        [fid, aid, uid],
      );
      if (a) return true;
      const auf = await this.getCcInternAuftragById(aid, fid);
      const bem = auf && auf.bemerkung != null ? String(auf.bemerkung) : '';
      return userReferencedInAnyWorkflowSchritt(bem, uid);
    },
    async insertCcinternMitarbeiterZeit(row) {
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
      await qRun(
        pool,
        `INSERT INTO ccintern_mitarbeiter_zeiten (id, user_id, firma_id, ccintern_auftrag_id, minuten, notiz, created_at)
         VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        [id, userId, firmaId, ccId, min, notiz],
      );
      return qGet(pool, 'SELECT * FROM ccintern_mitarbeiter_zeiten WHERE id = ? LIMIT 1', [id]);
    },
    async listAufgabenForAssignedUser(firmaId, userId) {
      const fid = typeof firmaId === 'string' ? firmaId.trim() : '';
      const uid = typeof userId === 'string' ? userId.trim() : '';
      if (!fid || !uid) return [];
      return qAll(
        pool,
        `SELECT a.id, a.titel, a.beschreibung, a.zugewiesen_an, a.auftrag_id, a.faellig_am,
                a.status, a.prioritaet, a.firma_id, a.erstellt_von, a.erstellt_am, a.aktualisiert_am,
                u.name AS zugewiesen_name
         FROM aufgaben a
         LEFT JOIN users u ON u.id = a.zugewiesen_an
         WHERE a.firma_id = ? AND a.zugewiesen_an = ?
         ORDER BY a.erstellt_am DESC`,
        [fid, uid],
      );
    },
    /**
     * Phase B4: FUSA-Quartalsaggregation (siehe SQLite `aggregateFusaQuartale`).
     * @param {{ jahr?: number, projectId?: string|null }} opts
     */
    async aggregateFusaQuartale(opts = {}) {
      const yRaw = opts.jahr != null ? Number(opts.jahr) : NaN;
      const y = Number.isFinite(yRaw) && yRaw >= 2000 && yRaw <= 2100 ? Math.floor(yRaw) : new Date().getFullYear();
      const pid =
        opts.projectId != null && String(opts.projectId).trim() ? String(opts.projectId).trim() : null;
      const rows = await qAll(
        pool,
        `SELECT
           QUARTER(DATE(COALESCE(r.rechnungsdatum, r.von, r.created_at))) AS qb,
           COUNT(DISTINCT CASE WHEN r.auftrag_id IS NOT NULL AND TRIM(COALESCE(r.auftrag_id,'')) != '' THEN r.auftrag_id END) AS auftraege,
           SUM(COALESCE(r.brutto, r.netto, 0)) AS umsatz
         FROM fusa_rechnungen r
         LEFT JOIN auftraege a ON r.auftrag_id = a.id
         WHERE COALESCE(r.rechnungsdatum, r.von, r.created_at) IS NOT NULL
           AND TRIM(COALESCE(r.rechnungsdatum, r.von, r.created_at)) != ''
           AND YEAR(DATE(COALESCE(r.rechnungsdatum, r.von, r.created_at))) = ?
           AND (? IS NULL OR (r.auftrag_id IS NOT NULL AND a.project_id = ?))
         GROUP BY qb`,
        [y, pid, pid],
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
