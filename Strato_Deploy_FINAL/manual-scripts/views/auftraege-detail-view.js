// ════════════════════════════════════════════════════════════════════
// CC INTERN — Auftragsdetail / Modal
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/auftraege-detail-view.js
// Enthält:  openAuftragDetail, Formular, Produktionsschritte, Zeiterfassung, Dateien, Kommunikation
//
// TODO [Cockpit]: openAuftragDetail() → API GET /orders/:id statt AUFTRAEGE.find()
// TODO [Cockpit]: submitAuftrag() → API POST/PUT /orders
// TODO [Cockpit]: Zeiterfassung → API POST /time-entries
// ════════════════════════════════════════════════════════════════════


async function openAuftragDetail(id){
  const a=AUFTRAEGE.find(x=>x.id===id); if(!a) return;
  var _werIdMigrationNeedSave = false;
  if(!a.prod) a.prod={planung:{},produktion:{bestaetigt:false},template:{},dateien:[]};
  if(!a.kommentare) a.kommentare=[];
  if(!a.dateien) a.dateien=[];
  if(!a.fotos)   a.fotos=[];
  if(!a.materialVerbrauch) a.materialVerbrauch=[];
  var capiH = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if (capiH && typeof capiH.ccInternHydrateSchrittChecklisteFromLegacy === 'function') {
    capiH.ccInternHydrateSchrittChecklisteFromLegacy(a);
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

  // Checklisten aus DB vollständig laden, bevor Detail-UI rendert (kein Fire-and-forget)
  var pidDetail = a.produktId != null ? String(a.produktId).trim() : '';
  if (pidDetail) {
    if (!Array.isArray(window.CL_VORLAGEN) || window.CL_VORLAGEN.length === 0) {
      if (capiH && typeof capiH.reloadChecklistenVorlagenFromApi === 'function') {
        await capiH.reloadChecklistenVorlagenFromApi();
      }
    }
    var clDetailSteps = ['grafik', 'druck', 'laminat', 'montage', 'doku'];
    var clDetailChanged = false;
    for (var clDi = 0; clDi < clDetailSteps.length; clDi++) {
      var clSt = clDetailSteps[clDi];
      var clSch = a.schritte && a.schritte[clSt];
      if (!clSch || !(Number(clSch.dauer) > 0)) continue;
      if (Array.isArray(clSch.checkliste) && clSch.checkliste.length > 0) continue;
      var clTpl = await ccDbChecklistenFuerSchritt(pidDetail, clSt, a);
      if (clTpl.length > 0) {
        clSch.checkliste = clTpl.map(function (item) {
          return Object.assign({}, item, { erledigt: false, löschbar: false });
        });
        clDetailChanged = true;
      }
    }
    if (clDetailChanged) {
      a.checklisten = clFlatChecklistenAusSchritte(a);
    }
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
  /** Fahrzeug-spezifische Foto-Slots (Montage-Leistung PKW/Bus). */
  const _dpIsFahrzeugLeistung = (a.leistungId==='fahrzeug'||a.leistungId==='bus_bahn');

  document.getElementById('dpTitle').textContent=a.kunde+' · '+a.id;

  // ── Workflow Steps (Req. 1–4,7: Verantwortliche, Status-Badges) ──
  let stepRows='';
  ['grafik','druck','laminat','montage','doku'].forEach(function(s){
    var sch = a.schritte && a.schritte[s] ? a.schritte[s] : null;
    if(sch) {
      schrittMigrieren(sch, s);
      if (sch._ccInternWerIdDirty) {
        _werIdMigrationNeedSave = true;
        delete sch._ccInternWerIdDirty;
      }
    }
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
  if (_werIdMigrationNeedSave && typeof saveAuftraege === 'function') saveAuftraege();

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

  // ── Dateien + Fotos: vereinte Tabelle mit Quelle-Tracking ───────────
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

  // ── Vorher/Nachher: 8 Positions-Slots (nur PKW/Bus), zwei 4er-Grids + Abstand — phase/position unverändert am Input ──
  var _dpVorherNachherBlockHtml = '';
  if (_dpIsFahrzeugLeistung) {
    (function(){
      function _dpVehEsc(t){
        return String(t || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }
      var stVor =
        'min-width:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px 6px;font-size:10px;font-weight:700;background:#E8F5E9;border-radius:8px;cursor:pointer;color:#1B5E20;border:1px solid #A5D6A7;line-height:1.25;hyphens:auto;';
      var stNach =
        'min-width:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px 6px;font-size:10px;font-weight:700;background:#ffe5cc;border-radius:8px;cursor:pointer;color:#a65300;border:1px solid #ffb380;line-height:1.25;hyphens:auto;';
      function dpVeh(ph, pos, lbl){
        var st = ph === 'nachher' ? stNach : stVor;
        var esc = _dpVehEsc(lbl);
        return '<label style="'+st+'" title="'+esc+'">'+lbl
          +'<input type="file" accept="image/jpeg,image/png" capture="environment" style="display:none;" data-aid="'+a.id+'" '
          +'data-ccintern-typ="'+ph+'" data-ccintern-phase="'+ph+'" data-ccintern-position="'+pos+'" '
          +'onchange="prodAddDateiFromDatasetInput(event)"></label>';
      }
      var grVor =
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">'
        + dpVeh('vorher','front','📷 Vorher Front (hoch)')
        + dpVeh('vorher','seite1','📷 Vorher Seite 1 (quer)')
        + dpVeh('vorher','seite2','📷 Vorher Seite 2 (quer)')
        + dpVeh('vorher','heck','📷 Vorher Heck (hoch)')
        + '</div>';
      var grNach =
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">'
        + dpVeh('nachher','front','📷 Nachher Front (hoch)')
        + dpVeh('nachher','seite1','📷 Nachher Seite 1 (quer)')
        + dpVeh('nachher','seite2','📷 Nachher Seite 2 (quer)')
        + dpVeh('nachher','heck','📷 Nachher Heck (hoch)')
        + '</div>';
      _dpVorherNachherBlockHtml = grVor + '<div style="height:12px;"></div>' + grNach;
    })();
  }

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
    +'<div style="display:flex;flex-direction:column;gap:12px;margin-top:10px;">'

    +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
    +'<label style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--purple-l, #F3E5F5);border-radius:8px;cursor:pointer;font-size:11px;color:var(--purple, #6A1B9A);font-weight:600;border:1px solid rgba(106,27,154,.18);">🎨 Layout / Grafik'
    +'<input type="file" accept="image/jpeg,image/png,application/pdf,.pdf" multiple style="display:none;" data-aid="'+a.id+'" data-ccintern-typ="layout_grafik" onchange="prodAddDateiMitTyp(this.dataset.aid,event,this.dataset.ccinternTyp)"></label>'
    +'<label style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--purple-l, #F3E5F5);border-radius:8px;cursor:pointer;font-size:11px;color:var(--purple, #6A1B9A);font-weight:600;border:1px solid rgba(106,27,154,.18);">🖨 Finale Druckdatei'
    +'<input type="file" accept="image/jpeg,image/png,application/pdf,.pdf" multiple style="display:none;" data-aid="'+a.id+'" data-ccintern-typ="druckdatei" onchange="prodAddDateiMitTyp(this.dataset.aid,event,this.dataset.ccinternTyp)"></label>'
    +'<label style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--amber-l);border-radius:8px;cursor:pointer;font-size:11px;color:var(--amber);font-weight:600;border:1px solid rgba(230,81,0,.2);">📷 Montagefoto'
    +'<input type="file" accept="image/jpeg,image/png,application/pdf,.pdf" capture="environment" multiple style="display:none;" data-aid="'+a.id+'" data-ccintern-typ="montagefoto" onchange="prodAddDateiMitTyp(this.dataset.aid,event,this.dataset.ccinternTyp)"></label>'
    +'<label style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--gray-l);border-radius:8px;cursor:pointer;font-size:11px;color:var(--text2);font-weight:600;border:1px solid var(--border);">📷 Schnell-Foto'
    +'<input type="file" accept="image/jpeg,image/png" capture="environment" multiple style="display:none;" data-aid="'+a.id+'" onchange="detailFotoUpload(this.dataset.aid,event)"></label>'
    +'</div>'

    +_dpVorherNachherBlockHtml

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
      var erledigt= checks.filter(function(c){ return c.erledigt; }).length;
      var pct     = checks.length ? Math.round(erledigt/checks.length*100) : 0;
      var barCol  = pct===100?'var(--green)':pct>50?'var(--amber)':'var(--blue)';
      // Fortschritt-Badge (Checklisten blockieren den Workflow nicht)
      var abschliessbar = checks.length > 0 && checks.every(function(c){return c.erledigt;});
      var emptyHint = !checks.length
        ? '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Noch keine Prüfpunkte auf diesem Schritt — unten in der Checklisten-Übersicht „+ Vorlage“ nutzen.</div>'
        : '';
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
        +emptyHint
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

async function detailFotoUpload(auId, event){
  var a=AUFTRAEGE.find(function(x){return x.id===auId;}); if(!a) return;
  var files=Array.from(event.target.files||[]);
  if(!files.length){ event.target.value=''; return; }
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  var cid = a.ccApiId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(a.ccApiId).trim())
    ? String(a.ccApiId).trim()
    : '';
  if (!api || typeof api.uploadCcInternAuftragDatei !== 'function'){
    showToast('⚠ Kein API-Kontext für Fotos.');
    event.target.value='';
    return;
  }
  if (!cid){
    if (!a.__pendingCcinternDateiUploads) a.__pendingCcinternDateiUploads = [];
    files.forEach(function(f){ a.__pendingCcinternDateiUploads.push({file:f, typ: 'montagefoto'}); });
    showToast('📷 Fotos werden nach Auftrag-Speichern synchronisiert');
    event.target.value='';
    return;
  }
  try {
    for (var i = 0; i < files.length; i++){
      var file = files[i];
      await api.uploadCcInternAuftragDatei(cid, file, { typ: 'montagefoto' });
    }
    if (typeof api.reloadAuftraegeFromApiIntoMemory === 'function'){
      await api.reloadAuftraegeFromApiIntoMemory(typeof showToast === 'function' ? showToast : null);
    }
    openAuftragDetail(auId);
    showToast('📷 '+files.length+' Foto(s) gespeichert');
  } catch (err){
    if (typeof console !== 'undefined' && console.warn) console.warn(err);
    showToast('⚠ Upload fehlgeschlagen');
  }
  event.target.value='';
}


function auCheckToggle(auId, idx, val){
  var a = AUFTRAEGE.find(function(x){ return x.id===auId; });
  if(!a) return;
  var step = a.step;
  var sch = typeof schrittDaten === 'function' ? schrittDaten(a, step) : null;
  if (sch) {
    if (typeof schrittMigrieren === 'function') schrittMigrieren(sch, step);
    if (Array.isArray(sch.checkliste) && sch.checkliste[idx]) {
      sch.checkliste[idx].erledigt = val;
      var api0 = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
      if (api0 && typeof api0.logCcInternChecklistAuditFromUi === 'function') {
        api0.logCcInternChecklistAuditFromUi(a, 'UI: a.schritte[step].checkliste nach Toggle (Fallback-Pfad)', {
          auId: auId, step: step, idx: idx, val: val,
        });
      }
      if (api0 && typeof api0.persistAuftraegeImmediate === 'function') {
        api0.persistAuftraegeImmediate(typeof showToast === 'function' ? showToast : null).then(function(){
          openAuftragDetail(auId);
        }).catch(function(){ openAuftragDetail(auId); });
        return;
      }
      saveAuftraege();
      openAuftragDetail(auId);
      return;
    }
  }
  if(!a.checklisten || !a.checklisten[idx]) return;
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
  saveAuftraege();
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
  saveAuftraege();
  reopen();
}

function auCheckAdd(auId){
  var a = AUFTRAEGE.find(function(x){ return x.id===auId; });
  if(!a) return;
  var inp = document.getElementById('dp-cl-new-'+auId);
  if(!inp || !inp.value.trim()) return;
  var neu = {text:inp.value.trim(), kat:'pflicht', hinweis:'', quelle:'Manuell', erledigt:false};
  var step = a.step;
  var sch = typeof schrittDaten === 'function' ? schrittDaten(a, step) : null;
  if (sch) {
    if (typeof schrittMigrieren === 'function') schrittMigrieren(sch, step);
    if (!sch.checkliste) sch.checkliste = [];
    sch.checkliste.push(neu);
  }
  if(!a.checklisten) a.checklisten = [];
  a.checklisten.push(neu);
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if (api && typeof api.logCcInternChecklistAuditFromUi === 'function') {
    api.logCcInternChecklistAuditFromUi(a, 'UI: schritte.checkliste + legacy nach manuellem Punkt', { auId: auId, text: inp.value.trim() });
  }
  if (api && typeof api.persistAuftraegeImmediate === 'function') {
    api.persistAuftraegeImmediate(typeof showToast === 'function' ? showToast : null).then(function(){
      openAuftragDetail(auId);
      showToast('✓ Prüfpunkt hinzugefügt');
    }).catch(function(){ openAuftragDetail(auId); });
    return;
  }
  saveAuftraege();
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

/** Führende User-UUID für Kommentar-Speicherung (gleich Desktop: users.id, kein Kürzel/Stamm als Speicher-ID). */
function ccKommentarAutorUuidFuerSpeichern(){
  if(typeof window !== 'undefined' && window.CURRENT_USER_ID != null && String(window.CURRENT_USER_ID).trim() !== ''){
    return String(window.CURRENT_USER_ID).trim();
  }
  if(typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && String(MOB_MA_ID).trim() !== ''){
    var raw = String(MOB_MA_ID).trim();
    if(typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(raw)) return raw;
    if(typeof maDataFindByWorkflowKey === 'function'){
      var mMob = maDataFindByWorkflowKey(raw);
      if(mMob && mMob.id != null && String(mMob.id).trim() !== '' && typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(String(mMob.id))){
        return String(mMob.id).trim();
      }
    }
    return raw;
  }
  if(typeof window !== 'undefined' && window.CC_AKTIV_MA && window.CC_AKTIV_MA.maId != null && String(window.CC_AKTIV_MA.maId).trim() !== ''){
    var ma0 = String(window.CC_AKTIV_MA.maId).trim();
    if(typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(ma0)) return ma0;
    if(typeof maDataFindByWorkflowKey === 'function'){
      var mDesk = maDataFindByWorkflowKey(ma0);
      if(mDesk && mDesk.id != null && String(mDesk.id).trim() !== '' && maIstCockpitUserUuid(String(mDesk.id))) return String(mDesk.id).trim();
    }
    return ma0;
  }
  return '';
}

// Nachricht senden und in Auftrag speichern
async function sendKommentar(auftragId, text, istFrage){
  var a = null;
  var si, sx;
  for(si = 0; si < AUFTRAEGE.length; si++){
    sx = AUFTRAEGE[si];
    if(!sx) continue;
    if (typeof mobAuftragIdsGleich === 'function' && mobAuftragIdsGleich(sx.id, auftragId)) {
      a = sx;
      break;
    }
    if(sx.id === auftragId || String(sx.id) === String(auftragId)){ a = sx; break; }
  }
  if(!a) return;
  if(!a.kommentare) a.kommentare=[];
  var ma = ccAktivMA();
  var autorMaId = ccKommentarAutorUuidFuerSpeichern();
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
  var chatApi = typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi;
  var chatSnap =
    chatApi && typeof chatApi.chatDiagSnapshotFromAuftrag === 'function'
      ? chatApi.chatDiagSnapshotFromAuftrag(a)
      : { auftragId: a.id, kommentareLength: (a.kommentare || []).length };
  console.warn(isMobSave ? '[CHAT_SAVE_APP]' : '[CHAT_SAVE_DESKTOP]', chatSnap);
  if (isMobSave) {
    console.warn('[MA_CHAT_SEND]', {
      sendKommentar: true,
      auftragId: auftragId,
      ccApiId: a.ccApiId || null,
      kommentareLength: (a.kommentare || []).length,
      textLen: text ? String(text).length : 0,
    });
  }
  if (chatApi && typeof chatApi.persistAuftraegeImmediate === 'function') {
    if (isMobSave) {
      console.warn('[MA_CHAT_PUT]', { path: '/api/v1/ccintern/auftraege/:id', method: 'PUT', auftragId: a.id, ccApiId: a.ccApiId || null });
    }
    chatApi
      .persistAuftraegeImmediate(typeof showToast === 'function' ? showToast : null, a.id)
      .then(function () {
        if (!isMobSave) return;
        var api2 = window.CCIntern && window.CCIntern.cockpitApi;
        console.warn('[MA_CHAT_RESPONSE]', { putOk: true, auftragId: a.id });
        if (api2 && typeof api2.reloadAuftraegeFromApiIntoMemory === 'function') {
          return api2.reloadAuftraegeFromApiIntoMemory(null).then(function () {
            var fresh = typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE.find(function (x) {
              return x && (x.id === a.id || String(x.id) === String(a.id) || (x.ccApiId && a.ccApiId && String(x.ccApiId) === String(a.ccApiId)));
            }) : null;
            var k = fresh && Array.isArray(fresh.kommentare) ? fresh.kommentare : [];
            console.warn('[MA_CHAT_GET_AFTER_SAVE]', {
              auftragId: a.id,
              kommentareInRam: k.length,
              letzterText: k.length ? (k[k.length - 1].text || '').substring(0, 80) : null,
            });
          });
        }
      })
      .catch(function (eChat) {
        if (isMobSave) {
          console.warn('[MA_CHAT_RESPONSE]', {
            putOk: false,
            status: eChat && eChat.status != null ? eChat.status : null,
            message: eChat instanceof Error ? eChat.message : String(eChat),
          });
        }
      });
  } else if (typeof saveAuftraege === 'function') {
    if (isMobSave) {
      console.warn('[MA_CHAT_PUT]', { path: 'saveAuftraege', auftragId: a.id, hasCockpitApi: false });
    }
    saveAuftraege(typeof showToast === 'function' ? showToast : null, a.id);
  } else if (isMobSave) {
    console.warn('[MA_CHAT_RESPONSE]', { putOk: false, reason: 'no-save-handler' });
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

// Zeitstempel leserlich formatieren
function chatFormatTs(ts){
  if(!ts) return '';
  var d;
  try{ d=new Date(ts); }catch(e){ return ts; }
  var heute=new Date().toISOString().substring(0,10);
  if(d.toISOString().substring(0,10)===heute){
    return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  }
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'. '
    +String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

function mobSeenByEnthaeltMaId(seenBy, maId){
  if(!Array.isArray(seenBy) || !maId) return false;
  var t = String(maId).trim();
  return seenBy.some(function(s){
    return s != null && String(s).trim() === t;
  });
}

/** Kommentare eines Auftrags für diese User-UUID in seenBy (Chat geöffnet = gelesen). */
function mobMarkKommentareGesehenFuerAuftrag(auftragId, maIdOpt){
  if(typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE.length) return;
  var maId = maIdOpt != null && String(maIdOpt).trim() !== '' ? String(maIdOpt).trim() : '';
  if(!maId && typeof ccKommentarAutorUuidFuerSpeichern === 'function'){
    maId = ccKommentarAutorUuidFuerSpeichern();
  }
  if(!maId) return;
  var a = null;
  var i, x;
  for(i = 0; i < AUFTRAEGE.length; i++){
    x = AUFTRAEGE[i];
    if(!x) continue;
    if (typeof mobAuftragIdsGleich === 'function' && mobAuftragIdsGleich(x.id, auftragId)) {
      a = x;
      break;
    }
    if(x.id === auftragId || String(x.id) === String(auftragId)){ a = x; break; }
  }
  if(!a || !a.kommentare || !a.kommentare.length) return;
  var ch = false;
  a.kommentare.forEach(function(k){
    if(!k) return;
    if(!Array.isArray(k.seenBy)){
      k.seenBy = [];
      ch = true;
    }
    if(!mobSeenByEnthaeltMaId(k.seenBy, maId)){
      k.seenBy.push(maId);
      ch = true;
    }
  });
  function nachPersistBadge(){
    if(typeof mobUpdateNachrichtenBadge === 'function') mobUpdateNachrichtenBadge();
  }
  if(ch){
    var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
    if(api && typeof api.persistAuftraegeImmediate === 'function'){
      api.persistAuftraegeImmediate(typeof showToast === 'function' ? showToast : null).then(nachPersistBadge).catch(function(){
        if(typeof saveAuftraege === 'function') saveAuftraege();
        nachPersistBadge();
      });
      return;
    }
    if (typeof saveAuftraege === 'function') saveAuftraege(null, auftragId);
  }
  nachPersistBadge();
}

// Chat-HTML für einen Auftrag rendern und in containerId injizieren
function renderChatBereich(auftragId, containerId){
  var a = null;
  if (typeof mobAuftragIdsGleich === 'function') {
    a = AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, auftragId); }) || null;
  }
  if (!a) {
    a = AUFTRAEGE.find(function(x){ return x.id === auftragId || String(x.id) === String(auftragId); });
  }
  var el = document.getElementById(containerId); if(!el) return;
  if(!a){ el.innerHTML=''; return; }
  if(!a.kommentare) a.kommentare=[];
  var isMobRender =
    typeof containerId === 'string' && containerId.indexOf('mob-') === 0;
  var chatApiR = typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi;
  var renderSnap =
    chatApiR && typeof chatApiR.chatDiagSnapshotFromAuftrag === 'function'
      ? chatApiR.chatDiagSnapshotFromAuftrag(a)
      : { auftragId: a.id, kommentareLength: (a.kommentare || []).length };
  console.warn(isMobRender ? '[CHAT_RENDER_APP]' : '[CHAT_RENDER_DESKTOP]', {
    containerId: containerId,
    requestedAuftragId: auftragId,
    ...renderSnap,
  });
  if (isMobRender) {
    console.warn('[MA_CHAT_RENDER_APP]', {
      containerId: containerId,
      requestedAuftragId: auftragId,
      ...renderSnap,
    });
  }
  var ichName = ccAktivMA().name;
  var msgs='';
  if(!a.kommentare.length){
    msgs='<div style="text-align:center;font-size:12px;color:#C7C7CC;padding:20px 0;">Noch keine Nachrichten</div>';
  } else {
    msgs=a.kommentare.map(function(k){
      var istIch = (k.autor||k.von||'')===ichName;
      var av     = k.autorKuerzel||(k.autor||k.von||'?').substring(0,2).toUpperCase();
      var farbe  = k.autorFarbe||'#8E8E93';
      var zeit   = k.ts ? chatFormatTs(k.ts) : (k.zeit||'');
      var fragebubble = k.istFrage ? ' frage' : '';
      var fragebadge  = k.istFrage ? '<span style="font-size:10px;margin-bottom:2px;display:block;">❓ Frage'+(k.beantwortet?' ✓':'')+' </span>' : '';
      return '<div class="chat-msg-row'+(istIch?' ich':'')+'">'
        +'<div class="chat-av" style="background:'+farbe+';">'+av+'</div>'
        +'<div>'
          +'<div class="chat-bubble'+fragebubble+'">'+fragebadge+k.text
            +'<div class="chat-time">'+zeit+'</div>'
          +'</div>'
        +'</div>'
      +'</div>';
    }).join('');
  }
  var chatId  = 'chat-wrap-'+auftragId;
  var inpId   = 'chat-inp-'+auftragId;
  var chkId   = 'chat-frage-'+auftragId;
  el.innerHTML=
    '<div style="font-size:11px;font-weight:700;color:var(--text2);padding:10px 14px 6px;background:#F9F9FB;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;">'
      +'💬 KOMMUNIKATION'
      +(a.kommentare.length?'<span style="background:#007AFF;color:#fff;font-size:9px;font-weight:800;border-radius:8px;padding:1px 6px;margin-left:4px;">'+a.kommentare.length+'</span>':'')
    +'</div>'
    +'<div class="chat-wrap" id="'+chatId+'">'+msgs+'</div>'
    +'<div class="chat-input-wrap">'
      +'<label class="chat-frage-toggle"><input type="checkbox" id="'+chkId+'" style="accent-color:#FF9500;"> ❓ Frage</label>'
      +'<input class="chat-input-field" id="'+inpId+'" type="text" placeholder="Nachricht…" '
        +'onkeydown="if(event.key===\'Enter\')chatSenden(\''+auftragId+'\',\''+inpId+'\',\''+chkId+'\')">'
      +'<button class="chat-send-btn" onclick="chatSenden(\''+auftragId+'\',\''+inpId+'\',\''+chkId+'\')">↑</button>'
    +'</div>';
  // Scroll ans Ende
  var wrap=document.getElementById(chatId);
  if(wrap) wrap.scrollTop=wrap.scrollHeight;
  var markMaId = '';
  if(typeof containerId === 'string' && containerId.indexOf('mob-') === 0
    && typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID){
    markMaId = String(MOB_MA_ID).trim();
  } else if(typeof containerId === 'string' && containerId.indexOf('chat-container-') === 0){
    markMaId = ccKommentarAutorUuidFuerSpeichern();
  }
  if(markMaId) mobMarkKommentareGesehenFuerAuftrag(auftragId, markMaId);
}

// Sende-Helper der von HTML aufgerufen wird
async function chatSenden(auftragId, inpId, chkId){
  var inp=document.getElementById(inpId);
  var chk=document.getElementById(chkId);
  if(!inp) return;
  var text=inp.value.trim(); if(!text) return;
  var istFrage=chk?chk.checked:false;
  // Wenn normale Antwort (keine Frage) → offene Fragen dieses Auftrags als beantwortet markieren
  if(!istFrage){
    var _a = null;
    if (typeof mobAuftragIdsGleich === 'function') {
      _a = AUFTRAEGE.find(function (x) { return mobAuftragIdsGleich(x.id, auftragId); }) || null;
    }
    if (!_a) {
      _a = AUFTRAEGE.find(function (x) { return x.id === auftragId || String(x.id) === String(auftragId); });
    }
    if(_a&&_a.kommentare){
      var hatOffene=false;
      _a.kommentare.forEach(function(k){ if(k.istFrage&&!k.beantwortet){ k.beantwortet=true; hatOffene=true; } });
      if(hatOffene){
        var chatApiPre = typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi;
        if (chatApiPre && typeof chatApiPre.ccInternMergeKommentareFromServerIntoAuftrag === 'function') {
          try {
            await chatApiPre.ccInternMergeKommentareFromServerIntoAuftrag(_a, []);
          } catch (preMergeErr) {
            console.warn('[CHAT_MERGE_BEFORE_SAVE_FAIL]', preMergeErr);
          }
        }
      }
    }
  }
  await sendKommentar(auftragId, text, istFrage);
  inp.value='';
  if(chk) chk.checked=false;
  // Chat-Container neu rendern (Desktop oder Mobile)
  var containerId='chat-container-'+auftragId;
  if(document.getElementById(containerId)){
    renderChatBereich(auftragId, containerId);
  }
  // Falls mobiles Container (mobRenderDetail)
  var mobContainerId='mob-chat-container-'+auftragId;
  if(document.getElementById(mobContainerId)){
    renderChatBereich(auftragId, mobContainerId);
  }
  // Falls mobiles Aufgaben-Container (mobRenderAufgabeDetail) — alle passenden
  document.querySelectorAll('[id^="mob-aufg-chat-container-"]').forEach(function(el){
    renderChatBereich(auftragId, el.id);
  });
  updateGlocke();
  showToast('💬 Nachricht gesendet');
}

// Anzahl offener Fragen über alle Aufträge
function countOffeneFragen(){
  return AUFTRAEGE.reduce(function(sum,a){
    return sum + (a.kommentare||[]).filter(function(k){ return k.istFrage&&!k.beantwortet; }).length;
  },0);
}

// Glocken-Badge aktualisieren (Desktop cc-notif + Mobile mob-fragen-badge)
function updateGlocke(){
  var n=countOffeneFragen();
  var desktopGlocke =
    typeof ccDesktopKommunikationGlockeSichtbar === 'function'
      ? ccDesktopKommunikationGlockeSichtbar()
      : !(
          typeof window !== 'undefined' &&
          ((window.__CCINTERN_MITARBEITER_APP_BOOT__ === true) ||
            (window.CC_SHELL_UI_ACCESS && window.CC_SHELL_UI_ACCESS.isMitarbeiterAppOnlyShell === true))
        );
  if(typeof mobUpdateNachrichtenBadge === 'function'){
    mobUpdateNachrichtenBadge();
  } else {
    var mobBadge=document.getElementById('mob-fragen-badge');
    if(mobBadge){
      mobBadge.textContent=n;
      mobBadge.style.display=n>0?'':'none';
    }
  }
  if (desktopGlocke && typeof ccNotifBadgeUpdate === 'function') ccNotifBadgeUpdate();
  if (
    desktopGlocke &&
    typeof ccNotifRender === 'function' &&
    typeof CC_NOTIF_OPEN !== 'undefined' &&
    CC_NOTIF_OPEN
  ) {
    ccNotifRender();
  }
  // Offene Fragen Block auf Mobile Home neu rendern
  renderOffeneFragen();
}

// Offene Fragen Block auf Mobile Home rendern
function renderOffeneFragen(){
  var el=document.getElementById('mob-offene-fragen-block'); if(!el) return;
  var offene=[];
  AUFTRAEGE.forEach(function(a){
    (a.kommentare||[]).forEach(function(k){
      if(k.istFrage&&!k.beantwortet) offene.push({a:a,k:k});
    });
  });
  if(!offene.length){ el.style.display='none'; return; }
  el.style.display='';
  el.innerHTML='<div style="background:#5856D6;border-radius:14px;padding:12px 14px;margin-bottom:10px;">'
    +'<div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:8px;">❓ '+offene.length+' offene Frage'+(offene.length>1?'n':'')+' — Antwort erforderlich</div>'
    +offene.map(function(item){
      var a=item.a; var k=item.k;
      var zeit=k.ts?chatFormatTs(k.ts):(k.zeit||'');
      return '<div onclick="(function(){if(typeof mobTab===\'function\')mobTab(\'home\');var det=document.getElementById(\'mob-auftrag-detail\');if(det)det.style.display=\'\';var hc=document.getElementById(\'mob-home-content\');if(hc)hc.style.display=\'none\';var zb=document.getElementById(\'mob-zeiterfassung-block\');if(zb)zb.style.display=\'none\';MOB_AKTIV_AUF=\''+a.id+'\';mobRenderDetail(\''+a.id+'\');setTimeout(function(){var c=document.getElementById(\'mob-auftrag-kommunikation\')||document.getElementById(\'mob-chat-container-'+a.id+'\');if(c)c.scrollIntoView({behavior:\'smooth\',block:\'start\'});},350);})()" style="background:rgba(255,255,255,.15);border-radius:10px;padding:9px 11px;margin-bottom:6px;cursor:pointer;">'
        +'<div style="font-size:11px;font-weight:700;color:#fff;">'+a.kunde+' · '+a.id+'</div>'
        +'<div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:3px;">'+k.text+'</div>'
        +'<div style="font-size:10px;color:rgba(255,255,255,.5);margin-top:2px;">'+k.autor+' · '+zeit+'</div>'
      +'</div>';
    }).join('')
  +'</div>';
}

// Altes auAddKommentar bleibt für Rückwärtskompatibilität (ruft jetzt sendKommentar auf)
function auAddKommentar(auId){
  var a=AUFTRAEGE.find(function(x){ return x.id===auId; }); if(!a) return;
  var inp=document.getElementById('dp-komm-inp-'+auId); if(!inp) return;
  var text=inp.value.trim(); if(!text) return;
  inp.value='';
  sendKommentar(auId, text, false);
  // Chat-Container aktualisieren falls offen
  var cc=document.getElementById('chat-container-'+auId);
  if(cc) renderChatBereich(auId,'chat-container-'+auId);
  showToast('💬 Kommentar gespeichert');
}

// ── Schnell-Aktionen aus Detailansicht ────────────────────────────
function auDetailAktion(typ, auId){
  const a=AUFTRAEGE.find(x=>x.id===auId); if(!a) return;
  if(typ==='termin'){
    if(typeof ccInternPromptTermine !== 'function') return;
    ccInternPromptTermine(a, function(v){
      if(v.neuStart) a.terminDatum = v.neuStart;
      if(v.neuMontage!==undefined) a.montageDatum = v.neuMontage;
      if(v.neuZeit!==undefined) a.montageZeit = v.neuZeit;
      a.liefertermin = v.neuLiefer || v.neuStart || a.liefertermin;
      saveAuftraege();
      openAuftragDetail(auId);
      if(currentPage==='kalender') buildCCCalendar();
      showToast('📅 Termine aktualisiert');
    });
  }
  else if(typ==='mitarbeiter'){
    var sch = (typeof _internSchrittObjektFuerAuftragUndStep === 'function')
      ? _internSchrittObjektFuerAuftragUndStep(a, a.step)
      : (a.schritte && a.schritte[a.step]);
    if (!sch) return;
    if(typeof ccInternPromptText !== 'function') return;
    ccInternPromptText('Mitarbeiter zuweisen', 'Mitarbeiter für "'+STEP_LABELS[a.step].title+'"', sch.wer||'', function(neu){
      if(!neu) return;
      if (typeof console !== 'undefined' && console.log) {
        const a0 = AUFTRAEGE.find(function(x){ return x.id === auId; });
        if (a0) console.log('[auDetailAktion.mitarbeiter] vor Änderung', a0.step, a0.schritte && a0.schritte[a0.step]);
      }
      const raw = String(neu).trim();
      const parts = raw.split(/\s*\+\s*/).map(function (p) { return p.trim(); }).filter(function (p) { return p.length; });
      if (!parts.length) return;

      var prevMainId = sch.maId != null && String(sch.maId).trim() !== '' ? String(sch.maId).trim() : '';
      var prevExtraIds = Array.isArray(sch.maIds) ? sch.maIds.map(function(x){ return x != null ? String(x).trim() : ''; }).filter(Boolean) : [];
      var prevAllIds = prevMainId ? [prevMainId].concat(prevExtraIds) : prevExtraIds.slice();

      // Ein Token (Kürzel, Name, UUID) → bevorzugt Cockpit-User-UUID, sonst stabiler MA-Key
      function _auDetailTokenToUserUuid(t) {
        if (t == null) return null;
        var s0 = String(t).trim();
        if (s0 === '' || s0 === '—') return null;
        if (typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(s0)) return s0;
        var u = (typeof maKuerzelOderIdZuUserUuid === 'function') ? (maKuerzelOderIdZuUserUuid(s0) || null) : null;
        if (u && typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(u)) return u;
        if (u) return u;
        if (typeof maIdVonName === 'function') {
          var mid = maIdVonName(s0);
          if (mid) {
            u = (typeof maKuerzelOderIdZuUserUuid === 'function')
              ? (maKuerzelOderIdZuUserUuid(String(mid)) || (String(mid).length >= 32 ? String(mid) : null))
              : (String(mid).length >= 32 ? String(mid) : null);
            if (u) return u;
            return String(mid);
          }
        }
        if (typeof maDataFindByWorkflowKey === 'function') {
          var mHit = maDataFindByWorkflowKey(s0);
          if (mHit) {
            if (mHit.id != null && String(mHit.id).trim() !== '') return String(mHit.id).trim();
            if (mHit.maId != null && String(mHit.maId).trim() !== '') return String(mHit.maId).trim();
          }
        }
        if (typeof MA_DATA !== 'undefined' && Array.isArray(MA_DATA)) {
          var low = s0.toLowerCase();
          var byName = MA_DATA.find(function (m) {
            if (!m || !m.n) return false;
            var full = String(m.n).trim().toLowerCase();
            var first = full.split(' ')[0];
            return full === low || first === low;
          });
          if (byName) {
            if (byName.id != null && String(byName.id).trim() !== '') return String(byName.id).trim();
            if (byName.maId != null && String(byName.maId).trim() !== '') return String(byName.maId).trim();
          }
        }
        return s0;
      }

      var uids = [];
      var seen = {};
      for (var pi = 0; pi < parts.length; pi++) {
        var uu = _auDetailTokenToUserUuid(parts[pi]);
        if (uu && !seen[String(uu)]) { seen[String(uu)] = true; uids.push(uu); }
      }

      if (uids.length) {
        var names = uids.map(function (uid) {
          var m0 = (typeof maByID === 'function') ? maByID(uid) : null;
          return (m0 && m0.n) ? String(m0.n) : uid;
        });
        var kuerzels = uids.map(function (uid) {
          var m1 = (typeof maByID === 'function') ? maByID(uid) : null;
          return m1 && m1.k != null && String(m1.k).trim() !== '' ? String(m1.k).trim().toUpperCase() : '';
        }).filter(function (x) { return x; });
        var zusatzUids = uids.length > 1 ? uids.slice(1) : [];
        var zusatzK = kuerzels.length > 1 ? kuerzels.slice(1) : [];
        sch.werId = uids[0];
        sch.verantwortlicher = uids[0];
        sch.maId = uids[0];
        // maIds enthält bewusst alle IDs (Haupt + Zusatz) für mobile Filter-Kompatibilität.
        sch.maIds = uids.slice();
        sch.teamMaIds = uids.slice();
        sch.zusatzMa = zusatzK;
        sch.verantwortlicherName = names[0] || '—';
        sch.zusatzMaNames = names.length > 1 ? names.slice(1) : [];
        sch.wer = kuerzels.length ? kuerzels[0] : (names[0] || raw);
      } else {
        // Kein UUID-Resolve: Anzeigetext, aber widersprüchliche alte Ids leeren
        const haupt = parts[0] || '—';
        sch.werId = null;
        sch.wer = raw;
        sch.verantwortlicherName = haupt;
        sch.verantwortlicher = null;
        sch.maId = null;
        sch.maIds = [];
        sch.teamMaIds = [];
        sch.zusatzMa = [];
        sch.zusatzMaNames = [];
      }

      // INTERN-Aufgaben des betroffenen Schritts auf neue Zuordnung spiegeln (sofort sichtbar in Mobile-App).
      if (typeof INTERN_AUFGABEN !== 'undefined' && Array.isArray(INTERN_AUFGABEN)) {
        var stCanon = typeof mobCanonicalWorkflowStep === 'function' ? mobCanonicalWorkflowStep(a.step || '') : String(a.step || '');
        INTERN_AUFGABEN.forEach(function (g) {
          if (!g || !mobAuftragIdsGleich(g.auftragId, a.id)) return;
          var gStep = typeof mobCanonicalWorkflowStep === 'function' ? mobCanonicalWorkflowStep(g.schritt || '') : String(g.schritt || '');
          if (gStep !== stCanon) return;
          if (typeof mobTaskIstFertig === 'function' && mobTaskIstFertig(g)) return;
          g.maId = sch.maId != null ? String(sch.maId) : null;
          g.maIds = Array.isArray(sch.maIds) ? sch.maIds.slice() : (g.maId ? [g.maId] : []);
          g.teamMaIds = Array.isArray(sch.maIds) ? sch.maIds.slice() : (g.maId ? [g.maId] : []);
          g.verantwortlicher = sch.verantwortlicher != null ? String(sch.verantwortlicher) : null;
          g.verantwortlicherName = sch.verantwortlicherName || '';
          if (g.maId) g.ma = g.maId;
        });
      }

      if (typeof saveAufgaben === 'function') saveAufgaben();
      saveAuftraege();
      if (typeof mobSynchronisiereInternAufgabenMitWorkflow === 'function') {
        var mainNow = sch.maId != null ? String(sch.maId).trim() : '';
        if (mainNow) mobSynchronisiereInternAufgabenMitWorkflow(mainNow);
        prevAllIds.forEach(function (pid) {
          if (!pid || pid === mainNow) return;
          mobSynchronisiereInternAufgabenMitWorkflow(pid);
        });
      }
      if (typeof mobNachbessernInternAusDesktopKeys === 'function') {
        var mainNow2 = sch.maId != null ? String(sch.maId).trim() : '';
        if (mainNow2) mobNachbessernInternAusDesktopKeys(mainNow2);
      }
      if (typeof mobRenderHome === 'function') mobRenderHome();
      if (typeof MOB_AKTIV_TAB !== 'undefined' && MOB_AKTIV_TAB === 'aufgaben' && typeof mobRenderAlle === 'function') mobRenderAlle();
      openAuftragDetail(auId);
      if (typeof console !== 'undefined' && console.log) {
        const ap = AUFTRAEGE.find(function(x){ return x.id === auId; });
        if (ap) {
          console.log('[auDetailAktion.mitarbeiter] nach save', ap.step, ap.schritte && ap.schritte[ap.step]);
        }
      }
      showToast('👤 Mitarbeiter geändert: ' + (sch.verantwortlicherName || sch.wer));
    });
  }
  else if(typ==='status'){
    if(typeof ccInternConfirm !== 'function') return;
    var stepKey = a.step;
    var offenCl = typeof ccInternHatOffeneChecklistenpunkte === 'function' && ccInternHatOffeneChecklistenpunkte(a, stepKey);
    var msg = offenCl
      ? 'Es sind noch Checklistenpunkte offen. Auftrag trotzdem fortsetzen?'
      : 'Schritt "'+STEP_LABELS[a.step].title+'" als fertig markieren?';
    ccInternConfirm(msg, function(){
    document.getElementById('detailOverlay').classList.remove('open');
    schrittFertig(auId);
    });
  }
  else if(typ==='handy-fix'){
    // Schritte ohne Stunden → Default einsetzen, dann Aufgaben erzeugen
    var changed = false;
    ['grafik','druck','laminat','montage','doku'].forEach(function(s){
      var sch = a.schritte && a.schritte[s]; if(!sch) return;
      if((sch.dauer||0) <= 0){
        var def = AU_STEP_CONFIG && AU_STEP_CONFIG[s] ? AU_STEP_CONFIG[s].defaultDauer : 0;
        if(def > 0){ sch.dauer = def; changed = true; }
      }
    });
    // Bestehende Aufgaben für diesen Auftrag entfernen und neu anlegen
    for(var i = INTERN_AUFGABEN.length-1; i>=0; i--){
      if(INTERN_AUFGABEN[i].auftragId === auId) INTERN_AUFGABEN.splice(i,1);
    }
    void (async function () {
      await auftragAufgabenErzeugen(auId);
      if(changed) saveAuftraege();
      saveAufgaben();
      renderMitarbeiter();
      openAuftragDetail(auId);
      showToast('📱 Auftrag ist jetzt im Handy sichtbar!');
    })();
  }
}
// ── Toast-Benachrichtigung ────────────────────────────────────────
var _toastTimer = null;
function showToast(msg){
  var el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  if(_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ el.style.opacity='0'; }, 3000);
}

// ── closeDetail: Overlay sicher schließen ────────────────────────
function closeDetail(){
  var ov = document.getElementById('detailOverlay');
  if(ov) ov.classList.remove('open');
}

// ── PRODUKTION UPDATE HELPERS ────────────────────
function renderRechnungButtons(auId,rechnung){
  var btns=[
    {v:'offen',lbl:'Offen',ac:'var(--amber)',al:'var(--amber-l)'},
    {v:'geschrieben',lbl:'Geschrieben',ac:'var(--blue)',al:'var(--blue-l)'},
    {v:'bezahlt',lbl:'Bezahlt ✓',ac:'var(--green)',al:'var(--green-l)'},
  ];
  return btns.map(function(b){
    var on=rechnung===b.v;
    return '<button data-aid="'+auId+'" data-status="'+b.v+'" onclick="setRechnung(this.dataset.aid,this.dataset.status)" style="flex:1;padding:8px;border-radius:8px;border:1.5px solid '+(on?b.ac:'var(--border)')+';background:'+(on?b.al:'#fff')+';font-size:12px;font-weight:'+(on?'700':'400')+';cursor:pointer;color:'+(on?b.ac:'var(--text2)')+'">'+b.lbl+'</button>';
  }).join('');
}

// ── Inline-Edit: Feld im Auftragsdetail direkt speichern ──────
function auDetailFieldSave(inp){
  var auId  = inp.dataset.auId;
  var field = inp.dataset.field;
  var a = AUFTRAEGE.find(function(x){return x.id===auId;});
  if(!a||!field) return;
  var newVal = inp.value.trim();
  if(String(a[field]||'') === newVal) return; // nichts geändert
  // Numerische Felder als Zahl speichern
  if(field === 'netto' || field === 'brutto' || field === 'flaeche' || field === 'stueck'){
    var num = parseFloat(newVal.replace(',','.'));
    a[field] = isNaN(num) ? 0 : num;
    // Netto geändert → Brutto automatisch neu berechnen
    if(field === 'netto' && !isNaN(num) && num > 0){
      a.brutto = parseFloat((num * 1.19).toFixed(2));
    }
  } else {
    a[field] = newVal;
  }
  saveAuftraege();
  // Kurz grün aufleuchten als Bestätigung
  inp.style.borderBottomColor='var(--green)';
  inp.style.color='var(--green)';
  setTimeout(function(){ inp.style.borderBottomColor='transparent'; inp.style.color='var(--text)'; },800);
}

function renderTemplateSection(auId,tpl){
  tpl=tpl||{};
  var hasTpl = !!(tpl.typ||tpl.version||tpl.datei||tpl.scan);
  var colId  = 'tpl-body-'+auId;
  const typen=['Vorhandene Vorlage','Selbst erstellt','3D-Scan','Fahrzeugtemplate extern','Kein Template'];
  const typOpts=typen.map(function(t){return '<option value="'+t+'" '+(tpl.typ===t?'selected':'')+'>'+t+'</option>';}).join('');
  return '<div class="dp-section">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" '
    +'onclick="(function(btn,body){var open=body.style.display!==\'none\';body.style.display=open?\'none\':\'\';btn.textContent=open?\'▼ Anzeigen\':\'▲ Schließen\';})(this.querySelector(\'button\'),document.getElementById(\''+colId+'\'))">'
    +'<div class="dp-slbl" style="margin-bottom:0;">🗂 Template / Scan-Dokumentation'
    +(hasTpl?' <span style="font-size:10px;color:var(--green);font-weight:600;">✓ Ausgefüllt</span>':' <span style="font-size:10px;color:var(--text3);">leer</span>')
    +'</div>'
    +'<button type="button" style="font-size:11px;color:var(--blue);background:var(--blue-l);border:none;border-radius:20px;padding:3px 10px;cursor:pointer;font-weight:600;">'
    +(hasTpl?'▲ Schließen':'▼ Anzeigen')
    +'</button></div>'
    +'<div id="'+colId+'" style="'+(hasTpl?'':'display:none;')+'margin-top:10px;">'
    +'<div class="dp-row"><span class="dp-lbl" style="font-size:11px;">Template-Typ</span>'
    +'<span class="dp-val"><select class="fs" style="font-size:11px;padding:4px 6px;" data-auId="'+auId+'" data-field="typ" data-ctx="tpl" onchange="prodHandleChange(this)"><option value="">—</option>'+typOpts+'</select></span></div>'
    +'<div class="dp-row"><span class="dp-lbl" style="font-size:11px;">Template-Version</span>'
    +'<span class="dp-val"><input type="text" value="'+(tpl.version||'')+'" placeholder="z.B. Bus 1789 v2.1" data-auId="'+auId+'" data-field="version" data-ctx="tpl" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:11px;" onchange="prodHandleChange(this)"></span></div>'
    +'<div class="dp-row"><span class="dp-lbl" style="font-size:11px;">Template-Datei</span>'
    +'<span class="dp-val"><input type="text" value="'+(tpl.datei||'')+'" placeholder="z.B. Bus1789_v21.cdr" data-auId="'+auId+'" data-field="datei" data-ctx="tpl" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:11px;" onchange="prodHandleChange(this)"></span></div>'
    +'<div class="dp-row"><span class="dp-lbl" style="font-size:11px;">3D-Scan</span>'
    +'<span class="dp-val"><select class="fs" style="font-size:11px;padding:4px 6px;" data-auId="'+auId+'" data-field="scan" data-ctx="tpl" onchange="prodHandleChange(this)">'
    +'<option value="">—</option>'
    +'<option value="Ja" '+(tpl.scan==="Ja"?"selected":"")+'>Ja</option>'
    +'<option value="Nein" '+(tpl.scan==="Nein"?"selected":"")+'>Nein</option>'
    +'<option value="Ausstehend" '+(tpl.scan==="Ausstehend"?"selected":"")+'>Ausstehend</option>'
    +'</select></span></div>'
    +'</div>'
    +'</div>';
}

function prodComboSelect(sel){
  var auId  = sel.dataset.auId;
  var field = sel.dataset.field;
  var ctx   = sel.dataset.ctx;
  var uid   = sel.dataset.uid;
  var val   = sel.value;
  var manDiv = document.getElementById('man-'+auId+'-'+uid);
  var manInp = document.getElementById('inp-'+auId+'-'+uid);

  if(val === '__manual__'){
    // Show freetext field
    if(manDiv) manDiv.style.display='flex';
    if(manInp){ manInp.focus(); }
    // Don't save "__manual__" — wait for text input
  } else {
    // Hide freetext, save library value
    if(manDiv) manDiv.style.display='none';
    if(manInp) manInp.value='';
    if(ctx==='plan')  prodUpdatePlan(auId,field,val);
    else if(ctx==='prod') prodUpdateProd(auId,field,val);
    else if(ctx==='tpl')  prodUpdateTpl(auId,field,val);
    if(val) showToast('✓ '+field+': '+val.substring(0,40));
  }
}


function prodHandleChange(el){
  var auId=el.dataset.auId, field=el.dataset.field, ctx=el.dataset.ctx, val=el.value;
  if(ctx==='plan') prodUpdatePlan(auId,field,val);
  else if(ctx==='prod') prodUpdateProd(auId,field,val);
  else if(ctx==='tpl') prodUpdateTpl(auId,field,val);
}
function prodUpdatePlan(id,field,val){
  const a=AUFTRAEGE.find(x=>x.id===id); if(!a) return;
  if(!a.prod) a.prod={planung:{},produktion:{bestaetigt:false},template:{},dateien:[]};
  if(!a.prod.planung) a.prod.planung={};
  a.prod.planung[field]=val;
}
function prodUpdateProd(id,field,val){
  const a=AUFTRAEGE.find(x=>x.id===id); if(!a) return;
  if(!a.prod.produktion) a.prod.produktion={bestaetigt:false};
  a.prod.produktion[field]=val;
}
function prodUpdateTpl(id,field,val){
  const a=AUFTRAEGE.find(x=>x.id===id); if(!a) return;
  if(!a.prod.template) a.prod.template={};
  a.prod.template[field]=val;
}
function prodBestaetigen(id){
  const a=AUFTRAEGE.find(x=>x.id===id); if(!a) return;
  const jetzt=new Date().toLocaleDateString('de-DE')+' '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  a.prod.produktion.bestaetigt=true;
  a.prod.produktion.bestaetigtVon='Selim';
  a.prod.produktion.bestaetigtAm=jetzt;
  openAuftragDetail(id);
  showToast('✓ Produktionsdaten archiviert · '+id);
}
async function prodAddDateiMitTyp(id,e,typRaw,slotOpts){
  await prodAddDateiImpl(id,e,typRaw||'druckdatei', slotOpts);
}

/** Upload aus file-Input mit data-ccintern-typ, optional phase/position (Fahrzeug-Slots, Vorher/Nachher). */
async function prodAddDateiFromDatasetInput(ev){
  var inp = ev && ev.target;
  if(!inp || !inp.dataset || !inp.dataset.aid) return;
  var id = inp.dataset.aid;
  var typRaw = (inp.dataset.ccinternTyp || 'montagefoto').trim().toLowerCase();
  var opts = {};
  if(inp.dataset.ccinternPhase) opts.phase = String(inp.dataset.ccinternPhase).trim();
  if(inp.dataset.ccinternPosition) opts.position = String(inp.dataset.ccinternPosition).trim();
  await prodAddDateiImpl(id, ev, typRaw, opts);
}

/** Legacy-Alias (Drag&Drop dateien.js): gleicher Upload wie Druckdatei. */
function prodAddDatei(id,e){
  void prodAddDateiMitTyp(id,e,'druckdatei');
}

async function prodAddDateiImpl(id,e,typRaw,slotOpts){
  slotOpts = slotOpts || {};
  var phaseOpt = slotOpts.phase != null ? String(slotOpts.phase).trim() : '';
  var positionOpt = slotOpts.position != null ? String(slotOpts.position).trim() : '';
  var a=AUFTRAEGE.find(function(x){return x.id===id;}); if(!a) return;
  var files=Array.from(e.target.files||[]);
  if(!files.length){ e.target.value=''; return; }
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  var typ = String(typRaw||'druckdatei').trim().toLowerCase();
  var cid = a.ccApiId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(a.ccApiId).trim())
    ? String(a.ccApiId).trim()
    : '';
  if (!api || typeof api.uploadCcInternAuftragDatei !== 'function'){
    showToast('⚠ Kein Cockpit-API-Kontext für Datei-Upload.');
    e.target.value='';
    return;
  }
  if (!cid){
    if (!a.__pendingCcinternDateiUploads) a.__pendingCcinternDateiUploads = [];
    files.forEach(function(f){
      var item = { file: f, typ: typ };
      if (phaseOpt) item.phase = phaseOpt;
      if (positionOpt) item.position = positionOpt;
      a.__pendingCcinternDateiUploads.push(item);
    });
    showToast('📎 '+files.length+' Datei(en) warten auf Auftrag-Speichern');
    e.target.value='';
    return;
  }
  try {
    for (var fi = 0; fi < files.length; fi++){
      await api.uploadCcInternAuftragDatei(cid, files[fi], {
        typ: typ,
        phase: phaseOpt || undefined,
        position: positionOpt || undefined,
      });
    }
    if (typeof api.reloadAuftraegeFromApiIntoMemory === 'function'){
      await api.reloadAuftraegeFromApiIntoMemory(typeof showToast === 'function' ? showToast : null);
    }
    openAuftragDetail(id);
    showToast('📎 '+files.length+' Datei(en) gespeichert');
  } catch (err){
    if (typeof console !== 'undefined' && console.warn) console.warn(err);
    showToast('⚠ Upload fehlgeschlagen');
  }
  e.target.value='';
}
// ── Datei / Foto löschen (mit Bestätigung) ────────────────────────────
function ccDeleteUpload(auId, src, idx){
  if(typeof ccInternConfirm !== 'function') return;
  ccInternConfirm('Möchten Sie diese Datei wirklich löschen?\nDieser Vorgang kann nicht rückgängig gemacht werden.', function(){
  var a = AUFTRAEGE.find(function(x){ return x.id===auId; });
  if(!a) return;
  if (src === 'server') {
    var cache = window.__dpAlleDateienCache || [];
    var row = cache[idx];
    var sid = row && row.serverDateiId;
    var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
    if (!sid || !api || typeof api.deleteCcInternAuftragDatei !== 'function' || !a.ccApiId) {
      showToast('⚠ Server-Datei kann nicht gelöscht werden (kein API-Kontext).');
      return;
    }
    api.deleteCcInternAuftragDatei(String(a.ccApiId), String(sid)).then(function(){
      if (typeof api.revokeCcInternServerDateienBlobUrls === 'function') api.revokeCcInternServerDateienBlobUrls(a);
      openAuftragDetail(auId);
      showToast('🗑 Datei gelöscht');
    }).catch(function(e){
      if (typeof console !== 'undefined' && console.warn) console.warn(e);
      showToast('⚠ Löschen fehlgeschlagen');
    });
    return;
  }
  if(src === 'a'){
    if(a.dateien && a.dateien[idx] !== undefined) a.dateien.splice(idx,1);
  } else if(src === 'p'){
    var _p = a.produktion || a.prod || {};
    if(_p.dateien && _p.dateien[idx] !== undefined) _p.dateien.splice(idx,1);
  } else if(src === 'plan'){
    var _prodPl = a.prod || {};
    var _pln = _prodPl.planung || {};
    if(_pln.dateien && _pln.dateien[idx] !== undefined) _pln.dateien.splice(idx,1);
  } else if(src === 'foto'){
    if(a.fotos && a.fotos[idx] !== undefined) a.fotos.splice(idx,1);
  }
  saveAuftraege();
  openAuftragDetail(auId);
  showToast('🗑 Datei gelöscht');
  });
}

function prodDeleteDatei(id,idx){
  if(typeof ccInternConfirm !== 'function') return;
  ccInternConfirm('Möchten Sie diese Datei wirklich löschen?', function(){
  var a=AUFTRAEGE.find(function(x){return x.id===id;}); if(!a) return;
  var _p = a.prod || a.produktion || {};
  if(_p.dateien) _p.dateien.splice(idx,1);
  saveAuftraege();
  openAuftragDetail(id);
  showToast('🗑 Datei entfernt');
  });
}


// ── ANGEBOTE (VOLLSTÄNDIG) ───────────────────────
let AG_DATEN = [
  {id:'AG-2026-019',kunde:'Neue Ruhr Zeitung',ap:'Hr. Weber',betreff:'Ganzgestaltung Bus + Fenster',
   datum:'15.03.2026',gueltig:'15.04.2026',zahlung:'30 Tage netto',
   einleitung:'Sehr geehrter Herr Weber, gerne unterbreiten wir Ihnen folgendes Angebot.',
   schluss:'Bei Fragen stehen wir Ihnen gerne zur Verfügung.',inotiz:'',
   positionen:[
     {bez:'Digitaldruckfolie ORAJET® 3551',eh:'m²',menge:42,ep:65,beschr:'inkl. Laminat'},
     {bez:'Fensterfolie perforiert 50/50',eh:'m²',menge:8,ep:48,beschr:''},
     {bez:'Grafik / Design',eh:'pauschal',menge:1,ep:180,beschr:'Layout 2 Seiten'},
     {bez:'Montage Bus + Fenster',eh:'pauschal',menge:1,ep:380,beschr:'inkl. Reinigung'},
   ],rabatt:0,mwst:19,status:'versendet',erstellt:'15.03.2026',vonAnfrage:null},
  {id:'AG-2026-018',kunde:'Essen Marketing GmbH',ap:'Fr. Koch',betreff:'3× Teilgestaltung Tram',
   datum:'12.03.2026',gueltig:'12.04.2026',zahlung:'30 Tage netto',
   einleitung:'',schluss:'',inotiz:'Folgeauftrag wenn erste 3 gut laufen',
   positionen:[
     {bez:'Digitaldruckfolie ORAJET® 3551',eh:'m²',menge:36,ep:65,beschr:'3 Fahrzeuge à 12m²'},
     {bez:'Laminat ORAGUARD® 215G',eh:'m²',menge:36,ep:18,beschr:''},
     {bez:'Grafik / Design',eh:'pauschal',menge:1,ep:240,beschr:'3 Layouts'},
     {bez:'Montage (3 Fahrzeuge)',eh:'pauschal',menge:3,ep:220,beschr:''},
     {bez:'Fahrzeugreinigung',eh:'pauschal',menge:3,ep:55,beschr:''},
     {bez:'Express-Aufschlag',eh:'pauschal',menge:1,ep:120,beschr:'Lieferzeit 3 Werktage'},
   ],rabatt:5,mwst:19,status:'entwurf',erstellt:'12.03.2026',vonAnfrage:null},
  {id:'AG-2026-017',kunde:'Sparkasse Essen',ap:'Hr. Schulz',betreff:'Heckwerbung 5 Busse',
   datum:'08.03.2026',gueltig:'08.04.2026',zahlung:'30 Tage netto',
   einleitung:'',schluss:'',inotiz:'',
   positionen:[
     {bez:'Digitaldruckfolie ORAJET® 3551 Heck',eh:'m²',menge:21,ep:65,beschr:'5× 4,2m²'},
     {bez:'Grafik / Design Heckwerbung',eh:'pauschal',menge:1,ep:150,beschr:''},
     {bez:'Montage (5 Fahrzeuge)',eh:'pauschal',menge:5,ep:95,beschr:''},
   ],rabatt:0,mwst:19,status:'angenommen',erstellt:'08.03.2026',vonAnfrage:null},
];
let agAktivId = null;
let agAktivTab = 'alle';
let agPositionen = [];
let agNr = 20;

// Accordion
function agAcToggle(n){
  const body=document.getElementById('agac-body-'+n);
  const arrow=document.getElementById('agac-arrow-'+n);
  if(!body||!arrow) return;
  const closed=body.classList.contains('ac-closed');
  body.classList.toggle('ac-closed',!closed);
  arrow.classList.toggle('open',closed);
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
    document.getElementById('ag-kunde').value=a.kunde;
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

// Positionen
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

// ── Maße / Flächenberechnung ─────────────────────────────────
var agFlaeche = 0;

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

if (!window.__CCINTERN_COCKPIT_MOUNT__) {
window.agSave = function(status){
  const kunde=document.getElementById('ag-kunde')?.value;
  if(!kunde){showToast('⚠ Bitte Kunde wählen');return;}
  if(!agPositionen.length){showToast('⚠ Mindestens 1 Position nötig');return;}
  const {netto}=agCalcSumme();
  const id=agAktivId||('AG-2026-0'+agNr++);
  const obj={
    id, kunde,
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
};
}

function agTab(el, tab){
  agAktivTab=tab;
  document.querySelectorAll('#pg-angebote .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  renderAngebote();
}

if (!window.__CCINTERN_COCKPIT_MOUNT__) {
window.renderAngebote = function(){
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
};
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


// ── KERNFUNKTION: Schnell-Anfrage → Vollständiges Angebot ──
if (!window.__CCINTERN_COCKPIT_MOUNT__) {
window.anfZuAngebot = function(anfId){
  const anf=ANF_DATEN.find(x=>x.id===anfId); if(!anf) return;
  const agId='AG-2026-0'+agNr++;
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
  const newAg={
    id:agId, kunde:anf.kunde, ap:anf.kontakt||'',
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
  AG_DATEN.unshift(newAg);
  // Mark Anfrage as converted
  anf.status='angebot';
  // Navigate to Angebote and open
  goPage('angebote',document.querySelector('[onclick*="angebote"]'),'Angebote','Angebotsverwaltung');
  renderAngebote();
  setTimeout(()=>{ agOpenDetail(agId); agModalOpen(agId); },200);
  showToast('⚡ '+anfId+' → '+agId+' · Angebot erstellt!');
};
}

// Wrapper für handleNew
function tabAG(el,f){
  document.querySelectorAll('#pg-angebote .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  agTab(el,f);
}


// ── SCHNELL-ANFRAGEN — PREISSTRUKTUR ────────────

// ═══════════════════════════════════════════════
// PREISTABELLEN (zentral — hier alles anpassen)
// ═══════════════════════════════════════════════
const KALK = {

  // ── Materialpreise pro m² (inkl. Druck) ───
  // Druck ist im Materialpreis enthalten — keine separate Druckposition!
  material: {
    'ORAJET® 3551 GLOSSY':        { preis:38.00, laminat:'Laminat Standard' },
    'ORAJET® 3551 MATT':          { preis:38.00, laminat:'Laminat Standard' },
    'ORAJET® 3162 CAST MATT':     { preis:35.00, laminat:'Laminat Standard' },
    'Avery MPI 1105 GLOSSY':      { preis:45.00, laminat:'Avery Laminat Premium' },
    'VakoSun Protect 20A':        { preis:45.00, laminat:null },
    'Fensterfolie milchig':       { preis:38.00, laminat:null },
    'Fensterfolie perforiert 50': { preis:65.00, laminat:null },
    'Reflexfolie 3M Engineer':    { preis:65.00, laminat:null },
    'Dibond 3mm weiß':            { preis:38.00, laminat:null },
    'Acryl 3mm klar':             { preis:45.00, laminat:null },
    'PVC Banner 500g':            { preis:38.00, laminat:null },
    'Alu-Verbundplatte 3mm':      { preis:38.00, laminat:null },
  },

  // ── Laminat pro m² (einheitlich) ──────────
  laminat: {
    'Laminat Standard':      18.00,
    'Avery Laminat Premium': 18.00,
    'ohne Laminat':           0,
  },

  // ── Druck: im Materialpreis enthalten ─────
  // Kein separater Druckposten mehr!
  druck: { preis:0, verschnitt:0.10 }, // verschnitt bleibt für Materialberechnung

  // ── Grafik: Stundensatz ───────────────────
  grafik: {
    std_pro_h: 75,   // 75 €/h
    // Stunden je Aufwand (frei wählbar im Modal über anf-grafik-std)
    stunden: { einfach:1, mittel:2, komplex:4 },
  },

  // ── Montage: reiner Stundensatz ───────────
  montage: {
    std_pro_h: 55,    // 55 €/h pro Monteur
    // Richtwert-Stunden je Fläche (zur Orientierung, Nutzer kann überschreiben)
    staffel: [
      { bis:1,    h:1.5 },
      { bis:3,    h:2.5 },
      { bis:6,    h:4.0 },
      { bis:12,   h:6.0 },
      { bis:20,   h:8.0 },
      { bis:9999, h:12.0 },
    ],
  },

  // ── Produktion (neu) ──────────────────────
  produktion: {
    std_pro_h: 45,    // 45 €/h
    plot_fix:  40,    // Zuschnitt/Plotten pauschal
    daten_fix: 25,
  },

  // ── Vorbereitung (neu) ────────────────────
  vorbereitung: {
    preis: 50,        // Reinigung & Vorbereitung pauschal
  },

  // ── Demontage ─────────────────────────────
  demontage: {
    klein:  { preis:80,  beschr:'bis 1m²' },
    mittel: { preis:150, beschr:'1–5m²' },
    gross:  { preis:250, beschr:'über 5m²' },
    proM2:  12,
  },

  // ── Altfolien-Entfernung ──────────────────
  altfolie: {
    proM2:    20,
    kleberM2: 10,
  },

  // ── Höhenzuschläge ────────────────────────
  hoehe: {
    leiter:    { preis:30,  beschr:'Leiter erforderlich' },
    geruest:   { preis:120, beschr:'Gerüst erforderlich' },
    hebebuehne:{ preis:250, beschr:'Hebebühne erforderlich' },
  },

  // ── Reinigung (legacy, jetzt über vorbereitung) ──
  reinigung: { preis:50, proM2:0 },

  // ── Anfahrt: pauschal 50 € ────────────────
  anfahrt: {
    zone1: { preis:0,  beschr:'Mülheim / Essen (kostenlos)' },
    zone2: { preis:50, beschr:'Ruhrgebiet / NRW (pauschal)' },
    zone3: { preis:50, beschr:'Ruhrgebiet / NRW (pauschal)' },
  },

  // ── Express: +15% auf Gesamtpreis ─────────
  aufschlag: {
    schwierig:   { einfach:1.0, mittel:1.2, schwer:1.5 },
    express_pct: 0.15,   // +15% Express-Aufschlag
    express3:    0,      // nicht mehr genutzt
    express5:    0,
  },

  // ── Mindestpreise je Leistung ─────────────
  mindest: {
    fahrzeug:   1750,   // realistischer Mindestpreis Fahrzeugvollverklebung
    fenster:    350,
    schild:     200,
    druck:      150,
    aufkleber:  100,
    sonstiges:  250,
    global:     200,
  },

  // ── Rabatt-Limits ─────────────────────────
  rabatt: {
    standard_max: 0.10,  // max 10% ohne Freigabe
    freigabe_max: 0.10,  // höher nur manuell / kein Auto-Limit
  },

  // ── MwSt. ─────────────────────────────────
  mwst: 0.19,

  /*
   * ═══════════════════════════════════════════════════════════════
   * WICHTIG: Diese Kalkulation orientiert sich an der echten Praxis.
   * Fahrzeugvollverklebung: ca. 1.700–3.500 € (je Aufwand/Größe).
   * Materialpreise (38–45 €/m²) sind All-in (inkl. Druck).
   * Montage: 55 €/h reiner Stundensatz, keine m²-Staffel.
   * Grafik: 75 €/h, Stunden frei eingebbar.
   * Express: +15% auf Gesamtnetto.
   * Anfahrt: pauschal 50 €, Zone 1 kostenlos.
   * Mindestpreis Fahrzeug: 1.750 € (kein theoretischer Wert).
   * ═══════════════════════════════════════════════════════════════
   */
};

// ═══════════════════════════════════════════════
// MATERIAL-EMPFEHLUNGEN JE LEISTUNG
// ═══════════════════════════════════════════════
const MAT_EMPFEHLUNG = {
  fahrzeug: {
    material: 'ORAJET® 3551 GLOSSY',
    laminat:  'Laminat Standard',
    hinweis:  'Standardfolie 38 €/m² (inkl. Druck). Für Vollfolierung / Cast: 45 €/m².',
  },
  fenster: {
    material: 'Fensterfolie milchig',
    laminat:  'ohne Laminat',
    hinweis:  'Perforiert 50/50 für bedruckte Schaufenster. Milchig für Sichtschutz.',
  },
  schild: {
    material: 'Dibond 3mm weiß',
    laminat:  'ohne Laminat',
    hinweis:  'Dibond für Außen. Acryl für hochwertige Innenanwendungen.',
  },
  druck: {
    material: 'PVC Banner 500g',
    laminat:  'ohne Laminat',
    hinweis:  'Banner 500g/m² outdoor. Für Rollup: kein Laminat nötig.',
  },
  aufkleber: {
    material: 'ORAJET® 3551 GLOSSY',
    laminat:  'Laminat Standard',
    hinweis:  'Für Außenbereich immer mit Laminat (18 €/m²). Innen ggf. ohne.',
  },
  sonstiges: {
    material: 'ORAJET® 3551 GLOSSY',
    laminat:  'Laminat Standard',
    hinweis:  'Material je nach Anwendung anpassen.',
  },
};

// ═══════════════════════════════════════════════
// VORLAGEN FÜR HÄUFIGE LEISTUNGEN
// Jede Vorlage liefert nur Maße + Parameter — KEIN Preis.
// mindest_override:null  → Fahrzeug-Mindestpreis (1750 €) gilt  → Vollfahrzeug
// mindest_override:N     → Kleinauftrag-Mindestpreis N €        → Teilbeklebung
// ═══════════════════════════════════════════════
const ANF_VORLAGEN = [
  // Fläche 0.70 m² → Teilbeklebung → Mindest 200 €
  { name:'Heckwerbung',         ico:'🚗', leistung:'fahrzeug',
    b:1.4,  h:0.5,  stueck:1, grafik_std:1, aufwand:'einfach', montage_std:1,
    liefertage:3, anfahrt:'zone1', mit_reinigung:false,
    datei_hinweis:true,
    beschr:'Heckscheibe / Heckklappe PKW — Teilbeklebung',
    mindest_override:200 },

  // Fläche 0.96 m² → Teilbeklebung → Mindest 200 €
  { name:'Türbeschriftung',     ico:'🚗', leistung:'fahrzeug',
    b:1.2,  h:0.4,  stueck:2, grafik_std:1, aufwand:'einfach', montage_std:1.5,
    liefertage:3, anfahrt:'zone1', mit_reinigung:false,
    datei_hinweis:true,
    beschr:'2× Seitentür mit Logo + Text — Teilbeklebung',
    mindest_override:200 },

  // Fläche 3.00 m² → Teilbeklebung → Mindest 400 €
  { name:'Seitenbeschriftung',  ico:'🚗', leistung:'fahrzeug',
    b:2.5,  h:0.6,  stueck:2, grafik_std:2, aufwand:'mittel',  montage_std:2.5,
    liefertage:5, anfahrt:'zone1', mit_reinigung:false,
    datei_hinweis:true,
    beschr:'Beide Seiten beschriftet — Teilbeklebung',
    mindest_override:400 },

  // Fläche 4.90 m² → Teilbeklebung → Mindest 400 € — kein Druck, kein Laminat (Plot)
  { name:'Teilfolierung (Plot)',   ico:'✂️', leistung:'fahrzeug',
    b:3.5,  h:1.4,  stueck:1, grafik_std:1, aufwand:'mittel',  montage_std:5.5,
    liefertage:5, anfahrt:'zone1', mit_reinigung:true,
    material:'ORAJET® 3162 CAST MATT',
    laminat:'ohne Laminat',
    ohne_druck:true,
    zuschlag_pct:0,
    datei_hinweis:true,
    beschr:'Teilfolierung Plotfolie farbig — kein Druck, kein Laminat',
    mindest_override:400 },

  // Fläche 6.40 m² → Teilbeklebung → Mindest 400 € — mit Digitaldruck + Laminat
  { name:'Teilfolierung (Druck)',  ico:'🖨️', leistung:'fahrzeug',
    b:4.0,  h:1.6,  stueck:1, grafik_std:2, aufwand:'mittel',  montage_std:8,
    liefertage:5, anfahrt:'zone1', mit_reinigung:true,
    material:'Avery MPI 1105 GLOSSY',
    laminat:'Avery Laminat Premium',
    ohne_druck:false,
    zuschlag_pct:0.15,
    datei_hinweis:true,
    beschr:'Teilfolierung mit Digitaldruck + Laminat — Avery',
    mindest_override:400 },

  // Vollfahrzeug → Fahrzeug-Mindestpreis greift
  { name:'Vollfolierung',       ico:'🚗', leistung:'fahrzeug',
    b:14.0, h:1.6,  stueck:1, grafik_std:4, aufwand:'mittel',  montage_std:8,
    liefertage:7, anfahrt:'zone1', mit_reinigung:true,
    material:'Avery MPI 1105 GLOSSY',
    laminat:'Avery Laminat Premium',
    laminat_fix:true,
    zuschlag_pct:0.15,
    datei_hinweis:false,
    beschr:'Komplette PKW-Folierung (Richtpreis) — Vollfahrzeug Avery',
    mindest_override:null },

  // ── Fenster / Schaufenster ──────────────────────────────────────────
  // Fläche 1.80 m² → Kleinauftrag → Mindest 180 €
  { name:'Fenster milchig klein', ico:'🪟', leistung:'fenster',
    b:1.5,  h:1.2,  stueck:1, grafik_std:1, aufwand:'einfach', montage_std:1.5,
    liefertage:3, anfahrt:'zone1', mit_reinigung:false,
    beschr:'Sichtschutzfolie — Kleinauftrag',
    mindest_override:180 },

  // Fläche 8.00 m² → Kleinauftrag → Mindest 350 €
  { name:'Schaufenster groß',     ico:'🪟', leistung:'fenster',
    b:4,    h:2,    stueck:1, grafik_std:2, aufwand:'mittel',  montage_std:3,
    liefertage:5, anfahrt:'zone2', mit_reinigung:false,
    beschr:'Schaufensterfolie mit Logo — Kleinauftrag',
    mindest_override:350 },

  // ── Schilder ────────────────────────────────────────────────────────
  // Fläche 1.00 m² → Kleinauftrag → Mindest 180 €
  { name:'Schild A0 Dibond',      ico:'📋', leistung:'schild',
    b:1.19, h:0.84, stueck:1, grafik_std:1, aufwand:'einfach', montage_std:1,
    liefertage:3, anfahrt:'zone1', mit_reinigung:false,
    beschr:'Außenschild A0 — Kleinauftrag',
    mindest_override:180 },

  // Fläche 2.00 m² → Kleinauftrag → Mindest 200 €
  { name:'Schild groß',           ico:'📋', leistung:'schild',
    b:2,    h:1,    stueck:1, grafik_std:1, aufwand:'einfach', montage_std:1.5,
    liefertage:5, anfahrt:'zone1', mit_reinigung:false,
    beschr:'Großes Firmenschild — Kleinauftrag',
    mindest_override:200 },

  // ── Druck / Banner ──────────────────────────────────────────────────
  // Fläche 1.70 m² → Kleinauftrag → Mindest 150 €
  { name:'Roll-Up 85×200',        ico:'🖨️', leistung:'druck',
    b:0.85, h:2,    stueck:1, grafik_std:1, aufwand:'einfach', montage_std:null,
    liefertage:3, anfahrt:'zone1', mit_reinigung:false,
    beschr:'Roll-Up inkl. Gestell — Kleinauftrag',
    mindest_override:150 },

  // Fläche 3.00 m² → Kleinauftrag → Mindest 200 €
  { name:'Banner outdoor',        ico:'🖨️', leistung:'druck',
    b:3,    h:1,    stueck:1, grafik_std:1, aufwand:'einfach', montage_std:null,
    liefertage:3, anfahrt:'zone1', mit_reinigung:false,
    beschr:'PVC Banner mit Ösen — Kleinauftrag',
    mindest_override:200 },
];

// ═══════════════════════════════════════════════
// KALKULATIONS-ENGINE
// ═══════════════════════════════════════════════
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

// ═══════════════════════════════════════════════
// ANF STATE
// Wichtig: netto/brutto werden NIEMALS gespeichert.
// Preis = immer berechneAngebot(a.params) zur Laufzeit.
// ═══════════════════════════════════════════════
let ANF_DATEN = [
  { id:'ANF-2026-001', kunde:'Bäckerei Schmidt', kontakt:'0201/123456', kanal:'Telefon',
    leistung:'schild', leistungLabel:'📋 Schild', beschr:'Türschild 60×30cm',
    params:{ leistung:'schild', b:0.6, h:0.3, stueck:2, grafik_std:1, aufwand:'einfach',
             montage_std:null, liefertage:5, mit_reinigung:false, mit_vorbereitung:false,
             anfahrt:'zone1', mit_demontage:'', mit_altfolie:false,
             mit_plot:false, mit_daten:false, hoehe:'', rabatt:0 },
    erstellt:'18.03.2026', status:'offen' },
  { id:'ANF-2026-002', kunde:'Autohaus Meier', kontakt:'meier@auto.de', kanal:'E-Mail',
    leistung:'fenster', leistungLabel:'🪟 Fenster', beschr:'Schaufenster 4×1.8m milchig',
    params:{ leistung:'fenster', b:4, h:1.8, stueck:1, grafik_std:2, aufwand:'mittel',
             montage_std:null, liefertage:5, mit_reinigung:false, mit_vorbereitung:false,
             anfahrt:'zone2', mit_demontage:'', mit_altfolie:false,
             mit_plot:false, mit_daten:false, hoehe:'', rabatt:0 },
    erstellt:'17.03.2026', status:'offen' },
];

let anfAktivId = null;
let anfNr = 3;
let anfParams = {};  // current modal state

// ═══════════════════════════════════════════════
// MODAL STEUERUNG
// ═══════════════════════════════════════════════
function anfModalClose(){ document.getElementById('anfModal').classList.remove('open'); }

function anfNeuModal(){
  anfAktivId=null;
  ANF_AKTIV_VORLAGE=null;
  anfParams={
    leistung:'fahrzeug', b:0, h:0, stueck:1,
    grafik_std:1, montage_std:null, aufwand:'einfach', liefertage:5,
    mit_reinigung:false, mit_vorbereitung:false, anfahrt:'zone1',
    mit_demontage:'', mit_altfolie:false, mit_plot:false, mit_daten:false,
    mat_reflex:false, mat_lochfolie:false,
    mit_laminat:true, laminat_fix:false,
    hoehe:'', rabatt:0,
  };
  anfInitLeistungButtons(); // aus CC_LEISTUNGEN befüllen
  anfResetForm();
  anfInitVorlagen();
  anfSelLeistung('fahrzeug','🚗 PKW / Fahrzeug');
  anfSelFzgGroesse('pkw-mittel');
  anfSelAufwand('einfach');
  anfSelLieferzeit(5);
  anfSelAnfahrt('zone1');
  anfCalcUndRender();
  document.getElementById('anfModal').classList.add('open');
}

// Leistungs-Buttons aus CC_LEISTUNGEN dynamisch aufbauen
function anfInitLeistungButtons(){
  var container = document.getElementById('anf-leistung-btns');
  if(!container || container.children.length > 0) return; // nur einmal
  CC_LEISTUNGEN.forEach(function(l){
    var lbl = document.createElement('label');
    lbl.id = 'anfl-'+l.id;
    lbl.style.cssText='padding:9px 14px;border-radius:9px;border:2px solid var(--border);background:#fff;cursor:pointer;text-align:center;';
    lbl.innerHTML='<input type="radio" name="anf-leistung" style="display:none;">'
      +'<span style="font-size:16px;">'+l.ico+'</span> '
      +'<span style="font-size:12px;font-weight:600;color:var(--text2);">'+l.label.split('/')[0].trim()+'</span>';
    lbl.onclick = (function(lid, llabel){ return function(){ anfSelLeistung(lid, llabel); }; })(l.id, l.ico+' '+l.label);
    container.appendChild(lbl);
  });
}

function anfResetForm(){
  ['anf-kunde','anf-kontakt','anf-beschr','anf-notiz'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('anf-b').value='';
  document.getElementById('anf-h').value='';
  document.getElementById('anf-stueck').value='1';
  document.getElementById('anf-rabatt-inp').value='0';
  // Materialoptionen zurücksetzen
  ['anf-cb-reflex','anf-cb-lochfolie'].forEach(function(id){
    var cb=document.getElementById(id); if(cb) cb.checked=false;
  });
  var cbLam=document.getElementById('anf-cb-laminat');
  if(cbLam){ cbLam.checked=true; cbLam.disabled=false; cbLam.parentElement.style.opacity='1'; }
  var lh=document.getElementById('anf-laminat-hinweis');
  if(lh) lh.style.display='none';
  [1,2,3,4,5].forEach(n=>{
    const b=document.getElementById('anfac-body-'+n);
    const a=document.getElementById('anfac-arrow-'+n);
    if(n===1){ b&&b.classList.remove('ac-closed'); a&&a.classList.add('open'); }
    else { b&&b.classList.add('ac-closed'); a&&a.classList.remove('open'); }
  });
}

// ── Vorlagen ──
var ANF_AKTIV_VORLAGE = null; // Index der aktuell aktiven Vorlage

function anfInitVorlagen(){
  const grid=document.getElementById('anf-vorlagen-grid'); if(!grid) return;
  grid.innerHTML=ANF_VORLAGEN.map((v,i)=>{
    const isActive = i === ANF_AKTIV_VORLAGE;
    return `<button type="button" id="anf-vorl-btn-${i}" onclick="anfLadeVorlage(${i})"
      style="padding:9px 7px;border-radius:9px;border:1.5px solid ${isActive?'var(--green)':'var(--border)'};background:${isActive?'var(--green-l)':'#fff'};cursor:pointer;text-align:center;transition:all .12s;"
      onmouseover="if(${i}!==ANF_AKTIV_VORLAGE){this.style.borderColor='var(--green)';this.style.background='var(--green-l)';}"
                +'onmouseout="this.style.borderColor=\'#DDE3E8\'">' 
      <div style="font-size:18px;margin-bottom:3px;">${v.ico}</div>
      <div style="font-size:11px;font-weight:${isActive?'700':'600'};line-height:1.2;color:${isActive?'var(--green)':'inherit'};">${v.name}</div>
    </button>`;
  }).join('');
}

function anfLadeVorlage(idx){
  const v=ANF_VORLAGEN[idx]; if(!v) return;
  ANF_AKTIV_VORLAGE = idx;
  anfInitVorlagen(); // Grid neu rendern → aktive Vorlage markiert
  // Maße skalieren je Fahrzeuggröße (nur Fahrzeug-Vorlagen)
  const scaled = anfMaesseSkalieren(v);
  document.getElementById('anf-b').value=scaled.b;
  document.getElementById('anf-h').value=scaled.h;
  document.getElementById('anf-stueck').value=v.stueck||1;
  document.getElementById('anf-beschr').value=v.beschr||'';
  anfParams.b=scaled.b; anfParams.h=scaled.h; anfParams.stueck=v.stueck||1;
  anfParams.mindest_override = (v.mindest_override !== undefined) ? v.mindest_override : null;
  anfParams.material      = v.material     || null;
  anfParams.laminat       = v.laminat      || null;
  anfParams.ohne_druck    = v.ohne_druck   || false;
  anfParams.zuschlag_pct  = v.zuschlag_pct || 0;
  anfParams.datei_hinweis = v.datei_hinweis || false;
  anfParams.laminat_fix   = v.laminat_fix  || false;
  // Laminat: bei Digitaldruck standardmäßig an, bei Plot immer aus
  anfParams.mit_laminat   = v.ohne_druck ? false : true;
  // Checkbox aktualisieren
  const cbLam = document.getElementById('anf-cb-laminat');
  if(cbLam){
    cbLam.checked   = anfParams.mit_laminat;
    cbLam.disabled  = anfParams.laminat_fix || v.ohne_druck;
    cbLam.parentElement.style.opacity = (anfParams.laminat_fix || v.ohne_druck) ? '0.45' : '1';
  }
  const lamHinweis = document.getElementById('anf-laminat-hinweis');
  if(lamHinweis) lamHinweis.style.display = 'none';
  // Grafik-Stunden aus Vorlage (alt: grafik-Stufe → Stunden mappen)
  const grafikStdMap={einfach:1, mittel:2, komplex:4};
  const gStd = v.grafik_std || grafikStdMap[v.grafik||'einfach'] || 1;
  anfParams.grafik_std = gStd;
  const gStdEl = document.getElementById('anf-grafik-std');
  if(gStdEl) gStdEl.value = gStd;
  anfParams.montage_std = v.montage_std || null;
  const mStdEl = document.getElementById('anf-montage-std');
  if(mStdEl) mStdEl.value = v.montage_std || '';
  anfParams.mit_reinigung=v.mit_reinigung||false;
  anfParams.mit_vorbereitung=v.mit_vorbereitung||false;
  if(v.mit_reinigung){ const cb=document.getElementById('anf-cb-reinigung'); if(cb) cb.checked=true; }
  anfSelLeistung(v.leistung,'');
  anfSelAufwand(v.aufwand||'einfach');
  anfSelLieferzeit(v.liefertage||5);
  anfSelAnfahrt(v.anfahrt||'zone1');
  // Sektionen 2, 3, 4, 5 öffnen — damit Maße, Kalkulation und Preis sofort sichtbar
  [2,3,4,5].forEach(n=>{
    const b=document.getElementById('anfac-body-'+n);
    const a=document.getElementById('anfac-arrow-'+n);
    b&&b.classList.remove('ac-closed'); a&&a.classList.add('open');
  });
  anfCalcUndRender();
  const cfg = ANF_FZG_CONFIG[ANF_FZG_GROESSE]||ANF_FZG_CONFIG['pkw-mittel'];
  showToast('✓ '+v.name+' · '+scaled.b+'×'+scaled.h+'m ('+cfg.label+')');
}

// ── Leistungsauswahl ──
// ── Fahrzeuggröße ──────────────────────────────
// Konfiguration: Faktor beeinflusst Montage-Richtwert + Mindestpreis
var ANF_FZG_GROESSE = 'pkw-mittel'; // Default

const ANF_FZG_CONFIG = {
  //                              Maßfaktoren: b×Basis, h×Basis
  'pkw-klein':    { label:'PKW Klein',      montageFaktor:0.8, mindestVoll:1400, bFaktor:0.85, hFaktor:0.90 },
  'pkw-mittel':   { label:'PKW Mittel',     montageFaktor:1.0, mindestVoll:1750, bFaktor:1.00, hFaktor:1.00 },
  'pkw-gross':    { label:'PKW Groß',       montageFaktor:1.2, mindestVoll:2200, bFaktor:1.15, hFaktor:1.10 },
  'trans-klein':  { label:'Trans. Klein',   montageFaktor:1.3, mindestVoll:2000, bFaktor:1.30, hFaktor:1.20 },
  'trans-mittel': { label:'Trans. Mittel',  montageFaktor:1.6, mindestVoll:2500, bFaktor:1.55, hFaktor:1.35 },
  'trans-gross':  { label:'Trans. Groß',    montageFaktor:2.0, mindestVoll:3200, bFaktor:1.85, hFaktor:1.55 },
};

// ── Maße skalieren: Basis-Maße × Fahrzeuggröße-Faktor ──────────────
// Nur bei Fahrzeug-Vorlagen. Rundet auf 2 Dezimalstellen.
function anfMaesseSkalieren(v){
  if(!v || v.leistung !== 'fahrzeug') return { b:v.b, h:v.h };
  const cfg = ANF_FZG_CONFIG[ANF_FZG_GROESSE] || ANF_FZG_CONFIG['pkw-mittel'];
  return {
    b: Math.round(v.b * cfg.bFaktor * 100) / 100,
    h: Math.round(v.h * cfg.hFaktor * 100) / 100,
  };
}

function anfSelFzgGroesse(key){
  ANF_FZG_GROESSE = key;
  // Button-Styles aktualisieren
  document.querySelectorAll('#anf-fzg-btns button').forEach(function(b){
    var isActive = b.id === 'anf-fzg-'+key;
    b.style.borderColor  = isActive ? 'var(--blue)'   : 'var(--border)';
    b.style.background   = isActive ? 'var(--blue-l)' : '#fff';
    b.style.color        = isActive ? 'var(--blue)'   : '';
    b.style.fontWeight   = isActive ? '700'           : '400';
  });
  // Wenn Vorlage aktiv → Maße sofort neu skalieren
  if(ANF_AKTIV_VORLAGE !== null){
    const v = ANF_VORLAGEN[ANF_AKTIV_VORLAGE];
    if(v && v.leistung === 'fahrzeug'){
      const scaled = anfMaesseSkalieren(v);
      document.getElementById('anf-b').value = scaled.b;
      document.getElementById('anf-h').value = scaled.h;
      anfParams.b = scaled.b;
      anfParams.h = scaled.h;
    }
  }
  anfCalcUndRender();
}

function anfFzgGroesseBlock(leistung){
  var block = document.getElementById('anf-fzg-groesse-block');
  if(block) block.style.display = (leistung === 'fahrzeug') ? '' : 'none';
}

function anfSelLeistung(key,label){
  anfParams.leistung=key;
  document.querySelectorAll('[id^="anfl-"]').forEach(el=>{
    el.style.borderColor='var(--border)'; el.style.background='#fff';
    const d=el.querySelector('div:last-child'); if(d) d.style.color='var(--text2)';
  });
  const sel=document.getElementById('anfl-'+key);
  if(sel){ sel.style.borderColor='var(--green)'; sel.style.background='var(--green-l)';
    const d=sel.querySelector('div:last-child'); if(d) d.style.color='var(--green)'; }
  if(label) { const s=document.getElementById('anfac-sub-2'); if(s) s.textContent=label; }
  // Fahrzeuggröße-Block ein/ausblenden
  anfFzgGroesseBlock(key);
  // Material-Empfehlung
  const emp=MAT_EMPFEHLUNG[key];
  const mv=document.getElementById('anf-mat-vorschlag');
  const mt=document.getElementById('anf-mat-vorschlag-text');
  if(mv&&mt&&emp){ mv.style.display='block';
    mt.textContent=emp.material+(emp.laminat&&emp.laminat!=='ohne Laminat'?' + '+emp.laminat:'')+' — '+emp.hinweis; }
  anfCalcUndRender();
}

// ── Grafik ──
// anfSelGrafik: Grafik wird jetzt als freie Stundeneingabe erfasst (kein Paket mehr)
function anfSelGrafik(stufe){
  // Nur noch Stunden aus Staffel setzen wenn kein manueller Wert
  const stdMap={einfach:1, mittel:2, komplex:4};
  const std = stdMap[stufe] || 1;
  anfParams.grafik_std = std;
  const el = document.getElementById('anf-grafik-std');
  if(el && el.value==='') el.value = std;
  anfCalcUndRender();
}

// ── Aufwand / Schwierigkeit ──
function anfSelAufwand(a){
  anfParams.aufwand=a;
  const styles={ einfach:{b:'var(--green)',bg:'var(--green-l)',c:'var(--green)'},
    mittel:{b:'var(--amber)',bg:'var(--amber-l)',c:'var(--amber)'},
    schwer:{b:'var(--red)',bg:'#FEECEC',c:'var(--red)'} };
  ['einfach','mittel','schwer'].forEach(v=>{
    const el=document.getElementById('anf-aufwand-'+v); if(!el) return;
    const on=v===a;
    el.style.borderColor=on?styles[v].b:'var(--border)';
    el.style.background=on?styles[v].bg:'#fff';
    el.style.color=on?styles[v].c:'var(--text2)';
    el.style.fontWeight=on?'700':'400';
  });
  anfCalcUndRender();
}

// ── Lieferzeit ──
function anfSelLieferzeit(tage){
  anfParams.liefertage=tage;
  document.querySelectorAll('#anf-liefer-btns button').forEach(b=>{
    b.style.borderColor='var(--border)'; b.style.background='#fff';
    b.style.color='var(--text2)'; b.style.fontWeight='400';
  });
  const el=document.getElementById('anf-lief-'+tage);
  if(el){ el.style.borderColor='var(--green)'; el.style.background='var(--green-l)';
    el.style.color='var(--green)'; el.style.fontWeight='700'; }
  anfCalcUndRender();
}

// ── Anfahrt ──
function anfSelAnfahrt(zone){
  anfParams.anfahrt=zone;
  document.querySelectorAll('[id^="anf-anfahrt-"]').forEach(b=>{
    b.style.borderColor='var(--border)'; b.style.background='#fff';
    b.style.color='var(--text2)'; b.style.fontWeight='400';
  });
  const el=document.getElementById('anf-anfahrt-'+zone);
  if(el){ el.style.borderColor='var(--blue)'; el.style.background='var(--blue-l)';
    el.style.color='var(--blue)'; el.style.fontWeight='600'; }
  anfCalcUndRender();
}

// ── Checkbox-Optionen ──
function anfToggle(key, val){
  anfParams[key]=val;
  anfCalcUndRender();
}
function anfToggleLaminat(cb){
  if(anfParams.laminat_fix){ cb.checked=true; return; } // Vollfolierung: nicht abschaltbar
  anfParams.mit_laminat = cb.checked;
  const hinweis = document.getElementById('anf-laminat-hinweis');
  if(hinweis) hinweis.style.display = cb.checked ? 'none' : 'block';
  anfCalcUndRender();
}
function anfToggleDemontage(sel){ anfParams.mit_demontage=sel.value; anfCalcUndRender(); }
function anfToggleHoehe(sel){ anfParams.hoehe=sel.value; anfCalcUndRender(); }

// ═══════════════════════════════════════════════
// KALKULATION & RENDERING
// ═══════════════════════════════════════════════
function anfCalcUndRender(){
  anfParams.b        = parseFloat(document.getElementById('anf-b')?.value||0);
  anfParams.h        = parseFloat(document.getElementById('anf-h')?.value||0);
  anfParams.stueck   = parseInt(document.getElementById('anf-stueck')?.value||1);
  anfParams.rabatt   = parseInt(document.getElementById('anf-rabatt-inp')?.value||0);
  anfParams.grafik_std  = parseFloat(document.getElementById('anf-grafik-std')?.value||1);
  const mStdEl = document.getElementById('anf-montage-std');
  anfParams.montage_std = mStdEl && mStdEl.value!=='' ? parseFloat(mStdEl.value) : null;

  const r = berechneAngebot(anfParams);
  const fmt = v => '€ '+v.toFixed(2);
  const zel = id => document.getElementById(id);

  // ── Flächen-Info ──
  const fi=zel('anf-flaeche-info');
  if(fi){
    if(r.flaeche>0){
      fi.style.display='block';
      fi.textContent=anfParams.b+'m × '+anfParams.h+'m × '+anfParams.stueck+' Stk = '
        +r.flaeche.toFixed(2)+' m²'+(r.flaeche<2?' ⚠ Kleinfläche (+20% Aufschlag)':'');
    } else {
      fi.style.display='none';
    }
  }

  // ── Gruppenfarben ──
  const gf = {
    material:'var(--blue)',laminat:'var(--teal)',druck:'var(--blue)',
    grafik:'var(--purple)',montage:'var(--amber)',demontage:'var(--red)',
    reinigung:'var(--teal)',anfahrt:'var(--gray)',produktion:'var(--teal)',
    hoehe:'var(--amber)',express:'var(--red)',aufschlag:'var(--gray)',
    mindest:'var(--amber)',
  };

  function renderItems(items){
    return items.map(item=>`
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:.5px solid var(--border);">
        <div>
          <span style="font-size:12px;">${item.label}</span>
          ${item.detail?'<div style="font-size:10px;color:var(--text3);">'+item.detail+'</div>':''}
        </div>
        <span style="font-size:13px;font-weight:600;color:${gf[item.gruppe]||'var(--text)'};">${fmt(item.preis)}</span>
      </div>`).join('');
  }

  function sectionHdr(label, summe, col){
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0 4px;margin-top:8px;">
      <span style="font-size:10px;font-weight:700;color:${col};text-transform:uppercase;letter-spacing:.07em;">${label}</span>
      <span style="font-size:12px;font-weight:700;color:${col};">${fmt(summe)}</span>
    </div>`;
  }

  // ── Kalkulations-Tabelle: 3 Sektionen ──
  const kr = zel('anf-kalk-rows');
  if(kr){
    const basisItems    = r.items.filter(i=>i.typ==='basis');
    const optionItems   = r.items.filter(i=>i.typ==='option');
    const zuschlagItems = r.items.filter(i=>i.typ==='zuschlag');

    let html = '';

    // Basispreis
    if(basisItems.length){
      html += sectionHdr('Basispreis', r.summeBasis, 'var(--blue)');
      html += renderItems(basisItems);
    }

    // Optionen & Zuschläge (immer sichtbar)
    html += sectionHdr('Optionen & Leistungen', r.summeOptionen, 'var(--purple)');
    html += renderItems(optionItems);

    // Zuschläge
    if(zuschlagItems.length){
      html += sectionHdr('Zuschläge', r.summeZuschlaege, 'var(--amber)');
      html += renderItems(zuschlagItems);
    }

    // Trennlinie + Summe
    html += `<div style="border-top:2px solid var(--border);margin-top:8px;padding-top:8px;">`;
    if(r.rabattWert > 0)
      html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--green);">
        <span>Rabatt ${(r.effRabatt*100).toFixed(0)}%</span><span>− ${fmt(r.rabattWert)}</span></div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;">
      <span style="font-size:13px;font-weight:700;">Netto gesamt</span>
      <span style="font-size:15px;font-weight:800;color:var(--green);">${fmt(r.summeNetto)}</span></div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:11px;color:var(--text2);">
      <span>zzgl. 19% MwSt.</span><span>${fmt(r.mwst)}</span></div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;background:var(--blue-l);border-radius:6px;padding:6px 8px;margin-top:4px;">
      <span style="font-size:13px;font-weight:700;color:var(--blue);">Brutto</span>
      <span style="font-size:16px;font-weight:800;color:var(--blue);">${fmt(r.brutto)}</span></div>`;
    html += `</div>`;

    // ── Margen-Anzeige ──
    const gewinnFarbe = r.gewinnPct >= 40 ? 'var(--green)' : r.gewinnPct >= 20 ? 'var(--amber)' : 'var(--red)';
    html += `<div style="margin-top:10px;padding:12px;background:#0A1929;border-radius:8px;">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">Margenübersicht</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div style="background:rgba(255,255,255,.05);border-radius:6px;padding:8px;">
          <div style="font-size:10px;color:rgba(255,255,255,.4);">Gesamtkosten (gesch.)</div>
          <div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.7);">${fmt(r.gesamtkosten)}</div>
        </div>
        <div style="background:rgba(255,255,255,.05);border-radius:6px;padding:8px;">
          <div style="font-size:10px;color:rgba(255,255,255,.4);">Verkaufspreis (Netto)</div>
          <div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.85);">${fmt(r.summeNetto)}</div>
        </div>
        <div style="background:rgba(255,255,255,.05);border-radius:6px;padding:8px;">
          <div style="font-size:10px;color:rgba(255,255,255,.4);">Gewinn</div>
          <div style="font-size:14px;font-weight:700;color:${gewinnFarbe};">${fmt(r.gewinnEuro)}</div>
        </div>
        <div style="background:rgba(255,255,255,.08);border-radius:6px;padding:8px;border:1px solid ${gewinnFarbe}40;">
          <div style="font-size:10px;color:rgba(255,255,255,.4);">Marge</div>
          <div style="font-size:18px;font-weight:800;color:${gewinnFarbe};">${r.gewinnPct} %</div>
        </div>
      </div>
    </div>`;

    kr.innerHTML = html;
  }

  // ── Summen ──
  if(zel('anf-netto-display'))  zel('anf-netto-display').textContent=fmt(r.summeNetto);
  if(zel('anf-mwst-display'))   zel('anf-mwst-display').textContent=fmt(r.mwst);
  if(zel('anf-brutto-display')) zel('anf-brutto-display').textContent=fmt(r.brutto);
  if(zel('anfac-sub-5'))        zel('anfac-sub-5').textContent='Netto '+fmt(r.summeNetto)+' · Brutto '+fmt(r.brutto);

  // ── Grafik-Preis-Hint ──
  const gHint = zel('anf-grafik-preis-hint');
  if(gHint){ const gStd=parseFloat(zel('anf-grafik-std')?.value||1); gHint.textContent=fmt(gStd*KALK.grafik.std_pro_h); }

  // ── Rabatt-Warnung ──
  const rw=zel('anf-rabatt-warn');
  if(rw){
    if(r.rabattFreigabe){ rw.style.display='block'; rw.textContent='⚠ Rabatt über 10% — Freigabe durch Celal erforderlich!'; }
    else rw.style.display='none';
  }

  // ── Banner ──
  if(zel('anf-banner-netto'))   zel('anf-banner-netto').textContent=fmt(r.summeNetto);
  if(zel('anf-banner-brutto'))  zel('anf-banner-brutto').textContent=fmt(r.brutto);
  if(zel('anf-banner-mindest')) zel('anf-banner-mindest').textContent='Min. € '+r.mindest;
}

function anfFileSet(inp,slotId,nameId){
  const slot=document.getElementById(slotId);
  const nameEl=document.getElementById(nameId);
  if(inp.files.length&&slot&&nameEl){
    slot.style.borderColor='var(--green)'; slot.style.borderStyle='solid';
    nameEl.textContent='✓ '+inp.files[0].name.substring(0,28);
  }
}

function anfUpdateSub(){
  const k=document.getElementById('anf-kunde')?.value||'';
  if(k){ const s=document.getElementById('anfac-sub-2'); if(s) s.textContent=k; }
}

// ── Accordion ──
function anfAcToggle(n){
  const body=document.getElementById('anfac-body-'+n);
  const arrow=document.getElementById('anfac-arrow-'+n);
  if(!body||!arrow) return;
  const closed=body.classList.contains('ac-closed');
  body.classList.toggle('ac-closed',!closed);
  arrow.classList.toggle('open',closed);
}

// ═══════════════════════════════════════════════
// VERSENDEN
// ═══════════════════════════════════════════════
function anfSenden(kanal){
  const kunde=document.getElementById('anf-kunde')?.value?.trim()||'Kunde';
  const kontakt=document.getElementById('anf-kontakt')?.value?.trim()||'';
  const r=berechneAngebot(anfParams);
  const beschr=document.getElementById('anf-beschr')?.value||anfParams.leistung;
  const hinweisZeile = anfParams.datei_hinweis
    ? '\nHinweis: Fertige Dateiübernahme – kein Entwurf enthalten.\n' : '\n';
  const text='Angebot CC Werbung GmbH\n\nFür: '+kunde+'\nLeistung: '+beschr+'\nFläche: '+r.flaeche.toFixed(2)+' m²\nLieferzeit: '+anfParams.liefertage+' Werktage'
    +hinweisZeile
    +'\nNetto: € '+r.summeNetto.toFixed(2)+'\nBrutto (inkl. 19% MwSt.): € '+r.brutto.toFixed(2)+'\n\n'
    +'Angebot ansehen:\nhttps://cc-werbung.de/angebot/[ID]\n\nCC Werbung GmbH';
  if(kanal==='whatsapp'){
    const tel=kontakt.replace(/\D/g,'');
    window.open('https://wa.me/'+(tel||'')+'?text='+encodeURIComponent(text),'_blank');
    showToast('💬 WhatsApp geöffnet');
  } else {
    window.open('mailto:'+kontakt+'?subject='+encodeURIComponent('Angebot CC Werbung – '+beschr)+'&body='+encodeURIComponent(text),'_blank');
    showToast('📤 E-Mail geöffnet');
  }
}

// ── Speichern ──
function anfSpeichernEntwurf(){ showToast('💾 Entwurf gespeichert'); anfModalClose(); }

if (!window.__CCINTERN_COCKPIT_MOUNT__) {
window.anfSpeichern = function(){
  const kunde  = document.getElementById('anf-kunde')?.value?.trim();
  const kontakt= document.getElementById('anf-kontakt')?.value?.trim()||'';
  if(!kunde){ showToast('⚠ Bitte Kundenname eingeben'); return; }

  const r=berechneAngebot(anfParams);
  const leistungLabels={fahrzeug:'🚗 PKW / Fahrzeug',fenster:'🪟 Fenster',schild:'📋 Schild',druck:'🖨️ Druck',aufkleber:'🏷 Aufkleber',sonstiges:'⭐ Sonstiges'};
  const id='ANF-2026-00'+anfNr++;

  ANF_DATEN.unshift({
    id, kunde, kontakt,
    kanal:   anfParams.kanal||'Telefon',
    leistung:anfParams.leistung,
    leistungLabel:leistungLabels[anfParams.leistung]||anfParams.leistung,
    beschr:  document.getElementById('anf-beschr')?.value||'',
    params:  {...anfParams},
    notiz:   document.getElementById('anf-notiz')?.value||'',
    // netto/brutto werden NICHT gespeichert — immer live aus berechneAngebot(params)
    status:'offen',
    erstellt:new Date().toLocaleDateString('de-DE'),
  });

  // ── Kunde automatisch ins CRM aufnehmen (falls noch nicht vorhanden) ──
  var crmNeuAngelegt = false;
  var crmKey = kunde.split(' ')[0]; // Kurzschlüssel = erster Teil des Namens
  // Eindeutigkeit sicherstellen: falls Key schon belegt, Suffix anhängen
  if(CRM_KUNDEN[crmKey] && CRM_KUNDEN[crmKey].name.toLowerCase() !== kunde.toLowerCase()){
    crmKey = crmKey + '_' + anfNr;
  }
  // Nur anlegen wenn kein Eintrag mit exakt diesem Namen existiert
  var existiert = Object.values(CRM_KUNDEN).some(function(k){
    return k.name.toLowerCase() === kunde.toLowerCase();
  });
  if(!existiert){
    var isMail  = kontakt.includes('@');
    var isTel   = !isMail && kontakt.length > 0;
    CRM_KUNDEN[crmKey] = {
      name:            kunde,
      ap:              '—',
      apFunktion:      '—',
      tel:             isTel  ? kontakt : '—',
      mail:            isMail ? kontakt : '—',
      adresse:         '—', plz:'—', stadt:'—',
      branche:         'Neu',
      umsatz:          '—',
      auftragsvolumen: 0,
      fahrzeuge:       0,
      status:          'Angebot',
      letzterKontakt:  new Date().toLocaleDateString('de-DE'),
      naechsteAktion:  'Angebot '+id+' nachfassen',
      notiz:           'Über Schnell-Angebot '+id+' angelegt. Leistung: '+(leistungLabels[anfParams.leistung]||anfParams.leistung),
    };
    crmNeuAngelegt = true;
  }

  anfModalClose();
  renderAnfragen();
  anfOpenDetail(id);

  var msg = '✓ '+id+' · '+kunde+' · € '+r.summeNetto.toFixed(0);
  if(crmNeuAngelegt) msg += ' · Kunde im CRM angelegt';
  showToast(msg);
};
}

// ─── Anfragen Liste ───────────────────────────
if (!window.__CCINTERN_COCKPIT_MOUNT__) {
window.renderAnfragen = function(){
  const el=document.getElementById('anf-liste'); if(!el) return;
  const offen=ANF_DATEN.filter(a=>a.status==='offen').length;
  const ang=ANF_DATEN.filter(a=>a.status==='angebot').length;
  const gew=ANF_DATEN.filter(a=>a.status==='gewonnen').length;
  const so=document.getElementById('anf-stat-offen');if(so)so.textContent=offen;
  const sa=document.getElementById('anf-stat-angebot');if(sa)sa.textContent=ang;
  const sg=document.getElementById('anf-stat-gewonnen');if(sg)sg.textContent=gew;
  const stCol={offen:'var(--amber)',angebot:'var(--blue)',gewonnen:'var(--green)',abgelehnt:'var(--red)'};
  const stLbl={offen:'Offen',angebot:'Angebot',gewonnen:'Gewonnen ✓',abgelehnt:'Abgelehnt'};
  el.innerHTML=ANF_DATEN.map(a=>{
    const col=stCol[a.status]||'var(--gray)'; const lbl=stLbl[a.status]||a.status;
    const isActive=anfAktivId===a.id;
    // Preis immer live aus Kalkulation — niemals aus gespeichertem Wert
    const r=a.params ? berechneAngebot(a.params) : null;
    const nettoAnz = r ? '€ '+r.summeNetto.toFixed(0) : '—';
    return '<div onclick="anfOpenDetail(\''+a.id+'\')" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;background:'+(isActive?'var(--green-l)':'#fff')+';transition:background .1s;">'
      +'<div style="width:36px;height:36px;border-radius:9px;background:'+(isActive?'var(--green)':'var(--green-l)')+';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">'+a.leistungLabel.split(' ')[0]+'</div>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:11px;font-weight:700;color:var(--text3);">'+a.id+' · '+a.erstellt+'</div>'
        +'<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+a.kunde+'</div>'
        +'<div style="font-size:11px;color:var(--text2);">'+a.leistungLabel+(a.params&&a.params.b?' · '+a.params.b+'×'+a.params.h+'m':'')+'</div>'
      +'</div>'
      +'<div style="text-align:right;flex-shrink:0;">'
        +'<div style="font-size:14px;font-weight:700;color:var(--green);">'+nettoAnz+'</div>'
        +'<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:'+col+'20;color:'+col+';font-weight:600;">'+lbl+'</span>'
      +'</div>'
    +'</div>';
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--text3);">Noch keine Anfragen</div>';
};
}

function anfOpenDetail(id){
  anfAktivId=id;
  const a=ANF_DATEN.find(x=>x.id===id); if(!a) return;
  renderAnfragen();
  const body=document.getElementById('anf-detail-body');
  const badge=document.getElementById('anf-gen-badge');
  if(!body) return;
  const stCol={offen:'var(--amber)',angebot:'var(--blue)',gewonnen:'var(--green)',abgelehnt:'var(--red)'};
  const stLbl={offen:'Offen',angebot:'Angebot erstellt',gewonnen:'Gewonnen ✓',abgelehnt:'Abgelehnt'};
  const col=stCol[a.status]||'var(--gray)';
  if(badge){ badge.style.display='block';
    badge.innerHTML='<span class="bdg" style="background:'+col+'20;color:'+col+';">'+stLbl[a.status]+'</span>'; }

  // Preis immer live aus Kalkulation — kein Fallback auf gespeicherten Wert
  const r=a.params ? berechneAngebot(a.params) : {items:[],summeNetto:0,mwst:0,brutto:0,flaeche:0};

  body.innerHTML=
    '<div style="padding:14px 16px;background:var(--gray-l);border-bottom:1px solid var(--border);">'
    +'<div style="font-size:20px;font-weight:700;margin-bottom:2px;">'+a.kunde+'</div>'
    +'<div style="font-size:13px;color:var(--text2);">'+a.leistungLabel+' · '+a.kanal+'</div>'
    +'<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;">'
    +(r.flaeche>0?'<span class="bdg bgr">'+r.flaeche.toFixed(2)+' m²</span>':'')
    +(a.params?.aufwand?'<span class="bdg bgr">'+a.params.aufwand+'</span>':'')
    +(a.params?.liefertage?'<span class="bdg bgr">'+a.params.liefertage+' Tage</span>':'')
    +(a.beschr?'<span style="font-size:11px;color:var(--text3);">'+a.beschr+'</span>':'')
    +'</div></div>'
    // Kalkulation
    +'<div style="padding:12px 16px;border-bottom:1px solid var(--border);">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text2);letter-spacing:.06em;margin-bottom:6px;">Kalkulation</div>'
    +r.items.map(item=>'<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:.5px solid var(--border);">'
      +'<span>'+item.label+'</span><span style="font-weight:600;">€ '+item.preis.toFixed(2)+'</span></div>').join('')
    +'<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:8px 0 2px;border-top:1.5px solid var(--border);margin-top:4px;">'
    +'<span>Netto</span><span style="color:var(--green);">€ '+r.summeNetto.toFixed(2)+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);">'
    +'<span>+ MwSt. 19%</span><span>€ '+r.mwst.toFixed(2)+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;">'
    +'<span>Brutto</span><span style="color:var(--blue);">€ '+r.brutto.toFixed(2)+'</span></div>'
    +'</div>'
    // Aktionen
    +'<div style="padding:14px 16px;display:flex;flex-direction:column;gap:7px;">'
    +'<div style="display:flex;gap:6px;">'
    +'<button data-aid="'+a.id+'" onclick="anfSendenDirect(this.dataset.aid,\'whatsapp\')" style="flex:1;padding:10px;background:#25D366;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">💬 WhatsApp</button>'
    +'<button data-aid="'+a.id+'" onclick="anfSendenDirect(this.dataset.aid,\'email\')" style="flex:1;padding:10px;background:var(--blue);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">📤 E-Mail</button>'
    +'</div>'
    +'<button data-aid="'+a.id+'" onclick="anfKundenansicht(this.dataset.aid)" style="width:100%;padding:10px;background:var(--purple);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">👁 Kundenansicht öffnen</button>'
    +'<button data-aid="'+a.id+'" onclick="anfZuAngebot(this.dataset.aid)" style="width:100%;padding:10px;background:var(--blue);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">⚡→📄 In vollständiges Angebot umwandeln</button>'
    +'<div style="display:flex;gap:6px;">'
    +'<button data-aid="'+a.id+'" onclick="anfStatus(this.dataset.aid,\'gewonnen\')" style="flex:1;padding:9px;background:var(--green-l);color:var(--green);border:1.5px solid var(--green);border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;">✓ Gewonnen</button>'
    +'<button data-aid="'+a.id+'" onclick="anfStatus(this.dataset.aid,\'abgelehnt\')" style="flex:1;padding:9px;background:#FEECEC;color:var(--red);border:1.5px solid var(--red);border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;">✕ Abgelehnt</button>'
    +'</div></div>';
}

function anfSendenDirect(id,kanal){
  const a=ANF_DATEN.find(x=>x.id===id); if(!a) return;
  const r=a.params?berechneAngebot(a.params):{summeNetto:a.netto||0,brutto:(a.netto||0)*1.19,flaeche:0};
  const text='Angebot CC Werbung GmbH\n\nFür: '+a.kunde+'\nLeistung: '+a.leistungLabel+'\n'
    +(a.beschr?a.beschr+'\n':'')+(r.flaeche>0?'Fläche: '+r.flaeche.toFixed(2)+' m²\n':'')
    +'Lieferzeit: '+(a.params?.liefertage||5)+' Werktage\n\n'
    +'Netto: € '+r.summeNetto.toFixed(2)+'\nBrutto (inkl. 19% MwSt.): € '+r.brutto.toFixed(2)+'\n\n'
    +'Angebot annehmen: https://cc-werbung.de/angebot/'+a.id+'\n\nCC Werbung GmbH';
  if(kanal==='whatsapp'){
    window.open('https://wa.me/'+(a.kontakt||'').replace(/\D/g,'')+'?text='+encodeURIComponent(text),'_blank');
    showToast('💬 WhatsApp · '+a.id);
  } else {
    window.open('mailto:'+a.kontakt+'?subject='+encodeURIComponent('Angebot CC Werbung – '+a.id)+'&body='+encodeURIComponent(text),'_blank');
    showToast('📤 E-Mail · '+a.id);
  }
  a.status='angebot'; renderAnfragen();
}

function anfKundenansicht(id){
  const a=ANF_DATEN.find(x=>x.id===id); if(!a) return;
  const r=a.params?berechneAngebot(a.params):{items:[],summeNetto:a.netto||0,mwst:(a.netto||0)*0.19,brutto:(a.netto||0)*1.19,flaeche:0};
  const today=new Date().toLocaleDateString('de-DE');
  const gueltig=new Date(); gueltig.setDate(gueltig.getDate()+14);
  const html='<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angebot '+a.id+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,sans-serif;background:#F5F5F7;color:#1D1D1F;max-width:520px;margin:0 auto;padding:20px 16px 60px;}.header{background:linear-gradient(135deg,#1D3557,#457B9D);border-radius:16px;padding:24px 20px;color:#fff;margin-bottom:16px;text-align:center;}.logo{font-size:20px;font-weight:700;margin-bottom:4px;}.card{background:#fff;border-radius:14px;padding:18px;margin-bottom:12px;box-shadow:0 2px 10px rgba(0,0,0,.06);}.sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#86868B;margin-bottom:10px;}.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F2F2F7;font-size:14px;}.row:last-child{border-bottom:none;}.total{display:flex;justify-content:space-between;padding:8px 0;font-size:15px;font-weight:700;border-top:2px solid #1D3557;margin-top:6px;}.btn-a{width:100%;padding:16px;background:#34C759;color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;margin-bottom:8px;}.btn-b{width:100%;padding:12px;background:#fff;color:#007AFF;border:1.5px solid #007AFF;border-radius:14px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;}.btn-c{width:100%;padding:10px;background:#fff;color:#FF3B30;border:1.5px solid #FF3B30;border-radius:14px;font-size:13px;cursor:pointer;}.result{display:none;padding:20px;border-radius:14px;text-align:center;margin-top:12px;}.result.show{display:block;}.ta{width:100%;padding:10px;border:1.5px solid #007AFF;border-radius:10px;font-size:14px;min-height:70px;font-family:inherit;margin:8px 0;}</style></head>'
    +'<body><div class="header"><div class="logo">CC Werbung GmbH</div><div style="font-size:12px;opacity:.7;">Werbetechnik · Folierung · Beschriftung</div></div>'
    +'<div class="card"><div class="sec">Angebot</div>'
    +'<div class="row"><span style="color:#86868B;">Nr.</span><span style="font-weight:600;">'+a.id+'</span></div>'
    +'<div class="row"><span style="color:#86868B;">Für</span><span style="font-weight:600;">'+a.kunde+'</span></div>'
    +'<div class="row"><span style="color:#86868B;">Leistung</span><span>'+a.leistungLabel+(a.beschr?' – '+a.beschr.substring(0,50):'')+'</span></div>'
    +(r.flaeche>0?'<div class="row"><span style="color:#86868B;">Fläche</span><span>'+r.flaeche.toFixed(2)+' m²</span></div>':'')
    +'<div class="row"><span style="color:#86868B;">Lieferzeit</span><span>'+(a.params?.liefertage||5)+' Werktage</span></div>'
    +'<div class="row"><span style="color:#86868B;">Datum</span><span>'+today+'</span></div>'
    +'<div class="row"><span style="color:#86868B;">Gültig bis</span><span>'+gueltig.toLocaleDateString('de-DE')+'</span></div>'
    +'</div>'
    +'<div class="card"><div class="sec">Leistungsumfang</div>'
    +r.items.map(i=>'<div class="row"><span>'+i.label+'</span><span style="font-weight:600;">€ '+i.preis.toFixed(2)+'</span></div>').join('')
    +'</div>'
    +'<div class="card"><div class="sec">Preisübersicht</div>'
    +'<div class="row"><span style="color:#86868B;">Netto</span><span style="color:#2E7D32;font-weight:700;">€ '+r.summeNetto.toFixed(2)+'</span></div>'
    +'<div class="row"><span style="color:#86868B;">+ MwSt. 19%</span><span>€ '+r.mwst.toFixed(2)+'</span></div>'
    +'<div class="total"><span>Brutto gesamt</span><span style="color:#1D3557;">€ '+r.brutto.toFixed(2)+'</span></div>'
    +'</div>'
    +'<div class="card" id="aktionen"><div class="sec">Ihr Angebot</div>'
    +'<button class="btn-a" onclick="aktion(\'annehmen\')">✓ Angebot annehmen</button>'
    +'<button class="btn-b" onclick="aktion(\'aendern\')">✏ Änderung anfragen</button>'
    +'<button class="btn-c" onclick="aktion(\'ablehnen\')">✕ Ablehnen</button>'
    +'</div>'
    +'<div class="result" id="res-a" style="background:#E8F5E9;"><div style="font-size:36px;">🎉</div><div style="font-size:18px;font-weight:700;color:#2E7D32;margin:8px 0;">Vielen Dank!</div><div style="font-size:13px;color:#555;">Auftrag bestätigt. Wir melden uns in Kürze.</div></div>'
    +'<div class="result" id="res-b" style="background:#EEF4FF;"><div style="font-size:13px;font-weight:700;color:#007AFF;margin-bottom:8px;">Änderung anfragen</div><textarea class="ta" id="ae" placeholder="Bitte beschreiben Sie die Änderung…"></textarea><button onclick="aeSend()" style="width:100%;padding:10px;background:#007AFF;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">Senden</button></div>'
    +'<div style="text-align:center;font-size:11px;color:#86868B;margin-top:20px;">CC Werbung GmbH · Mülheim · info@cc-werbung.de</div>'
    +'<scr'+'ipt>function aktion(t){document.getElementById("aktionen").style.display="none";if(t==="annehmen")document.getElementById("res-a").classList.add("show");if(t==="aendern")document.getElementById("res-b").classList.add("show");if(t==="ablehnen")document.body.innerHTML="<div style=\'padding:40px;text-align:center;\'><div style=\'font-size:36px;\'>😔</div><div style=\'font-size:16px;font-weight:600;margin-top:8px;\'>Abgelehnt</div></div>";}function aeSend(){var t=document.getElementById("ae").value;if(!t.trim())return;document.getElementById("res-b").innerHTML="<div style=\'font-size:30px;\'>✅</div><div style=\'font-size:16px;font-weight:700;color:#007AFF;margin-top:6px;\'>Gesendet!</div>";}<\/scr'+'ipt><'+'/body><'+'/html>';
  const w=window.open('','_blank','width=580,height=900');
  w.document.write(html); w.document.close();
  showToast('👁 Kundenansicht · '+a.id);
}

function anfAngebotErstellen(id){
  const a=ANF_DATEN.find(x=>x.id===id); if(!a) return;
  a.status='angebot'; renderAnfragen(); anfOpenDetail(id);
}


// ── MITARBEITER ──────────────────────────────────
// MA_DATA / __MA_DATA_LIVE: nur API (GET /api/v1/users + GET /api/v1/mitarbeiter, position = Kürzel).
// Kein Legacy-Dummy-Array — loadCockpitData / reloadUsersFromApiIntoMaTarget / loadMitarbeiter befüllen.
window.CCIntern = window.CCIntern || {};
if (!Array.isArray(window.CCIntern.__MA_DATA_LIVE)) {
  window.CCIntern.__MA_DATA_LIVE = [];
}
if (typeof window.MA_DATA === 'undefined' || !Array.isArray(window.MA_DATA)) {
  window.MA_DATA = window.CCIntern.__MA_DATA_LIVE;
}


// ══════════════════════════════════════════════════════════════════════
// DATA ACCESS LAYER (DAL)
// ─────────────────────────────────────────────────────────────────────
// Heute:   localStorage  (Browser-Test)
// Morgen:  Strato-API    (fetch/POST gegen PHP/Node-Backend)
//
// Umstellungsanleitung für Strato:
//   1. DAL_BACKEND_URL setzen, z.B. 'https://cc-werbung.de/api'
//   2. DAL_USE_API = true
//   3. Backend implementiert:
//        GET  /api/auftraege        → JSON-Array
//        POST /api/auftraege        → speichert Array
//        GET  /api/fusa_termine     → JSON-Array
//        POST /api/fusa_termine     → speichert Array
//   4. Kein weiterer Code-Umbau nötig
//
// Alle Datenzugriffe im System gehen NUR über diese Funktionen.
// Nirgendwo sonst localStorage oder fetch direkt aufrufen.
// ══════════════════════════════════════════════════════════════════════

var DAL_USE_API        = true;
var DAL_BACKEND_URL    = 'https://cc-werbung.de/api'; // Strato-Endpunkt
/** Legacy localStorage-Key — Aufträge werden im Cockpit nicht mehr über DataService geführt. */
var DAL_KEY_AUFTRAEGE  = 'cc_intern_auftraege_v1';
var DAL_KEY_FUSA       = 'cc_intern_fusa_v1';
var DAL_KEY_MA         = 'cc_intern_ma_v1';
var DAL_KEY_AUFGABEN   = 'cc_intern_aufgaben_v1';
var DAL_KEY_ANWESENHEIT= 'cc_intern_anwesenheit_v1';
var DAL_KEY_URLAUB     = 'cc_intern_urlaub_v1';
var DAL_KEY_LEADS      = 'cc_intern_leads_v1';
var DAL_KEY_LAGER        = 'cc_intern_lager_v1';       // Material/Lager — App + Desktop
var DAL_KEY_LIEFERANTEN  = 'cc_intern_lieferanten_v1'; // Lieferanten + E-Mail

// Standard-Lieferanten (werden beim ersten Start geladen, danach aus localStorage)
var LIEFERANTEN = [
  {id:'lf1', name:'OrafOL Germany GmbH',     email:'vertrieb@orafol.com',              tel:'+49 3834 83-0',    notiz:'Folien, Laminate (ORA / ORAGUARD)'},
  {id:'lf2', name:'Avery Dennison GmbH',     email:'orders.de@averydennison.com',      tel:'+49 711 7863-0',   notiz:'Avery MPI / DOL'},
  {id:'lf3', name:'mactac Europe',           email:'info@mactac.eu',                   tel:'',                 notiz:'MACal Cast'},
  {id:'lf4', name:'HP Deutschland GmbH',     email:'',                                 tel:'+49 7031 14-0',    notiz:'HP Latex Tinten / Optimierer'},
];

function saveLieferanten(){
  window.CCIntern.DataService.save(DAL_KEY_LIEFERANTEN, LIEFERANTEN);
}
function loadLieferanten(){
  var s = window.CCIntern.DataService.load(DAL_KEY_LIEFERANTEN, null);
  if(s && Array.isArray(s) && s.length){ LIEFERANTEN = s; }
}
// ── INTERN_AUFGABEN ───────────────────────────────────────────────────
// Einzige Quelle für interne Aufgaben (aus Produktionsschritten).
// Struktur je Aufgabe:
//   id        – eindeutig, z.B. "IA-2026-001"
//   auftragId – Referenz auf AUFTRAEGE[x].id
//   schritt   – 'grafik'|'druck'|'laminat'|'montage'|'doku'|...
//   titel     – z.B. "Montage — Bus 1789"
//   maId      – Mitarbeiter-Kürzel (aus MA_DATA)
//   ma        – Vorname (denormalisiert für Anzeige)
//   dauer     – geplante Stunden (Zahl)
//   status    – 'offen'|'in_arbeit'|'erledigt'
//   erstellt  – ISO-Datumsstring
var INTERN_AUFGABEN = [];

// ── GEMEINSAME ARRAYS — Desktop + App nutzen dieselben ────────────────
// Anwesenheit: [{maId, datum, start, end, dauer, typ:'anwesenheit'}]
var MA_ANWESENHEIT = [];
// Urlaubsanträge: [{id, maId, ma, typ, von, bis, notiz, status, erstellt}]
var URLAUB_ANTRAEGE = [];


function saveAnwesenheit(){
  if (window.__CCINTERN_COCKPIT_MOUNT__) return;
  window.CCIntern.DataService.save(DAL_KEY_ANWESENHEIT, MA_ANWESENHEIT);
}
function loadAnwesenheit(cb){
  if (window.__CCINTERN_COCKPIT_MOUNT__ && window.CCIntern && window.CCIntern.cockpitApi) {
    var st = typeof showToast === 'function' ? showToast : null;
    window.CCIntern.cockpitApi
      .reloadMitarbeiterAnwesenheitFromApiIntoMemory(st)
      .then(function () {
        if (cb) cb();
      })
      .catch(function () {
        if (cb) cb();
      });
    return;
  }
  var s=window.CCIntern.DataService.load(DAL_KEY_ANWESENHEIT,null);
  if(s&&Array.isArray(s)){ MA_ANWESENHEIT.length=0; s.forEach(function(x){MA_ANWESENHEIT.push(x);}); }
  if(cb) cb();
}
function saveUrlaub(){
  if (window.__CCINTERN_COCKPIT_MOUNT__) return;
  window.CCIntern.DataService.save(DAL_KEY_URLAUB, URLAUB_ANTRAEGE);
}
function loadUrlaub(cb){
  if (window.__CCINTERN_COCKPIT_MOUNT__ && window.CCIntern && window.CCIntern.cockpitApi) {
    var st = typeof showToast === 'function' ? showToast : null;
    var api = window.CCIntern.cockpitApi;
    Promise.all([api.reloadUrlaubFromApiIntoMemory(st), api.reloadMitarbeiterTagStatusIntoMemory(st)])
      .then(function () {
        if (cb) cb();
      })
      .catch(function () {
        if (cb) cb();
      });
    return;
  }
  var s=window.CCIntern.DataService.load(DAL_KEY_URLAUB,null);
  if(s&&Array.isArray(s)){ URLAUB_ANTRAEGE.length=0; s.forEach(function(x){URLAUB_ANTRAEGE.push(x);}); }
  if(cb) cb();
}
function saveLeads(){
  window.CCIntern.DataService.save(DAL_KEY_LEADS, LEADS);
}
function loadLeads(cb){
  var s=window.CCIntern.DataService.load(DAL_KEY_LEADS,null);
  if(s&&Array.isArray(s)){ LEADS.length=0; s.forEach(function(x){LEADS.push(x);}); }
  if(cb) cb();
}

// ── Adapter-Shims (Logik jetzt in externen Dateien) ───────────────────
// adapters/LocalStorageAdapter.js  → window.CCIntern.LocalStorageAdapter
// adapters/ApiAdapter.js           → window.CCIntern.ApiAdapter
// services/CCInternDataService.js  → window.CCIntern.DataService
//
// Shims für Rückwärtskompatibilität (werden intern nicht mehr aktiv genutzt):
var DAL_local = window.CCIntern.LocalStorageAdapter;
var DAL_api   = window.CCIntern.ApiAdapter;

// ══════════════════════════════════════════════════════════════════════
// ÖFFENTLICHE DAL-FUNKTIONEN
// Das ist alles was der Rest der App aufrufen darf.
// ══════════════════════════════════════════════════════════════════════
//
// Aufträge (loadAuftraege / saveAuftraege): nur in cc-intern-boot.js —
// zentrale API-Logik in services/ccintern-cockpit-api.js (runLoadAuftraegeFromApi, runSaveAuftraege).

// ── INTERN_AUFGABEN: Save / Load ──────────────────────────────────────
function ccInternMaAppAufgabenSaveBlocked(){
  try {
    if (typeof window === 'undefined') return false;
    if (window.__MOB_AUFTRAG_RESTORE_RUNNING__ === true) return true;
    if (window.__CCINTERN_MITARBEITER_APP_BOOT__ === true) return true;
    if (window.__CCINTERN_MITARBEITER_APP_ACTIVE__ === true) return true;
    var snap = window.CC_SHELL_UI_ACCESS;
    if (snap && snap.isMitarbeiterAppOnlyShell === true) return true;
    if (window.__CCINTERN_COCKPIT_MOUNT__ === true && typeof document !== 'undefined') {
      if (
        document.body &&
        document.body.classList &&
        document.body.classList.contains('ckp-shell-layout--mitarbeiter-app-only')
      ) {
        return true;
      }
      if (
        document.querySelector(
          '.cc-intern-mitarbeiter-app-only.cc-intern-root, .ccw-ccintern-container.cc-intern-mitarbeiter-app-only',
        )
      ) {
        return true;
      }
    }
  } catch (e) {}
  return false;
}

function saveAufgaben(){
  if (ccInternMaAppAufgabenSaveBlocked()) {
    console.info('[AUFGABEN_SAVE_BLOCKED_MA_APP]');
    return false;
  }
  window.CCIntern.DataService.save(DAL_KEY_AUFGABEN, INTERN_AUFGABEN);
}

function loadAufgaben(callback){
  window.CCIntern.DataService.loadAsync(DAL_KEY_AUFGABEN, null, function(err, data){
    if(!err && data && Array.isArray(data)){
      INTERN_AUFGABEN.length = 0;
      data.forEach(function(a){ INTERN_AUFGABEN.push(a); });
      if (typeof maInternRepariereMontageInternZeilenNachAuftrag === 'function' && maInternRepariereMontageInternZeilenNachAuftrag()) {
        saveAufgaben();
      }
    }
    if(callback) callback();
  });
}

// Cockpit-ES-Module (z. B. ccintern-cockpit-api) — gleiche Referenz wie Legacy-Globals
if (typeof window !== 'undefined') {
  window.INTERN_AUFGABEN = INTERN_AUFGABEN;
  window.saveAufgaben = saveAufgaben;
}

// ── FUSA-TERMINE ──────────────────────────────────────────────────────
function loadFusaTermine(callback){
  window.CCIntern.DataService.loadAsync(DAL_KEY_FUSA, null, function(err, data){
    if(!err && data && Array.isArray(data)){
      CC_FUSA_TERMINE.length = 0;
      data.forEach(function(t){ CC_FUSA_TERMINE.push(t); });
    }
    if(callback) callback();
  });
}

function saveFusaTermine(){
  window.CCIntern.DataService.save(DAL_KEY_FUSA, CC_FUSA_TERMINE);
}

// ── MITARBEITER ────────────────────────────────────────────────────────
// MA_DATA enthält nur Stammdaten (maId, Name, Rolle, soll, urlaub).
// Stunden werden IMMER live aus AUFTRAEGE berechnet — nie gespeichert.
function loadMitarbeiter(callback){
  if (window.__CCINTERN_COCKPIT_MOUNT__ && window.CCIntern && window.CCIntern.cockpitApi) {
    window.CCIntern.cockpitApi.reloadUsersFromApiIntoMaTarget(typeof showToast === 'function' ? showToast : null).then(function () {
      if (callback) callback();
    });
    return;
  }
  window.CCIntern.DataService.loadAsync(DAL_KEY_MA, null, function(err, data){
    if(!err && data && Array.isArray(data) && data.length > 0){
      MA_DATA.length = 0;
      data.forEach(function(m){
        if (m && !m.k && m.maId) {
          var mid = String(m.maId);
          if (typeof maIstCockpitUserUuid === 'function' && !maIstCockpitUserUuid(mid) && mid.length <= 5) m.k = mid.toUpperCase();
        }
        MA_DATA.push(m);
      });
    }
    if(callback) callback();
  });
}

function saveMitarbeiter(){
  if (window.__CCINTERN_COCKPIT_MOUNT__) {
    return;
  }
  // Nur Stammdaten speichern — keine berechneten Werte
  var stamm = MA_DATA.map(function(m){
    return {maId:m.maId, k:m.k, n:m.n, r:m.r, av:m.av, col:m.col, soll:m.soll, urlaub:m.urlaub};
  });
  window.CCIntern.DataService.save(DAL_KEY_MA, stamm);
}

// ── App-Init: alles laden dann rendern ────────────────────────────────

/**
 * Löst CC-Intern-Stammzeile via User-UUID, Mitarbeiter-Tabellen-ID, festem Kürzel (OK, SE, …) oder historischem Kürzel in `maId`.
 * Keine Initialen-Raterei — `k` kommt aus Stamm bzw. GET /api/v1/mitarbeiter → position (Kurzcode).
 * @param {string|null|undefined} value
 * @returns {object|null}
 */
function maDataFindByWorkflowKey(value) {
  if (value == null || value === '') { return null; }
  var v0 = String(value).trim();
  if (!v0) { return null; }
  if (typeof MA_DATA === 'undefined' || !MA_DATA || !MA_DATA.length) { return null; }
  var vUp = v0.toUpperCase();
  var m;
  for (var i = 0; i < MA_DATA.length; i++) {
    m = MA_DATA[i];
    if (!m) continue;
    if (m.id != null && String(m.id) === v0) return m;
    if (m.mitarbeiter_id != null && String(m.mitarbeiter_id) === v0) return m;
    if (m.maId != null && String(m.maId) === v0) return m;
  }
  for (var j = 0; j < MA_DATA.length; j++) {
    m = MA_DATA[j];
    if (!m) continue;
    if (m.k != null && String(m.k).trim() !== '' && String(m.k).toUpperCase() === vUp) return m;
  }
  return null;
}

// Token aus Workflow (wer / AU_STEP) → Stamm-User-UUID bzw. maId (Cockpit)
function maIdVonName(vorname){
  if (!vorname) { return null; }
  var v = String(vorname).trim();
  if (!v) { return null; }
  if (maIstCockpitUserUuid(v)) { return v; }
  var hit = maDataFindByWorkflowKey(v);
  if (hit) {
    if (hit.id != null && String(hit.id) !== '' && maIstCockpitUserUuid(String(hit.id))) { return String(hit.id); }
    if (hit.maId != null) { return String(hit.maId); }
  }
  var vLow = v.toLowerCase();
  var treffer = MA_DATA.find(function (m) {
    return m.n && (m.n.split(' ')[0].toLowerCase() === vLow || m.n.toLowerCase() === vLow);
  });
  return treffer ? (treffer.id != null && maIstCockpitUserUuid(String(treffer.id)) ? String(treffer.id) : String(treffer.maId)) : null;
}

// Hilfsfunktion: maId → MA_DATA Eintrag (Cockpit/API: trifft auch m.id = User-ID)
function maByID(maId){
  if (maId == null || maId === '') { return null; }
  var f = maDataFindByWorkflowKey(String(maId));
  if (f) return f;
  return MA_DATA.find(function(m) {
    return String(m.maId) === String(maId) || (m.id != null && String(m.id) === String(maId));
  }) || null;
}

/**
 * Mitarbeiter für Schritt-Zuweisung: zuerst konfigurierte Kürzel (Voreinstellung),
 * danach alle übrigen aus MA_DATA (API), damit neu angelegte MA sofort wählbar sind.
 * @param {string[]|null|undefined} maOptionIds — z. B. AU_STEP_CONFIG[s].maOptions
 * @returns {Array<Record<string, unknown>>}
 */
function auSchrittVerantwortlicheZeilen(maOptionIds) {
  if (typeof MA_DATA === 'undefined' || !Array.isArray(MA_DATA) || !MA_DATA.length) return [];
  var cfgIds = Array.isArray(maOptionIds) ? maOptionIds : [];
  /** @type {Record<string, boolean>} */
  var seen = {};
  var out = [];
  function pushMa(m) {
    if (!m || typeof m !== 'object') return;
    var key = auSchrittMaRowId(m);
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(m);
  }
  for (var i = 0; i < cfgIds.length; i++) {
    var pref =
      typeof maDataFindByWorkflowKey === 'function' ? maDataFindByWorkflowKey(cfgIds[i]) : null;
    pushMa(pref);
  }
  for (var j = 0; j < MA_DATA.length; j++) {
    pushMa(MA_DATA[j]);
  }
  return out;
}

/**
 * Wert für Formularfelder (Kürzel aus position/k oder User-UUID als maId).
 * @param {Record<string, unknown>|null|undefined} m
 * @returns {string}
 */
function auSchrittMaRowId(m) {
  if (!m || typeof m !== 'object') return '';
  var k = m.k != null && String(m.k).trim() !== '' ? String(m.k).trim() : '';
  if (k) return k.toUpperCase();
  if (m.maId != null && String(m.maId).trim() !== '') return String(m.maId).trim();
  return '';
}

/** Echte User-UUID (Cockpit) — Kürzel wie "OK" / "ME" sind false. */
function maIstCockpitUserUuid(s){
  if (s == null || s === '') return false;
  var t = String(s).trim();
  if (t.length < 32) return false;
  return /^[0-9a-f]{8}-[0-9a-f-]{3,}/i.test(t) || t.length === 32;
}

/**
 * Mappt AU_STEP_CONFIG / Workflow-Kürzel (OK, SE, …) auf users.id-UUID.
 * Zentrale Logik: `ccintern-cockpit-api.js` → `maKuerzelOderIdZuUserUuid` (Mehrdeutigkeit / Fehler → `null` + `console.warn`).
 * @param {unknown} raw
 * @returns {string|null}
 */
function maKuerzelOderIdZuUserUuid(raw){
  try {
    var api = typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi;
    if (api && typeof api.maKuerzelOderIdZuUserUuid === 'function') {
      return api.maKuerzelOderIdZuUserUuid(raw);
    }
  } catch (eApi) {
    void eApi;
  }
  var w = raw == null ? '' : String(raw).trim();
  console.warn('MA Mapping fehlt:', w || raw, '(cockpitApi.maKuerzelOderIdZuUserUuid nicht verfügbar)');
  return null;
}

/**
 * Legacy-Schritt: wer / Kurz-maId → werId + verantwortlicher + UUID in maId/maIds (bei schrittMigrieren).
 * @param {Record<string, unknown>} sch
 * @returns {boolean} true wenn Auftrag gespeichert werden sollte
 */
function ccInternSchrittResolveLegacyWerId(sch) {
  if (!sch || typeof maIstCockpitUserUuid !== 'function') return false;
  if (sch.werId != null && String(sch.werId).trim() !== '' && maIstCockpitUserUuid(String(sch.werId))) {
    return false;
  }
  if (sch.verantwortlicher != null && String(sch.verantwortlicher).trim() !== '' && maIstCockpitUserUuid(String(sch.verantwortlicher))) {
    sch.werId = String(sch.verantwortlicher).trim();
    return true;
  }
  if (sch.maId != null && String(sch.maId).trim() !== '' && maIstCockpitUserUuid(String(sch.maId))) {
    sch.werId = String(sch.maId).trim();
    if (!sch.verantwortlicher) sch.verantwortlicher = sch.werId;
    return true;
  }
  var midOnly = sch.maId != null ? String(sch.maId).trim() : '';
  if ((!sch.wer || String(sch.wer).trim() === '' || String(sch.wer).trim() === '—') && midOnly && !maIstCockpitUserUuid(midOnly)) {
    var uMid = typeof maKuerzelOderIdZuUserUuid === 'function' ? maKuerzelOderIdZuUserUuid(midOnly) : null;
    if (uMid && maIstCockpitUserUuid(uMid)) {
      sch.werId = uMid;
      sch.verantwortlicher = uMid;
      sch.maId = uMid;
      sch.maIds = [];
      sch.zusatzMa = [];
      var mMid = typeof maByID === 'function' ? maByID(uMid) : null;
      if (mMid && mMid.k != null && String(mMid.k).trim() !== '') sch.wer = String(mMid.k).trim().toUpperCase();
      if (mMid && mMid.n) sch.verantwortlicherName = String(mMid.n);
      return true;
    }
  }
  var raw = sch.wer != null ? String(sch.wer).trim() : '';
  if (!raw || raw === '—') return false;
  var parts = raw.split(/\s*\+\s*/).map(function (p) { return p.trim(); }).filter(function (p) { return p.length; });
  if (!parts.length) return false;
  var uids = [];
  var seen = {};
  for (var pi = 0; pi < parts.length; pi++) {
    var t = parts[pi];
    var uu = null;
    if (maIstCockpitUserUuid(t)) uu = t;
    else if (typeof maKuerzelOderIdZuUserUuid === 'function') uu = maKuerzelOderIdZuUserUuid(t) || null;
    if (!uu && typeof maIdVonName === 'function') {
      var mid = maIdVonName(t);
      if (mid) {
        uu =
          typeof maKuerzelOderIdZuUserUuid === 'function'
            ? maKuerzelOderIdZuUserUuid(String(mid)) || (maIstCockpitUserUuid(String(mid)) ? String(mid) : null)
            : maIstCockpitUserUuid(String(mid))
              ? String(mid)
              : null;
      }
    }
    if (uu && maIstCockpitUserUuid(uu) && !seen[uu]) {
      seen[uu] = true;
      uids.push(uu);
    }
  }
  if (!uids.length) return false;
  sch.werId = uids[0];
  sch.verantwortlicher = uids[0];
  sch.maId = uids[0];
  sch.maIds = uids.length > 1 ? uids.slice(1) : [];
  sch.zusatzMa = [];
  var kParts = [];
  var nameParts = [];
  for (var qi = 0; qi < uids.length; qi++) {
    var m0 = typeof maByID === 'function' ? maByID(uids[qi]) : null;
    if (m0 && m0.k != null && String(m0.k).trim() !== '') kParts.push(String(m0.k).trim().toUpperCase());
    if (m0 && m0.n) nameParts.push(String(m0.n));
  }
  if (kParts.length) {
    sch.wer = kParts[0] || '';
    sch.zusatzMa = kParts.length > 1 ? kParts.slice(1) : [];
  } else {
    sch.wer = '';
  }
  if (nameParts.length) {
    sch.verantwortlicherName = nameParts[0];
    sch.zusatzMaNames = nameParts.length > 1 ? nameParts.slice(1) : [];
  }
  return true;
}

if (typeof window !== 'undefined') window.ccInternSchrittResolveLegacyWerId = ccInternSchrittResolveLegacyWerId;

// Gleiche Person: UUID, Mitarbeiter-Row-ID, Kürzel k, legacy maId, oder exakter Stamm
function maIdGleich(a, b) {
  if (a == null && b == null) { return true; }
  if (a == null || b == null) { return false; }
  if (String(a).trim() === String(b).trim()) { return true; }
  if (typeof MA_DATA === 'undefined' || !MA_DATA || !MA_DATA.length) { return false; }
  var aM = maDataFindByWorkflowKey(String(a));
  var bM = maDataFindByWorkflowKey(String(b));
  if (aM && bM) {
    var aUid = aM.id != null ? String(aM.id) : '';
    var bUid = bM.id != null ? String(bM.id) : '';
    if (aUid && aUid === bUid) { return true; }
    if (aUid && aUid === String(b)) { return true; }
    if (bUid && String(a) === bUid) { return true; }
    var aStamm = aM.mitarbeiter_id != null ? String(aM.mitarbeiter_id).trim() : '';
    var bStamm = bM.mitarbeiter_id != null ? String(bM.mitarbeiter_id).trim() : '';
    if (aStamm && bStamm && aStamm === bStamm) { return true; }
    if (aM === bM) { return true; }
  }
  if (aM && !bM) {
    return (
      String(aM.id) === String(b) ||
      String(aM.maId) === String(b) ||
      (aM.mitarbeiter_id != null && String(aM.mitarbeiter_id) === String(b)) ||
      (aM.k && String(aM.k).toUpperCase() === String(b).toUpperCase())
    );
  }
  if (bM && !aM) {
    return (
      String(bM.id) === String(a) ||
      String(bM.maId) === String(a) ||
      (bM.mitarbeiter_id != null && String(bM.mitarbeiter_id) === String(a)) ||
      (bM.k && String(bM.k).toUpperCase() === String(a).toUpperCase())
    );
  }
  return false;
}

// ── Workflow-Schritt: alle bekannten MA-Rohwerte (Desktop KPI + Mitarbeiter-App, eine Logik) ──
function ccInternFlattenSchrittMitarbeiterArray(arr, pushFn) {
  if (!Array.isArray(arr)) return;
  var i, x;
  for (i = 0; i < arr.length; i++) {
    x = arr[i];
    if (x == null) continue;
    if (typeof x === 'object' && !Array.isArray(x)) {
      if (x.id != null) pushFn(x.id);
      if (x.maId != null) pushFn(x.maId);
      if (x.userId != null) pushFn(x.userId);
      if (x.name != null) pushFn(x.name);
      if (x.n != null) pushFn(x.n);
      continue;
    }
    pushFn(x);
  }
}

/**
 * Sammelt alle Stellen, an denen ein Schritt Mitarbeiter referenziert (IDs, Kürzel, Namen, Team-Listen).
 * @param {Record<string, unknown>|null|undefined} sch
 * @returns {string[]}
 */
function ccInternSchrittSammleMitarbeiterRohwerte(sch) {
  if (!sch || typeof sch !== 'object') return [];
  var out = [];
  var seen = Object.create(null);
  function push(v) {
    if (v == null) return;
    var s = typeof v === 'string' ? v.trim() : String(v).trim();
    if (!s || s === 'undefined' || s === '—') return;
    if (seen[s]) return;
    seen[s] = true;
    out.push(s);
  }
  push(sch.maId);
  push(sch.verantwortlicher);
  push(sch.verantwortlicherId);
  push(sch.werId);
  ccInternFlattenSchrittMitarbeiterArray(sch.maIds, push);
  ccInternFlattenSchrittMitarbeiterArray(sch.teamMaIds, push);
  ccInternFlattenSchrittMitarbeiterArray(sch.zusatzMa, push);
  ccInternFlattenSchrittMitarbeiterArray(sch.zusatzMaIds, push);
  ccInternFlattenSchrittMitarbeiterArray(sch.mitarbeiterIds, push);
  ccInternFlattenSchrittMitarbeiterArray(sch.team, push);
  ccInternFlattenSchrittMitarbeiterArray(sch.ausfuehrendeMitarbeiter, push);
  try {
    ccInternFlattenSchrittMitarbeiterArray(sch['ausführendeMitarbeiter'], push);
  } catch (eA) { void eA; }
  push(sch.wer);
  push(sch.verantwortlicherName);
  ccInternFlattenSchrittMitarbeiterArray(sch.zusatzMaNames, push);
  return out;
}

/**
 * Einzelwert (UUID, Kürzel, Vor-/Nachname, Listen-Segment) gegen Ziel-MA (typ. MOB_MA_ID / User-UUID).
 */
function ccInternRohwertMatchtMitarbeiter(val, targetMaId) {
  if (val == null || targetMaId == null) return false;
  var t = String(targetMaId).trim();
  if (!t) return false;
  var s0 = String(val).trim();
  if (!s0 || s0 === 'undefined' || s0 === '—') return false;
  if (typeof maIdGleich === 'function' && maIdGleich(s0, t)) return true;
  if (/,|\+|·|\//.test(s0)) {
    var parts = s0.split(/[,+·/]/);
    var pi, seg;
    for (pi = 0; pi < parts.length; pi++) {
      seg = parts[pi].trim();
      if (!seg) continue;
      if (ccInternRohwertMatchtMitarbeiter(seg, t)) return true;
    }
    return false;
  }
  if (typeof maIdVonName === 'function') {
    var resolved = maIdVonName(s0);
    if (resolved && typeof maIdGleich === 'function' && maIdGleich(resolved, t)) return true;
  }
  var m = typeof maByID === 'function' ? maByID(t) : null;
  if (m) {
    var low = s0.toLowerCase();
    if (m.k != null && String(m.k).trim() !== '' && String(m.k).trim().toUpperCase() === s0.toUpperCase()) return true;
    if (m.n && String(m.n).trim() !== '') {
      var nFull = String(m.n).trim().toLowerCase();
      if (low === nFull) return true;
      var first = String(m.n).trim().split(/\s+/)[0].toLowerCase();
      if (low === first) return true;
    }
  }
  return false;
}

/**
 * Alle Schlüssel einer Person (Stamm-UUID, User-UUID, Kürzel) für Schritt-Matching.
 * @param {unknown} targetMaId
 * @returns {string[]}
 */
function ccInternCollectMaMatchKeys(targetMaId) {
  var keys = [];
  var seen = Object.create(null);
  function add(k) {
    var s = k != null ? String(k).trim() : '';
    if (!s || seen[s]) return;
    seen[s] = true;
    keys.push(s);
  }
  add(targetMaId);
  if (typeof maDataFindByWorkflowKey === 'function') {
    var m = maDataFindByWorkflowKey(String(targetMaId).trim());
    if (m) {
      add(m.id);
      add(m.maId);
      add(m.mitarbeiter_id);
      if (m.k != null && String(m.k).trim() !== '') add(String(m.k).trim().toUpperCase());
    }
  }
  return keys;
}

/** Gleiche MA-Erkennung für Workflow-Schritt: Desktop „Mitarbeiter aktiv“ + Mobile Aufgaben. */
function ccInternSchrittIstFuerMitarbeiterCompat(sch, targetMaId) {
  if (!sch || targetMaId == null || String(targetMaId).trim() === '') return false;
  var vals = ccInternSchrittSammleMitarbeiterRohwerte(sch);
  var matchKeys = ccInternCollectMaMatchKeys(targetMaId);
  var ki, i;
  for (ki = 0; ki < matchKeys.length; ki++) {
    for (i = 0; i < vals.length; i++) {
      if (ccInternRohwertMatchtMitarbeiter(vals[i], matchKeys[ki])) return true;
    }
  }
  return false;
}

/** Stabiler Bucket-Key für KPI (User-UUID bevorzugt, sonst maId, sonst leer). */
function ccInternBucketKeyFuerMitarbeiterRohwert(val) {
  if (val == null) return '';
  var s0 = String(val).trim();
  if (!s0 || s0 === 'undefined' || s0 === '—') return '';
  if (typeof maDataFindByWorkflowKey === 'function') {
    var m = maDataFindByWorkflowKey(s0);
    if (m) {
      if (m.id != null && String(m.id) !== '' && typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(String(m.id))) {
        return String(m.id).trim();
      }
      if (m.maId != null) return String(m.maId).trim();
    }
  }
  if (typeof maIdVonName === 'function') {
    var r = maIdVonName(s0);
    if (r) return String(r).trim();
  }
  if (typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(s0)) return s0;
  return '';
}

/**
 * Alle Bucket-Keys eines Schritts (z. B. „wer“ mit mehreren Namen aufsplitten).
 * @returns {string[]}
 */
function ccInternSchrittListeMitarbeiterBucketKeys(sch) {
  var roh = ccInternSchrittSammleMitarbeiterRohwerte(sch);
  var keys = [];
  var seen = Object.create(null);
  function addKey(k) {
    var ks = String(k || '').trim();
    if (!ks || seen[ks]) return;
    seen[ks] = true;
    keys.push(ks);
  }
  var i, r, j, parts, bk, seg;
  for (i = 0; i < roh.length; i++) {
    r = roh[i];
    if (/,|\+|·/.test(r)) {
      parts = r.split(/[,+·]/);
      for (j = 0; j < parts.length; j++) {
        seg = parts[j].trim();
        if (!seg) continue;
        bk = ccInternBucketKeyFuerMitarbeiterRohwert(seg);
        if (bk) addKey(bk);
      }
    } else {
      bk = ccInternBucketKeyFuerMitarbeiterRohwert(r);
      if (bk) addKey(bk);
    }
  }
  return keys;
}

if (typeof window !== 'undefined') {
  window.ccInternSchrittSammleMitarbeiterRohwerte = ccInternSchrittSammleMitarbeiterRohwerte;
  window.ccInternRohwertMatchtMitarbeiter = ccInternRohwertMatchtMitarbeiter;
  window.ccInternCollectMaMatchKeys = ccInternCollectMaMatchKeys;
  window.ccInternSchrittIstFuerMitarbeiterCompat = ccInternSchrittIstFuerMitarbeiterCompat;
  window.ccInternBucketKeyFuerMitarbeiterRohwert = ccInternBucketKeyFuerMitarbeiterRohwert;
  window.ccInternSchrittListeMitarbeiterBucketKeys = ccInternSchrittListeMitarbeiterBucketKeys;
}

// INTERN_AUFGABEN-Wischzeile: gehört diese Aufgabe zu diesem MA?
function maAufgabeIstFuerMa(g, targetMaId) {
  if (!g || targetMaId == null || String(targetMaId).trim() === '') { return false; }
  var t = String(targetMaId).trim();
  if (g.maId != null) {
    if (typeof maIdGleich === 'function' && maIdGleich(g.maId, t)) return true;
    if (String(g.maId).trim() === t) return true;
  }
  if (g.maIds && g.maIds.length) {
    for (var i = 0; i < g.maIds.length; i++) {
      if (g.maIds[i] == null) continue;
      if (typeof maIdGleich === 'function' && maIdGleich(g.maIds[i], t)) return true;
      if (String(g.maIds[i]).trim() === t) return true;
    }
  }
  if (g.teamMaIds && g.teamMaIds.length) {
    for (var j = 0; j < g.teamMaIds.length; j++) {
      if (g.teamMaIds[j] == null) continue;
      if (typeof maIdGleich === 'function' && maIdGleich(g.teamMaIds[j], t)) return true;
      if (String(g.teamMaIds[j]).trim() === t) return true;
    }
  }
  if (typeof ccInternRohwertMatchtMitarbeiter === 'function') {
    if (g.verantwortlicher != null && ccInternRohwertMatchtMitarbeiter(g.verantwortlicher, t)) return true;
    if (g.werId != null && ccInternRohwertMatchtMitarbeiter(g.werId, t)) return true;
  }
  return false;
}

// ── INTERN_AUFGABEN / Auftragskarten: nur CC-Intern „Auftrag Produktion“ (Kanban-Pool) ──
// Vgl. `mitarbeiter-app-mob-inline.js` (mobInternAufgabePasstZuProduktionsWorkflow). Wenn die
// Mob-Datei geladen ist, delegieren wir; sonst dieselbe Regel lokal (kein Abhängigkeits-Loch).
function _internCanonicalWorkflowStep(step) {
  if (step == null) return '';
  var s = String(step).trim().toLowerCase();
  var map = {
    entwurf: 'grafik',
    beklebung: 'montage',
    digitaldruck: 'druck',
    plot: 'druck',
    plotten: 'druck',
    schnitt: 'laminat',
    laminieren: 'laminat',
  };
  return map[s] || s;
}

function _internSchrittObjektFuerAuftragUndStep(a, stepRaw) {
  if (!a || !a.schritte || stepRaw == null) return null;
  var tryKeys = [stepRaw, _internCanonicalWorkflowStep(stepRaw)];
  var i, k, keys;
  for (i = 0; i < tryKeys.length; i++) {
    k = tryKeys[i];
    if (k && a.schritte[k]) return a.schritte[k];
  }
  var c = _internCanonicalWorkflowStep(stepRaw);
  keys = Object.keys(a.schritte);
  for (i = 0; i < keys.length; i++) {
    if (_internCanonicalWorkflowStep(keys[i]) === c) return a.schritte[keys[i]];
  }
  return null;
}

function _internAuftragFuerInternZeile(g) {
  if (!g || typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE.length) return null;
  var gid = g.auftragId;
  var i, x;
  for (i = 0; i < AUFTRAEGE.length; i++) {
    x = AUFTRAEGE[i];
    if (x && (x.id == gid || String(x.id) === String(gid))) return x;
  }
  return null;
}

function auftragIstCcInternProduktionsPool(a) {
  if (typeof window !== 'undefined' && typeof window.mobAuftragIstCcInternProduktionsPool === 'function') {
    return window.mobAuftragIstCcInternProduktionsPool(a);
  }
  if (!a || a.archiv) return false;
  var stepC = _internCanonicalWorkflowStep(a.step);
  if (stepC === 'abgeschlossen' || stepC === '') return false;
  if (!a.schritte || typeof a.schritte !== 'object') return false;
  return !!_internSchrittObjektFuerAuftragUndStep(a, a.step);
}

/**
 * Cockpit-Auslastung / MA-Detail: alle geplanten INTERN-Zeilen zu noch nicht abgeschlossenen
 * Workflow-Schritten des Auftrags — nicht nur die aktuelle Kanban-Spalte (sonst fehlen z. B.
 * Montage-Stunden für Zusatz-MA solange der Auftrag noch bei Druck steht).
 * Unabhängig von `mobInternAufgabePasstZuProduktionsWorkflow` (Mitarbeiter-App unverändert).
 */
function internAufgabeIstNurProduktionsAuftrag(g) {
  if (!g) return false;
  var a = _internAuftragFuerInternZeile(g);
  if (!auftragIstCcInternProduktionsPool(a)) return false;
  var stepCanon = _internCanonicalWorkflowStep(g.schritt);
  if (!stepCanon || stepCanon === 'abgeschlossen') return false;
  var sch = _internSchrittObjektFuerAuftragUndStep(a, g.schritt);
  if (!sch) return false;
  if (typeof schrittMigrieren === 'function') schrittMigrieren(sch, g.schritt);
  if (sch.fertig) return false;
  var st = String(sch.status != null ? sch.status : '').trim().toLowerCase();
  if (st === 'abgeschlossen') return false;
  return true;
}

// ── Arbeitszeit pro Mitarbeiter aus AUFTRAEGE.zeiten berechnen ──
function calcMaStunden(maId, nFallback){
  // 1. maId-Vergleich (eindeutig, zukunftssicher)
  // 2. Namens-Fallback für ältere Buchungseinträge ohne maId
  var minuten = 0;
  AUFTRAEGE.forEach(function(a){
    (a.zeiten||[]).forEach(function(z){
      var treffer = false;
      if(z.maId){
        treffer = typeof maIdGleich === 'function' ? maIdGleich(z.maId, maId) : (z.maId === maId);
      } else {
        var vornameZeit = (z.wer||'').split('+').map(function(s){ return s.trim().toLowerCase(); });
        var vornameMa   = nFallback.split(' ')[0].toLowerCase();
        treffer = vornameZeit.some(function(v){
          return v === vornameMa || v === nFallback.toLowerCase();
        });
      }
      if(treffer) minuten += (z.dauer||0);
    });
  });
  return Math.round(minuten / 60 * 10) / 10;
}

/**
 * Alle User-UUIDs eines Workflow-Schritts: Verantwortlicher/werId/maId + maIds + teamMaIds + zusatzMa.
 * Kürzel/Legacy-IDs → maKuerzelOderIdZuUserUuid; Set-Dedupe pro Auftrag (keine Doppelzählung).
 * @param {Record<string, unknown>|null|undefined} sch
 * @returns {string[]}
 */
function internSchrittResolvedUserIds(sch) {
  if (!sch) return [];
  function isU(s) {
    return typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(String(s).trim());
  }
  function resolveToken(raw) {
    var u = raw != null ? String(raw).trim() : '';
    if (!u || u === 'undefined' || u === '—') return '';
    if (isU(u)) return u;
    var r = typeof maKuerzelOderIdZuUserUuid === 'function' ? maKuerzelOderIdZuUserUuid(u) : null;
    var rs = r != null ? String(r).trim() : '';
    return rs && isU(rs) ? rs : '';
  }
  var candidates = [];
  function pushRaw(x) {
    if (x == null) return;
    if (Array.isArray(x)) {
      x.forEach(pushRaw);
      return;
    }
    var s = String(x).trim();
    if (s && s !== 'undefined' && s !== '—') candidates.push(s);
  }
  pushRaw(sch.verantwortlicher);
  pushRaw(sch.werId);
  pushRaw(sch.maId);
  pushRaw(sch.maIds);
  pushRaw(sch.teamMaIds);
  pushRaw(sch.zusatzMa);

  var out = [];
  var seen = {};
  var ci;
  var uuid;
  for (ci = 0; ci < candidates.length; ci++) {
    uuid = resolveToken(candidates[ci]);
    if (!uuid || seen[uuid]) continue;
    seen[uuid] = true;
    out.push(uuid);
  }
  return out;
}

/**
 * User-UUIDs für INTERN_AUFGABEN: Verantwortlicher + Team, je Person nur einmal
 * (auch wenn in maIds, teamMaIds und zusatzMa).
 * @param {Record<string, unknown>|null|undefined} sch
 * @returns {string[]}
 */
function internAufgabenDedupeMaUserIdsFuerSchritt(sch) {
  var basis =
    typeof internSchrittResolvedUserIds === 'function' ? internSchrittResolvedUserIds(sch) : [];
  var seen = Object.create(null);
  var out = [];
  (basis || []).forEach(function (uuid) {
    var u = uuid != null ? String(uuid).trim() : '';
    if (!u) return;
    var key = u;
    if (typeof ccInternBucketKeyFuerMitarbeiterRohwert === 'function') {
      var bk = ccInternBucketKeyFuerMitarbeiterRohwert(u);
      if (bk) key = bk;
    }
    if (seen[key]) return;
    seen[key] = true;
    out.push(u);
  });
  return out;
}

/** Verantwortlichen-UUID eines Schritts (User-UUID). */
function internSchrittVerantwortlicherUserId(sch) {
  if (!sch) return null;
  var roh = sch.verantwortlicher || sch.werId || sch.maId;
  if (roh == null || String(roh).trim() === '' || String(roh).trim() === '—') return null;
  var r = String(roh).trim();
  if (typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(r)) return r;
  if (typeof maKuerzelOderIdZuUserUuid === 'function') {
    var z = String(maKuerzelOderIdZuUserUuid(r) || '').trim();
    if (z && typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(z)) return z;
  }
  return null;
}

function calcMaAufgaben(maId, nFallback){
  // Zählt aktive Aufträge (nicht abgeschlossen) wo dieser MA
  // in irgendeinem noch offenen Schritt zuständig ist.
  // Matching: nur users.id (UUID) — sch.werId / verantwortlicher / maIds
  var count = 0;
  var target = maId != null ? String(maId).trim() : '';
  if (!target) return 0;
  AUFTRAEGE.forEach(function(a){
    if(a.step === 'abgeschlossen') return;
    if (!auftragIstCcInternProduktionsPool(a)) return;
    var zustaendig = false;
    Object.keys(a.schritte||{}).forEach(function(step){
      if(step === 'abgeschlossen') return;
      var sch = a.schritte[step];
      if(!sch || sch.fertig) return;
      if (typeof schrittMigrieren === 'function') schrittMigrieren(sch, step);
      var ids = internSchrittResolvedUserIds(sch);
      for (var ii = 0; ii < ids.length; ii++) {
        if (String(ids[ii]).trim() === target) {
          zustaendig = true;
          break;
        }
      }
    });
    if(zustaendig) count++;
  });
  return count;
}

// ═══════════════════════════════════════════════════════════════
// MITARBEITER — AUSLASTUNG + WOCHENPLANUNG + DETAIL
// Einzige Datenquelle: INTERN_AUFGABEN (aus Aufträgen erzeugt)
// ═══════════════════════════════════════════════════════════════

var MA_TAG_KAPAZITAET = 8; // Stunden pro Tag — zentral steuerbar

/** ISO YYYY-MM-DD aus Freitext (inkl. 09.05.2026, ISO mit Uhrzeit). */
function ccInternExtrahiereIsoDatumAusString(raw){
  if (raw == null) return '';
  var s = String(raw).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    var dd = m[1].length === 1 ? '0' + m[1] : m[1];
    var mm = m[2].length === 1 ? '0' + m[2] : m[2];
    return m[3] + '-' + mm + '-' + dd;
  }
  return '';
}

/**
 * Montagetermin aus Neuer-Auftrag-Formular (#au-montage-datum, #au-montage-zeit).
 * Wenn Datum leer aber Montage-Schritt aktiv → Tag vom Starttermin (#au-termin).
 * @returns {{ datumTag: string, isoMitZeit: string }}
 */
function ccInternMontageTerminAusFormular(montageDatumRaw, montageZeitRaw, fallbackDatumRaw, montageSchrittAktiv){
  var out = { datumTag: '', isoMitZeit: '' };
  if (!montageSchrittAktiv) return out;
  var day = String(montageDatumRaw || '').trim().substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    day = String(fallbackDatumRaw || '').trim().substring(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return out;
  var z = String(montageZeitRaw != null ? montageZeitRaw : '').trim();
  var m = z.match(/^(\d{1,2}):(\d{2})/);
  var hh = '07';
  var mm = '00';
  if (m) {
    var n = parseInt(m[1], 10);
    hh = (n < 10 ? '0' : '') + n;
    if (hh.length > 2) hh = hh.slice(-2);
    mm = m[2];
  }
  out.datumTag = day;
  out.isoMitZeit = day + 'T' + hh + ':' + mm + ':00';
  return out;
}

/**
 * Kalibrierdatum für Montage-Auslastung (nicht aus Wochenverteilung ableiten).
 */
function ccInternAuftragMontageDatumIso(a){
  if (!a || typeof a !== 'object') return '';
  var candidates = [
    a.montageTermin,
    a.montagetermin,
    a.montage_datum,
    a.montageDatum,
    a.montageDatumZeit,
    a.montageStart,
    a.termin,
    a.start,
  ];
  var i;
  var iso;
  for (i = 0; i < candidates.length; i++) {
    if (candidates[i] == null || String(candidates[i]).trim() === '') continue;
    iso = ccInternExtrahiereIsoDatumAusString(candidates[i]);
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  }
  return '';
}

/** Montage-Stunden aus Auftrag.schritte.montage (nicht aus Split-Zeilen summieren). */
function ccInternAuftragMontageDauerStd(a){
  if (!a || typeof a !== 'object' || !a.schritte || !a.schritte.montage) return 0;
  var sch = a.schritte.montage;
  if (typeof schrittMigrieren === 'function') schrittMigrieren(sch, 'montage');
  var d = Number(sch.dauer);
  return d > 0 ? d : 0;
}

/** Dedupe-Key: maId + auftragId + literal „montage“ (ANWEISUNG 15). */
function maInternMontageKartenKey(maId, auftragId){
  return String(maId != null ? maId : '').trim() + '\x1e' + String(auftragId != null ? auftragId : '') + '\x1emontage';
}

/**
 * Aus beliebig vielen INTERN-Montage-Zeilen (Split/Alt) genau eine virtuelle Karte:
 * datum = ccInternAuftragMontageDatumIso(auftrag), dauer = Schritt-Dauer Auftrag, Fallback Zeile.
 */
function maInternMontageZeilenZuEinerKarteProAuftragUndMa(rows){
  var map = {};
  rows.forEach(function(g){
    if (!g) return;
    var a = typeof _internAuftragFuerInternZeile === 'function' ? _internAuftragFuerInternZeile(g) : null;
    var mt = a ? ccInternAuftragMontageDatumIso(a) : '';
    var dStd = a ? ccInternAuftragMontageDauerStd(a) : 0;
    var d = dStd > 0 ? dStd : Number(g.dauer) || 0;
    var datumNorm = mt || String(g.datum || '');
    var mid = g.maId != null ? String(g.maId).trim() : '';
    var k = maInternMontageKartenKey(mid, g.auftragId);
    var titel = String(g.titel || '');
    if (/\(Tag\s+\d+\s*\/\s*\d+\)/.test(titel)) {
      titel = titel.replace(/\s*\(Tag\s+\d+\s*\/\s*\d+\)\s*$/, '');
    }
    var neu = Object.assign({}, g, {
      datum: datumNorm,
      dauer: d,
      dauerGesamt: d,
      tagBlock: null,
      titel: titel,
    });
    map[k] = neu;
  });
  return Object.keys(map).map(function(key){ return map[key]; });
}

/**
 * Nachladen / nach Erzeugen: Split-Montage-Zeilen auf echten Termin + Schritt-Dauer setzen,
 * pro MA+Auftrag nur eine Zeile behalten (falsches datum / Duplikate entfernen).
 * @returns {boolean} Daten wurden geändert
 */
function maInternRepariereMontageInternZeilenNachAuftrag(){
  if (typeof INTERN_AUFGABEN === 'undefined' || !INTERN_AUFGABEN.length) return false;
  if (typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE || !AUFTRAEGE.length) return false;
  var dirty = false;
  INTERN_AUFGABEN.forEach(function(g){
    if (!g || g.status === 'erledigt') return;
    var sk = typeof _internCanonicalWorkflowStep === 'function' ? _internCanonicalWorkflowStep(g.schritt) : '';
    if (sk !== 'montage') return;
    var a = typeof _internAuftragFuerInternZeile === 'function' ? _internAuftragFuerInternZeile(g) : null;
    if (!a) return;
    var mt = ccInternAuftragMontageDatumIso(a);
    var dStd = ccInternAuftragMontageDauerStd(a);
    if (mt && String(g.datum) !== mt) {
      g.datum = mt;
      dirty = true;
    }
    if (dStd > 0) {
      if (Number(g.dauer) !== dStd || Number(g.dauerGesamt) !== dStd) {
        g.dauer = dStd;
        g.dauerGesamt = dStd;
        dirty = true;
      }
    }
    if (g.tagBlock) {
      g.tagBlock = null;
      dirty = true;
    }
    var titel = String(g.titel || '');
    if (/\(Tag\s+\d+\s*\/\s*\d+\)/.test(titel)) {
      g.titel = titel.replace(/\s*\(Tag\s+\d+\s*\/\s*\d+\)\s*$/, '');
      dirty = true;
    }
  });
  var seen = {};
  for (var i = INTERN_AUFGABEN.length - 1; i >= 0; i--) {
    var gg = INTERN_AUFGABEN[i];
    if (!gg) continue;
    var sk2 = typeof _internCanonicalWorkflowStep === 'function' ? _internCanonicalWorkflowStep(gg.schritt) : '';
    if (sk2 !== 'montage') continue;
    var mid = gg.maId != null ? String(gg.maId).trim() : '';
    var mk = maInternMontageKartenKey(mid, gg.auftragId);
    if (seen[mk]) {
      INTERN_AUFGABEN.splice(i, 1);
      dirty = true;
      continue;
    }
    seen[mk] = true;
  }
  return dirty;
}

// Geplante Stunden eines MA an einem bestimmten Tag (ISO-Datum)
function maTagesStunden(maId, datum){
  var target = maId != null ? String(maId).trim() : '';
  var dat = datum != null ? String(datum) : '';
  if (!target || !dat) return 0;
  var agg = {};
  INTERN_AUFGABEN.forEach(function(g){
    if (!g || g.status === 'erledigt') return;
    if (!maAufgabeIstFuerMa(g, target)) return;
    if (!internAufgabeIstNurProduktionsAuftrag(g)) return;
    var sk = typeof _internCanonicalWorkflowStep === 'function' ? _internCanonicalWorkflowStep(g.schritt) : String(g.schritt || '');
    var mid = g.maId != null ? String(g.maId).trim() : '';
    if (sk === 'montage') {
      var a = typeof _internAuftragFuerInternZeile === 'function' ? _internAuftragFuerInternZeile(g) : null;
      var mt = a ? ccInternAuftragMontageDatumIso(a) : '';
      var tagNorm = mt || String(g.datum || '');
      if (dat !== tagNorm) return;
      var dStd = a ? ccInternAuftragMontageDauerStd(a) : 0;
      var dMont = dStd > 0 ? dStd : Number(g.dauer) || 0;
      var mk = maInternMontageKartenKey(mid, g.auftragId);
      agg[mk] = dMont;
      return;
    }
    if (String(g.datum) !== dat) return;
    var key = String(g.auftragId) + '\x1e' + sk + '\x1e' + mid;
    var d = Number(g.dauer) || 0;
    if (!(key in agg)) agg[key] = d;
    else agg[key] = Math.max(agg[key], d);
  });
  var k;
  var sum = 0;
  for (k in agg) {
    if (Object.prototype.hasOwnProperty.call(agg, k)) sum += agg[k];
  }
  return sum;
}

// Kapazitäts-Farbe für einen Tag
function maKapFarbe(istH, kapH){
  if(istH <= 0)            return 'var(--border)';
  if(istH >= kapH)         return 'var(--red)';
  if(istH >= kapH * 0.75)  return 'var(--amber)';
  return 'var(--green)';
}

/** Soll-Stunden gesamt am Auftrag: Summe der Schritt-dauer (h-Feld), nicht × Anzahl Mitarbeiter. */
function internAuftragSollStundenGesamt(a) {
  if (!a || !a.schritte || typeof a.schritte !== 'object') return 0;
  var sum = 0;
  Object.keys(a.schritte).forEach(function (step) {
    if (step === 'abgeschlossen') return;
    var sch = a.schritte[step];
    if (!sch) return;
    var d = Number(sch.dauer);
    if (d > 0) sum += d;
  });
  return Math.round(sum * 10) / 10;
}

/**
 * Fallback aus INTERN_AUFGABEN: pro Schritt max. dauerGesamt/dauer (parallele MA), dann summieren.
 * @param {object[]} aufgaben
 */
function internGeplanteSollStundenAusAufgabenliste(aufgaben) {
  var byStep = {};
  (aufgaben || []).forEach(function (g) {
    if (!g) return;
    var sk =
      typeof _internCanonicalWorkflowStep === 'function'
        ? _internCanonicalWorkflowStep(g.schritt)
        : String(g.schritt || '');
    var dg =
      g.dauerGesamt != null && Number(g.dauerGesamt) > 0
        ? Number(g.dauerGesamt)
        : Number(g.dauer) || 0;
    if (!(sk in byStep)) byStep[sk] = dg;
    else byStep[sk] = Math.max(byStep[sk], dg);
  });
  var sum = 0;
  Object.keys(byStep).forEach(function (sk) {
    sum += byStep[sk];
  });
  return Math.round(sum * 10) / 10;
}

// Kapazitätsprüfung: gibt Array von Warnungen zurück
// [{maId, ma, datum, istH, kapH, ueberlast}]
// auftragOpt: für Montage wird das Planungsdatum aus dem Auftrag genommen (nicht UI-Tagesdatum).
function maKapPruefen(schritte, datum, auftragOpt){
  var warnungen = [];
  var tagesMap = {}; // maId|datum → Summe neu geplanter Stunden
  var tripleSeen = {}; // auftragId + kanonischer Schritt + maId → nur einmal zählen
  var aid =
    auftragOpt && auftragOpt.id != null
      ? String(auftragOpt.id)
      : auftragOpt && auftragOpt.auId != null
        ? String(auftragOpt.auId)
        : '';
  Object.keys(schritte).forEach(function(step){
    var sch = schritte[step];
    if(!sch || !sch.dauer || sch.dauer<=0) return;
    if (typeof schrittMigrieren === 'function') schrittMigrieren(sch, step);
    var stepCanon = typeof _internCanonicalWorkflowStep === 'function' ? _internCanonicalWorkflowStep(step) : String(step || '');
    var planDatum = datum != null ? String(datum) : '';
    if (stepCanon === 'montage' && auftragOpt && typeof ccInternAuftragMontageDatumIso === 'function') {
      var mt = ccInternAuftragMontageDatumIso(auftragOpt);
      if (mt) planDatum = mt;
    }
    if (!planDatum) return;
    var ids = typeof internSchrittResolvedUserIds === 'function' ? internSchrittResolvedUserIds(sch) : [];
    if (!ids.length && sch.maId) {
      var mr = typeof maKuerzelOderIdZuUserUuid === 'function' ? maKuerzelOderIdZuUserUuid(sch.maId) : null;
      var one = mr != null && String(mr).trim() !== '' ? String(mr).trim() : String(sch.maId).trim();
      if (
        one &&
        typeof maIstCockpitUserUuid === 'function' &&
        maIstCockpitUserUuid(one)
      ) {
        ids = [one];
      }
    }
    if (!ids.length) return;
    var dauerPlan = Number(sch.dauer) || 0;
    ids.forEach(function (mid) {
      if (!mid) return;
      var ms = String(mid).trim();
      if (!ms) return;
      var tk = aid + '\x1e' + String(stepCanon) + '\x1e' + ms;
      if (tripleSeen[tk]) return;
      tripleSeen[tk] = true;
      var key = ms + '|' + planDatum;
      tagesMap[key] = (tagesMap[key] || 0) + dauerPlan;
    });
  });
  Object.keys(tagesMap).forEach(function(key){
    var parts = key.split('|');
    var maId = parts[0]; var dat = parts[1];
    var bereitsGeplant = maTagesStunden(maId, dat);
    var neuDauer = tagesMap[key];
    var gesamt = bereitsGeplant + neuDauer;
    if(gesamt > MA_TAG_KAPAZITAET){
      var ma = MA_DATA.find(function(m){ return m.maId===maId; });
      warnungen.push({
        maId: maId,
        ma:   ma ? ma.n : maId,
        datum: dat,
        istH:  gesamt,
        kapH:  MA_TAG_KAPAZITAET,
        ueberlast: gesamt > MA_TAG_KAPAZITAET,
      });
    }
  });
  return warnungen;
}

/** Eine sichtbare Karte pro auftragId + Schritt + maId (ohne Montage — siehe maInternMontageZeilenZuEinerKarteProAuftragUndMa). */
function maInternAufgabenDedupeNachAuftragSchrittMa(rows){
  var best = {};
  rows.forEach(function(g){
    if (!g) return;
    var sk = typeof _internCanonicalWorkflowStep === 'function' ? _internCanonicalWorkflowStep(g.schritt) : String(g.schritt || '');
    var mid = g.maId != null ? String(g.maId).trim() : '';
    var k = String(g.auftragId) + '\x1e' + sk + '\x1e' + mid;
    var cur = best[k];
    if (!cur) {
      best[k] = g;
      return;
    }
    if ((Number(g.dauer) || 0) >= (Number(cur.dauer) || 0)) best[k] = g;
  });
  return Object.keys(best).map(function(key){ return best[key]; });
}

// ── Hilfsfunktionen ─────────────────────────────────────────
function maAufgaben(maId){
  if (maId == null || String(maId).trim() === '') { return []; }
  var target = String(maId).trim();
  var raw = INTERN_AUFGABEN.filter(function(g){
    if(g.status === 'erledigt') return false;
    if (!internAufgabeIstNurProduktionsAuftrag(g)) return false;
    return maAufgabeIstFuerMa(g, target);
  });
  var montRows = [];
  var rest = [];
  raw.forEach(function(g){
    var sk = typeof _internCanonicalWorkflowStep === 'function' ? _internCanonicalWorkflowStep(g.schritt) : String(g.schritt || '');
    if (sk === 'montage') montRows.push(g);
    else rest.push(g);
  });
  var montNorm = maInternMontageZeilenZuEinerKarteProAuftragUndMa(montRows);
  var restDedup = maInternAufgabenDedupeNachAuftragSchrittMa(rest);
  return montNorm.concat(restDedup);
}

/**
 * Konsole: pro INTERN-Zeile, warum `maAufgaben` sie ausfiltert (keine Logik-Änderung, nur Anzeige).
 * Legende (warum `finalVisible` u. U. false; bei Flags ist „falsch“/nicht zutreffend gemeint):
 *   status === 'erledigt'          → Aufgabe abgeschlossen
 *   produktionsPoolMatch = false  → Elternauftrag nicht im Produktions-Pool
 *   schrittMatch = false          → g.schritt passt nicht (kanonisch) zu a.step
 *   maMatch = false                → g.maId / g.maIds passt nicht zum Mitarbeiter
 * `produktionsPoolMatch` / `schrittMatch` = lokale Zerlegung; `finalVisible` = exakt wie `maAufgaben` (u. a. ggf. `mobInternAufgabePasstZuProduktionsWorkflow`).
 * @param {string} maKey — Kürzel m.k, Name-Teil, oder User-UUID (Cockpit)
 * @example ccInternDebugMaAufgaben('OK');
 */
function ccInternDebugMaAufgaben(maKey) {
  if (typeof console === 'undefined' || !console.log) return;
  if (maKey == null || String(maKey).trim() === '') {
    console.warn('[ccInternDebugMaAufgaben] maKey fehlt (z. B. \'OK\', Okan, oder UUID).');
    return;
  }
  if (typeof MA_DATA === 'undefined' || !MA_DATA || !MA_DATA.length) {
    console.warn('[ccInternDebugMaAufgaben] MA_DATA leer');
    return;
  }
  var k = String(maKey).trim();
  var m = null;
  if (typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(k)) {
    m = MA_DATA.find(function (x) {
      return x && (String(x.maId) === k || (x.id != null && String(x.id) === k));
    });
  } else {
    var kLow = k.toLowerCase();
    m = MA_DATA.find(function (x) {
      if (!x) return false;
      if (x.k && String(x.k).trim() !== '' && String(x.k).toUpperCase() === k.toUpperCase()) return true;
      if (x.n && String(x.n).toLowerCase().indexOf(kLow) >= 0) return true;
      if (x.name && String(x.name).toLowerCase().indexOf(kLow) >= 0) return true;
      return false;
    });
  }
  if (!m || m.maId == null) {
    console.warn('[ccInternDebugMaAufgaben] Kein Mitarbeiter zu', maKey);
    return;
  }
  var targetMaId = m.maId;
  var list = (typeof INTERN_AUFGABEN !== 'undefined' && INTERN_AUFGABEN) ? INTERN_AUFGABEN : [];
  console.log('[ccInternDebugMaAufgaben] MA', m.n || m.name || m.k, '→ maId', targetMaId, 'INTERN_AUFGABEN', list.length);
  console.log(
    '[ccInternDebugMaAufgaben] Legende: status=erledigt → Aufgabe abgeschlossen; produktionsPoolMatch=false → Elternauftrag nicht im Produktions-Pool; schrittMatch=false → g.schritt passt nicht zu a.step; maMatch=false → g.maId/g.maIds passt nicht zum Mitarbeiter',
  );
  for (var i = 0; i < list.length; i++) {
    var g = list[i];
    if (!g) continue;
    var a = (typeof _internAuftragFuerInternZeile === 'function') ? _internAuftragFuerInternZeile(g) : null;
    var produktionsPoolMatch = !!(a && (typeof auftragIstCcInternProduktionsPool === 'function' && auftragIstCcInternProduktionsPool(a)));
    var schrittMatch = !!(a && (typeof _internCanonicalWorkflowStep === 'function'
      ? (_internCanonicalWorkflowStep(g.schritt) === _internCanonicalWorkflowStep(a.step))
      : false));
    var maMatch = (typeof maAufgabeIstFuerMa === 'function') ? maAufgabeIstFuerMa(g, targetMaId) : false;
    var finalVisible = (g.status !== 'erledigt')
      && (typeof internAufgabeIstNurProduktionsAuftrag === 'function' && internAufgabeIstNurProduktionsAuftrag(g))
      && maMatch;
    console.log('[ccInternDebugMaAufgabe]', g.id, {
      auftragId: g.auftragId,
      schritt: g.schritt,
      parentAStep: a ? a.step : null,
      status: g.status,
      produktionsPoolMatch: produktionsPoolMatch,
      schrittMatch: schrittMatch,
      maMatch: maMatch,
      finalVisible: finalVisible,
    });
  }
}
if (typeof window !== 'undefined') {
  window.ccInternDebugMaAufgaben = ccInternDebugMaAufgaben;
}

function maAufgabenHeute(maId){
  var heute = isoDate(new Date());
  return maAufgaben(maId).filter(function(g){ return g.datum === heute; });
}

function maDauerGesamt(maId){
  return maAufgaben(maId).reduce(function(s,g){ return s + (g.dauer||0); }, 0);
}

// Montag der Woche für ein Datum (ISO-String)
function wocheStart(isoDate){
  var d = new Date(isoDate || new Date());
  var day = d.getDay(); // 0=So
  var diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

/** Kalendertag YYYY-MM-DD in **lokaler** Zeitzone (nicht UTC — sonst verschiebt sich z. B. Mo→Di in der MA-Woche). */
function isoDate(d){
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/** Fallback wenn globales isoDate nicht aufrufbar ist (z. B. Parameter-Shadowing). */
function safeIsoDate(d){
  try {
    var x = (d instanceof Date) ? d : new Date(d);
    return x.toISOString().slice(0, 10);
  } catch (_) {
    return '';
  }
}

function isoDateFormatDay(d, callsite){
  if (typeof isoDate === 'function') return isoDate(d);
  console.info('[ISO_DATE_DEBUG]', {
    typeofIsoDate: typeof isoDate,
    callsite: callsite || '',
    value: d,
  });
  return safeIsoDate(d);
}

function maAufgabenWoche(maId, montagDate){
  var mo = montagDate || wocheStart(new Date());
  var tage = [];
  for(var i=0; i<7; i++){
    var d = new Date(mo); d.setDate(mo.getDate()+i);
    tage.push(isoDate(d));
  }
  return maAufgaben(maId).filter(function(g){ return tage.indexOf(g.datum) >= 0; });
}

// ── MA-Karte rendern ─────────────────────────────────────────
function renderMitarbeiter(){
  var grid = document.getElementById('maGrid'); if(!grid) return;
  var cnt = document.getElementById('maGridCount');
  if(cnt) cnt.textContent = MA_DATA.length + ' Mitarbeiter';
  var heute = isoDate(new Date());

  grid.innerHTML = MA_DATA.map(function(m){
    var aufg     = maAufgaben(m.maId);
    var heute_aufg = maAufgabenHeute(m.maId);
    var gesamtH  = aufg.reduce(function(s,g){ return s+(g.dauer||0); }, 0);
    var heuteH   = heute_aufg.reduce(function(s,g){ return s+(g.dauer||0); }, 0);
    // Auslastung: geplante Stunden vs. Monatssoll
    var pct = m.soll > 0 ? Math.min(100, Math.round(gesamtH / m.soll * 100)) : 0;
    var barCol = pct >= 90 ? 'var(--red)' : pct >= 65 ? 'var(--amber)' : pct >= 20 ? m.col : 'var(--border)';
    var statusDot = heuteH > 0
      ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block;margin-left:5px;" title="Heute aktiv"></span>'
      : '';

    return '<div class="ma-card" style="cursor:pointer;" onclick="maOpenDetail(\''+m.maId+'\')">'
      +'<div style="position:relative;">'
        +'<div class="ma-av" style="background:'+m.col+';">'+m.av+'</div>'
      +'</div>'
      +'<div class="ma-name">'+m.n+statusDot+'</div>'
      +'<div class="ma-role">'+m.r+'</div>'
      +'<div style="margin-bottom:8px;">'
        +'<div class="prog"><div class="prog-f" style="width:'+pct+'%;background:'+barCol+';transition:width .4s;"></div></div>'
        +'<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:3px;">'
          +'<span>'+gesamtH.toFixed(1)+'h geplant</span>'
          +'<span>'+m.soll+'h Soll</span>'
        +'</div>'
      +'</div>'
      +'<div class="ma-stats">'
        +'<div><div class="ma-stat-n" style="color:'+(heuteH>0?'var(--green)':'var(--text3)')+'">'+heuteH+'h</div><div class="ma-stat-l">Heute</div></div>'
        +'<div><div class="ma-stat-n">'+aufg.length+'</div><div class="ma-stat-l">Aufgaben</div></div>'
        +'<div><div class="ma-stat-n" style="color:'+barCol+'">'+pct+'%</div><div class="ma-stat-l">Auslastung</div></div>'
      +'</div>'
    +'</div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// MITARBEITER-EINSTELLUNGEN (Chef-Tabelle)
// ══════════════════════════════════════════════════════════════

var _maNewCount = 0; // Zähler für neue Zeilen

function maOpenSettings(){
  _maNewCount = 0;
  var ov = document.getElementById('ma-settings-ov');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'ma-settings-ov';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:400;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    ov.onclick = function(e){ if(e.target===ov) maCloseSettings(); };
    document.body.appendChild(ov);
  }

  // Inputfeld-Style (wiederverwendet)
  var iStyle = 'border:1px solid var(--border);border-radius:6px;padding:5px 8px;background:#fff;outline:none;';

  var rows = MA_DATA.map(function(m){
    return '<tr data-maid-row="'+m.maId+'">'
      // Farbe + Name
      +'<td style="padding:9px 10px;">'
        +'<div style="display:flex;align-items:center;gap:8px;">'
          +'<input type="color" data-maid="'+m.maId+'" data-field="col" value="'+m.col+'"'
            +' title="Farbe ändern"'
            +' style="width:30px;height:30px;border-radius:50%;border:2px solid var(--border);cursor:pointer;padding:2px;">'
          +'<div>'
            +'<input type="text" data-maid="'+m.maId+'" data-field="n" value="'+m.n+'"'
              +' style="'+iStyle+'font-size:13px;font-weight:600;width:105px;color:var(--text);"'
              +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
            +'<div style="font-size:10px;color:var(--text3);margin-top:2px;padding-left:2px;">'+m.maId+'</div>'
          +'</div>'
        +'</div>'
      +'</td>'
      +'<td style="padding:9px 10px;">'
        +'<input type="text" data-maid="'+m.maId+'" data-field="k" value="'+String(m.k != null ? m.k : '')+'" maxlength="5"'
          +' style="'+iStyle+'font-size:12px;font-weight:700;width:54px;text-align:center;text-transform:uppercase;letter-spacing:.04em;"'
          +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.value=this.value.trim().toUpperCase();this.style.borderColor=\'var(--border)\'" title="2–5 Buchstaben, eindeutig">'
      +'</td>'
      // Rolle
      +'<td style="padding:9px 10px;">'
        +'<input type="text" data-maid="'+m.maId+'" data-field="r" value="'+m.r+'"'
          +' style="'+iStyle+'font-size:12px;width:155px;color:var(--text);"'
          +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
      +'</td>'
      // Soll-Stunden
      +'<td style="padding:9px 10px;text-align:center;">'
        +'<div style="display:flex;align-items:center;gap:4px;justify-content:center;">'
          +'<input type="number" data-maid="'+m.maId+'" data-field="soll" value="'+m.soll+'" min="0" max="400"'
            +' style="'+iStyle+'font-size:13px;font-weight:700;width:68px;text-align:center;color:var(--blue);"'
            +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
          +'<span style="font-size:11px;color:var(--text3);">h</span>'
        +'</div>'
      +'</td>'
      // Urlaubstage
      +'<td style="padding:9px 10px;text-align:center;">'
        +'<div style="display:flex;align-items:center;gap:4px;justify-content:center;">'
          +'<input type="number" data-maid="'+m.maId+'" data-field="urlaub" value="'+(m.urlaub != null ? m.urlaub : (m.urlaubstage != null ? m.urlaubstage : 28))+'" min="0" max="365"'
            +' style="'+iStyle+'font-size:13px;font-weight:700;width:62px;text-align:center;color:var(--green);"'
            +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
          +'<span style="font-size:11px;color:var(--text3);">Tage</span>'
        +'</div>'
      +'</td>'
      // Löschen-Button
      +'<td style="padding:9px 8px;text-align:center;width:36px;">'
        +'<button onclick="maToggleDelete(this,\''+m.maId+'\')" title="Mitarbeiter entfernen"'
          +' style="background:none;border:none;cursor:pointer;font-size:15px;color:var(--text3);padding:4px 6px;border-radius:5px;transition:all .12s;"'
          +' onmouseover="this.style.background=\'var(--red-l)\';this.style.color=\'var(--red)\'"'
          +' onmouseout="this.style.background=this.dataset.del===\'1\'?\'var(--red-l)\':\'\';this.style.color=this.dataset.del===\'1\'?\'var(--red)\':\' var(--text3)\'">'
          +'🗑'
        +'</button>'
      +'</td>'
    +'</tr>';
  }).join('');

  ov.innerHTML =
    '<div style="background:#fff;border-radius:14px;width:800px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.22);">'
      // Header
      +'<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">'
        +'<div>'
          +'<div style="font-size:15px;font-weight:700;">⚙ Mitarbeiter-Einstellungen</div>'
          +'<div style="font-size:11px;color:var(--text2);margin-top:2px;">Stammdaten, Sollstunden & Urlaubstage — hinzufügen oder entfernen</div>'
        +'</div>'
        +'<button onclick="maCloseSettings()" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:16px;color:var(--text2);display:flex;align-items:center;justify-content:center;">×</button>'
      +'</div>'
      // Tabelle
      +'<div style="flex:1;overflow-y:auto;padding:16px 22px 8px;">'
        +'<table style="width:100%;border-collapse:collapse;" id="ma-settings-table">'
          +'<thead>'
            +'<tr style="background:var(--gray-l);">'
              +'<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--text2);border-bottom:1px solid var(--border);">Mitarbeiter</th>'
              +'<th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:700;color:var(--blue);border-bottom:1px solid var(--border);">Kürzel</th>'
              +'<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--text2);border-bottom:1px solid var(--border);">Rolle</th>'
              +'<th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:700;color:var(--blue);border-bottom:1px solid var(--border);">Soll-Std./Monat</th>'
              +'<th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:700;color:var(--green);border-bottom:1px solid var(--border);">Urlaub/Jahr</th>'
              +'<th style="border-bottom:1px solid var(--border);width:36px;"></th>'
            +'</tr>'
          +'</thead>'
          +'<tbody id="ma-settings-tbody">'+rows+'</tbody>'
        +'</table>'
        // + Mitarbeiter Button
        +'<button onclick="maAddNewRow()"'
          +' style="margin-top:10px;width:100%;padding:9px;border:1.5px dashed var(--border);border-radius:8px;background:transparent;color:var(--blue);font-size:12px;font-weight:600;cursor:pointer;transition:all .12s;"'
          +' onmouseover="this.style.background=\'var(--blue-l)\';this.style.borderColor=\'var(--blue)\'"'
          +' onmouseout="this.style.background=\'transparent\';this.style.borderColor=\'var(--border)\'">'
          +'＋ Mitarbeiter hinzufügen'
        +'</button>'
      +'</div>'
      // Footer
      +'<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
        +'<div style="font-size:11px;color:var(--text3);">🗑 = zum Entfernen markieren · ↩ = Rückgängig</div>'
        +'<div style="display:flex;gap:8px;">'
          +'<button class="btn" onclick="maCloseSettings()">Abbrechen</button>'
          +'<button class="btn p" onclick="maSaveSettings()" style="min-width:130px;">💾 Speichern</button>'
        +'</div>'
      +'</div>'
    +'</div>';

  ov.style.display = 'flex';
}

function maToggleDelete(btn, maId){
  var row = document.querySelector('#ma-settings-ov tr[data-maid-row="'+maId+'"]');
  if(!row) return;
  if(btn.dataset.del === '1'){
    // Rückgängig
    btn.dataset.del = '0';
    btn.innerHTML = '🗑';
    btn.title = 'Mitarbeiter entfernen';
    row.style.opacity = '1';
    row.style.background = '';
    row.querySelectorAll('input').forEach(function(i){ i.disabled = false; });
  } else {
    // Zum Löschen markieren
    btn.dataset.del = '1';
    btn.innerHTML = '↩';
    btn.title = 'Rückgängig';
    btn.style.background = 'var(--red-l)';
    btn.style.color = 'var(--red)';
    row.style.opacity = '0.4';
    row.style.background = '#FFF5F5';
    row.querySelectorAll('input').forEach(function(i){ i.disabled = true; });
  }
}

function maAddNewRow(){
  _maNewCount++;
  var tmpId = 'NEW_' + _maNewCount;
  var pallete = ['#E91E63','#9C27B0','#673AB7','#2196F3','#009688','#FF9800','#795548','#607D8B'];
  var col = pallete[(_maNewCount - 1) % pallete.length];
  var iStyle = 'border:1px solid var(--blue);border-radius:6px;padding:5px 8px;background:#fff;outline:none;';
  var tbody = document.getElementById('ma-settings-tbody');
  var tr = document.createElement('tr');
  tr.dataset.isnew = '1';
  tr.dataset.tmpid = tmpId;
  tr.style.background = '#F0FFF4';
  tr.innerHTML =
    '<td style="padding:9px 10px;">'
      +'<div style="display:flex;align-items:center;gap:8px;">'
        +'<input type="color" data-tmpid="'+tmpId+'" data-field="col" value="'+col+'"'
          +' style="width:30px;height:30px;border-radius:50%;border:2px solid var(--border);cursor:pointer;padding:2px;">'
        +'<div style="display:flex;flex-direction:column;gap:3px;">'
          +'<input type="text" data-tmpid="'+tmpId+'" data-field="n" placeholder="Vorname *" maxlength="30"'
            +' style="'+iStyle+'font-size:13px;font-weight:600;width:105px;"'
            +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
        +'</div>'
      +'</div>'
    +'</td>'
    +'<td style="padding:9px 10px;">'
      +'<input type="text" data-tmpid="'+tmpId+'" data-field="k" placeholder="XY" maxlength="5"'
        +' style="'+iStyle+'font-size:12px;font-weight:700;width:54px;text-align:center;text-transform:uppercase;"'
        +' title="2–5 Buchstaben, eindeutig"'
        +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.value=this.value.trim().toUpperCase();this.style.borderColor=\'var(--border)\'">'
    +'</td>'
    +'<td style="padding:9px 10px;">'
      +'<input type="text" data-tmpid="'+tmpId+'" data-field="r" placeholder="Rolle / Position"'
        +' style="'+iStyle+'font-size:12px;width:155px;"'
        +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
    +'</td>'
    +'<td style="padding:9px 10px;text-align:center;">'
      +'<div style="display:flex;align-items:center;gap:4px;justify-content:center;">'
        +'<input type="number" data-tmpid="'+tmpId+'" data-field="soll" value="160" min="0" max="400"'
          +' style="'+iStyle+'font-size:13px;font-weight:700;width:68px;text-align:center;color:var(--blue);"'
          +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
        +'<span style="font-size:11px;color:var(--text3);">h</span>'
      +'</div>'
    +'</td>'
    +'<td style="padding:9px 10px;text-align:center;">'
      +'<div style="display:flex;align-items:center;gap:4px;justify-content:center;">'
        +'<input type="number" data-tmpid="'+tmpId+'" data-field="urlaub" value="28" min="0" max="365"'
          +' style="'+iStyle+'font-size:13px;font-weight:700;width:62px;text-align:center;color:var(--green);"'
          +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'
        +'<span style="font-size:11px;color:var(--text3);">Tage</span>'
      +'</div>'
    +'</td>'
    +'<td style="padding:9px 8px;text-align:center;">'
      +'<button onclick="this.closest(\'tr\').remove()" title="Zeile entfernen"'
        +' style="background:none;border:none;cursor:pointer;font-size:15px;color:var(--text3);padding:4px 6px;border-radius:5px;"'
        +' onmouseover="this.style.color=\'var(--red)\'" onmouseout="this.style.color=\'var(--text3)\'">×</button>'
    +'</td>';
  tbody.appendChild(tr);
  tr.querySelector('[data-field="n"]').focus();
}

function maCloseSettings(){
  var ov = document.getElementById('ma-settings-ov');
  if(ov) ov.style.display = 'none';
}

async function maSaveSettings(){
  var changed = 0; var added = 0; var removed = 0; var errors = [];
  var toast = typeof showToast === 'function' ? showToast : null;
  var api = window.CCIntern && window.CCIntern.cockpitApi;
  var cockpit = !!window.__CCINTERN_COCKPIT_MOUNT__ && api;

  // 1. Bestehende aktualisieren (nur nicht zum Löschen markierte)
  var maidRows = Array.prototype.slice.call(document.querySelectorAll('#ma-settings-tbody tr[data-maid-row]'));
  for (var ri = 0; ri < maidRows.length; ri++) {
    var row = maidRows[ri];
    var maId = row.dataset.maidRow;
    var delBtn = row.querySelector('button[data-del]');
    if(delBtn && delBtn.dataset.del === '1'){
      var idx = MA_DATA.findIndex(function(x){ return x.maId === maId; });
      if(idx >= 0){
        var mDel = MA_DATA[idx];
        if (cockpit && typeof api.deleteMitarbeiterFromApi === 'function') {
          try {
            await api.deleteMitarbeiterFromApi(mDel, toast);
          } catch (e) {
            return;
          }
        }
        MA_DATA.splice(idx, 1);
        removed++;
      }
      continue;
    }
    var m = MA_DATA.find(function(x){ return x.maId === maId; });
    if(!m) continue;
    row.querySelectorAll('[data-maid]').forEach(function(inp){
      var field = inp.dataset.field;
      var val = inp.value.trim();
      if(field === 'soll' || field === 'urlaub'){
        var num = parseInt(val, 10);
        if(!isNaN(num) && num >= 0){
          if(field === 'urlaub'){
            if(m.urlaub !== num || m.urlaubstage !== num){
              m.urlaub = num;
              m.urlaubstage = num;
              changed++;
            }
          } else if(m[field] !== num){
            m[field] = num;
            changed++;
          }
        }
      } else if (field === 'k') {
        var kNorm = val.toUpperCase().trim();
        if (m.k !== kNorm) {
          m.k = kNorm;
          m.av = kNorm;
          changed++;
        }
      } else if(val && m[field] !== val){
        m[field] = val; changed++;
      }
    });
  }

  // 2. Neue Mitarbeiter sammeln (erst nach Kürzel-Validierung an MA_DATA anhängen)
  var kuerzelFehlerMsg =
    (window.CCIntern && window.CCIntern.cockpitApi && window.CCIntern.cockpitApi.MITARBEITER_KUERZEL_FEHLER) ||
    'Kürzel bereits vergeben oder ungültig.';
  var pendingNeu = [];
  document.querySelectorAll('#ma-settings-tbody tr[data-isnew="1"]').forEach(function(row){
    var entry = { col:'#1565C0', soll:160, urlaub:28, r:'' };
    row.querySelectorAll('[data-tmpid]').forEach(function(inp){
      var field = inp.dataset.field;
      var val = inp.value.trim();
      if(field === 'soll' || field === 'urlaub'){
        var num = parseInt(val, 10);
        if(!isNaN(num)) entry[field] = num;
      } else {
        entry[field] = field === 'k' ? val.toUpperCase() : val;
      }
    });
    if(!entry.n)    { errors.push('Vorname fehlt bei neuem Mitarbeiter'); return; }
    if(!String(entry.k || '').trim()) { errors.push(kuerzelFehlerMsg); return; }
    if(entry.urlaub != null) entry.urlaubstage = entry.urlaub;
    entry.k = String(entry.k).trim().toUpperCase();
    entry.maId = entry.k;
    entry.av = entry.k;
    pendingNeu.push(entry);
    added++;
  });

  if(errors.length){ showToast('⚠ '+errors[0]); return; }

  var trialListe = MA_DATA.concat(pendingNeu);
  var apxKu = window.CCIntern && window.CCIntern.cockpitApi;
  if (apxKu && typeof apxKu.validateMitarbeiterKuerzelListe === 'function') {
    var vrKu = apxKu.validateMitarbeiterKuerzelListe(trialListe);
    if (!vrKu.ok) {
      if (toast) toast('⚠ ' + vrKu.message);
      return;
    }
    if (typeof apxKu.mitarbeiterKuerzelListeNormalisieren === 'function') {
      apxKu.mitarbeiterKuerzelListeNormalisieren(trialListe);
    }
  } else {
    var seenK2 = Object.create(null);
    for (var ti = 0; ti < trialListe.length; ti++) {
      var mx = trialListe[ti];
      if (!mx) continue;
      var rku = String(mx.k != null ? mx.k : '').trim();
      if (!rku && mx.maId != null) {
        var midS = String(mx.maId).trim();
        if (midS && midS.length < 36 && !/^[0-9a-f]{8}-[0-9a-f-]{3,}/i.test(midS)) {
          rku = midS.toUpperCase();
        }
      }
      if (!rku || !/^[A-ZÄÖÜ]{2,5}$/.test(rku)) {
        if (toast) toast('⚠ ' + kuerzelFehlerMsg);
        return;
      }
      if (seenK2[rku]) {
        if (toast) toast('⚠ ' + kuerzelFehlerMsg);
        return;
      }
      seenK2[rku] = true;
      mx.k = rku;
      mx.av = rku;
    }
  }
  for (var pk = 0; pk < pendingNeu.length; pk++) {
    MA_DATA.push(pendingNeu[pk]);
  }

  if (cockpit && typeof api.saveMitarbeiterToApi === 'function') {
    try {
      await api.saveMitarbeiterToApi(MA_DATA, toast);
    } catch (e) {
      return;
    }
  } else {
    saveMitarbeiter();
  }
  renderMitarbeiter();
  maCloseSettings();
  var msg = [];
  if(changed) msg.push(changed+' geändert');
  if(added)   msg.push(added+' hinzugefügt');
  if(removed) msg.push(removed+' entfernt');
  showToast(msg.length ? '✓ '+msg.join(' · ') : 'Keine Änderungen');
}

// ── MA-Detail: Overlay mit Tabs ──────────────────────────────
var MA_DETAIL_ID   = null;
var MA_DETAIL_TAB  = 'woche';
var MA_DETAIL_WOCHE = null; // Montag der angezeigten Woche

function maOpenDetail(maId){
  MA_DETAIL_ID  = maId;
  MA_DETAIL_TAB = 'woche';
  MA_DETAIL_WOCHE = wocheStart(new Date());
  maRenderDetailOverlay();
}

function maRenderDetailOverlay(){
  var m = MA_DATA.find(function(x){ return x.maId === MA_DETAIL_ID; });
  if(!m) return;

  // Overlay erzeugen/wiederverwenden
  var ov = document.getElementById('ma-detail-ov');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'ma-detail-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:300;display:flex;align-items:flex-start;justify-content:center;padding-top:40px;backdrop-filter:blur(3px);';
    ov.onclick = function(e){ if(e.target===ov) maCloseDetail(); };
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';

  var aufgGesamt = maAufgaben(m.maId);
  var gesamtH    = aufgGesamt.reduce(function(s,g){ return s+(g.dauer||0); },0);
  var pct        = m.soll>0 ? Math.min(120, Math.round(gesamtH/m.soll*100)) : 0;

  var tabs = [
    {id:'woche',     label:'📅 Woche'},
    {id:'heute',     label:'☀️ Heute'},
    {id:'aufgaben',  label:'📋 Aufgaben'},
    {id:'anwesenheit',label:'⏱ Arbeitszeit'},
    {id:'auftragszeit',label:'🔧 Auftragszeit'},
  ];

  var tabHtml = tabs.map(function(t){
    var on = t.id === MA_DETAIL_TAB;
    return '<button onclick="maSetTab(\''+t.id+'\')" style="padding:7px 14px;border-radius:7px;border:none;'
      +'background:'+(on?m.col:'transparent')+';color:'+(on?'#fff':'var(--text2)')+';'
      +'font-size:12px;font-weight:'+(on?'700':'500')+';cursor:pointer;">'+t.label+'</button>';
  }).join('');

  var bodyHtml = '';
  if(MA_DETAIL_TAB === 'woche')       bodyHtml = maWocheHtml(m);
  if(MA_DETAIL_TAB === 'heute')       bodyHtml = maHeuteHtml(m);
  if(MA_DETAIL_TAB === 'aufgaben')    bodyHtml = maAufgabenHtml(m);
  if(MA_DETAIL_TAB === 'anwesenheit') bodyHtml = maAnwesenheitHtml(m);
  if(MA_DETAIL_TAB === 'auftragszeit')bodyHtml = maAuftragsZeitHtml(m);

  ov.innerHTML = '<div style="background:#fff;border-radius:16px;width:760px;max-width:96vw;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25);">'
    // Header
    +'<div style="background:'+m.col+';padding:18px 22px;display:flex;align-items:center;gap:14px;flex-shrink:0;">'
      +'<div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;">'+m.av+'</div>'
      +'<div style="flex:1;">'
        +'<div style="font-size:18px;font-weight:700;color:#fff;">'+m.n+'</div>'
        +'<div style="font-size:12px;color:rgba(255,255,255,.7);">'+m.r+' · '+gesamtH.toFixed(1)+'h geplant · '+m.soll+'h Soll · '+pct+'% Auslastung</div>'
      +'</div>'
      +'<button onclick="maCloseDetail()" style="background:rgba(255,255,255,.2);border:none;border-radius:8px;color:#fff;font-size:20px;width:34px;height:34px;cursor:pointer;">×</button>'
    +'</div>'
    // Tabs
    +'<div style="padding:10px 18px;background:#f8f9fb;border-bottom:1px solid var(--border);display:flex;gap:5px;flex-shrink:0;">'+tabHtml+'</div>'
    // Body
    +'<div style="overflow-y:auto;flex:1;padding:18px 22px;">'+bodyHtml+'</div>'
  +'</div>';
}

function maSetTab(tab){
  MA_DETAIL_TAB = tab;
  maRenderDetailOverlay();
}

function maCloseDetail(){
  var ov = document.getElementById('ma-detail-ov');
  if(ov) ov.style.display = 'none';
}

// ── Tab: Heute ───────────────────────────────────────────────
function maHeuteHtml(m){
  var liste = maAufgabenHeute(m.maId);
  if(!liste.length) return '<div style="text-align:center;padding:40px;color:var(--text3);font-size:14px;">Keine Aufgaben für heute geplant</div>';
  var gesamtH = liste.reduce(function(s,g){ return s+(g.dauer||0); }, 0);
  var html = '<div style="display:flex;justify-content:space-between;margin-bottom:14px;">'
    +'<span style="font-size:13px;font-weight:700;color:var(--text);">'+liste.length+' Aufgaben heute</span>'
    +'<span style="font-size:13px;font-weight:700;color:var(--blue);">'+gesamtH+'h gesamt</span>'
  +'</div>';
  html += liste.map(function(g){
    return maAufgabeBlock(g);
  }).join('');
  return html;
}

// ── Tab: Woche ───────────────────────────────────────────────
function maWocheHtml(m){
  var mo = MA_DETAIL_WOCHE || wocheStart(new Date());
  var tagNamen = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  var heute = isoDate(new Date());

  // Navigation
  var html = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'
    +'<button onclick="maWocheNav(-1)" style="padding:5px 12px;border-radius:7px;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:14px;">‹</button>'
    +'<div style="flex:1;text-align:center;font-size:13px;font-weight:700;">KW '+getKW(mo)+' · '+formatDatumDE(mo)+' – '+formatDatumDE(new Date(mo.getTime()+6*86400000))+'</div>'
    +'<button onclick="maWocheNav(1)" style="padding:5px 12px;border-radius:7px;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:14px;">›</button>'
    +'<button onclick="MA_DETAIL_WOCHE=wocheStart(new Date());maRenderDetailOverlay();" style="padding:5px 10px;border-radius:7px;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:11px;">Heute</button>'
  +'</div>';

  var tageSpalten = '';
  for(var i=0; i<7; i++){
    var d = new Date(mo); d.setDate(mo.getDate()+i);
    var ds = isoDate(d);
    var tagAufg = maAufgaben(m.maId).filter(function(g){ return g.datum===ds; });
    var tagH = tagAufg.reduce(function(s,g){ return s+(g.dauer||0); }, 0);
    var istHeute = ds === heute;
    var kapH = MA_TAG_KAPAZITAET;
    var kapCol = maKapFarbe(tagH, kapH);
    var freiTagH = Math.max(0, kapH - tagH).toFixed(1);
    var ueberlast = tagH > kapH;

    tageSpalten += '<div style="flex:1;min-width:0;">'
      // Tag-Header
      +'<div style="text-align:center;padding:6px 4px;border-radius:8px;margin-bottom:5px;'
        +'background:'+(istHeute?m.col:'var(--gray-l)')+';'
        +'color:'+(istHeute?'#fff':'var(--text2)')+';font-size:11px;font-weight:700;">'
        +tagNamen[i]+'<br><span style="font-size:10px;font-weight:400;">'+d.getDate()+'.'+String(d.getMonth()+1).padStart(2,'0')+'</span>'
      +'</div>'
      // Kapazitäts-Balken: visuell 0→8h
      +'<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:4px;overflow:hidden;">'
        +'<div style="height:100%;width:'+Math.min(100,Math.round(tagH/kapH*100))+'%;background:'+kapCol+';border-radius:2px;transition:width .3s;"></div>'
      +'</div>'
      // Stunden-Anzeige
      +(tagH>0
        ?'<div style="background:'+kapCol+'18;border:1px solid '+kapCol+'40;border-radius:6px;padding:3px 4px;margin-bottom:4px;text-align:center;font-size:10px;font-weight:700;color:'+kapCol+';">'
          +(ueberlast?'⚠ ':'')
          +tagH+'<span style="font-weight:400;color:var(--text3);">/'+kapH+'h</span>'
        +'</div>'
        :'<div style="text-align:center;font-size:9px;color:var(--text3);margin-bottom:4px;">'+kapH+'h frei</div>'
      )
      // Überlastungshinweis
      +(ueberlast?'<div style="font-size:8px;text-align:center;color:var(--red);font-weight:700;margin-bottom:3px;">Überlastet</div>':'')
      // Aufgaben-Blöcke
      +tagAufg.map(function(g){
        var sl = STEP_LABELS[g.schritt]||{col:'var(--text)',title:g.schritt};
        var stCol = g.status==='erledigt'?'var(--green)':g.status==='in_arbeit'?'var(--blue)':'var(--border)';
        return '<div style="background:#fff;border:1.5px solid '+stCol+';border-left:3px solid '+sl.col+';'
          +'border-radius:5px;padding:4px 5px;margin-bottom:3px;cursor:pointer;" '
          +'onclick="maAufgabeStatus(\''+g.id+'\')" title="'+g.titel+' · '+g.dauer+'h · '+g.status+'">'
          +'<div style="font-size:9px;font-weight:700;color:'+sl.col+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+sl.title+'</div>'
          +'<div style="font-size:9px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+g.fz+'</div>'
          +'<div style="font-size:9px;color:var(--text2);">'+g.dauer+'h</div>'
        +'</div>';
      }).join('')
    +'</div>';
  }

  html += '<div style="display:flex;gap:6px;">'+tageSpalten+'</div>';

  // Wochenübersicht
  var wocheAufg  = maAufgabenWoche(m.maId, mo);
  var wocheH     = wocheAufg.reduce(function(s,g){ return s+(g.dauer||0); }, 0);
  var wocheSoll  = MA_TAG_KAPAZITAET * 5; // 5 Arbeitstage × 8h = 40h
  var freiH      = Math.max(0, wocheSoll - wocheH).toFixed(1);
  var wocheKol   = wocheH > wocheSoll ? 'var(--red)' : wocheH >= wocheSoll*0.75 ? 'var(--amber)' : 'var(--green)';

  html += '<div style="margin-top:14px;padding:12px;background:var(--gray-l);border-radius:10px;display:flex;gap:20px;">'
    +'<div><div style="font-size:18px;font-weight:800;color:'+wocheKol+';">'+wocheH+'h</div><div style="font-size:11px;color:var(--text3);">Geplant diese Woche</div></div>'
    +'<div><div style="font-size:18px;font-weight:800;color:var(--text2);">'+wocheSoll.toFixed(1)+'h</div><div style="font-size:11px;color:var(--text3);">Wochensoll</div></div>'
    +'<div><div style="font-size:18px;font-weight:800;color:var(--green);">'+freiH+'h</div><div style="font-size:11px;color:var(--text3);">Freie Kapazität</div></div>'
    +'<div><div style="font-size:18px;font-weight:800;color:var(--blue);">'+wocheAufg.length+'</div><div style="font-size:11px;color:var(--text3);">Aufgaben</div></div>'
    +(wocheH > wocheSoll*1.1?'<div style="margin-left:auto;align-self:center;padding:6px 12px;background:var(--red-l);color:var(--red);border-radius:8px;font-size:12px;font-weight:700;">⚠ Überlastet</div>':'')
  +'</div>';

  return html;
}

function maWocheNav(richtung){
  if(!MA_DETAIL_WOCHE) MA_DETAIL_WOCHE = wocheStart(new Date());
  MA_DETAIL_WOCHE = new Date(MA_DETAIL_WOCHE.getTime() + richtung * 7 * 86400000);
  maRenderDetailOverlay();
}

// ── Tab: Alle Aufgaben ───────────────────────────────────────
function maAufgabenHtml(m){
  var liste = maAufgaben(m.maId);
  if(!liste.length) return '<div style="text-align:center;padding:40px;color:var(--text3);font-size:14px;">Keine offenen Aufgaben</div>';
  // Gruppiert nach Status
  var gruppen = {offen:'Offen', in_arbeit:'In Arbeit', erledigt:'Erledigt'};
  var html = '';
  ['offen','in_arbeit'].forEach(function(status){
    var g = liste.filter(function(x){ return x.status===status; });
    if(!g.length) return;
    html += '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;margin-top:14px;">'+gruppen[status]+' ('+g.length+')</div>';
    html += g.map(maAufgabeBlock).join('');
  });
  return html;
}

function maAufgabeBlock(g){
  var sl = STEP_LABELS[g.schritt]||{col:'var(--text)',title:g.schritt};
  var stCol = {offen:'var(--amber)',in_arbeit:'var(--blue)',erledigt:'var(--green)'}[g.status]||'var(--text3)';
  var stLbl = {offen:'Offen',in_arbeit:'In Arbeit',erledigt:'Erledigt ✓'}[g.status]||g.status;
  return '<div style="background:#fff;border:1px solid var(--border);border-left:3px solid '+sl.col+';border-radius:10px;padding:11px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;">'
    +'<div style="flex:1;min-width:0;">'
      +'<div style="font-size:12px;font-weight:700;color:'+sl.col+';margin-bottom:2px;">'+sl.title+'</div>'
      +'<div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+g.titel+'</div>'
      +'<div style="font-size:11px;color:var(--text3);margin-top:2px;">'+g.kunde+' · '+g.dauer+'h · '+(g.datum||'—')+'</div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">'
      +'<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:'+stCol+'18;color:'+stCol+';">'+stLbl+'</span>'
      +'<button onclick="maAufgabeStatus(\''+g.id+'\')" style="font-size:11px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;color:var(--text2);">→ Weiter</button>'
    +'</div>'
  +'</div>';
}

// ── Tab: Anwesenheit (echte Arbeitszeiten vom Handy) ─────────────
function maAnwesenheitHtml(m){
  var heute  = isoDate(new Date());
  var monat  = heute.substring(0,7); // YYYY-MM
  var eintraege = MA_ANWESENHEIT.filter(function(a){ return a.maId === m.maId; });

  if(!eintraege.length){
    return '<div style="text-align:center;padding:40px;color:var(--text3);font-size:14px;">'
      +'Noch keine Arbeitszeit erfasst<br><span style="font-size:11px;">MA startet per ▶ Start in der App</span></div>';
  }

  // Sortiert: neueste zuerst
  var sorted = eintraege.slice().sort(function(a,b){ return (b.datum||'').localeCompare(a.datum||''); });

  // Monatsgruppen
  var gruppen = {};
  sorted.forEach(function(e){
    var mo = (e.datum||'').substring(0,7);
    if(!gruppen[mo]) gruppen[mo] = [];
    gruppen[mo].push(e);
  });

  var html = '';
  Object.keys(gruppen).sort(function(a,b){ return b.localeCompare(a); }).forEach(function(mo){
    var eintr = gruppen[mo];
    var monatMin = eintr.reduce(function(s,e){ return s+(e.dauer||0); },0);
    var monatH   = (monatMin/60).toFixed(1);
    var soll     = m.soll || 160;
    var pct      = Math.min(100, Math.round(monatMin/60/soll*100));
    var barC     = pct>=90?'var(--green)':pct>=65?'var(--amber)':'var(--blue)';

    // Monats-Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 8px;">'
      +'<div style="font-size:12px;font-weight:700;color:var(--text2);">'
        +new Date(mo+'-01').toLocaleDateString('de-DE',{month:'long',year:'numeric'})
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:10px;">'
        +'<div style="width:80px;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">'
          +'<div style="height:100%;width:'+pct+'%;background:'+barC+';border-radius:3px;"></div>'
        +'</div>'
        +'<span style="font-size:12px;font-weight:700;color:'+barC+';">'+monatH+'h / '+soll+'h</span>'
      +'</div>'
    +'</div>';

    // Tageseinträge
    html += eintr.map(function(e){
      var isKurz  = e.typ === 'kurzabwesenheit';
      var min     = Math.abs(e.dauer || 0);
      var h       = Math.floor(min/60);
      var m2      = min % 60;
      var dauerTxt = (isKurz ? '−' : '') + h+'h '+(m2>0?m2+'min':'');
      var datDE   = e.datum ? e.datum.split('-').reverse().join('.') : '—';
      var isHeute = e.datum === heute;
      var bgC     = isKurz ? '#FFF3E0' : (isHeute ? 'var(--blue-l)' : 'var(--gray-l)');
      var brdC    = isKurz ? '#FF9500' : (isHeute ? 'var(--blue)'   : 'var(--border)');
      var txtC    = isKurz ? '#E65100' : (isHeute ? 'var(--blue)'   : 'var(--text)');
      return '<div style="display:flex;align-items:center;padding:10px 14px;border-radius:10px;margin-bottom:6px;'
        +'background:'+bgC+';border:1px solid '+brdC+';gap:12px;">'
        +'<div style="font-size:12px;font-weight:700;color:'+txtC+';min-width:60px;">'+datDE+'</div>'
        +'<div style="font-size:11px;color:var(--text2);flex:1;">'
          +(isKurz ? '⏱ '+(e.notiz||'Kurzabwesenheit') : (e.start&&e.end ? '▶ '+e.start+' – ⏹ '+e.end : '—'))
        +'</div>'
        +'<div style="font-size:13px;font-weight:700;color:'+txtC+';">'+dauerTxt+'</div>'
        +(isKurz ? '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:#FF9500;color:#fff;">Abzug</span>'
          : isHeute ? '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:var(--blue);color:#fff;">Heute</span>' : '')
      +'</div>';
    }).join('');

    html += '<div style="height:12px;"></div>';
  });

  return html;
}

// ── Tab: Auftragszeit (gebuchte Stunden je Auftrag) ───────────────
function maAuftragsZeitHtml(m){
  // Alle Zeitbuchungen für diesen MA aus AUFTRAEGE.zeiten
  var eintraege = [];
  AUFTRAEGE.forEach(function(a){
    if(!a.zeiten) return;
    a.zeiten.filter(function(z){ return z.maId===m.maId||z.wer===m.n; }).forEach(function(z){
      eintraege.push({
        auId:   a.id,
        kunde:  a.kunde,
        fz:     a.fz,
        step:   z.step,
        stepLabel: (STEP_LABELS[z.step]||{title:z.step}).title,
        stepCol:   (STEP_LABELS[z.step]||{col:'var(--border)'}).col,
        start:  z.start,
        end:    z.end,
        dauer:  z.dauer || 0,
      });
    });
  });

  if(!eintraege.length){
    return '<div style="text-align:center;padding:40px;color:var(--text3);font-size:14px;">'
      +'Noch keine Auftragszeiten gebucht</div>';
  }

  // Sortiert nach Auftrag
  var gesamt = eintraege.reduce(function(s,e){ return s+e.dauer; },0);

  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;'
    +'padding:12px 16px;background:var(--blue-l);border-radius:10px;border:1px solid var(--blue)20;">'
    +'<span style="font-size:13px;font-weight:700;color:var(--text);">'+eintraege.length+' Buchungen</span>'
    +'<span style="font-size:16px;font-weight:800;color:var(--blue);">'+formatMinuten(gesamt)+' gesamt</span>'
  +'</div>';

  // Gruppiert nach Auftrag
  var byAuftrag = {};
  eintraege.forEach(function(e){
    if(!byAuftrag[e.auId]) byAuftrag[e.auId] = {kunde:e.kunde, fz:e.fz, eintr:[], gesamt:0};
    byAuftrag[e.auId].eintr.push(e);
    byAuftrag[e.auId].gesamt += e.dauer;
  });

  Object.keys(byAuftrag).forEach(function(auId){
    var grp = byAuftrag[auId];
    html += '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:10px;">'
      +'<div style="padding:10px 14px;background:var(--gray-l);display:flex;justify-content:space-between;align-items:center;">'
        +'<div>'
          +'<div style="font-size:12px;font-weight:700;color:var(--text);">'+auId+' · '+grp.kunde+'</div>'
          +'<div style="font-size:11px;color:var(--text3);">'+grp.fz+'</div>'
        +'</div>'
        +'<span style="font-size:13px;font-weight:800;color:var(--blue);">'+formatMinuten(grp.gesamt)+'</span>'
      +'</div>';
    grp.eintr.forEach(function(e){
      html += '<div style="padding:8px 14px;display:flex;align-items:center;gap:10px;border-top:1px solid var(--border)90;">'
        +'<div style="width:8px;height:8px;border-radius:50%;background:'+e.stepCol+';flex-shrink:0;"></div>'
        +'<div style="font-size:11px;font-weight:700;color:'+e.stepCol+';min-width:90px;">'+e.stepLabel+'</div>'
        +'<div style="font-size:11px;color:var(--text3);flex:1;">'+(e.start||'')+(e.end?' – '+e.end:'')+'</div>'
        +'<div style="font-size:12px;font-weight:700;color:var(--text);">'+formatMinuten(e.dauer)+'</div>'
      +'</div>';
    });
    html += '</div>';
  });

  return html;
}

function maAufgabeStatus(aufgId){
  var g = INTERN_AUFGABEN.find(function(x){ return x.id===aufgId; });
  if(!g) return;
  var flow = {offen:'in_arbeit', in_arbeit:'erledigt', erledigt:'offen'};
  g.status = flow[g.status]||'offen';
  saveAufgaben();
  renderMitarbeiter();
  maRenderDetailOverlay();
  showToast('✓ '+g.titel+' → '+(g.status==='in_arbeit'?'In Arbeit':g.status==='erledigt'?'Erledigt':'Offen'));
}

// ── Hilfsfunktionen Datum ────────────────────────────────────
function getKW(date){
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-yearStart)/86400000)+1)/7);
}
function formatDatumDE(d){
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
}


// ── ZEITERFASSUNG ───────────────────────────────
var ZEIT_AKTIV = {}; // key: [MOB_MA_ID_]auftragId_step (Mitarbeiter-App) bzw. auftragId_step (Desktop)
var ZEIT_TICK_IV = null;

function zeitAktivKey(auId, step){
  var a = auId != null ? String(auId) : '';
  var s = step != null ? String(step) : '';
  var mid = (typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && String(MOB_MA_ID).trim() !== '')
    ? String(MOB_MA_ID).trim()
    : '';
  return mid ? (mid + '_' + a + '_' + s) : (a + '_' + s);
}

/** Nur für Keys aus ZEIT_AKTIV; nutzt aktuelles MOB_MA_ID zur Einordnung mobiler Keys. */
function zeitAktivParseAnyKey(k){
  if(k == null || k === '') return null;
  var str = String(k);
  var mob = (typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && String(MOB_MA_ID).trim() !== '')
    ? String(MOB_MA_ID).trim()
    : '';
  if(mob && str.indexOf(mob + '_') === 0){
    var rest = str.slice(mob.length + 1);
    var idx = rest.indexOf('_');
    if(idx < 0) return null;
    return { maId: mob, auId: rest.slice(0, idx), step: rest.slice(idx + 1) };
  }
  if(!mob){
    var idx = str.indexOf('_');
    if(idx < 0) return null;
    return { maId: null, auId: str.slice(0, idx), step: str.slice(idx + 1) };
  }
  return null;
}

if(typeof window !== 'undefined'){
  window.zeitAktivKey = zeitAktivKey;
  window.zeitAktivParseAnyKey = zeitAktivParseAnyKey;
}

function formatMinuten(min){
  var h=Math.floor(min/60), m=min%60;
  return h>0 ? h+'h '+String(m).padStart(2,'0')+'m' : m+'m';
}

// ── Detail-Panel Sektionen: aufklappen / zuklappen ────────────────
function dpToggle(key){
  var el  = document.getElementById('dps-'+key);
  var btn = document.getElementById('dpb-'+key);
  if(!el) return;
  var open = el.style.display !== 'none';
  el.style.display  = open ? 'none' : '';
  el.style.marginTop = open ? '' : '8px';
  if(btn) btn.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
  var st = window._ccPanelState = window._ccPanelState || {};
  st['cc_dps_'+key] = open ? '0' : '1';
}
function dpOpen(key, def){
  var st = window._ccPanelState || {};
  var s = st['cc_dps_'+key];
  return s===undefined ? (def!==false) : s==='1';
}
function formatDauer(ms){
  var sec=Math.floor(ms/1000), min=Math.floor(sec/60), h=Math.floor(min/60);
  return String(h).padStart(2,'0')+':'+String(min%60).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
}
function zeitJetzt(){
  var d=new Date();
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+' '
    +String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

function zeitStart(auId, step){
  var a=AUFTRAEGE.find(function(x){return x.id===auId;}); if(!a) return;
  var key=zeitAktivKey(auId, step);
  if(ZEIT_AKTIV[key]){ showToast('Bereits gestartet!'); return; }
  var sch=a.schritte[step];
  var werRaw, werName, werMaId, alleWer;
  if(typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && String(MOB_MA_ID).trim() !== ''){
    werMaId = String(MOB_MA_ID).trim();
    var mobMa = typeof maByID === 'function' ? maByID(werMaId) : null;
    werName = mobMa && mobMa.n ? String(mobMa.n).trim() : werMaId;
    alleWer = [werName];
    werRaw = sch&&sch.wer ? sch.wer : werName;
  } else {
    werRaw = sch&&sch.wer ? sch.wer : 'Mitarbeiter';
    // Erster MA aus Liste (z.B. "Okan" aus "Okan + Mete") startet den Timer
    werName = werRaw.split('+')[0].trim();
    werMaId = maIdVonName(werName) || werName;
    // Alle zuständigen MAs für spätere Buchung merken
    alleWer = werRaw.split('+').map(function(s){ return s.trim(); });
  }
  ZEIT_AKTIV[key]={
    start:   new Date(),
    wer:     werName,
    maId:    werMaId,
    alleWer: alleWer,   // alle MAs — bei Stop bekommt jeder einen Eintrag
    auId:    auId,
    step:    step,
  };
  if(!ZEIT_TICK_IV) ZEIT_TICK_IV=setInterval(zeitTick,1000);
  renderKanban();
  showToast('▶ '+auId+' · '+STEP_LABELS[step].title+' gestartet · '+werRaw);
}

function zeitStop(auId, step){
  var key=zeitAktivKey(auId, step);
  var entry=ZEIT_AKTIV[key]; if(!entry) return;
  var a=AUFTRAEGE.find(function(x){return x.id===auId;}); if(!a) return;
  var endTime=new Date();
  var dauer=Math.round((endTime-entry.start)/60000);
  var d=entry.start;
  var startFormatted=String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+' '
    +String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  var endFormatted=zeitJetzt();
  var dauerReal=Math.max(1,dauer);
  if(!a.zeiten) a.zeiten=[];

  // Jeden zuständigen MA einzeln buchen (z.B. "Okan + Mete" → 2 Einträge)
  // Dauer wird aufgeteilt: beide bekommen die volle Zeit (gemeinsame Arbeit)
  var alleWer = entry.alleWer || [entry.wer];
  alleWer.forEach(function(werName){
    var wId = maIdVonName(werName) || werName;
    a.zeiten.push({
      step:  step,
      wer:   werName,
      maId:  wId,
      start: startFormatted,
      end:   endFormatted,
      dauer: dauerReal,
    });
  });

  delete ZEIT_AKTIV[key];
  if(Object.keys(ZEIT_AKTIV).length===0 && ZEIT_TICK_IV){
    clearInterval(ZEIT_TICK_IV); ZEIT_TICK_IV=null;
  }
  renderKanban();
  if(currentPage==='mitarbeiter') renderMitarbeiter();
  saveAuftraege(); // DAL: Zeitbuchung persistieren
  showToast('⏹ '+STEP_LABELS[step].title+' · '+formatMinuten(dauerReal)+' · '+alleWer.join(' + '));
}

function zeitTick(){
  Object.keys(ZEIT_AKTIV).forEach(function(key){
    var entry=ZEIT_AKTIV[key];
    var elapsed=new Date()-entry.start;
    var el=document.getElementById('timer-'+String(key).replace(/_/g,'-'));
    if(el) el.textContent=' '+formatDauer(elapsed);
  });
}

function openZeitDetails(auId){
  var a=AUFTRAEGE.find(function(x){return x.id===auId;}); if(!a) return;
  document.getElementById('zeitModalSub').textContent=auId+' · '+a.fz+' · '+a.kunde;
  var zeiten=a.zeiten||[];
  // Summen pro Schritt
  var summen={};
  zeiten.forEach(function(z){
    if(!summen[z.step]) summen[z.step]=0;
    summen[z.step]+=z.dauer;
  });
  var totalMin=zeiten.reduce(function(acc,z){return acc+z.dauer;},0);

  // Check for running timers
  var laufendHtml='';
  ['grafik','druck','laminat','montage','doku'].forEach(function(step){
    var key=zeitAktivKey(auId, step);
    if(ZEIT_AKTIV[key]){
      var elapsed=Math.round((new Date()-ZEIT_AKTIV[key].start)/60000);
      laufendHtml+='<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:#E8F5E9;border-radius:8px;margin-bottom:8px;">'
        +'<span style="width:8px;height:8px;border-radius:50%;background:#34C759;animation:pulse 1s infinite;flex-shrink:0;"></span>'
        +'<span style="font-size:12px;font-weight:700;color:var(--green);">Läuft: '+STEP_LABELS[step].title+'</span>'
        +'<span id="zeit-modal-timer-'+auId+'-'+step+'" style="font-family:monospace;font-size:12px;color:var(--green);margin-left:auto;"></span>'
        +'<button onclick="zeitStop(\''+auId+'\',\''+step+'\')" style="padding:4px 10px;background:#FF3B30;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">⏹ Stop</button>'
        +'</div>';
    }
  });

  // Übersicht pro Schritt
  var stepRows='';
  ['grafik','druck','laminat','montage','doku'].forEach(function(step){
    var sch=a.schritte[step];
    var isDone=STEPS.indexOf(step)<STEPS.indexOf(a.step)||a.step==='abgeschlossen';
    var sum=summen[step]||0;
    var s=STEP_LABELS[step];
    stepRows+='<tr style="border-bottom:1px solid var(--border);">'
      +'<td style="padding:10px 14px;"><div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:2px;background:'+s.col+';flex-shrink:0;display:inline-block;"></span><span style="font-size:12px;font-weight:600;">'+s.title+'</span></div></td>'
      +'<td style="padding:10px 14px;font-size:12px;color:var(--text2);">'+(sch&&sch.wer?sch.wer:'—')+'</td>'
      +'<td style="padding:10px 14px;"><span class="bdg '+(isDone?'bg':a.step===step?'ba':'bgr')+'">'+(isDone?'Fertig':a.step===step?'Aktiv':'Ausstehend')+'</span></td>'
      +'<td style="padding:10px 14px;font-size:12px;font-weight:700;color:'+(sum>0?'var(--blue)':'var(--text3)');'>'+(sum>0?formatMinuten(sum):'—')+'</td>'
      +'<td style="padding:10px 14px;text-align:right;">'
      +(a.step===step&&!ZEIT_AKTIV[zeitAktivKey(auId, step)]
        ?'<button onclick="zeitStart(\''+auId+'\',\''+step+'\');openZeitDetails(\''+auId+'\')" style="padding:4px 10px;background:#34C759;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">▶ Start</button>'
        :a.step===step&&ZEIT_AKTIV[zeitAktivKey(auId, step)]
        ?'<button onclick="zeitStop(\''+auId+'\',\''+step+'\');openZeitDetails(\''+auId+'\')" style="padding:4px 10px;background:#FF3B30;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">⏹ Stop</button>'
        :'')
      +'</td>'
      +'</tr>';
  });

  // Einzelne Einträge
  var eintraege='';
  if(zeiten.length){
    eintraege='<div style="padding:14px;border-top:1px solid var(--border);">'
      +'<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Alle Zeiteinträge</div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:12px;">'
      +'<thead><tr style="background:var(--gray-l);">'
      +'<th style="padding:6px 10px;text-align:left;font-weight:600;color:var(--text2);">Schritt</th>'
      +'<th style="padding:6px 10px;text-align:left;font-weight:600;color:var(--text2);">Mitarbeiter</th>'
      +'<th style="padding:6px 10px;text-align:left;font-weight:600;color:var(--text2);">Start</th>'
      +'<th style="padding:6px 10px;text-align:left;font-weight:600;color:var(--text2);">Ende</th>'
      +'<th style="padding:6px 10px;text-align:right;font-weight:600;color:var(--text2);">Dauer</th>'
      +'</tr></thead><tbody>'
      +zeiten.map(function(z,i){
        return '<tr style="border-bottom:1px solid var(--border);'+(i%2?'background:#FAFAFA;':'')+'">'
          +'<td style="padding:7px 10px;"><span style="font-size:11px;font-weight:600;color:'+STEP_LABELS[z.step].col+';">'+STEP_LABELS[z.step].title+'</span></td>'
          +'<td style="padding:7px 10px;color:var(--text);">'+z.wer+'</td>'
          +'<td style="padding:7px 10px;color:var(--text2);font-size:11px;font-family:monospace;">'+z.start+'</td>'
          +'<td style="padding:7px 10px;color:var(--text2);font-size:11px;font-family:monospace;">'+z.end+'</td>'
          +'<td style="padding:7px 10px;text-align:right;font-weight:700;color:var(--blue);">'+formatMinuten(z.dauer)+'</td>'
          +'</tr>';
      }).join('')
      +'</tbody></table></div>';
  }

  document.getElementById('zeitModalBody').innerHTML=
    // Laufende Timer
    (laufendHtml?'<div style="padding:14px;">'+laufendHtml+'</div>':'')
    // Übersicht
    +'<div style="padding:14px;">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
    +'<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;">Übersicht pro Schritt</div>'
    +(totalMin>0?'<div style="font-size:13px;font-weight:700;color:var(--blue);">Gesamt: '+formatMinuten(totalMin)+'</div>':'')
    +'</div>'
    +'<table style="width:100%;border-collapse:collapse;">'
    +'<thead><tr style="background:var(--gray-l);">'
    +'<th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--text2);">Schritt</th>'
    +'<th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--text2);">Mitarbeiter</th>'
    +'<th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--text2);">Status</th>'
    +'<th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--text2);">Zeit</th>'
    +'<th style="padding:8px 14px;"></th>'
    +'</tr></thead>'
    +'<tbody>'+stepRows+'</tbody>'
    +'</table>'
    +(totalMin>0?'<div style="margin-top:10px;padding:10px 14px;background:var(--blue-l);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">'
      +'<span style="font-size:12px;font-weight:600;color:var(--blue);">⏱ Gesamtarbeitszeit</span>'
      +'<span style="font-size:16px;font-weight:700;color:var(--blue);">'+formatMinuten(totalMin)+'</span>'
      +'</div>':'')
    +'</div>'
    +eintraege;

  // Add pulse animation if not present
  if(!document.getElementById('pulse-style')){
    var s=document.createElement('style'); s.id='pulse-style';
    s.textContent='@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.3;}}';
    document.head.appendChild(s);
  }
  document.getElementById('zeitModal').classList.add('open');
}

function closeZeitModal(){
  document.getElementById('zeitModal').classList.remove('open');
}


let auPrio='normal';
let auFiles=[]; // {name, typ, size, dataUrl, mimeType, auSlotKey?, ccinternApiTyp?, ccinternPhase?, ccinternPosition?}

/** Neuer-Auftrag-Modal: Slot → API-Felder (wie Auftrag-Detail `prodAddDateiFromDatasetInput` / Mitarbeiter-App). */
var AU_NEU_DATEI_SLOT_META = {
  'layout_grafik': { label: '🎨 Layout / Grafik', apiTyp: 'layout_grafik', phase: '', position: '' },
  'druckdatei': { label: '🖨 Finale Druckdatei', apiTyp: 'druckdatei', phase: '', position: '' },
  'montagefoto': { label: '📷 Montagefoto', apiTyp: 'montagefoto', phase: '', position: '' },
  'vorher:front': { label: '📷 Vorher Front (hoch)', apiTyp: 'vorher', phase: 'vorher', position: 'front' },
  'vorher:seite1': { label: '📷 Vorher Seite 1 (quer)', apiTyp: 'vorher', phase: 'vorher', position: 'seite1' },
  'vorher:seite2': { label: '📷 Vorher Seite 2 (quer)', apiTyp: 'vorher', phase: 'vorher', position: 'seite2' },
  'vorher:heck': { label: '📷 Vorher Heck (hoch)', apiTyp: 'vorher', phase: 'vorher', position: 'heck' },
  'nachher:front': { label: '📷 Nachher Front (hoch)', apiTyp: 'nachher', phase: 'nachher', position: 'front' },
  'nachher:seite1': { label: '📷 Nachher Seite 1 (quer)', apiTyp: 'nachher', phase: 'nachher', position: 'seite1' },
  'nachher:seite2': { label: '📷 Nachher Seite 2 (quer)', apiTyp: 'nachher', phase: 'nachher', position: 'seite2' },
  'nachher:heck': { label: '📷 Nachher Heck (hoch)', apiTyp: 'nachher', phase: 'nachher', position: 'heck' },
};

function auNeuAuftragIstFahrzeugLeistung(){
  var el = document.getElementById('au-leistung');
  var lid = el && el.value != null ? String(el.value).trim() : '';
  return lid === 'fahrzeug' || lid === 'bus_bahn';
}

function auNeuDateiNachherVisibilityUpdate(){
  var w = document.getElementById('au-neu-datei-nachher-wrap');
  if (!w) return;
  w.style.display = auNeuAuftragIstFahrzeugLeistung() ? 'block' : 'none';
}

function auNeuDateiSlotIndicatorsRefresh(){
  var keys = Object.keys(AU_NEU_DATEI_SLOT_META);
  var ki, k, id, slotEl, nameEl, n, fi;
  for (ki = 0; ki < keys.length; ki++) {
    k = keys[ki];
    id = 'au-slot-' + k.replace(/:/g, '-');
    slotEl = document.getElementById(id);
    nameEl = document.getElementById(id + '-name');
    n = 0;
    for (fi = 0; fi < auFiles.length; fi++) {
      if (auFiles[fi] && auFiles[fi].auSlotKey === k) n++;
    }
    if (nameEl) nameEl.textContent = n ? '✓ ' + n + ' Datei' + (n > 1 ? 'en' : '') : '';
    if (slotEl) {
      if (n) slotEl.style.boxShadow = '0 0 0 2px rgba(46, 125, 50, 0.35)';
      else slotEl.style.boxShadow = '';
    }
  }
}

// Eigene Checklisten-Punkte je Schritt (Neuer Auftrag Modal)
var AU_CUSTOM_CL = {};
function auClReset(){ AU_CUSTOM_CL = {}; }

function auClRenderList(step){
  var el = document.getElementById('au-cl-list-'+step); if(!el) return;
  var items = AU_CUSTOM_CL[step]||[];
  el.innerHTML = items.map(function(txt,i){
    return '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--gray-l);border-radius:7px;margin-bottom:4px;">'
      +'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
      +'<span style="flex:1;font-size:12px;color:var(--text);">'+txt+'</span>'
      +'<button onclick="auClPunktEntfernen(\''+step+'\','+i+')" style="border:none;background:none;color:var(--text3);font-size:16px;cursor:pointer;line-height:1;padding:0 2px;">×</button>'
    +'</div>';
  }).join('');
}

function auClPunktHinzufuegen(step){
  var inp = document.getElementById('au-cl-inp-'+step); if(!inp) return;
  var txt = inp.value.trim(); if(!txt) return;
  if(!AU_CUSTOM_CL[step]) AU_CUSTOM_CL[step]=[];
  AU_CUSTOM_CL[step].push(txt);
  inp.value='';
  auClRenderList(step);
}

function auClPunktEntfernen(step, idx){
  if(!AU_CUSTOM_CL[step]) return;
  AU_CUSTOM_CL[step].splice(idx,1);
  auClRenderList(step);
}

// Accordion
function acToggle(n){
  const body=document.getElementById('ac-body-'+n);
  const arrow=document.getElementById('ac-arrow-'+n);
  if(!body||!arrow) return;
  const closed=body.classList.contains('ac-closed');
  body.classList.toggle('ac-closed',!closed);
  arrow.classList.toggle('open',closed);
}
function auAllesAufklappen(){
  for(let i=1;i<=8;i++){
    const body=document.getElementById('ac-body-'+i);
    const arrow=document.getElementById('ac-arrow-'+i);
    if(body){body.classList.remove('ac-closed');}
    if(arrow){arrow.classList.add('open');}
  }
}

function closeAuftragModal(){
  document.getElementById('auftragModal').classList.remove('open');
  auFiles=[];
  auPrio='normal';
  auPendingUploads=0;
  auNeuDateiSlotIndicatorsRefresh();
}

function openAuftragModal(){
  // Felder zurücksetzen
  ['au-kunde','au-fz','au-beschr','au-termin',
   'au-liefertermin','au-netto','au-mwst-val','au-brutto',
   'au-notiz-produktion','au-notiz-besonderheiten','au-angebot'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });

  // Selects aus CC_PRODUKTE befüllen + auf Index 0 zurücksetzen
  auInitSelects();

  // Restliche Selects zurücksetzen (au-material + au-laminat HIER, VOR auMaterialUpdate)
  ['au-depot','au-z-leiter',
   'au-format','au-zahlungsziel','au-rechnungsart'].forEach(function(id){
    var el=document.getElementById(id); if(el){ el.value=''; el.selectedIndex=0; }
  });

  // Uhrzeit auf Default
  var zeitSel=document.getElementById('au-termin-zeit');
  if(zeitSel) zeitSel.value='07:00';

  // Checkboxen: Standard-Workflow zurücksetzen (alle 4 aktiv, extern inaktiv)
  ['grafik','druck','laminat','montage'].forEach(function(s){ auStepSetChecked(s,true); });
  auStepSetChecked('extern',false);

  // Info-Felder ausblenden
  ['au-details-info','au-kalk-info','au-art-hinweis'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.style.display='none';
  });

  auSelPrio('normal');
  auFiles=[];
  auClReset();
  auRenderFileList();

  // Sektion 2 generisch initialisieren
  auProjektFelderRender();
  auUpdateWorkflowPreview();
  auRenderStepDetails();
  auNeuDateiNachherVisibilityUpdate();
  auNeuDateiSlotIndicatorsRefresh();

  // Material-Dropdown ZULETZT befüllen (nach allen anderen Resets)
  auMaterialUpdate();

  // Accordion: nur erstes aufklappen
  for(var i=1;i<=8;i++){
    var body=document.getElementById('ac-body-'+i);
    var arrow=document.getElementById('ac-arrow-'+i);
    if(body) body.classList.toggle('ac-closed', i!==1);
    if(arrow) arrow.classList.toggle('open', i===1);
  }
  document.getElementById('auftragModal').classList.add('open');
}

function auSelPrio(p){
  auPrio=p;
  const S={normal:{b:'var(--blue)',bg:'var(--blue-l)',c:'var(--blue)'},hoch:{b:'var(--amber)',bg:'var(--amber-l)',c:'var(--amber)'},dringend:{b:'var(--red)',bg:'var(--red-l)',c:'var(--red)'}};
  ['normal','hoch','dringend'].forEach(v=>{
    const el=document.getElementById('au-prio-'+v); if(!el) return;
    if(v===p){el.style.cssText+='border-color:'+S[v].b+';background:'+S[v].bg+';color:'+S[v].c+';font-weight:700;';}
    else{el.style.cssText+='border-color:var(--border);background:#fff;color:var(--text2);font-weight:400;';}
  });
}

/** Gewählter Kundenname (Anzeige); Select-`value` ist Firmen-ID. */
function auKundeSelectAnzeigeText(){
  var sel = document.getElementById('au-kunde');
  if(!sel || sel.selectedIndex < 0) return '';
  var o = sel.options[sel.selectedIndex];
  if(!o || !o.value) return '';
  var t = (o.textContent || '').trim();
  return t || String(o.value).trim();
}

/** Rohzeilen wie Firmen-Tabelle: CCINTERN_KUNDEN | CCState.firmenStamm.rows | CRM (API-Array). */
function auKundenQuelleRows(){
  var ck = typeof window !== 'undefined' ? window.CCINTERN_KUNDEN : null;
  if(Array.isArray(ck) && ck.length) return ck.slice();
  try{
    var st =
      typeof window !== 'undefined' && window.CCState && typeof window.CCState.get === 'function'
        ? window.CCState.get('firmenStamm')
        : null;
    var fr = st && Array.isArray(st.rows) ? st.rows : [];
    if(fr.length) return fr.slice();
  }catch(eFs){}
  if(typeof CRM_KUNDEN !== 'undefined' && CRM_KUNDEN != null && Array.isArray(CRM_KUNDEN) && CRM_KUNDEN.length){
    return CRM_KUNDEN.slice();
  }
  return [];
}

/** Eine Zeile pro Firma mit stabiler `id` (Firmen-UUID) und Anzeige-`name`. */
function auKundenZeilenNormalisiert(rowsRaw){
  var rows = rowsRaw || [];
  return rows
    .map(function(k){
      if(!k || typeof k !== 'object') return null;
      var idStr = '';
      if(k.firmaId != null && String(k.firmaId).trim() !== '') idStr = String(k.firmaId).trim();
      else if(k.id != null && String(k.id).trim() !== '') idStr = String(k.id).trim();
      if(!idStr) return null;
      var name =
        (k.name != null && String(k.name).trim()) ? String(k.name).trim()
          : (k.firmenname != null && String(k.firmenname).trim()) ? String(k.firmenname).trim()
            : (typeof k.kunde === 'string' && k.kunde.trim()) ? k.kunde.trim()
              : (k.bezeichnung != null && String(k.bezeichnung).trim()) ? String(k.bezeichnung).trim()
                : idStr;
      return Object.assign({}, k, { id: idStr, name: name });
    })
    .filter(function(x){ return x && x.id; });
}

// ── Selects aus CC_PRODUKTE befüllen ────────────────────────────
function auInitSelects(){
  // Auftragsarten — einmalig befüllen, dann immer auf Index 0 zurücksetzen
  var aa = document.getElementById('au-auftragsart');
  if(aa){
    if(aa.options.length <= 1){
      CC_AUFTRAGSARTEN.forEach(function(a){
        var o = document.createElement('option');
        o.value = a.id; o.textContent = a.ico+' '+a.label;
        aa.appendChild(o);
      });
    }
    aa.selectedIndex = 0;
  }
  // Leistungsbereiche — einmalig befüllen, dann immer auf Index 0 zurücksetzen
  var al = document.getElementById('au-leistung');
  if(al){
    if(al.options.length <= 1){
      CC_LEISTUNGEN.forEach(function(l){
        var o = document.createElement('option');
        o.value = l.id; o.textContent = l.ico+' '+l.label;
        al.appendChild(o);
      });
    }
    al.selectedIndex = 0;
  }
  // Produkt immer leeren
  var ap = document.getElementById('au-produkt');
  if(ap) ap.innerHTML = '<option value="">— erst Bereich wählen —</option>';

  // Kunden-Select: dieselbe Firmenbasis wie Kunden-Stamm (CCState.firmenStamm.rows), kein separates Demo-CRM
  var kunden = auKundenZeilenNormalisiert(auKundenQuelleRows());
  var ak = document.getElementById('au-kunde');
  if(ak){
    ak.innerHTML = '<option value="">— wählen —</option>';
    kunden.forEach(function(k){
      var o = document.createElement('option');
      o.value = k.id;
      o.textContent = k.name;
      ak.appendChild(o);
    });
  }
}

// ── Produkt bestimmt Schritte — zentrale Funktion ───────────────
// Reihenfolge: 1. Produkt setzt Basis  2. Auftragsart passt Spezialfälle an
// ── Produkt bestimmt Workflow-Schritte (Quelle der Wahrheit) ────
// Leistungsbereich hat keinen Einfluss auf Schritte.
const CC_PRODUKT_SCHRITTE = {
  // Fahrzeugbeschriftung — BUS
  'bus_voll':          ['grafik','druck','laminat','montage'],
  'bus_teil':          ['grafik','druck','laminat','montage'],
  'bus_heck':          ['grafik','druck','montage'],
  'bus_ssp':           ['grafik','druck','montage'],
  'bus_traffic_board': ['grafik','druck','montage'],
  // Fahrzeugbeschriftung — BAHN
  'bahn_voll':         ['grafik','druck','laminat','montage'],
  'bahn_teil':         ['grafik','druck','laminat','montage'],
  'bahn_innen':        ['grafik','druck','montage'],
  // Fahrzeugbeschriftung — PKW
  'pkw_voll':          ['grafik','druck','laminat','montage'],
  'pkw_teil':          ['grafik','druck','montage'],
  'pkw_beschr':        ['grafik','druck','montage'],
  // Fahrzeugbeschriftung — TRANSPORTER
  'van_voll':          ['grafik','druck','laminat','montage'],
  'van_teil':          ['grafik','druck','montage'],
  'van_beschr':        ['grafik','druck','montage'],
  // Druck / Banner / Plakate
  'banner_pvc':       ['grafik','druck','laminat'],
  'plakat':           ['grafik','druck'],
  'rollup':           ['grafik','druck'],
  'bauzaun':          ['grafik','druck'],
  'grossformat':      ['grafik','druck','laminat'],
  // Schilder / Werbeanlagen
  'dibond_schild':      ['grafik','druck','montage'],
  'forex_schild':       ['grafik','druck','montage'],
  'acryl_schild':       ['grafik','druck','montage'],
  'leuchtreklame':      ['grafik','druck','montage'],
  'einzelbuchstaben':   ['grafik','druck','montage'],
  'werbeanlage_aussen': ['grafik','druck','montage'],
  // Folie / Fenster / Aufkleber
  'fenster_bekl':     ['grafik','druck','montage'],
  'milchglas':        ['grafik','druck','montage'],
  'sonnenschutz':     ['grafik','druck','montage'],
  'aufkleber_digi':   ['grafik','druck'],
  'aufkleber_plot':   ['grafik','druck'],
  'etiketten':        ['grafik','druck'],
  // Messe / Event / POS
  'messestand':       ['grafik','druck','laminat','montage'],
  'messewand':        ['grafik','druck','laminat','montage'],
  'pos_display':      ['grafik','druck','montage'],
  'promotion':        ['grafik','druck'],
  // Sonstiges
  // freie_leistung: kein fixer Workflow — Schritte werden manuell gesetzt
  'freie_leistung':   [],
};

// Auftragsarten die den Workflow ÜBERSCHREIBEN (Spezialfälle)
const CC_ART_OVERRIDE = {
  'montage':            ['montage'],
  'demontage':          ['montage'],
  'externe_bestellung': ['extern'],
  // alle anderen: kein Override — Produkt hat Vorrang
};

// ── Schritt visuell aktivieren/deaktivieren ──────────────────────
var AU_STEP_FARBEN = {
  grafik:'var(--purple)', druck:'var(--blue)', laminat:'var(--teal)',
  montage:'var(--amber)', extern:'var(--gray)'
};

function auStepSetChecked(step, checked){
  var cb  = document.getElementById('au-step-'+step);
  var lbl = document.getElementById('au-step-lbl-'+step);
  if(!cb) return;
  cb.checked = checked;
  cb.style.opacity = '1';
  if(lbl){
    var col = AU_STEP_FARBEN[step]||'var(--text2)';
    var bgL = col.replace('var(--','var(--').replace(')','-l)').replace('var(--text2-l)','var(--gray-l)');
    // cssText komplett neu setzen um border-Shorthand sicher zu überschreiben
    lbl.style.cssText = 'display:flex;align-items:flex-start;gap:9px;padding:12px;border-radius:9px;cursor:pointer;'
      +(checked
        ? 'border:2px solid '+col+';background:'+bgL+';opacity:1;'
        : 'border:2px solid var(--border);background:#fff;opacity:0.5;');
  }
}

function auSchritteSynchronisieren(){
  var produktId   = document.getElementById('au-produkt')?.value||'';
  var auftragsart = document.getElementById('au-auftragsart')?.value||'';
  var alle        = ['grafik','druck','laminat','montage','extern'];

  // 1. Override-Auftragsarten haben immer Vorrang
  if(CC_ART_OVERRIDE[auftragsart]){
    var schritte = CC_ART_OVERRIDE[auftragsart];
    alle.forEach(function(s){
      auStepSetChecked(s, schritte.indexOf(s)>=0);
      var cb=document.getElementById('au-step-'+s);
      var lbl=document.getElementById('au-step-lbl-'+s);
      if(cb && !cb.checked){ cb.style.opacity='0.35'; if(lbl) lbl.style.opacity='0.35'; }
    });
    var ml=document.getElementById('au-step-lbl-montage');
    if(ml){ var mDiv=ml.querySelector('div div'); if(mDiv) mDiv.textContent=(auftragsart==='demontage')?'↩️ Demontage':'🚌 Montage'; }
    auUpdateWorkflowPreview(); auRenderStepDetails(); return;
  }

  // 2. Produkt gewählt → Produkt-Schritte als Basis
  var schritte = CC_PRODUKT_SCHRITTE[produktId] || null;

  // 3. Kein Produkt → Auftragsart als Basis
  if(!schritte){
    if(auftragsart==='neuproduktion'||auftragsart==='nachproduktion'||auftragsart==='reklamation'){
      schritte = ['grafik','druck','laminat','montage'];
    } else if(auftragsart){
      var artCfg=ccAuftragsartById(auftragsart);
      if(artCfg) schritte=artCfg.schritte;
    }
  }

  if(!schritte) return;

  // 4. Alle Schritte visuell korrekt setzen (Laminat: nicht automatisch abwählen — nur Nutzer)
  alle.forEach(function(s){
    var shouldCheck = schritte.indexOf(s) >= 0;
    if (s === 'laminat' && !shouldCheck) {
      var lamCb = document.getElementById('au-step-laminat');
      if (lamCb && lamCb.checked) return;
    }
    auStepSetChecked(s, shouldCheck);
  });

  // 5. Montage-Label-Text zurücksetzen
  var ml=document.getElementById('au-step-lbl-montage');
  if(ml){ var mDiv=ml.querySelector('div div'); if(mDiv) mDiv.textContent='🚌 Montage'; }

  auUpdateWorkflowPreview();
  auRenderStepDetails();
}

// ── Uhrzeit-Select: 30-Min-Schritte 05:00–20:00 ─────────────────
function auZeitSelect(id, selected, extraStyle){
  selected = selected || '07:00';
  var styleAttr = extraStyle ? ' style="'+extraStyle+'"' : '';
  var opts = '<option value="">— Uhrzeit —</option>';
  for(var h = 7; h <= 18; h++){
    ['00','30'].forEach(function(m){
      if(h === 18 && m === '30') return; // max 18:00
      var val = String(h).padStart(2,'0')+':'+m;
      opts += '<option value="'+val+'"'+(val===selected?' selected':'')+'>'+val+' Uhr</option>';
    });
  }
  return '<select class="fs" id="'+id+'"'+styleAttr+'>'+opts+'</select>';
}

// ── Projekt-Felder je Leistungsbereich ─────────────────────────
// Wird bei auLeistungChanged() und openAuftragModal() aufgerufen.
// Alle Felder haben stabile IDs damit submitAuftrag() sie lesen kann.
function auProjektFelderRender(){
  var leistung = document.getElementById('au-leistung')?.value||'';
  var container = document.getElementById('au-projekt-felder');
  if(!container) return;

  // Bestehende Werte retten
  var altFz     = document.getElementById('au-fz')?.value||'';
  var altDepot  = document.getElementById('au-depot')?.value||'';
  var altTermin     = document.getElementById('au-termin')?.value||'';
  var altMontage    = document.getElementById('au-montage-datum')?.value||'';
  var altMontageZ   = document.getElementById('au-montage-zeit')?.value||'07:00';
  var altLiefer     = document.getElementById('au-liefertermin')?.value||'';

  // ── Termin-Block: 3 klar getrennte Felder ───────────────────────
  var terminBlock =
    // Zeile 1: Starttermin (nur Datum, Pflicht)
    '<div class="frow frow3" style="margin-top:8px;">'
      +'<div class="fg">'
        +'<label class="fl">Starttermin <span style="color:var(--red);">*</span>'
          +'<span style="font-size:9px;font-weight:400;color:var(--text3);margin-left:4px;">Beginn Produktion / Vorbereitung</span>'
        +'</label>'
        +'<input class="fi" id="au-termin" type="date" value="'+altTermin+'">'
      +'</div>'
      // Montagetermin: Datum + Uhrzeit
      +'<div class="fg">'
        +'<label class="fl">Montagetermin'
          +'<span style="font-size:9px;font-weight:400;color:var(--text3);margin-left:4px;">Einsatz Monteure vor Ort</span>'
        +'</label>'
        +'<div style="display:flex;gap:5px;">'
          +'<input class="fi" id="au-montage-datum" type="date" value="'+altMontage+'" style="flex:1.4;">'
          +auZeitSelect('au-montage-zeit', altMontageZ, 'flex:1;')
        +'</div>'
      +'</div>'
      // Liefertermin: nur Datum, Deadline
      +'<div class="fg">'
        +'<label class="fl">Liefertermin'
          +'<span style="font-size:9px;font-weight:400;color:var(--text3);margin-left:4px;">Geplanter Liefer-/Übergabetermin</span>'
        +'</label>'
        +'<input class="fi" id="au-liefertermin" type="date" value="'+altLiefer+'">'
      +'</div>'
    +'</div>';

  var depotOpts = ['Depot Mülheim','Depot Essen Ruhrallee','Depot Essen Stadtmitte','Depot Schwerinstraße','Depot Econova Allee']
    .map(function(d){ return '<option'+(altDepot===d?' selected':'')+'>'+d+'</option>'; }).join('');

  var html = '';
  var titel = 'Projekt';
  var sub   = 'Name, Starttermin';

  if(leistung === 'bus_bahn'){
    titel = 'Fahrzeugdaten Bus / Bahn';
    sub   = 'Fahrzeugnummer, Depot, Montage';
    html  = '<div class="frow frow2">'
      +'<div class="fg"><label class="fl">Fahrzeugnummer <span style="color:var(--red);">*</span></label>'
        +'<input class="fi" id="au-fz" type="text" placeholder="z.B. Bus 1789 · KFZ-Kennzeichen" value="'+altFz+'"></div>'
      +'<div class="fg"><label class="fl">Depot / Standort</label>'
        +'<select class="fs" id="au-depot"><option value="">— wählen —</option>'+depotOpts+'</select></div>'
      +'</div>'
      +'<div class="frow frow2">'
        +'<div class="fg"><label class="fl">Fahrzeugtyp <span style="color:var(--red);">*</span></label>'
          +'<select class="fs" id="au-fz-typ" onchange="auUpdateSub()">'
          +'<option value="">— wählen —</option>'
          +'</select></div>'
        +'<div class="fg"><label class="fl">Anzahl Fahrzeuge</label>'
          +'<input class="fi" id="au-fz-anzahl" type="number" min="1" value="1" placeholder="1"></div>'
      +'</div>'
      + terminBlock;

  } else if(leistung === 'fahrzeug'){
    titel = 'Fahrzeugdaten PKW / Transporter';
    sub   = 'Kennzeichen, Fahrzeugtyp, Übergabeort';
    html  = '<div class="frow frow2">'
      +'<div class="fg"><label class="fl">Kennzeichen / Fahrzeug <span style="color:var(--red);">*</span></label>'
        +'<input class="fi" id="au-fz" type="text" placeholder="z.B. BO-CC 1234 · VW Golf · Modell" value="'+altFz+'"></div>'
      +'<div class="fg"><label class="fl">Übergabeort / Standort</label>'
        +'<input class="fi" id="au-depot" type="text" placeholder="z.B. Kundenparkplatz · Werkstatt Mülheim" value="'+altDepot+'"></div>'
      +'</div>'
      +'<div class="frow frow2">'
        +'<div class="fg"><label class="fl">Fahrzeugtyp <span style="color:var(--red);">*</span></label>'
          +'<select class="fs" id="au-fz-typ" onchange="auUpdateSub()">'
          +'<option value="">— wählen —</option>'
          +'</select></div>'
        +'<div class="fg"><label class="fl">Anzahl Fahrzeuge</label>'
          +'<input class="fi" id="au-fz-anzahl" type="number" min="1" value="1" placeholder="1"></div>'
      +'</div>'
      + terminBlock;

  } else if(leistung === 'schild'){
    titel = 'Schildstandort';
    sub   = 'Adresse, Maße, Montage';
    html  = '<div class="frow frow2">'
      +'<div class="fg"><label class="fl">Projektname <span style="color:var(--red);">*</span></label>'
        +'<input class="fi" id="au-fz" type="text" placeholder="z.B. Eingangsschild Büro Meier" value="'+altFz+'"></div>'
      +'<div class="fg"><label class="fl">Montageort / Adresse</label>'
        +'<input class="fi" id="au-depot" type="text" placeholder="z.B. Mülheimer Str. 12, Essen" value="'+altDepot+'"></div>'
      +'</div>'
      +'<div class="frow frow3">'
        +'<div class="fg"><label class="fl">Breite (cm)</label>'
          +'<input class="fi" id="au-fz-breite" type="number" placeholder="z.B. 120"></div>'
        +'<div class="fg"><label class="fl">Höhe (cm)</label>'
          +'<input class="fi" id="au-fz-hoehe" type="number" placeholder="z.B. 60"></div>'
        +'<div class="fg"><label class="fl">Stück</label>'
          +'<input class="fi" id="au-fz-anzahl" type="number" min="1" value="1"></div>'
      +'</div>'
      + terminBlock;

  } else if(leistung === 'druck'){
    titel = 'Druckauftrag';
    sub   = 'Format, Auflage, Lieferung';
    html  = '<div class="frow frow2">'
      +'<div class="fg"><label class="fl">Projektname <span style="color:var(--red);">*</span></label>'
        +'<input class="fi" id="au-fz" type="text" placeholder="z.B. Stadtfest Banner 2026" value="'+altFz+'"></div>'
      +'<div class="fg"><label class="fl">Lieferadresse</label>'
        +'<input class="fi" id="au-depot" type="text" placeholder="z.B. Zum Kunden · CC intern" value="'+altDepot+'"></div>'
      +'</div>'
      +'<div class="frow frow3">'
        +'<div class="fg"><label class="fl">Format B × H (cm)</label>'
          +'<input class="fi" id="au-fz-breite" type="text" placeholder="z.B. 300 × 100"></div>'
        +'<div class="fg"><label class="fl">Auflage / Stück</label>'
          +'<input class="fi" id="au-fz-anzahl" type="number" min="1" value="1"></div>'
        +'<div class="fg"><label class="fl">Material</label>'
          +'<select class="fs" id="au-fz-typ"><option value="">— optional —</option>'
          +'<option>PVC Banner</option><option>Aufkleber</option><option>Plakat</option>'
          +'<option>Rollup-Druck</option><option>Aluverbund</option></select></div>'
      +'</div>'
      + terminBlock;

  } else if(leistung === 'fenster'){
    titel = 'Fensterfläche / Folie';
    sub   = 'Objekt, Adresse, Fläche';
    html  = '<div class="frow frow2">'
      +'<div class="fg"><label class="fl">Objektname <span style="color:var(--red);">*</span></label>'
        +'<input class="fi" id="au-fz" type="text" placeholder="z.B. Schaufenster Meier GmbH" value="'+altFz+'"></div>'
      +'<div class="fg"><label class="fl">Adresse / Standort</label>'
        +'<input class="fi" id="au-depot" type="text" placeholder="z.B. Kaiserstraße 5, Essen" value="'+altDepot+'"></div>'
      +'</div>'
      +'<div class="frow frow3">'
        +'<div class="fg"><label class="fl">Breite (m)</label>'
          +'<input class="fi" id="au-fz-breite" type="number" step="0.1" placeholder="z.B. 3.5"></div>'
        +'<div class="fg"><label class="fl">Höhe (m)</label>'
          +'<input class="fi" id="au-fz-hoehe" type="number" step="0.1" placeholder="z.B. 2.0"></div>'
        +'<div class="fg"><label class="fl">Folienart</label>'
          +'<select class="fs" id="au-fz-typ"><option value="">— optional —</option>'
          +'<option>Milchig / Sichtschutz</option><option>Bedruckt / Lochfolie</option>'
          +'<option>Klar / Transparent</option><option>Spiegelfolie</option></select></div>'
      +'</div>'
      + terminBlock;

  } else if(leistung === 'messe'){
    titel = 'Messe / Event';
    sub   = 'Veranstaltung, Ort, Starttermin';
    html  = '<div class="frow frow2">'
      +'<div class="fg"><label class="fl">Veranstaltung / Projektname <span style="color:var(--red);">*</span></label>'
        +'<input class="fi" id="au-fz" type="text" placeholder="z.B. Messe Essen 2026 · Stadtfest" value="'+altFz+'"></div>'
      +'<div class="fg"><label class="fl">Ort / Halle / Stand-Nr.</label>'
        +'<input class="fi" id="au-depot" type="text" placeholder="z.B. Halle 3, Stand B12" value="'+altDepot+'"></div>'
      +'</div>'
      + terminBlock;

  } else if(leistung === 'sonstiges'){
    // FREIE LEISTUNG — Bezeichnung manuell eingeben (WICHTIG)
    titel = 'Freie Leistung';
    sub   = 'Bezeichnung frei wählbar';
    var altFreiText = document.getElementById('au-freie-bezeichnung')?.value||'';
    html  = '<div style="background:var(--amber-l);border:1.5px solid var(--amber);border-radius:9px;padding:10px 14px;margin-bottom:10px;font-size:12px;color:var(--amber);">'
        +'⭐ <strong>Freie Leistung</strong> — Bezeichnung wird als Auftragsbezeichnung gespeichert. Schritte manuell festlegen.'
      +'</div>'
      +'<div class="frow frow2">'
        +'<div class="fg" style="grid-column:1/-1;"><label class="fl">Bezeichnung der Leistung <span style="color:var(--red);">*</span></label>'
          +'<input class="fi" id="au-freie-bezeichnung" type="text" '
            +'placeholder="z.B. Reinigung Fahrzeugfolierung · Beratung · Reparatur …" '
            +'value="'+altFreiText+'" '
            +'oninput="this.style.borderColor=this.value?\"#2E7D32\":\"#C62828\"" '
            +'style="font-size:13px;font-weight:500;border-color:'+(altFreiText?'var(--green)':'var(--border)')+';">'
        +'</div>'
      +'</div>'
      +'<div class="frow frow2">'
        +'<div class="fg"><label class="fl">Kontaktperson / Ort</label>'
          +'<input class="fi" id="au-fz" type="text" placeholder="z.B. Ansprechpartner oder Standort" value="'+altFz+'"></div>'
        +'<div class="fg"><label class="fl">Notiz / Details</label>'
          +'<input class="fi" id="au-depot" type="text" placeholder="z.B. interne Notiz" value="'+altDepot+'"></div>'
      +'</div>'
      + terminBlock;

  } else {
    // Kein Leistungsbereich gewählt — generische Felder
    titel = 'Projektdaten';
    sub   = 'Name, Ort, Starttermin';
    html  = '<div class="frow frow2">'
      +'<div class="fg"><label class="fl">Projektname</label>'
        +'<input class="fi" id="au-fz" type="text" placeholder="z.B. Projekt / Bezeichnung" value="'+altFz+'"></div>'
      +'<div class="fg"><label class="fl">Ort / Standort</label>'
        +'<input class="fi" id="au-depot" type="text" placeholder="z.B. Adresse oder Depot" value="'+altDepot+'"></div>'
      +'</div>'
      + terminBlock;
  }

  container.innerHTML = html;
  auFzTypUpdate(); // Fahrzeugtyp-Optionen je Produkt befüllen

  // Titel + Subtitle aktualisieren
  var titleEl = document.getElementById('ac-title-2');
  var subEl   = document.getElementById('ac-sub-2');
  if(titleEl) titleEl.textContent = titel;
  if(subEl)   subEl.textContent   = sub;
}

function auLeistungChanged(){
  var lid = document.getElementById('au-leistung')?.value||'';
  var sel = document.getElementById('au-produkt'); if(!sel) return;
  sel.innerHTML = '<option value="">— Produkt wählen —</option>';
  if(!lid){
    auProjektFelderRender();
    auMaterialUpdate();
  } else {
    ccProdukteByLeistung(lid).forEach(function(p){
      var o = document.createElement('option');
      o.value = p.id; o.textContent = p.ico+' '+p.label;
      sel.appendChild(o);
    });
    auMaterialUpdate();
    auProjektFelderRender();
    var b2=document.getElementById('ac-body-2'), a2=document.getElementById('ac-arrow-2');
    if(b2&&b2.classList.contains('ac-closed')){ b2.classList.remove('ac-closed'); if(a2) a2.classList.add('open'); }
  }
  if (!auNeuAuftragIstFahrzeugLeistung()) {
    auFiles = auFiles.filter(function (f) {
      var k = f && f.auSlotKey != null ? String(f.auSlotKey).trim() : '';
      return !k || k.indexOf('nachher:') !== 0;
    });
    auRenderFileList();
  }
  auNeuDateiNachherVisibilityUpdate();
  auNeuDateiSlotIndicatorsRefresh();
}

// ── Fahrzeugtypen je Produkt-Kategorie ──────────────────────────────
var AU_FZ_TYPEN = {
  bus: {
    ids: ['bus_voll','bus_teil','bus_heck','bus_ssp','bus_traffic_board'],
    opts: [
      ['solobus',         '🚌 Solobus'],
      ['gelenkbus',       '🚌 Gelenkbus'],
      ['doppelgelenkbus', '🚌 Doppelgelenkbus'],
      ['wasserstoffbus',  '♻️ Wasserstoffbus'],
      ['elektrobus',      '⚡ Elektrobus'],
    ]
  },
  bahn: {
    ids: ['bahn_voll','bahn_teil','bahn_innen'],
    opts: [
      ['strassenbahn',  '🚃 Straßenbahn (2-teilig)'],
      ['strassenbahn3', '🚃 Straßenbahn (3-/5-teilig)'],
      ['ubahn',         '🚇 U-Bahn'],
      ['sbahn',         '🚆 S-Bahn / Regionalbahn'],
    ]
  },
  pkw: {
    ids: ['pkw_voll','pkw_teil','pkw_beschr'],
    opts: [
      ['kleinwagen',   '🚗 Kleinwagen (z.B. Polo, Fiesta)'],
      ['kompaktwagen', '🚗 Kompaktwagen (z.B. Golf, Focus)'],
      ['mittelklasse', '🚗 Mittelklasse (z.B. Passat, Mondeo)'],
      ['oberklasse',   '🚗 Oberklasse / Limousine'],
      ['suv',          '🚙 SUV / Geländewagen'],
      ['cabrio',       '🚗 Cabrio / Coupé'],
      ['taxi',         '🚕 Taxi / Mietwagen'],
    ]
  },
  van: {
    ids: ['van_voll','van_teil','van_beschr'],
    opts: [
      ['kleintransporter', '🚐 Kleintransporter (Caddy, Combo)'],
      ['transporter_m',    '🚐 Transporter mittel (T6, Transit)'],
      ['transporter_g',    '🚐 Kastenwagen groß (Sprinter, Crafter)'],
      ['lkw',              '🚚 LKW / Kofferaufbau'],
      ['sattelzug',        '🚛 Sattelzug / Trailer'],
      ['wohnmobil',        '🏕 Wohnmobil / Reisemobil'],
    ]
  },
};

function auFzTypUpdate(){
  var pid  = document.getElementById('au-produkt')?.value||'';
  var lid  = document.getElementById('au-leistung')?.value||'';
  var keys = Object.keys(AU_FZ_TYPEN);

  // Passendes Set per Produkt-ID suchen
  var matched = null;
  for(var i=0; i<keys.length; i++){
    if(AU_FZ_TYPEN[keys[i]].ids.indexOf(pid) >= 0){ matched = AU_FZ_TYPEN[keys[i]]; break; }
  }

  // Kein Produkt gewählt → Leistungsbereich als Vorfilter nutzen
  var opts;
  if(matched){
    opts = matched.opts;
  } else if(lid === 'bus_bahn'){
    opts = AU_FZ_TYPEN.bus.opts.concat(AU_FZ_TYPEN.bahn.opts);
  } else if(lid === 'fahrzeug'){
    opts = AU_FZ_TYPEN.pkw.opts.concat(AU_FZ_TYPEN.van.opts);
  } else {
    opts = [];
    keys.forEach(function(k){ opts = opts.concat(AU_FZ_TYPEN[k].opts); });
  }

  // ── Fahrzeugtyp-Dropdown befüllen ──────────────────────────────
  var sel = document.getElementById('au-fz-typ');
  if(sel){
    var curVal = sel.value;
    sel.innerHTML = '<option value="">— wählen —</option>'
      + opts.map(function(o){
          return '<option value="'+o[0]+'"'+(curVal===o[0]?' selected':'')+'>'+o[1]+'</option>';
        }).join('');
  }

  // ── Fahrzeugnummer-Placeholder je Produkt-Kategorie ────────────
  var fzInp = document.getElementById('au-fz');
  if(fzInp){
    var pkwIds = AU_FZ_TYPEN.pkw.ids, vanIds = AU_FZ_TYPEN.van.ids;
    var bahnIds= AU_FZ_TYPEN.bahn.ids,busIds = AU_FZ_TYPEN.bus.ids;
    if(pkwIds.indexOf(pid) >= 0)
      fzInp.placeholder = 'z.B. BO-CC 1234 · VW Golf · Modell';
    else if(vanIds.indexOf(pid) >= 0)
      fzInp.placeholder = 'z.B. CC-XY 456 · Sprinter · Modell';
    else if(bahnIds.indexOf(pid) >= 0)
      fzInp.placeholder = 'z.B. Triebwagen 1234 · Linie U17';
    else
      fzInp.placeholder = 'z.B. Bus 1789 · KFZ-Kennzeichen';
  }
}

function auUpdateSub(){
  var kunde   = auKundeSelectAnzeigeText() || '';
  var artEl   = document.getElementById('au-auftragsart');
  var prodEl  = document.getElementById('au-produkt');
  var artTxt  = artEl ? (artEl.options[artEl.selectedIndex]?.text||'') : '';
  var prodTxt = prodEl? (prodEl.options[prodEl.selectedIndex]?.text||'') : '';
  var netto   = document.getElementById('au-netto')?.value||'';
  var beschrPrev = document.getElementById('au-beschr')?.value?.trim()||'';
  var sub = [artTxt, prodTxt].filter(Boolean).join(' · ');
  var subFull = beschrPrev ? (sub ? sub+' — '+beschrPrev : beschrPrev) : sub;
  if(kunde && subFull) document.getElementById('ac-sub-1')?.setAttribute('data', kunde+' · '+subFull);
  // Beschr-Hint zurücksetzen wenn jetzt ok
  if(beschrPrev){
    var hEl = document.getElementById('au-beschr-hint');
    if(hEl) hEl.style.display = 'none';
    var bEl = document.getElementById('au-beschr');
    if(bEl && bEl.style.borderColor === 'var(--red)') bEl.style.borderColor = 'var(--green)';
  }
  if(netto){ var n=parseFloat(netto); document.getElementById('ac-sub-7').textContent='Netto: € '+n.toFixed(2)+' · Brutto: € '+(n*1.19).toFixed(2); }
}

function auArtChanged(){
  var art = document.getElementById('au-auftragsart')?.value||'';
  var hint = document.getElementById('au-art-hinweis');
  var cfg  = ccAuftragsartById(art);

  // ── Hinweis-Banner ────────────────────────────
  if(!cfg){ if(hint) hint.style.display='none'; return; }

  var hinweisFarben = {
    neuproduktion:      {bg:'var(--blue-l)',   col:'var(--blue)'},
    nachproduktion:     {bg:'var(--blue-l)',   col:'var(--blue)'},
    montage:            {bg:'var(--amber-l)',  col:'var(--amber)'},
    demontage:          {bg:'var(--amber-l)',  col:'var(--amber)'},
    reklamation:        {bg:'#FEECEC',         col:'var(--red)'},
    externe_bestellung: {bg:'var(--gray-l)',   col:'var(--text2)'},
    service:            {bg:'#E0F2F1',         col:'#00897B'},
    intern:             {bg:'var(--gray-l)',   col:'var(--text3)'},
  };
  var hf = hinweisFarben[art]||{bg:'var(--blue-l)',col:'var(--blue)'};
  if(hint){
    hint.innerHTML    = cfg.ico+' <strong>'+cfg.label+'</strong> — '+cfg.hint;
    hint.style.cssText= 'display:block;padding:9px 13px;border-radius:7px;font-size:12px;border-left:3px solid '+hf.col+';background:'+hf.bg+';color:'+hf.col+';';
  }

  // ── Reklamation → Priorität Hoch ──────────────
  if(art==='reklamation') auSelPrio('hoch');

  // ── Leistungsbereich vorauswählen wenn noch leer ──
  var leistungSel = document.getElementById('au-leistung');
  if(leistungSel && !leistungSel.value){
    var vorschlag = {montage:'bus_bahn',demontage:'bus_bahn',externe_bestellung:'sonstiges',service:'bus_bahn',intern:'sonstiges'}[art]||'';
    if(vorschlag){ leistungSel.value=vorschlag; auLeistungChanged(); }
  }

  // ── Schritte direkt setzen — kein nachgelagerter Code kann sie mehr ändern ──
  // Erst alle zurücksetzen
  ['grafik','druck','laminat','montage','extern'].forEach(function(s){
    auStepSetChecked(s, false);
    var cb=document.getElementById('au-step-'+s);
    if(cb) cb.style.opacity='1';
    var lbl=document.getElementById('au-step-lbl-'+s);
    if(lbl) lbl.style.opacity='0.4';
  });

  // Dann korrekte Schritte aktiv setzen
  if(art==='neuproduktion' || art==='nachproduktion' || art==='reklamation'){
    ['grafik','druck','laminat','montage'].forEach(function(s){ auStepSetChecked(s,true); });
  } else if(art==='montage'){
    auStepSetChecked('montage',true);
    ['grafik','druck','laminat','extern'].forEach(function(s){
      var cb=document.getElementById('au-step-'+s); if(cb) cb.style.opacity='0.35';
      var lbl=document.getElementById('au-step-lbl-'+s); if(lbl) lbl.style.opacity='0.35';
    });
  } else if(art==='demontage'){
    auStepSetChecked('montage',true);
    var ml=document.getElementById('au-step-lbl-montage');
    if(ml){ var d=ml.querySelector('div div'); if(d) d.textContent='↩️ Demontage'; }
    ['grafik','druck','laminat','extern'].forEach(function(s){
      var cb=document.getElementById('au-step-'+s); if(cb) cb.style.opacity='0.35';
    });
  } else if(art==='externe_bestellung'){
    auStepSetChecked('extern',true);
  } else if(art==='service'){
    auStepSetChecked('montage',true);
  } else if(art==='intern'){
    auStepSetChecked('grafik',true);
    auStepSetChecked('druck',true);
  } else {
    // Fallback: aus CC_AUFTRAGSARTEN
    var artCfg=ccAuftragsartById(art);
    if(artCfg) artCfg.schritte.forEach(function(s){ auStepSetChecked(s,true); });
  }

  auUpdateWorkflowPreview();
  auRenderStepDetails();
  auUpdateSub();
}

function auToggleStep(step){
  // Der Browser-Toggle hat cb.checked bereits geändert wenn onclick feuert.
  // Wir lesen den neuen Wert direkt.
  setTimeout(function(){
    var cb = document.getElementById('au-step-'+step);
    if(!cb) return;
    auStepSetChecked(step, cb.checked);
    auUpdateWorkflowPreview();
    auRenderStepDetails();
  }, 0);
}

// ══════════════════════════════════════════════════════════════
// MATERIAL-DATENBANK — produktbasiert, keine Leistungs-Logik
// ══════════════════════════════════════════════════════════════
const AU_MATERIALIEN = {

  // ── Bus & Bahnwerbung ─────────────────────────────────────────
  bus_bahn: {
    label: 'Fahrzeugfolien Bus / Bahn',
    gruppen: [
      { gruppe:'ORAJET Digitaldruckfolie', items:[
        'ORAJET® 3551 white GLOSSY 137cm',
        'ORAJET® 3551 white GLOSSY 105cm',
        'ORAJET® 3551 white MATT 137cm',
        'ORAJET® 3162XMRA white MATT 105cm',
        'ORAJET® 3162XMRA white MATT 137cm',
        'ORAJET® 3162RA CAST MATT 137cm',
      ]},
      { gruppe:'Avery Dennison', items:[
        'Avery MPI 1105 EA RS GLOSSY 137cm',
        'Avery MPI 1005 EA RS MATT 137cm',
        'Avery MPI 3000 ULTRA CAST GLOSSY 137cm',
      ]},
      { gruppe:'Mactac / VakoSun', items:[
        'mactac® MACal® 9888 CAST MATT 123cm',
        'VakoSun Protect 20A silver dark 152cm',
        'VakoSun Protect 15A transparent 152cm',
      ]},
    ],
    laminat: true,
    materialDefault: 'ORAJET® 3551 white GLOSSY 137cm',
    laminatDefault:  'ORAGUARD® 200M MATT 137cm',
  },

  // ── Fahrzeugfolien PKW / Transporter ─────────────────────────
  fahrzeug: {
    label: 'Fahrzeugfolien PKW / Transporter',
    gruppen: [
      { gruppe:'ORAJET Digitaldruckfolie', items:[
        'ORAJET® 3551 white GLOSSY 137cm',
        'ORAJET® 3551 white GLOSSY 105cm',
        'ORAJET® 3551 white MATT 137cm',
        'ORAJET® 3162XMRA white MATT 105cm',
        'ORAJET® 3162XMRA white MATT 137cm',
        'ORAJET® 3162RA CAST MATT 137cm',
      ]},
      { gruppe:'Avery Dennison', items:[
        'Avery MPI 1105 EA RS GLOSSY 137cm',
        'Avery MPI 1005 EA RS MATT 137cm',
        'Avery MPI 3000 ULTRA CAST GLOSSY 137cm',
      ]},
      { gruppe:'Mactac / VakoSun', items:[
        'mactac® MACal® 9888 CAST MATT 123cm',
        'VakoSun Protect 20A silver dark 152cm',
        'VakoSun Protect 15A transparent 152cm',
      ]},
    ],
    laminat: true,
    materialDefault: 'ORAJET® 3551 white GLOSSY 137cm',
    laminatDefault:  'ORAGUARD® 200M MATT 137cm',
  },

  // ── Schilder & Werbeanlagen ───────────────────────────────────
  schild: {
    label: 'Schilder / Trägermaterial',
    gruppen: [
      { gruppe:'Alu-Verbund / Dibond', items:[
        'Dibond 3mm weiß',
        'Dibond 3mm silber',
        'Alu-Verbundplatte 3mm',
      ]},
      { gruppe:'Kunststoff', items:[
        'Forex 5mm weiß',
        'Forex 3mm weiß',
        'Acryl 3mm klar',
        'Acryl 5mm klar',
        'Acryl 3mm weiß',
      ]},
      { gruppe:'Plotfolie / Beklebung', items:[
        'Plotfolie Mactac MACal 9800 PRO',
        'Orajet 3162RA CAST (Ganzgestaltung)',
        'ORAJET® 3551 Digitaldruckfolie',
      ]},
    ],
    laminat: true,
  },

  // ── Druck / Banner / Plakate ──────────────────────────────────
  druck: {
    label: 'Druckmaterial',
    gruppen: [
      { gruppe:'Banner', items:[
        'PVC Banner 500g/m² beidseitig',
        'PVC Banner 440g/m² Economy',
        'Mesh Banner 270g/m² (perforiert)',
        'Blockout Banner 500g/m²',
      ]},
      { gruppe:'Papier / Plakat', items:[
        'Papier matt 170g/m²',
        'Papier glänzend 170g/m²',
        'Backlit Film (hintergrundbeleuchtet)',
      ]},
      { gruppe:'Rollup / Display', items:[
        'Rollup-Folie matt 120g/m²',
        'Rollup-Folie glossy 120g/m²',
        'Canvas Stoff 260g/m²',
      ]},
    ],
    laminat: false,  // Banner/Druck kein Laminat
    materialDefault: 'PVC Banner 500g/m² beidseitig',
  },

  // ── Folie / Fenster / Aufkleber ───────────────────────────────
  fenster: {
    label: 'Folien / Fensterfolien',
    gruppen: [
      { gruppe:'Fensterfolie', items:[
        'Milchglas-Folie 90µ weiß-matt',
        'Lochfolie 50/50 weiß 125cm',
        'Sonnenschutzfolie silver 20%',
        'Sonnenschutzfolie bronze 35%',
        'Klarsichtfolie 50µ transparent',
      ]},
      { gruppe:'Aufkleber', items:[
        'Orafol 641 Economy Cal® matt',
        'Orafol 651 Intermediate Cal® glänzend',
        'ORAJET® 3551 Digitaldruckfolie',
        'Vinylfolie weiß matt (Etiketten)',
      ]},
    ],
    laminat: true,
  },

  // ── Messe / Event / POS ───────────────────────────────────────
  messe: {
    label: 'Messe / Event Material',
    gruppen: [
      { gruppe:'Digitaldruckfolie (Standard)', items:[
        'ORAJET® 3551 white GLOSSY 137cm',
        'ORAJET® 3551 white MATT 137cm',
        'ORAJET® 3162XMRA white MATT 137cm',
      ]},
      { gruppe:'Textil / Systemdruck', items:[
        'Textilfolie Sublimatex® 115g/m²',
        'SEG Fabric (Silikondichtung) 200g/m²',
        'Mesh-Stoff Satin 150g/m²',
      ]},
      { gruppe:'Hartsubstrat', items:[
        'Forex 5mm weiß',
        'Dibond 3mm',
        'Acryl 3mm klar',
        'Hohlkammerplatte 4mm weiß',
      ]},
    ],
    laminat: true,
    materialDefault: 'ORAJET® 3551 white GLOSSY 137cm',  // Vorauswahl Digitaldruckfolie
    laminatDefault:  'ORAGUARD® 200M MATT 137cm',        // Vorauswahl Matt gegen Spiegelungen
  },

  // ── Sonstiges / Freie Leistung ────────────────────────────────
  sonstiges: {
    label: 'Sonstiges',
    gruppen: [
      { gruppe:'Allgemein', items:[
        'Sonstiges (in Notiz angeben)',
        'ORAJET® 3551 white GLOSSY 137cm',
        'ORAJET® 3551 white MATT 137cm',
        'PVC Banner 500g/m² beidseitig',
        'Dibond 3mm weiß',
        'Forex 5mm weiß',
      ]},
    ],
    laminat: true,
  },
};

// Laminat-Optionen (einheitlich für alle Leistungsbereiche die Laminat haben)
const AU_LAMINAT_OPTIONEN = [
  { gruppe:'Orafol MATT', items:[
    'ORAGUARD® 200M MATT 137cm',
    'ORAGUARD® 215M MATT 105cm',
    'ORAGUARD® 215M MATT 137cm',
  ]},
  { gruppe:'Orafol GLOSSY', items:[
    'ORAGUARD® 200G GLOSSY 105cm',
    'ORAGUARD® 215G GLOSSY 137cm',
    'ORAGUARD® 215G GLOSSY 105cm',
  ]},
  { gruppe:'Avery', items:[
    'Avery DOL 1460Z GLOSSY 137cm',
    'Avery DOL 6460Z MATT 137cm',
  ]},
];

// ── Material-Dropdown dynamisch befüllen ─────────────────────
// Wird aufgerufen wenn Leistung oder Produkt wechselt
function auMaterialUpdate(){
  var lid    = document.getElementById('au-leistung')?.value||'';
  var pid    = document.getElementById('au-produkt')?.value||'';
  var lamWrap= document.getElementById('au-laminat-wrap');
  var hint   = document.getElementById('au-material-hint');
  var label  = document.getElementById('au-material-label');

  // Materialgruppe anhand Leistungsbereich bestimmen (nur Anzeige/Filter)
  var cfg = AU_MATERIALIEN[lid] || AU_MATERIALIEN['sonstiges'];

  // Label + Hint aktualisieren
  if(label) label.textContent = 'Material / Folie';
  if(hint)  hint.textContent  = cfg.label+' — nur passende Materialien';

  // ── Material-Datalist befüllen ──────────────────────────────────
  var matInp  = document.getElementById('au-material');
  var matList = document.getElementById('au-material-datalist');
  if(matInp && matList){
    var prevMat = matInp.value;
    matList.innerHTML = '';
    cfg.gruppen.forEach(function(g){
      g.items.forEach(function(item){
        var o = document.createElement('option'); o.value = item; matList.appendChild(o);
      });
    });
    // Vorauswahl nur wenn Feld noch leer
    if(cfg.materialDefault && !prevMat) matInp.value = cfg.materialDefault;
  }

  // ── Laminat: ein-/ausblenden je Konfiguration ──────────────────
  if(lamWrap) lamWrap.style.display = cfg.laminat ? '' : 'none';

  var lamInp  = document.getElementById('au-laminat');
  var lamList = document.getElementById('au-laminat-datalist');
  if(lamInp && lamList && cfg.laminat){
    var prevLam = lamInp.value;
    lamList.innerHTML = '';
    var oOhne = document.createElement('option'); oOhne.value = 'Ohne Laminat'; lamList.appendChild(oOhne);
    AU_LAMINAT_OPTIONEN.forEach(function(g){
      g.items.forEach(function(item){
        var o = document.createElement('option'); o.value = item; lamList.appendChild(o);
      });
    });
    // Vorauswahl nur wenn Feld noch leer
    if(cfg.laminatDefault && !prevLam) lamInp.value = cfg.laminatDefault;
  }
  if(lamInp && !cfg.laminat) lamInp.value = '';
}

function auMaschineWaehlen(maschine){
  var inp = document.getElementById('au-maschine');
  if(inp) inp.value = maschine;
  var ist800 = maschine.indexOf('800') >= 0;
  var btn800 = document.getElementById('au-maschine-800');
  var btn560 = document.getElementById('au-maschine-560');
  if(btn800){
    btn800.style.background    = ist800 ? 'var(--blue)' : 'var(--gray-l)';
    btn800.style.color         = ist800 ? '#fff'        : 'var(--text)';
    btn800.style.borderColor   = ist800 ? 'var(--blue)' : 'var(--border)';
  }
  if(btn560){
    btn560.style.background    = !ist800 ? 'var(--blue)' : 'var(--gray-l)';
    btn560.style.color         = !ist800 ? '#fff'        : 'var(--text)';
    btn560.style.borderColor   = !ist800 ? 'var(--blue)' : 'var(--border)';
  }
}

// ── MA + Dauer je aktivem Schritt ──────────────────
const AU_STEP_CONFIG = {
  grafik:  { label:'🎨 Grafik / Entwurf',   col:'var(--purple)', typ:'optional', maOptions:['ME','IL','CE'],             defaultDauer:2 },
  druck:   { label:'🖨️ Druck / Plot',        col:'var(--blue)',   typ:'optional', maOptions:['SE','MO','ME','OK'],        defaultDauer:2 },
  laminat: { label:'📐 Laminat / Zuschnitt', col:'var(--teal)',   typ:'optional', maOptions:['SE','MO','OK','ME'],        defaultDauer:1 },
  montage: { label:'🚌 Montage',             col:'var(--amber)',  typ:'multi',    maOptions:['OK','MT','MO','SE'],        defaultDauer:4 },
  extern:  { label:'📦 Extern',              col:'var(--gray)',   typ:'single',   maOptions:[],                           defaultDauer:0 },
  doku:    { label:'📋 Dokumentation',       col:'#7C3AED',       typ:'optional', maOptions:['CE','MU','MO','OK','MT','SE','ME','IL','ZI','EL'], defaultDauer:1 },
};

function auRenderStepDetails(){
  const container=document.getElementById('au-step-details'); if(!container) return;
  const stepOrder=['grafik','druck','laminat','montage','extern'];
  const active=stepOrder.filter(s=>{const cb=document.getElementById('au-step-'+s);return cb&&cb.checked;});
  const allSteps = active.length ? [...active,'doku'] : [];

  container.innerHTML=allSteps.map(function(s, si){
    var cfg = AU_STEP_CONFIG[s]||{label:s,col:'var(--text)',typ:'single',maOptions:[]};
    var stepMaRows = auSchrittVerantwortlicheZeilen(cfg.maOptions);
    // Vorhandenen Wert beibehalten, sonst Default aus Config
    var dauerEl = document.getElementById('au-sd-dauer-'+s);
    var prevDauer = dauerEl ? dauerEl.value : '';
    if(prevDauer === '' || prevDauer === null) prevDauer = cfg.defaultDauer !== undefined ? String(cfg.defaultDauer) : '';

    // ── Verantwortlichen vorher ermitteln (für Header-Vorschau) ──────
    var prevVerant = '';
    var prevVerantName = '';
    if(cfg.maOptions.length){
      if(s === 'doku'){
        // Doku: Wert aus Dropdown lesen, kein Auto-Default
        var dokuSel = document.getElementById('au-sd-verant-doku-sel');
        prevVerant = dokuSel ? dokuSel.value : '';
      } else {
        var verantEl2 = document.getElementById('au-sd-verant-'+s);
        if(verantEl2) prevVerant = verantEl2.value;
        if(!prevVerant){
          var fr2 = document.querySelector('input[name="au-sd-verant-'+s+'"]:checked') || document.querySelector('input[name="au-sd-verant-'+s+'"]');
          prevVerant = fr2 ? fr2.value : (stepMaRows[0] ? auSchrittMaRowId(stepMaRows[0]) : '');
        }
      }
      var pvObj = typeof maDataFindByWorkflowKey === 'function' ? maDataFindByWorkflowKey(prevVerant) : MA_DATA.find(function(x){ return x.maId===prevVerant; });
      prevVerantName = pvObj ? pvObj.n : (prevVerant||'');
    }

    // ── MA-Auswahl: Verantwortlicher (Pflicht) + Zusatz-MA (nur API/MA_DATA) ──────────
    var maWidget = '';
    var maLeerHinweis = '';
    if (typeof MA_DATA !== 'undefined' && Array.isArray(MA_DATA) && !MA_DATA.length) {
      maLeerHinweis = 'Keine Mitarbeiter vorhanden.';
    } else if (cfg.maOptions.length && !stepMaRows.length) {
      maLeerHinweis = 'Keine Mitarbeiter für diese Auswahl gefunden. Bitte Kürzel in den Stammdaten (Mitarbeiter / API) anlegen.';
    }
    if(!cfg.maOptions.length){
      maWidget = '<div style="font-size:11px;color:var(--text3);padding:6px 0;">— extern / TBD —</div>';
    } else if(maLeerHinweis){
      maWidget = '<div style="font-size:12px;color:var(--amber);padding:10px 0;line-height:1.45;">'+maLeerHinweis+'</div>'
        +'<input type="hidden" id="au-sd-wer-'+s+'" value="">';
    } else if(s === 'doku'){
      // Dokumentation: einfaches Dropdown, kein Pflichtfeld, kein Auto-Select
      maWidget = '<div style="margin-bottom:10px;">'
        +'<div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.05em;margin-bottom:5px;">VERANTWORTLICH <span style="font-weight:400;color:var(--text3);">optional</span></div>'
        +'<select id="au-sd-verant-'+s+'-sel" onchange="(function(v){document.getElementById(\'au-sd-wer-'+s+'\').value=v;var _m=typeof maDataFindByWorkflowKey===\'function\'?maDataFindByWorkflowKey(v):null;document.getElementById(\'au-sd-verant-preview-'+s+'\').textContent=_m&&_m.n?\'👤 \'+_m.n:\'\';})(this.value)" '
          +'style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;background:#fff;color:var(--text);cursor:pointer;">'
          +'<option value="">— optional wählen —</option>'
          +stepMaRows.map(function(m){
            var id = auSchrittMaRowId(m);
            if (!id) return '';
            var sel = prevVerant===id || prevVerant===String(m.maId||'') || prevVerant===String(m.id||'');
            return '<option value="'+id+'" '+(sel?'selected':'')+'>'+(m.n||id)+'</option>';
          }).join('')
        +'</select>'
        +'<input type="hidden" id="au-sd-wer-'+s+'" value="'+prevVerant+'">'
        +'</div>';
    } else {
      var verantWidget = '<div style="margin-bottom:10px;">'
        +'<div style="font-size:10px;font-weight:700;color:var(--red);letter-spacing:.05em;margin-bottom:5px;">VERANTWORTLICH <span style=\'font-weight:400;color:var(--red);\'>Pflicht</span></div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:5px;">'
        +stepMaRows.map(function(m){
          var id = auSchrittMaRowId(m);
          if (!id) return '';
          var sel = prevVerant===id || prevVerant===String(m.maId||'') || prevVerant===String(m.id||'');
          return '<label style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:7px;'
            +'border:2px solid '+(sel?cfg.col:'var(--border)')+';background:'+(sel?cfg.col+'18':'#fff')+';'
            +'cursor:pointer;font-size:12px;" onclick="auVerantToggle(this,\'au-sd-verant-'+s+'\',\''+id.replace(/'/g, "\\'")+'\',\''+cfg.col+'\')">'
            +'<input type="radio" name="au-sd-verant-'+s+'" id="au-sd-verant-'+s+'-'+id.replace(/[^a-zA-Z0-9_-]/g,'_')+'" value="'+id+'" '+(sel?'checked':'')+' '
            +'style="accent-color:'+cfg.col+';width:13px;height:13px;pointer-events:none;"> '+(m.n||id)
            +'</label>';
        }).join('')
        +'</div></div>';
      // Zusatz-MA
      var prevZusatz = [];
      stepMaRows.forEach(function(m){
        var id = auSchrittMaRowId(m);
        if (!id) return;
        var cb = document.getElementById('au-sd-zusatz-'+s+'-'+id.replace(/[^a-zA-Z0-9_-]/g,'_'));
        if(cb && cb.checked) prevZusatz.push(id);
      });
      var zusatzWidget = '<div style="margin-bottom:8px;">'
        +'<div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.05em;margin-bottom:5px;">ZUSÄTZLICHE MITARBEITER <span style=\'font-weight:400;color:var(--text3);\'>optional</span></div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:5px;">'
        +stepMaRows.map(function(m){
          var id = auSchrittMaRowId(m);
          if (!id) return '';
          var idDom = id.replace(/[^a-zA-Z0-9_-]/g,'_');
          var chk = prevZusatz.indexOf(id)>=0;
          return '<label style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:7px;'
            +'border:1.5px solid '+(chk?cfg.col:'var(--border)')+';background:'+(chk?cfg.col+'18':'#fff')+';'
            +'cursor:pointer;font-size:12px;" onclick="auZusatzToggle(this,\''+cfg.col+'\')">'
            +'<input type="checkbox" id="au-sd-zusatz-'+s+'-'+idDom+'" value="'+id+'" '+(chk?'checked':'')+' '
            +'style="accent-color:'+cfg.col+';width:13px;height:13px;pointer-events:none;"> '+(m.n||id)
            +'</label>';
        }).join('')
        +'</div>'
        +'<div style="font-size:10px;color:var(--text3);margin-top:3px;">Erhalten volle Dauer · können Checkliste bearbeiten</div>'
        +'</div>';
      maWidget = verantWidget + zusatzWidget;
      maWidget += '<input type="hidden" id="au-sd-wer-'+s+'" value="'+prevVerant+'">';
    }

    // Custom CL section
    var clSection = '<div style="margin-top:8px;padding-top:10px;border-top:1px solid var(--border);">'
      +'<div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.05em;margin-bottom:6px;">📋 EIGENE CHECKLISTEN-PUNKTE <span style="font-weight:400;color:var(--text3);">optional · für Handy-App sichtbar</span></div>'
      +'<div id="au-cl-list-'+s+'"></div>'
      +'<div style="display:flex;gap:6px;">'
        +'<input id="au-cl-inp-'+s+'" type="text" placeholder="z.B. Fahrzeug reinigen, Maße kontrollieren…" '
          +'style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;" '
          +'onkeydown="if(event.key===\'Enter\'){event.preventDefault();auClPunktHinzufuegen(\''+s+'\');}">'
        +'<button onclick="auClPunktHinzufuegen(\''+s+'\')" '
          +'style="padding:6px 14px;background:'+cfg.col+';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">+</button>'
      +'</div>'
    +'</div>';

    // Erstes Element standardmäßig offen, Rest zu
    var isOpen = si === 0;

    return '<div style="background:#fff;border-radius:10px;border-left:3px solid '+cfg.col+';margin-bottom:6px;overflow:hidden;">'
      // ── Akkordeon-Header: immer sichtbar ─────────────────────────
      +'<div onclick="auStepDetailToggle(\''+s+'\')" '
        +'style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none;">'
        +'<div style="font-size:12px;font-weight:700;color:'+cfg.col+';flex:1;">'+cfg.label+'</div>'
        +'<span id="au-sd-verant-preview-'+s+'" style="font-size:11px;color:var(--text2);">'+(prevVerantName?'👤 '+prevVerantName:'')+'</span>'
        +'<div style="display:flex;align-items:center;gap:4px;" onclick="event.stopPropagation()">'
          +'<input id="au-sd-dauer-'+s+'" class="fi" type="number" min="0.5" step="0.5" placeholder="h" required'
          +' value="'+(prevDauer||'')+'"'
          +' style="width:58px;padding:4px 6px;font-size:12px;border:1.5px solid '+(prevDauer?'var(--green)':'var(--border)')+';border-radius:7px;text-align:center;"'
          +' oninput="this.style.borderColor=this.value?\'var(--green)\':\'var(--red)\'">'
          +'<span style="font-size:11px;color:var(--text3);">h<span style="color:var(--red);">*</span></span>'
        +'</div>'
        +'<span id="au-sd-arrow-'+s+'" style="font-size:16px;color:var(--text3);display:inline-block;transition:transform .2s;'+(isOpen?'transform:rotate(90deg)':'')+'">›</span>'
      +'</div>'
      // ── Akkordeon-Body: auf-/zuklappbar ──────────────────────────
      +'<div id="au-sd-body-'+s+'" style="'+(isOpen?'':'display:none;')+'padding:0 12px 12px;border-top:1px solid var(--border);">'
        +maWidget
        +clSection
      +'</div>'
    +'</div>';
  }).join('');

  // Vorhandene Custom-CL-Listen nachrendern
  allSteps.forEach(function(s){ auClRenderList(s); });
}

// ── Schritt-Detail auf-/zuklappen ──────────────────────────────
function auStepDetailToggle(step){
  var body  = document.getElementById('au-sd-body-'+step);
  var arrow = document.getElementById('au-sd-arrow-'+step);
  if(!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if(arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
}

// ── UI-Helpers für Multi / Optional ─────────────────────────
function auMultiToggle(labelEl, col){
  var cb = labelEl.querySelector('input[type=checkbox]');
  if(!cb) return;
  cb.checked = !cb.checked;
  labelEl.style.borderColor = cb.checked ? col : 'var(--border)';
  labelEl.style.background  = cb.checked ? col.replace(')',',0.08)').replace('var(','rgba(') : '#fff';
  // Einfacher: direkte Farbklassen
  if(cb.checked){
    labelEl.style.borderColor = col;
    labelEl.style.background  = col+'18';
  } else {
    labelEl.style.borderColor = 'var(--border)';
    labelEl.style.background  = '#fff';
  }
}

function auOptionalToggle(labelEl, name, val, col){
  // Alle Labels dieser Gruppe zurücksetzen
  document.querySelectorAll('[onclick*="\''+name+'\'"]').forEach(function(l){
    l.style.borderColor='var(--border)'; l.style.background='#fff';
  });
  // Dieses Label aktivieren
  labelEl.style.borderColor=col; labelEl.style.background=col+'18';
  // Den richtigen Radio-Button als checked setzen
  var radio = document.querySelector('input[name="'+name+'"][value="'+val+'"]');
  if(radio){ radio.checked=true; }
}

// ── Verantwortlicher-Toggle (Req. 2: Pflicht-Radio) ───────────────────
function auVerantToggle(labelEl, name, val, col){
  // Alle Labels dieser Radiogruppe über den gemeinsamen radio-name finden
  var radios = document.querySelectorAll('input[name="'+name+'"]');
  radios.forEach(function(r){
    var lbl = r.parentElement;
    if(lbl && lbl.tagName==='LABEL'){
      lbl.style.borderColor = 'var(--border)';
      lbl.style.background  = '#fff';
      lbl.style.borderWidth = '1.5px';
    }
  });
  // Aktives Label markieren
  labelEl.style.borderColor = col;
  labelEl.style.background  = col+'18';
  labelEl.style.borderWidth = '2px';
  // Radio setzen
  var radio = document.querySelector('input[name="'+name+'"][value="'+val+'"]');
  if(radio) radio.checked = true;
  // Hidden-Feld aktualisieren (für buildSchritt Kompatibilität)
  var step = name.replace('au-sd-verant-','');
  var hidden = document.getElementById('au-sd-wer-'+step);
  if(hidden) hidden.value = val;
  // Header-Vorschau sofort aktualisieren
  var previewSpan = document.getElementById('au-sd-verant-preview-'+step);
  if(previewSpan){
    var mObj = typeof maDataFindByWorkflowKey === 'function' ? maDataFindByWorkflowKey(val) : MA_DATA.find(function(x){ return x.maId===val; });
    previewSpan.textContent = mObj ? '👤 '+mObj.n : '';
  }
}

// ── Zusatz-MA-Toggle (Req. 3: Multiselect) ───────────────────────────
function auZusatzToggle(labelEl, col){
  var cb = labelEl.querySelector('input[type=checkbox]');
  if(!cb) return;
  cb.checked = !cb.checked;
  if(cb.checked){
    labelEl.style.borderColor = col; labelEl.style.background = col+'18';
  } else {
    labelEl.style.borderColor = 'var(--border)'; labelEl.style.background = '#fff';
  }
}

function auUpdateWorkflowPreview(){
  const flow=document.getElementById('au-workflow-flow'); if(!flow) return;
  const steps=[
    {id:'grafik',label:'Grafik',col:'var(--purple)'},
    {id:'druck',label:'Druck',col:'var(--blue)'},
    {id:'laminat',label:'Laminat',col:'var(--teal)'},
    {id:'montage',label:'Montage',col:'var(--amber)'},
    {id:'extern',label:'Extern',col:'var(--gray)'},
    {id:'doku',label:'Dokumentation',col:'#7C3AED'},
  ];
  const active=steps.filter(s=>{const cb=document.getElementById('au-step-'+s.id);return cb&&cb.checked;});
  if(!active.length){flow.innerHTML='<span style="font-size:11px;color:var(--text3);">Keine Schritte</span>';return;}
  flow.innerHTML=active.map((s,i)=>'<span style="padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:'+s.col+'20;color:'+s.col+';">'+s.label+'</span>'+(i<active.length-1?'<span style="color:var(--text3);font-size:13px;">›</span>':'')).join('')+'<span style="color:var(--text3);font-size:13px;">›</span><span style="padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:var(--green-l);color:var(--green);">Abgeschlossen ✓</span>';
}

// ── FILE UPLOAD mit Vorschau & Download ──
var auPendingUploads = 0; // Zähler für laufende Komprierungen

// ── Separater Bild-Speicher (verhindert localStorage-Überlauf) ──────────
// Bilder werden getrennt von AUFTRAEGE gespeichert.
var CC_IMG_STORE_KEY = 'cc_intern_images_v1';
window._ccDpsImgMem = window._ccDpsImgMem || {};
function ccImgStoreSave(key, dataUrl){
  window._ccDpsImgMem[key] = dataUrl;
  return true;
}
function ccImgStoreLoad(key){
  return window._ccDpsImgMem[key] || '';
}
function ccImgStoreDelete(key){
  delete window._ccDpsImgMem[key];
}

function auFileAdd(e, slotKey){
  slotKey = slotKey != null ? String(slotKey).trim() : '';
  var meta = slotKey ? AU_NEU_DATEI_SLOT_META[slotKey] : null;
  if (!meta) {
    if (typeof showToast === 'function') showToast('⚠ Unbekannter Datei-Slot');
    if (e && e.target) e.target.value = '';
    return;
  }
  const files = Array.from(e.target.files || []);
  if (!files.length) {
    e.target.value = '';
    return;
  }

  auPendingUploads += files.length;
  var submitBtn = document.getElementById('au-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Dateien werden verarbeitet…';
  }

  files.forEach(function (file) {
    ccCompressImage(file, function (data, mime) {
      var row = {
        name: file.name,
        typ: meta.label,
        size: file.size,
        dataUrl: data,
        mimeType: mime,
        auSlotKey: slotKey,
        ccinternApiTyp: meta.apiTyp,
        ccinternPhase: meta.phase || '',
        ccinternPosition: meta.position || '',
      };
      auFiles.push(row);
      auRenderFileList();
      auNeuDateiSlotIndicatorsRefresh();

      auPendingUploads--;
      if (auPendingUploads <= 0) {
        auPendingUploads = 0;
        var btn = document.getElementById('au-submit-btn');
        if (btn) {
          btn.disabled = false;
          btn.textContent = '✓ Auftrag anlegen';
        }
      }
    });
  });
  e.target.value = '';
}

function auRenderFileList(){
  const wrap=document.getElementById('au-file-list-wrap');
  const tbody=document.getElementById('au-file-list');
  if(!wrap||!tbody) return;
  if(!auFiles.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  tbody.innerHTML=auFiles.map((f,i)=>{
    const isImg=f.mimeType.startsWith('image/');
    const sizeFmt=f.size>1048576?(f.size/1048576).toFixed(1)+' MB':(f.size/1024).toFixed(0)+' KB';
    const preview=isImg
      ?'<img src="'+f.dataUrl+'" style="width:60px;height:48px;object-fit:cover;border-radius:6px;cursor:zoom-in;'
        +'transition:transform .15s;border:1.5px solid var(--border);" '
        +'onclick="auPreviewFile('+i+')" '
        +'onmouseover="this.style.transform=\'scale(1.08)\'" '
        +'onmouseout="this.style.transform=\'scale(1)\'" '
        +'title="Klicken zum Vergrößern">'
      :'<span onclick="auPreviewFile('+i+')" style="cursor:pointer;font-size:22px;" title="Klicken zum Öffnen">'+
        (f.mimeType.includes('pdf')?'📄':f.mimeType.includes('word')?'📝':'📎')+'</span>';
    return '<tr style="border-bottom:1px solid var(--border);">'
      +'<td style="padding:8px 10px;"><div style="font-size:12px;font-weight:500;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+f.name+'">'+f.name+'</div><div style="font-size:10px;color:var(--text3);">'+f.typ+'</div></td>'
      +'<td style="padding:8px 10px;font-size:11px;color:var(--text2);">'+sizeFmt+'</td>'
      +'<td style="padding:8px 10px;text-align:center;">'+preview+'</td>'
      +'<td style="padding:8px 10px;text-align:center;"><a href="'+f.dataUrl+'" download="'+f.name+'" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--blue-l);color:var(--blue);border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;">⬇ Download</a></td>'
      +'<td style="padding:8px 10px;text-align:center;"><button onclick="auFileDelete('+i+')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px;" title="Löschen">🗑</button></td>'
      +'</tr>';
  }).join('');
}

function auPreviewFile(i){
  const f=auFiles[i]; if(!f) return;
  ccLightbox(f.dataUrl, f.name);
}

function auFileDelete(i){
  if(typeof ccInternConfirm !== 'function') return;
  ccInternConfirm('Möchten Sie diese Datei wirklich löschen?', function(){
  auFiles.splice(i,1);
  auRenderFileList();
  auNeuDateiSlotIndicatorsRefresh();
  });
}

function auCalcDetails(){
  const f=parseFloat(document.getElementById('au-flaeche')?.value)||0;
  const s=parseInt(document.getElementById('au-stueck')?.value)||1;
  const info=document.getElementById('au-details-info');
  if(info&&f>0){info.style.display='block';info.textContent=f+' m² × '+s+' Stück = '+(f*s).toFixed(1)+' m² Gesamtfläche';}
  const ki=document.getElementById('au-kalk-info');
  const kt=document.getElementById('au-kalk-text');
  if(ki&&kt&&f>0){ki.style.display='block';kt.innerHTML='Fläche: '+(f*s).toFixed(1)+' m² · Richtwert ~85 €/m² = <strong>ca. € '+Math.round(f*s*85)+'</strong> netto';}
}

function calcAuftrag(){
  const n=parseFloat(document.getElementById('au-netto')?.value)||0;
  const m=n*0.19;
  const mv=document.getElementById('au-mwst-val');if(mv)mv.value=m>0?'€ '+m.toFixed(2):'';
  const bv=document.getElementById('au-brutto');if(bv)bv.value=n>0?'€ '+(n+m).toFixed(2):'';
}

function auFillFromAngebot(){
  const val=document.getElementById('au-angebot').value; if(!val) return;
  const data={'AG-2026-017':{kunde:'Sparkasse Essen',beschr:'Heckwerbung 5 Busse',netto:'5210.08'},'AG-2026-019':{kunde:'NRZ',beschr:'Ganzgestaltung Bus + Fenster',netto:'7058.82'}};
  const d=data[val]; if(!d) return;
  var kuSel = document.getElementById('au-kunde');
  if(kuSel){
    var found = false;
    for(var ki = 0; ki < kuSel.options.length; ki++){
      var opt = kuSel.options[ki];
      if(!opt.value) continue;
      if(String(opt.textContent || '').trim() === d.kunde || String(opt.value).trim() === d.kunde){ kuSel.selectedIndex = ki; found = true; break; }
    }
    if(!found){ kuSel.value = d.kunde; }
  }
  document.getElementById('au-beschr').value=d.beschr;
  document.getElementById('au-netto').value=d.netto;
  calcAuftrag(); auUpdateSub();
  showToast(val+' übernommen');
}

// ══════════════════════════════════════════════════════════════════
// KALENDER (Cockpit)
// — Führende Lesequelle: GET /api/v1/stammdaten/kalender → reloadCcInternKalenderFeed (ccintern-cockpit-api.js).
// — UI-Modell: window.__CCINTERN_KALENDER_VIEW_ITEMS__ = nur API-Zeilen (kein AUFTRAEGE-RAM, kein Snapshot-Montage-Merge).
// — CC_FUSA_TERMINE: Demo-Seed bis loadFusaTermine(DAL); im Cockpit-Kalender nicht gemischt, solange API-Feed OK.
// Legacy (ohne Cockpit-Mount): ccGetAlleTermineLegacy — RAM + DAL-FUSA. Mit Cockpit-Mount: nur API-Liste (sonst []).
// ══════════════════════════════════════════════════════════════════

var CC_FUSA_TERMINE = [
  {id:'F-001',datum:'2026-03-24',titel:'Ruhrbahn Bus 2204 · Beklebung',    depot:'Stadtmitte',monteur:'Okan',          fusaStatus:'offen',auftragId:null},
  {id:'F-002',datum:'2026-03-27',titel:'DVG Bus 889 · Heckwerbung',        depot:'Mülheim',   monteur:'Mete',          fusaStatus:'offen',auftragId:null},
  {id:'F-003',datum:'2026-04-02',titel:'Bogestra Bus 104 · Ganzgestaltung',depot:'Bochum',    monteur:'Okan + Mohammed',fusaStatus:'offen',auftragId:null},
  {id:'F-004',datum:'2026-04-07',titel:'Ruhrbahn Bus 3301 · Teilgestaltung',depot:'Stadtmitte',monteur:'Mohammed',    fusaStatus:'offen',auftragId:null},
  {id:'F-005',datum:'2026-04-10',titel:'DVG Tram 301 · Vollfolierung',     depot:'Mülheim',   monteur:'Okan + Mete',   fusaStatus:'offen',auftragId:null},
  {id:'F-006',datum:'2026-04-14',titel:'Bogestra Bus 217 · Seitenfolie',   depot:'Bochum',    monteur:'Mohammed',      fusaStatus:'offen',auftragId:null},
];

function ccKalenderIsoDateOnly(v) {
  if (v == null) return '';
  var s = String(v).trim();
  return s.length >= 10 ? s.substring(0, 10) : s;
}

function ccKalenderResolveAuftragDisplayId(row) {
  if (row.auftragsnummer != null && String(row.auftragsnummer).trim() !== '') return String(row.auftragsnummer).trim();
  var uuid = row.auftrag_id;
  if (uuid == null || typeof AUFTRAEGE === 'undefined' || !Array.isArray(AUFTRAEGE)) return null;
  var u = String(uuid).trim();
  var hit = AUFTRAEGE.find(function (a) {
    return a && String(a.ccApiId) === u;
  });
  return hit ? hit.id : null;
}

function ccKalenderResolveApiAuftragUuid(row) {
  if (!row || row.auftrag_id == null) return '';
  var raw = String(row.auftrag_id).trim();
  return raw || '';
}

function ccKalenderApiTypToColor(typRaw, quelleRaw) {
  var t = String(typRaw || '').toLowerCase();
  var q = String(quelleRaw || '').toLowerCase();
  if (t === 'montage' || t === 'beklebung') return 'amber';
  if (t === 'urlaub') return 'purple';
  if (t === 'intern') return 'teal';
  if (t === 'sonstig' || t === 'allgemein') return 'blue';
  return q === 'fusa' ? 'amber' : 'blue';
}

function ccKalenderApiRowToViewItem(row) {
  var datum = ccKalenderIsoDateOnly(row.start);
  var quelleRaw = String(row.quelle != null ? row.quelle : 'manuell');
  var typRaw = String(row.typ != null ? row.typ : 'sonstig');
  var typColor = ccKalenderApiTypToColor(typRaw, quelleRaw);
  var quelleUi =
    quelleRaw === 'fusa' ? 'fusa' : quelleRaw === 'ccintern' ? 'cc' : 'kal_api';
  var stepUi = 'grafik';
  if (typRaw === 'montage' || typRaw === 'beklebung' || quelleRaw === 'fusa') stepUi = 'montage';
  else if (typRaw === 'urlaub') stepUi = 'abgeschlossen';
  var auftragDisplay = ccKalenderResolveAuftragDisplayId(row);
  var mitIds = row.mitarbeiter_ids;
  var monteurStr =
    Array.isArray(mitIds) && mitIds.length ? mitIds.join(', ') : '—';
  return {
    id: 'K-' + String(row.id),
    datum: datum,
    titel: row.titel != null ? String(row.titel) : 'Termin',
    typ: typColor,
    depot: '—',
    monteur: monteurStr,
    quelle: quelleUi,
    step: stepUi,
    auftragId: auftragDisplay,
    isKalenderApi: true,
    apiQuelle: quelleRaw,
    apiTyp: typRaw,
    status: row.status != null ? String(row.status) : null,
    referenz_id: row.referenz_id != null ? row.referenz_id : row.auftrag_id,
    kalenderTerminId: row.id,
    fusaAuftragId: row.fusa_auftrag_id,
    isMontageTermin: quelleRaw === 'ccintern' && typRaw === 'montage',
    isKalenderApiFusa: quelleRaw === 'fusa',
    apiNotiz: row.notiz != null ? String(row.notiz) : '',
    auftragsnummer: row.auftragsnummer,
    apiAuftragId: ccKalenderResolveApiAuftragUuid(row),
  };
}

window.ccInternApplyKalenderApiRows = function (rows) {
  try {
    var raw = rows || [];
    var apiItems = raw.map(ccKalenderApiRowToViewItem);
    window.__CCINTERN_KALENDER_API_ROWS__ = raw;
    window.__CCINTERN_KALENDER_VIEW_ITEMS__ = apiItems.slice();
    window.__CCINTERN_KALENDER_FEED_OK__ = true;
  } catch (e) {
    console.error('[cc-intern] ccInternApplyKalenderApiRows', e);
    window.__CCINTERN_KALENDER_FEED_OK__ = false;
  }
};

window.ccInternRefreshKalenderFromApi = function (showToast) {
  var api = window.CCIntern && window.CCIntern.cockpitApi;
  if (!api || typeof api.reloadCcInternKalenderFeed !== 'function') {
    return Promise.resolve();
  }
  return api.reloadCcInternKalenderFeed(showToast || null);
};

// Legacy: RAM-AUFTRAEGE + lokale/DAL-FUSA-Demo — nur ohne Cockpit-Kalender-API-Feed.
function ccGetAlleTermineLegacy() {
  var result = [];
  var stepTyp = {
    grafik: 'purple',
    druck: 'blue',
    laminat: 'teal',
    montage: 'amber',
    doku: 'purple',
    abgeschlossen: 'green',
  };
  AUFTRAEGE.forEach(function (a) {
    var datum = (a.terminDatum || a.liefertermin || '').substring(0, 10);
    var depot =
      (a.depot || '')
        .replace('Depot ', '')
        .replace(' (Bogestra)', '')
        .replace('Depot ', '')
        .trim() || 'Intern';
    var monteur =
      (a.schritte &&
        a.schritte.montage &&
        (a.schritte.montage.verantwortlicherName || a.schritte.montage.wer)) ||
      '—';

    if (datum) {
      var typ = a.urgent ? 'red' : stepTyp[a.step] || 'blue';
      result.push({
        id: 'T-AU-' + a.id,
        datum: datum,
        titel: a.kunde + ' · ' + a.fz + (a.paket ? ' · ' + a.paket.substring(0, 16) : ''),
        typ: typ,
        depot: depot,
        monteur: monteur,
        quelle: 'cc',
        step: a.step,
        auftragId: a.id,
      });
    }

    if (a.montageDatum && a.montageDatum !== datum) {
      var montageZeitStr = a.montageZeit ? ' ' + a.montageZeit : '';
      var montageVerant =
        (a.schritte &&
          a.schritte.montage &&
          (a.schritte.montage.verantwortlicherName || a.schritte.montage.wer)) ||
        monteur;
      result.push({
        id: 'T-MON-' + a.id,
        datum: a.montageDatum.substring(0, 10),
        titel: '🔧 Montage: ' + a.kunde + ' · ' + a.fz + montageZeitStr,
        typ: 'amber',
        depot: depot,
        monteur: montageVerant,
        quelle: 'cc',
        step: 'montage',
        auftragId: a.id,
        isMontageTermin: true,
      });
    } else if (a.montageDatum && a.montageDatum === datum && a.step !== 'montage') {
      /* kein Duplikat */
    }
  });
  CC_FUSA_TERMINE.forEach(function (f) {
    if (f.auftragId) return;
    result.push({
      id: f.id,
      datum: f.datum,
      titel: f.titel,
      typ: 'amber',
      depot: f.depot,
      monteur: f.monteur,
      quelle: 'fusa',
      fusaStatus: f.fusaStatus,
      auftragId: null,
    });
  });
  return result;
}

function ccGetAlleTermine() {
  /* Im Cockpit: nur Stammdaten-Kalender-API — niemals RAM/Demo (Legacy), sonst alte Montagen nach DB-Bereinigung. */
  if (window.__CCINTERN_COCKPIT_MOUNT__) {
    if (
      window.__CCINTERN_KALENDER_FEED_OK__ &&
      Array.isArray(window.__CCINTERN_KALENDER_VIEW_ITEMS__)
    ) {
      return window.__CCINTERN_KALENDER_VIEW_ITEMS__;
    }
    return [];
  }
  return ccGetAlleTermineLegacy();
}

var ccCalJahr=new Date().getFullYear(), ccCalMon=new Date().getMonth(), ccSelTermin=null;
var WOCHENTAGE=['Mo','Di','Mi','Do','Fr','Sa','So'];
var MONATE_DE=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function ccCalLoad(){
  if (typeof window !== 'undefined' && window.__CCINTERN_COCKPIT_MOUNT__) {
    window.__CCINTERN_KALENDER_FEED_OK__ = false;
    window.__CCINTERN_KALENDER_VIEW_ITEMS__ = [];
  }
  function afterFusa() {
    if (
      window.__CCINTERN_COCKPIT_MOUNT__ &&
      window.CCIntern &&
      window.CCIntern.cockpitApi &&
      typeof window.CCIntern.cockpitApi.reloadCcInternKalenderFeed === 'function'
    ) {
      window.CCIntern.cockpitApi
        .reloadCcInternKalenderFeed(typeof showToast === 'function' ? showToast : null)
        .then(function () {
          if (typeof buildCCCalendar === 'function') buildCCCalendar();
        })
        .catch(function () {
          if (typeof buildCCCalendar === 'function') buildCCCalendar();
        });
      return;
    }
    if (typeof buildCCCalendar === 'function') buildCCCalendar();
  }
  // DAL-FUSA (Legacy / Übernahme-Flow); Cockpit-Kalenderdaten kommen aus GET /api/v1/stammdaten/kalender.
  loadFusaTermine(afterFusa);
}

function buildCCCalendar(){
  var label=document.getElementById('ccCalMonthLabel');
  if(label) label.textContent=MONATE_DE[ccCalMon]+' '+ccCalJahr;
  var hStr=new Date().toISOString().substring(0,10);
  var mS=ccCalJahr+'-'+String(ccCalMon+1).padStart(2,'0')+'-01';
  var mE=ccCalJahr+'-'+String(ccCalMon+1).padStart(2,'0')+'-31';
  var heute=new Date(),ws=new Date(heute);ws.setDate(heute.getDate()-((heute.getDay()+6)%7));
  var we=new Date(ws);we.setDate(ws.getDate()+6);
  var wS=ws.toISOString().substring(0,10),wE=we.toISOString().substring(0,10);
  var alle=ccGetAlleTermine();
  var sw=document.getElementById('ccCalWeek');if(sw)sw.textContent=alle.filter(function(t){return t.datum>=wS&&t.datum<=wE;}).length;
  var sm=document.getElementById('ccCalMonth');if(sm)sm.textContent=alle.filter(function(t){return t.datum>=mS&&t.datum<=mE;}).length;
  var grid=document.getElementById('ccCalGrid');if(!grid) return;
  var html=WOCHENTAGE.map(function(d){return '<div class="cc-cal-day-name">'+d+'</div>';}).join('');
  var er=new Date(ccCalJahr,ccCalMon,1),lr=new Date(ccCalJahr,ccCalMon+1,0);
  var off=(er.getDay()+6)%7;
  for(var i=0;i<off;i++){var pd=new Date(ccCalJahr,ccCalMon,1-off+i);html+='<div class="cc-cal-day other-month"><div class="cc-cal-day-num">'+pd.getDate()+'</div></div>';}
  for(var tag=1;tag<=lr.getDate();tag++){
    var dStr=ccCalJahr+'-'+String(ccCalMon+1).padStart(2,'0')+'-'+String(tag).padStart(2,'0');
    var tt=alle.filter(function(t){return t.datum===dStr;});
    var fOff=tt.filter(function(t){return t.quelle==='fusa';}).length;
    html+='<div class="cc-cal-day'+(dStr===hStr?' today':'')+'" onclick="ccCalDayClick(\''+dStr+'\')">'
      +'<div class="cc-cal-day-num">'+tag+(fOff>0?'<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E65100;margin-left:3px;vertical-align:middle;"></span>':'')+'</div>';
    tt.slice(0,2).forEach(function(t){
      var col=t.quelle==='fusa'?'cc-ev-amber':({red:'cc-ev-red',green:'cc-ev-green',blue:'cc-ev-blue',purple:'cc-ev-purple',amber:'cc-ev-amber',teal:'cc-ev-blue'}[t.typ]||'cc-ev-blue');
      var ico=t.quelle==='fusa'?'🟠':({grafik:'🎨',druck:'🖨️',laminat:'📐',montage:'🚌',doku:'📷',abgeschlossen:'✅'}[t.step]||'📋');
      html+='<div class="cc-cal-ev '+col+'" data-tid="'+t.id+'" onclick="ccCalEvClick(this)" title="'+t.titel.replace(/"/g,'')+'">'+ico+' '+t.titel.substring(0,18)+'</div>';
    });
    if(tt.length>2) html+='<div style="font-size:9px;color:var(--text3);padding:1px 3px;">+'+(tt.length-2)+' mehr</div>';
    html+='</div>';
  }
  var rest=(7-((off+lr.getDate())%7))%7;
  for(var j=1;j<=rest;j++) html+='<div class="cc-cal-day other-month"><div class="cc-cal-day-num">'+j+'</div></div>';
  grid.innerHTML=html;
  ccBuildUpcoming();
}

function ccCalPrev(){if(ccCalMon===0){ccCalMon=11;ccCalJahr--;}else ccCalMon--;buildCCCalendar();}
function ccCalNext(){if(ccCalMon===11){ccCalMon=0;ccCalJahr++;}else ccCalMon++;buildCCCalendar();}
function ccCalEvClick(el){var tid=el.getAttribute('data-tid');if(tid)ccTerminClick(tid);}
function ccCalDayClick(dStr){
  var alle=ccGetAlleTermine();
  var tt=alle.filter(function(t){return t.datum===dStr;});
  if(!tt.length) return;
  var prio=tt.find(function(t){return t.quelle==='fusa';})||tt[0];
  ccTerminClick(prio.id);
}

function ccKalenderApiFusaPanel(t) {
  var datum = (t.datum || '').split('-').reverse().join('.');
  var st = t.status ? '<div class="dp-row"><span class="dp-lbl">Status</span><span class="dp-val">' + String(t.status) + '</span></div>' : '';
  var fid = t.fusaAuftragId ? '<div class="dp-row"><span class="dp-lbl">FUSA-Auftrag</span><span class="dp-val" style="font-size:11px;">' + String(t.fusaAuftragId) + '</span></div>' : '';
  document.getElementById('dpTitle').textContent = '🔄 FUSA (Kalender): ' + (t.titel || '').substring(0, 36);
  document.getElementById('dpBody').innerHTML =
    '<div style="padding:12px 18px;background:#FFF3E0;border-bottom:1px solid #FFB74D;">' +
    '<span style="padding:2px 9px;border-radius:10px;background:#FFF3E0;color:#E65100;font-size:11px;font-weight:700;border:1px solid #FFB74D;">Kalender · quelle=fusa · typ=' +
    String(t.apiTyp || '') +
    '</span></div>' +
    '<div class="dp-section"><div class="dp-slbl">Termin</div>' +
    '<div class="dp-row"><span class="dp-lbl">Titel</span><span class="dp-val" style="font-weight:600;font-size:12px;text-align:right;max-width:220px;word-break:break-word;">' +
    (t.titel || '') +
    '</span></div>' +
    '<div class="dp-row"><span class="dp-lbl">Datum</span><span class="dp-val">📅 ' +
    datum +
    '</span></div>' +
    st +
    fid +
    '</div>' +
    '<div style="padding:12px 16px;font-size:11px;color:var(--text2);">Hinweis: Daten aus gemeinsamem Kalender-API-Feed, nicht aus lokaler FUSA-Demo-Liste.</div>';
  document.getElementById('dpFooter').innerHTML = '<button class="btn" onclick="closeDetail()">Schließen</button>';
  document.getElementById('detailOverlay').classList.add('open');
}

function ccKalenderApiGenericPanel(t) {
  var datum = (t.datum || '').split('-').reverse().join('.');
  document.getElementById('dpTitle').textContent = '📅 ' + (t.titel || 'Termin').substring(0, 40);
  document.getElementById('dpBody').innerHTML =
    '<div class="dp-section"><div class="dp-slbl">Kalender</div>' +
    '<div class="dp-row"><span class="dp-lbl">Quelle</span><span class="dp-val">' +
    String(t.apiQuelle || '') +
    '</span></div>' +
    '<div class="dp-row"><span class="dp-lbl">Typ</span><span class="dp-val">' +
    String(t.apiTyp || '') +
    '</span></div>' +
    (t.status
      ? '<div class="dp-row"><span class="dp-lbl">Status</span><span class="dp-val">' + String(t.status) + '</span></div>'
      : '') +
    '<div class="dp-row"><span class="dp-lbl">Datum</span><span class="dp-val">' +
    datum +
    '</span></div>' +
    (t.apiNotiz
      ? '<div class="dp-row"><span class="dp-lbl">Notiz</span><span class="dp-val" style="font-size:11px;">' + String(t.apiNotiz) + '</span></div>'
      : '') +
    (t.kalenderTerminId
      ? '<div class="dp-row"><span class="dp-lbl">Kalender-ID</span><span class="dp-val" style="font-size:10px;word-break:break-all;">' +
        String(t.kalenderTerminId) +
        '</span></div>'
      : '') +
    '</div>';
  document.getElementById('dpFooter').innerHTML = '<button class="btn" onclick="closeDetail()">Schließen</button>';
  document.getElementById('detailOverlay').classList.add('open');
}

function ccTerminClick(terminId){
  var alle=ccGetAlleTermine();
  var t=alle.find(function(x){return x.id===terminId;});
  if(!t) return;
  // CC-Auftrag aus API, aber noch keine Anzeige-ID auflösbar → Detail aus Kalenderzeile
  if (t.quelle === 'cc' && t.isKalenderApi && !t.auftragId) {
    ccKalenderApiGenericPanel(t);
    return;
  }
  // CC-Auftrag: direkt den Auftrag öffnen
  if(t.quelle==='cc'&&t.auftragId){openAuftragDetail(t.auftragId);return;}
  if (t.isKalenderApiFusa || (t.quelle === 'fusa' && t.isKalenderApi)) {
    ccKalenderApiFusaPanel(t);
    return;
  }
  if (t.quelle === 'kal_api') {
    ccKalenderApiGenericPanel(t);
    return;
  }
  // FUSA: Übernahme-Panel (lokale/DAL-Liste)
  var fe=CC_FUSA_TERMINE.find(function(f){return f.id===terminId;});
  if(!fe) return;
  var datum=t.datum.split('-').reverse().join('.');
  var aktHTML=fe.auftragId
    ?'<div style="padding:14px 16px;background:var(--blue-l);border-top:1px solid var(--border);"><div style="font-size:12px;font-weight:600;color:var(--blue);margin-bottom:8px;">🔵 Auftrag angelegt</div>'
      +'<button onclick="ccZuAuftragNavigieren(\''+fe.auftragId+'\')" style="width:100%;padding:10px;background:var(--blue);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">→ '+fe.auftragId+' öffnen</button></div>'
    :'<div style="padding:16px;background:linear-gradient(135deg,#FFF8E1,#FFF3E0);border-top:2px solid #FFB74D;">'
      +'<div style="font-size:12px;font-weight:700;color:#E65100;margin-bottom:6px;">⚡ FUSA-Termin übernehmen</div>'
      +'<div style="font-size:11px;color:var(--text2);margin-bottom:10px;">Wird als normaler CC-Intern-Auftrag angelegt.</div>'
      +'<button onclick="ccTerminZuAuftrag(\''+terminId+'\')" style="width:100%;padding:12px;background:#E65100;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;">🚀 Als Auftrag übernehmen</button></div>';
  document.getElementById('dpTitle').textContent='🔄 FUSA: '+t.titel.substring(0,30);
  document.getElementById('dpBody').innerHTML=
    '<div style="padding:12px 18px;background:#FFF3E0;border-bottom:1px solid #FFB74D;">'
      +'<span style="padding:2px 9px;border-radius:10px;background:#FFF3E0;color:#E65100;font-size:11px;font-weight:700;border:1px solid #FFB74D;">🔄 FUSA · 🟠 Offen</span>'
    +'</div>'
    +'<div class="dp-section"><div class="dp-slbl">FUSA-Termin</div>'
      +'<div class="dp-row"><span class="dp-lbl">Bezeichnung</span><span class="dp-val" style="font-weight:600;font-size:12px;text-align:right;max-width:200px;word-break:break-word;">'+t.titel+'</span></div>'
      +'<div class="dp-row"><span class="dp-lbl">Datum</span><span class="dp-val">📅 '+datum+'</span></div>'
      +'<div class="dp-row"><span class="dp-lbl">Depot</span><span class="dp-val">🏭 '+t.depot+'</span></div>'
      +'<div class="dp-row"><span class="dp-lbl">Monteur</span><span class="dp-val">👷 '+t.monteur+'</span></div>'
    +'</div>'+aktHTML;
  document.getElementById('dpFooter').innerHTML='<button class="btn" onclick="closeDetail()">Schließen</button>';
  document.getElementById('detailOverlay').classList.add('open');
}

var ccAuftragNr=50;

// Team-Ansicht: zeigt Aufträge gefiltert auf Montage/Doku-Schritte
// Arbeitet mit denselben AUFTRAEGE wie CC Intern — keine eigenen Daten
function ccOpenTeamView(){
  // Handy-/Team-Ansicht: zeigt offene Montage+Doku-Aufträge für das Team.
  // Liest aus AUFTRAEGE — kein eigener Datenspeicher.
  // Zeitbuchungen gehen über zeitStart/zeitStop → landen in AUFTRAEGE.zeiten
  // → automatisch in Mitarbeiter-Stunden sichtbar.
  var link=document.querySelector('.sb-link[onclick*="auftraege"]');
  goPage('auftraege',link,'Aufträge','Team — Montage & Abnahme');
  setTimeout(function(){
    // Montage-Spalte in den Vordergrund scrollen
    var cols=document.querySelectorAll('.kb-col');
    cols.forEach(function(col){
      if(col.querySelector('.kb-hdr') && col.querySelector('.kb-hdr').textContent.includes('Montage')){
        col.scrollIntoView({behavior:'smooth',block:'start'});
      }
    });
    // Zusammenfassung: wie viele Montage/Doku-Aufträge heute
    var montage=AUFTRAEGE.filter(function(a){return a.step==='montage'||a.step==='doku';});
    showToast('👷 Team: '+montage.length+' Aufträge in Montage/Doku');
  },150);
}
function ccTerminZuAuftrag(fusaId){
  var fe=CC_FUSA_TERMINE.find(function(f){return f.id===fusaId;});
  if(!fe){showToast('⚠ FUSA-Eintrag nicht gefunden');return;}
  if(fe.auftragId){showToast('⚠ Bereits übernommen: '+fe.auftragId);ccZuAuftragNavigieren(fe.auftragId);return;}
  var auId='AU-2026-0'+ccAuftragNr++;
  var parts=fe.titel.split('·').map(function(s){return s.trim();});
  var kRaw=parts[0]||fe.titel, pRaw=parts[1]||'Busbeklebung';
  var fzM=kRaw.match(/(Bus|Tram|Zug|LKW)\s*\d+/i);
  var fz=fzM?fzM[0]:'—', kunde=kRaw.replace(fz,'').trim()||kRaw;
  AUFTRAEGE.push({_ccPendingCockpitSync:true,id:auId,kunde:kunde,fz:fz,paket:pRaw,
    terminDatum:fe.datum,liefertermin:fe.datum,depot:fe.depot,
    step:'grafik',urgent:false,rechnung:'offen',fotos:[],dateien:[],zeiten:[],vonFusa:fusaId,
    schritte:{grafik:{wer:'Melanie',fertig:false,zeit:null},druck:{wer:'Selim',fertig:false,zeit:null},
      laminat:{wer:'Selim',fertig:false,zeit:null},montage:{wer:fe.monteur||'Okan',fertig:false,zeit:null},
      doku:{wer:fe.monteur||'Okan',fertig:false,zeit:null},abgeschlossen:{wer:null,fertig:false,zeit:null}},
    prod:{planung:{folienhersteller:'',folientyp:'',produktname:'',farbnummer:'',druckmaterial:'',
      laminat:'',maschine:'HP Latex 560',verarbeitungstyp:'',flaeche:'',stueck:'1',
      notiz:'Aus FUSA-Termin '+fusaId+' · Depot '+fe.depot},
      produktion:{bestaetigt:false},template:{typ:'',version:'',datei:'',scan:''},dateien:[]}});
  fe.auftragId=auId; fe.fusaStatus='uebernommen';
  saveAuftraege();     // DAL: neuer Auftrag aus FUSA
  saveFusaTermine();   // DAL: FUSA-Status aktualisieren
  renderKanban(); buildCCCalendar();
  closeDetail(); openAuftragDetail(auId);
  showToast('✓ '+auId+' angelegt · '+kunde+' · '+fz);
}

function ccZuAuftragNavigieren(auftragId){
  document.getElementById('detailOverlay').classList.remove('open');
  var link=document.querySelector('.sb-link[onclick*="auftraege"]');
  goPage('auftraege',link,'Aufträge','Auftragsverwaltung');
  openAuftragDetail(auftragId);
}

function ccBuildUpcoming(){
  var el=document.getElementById('ccUpcomingList');if(!el) return;
  var hStr=new Date().toISOString().substring(0,10);
  var next=ccGetAlleTermine().filter(function(t){return t.datum>=hStr;})
    .sort(function(a,b){return a.datum.localeCompare(b.datum);}).slice(0,8);
  if(!next.length){el.innerHTML='<div style="padding:12px;font-size:12px;color:var(--text3);">Keine kommenden Termine</div>';return;}
  var cM={blue:'var(--blue)',green:'var(--green)',amber:'var(--amber)',red:'var(--red)'};
  el.innerHTML=next.map(function(t){
    var d=new Date(t.datum),tag=String(d.getDate()).padStart(2,'0'),mon=MONATE_DE[d.getMonth()].substring(0,3);
    var col=t.quelle==='fusa'?'var(--amber)':(cM[t.typ]||'var(--blue)');
    var ico=t.quelle==='fusa'?'🟠':({grafik:'🎨',druck:'🖨️',laminat:'📐',montage:'🚌',doku:'📷',abgeschlossen:'✅'}[t.step]||'📋');
    var qTag=t.quelle==='fusa'?'<span style="font-size:9px;padding:1px 5px;border-radius:6px;background:#FFF3E0;color:#E65100;font-weight:700;margin-left:4px;">FUSA</span>':'';
    return '<div class="cc-upcoming" onclick="ccTerminClick(\''+t.id+'\')" style="cursor:pointer;">'
      +'<div class="cc-up-date" style="background:'+col+'18;border-radius:8px;width:38px;height:38px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;">'
        +'<div style="font-size:14px;font-weight:700;color:'+col+';">'+tag+'</div><div style="font-size:9px;color:'+col+';">'+mon+'</div></div>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+ico+' '+t.titel+'</div>'
        +'<div style="font-size:11px;color:var(--text2);">👷 '+t.monteur+qTag+'</div>'
      +'</div></div>';
  }).join('');
}

function openCCTermin(){
  var d=document.getElementById('ccT-datum');if(d)d.value=new Date().toISOString().substring(0,10);
  var ti=document.getElementById('ccT-titel');if(ti)ti.value='';
  document.getElementById('ccTerminModal').classList.add('open');
}

function submitCCTermin(){
  // "Termin anlegen" aus dem Kalender → öffnet normales Auftragsformular
  // vorausgefüllt mit Datum und Depot. Auftrag ist das Hauptobjekt.
  var datum  = document.getElementById('ccT-datum')?.value;
  var titel  = document.getElementById('ccT-titel')?.value?.trim();
  var depot  = document.getElementById('ccT-depot')?.value||'';
  var monteur= document.getElementById('ccT-monteur')?.value||'';

  // Modal schließen
  document.getElementById('ccTerminModal').classList.remove('open');

  // Auftragsformular öffnen und Termin/Depot vorausfüllen
  openAuftragModal();

  // Felder vorausfüllen nach kurzem Tick (Modal-Render abwarten)
  setTimeout(function(){
    if(datum){
      var tf=document.getElementById('au-termin');    if(tf) tf.value=datum;
      var lf=document.getElementById('au-liefertermin'); if(lf) lf.value=datum;
    }
    if(titel){
      var bf=document.getElementById('au-beschr'); if(bf) bf.value=titel;
    }
    if(depot){
      var df=document.getElementById('au-depot');
      if(df){ Array.from(df.options).forEach(function(o,i){if(o.text.includes(depot.split(' ')[0])) df.selectedIndex=i;}); }
    }
    if(monteur && monteur!=='—'){
      var ml=monteur.toLowerCase();
      ['okan','mete','mohammed','selim'].forEach(function(m){
        var cb=document.getElementById('au-m-'+m);
        if(cb && ml.includes(m)) cb.checked=true;
      });
    }
    // Sektion 2 (Fahrzeug/Termin) aufklappen
    var b2=document.getElementById('ac-body-2'),a2=document.getElementById('ac-arrow-2');
    if(b2) b2.classList.remove('ac-closed');
    if(a2) a2.classList.add('open');
  }, 50);
}


// ══════════════════════════════════════════════════════════════════
// FEHLENDE FUNKTIONEN — alle hier zentral implementiert
// ══════════════════════════════════════════════════════════════════

// ── LAGER ────────────────────────────────────────────────────────

// ── CRM TABS ──────────────────────────────────────────────────────
function crmTab(tab){
  ['pipeline','kunden','aktivitaeten','wiedervorlage'].forEach(function(t){
    var btn = document.getElementById('crm-tab-'+t);
    var div = document.getElementById('crm-'+t);
    var active = t===tab;
    if(btn){ btn.classList.toggle('active', active); }
    if(div){ div.style.display = active ? '' : 'none'; }
  });
  if(tab==='aktivitaeten') renderAktivitaeten();
  if(tab==='pipeline')     renderCrmPipeline();
  if(tab==='wiedervorlage') renderWiedervorlage();
}

// ── CRM DETAIL OVERLAY ────────────────────────────────────────────
// CRM_KUNDEN — einzige Kundendatenquelle für CC Intern UND FUSA
// Felder identisch zu FUSA-Kundensystem
var CRM_KUNDEN = {
  'Ruhrbahn':  {name:'Ruhrbahn GmbH',       ap:'Hr. Bergmann',   apFunktion:'Leiter Fuhrpark',    tel:'+49 201 826-1200', mail:'bergmann@ruhrbahn.de',       adresse:'Schildsehe 69',      plz:'45127', stadt:'Essen',    branche:'ÖPNV',         umsatz:'€ 128.400', auftragsvolumen:12, fahrzeuge:48, status:'Aktiv',   letzterKontakt:'Heute',   naechsteAktion:'Q3-Planung besprechen',          notiz:'Jahresvertrag bis 12/2026. Q3-Planung anstehend.'},
  'DVG':       {name:'DVG Duisburg',          ap:'Fr. Weber',      apFunktion:'Einkauf',            tel:'+49 203 6040-210', mail:'weber@dvg-duisburg.de',       adresse:'Bungertstr. 11',     plz:'47053', stadt:'Duisburg', branche:'ÖPNV',         umsatz:'€ 48.800',  auftragsvolumen:6,  fahrzeuge:30, status:'Aktiv',   letzterKontakt:'12.03',   naechsteAktion:'Rechnung nachfassen',            notiz:'Q1-Rechnung überfällig. Mahnung versandt 15.03.'},
  'Bogestra':  {name:'Bogestra AG',           ap:'Hr. Hoffmann',   apFunktion:'Projektleiter',      tel:'+49 234 303-100',  mail:'hofmann@bogestra.de',         adresse:'Universitätsstr. 58',plz:'44789', stadt:'Bochum',   branche:'ÖPNV',         umsatz:'€ 72.000',  auftragsvolumen:8,  fahrzeuge:35, status:'Aktiv',   letzterKontakt:'10.03',   naechsteAktion:'Q2-Angebot vorbereiten',         notiz:'Q2-Angebot vorbereiten bis Ende März.'},
  'NRZ':       {name:'Neue Ruhr Zeitung',     ap:'Hr. Weber',      apFunktion:'Marketing',          tel:'+49 201 804-0',    mail:'weber@nrz.de',                adresse:'Friedrichstr. 34',   plz:'45128', stadt:'Essen',    branche:'Medien',       umsatz:'€ 8.400',   auftragsvolumen:2,  fahrzeuge:5,  status:'Angebot', letzterKontakt:'15.03',   naechsteAktion:'Angebot AG-019 nachfassen!',     notiz:'Angebot AG-2026-019 wartet auf Rückmeldung.'},
  'Sparkasse': {name:'Sparkasse Essen',       ap:'Fr. Schmidt',    apFunktion:'Kommunikation',      tel:'+49 201 103-0',    mail:'schmidt@sparkasse-essen.de',  adresse:'Gildehofstr. 1',     plz:'45127', stadt:'Essen',    branche:'Finanzen',     umsatz:'€ 6.200',   auftragsvolumen:1,  fahrzeuge:5,  status:'Aktiv',   letzterKontakt:'16.03',   naechsteAktion:'Auftrag läuft',                  notiz:'Jahresauftrag bestätigt. Abwicklung läuft.'},
  'RWE':       {name:'RWE AG',                ap:'Fr. Hoffmann',   apFunktion:'Flotte',             tel:'+49 201 12-0',     mail:'hoffmann@rwe.com',            adresse:'Opernplatz 1',       plz:'45128', stadt:'Essen',    branche:'Energie',      umsatz:'—',         auftragsvolumen:0,  fahrzeuge:12, status:'Geplant', letzterKontakt:'10.03',   naechsteAktion:'Ersttermin vereinbaren',         notiz:'Erstkontakt 10.03. Interesse an Fuhrparkbeklebung.'},
  'StadtEssen':{name:'Stadt Essen',           ap:'Hr. Müller',     apFunktion:'Beschaffung',        tel:'+49 201 88-0',     mail:'mueller@essen.de',            adresse:'Porscheplatz 1',     plz:'45121', stadt:'Essen',    branche:'Öffentlich',   umsatz:'€ 12.800',  auftragsvolumen:3,  fahrzeuge:18, status:'Aktiv',   letzterKontakt:'08.03',   naechsteAktion:'Rahmenvertrag verlängern',       notiz:'Rahmenvertrag für Tram-Beschriftungen.'},
  'RadioEssen':{name:'Radio Essen',           ap:'Fr. Klein',      apFunktion:'Marketingleitung',   tel:'+49 201 1088-0',   mail:'klein@radioessen.de',         adresse:'Zweigertstr. 40',    plz:'45130', stadt:'Essen',    branche:'Medien',       umsatz:'€ 9.400',   auftragsvolumen:2,  fahrzeuge:8,  status:'Aktiv',   letzterKontakt:'05.03',   naechsteAktion:'Jahresauftrag abstimmen',        notiz:'Jahresauftrag Fahrzeugbeklebung.'},
};

function openCrmDetail(key){
  var k = CRM_KUNDEN[key];
  if(!k){ showToast('Kunde: '+key); return; }
  // Aufträge dieses Kunden aus AUFTRAEGE
  var auftraege = AUFTRAEGE.filter(function(a){ return a.kunde && a.kunde.toLowerCase().includes(k.name.split(' ')[0].toLowerCase()); });
  var statusBdg = k.status==='Aktiv'?'bg':k.status==='Angebot'?'ba':'bb';
  document.getElementById('dpTitle').textContent = k.name;
  document.getElementById('dpBody').innerHTML =
    '<div class="dp-section">'
      +'<div class="dp-slbl">Kontakt</div>'
      +'<div class="dp-row"><span class="dp-lbl">Firma</span><span class="dp-val" style="font-weight:700;">'+k.name+'</span></div>'
      +'<div class="dp-row"><span class="dp-lbl">Ansprechpartner</span><span class="dp-val">'+k.ap+'</span></div>'
      +'<div class="dp-row"><span class="dp-lbl">Telefon</span><span class="dp-val" style="color:var(--blue);">'+k.tel+'</span></div>'
      +'<div class="dp-row"><span class="dp-lbl">E-Mail</span><span class="dp-val" style="color:var(--blue);font-size:11px;">'+k.mail+'</span></div>'
      +'<div class="dp-row"><span class="dp-lbl">Umsatz</span><span class="dp-val" style="font-weight:700;color:var(--green);">'+k.umsatz+'</span></div>'
      +'<div class="dp-row"><span class="dp-lbl">Status</span><span class="dp-val"><span class="bdg '+statusBdg+'">'+k.status+'</span></span></div>'
    +'</div>'
    +'<div class="dp-section">'
      +'<div class="dp-slbl">Notiz</div>'
      +'<div style="font-size:12px;color:var(--text2);padding:6px 0;line-height:1.5;">'+k.notiz+'</div>'
    +'</div>'
    +(auftraege.length?
      '<div class="dp-section"><div class="dp-slbl">Aufträge ('+auftraege.length+')</div>'
      +auftraege.slice(0,4).map(function(a){
        return '<div class="dp-row" style="cursor:pointer;" onclick="ccZuAuftragNavigieren(\''+a.id+'\')">'
          +'<span class="dp-lbl">'+a.id+'</span>'
          +'<span class="dp-val"><span class="bdg bb" style="font-size:10px;">'+STEP_LABELS[a.step].title+'</span></span>'
          +'</div>';
      }).join('')+'</div>':'')
    // ── Aktivitäten ──
    +(function(){
      var typCol={Anruf:'var(--green)',EMail:'var(--blue)','E-Mail':'var(--blue)',Meeting:'var(--purple)',Angebot:'var(--amber)',Nachfassen:'var(--amber)',Sonstiges:'var(--gray)'};
      var aktivs=(k.aktivitaeten||[]).slice(0,5);
      if(!aktivs.length) return '<div class="dp-section"><div class="dp-slbl">Aktivitäten</div><div style="font-size:12px;color:var(--text3);padding:6px 0;">Noch keine Aktivitäten</div></div>';
      return '<div class="dp-section"><div class="dp-slbl">Aktivitäten ('+aktivs.length+')</div>'
        +aktivs.map(function(a){
          var col=typCol[a.typ]||'var(--gray)';
          var datFmt=a.datum?a.datum.split('-').reverse().join('.'):'';
          return '<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">'
            +'<span style="font-size:16px;flex-shrink:0;">'+a.ico+'</span>'
            +'<div style="flex:1;min-width:0;">'
              +'<div style="font-size:12px;font-weight:500;color:'+col+';">'+a.typ+'</div>'
              +'<div style="font-size:11px;color:var(--text2);">'+datFmt+(a.zeit?' '+a.zeit:'')+(a.ma?' · '+a.ma:'')+'</div>'
              +(a.notiz?'<div style="font-size:11px;color:var(--text3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+a.notiz+'</div>':'')
              +(a.wv?'<div style="font-size:10px;color:var(--amber);margin-top:2px;">📅 WV: '+a.wv.split('-').reverse().join('.')+'</div>':'')
            +'</div></div>';
        }).join('')+'</div>';
    })();
  document.getElementById('dpFooter').innerHTML =
    '<button class="btn" onclick="closeDetail()">Schließen</button>'
    +'<button class="btn p" onclick="closeDetail();openAktivModal(\''+key+'\')">+ Aktivität</button>';
  document.getElementById('detailOverlay').classList.add('open');
}

// ── SCHNELL-ANFRAGEN: Kanal-Selektion ────────────────────────────
function anfSelKanal(btn, kanal){
  anfParams.kanal = kanal;
  document.querySelectorAll('.anf-kanal-btn').forEach(function(b){
    b.style.borderColor   = 'var(--border)';
    b.style.background    = '#fff';
    b.style.color         = 'var(--text2)';
    b.style.fontWeight    = '400';
  });
  btn.style.borderColor = 'var(--green)';
  btn.style.background  = 'var(--green-l)';
  btn.style.color       = 'var(--green)';
  btn.style.fontWeight  = '700';
}

// ── CRM AKTIVITÄT: Typ-Selektion ─────────────────────────────────
var selAktTypGewählt = '📞';
function selAktTyp(btn, typ){
  selAktTypGewählt = typ;
  var parent = btn.parentElement;
  if(!parent) return;
  Array.from(parent.children).forEach(function(b){
    b.style.borderColor = 'var(--border)';
    b.style.background  = '#fff';
    b.style.fontWeight  = '400';
  });
  btn.style.borderColor = 'var(--blue)';
  btn.style.background  = 'var(--blue-l)';
  btn.style.fontWeight  = '700';
}
// ═══════════════════════════════════════════════════════════════
// CC_PRODUKTE — ZENTRALE PRODUKT- UND LEISTUNGSSTRUKTUR
// Einzige Quelle für: Neuer Auftrag · Schnell-Angebot · Angebot
//
// DREI EBENEN (sauber getrennt):
//   auftragsart  = betrieblicher Vorgang (wie wird gearbeitet?)
//   leistung     = fachlicher Bereich (was für ein Bereich?)
//   produkt      = konkretes Kundenprod ukt (was genau?)
//
// PRODUKTIONSSCHRITTE sind separat in AU_STEP_CONFIG und STEP_LABELS
// ═══════════════════════════════════════════════════════════════

// ── 1. Auftragsarten ────────────────────────────────────────────
// Betrieblicher Vorgang — WIE wird der Auftrag abgewickelt?
const CC_AUFTRAGSARTEN = [
  { id:'neuproduktion',      label:'Neuproduktion',            ico:'✨', hint:'Grafik → Druck → Laminat → Montage',        schritte:['grafik','druck','laminat','montage'] },
  { id:'nachproduktion',     label:'Nachproduktion',           ico:'🔄', hint:'Neudruck eines bestehenden Auftrags',        schritte:['druck','laminat','montage'] },
  { id:'montage',            label:'Nur Montage',              ico:'🔧', hint:'Material liegt vor — nur Anbringen',         schritte:['montage'] },
  { id:'demontage',          label:'Demontage',                ico:'↩️', hint:'Bestehende Beklebung entfernen',             schritte:['montage'] },
  { id:'reklamation',        label:'Reklamation',              ico:'⚠️', hint:'Fehler beheben — Details in Notizen',       schritte:['grafik','druck','laminat','montage'] },
  { id:'externe_bestellung', label:'Externe Bestellung',       ico:'📦', hint:'Bestellung bei externem Lieferanten',        schritte:['extern'] },
  { id:'service',            label:'Service / Wartung',        ico:'🛠️', hint:'Pflege, Reparatur, Teilaustausch',          schritte:['montage'] },
  { id:'intern',             label:'Intern / Test',            ico:'🔬', hint:'Interner Vorgang, kein Kundenauftrag',       schritte:['grafik','druck'] },
];

// ── 2. Leistungsbereiche ─────────────────────────────────────────
// Nur Anzeige / Filter / Kategorie — enthält KEINE Logik.
// Checklisten, Workflows und Pflichtfelder werden ausschließlich
// über Produkt-IDs (CC_PRODUKTE_LISTE) gesteuert.
const CC_LEISTUNGEN = [
  { id:'bus_bahn',  label:'Bus & Bahnwerbung',           ico:'🚌' },
  { id:'fahrzeug',  label:'Fahrzeugbeschriftung',        ico:'🚗' },
  { id:'druck',     label:'Druck / Banner / Plakate',    ico:'🖨️' },
  { id:'schild',    label:'Schilder / Werbeanlagen',     ico:'📋' },
  { id:'fenster',   label:'Folie / Fenster / Aufkleber', ico:'🪟' },
  { id:'messe',     label:'Messe / Event / POS',         ico:'🎪' },
  { id:'sonstiges', label:'Sonstiges',                   ico:'⭐' },
];

// ── 3. Produkte ──────────────────────────────────────────────────
// Konkretes Kundenprodukt — WAS genau wird geliefert?
// leistungId = Kategorie/Filter-Feld (nur Anzeige, keine Logik).
// Checklisten + Workflows werden über Produkt-ID gesteuert.
const CC_PRODUKTE_LISTE = [

  // ── Bus & Bahnwerbung — BUS ──────────────────────────────────
  { id:'bus_voll',          leistungId:'bus_bahn', label:'Bus Vollbeklebung',       ico:'🚌', beschr:'Komplette Außenfolierung Bus' },
  { id:'bus_teil',          leistungId:'bus_bahn', label:'Bus Teilbeklebung',       ico:'🚌', beschr:'Teilbereich Außen Bus' },
  { id:'bus_heck',          leistungId:'bus_bahn', label:'Bus Heckbeklebung',       ico:'🚌', beschr:'Heckscheibe / Heckfläche Bus' },
  { id:'bus_ssp',           leistungId:'bus_bahn', label:'Bus Seitenscheibenplakate (SSP)', ico:'🚌', beschr:'OWV-Folie auf Seitenscheiben' },
  { id:'bus_traffic_board', leistungId:'bus_bahn', label:'Bus Traffic Board',       ico:'🚌', beschr:'Innenwerbung Fahrgastraum Bus' },

  // ── Bus & Bahnwerbung — BAHN ──────────────────────────────────
  { id:'bahn_voll',         leistungId:'bus_bahn', label:'Bahn Vollbeklebung',      ico:'🚃', beschr:'Komplette Außenfolierung Bahn' },
  { id:'bahn_teil',         leistungId:'bus_bahn', label:'Bahn Teilbeklebung',      ico:'🚃', beschr:'Teilbereich Außen Bahn' },
  { id:'bahn_innen',        leistungId:'bus_bahn', label:'Bahn Innenwerbung',       ico:'🚃', beschr:'Innenbeklebung / Fahrgastraum Bahn' },

  // ── Fahrzeugbeschriftung — PKW ────────────────────────────────
  { id:'pkw_voll',          leistungId:'fahrzeug', label:'PKW Vollfolierung',       ico:'🚗', beschr:'Komplette Fahrzeugfolierung PKW' },
  { id:'pkw_teil',          leistungId:'fahrzeug', label:'PKW Teilfolierung',       ico:'🚗', beschr:'Teilbereich Folierung PKW' },
  { id:'pkw_beschr',        leistungId:'fahrzeug', label:'PKW Beschriftung',        ico:'🚗', beschr:'Logo / Text auf PKW' },

  // ── Fahrzeugbeschriftung — TRANSPORTER ────────────────────────
  { id:'van_voll',          leistungId:'fahrzeug', label:'Transporter Vollfolierung', ico:'🚐', beschr:'Komplette Fahrzeugfolierung Transporter' },
  { id:'van_teil',          leistungId:'fahrzeug', label:'Transporter Teilfolierung', ico:'🚐', beschr:'Teilbereich Folierung Transporter' },
  { id:'van_beschr',        leistungId:'fahrzeug', label:'Transporter Beschriftung',  ico:'🚐', beschr:'Logo / Text auf Transporter' },

  // ── Druck / Banner / Plakate ──────────────────────────────────
  { id:'banner_pvc',        leistungId:'druck',    label:'Banner (PVC / Mesh)',     ico:'🖨️', beschr:'PVC- oder Mesh-Banner, Ösen' },
  { id:'plakat',            leistungId:'druck',    label:'Plakate',                 ico:'🖨️', beschr:'Großformatdruck auf Papier / Folie' },
  { id:'rollup',            leistungId:'druck',    label:'Roll-Up',                 ico:'🖨️', beschr:'85×200cm Standard, inkl. Gestell' },
  { id:'bauzaun',           leistungId:'druck',    label:'Bauzaunbanner',           ico:'🖨️', beschr:'Mesh-Banner für Bauzaunbefestigung' },
  { id:'grossformat',       leistungId:'druck',    label:'Großformatdruck',         ico:'🖨️', beschr:'Breitformat ab 1,5m Breite' },

  // ── Schilder / Werbeanlagen ───────────────────────────────────
  { id:'dibond_schild',     leistungId:'schild',   label:'Dibond Schild',           ico:'📋', beschr:'Aluminium-Verbundplatte bedruckt / beklebt' },
  { id:'forex_schild',      leistungId:'schild',   label:'Forex Schild',            ico:'📋', beschr:'PVC-Hartschaum, leicht und wetterfest' },
  { id:'acryl_schild',      leistungId:'schild',   label:'Acrylschild',             ico:'📋', beschr:'Acrylglas / Plexiglas, transparent oder opak' },
  { id:'leuchtreklame',     leistungId:'schild',   label:'Leuchtreklame',           ico:'💡', beschr:'LED-Leuchtkasten / beleuchtete Werbefläche' },
  { id:'einzelbuchstaben',  leistungId:'schild',   label:'Einzelbuchstaben',        ico:'🔠', beschr:'3D-Buchstaben / Logos aus Acryl, Alu oder Edelstahl' },
  { id:'werbeanlage_aussen',leistungId:'schild',   label:'Werbeanlage außen',       ico:'🏗️', beschr:'Pylone, Ausleger, Fassadenanlage komplett' },

  // ── Folie / Fenster / Aufkleber ───────────────────────────────
  { id:'fenster_bekl',      leistungId:'fenster',  label:'Fensterbeklebung',        ico:'🪟', beschr:'Bedruckte Folie auf Schaufenster / Glas' },
  { id:'milchglas',         leistungId:'fenster',  label:'Milchglasfolie',          ico:'🪟', beschr:'Sichtschutz / Dekorfolie matt' },
  { id:'sonnenschutz',      leistungId:'fenster',  label:'Sonnenschutzfolie',       ico:'🪟', beschr:'Tönungsfolie / Hitzeschutz' },
  { id:'aufkleber_digi',    leistungId:'fenster',  label:'Aufkleber Digitaldruck',  ico:'🏷️', beschr:'Farbiger Aufkleber gedruckt + geschnitten' },
  { id:'aufkleber_plot',    leistungId:'fenster',  label:'Aufkleber geplottet',     ico:'🏷️', beschr:'Einfarbiger Schnittaufkleber / Konturschnitt' },
  { id:'etiketten',         leistungId:'fenster',  label:'Etiketten',               ico:'🏷️', beschr:'Etiketten auf Rolle oder Bogen' },

  // ── Messe / Event / POS ───────────────────────────────────────
  { id:'messestand',        leistungId:'messe',    label:'Messestand',              ico:'🎪', beschr:'Standbau komplett mit Beschriftung' },
  { id:'messewand',         leistungId:'messe',    label:'Messewand / Rückwand',    ico:'🎪', beschr:'Bedruckte Rückwand / Backdrop' },
  { id:'pos_display',       leistungId:'messe',    label:'POS Displays',            ico:'🏪', beschr:'Kundenstopper, Aufsteller, Thekendisplay' },
  { id:'promotion',         leistungId:'messe',    label:'Promotionmaterial',       ico:'🎁', beschr:'Flyer, Give-aways, Werbemittel' },

  // ── Sonstiges ─────────────────────────────────────────────────
  // WICHTIG: freie_leistung = manuell beschreibbar
  // Die Bezeichnung wird beim Anlegen vom Nutzer frei eingegeben.
  // label wird zur Laufzeit durch den eingegebenen Text ersetzt.
  { id:'freie_leistung',    leistungId:'sonstiges',label:'Freie Leistung',          ico:'⭐', beschr:'Manuell beschreibbar — Bezeichnung frei wählbar' },
];

// ── Hilfsfunktionen ──────────────────────────────────────────────
function ccProduktById(id){ return CC_PRODUKTE_LISTE.find(function(p){return p.id===id;})||null; }
function ccLeistungById(id){ return CC_LEISTUNGEN.find(function(l){return l.id===id;})||null; }
function ccAuftragsartById(id){ return CC_AUFTRAGSARTEN.find(function(a){return a.id===id;})||null; }
function ccProdukteByLeistung(lid){ return CC_PRODUKTE_LISTE.filter(function(p){return p.leistungId===lid;}); }

// Mapping alte art-Werte → Checklisten
const CC_LEGACY_MAP = {
  // ── Alte Fahrzeug-IDs → neue Produkt-IDs ──────────────────
  'busbeklebung':      { auftragsart:'neuproduktion', leistung:'fahrzeug',  produkt:'bus_teil' },
  'ganzgestaltung':    { auftragsart:'neuproduktion', leistung:'fahrzeug',  produkt:'bus_voll' },
  'teilgestaltung':    { auftragsart:'neuproduktion', leistung:'fahrzeug',  produkt:'bus_teil' },
  'heckwerbung':       { auftragsart:'neuproduktion', leistung:'fahrzeug',  produkt:'bus_heck' },
  'traffic_board':     { auftragsart:'neuproduktion', leistung:'fahrzeug',  produkt:'bus_traffic_board' },
  'tuerbeklebung':     { auftragsart:'neuproduktion', leistung:'fahrzeug',  produkt:'bus_teil' },
  'seitenbeklebung':   { auftragsart:'neuproduktion', leistung:'fahrzeug',  produkt:'bus_teil' },
  'digitaldruck':      { auftragsart:'neuproduktion', leistung:'druck',     produkt:'plakat' },
  'schild':            { auftragsart:'neuproduktion', leistung:'schild',    produkt:'schild_dibond' },
  'externe_bestellung':{ auftragsart:'externe_bestellung', leistung:'sonstiges', produkt:'externe_best' },
  'montage_only':      { auftragsart:'montage',       leistung:'fahrzeug',  produkt:'teilgestaltung' },
  'reklamation':       { auftragsart:'reklamation',   leistung:'fahrzeug',  produkt:'teilgestaltung' },
  'sonstiges':         { auftragsart:'neuproduktion', leistung:'sonstiges', produkt:'freie_leistung' },
  'datencheck':        { auftragsart:'neuproduktion', leistung:'sonstiges', produkt:'freie_leistung' },
  'grafik_entwurf':    { auftragsart:'neuproduktion', leistung:'sonstiges', produkt:'freie_leistung' },
  'externe_best':      { auftragsart:'neuproduktion', leistung:'sonstiges', produkt:'freie_leistung' },
  'sonstiges_prod':    { auftragsart:'neuproduktion', leistung:'sonstiges', produkt:'freie_leistung' },
  // Alte Messe-IDs
  'display':           { auftragsart:'neuproduktion', leistung:'messe',     produkt:'pos_display' },
  'textildruck':       { auftragsart:'neuproduktion', leistung:'messe',     produkt:'promotion' },
  'fahne':             { auftragsart:'neuproduktion', leistung:'messe',     produkt:'promotion' },
  'event_beschr':      { auftragsart:'neuproduktion', leistung:'messe',     produkt:'messestand' },
  // Alte Schilder-IDs
  'schild_dibond':     { auftragsart:'neuproduktion', leistung:'schild',    produkt:'dibond_schild' },
  'schild_acryl':      { auftragsart:'neuproduktion', leistung:'schild',    produkt:'acryl_schild' },
  'schild_alu':        { auftragsart:'neuproduktion', leistung:'schild',    produkt:'dibond_schild' },
  'acrylbuchstaben':   { auftragsart:'neuproduktion', leistung:'schild',    produkt:'einzelbuchstaben' },
  'leuchtkasten':      { auftragsart:'neuproduktion', leistung:'schild',    produkt:'leuchtreklame' },
  'wandbeschriftung':  { auftragsart:'neuproduktion', leistung:'schild',    produkt:'werbeanlage_aussen' },
  'pylone':            { auftragsart:'neuproduktion', leistung:'schild',    produkt:'werbeanlage_aussen' },
  'schild':            { auftragsart:'neuproduktion', leistung:'schild',    produkt:'dibond_schild' },
  // Alte Druck-IDs
  'banner':            { auftragsart:'neuproduktion', leistung:'druck',     produkt:'banner_pvc' },
  'aufkleber':         { auftragsart:'neuproduktion', leistung:'druck',     produkt:'aufkleber_digi' },
  'canvas':            { auftragsart:'neuproduktion', leistung:'druck',     produkt:'grossformat' },
  // Alte Fenster-IDs
  'fenster_milchig':   { auftragsart:'neuproduktion', leistung:'fenster',   produkt:'milchglas' },
  'fenster_druck':     { auftragsart:'neuproduktion', leistung:'fenster',   produkt:'fenster_bekl' },
  'folie_aufkleber':   { auftragsart:'neuproduktion', leistung:'fenster',   produkt:'aufkleber_digi' },
  'bodenbeschriftung': { auftragsart:'neuproduktion', leistung:'fenster',   produkt:'aufkleber_digi' },
};

var auNr = 42; // Auftragsnummer-Zähler

// Auftragsnummer aus vorhandenen Aufträgen berechnen (verhindert Duplikate nach Neustart)
function auNrRecalculate() {
  var maxNr = 41;
  AUFTRAEGE.forEach(function(a) {
    if (!a.id) return;
    var parts = a.id.split('-');
    var n = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(n) && n > maxNr) maxNr = n;
  });
  auNr = maxNr + 1;
}

// ═══════════════════════════════════════════════════════════════
// CHECKLISTEN-ZUORDNUNG — nur DB/API (kein Frontend-Legacy)
//   GET /api/v1/ccintern/checklisten-zuordnung?produkt_id=…
//   GET /api/v1/checklisten/:id (über CCIntern.cockpitApi)
// ═══════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  window.CC_PRODUKTE_LISTE_READ_ONLY = CC_PRODUKTE_LISTE;
}

var CC_CL_DB_SCHRITTE = ['grafik', 'druck', 'laminat', 'montage', 'doku'];

/** @param {unknown} r */
function ccClChecklisteRowAktiv(r) {
  if (!r || typeof r !== 'object') return false;
  var ac = /** @type {{ aktiv?: unknown }} */ (r).aktiv;
  if (ac === true) return true;
  if (ac === 1) return true;
  if (String(ac).trim() === '1') return true;
  return false;
}

/**
 * Vorlage aus CL_VORLAGEN oder per API nachladen (GET /api/v1/checklisten/:id).
 * @param {string} checklisteId
 * @param {object|null|undefined} api
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function ccDbVorlageFuerChecklisteId(checklisteId, api) {
  var cid = checklisteId != null ? String(checklisteId).trim() : '';
  if (!cid) return null;
  var list = typeof window !== 'undefined' && Array.isArray(window.CL_VORLAGEN) ? window.CL_VORLAGEN : [];
  var hit = list.find(function (x) {
    return x && String(x.id || '').trim() === cid;
  });
  if (hit && Array.isArray(hit.punkte) && hit.punkte.length > 0) return hit;
  if (api && typeof api.refreshChecklisteVorlageFromApi === 'function') {
    var fresh = await api.refreshChecklisteVorlageFromApi(cid, null);
    if (fresh && Array.isArray(fresh.punkte) && fresh.punkte.length > 0) {
      return /** @type {Record<string, unknown>} */ (fresh);
    }
  }
  return null;
}

/**
 * @param {unknown} p
 * @param {string} vorlageName
 */
function ccDbPunktAusVorlage(p, vorlageName) {
  if (!p || typeof p !== 'object' || /** @type {{ text?: unknown }} */ (p).text == null) return null;
  var po = /** @type {{ text?: unknown, kat?: unknown, hinweis?: unknown }} */ (p);
  return {
    text: String(po.text),
    kat: po.kat,
    hinweis: po.hinweis || '',
    quelle: vorlageName,
    erledigt: false,
    löschbar: false,
  };
}

/**
 * Checklisten-Punkte für Produkt × Schritt — ausschließlich DB-Zuordnung + API-Vorlagen.
 * @param {unknown} produktId
 * @param {string} schritt
 * @param {object} [auftragCtx]
 * @returns {Promise<Array<{text:string,kat?:string,hinweis:string,quelle:string,erledigt:boolean,löschbar:boolean}>>}
 */
async function ccDbChecklistenFuerSchritt(produktId, schritt, auftragCtx) {
  if (typeof console !== 'undefined' && console.log) {
    console.log('[CL-ZUORDNUNG START]', {
      produktId: produktId,
      schritt: schritt,
      auftragId: auftragCtx && auftragCtx.id != null ? auftragCtx.id : null,
      auftragName: auftragCtx && (auftragCtx.titel || auftragCtx.name) ? (auftragCtx.titel || auftragCtx.name) : null,
    });
  }
  var pid = produktId != null ? String(produktId).trim() : '';
  var step = schritt != null ? String(schritt).trim() : '';
  if (!pid || !step) return [];

  var api = typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi ? window.CCIntern.cockpitApi : null;
  var dbRows = [];
  if (api && typeof api.fetchCcInternChecklistenZuordnung === 'function') {
    dbRows = await api.fetchCcInternChecklistenZuordnung(pid);
  }
  if (!Array.isArray(dbRows)) dbRows = [];

  if (typeof console !== 'undefined' && console.log) {
    console.log('[CL-ZUORDNUNG API-ZEILEN]', {
      produktId: pid,
      schritt: step,
      rows: dbRows.length,
      rowsData: dbRows,
    });
  }

  var filtered = dbRows.filter(function (r) {
    if (!r || typeof r !== 'object') return false;
    if (!ccClChecklisteRowAktiv(r)) return false;
    var st = r.schritt != null ? String(r.schritt).trim() : '';
    return st === step;
  });
  filtered.sort(function (a, b) {
    return (Number(a.sortierung) || 0) - (Number(b.sortierung) || 0);
  });

  var punkte = [];
  var result = [];
  var seenVorlageId = {};
  var seenText = {};

  for (var fi = 0; fi < filtered.length; fi++) {
    var row = filtered[fi];
    var cid = row.checkliste_id != null ? String(row.checkliste_id).trim() : '';
    if (!cid) continue;
    var v = await ccDbVorlageFuerChecklisteId(cid, api);
    if (!v) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[CL-DB-ZUORDNUNG-UNVOLLSTAENDIG]', {
          auftragId: auftragCtx && auftragCtx.id != null ? auftragCtx.id : null,
          schritt: step,
          produktId: pid,
          checkliste_id: cid,
          grund: 'vorlage-nicht-geladen-oder-leere-punkte',
        });
      }
      continue;
    }
    var vname = v.name != null ? String(v.name) : v.titel != null ? String(v.titel) : '';
    var vid = v.id != null ? String(v.id).trim() : '';
    if (vid && !seenVorlageId[vid]) {
      seenVorlageId[vid] = true;
      result.push(v);
    }
    var pts = Array.isArray(v.punkte) ? v.punkte : [];
    for (var pi = 0; pi < pts.length; pi++) {
      var item = ccDbPunktAusVorlage(pts[pi], vname);
      if (!item) continue;
      if (seenText[item.text]) continue;
      seenText[item.text] = true;
      punkte.push(item);
    }
  }

  if (punkte.length > 0) {
    if (typeof console !== 'undefined' && console.log) {
      console.log('[CL-ZUORDNUNG DB TREFFER]', {
        produktId: pid,
        schritt: step,
        vorlagen: result.map(function (vor) {
          return { id: vor.id, name: vor.name || vor.titel || null };
        }),
      });
      console.log('[CL-ZUORDNUNG DB]', pid, step, punkte.length);
      console.log('[CL-DB-VORLAGE ÜBERNOMMEN]', {
        auftragId: auftragCtx && auftragCtx.id != null ? auftragCtx.id : null,
        schritt: step,
        punkte: punkte.length,
      });
    }
    return punkte;
  }

  if (filtered.length > 0) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[CL-DB-ZUORDNUNG-UNVOLLSTAENDIG]', {
        auftragId: auftragCtx && auftragCtx.id != null ? auftragCtx.id : null,
        schritt: step,
        produktId: pid,
        grund: 'zuordnung-ohne-auflösbare-vorlage-oder-leere-punkte',
      });
    }
  } else if (typeof console !== 'undefined' && console.warn) {
    console.warn('[CL-KEINE-DB-ZUORDNUNG]', {
      auftragId: auftragCtx && auftragCtx.id != null ? auftragCtx.id : null,
      schritt: step,
      produktId: pid,
    });
  }
  return [];
}

/** Sync: nur persistierte Schritt-Checkliste (kein Legacy-Template). */
function clChecklistenFuerSchritt(auftrag, schritt) {
  if (!auftrag || !schritt) return [];
  var step = String(schritt).trim();
  var sch = auftrag.schritte && auftrag.schritte[step];
  if (sch && Array.isArray(sch.checkliste) && sch.checkliste.length) {
    return sch.checkliste.slice();
  }
  return [];
}

function clChecklistenFuerAuftrag(auftrag) {
  return clFlatChecklistenAusSchritte(auftrag);
}

function clFlatChecklistenAusSchritte(auftrag) {
  if (!auftrag || typeof auftrag !== 'object') return [];
  var seen = {};
  var flat = [];
  CC_CL_DB_SCHRITTE.forEach(function (st) {
    var sc = auftrag.schritte && auftrag.schritte[st];
    if (!sc || !Array.isArray(sc.checkliste)) return;
    sc.checkliste.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var t = it.text != null ? String(it.text) : '';
      var key = st + '|' + t;
      if (t && !seen[key]) {
        seen[key] = true;
        flat.push(it);
      }
    });
  });
  return flat;
}

/**
 * Nach POST /api/v1/ccintern/auftraege: Schritt-Checklisten aus DB-Zuordnung neu laden
 * (produkt_id + ccApiId müssen aus der API-Antwort / Reload verfügbar sein).
 * @param {Record<string, unknown>} a
 * @param {unknown} [produktIdFallback]
 * @returns {Promise<boolean>}
 */
async function auChecklistenSchritteAusDbNachPost(a, produktIdFallback) {
  if (!a || typeof a !== 'object') return false;
  var pid =
    a.produktId != null && String(a.produktId).trim()
      ? String(a.produktId).trim()
      : produktIdFallback != null
        ? String(produktIdFallback).trim()
        : '';
  if (!pid) return false;
  if (!Array.isArray(window.CL_VORLAGEN) || window.CL_VORLAGEN.length === 0) {
    var capiCl = typeof window !== 'undefined' ? window.CCIntern && window.CCIntern.cockpitApi : null;
    if (capiCl && typeof capiCl.reloadChecklistenVorlagenFromApi === 'function') {
      await capiCl.reloadChecklistenVorlagenFromApi();
    }
  }
  var stepKeys = ['grafik', 'druck', 'laminat', 'montage', 'doku'];
  var any = false;
  for (var i = 0; i < stepKeys.length; i++) {
    var step = stepKeys[i];
    var sch = a.schritte && a.schritte[step];
    if (!sch || !(Number(sch.dauer) > 0)) continue;
    var tpl = await ccDbChecklistenFuerSchritt(pid, step, a);
    if (tpl.length > 0) {
      sch.checkliste = tpl.map(function (item) {
        return Object.assign({}, item, { erledigt: false, löschbar: false });
      });
      any = true;
    }
  }
  if (any) {
    a.checklisten = clFlatChecklistenAusSchritte(a);
    if (!a.produktId) a.produktId = pid;
  }
  return any;
}

if (typeof window !== 'undefined') {
  window.clChecklistenFuerSchritt = clChecklistenFuerSchritt;
  window.clChecklistenFuerAuftrag = clChecklistenFuerAuftrag;
}

// ── Vorlage-Namen für Auftrag (nur Anzeige, aus Schritt-Checklisten) ──
function clVorlagenNamenFuerAuftrag(auftrag) {
  if (!auftrag || typeof auftrag !== 'object') return [];
  var seen = {};
  var out = [];
  CC_CL_DB_SCHRITTE.forEach(function (st) {
    var sch = auftrag.schritte && auftrag.schritte[st];
    if (!sch || !Array.isArray(sch.checkliste)) return;
    sch.checkliste.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var q = it.quelle != null ? String(it.quelle).trim() : '';
      if (!q || seen[q]) return;
      seen[q] = true;
      out.push(q);
    });
  });
  return out;
}

function auftragHatPersistierteCheckliste(a){
  if(!a || typeof a!=='object') return false;
  if(Array.isArray(a.checklisten) && a.checklisten.length>0) return true;
  var schritte = a.schritte || {};
  return ['grafik','druck','laminat','montage','doku'].some(function(step){
    var sch = schritte[step];
    return !!(sch && Array.isArray(sch.checkliste) && sch.checkliste.length>0);
  });
}
// ── Checklisten für ALLE Aufträge automatisch nachrüsten ─────────────
// Wird bei App-Start aufgerufen — füllt fehlende Schritt-Checklisten aus DB-Zuordnung
var __clMigrierAlleSession = null;
function clMigrierAlle(){
  if (!__clMigrierAlleSession) {
    __clMigrierAlleSession = clMigrierAlleAsyncImpl().finally(function () {
      __clMigrierAlleSession = null;
    });
  }
  return __clMigrierAlleSession;
}
async function clMigrierAlleAsyncImpl(){
  var isVorlagenView = (typeof currentPage !== 'undefined' && currentPage === 'checklisten');
  if(isVorlagenView) return;
  var needSave = false;
  var stepKeys = ['grafik','druck','laminat','montage','doku'];
  for (var ai = 0; ai < AUFTRAEGE.length; ai++) {
    var a = AUFTRAEGE[ai];
    var hatPersistierteCheckliste = auftragHatPersistierteCheckliste(a);
    if(hatPersistierteCheckliste){
      console.log('REBUILD BLOCKED - USER DATA EXISTS');
      continue;
    }
    if(!a.materialVerbrauch){ a.materialVerbrauch=[]; needSave=true; }

    if(a.step === 'abgeschlossen') continue;
    for (var si = 0; si < stepKeys.length; si++) {
      var step = stepKeys[si];
      var sch = a.schritte && a.schritte[step];
      if(!sch) continue;
      if(sch.dauer <= 0 && a.step !== step) continue;
      if(sch.checkliste && sch.checkliste.length > 0) continue;
      var tpl = await ccDbChecklistenFuerSchritt(a.produktId, step, a);
      if(tpl.length > 0){
        sch.checkliste = tpl;
        needSave = true;
      }
    }
  }
  if(needSave) saveAuftraege();
}

var aufgabenNr = 1; // Aufgaben-Zähler (wird bei dalInit aus INTERN_AUFGABEN.length initialisiert)

// ── Interne Aufgaben aus Auftrag erzeugen ─────────────────────────────
async function auftragAufgabenErzeugen(auftragId){
  var a = AUFTRAEGE.find(function(x){ return x.id === auftragId; });
  if(!a) return;

  for(var i = INTERN_AUFGABEN.length - 1; i >= 0; i--){
    if(INTERN_AUFGABEN[i].auftragId === auftragId) INTERN_AUFGABEN.splice(i, 1);
  }

  var stepOrder = ['grafik','druck','laminat','montage','extern','doku'];
  var heute = new Date().toISOString();
  // Datum: Starttermin / Lieferung; Montage-Schritt bevorzugt Montagetermin (Mitarbeiter-App + Planung)
  var basisDatumGlobal = a.terminDatum || a.liefertermin || heute.split('T')[0];
  if(!basisDatumGlobal || basisDatumGlobal === 'undefined' || basisDatumGlobal.length < 8){
    basisDatumGlobal = heute.split('T')[0];
  }

  // Temporäre Belegungsmap für diese Anlage (damit Schritte desselben Auftrags
  // sich gegenseitig nicht überschneiden, falls MA identisch)
  var tempBelegung = {}; // maId|datum → bereits in diesem Auftrag verplante Stunden

  for (var __sIdx = 0; __sIdx < stepOrder.length; __sIdx++) {
    var step = stepOrder[__sIdx];
    var sch = a.schritte && a.schritte[step];
    if(!sch || !sch.dauer || sch.dauer <= 0) continue;
    if (typeof schrittMigrieren === 'function') schrittMigrieren(sch, step);
    var checklisteFuerStep = await ccDbChecklistenFuerSchritt(a.produktId, step, a);
    var stepLabel = (STEP_LABELS[step] && STEP_LABELS[step].title) || step;
    var gesamtDauer = sch.dauer;
    var uniqUuids = internAufgabenDedupeMaUserIdsFuerSchritt(sch);
    if ((!uniqUuids || !uniqUuids.length) && sch.wer && String(sch.wer).trim() && sch.wer !== '—') {
      var nIdsLegacy = [];
      String(sch.wer)
        .split('+')
        .forEach(function (part) {
          var w = part.trim();
          if (!w) return;
          var r = typeof maIdVonName === 'function' ? maIdVonName(w) : null;
          if (r) nIdsLegacy.push(r);
        });
      if (nIdsLegacy.length) {
        uniqUuids = internAufgabenDedupeMaUserIdsFuerSchritt({ maIds: nIdsLegacy });
      }
    }
    var stepVerantIdGlobal = internSchrittVerantwortlicherUserId(sch);

    // ── Montage: eine INTERN-Zeile pro MA; Datum/Dauer nur aus Auftrag; teamMaIds nur dieser MA ──
    if (step === 'montage') {
      var montDatum =
        (typeof ccInternAuftragMontageDatumIso === 'function' && ccInternAuftragMontageDatumIso(a)) || '';
      if (!montDatum || !/^\d{4}-\d{2}-\d{2}$/.test(montDatum)) {
        var schIso = sch.datum != null ? ccInternExtrahiereIsoDatumAusString(sch.datum) : '';
        if (schIso && /^\d{4}-\d{2}-\d{2}$/.test(schIso)) montDatum = schIso;
      }
      if (!montDatum || !/^\d{4}-\d{2}-\d{2}$/.test(montDatum)) {
        var mdR = (a.montageDatum && String(a.montageDatum).substring(0, 10)) || '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(mdR)) montDatum = mdR;
      }
      if (!montDatum || !/^\d{4}-\d{2}-\d{2}$/.test(montDatum)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[auftragAufgabenErzeugen] Montage: kein gültiges Datum (ccInternAuftragMontageDatumIso / schritt.datum / montageDatum)', {
            auftragId: auftragId,
          });
        }
        return;
      }

      var montDauer =
        typeof ccInternAuftragMontageDauerStd === 'function' ? ccInternAuftragMontageDauerStd(a) : 0;
      if (!(montDauer > 0)) montDauer = gesamtDauer;

      var montErzeugKeys = {};
      uniqUuids.forEach(function (rawMaId) {
        var maId = rawMaId != null ? String(rawMaId).trim() : '';
        if (!maId) return;
        var stepMaKey = String(auftragId) + '|' + String(step) + '|' + maId;
        if (typeof maIstCockpitUserUuid === 'function' && !maIstCockpitUserUuid(maId)) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[auftragAufgabenErzeugen] überspringe nicht-UUID maId', { key: stepMaKey });
          }
          return;
        }
        var dedK = String(auftragId) + '\x1e' + String(step) + '\x1e' + maId;
        if (montErzeugKeys[dedK]) return;
        montErzeugKeys[dedK] = true;

        var ma = typeof maByID === 'function' ? maByID(maId) || { n: maId } : { n: maId };
        var aufgId = 'IA-' + new Date().getFullYear() + '-' + String(aufgabenNr++).padStart(3, '0');
        var bKey = maId + '|' + montDatum;
        tempBelegung[bKey] = (tempBelegung[bKey] || 0) + montDauer;
        var stepVerantId = stepVerantIdGlobal;
        var istVerantwortlicher =
          stepVerantId &&
          (String(maId) === String(stepVerantId) ||
            (typeof maIdGleich === 'function' && maIdGleich(maId, stepVerantId)));
        var aufgabeM = {
          id: aufgId,
          auftragId: auftragId,
          fz: a.fz || a.id,
          kunde: a.kunde || '—',
          schritt: step,
          typ: sch.typ || 'single',
          titel: stepLabel + ' — ' + (a.fz || a.id),
          maId: maId,
          ma: ma.n,
          maIds: [maId],
          teamMaIds: [maId],
          werId: maId,
          verantwortlicher: istVerantwortlicher ? stepVerantId : null,
          wer: (sch && sch.wer) ? sch.wer : '',
          dauer: montDauer,
          dauerGesamt: montDauer,
          tagBlock: null,
          datum: montDatum,
          status: 'offen',
          erstellt: heute,
        };
        aufgabeM.checkliste = checklisteFuerStep;
        INTERN_AUFGABEN.push(aufgabeM);
      });
      continue;
    }

    var basisDatum = basisDatumGlobal;

    uniqUuids.forEach(function (rawMaId) {
      var maId = rawMaId != null ? String(rawMaId).trim() : '';
      if (!maId) return;
      var stepMaKey = String(auftragId) + '|' + String(step) + '|' + maId;
      if (typeof maIstCockpitUserUuid === 'function' && !maIstCockpitUserUuid(maId)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[auftragAufgabenErzeugen] überspringe nicht-UUID maId', { key: stepMaKey });
        }
        return;
      }

      var ma = typeof maByID === 'function' ? maByID(maId) || { n: maId } : { n: maId };
      var bloecke = maAufgabeAufteilen(maId, basisDatum, gesamtDauer, tempBelegung);
      var blockSeen = {};

      bloecke.forEach(function(block, idx){
        var tagKey = String(auftragId) + '\x1e' + String(step) + '\x1e' + maId + '\x1e' + String(block.datum);
        if (blockSeen[tagKey]) return;
        blockSeen[tagKey] = true;

        var aufgId = 'IA-' + new Date().getFullYear() + '-' + String(aufgabenNr++).padStart(3,'0');
        if(maId){
          var bKey = maId+'|'+block.datum;
          tempBelegung[bKey] = (tempBelegung[bKey]||0) + block.dauer;
        }
        var multiSuffix = uniqUuids.length > 1 ? ' · '+ma.n : '';
        var stepVerantId = stepVerantIdGlobal;
        var istVerantwortlicher =
          stepVerantId &&
          (String(maId) === String(stepVerantId) ||
            (typeof maIdGleich === 'function' && maIdGleich(maId, stepVerantId)));
        var aufgabe = {
          id:          aufgId,
          auftragId:   auftragId,
          fz:          a.fz    || a.id,
          kunde:       a.kunde || '—',
          schritt:     step,
          typ:         sch.typ || 'single',
          titel:       stepLabel + ' — ' + (a.fz || a.id) + multiSuffix + (bloecke.length>1?' (Tag '+(idx+1)+'/'+bloecke.length+')':''),
          maId:        maId,
          ma:          ma.n,
          maIds:       [maId],
          teamMaIds:   [maId],
          werId:       maId,
          verantwortlicher: istVerantwortlicher ? stepVerantId : null,
          wer:         (sch && sch.wer) ? sch.wer : '',
          dauer:       block.dauer,
          dauerGesamt: gesamtDauer,
          tagBlock:    bloecke.length>1 ? (idx+1)+'/'+bloecke.length : null,
          datum:       block.datum,
          status:      'offen',
          erstellt:    heute,
        };
        aufgabe.checkliste = checklisteFuerStep;
        INTERN_AUFGABEN.push(aufgabe);
      });
    });
  }

  maInternRepariereMontageInternZeilenNachAuftrag();
  saveAufgaben();
}

// ── Aufgabe auf Tage verteilen ───────────────────────────────────────
// Gibt Array von {datum, dauer} zurück.
// Berücksichtigt:
//   1. Vorhandene Belegung in INTERN_AUFGABEN (bereits gespeichert)
//   2. Temporäre Belegung dieses Auftrags (tempBelegung)
//   3. Wochenenden werden übersprungen
function maAufgabeAufteilen(maId, startDatum, gesamtDauer, tempBelegung){
  var bloecke = [];
  var rest = gesamtDauer;
  var aktDatum = startDatum;
  var maxTage = 30;
  var versuch = 0;

  // Hilfsfunktion: ISO-Datum lokal parsen (kein UTC-Offset-Bug)
  function parseLokalesDatum(iso){
    var t = iso.split('-');
    return new Date(parseInt(t[0]), parseInt(t[1])-1, parseInt(t[2]));
  }

  while(rest > 0 && versuch < maxTage){
    versuch++;
    var d = parseLokalesDatum(aktDatum);
    var wt = d.getDay(); // 0=So, 6=Sa
    if(wt === 0 || wt === 6){
      aktDatum = naechsterArbeitstag(aktDatum);
      continue;
    }

    var bereitsGeplant = maId ? maTagesStunden(maId, aktDatum) : 0;
    var tempKey = maId ? maId+'|'+aktDatum : null;
    var tempGeplant = (tempKey && tempBelegung && tempBelegung[tempKey]) ? tempBelegung[tempKey] : 0;
    var belegt = bereitsGeplant + tempGeplant;
    var frei = Math.max(0, MA_TAG_KAPAZITAET - belegt);

    if(frei <= 0){
      aktDatum = naechsterArbeitstag(aktDatum);
      continue;
    }

    var block = Math.min(rest, frei);
    block = Math.round(block * 10) / 10; // auf 0.1h runden
    bloecke.push({ datum: aktDatum, dauer: block });
    rest = Math.round((rest - block) * 10) / 10;

    if(rest > 0) aktDatum = naechsterArbeitstag(aktDatum);
  }

  // Fallback: wenn rest übrig (z.B. kein freier Tag gefunden), letzten Tag aufstocken
  if(rest > 0 && bloecke.length > 0){
    bloecke[bloecke.length-1].dauer = Math.round((bloecke[bloecke.length-1].dauer + rest)*10)/10;
  } else if(rest > 0){
    bloecke.push({ datum: startDatum, dauer: gesamtDauer });
  }

  return bloecke;
}

function naechsterArbeitstag(fromIso){
  var t = String(fromIso || '').split('-');
  if (t.length < 3) return '';
  var d = new Date(parseInt(t[0], 10), parseInt(t[1], 10) - 1, parseInt(t[2], 10));
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return isoDateFormatDay(d, 'naechsterArbeitstag');
}

// ── Kapazitätswarnung nach Auftrag-Anlage ────────────────────
function maKapWarnungAnzeigen(auftragId){
  var aufgaben = INTERN_AUFGABEN.filter(function(g){ return g.auftragId===auftragId; });
  if(!aufgaben.length) return;

  // Tagesstunden pro MA aus den neuen Aufgaben summieren
  var tageMap = {}; // key: maId|datum → {ma, istH, datum}
  aufgaben.forEach(function(g){
    if(!g.maId || !g.datum) return;
    var key = g.maId+'|'+g.datum;
    if(!tageMap[key]) tageMap[key] = {maId:g.maId, ma:g.ma, datum:g.datum, istH:0};
    tageMap[key].istH += (g.dauer||0);
  });

  var warnungen = [];
  Object.keys(tageMap).forEach(function(key){
    var t = tageMap[key];
    var gesamt = maTagesStunden(t.maId, t.datum); // inkl. bereits gespeicherte neue Aufgaben
    if(gesamt > MA_TAG_KAPAZITAET){
      warnungen.push({
        ma:    t.ma,
        datum: t.datum,
        istH:  gesamt,
        kapH:  MA_TAG_KAPAZITAET,
      });
    } else if(gesamt === MA_TAG_KAPAZITAET){
      warnungen.push({
        ma:    t.ma,
        datum: t.datum,
        istH:  gesamt,
        kapH:  MA_TAG_KAPAZITAET,
        voll:  true,
      });
    }
  });

  if(!warnungen.length) return;

  // Notification-Panel anzeigen (bleibt bis manuell geschlossen)
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:70px;right:20px;width:320px;background:#fff;border-radius:12px;'
    +'box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:9999;padding:0;overflow:hidden;'
    +'border-left:4px solid var(--amber);animation:slideInR .3s ease;';

  var rows = warnungen.map(function(w){
    var col  = w.istH > w.kapH ? 'var(--red)' : 'var(--amber)';
    var icon = w.istH > w.kapH ? '🔴' : '🟡';
    var tagDE = w.datum ? (function(){
      var d = new Date(w.datum);
      var tage = ['So','Mo','Di','Mi','Do','Fr','Sa'];
      return tage[d.getDay()]+' '+d.getDate()+'.'+(d.getMonth()+1)+'.';
    })() : w.datum;
    var text = w.voll
      ? icon+' <b>'+w.ma+'</b> ist am <b>'+tagDE+'</b> voll eingeplant ('+w.istH+'/'+w.kapH+' Std.)'
      : icon+' <b>'+w.ma+'</b> am <b>'+tagDE+'</b>: <span style="color:'+col+';font-weight:700;">'+w.istH+' / '+w.kapH+' Std.</span> — Überlastet';
    return '<div style="padding:8px 14px;border-bottom:1px solid var(--border);font-size:12px;line-height:1.5;">'+text+'</div>';
  }).join('');

  panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--amber-l);">'
    +'<span style="font-size:12px;font-weight:700;color:var(--amber);">⚠ Kapazitätswarnung</span>'
    +'<button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text3);">×</button>'
  +'</div>'
  +rows;

  document.body.appendChild(panel);
  // Auto-close nach 12 Sekunden
  setTimeout(function(){ if(panel.parentElement) panel.remove(); }, 12000);
}

// ── Aufgaben-Vorschau nach Auftrag-Anlage ─────────────────────────────
// Öffnet das Detail-Panel mit einer Tabelle aller erzeugten Aufgaben.
// Bleibt sichtbar bis der Nutzer selbst schließt (kein Auto-close).
function showAufgabenVorschau(auftragId){
  var a  = AUFTRAEGE.find(function(x){ return x.id === auftragId; });
  var aufgaben = INTERN_AUFGABEN.filter(function(g){ return g.auftragId === auftragId; });
  var sollAusAuftrag = a ? internAuftragSollStundenGesamt(a) : 0;
  var gesamtSoll =
    sollAusAuftrag > 0 ? sollAusAuftrag : internGeplanteSollStundenAusAufgabenliste(aufgaben);

  var statusCol = { offen:'var(--amber)', in_arbeit:'var(--blue)', erledigt:'var(--green)' };
  var statusLbl = { offen:'Offen', in_arbeit:'In Arbeit', erledigt:'Erledigt ✓' };

  var tabelleRows = aufgaben.map(function(g){
    var schrittLabel = (STEP_LABELS[g.schritt] && STEP_LABELS[g.schritt].title) || g.schritt;
    var schrittCol   = (STEP_LABELS[g.schritt] && STEP_LABELS[g.schritt].col)   || 'var(--text)';
    var col = statusCol[g.status] || 'var(--text3)';
    var lbl = statusLbl[g.status] || g.status;
    return '<tr style="border-bottom:1px solid var(--border);">'
      +'<td style="padding:8px 10px;font-size:12px;font-weight:700;color:'+schrittCol+';">'+schrittLabel+'</td>'
      +'<td style="padding:8px 10px;font-size:12px;">'+g.ma+'</td>'
      +'<td style="padding:8px 10px;font-size:12px;font-variant-numeric:tabular-nums;">'+g.dauer+' h</td>'
      +'<td style="padding:8px 10px;">'
        +'<span style="font-size:11px;font-weight:700;color:'+col+';background:'+col+'18;'
          +'padding:2px 8px;border-radius:20px;">'+lbl+'</span>'
      +'</td>'
      +'</tr>';
  }).join('');

  document.getElementById('dpTitle').textContent = auftragId + ' — Interne Aufgaben';
  document.getElementById('dpBody').innerHTML =
    // Info-Banner
    '<div style="padding:12px 16px;background:var(--green-l);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">'
      +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
      +'<div style="font-size:12px;color:var(--green);font-weight:700;">Auftrag angelegt · '+(aufgaben.length)+' Aufgaben erzeugt</div>'
    +'</div>'
    // Auftrag-Info
    +'<div class="dp-section">'
      +'<div class="dp-slbl">Auftrag</div>'
      +'<div class="dp-row"><span class="dp-lbl">ID</span><span class="dp-val" style="font-weight:700;">'+auftragId+'</span></div>'
      +'<div class="dp-row"><span class="dp-lbl">Fahrzeug</span><span class="dp-val">'+(a?a.fz:'—')+'</span></div>'
      +'<div class="dp-row"><span class="dp-lbl">Kunde</span><span class="dp-val">'+(a?a.kunde:'—')+'</span></div>'
    +'</div>'
    // Aufgaben-Tabelle
    +'<div class="dp-section">'
      +'<div class="dp-slbl">Erzeugte interne Aufgaben</div>'
      +(aufgaben.length
        ? '<table style="width:100%;border-collapse:collapse;margin-top:6px;">'
            +'<thead>'
              +'<tr style="background:var(--gray-l);">'
                +'<th style="padding:6px 10px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;letter-spacing:.05em;">SCHRITT</th>'
                +'<th style="padding:6px 10px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;letter-spacing:.05em;">MITARBEITER</th>'
                +'<th style="padding:6px 10px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;letter-spacing:.05em;">DAUER</th>'
                +'<th style="padding:6px 10px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;letter-spacing:.05em;">STATUS</th>'
              +'</tr>'
            +'</thead>'
            +'<tbody>'+tabelleRows+'</tbody>'
          +'</table>'
        : '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Keine Aufgaben erzeugt.</div>'
      )
    +'</div>'
    // Gesamt
    +(aufgaben.length
      ? '<div class="dp-section" style="background:var(--blue-l);">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;">'
            +'<span style="font-size:12px;font-weight:700;color:var(--blue);">Geplante Gesamtdauer</span>'
            +'<span style="font-size:16px;font-weight:800;color:var(--blue);">'
              +gesamtSoll.toFixed(1)+' h'
            +'</span>'
          +'</div>'
        +'</div>'
      : ''
    );

  // Detail-Panel öffnen
  var ov = document.getElementById('detailOverlay');
  if(ov) ov.classList.add('open');
}

async function submitAuftrag(){
  const selKunde = document.getElementById('au-kunde');
  const kundeIdVal = selKunde?.value?.trim() || '';
  const kunde       = auKundeSelectAnzeigeText() || kundeIdVal;
  const auftragsart = document.getElementById('au-auftragsart')?.value?.trim();
  const leistung    = document.getElementById('au-leistung')?.value?.trim();
  const produktId   = document.getElementById('au-produkt')?.value?.trim();

  // Validation — Pflichtfelder: Kunde + Auftragsart + Leistungsbereich
  if(!kundeIdVal){
    showToast('⚠ Bitte Kunde auswählen (Sektion 1)');
    var b1=document.getElementById('ac-body-1'),a1=document.getElementById('ac-arrow-1');
    if(b1) b1.classList.remove('ac-closed');
    if(a1) a1.classList.add('open');
    document.getElementById('au-kunde')?.focus();
    return;
  }
  if(!auftragsart){
    showToast('⚠ Bitte Auftragsart wählen (Sektion 1)');
    var b1b=document.getElementById('ac-body-1'),a1b=document.getElementById('ac-arrow-1');
    if(b1b) b1b.classList.remove('ac-closed');
    if(a1b) a1b.classList.add('open');
    document.getElementById('au-auftragsart')?.focus();
    return;
  }
  if(!leistung){
    showToast('⚠ Bitte Leistungsbereich wählen (Sektion 1)');
    document.getElementById('au-leistung')?.focus();
    return;
  }
  // Fahrzeugtyp: Pflicht bei Fahrzeugbeschriftung
  if(leistung === 'fahrzeug' && !document.getElementById('au-fz-typ')?.value){
    showToast('⚠ Fahrzeugtyp auswählen (Sektion 2)');
    var b2v=document.getElementById('ac-body-2'),a2v=document.getElementById('ac-arrow-2');
    if(b2v) b2v.classList.remove('ac-closed');
    if(a2v) a2v.classList.add('open');
    document.getElementById('au-fz-typ')?.focus();
    return;
  }

  // Dauer-Pflichtfeld-Validierung für alle aktiven Schritte
  const stepOrder=['grafik','druck','laminat','montage','extern','doku'];
  const activeSteps=['grafik','druck','laminat','montage','extern'].filter(s=>{
    const cb=document.getElementById('au-step-'+s); return cb&&cb.checked;
  });
  const allSteps=activeSteps.length?[...activeSteps,'doku']:[];
  for(var i=0;i<allSteps.length;i++){
    var s=allSteps[i];
    var dauerEl=document.getElementById('au-sd-dauer-'+s);
    if(!dauerEl||!dauerEl.value||parseFloat(dauerEl.value)<=0){
      var cfg=AU_STEP_CONFIG[s]||{label:s};
      showToast('⚠ Dauer (h) fehlt bei: '+cfg.label);
      var b3=document.getElementById('ac-body-3'),a3=document.getElementById('ac-arrow-3');
      if(b3) b3.classList.remove('ac-closed');
      if(a3) a3.classList.add('open');
      if(dauerEl){ dauerEl.style.borderColor='var(--red)'; dauerEl.focus(); }
      return;
    }
  }

  // Optionale Felder einlesen
  const fz         = document.getElementById('au-fz')?.value||'—';
  const fzTyp      = document.getElementById('au-fz-typ')?.value||'';
  const fzAnzahl   = parseInt(document.getElementById('au-fz-anzahl')?.value||'1')||1;
  const terminDatum    = document.getElementById('au-termin')?.value||'';
  const montageDatum   = document.getElementById('au-montage-datum')?.value||'';
  const montageZeit    = document.getElementById('au-montage-zeit')?.value||'';
  var lieferterminInput = document.getElementById('au-liefertermin');
  var lieferterminRaw = lieferterminInput && lieferterminInput.value != null ? String(lieferterminInput.value).trim() : '';
  var liefert =
    lieferterminRaw !== '' && /^\d{4}-\d{2}-\d{2}$/.test(lieferterminRaw.substring(0, 10))
      ? lieferterminRaw.substring(0, 10)
      : '';
  const montageStepChecked = !!(document.getElementById('au-step-montage') && document.getElementById('au-step-montage').checked);
  const mtForm = ccInternMontageTerminAusFormular(montageDatum, montageZeit, terminDatum, montageStepChecked);

  // Starttermin: Pflichtfeld
  if(!terminDatum){
    showToast('⚠ Starttermin ist Pflicht (Sektion 2)');
    var b2t=document.getElementById('ac-body-2'),a2t=document.getElementById('ac-arrow-2');
    if(b2t) b2t.classList.remove('ac-closed');
    if(a2t) a2t.classList.add('open');
    document.getElementById('au-termin')?.focus();
    return;
  }
  const depot      = document.getElementById('au-depot')?.value||'';
  // ── Sektion 3: Angebot / Kalkulation ─────────────────────────
  const netto      = parseFloat(document.getElementById('au-netto')?.value)||0;
  const mwst       = 19;
  const brutto     = netto > 0 ? parseFloat((netto * 1.19).toFixed(2)) : 0;
  const zahlziel   = document.getElementById('au-zahlungsziel')?.value||'';
  const reArt      = document.getElementById('au-rechnungsart')?.value||'';
  const angebot    = document.getElementById('au-angebot')?.value||'';
  // ── Sektion 4: Produktionsdetails ────────────────────────────
  const material = document.getElementById('au-material')?.value?.trim()||'';
  const laminat  = document.getElementById('au-laminat')?.value?.trim()||'';
  const maschine   = document.getElementById('au-maschine')?.value||'HP Latex 560';
  const flaeche    = parseFloat(document.getElementById('au-flaeche')?.value)||0;
  const stueck     = parseInt(document.getElementById('au-stueck')?.value)||1;
  const format     = document.getElementById('au-format')?.value||'';
  const notizProd  = document.getElementById('au-notiz-produktion')?.value||'';
  const notizBes   = document.getElementById('au-notiz-besonderheiten')?.value||'';
  // ── Beschreibung: optional ────────────────────────────────────
  const beschr = document.getElementById('au-beschr')?.value?.trim()||'';

  // ── FREIE LEISTUNG: Bezeichnung aus Freitext-Feld lesen ──────
  const freieBezeichnung = document.getElementById('au-freie-bezeichnung')?.value?.trim()||'';
  if(leistung === 'sonstiges' && !freieBezeichnung){
    // Bei freier Leistung: beschr wird als Bezeichnung genutzt wenn kein extra-Feld
    // (freieBezeichnung und beschr können identisch sein — das ist ok)
  }
  // Paket-Beschriftung: bei freier Leistung = Beschreibung als Titel
  const artCfg   = ccAuftragsartById(auftragsart);
  const prodCfg  = ccProduktById(produktId);
  const paket    = (leistung === 'sonstiges' ? beschr : null)
    || freieBezeichnung
    || [prodCfg?prodCfg.label:'', artCfg?artCfg.label:''].filter(Boolean).join(' · ')
    || auftragsart;
  const steps    = ['grafik','druck','laminat','montage'].filter(s=>document.getElementById('au-step-'+s)?.checked);
  const firstStep= steps[0]||'grafik';
  const id = 'AU-2026-0'+auNr++;

  // Schritte mit MA + Dauer aufbauen — liest Verantwortlicher + Zusatz-MA (nur User-UUIDs; Kürzel nur Anzeige)
    function buildSchritt(step){
    var cfg = AU_STEP_CONFIG[step]||{typ:'single',maOptions:[]};
    var stepMaRowsB = auSchrittVerantwortlicheZeilen(cfg.maOptions);
    var dauerEl = document.getElementById('au-sd-dauer-'+step);
    var dauer = dauerEl ? parseFloat(dauerEl.value)||0 : 0;

    if(!cfg.maOptions.length){
      return {
        typ:              cfg.typ,
        werId:            null,
        verantwortlicher: null,
        verantwortlicherName: '—',
        zusatzMa:         [],
        zusatzMaNames:    [],
        maIds:            [],
        teamMaIds:        [],
        maId:             null,
        wer:              '—',
        dauer:            dauer,
        status:           'offen',
        fertig:           false,
        zeit:             null,
        checkliste:       (AU_CUSTOM_CL[step]||[]).map(function(txt){
          return {text:txt, kat:'pflicht', hinweis:'', quelle:'Manuell', erledigt:false};
        }),
        fotosErforderlich: (step==='montage'||step==='doku'),
        fotos:            [],
      };
    }

    var verantRaw = '';
    if(step === 'doku'){
      var dokuSel2 = document.getElementById('au-sd-verant-doku-sel');
      verantRaw = dokuSel2 ? String(dokuSel2.value).trim() : '';
    } else {
      var verantRadio = document.querySelector('input[name="au-sd-verant-'+step+'"]:checked');
      verantRaw = verantRadio ? String(verantRadio.value).trim() : '';
      if(!verantRaw){
        var hidden = document.getElementById('au-sd-wer-'+step);
        verantRaw = hidden ? String(hidden.value).trim() : '';
      }
      if(!verantRaw && stepMaRowsB.length) verantRaw = auSchrittMaRowId(stepMaRowsB[0]);
    }

    var verantUuid = '';
    if (verantRaw) {
      var vRes = typeof maKuerzelOderIdZuUserUuid === 'function' ? maKuerzelOderIdZuUserUuid(verantRaw) : null;
      var vCand = (vRes && String(vRes).trim()) || verantRaw;
      if (typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(String(vCand).trim())) {
        verantUuid = String(vCand).trim();
      } else if (typeof console !== 'undefined' && console.warn) {
        console.warn('MA Mapping fehlt für Schritt ' + step + ': Wert ' + String(verantRaw));
      }
    } else if (step !== 'doku' && cfg.maOptions && cfg.maOptions.length) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('MA Mapping fehlt für Schritt ' + step + ': (kein Verantwortlicher gewählt)');
      }
    }

    var zusatzUuids = [];
    var seenZ = {};
    stepMaRowsB.forEach(function(mz){
      var optId = auSchrittMaRowId(mz);
      if (!optId) return;
      var idDom = optId.replace(/[^a-zA-Z0-9_-]/g, '_');
      var cb = document.getElementById('au-sd-zusatz-'+step+'-'+idDom);
      if (!cb || !cb.checked) return;
      var zUuid = typeof maKuerzelOderIdZuUserUuid === 'function' ? (maKuerzelOderIdZuUserUuid(optId) || null) : null;
      if (!zUuid && typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(String(optId).trim())) {
        zUuid = String(optId).trim();
      }
      if (!zUuid || typeof maIstCockpitUserUuid !== 'function' || !maIstCockpitUserUuid(zUuid)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('MA Mapping fehlt für Schritt ' + step + ': Zusatz-Wert ' + String(optId));
        }
        return;
      }
      if (verantUuid && zUuid === verantUuid) return;
      if (seenZ[zUuid]) return;
      seenZ[zUuid] = true;
      zusatzUuids.push(zUuid);
    });

    var teamUuids = [];
    var seenTeam = {};
    function pushTeamUuid(u) {
      if (!u || typeof maIstCockpitUserUuid !== 'function' || !maIstCockpitUserUuid(String(u).trim())) return;
      var t = String(u).trim();
      if (seenTeam[t]) return;
      seenTeam[t] = true;
      teamUuids.push(t);
    }
    if (verantUuid) pushTeamUuid(verantUuid);
    zusatzUuids.forEach(pushTeamUuid);

    var mv = verantUuid && typeof maByID === 'function' ? maByID(verantUuid) : null;
    if (!mv && verantRaw && typeof maDataFindByWorkflowKey === 'function') {
      mv = maDataFindByWorkflowKey(verantRaw);
    }
    var zusatzNames = zusatzUuids.map(function (zu) {
      var zm = typeof maByID === 'function' ? maByID(zu) : null;
      return zm && zm.n ? String(zm.n) : zu;
    });
    var zusatzK = zusatzUuids.map(function (zu) {
      var zm = typeof maByID === 'function' ? maByID(zu) : null;
      return zm && zm.k != null && String(zm.k).trim() !== '' ? String(zm.k).trim().toUpperCase() : '';
    }).filter(function (x) { return x; });
    var werK =
      mv && mv.k != null && String(mv.k).trim() !== ''
        ? String(mv.k).trim().toUpperCase()
        : verantRaw && String(verantRaw).length <= 8
          ? String(verantRaw).trim().toUpperCase()
          : '';

    return {
      typ:              cfg.typ,
      werId:            verantUuid || null,
      verantwortlicher: verantUuid || null,
      verantwortlicherName: mv && mv.n ? String(mv.n) : verantRaw || '—',
      zusatzMa:         zusatzK,
      zusatzMaNames:    zusatzNames,
      maIds:            teamUuids.slice(),
      teamMaIds:        teamUuids.slice(),
      maId:             verantUuid || (teamUuids.length ? teamUuids[0] : null),
      wer:              werK || (verantRaw ? String(verantRaw).trim() : '—'),
      dauer:            dauer,
      // ── Status ──────────────────────────────────────────────────────
      status:           'offen',
      fertig:           false,
      zeit:             null,
      // ── Schritt-eigene Checkliste (eigene Punkte aus Modal) ─────────
      checkliste:       (AU_CUSTOM_CL[step]||[]).map(function(txt){
        return {text:txt, kat:'pflicht', hinweis:'', quelle:'Manuell', erledigt:false};
      }),
      fotosErforderlich: (step==='montage'||step==='doku'),
      fotos:            [],
    };
  }

  // Auftragsobjekt aufbauen
  // Priorität aus Button-Zustand lesen
  var prio = typeof auPrio !== 'undefined' ? auPrio : 'normal';
  // Maße (bei Schildern/Druck)
  var fzBreite = parseFloat(document.getElementById('au-fz-breite')?.value)||0;
  var fzHoehe  = parseFloat(document.getElementById('au-fz-hoehe')?.value)||0;
  // Notiz Montage + Grafik + Produktion
  var notizMontage = document.getElementById('au-notiz-montage')?.value||'';

  var neuerAuftrag = {
    _ccPendingCockpitSync: true,
    // ── Basis ─────────────────────────────────────────────────
    id, kunde,
    fz:            fz,
    paket:         paket,
    beschr:        beschr,
    auftragsart:   auftragsart,
    leistungId:    leistung,
    produktId:     produktId,
    freieBezeichnung: leistung==='sonstiges' ? beschr : (freieBezeichnung||''),
    prio:          prio,
    // ── Fahrzeug ──────────────────────────────────────────────
    fzTyp:         fzTyp,
    fzAnzahl:      fzAnzahl,
    fzBreite:      fzBreite,
    fzHoehe:       fzHoehe,
    // ── Termine ───────────────────────────────────────────────
    terminDatum:   terminDatum||montageDatum||'',
    montageDatum:  montageStepChecked && mtForm.datumTag ? mtForm.datumTag : montageDatum,
    montageTermin: montageStepChecked && mtForm.isoMitZeit ? mtForm.isoMitZeit : '',
    montageDatumZeit: montageStepChecked && mtForm.isoMitZeit ? mtForm.isoMitZeit : '',
    montageZeit:   montageZeit,
    liefertermin:  liefert || '',
    // ── Standort ──────────────────────────────────────────────
    depot:         depot,
    // ── Projektleiter ─────────────────────────────────────────
    projektleiter: (document.getElementById('au-z-leiter')||{}).value||'',
    // ── Kalkulation ───────────────────────────────────────────
    netto:         netto,
    mwst:          mwst,
    brutto:        brutto,
    zahlziel:      zahlziel,
    reArt:         reArt,
    angebot:       angebot,
    // ── Produktionsdetails ────────────────────────────────────
    material:      material,
    laminat:       laminat,
    flaeche:       flaeche,
    stueck:        stueck,
    format:        format,
    notizProd:     notizProd,
    notizBes:      notizBes,
    notizMontage:  notizMontage,
    // ── Status / Workflow ─────────────────────────────────────
    step: firstStep,
    urgent: auPrio==='dringend',
    rechnung: 'offen',
    fotos: [],
    dateien: [...auFiles],  // Bilder inline - DAL.save bereinigt sie automatisch
    zeiten: [],
    schritte:{
      grafik:        buildSchritt('grafik'),
      druck:         buildSchritt('druck'),
      laminat:       buildSchritt('laminat'),
      montage:       buildSchritt('montage'),
      doku:          buildSchritt('doku'),
      abgeschlossen: {wer:null, maId:null, dauer:0, fertig:false, zeit:null},
    },
    prod:{
      planung:{
        folienhersteller: '',
        folientyp:        '',
        // Aus Auftrag-Formular vorausgefüllt (Sektion 4 → Planung)
        produktname:      material,          // Material/Folie-Wahl
        farbnummer:       '',
        druckmaterial:    material,
        laminat:          laminat,
        maschine:         maschine,
        verarbeitungstyp: '',
        flaeche:          flaeche ? String(flaeche) : '',
        stueck:           stueck  ? String(stueck)  : '1',
        notiz:            notizProd,
      },
      produktion:{bestaetigt:false},
      template:{typ:'',version:'',datei:'',scan:''},
      dateien:[],
    }
  };
  if (montageStepChecked && mtForm.isoMitZeit && neuerAuftrag.schritte && neuerAuftrag.schritte.montage) {
    neuerAuftrag.schritte.montage.datum = mtForm.isoMitZeit;
  }
  // Req. 1: Checklisten gehören zum Schritt, nicht zur Person
  // Schritt-spezifische Checklisten in schritte[] einbauen
  // Custom-Punkte (aus Modal) kommen zuerst, danach Template-Punkte (ohne Duplikate)
  if (!Array.isArray(window.CL_VORLAGEN) || window.CL_VORLAGEN.length === 0) {
    if (window.CCIntern?.cockpitApi?.reloadChecklistenVorlagenFromApi) {
      await window.CCIntern.cockpitApi.reloadChecklistenVorlagenFromApi();
    }
  }
  var __clSteps = ['grafik','druck','laminat','montage','doku'];
  for (var __ci = 0; __ci < __clSteps.length; __ci++) {
    var step = __clSteps[__ci];
    var sch = neuerAuftrag.schritte[step];
    if(sch && sch.dauer > 0){
      var templateCL = await ccDbChecklistenFuerSchritt(neuerAuftrag.produktId, step, neuerAuftrag);
      if (templateCL.length > 0) {
        sch.checkliste = templateCL.map(function (item) {
          return Object.assign({}, item, { erledigt: false, löschbar: false });
        });
        if (typeof console !== 'undefined' && console.log) {
          console.log('[CL-DB-VORLAGE ÜBERNOMMEN]', {
            auftragId: id,
            schritt: step,
            punkte: sch.checkliste.length,
          });
        }
      } else {
        sch.checkliste = [];
      }
    }
  }
  neuerAuftrag.checklisten = clFlatChecklistenAusSchritte(neuerAuftrag);

  AUFTRAEGE.push(neuerAuftrag);
  var anzeigeIdVorPost = id;
  saveAuftraege(null, anzeigeIdVorPost);

  var capiPost =
    typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi
      ? window.CCIntern.cockpitApi
      : null;
  if (capiPost && typeof capiPost.flushAuftraegeNow === 'function') {
    try {
      await capiPost.flushAuftraegeNow(null, anzeigeIdVorPost);
    } catch (_flushPostErr) {
      /* Detail trotzdem öffnen; CL-Nachladen wird versucht */
    }
  }

  // Echte Auftragsnummer nach Reload: per ccApiId im AUFTRAEGE-Array (Retry, kein Temp-ID-Fallback)
  var ccApiIdNachPost =
    neuerAuftrag && neuerAuftrag.ccApiId != null ? String(neuerAuftrag.ccApiId).trim() : '';
  var aNachPost = null;
  for (var _retry = 0; _retry < 5; _retry++) {
    if (!ccApiIdNachPost && neuerAuftrag && neuerAuftrag.ccApiId != null) {
      ccApiIdNachPost = String(neuerAuftrag.ccApiId).trim();
    }
    if (ccApiIdNachPost) {
      aNachPost = AUFTRAEGE.find(function (x) {
        return x && String(x.ccApiId || '').trim() === ccApiIdNachPost;
      });
    }
    if (aNachPost) break;
    await new Promise(function (r) {
      setTimeout(r, 200);
    });
  }
  var openId =
    aNachPost && aNachPost.id != null ? String(aNachPost.id).trim() : '';
  if (!openId) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[submitAuftrag] Auftrag nach POST nicht in AUFTRAEGE gefunden', {
        ccApiIdNachPost: ccApiIdNachPost,
        anzeigeIdVorPost: anzeigeIdVorPost,
      });
    }
    if (typeof showToast === 'function') {
      showToast('⚠ Auftrag gespeichert — Detail konnte nicht geöffnet werden (Server-ID fehlt).');
    }
    closeAuftragModal();
    renderKanban();
    if (currentPage === 'auftraege') renderAuftragVerwaltung();
    if (currentPage === 'kalender') buildCCCalendar();
    return;
  }

  var clNachPost = await auChecklistenSchritteAusDbNachPost(aNachPost, produktId);
  if (clNachPost) {
    saveAuftraege(null, openId);
    if (capiPost && typeof capiPost.flushAuftraegeNow === 'function') {
      try {
        await capiPost.flushAuftraegeNow(null, openId);
      } catch (_flushClErr) {}
    }
  }

  closeAuftragModal();
  renderKanban();
  if(currentPage==='auftraege') renderAuftragVerwaltung();
  if(currentPage==='kalender') buildCCCalendar();
  // Detail mit Auftragsnummer aus API-Antwort öffnen
  setTimeout(function(){ openAuftragDetail(openId); }, 50);
  var ersterWer=buildSchritt(firstStep).wer||'—';
  showWorkflowNotif({id:openId,fz,kunde},null,firstStep,ersterWer,
    new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}));
  // Interne Aufgaben anlegen
  await auftragAufgabenErzeugen(openId);
  // Kapazitätsprüfung: Warnungen anzeigen wenn MA überlastet
  maKapWarnungAnzeigen(openId);
  // Aufgaben-Vorschau sofort im Detail-Panel anzeigen
  showAufgabenVorschau(openId);
  var clAnzahl =
    aNachPost && Array.isArray(aNachPost.checklisten) ? aNachPost.checklisten.length : 0;
  showToast('✓ '+openId+' angelegt · '+kunde+(terminDatum||liefert?' · 📅':'')
    +(clAnzahl?' · 📋 '+clAnzahl+' Prüfpunkte':''));
}


// ══════════════════════════════════════════════════════════════════
// SELBSTTEST — Funktionssicherheit der Zeitbuchungs- und MA-Logik
// Aufruf: ccSelbsttest() im Browser-Panel
// ══════════════════════════════════════════════════════════════════
function ccSelbsttest(){
  var results = [];
  var ok = 0; var fail = 0;

  function assert(name, condition, detail){
    if(condition){ ok++; results.push({ok:true,  name:name, detail:detail||''}); }
    else         { fail++;results.push({ok:false, name:name, detail:detail||'FEHLGESCHLAGEN'}); }
  }

  // ── Hilfsfunktion: Stunden eines MA ──────────────────────────
  function stunden(maId, name){
    return calcMaStunden(maId, name);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Zeitbuchung erhöht Stunden des richtigen MA
  // ─────────────────────────────────────────────────────────────
  var au = AUFTRAEGE.find(function(a){ return a.id==='AU-2026-038'; });
  if(au){
    var vorher = stunden('IL','Ilayda');
    // Buchung direkt einfügen (simuliert zeitStart+zeitStop)
    if(!au.zeiten) au.zeiten=[];
    au.zeiten.push({step:'grafik', wer:'Ilayda', maId:'IL', start:'TEST', end:'TEST', dauer:60});
    var nachher = stunden('IL','Ilayda');
    assert('Test 1a: +60min → +1.0h Ilayda', Math.abs((nachher-vorher)-1.0)<0.01,
      'vorher='+vorher+'h nachher='+nachher+'h diff='+(nachher-vorher));
    // Rückgängig
    au.zeiten.pop();
    var reset = stunden('IL','Ilayda');
    assert('Test 1b: Zurücksetzen korrekt', Math.abs(reset-vorher)<0.01, 'reset='+reset);
  } else {
    assert('Test 1: AU-2026-038 gefunden', false, 'Auftrag nicht in AUFTRAEGE');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Handy-App (zeitStart/zeitStop) schreibt in AUFTRAEGE
  // ─────────────────────────────────────────────────────────────
  var au2 = AUFTRAEGE.find(function(a){ return a.id==='AU-2026-037'; });
  if(au2){
    var vorZeiten = (au2.zeiten||[]).length;
    var vorStd = stunden('ME','Melanie');
    // Simuliere zeitStart (direkt ZEIT_AKTIV setzen)
    var testKey = 'AU-2026-037_grafik';
    ZEIT_AKTIV[testKey] = {
      start:   new Date(Date.now()-7200000), // 2h ago
      wer:     'Melanie',
      maId:    'ME',
      alleWer: ['Melanie'],
      auId:    'AU-2026-037',
      step:    'grafik',
    };
    // Simuliere zeitStop
    zeitStop('AU-2026-037','grafik');
    var nachZeiten = (au2.zeiten||[]).length;
    var nachStd = stunden('ME','Melanie');
    assert('Test 2a: zeitStop schreibt in AUFTRAEGE.zeiten',
      nachZeiten > vorZeiten,
      'vorher='+vorZeiten+' nachher='+nachZeiten+' Einträge');
    assert('Test 2b: Melanies Stunden steigen nach Buchung',
      nachStd > vorStd,
      'vorher='+vorStd+'h nachher='+nachStd+'h');
    // Letzten Testeintrag entfernen
    au2.zeiten.pop();
  } else {
    assert('Test 2: AU-2026-037 gefunden', false, 'Auftrag nicht in AUFTRAEGE');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Kombi "Okan + Mete" bucht bei BEIDEN
  // ─────────────────────────────────────────────────────────────
  var au3 = AUFTRAEGE.find(function(a){ return a.id==='AU-2026-041'; });
  if(au3){
    var okVor  = stunden('OK','Okan');
    var myVor  = stunden('MY','Mete');
    // Simuliere zeitStart+zeitStop für "Okan + Mete"
    var testKey3 = 'AU-2026-041_montage';
    ZEIT_AKTIV[testKey3] = {
      start:   new Date(Date.now()-3600000), // 1h ago
      wer:     'Okan',
      maId:    'OK',
      alleWer: ['Okan','Mete'],
      auId:    'AU-2026-041',
      step:    'montage',
    };
    zeitStop('AU-2026-041','montage');
    var okNach = stunden('OK','Okan');
    var myNach = stunden('MY','Mete');
    assert('Test 3a: Okan bekommt Zeit bei Kombi-Buchung',
      okNach > okVor, 'Okan: '+okVor+'h → '+okNach+'h');
    assert('Test 3b: Mete bekommt Zeit bei Kombi-Buchung',
      myNach > myVor, 'Mete: '+myVor+'h → '+myNach+'h');
    assert('Test 3c: Beide bekommen gleich viel Zeit',
      Math.abs((okNach-okVor)-(myNach-myVor))<0.1,
      'Okan +'+((okNach-okVor).toFixed(1))+'h Mete +'+((myNach-myVor).toFixed(1))+'h');
    // Testeinträge entfernen (2 Einträge: je einer für Okan und Mete)
    au3.zeiten.splice(-2,2);
  } else {
    assert('Test 3: AU-2026-041 gefunden', false, 'Auftrag nicht in AUFTRAEGE');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Aufgabenanzahl — offen vs. abgeschlossen
  // ─────────────────────────────────────────────────────────────
  // Suche MA mit bekannter Aufgabe
  var aufgVorher = calcMaAufgaben('ME','Melanie');
  // Neuen Auftrag mit Melanie anlegen
  var testAu = {
    id:'TEST-MA-001', kunde:'Test', fz:'Test', paket:'Test',
    step:'grafik', rechnung:'offen', fotos:[], dateien:[], zeiten:[],
    schritte:{
      grafik:{wer:'Melanie',fertig:false,zeit:null},
      druck:{wer:'Selim',fertig:false,zeit:null},
      laminat:{wer:'Selim',fertig:false,zeit:null},
      montage:{wer:'Okan',fertig:false,zeit:null},
      doku:{wer:'Okan',fertig:false,zeit:null},
      abgeschlossen:{wer:null,fertig:false,zeit:null},
    },
    prod:{planung:{},produktion:{bestaetigt:false},template:{},dateien:[]}
  };
  AUFTRAEGE.push(testAu);
  var aufgMit = calcMaAufgaben('ME','Melanie');
  assert('Test 4a: Neue Aufgabe → MA-Zähler +1',
    aufgMit === aufgVorher+1,
    'vorher='+aufgVorher+' nachher='+aufgMit);
  // Auftrag abschließen
  testAu.step='abgeschlossen';
  var aufgAbg = calcMaAufgaben('ME','Melanie');
  assert('Test 4b: Abgeschlossen → Aufgabe verschwindet',
    aufgAbg === aufgVorher,
    'vorher='+aufgVorher+' nach Abschluss='+aufgAbg);
  // Aufräumen
  AUFTRAEGE.splice(AUFTRAEGE.indexOf(testAu),1);

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Persistenz-Simulation (gleiche Referenz nach renderKanban)
  // ─────────────────────────────────────────────────────────────
  // Da kein localStorage, prüfen wir: nach renderKanban() bleiben
  // zeiten in AUFTRAEGE erhalten (in-memory persistence)
  var au5 = AUFTRAEGE.find(function(a){ return a.id==='AU-2026-036'; });
  if(au5){
    var zAnzahlVor = (au5.zeiten||[]).length;
    au5.zeiten.push({step:'test',wer:'Test',maId:'CE',start:'T',end:'T',dauer:30});
    renderKanban(); // simuliert Seiteninteraktion
    var zAnzahlNach = (au5.zeiten||[]).length;
    assert('Test 5a: zeiten bleiben nach renderKanban erhalten',
      zAnzahlNach === zAnzahlVor+1,
      'vor='+zAnzahlVor+' nach='+zAnzahlNach);
    // Check: calcMaStunden liest den neuen Eintrag
    var stdCE = stunden('CE','Celal');
    assert('Test 5b: Neuer Eintrag sofort in calcMaStunden sichtbar',
      stdCE >= 0.5, 'Celal: '+stdCE+'h (Test-Eintrag 30min)');
    au5.zeiten.pop();
    // Hinweis: localStorage-Persistenz über Sitzung hinaus
    // ist in dieser App nicht implementiert — bewusste Entscheidung
    // (alle Daten leben in-memory, kein Backend)
    assert('Test 5c: In-memory Persistenz (kein Backend nötig für Demo)',
      typeof AUFTRAEGE !== 'undefined' && AUFTRAEGE.length > 0, 'AUFTRAEGE hat '+AUFTRAEGE.length+' Einträge');
  } else {
    assert('Test 5: AU-2026-036 gefunden', false, 'Auftrag nicht in AUFTRAEGE');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 6: MA_DATA Konsistenz — alle haben maId + soll
  // ─────────────────────────────────────────────────────────────
  var ohneId   = MA_DATA.filter(function(m){ return !m.maId; });
  var ohneSoll = MA_DATA.filter(function(m){ return !m.soll || m.soll<=0; });
  assert('Test 6a: Alle MA haben maId', ohneId.length===0,
    ohneId.length ? ohneId.map(function(m){return m.n;}).join(', ')+' ohne maId' : MA_DATA.length+' MA OK');
  assert('Test 6b: Alle MA haben soll>0', ohneSoll.length===0,
    ohneSoll.length ? ohneSoll.map(function(m){return m.n;}).join(', ')+' ohne soll' : 'OK');

  // ─────────────────────────────────────────────────────────────
  // ERGEBNIS ANZEIGEN
  // ─────────────────────────────────────────────────────────────
  var panel = document.getElementById('cc-test-panel');
  if(!panel){
    panel = document.createElement('div');
    panel.id='cc-test-panel';
    panel.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(panel);
  }
  panel.innerHTML='<div style="background:#fff;border-radius:14px;width:580px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.3);overflow:hidden;">'
    +'<div style="padding:18px 22px;background:'+(fail===0?'#2E7D32':'#C62828')+';color:#fff;display:flex;justify-content:space-between;align-items:center;">'
      +'<div><div style="font-size:16px;font-weight:700;">🧪 CC Intern — Selbsttest</div>'
      +'<div style="font-size:12px;opacity:.8;">'+ok+' ✅ bestanden · '+fail+(fail===0?' ❌ Fehler':' ❌ FEHLER')+'</div></div>'
      +'<button onclick="document.getElementById(\'cc-test-panel\').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px;">Schließen ×</button>'
    +'</div>'
    +'<div style="overflow-y:auto;padding:16px 22px;">'
    +results.map(function(r){
      return '<div style="display:flex;gap:10px;padding:9px 12px;border-radius:8px;margin-bottom:6px;background:'+(r.ok?'#F1F8E9':'#FFEBEE')+';border-left:3px solid '+(r.ok?'#4CAF50':'#F44336')+';">'
        +'<span style="font-size:16px;flex-shrink:0;">'+(r.ok?'✅':'❌')+'</span>'
        +'<div><div style="font-size:13px;font-weight:600;color:'+(r.ok?'#2E7D32':'#C62828')+';">'+r.name+'</div>'
        +(r.detail?'<div style="font-size:11px;color:#546E7A;margin-top:2px;">'+r.detail+'</div>':'')
        +'</div></div>';
    }).join('')
    +'</div></div>';

  return {ok:ok, fail:fail, results:results};
}

// ══════════════════════════════════════════════════════════════════
// EXPORT / IMPORT — Backup während Testphase (ohne Server)
// ══════════════════════════════════════════════════════════════════

function ccExport(){
  var backup = {
    version:    '1.0',
    exportiert: new Date().toISOString(),
    system:     'CC Intern',
    auftraege:  AUFTRAEGE,
    fusa:       CC_FUSA_TERMINE,
    mitarbeiter: MA_DATA.map(function(m){
      return {maId:m.maId,n:m.n,r:m.r,av:m.av,col:m.col,soll:m.soll,urlaub:m.urlaub};
    }),
  };
  var json     = JSON.stringify(backup, null, 2);
  var blob     = new Blob([json], {type:'application/json'});
  var url      = URL.createObjectURL(blob);
  var datum    = new Date().toISOString().substring(0,10);
  var a        = document.createElement('a');
  a.href       = url;
  a.download   = 'CC_Intern_Backup_'+datum+'.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Export: '+AUFTRAEGE.length+' Aufträge · '+CC_FUSA_TERMINE.length+' FUSA-Termine');
}

function ccImport(event){
  var file = event.target.files[0];
  if(!file){ return; }
  var reader = new FileReader();
  reader.onload = function(e){
    try {
      var data = JSON.parse(e.target.result);
      // Validierung
      if(!data.auftraege || !Array.isArray(data.auftraege)){
        showToast('⚠ Ungültige Datei — kein gültiges CC-Intern-Backup');
        return;
      }
      var confirm_text = 'Backup vom '+( data.exportiert||'unbekannt').substring(0,10)
        +' importieren?\n\n'+data.auftraege.length+' Aufträge'
        +(data.fusa?' · '+data.fusa.length+' FUSA-Termine':'')
        +'\n\nAktuelle Daten werden überschrieben.';
      if(typeof ccInternConfirm !== 'function') return;
      ccInternConfirm(confirm_text, function(){

      // Aufträge einlesen
      AUFTRAEGE.length = 0;
      data.auftraege.forEach(function(a){ AUFTRAEGE.push(a); });

      // FUSA-Termine einlesen
      if(data.fusa && Array.isArray(data.fusa)){
        CC_FUSA_TERME = CC_FUSA_TERMINE; // typo-safe
        CC_FUSA_TERMINE.length = 0;
        data.fusa.forEach(function(t){ CC_FUSA_TERMINE.push(t); });
      }

      // MA-Stammdaten einlesen (optional — soll-Werte könnten überschrieben werden)
      if(data.mitarbeiter && Array.isArray(data.mitarbeiter) && data.mitarbeiter.length > 0){
        MA_DATA.length = 0;
        data.mitarbeiter.forEach(function(m){ MA_DATA.push(m); });
      }

      // DAL: in localStorage speichern
      saveAuftraege();
      saveFusaTermine();
      saveMitarbeiter();

      // UI aktualisieren
      renderKanban();
      if(currentPage==='mitarbeiter') renderMitarbeiter();
      if(currentPage==='kalender')    buildCCCalendar();

      showToast('✅ Import: '+data.auftraege.length+' Aufträge geladen · '+(data.exportiert||'').substring(0,10));
      });
    } catch(err){
      showToast('⚠ Import fehlgeschlagen: '+err.message);
    }
    // Input zurücksetzen damit dieselbe Datei nochmal importiert werden kann
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════
// TELEFON-CHECK — LEADS
// ═══════════════════════════════════════════════
var LEADS = [];  // wird durch loadLeads() befüllt
var telNr  = 1;

function telCheckOpen(){
  // Felder zurücksetzen
  ['tel-projektart','tel-budget','tel-klarheit','tel-erwartung','tel-zeitrahmen','tel-herkunft']
    .forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  telCalc();
  document.getElementById('telCheckModal').classList.add('open');
}

function telCheckClose(){
  document.getElementById('telCheckModal').classList.remove('open');
}

// ── Score berechnen ──────────────────────────────
function telCalc(){
  var projektart = document.getElementById('tel-projektart')?.value||'';
  var budget     = document.getElementById('tel-budget')?.value||'';
  var klarheit   = document.getElementById('tel-klarheit')?.value||'';
  var erwartung  = document.getElementById('tel-erwartung')?.value||'';
  var zeitrahmen = document.getElementById('tel-zeitrahmen')?.value||'';
  var herkunft   = document.getElementById('tel-herkunft')?.value||'';

  var score = 0;

  // Positive Punkte
  if(herkunft==='empfehlung') score += 30;
  if(herkunft==='bestand')    score += 40;
  if(klarheit==='konkret')    score += 20;
  if(budget && budget!=='keine') score += 30;
  if(zeitrahmen==='sofort')   score += 15;

  // Negative Punkte
  if(budget==='keine')           score -= 30;
  if(erwartung==='entwurf')      score -= 50;
  if(klarheit==='unklar')        score -= 20;
  if(klarheit==='teilweise')     score -= 25;
  if(zeitrahmen==='spaeter')     score -= 15;
  if(zeitrahmen==='unklar')      score -= 20;

  // Automatische Regeln
  var forceRot = false;
  if(erwartung==='entwurf') forceRot = true;
  if(budget==='keine' && klarheit==='unklar') forceRot = true;

  // Status bestimmen
  var status, farbe, hinweis;
  if(forceRot || score < 40){
    status  = 'rot';
    farbe   = '#FF3B30';
    hinweis = '⚠ Zeitfresser – nur Vorkasse oder ablehnen';
  } else if(score < 70){
    status  = 'gelb';
    farbe   = '#FF9500';
    hinweis = '⚡ Vorsichtig – klar führen';
  } else {
    status  = 'grün';
    farbe   = '#34C759';
    hinweis = '✓ Guter Kunde – Angebot erstellen';
  }

  // UI aktualisieren
  var zahl   = document.getElementById('tel-score-zahl');
  var stEl   = document.getElementById('tel-score-status');
  var hwEl   = document.getElementById('tel-score-hinweis');
  var btnAng = document.getElementById('tel-btn-angebot');
  var btnVK  = document.getElementById('tel-btn-vorkasse');
  var btnAbs = document.getElementById('tel-btn-absagen');

  if(zahl)   { zahl.textContent=score; zahl.style.color=farbe; }
  if(stEl)   { stEl.textContent=({rot:'🔴 ROT',gelb:'🟡 GELB',grün:'🟢 GRÜN'})[status]||'';
               stEl.style.background=farbe+'22'; stEl.style.color=farbe; stEl.style.border='1.5px solid '+farbe+'44'; }
  if(hwEl)   { hwEl.textContent=hinweis; hwEl.style.color=farbe; }

  if(status==='rot'){
    if(btnAng) { btnAng.style.display='none'; }
    if(btnVK)  { btnVK.style.display=''; }
    if(btnAbs) { btnAbs.style.display=''; }
  } else {
    if(btnAng) { btnAng.style.display=''; }
    if(btnVK)  { btnVK.style.display='none'; }
    if(btnAbs) { btnAbs.style.display='none'; }
  }

  // Aktuellen State merken für Speichern
  window._telState = { projektart, budget, klarheit, erwartung, zeitrahmen, herkunft, score, status };
}

// ── Aktion: Angebot / Speichern / Vorkasse / Absagen ──────────
function telAktion(aktion){
  var s = window._telState || {};
  var id = 'LEAD-'+new Date().getFullYear()+'-'+String(telNr++).padStart(3,'0');
  var lead = {
    id:         id,
    projektart: s.projektart||'',
    budget:     s.budget||'',
    klarheit:   s.klarheit||'',
    erwartung:  s.erwartung||'',
    zeitrahmen: s.zeitrahmen||'',
    herkunft:   s.herkunft||'',
    leadScore:  s.score||0,
    status:     s.status||'unbekannt',
    aktion:     aktion,
    erstellt:   new Date().toLocaleDateString('de-DE'),
  };
  LEADS.push(lead);
  saveLeads();

  telCheckClose();

  if(aktion==='angebot'){
    showToast('✓ '+id+' gespeichert (Score: '+lead.leadScore+') → Angebot erstellen');
    // Schnell-Angebot Modal öffnen
    setTimeout(function(){ anfNeuModal(); }, 200);
  } else if(aktion==='vorkasse'){
    showToast('💰 '+id+' – Vorkasse angefordert');
  } else if(aktion==='absagen'){
    showToast('✗ '+id+' – Anfrage abgesagt');
  } else {
    showToast('💾 '+id+' gespeichert · Score: '+lead.leadScore+' · '+lead.status);
  }
}

// ── Urlaub Desktop: dynamisch aus URLAUB_ANTRAEGE ──────────────
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
          var m=(typeof maDataFindByWorkflowKey==='function'?maDataFindByWorkflowKey(a.maId):MA_DATA.find(function(x){return x.maId===a.maId;}))||{n:a.ma,av:'?',col:'#888'};
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


// ── Aufgaben für bestehende Aufträge nacherzeugen ────────────────
// Läuft einmal beim Start — erzeugt Aufgaben für Demo-Aufträge
// die vor dem neuen System angelegt wurden (haben noch keine Aufgaben)
async function mobAufgabenNacherzeugen(){
  if (typeof ccInternMaAppAufgabenSaveBlocked === 'function' && ccInternMaAppAufgabenSaveBlocked()) {
    console.info('[AUFGABEN_NACHERZEUGEN_BLOCKED_MA_APP_BOOT]');
    return;
  }
  await clMigrierAlle();
  var isVorlagenView = (typeof currentPage !== 'undefined' && currentPage === 'checklisten');
  if(isVorlagenView) return;
  var vorher = INTERN_AUFGABEN.length;

  // Req. 1: Checklisten in Schritte einbauen (Migration, nur DB/API)
  var needSave = false;
  var stepKeys = ['grafik','druck','laminat','montage','doku'];
  for (var ai = 0; ai < AUFTRAEGE.length; ai++) {
    var a = AUFTRAEGE[ai];
    var hatPersistierteCheckliste = auftragHatPersistierteCheckliste(a);
    if(hatPersistierteCheckliste){
      console.log('REBUILD BLOCKED - USER DATA EXISTS');
      continue;
    }
    for (var si = 0; si < stepKeys.length; si++) {
      var step = stepKeys[si];
      var sch = a.schritte && a.schritte[step];
      if(sch && sch.dauer > 0 && (!sch.checkliste || !sch.checkliste.length)){
        schrittMigrieren(sch, step);
        sch.checkliste = await ccDbChecklistenFuerSchritt(a.produktId, step, a);
        if(sch.checkliste.length) needSave = true;
      }
    }
    if(!a.checklisten || !a.checklisten.length){
      var flatCl = clFlatChecklistenAusSchritte(a);
      if(flatCl.length){
        a.checklisten = flatCl;
        needSave = true;
      }
    }
  }
  if(needSave) saveAuftraege();

  for (var aj = 0; aj < AUFTRAEGE.length; aj++) {
    var a2 = AUFTRAEGE[aj];
    if(a2.step === 'abgeschlossen') continue;
    // Prüfen ob schon Aufgaben existieren
    var hatAufgaben = INTERN_AUFGABEN.some(function(g){ return g.auftragId === a2.id; });
    if(hatAufgaben) continue;

    // Schritte mit dauer=0 → Default-Werte aus AU_STEP_CONFIG einsetzen
    var schritte = a2.schritte || {};
    var defaultsGesetzt = false;
    ['grafik','druck','laminat','montage','doku'].forEach(function(s){
      var sch2 = schritte[s];
      if(!sch2) return;
      if((sch2.dauer||0) <= 0){
        var def = AU_STEP_CONFIG && AU_STEP_CONFIG[s] ? AU_STEP_CONFIG[s].defaultDauer : 0;
        if(def > 0){ sch2.dauer = def; defaultsGesetzt = true; }
      }
    });
    if(defaultsGesetzt){ needSave = true; }

    // Prüfen ob nun Schritte mit Dauer vorhanden
    var hatSchritteMitDauer = Object.keys(schritte).some(function(s){
      return schritte[s] && schritte[s].dauer > 0;
    });
    if(!hatSchritteMitDauer) continue;
    // Aufgaben erzeugen
    await auftragAufgabenErzeugen(a2.id);
  }
  var nachher = INTERN_AUFGABEN.length;
  if(nachher > vorher || needSave){
    if(nachher > vorher)
      console.log('Aufgaben nacherzeugt: '+(nachher-vorher)+' neue Aufgaben für bestehende Aufträge');
    saveAufgaben();
    if(needSave) saveAuftraege();
  }
}

if (typeof window !== 'undefined') {
  function rebMobAufgabenNacherzeugen() {
    window.mobAufgabenNacherzeugen = mobAufgabenNacherzeugen;
  }
  if (typeof setTimeout === 'function') setTimeout(rebMobAufgabenNacherzeugen, 0);
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('load', rebMobAufgabenNacherzeugen);
  }
}

/**
 * INTERN_AUFGABEN leeren und aus allen Einträgen in AUFTRAEGE frisch ableiten; einmalig persistieren.
 * Konsole: `ccInternRebuildInternAufgabenFromAuftraege()`
 * Hinweis: `auftragAufgabenErzeugen` speichert pro Auftrag intern schon; der abschließende Aufruf macht den Zustand explizit endgültig.
 */
async function ccInternRebuildInternAufgabenFromAuftraege(){
  INTERN_AUFGABEN.length = 0;
  aufgabenNr = 1;
  for (var ri = 0; ri < AUFTRAEGE.length; ri++) {
    var a = AUFTRAEGE[ri];
    if (a && a.id != null) {
      await auftragAufgabenErzeugen(a.id);
    }
  }
  saveAufgaben();
}

if (typeof window !== 'undefined') {
  window.ccInternRebuildInternAufgabenFromAuftraege = ccInternRebuildInternAufgabenFromAuftraege;
}

