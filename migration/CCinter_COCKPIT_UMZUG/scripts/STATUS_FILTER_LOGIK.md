# STATUS_FILTER_LOGIK.md — CC Intern Cockpit-Umzug
**Checkliste Punkt 9: Status-/Filterlogik zentralisieren**
**Stand: April 2026**

> Alle Status- und Filter-Funktionen im Überblick.
> Duplikate identifiziert, Zentralisierungsplan definiert.

---

## PROBLEM: DUPLIKATE

Mehrere Funktionen existieren 2–3× in verschiedenen Dateien.
Das führt beim Umzug zu Konflikten wenn zwei `<script>` die gleiche Funktion definieren.

---

## 1. DUPLIZIERTE FUNKTIONEN — HANDLUNGSBEDARF

### schrittStatusSetzen(a, step, status)
**Aufgabe:** Setzt den Status eines Auftragsschritts (z.B. 'offen' → 'erledigt')

| Datei | Zeile |
|---|---|
| `views/auftraege-view.js` | ~954 |
| `views/auftraege-view.js` | ~2151 (2. Kopie in selber Datei!) |
| `views/auftraege-detail-view.js` | (eigene Kopie) |

**Aktion:** Nur 1× definieren — in `views/auftraege-view.js`. Alle anderen Kopien entfernen.

---

### lagerTabCC(el, filter)
**Aufgabe:** Tab-Filter für Lager (alle / niedrig / bestellt)

| Datei | Zeile |
|---|---|
| `views/lager-view.js` | ~12 |
| `views/kalender-view.js` | ~314 |
| `views/auftraege-detail-view.js` | ~6005 |

**Aktion:** Nur 1× in `views/lager-view.js`. Aus kalender-view.js und auftraege-detail-view.js entfernen (kalender-view.js wird sowieso ❌ nicht eingebunden).

---

### lagerUpdateStatus(item)
**Aufgabe:** Berechnet Lager-Status (ok / warn / leer) nach Bestand

| Datei | Zeile |
|---|---|
| `views/lager-view.js` | ~19 |
| `views/kalender-view.js` | ~321 |
| `views/auftraege-detail-view.js` | ~6012 |

**Aktion:** Nur 1× in `views/lager-view.js`.

---

### urlaubEntscheiden(id, status)
**Aufgabe:** Genehmigt oder lehnt Urlaubsantrag ab

| Datei | Zeile |
|---|---|
| `views/urlaub-view.js` | ~81 |
| `views/kalender-view.js` | ~2412 |
| `views/auftraege-detail-view.js` | ~8103 |

**Aktion:** Nur 1× in `views/urlaub-view.js`.

---

### setRechnung(id, status)
**Aufgabe:** Setzt Rechnungs-Status (offen / bezahlt / storniert)

| Datei | Zeile |
|---|---|
| `views/auftraege-view.js` | ~865 |
| `views/auftraege-detail-view.js` | ~13 |

**Aktion:** Nur 1× in `views/rechnungen-view.js` (thematisch korrekter Platz). Aus den anderen Dateien entfernen.

---

### agSetStatus(id, status)
**Aufgabe:** Setzt Angebots-Status (offen / gewonnen / verloren)

| Datei | Zeile |
|---|---|
| `views/angebote-view.js` | ~403 |
| `views/auftraege-detail-view.js` | ~1640 |

**Aktion:** Nur 1× in `views/angebote-view.js`.

---

### anfStatus(id, s)
**Aufgabe:** Setzt Anfragen-Status (neu / in_bearbeitung / abgeschlossen)

| Datei | Zeile |
|---|---|
| `views/anfragen-view.js` | ~670 |
| `views/auftraege-detail-view.js` | ~2919 |

**Aktion:** Nur 1× in `views/anfragen-view.js`.

---

## 2. EINZELNE FILTER-FUNKTIONEN (kein Duplikat)

| Funktion | Datei | Zweck |
|---|---|---|
| `auVerwTab(el, filter)` | `views/auftraege-view.js:12` | Aufträge-Tab (aktiv / archiv / alle) |
| `prodFilterSetzen(filter)` | `views/produktion-view.js:82` | Produktion-Kanban (alle / dringend / heute) |
| `anfStatusSetzen(id, status)` | `module/schnell-anfragen/index.js:80` | Schnell-Anfragen Status intern |

Diese sind nur 1× vorhanden — kein Handlungsbedarf.

---

## 3. STATUS-WERTE PRO MODUL

### Aufträge (`AUFTRAEGE[].step`)
```
'angebot'         → Angebot erstellt
'auftrag'         → Auftrag bestätigt
'produktion'      → In Produktion
'montage'         → Montage geplant
'abgeschlossen'   → Fertig
'archiv'          → Archiviert (AUFTRAEGE[].archiv = true)
```

### Angebote (`AG_DATEN[].status`)
```
'offen'           → In Bearbeitung
'gewonnen'        → Auftrag erteilt
'verloren'        → Nicht gewonnen
'abgebrochen'     → Storniert
```

### Anfragen (`ANF_DATEN[].status`)
```
'neu'             → Neue Anfrage
'in_bearbeitung'  → Zugewiesen
'angebot'         → Angebot erstellt
'abgeschlossen'   → Erledigt
```

### Urlaub (`URLAUB_ANTRAEGE[].status`)
```
'offen'           → Antrag gestellt
'genehmigt'       → Genehmigt
'abgelehnt'       → Abgelehnt
```

### Rechnungen
```
'offen'           → Noch nicht bezahlt
'bezahlt'         → Bezahlt
'storniert'       → Storniert
'mahnung'         → Mahnung verschickt
```

### Lager (`LAGER_CC[].status`)
```
'ok'              → Bestand ausreichend
'warn'            → Bestand unter Mindestbestand
'leer'            → Kein Bestand
```

---

## 4. ZENTRALISIERUNGS-PLAN

### Schritt 1: Duplikate entfernen (beim Einbinden der Scripts)

Die `kalender-view.js` und `kunden-view.js` werden **❌ NICHT eingebunden** (bereits in Cockpit).
Damit fallen automatisch weg:
- `lagerTabCC` aus kalender-view.js
- `lagerUpdateStatus` aus kalender-view.js
- `urlaubEntscheiden` aus kalender-view.js

Verbleibende Duplikate die in `auftraege-detail-view.js` stecken:

```
auftraege-detail-view.js enthält Kopien von:
  - schrittStatusSetzen  → behalten in auftraege-view.js, aus detail entfernen
  - lagerTabCC           → behalten in lager-view.js, aus detail entfernen
  - lagerUpdateStatus    → behalten in lager-view.js, aus detail entfernen
  - urlaubEntscheiden    → behalten in urlaub-view.js, aus detail entfernen
  - setRechnung          → verschieben in rechnungen-view.js
  - agSetStatus          → behalten in angebote-view.js, aus detail entfernen
  - anfStatus            → behalten in anfragen-view.js, aus detail entfernen
```

### Schritt 2: Script-Ladereihenfolge sicherstellen

Da Funktionen global auf `window` liegen, muss die View die eine Funktion definiert VOR der View geladen werden die sie aufruft:

```html
<!-- REIHENFOLGE in index.html: -->
<script src="views/lager-view.js"></script>          <!-- definiert lagerTabCC, lagerUpdateStatus -->
<script src="views/urlaub-view.js"></script>          <!-- definiert urlaubEntscheiden -->
<script src="views/angebote-view.js"></script>         <!-- definiert agSetStatus -->
<script src="views/anfragen-view.js"></script>         <!-- definiert anfStatus -->
<script src="views/rechnungen-view.js"></script>       <!-- definiert setRechnung -->
<script src="views/auftraege-view.js"></script>        <!-- definiert schrittStatusSetzen, auVerwTab -->
<script src="views/auftraege-detail-view.js"></script> <!-- nutzt alle oben definierten Funktionen -->
```

### Schritt 3: Hilfsfunktionen in cc-intern-main.js (optional)

Falls mehrere Views denselben Hilfscode brauchen (z.B. Datum-Formatierung, Status-Badge-HTML), diese nach `cc-intern-main.js` verschieben:

```js
// cc-intern-main.js — globale Helfer
window.statusBadge = function(status, map) { /* ... */ };
window.formatDatum = function(ts) { /* ... */ };
```

---

## 5. ZUSAMMENFASSUNG — Duplikate Übersicht

| Funktion | Doppelt in | Canonical (1x bleiben) | Entfernen aus |
|---|---|---|---|
| `schrittStatusSetzen` | auftraege-view.js (2×!), auftraege-detail-view.js | `auftraege-view.js` | detail + 2. Kopie in auftraege |
| `lagerTabCC` | lager-view.js, kalender-view.js, auftraege-detail-view.js | `lager-view.js` | kalender (nicht eingebunden), detail |
| `lagerUpdateStatus` | lager-view.js, kalender-view.js, auftraege-detail-view.js | `lager-view.js` | kalender (nicht eingebunden), detail |
| `urlaubEntscheiden` | urlaub-view.js, kalender-view.js, auftraege-detail-view.js | `urlaub-view.js` | kalender (nicht eingebunden), detail |
| `setRechnung` | auftraege-view.js, auftraege-detail-view.js | `rechnungen-view.js` | beide auftraege-files |
| `agSetStatus` | angebote-view.js, auftraege-detail-view.js | `angebote-view.js` | detail |
| `anfStatus` | anfragen-view.js, auftraege-detail-view.js | `anfragen-view.js` | detail |
