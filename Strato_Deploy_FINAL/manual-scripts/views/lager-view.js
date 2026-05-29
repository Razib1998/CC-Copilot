// ════════════════════════════════════════════════════════════════════
// CC INTERN — Materiallager
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/lager-view.js
// Enthält:  renderLagerCC, lagerBestellModal, lagerArtikelModal, Lieferanten
//
// Cockpit: GET /api/v1/lager → reloadLagerFromApiIntoLagCc (ccintern-cockpit-api.js).
// Buchungen: POST /api/v1/lager/:id/buchungen (entnahme / zugang).
// ════════════════════════════════════════════════════════════════════

var LAGER_FILTER = 'alle';
var _lagerActIdx = -1;

/**
 * Vorschläge für Einheit im Artikel-Dialog (HTML datalist). Freie Eingabe bleibt möglich.
 * Backend `/api/v1/lager`: `einheit` ist beliebiger Text — kein Enum.
 */
var LAGER_MATERIAL_EINHEITEN = ['Stk.', 'Stk', 'Stück', 'lfm', 'm²', 'Fl.', 'Pk.', 'Rolle', 'Kg', 'Liter'];

/** Standard-Lagerbestand (migration/CC Inter End/DEV/index.html, LAGER_CC) */
var LAGER_CC_DEFAULT_SEED = [
  { art: 'ORAJET® 3551 GLOSSY 137cm', kat: 'folie', nr: 'ORA-3551-G137', eh: 'lfm', bestand: 85, mindest: 20, status: 'ok' },
  { art: 'ORAJET® 3551 GLOSSY 105cm', kat: 'folie', nr: 'ORA-3551-G105', eh: 'lfm', bestand: 42, mindest: 20, status: 'ok' },
  { art: 'ORAJET® 3162 CAST MATT 105cm', kat: 'folie', nr: 'ORA-3162-M105', eh: 'lfm', bestand: 8, mindest: 15, status: 'warn' },
  { art: 'ORAJET® 3162 CAST MATT 137cm', kat: 'folie', nr: 'ORA-3162-M137', eh: 'lfm', bestand: 0, mindest: 15, status: 'leer' },
  { art: 'Avery MPI 1105 EA RS 137cm', kat: 'folie', nr: 'AVY-1105-137', eh: 'lfm', bestand: 23, mindest: 10, status: 'ok' },
  { art: 'VakoSun Protect 20A 152cm', kat: 'folie', nr: 'VAK-20A-152', eh: 'lfm', bestand: 5, mindest: 10, status: 'warn' },
  { art: 'mactac MACal 9888 CAST 123cm', kat: 'folie', nr: 'MAC-9888-123', eh: 'lfm', bestand: 0, mindest: 10, status: 'leer' },
  { art: 'ORAGUARD® 200M MATT 137cm', kat: 'laminat', nr: 'OG-200M-137', eh: 'lfm', bestand: 60, mindest: 20, status: 'ok' },
  { art: 'ORAGUARD® 215G GLOSSY 137cm', kat: 'laminat', nr: 'OG-215G-137', eh: 'lfm', bestand: 55, mindest: 20, status: 'ok' },
  { art: 'ORAGUARD® 215G GLOSSY 105cm', kat: 'laminat', nr: 'OG-215G-105', eh: 'lfm', bestand: 12, mindest: 15, status: 'warn' },
  { art: 'Avery DOL 1460Z GLOSSY 137cm', kat: 'laminat', nr: 'AVY-DOL-137', eh: 'lfm', bestand: 18, mindest: 10, status: 'ok' },
  { art: 'IPA 70% Isopropanol 1L', kat: 'reinigung', nr: 'IPA-70-1L', eh: 'Fl.', bestand: 12, mindest: 5, status: 'ok' },
  { art: 'IPA 70% Isopropanol 5L', kat: 'reinigung', nr: 'IPA-70-5L', eh: 'Fl.', bestand: 3, mindest: 4, status: 'warn' },
  { art: 'Aktivator Primer 250ml', kat: 'reinigung', nr: 'AKT-250', eh: 'Fl.', bestand: 6, mindest: 4, status: 'ok' },
  { art: 'Klebstoff-Entferner 500ml', kat: 'reinigung', nr: 'KLE-500', eh: 'Fl.', bestand: 0, mindest: 3, status: 'leer' },
  { art: 'Rakeln hart (10er Pack)', kat: 'werkzeug', nr: 'RAK-HART-10', eh: 'Pk.', bestand: 4, mindest: 2, status: 'ok' },
  { art: 'Rakeln weich (10er Pack)', kat: 'werkzeug', nr: 'RAK-WEICH-10', eh: 'Pk.', bestand: 1, mindest: 2, status: 'warn' },
  { art: 'Cutter-Klingen 100er', kat: 'werkzeug', nr: 'CUT-100', eh: 'Pk.', bestand: 8, mindest: 3, status: 'ok' },
  { art: 'Heißluftpistole 1800W', kat: 'werkzeug', nr: 'HLP-1800', eh: 'Stk', bestand: 3, mindest: 2, status: 'ok' },
  { art: 'Folienstift silber', kat: 'werkzeug', nr: 'FST-SIL', eh: 'Stk', bestand: 0, mindest: 5, status: 'leer' },
  { art: 'HP 831 Latex Cyan 775ml', kat: 'farbe', nr: 'HP-831-C', eh: 'Fl.', bestand: 3, mindest: 2, status: 'ok' },
  { art: 'HP 831 Latex Magenta 775ml', kat: 'farbe', nr: 'HP-831-M', eh: 'Fl.', bestand: 1, mindest: 2, status: 'warn' },
  { art: 'HP 831 Latex Yellow 775ml', kat: 'farbe', nr: 'HP-831-Y', eh: 'Fl.', bestand: 2, mindest: 2, status: 'ok' },
  { art: 'HP 831 Latex Black 775ml', kat: 'farbe', nr: 'HP-831-K', eh: 'Fl.', bestand: 0, mindest: 2, status: 'leer' },
  { art: 'HP 831 Latex Light Cyan', kat: 'farbe', nr: 'HP-831-LC', eh: 'Fl.', bestand: 2, mindest: 2, status: 'ok' },
  { art: 'HP 831 Latex Light Magenta', kat: 'farbe', nr: 'HP-831-LM', eh: 'Fl.', bestand: 1, mindest: 2, status: 'warn' },
  { art: 'HP Optimierer 775ml', kat: 'farbe', nr: 'HP-OPT', eh: 'Fl.', bestand: 0, mindest: 1, status: 'leer' },
];

/** Nach loadLager: leeren Speicher mit Standard-Artikeln füllen — nur ohne erfolgreiche Lager-API (lokal/DAL). */
function seedLagerCcIfEmpty() {
  if (typeof window.LAGER_CC === 'undefined' || !Array.isArray(window.LAGER_CC)) window.LAGER_CC = [];
  if (window.LAGER_CC.length > 0) return;
  // Cockpit: kein Demo-Seed — Bestand ausschließlich über /api/v1/lager
  if (window.__CCINTERN_COCKPIT_MOUNT__) return;
  if (window.__CCINTERN_LAGER_API_OK === true) return;
  LAGER_CC_DEFAULT_SEED.forEach(function (row) {
    var o = {};
    for (var k in row) {
      if (Object.prototype.hasOwnProperty.call(row, k)) o[k] = row[k];
    }
    o.bestellt = 0;
    window.LAGER_CC.push(o);
  });
  if (typeof saveLager === 'function') saveLager();
}

function lagerIsUuid(v) {
  var s = v != null ? String(v).trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** Cockpit: ohne lebende Lager-API keine lokalen Bestands-/Listenänderungen als Ersatzdatenquelle. */
function lagerCockpitBlockIfNoLiveApi(msg) {
  if (!window.__CCINTERN_COCKPIT_MOUNT__) return false;
  if (window.__CCINTERN_LAGER_API_OK === true) return false;
  if (typeof showToast === 'function') showToast(msg || '⚠ Lager nicht mit dem Server verbunden — Aktion nicht möglich.');
  return true;
}

/** Desktop-Cockpit: nach cockpitBoot gesetzte User-UUID (mitarbeiter_id bei Buchungen). */
function lagerDesktopMitarbeiterUserIdForBuchung() {
  try {
    var raw = typeof window !== 'undefined' && window.CURRENT_USER_ID != null ? String(window.CURRENT_USER_ID).trim() : '';
    return lagerIsUuid(raw) ? raw : null;
  } catch (eLagerMa) {
    void eLagerMa;
    return null;
  }
}

function lagerTabCC(el, filter){
  LAGER_FILTER = filter;
  document.querySelectorAll('#pg-lager .tab').forEach(function(t){ t.classList.remove('active'); });
  el.classList.add('active');
  renderLagerCC();
}

function lagerUpdateStatus(item){
  if(item.bestand === 0)             item.status = 'leer';
  else if(item.bestand < item.mindest) item.status = 'warn';
  else                                 item.status = 'ok';
}

function renderLagerCC(){
  var tbody = document.getElementById('lagerTbodyCC'); if(!tbody) return;
  var q = (document.getElementById('lagerSearchCC')?.value||'').toLowerCase();
  var data = LAGER_CC.filter(function(a){
    if(LAGER_FILTER !== 'alle' && a.kat !== LAGER_FILTER) return false;
    if(q && !a.art.toLowerCase().includes(q) && !a.nr.toLowerCase().includes(q)) return false;
    return true;
  });

  // Stat counters
  var ok=0,warn=0,leer=0,best=0;
  LAGER_CC.forEach(function(a){ if(a.status==='ok')ok++; else if(a.status==='warn')warn++; else leer++; if((a.bestellt||0)>0)best++; });
  var eOk=document.getElementById('lgOk'),eWarn=document.getElementById('lgWarn'),eLeer=document.getElementById('lgLeer'),eBest=document.getElementById('lgBestellt');
  if(eOk)eOk.textContent=ok; if(eWarn)eWarn.textContent=warn; if(eLeer)eLeer.textContent=leer; if(eBest)eBest.textContent=best;

  var stMap = {
    ok:   '<span class="bdg bg" style="font-size:10px;">✓ OK</span>',
    warn: '<span class="bdg ba" style="font-size:10px;">⚠ Nachbestellen</span>',
    leer: '<span class="bdg br" style="font-size:10px;">✕ Leer!</span>',
  };
  tbody.innerHTML = data.map(function(a){
    var idx  = LAGER_CC.indexOf(a);
    var pct  = a.mindest>0 ? Math.min(100, Math.round(a.bestand/a.mindest*50)) : 100;
    var barC = a.status==='ok'?'var(--green)':a.status==='warn'?'var(--amber)':'var(--red)';
    var beC  = a.bestand===0?'var(--red)':a.bestand<a.mindest?'var(--amber)':'var(--text)';
    var bestellBdg = (a.bestellt||0)>0
      ? '<div style="margin-top:2px;"><span class="bdg bb" style="font-size:9px;">'+a.bestellt+' '+a.eh+' bestellt</span></div>' : '';
    var btnBestell = a.status!=='ok'
      ? '<button class="btn" style="font-size:11px;padding:3px 7px;background:var(--amber-l);color:var(--amber);border-color:var(--amber);" onclick="event.stopPropagation();lagerBestellModal('+idx+')" title="Bestellen">🛒</button>'
      : '<button class="btn" style="font-size:11px;padding:3px 7px;" onclick="event.stopPropagation();lagerBestellModal('+idx+')" title="Bestellen">🛒</button>';
    return '<tr onclick="lagerArtikelModal('+idx+')" style="cursor:pointer;">'
      +'<td><div style="font-size:12.5px;font-weight:500;">'+a.art+'</div>'
        +'<div style="margin-top:3px;height:3px;background:var(--gray-l);border-radius:2px;width:120px;">'
          +'<div style="height:100%;border-radius:2px;background:'+barC+';width:'+pct+'%;"></div></div>'
        +bestellBdg+'</td>'
      +'<td><span class="bdg bgr" style="font-size:10px;">'+a.kat+'</span></td>'
      +'<td style="font-size:11px;color:var(--text2);">'+a.nr+'</td>'
      +'<td style="font-size:12px;">'+a.eh+'</td>'
      +'<td style="font-size:13px;font-weight:700;color:'+beC+';">'+a.bestand+'</td>'
      +'<td style="font-size:12px;color:var(--text2);">'+a.mindest+'</td>'
      +'<td>'+stMap[a.status]+'</td>'
      +'<td style="white-space:nowrap;">'
        +'<button class="btn" style="font-size:11px;padding:3px 7px;" onclick="event.stopPropagation();lagerWareneingangModal('+idx+')" title="Wareneingang buchen">📦</button> '
        +btnBestell+' '
        +'<button class="btn" style="font-size:11px;padding:3px 7px;" onclick="event.stopPropagation();lagerArtikelModal('+idx+')" title="Artikel bearbeiten">✏️</button>'
      +'</td>'
      +'</tr>';
  }).join('');
  if(!data.length) tbody.innerHTML='<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--text3);">Keine Artikel gefunden</td></tr>';
}

function lagerWareneingangModal(idx){
  _lagerActIdx = idx;
  var a = LAGER_CC[idx];
  var ov = document.getElementById('lager-waren-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='lager-waren-ov';
    ov.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:400;align-items:center;justify-content:center;';
    ov.onclick=function(e){if(e.target===ov)ov.style.display='none';};
    document.body.appendChild(ov); }
  ov.innerHTML=
    '<div style="background:#fff;border-radius:14px;width:400px;box-shadow:0 24px 64px rgba(0,0,0,.22);overflow:hidden;">'
      +'<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">'
        +'<div><div style="font-size:15px;font-weight:700;">📦 Wareneingang</div>'
          +'<div style="font-size:12px;color:var(--text2);margin-top:2px;">'+a.art+'</div></div>'
        +'<button onclick="document.getElementById(\'lager-waren-ov\').style.display=\'none\'" style="background:none;border:1px solid var(--border);border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px;color:var(--text2);">×</button>'
      +'</div>'
      +'<div style="padding:20px 22px;">'
        +'<div style="display:flex;justify-content:space-between;margin-bottom:16px;padding:10px 14px;background:var(--gray-l);border-radius:8px;">'
          +'<span style="font-size:12px;color:var(--text2);">Aktueller Bestand</span>'
          +'<span style="font-size:14px;font-weight:700;color:var(--text);">'+a.bestand+' '+a.eh+'</span>'
        +'</div>'
        +'<label style="display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px;">Eingangsmenge ('+a.eh+')</label>'
        +'<input type="number" id="lagerWarenMenge" min="0.1" step="0.1" value="" placeholder="z.B. 50" '
          +'style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:16px;font-weight:700;text-align:center;outline:none;" '
          +'onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
      +'</div>'
      +'<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;">'
        +'<button class="btn" onclick="document.getElementById(\'lager-waren-ov\').style.display=\'none\'">Abbrechen</button>'
        +'<button class="btn p" onclick="lagerWareneingangConfirm()">✓ Einbuchen</button>'
      +'</div>'
    +'</div>';
  ov.style.display='flex';
  setTimeout(function(){ var i=document.getElementById('lagerWarenMenge'); if(i)i.focus(); },80);
}

function lagerWareneingangConfirm(){
  var menge = parseFloat(document.getElementById('lagerWarenMenge')?.value||'0');
  if(!menge || menge <= 0){ showToast('⚠ Bitte Menge eingeben'); return; }
  var a = LAGER_CC[_lagerActIdx];
  var api = window.__CCINTERN_LAGER_API_OK === true && window.CCIntern && window.CCIntern.cockpitApi ? window.CCIntern.cockpitApi : null;
  if (api && typeof api.postLagerBuchungAndRefresh === 'function') {
    var mid = a && a.id != null ? String(a.id).trim() : '';
    if (!mid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mid)) {
      showToast('⚠ Keine Backend-ID für diesen Artikel — Buchung nicht möglich.');
      return;
    }
    var artLbl = String(a.art || '');
    var ehLbl = String(a.eh || '');
    var st = typeof showToast === 'function' ? showToast : null;
    var buchOpts = {};
    var midDesk = lagerDesktopMitarbeiterUserIdForBuchung();
    if (midDesk) buchOpts.mitarbeiter_id = midDesk;
    api
      .postLagerBuchungAndRefresh(mid, 'zugang', menge, st, buchOpts)
      .then(function () {
        document.getElementById('lager-waren-ov').style.display = 'none';
        if (st) st('✓ Wareneingang gebucht: +' + menge + ' ' + ehLbl + ' — ' + artLbl.substring(0, 25));
      })
      .catch(function () {
        if (st) st('⚠ Wareneingang konnte nicht gebucht werden.');
      });
    return;
  }
  if (lagerCockpitBlockIfNoLiveApi()) return;
  a.bestand = Math.round((a.bestand + menge) * 10) / 10;
  if((a.bestellt||0) > 0){ a.bestellt = Math.max(0, Math.round((a.bestellt - menge) * 10) / 10); }
  lagerUpdateStatus(a);
  saveLager(); renderLagerCC();
  document.getElementById('lager-waren-ov').style.display='none';
  showToast('✓ Wareneingang gebucht: +'+menge+' '+a.eh+' — '+a.art.substring(0,25));
}

function lagerBestellModal(idx){
  _lagerActIdx = idx;
  var a = LAGER_CC[idx];
  var vorschlag = Math.max(a.mindest, a.mindest * 2 - a.bestand);
  vorschlag = Math.round(vorschlag * 10) / 10;
  var ov = document.getElementById('lager-bestell-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='lager-bestell-ov';
    ov.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:400;align-items:center;justify-content:center;';
    ov.onclick=function(e){if(e.target===ov)ov.style.display='none';};
    document.body.appendChild(ov); }
  var stCol = a.status==='leer'?'var(--red)':a.status==='warn'?'var(--amber)':'var(--text)';
  ov.innerHTML=
    '<div style="background:#fff;border-radius:14px;width:420px;box-shadow:0 24px 64px rgba(0,0,0,.22);overflow:hidden;">'
      +'<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">'
        +'<div><div style="font-size:15px;font-weight:700;">🛒 Artikel bestellen</div>'
          +'<div style="font-size:12px;color:var(--text2);margin-top:2px;">'+a.art+'</div></div>'
        +'<button onclick="document.getElementById(\'lager-bestell-ov\').style.display=\'none\'" style="background:none;border:1px solid var(--border);border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px;color:var(--text2);">×</button>'
      +'</div>'
      +'<div style="padding:20px 22px;">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">'
          +'<div style="text-align:center;padding:10px;background:var(--gray-l);border-radius:8px;">'
            +'<div style="font-size:18px;font-weight:700;color:'+stCol+';">'+a.bestand+'</div>'
            +'<div style="font-size:10px;color:var(--text3);">Bestand</div></div>'
          +'<div style="text-align:center;padding:10px;background:var(--gray-l);border-radius:8px;">'
            +'<div style="font-size:18px;font-weight:700;color:var(--text2);">'+a.mindest+'</div>'
            +'<div style="font-size:10px;color:var(--text3);">Mindest</div></div>'
          +'<div style="text-align:center;padding:10px;background:var(--blue-l);border-radius:8px;">'
            +'<div style="font-size:18px;font-weight:700;color:var(--blue);">'+vorschlag+'</div>'
            +'<div style="font-size:10px;color:var(--blue);">Vorschlag</div></div>'
        +'</div>'
        +'<label style="display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px;">Bestellmenge ('+a.eh+')</label>'
        +'<input type="number" id="lagerBestellMenge" min="0.1" step="0.1" value="'+vorschlag+'" '
          +'style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:16px;font-weight:700;text-align:center;outline:none;" '
          +'onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
        +'<label style="display:block;font-size:12px;font-weight:600;color:var(--text2);margin:10px 0 6px;">Lieferant</label>'
        +'<select id="lagerBestellLieferantId" onchange="lagerBestellLieferantWechsel()" '
          +'style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;outline:none;">'
          +_lgLieferantenOpts('')
        +'</select>'
        +'<div id="lagerBestellEmailZone" style="margin-top:8px;display:none;">'
          +'<div style="font-size:11px;color:var(--text3);padding:4px 0;" id="lagerBestellEmailInfo"></div>'
        +'</div>'
      +'</div>'
      +'<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
        +'<button class="btn" id="lagerBestellEmailBtn" style="display:none;" onclick="lagerSingleBestellungEmail()">📧 Bestellmail öffnen</button>'
        +'<div style="display:flex;gap:8px;margin-left:auto;">'
          +'<button class="btn" onclick="document.getElementById(\'lager-bestell-ov\').style.display=\'none\'">Abbrechen</button>'
          +'<button class="btn p" onclick="lagerBestellConfirm()">🛒 Bestellen</button>'
        +'</div>'
      +'</div>'
    +'</div>';
  ov.style.display='flex';
  setTimeout(function(){ var i=document.getElementById('lagerBestellMenge'); if(i){i.focus();i.select();} },80);
}

function lagerBestellConfirm(){
  var menge = parseFloat(document.getElementById('lagerBestellMenge')?.value||'0');
  if(!menge || menge <= 0){ showToast('⚠ Bitte Bestellmenge eingeben'); return; }
  if (lagerCockpitBlockIfNoLiveApi('⚠ Bestell-Markierung nur mit Lager-Server — bitte Verbindung prüfen.')) return;
  var a = LAGER_CC[_lagerActIdx];
  a.bestellt = Math.round(((a.bestellt||0) + menge) * 10) / 10;
  saveLager(); renderLagerCC();
  document.getElementById('lager-bestell-ov').style.display='none';
  showToast('🛒 Bestellt: '+menge+' '+a.eh+' — '+a.art.substring(0,25));
}

function lagerArtikelModal(idx){
  _lagerActIdx = idx;
  var isNew = idx < 0;
  var a = isNew ? {art:'',kat:'folie',nr:'',eh:'lfm',bestand:0,mindest:0,bestellt:0,status:'ok'} : LAGER_CC[idx];
  var ov = document.getElementById('lager-artikel-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='lager-artikel-ov';
    ov.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:400;align-items:center;justify-content:center;';
    ov.onclick=function(e){if(e.target===ov)ov.style.display='none';};
    document.body.appendChild(ov); }
  var iS='width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;outline:none;';
  var katOpts=['folie','laminat','reinigung','werkzeug','farbe'].map(function(k){
    return '<option value="'+k+'"'+(a.kat===k?' selected':'')+'>'+k+'</option>';
  }).join('');
  var ehOpts = (LAGER_MATERIAL_EINHEITEN || []).map(function (v) {
    return '<option value="' + String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">';
  }).join('');
  var ehPlaceholder = 'Stk. · lfm · m² · Fl. · Pk.';
  ov.innerHTML=
    '<div style="background:#fff;border-radius:14px;width:460px;box-shadow:0 24px 64px rgba(0,0,0,.22);overflow:hidden;">'
      +'<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">'
        +'<div style="font-size:15px;font-weight:700;">'+(isNew?'+ Neuer Artikel':'✏️ Artikel bearbeiten')+'</div>'
        +'<button onclick="document.getElementById(\'lager-artikel-ov\').style.display=\'none\'" style="background:none;border:1px solid var(--border);border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px;color:var(--text2);">×</button>'
      +'</div>'
      +'<div style="padding:20px 22px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        +'<div style="grid-column:1/-1;">'
          +'<label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;">Artikelname *</label>'
          +'<input type="text" id="lgArtName" value="'+a.art+'" style="'+iS+'" placeholder="z.B. ORAJET® 3551 GLOSSY 137cm">'
        +'</div>'
        +'<div>'
          +'<label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;">Kategorie</label>'
          +'<select id="lgArtKat" style="'+iS+'">'+katOpts+'</select>'
        +'</div>'
        +'<div>'
          +'<label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;">Art.-Nr.</label>'
          +'<input type="text" id="lgArtNr" value="'+a.nr+'" style="'+iS+'" placeholder="ORA-0000-X">'
        +'</div>'
        +'<div>'
          +'<label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;">Einheit</label>'
          +'<input type="text" id="lgArtEh" list="lgArtEhList" value="'+a.eh+'" style="'+iS+'" placeholder="'+ehPlaceholder.replace(/&/g, '&amp;').replace(/"/g, '&quot;')+'">'
        +'</div>'
        +'<div>'
          +'<label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;">Aktueller Bestand</label>'
          +'<input type="number" id="lgArtBestand" value="'+a.bestand+'" min="0" step="0.1" style="'+iS+'">'
        +'</div>'
        +'<div>'
          +'<label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;">Mindestbestand</label>'
          +'<input type="number" id="lgArtMindest" value="'+a.mindest+'" min="0" step="0.1" style="'+iS+'">'
        +'</div>'
      +'</div>'
      +'<div id="lgArtFooter" style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
        +(!isNew?'<button class="btn" style="color:var(--red);border-color:var(--red);" onclick="lagerArtikelLoeschenBestaetigen()">🗑 Löschen</button>':'<div></div>')
        +'<div style="display:flex;gap:8px;">'
          +'<button class="btn" onclick="document.getElementById(\'lager-artikel-ov\').style.display=\'none\'">Abbrechen</button>'
          +'<button class="btn p" onclick="lagerArtikelSpeichern()">💾 Speichern</button>'
        +'</div>'
      +'</div>'
      +'<datalist id="lgArtEhList">'+ehOpts+'</datalist>'
    +'</div>';
  ov.style.display='flex';
  setTimeout(function(){ var i=document.getElementById('lgArtName'); if(i)i.focus(); },80);
}

function lagerArtikelSpeichern(){
  var name = document.getElementById('lgArtName')?.value.trim();
  if(!name){ showToast('⚠ Artikelname eingeben'); return; }
  var prev = _lagerActIdx >= 0 ? LAGER_CC[_lagerActIdx] : null;
  var obj = {
    id:       prev && prev.id != null ? String(prev.id).trim() : undefined,
    art:      name,
    kat:      document.getElementById('lgArtKat')?.value || 'folie',
    nr:       document.getElementById('lgArtNr')?.value.trim() || '',
    eh:       document.getElementById('lgArtEh')?.value.trim() || 'Stk',
    bestand:  parseFloat(document.getElementById('lgArtBestand')?.value||'0')||0,
    mindest:  parseFloat(document.getElementById('lgArtMindest')?.value||'0')||0,
    bestellt: _lagerActIdx < 0 ? 0 : (LAGER_CC[_lagerActIdx].bestellt||0),
  };
  var api = window.__CCINTERN_LAGER_API_OK === true && window.CCIntern && window.CCIntern.cockpitApi ? window.CCIntern.cockpitApi : null;
  if (api && typeof api.upsertLagerCcItemToApi === 'function') {
    var st = typeof showToast === 'function' ? showToast : null;
    api
      .upsertLagerCcItemToApi(obj, _lagerActIdx < 0, st)
      .then(function () {
        document.getElementById('lager-artikel-ov').style.display = 'none';
        if (st) st((_lagerActIdx < 0 ? '✓ Artikel angelegt: ' : '✓ Gespeichert: ') + name.substring(0, 25));
      })
      .catch(function () {
        if (st) st('⚠ Artikel konnte nicht gespeichert werden.');
      });
    return;
  }
  if (lagerCockpitBlockIfNoLiveApi()) return;
  lagerUpdateStatus(obj);
  if(_lagerActIdx < 0){ LAGER_CC.push(obj); }
  else { LAGER_CC[_lagerActIdx] = obj; }
  saveLager(); renderLagerCC();
  document.getElementById('lager-artikel-ov').style.display='none';
  showToast((_lagerActIdx<0?'✓ Artikel angelegt: ':'✓ Gespeichert: ')+name.substring(0,25));
}

function lagerArtikelLoeschenBestaetigen(){
  // 1. Klick: Footer in Bestätigungs-Zustand wechseln
  var f = document.getElementById('lgArtFooter');
  if(!f) return;
  var name = LAGER_CC[_lagerActIdx]?.art || '';
  f.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;width:100%;">'
      +'<span style="font-size:12px;color:var(--red);font-weight:600;">⚠ „'+name.substring(0,28)+'\" wirklich löschen?</span>'
      +'<div style="margin-left:auto;display:flex;gap:8px;">'
        +'<button class="btn" onclick="lagerArtikelModal(_lagerActIdx)">Abbrechen</button>'
        +'<button class="btn" style="background:var(--red);color:#fff;border-color:var(--red);" onclick="lagerArtikelLoeschenConfirm()">✓ Ja, löschen</button>'
      +'</div>'
    +'</div>';
}

function lagerArtikelLoeschenConfirm(){
  if(_lagerActIdx < 0) return;
  var row = LAGER_CC[_lagerActIdx];
  var name = row.art;
  var api = window.__CCINTERN_LAGER_API_OK === true && window.CCIntern && window.CCIntern.cockpitApi ? window.CCIntern.cockpitApi : null;
  if (api && typeof api.deleteLagerMaterialByIdFromApi === 'function' && row && row.id) {
    var mid = String(row.id).trim();
    if (lagerIsUuid(mid)) {
      var st = typeof showToast === 'function' ? showToast : null;
      api
        .deleteLagerMaterialByIdFromApi(mid, st)
        .then(function () {
          document.getElementById('lager-artikel-ov').style.display = 'none';
          if (st) st('🗑 Gelöscht: ' + name.substring(0, 25));
        })
        .catch(function () {
          if (st) st('⚠ Löschen fehlgeschlagen.');
        });
      return;
    }
  }
  if (window.__CCINTERN_COCKPIT_MOUNT__ && window.__CCINTERN_LAGER_API_OK === true) {
    if (typeof showToast === 'function') showToast('⚠ Keine gültige Backend-ID — Löschen nicht möglich.');
    return;
  }
  if (lagerCockpitBlockIfNoLiveApi()) return;
  LAGER_CC.splice(_lagerActIdx, 1);
  saveLager(); renderLagerCC();
  document.getElementById('lager-artikel-ov').style.display='none';
  showToast('🗑 Gelöscht: '+name.substring(0,25));
}

function lagerBestellungAufgeben(){
  var items = LAGER_CC.map(function(a,i){ return {a:a,i:i}; })
    .filter(function(x){ return x.a.status==='warn'||x.a.status==='leer'; });
  var ov = document.getElementById('lager-bestellung-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='lager-bestellung-ov';
    ov.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:400;align-items:center;justify-content:center;';
    ov.onclick=function(e){if(e.target===ov)ov.style.display='none';};
    document.body.appendChild(ov); }
  var rows = items.length ? items.map(function(x){
    var vorschlag = Math.max(x.a.mindest, x.a.mindest*2 - x.a.bestand);
    vorschlag = Math.round(vorschlag*10)/10;
    var stBdg = x.a.status==='leer'
      ? '<span class="bdg br" style="font-size:9px;">Leer</span>'
      : '<span class="bdg ba" style="font-size:9px;">Nachbestellen</span>';
    return '<tr style="border-bottom:1px solid var(--border);">'
      +'<td style="padding:10px 8px;"><div style="font-size:12px;font-weight:500;">'+x.a.art+'</div>'
        +'<div style="font-size:10px;color:var(--text3);">'+x.a.kat+' · '+x.a.nr+'</div></td>'
      +'<td style="padding:10px 8px;text-align:center;font-size:12px;">'+x.a.bestand+' / '+x.a.mindest+'</td>'
      +'<td style="padding:10px 8px;text-align:center;">'+stBdg+'</td>'
      +'<td style="padding:10px 8px;text-align:center;">'
        +'<input type="number" data-idx="'+x.i+'" value="'+vorschlag+'" min="0.1" step="0.1" '
          +'style="width:70px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-weight:700;text-align:center;outline:none;" '
          +'onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
        +' <span style="font-size:11px;color:var(--text3);">'+x.a.eh+'</span>'
      +'</td>'
    +'</tr>';
  }).join('')
  : '<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--text3);">Alle Artikel ausreichend vorhanden ✓</td></tr>';

  ov.innerHTML=
    '<div style="background:#fff;border-radius:14px;width:660px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.22);">'
      +'<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">'
        +'<div><div style="font-size:15px;font-weight:700;">🛒 Bestellung aufgeben</div>'
          +'<div style="font-size:11px;color:var(--text2);margin-top:2px;">'+items.length+' Artikel unter Mindestbestand — Mengen prüfen und übernehmen</div></div>'
        +'<button onclick="document.getElementById(\'lager-bestellung-ov\').style.display=\'none\'" style="background:none;border:1px solid var(--border);border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px;color:var(--text2);">×</button>'
      +'</div>'
      +'<div style="flex:1;overflow-y:auto;padding:0 22px;">'
        +'<table style="width:100%;border-collapse:collapse;">'
          +'<thead><tr style="background:var(--gray-l);">'
            +'<th style="padding:8px;text-align:left;font-size:11px;font-weight:700;color:var(--text2);">Artikel</th>'
            +'<th style="padding:8px;text-align:center;font-size:11px;font-weight:700;color:var(--text2);">Bestand/Mindest</th>'
            +'<th style="padding:8px;text-align:center;font-size:11px;font-weight:700;color:var(--text2);">Status</th>'
            +'<th style="padding:8px;text-align:center;font-size:11px;font-weight:700;color:var(--blue);">Bestellmenge</th>'
          +'</tr></thead>'
          +'<tbody id="lager-bestellung-tbody">'+rows+'</tbody>'
        +'</table>'
      +'</div>'
      +'<div style="padding:12px 22px;border-top:1px solid var(--border);background:var(--gray-l);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
        +'<span style="font-size:11px;font-weight:600;color:var(--text2);">Lieferant:</span>'
        +'<select id="lagerBestellungLieferantId" style="flex:1;min-width:200px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;outline:none;">'
          +_lgLieferantenOpts('')
        +'</select>'
        +'<button class="btn" onclick="lagerBestellungEmail()" style="white-space:nowrap;">📧 Bestellmail</button>'
      +'</div>'
      +'<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
        +'<button class="btn" onclick="lagerBestellungDrucken()">🖨 Drucken</button>'
        +'<div style="display:flex;gap:8px;">'
          +'<button class="btn" onclick="document.getElementById(\'lager-bestellung-ov\').style.display=\'none\'">Abbrechen</button>'
          +'<button class="btn p" onclick="lagerBestellungUebernehmen()">✓ Mengen übernehmen</button>'
        +'</div>'
      +'</div>'
    +'</div>';
  ov.style.display='flex';
}

function lagerBestellungUebernehmen(){
  if (lagerCockpitBlockIfNoLiveApi('⚠ Nur mit Lager-Server — bitte Verbindung prüfen.')) return;
  var inputs = document.querySelectorAll('#lager-bestellung-tbody input[data-idx]');
  var count = 0;
  inputs.forEach(function(inp){
    var idx = parseInt(inp.getAttribute('data-idx'));
    var menge = parseFloat(inp.value||'0');
    if(menge > 0 && LAGER_CC[idx]){
      LAGER_CC[idx].bestellt = Math.round(((LAGER_CC[idx].bestellt||0) + menge)*10)/10;
      count++;
    }
  });
  saveLager(); renderLagerCC();
  document.getElementById('lager-bestellung-ov').style.display='none';
  showToast('🛒 '+count+' Artikel als bestellt markiert');
}

function lagerBestellungDrucken(){
  var rows = Array.from(document.querySelectorAll('#lager-bestellung-tbody input[data-idx]')).map(function(inp){
    var idx = parseInt(inp.getAttribute('data-idx'));
    var a = LAGER_CC[idx];
    var menge = inp.value;
    return '<tr><td>'+a.art+'</td><td>'+a.nr+'</td><td>'+a.kat+'</td>'
      +'<td style="text-align:center;">'+a.bestand+'</td><td style="text-align:center;">'+a.mindest+'</td>'
      +'<td style="text-align:center;font-weight:700;color:#1565C0;">'+menge+' '+a.eh+'</td></tr>';
  }).join('');
  var win = window.open('','_blank','width=800,height:600');
  win.document.write('<!DOCTYPE html><html><head><title>Bestellliste CC Werbung</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:30px;}h2{color:#1565C0;}table{width:100%;border-collapse:collapse;}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left;}th{background:#E3F2FD;font-size:12px;}td{font-size:12px;}</style>'
    +'</head><body><h2>🛒 Bestellliste — CC Werbung GmbH</h2>'
    +'<p style="font-size:12px;color:#666;">Datum: '+new Date().toLocaleDateString('de-DE')+' · Erstellt von CC Intern</p>'
    +'<table><thead><tr><th>Artikel</th><th>Art.-Nr.</th><th>Kategorie</th><th>Bestand</th><th>Mindest</th><th>Bestellmenge</th></tr></thead>'
    +'<tbody>'+rows+'</tbody></table>'
    +'<script>window.onload=function(){window.print()}<\/script>'
    +'</body></html>');
  win.document.close();
}

function _lgLieferantenOpts(selId){
  var o = '<option value="">— Kein Lieferant —</option>';
  LIEFERANTEN.forEach(function(l){
    o += '<option value="'+l.id+'"'+(l.id===selId?' selected':'')+'>'+l.name+(l.email?' ✉':'')+'</option>';
  });
  return o;
}

function lagerBestellLieferantWechsel(){
  var id = document.getElementById('lagerBestellLieferantId')?.value;
  var lief = LIEFERANTEN.find(function(l){ return l.id===id; });
  var zone = document.getElementById('lagerBestellEmailZone');
  var info = document.getElementById('lagerBestellEmailInfo');
  var btn  = document.getElementById('lagerBestellEmailBtn');
  if(lief && lief.email){
    if(zone) zone.style.display='block';
    if(info) info.textContent = '✉ '+lief.email+(lief.tel?' · '+lief.tel:'');
    if(btn)  btn.style.display='inline-flex';
  } else {
    if(zone) zone.style.display='none';
    if(btn)  btn.style.display='none';
  }
}

function lagerSingleBestellungEmail(){
  var id    = document.getElementById('lagerBestellLieferantId')?.value;
  var menge = document.getElementById('lagerBestellMenge')?.value;
  var lief  = LIEFERANTEN.find(function(l){ return l.id===id; });
  if(!lief||!lief.email){ showToast('⚠ Keine E-Mail-Adresse hinterlegt'); return; }
  var a = LAGER_CC[_lagerActIdx];
  var subj = 'Bestellung CC Werbung GmbH — '+new Date().toLocaleDateString('de-DE');
  var body = 'Sehr geehrte Damen und Herren,\n\n'
    +'hiermit bestellen wir folgenden Artikel:\n\n'
    +'  '+menge+' '+a.eh+' — '+a.art+' (Art.-Nr. '+a.nr+')\n\n'
    +'Bitte liefern Sie an:\nCC Werbung GmbH\n\n'
    +'Mit freundlichen Grüßen\nCC Werbung GmbH';
  window.open('mailto:'+lief.email+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body));
}

function lagerBestellungEmail(){
  var id   = document.getElementById('lagerBestellungLieferantId')?.value;
  var lief = LIEFERANTEN.find(function(l){ return l.id===id; });
  if(!lief||!lief.email){ showToast('⚠ Lieferant ohne E-Mail — bitte zuerst Lieferant wählen oder E-Mail hinterlegen'); return; }
  var inputs = document.querySelectorAll('#lager-bestellung-tbody input[data-idx]');
  var lines = [];
  inputs.forEach(function(inp){
    var idx = parseInt(inp.getAttribute('data-idx'));
    var menge = parseFloat(inp.value||'0');
    if(menge>0 && LAGER_CC[idx]){
      var a = LAGER_CC[idx];
      lines.push('  '+menge+' '+a.eh+' — '+a.art+' (Art.-Nr. '+a.nr+')');
    }
  });
  if(!lines.length){ showToast('⚠ Keine Artikel mit Menge > 0'); return; }
  var subj = 'Bestellung CC Werbung GmbH — '+new Date().toLocaleDateString('de-DE');
  var body = 'Sehr geehrte Damen und Herren,\n\n'
    +'hiermit bestellen wir folgende Artikel:\n\n'
    +lines.join('\n')+'\n\n'
    +'Bitte liefern Sie an:\nCC Werbung GmbH\n\n'
    +'Mit freundlichen Grüßen\nCC Werbung GmbH';
  window.open('mailto:'+lief.email+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body));
}

function lagerLieferantenModal(){
  var ov = document.getElementById('lager-lief-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='lager-lief-ov';
    ov.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:400;align-items:center;justify-content:center;';
    ov.onclick=function(e){if(e.target===ov)ov.style.display='none';};
    document.body.appendChild(ov); }
  lagerLieferantenRender();
  ov.style.display='flex';
}

function lagerLieferantenRender(){
  var ov = document.getElementById('lager-lief-ov'); if(!ov) return;
  var iS = 'padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;outline:none;background:#fff;';
  var rows = LIEFERANTEN.map(function(l, i){
    return '<tr style="border-bottom:1px solid var(--border);">'
      +'<td style="padding:8px 6px;"><input type="text" data-li="'+i+'" data-f="name" value="'+l.name+'" style="'+iS+'width:185px;font-weight:600;"></td>'
      +'<td style="padding:8px 6px;"><input type="email" data-li="'+i+'" data-f="email" value="'+l.email+'" placeholder="bestellung@firma.de" style="'+iS+'width:190px;"></td>'
      +'<td style="padding:8px 6px;"><input type="text" data-li="'+i+'" data-f="tel" value="'+l.tel+'" placeholder="+49…" style="'+iS+'width:110px;"></td>'
      +'<td style="padding:8px 6px;"><input type="text" data-li="'+i+'" data-f="notiz" value="'+l.notiz+'" placeholder="Notiz" style="'+iS+'width:130px;"></td>'
      +'<td style="padding:8px 6px;text-align:center;">'
        +'<button onclick="lagerLieferantLoeschen('+i+')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--text3);padding:3px 6px;border-radius:4px;" '
          +'onmouseover="this.style.color=\'var(--red)\'" onmouseout="this.style.color=\'var(--text3)\'">🗑</button>'
      +'</td>'
    +'</tr>';
  }).join('');
  ov.innerHTML =
    '<div style="background:#fff;border-radius:14px;width:750px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.22);">'
      +'<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">'
        +'<div><div style="font-size:15px;font-weight:700;">⚙ Lieferanten verwalten</div>'
          +'<div style="font-size:11px;color:var(--text2);margin-top:2px;">Name, E-Mail und Telefon für die Bestellfunktion hinterlegen</div></div>'
        +'<button onclick="document.getElementById(\'lager-lief-ov\').style.display=\'none\'" style="background:none;border:1px solid var(--border);border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px;color:var(--text2);">×</button>'
      +'</div>'
      +'<div style="flex:1;overflow-y:auto;padding:0 22px;">'
        +'<table style="width:100%;border-collapse:collapse;">'
          +'<thead><tr style="background:var(--gray-l);">'
            +'<th style="padding:8px 6px;text-align:left;font-size:11px;font-weight:700;color:var(--text2);">Name</th>'
            +'<th style="padding:8px 6px;text-align:left;font-size:11px;font-weight:700;color:var(--text2);">E-Mail</th>'
            +'<th style="padding:8px 6px;text-align:left;font-size:11px;font-weight:700;color:var(--text2);">Telefon</th>'
            +'<th style="padding:8px 6px;text-align:left;font-size:11px;font-weight:700;color:var(--text2);">Notiz</th>'
            +'<th style="width:36px;"></th>'
          +'</tr></thead>'
          +'<tbody>'+rows+'</tbody>'
        +'</table>'
      +'</div>'
      +'<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
        +'<button class="btn" onclick="lagerLieferantHinzufuegen()">+ Lieferant hinzufügen</button>'
        +'<div style="display:flex;gap:8px;">'
          +'<button class="btn" onclick="document.getElementById(\'lager-lief-ov\').style.display=\'none\'">Abbrechen</button>'
          +'<button class="btn p" onclick="lagerLieferantenSpeichern()">💾 Speichern</button>'
        +'</div>'
      +'</div>'
    +'</div>';
}

function lagerLieferantenSpeichern(){
  var inputs = document.querySelectorAll('#lager-lief-ov input[data-li]');
  inputs.forEach(function(inp){
    var i = parseInt(inp.getAttribute('data-li'));
    var f = inp.getAttribute('data-f');
    if(LIEFERANTEN[i]) LIEFERANTEN[i][f] = inp.value.trim();
  });
  saveLieferanten();
  document.getElementById('lager-lief-ov').style.display='none';
  showToast('✓ Lieferanten gespeichert');
}

function lagerLieferantHinzufuegen(){
  var newId = 'lf'+(Date.now());
  LIEFERANTEN.push({id:newId, name:'Neuer Lieferant', email:'', tel:'', notiz:''});
  lagerLieferantenRender();
}

function lagerLieferantLoeschen(i){
  if(typeof ccInternConfirm !== 'function') return;
  ccInternConfirm('Möchten Sie diesen Lieferanten wirklich löschen?', function(){
  LIEFERANTEN.splice(i,1);
  lagerLieferantenRender();
  });
}

function renderLager(){
  renderLagerCC();
}

