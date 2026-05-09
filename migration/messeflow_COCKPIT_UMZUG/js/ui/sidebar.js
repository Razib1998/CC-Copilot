// ═══════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════
function renderSidebar(){
  const el=document.getElementById('proj-list');
  const projs = getVisibleProjects(currentUserId);
  el.innerHTML=projs.map(p=>{
    const amp=projAmpel(p);
    const st = getProjektStatusMeta(p.status || 'Neu');
    const blockiert=p.waende.filter(w=>w.status===6).length;
    const pruefung =p.waende.filter(w=>w.status===7).length;
    const offen    =p.waende.filter(w=>w.status<3 && w.status!==7 && w.status!==6).length;
    return `<div class="proj-item${p.id===activeProjId?' active':''}" onclick="selectProj('${p.id}')">
      <div class="pi-name"><span class="ampel ${amp}" style="display:inline-block;margin-right:5px;vertical-align:middle;"></span>${p.name}</div>
      <div class="pi-meta">${p.kunde}</div>
      <div style="font-size:11px;font-weight:700;margin-top:3px;color:${st.cl};background:${st.bg};border:1px solid ${st.bd};border-radius:999px;display:inline-block;padding:2px 8px;">
        ${p.status || 'Neu'}
      </div>
      ${blockiert>0?`<div class="pi-alert" style="color:var(--red);">✖ ${blockiert} blockiert</div>`:''}
      ${pruefung>0?`<div class="pi-alert" style="color:var(--yellow);">⚡ ${pruefung} zu prüfen</div>`:''}
      ${offen>0&&!blockiert&&!pruefung?`<div class="pi-alert">⚑ ${offen} ausstehend</div>`:''}
    </div>`;
  }).join('');

  // ── Test-Modus-Anzeige in Sidebar (sichtbar auch wenn Topbar versteckt) ──
  if (window.MF_TEST_MODE === true) {
    const sbTestBar = document.getElementById('mf-sidebar-testmode');
    if (!sbTestBar) {
      const bar = document.createElement('div');
      bar.id = 'mf-sidebar-testmode';
      bar.style.cssText = 'margin:10px 0 4px 0;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:7px 10px;';
      bar.innerHTML = `
        <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:6px;">🧪 TEST-MODUS</div>
        <select id="role-sel-sidebar" onchange="setUser(this.value)"
          style="width:100%;padding:4px 6px;border:1px solid #f59e0b;border-radius:5px;
                 font-size:12px;background:#fff;color:#92400e;font-weight:600;cursor:pointer;">
        </select>`;
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.insertBefore(bar, sidebar.firstChild);
    }
    // Dropdown befüllen
    const dd = document.getElementById('role-sel-sidebar');
    if (dd && typeof USERS !== 'undefined') {
      const cur = typeof currentUserId !== 'undefined' ? currentUserId : '';
      dd.innerHTML = USERS.filter(u => u.aktiv !== false).map(u =>
        `<option value="${u.id}"${u.id === cur ? ' selected' : ''}>${u.name} (${u.rolle})</option>`
      ).join('');
      dd.onchange = function() { if (typeof setUser === 'function') setUser(this.value); };
    }
  }

  // Admin-Bereich — Ein einziger Einstiegspunkt: Admin-Zentrale
  if (role === 'admin') {
    const isAdminActive = typeof adminViewOpen !== 'undefined' && adminViewOpen;
    el.innerHTML += `
      <div style="border-top:1px solid var(--line);margin-top:10px;padding-top:10px;">
        <div class="proj-item${isAdminActive?' active':''}" onclick="openAdminView()"
          style="background:#faf5ff;border:1px solid #d8b4fe;">
          <div class="pi-name" style="color:#6b21a8;">⚙ Admin-Zentrale</div>
          <div class="pi-meta">Benutzer · Firmen · Projekte · Onboarding</div>
        </div>
      </div>`;
  }
}

window.renderSidebar = renderSidebar;

