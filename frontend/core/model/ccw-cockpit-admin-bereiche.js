/**
 * @file CC Cockpit — Verwaltungsbereiche (fachliche Festlegung, „Anweisung 2“).
 *
 * **Grundsatz:** Das CC Cockpit ist die zentrale Verwaltungs- und Steuerzentrale für Benutzer,
 * Rollen, Firmen, Projekte, Einladungen sowie Zugänge/Geräte/Sessions. FUSA, CC Intern und
 * MesseFlow **verwalten diese Grundstrukturen nicht selbst**, sondern nutzen die zentrale
 * Steuerung aus dem Cockpit.
 *
 * **Rechte:** Konkrete Rechte und Modul-/App-Freigaben liegen ausschließlich in
 * {@link import('./ccw-platform-data-model.js')} `PROJECT_ACCESS` — nicht in Rollen-Vorlagen
 * allein und nicht in Einladungen allein (Einladung trägt `intendedAccess`; nach Annahme
 * materialisiert sich der Zugriff über PROJECT_ACCESS).
 *
 * Keine App-/Login-Logik, keine Workflow-Detailmasken, kein Backend — nur Zuständigkeiten
 * und Abgrenzungen. Umsetzung in Navigation/UI kann schrittweise erfolgen.
 *
 * @see ./ccw-platform-data-model.js
 */

// ── 1. Bereich „Benutzer“ ─────────────────────────────────────────────────────
/**
 * **Benutzer** = die **Person** (eine Identität plattformweit, keine Doppel-Benutzer pro Modul).
 *
 * **Zweck:** Personen sehen und öffnen; Status erkennen; Rollen-/Projektzuordnung und
 * Zugänge nachvollziehen. **Keine** eigene Benutzerverwaltung in FUSA oder CC Intern.
 *
 * **Sichtbar pro Benutzer mindestens (Zielbild):**
 * - Name
 * - E-Mail
 * - Firma
 * - Status
 * - Rolle bzw. Rollenbezug (Bezug zu {@link import('./ccw-platform-data-model.js').ROLE})
 * - Projektbezug (über PROJECT_ACCESS / Anzeige-Aggregation)
 * - Zugänge (Kurzüberblick; Detailtiefe auch Bereich 6)
 * - letzte Aktivität (optional)
 *
 * **Abgrenzung:** Benutzer ersetzt weder Rolle noch PROJECT_ACCESS noch Einladung.
 */

// ── 2. Bereich „Rollen“ ───────────────────────────────────────────────────────
/**
 * **Rollen** = **Vorlagen** (Beschreibung, typischer Einsatzzweck).
 *
 * **Zweck:** Vorhandene Rollen sichtbar machen; als Vorlage für Zuweisungen in PROJECT_ACCESS
 * nachvollziehbar machen.
 *
 * **Sichtbar pro Rolle mindestens:**
 * - Name
 * - Beschreibung
 * - typischer Einsatzzweck
 *
 * **Abgrenzung:** Konkrete Rechte (canView, Module, Apps, …) liegen in **PROJECT_ACCESS**,
 * nicht in der Rolle als „globale starre“ alleinigen Quelle ohne Firmen-/Projektbezug.
 */

// ── 3. Bereich „Firmen“ ───────────────────────────────────────────────────────
/**
 * **Firma** = **Organisation**, nicht Person.
 *
 * **Zweck:** Organisationen sehen; Typ unterscheiden; Firma als Kontext für Benutzer,
 * Projekte, Einladungen und Zugriffe.
 *
 * **Sichtbar pro Firma mindestens:**
 * - Firmenname
 * - Typ
 * - Status
 * - Ansprechpartner (optional)
 * - Kontakt (optional)
 *
 * **Abgrenzung:** Firmenbezug ist Grundlage für Benutzer, Projekte und Einladungen;
 * konkrete Sichtbarkeit pro Modul/Projekt weiter über PROJECT_ACCESS.
 */

// ── 4. Bereich „Projekte“ ───────────────────────────────────────────────────────
/**
 * **Projekte** = Verwaltung der fachlichen **PROJECT**-Entität (siehe Datenmodell).
 *
 * **Zweck:** Projekte sehen; Firmenzuordnung erkennen; Projekte als Kontext für Rechte
 * und Sichtbarkeit (PROJECT_ACCESS mit gesetztem `projectId`).
 *
 * **Sichtbar pro Projekt mindestens:**
 * - Projektname
 * - Firma (`companyId` / Anzeigename)
 * - Status
 * - erstellt am (optional)
 *
 * **Wichtig:**
 * - PROJECT ist eigene Entität (nicht nur Listenfeld ohne Stammdaten).
 * - PROJECT_ACCESS **darf** auf PROJECT verweisen (`projectId`).
 * - **Ohne** `projectId` in PROJECT_ACCESS = Zugriff **firmenweit** gültig.
 *
 * **Hinweis „eigener Bereich“:** PROJECT ist **kein** separater Navigationsbereich neben
 * „Projekte“ — die **fachliche Verwaltungsfläche** heißt **„Projekte“** und beherbergt
 * die PROJECT-Stammdaten/-übersicht.
 */

// ── 5. Bereich „Einladungen“ ───────────────────────────────────────────────────
/**
 * **Einladung** = eigener **Datensatz** (INVITATION), nicht „nur“ eine E-Mail.
 *
 * **Zweck:** Offene und vergangene Zugangsvorbereitung; Status; Ziel (Firma, optional
 * Projekt, Rolle, intendedAccess); Nachverfolgung.
 *
 * **Sichtbar pro Einladung mindestens:**
 * - E-Mail
 * - Firma
 * - Projekt (optional)
 * - Rolle
 * - intendedAccess (Anknüpfung an PROJECT_ACCESS-Felder, siehe Datenmodell)
 * - Status (z. B. offen, angenommen, abgelaufen, widerrufen)
 * - erstellt am
 * - Ablaufdatum
 * - angenommen am (optional)
 *
 * **Abgrenzung:** Einladung ersetzt keinen Benutzerdatensatz; nach Annahme entsteht/verknüpft
 * sich der Benutzer, die konkreten Rechte über PROJECT_ACCESS.
 */

// ── 6. Bereich „Zugänge / Geräte / Sessions“ ───────────────────────────────────
/**
 * **Zugänge / Geräte / Sessions** = zentrale **Sicherheits- und Kontrollsicht** (technische
 * Transparenz, keine vorgezogene Kill-/Token-UI in dieser Anweisung).
 *
 * **Zweck:** Erkennen, welche Benutzer welche Zugangskanäle nutzen; aktive Geräte und
 * Sessions; **mobile** Freigaben schnell erkennbar (CC Intern App, FUSA Werkstatt-App).
 *
 * **Sichtbar mindestens (Zielbild):**
 * - Benutzer
 * - Desktop/Web-Zugang
 * - CC Intern App-Zugang
 * - FUSA Werkstatt-App-Zugang
 * - aktive Geräte / Sessions
 * - letzte Aktivität (optional)
 *
 * **Abgrenzung:** Diese Sicht ersetzt nicht PROJECT_ACCESS (Rechte) und keine Rollen-Vorlage;
 * sie ergänzt die **operative Kontrolle** über laufende Zugriffe.
 */

// ── 7. Klare Abgrenzung (Merktabelle) ───────────────────────────────────────────
/**
 * | Begriff            | Rolle im Modell                                      |
 * |--------------------|------------------------------------------------------|
 * | Benutzer           | Person                                               |
 * | Rolle              | Vorlage                                              |
 * | Firma              | Organisation                                         |
 * | Projekt (PROJECT)  | Fachlicher Kontext                                   |
 * | Einladung          | Zugangsvorbereitung (Datensatz)                      |
 * | PROJECT_ACCESS     | Eigentliche Rechte-/Zugriffssteuerung                |
 * | Session / Gerät    | Technische Zugriffssicht                             |
 */

// ── 8. Dashboard / Cockpit-Grundsicht ───────────────────────────────────────────
/**
 * **Grundsicht (inhaltlich, kein finales UI-Design):** Auf einen Blick erkennbar machen:
 * - wer aktiv ist
 * - wer eingeladen ist (offen / überfällig)
 * - wer deaktiviert ist
 * - wer welche Zugänge hat (inkl. mobil)
 *
 * Umsetzung als Kacheln, Zähler oder Listen ist bewusst **nicht** vorgeschrieben.
 */

// ── 9. Explizit nicht Teil dieser Festlegung ─────────────────────────────────────
/**
 * - Login-Masken, Passwort-Logik, Token-Verwaltung, Session-Kill
 * - finale Tabellen-/Filter-Designs
 * - Backend-API
 * - Detailbearbeitung der Rechte-Matrix (außerhalb der hier beschriebenen Zuständigkeiten)
 */

export {};
