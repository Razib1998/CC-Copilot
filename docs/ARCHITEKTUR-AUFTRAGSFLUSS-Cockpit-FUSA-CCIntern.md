# Architektur-Skizze: Auftragsfluss Cockpit · FUSA · CC Intern

**Stand:** Referenz für Umbau-Planung — keine Implementationspflicht.  
**Scope:** Datenbasis, IDs, APIs, bekannte Risiken und Zielrichtung.

---

## 1. Tabellen (kurz)

| Tabelle | Rolle |
|--------|--------|
| **`auftraege`** | Persistenter **FUSA-/Projekt-Auftrag**: `project_id`, Termine, `status`, `fusa_kunde_id`, `fusa_fahrzeug_ids`, `fusa_extra_json`, … |
| **`ccintern_auftraege`** | Persistenter **CC-Intern-Auftrag** (mandantenfähig): `firma_id`, `auftragsnummer`, `kunde` (Text), `status`, `schritt`, Termin-Felder, optional **`fusa_auftrag_id`** → FK auf `auftraege.id`, **`quelle`** (`manuell` \| `fusa`). |
| **`firmen`** | Zentraler **Kunden-/Firmen-Stamm** für Zuordnung und API-Stammdaten. |
| **`kalender_termine`** (relevant) | Gemeinsamer Kalender: u. a. `firma_id`, `quelle` (`manuell` \| `fusa` \| `ccintern`), `typ`, Verweise `auftrag_id` (CC-Intern-Zeile) und/oder `fusa_auftrag_id` (FUSA-Zeile). |

**Verknüpfungen:** `ccintern_auftraege.fusa_auftrag_id` → `auftraege.id`; `ccintern_auftraege.firma_id` → `firmen.id`; `auftraege.fusa_kunde_id` → `firmen.id` (FUSA-seitig).

---

## 2. ID-Logik

| Begriff | Bedeutung |
|--------|------------|
| **`auftraege.id`** | Technisch **führend** für alles, was FUSA/Projekt/Fahrzeug/Belegung betrifft (UUID). |
| **`ccintern_auftraege.id`** | Technisch **führend** für CC-Intern-API, Kommentare, Mandantenscope (UUID, eigenständig). |
| **`fusa_auftrag_id`** | **Brücke**: FK von CC-Intern-Zeile zur FUSA-Zeile; `NULL` = rein interner CC-Auftrag ohne FUSA-Bezug. |
| **`auftragsnummer`** | **Business-/Anzeige-ID** (z. B. `AU-2026-001`, UNIQUE): menschenlesbar, nicht identisch mit `auftraege.id`. |

**Legacy-UI (CC Intern):** In der Cockpit-Einbindung kann die sichtbare „Auftrags-ID“ der **Anwendung** von `ccintern_auftraege.id` abweichen (z. B. Nutzung von `auftragsnummer` / Payload) — technisch führt weiterhin **`ccintern_auftraege.id`** die API-Persistenz, **`ccApiId`** o. Ä. hält die API-UUID fest.

**Kern:** Es gibt **keine** eine globale „Auftrags-ID über alles“; es gibt **zwei Speicherzeilen** mit **Verlinkung** und einer **Anzeige-/Geschäftsnummer**.

---

## 3. Herkunft / Quelle

- **FUSA-Auftrag:** Existenz nur in **`auftraege`**. „Ist FUSA-relevant“ für Listenfilter u. a. über FUSA-Felder (`fusa_kunde_id`, `fusa_original_id`, Fahrzeug-JSON, …) — kein separates `quelle`-Feld auf `auftraege` in diesem Sinne.
- **CC-Intern-Auftrag:** Existenz in **`ccintern_auftraege`**; **`quelle`** = `manuell` \| `fusa`; bei FUSA-Bezug zusätzlich **`fusa_auftrag_id`** gesetzt.

**Fachliche Trennung ohne unkontrollierte zweite Datenwelt:** Eine klar definierte **Brücke** (`fusa_auftrag_id` + `quelle`) und **ein** Kundenstamm (`firmen`). Risiko für „Wachstum“ liegt nicht in zweiter Tabelle an sich, sondern in **zusätzlichen parallelen Feldern** (siehe Status, JSON-Payload), die fachlich dieselbe Sache beschreiben.

---

## 4. Statuslogik

| Ort | Felder / Mechanik |
|-----|-------------------|
| **FUSA** | `auftraege.status`; ggf. weiteres in `fusa_extra_json` / Prozessen außerhalb der CC-Tabelle. |
| **CC Intern** | `ccintern_auftraege.status`, **`schritt`** (Kanban/Legacy); zusätzlich **JSON in `bemerkung`** (`__ccintern_v1` + `payload`) für Legacy-Felder. |

**Doppelpflege:** FUSA-`status`/`termin` vs. CC-`status`/`schritt`/Payload — bei Freigabe/Sync teilweise angeglichen, **keine** durchgängige Single Source.

**Spätere Single Source (Zielrichtung):** Entweder **FUSA führt** Status/Termin für gekoppelte Aufträge und CC spiegelt nur, oder **CC führt** interne Schritte und FUSA bleibt getrennt — aber **explizit** entscheiden und technisch durchsetzen (ein führendes Modell pro Koppelung).

---

## 5. Kunden- / Firmenlogik

- **`firmen`** ist die **zentrale Basis** für Firmen-/Kundenstamm.
- **FUSA:** `auftraege.fusa_kunde_id` → `firmen.id`.
- **CC Intern:** `ccintern_auftraege.firma_id` → `firmen.id`.
- **Freigabe FUSA → CC:** `firma_id` des CC-Datensatzes aus **`fusa_kunde_id`** des FUSA-Auftrags — explizites Mapping, keine zweite Stamm-Datenbank.

**Bruch-Risiken:** Abweichender Text **`kunde`** auf CC-Intern vs. abgeleiteter Name auf FUSA; manuelle Änderungen nur auf einer Seite; CC-Auftrag ohne `fusa_auftrag_id` trotz fachlichem Zusammenhang (Prozess-/UI-Fehler).

---

## 6. API-Fluss

| Bereich | Typische Endpunkte |
|--------|---------------------|
| **FUSA (Tabelle `auftraege`)** | Native: **`/auftraege`** (GET/POST/PATCH, …). API v1: **`GET /api/v1/fusa/auftraege`**, **`POST /api/v1/fusa/auftraege/:id/freigeben`**, … |
| **CC Intern (Tabelle `ccintern_auftraege`)** | **`GET|POST|PUT|DELETE /api/v1/auftraege`** (+ `firma_id`/Company-Auflösung). |

**Gemeinsame Backend-Logik:** Store-Zugriff auf dieselbe DB; Kalender-Brücke zentral in **`auftrag-kalender-sync.js`**.  
**Parallelcode-Risiko:** Zwei Schreib-Oberflächen für FUSA-Aufträge (**`/auftraege`** vs. **`/api/v1/fusa/...`**): bei Änderungen doppelt testen oder langfristig Kompetenzen zusammenführen.

---

## 7. Risiken (kurz)

- **Doppelte Statuspflege** zwischen FUSA und CC (inkl. JSON-Payload in `bemerkung`).
- **Unklare „führende ID“** für Menschen/Support (UUID vs. `auftragsnummer` vs. FUSA-UUID).
- **Legacy-Payload in `bemerkung`:** zweites Datenmodell in einer Spalte, schwer query-/migrationsfreundlich.
- **Parallele Schreibwege** für FUSA (`/auftraege` vs. API v1) erhöhen Wartungslast.

---

## 8. Empfehlung — Zielarchitektur (5–10 Sätze)

Die Zielarchitektur soll **eine klare führende Instanz pro Auftragsart** haben: FUSA-relevante Wahrheit bleibt in **`auftraege`**, CC-interne Workflow-Wahrheit in **`ccintern_auftraege`**, verbunden nur über **`fusa_auftrag_id`** und **`quelle`**, ohne dritte versteckte „Wahrheit“ in Freitext/JSON. **`firmen`** bleibt der einzige Kundenstamm; alle UI- und API-Schichten sollen **`firma_id` / `fusa_kunde_id`** konsistent aus diesem Stamm ableiten und Abweichungen explizit behandeln. **Status und Termine** sollten für gekoppelte Aufträge perspektivisch **einer Seite zugeordnet** werden (FUSA führt oder CC spiegelt nur), damit keine konkurrierenden Updates nötig sind. Der **JSON-Payload in `bemerkung`** sollte mittelfristig in **normierte Spalten oder eine Version-Tabelle** wandern, damit Auswertungen und Migrationen stabil werden. **API-Oberflächen** für FUSA-Schreiben sollten strategisch **eine dominante Route** erhalten oder dokumentiert getrennte Verantwortlichkeiten haben, um Parallelcode zu begrenzen. **Dokumentation und UI** müssen die drei IDs (**`auftraege.id`**, **`ccintern_auftraege.id`**, **`auftragsnummer`**) für Nutzer und Integrationen **eindeutig benennen**, damit keine falsche Erwartung einer „einen ID überall“ entsteht. Kalender und Termine bleiben an **`kalender_termine`** mit klarer **`quelle`/`typ`**-Semantik angebunden. Damit bleiben Cockpit (Shell/Auth), FUSA (Leistungs-/Fahrzeugauftrag) und CC Intern (interner Auftrag + Workflow) **fachlich getrennt**, **technisch aber kontrolliert gekoppelt** — ohne unkontrollierte zweite Datenwelt.

---

*Ende Referenz — bei Schema-/API-Änderungen dieses Dokument mitziehen.*
