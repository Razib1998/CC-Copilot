// ═══════════════════════════════════════════════════════════════════════════════
// MESSEFLOW COMPONENTS  ←  Quellen: ui/modal.js + ui/toast.js + ui/sidebar.js
//                                 + utils/mass.js + utils/dpi.js
// Ziel: messeflow-components.js (components/)
//
// Enthält ALLE wiederverwendbaren UI-Bausteine:
//   • Modal                        openModal(), closeModal(), closeMBG()
//   • Toast-Nachrichten            toast() / showToast()
//   • Projekt-Sidebar              renderSidebar() – linke Projektliste
//   • Maß-Parser + Vergleich       parseMass(), vergleicheMasse(), fmm()
//   • DPI-Berechnung               berechneDpi()
//
// Zusammengeführt aus (in Ladereihenfolge):
//   1. js/utils/mass.js            – Maß-Parser (42 Zeilen)
//   2. js/utils/dpi.js             – DPI-Berechnung (22 Zeilen)
//   3. js/ui/modal.js              – Modal-Overlay (7 Zeilen)
//   4. js/ui/toast.js              – Toast-Benachrichtigungen (10 Zeilen)
//   5. js/ui/sidebar.js            – Projektliste Sidebar (67 Zeilen)
//
// TODO Cockpit-Umzug:
//   - openModal() → Cockpit-Modal-System verwenden (oder beibehalten falls isoliert)
//   - toast() → Cockpit-Notification-System verwenden
//   - renderSidebar() → Cockpit-Sidebar übernimmt die Projektliste
//   - parseMass() / berechneDpi() → unverändert übernehmen (reine Logik)
// ═══════════════════════════════════════════════════════════════════════════════


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/utils/mass.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── MASS PARSER ────────────────────────────────────────
// Parst "300 × 250 cm" oder "3000 × 2500 mm" → {w, h, unit:'cm'|'mm'}
// Gibt null zurück wenn nicht parsebar.
function parseMass(str){
  if(!str||!str.trim()) return null;
  // Normalize separators: ×, x, X, *, by
  const s = str.trim().replace(/×|x|X|\*/g,'×');
  // Match: number [optional space] unit? × number [optional space] unit?
  const re = /(\d+(?:[.,]\d+)?)\s*(cm|mm)?\s*×\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)?/i;
  const m = s.match(re);
  if(!m) return null;
  const w = parseFloat(m[1].replace(',','.'));
  const h = parseFloat(m[3].replace(',','.'));
  // Determine unit: explicit wins, default cm
  const unit = (m[2]||m[4]||'cm').toLowerCase();
  // Normalize to mm
  const factor = unit==='cm' ? 10 : 1;
  return { w: w*factor, h: h*factor };
}

// ─── DIFFERENZ BERECHNEN ────────────────────────────────
// Gibt {dw, dh, maxDiff, stufe: 'ok'|'warnung'|'abweichung'|'unlesbar'} zurück
function vergleicheMasse(bestellmass, dateiMass){
  const b = parseMass(bestellmass);
  const d = parseMass(dateiMass);
  if(!b || !d) return { dw:null, dh:null, maxDiff:null, stufe:'unlesbar' };
  const dw = Math.abs(b.w - d.w);
  const dh = Math.abs(b.h - d.h);
  const maxDiff = Math.max(dw, dh);
  let stufe;
  if(maxDiff <= 5)       stufe = 'ok';
  else if(maxDiff <= 20) stufe = 'warnung';
  else                   stufe = 'abweichung';
  return { dw, dh, maxDiff, stufe };
}

// Format mm nicely
function fmm(mm){ return mm===0 ? '0 mm' : `${mm % 1 === 0 ? mm : mm.toFixed(1)} mm`; }

window.parseMass = parseMass;
window.vergleicheMasse = vergleicheMasse;
window.fmm = fmm;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/utils/dpi.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── DPI-BERECHNUNG ─────────────────────────────────────
// dpi = pixel / (mm / 25.4)
// Gibt { dpi, stufe:'ok'|'warnung'|'blockiert', label } zurück oder null wenn nicht berechenbar.
function berechneDpi(pxBreite, pxHoehe, bestellmass){
  const px_b = parseFloat(pxBreite);
  const px_h = parseFloat(pxHoehe);
  const mass  = parseMass(bestellmass);
  if(!mass || isNaN(px_b) || isNaN(px_h) || px_b <= 0 || px_h <= 0) return null;

  const dpi_b = px_b / (mass.w / 25.4);  // mm → inch: /25.4
  const dpi_h = px_h / (mass.h / 25.4);
  const dpi   = Math.round(Math.min(dpi_b, dpi_h)); // niedrigster Wert ist maßgeblich

  let stufe, label, color;
  if(dpi >= 100)      { stufe='ok';        label=`✓ ${dpi} DPI – druckbereit`;  color='var(--green)'; }
  else if(dpi >= 70)  { stufe='warnung';   label=`⚡ ${dpi} DPI – Warnung`;     color='var(--yellow)'; }
  else                { stufe='blockiert'; label=`✖ ${dpi} DPI – zu niedrig`;   color='var(--red)'; }

  return { dpi, dpi_b: Math.round(dpi_b), dpi_h: Math.round(dpi_h), stufe, label, color };
}

window.berechneDpi = berechneDpi;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/ui/modal.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function openModal(h,c,wide=false){ document.getElementById('modal-h').textContent=h; document.getElementById('modal-c').innerHTML=c; document.getElementById('modal-bg').classList.add('open'); document.getElementById('modal-box').classList.toggle('wide',wide); }
function closeModal(){ document.getElementById('modal-bg').classList.remove('open'); document.getElementById('modal-box').classList.remove('wide'); }
function closeMBG(e){ if(e.target===document.getElementById('modal-bg')) closeModal(); }

window.openModal = openModal;
window.closeModal = closeModal;
window.closeMBG = closeMBG;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/ui/toast.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function toast(title,body,cls=''){
  const container = document.getElementById('toasts');
  if (!container) {
    console.warn('[MesseFlow] Toast-Container #toasts nicht bereit:', title, body);
    return;
  }
  const el=document.createElement('div');
  el.className='toast '+(cls||'');
  el.innerHTML=`<div class="tt">${title}</div><div class="tb">${body}</div>`;
  container.appendChild(el);
  setTimeout(()=>el.remove(),4000);
}

window.toast = toast;
window.showToast = toast;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/ui/sidebar.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

}

window.renderSidebar = renderSidebar;

