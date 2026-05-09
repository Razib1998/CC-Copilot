/**
 * @file CC Cockpit — UI-Struktur der Verwaltungsbereiche (fachlich, „Anweisung 5“).
 *
 * Festlegung von **Listenansicht**, **Detailansicht** und **Aktionen** je Bereich — **ohne**
 * finales Design, ohne Filter/Suche/Pagination, ohne API, ohne Validierung, ohne Session-Kill-UI.
 *
 * **Grundsätze:** keine neue fachliche Logik; keine Rechte außerhalb von **PROJECT_ACCESS**;
 * keine doppelte Datenhaltung; UI-Ziel: einfach, klar, kontrollierbar.
 *
 * **Einheitliche Denklogik je Bereich:** (1) Listenansicht → (2) Detailansicht → (3) Aktionen.
 *
 * @see ./ccw-platform-data-model.js — USER, ROLE, COMPANY, PROJECT, INVITATION, PROJECT_ACCESS, SESSION, DEVICE
 * @see ./ccw-cockpit-admin-bereiche.js — fachliche Bereiche und Abgrenzungen
 * @see ./ccw-cockpit-dashboard-kontrollsicht.js — Dashboard vs. Verwaltungsdetail
 * @see ./ccw-cockpit-security-zugang.js — Session/Gerät, Einladung
 */

// ═══════════════════════════════════════════════════════════════════════════════
// GRUNDPRINZIP (wiederholt für Lesbarkeit)
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Jeder Verwaltungsbereich folgt:
 * 1. **Listenansicht** (Übersicht)
 * 2. **Detailansicht** (Einzelobjekt)
 * 3. **Aktionen** (ändern, zuweisen, deaktivieren — soweit später umgesetzt)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BENUTZER
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * **Listenansicht — Pflichtfelder:**
 * - Name, E-Mail
 * - **Status** (aktiv / eingeladen / deaktiviert) — **direkt sichtbar**
 * - Firma
 * - Rolle (Basisrolle — Bezug zu Zuweisung/PROJECT_ACCESS, Darstellung aggregiert)
 * - **Zugang:** Web, **CC Intern App**, **FUSA Werkstatt** — **explizit sichtbar** (mobile Kanäle)
 * - Letzte Aktivität (optional)
 *
 * **Detailansicht:**
 * - Stammdaten (Name, E-Mail)
 * - Firma
 * - Zugewiesene Projekte (**über PROJECT_ACCESS**, nicht separate „Schattenliste“)
 * - Rolle **je Projekt** (bzw. je Zugriffszeile PROJECT_ACCESS)
 * - **intendedAccess** falls relevant (z. B. noch im Einladungskontext / historische Referenz — kein zweites Rechtesystem)
 * - Zugangskanäle (Web / Apps gemäß PROJECT_ACCESS)
 * - Aktiv / deaktiviert
 *
 * **Aktionen (Zielbild):**
 * - Benutzer deaktivieren / aktivieren
 * - Projekte zuweisen / entfernen (wirksam über PROJECT_ACCESS)
 * - Rolle ändern (**über PROJECT_ACCESS**)
 * - Einladung erneut senden (falls Status „eingeladen“)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ROLLEN
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * **Listenansicht:** Rollenname, Beschreibung, Anzahl Nutzer (optional).
 *
 * **Detailansicht:** Rollenname, Beschreibung; **Hinweis:** Rolle ist nur **Vorlage** —
 * echte Rechte liegen in **PROJECT_ACCESS**.
 *
 * **Aktionen:** Rolle erstellen, bearbeiten, löschen (**nur wenn nicht verwendet**).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 3. FIRMEN
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * **Listenansicht:** Firmenname, Anzahl Benutzer, Anzahl Projekte.
 *
 * **Detailansicht:** Firmenname, zugehörige Benutzer, zugehörige Projekte.
 *
 * **Aktionen:** Firma erstellen, bearbeiten, deaktivieren.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PROJEKTE
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * **Listenansicht:** Projektname, Firma, Status (aktiv / inaktiv), Anzahl Benutzer.
 *
 * **Detailansicht:** Projektname, Firma, zugewiesene Benutzer (**über PROJECT_ACCESS**), Status.
 *
 * **Aktionen:** Projekt erstellen, bearbeiten, aktivieren / deaktivieren, Benutzer zuweisen
 * (wirksam über PROJECT_ACCESS).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 5. EINLADUNGEN
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * **Eigenständig:** Einladungen sind **nicht** Teil des Benutzer-Objekts in der UI-Struktur
 * (eigener Bereich, eigener Datensatz INVITATION).
 *
 * **Listenansicht:** E-Mail, Firma, Projekt (optional), intendedAccess, Status (offen /
 * angenommen / abgelaufen / widerrufen), erstellt am, Ablaufdatum.
 *
 * **Detailansicht:** vollständige Einladung; Ziel (Firma / Projekt); Rolle / intendedAccess;
 * Statusverlauf (fachlich — Umsetzung offen).
 *
 * **Aktionen:** Einladung senden, widerrufen, erneut senden.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ZUGÄNGE / GERÄTE / SESSIONS
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * **Listenansicht:** Benutzer, Gerät / Session, Gerätetyp (optional), letzte Aktivität
 * (optional), Status (aktiv / beendet).
 *
 * **Detailansicht:** zugehöriger Benutzer, Session-Daten, Aktivität.
 *
 * **Aktionen (später):** Session beenden, Gerät entfernen — **in dieser Anweisung nicht**
 * implementieren.
 *
 * **Wichtig:** nur **Transparenz**; **keine** eigene Rechteprüfung; keine Ersatz-Engine für
 * PROJECT_ACCESS.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 7. EINHEITLICHE STRUKTUR
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Alle genannten Bereiche: gleicher Aufbau (Liste → Detail → Aktionen), gleiche Denklogik,
 * **keine** fachlichen Sonderfall-Strukturen pro Modul.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 8. KLARE ABGRENZUNG
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Diese UI-Struktur = **Verwaltung**, **Kontrolle**, **Übersicht**.
 *
 * **Nicht:** Datenquelle, Rechte-Engine, Ersatz fürs Backend — Quelle der Wahrheit bleibt
 * Server/Modell; PROJECT_ACCESS bleibt zentrale Rechte-Zuordnung.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 9. EXPLIZIT NICHT TEIL DIESER ANWEISUNG
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Finales Design, Filterlogik, Suche, Pagination, API, Validierung, Session-Kill-Buttons.
 */

export {};
