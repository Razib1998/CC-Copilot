/**
 * @file CC Cockpit — Sicherheits-, Login-, Einladungs- und Sessionlogik (fachlich, „Anweisung 3“).
 *
 * **Geltungsbereich:** Zugangssystematik für CC Cockpit und angebundene Kanäle (Web/Desktop,
 * mobiler Browser, CC Intern App, FUSA Werkstatt-App). **Keine** zweite Login-Welt für Apps
 * vs. Desktop; **keine** Rechteebene neben oder statt PROJECT_ACCESS (siehe
 * ccw-platform-data-model.js); **keine** lokale Speicherung von **fachlichen** Arbeitsdaten auf dem Gerät
 * als Standard.
 *
 * **Nicht Teil dieser Datei:** konkrete UI (Login-Screens, Session-Kill), Passwort-Reset-Flows,
 * JWT vs. Cookie vs. Speicherort, Laufzeiten, Refresh, API-Endpunkte, Security-Header,
 * Backend-Validierung — nur **fachliche** Festlegung.
 *
 * @see ./ccw-platform-data-model.js — USER, INVITATION, SESSION, DEVICE, PROJECT_ACCESS
 * @see ./ccw-cockpit-admin-bereiche.js — Bereich Einladungen; Zugänge/Geräte/Sessions
 */

// ── Grundprinzip ────────────────────────────────────────────────────────────────
/**
 * **Einheitlicher Einstieg:** Mitarbeiter, Externe, Kunden und Werkstatt folgen demselben
 * **fachlichen** Grundablauf:
 *
 * **Einladung → Link öffnen → Passwort setzen / Zugang bestätigen → eingeloggt bleiben**
 *
 * Anschließend läuft der Zugang über **Token/Session**; **fachliche Daten kommen live vom Server**.
 * Unterschiede zwischen Nutzergruppen entstehen **nicht** durch ein anderes Login-System, sondern
 * durch **Rechte, intendedAccess (Einladung) und PROJECT_ACCESS** (wirksam nach Einrichtung).
 */

// ── 1. Einladung als Einstieg ───────────────────────────────────────────────────
/**
 * Die **Einladung** ist der **offizielle** Einstieg ins System (eigener Datensatz INVITATION,
 * nicht „nur“ Mail oder Nachricht).
 *
 * **Grundablauf:**
 * - Benutzer wird eingeladen.
 * - Einladung enthält u. a. Rolle, Firma, optional Projekt, **intendedAccess** (Anknüpfung an
 *   die später in PROJECT_ACCESS geltenden Dimensionen — keine zusätzliche Rechtewelt).
 * - Benutzer öffnet den **Einladungslink** (Token in INVITATION).
 * - Benutzer **setzt Passwort** oder **bestätigt Zugang** (Produkt/regulatorisch zu präzisieren).
 * - Danach ist der Zugang **aktiv** (Account/Session — technisch umzusetzen).
 *
 * **Status:** Einladung kann **offen**, **angenommen**, **abgelaufen** oder **widerrufen** sein.
 */

// ── 2. Login-Grundlogik ─────────────────────────────────────────────────────────
/**
 * Nach erfolgreicher Einladung bzw. Passwortsetzung ist der Benutzer **normal eingeloggt**.
 *
 * **Fachliche Regeln:**
 * - Kein Prinzip des **ständigen** erneuten Logins für den Alltag; der Benutzer soll auf
 *   **Desktop und Handy** normal weiterarbeiten können (bis Session endet oder entzogen wird).
 * - **Login-Grundprinzip** ist für alle Nutzerarten **gleich**; Abweichungen sind **Sicht**
 *   und **Zugriff**, nicht ein paralleles Identitäts-/Login-System pro Modul.
 */

// ── 3. Token- / Session-Grundlogik ───────────────────────────────────────────────
/**
 * Nach dem Login erhält **jedes Gerät** eine **eigene Session** / ein **eigenes Token** (1:1
 * fachliche Zuordnung: Gerät ↔ laufende Sitzung, serverseitig nachvollziehbar).
 *
 * **Regeln:**
 * - Das **Gerät** hält **nur** die zur Authentifizierung/Session nötigen Informationen
 *   (Token-Referenz, Session-Kennung — **ohne** fachlichen Arbeitsbestand).
 * - **Alle Inhalte** (Geschäftsdaten) kommen **live vom Server** bei Nutzung.
 * - Der Benutzer **bleibt eingeloggt**, bis die Session **endet** (Ablauf, Abmeldung,
 *   Entzug, Sperre) — kein „nerviger Dauer-Login“ als Zielbild.
 * - **Server** ist die **führende Instanz** für Gültigkeit der Session und für Daten.
 */

// ── 4. Keine lokale Datenhaltung (fachlich) ──────────────────────────────────────
/**
 * Auf Geräten sollen **keine fachlichen Arbeitsdaten dauerhaft** als **lokaler Bestand**
 * vorgesehen werden (Standard).
 *
 * **Konsequenzen:**
 * - kein lokaler Arbeitsbestand / keine Schattenkopie der Geschäftsdaten als Standard;
 * - **keine Offline-Datenhaltung** als Standard;
 * - das Gerät hält **Session/Token**, nicht die eigentlichen Geschäftsdaten.
 *
 * **Nutzen (fachlich):** geringeres Datenrisiko bei Geräteverlust; keine manuelle Löschung
 * fachlicher Daten auf dem Gerät als Sicherheitsmaßnahme; **zentrale Sperre** kann sofort
 * wirken (siehe Abschnitt 5).
 */

// ── 5. Sperren / Entziehen / Sofortwirkung ──────────────────────────────────────
/**
 * **Deaktivierung oder Sperre** eines Benutzers muss den Zugang **sofort** (fachlich: ohne
 * verlässliche Weiterarbeit mit bisheriger Session) **wirkungslos** machen.
 *
 * **Regeln:**
 * - Account **deaktivieren** = **kein** weiterer Zugriff.
 * - **Session/Token** müssen **serverseitig** unwirksam werden (Invalidierung / Ablehnung
 *   bei nächster Prüfung — technische Umsetzung offen).
 * - Gilt **gleichermaßen** für Desktop- und **mobile** Zugänge (kein „altes Handy“ als
 *   dauerhafter Restzugang).
 * - Das **Cockpit** als Steuerzentrale soll diese Kontrolle **zentral** ermöglichen
 *   (Sicht Geräte/Sessions/Benutzerstatus; Umsetzung der Kill-UI nicht Gegenstand dieser Datei).
 */

// ── 6. Einheitliche Zugangslogik, unterschiedliche Sichten ──────────────────────
/**
 * Der **Login-Ablauf** ist **einheitlich**; die **Sicht nach Login** hängt von **PROJECT_ACCESS**,
 * der historischen **intendedAccess**-Ausprägung der Einladung (bis in PROJECT_ACCESS
 * überführt) und **Modul-/App-Freigaben** ab.
 *
 * **Beispiele (fachlich):**
 * - **CC Intern:** Web/Desktop-Zugang; optional **CC Intern App** — **keine** eigene Rechtewelt,
 *   gleiche fachliche Grundlage wie zugewiesen (PROJECT_ACCESS / Modulbits).
 * - **Kunde / externer Web-Nutzer:** normaler **Web-Zugang**, mobil im Browser **zulässig**,
 *   **gleiche** Rechtebasis, andere Darstellung.
 * - **Werkstatt:** **begrenzter** Zugang gemäß Vorgabe (intendedAccess / FUSA-Werkstatt-Kontext,
 *   **FUSA Werkstatt-App**), **kein** voller allgemeiner Modulzugang ohne Zuweisung.
 *
 * **Wichtig:** keine parallelen Login-Systeme pro Nutzertyp; Unterschiede = **Zugriff**, nicht
 * der grundsätzliche Einstiegsmechanismus.
 */

// ── 7. Mobile / App-Grundsätze ───────────────────────────────────────────────────
/**
 * **CC Intern App:** mobiler Zugang zum Arbeitskontext; **keine** separate Rechtewelt;
 * Ausprägung gemäß PROJECT_ACCESS (inkl. hasCcInternAppAccess o. ä.).
 *
 * **FUSA Werkstatt-App:** **Spezialzugang** mit begrenztem Funktionsrahmen; **kein** Ersatz
 * für vollen Plattformzugang ohne explizite Freigabe (hasFusaWerkstattAppAccess o. ä.).
 *
 * **Web auf dem Smartphone:** **zulässig**, kein Sonderfall der Identität — gleiche Rechte,
 * andere UI-Geometrie.
 */

// ── 8. Geräte / Sessions sichtbar machen ──────────────────────────────────────────
/**
 * Im Cockpit soll (später) **Transparenz** bestehen: welcher Benutzer **aktuell** Zugang hat,
 * welche **Kanäle** freigegeben sind, welche **Geräte/Sessions aktiv** sind, **letzte
 * Aktivität** (optional).
 *
 * **Abgrenzung:** das ist **Kontroll- und Sicherheitssicht**, **keine** Ersatz-**Rechteprüfung**
 * gegenüber PROJECT_ACCESS; ergänzt die Admin-/Super-Admin-Transparenz.
 */

// ── 9. Token / Session — technisch bewusst offen ────────────────────────────────
/**
 * **In dieser Anweisung nicht festgelegt:** JWT vs. Cookie vs. anderer Träger; konkrete
 * Laufzeiten; Refresh-Mechanik; browser-/plattformspezifische Speicherung; konkrete Endpunkte.
 *
 * **Fachlich festgehalten:** Gerät hält nur Session/Token-Bezug; **Server prüft** Zugriff;
 * **Sperren** wirkt **sofort**; Benutzer bleibt bis dahin **normal eingeloggt**.
 */

// ── 10. Explizit nicht Teil dieser Festlegung ───────────────────────────────────
/**
 * - Finale Login-Screens, Passwort-Reset-Flow, Session-Kill-UI
 * - API-Implementierung, Backend-Validierung, endgültige Security-Header
 *
 * Nur: fachliche Zugangssystematik, Sessionlogik inhaltlich, Sicherheitsprinzipien.
 */

export {};
