# Phase 2 — Bestandsaufnahme `/api/v1` (Response & Projektkontext)

Stand: Phase A + Phase B nach Roadmap abgeschlossen (Abschlusscheck 2026-04-26). Quelle: `backend/src/routes/api-v1.js` + eingebundene Sub-Router unter demselben Mount.

**Hinweis Abschlusscheck:** Die produktive Auftrags-API liegt als **Inline-`createAuftraegeRouter` in `api-v1.js`**; die ältere Datei `backend/src/routes/auftraege.js` mit `res.status(...).json({ error, message })` wird nicht unter `/api/v1` gemountet (nur Sonderfälle/Test — siehe `STATUS_FUSA.md`).

**Legende**

- **Envelope voll**: Erfolg `{ success: true, data }`, Fehler `{ success: false, error: { code, message } }` (`sendSuccess` / `sendError`).
- **Envelope teilweise**: z. B. `{ success: true, data }`, Fehler aber `error` als String oder `{ error, message }` (Altschema).
- **Legacy**: typisch `{ users }`, `{ error, message }` ohne `success`.
- **Projektkontext**: „ja“, wenn Pfad/Query explizit `project_id` / `x-project-id` oder projektgebundene Datenpflicht; sonst „nein“ (global/Stammdaten).
- **Risiko Migration**: geschätzte Bruchgefahr für bestehende Clients bei Umstellung auf vollständiges Envelope.
- **Frontend**: Treffer im Repo unter `frontend/` auf den konkreten Pfad (nur Indikator, keine Garantie für externe Clients).
- **Handler vs. Middleware**: **Route-Handler** und **zentrale Middleware** (`requireAuth`, `requireModule`, `requireRight`, `requireApiProjectContext`, `attachAccessProfile`, …) liefern bei Ablehnung dasselbe Fehler-Envelope `{ success: false, error: { code, message } }` (`sendError`). Einzelne **Legacy-Router** außerhalb `/api/v1` können noch `{ error, message }` nutzen (siehe Roadmap A3/A4).

### Phase A6 — Upload-Pfade (`uploads/…`)

- **Schema:** `uploads/<modul>/<project_id>/<resource>/<dateiname>` — Projekt-ID aus `x-project-id` (API v1, nicht Whitelist) bzw. aus Datensatz (Legacy-Schaden-Foto: `project_id` der Schaden-Zeile).
- **Implementierung:** `backend/src/lib/upload-storage.js` — sichere Segmente, UUID-Präfix auf Dateinamen, `resolveUploadAbsolute` gegen Pfad-Escape.
- **Multer:** überwiegend `memoryStorage` + explizites Schreiben; MesseFlow Caldera und Schaden-Fotos nutzen die zentrale Ablage; Prüfserver-Proxy nutzt zentrale Limits/Filter.
- **Tests:** `backend/src/test/upload-storage.unit.test.mjs`.

### Phase A5 — Audit (`audit_log`)

- **Schema:** `audit_log` (id, ts, user_id, modul, action, resource_type, resource_id, project_id, payload_json); Migration SQLite Phase 50 + MySQL-Ensure; siehe `schema.sql` / `schema-mysql8.sql`.
- **Helper:** `backend/src/lib/audit-log.js` — `logAudit(store, { … })`; Secrets werden aus dem Payload gestrichen; Insert-Fehler blockieren die Hauptaktion nicht.
- **Instrumentierung:** Stichprobe je Bereich — `/api/v1/users`, `/firmen`, `/kunden`, `/fusa/auftraege/:id/freigeben`, `/messeflow/workspace`, `/messeflow/projekte` (POST), `/auftraege` + `/ccintern/auftraege` (POST/PUT/DELETE), Sub-Router `projects.js`, `fusa/dokumente`, `fahrzeuge.js`; zusätzlich Legacy-Mount `routes/users.js` (PATCH Zugriff, Lock, Reset-Passwort ohne Klartext im Audit).
- **Lesepfad API (Phase B1):** GET `/api/v1/logs` — Sub-Router `backend/src/routes/logs.js`, Quelle `audit_log`, Rechte: `SUPER_ADMIN` oder Cockpit-Bereich `logs` mit `sehen`. Query: `modul`, `user_id`, `action`, `resource_type`, `from`, `to`, `page`, `limit` (Default 50, max. 200); Antwort `data.items` + `data.page` + `data.limit` + `data.total`.
- **Tests:** `backend/src/test/audit-log.integration.test.mjs`; Lesepfad: `backend/src/test/api-v1-logs.integration.test.mjs` (in `npm run test:api-stability` eingebunden).

### Phase B2 — Dashboard-Aggregation (`stats`, read-only)

- **Endpoints:** `GET /api/v1/cockpit/dashboard`, `GET /api/v1/fusa/dashboard`, `GET /api/v1/ccintern/dashboard` — jeweils `sendSuccess` → `data.stats` (Zahlen-Aggregate, kein Rohdatensatz-Listing).
- **Implementierung:** `routes/cockpit/dashboard.js`, `routes/fusa/dashboard.js`, `routes/ccintern/dashboard.js`; Store `getDashboardCockpitStats` / `getDashboardFusaStats` / `getDashboardCcinternStats` (SQLite + MySQL); Cache `lib/dashboard-stats-cache.js` (30 s); Rechte `middleware/require-dashboard-module.js` — Modulzugriff `cockpit` / `fusa` / `ccintern`, sonst **403** `FORBIDDEN` „Kein Zugriff“.
- **FUSA-Query:** optional `?project_id=` filtert die Kennzahl **fahrzeuge_verfuegbar** nach Projekt.
- **Tests:** `backend/src/test/api-v1-dashboard.integration.test.mjs` (in `npm run test:api-stability` eingebunden).

### Phase B3 — Geräte (Cockpit, CRUD)

- **Schema:** `geraete` (`firma_id`, optionales `project_id`, `typ`, optionale projektweit eindeutige `seriennummer`, `zugewiesen_an_user_id`, `status`, `notiz`, `created_at`, `updated_at`); SQLite Migration Phase 51 + MySQL `ensureMysqlGeraeteTable`; DDL `schema.sql` / `schema-mysql8.sql`.
- **API:** `GET/POST/PATCH/DELETE /api/v1/geraete` — `routes/geraete.js`, Mandant über `resolveFirmaIdForRequest`; Liste mit `pagination`; GET `/:id` → `data.item`; POST **201** → `data.item`; PATCH → `data.item`; DELETE → `data.deleted` + `data.id`.
- **Status:** `aktiv`, `defekt`, `in_wartung` (JSON auch lesbar z. B. „In Wartung“ → intern `in_wartung`).
- **Rechte:** Cockpit-Bereich `geraete` — `sehen` / `erstellen` / `bearbeiten` / `loeschen`; ohne Pass **403** `FORBIDDEN` „Kein Zugriff“ (Router `requireCockpitGeraet`).
- **Tests:** `backend/src/test/api-v1-geraete.integration.test.mjs` (in `npm run test:api-stability` eingebunden).

### Phase B4 — FUSA Quartalsaggregation (`quartale`, read-only)

- **Endpoint:** `GET /api/v1/fusa/quartale` — `sendSuccess` → `data.jahr`, `data.quartale` (immer vier Einträge **Q1–Q4** mit `auftraege`, `umsatz`, `durchschnitt`).
- **Aggregation:** SQL `GROUP BY` Quartal auf Basis `fusa_rechnungen`; Umsatz `SUM(COALESCE(brutto, netto, 0))`; Aufträge `COUNT(DISTINCT auftrag_id)` (nur wenn `auftrag_id` gesetzt); Datumsbasis `COALESCE(rechnungsdatum, von, created_at)` inkl. Kalenderjahr-Filter; optional `?project_id=` über Join auf `auftraege.project_id`.
- **Implementierung:** `routes/fusa/quartale.js`, Store `aggregateFusaQuartale` (SQLite + MySQL); Rechte wie Dashboard — `requireDashboardModule('fusa')`, sonst **403** `FORBIDDEN` „Kein Zugriff“.
- **Projektkontext:** optional `x-project-id` (Whitelist-Prefix wie Dashboard).
- **Tests:** `backend/src/test/api-v1-fusa-quartale.integration.test.mjs` (in `npm run test:api-stability` eingebunden).

### Phase B5 — CRM (CC Intern)

- **Schema:** `crm_pipeline_stages`, `crm_aktivitaeten`, `crm_wiedervorlage` — Mandant `firma_id`; `kunde_id` → `firmen(id)`; SQLite Migration Phase 52 + MySQL `ensureMysqlCrmTables`; DDL `schema.sql` / `schema-mysql8.sql`.
- **API:** Mount `/api/v1/crm` — `routes/crm/index.js`: Pipeline `GET/POST/PATCH/DELETE …/pipeline`, Aktivitäten `GET/POST …/aktivitaeten` (Query `kunde_id`), Wiedervorlage `GET/POST/PATCH …/wiedervorlage`; Mandant über `resolveFirmaIdForRequest`; Erfolg typisch `data.items` / `data.item` (POST **201**); **403** `FORBIDDEN` „Kein Zugriff“ ohne CC-Intern-Bereich `crm` (`sehen`/`erstellen`/`bearbeiten`/`loeschen`).
- **Validierung:** Aktivitäten-Typ `notiz`|`anruf`|`email`|`termin`; Wiedervorlage-Status `offen`|`erledigt`; `kunde_id` Pflicht bei Aktivitäten & Wiedervorlage (Existenz `firmen`).
- **Projektkontext:** `x-project-id` Pflicht (keine Whitelist wie Stammdaten-Geräte).
- **Tests:** `backend/src/test/api-v1-crm.integration.test.mjs` (in `npm run test:api-stability` eingebunden).

### Phase B6 — Refresh-Token + Mitarbeiter-App (CC Intern)

- **Schema:** `refresh_tokens` (Hash `token_hash`, `user_id`, optional `device_id`, `expires_at`, `revoked_at`); `ccintern_mitarbeiter_zeiten` für gebuchte Minuten — SQLite Migration Phase 53 + MySQL-Ensure; DDL `schema.sql` / `schema-mysql8.sql`.
- **Auth:** `POST /api/v1/auth/refresh` — Body `{ refresh_token }`; Erfolg **200** `sendSuccess` mit `access_token`, `refresh_token`, `expires_in`, `refresh_expires_in`; Fehler **401** `INVALID_REFRESH_TOKEN`. Implementierung `lib/auth-refresh-handler.js`; Rotation (alter Refresh ungültig nach Nutzung). Login `POST /auth/login` liefert ebenfalls `refresh_token` (nicht `/api/v1`-Envelope).
- **Mobile:** Mount `/api/v1/ccintern/me` — `routes/ccintern/mobile.js`: `GET /auftraege`, `GET /aufgaben`, `POST /zeiten`, `POST /foto`. Nur Mandanten-Daten CC Intern; Filter strikt auf eingeloggten User (Produktion / Aufgaben). Rechte `ccintern` → `mitarbeiterapp` (`sehen` / `erstellen`).
- **Upload:** `POST /foto` — `requireApiProjectContext`, Speicher `upload-storage.js`, Modulsegment `ccintern-fotos`, Resource = `ccintern_auftrag_id`.
- **Projektkontext:** Whitelist-Prefix `/api/v1/ccintern/me` (Listen ohne Header möglich); Foto weiterhin strenges Projekt-Gate.
- **Tests:** `backend/src/test/api-v1-b6-refresh-mobile.integration.test.mjs` (in `npm run test:api-stability` eingebunden).

### Phase A2 — Globaler Projekt-Kontext (`x-project-id`)

- **Middleware:** `backend/src/middleware/api-v1-project-context.js` — `requireApiV1ProjectHeaderUnlessWhitelisted()` wird in `createApiV1Router` direkt nach Auth/Profil für **alle** `/api/v1`-Anfragen ausgeführt.
- **Whitelist** (Header nicht Pflicht): Export `API_V1_PROJECT_CONTEXT_OPTIONAL_PREFIXES` plus jedes `/api/v1/auth/*` (u. a. `/api/v1/projects` für Stammdaten-Projektliste ohne Kontext-Header; Phase B1: `/api/v1/logs`; Phase B2: `/api/v1/cockpit/dashboard`, `/api/v1/fusa/dashboard`, `/api/v1/ccintern/dashboard`; Phase B4: `/api/v1/fusa/quartale`; Phase B6: `/api/v1/ccintern/me`).
- **Alle anderen `/api/v1/*`-Routen:** ohne nicht-leeren Header `x-project-id` → HTTP **400**, `error.code`: **`PROJECT_CONTEXT_REQUIRED`**, `error.message`: „Projekt-Kontext erforderlich.“ (Konstante `PROJECT_CONTEXT_REQUIRED_MESSAGE`).
- **Strenges Projekt-Gate** (`requireApiProjectContext`): bleibt nachgelagert — prüft Existenz des Projekts und `project_access` (`PROJECT_FORBIDDEN` / `NOT_FOUND`).

---

## Bereits Envelope voll (`sendSuccess` / `sendError`)

Gilt für **Antworten aus dem Route-Handler** (siehe Legende: Middleware kann weiter Legacy liefern).

| Pfad | Methode | Aktuelles Format | sendSuccess? | Projekt? | Risiko | Frontend |
|------|---------|------------------|---------------|----------|--------|----------|
| `/api/v1/schaeden` | GET, GET/:id, POST, PUT/:id, DELETE/:id | Envelope | ja | ja (`requireApiProjectContext`) | mittel (neu) | nein (neu) |
| `/api/v1/auth/my-rights` | GET | Envelope `data: { user_id, global_role, modules, rights }` | ja | nein | **niedrig** | **nein** (App nutzt `/auth/my-rights`, siehe `cc-my-rights.js`) |
| `/api/v1/role-templates` | GET, POST, DELETE `/:id` | Envelope im Handler: GET → `data.templates`; POST (201) → `data.template`; DELETE (200) → `data.deleted` (boolean) und `data.id`. **Middleware** (`rollenSehen` / `rollenBearbeiten`): bei Ablehnung vor dem Handler weiter Legacy `{ error, message }`. | ja (Handler) | nein | erledigt | ja (u. a. `data.templates`) |
| `/api/v1/invites` | GET, POST, POST `/:id/revoke` | Envelope im Handler: GET → `data.invites`; POST → `data.invite` (201); Revoke → `data.ok` | ja (Handler) | nein | erledigt | `cockpit-einladungen-view.js` liest **`data.invites`** (GET) |
| `/api/v1/logs` | GET `/` | **Erfolg:** `sendSuccess` → `data.items` (Audit-Zeilen aus `audit_log`: `ts`, `user_id`, `modul`, `action`, `resource_type`, `resource_id`, `project_id`, `payload_json`) + `data.page`, `data.limit`, `data.total`. Query optional: `modul`, `user_id`, `action`, `resource_type`, `from`, `to`, `page`, `limit`. **403** ohne Superadmin / ohne Cockpit `logs`/`sehen`. | ja (Handler) | nein (Whitelist) | niedrig | nein |
| `/api/v1/cockpit/dashboard` | GET `/` | **Erfolg:** `sendSuccess` → `data.stats` mit `auftraege_offen`, `projekte_aktiv`, `termine_heute`, `benutzer_gesamt`, `benutzer_aktiv`. **403** ohne Modul `cockpit`. | ja (Handler) | nein (Whitelist) | niedrig | nein |
| `/api/v1/fusa/dashboard` | GET `/` | **Erfolg:** `sendSuccess` → `data.stats` mit `fusa_auftraege_aktiv`, `fahrzeuge_verfuegbar`, `schaeden_offen`, `quartalsvorschau_summe_netto`, `quartal`; optional Query `project_id` (Filter Fahrzeuge). **403** ohne Modul `fusa`. | ja (Handler) | nein (Whitelist) | niedrig | nein |
| `/api/v1/fusa/quartale` | GET `/` | **Erfolg:** `sendSuccess` → `data.jahr`, `data.quartale` (Q1–Q4: `auftraege`, `umsatz`, `durchschnitt`); Query optional `jahr`, `project_id`. Aggregation nur aus `fusa_rechnungen`. **403** ohne Modul `fusa`. | ja (Handler) | nein (Whitelist) | niedrig | nein |
| `/api/v1/ccintern/dashboard` | GET `/` | **Erfolg:** `sendSuccess` → `data.stats` mit `ccintern_angebote_offen`, `ccintern_auftraege_aktiv`, `ccintern_anfragen_offen`. **403** ohne Modul `ccintern`. | ja (Handler) | nein (Whitelist) | niedrig | nein |
| `/api/v1/geraete` | GET, POST, GET `/:id`, PATCH `/:id`, DELETE `/:id` | **Erfolg:** Liste `data.items` + `data.pagination`; Einzelobjekt `data.item`; POST 201; DELETE `data.deleted`/`data.id`. **409** bei doppelter `seriennummer`. **403** ohne Cockpit `geraete` (Rolle). **Handler:** `sendSuccess`/`sendError`. | ja (Handler) | ja (`x-project-id` Pflicht; `firma_id` Resolver) | mittel | nein |
| `/api/v1/crm/pipeline` | GET, POST, PATCH `/:id`, DELETE `/:id` | **Erfolg:** Liste `data.items`; POST 201 `data.item`; PATCH `data.item`; DELETE `data.deleted` + `data.id`. **403** ohne CC-Intern `crm` (Router `requireCcinternCrm`). | ja (Handler) | ja (`x-project-id`; `firma_id` Resolver) | niedrig | nein |
| `/api/v1/crm/aktivitaeten` | GET, POST | **Erfolg:** `data.items`; POST 201 `data.item`; Query `kunde_id`. **403** ohne `crm`/`sehen` bzw. `erstellen`. | ja (Handler) | ja | niedrig | nein |
| `/api/v1/crm/wiedervorlage` | GET, POST, PATCH `/:id` | **Erfolg:** `data.items`; POST 201 `data.item`; PATCH `data.item`; Query optional `kunde_id`. **403** ohne passende CRM-Rechte. | ja (Handler) | ja | niedrig | nein |
| `/api/v1/produktion` | GET, POST, GET `/:id`, PATCH `/:id`, DELETE `/:id` | **Erfolg:** `sendSuccess` → `{ success: true, data: … }` (GET Liste: `data.items` + `data.pagination`; POST 201 / GET+PATCH Einzelobjekt: `data` = Produktionsauftrag; DELETE: `data.deleted` + `data.id`). **Handler-Fehler:** `sendError` → `{ success: false, error: { code, message } }`. **Middleware** (`prodSehen` / `prodBearbeiten`): ggf. weiter Legacy `{ error, message }`. | ja (Handler) | nein (`firma_id` über Resolver) | erledigt | kein Treffer im `frontend/` |
| `/api/v1/checklisten` | GET, POST, GET/PUT/DELETE `/:id`, `PUT`/`DELETE` `/eintraege/:eintragId`, POST `/:id/eintraege` | **Erfolg:** `sendSuccess` → `{ success: true, data: … }` (GET Liste: `data.items` + `data.pagination`; sonst Checkliste oder Eintrag; DELETE Checkliste/Eintrag: `data.ok`). **Handler-Fehler:** `sendError` mit `code`/`message`. **Middleware** (`clSehen` / `clErstellen` / `clBearbeiten`): ggf. Legacy. | ja (Handler) | nein (`firma_id` über Resolver) | erledigt | kein Treffer im `frontend/` |
| `/api/v1/mitarbeiter` | GET, GET `/:id`, POST, PUT `/:id`, DELETE `/:id` | **Erfolg:** `sendSuccess` → `{ success: true, data: … }` (GET Liste: `data.items` + `data.pagination`; sonst Mitarbeiter-Objekt; DELETE: `data.ok`). **Handler-Fehler:** `sendError` mit `code`/`message` (u. a. `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`). **Middleware** (`mitSehen` / `mitErstellen` / `mitBearbeiten`): ggf. Legacy. | ja (Handler) | nein (`firma_id` über Resolver) | erledigt | kein Treffer im `frontend/` |
| `/api/v1/fusa/dokumente` | GET `/`, POST `/`, GET `/:id`, DELETE `/:id` | **Erfolg:** `sendSuccess` → `{ success: true, data: … }` (GET Liste: `data.items` + `data.pagination`; POST 201 / GET Einzelobjekt: Dokument-Mapping; DELETE: `data.ok`). **Handler-Fehler:** `sendError` → `{ success: false, error: { code, message } }` (u. a. `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`). **Middleware** (`docSehen` / `docHochladen` / `docLoeschen`): ggf. weiter Legacy `{ error, message }`. | ja (Handler) | ja (`project_id` / `auftrag_id` / `fahrzeug_id` in Query bzw. Body) | erledigt | ja (Stabilitätstest) |
| `/api/v1/fusa/angebote` | GET `/`, POST `/`, GET `/:id`, PATCH `/:id`, DELETE `/:id` | **Erfolg:** `sendSuccess` → `{ success: true, data: … }` (GET Liste: `data.items` + `data.pagination`; POST 201 / GET/PATCH Einzelobjekt: Angebot; DELETE: `data.ok`). **Handler-Fehler:** `sendError` mit `code`/`message`. **Middleware** (`angSehen` / `angErstellen` / `angBearbeiten`): ggf. Legacy. | ja (Handler) | ja (Query `project_id` / `fusa_kunde_id` / `status`) | erledigt | ja (Stabilitätstest) |

**Client-Hinweis:** `apiFetch` in `frontend/core/auth/cc-auth-session.js` wertet bei HTTP-Fehlern auch **`error.message`** aus dem Envelope aus (`success: false`, verschachtelt unter `error`).

---

## `api-v1.js` — Inline-Routen (Auszug, chronologisch in Datei)

| Pfad | Methode | Typisches 200-Format | sendSuccess? | Projekt? | Risiko | Frontend |
|------|---------|----------------------|---------------|----------|--------|----------|
| `/users` | GET, POST, PATCH `/:id`, DELETE `/:id` | **Envelope:** `data.users`, `data.user`, `data.deleted`/`data.id`; POST 201 `data.user` | ja (Handler A3.7) | nein | erledigt (A3.7) | ja |
| `/firmen` | GET, GET `/:id`, POST, PATCH `/:id` | **Envelope:** `data.firmen`, `data.firma`+`data.detail`, POST `data.firma`, PATCH `data.updated` | ja (Handler A3.7) | nein | erledigt (A3.7) | ja |
| `/kunden`, `/stammdaten/kunden` | GET `/`, GET `/:id`, POST `/`, PATCH `/:id` | Inline `createKundenRouter()` in `api-v1.js` (**nicht** `routes/kunden.js`): **Handler** `sendSuccess`/`sendError`; Nutzdaten `data.kunden`, `data.kunde`, `data.detail` (GET Detail) | ja (Handler A3.7) | nein | erledigt (A3.7) | ja |
| `/fusa/kunden` | GET, PATCH `/:firmaId` | Inline in `api-v1.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`fusaKundenSehen` / `fusaKundenBearbeiten`) ggf. Legacy | ja (Handler) | nein | erledigt | ja (`data.kunden`, `data.ok`) |
| `/fusa/auftraege/form-meta` | GET | Inline in `api-v1.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`fusaAuftraegeSehen`) ggf. Legacy | ja (Handler) | nein | erledigt (A3.3) | ja (`data.form_meta`) |
| `/fusa/auftraege/kalkulation` | POST | Inline: **Handler** Envelope (`sendSuccess` / `sendError`) | ja (Handler) | nein | erledigt (A3.3) | ja (`data.kalkulation`) |
| `/fusa/auftraege/verfuegbare-fahrzeuge` | GET, POST | Inline: **Handler** Envelope (`sendSuccess` / `sendError`); Nutzdaten in `data.*` (Payload aus `buildVerfuegbareFahrzeugeMitFlaechen`) | ja (Handler) | ja (`project_id`, Zugriffsprüfung) | erledigt (A3.3) | ja |
| `/fusa/auftraege` | GET | Inline: **Handler** Envelope (`sendSuccess` / `sendError`) | ja (Handler) | nein | erledigt (A3.3) | ja (`data.auftraege`) |
| `/fusa/auftraege/:id/freigeben` | POST | Inline: **Handler** Envelope (`sendSuccess` / `sendError`); Erfolg `data.status`, `data.fusa_auftrag_id`, `data.ccintern_auftrag_id` | ja (Handler) | nein | erledigt (A3.3) | ja (Bridge + Stabilität) |
| `/fusa/fahrzeuge` | GET | Inline in `api-v1.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`fusaFahrzeugeSehen`) ggf. Legacy | ja (Handler) | nein | erledigt (A3.4) | ja (`data.fahrzeuge`) |
| `/fusa/dokumente` | GET, POST, GET `/:id`, DELETE `/:id` | Sub-Router `fusa-dokumente.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** ggf. Legacy | ja (Handler) | ja | erledigt | ja |
| `/fusa/angebote` | GET, POST, GET `/:id`, PATCH `/:id`, DELETE `/:id` | Sub-Router `fusa-angebote.js`: **Handler** Envelope; **Middleware** ggf. Legacy | ja (Handler) | ja | erledigt | ja |
| `/fusa/rechnungen` | GET, POST, PATCH `/:rechnungId`, POST `/:rechnungId/promote-from-angebot` | Inline in `api-v1.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`fusaRechnungen*`) ggf. Legacy | ja (Handler) | nein | erledigt | ja (`data.rechnungen`, `data.rechnung`; `fusa-api-data-port.js`) |
| `/fusa/termine` | GET | Inline in `api-v1.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`fusaTermineSehen`) ggf. Legacy | ja (Handler) | nein | erledigt (GET) | ja (`data.termine`) |
| `/mitarbeiter` | * | Sub-Router `mitarbeiter.js` | **Handler:** Envelope (`sendSuccess` / `sendError`); **Middleware:** ggf. Legacy | firma (resolve) | erledigt | Test |
| `/checklisten` | * | Sub-Router `checklisten.js` | **Handler:** Envelope; **Middleware:** ggf. Legacy | firma (resolve) | erledigt | Test |
| `/produktion` | * | Sub-Router `produktion.js` | **Handler:** Envelope; **Middleware:** ggf. Legacy | firma (resolve) | erledigt | Test |
| `/kalender`, `/stammdaten/kalender` | GET `/`, POST `/`, PUT `/:id`, DELETE `/:id` | Inline `createKalenderRouter()` in `api-v1.js`, **zwei** Mounts (`/kalender`, `/stammdaten/kalender`): **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`ccinternKalender*`) ggf. Legacy | ja (Handler) | firma (resolve) | erledigt (A3.1) | ja (`data.termine`, `data.total`, `data.termin`, `data.deleted`/`data.id`) |
| `/urlaub` | GET, POST, PUT `/:id`, DELETE `/:id` | Inline in `api-v1.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`ccinternUrlaub*`) ggf. Legacy | ja (Handler) | firma (resolve) | erledigt | ja (`data.urlaub`, `data.ok`, …) |
| `/lager` | GET `/`, POST `/`, PUT `/:id`, DELETE `/:id`, POST `/:id/buchungen`, GET `/:id/buchungen` | Inline in `api-v1.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`ccinternLager*`) ggf. Legacy | ja (Handler) | firma (resolve) | erledigt | ja (`data.lager`, `data.material`, `data.buchungen`, …) |
| `/anfragen`, `/ccintern/anfragen` | GET `/`, GET `/:id`, POST `/`, PUT `/:id`, DELETE `/:id` | Inline `createAnfragenRouter()` in `api-v1.js`, **ein** Router, **zwei** Mounts: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`ccinternAnfragen*`) ggf. Legacy | ja (Handler) | firma (resolve) | erledigt | ja (`data.anfragen`, `data.anfrage`, …) |
| `/aufgaben` | GET, POST, PUT `/:id`, DELETE `/:id` | Inline in `api-v1.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`ccinternAufgaben*`) ggf. Legacy | ja (Handler) | firma (resolve) | erledigt | ja (`data.aufgaben`, `data.aufgabe`, `data.ok`) |
| `/rechnungen`, `/ccintern/rechnungen` | GET `/`, GET `/:id`, POST `/`, PUT `/:id`, DELETE `/:id` | Inline `createRechnungenRouter()` in `api-v1.js`, **ein** Router, **zwei** Mounts: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`ccinternRechnungen*`) ggf. Legacy | ja (Handler) | firma (resolve) | erledigt | nein (SyncAdapter-Pfad noch „muss gebaut werden“; kein `apiFetch` auf diese v1-URLs) |
| `/messeflow/*` | Workspace, MF-Projekte (Workspace + firma-basiert), Wände/Dateien, Caldera-Upload, Aufgaben/Dokumente | Inline `api-v1.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`ccinternMesseflow*` / `messeflowWorkspace*`) ggf. Legacy | ja (Handler) | firma / Rechte / `x-project-id` je Route | erledigt (A3.5) | ja |
| `/messeflow/pruef-server/*` | GET `/status`, POST `/pdf/pruefen`, `/export/*`, `/montagehilfe` | `messeflow-pruef-proxy.js`: Fehler über `sendError`; erfolgreiche Antworten oft **Upstream-Passthrough** (`res.send` Text/Binary — nicht als JSON-Envelope umschlossen) | Fehler: ja | — | erledigt (A3.5) Fehlerpfade | Proxy |
| `/ccintern/messeflow-workspace` | GET, PUT | GET: rohes JSON / leerobjekt; PUT `{ ok }` | nein | nein | mittel | ja (PUT) |
| `/ccintern/angebote` | GET, GET `/:id`, POST, PUT `/:id`, DELETE `/:id` | `ccintern/angebote.js`: **Handler** Envelope (`sendSuccess` / `sendError`); `x-project-id` Pflicht; **Middleware** (`requireModule('ccintern')`) ggf. Legacy | ja (Handler) | `x-project-id` | erledigt | bei Anbindung: `data.angebote` / `data.angebot` / `data.ok` |
| `/ccintern/kunden` | GET | Inline in `api-v1.js`: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`ccinternKundenSehen`) ggf. Legacy | ja (Handler) | nein | erledigt | ja (`data.kunden`) |
| `/ccintern/kunden/:firmaId` | PATCH | Inline: **Handler** Envelope; Erfolg `data.ok`; **Middleware** (`ccinternKundenBearbeiten`) ggf. Legacy | ja (Handler) | nein | erledigt | ja (`kunde-form.js` PATCH, Rückgabe ungenutzt) |
| `/invites` | GET, POST, POST `/:id/revoke` | **Handler:** Envelope (`sendSuccess` / `sendError`). **Middleware** (`einladungenSehen` / `einladungenErstellen`): bei Ablehnung vor dem Handler weiter Legacy `{ error, message }`. | ja (Handler) | nein | erledigt | ja (`cockpit-einladungen-view.js`, `data.invites`) |
| `/users/:id/rights` | GET, POST | **Envelope:** `data.user_id`, `data.global_role`, `data.modules`, `data.rights` / POST `data` oft `{}` | ja (Handler A3.7) | nein | erledigt (A3.7) | ja |
| `/users/:id/modules` | POST | **Envelope:** POST `data` oft `{}` | ja (Handler A3.7) | nein | erledigt (A3.7) | ja |
| `/role-templates` | GET, POST, DELETE `/:id` | **Handler:** Envelope: GET `data.templates`; POST `data.template` (201); DELETE `data.deleted` + `data.id` (200). **Middleware** (`rollenSehen` / `rollenBearbeiten`): bei Ablehnung vor dem Handler weiter Legacy `{ error, message }`. | ja (Handler) | nein | erledigt | ja (`data.templates` u. a.) |
| `/auftraege`, `/ccintern/auftraege` | GET `/`, POST `/`, GET `/:id`, PUT `/:id`, DELETE `/:id`, GET/POST `/:id/kommentare` | Inline `createAuftraegeRouter()` in `api-v1.js`, **zwei** Mounts: **Handler** Envelope (`sendSuccess` / `sendError`); **Middleware** (`ccinternAuftraege*`) ggf. Legacy | ja (Handler) | firma (resolve); `x-project-id` außerhalb Whitelist | erledigt (A3.2) | ja (`data.items`/`data.pagination`, `data.auftrag`, `data.kommentar(e)`, `data.deleted`) |

---

## Sub-Router-Dateien (Mount unter `/api/v1/...`)

| Datei | Mount-Prefix(e) | Envelope | Projektbezug |
|-------|-----------------|----------|--------------|
| `routes/kunden.js` | `/kunden` (Legacy `server.js` — **FUSA**-Kundenstamm, nicht Stammkunden-Firmen) | **voll** (`sendSuccess` / `sendError`) | — |
| Inline `createKundenRouter()` in `api-v1.js` | `/kunden`, `/stammdaten/kunden` | **voll** (A3.7); Stammkunden = Firmen-Mapping | — |
| `routes/api-v1/schaeden.js` | `/schaeden` | **voll** | `x-project-id` strikt |
| `routes/fusa-dokumente.js` | `/fusa/dokumente` | **voll** (Handler: `sendSuccess` / `sendError`; Middleware ggf. Legacy) | `project_id` |
| `routes/fusa-angebote.js` | `/fusa/angebote` | **voll** (Handler: `sendSuccess` / `sendError`; Middleware ggf. Legacy) | `project_id` |
| `routes/mitarbeiter.js` | `/mitarbeiter` | **voll** (Handler: `sendSuccess` / `sendError`; Middleware ggf. Legacy) | `firma_id` |
| `routes/checklisten.js` | `/checklisten` | **voll** (Handler: `sendSuccess` / `sendError`; Middleware ggf. Legacy) | `firma_id` |
| `routes/produktion.js` | `/produktion` | **voll** (Handler: `sendSuccess` / `sendError`; Middleware ggf. Legacy) | `firma_id` |
| `routes/ccintern/angebote.js` | `/ccintern/angebote` | **voll** (Handler: `sendSuccess` / `sendError`; Middleware ggf. Legacy) | `x-project-id` |
| Inline `createAnfragenRouter()` in `api-v1.js` | `/anfragen`, `/ccintern/anfragen` | **voll** (Handler: `sendSuccess` / `sendError`; Middleware ggf. Legacy) | `firma_id` (resolve) |
| Inline Urlaub-Handler in `api-v1.js` | `/urlaub` | **voll** (Handler: `sendSuccess` / `sendError`; Middleware ggf. Legacy) | `firma_id` (resolve) |
| Inline Lager-Handler in `api-v1.js` | `/lager`, `/lager/:id`, `/lager/:id/buchungen` | **voll** (Handler: `sendSuccess` / `sendError`; Middleware ggf. Legacy) | `firma_id` (resolve) |
| Inline `GET /fusa/termine` in `api-v1.js` | `/fusa/termine` | **voll** (GET: Handler-Envelope; Middleware ggf. Legacy) | — |
| Inline CC-Intern-Kunden in `api-v1.js` | `/ccintern/kunden`, `/ccintern/kunden/:firmaId` | **voll** (GET + PATCH: Handler-Envelope; Middleware ggf. Legacy) | — |
| Inline FUSA-Rechnungen in `api-v1.js` | `/fusa/rechnungen`, `/fusa/rechnungen/:rechnungId`, `…/promote-from-angebot` | **voll** (Handler-Envelope; Middleware ggf. Legacy) | — |
| Inline FUSA-Kunden in `api-v1.js` | `/fusa/kunden`, `/fusa/kunden/:firmaId` | **voll** (GET + PATCH: Handler-Envelope; Middleware ggf. Legacy) | — |
| Inline CC-Intern-Aufgaben in `api-v1.js` | `/aufgaben`, `/aufgaben/:id` | **voll** (GET, POST, PUT, DELETE: Handler-Envelope; Middleware ggf. Legacy) | `firma_id` (resolve) |
| Inline `createRechnungenRouter()` in `api-v1.js` | `/rechnungen`, `/ccintern/rechnungen` | **voll** (GET, POST, PUT, DELETE: Handler-Envelope; Middleware ggf. Legacy) | `firma_id` (resolve) |
| `routes/logs.js` | **`/api/v1/logs`** (`router.use('/logs', …)` in `api-v1.js`) | **voll** (GET: Handler-Envelope `data.items` + Pagination; Router-intern `requireLogsAccess`) | optional `x-project-id` (Whitelist Prefix `/api/v1/logs`) |
| `routes/cockpit/dashboard.js` | **`/api/v1/cockpit/dashboard`** | **voll** (`data.stats`; `requireDashboardModule('cockpit')`) | optional `x-project-id` (Whitelist) |
| `routes/fusa/dashboard.js` | **`/api/v1/fusa/dashboard`** | **voll** (`data.stats`; `requireDashboardModule('fusa')`) | optional `x-project-id` (Whitelist) |
| `routes/fusa/quartale.js` | **`/api/v1/fusa/quartale`** | **voll** (`data.jahr`, `data.quartale`; `requireDashboardModule('fusa')`) | optional `x-project-id` (Whitelist); Query `project_id` filtert über `auftraege` |
| `routes/ccintern/dashboard.js` | **`/api/v1/ccintern/dashboard`** | **voll** (`data.stats`; `requireDashboardModule('ccintern')`) | optional `x-project-id` (Whitelist) |
| `routes/geraete.js` | **`/api/v1/geraete`** | **voll** (`requireCockpitGeraet`; CRUD `geraete`-Tabelle) | ja (`x-project-id`; `firma_id` über Resolver) |
| `routes/crm/index.js` | **`/api/v1/crm`** (`pipeline`, `aktivitaeten`, `wiedervorlage`) | **voll** (`requireCcinternCrm`; CRM-Tabellen) | ja (`x-project-id`; `firma_id` über Resolver) |
| `routes/projects.js` (+ `project-access.js`, `project-invites.js`) | **`/api/v1/projects`** (`router.use('/projects', …)` in `api-v1.js`) | **voll** (Handler: `sendSuccess` / `sendError`; …) | optional `x-project-id` (Whitelist Prefix `/api/v1/projects`) |

### Frühere Root-Mounts (Phase A4 abgeschaltet)

Produktion: Root-Pfade dieser Router sind **nicht** mehr aktiv (`410 LEGACY_REMOVED`). Module bleiben für Tests/API-v1-Einbindung.

| Datei | Hinweis |
|-------|---------|
| `routes/fahrzeuge.js`, `routes/projects.js`, … | Früher parallel unter `/fahrzeuge`, `/projects`, … — nur noch `/api/v1/...` |

---

## Migration Envelope — erledigt / offen

**Erledigt (Handler vollständig Envelope, siehe Legende „Handler vs. Middleware“):**

- ✔ `/api/v1/auth/my-rights`
- ✔ `/api/v1/schaeden`
- ✔ `/api/v1/role-templates` (GET, POST, DELETE `/:id`)
- ✔ `/api/v1/invites` (GET, POST, POST `/:id/revoke`)
- ✔ `/api/v1/produktion` (GET, POST, GET/PATCH/DELETE `/:id`)
- ✔ `/api/v1/checklisten` (alle Handler in `checklisten.js`)
- ✔ `/api/v1/mitarbeiter` (GET, GET `/:id`, POST, PUT `/:id`, DELETE `/:id`)
- ✔ `/api/v1/fusa/dokumente` (GET, POST, GET `/:id`, DELETE `/:id`)
- ✔ `/api/v1/fusa/angebote` (GET, POST, GET `/:id`, PATCH `/:id`, DELETE `/:id`)
- ✔ `/api/v1/fusa/fahrzeuge` (GET)
- ✔ `/api/v1/ccintern/angebote` (GET, GET `/:id`, POST, PUT `/:id`, DELETE `/:id`)
- ✔ `/api/v1/anfragen` und `/api/v1/ccintern/anfragen` (dieselbe Router-Instanz)
- ✔ `/api/v1/urlaub` (GET, POST, PUT `/:id`, DELETE `/:id`)
- ✔ `/api/v1/lager` inkl. Buchungen (`POST/GET …/:id/buchungen`)
- ✔ `/api/v1/fusa/termine` (GET)
- ✔ `/api/v1/ccintern/kunden` (GET, PATCH `/:firmaId`)
- ✔ `/api/v1/fusa/rechnungen` (GET, POST, PATCH `/:rechnungId`, POST `…/promote-from-angebot`)
- ✔ `/api/v1/fusa/kunden` (GET, PATCH `/:firmaId`)
- ✔ `/api/v1/aufgaben` (GET, POST, PUT `/:id`, DELETE `/:id`)
- ✔ `/api/v1/rechnungen` und `/api/v1/ccintern/rechnungen` (dieselbe Router-Instanz)
- ✔ `/api/v1/projects` inkl. `/:projectId/access`, `/:projectId/invites`, `/:projectId/my-access` (`projects.js` + eingebundene Router; A3.6)
- ✔ `/api/v1/users` inkl. `POST/PATCH/DELETE …`, `/users/:id/rights`, `/users/:id/modules` (Inline `api-v1.js`; A3.7)
- ✔ `/api/v1/firmen` inkl. GET Liste/Detail, POST, PATCH (Inline `api-v1.js`; A3.7)
- ✔ `/api/v1/kunden` und `/api/v1/stammdaten/kunden` (Inline `createKundenRouter()` in `api-v1.js`; A3.7)

**Erledigt (Handler-Envelope, Auswahl):** u. a. `/fusa/auftraege` (inkl. Freigabe), `/kalender`, `/auftraege`/`/ccintern/auftraege`, MesseFlow/CC-Intern-Projekt-Routen in `api-v1.js` — siehe Tabellen oben.

---

## Deprecated — frühere Root-Legacy-Pfade (Phase A4)

Die folgenden **Root**-Pfade waren bis Phase A4 parallel zum JSON-API unter `/api/v1/...` angebunden. Ab Stand Roadmap A4 liefern sie in Produktion **HTTP 410** (`LEGACY_REMOVED`) — siehe `backend/src/lib/legacy-api-removed.js` und `server.js`. Router-Module (`routes/*.js`) bleiben im Repo für Tests/Imports (z. B. Bridge-Test mit eigenem `app.use('/auftraege', …)`).

| Früherer Root-Pfad | Nachfolger |
|--------------------|------------|
| `/users`, `/projects`, `/kunden`, `/angebote`, `/auftraege`, `/fahrzeuge`, `/schaeden` | jeweils **`/api/v1/...`** (siehe Inventar-Tabellen) |

---

## Offene Risiken

- **Router-Module ohne Produktions-Mount** (`routes/auftraege.js`, …): nur noch für eingebundene Tests oder künftige Wiederverwendung; Produktion: nur `/api/v1/*`.
- **`x-project-id` global erzwingen** bricht Stammdaten-Routen ohne Projekt — nur gruppenweise sinnvoll.
- Root `/schaeden`: **410** `LEGACY_REMOVED` (A4); nutzbar nur noch `/api/v1/schaeden`.

---

## Phase 2 Fortschritt (Stand jetzt)

- **API v1:** Handler liefern durchgängig `{ success: true, data }` bzw. Fehler `{ success: false, error: { code, message } }` (`sendSuccess` / `sendError`), wo in dieser Migration erreicht.
- **Middleware:** zentrale Gateways (`require-auth`, `require-rights`, `attach-access-profile`, `require-api-project`, relevante `project-access`-Handler, globaler Express-Fehlerhandler in `server.js`) auf dasselbe Fehler-Envelope umgestellt.
- Legacy-Root-Routen (ohne `/api/v1`): Phase **A4** — 410 `LEGACY_REMOVED`; siehe Abschnitt **Deprecated** oben.
