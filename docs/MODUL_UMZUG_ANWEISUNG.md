# MODUL_UMZUG_ANWEISUNG.md

**Stand: April 2026 — Verbindlich für alle Entwicklungstools (Cursor, Cowork)**

---

> **PFLICHT: Lies zuerst `CC Cockpit/docs/ARCHITEKTUR_REGEL.md`**
> **Diese Regel ist verbindlich. Baue nichts, was dieser Regel widerspricht.**

---

## AUFGABE

Modul 1:1 aus Alt-System ins Cockpit portieren – OHNE Informationsverlust.

**Alt-Systeme (Quellen):**

| System | Pfad |
|--------|------|
| FUSA_CLEAN_CODE_DEV | `c:\Users\CC\Desktop\FUSA_CLEAN - Code\DEV\` |
| CC Intern | `c:\Users\CC\Desktop\CCinter_COCKPIT_UMZUG\` |

> Vor dem Start klären: Aus welchem der beiden Alt-Systeme kommt das Modul?
> FUSA-Module → FUSA-Pfad. CC Intern-Module → CC Intern-Pfad.

---

## ZIEL

Das Modul muss nach dem Umzug **funktional UND inhaltlich identisch** zum Alt-System sein.

- Keine reduzierte Version
- Keine Interpretation
- Kein Weglassen

Das Ergebnis muss sich für den Nutzer so anfühlen, als wäre das alte Modul einfach in das neue System verschoben worden.

---

## GRUNDREGEL (ABSOLUT VERBINDLICH)

**NICHT direkt umsetzen.**

**IMMER diese Reihenfolge einhalten:**

1. ALT-CODE SUCHEN
2. ALT-INHALT VOLLSTÄNDIG INVENTARISIEREN
3. SOLL-LISTE ERSTELLEN
4. DANN ERST UMSETZEN

> Wenn Schritt 2 nicht vollständig ist → **STOP, NICHT bauen.**

---

## SCHRITT 0 – ARCHITEKTUR PRÜFEN (NEU – PFLICHT VOR ALLEM)

Bevor der Alt-Code gesucht wird, prüfen:

1. **Gehört das Modul ins Cockpit?** (Steuerung/Rechte → Cockpit) oder in FUSA/CC Intern?
   - Cockpit darf NICHT: Aufträge, Angebote, Fahrzeuge, Schäden, Rechnungen, Produktion
   - → Wenn Modul operative Logik enthält: STOP, erst klären
2. **Gibt es technische Blocker?** → Lies `CC Cockpit/docs/UMZUG_AUFGABEN.md`
   - Wenn ein Blocker für dieses Modul zutrifft → erst Blocker lösen, dann portieren
3. **Backup anlegen:** Vor jeder Änderung den aktuellen Stand sichern (Git-Commit oder Kopie)

---

## SCHRITT 1 – ALT-DATEIEN FINDEN

Suche im jeweiligen Alt-System-Ordner alle relevanten Dateien für das Modul:

- Views
- Modals
- Teilkomponenten
- Event-Handler
- alte API-Verbindungen

---

## SCHRITT 2 – ALT-INVENTAR (PFLICHT!)

Erstelle eine vollständige Liste aller Elemente im Alt-Modul:

### UI-STRUKTUR
- Alle Sektionen (z. B. „Bemerkungen", „Status", „Signatur")
- Layout-Aufbau (Header, Body, Footer)

### FELDER
- alle Inputs, Textareas, Selects, Buttons
- alle Status-Auswahlen
- alle versteckten Felder

### BUTTONS / AKTIONEN
- alle Buttons (z. B. Speichern, Löschen, PDF)
- alle Klick-Aktionen

### SONDERLOGIK
- Statuswechsel
- Bedingungen (z. B. read-only)
- Rechteprüfung
- Anzeige-Logik

### DATEN
- welche Felder gespeichert werden
- Struktur im Alt-System

> **WICHTIG:** Diese Liste MUSS vollständig sein.
> Wenn Alt 10 Elemente hat → Liste muss 10 enthalten.
> Wenn die Liste nicht vollständig ist → STOP, NICHT weiter.

---

## SCHRITT 3 – SOLL-STRUKTUR DEFINIEREN

Leite aus dem Alt-Inventar die Zielstruktur für Cockpit ab:

- Welche UI-Elemente werden 1:1 übernommen
- Welche Datenstruktur wird genutzt
- Wo werden die Daten gespeichert (API / fusa_extra_json / erweiterung_json etc.)
- Passt die Struktur zur ARCHITEKTUR_REGEL? (keine Doppelstruktur, keine eigene Auth-Logik)

**Keine Interpretation. Keine Vereinfachung.**

---

## SCHRITT 4 – UMSETZUNG

Jetzt erst bauen.

### Regeln:
- 1:1 UI-Struktur übernehmen
- keine Mini-Version bauen
- keine Felder weglassen
- keine neue UX erfinden
- bestehende Cockpit-Struktur respektieren (Mount, API, Rechte)

### Events:
- keine „toten" CustomEvents ohne Funktion
- jede Aktion muss sichtbar etwas tun

### Daten:
- strukturierte Speicherung (kein Chaos)
- keine doppelten Speicherorte
- Daten werden über Cockpit-API gespeichert – kein direkter DB-Zugriff aus dem Modul

---

## SCHRITT 5 – VERBOTENE DINGE

❌ Minimalversion („erstmal nur Textfeld")
❌ Platzhalter-UI
❌ Stub-Buttons ohne Funktion
❌ halbe Umsetzung
❌ „kommt später"
❌ UI öffnen ohne Inhalt
❌ neue Struktur erfinden statt Alt übernehmen
❌ eigenes Auth-System einbauen
❌ eigene Benutzerverwaltung einbauen
❌ parallele Datenquelle anlegen

---

## SCHRITT 6 – TESTPFLICHT

Vor Abschluss MUSS geprüft werden:

- [ ] Öffnen funktioniert
- [ ] alle Buttons reagieren
- [ ] alle Felder sichtbar
- [ ] Daten speichern korrekt
- [ ] Daten bleiben nach Reload erhalten
- [ ] Rechte greifen korrekt
- [ ] keine Fehler in Konsole
- [ ] ARCHITEKTUR_REGEL nicht verletzt (keine Doppelstruktur, kein falsches Modul)

---

## SCHRITT 7 – AUSGABE

Nach Umsetzung ausgeben:

1. Welche Alt-Dateien verwendet wurden
2. Vollständige Alt-Inventar-Liste (kompakt)
3. Welche Dateien geändert wurden
4. Welche Daten gespeichert werden und wo
5. Was vorher gefehlt hat und jetzt ergänzt wurde
6. Bestätigung: ARCHITEKTUR_REGEL eingehalten ✅

---

## HARTE KONTROLLREGEL

Wenn Alt-Modul mehr Inhalte hat als das neue Modul → **Aufgabe NICHT erfüllt.**

→ NICHT abschließen. Zurück zu Schritt 2.

---

## ABNAHME

Die Aufgabe gilt erst als erledigt, wenn **Celal (Auftraggeber) die Umsetzung bestätigt hat.**

Kein selbstständiges Abschließen ohne Rückmeldung.

---

*Diese Datei ist die verbindliche Umzug-Anweisung für alle Module.*
*Zusammen mit `ARCHITEKTUR_REGEL.md` und `UMZUG_AUFGABEN.md` bildet sie das vollständige Regelwerk.*
