-- ============================================================
--  CC Werbung GmbH — fusa_rechnungspositionen neu
--  Stand: April 2026 | MariaDB 10.1+
--
--  Basis: Screenshot "Neuer Auftrag anlegen"
--
--  Spalten aus der Ansicht:
--    Service/Mo.   → service_pro_monat  (Eingabe)
--    AE %          → ae_prozent         (Eingabe)
--    Rabatt %      → rabatt_prozent     (Eingabe)
--    Netto/Mo.     → netto_pro_monat    (berechnet)
--    Intern/Mo.    → intern_pro_monat   (Eingabe / Pacht gesamt)
--    CC            → cc_anteil          (berechnet)
--    Partner       → partner_anteil     (berechnet)
--    Laufzeit      → laufzeit_monate    (aus Auftragskopf)
--    × Laufzeit    → auftragswert       (berechnet)
--
--  Berechnungslogik (aus Screenshot verifiziert):
--    Netto/Mo    = Service * (1 - Rabatt%) * (1 - AE%)
--    Beispiel:  1780 * 0.90 * 0.85 = 1.361,70 ✓
--
--    CC-Anteil   = Intern/Mo * cc_prozent / 100
--    Beispiel:   890 * 22% = 195,80 ✓
--
--    Partner     = Intern/Mo * partner_prozent / 100
--    Beispiel:   890 * 78% = 694,20 ✓
--
--    Auftragswert = Netto/Mo * Laufzeit_Monate
-- ============================================================

USE cc_werbung;

DROP TABLE IF EXISTS fusa_rechnungspositionen;

CREATE TABLE fusa_rechnungspositionen (
  id                  INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,

  -- Zuordnung
  rechnung_id         INT UNSIGNED   NOT NULL                    COMMENT 'Rechnung (fusa_rechnungen.id)',
  auftrag_id          INT UNSIGNED   DEFAULT NULL                COMMENT 'Auftrag (fusa_auftraege.id)',
  fahrzeug_id         INT UNSIGNED   DEFAULT NULL                COMMENT 'Fahrzeug (fusa_fahrzeuge.id)',
  paket_id            INT UNSIGNED   DEFAULT NULL                COMMENT 'Paket (fusa_pakete.id)',
  paket_name          VARCHAR(255)   DEFAULT NULL                COMMENT 'Paketname (zwischengespeichert)',

  -- ── Preiskalkulation ────────────────────────────────────────
  -- Eingabefelder (editierbar im Formular)
  service_pro_monat   DECIMAL(10,2)  NOT NULL DEFAULT 0.00       COMMENT 'Bruttopreis pro Monat (Service/Mo.)',
  ae_prozent          DECIMAL(5,2)   NOT NULL DEFAULT 0.00       COMMENT 'Agentureinnahmen in % (AE %)',
  rabatt_prozent      DECIMAL(5,2)   NOT NULL DEFAULT 0.00       COMMENT 'Rabatt in % (Rabatt %)',

  -- Berechnete Felder (VIRTUAL — nie manuell befüllen)
  netto_pro_monat     DECIMAL(10,2)  AS (
                        ROUND(
                          service_pro_monat
                          * (1 - rabatt_prozent  / 100)
                          * (1 - ae_prozent      / 100),
                        2)
                      ) VIRTUAL                                  COMMENT 'Netto/Mo. = Service × (1−Rabatt%) × (1−AE%)',

  -- ── Interner Betrag + Partneraufteilung ────────────────────
  -- Eingabefeld (editierbar, orange markiert im Formular)
  intern_pro_monat    DECIMAL(10,2)  NOT NULL DEFAULT 0.00       COMMENT 'Interner Betrag / Pacht gesamt (Intern/Mo.)',

  -- Prozentwerte aus Partnermodell (werden beim Speichern befüllt)
  cc_prozent          DECIMAL(5,2)   NOT NULL DEFAULT 22.00      COMMENT 'CC-Anteil % aus Partnermodell',
  partner_prozent     DECIMAL(5,2)   NOT NULL DEFAULT 78.00      COMMENT 'Partner-Anteil % aus Partnermodell',

  -- Berechnete Aufteilung (VIRTUAL)
  cc_anteil           DECIMAL(10,2)  AS (
                        ROUND(intern_pro_monat * cc_prozent      / 100, 2)
                      ) VIRTUAL                                  COMMENT 'CC = Intern × cc_prozent%',
  partner_anteil      DECIMAL(10,2)  AS (
                        ROUND(intern_pro_monat * partner_prozent / 100, 2)
                      ) VIRTUAL                                  COMMENT 'Partner = Intern × partner_prozent%',

  -- ── Laufzeit ───────────────────────────────────────────────
  laufzeit_monate     SMALLINT UNSIGNED NOT NULL DEFAULT 1       COMMENT 'Laufzeit in Monaten (aus Auftragskopf)',
  laufzeit_bis        DATE           DEFAULT NULL                COMMENT 'Laufzeit endet am (z.B. 27.04.2028)',

  -- ── Auftragswert gesamt ────────────────────────────────────
  -- Direkt aus Basiswerten berechnet (nicht aus netto_pro_monat,
  -- da MariaDB 10.1 keine verketteten VIRTUAL-Spalten erlaubt)
  auftragswert        DECIMAL(12,2)  AS (
                        ROUND(
                          service_pro_monat
                          * (1 - rabatt_prozent  / 100)
                          * (1 - ae_prozent      / 100)
                          * laufzeit_monate,
                        2)
                      ) VIRTUAL                                  COMMENT 'Auftragswert = Netto/Mo × Laufzeit',

  -- ── Partnermodell-Referenz ─────────────────────────────────
  partner_modell_id   VARCHAR(100)   DEFAULT NULL                COMMENT 'z.B. modell-ruhrbahn',

  sort_order          INT UNSIGNED   NOT NULL DEFAULT 0

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  BEISPIEL — Daten aus dem Screenshot
--
--  Bus 833 | Ganzgestaltung + Fenster | Ruhrbahn Standard
--  Service: 1780 | AE: 15% | Rabatt: 10% | Intern: 890
--  Laufzeit: 24 Monate bis 27.04.2028
--
--  INSERT INTO fusa_rechnungspositionen (
--    rechnung_id, fahrzeug_id, paket_name,
--    service_pro_monat, ae_prozent, rabatt_prozent,
--    intern_pro_monat, cc_prozent, partner_prozent,
--    laufzeit_monate, laufzeit_bis, partner_modell_id
--  ) VALUES (
--    1, 1, 'Ganzgestaltung + Fenster',
--    1780.00, 15.00, 10.00,
--    890.00, 22.00, 78.00,
--    24, '2028-04-27', 'modell-ruhrbahn'
--  );
--
--  Ergebnis (VIRTUAL):
--    netto_pro_monat  = 1780 × 0.90 × 0.85 = 1.361,70 ✓
--    cc_anteil        = 890  × 0.22         =   195,80 ✓
--    partner_anteil   = 890  × 0.78         =   694,20 ✓
--    auftragswert     = 1.361,70 × 24       = 32.680,80
-- ============================================================


-- ============================================================
--  GESAMT-ZEILE (Auftragskopf) — Berechnungslogik für Backend
--
--  Diese Werte werden im Backend / Frontend aus den
--  Positionen aggregiert (nicht in der DB gespeichert):
--
--    Ges. Netto/Monat  = SUM(netto_pro_monat)
--    Auftragswert      = SUM(auftragswert)
--    Gesamt Intern     = SUM(intern_pro_monat)
--    Gesamt CC         = SUM(cc_anteil)
--    Gesamt Partner    = SUM(partner_anteil)
--
--  SQL-Beispiel:
--  SELECT
--    SUM(netto_pro_monat)  AS ges_netto_pro_monat,
--    SUM(intern_pro_monat) AS ges_intern,
--    SUM(cc_anteil)        AS ges_cc,
--    SUM(partner_anteil)   AS ges_partner,
--    SUM(auftragswert)     AS ges_auftragswert
--  FROM fusa_rechnungspositionen
--  WHERE rechnung_id = 1;
-- ============================================================
