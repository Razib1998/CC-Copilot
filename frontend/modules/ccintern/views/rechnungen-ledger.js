// ═══════════════════════════════════════════════════════════════════
// CC INTERN — Rechnungen + Lexware-Queue (aus migration/CC Inter End/DEV/index.html)
// loadRechnungen bevorzugt window.__CCINTERN_DEFAULT_SEEDS__.rechnungen
// ═══════════════════════════════════════════════════════════════════

function renderLexwareQueue(){
  var body  = document.getElementById('lexware-queue-body');
  var badge = document.getElementById('lexware-badge');
  if(!body) return;

  var queue = AUFTRAEGE.filter(function(a){
    return a.step === 'abgeschlossen' && !a.archiv && (!a.rechnung || a.rechnung === 'offen');
  });

  // Badge aktualisieren
  if(badge){
    badge.textContent = queue.length;
    badge.style.display = queue.length > 0 ? '' : 'none';
  }

  if(!queue.length){
    body.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--green);font-weight:600;">✅ Alle Aufträge abgerechnet — keine offenen Einträge</div>';
    return;
  }

  var rows = queue.map(function(a){
    var netto   = parseFloat(a.betrag||a.netto||0);
    var brutto  = parseFloat(a.brutto||0) || (netto * 1.19);
    var nettoFmt  = netto  > 0 ? netto.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €' : '—';
    var bruttoFmt = brutto > 0 ? brutto.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €' : '—';
    var hinweis = (a.notizProd||'').trim();
    // Abschlussdatum aus Schrittdaten
    var abgDat  = (a.schritte&&a.schritte.abgeschlossen&&a.schritte.abgeschlossen.fertigAm)
      ? a.schritte.abgeschlossen.fertigAm.substring(0,10).split('-').reverse().join('.')
      : (a.terminDatum ? a.terminDatum.split('-').reverse().join('.') : '—');

    return '<tr style="border-bottom:1px solid var(--border);">'
      +'<td style="padding:10px 12px;font-weight:700;color:var(--blue);white-space:nowrap;">'
        +'<a href="#" onclick="event.preventDefault();openAuftragDetail(\''+a.id+'\')" style="color:var(--blue);text-decoration:none;" title="Auftrag öffnen">'+a.id+'</a>'
      +'</td>'
      +'<td style="padding:10px 12px;font-weight:600;">'+a.kunde+'</td>'
      +'<td style="padding:10px 12px;font-size:11px;color:var(--text2);">'+(a.fz||'')+(a.paket?' · '+a.paket:'')+'</td>'
      +'<td style="padding:10px 12px;white-space:nowrap;">'+abgDat+'</td>'
      +'<td style="padding:10px 12px;text-align:right;font-weight:700;color:var(--text);">'+nettoFmt+'</td>'
      +'<td style="padding:10px 12px;text-align:right;font-size:11px;color:var(--text2);">'+bruttoFmt+'</td>'
      +'<td style="padding:10px 12px;max-width:240px;">'
        +(hinweis
          ? '<div style="background:#FFF8E1;border-left:3px solid var(--amber);border-radius:0 6px 6px 0;padding:5px 10px;font-size:11px;color:#5D4037;">'+hinweis+'</div>'
          : '<span style="font-size:11px;color:var(--text3);">—</span>')
      +'</td>'
      +'<td style="padding:10px 12px;text-align:right;">'
        +'<button onclick="lexwareErstellt(\''+a.id+'\')" '
          +'style="background:var(--green);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;" '
          +'title="Rechnung wurde in Lexware erfasst">✅ In Lexware erstellt</button>'
      +'</td>'
    +'</tr>';
  }).join('');

  body.innerHTML =
    '<table style="width:100%;border-collapse:collapse;">'
    +'<thead><tr style="background:var(--gray-l);">'
      +'<th style="padding:7px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.3px;">AU-Nr.</th>'
      +'<th style="padding:7px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.3px;">Kunde</th>'
      +'<th style="padding:7px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.3px;">FZ / Leistung</th>'
      +'<th style="padding:7px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.3px;">Abgeschlossen</th>'
      +'<th style="padding:7px 12px;text-align:right;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.3px;">Netto</th>'
      +'<th style="padding:7px 12px;text-align:right;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.3px;">Brutto (19%)</th>'
      +'<th style="padding:7px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.3px;">Hinweise für Rechnungserstellung</th>'
      +'<th style="padding:7px 12px;"></th>'
    +'</tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'</table>';
}

function lexwareErstellt(auId){
  var a = AUFTRAEGE.find(function(x){ return x.id === auId; });
  if(!a) return;
  a.rechnung   = 'geschrieben';
  saveAuftraege();
  renderLexwareQueue();
  renderKanban();
  renderAuftragVerwaltung();
  showToast('✅ '+auId+' — Rechnung erstellt (Status: geschrieben)');
}

// ══════════════════════════════════════════════════════════════════════
// RECHNUNGEN — Vollständiges Modul
// ══════════════════════════════════════════════════════════════════════

var DAL_KEY_RECHNUNGEN = 'cc_intern_rechnungen_v1';
var RECHNUNGEN = [];
var RE_EDIT_ID = null;
var RE_TAB = 'alle';
var RE_DETAIL_ID = null;

// ── Seed-Daten (erstmalig) ────────────────────────────────────────────
var RE_SEED = [
  {id:'RE-2026-014', datum:'2026-01-15', kunde:'DVG Duisburg', auftragId:'AU-2026-038',
   betreff:'Quartalsrechnung Q1 2026 · Fahrzeugwerbung Bus 412',
   positionen:[
     {bez:'Folienbeschriftung Bus 412 Außenwerbung', menge:1, ep:3200, einheit:'pauschal'},
     {bez:'Material Folie + Laminat', menge:1, ep:1650, einheit:'pauschal'},
     {bez:'Montage vor Ort Depot Mülheim', menge:8, ep:45, einheit:'Std.'}
   ],
   zahltage:14, faellig:'2026-02-01', status:'ueberfaellig',
   notiz:'Bankverbindung: DE12 3456 7890 1234 5678 · BIC: DEUTDEDB · Bitte RE-Nr. angeben.'},
  {id:'RE-2026-013', datum:'2026-03-01', kunde:'Bogestra AG', auftragId:'AU-2026-039',
   betreff:'Quartalsrechnung Q1 2026 · Teilgestaltung Bus 309, 501',
   positionen:[
     {bez:'Teilgestaltung Außenwerbung Bus 309', menge:1, ep:3800, einheit:'pauschal'},
     {bez:'Teilgestaltung Außenwerbung Bus 501', menge:1, ep:3500, einheit:'pauschal'},
     {bez:'Material Folie (45 lm)', menge:45, ep:8.5, einheit:'lm'},
     {bez:'Laminat (45 lm)', menge:45, ep:2.8, einheit:'lm'}
   ],
   zahltage:30, faellig:'2026-03-31', status:'versendet',
   notiz:''},
  {id:'RE-2026-012', datum:'2026-03-10', kunde:'Radio Essen', auftragId:'AU-2026-041',
   betreff:'Q1/Q2 2026 anteilig · Bus 1789 Seitenwand + Heck',
   positionen:[
     {bez:'Seitenwand + Heck Beklebung Bus 1789', menge:1, ep:2600, einheit:'pauschal'},
     {bez:'Grafik & Reinzeichnung', menge:4, ep:95, einheit:'Std.'},
     {bez:'Material Folie', menge:1, ep:820, einheit:'pauschal'}
   ],
   zahltage:60, faellig:'2026-06-30', status:'entwurf',
   notiz:'Rechnungsstellung nach Abnahme Endmontage.'},
  {id:'RE-2025-042', datum:'2025-12-20', kunde:'Ruhrbahn GmbH', auftragId:null,
   betreff:'Q4 2025 · Rahmenvertrag Fahrzeugwerbung Quartalsabrechnung',
   positionen:[
     {bez:'Beklebungen Oktober 2025 (7 Fahrzeuge)', menge:7, ep:1850, einheit:'Fzg.'},
     {bez:'Beklebungen November 2025 (6 Fahrzeuge)', menge:6, ep:1850, einheit:'Fzg.'},
     {bez:'Beklebungen Dezember 2025 (5 Fahrzeuge)', menge:5, ep:1850, einheit:'Fzg.'},
     {bez:'Material pauschale Q4', menge:1, ep:2800, einheit:'pauschal'}
   ],
   zahltage:14, faellig:'2026-01-31', status:'bezahlt',
   notiz:'Bezahlt am 28.01.2026. Danke!'}
];

function reIsCockpitRechnungenApiKontext() {
  return !!(
    typeof window !== 'undefined' &&
    window.__CCINTERN_COCKPIT_MOUNT__ &&
    window.CCIntern &&
    window.CCIntern.auth &&
    typeof window.CCIntern.auth.apiFetch === 'function'
  );
}

function loadRechnungen(){
  var cockpitApi = reIsCockpitRechnungenApiKontext();
  var s = window.CCIntern.DataService.load(DAL_KEY_RECHNUNGEN, null);
  if(s && Array.isArray(s) && s.length){
    RECHNUNGEN = s;
  } else if (cockpitApi) {
    RECHNUNGEN = [];
  } else {
    var g = window.__CCINTERN_DEFAULT_SEEDS__;
    var seed = (g && Array.isArray(g.rechnungen) && g.rechnungen.length) ? g.rechnungen : RE_SEED;
    RECHNUNGEN = seed.map(function(r){ return JSON.parse(JSON.stringify(r)); });
  }
  RECHNUNGEN.forEach(function(r){
    if(r._apiSynced !== false) r._apiSynced = true;
    if(r.faellig_am && !r.faellig) r.faellig = r.faellig_am;
  });
  if(!(s && Array.isArray(s) && s.length)){
    if (!cockpitApi) {
      saveRechnungenData();
    } else if (!RECHNUNGEN.length) {
      saveRechnungenData();
    }
  }
}
function saveRechnungenData(){
  window.CCIntern.DataService.save(DAL_KEY_RECHNUNGEN, RECHNUNGEN);
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────
function reFaelligAm(re){
  var v = re.faellig_am != null ? String(re.faellig_am) : re.faellig != null ? String(re.faellig) : '';
  return v.slice(0, 10);
}
function reDatumAnzeige(re){
  var d = re.datum != null ? String(re.datum) : re.erstellt_am != null ? String(re.erstellt_am) : '';
  return d.slice(0, 10);
}
function reIstUeberfaellig(r){
  var fd = reFaelligAm(r);
  if(!fd) return false;
  var today = new Date().toISOString().split('T')[0];
  if(fd >= today) return false;
  var st = r.status;
  if(st === 'bezahlt' || st === 'storniert') return false;
  if(st === 'ueberfaellig' || st === 'überfällig') return true;
  return st === 'offen' || st === 'gesendet' || st === 'teilbezahlt' || st === 'freigegeben' || st === 'in_pruefung' || st === 'versendet' || st === 'entwurf';
}
function reNrAnzeige(r){
  return (r.rechnungsnummer != null && String(r.rechnungsnummer).trim() !== '') ? String(r.rechnungsnummer) : String(r.id || '');
}
function reCalcNetto(re){
  if(re.netto != null && !isNaN(Number(re.netto))) return Number(re.netto);
  return (re.positionen||[]).reduce(function(s,p){ return s+(p.menge||0)*(p.ep||0); },0);
}
function reFmt(n){ return '€ '+n.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');  }
function reFmtDate(d){ if(!d) return '—'; var p=String(d).split('-'); return p.length>=3 ? p[2]+'.'+p[1]+'.'+p[0] : '—'; }
function reStatusBadge(s){
  var m={
    offen:'bb',in_pruefung:'bb',freigegeben:'ba',gesendet:'ba',teilbezahlt:'ba',
    bezahlt:'bg',storniert:'bgr',
    ueberfaellig:'br',versendet:'ba',entwurf:'bb'
  };
  var l={
    offen:'Offen',in_pruefung:'In Prüfung',freigegeben:'Freigegeben',gesendet:'Versendet',teilbezahlt:'Teilbezahlt',
    bezahlt:'Bezahlt',storniert:'Storniert',
    ueberfaellig:'Überfällig',versendet:'Versendet',entwurf:'Entwurf'
  };
  return '<span class="bdg '+(m[s]||'bgr')+'">'+(l[s]||s)+'</span>';
}
function reNextNr(){
  var y=new Date().getFullYear();
  var nums=RECHNUNGEN.map(function(r){
    var key = reNrAnzeige(r);
    if(typeof key !== 'string' || !key.startsWith('RE-'+y+'-')) return 0;
    return parseInt(key.split('-')[2],10)||0;
  });
  var max=nums.length ? Math.max.apply(null,nums) : 0;
  return 'RE-'+y+'-'+String(max+1).padStart(3,'0');
}

// ── Tab ───────────────────────────────────────────────────────────────
function reSetTab(el, tab){
  RE_TAB = tab;
  document.querySelectorAll('#re-tabs .tab').forEach(function(t){ t.classList.remove('active'); });
  el.classList.add('active');
  renderRechnungen();
}

// ── Render Liste ──────────────────────────────────────────────────────
function renderRechnungen(){
  if(!RECHNUNGEN.length) loadRechnungen();
  var q=(document.getElementById('re-search')||{}).value||'';
  var rows=RECHNUNGEN.filter(function(r){
    if(RE_TAB==='ueberfaellig' && !reIstUeberfaellig(r)) return false;
    if(RE_TAB==='versendet'    && r.status!=='gesendet' && r.status!=='teilbezahlt' && r.status!=='versendet') return false;
    if(RE_TAB==='entwurf'      && r.status!=='entwurf' && r.status!=='offen' && r.status!=='in_pruefung') return false;
    if(RE_TAB==='bezahlt'      && r.status!=='bezahlt') return false;
    if(q){
      var hay=(reNrAnzeige(r)+(r.kunde||'')+(r.betreff||'')+(r.angebot_id||'')).toLowerCase();
      if(!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }).sort(function(a,b){ return reDatumAnzeige(b).localeCompare(reDatumAnzeige(a)); });

  var tbody=document.getElementById('re-tbody'); if(!tbody) return;
  if(!rows.length){ tbody.innerHTML='<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--text3);">Keine Rechnungen gefunden</td></tr>'; return; }
  tbody.innerHTML=rows.map(function(r){
    var netto=reCalcNetto(r);
    var brutto=r.brutto != null && !isNaN(Number(r.brutto)) ? Number(r.brutto) : netto*1.19;
    var faelligCol=reIstUeberfaellig(r)?'color:var(--red);font-weight:600':'';
    var rid=String(r.id||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var auId=(r.auftragId||r.auftrag_id||'');
    var bet=(r.betreff||'').replace(/</g,'&lt;');
    return '<tr onclick="openReDetail(\''+rid+'\')">'
      +'<td><div class="tm">'+reNrAnzeige(r)+'</div>'
      +(auId?'<div class="ts">'+auId+'</div>':'')
      +(r.angebot_id?'<div class="ts" title="Angebot">Ang. '+String(r.angebot_id).slice(0,8)+'…</div>':'')
      +'</td>'
      +'<td><div class="tm">'+r.kunde+'</div></td>'
      +'<td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+bet+'</td>'
      +'<td>'+reFmt(netto)+'</td>'
      +'<td style="font-weight:700;'+faelligCol+'">'+reFmt(brutto)+'</td>'
      +'<td style="'+faelligCol+'">'+reFmtDate(reFaelligAm(r))+'</td>'
      +'<td>'+reStatusBadge(r.status)+'</td>'
      +'<td style="white-space:nowrap;">'
        +(reIstUeberfaellig(r)?'<button class="btn" style="font-size:11px;padding:3px 8px;margin-right:4px;" onclick="event.stopPropagation();reMahnung(\''+rid+'\')">📨 Mahnung</button>':'')
        +(r.status!=='bezahlt'&&r.status!=='storniert'?'<button class="btn p" style="font-size:11px;padding:3px 8px;" onclick="event.stopPropagation();reSetStatus(\''+rid+'\',\'bezahlt\')">✓ Bezahlt</button>':'')
      +'</td>'
      +'</tr>';
  }).join('');
  reUpdateStats();
}

function reUpdateStats(){
  if(!RECHNUNGEN.length && window.CCIntern.DataService.load(DAL_KEY_RECHNUNGEN,null)) loadRechnungen();
  var year=new Date().getFullYear()+'';
  var ue=RECHNUNGEN.filter(reIstUeberfaellig);
  var of=RECHNUNGEN.filter(function(r){ return r.status!=='bezahlt' && r.status!=='storniert'; });
  var en=RECHNUNGEN.filter(function(r){
    var st=r.status;
    return st==='entwurf'||st==='offen'||st==='in_pruefung';
  });
  var bz=RECHNUNGEN.filter(function(r){
    if(r.status!=='bezahlt') return false;
    var d=reDatumAnzeige(r);
    return d.startsWith(year);
  });
  function sumBrutto(arr){ return arr.reduce(function(s,r){return s+reCalcNetto(r)*1.19;},0); }
  var el=function(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; };
  el('re-stat-ueberfaellig', reFmt(sumBrutto(ue)));
  el('re-stat-offen',        reFmt(sumBrutto(of)));
  el('re-stat-entwurf',      reFmt(sumBrutto(en)));
  el('re-stat-bezahlt',      reFmt(sumBrutto(bz)));
}

// ── Status schnell setzen ─────────────────────────────────────────────
function reSetStatus(id, status){
  var r=RECHNUNGEN.find(function(x){return x.id===id;}); if(!r) return;
  r.status=status;
  r._apiSynced=false;
  saveRechnungenData();
  renderRechnungen();
  showToast('✓ Status: '+status);
}

// ── Mahnung ───────────────────────────────────────────────────────────
function reMahnung(id){
  var r=RECHNUNGEN.find(function(x){return x.id===id;}); if(!r) return;
  showToast('📨 Mahnung für '+r.id+' ('+r.kunde+') erstellt');
}

// ── Aus Aufträgen importieren ─────────────────────────────────────────
function reAuftragImport(){
  var candidates=AUFTRAEGE.filter(function(a){
    return a.step==='abgeschlossen' && a.rechnung==='offen'
      && !RECHNUNGEN.find(function(r){return r.auftragId===a.id;});
  });
  if(!candidates.length){ showToast('ℹ Keine neuen abgeschlossenen Aufträge ohne Rechnung'); return; }
  candidates.forEach(function(a){
    var nr=reNextNr();
    var today=new Date().toISOString().split('T')[0];
    var faellig=new Date(Date.now()+14*86400000).toISOString().split('T')[0];
    RECHNUNGEN.push({
      id:nr, datum:today, kunde:a.kunde||'Unbekannt', auftragId:(a.ccApiId||a.id),
      betreff:'Auftrag '+a.id+' · '+(a.fz||a.paket||''),
      positionen:[{bez:(a.paket||a.leistung||'Fahrzeugwerbung'), menge:1, ep:a.betrag||0, einheit:'pauschal'}],
      zahltage:14, faellig:faellig, faellig_am:faellig, status:'entwurf', notiz:'', _apiSynced:false
    });
  });
  saveRechnungenData();
  renderRechnungen();
  showToast('✓ '+candidates.length+' Rechnung(en) aus Aufträgen erstellt');
}

// ── Positionen UI ─────────────────────────────────────────────────────
function reAddPos(data){
  data=data||{bez:'',menge:1,ep:0,einheit:'pauschal'};
  var idx=document.querySelectorAll('#re-pos-liste .re-pos-row').length;
  var row=document.createElement('div');
  row.className='re-pos-row';
  row.style.cssText='display:grid;grid-template-columns:2.5fr 80px 100px 90px 28px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);';
  row.innerHTML='<input class="fi" placeholder="Leistungsbeschreibung" value="'+escHtml(data.bez||'')+'" style="font-size:12px;padding:6px 9px;">'
    +'<input class="fi" type="number" value="'+(data.menge||1)+'" min="0.01" step="0.5" style="font-size:12px;padding:6px 9px;text-align:right;" oninput="reCalcSum()">'
    +'<input class="fi" type="number" value="'+(data.ep||0)+'" min="0" step="0.01" placeholder="Einzelpreis" style="font-size:12px;padding:6px 9px;text-align:right;" oninput="reCalcSum()">'
    +'<input class="fi" value="'+(data.einheit||'pauschal')+'" placeholder="Einheit" style="font-size:12px;padding:6px 9px;">'
    +'<button onclick="this.closest(\'.re-pos-row\').remove();reCalcSum();" style="width:26px;height:26px;border:1px solid var(--border);background:#fff;border-radius:5px;cursor:pointer;font-size:14px;color:var(--red);">×</button>';
  document.getElementById('re-pos-liste').appendChild(row);
  reCalcSum();
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function reReadPositionen(){
  return Array.from(document.querySelectorAll('#re-pos-liste .re-pos-row')).map(function(row){
    var ins=row.querySelectorAll('input');
    return {bez:ins[0].value, menge:parseFloat(ins[1].value)||0, ep:parseFloat(ins[2].value)||0, einheit:ins[3].value||'pauschal'};
  });
}

function reCalcSum(){
  var pos=reReadPositionen();
  var netto=pos.reduce(function(s,p){return s+p.menge*p.ep;},0);
  var mwst=netto*0.19; var brutto=netto+mwst;
  var el=function(id,v){var e=document.getElementById(id);if(e)e.textContent=v;};
  el('re-sum-netto',reFmt(netto)); el('re-sum-mwst',reFmt(mwst)); el('re-sum-brutto',reFmt(brutto));
}

function reUpdateFaelligkeit(){
  var datum=document.getElementById('re-datum').value;
  var tage=parseInt(document.getElementById('re-zahltage').value)||14;
  if(datum){ var d=new Date(datum); d.setDate(d.getDate()+tage); document.getElementById('re-faellig').value=d.toISOString().split('T')[0]; }
}

function reKundeChanged(){
  var kunde=document.getElementById('re-kunde').value;
  var sel=document.getElementById('re-auftrag'); if(!sel) return;
  sel.innerHTML='<option value="">— optional —</option>';
  if(kunde){
    AUFTRAEGE.filter(function(a){return (a.kunde||'').includes(kunde.split(' ')[0]);})
      .forEach(function(a){ var o=document.createElement('option'); o.value=a.id; o.textContent=a.id+' · '+(a.fz||a.paket||''); sel.appendChild(o); });
  }
}

// ── Modal öffnen/schließen ────────────────────────────────────────────
function openRechnungModal(id){
  RE_EDIT_ID=id||null;
  var r=id?RECHNUNGEN.find(function(x){return x.id===id;}):null;
  document.getElementById('reModalTitle').textContent=r?'Rechnung bearbeiten: '+reNrAnzeige(r):'Neue Rechnung';
  var today=new Date().toISOString().split('T')[0];
  var faellig=new Date(Date.now()+14*86400000).toISOString().split('T')[0];
  document.getElementById('re-nr').value=r?reNrAnzeige(r):reNextNr();
  document.getElementById('re-datum').value=r?(r.datum||reDatumAnzeige(r)):today;
  document.getElementById('re-kunde').value=r?r.kunde:'';
  document.getElementById('re-betreff').value=r?r.betreff:'';
  document.getElementById('re-zahltage').value=r?r.zahltage:14;
  document.getElementById('re-faellig').value=r?(reFaelligAm(r)||r.faellig):faellig;
  var stSel=r?String(r.status||'entwurf'):'entwurf';
  if(stSel==='gesendet'||stSel==='teilbezahlt'||stSel==='freigegeben') stSel='versendet';
  else if(stSel==='offen'||stSel==='in_pruefung') stSel='entwurf';
  document.getElementById('re-status').value=stSel;
  document.getElementById('re-notiz').value=r?r.notiz:'';
  document.getElementById('re-pos-liste').innerHTML='';
  var pos=r?r.positionen:[{bez:'',menge:1,ep:0,einheit:'pauschal'}];
  pos.forEach(function(p){ reAddPos(p); });
  reCalcSum(); reKundeChanged();
  if(r&&r.auftragId){ setTimeout(function(){ document.getElementById('re-auftrag').value=r.auftragId; },50); }
  document.getElementById('reModal').classList.add('open');
}
function closeReModal(){ document.getElementById('reModal').classList.remove('open'); }

// ── Speichern ─────────────────────────────────────────────────────────
function saveRechnung(){
  var kunde=document.getElementById('re-kunde').value;
  var betreff=document.getElementById('re-betreff').value;
  if(!kunde||!betreff){ showToast('⚠ Bitte Kunde & Beschreibung ausfüllen'); return; }
  var pos=reReadPositionen();
  if(!pos.length){ showToast('⚠ Mindestens eine Position erforderlich'); return; }
  var aufSel=document.getElementById('re-auftrag').value||'';
  var aufIdResolved=aufSel||null;
  if(aufSel && typeof AUFTRAEGE !== 'undefined' && AUFTRAEGE && AUFTRAEGE.find){
    var ax=AUFTRAEGE.find(function(x){
      return x && (String(x.id)===aufSel || String(x.auftragsnummer||'')===aufSel || String(x.ccApiId||'')===aufSel);
    });
    if(ax && ax.ccApiId) aufIdResolved=String(ax.ccApiId);
  }
  var faVal=document.getElementById('re-faellig').value;
  var obj={
    id:document.getElementById('re-nr').value,
    datum:document.getElementById('re-datum').value,
    kunde:kunde,
    auftragId:aufIdResolved,
    betreff:betreff,
    positionen:pos,
    zahltage:parseInt(document.getElementById('re-zahltage').value)||14,
    faellig:faVal,
    faellig_am:faVal,
    status:document.getElementById('re-status').value,
    notiz:document.getElementById('re-notiz').value,
    _apiSynced:false
  };
  if(RE_EDIT_ID){
    var idx=RECHNUNGEN.findIndex(function(x){return x.id===RE_EDIT_ID;});
    if(idx>=0){
      var prev=RECHNUNGEN[idx];
      if(prev && prev.rechnungsnummer) obj.rechnungsnummer=prev.rechnungsnummer;
      if(prev && prev.id && /^[0-9a-f-]{36}$/i.test(String(prev.id))) obj.id=prev.id;
      RECHNUNGEN[idx]=obj;
    }
  } else {
    RECHNUNGEN.unshift(obj);
  }
  saveRechnungenData();
  closeReModal();
  renderRechnungen();
  showToast('✓ Rechnung '+obj.id+' gespeichert');
}

// ── Detail-Panel ──────────────────────────────────────────────────────
function openReDetail(id){
  var r=RECHNUNGEN.find(function(x){return x.id===id;}); if(!r) return;
  RE_DETAIL_ID=id;
  var rid=String(r.id||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  document.getElementById('reDetailTitle').textContent='Rechnung '+reNrAnzeige(r);
  var netto=reCalcNetto(r);
  var brutto=r.brutto != null && !isNaN(Number(r.brutto)) ? Number(r.brutto) : netto*1.19;
  var mwst=brutto-netto;
  var isUe=reIstUeberfaellig(r);
  var bet=(r.betreff||'').replace(/</g,'&lt;');
  document.getElementById('reDetailBody').innerHTML=
    '<div class="dp-section">'
    +'<div class="dp-slbl">Rechnungsdaten</div>'
    +'<div class="dp-row"><span class="dp-lbl">Rechnungs-Nr.</span><span class="dp-val">'+reNrAnzeige(r)+'</span></div>'
    +'<div class="dp-row"><span class="dp-lbl">Datum</span><span class="dp-val">'+reFmtDate(reDatumAnzeige(r))+'</span></div>'
    +'<div class="dp-row"><span class="dp-lbl">Kunde</span><span class="dp-val" style="font-weight:600;">'+r.kunde+'</span></div>'
    +'<div class="dp-row"><span class="dp-lbl">Beschreibung</span><span class="dp-val" style="text-align:right;max-width:260px;">'+bet+'</span></div>'
    +'<div class="dp-row"><span class="dp-lbl">Verknüpfter Auftrag</span><span class="dp-val">'+(r.auftragId||r.auftrag_id||'—')+'</span></div>'
    +(r.angebot_id?'<div class="dp-row"><span class="dp-lbl">Angebot (ID)</span><span class="dp-val" style="font-size:11px;">'+String(r.angebot_id)+'</span></div>':'')
    +'<div class="dp-row"><span class="dp-lbl">Fällig am</span><span class="dp-val" style="'+(isUe?'color:var(--red);font-weight:700':'')+'">'+reFmtDate(reFaelligAm(r))+(isUe?' ⚠ ÜBERFÄLLIG':'')+'</span></div>'
    +'<div class="dp-row"><span class="dp-lbl">Status</span><span class="dp-val">'+reStatusBadge(r.status)+'</span></div>'
    +'</div>'
    +'<div class="dp-section">'
    +'<div class="dp-slbl">Positionen</div>'
    +(r.positionen||[]).map(function(p,i){
      return '<div style="padding:7px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
        +'<div style="flex:1;"><div style="font-size:12px;font-weight:500;">'+p.bez+'</div>'
        +'<div style="font-size:11px;color:var(--text2);">'+p.menge+' '+p.einheit+' × '+reFmt(p.ep)+'</div></div>'
        +'<div style="font-size:13px;font-weight:600;white-space:nowrap;">'+reFmt(p.menge*p.ep)+'</div>'
        +'</div>';
    }).join('')
    +'<div style="padding:10px 0;display:flex;flex-direction:column;gap:4px;border-top:2px solid var(--border);margin-top:4px;">'
    +'<div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:var(--text2);">Netto</span><span>'+reFmt(netto)+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:var(--text2);">MwSt. 19%</span><span>'+reFmt(mwst)+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;"><span>Brutto</span><span style="color:var(--green);">'+reFmt(brutto)+'</span></div>'
    +'</div>'
    +'</div>'
    +(r.notiz?'<div class="dp-section"><div class="dp-slbl">Notiz / Zahlungshinweis</div><div style="font-size:12px;color:var(--text2);padding:4px 0;">'+r.notiz+'</div></div>':'')
    +'<div class="dp-footer">'
    +(r.status!=='bezahlt'&&r.status!=='storniert'?'<button class="btn p" onclick="reSetStatus(\''+rid+'\',\'bezahlt\');closeReDetail();" style="font-size:12px;">✓ Als bezahlt markieren</button>':'')
    +(isUe?'<button class="btn" onclick="reMahnung(\''+rid+'\')" style="font-size:12px;">📨 Mahnung erstellen</button>':'')
    +'<button class="btn" onclick="reSetStatus(\''+rid+'\',\'storniert\')" style="font-size:12px;color:var(--red);">🚫 Stornieren</button>'
    +'</div>';
  document.getElementById('reDetailOv').classList.add('open');
}
function closeReDetail(){ document.getElementById('reDetailOv').classList.remove('open'); }
function reEditFromDetail(){ if(RE_DETAIL_ID){ closeReDetail(); openRechnungModal(RE_DETAIL_ID); } }
function rePrintFromDetail(){ if(RE_DETAIL_ID){ closeReDetail(); setTimeout(function(){ reVorschauById(RE_DETAIL_ID); },200); } }

// ── PDF / Druckvorschau ───────────────────────────────────────────────
function reVorschau(){
  var nr=document.getElementById('re-nr').value;
  var pos=reReadPositionen();
  var netto=pos.reduce(function(s,p){return s+p.menge*p.ep;},0);
  var mwst=netto*0.19; var brutto=netto+mwst;
  var tmp={
    id:nr, datum:document.getElementById('re-datum').value,
    kunde:document.getElementById('re-kunde').value,
    betreff:document.getElementById('re-betreff').value,
    positionen:pos, faellig:document.getElementById('re-faellig').value,
    zahltage:parseInt(document.getElementById('re-zahltage').value)||14,
    notiz:document.getElementById('re-notiz').value, status:'entwurf'
  };
  closeReModal();
  setTimeout(function(){ reShowPrint(tmp); },200);
}
function reVorschauById(id){
  var r=RECHNUNGEN.find(function(x){return x.id===id;}); if(!r) return;
  reShowPrint(r);
}
function reShowPrint(r){
  var netto=reCalcNetto(r);
  var brutto=r.brutto != null && !isNaN(Number(r.brutto)) ? Number(r.brutto) : netto*1.19;
  var mwst=brutto-netto;
  var html='<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:0 10px;">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">'
      +'<div><div style="font-size:22px;font-weight:800;color:#1565C0;letter-spacing:-0.5px;">CC Werbung GmbH</div>'
      +'<div style="font-size:12px;color:#666;margin-top:4px;">Frintroper Str. · 45359 Essen<br>Tel: 0201 / 123456 · info@cc-werbung.de<br>USt-IdNr.: DE123456789</div></div>'
      +'<div style="text-align:right;">'
        +'<div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.06em;">Rechnung</div>'
        +'<div style="font-size:24px;font-weight:700;color:#0D47A1;">'+reNrAnzeige(r)+'</div>'
        +'<div style="font-size:12px;color:#666;margin-top:4px;">Datum: '+reFmtDate(reDatumAnzeige(r))+'<br>Fällig: '+reFmtDate(reFaelligAm(r))+' ('+(r.zahltage||14)+' Tage)</div>'
      +'</div>'
    +'</div>'
    +'<div style="margin-bottom:24px;padding:14px 16px;background:#F5F8FF;border-left:4px solid #1565C0;border-radius:4px;">'
      +'<div style="font-size:11px;color:#666;margin-bottom:4px;">RECHNUNGSEMPFÄNGER</div>'
      +'<div style="font-size:15px;font-weight:700;">'+r.kunde+'</div>'
    +'</div>'
    +'<div style="font-size:14px;font-weight:600;margin-bottom:20px;">Betreff: '+(r.betreff||'—')+'</div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">'
      +'<thead><tr style="background:#1565C0;color:#fff;">'
        +'<th style="padding:10px 12px;text-align:left;">Pos.</th>'
        +'<th style="padding:10px 12px;text-align:left;">Beschreibung</th>'
        +'<th style="padding:10px 12px;text-align:right;">Menge</th>'
        +'<th style="padding:10px 12px;text-align:right;">Einheit</th>'
        +'<th style="padding:10px 12px;text-align:right;">EP (€)</th>'
        +'<th style="padding:10px 12px;text-align:right;">GP (€)</th>'
      +'</tr></thead><tbody>'
    +(r.positionen||[]).map(function(p,i){
      var bg=i%2===0?'#fff':'#F9FAFB';
      return '<tr style="background:'+bg+';">'
        +'<td style="padding:9px 12px;border-bottom:1px solid #E5E7EB;">'+(i+1)+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid #E5E7EB;">'+p.bez+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid #E5E7EB;text-align:right;">'+p.menge+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid #E5E7EB;text-align:right;">'+p.einheit+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid #E5E7EB;text-align:right;">'+p.ep.toFixed(2).replace('.',',')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:600;">'+(p.menge*p.ep).toFixed(2).replace('.',',')+'</td>'
        +'</tr>';
    }).join('')
    +'</tbody></table>'
    +'<div style="display:flex;justify-content:flex-end;margin-bottom:24px;">'
      +'<div style="width:280px;">'
        +'<div style="display:flex;justify-content:space-between;padding:6px 12px;font-size:13px;"><span style="color:#666;">Nettobetrag</span><span>'+reFmt(netto)+'</span></div>'
        +'<div style="display:flex;justify-content:space-between;padding:6px 12px;font-size:13px;"><span style="color:#666;">MwSt. 19%</span><span>'+reFmt(mwst)+'</span></div>'
        +'<div style="display:flex;justify-content:space-between;padding:10px 12px;font-size:16px;font-weight:800;background:#1565C0;color:#fff;border-radius:6px;margin-top:4px;"><span>Gesamtbetrag</span><span>'+reFmt(brutto)+'</span></div>'
      +'</div>'
    +'</div>'
    +(r.notiz?'<div style="padding:14px;background:#FFF3E0;border-radius:6px;font-size:12px;color:#666;margin-bottom:20px;"><strong>Zahlungshinweis:</strong> '+r.notiz+'</div>':'')
    +'<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB;font-size:11px;color:#999;text-align:center;">'
      +'CC Werbung GmbH · Amtsgericht Essen HRB 12345 · Geschäftsführer: Celal · USt-IdNr.: DE123456789'
    +'</div>'
    +'</div>';
  document.getElementById('re-print-content').innerHTML=html;
  document.getElementById('re-print-ov').style.display='flex';
}
function reDoPrint(){
  var printContent=document.getElementById('re-print-content').innerHTML;
  var win=window.open('','_blank','width=800,height=900');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rechnung</title>'
    +'<style>body{font-family:Arial,sans-serif;padding:20px;margin:0;}@media print{body{padding:0;}}</style>'
    +'</head><body>'+printContent+'</body></html>');
  win.document.close();
  setTimeout(function(){ win.print(); },400);
}
