// ════════════════════════════════════════════════════════════════════
// CC INTERN — Kunden / CRM
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/kunden-view.js
// Enthält:  renderKunden, openKundenDetail, CRM-Pipeline, Aktivitäten
//
// TODO [Cockpit]: renderKunden() → API GET /customers
// TODO [Cockpit]: saveKunde() → API POST/PUT /customers
// ════════════════════════════════════════════════════════════════════

function kundenTab(el, filter){
  kundenFilter = filter;
  document.querySelectorAll('#kunden-tabs .tab').forEach(function(t){ t.classList.remove('active'); });
  if(el) el.classList.add('active');
  renderKunden();
}

function renderKunden(){
  var grid = document.getElementById('kunden-grid'); if(!grid) return;
  var q = (document.getElementById('kunden-suche')?.value||'').toLowerCase();
  var alle = Object.values(CRM_KUNDEN);
  var statsEl = document.getElementById('kunden-stats');
  if(statsEl) statsEl.innerHTML =
    '<div class="sc" style="border-top-color:var(--blue)"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div><div class="sc-n" style="color:var(--blue)">'+alle.length+'</div><div class="sc-l">Kunden gesamt</div></div></div>'
   +'<div class="sc" style="border-top-color:var(--green)"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" style="color:var(--green)">'+alle.filter(function(k){return k.status==='Aktiv';}).length+'</div><div class="sc-l">Aktiv</div></div></div>'
   +'<div class="sc" style="border-top-color:var(--amber)"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></div><div><div class="sc-n" style="color:var(--amber)">'+alle.filter(function(k){return k.status==='Angebot';}).length+'</div><div class="sc-l">Angebot</div></div></div>'
   +'<div class="sc" style="border-top-color:#7C3AED"><div class="sc-ico" style="background:#F3E8FF"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div><div class="sc-n" style="color:#7C3AED">'+alle.filter(function(k){return k.status==='Geplant';}).length+'</div><div class="sc-l">Geplant</div></div></div>';

  var entries = Object.entries(CRM_KUNDEN).filter(function(e){
    var k=e[1];
    if(kundenFilter!=='alle'&&k.status!==kundenFilter) return false;
    if(q&&!((k.name||'').toLowerCase().includes(q)||(k.stadt||'').toLowerCase().includes(q)||(k.ap||'').toLowerCase().includes(q))) return false;
    return true;
  });
  if(!entries.length){ grid.innerHTML='<div style="padding:24px;color:var(--text3);">Keine Kunden gefunden</div>'; return; }

  var sCol={Aktiv:'var(--green)',Angebot:'var(--amber)',Geplant:'#7C3AED',Neukontakt:'var(--gray)',Neu:'var(--blue)',Inaktiv:'var(--gray)'};
  var sBg ={Aktiv:'var(--green-l)',Angebot:'var(--amber-l)',Geplant:'#F3E8FF',Neukontakt:'var(--gray-l)',Neu:'var(--blue-l)',Inaktiv:'var(--gray-l)'};

  grid.innerHTML = entries.map(function(e){
    var key=e[0]; var k=e[1];
    var col=sCol[k.status]||'var(--gray)';
    var bg =sBg[k.status]||'var(--gray-l)';
    var auftrGes=AUFTRAEGE.filter(function(a){return (a.kunde||'').toLowerCase().includes((k.name.split(' ')[0]||'').toLowerCase());}).length;
    return '<div onclick="openKundenDetail(\''+key+'\')" style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px 18px 14px;cursor:pointer;transition:box-shadow .15s;" onmouseover="this.style.boxShadow=\'0 4px 18px rgba(0,0,0,.10)\'" onmouseout="this.style.boxShadow=\'\';">'
      +'<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;">'
        +'<div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.25;max-width:185px;">'+k.name+'</div>'
        +'<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:'+bg+';color:'+col+';flex-shrink:0;margin-left:8px;margin-top:2px;">'+k.status+'</span>'
      +'</div>'
      +'<div style="font-size:11.5px;color:var(--text2);margin-bottom:7px;display:flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>'+k.adresse+', '+k.plz+' '+k.stadt+'</div>'
      +'<div style="font-size:11.5px;color:var(--text2);margin-bottom:5px;display:flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'+k.ap+'</div>'
      +'<div style="font-size:11.5px;color:var(--text2);margin-bottom:5px;display:flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.62-.62a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>'+k.tel+'</div>'
      +'<div style="font-size:11.5px;color:var(--blue);margin-bottom:14px;display:flex;align-items:center;gap:5px;overflow:hidden;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+k.mail+'</span></div>'
      // Letzte Aktivität
      +((k.aktivitaeten||[]).length?(function(){
          var la=k.aktivitaeten[0];
          var tc=(typeof AKTIV_TYP_COL!=='undefined'&&AKTIV_TYP_COL[la.typ])||{ico:'📌',col:'var(--blue)',bg:'var(--blue-l)'};
          var df=(la.datum||'').split('-').reverse().join('.');
          return '<div style="font-size:11px;padding:4px 8px;background:'+tc.bg+';border-radius:6px;margin-bottom:8px;color:'+tc.col+';display:flex;align-items:center;gap:5px;">'
            +tc.ico+' <strong>'+la.typ+'</strong><span style="color:var(--text3);margin-left:4px;">'+df+(la.notiz?' · '+la.notiz.substring(0,25)+(la.notiz.length>25?'…':''):'')+'</span></div>';
        })():'')
      +'<div style="border-top:1px solid var(--border);margin:0 -18px 12px;"></div>'
      +'<div style="display:flex;align-items:center;">'
        +'<div style="flex:1;"><div style="font-size:20px;font-weight:800;color:var(--text);line-height:1;">'+auftrGes+'</div><div style="font-size:10px;color:var(--text3);margin-top:1px;">Aufträge</div></div>'
        +'<div style="flex:1;"><div style="font-size:13px;font-weight:700;color:var(--green);line-height:1;">'+k.umsatz+'</div><div style="font-size:10px;color:var(--text3);margin-top:1px;">Umsatz</div></div>'
        +'<button onclick="event.stopPropagation();kundenNeuerAuftrag(\''+key+'\')" style="padding:7px 14px;background:var(--blue);color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">+ Auftrag</button>'
      +'</div>'
      +'</div>';
  }).join('');
}

function openKundenDetail(key){
  var k=CRM_KUNDEN[key]; if(!k) return;
  var sCol={Aktiv:'var(--green)',Angebot:'var(--amber)',Geplant:'#7C3AED',Neukontakt:'var(--gray)',Neu:'var(--blue)',Inaktiv:'var(--gray)'};
  var sBg ={Aktiv:'var(--green-l)',Angebot:'var(--amber-l)',Geplant:'#F3E8FF',Neukontakt:'var(--gray-l)',Neu:'var(--blue-l)',Inaktiv:'var(--gray-l)'};
  var col=sCol[k.status]||'var(--gray)';
  var auftraege=AUFTRAEGE.filter(function(a){return (a.kunde||'').toLowerCase().includes((k.name.split(' ')[0]||'').toLowerCase());});
  var aktiv=auftraege.filter(function(a){return a.step!=='abgeschlossen';});
  var keys=Object.keys(CRM_KUNDEN);
  var knr='K-'+String(keys.indexOf(key)+1).padStart(4,'0');

  function sh(lbl){
    return '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.09em;padding:14px 20px 4px;">'+lbl+'</div>';
  }
  function row(lbl,val,vs){
    return '<div class="dp-row" style="padding:9px 20px;"><span class="dp-lbl">'+lbl+'</span><span class="dp-val" style="'+(vs||'')+'">'+( val||'—')+'</span></div>';
  }

  document.getElementById('dpTitle').textContent=k.name;
  document.getElementById('dpBody').innerHTML=
    sh('Firmendaten')
    +row('Firmenname','<strong>'+k.name+'</strong>')
    +row('Kundennummer',knr,'color:var(--text2);')
    +row('Branche',k.branche)
    +sh('Adresse')
    +row('Straße',k.adresse)
    +row('PLZ / Stadt',k.plz+' '+k.stadt)
    +sh('Kontakt Firma')
    +row('Telefon',k.tel)
    +row('E-Mail','<span style="color:var(--amber);">'+k.mail+'</span>')
    +sh('Hauptansprechpartner')
    +row('Name','<strong>'+k.ap+'</strong>')
    +row('Position','<strong>'+(k.apFunktion||'—')+'</strong>')
    +row('E-Mail direkt','<span style="color:var(--amber);">'+k.mail+'</span>')
    +row('Mobil / Telefon',k.tel)
    +sh('Zahlen & Zuständigkeit')
    +row('Aktive Aufträge','<strong style="color:var(--amber);">'+aktiv.length+'</strong>')
    +row('Jahresumsatz','<strong style="color:var(--green);">'+k.umsatz+'</strong>')
    +row('Zuständig (CC)','Celal (Geschäftsführung)')
    +sh('Interne Notiz')
    +'<div style="padding:8px 20px 14px;font-size:12px;color:var(--text2);line-height:1.6;">'+(k.notiz||'Keine Notiz')+'</div>'
    +(auftraege.length?
      sh('Aufträge ('+auftraege.length+')')
      +auftraege.slice(0,5).map(function(a){
        var sl=STEP_LABELS[a.step]||STEP_LABELS['grafik'];
        var tStr=(a.terminDatum||a.liefertermin||'').substring(0,10).split('-').reverse().join('.')||'—';
        return '<div class="dp-row" style="padding:8px 20px;cursor:pointer;" onclick="ccZuAuftragNavigieren(\''+a.id+'\')">'
          +'<span style="font-size:12px;color:var(--blue);font-weight:600;">'+a.id+'</span>'
          +'<span style="display:flex;align-items:center;gap:6px;">'
            +'<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:'+sl.col+'18;color:'+sl.col+';font-weight:700;">'+sl.title+'</span>'
            +'<span style="font-size:11px;color:var(--text3);">'+tStr+'</span>'
          +'</span></div>';
      }).join('')
      +(auftraege.length>5?'<div style="padding:4px 20px;font-size:11px;color:var(--text3);">+'+( auftraege.length-5)+' weitere</div>':'')
    :'')

    // Aktivitäten
    +sh('Aktivitäten ('+(k.aktivitaeten||[]).length+')')
    +'<div style="padding:0 20px 4px;">'
    +((k.aktivitaeten||[]).length===0
      ?'<div style="font-size:12px;color:var(--text3);padding:8px 0;">Noch keine Aktivitäten</div>'
      :(k.aktivitaeten||[]).slice(0,5).map(function(a){
          return aktivKarteHTML(Object.assign({}, a, {kundeKey: key}), false);
        }).join('')
    )+'</div>';

  document.getElementById('dpFooter').innerHTML=
    '<button class="btn" onclick="bearbeiteKunde(\''+key+'\')">✏ Bearbeiten</button>'
    +'<button class="btn p" onclick="openAktivModal(\''+key+'\')">+ Aktivität</button>'
    +'<button class="btn" onclick="closeDetail();kundenNeuerAuftrag(\''+key+'\')">+ Auftrag</button>'
    +'<button onclick="exportKundePDF(\''+key+'\')" style="padding:7px 16px;background:var(--amber);color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;margin-left:auto;">PDF Export →</button>';

  document.getElementById('detailOverlay').classList.add('open');
}

function kundenNeuerAuftrag(key){
  var k=CRM_KUNDEN[key]; if(!k) return;
  openAuftragModal();
  setTimeout(function(){
    var sel=document.getElementById('au-kunde');
    if(sel) sel.value=k.name;
    auUpdateSub();
    showToast('Kunde vorausgefüllt: '+k.name);
  },80);
}

function toggleWeitererAP(){
  var block = document.getElementById('kd-ap2-block');
  if(!block) return;
  // Button direkt im fsect-Div davor finden
  var fsect = block.previousElementSibling;
  var btn   = fsect ? fsect.querySelector('button') : null;
  if(block.style.display==='none'||block.style.display===''){
    block.style.display='block';
    if(btn) btn.textContent='− ausblenden';
  } else {
    block.style.display='none';
    if(btn) btn.textContent='+ hinzufügen';
    ['kd-ap2-vorname','kd-ap2-nachname','kd-ap2-funktion','kd-ap2-abteilung','kd-ap2-mail','kd-ap2-tel']
      .forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  }
}

function openKundeModalNeukontakt(){
  openKundeModal();
  setTimeout(function(){
    var s=document.getElementById('kd-status');
    if(s){ Array.from(s.options).forEach(function(o,i){ if(o.text==='Neukontakt'||o.value==='Neukontakt') s.selectedIndex=i; }); }
  }, 60);
}

function renderCrmPipeline(){
  var container=document.getElementById('crm-pipeline-grid'); if(!container) return;
  var COLS=[
    {key:'Neukontakt', label:'Neukontakt',       col:'var(--gray)',  bg:'var(--gray-l)'},
    {key:'Angebot',    label:'Angebot versendet', col:'var(--amber)', bg:'var(--amber-l)'},
    {key:'Verhandlung',label:'Verhandlung',        col:'var(--blue)',  bg:'var(--blue-l)'},
    {key:'Aktiv',      label:'Gewonnen \u2713',    col:'var(--green)', bg:'var(--green-l)'},
  ];
  container.innerHTML=COLS.map(function(col){
    var kunden=Object.entries(CRM_KUNDEN).filter(function(e){ return e[1].status===col.key; });
    var cards=kunden.map(function(e){
      var k=e[1];
      var eid=e[0];
      // Letzte Aktivität oder Nächste Aktion ermitteln
      var aks=k.aktivitaeten||[];
      var infoLine='';
      if(aks.length){
        var a=aks[0];
        if(a.wv){
          var wvFmt=a.wv.split('-').reverse().join('.');
          infoLine='<div class="kb-cs" style="margin-top:4px;color:var(--amber);">📅 WV '+wvFmt+(a.wvAufgabe?' · '+a.wvAufgabe:'')+'</div>';
        } else {
          var datFmt=(a.datum||'').split('-').reverse().join('.');
          infoLine='<div class="kb-cs" style="margin-top:4px;color:'+col.col+';">'+(a.ico||'')+'  '+a.typ+' · '+datFmt+'</div>';
        }
      } else if(k.naechsteAktion){
        infoLine='<div class="kb-cs" style="margin-top:4px;color:'+col.col+';">→ '+k.naechsteAktion+'</div>';
      }
      return '<div class="kb-card" style="border-color:'+col.col+';cursor:pointer;" onclick="openCrmDetail(\''+eid+'\')">'
        +'<div class="kb-cn">'+k.name+'</div>'
        +'<div class="kb-cs">👤 '+k.ap+'</div>'
        +'<div class="kb-cs">📞 '+k.tel+'</div>'
        +'<div class="kb-cs" style="color:var(--blue);">✉ '+k.mail+'</div>'
        +infoLine
        +'</div>';
    }).join('');
    return '<div style="background:'+col.bg+';border-radius:10px;padding:12px;">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
        +'<span style="font-size:12px;font-weight:700;color:'+col.col+';">'+col.label+'</span>'
        +'<span class="bdg" style="background:'+col.col+'22;color:'+col.col+';">'+kunden.length+'</span>'
      +'</div>'
      +'<div style="display:flex;flex-direction:column;gap:8px;">'
        +cards
        +(col.key==='Neukontakt'
          ?'<button class="btn p" style="width:100%;font-size:11px;background:var(--blue);border-color:var(--blue);" onclick="openKundeModalNeukontakt()">+ Kontakt anlegen</button>'
          :'')
      +'</div>'
    +'</div>';
  }).join('');
}

function openKundeModal(){
  // AP2-Block ausblenden + leeren
  var ap2=document.getElementById('kd-ap2-block'); if(ap2) ap2.style.display='none';
  ['kd-ap2-vorname','kd-ap2-nachname','kd-ap2-funktion','kd-ap2-abteilung','kd-ap2-mail','kd-ap2-tel']
    .forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  // Alle Felder leeren
  ['kd-name','kd-ustid','kd-adresse','kd-plz','kd-stadt','kd-land',
   'kd-tel','kd-fax','kd-mail','kd-website',
   'kd-vorname','kd-nachname','kd-apfunktion','kd-abteilung','kd-apmail','kd-aptel',
   'kd-notiz'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  // Land Default
  var land=document.getElementById('kd-land'); if(land) land.value='Deutschland';
  // Selects reset
  ['kd-status','kd-anrede','kd-bundesland','kd-zustaendig'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.selectedIndex=0;
  });
  var brEl=document.getElementById('kd-branche'); if(brEl) brEl.value='';
  var zz=document.getElementById('kd-zahlungsziel'); if(zz) zz.selectedIndex=1; // 30 Tage
  var cb=document.getElementById('kd-re-gleich'); if(cb) cb.checked=true;
  // Kundennummer auto-generieren
  var nextNr = Object.keys(CRM_KUNDEN).length + 1;
  var knrEl=document.getElementById('kd-knr'); if(knrEl) knrEl.value='K-'+String(nextNr).padStart(4,'0');
  document.getElementById('kundeModal').classList.add('open');
}

function closeKundeModal(){ document.getElementById('kundeModal').classList.remove('open'); }

function saveKunde(){
  var name=(document.getElementById('kd-name')?.value||'').trim();
  if(!name){ showToast('⚠ Bitte Firmennamen eingeben'); return; }
  var vorname=(document.getElementById('kd-vorname')?.value||'').trim();
  var nachname=(document.getElementById('kd-nachname')?.value||'').trim();
  var anrede=(document.getElementById('kd-anrede')?.value||'Herr');
  var apName = (anrede+' '+vorname+' '+nachname).trim().replace(/\s+/g,' ');
  // Beim Bearbeiten: bestehenden Key nutzen, sonst neu
  var editKey = document.getElementById('kundeModal').dataset.editKey;
  var key = editKey || name.replace(/\s+/g,'').replace(/[^a-zA-Z0-9]/g,'').substring(0,14)||('K'+Date.now());
  if(!editKey && CRM_KUNDEN[key]) key=key+'_'+String(Date.now()).slice(-4);
  CRM_KUNDEN[key]={
    name:     name,
    ap:       apName||'—',
    apFunktion: document.getElementById('kd-apfunktion')?.value||'—',
    abteilung:  document.getElementById('kd-abteilung')?.value||'',
    tel:      document.getElementById('kd-tel')?.value||'—',
    fax:      document.getElementById('kd-fax')?.value||'',
    mail:     document.getElementById('kd-mail')?.value||'—',
    apmail:   document.getElementById('kd-apmail')?.value||'',
    aptel:    document.getElementById('kd-aptel')?.value||'',
    website:  document.getElementById('kd-website')?.value||'',
    adresse:  document.getElementById('kd-adresse')?.value||'—',
    plz:      document.getElementById('kd-plz')?.value||'',
    stadt:    document.getElementById('kd-stadt')?.value||'—',
    bundesland: document.getElementById('kd-bundesland')?.value||'Nordrhein-Westfalen',
    land:     document.getElementById('kd-land')?.value||'Deutschland',
    branche:  document.getElementById('kd-branche')?.value||'Sonstiges',
    ustid:    document.getElementById('kd-ustid')?.value||'',
    umsatz:   (editKey && CRM_KUNDEN[editKey]?.umsatz)||'—',
    auftragsvolumen: 0, fahrzeuge: 0,
    status:   document.getElementById('kd-status')?.value||'Geplant',
    zustaendig: document.getElementById('kd-zustaendig')?.value||'',
    zahlungsziel: document.getElementById('kd-zahlungsziel')?.value||'30 Tage',
    letzterKontakt: editKey ? (CRM_KUNDEN[editKey]?.letzterKontakt||'Heute') : 'Heute',
    naechsteAktion: 'Erstkontakt',
    notiz:    document.getElementById('kd-notiz')?.value||'',
    // Zweiter Ansprechpartner (nur wenn Block sichtbar)
    ap2name:      (document.getElementById('kd-ap2-block')?.style.display!=='none'&&(document.getElementById('kd-ap2-vorname')?.value||document.getElementById('kd-ap2-nachname')?.value)) ? ((document.getElementById('kd-ap2-anrede')?.value||'')+' '+(document.getElementById('kd-ap2-vorname')?.value||'')+' '+(document.getElementById('kd-ap2-nachname')?.value||'')).trim() : '',
    ap2vorname:   document.getElementById('kd-ap2-vorname')?.value||'',
    ap2nachname:  document.getElementById('kd-ap2-nachname')?.value||'',
    ap2funktion:  document.getElementById('kd-ap2-funktion')?.value||'',
    ap2abteilung: document.getElementById('kd-ap2-abteilung')?.value||'',
    ap2mail:      document.getElementById('kd-ap2-mail')?.value||'',
    ap2tel:       document.getElementById('kd-ap2-tel')?.value||'',
  };
  document.getElementById('kundeModal').dataset.editKey='';
  closeKundeModal();
  renderKunden();
  renderCrmPipeline();  // Pipeline sofort aktualisieren
  // CRM-Kunden-Tab ebenfalls aktualisieren falls offen
  if(currentPage==='crm') renderCrmPipeline();
  showToast(editKey ? '✓ Kunde gespeichert: '+name : '✓ Neuer Kontakt angelegt: '+name);
}

function bearbeiteKunde(key){
  var k=CRM_KUNDEN[key]; if(!k) return;
  closeDetail();
  openKundeModal();
  // editKey merken damit saveKunde den richtigen Eintrag überschreibt
  document.getElementById('kundeModal').dataset.editKey=key;
  // Felder befüllen
  setTimeout(function(){
    var set=function(id,val){ var el=document.getElementById(id); if(el) el.value=val||''; };
    set('kd-name',     k.name);
    set('kd-ustid',    k.ustid);
    set('kd-adresse',  k.adresse);
    set('kd-plz',      k.plz);
    set('kd-stadt',    k.stadt);
    set('kd-land',     k.land||'Deutschland');
    set('kd-tel',      k.tel);
    set('kd-fax',      k.fax);
    set('kd-mail',     k.mail);
    set('kd-website',  k.website);
    set('kd-apfunktion',k.apFunktion);
    set('kd-abteilung', k.abteilung);
    set('kd-apmail',   k.apmail||k.mail);
    set('kd-aptel',    k.aptel||k.tel);
    set('kd-notiz',    k.notiz);
    // Ansprechpartner splitten: "Hr. Max Müller" → Anrede / Vorname / Nachname
    var apParts=(k.ap||'').split(' ');
    var anredeOpts=['Herr','Frau','Dr.','Prof.'];
    var anrede='Herr', vn='', nn='';
    if(anredeOpts.indexOf(apParts[0])>=0){ anrede=apParts[0]; vn=apParts[1]||''; nn=apParts.slice(2).join(' '); }
    else { vn=apParts[0]||''; nn=apParts.slice(1).join(' '); }
    set('kd-vorname', vn); set('kd-nachname', nn);
    // Selects
    var selSet=function(id,val){
      var el=document.getElementById(id); if(!el) return;
      Array.from(el.options).forEach(function(o,i){ if(o.value===val||o.text===val) el.selectedIndex=i; });
    };
    selSet('kd-anrede',      anrede);
    var brEl=document.getElementById('kd-branche'); if(brEl) brEl.value=k.branche||'';
    selSet('kd-status',      k.status);
    selSet('kd-bundesland',  k.bundesland);
    selSet('kd-zustaendig',  k.zustaendig);
    selSet('kd-zahlungsziel',k.zahlungsziel);
    // Zweiter AP — Block zeigen und befüllen wenn vorhanden
    var ap2block=document.getElementById('kd-ap2-block');
    var ap2btn=ap2block?ap2block.previousElementSibling?.querySelector('button'):null;
    if(k.ap2name){
      if(ap2block) ap2block.style.display='block';
      if(ap2btn)   ap2btn.textContent='− ausblenden';
      set('kd-ap2-vorname',   k.ap2vorname||'');
      set('kd-ap2-nachname',  k.ap2nachname||'');
      set('kd-ap2-funktion',  k.ap2funktion||'');
      set('kd-ap2-abteilung', k.ap2abteilung||'');
      set('kd-ap2-mail',      k.ap2mail||'');
      set('kd-ap2-tel',       k.ap2tel||'');
    } else {
      if(ap2block) ap2block.style.display='none';
      if(ap2btn)   ap2btn.textContent='+ hinzufügen';
    }
    // Kundennummer anzeigen
    var keys=Object.keys(CRM_KUNDEN);
    var knrEl=document.getElementById('kd-knr');
    if(knrEl) knrEl.value='K-'+String(keys.indexOf(key)+1).padStart(4,'0');
    // Weiterer Ansprechpartner befüllen wenn vorhanden
    if(k.ap2 && k.ap2.name){
      var ap2block=document.getElementById('kd-ap2-block');
      if(ap2block) ap2block.style.display='block';
      var ap2parts=(k.ap2.name||'').split(' ');
      var a2=(['Herr','Frau','Dr.','Prof.'].indexOf(ap2parts[0])>=0)?ap2parts[0]:'Herr';
      var vn2=(['Herr','Frau','Dr.','Prof.'].indexOf(ap2parts[0])>=0)?ap2parts[1]||'':ap2parts[0]||'';
      var nn2=(['Herr','Frau','Dr.','Prof.'].indexOf(ap2parts[0])>=0)?ap2parts.slice(2).join(' '):ap2parts.slice(1).join(' ');
      selSet('kd-ap2-anrede',a2);
      set('kd-ap2-vorname',vn2); set('kd-ap2-nachname',nn2);
      set('kd-ap2-funktion',k.ap2.funktion); set('kd-ap2-abteilung',k.ap2.abteilung);
      set('kd-ap2-mail',k.ap2.mail); set('kd-ap2-tel',k.ap2.tel);
    }
  }, 60);
}

function exportKundePDF(key){
  var k=CRM_KUNDEN[key]; if(!k) return;
  var auftraege=AUFTRAEGE.filter(function(a){
    return (a.kunde||'').toLowerCase().includes((k.name.split(' ')[0]||'').toLowerCase());
  });
  var keys=Object.keys(CRM_KUNDEN);
  var knr='K-'+String(keys.indexOf(key)+1).padStart(4,'0');
  var datum=new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});

  var html='<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<title>Kundendatenblatt '+k.name+'</title>'
    +'<style>'
    +'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;margin:0;padding:32px 40px;color:#0F1923;font-size:13px;}'
    +'h1{font-size:20px;font-weight:800;margin:0 0 4px;}  .sub{color:#546E7A;font-size:12px;margin-bottom:24px;}'
    +'.logo{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #E65100;}'
    +'.co{font-size:14px;font-weight:700;color:#E65100;} .knr{font-size:12px;color:#546E7A;} .dt{font-size:11px;color:#90A4AE;}'
    +'.section{margin-bottom:20px;} .sh{font-size:9px;font-weight:700;color:#E65100;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #E65100;}'
    +'.row{display:flex;padding:5px 0;border-bottom:1px solid #EEF2F7;} .lbl{width:180px;color:#546E7A;flex-shrink:0;} .val{font-weight:500;}'
    +'.auftr{padding:4px 0;border-bottom:1px solid #EEF2F7;display:flex;justify-content:space-between;font-size:12px;}'
    +'.footer{margin-top:32px;padding-top:12px;border-top:1px solid #DDE3E8;font-size:10px;color:#90A4AE;display:flex;justify-content:space-between;}'
    +'@media print{body{padding:16px 20px;}}'
    +'</style></head><body>'
    // Header
    +'<div class="logo">'
      +'<div><div class="co">CC Werbung GmbH</div><div class="knr">Kundendatenblatt</div></div>'
      +'<div style="text-align:right;"><h1>'+k.name+'</h1><div class="sub">'+knr+' · Stand: '+datum+'</div></div>'
    +'</div>'
    // Firmendaten
    +'<div class="section"><div class="sh">Firmendaten</div>'
      +'<div class="row"><span class="lbl">Firmenname</span><span class="val">'+k.name+'</span></div>'
      +'<div class="row"><span class="lbl">Kundennummer</span><span class="val">'+knr+'</span></div>'
      +'<div class="row"><span class="lbl">Branche</span><span class="val">'+(k.branche||'—')+'</span></div>'
      +(k.ustid?'<div class="row"><span class="lbl">USt-ID</span><span class="val">'+k.ustid+'</span></div>':'')
      +'<div class="row"><span class="lbl">Status</span><span class="val">'+k.status+'</span></div>'
    +'</div>'
    // Adresse
    +'<div class="section"><div class="sh">Adresse</div>'
      +'<div class="row"><span class="lbl">Straße</span><span class="val">'+k.adresse+'</span></div>'
      +'<div class="row"><span class="lbl">PLZ / Stadt</span><span class="val">'+k.plz+' '+k.stadt+'</span></div>'
      +'<div class="row"><span class="lbl">Bundesland / Land</span><span class="val">'+(k.bundesland||'')+(k.land?' / '+k.land:'')+'</span></div>'
    +'</div>'
    // Kontakt
    +'<div class="section"><div class="sh">Kontakt</div>'
      +'<div class="row"><span class="lbl">Telefon</span><span class="val">'+k.tel+'</span></div>'
      +(k.fax?'<div class="row"><span class="lbl">Fax</span><span class="val">'+k.fax+'</span></div>':'')
      +'<div class="row"><span class="lbl">E-Mail</span><span class="val">'+k.mail+'</span></div>'
      +(k.website?'<div class="row"><span class="lbl">Website</span><span class="val">'+k.website+'</span></div>':'')
    +'</div>'
    // Ansprechpartner
    +'<div class="section"><div class="sh">Hauptansprechpartner</div>'
      +'<div class="row"><span class="lbl">Name</span><span class="val">'+k.ap+'</span></div>'
      +'<div class="row"><span class="lbl">Position</span><span class="val">'+(k.apFunktion||'—')+'</span></div>'
      +(k.abteilung?'<div class="row"><span class="lbl">Abteilung</span><span class="val">'+k.abteilung+'</span></div>':'')
      +(k.apmail?'<div class="row"><span class="lbl">E-Mail direkt</span><span class="val">'+k.apmail+'</span></div>':'')
      +(k.aptel?'<div class="row"><span class="lbl">Mobil / Telefon</span><span class="val">'+k.aptel+'</span></div>':'')
    +'</div>'
    // Zahlen
    +'<div class="section"><div class="sh">Zahlen & Zuständigkeit</div>'
      +'<div class="row"><span class="lbl">Jahresumsatz</span><span class="val" style="color:#2E7D32;font-weight:700;">'+k.umsatz+'</span></div>'
      +'<div class="row"><span class="lbl">Zahlungsziel</span><span class="val">'+(k.zahlungsziel||'30 Tage')+'</span></div>'
      +'<div class="row"><span class="lbl">Zuständig (CC)</span><span class="val">'+(k.zustaendig||'Celal')+'</span></div>'
    +'</div>'
    // Aufträge
    +(auftraege.length?'<div class="section"><div class="sh">Aufträge ('+auftraege.length+')</div>'
      +auftraege.map(function(a){
        return '<div class="auftr"><span>'+a.id+' · '+a.fz+'</span><span>'+STEP_LABELS[a.step].title+'</span></div>';
      }).join('')+'</div>':'')
    // Notiz
    +(k.notiz?'<div class="section"><div class="sh">Interne Notiz</div><div style="padding:6px 0;line-height:1.5;color:#546E7A;">'+k.notiz+'</div></div>':'')
    // Footer
    +'<div class="footer"><span>CC Werbung GmbH · Mülheim · cc-werbung.de</span><span>Erstellt: '+datum+'</span></div>'
    +'<scr'+'ipt>window.onload=function(){window.print();}<'+'/script>'
    +'<'+'/body><'+'/html>';

  var w=window.open('','_blank','width=860,height=1100');
  w.document.write(html);
  w.document.close();
  showToast('📄 PDF wird geöffnet…');
}

function seedAktivitaeten(){
  var seed = {
    'Ruhrbahn': [
      {id:'A001',typ:'Anruf',ico:'📞',datum:'2026-03-21',zeit:'10:00',ma:'Muhammet',notiz:'Q3 Planung besprochen. Bergmann möchte Angebot bis Ende April.',wv:'',wvAufgabe:''},
      {id:'A002',typ:'E-Mail',ico:'✉',datum:'2026-03-15',zeit:'14:00',ma:'Elvan',notiz:'Jahresvertrag 2026 per Mail bestätigt.',wv:'',wvAufgabe:''},
    ],
    'DVG':      [{id:'A003',typ:'Anruf',ico:'📞',datum:'2026-03-15',zeit:'09:30',ma:'Zint',notiz:'Fr. Weber wegen Rechnung Q1 angemahnt.',wv:'2026-03-25',wvAufgabe:'Zahlungseingang prüfen'}],
    'Bogestra': [{id:'A004',typ:'Meeting',ico:'🤝',datum:'2026-03-10',zeit:'11:00',ma:'Celal',notiz:'Q2 Kampagne besprochen. Ganzgestaltung 3 Busse geplant.',wv:'2026-03-31',wvAufgabe:'Angebot Q2 senden'}],
    'NRZ':      [{id:'A005',typ:'Angebot',ico:'📋',datum:'2026-03-15',zeit:'14:30',ma:'Elvan',notiz:'Angebot AG-2026-019 per Mail versendet. Warten auf Rückmeldung.',wv:'2026-03-22',wvAufgabe:'Angebot telefonisch nachfassen'}],
    'Sparkasse':[{id:'A006',typ:'Meeting',ico:'🤝',datum:'2026-03-16',zeit:'10:00',ma:'Celal',notiz:'Jahresauftrag bestätigt. Fr. Schmidt sehr zufrieden.',wv:'',wvAufgabe:''}],
  };
  Object.keys(seed).forEach(function(key){
    if(CRM_KUNDEN[key] && !CRM_KUNDEN[key].aktivitaeten){
      CRM_KUNDEN[key].aktivitaeten = seed[key];
    }
  });
}

function toggleAktivWV(){
  var block = document.getElementById('aktiv-modal-wv-block');
  var btn   = document.getElementById('aktiv-modal-wv-btn');
  if(!block) return;
  var vis = block.style.display !== 'none' && block.style.display !== '';
  block.style.display = vis ? 'none' : 'block';
  if(btn) btn.textContent = vis ? '+ Wiedervorlage' : '− Wiedervorlage';
}

function renderWiedervorlage(){
  var tbody = document.getElementById('crm-wv-tbody');
  if(!tbody) return;

  var heute = new Date().toISOString().substring(0,10);
  var liste = [];
  Object.entries(CRM_KUNDEN).forEach(function(e){
    var key=e[0]; var k=e[1];
    (k.aktivitaeten||[]).forEach(function(a){
      if(a.wv){
        liste.push({
          datum:    a.wv,
          kunde:    k.name,
          kundeKey: key,
          aufgabe:  a.wvAufgabe||a.notiz||'Nachfassen',
          ma:       a.ma||'—',
          prio:     a.wv < heute ? 'Überfällig' : a.wv === heute ? 'Heute' : 'Offen',
          aktiv:    a,
        });
      }
    });
  });

  liste.sort(function(a,b){ return a.datum.localeCompare(b.datum); });

  if(!liste.length){
    tbody.innerHTML='<tr><td colspan="6" style="padding:16px;color:var(--text3);text-align:center;">Keine Wiedervorlagen</td></tr>';
    return;
  }

  var prioCol = {Überfällig:'var(--red)',Heute:'var(--amber)',Offen:'var(--blue)'};
  var prioBg  = {Überfällig:'var(--red-l)',Heute:'var(--amber-l)',Offen:'var(--blue-l)'};

  tbody.innerHTML = liste.map(function(w){
    var datFmt = w.datum.split('-').reverse().join('.');
    var col = prioCol[w.prio]||'var(--gray)';
    var bg  = prioBg[w.prio]||'var(--gray-l)';
    return '<tr onclick="openCrmDetail(\''+w.kundeKey+'\')" style="cursor:pointer;">'
      +'<td><span style="font-size:11px;font-weight:700;color:'+col+';">'+datFmt+'</span></td>'
      +'<td><div class="tm">'+w.kunde+'</div></td>'
      +'<td style="font-size:12px;">'+w.aufgabe+'</td>'
      +'<td style="font-size:12px;">'+w.ma+'</td>'
      +'<td><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+bg+';color:'+col+';">'+w.prio+'</span></td>'
      +'<td><button class="btn" style="font-size:11px;padding:3px 8px;" onclick="event.stopPropagation();openAktivModal(\''+w.kundeKey+'\')">+ Aktivität</button></td>'
      +'</tr>';
  }).join('');
}

function selAktivModalTyp(btn, ico, typ){
  _aktivModalTypVal = typ;
  _aktivModalTypIco = ico;
  var inp = document.getElementById('aktiv-modal-typ-val'); if(inp) inp.value=typ;
  var icoInp = document.getElementById('aktiv-modal-typ-ico'); if(icoInp) icoInp.value=ico;
  document.querySelectorAll('#aktiv-modal-typ-btns .aktiv-typ-btn').forEach(function(b){
    b.style.borderColor = 'var(--border)';
    b.style.background  = '#fff';
    b.style.color       = 'var(--text)';
    b.style.fontWeight  = '400';
  });
  btn.style.borderColor = 'var(--blue)';
  btn.style.background  = 'var(--blue-l)';
  btn.style.color       = 'var(--blue)';
  btn.style.fontWeight  = '700';
}

function openAktivModal(kundeKey){
  _aktivModalKunde = kundeKey||null;
  // Reset
  var f=document.getElementById('aktiv-modal-notiz');   if(f) f.value='';
  var d=document.getElementById('aktiv-modal-datum');   if(d) d.value=new Date().toISOString().substring(0,10);
  var z=document.getElementById('aktiv-modal-zeit');    if(z) z.value='10:00';
  var w=document.getElementById('aktiv-modal-wv-datum');if(w) w.value='';
  var wa=document.getElementById('aktiv-modal-wv-aufgabe'); if(wa) wa.value='';
  var ma=document.getElementById('aktiv-modal-ma');     if(ma) ma.selectedIndex=0;
  // Typ zurück auf Anruf
  selAktivModalTyp(document.querySelector('#aktiv-modal-typ-btns .aktiv-typ-btn'),'📞','Anruf');
  // Kunden-Dropdown befüllen
  var sel = document.getElementById('aktiv-modal-kunde');
  if(sel){
    sel.innerHTML='<option value="">— wählen —</option>'
      +Object.entries(CRM_KUNDEN).map(function(e){
        var sel2 = (kundeKey && e[0]===kundeKey) ? ' selected' : '';
        return '<option value="'+e[0]+'"'+sel2+'>'+e[1].name+'</option>';
      }).join('');
  }
  document.getElementById('aktivModal').classList.add('open');
}

function aktivKarteHTML(a, showKunde){
  var tc = AKTIV_TYP_COL[a.typ] || AKTIV_TYP_COL['Sonstiges'];
  var datumFmt = (a.datum||'').split('-').reverse().join('.') + (a.zeit ? ' · '+a.zeit : '');
  var wvStr = '';
  if(a.wv){
    var wvFmt = a.wv.split('-').reverse().join('.');
    wvStr = '<div style="font-size:10px;color:var(--blue);margin-top:4px;background:var(--blue-l);padding:2px 7px;border-radius:4px;display:inline-block;">📅 WV: '+wvFmt+(a.wvAufgabe?' · '+a.wvAufgabe:'')+'</div>';
  }
  var kundeName = (showKunde && a.kundeKey && CRM_KUNDEN[a.kundeKey]) ? CRM_KUNDEN[a.kundeKey].name : '';
  return '<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">'
    +'<div style="width:34px;height:34px;border-radius:8px;background:'+tc.bg+';display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">'+tc.ico+'</div>'
    +'<div style="flex:1;min-width:0;">'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">'
        +'<span style="font-size:12px;font-weight:700;color:'+tc.col+';">'+a.typ+'</span>'
        +(kundeName?'<span style="font-size:11px;color:var(--text3);">· '+kundeName+'</span>':'')
        +'<span style="font-size:10px;color:var(--text3);margin-left:auto;">'+datumFmt+'</span>'
      +'</div>'
      +(a.ma?'<div style="font-size:10px;color:var(--text3);margin-bottom:3px;">👤 '+a.ma+'</div>':'')
      +(a.notiz?'<div style="font-size:11px;color:var(--text2);line-height:1.5;">'+a.notiz+'</div>':'')
      +wvStr
    +'</div>'
    +'</div>';
}

function closeAktivModal(){
  document.getElementById('aktivModal').classList.remove('open');
}

function saveAktivitaet(){
  var kundeKey = document.getElementById('aktiv-modal-kunde')?.value;
  if(!kundeKey){ showToast('⚠ Bitte Kunden auswählen'); return; }
  var k = CRM_KUNDEN[kundeKey];
  if(!k){ showToast('⚠ Kunden nicht gefunden'); return; }
  var typ     = document.getElementById('aktiv-modal-typ-val')?.value||'Anruf';
  var ico     = document.getElementById('aktiv-modal-typ-ico')?.value||'📞';
  var datum   = document.getElementById('aktiv-modal-datum')?.value||new Date().toISOString().substring(0,10);
  var zeit    = document.getElementById('aktiv-modal-zeit')?.value||'10:00';
  var ma      = document.getElementById('aktiv-modal-ma')?.value||'Celal';
  var notiz   = document.getElementById('aktiv-modal-notiz')?.value||'';
  var wvDatum = document.getElementById('aktiv-modal-wv-datum')?.value||'';
  var wvAufg  = document.getElementById('aktiv-modal-wv-aufgabe')?.value||'';

  if(!k.aktivitaeten) k.aktivitaeten=[];
  var newAktiv = {
    id:        'A'+Date.now(),
    typ:       typ,
    ico:       ico,
    datum:     datum,
    zeit:      zeit,
    ma:        ma,
    notiz:     notiz,
    wv:        wvDatum,
    wvAufgabe: wvAufg,
  };
  k.aktivitaeten.unshift(newAktiv); // neueste zuerst

  // letzterKontakt + naechsteAktion aktualisieren
  k.letzterKontakt = datum.split('-').reverse().join('.');
  if(wvAufg) k.naechsteAktion = wvAufg;

  closeAktivModal();
  renderAktivitaeten();
  renderCrmPipeline();
  if(currentPage==='kunden') renderKunden();
  saveAuftraege && saveAuftraege(); // DAL persistieren
  showToast('✓ Aktivität gespeichert · '+k.name+' · '+typ);
}

function saveAktivitaetSchnell(){
  var kundeKey = document.getElementById('aktiv-schnell-kunde')?.value;
  if(!kundeKey){ showToast('⚠ Bitte Kunden auswählen'); return; }
  var k = CRM_KUNDEN[kundeKey]; if(!k) return;
  if(!k.aktivitaeten) k.aktivitaeten=[];
  var datum = document.getElementById('aktiv-schnell-datum')?.value||new Date().toISOString().substring(0,10);
  var zeit  = document.getElementById('aktiv-schnell-zeit')?.value||'10:00';
  var notiz = document.getElementById('aktiv-schnell-notiz')?.value||'';
  var wv    = document.getElementById('aktiv-schnell-wv')?.value||'';
  k.aktivitaeten.unshift({
    id:'A'+Date.now(), typ:selAktTypGewählt||'Anruf', ico:selAktTypGewählt||'📞',
    datum, zeit, ma:'Celal', notiz, wv, wvAufgabe:'',
  });
  k.letzterKontakt = datum.split('-').reverse().join('.');
  var notizEl=document.getElementById('aktiv-schnell-notiz'); if(notizEl) notizEl.value='';
  var wvEl=document.getElementById('aktiv-schnell-wv'); if(wvEl) wvEl.value='';
  renderAktivitaeten();
  renderCrmPipeline();
  showToast('✓ Aktivität gespeichert · '+k.name);
}

function renderAktivitaeten(){
  // Kunden-Dropdown der Schnellerfassung befüllen
  var sel=document.getElementById('aktiv-schnell-kunde');
  if(sel){
    sel.innerHTML='<option value="">— wählen —</option>'
      +Object.entries(CRM_KUNDEN).map(function(e){
        return '<option value="'+e[0]+'">'+e[1].name+'</option>';
      }).join('');
  }
  // Alle Aktivitäten aus CRM_KUNDEN aggregieren
  var alle=[];
  Object.entries(CRM_KUNDEN).forEach(function(e){
    (e[1].aktivitaeten||[]).forEach(function(a){
      alle.push({...a, kundeKey:e[0], kundeName:e[1].name});
    });
  });
  // Neueste zuerst
  alle.sort(function(a,b){ return (b.datum+b.zeit).localeCompare(a.datum+a.zeit); });

  var el=document.getElementById('crm-aktiv-liste'); if(!el) return;
  if(!alle.length){
    el.innerHTML='<div style="padding:16px;font-size:12px;color:var(--text3);">Noch keine Aktivitäten. Nutze die Schnellerfassung rechts.</div>';
    return;
  }
  var typCol={'Anruf':'var(--green)','E-Mail':'var(--blue)','Meeting':'var(--purple)',
              'Angebot':'var(--amber)','Nachfassen':'var(--amber)','Sonstiges':'var(--gray)'};
  el.innerHTML=alle.slice(0,20).map(function(a,i){
    var col=typCol[a.typ]||'var(--gray)';
    var datumFmt=a.datum?a.datum.split('-').reverse().join('.'):'';
    var isLast=(i===alle.slice(0,20).length-1);
    return '<div style="display:flex;gap:12px;padding:12px 0;'+(isLast?'':'border-bottom:1px solid var(--border);')+'">'
      +'<div style="width:32px;height:32px;border-radius:8px;background:'+col+'20;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">'+a.ico+'</div>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
          +a.kundeName+' · '+a.typ+(a.notiz?' · '+a.notiz.substring(0,40)+(a.notiz.length>40?'…':''):'')
        +'</div>'
        +'<div style="font-size:11px;color:var(--text2);margin-top:2px;">'
          +datumFmt+(a.zeit?' '+a.zeit:'')
          +(a.ma?' · <strong>'+a.ma+'</strong>':'')
          +' · <span style="color:var(--blue);cursor:pointer;" onclick="openCrmDetail(\''+a.kundeKey+'\')">'+a.kundeName+'</span>'
          +(a.wv?'<span style="margin-left:8px;color:var(--amber);">📅 WV: '+a.wv.split('-').reverse().join('.')+'</span>':'')
        +'</div>'
      +'</div>'
      +'</div>';
  }).join('');
}

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

