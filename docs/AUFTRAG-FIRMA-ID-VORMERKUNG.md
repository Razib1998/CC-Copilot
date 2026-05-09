# Auftrag `firma_id` — Frontend vorbereitet, Backend offen

**Stand:** Nur Dokumentation / Vormerkung. In diesem Schritt wurden **keine** Änderungen an Auftrags-Backend, Datenbank oder API-Responses vorgenommen.

## Was bereits im Frontend liegt

- **FUSA „Neuer Auftrag“** (`frontend/modules/shared/ui/fusa-neuer-auftrag-form.js`): Formular mit Kundenwahl aus dem zentralen Firmenstamm; Submit sendet u. a. `firma_id` und abgeleitetes **Legacy**-Feld `kunde_name` (Anzeigetext aus dem Stamm via `resolveFirmenLabel`).
- **Auftragsliste / Anzeige:** `resolveAuftragKundenAnzeige` und Tabellen-Rendering nutzen den Stamm, sobald die API `firma_id`/`firmaId` liefert (`frontend/modules/shared/lib/firma-kunden-referenz.js`, `auftraege-api-table.js`).

## Was das Backend aktuell macht

- **POST `/auftraege`** (`backend/src/routes/auftraege.js`): Validiert und speichert weiterhin nur `title`, `project_id`, optionale `status`/`termin`. Zusätzliche Body-Felder wie `firma_id` oder `kunde_name` werden **nicht** persistiert (werden ignoriert, sofern sie mitgesendet werden).
- **GET-Auftrags-Response:** unverändert; `kunde_name` kommt aus der bestehenden Datenlage, nicht aus einer neuen `firma_id`-Spalte am Auftrag.

## Später umzusetzen (nicht Teil des aktuellen Schritts)

- DB: optionale Spalte z. B. `firma_id` an der Auftragstabelle (FK zu `firmen`), Migration.
- Store: `insertAuftrag` / Reads anpassen.
- API: POST/PATCH/GET so erweitern, dass `firma_id` (und ggf. abgeleitete Anzeige) konsistent sind; klare Abwärtskompatibilität für alte Datensätze ohne `firma_id`.

Diese Datei dient als **Vormerkung** für das Team; Umsetzung erst nach eigenem Ticket/Freigabe.
