# Status Cockpit (Backend-Bezug)

**Stand:** 2026-04-26 — Phase A und Phase B nach `docs/BACKEND-ROADMAP.md` abgeschlossen (Tracker 13/13).

## Kurz

- API-v1-Nutzlasten für Cockpit-Stammdaten (Benutzer, Firmen, Kunden, Projekte, Einladungen, Rollen) nutzen das Envelope-Format (`sendSuccess` / `sendError`); Projekt-Header `x-project-id` wo vorgesehen (Whitelist in `api-v1-project-context.js`).
- Legacy-Root-Routen unter `/users`, `/projects`, `/kunden` usw. sind abgeschaltet (410 `LEGACY_REMOVED`); Produktiv ist `/api/v1/…`.
- Phase B (Cockpit): Logs/Audit-Lese-API (`GET /api/v1/logs`), Dashboard (`GET /api/v1/cockpit/dashboard`), Geräte (`/api/v1/geraete`). Schreibaktionen werden im Audit (`audit_log`, `logAudit`) mitprotokolliert, soweit betroffen.

## Tests (Abschlusscheck)

- `npm run test:api-stability`, `test:api-bridge`, `test:api-project-isolation`, `test:api-core-consistency`, `test:audit-log`, `test:upload-storage` — grün (Ausführung 2026-04-26).

## Nächste Schritte (Produkt)

- Frontend/Deployment; neue Anforderungen außerhalb dieser Roadmap sind nicht Teil des 13/13-Trackers.
