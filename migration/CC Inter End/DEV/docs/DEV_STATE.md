# DEV_STATE — CC Intern Desktop

> Echter IST-Stand. Kein Wunschbild.
> Stand: 2026-04-08

---

## Gesamtstatus

| Bereich | Status |
|---|---|
| Server (server.js) | ✅ läuft, Port 3002, keine npm-Deps |
| Datenspeicher (data/*.json) | ✅ aktiv |
| Frontend (index.html) | ✅ läuft — ~15.800 Zeilen, stabiler Kern |
| js/core/ (Adapter) | ✅ migriert — LocalStorage / Api / SyncAdapter |
| js/services/ (DataService) | ✅ migriert — CCInternDataService |
| js/modules/auftraege/ | ✅ aktiv — 5 Modul-Dateien |
| js/modules/angebote/ | ✅ aktiv — Persistenz + Duplikat + Chat-Filter |
| js/modules/kunden/ | ✅ aktiv — Persistenz + Löschen + Status-Schnellwechsel |
| js/modules/crm/ | ✅ aktiv — Persistenz + Löschen |
| js/modules/checklisten/ | ✅ aktiv — Persistenz CL_VORLAGEN (8 Wraps) |
| js/modules/rechnungen/ | ✅ aktiv — Async-Sync (Write war bereits fertig) |
| js/modules/mitarbeiter/ | ✅ aktiv — Quick-Verfügbarkeit pro MA |
| Alte Pfade (adapters/, services/) | ✅ gelöscht, Referenzen in index.html aktualisiert |

---

## Was aktiv läuft (IST)

### Backend
```
server.js                          ✅ aktiv — HTTP + SSE + CRUD-Endpunkte
  /api/events                      ← SSE Live-Updates
  /api/ping                        ← Health-Check
  /api/notifications               ← Benachrichtigungen
  /api/:collection                 ← CRUD für alle Collections
data/auftraege.json                ✅ aktiv
data/aufgaben.json                 ✅ aktiv
data/notifications.json            ✅ aktiv
```

### Collections (KEY_MAP in server.js + shared/constants/collections.js)
```
cc_intern_auftraege_v1   → auftraege
cc_intern_fusa_v1        → fusa_termine
cc_intern_ma_v1          → mitarbeiter
cc_intern_aufgaben_v1    → aufgaben
cc_intern_anwesenheit_v1 → anwesenheit
cc_intern_urlaub_v1      → urlaub
cc_intern_leads_v1       → leads
cc_intern_lager_v1       → lager
cc_intern_rechnungen_v1  → rechnungen
cc_intern_kunden_v1/v2   → kunden
cc_intern_lieferanten_v1 → lieferanten
cc_intern_angebote_v1    → angebote          ← neu (angebote/index.js)
cc_intern_anfragen_v1    → anfragen          ← neu (crm/index.js)
cc_intern_cl_vorlagen_v1 → cl_vorlagen       ← neu (checklisten/index.js)
```

### Frontend — Seiten (in index.html)
```
pg-dashboard      ✅ aktiv — Kennzahlen, Übersicht
pg-anfragen       ✅ aktiv — Anfragen-Verwaltung
pg-angebote       ✅ aktiv — Angebote
pg-auftraege      ✅ aktiv — Auftragsliste + Kanban
pg-kunden         ✅ aktiv — Kundenverwaltung
pg-crm            ✅ aktiv — CRM-Pipeline
pg-produktion     ✅ aktiv — Produktions-Status
pg-lager          ✅ aktiv — Lagerverwaltung
pg-mitarbeiter    ✅ aktiv — Mitarbeiter-Übersicht
pg-urlaub         ✅ aktiv — Urlaubsplanung
pg-mobil          ✅ aktiv — Mobile-Ansicht
pg-rechnungen     ✅ aktiv — Rechnungen / Lexware
pg-kalender       ✅ aktiv — Kalender + FUSA-Sync
```

### Adapter + Service (migriert)
```
js/core/LocalStorageAdapter.js     ✅ aktiv — Browser-localStorage
js/core/ApiAdapter.js              ✅ aktiv — Backend-Stub (HTTP-ready)
js/core/SyncAdapter.js             ✅ aktiv — Dual-Write (localStorage + API)
js/services/CCInternDataService.js ✅ aktiv — zentrale Service-Schicht
```

### Module: Aufträge (neue Dateien)
```
js/modules/auftraege/detail.js        ✅ aktiv
  renderAbnahmeBlock(a)               → Abnahme & Dokumentation im Detail
  abnahmeBestaetigen(id)              → Status auf 'abgenommen' setzen
  abnahmeFotoUpload(id, event)        → Fotos mit Komprimierung
  abnahmeFotoLoeschen(id, idx)        → Foto entfernen
  abnahmeFieldSave(input)             → Kontakt/Datum live speichern
  abnahmeNotizSave(id, val)           → Freitext speichern

js/modules/auftraege/kalender.js      ✅ aktiv
  ccGetAlleTermine() erweitert        → Liefertermin als grüner Event
  ccCalDayClick() ersetzt             → Tages-Panel mit allen Aufträgen
  ccKalenderSetFilter(typ)            → Filter: alle/montage/produktion/heute
  Filter-Tabs auto-injiziert          → beim Wechsel zur Kalender-Seite

js/modules/auftraege/dateien.js       ✅ aktiv
  initDragDrop(auftragId)             → Drag & Drop auf dp-files-zone-{id}
  setFilter(auftragId, typ)           → Filter: alle/bilder/pdf/sonstiges
  renameInline(auftragId, src, idx)   → Datei umbenennen
  Routing: Bilder → detailFotoUpload  → (komprimiert + dataUrl)
  Routing: Sonstiges → prodAddDatei   → (Metadaten)

js/modules/auftraege/checklisten.js   ✅ aktiv
  vonVorlageAnwenden(id, step, vlId)  → CL-Vorlage auf Schritt anwenden
  vorlagenPicker(id, step)            → Modal mit allen aktiven Vorlagen
  renderChecklistenOverview(id)       → Mini-Progress aller 5 Schritte
  checklisteLeeren(id, step)          → Checkliste eines Schritts leeren

js/modules/auftraege/kommunikation.js ✅ aktiv

js/modules/kunden/index.js            ✅ aktiv
  KundenService.save()                → CRM_KUNDEN → DataService (localStorage + Server)
  KundenService.load()                → DataService → window.CRM_KUNDEN (var, direkt ersetzbar)
  saveKunde() gewrappt                → auto-save nach Anlegen/Bearbeiten
  openKundenDetail() gewrappt         → "Löschen" + "Kontakt heute" Button injiziert
  kundeLoeschen(key)                  → löscht aus CRM_KUNDEN + auto-save
  kundeLetzterKontaktHeute(key)       → setzt letzterKontakt auf heute
  kundeStatusSetzen(key, status)      → Schnell-Statuswechsel + save

js/modules/crm/index.js              ✅ aktiv
  CrmService.save()                   → ANF_DATEN → DataService
  CrmService.load()                   → DataService → ANF_DATEN (in-place, let-Array)
  anfStatus() gewrappt                → auto-save nach Status-Wechsel
  anfAngebotErstellen() gewrappt      → auto-save
  anfZuAngebot() gewrappt             → auto-save (Kette mit angebote/index.js)
  anfOpenDetail() gewrappt            → "Löschen"-Button injiziert
  anfLoeschen(id)                     → löscht aus ANF_DATEN + auto-save

js/modules/checklisten/index.js      ✅ aktiv
  ClVorlagenService.save()            → CL_VORLAGEN → DataService
  ClVorlagenService.load()            → DataService → CL_VORLAGEN (in-place)
  8 Schreibfunktionen gewrappt:       clSaveVorlage, clDeleteVorlage, clSavePunkt,
                                      clDeletePunkt, clMovePunkt, clToggleAktiv,
                                      clDuplizieren, clSaveBearbeiten
  Besonderheit: clDeleteVorlage reassigns CL_VORLAGEN — save() greift immer per Name zu

js/modules/rechnungen/index.js       ✅ aktiv
  RechnungenService.save()            → delegiert an saveRechnungenData() (bereits DataService-ready)
  RechnungenService.loadAsync()       → DataService.loadAsync() → window.RECHNUNGEN (var, reassign)
  Async-Init bei HTTP-Modus          → holt Server-Stand nach (sync load in index.html reicht offline)
  Besonderheit: Write-Pfad war bereits vollständig — nur Async-Read ergänzt

js/modules/mitarbeiter/index.js      ✅ aktiv
  MitarbeiterService                  → getVerfuegbar(maId), setVerfuegbar(maId, status), reload()
  maSetVerfuegbar(maId, status)       → setzt Status in MA_VERF + localStorage
  maOpenVerfuegbarPicker(maId, el)    → Status-Popup (5 Optionen)
  renderMitarbeiter() gewrappt        → Status-Badge + Toggle-Button auf jede MA-Karte
  goPage() gewrappt                   → re-render bei MA-Seitenwechsel
  Speicher: localStorage (operativer Tages-Status, kein Server-Sync nötig)

js/modules/angebote/index.js          ✅ aktiv
  AngeboteService.save()              → AG_DATEN → DataService (localStorage + Server)
  AngeboteService.load()              → DataService → AG_DATEN (überschreibt Demo)
  agSetStatus() gewrappt              → auto-save nach Status-Wechsel
  agSave() gewrappt                   → auto-save nach Bearbeiten/Speichern
  anfZuAngebot() gewrappt             → auto-save nach Anfrage→Angebot
  agOpenDetail() gewrappt             → "Duplizieren"-Button injiziert
  agDuplizieren(id)                   → Deep-Copy + neues AG-YYYY-NNN + entwurf
  renderChatBereich() erweitert       → Filter-Tabs (Alle/Fragen/Offen)
  setFilter(id, typ)                  → Chat-Filter ohne Re-Render
  zitieren(id, idx, inp)              → Text als Zitat ins Eingabefeld
  loeschen(id, idx)                   → eigene Nachricht löschen
```

---

## Datenmodell-Erweiterungen (durch Module)

### a.abnahme (neu durch detail.js)
```js
a.abnahme = {
  status:  'offen' | 'fotos_ok' | 'abgenommen',
  kontakt: '',   // Ansprechpartner Kunde
  datum:   '',   // ISO-Datum der Abnahme
  notiz:   '',   // Freitext Mängel/Besonderheiten
  fotos:   []    // [{name, dataUrl, mimeType, size, ts}]
}
```
Wird non-destructive angelegt (nur wenn Feld fehlt).

---

## Hooks in index.html (Änderungen durch Module)

| Zeile (ca.) | Änderung | Zweck |
|---|---|---|
| ~1294 | 5× `<script src="js/modules/auftraege/...">` | Module laden |
| ~3870 | `id="dp-files-zone-'+a.id+'"` auf files-Section | Drag & Drop Anker |
| ~3939 | `renderAbnahmeBlock(a)` in dpBody-HTML | Abnahme-Block |
| ~3957 | `auftragDetailModuleInit(id)` am Ende | Module-Init-Hook |

---

## Bewusste Altbereiche (bleiben in index.html)

Diese Funktionen sind stabil und werden von Modul-Dateien nur **erweitert**, nicht ersetzt:

| Funktion | Status | Modul erweitert |
|---|---|---|
| `openAuftragDetail()` (~600 Zeilen) | ✅ bleibt — zu groß für Move | detail.js, dateien.js, checklisten.js |
| `buildCCCalendar()` | ✅ bleibt — stabil | kalender.js wraps ccGetAlleTermine |
| `renderChatBereich()` | ✅ bleibt als Basis | kommunikation.js wraps es |
| `schrittClToggle()`, `auCheckToggle()` | ✅ bleibt — Basis-Logik | checklisten.js ergänzt |
| `prodAddDatei()`, `detailFotoUpload()` | ✅ bleibt — Upload-Logik | dateien.js delegiert |
| `saveAuftraege()` | ✅ bleibt — DataService-Wrapper | alle Module nutzen es |
| `ccGetAlleTermine()` | ✅ bleibt als Basis | kalender.js wraps es |
| `CC_FUSA_TERMINE` Array | ✅ bleibt — Rohdaten | kalender.js liest |

---

## Behobene Bugs (Abschluss-Runde)

### DOMContentLoaded-Timing-Bug (kritisch, behoben)
```
Problem:  Module-Scripts laufen BEVOR der Inline-<script>-Block (Zeile ~1318).
          function-Deklarationen im Inline-Script überschreiben alle sofortigen
          window.funcName = ... Zuweisungen aus den Modulen.
Fix:      Alle Wraps in _installWraps() / _installHook() ausgelagert.
          Diese Funktionen werden erst über DOMContentLoaded / init() aufgerufen,
          wenn alle Inline-Scripts bereits ausgeführt wurden.
Betroffen: 9 Module — alle gefixt:
  - auftraege/kalender.js       (_installWraps im DOMContentLoaded)
  - auftraege/kommunikation.js  (_installWraps im DOMContentLoaded)
  - auftraege/dateien.js        (_installHook im DOMContentLoaded)
  - auftraege/checklisten.js    (_installHook im DOMContentLoaded)
  - angebote/index.js           (_installWraps in init())
  - kunden/index.js             (_installWraps in init())
  - crm/index.js                (_installWraps in init())
  - checklisten/index.js        (_installWraps in init())
  - mitarbeiter/index.js        (_installWraps in init())
Nicht betroffen: auftraege/detail.js, rechnungen/index.js
  (definieren nur neue Funktionen, wrappen keine bestehenden)
```

---

## Was als nächstes sinnvoll wäre

**CC Intern ist strukturell abgeschlossen.** Alle geplanten Module sind aktiv,
alle bekannten Bugs sind behoben. Nächste sinnvolle Schritte:

**Option A — Backend-Struktur (wenn nötig)**
```
backend/src/core/data-store.js   → readData/writeData aus server.js
backend/src/core/sse.js          → SSE-Logik
backend/src/routes/api.js        → HTTP-Routing
```
Nur wenn server.js zu groß wird oder neue Backend-Features nötig sind.

**Option B — Produktion-Modul**
```
js/modules/produktion/index.js   → Produktions-Status, Schritt-Tracking
```
Falls Produktionsbereich weiter ausgebaut werden soll.

**Option C — CSS-Extraktion**
```
styles/base/variables.css        → CSS-Custom-Properties aus index.html
styles/modules/auftraege.css     → Modul-CSS
```
Niedrige Priorität — CSS ist stabil, kein Druck.

### Empfohlene Reihenfolge (wenn weiter)
1. **FUSA-Modul** — nächster großer Bereich
2. **Backend-Kern** — wenn server.js Probleme macht
3. **CSS** — zuletzt

---

## Feste Regeln

> Neue Features kommen in Modul-Dateien — nicht zurück in index.html.
> Kein Move ohne grünen Check vorher und nachher.
> `index.html` und `server.js` bleiben Haupt-Dateien solange sie stabil laufen.
> Wraps IMMER in `_installWraps()` / `_installHook()` — nie direkt im IIFE-Body.
> Grund: Module laden VOR dem Inline-Script. Sofortige window.X = ... Zuweisungen
>         werden von function-Deklarationen im Inline-Script überschrieben.
