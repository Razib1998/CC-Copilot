# DUMMY_LOGIK.md — CC Intern Cockpit-Umzug
**Checkliste Punkt 5: Dummy-Logik identifizieren**
**Stand: April 2026**

> Alle Stellen wo CC Intern direkt auf `localStorage` zugreift, Seed-Funktionen aufruft
> oder globale Arrays als Datenbasis nutzt — diese müssen im Cockpit durch echte API-Calls ersetzt werden.

---

## 1. DIREKTE localStorage-ZUGRIFFE (müssen weg / umgebaut werden)

### 1a. Bild-Speicher — Aufträge
**Dateien:** `views/auftraege-detail-view.js` (Zeilen ~5568–5584 und ~10163–10176)

```js
// Schreiben:
localStorage.setItem('cc_dps_' + auftragId + '_' + bildIdx, dataUrl);

// Lesen:
localStorage.getItem('cc_dps_' + auftragId + '_' + bildIdx);

// Löschen:
localStorage.removeItem('cc_dps_' + auftragId + '_' + bildIdx);
```

**Problem:** Bilder werden direkt in localStorage gespeichert, nicht über DataService.
**Lösung im Cockpit:** Bilder als Base64 oder Blob über `POST /api/v1/ccintern/auftraege/:id` (Attachment-Feld) — oder separater `/upload`-Endpunkt wenn vorhanden.

---

### 1b. Detail-Panel offen/zu — Aufträge
**Datei:** `views/auftraege-detail-view.js` (Zeile ~4114, ~9040)

```js
// Schreiben (Panel-State):
localStorage.setItem('cc_dps_' + key, open ? '0' : '1');

// Lesen:
localStorage.getItem('cc_dps_' + key);
```

**Problem:** UI-State (welche Panels offen sind) wird in localStorage gespeichert.
**Lösung im Cockpit:** `window._panelState = {}` (reines In-Memory, kein Persistieren nötig — resetzt beim Seitenwechsel, das ist ok).

---

### 1c. Notification Timestamp
**Dateien:** `views/auftraege-detail-view.js` (Zeile ~8379, ~8405), `views/cc-intern-boot.js` (Zeile ~825), `views/kalender-view.js` (Zeile ~2688, ~2714)

```js
var CC_NOTIF_LAST_SEEN = localStorage.getItem('cc_notif_last_seen') || '';
localStorage.setItem('cc_notif_last_seen', CC_NOTIF_LAST_SEEN);
```

**Problem:** Dreifach dupliziert (boot + detail + kalender). Direkt auf localStorage.
**Lösung im Cockpit:** Einmalig in `cc-intern-main.js` als globale Variable pflegen. Optional: Cockpit-eigene Notification-API nutzen falls vorhanden.

---

### 1d. Urlaub-Backup aus App (Legacy-Sync)
**Dateien:** `views/cc-intern-boot.js` (Zeile ~130), `views/auftraege-detail-view.js` (Zeile ~3041)

```js
try { alt = JSON.parse(localStorage.getItem('mob_urlaub_antraege') || '[]'); } catch(e) {}
```

**Problem:** Liest alten Urlaubs-Key aus der Mitarbeiter-App für Migration/Backup.
**Lösung im Cockpit:** Nur beim ersten Start nach Migration einmalig ausführen, dann entfernen. Im Cockpit kommt Urlaub aus `GET /api/v1/ccintern/urlaub`.

---

### 1e. FUSA Legacy-Key
**Dateien:** `views/cc-intern-boot.js` (Zeile ~230), `views/auftraege-detail-view.js` (Zeile ~3149)

```js
try { oldRaw = localStorage.getItem('fusa_v1'); } catch(e) {}
```

**Problem:** Liest alten FUSA-Key — Überbleibsel vom alten System.
**Lösung im Cockpit:** Komplett entfernen. FUSA hat eigenes Modul im Cockpit.

---

### 1f. Mitarbeiter Verfügbarkeit (operativ)
**Datei:** `module/mitarbeiter/index.js` (Zeile ~39, ~45)

```js
var raw = localStorage.getItem(VERF_KEY);  // 'cc_ma_verf'
localStorage.setItem(VERF_KEY, JSON.stringify(MA_VERF));
```

**Problem:** Tageskurzstatus (verfügbar/krank/urlaub) liegt in localStorage.
**Lösung im Cockpit:** Bleibt vorerst als In-Memory-State ok (ist Tages-Operativ-State). Kann später an `/api/v1/ccintern/mitarbeiter/:id` PATCH gemeldet werden.

---

## 2. GLOBALE ARRAYS — Abhängigkeiten

Diese Arrays werden beim Boot leer initialisiert und durch Backend-Calls befüllt:

| Array | Initialisierung | Befüllung | Backend-Route |
|---|---|---|---|
| `window.AUFTRAEGE` | `cc-intern-main.js:55` | DataService → loadAsync | `GET /ccintern/auftraege` 🔴 |
| `window.AG_DATEN` | `cc-intern-main.js:56` | DataService → loadAsync | `GET /ccintern/angebote` 🔴 |
| `window.ANF_DATEN` | `cc-intern-main.js:57` | DataService → loadAsync | `GET /ccintern/anfragen` 🔴 |
| `window.LAGER_CC` | `cc-intern-main.js:59` | DataService → loadAsync | `GET /ccintern/lager` 🔴 |
| `window.URLAUB_ANTRAEGE` | `cc-intern-main.js:61` | DataService → loadAsync | `GET /ccintern/urlaub` 🔴 |
| `window.MA_DATA` | `cc-intern-main.js:42` | Aus `/api/v1/users` | `GET /users` ✅ |
| `window.COCKPIT_USERS` | `cc-intern-main.js:38` | Aus `/api/v1/users` | `GET /users` ✅ |

**Wichtig:** Alle Views prüfen `typeof AUFTRAEGE !== 'undefined'` bevor sie rendern — das ist korrekt und bleibt so.

---

## 3. SEED-FUNKTIONEN (Demo-Daten)

### 3a. seedAktivitaeten()
**Datei:** `views/kunden-view.js` (Zeile ~476)

```js
function seedAktivitaeten() {
  var seed = {
    'Musterhaus GmbH': [{ typ: 'anruf', ... }],
    'XY Werbeagentur': [...]
  };
  Object.keys(seed).forEach(function(key) {
    if (CRM_KUNDEN[key]) CRM_KUNDEN[key].aktivitaeten = seed[key];
  });
}
```

**Problem:** Harte Demo-Daten für CRM-Aktivitäten. Wird in `cc-intern-boot.js` aufgerufen.
**Lösung im Cockpit:** Komplett entfernen. Aktivitäten kommen aus `GET /api/v1/ccintern/crm-aktivitaeten`.

---

### 3b. Seed-Aufruf in boot.js
**Datei:** `views/cc-intern-boot.js` (suchen nach `seedAktivitaeten`)

Der Aufruf `seedAktivitaeten()` muss aus dem Boot-Prozess entfernt werden sobald die CRM-Aktivitäten-Route gebaut ist.

---

## 4. LOKALER LAGER-LOAD (kein DataService)

**Datei:** `views/cc-intern-boot.js` (Zeile ~291)

```js
loadLager();  // Lager aus localStorage (gemeinsam App + Desktop)
```

**Problem:** `loadLager()` lädt direkt aus localStorage, nicht über DataService/ApiAdapter.
**Lösung im Cockpit:** `loadLager()` muss auf `DataService.loadAsync('cc_intern_lager_v1', ...)` umgestellt werden — analog zu den anderen Arrays.

---

## 5. ZUSAMMENFASSUNG — Was muss geändert werden

| # | Was | Datei(en) | Priorität | Aktion |
|---|---|---|---|---|
| 1 | `cc_dps_*` Bild-Keys | auftraege-detail-view.js | Hoch | Auf API-Upload umstellen |
| 2 | `cc_dps_*` Panel-State | auftraege-detail-view.js | Niedrig | In-Memory reicht |
| 3 | `cc_notif_last_seen` | boot.js, detail, kalender | Mittel | Deduplizieren, 1x in main.js |
| 4 | `mob_urlaub_antraege` | boot.js, detail | Einmalig | Nach Migration entfernen |
| 5 | `fusa_v1` | boot.js, detail | Sofort | Entfernen |
| 6 | `cc_ma_verf` | mitarbeiter/index.js | Niedrig | In-Memory ok vorerst |
| 7 | `seedAktivitaeten()` | kunden-view.js, boot.js | Nach CRM-Route | Entfernen |
| 8 | `loadLager()` direkt | cc-intern-boot.js | Hoch | Auf DataService.loadAsync |
