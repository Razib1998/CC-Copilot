/**
 * @file CC Cockpit — Einheitliche Filter-Logik und Zustände für Listen (fachlich, „Anweisung 7“).
 *
 * **Ziel:** Alle Listen (Benutzer, Rollen, Firmen, Projekte, Einladungen, Zugänge) nutzen
 * **dieselbe** fachliche Filter-Denkweise, **dieselben** Zustände/Begriffe, **dieselbe**
 * Übergabe (z. B. vom Dashboard) und **dieselbe** Reset-Idee — **ohne** dass jede Liste
 * eigene Sonderlogik erfindet.
 *
 * **Wichtig:** Filter sind **nur** Sicht-/Anzeige-Logik (Subset der Daten); sie **ändern**
 * keine Persistenz, speichern nichts, erzeugen keine zweite Datenquelle. Datenbasis bleibt
 * die bestehende Server-/Modellwelt (u. a. PROJECT_ACCESS, INVITATION, USER, PROJECT).
 *
 * **Nicht Teil dieser Anweisung:** konkrete UI-Widgets (Dropdown, Chips), URL-Parameter,
 * Filter-Persistenz, Server-Query-Form, Pagination, Suche.
 *
 * @see ./ccw-cockpit-dashboard-verwaltung-navigation.js — Übergabe von Filtern beim Einstieg
 * @see ./ccw-cockpit-verwaltung-ui-struktur.js — Listen-/Detail-Struktur je Bereich
 * @see ./ccw-platform-data-model.js
 */

// ═══════════════════════════════════════════════════════════════════════════════
// GRUNDPRINZIP
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * **Gleich** über alle Listen: Filter-Denkweise, Zustände, Übergabe (Dashboard → Bereich),
 * Reset-Logik. Keine doppelte **fachliche** Filterdefinition pro Modul.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 1. STANDARD-FILTERSTRUKTUR (fachlich)
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Jede Liste arbeitet **fachlich** mit einem **Filter-Objekt** aus **dieselben** Dimensionen,
 * soweit für den Bereich sinnvoll (nicht jedes Feld muss in jeder Liste gesetzt sein):
 *
 * - **status** — siehe Abschnitt 2 (bedeutungsabhängig vom Bereich)
 * - **access** — siehe Abschnitt 3 (primär Benutzerliste)
 * - **projectId** — Kontextfilter (optional)
 * - **companyId** — Kontextfilter (optional)
 *
 * **Wichtig:** keine listenspezifischen **Synonyme** für dieselbe Sache (ein Begriff im ganzen System).
 * Listen ohne passendes Feld lassen Dimensionen **unset** / ignorieren sie.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 2. STATUS-FILTER (zentral, feste Begriffe)
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * **Status** ist der zentrale Filter; **Werte sind pro Entitätstyp fest** — nicht pro Modul
 * anders benennen.
 *
 * **Benutzer:** `aktiv` | `eingeladen` | `deaktiviert`
 *
 * **Einladungen:** `offen` | `angenommen` | `abgelaufen` | `widerrufen`
 *
 * **Projekte:** `aktiv` | `inaktiv`
 *
 * **Sessions (Zugänge-Liste):** `aktiv` | `beendet`
 *
 * **Rollen / Firmen:** kein zwingender globaler Status-Filter in dieser Festlegung —
 * falls später ergänzt, **dieselbe** Namenskonvention (klein, unterstrichen optional je
 * Implementierung) und keine parallelen Begriffe.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ACCESS-FILTER (Zugänge, Benutzerliste)
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Für **Benutzerlisten** (Sicht „wer hat welchen Kanal“):
 *
 * - `web` — Desktop/Web-Zugang (gemäß PROJECT_ACCESS Web/Modulbits — fachliche Abbildung)
 * - `cc_intern_app` — CC Intern App
 * - `fusa_app` — FUSA Werkstatt-App
 *
 * **Datenbasis:** PROJECT_ACCESS (bzw. intendedAccess bis zur Übernahme) — **keine** neue
 * Datenstruktur nur für Filter.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 4. KONTEXT-FILTER
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * **Optional:**
 * - **projectId** — z. B. Benutzer eines Projekts (über PROJECT_ACCESS-Zuordnung)
 * - **companyId** — z. B. Benutzer einer Firma
 *
 * Gleiche Feldnamen überall; Bedeutung: eingrenzender Kontext für die **Anzeige**.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FILTER-KOMBINATION
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Mehrere gesetzte Filter: fachlich **UND (AND)** — alle Bedingungen gleichzeitig erfüllt.
 *
 * Beispiel: `status = aktiv` **und** `access = cc_intern_app` **und** `projectId = X`.
 *
 * **Wichtig:** keine widersprüchlichen Filter **setzen** (fachlich); UI/Validierung später —
 * nicht Gegenstand dieser Datei.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 6. FILTER-HERKUNFT
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Gleiche Logik, egal ob Filter kommt von:
 * - **Dashboard** (Kachel/Kennzahl),
 * - **Benutzerinteraktion** (später: Dropdown o. Ä.),
 * - **Navigation** (Bereich öffnen mit initialem Filter).
 *
 * **Keine** Sonderbehandlung „nur weil vom Dashboard“.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 7. RESET-LOGIK
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Jede Liste: **Zurücksetzen** aller Filter → **alle anzeigen** (kein versteckter aktiver Filter).
 * Nutzer soll jederzeit **Klarheit** über die aktuelle Sicht haben.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 8. EINHEITLICHES VERHALTEN
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Alle Listen: gleiche Reaktion auf Filter, gleiche **Begriffe**, gleiche fachliche
 * Kombinations- und Reset-Logik.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 9. KEINE EIGENE DATENLOGIK
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Filter **dürfen nicht:** Daten am Server ändern, persistieren oder parallele „Filter-State“-
 * Datenhaltung als zweite Wahrheit sein.
 *
 * Filter **sind:** **Anzeige** / **Auswahl** — Subset der geladenen bzw. abzufragenden Menge
 * (Server-Query-Details: nicht hier).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 10. EXPLIZIT NICHT TEIL DIESER ANWEISUNG
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * UI-Elemente, URL, Speicherung, Server-Queries, Pagination, Suche.
 */

export {};
