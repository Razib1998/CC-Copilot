# MIGRATION_DESIGN.md — CC Intern -> Cockpit (Read-Only Design)

## 1. Einleitung

Dieses Dokument beschreibt das fachliche und technische Design fuer einen spaeteren, verlustfreien Datenumzug von CC Intern nach Cockpit.

Zweck:
- Vorbereitung einer strukturierten Implementierung ohne Datenverlust
- Transparente Definition von Quellstruktur, Zielstruktur, Mapping, ID-Strategie und Risiken
- Grundlage fuer spaetere Umsetzung in Migrationen und Importskripten

Hinweis:
- Dieses Dokument basiert ausschliesslich auf Read-Only-Analyse des aktuellen Bestands.
- Es werden keine Systemaenderungen vorgenommen.
- Es werden keine Daten importiert oder transformiert.

## 2. Quelldaten

Bekannte Quellen:
- `kunden.json` (Object-Struktur, Key = Firmenname)
- `auftraege.json`
- `cc-intern-snapshot.json` (falls aktuell genutzt)

Status der Quellen:
- **Bestaetigt vorhanden im aktuellen Workspace:** `cc-intern-snapshot.json`
- **Nicht direkt im Workspace gefunden, aber fachlich als Quelle vorgegeben/dokumentiert:** `kunden.json`, `auftraege.json`
- **Annahme-Kennzeichnung:** Die finale Importlogik wird auf `kunden.json` als Objektquelle ausgelegt, auch wenn diese Datei im aktuellen Workspace-Stand nicht direkt vorlag.

## 3. Datenstruktur CC Intern

### 3.1 kunden.json (fachliche Soll-Quelle)

Struktur:
- Top-Level ist ein Objekt (kein Array)
- Jeder Key repraesentiert den Firmennamen (z. B. `Ruhrbahn`, `DVG`)
- Der Key ist Dateninhalt und muss als `name` erhalten bleiben

Pro Kunde erwartete Felder:
- `ap`
- `apFunktion`
- `tel`
- `mail`
- `plz`
- `stadt`
- `branche`
- `umsatz`
- `auftragsvolumen`
- `fahrzeuge`
- `status`
- `letzterKontakt`
- `naechsteAktion`
- `notiz`
- `aktivitaeten[]`

### 3.2 aktivitaeten[] (pro Kunde)

`aktivitaeten[]` wird als eigenstaendige, relationale Aktivitaetsliste behandelt und nicht in der Kundentabelle als JSON abgelegt.

Erwartete Felder je Aktivitaet:
- `typ`
- `datum`
- `mitarbeiter` (spaeter auf `users.id` aufloesen, sofern moeglich)
- `notiz`
- `wiedervorlage`

## 4. Zielstruktur Cockpit

### 4.1 `firmen` (bestehende Tabelle)

Die Tabelle `firmen` existiert bereits im Cockpit-Schema und bleibt die zentrale Stammdatenquelle fuer Firmen/Kunden.

Vorhandene Kernfelder (Auszug):
- `id`
- `name`
- `telefon`
- `email`
- `plz`
- `stadt`
- `status`
- `interne_notiz`
- `erweiterung_json`

Notwendige Erweiterungen fuer den CC-Intern-Umzug:
- `ansprechpartner_funktion`
- `branche`
- `letzter_kontakt`
- `naechste_aktion`
- `notiz`
- `umsatz` (optional)
- `auftragsvolumen` (optional)
- `fahrzeuge` (optional)

Wichtig:
- Tabelle wird erweitert, nicht neu erstellt.

### 4.2 `crm_aktivitaeten` (neue Tabelle)

Vorgesehene Felder:
- `id`
- `kunde_id` (FK -> `firmen.id`)
- `typ`
- `datum`
- `mitarbeiter_id` (FK -> `users.id`)
- `notiz`
- `wiedervorlage`

Optional:
- `created_at`

## 5. Feld-Mapping (vollstaendig)

| CC Intern | Cockpit Ziel | Bemerkung |
|---|---|---|
| Objekt-Key (z. B. `Ruhrbahn`) | `firmen.name` | Key ist fachlicher Wert und bleibt erhalten |
| Objekt-Key (z. B. `Ruhrbahn`) | Basis fuer `firmen.id` | UUID-Erzeugung |
| `ap` | `firmen.ansprechpartner` | je nach finalem Modell auf bestehende Ansprechpartnerfelder aufteilbar |
| `apFunktion` | `firmen.ansprechpartner_funktion` | Erweiterungsfeld |
| `tel` | `firmen.telefon` | direkt |
| `mail` | `firmen.email` | direkt |
| `plz` | `firmen.plz` | direkt |
| `stadt` | `firmen.stadt` | direkt |
| `branche` | `firmen.branche` | Erweiterungsfeld |
| `umsatz` | `firmen.umsatz` | optional |
| `auftragsvolumen` | `firmen.auftragsvolumen` | optional |
| `fahrzeuge` | `firmen.fahrzeuge` | optional |
| `status` | `firmen.status` | direkt |
| `letzterKontakt` | `firmen.letzter_kontakt` | Erweiterungsfeld |
| `naechsteAktion` | `firmen.naechste_aktion` | Erweiterungsfeld |
| `notiz` | `firmen.notiz` | Erweiterungsfeld |
| `aktivitaeten[]` | `crm_aktivitaeten` | strikt ausgelagert, nicht in `firmen` speichern |
| `aktivitaeten[].typ` | `crm_aktivitaeten.typ` | direkt |
| `aktivitaeten[].datum` | `crm_aktivitaeten.datum` | direkt |
| `aktivitaeten[].mitarbeiter` | `crm_aktivitaeten.mitarbeiter_id` | FK-Aufloesung gegen `users.id` |
| `aktivitaeten[].notiz` | `crm_aktivitaeten.notiz` | direkt |
| `aktivitaeten[].wiedervorlage` | `crm_aktivitaeten.wiedervorlage` | direkt |

Regel:
- Kein Datenverlust erlaubt.

## 6. ID-Strategie

Grundsatz:
- Jeder Kunde erhaelt eine UUID als primaeren technischen Schluessel (`firmen.id`).
- Der Name wird nie als relationaler Schluessel verwendet.

Empfehlung:
- Deterministische UUID (z. B. auf Basis von Namespace + Original-Key), damit Re-Importe idempotent und nachvollziehbar bleiben.

## 7. Import-Konzept

Geplante logische Schritte:
1. Quelldaten einlesen (`kunden.json` als Objektstruktur)
2. Mapping auf Zielmodell anwenden
3. UUID pro Kunde erzeugen
4. `aktivitaeten[]` extrahieren und relational vorbereiten

Import-Reihenfolge:
1. `firmen`
2. `crm_aktivitaeten`

Begruendung:
- `crm_aktivitaeten.kunde_id` ist Fremdschluessel auf `firmen.id`.

## 8. Sonderfaelle

- Fehlender Mitarbeiter in Aktivitaet:
  - `mitarbeiter_id = NULL`
  - Ursprungshinweis in `notiz` oder technischem Importprotokoll dokumentieren

- Unbekannte oder zusaetzliche Felder:
  - Als Inkonsistenz kennzeichnen
  - Falls erforderlich, temporaer in `erweiterung_json` als Fallback speichern (ohne Fachverlust)

- Dateninkonsistenzen:
  - Datumsformate, leere Pflichtfelder, Dubletten, widerspruechliche Statuswerte als zu pruefende Faelle markieren

## 9. Backend-Luecken (dokumentiert)

Folgende Bereiche sind fuer den vollstaendigen CC-Intern-Umzug als offen markiert:
- Angebote (CC Intern)
- CRM / Anfragen
- Rechnungen
- Mitarbeiter
- Urlaub
- Lager
- Produktion

## 10. Routing-Hinweis (nur Dokumentation)

Aktueller Stand:
- Kundenrouting nutzt `requireModule('fusa')`

Zielbild:
- Kundenrouting fuer CC Intern auf `requireModule('ccintern')`

Hinweis:
- Dieser Punkt ist hier nur dokumentiert, nicht implementiert.

## 11. Risiken

- Falsche oder unvollstaendige Quellbestaende (z. B. unterschiedliche JSON-Staende)
- Fehlende Felder oder abweichende Feldtypen in Produktivdaten
- Inkonsistente Werte (Status, Datumsfelder, Mitarbeiterbezeichner)
- Nicht aufloesbare Mitarbeiterzuordnung fuer Aktivitaeten
- Vermischung von Objekt-Key-Namen und technischer ID bei unklarer ID-Strategie

## 12. Checkliste

- [ ] Datenquelle final bestaetigt (`kunden.json` Objektstruktur, produktiver Stand)
- [ ] Mapping vollstaendig und fachlich freigegeben
- [ ] Zielstruktur (`firmen` + `crm_aktivitaeten`) final abgestimmt
- [ ] Strategie fuer unbekannte Felder festgelegt
- [ ] Regeln fuer fehlende Mitarbeiterzuordnung festgelegt
- [ ] Nachweis: kein Datenverlust in Mapping und Zielstruktur

---

Status dieses Dokuments:
- Read-Only Design abgeschlossen
- Keine Implementierung enthalten
- Keine Systemaenderung vorgenommen
