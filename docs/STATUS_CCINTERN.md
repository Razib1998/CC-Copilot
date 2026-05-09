# Status CC Intern (Backend-Bezug)

**Stand:** 2026-04-26 — Phase A und Phase B nach `docs/BACKEND-ROADMAP.md` abgeschlossen (Tracker 13/13).

## Kurz

- CC-Intern-Routen unter `/api/v1` (u. a. Aufträge, Kalender, MesseFlow-Arbeitsbereich, Angebote, Anfragen, Rechnungen, CRM) nutzen durchgehend das API-v1-Envelope; Mandanten-/Firmenkontext über bestehende Resolver.
- Phase B: Dashboard (`GET /api/v1/ccintern/dashboard`), CRM (`/api/v1/crm/*`), Mitarbeiter-App (`/api/v1/ccintern/me/*`) inkl. Refresh über `POST /api/v1/auth/refresh`.
- MesseFlow: Upload-Pfade für Caldera/Proxy über `upload-storage.js`; Mobile-Fotos unter `ccintern-fotos/<project_id>/<auftrag_id>/…`.
- Audit: Schreibpfade für CC-Intern-Aufträge und MesseFlow sind instrumentiert (`logAudit`).

## Tests (Abschlusscheck)

- `npm run test:api-stability`, `test:api-bridge`, `test:api-project-isolation`, `test:api-core-consistency`, `test:audit-log`, `test:upload-storage` — grün (Ausführung 2026-04-26); Stichproben u. a. `/api/v1/ccintern/*`, Bridge, B6-Refresh/Mobile.

## Nächste Schritte (Produkt)

- Mobile App / UX; Anforderungen außerhalb der Roadmap-Phasen A/B sind eigenständig zu planen.
