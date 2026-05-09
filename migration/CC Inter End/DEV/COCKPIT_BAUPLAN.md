# CC COCKPIT — BAUPLAN

**Erstellt:** 2026-04-08
**Basis:** COCKPIT_MIGRATION_REFERENZ.md
**Zweck:** Sequenzierter Entwicklungsplan für den Cockpit-Neubau.
**Prinzip:** Jede Phase baut auf der vorherigen auf. Nichts wird gebaut ohne Fundament.

---

## BAUPRINZIPIEN

```
1. Fundament zuerst — Auth, Schema, API bevor irgendeine UI
2. Stammdaten vor Bewegungsdaten — Mitarbeiter + Kunden vor Aufträgen
3. Kern vor Peripherie — Aufträge + Workflow vor Lager und Urlaub
4. CC Intern läuft parallel — kein Big-Bang-Cutover, sanfte Migration
5. Jede Phase ist eigenständig auslieferbar
```

---

## PHASEN-ÜBERSICHT

```
Phase 1 — Fundament          Auth, Datenbank, API, Design-System
Phase 2 — Stammdaten         Mitarbeiter, Kunden
Phase 3 — Kern: Aufträge     Datenmodell, Anlage, Workflow, Kanban
Phase 4 — Abhängige Module   Zeiterfassung, Kommunikation, Rechnungsstatus, Kalender
Phase 5 — Weitere Module     Lager, Urlaub, CRM Pipeline
Phase 6 — Integration        FUSA, Dashboard, Datenmigration
```

---

## PHASE 1 — FUNDAMENT

> Ohne diese Phase kann nichts andere gebaut werden.
> Kein einziges Modul darf vor Phase 1 fertig sein.

---

### 1.1 — Authentifizierung & Rollenmodell

**Warum zuerst:**
CC Intern hat kein echtes Login. `ccAktivMA()` liest ein Kürzel aus localStorage.
Jede Cockpit-Funktion braucht: Wer ist eingeloggt? Was darf er?

**Was gebaut wird:**

```
Rollen (mindestens):
  admin           → alles
  produktion      → Aufträge, Kanban, Zeiterfassung
  buchhaltung     → Rechnungsstatus, Lexware-Queue
  geschaeftsfuehr → alles lesend + Genehmigungen

Session-Modell:
  JWT oder Session-Cookie
  Kein localStorage-Login
  Automatischer Logout nach Inaktivität

Benutzer-Objekt:
  {
    id:       uuid,
    name:     'Celal',
    kuerzel:  'CE',
    rolle:    'admin',
    farbe:    '#1565C0',
    aktiv:    true,
  }
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- Konzept: Verantwortlicher pro Schritt = eine bestimmte Rolle
- Konzept: Mobile darf nur eigene Schritte abschließen
- `MA_DATA`-Felder: maId, Name, Rolle, Farbe — als Basis für Benutzer-Tabelle

**Was NICHT übernommen wird:**
- `ccAktivMA()` via localStorage
- `MA_DATA` fest im Code

---

### 1.2 — Datenbankschema (normalisiert)

**Warum jetzt:**
Alle späteren Module bauen auf diesem Schema auf.
Nachträgliche Schema-Änderungen sind teuer.

**Kerntabellen:**

```sql
-- Stammdaten
employees       (id, kuerzel, name, rolle, farbe, soll_std, urlaub_tage, aktiv)
customers       (id, name, adresse, plz, stadt, ap, tel, mail, status, erstellt)

-- Auftragsmodell
orders          (id, kunden_id FK, paket, step, rechnung_status, archiv,
                 netto, brutto, notiz_rechnung, termin, montage_datum,
                 depot, prio, erstellt, geaendert)
order_steps     (id, order_id FK, step_key, mitarbeiter_id FK,
                 dauer_geplant, fertig, fertig_zeit, fotos_erforderlich)
checklist_items (id, order_step_id FK, text, kat, erledigt, quelle)

-- Bewegungsdaten
time_entries    (id, order_id FK, step_key, mitarbeiter_id FK,
                 start ISO, end ISO, dauer_min)
comments        (id, order_id FK, mitarbeiter_id FK, text, ts ISO, ist_frage)
files           (id, order_id FK, name, mime_type, url, groesse_bytes,
                 quelle, hochgeladen_von FK, ts)

-- Weitere Module
absences        (id, mitarbeiter_id FK, typ, von, bis, status, notiz, erstellt)
inventory       (id, art, kat, nr, einheit, bestand, mindest, bestellt)
notifications   (id, typ, referenz_id, mitarbeiter_id FK, ts, gelesen)
fusa_termine    (id, datum, titel, depot, monteur_id FK, status, order_id FK nullable)
```

**Kritische Entscheidungen die jetzt getroffen werden müssen:**

| Entscheidung | Empfehlung | Begründung |
|---|---|---|
| Kommentare im Auftrag oder eigene Tabelle? | Eigene Tabelle | Skalierbar, filterbar |
| Dateien als Base64 oder Filestore? | Filestore (S3/Minio) | CC Intern hat Base64-Problem |
| Schritt-Konfiguration im Code oder DB? | DB-Tabelle | Flexibel für andere Kunden-Typen |
| `orderId` als UUID oder AU-Format? | UUID intern, AU-Format als `display_id` | Beide Anforderungen erfüllt |

---

### 1.3 — API-Grundstruktur

**Warum jetzt:**
Alle Module kommunizieren über diese API.
Frontend und Backend müssen nicht auf demselben Server laufen.

**Was gebaut wird:**

```
REST-API (oder GraphQL — Entscheidung hier treffen):

Basis-URL:    /api/v1/...
Auth-Header:  Authorization: Bearer <JWT>
Format:       JSON
Fehler:       { error: { code, message, details } }
Erfolg:       { data: {...}, meta: { version, ts } }

Endpunkte (Beispiele):
  GET    /api/v1/orders
  POST   /api/v1/orders
  GET    /api/v1/orders/:id
  PATCH  /api/v1/orders/:id
  GET    /api/v1/orders/:id/comments
  POST   /api/v1/orders/:id/comments
  POST   /api/v1/orders/:id/steps/:step/complete

Versionierung:
  /api/v1/ → stabil
  Breaking changes → /api/v2/
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- DAL-Adapter-Idee: Frontend spricht nur gegen eine Schnittstelle
- KEY_MAP-Konzept aus server.js: Collection-Name → Datei-Name
- SSE-Mechanismus für Live-Updates (`/api/v1/events`)

**Was NICHT übernommen wird:**
- `server.js` JSON-Datei-Backend (kein Locking, kein Scaling)
- `DAL_USE_API = false` als Default

---

### 1.4 — Design-System & UI-Grundlagen

**Warum jetzt:**
CC Intern hat ~1.280 Zeilen Inline-CSS.
Im Cockpit braucht jede Komponente konsistente Klassen.

**Was gebaut wird:**

```
CSS-Variablen (Farben, Abstände, Typografie)
Basis-Komponenten:
  - Button (primary, secondary, danger)
  - Badge (Status-Farben)
  - Card / Panel
  - Tabelle
  - Modal
  - Toast / Notification
  - Input, Select, Textarea
  - Tabs

Farb-System (aus CC Intern übernehmen):
  --blue:   #1565C0   (Grafik, Links)
  --green:  #2E7D32   (Abgeschlossen, OK)
  --amber:  #E65100   (Montage, Warnung)
  --red:    #C62828   (Dringend, Fehler)
  --purple: #7C3AED   (Doku)
  --text:   #1C1C1E
  --border: #E5E5EA
```

**Was aus CC Intern übernommen wird:**
- Farbsystem (bewährt, vom Team akzeptiert)
- Badge-Konzept (Status-Farben)
- Kartenformat für Listen

**Was NICHT übernommen wird:**
- Inline-Styles (`style="..."`)
- CSS direkt im `<style>`-Tag ohne Namespacing

---

## PHASE 2 — STAMMDATEN

> Mitarbeiter und Kunden sind Fremdschlüssel überall.
> Müssen existieren bevor Aufträge angelegt werden können.

---

### 2.1 — Mitarbeiter-Verwaltung

**Warum vor Aufträgen:**
Jeder Auftrag hat Verantwortliche. Jede Zeitbuchung hat einen MA.
Ohne MA-Tabelle sind keine Aufträge möglich.

**Was gebaut wird:**

```
Admin-Oberfläche:
  - Mitarbeiter anlegen / bearbeiten / deaktivieren
  - Rolle zuweisen
  - Soll-Stunden und Urlaubs-Tage pflegen

Anzeige:
  - Liste aller aktiven Mitarbeiter
  - Kapazitätsübersicht (Ist vs. Soll)
  - Urlaubs-Kalender

API-Endpunkte:
  GET    /api/v1/employees
  POST   /api/v1/employees
  PATCH  /api/v1/employees/:id
```

**Was aus CC Intern übernommen wird (Daten):**
```
MA_DATA → employees-Tabelle (einmalige Migration):
  CE → Celal, Geschäftsführung, soll:160, urlaub:28
  ME → Melanie, Grafik, soll:160
  SE → Selim, Produktion, soll:168
  OK → Okan, Montage, soll:168
  MO → Mohammed, Produktion+Montage, soll:168
  ... (alle 10 MA)
```

**Was NICHT übernommen wird:**
- `MA_DATA` fest im Code
- Stundensätze im Frontend

---

### 2.2 — Kunden-Stammdaten

**Warum vor Aufträgen:**
Jeder Auftrag hat einen Kunden-FK.
Ohne Kunden-Tabelle sind keine Aufträge möglich.

**Was gebaut wird:**

```
Kunden-Verwaltung:
  - Anlegen / bearbeiten
  - Ansprechpartner
  - Status (Aktiv, Angebot, Neukontakt, ...)
  - Aktivitäten-Log (Telefonat, E-Mail, Besuch)

Suche:
  - Name, Stadt, Status

API-Endpunkte:
  GET    /api/v1/customers
  POST   /api/v1/customers
  PATCH  /api/v1/customers/:id
  GET    /api/v1/customers/:id/orders    ← echte FK-Relation
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- Statustypen: Aktiv, Angebot, Neukontakt, Geplant, Inaktiv
- Aktivitäten-Log pro Kunde
- Pipeline-Konzept (Kanban nach Status)

**Was NICHT übernommen wird:**
- `CRM_KUNDEN{}` als Objekt (→ Array mit UUID)
- `umsatz` als String (→ Float, berechnet aus Aufträgen)
- String-Match Kunden→Aufträge (→ echter FK)

---

## PHASE 3 — KERN: AUFTRÄGE & WORKFLOW

> Das Herzstück. Alles andere hängt daran.

---

### 3.1 — Auftrags-Datenmodell & Anlage

**Was gebaut wird:**

```
Auftrags-Formular:
  Sektion 1: Basis (Kunde FK, Leistung, Fahrzeug)
  Sektion 2: Termine (Produktionsstart, Montagetermin separat)
  Sektion 3: Kalkulation (Netto, Brutto auto, Zahlziel)
  Sektion 4: Produktionsdetails (Material, Laminat, Fläche)
  Sektion 5: Hinweise (für Rechnungserstellung, Montage, Besonderheiten)
  Sektion 6: Workflow-Schritte (welche Schritte, wer, wie lange)

Auftrags-Nummer:
  display_id: 'AU-2026-NNNNN' (lesbar, für Kommunikation)
  id:         UUID (intern, für FK-Relationen)

Validierung:
  - Kunde muss aus Kunden-Tabelle gewählt werden (kein Freitext)
  - Starttermin Pflichtfeld
  - Netto als Zahl (kein Komma-Problem wie in CC Intern)
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- Pflichtfelder-Konzept (Starttermin, Kunde, mind. 1 Schritt)
- Auftragsarten und Leistungstypen
- Trennung Produktionsstart / Montagetermin
- `notizProd` → Hinweise für Rechnungserstellung (bewährtes Konzept)

**Was NICHT übernommen wird:**
- `id` als `AU-YYYY-NNNNN` als Primärschlüssel
- `kunde` als Freitext
- `auNr` als globaler Zähler

---

### 3.2 — Workflow-Engine (Schrittübergänge)

**Was gebaut wird:**

```
Workflow-Konfiguration (in DB, nicht im Code):
  steps_config-Tabelle:
    step_key:       'grafik'
    label:          'Grafik / Entwurf'
    farbe:          '#1565C0'
    next_step:      'druck'
    default_rolle:  'grafik'    ← Rolle, nicht fester Name
    reihenfolge:    1

Schrittübergang-Logik:
  1. Berechtigungsprüfung: user.rolle === step.default_rolle (oder admin)
  2. Checklisten-Prüfung: alle 'pflicht'-Items erledigt?
  3. Foto-Prüfung: fotosErforderlich && fotos.length === 0?
  4. Transaktion:
     - current_step.fertig = true, fertig_zeit = now
     - order.step = next_step
     - next_step.status = 'in_bearbeitung'
     - wenn next = 'abgeschlossen': order.rechnung_status = 'offen'
  5. Notification an nächsten Verantwortlichen
  6. Audit-Log-Eintrag

API:
  POST /api/v1/orders/:id/steps/:step/complete
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- 6-Schritt-Sequenz: grafik → druck → laminat → montage → doku → abgeschlossen
- Pflicht-Checklisten vor Abschluss
- Benachrichtigungs-Trigger beim Schrittübergang
- `rechnung_status = 'offen'` automatisch bei Abschluss

**Was NICHT übernommen wird:**
- `STEP_LABELS` fest codiert im Skript
- `nextWer` als fester Mitarbeitername
- Desktop darf alles (kein echtes Auth)

---

### 3.3 — Kanban-Board & Auftragsübersicht

**Was gebaut wird:**

```
Kanban-Board:
  - Eine Spalte pro aktiven Schritt (grafik bis abgeschlossen)
  - Archivierte Aufträge werden nicht angezeigt
  - Karten zeigen: Kunde, FZ, Termin, Priorität, Verantwortlicher

Priorisierungssystem (aus CC Intern 1:1 übernehmen):
  urgent === true       → Rot, ganz oben
  termin < heute        → Orange (überfällig)
  termin === heute      → Gelb
  normal                → Schrittfarbe

Listen-Ansicht (Tabs):
  Alle | In Arbeit | Abgeschlossen | Rechnung offen | Archiv

Suche:
  - Kunde, AU-Nr., Fahrzeug, Paket
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- Visuelles Prioritätssystem (Farben + Reihenfolge)
- Tab-Filter-Konzept
- Trennung Produktionskarte / Montagekarte im Kalender

**Was NICHT übernommen wird:**
- `renderKanban()` als 150-Zeilen-Funktion
- Inline-HTML-String-Generierung

---

### 3.4 — Auftrags-Detailansicht

**Was gebaut wird:**

```
Komponenten (getrennt, nicht eine Monolith-Funktion):

  AuftragHeader       Kunde, ID, Status, Termin, Priorität
  AuftragWorkflow     Schritte-Übersicht, aktueller Stand
  AuftragKommentare   Chat-Feed (eigene Component)
  AuftragZeiten       Zeitverlauf gruppiert nach Tag
  AuftragDateien      Dateien-Tabelle mit Download/Löschen
  AuftragProduktion   Material, Maschine, Planungsdaten
  AuftragFinanzen     Netto, Brutto, Hinweise Rechnungserstellung
  AuftragCheckliste   Schrittbezogene Checklisten

Wichtig:
  - Jede Komponente holt ihre eigenen Daten via API
  - Keine Monolith-Funktion wie openAuftragDetail()
  - Echtzeit-Update bei Kommentaren / Statuswechseln via WebSocket
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- Aufbau der Detailansicht (Bereiche, Inhalte)
- Arbeits-Verlauf gruppiert nach Tag (bewährtes UX-Konzept)
- Datei-Tabelle mit Typ-Tag, Größe, Download, Löschen
- Kollapsible Bereiche (nur Verlauf-Sektion)

**Was NICHT übernommen wird:**
- `openAuftragDetail()` als eine ~500-Zeilen-Funktion
- `innerHTML`-String-Generierung

---

## PHASE 4 — ABHÄNGIGE MODULE

> Diese Module brauchen Aufträge und Mitarbeiter aus Phase 2+3.

---

### 4.1 — Zeiterfassung

**Was gebaut wird:**

```
Zeitbuchung:
  - Schritt starten / stoppen (Timer)
  - Manuelle Eingabe (Start, Ende, Dauer)
  - Auftrag + Schritt + Mitarbeiter sind Pflichtfelder

Auswertung:
  - Pro Auftrag: Gesamtstunden, nach Schritt aufgeteilt
  - Pro Mitarbeiter: Wochen-/Monatsübersicht (Ist vs. Soll)
  - Zeitverlauf im Auftrags-Detail (gruppiert nach Tag)

Normalisierung (vs. CC Intern):
  start / end als ISO 8601 (nicht 'DD.MM HH:MM')
  dauer in Minuten (bleibt)
  MA-Name NICHT im Eintrag (nur mitarbeiter_id FK)

API:
  GET  /api/v1/orders/:id/time-entries
  POST /api/v1/orders/:id/time-entries
  GET  /api/v1/employees/:id/time-entries?von=...&bis=...
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- Struktur: `{step, mitarbeiter_id, start, end, dauer_min}`
- Gruppenansicht nach Tag in Auftrags-Detail
- Summen-Badge pro Tag

**Was NICHT übernommen wird:**
- `a.zeiten[]` eingebettet im Auftrag
- Zeitformat `DD.MM HH:MM`
- MA-Name redundant im Eintrag

---

### 4.2 — Kommunikation (Chat & Benachrichtigungen)

**Was gebaut wird:**

```
Auftragsbezogener Chat:
  - Kommentare pro Auftrag (eigene Collection, nicht eingebettet)
  - Frage-Markierung (istFrage)
  - Autor aus Session (nicht aus localStorage)
  - Read-Status pro Mitarbeiter (neu in Cockpit)

Live-Updates:
  WebSocket oder SSE (Entscheidung nach Backend-Stack)
  Trigger:
    - Neuer Kommentar
    - Schrittübergang
    - Auftrag angelegt
    - Dringlich-Markierung

Benachrichtigungs-Center:
  - Ungelesene Badge
  - Liste nach Typ sortiert
  - Klick → direkt zum Auftrag

API:
  GET  /api/v1/orders/:id/comments
  POST /api/v1/orders/:id/comments
  GET  /api/v1/notifications
  POST /api/v1/notifications/:id/read
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- Trigger-Konzept: was löst eine Benachrichtigung aus
- SSE-Architektur-Idee (Broadcast an alle verbundenen Clients)
- Kommentar-Felder: text, autor, ts, istFrage

**Was NICHT übernommen wird:**
- Kommentare eingebettet im Auftrag-JSON
- Kein Read-Status (wird neu gebaut)
- SSE-Server ohne Auth (→ gesicherte WebSocket-Verbindung)

---

### 4.3 — Rechnungsstatus / Lexware-Queue

**Was gebaut wird:**

```
Lexware-Queue:
  Filter: step='abgeschlossen', rechnung_status='offen', archiv=false
  Spalten: AU-Nr. | Kunde | FZ/Leistung | Abgeschlossen | Netto | Brutto | Hinweise
  Aktionen:
    - "✅ In Lexware erstellt" → setzt rechnung_status='geschrieben' + archiv=true
    - Auftrag-Link → Detail-Ansicht

Rechnungs-Status am Auftrag:
  'offen'       → Auftrag abgeschlossen, Rechnung noch nicht in Lexware
  'geschrieben' → In Lexware eingetragen (= Archivierungs-Trigger)
  'bezahlt'     → Zahlung eingegangen (manuell)

Archivierungslogik (aus CC Intern 1:1 übernehmen):
  lexwareErstellt() → rechnung='geschrieben' + archiv=true + archivDatum=now

API:
  GET   /api/v1/orders/lexware-queue
  PATCH /api/v1/orders/:id/lexware-done
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- Lexware-Queue-Konzept vollständig
- Spalten-Auswahl (was Frau Zint sehen muss)
- Archivierungslogik nach Bestätigung
- Status-Dreieck: offen → geschrieben → bezahlt

**Was NICHT übernommen wird:**
- `a.rechnung` direkt am Auftrag-Objekt (→ eigener Status-Bereich oder normalisiert)
- Alte `RECHNUNGEN[]`-Parallelstruktur

---

### 4.4 — Kalender

**Was gebaut wird:**

```
Aggregierter Kalender:
  Quellen (alle in einer Ansicht):
    1. orders.termin_datum       → Produktionsstart-Einträge
    2. orders.montage_datum      → Montagetermine (wenn != termin_datum)
    3. fusa_termine (ohne order) → Externe FUSA-Aufträge

  Farbcodierung:
    urgent           → Rot
    schritt-farbe    → nach aktuellem Workflow-Schritt
    FUSA-extern      → Amber

  Ansichten:
    Monat | Woche | Tag

  Interaktion:
    Klick auf Auftrag → Auftrag-Detail öffnen
    Klick auf FUSA → FUSA-Detail

API:
  GET /api/v1/calendar?von=...&bis=...
  → aggregiert alle Quellen server-seitig
```

**Was aus CC Intern übernommen wird (als Spezifikation):**
- Aggregationslogik: CC + FUSA in einer Ansicht
- Trennung Produktionsstart / Montagetermin
- Farbsystem nach Priorität/Schritt

**Was NICHT übernommen wird:**
- `CC_FUSA_TERME` statisch im Code
- Kein Export (→ iCal-Export neu bauen)

---

## PHASE 5 — WEITERE MODULE

> Eigenständig, geringere Kopplung. Können parallel entwickelt werden.

---

### 5.1 — Lager

```
Bestandsverwaltung:
  - Artikel anlegen / bearbeiten
  - Bestand buchen (Zugang / Entnahme)
  - Meldebestand-Ampel (ok / warn / leer)
  - Kategorien: folie, laminat, reinigung, werkzeug, farbe

Neu (nicht in CC Intern):
  - Lieferanten-FK (welcher Lieferant liefert diesen Artikel)
  - Bestellvorgang (Status: bestellt / geliefert)

Migration:
  LAGER_CC[] → inventory-Tabelle (1:1 übertragbar)

API:
  GET   /api/v1/inventory
  PATCH /api/v1/inventory/:id/book   ← Buchung mit Menge + Richtung
```

---

### 5.2 — Urlaub & Abwesenheit

```
Antrag-Workflow:
  - Mitarbeiter stellt Antrag (offen)
  - Vorgesetzter genehmigt / lehnt ab
  - Neu: Benachrichtigung bei Entscheidung

Antragstypen (aus CC Intern):
  urlaub | abwesenheit | krank | bildung

Neu (nicht in CC Intern):
  - Resturlaub-Berechnung (Anspruch - genommene Tage)
  - Sichtbarkeit im Kalender
  - Überschneidungs-Warnung (Urlaub + geplante Montage)

Migration:
  URLAUB_ANTRAEGE[] → absences-Tabelle
  MA-Name im Antrag wird nicht migriert (nur mitarbeiter_id FK)

API:
  GET   /api/v1/absences
  POST  /api/v1/absences
  PATCH /api/v1/absences/:id/approve
  PATCH /api/v1/absences/:id/reject
```

---

### 5.3 — CRM Pipeline & Leads

```
Kunden-Pipeline:
  - Status-Kanban (Neukontakt → Angebot → Verhandlung → Gewonnen)
  - Aktivitäten-Log (Telefonat, E-Mail, Besuch, Notiz)
  - Wiedervorlage-System

Leads / Anfragen:
  - Eingehende Anfragen erfassen
  - Zu Auftrag konvertieren (mit Kunden-FK)

Angebote (AG_DATEN):
  - Angebots-Kalkulator (aus CC Intern übernehmen)
  - Status: entwurf → versendet → gewonnen / verloren
  - Verknüpfung mit Kunde FK

Neu (nicht in CC Intern):
  - LEADS[] und ANF_DATEN[] zusammengeführt (waren Duplikat)

API:
  GET   /api/v1/customers/:id/activities
  POST  /api/v1/customers/:id/activities
  GET   /api/v1/leads
  POST  /api/v1/leads
  POST  /api/v1/leads/:id/convert    ← Lead → Auftrag
```

---

## PHASE 6 — INTEGRATION & MIGRATION

> Letzte Phase. CC Intern und Cockpit laufen parallel bis Migration abgeschlossen.

---

### 6.1 — FUSA-Anbindung

```
Problem in CC Intern:
  CC_FUSA_TERME[] ist statisch im Code — keine echte Datenquelle

Cockpit:
  fusa_termine-Tabelle als eigene Collection
  FUSA-Einträge können mit orders verknüpft werden (order_id FK)
  Kalender zeigt beides in einer Ansicht

Migration:
  Bestehende CC_FUSA_TERME[] → fusa_termine-Tabelle
  (6 Einträge, manuell übertragbar)
```

---

### 6.2 — Dashboard

```
Wird zuletzt gebaut weil es alles aggregiert.

KPIs (aus CC Intern übernehmen):
  - Aktive Aufträge (step !== 'abgeschlossen', !archiv)
  - Dringende Aufträge (urgent)
  - Abgeschlossen diese Woche/Monat
  - Rechnung offen (Lexware-Queue-Count)
  - Auslastung pro Mitarbeiter

Neu:
  - Umsatz-Übersicht (netto/brutto aus Aufträgen)
  - Kapazitäts-Heatmap (wer hat wann wie viel Arbeit)

API:
  GET /api/v1/dashboard/stats
  → server-seitig berechnet, kein Frontend-Aggregat
```

---

### 6.3 — Datenmigration CC Intern → Cockpit

**Strategie:**
```
1. Cockpit ist vollständig funktionsfähig (alle Phasen 1-5 abgeschlossen)
2. Migrations-Script läuft einmalig:
   a. MA_DATA → employees (UUID generieren, kuerzel als display_id)
   b. CRM_KUNDEN → customers (UUID, umsatz-String ignorieren)
   c. AUFTRAEGE → orders + order_steps + time_entries + comments + files
      - Eingebettete Arrays werden in eigene Tabellen ausgelagert
      - Base64-Dateien werden in Filestore hochgeladen, Pfad gespeichert
      - display_id = altes AU-Format (bleibt lesbar)
   d. URLAUB_ANTRAEGE → absences
   e. LAGER_CC → inventory
   f. CC_FUSA_TERME → fusa_termine
3. Nach Migration: CC Intern auf read-only setzen (1-2 Wochen Parallelphase)
4. Nach Parallelphase: CC Intern abschalten
```

**Datenmigration-Risiken:**

| Risiko | Problem | Lösung |
|---|---|---|
| `kunde`-Freitext → `kunden_id` | Welcher Kunde ist gemeint? | Manuelles Mapping vor Migration |
| Base64-Dateien | Große JSON-Datei | Filestore-Upload im Migration-Script |
| Zeitformat `DD.MM HH:MM` | Kein ISO | Parser im Migration-Script |
| `notizProd` = `prod.planung.notiz` | Duplikat | Nur `notizProd` migrieren |
| `umsatz` als String | Nicht berechenbar | Ignorieren, aus Aufträgen neu berechnen |

---

## TECHNOLOGIE-EMPFEHLUNG

> Keine Verpflichtung — nur Orientierung für die Entscheidung.

```
Backend:
  Node.js (bekannt aus CC Intern) + Express oder Fastify
  PostgreSQL (relationale Daten, JSON-Felder möglich)
  Authentifizierung: JWT + Refresh Token

Frontend:
  Vue 3 + Composition API (überschaubar, gute DX)
  oder React + Next.js (größeres Ökosystem)
  Design-System: Eigenes (aus CC Intern-Farben aufbauen)

Realtime:
  WebSocket (socket.io) oder SSE (simpler, reicht für diesen Use Case)

Filestore:
  MinIO (self-hosted S3-kompatibel) oder Cloudflare R2

Deployment:
  Docker-Container → VPS (Strato, Hetzner)
  Oder: bestehender Strato-Server wenn Node.js möglich
```

---

## ABHÄNGIGKEITSGRAPH

```
Phase 1 (Fundament)
  1.1 Auth
  1.2 Datenbankschema       ← braucht 1.1
  1.3 API-Grundstruktur     ← braucht 1.1 + 1.2
  1.4 Design-System         ← unabhängig, parallel möglich
        ↓
Phase 2 (Stammdaten)
  2.1 Mitarbeiter           ← braucht 1.1 + 1.2 + 1.3
  2.2 Kunden                ← braucht 1.1 + 1.2 + 1.3
        ↓
Phase 3 (Kern)
  3.1 Auftragsmodell        ← braucht 2.1 + 2.2
  3.2 Workflow-Engine       ← braucht 3.1
  3.3 Kanban / Übersicht    ← braucht 3.1 + 3.2
  3.4 Auftrags-Detail       ← braucht 3.1 + 3.2
        ↓
Phase 4 (Abhängig)
  4.1 Zeiterfassung         ← braucht 3.1 + 2.1
  4.2 Kommunikation         ← braucht 3.1 + 2.1 + 1.3
  4.3 Lexware-Queue         ← braucht 3.1 + 3.2
  4.4 Kalender              ← braucht 3.1 + 6.1
        ↓
Phase 5 (Parallel möglich)
  5.1 Lager                 ← braucht nur 1.x
  5.2 Urlaub                ← braucht 2.1
  5.3 CRM                   ← braucht 2.2 + 3.1
        ↓
Phase 6 (Integration)
  6.1 FUSA                  ← braucht 3.1 + 4.4
  6.2 Dashboard             ← braucht alles
  6.3 Datenmigration        ← braucht alles
```

---

## LIEFEROBJEKTE PRO PHASE

| Phase | Auslieferbar wenn... | Nutzbar für CC-Team |
|---|---|---|
| Phase 1 | Auth + DB + API + Design | Nein (kein Content) |
| Phase 2 | MA + Kunden pflegbar | Teilweise (Stammdaten) |
| Phase 3 | Aufträge anlegen + Kanban | ✅ Ja — Kernbetrieb möglich |
| Phase 4 | Zeiterfassung + Lexware | ✅ Vollbetrieb möglich |
| Phase 5 | Lager + Urlaub | ✅ Alle Module verfügbar |
| Phase 6 | Migration abgeschlossen | ✅ CC Intern kann abgeschaltet werden |

**Empfehlung:** Nach Phase 3 bereits parallel zu CC Intern starten. Das Team kann den Cockpit im Alltag testen während CC Intern noch läuft.

---

## WAS DIESES DOKUMENT NICHT IST

```
✗ Kein technisches Pflichtenheft
✗ Kein Sprint-Plan (keine Zeitangaben)
✗ Keine Technologie-Entscheidung (nur Empfehlung)
✗ Kein UI-Mockup
✗ Kein Auftrag zur Umsetzung

✓ Fachliche Bausequenz
✓ Abhängigkeiten zwischen Modulen
✓ Was aus CC Intern als Spezifikation dient
✓ Was neu gebaut werden muss
✓ Migrationsrisiken und -strategie
```
