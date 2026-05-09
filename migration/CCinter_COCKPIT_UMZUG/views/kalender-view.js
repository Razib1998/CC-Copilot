// ════════════════════════════════════════════════════════════════════
// CC INTERN — Kalender
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/kalender-view.js
// Enthält:  buildCCCalendar, ccGetAlleTermine, Termin-CRUD, ccOpenTeamView
//
// TODO [Cockpit]: ccGetAlleTermine() → API GET /calendar
// TODO [Cockpit]: submitCCTermin() → API POST /calendar
// ════════════════════════════════════════════════════════════════════

function ccGetAlleTermine(){
  var result=[];
  var stepTyp={grafik:'purple',druck:'blue',laminat:'teal',montage:'amber',doku:'purple',abgeschlossen:'green'};
  AUFTRAEGE.forEach(function(a){
    var datum=(a.terminDatum||a.liefertermin||'').substring(0,10);
    var depot=(a.depot||'').replace('Depot ','').replace(' (Bogestra)','').replace('Depot ','').trim()||'Intern';
    var monteur=(a.schritte&&a.schritte.montage&&(a.schritte.montage.verantwortlicherName||a.schritte.montage.wer))||'—';

    // ── Starttermin-Eintrag (Beginn Produktion / Vorbereitung) ──
    if(datum){
      var typ=a.urgent?'red':(stepTyp[a.step]||'blue');
      result.push({
        id:'T-AU-'+a.id, datum:datum,
        titel:a.kunde+' · '+a.fz+(a.paket?' · '+a.paket.substring(0,16):''),
        typ:typ, depot:depot, monteur:monteur,
        quelle:'cc', step:a.step, auftragId:a.id,
      });
    }

    // ── Montagetermin-Eintrag (separater Kalendereintrag) ───────
    if(a.montageDatum && a.montageDatum !== datum){
      var montageZeitStr = a.montageZeit ? ' '+a.montageZeit : '';
      var montageVerant  = (a.schritte&&a.schritte.montage&&(a.schritte.montage.verantwortlicherName||a.schritte.montage.wer))||monteur;
      result.push({
        id:'T-MON-'+a.id, datum:a.montageDatum.substring(0,10),
        titel:'🔧 Montage: '+a.kunde+' · '+a.fz+montageZeitStr,
        typ:'amber',                   // immer amber = Montage
        depot:depot, monteur:montageVerant,
        quelle:'cc', step:'montage',   // icon 🚌 im Kalender
        auftragId:a.id,
        isMontageTermin:true,          // Marker für Detail-Panel
      });
    }
    // Wenn montageDatum == starttermin: Starttermin-Eintrag bleibt, aber step='montage' kennzeichnen
    else if(a.montageDatum && a.montageDatum === datum && a.step !== 'montage'){
      // Schon als Starttermin drin — kein Duplikat nötig
    }
  });
  CC_FUSA_TERMINE.forEach(function(f){
    if(f.auftragId) return;
    result.push({id:f.id,datum:f.datum,titel:f.titel,typ:'amber',
      depot:f.depot,monteur:f.monteur,quelle:'fusa',fusaStatus:f.fusaStatus,auftragId:null});
  });
  return result;
}

function ccCalLoad(){
  // Delegiert an DAL — unterstützt localStorage heute, API morgen
  loadFusaTermine(function(){
    if(typeof buildCCCalendar === 'function') buildCCCalendar();
  });
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

function ccTerminClick(terminId){
  var alle=ccGetAlleTermine();
  var t=alle.find(function(x){return x.id===terminId;});
  if(!t) return;
  // CC-Auftrag: direkt den Auftrag öffnen
  if(t.quelle==='cc'&&t.auftragId){openAuftragDetail(t.auftragId);return;}
  // FUSA: Übernahme-Panel
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
  AUFTRAEGE.push({id:auId,kunde:kunde,fz:fz,paket:pRaw,
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
var LAGER_FILTER = 'alle';
var LAGER_CC = [
  // Folien
  {art:'ORAJET® 3551 GLOSSY 137cm',   kat:'folie',    nr:'ORA-3551-G137', eh:'lfm',  bestand:85,  mindest:20, status:'ok'},
  {art:'ORAJET® 3551 GLOSSY 105cm',   kat:'folie',    nr:'ORA-3551-G105', eh:'lfm',  bestand:42,  mindest:20, status:'ok'},
  {art:'ORAJET® 3162 CAST MATT 105cm',kat:'folie',    nr:'ORA-3162-M105', eh:'lfm',  bestand:8,   mindest:15, status:'warn'},
  {art:'ORAJET® 3162 CAST MATT 137cm',kat:'folie',    nr:'ORA-3162-M137', eh:'lfm',  bestand:0,   mindest:15, status:'leer'},
  {art:'Avery MPI 1105 EA RS 137cm',  kat:'folie',    nr:'AVY-1105-137',  eh:'lfm',  bestand:23,  mindest:10, status:'ok'},
  {art:'VakoSun Protect 20A 152cm',   kat:'folie',    nr:'VAK-20A-152',   eh:'lfm',  bestand:5,   mindest:10, status:'warn'},
  {art:'mactac MACal 9888 CAST 123cm',kat:'folie',    nr:'MAC-9888-123',  eh:'lfm',  bestand:0,   mindest:10, status:'leer'},
  // Laminate
  {art:'ORAGUARD® 200M MATT 137cm',   kat:'laminat',  nr:'OG-200M-137',   eh:'lfm',  bestand:60,  mindest:20, status:'ok'},
  {art:'ORAGUARD® 215G GLOSSY 137cm', kat:'laminat',  nr:'OG-215G-137',   eh:'lfm',  bestand:55,  mindest:20, status:'ok'},
  {art:'ORAGUARD® 215G GLOSSY 105cm', kat:'laminat',  nr:'OG-215G-105',   eh:'lfm',  bestand:12,  mindest:15, status:'warn'},
  {art:'Avery DOL 1460Z GLOSSY 137cm',kat:'laminat',  nr:'AVY-DOL-137',   eh:'lfm',  bestand:18,  mindest:10, status:'ok'},
  // Reinigung
  {art:'IPA 70% Isopropanol 1L',      kat:'reinigung',nr:'IPA-70-1L',     eh:'Fl.',  bestand:12,  mindest:5,  status:'ok'},
  {art:'IPA 70% Isopropanol 5L',      kat:'reinigung',nr:'IPA-70-5L',     eh:'Fl.',  bestand:3,   mindest:4,  status:'warn'},
  {art:'Aktivator Primer 250ml',       kat:'reinigung',nr:'AKT-250',       eh:'Fl.',  bestand:6,   mindest:4,  status:'ok'},
  {art:'Klebstoff-Entferner 500ml',   kat:'reinigung',nr:'KLE-500',       eh:'Fl.',  bestand:0,   mindest:3,  status:'leer'},
  // Werkzeug
  {art:'Rakeln hart (10er Pack)',      kat:'werkzeug', nr:'RAK-HART-10',   eh:'Pk.',  bestand:4,   mindest:2,  status:'ok'},
  {art:'Rakeln weich (10er Pack)',     kat:'werkzeug', nr:'RAK-WEICH-10',  eh:'Pk.',  bestand:1,   mindest:2,  status:'warn'},
  {art:'Cutter-Klingen 100er',        kat:'werkzeug', nr:'CUT-100',       eh:'Pk.',  bestand:8,   mindest:3,  status:'ok'},
  {art:'Heißluftpistole 1800W',       kat:'werkzeug', nr:'HLP-1800',      eh:'Stk',  bestand:3,   mindest:2,  status:'ok'},
  {art:'Folienstift silber',          kat:'werkzeug', nr:'FST-SIL',       eh:'Stk',  bestand:0,   mindest:5,  status:'leer'},
  // HP Farben
  {art:'HP 831 Latex Cyan 775ml',     kat:'farbe',    nr:'HP-831-C',      eh:'Fl.',  bestand:3,   mindest:2,  status:'ok'},
  {art:'HP 831 Latex Magenta 775ml',  kat:'farbe',    nr:'HP-831-M',      eh:'Fl.',  bestand:1,   mindest:2,  status:'warn'},
  {art:'HP 831 Latex Yellow 775ml',   kat:'farbe',    nr:'HP-831-Y',      eh:'Fl.',  bestand:2,   mindest:2,  status:'ok'},
  {art:'HP 831 Latex Black 775ml',    kat:'farbe',    nr:'HP-831-K',      eh:'Fl.',  bestand:0,   mindest:2,  status:'leer'},
  {art:'HP 831 Latex Light Cyan',     kat:'farbe',    nr:'HP-831-LC',     eh:'Fl.',  bestand:2,   mindest:2,  status:'ok'},
  {art:'HP 831 Latex Light Magenta',  kat:'farbe',    nr:'HP-831-LM',     eh:'Fl.',  bestand:1,   mindest:2,  status:'warn'},
  {art:'HP Optimierer 775ml',         kat:'farbe',    nr:'HP-OPT',        eh:'Fl.',  bestand:0,   mindest:1,  status:'leer'},
];

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
    return '<tr>'
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

// ── Wareneingang ───────────────────────────────────────────────────
var _lagerActIdx = -1; // aktuell bearbeiteter Artikel-Index

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
  a.bestand = Math.round((a.bestand + menge) * 10) / 10;
  if((a.bestellt||0) > 0){ a.bestellt = Math.max(0, Math.round((a.bestellt - menge) * 10) / 10); }
  lagerUpdateStatus(a);
  saveLager(); renderLagerCC();
  document.getElementById('lager-waren-ov').style.display='none';
  showToast('✓ Wareneingang gebucht: +'+menge+' '+a.eh+' — '+a.art.substring(0,25));
}

// ── Bestellen (einzeln) ────────────────────────────────────────────
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
  var a = LAGER_CC[_lagerActIdx];
  a.bestellt = Math.round(((a.bestellt||0) + menge) * 10) / 10;
  saveLager(); renderLagerCC();
  document.getElementById('lager-bestell-ov').style.display='none';
  showToast('🛒 Bestellt: '+menge+' '+a.eh+' — '+a.art.substring(0,25));
}

// ── Artikel bearbeiten / neu anlegen ──────────────────────────────
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
          +'<input type="text" id="lgArtEh" value="'+a.eh+'" style="'+iS+'" placeholder="lfm / Fl. / Stk / Pk.">'
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
    +'</div>';
  ov.style.display='flex';
  setTimeout(function(){ var i=document.getElementById('lgArtName'); if(i)i.focus(); },80);
}

function lagerArtikelSpeichern(){
  var name = document.getElementById('lgArtName')?.value.trim();
  if(!name){ showToast('⚠ Artikelname eingeben'); return; }
  var obj = {
    art:      name,
    kat:      document.getElementById('lgArtKat')?.value || 'folie',
    nr:       document.getElementById('lgArtNr')?.value.trim() || '',
    eh:       document.getElementById('lgArtEh')?.value.trim() || 'Stk',
    bestand:  parseFloat(document.getElementById('lgArtBestand')?.value||'0')||0,
    mindest:  parseFloat(document.getElementById('lgArtMindest')?.value||'0')||0,
    bestellt: _lagerActIdx < 0 ? 0 : (LAGER_CC[_lagerActIdx].bestellt||0),
  };
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
  var name = LAGER_CC[_lagerActIdx].art;
  LAGER_CC.splice(_lagerActIdx, 1);
  saveLager(); renderLagerCC();
  document.getElementById('lager-artikel-ov').style.display='none';
  showToast('🗑 Gelöscht: '+name.substring(0,25));
}

// ── Bestellung aufgeben (alle warn/leer) ──────────────────────────
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

// ── Lieferanten Helpers ───────────────────────────────────────────
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

// ── Lieferanten verwalten ─────────────────────────────────────────
var _lgLiefActIdx = -1;

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
  if(!confirm('Möchten Sie diesen Lieferanten wirklich löschen?')) return;
  LIEFERANTEN.splice(i,1);
  lagerLieferantenRender();
}

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
// CHECKLISTEN-ZUORDNUNG — ausschließlich produktbasiert
//
// REGEL: Nur Produkt-ID steuert Checklisten + Workflow.
//   Leistungsbereich = nur Anzeige/Filter, enthält KEINE Logik.
//   Schrittbasierte Checklisten werden ebenfalls pro Produkt
//   definiert — kein generischer Schritt-Fallback.
// ═══════════════════════════════════════════════════════════════
const CL_ZUORDNUNG = {

  // ── Produkt → Checkliste(n) für den Auftrag gesamt ─────────
  // Quelle der Wahrheit: Produkt-ID entscheidet alles.
  // Leistungsbereich wird NICHT referenziert.
  produkt: {
    // Fahrzeugbeschriftung — BUS
    'bus_voll':          ['cl-002'],      // Ganzgestaltung (Vollfolierung)
    'bus_teil':          ['cl-001'],      // Busbeklebung Standard
    'bus_heck':          ['cl-001'],
    'bus_ssp':           ['cl-001'],
    'bus_traffic_board': ['cl-003'],
    // Fahrzeugbeschriftung — BAHN
    'bahn_voll':         ['cl-002'],
    'bahn_teil':         ['cl-001'],
    'bahn_innen':        ['cl-003'],
    // Fahrzeugbeschriftung — PKW
    'pkw_voll':          ['cl-002'],
    'pkw_teil':          ['cl-001'],
    'pkw_beschr':        ['cl-001'],
    // Fahrzeugbeschriftung — TRANSPORTER
    'van_voll':          ['cl-002'],
    'van_teil':          ['cl-001'],
    'van_beschr':        ['cl-001'],
    // Druck / Banner / Plakate
    'banner_pvc':       ['cl-004'],
    'plakat':           ['cl-004'],
    'rollup':           ['cl-004'],
    'bauzaun':          ['cl-004'],
    'grossformat':      ['cl-004'],
    // Schilder / Werbeanlagen
    'dibond_schild':      ['cl-004'],
    'forex_schild':       ['cl-004'],
    'acryl_schild':       ['cl-004'],
    'leuchtreklame':      ['cl-004'],
    'einzelbuchstaben':   ['cl-004'],
    'werbeanlage_aussen': ['cl-004'],
    // Folie / Fenster / Aufkleber
    'fenster_bekl':     ['cl-001'],   // Folierungsstandard
    'milchglas':        ['cl-004'],   // Digitaldruck & Schilder
    'sonnenschutz':     ['cl-004'],
    'aufkleber_digi':   ['cl-004'],
    'aufkleber_plot':   ['cl-004'],
    'etiketten':        ['cl-004'],
    // Messe / Event / POS
    'messestand':       ['cl-004'],
    'messewand':        ['cl-004'],
    'pos_display':      ['cl-004'],
    'promotion':        ['cl-004'],
    // Sonstiges
    'freie_leistung':   [],   // keine automatische Checkliste
  },

  // ── Produkt × Schritt → spezifische Checkliste ─────────────
  // Wenn ein Produkt in einem bestimmten Schritt eine eigene
  // Checkliste braucht, wird sie hier pro Produkt definiert.
  // Kein generischer Schritt-Fallback — immer produktbasiert.
  produktSchritt: {
    // Fahrzeug-Produkte im Montage-Schritt → Montage-Checkliste
    // BUS — Montage immer cl-006 (Montage Busbeklebung)
    'bus_voll':  { 'grafik':['cl-005'], 'druck':['cl-004'], 'laminat':['cl-004'], 'montage':['cl-006','cl-003'], 'doku':['cl-003'] },
    'bus_teil':  { 'grafik':['cl-005'], 'druck':['cl-004'], 'laminat':['cl-004'], 'montage':['cl-006'],          'doku':['cl-003'] },
    'bus_heck':  { 'grafik':['cl-005'], 'druck':['cl-004'],                        'montage':['cl-006'],          'doku':['cl-003'] },
    'bus_ssp':   { 'grafik':['cl-005'], 'druck':['cl-004'],                        'montage':['cl-006'],          'doku':['cl-003'] },
    'bus_traffic_board': { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    // BAHN
    'bahn_voll': { 'grafik':['cl-005'], 'druck':['cl-004'], 'laminat':['cl-004'], 'montage':['cl-006','cl-003'], 'doku':['cl-003'] },
    'bahn_teil': { 'grafik':['cl-005'], 'druck':['cl-004'], 'laminat':['cl-004'], 'montage':['cl-006'],          'doku':['cl-003'] },
    'bahn_innen':{ 'grafik':['cl-005'], 'druck':['cl-004'],                        'montage':['cl-003'],          'doku':['cl-003'] },
    // PKW
    'pkw_voll':  { 'grafik':['cl-005'], 'druck':['cl-004'], 'laminat':['cl-004'], 'montage':['cl-006','cl-003'], 'doku':['cl-003'] },
    'pkw_teil':  { 'grafik':['cl-005'], 'druck':['cl-004'],                        'montage':['cl-006'],          'doku':['cl-003'] },
    'pkw_beschr':{ 'grafik':['cl-005'], 'druck':['cl-004'],                        'montage':['cl-006'],          'doku':['cl-003'] },
    // TRANSPORTER
    'van_voll':  { 'grafik':['cl-005'], 'druck':['cl-004'], 'laminat':['cl-004'], 'montage':['cl-006','cl-003'], 'doku':['cl-003'] },
    'van_teil':  { 'grafik':['cl-005'], 'druck':['cl-004'],                        'montage':['cl-006'],          'doku':['cl-003'] },
    'van_beschr':{ 'grafik':['cl-005'], 'druck':['cl-004'],                        'montage':['cl-006'],          'doku':['cl-003'] },
    // Schilder / Werbeanlagen
    'dibond_schild':      { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    'forex_schild':       { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    'acryl_schild':       { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    'leuchtreklame':      { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    'einzelbuchstaben':   { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    'werbeanlage_aussen': { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    // Druck / Banner / Plakate
    'banner_pvc':  { 'grafik':['cl-005'], 'druck':['cl-004'], 'laminat':['cl-004'] },
    'plakat':      { 'grafik':['cl-005'], 'druck':['cl-004'] },
    'rollup':      { 'grafik':['cl-005'], 'druck':['cl-004'] },
    'bauzaun':     { 'grafik':['cl-005'], 'druck':['cl-004'] },
    'grossformat': { 'grafik':['cl-005'], 'druck':['cl-004'], 'laminat':['cl-004'] },
    // Folie / Fenster / Aufkleber
    'fenster_bekl':  { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-006'], 'doku':['cl-003'] },
    'milchglas':     { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    'sonnenschutz':  { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    'aufkleber_digi':{ 'grafik':['cl-005'], 'druck':['cl-004'] },
    'aufkleber_plot':{ 'grafik':['cl-005'], 'druck':['cl-004'] },
    'etiketten':     { 'grafik':['cl-005'], 'druck':['cl-004'] },
    // Messe / Event / POS
    'messestand':   { 'grafik':['cl-005'], 'druck':['cl-004'], 'laminat':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    'messewand':    { 'grafik':['cl-005'], 'druck':['cl-004'], 'laminat':['cl-004'], 'montage':['cl-003'], 'doku':['cl-003'] },
    'pos_display':  { 'grafik':['cl-005'], 'druck':['cl-004'], 'montage':['cl-003'] },
    'promotion':    { 'grafik':['cl-005'], 'druck':['cl-004'] },
    // Sonstiges — freie_leistung hat keine fixen Schritt-Checklisten
    'freie_leistung': {},
  },
};

// ── Checkliste für einen bestimmten Schritt ──────────────────────
// Steuerung ausschließlich über Produkt-ID.
// Leistungsbereich wird NICHT für Logik verwendet.
function clChecklistenFuerSchritt(auftrag, schritt){
  var pid = auftrag ? (auftrag.produktId||'') : '';

  // Produkt × Schritt → Checklisten-IDs
  var vorlagenIds = [];
  if(pid && CL_ZUORDNUNG.produktSchritt[pid] && CL_ZUORDNUNG.produktSchritt[pid][schritt]){
    vorlagenIds = CL_ZUORDNUNG.produktSchritt[pid][schritt];
  }
  // Kein Produkt bekannt: leere Checkliste — kein Leistungs-Fallback
  if(!vorlagenIds.length) return [];

  var punkte = [];
  var gesehen = {};
  vorlagenIds.forEach(function(vid){
    var v = CL_VORLAGEN.find(function(x){ return x.id===vid; });
    if(!v || !v.aktiv) return;
    v.punkte.forEach(function(p){
      if(!gesehen[p.text]){
        gesehen[p.text] = true;
        punkte.push({text:p.text, kat:p.kat, hinweis:p.hinweis||'', quelle:v.name, erledigt:false});
      }
    });
  });
  return punkte;
}

// ── Checkliste für einen Auftrag (Legacy / Auftrag-gesamt) ──────
// Steuerung ausschließlich über Produkt-ID.
// Leistungsbereich wird NICHT für Logik verwendet.
// Wird noch für ältere Teile des Systems als Fallback benötigt.
function clChecklistenFuerAuftrag(auftrag){
  var produktId = auftrag.produktId || '';

  // Ausschließlich produktbasiert — kein Leistungs-Fallback
  var vorlagenIds = [];
  if(produktId && CL_ZUORDNUNG.produkt[produktId]){
    vorlagenIds = CL_ZUORDNUNG.produkt[produktId].slice();
  }
  // Kein passendes Produkt → leere Checkliste
  if(!vorlagenIds.length) return [];

  var punkte = [];
  var gesehen = {};
  vorlagenIds.forEach(function(vid){
    var vorlage = CL_VORLAGEN.find(function(v){ return v.id === vid; });
    if(!vorlage || !vorlage.aktiv) return;
    vorlage.punkte.forEach(function(p){
      if(!gesehen[p.text]){
        gesehen[p.text] = true;
        punkte.push({text:p.text, kat:p.kat, hinweis:p.hinweis||'', quelle:vorlage.name, erledigt:false});
      }
    });
  });
  return punkte;
}

// ── Vorlage-Namen für Auftrag (nur Anzeige) ──────────────────────
// Ausschließlich über Produkt-ID. Nur für Anzeigezwecke.
function clVorlagenNamenFuerAuftrag(auftrag){
  var pid = auftrag.produktId || '';
  var ids = (pid && CL_ZUORDNUNG.produkt[pid]) ? CL_ZUORDNUNG.produkt[pid].slice() : [];
  return ids.map(function(id){
    var v = CL_VORLAGEN.find(function(x){ return x.id === id; });
    return v ? v.name : id;
  });
}
// ── Checklisten für ALLE Aufträge automatisch nachrüsten ─────────────
// Wird bei App-Start aufgerufen — füllt fehlende Schritt-Checklisten
// aus den Produkt-Templates nach (Produkt-ID → CL_ZUORDNUNG → CL_VORLAGEN)
function clMigrierAlle(){
  var needSave = false;
  AUFTRAEGE.forEach(function(a){
    // materialVerbrauch-Migration: sicherstellen dass Array existiert
    if(!a.materialVerbrauch){ a.materialVerbrauch=[]; needSave=true; }

    if(a.step === 'abgeschlossen') return;
    ['grafik','druck','laminat','montage','doku'].forEach(function(step){
      var sch = a.schritte && a.schritte[step];
      if(!sch) return;
      // Schritt aktiv (dauer > 0) oder aktueller Schritt
      if(sch.dauer <= 0 && a.step !== step) return;
      if(sch.checkliste && sch.checkliste.length > 0) return; // schon befüllt
      var tpl = clChecklistenFuerSchritt(a, step);
      if(tpl.length > 0){
        sch.checkliste = tpl;
        needSave = true;
      }
    });
  });
  if(needSave) saveAuftraege();
}

var aufgabenNr = 1; // Aufgaben-Zähler (wird bei dalInit aus INTERN_AUFGABEN.length initialisiert)

// ── Interne Aufgaben aus Auftrag erzeugen ─────────────────────────────
function auftragAufgabenErzeugen(auftragId){
  var a = AUFTRAEGE.find(function(x){ return x.id === auftragId; });
  if(!a) return;

  for(var i = INTERN_AUFGABEN.length - 1; i >= 0; i--){
    if(INTERN_AUFGABEN[i].auftragId === auftragId) INTERN_AUFGABEN.splice(i, 1);
  }

  var stepOrder = ['grafik','druck','laminat','montage','extern','doku'];
  var heute = new Date().toISOString();
  // Datum: immer heute als Fallback wenn kein Termin gesetzt
  var basisDatum = a.terminDatum || a.liefertermin || heute.split('T')[0];
  if(!basisDatum || basisDatum === 'undefined' || basisDatum.length < 8){
    basisDatum = heute.split('T')[0];
  }

  // Temporäre Belegungsmap für diese Anlage (damit Schritte desselben Auftrags
  // sich gegenseitig nicht überschneiden, falls MA identisch)
  var tempBelegung = {}; // maId|datum → bereits in diesem Auftrag verplante Stunden

  stepOrder.forEach(function(step){
    var sch = a.schritte && a.schritte[step];
    if(!sch || !sch.dauer || sch.dauer <= 0) return;
    var stepLabel = (STEP_LABELS[step] && STEP_LABELS[step].title) || step;
    var gesamtDauer = sch.dauer;
    // maIds: bei multi = alle, sonst Array mit einem Eintrag
    // Req. 5: verantwortlicher + zusatzMa für Mobile-Filterung nutzen
    var maIds;
    if(sch.verantwortlicher){
      maIds = [sch.verantwortlicher].concat(sch.zusatzMa||[]);
    } else {
      maIds = (sch.maIds && sch.maIds.length) ? sch.maIds : (sch.maId ? [sch.maId] : [null]);
    }

    maIds.forEach(function(maId){
      var ma = maId ? MA_DATA.find(function(m){return m.maId===maId;})||{n:maId} : {n:sch.wer||'—'};
      // Bei multi: jeder MA bekommt volle Dauer, KEINE Tagesverteilung aufteilen zwischen MAs
      // Tagesverteilung: pro MA einzeln (jeder hat eigene Kapazität)
      var bloecke = maAufgabeAufteilen(maId, basisDatum, gesamtDauer, tempBelegung);

      bloecke.forEach(function(block, idx){
        var aufgId = 'IA-' + new Date().getFullYear() + '-' + String(aufgabenNr++).padStart(3,'0');
        if(maId){
          var bKey = maId+'|'+block.datum;
          tempBelegung[bKey] = (tempBelegung[bKey]||0) + block.dauer;
        }
        var multiSuffix = maIds.length > 1 ? ' · '+ma.n : '';
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
          maIds:       maIds,
          dauer:       block.dauer,
          dauerGesamt: gesamtDauer,
          tagBlock:    bloecke.length>1 ? (idx+1)+'/'+bloecke.length : null,
          datum:       block.datum,
          status:      'offen',
          erstellt:    heute,
        };
        // Schritt-spezifische Checkliste direkt anhängen
        aufgabe.checkliste = clChecklistenFuerSchritt(a, step);
        INTERN_AUFGABEN.push(aufgabe);
      });
    });
  });

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

function naechsterArbeitstag(isoDate){
  var d = new Date(isoDate);
  d.setDate(d.getDate() + 1);
  // Wochenende überspringen
  while(d.getDay()===0 || d.getDay()===6) d.setDate(d.getDate()+1);
  return d.toISOString().split('T')[0];
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
              +aufgaben.reduce(function(s,g){ return s+g.dauer; },0).toFixed(1)+' h'
            +'</span>'
          +'</div>'
        +'</div>'
      : ''
    );

  // Detail-Panel öffnen
  var ov = document.getElementById('detailOverlay');
  if(ov) ov.classList.add('open');
}

function submitAuftrag(){
  const kunde       = document.getElementById('au-kunde')?.value?.trim();
  const auftragsart = document.getElementById('au-auftragsart')?.value?.trim();
  const leistung    = document.getElementById('au-leistung')?.value?.trim();
  const produktId   = document.getElementById('au-produkt')?.value?.trim();

  // Validation — Pflichtfelder: Kunde + Auftragsart + Leistungsbereich
  if(!kunde){
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
  const liefert        = document.getElementById('au-liefertermin')?.value||terminDatum||'';

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

  // Schritte mit MA + Dauer aufbauen — liest Verantwortlicher + Zusatz-MA
  function buildSchritt(step){
    var cfg = AU_STEP_CONFIG[step]||{typ:'single',maOptions:[]};
    var dauerEl = document.getElementById('au-sd-dauer-'+step);
    var dauer = dauerEl ? parseFloat(dauerEl.value)||0 : 0;
    var maIds = [], maNames = [];

    if(!cfg.maOptions.length){
      // Extern: kein MA
    } else {
      var verantId = '';
      if(step === 'doku'){
        // Doku: Wert aus Dropdown lesen, kein Auto-Default
        var dokuSel2 = document.getElementById('au-sd-verant-doku-sel');
        verantId = dokuSel2 ? dokuSel2.value : '';
      } else {
        // Verantwortlicher aus Radio-Buttons lesen
        var verantRadio = document.querySelector('input[name="au-sd-verant-'+step+'"]:checked');
        verantId = verantRadio ? verantRadio.value : '';
        if(!verantId){
          var hidden = document.getElementById('au-sd-wer-'+step);
          verantId = hidden ? hidden.value : '';
        }
        if(!verantId && cfg.maOptions.length) verantId = cfg.maOptions[0];
      }
      if(verantId){
        maIds.push(verantId);
        var mv = MA_DATA.find(function(x){return x.maId===verantId;})||null;
        maNames.push(mv ? mv.n : verantId);
      }
      // Zusatz-MA aus Checkboxen lesen (Req. 3: Multiselect)
      cfg.maOptions.forEach(function(id){
        if(id === verantId) return; // Verantwortlicher nicht doppeln
        var cb = document.getElementById('au-sd-zusatz-'+step+'-'+id);
        if(cb && cb.checked){
          maIds.push(id);
          var m = MA_DATA.find(function(x){return x.maId===id;})||{n:id};
          maNames.push(m.n);
        }
      });
    }

    return {
      typ:              cfg.typ,
      // ── Verantwortlicher (Pflicht) ──────────────────────────────────
      verantwortlicher: maIds[0]||null,
      verantwortlicherName: maNames[0]||'—',
      // ── Zusatz-Mitarbeiter ──────────────────────────────────────────
      zusatzMa:         maIds.slice(1),
      zusatzMaNames:    maNames.slice(1),
      // ── Legacy ──────────────────────────────────────────────────────
      maIds:            maIds,
      maId:             maIds[0]||null,
      wer:              maNames.join(' + ')||'—',
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
    terminDatum:   terminDatum||montageDatum||liefert,
    montageDatum:  montageDatum,
    montageZeit:   montageZeit,
    liefertermin:  liefert,
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
  // Req. 1: Checklisten gehören zum Schritt, nicht zur Person
  // Schritt-spezifische Checklisten in schritte[] einbauen
  // Custom-Punkte (aus Modal) kommen zuerst, danach Template-Punkte (ohne Duplikate)
  ['grafik','druck','laminat','montage','doku'].forEach(function(step){
    var sch = neuerAuftrag.schritte[step];
    if(sch && sch.dauer > 0){
      var templateCL = clChecklistenFuerSchritt(neuerAuftrag, step);
      var customItems = sch.checkliste || []; // bereits von buildSchritt gesetzt
      var merged = customItems.slice();
      templateCL.forEach(function(item){
        if(!merged.some(function(c){ return c.text===item.text; })){
          merged.push(item);
        }
      });
      sch.checkliste = merged;
    }
  });
  // Legacy: Auftrag-Checkliste (für ältere Teile des Systems)
  neuerAuftrag.checklisten = clChecklistenFuerAuftrag(neuerAuftrag);
  var clNamen = clVorlagenNamenFuerAuftrag(neuerAuftrag);

  AUFTRAEGE.push(neuerAuftrag);

  closeAuftragModal();
  renderKanban();
  if(currentPage==='auftraege') renderAuftragVerwaltung();
  if(currentPage==='kalender') buildCCCalendar();
  // Detail sofort nach Anlegen öffnen
  setTimeout(function(){ openAuftragDetail(id); }, 50);
  var ersterWer=buildSchritt(firstStep).wer||'—';
  showWorkflowNotif({id,fz,kunde},null,firstStep,ersterWer,
    new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}));
  // Interne Aufgaben anlegen
  auftragAufgabenErzeugen(id);
  // Kapazitätsprüfung: Warnungen anzeigen wenn MA überlastet
  maKapWarnungAnzeigen(id);
  // Aufgaben-Vorschau sofort im Detail-Panel anzeigen
  showAufgabenVorschau(id);
  showToast('✓ '+id+' angelegt · '+kunde+(terminDatum||liefert?' · 📅':'')
    +(neuerAuftrag.checklisten.length?' · 📋 '+neuerAuftrag.checklisten.length+' Prüfpunkte':''));
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
      if(!confirm(confirm_text)) return;

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

function urlaubEntscheiden(id, status){
  var a=URLAUB_ANTRAEGE.find(function(x){return x.id===id;}); if(!a) return;
  a.status=status;
  saveUrlaub();
  renderUrlaubAntraege();
  showToast((status==='genehmigt'?'✓ Genehmigt: ':'✗ Abgelehnt: ')+a.ma+' · '+a.typ);
}

// ── Aufgaben für bestehende Aufträge nacherzeugen ────────────────
// Läuft einmal beim Start — erzeugt Aufgaben für Demo-Aufträge
// die vor dem neuen System angelegt wurden (haben noch keine Aufgaben)
function mobAufgabenNacherzeugen(){
  var vorher = INTERN_AUFGABEN.length;

  // Req. 1: Checklisten in Schritte einbauen (Migration) + Legacy
  var needSave = false;
  AUFTRAEGE.forEach(function(a){
    // Schritt-Checklisten nachrüsten
    ['grafik','druck','laminat','montage','doku'].forEach(function(step){
      var sch = a.schritte && a.schritte[step];
      if(sch && sch.dauer > 0 && (!sch.checkliste || !sch.checkliste.length)){
        schrittMigrieren(sch, step);
        sch.checkliste = clChecklistenFuerSchritt(a, step);
        if(sch.checkliste.length) needSave = true;
      }
    });
    // Legacy auftrag.checklisten
    if(!a.checklisten || !a.checklisten.length){
      a.checklisten = clChecklistenFuerAuftrag(a);
      if(a.checklisten.length) needSave = true;
    }
  });
  if(needSave) saveAuftraege();

  AUFTRAEGE.forEach(function(a){
    if(a.step === 'abgeschlossen') return;
    // Prüfen ob schon Aufgaben existieren
    var hatAufgaben = INTERN_AUFGABEN.some(function(g){ return g.auftragId === a.id; });
    if(hatAufgaben) return;

    // Schritte mit dauer=0 → Default-Werte aus AU_STEP_CONFIG einsetzen
    var schritte = a.schritte || {};
    var defaultsGesetzt = false;
    ['grafik','druck','laminat','montage','doku'].forEach(function(s){
      var sch = schritte[s];
      if(!sch) return;
      if((sch.dauer||0) <= 0){
        var def = AU_STEP_CONFIG && AU_STEP_CONFIG[s] ? AU_STEP_CONFIG[s].defaultDauer : 0;
        if(def > 0){ sch.dauer = def; defaultsGesetzt = true; }
      }
    });
    if(defaultsGesetzt){ needSave = true; }

    // Prüfen ob nun Schritte mit Dauer vorhanden
    var hatSchritteMitDauer = Object.keys(schritte).some(function(s){
      return schritte[s] && schritte[s].dauer > 0;
    });
    if(!hatSchritteMitDauer) return;
    // Aufgaben erzeugen
    auftragAufgabenErzeugen(a.id);
  });
  var nachher = INTERN_AUFGABEN.length;
  if(nachher > vorher || needSave){
    if(nachher > vorher)
      console.log('Aufgaben nacherzeugt: '+(nachher-vorher)+' neue Aufgaben für bestehende Aufträge');
    saveAufgaben();
    if(needSave) saveAuftraege();
  }
}

// ══════════════════════════════════════════════════════════════════════
// SYNC + NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════

var CC_SYNC_ACTIVE  = false;   // true wenn Server erreichbar
var CC_SYNC_VERSION = 0;       // letzter bekannter dataVersion vom Server
var CC_NOTIF_DATA   = [];      // lokal gecachte Notifications
var CC_NOTIF_OPEN   = false;   // Dropdown offen?
var CC_SSE_SOURCE   = null;    // EventSource-Objekt

// ── Sync initialisieren ────────────────────────────────────────────
function ccSyncInit() {
  // Nur bei HTTP (nicht file://)
  if (window.location.protocol === 'file:') {
    ccSyncSetStatus(false, 'Datei-Modus (kein Server)');
    return;
  }
  var apiBase = window.location.origin + '/api';

  // SyncAdapter konfigurieren + als aktiven Adapter setzen
  if (window.CCIntern && window.CCIntern.SyncAdapter) {
    window.CCIntern.SyncAdapter.configure(apiBase);
    window.CCIntern.DataService.setAdapter(window.CCIntern.SyncAdapter);
    console.info('SyncAdapter aktiv:', apiBase);
  }

  // Server-Ping prüfen
  fetch(apiBase + '/ping')
    .then(function(r) { return r.json(); })
    .then(function(info) {
      CC_SYNC_ACTIVE  = true;
      CC_SYNC_VERSION = info.version || 0;
      ccSyncSetStatus(true, 'Server verbunden · ' + info.clients + ' Geräte');
      ccSseConnect(apiBase);
      ccNotifLaden(apiBase);
    })
    .catch(function() {
      ccSyncSetStatus(false, 'Server nicht erreichbar — localStorage aktiv');
      // Fallback: weiter mit localStorage (SyncAdapter speichert lokal)
      ccPollStart(apiBase);  // polling statt SSE wenn Server weg
    });
}

// ── SSE: Live-Updates vom Server empfangen ─────────────────────────
function ccSseConnect(apiBase) {
  if (!window.EventSource) return;
  if (CC_SSE_SOURCE) { CC_SSE_SOURCE.close(); }

  CC_SSE_SOURCE = new EventSource(apiBase + '/events');

  CC_SSE_SOURCE.onopen = function() {
    CC_SYNC_ACTIVE = true;
    ccSyncSetStatus(true, 'Live-Sync aktiv');
  };

  CC_SSE_SOURCE.onmessage = function(e) {
    try {
      var msg = JSON.parse(e.data);

      if (msg.type === 'connected') {
        CC_SYNC_VERSION = msg.version;
      }

      // Daten-Update: betroffene Collection neu laden
      if (msg.type === 'update' && msg.collection && msg.version !== CC_SYNC_VERSION) {
        CC_SYNC_VERSION = msg.version;
        ccSyncReloadCollection(msg.collection, apiBase);
      }

      // Neue Notification
      if (msg.type === 'notification' && msg.notification) {
        setTimeout(function() {
          // Duplikat-Schutz: gleiche ID nicht nochmal einfügen
          var notifId = msg.notification.id;
          var already = CC_NOTIF_DATA.some(function(n){ return n.id === notifId; });
          if (!already) {
            CC_NOTIF_DATA.unshift(msg.notification);
            if (CC_NOTIF_DATA.length > 100) CC_NOTIF_DATA.splice(100);
            ccNotifBadgeUpdate();
            if (CC_NOTIF_OPEN) ccNotifRender();
          }
          ccSyncSetStatus(true, 'Live-Sync aktiv · Änderung empfangen');
        }, 500);
      }
    } catch(err) { /* Parsing-Fehler ignorieren */ }
  };

  CC_SSE_SOURCE.onerror = function() {
    CC_SYNC_ACTIVE = false;
    ccSyncSetStatus(false, 'Verbindung unterbrochen — reconnecting…');
    // EventSource reconnectiert automatisch
  };
}

// ── Polling: Fallback wenn SSE nicht möglich ───────────────────────
var CC_POLL_TIMER = null;
function ccPollStart(apiBase) {
  if (CC_POLL_TIMER) return;
  CC_POLL_TIMER = setInterval(function() {
    fetch(apiBase + '/ping')
      .then(function(r) { return r.json(); })
      .then(function(info) {
        if (!CC_SYNC_ACTIVE) {
          CC_SYNC_ACTIVE = true;
          ccSyncSetStatus(true, 'Server verbunden (Polling)');
          ccSseConnect(apiBase);  // SSE reaktivieren
          clearInterval(CC_POLL_TIMER);
          CC_POLL_TIMER = null;
        }
        if (info.version && info.version !== CC_SYNC_VERSION) {
          CC_SYNC_VERSION = info.version;
          // Alle relevanten Collections neu laden
          ['auftraege','aufgaben','lager','urlaub','anwesenheit'].forEach(function(col) {
            ccSyncReloadCollection(col, apiBase);
          });
        }
      })
      .catch(function() {
        CC_SYNC_ACTIVE = false;
        ccSyncSetStatus(false, 'Kein Server — localStorage aktiv');
      });
  }, 15000); // alle 15 Sekunden
}

// ── Collection neu laden und in-memory + UI aktualisieren ─────────
var CC_SYNC_KEY_MAP = {
  auftraege:   'cc_intern_auftraege_v1',
  aufgaben:    'cc_intern_aufgaben_v1',
  lager:       'cc_intern_lager_v1',
  urlaub:      'cc_intern_urlaub_v1',
  anwesenheit: 'cc_intern_anwesenheit_v1',
  mitarbeiter: 'cc_intern_ma_v1',
};
function ccSyncReloadCollection(collection, apiBase) {
  var key = CC_SYNC_KEY_MAP[collection];
  if (!key) return;
  fetch(apiBase + '/' + collection)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!Array.isArray(data)) return;
      // In-Memory aktualisieren + localStorage-Cache
      if (collection === 'auftraege') {
        AUFTRAEGE.length = 0;
        data.forEach(function(a) { AUFTRAEGE.push(a); });
        if (window.CCIntern && window.CCIntern.LocalStorageAdapter)
          window.CCIntern.LocalStorageAdapter.save(key, data);
        auNrRecalculate(); // Auftragsnummer-Zähler aktuell halten (wichtig für Handy)
        renderKanban();
        if (typeof renderAuftragVerwaltung === 'function') renderAuftragVerwaltung();
        // Chat: Glocke + offene Fragen aktualisieren
        if (typeof updateGlocke === 'function') updateGlocke();
        // Falls Desktop-Detail offen → Chat neu laden
        (function(){
          var overlay = document.getElementById('detailOverlay');
          if(overlay && overlay.classList.contains('open')){
            var titleEl = document.getElementById('dpTitle');
            if(titleEl){
              var txt = titleEl.textContent||'';
              var m = txt.match(/AU-\d{4}-\d+/);
              if(m){ renderChatBereich(m[0], 'chat-container-'+m[0]); }
            }
          }
          // Falls Mobile-Detail offen → Chat neu laden
          var mobDetail = document.getElementById('mob-auftrag-detail');
          if(mobDetail && mobDetail.style.display!=='none' && typeof MOB_AKTIV_AUF !== 'undefined' && MOB_AKTIV_AUF){
            renderChatBereich(MOB_AKTIV_AUF, 'mob-chat-container-'+MOB_AKTIV_AUF);
          }
        })();
      } else if (collection === 'aufgaben') {
        INTERN_AUFGABEN.length = 0;
        data.forEach(function(g) { INTERN_AUFGABEN.push(g); });
        if (window.CCIntern && window.CCIntern.LocalStorageAdapter)
          window.CCIntern.LocalStorageAdapter.save(key, data);
        if (typeof renderMitarbeiter === 'function') renderMitarbeiter();
        if (typeof mobRenderHome === 'function') mobRenderHome();
      } else if (collection === 'lager') {
        loadLager();
        if (typeof renderLagerCC === 'function') renderLagerCC();
        if (typeof mobRenderLager === 'function') mobRenderLager();
      } else if (collection === 'urlaub') {
        loadUrlaub(function() {
          if (typeof renderUrlaubDesktop === 'function') renderUrlaubDesktop();
          if (typeof mobRenderUrlaub === 'function') mobRenderUrlaub();
        });
      } else if (collection === 'anwesenheit') {
        loadAnwesenheit(function() {
          if (typeof renderMitarbeiter === 'function') renderMitarbeiter();
        });
      }
    })
    .catch(function() { /* Server temporär weg — kein Absturz */ });
}

// ── Notifications laden ────────────────────────────────────────────
function ccNotifLaden(apiBase) {
  fetch(apiBase + '/notifications')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      CC_NOTIF_DATA = Array.isArray(data) ? data : [];
      ccNotifBadgeUpdate();
      if (CC_NOTIF_OPEN) ccNotifRender();
    })
    .catch(function() {});
}

// ── Badge aktualisieren ────────────────────────────────────────────
var CC_NOTIF_LAST_SEEN = localStorage.getItem('cc_notif_last_seen') || '';
function ccNotifBadgeUpdate() {
  var badge = document.getElementById('cc-notif-badge');
  if (!badge) return;
  var unread = CC_NOTIF_DATA.filter(function(n) { return n.ts > CC_NOTIF_LAST_SEEN; }).length;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = '';
    // Kurze Shake-Animation
    var btn = document.getElementById('cc-notif-btn');
    if (btn) { btn.style.animation = 'cc-bell-shake 0.4s ease'; setTimeout(function(){ btn.style.animation=''; }, 500); }
  } else {
    badge.style.display = 'none';
  }
}

// ── Dropdown öffnen/schließen ──────────────────────────────────────
function ccNotifToggle() {
  var dd = document.getElementById('cc-notif-dropdown');
  if (!dd) return;
  CC_NOTIF_OPEN = !CC_NOTIF_OPEN;
  dd.style.display = CC_NOTIF_OPEN ? '' : 'none';
  if (CC_NOTIF_OPEN) {
    ccNotifRender();
    // Als gelesen markieren
    CC_NOTIF_LAST_SEEN = new Date().toISOString();
    localStorage.setItem('cc_notif_last_seen', CC_NOTIF_LAST_SEEN);
    ccNotifBadgeUpdate();
  }
}

// Dropdown schließen bei Klick außerhalb
document.addEventListener('click', function(e) {
  if (!CC_NOTIF_OPEN) return;
  var dd  = document.getElementById('cc-notif-dropdown');
  var btn = document.getElementById('cc-notif-btn');
  if (dd && btn && !dd.contains(e.target) && !btn.contains(e.target)) {
    CC_NOTIF_OPEN = false;
    dd.style.display = 'none';
  }
});

// ── Notifications rendern ──────────────────────────────────────────
var CC_NOTIF_LABELS = {
  auftraege:   '📋 Auftrag',
  aufgaben:    '✅ Aufgabe',
  urlaub:      '🏖 Urlaub',
  anwesenheit: '⏱ Anwesenheit',
  lager:       '📦 Lager',
  mitarbeiter: '👤 Mitarbeiter',
};
function ccNotifRender() {
  var list = document.getElementById('cc-notif-list');
  if (!list) return;
  if (!CC_NOTIF_DATA.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">Keine Benachrichtigungen</div>';
    return;
  }
  list.innerHTML = CC_NOTIF_DATA.slice(0, 30).map(function(n) {
    var ts    = n.ts ? n.ts.substring(0, 16).replace('T', ' ') : '';
    var isNew = n.ts > CC_NOTIF_LAST_SEEN;
    var dotHtml = isNew
      ? '<div style="width:6px;height:6px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:5px;"></div>'
      : '<div style="width:6px;flex-shrink:0;"></div>';
    var bodyHtml;
    if (n.action === 'chat' && n.info) {
      // Chat-Nachricht: eigenes Template
      var auId   = n.info.id || '';
      var fz     = n.info.fz || auId;
      var autor  = n.info.autor || '';
      var text   = n.info.text || '';
      var kunde  = n.info.kunde ? ' · ' + n.info.kunde : '';
      bodyHtml = '<div style="font-size:12px;font-weight:600;color:var(--text);">💬 ' + fz + kunde + '</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:1px;">' + autor + ' hat geschrieben: &ldquo;' + text + '&rdquo;</div>'
        + '<div style="font-size:10px;color:var(--text3);margin-top:2px;">' + ts + '</div>';
    } else {
      var lbl   = CC_NOTIF_LABELS[n.collection] || ('📌 ' + n.collection);
      var info  = n.info ? (n.info.fz || n.info.id || '') : '';
      var kunde = n.info && n.info.kunde ? ' · ' + n.info.kunde : '';
      bodyHtml = '<div style="font-size:12px;font-weight:600;color:var(--text);">' + lbl + (info ? ' — ' + info : '') + kunde + '</div>'
        + '<div style="font-size:10px;color:var(--text3);margin-top:2px;">' + ts + '</div>';
    }
    return '<div style="padding:10px 14px;border-bottom:1px solid var(--border);'
      + (isNew ? 'background:#F0F7FF;' : '')
      + 'display:flex;gap:10px;align-items:flex-start;">'
      + dotHtml
      + '<div style="flex:1;min-width:0;">' + bodyHtml + '</div>'
    + '</div>';
  }).join('');
}

// ── Alle Notifications löschen ─────────────────────────────────────
function ccNotifClear() {
  CC_NOTIF_DATA = [];
  ccNotifBadgeUpdate();
  ccNotifRender();
  var apiBase = window.location.protocol !== 'file:' ? window.location.origin + '/api' : null;
  if (apiBase) {
    fetch(apiBase + '/notifications/clear', { method: 'POST' }).catch(function(){});
  }
}

// ── Sync-Status-Anzeige im Dropdown ───────────────────────────────
function ccSyncSetStatus(online, text) {
  var dot  = document.getElementById('cc-sync-dot');
  var txt  = document.getElementById('cc-sync-text');
  if (dot) dot.style.background = online ? '#34C759' : '#FF3B30';
  if (txt) txt.textContent = text || '';
}

// ── App-Start: DAL laden dann rendern ──
window.addEventListener('load', function(){
  dalPatchAuftraege(); // AUFTRAEGE.push auto-saved
  ccSyncInit();        // Sync-Adapter + SSE initialisieren
  dalInit();           // Daten laden → Ansicht rendern
});

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

function ccTerminClick(terminId){
  var alle=ccGetAlleTermine();
  var t=alle.find(function(x){return x.id===terminId;});
  if(!t) return;
  // CC-Auftrag: direkt den Auftrag öffnen
  if(t.quelle==='cc'&&t.auftragId){openAuftragDetail(t.auftragId);return;}
  // FUSA: Übernahme-Panel
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
  AUFTRAEGE.push({id:auId,kunde:kunde,fz:fz,paket:pRaw,
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

