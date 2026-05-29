# CC Cockpit — Daten löschen (Anleitung)

## Das wichtigste Prinzip

**sql.js lädt die komplette Datenbank beim Start in den RAM.**  
Alle Abfragen laufen gegen den RAM, nicht gegen die Disk-Datei.  
Externe Änderungen an der Disk-Datei (Scripts, Python) werden vom laufenden Prozess ignoriert — und beim nächsten Schreibvorgang mit der RAM-Version überschrieben.

**Regel: Immer den laufenden Prozess stoppen BEVOR die DB verändert wird.**

---

## Lokales Löschen (Desktop / Entwicklung)

### Vorbereitung
1. Backend stoppen: `Strg+C` im Terminal wo `npm start` läuft
2. Sicherstellen dass kein anderer Node-Prozess noch auf Port 5371 läuft:
   ```
   npx kill-port 5371
   ```
3. Vite (Frontend) stoppen falls nötig:
   ```
   npx kill-port 3000 3001
   ```

### Nur Kalender leeren
```
cd C:\Users\CC\Desktop\CC Cockpit_Strato\backend
node clear-kalender.js
```

### Alles löschen (Aufträge, Kunden, Kalender, Rechnungen, etc.)
```
cd C:\Users\CC\Desktop\CC Cockpit_Strato\backend
node reset.js
```

**Was reset.js löscht:** Aufträge, Kunden, Kalender, Rechnungen, Angebote, Urlaub, CRM, Messeflow, FUSA-Daten, Schäden, Audit-Log  
**Was reset.js behält:** Benutzer, Mitarbeiter, Fahrzeuge, Projekte, Rechte, Rollen, System-Firma

### Nach dem Löschen
```
npm start
```
Dann Frontend neu starten:
```
cd C:\Users\CC\Desktop\CC Cockpit_Strato\frontend
npm run dev
```
Browser: `Strg+Shift+R` (harter Refresh)

### Häufiger Fehler lokal
- Script zeigt `"before": { "kalender_termine": 0 }` → Tabelle war schon leer, aber Kalender zeigt trotzdem Einträge
- Ursache: Backend läuft noch im RAM mit alten Daten, oder Vite cached alten Stand
- Lösung: Alle Ports killen, neu starten, Browser hart refreshen

---

## Server löschen (Strato / Produktion)

### Zugang
Strato Plesk Panel → Extensions → SSH Terminal

### ⚠️ Kritische Reihenfolge — IMMER einhalten
**pm2 stop → Python → pm2 start**  
Wenn Python läuft während pm2 noch aktiv ist, überschreibt pm2 beim Neustart die Disk-Datei mit dem alten RAM-Stand → Löschung ist weg!

### Option A — Nur Aufträge + Kalender löschen (empfohlen für Test-Daten)

**Schritt 1 — Backup:**
```
cp /var/www/vhosts/cc-werbung-data.de/api.cc-werbung-data.de/data/cc-cockpit.db \
   /var/www/vhosts/cc-werbung-data.de/api.cc-werbung-data.de/data/cc-cockpit-backup-manuell.db
```

**Schritt 2 — pm2 stoppen:**
```
pm2 stop cc-cockpit
```
Warten bis Status `stopped` angezeigt wird.

**Schritt 3 — Daten löschen:**
```
python3 -c "
import sqlite3
db = '/var/www/vhosts/cc-werbung-data.de/api.cc-werbung-data.de/data/cc-cockpit.db'
conn = sqlite3.connect(db)
conn.execute('PRAGMA foreign_keys = OFF')
conn.execute('DELETE FROM ccintern_auftraege')
conn.execute('DELETE FROM ccintern_rechnungen')
conn.execute('DELETE FROM kalender_termine')
conn.commit()
conn.close()
print('Auftraege + Kalender geloescht')
"
```

**Schritt 4 — pm2 starten:**
```
pm2 start cc-cockpit
```

**Schritt 5 — Browser:**
`cockpit.cc-werbung-data.de` → `Strg+Shift+R`

---

### Option B — Alles löschen (kompletter Reset)

Gleiche Reihenfolge wie Option A, aber in Schritt 3 dieses Python-Script:
```
python3 -c "
import sqlite3
db = '/var/www/vhosts/cc-werbung-data.de/api.cc-werbung-data.de/data/cc-cockpit.db'
conn = sqlite3.connect(db)
conn.execute('PRAGMA foreign_keys = OFF')
for t in ['ccintern_rechnungen','kalender_termine','urlaub_antraege','crm_aktivitaeten','messeflow_projekte','ccintern_auftraege','ccintern_kunden_extra','fusa_belegungen','fusa_dokumente','fusa_kunden_extra','fusa_rechnungen','auftraege','kunden','cockpit_invites','audit_log','refresh_tokens','angebote','schaeden','schaden_fotos','messeflow_workspace']:
    try: conn.execute('DELETE FROM ' + t)
    except: pass
conn.commit()
conn.close()
print('DB komplett geleert')
"
```
**Behält:** Benutzer, Mitarbeiter, Fahrzeuge, Projekte, Rechte, Rollen, System-Firma

---

## Unterschiede lokal vs. Server auf einen Blick

| | Lokal | Server |
|---|---|---|
| Backend stoppen | `Strg+C` oder `npx kill-port 5371` | `pm2 stop cc-cockpit` |
| Reset-Script | `node reset.js` | Python-Script (nach pm2 stop!) |
| Frontend | Vite neu starten | nicht nötig |
| Gefahr | Vite-Cache | Python vor pm2 stop → Löschung geht verloren |
| Browser danach | `Strg+Shift+R` auf localhost:3000 | `Strg+Shift+R` auf cockpit.cc-werbung-data.de |

---

## Backup vor dem Löschen (empfohlen)

**Lokal:**
```
copy backend\data\cc-cockpit.db backend\data\cc-cockpit-backup-manuell.db
```

**Server:**
```
cp /var/www/vhosts/cc-werbung-data.de/api.cc-werbung-data.de/data/cc-cockpit.db \
   /var/www/vhosts/cc-werbung-data.de/api.cc-werbung-data.de/data/cc-cockpit-backup-manuell.db
```
