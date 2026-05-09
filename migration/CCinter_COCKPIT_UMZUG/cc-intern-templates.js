// ═══════════════════════════════════════════════════════════════════
// CC INTERN — HTML Templates
// Enthält: Shell-HTML für alle Module (Sidebar + Topbar + Pages)
// Kunden-Tab: hidden (Cockpit liefert Kunden via loadCockpitData)
// ═══════════════════════════════════════════════════════════════════

window.CCIntern = window.CCIntern || {};
window.CCIntern.templates = window.CCIntern.templates || {};

window.CCIntern.templates.getShellHTML = function() {
  return `<!-- SIDEBAR -->
<div class="sb">
  <div class="sb-brand">
    <div class="sb-logo">
      <div class="sb-icon">CC</div>
      <div><div class="sb-title">CC Intern</div><div class="sb-sub">CC Werbung GmbH</div></div>
    </div>
    <div class="sys-switch">
      <span class="sys-pill cc">CC Intern</span>
      <span class="sys-pill fusa" onclick="goPage('kalender',document.querySelector('.sb-link[onclick*=kalender]'),'Montage-Kalender','Termine &amp; Beklebungen')">FUSA</span>
      <span class="sys-pill ma" onclick="ccOpenTeamView()">Team</span>
    </div>
  </div>
  <div class="sb-nav">
    <div class="sb-grp">Übersicht</div>
    <div class="sb-link active" onclick="goPage('dashboard',this,'Dashboard','CC Intern Übersicht')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      Dashboard
    </div>
    <div class="sb-grp">Vertrieb</div>
    <div class="sb-link" onclick="goPage('anfragen',this,'Schnell-Anfragen','Angebote in 2 Minuten')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/><path d="M9 12h6M9 16h4"/><circle cx="18" cy="18" r="3" fill="var(--green)" stroke="none"/><path d="M16.5 18l1 1 2-2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>
      Schnell-Anfragen
      <span class="sb-badge a">2</span>
    </div>
    <div class="sb-link" onclick="goPage('angebote',this,'Angebote','Angebotsverwaltung')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      Angebote
      <span class="sb-badge">8</span>
    </div>
    <div class="sb-link" onclick="goPage('auftraege',this,'Aufträge','Auftragsverwaltung')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      Aufträge
      <span class="sb-badge a">3</span>
    </div>
    <div class="sb-link" style="display:none;" onclick="goPage('kunden',this,'Kunden','Kundenstamm & Aufträge')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      Kunden
    </div>
    <div class="sb-link" onclick="goPage('crm',this,'CRM','Kunden & Aktivitäten')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
      CRM
    </div>
    <div class="sb-grp">Produktion</div>
    <div class="sb-link" onclick="goPage('produktion',this,'Produktion','Workflow & Status')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Produktion
      <span class="sb-badge r">2</span>
    </div>
    <div class="sb-link" onclick="goPage('lager',this,'Materiallager','Bestand & Nachbestellung')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      Materiallager
    </div>
    <div class="sb-link" onclick="goPage('checklisten',this,'Checklisten','Vorlagen verwalten')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4M9 17l2 2 4-4"/></svg>
      Checklisten
    </div>
    <div class="sb-grp">Planung</div>
    <div class="sb-link" onclick="goPage('kalender',this,'Montage-Kalender','Termine & Beklebungen')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      Kalender
    </div>
    <div class="sb-grp">Personal</div>
    <div class="sb-link" onclick="goPage('mitarbeiter',this,'Mitarbeiter','Team & Zeitkonto')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      Mitarbeiter
    </div>
    <div class="sb-link" onclick="goPage('urlaub',this,'Urlaub & Abwesenheit','Anträge verwalten')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      Urlaub
      <span class="sb-badge g">2</span>
    </div>
    <div class="sb-grp">Buchhaltung</div>
    <div class="sb-link" onclick="goPage('mobil',this,'📱 Mitarbeiter-App','Handy-Ansicht für Monteure & Produktion')" style="border-left-color:#34C759;margin-top:6px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="18" r="1"/></svg>
      <span style="color:#34C759;font-weight:600;">Mitarbeiter-App</span>
    </div>
    <div class="sb-link" onclick="goPage('rechnungen',this,'Rechnungen','Eingangs- & Ausgangsrechnungen')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg>
      Rechnungen
      <span class="sb-badge r">1</span>
    </div>
  </div>
  <div class="sb-user">
    <div class="sb-av">CE</div>
    <div><div class="sb-un">Celal</div><div class="sb-ur">Geschäftsführung</div></div>
  </div>
</div>

<!-- MAIN -->
<div class="main">
  <div class="topbar">
    <div class="tb-title" id="tbTitle">Dashboard</div>
    <div class="tb-sep">›</div>
    <div class="tb-sub" id="tbSub">CC Intern Übersicht</div>
    <div class="tb-right">
      <!-- 🔔 Notification Bell -->
      <div style="position:relative;margin-right:4px;">
        <button id="cc-notif-btn" onclick="ccNotifToggle()" title="Benachrichtigungen"
          style="position:relative;width:34px;height:34px;border-radius:50%;border:none;background:var(--gray-l);color:var(--text2);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;">
          🔔
          <span id="cc-notif-badge" style="display:none;position:absolute;top:-2px;right:-2px;background:var(--red);color:#fff;font-size:9px;font-weight:700;border-radius:10px;padding:1px 5px;min-width:16px;text-align:center;border:2px solid #fff;"></span>
        </button>
        <!-- Dropdown -->
        <div id="cc-notif-dropdown" style="display:none;position:absolute;top:42px;right:0;width:340px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:9999;overflow:hidden;border:1px solid var(--border);">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px 10px;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;font-weight:700;color:var(--text);">🔔 Benachrichtigungen</span>
            <button onclick="ccNotifClear()" style="font-size:10px;color:var(--text2);border:none;background:none;cursor:pointer;padding:2px 6px;border-radius:4px;">Alle löschen</button>
          </div>
          <div id="cc-notif-list" style="max-height:360px;overflow-y:auto;"></div>
          <div id="cc-sync-status" style="padding:8px 14px;border-top:1px solid var(--border);font-size:10px;color:var(--text3);display:flex;align-items:center;gap:5px;">
            <span id="cc-sync-dot" style="width:7px;height:7px;border-radius:50%;background:#8E8E93;flex-shrink:0;"></span>
            <span id="cc-sync-text">Kein Server</span>
          </div>
        </div>
      </div>
      <button class="btn" onclick="ccSelbsttest()" style="font-size:11px;background:#4527A0;color:#fff;border-color:#4527A0;" title="Funktionstest ausführen">🧪 Test</button>
      <button class="btn" onclick="ccExport()" style="font-size:11px;" title="Alle Daten als JSON exportieren">⬇ Export</button>
      <label class="btn" style="font-size:11px;cursor:pointer;" title="JSON-Backup importieren">⬆ Import<input type="file" accept=".json" style="display:none;" onchange="ccImport(event)"></label>
      <input class="srch" placeholder="Suchen…">
      <button class="btn p" id="newBtn" onclick="handleNew()">+ Neues Angebot</button>
    </div>
  </div>

  <div class="content">

  <!-- ══ DASHBOARD ══ -->
  <div class="pg active" id="pg-dashboard">
    <div class="stats" style="grid-template-columns:repeat(4,1fr)">
      <div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div><div id="db-stat-angebote" class="sc-n" style="color:var(--blue)">—</div><div class="sc-l">Offene Angebote</div><div id="db-stat-angebote-vol" class="sc-t">—</div></div></div>
      <div class="sc" style="border-top-color:var(--amber)"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div><div><div id="db-stat-auftraege" class="sc-n" style="color:var(--amber)">—</div><div class="sc-l">Aktive Aufträge</div><div id="db-stat-auftraege-dringend" class="sc-t dn">—</div></div></div>
      <div class="sc" style="border-top-color:var(--red)"><div class="sc-ico" style="background:var(--red-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div><div id="db-stat-dringend" class="sc-n" style="color:var(--red)">—</div><div class="sc-l">Produktion dringend</div><div id="db-stat-dringend-info" class="sc-t dn">Liefer-/Montagetermin heute</div></div></div>
      <div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg></div><div><div id="db-stat-urlaub" class="sc-n" style="color:var(--green)">—</div><div class="sc-l">Urlaub offen</div><div id="db-stat-urlaub-info" class="sc-t">warten auf Genehmigung</div></div></div>
    </div>

    <div class="g2">
      <div>
        <div class="panel">
          <div class="ph"><div class="ph-title">Aktuelle Aufträge</div><button class="btn" onclick="goPage('auftraege',null,'Aufträge','')">Alle →</button></div>
          <table>
            <thead><tr><th>Auftrag</th><th>Kunde</th><th>Schritt</th><th>Status</th><th>Termin</th></tr></thead>
            <tbody id="db-auftraege-tbody">
              <tr><td colspan="5" style="text-align:center;color:var(--text3);padding:16px;font-size:12px;">Wird geladen…</td></tr>
            </tbody>
          </table>
        </div>
        <div class="panel">
          <div class="ph"><div class="ph-title">Offene Angebote</div><button class="btn" onclick="goPage('angebote',null,'Angebote','')">Alle →</button></div>
          <table>
            <thead><tr><th>Angebot</th><th>Kunde</th><th>Wert</th><th>Status</th></tr></thead>
            <tbody id="db-angebote-tbody">
              <tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px;font-size:12px;">Wird geladen…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="panel">
          <div class="ph"><div class="ph-title">Team</div></div>
          <div id="db-team-heute" style="padding:12px 16px;display:flex;flex-direction:column;gap:8px;">
            <div style="color:var(--text3);font-size:12px;text-align:center;padding:10px;">Wird geladen…</div>
          </div>
        </div>
        <div class="panel">
          <div class="ph"><div class="ph-title">Urlaub & Abwesenheit</div><button class="btn" onclick="goPage('urlaub',null,'Urlaub','')">Alle →</button></div>
          <div id="db-urlaub-liste" style="padding:12px 16px;display:flex;flex-direction:column;gap:8px;">
            <div style="color:var(--text3);font-size:12px;text-align:center;padding:10px;">Wird geladen…</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ SCHNELL-ANFRAGEN ══ -->
  <div class="pg" id="pg-anfragen">

    <!-- Stats -->
    <div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
      <div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/></svg></div><div><div class="sc-n" id="anf-stat-offen" style="color:var(--blue)">2</div><div class="sc-l">Offen</div></div></div>
      <div class="sc" style="border-top-color:var(--amber)"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div><div class="sc-n" id="anf-stat-angebot" style="color:var(--amber)">0</div><div class="sc-l">Angebot erstellt</div></div></div>
      <div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" id="anf-stat-gewonnen" style="color:var(--green)">5</div><div class="sc-l">Gewonnen</div></div></div>
      <div class="sc" style="border-top-color:var(--purple)"><div class="sc-ico" style="background:var(--purple-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg></div><div><div class="sc-n" id="anf-stat-umsatz" style="color:var(--purple)">€ 3.420</div><div class="sc-l">Ø Angebotswert</div></div></div>
    </div>

    <div class="g2">
      <!-- Linke Seite: Anfragen Liste -->
      <div>
        <div class="panel">
          <div class="ph">
            <div class="ph-title">Eingehende Anfragen</div>
            <div style="display:flex;gap:6px;">
              <button class="btn" onclick="telCheckOpen()" style="background:#fff;border-color:var(--green);color:var(--green);font-weight:700;">📞 Telefon-Check</button>
              <button class="btn p" onclick="anfNeuModal()">+ Neue Anfrage</button>
            </div>
          </div>
          <div id="anf-liste" style="padding:0;"></div>
        </div>
      </div>

      <!-- Rechte Seite: Angebot-Generator oder Detail -->
      <div id="anf-detail-wrap">
        <div class="panel" id="anf-detail-panel">
          <div class="ph">
            <div class="ph-title">Angebot-Generator</div>
            <div id="anf-gen-badge" style="display:none;"></div>
          </div>
          <div id="anf-detail-body" style="padding:16px;text-align:center;color:var(--text3);">
            <div style="font-size:40px;margin-bottom:10px;">⚡</div>
            <div style="font-size:14px;font-weight:500;margin-bottom:6px;">Anfrage auswählen</div>
            <div style="font-size:12px;">Klicke links eine Anfrage an, um ein Angebot in 2 Minuten zu erstellen.</div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <!-- ══ ANGEBOTE ══ -->
  <div class="pg" id="pg-angebote">

    <!-- Stats -->
    <div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
      <div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div><div class="sc-n" style="color:var(--blue)" id="ag-stat-bearbeitung">8</div><div class="sc-l">In Bearbeitung</div></div></div>
      <div class="sc" style="border-top-color:var(--amber)"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></div><div><div class="sc-n" style="color:var(--amber)" id="ag-stat-versendet">5</div><div class="sc-l">Versendet</div></div></div>
      <div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" style="color:var(--green)" id="ag-stat-angenommen">3</div><div class="sc-l">Angenommen</div></div></div>
      <div class="sc" style="border-top-color:var(--purple)"><div class="sc-ico" style="background:var(--purple-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg></div><div><div class="sc-n" style="color:var(--purple)" id="ag-stat-volumen">€ 48.400</div><div class="sc-l">Offen gesamt</div></div></div>
    </div>

    <div class="g2">
      <!-- Liste -->
      <div>
        <div class="panel">
          <div class="ph">
            <div class="ph-title">Alle Angebote</div>
            <div class="ph-right">
              <div class="tabs">
                <button class="tab active" id="ag-tab-alle"   onclick="agTab(this,'alle')">Alle</button>
                <button class="tab"        id="ag-tab-entwurf" onclick="agTab(this,'entwurf')">Entwurf</button>
                <button class="tab"        id="ag-tab-versendet" onclick="agTab(this,'versendet')">Versendet</button>
                <button class="tab"        id="ag-tab-angenommen" onclick="agTab(this,'angenommen')">Angenommen</button>
              </div>
            </div>
          </div>
          <div id="ag-liste"></div>
        </div>
      </div>

      <!-- Detail / Editor -->
      <div>
        <div class="panel" id="ag-detail-panel">
          <div class="ph" id="ag-detail-ph">
            <div class="ph-title">Angebot öffnen</div>
          </div>
          <div id="ag-detail-body" style="padding:16px;text-align:center;color:var(--text3);">
            <div style="font-size:40px;margin-bottom:10px;">📄</div>
            <div style="font-size:14px;font-weight:500;margin-bottom:6px;">Angebot auswählen</div>
            <div style="font-size:12px;">Links ein Angebot wählen oder neues erstellen</div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <!-- ══ AUFTRÄGE (Verwaltung / Büro) ══ -->
  <div class="pg" id="pg-auftraege">

    <!-- Stats -->
    <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:14px;" id="au-verwaltung-stats"></div>

    <!-- Filter + Suche -->
    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap;">
      <input class="srch" id="au-verwaltung-suche" placeholder="Kunde, Auftrag, Fahrzeug suchen…" oninput="renderAuftragVerwaltung()" style="width:220px;background:#fff;">
      <div class="tabs" id="au-verwaltung-tabs">
        <button class="tab active" onclick="auVerwTab(this,'alle')">Alle</button>
        <button class="tab" onclick="auVerwTab(this,'offen')">In Arbeit</button>
        <button class="tab" onclick="auVerwTab(this,'abgeschlossen')">Abgeschlossen</button>
        <button class="tab" onclick="auVerwTab(this,'rechnung')">Rechnung offen</button>
        <button class="tab" onclick="auVerwTab(this,'archiv')" style="color:var(--text3);">🗄 Archiv</button>
      </div>
    </div>

    <!-- Tabelle -->
    <div class="panel">
      <div class="ph">
        <div class="ph-title">Alle Aufträge</div>
        <button class="btn p" onclick="openAuftragModal()">+ Neuer Auftrag</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Kunde / Auftrag</th>
            <th>Fahrzeug / Paket</th>
            <th>Status</th>
            <th>Starttermin</th>
            <th>Rechnung</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="au-verwaltung-tbody"></tbody>
      </table>
    </div>
  </div>

  <!-- AKTIVITÄT MODAL -->
  

  <!-- ══ KUNDEN ══ -->
  <div class="pg" id="pg-kunden">
    <!-- Stats -->
    <div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;" id="kunden-stats"></div>
    <!-- Filter + Suche -->
    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap;">
      <input class="srch" id="kunden-suche" placeholder="Firma, Stadt, Ansprechpartner…" oninput="renderKunden()" style="width:240px;background:#fff;">
      <div class="tabs" id="kunden-tabs">
        <button class="tab active" onclick="kundenTab(this,'alle')">Alle</button>
        <button class="tab" onclick="kundenTab(this,'Aktiv')">Aktiv</button>
        <button class="tab" onclick="kundenTab(this,'Neukontakt')">Neukontakt</button>
        <button class="tab" onclick="kundenTab(this,'Geplant')">Geplant</button>
        <button class="tab" onclick="kundenTab(this,'Angebot')">Angebot</button>
      </div>
      <button class="btn p" onclick="openKundeModal()" style="margin-left:auto;">+ Neuer Kunde</button>
    </div>
    <!-- Karten-Grid -->
    <div id="kunden-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;"></div>
  </div>

  <!-- KUNDEN MODAL -->
  


  <!-- ══ CRM ══ -->
  <div class="pg" id="pg-crm">

    <!-- Stats -->
    <div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
      <div class="sc" style="border-top-color:var(--gray)"><div class="sc-ico" style="background:var(--gray-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></div><div><div class="sc-n" style="color:var(--gray)">4</div><div class="sc-l">Neukontakte</div></div></div>
      <div class="sc" style="border-top-color:var(--amber)"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></div><div><div class="sc-n" style="color:var(--amber)">5</div><div class="sc-l">Angebote offen</div></div></div>
      <div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div><div><div class="sc-n" style="color:var(--blue)">2</div><div class="sc-l">In Verhandlung</div></div></div>
      <div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" style="color:var(--green)">5</div><div class="sc-l">Gewonnen</div></div></div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:2px;background:var(--gray-l);border-radius:7px;padding:3px;width:fit-content;margin-bottom:16px;">
      <button class="tab active" id="crm-tab-pipeline" onclick="crmTab('pipeline')">Pipeline</button>
      <button class="tab" id="crm-tab-kunden" onclick="crmTab('kunden')">Kunden</button>
      <button class="tab" id="crm-tab-aktivitaeten" onclick="crmTab('aktivitaeten')">Aktivitäten</button>
      <button class="tab" id="crm-tab-wiedervorlage" onclick="crmTab('wiedervorlage')">Wiedervorlage</button>
    </div>

    <!-- PIPELINE — live aus CRM_KUNDEN gerendert -->
    <div id="crm-pipeline">
      <div id="crm-pipeline-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;"></div>
    </div>

    <!-- KUNDEN -->
    <div id="crm-kunden" style="display:none;">
      <div class="panel">
        <div class="ph"><div class="ph-title">Alle Kunden & Kontakte</div><button class="btn p" onclick="openKundeModal()">+ Neuer Kunde</button></div>
        <table>
          <thead><tr><th>Firma</th><th>Ansprechpartner</th><th>Telefon / Mail</th><th>Letzter Kontakt</th><th>Nächste Aktion</th><th>Status</th></tr></thead>
          <tbody>
            <tr onclick="openCrmDetail('Ruhrbahn')"><td><div class="tm">Ruhrbahn GmbH</div><div class="ts">Essen</div></td><td>Hr. Bergmann</td><td><div style="font-size:11px;">+49 201 826-1200</div><div style="font-size:11px;color:var(--blue);"><a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="4c2e293e2b212d22220c3e39243e2e2d2422622829">[email&#160;protected]</a></div></td><td>Heute</td><td style="color:var(--blue);">Q3 Planung besprechen</td><td><span class="bdg bg">Aktiv</span></td></tr>
            <tr onclick="openCrmDetail('DVG')"><td><div class="tm">DVG Duisburg</div></td><td>Fr. Weber</td><td><div style="font-size:11px;">+49 203 6040-210</div></td><td>12.03</td><td style="color:var(--amber);">Rechnung nachfassen</td><td><span class="bdg bg">Aktiv</span></td></tr>
            <tr onclick="openCrmDetail('Bogestra')"><td><div class="tm">Bogestra AG</div></td><td>Hr. Hoffmann</td><td><div style="font-size:11px;">+49 234 303-100</div></td><td>10.03</td><td style="color:var(--text2);">Q2 Angebot vorbereiten</td><td><span class="bdg bg">Aktiv</span></td></tr>
            <tr onclick="openCrmDetail('NRZ')"><td><div class="tm">Neue Ruhr Zeitung</div></td><td>Hr. Weber</td><td><div style="font-size:11px;">+49 201 804-0</div></td><td>15.03</td><td style="color:var(--red);">Angebot AG-019 nachfassen!</td><td><span class="bdg ba">Angebot offen</span></td></tr>
            <tr onclick="showToast('Sparkasse')"><td><div class="tm">Sparkasse Essen</div></td><td>Fr. Schmidt</td><td><div style="font-size:11px;">+49 201 103-0</div></td><td>16.03</td><td style="color:var(--green);">Auftrag bestätigt</td><td><span class="bdg bb">Verhandlung</span></td></tr>
            <tr onclick="showToast('TÜV')"><td><div class="tm">TÜV Rheinland</div></td><td>Hr. Klein</td><td><div style="font-size:11px;">+49 221 806-0</div></td><td>05.03</td><td style="color:var(--amber);">Nachfassen bis 20.03</td><td><span class="bdg ba">Angebot offen</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- AKTIVITÄTEN -->
    <div id="crm-aktivitaeten" style="display:none;">
      <div class="g2">
        <!-- Linke Spalte: Liste aller Aktivitäten -->
        <div class="panel">
          <div class="ph">
            <div class="ph-title">Alle Aktivitäten</div>
            <button class="btn p" onclick="openAktivModal(null)">+ Aktivität</button>
          </div>
          <div id="crm-aktiv-liste" style="padding:0 16px;"></div>
        </div>
        <!-- Rechte Spalte: Schnellerfassung -->
        <div>
          <div class="panel" style="margin-bottom:14px;">
            <div class="ph"><div class="ph-title">Schnellerfassung</div></div>
            <div style="padding:14px 16px;">
              <div class="fg">
                <label class="fl">Typ</label>
                <div style="display:flex;gap:6px;flex-wrap:wrap;" id="aktiv-typ-btns">
                  <button onclick="selAktTyp(this,'📞')" style="padding:6px 12px;border-radius:20px;border:1.5px solid var(--blue);background:var(--blue-l);color:var(--blue);font-size:12px;cursor:pointer;font-weight:700;">📞 Anruf</button>
                  <button onclick="selAktTyp(this,'✉')" style="padding:6px 12px;border-radius:20px;border:1.5px solid var(--border);background:#fff;font-size:12px;cursor:pointer;">✉ E-Mail</button>
                  <button onclick="selAktTyp(this,'🤝')" style="padding:6px 12px;border-radius:20px;border:1.5px solid var(--border);background:#fff;font-size:12px;cursor:pointer;">🤝 Meeting</button>
                  <button onclick="selAktTyp(this,'📋')" style="padding:6px 12px;border-radius:20px;border:1.5px solid var(--border);background:#fff;font-size:12px;cursor:pointer;">📋 Angebot</button>
                  <button onclick="selAktTyp(this,'🔄')" style="padding:6px 12px;border-radius:20px;border:1.5px solid var(--border);background:#fff;font-size:12px;cursor:pointer;">🔄 Nachfassen</button>
                </div>
              </div>
              <div class="fg">
                <label class="fl">Kunde <span>*</span></label>
                <select class="fs" id="aktiv-schnell-kunde">
                  <option value="">— wählen —</option>
                </select>
              </div>
              <div class="fg">
                <label class="fl">Datum / Uhrzeit</label>
                <div style="display:flex;gap:8px;">
                  <input class="fi" type="date" id="aktiv-schnell-datum" style="flex:1;">
                  <input class="fi" type="time" id="aktiv-schnell-zeit" value="10:00" style="width:90px;">
                </div>
              </div>
              <div class="fg">
                <label class="fl">Notiz</label>
                <textarea class="fta" id="aktiv-schnell-notiz" placeholder="Was wurde besprochen…" style="min-height:60px;"></textarea>
              </div>
              <div class="fg">
                <label class="fl">Wiedervorlage am <span style="color:var(--text3);font-weight:400;">(optional)</span></label>
                <input class="fi" type="date" id="aktiv-schnell-wv">
              </div>
              <button class="btn p" style="width:100%;" onclick="saveAktivitaetSchnell()">✓ Aktivität speichern</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- WIEDERVORLAGE -->
    <div id="crm-wiedervorlage" style="display:none;">
      <div class="panel">
        <div class="ph">
          <div class="ph-title">Wiedervorlage & Follow-Ups</div>
          <span style="font-size:11px;color:var(--text3);">Aus Aktivitäten mit Wiedervorlage-Datum</span>
        </div>
        <table>
          <thead><tr><th>Fällig</th><th>Kunde</th><th>Aufgabe</th><th>Zuständig</th><th>Priorität</th><th></th></tr></thead>
          <tbody id="crm-wv-tbody">
            <tr><td colspan="6" style="padding:16px;color:var(--text3);text-align:center;">Wird geladen…</td></tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>

  <!-- ══ PRODUKTION (Werkstatt / Workflow) ══ -->
  <div class="pg" id="pg-produktion">
    <div id="kanbanBoard"></div>
  </div>

  <!-- ══ LAGER ══ -->
  <div class="pg" id="pg-lager">
    <div class="stats" style="grid-template-columns:repeat(4,1fr)">
      <div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" style="color:var(--green)" id="lgOk">0</div><div class="sc-l">Ausreichend</div></div></div>
      <div class="sc" style="border-top-color:var(--amber)"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><path d="M12 9v4m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div><div><div class="sc-n" style="color:var(--amber)" id="lgWarn">0</div><div class="sc-l">Nachbestellen</div></div></div>
      <div class="sc" style="border-top-color:var(--red)"><div class="sc-ico" style="background:var(--red-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><div><div class="sc-n" style="color:var(--red)" id="lgLeer">0</div><div class="sc-l">Leer!</div></div></div>
      <div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.97 1.61h9.72a2 2 0 001.97-1.61L23 6H6"/></svg></div><div><div class="sc-n" style="color:var(--blue)" id="lgBestellt">0</div><div class="sc-l">Im Bestellung</div></div></div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center;flex-wrap:wrap;">
      <input class="srch" id="lagerSearchCC" placeholder="Artikel suchen…" oninput="renderLagerCC()" style="width:200px;background:#fff;">
      <div class="tabs">
        <button class="tab active" onclick="lagerTabCC(this,'alle')">Alle</button>
        <button class="tab" onclick="lagerTabCC(this,'folie')">Folien</button>
        <button class="tab" onclick="lagerTabCC(this,'laminat')">Laminat</button>
        <button class="tab" onclick="lagerTabCC(this,'reinigung')">Reinigung</button>
        <button class="tab" onclick="lagerTabCC(this,'werkzeug')">Werkzeug</button>
        <button class="tab" onclick="lagerTabCC(this,'farbe')">Farben HP</button>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn" onclick="lagerLieferantenModal()">⚙ Lieferanten</button>
        <button class="btn" onclick="lagerArtikelModal(-1)">+ Artikel</button>
        <button class="btn p" onclick="lagerBestellungAufgeben()">🛒 Bestellung aufgeben</button>
      </div>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Artikel</th><th>Kategorie</th><th>Art.Nr.</th><th>Einheit</th><th>Bestand</th><th>Mindest</th><th>Status</th><th style="width:110px;"></th></tr></thead>
        <tbody id="lagerTbodyCC"></tbody>
      </table>
    </div>
  </div>

  <!-- ══ MITARBEITER ══ -->
  <div class="pg" id="pg-mitarbeiter">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="font-size:13px;color:var(--text2);" id="maGridCount"></div>
      <button class="btn" onclick="maOpenSettings()" style="display:flex;align-items:center;gap:6px;font-weight:600;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Einstellungen
      </button>
    </div>
    <div class="ma-grid" id="maGrid"></div>
  </div>

  <!-- ══ URLAUB ══ -->
  <div class="pg" id="pg-urlaub">
    <div class="panel">
      <div class="ph">
        <div class="ph-title">Urlaubsanträge</div>
        <span style="font-size:11px;color:var(--text3);">Anträge aus App + Desktop · gemeinsame Datenbasis</span>
      </div>
      <div id="urlaub-antraege-liste"></div>
    </div>
    <div class="panel">
      <div class="ph"><div class="ph-title">Urlaubsübersicht 2026</div></div>
      <table>
        <thead><tr><th>Mitarbeiter</th><th>Anspruch</th><th>Genommen</th><th>Geplant</th><th>Rest</th></tr></thead>
        <tbody id="urlaub-uebersicht-tbody"></tbody>
      </table>
    </div>
  </div>

  <!-- ══ MITARBEITER-APP (MOBILE) ══ -->
  <div class="pg" id="pg-mobil">
    <!-- Mobile Shell: simuliert Handy-Viewport zentriert im Desktop -->
    <div id="mob-shell" style="max-width:420px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F2F2F7;height:calc(100vh - 100px);border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.15);position:relative;display:flex;flex-direction:column;">

      <!-- ── Scrollbarer Inhalt ── -->
      <div id="mob-scroll" style="flex:1;overflow-y:auto;overflow-x:hidden;">

        <!-- ── HEADER ── -->
        <div style="background:linear-gradient(135deg,#1565C0 0%,#0D47A1 100%);padding:20px 18px 18px;color:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <div style="font-size:12px;font-weight:500;opacity:.7;margin-bottom:4px;" id="mob-datum"></div>
              <div style="font-size:20px;font-weight:700;line-height:1.2;" id="mob-hallo">Hallo, …</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <!-- 🔔 Glocke -->
              <button onclick="(function(){var el=document.getElementById('mob-offene-fragen-block');if(el)el.scrollIntoView({behavior:'smooth'});})()" title="Offene Fragen"
                style="position:relative;background:rgba(255,255,255,.15);border:none;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;color:#fff;">
                🔔
                <span id="mob-fragen-badge" style="display:none;position:absolute;top:-2px;right:-2px;background:#FF3B30;color:#fff;font-size:9px;font-weight:800;border-radius:10px;padding:1px 5px;min-width:16px;text-align:center;border:2px solid #0D47A1;"></span>
              </button>
              <!-- Avatar -->
              <div id="mob-avatar" style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;cursor:pointer;border:2px solid rgba(255,255,255,.3);" onclick="mobWechselMA()">–</div>
            </div>
          </div>
          <!-- MA-Picker Dropdown -->
          <div id="mob-ma-picker" style="display:none;position:absolute;top:72px;right:16px;background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:999;padding:8px;min-width:190px;"></div>
        </div>

        <!-- ── ZEITERFASSUNG (nur Home sichtbar) ── -->
        <div id="mob-zeiterfassung-block" style="padding:12px 14px 0;">
          <div style="background:#fff;border-radius:16px;padding:14px 16px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div style="font-size:10px;font-weight:700;color:#8E8E93;letter-spacing:.07em;">ARBEITSZEIT HEUTE</div>
              <div id="mob-uhr-aktuell" style="font-size:11px;color:#8E8E93;font-variant-numeric:tabular-nums;"></div>
            </div>
            <div style="font-size:40px;font-weight:200;font-variant-numeric:tabular-nums;letter-spacing:-1px;color:#1C1C1E;text-align:center;margin-bottom:10px;" id="mob-uhr">00:00:00</div>
            <div style="display:flex;gap:8px;">
              <button id="mob-start-btn" onclick="mobZeitToggle()" style="flex:1;padding:11px;border:none;border-radius:12px;background:#34C759;color:#fff;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;">▶ Start</button>
              <button id="mob-pause-btn" onclick="mobZeitPause()" style="display:none;padding:11px 14px;border:none;border-radius:12px;background:#FF9500;color:#fff;font-size:14px;cursor:pointer;">⏸</button>
            </div>
            <div id="mob-zeit-info" style="display:none;margin-top:8px;font-size:11px;color:#8E8E93;text-align:center;"></div>
          </div>
        </div>

        <!-- ── OFFENE FRAGEN BLOCK ── -->
        <div id="mob-offene-fragen-block" style="padding:10px 14px 0;display:none;"></div>

        <!-- ── HOME CONTENT: Warnungen + Stats + LÄUFT + Aufträge ── -->
        <div id="mob-home-content" style="padding:10px 14px 14px;">
          <div id="mob-auftraege"></div>
        </div>

        <!-- ── AUFTRAG-DETAIL ── -->
        <div id="mob-auftrag-detail" style="display:none;padding:0 0 14px;">
          <div id="mob-detail-inner"></div>
        </div>

        <!-- ── Tab: Aufgaben ── -->
        <div id="mob-tab-aufgaben" style="display:none;padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#8E8E93;letter-spacing:.07em;margin-bottom:10px;">ALLE OFFENEN AUFTRÄGE</div>
          <div id="mob-alle-auftraege"></div>
        </div>

        <!-- ── Tab: Fotos ── -->
        <div id="mob-tab-fotos" style="display:none;padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#8E8E93;letter-spacing:.07em;margin-bottom:10px;">FOTO HOCHLADEN</div>
          <div id="mob-foto-auftrag-liste"></div>
        </div>

        <!-- ── Tab: Lager ── -->
        <div id="mob-tab-lager" style="display:none;padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#8E8E93;letter-spacing:.07em;margin-bottom:10px;">MATERIAL BUCHEN</div>
          <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
            <div id="mob-lager-liste"></div>
          </div>
        </div>

        <!-- ── Tab: Urlaub ── -->
        <div id="mob-tab-urlaub" style="display:none;padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#8E8E93;letter-spacing:.07em;margin-bottom:10px;">ANTRAG STELLEN</div>
          <div style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:14px;">
            <div style="margin-bottom:12px;">
              <label style="font-size:12px;font-weight:600;color:#3C3C43;display:block;margin-bottom:5px;">Typ</label>
              <select id="mob-url-typ" onchange="mobUrlTypChanged()" style="width:100%;padding:10px 12px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:14px;background:#fff;">
                <option>Urlaub</option>
                <option>Zeitausgleich</option>
                <option>Überstunden</option>
                <option>Kurzabwesenheit</option>
                <option>Krank</option>
              </select>
            </div>

            <!-- Datum: nur bei Urlaub/Zeitausgleich/Krank -->
            <div id="mob-url-datum-block" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
              <div>
                <label style="font-size:12px;font-weight:600;color:#3C3C43;display:block;margin-bottom:5px;">Von</label>
                <input type="date" id="mob-url-von" style="width:100%;padding:10px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:12px;font-weight:600;color:#3C3C43;display:block;margin-bottom:5px;">Bis</label>
                <input type="date" id="mob-url-bis" style="width:100%;padding:10px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:13px;box-sizing:border-box;">
              </div>
            </div>

            <!-- Stunden: nur bei Überstunden -->
            <div id="mob-url-std-block" style="display:none;margin-bottom:12px;">
              <label style="font-size:12px;font-weight:600;color:#3C3C43;display:block;margin-bottom:5px;">Überstunden (h)</label>
              <div style="display:flex;align-items:center;gap:10px;">
                <button onclick="mobUrlStdAendern(-0.5)" style="width:44px;height:44px;border-radius:10px;border:1.5px solid #E5E5EA;background:#F2F2F7;font-size:20px;cursor:pointer;font-weight:700;">−</button>
                <input type="number" id="mob-url-std" value="1" min="0.5" step="0.5"
                  style="flex:1;padding:10px;border:1.5px solid #007AFF;border-radius:10px;font-size:20px;font-weight:700;text-align:center;box-sizing:border-box;">
                <button onclick="mobUrlStdAendern(0.5)" style="width:44px;height:44px;border-radius:10px;border:1.5px solid #E5E5EA;background:#F2F2F7;font-size:20px;cursor:pointer;font-weight:700;">+</button>
              </div>
              <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                <button onclick="document.getElementById('mob-url-std').value=1" style="padding:5px 12px;border-radius:20px;border:1px solid #E5E5EA;background:#F2F2F7;font-size:12px;cursor:pointer;">1h</button>
                <button onclick="document.getElementById('mob-url-std').value=2" style="padding:5px 12px;border-radius:20px;border:1px solid #E5E5EA;background:#F2F2F7;font-size:12px;cursor:pointer;">2h</button>
                <button onclick="document.getElementById('mob-url-std').value=4" style="padding:5px 12px;border-radius:20px;border:1px solid #E5E5EA;background:#F2F2F7;font-size:12px;cursor:pointer;">4h</button>
                <button onclick="document.getElementById('mob-url-std').value=8" style="padding:5px 12px;border-radius:20px;border:1px solid #E5E5EA;background:#F2F2F7;font-size:12px;cursor:pointer;">8h</button>
                <button onclick="document.getElementById('mob-url-std').value=16" style="padding:5px 12px;border-radius:20px;border:1px solid #E5E5EA;background:#F2F2F7;font-size:12px;cursor:pointer;">16h</button>
              </div>
            </div>

            <!-- Kurzabwesenheit: Datum + Stunden + Grund -->
            <div id="mob-url-kurz-block" style="display:none;margin-bottom:12px;">
              <!-- Datum -->
              <div style="margin-bottom:10px;">
                <label style="font-size:12px;font-weight:600;color:#3C3C43;display:block;margin-bottom:5px;">Datum</label>
                <input type="date" id="mob-url-kurz-datum" style="width:100%;padding:10px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:13px;box-sizing:border-box;">
              </div>
              <!-- Fehlzeit -->
              <div>
                <label style="font-size:12px;font-weight:600;color:#3C3C43;display:block;margin-bottom:5px;">Fehlzeit (h)</label>
                <div style="display:flex;align-items:center;gap:10px;">
                  <button onclick="mobKurzStdAendern(-0.5)" style="width:44px;height:44px;border-radius:10px;border:1.5px solid #E5E5EA;background:#F2F2F7;font-size:20px;cursor:pointer;font-weight:700;">−</button>
                  <input type="number" id="mob-url-kurz-std" value="0.5" min="0.5" max="8" step="0.5"
                    style="flex:1;padding:10px;border:1.5px solid #FF9500;border-radius:10px;font-size:22px;font-weight:800;text-align:center;box-sizing:border-box;color:#FF9500;">
                  <button onclick="mobKurzStdAendern(0.5)" style="width:44px;height:44px;border-radius:10px;border:1.5px solid #E5E5EA;background:#F2F2F7;font-size:20px;cursor:pointer;font-weight:700;">+</button>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                  <button onclick="document.getElementById('mob-url-kurz-std').value=0.5" style="padding:5px 12px;border-radius:20px;border:1px solid #E5E5EA;background:#F2F2F7;font-size:12px;cursor:pointer;">½h</button>
                  <button onclick="document.getElementById('mob-url-kurz-std').value=1" style="padding:5px 12px;border-radius:20px;border:1px solid #E5E5EA;background:#F2F2F7;font-size:12px;cursor:pointer;">1h</button>
                  <button onclick="document.getElementById('mob-url-kurz-std').value=1.5" style="padding:5px 12px;border-radius:20px;border:1px solid #E5E5EA;background:#F2F2F7;font-size:12px;cursor:pointer;">1½h</button>
                  <button onclick="document.getElementById('mob-url-kurz-std').value=2" style="padding:5px 12px;border-radius:20px;border:1px solid #E5E5EA;background:#F2F2F7;font-size:12px;cursor:pointer;">2h</button>
                  <button onclick="document.getElementById('mob-url-kurz-std').value=3" style="padding:5px 12px;border-radius:20px;border:1px solid #E5E5EA;background:#F2F2F7;font-size:12px;cursor:pointer;">3h</button>
                </div>
              </div>
            </div>

            <div style="margin-bottom:14px;">
              <label style="font-size:12px;font-weight:600;color:#3C3C43;display:block;margin-bottom:5px;">Notiz (optional)</label>
              <textarea id="mob-url-notiz" style="width:100%;padding:10px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:13px;resize:none;height:60px;box-sizing:border-box;" placeholder="z.B. Familienurlaub, Arzttermin…"></textarea>
            </div>
            <button id="mob-url-send-btn" onclick="mobUrlaubSenden()" style="width:100%;padding:14px;background:#007AFF;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;">Antrag absenden</button>
          </div>
          <div style="font-size:10px;font-weight:700;color:#8E8E93;letter-spacing:.07em;margin-bottom:8px;">MEIN RESTURLAUB</div>
          <div id="mob-urlaub-info" style="background:#fff;border-radius:16px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.06);"></div>
        </div>

      </div><!-- /mob-scroll -->

      <!-- ── BOTTOM NAV — neues Design mit aktivem Pill ── -->
      <div style="flex-shrink:0;background:rgba(255,255,255,.97);backdrop-filter:blur(10px);border-top:1px solid #E5E5EA;display:flex;padding-bottom:8px;z-index:100;">
        <button onclick="mobTab('home')" id="mob-nav-home" style="flex:1;padding:8px 0 4px;border:none;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;font-weight:600;color:#007AFF;">
          <div style="background:#EAF4FF;border-radius:10px;padding:3px 14px;margin-bottom:1px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>Home
        </button>
        <button onclick="mobTab('aufgaben')" id="mob-nav-aufgaben" style="flex:1;padding:8px 0 4px;border:none;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:#8E8E93;">
          <div style="padding:3px 14px;margin-bottom:1px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </div>Aufgaben
        </button>
        <button onclick="mobTab('fotos')" id="mob-nav-fotos" style="flex:1;padding:8px 0 4px;border:none;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:#8E8E93;">
          <div style="padding:3px 14px;margin-bottom:1px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </div>Fotos
        </button>
        <button onclick="mobTab('lager')" id="mob-nav-lager" style="flex:1;padding:8px 0 4px;border:none;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:#8E8E93;">
          <div style="padding:3px 14px;margin-bottom:1px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
          </div>Lager
        </button>
        <button onclick="mobTab('urlaub')" id="mob-nav-urlaub" style="flex:1;padding:8px 0 4px;border:none;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:#8E8E93;">
          <div style="padding:3px 14px;margin-bottom:1px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>Urlaub
        </button>
      </div>

    </div><!-- /mob-shell -->
  </div><!-- /pg-mobil -->

  <!-- ══ RECHNUNGEN ══ -->
  <div class="pg" id="pg-rechnungen">

    <!-- ══ LEXWARE-QUEUE ══ -->
    <div id="lexware-queue-section" style="margin-bottom:16px;">
      <div class="panel" style="border-top:3px solid var(--amber);">
        <div class="ph" style="background:#FFFBF0;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;">📋</span>
            <div>
              <div class="ph-title" style="color:var(--amber);">
                Aufträge → Lexware
                <span id="lexware-badge" style="display:none;background:var(--amber);color:#fff;font-size:10px;font-weight:800;border-radius:20px;padding:1px 8px;margin-left:6px;">0</span>
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:1px;">Abgeschlossene Aufträge — Rechnung noch nicht in Lexware erstellt</div>
            </div>
          </div>
        </div>
        <div id="lexware-queue-body">
          <div style="padding:20px;text-align:center;font-size:12px;color:var(--text3);">Wird geladen…</div>
        </div>
      </div>
    </div>

    <!-- ══ STATS ══ -->
    <div class="stats" style="grid-template-columns:repeat(4,1fr)">
      <div class="sc" style="border-top-color:var(--red)"><div class="sc-ico" style="background:var(--red-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><path d="M12 9v4m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div><div><div class="sc-n" id="re-stat-ueberfaellig" style="color:var(--red)">—</div><div class="sc-l">Überfällig</div></div></div>
      <div class="sc" style="border-top-color:var(--amber)"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div><div class="sc-n" id="re-stat-offen" style="color:var(--amber)">—</div><div class="sc-l">Offen / Versendet</div></div></div>
      <div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg></div><div><div class="sc-n" id="re-stat-entwurf" style="color:var(--blue)">—</div><div class="sc-l">Entwurf</div></div></div>
      <div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" id="re-stat-bezahlt" style="color:var(--green)">—</div><div class="sc-l">Bezahlt 2026</div></div></div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center;">
      <input class="srch" id="re-search" placeholder="Suchen…" oninput="renderRechnungen()" style="width:200px;background:#fff;">
      <div class="tabs" id="re-tabs">
        <button class="tab active" onclick="reSetTab(this,'alle')">Alle</button>
        <button class="tab" onclick="reSetTab(this,'ueberfaellig')">Überfällig</button>
        <button class="tab" onclick="reSetTab(this,'versendet')">Versendet</button>
        <button class="tab" onclick="reSetTab(this,'entwurf')">Entwurf</button>
        <button class="tab" onclick="reSetTab(this,'bezahlt')">Bezahlt</button>
      </div>
      <button class="btn p" onclick="openRechnungModal(null)">+ Neue Rechnung</button>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Rechnungs-Nr.</th><th>Kunde</th><th>Beschreibung</th><th>Netto</th><th>Brutto (19%)</th><th>Fällig</th><th>Status</th><th></th></tr></thead>
        <tbody id="re-tbody"></tbody>
      </table>
    </div>
  </div>

  <!-- ══ RECHNUNG MODAL ══ -->
  <div class="modal-ov" id="reModal">
    <div class="modal" style="width:700px;">
      <div class="mhdr">
        <div class="mtitle" id="reModalTitle">Neue Rechnung</div>
        <button class="dp-close" onclick="closeReModal()">×</button>
      </div>
      <div class="mbody">
        <div class="frow frow2">
          <div class="fg">
            <label class="fl">Rechnungs-Nr. <span>*</span></label>
            <input class="fi" id="re-nr" placeholder="RE-2026-015" readonly style="background:var(--gray-l);">
          </div>
          <div class="fg">
            <label class="fl">Datum <span>*</span></label>
            <input class="fi" type="date" id="re-datum">
          </div>
        </div>
        <div class="frow frow2">
          <div class="fg">
            <label class="fl">Kunde <span>*</span></label>
            <select class="fs" id="re-kunde" onchange="reKundeChanged()">
              <option value="">— wählen —</option>
              <option>Radio Essen</option>
              <option>DVG Duisburg</option>
              <option>Bogestra AG</option>
              <option>Ruhrbahn GmbH</option>
              <option>Stadt Essen</option>
              <option>Sparkasse Essen</option>
              <option>TÜV Rheinland</option>
              <option>Neue Ruhr Zeitung</option>
              <option>Sonstiger Kunde</option>
            </select>
          </div>
          <div class="fg">
            <label class="fl">Verknüpfter Auftrag</label>
            <select class="fs" id="re-auftrag">
              <option value="">— optional —</option>
            </select>
          </div>
        </div>
        <div class="fg">
          <label class="fl">Beschreibung / Betreff <span>*</span></label>
          <input class="fi" id="re-betreff" placeholder="z.B. Quartalsrechnung Q1 2026 · Fahrzeugwerbung">
        </div>
        <div class="fsect">Positionen</div>
        <div id="re-pos-liste"></div>
        <button class="btn" onclick="reAddPos()" style="font-size:12px;margin-bottom:14px;">+ Position hinzufügen</button>
        <div style="display:flex;justify-content:flex-end;gap:20px;padding:10px 0;border-top:2px solid var(--border);font-size:13px;">
          <span>Netto: <strong id="re-sum-netto">€ 0,00</strong></span>
          <span>MwSt. 19%: <strong id="re-sum-mwst">€ 0,00</strong></span>
          <span style="font-size:15px;">Brutto: <strong id="re-sum-brutto" style="color:var(--green);">€ 0,00</strong></span>
        </div>
        <div class="frow frow3">
          <div class="fg">
            <label class="fl">Zahlungsziel (Tage)</label>
            <input class="fi" type="number" id="re-zahltage" value="14" min="0" max="90" oninput="reUpdateFaelligkeit()">
          </div>
          <div class="fg">
            <label class="fl">Fällig am</label>
            <input class="fi" type="date" id="re-faellig">
          </div>
          <div class="fg">
            <label class="fl">Status</label>
            <select class="fs" id="re-status">
              <option value="entwurf">Entwurf</option>
              <option value="versendet">Versendet</option>
              <option value="bezahlt">Bezahlt</option>
              <option value="ueberfaellig">Überfällig</option>
              <option value="storniert">Storniert</option>
            </select>
          </div>
        </div>
        <div class="fg">
          <label class="fl">Notiz / Zahlungshinweis</label>
          <textarea class="fta" id="re-notiz" placeholder="z.B. Bankverbindung: DE12 3456 7890 …" style="min-height:55px;"></textarea>
        </div>
      </div>
      <div class="mfoot">
        <button class="btn" onclick="closeReModal()">Abbrechen</button>
        <button class="btn" onclick="reVorschau()" style="background:var(--purple-l);color:var(--purple);border-color:var(--purple);">🖨 Vorschau / PDF</button>
        <button class="btn p" onclick="saveRechnung()">✓ Speichern</button>
      </div>
    </div>
  </div>

  <!-- ══ RECHNUNG DETAIL OVERLAY ══ -->
  <div class="overlay" id="reDetailOv" onclick="if(event.target===this)closeReDetail()">
    <div class="dpanel" style="width:520px;">
      <div class="dp-hdr">
        <div class="dp-t" id="reDetailTitle">Rechnung</div>
        <div style="display:flex;gap:6px;">
          <button class="btn" onclick="reEditFromDetail()" style="font-size:11px;padding:4px 10px;">✏ Bearbeiten</button>
          <button class="btn" onclick="rePrintFromDetail()" style="font-size:11px;padding:4px 10px;background:var(--purple-l);color:var(--purple);border-color:var(--purple);">🖨 PDF</button>
          <button class="dp-close" onclick="closeReDetail()">×</button>
        </div>
      </div>
      <div class="dp-body" id="reDetailBody"></div>
    </div>
  </div>

  <!-- ══ RECHNUNG PDF PRINT OVERLAY ══ -->
  <div id="re-print-ov" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;align-items:center;justify-content:center;">
    <div style="background:#fff;border-radius:12px;width:760px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.2);">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:15px;font-weight:700;">📄 Rechnungsvorschau</div>
        <div style="display:flex;gap:8px;">
          <button class="btn p" onclick="reDoPrint()">🖨 Drucken / Speichern als PDF</button>
          <button class="dp-close" onclick="document.getElementById('re-print-ov').style.display='none'">×</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px;" id="re-print-content"></div>
    </div>
  </div>

  <!-- ══ KALENDER ══ -->
  <div class="pg" id="pg-kalender">
    <div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px;">
      <div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div><div><div class="sc-n" style="color:var(--blue)" id="ccCalWeek">—</div><div class="sc-l">Termine diese Woche</div></div></div>
      <div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" style="color:var(--green)" id="ccCalMonth">—</div><div class="sc-l">Termine diesen Monat</div></div></div>
      <div class="sc" style="border-top-color:var(--amber)"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div><div class="sc-n" style="color:var(--amber)" id="ccCalDepots">3</div><div class="sc-l">Depots aktiv</div></div></div>
      <div class="sc" style="border-top-color:var(--teal)"><div class="sc-ico" style="background:var(--teal-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div><div class="sc-n" style="color:var(--teal)" id="ccCalMonteure">6</div><div class="sc-l">Monteure geplant</div></div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;">
      <!-- Kalender -->
      <div class="panel">
        <div class="ph">
          <div style="display:flex;align-items:center;gap:10px;flex:1;">
            <button class="btn" onclick="ccCalPrev()" style="padding:4px 10px;font-size:16px;">‹</button>
            <div style="font-size:15px;font-weight:700;" id="ccCalMonthLabel">März 2026</div>
            <button class="btn" onclick="ccCalNext()" style="padding:4px 10px;font-size:16px;">›</button>
            <span style="font-size:11px;color:var(--text3);margin-left:4px;">← synchronisiert mit FUSA</span>
          </div>
          <div class="ph-right">
            <button class="btn" onclick="ccCalLoad();buildCCCalendar()">🔄 Sync FUSA</button>
            <button class="btn p" onclick="openCCTermin()">+ Termin anlegen</button>
          </div>
        </div>
        <div style="padding:14px;">
          <div id="ccCalGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;"></div>
        </div>
      </div>

      <!-- Seitenleiste -->
      <div>
        <div class="panel" style="margin-bottom:14px;">
          <div class="ph"><div class="ph-title">Depot E-Mails</div></div>
          <div style="padding:12px 16px;">
            <div style="margin-bottom:10px;">
              <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-bottom:3px;">DEPOT STADTMITTE ESSEN</div>
              <div style="font-size:12px;font-weight:500;color:var(--blue);"><a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="345051445b4019514747515a7446415c4656555c5a1a5051">[email&#160;protected]</a></div>
            </div>
            <div style="margin-bottom:10px;padding-top:8px;border-top:1px solid var(--border);">
              <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-bottom:3px;">DEPOT MÜLHEIM</div>
              <div style="font-size:12px;font-weight:500;color:var(--blue);"><a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="680c0d18071c45051d0d04000d0105281a1d001a0a090006460c0d">[email&#160;protected]</a></div>
            </div>
            <div style="padding-top:8px;border-top:1px solid var(--border);">
              <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-bottom:3px;">DEPOT BOCHUM (BOGESTRA)</div>
              <div style="font-size:12px;font-weight:500;color:var(--blue);"><a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="ef8b8a9f809bc28d808c879a82af8d80888a9c9b9d8ec18b8a">[email&#160;protected]</a></div>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="ph"><div class="ph-title">Nächste Termine</div></div>
          <div style="padding:0 14px;" id="ccUpcomingList"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ CHECKLISTEN ══ -->
  <div class="pg" id="pg-checklisten">

    <!-- Stats -->
    <div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
      <div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg></div><div><div class="sc-n" style="color:var(--blue)" id="cl-stat-total">0</div><div class="sc-l">Vorlagen gesamt</div></div></div>
      <div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" style="color:var(--green)" id="cl-stat-aktiv">0</div><div class="sc-l">Aktiv</div></div></div>
      <div class="sc" style="border-top-color:var(--amber)"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div><div class="sc-n" style="color:var(--amber)" id="cl-stat-punkte">0</div><div class="sc-l">Prüfpunkte gesamt</div></div></div>
      <div class="sc" style="border-top-color:var(--purple)"><div class="sc-ico" style="background:var(--purple-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div><div><div class="sc-n" style="color:var(--purple)">📱</div><div class="sc-l">Sync Handy bereit</div></div></div>
    </div>

    <div class="g2">
      <!-- Vorlagen Liste -->
      <div>
        <div class="panel">
          <div class="ph">
            <div class="ph-title">Checklisten-Vorlagen</div>
            <button class="btn p" onclick="clNeuModal()">+ Neue Vorlage</button>
          </div>
          <div id="cl-vorlagen-liste" style="padding:8px 0;"></div>
        </div>
      </div>

      <!-- Vorlage Detail / Editor -->
      <div id="cl-detail-wrap">
        <div class="panel" id="cl-detail-panel">
          <div class="ph" id="cl-detail-ph">
            <div class="ph-title">Vorlage auswählen</div>
          </div>
          <div id="cl-detail-body" style="padding:16px;color:var(--text3);font-size:13px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">👈</div>
            Vorlage links auswählen um Punkte zu bearbeiten
          </div>
        </div>
      </div>
    </div>

  </div>

  </div><!-- /content -->
</div><!-- /main -->

<!-- DETAIL OVERLAY -->


<!-- NEUES ANGEBOT MODAL (einfach) -->


<!-- NEUER TERMIN MODAL (Kalender) -->


<!-- CHECKLISTE NEU MODAL -->


<!-- CHECKLISTE PUNKT MODAL -->


<!-- ANGEBOT NEU / EDITOR MODAL -->


<!-- ANFRAGE NEU MODAL -->

<!-- NEUER AUFTRAG MODAL -->


<!-- ZEIT OVERLAY -->


<div id="toast"></div>
`;
};
