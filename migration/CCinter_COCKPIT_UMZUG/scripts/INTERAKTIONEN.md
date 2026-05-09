# INTERAKTIONEN.md — CC Intern Cockpit-Umzug
**Checkliste Punkt 6: Interaktionen klären**
**Stand: April 2026**

> Alle Modal-, Overlay-, Prompt- und sonstigen Interaktionen je Modul.
> Cockpit darf kein `alert()`, `confirm()`, `prompt()` verwenden — alles muss als UI-Element gebaut sein.

---

## REGEL FÜR COCKPIT

| Typ | Alt (CC Intern) | Neu (Cockpit) |
|---|---|---|
| Bestätigung | `confirm('Wirklich löschen?')` | Modal mit Ja/Nein-Buttons |
| Eingabe | `prompt('Termin eingeben:')` | Inline-Formular oder Modal |
| Info | `alert('Gespeichert!')` | Toast/Snackbar oben rechts |
| Detail | `.open` CSS-Klasse | Gleich bleibt: `.open` CSS-Klasse |
| Vollbild | `window.open(url)` | Neuer Tab — bleibt ok |

---

## MODUL-ÜBERSICHT: ALLE INTERAKTIONEN

---

### 📋 AUFTRÄGE (`auftraege-view.js`, `auftraege-detail-view.js`)

**Modals (per `.open` CSS-Klasse):**

| Modal-ID | Öffnen-Funktion | Schließen | Zweck |
|---|---|---|---|
| `auftragModal` | `auftragNeu()` | `.remove('open')` | Neuer Auftrag anlegen |
| `zeitModal` | `zeitBuchen(maId)` | `.remove('open')` | Arbeitszeit buchen |

**Overlays:**
- Auftrags-Detail öffnet sich als Vollseiten-Swap (keine echtes Overlay, sondern `renderAuftragDetail(id)` ersetzt den Content-Bereich)

**prompt() — MUSS ERSETZT WERDEN:**

```js
// Termin setzen für einen Schritt:
var val = prompt('Zieldatum (TT.MM.JJJJ):', a.liefertermin || '');
// → auftrag auf Termin-Datum setzen

// MA zuweisen:
var maName = prompt('Mitarbeiter zuweisen:', '');
```

**Aktion:** Diese 4 `prompt()`-Aufrufe durch ein kleines Inline-Datum-Input + Button ersetzen (direkt in der Karte).

---

### 💼 ANGEBOTE (`angebote-view.js`)

**Modals:**

| Modal-ID | Öffnen-Funktion | Zweck |
|---|---|---|
| `agModal` | `agNeuModal()` | Neues Angebot erstellen |

**confirm() — MUSS ERSETZT WERDEN:**
```js
if (!confirm('Angebot wirklich löschen?')) return;
```

**Aktion:** Löschen-Bestätigung als Modal-Overlay mit Ja/Abbrechen-Buttons.

---

### 🔍 ANFRAGEN / SCHNELL-ANFRAGEN (`anfragen-view.js`, `module/schnell-anfragen/index.js`)

**Modals:**

| Modal-ID | Öffnen-Funktion | Zweck |
|---|---|---|
| `anfModal` | `anfNeuModal()` | Neue Anfrage erfassen |

**confirm() — MUSS ERSETZT WERDEN:**
```js
if (!confirm('Anfrage löschen?')) return;
```

---

### 🏭 PRODUKTION (`produktion-view.js`, `module/produktion/index.js`)

**Keine Modals.** Nur Filter-Buttons (Alle / Dringend / Heute).

**confirm() — MUSS ERSETZT WERDEN:**
```js
if (!confirm('Auftrag archivieren?')) return;  // in auftragArchivieren()
```

---

### 📦 MATERIALLAGER (`lager-view.js`)

**Modals (alle per `.open` CSS-Klasse):**

| Modal-ID | Öffnen-Funktion | Zweck |
|---|---|---|
| `lagerArtikelModal` | `lagerArtikelModal(idx)` | Artikel anlegen / bearbeiten |
| `lagerBestellModal` | `lagerBestellModal(idx)` | Bestellung aufgeben |
| `lagerWareneingangModal` | `lagerWareneingangModal(idx)` | Wareneingang buchen |
| `lagerLieferantenModal` | `lagerLieferantenModal()` | Lieferanten verwalten |

**confirm() — MUSS ERSETZT WERDEN:**
```js
if (!confirm('Artikel löschen?')) return;
```

---

### ✅ CHECKLISTEN (`module/checklisten/index.js`)

**Keine eigenständigen Modals.** Checklisten werden direkt in der Auftrags-Detail-View inline gerendert.

**confirm() — MUSS ERSETZT WERDEN:**
```js
if (!confirm('Vorlage löschen?')) return;
```

---

### 👥 MITARBEITER (`mitarbeiter-view.js`)

**Overlays:**

| Funktion | Typ | Zweck |
|---|---|---|
| `maRenderDetailOverlay()` | Overlay (div über Content) | Mitarbeiter-Detailansicht mit Zeitkonto, Urlaub, Schichten |

Das Overlay wird erzeugt/wiederverwendet:
```js
function maRenderDetailOverlay() {
  // Overlay erzeugen/wiederverwenden
  var ov = document.getElementById('ma-detail-overlay') || document.createElement('div');
  // ...
}
```

**Kein `prompt()` / `confirm()`** in mitarbeiter-view.js.

---

### 🏖️ URLAUB (`urlaub-view.js`)

**Keine Modals.** Anträge werden inline in einer Tabelle angezeigt und mit Genehmigen/Ablehnen-Buttons entschieden.

```js
function urlaubEntscheiden(id, status) {
  // status: 'genehmigt' | 'abgelehnt'
  // Kein confirm() — Button-Klick direkt
}
```

---

### 📱 MITARBEITER-APP (`mitarbeiter-app-view.js`)

**Keine klassischen Modals.** 

**Stempeln:** Ein/Ausstempeln über direkte Button-Klicks ohne Bestätigung.

---

### 🧾 RECHNUNGEN (`rechnungen-view.js`)

**Modals:**

| Modal-ID | Öffnen-Funktion | Zweck |
|---|---|---|
| `telCheckModal` | `telCheckOpen()` | Telefoncheck-Formular |

```js
function telCheckOpen() {
  document.getElementById('telCheckModal').classList.add('open');
}
function telCheckClose() {
  document.getElementById('telCheckModal').classList.remove('open');
}
```

**Redirect nach Rechnungen-Anlage:**
```js
// Nach Rechnung anlegen → Modal öffnen:
setTimeout(function() { anfNeuModal(); }, 200);
```

---

### 📊 CRM (`module/crm/index.js`)

**Kein separates Modal.** CRM-Aktivitäten werden inline in der Kunden-Karte hinzugefügt.

---

### 📊 DASHBOARD (`module/dashboard/index.js`)

**Nur Lesezugriff.** Keine interaktiven Modals.

---

## window.open() — EXTERNE LINKS

Diese bleiben als `target="_blank"` Links — kein Handlungsbedarf:

| Wo | Zweck |
|---|---|
| PDF-Druck in Rechnungen | `window.open(pdfUrl, '_blank')` |
| WhatsApp-Link | `window.open('https://wa.me/...')` |
| mailto: Links | `window.location.href = 'mailto:...'` |

---

## ZUSAMMENFASSUNG — Was muss geändert werden

| # | Typ | Modul | Funktion | Aktion |
|---|---|---|---|---|
| 1 | `prompt()` | Aufträge | Termin setzen (2x) | Datums-Input inline |
| 2 | `prompt()` | Aufträge | MA zuweisen (2x) | Dropdown-Select inline |
| 3 | `confirm()` | Angebote | Löschen | Modal Ja/Nein |
| 4 | `confirm()` | Anfragen | Löschen | Modal Ja/Nein |
| 5 | `confirm()` | Produktion | Archivieren | Modal Ja/Nein |
| 6 | `confirm()` | Lager | Artikel löschen | Modal Ja/Nein |
| 7 | `confirm()` | Checklisten | Vorlage löschen | Modal Ja/Nein |
| 8 | Modal `.open` | Aufträge | auftragModal | Bleibt — OK |
| 9 | Modal `.open` | Angebote | agModal | Bleibt — OK |
| 10 | Modal `.open` | Anfragen | anfModal | Bleibt — OK |
| 11 | Modal `.open` | Lager | 4 Modals | Bleibt — OK |
| 12 | Modal `.open` | Rechnungen | telCheckModal | Bleibt — OK |
| 13 | Overlay | Mitarbeiter | maRenderDetailOverlay | Bleibt — OK |
