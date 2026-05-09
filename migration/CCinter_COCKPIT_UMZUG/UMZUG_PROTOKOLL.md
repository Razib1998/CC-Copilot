# UMZUG_PROTOKOLL — CC Intern → Cockpit-Shell

**Erstellt:** 2026-04-13  
**Aktualisiert:** 2026-04-13 — §4 views/ aus index.html Aufteilung ergänzt  
**Quelle:** `CC inter/COCKPIT_Daten/cc-intern-modul/` + `CC inter/DEV/data/` + `CC inter/DEV/index.html`  
**Ziel:** `CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/`  
**Methode:** Nur kopiert — keine Datei verändert.

---

## Kopierte Modul-Dateien

### core/ — Adapter-Schicht

| Datei | Zeilen | Funktion |
|---|---|---|
| core/ApiAdapter.js | 122 | HTTP-Stub: Bearer-Token, fetch GET/POST/DELETE, Key→Endpunkt-Mapping |
| core/LocalStorageAdapter.js | 101 | localStorage-Wrapper: load/save/reset, Bild-Sonderbehandlung |
| core/SyncAdapter.js | 116 | Dual-Write: localStorage sofort + API fire-and-forget, Offline-Fallback |

### services/ — Zentrale Service-Schicht

| Datei | Zeilen | Funktion |
|---|---|---|
| services/CCInternDataService.js | 90 | Delegiert an aktiven Adapter (load/loadAsync/save/reset), Adapter-Switch via setAdapter() |

### module/ — 22 Modul-Dateien

#### module/auftraege/ (5 Dateien)

| Datei | Zeilen | Funktion |
|---|---|---|
| module/auftraege/checklisten.js | 240 | Vorlagen-Picker, vonVorlageAnwenden(), renderChecklistenOverview(), checklisteLeeren() |
| module/auftraege/dateien.js | 226 | Drag & Drop (initDragDrop), Filter, Rename (renameInline), Upload-Routing |
| module/auftraege/detail.js | 343 | Abnahme-Block, Foto-Upload+Komprimierung, abnahmeBestaetigen(), Felder live speichern |
| module/auftraege/kalender.js | 180 | ccGetAlleTermine() erweitert, ccCalDayClick(), ccKalenderSetFilter(), Filter-Tab-Injektion |
| module/auftraege/kommunikation.js | 237 | Chat-Wraps: renderChatBereich(), zitieren(), loeschen(), setFilter() |

#### module/ — Weitere 17 Module

| Datei | Zeilen | Funktion |
|---|---|---|
| module/angebote/index.js | 176 | AngeboteService, agSetStatus/agSave/agDuplizieren, Chat-Filter-Erweiterung |
| module/benutzer/index.js | 326 | CC_ROLLEN + CC_BENUTZER, hatRecht/hatRolle/benutzerInfo, Persistenz via DataService |
| module/checklisten/index.js | 134 | ClVorlagenService (8 Schreibfunktionen gewrappt: save/delete/move/toggle/etc.) |
| module/crm/index.js | 152 | CrmService, anfStatus/anfLoeschen/anfZuAngebot gewrappt |
| module/dashboard/index.js | 256 | Kennzahlen live aus globalen Arrays (AUFTRAEGE, AG_DATEN, MA_DATA...) |
| module/kunden/index.js | 183 | KundenService, kundeLoeschen, kundeLetzterKontaktHeute, kundeStatusSetzen |
| module/materiallager/index.js | 167 | Lager-Verwaltung, liest LAGER_CC global |
| module/mitarbeiter/index.js | 194 | MitarbeiterService, Verfügbarkeits-Picker (5 Optionen), maSetVerfuegbar |
| module/mitarbeiter-app/index.js | 190 | Mobile-Ansicht, Schritt-Abschluss-Logik |
| module/produktion/index.js | 140 | Produktions-Status, liest AUFTRAEGE global |
| module/rechnungen/index.js | 93 | RechnungenService.loadAsync(), async-Init für HTTP-Modus |
| module/schnell-anfragen/index.js | 208 | Schnell-Anfragen, direkte Persistenz via DataService |
| module/urlaub/index.js | 226 | Urlaubs-Workflow, URLAUB_ANTRAEGE, Genehmigung/Ablehnung |

**Gesamt Module:** 22 Dateien, 3.539 Zeilen

---

## Kopierte JSON-Datendateien (Produktivdaten)

| Datei | Größe | Inhalt |
|---|---|---|
| daten/auftraege.json | 117.976 Bytes | Auftragsbestand — zentrale Datenquelle |
| daten/cl_vorlagen.json | 14.805 Bytes | Checklisten-Vorlagen (8 Templates) |
| daten/kunden.json | 5.975 Bytes | Kundenstammdaten |
| daten/angebote.json | 3.383 Bytes | Angebote |
| daten/rechnungen.json | 3.253 Bytes | Rechnungsstatus |
| daten/anfragen.json | 1.429 Bytes | CRM-Anfragen / Leads |
| daten/notifications.json | 252 Bytes | Benachrichtigungen |

**Nicht kopiert:** `fusa_state.json` — gehört zu FUSA, nicht zu CC Intern.  
**Nicht kopiert:** `aufgaben.json` — nicht in der Zielstruktur vorgesehen.

---

## DataService-Status (Adapter-Bereitschaft)

### ✅ Adapter-ready via DataService (12 Module)

Diese Module nutzen `window.CCIntern.DataService` für alle Datenzugriffe. Ein Adapter-Wechsel auf das Cockpit-Backend erfordert **keine Änderungen** in den Modul-Dateien selbst — nur Konfiguration im Bootstrap.

| Modul | Key(s) |
|---|---|
| angebote/index.js | cc_intern_angebote_v1 |
| auftraege/checklisten.js | delegiert an globales saveAuftraege() |
| auftraege/dateien.js | delegiert an globale Upload-Funktionen |
| auftraege/detail.js | delegiert an globales saveAuftraege() |
| auftraege/kommunikation.js | delegiert an globales saveAuftraege() |
| benutzer/index.js | cc_intern_benutzer_v1, cc_intern_rollen_v1 |
| checklisten/index.js | cc_intern_cl_vorlagen_v1 |
| crm/index.js | cc_intern_anfragen_v1 |
| kunden/index.js | cc_intern_kunden_v1 / v2 |
| rechnungen/index.js | cc_intern_rechnungen_v1 |
| schnell-anfragen/index.js | cc_intern_anfragen_v1 |
| urlaub/index.js | cc_urlaub_v1 |

### ⚠️ Kein DataService — lesen nur globale Arrays (5 Module)

Diese Module greifen direkt auf globale JavaScript-Arrays zu (AUFTRAEGE, MA_DATA etc.), die in `index.html` leben. Für die Cockpit-Shell müssen diese Arrays durch API-Calls befüllt werden — die Modul-Logik selbst bleibt unverändert.

| Modul | Globale Arrays |
|---|---|
| auftraege/kalender.js | AUFTRAEGE, CC_FUSA_TERMINE |
| dashboard/index.js | AUFTRAEGE, AG_DATEN, ANF_DATEN, URLAUB_ANTRAEGE, LAGER_CC, MA_DATA, MA_ANWESENHEIT |
| materiallager/index.js | LAGER_CC |
| mitarbeiter-app/index.js | MA_DATA, AUFTRAEGE |
| produktion/index.js | AUFTRAEGE, MA_DATA |

### ⚠️ Direkter localStorage-Zugriff (1 Modul)

| Modul | Was | Begründung |
|---|---|---|
| mitarbeiter/index.js | `MA_VERF` (Verfügbarkeits-Status) | Operativer Tages-Status — bewusst kein Server-Sync nötig |

> Kein echter Blocker: MA_VERF ist Kurzzeit-Zustand (welcher MA heute verfügbar ist). Kann in der Cockpit-Shell als sessionStorage oder In-Memory-State geführt werden.

---

## Dateibaum _COCKPIT_UMZUG/

```
_COCKPIT_UMZUG/
├── core/
│   ├── ApiAdapter.js              122 Z.
│   ├── LocalStorageAdapter.js     101 Z.
│   └── SyncAdapter.js             116 Z.
├── services/
│   └── CCInternDataService.js      90 Z.
├── module/
│   ├── auftraege/
│   │   ├── checklisten.js         240 Z.
│   │   ├── dateien.js             226 Z.
│   │   ├── detail.js              343 Z.
│   │   ├── kalender.js            180 Z.
│   │   └── kommunikation.js       237 Z.
│   ├── angebote/index.js          176 Z.
│   ├── benutzer/index.js          326 Z.
│   ├── checklisten/index.js       134 Z.
│   ├── crm/index.js               152 Z.
│   ├── dashboard/index.js         256 Z.
│   ├── kunden/index.js            183 Z.
│   ├── materiallager/index.js     167 Z.
│   ├── mitarbeiter/index.js       194 Z.
│   ├── mitarbeiter-app/index.js   190 Z.
│   ├── produktion/index.js        140 Z.
│   ├── rechnungen/index.js         93 Z.
│   ├── schnell-anfragen/index.js  208 Z.
│   └── urlaub/index.js            226 Z.
├── daten/
│   ├── auftraege.json         117.976 Bytes  ← Produktivdaten
│   ├── angebote.json            3.383 Bytes
│   ├── anfragen.json            1.429 Bytes
│   ├── kunden.json              5.975 Bytes
│   ├── rechnungen.json          3.253 Bytes
│   ├── cl_vorlagen.json        14.805 Bytes
│   └── notifications.json         252 Bytes
└── UMZUG_PROTOKOLL.md
```

---

## Offene Punkte vor Cockpit-Integration

### 🔴 Erforderlich (Blocker)

**1. Bootstrap-Konfiguration anpassen**  
In der Cockpit-Shell muss beim Start einmalig konfiguriert werden:
```js
window.CCIntern.ApiAdapter.configure('https://cc-werbung.de/api/v1', jwtToken);
window.CCIntern.DataService.setAdapter(window.CCIntern.ApiAdapter);
```
Danach laufen alle 12 DataService-Module automatisch gegen das Cockpit-Backend — ohne Änderungen in den Modul-Dateien.

**2. Globale Arrays durch API-Daten ersetzen**  
5 Module lesen direkte globale Arrays aus `index.html`. Diese müssen in der Cockpit-Shell durch API-befüllte Variablen ersetzt werden:
- `AUFTRAEGE` → GET /api/v1/orders
- `MA_DATA` → GET /api/v1/employees
- `AG_DATEN` → (noch kein Endpunkt — muss noch gebaut werden)
- `ANF_DATEN` → (noch kein Endpunkt)
- `LAGER_CC` → GET /api/v1/inventory
- `URLAUB_ANTRAEGE` → GET /api/v1/absences
- `MA_ANWESENHEIT` → GET /api/v1/time-entries
- `CC_FUSA_TERMINE` → GET /api/v1/fusa/vehicles (oder separater Endpunkt)

**3. Key-Mapping prüfen**  
Der SyncAdapter mappt `cc_intern_auftraege_v1 → /auftraege`, aber das Cockpit-Backend verwendet `/api/v1/orders`. Das `_endpoints`-Mapping in `ApiAdapter.js` und `SyncAdapter.js` muss auf die neuen REST-Pfade angepasst werden.

**4. Datenmigration JSON → PostgreSQL**  
Die Produktivdaten in `daten/*.json` müssen in die PostgreSQL-Datenbank übertragen werden. Kein Import-Skript vorhanden. Reihenfolge: customers → employees → orders → order_steps.

### 🟡 Empfohlen (kein Blocker)

**5. MA_VERF von localStorage auf In-Memory**  
`mitarbeiter/index.js` schreibt Verfügbarkeits-Status direkt in localStorage. Für die Cockpit-Shell reicht ein `sessionStorage`- oder In-Memory-Map-Ansatz — nur eine Zeile zu ändern.

**6. Fehlende Backend-Endpunkte**  
Für vollständige Abdeckung müssen noch Routes gebaut werden:
- Angebote (`/api/v1/offers`)
- Anfragen/CRM (`/api/v1/inquiries`)
- Rechnungen (`/api/v1/invoices`)
- Urlaubs-Genehmigung (`/api/v1/absences/approve`)
- Checklisten-Vorlagen (`/api/v1/checklist-templates`)

**7. `index.html`-Monolith aufteilen**  
Die Module wrappen aktuell Funktionen aus `index.html` (openAuftragDetail, buildCCCalendar etc.). Für die Cockpit-Shell muss dieser Kern in separierte View-Dateien ausgelagert werden — das ist die größte Einzelarbeit.

### ✅ Bereits bereit

- Adapter-Schicht (ApiAdapter / LocalStorageAdapter / SyncAdapter) — vollständig, produktionsreif
- CCInternDataService — vollständig, Adapter-Switch ein Einzeiler
- 12 von 17 Modulen — laufen nach Bootstrap-Konfiguration ohne Änderungen gegen Cockpit-Backend
- Auth im Backend — JWT + Refresh + bcrypt, vollständig implementiert
- DB-Schema — 11 Migrationen, alle Kerntabellen vorhanden
- JSON-Produktivdaten — gesichert in daten/, bereit für Import-Skript

---

## §4 — views/ — Aufteilung aus index.html

**Quelle:** `CC inter/DEV/index.html` (15.753 Zeilen, Inline-`<script>`-Block: Zeilen 1317–11823)  
**Analysiert:** 314 Top-Level-Funktionen identifiziert und auf 13 Dateien aufgeteilt.  
**Methode:** Kopiert — keine Zeile in index.html verändert.

---

### Neue View-Dateien (views/)

| Datei | Zeilen | Größe | Inhalt |
|---|---|---|---|
| cc-intern-boot.js | 889 | 37 KB | Globale Arrays, Routing, DAL-Init, SSE, Sync, Export/Import |
| auftraege-view.js | 2.253 | 140 KB | Auftragsübersicht, Kanban, Schritte, Checklisten-Vorlagen |
| auftraege-detail-view.js | 10.952 | 558 KB | Auftragsdetail, Formular, Zeiterfassung, Dateien, Kommunikation |
| angebote-view.js | 666 | 35 KB | Angebote-Liste, Modal, Kalkulation, PDF |
| anfragen-view.js | 689 | 38 KB | Anfragen-Liste, Schnellanfragen-Formular, Kalkulator |
| kunden-view.js | 807 | 46 KB | Kunden, CRM-Pipeline, Aktivitäten, Wiedervorlagen |
| produktion-view.js | 17 | 1 KB | Platzhalter — Logik liegt in module/produktion/index.js |
| kalender-view.js | 2.974 | 165 KB | Kalender, Terminaggregation, Team-View, Termin-CRUD |
| rechnungen-view.js | 130 | 5 KB | Lexware-Telefonliste, tel-Check, telAktion |
| lager-view.js | 530 | 33 KB | Lager, Bestellungen, Artikel, Lieferanten |
| mitarbeiter-view.js | 835 | 40 KB | Mitarbeiter, Zeiterfassung, Kapazität, Detail-Overlay |
| urlaub-view.js | 88 | 5 KB | Urlaubsanträge, Genehmigung/Ablehnung |
| mitarbeiter-app-view.js | 70 | 3 KB | Mobil-Ansicht, Aufgaben nacherzeugen |

**Gesamt views/:** 13 Dateien, 20.920 Zeilen, 1.126 KB

---

### Globale Arrays in cc-intern-boot.js

Diese Arrays leben in index.html als globale `let`/`var`-Deklarationen und werden von allen View-Funktionen gelesen. In der Cockpit-Shell müssen sie durch API-befüllte Variablen ersetzt werden:

| Variable | Typ | Cockpit-Ersatz |
|---|---|---|
| `AUFTRAEGE` | let [] | GET /api/v1/orders |
| `MA_DATA` | const [] | GET /api/v1/employees |
| `MA_ANWESENHEIT` | let [] | GET /api/v1/time-entries |
| `URLAUB_ANTRAEGE` | let [] | GET /api/v1/absences |
| `LAGER_CC` | let [] | GET /api/v1/inventory |
| `LIEFERANTEN` | var [] | GET /api/v1/inventory (Lieferanten-Sektion) |
| `AG_DATEN` | let [] | GET /api/v1/offers ← **Endpunkt noch nicht gebaut** |
| `ANF_DATEN` | let [] | GET /api/v1/inquiries ← **Endpunkt noch nicht gebaut** |
| `LEADS` | let [] | GET /api/v1/inquiries |
| `CRM_KUNDEN` | var {} | GET /api/v1/customers |
| `CC_FUSA_TERMINE` | let [] | GET /api/v1/fusa/vehicles |
| `CC_NOTIF_DATA` | var [] | GET /api/v1/notifications |
| `currentPage` | let | Cockpit-Shell-Router ersetzen |
| `ZEIT_AKTIV` | var {} | sessionStorage oder In-Memory |
| `DAL_USE_API` | var | → true setzen |
| `DAL_BACKEND_URL` | var | → Cockpit-API-URL |

---

### Render-Funktionen — Zuweisung pro View-Datei

#### cc-intern-boot.js (25 Funktionen)
Routing + Bootstrap + DAL + Sync + Utilities

`goPage`, `handleNew`, `showToast`, `dalInit`, `dalPatchAuftraege`, `loadAuftraege`, `saveAuftraege`, `saveAufgaben`, `loadAufgaben`, `loadFusaTermine`, `saveFusaTermine`, `loadMitarbeiter`, `saveMitarbeiter`, `saveLieferanten`, `loadLieferanten`, `saveLager`, `loadLager`, `saveAnwesenheit`, `loadAnwesenheit`, `saveUrlaub`, `loadUrlaub`, `saveLeads`, `loadLeads`, `ccSyncInit`, `ccSseConnect`, `ccPollStart`, `ccSyncReloadCollection`, `ccNotifLaden`, `ccNotifBadgeUpdate`, `ccNotifToggle`, `ccNotifRender`, `ccNotifClear`, `ccSyncSetStatus`, `ccExport`, `ccImport`, `ccSelbsttest`, `assert`, `stunden`, `parseLokalesDatum`, `naechsterArbeitstag`

#### auftraege-view.js (22 Funktionen)
Auftragsübersicht, Kanban-Board, Schrittlogik, Checklisten-Vorlagen-Verwaltung

`auVerwTab`, `renderAuftragVerwaltung`, `renderKanban`, `schrittDaten`, `schrittMigrieren`, `schrittAbschliessbar`, `istVerantwortlicher`, `schrittStatusSetzen`, `schrittFertig`, `loescheAuftrag`, `showWorkflowNotif`, `renderChecklisten`, `clOpenVorlage`, `clNeuModal`, `clSelFarbe`, `clSaveVorlage`, `clDeleteVorlage`, `clAddPunkt`, `clEditPunkt`, `clSavePunkt`, `clDeletePunkt`, `clMovePunkt`, `clToggleAktiv`, `clDuplizieren`, `clBearbeiten`, `clSaveBearbeiten`, `clDrucken`

#### auftraege-detail-view.js (135 Funktionen — größtes Modul)
Auftragsdetail, Produktion, Zeiterfassung, Kommunikation, Datei-Upload, Checklisten-Auftrag

Schlüsselfunktionen: `openAuftragDetail`, `submitAuftrag`, `buildSchritt`, `auProjektFelderRender`, `auInitSelects`, `auToggleStep`, `auRenderStepDetails`, `zeitStart`/`zeitStop`/`zeitTick`, `sendKommentar`, `renderChatBereich`, `auFileAdd`, `prodAddDatei`, `ccCompressImage`, `clChecklistenFuerSchritt`, `auftragAufgabenErzeugen`, `showAufgabenVorschau`

#### angebote-view.js (22 Funktionen)
`agModalOpen`, `agRenderPositionen`, `agCalcSumme`, `berechneAngebot`, `tabAG`, `agSave`, `agOpenDetail`, `agSetStatus`, `renderAngebote`

#### anfragen-view.js (30 Funktionen)
`anfNeuModal`, `anfCalcUndRender`, `renderItems`, `anfSpeichern`, `renderAnfragen`, `anfOpenDetail`, `anfStatus`

#### kunden-view.js (25 Funktionen)
`renderKunden`, `openKundenDetail`, `saveKunde`, `renderCrmPipeline`, `openCrmDetail`, `renderAktivitaeten`, `openAktivModal`, `saveAktivitaet`, `exportKundePDF`

#### kalender-view.js (14 Funktionen)
`buildCCCalendar`, `ccGetAlleTermine`, `ccCalDayClick`, `submitCCTermin`, `ccOpenTeamView`, `ccBuildUpcoming`

#### lager-view.js (23 Funktionen)
`renderLagerCC`, `lagerArtikelModal`, `lagerBestellModal`, `lagerBestellungAufgeben`, `lagerLieferantenModal`

#### mitarbeiter-view.js (33 Funktionen)
`renderMitarbeiter`, `maOpenDetail`, `maRenderDetailOverlay`, `maOpenSettings`, `maSaveSettings`, `maHeuteHtml`, `maWocheHtml`, `maAnwesenheitHtml`, `maAuftragsZeitHtml`, `zeitStart`, `zeitStop`, `openZeitDetails`

#### rechnungen-view.js (4 Funktionen)
`telCheckOpen`, `telCheckClose`, `telCalc`, `telAktion`

#### urlaub-view.js (2 Funktionen)
`renderUrlaubAntraege`, `urlaubEntscheiden`

#### mitarbeiter-app-view.js (1 Funktion)
`mobAufgabenNacherzeugen`

---

### Offene Punkte (views/)

#### 🔴 Blocker

**1. Globale Arrays ersetzen**  
Alle View-Funktionen lesen direkt aus globalen Arrays (`AUFTRAEGE`, `MA_DATA` etc.). In der Cockpit-Shell müssen diese Arrays durch API-Calls befüllt werden, bevor die View-Funktionen aufgerufen werden. Empfehlung: Ein zentraler `cc-intern-data-store.js` der alle Arrays hält und per API initialisiert.

**2. cc-intern-boot.js an Cockpit-Lifecycle anpassen**  
Der `DOMContentLoaded`-Block initialisiert heute direkt: `ccSyncInit()` + `dalInit()`. In der Cockpit-Shell gibt es einen eigenen Lifecycle. Der Boot-Block muss als Funktion `ccInternInit()` exportiert werden und vom Cockpit-Shell-Router aufgerufen werden.

**3. `saveAuftraege()` zentral für viele Module**  
Viele auftraege-detail-Funktionen rufen `saveAuftraege()` auf. Für das Cockpit muss `saveAuftraege()` durch `API PATCH /orders/:id` ersetzt oder der DataService konfiguriert werden.

#### 🟡 Empfohlen

**4. auftraege-detail-view.js aufteilen**  
Mit 10.952 Zeilen und 135 Funktionen ist die Datei das komplexeste Modul. Für langfristige Wartbarkeit empfiehlt sich eine weitere Aufteilung in:
- `auftraege-formular-view.js` — openAuftragModal, auInitSelects, auProjektFelderRender (~4.000 Z.)
- `auftraege-kommunikation-view.js` — Kommentar/Chat (~300 Z.)
- `auftraege-zeit-view.js` — Zeiterfassung (~200 Z.)
- `auftraege-dateien-view.js` — Datei-Upload (~150 Z.)
- `auftraege-detail-kern-view.js` — openAuftragDetail, buildSchritt (~500 Z.)

**5. `ccGetAlleTermine()` teilen zwischen Kalender + Aufträge**  
`ccGetAlleTermine()` liest aus `AUFTRAEGE` + `CC_FUSA_TERMINE` + `URLAUB_ANTRAEGE`. Für Cockpit: Diese Aggregation durch `GET /api/v1/calendar` ersetzen (Endpunkt bereits gebaut).

**6. Fehlende Backend-Endpunkte für Angebote und Anfragen**  
`angebote-view.js` und `anfragen-view.js` haben noch keinen entsprechenden Route-File im Backend. Diese müssen parallel gebaut werden.

---

## Gesamtübersicht _COCKPIT_UMZUG/

```
_COCKPIT_UMZUG/
├── core/
│   ├── ApiAdapter.js              122 Z.
│   ├── LocalStorageAdapter.js     101 Z.
│   └── SyncAdapter.js             116 Z.
├── services/
│   └── CCInternDataService.js      90 Z.
├── module/                        22 Dateien, 3.539 Z.
│   ├── auftraege/  (5 Dateien)
│   └── [16 weitere Modul-Dateien]
├── daten/                          7 JSON-Dateien, 147 KB
├── views/                         13 Dateien, 20.920 Z., 1.126 KB
│   ├── cc-intern-boot.js
│   ├── auftraege-view.js
│   ├── auftraege-detail-view.js   ← größte Datei (10.952 Z.)
│   ├── angebote-view.js
│   ├── anfragen-view.js
│   ├── kunden-view.js
│   ├── produktion-view.js         ← Platzhalter
│   ├── kalender-view.js
│   ├── rechnungen-view.js
│   ├── lager-view.js
│   ├── mitarbeiter-view.js
│   ├── urlaub-view.js
│   └── mitarbeiter-app-view.js
└── UMZUG_PROTOKOLL.md
```

**Gesamtstand:** 42 Dateien strukturiert, ~24.800 Zeilen Code isoliert, bereit für Cockpit-Integration.
