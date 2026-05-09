/**
 * @file CC Cockpit — Verknüpfung Dashboard ↔ Verwaltungsbereiche (fachlich, „Anweisung 6“).
 *
 * **Ziel:** Das Dashboard ist **Einstieg**; Verwaltungsbereiche sind **Arbeitsebene**. Klicks auf
 * Kennzahlen und Elemente führen in **bestehende** Bereiche mit **sinnvoller Vorfilterung** —
 * **ohne** neue Datenlogik, **ohne** zusätzliche Rechteprüfung, **ohne** zusätzliche Datenquelle.
 * Nur **Navigation + Vorfilterung** (fachlich beschrieben; technische Umsetzung später).
 *
 * **Nicht Teil dieser Anweisung:** Animationen, komplexes Routing, Deep-Link-Struktur,
 * persistente Filter-Speicherung, **Definition von URL-Parametern** — bewusst offen.
 *
 * @see ./ccw-cockpit-verwaltung-ui-struktur.js — Liste / Detail / Aktionen je Bereich
 * @see ./ccw-cockpit-dashboard-kontrollsicht.js — welche Kennzahlen/Sichten das Dashboard trägt
 * @see ./ccw-cockpit-admin-bereiche.js — Abgrenzung Bereiche
 * @see ./ccw-platform-data-model.js — PROJECT_ACCESS, INVITATION, USER, SESSION, DEVICE
 */

// ═══════════════════════════════════════════════════════════════════════════════
// GRUNDPRINZIP
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * **Dashboard = Einstieg** | **Verwaltungsbereich = Arbeitsebene**
 *
 * Ein Klick führt zu: **einem bestehenden Bereich** + **gesetztem Filter** (keine parallele
 * „Dashboard-only“-Liste für dieselbe fachliche Menge).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BENUTZER-KENNZAHLEN → BENUTZERLISTE
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * | Kennzahl / Klick        | Ziel              | Vorfilter (fachlich)   |
 * |-------------------------|-------------------|-------------------------|
 * | Aktive Benutzer         | Benutzerliste     | status = aktiv          |
 * | Eingeladene Benutzer    | Benutzerliste     | status = eingeladen     |
 * | Deaktivierte Benutzer   | Benutzerliste     | status = deaktiviert    |
 *
 * **Wichtig:** **dieselbe** Benutzerliste; **nur** der Filter wechselt — **keine** separate Seite
 * für dieselbe Übersicht.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 2. EINLADUNGEN → EINLADUNGSBEREICH
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * | Klick              | Ziel         | Vorfilter (fachlich) |
 * |--------------------|--------------|-----------------------|
 * | Offene Einladungen | Einladungen  | status = offen        |
 *
 * **Optional** (gleicher Bereich, andere Filter): abgelaufen, widerrufen — analog zu
 * Listenfiltern des Einladungsbereichs, keine neue Datenquelle.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 3. MOBILE / APP-ZUGÄNGE → BENUTZERLISTE
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * | Klick           | Ziel           | Vorfilter (fachlich)   |
 * |-----------------|----------------|-------------------------|
 * | CC Intern Nutzer| Benutzerliste  | access = cc_intern_app  |
 * | FUSA Nutzer     | Benutzerliste  | access = fusa_app       |
 *
 * **Datenbasis:** Abbildung aus **PROJECT_ACCESS** (und ggf. intendedAccess im
 * Einladungskontext bis zur Übernahme) — **keine** eigene Parallel-Struktur für „App-Nutzer“.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SESSIONS / GERÄTE → ZUGÄNGE-BEREICH
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * | Klick            | Ziel                          | Vorfilter (fachlich)   |
 * |------------------|-------------------------------|-------------------------|
 * | Aktive Sessions  | Zugänge / Geräte / Sessions   | optional: status = aktiv |
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 5. LISTENELEMENTE IM DASHBOARD → DETAILANSICHT
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Kurz-Snapshots oder Listen **im** Dashboard (falls vorhanden):
 * - Klick **Benutzer** → **Benutzer-Detail** (bestehender Bereich)
 * - Klick **Einladung** → **Einladungs-Detail**
 * - Klick **Gerät/Session** → **Session-Detail** (Zugänge-Bereich)
 *
 * **Keine** Bearbeitung an dieser Stelle — nur Navigation zur Detailansicht.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 6. KEINE DIREKTE BEARBEITUNG IM DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Dashboard **darf nicht:** Benutzer/Rollen ändern, Einladungen anlegen, Sessions beenden.
 *
 * Dashboard **ist nur:** Navigation + Übersicht.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FILTER-ÜBERGABE (FACHLICH)
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Beim Wechsel Dashboard → Bereich können **fachlich** übergeben werden (an die **bereits**
 * im Verwaltungsbereich vorgesehenen Filter — keine neuen Filterdimensionen erfinden):
 * - **status** (Benutzer, Einladung, Session je nach Bereich)
 * - **access** (cc_intern_app, fusa_app — Benutzerliste)
 * - optional **projektId**
 * - optional **firma** / companyId
 *
 * Konkrete Träger (State, Query, internes Event) — **nicht** in dieser Anweisung festlegen.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 8. EINHEITLICHES VERHALTEN
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Alle Dashboard-Klicks: gleiches Verhalten — **direkt** zur passenden **Liste** oder **Detail**,
 * **klar** vor gefiltert, **ohne** unnötige Umwege.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 9. EXPLIZIT NICHT TEIL DIESER ANWEISUNG
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Animationen; komplexes Routing; Deep Links; Filter-Persistenz; URL-Parameter-Spezifikation;
 * Implementierung.
 */

export {};
