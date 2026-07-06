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
    <div class="sb-link" style="display:none;" onclick="goPage('kalender',this,'Montage-Kalender','Termine & Beklebungen')">
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
        <button id="cc-notif-btn" onclick="ccNotifToggle()" title="Kommunikation &amp; Benachrichtigungen"
          style="position:relative;width:34px;height:34px;border-radius:50%;border:none;background:var(--gray-l);color:var(--text2);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;">
          🔔
          <span id="cc-notif-badge" style="display:none;position:absolute;top:-2px;right:-2px;background:var(--red);color:#fff;font-size:9px;font-weight:700;border-radius:10px;padding:1px 5px;min-width:16px;text-align:center;border:2px solid #fff;"></span>
        </button>
        <!-- Dropdown -->
        <div id="cc-notif-dropdown" style="display:none;position:absolute;top:42px;right:0;width:340px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:9999;overflow:hidden;border:1px solid var(--border);">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px 10px;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;font-weight:700;color:var(--text);">🔔 Kommunikation</span>
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
              <button class="btn p" onclick="agModalOpen()">+ Neues Angebot</button>
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
      <div id="au-verwaltung-pagination" class="cc-page-nav"></div>
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
    <div class="panel" id="cc-aufgaben-pro-ma-panel" style="margin-bottom:14px;"></div>
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
    <!-- Desktop: MA-Test (Simulation, kein Login) — befüllt via ccMobTestBarPopulate -->
    <div class="cc-mob-testrow" id="cc-mob-testrow">
      <span class="cc-mob-testrow-label" title="Nur Anzeige-Simulation für die Mitarbeiter-App; Login bleibt unverändert">Mitarbeiter-App · Test-MA</span>
      <label class="cc-mob-testrow-sr" for="cc-mob-test-select">Mitarbeiter für Vorschau wählen</label>
      <select id="cc-mob-test-select" class="cc-mob-testrow-select" aria-label="Mitarbeiter-App Vorschau"
        onchange="if(typeof window.ccMobTestUserSelect==='function'){window.ccMobTestUserSelect(this.value);}"></select>
    </div>
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
              <button type="button" onclick="mobShellMinimize()" title="App schließen (zurück zur Übersicht)" aria-label="App schließen"
                style="width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:22px;font-weight:300;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>
              <!-- 🔔 Glocke -->
              <button type="button" onclick="if(typeof mobGlockeNachrichtenOeffnen==='function')mobGlockeNachrichtenOeffnen();" title="Nachrichten &amp; Kommunikation"
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
            <div id="mob-zeit-btn-row" style="display:flex;gap:10px;">
              <button id="mob-start-btn" onclick="mobZeitToggle()" style="flex:1;padding:11px;border:none;border-radius:12px;background:#34C759;color:#fff;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;">▶ Start</button>
              <button id="mob-pause-btn" onclick="mobZeitPause()" style="display:none;padding:11px 14px;border:none;border-radius:12px;background:#FF9500;color:#fff;font-size:14px;cursor:pointer;align-items:center;justify-content:center;gap:6px;min-width:96px;">⏸ Pause</button>
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
      <div id="mob-bottom-nav" style="flex-shrink:0;background:rgba(255,255,255,.97);backdrop-filter:blur(10px);border-top:1px solid #E5E5EA;display:flex;padding-bottom:8px;z-index:100;">
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
            <button class="btn" onclick="ccCalLoad()">🔄 Sync FUSA</button>
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

<div class="modal-ov" id="aktivModal" onclick="if(event.target===this)closeAktivModal()">
    <div class="modal" style="width:560px;">
      <div class="mhdr" style="gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:38px;height:38px;border-radius:10px;background:var(--blue-l);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.62-.62a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
          </div>
          <div class="mtitle">Neue Aktivität</div>
        </div>
        <button class="dp-close" onclick="closeAktivModal()">×</button>
      </div>
      <div class="mbody" style="padding:24px 28px;">

        <!-- Typ-Auswahl -->
        <div class="fg">
          <label class="fl">Aktivitätstyp <span>*</span></label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;" id="aktiv-modal-typ-btns">
            <button onclick="selAktivModalTyp(this,'📞','Anruf')"     class="aktiv-typ-btn active" data-typ="Anruf"    style="padding:8px 16px;border-radius:8px;border:1.5px solid var(--blue);background:var(--blue-l);color:var(--blue);font-size:12px;font-weight:700;cursor:pointer;">📞 Anruf</button>
            <button onclick="selAktivModalTyp(this,'✉','E-Mail')"    class="aktiv-typ-btn"        data-typ="E-Mail"   style="padding:8px 16px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:12px;cursor:pointer;">✉ E-Mail</button>
            <button onclick="selAktivModalTyp(this,'🤝','Meeting')"  class="aktiv-typ-btn"        data-typ="Meeting"  style="padding:8px 16px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:12px;cursor:pointer;">🤝 Meeting</button>
            <button onclick="selAktivModalTyp(this,'📋','Angebot')"  class="aktiv-typ-btn"        data-typ="Angebot"  style="padding:8px 16px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:12px;cursor:pointer;">📋 Angebot</button>
            <button onclick="selAktivModalTyp(this,'🔄','Nachfassen')"class="aktiv-typ-btn"       data-typ="Nachfassen" style="padding:8px 16px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:12px;cursor:pointer;">🔄 Nachfassen</button>
            <button onclick="selAktivModalTyp(this,'📝','Sonstiges')"class="aktiv-typ-btn"        data-typ="Sonstiges"  style="padding:8px 16px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:12px;cursor:pointer;">📝 Sonstiges</button>
          </div>
          <input type="hidden" id="aktiv-modal-typ-val" value="Anruf">
          <input type="hidden" id="aktiv-modal-typ-ico" value="📞">
        </div>

        <!-- Kunde -->
        <div class="fg">
          <label class="fl">Kunde <span>*</span></label>
          <select class="fs" id="aktiv-modal-kunde">
            <option value="">— wählen —</option>
          </select>
        </div>

        <!-- Datum + Uhrzeit -->
        <div class="frow frow2">
          <div class="fg">
            <label class="fl">Datum <span>*</span></label>
            <input class="fi" type="date" id="aktiv-modal-datum">
          </div>
          <div class="fg">
            <label class="fl">Uhrzeit</label>
            <input class="fi" type="time" id="aktiv-modal-zeit" value="10:00">
          </div>
        </div>

        <!-- Mitarbeiter -->
        <div class="fg">
          <label class="fl">Durchgeführt von</label>
          <select class="fs" id="aktiv-modal-ma">
            <option value="">— wählen —</option>
            <option>Celal</option><option>Muhammet</option><option>Melanie</option>
            <option>Elvan</option><option>Selim</option><option>Okan</option>
          </select>
        </div>

        <!-- Notiz -->
        <div class="fg">
          <label class="fl">Notiz / Gesprächsinhalt</label>
          <textarea class="fta" id="aktiv-modal-notiz" rows="3" placeholder="Was wurde besprochen, vereinbart, erledigt…"></textarea>
        </div>

        <!-- Wiedervorlage -->
        <div style="background:var(--blue-l);border-radius:10px;padding:14px 16px;">
          <div style="font-size:12px;font-weight:600;color:var(--blue);margin-bottom:10px;">📅 Wiedervorlage (optional)</div>
          <div class="frow frow2">
            <div class="fg" style="margin-bottom:0;">
              <label class="fl">Datum</label>
              <input class="fi" type="date" id="aktiv-modal-wv-datum">
            </div>
            <div class="fg" style="margin-bottom:0;">
              <label class="fl">Aufgabe</label>
              <input class="fi" id="aktiv-modal-wv-aufgabe" placeholder="z.B. Angebot nachfassen">
            </div>
          </div>
        </div>

      </div>
      <div class="mfoot">
        <button class="btn" onclick="closeAktivModal()">Abbrechen</button>
        <button class="btn p" onclick="saveAktivitaet()" style="background:var(--blue);border-color:var(--blue);">✓ Aktivität speichern</button>
      </div>
    </div>
  </div>

<div class="modal-ov" id="kundeModal" onclick="if(event.target===this)closeKundeModal()">
    <div class="modal" style="width:860px;max-height:92vh;">

      <!-- Header -->
      <div class="mhdr" style="gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:38px;height:38px;border-radius:10px;background:var(--amber-l);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div class="mtitle">Neuer Kunde anlegen</div>
        </div>
        <button class="dp-close" onclick="closeKundeModal()">×</button>
      </div>

      <!-- Body: scrollbar -->
      <div class="mbody" style="padding:28px 32px;">

        <!-- 1 — FIRMENDATEN -->
        <div class="fsect" style="color:var(--amber);border-color:var(--amber);margin-bottom:18px;">1 — FIRMENDATEN</div>
        <div class="frow frow2" style="margin-bottom:14px;">
          <div class="fg">
            <label class="fl">Firmenname <span>*</span></label>
            <input class="fs" id="kd-name" placeholder="z.B. Ruhrbahn GmbH">
          </div>
          <div class="fg">
            <label class="fl">Kundennummer</label>
            <input class="fs" id="kd-knr" placeholder="K-0006" style="background:var(--gray-l);color:var(--text2);" readonly>
          </div>
        </div>
        <div class="frow frow3" style="margin-bottom:24px;">
          <div class="fg">
            <label class="fl">Branche</label>
            <div style="display:flex;gap:4px;">
              <input type="text" id="kd-branche" class="fs" list="kd-branche-datalist"
                placeholder="Tippen oder aus Liste wählen…" autocomplete="off"
                style="flex:1;min-width:0;">
              <button type="button" title="Liste anzeigen"
                onclick="var i=document.getElementById('kd-branche');i.value='';i.focus();"
                style="padding:0 10px;border-radius:7px;border:1px solid var(--border);background:var(--gray-l);color:var(--text2);font-size:14px;cursor:pointer;flex-shrink:0;">▾</button>
            </div>
            <datalist id="kd-branche-datalist">
              <option>ÖPNV</option><option>Medien</option><option>Finanzen</option>
              <option>Energie</option><option>Öffentlich / Behörde</option>
              <option>Handel</option><option>Industrie</option><option>Sonstiges</option>
            </datalist>
          </div>
          <div class="fg">
            <label class="fl">Umsatzsteuer-ID</label>
            <input class="fs" id="kd-ustid" placeholder="DE123456789">
          </div>
          <div class="fg">
            <label class="fl">Kundenstatus</label>
            <select class="fs" id="kd-status">
              <option>Neukontakt</option><option>Aktiv</option><option>Angebot</option><option>Geplant</option><option>Inaktiv</option>
            </select>
          </div>
        </div>

        <!-- 2 — ADRESSE -->
        <div class="fsect" style="color:var(--amber);border-color:var(--amber);margin-bottom:18px;">2 — ADRESSE</div>
        <div class="fg" style="margin-bottom:14px;">
          <label class="fl">Straße &amp; Hausnummer <span>*</span></label>
          <input class="fs" id="kd-adresse" placeholder="z.B. Berliner Platz 1">
        </div>
        <div class="frow frow2" style="margin-bottom:14px;">
          <div class="fg">
            <label class="fl">PLZ <span>*</span></label>
            <input class="fs" id="kd-plz" placeholder="45127">
          </div>
          <div class="fg">
            <label class="fl">Stadt <span>*</span></label>
            <input class="fs" id="kd-stadt" placeholder="Essen">
          </div>
        </div>
        <div class="frow frow2" style="margin-bottom:24px;">
          <div class="fg">
            <label class="fl">Bundesland</label>
            <select class="fs" id="kd-bundesland">
              <option>Nordrhein-Westfalen</option><option>Bayern</option><option>Baden-Württemberg</option>
              <option>Niedersachsen</option><option>Hessen</option><option>Sachsen</option>
              <option>Berlin</option><option>Hamburg</option><option>Sonstiges</option>
            </select>
          </div>
          <div class="fg">
            <label class="fl">Land</label>
            <input class="fs" id="kd-land" value="Deutschland">
          </div>
        </div>

        <!-- 3 — ALLGEMEINE KONTAKTDATEN -->
        <div class="fsect" style="color:var(--amber);border-color:var(--amber);margin-bottom:18px;">3 — ALLGEMEINE KONTAKTDATEN</div>
        <div class="frow frow2" style="margin-bottom:14px;">
          <div class="fg">
            <label class="fl">Telefon Zentrale</label>
            <input class="fs" id="kd-tel" placeholder="+49 201 1234567">
          </div>
          <div class="fg">
            <label class="fl">Fax</label>
            <input class="fs" id="kd-fax" placeholder="+49 201 1234568">
          </div>
        </div>
        <div class="frow frow2" style="margin-bottom:24px;">
          <div class="fg">
            <label class="fl">E-Mail allgemein <span>*</span></label>
            <input class="fs" id="kd-mail" placeholder="info@firma.de">
          </div>
          <div class="fg">
            <label class="fl">Website</label>
            <input class="fs" id="kd-website" placeholder="www.firma.de">
          </div>
        </div>

        <!-- 4 — HAUPTANSPRECHPARTNER -->
        <div class="fsect" style="color:var(--amber);border-color:var(--amber);margin-bottom:18px;">4 — HAUPTANSPRECHPARTNER</div>
        <div class="frow frow3" style="margin-bottom:14px;">
          <div class="fg">
            <label class="fl">Anrede</label>
            <select class="fs" id="kd-anrede">
              <option>Herr</option><option>Frau</option><option>Dr.</option><option>Prof.</option>
            </select>
          </div>
          <div class="fg">
            <label class="fl">Vorname <span>*</span></label>
            <input class="fs" id="kd-vorname" placeholder="Max">
          </div>
          <div class="fg">
            <label class="fl">Nachname <span>*</span></label>
            <input class="fs" id="kd-nachname" placeholder="Mustermann">
          </div>
        </div>
        <div class="frow frow2" style="margin-bottom:14px;">
          <div class="fg">
            <label class="fl">Position / Funktion</label>
            <input class="fs" id="kd-apfunktion" placeholder="z.B. Marketingleiter">
          </div>
          <div class="fg">
            <label class="fl">Abteilung</label>
            <input class="fs" id="kd-abteilung" placeholder="z.B. Marketing">
          </div>
        </div>
        <div class="frow frow2" style="margin-bottom:24px;">
          <div class="fg">
            <label class="fl">E-Mail direkt <span>*</span></label>
            <input class="fs" id="kd-apmail" placeholder="m.mustermann@firma.de">
          </div>
          <div class="fg">
            <label class="fl">Mobil / Telefon direkt</label>
            <input class="fs" id="kd-aptel" placeholder="+49 170 1234567">
          </div>
        </div>

        <!-- 5 — WEITERER ANSPRECHPARTNER -->
        <div class="fsect" style="color:var(--amber);border-color:var(--amber);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
          <span>5 — WEITERER ANSPRECHPARTNER</span>
          <button class="btn" style="font-size:11px;padding:3px 10px;" onclick="toggleWeitererAP()">+ hinzufügen</button>
        </div>
        <div id="kd-ap2-block" style="display:none;margin-bottom:16px;">
          <div class="frow frow3" style="margin-bottom:14px;">
            <div class="fg">
              <label class="fl">Anrede</label>
              <select class="fs" id="kd-ap2-anrede">
                <option>Herr</option><option>Frau</option><option>Dr.</option><option>Prof.</option>
              </select>
            </div>
            <div class="fg">
              <label class="fl">Vorname</label>
              <input class="fs" id="kd-ap2-vorname" placeholder="Vorname">
            </div>
            <div class="fg">
              <label class="fl">Nachname</label>
              <input class="fs" id="kd-ap2-nachname" placeholder="Nachname">
            </div>
          </div>
          <div class="frow frow2" style="margin-bottom:14px;">
            <div class="fg">
              <label class="fl">Position / Funktion</label>
              <input class="fs" id="kd-ap2-funktion" placeholder="z.B. Assistent">
            </div>
            <div class="fg">
              <label class="fl">Abteilung</label>
              <input class="fs" id="kd-ap2-abteilung" placeholder="z.B. Marketing">
            </div>
          </div>
          <div class="frow frow2" style="margin-bottom:8px;">
            <div class="fg">
              <label class="fl">E-Mail direkt</label>
              <input class="fs" id="kd-ap2-mail" placeholder="vorname@firma.de">
            </div>
            <div class="fg">
              <label class="fl">Mobil / Telefon</label>
              <input class="fs" id="kd-ap2-tel" placeholder="+49 170 ...">
            </div>
          </div>
          <div style="text-align:right;margin-bottom:8px;">
            <button class="btn" style="font-size:11px;color:var(--red);" onclick="toggleWeitererAP()">✕ Entfernen</button>
          </div>
        </div>

        <!-- 6 — RECHNUNGSADRESSE -->
        <div class="fsect" style="color:var(--amber);border-color:var(--amber);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
          <span>6 — RECHNUNGSADRESSE</span>
          <label style="display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;color:var(--blue);cursor:pointer;text-transform:uppercase;letter-spacing:.06em;">
            <input type="checkbox" id="kd-re-gleich" checked style="accent-color:var(--blue);width:15px;height:15px;">
            IDENTISCH MIT FIRMENADRESSE
          </label>
        </div>
        <div style="height:8px;"></div>

        <!-- 7 — INTERNE NOTIZEN & ZUSTÄNDIGKEIT -->
        <div class="fsect" style="color:var(--amber);border-color:var(--amber);margin-bottom:18px;">7 — INTERNE NOTIZEN &amp; ZUSTÄNDIGKEIT</div>
        <div class="frow frow2" style="margin-bottom:14px;">
          <div class="fg">
            <label class="fl">Zuständiger Mitarbeiter (CC)</label>
            <select class="fs" id="kd-zustaendig">
              <option value="">— wählen —</option>
              <option>Celal</option><option>Muhammet</option><option>Melanie</option>
              <option>Elvan</option>
            </select>
          </div>
          <div class="fg">
            <label class="fl">Zahlungsziel (Tage)</label>
            <select class="fs" id="kd-zahlungsziel">
              <option>14 Tage</option><option selected>30 Tage</option><option>45 Tage</option><option>60 Tage</option>
            </select>
          </div>
        </div>
        <div class="fg" style="margin-bottom:8px;">
          <label class="fl">Interne Notiz</label>
          <textarea class="fs fta" id="kd-notiz" rows="3" placeholder="Besonderheiten, Vereinbarungen, wichtige Infos…"></textarea>
        </div>

      </div><!-- /mbody -->

      <div class="mfoot">
        <button class="btn" onclick="closeKundeModal()">Abbrechen</button>
        <button class="btn p" onclick="saveKunde()" style="background:var(--amber);border-color:var(--amber);padding:8px 22px;font-size:13px;">✓ Kunde anlegen</button>
      </div>
    </div>
  </div>

<div class="modal-ov" id="agModalSimple" onclick="if(event.target===this)document.getElementById('agModalSimple').classList.remove('open')">
  <div class="modal" style="width:700px;">
    <div class="mhdr"><div class="mtitle">Neues Angebot erstellen</div><button class="dp-close" onclick="document.getElementById('agModalSimple').classList.remove('open')">×</button></div>
    <div class="mbody">
      <div class="fsect">Kunde & Beschreibung</div>
      <div class="frow frow2">
        <div class="fg"><label class="fl">Kunde <span>*</span></label><select class="fs"><option>— wählen —</option><option>Ruhrbahn GmbH</option><option>DVG Duisburg</option><option>Bogestra AG</option><option>Radio Essen</option><option>Neuer Kunde…</option></select></div>
        <div class="fg"><label class="fl">Ansprechpartner</label><input class="fi" type="text" placeholder="Name"></div>
      </div>
      <div class="fg"><label class="fl">Beschreibung</label><input class="fi" type="text" placeholder="z.B. Ganzgestaltung Bus 1789"></div>
      <div class="fsect">Positionen</div>
      <div id="agPositionen">
        <div class="pos-row" style="font-size:11px;font-weight:600;color:var(--text2);border-bottom:2px solid var(--border);padding-bottom:6px;">
          <span>Beschreibung</span><span>Menge</span><span>Einheit</span><span>Einzelpreis</span><span></span>
        </div>
        <div class="pos-row">
          <input class="fi" placeholder="Position 1" style="font-size:12px;">
          <input class="fi" type="number" placeholder="1" id="agM1" oninput="calcAG()" style="font-size:12px;">
          <select class="fs" style="font-size:12px;padding:6px;"><option>Stk</option><option>m²</option><option>lfm</option><option>pauschal</option></select>
          <input class="fi" type="number" placeholder="0.00" id="agP1" oninput="calcAG()" style="font-size:12px;">
          <button onclick="showToast('Zeile entfernt')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px;">×</button>
        </div>
        <div class="pos-row">
          <input class="fi" placeholder="Position 2" style="font-size:12px;">
          <input class="fi" type="number" placeholder="1" id="agM2" oninput="calcAG()" style="font-size:12px;">
          <select class="fs" style="font-size:12px;padding:6px;"><option>Stk</option><option>m²</option><option>lfm</option><option>pauschal</option></select>
          <input class="fi" type="number" placeholder="0.00" id="agP2" oninput="calcAG()" style="font-size:12px;">
          <button onclick="showToast('Zeile entfernt')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px;">×</button>
        </div>
        <div class="pos-row">
          <input class="fi" placeholder="Position 3" style="font-size:12px;">
          <input class="fi" type="number" placeholder="1" id="agM3" oninput="calcAG()" style="font-size:12px;">
          <select class="fs" style="font-size:12px;padding:6px;"><option>Stk</option><option>m²</option><option>lfm</option><option>pauschal</option></select>
          <input class="fi" type="number" placeholder="0.00" id="agP3" oninput="calcAG()" style="font-size:12px;">
          <button onclick="showToast('Zeile entfernt')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px;">×</button>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
        <button class="btn" onclick="showToast('Position hinzugefügt')">+ Position</button>
        <div style="text-align:right;">
          <div style="font-size:12px;color:var(--text2);">Netto: <span id="agNetto" style="font-weight:600;">€ 0,00</span></div>
          <div style="font-size:12px;color:var(--text2);">MwSt. 19%: <span id="agMwst">€ 0,00</span></div>
          <div class="pos-total" id="agBrutto">Gesamt: € 0,00</div>
        </div>
      </div>
      <div class="fsect" style="margin-top:8px;">Konditionen</div>
      <div class="frow frow3">
        <div class="fg"><label class="fl">Gültig bis</label><input class="fi" type="date"></div>
        <div class="fg"><label class="fl">Zahlungsziel</label><select class="fs"><option>30 Tage</option><option>14 Tage</option><option>45 Tage</option></select></div>
        <div class="fg"><label class="fl">Zuständig</label><select class="fs"><option>Celal</option><option>Muhammet</option><option>Elvan</option></select></div>
      </div>
    </div>
    <div class="mfoot">
      <button class="btn" onclick="document.getElementById('agModal').classList.remove('open')">Abbrechen</button>
      <button class="btn" onclick="showToast('Entwurf gespeichert')">Entwurf</button>
      <button class="btn" onclick="showToast('Angebot als PDF generiert')">PDF Vorschau</button>
      <button class="btn p" onclick="showToast('✓ Angebot AG-2026-020 erstellt & versendet');document.getElementById('agModal').classList.remove('open')">Erstellen & Senden →</button>
    </div>
  </div>
</div>

<div class="modal-ov" id="ccTerminModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="modal" style="width:500px;">
    <div class="mhdr">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:8px;background:var(--blue-l);display:flex;align-items:center;justify-content:center;">📅</div>
        <div class="mtitle">Neuer Montagetermin</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:11px;color:var(--text3);">🔄 Wird mit FUSA synchronisiert</span>
        <button class="dp-close" onclick="document.getElementById('ccTerminModal').classList.remove('open')">×</button>
      </div>
    </div>
    <div class="mbody">
      <div class="frow frow2">
        <div class="fg"><label class="fl">Datum <span>*</span></label><input class="fi" id="ccT-datum" type="date"></div>
        <div class="fg"><label class="fl">Typ / Farbe</label>
          <select class="fs" id="ccT-typ">
            <option value="blue">🔵 Montage</option>
            <option value="green">🟢 Abnahme / Fertig</option>
            <option value="amber">🟡 Geplant</option>
            <option value="red">🔴 Dringend</option>
            <option value="purple">🟣 Sonstiges</option>
          </select>
        </div>
      </div>
      <div class="fg"><label class="fl">Bezeichnung <span>*</span></label><input class="fi" id="ccT-titel" type="text" placeholder="z.B. DVG Bus 412 · Beklebung"></div>
      <div class="frow frow2">
        <div class="fg"><label class="fl">Depot</label>
          <select class="fs" id="ccT-depot">
            <option>Stadtmitte</option>
            <option>Mülheim</option>
            <option>Bochum</option>
          </select>
        </div>
        <div class="fg"><label class="fl">Monteur</label>
          <select class="fs" id="ccT-monteur">
            <option value="">— optional —</option>
            <option>Okan</option><option>Mete</option><option>Mohammed</option>
            <option>Okan + Mete</option><option>Okan + Mohammed</option>
          </select>
        </div>
      </div>
    </div>
    <div class="mfoot">
      <button class="btn" onclick="document.getElementById('ccTerminModal').classList.remove('open')">Abbrechen</button>
      <button class="btn p" onclick="submitCCTermin()">💾 Speichern & FUSA sync →</button>
    </div>
  </div>
</div>

<div class="modal-ov" id="clModal" onclick="if(event.target===this)document.getElementById('clModal').classList.remove('open')">
  <div class="modal" style="width:520px;">
    <div class="mhdr">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:8px;background:var(--blue-l);display:flex;align-items:center;justify-content:center;font-size:16px;">📋</div>
        <div class="mtitle" id="clModalTitle">Neue Vorlage</div>
      </div>
      <button class="dp-close" onclick="document.getElementById('clModal').classList.remove('open')">×</button>
    </div>
    <div class="mbody">
      <div class="frow frow2">
        <div class="fg">
          <label class="fl">Name der Vorlage <span>*</span></label>
          <input class="fi" id="cl-name" type="text" placeholder="z.B. Fahrzeugbeklebung">
        </div>
        <div class="fg">
          <label class="fl">Auftragsart</label>
          <select class="fs" id="cl-art">
            <option value="">— alle —</option>
            <option value="busbeklebung">Busbeklebung</option>
            <option value="ganzgestaltung">Ganzgestaltung</option>
            <option value="teilgestaltung">Teilgestaltung</option>
            <option value="digitaldruck">Digitaldruck / Plakat</option>
            <option value="schild">Schild (Dibond / Acryl)</option>
            <option value="banner">Banner / Rollup</option>
            <option value="montage_only">Nur Montage</option>
            <option value="sonstiges">Sonstiges</option>
          </select>
        </div>
      </div>
      <div class="fg">
        <label class="fl">Beschreibung</label>
        <input class="fi" id="cl-beschr" type="text" placeholder="z.B. Standard-Abnahme für alle Fahrzeugbeklebungen">
      </div>
      <div class="fg">
        <label class="fl">Icon / Farbe</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;" id="cl-farb-grid">
          <button onclick="clSelFarbe(this,'var(--blue)','🚌')" data-col="var(--blue)" data-ico="🚌" type="button" style="padding:8px 12px;border-radius:8px;border:2px solid var(--blue);background:var(--blue-l);cursor:pointer;font-size:13px;">🚗 PKW</button>
          <button onclick="clSelFarbe(this,'var(--purple)','🎨')" data-col="var(--purple)" data-ico="🎨" type="button" style="padding:8px 12px;border-radius:8px;border:2px solid var(--border);background:#fff;cursor:pointer;font-size:13px;">🎨 Grafik</button>
          <button onclick="clSelFarbe(this,'var(--teal)','📐')" data-col="var(--teal)" data-ico="📐" type="button" style="padding:8px 12px;border-radius:8px;border:2px solid var(--border);background:#fff;cursor:pointer;font-size:13px;">📐 Produktion</button>
          <button onclick="clSelFarbe(this,'var(--amber)','🪧')" data-col="var(--amber)" data-ico="🪧" type="button" style="padding:8px 12px;border-radius:8px;border:2px solid var(--border);background:#fff;cursor:pointer;font-size:13px;">🪧 Schild</button>
          <button onclick="clSelFarbe(this,'var(--green)','✅')" data-col="var(--green)" data-ico="✅" type="button" style="padding:8px 12px;border-radius:8px;border:2px solid var(--border);background:#fff;cursor:pointer;font-size:13px;">✅ Abnahme</button>
          <button onclick="clSelFarbe(this,'var(--red)','⚠️')" data-col="var(--red)" data-ico="⚠️" type="button" style="padding:8px 12px;border-radius:8px;border:2px solid var(--border);background:#fff;cursor:pointer;font-size:13px;">⚠️ Sonstig</button>
        </div>
      </div>
    </div>
    <div class="mfoot">
      <button class="btn" onclick="document.getElementById('clModal').classList.remove('open')">Abbrechen</button>
      <button class="btn p" onclick="clSaveVorlage()">Vorlage anlegen</button>
    </div>
  </div>
</div>

<div class="modal-ov" id="clPunktModal" onclick="if(event.target===this)document.getElementById('clPunktModal').classList.remove('open')">
  <div class="modal" style="width:480px;">
    <div class="mhdr">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:8px;background:var(--green-l);display:flex;align-items:center;justify-content:center;font-size:16px;">➕</div>
        <div class="mtitle" id="clPunktTitle">Prüfpunkt hinzufügen</div>
      </div>
      <button class="dp-close" onclick="document.getElementById('clPunktModal').classList.remove('open')">×</button>
    </div>
    <div class="mbody">
      <div class="fg">
        <label class="fl">Prüfpunkt <span>*</span></label>
        <input class="fi" id="clp-text" type="text" placeholder="z.B. Folie vollflächig und blasenfrei verklebt">
      </div>
      <div class="frow frow2">
        <div class="fg">
          <label class="fl">Kategorie</label>
          <select class="fs" id="clp-kat">
            <option value="pflicht">✅ Pflicht</option>
            <option value="optional">○ Optional</option>
            <option value="foto">📷 Foto erforderlich</option>
          </select>
        </div>
        <div class="fg">
          <label class="fl">Hinweis / Erklärung</label>
          <input class="fi" id="clp-hinweis" type="text" placeholder="Optional">
        </div>
      </div>
    </div>
    <div class="mfoot">
      <button class="btn" onclick="document.getElementById('clPunktModal').classList.remove('open')">Abbrechen</button>
      <button class="btn p" onclick="clSavePunkt()">Punkt speichern</button>
    </div>
  </div>
</div>

<div class="modal-ov" id="agModal" onclick="if(event.target===this)agModalClose()">
  <div class="modal" style="width:800px;max-height:94vh;">
    <div class="mhdr" style="background:var(--blue);border-radius:13px 13px 0 0;flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:18px;">📄</div>
        <div>
          <div class="mtitle" style="color:#fff;" id="agModalTitle">Neues Angebot</div>
          <div style="font-size:11px;color:rgba(255,255,255,.55);">Professionelles Angebot mit mehreren Positionen</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span id="agModalId" style="font-size:12px;color:rgba(255,255,255,.5);"></span>
        <button class="dp-close" onclick="agModalClose()" style="color:#fff;background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);">×</button>
      </div>
    </div>

    <div class="mbody" style="padding:0;overflow-y:auto;">

      <!-- ① Angebotskopf -->
      <div class="ac-block" id="agac-1">
        <div class="ac-hdr" onclick="agAcToggle(1)" style="padding:11px 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">1</span>
            <div><div class="ac-title">Angebotskopf</div><div class="ac-sub" id="agac-sub-1">Kunde, Datum, Gültigkeit</div></div>
          </div>
          <span class="ac-arrow open" id="agac-arrow-1">›</span>
        </div>
        <div class="ac-body" id="agac-body-1">
          <div class="frow frow2">
            <div class="fg"><label class="fl">Kunde / Firma <span>*</span></label>
              <select class="fs" id="ag-kunde">
                <option value="">— wählen —</option>
              </select>
            </div>
            <div class="fg"><label class="fl">Ansprechpartner</label><input class="fi" id="ag-ap" type="text" placeholder="z.B. Hr. Müller"></div>
          </div>
          <div class="frow frow3">
            <div class="fg"><label class="fl">Angebots-Datum</label><input class="fi" id="ag-datum" type="date"></div>
            <div class="fg"><label class="fl">Gültig bis</label><input class="fi" id="ag-gueltig" type="date"></div>
            <div class="fg"><label class="fl">Zahlungsziel</label>
              <select class="fs" id="ag-zahlung">
                <option>30 Tage netto</option><option>14 Tage netto</option>
                <option>45 Tage netto</option><option>Sofort</option>
              </select>
            </div>
          </div>
          <div class="fg"><label class="fl">Betreff / Titel des Angebots</label>
            <input class="fi" id="ag-betreff" type="text" list="ag-betreff-list" placeholder="z.B. Fahrzeugbeschriftung 3 Busse – Ganzgestaltung">
            <datalist id="ag-betreff-list"></datalist>
          </div>
          <div class="fg"><label class="fl">Einleitungstext (erscheint im PDF)</label>
            <textarea class="fta" id="ag-einleitung" style="min-height:55px;" placeholder="z.B. Sehr geehrter Herr Müller, gerne unterbreiten wir Ihnen folgendes Angebot…"></textarea>
          </div>
        </div>
      </div>

      <!-- ② Positionen -->
      <div class="ac-block" id="agac-2">
        <div class="ac-hdr" onclick="agAcToggle(2)" style="padding:11px 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">2</span>
            <div><div class="ac-title">Positionen</div><div class="ac-sub" id="agac-sub-2">Keine Positionen</div></div>
          </div>
          <span class="ac-arrow" id="agac-arrow-2">›</span>
        </div>
        <div class="ac-body ac-closed" id="agac-body-2">
          <!-- ── Maße / Flächenberechnung ── -->
          <div style="background:var(--blue-l);border-radius:9px;padding:12px;margin-bottom:12px;border:1.5px solid var(--blue)20;">
            <div style="font-size:12px;font-weight:700;color:var(--blue);margin-bottom:8px;">📐 Maße / Flächenberechnung</div>
            <div class="frow frow3" style="margin-bottom:8px;">
              <div class="fg">
                <label class="fl" style="font-size:11px;">Breite (m)</label>
                <input class="fi" id="ag-mass-b" type="number" step="0.01" placeholder="z.B. 3.0" oninput="agCalcFlaeche()">
              </div>
              <div class="fg">
                <label class="fl" style="font-size:11px;">Höhe (m)</label>
                <input class="fi" id="ag-mass-h" type="number" step="0.01" placeholder="z.B. 2.0" oninput="agCalcFlaeche()">
              </div>
              <div class="fg">
                <label class="fl" style="font-size:11px;">Stück</label>
                <input class="fi" id="ag-mass-stk" type="number" value="1" min="1" oninput="agCalcFlaeche()">
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div id="ag-flaeche-anzeige" style="font-size:14px;font-weight:700;color:var(--blue);">Fläche: — m²</div>
              <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text2);cursor:pointer;">
                <input type="checkbox" id="ag-mass-manuell" onchange="agMassToggle()">
                Menge manuell überschreiben
              </label>
              <button type="button" onclick="agFlaecheUebernehmen()" class="btn p" style="font-size:11px;padding:5px 12px;">↓ Fläche in m²-Positionen übernehmen</button>
            </div>
          </div>

          <!-- Positionen Tabelle -->
          <div id="ag-pos-table" style="margin-bottom:10px;"></div>
          <!-- Neue Position -->
          <div style="background:var(--gray-l);border-radius:9px;padding:12px;margin-bottom:8px;">
            <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:8px;">+ Neue Position</div>
            <div class="frow frow2" style="margin-bottom:6px;">
              <div class="fg"><label class="fl" style="font-size:11px;">Bezeichnung</label>
                <input class="fi" id="agp-bez" type="text" placeholder="z.B. Digitaldruckfolie ORAJET® 3551, blasenfrei, vollflächig">
              </div>
              <div class="fg"><label class="fl" style="font-size:11px;">Einheit</label>
                <select class="fs" id="agp-eh" style="font-size:12px;" onchange="if(this.value==='m²'&&agFlaeche>0&&!document.getElementById('ag-mass-manuell')?.checked){document.getElementById('agp-menge').value=agFlaeche.toFixed(2);agCalcPos();}">
                  <option>m²</option><option>lfm</option><option>Stk</option>
                  <option>pauschal</option><option>h</option>
                </select>
              </div>
            </div>
            <div class="frow frow3">
              <div class="fg"><label class="fl" style="font-size:11px;">Menge</label>
                <input class="fi" id="agp-menge" type="number" value="1" step="0.01" oninput="agCalcPos()">
              </div>
              <div class="fg"><label class="fl" style="font-size:11px;">Einzelpreis (€)</label>
                <input class="fi" id="agp-ep" type="number" step="0.01" placeholder="0.00" oninput="agCalcPos()">
              </div>
              <div class="fg"><label class="fl" style="font-size:11px;">Gesamt</label>
                <input class="fi" id="agp-gesamt" readonly style="background:var(--gray-l);font-weight:700;" placeholder="—">
              </div>
            </div>
            <div class="fg" style="margin-top:6px;"><label class="fl" style="font-size:11px;">Beschreibung (optional)</label>
              <input class="fi" id="agp-beschr" type="text" placeholder="z.B. inkl. Druck, Laminierung, Zuschnitt">
            </div>
            <button class="btn p" onclick="agAddPos()" style="margin-top:8px;font-size:12px;">+ Position hinzufügen</button>
          </div>
          <!-- Schnell-Bausteine -->
          <div style="margin-bottom:4px;">
            <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Schnell-Bausteine</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;" id="ag-schnell-btns">
              <button type="button" onclick="agAddSchnell('Digitaldruckfolie',85,'m²')" style="padding:5px 10px;border-radius:7px;border:1px solid var(--blue);background:var(--blue-l);color:var(--blue);font-size:11px;cursor:pointer;">+ Folie /m²</button>
              <button type="button" onclick="agAddSchnell('Laminat',18,'m²')" style="padding:5px 10px;border-radius:7px;border:1px solid var(--teal);background:var(--teal-l);color:var(--teal);font-size:11px;cursor:pointer;">+ Laminat /m²</button>
              <button type="button" onclick="agAddSchnell('Grafik / Design',120,'pauschal')" style="padding:5px 10px;border-radius:7px;border:1px solid var(--purple);background:var(--purple-l);color:var(--purple);font-size:11px;cursor:pointer;">+ Design</button>
              <button type="button" onclick="agAddSchnell('Montage',180,'pauschal')" style="padding:5px 10px;border-radius:7px;border:1px solid var(--amber);background:var(--amber-l);color:var(--amber);font-size:11px;cursor:pointer;">+ Montage</button>
              <button type="button" onclick="agAddSchnell('Fahrzeugreinigung',60,'pauschal')" style="padding:5px 10px;border-radius:7px;border:1px solid var(--teal);background:var(--teal-l);color:var(--teal);font-size:11px;cursor:pointer;">+ Reinigung</button>
              <button type="button" onclick="agAddSchnell('Express-Aufschlag',80,'pauschal')" style="padding:5px 10px;border-radius:7px;border:1px solid var(--red);background:var(--red-l,#FEECEC);color:var(--red);font-size:11px;cursor:pointer;">+ Express</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ③ Preisübersicht -->
      <div class="ac-block" id="agac-3">
        <div class="ac-hdr" onclick="agAcToggle(3)" style="padding:11px 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">3</span>
            <div><div class="ac-title">Preisübersicht</div><div class="ac-sub" id="agac-sub-3">Netto, Rabatt, MwSt, Brutto</div></div>
          </div>
          <span class="ac-arrow" id="agac-arrow-3">›</span>
        </div>
        <div class="ac-body ac-closed" id="agac-body-3">
          <div style="background:var(--gray-l);border-radius:10px;padding:14px;margin-bottom:10px;">
            <div id="ag-preis-rows" style="font-size:13px;color:var(--text2);margin-bottom:10px;"></div>
            <div class="frow frow2" style="margin-bottom:10px;">
              <div class="fg"><label class="fl" style="font-size:11px;">Rabatt (%)</label>
                <input class="fi" id="ag-rabatt" type="number" value="0" min="0" max="100" oninput="agCalcSumme()">
              </div>
              <div class="fg"><label class="fl" style="font-size:11px;">MwSt. (%)</label>
                <select class="fs" id="ag-mwst" onchange="agCalcSumme()">
                  <option value="19" selected>19% (Standard)</option>
                  <option value="7">7% (ermäßigt)</option>
                  <option value="0">0% (steuerfrei)</option>
                </select>
              </div>
            </div>
            <div style="border-top:1.5px solid var(--border);padding-top:10px;">
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:4px;">
                <span>Zwischensumme</span><span id="ag-zwischensumme">€ 0,00</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--red);margin-bottom:4px;" id="ag-rabatt-row" style="display:none;">
                <span id="ag-rabatt-lbl">Rabatt 0%</span><span id="ag-rabatt-val">– € 0,00</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:4px;">
                <span>Netto gesamt</span><span style="color:var(--green);" id="ag-netto-total">€ 0,00</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:4px;">
                <span id="ag-mwst-lbl">+ MwSt. 19%</span><span id="ag-mwst-val">€ 0,00</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;padding-top:6px;border-top:1px solid var(--border);">
                <span>Brutto gesamt</span><span style="color:var(--blue);" id="ag-brutto-total">€ 0,00</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ④ Schlusstext -->
      <div class="ac-block" id="agac-4" style="border-bottom:none;">
        <div class="ac-hdr" onclick="agAcToggle(4)" style="padding:11px 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">4</span>
            <div><div class="ac-title">Schlusstext & Notizen</div><div class="ac-sub">Abschlusstext, interne Notizen</div></div>
          </div>
          <span class="ac-arrow" id="agac-arrow-4">›</span>
        </div>
        <div class="ac-body ac-closed" id="agac-body-4">
          <div class="fg"><label class="fl">Schlusstext (erscheint im PDF)</label>
            <textarea class="fta" id="ag-schluss" style="min-height:55px;" placeholder="z.B. Bei Fragen stehen wir Ihnen gerne zur Verfügung. Wir freuen uns auf Ihren Auftrag."></textarea>
          </div>
          <div class="fg"><label class="fl">Interne Notiz (nicht im PDF)</label>
            <textarea class="fta" id="ag-inotiz" style="min-height:45px;" placeholder="z.B. Kunde hat Interesse an Folgeauftrag geäußert…"></textarea>
          </div>
        </div>
      </div>
    </div>

    <div class="mfoot" style="flex-shrink:0;">
      <button class="btn" onclick="agModalClose()">Abbrechen</button>
      <button class="btn" onclick="agSave('entwurf')" style="background:var(--blue-l);color:var(--blue);border-color:var(--blue);">💾 Entwurf</button>
      <button class="btn" onclick="agSave('versendet')" style="background:var(--amber-l);color:var(--amber);border-color:var(--amber);">📤 Versenden</button>
      <button class="btn p" onclick="agSave('entwurf');showToast('PDF-Vorschau...')" style="background:var(--blue);">📄 PDF Vorschau</button>
    </div>
  </div>
</div>

<div class="modal-ov" id="anfModal" onclick="if(event.target===this)anfModalClose()">
  <div class="modal" style="width:740px;max-height:94vh;display:flex;flex-direction:column;">
    <div class="mhdr" style="background:var(--green);border-radius:13px 13px 0 0;flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:18px;">⚡</div>
        <div>
          <div class="mtitle" style="color:#fff;">Schnell-Angebot</div>
          <div style="font-size:11px;color:rgba(255,255,255,.6);">In unter 1 Minute · Preis wird automatisch berechnet</div>
        </div>
      </div>
      <button class="dp-close" onclick="anfModalClose()" style="color:#fff;background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);">×</button>
    </div>

    <!-- PREIS-BANNER oben immer sichtbar -->
    <div style="background:#0A1929;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:14px;">
        <div>
          <div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;">Netto</div>
          <div style="font-size:28px;font-weight:700;color:var(--green);font-variant-numeric:tabular-nums;" id="anf-banner-netto">€ 0,00</div>
        </div>
        <div style="width:1px;height:36px;background:rgba(255,255,255,.1);"></div>
        <div>
          <div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;">Brutto (19%)</div>
          <div style="font-size:18px;font-weight:600;color:rgba(255,255,255,.65);" id="anf-banner-brutto">€ 0,00</div>
        </div>
        <div style="width:1px;height:36px;background:rgba(255,255,255,.1);"></div>
        <div>
          <div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;">Mindestpreis</div>
          <div style="font-size:14px;font-weight:600;" id="anf-banner-mindest">—</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button onclick="anfSenden('whatsapp')" style="padding:8px 14px;background:#25D366;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">💬 WhatsApp</button>
        <button onclick="anfSenden('email')" style="padding:8px 14px;background:var(--blue);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">📤 Senden</button>
      </div>
    </div>

    <div class="mbody" style="padding:0;overflow-y:auto;flex:1;">

      <!-- ① Vorlage & Leistungsart -->
      <div class="ac-block" id="anfac-1">
        <div class="ac-hdr" onclick="anfAcToggle(1)" style="padding:11px 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num" style="background:var(--green);">1</span>
            <div><div class="ac-title">Kunde</div><div class="ac-sub" id="anfac-sub-1">Name, Kontakt, Kanal</div></div>
          </div><span class="ac-arrow" id="anfac-arrow-1">›</span>
        </div>
        <div class="ac-body ac-closed" id="anfac-body-1">
          <div class="frow frow2">
            <div class="fg"><label class="fl">Name / Firma <span>*</span></label><input class="fi" id="anf-kunde" type="text" placeholder="z.B. Müller GmbH" oninput="anfUpdateSub()"></div>
            <div class="fg"><label class="fl">Telefon / E-Mail</label><input class="fi" id="anf-kontakt" type="text" placeholder="für WhatsApp / E-Mail"></div>
          </div>
          <div class="fg"><label class="fl">Wunschbeschreibung</label>
            <textarea class="fta" id="anf-beschr" placeholder="z.B. Shopfront 3×2m, Firmenlogo, milchige Folie" style="min-height:55px;"></textarea>
          </div>
          <div class="fg"><label class="fl">Kanal</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;" id="anf-kanal-btns">
              <button type="button" onclick="anfSelKanal(this,'Telefon')" class="anf-kanal-btn active" style="padding:5px 12px;border-radius:20px;border:1.5px solid var(--green);background:var(--green-l);color:var(--green);font-size:12px;font-weight:600;cursor:pointer;">📞 Telefon</button>
              <button type="button" onclick="anfSelKanal(this,'E-Mail')" class="anf-kanal-btn" style="padding:5px 12px;border-radius:20px;border:1.5px solid var(--border);background:#fff;color:var(--text2);font-size:12px;cursor:pointer;">✉️ E-Mail</button>
              <button type="button" onclick="anfSelKanal(this,'WhatsApp')" class="anf-kanal-btn" style="padding:5px 12px;border-radius:20px;border:1.5px solid var(--border);background:#fff;color:var(--text2);font-size:12px;cursor:pointer;">💬 WhatsApp</button>
              <button type="button" onclick="anfSelKanal(this,'Vor Ort')" class="anf-kanal-btn" style="padding:5px 12px;border-radius:20px;border:1.5px solid var(--border);background:#fff;color:var(--text2);font-size:12px;cursor:pointer;">🚪 Vor Ort</button>
            </div>
          </div>
        </div>
      </div><div class="ac-block" id="anfac-2">
        <div class="ac-hdr" onclick="anfAcToggle(2)" style="padding:11px 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num" style="background:var(--green);">2</span>
            <div><div class="ac-title">Vorlage & Leistungsart</div><div class="ac-sub" id="anfac-sub-2">Vorlage wählen für Schnellstart</div></div>
          </div><span class="ac-arrow open" id="anfac-arrow-2">›</span>
        </div>
        <div class="ac-body" id="anfac-body-2">
          <!-- Fahrzeuggröße — nur sichtbar wenn Leistung = Fahrzeug -->
          <div id="anf-fzg-groesse-block" style="margin-bottom:12px;padding:10px 12px;background:var(--blue-l);border-radius:9px;border-left:3px solid var(--blue);">
            <div style="font-size:10px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px;">Fahrzeuggröße</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;" id="anf-fzg-btns">
              <button type="button" id="anf-fzg-pkw-klein"      onclick="anfSelFzgGroesse('pkw-klein')"      style="padding:5px 11px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;white-space:nowrap;">🚗 PKW Klein</button>
              <button type="button" id="anf-fzg-pkw-mittel"     onclick="anfSelFzgGroesse('pkw-mittel')"     style="padding:5px 11px;border-radius:7px;border:1.5px solid var(--blue);background:var(--blue-l);font-size:11px;font-weight:700;color:var(--blue);cursor:pointer;white-space:nowrap;">🚗 PKW Mittel</button>
              <button type="button" id="anf-fzg-pkw-gross"      onclick="anfSelFzgGroesse('pkw-gross')"      style="padding:5px 11px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;white-space:nowrap;">🚗 PKW Groß</button>
              <button type="button" id="anf-fzg-trans-klein"    onclick="anfSelFzgGroesse('trans-klein')"    style="padding:5px 11px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;white-space:nowrap;">🚐 Trans. Klein</button>
              <button type="button" id="anf-fzg-trans-mittel"   onclick="anfSelFzgGroesse('trans-mittel')"   style="padding:5px 11px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;white-space:nowrap;">🚐 Trans. Mittel</button>
              <button type="button" id="anf-fzg-trans-gross"    onclick="anfSelFzgGroesse('trans-gross')"    style="padding:5px 11px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;white-space:nowrap;">🚐 Trans. Groß</button>
            </div>
          </div>
          <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px;">Schnell-Vorlagen (1 Klick)</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px;" id="anf-vorlagen-grid"></div>
          <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px;">Leistungsart</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;" id="anf-leistung-btns"></div>
          <div id="anf-mat-vorschlag" style="display:none;margin-top:10px;padding:9px 12px;background:#F0FFF4;border-radius:8px;border-left:3px solid var(--green);">
            <div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:3px;">💡 Empfohlenes Material</div>
            <div id="anf-mat-vorschlag-text" style="font-size:12px;color:var(--text2);"></div>
          </div>
        </div>
      </div><div class="ac-block" id="anfac-3">
        <div class="ac-hdr" onclick="anfAcToggle(3)" style="padding:11px 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num" style="background:var(--green);">3</span>
            <div><div class="ac-title">Maße, Schwierigkeit & Lieferzeit</div><div class="ac-sub" id="anfac-sub-3">Fläche, Aufwand, Express</div></div>
          </div><span class="ac-arrow" id="anfac-arrow-3">›</span>
        </div>
        <div class="ac-body ac-closed" id="anfac-body-3">
          <div class="frow frow3">
            <div class="fg"><label class="fl">Breite (m)</label><input class="fi" id="anf-b" type="number" step="0.01" placeholder="1.50" oninput="anfCalcUndRender()"></div>
            <div class="fg"><label class="fl">Höhe (m)</label><input class="fi" id="anf-h" type="number" step="0.01" placeholder="0.80" oninput="anfCalcUndRender()"></div>
            <div class="fg"><label class="fl">Stück</label><input class="fi" id="anf-stueck" type="number" value="1" min="1" oninput="anfCalcUndRender()"></div>
          </div>
          <div id="anf-flaeche-info" style="display:none;padding:8px 12px;background:var(--blue-l);border-radius:7px;font-size:12px;color:var(--blue);margin-bottom:10px;"></div>

          <!-- Grafik: Stundeneingabe -->
          <div class="fg" style="margin-bottom:10px;">
            <label class="fl">Grafik / Design — Stunden (75 €/h)</label>
            <div style="display:flex;align-items:center;gap:10px;">
              <input class="fi" id="anf-grafik-std" type="number" step="0.5" min="0" value="1" placeholder="z.B. 1.5" oninput="anfParams.grafik_std=parseFloat(this.value)||0;anfCalcUndRender();" style="width:90px;">
              <div style="display:flex;gap:5px;">
                <button type="button" onclick="document.getElementById('anf-grafik-std').value=1;anfParams.grafik_std=1;anfCalcUndRender();" style="padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;">1h</button>
                <button type="button" onclick="document.getElementById('anf-grafik-std').value=2;anfParams.grafik_std=2;anfCalcUndRender();" style="padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;">2h</button>
                <button type="button" onclick="document.getElementById('anf-grafik-std').value=4;anfParams.grafik_std=4;anfCalcUndRender();" style="padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;">4h</button>
                <button type="button" onclick="document.getElementById('anf-grafik-std').value=0;anfParams.grafik_std=0;anfCalcUndRender();" style="padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;color:var(--text3);cursor:pointer;">Keine</button>
              </div>
              <span style="font-size:11px;color:var(--text3);">= <span id="anf-grafik-preis-hint">€ 75,00</span></span>
            </div>
          </div>

          <!-- Montage: Stunden -->
          <div class="fg" style="margin-bottom:10px;">
            <label class="fl">Montage — Stunden (55 €/h) <span style="font-size:10px;color:var(--text3);">leer = Richtwert aus Fläche</span></label>
            <div style="display:flex;align-items:center;gap:10px;">
              <input class="fi" id="anf-montage-std" type="number" step="0.5" min="0" placeholder="auto" oninput="anfParams.montage_std=this.value!==''?parseFloat(this.value):null;anfCalcUndRender();" style="width:90px;">
              <div style="display:flex;gap:5px;">
                <button type="button" onclick="document.getElementById('anf-montage-std').value=2;anfParams.montage_std=2;anfCalcUndRender();" style="padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;">2h</button>
                <button type="button" onclick="document.getElementById('anf-montage-std').value=4;anfParams.montage_std=4;anfCalcUndRender();" style="padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;">4h</button>
                <button type="button" onclick="document.getElementById('anf-montage-std').value=8;anfParams.montage_std=8;anfCalcUndRender();" style="padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;cursor:pointer;">8h</button>
                <button type="button" onclick="document.getElementById('anf-montage-std').value='';anfParams.montage_std=null;anfCalcUndRender();" style="padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:#fff;font-size:11px;color:var(--text3);cursor:pointer;">Auto</button>
              </div>
            </div>
          </div>

          <!-- Schwierigkeit -->
          <div class="fg" style="margin-bottom:10px;">
            <label class="fl">Schwierigkeit (Montagefaktor)</label>
            <div style="display:flex;gap:6px;">
              <button id="anf-aufwand-einfach" type="button" onclick="anfSelAufwand('einfach')" style="flex:1;padding:8px;border-radius:8px;border:2px solid var(--green);background:var(--green-l);font-size:11px;font-weight:700;color:var(--green);cursor:pointer;">✅ Einfach<br><span style="font-weight:400;font-size:10px;">Faktor 1.0</span></button>
              <button id="anf-aufwand-mittel" type="button" onclick="anfSelAufwand('mittel')" style="flex:1;padding:8px;border-radius:8px;border:2px solid var(--border);background:#fff;font-size:11px;color:var(--text2);cursor:pointer;">⚡ Mittel<br><span style="font-size:10px;">Faktor 1.2</span></button>
              <button id="anf-aufwand-schwer" type="button" onclick="anfSelAufwand('schwer')" style="flex:1;padding:8px;border-radius:8px;border:2px solid var(--border);background:#fff;font-size:11px;color:var(--text2);cursor:pointer;">🔴 Schwer<br><span style="font-size:10px;">Faktor 1.5</span></button>
            </div>
          </div>

          <!-- Lieferzeit -->
          <div class="fg" style="margin-bottom:10px;">
            <label class="fl">Lieferzeit (Express ≤3 Tage = +15% auf Gesamtpreis)</label>
            <div style="display:flex;gap:6px;" id="anf-liefer-btns">
              <button id="anf-lief-3" type="button" onclick="anfSelLieferzeit(3)" style="flex:1;padding:7px;border-radius:8px;border:2px solid var(--red);background:#fff;color:var(--red);font-size:11px;font-weight:600;cursor:pointer;">🔴 3 Tage<br><span style="font-size:10px;">+15% Express</span></button>
              <button id="anf-lief-5" type="button" onclick="anfSelLieferzeit(5)" style="flex:1;padding:7px;border-radius:8px;border:2px solid var(--green);background:var(--green-l);color:var(--green);font-size:11px;font-weight:700;cursor:pointer;">✅ 5 Tage<br><span style="font-size:10px;">Standard</span></button>
              <button id="anf-lief-10" type="button" onclick="anfSelLieferzeit(10)" style="flex:1;padding:7px;border-radius:8px;border:2px solid var(--border);background:#fff;color:var(--text2);font-size:11px;cursor:pointer;">10 Tage</button>
              <button id="anf-lief-14" type="button" onclick="anfSelLieferzeit(14)" style="flex:1;padding:7px;border-radius:8px;border:2px solid var(--border);background:#fff;color:var(--text2);font-size:11px;cursor:pointer;">14 Tage</button>
            </div>
          </div>

          <!-- Anfahrt -->
          <div class="fg">
            <label class="fl">Anfahrt</label>
            <div style="display:flex;gap:6px;" id="anf-anfahrt-grid">
              <button id="anf-anfahrt-zone1" type="button" onclick="anfSelAnfahrt('zone1')" style="flex:1;padding:7px;border-radius:8px;border:2px solid var(--blue);background:var(--blue-l);color:var(--blue);font-size:11px;font-weight:700;cursor:pointer;">Mülheim/Essen<br><span style="font-size:10px;">kostenlos</span></button>
              <button id="anf-anfahrt-zone2" type="button" onclick="anfSelAnfahrt('zone2')" style="flex:1;padding:7px;border-radius:8px;border:2px solid var(--border);background:#fff;color:var(--text2);font-size:11px;cursor:pointer;">Ruhrgebiet/NRW<br><span style="font-size:10px;">+€50 pauschal</span></button>
              <button id="anf-anfahrt-zone3" type="button" onclick="anfSelAnfahrt('zone3')" style="flex:1;padding:7px;border-radius:8px;border:2px solid var(--border);background:#fff;color:var(--text2);font-size:11px;cursor:pointer;">Weiteres Umland<br><span style="font-size:10px;">+€50 pauschal</span></button>
            </div>
          </div>
        </div>
      </div><div class="ac-block" id="anfac-4">
        <div class="ac-hdr" onclick="anfAcToggle(4)" style="padding:11px 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num" style="background:var(--green);">4</span>
            <div><div class="ac-title">Optionen & Zuschläge</div><div class="ac-sub" id="anfac-sub-4">Demontage, Höhe, Reinigung, Produktion</div></div>
          </div><span class="ac-arrow" id="anfac-arrow-4">›</span>
        </div>
        <div class="ac-body ac-closed" id="anfac-body-4">
          <div class="frow frow2">
            <div class="fg">
              <label class="fl">Demontage Altfolie</label>
              <select class="fs" onchange="anfToggleDemontage(this)">
                <option value="">keine</option>
                <option value="klein">Klein (bis 1m²) +€80</option>
                <option value="mittel">Mittel (1–5m²) +€150</option>
                <option value="gross">Groß (>5m²) +€250</option>
              </select>
            </div>
            <div class="fg">
              <label class="fl">Höhenzuschlag</label>
              <select class="fs" onchange="anfToggleHoehe(this)">
                <option value="">keiner</option>
                <option value="leiter">Leiter +€30</option>
                <option value="geruest">Gerüst +€120</option>
                <option value="hebebuehne">Hebebühne +€250</option>
              </select>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;"><input type="checkbox" id="anf-cb-altfolie" style="accent-color:var(--green);width:16px;height:16px;" onchange="anfToggle('mit_altfolie',this.checked)"> Kleberreste/Altfolie entfernen (€30/m²)</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;"><input type="checkbox" id="anf-cb-reinigung" style="accent-color:var(--green);width:16px;height:16px;" onchange="anfToggle('mit_vorbereitung',this.checked);anfToggle('mit_reinigung',this.checked)"> Reinigung & Vorbereitung (pauschal +€50)</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;"><input type="checkbox" id="anf-cb-plot" style="accent-color:var(--green);width:16px;height:16px;" onchange="anfToggle('mit_plot',this.checked)"> Zuschnitt / Plotten (pauschal +€40)</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;"><input type="checkbox" id="anf-cb-daten" style="accent-color:var(--green);width:16px;height:16px;" onchange="anfToggle('mit_daten',this.checked)"> Datenaufbereitung (+€25)</label>
          </div>

          <!-- Materialoptionen -->
          <div style="border-top:1.5px solid var(--border);padding-top:10px;margin-top:2px;">
            <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Materialoptionen</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <!-- Laminat AN/AUS -->
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                <input type="checkbox" id="anf-cb-laminat" checked style="accent-color:var(--teal);width:16px;height:16px;"
                  onchange="anfToggleLaminat(this)">
                <span>🧴 Laminat <span style="font-size:11px;color:var(--text3);">(Standard 18 €/m² — Schutz &amp; Haltbarkeit)</span></span>
              </label>
              <div id="anf-laminat-hinweis" style="display:none;padding:6px 10px;background:#FFF8E1;border-radius:7px;border-left:3px solid var(--amber);font-size:11px;color:var(--amber);font-weight:600;">⚠ ohne Laminat – reduzierte Haltbarkeit</div>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                <input type="checkbox" id="anf-cb-reflex" style="accent-color:var(--amber);width:16px;height:16px;"
                  onchange="anfToggle('mat_reflex',this.checked)">
                <span>⚡ Reflexfolie <span style="font-size:11px;color:var(--text3);">(3M Engineer — €65/m²)</span></span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                <input type="checkbox" id="anf-cb-lochfolie" style="accent-color:var(--blue);width:16px;height:16px;"
                  onchange="anfToggle('mat_lochfolie',this.checked)">
                <span>🔲 Lochfolie / Scheibenfolie <span style="font-size:11px;color:var(--text3);">(perforiert 50/50 — €65/m²)</span></span>
              </label>
            </div>
          </div>
        </div>
      </div><div class="ac-block" id="anfac-5">
        <div class="ac-hdr" onclick="anfAcToggle(5)" style="padding:11px 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num" style="background:var(--green);">5</span>
            <div><div class="ac-title">Kalkulation</div><div class="ac-sub" id="anfac-sub-5">Preis wird automatisch berechnet</div></div>
          </div><span class="ac-arrow" id="anfac-arrow-5">›</span>
        </div>
        <div class="ac-body ac-closed" id="anfac-body-5">
          <div style="background:var(--gray-l);border-radius:10px;padding:14px;margin-bottom:10px;">
            <div id="anf-kalk-rows" style="margin-bottom:10px;font-size:12px;"></div>
            <div style="border-top:1.5px solid var(--border);padding-top:8px;">
              <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;margin-bottom:3px;"><span>Netto</span><span style="color:var(--green);" id="anf-netto-display">€ 0,00</span></div>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:3px;"><span>+ MwSt. 19%</span><span id="anf-mwst-display">€ 0,00</span></div>
              <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;"><span>Brutto</span><span style="color:var(--blue);" id="anf-brutto-display">€ 0,00</span></div>
            </div>
          </div>
          <!-- Rabatt -->
          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--amber-l);border-radius:8px;border-left:3px solid var(--amber);">
            <div style="flex:1;"><div style="font-size:12px;font-weight:600;color:var(--amber);">Rabatt</div><div style="font-size:11px;color:var(--text2);">Max. 10% ohne Freigabe</div></div>
            <div style="display:flex;align-items:center;gap:4px;"><input type="number" id="anf-rabatt-inp" value="0" min="0" max="25" step="1" oninput="anfCalcUndRender()" style="width:55px;padding:4px 6px;border:1.5px solid var(--amber);border-radius:6px;font-size:13px;font-weight:700;text-align:right;"><span style="font-size:13px;color:var(--amber);">%</span></div>
          </div>
          <div id="anf-rabatt-warn" style="display:none;margin-top:6px;padding:8px 12px;background:#FEECEC;border-radius:7px;font-size:12px;color:var(--red);font-weight:600;"></div>
        </div>
      </div><div class="ac-block" id="anfac-6" style="border-bottom:none;">
        <div class="ac-hdr" onclick="anfAcToggle(6)" style="padding:11px 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num" style="background:var(--green);">6</span>
            <div><div class="ac-title">Dateien & Notiz</div><div class="ac-sub">Foto, Logo, intern</div></div>
          </div><span class="ac-arrow" id="anfac-arrow-6">›</span>
        </div>
        <div class="ac-body ac-closed" id="anfac-body-6">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
            <label id="anf-foto-slot" style="border:2px dashed var(--border);border-radius:10px;padding:13px;text-align:center;cursor:pointer;background:#fff;">
              <div style="font-size:20px;margin-bottom:3px;">📷</div><div style="font-size:12px;font-weight:600;color:var(--text2);">Foto (Objekt/Ort)</div>
              <div id="anf-foto-name" style="font-size:11px;color:var(--green);font-weight:600;margin-top:3px;"></div>
              <input type="file" accept="image/*" style="display:none;" onchange="anfFileSet(this,'anf-foto-slot','anf-foto-name')">
            </label>
            <label id="anf-logo-slot" style="border:2px dashed var(--border);border-radius:10px;padding:13px;text-align:center;cursor:pointer;background:#fff;">
              <div style="font-size:20px;margin-bottom:3px;">🎨</div><div style="font-size:12px;font-weight:600;color:var(--text2);">Logo / Text</div>
              <div id="anf-logo-name" style="font-size:11px;color:var(--green);font-weight:600;margin-top:3px;"></div>
              <input type="file" accept=".ai,.pdf,.png,.jpg,.eps,.svg" style="display:none;" onchange="anfFileSet(this,'anf-logo-slot','anf-logo-name')">
            </label>
          </div>
          <div class="fg"><label class="fl">Interne Notiz</label>
            <textarea class="fta" id="anf-notiz" placeholder="z.B. Muster gewünscht · Montage nur nachmittags" style="min-height:50px;"></textarea>
          </div>
        </div>
      </div>

    </div><!-- /mbody -->

    <div class="mfoot" style="flex-shrink:0;flex-wrap:wrap;gap:6px;">
      <button class="btn" onclick="anfModalClose()">Abbrechen</button>
      <button class="btn" onclick="anfSpeichernEntwurf()" style="background:var(--blue-l);color:var(--blue);border-color:var(--blue);">💾 Entwurf</button>
      <button class="btn" onclick="anfSenden('whatsapp')" style="background:#25D366;color:#fff;border-color:#25D366;">💬 WhatsApp</button>
      <button class="btn" onclick="anfSenden('email')" style="background:var(--amber);color:#fff;border-color:var(--amber);">📤 E-Mail</button>
      <button class="btn p" onclick="anfSpeichern()" style="background:var(--green);border-color:var(--green);">✓ Speichern & Kundenansicht</button>
    </div>
  </div>
</div>

<!-- ══ TELEFON-CHECK MODAL ══ -->
<div class="modal-ov" id="telCheckModal" onclick="if(event.target===this)telCheckClose()">
  <div class="modal" style="width:520px;max-height:92vh;display:flex;flex-direction:column;">

    <!-- Header -->
    <div class="mhdr" style="background:linear-gradient(135deg,#1565C0,#0D47A1);border-radius:13px 13px 0 0;flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:36px;height:36px;border-radius:9px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:20px;">📞</div>
        <div>
          <div class="mtitle" style="color:#fff;">Telefon-Check</div>
          <div style="font-size:11px;color:rgba(255,255,255,.6);">Lead-Qualität in 30 Sekunden bewerten</div>
        </div>
      </div>
      <button class="dp-close" onclick="telCheckClose()" style="color:#fff;background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);">×</button>
    </div>

    <!-- Score-Banner -->
    <div id="tel-score-banner" style="background:#0A1929;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div>
          <div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;">Lead-Score</div>
          <div style="font-size:36px;font-weight:800;font-variant-numeric:tabular-nums;" id="tel-score-zahl">0</div>
        </div>
        <div id="tel-score-status" style="padding:6px 14px;border-radius:8px;font-size:13px;font-weight:700;">—</div>
      </div>
      <div id="tel-score-hinweis" style="font-size:12px;color:rgba(255,255,255,.6);max-width:200px;text-align:right;line-height:1.4;"></div>
    </div>

    <!-- Formular -->
    <div class="mbody" style="padding:20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:14px;">

      <div class="fg">
        <label class="fl">Projektart</label>
        <select class="fs" id="tel-projektart" onchange="telCalc()">
          <option value="">— wählen —</option>
          <option value="fahrzeug">Fahrzeugbeschriftung</option>
          <option value="schild">Schild / Logo</option>
          <option value="druck">Digitaldruck</option>
          <option value="sonstiges">Sonstiges</option>
        </select>
      </div>

      <div class="fg">
        <label class="fl">Budget</label>
        <select class="fs" id="tel-budget" onchange="telCalc()">
          <option value="">— wählen —</option>
          <option value="unter300">unter 300 €</option>
          <option value="300-1000">300 – 1.000 €</option>
          <option value="1000-5000">1.000 – 5.000 €</option>
          <option value="ueber5000">über 5.000 €</option>
          <option value="keine">keine Angabe</option>
        </select>
      </div>

      <div class="fg">
        <label class="fl">Klarheit des Kunden</label>
        <select class="fs" id="tel-klarheit" onchange="telCalc()">
          <option value="">— wählen —</option>
          <option value="konkret">konkret</option>
          <option value="teilweise">teilweise</option>
          <option value="unklar">unklar</option>
        </select>
      </div>

      <div class="fg">
        <label class="fl">Erwartung</label>
        <select class="fs" id="tel-erwartung" onchange="telCalc()">
          <option value="">— wählen —</option>
          <option value="angebot">Angebot</option>
          <option value="beratung">Beratung</option>
          <option value="entwurf">Entwurf vorher</option>
        </select>
      </div>

      <div class="fg">
        <label class="fl">Zeitrahmen</label>
        <select class="fs" id="tel-zeitrahmen" onchange="telCalc()">
          <option value="">— wählen —</option>
          <option value="sofort">sofort</option>
          <option value="woche">diese Woche</option>
          <option value="spaeter">später</option>
          <option value="unklar">unklar</option>
        </select>
      </div>

      <div class="fg">
        <label class="fl">Herkunft</label>
        <select class="fs" id="tel-herkunft" onchange="telCalc()">
          <option value="">— wählen —</option>
          <option value="empfehlung">Empfehlung</option>
          <option value="bestand">Bestand</option>
          <option value="internet">Internet</option>
          <option value="laufkunde">Laufkunde</option>
        </select>
      </div>

    </div>

    <!-- Footer -->
    <div class="mfoot" style="flex-shrink:0;flex-wrap:wrap;gap:8px;">
      <button class="btn" onclick="telCheckClose()">Abbrechen</button>
      <button id="tel-btn-vorkasse" style="display:none;padding:8px 16px;border-radius:8px;border:1.5px solid var(--amber);background:var(--amber-l);color:var(--amber);font-size:13px;font-weight:700;cursor:pointer;" onclick="telAktion('vorkasse')">💰 Vorkasse anfordern</button>
      <button id="tel-btn-absagen" style="display:none;padding:8px 16px;border-radius:8px;border:1.5px solid var(--red);background:var(--red-l,#FEECEC);color:var(--red);font-size:13px;font-weight:700;cursor:pointer;" onclick="telAktion('absagen')">✗ Absagen</button>
      <button id="tel-btn-angebot" class="btn p" onclick="telAktion('angebot')">✓ Angebot erstellen</button>
      <button id="tel-btn-speichern" class="btn" onclick="telAktion('speichern')" style="background:var(--blue-l);color:var(--blue);border-color:var(--blue);">💾 Nur speichern</button>
    </div>

  </div>
</div>

<!-- ══ DETAIL OVERLAY (Auftrags-Detail) ══ -->
<div class="modal-ov" id="detailOverlay" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="modal" style="width:min(700px,96vw);max-height:92vh;display:flex;flex-direction:column;">
    <div class="mhdr" style="background:var(--blue);border-radius:13px 13px 0 0;flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        </div>
        <div class="mtitle" style="color:#fff;" id="dpTitle">Auftragsdetail</div>
      </div>
      <button class="dp-close" onclick="document.getElementById('detailOverlay').classList.remove('open')" style="color:#fff;background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);">×</button>
    </div>
    <div class="mbody" style="overflow-y:auto;flex:1;padding:0;" id="dpBody"></div>
    <div class="mfoot" id="dpFooter" style="flex-shrink:0;"></div>
  </div>
</div>

<div class="modal-ov" id="auftragModal" onclick="if(event.target===this)closeAuftragModal()">
  <div class="modal" style="width:740px;max-height:94vh;">

    <!-- Header -->
    <div class="mhdr" style="background:var(--blue);border-radius:13px 13px 0 0;flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        </div>
        <div>
          <div class="mtitle" style="color:#fff;">Neuer Auftrag</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.55);">Busbeklebung · Schilder · Druck · Externe Bestellung</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn" onclick="auAllesAufklappen()" style="font-size:11px;background:rgba(255,255,255,0.15);border-color:rgba(255,255,255,0.3);color:#fff;">Alle öffnen</button>
        <button class="dp-close" onclick="closeAuftragModal()" style="color:#fff;border-color:rgba(255,255,255,0.3);background:rgba(255,255,255,0.1);">×</button>
      </div>
    </div>

    <!-- Accordion Body -->
    <div class="mbody" style="padding:0;overflow-y:auto;">

      <!-- ① Auftragsdaten -->
      <div class="ac-block" id="ac-1">
        <div class="ac-hdr" onclick="acToggle(1)">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">1</span>
            <div>
              <div class="ac-title">Auftragsdaten</div>
              <div class="ac-sub" id="ac-sub-1">Kunde, Auftragsart, Priorität</div>
            </div>
          </div>
          <span class="ac-arrow" id="ac-arrow-1">›</span>
        </div>
        <div class="ac-body" id="ac-body-1">
          <div class="frow frow2">
            <div class="fg">
              <label class="fl">Kunde <span>*</span></label>
              <select class="fs" id="au-kunde" onchange="auUpdateSub()">
                <option value="">— wählen —</option>
                <option>Ruhrbahn GmbH</option><option>DVG Duisburg</option>
                <option>Bogestra AG</option><option>Radio Essen</option>
                <option>Stadt Essen</option><option>Sparkasse Essen</option>
                <option>NRZ</option><option>Neuer Kunde…</option>
              </select>
            </div>
            <div class="fg">
              <label class="fl">Aus Angebot übernehmen</label>
              <select class="fs" id="au-angebot" onchange="auFillFromAngebot()">
                <option value="">— optional —</option>
                <option value="AG-2026-017">AG-2026-017 · Sparkasse · € 6.200</option>
                <option value="AG-2026-019">AG-2026-019 · NRZ · € 8.400</option>
              </select>
            </div>
          </div>
          <div class="frow" style="grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <div class="fg">
              <label class="fl">Auftragsart <span style="color:var(--red);">*</span></label>
              <select class="fs" id="au-auftragsart" onchange="auArtChanged();auUpdateSub()">
                <option value="">— wählen —</option>
              </select>
            </div>
            <div class="fg">
              <label class="fl">Leistungsbereich <span style="color:var(--red);">*</span></label>
              <select class="fs" id="au-leistung" onchange="auLeistungChanged();auUpdateSub()">
                <option value="">— Bereich wählen —</option>
              </select>
            </div>
            <div class="fg">
              <label class="fl">Produkt / Leistung <span style="color:var(--red);">*</span></label>
              <select class="fs" id="au-produkt" onchange="auSchritteSynchronisieren();auUpdateSub();auMaterialUpdate();auFzTypUpdate()">
                <option value="">— erst Bereich wählen —</option>
              </select>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:7px 12px;background:var(--gray-l);border-radius:8px;">
            <span style="font-size:11px;font-weight:600;color:var(--text2);white-space:nowrap;">Priorität</span>
            <div style="display:flex;gap:5px;">
              <button id="au-prio-normal" onclick="auSelPrio('normal')" type="button" style="padding:3px 13px;border-radius:20px;border:1.5px solid var(--blue);background:var(--blue-l);font-size:11px;font-weight:700;color:var(--blue);cursor:pointer;">Normal</button>
              <button id="au-prio-hoch" onclick="auSelPrio('hoch')" type="button" style="padding:3px 13px;border-radius:20px;border:1.5px solid var(--border);background:#fff;font-size:11px;color:var(--text2);cursor:pointer;">Hoch</button>
              <button id="au-prio-dringend" onclick="auSelPrio('dringend')" type="button" style="padding:3px 13px;border-radius:20px;border:1.5px solid var(--border);background:#fff;font-size:11px;color:var(--text2);cursor:pointer;">🔴 Dringend</button>
            </div>
          </div>
          <div class="fg">
            <label class="fl">Beschreibung</label>
            <input class="fi" id="au-beschr" type="text"
              placeholder="z.B. Ganzgestaltung Bus 1789 · Radio Essen Q1 Kampagne"
              oninput="auUpdateSub();"
              style="border-color:var(--border);">
            <div id="au-beschr-hint" style="display:none;font-size:10px;color:var(--red);margin-top:3px;"></div>
          </div>
          <div id="au-art-hinweis" style="display:none;padding:9px 13px;border-radius:7px;font-size:12px;border-left:3px solid var(--blue);"></div>
        </div>
      </div>

      <!-- ② Projekt / Fahrzeug — dynamisch je Leistungsbereich -->
      <div class="ac-block" id="ac-2">
        <div class="ac-hdr" onclick="acToggle(2)">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">2</span>
            <div>
              <div class="ac-title" id="ac-title-2">Projekt / Fahrzeug</div>
              <div class="ac-sub" id="ac-sub-2">Fahrzeugnummer, Depot, Montage</div>
            </div>
          </div>
          <span class="ac-arrow" id="ac-arrow-2">›</span>
        </div>
        <div class="ac-body ac-closed" id="ac-body-2">
          <div id="au-projekt-felder">
            <!-- wird dynamisch befüllt durch auProjektFelderRender() -->
          </div>
        </div>
      </div>

      <!-- ③ Produktionsschritte -->
      <div class="ac-block" id="ac-3">
        <div class="ac-hdr" onclick="acToggle(3)">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">3</span>
            <div>
              <div class="ac-title">Produktionsschritte</div>
              <div class="ac-sub" id="ac-sub-3">Workflow wird automatisch erstellt</div>
            </div>
          </div>
          <span class="ac-arrow" id="ac-arrow-3">›</span>
        </div>
        <div class="ac-body ac-closed" id="ac-body-3">
          <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Wähle die Schritte — der Workflow richtet sich danach.</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <label id="au-step-lbl-grafik" onclick="auToggleStep('grafik')" style="display:flex;align-items:flex-start;gap:9px;padding:12px;border-radius:9px;border:2px solid var(--purple);background:var(--purple-l);cursor:pointer;">
              <input type="checkbox" id="au-step-grafik" checked style="accent-color:var(--purple);width:15px;height:15px;margin-top:2px;flex-shrink:0;">
              <div><div style="font-size:13px;font-weight:700;color:var(--purple);">🎨 Grafik / Entwurf</div><div style="font-size:11px;color:var(--text2);margin-top:1px;">Melanie, Ilayda</div></div>
            </label>
            <label id="au-step-lbl-druck" onclick="auToggleStep('druck')" style="display:flex;align-items:flex-start;gap:9px;padding:12px;border-radius:9px;border:2px solid var(--blue);background:var(--blue-l);cursor:pointer;">
              <input type="checkbox" id="au-step-druck" checked style="accent-color:var(--blue);width:15px;height:15px;margin-top:2px;flex-shrink:0;">
              <div><div style="font-size:13px;font-weight:700;color:var(--blue);">🖨️ Digitaldruck / Plot</div><div style="font-size:11px;color:var(--text2);margin-top:1px;">Selim, Mohammed · HP 800 / Latex</div></div>
            </label>
            <label id="au-step-lbl-laminat" onclick="auToggleStep('laminat')" style="display:flex;align-items:flex-start;gap:9px;padding:12px;border-radius:9px;border:2px solid var(--teal);background:var(--teal-l);cursor:pointer;">
              <input type="checkbox" id="au-step-laminat" checked style="accent-color:var(--teal);width:15px;height:15px;margin-top:2px;flex-shrink:0;">
              <div><div style="font-size:13px;font-weight:700;color:var(--teal);">📐 Laminat / Zuschnitt</div><div style="font-size:11px;color:var(--text2);margin-top:1px;">Selim</div></div>
            </label>
            <label id="au-step-lbl-montage" onclick="auToggleStep('montage')" style="display:flex;align-items:flex-start;gap:9px;padding:12px;border-radius:9px;border:2px solid var(--amber);background:var(--amber-l);cursor:pointer;">
              <input type="checkbox" id="au-step-montage" checked style="accent-color:var(--amber);width:15px;height:15px;margin-top:2px;flex-shrink:0;">
              <div><div style="font-size:13px;font-weight:700;color:var(--amber);">🚌 Montage</div><div style="font-size:11px;color:var(--text2);margin-top:1px;">Okan, Mete, Mohammed</div></div>
            </label>
            <label id="au-step-lbl-extern" onclick="auToggleStep('extern')" style="display:flex;align-items:flex-start;gap:9px;padding:12px;border-radius:9px;border:2px solid var(--border);background:#fff;cursor:pointer;opacity:0.5;">
              <input type="checkbox" id="au-step-extern" style="accent-color:var(--gray);width:15px;height:15px;margin-top:2px;flex-shrink:0;">
              <div><div style="font-size:13px;font-weight:700;color:var(--gray);">📦 Externe Bestellung</div><div style="font-size:11px;color:var(--text2);margin-top:1px;">Lieferant, Dibond, Acryl</div></div>
            </label>
          </div>

          <!-- MA + Dauer je aktivem Schritt -->
          <div id="au-step-details" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
          <div style="background:var(--gray-l);border-radius:8px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Workflow-Vorschau</div>
            <div id="au-workflow-flow" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;"></div>
          </div>
        </div>
      </div>

      <!-- ④ Produktionsdetails -->
      <div class="ac-block" id="ac-4">
        <div class="ac-hdr" onclick="acToggle(4)">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">4</span>
            <div>
              <div class="ac-title">Produktionsdetails</div>
              <div class="ac-sub" id="ac-sub-4">Material, Laminat, Fläche</div>
            </div>
          </div>
          <span class="ac-arrow" id="ac-arrow-4">›</span>
        </div>
        <div class="ac-body ac-closed" id="ac-body-4">
          <div class="frow frow3" id="au-material-row">
            <div class="fg">
              <label class="fl" id="au-material-label">Material / Folie</label>
              <div style="display:flex;gap:4px;">
                <input type="text" id="au-material" class="fi" list="au-material-datalist"
                  placeholder="Tippen oder aus Liste wählen…" autocomplete="off"
                  style="flex:1;min-width:0;">
                <button type="button" title="Liste anzeigen"
                  onclick="var i=document.getElementById('au-material');i.value='';i.focus();"
                  style="padding:0 10px;border-radius:7px;border:1px solid var(--border);background:var(--gray-l);color:var(--text2);font-size:14px;cursor:pointer;flex-shrink:0;">▾</button>
              </div>
              <datalist id="au-material-datalist"></datalist>
              <div id="au-material-hint" style="font-size:10px;color:var(--text3);margin-top:3px;"></div>
            </div>
            <div class="fg" id="au-laminat-wrap">
              <label class="fl">Laminat</label>
              <div style="display:flex;gap:4px;">
                <input type="text" id="au-laminat" class="fi" list="au-laminat-datalist"
                  placeholder="Tippen oder aus Liste wählen…" autocomplete="off"
                  style="flex:1;min-width:0;">
                <button type="button" title="Liste anzeigen"
                  onclick="var i=document.getElementById('au-laminat');i.value='';i.focus();"
                  style="padding:0 10px;border-radius:7px;border:1px solid var(--border);background:var(--gray-l);color:var(--text2);font-size:14px;cursor:pointer;flex-shrink:0;">▾</button>
              </div>
              <datalist id="au-laminat-datalist"></datalist>
            </div>
            <div class="fg">
              <label class="fl">Druckmaschine</label>
              <div style="display:flex;gap:6px;">
                <button type="button" id="au-maschine-800"
                  onclick="auMaschineWaehlen('HP Latex 800')"
                  style="flex:1;padding:7px 4px;border-radius:7px;border:2px solid var(--border);background:var(--gray-l);color:var(--text);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;">HP 800</button>
                <button type="button" id="au-maschine-560"
                  onclick="auMaschineWaehlen('HP Latex 560')"
                  style="flex:1;padding:7px 4px;border-radius:7px;border:2px solid var(--blue);background:var(--blue);color:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;">HP 560</button>
              </div>
              <input type="hidden" id="au-maschine" value="HP Latex 560">
            </div>
          </div>
          <div class="frow frow3">
            <div class="fg">
              <label class="fl">Fläche (m²)</label>
              <input class="fi" id="au-flaeche" type="number" step="0.1" placeholder="z.B. 12.5" oninput="auCalcDetails()">
            </div>
            <div class="fg">
              <label class="fl">Anzahl Stück</label>
              <input class="fi" id="au-stueck" type="number" placeholder="1" value="1" oninput="auCalcDetails()">
            </div>
            <div class="fg">
              <label class="fl">Druckformat</label>
              <div style="display:flex;gap:4px;">
                <input type="text" id="au-format" class="fi" list="au-format-datalist"
                  placeholder="Tippen oder aus Liste wählen…" autocomplete="off"
                  style="flex:1;min-width:0;">
                <button type="button" title="Liste anzeigen"
                  onclick="var i=document.getElementById('au-format');i.value='';i.focus();"
                  style="padding:0 10px;border-radius:7px;border:1px solid var(--border);background:var(--gray-l);color:var(--text2);font-size:14px;cursor:pointer;flex-shrink:0;">▾</button>
              </div>
              <datalist id="au-format-datalist">
                <option>Fahrzeugformat</option>
                <option>A0 (841×1189mm)</option>
                <option>A1 (594×841mm)</option>
                <option>A2 (420×594mm)</option>
                <option>A3 (297×420mm)</option>
                <option>Rollup 85×200cm</option>
                <option>Banner individuell</option>
                <option>Freies Format</option>
              </datalist>
            </div>
          </div>
          <div id="au-details-info" style="display:none;padding:9px 13px;background:var(--blue-l);border-radius:7px;font-size:12px;color:var(--blue);"></div>
        </div>
      </div>

      <!-- ⑤ Dateien -->
      <div class="ac-block" id="ac-5">
        <div class="ac-hdr" onclick="acToggle(5)">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">5</span>
            <div>
              <div class="ac-title">Dateien</div>
              <div class="ac-sub" id="ac-sub-5">Layout, Druckdatei, Montage, Vorher/Nachher (Fahrzeug)</div>
            </div>
          </div>
          <span class="ac-arrow" id="ac-arrow-5">›</span>
        </div>
        <div class="ac-body ac-closed" id="ac-body-5">
          <!-- Upload-Slots (gleiche Kategorien wie Auftrag-Detail / Mitarbeiter-App; Vorher/Nachher nur bei Fahrzeug-Leistung) -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;margin-bottom:10px;">
            <label id="au-slot-layout_grafik" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 108px;min-width:96px;max-width:220px;padding:8px 10px;border-radius:8px;border:1.5px solid rgba(106,27,154,.45);background:var(--purple-l);cursor:pointer;box-sizing:border-box;">
              <span style="font-size:11px;font-weight:700;color:var(--purple);text-align:center;line-height:1.25;">🎨 Layout / Grafik</span>
              <span style="font-size:9px;color:var(--text2);margin-top:2px;text-align:center;">PDF, PNG, AI …</span>
              <span id="au-slot-layout_grafik-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
              <input type="file" accept="image/jpeg,image/png,application/pdf,.pdf,.ai,.eps" multiple style="display:none;" onchange="auFileAdd(event,'layout_grafik')">
            </label>
            <label id="au-slot-druckdatei" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 108px;min-width:96px;max-width:220px;padding:8px 10px;border-radius:8px;border:1.5px solid rgba(106,27,154,.45);background:var(--purple-l);cursor:pointer;box-sizing:border-box;">
              <span style="font-size:11px;font-weight:700;color:var(--purple);text-align:center;line-height:1.25;">🖨 Finale Druckdatei</span>
              <span style="font-size:9px;color:var(--text2);margin-top:2px;text-align:center;">PDF, PNG, TIFF …</span>
              <span id="au-slot-druckdatei-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
              <input type="file" accept="image/jpeg,image/png,application/pdf,.pdf,.tif,.tiff" multiple style="display:none;" onchange="auFileAdd(event,'druckdatei')">
            </label>
            <label id="au-slot-montagefoto" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 108px;min-width:96px;max-width:220px;padding:8px 10px;border-radius:8px;border:1.5px solid rgba(230,81,0,.45);background:var(--amber-l);cursor:pointer;box-sizing:border-box;">
              <span style="font-size:11px;font-weight:700;color:var(--amber);text-align:center;line-height:1.25;">📷 Montagefoto</span>
              <span style="font-size:9px;color:var(--text2);margin-top:2px;text-align:center;">Foto</span>
              <span id="au-slot-montagefoto-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
              <input type="file" accept="image/jpeg,image/png" capture="environment" multiple style="display:none;" onchange="auFileAdd(event,'montagefoto')">
            </label>
            <label id="au-slot-vorher-front" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 100px;min-width:92px;max-width:200px;padding:8px 8px;border-radius:8px;border:1.5px solid #A5D6A7;background:#E8F5E9;cursor:pointer;box-sizing:border-box;">
              <span style="font-size:10px;font-weight:700;color:#1B5E20;text-align:center;line-height:1.2;">📷 Vorher Front (hoch)</span>
              <span id="au-slot-vorher-front-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
              <input type="file" accept="image/jpeg,image/png" capture="environment" style="display:none;" onchange="auFileAdd(event,'vorher:front')">
            </label>
            <label id="au-slot-vorher-seite1" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 100px;min-width:92px;max-width:200px;padding:8px 8px;border-radius:8px;border:1.5px solid #A5D6A7;background:#E8F5E9;cursor:pointer;box-sizing:border-box;">
              <span style="font-size:10px;font-weight:700;color:#1B5E20;text-align:center;line-height:1.2;">📷 Vorher Seite 1 (quer)</span>
              <span id="au-slot-vorher-seite1-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
              <input type="file" accept="image/jpeg,image/png" capture="environment" style="display:none;" onchange="auFileAdd(event,'vorher:seite1')">
            </label>
            <label id="au-slot-vorher-seite2" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 100px;min-width:92px;max-width:200px;padding:8px 8px;border-radius:8px;border:1.5px solid #A5D6A7;background:#E8F5E9;cursor:pointer;box-sizing:border-box;">
              <span style="font-size:10px;font-weight:700;color:#1B5E20;text-align:center;line-height:1.2;">📷 Vorher Seite 2 (quer)</span>
              <span id="au-slot-vorher-seite2-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
              <input type="file" accept="image/jpeg,image/png" capture="environment" style="display:none;" onchange="auFileAdd(event,'vorher:seite2')">
            </label>
            <label id="au-slot-vorher-heck" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 100px;min-width:92px;max-width:200px;padding:8px 8px;border-radius:8px;border:1.5px solid #A5D6A7;background:#E8F5E9;cursor:pointer;box-sizing:border-box;">
              <span style="font-size:10px;font-weight:700;color:#1B5E20;text-align:center;line-height:1.2;">📷 Vorher Heck (hoch)</span>
              <span id="au-slot-vorher-heck-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
              <input type="file" accept="image/jpeg,image/png" capture="environment" style="display:none;" onchange="auFileAdd(event,'vorher:heck')">
            </label>
          </div>
          <div id="au-neu-datei-nachher-wrap" style="display:none;margin-bottom:10px;">
            <div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.04em;margin-bottom:6px;">NACHHER (Fahrzeug)</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;">
              <label id="au-slot-nachher-front" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 100px;min-width:92px;max-width:200px;padding:8px 8px;border-radius:8px;border:1.5px solid #ffb380;background:#ffe5cc;cursor:pointer;box-sizing:border-box;">
                <span style="font-size:10px;font-weight:700;color:#a65300;text-align:center;line-height:1.2;">📷 Nachher Front (hoch)</span>
                <span id="au-slot-nachher-front-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
                <input type="file" accept="image/jpeg,image/png" capture="environment" style="display:none;" onchange="auFileAdd(event,'nachher:front')">
              </label>
              <label id="au-slot-nachher-seite1" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 100px;min-width:92px;max-width:200px;padding:8px 8px;border-radius:8px;border:1.5px solid #ffb380;background:#ffe5cc;cursor:pointer;box-sizing:border-box;">
                <span style="font-size:10px;font-weight:700;color:#a65300;text-align:center;line-height:1.2;">📷 Nachher Seite 1 (quer)</span>
                <span id="au-slot-nachher-seite1-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
                <input type="file" accept="image/jpeg,image/png" capture="environment" style="display:none;" onchange="auFileAdd(event,'nachher:seite1')">
              </label>
              <label id="au-slot-nachher-seite2" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 100px;min-width:92px;max-width:200px;padding:8px 8px;border-radius:8px;border:1.5px solid #ffb380;background:#ffe5cc;cursor:pointer;box-sizing:border-box;">
                <span style="font-size:10px;font-weight:700;color:#a65300;text-align:center;line-height:1.2;">📷 Nachher Seite 2 (quer)</span>
                <span id="au-slot-nachher-seite2-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
                <input type="file" accept="image/jpeg,image/png" capture="environment" style="display:none;" onchange="auFileAdd(event,'nachher:seite2')">
              </label>
              <label id="au-slot-nachher-heck" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 100px;min-width:92px;max-width:200px;padding:8px 8px;border-radius:8px;border:1.5px solid #ffb380;background:#ffe5cc;cursor:pointer;box-sizing:border-box;">
                <span style="font-size:10px;font-weight:700;color:#a65300;text-align:center;line-height:1.2;">📷 Nachher Heck (hoch)</span>
                <span id="au-slot-nachher-heck-name" style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px;min-height:14px;text-align:center;"></span>
                <input type="file" accept="image/jpeg,image/png" capture="environment" style="display:none;" onchange="auFileAdd(event,'nachher:heck')">
              </label>
            </div>
          </div>
          <!-- Dateiliste -->
          <div id="au-file-list-wrap" style="display:none;">
            <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">📁 Hochgeladene Dateien</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:var(--gray-l);">
                  <th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text2);">Dateiname</th>
                  <th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text2);">Typ</th>
                  <th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text2);">Größe</th>
                  <th style="padding:8px 10px;text-align:center;font-weight:600;color:var(--text2);">Vorschau</th>
                  <th style="padding:8px 10px;text-align:center;font-weight:600;color:var(--text2);">Download</th>
                  <th style="padding:8px 10px;text-align:center;font-weight:600;color:var(--text2);"></th>
                </tr>
              </thead>
              <tbody id="au-file-list"></tbody>
            </table>
          </div>
          <div style="margin-top:10px;padding:9px 12px;background:var(--gray-l);border-radius:7px;font-size:11px;color:var(--text2);">
            💡 Dateien werden direkt mit dem Auftrag gespeichert — Grafik, Produktion und Montage haben Zugriff.
          </div>
        </div>
      </div>

      <!-- ⑥ Projektleiter & Benachrichtigungen -->
      <div class="ac-block" id="ac-6">
        <div class="ac-hdr" onclick="acToggle(6)">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">6</span>
            <div>
              <div class="ac-title">Projektleiter &amp; Benachrichtigungen</div>
              <div class="ac-sub" id="ac-sub-6">Verantwortlicher, Benachrichtigungen</div>
            </div>
          </div>
          <span class="ac-arrow" id="ac-arrow-6">›</span>
        </div>
        <div class="ac-body ac-closed" id="ac-body-6">
          <div class="frow frow2">
            <div class="fg">
              <label class="fl">Projektleiter</label>
              <select class="fs" id="au-z-leiter">
                <option value="">— wählen —</option>
                <option>Celal</option><option>Muhammet</option><option>Elvan</option>
              </select>
            </div>
          </div>
          <div class="fg" style="margin-top:8px;">
            <label class="fl">Benachrichtigungen senden an</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:5px;padding:6px 11px;border-radius:7px;border:1.5px solid var(--border);background:#fff;cursor:pointer;font-size:12px;"><input type="checkbox" id="au-notif-grafik" checked style="accent-color:var(--purple);"> 🎨 Grafik</label>
              <label style="display:flex;align-items:center;gap:5px;padding:6px 11px;border-radius:7px;border:1.5px solid var(--border);background:#fff;cursor:pointer;font-size:12px;"><input type="checkbox" id="au-notif-produktion" checked style="accent-color:var(--blue);"> 🖨️ Produktion</label>
              <label style="display:flex;align-items:center;gap:5px;padding:6px 11px;border-radius:7px;border:1.5px solid var(--border);background:#fff;cursor:pointer;font-size:12px;"><input type="checkbox" id="au-notif-montage" checked style="accent-color:var(--amber);"> 🚌 Montage</label>
              <label style="display:flex;align-items:center;gap:5px;padding:6px 11px;border-radius:7px;border:1.5px solid var(--border);background:#fff;cursor:pointer;font-size:12px;"><input type="checkbox" id="au-notif-kunde" style="accent-color:var(--green);"> 📧 Kunde per Mail</label>
            </div>
          </div>
        </div>
      </div>

      <!-- ⑦ Auftragswert -->
      <div class="ac-block" id="ac-7">
        <div class="ac-hdr" onclick="acToggle(7)">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">7</span>
            <div>
              <div class="ac-title">Auftragswert</div>
              <div class="ac-sub" id="ac-sub-7">Netto, MwSt., Brutto</div>
            </div>
          </div>
          <span class="ac-arrow" id="ac-arrow-7">›</span>
        </div>
        <div class="ac-body ac-closed" id="ac-body-7">
          <div class="frow frow3">
            <div class="fg">
              <label class="fl">Netto (€)</label>
              <input class="fi" id="au-netto" type="number" step="0.01" placeholder="0.00" oninput="calcAuftrag();auUpdateSub()">
            </div>
            <div class="fg">
              <label class="fl">MwSt. 19%</label>
              <input class="fi" id="au-mwst-val" readonly style="background:var(--gray-l);" placeholder="Automatisch">
            </div>
            <div class="fg">
              <label class="fl">Brutto (€)</label>
              <input class="fi" id="au-brutto" readonly style="background:var(--gray-l);font-weight:700;color:var(--green);" placeholder="Automatisch">
            </div>
          </div>
          <div class="frow frow2">
            <div class="fg">
              <label class="fl">Zahlungsziel</label>
              <select class="fs" id="au-zahlungsziel">
                <option>30 Tage netto</option><option>14 Tage netto</option>
                <option>45 Tage netto</option><option>Sofort</option>
                <option>Quartalsabrechnung (FUSA)</option>
              </select>
            </div>
            <div class="fg">
              <label class="fl">Rechnungsart</label>
              <select class="fs" id="au-rechnungsart">
                <option>Einzelrechnung nach Abschluss</option>
                <option>Quartalsabrechnung (FUSA)</option>
                <option>Pauschal</option><option>Kostenvoranschlag</option>
              </select>
            </div>
          </div>
          <div id="au-kalk-info" style="display:none;padding:10px 13px;background:var(--green-l);border-radius:7px;border-left:3px solid var(--green);font-size:12px;">
            <div style="font-weight:600;color:var(--green);margin-bottom:3px;">Kalkulations-Richtwert</div>
            <div id="au-kalk-text" style="color:var(--text2);"></div>
          </div>
        </div>
      </div>

      <!-- ⑧ Interne Notizen -->
      <div class="ac-block" id="ac-8" style="border-bottom:none;">
        <div class="ac-hdr" onclick="acToggle(8)">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="ac-num">8</span>
            <div>
              <div class="ac-title">Interne Notizen</div>
              <div class="ac-sub" id="ac-sub-8">Produktion, Besonderheiten, Montage</div>
            </div>
          </div>
          <span class="ac-arrow" id="ac-arrow-8">›</span>
        </div>
        <div class="ac-body ac-closed" id="ac-body-8">
          <div class="fg">
            <label class="fl">Hinweise für die Rechnungserstellung</label>
            <textarea class="fta" id="au-notiz-produktion" placeholder="z.B. Sonderfarbe Pantone 185C · Folie 24h akklimatisieren…" style="min-height:60px;"></textarea>
          </div>
          <div class="fg">
            <label class="fl">Besonderheiten / Kundenhinweise</label>
            <textarea class="fta" id="au-notiz-besonderheiten" placeholder="z.B. Freigabe nur per Mail · Abnahme vor Ort gewünscht…" style="min-height:50px;"></textarea>
          </div>
          <div class="fg">
            <label class="fl">Montagehinweise</label>
            <textarea class="fta" id="au-notiz-montage" placeholder="z.B. Fahrzeug ab 06:30 Uhr in Depot Stadtmitte · Kontakt: Hr. Schäfer…" style="min-height:50px;"></textarea>
          </div>
        </div>
      </div>

    </div><!-- /mbody -->

    <!-- Footer -->
    <div class="mfoot" style="flex-shrink:0;">
      <button class="btn" onclick="closeAuftragModal()">Abbrechen</button>
      <button class="btn" onclick="showToast('Entwurf gespeichert')">💾 Entwurf</button>
      <button class="btn p" id="au-submit-btn" style="background:var(--green);border-color:var(--green);min-width:160px;" onclick="submitAuftrag()">✓ Auftrag anlegen</button>
    </div>
  </div>
</div>

<div class="modal-ov" id="zeitModal" onclick="if(event.target===this)closeZeitModal()">
  <div class="modal" style="width:600px;">
    <div class="mhdr" style="background:#0A1929;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:16px;">⏱</div>
        <div>
          <div class="mtitle" style="color:#fff;">Zeiterfassung</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);" id="zeitModalSub">Auftrag</div>
        </div>
      </div>
      <button class="dp-close" onclick="closeZeitModal()" style="color:#fff;border-color:rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);">×</button>
    </div>
    <div class="mbody" id="zeitModalBody" style="padding:20px;"></div>
    <div class="mfoot"><button class="btn" onclick="closeZeitModal()">Schließen</button></div>
  </div>
</div>

<div id="toast"></div>
`;
};
