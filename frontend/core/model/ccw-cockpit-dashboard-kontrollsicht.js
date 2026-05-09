/**
 * @file CC Cockpit — Dashboard- und Super-Admin-Kontrollsicht (fachlich, „Anweisung 4“).
 *
 * **Grundsatz:** Das Cockpit-Dashboard ist die zentrale **Kontroll- und Übersichtsfläche** für
 * Admin und Super-Admin auf Benutzer, Zugänge, mobile Freigaben, Einladungen sowie
 * Geräte/Sessions. Es ist **keine** Rechtequelle und **keine** eigene Benutzer-/Rechtelogik —
 * die wirksame Steuerung bleibt bei PROJECT_ACCESS und den Stammdaten; das Dashboard **spiegelt**
 * und **unterstützt** Transparenz und Kontrollierbarkeit.
 *
 * **Nicht Teil dieser Datei:** finales UI-Design, Kacheln, Charts, Session-Kill, Gerät abmelden,
 * Detail-Tabellen-/Filterlogik, Backend, API.
 *
 * @see ./ccw-platform-data-model.js — USER, INVITATION, SESSION, DEVICE, PROJECT_ACCESS, COMPANY, ROLE, PROJECT
 * @see ./ccw-cockpit-admin-bereiche.js — Bereiche Benutzer, Einladungen, Zugänge/Geräte/Sessions; Dashboard-Grundsicht
 * @see ./ccw-cockpit-security-zugang.js — Einladung, Session/Token, Sperrwirkung, Apps vs. Web
 */

// ── Grundprinzip ────────────────────────────────────────────────────────────────
/**
 * Die Cockpit-Grundsicht soll **schnell** sichtbar machen:
 * - wer **aktuell aktiv** ist,
 * - wer **eingeladen**, aber noch nicht aktiv ist,
 * - wer **deaktiviert** ist,
 * - wer welche **Zugangskanäle** hat,
 * - welche **mobilen** Zugänge freigeschaltet sind,
 * - welche **Geräte/Sessions** aktuell existieren.
 */

// ── 1. Status-Sicht pro Benutzer ────────────────────────────────────────────────
/**
 * **Mindestens** erkennbar pro Benutzer: **aktiv**, **eingeladen** (noch nicht voll aktiv /
 * noch in Einladungs-/Onboarding-Zustand — fachliche Feinabstimmung mit INVITATION-Status),
 * **deaktiviert**.
 *
 * **Wichtig:** Status muss **schnell** sichtbar sein (Übersichtsebene), **nicht** nur tief in
 * Detailmasken.
 */

// ── 2. Sicht auf Zugangskanäle ──────────────────────────────────────────────────
/**
 * Pro Benutzer sichtbar: welche **Zugangskanäle** freigegeben sind — **mindestens:**
 * - Desktop/Web,
 * - **CC Intern App**,
 * - **FUSA Werkstatt-App**.
 *
 * **Wichtig:** **Mobile** Zugänge explizit und **schnell** erkennbar; Super-Admin soll sofort
 * sehen, wer **Handy-/App-Zugang** hat. Technische Abbildung über PROJECT_ACCESS-Felder
 * (hasCcInternAppAccess, hasFusaWerkstattAppAccess) und Web-Modulbits — **ohne** neue
 * Rechteebene im Dashboard.
 */

// ── 3. Sicht auf Rolle / Firma / Projektkontext ─────────────────────────────────
/**
 * Pro Benutzer nachvollziehbar **ohne** zu tiefe Detailverwaltung:
 * - **Firma** (Zugehörigkeit),
 * - **Projektkontext** (firmenweit vs. projektbezogen über PROJECT_ACCESS / Anzeige-Aggregation),
 * - **Rolle** als hinterlegte **Grundlage** (Vorlage ROLE, Zuweisung über PROJECT_ACCESS.roleId).
 *
 * Ziel: Freigaben **schnell einschätzen**, nicht vollständige Rechtematrix im Dashboard.
 */

// ── 4. Sicht auf Einladungen ────────────────────────────────────────────────────
/**
 * Einladungen sind **Teil der Kontrollsicht**, nicht nur Hintergrund-Datensatz.
 *
 * Sichtbar: **offen**, **angenommen**, **abgelaufen**, **widerrufen** (Status INVITATION).
 *
 * **Mindestens pro Einladung:** E-Mail, Firma, Projekt optional, **intendedAccess**, Status,
 * erstellt am, Ablaufdatum (weitere Felder siehe Datenmodell).
 */

// ── 5. Sicht auf Geräte / Sessions ─────────────────────────────────────────────
/**
 * **Später** inhaltlich: aktive **Geräte/Sessions**, Zuordnung zum **Benutzer**, **letzte
 * Aktivität** optional, **Gerätetyp / Gerätename** optional.
 *
 * **Abgrenzung:** **Transparenz- und Sicherheitsübersicht** für Admin — **kein** Ersatz für
 * serverseitige Zugriffsprüfung; ergänzt SESSION/DEVICE-Modell aus Sicht der Steuerzentrale.
 */

// ── 6. Dashboard-Grundsicht / Kennzahlen ────────────────────────────────────────
/**
 * Inhaltlich **Raum** für Aggregates (ohne Vorgabe von Widget-/Kachel-Optik):
 * - Anzahl **aktive** Benutzer,
 * - Anzahl **eingeladene** (noch nicht aktiv / in Einladungsfluss — Definition abstimmen),
 * - Anzahl **deaktivierte** Benutzer,
 * - Anzahl **offene** Einladungen,
 * - Anzahl Benutzer mit **CC Intern App**-Freigabe,
 * - Anzahl Benutzer mit **FUSA Werkstatt-App**-Freigabe,
 * - Anzahl **aktiver** Sessions/Geräte (optional).
 */

// ── 7. Priorität der Sicht (Super-Admin) ───────────────────────────────────────
/**
 * **Wichtigste Schnellkontrolle:**
 * - wer ist **drin** (aktiv / Session),
 * - wer hat **mobilen** Zugang,
 * - wer ist noch **eingeladen**,
 * - wer ist **deaktiviert**,
 * - welche **Geräte/Sessions** sind noch aktiv.
 *
 * Das Dashboard **unterstützt** diese Reihenfolge, ohne sofort in Detailverwaltung springen
 * zu müssen.
 */

// ── 8. Klare Abgrenzung ─────────────────────────────────────────────────────────
/**
 * **Dashboard =** Übersicht, Transparenz, Kontrollierbarkeit.
 *
 * **Dashboard ≠** eigene Rechtequelle, eigene Benutzerlogik, Ersatz für PROJECT_ACCESS,
 * Ersatz für Session-/Gerätemodell.
 */

// ── 9. Explizit nicht Teil dieser Festlegung ─────────────────────────────────────
/**
 * Finales UI, Kacheln, Charts, Session-Kill, Gerät abmelden, Detail-Tabellenlogik,
 * Filter/Suche im Detail — nur spätere Umsetzungsphasen.
 */

export {};
