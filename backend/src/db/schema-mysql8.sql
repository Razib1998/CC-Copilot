-- CC Cockpit — MySQL 8 DDL (InnoDB, utf8mb4)
-- Abgeleitet aus backend/src/db/schema.sql (SQLite). Reihenfolge beachtet Fremdschlüssel.
--
-- Nutzung (Beispiel):
--   mysql -u root -p < schema-mysql8.sql
-- oder nach USE ihr_datenbankname;
--
-- Hinweise:
-- - IDs sind UUID-Strings (CHAR(36)), wie im Node-Backend.
-- - details_json: LONGTEXT; die App speichert JSON als Text (kein MySQL-JSON-Pflicht).
-- - project_invites: SQLite „partial unique“ → generierte Spalte pending_scope_key + UNIQUE.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1) users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NULL,
  global_role VARCHAR(32) NOT NULL DEFAULT 'INTERN',
  company_id CHAR(36) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'aktiv',
  soll INT NOT NULL DEFAULT 160,
  urlaub INT NOT NULL DEFAULT 28,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2) kunden
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kunden (
  id CHAR(36) NOT NULL,
  name VARCHAR(500) NOT NULL,
  ansprechpartner VARCHAR(500) NULL,
  telefon VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  adresse TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_kunden_name (name(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3) projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id CHAR(36) NOT NULL,
  name VARCHAR(500) NOT NULL,
  kunden_id CHAR(36) NULL,
  deadline VARCHAR(100) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_projects_created (created_at),
  KEY idx_projects_kunden (kunden_id),
  CONSTRAINT fk_projects_kunden
    FOREIGN KEY (kunden_id) REFERENCES kunden (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4) auftraege
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auftraege (
  id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  project_id CHAR(36) NULL,
  status VARCHAR(100) NULL,
  termin VARCHAR(100) NULL,
  termin_ende VARCHAR(100) NULL,
  fusa_original_id VARCHAR(64) NULL,
  fusa_kunde_id CHAR(36) NULL,
  fusa_fahrzeug_ids TEXT NULL,
  fusa_extra_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_auftraege_project (project_id),
  KEY idx_auftraege_created (created_at),
  CONSTRAINT fk_auftraege_project
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5) project_access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_access (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  role VARCHAR(32) NOT NULL,
  can_view_prices TINYINT(1) NOT NULL DEFAULT 0,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  can_create_auftraege TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_access_user_project (user_id, project_id),
  KEY idx_project_access_project (project_id),
  KEY idx_project_access_user (user_id),
  CONSTRAINT fk_project_access_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_project_access_project
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6) project_invites (partial unique via generated column)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_invites (
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
  pending_scope_key VARCHAR(900) GENERATED ALWAYS AS (
    CASE
      WHEN status = 'pending' THEN CONCAT(project_id, CHAR(31), LOWER(email))
      ELSE NULL
    END
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_invites_token (token),
  UNIQUE KEY uk_project_invites_pending_scope (pending_scope_key),
  KEY idx_project_invites_project (project_id),
  KEY idx_project_invites_status (status),
  CONSTRAINT fk_project_invites_project
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_project_invites_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7) angebote
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS angebote (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  titel VARCHAR(500) NOT NULL,
  angebotsnummer VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'entwurf',
  betrag_netto DECIMAL(14, 2) NULL,
  notiz TEXT NULL,
  erstellt_von CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_angebote_project (project_id),
  KEY idx_angebote_created (created_at),
  CONSTRAINT fk_angebote_project
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_angebote_erstellt_von
    FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8) fahrzeuge (FUSA)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fahrzeuge (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  kennung VARCHAR(255) NOT NULL,
  typ VARCHAR(500) NOT NULL,
  kennzeichen VARCHAR(100) NULL,
  status VARCHAR(100) NULL,
  details_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_fahrzeuge_project (project_id),
  KEY idx_fahrzeuge_created (created_at),
  CONSTRAINT fk_fahrzeuge_project
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_dokumente (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_angebote (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8b) fusa_belegungen (Fahrzeug-Zeitraum je Auftrag)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fusa_belegungen (
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
  CONSTRAINT fk_fusa_belegungen_project
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_fusa_belegungen_auftrag
    FOREIGN KEY (auftrag_id) REFERENCES auftraege (id) ON DELETE CASCADE,
  CONSTRAINT fk_fusa_belegungen_fahrzeug
    FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9) schaeden (FUSA)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schaeden (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  fahrzeug_id CHAR(36) NOT NULL,
  titel VARCHAR(500) NOT NULL,
  beschreibung TEXT NULL,
  status VARCHAR(100) NOT NULL DEFAULT 'offen',
  werkstatt_status VARCHAR(100) NOT NULL DEFAULT 'offen',
  bearbeitet_von CHAR(36) NULL,
  bearbeitet_am DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_schaeden_project (project_id),
  KEY idx_schaeden_fahrzeug (fahrzeug_id),
  KEY idx_schaeden_created (created_at),
  CONSTRAINT fk_schaeden_project
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_schaeden_fahrzeug
    FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge (id) ON DELETE CASCADE,
  CONSTRAINT fk_schaeden_bearbeitet_von
    FOREIGN KEY (bearbeitet_von) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 10) schaden_fotos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schaden_fotos (
  id CHAR(36) NOT NULL,
  schaden_id CHAR(36) NOT NULL,
  file_path VARCHAR(2000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_schaden_fotos_schaden (schaden_id),
  CONSTRAINT fk_schaden_fotos_schaden
    FOREIGN KEY (schaden_id) REFERENCES schaeden (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Globale Rollen & Rechte (nicht projektbezogen)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_modules (
  user_id CHAR(36) NOT NULL,
  module VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, module),
  CONSTRAINT fk_user_modules_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_rights (
  user_id CHAR(36) NOT NULL,
  module VARCHAR(32) NOT NULL,
  bereich VARCHAR(128) NOT NULL,
  rechte_json LONGTEXT NOT NULL,
  PRIMARY KEY (user_id, module, bereich),
  CONSTRAINT fk_user_rights_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  KEY idx_user_rights_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_templates (
  id CHAR(36) NOT NULL,
  name VARCHAR(500) NOT NULL,
  description TEXT NULL,
  modules_json LONGTEXT NOT NULL,
  rights_json LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS firmen (
  id CHAR(36) NOT NULL,
  name VARCHAR(500) NOT NULL,
  kundennummer VARCHAR(64) NULL,
  altnummer VARCHAR(128) NULL,
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
  erweiterung_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_firmen_kundennummer (kundennummer),
  KEY idx_firmen_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_kunden_extra (
  firma_id CHAR(36) NOT NULL,
  hinweis TEXT NULL,
  segment VARCHAR(255) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (firma_id),
  CONSTRAINT fk_fusa_kunden_extra_firma
    FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ccintern_kunden_extra (
  firma_id CHAR(36) NOT NULL,
  crm_status VARCHAR(255) NULL,
  betreuer VARCHAR(255) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (firma_id),
  CONSTRAINT fk_ccintern_kunden_extra_firma
    FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_invites (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  global_role VARCHAR(32) NOT NULL,
  modules_json LONGTEXT NOT NULL,
  areas_json LONGTEXT NOT NULL,
  rights_json LONGTEXT NOT NULL,
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
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_cockpit_invites_firma
    FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messeflow_workspace (
  id VARCHAR(32) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ccintern_auftraege (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ccintern_auftrag_kommentare (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ccintern_auftrag_dateien (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kalender_termine (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS urlaub_antraege (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lager_material (
  id CHAR(36) NOT NULL,
  name VARCHAR(500) NOT NULL,
  kategorie VARCHAR(100) NULL,
  menge DECIMAL(14,3) NOT NULL DEFAULT 0,
  einheit VARCHAR(32) NOT NULL,
  mindestbestand DECIMAL(14,3) NOT NULL DEFAULT 0,
  artikelnummer VARCHAR(255) NULL,
  lagerort VARCHAR(255) NULL,
  firma_id CHAR(36) NOT NULL,
  erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  aktualisiert_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_lager_material_firma (firma_id),
  KEY idx_lager_material_name (name),
  CONSTRAINT fk_lager_material_firma
    FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lager_buchungen (
  id CHAR(36) NOT NULL,
  material_id CHAR(36) NOT NULL,
  menge DECIMAL(14,3) NOT NULL,
  typ VARCHAR(32) NOT NULL,
  mitarbeiter_id CHAR(36) NULL,
  auftrag_id CHAR(36) NULL,
  bemerkung TEXT NULL,
  erstellt_am DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_lager_buchungen_material (material_id, erstellt_am),
  CONSTRAINT fk_lager_buchungen_material
    FOREIGN KEY (material_id) REFERENCES lager_material (id) ON DELETE CASCADE,
  CONSTRAINT fk_lager_buchungen_user
    FOREIGN KEY (mitarbeiter_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_lager_buchungen_auftrag
    FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ccintern_anfragen (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ccintern_angebote (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aufgaben (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ccintern_rechnungen (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mitarbeiter (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS checklisten (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS checklisten_eintraege (
  id CHAR(36) NOT NULL,
  checkliste_id CHAR(36) NOT NULL,
  text TEXT NOT NULL,
  erledigt TINYINT(1) NOT NULL DEFAULT 0,
  reihenfolge INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_checklisten_eintraege_liste (checkliste_id, reihenfolge),
  CONSTRAINT fk_checklisten_eintraege_liste
    FOREIGN KEY (checkliste_id) REFERENCES checklisten (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS produktion_auftraege (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messeflow_projekte (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messeflow_waende (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messeflow_wand_dateien (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase B3: Cockpit Geräte
CREATE TABLE IF NOT EXISTS geraete (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase B5: CC Intern CRM
CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_aktivitaeten (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_wiedervorlage (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase B6: Refresh-Token + Mitarbeiter-Zeiten
CREATE TABLE IF NOT EXISTS refresh_tokens (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ccintern_mitarbeiter_zeiten (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
