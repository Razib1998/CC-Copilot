// ════════════════════════════════════════════════════════════════════
// CC INTERN — Mitarbeiter
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/mitarbeiter-view.js
// Enthält:  renderMitarbeiter, maOpenDetail, Zeiterfassung, Kapazität
//
// TODO [Cockpit]: renderMitarbeiter() → API GET /employees
// TODO [Cockpit]: maSaveSettings() → API PATCH /employees/:id
// TODO [Cockpit]: Zeiterfassung → API POST /time-entries
// ════════════════════════════════════════════════════════════════════

function maIdVonName(vorname){
  if(!vorname) return null;
  var v = vorname.trim().toLowerCase();
  var treffer = MA_DATA.find(function(m){
    return m.n.split(' ')[0].toLowerCase() === v || m.n.toLowerCase() === v;
  });
  return treffer ? treffer.maId : null;
}

function maByID(maId){
  return MA_DATA.find(function(m){ return m.maId === maId; }) || null;
}

function calcMaStunden(maId, nFallback){
  // 1. maId-Vergleich (eindeutig, zukunftssicher)
  // 2. Namens-Fallback für ältere Buchungseinträge ohne maId
  var minuten = 0;
  AUFTRAEGE.forEach(function(a){
    (a.zeiten||[]).forEach(function(z){
      var treffer = false;
      if(z.maId){
        treffer = (z.maId === maId);
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

function calcMaAufgaben(maId, nFallback){
  // Zählt aktive Aufträge (nicht abgeschlossen) wo dieser MA
  // in irgendeinem noch offenen Schritt zuständig ist.
  // Matching: maId-Auflösung aus schritte[step].wer (Name-String)
  var count = 0;
  var vorname = nFallback.split(' ')[0].toLowerCase();
  AUFTRAEGE.forEach(function(a){
    if(a.step === 'abgeschlossen') return;
    // Prüfe alle Schritte: ist MA im aktuellen Schritt oder in noch offenen?
    var zustaendig = false;
    Object.keys(a.schritte||{}).forEach(function(step){
      if(step === 'abgeschlossen') return;
      var sch = a.schritte[step];
      if(!sch || sch.fertig) return;
      var wer = (sch.wer||'').toLowerCase();
      // Mehrere Monteure ("Okan + Mete") splitten
      var wer_parts = wer.split('+').map(function(s){ return s.trim(); });
      wer_parts.forEach(function(w){
        // maId-Auflösung: Vorname aus wer-String → maId prüfen
        var resolved = maIdVonName(w);
        if(resolved && resolved === maId) zustaendig = true;
        // Namens-Fallback
        else if(!resolved && w.includes(vorname)) zustaendig = true;
      });
    });
    if(zustaendig) count++;
  });
  return count;
}

function maTagesStunden(maId, datum){
  return INTERN_AUFGABEN
    .filter(function(g){ return g.maId===maId && g.datum===datum && g.status!=='erledigt'; })
    .reduce(function(s,g){ return s+(g.dauer||0); }, 0);
}

function maKapFarbe(istH, kapH){
  if(istH <= 0)            return 'var(--border)';
  if(istH >= kapH)         return 'var(--red)';
  if(istH >= kapH * 0.75)  return 'var(--amber)';
  return 'var(--green)';
}

function maKapPruefen(schritte, datum){
  var warnungen = [];
  var tagesMap = {}; // maId+datum → summe
  Object.keys(schritte).forEach(function(step){
    var sch = schritte[step];
    if(!sch || !sch.maId || !sch.dauer || sch.dauer<=0) return;
    var key = sch.maId + '|' + datum;
    tagesMap[key] = (tagesMap[key]||0) + sch.dauer;
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

function maAufgaben(maId){
  return INTERN_AUFGABEN.filter(function(g){
    if(g.status === 'erledigt') return false;
    // Direkte Zuweisung
    if(g.maId === maId) return true;
    // Multi-Zuweisung: MA ist in maIds[]
    if(g.maIds && g.maIds.indexOf(maId) >= 0) return true;
    return false;
  });
}

function maAufgabenHeute(maId){
  var heute = new Date().toISOString().split('T')[0];
  return maAufgaben(maId).filter(function(g){ return g.datum === heute; });
}

function maDauerGesamt(maId){
  return maAufgaben(maId).reduce(function(s,g){ return s + (g.dauer||0); }, 0);
}

function wocheStart(isoDate){
  var d = new Date(isoDate || new Date());
  var day = d.getDay(); // 0=So
  var diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function isoDate(d){
  return d.toISOString().split('T')[0];
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

function renderMitarbeiter(){
  var grid = document.getElementById('maGrid'); if(!grid) return;
  var cnt = document.getElementById('maGridCount');
  if(cnt) cnt.textContent = MA_DATA.length + ' Mitarbeiter';
  var heute = new Date().toISOString().split('T')[0];

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
          +'<input type="number" data-maid="'+m.maId+'" data-field="urlaub" value="'+m.urlaub+'" min="0" max="365"'
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
    '<div style="background:#fff;border-radius:14px;width:730px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.22);">'
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
          +'<input type="text" data-tmpid="'+tmpId+'" data-field="maId" placeholder="Kürzel * (z.B. AB)" maxlength="3"'
            +' style="'+iStyle+'font-size:10px;width:105px;text-transform:uppercase;"'
            +' onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.value=this.value.toUpperCase();this.style.borderColor=\'var(--border)\'">'
        +'</div>'
      +'</div>'
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

function maSaveSettings(){
  var changed = 0; var added = 0; var removed = 0; var errors = [];

  // 1. Bestehende aktualisieren (nur nicht zum Löschen markierte)
  document.querySelectorAll('#ma-settings-tbody tr[data-maid-row]').forEach(function(row){
    var maId = row.dataset.maidRow;
    var delBtn = row.querySelector('button[data-del]');
    if(delBtn && delBtn.dataset.del === '1'){
      // Löschen
      var idx = MA_DATA.findIndex(function(x){ return x.maId === maId; });
      if(idx >= 0){ MA_DATA.splice(idx, 1); removed++; }
      return;
    }
    var m = MA_DATA.find(function(x){ return x.maId === maId; });
    if(!m) return;
    row.querySelectorAll('[data-maid]').forEach(function(inp){
      var field = inp.dataset.field;
      var val = inp.value.trim();
      if(field === 'soll' || field === 'urlaub'){
        var num = parseInt(val, 10);
        if(!isNaN(num) && num >= 0 && m[field] !== num){ m[field] = num; changed++; }
      } else if(val && m[field] !== val){
        m[field] = val; changed++;
      }
    });
  });

  // 2. Neue Mitarbeiter hinzufügen
  document.querySelectorAll('#ma-settings-tbody tr[data-isnew="1"]').forEach(function(row){
    var entry = { col:'#1565C0', soll:160, urlaub:28, r:'' };
    row.querySelectorAll('[data-tmpid]').forEach(function(inp){
      var field = inp.dataset.field;
      var val = inp.value.trim();
      if(field === 'soll' || field === 'urlaub'){
        var num = parseInt(val, 10);
        if(!isNaN(num)) entry[field] = num;
      } else {
        entry[field] = field === 'maId' ? val.toUpperCase() : val;
      }
    });
    if(!entry.n)    { errors.push('Vorname fehlt bei neuem Mitarbeiter'); return; }
    if(!entry.maId) { errors.push('Kürzel fehlt für: '+entry.n); return; }
    if(MA_DATA.find(function(x){ return x.maId === entry.maId; })){
      errors.push('Kürzel "'+entry.maId+'" existiert bereits'); return;
    }
    entry.av = entry.maId;
    MA_DATA.push(entry);
    added++;
  });

  if(errors.length){ showToast('⚠ '+errors[0]); return; }

  saveMitarbeiter();
  renderMitarbeiter();
  maCloseSettings();
  var msg = [];
  if(changed) msg.push(changed+' geändert');
  if(added)   msg.push(added+' hinzugefügt');
  if(removed) msg.push(removed+' entfernt');
  showToast(msg.length ? '✓ '+msg.join(' · ') : 'Keine Änderungen');
}

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

function maWocheHtml(m){
  var mo = MA_DETAIL_WOCHE || wocheStart(new Date());
  var tagNamen = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  var heute = new Date().toISOString().split('T')[0];

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

function maAnwesenheitHtml(m){
  var heute  = new Date().toISOString().split('T')[0];
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

function getKW(date){
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-yearStart)/86400000)+1)/7);
}

function formatDatumDE(d){
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
}

function formatMinuten(min){
  var h=Math.floor(min/60), m=min%60;
  return h>0 ? h+'h '+String(m).padStart(2,'0')+'m' : m+'m';
}

