// ════════════════════════════════════════════════════════════════════
// CC INTERN — Bootstrap / Globals / Routing / Sync
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/cc-intern-boot.js
// Enthält:  Globale Arrays, DAL-Init, Routing (goPage), SSE/Notif, Export/Import
//
// TODO [Cockpit]: Globale Arrays (AUFTRAEGE, MA_DATA etc.) durch API-Calls befüllen
// TODO [Cockpit]: DAL_USE_API = true + ApiAdapter.configure(COCKPIT_URL, jwt)
// TODO [Cockpit]: DOMContentLoaded → Cockpit-Shell-Lifecycle-Hook ersetzen
// ════════════════════════════════════════════════════════════════════

// ── Globale Variablen & Konstanten ──────────────────────────────────────
let currentPage='dashboard';
const newLabels={dashboard:'',anfragen:'+ Neue Anfrage',angebote:'+ Neues Angebot',auftraege:'+ Neuer Auftrag',kunden:'',crm:'+ Neue Aktivität',produktion:'',lager:'🛒 Bestellung',checklisten:'+ Neue Vorlage',mitarbeiter:'',urlaub:'',rechnungen:'+ Rechnung',kalender:'+ Termin anlegen'};



// ── Funktionen ───────────────────────────────────────────────────────────

// ── goPage ──
function goPage(id,el,title,sub){
  // Alle Modals schließen beim Seitenwechsel
  document.querySelectorAll('.modal-ov').forEach(function(m){ m.classList.remove('open'); });

  currentPage=id;
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('active'));
  document.getElementById('pg-'+id).classList.add('active');
  document.getElementById('tbTitle').textContent=title;
  document.getElementById('tbSub').textContent=sub;
  document.querySelectorAll('.sb-link').forEach(l=>l.classList.remove('active'));
  if(el) el.classList.add('active');
  else document.querySelectorAll('.sb-link').forEach(l=>{if(l.getAttribute('onclick')&&l.getAttribute('onclick').includes("'"+id+"'"))l.classList.add('active');});
  var _nb=document.getElementById('newBtn');
  var _nl=newLabels[id]||'';
  _nb.textContent=_nl||'+ Neu';
  _nb.style.display=_nl?'':'none';
  // Scroll zurück nach oben — alle Container
  var contentEl=document.querySelector('.content');
  if(contentEl){ contentEl.scrollTop=0; contentEl.scrollLeft=0; }
  var pgEl=document.getElementById('pg-'+id);
  if(pgEl){ pgEl.scrollTop=0; }
  window.scrollTo(0,0);
  requestAnimationFrame(function(){ if(contentEl) contentEl.scrollTop=0; });
  if(id==='auftraege')   { renderAuftragVerwaltung(); }
  if(id==='crm')         { renderCrmPipeline(); renderAktivitaeten(); crmTab('pipeline'); }
  if(id==='kunden')      { renderKunden(); }
  if(id==='produktion')  { renderKanban(); }
  if(id==='anfragen')  renderAnfragen();
  if(id==='angebote')  renderAngebote();
  if(id==='lager')       renderLagerCC();
  if(id==='mitarbeiter') renderMitarbeiter();
  if(id==='kalender')    { ccCalLoad(); buildCCCalendar(); }
  if(id==='checklisten') { renderChecklisten(); }
  if(id==='urlaub')      { renderUrlaubAntraege(); }
  if(id==='newBtn'||id==='checklisten') document.getElementById('newBtn').textContent=newLabels[id]||'+ Neu';
}

// ── handleNew ──
function handleNew(){
  if(currentPage==='angebote')    { agModalOpen(null); return; }
  if(currentPage==='auftraege')   { openAuftragModal(); return; }
  if(currentPage==='crm')         { openAktivModal(null); return; }
  if(currentPage==='rechnungen')  { openRechnungModal(null); return; }
  if(currentPage==='anfragen')    { anfNeuModal(); return; }
  if(currentPage==='checklisten') { clNeuModal(); return; }
  if(currentPage==='lager')       { lagerArtikelModal(-1); return; }
  showToast('+ Neu');
}

// ── showToast ──
function showToast(msg){
  var el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  if(_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ el.style.opacity='0'; }, 3000);
}

// ── saveLieferanten ──
function saveLieferanten(){
  window.CCIntern.DataService.save(DAL_KEY_LIEFERANTEN, LIEFERANTEN);
}

// ── loadLieferanten ──
function loadLieferanten(){
  var s = window.CCIntern.DataService.load(DAL_KEY_LIEFERANTEN, null);
  if(s && Array.isArray(s) && s.length){ LIEFERANTEN = s; }
}

// ── saveLager ──
function saveLager(){
  window.CCIntern.DataService.save(DAL_KEY_LAGER, LAGER_CC);
}

// ── loadLager ──
function loadLager(){
  var s = window.CCIntern.DataService.load(DAL_KEY_LAGER, null);
  if(s && Array.isArray(s) && s.length){
    LAGER_CC.length = 0;
    s.forEach(function(item){
      if(item.bestellt === undefined) item.bestellt = 0; // Migration
      LAGER_CC.push(item);
    });
  }
}

// ── saveAnwesenheit ──
function saveAnwesenheit(){
  window.CCIntern.DataService.save(DAL_KEY_ANWESENHEIT, MA_ANWESENHEIT);
}

// ── loadAnwesenheit ──
function loadAnwesenheit(cb){
  var s=window.CCIntern.DataService.load(DAL_KEY_ANWESENHEIT,null);
  if(s&&Array.isArray(s)){ MA_ANWESENHEIT.length=0; s.forEach(function(x){MA_ANWESENHEIT.push(x);}); }
  if(cb) cb();
}

// ── saveUrlaub ──
function saveUrlaub(){
  window.CCIntern.DataService.save(DAL_KEY_URLAUB, URLAUB_ANTRAEGE);
}

// ── loadUrlaub ──
function loadUrlaub(cb){
  // Auch alte mob_urlaub_antraege migrieren
  var alt=[];
  try{ alt=JSON.parse(localStorage.getItem('mob_urlaub_antraege')||'[]'); }catch(e){}
  var s=window.CCIntern.DataService.load(DAL_KEY_URLAUB,null);
  if(s&&Array.isArray(s)){ URLAUB_ANTRAEGE.length=0; s.forEach(function(x){URLAUB_ANTRAEGE.push(x);}); }
  // Migration: alte Einträge übernehmen falls noch nicht vorhanden
  alt.forEach(function(a){
    if(!URLAUB_ANTRAEGE.find(function(x){return x.erstellt===a.ts;})){
      URLAUB_ANTRAEGE.push({id:'URL-'+Date.now(),maId:a.maId,ma:a.ma,typ:a.typ,von:a.von,bis:a.bis,notiz:a.notiz||'',status:'offen',erstellt:a.ts||new Date().toISOString()});
    }
  });
  if(cb) cb();
}

// ── saveLeads ──
function saveLeads(){
  window.CCIntern.DataService.save(DAL_KEY_LEADS, LEADS);
}

// ── loadLeads ──
function loadLeads(cb){
  var s=window.CCIntern.DataService.load(DAL_KEY_LEADS,null);
  if(s&&Array.isArray(s)){ LEADS.length=0; s.forEach(function(x){LEADS.push(x);}); }
  if(cb) cb();
}

// ── loadAuftraege ──
function loadAuftraege(callback){
  window.CCIntern.DataService.loadAsync(DAL_KEY_AUFTRAEGE, null, function(err, data){
    if(!err && data && Array.isArray(data) && data.length > 0){
      // Lokale Aufträge (localStorage) die der Server noch nicht kennt → retten
      var localRaw = window.CCIntern.LocalStorageAdapter
        ? window.CCIntern.LocalStorageAdapter.load(DAL_KEY_AUFTRAEGE, [])
        : [];
      var serverIds = {};
      data.forEach(function(a){ if(a.id) serverIds[a.id] = true; });
      var nurLokal = (localRaw||[]).filter(function(a){ return a.id && !serverIds[a.id]; });

      // Gespeicherte Daten übernehmen (überschreiben Demo-Daten)
      AUFTRAEGE.length = 0;
      data.forEach(function(a){ AUFTRAEGE.push(a); });

      // Lokal vorhandene, nicht-gespeicherte Aufträge anhängen + nachsynken
      if(nurLokal.length){
        console.warn('loadAuftraege: '+nurLokal.length+' lokale Aufträge nicht auf Server — werden zusammengeführt:', nurLokal.map(function(a){return a.id;}));
        nurLokal.forEach(function(a){ AUFTRAEGE.push(a); });
        saveAuftraege(); // sofort an Server nachsynken
      }
    }
    // Keine gespeicherten Daten → Demo-Daten bleiben (beim ersten Start)
    // ── Migration: rechnung='geschrieben' → archiv=true (einmalig) ────
    var migrated = 0;
    AUFTRAEGE.forEach(function(a){
      if(a.rechnung === 'geschrieben' && !a.archiv){
        a.archiv = true;
        if(!a.archivDatum) a.archivDatum = a.terminDatum || new Date().toISOString();
        migrated++;
      }
    });
    if(migrated > 0){ saveAuftraege(); }
    // ──────────────────────────────────────────────────────────────────
    auNrRecalculate(); // Nächste freie Auftragsnummer berechnen (verhindert Duplikate)
    if(callback) callback();
  });
}

// ── saveAuftraege ──
function saveAuftraege(){
  // Debounce: speichert frühestens 500ms nach letztem Aufruf
  if(DAL_SAVE_DEBOUNCE) clearTimeout(DAL_SAVE_DEBOUNCE);
  DAL_SAVE_DEBOUNCE = setTimeout(function(){
    window.CCIntern.DataService.save(DAL_KEY_AUFTRAEGE, AUFTRAEGE);
    DAL_SAVE_DEBOUNCE = null;
  }, 500);
}

// ── saveAufgaben ──
function saveAufgaben(){
  window.CCIntern.DataService.save(DAL_KEY_AUFGABEN, INTERN_AUFGABEN);
}

// ── loadAufgaben ──
function loadAufgaben(callback){
  window.CCIntern.DataService.loadAsync(DAL_KEY_AUFGABEN, null, function(err, data){
    if(!err && data && Array.isArray(data)){
      INTERN_AUFGABEN.length = 0;
      data.forEach(function(a){ INTERN_AUFGABEN.push(a); });
    }
    if(callback) callback();
  });
}

// ── loadFusaTermine ──
function loadFusaTermine(callback){
  window.CCIntern.DataService.loadAsync(DAL_KEY_FUSA, null, function(err, data){
    if(!err && data && Array.isArray(data)){
      // Gespeicherte FUSA-Daten übernehmen
      CC_FUSA_TERMINE.length = 0;
      data.forEach(function(t){ CC_FUSA_TERMINE.push(t); });
    } else {
      // Fallback: altes FUSA-Format (fusa_v1) lesen
      var oldRaw = null;
      try { oldRaw = localStorage.getItem('fusa_v1'); } catch(e){}
      if(oldRaw){
        try {
          var fusa = JSON.parse(oldRaw);
          var termine = fusa.termine || fusa.montagetermine || [];
          // Nur nicht-übernommene ersetzen
          CC_FUSA_TERMINE = CC_FUSA_TERMINE.filter(function(f){ return f.auftragId; });
          termine.forEach(function(t,i){
            var datum = (t.datum||t.date||t.termin_datum||'').substring(0,10);
            if(!datum) return;
            if(CC_FUSA_TERMINE.find(function(x){ return x.id==='F-LS-'+(i+1); })) return;
            CC_FUSA_TERMINE.push({
              id:'F-LS-'+(i+1), datum:datum,
              titel:t.bezeichnung||t.titel||t.title||'FUSA-Termin',
              depot:t.depot||t.standort||'—',
              monteur:t.monteur||t.mitarbeiter||'—',
              fusaStatus:t.status||'offen',
              auftragId:t.auftragId||null,
            });
          });
        } catch(e){}
      }
    }
    if(callback) callback();
  });
}

// ── saveFusaTermine ──
function saveFusaTermine(){
  window.CCIntern.DataService.save(DAL_KEY_FUSA, CC_FUSA_TERMINE);
}

// ── loadMitarbeiter ──
function loadMitarbeiter(callback){
  window.CCIntern.DataService.loadAsync(DAL_KEY_MA, null, function(err, data){
    if(!err && data && Array.isArray(data) && data.length > 0){
      MA_DATA.length = 0;
      data.forEach(function(m){ MA_DATA.push(m); });
    }
    if(callback) callback();
  });
}

// ── saveMitarbeiter ──
function saveMitarbeiter(){
  // Nur Stammdaten speichern — keine berechneten Werte
  var stamm = MA_DATA.map(function(m){
    return {maId:m.maId, n:m.n, r:m.r, av:m.av, col:m.col, soll:m.soll, urlaub:m.urlaub};
  });
  window.CCIntern.DataService.save(DAL_KEY_MA, stamm);
}

// ── dalInit ──
function dalInit(){
  loadAuftraege(function(){
    loadFusaTermine(function(){
      loadMitarbeiter(function(){
        loadAufgaben(function(){
          loadAnwesenheit(function(){
            loadUrlaub(function(){
              loadLeads(function(){
                loadLager();         // Lager aus localStorage (gemeinsam App + Desktop)
                loadLieferanten();   // Lieferanten
                if(INTERN_AUFGABEN.length > 0) aufgabenNr = INTERN_AUFGABEN.length + 1;
                clMigrierAlle();         // Checklisten aus Produkt-Templates nachrüsten
                mobAufgabenNacherzeugen();
                seedAktivitaeten();
                renderKanban();
                if(typeof renderMitarbeiter === 'function') renderMitarbeiter();
                // Chat: Glocke und offene Fragen beim Start initialisieren
                if(typeof updateGlocke === 'function') updateGlocke();
              });
            });
          });
        });
      });
    });
  });
}

// ── dalPatchAuftraege ──
function dalPatchAuftraege(){
  // Patcht AUFTRAEGE.push damit saveAuftraege() automatisch aufgerufen wird
  // Nur einmal patchen
  if(_origAuftragePush) return;
  _origAuftragePush = AUFTRAEGE.push.bind(AUFTRAEGE);
  AUFTRAEGE.push = function(){
    var result = _origAuftragePush.apply(AUFTRAEGE, arguments);
    saveAuftraege();
    return result;
  };
}

// ── naechsterArbeitstag ──
function naechsterArbeitstag(isoDate){
  var d = new Date(isoDate);
  d.setDate(d.getDate() + 1);
  // Wochenende überspringen
  while(d.getDay()===0 || d.getDay()===6) d.setDate(d.getDate()+1);
  return d.toISOString().split('T')[0];
}

// ── ccSelbsttest ──
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

// ── ccExport ──
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

// ── ccImport ──
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

// ── ccSyncInit ──
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

// ── ccSseConnect ──
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

// ── ccPollStart ──
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

// ── ccSyncReloadCollection ──
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

// ── ccNotifLaden ──
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

// ── ccNotifBadgeUpdate ──
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

// ── ccNotifToggle ──
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

// ── ccNotifRender ──
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

// ── ccNotifClear ──
function ccNotifClear() {
  CC_NOTIF_DATA = [];
  ccNotifBadgeUpdate();
  ccNotifRender();
  var apiBase = window.location.protocol !== 'file:' ? window.location.origin + '/api' : null;
  if (apiBase) {
    fetch(apiBase + '/notifications/clear', { method: 'POST' }).catch(function(){});
  }
}

// ── ccSyncSetStatus ──
function ccSyncSetStatus(online, text) {
  var dot  = document.getElementById('cc-sync-dot');
  var txt  = document.getElementById('cc-sync-text');
  if (dot) dot.style.background = online ? '#34C759' : '#FF3B30';
  if (txt) txt.textContent = text || '';
}

