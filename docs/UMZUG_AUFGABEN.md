# UMZUG_AUFGABEN.md — CC Intern → Cockpit

**Stand: April 2026**  
**Basis:** Analyse von CCinter_COCKPIT_UMZUG + CC Cockpit Backend  
**Regel:** Lies zuerst `CC Cockpit/docs/ARCHITEKTUR_REGEL.md` — diese Regel ist verbindlich.

---

## 🔴 BLOCKER — Ohne diese Punkte kann der Umzug nicht starten

---

### 1. Datenstruktur: Feldmapping kunden.json → firmen-Tabelle

**Problem:**  
`kunden.json` aus CC Intern verwendet andere Feldnamen als das Cockpit-Backend.

**Mapping erforderlich:**

| CC Intern (JSON) | Cockpit Backend (firmen-Tabelle) |
|---|---|
| `ap` | `ansprechpartner_nachname` |
| `apFunktion` | (kein Feld — in `erweiterung_json`) |
| `tel` | `telefon` |
| `mail` | `email` |
| `plz` | `plz` |
| `stadt` | `stadt` |
| `branche` | `typ` oder `erweiterung_json` |
| `umsatz` | `erweiterung_json` |
| `status` | `status` |
| `notiz` | `interne_notiz` |
| Schlüssel z. B. `"Ruhrbahn"` | `id` → UUID generieren |

**Aufgabe:** Import-Skript schreiben, das kunden.json in die `firmen`-Tabelle überträgt.

---

### 2. Fehlende Tabelle: CRM-Aktivitäten

**Problem:**  
Jeder Kunde hat `aktivitaeten[]` (Typ, Datum, Mitarbeiter, Notiz, Wiedervorlage).  
Im Cockpit-Schema existiert **keine Tabelle** dafür.

**Aufgabe:** Migration schreiben:

```sql
CREATE TABLE IF NOT EXISTS crm_aktivitaeten (
  id TEXT PRIMARY KEY,
  firma_id TEXT NOT NULL,
  typ TEXT,
  datum TEXT,
  zeit TEXT,
  mitarbeiter TEXT,
  notiz TEXT,
  wiedervorlage_datum TEXT,
  wiedervorlage_aufgabe TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (firma_id) REFERENCES firmen (id) ON DELETE CASCADE
);
```

---

### 3. Import-Skript: JSON → SQLite

**Problem:**  
Produktivdaten liegen als JSON vor, müssen in SQLite übertragen werden.  
Kein Import-Skript vorhanden.

**Reihenfolge:**

1. `kunden.json` → `firmen` + `ccintern_kunden_extra`
2. `kunden.aktivitaeten[]` → `crm_aktivitaeten`
3. `angebote.json` → `angebote`
4. `anfragen.json` → (noch kein Ziel — Route fehlt)
5. `auftraege.json` → `auftraege` (117 KB — größter Datensatz)
6. `rechnungen.json` → (noch kein Ziel — Route fehlt)

---

### 4. Falsche Modulzuweisung im kunden-Router

**Problem:**  
`kunden.js` prüft `requireModule('fusa')` — für CC Intern muss es `ccintern` sein.

**Datei:** `backend/src/routes/kunden.js`  
**Aufgabe:** Middleware auf `ccintern` umstellen oder separaten CC-Intern-Kunden-Router erstellen.

---

### 5. Bootstrap-Konfiguration in Cockpit-Shell

**Problem:**  
CC Intern DataService muss beim Start gegen das Cockpit-Backend konfiguriert werden.

**Aufgabe:** In der Cockpit-Shell einmalig eintragen:

```js
window.CCIntern.ApiAdapter.configure('https://cc-werbung.de/api/v1', jwtToken);
window.CCIntern.DataService.setAdapter(window.CCIntern.ApiAdapter);
```

Danach laufen alle 12 DataService-Module automatisch — ohne weitere Änderungen.

---

### 6. `cc-intern-boot.js` an Cockpit-Lifecycle anpassen

**Problem:**  
Boot-Block startet heute direkt per `DOMContentLoaded`. In der Cockpit-Shell gibt es einen eigenen Lifecycle.

**Aufgabe:**  
`ccSyncInit()` + `dalInit()` als `ccInternInit()` exportieren und vom Cockpit-Shell-Router aufrufen lassen.

---

### 7. Globale Arrays durch API-Calls ersetzen (5 Module betroffen)

**Problem:**  
Diese Module lesen direkt aus globalen JavaScript-Arrays:

| Modul | Globale Arrays |
|---|---|
| `auftraege/kalender.js` | `AUFTRAEGE`, `CC_FUSA_TERMINE` |
| `dashboard/index.js` | `AUFTRAEGE`, `AG_DATEN`, `ANF_DATEN`, `URLAUB_ANTRAEGE`, `LAGER_CC`, `MA_DATA`, `MA_ANWESENHEIT` |
| `materiallager/index.js` | `LAGER_CC` |
| `mitarbeiter-app/index.js` | `MA_DATA`, `AUFTRAEGE` |
| `produktion/index.js` | `AUFTRAEGE`, `MA_DATA` |

**Aufgabe:** Zentralen `cc-intern-data-store.js` erstellen, der alle Arrays hält und per API initialisiert.

**Endpunkt-Mapping:**

| Variable | API-Endpunkt |
|---|---|
| `AUFTRAEGE` | GET /api/v1/orders |
| `MA_DATA` | GET /api/v1/employees |
| `LAGER_CC` | GET /api/v1/inventory |
| `URLAUB_ANTRAEGE` | GET /api/v1/absences |
| `MA_ANWESENHEIT` | GET /api/v1/time-entries |
| `CC_FUSA_TERMINE` | GET /api/v1/fusa/vehicles |
| `AG_DATEN` | ⚠️ Endpunkt noch nicht gebaut |
| `ANF_DATEN` | ⚠️ Endpunkt noch nicht gebaut |

---

### 8. Key-Mapping im SyncAdapter korrigieren

**Problem:**  
`SyncAdapter` mappt `cc_intern_auftraege_v1 → /auftraege`.  
Cockpit-Backend erwartet `/api/v1/orders`.

**Datei:** `core/ApiAdapter.js` + `core/SyncAdapter.js`  
**Aufgabe:** `_endpoints`-Mapping auf neue REST-Pfade anpassen.

---

## 🟡 EMPFOHLEN — Kein Blocker, aber wichtig

---

### 9. Fehlende Backend-Routen bauen

Diese Routen existieren noch nicht im Cockpit-Backend:

| Modul | Route |
|---|---|
| Angebote CC Intern | `POST/GET /api/v1/offers` |
| Anfragen / CRM | `POST/GET /api/v1/inquiries` |
| Rechnungen | `POST/GET /api/v1/invoices` |
| Urlaub-Genehmigung | `PATCH /api/v1/absences/approve` |
| Checklisten-Vorlagen | `GET/POST /api/v1/checklist-templates` |
| Mitarbeiter | `GET/POST /api/v1/employees` |

---

### 10. `MA_VERF` von localStorage auf sessionStorage

**Datei:** `module/mitarbeiter/index.js`  
**Aufgabe:** Verfügbarkeits-Status (`MA_VERF`) von `localStorage` auf `sessionStorage` oder In-Memory-Map umstellen. Nur eine Zeile zu ändern.

---

### 11. `auftraege-detail-view.js` aufteilen

**Problem:**  
Mit 10.952 Zeilen und 135 Funktionen ist diese Datei zu groß für wartbare Integration.

**Vorschlag:**
- `auftraege-formular-view.js` — Modal, Selects, Felder (~4.000 Z.)
- `auftraege-kommunikation-view.js` — Kommentar/Chat (~300 Z.)
- `auftraege-zeit-view.js` — Zeiterfassung (~200 Z.)
- `auftraege-dateien-view.js` — Datei-Upload (~150 Z.)
- `auftraege-detail-kern-view.js` — openAuftragDetail, buildSchritt (~500 Z.)

---

### 12. `ccGetAlleTermine()` durch Kalender-API ersetzen

**Problem:**  
Liest aus `AUFTRAEGE` + `CC_FUSA_TERMINE` + `URLAUB_ANTRAEGE` direkt.

**Aufgabe:** Durch `GET /api/v1/calendar` ersetzen (Endpunkt bereits gebaut).

---

## ✅ BEREITS FERTIG — Nichts zu tun

- Adapter-Schicht (`ApiAdapter`, `LocalStorageAdapter`, `SyncAdapter`) — produktionsreif
- `CCInternDataService` — Adapter-Switch ist ein Einzeiler
- 12 von 17 Modulen — laufen nach Bootstrap ohne Änderung
- Auth im Backend — JWT + Refresh + bcrypt vollständig
- DB-Schema — Kerntabellen vorhanden (`firmen`, `angebote`, `auftraege`, `fahrzeuge`, `schaeden`)
- JSON-Produktivdaten — gesichert in `daten/`, bereit für Import

---

## Reihenfolge für den Umzug

```
1. Migration: crm_aktivitaeten-Tabelle anlegen
2. Import-Skript: kunden.json → firmen + crm_aktivitaeten
3. Import-Skript: auftraege.json → auftraege
4. Key-Mapping in ApiAdapter + SyncAdapter korrigieren
5. Bootstrap-Konfiguration in Cockpit-Shell eintragen
6. cc-intern-boot.js als ccInternInit() exportieren
7. cc-intern-data-store.js als zentrale Array-Quelle bauen
8. Fehlende Backend-Routen schrittweise ergänzen
9. MA_VERF auf sessionStorage umstellen
```

---

*Diese Datei ist die verbindliche Aufgabenliste für den CCinter → Cockpit Umzug.*
