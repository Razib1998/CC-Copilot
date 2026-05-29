// ════════════════════════════════════════════════════════════════════
// CC INTERN — Urlaub
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/urlaub-view.js
// Enthält:  renderUrlaubAntraege, urlaubEntscheiden, urlaubDesktopNeuantragSubmit
//
// Cockpit: Liste GET /api/v1/urlaub (loadUrlaub → reloadUrlaubFromApiIntoMemory).
// Neuantrag: POST /api/v1/urlaub via cockpitApi.postUrlaubAntragFromUi (siehe urlaubDesktopNeuantragSubmit).
// Entscheidung: putUrlaubStatusById → PUT /api/v1/urlaub/:id
// ════════════════════════════════════════════════════════════════════

function renderUrlaubAntraege(){
  var liste = document.getElementById('urlaub-antraege-liste');
  var tbody = document.getElementById('urlaub-uebersicht-tbody');

  // ── Antragsliste ──
  if(liste){
    if(!URLAUB_ANTRAEGE.length){
      liste.innerHTML='<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">Keine Anträge vorhanden</div>';
    } else {
      liste.innerHTML='<table><thead><tr><th>Mitarbeiter</th><th>Typ</th><th>Von</th><th>Bis</th><th>Tage</th><th>Erstellt</th><th>Status</th><th>Aktion</th></tr></thead><tbody>'
        +URLAUB_ANTRAEGE.map(function(a){
          var m=MA_DATA.find(function(x){return x.maId===a.maId;})||{n:a.ma,av:'?',col:'#888'};
          var istStd  = a.typ==='Überstunden';
          var istKurz = a.typ==='Kurzabwesenheit';
          var von=(!istStd&&!istKurz&&a.von)?new Date(a.von):null;
          var bis=(!istStd&&!istKurz&&a.bis)?new Date(a.bis):null;
          var tage=(!istStd&&!istKurz&&von&&bis)?Math.round((bis-von)/86400000)+1
                  :istKurz?(a.stunden+'h'):istStd?(a.stunden+'h'):'—';
          var vonStr = (istStd||istKurz) ? (a.von||'—') : (a.von||'—');
          var bisStr = istStd  ? (a.stunden?a.stunden+'h':'—')
                     : istKurz ? ((a.artLabel||'Kurzabw.')+' · '+a.stunden+'h')
                     : (a.bis||'—');
          var erstellt=a.erstellt?new Date(a.erstellt).toLocaleDateString('de-DE'):'—';
          var stCol=a.status==='genehmigt'?'var(--green)':a.status==='abgelehnt'?'var(--red)':'var(--amber)';
          var stLbl=a.status==='genehmigt'?'Genehmigt':a.status==='abgelehnt'?'Abgelehnt':'Offen';
          return '<tr>'
            +'<td><div style="display:flex;align-items:center;gap:8px;">'
              +'<div style="width:26px;height:26px;border-radius:50%;background:'+m.col+';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;">'+m.av+'</div>'+m.n
            +'</div></td>'
            +'<td>'+a.typ+'</td>'
            +'<td>'+vonStr+'</td>'
            +'<td>'+bisStr+'</td>'
            +'<td>'+tage+'</td>'
            +'<td>'+erstellt+'</td>'
            +'<td><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+stCol+'18;color:'+stCol+';">'+stLbl+'</span></td>'
            +'<td style="display:flex;gap:4px;">'
              +(a.status==='offen'
                ?'<button class="btn g" style="font-size:11px;padding:3px 8px;" onclick="urlaubEntscheiden(\''+a.id+'\',\'genehmigt\')">✓</button>'
                +'<button class="btn" style="font-size:11px;padding:3px 8px;color:var(--red);" onclick="urlaubEntscheiden(\''+a.id+'\',\'abgelehnt\')">✗</button>'
                :'')
            +'</td>'
          +'</tr>';
        }).join('')
      +'</tbody></table>';
    }
  }

  // ── Übersicht pro MA ──
  if(tbody){
    tbody.innerHTML=MA_DATA.map(function(m){
      var genommen=URLAUB_ANTRAEGE.filter(function(a){return a.maId===m.maId&&a.status==='genehmigt';})
        .reduce(function(s,a){return s+Math.round((new Date(a.bis)-new Date(a.von))/86400000)+1;},0);
      var geplant=URLAUB_ANTRAEGE.filter(function(a){return a.maId===m.maId&&a.status==='offen';})
        .reduce(function(s,a){return s+Math.round((new Date(a.bis)-new Date(a.von))/86400000)+1;},0);
      var rest=Math.max(0,(m.urlaub||28)-genommen);
      return '<tr>'
        +'<td><div style="display:flex;align-items:center;gap:8px;">'
          +'<div style="width:24px;height:24px;border-radius:50%;background:'+m.col+';display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;">'+m.av+'</div>'+m.n
        +'</div></td>'
        +'<td>'+(m.urlaub||28)+' Tage</td>'
        +'<td style="color:var(--amber);">'+genommen+' Tage</td>'
        +'<td style="color:var(--blue);">'+geplant+' Tage</td>'
        +'<td style="font-weight:700;color:var(--green);">'+rest+' Tage</td>'
      +'</tr>';
    }).join('');
  }
}

/**
 * Liest die Desktop-Neuantrag-Felder (#urlaub-neu-*) und speichert über postUrlaubAntragFromUi.
 * Nur im Cockpit-Kontext (__CCINTERN_COCKPIT_MOUNT__ + cockpitApi).
 */
function urlaubDesktopNeuantragSubmit() {
  var st = typeof showToast === 'function' ? showToast : null;
  var api = window.CCIntern && window.CCIntern.cockpitApi;
  if (!window.__CCINTERN_COCKPIT_MOUNT__ || !api || typeof api.postUrlaubAntragFromUi !== 'function') {
    if (st) st('⚠ Urlaub-Antrag: nur im Cockpit mit API möglich.');
    return;
  }
  var maSel = document.getElementById('urlaub-neu-ma');
  var typSel = document.getElementById('urlaub-neu-typ');
  var vonIn = document.getElementById('urlaub-neu-von');
  var bisIn = document.getElementById('urlaub-neu-bis');
  var notizIn = document.getElementById('urlaub-neu-notiz');
  var stdIn = document.getElementById('urlaub-neu-stunden');
  if (!maSel || !typSel) return;
  var maId = String(maSel.value || '').trim();
  if (!maId) {
    if (st) st('⚠ Bitte Mitarbeiter wählen.');
    return;
  }
  var typ = String(typSel.value || 'Urlaub');
  /** @type {Record<string, unknown>} */
  var rec = {
    maId: maId,
    typ: typ,
    von: vonIn ? String(vonIn.value || '') : '',
    bis: bisIn ? String(bisIn.value || '') : '',
    notiz: notizIn ? String(notizIn.value || '') : '',
    status: 'offen',
  };
  if (typ === 'Überstunden' || typ === 'Kurzabwesenheit') {
    var rawH = stdIn && stdIn.value != null ? String(stdIn.value).replace(',', '.') : '0';
    var h = parseFloat(rawH);
    rec.stunden = Number.isFinite(h) ? h : 0;
  }
  api
    .postUrlaubAntragFromUi(rec, st)
    .then(function () {
      if (typeof api.reloadUrlaubFromApiIntoMemory === 'function') {
        return api.reloadUrlaubFromApiIntoMemory(st);
      }
    })
    .then(function () {
      if (typeof renderUrlaubAntraege === 'function') renderUrlaubAntraege();
      if (st) st('✓ Urlaubsantrag gespeichert.');
    })
    .catch(function (e) {
      console.error('[urlaub-view] urlaubDesktopNeuantragSubmit', e);
      if (st) st('⚠ Antrag konnte nicht gespeichert werden.');
    });
}

window.urlaubDesktopNeuantragSubmit = urlaubDesktopNeuantragSubmit;

function urlaubEntscheiden(id, status){
  var a=URLAUB_ANTRAEGE.find(function(x){return x.id===id;}); if(!a) return;
  if (
    window.__CCINTERN_COCKPIT_MOUNT__ &&
    window.CCIntern &&
    window.CCIntern.cockpitApi &&
    typeof window.CCIntern.cockpitApi.putUrlaubStatusById === 'function'
  ) {
    window.CCIntern.cockpitApi
      .putUrlaubStatusById(id, status, typeof showToast === 'function' ? showToast : null)
      .then(function () {
        saveUrlaub();
        renderUrlaubAntraege();
        if (typeof showToast === 'function') {
          showToast((status==='genehmigt'?'✓ Genehmigt: ':'✗ Abgelehnt: ')+a.ma+' · '+a.typ);
        }
      });
    return;
  }
  a.status=status;
  saveUrlaub();
  renderUrlaubAntraege();
  if (typeof showToast === 'function') {
    showToast((status==='genehmigt'?'✓ Genehmigt: ':'✗ Abgelehnt: ')+a.ma+' · '+a.typ);
  }
}

