# CCinter → Cockpit Umzug — Scripts

## Reihenfolge (ZWINGEND einhalten!)

### Schritt 1 — Schema vorbereiten
```sql
-- In SQLite-Client oder Backend-Migrationstool ausführen:
.read 01_schema_migration.sql
```
Fügt fehlende Spalten zu `firmen` hinzu + legt `crm_aktivitaeten` neu an.  
**Sicher:** Nur `ADD COLUMN IF NOT EXISTS` — keine Daten werden gelöscht.

---

### Schritt 2 — Kunden importieren
```bash
# Erst testen (kein DB-Zugriff):
node 02_import_kunden.js

# SQL-Datei erzeugen:
node 02_import_kunden.js --output sql

# Direkt in DB schreiben:
npm install better-sqlite3
node 02_import_kunden.js --execute
```

**Vor dem Execute:** `MITARBEITER_MAP` in `02_import_kunden.js` mit echten UUIDs aus `users`-Tabelle befüllen!

---

### Schritt 3 — Cockpit-Shell Bootstrap
`03_bootstrap_cockpit.js` in Cockpit-Shell einbinden:

```js
import { ccInternInit } from './scripts/03_bootstrap_cockpit.js';

// Im Cockpit-Shell-Lifecycle (beim Laden des CC-Intern-Tabs):
ccInternInit({
  apiUrl: 'https://cc-werbung.de/api/v1',
  token:  authStore.getToken()
});
```

---

## Checkliste

- [ ] `01_schema_migration.sql` ausgeführt
- [ ] `MITARBEITER_MAP` in Skript 02 mit echten User-IDs befüllt
- [ ] `02_import_kunden.js --execute` ausgeführt (8 Kunden + Aktivitäten)
- [ ] `03_bootstrap_cockpit.js` in Cockpit-Shell eingebunden
- [ ] Routing-Fix: `kunden.js` → `requireModule('ccintern')` statt `'fusa'`
- [ ] Fehlende Backend-Routen gebaut: `/offers`, `/inquiries`, `/fusa/vehicles`
