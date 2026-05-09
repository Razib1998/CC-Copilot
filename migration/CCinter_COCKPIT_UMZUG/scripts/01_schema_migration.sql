-- ══════════════════════════════════════════════════════════════════════
-- CC INTERN → COCKPIT UMZUG
-- Schritt 1: Schema-Migration (KORRIGIERT nach Soll/Ist-Matrix)
-- ─────────────────────────────────────────────────────────────────────
-- Datei:   scripts/01_schema_migration.sql
-- Zweck:   ccintern_kunden_extra erweitern + crm_aktivitaeten neu anlegen
--
-- WICHTIG:
--   - firmen-Tabelle wird NICHT verändert (hat bereits alle nötigen Stamm-Spalten)
--   - CC-Intern-spezifische Felder → ccintern_kunden_extra (eigene Erweiterungs-Tabelle)
--   - crm_aktivitaeten ist die einzige komplett neue Tabelle
--
-- SQLite: ADD COLUMN ohne IF NOT EXISTS (ältere SQLite-Versionen).
-- ggf. vorher manuell prüfen: SELECT name FROM pragma_table_info('ccintern_kunden_extra');
-- Doppelte ALTER schlagen fehl — dann Spalte schon vorhanden.
-- REIHENFOLGE: Zuerst ausführen, DANN 02_import_kunden.js
-- ══════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- TEIL 1: ccintern_kunden_extra erweitern
-- Bestehende Spalten: firma_id (PK), crm_status, betreuer, updated_at
-- Neue CC-Intern-spezifische Spalten:
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE ccintern_kunden_extra ADD COLUMN ap_funktion     TEXT DEFAULT NULL;
ALTER TABLE ccintern_kunden_extra ADD COLUMN branche         TEXT DEFAULT NULL;
ALTER TABLE ccintern_kunden_extra ADD COLUMN umsatz          TEXT DEFAULT NULL;   -- "€ 128.400" (TEXT wegen CC-Intern-Format)
ALTER TABLE ccintern_kunden_extra ADD COLUMN auftragsvolumen INTEGER DEFAULT NULL;
ALTER TABLE ccintern_kunden_extra ADD COLUMN fahrzeuge       INTEGER DEFAULT NULL;
ALTER TABLE ccintern_kunden_extra ADD COLUMN letzter_kontakt TEXT DEFAULT NULL;   -- TEXT: "Heute", "12.03", "2026-03-21"
ALTER TABLE ccintern_kunden_extra ADD COLUMN naechste_aktion TEXT DEFAULT NULL;

-- Hinweise zu firmen-Tabelle (NICHT ändern):
--   firmen.strasse  → nimmt adresse aus kunden.json (Spalte heißt STRASSE, nicht adresse!)
--   firmen.interne_notiz → nimmt notiz aus kunden.json (Spalte heißt INTERNE_NOTIZ, nicht notiz!)
--   firmen hat ansprechpartner_anrede + ansprechpartner_nachname (getrennte Felder)
--   firmen hat KEIN updated_at — nur created_at

-- ──────────────────────────────────────────────────────────────────────
-- TEIL 2: crm_aktivitaeten neu anlegen
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_aktivitaeten (
    id              TEXT        PRIMARY KEY,          -- UUID (neu generiert — Original-ID ist nicht global unique!)
    original_id     TEXT        DEFAULT NULL,         -- Original CC-Intern-ID (z.B. "A001") zur Rückverfolgung
    kunde_id        TEXT        NOT NULL,             -- FK → firmen.id
    typ             TEXT        NOT NULL,             -- "Anruf", "E-Mail", "Besuch", etc.
    datum           TEXT        DEFAULT NULL,         -- ISO-Datum "2026-03-21"
    zeit            TEXT        DEFAULT NULL,         -- "10:00"
    mitarbeiter_id  TEXT        DEFAULT NULL,         -- FK → users.id (NULL wenn Name nicht auflösbar)
    mitarbeiter_raw TEXT        DEFAULT NULL,         -- Original-Name aus CC Intern (z.B. "Muhammet")
    notiz           TEXT        DEFAULT NULL,
    wiedervorlage   TEXT        DEFAULT NULL,         -- Datum für Wiedervorlage (leer = NULL)
    wv_aufgabe      TEXT        DEFAULT NULL,         -- Aufgabe bei Wiedervorlage
    -- created_at: kein DB-Default hier — je nach DB-Engine per INSERT setzen oder app-seitig
    created_at      TEXT        DEFAULT NULL,

    FOREIGN KEY (kunde_id)       REFERENCES firmen(id)  ON DELETE CASCADE,
    FOREIGN KEY (mitarbeiter_id) REFERENCES users(id)   ON DELETE SET NULL
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_crm_aktivitaeten_kunde_id  ON crm_aktivitaeten(kunde_id);
CREATE INDEX IF NOT EXISTS idx_crm_aktivitaeten_datum     ON crm_aktivitaeten(datum);
CREATE INDEX IF NOT EXISTS idx_crm_aktivitaeten_typ       ON crm_aktivitaeten(typ);

-- ──────────────────────────────────────────────────────────────────────
-- PRÜFUNG (nach Ausführung manuell testen):
-- ──────────────────────────────────────────────────────────────────────
-- SELECT name FROM pragma_table_info('ccintern_kunden_extra');
-- → Muss enthalten: ap_funktion, branche, umsatz, auftragsvolumen, fahrzeuge, letzter_kontakt, naechste_aktion
--
-- SELECT name FROM pragma_table_info('crm_aktivitaeten');
-- → Muss enthalten: id, original_id, kunde_id, typ, datum, zeit, mitarbeiter_id, mitarbeiter_raw, notiz, wiedervorlage, wv_aufgabe, created_at
--
-- SELECT name FROM pragma_table_info('firmen');
-- → DARF KEINE neuen Spalten haben (nur bestehende nutzen)
