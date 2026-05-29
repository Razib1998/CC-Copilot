# Strato Server-Struktur — CC Cockpit

## Server-Info
- **Hoster:** Strato (Plesk)
- **Root-Pfad:** `/var/www/vhosts/cc-werbung-data.de/`
- **Server-Name:** `stoic-tharp` (Plesk-intern)
- **Server-Management:** `plesk help`

---

## Vhost-Übersicht

| Subdomain | Pfad auf Server | Inhalt |
|---|---|---|
| `cockpit.cc-werbung-data.de` | `/var/www/vhosts/cc-werbung-data.de/cockpit.cc-werbung-data.de/` | **Frontend (Vite-Build)** |
| `api.cc-werbung-data.de` | `/var/www/vhosts/cc-werbung-data.de/api.cc-werbung-data.de/` | **Backend (Node.js / Passenger)** |
| `cc-werbung-data.de` (Root) | `/var/www/vhosts/cc-werbung-data.de/httpdocs/` | Alte statische Seite (nicht das Cockpit!) |
| `messe.cc-werbung-data.de` | `/var/www/vhosts/cc-werbung-data.de/messe.cc-werbung-data.de/` | Messe-App |
| `istanbul.cc-werbung-data.de` | `/var/www/vhosts/cc-werbung-data.de/istanbul.cc-werbung-data.de/` | Istanbul-Projekt |

---

## Frontend-Deployment (`cockpit.cc-werbung-data.de`)

### Lokaler Build-Output
```
frontend/dist/
  index.html
  manifest.json
  assets/
    index-XXXX.js       ← Haupt-Bundle (Hash ändert sich bei jedem Build)
    index-XXXX.css
    cc-auth-session-XXXX.js
    ccintern-cockpit-api-XXXX.js
    ...weitere Bundles
  icons/
    icon-192.png
    icon-512.png
    ...
```

### Ziel-Struktur auf dem Server
```
/var/www/vhosts/cc-werbung-data.de/cockpit.cc-werbung-data.de/
  index.html              ← aus frontend/dist/index.html
  manifest.json
  favicon.ico
  apple-touch-icon.png
  assets/                 ← PFLICHT: index.html referenziert /assets/...
    index-XXXX.js
    index-XXXX.css
    cc-auth-session-XXXX.js
    ccintern-cockpit-api-XXXX.js
    ...alle weiteren *.js / *.css aus frontend/dist/assets/
```

### ⚠️ Wichtig: assets/-Unterordner ist Pflicht!
Das `index.html` (Vite-Build) referenziert alle Bundles mit `/assets/`-Prefix.
Wenn Dateien nur im Root liegen → 404-Fehler → leere Seite!

---

## Backend-Deployment (`api.cc-werbung-data.de`)

### Struktur auf Server
```
/var/www/vhosts/cc-werbung-data.de/api.cc-werbung-data.de/
  src/
    server.js             ← Einstiegspunkt
    ...
  data/                   ← Datenbank / persistente Daten
  node_modules/
  package.json
  package-lock.json
  passenger_startup.cjs   ← Phusion Passenger Startdatei
  tmp/
  backup 2026 05 19.zip
```

### Server-Prozess
- Läuft via **Phusion Passenger** (nicht systemd/pm2)
- **Neustart:** `kill -9 <PID>` → Passenger startet automatisch neu beim nächsten Request
- **PID ermitteln:** `ps aux | grep node | grep -v grep`
- ⚠️ KEIN `touch restart.txt` (löst persist() aus!) — immer `kill -9`

---

## Deployment-Prozess (nächstes Mal)

### Frontend updaten
1. Lokal in Cursor/Terminal: `npm run build` (im `frontend/`-Ordner)
2. Via **WinSCP oder FileZilla** verbinden (SFTP, Strato-Zugangsdaten)
3. Hochladen nach `/var/www/vhosts/cc-werbung-data.de/cockpit.cc-werbung-data.de/`:
   - `frontend/dist/index.html` → Root
   - `frontend/dist/assets/*` → `assets/`-Unterordner (erstellen falls nötig!)
   - Icons/Manifest → Root
4. Alte Hash-Dateien können im `assets/`-Ordner bleiben (schaden nicht)

### Alternativ via SSH + wget (falls Repo public auf GitHub)
```bash
cd /var/www/vhosts/cc-werbung-data.de/cockpit.cc-werbung-data.de/assets/
wget https://raw.githubusercontent.com/ccwerbung-hue/CC-Cockpit-Clean/main/frontend/dist/assets/index-XXXX.js
# ... für jede neue Datei
```

### Backend updaten
1. Dateien via SFTP in `/var/www/vhosts/cc-werbung-data.de/api.cc-werbung-data.de/src/` hochladen
2. Server-Prozess neu starten: `kill -9 <PID>`

---

## Notfall-Checkliste: Leere Seite / 404

1. Browser-Konsole öffnen (F12) → Welche Dateien haben 404?
2. SSH auf Server: `ls /var/www/vhosts/cc-werbung-data.de/cockpit.cc-werbung-data.de/assets/`
3. Fehlen Dateien → hochladen (SFTP oder wget)
4. `assets/`-Ordner existiert nicht → `mkdir assets` + Dateien rein
5. Nach Upload: Browser Hard-Refresh (Strg+Shift+R)
