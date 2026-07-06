// ════════════════════════════════════════════════════════════════════
// CC INTERN — Aufträge-Übersicht / Kanban
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/auftraege-view.js
// Enthält:  renderAuftragVerwaltung, renderKanban, Schritte, Checklisten-Vorlagen
//
// TODO [Cockpit]: renderAuftragVerwaltung() → API GET /orders statt globalem AUFTRAEGE-Array
// TODO [Cockpit]: saveAuftraege() → API PATCH /orders/:id
// ════════════════════════════════════════════════════════════════════

/** Tab-Filter Auftragsverwaltung — muss vor erstem renderAuftragVerwaltung() gesetzt sein */
var auVerwFilter = 'alle';
var auVerwPage = 1;
var auVerwLastFilterKey = '';
var AU_VERW_PAGE_SIZE = 10;

/** Checklisten-Vorlagen: aktuell ausgewählte Vorlage (Listen-Highlight + Detail) — muss deklariert sein (Strict Mode) */
var clAktivId = null;

/**
 * In-Memory-Cache der Checklisten-Vorlagen (Cockpit: gefüllt aus GET /api/v1/checklisten + Detail je id).
 * Eine Quelle: Backend-DB über API; Aufträge speichern nur Kopien in `schritte[].checkliste` / `bemerkung`.
 */
if (typeof window !== 'undefined' && !Array.isArray(window.CL_VORLAGEN)) {
  window.CL_VORLAGEN = [];
}

function _ccInternPersistAuftraegeFromView(auftragIdHint) {
  var st =
    typeof window._ccShowToast === 'function'
      ? window._ccShowToast
      : typeof showToast === 'function'
        ? showToast
        : null;
  var api = window.CCIntern && window.CCIntern.cockpitApi;
  if (api && typeof api.runSaveAuftraege === 'function') {
    return api.runSaveAuftraege(st, auftragIdHint) === true;
  }
  console.error('[CC Intern] _ccInternPersistAuftraegeFromView: cockpitApi.runSaveAuftraege fehlt.');
  if (st) st('⚠ Aufträge: Speichern nicht möglich (kein API-Kontext).');
  return false;
}

function _ccInternFirmaIdForProdApi() {
  var f = typeof window !== 'undefined' && window.COCKPIT_FIRMA_ID != null ? String(window.COCKPIT_FIRMA_ID).trim() : '';
  if (!f && typeof window !== 'undefined' && window.__COCKPIT_FIRMA_ID != null) f = String(window.__COCKPIT_FIRMA_ID).trim();
  return f;
}

function _ccInternProduktionAuftragUuidForApi(a) {
  if (!a) return '';
  var c = a.ccApiId != null ? String(a.ccApiId).trim() : '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c)) return c;
  var id = a.id != null ? String(a.id).trim() : '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return id;
  return '';
}

/** Nach Kanban-Abschluss: Produktion-PATCH für serverseitigen Rechnungs-Trigger (Fehler blockieren Kanban nicht). */
function _ccInternProduktionSyncAbgeschlossen(auftragRow) {
  try {
    var auth = window.CCIntern && window.CCIntern.auth;
    if (!auth || typeof auth.apiFetch !== 'function') return;
    var firmaId = _ccInternFirmaIdForProdApi();
    if (!firmaId) {
      console.warn('[CC Intern] Produktion-PATCH übersprungen: keine firma_id.');
      return;
    }
    var auftragUuid = _ccInternProduktionAuftragUuidForApi(auftragRow);
    if (!auftragUuid) {
      console.warn('[CC Intern] Produktion-PATCH übersprungen: keine Auftrags-UUID (ccApiId) für auftrag_id.');
      return;
    }
    var q =
      '/api/v1/produktion?firma_id=' +
      encodeURIComponent(firmaId) +
      '&auftrag_id=' +
      encodeURIComponent(auftragUuid);
    auth
      .apiFetch(q, { method: 'GET' })
      .then(function (pack) {
        var items = pack && Array.isArray(pack.items) ? pack.items : [];
        if (!items.length) {
          console.warn('[CC Intern] Produktion: keine Zeile für auftrag_id', auftragUuid);
          return;
        }
        var row = items[0];
        var pid = row && row.id != null ? String(row.id).trim() : '';
        if (!pid) {
          console.warn('[CC Intern] Produktion GET: Eintrag ohne id');
          return;
        }
        return auth.apiFetch('/api/v1/produktion/' + encodeURIComponent(pid), {
          method: 'PATCH',
          body: { schritt: 'abgeschlossen', firma_id: firmaId },
        });
      })
      .catch(function (e) {
        console.warn('[CC Intern] Produktion GET/PATCH (Zusatz) fehlgeschlagen:', e);
      });
  } catch (ex) {
    console.warn('[CC Intern] ProduktionSync:', ex);
  }
}

function auVerwTab(el, filter){
  auVerwFilter = filter;
  auVerwPage = 1;
  document.querySelectorAll('#au-verwaltung-tabs .tab').forEach(function(t){ t.classList.remove('active'); });
  el.classList.add('active');
  renderAuftragVerwaltung();
}

function auVerwGoPage(page){
  var n = Number(page);
  auVerwPage = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  renderAuftragVerwaltung();
}

function auVerwRenderPager(totalRows){
  var pager = document.getElementById('au-verwaltung-pagination');
  if(!pager) return;
  var pageCount = Math.max(1, Math.ceil(totalRows / AU_VERW_PAGE_SIZE));
  if(auVerwPage > pageCount) auVerwPage = pageCount;
  var from = totalRows === 0 ? 0 : (auVerwPage - 1) * AU_VERW_PAGE_SIZE + 1;
  var to = Math.min(totalRows, auVerwPage * AU_VERW_PAGE_SIZE);
  var buttons = [];
  for(var i=1;i<=pageCount;i++){
    var active = i === auVerwPage;
    buttons.push('<button type="button" class="cc-page-btn'+(active?' is-active':'')+'" onclick="auVerwGoPage('+i+')" aria-current="'+(active?'page':'false')+'">'+i+'</button>');
  }
  pager.innerHTML =
    '<div class="cc-page-count">'+from+'-'+to+' von '+totalRows+'</div>'
    +'<div class="cc-page-actions">'
      +'<button type="button" class="cc-page-btn" onclick="auVerwGoPage('+(auVerwPage-1)+')" '+(auVerwPage<=1?'disabled':'')+'>Zurueck</button>'
      +buttons.join('')
      +'<button type="button" class="cc-page-btn" onclick="auVerwGoPage('+(auVerwPage+1)+')" '+(auVerwPage>=pageCount?'disabled':'')+'>Weiter</button>'
    +'</div>';
}

/**
 * KPI + Tabelle lesen dieselbe Quelle wie GET/PUT (API → RAM).
 * `window.AUFTRAEGE` kann in der Produktion temporär auf Teilmengen zeigen — nicht für die Verwaltung verwenden.
 * @returns {unknown[]}
 */
function auVerwAuftraegeQuelle() {
  if (typeof window !== 'undefined' && window._AUFTRAEGE_CANON && Array.isArray(window._AUFTRAEGE_CANON)) {
    return window._AUFTRAEGE_CANON;
  }
  if (typeof AUFTRAEGE !== 'undefined' && Array.isArray(AUFTRAEGE)) return AUFTRAEGE;
  return [];
}

/** Tab-Zeile ohne Suchtext (auVerwFilter + archiv). */
function _auVerwMatchesTab(a) {
  if (auVerwFilter === 'archiv') return !!a.archiv;
  if (a.archiv) return false;
  if (auVerwFilter === 'alle') return true;
  if (auVerwFilter === 'offen') return a.step !== 'abgeschlossen';
  if (auVerwFilter === 'abgeschlossen') return a.step === 'abgeschlossen';
  if (auVerwFilter === 'rechnung') return a.rechnung === 'offen';
  return true;
}

function renderAuftragVerwaltung(){
  var q = (document.getElementById('au-verwaltung-suche')?.value||'').toLowerCase();
  var src = auVerwAuftraegeQuelle();
  var filterKey = auVerwFilter + '|' + q;
  if(filterKey !== auVerwLastFilterKey){
    auVerwPage = 1;
    auVerwLastFilterKey = filterKey;
  }

  // Filter: Tab nur nach archiv/step/rechnung wie Tabspezifikation; Suche zusätzlich
  var data = src.filter(function(a){
    if (!_auVerwMatchesTab(a)) return false;
    if(q && !(
      (a.kunde||'').toLowerCase().includes(q) ||
      (a.id||'').toLowerCase().includes(q)    ||
      (a.fz||'').toLowerCase().includes(q)    ||
      (a.paket||'').toLowerCase().includes(q)
    )) return false;
    return true;
  });

  // Stats (archivierte aus normalen Zahlen raus) — gleiche Quelle wie Tabelle
  var aktiv  = src.filter(function(a){ return !a.archiv; });
  var total  = aktiv.length;
  var offen  = aktiv.filter(function(a){ return a.step!=='abgeschlossen'; }).length;
  var abg    = aktiv.filter(function(a){ return a.step==='abgeschlossen'; }).length;
  var reOff  = aktiv.filter(function(a){ return a.rechnung==='offen'; }).length;
  var archiviert = src.filter(function(a){ return !!a.archiv; }).length;
  var statsEl = document.getElementById('au-verwaltung-stats');
  if(statsEl) statsEl.innerHTML =
    '<div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div><div><div class="sc-n" style="color:var(--blue)">'+total+'</div><div class="sc-l">Aktiv gesamt</div></div></div>'
   +'<div class="sc" style="border-top-color:var(--amber)"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div><div class="sc-n" style="color:var(--amber)">'+offen+'</div><div class="sc-l">In Arbeit</div></div></div>'
   +'<div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" style="color:var(--green)">'+abg+'</div><div class="sc-l">Abgeschlossen</div></div></div>'
   +'<div class="sc" style="border-top-color:var(--red)"><div class="sc-ico" style="background:var(--red-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg></div><div><div class="sc-n" style="color:var(--red)">'+reOff+'</div><div class="sc-l">Rechnung offen</div></div></div>'
   +(archiviert>0?'<div class="sc" style="border-top-color:var(--text3);cursor:pointer;" onclick="auVerwTab(document.querySelector(\'#au-verwaltung-tabs .tab:last-child\'),\'archiv\')"><div class="sc-ico" style="background:var(--gray-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></div><div><div class="sc-n" style="color:var(--text3)">'+archiviert+'</div><div class="sc-l">Archiviert</div></div></div>':'');

  // Tabelle
  var tbody = document.getElementById('au-verwaltung-tbody');
  if(!tbody) return;

  if(!data.length){
    tbody.innerHTML='<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text3);">Keine Aufträge gefunden</td></tr>';
    auVerwRenderPager(0);
    return;
  }

  var pageCount = Math.max(1, Math.ceil(data.length / AU_VERW_PAGE_SIZE));
  if(auVerwPage > pageCount) auVerwPage = pageCount;
  var pageData = data.slice((auVerwPage - 1) * AU_VERW_PAGE_SIZE, auVerwPage * AU_VERW_PAGE_SIZE);

  tbody.innerHTML = pageData.map(function(a){
    var isAbg   = a.step==='abgeschlossen';
    var sl      = STEP_LABELS[a.step] || STEP_LABELS['abgeschlossen'];
    var heuteStr= new Date().toISOString().substring(0,10);
    var tStr    = (a.terminDatum||a.liefertermin||'').substring(0,10);
    var istHeute = tStr === heuteStr;
    var istUeberf= tStr && tStr < heuteStr && !isAbg;

    // Zeilenhintergrund: rot=dringend, orange=heute/überfällig, grau=archiv
    var rowBg = a.archiv    ? 'background:#F5F5F5;opacity:0.85;'
              : a.urgent    ? 'background:#FFF5F5;'
              : istUeberf   ? 'background:#FFF3E0;'
              : istHeute    ? 'background:#FFFDE7;'
              : '';

    // Status-Badge exakt mit STEP_LABELS-Farbe (identisch zu Produktion)
    var stepCol = sl.col;
    var stepBdg = a.archiv
      ? '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;background:var(--gray-l);color:var(--text3);border:1px solid var(--border);">🗄 Archiviert</span>'
      : '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;background:'+stepCol+'18;color:'+stepCol+';border:1px solid '+stepCol+'44;">'+sl.title+'</span>';

    // Rechnungs-Badge
    var reMap = {offen:'ba',geschrieben:'bb',bezahlt:'bg'};
    var reLbl = {offen:'Offen',geschrieben:'Erstellt',bezahlt:'Bezahlt ✓'};
    var reBdg = isAbg
      ? '<span class="bdg '+(reMap[a.rechnung]||'ba')+'">'+(reLbl[a.rechnung]||'Offen')+'</span>'
      : '<span style="color:var(--text3);font-size:11px;">—</span>';

    // Termin
    var termin = tStr ? tStr.split('-').reverse().join('.') : '—';
    var terminStyle = a.urgent||istUeberf ? 'color:var(--red);font-weight:700;'
                    : istHeute            ? 'color:#FF9800;font-weight:700;' : 'color:var(--text2);';
    var terminPrefix = istUeberf ? '⚠ ' : istHeute ? '📅 ' : '';

    return '<tr onclick="openAuftragDetail(\''+a.id+'\')" style="cursor:pointer;'+rowBg+'">'
      // Kunde (Haupttitel) + ID darunter
      +'<td><div style="font-weight:700;font-size:13px;color:var(--text);">'+(a.urgent?'🔴 ':'')+a.kunde+'</div>'
        +'<div style="font-size:11px;color:var(--text3);margin-top:1px;">'+a.id+'</div>'
      +'</td>'
      // Fahrzeug / Paket
      +'<td><div style="font-size:12px;color:var(--text2);">'+a.fz+'</div>'
        +'<div style="font-size:11px;color:var(--text3);">'+a.paket+'</div>'
      +'</td>'
      // Status — gleiche Farbe wie Produktion
      +'<td>'+stepBdg+'</td>'
      // Termin
      +'<td style="font-size:12px;'+terminStyle+'">'+terminPrefix+termin+'</td>'
      // Rechnung
      +'<td>'+reBdg+'</td>'
      // Aktionen
      +'<td style="text-align:right;white-space:nowrap;">'
        +(isAbg&&a.rechnung==='offen'?'<button onclick="event.stopPropagation();setRechnung(\''+a.id+'\',\'geschrieben\')" class="btn" style="font-size:11px;padding:3px 8px;color:var(--amber);">💶 Rechnung</button> ':'')
        +'<button onclick="event.stopPropagation();openAuftragDetail(\''+a.id+'\')" class="btn" style="font-size:11px;padding:3px 8px;">Details →</button>'
      +'</td>'
      +'</tr>';
  }).join('');
  auVerwRenderPager(data.length);
}

/** Alias für `CCIntern.init` / Cockpit — identisch zu {@link renderAuftragVerwaltung} */
function renderAuftraege() {
  renderAuftragVerwaltung();
}

function renderChecklisten(){
  var root = document.querySelector('.cc-intern-root') || document;
  var pg = root.querySelector('#pg-checklisten');
  var liste = (pg && pg.querySelector('#cl-vorlagen-liste')) || root.querySelector('#cl-vorlagen-liste') || document.getElementById('cl-vorlagen-liste');
  if (!liste) return;

  function clPunkteArr(v) {
    var p = v && v.punkte;
    return Array.isArray(p) ? p : [];
  }

  const total = window.CL_VORLAGEN.length;
  const aktiv = window.CL_VORLAGEN.filter(v=>v.aktiv).length;
  const punkte = window.CL_VORLAGEN.reduce((a,v)=>a+clPunkteArr(v).length,0);
  const st=root.querySelector('#cl-stat-total')  || document.getElementById('cl-stat-total');  if(st) st.textContent=total;
  const sa=root.querySelector('#cl-stat-aktiv')  || document.getElementById('cl-stat-aktiv');  if(sa) sa.textContent=aktiv;
  const sp=root.querySelector('#cl-stat-punkte') || document.getElementById('cl-stat-punkte'); if(sp) sp.textContent=punkte;
  const lightMap={'var(--blue)':'var(--blue-l)','var(--purple)':'var(--purple-l)','var(--teal)':'var(--teal-l)','var(--amber)':'var(--amber-l)','var(--green)':'var(--green-l)','var(--red)':'var(--red-l)'};
  try {
    liste.innerHTML = window.CL_VORLAGEN.map(v=>{
      const pts = clPunkteArr(v);
      const isAkt = clAktivId===v.id;
      const lBg = lightMap[v.farbe]||'var(--blue-l)';
      const pflicht = pts.filter(p=>p.kat==='pflicht').length;
      const foto    = pts.filter(p=>p.kat==='foto').length;
      var vid = String(v.id||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      var vname = String(v.name||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      return '<div onclick="clOpenVorlage(\''+vid+'\')" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;background:'+(isAkt?lBg:'#fff')+';border-left:3px solid '+(isAkt?v.farbe:'transparent')+';">'
        +'<div style="width:38px;height:38px;border-radius:9px;background:'+lBg+';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">'+(v.ico||'')+'</div>'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+vname+'</div>'
          +'<div style="font-size:11px;color:var(--text2);margin-top:1px;">'+pts.length+' Punkte'
            +(pflicht?' · '+pflicht+' Pflicht':'')+(foto?' · 📷 '+foto+' Foto':'')+'</div>'
        +'</div>'
        +'<span class="bdg '+(v.aktiv?'bg':'bgr')+'">'+(v.aktiv?'Aktiv':'Inaktiv')+'</span>'
      +'</div>';
    }).join('') || '<div style="padding:20px;text-align:center;color:var(--text3);">Noch keine Vorlagen'
      + (typeof window !== 'undefined' && window.__CCINTERN_COCKPIT_MOUNT__
        ? '<br><small style="font-size:12px;">Daten aus <code>/api/v1/checklisten</code>. «Vorlage anlegen» erstellt eine neue Liste.</small>'
        : '')
      + '</div>';
  } catch (e) {
    console.error('[renderChecklisten]', e);
    liste.innerHTML = '<div style="padding:20px;text-align:center;color:var(--red);">Vorlagen-Liste konnte nicht gebaut werden.</div>';
  }
}

/** DB-Checkliste (Cockpit-API): Vorlagen-ID ist eine UUID. */
function _clChecklisteIdIsApiUuid(idStr){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(idStr||'').trim());
}

var CL_ZUORD_SCHRITTE = ['grafik', 'druck', 'laminat', 'montage', 'doku'];

function clZuordEscAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clProdukteListeReadOnly() {
  var list =
    typeof window !== 'undefined' && Array.isArray(window.CC_PRODUKTE_LISTE_READ_ONLY)
      ? window.CC_PRODUKTE_LISTE_READ_ONLY
      : typeof CC_PRODUKTE_LISTE !== 'undefined' && Array.isArray(CC_PRODUKTE_LISTE)
        ? CC_PRODUKTE_LISTE
        : [];
  return list;
}

function clZuordnungSchrittLabel(step) {
  var map = { grafik: 'Grafik', druck: 'Druck', laminat: 'Laminat', montage: 'Montage', doku: 'Doku' };
  return map[step] || step;
}

function clZuordnungPanelSkeletonHtml(checklisteId) {
  var cid = clZuordEscAttr(checklisteId);
  var schrittOpts = CL_ZUORD_SCHRITTE.map(function (st) {
    return '<option value="' + clZuordEscAttr(st) + '">' + clZuordEscAttr(clZuordnungSchrittLabel(st)) + '</option>';
  }).join('');
  var produkte = clProdukteListeReadOnly();
  var prodChecks = produkte
    .map(function (p) {
      if (!p || !p.id) return '';
      var pid = clZuordEscAttr(String(p.id));
      var plab = clZuordEscAttr(p.label || p.id);
      return (
        '<label style="display:flex;align-items:center;gap:6px;font-size:11px;padding:3px 0;cursor:pointer;">'
        + '<input type="checkbox" class="cl-zuord-prod-cb" value="' + pid + '" style="accent-color:var(--teal);">'
        + '<span>' + plab + '</span></label>'
      );
    })
    .join('');
  return (
    '<div id="cl-zuordnung-panel" data-checkliste-id="' + cid + '" style="border-top:2px solid var(--border);margin-top:8px;">'
    + '<div style="padding:12px 16px 8px;">'
    + '<div style="font-size:12px;font-weight:700;color:var(--teal);margin-bottom:10px;">📋 ZUORDNUNG</div>'
    + '<div class="frow" style="margin-bottom:8px;">'
    + '<div class="fg" style="flex:1;">'
    + '<label class="fl">Schritt</label>'
    + '<select class="fs" id="cl-zuord-schritt">' + schrittOpts + '</select>'
    + '</div></div>'
    + '<div style="margin-bottom:8px;">'
    + '<label style="display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;cursor:pointer;margin-bottom:6px;">'
    + '<input type="checkbox" id="cl-zuord-alle" onchange="clZuordAlleProdukteToggle(this.checked)" style="accent-color:var(--teal);"> Alle Produkte'
    + '</label>'
    + '<div id="cl-zuord-produkte" style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--gray-l);">'
    + (prodChecks || '<span style="font-size:11px;color:var(--text3);">Keine Produkte geladen.</span>')
    + '</div></div>'
    + '<button type="button" class="btn p" style="width:100%;font-size:12px;margin-bottom:10px;" onclick="clZuordnungSpeichern(\'' + cid + '\')">Zuordnung speichern</button>'
    + '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px;">Bestehende Zuordnungen</div>'
    + '<div id="cl-zuord-liste" style="font-size:11px;color:var(--text2);">Laden…</div>'
    + '</div></div>'
  );
}

function clZuordnungListeHtml(checklisteId, rows) {
  var cid = String(checklisteId || '').trim();
  var list = Array.isArray(rows) ? rows : [];
  var mine = list.filter(function (r) {
    return r && String(r.checkliste_id || '').trim() === cid;
  });
  if (!mine.length) {
    return '<div style="padding:8px 0;color:var(--text3);">Keine Zuordnungen für diese Vorlage.</div>';
  }
  var prodMap = {};
  clProdukteListeReadOnly().forEach(function (p) {
    if (p && p.id) prodMap[String(p.id)] = p.label || p.id;
  });
  return mine
    .map(function (r) {
      var zid = clZuordEscAttr(String(r.id || ''));
      var pid = String(r.produkt_id || '');
      var plab = clZuordEscAttr(prodMap[pid] || pid);
      var st = clZuordEscAttr(clZuordnungSchrittLabel(String(r.schritt || '')));
      return (
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">'
        + '<span><strong>' + plab + '</strong> · ' + st + '</span>'
        + '<button type="button" class="btn" style="font-size:10px;color:var(--red);padding:2px 8px;" onclick="clZuordnungLoeschen(\''
        + zid + '\',\'' + clZuordEscAttr(cid) + '\')">Löschen</button></div>'
      );
    })
    .join('');
}

function clZuordAlleProdukteToggle(checked) {
  document.querySelectorAll('.cl-zuord-prod-cb').forEach(function (cb) {
    cb.checked = !!checked;
    cb.disabled = !!checked;
  });
  var wrap = document.getElementById('cl-zuord-produkte');
  if (wrap) wrap.style.opacity = checked ? '0.55' : '1';
}

async function clLoadZuordnungPanel(checklisteId) {
  var panel = document.getElementById('cl-zuordnung-panel');
  var listEl = document.getElementById('cl-zuord-liste');
  if (!panel || !listEl) return;
  var cid = String(checklisteId || '').trim();
  if (!_clChecklisteIdIsApiUuid(cid)) {
    listEl.innerHTML =
      '<div style="padding:8px 0;color:var(--text3);">Zuordnung nur für API-Vorlagen (UUID).</div>';
    return;
  }
  listEl.textContent = 'Laden…';
  var capi = typeof window !== 'undefined' ? window.CCIntern && window.CCIntern.cockpitApi : null;
  if (!capi || typeof capi.fetchCcInternChecklistenZuordnungAll !== 'function') {
    listEl.innerHTML = '<div style="color:var(--red);">API nicht verfügbar.</div>';
    return;
  }
  try {
    var rows = await capi.fetchCcInternChecklistenZuordnungAll();
    listEl.innerHTML = clZuordnungListeHtml(cid, rows);
  } catch (e) {
    listEl.innerHTML = '<div style="color:var(--red);">Zuordnungen konnten nicht geladen werden.</div>';
  }
}

async function clZuordnungSpeichern(checklisteId) {
  var cid = String(checklisteId || '').trim();
  if (!_clChecklisteIdIsApiUuid(cid)) {
    if (typeof showToast === 'function') showToast('⚠ Nur API-Vorlagen können zugeordnet werden.');
    return;
  }
  var schrittEl = document.getElementById('cl-zuord-schritt');
  var schritt = schrittEl ? String(schrittEl.value || '').trim() : '';
  if (!schritt) {
    if (typeof showToast === 'function') showToast('⚠ Bitte Schritt wählen.');
    return;
  }
  var alleCb = document.getElementById('cl-zuord-alle');
  var alle = alleCb && alleCb.checked;
  var produktIds = [];
  if (alle) {
    clProdukteListeReadOnly().forEach(function (p) {
      if (p && p.id) produktIds.push(String(p.id).trim());
    });
  } else {
    document.querySelectorAll('.cl-zuord-prod-cb:checked').forEach(function (cb) {
      if (cb.value) produktIds.push(String(cb.value).trim());
    });
  }
  if (!produktIds.length) {
    if (typeof showToast === 'function') showToast('⚠ Mindestens ein Produkt wählen.');
    return;
  }
  var capi = window.CCIntern && window.CCIntern.cockpitApi;
  if (!capi || typeof capi.createCcInternChecklistenZuordnung !== 'function') {
    if (typeof showToast === 'function') showToast('⚠ API nicht verfügbar.');
    return;
  }
  var ok = 0;
  var fail = 0;
  for (var i = 0; i < produktIds.length; i++) {
    try {
      await capi.createCcInternChecklistenZuordnung({
        produkt_id: produktIds[i],
        schritt: schritt,
        checkliste_id: cid,
        aktiv: true,
        sortierung: 0,
      });
      ok += 1;
    } catch (e) {
      fail += 1;
    }
  }
  await clLoadZuordnungPanel(cid);
  if (typeof showToast === 'function') {
    showToast(
      ok > 0
        ? '✓ ' + ok + ' Zuordnung(en) gespeichert' + (fail ? ' (' + fail + ' fehlgeschlagen)' : '')
        : '⚠ Zuordnung fehlgeschlagen',
    );
  }
}

async function clZuordnungLoeschen(zuordnungId, checklisteId) {
  var zid = String(zuordnungId || '').trim();
  var cid = String(checklisteId || '').trim();
  if (!zid) return;
  var capi = window.CCIntern && window.CCIntern.cockpitApi;
  if (!capi || typeof capi.deleteCcInternChecklistenZuordnung !== 'function') return;
  try {
    await capi.deleteCcInternChecklistenZuordnung(zid);
    await clLoadZuordnungPanel(cid);
    if (typeof showToast === 'function') showToast('✓ Zuordnung gelöscht');
  } catch (e) {
    if (typeof showToast === 'function') showToast('⚠ Löschen fehlgeschlagen');
  }
}

if (typeof window !== 'undefined') {
  window.clZuordAlleProdukteToggle = clZuordAlleProdukteToggle;
  window.clZuordnungSpeichern = clZuordnungSpeichern;
  window.clZuordnungLoeschen = clZuordnungLoeschen;
}

function clOpenVorlage(id){
  clAktivId=id;
  renderChecklisten();
  var ph=document.getElementById('cl-detail-ph');
  var body=document.getElementById('cl-detail-body');
  var idStr=String(id||'').trim();

  function paintDetail(v){
    if(!body) return;
    if(!v){
      body.innerHTML='<div style="padding:16px;color:var(--text3);font-size:13px;text-align:center;">Vorlage nicht gefunden.</div>';
      if(ph) ph.innerHTML='<div class="ph-title">Vorlage auswählen</div>';
      return;
    }
    var pts=Array.isArray(v.punkte)?v.punkte:[];
    console.log('VORLAGE FINAL', pts.map(function(p){ return p && (p.title||p.text) ? (p.title||p.text) : ''; }));
    var idJs=idStr.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var vidAttr=String(v.id||idStr).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    if(ph) ph.innerHTML=
      '<div style="display:flex;align-items:center;gap:10px;min-width:0;">'
        +'<span style="font-size:20px;flex-shrink:0;">'+(v.ico||'')+'</span>'
        +'<div style="min-width:0;">'
          +'<div class="ph-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+v.name+'</div>'
          +'<div style="font-size:11px;color:var(--text2);">'+pts.length+' Punkte · <span style="color:'+(v.aktiv?'var(--green)':'var(--text3)')+';">'+(v.aktiv?'Aktiv':'Inaktiv')+'</span></div>'
        +'</div>'
      +'</div>'
      +'<div style="display:flex;gap:5px;flex-wrap:wrap;flex-shrink:0;">'
        +'<button class="btn" onclick="clDrucken(\''+vidAttr+'\')" title="Checkliste drucken" style="font-size:12px;">🖨</button>'
        +'<button class="btn" onclick="clDuplizieren(\''+vidAttr+'\')" title="Vorlage duplizieren" style="font-size:12px;">⎘</button>'
        +'<button class="btn" onclick="clBearbeiten(\''+vidAttr+'\')" title="Name & Beschreibung bearbeiten" style="font-size:12px;">✏</button>'
        +'<button class="btn" onclick="clToggleAktiv(\''+vidAttr+'\')" style="font-size:12px;color:'+(v.aktiv?'var(--amber)':'var(--green)')+'">'+(v.aktiv?'⏸':'▶')+'</button>'
        +'<button class="btn p" onclick="clAddPunkt(\''+vidAttr+'\')" style="font-size:12px;">+ Punkt</button>'
        +'<button class="btn" onclick="clDeleteVorlage(\''+vidAttr+'\')" style="color:var(--red);font-size:12px;">🗑</button>'
      +'</div>';

    var katIco={pflicht:'✅',optional:'○',foto:'📷'};
    var katCol={pflicht:'var(--green)',optional:'var(--gray)',foto:'var(--purple)'};
    var btnBase='background:none;border:none;cursor:pointer;padding:3px 5px;border-radius:4px;font-size:13px;line-height:1;';

    body.innerHTML=
      '<div style="padding:10px 16px;background:var(--gray-l);font-size:12px;color:var(--text2);">'+(v.beschr||'')+'</div>'
      +'<div style="padding:6px 14px;">'
      +pts.map(function(p,i){
        return '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">'
          +'<span style="font-size:14px;flex-shrink:0;margin-top:2px;color:'+katCol[p.kat]+'" title="'+p.kat+'">'+katIco[p.kat]+'</span>'
          +'<div style="flex:1;min-width:0;">'
            +'<div style="font-size:12.5px;font-weight:500;">'+p.text+'</div>'
            +(p.hinweis?'<div style="font-size:10px;color:var(--text3);margin-top:2px;">💡 '+p.hinweis+'</div>':'')
          +'</div>'
          +'<div style="display:flex;gap:1px;flex-shrink:0;align-items:center;">'
            +(i>0
              ?'<button onclick="clMovePunkt(\''+idJs+'\','+i+',-1)" title="Nach oben" style="'+btnBase+'color:var(--text3);" onmouseover="this.style.background=\'var(--gray-l)\'" onmouseout="this.style.background=\'none\'">↑</button>'
              :'<span style="width:22px;"></span>')
            +(i<pts.length-1
              ?'<button onclick="clMovePunkt(\''+idJs+'\','+i+',1)" title="Nach unten" style="'+btnBase+'color:var(--text3);" onmouseover="this.style.background=\'var(--gray-l)\'" onmouseout="this.style.background=\'none\'">↓</button>'
              :'<span style="width:22px;"></span>')
            +'<button onclick="clEditPunkt(\''+idJs+'\','+i+')" title="Bearbeiten" style="'+btnBase+'color:var(--blue);" onmouseover="this.style.background=\'var(--blue-l)\'" onmouseout="this.style.background=\'none\'">✏</button>'
            +'<button onclick="clDeletePunkt(\''+idJs+'\','+i+')" title="Löschen" style="'+btnBase+'color:var(--red);opacity:.5;" onmouseover="this.style.opacity=\'1\';this.style.background=\'var(--red-l)\'" onmouseout="this.style.opacity=\'.5\';this.style.background=\'none\'">✕</button>'
          +'</div>'
        +'</div>';
      }).join('')
      +'</div>'
      +'<div style="padding:10px 14px;border-top:1px solid var(--border);">'
        +'<button class="btn p" style="width:100%;" onclick="clAddPunkt(\''+vidAttr+'\')">+ Prüfpunkt hinzufügen</button>'
      +'</div>'
      +clZuordnungPanelSkeletonHtml(vidAttr);
    clLoadZuordnungPanel(idStr);
  }

  var capi=typeof window!=='undefined'&&window.__CCINTERN_COCKPIT_MOUNT__&&window.CCIntern&&window.CCIntern.cockpitApi;
  if(capi&&typeof capi.refreshChecklisteVorlageFromApi==='function'&&_clChecklisteIdIsApiUuid(idStr)){
    if(ph) ph.innerHTML='<div class="ph-title">Laden…</div>';
    if(body) body.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">Vorlage wird geladen…</div>';
    capi.refreshChecklisteVorlageFromApi(idStr, typeof showToast==='function'?showToast:null).then(function(){
      var v2=window.CL_VORLAGEN.find(function(x){ return x&&String(x.id)===idStr; });
      renderChecklisten();
      paintDetail(v2);
    });
    return;
  }
  var v0=window.CL_VORLAGEN.find(function(x){ return x&&String(x.id)===idStr; });
  paintDetail(v0);
}

function clNeuModal(){
  clNeuFarbe='var(--blue)'; clNeuIco='🚌';
  const n=document.getElementById('cl-name');   if(n) n.value='';
  const b=document.getElementById('cl-beschr'); if(b) b.value='';
  const a=document.getElementById('cl-art');    if(a) a.value='';
  document.querySelectorAll('#cl-farb-grid button').forEach((btn,i)=>{
    btn.style.borderColor='var(--border)'; btn.style.background='#fff';
    if(i===0){ btn.style.borderColor='var(--blue)'; btn.style.background='var(--blue-l)'; }
  });
  document.getElementById('clModal').classList.add('open');
}

function clSelFarbe(btn,farbe,ico){
  clNeuFarbe=farbe; clNeuIco=ico;
  document.querySelectorAll('#cl-farb-grid button').forEach(b=>{
    b.style.borderColor='var(--border)'; b.style.background='#fff'; b.style.fontWeight='400';
  });
  // Map CSS var to light variant
  const lightMap={'var(--blue)':'var(--blue-l)','var(--purple)':'var(--purple-l)','var(--teal)':'var(--teal-l)','var(--amber)':'var(--amber-l)','var(--green)':'var(--green-l)','var(--red)':'var(--red-l)'};
  btn.style.borderColor=farbe;
  btn.style.background=lightMap[farbe]||'var(--blue-l)';
  btn.style.fontWeight='700';
}

function clSaveVorlage(){
  const name=document.getElementById('cl-name')?.value?.trim();
  if(!name){ showToast('⚠ Bitte Name eingeben'); return; }
  const id='cl-'+Date.now();
  var template = {
    id, name,
    art:document.getElementById('cl-art')?.value||'',
    ico:clNeuIco, farbe:clNeuFarbe, aktiv:true,
    beschr:document.getElementById('cl-beschr')?.value||'',
  };
  if(!template.punkte || template.punkte.length===0){
    template.punkte = [];
  }
  window.CL_VORLAGEN.push(template);
  document.getElementById('clModal').classList.remove('open');
  renderChecklisten();
  clOpenVorlage(id);
  showToast('✓ Vorlage "'+name+'" angelegt');
}

function clDeleteVorlage(id){
  if(typeof ccInternConfirm !== 'function') return;
  ccInternConfirm('Vorlage löschen?', function(){
  var delId = id;
  window.CL_VORLAGEN=window.CL_VORLAGEN.filter(v=>v.id!==id);
  if (typeof window !== 'undefined' && window.__CCINTERN_COCKPIT_MOUNT__ && window.CCIntern && window.CCIntern.cockpitApi && typeof window.CCIntern.cockpitApi.deleteChecklisteFromApi === 'function') {
    window.CCIntern.cockpitApi.deleteChecklisteFromApi(delId, typeof showToast === 'function' ? showToast : null);
  }
  clAktivId=null;
  renderChecklisten();
  const body=document.getElementById('cl-detail-body');
  const ph=document.getElementById('cl-detail-ph');
  if(body) body.innerHTML='<div style="padding:16px;color:var(--text3);font-size:13px;text-align:center;"><div style="font-size:32px;margin-bottom:8px;">👈</div>Vorlage links auswählen</div>';
  if(ph) ph.innerHTML='<div class="ph-title">Vorlage auswählen</div>';
  showToast('🗑 Vorlage gelöscht');
  });
}

function clAddPunkt(vorlageId){
  clPunktVorlageId = vorlageId;
  clEditPunktIdx   = null;
  const t=document.getElementById('clp-text');   if(t) t.value='';
  const h=document.getElementById('clp-hinweis');if(h) h.value='';
  const k=document.getElementById('clp-kat');    if(k) k.value='pflicht';
  const mt=document.querySelector('#clPunktModal .mtitle');
  if(mt) mt.textContent='+ Prüfpunkt hinzufügen';
  document.getElementById('clPunktModal').classList.add('open');
  setTimeout(function(){ var t=document.getElementById('clp-text'); if(t) t.focus(); },80);
}

function clEditPunkt(vorlageId, idx){
  const v=window.CL_VORLAGEN.find(x=>x.id===vorlageId); if(!v) return;
  const p=v.punkte[idx]; if(!p) return;
  clPunktVorlageId = vorlageId;
  clEditPunktIdx   = idx;
  const t=document.getElementById('clp-text');   if(t) t.value=p.text;
  const h=document.getElementById('clp-hinweis');if(h) h.value=p.hinweis||'';
  const k=document.getElementById('clp-kat');    if(k) k.value=p.kat||'pflicht';
  const mt=document.querySelector('#clPunktModal .mtitle');
  if(mt) mt.textContent='✏ Prüfpunkt bearbeiten';
  document.getElementById('clPunktModal').classList.add('open');
  setTimeout(function(){ var t=document.getElementById('clp-text'); if(t) t.focus(); },80);
}

function clSavePunkt(){
  const text=document.getElementById('clp-text')?.value?.trim();
  if(!text){ showToast('⚠ Bitte Prüfpunkt eingeben'); return; }
  const v=window.CL_VORLAGEN.find(x=>x.id===clPunktVorlageId); if(!v) return;
  const kat     = document.getElementById('clp-kat')?.value||'pflicht';
  const hinweis = document.getElementById('clp-hinweis')?.value||'';
  const isEdit  = clEditPunktIdx !== null;
  const toastFn = typeof showToast==='function'?showToast:null;
  var capi=typeof window!=='undefined'&&window.__CCINTERN_COCKPIT_MOUNT__&&window.CCIntern&&window.CCIntern.cockpitApi?window.CCIntern.cockpitApi:null;
  var cid=String(v.id||'').trim();
  var uuidOk=_clChecklisteIdIsApiUuid(cid);
  var canEintraege=capi&&uuidOk
    &&typeof capi.postChecklisteEintragFromApi==='function'
    &&typeof capi.putChecklisteEintragFromApi==='function'
    &&typeof capi.refreshChecklisteVorlageFromApi==='function';

  function clPunktModalCloseAndRepaint(msg){
    var m=document.getElementById('clPunktModal');
    if(m) m.classList.remove('open');
    renderChecklisten();
    clOpenVorlage(clPunktVorlageId);
    showToast(msg);
  }

  if(canEintraege){
    if(isEdit){
      var prev=v.punkte[clEditPunktIdx];
      var eid=prev&&prev.eintragId?String(prev.eintragId).trim():'';
      if(eid){
        if(typeof window!=='undefined')window.__CL_SKIP_VORLAGEN_SAVE_ONCE=true;
        console.log('[CL-PUNKT PATCH]',{checklisteId:cid,eintragId:eid,patch:{text:text}});
        capi.putChecklisteEintragFromApi(eid,{text:text},toastFn).then(function(err){
          if(err){console.warn('[CL-PUNKT FEHLER]',err);return;}
          return capi.refreshChecklisteVorlageFromApi(cid,toastFn).then(function(){
            clPunktModalCloseAndRepaint('✓ Punkt aktualisiert');
          });
        });
        return;
      }
    }else{
      if(typeof window!=='undefined')window.__CL_SKIP_VORLAGEN_SAVE_ONCE=true;
      console.log('[CL-PUNKT ADD]',{checklisteId:cid,text:text});
      capi.postChecklisteEintragFromApi(cid,{text:text,erledigt:false},toastFn).then(function(err){
        if(err){console.warn('[CL-PUNKT FEHLER]',err);return;}
        return capi.refreshChecklisteVorlageFromApi(cid,toastFn).then(function(){
          clPunktModalCloseAndRepaint('✓ Prüfpunkt hinzugefügt');
        });
      });
      return;
    }
  }

  if(isEdit){
    var prev0=v.punkte[clEditPunktIdx]||{};
    v.punkte[clEditPunktIdx] = {text:text, kat:kat, hinweis:hinweis, eintragId:prev0.eintragId, reihenfolge:prev0.reihenfolge, erledigt:prev0.erledigt};
  } else {
    v.punkte.push({text:text, kat:kat, hinweis:hinweis});
  }
  var m0=document.getElementById('clPunktModal');
  if(m0) m0.classList.remove('open');
  renderChecklisten();
  clOpenVorlage(clPunktVorlageId);
  showToast(isEdit ? '✓ Punkt aktualisiert' : '✓ Prüfpunkt hinzugefügt');
}

function clDeletePunkt(vorlageId, idx){
  if(typeof ccInternConfirm !== 'function') return;
  ccInternConfirm('Möchten Sie diesen Checklisten-Punkt wirklich löschen?', function(){
  const v=window.CL_VORLAGEN.find(x=>x.id===vorlageId); if(!v) return;
  var toastFn = typeof showToast==='function'?showToast:null;
  var capi=typeof window!=='undefined'&&window.__CCINTERN_COCKPIT_MOUNT__&&window.CCIntern&&window.CCIntern.cockpitApi?window.CCIntern.cockpitApi:null;
  var cid=String(vorlageId||'').trim();
  var uuidOk=_clChecklisteIdIsApiUuid(cid);
  var p=v.punkte[idx];
  var eid=p&&p.eintragId?String(p.eintragId).trim():'';
  if(capi&&uuidOk&&eid&&typeof capi.deleteChecklisteEintragFromApi==='function'&&typeof capi.refreshChecklisteVorlageFromApi==='function'){
    console.log('[CL-PUNKT DELETE]',{checklisteId:cid,eintragId:eid});
    capi.deleteChecklisteEintragFromApi(eid,toastFn).then(function(err){
      if(err){console.warn('[CL-PUNKT FEHLER]',err);return;}
      return capi.refreshChecklisteVorlageFromApi(cid,toastFn).then(function(){
        renderChecklisten();
        clOpenVorlage(vorlageId);
        showToast('🗑 Punkt entfernt');
      });
    });
    return;
  }
  v.punkte.splice(idx,1);
  renderChecklisten();
  clOpenVorlage(vorlageId);
  showToast('🗑 Punkt entfernt');
  if(window.ClVorlagenService&&typeof window.ClVorlagenService.save==='function')window.ClVorlagenService.save();
  });
}

function clMovePunkt(vorlageId, idx, dir){
  const v=window.CL_VORLAGEN.find(x=>x.id===vorlageId); if(!v) return;
  const ni=idx+dir;
  if(ni<0||ni>=v.punkte.length) return;
  var toastFn = typeof showToast==='function'?showToast:null;
  var capi=typeof window!=='undefined'&&window.__CCINTERN_COCKPIT_MOUNT__&&window.CCIntern&&window.CCIntern.cockpitApi?window.CCIntern.cockpitApi:null;
  var cid=String(vorlageId||'').trim();
  var uuidOk=_clChecklisteIdIsApiUuid(cid);
  var a=v.punkte[idx], b=v.punkte[ni];
  var eidA=a&&a.eintragId?String(a.eintragId).trim():'';
  var eidB=b&&b.eintragId?String(b.eintragId).trim():'';
  function roNum(p,i){
    var n=p&&typeof p.reihenfolge!=='undefined'?Number(p.reihenfolge):NaN;
    return Number.isFinite(n)?n:i;
  }
  if(capi&&uuidOk&&eidA&&eidB&&typeof capi.putChecklisteEintragFromApi==='function'&&typeof capi.refreshChecklisteVorlageFromApi==='function'){
    if(typeof window!=='undefined')window.__CL_SKIP_VORLAGEN_SAVE_ONCE=true;
    var roA=roNum(a,idx), roB=roNum(b,ni);
    console.log('[CL-PUNKT PATCH]',{checklisteId:cid,eintragId:eidA,patch:{reihenfolge:roB}});
    console.log('[CL-PUNKT PATCH]',{checklisteId:cid,eintragId:eidB,patch:{reihenfolge:roA}});
    capi.putChecklisteEintragFromApi(eidA,{reihenfolge:roB},toastFn).then(function(err){
      if(err){console.warn('[CL-PUNKT FEHLER]',err);return err;}
      return capi.putChecklisteEintragFromApi(eidB,{reihenfolge:roA},toastFn);
    }).then(function(err){
      if(err){console.warn('[CL-PUNKT FEHLER]',err);return;}
      return capi.refreshChecklisteVorlageFromApi(cid,toastFn).then(function(){
        renderChecklisten();
        clOpenVorlage(vorlageId);
      });
    });
    return;
  }
  var tmp=v.punkte[idx]; v.punkte[idx]=v.punkte[ni]; v.punkte[ni]=tmp;
  clOpenVorlage(vorlageId);
}

function clToggleAktiv(id){
  const v=window.CL_VORLAGEN.find(x=>x.id===id); if(!v) return;
  v.aktiv=!v.aktiv;
  renderChecklisten();
  clOpenVorlage(id);
  showToast(v.aktiv?'▶ "'+v.name+'" aktiviert':'⏸ "'+v.name+'" deaktiviert');
}

function clDuplizieren(id){
  const v=window.CL_VORLAGEN.find(x=>x.id===id); if(!v) return;
  const copy=JSON.parse(JSON.stringify(v));
  copy.id='cl-'+Date.now();
  copy.name=copy.name+' (Kopie)';
  window.CL_VORLAGEN.push(copy);
  renderChecklisten();
  clOpenVorlage(copy.id);
  showToast('⎘ Kopie von "'+v.name+'" erstellt');
}

function clBearbeiten(id){
  const v=window.CL_VORLAGEN.find(x=>x.id===id); if(!v) return;
  var ov=document.getElementById('cl-edit-ov');
  if(!ov){
    ov=document.createElement('div');
    ov.id='cl-edit-ov';
    ov.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:500;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    ov.onclick=function(e){if(e.target===ov)ov.style.display='none';};
    document.body.appendChild(ov);
  }
  ov.innerHTML=
    '<div style="background:#fff;border-radius:12px;width:480px;box-shadow:0 20px 60px rgba(0,0,0,.2);">'
      +'<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
        +'<div style="font-size:14px;font-weight:700;">✏ Vorlage bearbeiten</div>'
        +'<button onclick="document.getElementById(\'cl-edit-ov\').style.display=\'none\'" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text2);">×</button>'
      +'</div>'
      +'<div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px;">'
        +'<div class="fg">'
          +'<label class="fl">Name</label>'
          +'<input id="cl-edit-name" class="fi" value="'+v.name.replace(/"/g,'&quot;')+'">'
        +'</div>'
        +'<div class="fg">'
          +'<label class="fl">Beschreibung</label>'
          +'<textarea id="cl-edit-beschr" class="fta" style="min-height:70px;">'+v.beschr+'</textarea>'
        +'</div>'
      +'</div>'
      +'<div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;">'
        +'<button class="btn" onclick="document.getElementById(\'cl-edit-ov\').style.display=\'none\'">Abbrechen</button>'
        +'<button class="btn p" onclick="clSaveBearbeiten(\''+id+'\')">💾 Speichern</button>'
      +'</div>'
    +'</div>';
  ov.style.display='flex';
  setTimeout(function(){ var i=document.getElementById('cl-edit-name'); if(i){ i.focus(); i.select(); }},80);
}

function clSaveBearbeiten(id){
  const v=window.CL_VORLAGEN.find(x=>x.id===id); if(!v) return;
  const name=(document.getElementById('cl-edit-name')?.value||'').trim();
  if(!name){ showToast('⚠ Name darf nicht leer sein'); return; }
  v.name   = name;
  v.beschr = document.getElementById('cl-edit-beschr')?.value||'';
  document.getElementById('cl-edit-ov').style.display='none';
  renderChecklisten();
  clOpenVorlage(id);
  showToast('✓ Vorlage aktualisiert');
}

// ── Checkliste drucken ──────────────────────────────────────────
function clDrucken(id){
  const v=window.CL_VORLAGEN.find(x=>x.id===id); if(!v) return;
  const today=new Date().toLocaleDateString('de-DE');
  const katIco={pflicht:'☐',optional:'○',foto:'📷'};
  const katLabel={pflicht:'Pflicht',optional:'Optional',foto:'Foto erforderlich'};
  var html='<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">'
    +'<title>'+v.name+'</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0;}'
    +'body{font-family:Arial,sans-serif;padding:28px 32px;max-width:720px;margin:0 auto;color:#111;font-size:13px;}'
    +'.header{border-bottom:2.5px solid #111;padding-bottom:10px;margin-bottom:16px;}'
    +'h1{font-size:17px;font-weight:700;margin-bottom:3px;}'
    +'.meta{font-size:11px;color:#666;}'
    +'.info-row{display:flex;gap:24px;margin-bottom:20px;padding:8px 10px;background:#f5f5f5;border-radius:4px;}'
    +'.info-row span{font-size:11px;color:#444;}  .info-row strong{display:block;font-size:13px;}'
    +'.punkt{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #e5e5e5;align-items:flex-start;}'
    +'.nr{font-size:10px;color:#aaa;width:20px;flex-shrink:0;padding-top:3px;text-align:right;}'
    +'.box{width:15px;height:15px;border:1.5px solid #333;flex-shrink:0;margin-top:2px;border-radius:2px;}'
    +'.kat-foto .box{border-color:#9C27B0;}'
    +'.kat-optional .box{border-color:#aaa;border-style:dashed;}'
    +'.content{flex:1;}'
    +'.ptxt{font-size:12.5px;font-weight:500;line-height:1.4;}'
    +'.hint{font-size:10.5px;color:#777;margin-top:2px;}'
    +'.kat-tag{font-size:9px;background:#eee;padding:1px 5px;border-radius:3px;color:#666;margin-left:6px;vertical-align:middle;}'
    +'.footer{margin-top:28px;padding-top:12px;border-top:1.5px solid #ccc;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}'
    +'.footer-field{border-bottom:1px solid #333;padding-bottom:16px;}'
    +'.footer-label{font-size:10px;color:#888;margin-top:4px;}'
    +'@media print{body{padding:16px;}.info-row{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#f5f5f5!important;}}'
    +'</style></head><body>'
    +'<div class="header">'
      +'<h1>'+v.ico+' '+v.name+'</h1>'
      +'<div class="meta">CC Werbung GmbH · '+v.beschr+'</div>'
    +'</div>'
    +'<div class="info-row">'
      +'<span><strong>__________________________</strong>Auftragsnummer</span>'
      +'<span><strong>__________________________</strong>Fahrzeug / Depot</span>'
      +'<span><strong>'+today+'</strong>Druckdatum</span>'
    +'</div>'
    +(Array.isArray(v.punkte)?v.punkte:[]).map(function(p,i){
      return '<div class="punkt kat-'+p.kat+'">'
        +'<div class="nr">'+(i+1)+'</div>'
        +'<div class="box"></div>'
        +'<div class="content">'
          +'<div class="ptxt">'+p.text
            +(p.kat!=='pflicht'?'<span class="kat-tag">'+katLabel[p.kat]+'</span>':'')
          +'</div>'
          +(p.hinweis?'<div class="hint">'+p.hinweis+'</div>':'')
        +'</div>'
      +'</div>';
    }).join('')
    +'<div class="footer">'
      +'<div class="footer-field"><div class="footer-label">Mitarbeiter</div></div>'
      +'<div class="footer-field"><div class="footer-label">Datum / Uhrzeit</div></div>'
      +'<div class="footer-field"><div class="footer-label">Unterschrift</div></div>'
    +'</div>'
    +'<script>window.onload=function(){window.print();}<\/script>'
    +'</body></html>';
  var w=window.open('','_blank','width=780,height=1000');
  if(w){ w.document.write(html); w.document.close(); }
}

// Kanban
// ── WORKFLOW KANBAN ──────────────────────────────
const STEPS = ['grafik','druck','laminat','montage','doku','abgeschlossen'];
// STEP_LABELS — einzige Farbquelle für alle Schritte systemweit
// Alle Ansichten (Kanban, Aufträge-Tabelle, Badges, Kalender) lesen hier.
// Farben NIE anderswo hart kodieren.
const STEP_LABELS = {
  grafik:        {title:'Grafik / Entwurf',  col:'#1565C0', next:'druck',         nextLabel:'Druck / Plot',      nextWer:'Selim'},
  druck:         {title:'Druck / Plot',       col:'#4527A0', next:'laminat',       nextLabel:'Laminat / Schnitt', nextWer:'Selim'},
  laminat:       {title:'Laminat / Schnitt',  col:'#2E7D32', next:'montage',       nextLabel:'Montage',           nextWer:'Okan'},
  montage:       {title:'Montage',            col:'#E65100', next:'doku',          nextLabel:'Dokumentation',     nextWer:'Okan'},
  doku:          {title:'Dokumentation',      col:'#7C3AED', next:'abgeschlossen', nextLabel:'Abgeschlossen',     nextWer:'Celal'},
  abgeschlossen: {title:'Abgeschlossen ✓',   col:'#2E7D32', next:null,            nextLabel:null,                nextWer:null},
};
const RE_STATUS_LABELS = {offen:'Rechnung offen',geschrieben:'Rechnung geschrieben',bezahlt:'Bezahlt ✓'};

if (typeof window !== 'undefined' && !Array.isArray(window.AUFTRAEGE)) window.AUFTRAEGE = [];
var AUFTRAEGE =
  typeof window !== 'undefined' && Array.isArray(window.AUFTRAEGE) ? window.AUFTRAEGE : [];
/* Legacy-Demoaufträge deaktiviert (CC Intern zeigt nur API-Daten)
[
  {
    id:'AU-2026-041', kunde:'Radio Essen', fz:'Bus 1789', paket:'Seitenwand + Heck',
    terminDatum:'2026-03-18', montageDatum:'2026-03-18', montageZeit:'07:00', liefertermin:'2026-03-18', depot:'Depot Essen Stadtmitte',
    step:'montage', urgent:false, rechnung:'offen', fotos:[], zeiten:[
      {step:'grafik',wer:'Melanie',maId:'ME',start:'15.03 07:30',end:'15.03 10:00',dauer:150},
      {step:'druck',wer:'Mohammed',maId:'MO',start:'17.03 11:00',end:'17.03 14:00',dauer:180},
      {step:'laminat',wer:'Selim',maId:'SE',start:'18.03 07:00',end:'18.03 09:00',dauer:120},
    ],
    schritte:{
      grafik:  {typ:'single',  verantwortlicher:'ME',verantwortlicherName:'Melanie', zusatzMa:[],zusatzMaNames:[], maIds:['ME'],maId:'ME',wer:'Melanie',dauer:0,status:'abgeschlossen',fertig:true,zeit:'15.03 10:00',checkliste:[],fotos:[],fotosErforderlich:false},
      druck:   {typ:'optional',verantwortlicher:'MO',verantwortlicherName:'Mohammed',zusatzMa:[],zusatzMaNames:[],maIds:['MO'],maId:'MO',wer:'Mohammed',dauer:0,status:'abgeschlossen',fertig:true,zeit:'17.03 14:00',checkliste:[],fotos:[],fotosErforderlich:false},
      laminat: {typ:'optional',verantwortlicher:'SE',verantwortlicherName:'Selim',  zusatzMa:[],zusatzMaNames:[],maIds:['SE'],maId:'SE',wer:'Selim',dauer:0,status:'abgeschlossen',fertig:true,zeit:'18.03 09:00',checkliste:[],fotos:[],fotosErforderlich:false},
      montage: {typ:'multi',   verantwortlicher:'OK',verantwortlicherName:'Okan',   zusatzMa:[],zusatzMaNames:[],maIds:['OK'],maId:'OK',wer:'Okan',dauer:8,status:'in_bearbeitung',fertig:false,zeit:null,checkliste:[{text:'Material und Auftrag geprüft und bestätigt',kat:'pflicht',hinweis:'Auftragsnummer, Menge und Material vor Ort bestätigen',quelle:'Montage Busbeklebung',erledigt:false},{text:'Werkzeuge vollständig (Rakel, Messer, Heißluft, Leiter)',kat:'pflicht',hinweis:'Alle Werkzeuge vor Fahrt prüfen',quelle:'Montage Busbeklebung',erledigt:false},{text:'Fahrzeugdaten geprüft (Busnummer / Typ / Seiten)',kat:'pflicht',hinweis:'Stimmt der Bus mit dem Auftrag überein?',quelle:'Montage Busbeklebung',erledigt:false},{text:'Vorschäden dokumentiert (Fotos gemacht)',kat:'foto',hinweis:'Pflichtfotos aller Vorschäden vor Montagestart',quelle:'Montage Busbeklebung',erledigt:false},{text:'Fahrzeug grob gereinigt',kat:'pflicht',hinweis:'Staub, Schmutz und lose Partikel entfernen',quelle:'Montage Busbeklebung',erledigt:false},{text:'Oberfläche entfettet (IPA)',kat:'pflicht',hinweis:'IPA 70% vollflächig auf alle Montagebereiche',quelle:'Montage Busbeklebung',erledigt:false},{text:'Drucke vollständig eingepackt / vorhanden',kat:'pflicht',hinweis:'Alle Bahnen, Sektionen und Folienrollen prüfen',quelle:'Montage Busbeklebung',erledigt:false},{text:'Bauteile geprüft (alle Teile vorhanden und beschriftet)',kat:'pflicht',hinweis:'Beschriftung mit Auftragsplan abgleichen',quelle:'Montage Busbeklebung',erledigt:false},{text:'Montageplan klar (Reihenfolge / Aufteilung)',kat:'pflicht',hinweis:'Welche Seite zuerst? Reihenfolge mit Team besprechen',quelle:'Montage Busbeklebung',erledigt:false},{text:'Bezugspunkte festgelegt (gerade Ausrichtung)',kat:'pflicht',hinweis:'Horizontale und vertikale Referenzlinien markieren',quelle:'Montage Busbeklebung',erledigt:false},{text:'Fensterfolie (OWV) zuerst montiert (Sichtseite beachten!)',kat:'pflicht',hinweis:'Sichtseite nach außen — Druckseite nach innen',quelle:'Montage Busbeklebung',erledigt:false},{text:'Folie korrekt positioniert (keine Schiefstellung)',kat:'pflicht',hinweis:'Ausrichtung vor endgültigem Verkleben prüfen',quelle:'Montage Busbeklebung',erledigt:false},{text:'Schrittweise verklebt (keine Spannung / keine Überdehnung)',kat:'pflicht',hinweis:'Von der Mitte nach außen rakeln',quelle:'Montage Busbeklebung',erledigt:false},{text:'Luftblasen sauber ausgerakelt',kat:'pflicht',hinweis:'Kleinstblasen mit Nadel stechen falls nötig',quelle:'Montage Busbeklebung',erledigt:false},{text:'Überlappungen korrekt gesetzt',kat:'pflicht',hinweis:'Mind. 5mm Überlapp, Richtung immer gleich',quelle:'Montage Busbeklebung',erledigt:false},{text:'Türbereiche sauber geschnitten (Spaltmaß beachten)',kat:'pflicht',hinweis:'Schnittiefe: nur Folie, nicht Lack',quelle:'Montage Busbeklebung',erledigt:false},{text:'Gummis und Dichtungen sauber verarbeitet',kat:'pflicht',hinweis:'Folie unter Gummi schieben oder sauber einschneiden',quelle:'Montage Busbeklebung',erledigt:false},{text:'Kameras, Sensoren und Displays freigelassen',kat:'pflicht',hinweis:'Keine Folie über Sensorik oder Kameras',quelle:'Montage Busbeklebung',erledigt:false},{text:'Lüftungsgitter NICHT beklebt',kat:'pflicht',hinweis:'Luftzirkulation muss gewährleistet bleiben',quelle:'Montage Busbeklebung',erledigt:false},{text:'Kanten sauber nachgeschnitten',kat:'pflicht',hinweis:'Alle überstehenden Folienränder entfernen',quelle:'Montage Busbeklebung',erledigt:false},{text:'Kanten mit Heißluft nachversiegelt (Post-Heaten!)',kat:'pflicht',hinweis:'Alle Kanten und Übergänge heiß nachversiegeln — PFLICHT',quelle:'Montage Busbeklebung',erledigt:false},{text:'Folienübergänge geprüft',kat:'pflicht',hinweis:'Keine Ablösung, keine Falten an Übergängen',quelle:'Montage Busbeklebung',erledigt:false},{text:'Piktogramme und Hinweise freigelegt',kat:'pflicht',hinweis:'Hebezeichen, Luftmenge, Batterieanzeige, Fahrzeugnummer',quelle:'Montage Busbeklebung',erledigt:false},{text:'Fahrzeug gereinigt (keine Klebereste / Fingerabdrücke)',kat:'pflicht',hinweis:'Oberfläche mit sauberem Mikrofasertuch nachpolieren',quelle:'Montage Busbeklebung',erledigt:false},{text:'Vorher-Fotos vorhanden (inkl. Vorschäden)',kat:'foto',hinweis:'Vor Montagestart: alle Seiten + Vorschäden',quelle:'Montage Busbeklebung',erledigt:false},{text:'Nachher-Fotos komplett (alle Seiten)',kat:'foto',hinweis:'Mindestens 4 Seiten nach Fertigstellung',quelle:'Montage Busbeklebung',erledigt:false},{text:'Detailfotos (Kanten, Übergänge, kritische Stellen)',kat:'foto',hinweis:'Türkanten, Dachkanten, Übergänge fotografieren',quelle:'Montage Busbeklebung',erledigt:false},{text:'Abschlussfoto Gesamtansicht',kat:'foto',hinweis:'1 vollständiges Rundum-Foto des fertigen Fahrzeugs',quelle:'Montage Busbeklebung',erledigt:false},{text:'Vorschäden-Foto vor Montage hochgeladen',kat:'pflicht',hinweis:'In CC Intern unter Fotos hochladen — PFLICHT VOR START',quelle:'Montage Busbeklebung',erledigt:false},{text:'Post-Heaten durchgeführt und bestätigt',kat:'pflicht',hinweis:'Alle Kanten wurden heiß nachversiegelt',quelle:'Montage Busbeklebung',erledigt:false},{text:'Abschlussfotos vollständig hochgeladen',kat:'pflicht',hinweis:'Alle Seiten und Detailfotos in CC Intern',quelle:'Montage Busbeklebung',erledigt:false},{text:'Qualitätskontrolle durchgeführt',kat:'pflicht',hinweis:'Gesamtbild aus 5m Abstand — keine Fehler sichtbar?',quelle:'Montage Busbeklebung',erledigt:false},{text:'Abnahmeprotokoll digital unterschrieben',kat:'pflicht',hinweis:'Digitale Unterschrift in CC Intern oder per E-Mail',quelle:'Montage Busbeklebung',erledigt:false},{text:'Kunde informiert (Fertigmeldung)',kat:'pflicht',hinweis:'Telefonisch oder per WhatsApp — Übergabezeitpunkt',quelle:'Montage Busbeklebung',erledigt:false},{text:'Startzeit erfasst',kat:'pflicht',hinweis:'In CC Intern Zeiterfassung: Montage starten',quelle:'Montage Busbeklebung',erledigt:false},{text:'Endzeit erfasst',kat:'pflicht',hinweis:'In CC Intern Zeiterfassung: Montage stoppen',quelle:'Montage Busbeklebung',erledigt:false}],fotos:[],fotosErforderlich:true},
      doku:    {typ:'single',  verantwortlicher:'OK',verantwortlicherName:'Okan',   zusatzMa:[],zusatzMaNames:[],maIds:['OK'],maId:'OK',wer:'Okan',dauer:1,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:true},
      abgeschlossen:{wer:null,maId:null,dauer:0,fertig:false,zeit:null}
    },
    // ── PRODUKTIONSDOKUMENTATION ──
    prod:{
      // PLANUNG (bei Auftragsanlage / nach Freigabe)
      planung:{
        folienhersteller:'Orafol',
        folientyp:'Digitaldruckfolie gegossen',
        produktname:'ORAJET® 3551GRA-101 white GLOSSY',
        farbnummer:'RAL 9016 / Kundenfreigabe 15.03',
        druckmaterial:'ORAJET® 3551 137cm',
        laminat:'ORAGUARD® 215G GLOSSY 137cm',
        maschine:'HP Latex 560',
        verarbeitungstyp:'Nassmontage / Luftkanal',
        flaeche:'18.5',
        stueck:'1',
        notiz:'Roter Randstreifen Pantone 485C',
      },
      // TATSÄCHLICH VERWENDET (von Produktion bestätigt)
      produktion:{
        folie:'ORAJET® 3551GRA-101 GLOSSY 137cm',
        farbe:'RAL 9016 / Pantone 485C bestätigt',
        druckmaterial:'ORAJET® 3551 137cm — Charge #2403',
        laminat:'ORAGUARD® 215G GLOSSY 137cm',
        maschine:'HP Latex 560',
        druckdatum:'17.03.2026',
        mitarbeiter:'Mohammed, Selim',
        abweichung:'Keine Abweichung von Planung',
        bestaetigt:true,
        bestaetigtVon:'Selim',
        bestaetigtAm:'18.03.2026 09:00',
      },
      // TEMPLATE / SCAN
      template:{
        typ:'Vorhandene Vorlage',
        version:'Bus 1789 v2.1',
        datei:'Bus1789_Template_v21.cdr',
        scan:'Nein',
      },
      // DATEIEN
      dateien:[
        {name:'Radio_Essen_Bus1789_Entwurf.pdf',typ:'Entwurf',datum:'12.03.2026',von:'Melanie'},
        {name:'Radio_Essen_Bus1789_Druckdatei.pdf',typ:'Druckdatei',datum:'16.03.2026',von:'Melanie'},
        {name:'Kundenfreigabe_RadioEssen_15_03.pdf',typ:'Freigabe',datum:'15.03.2026',von:'Melanie'},
        {name:'Bus1789_Template_v21.cdr',typ:'Template/Vorlage',datum:'10.03.2026',von:'Ilayda'},
      ],
    }
  },
  {
    id:'AU-2026-040', kunde:'DVG Duisburg', fz:'Bus 412', paket:'Ganzgestaltung + Fenster',
    leistungId:'fahrzeug', produktId:'bus_voll',
    terminDatum:'2026-03-20', montageDatum:'2026-03-24', montageZeit:'07:00', liefertermin:'2026-03-25', depot:'Depot Mülheim',
    step:'druck', urgent:true, rechnung:'offen', fotos:[], zeiten:[
      {step:'grafik',wer:'Ilayda',maId:'IL',start:'16.03 08:00',end:'16.03 11:00',dauer:180},
    ],
    schritte:{
      grafik:  {typ:'single',  verantwortlicher:'IL',verantwortlicherName:'Ilayda', zusatzMa:[],zusatzMaNames:[],maIds:['IL'],maId:'IL',wer:'Ilayda',dauer:0,status:'abgeschlossen',fertig:true,zeit:'16.03 11:00',checkliste:[],fotos:[],fotosErforderlich:false},
      druck:   {typ:'optional',verantwortlicher:'SE',verantwortlicherName:'Selim',  zusatzMa:[],zusatzMaNames:[],maIds:['SE'],maId:'SE',wer:'Selim',dauer:6,status:'in_bearbeitung',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:false},
      laminat: {typ:'optional',verantwortlicher:'SE',verantwortlicherName:'Selim',  zusatzMa:[],zusatzMaNames:[],maIds:['SE'],maId:'SE',wer:'Selim',dauer:4,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:false},
      montage: {typ:'multi',   verantwortlicher:'OK',verantwortlicherName:'Okan',   zusatzMa:['MT'],zusatzMaNames:['Mete'],maIds:['OK','MT'],maId:'OK',wer:'Okan + Mete',dauer:10,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:true},
      doku:    {typ:'single',  verantwortlicher:'OK',verantwortlicherName:'Okan',   zusatzMa:[],zusatzMaNames:[],maIds:['OK'],maId:'OK',wer:'Okan',dauer:1,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:true},
      abgeschlossen:{wer:null,maId:null,dauer:0,fertig:false,zeit:null}
    },
    prod:{
      planung:{
        folienhersteller:'Orafol',
        folientyp:'Digitaldruckfolie gegossen',
        produktname:'ORAJET® 3551GRA-101 white GLOSSY',
        farbnummer:'DVG Hausfarbe Blau / NCS S5540-R80B',
        druckmaterial:'ORAJET® 3551 137cm',
        laminat:'ORAGUARD® 215M MATT 105cm',
        maschine:'HP Latex 560',
        verarbeitungstyp:'Trockenverlegung + Fensterfolie perforiert',
        flaeche:'42.0',
        stueck:'1',
        notiz:'Fensterfolie 50/50 perforiert für Fahrgastbereich',
      },
      produktion:{bestaetigt:false},
      template:{typ:'Selbst erstellt',version:'Bus 412 DVG v1.0',datei:'',scan:'3D-Scan ausstehend'},
      dateien:[
        {name:'DVG_Bus412_Layout_v2.pdf',typ:'Entwurf',datum:'15.03.2026',von:'Ilayda'},
      ],
    }
  },
  {
    id:'AU-2026-039', kunde:'Bogestra AG', fz:'Bus 309, 501', paket:'Teilgestaltung',
    leistungId:'fahrzeug', produktId:'bus_teil',
    terminDatum:'2026-03-21', montageDatum:'2026-03-26', montageZeit:'06:30', liefertermin:'2026-03-27', depot:'Depot Mülheim',
    step:'laminat', urgent:false, rechnung:'offen', fotos:[], zeiten:[
      {step:'grafik',wer:'Melanie',maId:'ME',start:'14.03 07:00',end:'14.03 09:00',dauer:120},
      {step:'druck',wer:'Selim',maId:'SE',start:'16.03 13:00',end:'16.03 15:00',dauer:120},
    ],
    schritte:{
      grafik:  {typ:'single',  verantwortlicher:'ME',verantwortlicherName:'Melanie', zusatzMa:[],zusatzMaNames:[],maIds:['ME'],maId:'ME',wer:'Melanie',dauer:0,status:'abgeschlossen',fertig:true,zeit:'14.03 09:00',checkliste:[],fotos:[],fotosErforderlich:false},
      druck:   {typ:'optional',verantwortlicher:'SE',verantwortlicherName:'Selim',  zusatzMa:[],zusatzMaNames:[],maIds:['SE'],maId:'SE',wer:'Selim',dauer:0,status:'abgeschlossen',fertig:true,zeit:'16.03 15:00',checkliste:[],fotos:[],fotosErforderlich:false},
      laminat: {typ:'optional',verantwortlicher:'SE',verantwortlicherName:'Selim',  zusatzMa:[],zusatzMaNames:[],maIds:['SE'],maId:'SE',wer:'Selim',dauer:4,status:'in_bearbeitung',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:false},
      montage: {typ:'multi',   verantwortlicher:'MO',verantwortlicherName:'Mohammed',zusatzMa:[],zusatzMaNames:[],maIds:['MO'],maId:'MO',wer:'Mohammed',dauer:6,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:true},
      doku:    {typ:'single',  verantwortlicher:'MO',verantwortlicherName:'Mohammed',zusatzMa:[],zusatzMaNames:[],maIds:['MO'],maId:'MO',wer:'Mohammed',dauer:1,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:true},
      abgeschlossen:{wer:null,maId:null,dauer:0,fertig:false,zeit:null}
    },
    prod:{
      planung:{
        folienhersteller:'Avery Dennison',
        folientyp:'Hochleistungsfolie luftkanalfrei',
        produktname:'Avery MPI 1105 EA RS white GLOSSY 137cm',
        farbnummer:'Bogestra Grün / Pantone 376C',
        druckmaterial:'Avery MPI 1105 EA RS 137cm',
        laminat:'Avery DOL 1460Z GLOSSY 137cm',
        maschine:'HP Latex 560',
        verarbeitungstyp:'Trockenverlegung',
        flaeche:'12.5',
        stueck:'2',
        notiz:'2 Fahrzeuge identisch, Teilgestaltung Seitenwand',
      },
      produktion:{bestaetigt:false},
      template:{typ:'Vorhandene Vorlage',version:'Bogestra Standard v3',datei:'Bogestra_Template_v3.cdr',scan:'Nein'},
      dateien:[
        {name:'Bogestra_Teilgestaltung_v1.pdf',typ:'Entwurf',datum:'13.03.2026',von:'Melanie'},
      ],
    }
  },
  {
    id:'AU-2026-038', kunde:'Stadt Essen', fz:'Tram 103', paket:'Traffic Board',
    leistungId:'fahrzeug', produktId:'bahn_innen',
    terminDatum:'2026-03-25', liefertermin:'2026-03-25', depot:'Stadtmitte',
    step:'grafik', urgent:false, rechnung:'offen', fotos:[], zeiten:[],
    schritte:{
      grafik:  {typ:'optional',verantwortlicher:'IL',verantwortlicherName:'Ilayda', zusatzMa:[],zusatzMaNames:[],maIds:['IL'],maId:'IL',wer:'Ilayda',dauer:2,status:'in_bearbeitung',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:false},
      druck:   {typ:'optional',verantwortlicher:'SE',verantwortlicherName:'Selim',  zusatzMa:[],zusatzMaNames:[],maIds:['SE'],maId:'SE',wer:'Selim',dauer:3,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:false},
      laminat: {typ:'optional',verantwortlicher:'SE',verantwortlicherName:'Selim',  zusatzMa:[],zusatzMaNames:[],maIds:['SE'],maId:'SE',wer:'Selim',dauer:2,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:false},
      montage: {typ:'multi',   verantwortlicher:'OK',verantwortlicherName:'Okan',   zusatzMa:[],zusatzMaNames:[],maIds:['OK'],maId:'OK',wer:'Okan',dauer:4,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:true},
      doku:    {typ:'single',  verantwortlicher:'OK',verantwortlicherName:'Okan',   zusatzMa:[],zusatzMaNames:[],maIds:['OK'],maId:'OK',wer:'Okan',dauer:0.5,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:true},
      abgeschlossen:{wer:null,maId:null,dauer:0,fertig:false,zeit:null}
    },
    prod:{
      planung:{
        folienhersteller:'',folientyp:'',produktname:'',farbnummer:'',
        druckmaterial:'',laminat:'',maschine:'HP 800',
        verarbeitungstyp:'Traffic Board',flaeche:'2.0',stueck:'1',notiz:'',
      },
      produktion:{bestaetigt:false},
      template:{typ:'',version:'',datei:'',scan:''},
      dateien:[],
    }
  },
  {
    id:'AU-2026-037', kunde:'NRZ', fz:'Bus 501', paket:'Heckwerbung',
    leistungId:'fahrzeug', produktId:'bus_heck',
    terminDatum:'2026-03-26', montageDatum:'2026-03-28', montageZeit:'08:00', liefertermin:'2026-03-28', depot:'Depot Essen Stadtmitte',
    step:'grafik', urgent:false, rechnung:'offen', fotos:[], zeiten:[],
    schritte:{
      grafik:  {typ:'optional',verantwortlicher:'ME',verantwortlicherName:'Melanie',zusatzMa:[],zusatzMaNames:[],maIds:['ME'],maId:'ME',wer:'Melanie',dauer:2,status:'in_bearbeitung',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:false},
      druck:   {typ:'optional',verantwortlicher:'MO',verantwortlicherName:'Mohammed',zusatzMa:[],zusatzMaNames:[],maIds:['MO'],maId:'MO',wer:'Mohammed',dauer:2,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:false},
      laminat: {typ:'optional',verantwortlicher:'SE',verantwortlicherName:'Selim',  zusatzMa:[],zusatzMaNames:[],maIds:['SE'],maId:'SE',wer:'Selim',dauer:1,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:false},
      montage: {typ:'multi',   verantwortlicher:'MT',verantwortlicherName:'Mete',   zusatzMa:[],zusatzMaNames:[],maIds:['MT'],maId:'MT',wer:'Mete',dauer:3,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:true},
      doku:    {typ:'single',  verantwortlicher:'MT',verantwortlicherName:'Mete',   zusatzMa:[],zusatzMaNames:[],maIds:['MT'],maId:'MT',wer:'Mete',dauer:0.5,status:'offen',fertig:false,zeit:null,checkliste:[],fotos:[],fotosErforderlich:true},
      abgeschlossen:{wer:null,maId:null,dauer:0,fertig:false,zeit:null}
    },
    prod:{
      planung:{folienhersteller:'',folientyp:'',produktname:'',farbnummer:'',druckmaterial:'',laminat:'',maschine:'',verarbeitungstyp:'',flaeche:'',stueck:'',notiz:''},
      produktion:{bestaetigt:false},
      template:{typ:'',version:'',datei:'',scan:''},
      dateien:[],
    }
  },
  {
    id:'AU-2026-036', kunde:'Sparkasse Essen', fz:'5 Busse', paket:'Heckwerbung',
    leistungId:'fahrzeug', produktId:'bus_heck',
    terminDatum:'2026-03-15', liefertermin:'2026-03-15', depot:'Mülheim',
    step:'abgeschlossen', urgent:false, rechnung:'offen', fotos:['foto1.jpg','foto2.jpg'],
    zeiten:[
      {step:'grafik',wer:'Melanie',maId:'ME',start:'10.03 07:00',end:'10.03 09:30',dauer:150},
      {step:'druck',wer:'Mohammed',maId:'MO',start:'12.03 08:00',end:'12.03 11:00',dauer:180},
      {step:'laminat',wer:'Selim',maId:'SE',start:'13.03 07:00',end:'13.03 08:30',dauer:90},
      {step:'montage',wer:'Okan',maId:'OK',start:'15.03 06:30',end:'15.03 12:00',dauer:330},
      {step:'doku',wer:'Okan',maId:'OK',start:'15.03 12:00',end:'15.03 12:30',dauer:30},
    ],
    schritte:{
      grafik:{wer:'Melanie',fertig:true,zeit:'10.03'},
      druck:{wer:'Mohammed',fertig:true,zeit:'12.03'},
      laminat:{wer:'Selim',fertig:true,zeit:'13.03'},
      montage:{wer:'Okan',fertig:true,zeit:'15.03'},
      doku:{wer:'Okan',fertig:true,zeit:'15.03 17:30'},
      abgeschlossen:{wer:'Celal',fertig:true,zeit:'15.03 18:00'}
    },
    prod:{
      planung:{
        folienhersteller:'Orafol',
        folientyp:'Digitaldruckfolie gegossen',
        produktname:'ORAJET® 3551GRA-101 white GLOSSY',
        farbnummer:'Sparkasse Rot / Pantone 485C',
        druckmaterial:'ORAJET® 3551 137cm',
        laminat:'ORAGUARD® 215G GLOSSY 137cm',
        maschine:'HP Latex 560',
        verarbeitungstyp:'Nassmontage',
        flaeche:'8.4',
        stueck:'5',
        notiz:'5 identische Heckbeklebungen',
      },
      produktion:{
        folie:'ORAJET® 3551GRA-101 GLOSSY 137cm — Charge #2401',
        farbe:'Pantone 485C bestätigt — Delta E 0.8',
        druckmaterial:'ORAJET® 3551 137cm',
        laminat:'ORAGUARD® 215G GLOSSY 137cm',
        maschine:'HP Latex 560',
        druckdatum:'12.03.2026',
        mitarbeiter:'Mohammed, Selim, Okan',
        abweichung:'Keine',
        bestaetigt:true,
        bestaetigtVon:'Selim',
        bestaetigtAm:'13.03.2026 08:30',
      },
      template:{typ:'Vorhandene Vorlage',version:'Sparkasse Heck v2',datei:'Sparkasse_Heck_v2.cdr',scan:'Nein'},
      dateien:[
        {name:'Sparkasse_Heck_Entwurf.pdf',typ:'Entwurf',datum:'08.03.2026',von:'Melanie'},
        {name:'Sparkasse_Heck_Druckdatei.pdf',typ:'Druckdatei',datum:'11.03.2026',von:'Melanie'},
        {name:'Freigabe_Sparkasse_10_03.pdf',typ:'Freigabe',datum:'10.03.2026',von:'Celal'},
        {name:'Sparkasse_Heck_v2.cdr',typ:'Template/Vorlage',datum:'08.03.2026',von:'Ilayda'},
        {name:'Montage_Fotos_Sparkasse.zip',typ:'Montagefotos',datum:'15.03.2026',von:'Okan'},
      ],
    }
  },
];
*/
window.AUFTRAEGE = AUFTRAEGE;
window._AUFTRAEGE_CANON = AUFTRAEGE;

/** Echte User-UUID (Kürzel wie OK/ME ausgeschlossen) — Abgleich mit / users & MA_DATA. */
function ccInternIsLikelyUserUuid(s) {
  if (s == null || s === '') return false;
  var t = String(s).trim();
  if (t.length < 32) return false;
  return /^[0-9a-f]{8}-[0-9a-f-]{3,}/i.test(t) || t.length === 32;
}

/** Anzeigename: primär COCKPIT_USERS (/users), sonst MA_DATA / __MA_DATA_LIVE. */
function ccInternNameFuerUserUuid(maUuid) {
  if (maUuid == null) return '—';
  var su = String(maUuid);
  var u, m, i;
  if (window.COCKPIT_USERS && Array.isArray(window.COCKPIT_USERS)) {
    for (i = 0; i < window.COCKPIT_USERS.length; i++) {
      u = window.COCKPIT_USERS[i];
      if (u && u.id != null && String(u.id) === su) {
        if (u.name != null && String(u.name).trim() !== '') return String(u.name).trim();
        if (u.email != null && String(u.email).indexOf('@') > 0) return String(u.email).split('@')[0];
        return 'User';
      }
    }
  }
  var list = window.CCIntern && Array.isArray(window.CCIntern.__MA_DATA_LIVE) && window.CCIntern.__MA_DATA_LIVE.length
    ? window.CCIntern.__MA_DATA_LIVE
    : typeof MA_DATA !== 'undefined' && Array.isArray(MA_DATA) ? MA_DATA : [];
  for (i = 0; i < list.length; i++) {
    m = list[i];
    if (!m) continue;
    if (String(m.maId) === su || (m.id != null && String(m.id) === su)) {
      if (m.n != null && String(m.n).trim() !== '') return String(m.n).trim();
      if (m.name != null && String(m.name).trim() !== '') return String(m.name).trim();
      return 'Mitarbeiter';
    }
  }
  return su.length > 10 ? su.slice(0, 8) + '…' : su;
}

/**
 * Gleiche Aggregationslogik wie ehem. „AKTUELLE AUFGABEN PRO MITARBEITER“ (nur Daten, keine Liste oben).
 * @returns {{ byMa: Object, uuids: string[] }}
 */
function ccInternAggregiereAktuelleAufgabenProMa() {
  var byMa = {};
  if (typeof AUFTRAEGE === 'undefined' || !Array.isArray(AUFTRAEGE)) {
    return { byMa: byMa, uuids: [] };
  }
  AUFTRAEGE.forEach(function (a) {
    if (!a || a.archiv) return;
    if (!a.step || a.step === 'abgeschlossen') return;
    var stepObj = a.schritte && a.schritte[a.step];
    if (!stepObj) return;
    var slRow = STEP_LABELS[a.step];
    var bucketKeys =
      typeof ccInternSchrittListeMitarbeiterBucketKeys === 'function'
        ? ccInternSchrittListeMitarbeiterBucketKeys(stepObj)
        : [];
    var ki, k;
    if (bucketKeys && bucketKeys.length) {
      for (ki = 0; ki < bucketKeys.length; ki++) {
        k = bucketKeys[ki];
        if (!k) continue;
        if (!byMa[k]) byMa[k] = [];
        byMa[k].push({
          auftragId: a.id,
          kunde: a.kunde || '—',
          step: a.step,
          titel: (slRow && slRow.title) ? slRow.title : String(a.step),
        });
      }
      return;
    }
    var raw = [stepObj.maId, stepObj.verantwortlicher].concat(stepObj.maIds || []).concat(stepObj.zusatzMa || []);
    var seen = Object.create(null);
    for (var ri = 0; ri < raw.length; ri++) {
      var x = raw[ri];
      if (x == null) continue;
      k = String(x).trim();
      if (!k || k === 'undefined' || k === '—') continue;
      if (seen[k]) continue;
      seen[k] = true;
      if (!ccInternIsLikelyUserUuid(k)) continue;
      if (!byMa[k]) byMa[k] = [];
      byMa[k].push({
        auftragId: a.id,
        kunde: a.kunde || '—',
        step: a.step,
        titel: (slRow && slRow.title) ? slRow.title : String(a.step),
      });
    }
  });
  var uuids = Object.keys(byMa);
  uuids.sort(function (a, b) {
    return ccInternNameFuerUserUuid(a).localeCompare(ccInternNameFuerUserUuid(b), 'de');
  });
  uuids.forEach(function (uuid) {
    byMa[uuid].sort(function (x, y) {
      var c = x.titel.localeCompare(y.titel, 'de');
      if (c !== 0) return c;
      return String(x.auftragId).localeCompare(String(y.auftragId), 'de');
    });
  });
  return { byMa: byMa, uuids: uuids };
}

function ccInternProdMaEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function ccInternProdMaEscAttr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function ccInternCloseProdMaAufgabenPanel() {
  var o = document.getElementById('cc-prod-ma-modal');
  if (o) o.style.display = 'none';
  try {
    document.removeEventListener('keydown', ccInternProdMaModalOnKey);
  } catch (eRm) {}
}

function ccInternProdMaModalOnKey(e) {
  if (e.key === 'Escape') ccInternCloseProdMaAufgabenPanel();
}

/** Detail-Liste: Namen, Aufgabenanzahl, Schritte, Links zu Aufträgen (Produktion-KPI „Mitarbeiter aktiv“). */
function ccInternOpenProdMaAufgabenPanel() {
  var agg = ccInternAggregiereAktuelleAufgabenProMa();
  var o = document.getElementById('cc-prod-ma-modal');
  if (!o) {
    o = document.createElement('div');
    o.id = 'cc-prod-ma-modal';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.style.cssText =
      'display:none;position:fixed;inset:0;z-index:450;background:rgba(0,0,0,.45);align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px);';
    o.innerHTML =
      '<div id="cc-prod-ma-modal-card" style="background:var(--surface,#fff);border-radius:14px;max-width:440px;width:100%;max-height:min(78vh,560px);overflow:hidden;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.18);border:1px solid var(--border,#e5e5ea);">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border,#e5e5ea);background:var(--panel,#f9f9fb);">'
      + '<div style="font-size:13px;font-weight:700;color:var(--text);">Mitarbeiter aktiv</div>'
      + '<button type="button" id="cc-prod-ma-modal-x" style="border:none;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:var(--text3);padding:4px 8px;border-radius:8px;" aria-label="Schließen">×</button></div>'
      + '<div id="cc-prod-ma-modal-body" style="overflow-y:auto;padding:0;"></div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', function (e) {
      if (e.target === o) ccInternCloseProdMaAufgabenPanel();
    });
    var card = o.querySelector('#cc-prod-ma-modal-card');
    if (card) card.addEventListener('click', function (e) { e.stopPropagation(); });
    var bx = o.querySelector('#cc-prod-ma-modal-x');
    if (bx) bx.addEventListener('click', function () { ccInternCloseProdMaAufgabenPanel(); });
  }
  var body = document.getElementById('cc-prod-ma-modal-body');
  if (!body) return;
  if (!agg.uuids.length) {
    body.innerHTML =
      '<div style="padding:16px 14px;font-size:13px;color:var(--text3);line-height:1.45;">'
      + 'Keine Einträge: Im aktuellen Schritt sind keine Mitarbeiter-UUIDs hinterlegt, oder es gibt keine offenen Aufträge.'
      + '</div>';
  } else {
    var parts = [];
    agg.uuids.forEach(function (uuid) {
      var name = ccInternNameFuerUserUuid(uuid);
      var rows = agg.byMa[uuid];
      var stepSet = {};
      rows.forEach(function (r) { stepSet[r.titel] = true; });
      var stepStr = Object.keys(stepSet).sort().join(', ');
      parts.push(
        '<div style="padding:14px 16px;border-bottom:1px solid var(--border,#e5e5ea);">'
        + '<div style="font-size:14px;font-weight:700;color:var(--text);">' + ccInternProdMaEsc(name) + '</div>'
        + '<div style="font-size:12px;color:var(--text2);margin-top:4px;">Aktuelle Aufgaben: <strong>' + rows.length + '</strong>'
        + (stepStr ? ' · Schritt: ' + ccInternProdMaEsc(stepStr) : '')
        + '</div>'
        + '<ul style="margin:8px 0 0;padding-left:18px;font-size:12px;color:var(--text2);line-height:1.5;">'
      );
      rows.forEach(function (row) {
        parts.push(
          '<li style="margin-bottom:2px;">',
          '<a href="javascript:void(0)" style="color:var(--blue);font-weight:600;cursor:pointer;text-decoration:none;" onclick="ccInternCloseProdMaAufgabenPanel();openAuftragDetail(\'',
          ccInternProdMaEscAttr(row.auftragId),
          '\')\">',
          ccInternProdMaEsc(row.auftragId),
          '</a> <span style="color:var(--text3);">·</span> ',
          ccInternProdMaEsc(row.kunde),
          '</li>'
        );
      });
      parts.push('</ul></div>');
    });
    body.innerHTML = parts.join('');
  }
  o.style.display = 'flex';
  try {
    document.removeEventListener('keydown', ccInternProdMaModalOnKey);
    document.addEventListener('keydown', ccInternProdMaModalOnKey);
  } catch (eK) {}
}

/** Früher: große Box „AKTUELLE AUFGABEN …“; Inhalt jetzt KPI + Modal ({@link ccInternOpenProdMaAufgabenPanel}). */
function renderAufgabenProMitarbeiterBox() {
  var el = document.getElementById('cc-aufgaben-pro-ma-panel');
  if (!el) return;
  el.style.display = 'none';
  el.innerHTML = '';
}

function renderKanban(){
  if (typeof renderAufgabenProMitarbeiterBox === 'function') renderAufgabenProMitarbeiterBox();
  const pg=document.getElementById('kanbanBoard'); if(!pg) return;
  const total  = AUFTRAEGE.filter(a=>!a.archiv&&a.step!=='abgeschlossen').length;
  const urgent = AUFTRAEGE.filter(a=>!a.archiv&&a.urgent).length;
  const done   = AUFTRAEGE.filter(a=>!a.archiv&&a.step==='abgeschlossen').length;
  const maAgg = typeof ccInternAggregiereAktuelleAufgabenProMa === 'function' ? ccInternAggregiereAktuelleAufgabenProMa() : { uuids: [] };
  const maCount = maAgg.uuids.length;

  // ── Rechnung schreiben Banner ── (entfernt — Lexware-Queue in Rechnungen-Seite)
  let reBanner='';

  // ── Stats (ohne „Rechnung offen“ in Produktion; Mitarbeiter: echte Zahl + Modal) ──
  let statsHtml='<div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">'
    +'<div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div><div><div class="sc-n" style="color:var(--blue)">'+total+'</div><div class="sc-l">Aktive Aufträge</div></div></div>'
    +'<div class="sc" style="border-top-color:var(--red)"><div class="sc-ico" style="background:var(--red-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><path d="M12 9v4m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div><div><div class="sc-n" style="color:var(--red)">'+urgent+'</div><div class="sc-l">Dringend</div></div></div>'
    +'<div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" style="color:var(--green)">'+done+'</div><div class="sc-l">Abgeschlossen</div></div></div>'
    +'<div class="sc" role="button" tabindex="0" title="Mitarbeiter aktiv: '+maCount+' — Klick für Details (aktueller Schritt)" style="border-top-color:var(--purple);cursor:pointer;" onclick="ccInternOpenProdMaAufgabenPanel()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();ccInternOpenProdMaAufgabenPanel();}"><div class="sc-ico" style="background:var(--purple-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2"><path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/><path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></div><div><div class="sc-n" style="color:var(--purple)">'+maCount+'</div><div class="sc-l">Mitarbeiter aktiv</div></div></div>'
    +'</div>';

  // ── Kanban Columns ──
  let cols='';
  STEPS.forEach(function(step){
    const s=STEP_LABELS[step];
    const cards=AUFTRAEGE.filter(function(a){return a.step===step&&!a.archiv;});
    const isAbg=step==='abgeschlossen';
    const isDoku=step==='doku';

    cols+='<div class="kb-col" style="'+(isAbg?'background:var(--green-l);':isDoku?'background:#F5F3FF;':'')+'min-width:0;">';
    cols+='<div class="kb-hdr" style="color:'+s.col+';">'+s.title+' <span class="kb-count">'+(isAbg?done:cards.length)+'</span></div>';

    if(!cards.length){
      cols+='<div style="padding:14px;text-align:center;font-size:11px;color:var(--text3);">'+(isAbg?'Keine abgeschlossenen Aufträge':'Keine Aufträge')+'</div>';
    }

    cards.forEach(function(a){
      const sch = schrittDaten(a, step);
      // ── Visuelle Priorität ──────────────────────────────────────
      // Farb-Konstanten — einmalig hier, nirgendwo sonst
      const PRIO_ROT    = '#C62828'; // Dringend
      const PRIO_ORANGE = '#E65100'; // Überfällig
      const PRIO_GELB   = '#FF8F00'; // Termin heute

      const heuteStr = new Date().toISOString().substring(0,10);
      const terminStr = (a.terminDatum||a.liefertermin||'').substring(0,10);
      const istHeute  = !isAbg && terminStr === heuteStr;
      const istUeberf = !isAbg && terminStr && terminStr < heuteStr;

      // Rand: Prioritätsfarbe oder Schritt-Farbe
      const borderCol = a.urgent  ? PRIO_ROT
                      : istUeberf ? PRIO_ORANGE
                      : istHeute  ? PRIO_GELB
                      : s.col;
      // Hintergrund
      const cardBg    = a.urgent  ? '#FFF5F5'
                      : istUeberf ? '#FFF3E0'
                      : istHeute  ? '#FFFDE7'
                      : '#fff';
      // Linker Akzentstreifen für sofortige Erkennbarkeit (3px)
      const accentBar = (a.urgent||istUeberf||istHeute)
        ? '<div style="position:absolute;top:0;left:0;bottom:0;width:4px;background:'+borderCol+';border-radius:0;"></div>'
        : '';
      // Termin-Badge
      const terminBadge = istUeberf
        ? '<div style="font-size:10px;font-weight:700;color:'+PRIO_ORANGE+';margin-top:3px;">⚠ Überfällig · '+terminStr.split('-').reverse().join('.')+'</div>'
        : istHeute
        ? '<div style="font-size:10px;font-weight:700;color:'+PRIO_GELB+';margin-top:3px;">📅 Starttermin heute</div>'
        : '';
      const montageBadge = a.montageDatum
        ? '<div style="font-size:10px;color:var(--amber);margin-top:2px;">🔧 Montagetermin: '+a.montageDatum.split('-').reverse().join('.')+(a.montageZeit?' '+a.montageZeit:'')+'</div>'
        : '';

      // Progress dots
      let dots='';
      ['grafik','druck','laminat','montage','doku'].forEach(function(st){
        const isDone2=STEPS.indexOf(st)<STEPS.indexOf(step)||step==='abgeschlossen';
        const isCurr=st===step;
        const bg=isDone2?STEP_LABELS[st].col:isCurr?STEP_LABELS[st].col+'50':'var(--border)';
        dots+='<div style="flex:1;height:3px;border-radius:2px;background:'+bg+';"></div>';
      });

      // Rechnung badge
      const reBdg=isAbg?('<div style="margin-top:4px;"><span class="bdg '
        +(a.rechnung==='bezahlt'?'bg':a.rechnung==='geschrieben'?'bb':'ba')
        +'">💶 '+RE_STATUS_LABELS[a.rechnung||'offen']+'</span></div>'):'';

      // Photo count badge for doku step
      const fotoBdg=isDoku?('<div style="font-size:10px;color:#7C3AED;margin-top:3px;">📷 '+(a.fotos&&a.fotos.length?a.fotos.length+' Fotos':'Noch keine Fotos')+'</div>'):'';

      // Chat-Badge
      var chatAnz=(a.kommentare||[]).length;
      var frageAnz=(a.kommentare||[]).filter(function(k){return k.istFrage&&!k.beantwortet;}).length;
      var chatBdg=chatAnz
        ?'<button onclick="event.stopPropagation();openAuftragDetail(\''+a.id+'\')" '
          +'style="background:'+(frageAnz?'#FF9500':'#007AFF')+';color:#fff;border:none;border-radius:20px;'
          +'font-size:9px;font-weight:800;padding:1px 6px;cursor:pointer;margin-right:2px;" '
          +'title="Nachrichten">💬 '+chatAnz+(frageAnz?' ❓'+frageAnz:'')+'</button>'
        :'';

      cols+='<div class="kb-card" style="position:relative;border-color:'+borderCol+';background:'+cardBg+';padding:0;overflow:hidden;margin-bottom:10px;">'+accentBar;
      cols+='<div style="padding:10px 12px 6px;padding-left:'+(a.urgent||istUeberf||istHeute?'16':'12')+'px;cursor:pointer;" onclick="openAuftragDetail(\''+a.id+'\')">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1px;">'
          +'<div class="kb-cn" style="'+(a.urgent?'color:'+PRIO_ROT+';':istUeberf?'color:'+PRIO_ORANGE+';':istHeute?'color:'+PRIO_GELB+';':'')+'">'+( a.urgent?'🔴 ':'')+a.kunde+'</div>'
          +'<div style="display:flex;align-items:center;gap:4px;">'+chatBdg+(isAbg?'<span>✅</span>':'')+'<button onclick="event.stopPropagation();'+((typeof currentPage!=='undefined'&&currentPage==='produktion')?'produktionAuftragEntfernen':'loescheAuftrag')+'(\''+a.id+'\')" style="background:none;border:none;cursor:pointer;padding:2px 4px;opacity:.4;font-size:13px;line-height:1;" title="Auftrag löschen">🗑</button></div>'
        +'</div>'
        +'<div class="kb-cs" style="font-size:10px;color:var(--text3);margin-bottom:2px;">'+a.id+'</div>'
        +'<div class="kb-cs">'+a.fz+'</div>'
        +'<div class="kb-cs" style="margin-top:1px;font-size:10px;color:var(--text3);">'+a.paket+'</div>'
        +(a.beschr?'<div style="font-size:10px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+a.beschr+'</div>':'')
        +terminBadge+montageBadge
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:5px;">'
          +'<span class="bdg bgr" style="font-size:10px;">👤 '+(sch&&sch.wer?sch.wer:'—')+'</span>'
          +(sch&&sch.zeit?'<span style="font-size:10px;color:var(--text3);">✓ '+sch.zeit+'</span>':'')
        +'</div>'
        +fotoBdg+reBdg
      +'</div>';
      // Progress
      cols+='<div style="padding:0 10px 5px;display:flex;gap:2px;">'+dots+'</div>';

      // Action button
      if(isAbg){
        // Rechnungsstatus buttons
        cols+='<div style="padding:7px 10px;border-top:1px solid var(--border);background:var(--green-l);">'
          +'<div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:5px;">Rechnungsstatus:</div>'
          +'<div style="display:flex;gap:4px;">'
          +'<div style="display:flex;gap:4px;">'+renderRechnungButtons(a.id,a.rechnung)+'</div></div></div>';



      } else if(isDoku){
        // Doku: photo upload + fertig
        cols+='<div style="padding:8px 10px;border-top:1px solid var(--border);background:#F5F3FF;">'
          +'<label style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:7px;background:#7C3AED;color:#fff;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;margin-bottom:6px;">'
          +'📷 Montagefotos hochladen'
          +'<label style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:7px;background:#7C3AED;color:#fff;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;margin-bottom:6px;">📷 Montagefotos<input type="file" accept="image/*" multiple style="display:none;" data-aid="'+a.id+'" onchange="dokuFotoUpload(event,this.dataset.aid)"></label>'
          +'</label>'
          +'<button data-aid="'+a.id+'" onclick="event.stopPropagation();schrittFertig(this.dataset.aid)" style="width:100%;padding:7px;background:#7C3AED;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">✓ Dokumentation fertig → Abgeschlossen</button>'
          +'</div>';
      } else {
        // Timer + Fertig buttons
        var zk=(typeof window !== 'undefined' && typeof window.zeitAktivKey === 'function')
          ? window.zeitAktivKey(a.id, step)
          : (a.id+'_'+step);
        var laufend=ZEIT_AKTIV[zk];
        var zTotal=(a.zeiten||[]).filter(function(z){return z.step===step;}).reduce(function(acc,z){return acc+z.dauer;},0);
        var zStr=zTotal>0?formatMinuten(zTotal):'';
        var timerDomId='timer-'+String(zk).replace(/_/g,'-');
        cols+='<div style="border-top:1px solid '+(laufend?'#34C759':'var(--border)')+';background:'+(laufend?'#F0FFF4':'#FAFAFA')+';transition:background .3s;">'
          +(laufend?'<div style="display:flex;align-items:center;gap:5px;padding:4px 8px 0;"><span style="width:7px;height:7px;border-radius:50%;background:#34C759;display:inline-block;animation:pulse 1s infinite;flex-shrink:0;"></span><span style="font-size:10px;font-weight:700;color:#34C759;">LÄUFT · <span id="'+timerDomId+'" style="font-family:monospace;font-size:10px;"></span></span></div>':'')
          +'<div style="display:flex;gap:4px;padding:6px 8px 0;">'
          +(laufend
            ?'<button data-aid="'+a.id+'" data-step="'+step+'" onclick="event.stopPropagation();zeitStop(this.dataset.aid,this.dataset.step)" style="flex:1;padding:6px;background:#FF3B30;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">⏹ Stop</button>'
            :'<button data-aid="'+a.id+'" data-step="'+step+'" onclick="event.stopPropagation();zeitStart(this.dataset.aid,this.dataset.step)" style="flex:1;padding:6px;background:#34C759;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">▶ Start Arbeit</button>'
          )
          +'<button data-aid="'+a.id+'" onclick="event.stopPropagation();openZeitDetails(this.dataset.aid)" style="padding:6px 8px;background:#fff;border:1px solid var(--border);border-radius:7px;font-size:11px;cursor:pointer;" title="Zeitübersicht">⏱'+(zStr?' '+zStr:'')+'</button>'
          +'</div>'
          +'<div style="padding:4px 8px 7px;"><button data-aid="'+a.id+'" onclick="event.stopPropagation();schrittFertig(this.dataset.aid)" style="width:100%;padding:6px;background:'+s.col+';color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">✓ '+s.title+' fertig → '+s.nextLabel+'</button></div>'
          +'</div>';
      }
      cols+='</div>';
    });
    cols+='</div>';
  });

  pg.innerHTML=reBanner+statsHtml+'<div class="kanban" style="grid-template-columns:repeat(6,1fr);">'+cols+'</div>';
}

function dokuFotoUpload(e, id){
  const a=AUFTRAEGE.find(function(x){return x.id===id;}); if(!a) return;
  const files=Array.from(e.target.files);
  if(!files.length) return;
  if(!a.fotos) a.fotos=[];
  files.forEach(function(f){ a.fotos.push(f.name); });
  renderKanban();
  showToast('📷 '+files.length+' Foto(s) hochgeladen · '+id);
}

function showRechnungListe(){
  const reList=AUFTRAEGE.filter(function(a){return a.step==='abgeschlossen'&&!a.archiv&&a.rechnung==='offen';});
  if(!reList.length){showToast('Keine offenen Rechnungen');return;}
  document.getElementById('dpTitle').textContent='Rechnung schreiben';
  document.getElementById('dpBody').innerHTML='<div class="dp-section"><div class="dp-slbl">Abgeschlossene Aufträge — Rechnung offen</div>'
    +reList.map(function(a){
      return '<div class="dp-row" style="flex-direction:column;align-items:flex-start;gap:6px;padding:12px 0;">'
        +'<div style="display:flex;justify-content:space-between;width:100%;"><span style="font-weight:700;">'+a.id+'</span><span class="bdg ba">Rechnung offen</span></div>'
        +'<div style="font-size:12px;color:var(--text2);">'+a.kunde+' · '+a.fz+' · '+a.paket+'</div>'
        +'<div style="display:flex;gap:6px;">'
        +'<button class="btn p" style="font-size:11px;" onclick="setRechnung(\''+a.id+'\',\'geschrieben\');closeDetail()">✓ Rechnung geschrieben</button>'
        +'<button class="btn" style="font-size:11px;" onclick="showToast(\'Rechnung für '+a.id+' erstellt\')">📄 Rechnung erstellen</button>'
        +'</div></div>';
    }).join('')+'</div>';
  document.getElementById('dpFooter').innerHTML='<button class="btn" onclick="closeDetail()">Schließen</button>';
  document.getElementById('detailOverlay').classList.add('open');
}

// ── Hilfsfunktion: Schritt-Daten sicher lesen (Legacy-Kompatibilität) ──
function schrittDaten(a, step){
  if(!a||!a.schritte) return null;
  return a.schritte[step]||null;
}

// ── Schritt-Migration: alte Schritte ohne neues Format nachrüsten ──────
function schrittMigrieren(sch, step){
  if(!sch) return sch;
  var werIdMig = false;
  if (typeof window !== 'undefined' && typeof window.ccInternSchrittResolveLegacyWerId === 'function') {
    werIdMig = !!window.ccInternSchrittResolveLegacyWerId(sch);
  }
  if (werIdMig) sch._ccInternWerIdDirty = true;
  if(!sch.verantwortlicher && sch.maId)  sch.verantwortlicher = sch.maId;
  if(!sch.verantwortlicherName && sch.wer) sch.verantwortlicherName = sch.wer.split(' + ')[0]||sch.wer;
  if(!sch.zusatzMa)    sch.zusatzMa    = sch.maIds ? sch.maIds.slice(1) : [];
  if(!sch.zusatzMaNames) sch.zusatzMaNames = [];
  if(!sch.checkliste)  sch.checkliste  = [];
  if(!sch.fotos)       sch.fotos       = [];
  if(sch.fotosErforderlich===undefined) sch.fotosErforderlich = (step==='montage'||step==='doku');
  if(!sch.status){
    if(sch.fertig) sch.status = 'abgeschlossen';
    else           sch.status = 'offen';
  }
  return sch;
}

// ── Offene Checklistenpunkte (alle Kategorien) — nur Hinweis, kein Workflow-Block ─────────
function ccInternZaehleOffeneChecklistenpunkte(a, step) {
  if (!a || typeof a !== 'object') return 0;
  var sch = typeof schrittDaten === 'function' ? schrittDaten(a, step) : null;
  if (!sch && a.schritte && a.schritte[step]) sch = a.schritte[step];
  if (!sch) return 0;
  if (typeof schrittMigrieren === 'function') schrittMigrieren(sch, step);
  var checks = sch.checkliste || [];
  var n = 0;
  for (var i = 0; i < checks.length; i++) {
    var c = checks[i];
    if (c && !c.erledigt) n++;
  }
  return n;
}
function ccInternHatOffeneChecklistenpunkte(a, step) {
  return ccInternZaehleOffeneChecklistenpunkte(a, step) > 0;
}
if (typeof window !== 'undefined') {
  window.ccInternZaehleOffeneChecklistenpunkte = ccInternZaehleOffeneChecklistenpunkte;
  window.ccInternHatOffeneChecklistenpunkte = ccInternHatOffeneChecklistenpunkte;
}

// ── Prüft ob ein Schritt abgeschlossen werden darf (Req. 6) ─────────
function schrittAbschliessbar(a, step){
  var sch = schrittDaten(a, step);
  if(!sch) return {ok:true}; // Kein Schritt-Objekt → kein Block
  schrittMigrieren(sch, step);
  // Checklisten blockieren den Workflow nicht (Hinweis erfolgt separat in der UI).
  // Fotos: Pflicht wenn Schritt fotosErforderlich UND keine Fotos vorhanden
  if(sch.fotosErforderlich){
    var fotos = (sch.fotos||[]).length + (a.fotos||[]).length;
    if(!fotos) return {ok:false, grund:'Pflichtfotos fehlen — bitte mindestens 1 Foto hochladen'};
  }
  return {ok:true};
}

// ── Verantwortlichkeits-Prüfung (Req. 4) ─────────────────────────────
function istVerantwortlicher(a, step, maId){
  if(!maId) return true; // Desktop: kein MA-Check (immer erlaubt)
  var sch = schrittDaten(a, step);
  if(!sch) return true;
  schrittMigrieren(sch, step);
  if(!sch.verantwortlicher) return true;
  return sch.verantwortlicher === maId;
}

// ── Schritt-Status setzen ─────────────────────────────────────────────
function schrittStatusSetzen(a, step, status){
  var sch = schrittDaten(a, step);
  if(!sch) return;
  schrittMigrieren(sch, step);
  sch.status = status;
  _ccInternPersistAuftraegeFromView();
}

function schrittFertig(id, maId){
  try {
  var a=AUFTRAEGE.find(function(x){return x.id===id;});
  if(!a){ showToast('⚠ Auftrag nicht gefunden: '+id); return; }
  if(a.step==='abgeschlossen'){ showToast('⚠ Auftrag bereits abgeschlossen'); return; }
  var currentStep=a.step;
  var sch = schrittDaten(a, currentStep);
  if(sch) schrittMigrieren(sch, currentStep);

  // Req. 4: Nur Verantwortlicher darf abschließen
  if(maId && sch && sch.verantwortlicher && sch.verantwortlicher !== maId){
    var verantName = sch.verantwortlicherName||sch.verantwortlicher;
    showToast('⛔ Nur '+verantName+' (Verantwortliche/r) darf diesen Schritt abschließen');
    return;
  }

  function applySchrittFertig(){
  // Req. 6: Pflichtfotos — optionaler Hinweis (Toast), kein Block
  var check = schrittAbschliessbar(a, currentStep);
  if(!check.ok){
    showToast('⚠ ' + check.grund);
  }

  var nextStep=STEP_LABELS[currentStep]&&STEP_LABELS[currentStep].next;
  var nextWer=STEP_LABELS[currentStep]&&STEP_LABELS[currentStep].nextWer;
  var currentLabel=STEP_LABELS[currentStep]&&STEP_LABELS[currentStep].title||currentStep;
  var nextLabel=nextStep&&STEP_LABELS[nextStep]&&STEP_LABELS[nextStep].title||nextStep||'Abgeschlossen';
  var jetzt=new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})
    +' '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});

  // Req. 7: Status des Schritts setzen
  if(sch){
    sch.fertig = true;
    sch.zeit   = jetzt;
    sch.status = 'abgeschlossen';
  }
  a.step = nextStep;

  // Nächsten Schritt auf 'in_bearbeitung' setzen wenn Daten vorhanden
  if(nextStep && nextStep!=='abgeschlossen' && a.schritte && a.schritte[nextStep]){
    var nextSch = a.schritte[nextStep];
    schrittMigrieren(nextSch, nextStep);
    if(nextSch.status==='offen') nextSch.status = 'in_bearbeitung';
  }

  if(nextStep==='abgeschlossen'){
    a.rechnung='offen';
    if(currentPage==='kalender') buildCCCalendar();
  }
  // Klarer Erfolgs-Toast damit der Schritt-Wechsel immer sichtbar ist
  showToast('✅ '+id+' · '+currentLabel+' → '+nextLabel);
  showWorkflowNotif(a,currentStep,nextStep,nextWer,jetzt);
  renderKanban();
  if(currentPage==='mitarbeiter') renderMitarbeiter();
  var persistOk = _ccInternPersistAuftraegeFromView();
  if (nextStep === 'abgeschlossen' && persistOk) {
    var auftragSnap = a;
    setTimeout(function () {
      _ccInternProduktionSyncAbgeschlossen(auftragSnap);
    }, 700);
  }
  }

  if (ccInternHatOffeneChecklistenpunkte(a, currentStep)) {
    if (typeof ccInternConfirm === 'function') {
      ccInternConfirm(
        'Es sind noch Checklistenpunkte offen. Auftrag trotzdem fortsetzen?',
        function () { applySchrittFertig(); },
      );
      return;
    }
    if (typeof confirm === 'function' && !confirm('Es sind noch Checklistenpunkte offen. Auftrag trotzdem fortsetzen?')) {
      return;
    }
  }
  applySchrittFertig();
  } catch(e){ showToast('⚠ Fehler: '+e.message); console.error('schrittFertig error:',e); }
}

function loescheAuftrag(id){
  var idx = AUFTRAEGE.findIndex(function(a){ return a.id===id; });
  if(idx===-1){ showToast('Auftrag nicht gefunden'); return; }
  var a = AUFTRAEGE[idx];
  var msg = 'Auftrag '+id+' ('+a.kunde+' · '+a.fz+') wirklich löschen?\nDieser Vorgang kann nicht rückgängig gemacht werden.';
  if(typeof ccInternConfirm !== 'function'){ return; }
  ccInternConfirm(msg, function(){
    var api = window.CCIntern && window.CCIntern.cockpitApi;
    if (!api || typeof api.deleteAuftragByDisplayId !== 'function') {
      if (typeof showToast === 'function') {
        showToast('⚠ Löschen nur über Cockpit-API (DELETE /api/v1/ccintern/auftraege) möglich.');
      }
      return;
    }
    api
      .deleteAuftragByDisplayId(id, typeof showToast === 'function' ? showToast : null)
      .then(function () {
        if (typeof renderKanban === 'function') renderKanban();
        if (typeof buildCCCalendar === 'function') buildCCCalendar();
      })
      .catch(function () {});
  });
}

/**
 * Produktion: Auftrag nur aus Workflow-/Produktionsansicht entfernen.
 * Kein DELETE auf ccintern_auftraege.
 */
function produktionAuftragEntfernen(id){
  var idx = AUFTRAEGE.findIndex(function(a){ return a.id===id; });
  if(idx===-1){ showToast('Auftrag nicht gefunden'); return; }
  var msg = 'Auftrag '+id+' nur aus Produktion/Workflow entfernen?\nDer Hauptauftrag bleibt unter „Aufträge“ erhalten.';
  if(typeof ccInternConfirm !== 'function'){ return; }
  ccInternConfirm(msg, function(){
    alert('Produktions-Entfernung ist noch nicht sauber implementiert.');
  });
}

function showWorkflowNotif(a,from,to,wer,zeit){
  const fromLabel=from?STEP_LABELS[from].title:'Start';
  const toLabel=to?STEP_LABELS[to].title:'Abgeschlossen';
  const isAbg=to==='abgeschlossen';
  if(!document.getElementById('notif-style')){
    const s=document.createElement('style');s.id='notif-style';
    s.textContent='@keyframes slideInR{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(s);
  }
  const notif=document.createElement('div');
  notif.style.cssText='position:fixed;top:20px;right:20px;width:300px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);border-left:4px solid '+(isAbg?'var(--green)':'var(--blue)')+';z-index:9999;padding:16px;animation:slideInR .3s ease;';
  notif.innerHTML='<div style="display:flex;gap:10px;align-items:flex-start;">'
    +'<div style="font-size:22px;">'+(isAbg?'✅':'🔔')+'</div>'
    +'<div style="flex:1;">'
    +'<div style="font-size:13px;font-weight:700;margin-bottom:3px;">'+(isAbg?'Auftrag abgeschlossen!':'Weiter: '+toLabel)+'</div>'
    +'<div style="font-size:12px;color:var(--text2);">'+a.id+' · '+a.fz+'</div>'
    +'<div style="font-size:12px;color:var(--green);font-weight:600;margin-top:2px;">✓ '+fromLabel+' · '+zeit+'</div>'
    +(wer&&!isAbg?'<div style="margin-top:7px;padding:5px 10px;background:var(--blue-l);border-radius:6px;font-size:11px;color:var(--blue);font-weight:600;">👤 '+wer+' wird benachrichtigt</div>':'')
    +(isAbg?'<div style="margin-top:7px;padding:5px 10px;background:var(--amber-l);border-radius:6px;font-size:11px;color:var(--amber);font-weight:600;">💶 Rechnung schreiben nicht vergessen!</div>':'')
    +'</div>'
    +'<button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text3);">×</button>'
    +'</div>';
  document.body.appendChild(notif);
  setTimeout(function(){notif.style.transition='opacity .5s';notif.style.opacity='0';},5000);
  setTimeout(function(){notif.remove();},5600);
}

// ── MATERIALBIBLIOTHEK ──────────────────────────
const MAT_BIBLIOTHEK = {
  hersteller:['Orafol','Avery Dennison','3M','mactac','VakoSun','Hexis','Metamark'],
  folien:[
    'ORAJET® 3551GRA-101 white GLOSSY 137cm',
    'ORAJET® 3551GRA-101 white GLOSSY 105cm',
    'ORAJET® 3162XMRA-010 white MATT 105cm',
    'ORAJET® 3162XMRA-010 white MATT 137cm',
    'Avery MPI 1105 EA RS white GLOSSY 137cm',
    'VakoSun Protect 20A silver dark 152cm',
    'VakoSun Protect 20A silver dark 122cm',
    'mactac® MACal® 9888-105 CAST MATT 123cm',
    'ORAMASK® 810 Stencil Film 126cm',
  ],
  laminate:[
    'ORAGUARD® 200M MATT 137cm UV 70µ',
    'ORAGUARD® 200G GLOSSY 105cm UV 70µ',
    'ORAGUARD® 215G GLOSSY 137cm UV 75µ',
    'ORAGUARD® 215G GLOSSY 105cm UV 75µ',
    'ORAGUARD® 215M MATT 105cm UV 75µ',
    'Avery DOL 1460Z GLOSSY 137cm 30µ',
    'Ohne Laminat',
  ],
  maschinen:['HP Latex 560','HP 800','HP Latex 360','Roland DG','Mimaki JV','Plotter (Schnitt)'],
  druckmaterialien:[
    'ORAJET® 3551 137cm','ORAJET® 3551 105cm',
    'ORAJET® 3162XMRA 105cm','ORAJET® 3162XMRA 137cm',
    'Avery MPI 1105 137cm','PVC Banner 500g/m²','Dibond 3mm','Acryl 3mm',
  ],
  verarbeitungstypen:[
    'Nassmontage','Trockenverlegung','Nassverlegung + Luftkanal',
    'Trockenverlegung + Fensterfolie','Direktdruck','Laminiert',
    'Traffic Board','Rollup','Banner mit Ösen',
  ],
  templateTypen:['Vorhandene Vorlage','Selbst erstellt','3D-Scan','Fahrzeugtemplate extern','Kein Template'],
};

// ── MATERIAL SCHNELLAUSWAHL (Mobiler Verbrauch-Eintrag) ────────────
var MAT_SCHNELLAUSWAHL = {
  folien: [
    'ORAJET 3551 weiß glänzend 137cm',
    'ORAJET 3551 weiß glänzend 105cm',
    'ORAJET 3162 weiß matt 105cm',
    'ORAJET 3162 weiß matt 137cm',
    'Avery MPI 1105 weiß glänzend 137cm',
    'mactac MACal 9888 Cast matt 123cm',
    'VakoSun Protect 20A silver dark 152cm',
  ],
  laminate: [
    'ORAGUARD 200M matt 137cm',
    'ORAGUARD 200G glänzend 105cm',
    'ORAGUARD 215G glänzend 137cm',
    'Avery DOL 1460Z glänzend 137cm',
    'Ohne Laminat',
  ],
  sonstiges: ['Transferband','Montagepaste','Reinigungsmittel','Rakel'],
};

async function openAuftragDetail(id){
  const a=AUFTRAEGE.find(x=>x.id===id); if(!a) return;
  if(!a.prod) a.prod={planung:{},produktion:{bestaetigt:false},template:{},dateien:[]};
  if(!a.kommentare) a.kommentare=[];
  if(!a.dateien) a.dateien=[];
  if(!a.fotos)   a.fotos=[];
  if(!a.materialVerbrauch) a.materialVerbrauch=[];
  var capiHv = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if (capiHv && typeof capiHv.ccInternHydrateSchrittChecklisteFromLegacy === 'function') {
    capiHv.ccInternHydrateSchrittChecklisteFromLegacy(a);
  }
  // Migration: ältere Aufträge ohne material-Felder → aus prod.planung befüllen
  if(!a.material && a.prod && a.prod.planung){
    var pl0 = a.prod.planung;
    if(!a.material)  a.material  = pl0.produktname  || pl0.druckmaterial || '';
    if(!a.laminat)   a.laminat   = pl0.laminat  || '';
    if(!a.flaeche)   a.flaeche   = parseFloat(pl0.flaeche)||0;
    if(!a.stueck)    a.stueck    = parseInt(pl0.stueck)||1;
    if(!a.format)    a.format    = pl0.verarbeitungstyp || '';
    if(!a.notizProd) a.notizProd = pl0.notiz || '';
  }
  const p=a.prod; const pl=p.planung||{}; const pr=p.produktion||{}; const tpl=p.template||{};
  const isAbg=a.step==='abgeschlossen';
  const sl=STEP_LABELS[a.step];

  // Termin formatiert
  const tStr=(a.terminDatum||a.liefertermin||'').substring(0,10);
  const terminFmt    = tStr ? tStr.split('-').reverse().join('.') : '—';
  const montageFmt   = a.montageDatum
    ? a.montageDatum.split('-').reverse().join('.')+(a.montageZeit?' '+a.montageZeit:'')
    : '';
  const lieferFmt    = a.liefertermin
    ? a.liefertermin.split('-').reverse().join('.')
    : '';
  const heuteStr=new Date().toISOString().substring(0,10);
  const istHeute=!isAbg&&tStr===heuteStr;
  const istUeberf=!isAbg&&tStr&&tStr<heuteStr;
  const terminCol=istUeberf?'#C62828':istHeute?'#E65100':'var(--text2)';
  const terminPfx=istUeberf?'⚠ ':istHeute?'📅 ':'';

  document.getElementById('dpTitle').textContent=a.kunde+' · '+a.id;

  // ── Workflow Steps (Req. 1–4,7: Verantwortliche, Status-Badges) ──
  let stepRows='';
  ['grafik','druck','laminat','montage','doku'].forEach(function(s){
    var sch = schrittDaten(a, s);
    if(sch) schrittMigrieren(sch, s);
    const schStatus = sch ? (sch.status||'offen') : 'offen';
    const col  = STEP_LABELS[s].col;
    const statusMap = {
      'abgeschlossen': {lbl:'✓ Fertig',     bg:col+'18', tc:col},
      'in_bearbeitung':{lbl:'▶ In Arbeit',  bg:col+'12', tc:col},
      'offen':         {lbl:'– Offen',       bg:'var(--gray-l)', tc:'var(--text3)'},
    };
    const sm = statusMap[schStatus]||statusMap['offen'];
    const isDone = schStatus==='abgeschlossen';
    const isCurr = s===a.step && schStatus!=='abgeschlossen';
    var verantName = sch ? (sch.verantwortlicherName||(sch.wer||'').split(' + ')[0]||'—') : '—';
    var zusatzNames = sch ? (sch.zusatzMaNames||[]) : [];
    var clDone = sch ? (sch.checkliste||[]).filter(function(c){return c.erledigt;}).length : 0;
    var clTotal= sch ? (sch.checkliste||[]).length : 0;
    stepRows+='<div style="padding:8px 0;border-bottom:1px solid var(--border);">'
      +'<div style="display:flex;align-items:center;gap:8px;">'
        +'<div style="width:10px;height:10px;border-radius:50%;background:'+(isDone?col:isCurr?col:'var(--border)')+';flex-shrink:0;"></div>'
        +'<div style="flex:1;">'
          +'<div style="font-size:12px;font-weight:'+(isCurr?'700':'500')+';color:'+(isDone||isCurr?col:'var(--text3)')+'">'+STEP_LABELS[s].title+'</div>'
          +'<div style="font-size:10px;color:var(--text2);margin-top:1px;">'
            +'👤 <strong>'+verantName+'</strong>'
            +(zusatzNames.length?' · +'+zusatzNames.join(', '):'')
            +(sch&&sch.zeit?' · ✓ '+sch.zeit:'')
          +'</div>'
          +(clTotal?'<div style="font-size:10px;color:var(--text3);margin-top:1px;">📋 '+clDone+'/'+clTotal+'</div>':'')
        +'</div>'
        +'<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+sm.bg+';color:'+sm.tc+';">'+sm.lbl+'</span>'
      +'</div>'
    +'</div>';
  });

  // ── Zeiterfassung ──
  const zeitTotal=(a.zeiten||[]).reduce(function(acc,z){return acc+z.dauer;},0);

  // ── Kommentar-Liste ──
  function kommentarHTML(){
    if(!(a.kommentare||[]).length)
      return '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Noch keine Kommentare</div>';
    return (a.kommentare||[]).slice().reverse().map(function(k){
      return '<div style="padding:8px 10px;background:var(--gray-l);border-radius:8px;margin-bottom:6px;">'
        +'<div style="font-size:12px;color:var(--text);">'+k.text+'</div>'
        +'<div style="font-size:10px;color:var(--text3);margin-top:3px;">'+k.von+' · '+k.zeit+'</div>'
        +'</div>';
    }).join('');
  }

  // ── Zeiten-Verlauf (nach Tag gruppiert) ──
  function verlaufHTML(){
    var zeiten = (a.zeiten||[]).slice().reverse();
    if(!zeiten.length)
      return '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Noch keine Buchungen</div>';

    // Nach Datum gruppieren (z.start = "DD.MM.YYYY HH:MM")
    var groups = {}, order = [];
    zeiten.forEach(function(z){
      var dk = z.start ? z.start.substring(0,10) : '—';
      if(!groups[dk]){ groups[dk]=[]; order.push(dk); }
      groups[dk].push(z);
    });

    var WOCHENTAGE = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    return order.map(function(dk){
      var entries  = groups[dk];
      var totalMin = entries.reduce(function(s,z){ return s+(z.dauer||0); }, 0);

      // Wochentag berechnen
      var dayLbl = dk;
      try {
        var p = dk.split('.');
        if(p.length===3){
          var wd = new Date(+p[2], +p[1]-1, +p[0]).getDay();
          dayLbl = WOCHENTAGE[wd]+'. · '+dk;
        }
      } catch(e){}

      return '<div style="margin-bottom:8px;border-radius:8px;overflow:hidden;border:1px solid var(--border);">'
        // ─ Tagesheader
        +'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#F0F4F8;">'
          +'<span style="font-size:11px;font-weight:700;color:var(--text);">📅 '+dayLbl+'</span>'
          +'<span style="font-size:11px;font-weight:800;color:var(--blue);">Σ '+formatMinuten(totalMin)+'</span>'
        +'</div>'
        // ─ Einträge des Tages
        +entries.map(function(z, zi){
          var col   = STEP_LABELS[z.step] ? STEP_LABELS[z.step].col : 'var(--text2)';
          var title = STEP_LABELS[z.step] ? STEP_LABELS[z.step].title : (z.step||'—');
          var tStart = z.start && z.start.length>10 ? z.start.substring(11,16) : (z.start||'');
          var tEnd   = z.end   && z.end.length>10   ? z.end.substring(11,16)   : (z.end||'');
          var timeStr = tStart + (tEnd ? ' – '+tEnd : '');
          var border  = zi < entries.length-1 ? 'border-bottom:1px solid var(--border);' : '';
          return '<div style="display:flex;gap:0;align-items:stretch;'+border+'">'
            +'<div style="width:3px;background:'+col+';flex-shrink:0;"></div>'
            +'<div style="display:flex;align-items:center;flex:1;padding:6px 10px;gap:6px;background:#fff;">'
              +'<div style="flex:1;min-width:0;">'
                +'<span style="font-size:11px;font-weight:700;color:'+col+';">'+title+'</span>'
                +'<span style="font-size:10px;color:var(--text2);"> · 👤 '+z.wer+'</span>'
              +'</div>'
              +'<div style="text-align:right;flex-shrink:0;">'
                +'<div style="font-size:10px;color:var(--text3);">'+timeStr+'</div>'
                +'<div style="font-size:11px;font-weight:700;color:'+col+';">'+formatMinuten(z.dauer)+'</div>'
              +'</div>'
            +'</div>'
          +'</div>';
        }).join('')
      +'</div>';
    }).join('');
  }

  // ── Planung-Felder ──
  function comboRow(lbl,val,field,bibKey,ctx){
    var aid=a.id;
    var opts=bibKey&&MAT_BIBLIOTHEK[bibKey]
      ?MAT_BIBLIOTHEK[bibKey].map(function(o){return '<option value="'+o+'" '+(val===o?'selected':'')+'>'+o+'</option>';}).join(''):'';
    var inLib=bibKey&&MAT_BIBLIOTHEK[bibKey]?MAT_BIBLIOTHEK[bibKey].indexOf(val)>=0:false;
    var manualVal=(!inLib&&val)?val:'';
    var uid=ctx+'_'+field;
    var showManual=manualVal?'flex':'none';
    if(bibKey){
      return '<div class="dp-row" style="flex-direction:column;align-items:flex-start;gap:5px;padding:8px 0;">'
        +'<span class="dp-lbl" style="font-size:11px;font-weight:600;">'+lbl+'</span>'
        +'<div style="display:flex;gap:6px;width:100%;align-items:center;">'
          +'<select class="fs" style="flex:1;font-size:11px;padding:4px 6px;" data-auId="'+aid+'" data-field="'+field+'" data-ctx="'+ctx+'" data-uid="'+uid+'" onchange="prodComboSelect(this)">'
          +'<option value="">— aus Bibliothek wählen —</option>'+opts
          +'<option value="__manual__" '+(manualVal?'selected':'')+'>✏ Manuell eingeben…</option>'
          +'</select></div>'
        +'<div id="man-'+aid+'-'+uid+'" style="display:'+showManual+';width:100%;gap:6px;align-items:center;">'
          +'<div style="font-size:10px;color:var(--blue);font-weight:700;white-space:nowrap;">✏</div>'
          +'<input type="text" id="inp-'+aid+'-'+uid+'" value="'+(manualVal||'')
          +'" placeholder="Material manuell eingeben…" data-auId="'+aid+'" data-field="'+field+'" data-ctx="'+ctx
          +'" style="flex:1;padding:5px 8px;border:1.5px solid var(--blue);border-radius:6px;font-size:11px;font-family:inherit;background:#EEF4FF;" onchange="prodHandleChange(this)">'
        +'</div></div>';
    }
    return '<div class="dp-row" style="padding:8px 0;"><span class="dp-lbl" style="font-size:11px;font-weight:600;">'+lbl+'</span>'
      +'<span class="dp-val" style="flex:1;">'
      +'<input type="text" value="'+(val||'')+'" placeholder="—" data-auId="'+aid+'" data-field="'+field+'" data-ctx="'+ctx
      +'" style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:11px;font-family:inherit;" onchange="prodHandleChange(this)">'
      +'</span></div>';
  }
  function planRow(lbl,val,field,bibKey){return comboRow(lbl,val,field,bibKey,'plan');}
  function prodRow(lbl,val,field,bibKey){return comboRow(lbl,val,field,bibKey,'prod');}

  // ── Dateien + Fotos: vereinte Tabelle mit Quelle-Tracking (wie auftraege-detail-view.js) ───────────
  /** @type {any[]} */
  var serverUiRows = [];
  try {
    var cockpitApiSd = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
    if (
      cockpitApiSd &&
      typeof cockpitApiSd.fetchCcInternAuftragDateienUi === 'function' &&
      a.ccApiId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(a.ccApiId).trim())
    ) {
      serverUiRows = await cockpitApiSd.fetchCcInternAuftragDateienUi(String(a.ccApiId), a);
    }
  } catch (eSd) {
    if (typeof console !== 'undefined' && console.warn) console.warn('[openAuftragDetail] Server-Dateien', eSd);
  }

  var _alleDateien = [];
  var _legacyParts = [];
  (a.dateien || []).forEach(function (f, i) {
    var fc = Object.assign({}, f);
    if (!fc.dataUrl && !fc.data && fc.imgKey) {
      fc.dataUrl = typeof ccImgStoreLoad === 'function' ? ccImgStoreLoad(fc.imgKey) : '';
    }
    fc._legacySrc = 'a';
    fc._legacySourceIdx = i;
    _legacyParts.push(fc);
  });
  (p.dateien || []).forEach(function (f, i) {
    var fc = Object.assign({}, f);
    if (!fc.dataUrl && !fc.data && fc.imgKey) {
      fc.dataUrl = typeof ccImgStoreLoad === 'function' ? ccImgStoreLoad(fc.imgKey) : '';
    }
    fc._legacySrc = 'p';
    fc._legacySourceIdx = i;
    _legacyParts.push(fc);
  });
  (pl.dateien || []).forEach(function (f, i) {
    var fc = Object.assign({}, f);
    if (!fc.dataUrl && !fc.data && fc.imgKey) {
      fc.dataUrl = typeof ccImgStoreLoad === 'function' ? ccImgStoreLoad(fc.imgKey) : '';
    }
    fc._legacySrc = 'plan';
    fc._legacySourceIdx = i;
    _legacyParts.push(fc);
  });
  (a.fotos || []).forEach(function (f, i) {
    var fo = typeof f === 'object' ? f : { name: 'Foto ' + (i + 1) };
    var fc = Object.assign({}, fo, {
      mimeType: fo.mimeType || 'image/jpeg',
      typ: fo.typ || (fo.ma ? 'Foto · ' + fo.ma : 'Foto'),
    });
    if (!fc.dataUrl && !fc.data && fo.imgKey) {
      fc.dataUrl = typeof ccImgStoreLoad === 'function' ? ccImgStoreLoad(fo.imgKey) : '';
    }
    fc._legacySrc = 'foto';
    fc._legacySourceIdx = i;
    _legacyParts.push(fc);
  });

  var apiMerge =
    typeof window !== 'undefined' &&
    window.CCIntern &&
    window.CCIntern.cockpitApi &&
    typeof window.CCIntern.cockpitApi.mergeCcInternDateienDisplayRows === 'function'
      ? window.CCIntern.cockpitApi.mergeCcInternDateienDisplayRows
      : null;
  if (apiMerge) {
    var mergedRows = apiMerge(serverUiRows || [], _legacyParts);
    mergedRows.forEach(function (f, fi) {
      var srcTag = f._legacySrc != null ? String(f._legacySrc) : 'server';
      var idxDel = srcTag === 'server' ? fi : f._legacySourceIdx != null ? f._legacySourceIdx : 0;
      _alleDateien.push(Object.assign({}, f, { _src: srcTag, _idx: idxDel }));
    });
  } else {
    var _ccServerDateienAnzeige = Array.isArray(serverUiRows) && serverUiRows.length > 0;
    if (_ccServerDateienAnzeige) {
      (serverUiRows || []).forEach(function (f, i) {
        _alleDateien.push(Object.assign({}, f, { _src: 'server', _idx: i }));
      });
    } else {
      (a.dateien || []).forEach(function (f, i) {
        if (!f.dataUrl && !f.data && f.imgKey) {
          f.dataUrl = typeof ccImgStoreLoad === 'function' ? ccImgStoreLoad(f.imgKey) : '';
        }
        _alleDateien.push(Object.assign({}, f, { _src: 'a', _idx: i }));
      });
      (p.dateien || []).forEach(function (f, i) {
        if (!f.dataUrl && !f.data && f.imgKey) {
          f.dataUrl = typeof ccImgStoreLoad === 'function' ? ccImgStoreLoad(f.imgKey) : '';
        }
        _alleDateien.push(Object.assign({}, f, { _src: 'p', _idx: i }));
      });
      (a.fotos || []).forEach(function (f, i) {
        var fo = typeof f === 'object' ? f : { name: 'Foto ' + (i + 1) };
        _alleDateien.push(
          Object.assign({}, fo, {
            _src: 'foto',
            _idx: i,
            mimeType: fo.mimeType || 'image/jpeg',
            typ: fo.typ || (fo.ma ? 'Foto · ' + fo.ma : 'Foto'),
          }),
        );
      });
      (serverUiRows || []).forEach(function (f, i) {
        _alleDateien.push(Object.assign({}, f, { _src: 'server', _idx: i }));
      });
    }
  }
  window.__dpAlleDateienCache = _alleDateien;
  if(!window._dpDateien) window._dpDateien = {};

  // Tag-Farbe je Typ
  function _typTag(typ){
    var t=(typ||'').toLowerCase();
    var b,c,ic;
    if(t.includes('layout'))                              {b='#FFE4EC';c='#C62828';ic='🌸';}
    else if(t.includes('freigabe'))                       {b='#E8F5E9';c='#2E7D32';ic='✅';}
    else if(t.includes('druck'))                          {b='#E3F2FD';c='#1565C0';ic='🖨';}
    else if(t.includes('template')||t.includes('vorlage')){b='#F3E5F5';c='#6A1B9A';ic='📐';}
    else if(t.includes('foto')||t.includes('montage'))    {b='#FFF8E1';c='#E65100';ic='📸';}
    else if(!typ||!typ.trim())                            {return '';}
    else                                                  {b='#F5F5F5';c='#616161';ic='📎';}
    return '<span style="display:inline-flex;align-items:center;gap:3px;background:'+b+';color:'+c
      +';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;white-space:nowrap;">'+ic+' '+typ+'</span>';
  }

  var _uploadsHTML = '';
  if(!_alleDateien.length){
    _uploadsHTML = '<div style="padding:18px;text-align:center;font-size:12px;color:var(--text3);border:1px solid var(--border);border-radius:8px;">Noch keine Dateien oder Fotos hochgeladen</div>';
  } else {
    // Tabellenkopf
    _uploadsHTML =
      '<div style="display:grid;grid-template-columns:1fr 56px 66px 60px 120px 36px;background:#F5F7FA;border-radius:8px 8px 0 0;border:1px solid var(--border);border-bottom:none;padding:6px 12px;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.3px;align-items:center;">'
      +'<span>Dateiname</span><span>Typ</span><span>Größe</span><span>Vorschau</span>'
      +'<span style="text-align:center;">Download</span><span></span>'
      +'</div>'
      +'<div style="border:1px solid var(--border);border-radius:0 0 8px 8px;overflow:hidden;">';

    _alleDateien.forEach(function(f,fi){
      var dataUrl  = f.dataUrl || f.data || '';
      var isImg    = (f.mimeType||'').startsWith('image/') || dataUrl.startsWith('data:image');
      var fname    = f.name || ('Datei '+(fi+1));
      var ext      = fname.includes('.') ? fname.split('.').pop().toUpperCase().substring(0,6)
                     : (f.mimeType||'').split('/').pop().toUpperCase().substring(0,6)||'—';
      var sb       = f.size||f.fileSize||0;
      var sizeFmt  = sb>0 ? (sb>1048576?(sb/1048576).toFixed(1)+' MB':(sb/1024).toFixed(0)+' KB') : '—';
      var typ      = f.typ||'';
      var typDisplay = typ;
      var posRaw = f.position != null ? String(f.position).trim().toLowerCase() : '';
      if (posRaw) {
        var positionLabel = posRaw;
        if (posRaw === 'front') positionLabel = 'Front';
        else if (posRaw === 'seite1') positionLabel = 'Seite 1';
        else if (posRaw === 'seite2') positionLabel = 'Seite 2';
        else if (posRaw === 'heck') positionLabel = 'Heck';
        typDisplay = 'Fahrzeug · ' + typ + ' · ' + positionLabel;
      }
      var dk       = a.id+'_fu'+fi;
      window._dpDateien[dk] = {url:dataUrl, name:fname};

      // Vorschau
      var prevH = isImg && dataUrl
        ? '<img src="'+dataUrl+'" data-dk="'+dk+'" onclick="(function(k){var d=window._dpDateien[k];if(d&&d.url)ccLightbox(d.url,d.name);})(this.dataset.dk)" style="width:52px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:zoom-in;display:block;">'
        : '<span style="font-size:24px;line-height:1;">'
            +((f.mimeType||'').includes('pdf')?'📄':(f.mimeType||'').includes('word')?'📝':'📎')
          +'</span>';

      // Download-Button
      var dlH = dataUrl
        ? '<a href="'+dataUrl+'" download="'+fname+'" style="display:inline-flex;align-items:center;gap:4px;background:#007AFF;color:#fff;border-radius:8px;padding:5px 11px;font-size:11px;font-weight:600;text-decoration:none;white-space:nowrap;">⬇ Download</a>'
        : '<span style="font-size:11px;color:var(--text3);">—</span>';

      var bBot = fi < _alleDateien.length-1 ? '1px solid var(--border)' : 'none';
      _uploadsHTML +=
        '<div style="display:grid;grid-template-columns:1fr 56px 66px 60px 120px 36px;align-items:center;padding:10px 12px;border-bottom:'+bBot+';background:#fff;transition:background .12s;" '
        +'onmouseover="this.style.background=\'#F8FBFF\'" onmouseout="this.style.background=\'#fff\'">'
          +'<div><div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px;" title="'+fname+'">'+fname+'</div>'
          +(typDisplay?'<div style="margin-top:3px;">'+_typTag(typDisplay)+'</div>':'')+'</div>'
          +'<span style="font-size:11px;color:var(--text2);">'+ext+'</span>'
          +'<span style="font-size:11px;color:var(--text2);">'+sizeFmt+'</span>'
          +'<div>'+prevH+'</div>'
          +'<div style="text-align:center;">'+dlH+'</div>'
          +'<div style="text-align:center;"><button onclick="ccDeleteUpload(\''+a.id+'\',\''+f._src+'\','+(f._src==='server' ? fi : f._idx)+')" style="background:none;border:none;cursor:pointer;color:#FF3B30;font-size:17px;padding:2px 4px;line-height:1;" title="Löschen">🗑</button></div>'
        +'</div>';
    });
    _uploadsHTML += '</div>';
  }

  document.getElementById('dpBody').innerHTML=

    // ══ KOPFBEREICH ════════════════════════════════════════════
    '<div style="padding:14px 18px;background:'+sl.col+'12;border-bottom:3px solid '+sl.col+';">'
      +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">'
        +'<div>'
          +'<div style="font-size:17px;font-weight:800;color:var(--text);">'+(a.urgent?'🔴 ':'')+a.kunde+'</div>'
          +'<div style="font-size:12px;color:var(--text2);margin-top:2px;">'+a.id+' · '+a.fz+(a.fzTyp?' · '+a.fzTyp:'')+(a.fzAnzahl&&a.fzAnzahl>1?' ('+a.fzAnzahl+'×)':'')+'</div>'
          +'<div style="font-size:11px;color:var(--text3);margin-top:1px;">'+a.paket+'</div>'
          +(a.beschr?'<div style="font-size:12px;color:var(--text2);margin-top:4px;font-style:italic;">'+a.beschr+'</div>':'')
        +'</div>'
        +'<div style="text-align:right;flex-shrink:0;">'
          +'<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:'+sl.col+';color:#fff;">'+sl.title+'</span>'
          +'<div style="font-size:11px;color:'+terminCol+';margin-top:5px;font-weight:600;">📅 Start: '+terminFmt+'</div>'
          +(montageFmt?'<div style="font-size:11px;color:var(--amber);margin-top:2px;font-weight:600;">🔧 Montagetermin: '+montageFmt+'</div>':'')
          +(lieferFmt&&lieferFmt!==terminFmt?'<div style="font-size:11px;color:var(--text2);margin-top:2px;">🏁 Liefer: '+lieferFmt+'</div>':'')
          +(zeitTotal>0?'<div style="font-size:10px;color:var(--text2);margin-top:2px;">⏱ '+formatMinuten(zeitTotal)+'</div>':'')
        +'</div>'
      +'</div>'
    +'</div>'

        // ══ AUFTRAGSDETAILS KOMPAKT ════════════════════════════════
        +(function(){
          var prodCfg = ccProduktById(a.produktId);
          var leiCfg  = ccLeistungById(a.leistungId);
          var mat     = a.material   || pl.produktname || '';
          var lam     = a.laminat    || pl.laminat     || '';
          var fl      = a.flaeche ? a.flaeche+' m²'+(a.stueck&&a.stueck>1?' × '+a.stueck+' Stk':'') : '';
          var fmt     = a.format     || pl.verarbeitungstyp || '';
          var masch   = a.maschine   || pl.maschine    || '';
          var netto   = a.netto  ? (parseFloat(a.netto)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'}) : '';
          var brutto  = a.brutto ? (parseFloat(a.brutto)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'}) : '';
          var prioMap = {hoch:'⚡ Hoch', dringend:'🔴 Dringend'};
          var prioCol = {hoch:'var(--amber)', dringend:'var(--red)'};

          function chip(ico, lbl, val, col){
            if(!val) return '';
            return '<div style="display:flex;flex-direction:column;gap:2px;padding:7px 10px;'
              +'background:var(--gray-l);border-radius:8px;min-width:0;">'
              +'<span style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;'
              +'letter-spacing:.05em;white-space:nowrap;">'+ico+(ico?' ':'')+lbl+'</span>'
              +'<span style="font-size:12px;font-weight:700;color:'+(col||'var(--text)')+';'
              +'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+val+'">'+val+'</span>'
              +'</div>';
          }

          var chips = '';
          if(leiCfg)  chips += chip('','Leistung',      leiCfg.ico+' '+leiCfg.label,    'var(--blue)');
          if(prodCfg) chips += chip('','Produkt',       prodCfg.ico+' '+prodCfg.label);
          if(prioMap[a.prio]) chips += chip('🚦','Priorität', prioMap[a.prio], prioCol[a.prio]);
          var isVehicle = (a.leistungId==='fahrzeug'||a.leistungId==='bus_bahn');
          var fzStr = a.fz ? a.fz+(a.fzTyp?' · '+a.fzTyp:'')+(a.fzAnzahl>1?' ('+a.fzAnzahl+'×)':'') : '';
          if(isVehicle && fzStr)   chips += chip('🚗','Fahrzeug',  fzStr);
          if(a.leistungId==='bus_bahn' && a.depot) chips += chip('📍','Depot', a.depot);
          if(fl)      chips += chip('📐','Fläche',       fl);
          if(fmt)     chips += chip('📋','Format',       fmt);
          if(mat)     chips += chip('🎨','Material',     mat);
          if(lam)     chips += chip('✨','Laminat',      lam);
          if(masch)   chips += chip('🖨','Maschine',     masch);
          if(netto)   chips += chip('💶','Netto',        netto,   'var(--green)');
          if(brutto)  chips += chip('','Brutto',        brutto,  'var(--green)');
          if(a.zahlziel)  chips += chip('📅','Zahlziel', a.zahlziel);
          if(a.angebot)   chips += chip('📄','Angebot',  a.angebot);
          if(a.beschr)    chips += chip('💬','Beschreibung', a.beschr);
          if(a.notizProd||pl.notiz) chips += chip('🔧','Produktion', a.notizProd||pl.notiz);
          if(a.notizMontage) chips += chip('🔩','Montage', a.notizMontage);
          if(a.notizBes)     chips += chip('⚠️','Besonderh.', a.notizBes);

          if(!chips) return '';
          return '<div class="dp-section" style="padding:10px 14px;">'
            +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:5px;">'
            +chips
            +'</div>'
            +'</div>';
        })()

    // ══ SCHNELL-AKTIONEN ═══════════════════════════════════════
    +(function(){
      var hatAufgaben = INTERN_AUFGABEN.some(function(g){ return g.auftragId===a.id; });
      return '<div style="padding:10px 16px;background:#FAFAFA;border-bottom:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap;">'
        +'<button onclick="auDetailAktion(\'termin\',\''+a.id+'\')" class="btn" style="font-size:11px;">📅 Starttermin ändern</button>'
        +'<button onclick="auDetailAktion(\'mitarbeiter\',\''+a.id+'\')" class="btn" style="font-size:11px;">👤 Mitarbeiter</button>'
        +(isAbg?''
          :'<button onclick="auDetailAktion(\'status\',\''+a.id+'\')" class="btn" style="font-size:11px;background:'+sl.col+';color:#fff;border-color:'+sl.col+';">⏩ '+sl.title+' → fertig</button>')
        +(!hatAufgaben
          ?'<button onclick="auDetailAktion(\'handy-fix\',\''+a.id+'\')" class="btn" style="font-size:11px;background:#FF9500;color:#fff;border-color:#FF9500;font-weight:700;">📱 Im Handy sichtbar machen</button>'
          :'')
      +'</div>';
    })()

    // ══ WORKFLOW-STATUS ════════════════════════════════════════
    +'<div class="dp-section"><div class="dp-slbl">Workflow-Status</div>'+stepRows+'</div>'

    // ══ KOMMUNIKATION / CHAT ════════════════════════════════════
    +'<div class="dp-section" style="padding:0;">'
      +'<div id="chat-container-'+a.id+'"></div>'
    +'</div>'

    // ══ VERLAUF / ZEITBUCHUNGEN ════════════════════════════════
    +(function(){
      var _k='verlauf', _o=dpOpen(_k,true);
      var _zeiten = (a.zeiten||[]).length;
      var _total  = (a.zeiten||[]).reduce(function(s,z){return s+(z.dauer||0);},0);
      var _badge  = _zeiten>0
        ? '<span style="font-size:10px;color:var(--blue);font-weight:700;background:var(--blue-l);padding:2px 8px;border-radius:20px;">'+formatMinuten(_total)+'</span>'
        : '';
      return '<div class="dp-section">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;" onclick="dpToggle(\''+_k+'\')">'
          +'<div class="dp-slbl" style="margin-bottom:0;">⏱ Arbeits-Verlauf</div>'
          +'<div style="display:flex;align-items:center;gap:8px;">'
            +_badge
            +'<button id="dpb-'+_k+'" style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--text3);padding:0 4px;line-height:1;transform:rotate('+(_o?'180':'0')+'deg);transition:transform .22s;pointer-events:none;">▼</button>'
          +'</div>'
        +'</div>'
        +'<div id="dps-'+_k+'" style="margin-top:8px;'+(!_o?'display:none;':'')+'">'+verlaufHTML()+'</div>'
      +'</div>';
    })()

    // ══ PRODUKTIONSDETAILS (editierbar per Klick) ════════════════
    +'<div class="dp-section" style="background:#F5F8FF;">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
    +'<div class="dp-slbl" style="margin-bottom:0;">🎨 Produktionsdetails</div>'
    +'<span style="font-size:10px;color:var(--blue);font-weight:600;background:var(--blue-l);padding:2px 8px;border-radius:20px;">✏️ Klicken zum Bearbeiten</span>'
    +'</div>'
    +(function(){
      function editRow(lbl, val, field){
        var esc=(String(val||'')).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
        return '<div style="display:flex;justify-content:space-between;align-items:center;'
          +'padding:6px 0;border-bottom:1px solid rgba(21,101,192,.1);">'
          +'<span style="font-size:11px;color:var(--text2);flex-shrink:0;min-width:110px;">'+lbl+'</span>'
          +'<input type="text" value="'+esc+'" placeholder="—" '
          +'data-au-id="'+a.id+'" data-field="'+field+'" '
          +'style="flex:1;border:none;border-bottom:1.5px solid transparent;background:transparent;'
          +'font-size:12px;font-weight:600;color:var(--text);text-align:right;padding:2px 4px;'
          +'transition:border-color .15s;outline:none;min-width:0;" '
          +'onfocus="this.style.borderBottomColor=\'var(--blue)\'" '
          +'onblur="this.style.borderBottomColor=\'transparent\';auDetailFieldSave(this)" '
          +'onkeydown="if(event.key===\'Enter\')this.blur()">'
          +'</div>';
      }
      var rows = '';
      rows += editRow('Material / Folie', a.material||pl.produktname||pl.druckmaterial||'', 'material');
      rows += editRow('Laminat',          a.laminat||pl.laminat||'', 'laminat');
      rows += editRow('Fläche (m²)',      a.flaeche||pl.flaeche||'', 'flaeche');
      rows += editRow('Stück',            a.stueck||pl.stueck||'', 'stueck');
      rows += editRow('Format',           a.format||pl.verarbeitungstyp||'', 'format');
      rows += editRow('Netto (€)',        a.netto||'', 'netto');
      rows += editRow('Hinweise Rechnungserstellung', a.notizProd||pl.notiz||'', 'notizProd');
      return rows;
    })()
    +'</div>'

    // ══ MATERIAL-VERBRAUCH (eingetragen von MA) ════════════════
    +(a.materialVerbrauch && a.materialVerbrauch.length
      ?'<div class="dp-section">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
          +'<div class="dp-slbl" style="margin-bottom:0;">📦 Material-Verbrauch</div>'
          +'<span style="font-size:10px;color:var(--green);font-weight:600;background:var(--green-l);padding:2px 8px;border-radius:20px;">'+a.materialVerbrauch.length+' Einträge</span>'
        +'</div>'
        +'<table style="width:100%;border-collapse:collapse;font-size:12px;">'
          +'<thead><tr>'
            +'<th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);background:var(--gray-l);border-bottom:1px solid var(--border);">Material</th>'
            +'<th style="padding:5px 8px;text-align:right;font-size:10px;font-weight:700;color:var(--text2);background:var(--gray-l);border-bottom:1px solid var(--border);">Menge</th>'
            +'<th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);background:var(--gray-l);border-bottom:1px solid var(--border);">Schritt</th>'
            +'<th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);background:var(--gray-l);border-bottom:1px solid var(--border);">MA</th>'
            +'<th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);background:var(--gray-l);border-bottom:1px solid var(--border);">Datum</th>'
          +'</tr></thead><tbody>'
          +a.materialVerbrauch.map(function(e,ei){
            var stepLbl=(STEP_LABELS[e.schritt]&&STEP_LABELS[e.schritt].title)||e.schritt||'—';
            var stepCol=(STEP_LABELS[e.schritt]&&STEP_LABELS[e.schritt].col)||'var(--text2)';
            var ts=e.ts?e.ts.substring(0,10).split('-').reverse().join('.'):'—';
            return '<tr style="border-bottom:1px solid var(--border);">'
              +'<td style="padding:7px 8px;">'
                +'<div style="font-weight:600;color:var(--text);">'+e.material+'</div>'
                +(e.datei?'<div style="font-size:10px;color:var(--blue);">🖨 '+e.datei+'</div>':'')
                +(e.notiz?'<div style="font-size:10px;color:var(--text2);">💬 '+e.notiz+'</div>':'')
              +'</td>'
              +'<td style="padding:7px 8px;text-align:right;font-weight:600;white-space:nowrap;">'+(e.menge&&e.menge!=='—'?e.menge+' '+e.einheit:'—')+'</td>'
              +'<td style="padding:7px 8px;"><span style="font-size:10px;font-weight:700;color:'+stepCol+';">'+stepLbl.toUpperCase()+'</span></td>'
              +'<td style="padding:7px 8px;font-size:11px;color:var(--text2);">'+e.ma+'</td>'
              +'<td style="padding:7px 8px;font-size:11px;color:var(--text2);">'+ts+'</td>'
            +'</tr>';
          }).join('')
          +'</tbody></table>'
      +'</div>'
      :'')

    +renderTemplateSection(a.id,tpl)

    // ══ HOCHGELADENE DATEIEN & FOTOS (vereint) ═══════════════════
    +'<div class="dp-section" id="dp-files-zone-'+a.id+'">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
    +'<div class="dp-slbl" style="margin-bottom:0;">📁 Hochgeladene Dateien</div>'
    +'<span style="font-size:11px;color:var(--text2);">'+_alleDateien.length+' Datei(en)</span>'
    +'</div>'
    +_uploadsHTML
    +'<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">'
    +'<label style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--blue-l);border-radius:8px;cursor:pointer;font-size:12px;color:var(--blue);font-weight:600;">📎 Datei hinzufügen'
    +'<input type="file" multiple style="display:none;" data-aid="'+a.id+'" onchange="prodAddDatei(this.dataset.aid,event)"></label>'
    +'<label style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--blue-l);border-radius:8px;cursor:pointer;font-size:12px;color:var(--blue);font-weight:600;">📷 Foto hochladen'
    +'<input type="file" accept="image/*" capture="environment" multiple style="display:none;" data-aid="'+a.id+'" onchange="detailFotoUpload(this.dataset.aid,event)"></label>'
    +'</div>'
    +'</div>'

    // ══ CHECKLISTE (Req. 1: gehört zum Schritt) ══════════════════════════
    +(function(){
      // Aktiven Schritt-Checkliste priorisieren (Req. 1)
      var activeStep = a.step;
      var schAktiv = a.schritte && a.schritte[activeStep];
      if(schAktiv) schrittMigrieren(schAktiv, activeStep);
      var useSchritt = !!(schAktiv && Array.isArray(schAktiv.checkliste) && schAktiv.checkliste.length);
      var checks = useSchritt ? schAktiv.checkliste : (a.checklisten||[]);
      var stepLabel = STEP_LABELS[activeStep] ? STEP_LABELS[activeStep].title : activeStep;
      if(!checks.length) return '';
      var erledigt= checks.filter(function(c){ return c.erledigt; }).length;
      var pct     = checks.length ? Math.round(erledigt/checks.length*100) : 0;
      var barCol  = pct===100?'var(--green)':pct>50?'var(--amber)':'var(--blue)';
      var abschliessbar = checks.every(function(c){return c.erledigt;});
      return '<div class="dp-section">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
          +'<div class="dp-slbl" style="margin-bottom:0;">📋 Checkliste · '+stepLabel+'</div>'
          +'<div style="display:flex;align-items:center;gap:8px;">'
            +'<span style="font-size:11px;font-weight:700;color:'+barCol+';">'+erledigt+'/'+checks.length+(abschliessbar?' ✅':'')+' ('+pct+'%)</span>'
            +'<button onclick="(function(btn){var el=document.getElementById(\'dp-cl-items-'+a.id+'\');var open=el.style.display!==\'none\';el.style.display=open?\'none\':\'block\';btn.textContent=open?\'▼ Zeigen\':\'▲ Schließen\';})(this)" '
              +'style="font-size:10px;padding:3px 10px;border:1px solid var(--border);border-radius:6px;background:var(--gray-l);cursor:pointer;color:var(--text2);white-space:nowrap;">▼ Zeigen</button>'
          +'</div>'
        +'</div>'
        +'<div style="height:6px;background:var(--border);border-radius:3px;margin-bottom:4px;overflow:hidden;">'
          +'<div style="height:100%;width:'+pct+'%;background:'+barCol+';border-radius:3px;transition:width .3s;"></div>'
        +'</div>'
        +'<div id="dp-cl-items-'+a.id+'" style="display:none;margin-top:8px;">'
        +checks.map(function(c,ci){
          var katCol={'pflicht':'var(--red)','optional':'var(--text3)','foto':'var(--blue)'}[c.kat]||'var(--text3)';
          var toggleFn = useSchritt
            ? 'schrittClToggle(\''+a.id+'\',\''+activeStep+'\','+ci+',this.checked)'
            : 'auCheckToggle(\''+a.id+'\','+ci+',this.checked)';
          return '<div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);">'
            +'<input type="checkbox" '+(c.erledigt?'checked':'')+' onchange="'+toggleFn+'" '
              +'style="margin-top:2px;width:16px;height:16px;accent-color:var(--green);flex-shrink:0;cursor:pointer;">'
            +'<div style="flex:1;">'
              +'<div style="font-size:12px;'+(c.erledigt?'text-decoration:line-through;color:var(--text3);':'color:var(--text);')+'">'+c.text+'</div>'
              +(c.hinweis?'<div style="font-size:10px;color:var(--text3);margin-top:1px;">'+c.hinweis+'</div>':'')
            +'</div>'
            +'<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;background:'+katCol+'18;color:'+katCol+';flex-shrink:0;">'+c.kat.toUpperCase()+'</span>'
          +'</div>';
        }).join('')
        +'<div style="margin-top:8px;display:flex;gap:6px;">'
          +'<input id="dp-cl-new-'+a.id+'" type="text" placeholder="+ Prüfpunkt hinzufügen…" '
            +'style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;font-family:inherit;" '
            +'onkeydown="if(event.key===\'Enter\')auCheckAdd(\''+a.id+'\')">'
          +'<button onclick="auCheckAdd(\''+a.id+'\')" class="btn" style="font-size:12px;">+ Hinzufügen</button>'
        +'</div>'
        +'</div>'
      +'</div>';
    })()

    // ══ ABNAHME & DOKUMENTATION (js/modules/auftraege/detail.js) ══
    +(typeof renderAbnahmeBlock==='function' ? renderAbnahmeBlock(a) : '')

    // ══ RECHNUNG ══════════════════════════════════════════════
    +(isAbg?'<div class="dp-section"><div class="dp-slbl">Rechnungsstatus</div>'
    +'<div style="display:flex;gap:6px;padding:4px 0;">'+renderRechnungButtons(a.id,a.rechnung)+'</div></div>':'');

  document.getElementById('dpFooter').innerHTML=
    '<button class="btn" onclick="document.getElementById(\'detailOverlay\').classList.remove(\'open\')">Schließen</button>'
    +(a.step==='doku'?'<label class="btn" style="cursor:pointer;">📷 Fotos<input type="file" accept="image/*" multiple style="display:none;" data-aid="'+a.id+'" onchange="dokuFotoUpload(event,this.dataset.aid)"></label>':'')
    +(isAbg
      ?'<span class="bdg bg" style="padding:6px 12px;">✅ Abgeschlossen</span>'
      :'<button class="btn p" onclick="document.getElementById(\'detailOverlay\').classList.remove(\'open\');schrittFertig(\''+a.id+'\')">✓ '+sl.title+' fertig →</button>');

  document.getElementById('detailOverlay').classList.add('open');
  // Chat-Bereich rendern (nach DOM-Einfügen)
  renderChatBereich(id, 'chat-container-'+id);
  // Module-Hooks (dateien.js, checklisten.js, etc.)
  if(typeof auftragDetailModuleInit==='function') auftragDetailModuleInit(id);
}

// ── Foto-Upload im Desktop-Detail ──────────────────────────────
// ── Bild komprimieren (verhindert localStorage-Überlauf) ─────────
function ccCompressImage(file, callback){
  var maxPx = 900, quality = 0.72;  // Aggressivere Komprimierung wegen localStorage-Limit
  var reader = new FileReader();
  reader.onload = function(ev){
    if(!file.type.startsWith('image/')){
      callback(ev.target.result, file.type); return;
    }
    var img = new Image();
    img.onload = function(){
      var w=img.width, h=img.height;
      var ratio=Math.min(maxPx/w, maxPx/h, 1);
      w=Math.round(w*ratio); h=Math.round(h*ratio);
      var canvas=document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      callback(canvas.toDataURL('image/jpeg',quality), 'image/jpeg');
    };
    img.onerror=function(){ callback(ev.target.result, file.type); };
    img.src=ev.target.result;
  };
  reader.onerror=function(){ callback('',file.type); };
  reader.readAsDataURL(file);
}

function detailFotoUpload(auId, event){
  var a=AUFTRAEGE.find(function(x){return x.id===auId;}); if(!a) return;
  if(!a.fotos) a.fotos=[];
  var files=Array.from(event.target.files||[]);
  var pending=files.length;
  if(!pending) return;
  files.forEach(function(file){
    ccCompressImage(file, function(data, mime){
      if(!a.fotos) a.fotos=[];
      a.fotos.push({name:file.name, data:data, mimeType:mime, ts:new Date().toISOString(), ma:'Büro'});
      pending--;
      if(!pending){
        _ccInternPersistAuftraegeFromView();
        openAuftragDetail(auId);
        showToast('📷 '+files.length+' Foto(s) hinzugefügt');
      }
    });
  });
}


function auCheckToggle(auId, idx, val){
  var a = AUFTRAEGE.find(function(x){ return x.id===auId; });
  if(!a || !a.checklisten) return;
  a.checklisten[idx].erledigt = val;
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if (api && typeof api.logCcInternChecklistAuditFromUi === 'function') {
    api.logCcInternChecklistAuditFromUi(a, 'UI: legacy a.checklisten nach Toggle', { auId: auId, idx: idx, val: val });
  }
  if (api && typeof api.persistAuftraegeImmediate === 'function') {
    api.persistAuftraegeImmediate(typeof showToast === 'function' ? showToast : null).then(function(){
      openAuftragDetail(auId);
    }).catch(function(){ openAuftragDetail(auId); });
    return;
  }
  _ccInternPersistAuftraegeFromView();
  openAuftragDetail(auId);
}

// ── Schritt-eigene Checkliste abhaken (Req. 1: CL gehört zum Schritt) ──
function schrittClToggle(auId, step, idx, val){
  var a = AUFTRAEGE.find(function(x){ return x.id===auId; });
  if(!a) return;
  var sch = schrittDaten(a, step);
  if(!sch || !sch.checkliste) return;
  sch.checkliste[idx].erledigt = val;
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if (api && typeof api.logCcInternChecklistAuditFromUi === 'function') {
    api.logCcInternChecklistAuditFromUi(a, 'UI: a.schritte[step].checkliste nach Toggle', {
      auId: auId,
      step: step,
      idx: idx,
      val: val,
    });
  }
  var reopen = function(){
    openAuftragDetail(auId);
    var done = sch.checkliste.filter(function(c){return c.erledigt;}).length;
    var total = sch.checkliste.length;
    if(done===total) showToast('✅ Alle '+total+' Punkte erledigt!');
  };
  if (api && typeof api.persistAuftraegeImmediate === 'function') {
    api.persistAuftraegeImmediate(typeof showToast === 'function' ? showToast : null).then(reopen).catch(reopen);
    return;
  }
  _ccInternPersistAuftraegeFromView();
  reopen();
}

function auCheckAdd(auId){
  var a = AUFTRAEGE.find(function(x){ return x.id===auId; });
  if(!a) return;
  var inp = document.getElementById('dp-cl-new-'+auId);
  if(!inp || !inp.value.trim()) return;
  if(!a.checklisten) a.checklisten = [];
  a.checklisten.push({text:inp.value.trim(), kat:'pflicht', hinweis:'', quelle:'Manuell', erledigt:false});
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if (api && typeof api.logCcInternChecklistAuditFromUi === 'function') {
    api.logCcInternChecklistAuditFromUi(a, 'UI: legacy a.checklisten nach manuellem Punkt', { auId: auId, text: inp.value.trim() });
  }
  if (api && typeof api.persistAuftraegeImmediate === 'function') {
    api.persistAuftraegeImmediate(typeof showToast === 'function' ? showToast : null).then(function(){
      openAuftragDetail(auId);
      showToast('✓ Prüfpunkt hinzugefügt');
    }).catch(function(){ openAuftragDetail(auId); });
    return;
  }
  _ccInternPersistAuftraegeFromView();
  openAuftragDetail(auId);
  showToast('✓ Prüfpunkt hinzugefügt');
}
// ── Chat / Kommunikation ──────────────────────────────────────────────

// Aktiven Mitarbeiter ermitteln (Desktop oder Mobile)
function ccAktivMA(){
  if(window.CC_AKTIV_MA) return window.CC_AKTIV_MA;
  // Mobile: MOB_MA_ID
  if(typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID){
    var m = (typeof maByID === 'function') ? maByID(MOB_MA_ID) : null;
    if(m) return {name: m.n, kuerzel: m.av||m.maId, farbe: m.col||'#5856D6'};
  }
  // Erster MA aus MA_DATA
  if(typeof MA_DATA !== 'undefined' && MA_DATA && MA_DATA.length){
    var m0 = MA_DATA[0];
    return {name: m0.n, kuerzel: m0.av||m0.maId, farbe: m0.col||'#5856D6'};
  }
  return {name:'Mitarbeiter', kuerzel:'MA', farbe:'#5856D6'};
}

// Nachricht senden und in Auftrag speichern
async function sendKommentar(auftragId, text, istFrage){
  var a = null;
  if (typeof mobAuftragIdsGleich === 'function') {
    a = AUFTRAEGE.find(function (x) {
      return mobAuftragIdsGleich(x.id, auftragId);
    });
  }
  if (!a) {
    a = AUFTRAEGE.find(function (x) {
      return x.id === auftragId || String(x.id) === String(auftragId);
    });
  }
  if (!a) return;
  if(!a.kommentare) a.kommentare=[];
  var ma = ccAktivMA();
  var autorMaId =
    typeof ccKommentarAutorUuidFuerSpeichern === 'function'
      ? ccKommentarAutorUuidFuerSpeichern()
      : (typeof window !== 'undefined' && window.CURRENT_USER_ID != null
          ? String(window.CURRENT_USER_ID).trim()
          : '');
  var seenInit = autorMaId ? [autorMaId] : [];
  var newK = {
    id:          'k_'+Date.now(),
    text:        text,
    autor:       ma.name,
    autorKuerzel:ma.kuerzel,
    autorFarbe:  ma.farbe,
    autorMaId:   autorMaId || undefined,
    ts:          new Date().toISOString(),
    istFrage:    !!istFrage,
    beantwortet: false,
    seenBy:      seenInit.slice(),
    // Rückwärtskompatibilität
    von:  ma.name,
    zeit: (function(d){
      return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear()
        +' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    })(new Date()),
  };
  var chatApiMerge = typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi;
  if (chatApiMerge && typeof chatApiMerge.ccInternMergeKommentareFromServerIntoAuftrag === 'function') {
    try {
      await chatApiMerge.ccInternMergeKommentareFromServerIntoAuftrag(a, [newK]);
    } catch (mergeErr) {
      console.warn('[CHAT_MERGE_BEFORE_SAVE_FAIL]', mergeErr);
      a.kommentare.push(newK);
    }
  } else {
    a.kommentare.push(newK);
  }
  var isMobSave =
    typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && String(MOB_MA_ID).trim() !== '';
  console.warn(isMobSave ? '[CHAT_SAVE_APP]' : '[CHAT_SAVE_DESKTOP]', {
    auftragId: a.id,
    ccApiId: a.ccApiId,
    kommentareLength: (a.kommentare || []).length,
    lastText: text,
  });
  var api = window.CCIntern && window.CCIntern.cockpitApi;
  if (api && typeof api.persistAuftraegeImmediate === 'function') {
    api.persistAuftraegeImmediate(
      typeof showToast === 'function' ? showToast : null,
      a.id,
    );
  } else {
    _ccInternPersistAuftraegeFromView(a.id);
  }
  updateGlocke();
  // Desktop-Glocke: Chat-Nachricht lokal + via Server an ALLE Geräte senden
  var _chatNotif = {
    id: 'chat_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),
    collection: 'auftraege',
    action: 'chat',
    ts: new Date().toISOString(),
    info: {
      id:    auftragId,
      fz:    a.fz||'',
      kunde: a.kunde||'',
      autor: ma.name,
      text:  text.substring(0,60)
    }
  };
  // Lokal sofort anzeigen (für dieses Gerät)
  if(typeof CC_NOTIF_DATA !== 'undefined'){
    CC_NOTIF_DATA.unshift(_chatNotif);
    if(CC_NOTIF_DATA.length > 100) CC_NOTIF_DATA.splice(100);
    if(typeof ccNotifBadgeUpdate === 'function') ccNotifBadgeUpdate();
    if(typeof ccNotifRender === 'function' && CC_NOTIF_OPEN) ccNotifRender();
  }
  // An Server POSTen → Server verteilt via SSE an alle anderen Geräte
  try {
    var _notifUrl = (window.location.protocol !== 'file:')
      ? (window.location.origin + '/api/notifications')
      : 'http://localhost:3002/api/notifications';
    fetch(_notifUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_chatNotif)
    }).catch(function(){});
  } catch(e){}
}
