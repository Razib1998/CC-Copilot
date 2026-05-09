# CC Cockpit — Master Design-Vorgabe (verbindlich)

**Status:** Feste Grundlage für alle Ansichten (Cockpit, FUSA, CC Intern, zukünftige Module).  
**Design-Referenz:** aktuelles **Dashboard** (Layout, Farben, Kompaktheit, Raster, Karten).  
**Technische Basis:** Stil C (`frontend/cc-design-styl-c.css`), Modul-Token an `#cockpit-root[data-app-module]`.

Abweichungen nur mit **ausdrücklicher Freigabe**.

---

## 1. Grundregel

- Gleiche **Struktur**, **Abstände**, **Farben**, **Kompaktheit**, **UI-Logik** wie die Referenz.
- Neue Screens orientieren sich am Dashboard und an bestehenden `ccds-*` / `ckp-dash-*` Mustern.

---

## 2. Layout-Prinzip (verpflichtend)

**Immer:**

- **Oben:** **4 KPI-Karten** in einer Reihe (einheitliches Raster).
- **Darunter:** **gleichmäßiges Grid** — keine einseitig breite Hauptspalte + schmale rechte Sidebar.

**Erlaubt:**

- Karten **unterschiedlich hoch** (z. B. „Termine heute“ höher), solange die **Breite** im Grid sauber bleibt.

**Verboten:**

- Alte Aufteilung: breite Mitte + schmale rechte Spalte als Standard-Layout.

---

## 3. Grid & Abstände

- **Kompakte** Abstände; **gleichmäßige Gaps** zwischen allen Cards.
- Keine großen Leerflächen; möglichst viel **above the fold** sichtbar halten.
- Konkrete Werte: an Dashboard- und Stil‑C‑CSS ausrichten (nicht neu erfinden).

---

## 4. Karten-System (Cards)

Alle Inhalte über **ein** Card-System:

- KPI-Cards, Listen-Cards, Widgets, Panels.

**Einheitlich:**

- Padding-Struktur, Border-Radius, Schatten, Header-Struktur (wie Dashboard / `ccds-table-card` / Panels).

**Verboten:** eigene Sonderkarten ohne Freigabe.

---

## 5. Farb-System (modulabhängig)

| Modul    | Akzent   |
|----------|----------|
| Cockpit  | Grün     |
| FUSA     | Orange   |
| CC Intern| Blau     |

- Aktive Elemente: jeweilige **Modul-Farbe** (Token in CSS: `--ccds-primary`, `--ccds-active-bg`, `--ccds-active-border`, `--ccds-active-text`).
- Sidebar Active, Top-Tabs Active, Buttons, Chips, Highlights: **Modul-Kontext** über `#cockpit-root[data-app-module]`.

**Verboten:** neue Farben ohne Freigabe.

---

## 6. Stil C (verpflichtend)

- Modern, **kompakt**, leicht pastellig, klare Kontraste, ruhige Flächen.
- Umsetzung: `cc-design-styl-c.css` + bestehende Shell; keine parallelen Design-Systeme.

---

## 7. Typografie

- Kompakte Größen; keine übergroßen Zahlen/Texte.
- Hierarchie: **Titel > Zahl > Label > Meta** (wie Dashboard-KPI und Listen).

---

## 8. Komponenten (Wiederverwendung)

Standard und **wiederverwenden**:

- KPI-Card (`ckp-dash-kpi-*` / gleiche visuelle Sprache)
- Listen-Card / Panel (`ckp-dash-panel*`, `ccds-table-card`, …)
- Status-Chips (`ccds-chip-*`, `ckp-dash-chip`)
- Buttons (z. B. `ccds-btn-neu`, `ccds-btn-primary`)
- Filter-Chips (`ccds-filter-chip`)
- Tabellen-Zeilen (Grid-Zeilen Stil C, keine klassischen HTML-Tabellen)
- Avatare (`ccds-avatar-*`, `ckp-dash-avatar`)

**Verboten:** neue Varianten ohne Freigabe.

---

## 9. Verboten

- Neue Layout-Struktur erfinden (abweichend von Raster + Referenz).
- Sidebar-Varianten bauen.
- Andere Farbpalette einführen.
- Abweichende Card-Designs.
- Alte breite „Links groß, rechts schmal“-Layouts zurückbringen.

---

## 10. Gültigkeit

Gilt für: **CC Intern**, **FUSA**, **Cockpit**, **zukünftige Module**.

---

## 11. Prüfliste bei jeder Umsetzung

- [ ] Grid- und Karten-Logik wie Referenz (4 KPI, ausgewogenes Grid)?
- [ ] Modul-Farben nur über definierte Token?
- [ ] Stil C eingehalten?
- [ ] Keine neue, frei erfundene Struktur?

Wenn ja → Umsetzung im Sinne dieser Vorgabe.

---

## Referenz-Dateien (Code)

- `frontend/cc-design-styl-c.css` — Stil C, Modul-Token, Komponenten; Harmonisiert Legacy-Views über `.ckp-view--styl-c-shell` (in `ccds-shell-root`).
- `frontend/cockpit-shell.css` — Dashboard-Layout (`ckp-dash-*`), Shell.
- `frontend/cockpit-shell.js` — Standard-Views: `renderCockpitShell` packt `ckp-section` in `ccds-shell-root` + `ckp-view--styl-c-shell`.
- `frontend/modules/cockpit/ui/views/cockpit-dashboard-view.js` — Dashboard-Struktur (HTML-Muster).
