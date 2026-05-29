# Offene Aufgaben & Notizen — CC Cockpit
_Stand: 2026-05-22_

---

## ✅ Erledigte Aufgaben (diese Session)

### 1. Checklisten-Save-Bug gefixt
- **Datei:** `frontend/modules/ccintern/module/auftraege/checklisten.js`
- **Problem:** `vonVorlageAnwenden` + `checklisteLeeren` speicherten nicht, weil `_pendingDirtyAuftragKeys` leer war
- **Fix:** `touchAuftragDirty(auftragId)` vor `_saveAfterMutation` hinzugefügt

### 2. Checklisten-Zuordnung Whitelist
- **Problem:** `PROJECT_CONTEXT_REQUIRED` Fehler bei `/api/v1/ccintern/checklisten-zuordnung`
- **Fix:** Route zu Whitelist hinzugefügt in:
  - `backend/src/middleware/api-v1-project-context.js`
  - `frontend/core/auth/cc-auth-session.js`

### 3. Strato Server-Struktur dokumentiert
- **Datei:** `strato-server-struktur.md`
- Cockpit Frontend: `/var/www/vhosts/cc-werbung-data.de/cockpit.cc-werbung-data.de/`
- Backend: `/var/www/vhosts/cc-werbung-data.de/api.cc-werbung-data.de/`
- **Wichtig:** `assets/`-Unterordner PFLICHT — `index.html` referenziert `/assets/...`-Pfade

### 4. Frontend-Assets deployed
- Neue dist-Assets via wget auf Server kopiert + `assets/`-Ordner erstellt
- Commit: `c6d61b8` — neue Hash-Dateien in git gepusht

---

## 🔧 Auftrag-Timer F5 Restore — Cursor-Anweisung bereit

- **Datei:** `cursor-anweisung-auftrag-timer-restore.md`
- **Problem:** Nach F5 läuft Auftrag-Timer nicht weiter
- **Root Cause (BESTÄTIGT von Cursor):**
  - `mobInit()` ruft `mobApplyCockpitUser()` auf → setzt `MOB_MA_ID = null` (MA_DATA noch nicht geladen)
  - `mobRestoreAuftragArbeitszeit` wird daher nie aufgerufen
  - Später: `mobReapplyCockpitOrTestMa()` setzt `MOB_MA_ID` korrekt, ruft aber `mobRestoreAuftragArbeitszeit` NICHT auf
- **Fix (noch nicht implementiert):**
  - Datei: `frontend/modules/ccintern/views/mitarbeiter-app-mob-inline.js`
  - Änderung 1: `window.__MOB_AUFTRAG_RESTORE_TRIGGERED__ = true` vor `mobZeitRestore` in `mobInit` (Z. ~226)
  - Änderung 2: In `mobApplyCockpitUser` nach `mobSetMA(mid)` → falls `appOnly && !window.__MOB_AUFTRAG_RESTORE_TRIGGERED__` → `mobZeitRestore(() => mobRestoreAuftragArbeitszeit(...))`

---

## ❓ Auftrag-Timer wird in APP nicht gespeichert — OFFEN, Console-Check nötig

- **Problem:** Desktop speichert Arbeitszeiten, MA App nicht
- **Umfangreiche Analyse durchgeführt:**
  - `mobInternZeitStart/Stop` werden von UI-Buttons aufgerufen (Z. 2827, 3266, 3753)
  - `api.postAuftragArbeitszeitStart/Stop` existieren auf `window.CCIntern.cockpitApi`
  - Backend Stop-Route: `persistAuftragZeitbuchungOnStop` speichert direkt in Auftrag-bemerkung
  - `mobSaveAuftrag` → `persistAuftraegeImmediate(null, auId)` → `addDirtyKeysForAuftragId` → PUT
  - Code-Pfad sieht korrekt aus
- **Nächster Schritt:** Console-Log beim Stop prüfen:
  - `[AUFTRAG_ZEIT_STOP_START]` → Funktion aufgerufen?
  - `[AUFTRAG_ARBEITSZEIT_STOP]` → API-Call erreicht Backend?
  - `[AUFTRAG_ZEIT_STOP_SERVER_OK]` → Zeitbuchung gespeichert?
  - `[AUFTRAG_ARBEITSZEIT_STOP_FAIL]` → API-Fehler?

---

## ⏳ Rechnungen 400 POST Fehler — Noch nicht untersucht

- **Fehler:** `POST https://api.cc-werbung-data.de/api/v1/ccintern/rechnungen 400 (Bad Request)`
- **Tritt beim Boot auf:** `loadRechnungen` → `flushRechnungenToApiThenCache` → POST
- **Status:** User hat Untersuchung noch nicht bestätigt

---

## ⏳ Mitarbeiter App — Checklisten anzeigen

- **Status:** User hat gesagt "warte erst" — on hold

---

## Wichtige Datei-Referenzen

| Datei | Thema |
|---|---|
| `frontend/modules/ccintern/views/mitarbeiter-app-mob-inline.js` | MA App Haupt-Logik |
| `frontend/modules/ccintern/services/ccintern-cockpit-api.js` | API-Funktionen |
| `frontend/modules/ccintern/views/cc-intern-boot.js` | Boot/Init |
| `frontend/modules/ccintern/cc-intern-cockpit-bridge.js` | Cockpit-Bridge, setzt `window.CCIntern.cockpitApi` |
| `backend/src/routes/ccintern/mitarbeiter-operativ.js` | Backend Auftrag-Arbeitszeit Routes |
| `backend/src/lib/ccintern-auftrag-zeiten.js` | `persistAuftragZeitbuchungOnStop` |
| `backend/src/middleware/api-v1-project-context.js` | Whitelist für project-header |
| `frontend/core/auth/cc-auth-session.js` | Frontend Auth + Whitelist |

---

## Wichtige Kontext-Regeln

- Server NIE aus Cowork starten
- Server-Neustart: `kill -9 <PID>` (Phusion Passenger)
- PID ermitteln: `ps aux | grep node | grep -v grep`
- Immer zuerst relevante Docs lesen bevor Code geändert wird
- Minimal-invasive Änderungen
