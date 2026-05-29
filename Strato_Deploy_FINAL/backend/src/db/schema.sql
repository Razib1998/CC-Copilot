-- Phase 2: Auth
-- Phase 3: Ressourcen users (bestehend), projects, auftraege

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT,
  global_role TEXT NOT NULL DEFAULT 'INTERN',
  company_id TEXT,
  status TEXT NOT NULL DEFAULT 'aktiv',
  soll INTEGER NOT NULL DEFAULT 160,
  urlaub INTEGER NOT NULL DEFAULT 28,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Phase 16: Kunden (CRM-Basis)

CREATE TABLE IF NOT EXISTS kunden (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ansprechpartner TEXT,
  telefon TEXT,
  email TEXT,
  adresse TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kunden_name ON kunden (name);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kunden_id TEXT,
  deadline TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (kunden_id) REFERENCES kunden (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_created ON projects (created_at);

CREATE TABLE IF NOT EXISTS auftraege (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  project_id TEXT,
  status TEXT,
  termin TEXT,
  termin_ende TEXT,
  fusa_original_id TEXT,
  fusa_kunde_id TEXT,
  fusa_fahrzeug_ids TEXT,
  fusa_extra_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auftraege_project ON auftraege (project_id);
CREATE INDEX IF NOT EXISTS idx_auftraege_created ON auftraege (created_at);

-- Phase 12: Fahrzeuge (projektgebunden, FUSA)

CREATE TABLE IF NOT EXISTS fahrzeuge (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kennung TEXT NOT NULL,
  typ TEXT NOT NULL,
  kennzeichen TEXT,
  status TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fahrzeuge_project ON fahrzeuge (project_id);
CREATE INDEX IF NOT EXISTS idx_fahrzeuge_created ON fahrzeuge (created_at);

-- FUSA: persistente Fahrzeugbelegung je Auftrag (Source of Truth für Verfügbarkeit)
CREATE TABLE IF NOT EXISTS fusa_belegungen (
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
);

CREATE INDEX IF NOT EXISTS idx_fusa_belegungen_project ON fusa_belegungen (project_id);
CREATE INDEX IF NOT EXISTS idx_fusa_belegungen_fz ON fusa_belegungen (project_id, fahrzeug_id, startdatum, enddatum);

-- Phase 13: Schäden (FUSA, Projekt + Fahrzeug)

CREATE TABLE IF NOT EXISTS schaeden (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  fahrzeug_id TEXT NOT NULL,
  titel TEXT NOT NULL,
  beschreibung TEXT,
  status TEXT NOT NULL DEFAULT 'offen',
  werkstatt_status TEXT NOT NULL DEFAULT 'offen',
  bearbeitet_von TEXT,
  bearbeitet_am TEXT,
  extra_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge (id) ON DELETE CASCADE,
  FOREIGN KEY (bearbeitet_von) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_schaeden_project ON schaeden (project_id);
CREATE INDEX IF NOT EXISTS idx_schaeden_fahrzeug ON schaeden (fahrzeug_id);
CREATE INDEX IF NOT EXISTS idx_schaeden_created ON schaeden (created_at);

-- Phase 14: Schaden-Fotos (Dateipfad, kein Blob in DB)

CREATE TABLE IF NOT EXISTS schaden_fotos (
  id TEXT PRIMARY KEY,
  schaden_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (schaden_id) REFERENCES schaeden (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schaden_fotos_schaden ON schaden_fotos (schaden_id);

-- Phase 17: Angebote (Projekt + Kunde über Projekt)

CREATE TABLE IF NOT EXISTS angebote (
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
);

CREATE INDEX IF NOT EXISTS idx_angebote_project ON angebote (project_id);
CREATE INDEX IF NOT EXISTS idx_angebote_created ON angebote (created_at);

-- Phase 5: projektbezogene Rechte (keine globalen Rollen)

CREATE TABLE IF NOT EXISTS project_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL,
  can_view_prices INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_create_auftraege INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  UNIQUE (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_access_project ON project_access (project_id);
CREATE INDEX IF NOT EXISTS idx_project_access_user ON project_access (user_id);

-- Phase 6: projektbezogene Einladungen (vor Annahme getrennt von project_access)

CREATE TABLE IF NOT EXISTS project_invites (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  can_view_prices INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_create_auftraege INTEGER NOT NULL DEFAULT 0,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id TEXT,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_invites_token ON project_invites (token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_invites_pending_project_email
  ON project_invites (project_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_project_invites_project ON project_invites (project_id);
CREATE INDEX IF NOT EXISTS idx_project_invites_status ON project_invites (status);

-- Globale Rollen & Rechte (nicht projektbezogen)

CREATE TABLE IF NOT EXISTS user_modules (
  user_id TEXT NOT NULL,
  module TEXT NOT NULL,
  PRIMARY KEY (user_id, module),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_rights (
  user_id TEXT NOT NULL,
  module TEXT NOT NULL,
  bereich TEXT NOT NULL,
  rechte_json TEXT NOT NULL,
  PRIMARY KEY (user_id, module, bereich),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_rights_user ON user_rights (user_id);

CREATE TABLE IF NOT EXISTS role_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  modules_json TEXT NOT NULL DEFAULT '[]',
  rights_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cockpit: Firmen (eigene Entität, unabhängig von Projekten)

CREATE TABLE IF NOT EXISTS firmen (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kundennummer TEXT,
  altnummer TEXT,
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
  erweiterung_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fusa_kunden_extra (
  firma_id TEXT PRIMARY KEY,
  hinweis TEXT,
  segment TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ccintern_kunden_extra (
  firma_id TEXT PRIMARY KEY,
  crm_status TEXT,
  betreuer TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cockpit_invites (
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
);

CREATE INDEX IF NOT EXISTS idx_cockpit_invites_status ON cockpit_invites (status);

-- MesseFlow: gemeinsamer Arbeitsbereich (JSON), z. B. nach Excel-Import persistieren
CREATE TABLE IF NOT EXISTS messeflow_workspace (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Server-seitiges Audit (Schreibaktionen); keine FK — historische user_id bleibt erhalten
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  ts TEXT NOT NULL,
  user_id TEXT,
  modul TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  project_id TEXT,
  payload_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_project ON audit_log(project_id);

-- CC Intern: Auftragsverwaltung (mandantenfähig)
CREATE TABLE IF NOT EXISTS ccintern_auftraege (
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
);

CREATE INDEX IF NOT EXISTS idx_ccintern_auftraege_firma ON ccintern_auftraege (firma_id);
CREATE INDEX IF NOT EXISTS idx_ccintern_auftraege_erstellt ON ccintern_auftraege (erstellt_am);

CREATE TABLE IF NOT EXISTS ccintern_auftrag_kommentare (
  id TEXT PRIMARY KEY,
  auftrag_id TEXT NOT NULL,
  text TEXT NOT NULL,
  autor_id TEXT,
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE CASCADE,
  FOREIGN KEY (autor_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ccintern_auftrag_kommentare_auftrag
  ON ccintern_auftrag_kommentare (auftrag_id, erstellt_am);

CREATE TABLE IF NOT EXISTS ccintern_auftrag_dateien (
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
  updated_at TEXT,
  FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ccintern_auftrag_dateien_auftrag
  ON ccintern_auftrag_dateien (auftrag_id, created_at);

-- Gemeinsamer Kalender (Cockpit + CC Intern + FUSA)
CREATE TABLE IF NOT EXISTS kalender_termine (
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
);

CREATE INDEX IF NOT EXISTS idx_kalender_termine_firma ON kalender_termine (firma_id);
CREATE INDEX IF NOT EXISTS idx_kalender_termine_start ON kalender_termine (start);

-- CC Intern: Urlaub
CREATE TABLE IF NOT EXISTS urlaub_antraege (
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
);

CREATE INDEX IF NOT EXISTS idx_urlaub_antraege_firma ON urlaub_antraege (firma_id);
CREATE INDEX IF NOT EXISTS idx_urlaub_antraege_mitarbeiter ON urlaub_antraege (mitarbeiter_id);

-- Lagerverwaltung
CREATE TABLE IF NOT EXISTS lager_material (
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
);

CREATE INDEX IF NOT EXISTS idx_lager_material_firma ON lager_material (firma_id);
CREATE INDEX IF NOT EXISTS idx_lager_material_name ON lager_material (name);

CREATE TABLE IF NOT EXISTS lager_buchungen (
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
);

CREATE INDEX IF NOT EXISTS idx_lager_buchungen_material ON lager_buchungen (material_id, erstellt_am);

-- CC Intern: Anfragen
CREATE TABLE IF NOT EXISTS ccintern_anfragen (
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
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (kunde_id) REFERENCES firmen (id) ON DELETE SET NULL,
  FOREIGN KEY (zugewiesen_an) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ccintern_anfragen_firma ON ccintern_anfragen (firma_id);
CREATE INDEX IF NOT EXISTS idx_ccintern_anfragen_status ON ccintern_anfragen (status);

-- CC Intern: Angebote
CREATE TABLE IF NOT EXISTS ccintern_angebote (
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
  deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_ccintern_angebote_project ON ccintern_angebote (project_id);
CREATE INDEX IF NOT EXISTS idx_ccintern_angebote_deleted ON ccintern_angebote (deleted_at);

-- Aufgaben
CREATE TABLE IF NOT EXISTS aufgaben (
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
);

CREATE INDEX IF NOT EXISTS idx_aufgaben_firma ON aufgaben (firma_id);
CREATE INDEX IF NOT EXISTS idx_aufgaben_status ON aufgaben (status);

-- Rechnungen (statusbasiert; Details extern z. B. Lexware)
CREATE TABLE IF NOT EXISTS ccintern_rechnungen (
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
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (auftrag_id) REFERENCES ccintern_auftraege (id) ON DELETE RESTRICT,
  FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE,
  FOREIGN KEY (erstellt_von) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ccintern_rechnungen_firma ON ccintern_rechnungen (firma_id);
CREATE INDEX IF NOT EXISTS idx_ccintern_rechnungen_status ON ccintern_rechnungen (status);

-- MesseFlow Projekte
CREATE TABLE IF NOT EXISTS messeflow_projekte (
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
);

CREATE INDEX IF NOT EXISTS idx_messeflow_projekte_firma ON messeflow_projekte (firma_id);
CREATE INDEX IF NOT EXISTS idx_messeflow_projekte_status ON messeflow_projekte (status);

CREATE TABLE IF NOT EXISTS messeflow_waende (
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
);

CREATE INDEX IF NOT EXISTS idx_messeflow_waende_projekt ON messeflow_waende (projekt_id, sort_index);

CREATE TABLE IF NOT EXISTS messeflow_wand_dateien (
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
);

CREATE INDEX IF NOT EXISTS idx_messeflow_wand_dateien_wand ON messeflow_wand_dateien (wand_id, erstellt_am);

-- Phase B3: Cockpit Geräte
CREATE TABLE IF NOT EXISTS geraete (
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
);

CREATE INDEX IF NOT EXISTS idx_geraete_firma ON geraete(firma_id);
CREATE INDEX IF NOT EXISTS idx_geraete_project ON geraete(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_geraete_seriennummer ON geraete(seriennummer) WHERE seriennummer IS NOT NULL AND LENGTH(TRIM(seriennummer)) > 0;

-- Phase B5: CC Intern CRM
CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
  id TEXT PRIMARY KEY NOT NULL,
  firma_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_firma ON crm_pipeline_stages(firma_id);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_sort ON crm_pipeline_stages(firma_id, sort_order);

CREATE TABLE IF NOT EXISTS crm_aktivitaeten (
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
);

CREATE INDEX IF NOT EXISTS idx_crm_akt_firma ON crm_aktivitaeten(firma_id);
CREATE INDEX IF NOT EXISTS idx_crm_akt_kunde ON crm_aktivitaeten(firma_id, kunde_id);

CREATE TABLE IF NOT EXISTS crm_wiedervorlage (
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
);

CREATE INDEX IF NOT EXISTS idx_crm_wv_firma ON crm_wiedervorlage(firma_id);
CREATE INDEX IF NOT EXISTS idx_crm_wv_kunde ON crm_wiedervorlage(firma_id, kunde_id);

-- Phase B6: Refresh-Token + Mitarbeiter-Zeiten (Mobile)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS ccintern_mitarbeiter_zeiten (
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
);

CREATE INDEX IF NOT EXISTS idx_cc_me_zeiten_user ON ccintern_mitarbeiter_zeiten(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cc_me_zeiten_auftrag ON ccintern_mitarbeiter_zeiten(ccintern_auftrag_id);