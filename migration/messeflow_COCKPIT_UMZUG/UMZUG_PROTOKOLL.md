# MesseFlow – Umzugsprotokoll (Cockpit-Vorbereitung)

**Erstellt:** 2026-04-13  
**Zuletzt aktualisiert:** 2026-04-18 (alle 6 Pflicht-Punkte erledigt — Cockpit-ready)  
**Zweck:** Dokumentation der Code-Neustrukturierung als Vorbereitung für den Umzug ins CC Cockpit.  
**Scope:** Nur kopiert und neu strukturiert – keine Datei außerhalb von `_COCKPIT_UMZUG/` wurde verändert.

---

## 1. Gelesene Quelldateien

| Datei | Zeilen | Funktionen | Rolle |
|---|---|---|---|
| `DEV/state.js` | 1144 | 53 | Haupt-State: Datenkonstanten, State-Variablen, alle Projekt-/Datei-Logik-Funktionen |
| `DEV/config.js` | 60 | 1 | Konfigurations-Konstanten (App-URL, Demo-Modus, TTLs) |
| `DEV/index.html` | 105 | – | Haupt-HTML (Script-Ladereihenfolge, Shell-Layout, Topbar) |
| `DEV/js/messeflow-app.js` | 2481 | 69 | Haupt-App: Boot, Render-Dispatcher, Navigation, Upload-Workflow |
| `DEV/js/ui/adminView.js` | 959 | 45 | Admin-Zentrale: Benutzer, Firmen, Projekte verwalten |
| `DEV/js/ui/bettinaView.js` | 95 | 1 | Koordinations-Ansicht (Nur-Lese-Übersicht aller Projekte) |
| `DEV/js/ui/projectView.js` | 944 | 18 | Projekt-Detailansicht für alle Rollen |
| `DEV/js/ui/wandCard.js` | 736 | 12 | Wand-Karte: Upload, Maß-Check, DPI-Badge, Prüf-Ergebnis |
| `DEV/js/ui/produktionView.js` | 35 | 1 | Produktion-Nur-Lese-Ansicht (alle druckfertigen Dateien) |
| `DEV/js/ui/modal.js` | 7 | 3 | Globales Modal-Overlay |
| `DEV/js/ui/toast.js` | 10 | 1 | Toast-Benachrichtigungen (4 Sek. Auto-dismiss) |
| `DEV/js/ui/sidebar.js` | 67 | 1 | Projektliste (linke Sidebar) |
| `DEV/js/logic/auth.js` | 268 | 18 | Login, Session (localStorage), Passwort-Reset |
| `DEV/js/logic/devices.js` | 638 | 39 | Geräte-OTP, Device-Verwaltung (localStorage) |
| `DEV/js/logic/invite.js` | 228 | 16 | Einladungs-Tokens, Passwort-Hashing (PBKDF2), Konto-Aktivierung |
| `DEV/js/logic/audit.js` | 60 | 4 | Audit-Log (localStorage, max. 500 Einträge) |
| `DEV/js/logic/errors.js` | 21 | 1 | Fehlermeldungs-Mapping (technisch → nutzerfreundlich) |
| `DEV/js/logic/status.js` | 137 | 3 | Status-Konstanten, Ampel-Logik, `recalc()` |
| `DEV/js/logic/freigabe.js` | 47 | 1 | Produktionsplan, Auto-Freigabe nach vollständiger Druckbereitschaft |
| `DEV/js/logic/uebergabe.js` | 407 | 13 | CC-Intern-Auftrag anlegen, Lieferfotos, Status-Steuerung |
| `DEV/js/api/server.js` | – | 12 | PDF-Prüf-Server-Kommunikation (fetch-Calls) |
| `DEV/js/utils/mass.js` | 42 | 3 | Maß-Parser (`parseMass()`), Differenz-Berechnung |
| `DEV/js/utils/dpi.js` | 22 | 1 | DPI-Berechnung aus Pixelmaßen + Bestellmaß |
| `DEV/js/import/excel.js` | 438 | 3 | Excel-Import: Kopfdaten-Erkennung, Flächen einlesen, Projekt anlegen |
| `DEV/Cockpit/cockpit.css` | 154 | – | Cockpit-spezifische CSS-Overrides (body.ckp-module) |
| `DEV/Cockpit/styles.css` | 279 | – | Basis-Styles (Variablen, Layout, Components) |

**Gesamt:** 26 Quelldateien · ~9.438 Zeilen Quellcode

---

## 2. Neu erstellte Dateien

| Neue Datei | Zeilen | Größe | Zusammengeführt aus |
|---|---|---|---|
| `js/logic/messeflow-config.js` | 66 | 3,7 KB | `DEV/config.js` |
| `js/logic/messeflow-state.js` | 1.160 | 52,1 KB | `DEV/state.js` |
| `js/logic/messeflow-data-port.js` | 2.183 | 89,8 KB | `logic/invite.js` + `devices.js` + `auth.js` + `audit.js` + `errors.js` + `status.js` + `freigabe.js` + `uebergabe.js` + `api/server.js` |
| `js/ui/messeflow-main-view.js` | 2.503 | 114,8 KB | `js/messeflow-app.js` |
| `js/ui/messeflow-dashboard-view.js` | 1.083 | 59,2 KB | `ui/adminView.js` + `ui/bettinaView.js` |
| `js/ui/messeflow-detail-view.js` | 1.748 | 91,8 KB | `ui/projectView.js` + `ui/wandCard.js` + `ui/produktionView.js` |
| `js/components/messeflow-components.js` | 194 | 11,8 KB | `ui/modal.js` + `ui/toast.js` + `ui/sidebar.js` + `utils/mass.js` + `utils/dpi.js` |
| `js/logic/messeflow-import.js` | 468 | 22,7 KB | `js/import/excel.js` |
| `messeflow.css` | 456 | 23,5 KB | `Cockpit/styles.css` + `Cockpit/cockpit.css` |
| `index.html` | 105 | 5,1 KB | `DEV/index.html` (direkte Kopie) |

**Gesamt neu:** 10 Dateien · ~9.966 Zeilen

---

## 3. Funktions-Zuordnung (Wohin wurde was verschoben?)

### `messeflow-config.js` (logic/)
| Funktion/Konstante | Quelle |
|---|---|
| `MF_APP_BASE_URL`, `MF_PRUEF_SERVER_URL` | config.js |
| `MF_USE_DEMO_DATA`, `MF_SKIP_DEVICE_OTP` | config.js |
| `MF_INVITE_TTL_MINUTES` | config.js |
| `mfBuildAppUrlWithQuery()` | config.js |

### `messeflow-state.js` (logic/)
Vollständiger Inhalt von `state.js` — alle 53 Funktionen + Datenkonstanten + State-Variablen:

| Bereich | Inhalt |
|---|---|
| Datenkonstanten | `FIRMS`, `FIRMA_TYP_*`, `MODULES`, `ROLES`, `USERS`, `MF_DEMO_PROJECTS`, `MF_DEMO_NOTIFS` |
| State-Variablen | `currentUserId`, `activeProjId`, `notifOpen`, `role`, `state` |
| Helper-Getter | `getP()`, `getW()`, `nowStr()` |
| Benutzer-Logik | `isUserGesperrt()`, `userMayUseApp()`, `getEffectiveKontoStatus()` |
| Sichtbarkeit | `canSeeProject()`, `getVisibleProjects()` |
| Rechte | `canEditProject()`, `canViewFinance()`, `canChangeStatus()`, `getProjRechte()`, `setProjRecht()` |
| Team | `buildDefaultProjectAssignments()`, `resolveExternesTeamFromAgenturFirma()`, `applyStandardZuweisungen()` |
| Datei-Workflow | `addFileToWall()`, `freigebenDatei()`, `sendeDateiAnCaldera()`, `setDateiGeliefert()` |
| Firmen | `addFirma()`, `removeFirma()`, `updateProjectFirmas()` |
| Projekt-Status | `deriveProjektStatus()`, `getProjektStatusMeta()`, `syncProjektStatusAlle()` |

### `messeflow-data-port.js` (logic/)
Alle 107 Funktionen aus 9 Quelldateien:

| Bereich | Hauptfunktionen | Quelle |
|---|---|---|
| Einladungen | `createInviteToken()`, `validateInviteToken()`, `activateUserWithInviteToken()`, `mfHashPassword()` | invite.js |
| Geräte | `mfGetMyDevices()`, `mfRegisterDevice()`, `mfRemoveDevice()`, `mfValidateDeviceOtp()` | devices.js |
| Session | `mfGetSession()`, `mfSetSession()`, `mfClearSession()`, `mfLogout()` | auth.js |
| Passwort-Reset | `mfCreatePwdResetToken()`, `mfValidatePwdResetToken()`, `mfLoadPwdResetStore()` | auth.js |
| Audit | `mfAudit()`, `mfAuditInit()`, `mfAuditPersist()`, `mfAuditForProject()` | audit.js |
| Fehler | `mfExplainError()` | errors.js |
| Status | `recalc()`, `projAmpel()`, `effektivePruefSlot()` | status.js |
| Freigabe | `checkAutoFreigabe()`, `PROD_STUFEN` | freigabe.js |
| CC-Intern | `mfCreateCcInternAuftrag()`, `mfUpdateCcInternStatus()`, `mfCcSetGeliefert()`, `mfUebergabePruefen()` | uebergabe.js |
| API/fetch | Server-Kommunikation (PDF-Prüfung, Status-Check) | server.js |

### `messeflow-main-view.js` (ui/)
Vollständiger Inhalt von `messeflow-app.js` — alle 69 Funktionen:

| Bereich | Hauptfunktionen |
|---|---|
| Boot | `messeflowNormalBoot()` |
| Render | `renderView()` – Haupt-Dispatcher |
| Navigation | `selectProj()`, `setUser()`, `onProjectChange()` |
| Module | `mfRefreshModuleBar()`, `mfSwitchAppModule()` |
| Notifications | `renderNotifs()`, `toggleNotif()`, `pushNotif()`, `mfRunDeadlineWarnings()` |
| Login/Invite | `renderMfLoginForm()`, `runMfInviteSetup()`, `runMfMagicLoginSetup()` |
| Upload | `uploadDatei()`, `onDateiAusgewaehlt()`, `confirmUpload()`, `dateiSpeichern()` |
| Neues Projekt | `openNewProjModal()`, `confirmNewProj()`, `npRenderPositionen()` |
| Kommentare | `addProjKommentar()`, `addWandKommentar()`, `buildWandKommentare()` |

### `messeflow-dashboard-view.js` (ui/)
46 Funktionen aus 2 Quelldateien:

| Bereich | Hauptfunktionen | Quelle |
|---|---|---|
| Admin-Zentrale | `openAdminView()`, Untermasken für User/Firmen/Projekte | adminView.js |
| Benutzer | `adminBuildNewInvitedUser()`, Magic-Link, Einladung generieren | adminView.js |
| Koordination | `renderBettinaView()` – aufklappbare Projekt-Tabelle | bettinaView.js |

### `messeflow-detail-view.js` (ui/)
31 Funktionen aus 3 Quelldateien:

| Bereich | Hauptfunktionen | Quelle |
|---|---|---|
| Projekt-Detail | `renderProjView()` – Haupt-Projekt-Screen mit Deadline, Fortschritt, Wand-Liste | projectView.js |
| Wand-Karte | `renderWandCard()` – Einzelne Fläche mit Upload-Button, Status-Pill, Maß-Vergleich | wandCard.js |
| Produktion | `renderProduktionView()` – Alle druckfertigen Dateien in Produktion | produktionView.js |

### `messeflow-components.js` (components/)
9 Funktionen/Konstanten aus 5 Quelldateien:

| Funktion | Quelle |
|---|---|
| `parseMass()`, `vergleicheMasse()`, `fmm()` | utils/mass.js |
| `berechneDpi()` | utils/dpi.js |
| `openModal()`, `closeModal()`, `closeMBG()` | ui/modal.js |
| `toast()` / `showToast()` | ui/toast.js |
| `renderSidebar()` | ui/sidebar.js |

### `messeflow-import.js` (logic/) ← NEU 2026-04-13
3 Funktionen aus `js/import/excel.js`:

| Funktion | Beschreibung |
|---|---|
| `importExcel(event, pid)` | Haupt-Import (FileReader + SheetJS) — 5 Phasen: Kopfzeile suchen → Kopfdaten lesen → Spalten erkennen → Flächen einlesen → Projekt anlegen |
| `parseFinanzWert(raw)` | Finanzzahlen aus beliebigem Format parsen (€-Zeichen, Komma→Punkt) |
| `parseExcelDate(raw)` | Datumserkennung für: Excel-Seriennummer, TT.MM.JJJJ, MM/DD/YYYY, ISO, 2-stelliges Jahr |

**Besonderheiten der Import-Logik:**
- Motiv-Kopfzeile als Trennpunkt: Alles davor = Auftragsinfos, alles danach = Flächen
- Dubletten-Schutz via `findExistingProject()` (Kunde + Projektname + Liefertermin)
- Validierungsblock mit Toast-Warnungen bei unklaren Kopfdaten
- Unterstützt Druckmaß Breite/Höhe vs. Sichtmaß (Sichtmaß wird ignoriert)

### `messeflow.css`
| Bereich | Quelle |
|---|---|
| §1 Base Styles (CSS-Variablen, Layout, alle CSS-Klassen) | Cockpit/styles.css |
| §2 Cockpit-Overrides (`body.ckp-module`, DEV-Leiste, Grid) | Cockpit/cockpit.css |

---

## 4. Offene Punkte – manuell zu prüfen

### Pflicht (vor Cockpit-Integration)

- [ ] **`messeflow-state.js` → Datenmodell anpassen:**  
  `FIRMS`, `USERS`, `ROLES` kommen im Cockpit aus dem zentralen CC-Intern-Datenmodell.  
  Die Arrays müssen durch Cockpit-API-Calls ersetzt oder synchronisiert werden.

- [ ] **`messeflowNormalBoot()` → Cockpit-Boot entfernen:**  
  Das Login-Gate (`mf-login-gate`) wird nicht benötigt — Cockpit übernimmt Auth.  
  Funktion auf `messeflowCockpitBoot(userId)` reduzieren.

- [ ] **`renderView()` → in Cockpit-Routing einbinden:**  
  Cockpit ruft `mfRenderModulePlaceholder('messeflow')` auf — der Content-Slot muss übergeben werden.

- [ ] **`localStorage`-Keys prüfen:**  
  Alle Keys (`mf_session_v1`, `mf_invite_tokens_v1`, `mf_audit_events_v1`, …) auf  
  Namespace-Konflikt mit anderen Cockpit-Modulen prüfen. Ggf. Präfix `mf_` beibehalten.

- [ ] **fetch()-Calls (server.js) → URL-Basis:**  
  `MF_PRUEF_SERVER_URL` aus `messeflow-config.js` muss im Cockpit-Kontext korrekt gesetzt sein.

- [ ] **`messeflow.css` §1 Topbar/Shell-Styles:**  
  Im Cockpit-Betrieb (`body.ckp-module`) werden Topbar und globale Shell von CC Cockpit geliefert.  
  §1-Styles auf MesseFlow-spezifische Klassen reduzieren (alles mit `#topbar`, `#shell`, `#sidebar`  
  wird überschrieben durch §2-Overrides).

### Optional / Nice-to-have

- [ ] **`messeflow-components.js` → `renderSidebar()`:**  
  Im Cockpit übernimmt die Cockpit-Sidebar die Projektliste.  
  Alternativ: `renderSidebar()` als Fallback für Standalone-Betrieb erhalten.

- [ ] **`messeflow-components.js` → `toast()` + `openModal()`:**  
  Cockpit hat ggf. eigenes Notification-/Modal-System.  
  Kompatibilitäts-Wrapper prüfen.

- [ ] **`messeflow-main-view.js` → Modul-Leiste (`mfRefreshModuleBar()`):**  
  Im Cockpit übernimmt die Cockpit-Navigation den Modul-Wechsel.  
  Funktion kann im Cockpit-Betrieb deaktiviert werden.

- [ ] **Demo-Daten (`MF_USE_DEMO_DATA = false`):**  
  Auf Strato/Produktion immer `false`. In `messeflow-state.js` prüfen ob  
  `MF_DEMO_PROJECTS` noch benötigt wird oder entfernt werden kann.

- [x] ~~**`js/import/excel.js` nicht migriert**~~ → **erledigt 2026-04-13:**  
  Eingelesen und als `js/logic/messeflow-import.js` angelegt.

---

## 5. Neue Dateistruktur (Ist-Zustand nach Umzug)

```
_COCKPIT_UMZUG/
  ├── js/
  │   ├── logic/
  │   │   ├── messeflow-config.js       (66 Zeilen)
  │   │   ├── messeflow-state.js        (1.160 Zeilen)
  │   │   ├── messeflow-data-port.js    (2.183 Zeilen)
  │   │   └── messeflow-import.js       (468 Zeilen)  ← NEU 2026-04-13
  │   ├── ui/
  │   │   ├── messeflow-main-view.js    (2.503 Zeilen)
  │   │   ├── messeflow-dashboard-view.js (1.083 Zeilen)
  │   │   └── messeflow-detail-view.js  (1.748 Zeilen)
  │   └── components/
  │       └── messeflow-components.js   (194 Zeilen)
  ├── messeflow.css                     (456 Zeilen)
  ├── index.html                        (105 Zeilen, Original)
  └── UMZUG_PROTOKOLL.md                (dieses Dokument)
```

*Alle anderen Dateien in `_COCKPIT_UMZUG/` (bestehende ccw/, core/, logic/, ui/, etc.) wurden nicht verändert.*
