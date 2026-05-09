# CC Intern Desktop

Operatives Arbeitsmodul der CC-Cockpit-Plattform.
Läuft lokal im Büro-WLAN auf Port 3002.

## Starten

```
CC-INTERN-STARTEN.bat
```
oder:
```
node server.js
```

## Was ist wo

| Bereich | Pfad |
|---|---|
| Architektur + Systemlinie | [docs/ARCHITECTURE.md](ARCHITECTURE.md) |
| Entwicklungsstand + Details | [docs/DEV_STATE.md](DEV_STATE.md) |
| Server | `server.js` (Root) |
| Frontend | `index.html` (Root, ~15.800 Zeilen) |
| Datenspeicher | `data/*.json` |
| Adapter-Schicht | `js/core/` ✅ migriert |
| DataService | `js/services/` ✅ migriert |
| Auftrags-Module | `js/modules/auftraege/` ✅ aktiv |

## Modul-Übersicht

| Modul | Seite / Datei | Status |
|---|---|---|
| Dashboard | pg-dashboard | ✅ aktiv |
| Aufträge | pg-auftraege | ✅ aktiv |
| Auftragsdetail | js/modules/auftraege/detail.js | ✅ aktiv |
| Kalender | pg-kalender + kalender.js | ✅ aktiv |
| Dateien / Uploads | detail.js + dateien.js | ✅ aktiv |
| Checklisten | detail.js + checklisten.js | ✅ aktiv |
| Kommunikation | detail.js + kommunikation.js | ✅ aktiv |
| Abnahme / Doku | detail.js (renderAbnahmeBlock) | ✅ aktiv |
| Angebote | pg-angebote | ✅ aktiv |
| Kunden | pg-kunden | ✅ aktiv |
| CRM | pg-crm | ✅ aktiv |
| Produktion | pg-produktion | ✅ aktiv |
| Lager | pg-lager | ✅ aktiv |
| Mitarbeiter | pg-mitarbeiter | ✅ aktiv |
| Urlaub | pg-urlaub | ✅ aktiv |
| Rechnungen | pg-rechnungen | ✅ aktiv |
| Mobile-Ansicht | pg-mobil | ✅ aktiv |

## Neue Modul-Dateien (js/modules/auftraege/)

| Datei | Funktion |
|---|---|
| `detail.js` | Abnahme & Dokumentation-Block (renderAbnahmeBlock) |
| `kalender.js` | Liefertermin-Events, Filter-Tabs, Tages-Panel |
| `dateien.js` | Drag & Drop, Datei-Typ-Filter |
| `checklisten.js` | Vorlagen-Picker, Schritt-Übersicht |
| `kommunikation.js` | Chat-Filter (Fragen), Zitieren, Löschen |

## Plattform-Grenze

CC Intern übernimmt **nicht**:
- Login / Auth → CC Cockpit
- Benutzerverwaltung → CC Cockpit
- Projektverwaltung → CC Cockpit
- FUSA-Bereiche → FUSA-Modul
