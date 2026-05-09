# ARCHITEKTUR_REGEL.md (FD2 FINAL)

**Stand: April 2026 — Verbindlich für alle Entwicklungstools (Cursor, Cowork)**

---

## 1. GOLDENE REGEL

Bei JEDER Entscheidung:

- Steuerung / Zugriff / Rechte → **Cockpit**
- Operative Arbeit Außendienst → **FUSA**
- Interne Büroarbeit → **CC Intern**

> **Wenn unklar → nicht bauen, erst klären**

---

## 2. SYSTEM-GRUNDSATZ

- Es gibt **ein System**, keine getrennten Systeme.
- Alle Module greifen auf **dieselben Daten** zu.
- Es gibt **keine parallelen Datenbanken** oder Strukturen.
- Mobile Nutzung ist nur eine andere Darstellung, kein eigenes System.

---

## 3. COCKPIT – Steuerzentrale

### Cockpit ist verantwortlich für:

- Benutzer verwalten (anlegen, einladen, sperren)
- Einladungen erstellen und versenden (Einladungslinks)
- Rollen und Rechte pro Projekt steuern
- Projekte als Container anlegen (keine operative Logik)
- Modulzugriffe steuern
- Systemweite Logs und Meldungen anzeigen
- Dashboard (nur Anzeige)
- Firmen/Stammdaten verwalten (zentrale Datenquelle)

### Cockpit darf NICHT:

- Aufträge bearbeiten
- Angebote erstellen
- Fahrzeuge verwalten
- Schäden verwalten
- Rechnungen erstellen
- Produktionslogik enthalten

---

## 4. FIRMEN / KUNDEN – ZENTRALE DATENLOGIK

- Es gibt nur **eine zentrale Datenquelle**: **Firmen**
- Es existiert nur **eine Tabelle / Datenbasis**

### Bezeichnungen:

| Modul | Bezeichnung |
|-------|-------------|
| Cockpit | Firmen |
| FUSA | Kunden (Außendienst) |
| CC Intern | Kunden (Büro) |

- Es handelt sich immer um **denselben Datensatz**
- Es gibt **keine getrennten Kunden-Tabellen**
- Alle Module greifen auf **dieselbe Datenquelle** zu

---

## 5. CC INTERN – KUNDENNUTZUNG

- In CC Intern greifen alle Bereiche auf dieselben Kunden zu:
  - CRM
  - Angebote
  - Aufträge
  - weitere Module
- Es gibt **keine separaten Kunden** je Modul
- Änderungen gelten **systemweit**

---

## 6. KUNDENNUMMERN-REGEL

- Jeder Kunde hat eine **eindeutige Kundennummer**

### Erste Ziffer definiert Herkunft:

| Ziffer | Bedeutung |
|--------|-----------|
| 1 | CC Intern / CC Werbung |
| 2 | FUSA Mülheim |
| 3 | FUSA Essen |

- Die Nummer dient der **Zuordnung und Abrechnung**
- Es entsteht kein getrenntes System, sondern nur eine Kennzeichnung

---

## 7. FUSA – Außendienst (operativ)

### FUSA ist zuständig für:

- Aufträge (Außendienst)
- Fahrzeuge
- Schäden
- Dokumentation
- Einsatzplanung

### FUSA nutzt:

- Login / Rechte / Projekte aus **Cockpit**
- Firmen-Daten aus **Cockpit**

### FUSA baut NICHT:

- eigenes Auth-System
- eigene Benutzerverwaltung
- eigene Rechtearchitektur

### Mobile Nutzung:

- Zugriff auch per Handy möglich (z. B. Fahrzeuge, Schäden)
- nutzt dieselben Daten, keine eigene Logik

---

## 8. CC INTERN – Büro (operativ)

### CC Intern ist zuständig für:

- Angebote (Büro)
- Aufträge (Büro)
- CRM
- Produktion / Kanban
- Mitarbeiter / Planung

### CC Intern nutzt:

- Login / Rechte / Projekte aus **Cockpit**
- Firmen-Daten aus **Cockpit**

### CC Intern baut NICHT:

- eigenes Auth-System
- eigene Benutzerverwaltung
- eigene Rechtearchitektur

### Mitarbeiter-App:

- mobile, reduzierte Ansicht
- nutzt dieselben Daten
- keine eigene Datenstruktur

### Mitarbeiter-App Zusatzregel

- Mitarbeiter-App nutzt ausschließlich CC-Intern-Produktionsdaten.
- Aufgaben dürfen nicht aus localStorage, Demo-Seeds oder alten INTERN_AUFGABEN kommen.
- Mitarbeiter-Zuordnung erfolgt nur über User-UUID oder festes Mitarbeiter-Kürzel aus der Datenbank.
- Keine automatische Kürzel-/Initialen-Bildung aus Namen.
- Mobile Ansicht darf keine eigene Aufgabenlogik besitzen.

---

## 9. BENUTZER & ROLLEN

- Verwaltung erfolgt **nur im Cockpit**
- FUSA und CC Intern:
  - → nur Anzeige
  - → keine Bearbeitung
- Mitarbeiter-Kürzel sind Stammdaten und müssen aus Cockpit/DB kommen.
- Kürzel dürfen niemals aus Vorname/Nachname berechnet werden.

---

## 10. KALENDER REGEL

- Es gibt **einen gemeinsamen Kalender** für Cockpit, FUSA und CC Intern
- Der Kalender ist keine eigene Fachlogik, sondern eine **Ansicht auf bestehende Daten**
- Es gibt **keine zweite Kalender-Datenquelle**

### Erstellung

- Termine können über Module oder direkt im Kalender erstellt werden
- Einfache Eingaben (z. B. "Arzttermin") sind erlaubt
- System erstellt automatisch: → **Allgemeiner Termin** (Datensatz)

### Struktur

Jeder Termin gehört zu einem Typ:

- Auftrag
- Schaden
- Fahrzeug
- Allgemeiner Termin

### Verhalten

- Fachvorgang erzeugt Termin
- Kalender ist **keine führende Logik**

### Drag & Drop

- Verschieben ist erlaubt
- Änderung wird gespeichert
- Fachtermine: → aktualisieren Fachobjekt
- Allgemeine Termine: → aktualisieren Termin-Datensatz

### Cockpit

- zeigt Kalender
- erstellt **keine** operativen Termine

---

## 11. DOPPELSTRUKTUR VERBOTEN

❌ Keine doppelte Kundenlogik  
❌ Keine doppelte Auftragslogik  
❌ Keine doppelte Angebotslogik  
❌ Kein eigenes Auth in Modulen  
❌ Keine eigene Benutzerverwaltung  
❌ Keine eigene Rechtearchitektur  
❌ Keine parallelen Datenquellen  

---

## 12. SYSTEMSTATUS / ENTWICKLUNG

- FUSA ist strukturell vorbereitet und dient als operative Basis
- CC Intern ist modular vorbereitet
- Module werden **schrittweise aktiviert**
- Es erfolgt **kein Neubau**, sondern Erweiterung
- Bestehende Struktur wird genutzt

---

## 13. PFLICHT FÜR JEDE ANWEISUNG

Jede Anweisung beginnt mit:

> **Lies zuerst: `CC Cockpit/docs/ARCHITEKTUR_REGEL.md`**  
> **Diese Regel ist verbindlich. Baue nichts, was dieser Regel widerspricht.**

---

## 14. MITARBEITER-ZUORDNUNG (VERBINDLICH)

- Mitarbeiter werden ausschließlich über user_id (UUID) zugeordnet
- Kürzel sind Stammdaten aus der DB
- Kürzel dürfen NICHT aus Namen berechnet werden
- Matching über:
  - user_id (Primär)
  - kuerzel (Fallback)
- Namen sind nur Anzeige

---

## 15. DATENQUELLEN-REGEL

- Es gibt nur API als Datenquelle
- localStorage darf NICHT als Hauptdatenquelle verwendet werden
- Demo-/Seed-Daten dürfen nicht produktiv genutzt werden
- Mobile und Desktop greifen auf dieselben Daten zu

---

## 16. MOBILE REGEL

- Mobile ist nur eine Darstellung
- Keine eigene Logik
- Keine eigene Datenhaltung
- Kein eigenes Matching

---

## 17. FUSA → CC INTERN ÜBERGABE (VERBINDLICH)

- FUSA ist Quelle für Außendienst-Aufträge
- CC Intern ist verantwortlich für Produktion

### Übergabe erfolgt ausschließlich über:

POST /api/v1/fusa/auftraege/:id/freigeben

### Verhalten:

- erzeugt genau EINEN CC-Intern-Auftrag
- verknüpft über:
  - fusa_auftrag_id
  - quelle: 'fusa'

### Regeln:

- ❌ kein manuelles Nachbauen von Aufträgen in CC Intern
- ❌ keine doppelte Erstellung
- ❌ keine direkte Bearbeitung des FUSA-Auftrags in CC Intern
- ✅ Änderungen im Prozess passieren im jeweiligen Modul:
  - FUSA → Außendienst-Daten
  - CC Intern → Produktion

### Kalender:

- FUSA → Beklebungstermin
- CC Intern → Montage
- beide greifen auf denselben Kalender zu
- keine doppelte Terminlogik

### Datenhoheit:

- FUSA bleibt Eigentümer der Fahrzeug-/Außendienstdaten
- CC Intern bleibt Eigentümer der Produktionsdaten

---

## 18. CC INTERN PRODUKTIONS- UND WORKFLOW-REGELN

- `firmen` ist der einzige führende Kundenstamm.
- Neue Aufträge müssen eine `firma_id` besitzen.
- `kunde` und `kunde_name` sind nur Anzeige-/Legacy-Felder und dürfen nicht als fachliche Wahrheit verwendet werden.
- `ccintern_auftraege` ist der führende interne Auftrag.
- `produktion_auftraege` darf nur Workflow-, Schritt- und Produktionsdetails enthalten.
- Es darf keine widersprüchliche Doppelpflege zwischen `ccintern_auftraege` und `produktion_auftraege` geben.
- FUSA und MesseFlow dürfen keine Produktion direkt starten.
- FUSA und MesseFlow dürfen nur den CC-Intern-Dialog „Neuer Auftrag" vorbefüllen.
- Ein Auftrag wird erst durch manuellen Klick auf „Auftrag anlegen" erstellt.
- Erst danach werden Workflow, Mitarbeiter-App, Fotos, Checklisten und Arbeitszeiten aktiviert.
- Mitarbeiter-App darf nur Aufgaben aus dem CC-Intern-Workflow anzeigen.
- Home zeigt nur aktive Hauptaufgaben.
- Aufgaben zeigt Beteiligte und erledigte Aufgaben grau, sichtbar und anklickbar.
- Montage ist Teamarbeit: alle zugewiesenen Monteure dürfen starten und fertig melden.
- Montage darf nur abgeschlossen werden, wenn mindestens ein Foto zum Auftrag vorhanden ist.
- Fotos gehören immer zum Auftrag und sind in Desktop und App identisch sichtbar.
- Arbeitszeiten werden pro Mitarbeiter über Start/Pause/Fertig erfasst und mit dem Auftrag synchronisiert.
- Soll-Zeiten pro Schritt dienen der Mitarbeiter-Auslastung und sind kein normaler Kalender.
- Der Montage-Kalender ist nur für Termine/Einsätze.
- Materiallager hat eine Backend-Quelle; Desktop und App dürfen keine getrennten Lagerdaten führen.
- Checklisten gehören zum Workflow, werden beim Auftrag geladen und sind erinnernd, nicht hart blockierend.
- Bestehende UI-Struktur der Mitarbeiter-App bleibt unverändert.

---

## 19. CC INTERN PRODUKTIONS- UND WORKFLOW-REGELN – DETAIL (VERBINDLICH)

### 19.1 Grundprinzip

- CC Intern ist die einzige Quelle für Produktion.
- FUSA und MesseFlow sind nur Vorbereitungssysteme.
- Ein Auftrag entsteht ausschließlich in CC Intern.
- Es darf keinen automatischen Auftrag geben.
- Ein Auftrag wird nur durch Benutzeraktion („Auftrag anlegen") erstellt.

### 19.2 Kundenbindung

- Jeder Auftrag muss eine `firma_id` besitzen.
- `firma_id` referenziert `firmen` (zentraler Kundenstamm).
- Felder wie `kunde` oder `kunde_name` sind nur Anzeige und keine fachliche Wahrheit.
- Es darf keine neue Logik auf Legacy-Kunden (`kunden`) aufgebaut werden.

### 19.3 Übergabe FUSA / MesseFlow

FUSA und MesseFlow dürfen:
- keinen Auftrag direkt erzeugen
- keinen Workflow starten

Stattdessen:
- Öffnen den Dialog „Neuer Auftrag" in CC Intern
- übergeben Vorbefüllung:
  - `firma_id`
  - Titel / Projektname
  - Dateien
  - Referenz (`fusa_id` oder `messeflow_id`)

Benutzer muss:
- Termine setzen
- Mitarbeiter zuweisen
- Auftrag manuell speichern

### 19.4 Workflow-Erstellung

Beim Speichern eines Auftrags wird automatisch erzeugt:
- Produktionsschritte: Grafik, Druck, Laminat, Montage
- Aufgaben
- Mitarbeiter-Zuweisung
- Checklisten
- Fotosystem

### 19.5 Produktionslogik

- `ccintern_auftraege` ist die führende Quelle.
- `produktion_auftraege` enthält nur Schritt-/Workflow-Daten.
- Es darf keine widersprüchliche Doppelpflege geben.

### 19.6 Mitarbeiter-App Logik

**Home** zeigt nur:
- aktive Aufgabe
- nur für Hauptzuständigen

**Aufgaben** zeigt:
- Beteiligte Aufgaben (grau)
- erledigte Aufgaben (grau)

Aufgaben bleiben sichtbar, anklickbar und werden nicht gelöscht.

### 19.7 Montage-Regeln

- Montage ist Teamarbeit.
- Alle zugewiesenen Mitarbeiter dürfen: starten, pausieren, fertig melden, Fotos hochladen.
- Abschlussregel: mindestens 1 Foto erforderlich.

### 19.8 Fotosystem

- Fotos gehören immer zum Auftrag (`auftrag_id`).
- Es gibt nur eine Quelle.
- Keine getrennten Foto-Systeme.
- Fotos sind sichtbar in Desktop und Mitarbeiter-App.

### 19.9 Arbeitszeit

Arbeitszeit wird über Mitarbeiter-App erfasst: Start → Pause → Weiter → Fertig.
- pro Mitarbeiter und pro Auftrag / Schritt
- Daten werden zentral im Backend gespeichert.
- Desktop und App sind synchron.

### 19.10 Planung und Auslastung

- Jeder Schritt hat eine Soll-Zeit (dient Tages-/Wochenplanung und Auslastung).

Es gibt zwei getrennte Systeme:

**Montage-Kalender:** Termine / Einsätze  
**Mitarbeiter-Plan:** Aufgaben / Zeit / Auslastung (kein klassischer Kalender)

### 19.11 Materiallager

- Es gibt nur eine Datenquelle: Backend (`lager_material`).
- Desktop: Verwaltung; Mitarbeiter-App: Buchung / Entnahme.
- Änderungen sind sofort synchron.

### 19.12 Checklisten

- Checklisten sind Teil des Workflows und werden beim Auftrag automatisch geladen.
- Abhaken möglich, nicht blockierend.
- Beim Abschluss: Hinweis bei unvollständiger Liste.

### 19.13 UI-Regel

- Bestehende UI (Mitarbeiter-App, Fotos, Aufgaben, Home) bleibt unverändert.
- Änderungen sind nur in Logik erlaubt, nicht im Layout.

### 19.14 Systemregeln

- ❌ Keine Dummy-Daten
- ❌ Keine zweite Datenquelle
- ❌ Keine parallelen Systeme
- ❌ Keine neue Nutzung von Legacy-Strukturen
- ✅ Alle Module greifen auf dieselbe zentrale Logik zu

---

*Diese Datei ist die einzige gültige Architektur-Regel.*
