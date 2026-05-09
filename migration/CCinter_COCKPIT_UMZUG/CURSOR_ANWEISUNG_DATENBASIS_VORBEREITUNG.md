# CURSOR ANWEISUNG: Datenbasis für CC Intern → Cockpit Umzug vorbereiten

**Lies zuerst: `CC Cockpit/docs/ARCHITEKTUR_REGEL.md`**  
**Diese Regel ist verbindlich. Baue nichts, was dieser Regel widerspricht.**

---

## ZIEL

Die bestehenden CC Intern Daten (JSON) müssen vollständig und verlustfrei
in die Cockpit-Datenstruktur überführt werden können.

**KEIN direkter Umzug jetzt.**  
**KEIN Import ausführen.**  
Nur vorbereiten, mappen und Struktur schaffen.

---

## TEIL 0 – ARCHITEKTUR LESEN

Lesen:
- CC Intern Daten (kunden.json, auftraege.json etc.)
- Cockpit DB Schema (firmen, angebote etc.)
- vorhandene Tabellen
- vorhandene Adapter

**WICHTIG:**  
`kunden.json` ist **KEIN Array**.  
Es ist ein Objekt mit Firmennamen als Keys:

```json
{
  "Ruhrbahn": { ... },
  "DVG": { ... }
}
```

Diese Keys müssen als Daten interpretiert werden — nicht verlieren.

**Ziel:** vollständiges Verständnis beider Datenwelten

---

## TEIL 1 – FELD-MAPPING DEFINIEREN (PFLICHT)

Mapping erstellen: CC Intern → Cockpit

| CC Intern Feld | Cockpit Zielfeld | Hinweis |
|---|---|---|
| `name` (Key, z. B. "Ruhrbahn") | `firmen.name` | Basis für UUID-Generierung |
| `ap` | `ansprechpartner` | |
| `apFunktion` | `ansprechpartnerFunktion` | neu ergänzen falls fehlt |
| `tel` | `telefon` | |
| `mail` | `email` | |
| `plz` | `plz` | |
| `stadt` | `stadt` | |
| `branche` | `branche` | neu ergänzen falls fehlt |
| `umsatz` | `umsatz` | optional |
| `auftragsvolumen` | `auftragsvolumen` | optional |
| `fahrzeuge` | `fahrzeuge` | optional |
| `status` | `status` | |
| `letzterKontakt` | `letzterKontakt` | neu ergänzen falls fehlt |
| `naechsteAktion` | `naechsteAktion` | neu ergänzen falls fehlt |
| `notiz` | `notiz` | neu ergänzen falls fehlt |
| `aktivitaeten[]` | → `crm_aktivitaeten` | NICHT in firmen speichern |

**WICHTIG:**  
- `aktivitaeten[]` gehört in separate Tabelle `crm_aktivitaeten`
- Kein Feld darf verloren gehen

---

## TEIL 2 – ZIELSTRUKTUR FESTLEGEN

**ENTSCHEIDUNG:**  
✔ Kunden werden in `firmen`-Tabelle gespeichert

**WICHTIG:**
- `firmen`-Tabelle existiert bereits im Cockpit-Schema
- diese Tabelle **NICHT neu erstellen**
- vor Änderungen **IMMER** bestehende Struktur lesen

**Ergänzen (falls nicht vorhanden):**
- `ansprechpartnerFunktion`
- `branche`
- `letzterKontakt`
- `naechsteAktion`
- `notiz`
- `umsatz` (optional)
- `auftragsvolumen` (optional)
- `fahrzeuge` (optional)

**Ziel:** bestehende Tabelle erweitern, nicht ersetzen

---

## TEIL 3 – CRM AKTIVITÄTEN TABELLE

Neue Tabelle definieren: `crm_aktivitaeten`

| Feld | Typ | Hinweis |
|---|---|---|
| `id` | TEXT PRIMARY KEY | UUID |
| `kundeId` | TEXT NOT NULL | FK → firmen.id |
| `typ` | TEXT | z. B. Anruf, Meeting, E-Mail |
| `datum` | TEXT | ISO-Datum |
| `mitarbeiterId` | TEXT | FK → users.id |
| `notiz` | TEXT | |
| `wiedervorlage` | TEXT | ISO-Datum oder leer |
| `created_at` | TEXT | DEFAULT datetime('now') |

**WICHTIG:**
- `aktivitaeten[]` aus JSON wird hier gespeichert
- KEIN Speichern als JSON-Blob im Kunden-Datensatz
- echte relationale Struktur mit Fremdschlüsseln

---

## TEIL 4 – ID-STRATEGIE

**Problem:**  
Kunden sind aktuell als Name-Key gespeichert (`"Ruhrbahn"`)

**Lösung:**
- für jeden Kunden UUID generieren
- UUID als `kundeId` verwenden
- Name dient nur als Attribut, nicht als Schlüssel

**WICHTIG:**
- alle Beziehungen laufen über IDs
- niemals über Namen

---

## TEIL 5 – IMPORT-SKRIPT VORBEREITEN

**Noch NICHT ausführen — nur konzipieren.**

Script soll:

1. `kunden.json` lesen (Objekt, nicht Array!)
2. Key → `name` übernehmen
3. UUID generieren
4. Felder mappen (siehe Mapping-Tabelle Teil 1)
5. `aktivitaeten[]` extrahieren und in `crm_aktivitaeten` überführen

**WICHTIG — Import-Reihenfolge:**

```
1. firmen            (zuerst, weil FK-Basis)
2. crm_aktivitaeten  (danach, wegen FK auf firmen.id)
```

---

## TEIL 6 – BACKEND LÜCKEN ANALYSIEREN

**Nur dokumentieren — nicht bauen:**

Fehlende Bereiche für vollständige CC Intern Integration:

- Angebote (CC Intern) → Route fehlt
- CRM / Anfragen → Route fehlt
- Rechnungen → Route fehlt
- Mitarbeiter → Route fehlt
- Urlaub → Route fehlt
- Lager → Route fehlt
- Produktion → Route fehlt

---

## TEIL 7 – ROUTING FIX VORMERKEN

**Problem:**  
`kunden`-Router nutzt aktuell:
```js
requireModule('fusa')
```

**Soll sein:**
```js
requireModule('ccintern')
```

**Nur dokumentieren — noch nicht ändern.**

---

## CHECKLISTE

- [ ] `ARCHITEKTUR_REGEL.md` vorher gelesen
- [ ] `kunden.json` Struktur verstanden (Objekt, keine Liste)
- [ ] alle Felder gemappt — kein Datenverlust möglich
- [ ] `aktivitaeten[]` korrekt in `crm_aktivitaeten` ausgelagert
- [ ] `firmen`-Tabelle geprüft (nicht neu gebaut)
- [ ] CRM-Struktur definiert (inkl. FK auf firmen + users)
- [ ] ID-System definiert (UUID statt Name-Key)
- [ ] Import-Reihenfolge definiert (firmen → crm_aktivitaeten)
- [ ] Backend-Lücken dokumentiert
- [ ] Routing-Problem vorgemerkt

---

## AUSGABE (von Cursor erwartet)

1. Vollständige Mapping-Tabelle
2. Finale Zielstruktur (firmen-Erweiterung + crm_aktivitaeten)
3. CRM-Aktivitäten Struktur inkl. FK-Definition
4. Import-Konzept inkl. Reihenfolge
5. Liste offener Backend-Module

**WICHTIG: Keine Implementierung — nur Vorbereitung.**
