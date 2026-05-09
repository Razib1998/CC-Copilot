# CC COCKPIT — PHASE 1: TICKETS

**Erstellt:** 2026-04-08
**Basis:** COCKPIT_BAUPLAN.md — Phase 1 (Fundament)
**Prinzip:** Jedes Ticket ist eigenständig, hat klare Fertig-Kriterien und eine Abhängigkeit.

---

## LEGENDE

```
Aufwand:
  XS  = ~halber Tag
  S   = ~1 Tag
  M   = ~2 Tage
  L   = ~3 Tage

Status:
  [ ] = offen
  [~] = in Arbeit
  [x] = fertig
  [!] = blockiert

Abhängigkeit:
  "→ TICKET-xxx" bedeutet: dieses Ticket muss vorher fertig sein
```

---

## BLOCK 0 — ENTSCHEIDUNGEN (vor allem anderen)

> Diese Tickets produzieren keinen Code.
> Sie klären Fragen, die sonst mitten im Bauen zu Umbauten führen.
> **Müssen zuerst abgehakt werden.**

---

### TICKET-001 — Tech-Stack festlegen

**Aufwand:** XS
**Abhängig von:** —
**Typ:** Entscheidung / Dokument

**Aufgabe:**
Folgende Entscheidungen treffen und schriftlich festhalten:

```
Backend:
  [ ] Node.js + Express   oder   Node.js + Fastify
  [ ] PostgreSQL          oder   SQLite (nur für Entwicklung)
  [ ] REST                oder   GraphQL

Frontend:
  [ ] Vue 3               oder   React + Next.js
  [ ] eigenes CSS         oder   Tailwind CSS

Authentifizierung:
  [ ] JWT (stateless)     oder   Session + Cookie (stateful)
  [ ] JWT-Ablauf nach X Minuten (empfohlen: 15 min Access, 7 Tage Refresh)

Datei-Ablage:
  [ ] MinIO (self-hosted) oder   Cloudflare R2   oder   später entscheiden

Deployment:
  [ ] VPS (Hetzner/Strato) + Docker
  [ ] Bare Metal auf bestehendem Server
```

**Fertig wenn:**
- Alle Punkte entschieden
- Entscheidungen mit Begründung in `COCKPIT_STACK.md` dokumentiert
- Kein Punkt mehr offen

---

### TICKET-002 — Rollen und Berechtigungen definieren

**Aufwand:** XS
**Abhängig von:** TICKET-001
**Typ:** Entscheidung / Dokument

**Aufgabe:**
Welche Rollen gibt es? Was darf jede Rolle?
Tabelle ausfüllen — noch kein Code:

```
Rolle              Aufträge  Kanban  Zeiterfassung  Lexware  Mitarbeiter  Urlaub  Admin
─────────────────────────────────────────────────────────────────────────────────────────
admin              rw        rw      rw             rw       rw           rw      ✓
geschaeftsfuehr    r         r       r              r        r            rw      –
produktion         rw        rw      eigene         –        –            eigene  –
buchhaltung        r         –       –              rw       –            –       –
montage            r         eigene  eigene         –        –            eigene  –

(r = lesen, rw = lesen+schreiben, eigene = nur eigene Einträge)
```

**Fertig wenn:**
- Rollen-Matrix vollständig ausgefüllt (oben ist Entwurf — anpassen)
- Alle CC-Intern-Mitarbeiter einer Rolle zugeordnet:
  ```
  Celal    → admin
  Muhammet → geschaeftsfuehr
  Melanie  → produktion
  Ilayda   → produktion
  Selim    → produktion
  Okan     → montage
  Mohammed → montage + produktion  (Kombi-Rolle klären)
  Mete     → montage
  Zint     → buchhaltung
  Elvan    → produktion  (oder eigene Rolle klären)
  ```
- Dokument gespeichert in `COCKPIT_ROLLEN.md`

---

## BLOCK 1.1 — PROJEKT-SETUP

---

### TICKET-003 — Repository und Ordnerstruktur anlegen

**Aufwand:** S
**Abhängig von:** TICKET-001
**Typ:** Setup

**Aufgabe:**

```
Ordnerstruktur (Beispiel — anpassen nach Stack-Entscheidung):

cockpit/
├── backend/
│   ├── src/
│   │   ├── routes/         ← API-Endpunkte
│   │   ├── middleware/     ← Auth, Fehlerbehandlung
│   │   ├── db/             ← Datenbankverbindung + Migrations
│   │   ├── services/       ← Business-Logik (kein SQL in Routes)
│   │   └── config/         ← Umgebungsvariablen
│   ├── .env.example        ← Template für lokale Konfiguration
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     ← Wiederverwendbare UI-Komponenten
│   │   ├── pages/          ← Seitenkomponenten
│   │   ├── store/          ← State Management
│   │   ├── api/            ← API-Client (nur hier werden Requests gemacht)
│   │   └── styles/         ← CSS-Variablen + globale Styles
│   └── package.json
├── docs/
│   ├── COCKPIT_BAUPLAN.md
│   ├── COCKPIT_MIGRATION_REFERENZ.md
│   └── COCKPIT_PHASE1_TICKETS.md
└── docker-compose.yml      ← lokale Entwicklungsumgebung
```

**Fertig wenn:**
- Repo existiert (lokal oder remote)
- Ordnerstruktur angelegt
- `.gitignore` konfiguriert (node_modules, .env, dist)
- `README.md` mit "Wie starte ich das lokal?" vorhanden
- Leeres Backend und Frontend starten ohne Fehler

---

### TICKET-004 — Lokale Entwicklungsumgebung (Docker Compose)

**Aufwand:** S
**Abhängig von:** TICKET-003
**Typ:** Setup

**Aufgabe:**
`docker-compose.yml` aufsetzen damit jeder Entwickler lokal mit einem Befehl starten kann.

```yaml
# Minimal-Konfiguration:
services:
  db:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: cockpit
      POSTGRES_USER: cockpit
      POSTGRES_PASSWORD: (aus .env)
    volumes: [./data/postgres:/var/lib/postgresql/data]

  backend:
    build: ./backend
    ports: ["3000:3000"]
    depends_on: [db]
    environment: (aus .env)

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    depends_on: [backend]
```

**Fertig wenn:**
- `docker-compose up` startet alle Services ohne Fehler
- Backend erreichbar unter `http://localhost:3000`
- Frontend erreichbar unter `http://localhost:5173`
- Datenbank erreichbar unter `localhost:5432`
- `.env.example` dokumentiert alle Pflicht-Variablen

---

### TICKET-005 — Migrations-System aufsetzen

**Aufwand:** S
**Abhängig von:** TICKET-004
**Typ:** Setup

**Aufgabe:**
Migrations-Tool konfigurieren (z.B. `node-pg-migrate`, `Flyway`, oder `Knex`).
Jede Schemaänderung läuft als versionierte Migration — nie direktes SQL auf Produktionsdatenbank.

```
Konventionen:
  Dateiname:  YYYYMMDDHHMMSS_beschreibung.sql
  Beispiel:   20260408120000_create_employees.sql
  Pfad:       backend/src/db/migrations/

Befehle:
  npm run db:migrate        ← alle offenen Migrationen ausführen
  npm run db:migrate:undo   ← letzte Migration zurückrollen
  npm run db:status         ← welche Migrationen sind gelaufen?
```

**Fertig wenn:**
- Migrations-Tool installiert und konfiguriert
- `npm run db:migrate` läuft ohne Fehler (auch wenn noch keine Migrationen)
- `npm run db:status` gibt sinnvolle Ausgabe
- Leere erste Migration existiert als Proof-of-Concept

---

## BLOCK 1.2 — DATENBANKSCHEMA

> Reihenfolge wichtig: Tabellen mit FKs kommen nach den Tabellen die sie referenzieren.

---

### TICKET-006 — Tabelle: employees (Mitarbeiter)

**Aufwand:** S
**Abhängig von:** TICKET-005
**Typ:** Schema / Migration

**Migration erstellen:**

```sql
CREATE TABLE employees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kuerzel     VARCHAR(4)   NOT NULL UNIQUE,   -- 'CE', 'ME', 'SE'
  name        VARCHAR(100) NOT NULL,
  rolle       VARCHAR(50)  NOT NULL,          -- 'admin','produktion','buchhaltung',...
  farbe       VARCHAR(7)   NOT NULL DEFAULT '#1565C0',  -- Hex-Code
  soll_std    INTEGER      NOT NULL DEFAULT 160,        -- Sollstunden/Monat
  urlaub_tage INTEGER      NOT NULL DEFAULT 28,
  aktiv       BOOLEAN      NOT NULL DEFAULT true,
  erstellt    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  geaendert   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed: alle 10 MA aus CC Intern übernehmen
INSERT INTO employees (kuerzel, name, rolle, farbe, soll_std) VALUES
  ('CE', 'Celal',     'admin',           '#1565C0', 160),
  ('MU', 'Muhammet',  'geschaeftsfuehr', '#1565C0', 160),
  ('ME', 'Melanie',   'produktion',      '#E91E63', 160),
  ('IL', 'Ilayda',    'produktion',      '#9C27B0', 160),
  ('SE', 'Selim',     'produktion',      '#FF9800', 168),
  ('OK', 'Okan',      'montage',         '#2196F3', 168),
  ('MO', 'Mohammed',  'produktion',      '#4CAF50', 168),
  ('MT', 'Mete',      'montage',         '#00BCD4', 168),
  ('ZI', 'Zint',      'buchhaltung',     '#795548', 80),
  ('EL', 'Elvan',     'produktion',      '#FF5722', 160);
```

**Fertig wenn:**
- Migration läuft durch ohne Fehler
- `SELECT * FROM employees;` gibt alle 10 Mitarbeiter zurück
- Unique-Constraint auf `kuerzel` getestet (doppeltes Kürzel → Fehler)

---

### TICKET-007 — Tabelle: users (Login-Accounts)

**Aufwand:** S
**Abhängig von:** TICKET-006
**Typ:** Schema / Migration

**Warum getrennt von employees:**
Ein Mitarbeiter hat genau einen Login-Account. Aber `employees` enthält auch inaktive MA ohne Login-Zugang. Trennung ermöglicht: MA-Daten bleiben wenn Account gelöscht wird.

**Migration:**

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  email           VARCHAR(200) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  aktiv           BOOLEAN NOT NULL DEFAULT true,
  letzter_login   TIMESTAMPTZ,
  erstellt        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_employee UNIQUE (employee_id)  -- 1:1
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  ablauf      TIMESTAMPTZ NOT NULL,
  erstellt    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fertig wenn:**
- Migration läuft durch
- FK zu `employees` funktioniert
- `refresh_tokens`-Tabelle vorhanden
- Kein Passwort-Klartext irgendwo in der DB (nur Hash)

---

### TICKET-008 — Tabellen: customers (Kunden-Stammdaten)

**Aufwand:** S
**Abhängig von:** TICKET-005
**Typ:** Schema / Migration

**Migration:**

```sql
CREATE TABLE customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(200) NOT NULL,
  adresse    VARCHAR(300),
  plz        VARCHAR(10),
  stadt      VARCHAR(100),
  ap         VARCHAR(200),   -- Ansprechpartner
  tel        VARCHAR(50),
  mail       VARCHAR(200),
  status     VARCHAR(50) NOT NULL DEFAULT 'Neukontakt',
                              -- 'Aktiv','Angebot','Neukontakt','Geplant','Inaktiv'
  notiz      TEXT,
  erstellt   TIMESTAMPTZ NOT NULL DEFAULT now(),
  geaendert  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_activities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  typ          VARCHAR(50),    -- 'Telefonat','E-Mail','Besuch','Notiz'
  datum        DATE NOT NULL,
  notiz        TEXT,
  erstellt_von UUID REFERENCES employees(id),
  ts           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fertig wenn:**
- Migration läuft durch
- FK zu `employees` (erstellt_von) funktioniert
- Test: Kunde anlegen → Aktivität hinzufügen → Kunde löschen → Aktivität weg (CASCADE)

---

### TICKET-009 — Tabellen: orders (Aufträge, Kern)

**Aufwand:** M
**Abhängig von:** TICKET-006, TICKET-008
**Typ:** Schema / Migration

**Migration:**

```sql
CREATE TABLE orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id         VARCHAR(20) UNIQUE,          -- 'AU-2026-01908' (lesbar)
  customer_id        UUID NOT NULL REFERENCES customers(id),
  paket              VARCHAR(300),
  beschr             TEXT,
  auftragsart        VARCHAR(100),
  leistung_id        VARCHAR(100),
  produkt_id         VARCHAR(100),

  -- Termine
  termin_datum       DATE,
  montage_datum      DATE,
  montage_zeit       VARCHAR(10),
  liefertermin       DATE,

  -- Standort + Fahrzeug
  depot              VARCHAR(200),
  fz                 VARCHAR(200),
  fz_typ             VARCHAR(100),
  fz_anzahl          INTEGER DEFAULT 1,

  -- Kalkulation
  netto              NUMERIC(12,2) DEFAULT 0,
  brutto             NUMERIC(12,2) DEFAULT 0,
  mwst_prozent       INTEGER DEFAULT 19,
  notiz_rechnung     TEXT,          -- "Hinweise für Rechnungserstellung"
  notiz_montage      TEXT,
  notiz_besonderh    TEXT,

  -- Produktion
  material           VARCHAR(200),
  laminat            VARCHAR(200),
  maschine           VARCHAR(200),
  flaeche            NUMERIC(10,2),
  stueck             INTEGER DEFAULT 1,

  -- Workflow
  step               VARCHAR(50) NOT NULL DEFAULT 'grafik',
  prio               VARCHAR(20) NOT NULL DEFAULT 'normal',  -- 'normal','hoch','dringend'
  urgent             BOOLEAN NOT NULL DEFAULT false,

  -- Rechnungsstatus
  rechnung_status    VARCHAR(30) NOT NULL DEFAULT 'offen',   -- 'offen','geschrieben','bezahlt'

  -- Archiv
  archiv             BOOLEAN NOT NULL DEFAULT false,
  archiv_datum       TIMESTAMPTZ,

  -- Projekt
  projektleiter_id   UUID REFERENCES employees(id),

  erstellt           TIMESTAMPTZ NOT NULL DEFAULT now(),
  geaendert          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index für häufige Queries
CREATE INDEX idx_orders_step       ON orders(step);
CREATE INDEX idx_orders_customer   ON orders(customer_id);
CREATE INDEX idx_orders_archiv     ON orders(archiv);
CREATE INDEX idx_orders_rechnung   ON orders(rechnung_status);
```

**Fertig wenn:**
- Migration läuft durch
- FK zu `customers` und `employees` funktionieren
- Alle Indizes vorhanden
- Test: Auftrag anlegen, step ändern, archivieren

---

### TICKET-010 — Tabellen: order_steps + checklist_items

**Aufwand:** S
**Abhängig von:** TICKET-009
**Typ:** Schema / Migration

**Migration:**

```sql
CREATE TABLE order_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  step_key            VARCHAR(50) NOT NULL,    -- 'grafik','druck',...
  mitarbeiter_id      UUID REFERENCES employees(id),
  dauer_geplant       NUMERIC(5,1) DEFAULT 0,  -- Stunden
  status              VARCHAR(30) DEFAULT 'offen',  -- 'offen','in_bearbeitung','abgeschlossen'
  fertig              BOOLEAN DEFAULT false,
  fertig_zeit         TIMESTAMPTZ,
  fotos_erforderlich  BOOLEAN DEFAULT false,
  UNIQUE(order_id, step_key)
);

CREATE TABLE checklist_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_step_id   UUID NOT NULL REFERENCES order_steps(id) ON DELETE CASCADE,
  text            VARCHAR(500) NOT NULL,
  kat             VARCHAR(20) NOT NULL DEFAULT 'pflicht',  -- 'pflicht','optional','foto'
  erledigt        BOOLEAN NOT NULL DEFAULT false,
  quelle          VARCHAR(50),    -- 'template','manuell'
  reihenfolge     INTEGER DEFAULT 0
);
```

**Fertig wenn:**
- Migration läuft durch
- CASCADE-Test: Auftrag löschen → order_steps weg → checklist_items weg
- UNIQUE-Constraint auf (order_id, step_key) getestet

---

### TICKET-011 — Tabellen: Bewegungsdaten (Zeiten, Kommentare, Dateien)

**Aufwand:** S
**Abhängig von:** TICKET-009
**Typ:** Schema / Migration

**Migration:**

```sql
CREATE TABLE time_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  step_key        VARCHAR(50),
  mitarbeiter_id  UUID NOT NULL REFERENCES employees(id),
  start_ts        TIMESTAMPTZ NOT NULL,   -- immer ISO, kein 'DD.MM HH:MM'
  end_ts          TIMESTAMPTZ,
  dauer_min       INTEGER,                -- Minuten
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  mitarbeiter_id  UUID NOT NULL REFERENCES employees(id),
  text            TEXT NOT NULL,
  ist_frage       BOOLEAN NOT NULL DEFAULT false,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comment_reads (
  comment_id      UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  mitarbeiter_id  UUID NOT NULL REFERENCES employees(id),
  gelesen_ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, mitarbeiter_id)
);

CREATE TABLE files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name              VARCHAR(500) NOT NULL,
  mime_type         VARCHAR(100),
  url               VARCHAR(2000) NOT NULL,  -- Filestore-Pfad, kein Base64
  groesse_bytes     BIGINT,
  quelle            VARCHAR(50),    -- 'auftrag','produktion','foto'
  hochgeladen_von   UUID REFERENCES employees(id),
  ts                TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Fertig wenn:**
- Migration läuft durch
- `comment_reads`-Tabelle vorhanden (Read-Status pro Nutzer — neu vs. CC Intern)
- `files.url` als Pfad-String (kein Base64-Feld vorhanden)

---

### TICKET-012 — Tabellen: Restliche Module (Urlaub, Lager, Benachrichtigungen)

**Aufwand:** S
**Abhängig von:** TICKET-006
**Typ:** Schema / Migration

**Migration:**

```sql
CREATE TABLE absences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id  UUID NOT NULL REFERENCES employees(id),
  typ             VARCHAR(30) NOT NULL,  -- 'urlaub','abwesenheit','krank','bildung'
  von             DATE NOT NULL,
  bis             DATE NOT NULL,
  notiz           TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'offen',  -- 'offen','genehmigt','abgelehnt'
  genehmigt_von   UUID REFERENCES employees(id),
  erstellt        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  art       VARCHAR(300) NOT NULL,
  kat       VARCHAR(50),    -- 'folie','laminat','reinigung','werkzeug','farbe'
  nr        VARCHAR(100),   -- Materialnummer
  einheit   VARCHAR(20),    -- 'lfm','Fl.','Stk','Pk.'
  bestand   NUMERIC(10,2) NOT NULL DEFAULT 0,
  mindest   NUMERIC(10,2) NOT NULL DEFAULT 0,
  bestellt  BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ             VARCHAR(50),        -- 'schritt_fertig','kommentar','auftrag_neu',...
  referenz_id     UUID,               -- order_id oder step_id etc.
  referenz_typ    VARCHAR(50),        -- 'order','step','absence'
  empfaenger_id   UUID REFERENCES employees(id),
  text            TEXT,
  gelesen         BOOLEAN NOT NULL DEFAULT false,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fusa_termine (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datum       DATE NOT NULL,
  titel       VARCHAR(500),
  depot       VARCHAR(200),
  monteur_id  UUID REFERENCES employees(id),
  status      VARCHAR(30) DEFAULT 'offen',
  order_id    UUID REFERENCES orders(id)   -- nullable: FUSA ohne CC-Auftrag
);
```

**Fertig wenn:**
- Migration läuft durch
- Alle FKs korrekt (nullable wo nötig)
- `order_id` in `fusa_termine` ist nullable getestet

---

## BLOCK 1.3 — AUTH BACKEND

---

### TICKET-013 — Passwort-Hashing + User anlegen (CLI)

**Aufwand:** S
**Abhängig von:** TICKET-007
**Typ:** Backend-Logik

**Aufgabe:**
Service-Funktion für Passwort-Hashing. Kein UI nötig — ein CLI-Script reicht zum Anlegen.

```javascript
// backend/src/services/auth.service.js

// bcrypt mit mindestens 12 Rounds
async hashPassword(plaintext)  → hash
async verifyPassword(plaintext, hash) → boolean
async createUser(employeeId, email, password) → user
```

```bash
# CLI-Script: backend/scripts/create-user.js
node scripts/create-user.js --email celal@cc-werbung.de --kuerzel CE
# → fragt Passwort interaktiv ab (nie als Argument!)
# → legt User in DB an
```

**Fertig wenn:**
- `hashPassword()` gibt niemals Klartext zurück
- `verifyPassword()` gibt `false` bei falschem Passwort
- `create-user.js` läuft, legt User an, gibt UUID aus
- Test: gleiches Passwort zweimal hashen → unterschiedliche Hashes (bcrypt-Salt)

---

### TICKET-014 — Login-Endpunkt: POST /api/v1/auth/login

**Aufwand:** S
**Abhängig von:** TICKET-013
**Typ:** API-Endpunkt

**Request:**
```json
POST /api/v1/auth/login
{
  "email": "celal@cc-werbung.de",
  "password": "..."
}
```

**Response (Erfolg 200):**
```json
{
  "data": {
    "access_token":  "eyJ...",    // JWT, 15 Minuten gültig
    "refresh_token": "eyJ...",    // JWT, 7 Tage gültig
    "user": {
      "id":      "uuid",
      "name":    "Celal",
      "kuerzel": "CE",
      "rolle":   "admin",
      "farbe":   "#1565C0"
    }
  }
}
```

**Response (Fehler 401):**
```json
{
  "error": { "code": "AUTH_INVALID", "message": "E-Mail oder Passwort falsch" }
}
```

**Fertig wenn:**
- Erfolgreicher Login gibt Access + Refresh Token zurück
- Falsches Passwort → immer 401 (keine Info welches Feld falsch)
- Nicht-existente E-Mail → selbe Fehlermeldung (kein User-Enumeration)
- Brute-Force: nach 5 Fehlversuchen innerhalb 1 Min → 429 Too Many Requests
- `letzter_login` in `users`-Tabelle wird aktualisiert

---

### TICKET-015 — Auth-Middleware (JWT prüfen)

**Aufwand:** S
**Abhängig von:** TICKET-014
**Typ:** Middleware

**Aufgabe:**
Middleware die auf allen geschützten Routen läuft.

```javascript
// backend/src/middleware/auth.middleware.js

async function requireAuth(req, res, next) {
  // 1. Header lesen: Authorization: Bearer <token>
  // 2. Token verifizieren (Signatur + Ablaufzeit)
  // 3. User aus DB laden
  // 4. req.user = { id, name, kuerzel, rolle, farbe } setzen
  // 5. next() aufrufen
  // Bei Fehler: 401 zurückgeben
}

function requireRole(...rollen) {
  // Prüft req.user.rolle gegen erlaubte Rollen
  // Bei Fehler: 403 Forbidden
}
```

**Verwendung:**
```javascript
router.get('/orders', requireAuth, requireRole('admin','produktion'), handler)
router.post('/auth/login', handler)  // ← keine Auth-Middleware!
```

**Fertig wenn:**
- Request ohne Token → 401
- Request mit abgelaufenem Token → 401 mit Code `TOKEN_EXPIRED`
- Request mit falscher Rolle → 403
- Request mit gültigem Token → `req.user` korrekt befüllt
- Unit-Tests für alle Fälle

---

### TICKET-016 — Token-Refresh: POST /api/v1/auth/refresh

**Aufwand:** S
**Abhängig von:** TICKET-015
**Typ:** API-Endpunkt

**Aufgabe:**
Access Token läuft nach 15 Min ab. Refresh Token ermöglicht neuen Access Token ohne erneutes Login.

```
POST /api/v1/auth/refresh
Body: { "refresh_token": "eyJ..." }

Response 200: { data: { access_token: "eyJ..." } }
Response 401: Token ungültig oder abgelaufen → neu einloggen
```

**Fertig wenn:**
- Gültiger Refresh Token → neuer Access Token
- Ungültiger / abgelaufener Refresh Token → 401
- Refresh Token wird nach Nutzung invalidiert (kein Token-Reuse)
- Frontend kann transparentes Token-Refresh implementieren

---

### TICKET-017 — Logout: POST /api/v1/auth/logout

**Aufwand:** XS
**Abhängig von:** TICKET-016
**Typ:** API-Endpunkt

```
POST /api/v1/auth/logout
Header: Authorization: Bearer <access_token>

→ Refresh Token aus DB löschen
→ Response 200: { data: { ok: true } }
```

**Fertig wenn:**
- Nach Logout ist Refresh Token in DB gelöscht
- Altes Refresh Token → 401 bei erneutem Versuch
- Automatischer Logout nach Inaktivität: Frontend-Aufgabe (Token läuft ab)

---

## BLOCK 1.4 — API GRUNDSTRUKTUR

---

### TICKET-018 — API-Server aufsetzen + Basis-Middleware

**Aufwand:** S
**Abhängig von:** TICKET-003
**Typ:** Setup

**Aufgabe:**
Express/Fastify-Server mit den Standard-Middlewares konfigurieren.

```javascript
// Middleware-Stack (in dieser Reihenfolge):
app.use(helmet())           // Security-Header
app.use(cors({...}))        // CORS für Frontend-Origin
app.use(express.json())     // JSON-Body-Parser
app.use(rateLimit({...}))   // Rate Limiting global
app.use(requestLogger)      // Request-Log: Methode, Pfad, Status, Dauer

// Routen-Präfix
app.use('/api/v1', router)

// Fehler-Handler (muss als letzter registriert werden)
app.use(errorHandler)
```

**Fertig wenn:**
- Server startet ohne Fehler
- `GET /api/v1/ping` gibt `{ ok: true, ts: "...", version: "1.0.0" }` zurück
- Nicht-existenter Pfad → 404 mit `{ error: { code: "NOT_FOUND" } }`
- CORS korrekt konfiguriert (Frontend-Origin erlaubt)
- Security-Header gesetzt (`X-Content-Type-Options`, `X-Frame-Options` etc.)

---

### TICKET-019 — Standardisiertes Antwort- und Fehlerformat

**Aufwand:** XS
**Abhängig von:** TICKET-018
**Typ:** Setup / Konvention

**Aufgabe:**
Helper-Funktionen die jede Route benutzt. Kein Endpoint darf eigenes Format erfinden.

```javascript
// backend/src/utils/response.js

function ok(res, data, meta = {}) {
  return res.json({
    data,
    meta: { ts: new Date().toISOString(), version: '1', ...meta }
  });
}

function fail(res, status, code, message, details = null) {
  return res.status(status).json({
    error: { code, message, ...(details ? { details } : {}) }
  });
}

// Standard-Fehlercodes:
const ERROR_CODES = {
  AUTH_INVALID:     401,   // Falsche Credentials
  TOKEN_EXPIRED:    401,   // Token abgelaufen
  FORBIDDEN:        403,   // Keine Berechtigung
  NOT_FOUND:        404,   // Ressource nicht gefunden
  VALIDATION_FAIL:  422,   // Eingabefehler
  INTERNAL:         500,   // Unerwarteter Fehler
};
```

**Fertig wenn:**
- Alle bestehenden Endpunkte nutzen `ok()` / `fail()`
- Kein `res.json({...})` ohne diese Helper
- Fehler im Server → niemals Stack-Trace in der Response (nur in Logs)

---

### TICKET-020 — SSE-Endpunkt: GET /api/v1/events

**Aufwand:** S
**Abhängig von:** TICKET-015, TICKET-018
**Typ:** API-Endpunkt

**Warum:**
CC Intern nutzt SSE für Live-Updates (Datenänderungen, Notifications).
Dieses Konzept wird übernommen — aber mit Auth-Prüfung.

```javascript
// GET /api/v1/events
// Header: Authorization: Bearer <token>
// → Server-Sent Events Stream

// Events die gesendet werden:
// type: 'connected'          → beim Verbindungsaufbau
// type: 'order_updated'      → Auftrag geändert
// type: 'step_completed'     → Schritt abgeschlossen
// type: 'notification'       → neue Benachrichtigung
// type: 'heartbeat'          → alle 25s (verhindert Timeout)
```

**Fertig wenn:**
- Verbindung aufbauen → `connected`-Event empfangen
- Auth-Prüfung: ohne Token → 401 (kein SSE-Stream)
- Heartbeat alle 25 Sekunden
- Client trennt → wird aus Client-Liste entfernt
- `sseNotify(type, payload)` Funktion intern verfügbar (wird von anderen Services genutzt)

---

### TICKET-021 — Input-Validierung (Schema-Validation)

**Aufwand:** S
**Abhängig von:** TICKET-018
**Typ:** Setup / Middleware

**Aufgabe:**
Validation-Library konfigurieren (z.B. `zod`, `joi`, oder `express-validator`).
Kein Endpunkt vertraut rohen Request-Daten.

```javascript
// Beispiel mit zod:
const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
});

// Middleware:
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return fail(res, 422, 'VALIDATION_FAIL', 'Eingabefehler', result.error.issues);
    }
    req.body = result.data;  // sanitized
    next();
  };
}

// Verwendung:
router.post('/auth/login', validate(loginSchema), loginHandler);
```

**Fertig wenn:**
- Validation-Middleware existiert
- Falscher Input → 422 mit Fehlerliste
- Gültiger Input → `req.body` ist typsicher
- Mindestens Login-Schema und Employee-Schema implementiert

---

## BLOCK 1.5 — DESIGN-SYSTEM FRONTEND

---

### TICKET-022 — Frontend-Projekt aufsetzen + CSS-Variablen

**Aufwand:** S
**Abhängig von:** TICKET-003
**Typ:** Setup

**Aufgabe:**
Frontend-Projekt initialisieren (Vue 3 / React — nach TICKET-001).
CSS-Variablen aus CC Intern übernehmen.

```css
/* src/styles/variables.css */
:root {
  /* Farben — aus CC Intern übernommen (Team kennt sie) */
  --blue:     #1565C0;
  --blue-l:   #E3F2FD;
  --green:    #2E7D32;
  --green-l:  #E8F5E9;
  --amber:    #E65100;
  --amber-l:  #FFF3E0;
  --red:      #C62828;
  --red-l:    #FFEBEE;
  --purple:   #7C3AED;
  --purple-l: #F5F3FF;

  /* Neutrale */
  --text:     #1C1C1E;
  --text2:    #6C6C70;
  --text3:    #AEAEB2;
  --border:   #E5E5EA;
  --gray-l:   #F2F2F7;
  --white:    #FFFFFF;

  /* Typografie */
  --font:     -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', monospace;

  /* Abstände */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* Radien */
  --radius-s: 6px;
  --radius-m: 10px;
  --radius-l: 16px;

  /* Schatten */
  --shadow-s: 0 1px 3px rgba(0,0,0,.08);
  --shadow-m: 0 4px 16px rgba(0,0,0,.10);
}
```

**Fertig wenn:**
- Frontend-Projekt startet (`npm run dev`)
- CSS-Variablen importiert und in Browser-DevTools sichtbar
- Keine Inline-Styles in Komponenten (Linting-Regel konfiguriert)

---

### TICKET-023 — Basis-Komponenten: Button + Badge

**Aufwand:** S
**Abhängig von:** TICKET-022
**Typ:** UI-Komponente

**Aufgabe:**
Zwei meistgenutzte Komponenten. Alles andere baut darauf auf.

```
Button-Varianten:
  primary    → blau, für Haupt-Aktionen
  secondary  → grau, für Neben-Aktionen
  danger     → rot, für Löschen/Irreversibles
  ghost      → transparent, für Inline-Aktionen
  icon       → nur Icon, quadratisch

  Größen: sm | md (default) | lg
  States: normal | loading | disabled

Badge-Varianten (Status-Farben aus CC Intern):
  success    → grün  (abgeschlossen, bezahlt)
  warning    → amber (in Arbeit, offen)
  danger     → rot   (dringend, überfällig)
  info       → blau  (neutral)
  neutral    → grau  (archiviert)
```

**Fertig wenn:**
- Alle Button-Varianten und -States visuell korrekt
- Alle Badge-Varianten korrekt
- Komponenten in Isolation testbar (Storybook oder einfache Demo-Seite)
- Keine Inline-Styles

---

### TICKET-024 — Basis-Komponenten: Input + Select + Textarea

**Aufwand:** S
**Abhängig von:** TICKET-022
**Typ:** UI-Komponente

**Aufgabe:**
Formular-Elemente mit einheitlichem Aussehen.

```
Gemeinsame Props:
  label       → Beschriftung über dem Feld
  placeholder → Platzhaltertext
  error       → Fehlermeldung unter dem Feld (rot)
  disabled    → ausgegraut
  required    → Stern-Markierung

Input:
  type: text | number | date | email | password

Select:
  options: [{value, label}]
  clearable: boolean

Textarea:
  rows: number
  maxlength: number (mit Zähler)
```

**Fertig wenn:**
- Alle drei Komponenten mit Error-State visuell korrekt
- Label + Error-Text korrekt verknüpft (Accessibility: `for`/`id`)
- Number-Input: kein Komma-Problem (deutschen Nutzern passiert das — Validierung im Backend)

---

### TICKET-025 — Basis-Komponenten: Card + Modal + Toast

**Aufwand:** M
**Abhängig von:** TICKET-023
**Typ:** UI-Komponente

**Card / Panel:**
```
  Aufbau:   Header (Titel + optionaler Badge) | Body | Footer (optional)
  Variante: default (weißer Hintergrund) | highlighted (farbiger Rand oben)
```

**Modal:**
```
  Props:     title, size (sm/md/lg/fullscreen), closable
  Events:    @close
  Verhalten: Klick auf Backdrop → schließt (wenn closable)
             ESC-Taste → schließt
             Scroll-Lock auf Body wenn offen
  Wichtig:   Kein z-Index-Chaos — Modal immer über allem
```

**Toast:**
```
  Typen:   success | warning | error | info
  Dauer:   auto-close nach 4s (error: kein auto-close)
  Stack:   mehrere Toasts übereinander möglich
  API:     toast.success('Auftrag gespeichert')
           toast.error('Fehler beim Speichern')
```

**Fertig wenn:**
- Card mit farbigem Rand-Variante (wie in CC Intern Panels)
- Modal öffnet/schließt korrekt, ESC funktioniert, kein Body-Scroll
- Toast-Stack funktioniert (mehrere gleichzeitig)

---

### TICKET-026 — Basis-Komponenten: Tabelle + Tabs

**Aufwand:** S
**Abhängig von:** TICKET-022
**Typ:** UI-Komponente

**Tabelle:**
```
  Props:
    columns: [{key, label, sortable, width}]
    rows:    Array of objects
    loading: boolean (Skeleton-Loader)
    empty:   Slot für "Keine Einträge"-Zustand

  Features:
    Klickbare Zeilen (onclick-Event)
    Sticky Header bei langem Inhalt
    Keine Virtualisierung nötig (Aufträge selten > 200)
```

**Tabs:**
```
  Props:    tabs: [{key, label, badge?}]
  Events:   @change(key)
  Variante: underline (default) | pills
```

**Fertig wenn:**
- Tabelle mit leerem Zustand (kein "undefined" oder leere Zelle)
- Tabelle mit Loading-State (Skeleton-Rows)
- Tabs mit Badge-Count (für "Rechnung offen: 3")

---

### TICKET-027 — App-Shell (Layout + Navigation)

**Aufwand:** M
**Abhängig von:** TICKET-025, TICKET-026
**Typ:** UI-Layout

**Aufgabe:**
Das Grundgerüst der App in dem alle Seiten eingebettet werden.

```
Layout:
  ┌─────────────────────────────────────────────────┐
  │  Topbar: Logo | [Seiten-Titel]    [Notif] [MA]  │
  ├──────────┬──────────────────────────────────────┤
  │          │                                       │
  │ Sidebar  │  <router-view>                        │
  │ (220px)  │  (Seiteninhalt)                       │
  │          │                                       │
  └──────────┴──────────────────────────────────────┘

Sidebar-Menüpunkte (nach Priorität):
  🏠 Dashboard
  📋 Aufträge
  🏭 Produktion (Kanban)
  👥 Kunden
  💶 Rechnungen
  📦 Lager
  🏖 Urlaub
  👤 Mitarbeiter
  ⚙️ Einstellungen (nur admin)

Mobile:
  Sidebar als Drawer (ausklappbar)
  Hamburger-Menü in Topbar
```

**Fertig wenn:**
- Layout responsiv (Desktop Sidebar, Mobile Drawer)
- Aktive Seite in Navigation hervorgehoben
- Benutzer-Avatar in Topbar (Name + Kürzel aus `req.user`)
- Logout-Button zugänglich
- Platzhalter-Seiten für alle Menüpunkte (leere Seite mit Titel)

---

### TICKET-028 — Login-Seite (Frontend)

**Aufwand:** S
**Abhängig von:** TICKET-014, TICKET-027
**Typ:** Seite

**Aufgabe:**
Einzige Seite ohne App-Shell. Wird angezeigt wenn kein Token vorhanden.

```
Aufbau:
  CC-Logo / Firmenname
  E-Mail-Feld
  Passwort-Feld (show/hide Toggle)
  "Anmelden"-Button (loading-State während Request)
  Fehlermeldung bei falschem Login

Verhalten:
  - Gültiger Login → Token speichern (httpOnly-Cookie oder memory) → weiterleiten
  - Ungültiger Login → Fehler anzeigen, Felder nicht leeren
  - Enter-Taste → Login absenden
  - Nach Logout → wieder auf Login-Seite
```

**Fertig wenn:**
- Login mit gültigen Credentials → weiterleitung zu Dashboard
- Falsches Passwort → klare Fehlermeldung
- Loading-State während Request (Button disabled)
- Token wird sicher gespeichert (kein localStorage für Tokens)

---

## TICKET-ÜBERSICHT: PHASE 1

| Ticket | Titel | Aufwand | Abhängig von | Block |
|---|---|---|---|---|
| TICKET-001 | Tech-Stack festlegen | XS | — | 0 |
| TICKET-002 | Rollen und Berechtigungen definieren | XS | 001 | 0 |
| TICKET-003 | Repository und Ordnerstruktur | S | 001 | 1.1 |
| TICKET-004 | Docker Compose (lokale Umgebung) | S | 003 | 1.1 |
| TICKET-005 | Migrations-System aufsetzen | S | 004 | 1.1 |
| TICKET-006 | Tabelle: employees + Seed-Daten | S | 005 | 1.2 |
| TICKET-007 | Tabelle: users + refresh_tokens | S | 006 | 1.2 |
| TICKET-008 | Tabelle: customers + activities | S | 005 | 1.2 |
| TICKET-009 | Tabelle: orders (Kern) | M | 006, 008 | 1.2 |
| TICKET-010 | Tabellen: order_steps + checklist_items | S | 009 | 1.2 |
| TICKET-011 | Tabellen: time_entries, comments, files | S | 009 | 1.2 |
| TICKET-012 | Tabellen: absences, inventory, notifications, fusa_termine | S | 006 | 1.2 |
| TICKET-013 | Passwort-Hashing + User anlegen (CLI) | S | 007 | 1.3 |
| TICKET-014 | Login-Endpunkt POST /auth/login | S | 013 | 1.3 |
| TICKET-015 | Auth-Middleware (JWT prüfen) | S | 014 | 1.3 |
| TICKET-016 | Token-Refresh POST /auth/refresh | S | 015 | 1.3 |
| TICKET-017 | Logout POST /auth/logout | XS | 016 | 1.3 |
| TICKET-018 | API-Server + Basis-Middleware | S | 003 | 1.4 |
| TICKET-019 | Standardisiertes Antwort- und Fehlerformat | XS | 018 | 1.4 |
| TICKET-020 | SSE-Endpunkt GET /api/v1/events | S | 015, 018 | 1.4 |
| TICKET-021 | Input-Validierung (Schema-Validation) | S | 018 | 1.4 |
| TICKET-022 | Frontend-Setup + CSS-Variablen | S | 003 | 1.5 |
| TICKET-023 | Komponenten: Button + Badge | S | 022 | 1.5 |
| TICKET-024 | Komponenten: Input + Select + Textarea | S | 022 | 1.5 |
| TICKET-025 | Komponenten: Card + Modal + Toast | M | 023 | 1.5 |
| TICKET-026 | Komponenten: Tabelle + Tabs | S | 022 | 1.5 |
| TICKET-027 | App-Shell (Layout + Navigation) | M | 025, 026 | 1.5 |
| TICKET-028 | Login-Seite (Frontend) | S | 014, 027 | 1.5 |

**Gesamtaufwand Phase 1:**
```
XS (halber Tag) × 5 = 2,5 Tage
S  (1 Tag)      × 18 = 18 Tage
M  (2 Tage)     × 5 = 10 Tage
─────────────────────────────
Gesamt:          ~30 Tage (1 Entwickler)
                 ~15 Tage (2 Entwickler parallel)
```

---

## PARALLELE ARBEITSPAKETE

```
Schiene A — Backend (DB + Auth + API):
  001 → 003 → 004 → 005
                         → 006 → 007 → 013 → 014 → 015 → 016 → 017
                         → 008
                         → 009 → 010
                                → 011
                         → 012
  003 → 018 → 019
            → 020 (wartet auf 015)
            → 021

Schiene B — Frontend (parallel zu Backend ab 003):
  001 → 003 → 022 → 023 → 025 → 027 → 028 (wartet auf 014)
                  → 024
                  → 026
```

**Alles was Phase 2 braucht:**
```
✓ TICKET-006 (employees in DB)
✓ TICKET-015 (Auth-Middleware läuft)
✓ TICKET-018 (API-Server läuft)
✓ TICKET-019 (Antwortformat)
✓ TICKET-027 (App-Shell)
→ Dann kann Phase 2 (Mitarbeiter-UI + Kunden-UI) beginnen
```
