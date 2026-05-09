## 1. SYSTEM-INFO
- Backend: Node.js, SQLite, Port 5371
- Frontend: Vite, Port 3000
- Login: info@cc-werbung.de / Passwort aus .env
- DB: backend/data/cc-cockpit.db
- Server starten: node src/server.js (NUR aus eigenem PowerShell, NICHT aus Cursor)

## 2. WICHTIGE TECHNISCHE REGELN
- apiFetch gibt bereits entpacktes data zurück (kein res.data.x sondern res.x)
- x-project-id Header MUSS bei allen /api/v1/* Requests mitgeschickt werden
- sql.js speichert IN-MEMORY — Server muss aus sein bevor DB direkt bearbeitet wird
- window.CCIntern.auth.apiFetch nutzen (kein dynamisches import())
- Kein dynamisches import() in klassischen Script-Dateien (Vite-Konflikt)
- auftraege-detail-view.js überschreibt globale Funktionen — immer mit if (!window.__CCINTERN_COCKPIT_MOUNT__) schützen

## 3. MODUL-STATUS

### FUSA (/api/v1/fusa/*)
- ✅ Aufträge — vollständig
- ✅ Kunden — vollständig
- ✅ Fahrzeuge — vollständig
- ✅ Rechnungen — vollständig
- ✅ Angebote — vollständig
- ✅ Schäden — vollständig
- ❌ Dokumente/Upload — nur Platzhalter

### CC Intern (/api/v1/ccintern/*)
- ✅ Aufträge — vollständig
- ✅ Checklisten — vollständig
- ✅ Mitarbeiter — vollständig
- ✅ Schnell-Anfragen — vollständig (fix: window.CCIntern.auth)
- ✅ Angebote — vollständig (fix: window.CCIntern.auth)
- ✅ Dashboard — vollständig
- ⚠️ Kunden — Löschen fehlt
- ⚠️ MesseFlow — nicht durchgängig
- ⚠️ Produktion — falsche API angebunden
- ⚠️ Kalender — nur lesen, kein schreiben
- ⚠️ Mitarbeiter-App — teilweise angebunden
- ❌ Rechnungen — Frontend nur TODO
- ❌ Urlaub — Frontend fehlt komplett
- ❌ Materiallager — Frontend nicht fertig
- ❌ CRM — Frontend völlig getrennt

### Cockpit (/api/v1/*)
- ✅ Benutzer — vollständig
- ✅ Rollen — vollständig
- ✅ Firmen/Kunden — vollständig
- ✅ Einladungen — vollständig
- ✅ Kalender — vollständig

## 4. MITARBEITER (aktuell in DB)
CE - Celal Cetinkaya
EL - Elvan Sen
IL - Ilayda Sen
ZI - Jutta Zint
ME - Melanie Neuert
MT - Mete Toptas
MO - Muhammed Muhammed
MU - Muhammet Ali Cetinkaya
OK - Okan Kayaaslan
SE - Selim Aydogdu

## 5. BEKANNTE BUGS / OFFENE PUNKTE
- migratePhase45 fusa_dokumente: no such column auftrag_id (unkritisch, Server startet trotzdem)
- mysql-store.js: LIKE 'K-${year}-%' muss noch auf 'KD-${year}-%' geändert werden
- FUSA Dokument-Upload: noch nicht implementiert
- Foto-System (Strato/lokaler Server): noch nicht implementiert
- x-project-id Whitelist für alle CC Intern Routen prüfen

## 6. NÄCHSTE SCHRITTE (Reihenfolge)
1. CC Intern Rechnungen — Frontend anbinden
2. CC Intern Urlaub — Frontend bauen
3. CC Intern Materiallager — Frontend anbinden
4. ✅ CC Intern Dashboard — fertig
5. CC Intern Produktion — richtige API anbinden
6. CC Intern CRM — Frontend neu bauen
7. FUSA Dokument-Upload — implementieren
8. Foto-System Strato — implementieren

## 7. API ENVELOPE FORMAT
Alle /api/v1/* Antworten:
{ success: true, data: { ... } }
apiFetch in cc-auth-session.js entpackt automatisch → gibt data zurück
Beispiel: res.auftraege (nicht res.data.auftraege)

## 8. PROJEKT-KONTEXT
- Es gibt genau 1 Projekt in der DB
- getCurrentProjectId() muss aufgerufen werden
- Falls leer: hydrateCockpitAccessibleProjectsAndEnsureContext() aufrufen
