# Backend-Roadmap CC Cockpit

Stand: 2026-04-28
Quelle: `docs/phase2-api-v1-inventory.md`, `backend/src/server.js`, `backend/src/routes/api-v1.js`

Reihenfolge-Prinzip: **Erst Migration + Fehlerformat + Projekt-Isolation, dann neue Module.**
Begründung: Wenn neue Module auf das alte Fehlerformat und die unsaubere Projekt-Isolation aufsetzen, müssen sie später nochmal angefasst werden. Andersrum landen sie direkt korrekt auf einer sauberen Plattform.

---

## Status (Roadmap vs. Backend)

**Roadmap:** ✔ vollständig — dieses Dokument beschreibt den kompletten Weg zu 100 %.

**Backend:** Die in dieser Roadmap beschriebenen **Phasen A und B** sind laut Tracker **abgeschlossen**; produktseitig können weitere Anforderungen dazukommen. Das „100 %-Backend“-Kriterium unten war: **A + Quality Gate + B1–B6** — erfüllt, sobald der Tracker und die Nachweise passen.

1. **Phase A komplett** (A1–A6 alle ✔)
2. **Quality Gate grün** (alle Integration-Tests, Envelope überall, Inventar aktuell, Status-Dateien gefüllt)
3. **Phase B komplett** (B1–B6 alle ✔) — *B6 Stand 2026-04-26: Refresh-Token + `/api/v1/ccintern/me` (siehe unten B6).*

### Fortschritts-Tracker

| Phase | Aufgabe | Status |
|-------|---------|--------|
| A1 | Middleware-Fehler → Envelope | ✔ erledigt |
| A2 | `x-project-id` konsequent durchsetzen | ✔ erledigt |
| A3 | Envelope-Migration offener Routen (1–7) | ✔ erledigt |
| A4 | Legacy-Pfade abschalten | ✔ erledigt |
| A5 | Audit-Querschnitt aktivieren | ✔ erledigt |
| A6 | Upload-Pfade vereinheitlichen | ✔ erledigt |
| — | **Quality Gate** | ✔ erledigt |
| B1 | Logs / Audit-View | ✔ erledigt |
| B2 | Dashboard-Aggregations-Endpoints | ✔ erledigt |
| B3 | Geräte | ✔ erledigt |
| B4 | Quartalsabrechnung | ✔ erledigt |
| B5 | CRM | ✔ erledigt |
| B6 | Mitarbeiter-App (inkl. Refresh-Token) | ✔ erledigt |

**Phase A: 6/6 ✔ · Quality Gate: ✔ · Phase B: 6/6 ✔ → Backend-Fortschritt: 13/13**

> **Abschlusscheck (2026-04-26):** Tracker A1–A6, Quality Gate und B1–B6 sind ✔; Quality-Gate-Integrationstests und ergänzende Skripte sind gelaufen (siehe `docs/STATUS_*.md`). Bewusst ausgenommen vom Envelope bleiben nur Routen **außerhalb** `/api/v1` (z. B. `POST /auth/login`) sowie Hilfs-/Legacy-Dateien wie `routes/auftraege.js` ohne Produktiv-Mount gemäß Roadmap A4 — nicht die Inline-Auftragslogik in `api-v1.js`.

---

## Phase A — Konsolidierung (zuerst, kein neues Feature)

### A1. Middleware-Fehler vereinheitlichen

Alle `requireAuth`, `requireModule`, `requireRight`, `requireApiProjectContext`, `requireSuperAdmin` etc. müssen `sendError({ code, message })` zurückgeben statt Legacy `{ error, message }`.

- Voraussetzung für alles weitere — ab hier ist das Antwortformat überall gleich.
- Betroffene Dateien: `backend/src/middleware/*.js`, `backend/src/auth/*.js`.
- Akzeptanzkriterium: Grep auf `res.status(...).json({ error:` liefert nur noch Treffer in `sendError`-Helpern.

### A2. `x-project-id` konsequent durchsetzen

Globale Whitelist definieren (Stammdaten ohne `x-project-id`):

- `/api/v1/auth/*`
- `/api/v1/users`, `/api/v1/firmen`
- `/api/v1/role-templates`
- `/api/v1/invites`
- `/api/v1/kalender` (global)
- `/api/v1/aufgaben` (firma-resolved)

Alle anderen Routen: 400 mit `code: PROJECT_CONTEXT_REQUIRED`, wenn Header fehlt.

- Tests `api-v1-project-isolation.integration.test.mjs` müssen grün bleiben und um die Whitelist erweitert werden.

### A3. Envelope-Migration der offenen Routen

In dieser Reihenfolge (risikoarm zuerst):

1. `/api/v1/kalender` (Inline-Router in `api-v1.js`) — **Fortschritt A3.1:** Handler auf `sendSuccess`/`sendError` umgestellt, Inventar + Stabilitätstests ergänzt (Stand 2026-04-26). Gesamtphase A3 weiterhin offen.
2. `/api/v1/auftraege` + `/api/v1/ccintern/auftraege` — **Fortschritt A3.2:** CC-Intern-Auftrags-Router (`createAuftraegeRouter`): Handler auf `sendSuccess`/`sendError`; Inventar + Stabilitätstests ergänzt (Stand 2026-04-26). Gesamtphase A3 weiterhin offen.
3. `/api/v1/fusa/auftraege` inkl. Freigabe-Flow (`/:id/freigeben`) — **Fortschritt A3.3:** Inline-Routen (`form-meta`, `kalkulation`, `verfuegbare-fahrzeuge`, GET Liste, `POST …/freigeben`) nutzen durchgehend `sendSuccess`/`sendError`; Inventar + Tests ergänzt (Stand 2026-04-26). Gesamtphase A3 weiterhin offen.
4. `/api/v1/fusa/fahrzeuge` + Legacy `/fahrzeuge` — **Fortschritt A3.4:** GET Liste unter `/api/v1/fusa/fahrzeuge` bereits Envelope; Legacy-Router `routes/fahrzeuge.js` (Mount `/fahrzeuge`) auf `sendSuccess`/`sendError` umgestellt; Inventar + Stabilität/Isolation ergänzt (Stand 2026-04-26). Gesamtphase A3 weiterhin offen.
5. `/api/v1/messeflow/*` — **Fortschritt A3.5:** Inline-MesseFlow-Routen in `api-v1.js` auf `sendSuccess`/`sendError`; Prüfserver-Proxy-Fehlerpfade in `messeflow-pruef-proxy.js` auf `sendError`; Inventar + Stabilität (Stand 2026-04-26). Gesamtphase A3 weiterhin offen.
6. `/api/v1/projects` (`backend/src/routes/projects.js`) — **Fortschritt A3.6:** `createProjectsRouter` unter `/api/v1/projects` gemountet; Handler in `projects.js`, `project-access.js`, `project-invites.js` auf `sendSuccess`/`sendError`; Whitelist `API_V1_PROJECT_CONTEXT_OPTIONAL_PREFIXES` um `/api/v1/projects` ergänzt; Inventar + Stabilität/Isolation (Stand 2026-04-26). Gesamtphase A3 weiterhin offen.
7. `/api/v1/users`, `/api/v1/firmen`, `/api/v1/kunden` — **Fortschritt A3.7:** Inline-Handler in `api-v1.js` waren bereits durchgehend Envelope; `createKundenRouter()` nutzt nun `sendSuccess` statt manuellem `res.json`; Legacy `routes/users.js` (Mount `/users`) auf `sendSuccess`/`sendError`; Inventar + Stabilität/Kernkonsistenz (Stand 2026-04-26). **Gesamtphase A3 erledigt.**

Pro Route: Handler auf `sendSuccess` / `sendError`, Inventar-Tabelle in `phase2-api-v1-inventory.md` aktualisieren, Stabilitätstest erweitern.

### A4. Legacy-Pfade abschalten

**Stand 2026-04-26:** In `server.js` keine Root-Mounts mehr für `/users`, `/projects`, `/kunden`, `/angebote`, `/auftraege`, `/fahrzeuge`, `/schaeden`. Stattdessen `mountLegacyApiRemoved` (`lib/legacy-api-removed.js`): **HTTP 410** + `error.code: LEGACY_REMOVED`, Message „Bitte /api/v1/... verwenden.“ — kein Redirect, kein paralleler Betrieb.

Hinweis: Doppel-Mounts **unter** `/api/v1` (z. B. `/kalender` und `/stammdaten/kalender`) sind unverändert API-v1-intern; Root `/stammdaten/kalender` hatte das Produktions-Backend nicht gebunden.

### A5. Audit-Querschnitt vorbereiten

**Stand 2026-04-26:** ✔ umgesetzt.

- Schema: Tabelle `audit_log` (id, ts, user_id, modul, action, resource_type, resource_id, project_id, payload_json) — SQLite (`schema.sql`, Migration Phase 50) + MySQL (`ensureMysqlAuditLogTable` / `schema-mysql8.sql`).
- Helper: `logAudit(store, { user, modul, action, resource_type, resource_id, project_id, payload })` in `backend/src/lib/audit-log.js` — Fehler beim Schreiben nur `console.warn`, Hauptaktion unberührt; Payload sanitisiert (keine Passwörter/Tokens), Größe begrenzt.
- Store: `insertAuditLog` / `listAuditLogEntries` (SQLite + MySQL).
- Instrumentierung (Stichprobe je Modul-Gruppe): API-v1 (`users`, `firmen`, `kunden`, FUSA Freigabe, MesseFlow Workspace/MF-Projekt, CC-Intern-Aufträge), `projects.js`, `fusa-dokumente.js`, `fahrzeuge.js`, Legacy `users.js` (Zugriff/Status/Reset).
- Tests: `backend/src/test/audit-log.integration.test.mjs`.

### A6. Datei-Upload-Pfade vereinheitlichen

**Stand 2026-04-26:** ✔ umgesetzt.

- Schema: `uploads/<modul>/<project_id>/<resource>/<dateiname>` (Wurzel `data/uploads` oder `UPLOADS_ROOT`).
- Zentral: `backend/src/lib/upload-storage.js` — `writeUploadBufferSync`, `resolveUploadAbsolute`, `createMulterMemory`, MesseFlow-Proxy-Uploads (`messeflowProxyUploadPdf` / `messeflowProxyUploadExport`), Caldera (`messeflowCalderaMulter`).
- Umgestellt: `routes/schaeden.js` (Schaden-Fotos, Memory-Multer + Ablage unter `schaeden-fotos/<project_id>/schaden/…`), `routes/messeflow-pruef-proxy.js`, `routes/api-v1.js` (Caldera-Upload unter `messeflow-waende/<x-project-id>/wand/…` statt `data/messeflow-auftraege/...`).
- FUSA-Dokumente: aktuell **kein** serverseitiger Multer-Upload (nur Metadaten/URL im Body); Schema gilt bei künftiger Anbindung.

---

## Quality Gate zwischen Phase A und Phase B

Bevor Phase B startet, müssen folgende Bedingungen erfüllt sein:

- Alle Integration-Tests grün:
  - `api-routes-stability.integration.test.mjs`
  - `api-v1-project-isolation.integration.test.mjs`
  - `api-v1-core-consistency.integration.test.mjs`
  - `api-fusa-ccintern-bridge.integration.test.mjs`
- Kein einziger Handler antwortet ohne Envelope. Grep auf `res.json({ error:` darf nur in `sendError`-Helpern auftauchen.
- `phase2-api-v1-inventory.md`: Spalte „Envelope" überall ✔.
- Status-Dateien `STATUS_COCKPIT.md`, `STATUS_CCINTERN.md`, `STATUS_FUSA.md` mit dem Phase-A-Abschluss-Stand gefüllt.
- Audit-Helper aktiv in allen Schreib-Handlern (Stichprobe: jede Modul-Gruppe mindestens ein Audit-Eintrag pro Schreibvorgang in der DB).

**Nachweis Stand 2026-04-26:** Alle genannten Integrationstests sowie `test:audit-log` und `test:upload-storage` grün; Projekt-Kontext-Code `PROJECT_CONTEXT_REQUIRED` (kein veraltetes `PROJECT_ID_REQUIRED`); Uploads zentral `backend/src/lib/upload-storage.js`; Audit `audit_log` + `logAudit`. Status-Dateien unter `docs/` aktualisiert.

---

## Phase B — Neue Module (erst nach A komplett grün)

### B1. Logs / Audit-View (Cockpit) ✔

- ✔ GET `/api/v1/logs` mit Filtern: `modul`, `user_id`, `action`, `resource_type`, `from`, `to`, Pagination (`page`, `limit`; Default 50, max. 200).
- ✔ Liest aus `audit_log` (in A5 angelegt); Implementierung `backend/src/routes/logs.js` + `listAuditLogFiltered` im Store.
- ✔ Rechte: `SUPER_ADMIN` oder Cockpit-Bereich `logs` mit `sehen` (sonst 403 `FORBIDDEN`). Nachweis: `npm run test:api-stability` (enthält `api-v1-logs.integration.test.mjs`), `npm run test:api-core-consistency`.

### B2. Dashboard-Aggregations-Endpoints ✔

Drei Endpoints, jeweils read-only:

- ✔ `GET /api/v1/cockpit/dashboard` → Offene Aufträge (COUNT), aktive Projekte (COUNT `projects`), Termine heute (`kalender_termine`), Benutzer gesamt/aktiv (`users`).
- ✔ `GET /api/v1/fusa/dashboard` → FUSA-Aufträge aktiv (COUNT `auftraege` mit `fusa_kunde_id`), verfügbare Fahrzeuge (COUNT, optional `?project_id=`), offene Schäden, Quartalsvorschau (`SUM(netto)` aus `fusa_rechnungen` je aktuellem `YYYY-Qn`).
- ✔ `GET /api/v1/ccintern/dashboard` → offene CC-Intern-Angebote, aktive CC-Intern-Aufträge, offene Schnell-Anfragen (`ccintern_anfragen`).

Implementierung: `routes/cockpit/dashboard.js`, `routes/fusa/dashboard.js`, `routes/ccintern/dashboard.js`; Aggregation im Store (`getDashboardCockpitStats` / `getDashboardFusaStats` / `getDashboardCcinternStats`); In-Memory-Cache 30 s (`lib/dashboard-stats-cache.js`); Rechte: Modul `cockpit` / `fusa` / `ccintern` (`middleware/require-dashboard-module.js`). Nachweis: `npm run test:api-stability` (enthält `api-v1-dashboard.integration.test.mjs`), `npm run test:api-core-consistency`.

Reduziert die N+1-Aufrufe im Frontend. Antworten gecacht (kurze TTL, z. B. 30 s).

### B3. Geräte (Cockpit) ✔

- ✔ Schema: `geraete` (`firma_id`, optionales `project_id`, `typ`, optionale eindeutige `seriennummer`, `zugewiesen_an_user_id`, `status`, `notiz`, Zeitstempel); Migration SQLite Phase 51 + MySQL `ensureMysqlGeraeteTable`; DDL auch in `schema.sql` / `schema-mysql8.sql`.
- ✔ API: `GET/POST/PATCH/DELETE /api/v1/geraete` (`routes/geraete.js`), Mandant über `resolveFirmaIdForRequest` (`firma_id` / `company_id`).
- ✔ Rechte: Cockpit-Bereich `geraete` — `sehen` / `erstellen` / `bearbeiten` / `loeschen`; bei Verstoß **403** `FORBIDDEN` „Kein Zugriff“. Nachweis: `npm run test:api-stability` (enthält `api-v1-geraete.integration.test.mjs`), `npm run test:api-core-consistency`.

### B4. Quartalsabrechnung (FUSA) ✔

- ✔ **Variante 1 umgesetzt:** Aggregation nur aus `fusa_rechnungen` (optional Join `auftraege` für `project_id`); kein eigenes Modell.
- ✔ API (read-only): `GET /api/v1/fusa/quartale?jahr=...&project_id=...` — `routes/fusa/quartale.js`, Store `aggregateFusaQuartale`; Rechte `requireDashboardModule('fusa')`; Whitelist wie Dashboard (`x-project-id` optional).
- Nachweis: `npm run test:api-stability` (enthält `api-v1-fusa-quartale.integration.test.mjs`), `npm run test:api-core-consistency`.
- Optional später: `POST …/abschliessen` / eigenes Modell nur wenn Snapshots/Abschlussprozesse explizit gefordert sind.

### B5. CRM (CC Intern) ✔

- ✔ Tabellen: `crm_pipeline_stages`, `crm_aktivitaeten`, `crm_wiedervorlage` (Migration Phase 52 SQLite + MySQL ensure).
- ✔ API: `/api/v1/crm/pipeline`, `/aktivitaeten`, `/wiedervorlage` — `routes/crm/index.js`; Rechte CC-Intern Bereich `crm` (`sehen`/`erstellen`/`bearbeiten`/`loeschen`), sonst **403** `FORBIDDEN` „Kein Zugriff“.
- Nachweis: `npm run test:api-stability` (enthält `api-v1-crm.integration.test.mjs`), `npm run test:api-core-consistency`.

### B6. Mitarbeiter-App (CC Intern) ✔

- ✔ **Refresh:** Tabelle `refresh_tokens` (Hash, Rotation bei Refresh); **`POST /api/v1/auth/refresh`** — neu `access_token` + `refresh_token`; ungültig/abgelaufen widerrufen → **401** `INVALID_REFRESH_TOKEN`. Login (`POST /auth/login`) stellt Access (kurz, Default **15 min**, `JWT_ACCESS_TTL_SEC`) + Refresh (lang, Default **30 Tage**, `JWT_REFRESH_TTL_SEC`) aus.
- ✔ **Mobile API** unter **`/api/v1/ccintern/me`**: `GET …/auftraege` (Produktion nur `verantwortlich` = User), `GET …/aufgaben` (nur `zugewiesen_an` = User), `POST …/zeiten` (`ccintern_mitarbeiter_zeiten`), `POST …/foto` (Multer + `upload-storage.js`, Modul **`ccintern-fotos`**, Pfad `uploads/ccintern-fotos/<project_id>/<ccintern_auftrag_id>/…`; **`x-project-id`** + `project_access` Pflicht).
- ✔ **Rechte:** CC-Intern **`mitarbeiterapp`** — `sehen` (Listen) / `erstellen` (Zeiten, Foto); ohne Zugriff **403** `FORBIDDEN` „Kein Zugriff“. Zeit/Foto nur wenn Nutzer zu dem CC-Auftrag über **Produktion** (`verantwortlich`) oder **Aufgabe** (`zugewiesen_an`) passt.
- ✔ **Projektkontext:** Präfix `/api/v1/ccintern/me` optional ohne `x-project-id` für GET-Listen; Foto-Route erzwingt Kontext via `requireApiProjectContext`.
- Nachweis: `npm run test:api-stability` (enthält `api-v1-b6-refresh-mobile.integration.test.mjs`), `npm run test:api-core-consistency`.

---

## Reihenfolge auf einen Blick

```
Phase A (Konsolidierung)
  A1 Middleware-Fehler → Envelope
  A2 x-project-id konsequent
  A3 Envelope-Migration offener Routen (in 7 Schritten)
  A4 Legacy-Pfade abschalten
  A5 Audit-Querschnitt aktivieren
  A6 Upload-Pfade vereinheitlichen

  ↓ Quality Gate ↓

Phase B (Neue Module)
  B1 Logs/Audit-View
  B2 Dashboard-Aggregations
  B3 Geräte
  B4 Quartalsabrechnung
  B5 CRM
  B6 Mitarbeiter-App (inkl. Refresh-Token)
```

---

## Offene Entscheidungen

- Quartalsabrechnung: Aggregations-View vs. eigenes Modell (Phase B4 — Variante 1 umgesetzt).
- CRM-Pipeline-Stages: hart kodiert vs. konfigurierbar pro Firma (Phase B5).
- Refresh-Token: nur für Mitarbeiter-App oder global für alle Clients (Phase B6).
- Audit-Log-Retention: 90 Tage / 1 Jahr / unbegrenzt (Phase A5 oder B1).

---

## Pflege dieses Dokuments

Nach jeder abgeschlossenen Teilaufgabe:

1. Diesen Punkt in der Roadmap als ✔ markieren.
2. `phase2-api-v1-inventory.md` aktualisieren (falls Envelope-Migration).
3. Status-Datei des betroffenen Bereichs ergänzen.
