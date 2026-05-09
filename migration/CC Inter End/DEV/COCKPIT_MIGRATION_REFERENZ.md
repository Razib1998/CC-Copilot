# CC INTERN — COCKPIT MIGRATIONS-REFERENZ

**Erstellt:** 2026-04-08
**Basis:** CC Intern (`index.html` 15.725 Zeilen, `server.js`)
**Zweck:** Fachliche Grundlage für den Cockpit-Neubau. Kein Refactoring. Kein Umbau. Nur Dokumentation.

---

## ÜBERNAHMESTRATEGIE (KURZFASSUNG)

| Kategorie | Was |
|---|---|
| **ÜBERNEHMEN** (als Spezifikation) | Workflow-Logik, Archivierungskonzept, Lexware-Queue, Urlaubsworkflow, Kalender-Aggregation, DAL-Adapter-Idee, Benachrichtigungskonzept |
| **NEU BAUEN** (für Cockpit) | Normalisiertes Datenmodell, Auth/Rollen, Filestore, MA als pflegbare Tabelle, echte FKs, versionierte API |
| **NICHT ÜBERNEHMEN** | Monolith-Code, Demo-Daten im Code, Inline-CSS, localStorage als Backend, alte Parallelstrukturen |

---

## GLOBALE ARCHITEKTUR (IST-ZUSTAND)

### Dateistruktur

```
CC inter/DEV/
├── index.html          ← 15.725 Zeilen — gesamte App (HTML + CSS + JS)
├── server.js           ← Node.js HTTP-Server, keine npm-Abhängigkeiten
├── data/
│   ├── auftraege.json  ← Produktive Auftragsdaten
│   ├── aufgaben.json
│   └── notifications.json
├── adapters/
│   ├── LocalStorageAdapter.js
│   ├── ApiAdapter.js
│   └── SyncAdapter.js
└── services/
    └── CCInternDataService.js
```

### Globale State-Variablen (alle auf `window`)

```javascript
// Hauptdaten
let AUFTRAEGE = []           // ← zentrale Datenquelle, von ALLEM genutzt
let AG_DATEN = []            // Angebote
let ANF_DATEN = []           // Anfragen / Leads
let MA_ANWESENHEIT = []      // Anwesenheit & Stempelzeiten
let URLAUB_ANTRAEGE = []     // Urlaubsanträge
var LIEFERANTEN = []         // Lieferanten
var LAGER_CC = []            // Lagerverwaltung
let LEADS = []               // CRM Leads (Überschneidung mit ANF_DATEN)

// Fest codiert (kein Admin-Interface)
const MA_DATA = [...]        // ← Mitarbeiterstammdaten inkl. Stundensätze im Frontend
var CRM_KUNDEN = {}          // ← Objekt (nicht Array), Key = Firmen-ID
var CC_FUSA_TERMINE = [...]  // ← statische FUSA-Daten im Code

// UI-State
let currentPage = 'dashboard'
var ZEIT_AKTIV = {}
var CC_NOTIF_DATA = []
var CC_SSE_SOURCE = null
```

### DAL-Schicht (Data Access Layer)

```javascript
// Toggle — aktuell auf FALSE (localStorage)
var DAL_USE_API = false
var DAL_BACKEND_URL = 'https://cc-werbung.de/api'

// Keys
DAL_KEY_AUFTRAEGE    = 'cc_intern_auftraege_v1'
DAL_KEY_FUSA         = 'cc_intern_fusa_v1'
DAL_KEY_MA           = 'cc_intern_ma_v1'
DAL_KEY_AUFGABEN     = 'cc_intern_aufgaben_v1'
DAL_KEY_ANWESENHEIT  = 'cc_intern_anwesenheit_v1'
DAL_KEY_URLAUB       = 'cc_intern_urlaub_v1'
DAL_KEY_LEADS        = 'cc_intern_leads_v1'
DAL_KEY_LAGER        = 'cc_intern_lager_v1'
DAL_KEY_LIEFERANTEN  = 'cc_intern_lieferanten_v1'
```

**Adapter-Pattern (gut — übernehmenswert als Idee):**
```
App-Code
  └── DAL-Funktionen (loadAuftraege, saveAuftraege, ...)
        └── window.CCIntern.DataService
              ├── LocalStorageAdapter  (aktiv)
              └── ApiAdapter           (vorbereitet, inaktiv)
```

---

## MODUL 1 — AUFTRÄGE

### Zweck
Kernmodul. Verwaltet den vollständigen Lebenszyklus eines Produktionsauftrags — von der Anlage über alle Fertigungsschritte bis zur Archivierung nach Lexware-Eintrag.

### Datenmodell (IST)

```javascript
// AUFTRAEGE[] — ein Eintrag
{
  // Basis
  id:               'AU-2026-01908',    // Eigenformat, KEIN UUID
  kunde:            'Neue Ruhr Zeitung', // Freitext, KEIN FK zu CRM
  fz:               'twew',
  paket:            'Bus Teilbeklebung · Neuproduktion',
  beschr:           '',
  auftragsart:      'neuproduktion',
  leistungId:       'bus_bahn',
  produktId:        'bus_teil',
  freieBezeichnung: '',
  prio:             'normal',           // 'normal' | 'hoch' | 'dringend'
  urgent:           false,              // true wenn prio='dringend'

  // Fahrzeug
  fzTyp:     '',
  fzAnzahl:  1,
  fzBreite:  0,
  fzHoehe:   0,

  // Termine
  terminDatum:   '2026-04-08',   // Produktionsstart (Pflicht)
  montageDatum:  '',             // Separat wenn abweichend
  montageZeit:   '',
  liefertermin:  '2026-04-08',

  // Standort
  depot:         '',

  // Projektleiter
  projektleiter: '',

  // Kalkulation
  netto:    5000,                // Float
  mwst:     19,                  // Prozentsatz
  brutto:   5950,                // Float (berechnet)
  zahlziel: '',
  reArt:    '',
  angebot:  '',

  // Produktion
  material:     'ORAJET® 3551',
  laminat:      '',
  flaeche:      0,
  stueck:       1,
  format:       '',
  notizProd:    '2 Platten Dibond -- Werbe anlage',  // Hinweise für Rechnungserstellung
  notizBes:     '',
  notizMontage: '',

  // Status
  step:    'abgeschlossen',      // Workflow-Position
  rechnung: 'offen',             // 'offen' | 'geschrieben' | 'bezahlt'
  archiv:   true,                // gesetzt nach lexwareErstellt()
  archivDatum: '2026-04-08T...',

  // Eingebettete Arrays (NICHT normalisiert — Problem für Cockpit)
  fotos:    [],                  // Base64-Daten direkt im Objekt!
  dateien:  [],                  // Base64-Daten direkt im Objekt!
  zeiten:   [                    // Zeiterfassung eingebettet
    { step:'grafik', wer:'Melanie', maId:'ME',
      start:'15.03 07:30', end:'15.03 10:00', dauer:150 }
  ],
  kommentare: [                  // Chat eingebettet
    { id:'k_123', text:'...', autor:'Celal', ts:'2026-04-08T...',
      autorKuerzel:'CE', autorFarbe:'#1565C0', istFrage:false }
  ],

  // Workflow-Objekte pro Schritt
  schritte: {
    grafik: {
      typ:                 'single',
      verantwortlicher:    'ME',    // maId
      verantwortlicherName:'Melanie',
      zusatzMa:            [],
      maIds:               ['ME'],
      dauer:               2,       // Stunden (geplant)
      status:              'abgeschlossen',
      fertig:              true,
      zeit:                '08.04 10:00',
      checkliste:          [
        { text:'Datei geprüft', kat:'pflicht', erledigt:true, quelle:'template' }
      ],
      fotos:               [],
      fotosErforderlich:   false,
    },
    // ... druck, laminat, montage, doku, abgeschlossen
  },

  // Produktions-Planungsdaten (teilweise redundant zu Basis-Feldern)
  prod: {
    planung: {
      folienhersteller: '',
      folientyp:        '',
      produktname:      '',         // = material
      farbnummer:       '',
      druckmaterial:    '',         // = material
      laminat:          '',         // = laminat
      maschine:         'HP Latex 560',
      verarbeitungstyp: '',
      flaeche:          '',         // = flaeche (als String!)
      stueck:           '1',        // = stueck (als String!)
      notiz:            '',         // = notizProd (Duplikat!)
    },
    produktion: { bestaetigt: false },
    template:   { typ:'', version:'', datei:'', scan:'' },
    dateien:    [],
  },

  materialVerbrauch: [],           // Buchungen aus Produktion
}
```

### Workflow-Konfiguration

```javascript
// Fest codiert — Änderungen erfordern Code-Anpassung
const STEPS = ['grafik', 'druck', 'laminat', 'montage', 'doku', 'abgeschlossen'];

const STEP_LABELS = {
  grafik:        { title:'Grafik / Entwurf',   col:'#1565C0', next:'druck',         nextWer:'Selim' },
  druck:         { title:'Druck / Plot',        col:'#4527A0', next:'laminat',       nextWer:'Selim' },
  laminat:       { title:'Laminat / Schnitt',   col:'#2E7D32', next:'montage',       nextWer:'Okan'  },
  montage:       { title:'Montage',             col:'#E65100', next:'doku',          nextWer:'Okan'  },
  doku:          { title:'Dokumentation',       col:'#7C3AED', next:'abgeschlossen', nextWer:'Celal' },
  abgeschlossen: { title:'Abgeschlossen ✓',     col:'#2E7D32', next:null,            nextWer:null    },
};
```

### Wichtigste Funktionen

| Funktion | Zeile | Was sie tut | Kopplungsgrad |
|---|---|---|---|
| `openAuftragModal()` | ~10550 | Neuanlage-Formular | mittel |
| `openAuftragDetail(id)` | ~3355 | **Monolith ~500 Zeilen** | 🔴 SEHR HOCH |
| `renderAuftragVerwaltung()` | 1358 | Listenansicht + Filter | hoch |
| `saveAuftraege()` | 6413 | Persistierung (500ms Debounce) | gering |
| `auNrRecalculate()` | ~6408 | Nächste freie AU-Nummer | gering |
| `schrittFertig(auId, step)` | ~3202 | Schrittübergang-Hauptlogik | hoch |
| `lexwareErstellt(auId)` | ~15282 | Archivierungs-Trigger | mittel |

### Filter-Tabs (auVerwFilter)

| Tab | Filter |
|---|---|
| `'alle'` | alle nicht-archivierten |
| `'offen'` | `step !== 'abgeschlossen'` |
| `'abgeschlossen'` | `step === 'abgeschlossen' && !archiv` |
| `'rechnung'` | `step === 'abgeschlossen' && rechnung === 'offen' && !archiv` |
| `'archiv'` | `archiv === true` |

### Abhängigkeiten

- Wird gelesen von: **allen anderen Modulen** (Kanban, Dashboard, Kalender, Rechnungen, Mitarbeiter, CRM, Lexware-Queue)
- Schreibt auf: sich selbst (direkte Mutation + `saveAuftraege()`)
- Braucht: `MA_DATA` (Verantwortliche), `STEP_LABELS` (Übergänge)

### Datenstruktur-Bewertung

| Feld/Bereich | Status | Cockpit-Maßnahme |
|---|---|---|
| `id` als `AU-YYYY-NNNNN` | ⚠️ Eigenformat | → UUID |
| `kunde` als Freitext | 🔴 Kein FK | → `kundeId` als FK zu CRM |
| `kommentare[]` eingebettet | 🔴 Nicht normalisiert | → eigene Collection |
| `zeiten[]` eingebettet | 🔴 Nicht normalisiert | → eigene Collection |
| `dateien[]`/`fotos[]` als Base64 | 🔴 Nicht skalierbar | → Filestore, nur Referenz |
| `prod.planung.*` | ⚠️ Redundant zu Basis-Feldern | → konsolidieren |
| `step` + `schritte{}` | ✅ Gutes Konzept | → übernehmen (normalisiert) |
| `rechnung` am Auftrag | ⚠️ Denormalisiert | → eigene Rechnungs-Entity |
| `archiv` + `archivDatum` | ✅ Sauber | → übernehmen |
| `notizProd` = `prod.planung.notiz` | 🔴 Duplikat | → nur `notizProd` behalten |

### Was ins Cockpit (Spezifikation)

- ✓ 6-Schritt-Workflow mit Verantwortlichen und Prüfbedingungen
- ✓ Pflichtfelder-Konzept (Checkliste, Fotos) vor Schrittabschluss
- ✓ Archivierungslogik: abgeschlossen → Lexware-Queue → archiviert
- ✓ Priorisierungssystem: dringend / überfällig / heute / normal
- ✓ Trennung Produktionsstart vs. Montagetermin

### Was Altlast ist

- ✗ Demo-Daten fest im Code (`AUFTRAEGE = [...]` ~Zeile 2700)
- ✗ `auNr` als globaler Zähler (Race Condition bei Mehrnutzern)
- ✗ `openAuftragDetail()` als ~500-Zeilen-Monolith
- ✗ `nextWer` in `STEP_LABELS` fest auf Mitarbeiternamen
- ✗ Keine Möglichkeit, Schritte zu überspringen/umzusortieren

---

## MODUL 2 — PRODUKTION (KANBAN)

### Zweck
Visualisiert alle aktiven Aufträge als Kanban-Board nach Workflow-Schritt. Ermöglicht den Schrittabschluss mit Berechtigungsprüfung.

### Datenmodell (IST)

Kein eigenes Datenmodell. Liest ausschließlich aus `AUFTRAEGE[]` — gefiltert nach `a.step` und `!a.archiv`.

### Workflow-Übergangslogik (`schrittFertig`, Zeile ~3202)

```
1. Hole aktuellen Schritt: currentStep = a.step
2. Prüfe Berechtigung: istVerantwortlicher(a, step, maId)
   → Desktop (maId=null): immer erlaubt
   → Mobile: nur wenn sch.verantwortlicher === maId
3. Prüfe Abschliessbarkeit: schrittAbschliessbar(a, step)
   → Alle 'pflicht'-Checklisten erledigt?
   → fotosErforderlich && fotos.length === 0?
4. Setze sch.status = 'abgeschlossen', sch.fertig = true, sch.zeit = jetzt
5. Setze a.step = STEP_LABELS[currentStep].next
6. Wenn nextStep !== null: nextSch.status = 'in_bearbeitung'
7. Wenn nextStep === 'abgeschlossen': a.rechnung = 'offen'
8. saveAuftraege()
9. Notification + Toast
```

### Wichtigste Funktionen

| Funktion | Zeile | Was sie tut |
|---|---|---|
| `renderKanban()` | 2943 | Board-Rendering, filtert archivierte aus |
| `schrittFertig(auId, step)` | ~3202 | Haupt-Übergangslogik |
| `schrittAbschliessbar(a, step)` | ~3165 | Checklisten/Foto-Prüfung |
| `istVerantwortlicher(a, step, maId)` | ~3184 | Berechtigungsprüfung |

### Visuelle Priorität (fest codiert)

```
urgent === true           → Rot    (#C62828), Hintergrund #FFF5F5
terminDatum < heute       → Orange (#E65100), Hintergrund #FFF3E0
terminDatum === heute     → Gelb   (#FF8F00), Hintergrund #FFFDE7
sonst                     → Schrittfarbe aus STEP_LABELS
```

### Abhängigkeiten

- `AUFTRAEGE[]` (direkt gelesen)
- `STEP_LABELS` (Schrittfarben, Übergänge)
- `MA_DATA` (Name-Lookup)
- `openAuftragDetail()` (Klick auf Karte öffnet Detail)

### Was ins Cockpit

- ✓ Kanban-Konzept: eine Spalte pro Workflow-Schritt
- ✓ Berechtigungsprüfung: Verantwortlicher pro Schritt
- ✓ Prüfbedingungen vor Abschluss (Checkliste, Fotos)
- ✓ Visuelles Prioritätssystem

### Was Altlast ist

- ✗ `STEP_LABELS` fest codiert (Workflow-Änderungen = Code-Änderungen)
- ✗ `nextWer` in STEP_LABELS = fester Mitarbeitername
- ✗ Keine Schritt-Überspringung möglich
- ✗ Mobile-Berechtigung über localStorage-Kürzel (kein echtes Auth)

---

## MODUL 3 — CRM / LEADS

### Zweck
Zwei teilweise getrennte Bereiche: **Kunden-Stammdaten** (pg-kunden) und **CRM-Pipeline** (pg-crm) mit Aktivitäten und Wiedervorlage. Dazu **Leads/Anfragen** (pg-anfragen).

### Datenmodell (IST)

```javascript
// CRM_KUNDEN{} — OBJEKT (nicht Array), Key = Firmen-ID
CRM_KUNDEN = {
  'sparkasse-essen': {
    name:        'Sparkasse Essen',
    adresse:     'Kennedyplatz 1',
    plz:         '45127',
    stadt:       'Essen',
    ap:          'Herr Müller',      // Ansprechpartner
    tel:         '0201-...',
    mail:        '...',
    status:      'Aktiv',            // 'Aktiv'|'Angebot'|'Neukontakt'|'Geplant'|'Inaktiv'
    umsatz:      '45.200 €',         // String! Kein Float!
    aktivitaeten: [
      { typ:'Telefonat', datum:'2026-03-15', notiz:'...' }
    ],
  }
}

// AG_DATEN[] — Angebote
{
  id:      'AG-2026-017',
  kunde:   'Sparkasse Essen',        // Freitext, kein FK
  status:  'entwurf'|'versendet'|'gewonnen'|'verloren',
  netto:   5210.08,
  // ...
}

// LEADS[] und ANF_DATEN[] — semantisch überlappend
// Beide enthalten Anfragen/Leads ohne klare Trennung
```

### Kunden-Auftrag-Verknüpfung (IST — PROBLEM)

```javascript
// Unscharfer String-Match statt FK
var auftrGes = AUFTRAEGE.filter(function(a){
  return a.kunde.toLowerCase().includes(k.name.split(' ')[0].toLowerCase());
});
// → fehleranfällig, funktioniert nicht bei Namensänderungen
```

### Abhängigkeiten

- `AUFTRAEGE` für Auftragszähler pro Kunde (String-Match)
- `AG_DATEN` und `ANF_DATEN` loose verbunden

### Was ins Cockpit

- ✓ Kundenstammdaten mit Ansprechpartner
- ✓ Aktivitäten-Log pro Kunde
- ✓ Pipeline-Konzept (Status-Kanban)
- ✓ Verknüpfung Kunde → Aufträge → Angebote (aber als echte FKs)

### Was Altlast ist

- ✗ `CRM_KUNDEN{}` als Objekt statt Array — in Cockpit: Array mit UUID
- ✗ `umsatz` als String — kein Float, nicht berechenbar
- ✗ Kunden-Auftrag-Verknüpfung per String-Match
- ✗ `LEADS[]` und `ANF_DATEN[]` überlappen semantisch
- ✗ Keine echte Kontakthistorie, kein E-Mail-Log

### Datenstruktur-Bewertung

| Feld | Status | Cockpit |
|---|---|---|
| `CRM_KUNDEN{}` als Objekt | 🔴 | → Array mit UUID als PK |
| `umsatz` als String | 🔴 | → Float, berechnet aus Aufträgen |
| `a.kunde` als Freitext | 🔴 | → `kundeId` FK |
| `aktivitaeten[]` | ✅ | → übernehmen |
| `LEADS[]` vs `ANF_DATEN[]` | ⚠️ | → zusammenführen |

---

## MODUL 4 — KOMMUNIKATION

### Zweck
Auftragsbezogener Kommentar-Chat. Live-Benachrichtigungen bei Statuswechseln über SSE (Server-Sent Events).

### Datenmodell (IST)

```javascript
// Kommentare — eingebettet im Auftrag (NICHT normalisiert)
a.kommentare = [{
  id:           'k_1712345678',
  text:         'Folie bestellt',
  autor:        'Celal',
  autorKuerzel: 'CE',
  autorFarbe:   '#1565C0',
  ts:           '2026-04-08T09:00:00.000Z',
  istFrage:     false,
}]

// Notifications — server-seitig in notifications.json
CC_NOTIF_DATA = [{
  id:         '1712345678_abc1',
  collection: 'auftraege',
  action:     'chat' | 'save',
  ts:         '2026-04-08T09:00:00.000Z',
  info: {
    id:     'AU-2026-01908',
    fz:     'twew',
    kunde:  'Neue Ruhr Zeitung',
    autor:  'Celal',
    text:   'Folie bestellt...',   // max. 60 Zeichen
  }
}]

// SSE-Verbindung
CC_SSE_SOURCE  // EventSource auf /api/events
// Typen: 'connected' | 'update' | 'notification' | heartbeat (alle 25s)
```

### Nachrichtenfluss (Chat)

```
sendKommentar(auId, text)
  → Kommentar direkt in a.kommentare[] pushen
  → saveAuftraege() (Debounce 500ms)
  → POST /api/notifications (Notification-Objekt)
     → Server speichert in notifications.json
     → Server broadcastet via SSE an alle Clients
        → andere Clients: CC_NOTIF_DATA.unshift() + Badge aktualisieren
        → eigener Client: Duplikat-Check per id
```

### SSE-Server (server.js)

```
GET  /api/events          → SSE-Verbindung, Heartbeat alle 25s
GET  /api/notifications   → alle Notifications laden
POST /api/notifications   → Notification speichern + broadcasten
POST /api/notifications/clear → alle löschen
```

### Abhängigkeiten

- Kommentare leben in `AUFTRAEGE` — nicht eigenständig abfragbar
- SSE läuft über eigenen `server.js`-Endpunkt
- `MA_DATA` für Autor-Farbe und Kürzel

### Was ins Cockpit

- ✓ Auftragsbezogener Kommentar-Feed
- ✓ Live-Benachrichtigungen bei Statuswechseln
- ✓ Benachrichtigungs-Konzept: Trigger (Schritt abgeschlossen, Chat-Nachricht) + Empfänger
- ✓ SSE-Architektur (Idee, nicht der Code)

### Was Altlast ist

- ✗ Kommentare eingebettet im Auftrag (in Cockpit: eigene Collection)
- ✗ Kein Read-Status (niemand weiß, wer gelesen hat)
- ✗ SSE ist LAN-tauglich, nicht cloud-skalierbar (→ WebSocket oder Push-Service)
- ✗ Keine Push-Notifications (nur wenn App offen)

---

## MODUL 5 — KALENDER

### Zweck
Aggregierte Terminübersicht. Kein eigenes Datenmodell — berechnet sich live aus mehreren Quellen.

### Datenmodell (IST)

```javascript
// Kein persistentes Modell — wird on-the-fly berechnet
// ccGetAlleTermine() liefert:
[{
  id:              'T-AU-AU-2026-01908',  // | 'T-MON-...' | 'F-001'
  datum:           '2026-04-08',
  titel:           'Neue Ruhr Zeitung · Bus Teilbeklebung',
  typ:             'amber',               // Farb-Code nach Schritt/Priorität
  depot:           '',
  monteur:         '',
  quelle:          'cc' | 'fusa',
  step:            'montage',
  auftragId:       'AU-2026-01908',       // null bei FUSA
  isMontageTermin: false,                 // true wenn separater Montagetermin
}]

// CC_FUSA_TERMINE[] — statisch im Code
CC_FUSA_TERME = [{
  id:          'F-001',
  datum:       '2026-03-24',
  titel:       'Ruhrbahn Bus 2204 · Beklebung',
  depot:       'Stadtmitte',
  monteur:     'Okan',
  fusaStatus:  'offen',
  auftragId:   null,                      // null = kein CC-Auftrag verknüpft
}]
```

### Farblogik für Kalender-Einträge

```
Priorität:
1. urgent === true          → 'red'
2. STEP_LABELS[step].typ    → Schrittfarbe
3. FUSA-Termine             → 'amber'
```

### Datenquellen (ccGetAlleTermine)

```
AUFTRAEGE[]
  └── terminDatum     → Produktionsstart-Termin
  └── montageDatum    → Montagetermin (wenn != terminDatum → eigener Eintrag)

CC_FUSA_TERME[]
  └── nur Einträge ohne auftragId (externe FUSA ohne CC-Auftrag)
```

### Abhängigkeiten

- Vollständig abhängig von `AUFTRAEGE` und `CC_FUSA_TERME`
- Kein Schreibzugriff, nur lesend
- Kein eigener Persistenz-Key

### Was ins Cockpit

- ✓ Aggregationslogik: Produktionsstart + Montagetermin + FUSA in einer Ansicht
- ✓ Trennung: CC-intern vs. FUSA-extern
- ✓ Farbcodierung nach Dringlichkeit

### Was Altlast ist

- ✗ `CC_FUSA_TERME` statisch im Code — muss aus echter FUSA-Quelle kommen
- ✗ Kein iCal-Export, kein Google Calendar Sync
- ✗ Keine Ressourcenplanung (wer ist wann verfügbar)
- ✗ Keine Kollisionserkennung (Termin-Überschneidungen)

---

## MODUL 6 — RECHNUNGSSTATUS / LEXWARE

### Zweck
Kein Buchhaltungsmodul. Zeigt welche abgeschlossenen Aufträge noch nicht in Lexware eingetragen wurden. Auslöser für Archivierung. Die eigentliche Rechnung wird extern in Lexware geschrieben.

### Datenmodell (IST)

```javascript
// Rechnungsstatus direkt am Auftrag — kein eigenes Modell
a.rechnung = 'offen' | 'geschrieben' | 'bezahlt'
a.archiv   = true | false
a.archivDatum = ISO-Timestamp

// Für Frau Zint relevante Felder aus dem Auftrag:
a.id          // AU-Nummer
a.kunde       // Kundenname
a.fz          // Fahrzeug
a.paket       // Leistungsbeschreibung
a.netto       // Rechnungsbetrag netto
a.brutto      // Brutto (netto * 1.19)
a.notizProd   // Hinweise für Rechnungserstellung
// Abschlussdatum: a.schritte.abgeschlossen.fertigAm oder a.terminDatum
```

### Lexware-Queue-Filter

```javascript
AUFTRAEGE.filter(a =>
  a.step === 'abgeschlossen' &&
  !a.archiv &&
  (!a.rechnung || a.rechnung === 'offen')
)
```

### Workflow

```
Auftrag abgeschlossen (step='abgeschlossen', rechnung='offen')
  → erscheint in Lexware-Queue (pg-rechnungen)
  → Frau Zint trägt Rechnung in Lexware ein
  → klickt "✅ In Lexware erstellt"
     → a.rechnung = 'geschrieben'
     → a.archiv   = true
     → a.archivDatum = jetzt
  → Auftrag verschwindet aus Queue + Kanban
  → Auftrag erscheint in Archiv-Tab
```

### Abhängigkeiten

- Vollständig in `AUFTRAEGE` — kein eigenes Modell
- `lexwareErstellt()` triggert: `saveAuftraege()`, `renderLexwareQueue()`, `renderKanban()`, `renderAuftragVerwaltung()`

### Was ins Cockpit

- ✓ Lexware-Queue-Konzept (welche Daten Frau Zint sehen muss)
- ✓ Statusübergang: offen → geschrieben → Archiv
- ✓ Archivierungsauslöser nach Lexware-Bestätigung
- ✓ Anzeige: Netto, Brutto, Hinweise, Auftragsdaten

### Was Altlast ist

- ✗ Rechnungsstatus am Auftrag statt eigener Entity
- ✗ Alte `RECHNUNGEN[]`-Parallelstruktur (entfernt, nicht wieder einführen)
- ✗ Keine Mahnung, keine Zahlungsverfolgung
- ✗ Keine DATEV/Lexware-API-Anbindung (manueller Prozess)

---

## MODUL 7 — LAGER

### Zweck
Bestandsverwaltung für Folien, Laminate, Werkzeug und Verbrauchsmaterial. Meldebestand-Logik für Nachbestellhinweise.

### Datenmodell (IST)

```javascript
LAGER_CC = [{
  art:      'ORAJET® 3551 GLOSSY 137cm',   // Bezeichnung
  kat:      'folie',                         // 'folie'|'laminat'|'reinigung'|'werkzeug'|'farbe'
  nr:       'ORA-3551-G137',                 // Materialnummer (frei erfunden)
  eh:       'lfm',                           // 'lfm'|'Fl.'|'Stk'|'Pk.'
  bestand:  85,                              // Float, aktueller Bestand
  mindest:  20,                              // Meldebestand (Reorder Point)
  status:   'ok',                            // 'ok'|'warn'|'leer' (berechnet)
  bestellt: false,                           // Bestellung laufend?
}]
```

### Status-Logik

```
bestand === 0           → 'leer'  (rot)
bestand <= mindest      → 'warn'  (orange)
bestand >  mindest      → 'ok'    (grün)
```

### Abhängigkeiten

- Weitgehend eigenständig (geringste Kopplung aller Module)
- `a.materialVerbrauch[]` im Auftrag kann auf Lager-Artikel verweisen (lose)
- `LIEFERANTEN[]` — separates Array, kein FK zu LAGER_CC

### Was ins Cockpit

- ✓ Bestandsverwaltung mit Meldebestand
- ✓ Buchungslogik (Zugang / Entnahme)
- ✓ Kategorisierung nach Materialtyp
- ✓ Statusampel (ok / warn / leer)

### Was Altlast ist

- ✗ Keine Lieferanten-Verknüpfung (kein FK)
- ✗ Kein Bestellwesen / keine automatische Nachbestellung
- ✗ Materialnummern frei erfunden, kein Barcode-System
- ✗ Lager-Buchung und Materialverbrauch im Auftrag sind zwei lose Systeme

---

## MODUL 8 — URLAUB

### Zweck
Urlaubsanträge und Abwesenheitsverwaltung pro Mitarbeiter. Genehmigungsworkflow.

### Datenmodell (IST)

```javascript
URLAUB_ANTRAEGE = [{
  id:       'URL-1712345678',
  maId:     'CE',                              // FK zu MA_DATA.maId
  ma:       'Celal',                           // Name redundant gespeichert
  typ:      'urlaub' | 'abwesenheit' | 'krank' | 'bildung',
  von:      '2026-04-14',
  bis:      '2026-04-18',
  notiz:    '',
  status:   'offen' | 'genehmigt' | 'abgelehnt',
  erstellt: '2026-04-08T09:00:00.000Z',
}]
```

### Workflow

```
Antrag anlegen (status='offen')
  → Genehmiger klickt 'genehmigt' oder 'abgelehnt'
  → kein E-Mail, keine Benachrichtigung (manuell)
```

### Abhängigkeiten

- Referenziert `MA_DATA` für Mitarbeiter-Auswahl
- Kein Kalender-Sync (Urlaub erscheint NICHT im Kalender-Modul)
- Keine Verknüpfung mit Zeiterfassung oder Aufträgen

### Was ins Cockpit

- ✓ Antrag-Workflow (offen → genehmigt / abgelehnt)
- ✓ Abwesenheitstypen (urlaub, krank, bildung, abwesenheit)
- ✓ Jahresurlaub aus `MA_DATA.urlaub` als Basis

### Was Altlast ist

- ✗ `ma`-Name direkt im Antrag (Duplikat, inkonsistent bei Namensänderung)
- ✗ Kein Kalender-Overlap (Urlaub sichtbar im Kalender)
- ✗ Keine Jahreskonten-Berechnung (Resturlaub)
- ✗ Keine automatische Benachrichtigung bei Genehmigung

---

## MODUL 9 — MITARBEITER

### Zweck
Mitarbeiterstammdaten (fest im Code) und Kapazitätsübersicht. Zeiterfassung ist auftragsbezogen in `AUFTRAEGE[].zeiten[]`.

### Datenmodell (IST)

```javascript
// FEST CODIERT IM SCRIPT — kein Admin-Interface
const MA_DATA = [
  { maId:'CE', n:'Celal',     r:'Geschäftsführung',      col:'#1565C0', soll:160, urlaub:28 },
  { maId:'MU', n:'Muhammet',  r:'Geschäftsführung',      col:'#1565C0', soll:160, urlaub:28 },
  { maId:'ME', n:'Melanie',   r:'Grafik',                col:'#E91E63', soll:160, urlaub:28 },
  { maId:'IL', n:'Ilayda',    r:'Grafik',                col:'#9C27B0', soll:160, urlaub:28 },
  { maId:'SE', n:'Selim',     r:'Produktion',            col:'#FF9800', soll:168, urlaub:28 },
  { maId:'OK', n:'Okan',      r:'Montage / Vorarbeiter', col:'#2196F3', soll:168, urlaub:28 },
  { maId:'MO', n:'Mohammed',  r:'Produktion + Montage',  col:'#4CAF50', soll:168, urlaub:28 },
  { maId:'MT', n:'Mete',      r:'Montage',               col:'#00BCD4', soll:168, urlaub:28 },
  { maId:'ZI', n:'Zint',      r:'Buchhaltung',           col:'#795548', soll:80,  urlaub:28 },
  { maId:'EL', n:'Elvan',     r:'Büro',                  col:'#FF5722', soll:160, urlaub:28 },
];

// Zeiterfassung (eingebettet im Auftrag)
a.zeiten = [{
  step:  'grafik',
  wer:   'Melanie',       // Name (redundant)
  maId:  'ME',
  start: '15.03 07:30',   // Format DD.MM HH:MM (kein ISO!)
  end:   '15.03 10:00',
  dauer: 150,             // Minuten
}]

// Anwesenheit (separates System)
MA_ANWESENHEIT = [{
  maId:  'CE',
  datum: '2026-04-08',
  von:   '07:30',
  bis:   '16:30',
  typ:   'arbeit' | 'pause',
}]
```

### Aktueller Login-Mechanismus

```javascript
ccAktivMA()
// → liest aus localStorage welches Kürzel aktiv ist
// → KEIN echtes Login, KEINE Session, KEINE Authentifizierung
```

### Abhängigkeiten

- `MA_DATA` wird von FAST ALLEN Modulen genutzt:
  - Kanban: Verantwortlicher-Anzeige
  - Auftragsanlage: Schritt-Zuweisung
  - Urlaub: MA-Auswahl
  - Zeiterfassung: wer hat was gebucht
  - Notifications: Autor der Nachricht
  - Checklisten: Schritt-Zuordnung

### Was ins Cockpit

- ✓ Mitarbeiterstammdaten (maId, Name, Rolle, Farbe, Soll-Stunden, Urlaubstage)
- ✓ Rolle als Basis für Berechtigungskonzept
- ✓ Zeiterfassung pro Auftrag + Schritt (normalisiert)
- ✓ Kapazitätsanzeige: Ist-Stunden vs. Soll-Stunden

### Was Altlast ist

- ✗ **`MA_DATA` fest codiert im Script** — muss in Admin-pflegbare DB-Tabelle
- ✗ **Stundensätze fehlen, aber Rolle + Soll ist sensibel** — nicht im Frontend
- ✗ `maId` als zweistelliges Kürzel — in Cockpit: UUID
- ✗ `ccAktivMA()` via localStorage — kein echtes Auth
- ✗ Zeiterfassung (`a.zeiten[]`) und Anwesenheit (`MA_ANWESENHEIT[]`) sind zwei separate, unverknüpfte Systeme
- ✗ Zeitformat `DD.MM HH:MM` kein ISO → Sortierung und Berechnung fehleranfällig

---

## KRITISCHE STELLEN — GESAMTÜBERSICHT

### Monolith-Funktionen (nicht direkt übernehmbar)

| Funktion | Zeile | Zeilen ca. | Problem |
|---|---|---|---|
| `openAuftragDetail(id)` | ~3355 | ~500 | Rendert: Header, Kommentare, Zeitverlauf, Dateien, Schritte, Checklisten, Produktion, Finanzen — alles in einer Funktion |
| `renderAuftragVerwaltung()` | 1358 | ~150 | Mischung aus Filter-Logik, Stats-Berechnung und HTML-Rendering |
| `renderKanban()` | 2943 | ~150 | Board + Stats + Banner in einem |
| `schrittFertig()` | ~3202 | ~80 | Business-Logik + Mutation + Toast + Notification in einem |

### Direkte Array-Mutationen (kritisch für Cockpit-State-Management)

| Zeile | Operation | Kontext |
|---|---|---|
| ~3264 | `AUFTRAEGE.splice(idx,1)` | `loescheAuftrag()` |
| ~6390-6404 | `AUFTRAEGE.push(a)` | DAL-Restore in `loadAuftraege()` |
| ~9170 | `AUFTRAEGE.push({...})` | Neuer Auftrag aus FUSA |
| ~10900 | `AUFTRAEGE.push(neuerAuftrag)` | `openAuftragModal()` speichern |
| ~11045-11057 | `.push()` + `.splice()` | Test-Daten (DEV) |
| ~13981 | `AUFTRAEGE.push(testAuftrag)` | Test-Daten |

**Hinweis:** Ein Proxy-Hook (Zeile ~6534) fängt `AUFTRAEGE.push` ab und triggert `saveAuftraege()` automatisch. Das ist eine clevere Lösung für diesen Kontext, aber kein Ersatz für echtes State-Management.

### Stellen wo UI + Logik untrennbar gemischt sind

```
openAuftragDetail()     → HTML-String + Business-Logik + Event-Handler inline
renderKanban()          → HTML-String + Prioritäts-Berechnungen
renderLexwareQueue()    → HTML-String + Filter-Logik
sendKommentar()         → Mutation + Persistierung + SSE-Post + lokaler State
schrittFertig()         → Validierung + Mutation + Toast + Notification + Rendering
```

### Datenstrukturen die normalisiert werden müssen

| Aktuell | Problem | Cockpit-Lösung |
|---|---|---|
| `a.kommentare[]` im Auftrag | nicht eigenständig abfragbar | Collection `comments{id, auftragId, ...}` |
| `a.zeiten[]` im Auftrag | nicht MA-übergreifend auswertbar | Collection `timeEntries{id, auftragId, maId, ...}` |
| `a.dateien[]` als Base64 | Objekt wird riesig | Filestore, nur `{name, url, mimeType}` im Auftrag |
| `a.fotos[]` als Base64 | wie dateien | wie dateien |
| `CRM_KUNDEN{}` als Objekt | kein Array, schwer zu querien | Array `customers[]` mit UUID |
| `umsatz` als String | nicht berechenbar | Float |
| `a.kunde` als Freitext | kein FK | `kundeId` UUID |
| `a.rechnung` am Auftrag | Rechnungsdaten gemischt mit Produktionsdaten | eigene Entity `invoices{}` |
| `notizProd` = `prod.planung.notiz` | Duplikat | nur `notizProd` behalten |
| MA-Name in `a.zeiten[].wer` | Duplikat zu `maId` | nur `maId`, Name aus MA-Tabelle |
| `maId` als Kürzel | nicht eindeutig | UUID |

### Globale Variablen die NICHT in Cockpit dürfen

| Variable | Grund |
|---|---|
| `MA_DATA` fest im Code | Sensible Daten im Frontend, kein Admin-Interface |
| `CC_FUSA_TERME` fest im Code | Statische Demo-Daten, muss aus Quelle kommen |
| `DAL_USE_API = false` | In Cockpit kein localStorage-Fallback |
| Demo-Daten `AUFTRAEGE = [...]` | Fixtures nicht in Produktion |
| `auNr` als globaler Zähler | Race Condition bei Mehrnutzern |

---

## COCKPIT-DATENMODELL (SOLL — GROB)

```
Tabellen / Collections (normalisiert):

customers           id(uuid), name, adresse, plz, stadt, ap, tel, mail, status
contacts            id, customerId, typ, datum, notiz, autorId
orders              id(uuid), customerId, paket, step, rechnung, archiv, netto, brutto, notizRechnung, ...
orderSteps          id, orderId, step, verantwortlicherId, dauer, fertig, fertigZeit, ...
checklistItems      id, orderStepId, text, kat, erledigt, quelle
timeEntries         id, orderId, orderStepId, mitarbeiterId, start(ISO), end(ISO), dauer(min)
comments            id, orderId, mitarbeiterId, text, ts(ISO), istFrage
files               id, orderId, name, mimeType, url, groesse, quelle
employees           id(uuid), kuerzel, name, rolle, farbe, sollStunden, urlaubTage
absences            id, employeeId, typ, von, bis, status, notiz
inventory           id, art, kat, nr, eh, bestand, mindest, lieferantenId
suppliers           id, name, kontakt, ...
notifications       id, typ, referenzId, mitarbeiterId, ts, gelesen
fusaTermine         id, datum, titel, depot, monteurId, status, orderId(nullable)
```

---

## ZUSAMMENFASSUNG

### Was CC Intern gut gelöst hat (als Spezifikation übernehmen)

1. **6-Schritt-Workflow** mit Verantwortlichen, Prüfbedingungen und Farbsystem
2. **Archivierungslogik**: abgeschlossen → Lexware-Queue → In Lexware erstellt → archiviert
3. **Lexware-Queue**: klare Darstellung welche Daten Frau Zint braucht
4. **Adapter-Pattern (DAL)**: Trennung Storage-Implementierung von App-Logik
5. **SSE-Konzept**: Live-Sync bei Datenänderungen
6. **Prioritätssystem**: dringend / überfällig / heute / normal
7. **Trennung Produktionsstart vs. Montagetermin**
8. **Benachrichtigungs-Konzept**: was wird wann an wen gemeldet

### Was für Cockpit neu gebaut werden muss

1. Normalisiertes Datenmodell (keine eingebetteten Arrays)
2. Authentifizierung + Rollenmodell (kein localStorage-Login)
3. Filestore für Dateien/Fotos (kein Base64 im JSON)
4. Mitarbeiter als pflegbare Tabelle (nicht im Code)
5. Echte FK-Relationen (Auftrag → Kunde → MA)
6. API versioniert und authentifiziert
7. Workflow-Konfiguration über Admin (nicht im Code)

### Was nicht übernommen werden soll

- Den Code selbst (Monolith)
- `openAuftragDetail()` als ~500-Zeilen-Funktion
- Demo-Daten im Produktionscode
- `MA_DATA` mit Stundensätzen im Frontend
- `RECHNUNGEN[]`-Parallelstruktur (bereits entfernt)
- Inline-CSS ohne Namespacing
- localStorage als primäres Backend
- Zeitformat `DD.MM HH:MM` (→ immer ISO 8601)
- `auNr` als globaler Zähler ohne Locking
