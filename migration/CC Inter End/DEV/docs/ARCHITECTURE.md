# CC Intern Desktop — Architektur

> Referenz-Dokument. Nur Doku. Kein Code wird hier geändert.
> Stand: 2026-04-08

---

## Systemlinie

CC Intern Desktop ist das **operative Arbeitsmodul** der CC-Cockpit-Plattform.
Läuft als eigenständige Desktop-App (Node.js, Port 3002), schrittweise auf die gemeinsame Plattform-Basis migriert.

| Was | Wer |
|---|---|
| Login / Auth / Rechte-Grundsystem | CC Cockpit (Plattform) |
| Benutzerverwaltung, Projektzugang | CC Cockpit |
| **Operative Arbeit: Aufträge, Produktion, Kunden** | **CC Intern** |
| FUSA-spezifische Bereiche | FUSA-Modul |

---

## Was in CC Intern gehört

| Bereich | Status |
|---|---|
| Aufträge + Auftragsdetail | ✅ vorhanden + Modul-Erweiterungen |
| Angebote / Schnell-Angebot | ✅ vorhanden + Persistenz-Modul |
| Produktion / Status | ✅ vorhanden |
| Kunden / CRM | ✅ vorhanden + Persistenz-Module |
| Mitarbeiter-Zuordnung | ✅ vorhanden + Quick-Verfügbarkeit |
| Rechnungen (RECHNUNGEN-Array) | ✅ vorhanden + Async-Sync |
| Kalenderansichten auf Auftragsbasis | ✅ aktiv (kalender.js) |
| Dateien / Uploads pro Auftrag | ✅ aktiv (dateien.js + Drag & Drop) |
| Checklisten pro Schritt + Vorlagen | ✅ aktiv (checklisten.js) |
| Interne Kommunikation zum Auftrag | ✅ aktiv (kommunikation.js) |
| Abnahme / Dokumentation | ✅ aktiv (detail.js — renderAbnahmeBlock) |

## Was NICHT in CC Intern gehört

- Globale Benutzerverwaltung → Cockpit
- Projektverwaltung → Cockpit
- Einladungen / Auth / Login → Cockpit
- FUSA-Bereiche → FUSA-Modul
- Globale Rechte-Grundlogik → Cockpit

---

## Technische Basis (IST)

- **Server:** Node.js, keine npm-Abhängigkeiten, Port 3002
- **Datenspeicher:** `data/*.json` (Flat-File, kein Datenbankserver)
- **Frontend:** Vanilla JS, alles in `index.html` (~15.800 Zeilen, stabiler Kern)
- **Adapter:** LocalStorageAdapter / ApiAdapter / SyncAdapter → `js/core/` ✅
- **DataService:** CCInternDataService → `js/services/` ✅
- **Module:** `js/modules/` → 7 Bereiche aktiv ✅
- **SSE:** Live-Updates zwischen Geräten im LAN

---

## Aktuelle Ordnerstruktur (IST)

```
DEV/
│
├── docs/
│   ├── ARCHITECTURE.md        ← diese Datei
│   ├── README.md
│   └── DEV_STATE.md
│
├── js/
│   ├── core/                  ✅ migriert (ehemals adapters/)
│   │   ├── LocalStorageAdapter.js
│   │   ├── ApiAdapter.js
│   │   └── SyncAdapter.js
│   ├── services/              ✅ migriert (ehemals services/)
│   │   └── CCInternDataService.js
│   └── modules/
│       ├── auftraege/         ✅ aktiv
│       │   ├── detail.js      ← Abnahme & Dokumentation
│       │   ├── kalender.js    ← Liefertermin-Events, Filter, Tages-Panel
│       │   ├── dateien.js     ← Drag & Drop, Datei-Typ-Filter
│       │   ├── checklisten.js ← Vorlagen-Picker, Schritt-Übersicht
│       │   └── kommunikation.js ← Chat-Filter, Zitieren, Löschen
│       ├── angebote/          ✅ aktiv
│       │   └── index.js       ← Persistenz + Duplizieren + Chat-Filter
│       ├── kunden/            ✅ aktiv
│       │   └── index.js       ← Persistenz + Löschen + Kontakt-heute
│       ├── crm/               ✅ aktiv
│       │   └── index.js       ← Persistenz + Löschen
│       ├── checklisten/       ✅ aktiv
│       │   └── index.js       ← CL_VORLAGEN Persistenz (8 Wraps)
│       ├── rechnungen/        ✅ aktiv
│       │   └── index.js       ← Async-Sync (Write war bereits fertig)
│       └── mitarbeiter/       ✅ aktiv
│           └── index.js       ← Quick-Verfügbarkeit pro MA
│
├── shared/
│   └── constants/
│       └── collections.js     ✅ KEY_MAP + COLLECTIONS
│
├── data/                      ✅ aktiv (JSON-Datenspeicher)
│   └── *.json
│
├── index.html                 ✅ läuft — Haupt-App, stabiler Kern
└── server.js                  ✅ läuft — HTTP + SSE + CRUD
```

---

## Modul-Einbindungs-Pattern (aktuell)

**Script-Lade-Reihenfolge in index.html:**
```
index.html (~Zeile 1288)
  └→ <script src="js/core/LocalStorageAdapter.js">
  └→ <script src="js/core/ApiAdapter.js">
  └→ <script src="js/core/SyncAdapter.js">
  └→ <script src="js/services/CCInternDataService.js">
  └→ <script src="js/modules/auftraege/detail.js">
  └→ <script src="js/modules/auftraege/kalender.js">
  └→ <script src="js/modules/auftraege/dateien.js">
  └→ <script src="js/modules/auftraege/checklisten.js">
  └→ <script src="js/modules/auftraege/kommunikation.js">
  └→ <script src="js/modules/angebote/index.js">
  └→ <script src="js/modules/kunden/index.js">
  └→ <script src="js/modules/crm/index.js">
  └→ <script src="js/modules/checklisten/index.js">
  └→ <script src="js/modules/rechnungen/index.js">
  └→ <script src="js/modules/mitarbeiter/index.js">
  └→ <INLINE SCRIPT> (~Zeile 1318, ~10.500 Zeilen) ← alle Funktions-Deklarationen
```

**KRITISCH — Timing-Regel:** Module-Scripts laufen VOR dem Inline-Script.
`function`-Deklarationen im Inline-Script überschreiben alles was Module per
`window.funcName = ...` gesetzt haben.

**Fix-Pattern (in allen Modulen implementiert):** Wraps werden NICHT im IIFE-Body
registriert, sondern in einer `_installWraps()`-Funktion, die aus `init()` oder
einem DOMContentLoaded-Listener aufgerufen wird:

```js
function _installWraps() {
  var _orig = window.funcName;   // jetzt wirklich definiert
  window.funcName = function() {
    var r = typeof _orig === 'function' ? _orig.apply(this, arguments) : undefined;
    save();
    return r;
  };
}

function init() {
  _installWraps();  // erst nach DOMContentLoaded
  load(...);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { setTimeout(init, N); });
} else {
  setTimeout(init, N);
}
```

**Hook-Pattern für auftragDetailModuleInit:** Jedes auftraege/*-Modul registriert sich
via function-wrapping — ebenfalls in `_installHook()` über DOMContentLoaded:
```js
function _installHook() {
  var _prev = window.auftragDetailModuleInit;
  window.auftragDetailModuleInit = function(id) {
    if (typeof _prev === 'function') _prev(id);
    setTimeout(function() { myInit(id); }, 30); // eigener Delay
  };
}
document.addEventListener('DOMContentLoaded', _installHook);
```

`openAuftragDetail` (index.html) ruft am Ende auf:
```js
if(typeof auftragDetailModuleInit==='function') auftragDetailModuleInit(id);
```

---

## Kommunikationsweg (aktuell)

```
Browser (index.html)
  └→ CCInternDataService (js/services/)
       └→ SyncAdapter (js/core/)         ← aktiv wenn Server erreichbar
            └→ server.js (Port 3002)
                 └→ data/*.json
       └→ LocalStorageAdapter (js/core/) ← Offline-Fallback / Demo
```

---

## Bewusste Altbereiche in index.html

Diese Bereiche bleiben bewusst in `index.html` bis eine saubere Extraktion möglich ist:

| Bereich | Funktion | Warum noch in index.html |
|---|---|---|
| `openAuftragDetail()` | ~600 Zeilen, Haupt-Detail-Render | Zu groß für Big-Bang-Move, stabil |
| `buildCCCalendar()` | Kalender-Grid | Stabil, Module erweitern es |
| `renderChatBereich()` | Chat-Render | Wird von kommunikation.js gewrappt |
| `schrittClToggle()`, `auCheckToggle()` | Checklisten-Toggle | Stabile Basis-Funktion |
| `prodAddDatei()`, `detailFotoUpload()` | Datei-Upload | Wird von dateien.js delegiert |
| `saveAuftraege()` | Zentraler Save-Dispatcher | DataService-Wrapper, bleibt |
| `ccGetAlleTermine()` | Termin-Aggregation | Wird von kalender.js gewrappt |
| `loadMitarbeiter()` / `saveMitarbeiter()` | MA-Persistenz | Bereits vollständig + loadAsync |
| `loadRechnungen()` / `saveRechnungenData()` | Rechnungen-Persistenz | Wird von rechnungen/index.js async-ergänzt |

---

## Phasen-Überblick

```
Phase 1 — Struktur                              ✅ DONE
  Ordner-Skelett + Docs
  Adapter + Service → js/core/ + js/services/

Phase 2 — Auftragsdetail-Module                 ✅ DONE
  js/modules/auftraege/detail.js (Abnahme)
  js/modules/auftraege/kalender.js
  js/modules/auftraege/dateien.js
  js/modules/auftraege/checklisten.js
  js/modules/auftraege/kommunikation.js

Phase 3 — Weitere Module + Persistenz           ✅ DONE
  js/modules/angebote/
  js/modules/kunden/
  js/modules/crm/
  js/modules/checklisten/
  js/modules/rechnungen/
  js/modules/mitarbeiter/

Phase 3b — Abschluss-Bugfix                     ✅ DONE
  DOMContentLoaded-Timing-Bug gefixt (alle 9 betroffenen Module)
  _installWraps() / _installHook() Pattern etabliert

Phase 4 — Backend-Struktur                      ⏳ wenn nötig
  backend/src/core/ (data-store, sse)
  backend/src/routes/
  backend/src/modules/

Phase 5 — CSS-Extraktion                        ⏳ niedrige Priorität
  styles/base/ (Variablen, Reset)
  styles/modules/ (Modul-CSS)
```

---

## Bau-Regel

> Kein Big Bang. Erst Struktur, dann Funktionsausbau.
> Jeder Move braucht grünen Check vorher und nachher.
> `index.html` und `server.js` bleiben Haupt-Dateien bis ein Modul sauber extrahiert ist.
> Neue Features kommen in Modul-Dateien — nicht zurück in index.html.
> Wraps immer in `_installWraps()` / `_installHook()` — nie im IIFE-Body.

---

## Architektur-Regel: FUSA / CC Intern Trennung

**FUSA und CC Intern bleiben fachlich getrennte Module.**

FUSA-Preise, -Pakete und -Fahrzeuge dürfen **nicht** direkt als CC-Intern-Preise verwendet werden.
CC Intern hat eine eigene Preislogik für Schnell-Angebote, Angebote, Produktion und Rechnungen.

**Gemeinsam erlaubt:**
- Kunden / Firmen
- Kalender
- FUSA-Freigabe → CC Intern Produktion

**Verboten:**
- Keine gemeinsame Preistabelle für FUSA und CC Intern bauen.
