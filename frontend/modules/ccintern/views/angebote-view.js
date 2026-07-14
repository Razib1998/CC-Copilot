// ════════════════════════════════════════════════════════════════════
// CC INTERN — Angebote
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/angebote-view.js
// Enthält:  renderAngebote, agModalOpen, berechneAngebot, tabAG
//
// Backend (Cockpit-Modus): GET|POST|PUT|DELETE `/api/v1/ccintern/angebote`
//   via `apiFetch` (+ `x-project-id`). Auth-Modul wird vom Cockpit-Bridge
//   global unter `window.CCIntern.auth` bereitgestellt — KEIN dynamisches
//   `import(...)` (Vite würde diese Datei sonst zu einem ES-Modul machen).
// ════════════════════════════════════════════════════════════════════

// ─── API-Helfer (Cockpit-Modus) ──────────────────────────────────────
function agApiFetch(path, options) {
  options = options || {};
  var auth = (typeof window !== 'undefined' && window.CCIntern && window.CCIntern.auth) || null;
  if (!auth || typeof auth.apiFetch !== 'function') {
    return Promise.reject(new Error('apiFetch-Modul nicht gefunden (window.CCIntern.auth fehlt).'));
  }
  function runFetch() {
    var headers = Object.assign({}, options.headers || {});
    var pid = typeof auth.getCurrentProjectId === 'function' ? auth.getCurrentProjectId() : '';
    if (pid && String(pid).trim() !== '') {
      headers['x-project-id'] = String(pid).trim();
    }
    return auth.apiFetch(path, Object.assign({}, options, { headers: headers }));
  }
  var pid0 = typeof auth.getCurrentProjectId === 'function' ? auth.getCurrentProjectId() : '';
  if (pid0 && String(pid0).trim() !== '') {
    return Promise.resolve().then(runFetch);
  }
  if (typeof auth.hydrateCockpitAccessibleProjectsAndEnsureContext === 'function') {
    return auth.hydrateCockpitAccessibleProjectsAndEnsureContext().then(runFetch);
  }
  return Promise.resolve().then(runFetch);
}

function agPickPayload(data) {
  if (!data || typeof data !== 'object') return data;
  if (data.data !== undefined && data.success === true) return data.data;
  return data;
}
function agPickAngeboteList(data) {
  var d = agPickPayload(data);
  if (!d) return [];
  if (Array.isArray(d.angebote)) return d.angebote;
  if (d.data && Array.isArray(d.data.angebote)) return d.data.angebote;
  return [];
}
function agPickAngebot(data) {
  var d = agPickPayload(data);
  if (!d || typeof d !== 'object') return null;
  if (d.angebot && typeof d.angebot === 'object') return d.angebot;
  if (d.data && d.data.angebot && typeof d.data.angebot === 'object') return d.data.angebot;
  return null;
}
function agIsApiUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
}
function agFormatDeFromIso(iso) {
  if (!iso) return '';
  try {
    var d = new Date(String(iso).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('de-DE');
  } catch (e) {
    return String(iso);
  }
}
function agBuildPayloadDescription(a) {
  return JSON.stringify({
    v: 1,
    kunde: a.kunde || '',
    kundeId: a.kundeId || null,
    ap: a.ap || '',
    datum: a.datum || '',
    gueltig: a.gueltig || '',
    zahlung: a.zahlung || '',
    einleitung: a.einleitung || '',
    schluss: a.schluss || '',
    inotiz: a.inotiz || '',
    positionen: Array.isArray(a.positionen) ? a.positionen : [],
    rabatt: typeof a.rabatt === 'number' ? a.rabatt : (parseInt(a.rabatt, 10) || 0),
    mwst: typeof a.mwst === 'number' ? a.mwst : (parseInt(a.mwst, 10) || 19),
    vonAnfrage: a.vonAnfrage || null,
  });
}
function agApiRowToUi(row) {
  if (!row || typeof row !== 'object') return null;
  var besch = row.beschreibung != null ? String(row.beschreibung) : '';
  var extra = {};
  try {
    var j = JSON.parse(besch);
    if (j && typeof j === 'object' && j.v === 1) extra = j;
  } catch (e) {}
  var pos = Array.isArray(extra.positionen) ? extra.positionen : [];
  var rabatt = typeof extra.rabatt === 'number' ? extra.rabatt : 0;
  var zwischen = pos.reduce(function (acc, p) {
    return acc + (Number(p.menge) || 0) * (Number(p.ep) || 0);
  }, 0);
  var nettoCalc = Math.round((zwischen - (zwischen * rabatt) / 100) * 100) / 100;
  var nettoFromBetrag = Math.round(Number(row.betrag_cent || 0)) / 100;
  return {
    id: String(row.id || ''),
    kunde: extra.kunde || '',
    kundeId: row.kunde_id != null && String(row.kunde_id).trim() !== ''
      ? String(row.kunde_id).trim()
      : (extra.kundeId != null ? String(extra.kundeId).trim() : ''),
    ap: extra.ap || '',
    betreff: row.titel != null ? String(row.titel) : '',
    datum: extra.datum || agFormatDeFromIso(row.created_at),
    gueltig: extra.gueltig || '',
    zahlung: extra.zahlung || '30 Tage netto',
    einleitung: extra.einleitung || '',
    schluss: extra.schluss || '',
    inotiz: extra.inotiz || '',
    positionen: pos,
    rabatt: rabatt,
    mwst: typeof extra.mwst === 'number' ? extra.mwst : 19,
    status: String(row.status || 'entwurf'),
    erstellt: agFormatDeFromIso(row.created_at),
    netto: pos.length ? nettoCalc : nettoFromBetrag,
    vonAnfrage: extra.vonAnfrage || null,
  };
}
function agUiToApiBody(a) {
  var pos = Array.isArray(a.positionen) ? a.positionen : [];
  var zwischen = pos.reduce(function (acc, p) {
    return acc + (Number(p.menge) || 0) * (Number(p.ep) || 0);
  }, 0);
  var rabatt = typeof a.rabatt === 'number' ? a.rabatt : (parseInt(a.rabatt, 10) || 0);
  var nettoEur = zwischen - (zwischen * rabatt) / 100;
  var betragCent = Math.round(nettoEur * 100);
  var titel =
    a.betreff && String(a.betreff).trim() !== ''
      ? String(a.betreff).trim()
      : 'Angebot · ' + (a.kunde || '—');
  return {
    titel: titel,
    beschreibung: agBuildPayloadDescription(a),
    status: a.status || 'entwurf',
    betrag_cent: Number.isFinite(betragCent) ? betragCent : 0,
    kunde_id: a.kundeId != null && String(a.kundeId).trim() !== ''
      ? String(a.kundeId).trim()
      : null,
  };
}
function agReloadListeFromApi() {
  console.log('[angebote-view] agReloadListeFromApi start');
  return agApiFetch('/api/v1/ccintern/angebote', { method: 'GET' }).then(function (raw) {
    var rows = agPickAngeboteList(raw);
    if (typeof AG_DATEN === 'undefined') return;
    AG_DATEN.length = 0;
    rows.forEach(function (row) {
      var ui = agApiRowToUi(row);
      if (ui && ui.id) AG_DATEN.push(ui);
    });
  });
}
function agPostAngebot(body) {
  return agApiFetch('/api/v1/ccintern/angebote', { method: 'POST', body: body }).then(function (raw) {
    return agPickAngebot(raw);
  });
}
function agPutAngebotApi(a) {
  var body = agUiToApiBody(a);
  return agApiFetch('/api/v1/ccintern/angebote/' + encodeURIComponent(String(a.id)), {
    method: 'PUT',
    body: body,
  }).then(function (raw) {
    var row = agPickAngebot(raw);
    return row ? agApiRowToUi(row) : null;
  });
}
function agDeleteApi(id) {
  return agApiFetch('/api/v1/ccintern/angebote/' + encodeURIComponent(String(id)), {
    method: 'DELETE',
  });
}

var __agHydratedFromApi = false;
var __agListInflight = null;

function agAcToggle(n){
  const body=document.getElementById('agac-body-'+n);
  const arrow=document.getElementById('agac-arrow-'+n);
  if(!body||!arrow) return;
  const closed=body.classList.contains('ac-closed');
  body.classList.toggle('ac-closed',!closed);
  arrow.classList.toggle('open',closed);
}

// ── Kunden-Dropdown — zentrale Firmen-Quelle ─────────────────────────
// 1. Versucht Cockpit-Firmen / CCState.firmenStamm (bereits geladen)
// 2. Fallback: zentrale Firmen-API, danach CC-Intern-Kunden-API
var _agKundenCache = null;
function _agNormalizeKunde(k) {
  if (!k || typeof k !== 'object') return null;
  // Legacy `CCINTERN_KUNDEN.id` ist nur eine UI-Kennung (`kd-ckp-*`). Für
  // Relationen immer zuerst die echte Firmen-ID verwenden.
  var rawId = k.firma_id != null ? k.firma_id : (k.firmaId != null ? k.firmaId : k.id);
  var id = rawId != null ? String(rawId).trim() : '';
  var rawName = k.name != null ? k.name : (k.firma_name != null ? k.firma_name : (k.firmenname != null ? k.firmenname : (k.bezeichnung || '')));
  var name = rawName != null ? String(rawName).trim() : '';
  return name ? { id: id, name: name } : null;
}
function _agFillSelectFromRows(sel, rows, currentValue) {
  sel.innerHTML = '<option value="">— wählen —</option>';
  rows.forEach(function (k) {
    var kunde = _agNormalizeKunde(k);
    if (!kunde) return;
    var opt = document.createElement('option');
    opt.value = kunde.id || kunde.name;
    opt.textContent = kunde.name;
    opt.dataset.kundeName = kunde.name;
    if (kunde.id) opt.dataset.kundeId = kunde.id;
    sel.appendChild(opt);
  });
  if (currentValue != null && String(currentValue).trim() !== '') {
    var wanted = String(currentValue).trim();
    var match = Array.prototype.find.call(sel.options, function (opt) {
      return opt.value === wanted || opt.dataset.kundeId === wanted || opt.dataset.kundeName === wanted;
    });
    if (match) sel.value = match.value;
  }
}
function agFillKundenSelect(currentValue, currentId) {
  var sel = document.getElementById('ag-kunde');
  if (!sel) return;
  var selectedValue = currentId || currentValue;

  // 1. Aus COCKPIT_FIRMEN (synchron beim CC-Intern-Start befüllt, immer verfügbar)
  var rows = [];
  var pf = typeof window !== 'undefined' ? window.COCKPIT_FIRMEN : null;
  if (Array.isArray(pf) && pf.length) { rows = pf.slice(); }
  // 1b. Fallback: CCINTERN_KUNDEN
  if (!rows.length) {
    var ck = typeof window !== 'undefined' ? window.CCINTERN_KUNDEN : null;
    if (Array.isArray(ck) && ck.length) { rows = ck.slice(); }
  }
  // Die Cockpit-Bridge hydratisiert diesen Store direkt aus GET /api/v1/firmen.
  // Damit funktioniert die Auswahl auch dann, wenn ein Legacy-Loader seine
  // globalen Kundenarrays noch nicht gesetzt hat.
  if (!rows.length && typeof window !== 'undefined' && window.CCState && typeof window.CCState.get === 'function') {
    var fs = window.CCState.get('firmenStamm');
    if (fs && Array.isArray(fs.rows) && fs.rows.length) { rows = fs.rows.slice(); }
  }
  if (rows.length) { _agFillSelectFromRows(sel, rows, selectedValue); return; }

  // 2. Cache vorhanden
  if (_agKundenCache) { _agFillSelectFromRows(sel, _agKundenCache, selectedValue); return; }

  // 3. Fallback: API-Call. `/firmen` ist dieselbe Quelle wie der Kundenstamm
  // und wird bereits beim Cockpit-Mount verwendet.
  sel.innerHTML = '<option value="">Kunden werden geladen…</option>';
  agApiFetch('/api/v1/firmen')
    .then(function (data) {
      var d = agPickPayload(data);
      return d && Array.isArray(d.firmen) ? d.firmen : [];
    })
    .catch(function () {
      return agApiFetch('/api/v1/ccintern/kunden').then(function (data) {
        var d = agPickPayload(data);
        return d && Array.isArray(d.kunden) ? d.kunden : [];
      });
    })
    .then(function (list) {
      _agKundenCache = list.map(_agNormalizeKunde).filter(Boolean);
      var s2 = document.getElementById('ag-kunde');
      if (!s2) return;
      _agFillSelectFromRows(s2, _agKundenCache, selectedValue);
      if (!_agKundenCache.length) {
        s2.innerHTML = '<option value="">Keine Kunden vorhanden</option>';
      }
    })
    .catch(function (e) {
      var s3 = document.getElementById('ag-kunde');
      if (s3) s3.innerHTML = '<option value="">Kunden konnten nicht geladen werden</option>';
      console.warn('[agFillKundenSelect API]', e);
    });
}

function agModalOpen(id){
  agFlaeche = 0;
  ['ag-mass-b','ag-mass-h'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  var stk=document.getElementById('ag-mass-stk');if(stk)stk.value='1';
  var man=document.getElementById('ag-mass-manuell');if(man)man.checked=false;
  var anz=document.getElementById('ag-flaeche-anzeige');if(anz)anz.textContent='Fläche: — m²';

  // Datalist aus CC_PRODUKTE_LISTE befüllen (einmalig)
  var dl = document.getElementById('ag-betreff-list');
  if(dl && dl.children.length === 0){
    CC_PRODUKTE_LISTE.forEach(function(p){
      var l = ccLeistungById(p.leistungId);
      var opt = document.createElement('option');
      opt.value = (l ? l.label+' – ' : '') + p.label;
      dl.appendChild(opt);
    });
  }
  if(id){
    // Edit existing
    const a=AG_DATEN.find(x=>x.id===id); if(!a) return;
    document.getElementById('agModalTitle').textContent=a.id;
    document.getElementById('agModalId').textContent=a.status==='vonAnfrage'?'Aus Schnell-Anfrage':'';
    agFillKundenSelect(a.kunde, a.kundeId);
    document.getElementById('ag-ap').value=a.ap||'';
    document.getElementById('ag-datum').value=agDateReverse(a.datum);
    document.getElementById('ag-gueltig').value=agDateReverse(a.gueltig);
    document.getElementById('ag-betreff').value=a.betreff||'';
    document.getElementById('ag-einleitung').value=a.einleitung||'';
    document.getElementById('ag-schluss').value=a.schluss||'';
    document.getElementById('ag-inotiz').value=a.inotiz||'';
    document.getElementById('ag-rabatt').value=a.rabatt||0;
    document.getElementById('ag-mwst').value=a.mwst||19;
    agPositionen=[...a.positionen];
    agRenderPositionen();
    agCalcSumme();
    agAktivId=id;
  } else {
    // New
    document.getElementById('agModalTitle').textContent='Neues Angebot';
    document.getElementById('agModalId').textContent='';
    ['ag-kunde','ag-ap','ag-betreff','ag-einleitung','ag-schluss','ag-inotiz'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.value='';
    });
    agFillKundenSelect(null);
    document.getElementById('ag-rabatt').value=0;
    document.getElementById('ag-mwst').value=19;
    // Default dates
    const today=new Date(), gueltig=new Date();
    gueltig.setDate(gueltig.getDate()+30);
    document.getElementById('ag-datum').value=today.toISOString().split('T')[0];
    document.getElementById('ag-gueltig').value=gueltig.toISOString().split('T')[0];
    agPositionen=[];
    agRenderPositionen();
    agCalcSumme();
    agAktivId=null;
  }
  // Open accordion 1, close rest
  [1,2,3,4].forEach(n=>{
    const body=document.getElementById('agac-body-'+n);
    const arrow=document.getElementById('agac-arrow-'+n);
    if(n===1){body&&body.classList.remove('ac-closed');arrow&&arrow.classList.add('open');}
    else{body&&body.classList.add('ac-closed');arrow&&arrow.classList.remove('open');}
  });
  document.getElementById('agModal').classList.add('open');
}

function agModalClose(){
  document.getElementById('agModal').classList.remove('open');
  agAktivId=null;
}

function agDateReverse(str){
  if(!str) return '';
  const p=str.split('.');
  return p.length===3 ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` : str;
}

function agDateFormat(str){
  if(!str) return '';
  const d=new Date(str);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function agCalcPos(){
  const m=parseFloat(document.getElementById('agp-menge')?.value||0);
  const e=parseFloat(document.getElementById('agp-ep')?.value||0);
  const g=document.getElementById('agp-gesamt');
  if(g) g.value=m>0&&e>0?'€ '+(m*e).toFixed(2):'—';
}

function agAddPos(){
  const bez=document.getElementById('agp-bez')?.value?.trim();
  if(!bez){showToast('⚠ Bezeichnung fehlt');return;}
  const menge=parseFloat(document.getElementById('agp-menge')?.value||1);
  const ep=parseFloat(document.getElementById('agp-ep')?.value||0);
  const eh=document.getElementById('agp-eh')?.value||'Stk';
  const beschr=document.getElementById('agp-beschr')?.value||'';
  agPositionen.push({bez,eh,menge,ep,beschr});
  document.getElementById('agp-bez').value='';
  document.getElementById('agp-ep').value='';
  document.getElementById('agp-beschr').value='';
  document.getElementById('agp-menge').value='1';
  document.getElementById('agp-gesamt').value='';
  agRenderPositionen();
  agCalcSumme();
  showToast('✓ Position hinzugefügt');
}

function agCalcFlaeche(){
  const b   = parseFloat(document.getElementById('ag-mass-b')?.value||0);
  const h   = parseFloat(document.getElementById('ag-mass-h')?.value||0);
  const stk = parseInt(document.getElementById('ag-mass-stk')?.value||1);
  agFlaeche = Math.round(b * h * stk * 100) / 100;
  const anzeige = document.getElementById('ag-flaeche-anzeige');
  if(anzeige){
    anzeige.textContent = (b>0&&h>0)
      ? 'Fläche: '+b+' × '+h+' × '+stk+' = '+agFlaeche.toFixed(2)+' m²'
      : 'Fläche: — m²';
    anzeige.style.color = agFlaeche > 0 ? 'var(--blue)' : 'var(--text3)';
  }
  // Auto-update Menge in Menge-Feld wenn Einheit m² und nicht manuell
  const manuell = document.getElementById('ag-mass-manuell')?.checked;
  if(!manuell && agFlaeche > 0){
    const ehSel = document.getElementById('agp-eh');
    if(ehSel && ehSel.value === 'm²'){
      const mengeInp = document.getElementById('agp-menge');
      if(mengeInp){ mengeInp.value = agFlaeche.toFixed(2); agCalcPos(); }
    }
  }
}

function agMassToggle(){
  const manuell = document.getElementById('ag-mass-manuell')?.checked;
  const mengeInp = document.getElementById('agp-menge');
  if(mengeInp){
    mengeInp.readOnly = !manuell;
    mengeInp.style.background = manuell ? '#fff' : 'var(--gray-l)';
  }
  if(!manuell) agCalcFlaeche();
}

function agFlaecheUebernehmen(){
  if(agFlaeche <= 0){ showToast('⚠ Bitte erst Maße eingeben'); return; }
  // Update all existing m²-Positionen
  let updated = 0;
  agPositionen.forEach(function(p){
    if(p.eh === 'm²'){
      p.menge = agFlaeche;
      updated++;
    }
  });
  if(updated) agRenderPositionen(), agCalcSumme(), showToast('✓ '+updated+' m²-Position(en) auf '+agFlaeche.toFixed(2)+' m² aktualisiert');
  // Also set Menge field for new position
  const ehSel = document.getElementById('agp-eh');
  if(ehSel && ehSel.value === 'm²'){
    const mengeInp = document.getElementById('agp-menge');
    if(mengeInp){ mengeInp.value = agFlaeche.toFixed(2); agCalcPos(); }
  }
  if(!updated) showToast('Fläche: '+agFlaeche.toFixed(2)+' m² — wird bei nächster m²-Position verwendet');
}

function agAddSchnell(bez,ep,eh){
  // Wenn m²-Einheit und Fläche bekannt → Menge automatisch setzen
  const menge = (eh==='m²' && agFlaeche>0) ? agFlaeche : 1;
  agPositionen.push({bez,eh,menge,ep,beschr:''});
  agRenderPositionen();
  agCalcSumme();
  document.getElementById('agp-bez').value=bez;
  document.getElementById('agp-ep').value=ep;
  document.getElementById('agp-eh').value=eh;
  if(eh==='m²' && agFlaeche>0){
    document.getElementById('agp-menge').value=agFlaeche.toFixed(2);
  }
  agCalcPos();
  const b2=document.getElementById('agac-body-2');
  const a2=document.getElementById('agac-arrow-2');
  if(b2&&b2.classList.contains('ac-closed')){b2.classList.remove('ac-closed');a2&&a2.classList.add('open');}
  if(eh==='m²' && agFlaeche>0) showToast('✓ '+bez+' · '+menge.toFixed(2)+' m² automatisch eingetragen');
}

function agDeletePos(i){
  agPositionen.splice(i,1);
  agRenderPositionen();
  agCalcSumme();
}

function agRenderPositionen(){
  const el=document.getElementById('ag-pos-table'); if(!el) return;
  const cnt=agPositionen.length;
  const sub=document.getElementById('agac-sub-2');
  if(sub) sub.textContent=cnt>0?cnt+' Position'+(cnt>1?'en':''):'Keine Positionen';

  if(!cnt){
    el.innerHTML='<div style="padding:12px;font-size:12px;color:var(--text3);text-align:center;">Noch keine Positionen — unten hinzufügen oder Baustein wählen</div>';
    return;
  }
  el.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12px;">'
    +'<thead><tr style="background:var(--gray-l);">'
    +'<th style="padding:7px 10px;text-align:left;font-weight:600;color:var(--text2);">Pos.</th>'
    +'<th style="padding:7px 10px;text-align:left;font-weight:600;color:var(--text2);">Bezeichnung</th>'
    +'<th style="padding:7px 10px;text-align:right;font-weight:600;color:var(--text2);">Menge</th>'
    +'<th style="padding:7px 10px;text-align:left;font-weight:600;color:var(--text2);">Einheit</th>'
    +'<th style="padding:7px 10px;text-align:right;font-weight:600;color:var(--text2);">EP</th>'
    +'<th style="padding:7px 10px;text-align:right;font-weight:600;color:var(--text2);">Gesamt</th>'
    +'<th style="padding:7px 10px;"></th>'
    +'</tr></thead><tbody>'
    +agPositionen.map((p,i)=>`
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 10px;font-weight:700;color:var(--text3);">${i+1}</td>
        <td style="padding:8px 10px;"><div style="font-weight:500;">${p.bez}</div>${p.beschr?'<div style="font-size:11px;color:var(--text3);">'+p.beschr+'</div>':''}</td>
        <td style="padding:8px 10px;text-align:right;">${p.menge}</td>
        <td style="padding:8px 10px;">${p.eh}</td>
        <td style="padding:8px 10px;text-align:right;">€ ${p.ep.toFixed(2)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--blue);">€ ${(p.menge*p.ep).toFixed(2)}</td>
        <td style="padding:8px 10px;text-align:center;"><button data-idx="${i}" onclick="agDeletePos(+this.dataset.idx)" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px;">🗑</button></td>
      </tr>`).join('')
    +'</tbody></table>';
}

function agCalcSumme(){
  const zwischen=agPositionen.reduce((acc,p)=>acc+p.menge*p.ep,0);
  const rabatt=parseFloat(document.getElementById('ag-rabatt')?.value||0)/100;
  const mwstPct=parseInt(document.getElementById('ag-mwst')?.value||19);
  const rabattWert=zwischen*rabatt;
  const netto=zwischen-rabattWert;
  const mwst=netto*mwstPct/100;
  const brutto=netto+mwst;

  const fmt=v=>'€ '+v.toFixed(2).replace('.',',');
  const zel=id=>document.getElementById(id);
  if(zel('ag-zwischensumme'))   zel('ag-zwischensumme').textContent=fmt(zwischen);
  if(zel('ag-rabatt-row'))      zel('ag-rabatt-row').style.display=rabatt>0?'flex':'none';
  if(zel('ag-rabatt-lbl'))      zel('ag-rabatt-lbl').textContent='Rabatt '+Math.round(rabatt*100)+'%';
  if(zel('ag-rabatt-val'))      zel('ag-rabatt-val').textContent='– '+fmt(rabattWert);
  if(zel('ag-netto-total'))     zel('ag-netto-total').textContent=fmt(netto);
  if(zel('ag-mwst-lbl'))        zel('ag-mwst-lbl').textContent='+ MwSt. '+mwstPct+'%';
  if(zel('ag-mwst-val'))        zel('ag-mwst-val').textContent=fmt(mwst);
  if(zel('ag-brutto-total'))    zel('ag-brutto-total').textContent=fmt(brutto);
  if(zel('agac-sub-3'))         zel('agac-sub-3').textContent='Netto '+fmt(netto)+' · Brutto '+fmt(brutto);
  return {zwischen,netto,mwst,brutto,rabattWert};
}

function agSave(status){
  const kundeSelect=document.getElementById('ag-kunde');
  const kundeOption=kundeSelect && kundeSelect.selectedOptions ? kundeSelect.selectedOptions[0] : null;
  const kundeId=kundeOption ? (kundeOption.dataset.kundeId || kundeOption.value || '') : '';
  const kunde=kundeOption ? (kundeOption.dataset.kundeName || kundeOption.textContent || '').trim() : '';
  if(!kundeId || !kunde){showToast('⚠ Bitte Kunde wählen');return;}
  if(!agPositionen.length){showToast('⚠ Mindestens 1 Position nötig');return;}
  const {netto}=agCalcSumme();
  const id=agAktivId||('AG-2026-0'+agNr++);
  const obj={
    id, kunde, kundeId,
    ap:document.getElementById('ag-ap')?.value||'',
    betreff:document.getElementById('ag-betreff')?.value||'',
    datum:agDateFormat(document.getElementById('ag-datum')?.value),
    gueltig:agDateFormat(document.getElementById('ag-gueltig')?.value),
    zahlung:document.getElementById('ag-zahlung')?.value||'30 Tage netto',
    einleitung:document.getElementById('ag-einleitung')?.value||'',
    schluss:document.getElementById('ag-schluss')?.value||'',
    inotiz:document.getElementById('ag-inotiz')?.value||'',
    positionen:[...agPositionen],
    rabatt:parseInt(document.getElementById('ag-rabatt')?.value||0),
    mwst:parseInt(document.getElementById('ag-mwst')?.value||19),
    status, erstellt:agDateFormat(new Date().toISOString().split('T')[0]),
    netto:Math.round(netto*100)/100,
    vonAnfrage: agAktivId?AG_DATEN.find(x=>x.id===agAktivId)?.vonAnfrage:null,
  };

  // ── Cockpit-Modus: API-Persistenz (POST neu / PUT bestehend) ──
  if (window.__CCINTERN_COCKPIT_MOUNT__ && typeof agPostAngebot === 'function') {
    var statusToast = status === 'entwurf' ? 'Entwurf gespeichert' : 'Angebot gesendet · ' + kunde;
    if (agAktivId && agIsApiUuid(agAktivId)) {
      var draftPut = Object.assign({}, obj, { id: agAktivId });
      agPutAngebotApi(draftPut)
        .then(function (ui) {
          if (!ui || !ui.id) throw new Error('Ungültige API-Antwort');
          var idx = AG_DATEN.findIndex(function (x) { return x.id === ui.id; });
          if (idx >= 0) AG_DATEN[idx] = ui; else AG_DATEN.unshift(ui);
          agModalClose();
          window.renderAngebote();
          agOpenDetail(ui.id);
          showToast('✓ ' + statusToast);
        })
        .catch(function (err) {
          if (typeof showToast === 'function') {
            showToast('⚠ Speichern: ' + (err && err.message ? err.message : String(err)));
          }
        });
      return;
    }
    var body = agUiToApiBody(obj);
    agPostAngebot(body)
      .then(function (row) {
        var ui = agApiRowToUi(row);
        if (!ui || !ui.id) throw new Error('Ungültige API-Antwort');
        AG_DATEN.unshift(ui);
        agModalClose();
        window.renderAngebote();
        agOpenDetail(ui.id);
        showToast('✓ ' + statusToast);
      })
      .catch(function (err) {
        if (typeof showToast === 'function') {
          showToast('⚠ Speichern: ' + (err && err.message ? err.message : String(err)));
        }
      });
    return;
  }

  // ── Legacy (RAM / DataService) ──
  if(agAktivId){
    const idx=AG_DATEN.findIndex(x=>x.id===agAktivId);
    if(idx>=0) AG_DATEN[idx]=obj; else AG_DATEN.unshift(obj);
  } else {
    AG_DATEN.unshift(obj);
  }
  agModalClose();
  renderAngebote();
  agOpenDetail(id);
  showToast('✓ '+id+' · '+status==='entwurf'?'Entwurf gespeichert':'Angebot gesendet · '+kunde);
}

function agTab(el, tab){
  agAktivTab=tab;
  document.querySelectorAll('#pg-angebote .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  renderAngebote();
}

window.renderAngebote = function () {
  console.log('[angebote-view] renderAngebote called', window.__CCINTERN_COCKPIT_MOUNT__);
  if (window.__CCINTERN_COCKPIT_MOUNT__) {
    if (!__agListInflight) {
      __agListInflight = agReloadListeFromApi()
        .then(function () { __agHydratedFromApi = true; })
        .finally(function () { __agListInflight = null; });
    }
    __agListInflight
      .then(function () { renderAngeboteDom(); })
      .catch(function (err) {
        if (typeof showToast === 'function') {
          showToast('⚠ Angebote laden: ' + (err && err.message ? err.message : String(err)));
        }
        renderAngeboteDom();
      });
    return;
  }
  renderAngeboteDom();
};

function renderAngeboteDom(){
  const el=document.getElementById('ag-liste'); if(!el) return;
  let items=AG_DATEN;
  if(agAktivTab!=='alle') items=items.filter(a=>a.status===agAktivTab);

  // Stats
  const bearbeitung=AG_DATEN.filter(a=>a.status==='entwurf').length;
  const versendet=AG_DATEN.filter(a=>a.status==='versendet').length;
  const angenommen=AG_DATEN.filter(a=>a.status==='angenommen').length;
  const volumen=AG_DATEN.filter(a=>['entwurf','versendet'].includes(a.status)).reduce((acc,a)=>acc+(a.netto||0),0);
  const sb=id=>document.getElementById(id);
  if(sb('ag-stat-bearbeitung'))  sb('ag-stat-bearbeitung').textContent=bearbeitung;
  if(sb('ag-stat-versendet'))    sb('ag-stat-versendet').textContent=versendet;
  if(sb('ag-stat-angenommen'))   sb('ag-stat-angenommen').textContent=angenommen;
  if(sb('ag-stat-volumen'))      sb('ag-stat-volumen').textContent='€ '+volumen.toLocaleString('de-DE');

  const stCol={entwurf:'var(--blue)',versendet:'var(--amber)',angenommen:'var(--green)',abgelehnt:'var(--red)'}
  const stLbl={entwurf:'Entwurf',versendet:'Versendet',angenommen:'Angenommen ✓',abgelehnt:'Abgelehnt'}

  el.innerHTML=items.map(a=>{
    const col=stCol[a.status]||'var(--gray)';
    const lbl=stLbl[a.status]||a.status;
    const isActive=agAktivId===a.id;
    const fromAnf=a.vonAnfrage?' <span style="font-size:10px;padding:1px 6px;border-radius:8px;background:var(--green-l);color:var(--green);">⚡ aus Schnell-Anfrage</span>':'';
    return '<div onclick="agOpenDetail(\''+a.id+'\')" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;background:'+(isActive?'var(--blue-l)':'#fff')+';transition:background .1s;">'
      +'<div style="width:36px;height:36px;border-radius:9px;background:'+(isActive?'var(--blue)':'var(--blue-l)')+';display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:'+(isActive?'#fff':'var(--blue)')+';flex-shrink:0;">📄</div>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:11px;font-weight:700;color:var(--text3);">'+a.id+fromAnf+'</div>'
        +'<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+a.kunde+'</div>'
        +'<div style="font-size:11px;color:var(--text2);">'+a.betreff+'</div>'
        +'<div style="font-size:11px;color:var(--text3);">'+(a.positionen||[]).length+' Positionen · '+a.datum+'</div>'
      +'</div>'
      +'<div style="text-align:right;flex-shrink:0;">'
        +'<div style="font-size:14px;font-weight:700;color:var(--blue);">'+(a.netto?'€ '+a.netto.toFixed(0):'—')+'</div>'
        +'<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:'+col+'20;color:'+col+';font-weight:600;">'+lbl+'</span>'
      +'</div>'
    +'</div>';
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">Keine Angebote</div>';
}

function agOpenDetail(id){
  agAktivId=id;
  const a=AG_DATEN.find(x=>x.id===id); if(!a) return;
  renderAngebote();
  const ph=document.getElementById('ag-detail-ph');
  const body=document.getElementById('ag-detail-body');
  if(!ph||!body) return;

  const stCol={entwurf:'var(--blue)',versendet:'var(--amber)',angenommen:'var(--green)',abgelehnt:'var(--red)'}
  const stLbl={entwurf:'Entwurf',versendet:'Versendet',angenommen:'Angenommen ✓',abgelehnt:'Abgelehnt'}
  const col=stCol[a.status]||'var(--gray)';

  ph.innerHTML='<div style="display:flex;align-items:center;gap:8px;flex:1;">'
    +'<div class="ph-title">'+a.id+'</div>'
    +'<span class="bdg" style="background:'+col+'20;color:'+col+';">'+stLbl[a.status]+'</span>'
    +(a.vonAnfrage?'<span class="bdg" style="background:var(--green-l);color:var(--green);">⚡ aus Anfrage</span>':'')
    +'</div>'
    +'<button class="btn" onclick="agModalOpen(\''+a.id+'\')" style="font-size:11px;">✏ Bearbeiten</button>';

  // Positionen
  const zwischen=(a.positionen||[]).reduce((acc,p)=>acc+p.menge*p.ep,0);
  const rabattWert=zwischen*(a.rabatt||0)/100;
  const netto=zwischen-rabattWert;
  const mwst=netto*(a.mwst||19)/100;
  const brutto=netto+mwst;

  body.innerHTML=
    // Kopf
    '<div style="padding:14px 16px;border-bottom:1px solid var(--border);background:var(--gray-l);">'
    +'<div style="font-size:19px;font-weight:700;margin-bottom:3px;">'+a.kunde+'</div>'
    +'<div style="font-size:13px;color:var(--text2);">'+a.betreff+'</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-top:4px;">Datum: '+a.datum+' · Gültig bis: '+a.gueltig+' · '+a.zahlung+'</div>'
    +'</div>'
    // Positionen
    +'<div style="padding:12px 16px;border-bottom:1px solid var(--border);">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text2);letter-spacing:.06em;margin-bottom:8px;">Positionen ('+a.positionen.length+')</div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:12px;">'
    +'<thead><tr style="background:var(--gray-l);"><th style="padding:5px 8px;text-align:left;color:var(--text2);">Pos.</th><th style="padding:5px 8px;text-align:left;color:var(--text2);">Bezeichnung</th><th style="padding:5px 8px;text-align:right;color:var(--text2);">Menge</th><th style="padding:5px 8px;text-align:left;color:var(--text2);">EH</th><th style="padding:5px 8px;text-align:right;color:var(--text2);">EP</th><th style="padding:5px 8px;text-align:right;color:var(--text2);">Gesamt</th></tr></thead>'
    +'<tbody>'
    +a.positionen.map((p,i)=>'<tr style="border-bottom:1px solid var(--border);"><td style="padding:7px 8px;font-weight:700;color:var(--text3);">'+(i+1)+'</td><td style="padding:7px 8px;"><div>'+p.bez+'</div>'+(p.beschr?'<div style="font-size:10px;color:var(--text3);">'+p.beschr+'</div>':'')+'</td><td style="padding:7px 8px;text-align:right;">'+p.menge+'</td><td style="padding:7px 8px;">'+p.eh+'</td><td style="padding:7px 8px;text-align:right;">€ '+p.ep.toFixed(2)+'</td><td style="padding:7px 8px;text-align:right;font-weight:700;color:var(--blue);">€ '+(p.menge*p.ep).toFixed(2)+'</td></tr>').join('')
    +'</tbody></table></div>'
    // Summe
    +'<div style="padding:12px 16px;border-bottom:1px solid var(--border);background:var(--gray-l);">'
    +(a.rabatt>0?'<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--red);margin-bottom:3px;"><span>Rabatt '+a.rabatt+'%</span><span>– € '+rabattWert.toFixed(2)+'</span></div>':'')
    +'<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:3px;"><span>Netto</span><span style="color:var(--green);">€ '+netto.toFixed(2)+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:3px;"><span>MwSt. '+a.mwst+'%</span><span>€ '+mwst.toFixed(2)+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;"><span>Brutto</span><span style="color:var(--blue);">€ '+brutto.toFixed(2)+'</span></div>'
    +'</div>'
    // Aktionen
    +'<div style="padding:14px 16px;display:flex;flex-direction:column;gap:7px;">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text2);letter-spacing:.06em;margin-bottom:3px;">Aktionen</div>'
    +(a.status==='entwurf'?'<button data-aid="'+a.id+'" onclick="agSetStatus(this.dataset.aid,\'versendet\')" style="width:100%;padding:10px;background:var(--amber);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">📤 Angebot versenden</button>':'')
    +(a.status==='versendet'?'<button data-aid="'+a.id+'" onclick="agSetStatus(this.dataset.aid,\'angenommen\')" style="width:100%;padding:10px;background:var(--green);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">✓ Als angenommen markieren → Auftrag anlegen</button>':'')
    +(a.status==='angenommen'?'<div style="padding:10px;background:var(--green-l);border-radius:9px;font-size:13px;font-weight:600;color:var(--green);text-align:center;">✅ Angenommen · Auftrag angelegt</div>':'')
    +'<button data-aid="'+a.id+'" onclick="agModalOpen(this.dataset.aid)" style="width:100%;padding:9px;background:#fff;border:1.5px solid var(--border);border-radius:9px;font-size:13px;cursor:pointer;">✏ Bearbeiten</button>'
    +(a.status!=='angenommen'?'<button data-aid="'+a.id+'" onclick="agSetStatus(this.dataset.aid,\'abgelehnt\')" style="width:100%;padding:9px;background:#fff;border:1.5px solid var(--red);color:var(--red);border-radius:9px;font-size:13px;cursor:pointer;">✕ Als abgelehnt markieren</button>':'')
    +'</div>';
}

function agSetStatus(id, status){
  const a=AG_DATEN.find(x=>x.id===id); if(!a) return;
  function applyLocal() {
    a.status = status;
    renderAngebote();
    agOpenDetail(id);
    if (status === 'angenommen') showToast('🎉 Angenommen! → Auftrag wird angelegt · ' + id);
    else if (status === 'versendet') showToast('📤 Angebot versendet · ' + id);
    else if (status === 'abgelehnt') showToast('✕ Als abgelehnt markiert · ' + id);
  }
  if (window.__CCINTERN_COCKPIT_MOUNT__ && agIsApiUuid(id) && typeof agPutAngebotApi === 'function') {
    var pending = Object.assign({}, a, { status: status });
    agPutAngebotApi(pending)
      .then(function (ui) {
        if (ui) Object.assign(a, ui);
        else a.status = status;
        renderAngebote();
        agOpenDetail(id);
        if (status === 'angenommen') showToast('🎉 Angenommen! → Auftrag wird angelegt · ' + id);
        else if (status === 'versendet') showToast('📤 Angebot versendet · ' + id);
        else if (status === 'abgelehnt') showToast('✕ Als abgelehnt markiert · ' + id);
      })
      .catch(function (err) {
        if (typeof showToast === 'function') {
          showToast('⚠ Status: ' + (err && err.message ? err.message : String(err)));
        }
        applyLocal();
      });
    return;
  }
  applyLocal();
}

function anfZuAngebot(anfId){
  const anf=ANF_DATEN.find(x=>x.id===anfId); if(!anf) return;
  // Positionen aus Bausteinen generieren
  const flaeche=anf.b*anf.h*anf.stueck;
  const puffer=anf.puffer/100;
  const positionen=(anf.bausteine||[]).filter(b=>b.aktiv).map(b=>({
    bez:b.label+(b.typ==='m2'?' ('+flaeche.toFixed(1)+' m²)':''),
    eh:b.typ==='m2'?'m²':'pauschal',
    menge:b.typ==='m2'?flaeche:1,
    ep:b.preis,
    beschr:'',
  }));
  if(puffer>0){
    const sub=positionen.reduce((acc,p)=>acc+p.menge*p.ep,0);
    positionen.push({bez:'Aufschlag '+anf.puffer+'%',eh:'pauschal',menge:1,ep:Math.round(sub*puffer*100)/100,beschr:'Puffer / Zusatzaufwand'});
  }
  const gueltig=new Date(); gueltig.setDate(gueltig.getDate()+30);
  const leistungLabels={fahrzeug:'PKW / Fahrzeugbeschriftung',fenster:'Fensterfolie',schild:'Schilder & Beschriftungen',druck:'Digitaldruck / Banner',aufkleber:'Aufkleber & Sticker',sonstiges:'Leistungspaket'};
  const baseAg={
    kunde:anf.kunde, ap:anf.kontakt||'',
    betreff:(leistungLabels[anf.leistung]||'Angebot')+' – '+(anf.beschr||'').substring(0,50),
    datum:new Date().toLocaleDateString('de-DE'),
    gueltig:gueltig.toLocaleDateString('de-DE'),
    zahlung:'30 Tage netto',
    einleitung:'Sehr geehrte Damen und Herren,\n\ngerne unterbreiten wir Ihnen folgendes Angebot.',
    schluss:'Bei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\nCC Werbung GmbH',
    inotiz:'Erstellt aus Schnell-Anfrage '+anfId+(anf.notiz?' · '+anf.notiz:''),
    positionen,
    rabatt:0, mwst:19, status:'entwurf',
    erstellt:new Date().toLocaleDateString('de-DE'),
    netto:positionen.reduce((acc,p)=>acc+p.menge*p.ep,0),
    vonAnfrage:anfId,
  };

  // ── Cockpit-Modus: API persistieren, dann öffnen ──
  if (window.__CCINTERN_COCKPIT_MOUNT__ && typeof agPostAngebot === 'function') {
    agPostAngebot(agUiToApiBody(baseAg))
      .then(function (row) {
        var ui = agApiRowToUi(row);
        if (!ui || !ui.id) throw new Error('Ungültige API-Antwort');
        AG_DATEN.unshift(ui);
        anf.status = 'angebot';
        if (typeof goPage === 'function') {
          goPage('angebote', document.querySelector('[onclick*="angebote"]'), 'Angebote', 'Angebotsverwaltung');
        }
        window.renderAngebote();
        setTimeout(function () { agOpenDetail(ui.id); agModalOpen(ui.id); }, 200);
        showToast('⚡ ' + anfId + ' → ' + ui.id + ' · Angebot erstellt!');
      })
      .catch(function (err) {
        if (typeof showToast === 'function') {
          showToast('⚠ Konvertierung: ' + (err && err.message ? err.message : String(err)));
        }
      });
    return;
  }

  // ── Legacy (RAM) ──
  const agId='AG-2026-0'+agNr++;
  const newAg=Object.assign({id:agId}, baseAg);
  AG_DATEN.unshift(newAg);
  anf.status='angebot';
  goPage('angebote',document.querySelector('[onclick*="angebote"]'),'Angebote','Angebotsverwaltung');
  renderAngebote();
  setTimeout(()=>{ agOpenDetail(agId); agModalOpen(agId); },200);
  showToast('⚡ '+anfId+' → '+agId+' · Angebot erstellt!');
}

function tabAG(el,f){
  document.querySelectorAll('#pg-angebote .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  agTab(el,f);
}

function berechneAngebot(params){
  const {
    leistung='fahrzeug', b=0, h=0, stueck=1,
    material=null, laminat=null,
    ohne_druck=false,        // true = Plot/farbige Folie, kein Digitaldruck
    mit_laminat=true,        // false = Nutzer hat Laminat deaktiviert
    laminat_fix=false,       // true = Laminat nicht abschaltbar (Vollfolierung)
    zuschlag_pct=0,          // prozentualer Aufschlag auf Netto (z.B. 0.25 = +25%)
    mat_reflex=false,        // Reflexfolie: überschreibt Standardmaterial
    mat_lochfolie=false,     // Lochfolie/Scheibenfolie: überschreibt Standardmaterial
    grafik_std=1,            // Grafik-Stunden (frei eingegeben)
    aufwand='einfach',
    montage_std=null,       // Montage-Stunden (frei oder aus Staffel)
    liefertage=5,
    mit_demontage='', mit_altfolie=false,
    mit_reinigung=false, mit_vorbereitung=false,
    anfahrt='zone1',
    mit_plot=false, mit_daten=false,
    hoehe='', rabatt=0, mindest_override=null,
  } = params;

  const flaeche = Math.round(b * h * stueck * 100) / 100;
  const items = [];

  // ── 1. Material ─────────────────────────────────
  // Priorität: mat_reflex > mat_lochfolie > params.material > Empfehlung
  // Beide aktiv → teuereRes Material + 10% Kombinationsaufschlag
  let matKey = material || MAT_EMPFEHLUNG[leistung]?.material || 'ORAJET® 3551 GLOSSY';
  let matKombinationsaufschlag = 0;
  if(mat_reflex && mat_lochfolie){
    // Reflexfolie (85) teurer als Lochfolie (68) → Reflexfolie + 10%
    matKey = 'Reflexfolie 3M Engineer';
    matKombinationsaufschlag = 0.10;
  } else if(mat_reflex){
    matKey = 'Reflexfolie 3M Engineer';
  } else if(mat_lochfolie){
    matKey = 'Fensterfolie perforiert 50';
  }
  const matInfo = KALK.material[matKey];
  if(matInfo && flaeche > 0){
    const flaecheMitVerschnitt = Math.round(flaeche * (1 + KALK.druck.verschnitt) * 100) / 100;
    const matPreisBase = Math.round(matInfo.preis * flaecheMitVerschnitt * 100) / 100;
    const matPreis = Math.round(matPreisBase * (1 + matKombinationsaufschlag) * 100) / 100;
    const matLabel = ohne_druck
      ? 'Plotfolie (farbig, ohne Druck): '+matKey
      : 'Material (inkl. Druck): '+matKey+(matKombinationsaufschlag>0?' +10% Handling':'');
    items.push({ label:matLabel,
      detail:flaecheMitVerschnitt.toFixed(2)+' m² × € '+matInfo.preis.toFixed(2)+'/m²'+(matKombinationsaufschlag>0?' (+10%)':''),
      preis:matPreis, gruppe:'material', typ:'basis' });
  }

  // ── 2. Laminat ──────────────────────────────────
  // ohne_druck=true  → kein Laminat (Plot)
  // laminat_fix=true → immer Laminat (Vollfolierung, nicht abschaltbar)
  // mit_laminat=false → Nutzer hat deaktiviert (nur wenn nicht laminat_fix)
  const laminatAktiv = !ohne_druck && (laminat_fix || mit_laminat);
  const lamKey = laminatAktiv
    ? (laminat || matInfo?.laminat || MAT_EMPFEHLUNG[leistung]?.laminat || 'ohne Laminat')
    : 'ohne Laminat';
  const lamPreis = KALK.laminat[lamKey];
  if(lamPreis && flaeche > 0){
    const p = Math.round(lamPreis * flaeche * 100) / 100;
    items.push({ label:'Laminat: '+lamKey,
      detail:flaeche.toFixed(2)+' m² × € '+lamPreis+'/m²',
      preis:p, gruppe:'laminat', typ:'basis' });
  }

  // ── 3. Druck: entfallen (im Materialpreis enthalten) ──

  // ── 4. Grafik: 75 €/h × Stunden ────────────
  // 1h = Dateiübernahme / Kontrolle, >1h = echter Entwurf
  const grafikStd = parseFloat(grafik_std) || 1;
  const grafikPreis = Math.round(grafikStd * KALK.grafik.std_pro_h * 100) / 100;
  const grafikLabel = grafikStd <= 1
    ? 'Dateiübernahme / Kontrolle'
    : 'Grafik / Design';
  items.push({ label:grafikLabel,
    detail:grafikStd+' h × € '+KALK.grafik.std_pro_h+'/h',
    preis:grafikPreis, gruppe:'grafik', typ:'option' });

  // ── 5. Montage: 55 €/h — Fahrzeuggröße-Faktor einrechnen ──
  const schwFaktor = KALK.aufschlag.schwierig[aufwand] || 1.0;
  // Fahrzeuggröße-Faktor: nur bei Fahrzeug-Leistung anwenden
  const fzgCfg = (leistung === 'fahrzeug' && typeof ANF_FZG_GROESSE !== 'undefined')
    ? (ANF_FZG_CONFIG[ANF_FZG_GROESSE] || ANF_FZG_CONFIG['pkw-mittel'])
    : null;
  const fzgFaktor = fzgCfg ? fzgCfg.montageFaktor : 1.0;
  let montageStd;
  if(montage_std !== null && montage_std !== undefined && montage_std !== ''){
    montageStd = Math.round(parseFloat(montage_std) * fzgFaktor * 10) / 10;
  } else {
    // Richtwert aus Staffel × Schwierigkeit × Fahrzeuggröße
    const staffel = KALK.montage.staffel.find(s => flaeche <= s.bis) || KALK.montage.staffel[KALK.montage.staffel.length-1];
    montageStd = Math.round(staffel.h * schwFaktor * fzgFaktor * 10) / 10;
  }
  if(montageStd > 0){
    const fzgLabel = fzgCfg ? ' ('+fzgCfg.label+')' : '';
    const montageBase = Math.round(montageStd * KALK.montage.std_pro_h);
    items.push({ label:'Montage '+montageStd+'h × '+KALK.montage.std_pro_h+' €/h'+(aufwand!=='einfach'?' ('+aufwand+')':'')+fzgLabel,
      detail:'', preis:montageBase, gruppe:'montage', typ:'option' });
  }

  // ── 6. Demontage ────────────────────────────
  if(mit_demontage && KALK.demontage[mit_demontage]){
    const d=KALK.demontage[mit_demontage];
    items.push({ label:'Demontage ('+d.beschr+')', detail:'', preis:d.preis, gruppe:'demontage', typ:'option' });
  }
  if(mit_altfolie && flaeche>0){
    const p = Math.round((KALK.altfolie.proM2 + KALK.altfolie.kleberM2) * flaeche);
    items.push({ label:'Altfolien-Entfernung',
      detail:flaeche.toFixed(2)+' m² × € '+(KALK.altfolie.proM2+KALK.altfolie.kleberM2)+'/m²',
      preis:p, gruppe:'demontage', typ:'option' });
  }

  // ── 7. Vorbereitung: pauschal 50 € ──────────
  if(mit_reinigung || mit_vorbereitung){
    items.push({ label:'Reinigung & Vorbereitung (pauschal)',
      detail:'', preis:KALK.vorbereitung.preis, gruppe:'reinigung', typ:'option' });
  }

  // ── 8. Anfahrt: pauschal 50 € ───────────────
  const anfahrtInfo = KALK.anfahrt[anfahrt] || KALK.anfahrt.zone1;
  if(anfahrtInfo.preis > 0)
    items.push({ label:'Anfahrt ('+anfahrtInfo.beschr+')',
      detail:'', preis:anfahrtInfo.preis, gruppe:'anfahrt', typ:'option' });

  // ── 9. Zuschnitt / Plotten: pauschal 40 € ───
  if(mit_plot)  items.push({ label:'Zuschnitt / Plotten (pauschal)', detail:'', preis:KALK.produktion.plot_fix, gruppe:'produktion', typ:'option' });
  if(mit_daten) items.push({ label:'Datenaufbereitung', detail:'', preis:KALK.produktion.daten_fix, gruppe:'produktion', typ:'option' });

  // ── 10. Höhenzuschlag ───────────────────────
  if(hoehe && KALK.hoehe[hoehe])
    items.push({ label:KALK.hoehe[hoehe].beschr, detail:'', preis:KALK.hoehe[hoehe].preis, gruppe:'hoehe', typ:'zuschlag' });

  // ── 10b. Vorlage-Zuschlag (z.B. +25% Teilfolierung) ──
  if(zuschlag_pct > 0){
    const sumVorZuschlag = items.reduce((a,i)=>a+i.preis, 0);
    const zuschlagWert   = Math.round(sumVorZuschlag * zuschlag_pct * 100) / 100;
    items.push({ label:'Zuschlag Teilfolierung +'+Math.round(zuschlag_pct*100)+'%',
      detail:'auf € '+sumVorZuschlag.toFixed(2),
      preis:zuschlagWert, gruppe:'aufschlag', typ:'zuschlag' });
  }

  // ── 11. Express: +15% auf Gesamtnetto ───────
  let sumVorExpress = items.reduce((a,i)=>a+i.preis, 0);
  if(liefertage <= 3){
    const expressAufschlag = Math.round(sumVorExpress * KALK.aufschlag.express_pct * 100) / 100;
    if(expressAufschlag > 0)
      items.push({ label:'Express-Aufschlag +15% ('+liefertage+' Tage)',
        detail:'auf Netto € '+sumVorExpress.toFixed(2),
        preis:expressAufschlag, gruppe:'express', typ:'zuschlag' });
  }

  // ── 12. Mindestpreis ────────────────────────
  let summeNetto = items.reduce((a,i)=>a+i.preis, 0);
  // Vollfahrzeug-Mindest aus Fahrzeuggröße-Konfig (überschreibt KALK.mindest.fahrzeug)
  let kalkMindestFahrzeug = KALK.mindest[leistung] || 200;
  if(leistung === 'fahrzeug' && fzgCfg && mindest_override === null){
    kalkMindestFahrzeug = fzgCfg.mindestVoll;
  }
  const mindestLeistung = mindest_override !== null ? mindest_override : kalkMindestFahrzeug;
  const mindestGlobal   = KALK.mindest.global || 200;
  const mindest = Math.max(mindestLeistung, mindestGlobal);
  let mindestAufschlag = 0;
  if(summeNetto < mindest){
    mindestAufschlag = Math.round((mindest - summeNetto) * 100) / 100;
    items.push({ label:'Mindestpreisanpassung (Min. € '+mindest+')',
      detail:'', preis:mindestAufschlag, gruppe:'mindest', typ:'zuschlag' });
    summeNetto = mindest;
  }

  // ── 13. Rabatt ──────────────────────────────
  let rabattWert = 0;
  const effRabatt = Math.min(rabatt / 100, KALK.rabatt.standard_max);
  if(effRabatt > 0){
    rabattWert = Math.round(summeNetto * effRabatt * 100) / 100;
    summeNetto = Math.round((summeNetto - rabattWert) * 100) / 100;
  }
  const rabattFreigabe = (rabatt / 100) > KALK.rabatt.standard_max;

  // ── Marge / Kosten ──────────────────────────
  const summeBasis      = Math.round(items.filter(i=>i.typ==='basis').reduce((a,i)=>a+i.preis,0)*100)/100;
  const summeOptionen   = Math.round(items.filter(i=>i.typ==='option').reduce((a,i)=>a+i.preis,0)*100)/100;
  const summeZuschlaege = Math.round(items.filter(i=>i.typ==='zuschlag').reduce((a,i)=>a+i.preis,0)*100)/100;
  // Kostenstruktur: Material+Laminat = direkte Kosten, Montage/Grafik ~50% Arbeitslohn
  const gesamtkosten    = Math.round((summeBasis + summeOptionen * 0.5) * 100) / 100;
  const gewinnEuro      = Math.round((summeNetto - gesamtkosten) * 100) / 100;
  const gewinnPct       = gesamtkosten > 0 ? Math.round(gewinnEuro / gesamtkosten * 100) : 0;

  // ── 14. MwSt + Brutto ───────────────────────
  const mwst   = Math.round(summeNetto * KALK.mwst * 100) / 100;
  const brutto = Math.round((summeNetto + mwst) * 100) / 100;

  return {
    items, flaeche, rabattWert, effRabatt, rabattFreigabe,
    mindest, mindestAufschlag, summeNetto, mwst, brutto,
    matKey, lamKey,
    summeBasis, summeOptionen, summeZuschlaege,
    gesamtkosten, gewinnEuro, gewinnPct,
    // legacy
    aufschlagPct:0, summeVorAufschlag:summeNetto, aufschlagWert:0,
  };
}


// ─── Löschen (Cockpit: DELETE /api/v1/ccintern/angebote/:id) ─────────
window.agLoeschen = function (id) {
  if (typeof AG_DATEN === 'undefined') return;
  var ag = AG_DATEN.find(function (x) { return x.id === id; });
  if (!ag) return;
  function spliceLocal() {
    var idx = AG_DATEN.findIndex(function (x) { return x.id === id; });
    if (idx !== -1) AG_DATEN.splice(idx, 1);
    if (typeof window.renderAngebote === 'function') window.renderAngebote();
    if (typeof showToast === 'function') showToast('\ud83d\uddd1 Angebot gel\u00f6scht: ' + id);
  }
  function go() {
    if (window.__CCINTERN_COCKPIT_MOUNT__ && agIsApiUuid(id)) {
      agDeleteApi(id)
        .then(spliceLocal)
        .catch(function (err) {
          if (typeof showToast === 'function') {
            showToast('\u26a0 L\u00f6schen: ' + (err && err.message ? err.message : String(err)));
          }
        });
      return;
    }
    spliceLocal();
  }
  if (typeof ccInternConfirm === 'function') {
    ccInternConfirm(
      'Angebot "' + (ag.id || id) + '" von ' + (ag.kunde || '') + ' wirklich l\u00f6schen?\n' +
        'Dieser Vorgang kann nicht r\u00fcckg\u00e4ngig gemacht werden.',
      go,
    );
  } else {
    go();
  }
};

// `auftraege-detail-view.js` enthält aus Legacy-Zeiten noch gleichnamige
// Angebotsfunktionen und wird nach dieser Datei geladen. Die unverfälschten
// Handler sichern, damit der Cockpit-Boot sie nach dem Laden aller Skripte
// wiederherstellen kann.
window.__CCINTERN_CANONICAL_ANGEBOTE_HANDLERS__ = {
  agAcToggle: agAcToggle,
  agModalOpen: agModalOpen,
  agModalClose: agModalClose,
  agCalcPos: agCalcPos,
  agAddPos: agAddPos,
  agCalcFlaeche: agCalcFlaeche,
  agMassToggle: agMassToggle,
  agFlaecheUebernehmen: agFlaecheUebernehmen,
  agAddSchnell: agAddSchnell,
  agDeletePos: agDeletePos,
  agRenderPositionen: agRenderPositionen,
  agCalcSumme: agCalcSumme,
  agSave: agSave,
  agTab: agTab,
  renderAngebote: window.renderAngebote,
  agOpenDetail: agOpenDetail,
  agSetStatus: agSetStatus,
  anfZuAngebot: anfZuAngebot,
  tabAG: tabAG,
  berechneAngebot: berechneAngebot,
  agLoeschen: window.agLoeschen,
};
