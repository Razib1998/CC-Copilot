# Soll/Ist-Mapping-Matrix — CC Intern → Cockpit
**Erstellt nach zweiter Read-Only-Runde (echte schema.sql + echte routes)**
**Datum:** 2026-04-17

---

## 1. firmen-Tabelle — IST-Spalten (verifiziert aus schema.sql)

| Spalte | Typ | Vorhanden? |
|---|---|---|
| id | TEXT PK | ✅ |
| name | TEXT NOT NULL | ✅ |
| kundennummer | TEXT | ✅ |
| altnummer | TEXT | ✅ |
| typ | TEXT | ✅ |
| intern_extern | TEXT | ✅ |
| umsatzsteuer_id | TEXT | ✅ |
| **strasse** | TEXT | ✅ ← heißt STRASSE, nicht "adresse"! |
| plz | TEXT | ✅ |
| stadt | TEXT | ✅ |
| land | TEXT DEFAULT 'Deutschland' | ✅ |
| telefon | TEXT | ✅ |
| email | TEXT | ✅ |
| website | TEXT | ✅ |
| ansprechpartner_anrede | TEXT | ✅ |
| ansprechpartner_vorname | TEXT | ✅ |
| ansprechpartner_nachname | TEXT | ✅ |
| ansprechpartner_email | TEXT | ✅ |
| ansprechpartner_telefon | TEXT | ✅ |
| **interne_notiz** | TEXT | ✅ ← heißt INTERNE_NOTIZ, nicht "notiz"! |
| status | TEXT | ✅ |
| erweiterung_json | TEXT | ✅ |
| created_at | TEXT | ✅ |
| updated_at | — | ❌ NICHT vorhanden! |

## 2. ccintern_kunden_extra — IST-Spalten (verifiziert)

| Spalte | Vorhanden? |
|---|---|
| firma_id TEXT PK (FK → firmen.id) | ✅ |
| crm_status TEXT | ✅ |
| betreuer TEXT | ✅ |
| updated_at TEXT | ✅ (heißt hier ccintern_updated_at im API) |
| **apFunktion / branche / umsatz / auftragsvolumen / fahrzeuge / letzterKontakt / naechsteAktion** | ❌ FEHLEN ALLE |

---

## 3. Vollständige Feld-Mapping-Tabelle (kunden.json → Ziel)

| CC Intern Feld | Beispielwert | Ziel-Tabelle | Ziel-Spalte | Status | Problem |
|---|---|---|---|---|---|
| key (Object-Key) | `"Ruhrbahn"` | — | — | ⚠️ VERWERFEN | Fachlicher Key, nicht als DB-Feld speichern. Name ist in `name`. |
| `name` | `"Ruhrbahn GmbH"` | firmen | `name` | ✅ OK | — |
| `ap` | `"Hr. Bergmann"` | firmen | `ansprechpartner_anrede` + `ansprechpartner_nachname` | ⚠️ SPLIT | "Hr. Bergmann" → anrede="Hr.", nachname="Bergmann" |
| `ap` | `"Fr. Weber"` | firmen | `ansprechpartner_anrede` + `ansprechpartner_nachname` | ⚠️ SPLIT | "Fr." → anrede, "Weber" → nachname |
| `apFunktion` | `"Leiter Fuhrpark"` | ccintern_kunden_extra | `ap_funktion` (NEU) | ❌ SPALTE FEHLT | Braucht ALTER TABLE |
| `tel` | `"+49 201 826-1200"` | firmen | `telefon` | ✅ OK | — |
| `mail` | `"bergmann@ruhrbahn.de"` | firmen | `email` | ✅ OK | — |
| `adresse` | `"Schildsehe 69"` | firmen | **`strasse`** | ❌ FALSCHER NAME | Mein Script verwendete "adresse" — Spalte heißt "strasse" |
| `plz` | `"45127"` | firmen | `plz` | ✅ OK | — |
| `stadt` | `"Essen"` | firmen | `stadt` | ✅ OK | — |
| `branche` | `"ÖPNV"` | ccintern_kunden_extra | `branche` (NEU) | ❌ SPALTE FEHLT | Braucht ALTER TABLE |
| `umsatz` | `"€ 128.400"` | ccintern_kunden_extra | `umsatz` (NEU) | ❌ SPALTE FEHLT | TEXT (€-Format aus CC Intern) |
| `auftragsvolumen` | `12` | ccintern_kunden_extra | `auftragsvolumen` (NEU) | ❌ SPALTE FEHLT | INTEGER |
| `fahrzeuge` | `48` | ccintern_kunden_extra | `fahrzeuge` (NEU) | ❌ SPALTE FEHLT | INTEGER |
| `status` | `"Aktiv"` | firmen | `status` | ✅ OK | — |
| `letzterKontakt` | `"Heute"` / `"12.03"` | ccintern_kunden_extra | `letzter_kontakt` (NEU) | ❌ SPALTE FEHLT | TEXT (kein einheitliches Datumsformat!) |
| `naechsteAktion` | `"Q3-Planung besprechen"` | ccintern_kunden_extra | `naechste_aktion` (NEU) | ❌ SPALTE FEHLT | TEXT |
| `notiz` | `"Jahresvertrag bis 12/2026"` | firmen | **`interne_notiz`** | ❌ FALSCHER NAME | Mein Script verwendete "notiz" — Spalte heißt "interne_notiz" |
| `aktivitaeten[]` | Array | crm_aktivitaeten | (eigene Tabelle) | ✅ OK | Tabelle muss neu erstellt werden |

---

## 4. Aktivitäten-Felder — vollständiges Mapping

| CC Intern Feld | Beispielwert | crm_aktivitaeten Spalte | Status | Entscheidung |
|---|---|---|---|---|
| `id` | `"A001"` | — | ⚠️ NICHT als PK! | "A001" ist NICHT global unique. Mehrere Firmen haben "A001". → UUID generieren, Original in `original_id` |
| `typ` | `"Anruf"`, `"E-Mail"` | `typ` | ✅ OK | direkt |
| `ico` | `"📞"`, `"✉"` | — | ❌ VERWERFEN | Emoji ist Darstellung, nicht Daten. Typ bestimmt Icon im Frontend. |
| `datum` | `"2026-03-21"` | `datum` | ✅ OK | ISO-Format, direkt |
| `zeit` | `"10:00"` | `zeit` | ✅ OK | als TEXT |
| `ma` | `"Muhammet"` | `mitarbeiter_raw` + `mitarbeiter_id` | ⚠️ MAPPING | raw immer speichern; ID via users.name lookup |
| `notiz` | `"Q3 Planung besprochen"` | `notiz` | ✅ OK | direkt |
| `wv` | `"2026-03-25"` / `""` | `wiedervorlage` | ✅ OK | leer = NULL |
| `wvAufgabe` | `"Zahlungseingang prüfen"` / `""` | `wv_aufgabe` | ✅ OK | leer = NULL |

---

## 5. ID-Strategie — Korrekte Entscheidung

### firmen.id
- Format: UUID (TEXT) — korrekt, Cockpit verwendet überall randomUUID()
- Strategie: `randomUUID()` beim Import — KEIN deterministischer Hash nötig
- Begründung: kunden.json wird **einmalig** importiert, kein Re-Import geplant
- Falls Re-Import: `INSERT OR REPLACE` mit fixem UUID aus separater Mapping-Datei

### crm_aktivitaeten.id
- ❌ Original-ID ("A001") ist NICHT global unique
- ✅ `randomUUID()` für jeden Eintrag
- Original-ID in `original_id` TEXT Spalte speichern (für Rückverfolgung)

### users.id → MITARBEITER_MAP
- users-Tabelle hat: `id TEXT, name TEXT, email TEXT`
- Matching: `users.name` gegen `aktivitaeten[].ma`
- Vorgehen: **Vor dem Import** `SELECT id, name FROM users;` ausführen → Map aufbauen

---

## 6. API-Endpunkte — IST vs. was mein Bootstrap annahm

| Was Bootstrap annahm | Echter Endpunkt | Status |
|---|---|---|
| `GET /api/v1/orders` | Nicht vorhanden (`/auftraege` auf Root-Level) | ❌ FALSCH |
| `GET /api/v1/employees` | Nicht vorhanden | ❌ FALSCH |
| `GET /api/v1/time-entries` | Nicht vorhanden | ❌ FALSCH |
| `GET /api/v1/absences` | Nicht vorhanden | ❌ FALSCH |
| `GET /api/v1/inventory` | Nicht vorhanden | ❌ FALSCH |
| `GET /api/v1/customers` | Nicht vorhanden | ❌ FALSCH |
| `GET /api/v1/offers` | Nicht vorhanden | ❌ FALSCH |

| Echter Endpunkt | Was er liefert | Status |
|---|---|---|
| `GET /api/v1/firmen` | Alle Firmen (Cockpit) | ✅ VORHANDEN |
| `GET /api/v1/firmen/:id` | Einzelne Firma | ✅ VORHANDEN |
| `POST /api/v1/firmen` | Firma anlegen | ✅ VORHANDEN |
| `PATCH /api/v1/firmen/:id` | Firma aktualisieren | ✅ VORHANDEN |
| `GET /api/v1/ccintern/kunden` | CC Intern Kunden (firmen + extra) | ✅ VORHANDEN |
| `PATCH /api/v1/ccintern/kunden/:id` | CC Intern Extra updaten | ✅ VORHANDEN |
| `GET /api/v1/users` | Benutzer | ✅ VORHANDEN |
| `GET /api/v1/fusa/kunden` | FUSA Kunden | ✅ VORHANDEN |
| `GET /auth/me` | Aktueller User | ✅ VORHANDEN |

**Nicht vorhanden (müssen noch gebaut werden):**
- /auftraege (CC Intern) — derzeit nur FUSA (`requireModule('fusa')`)
- /mitarbeiter / employees
- /anwesenheit / time-entries
- /urlaub / absences
- /lager / inventory
- /angebote CC Intern
- /anfragen / inquiries
- /rechnungen CC Intern
- /crm-aktivitaeten (nach Migration)

---

## 7. Fehler-Zusammenfassung in den alten Skripten

### 01_schema_migration.sql (ALT) — Fehler:
- ❌ Neue Spalten in `firmen` statt `ccintern_kunden_extra` — falsches Tabellen-Design
- ❌ `notiz` statt `interne_notiz` — Spalte falsch benannt
- ❌ `adresse` — Spalte heißt `strasse` in firmen
- ❌ `updated_at` für firmen — existiert nicht

### 02_import_kunden.js (ALT) — Fehler:
- ❌ `adresse` → muss `strasse` heißen
- ❌ `notiz` → muss `interne_notiz` heißen
- ❌ `ansprechpartner_nachname` bekommt "Hr. Bergmann" — muss gesplittet werden
- ❌ `deterministicId()` — unnötige Komplexität, `randomUUID()` reicht
- ❌ crm_aktivitaeten.id = original "A001" — nicht global unique
- ❌ CC Intern extras (branche, umsatz, etc.) werden in firmen gespeichert — falsches Ziel
- ❌ `ico` wird gespeichert — soll verworfen werden

### 03_bootstrap_cockpit.js (ALT) — Fehler:
- ❌ Alle 7 API-Endpunkte falsch (`/orders`, `/employees`, etc.)
- ❌ Korrekter CC Intern Endpunkt: `GET /api/v1/ccintern/kunden`
- ❌ `GET /api/v1/firmen` für Stammdaten (nicht `/customers`)

---

## 8. Korrekte Ziel-Architektur

```
kunden.json
    │
    ├─► firmen (bestehend, minimal erweitern)
    │       name, strasse, plz, stadt, telefon, email,
    │       ansprechpartner_anrede, ansprechpartner_nachname,
    │       interne_notiz, status
    │
    ├─► ccintern_kunden_extra (bestehend, erweitern)
    │       firma_id (FK)
    │       ap_funktion (NEU)
    │       branche (NEU)
    │       umsatz (NEU)
    │       auftragsvolumen (NEU)
    │       fahrzeuge (NEU)
    │       letzter_kontakt (NEU)
    │       naechste_aktion (NEU)
    │
    └─► crm_aktivitaeten (NEU, vollständig)
            id (UUID), kunde_id (FK → firmen.id),
            original_id, typ, datum, zeit,
            mitarbeiter_id (FK → users.id), mitarbeiter_raw,
            notiz, wiedervorlage, wv_aufgabe, created_at
```
