# CC Intern → CC Cockpit — Cursor Integrationsanweisung

## SITUATION
CC Cockpit hat bereits Tab-Buttons für CC Intern.
Der Inhalt (HTML, Logik, Design) fehlt komplett.
Dieser Ordner liefert ALLES — Cursor muss es nur einbinden.

---

## ⚠️ ARCHITEKTUR-GRUNDREGEL — NUR INHALT, KEINE SHELL

```
╔══════════════════════════════════════════════════════╗
║  COCKPIT liefert:  Topbar + Sidebar + Navigation     ║
║  CC INTERN liefert: NUR den Inhaltsbereich (Mitte)   ║
╚══════════════════════════════════════════════════════╝
```

**CC Intern baut KEINE eigene Sidebar und KEINE eigene Topbar.**

- Die Topbar (Cockpit | FUSA | CC Intern | Abmelden) → kommt vom Cockpit
- Die linke Sidebar (Navigation) → kommt vom Cockpit
- CC Intern rendert **nur den Seiteninhalt** in den Container, den Cockpit übergibt

Das bedeutet:
- `cc-intern-templates.js` → enthält NUR Page-HTML (kein `<div class="sb">`, keine Topbar)
- `cockpitBoot(userId, containerEl)` → Cockpit übergibt den Container, CC Intern füllt ihn
- Das CSS mit `body.ckp-module` blendet CC Intern-eigene Shell-Elemente aus — das ist korrekt so

**Cockpit ist verantwortlich für:**
- Sidebar-Einträge für CC Intern Module
- Navigation zwischen den Modulen
- Benutzer-Anzeige oben rechts

**Aus dem Cockpit-Sidebar müssen entfernt werden:**
- ❌ Kunden → bereits fertig im Cockpit, kein eigener CC Intern Eintrag
- ❌ Kalender → bereits fertig im Cockpit, kein eigener CC Intern Eintrag

---

## COCKPIT SIDEBAR — VOLLSTÄNDIGE ÜBERSICHT

```
Sidebar-Eintrag      Quelle                      Status
─────────────────────────────────────────────────────────────
Dashboard          ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Schnell-Anfragen   ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Angebote           ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Aufträge           ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Kunden             ← Cockpit                     ✅ FERTIG — nicht anfassen
CRM                ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
MesseFlow          ← messeflow_COCKPIT_UMZUG/    ⚠️ SEPARATER UMZUG — anderer Ordner!
Produktion         ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Materiallager      ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Checklisten        ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Kalender           ← Cockpit                     ✅ FERTIG — nicht anfassen
Mitarbeiter        ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Urlaub             ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Mitarbeiter-App    ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Rechnungen         ← CC Intern (dieser Ordner)   🔴 Platzhalter → UMZUG
Benutzer           ← Cockpit                     ✅ FERTIG — nicht anfassen
Rollen             ← Cockpit                     ✅ FERTIG — nicht anfassen
```

### Cockpit-Module — NICHT ANFASSEN:
> ✅ **Kunden** — fertig im Cockpit. CC Intern bekommt Kunden via `loadCockpitData()`.
> ✅ **Kalender** — fertig im Cockpit. Eigener Cockpit-Kalender.
> ✅ **Benutzer** — fertig im Cockpit. Benutzerverwaltung gehört zur Steuerung.
> ✅ **Rollen** — fertig im Cockpit. Rechteverwaltung gehört zur Steuerung.

### MesseFlow — SEPARAT:
> ⚠️ **MesseFlow** — eigener Umzugsordner: `Desktop/messeflow_COCKPIT_UMZUG/`
> Dieser Ordner (CCinter_COCKPIT_UMZUG) ist NICHT zuständig für MesseFlow.

### CC Intern Module — dieser Ordner liefert den Inhalt (11 Module):
```
1.  Dashboard
2.  Schnell-Anfragen
3.  Angebote
4.  Aufträge  (inkl. Detail, Dateien, Checklisten, Kommunikation)
5.  CRM
6.  Produktion
7.  Materiallager
8.  Checklisten
9.  Mitarbeiter
10. Urlaub
11. Mitarbeiter-App
12. Rechnungen
```

---

## DATEIEN IN DIESEM ORDNER

```
CCinter_COCKPIT_UMZUG/
  cc-intern.css            ← Design + body.ckp-module Scoping
  cc-intern-templates.js   ← HTML für alle 11 Module
  cc-intern-main.js        ← Entry Point: CCIntern.init() + cockpitBoot()
  core/
    LocalStorageAdapter.js
    ApiAdapter.js          ← Write-Through-Cache (localStorage + CC Backend)
    SyncAdapter.js
  services/
    CCInternDataService.js
  views/
    cc-intern-boot.js      ← goPage, globale Variablen, Routing, SSE
    anfragen-view.js
    angebote-view.js
    auftraege-view.js
    auftraege-detail-view.js
    lager-view.js
    mitarbeiter-view.js
    mitarbeiter-app-view.js
    produktion-view.js
    rechnungen-view.js
    urlaub-view.js
    [kunden-view.js]       ← ❌ NICHT einbinden — Kunden bereits fertig im Cockpit
    [kalender-view.js]     ← ❌ NICHT einbinden — Kalender bereits fertig im Cockpit
  module/
    dashboard/index.js
    schnell-anfragen/index.js
    angebote/index.js
    auftraege/detail.js       ← ⚠️ ABNAHMEPROTOKOLL — renderAbnahmeBlock() + abnahmeBestaetigen() + Foto-Upload
    auftraege/dateien.js      ← Drag & Drop Upload, Dateiliste filtern, Datei umbenennen
    auftraege/checklisten.js  ← CL-Vorlage auf Schritt anwenden, Mini-Progress
    auftraege/kommunikation.js ← Chat-Filter, Zitieren, Ungelesen-Badge
    crm/index.js
    checklisten/index.js
    rechnungen/index.js
    mitarbeiter/index.js
    produktion/index.js
    materiallager/index.js
    urlaub/index.js
    mitarbeiter-app/index.js
    benutzer/index.js
    [auftraege/kalender.js]   ← ❌ NICHT einbinden — Kalender bereits fertig im Cockpit
    [kunden/index.js]         ← ❌ NICHT einbinden — Kunden bereits fertig im Cockpit
  scripts/                  ← NUR REFERENZ — nicht ins Cockpit kopieren
    01_schema_migration.sql ← DB-Schema für ccintern_kunden_extra + crm_aktivitaeten
    02_import_kunden.js     ← Einmalig: Kunden-Import (nur bei Migration)
    03_bootstrap_cockpit.js ← Cockpit-API Bootstrap (ccInternInit)
    BACKEND_ROUTEN.md       ← Referenz: 10 Backend-Routen die gebaut werden müssen
    SOLL_IST_MATRIX.md      ← Referenz: Datenfeld-Mapping CC Intern ↔ Cockpit DB
    DUMMY_LOGIK.md          ← Referenz: localStorage-Stellen + globale Arrays + Seeds
    INTERAKTIONEN.md        ← Referenz: Modals, Overlays, prompt()-Aufrufe je Modul
    STATUS_FILTER_LOGIK.md  ← Referenz: alle Status/Filter-Funktionen + Duplikate
```

> Die Dateien in `scripts/` sind **Nachschlagewerke** — sie werden nicht ins Cockpit kopiert.
> Cursor liest sie nur wenn eine konkrete Frage auftaucht (z.B. welche Backend-Route fehlt).

---

## SCHRITT 1 — CDN einbinden (PFLICHT, vor allen Scripts)

```html
<!-- PFLICHT: Excel/PDF Export -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
```

STOP → zeigen

---

## SCHRITT 2 — Dateien ins Cockpit kopieren

```
frontend/modules/ccintern/
  cc-intern.css
  cc-intern-templates.js
  cc-intern-main.js
  core/        ← LocalStorageAdapter.js, ApiAdapter.js, SyncAdapter.js
  services/    ← CCInternDataService.js
  views/       ← cc-intern-boot.js + alle *-view.js
               ⚠️ AUSNAHME: kunden-view.js und kalender-view.js NICHT kopieren
  module/      ← alle Unterordner mit index.js / detail.js etc.
               ⚠️ AUSNAHME: module/kunden/ und module/auftraege/kalender.js NICHT kopieren
```

> **Kunden** und **Kalender** sind bereits fertig im Cockpit implementiert.
> Diese Dateien bleiben im Umzug-Ordner als Archiv, werden aber NICHT ins Cockpit eingebunden.

STOP → zeigen

---

## SCHRITT 3 — CSS einbinden

```html
<link rel="stylesheet" href="modules/ccintern/cc-intern.css">
```

Das CSS blendet automatisch CC Intern-eigene Topbar und Sidebar aus,
sobald `body.ckp-module` gesetzt ist (passiert in cockpitBoot()).

STOP → zeigen

---

## SCHRITT 4 — Cockpit-API-URL setzen (VOR allen Scripts)

```html
<script>
  window.CC_INTERN_COCKPIT_API = 'http://localhost:5371'; // CC Cockpit Backend
</script>
```

STOP → zeigen

---

## SCHRITT 5 — Script-Ladereihenfolge (EXAKT SO)

⚠️ **KRITISCH: Alle Scripts als klassische `<script src="...">` einbinden — KEIN `type="module"`!**
Die Funktionen in `module/auftraege/detail.js` (Abnahmeprotokoll) und anderen Modulen müssen
global auf `window` verfügbar sein. Mit `type="module"` werden sie lokal gescoped und
`auftraege-detail-view.js` findet `renderAbnahmeBlock` nicht → Abnahme-Sektion bleibt leer, kein Fehler!

```html
<!-- 1. CDN (ZUERST) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>

<!-- 2. Cockpit-API-URL setzen -->
<script>window.CC_INTERN_COCKPIT_API = 'http://localhost:5371';</script>

<!-- 3. Core: Service + Adapter -->
<script src="modules/ccintern/core/LocalStorageAdapter.js"></script>
<script src="modules/ccintern/core/ApiAdapter.js"></script>
<script src="modules/ccintern/core/SyncAdapter.js"></script>
<script src="modules/ccintern/services/CCInternDataService.js"></script>

<!-- 4. Boot + Routing -->
<script src="modules/ccintern/views/cc-intern-boot.js"></script>

<!-- 5. View-Schicht -->
<script src="modules/ccintern/views/anfragen-view.js"></script>
<script src="modules/ccintern/views/angebote-view.js"></script>
<script src="modules/ccintern/views/auftraege-view.js"></script>
<script src="modules/ccintern/views/auftraege-detail-view.js"></script>
<script src="modules/ccintern/views/lager-view.js"></script>
<script src="modules/ccintern/views/mitarbeiter-view.js"></script>
<script src="modules/ccintern/views/mitarbeiter-app-view.js"></script>
<script src="modules/ccintern/views/produktion-view.js"></script>
<script src="modules/ccintern/views/rechnungen-view.js"></script>
<script src="modules/ccintern/views/urlaub-view.js"></script>
<!-- ❌ kunden-view.js   → NICHT einbinden — bereits fertig im Cockpit -->
<!-- ❌ kalender-view.js → NICHT einbinden — bereits fertig im Cockpit -->

<!-- 6. Module — KEIN type="module", müssen global sein! -->
<script src="modules/ccintern/module/auftraege/detail.js"></script><!-- ⚠️ Abnahmeprotokoll -->
<script src="modules/ccintern/module/auftraege/dateien.js"></script>
<script src="modules/ccintern/module/auftraege/checklisten.js"></script>
<script src="modules/ccintern/module/auftraege/kommunikation.js"></script>
<!-- ❌ auftraege/kalender.js → NICHT einbinden — Kalender bereits fertig im Cockpit -->
<script src="modules/ccintern/module/schnell-anfragen/index.js"></script>
<script src="modules/ccintern/module/angebote/index.js"></script>
<!-- ❌ kunden/index.js  → NICHT einbinden — Kunden bereits fertig im Cockpit -->
<script src="modules/ccintern/module/crm/index.js"></script>
<script src="modules/ccintern/module/checklisten/index.js"></script>
<script src="modules/ccintern/module/rechnungen/index.js"></script>
<script src="modules/ccintern/module/dashboard/index.js"></script>
<script src="modules/ccintern/module/mitarbeiter/index.js"></script>
<script src="modules/ccintern/module/produktion/index.js"></script>
<script src="modules/ccintern/module/materiallager/index.js"></script>
<script src="modules/ccintern/module/urlaub/index.js"></script>
<script src="modules/ccintern/module/mitarbeiter-app/index.js"></script>
<script src="modules/ccintern/module/benutzer/index.js"></script>

<!-- 7. Templates (immer nach allen Modulen) -->
<script src="modules/ccintern/cc-intern-templates.js"></script>

<!-- 8. Entry Point — IMMER ZULETZT -->
<script src="modules/ccintern/cc-intern-main.js"></script>
```

STOP → zeigen

---

## SCHRITT 6 — Cockpit Boot-Sequenz (IN DIESER REIHENFOLGE)

Wenn der CC Intern-Tab aktiviert wird, ruft Cockpit genau das auf:

```js
// 1. Cockpit-Daten in CC Intern laden
// usersResponse  = Antwort von GET /api/v1/users   → { users: [...] }
// firmenResponse = Antwort von GET /api/v1/firmen  → { firmen: [...] }
window.CCIntern.loadCockpitData(usersResponse, firmenResponse);

// 2. CC Intern starten — ohne Login, mit Cockpit-User
// currentUserId = ID des eingeloggten Cockpit-Nutzers
// containerEl   = DOM-Element wo CC Intern gerendert werden soll
window.CCIntern.cockpitBoot(currentUserId, containerEl);
```

Das war es. CC Intern rendert sich komplett selbst in `containerEl`.

STOP → zeigen

---

## SCHRITT 7 — Test-Checkliste

| Modul | Was prüfen |
|---|---|
| Dashboard | Auftrags-Übersicht, offene Angebote, Urlaub sichtbar |
| Schnell-Anfragen | Liste lädt, neue Anfrage öffnet Formular |
| Angebote | Liste lädt, neues Angebot kann erstellt werden |
| Aufträge | Liste lädt → Auftrag anklicken → Detail öffnet |
| Aufträge Detail | **⚠️ Abnahme & Dokumentation-Sektion sichtbar** (kommt von `detail.js`) |
| Aufträge Detail | Dateien-Tab mit Drag & Drop, Checklisten-Tab |
| Aufträge Detail | Chat/Kommunikation lädt (Filter: Alle / Nur Fragen / Offene Fragen sichtbar) |
| CRM | Aktivitäten-Liste sichtbar, kein eigener Kunden-Tab (Cockpit liefert Kunden) |
| Produktion | Workflow-Liste mit Status |
| Materiallager | Bestand-Liste, Nachbestellung möglich |
| Checklisten | Vorlagen-Liste, neue Vorlage anlegen |
| Mitarbeiter | Team-Liste mit Zeitkonto |
| Urlaub | Antrags-Liste, neuer Antrag möglich |
| Mitarbeiter-App | 📱 Mobil-Ansicht lädt korrekt |
| Rechnungen | Eingangs- & Ausgangsrechnungen sichtbar |
| ~~Kunden~~ | ✅ Bereits fertig im Cockpit — nicht testen |
| ~~Kalender~~ | ✅ Bereits fertig im Cockpit — nicht testen |

**Abnahme fehlt → Ursache:** `module/auftraege/detail.js` nicht geladen ODER als ES-Modul geladen.
Prüfen: `typeof renderAbnahmeBlock` in der Browser-Konsole — muss `"function"` sein!

STOP → Ergebnis zeigen. Nicht weitermachen.

---

## Rechte — CC Cockpit verwaltet alles

| Was | Wie |
|---|---|
| Eingeloggter User | via `CCIntern.cockpitBoot(currentUserId, ...)` |
| Kunden/Firmen | via `CCIntern.loadCockpitData(usersResp, firmenResp)` |
| Tab-Sichtbarkeit | `hasCCInternAccess` aus Cockpit PROJECT_ACCESS |
| Admin-Rechte | `role: 'super_admin'` → CC Intern Admin |
| Normale Rechte | `role: 'cc_intern'` → Standard-Zugriff |
| Datenspeicherung | CC Cockpit SQLite (Port 5371) via ApiAdapter |
| Kunden-Tab | HIDDEN — Cockpit liefert Kunden via loadCockpitData |

---

## Was NICHT anfassen

- `scripts/01_schema_migration.sql` → nur einmalig bei DB-Migration ausführen
- `scripts/02_import_kunden.js` → nur einmalig bei Daten-Migration
- `scripts/03_bootstrap_cockpit.js` → nur Referenz, cc-intern-main.js übernimmt das
- CC Intern hat kein eigenes Login — immer via `cockpitBoot()` starten
- `views/kunden-view.js` → ❌ NICHT einbinden — Kunden fertig im Cockpit
- `views/kalender-view.js` → ❌ NICHT einbinden — Kalender fertig im Cockpit
- `module/kunden/index.js` → ❌ NICHT einbinden — Kunden fertig im Cockpit
- `module/auftraege/kalender.js` → ❌ NICHT einbinden — Kalender fertig im Cockpit

---

## BACKEND — Was noch gebaut werden muss

Alle fehlenden Backend-Routen sind vollständig dokumentiert in:

> **`scripts/BACKEND_ROUTEN.md`** ← Exakte Spezifikation für Cockpit-Entwickler

Kurzübersicht der fehlenden Routen:

| Route | Modul |
|---|---|
| `GET/POST/PATCH /api/v1/ccintern/auftraege` | Aufträge |
| `GET/POST/PATCH /api/v1/ccintern/angebote` | Angebote |
| `GET/POST/PATCH /api/v1/ccintern/anfragen` | Anfragen/CRM |
| `GET/POST/PATCH /api/v1/ccintern/crm-aktivitaeten` | CRM Aktivitäten |
| `GET/POST/PATCH /api/v1/ccintern/urlaub` | Urlaub |
| `GET/POST/PATCH /api/v1/ccintern/mitarbeiter` | Mitarbeiter |
| `GET/POST/PATCH /api/v1/ccintern/anwesenheit` | Zeiterfassung |
| `GET/POST/PATCH /api/v1/ccintern/lager` | Materiallager |
| `GET/POST/PATCH /api/v1/ccintern/rechnungen` | Rechnungen |
| `GET/POST/PATCH /api/v1/ccintern/checklisten` | Checklisten |

**Frontend ist 100% bereit. Sobald Backend diese Routen liefert → CC Intern läuft vollständig.**
