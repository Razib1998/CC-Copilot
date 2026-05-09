-- ============================================================
--  CC Werbung GmbH — Migration: fusa_citys + fusa_pakete v2
--  Stand: April 2026
--  Kompatibilität: MariaDB 10.1+
--
--  Änderungen:
--    1. Neue Tabelle fusa_citys (Essen, Mülheim)
--    2. fusa_pakete erweitert:
--       - city_id       → Stadtbezug
--       - netto         → Betrag für Verkehrsbetrieb
--       - gewinn        → Berechnete Spalte: preis - netto
--       - gueltig_von   → Preisstart
--       - gueltig_bis   → Preisende
-- ============================================================

USE cc_werbung;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
--  SCHRITT 1 — Neue Tabelle: fusa_citys
-- ============================================================

CREATE TABLE IF NOT EXISTS fusa_citys (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  short_name VARCHAR(10)  DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed: Städte
INSERT INTO fusa_citys (name, short_name) VALUES
  ('Essen',   'E'),
  ('Mülheim', 'MH');


-- ============================================================
--  SCHRITT 2 — fusa_pakete anpassen
--
--  Vorgehen für bestehende Installationen:
--    a) FK auf fahrzeugtyp_id dynamisch ermitteln und droppen
--       (MariaDB generiert FK-Namen automatisch — z.B. fusa_pakete_ibfk_1)
--    b) UNIQUE-Index fahrzeugtyp_id entfernen (jetzt ohne FK-Sperre)
--    c) Neue Spalten hinzufügen + FK neu anlegen
--    d) Bestehende Zeilen einer Standardstadt zuweisen
--    e) city_id auf NOT NULL setzen
--    f) Neuen UNIQUE-Key anlegen
--
--  Für Neuinstallationen: Komplette Tabelle weiter unten.
-- ============================================================

-- a) FK auf fahrzeugtyp_id dynamisch ermitteln und droppen
--    (funktioniert unabhängig vom auto-generierten FK-Namen)
SET @fk_fz := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA    = DATABASE()
    AND TABLE_NAME      = 'fusa_pakete'
    AND COLUMN_NAME     = 'fahrzeugtyp_id'
    AND REFERENCED_TABLE_NAME = 'fusa_fahrzeugtypen'
  LIMIT 1
);
SET @sql_drop_fk := CONCAT('ALTER TABLE fusa_pakete DROP FOREIGN KEY ', @fk_fz);
PREPARE stmt FROM @sql_drop_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- b) UNIQUE-Index entfernen (jetzt ohne FK-Sperre möglich)
ALTER TABLE fusa_pakete
  DROP INDEX fahrzeugtyp_id;

-- c) NUR Spalten hinzufügen — noch KEINE Constraints
--    (Constraints erst nach dem Befüllen der Daten, sonst #1452)
ALTER TABLE fusa_pakete
  ADD COLUMN city_id      INT UNSIGNED  DEFAULT NULL AFTER fahrzeugtyp_id,
  ADD COLUMN netto        DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER preis,
  ADD COLUMN gewinn       DECIMAL(10,2) AS (preis - netto) VIRTUAL,
  ADD COLUMN gueltig_von  DATE          DEFAULT NULL AFTER gewinn,
  ADD COLUMN gueltig_bis  DATE          DEFAULT NULL AFTER gueltig_von;

-- d) Daten zuerst befüllen — BEVOR FK-Constraint gesetzt wird
UPDATE fusa_pakete SET city_id = 1 WHERE city_id IS NULL;

-- e) city_id auf NOT NULL setzen
ALTER TABLE fusa_pakete
  MODIFY COLUMN city_id INT UNSIGNED NOT NULL;

-- f) Jetzt erst FK-Constraints hinzufügen — alle Zeilen haben gültige Werte
ALTER TABLE fusa_pakete
  ADD CONSTRAINT fk_fusa_pakete_city
    FOREIGN KEY (city_id)        REFERENCES fusa_citys(id)        ON DELETE RESTRICT,
  ADD CONSTRAINT fk_fusa_pakete_fztyp
    FOREIGN KEY (fahrzeugtyp_id) REFERENCES fusa_fahrzeugtypen(id) ON DELETE CASCADE;

-- g) Neuer UNIQUE-Key: Paketname ist pro Stadt + Fahrzeugtyp eindeutig
ALTER TABLE fusa_pakete
  ADD UNIQUE KEY uq_paket_typ_city (fahrzeugtyp_id, name, city_id);


-- ============================================================
--  SCHRITT 3 — Mülheim-Preise duplizieren
--
--  Die bisherigen Pakete (Essen) werden für Mülheim kopiert.
--  WICHTIG: Preise (preis + netto) für Mülheim danach
--  manuell anpassen — sie gelten aktuell identisch zu Essen.
-- ============================================================

INSERT INTO fusa_pakete (fahrzeugtyp_id, city_id, name, preis, netto, gueltig_von)
SELECT
  fahrzeugtyp_id,
  2           AS city_id,     -- Mülheim
  name,
  preis,
  netto,
  CURDATE()   AS gueltig_von
FROM fusa_pakete
WHERE city_id = 1;            -- Essen als Vorlage


-- ============================================================
--  REFERENZ — Vollständige neue Tabellendefinition
--  (für Neuinstallationen ohne ALTER)
-- ============================================================

/*
DROP TABLE IF EXISTS fusa_pakete;

CREATE TABLE fusa_pakete (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  fahrzeugtyp_id INT UNSIGNED  NOT NULL,
  city_id        INT UNSIGNED  NOT NULL,
  name           VARCHAR(255)  NOT NULL,

  -- Preisfelder
  preis          DECIMAL(10,2) NOT NULL DEFAULT 0.00
                 COMMENT 'Verkaufspreis (Brutto an Kunden)',
  netto          DECIMAL(10,2) NOT NULL DEFAULT 0.00
                 COMMENT 'Betrag für Verkehrsbetrieb (Pacht)',
  gewinn         DECIMAL(10,2) AS (preis - netto) VIRTUAL
                 COMMENT 'CC-Anteil: preis - netto (berechnet)',

  -- Gültigkeitszeitraum
  gueltig_von    DATE          DEFAULT NULL
                 COMMENT 'Preis gültig ab diesem Datum',
  gueltig_bis    DATE          DEFAULT NULL
                 COMMENT 'Preis gültig bis (NULL = unbegrenzt)',

  beschreibung   TEXT          DEFAULT NULL,

  UNIQUE KEY uq_paket_typ_city (fahrzeugtyp_id, name, city_id),
  FOREIGN KEY (fahrzeugtyp_id) REFERENCES fusa_fahrzeugtypen(id) ON DELETE CASCADE,
  FOREIGN KEY (city_id)        REFERENCES fusa_citys(id)         ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
*/


-- ============================================================
--  BEISPIEL-ABFRAGE — Pakete mit Gewinn je Stadt anzeigen
-- ============================================================

/*
SELECT
  c.name                     AS stadt,
  ft.label                   AS fahrzeugtyp,
  p.name                     AS paket,
  p.preis                    AS verkaufspreis,
  p.netto                    AS pacht_betrieb,
  p.gewinn                   AS cc_gewinn,
  p.gueltig_von,
  p.gueltig_bis
FROM fusa_pakete p
JOIN fusa_citys        c  ON p.city_id        = c.id
JOIN fusa_fahrzeugtypen ft ON p.fahrzeugtyp_id = ft.id
ORDER BY c.name, ft.id, p.preis DESC;
*/

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  FERTIG
--  Neue Tabelle:  fusa_citys      (2 Städte: Essen, Mülheim)
--  Neue Spalten:  city_id, netto, gewinn (virtual),
--                 gueltig_von, gueltig_bis
--  Neuer Index:   uq_paket_typ_city
--  Nächster Schritt: Mülheim-Preise in fusa_pakete anpassen
-- ============================================================
