# Status FUSA (Backend-Bezug)

**Stand:** 2026-04-26 — Phase A und Phase B nach `docs/BACKEND-ROADMAP.md` abgeschlossen (Tracker 13/13).

## Kurz

- FUSA-API unter `/api/v1/fusa/*` liefert Erfolg/Fehler im Envelope; Projekt-/Zugriffsprüfungen in den Integrationstests abgedeckt.
- Phase B: Dashboard (`GET /api/v1/fusa/dashboard`), Quartalsaggregation (`GET /api/v1/fusa/quartale`).
- Freigabe-Flow FUSA → CC-Intern (`POST …/fusa/auftraege/:id/freigeben`) und FUSA-Dokumente sind in Stabilität, Bridge und Isolation getestet; Audit bei Freigabe aktiv.
- Upload-Infrastruktur: zentrale Multer-/Pfadlogik in `upload-storage.js` (Schaden-Fotos im Legacy-Router `routes/schaeden.js` bei Nutzung mit Projektbezug aus Datensatz).

## Tests (Abschlusscheck)

- `npm run test:api-bridge`, `test:api-project-isolation`, `test:api-core-consistency`, `test:api-stability`, `test:audit-log`, `test:upload-storage` — grün (Ausführung 2026-04-26).

## Hinweis (Legacy-Datei)

- Die Datei `backend/src/routes/auftraege.js` (teilweise `res.status(...).json({ error, message })`) wird **nicht** als Hauptpfad für `/api/v1/auftraege` genutzt — die produktive Logik steckt im Inline-`createAuftraegeRouter` in `api-v1.js`. Die ältere Datei nur für dokumentierte Sonder-/Test-Mounts.

## Nächste Schritte (Produkt)

- Operative Features außerhalb der abgeschlossenen Roadmap; keine offenen Phase-A/B-Blocker aus diesem Dokument.
