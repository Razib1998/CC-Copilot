# Architektur- und Datenbank-Audit — Entscheidungsstand

**Stand:** 2026-05-04  
**Gültigkeit:** Architektur- und API-Richtlinien; **kein** automatischer DB-Umbau. Tabellen werden **nicht** gelöscht, Migrationen hier **nicht** ausgeführt.

---

## 1. Aktueller Audit-Stand

- Eine **frisch** angelegte **SQLite**-Datenbank startet mit dem aktuellen Backend **ohne** den bisherigen Startfehler zu **`fusa_dokumente`** / **`migratePhase45`** (neues Tabellenschema mit `auftrag_id` usw.).
- **Alte** SQLite-Dateien oder **Backups** können weiterhin ein **Legacy-Schema** für `fusa_dokumente` (z. B. `bezug_typ` / `bezug_id` / `dateiname` statt `auftrag_id` / `name` / `url`) enthalten und damit **bekannte Migrations- und Indexfehler** auslösen, bis Daten oder Migration angepasst sind.

---

## 2. Entscheidung Kundenmodell

- **Führendes Kundenmodell** ist **`firmen`** (zentraler Firmen-/Kundenstamm).
- **`fusa_kunden_extra`** und **`ccintern_kunden_extra`** sind **nur Erweiterungen** zu **`firmen`** (zusätzliche Felder pro Modul), keine eigenständige Stammdaten-Wahrheit.
- Die Tabelle **`kunden`** ist **Legacy** (älteres Projekt-Kundenmodell).
- **`projects.kunden_id`** verweist aktuell noch auf **`kunden`** und darf **nicht ohne eine eigene, explizite Migration** umbenannt oder semantisch geändert werden.
- **`/api/v1/kunden`** (Router `kunden.js`, Tabelle `kunden`) ist **Legacy** und darf **nicht** für **neue** Frontend-Entwicklung genutzt werden.
- **Neue Entwicklung** nutzt **`/api/v1/firmen`** und/oder **`/api/v1/stammdaten/kunden`** (Envelope-Konventionen des Projekts beachten).

---

## 3. Entscheidung Angebote

- Die Tabelle **`angebote`** ist das **Legacy-Projekt-Angebot** (Cockpit-Phase-17-Modell); der zugehörige Router **`routes/angebote.js`** ist unter **`/api/v1`** **nicht** als produktiver Mount vorgesehen.
- **FUSA:** führend **`fusa_angebote`** und API **`/api/v1/fusa/angebote`**.
- **CC Intern:** führend **`ccintern_angebote`** und API **`/api/v1/ccintern/angebote`**.
- **Keine neue Entwicklung** auf der Tabelle **`angebote`** oder auf **`routes/angebote.js`**.

---

## 4. Entscheidung fusa_termine

- Unter **SQLite** existiert die Tabelle **`fusa_termine`** derzeit **nicht** (Anlage nur im **MySQL**-Store).
- **`GET /api/v1/fusa/termine`** liefert unter SQLite **immer eine leere Liste** (Implementierung fängt fehlende Tabelle ab).
- Für **produktive Terminlogik** gilt aktuell **`kalender_termine`** bzw. die **gemeinsame Kalenderlogik** des Cockpits.
- **`fusa_termine`** wird **entweder** später für SQLite **nachgezogen** (Parität) **oder** ausdrücklich als **MySQL-spezifische / zukünftige** Variante geführt.
- **Bis zur Klärung** ist **`fusa_termine`** **nicht** als aktive, alleinige **FUSA-Terminquelle** zu verwenden (insbesondere nicht unter SQLite mit Erwartung persistenter Daten).

---

## 5. Entscheidung Produktion

- **`ccintern_auftraege`** ist der **führende** interne Auftrag (fachliche Hauptzeile).
- **`produktion_auftraege`** ist **Produktionsdetail** / Arbeits- bzw. Kanban-Ansicht (eigene Zeilen, u. a. `schritt`, `fortschritt`).
- Es darf **keine unkontrollierte Doppelpflege** geben (insbesondere nicht widersprüchliche parallele Änderung desselben fachlichen Zustands ohne Regel).
- **Vor** einem Umbau muss festgelegt werden: **welche Felder** gespiegelt werden, **welche Quelle führend** ist und wie Konflikte aufgelöst werden.

---

## 6. Entwicklungsstand (Kurz)

| Bereich | Stand |
|--------|--------|
| **CRM** | Backend (`/api/v1/crm`) vorhanden; **Frontend** noch **nicht** sauber über die zentrale Cockpit-API angebunden (ältere CC-Intern-Pfade/DataService). |
| **Urlaub** | Backend und Frontend **angebunden**. |
| **Lager** | Backend und Frontend **angebunden**. |
| **Produktion** | Backend **`/api/v1/produktion`** vorhanden; **Abgleich** mit allen UI-Pfaden und **`ccintern_auftraege`** sollte geplant werden. |
| **FUSA Dokumente** | Frische DB **OK**; **ältere** DBs brauchen später einen **robusten Alt-DB-Migrationsschutz** (bekanntes Legacy-Schema). |

---

## 7. Regeln ab jetzt

1. **Keine** neuen Features auf der Tabelle **`kunden`** bzw. keine neue produktive Nutzung von **`/api/v1/kunden`**.
2. **Keine** neuen Features auf der Tabelle **`angebote`** / **`routes/angebote.js`**.
3. **Keine** direkte Nutzung von **`fusa_termine`** unter **SQLite** mit Erwartung persistenter oder vollständiger FUSA-Termine.
4. **Keine** Produktionsstatus-Änderung ohne vereinbarte **Single-Source-Regel** (siehe Abschnitt 5).
5. **Vor Importen** immer prüfen: Ein Eintrag in einer „Kunden“-Liste ist **nicht** automatisch eine **echte Firma** im Stamm — es kann Kampagne, Auftragskontext oder Legacy-Daten sein.

---

*Dieses Dokument festhalten Architekturentscheidungen nach Audit; technische Umsetzung (Migrationen, Löschungen) erfolgt nur in eigenen, explizit freigegebenen Schritten.*
