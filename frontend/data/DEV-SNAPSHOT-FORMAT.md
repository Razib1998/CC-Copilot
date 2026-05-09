# DEV-Snapshot-Format — Phase 1 (Read-Only, Kalender)

Verbindliche Spezifikation für `frontend/data/dev-snapshot.json` im CC Cockpit.  
Kompatibel mit dem Subset, das Workspace_DEV in `mfSaveState` persistiert (`projects`, `auftraege`, `kunden`, …).  
**Workspace_DEV wird nicht geändert** — Exporte manuell oder per Tool hier einfügen.

---

## STATUS (Pflege)

| Punkt | Inhalt |
|-------|--------|
| Gültige JSON-Datei | ja |
| Top-Level | siehe unten |
| Kalender aktiv | wenn `projects` und/oder `auftraege` mindestens ein nutzbares Element haben |

---

## 1. Erlaubte Top-Level-Felder

| Feld | Rolle Phase 1 |
|------|----------------|
| **`projects`** | **Kalender:** Messeflow-Projektobjekte (Hauptquelle für Projekt-Schleife der Unified-Map). |
| **`auftraege`** | **Kalender:** Cockpit-/FUSA-Aufträge mit `projektId` (werden pro Projekt gemerged). |
| **`kunden`** | **Optional:** für spätere Views; **aktueller Kalender-Pfad ignoriert `kunden`**. Darf trotzdem gesetzt werden (z. B. Parität zu `mfSaveState`). |
| **Sonstige Keys** | Werden vom Adapter **nicht** gelesen; schaden nicht, werden aber ignoriert. |

**Nicht** vom aktuellen Adapter ausgewertet: `projekte`, `orders`, `notifs`, `logs`, … — können für Dokumentation oder spätere Phasen im File bleiben, **beeinflussen den Kalender nicht**, solange sie nicht in `mapDevSnapshotToCalendarInput` ergänzt werden.

---

## 2. Pflichtfelder für Phase-1-Kalender

Der Cockpit-Kalender nutzt `buildUnifiedCcwCalendarEventsFromStateSnapshot` → `buildCcwProjectCalendarEvents` (`ccw-calendar-kernel.js`).

### `projects[]` (mindestens ein Eintrag, wenn Kalender über Projekte laufen soll)

| Feld | Pflicht | Anmerkung |
|------|---------|------------|
| **`id`** | **ja** | String, eindeutig; muss zu `auftraege[].projektId` passen. |
| **`name`** | **ja** | Anzeige / Projekt-Titel in Events. |
| **`waende`** | empfohlen | Array (darf `[]` sein). Fehlt → wird wie leeres Array behandelt. |

**Ohne** passendes `projects[]`-Element mit dieser `id` erscheinen **keine** Events aus rein top-level-`auftraege` (die Unified-Map iteriert nur über `projects`).

### `auftraege[]` (für sichtbare Auftrags-Termine)

| Feld | Pflicht | Anmerkung |
|------|---------|------------|
| **`id`** | **ja** | Stabil; Merge über dieselbe `id` bei Mehrfachquellen. |
| **`projektId`** | **ja** | Muss **`projects[].id`** entsprechen. |
| **`name`** | **ja** | **Cockpit-Kern nutzt `name`, nicht `titel`.** |
| **`termin`** | **ja** | Startzeit (ISO oder von `parseCalendarDateToDate` unterstütztes Datum). |

---

## 3. Optionale Felder (Kalender)

| Feld | Wo | Wirkung |
|------|-----|---------|
| **`terminEnde`** | `auftraege[]`, eingebettete `projects[].auftraege[]` | Ende des Auftrags-Events; sonst Default-Dauer. |
| **`typ`** | Auftrag | z. B. `"Montage"` → normalisierter Typ `montage`; sonst u. a. `auftrag`. |
| **`status`** | Auftrag | aktuell ohne eigene Event-Logik im Kern; darf gesetzt werden. |
| **`kunden`** | Top-Level | Phase 1 Kalender: **keine** Auswertung; für spätere Listen/CRM. |
| **`auftragsInfo`** | `projects[]` | beliebige Metadaten; siehe **Problemfelder** zu `liefertermin`. |
| **`kunde`**, **`status`**, **`prioritaet`** am Projekt | Messeflow-üblich | vom Kalenderkern nicht für Auftragszeilen benötigt; unbedenklich. |

---

## 4. Problemfelder / Doppel-Termine / Mapper

### `titel` vs. `name`

- **Cockpit erwartet:** `name` auf Auftragsobjekten (`buildCcwProjectCalendarEvents`: `title: String(a.name || a.id)`).
- **DEV-Export mit nur `titel`:** vor Einspielen **`name`** setzen oder später zentral mappen (`titel` → `name`).

### `projects` vs. `projekte`

- **Kalender (aktuell):** nur **`projects`** (Messeflow-Detailmodell).
- **`projekte`** (schlanke Cockpit-Liste in DEV): **wird nicht gelesen** — für Kalender ggf. **Mapper** „`projekte` → minimale `projects`-Einträge“ oder Export so wählen, dass **`projects`** gefüllt ist.

### `deadline` (Projekt) und `auftragsInfo.liefertermin`

- Beides speist **`pickProjectLieferterminSource`** → zusätzliches Kalender-Event **„Liefertermin / Deadline“** (Typ `lieferung`).
- **Empfehlung Phase 1 (nur ein klarer Auftrags-Termin):** **`deadline` weglassen** und **`auftragsInfo.liefertermin` weglassen oder leer lassen**, wenn **kein** zweites „Liefertermin“-Event gewünscht ist.

### Eingebettete vs. top-level `auftraege`

- Dieselbe **`id`** in `projects[].auftraege` und in top-level `auftraege` wird in der Unified-Map **zusammengeführt** → **eine** Zeile, keine Dublette in der Tabelle.

---

## 5. Minimalstruktur (mindestens ein sichtbarer Termin)

1. **`projects`:** ein Objekt mit `id`, `name`, `waende: []`.
2. **`auftraege`:** mindestens ein Objekt mit `id`, `projektId` = jene `id`, `name`, `termin`.
3. Optional: gleicher Auftrag zusätzlich unter `projects[0].auftraege` — Merge verhindert Dublette.
4. Shell mit Platzhalter-Projekt-ID: es wird **`projects[0].id`** als effektive Projekt-ID gewählt (`dev-calendar-read-model.js`).

---

## 6. Nutzung für weitere Cockpit-Views

- **`kunden`**, erweiterte `projects`-Felder und künftige Keys können **dieselbe Datei** nutzen, sobald Views eigene Reader haben.
- **Phase 1:** nur Kalender-Pfad ist angebunden; **`kunden`** ist dokumentiert und erlaubt, aber **nicht** Pflicht für den Kalender.

---

## 7. Referenz im Code

| Stück | Datei |
|-------|--------|
| Laden | `frontend/core/data/dev-snapshot-loader.js` |
| Top-Level → Kalender-Input | `frontend/core/adapters/dev-to-ccw-adapter.js` |
| Platzhalter / Feed | `frontend/core/data/dev-calendar-read-model.js` |
| Event-Erzeugung | `frontend/core/calendar/ccw-calendar-unified-map.js`, `ccw-calendar-kernel.js` |

---

*Letzte Festlegung: Phase 1 Read-Only — bei Erweiterung des Adapters diese Datei anpassen.*
