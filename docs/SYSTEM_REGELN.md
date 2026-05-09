# CC Cockpit — Systemregeln (verbindlich)

> Version 3 · Stand: 01.05.2026
> Geltung: Cockpit, FUSA, CC Intern · gilt verbindlich für alle Implementierungs- und Diskussionsentscheidungen.

---

## 1. Architektur — 3 Module, klare Rollen

- **🟢 Cockpit** — verwaltet nur (Verwaltung / Zugriff / Kontrolle), **keine operative Logik**
- **🟠 FUSA** — arbeitet **eigenständig** (Verkauf / Vermietung) → **bleibt Ursprung des Auftrags**
- **🔵 CC Intern** — Hauptarbeits-System (Produktion + alles Operative)

---

## 2. Cockpit darf

- Benutzer verwalten
- Einladungen (Mail / WhatsApp)
- Rollen & Rechte vergeben
- Zugänge steuern
- **Kunden / Firmen** anlegen + pflegen *(über zentrale Tabelle)*
- Module freigeben
- Geräte verwalten
- Logs ansehen
- Dashboard / KPIs / Übersicht

---

## 3. Cockpit darf NICHT

- ❌ Aufträge anlegen / bearbeiten
- ❌ Produktion steuern
- ❌ FUSA-Fachlogik
- ❌ CC-Intern-Fachlogik

> **Cockpit sieht alles, greift aber NICHT in fachliche Abläufe ein.**

---

## 4. FUSA macht

- **Kunden** anlegen + pflegen *(zentrale Tabelle, keine eigene Kunden-DB)*
- Aufträge erstellen (FUSA-Auftrag = Ursprung)
- Fahrzeuge verwalten
- Belegung planen, Zeiträume
- Preise, Pakete, Angebote, Rechnungen
- Verkauf / Vermietung als Kerngeschäft
- Übergabe-Button → CC Intern

---

## 5. CC Intern macht

- **Kunden** anlegen + pflegen *(zentrale Tabelle, keine eigene Kunden-DB)*
- Eigene Aufträge (z. B. Fremdkunden außerhalb FUSA-Vermietung)
- Übernimmt FUSA-Aufträge per **Verknüpfung**
- Produktion komplett: Grafik / Druck / Montage
- Mitarbeiter, Fotos, Workflow, Lager, CRM, Rechnungen

---

## 6. Übergabe FUSA → CC Intern

- **Einbahnstraße:** nur FUSA → CC Intern
- **Verknüpfung, KEIN Ersatz:**
  - FUSA-Auftrag bleibt erhalten und ist **weiter Ursprung**
  - CC Intern bekommt einen verknüpften Produktions-Auftrag
  - Beide Datensätze bleiben sichtbar und referenzieren einander
- **Zuständigkeit nach Übergabe:**
  - FUSA → bleibt zuständig für Verkaufs- / Vermietungs-Daten (Preis, Belegung, Rechnung)
  - CC Intern → übernimmt Produktions- / Fertigungs-Daten (Workflow, Grafik, Druck, Montage)
- **Keine fachliche Rückrichtung** — CC Intern kann FUSA-Daten **nicht** verändern. Nur **Status-Sichtbarkeit** (FUSA sieht: "in Produktion", "fertig", "ausgeliefert" — schreibt aber nicht zurück, und CC Intern schreibt nicht in FUSA).

---

## 7. Gemeinsame Datenbasis (zentrale Tabellen)

- **Kunden / Firmen** = **eine** zentrale Tabelle für alle drei Module
  - Anlegen ist überall möglich (Cockpit / FUSA / CC Intern)
  - **Aber: keine eigenen Kunden-Stammdaten je Modul**
  - Keine Duplikate, kein Synchronisieren — alle greifen auf dieselben Datensätze zu
- **Kalender** = ein einziger Kalender, von FUSA und CC Intern gemeinsam genutzt

---

## 8. Konfliktregel Kalender

- Bei zeitlich überlappender Doppelbuchung:
  - **Warnung anzeigen** (deutlich sichtbar)
  - **Kein Hard-Block** — der User kann bewusst trotzdem buchen
- Begründung: in der Praxis sind Mehrfachnutzungen manchmal gewollt — der Mensch entscheidet

---

## 9. Ein-Projekt-Modell

- Aktuell: **ein Projekt** ("Standard / Demo / Ruhrbahn")
- Multi-Projekt **nicht nötig** — Berechtigungen laufen über Rollen
- UI-Konsequenz:
  - Project-Selector aus allen Tabs **entfernen**
  - Cockpit-Tab "Projekte" **entfernen**
  - Cockpit-Tab "Aufträge" **entfernen** (laut Regel 3)

---

## 10. Berechtigungs-Modell (RBAC)

- Steuerung über **Rolle + Rechte + Modul-Zugriff**, NICHT über Projekte
- Rollen-Beispiele: Admin, Vertrieb, Disposition, Produktion-Mitarbeiter, Buchhaltung
- Rechte-Flags pro Rolle (`can_*`):
  - `can_view_prices`
  - `can_view_invoices`
  - `can_view_finanzen`
  - `can_edit`
  - `can_create_auftraege`
  - … (erweiterbar)
- Modul-Zugriff pro Rolle: Cockpit ja/nein, FUSA ja/nein, CC Intern ja/nein
- Beispiele:
  - **Bettina (Vertrieb)** → CC Intern + Workflows + Preise sehen
  - **Person X (Disposition)** → FUSA + Fahrzeuge sehen, **keine** Finanzen

---

## 11. Hauptaccount (aktueller Stand)

- **E-Mail:** info@cc-werbung.de (Celal Cetinkaya)
- **Rolle:** SUPER_ADMIN
- **Firma:** Ruhrbahn (`70d5b669-164c-4cc0-8778-90611235475f`)
- **Projekt-Zugriff:** Standard / Ruhrbahn als admin
- **Passwort:** `Admin#2026!` (Übergangslösung — nach erstem Login ändern)

---

## 12. Datenbank- und Server-Disziplin

- DB-Datei: `backend/data/cc-cockpit.db` (SQLite via sql.js)
- `.env`: `DISABLE_DEV_TEST_LOGIN_SEED=1` (kein Auto-Seed beim Boot)
- Vor jedem DB-Eingriff: Backend-Server beenden + Process-Liste verifizieren
- Vor jedem DB-Eingriff: Backup der DB-Datei
- Server selbst starten (eigenes PowerShell-Fenster), nicht durch Cursor
- Goldene Reihenfolge: Server aus → Backup → Eingriff → Verifikation → Server an → Verifikation via Health/Login

---

## 13. Mitarbeiter-App-User (pausiert)

- 9 ccintern.ma.* User wurden im aktuellen Cleanup gelöscht
- Backup unter `backend/data/cc-cockpit_pre-ruhrbahn-cleanup.db` — **nicht löschen**
- Wiederherstellung erfolgt **später**, wenn Mitarbeiter-App getestet werden soll
- Vorbereitete Recovery-Anweisung: Restore + Soft-Cleanup ohne User-Löschung

---

## 14. Geltungsbereich

- Diese Regeln gelten **verbindlich** für alle Implementierungs- und Diskussionsentscheidungen
- Cursor, Mensch und Claude orientieren sich daran
- Änderungen nur durch ausdrückliche Entscheidung von Celal

---

## 🔥 Kernsatz (Kurzfassung)

> **Cockpit verwaltet nur (keine operative Logik).**
> **FUSA ist eigenständig und bleibt Ursprung des Auftrags.**
> **CC Intern ist das Hauptarbeits-System.**
> **FUSA → CC Intern erfolgt über Verknüpfung (kein Ersatz).**
> **Kunden sind zentral (eine Datenbasis, keine Duplikate).**
> **Kalender ist gemeinsam, Konflikte = Warnung.**
> **Keine fachliche Rückrichtung, nur Status-Sichtbarkeit.**
