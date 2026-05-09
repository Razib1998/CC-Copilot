-- ============================================================
--  CC Werbung GmbH — Komplettes Datenbankschema v2
--  Stand: April 2026 | MariaDB 10.1+
--  Strato-Server kompatibel
--
--  Präfixe:
--    cockpit_  → Steuerzentrale
--    fusa_     → Operative Business-App Außendienst
--    cc_       → Internes Arbeitsmodul Büro
--
--  Hinweis: Keine FOREIGN KEY Constraints —
--  Referenzielle Integrität wird auf Anwendungsebene sichergestellt.
--  Dadurch keine Reihenfolge- oder Validierungsfehler beim Import.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS cc_werbung
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cc_werbung;


-- ============================================================
--  COCKPIT — Steuerzentrale
-- ============================================================

CREATE TABLE IF NOT EXISTS cockpit_users (
  id            INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255)     NOT NULL UNIQUE,
  name          VARCHAR(255)     NOT NULL,
  password_hash VARCHAR(255)     NOT NULL,
  avatar_url    VARCHAR(500)     DEFAULT NULL,
  status        ENUM('aktiv','gesperrt','eingeladen') NOT NULL DEFAULT 'aktiv',
  last_login    DATETIME         DEFAULT NULL,
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_roles (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL UNIQUE,
  label       VARCHAR(255)  NOT NULL,
  description TEXT          DEFAULT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_permissions (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  perm_key    VARCHAR(100)  NOT NULL UNIQUE,
  label       VARCHAR(255)  NOT NULL,
  module      VARCHAR(100)  NOT NULL COMMENT 'cockpit | fusa | cc_intern',
  description TEXT          DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_role_permissions (
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_user_roles (
  user_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_firms (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  short_name VARCHAR(100) DEFAULT NULL,
  email      VARCHAR(255) DEFAULT NULL,
  phone      VARCHAR(100) DEFAULT NULL,
  address    TEXT         DEFAULT NULL,
  status     ENUM('aktiv','inaktiv') NOT NULL DEFAULT 'aktiv',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_projects (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  firm_id     INT UNSIGNED DEFAULT NULL,
  customer_id INT UNSIGNED DEFAULT NULL,
  status      ENUM('aktiv','archiviert','inaktiv') NOT NULL DEFAULT 'aktiv',
  created_by  INT UNSIGNED DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_project_access (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  can_view   TINYINT(1)   NOT NULL DEFAULT 1,
  can_edit   TINYINT(1)   NOT NULL DEFAULT 0,
  can_create TINYINT(1)   NOT NULL DEFAULT 0,
  can_delete TINYINT(1)   NOT NULL DEFAULT 0,
  granted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_user (project_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_invitations (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  role_id     INT UNSIGNED DEFAULT NULL,
  project_id  INT UNSIGNED DEFAULT NULL,
  token       VARCHAR(255) NOT NULL UNIQUE,
  status      ENUM('offen','angenommen','abgelaufen','storniert') NOT NULL DEFAULT 'offen',
  invited_by  INT UNSIGNED DEFAULT NULL,
  expires_at  DATETIME     DEFAULT NULL,
  accepted_at DATETIME     DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_modules (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(100) NOT NULL UNIQUE,
  label      VARCHAR(255) NOT NULL,
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_module_access (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  module_id  INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED DEFAULT NULL,
  role_id    INT UNSIGNED DEFAULT NULL,
  can_access TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_devices (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  device_type VARCHAR(100) DEFAULT NULL,
  identifier  VARCHAR(255) DEFAULT NULL UNIQUE,
  user_id     INT UNSIGNED DEFAULT NULL,
  project_id  INT UNSIGNED DEFAULT NULL,
  status      ENUM('aktiv','inaktiv') NOT NULL DEFAULT 'aktiv',
  last_seen   DATETIME     DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_logs (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED DEFAULT NULL,
  action     VARCHAR(255) NOT NULL,
  module     VARCHAR(100) DEFAULT NULL,
  entity     VARCHAR(100) DEFAULT NULL,
  entity_id  VARCHAR(100) DEFAULT NULL,
  details    TEXT         DEFAULT NULL,
  ip_address VARCHAR(100) DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_messages (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  body        TEXT         NOT NULL,
  type        ENUM('info','warnung','fehler','erfolg') NOT NULL DEFAULT 'info',
  target_role INT UNSIGNED DEFAULT NULL,
  target_user INT UNSIGNED DEFAULT NULL,
  is_read     TINYINT(1)   NOT NULL DEFAULT 0,
  created_by  INT UNSIGNED DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cockpit_sessions (
  id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED  NOT NULL,
  refresh_token VARCHAR(500)  NOT NULL UNIQUE,
  ip_address    VARCHAR(100)  DEFAULT NULL,
  user_agent    TEXT          DEFAULT NULL,
  expires_at    DATETIME      NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  FUSA — Operative Business-App Außendienst
-- ============================================================

CREATE TABLE IF NOT EXISTS fusa_citys (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  short_name VARCHAR(10)  DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_betreiber (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL UNIQUE,
  short_name VARCHAR(100) DEFAULT NULL,
  email      VARCHAR(255) DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_depots (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL UNIQUE,
  city         VARCHAR(100) DEFAULT NULL,
  betreiber_id INT UNSIGNED DEFAULT NULL,
  email        VARCHAR(255) DEFAULT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_partner_modelle (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  modell_id   VARCHAR(100)  NOT NULL UNIQUE,
  label       VARCHAR(255)  NOT NULL,
  partner     VARCHAR(255)  DEFAULT NULL,
  cc_pct      DECIMAL(5,2)  NOT NULL DEFAULT 22.00,
  partner_pct DECIMAL(5,2)  NOT NULL DEFAULT 78.00,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_fahrzeugtypen (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE,
  label VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_pakete (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  fahrzeugtyp_id INT UNSIGNED  NOT NULL,
  city_id        INT UNSIGNED  NOT NULL,
  name           VARCHAR(255)  NOT NULL,
  preis          DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Verkaufspreis',
  netto          DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Betrag für Verkehrsbetrieb',
  gewinn         DECIMAL(10,2) AS (preis - netto) VIRTUAL COMMENT 'CC-Anteil (berechnet)',
  gueltig_von    DATE          DEFAULT NULL         COMMENT 'Preis gültig ab',
  gueltig_bis    DATE          DEFAULT NULL         COMMENT 'Preis gültig bis (NULL = unbegrenzt)',
  beschreibung   TEXT          DEFAULT NULL,
  UNIQUE KEY uq_paket_typ_city (fahrzeugtyp_id, name, city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_kunden (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kunden_nr    VARCHAR(100) DEFAULT NULL UNIQUE,
  firma        VARCHAR(255) DEFAULT NULL,
  ansprechpart VARCHAR(255) DEFAULT NULL,
  email        VARCHAR(255) DEFAULT NULL,
  telefon      VARCHAR(100) DEFAULT NULL,
  adresse      TEXT         DEFAULT NULL,
  plz          VARCHAR(20)  DEFAULT NULL,
  ort          VARCHAR(100) DEFAULT NULL,
  notiz        TEXT         DEFAULT NULL,
  project_id   INT UNSIGNED DEFAULT NULL,
  erstellt_von INT UNSIGNED DEFAULT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_fahrzeuge (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fz_nummer      VARCHAR(100) NOT NULL UNIQUE,
  kennzeichen    VARCHAR(100) DEFAULT NULL,
  fahrzeugtyp_id INT UNSIGNED DEFAULT NULL,
  subtyp         VARCHAR(255) DEFAULT NULL,
  baujahr        SMALLINT UNSIGNED DEFAULT NULL,
  ausmusterung   VARCHAR(50)  DEFAULT NULL,
  betreiber_id   INT UNSIGNED DEFAULT NULL,
  depot_id       INT UNSIGNED DEFAULT NULL,
  linie          VARCHAR(100) DEFAULT NULL,
  status         ENUM('frei','belegt','endet','schaden','geplant') NOT NULL DEFAULT 'frei',
  eigenwerbung   TINYINT(1)   NOT NULL DEFAULT 0,
  antrieb        VARCHAR(100) DEFAULT NULL,
  notiz          TEXT         DEFAULT NULL,
  qr_code        VARCHAR(500) DEFAULT NULL,
  project_id     INT UNSIGNED DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_fahrzeug_flaechen (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fahrzeug_id INT UNSIGNED NOT NULL,
  flaeche_typ VARCHAR(100) DEFAULT NULL,
  groesse_qm  DECIMAL(6,2) DEFAULT NULL,
  belegt      TINYINT(1)   NOT NULL DEFAULT 0,
  notiz       TEXT         DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_fahrzeug_fotos (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fahrzeug_id     INT UNSIGNED NOT NULL,
  dateiname       VARCHAR(500) NOT NULL,
  dateipfad       VARCHAR(1000) NOT NULL,
  foto_typ        VARCHAR(100) DEFAULT NULL,
  hochgeladen_von INT UNSIGNED DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_fahrzeug_historie (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fahrzeug_id INT UNSIGNED NOT NULL,
  aktion      VARCHAR(255) NOT NULL,
  details     TEXT         DEFAULT NULL,
  user_id     INT UNSIGNED DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_auftraege (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  auftrag_nr     VARCHAR(100)  DEFAULT NULL UNIQUE,
  titel          VARCHAR(255)  NOT NULL,
  kunde_id       INT UNSIGNED  DEFAULT NULL,
  project_id     INT UNSIGNED  DEFAULT NULL,
  fahrzeug_id    INT UNSIGNED  DEFAULT NULL,
  paket_id       INT UNSIGNED  DEFAULT NULL,
  partner_modell VARCHAR(100)  DEFAULT NULL,
  status         ENUM('offen','in_bearbeitung','abgeschlossen','storniert') NOT NULL DEFAULT 'offen',
  termin_start   DATE          DEFAULT NULL,
  termin_ende    DATE          DEFAULT NULL,
  laufzeit_pct   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  preis_brutto   DECIMAL(10,2) DEFAULT NULL,
  preis_netto    DECIMAL(10,2) DEFAULT NULL,
  pacht_partner  DECIMAL(10,2) DEFAULT NULL,
  pacht_cc       DECIMAL(10,2) DEFAULT NULL,
  notiz          TEXT          DEFAULT NULL,
  erstellt_von   INT UNSIGNED  DEFAULT NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_belegungen (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fahrzeug_id INT UNSIGNED NOT NULL,
  auftrag_id  INT UNSIGNED NOT NULL,
  datum_von   DATE         NOT NULL,
  datum_bis   DATE         NOT NULL,
  notiz       TEXT         DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_schaeden (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fahrzeug_id      INT UNSIGNED NOT NULL,
  auftrag_id       INT UNSIGNED DEFAULT NULL,
  schaden_typ      ENUM('eigen','fremd','unklar') NOT NULL DEFAULT 'unklar',
  beschreibung     TEXT         DEFAULT NULL,
  rep_status       ENUM('neu','geplant','dringend','anfrage','bestaetigt','inarbeit','behoben') NOT NULL DEFAULT 'neu',
  abrechnung       ENUM('nicht','potenziell','klaerung','vormerken','erstellt','versendet','bezahlt') NOT NULL DEFAULT 'nicht',
  depot_id         INT UNSIGNED DEFAULT NULL,
  werkstatt_termin DATE         DEFAULT NULL,
  gemeldet_von     INT UNSIGNED DEFAULT NULL,
  gemeldet_am      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  behoben_am       DATETIME     DEFAULT NULL,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_schaden_fotos (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  schaden_id      INT UNSIGNED  NOT NULL,
  dateiname       VARCHAR(500)  NOT NULL,
  dateipfad       VARCHAR(1000) NOT NULL,
  qr_upload       TINYINT(1)    NOT NULL DEFAULT 0,
  hochgeladen_von INT UNSIGNED  DEFAULT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_dokumente (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  auftrag_id   INT UNSIGNED  DEFAULT NULL,
  fahrzeug_id  INT UNSIGNED  DEFAULT NULL,
  kunde_id     INT UNSIGNED  DEFAULT NULL,
  dok_typ      VARCHAR(100)  DEFAULT NULL,
  dateiname    VARCHAR(500)  NOT NULL,
  dateipfad    VARCHAR(1000) NOT NULL,
  dateityp     VARCHAR(100)  DEFAULT NULL,
  groesse_kb   INT UNSIGNED  DEFAULT NULL,
  notiz        TEXT          DEFAULT NULL,
  erstellt_von INT UNSIGNED  DEFAULT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_termine (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  titel       VARCHAR(255) NOT NULL,
  beschreibung TEXT        DEFAULT NULL,
  auftrag_id  INT UNSIGNED DEFAULT NULL,
  fahrzeug_id INT UNSIGNED DEFAULT NULL,
  user_id     INT UNSIGNED DEFAULT NULL,
  termin_von  DATETIME     NOT NULL,
  termin_bis  DATETIME     DEFAULT NULL,
  ganztag     TINYINT(1)   NOT NULL DEFAULT 0,
  typ         VARCHAR(100) DEFAULT NULL,
  status      ENUM('offen','bestaetigt','erledigt','abgesagt') NOT NULL DEFAULT 'offen',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_rechnungen (
  id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  rechnungs_nr  VARCHAR(100)  DEFAULT NULL UNIQUE,
  auftrag_id    INT UNSIGNED  DEFAULT NULL,
  kunde_id      INT UNSIGNED  DEFAULT NULL,
  status        ENUM('angebot','erstellt','versendet','geplant','ueberfaellig','bezahlt') NOT NULL DEFAULT 'erstellt',
  netto         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  mwst_pct      DECIMAL(5,2)  NOT NULL DEFAULT 19.00,
  brutto        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  pacht_partner DECIMAL(10,2) DEFAULT NULL,
  pacht_cc      DECIMAL(10,2) DEFAULT NULL,
  faellig_am    DATE          DEFAULT NULL,
  bezahlt_am    DATE          DEFAULT NULL,
  notiz         TEXT          DEFAULT NULL,
  erstellt_von  INT UNSIGNED  DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_rechnungspositionen (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  rechnung_id INT UNSIGNED  NOT NULL,
  bezeichnung VARCHAR(500)  NOT NULL,
  menge       DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  einheit     VARCHAR(50)   DEFAULT 'Stk',
  einzelpreis DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  gesamtpreis DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  sort_order  INT UNSIGNED  NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fusa_quartalsabrechnung (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  quartal        TINYINT UNSIGNED NOT NULL COMMENT '1-4',
  jahr           SMALLINT UNSIGNED NOT NULL,
  betreiber_id   INT UNSIGNED  DEFAULT NULL,
  partner_modell VARCHAR(100)  DEFAULT NULL,
  umsatz_gesamt  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pacht_partner  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pacht_cc       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status         ENUM('offen','erstellt','versendet','bezahlt') NOT NULL DEFAULT 'offen',
  notiz          TEXT          DEFAULT NULL,
  erstellt_von   INT UNSIGNED  DEFAULT NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_quartal_betreiber (quartal, jahr, betreiber_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  CC INTERN — Internes Arbeitsmodul Büro
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_kunden (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kunden_nr    VARCHAR(100) DEFAULT NULL UNIQUE,
  firma        VARCHAR(255) DEFAULT NULL,
  ansprechpart VARCHAR(255) DEFAULT NULL,
  email        VARCHAR(255) DEFAULT NULL,
  telefon      VARCHAR(100) DEFAULT NULL,
  adresse      TEXT         DEFAULT NULL,
  plz          VARCHAR(20)  DEFAULT NULL,
  ort          VARCHAR(100) DEFAULT NULL,
  branche      VARCHAR(255) DEFAULT NULL,
  notiz        TEXT         DEFAULT NULL,
  project_id   INT UNSIGNED DEFAULT NULL,
  erstellt_von INT UNSIGNED DEFAULT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_crm (
  id                 INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  kunde_id           INT UNSIGNED  DEFAULT NULL,
  titel              VARCHAR(255)  NOT NULL,
  phase              ENUM('lead','kontaktiert','angebot','verhandlung','gewonnen','verloren') NOT NULL DEFAULT 'lead',
  wert               DECIMAL(12,2) DEFAULT NULL,
  wahrscheinlichkeit TINYINT UNSIGNED DEFAULT NULL,
  naechste_aktion    TEXT          DEFAULT NULL,
  naechstes_datum    DATE          DEFAULT NULL,
  notiz              TEXT          DEFAULT NULL,
  erstellt_von       INT UNSIGNED  DEFAULT NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_schnell_anfragen (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  anfrage_nr   VARCHAR(100) DEFAULT NULL UNIQUE,
  kunde_id     INT UNSIGNED DEFAULT NULL,
  betreff      VARCHAR(255) NOT NULL,
  beschreibung TEXT         DEFAULT NULL,
  status       ENUM('neu','in_bearbeitung','angebot_erstellt','erledigt','abgesagt') NOT NULL DEFAULT 'neu',
  prioritaet   ENUM('niedrig','normal','hoch','dringend') NOT NULL DEFAULT 'normal',
  erstellt_von INT UNSIGNED DEFAULT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_angebote (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  angebots_nr  VARCHAR(100)  DEFAULT NULL UNIQUE,
  titel        VARCHAR(255)  NOT NULL,
  kunde_id     INT UNSIGNED  DEFAULT NULL,
  anfrage_id   INT UNSIGNED  DEFAULT NULL,
  project_id   INT UNSIGNED  DEFAULT NULL,
  status       ENUM('entwurf','versendet','angenommen','abgelehnt','abgelaufen') NOT NULL DEFAULT 'entwurf',
  gueltig_bis  DATE          DEFAULT NULL,
  netto        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  mwst_pct     DECIMAL(5,2)  NOT NULL DEFAULT 19.00,
  brutto       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  notiz        TEXT          DEFAULT NULL,
  erstellt_von INT UNSIGNED  DEFAULT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_angebotspositionen (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  angebot_id  INT UNSIGNED  NOT NULL,
  bezeichnung VARCHAR(500)  NOT NULL,
  menge       DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  einheit     VARCHAR(50)   DEFAULT 'Stk',
  einzelpreis DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  gesamtpreis DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  sort_order  INT UNSIGNED  NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_auftraege (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  auftrags_nr  VARCHAR(100)  DEFAULT NULL UNIQUE,
  titel        VARCHAR(255)  NOT NULL,
  kunde_id     INT UNSIGNED  DEFAULT NULL,
  angebot_id   INT UNSIGNED  DEFAULT NULL,
  project_id   INT UNSIGNED  DEFAULT NULL,
  status       ENUM('neu','in_bearbeitung','produktion','abgeschlossen','storniert') NOT NULL DEFAULT 'neu',
  prioritaet   ENUM('niedrig','normal','hoch','dringend') NOT NULL DEFAULT 'normal',
  termin_start DATE          DEFAULT NULL,
  termin_ende  DATE          DEFAULT NULL,
  netto        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  brutto       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  notiz        TEXT          DEFAULT NULL,
  erstellt_von INT UNSIGNED  DEFAULT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_auftragspositionen (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  auftrag_id  INT UNSIGNED  NOT NULL,
  bezeichnung VARCHAR(500)  NOT NULL,
  menge       DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  einheit     VARCHAR(50)   DEFAULT 'Stk',
  einzelpreis DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  gesamtpreis DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  sort_order  INT UNSIGNED  NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_messe_projekte (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  projekt_nr   VARCHAR(100)  DEFAULT NULL UNIQUE,
  name         VARCHAR(255)  NOT NULL,
  messe        VARCHAR(255)  DEFAULT NULL,
  ort          VARCHAR(255)  DEFAULT NULL,
  datum_von    DATE          DEFAULT NULL,
  datum_bis    DATE          DEFAULT NULL,
  kunde_id     INT UNSIGNED  DEFAULT NULL,
  status       ENUM('planung','bestaetigt','aufbau','aktiv','abbau','abgeschlossen','storniert') NOT NULL DEFAULT 'planung',
  budget       DECIMAL(12,2) DEFAULT NULL,
  notiz        TEXT          DEFAULT NULL,
  erstellt_von INT UNSIGNED  DEFAULT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_produktion (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  auftrag_id   INT UNSIGNED DEFAULT NULL,
  titel        VARCHAR(255) NOT NULL,
  beschreibung TEXT         DEFAULT NULL,
  kanban_phase ENUM('backlog','planung','produktion','pruefung','fertig','ausgeliefert') NOT NULL DEFAULT 'backlog',
  prioritaet   ENUM('niedrig','normal','hoch','dringend') NOT NULL DEFAULT 'normal',
  faellig_am   DATE         DEFAULT NULL,
  zugewiesen   INT UNSIGNED DEFAULT NULL,
  sort_order   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_materialkategorien (
  id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_materiallager (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  artikel_nr     VARCHAR(100)  DEFAULT NULL UNIQUE,
  bezeichnung    VARCHAR(255)  NOT NULL,
  kategorie_id   INT UNSIGNED  DEFAULT NULL,
  einheit        VARCHAR(50)   DEFAULT 'Stk',
  bestand        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  mindestbestand DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  lagerort       VARCHAR(255)  DEFAULT NULL,
  lieferant      VARCHAR(255)  DEFAULT NULL,
  preis_ek       DECIMAL(10,2) DEFAULT NULL,
  notiz          TEXT          DEFAULT NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_materialbestellungen (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  bestell_nr   VARCHAR(100)  DEFAULT NULL UNIQUE,
  material_id  INT UNSIGNED  DEFAULT NULL,
  menge        DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  preis        DECIMAL(10,2) DEFAULT NULL,
  lieferant    VARCHAR(255)  DEFAULT NULL,
  status       ENUM('geplant','bestellt','geliefert','storniert') NOT NULL DEFAULT 'geplant',
  bestellt_am  DATE          DEFAULT NULL,
  geliefert_am DATE          DEFAULT NULL,
  notiz        TEXT          DEFAULT NULL,
  erstellt_von INT UNSIGNED  DEFAULT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_checklisten (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  beschreibung TEXT         DEFAULT NULL,
  typ          VARCHAR(100) DEFAULT NULL,
  erstellt_von INT UNSIGNED DEFAULT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_checklisten_punkte (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  checkliste_id INT UNSIGNED NOT NULL,
  text          VARCHAR(500) NOT NULL,
  pflichtpunkt  TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order    INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_checklisten_eintraege (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  checkliste_id INT UNSIGNED NOT NULL,
  auftrag_id    INT UNSIGNED DEFAULT NULL,
  punkt_id      INT UNSIGNED NOT NULL,
  erledigt      TINYINT(1)   NOT NULL DEFAULT 0,
  notiz         TEXT         DEFAULT NULL,
  erledigt_von  INT UNSIGNED DEFAULT NULL,
  erledigt_am   DATETIME     DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_kalender (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  titel        VARCHAR(255) NOT NULL,
  beschreibung TEXT         DEFAULT NULL,
  termin_von   DATETIME     NOT NULL,
  termin_bis   DATETIME     DEFAULT NULL,
  ganztag      TINYINT(1)   NOT NULL DEFAULT 0,
  typ          VARCHAR(100) DEFAULT NULL,
  auftrag_id   INT UNSIGNED DEFAULT NULL,
  user_id      INT UNSIGNED DEFAULT NULL,
  status       ENUM('offen','bestaetigt','erledigt','abgesagt') NOT NULL DEFAULT 'offen',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_mitarbeiter (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED DEFAULT NULL,
  personalnummer VARCHAR(100) DEFAULT NULL UNIQUE,
  vorname        VARCHAR(255) NOT NULL,
  nachname       VARCHAR(255) NOT NULL,
  email          VARCHAR(255) DEFAULT NULL,
  telefon        VARCHAR(100) DEFAULT NULL,
  position       VARCHAR(255) DEFAULT NULL,
  abteilung      VARCHAR(255) DEFAULT NULL,
  eintrittsdatum DATE         DEFAULT NULL,
  austrittsdatum DATE         DEFAULT NULL,
  verfuegbar     TINYINT(1)   NOT NULL DEFAULT 1,
  notiz          TEXT         DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_urlaub (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mitarbeiter_id INT UNSIGNED NOT NULL,
  datum_von      DATE         NOT NULL,
  datum_bis      DATE         NOT NULL,
  tage           DECIMAL(4,1) NOT NULL DEFAULT 1.0,
  typ            ENUM('urlaub','krank','sonderurlaub','fortbildung','sonstiges') NOT NULL DEFAULT 'urlaub',
  status         ENUM('beantragt','genehmigt','abgelehnt','storniert') NOT NULL DEFAULT 'beantragt',
  genehmigt_von  INT UNSIGNED DEFAULT NULL,
  genehmigt_am   DATETIME     DEFAULT NULL,
  notiz          TEXT         DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_rechnungen (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  rechnungs_nr   VARCHAR(100)  DEFAULT NULL UNIQUE,
  auftrag_id     INT UNSIGNED  DEFAULT NULL,
  kunde_id       INT UNSIGNED  DEFAULT NULL,
  status         ENUM('entwurf','in_lexware_queue','exportiert','archiviert') NOT NULL DEFAULT 'entwurf',
  netto          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  mwst_pct       DECIMAL(5,2)  NOT NULL DEFAULT 19.00,
  brutto         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  faellig_am     DATE          DEFAULT NULL,
  bezahlt_am     DATE          DEFAULT NULL,
  lexware_export DATETIME      DEFAULT NULL,
  notiz          TEXT          DEFAULT NULL,
  erstellt_von   INT UNSIGNED  DEFAULT NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  SEED DATEN
-- ============================================================

INSERT INTO cockpit_roles (name, label, description) VALUES
  ('admin',       'Administrator', 'Vollzugriff auf alle Bereiche'),
  ('manager',     'Manager',       'Verwaltung von Projekten und Aufträgen'),
  ('mitarbeiter', 'Mitarbeiter',   'Operativer Zugriff auf FUSA und CC Intern'),
  ('monteur',     'Monteur',       'Mobile Ansicht, QR-Scan, Schäden melden'),
  ('readonly',    'Nur Lesen',     'Lesezugriff ohne Bearbeitungsrechte');

INSERT INTO cockpit_permissions (perm_key, label, module) VALUES
  ('admin.users',          'Benutzer verwalten',         'cockpit'),
  ('admin.roles',          'Rollen verwalten',           'cockpit'),
  ('admin.invitations',    'Einladungen verwalten',      'cockpit'),
  ('admin.projekte',       'Projekte anlegen',           'cockpit'),
  ('admin.firmen',         'Firmen verwalten',           'cockpit'),
  ('admin.module',         'Module steuern',             'cockpit'),
  ('admin.logs',           'Logs einsehen',              'cockpit'),
  ('fusa.kunden.view',     'Kunden anzeigen (FUSA)',     'fusa'),
  ('fusa.kunden.edit',     'Kunden bearbeiten (FUSA)',   'fusa'),
  ('fusa.auftraege.view',  'Aufträge anzeigen (FUSA)',   'fusa'),
  ('fusa.auftraege.edit',  'Aufträge bearbeiten (FUSA)', 'fusa'),
  ('fusa.fahrzeuge.view',  'Fahrzeuge anzeigen',         'fusa'),
  ('fusa.fahrzeuge.edit',  'Fahrzeuge bearbeiten',       'fusa'),
  ('fusa.schaeden.view',   'Schäden anzeigen',           'fusa'),
  ('fusa.schaeden.edit',   'Schäden bearbeiten',         'fusa'),
  ('fusa.rechnungen.view', 'Rechnungen anzeigen (FUSA)', 'fusa'),
  ('fusa.rechnungen.edit', 'Rechnungen bearbeiten(FUSA)','fusa'),
  ('cc.auftraege.view',    'Aufträge anzeigen (CC)',     'cc_intern'),
  ('cc.auftraege.edit',    'Aufträge bearbeiten (CC)',   'cc_intern'),
  ('cc.angebote.view',     'Angebote anzeigen (CC)',     'cc_intern'),
  ('cc.angebote.edit',     'Angebote bearbeiten (CC)',   'cc_intern'),
  ('cc.produktion.view',   'Produktion anzeigen',        'cc_intern'),
  ('cc.produktion.edit',   'Produktion bearbeiten',      'cc_intern'),
  ('cc.mitarbeiter.view',  'Mitarbeiter anzeigen',       'cc_intern'),
  ('cc.urlaub.edit',       'Urlaub beantragen',          'cc_intern'),
  ('cc.urlaub.approve',    'Urlaub genehmigen',          'cc_intern'),
  ('module.fusa',          'FUSA-Modul zugreifen',       'cockpit'),
  ('module.ccintern',      'CC Intern zugreifen',        'cockpit');

INSERT INTO cockpit_modules (module_key, label, active, sort_order) VALUES
  ('cockpit',   'Cockpit',   1, 1),
  ('fusa',      'FUSA',      1, 2),
  ('cc_intern', 'CC Intern', 1, 3);

INSERT INTO cockpit_firms (name, short_name, email) VALUES
  ('CC Werbung GmbH', 'CC', 'info@cc-werbung.de');

INSERT INTO fusa_citys (name, short_name) VALUES
  ('Essen',   'E'),
  ('Mülheim', 'MH');

INSERT INTO fusa_betreiber (name, short_name, email) VALUES
  ('Ruhrbahn Essen',   'Ruhrbahn', 'info@ruhrbahn.de'),
  ('Bogestra AG',      'Bogestra',  'info@bogestra.de'),
  ('DVG Duisburg',     'DVG',       'info@dvg-duisburg.de'),
  ('Stadtwerke Essen', 'SWE',       'info@stadtwerke-essen.de'),
  ('Sonstiger',        '-',         NULL);

INSERT INTO fusa_depots (name, city, betreiber_id, email) VALUES
  ('Essen Econova-Alee',    'Essen',   1, 'werkstatt.econova@ruhrbahn.de'),
  ('Essen Rurhallee',       'Essen',   1, 'werkstatt.rurhallee@ruhrbahn.de'),
  ('Essen Schweriner Str.', 'Essen',   1, 'werkstatt.schweriner@ruhrbahn.de'),
  ('Essen Stadtmitte',      'Essen',   1, 'werkstatt.stadtmitte@ruhrbahn.de'),
  ('Mülheim Duisburgerstr.','Mülheim', 1, 'werkstatt.muelheim@ruhrbahn.de');

INSERT INTO fusa_partner_modelle (modell_id, label, partner, cc_pct, partner_pct) VALUES
  ('modell-ruhrbahn', 'Ruhrbahn Standard',  'Ruhrbahn',  22.00, 78.00),
  ('modell-dvg',      'DVG Duisburg',        'DVG',       22.00, 78.00),
  ('modell-bogestra', 'Bogestra',            'Bogestra',  25.00, 75.00),
  ('modell-eigen',    'Eigenvermarktung CC', '—',        100.00,  0.00);

INSERT INTO fusa_fahrzeugtypen (id, name, label) VALUES
  (1, 'Solobus',            'Solobus'),
  (2, 'Gelenkbus',          'Gelenkbus'),
  (3, 'U-Bahn 8 Achsen',    'U-Bahn (8 Achsen)'),
  (4, 'Stadtbahn 8 Achsen', 'Stadtbahn (8 Achsen)');

-- Pakete + Preise: Essen (city_id=1)
INSERT INTO fusa_pakete (fahrzeugtyp_id, city_id, name, preis, netto, gueltig_von) VALUES
  (1, 1, 'Teilgestaltung ohne Heck',                   680.00, 0.00, '2026-01-01'),
  (1, 1, 'Teilgestaltung',                             820.00, 0.00, '2026-01-01'),
  (1, 1, 'Teilgestaltung + Dachkranz',                 980.00, 0.00, '2026-01-01'),
  (1, 1, 'Teilgestaltung + Dachkranz Beschrift.',     1050.00, 0.00, '2026-01-01'),
  (1, 1, 'Ganzgestaltung',                            1420.00, 0.00, '2026-01-01'),
  (1, 1, 'Heck Vollbeschriftung',                      380.00, 0.00, '2026-01-01'),
  (1, 1, 'Heckfläche',                                 280.00, 0.00, '2026-01-01'),
  (1, 1, 'Traffic Banner Paket (3 Traffic Banner)',     520.00, 0.00, '2026-01-01'),
  (2, 1, 'Teilgestaltung ohne Heck',                   680.00, 0.00, '2026-01-01'),
  (2, 1, 'Teilgestaltung',                             820.00, 0.00, '2026-01-01'),
  (2, 1, 'Teilgestaltung + Dachkranz',                 980.00, 0.00, '2026-01-01'),
  (2, 1, 'Teilgestaltung + Dachkranz Beschrift.',     1050.00, 0.00, '2026-01-01'),
  (2, 1, 'Ganzgestaltung',                            1420.00, 0.00, '2026-01-01'),
  (2, 1, 'Ganzgestaltung + Fenster',                  1780.00, 0.00, '2026-01-01'),
  (2, 1, 'Heck Vollbeschriftung',                      380.00, 0.00, '2026-01-01'),
  (2, 1, 'Heckfläche',                                 280.00, 0.00, '2026-01-01'),
  (2, 1, 'Traffic Banner Paket (3 Traffic Banner)',     520.00, 0.00, '2026-01-01'),
  (3, 1, 'Teilgestaltung',                             820.00, 0.00, '2026-01-01'),
  (3, 1, 'Ganzgestaltung',                            1420.00, 0.00, '2026-01-01'),
  (3, 1, 'Ganzgestaltung + Fenster',                  1780.00, 0.00, '2026-01-01'),
  (3, 1, 'Trafficboard 2 qm',                          290.00, 0.00, '2026-01-01'),
  (3, 1, 'Trafficboard 4 qm',                          420.00, 0.00, '2026-01-01'),
  (3, 1, 'Trafficboard 9 qm',                          680.00, 0.00, '2026-01-01'),
  (4, 1, 'Teilgestaltung',                             820.00, 0.00, '2026-01-01'),
  (4, 1, 'Ganzgestaltung',                            1420.00, 0.00, '2026-01-01'),
  (4, 1, 'Ganzgestaltung + Fenster',                  1780.00, 0.00, '2026-01-01'),
  (4, 1, 'Trafficboard 2 qm',                          290.00, 0.00, '2026-01-01'),
  (4, 1, 'Trafficboard 4 qm',                          420.00, 0.00, '2026-01-01'),
  (4, 1, 'Trafficboard 9 qm',                          680.00, 0.00, '2026-01-01');

-- Pakete + Preise: Mülheim (city_id=2) — Preise identisch als Ausgangswert, bitte anpassen
INSERT INTO fusa_pakete (fahrzeugtyp_id, city_id, name, preis, netto, gueltig_von) VALUES
  (1, 2, 'Teilgestaltung ohne Heck',                   680.00, 0.00, '2026-01-01'),
  (1, 2, 'Teilgestaltung',                             820.00, 0.00, '2026-01-01'),
  (1, 2, 'Teilgestaltung + Dachkranz',                 980.00, 0.00, '2026-01-01'),
  (1, 2, 'Teilgestaltung + Dachkranz Beschrift.',     1050.00, 0.00, '2026-01-01'),
  (1, 2, 'Ganzgestaltung',                            1420.00, 0.00, '2026-01-01'),
  (1, 2, 'Heck Vollbeschriftung',                      380.00, 0.00, '2026-01-01'),
  (1, 2, 'Heckfläche',                                 280.00, 0.00, '2026-01-01'),
  (1, 2, 'Traffic Banner Paket (3 Traffic Banner)',     520.00, 0.00, '2026-01-01'),
  (2, 2, 'Teilgestaltung ohne Heck',                   680.00, 0.00, '2026-01-01'),
  (2, 2, 'Teilgestaltung',                             820.00, 0.00, '2026-01-01'),
  (2, 2, 'Teilgestaltung + Dachkranz',                 980.00, 0.00, '2026-01-01'),
  (2, 2, 'Teilgestaltung + Dachkranz Beschrift.',     1050.00, 0.00, '2026-01-01'),
  (2, 2, 'Ganzgestaltung',                            1420.00, 0.00, '2026-01-01'),
  (2, 2, 'Ganzgestaltung + Fenster',                  1780.00, 0.00, '2026-01-01'),
  (2, 2, 'Heck Vollbeschriftung',                      380.00, 0.00, '2026-01-01'),
  (2, 2, 'Heckfläche',                                 280.00, 0.00, '2026-01-01'),
  (2, 2, 'Traffic Banner Paket (3 Traffic Banner)',     520.00, 0.00, '2026-01-01'),
  (3, 2, 'Teilgestaltung',                             820.00, 0.00, '2026-01-01'),
  (3, 2, 'Ganzgestaltung',                            1420.00, 0.00, '2026-01-01'),
  (3, 2, 'Ganzgestaltung + Fenster',                  1780.00, 0.00, '2026-01-01'),
  (3, 2, 'Trafficboard 2 qm',                          290.00, 0.00, '2026-01-01'),
  (3, 2, 'Trafficboard 4 qm',                          420.00, 0.00, '2026-01-01'),
  (3, 2, 'Trafficboard 9 qm',                          680.00, 0.00, '2026-01-01'),
  (4, 2, 'Teilgestaltung',                             820.00, 0.00, '2026-01-01'),
  (4, 2, 'Ganzgestaltung',                            1420.00, 0.00, '2026-01-01'),
  (4, 2, 'Ganzgestaltung + Fenster',                  1780.00, 0.00, '2026-01-01'),
  (4, 2, 'Trafficboard 2 qm',                          290.00, 0.00, '2026-01-01'),
  (4, 2, 'Trafficboard 4 qm',                          420.00, 0.00, '2026-01-01'),
  (4, 2, 'Trafficboard 9 qm',                          680.00, 0.00, '2026-01-01');

INSERT INTO cc_materialkategorien (name) VALUES
  ('Folien'),
  ('Druckmaterial'),
  ('Befestigungsmaterial'),
  ('Werkzeug'),
  ('Reinigung'),
  ('Sonstiges');


-- ============================================================
--  INDIZES
-- ============================================================

CREATE INDEX idx_fusa_fahrzeuge_status    ON fusa_fahrzeuge(status);
CREATE INDEX idx_fusa_fahrzeuge_betreiber ON fusa_fahrzeuge(betreiber_id);
CREATE INDEX idx_fusa_fahrzeuge_depot     ON fusa_fahrzeuge(depot_id);
CREATE INDEX idx_fusa_auftraege_status    ON fusa_auftraege(status);
CREATE INDEX idx_fusa_auftraege_kunde     ON fusa_auftraege(kunde_id);
CREATE INDEX idx_fusa_schaeden_status     ON fusa_schaeden(rep_status);
CREATE INDEX idx_fusa_rechnungen_status   ON fusa_rechnungen(status);
CREATE INDEX idx_fusa_pakete_city         ON fusa_pakete(city_id);
CREATE INDEX idx_cc_auftraege_status      ON cc_auftraege(status);
CREATE INDEX idx_cc_crm_phase             ON cc_crm(phase);
CREATE INDEX idx_cc_produktion_phase      ON cc_produktion(kanban_phase);
CREATE INDEX idx_cockpit_logs_created     ON cockpit_logs(created_at);
CREATE INDEX idx_cockpit_sessions_expires ON cockpit_sessions(expires_at);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  FERTIG — cc_werbung Datenbank
--  55 Tabellen | Cockpit: 12 | FUSA: 21 | CC Intern: 18 | Seed: 4 | Idx: 4
--  Keine Foreign Key Constraints
--  Mülheim-Preise (netto) bitte manuell anpassen:
--  UPDATE fusa_pakete SET netto = X WHERE city_id = 2 AND name = '...';
-- ============================================================
