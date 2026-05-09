# BACKEND_ROUTEN.md — CC Intern → Cockpit
**Für den Cockpit-Backend-Entwickler**
**Stand: April 2026**

> Diese Routen müssen im Cockpit-Backend gebaut werden, damit CC Intern vollständig funktioniert.
> Alle Routen folgen dem bestehenden Muster: `requireModule('ccintern')` + `requireRight('ccintern', ...)`

---

## ✅ BEREITS VORHANDEN — nicht anfassen

| Route | Datei |
|---|---|
| `GET /api/v1/ccintern/kunden` | api-v1.js |
| `PATCH /api/v1/ccintern/kunden/:firmaId` | api-v1.js |
| `GET /api/v1/firmen` | api-v1.js |
| `GET /api/v1/users` | api-v1.js |
| `GET /api/v1/role-templates` | api-v1.js |

---

## 🔴 MUSS GEBAUT WERDEN — 10 Routen

### 1. Aufträge CC Intern
```
GET    /api/v1/ccintern/auftraege          → Array aller CC Intern Aufträge
POST   /api/v1/ccintern/auftraege          → Neuen Auftrag anlegen
GET    /api/v1/ccintern/auftraege/:id      → Einzelner Auftrag
PATCH  /api/v1/ccintern/auftraege/:id      → Auftrag updaten (Felder, Status, Schritte)
DELETE /api/v1/ccintern/auftraege/:id      → Auftrag löschen
```
Middleware: `requireModule('ccintern')` + `requireRight('ccintern', 'auftraege', 'sehen/erstellen/bearbeiten')`

---

### 2. Angebote CC Intern
```
GET    /api/v1/ccintern/angebote           → Array aller Angebote
POST   /api/v1/ccintern/angebote           → Neues Angebot
GET    /api/v1/ccintern/angebote/:id       → Einzelnes Angebot
PATCH  /api/v1/ccintern/angebote/:id       → Angebot updaten
DELETE /api/v1/ccintern/angebote/:id       → Angebot löschen
```

---

### 3. Anfragen / CRM-Leads
```
GET    /api/v1/ccintern/anfragen           → Array aller Anfragen + Leads
POST   /api/v1/ccintern/anfragen           → Neue Anfrage
PATCH  /api/v1/ccintern/anfragen/:id       → Status updaten
DELETE /api/v1/ccintern/anfragen/:id       → Anfrage löschen
```

---

### 4. CRM-Aktivitäten
```
GET    /api/v1/ccintern/crm-aktivitaeten          → Alle Aktivitäten
GET    /api/v1/ccintern/crm-aktivitaeten/:firmaId → Aktivitäten je Firma
POST   /api/v1/ccintern/crm-aktivitaeten          → Neue Aktivität
PATCH  /api/v1/ccintern/crm-aktivitaeten/:id      → Aktivität updaten
DELETE /api/v1/ccintern/crm-aktivitaeten/:id      → Aktivität löschen
```
Tabelle: `crm_aktivitaeten` (neu — Schema in `scripts/01_schema_migration.sql`)

---

### 5. Urlaub / Abwesenheit
```
GET    /api/v1/ccintern/urlaub             → Alle Urlaubsanträge
POST   /api/v1/ccintern/urlaub             → Neuen Antrag erstellen
PATCH  /api/v1/ccintern/urlaub/:id         → Status: genehmigt / abgelehnt
DELETE /api/v1/ccintern/urlaub/:id         → Antrag löschen
```

---

### 6. Mitarbeiter (CC Intern Detaildaten)
```
GET    /api/v1/ccintern/mitarbeiter        → Mitarbeiterliste mit CC Intern Feldern
GET    /api/v1/ccintern/mitarbeiter/:id    → Einzelner Mitarbeiter
PATCH  /api/v1/ccintern/mitarbeiter/:id    → Mitarbeiter updaten
```
Hinweis: Basisdaten kommen von `GET /api/v1/users` — diese Route liefert CC Intern-spezifische Felder (Urlaub, Kapazität, Zeitkonto)

---

### 7. Anwesenheit / Zeiterfassung
```
GET    /api/v1/ccintern/anwesenheit        → Anwesenheits-Einträge (gefiltert nach Datum/MA)
POST   /api/v1/ccintern/anwesenheit        → Einstempeln (zeitStart)
PATCH  /api/v1/ccintern/anwesenheit/:id    → Ausstempeln / Korrektur (zeitStop)
```

---

### 8. Materiallager
```
GET    /api/v1/ccintern/lager              → Lagerbestand (Artikel + Lieferanten)
POST   /api/v1/ccintern/lager              → Artikel anlegen
PATCH  /api/v1/ccintern/lager/:id          → Bestand updaten / Bestellung aufgeben
DELETE /api/v1/ccintern/lager/:id          → Artikel löschen
```

---

### 9. Rechnungen CC Intern
```
GET    /api/v1/ccintern/rechnungen         → Rechnungsliste
POST   /api/v1/ccintern/rechnungen         → Neue Rechnung
PATCH  /api/v1/ccintern/rechnungen/:id     → Status updaten
```

---

### 10. Checklisten-Vorlagen
```
GET    /api/v1/ccintern/checklisten        → Alle Vorlagen
POST   /api/v1/ccintern/checklisten        → Neue Vorlage
PATCH  /api/v1/ccintern/checklisten/:id    → Vorlage updaten
DELETE /api/v1/ccintern/checklisten/:id    → Vorlage löschen
```

---

## STANDARD-RESPONSE FORMAT

Alle Routen antworten einheitlich:

```json
// Liste:
{ "auftraege": [...] }  // oder "angebote", "urlaub" etc.

// Einzeln:
{ "auftrag": { ... } }

// Fehler:
{ "error": "Fehlermeldung" }
```

---

## MIDDLEWARE-MUSTER (wie bestehende ccintern-Routen)

```js
const ccinternSehen = chainMiddleware(
  requireModule('ccintern'),
  requireRight('ccintern', 'auftraege', 'sehen')
);
const ccinternBearbeiten = chainMiddleware(
  requireModule('ccintern'),
  requireRight('ccintern', 'auftraege', 'bearbeiten')
);

router.get('/',    ccinternSehen,      async (req, res) => { ... });
router.post('/',   ccinternBearbeiten, async (req, res) => { ... });
router.patch('/:id', ccinternBearbeiten, async (req, res) => { ... });
```

---

## EINBINDEN IN index.js / api-v1.js

```js
// In backend/src/routes/index.js oder api-v1.js ergänzen:
import ccinternAuftraege from './ccintern-auftraege.js';
import ccinternAngebote  from './ccintern-angebote.js';
// ...

router.use('/ccintern/auftraege',  ccinternAuftraege);
router.use('/ccintern/angebote',   ccinternAngebote);
// ...
```

---

## REIHENFOLGE DER UMSETZUNG (empfohlen)

```
1. 01_schema_migration.sql ausführen  → crm_aktivitaeten Tabelle anlegen
2. SELECT id, name FROM users;        → MITARBEITER_MAP in 02_import_kunden.js eintragen
3. node 02_import_kunden.js --output sql  → SQL prüfen
4. node 02_import_kunden.js --execute     → Kunden importieren
5. Backend: Aufträge-Route bauen      → wichtigste Route
6. Backend: Angebote + Anfragen       → Vertrieb
7. Backend: Mitarbeiter + Urlaub      → Personal
8. Backend: Lager + Checklisten       → Produktion
9. Backend: Rechnungen + Anwesenheit  → Abschluss
```
