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

var _toastTimer = null;
/** Wird in `dalPatchAuftraege` gesetzt — Original-`AUFTRAEGE.push` */
var _origAuftragePush = null;
var CC_SYNC_ACTIVE  = false;
var CC_SYNC_VERSION = 0;
var CC_SSE_SOURCE   = null;
var CC_POLL_TIMER   = null;
var CC_NOTIF_DATA   = [];
var CC_NOTIF_OPEN   = false;
var CC_NOTIF_LAST_SEEN = '';
var CC_NOTIF_LABELS = {
  auftraege:   '📋 Auftrag',
  aufgaben:    '✅ Aufgabe',
  urlaub:      '🏖 Urlaub',
  anwesenheit: '⏱ Anwesenheit',
  lager:       '📦 Lager',
  mitarbeiter: '👤 Mitarbeiter',
};
window._ccPanelState = window._ccPanelState || {};
/** In-Memory-Cache der Vorlagen aus GET /api/v1/checklisten (Cockpit). Keine zweite Datenquelle. */
var CL_VORLAGEN = [];
if (typeof window !== 'undefined') window.CL_VORLAGEN = CL_VORLAGEN;

// ── Funktionen ───────────────────────────────────────────────────────────

// ── goPage ──
/** @param {number} [_retry] intern — Wiederholungen wenn Shell noch nicht im DOM (Cockpit-Mount) */
function goPage(id, el, title, sub, _retry) {
  // Alle Modals schließen beim Seitenwechsel
  document.querySelectorAll('.modal-ov').forEach(function(m){ m.classList.remove('open'); });

  currentPage = id;
  var attempt = _retry == null ? 0 : _retry;
  /** CC-Intern-Shell (Cockpit-Mount) — nicht mit anderen `.pg` im Dokument vermischen */
  var _ccRoot = document.querySelector('.cc-intern-root') || document;
  var _pg = _ccRoot.querySelector('#pg-' + id) || document.getElementById('pg-' + id);
  if (!_pg) {
    if (attempt < 40) {
      setTimeout(function () {
        goPage(id, el, title, sub, attempt + 1);
      }, 50);
    } else {
      console.warn(
        '[goPage] #pg-' + id + ' nach Wiederholungen nicht gefunden. cc-intern-root:',
        _ccRoot && _ccRoot.className,
        'retry:',
        attempt,
      );
    }
    return;
  }

  _ccRoot.querySelectorAll('.pg').forEach(function (p) {
    p.classList.remove('active');
  });
  _pg.classList.add('active');
  var _tbT = _ccRoot.querySelector('#tbTitle') || document.getElementById('tbTitle');
  var _tbS = _ccRoot.querySelector('#tbSub') || document.getElementById('tbSub');
  if (_tbT) _tbT.textContent = title;
  if (_tbS) _tbS.textContent = sub;
  _ccRoot.querySelectorAll('.sb-link').forEach(function(l){ l.classList.remove('active'); });
  if(el) el.classList.add('active');
  else _ccRoot.querySelectorAll('.sb-link').forEach(function(l){if(l.getAttribute('onclick')&&l.getAttribute('onclick').includes("'"+id+"'"))l.classList.add('active');});
  var _nb=_ccRoot.querySelector('#newBtn') || document.getElementById('newBtn');
  var _nl=newLabels[id]||'';
  if (_nb) {
    _nb.textContent=_nl||'+ Neu';
    _nb.style.display=_nl?'':'none';
  }
  // Scroll zurück nach oben — alle Container
  var contentEl=_ccRoot.querySelector('.content') || document.querySelector('.cc-intern-root .content');
  if(contentEl){ contentEl.scrollTop=0; contentEl.scrollLeft=0; }
  var pgEl=_pg;
  if(pgEl){ pgEl.scrollTop=0; }
  window.scrollTo(0,0);
  requestAnimationFrame(function(){ if(contentEl) contentEl.scrollTop=0; });
  if(id==='auftraege')   { renderAuftragVerwaltung(); }
  if(id==='crm')         { renderCrmPipeline(); renderAktivitaeten(); crmTab('pipeline'); }
  if(id==='kunden')      { renderKunden(); }
  if(id==='produktion')  { if(typeof renderProduktion==='function') renderProduktion(); else if(typeof renderKanban==='function') renderKanban(); }
  if(id==='anfragen')  renderAnfragen();
  if(id==='angebote')  renderAngebote();
  if(id==='lager')       renderLagerCC();
  if(id==='mitarbeiter') renderMitarbeiter();
  if (id === 'kalender') {
    ccCalLoad();
  }
  if (id === 'checklisten') {
    if (
      window.__CCINTERN_COCKPIT_MOUNT__ &&
      window.CCIntern &&
      window.CCIntern.cockpitApi &&
      typeof window.CCIntern.cockpitApi.reloadChecklistenVorlagenFromApi === 'function'
    ) {
      window.CCIntern.cockpitApi.reloadChecklistenVorlagenFromApi(null).then(function () {
        if (typeof renderChecklisten === 'function') renderChecklisten();
      });
    } else if (typeof renderChecklisten === 'function') {
      renderChecklisten();
    }
  }
  if(id==='urlaub')      { renderUrlaubAntraege(); }
  if(id==='mobil') {
    setTimeout(function() {
      if (typeof mobInit === 'function') mobInit();
    }, 50);
  }
  if(id==='rechnungen'){
    setTimeout(function(){
      if(typeof loadRechnungen==='function') loadRechnungen();
      if(typeof renderRechnungen==='function') renderRechnungen();
      if(typeof reUpdateStats==='function') reUpdateStats();
      if(typeof renderLexwareQueue==='function') renderLexwareQueue();
    }, 50);
  }
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

window.ccInternConfirm = function(message, onYes, onNo){
  onYes = onYes || function(){};
  onNo = onNo || function(){};
  var ov = document.getElementById('cc-intern-confirm-ov');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'cc-intern-confirm-ov';
    ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.45);align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    ov.innerHTML = '<div style="max-width:420px;width:100%;background:#fff;border-radius:14px;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.22);"><div id="cc-intern-confirm-msg" style="font-size:14px;line-height:1.5;color:#111;white-space:pre-wrap;"></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;"><button type="button" id="cc-intern-confirm-no" class="btn">Abbrechen</button><button type="button" id="cc-intern-confirm-yes" class="btn p">Ja</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#cc-intern-confirm-no').addEventListener('click', function(){
      ov.style.display = 'none';
      if(typeof ov._ccNo === 'function') ov._ccNo();
    });
    ov.querySelector('#cc-intern-confirm-yes').addEventListener('click', function(){
      ov.style.display = 'none';
      if(typeof ov._ccYes === 'function') ov._ccYes();
    });
  }
  ov.querySelector('#cc-intern-confirm-msg').textContent = message || '';
  ov._ccYes = onYes;
  ov._ccNo = onNo;
  ov.style.display = 'flex';
};

window.ccInternPromptTermine = function(a, onApply){
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100003;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
  wrap.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:400px;width:100%;padding:20px;">'
    +'<div style="font-weight:700;margin-bottom:14px;">Termine bearbeiten</div>'
    +'<label style="display:block;font-size:12px;margin-bottom:4px;">Starttermin</label><input type="date" id="cc-term-start" style="width:100%;margin-bottom:12px;padding:8px;border:1px solid #ccc;border-radius:8px;">'
    +'<label style="display:block;font-size:12px;margin-bottom:4px;">Montagetermin (optional)</label><input type="date" id="cc-term-montage" style="width:100%;margin-bottom:12px;padding:8px;border:1px solid #ccc;border-radius:8px;">'
    +'<label style="display:block;font-size:12px;margin-bottom:4px;">Montage-Uhrzeit</label><input type="time" id="cc-term-zeit" style="width:100%;margin-bottom:12px;padding:8px;border:1px solid #ccc;border-radius:8px;">'
    +'<label style="display:block;font-size:12px;margin-bottom:4px;">Liefertermin (optional)</label><input type="date" id="cc-term-liefer" style="width:100%;margin-bottom:18px;padding:8px;border:1px solid #ccc;border-radius:8px;">'
    +'<div style="display:flex;gap:10px;justify-content:flex-end;"><button type="button" id="cc-term-ab" class="btn">Abbrechen</button><button type="button" id="cc-term-ok" class="btn p">Speichern</button></div></div>';
  document.body.appendChild(wrap);
  wrap.querySelector('#cc-term-start').value = (a.terminDatum||'').substring(0,10);
  wrap.querySelector('#cc-term-montage').value = (a.montageDatum||'').substring(0,10);
  var mz = (a.montageZeit||'07:00').substring(0,5);
  wrap.querySelector('#cc-term-zeit').value = mz.length===5?mz:'';
  wrap.querySelector('#cc-term-liefer').value = (a.liefertermin||'').substring(0,10);
  function close(){ wrap.remove(); }
  wrap.querySelector('#cc-term-ab').onclick = close;
  wrap.querySelector('#cc-term-ok').onclick = function(){
    onApply({
      neuStart: wrap.querySelector('#cc-term-start').value,
      neuMontage: wrap.querySelector('#cc-term-montage').value,
      neuZeit: wrap.querySelector('#cc-term-zeit').value,
      neuLiefer: wrap.querySelector('#cc-term-liefer').value,
    });
    close();
  };
};

window.ccInternPromptText = function(title, label, initial, onApply){
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100003;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
  wrap.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:400px;width:100%;padding:20px;">'
    +'<div id="cc-text-title" style="font-weight:700;margin-bottom:10px;"></div>'
    +'<label id="cc-text-lbl" for="cc-text-inp" style="display:block;font-size:12px;margin-bottom:4px;"></label>'
    +'<input type="text" id="cc-text-inp" style="width:100%;margin-bottom:16px;padding:8px;border:1px solid #ccc;border-radius:8px;">'
    +'<div style="display:flex;gap:10px;justify-content:flex-end;"><button type="button" id="cc-text-ab" class="btn">Abbrechen</button><button type="button" id="cc-text-ok" class="btn p">OK</button></div></div>';
  document.body.appendChild(wrap);
  wrap.querySelector('#cc-text-title').textContent = title || 'Eingabe';
  wrap.querySelector('#cc-text-lbl').textContent = label || '';
  var inp = wrap.querySelector('#cc-text-inp');
  inp.value = initial || '';
  function close(){ wrap.remove(); }
  wrap.querySelector('#cc-text-ab').onclick = close;
  wrap.querySelector('#cc-text-ok').onclick = function(){
    var v = inp.value.trim();
    onApply(v);
    close();
  };
  setTimeout(function(){ inp.focus(); inp.select(); }, 50);
};

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
  if (window.__CCINTERN_LAGER_API_OK === true) return;
  // Cockpit: kein Lagerbestand mehr in LocalStorage/DAL — nur /api/v1/lager
  if (window.__CCINTERN_COCKPIT_MOUNT__) return;
  window.CCIntern.DataService.save(DAL_KEY_LAGER, LAGER_CC);
}

// ── loadLager ──
function loadLager(callback){
  function _afterLoad() {
    if (typeof seedLagerCcIfEmpty === 'function') seedLagerCcIfEmpty();
    if (currentPage === 'lager' && typeof renderLagerCC === 'function') renderLagerCC();
    if (typeof mobRenderLager === 'function') mobRenderLager();
    if (callback) callback();
  }
  if (
    window.__CCINTERN_COCKPIT_MOUNT__ &&
    window.CCIntern &&
    window.CCIntern.cockpitApi &&
    typeof window.CCIntern.cockpitApi.reloadLagerFromApiIntoLagCc === 'function'
  ) {
    var st = typeof showToast === 'function' ? showToast : null;
    window.CCIntern.cockpitApi
      .reloadLagerFromApiIntoLagCc(st)
      .then(function (ok) {
        if (ok) {
          _afterLoad();
          return;
        }
        window.__CCINTERN_LAGER_API_OK = false;
        if (window.__CCINTERN_COCKPIT_MOUNT__) {
          LAGER_CC.length = 0;
          _afterLoad();
          return;
        }
        window.CCIntern.DataService.loadAsync(DAL_KEY_LAGER, null, function (err, s) {
          if (!err && s && Array.isArray(s) && s.length) {
            LAGER_CC.length = 0;
            s.forEach(function (item) {
              if (item.bestellt === undefined) item.bestellt = 0;
              LAGER_CC.push(item);
            });
          }
          _afterLoad();
        });
      })
      .catch(function () {
        window.__CCINTERN_LAGER_API_OK = false;
        if (window.__CCINTERN_COCKPIT_MOUNT__) {
          LAGER_CC.length = 0;
          _afterLoad();
          return;
        }
        window.CCIntern.DataService.loadAsync(DAL_KEY_LAGER, null, function (err, s) {
          if (!err && s && Array.isArray(s) && s.length) {
            LAGER_CC.length = 0;
            s.forEach(function (item) {
              if (item.bestellt === undefined) item.bestellt = 0;
              LAGER_CC.push(item);
            });
          }
          _afterLoad();
        });
      });
    return;
  }
  window.__CCINTERN_LAGER_API_OK = false;
  window.CCIntern.DataService.loadAsync(DAL_KEY_LAGER, null, function (err, s) {
    if (!err && s && Array.isArray(s) && s.length) {
      LAGER_CC.length = 0;
      s.forEach(function (item) {
        if (item.bestellt === undefined) item.bestellt = 0;
        LAGER_CC.push(item);
      });
    }
    _afterLoad();
  });
}

// ── saveAnwesenheit ──
function saveAnwesenheit(){
  if (window.__CCINTERN_COCKPIT_MOUNT__) return;
  window.CCIntern.DataService.save(DAL_KEY_ANWESENHEIT, MA_ANWESENHEIT);
}

// ── loadAnwesenheit ──
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

// ── saveUrlaub ──
function saveUrlaub(){
  if (window.__CCINTERN_COCKPIT_MOUNT__) return;
  window.CCIntern.DataService.save(DAL_KEY_URLAUB, URLAUB_ANTRAEGE);
}

// ── loadUrlaub ──
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

// ── loadAuftraege ── (nur Cockpit-API → siehe ccintern-cockpit-api.js runLoadAuftraegeFromApi)
function loadAuftraege(callback){
  var st = typeof showToast === 'function' ? showToast : null;
  var api = window.CCIntern && window.CCIntern.cockpitApi;
  if (api && typeof api.runLoadAuftraegeFromApi === 'function') {
    api.runLoadAuftraegeFromApi(st, callback);
    return;
  }
  console.error('[CC Intern] loadAuftraege: cockpitApi.runLoadAuftraegeFromApi fehlt — keine Auftragsdaten geladen.');
  if (st) st('⚠ Aufträge: Kein API-Kontext — bitte über Cockpit öffnen.');
  if (callback) callback(new Error('no-cockpit-api'));
}

// ── saveAuftraege ── (nur Cockpit-API → siehe runSaveAuftraege)
// Kein persistAuftraegeImmediate hier: hasNew in scheduleSaveAuftraege triggert Flush; sonst 500ms-Debounce. Vermeidet doppelte Flushes + Reload-Stürme.
function saveAuftraege(showToast, auftragIdHint){
  var st = typeof showToast === 'function' ? showToast : null;
  var api = window.CCIntern && window.CCIntern.cockpitApi;
  if (api && typeof api.runSaveAuftraege === 'function') {
    return api.runSaveAuftraege(st, auftragIdHint);
  }
  console.error('[CC Intern] saveAuftraege: cockpitApi.runSaveAuftraege fehlt — nichts gespeichert.');
  if (st) st('⚠ Aufträge: Kein API-Kontext — Speichern abgebrochen.');
  return false;
}

// ── saveAufgaben ──
function saveAufgaben(){
  window.CCIntern.DataService.save(DAL_KEY_AUFGABEN, INTERN_AUFGABEN);
}

// ── loadAufgaben ──
function loadAufgaben(callback){
  if (window.__CCINTERN_COCKPIT_MOUNT__) {
    if (callback) callback();
    return;
  }
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
      CC_FUSA_TERMINE.length = 0;
      data.forEach(function(t){ CC_FUSA_TERMINE.push(t); });
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
  if (window.__CCINTERN_COCKPIT_MOUNT__ && window.CCIntern && window.CCIntern.cockpitApi) {
    window.CCIntern.cockpitApi.reloadUsersFromApiIntoMaTarget(typeof showToast === 'function' ? showToast : null).then(function () {
      if (callback) callback();
    });
    return;
  }
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
  // Cockpit: Persistenz nur über maSaveSettings → cockpitApi.saveMitarbeiterToApi (nicht bei Import usw.)
  if (window.__CCINTERN_COCKPIT_MOUNT__) {
    return;
  }
  // Nur Stammdaten speichern — keine berechneten Werte
  var stamm = MA_DATA.map(function(m){
    return {maId:m.maId, n:m.n, r:m.r, av:m.av, col:m.col, soll:m.soll, urlaub:m.urlaub};
  });
  window.CCIntern.DataService.save(DAL_KEY_MA, stamm);
}

// ── dalInit ──
function dalInit(){
  if (window.__CCINTERN_DAL_INIT_DONE) return;
  window.__CCINTERN_DAL_INIT_DONE = true;
  if (typeof dalPatchAuftraege === 'function') {
    try {
      dalPatchAuftraege();
    } catch (e) {
      console.error('[CC Intern] dalPatchAuftraege (beim DAL-Start) fehlgeschlagen', e);
    }
  }
  loadAuftraege(function(){
    loadFusaTermine(function(){
      loadMitarbeiter(function(){
        if (typeof window.mobReapplyCockpitOrTestMa === 'function') {
          try { window.mobReapplyCockpitOrTestMa(); } catch (e) {}
        }
        function dalNachAufgabenChain(){
          loadAnwesenheit(function(){
            loadUrlaub(function(){
              loadLeads(function(){
                loadLager(function(){
                loadLieferanten();
                if (typeof loadRechnungen === 'function') loadRechnungen();
                if(INTERN_AUFGABEN.length > 0) aufgabenNr = INTERN_AUFGABEN.length + 1;
                clMigrierAlle();
                mobAufgabenNacherzeugen();
                renderKanban();
                if(typeof renderMitarbeiter === 'function') renderMitarbeiter();
                // Chat: Glocke und offene Fragen beim Start initialisieren
                if(typeof updateGlocke === 'function') updateGlocke();
                });
              });
            });
          });
        }
        if (window.__CCINTERN_COCKPIT_MOUNT__) {
          dalNachAufgabenChain();
        } else {
          loadAufgaben(dalNachAufgabenChain);
        }
      });
    });
  });
}

// ── dalPatchAuftraege ──
// Kein automatisches saveAuftraege bei push: würde bei Import (N× push) N Flushes auslösen und submitAuftraege doppelt. Nach Änderung explizit saveAuftraege() aufrufen.
function dalPatchAuftraege(){
  if(_origAuftragePush) return;
  _origAuftragePush = AUFTRAEGE.push.bind(AUFTRAEGE);
  AUFTRAEGE.push = function(){
    return _origAuftragePush.apply(AUFTRAEGE, arguments);
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
      ccInternConfirm(confirm_text, function(){
      AUFTRAEGE.length = 0;
      data.auftraege.forEach(function(a){ AUFTRAEGE.push(a); });

      if(data.fusa && Array.isArray(data.fusa)){
        CC_FUSA_TERME = CC_FUSA_TERMINE;
        CC_FUSA_TERMINE.length = 0;
        data.fusa.forEach(function(t){ CC_FUSA_TERMINE.push(t); });
      }

      if(data.mitarbeiter && Array.isArray(data.mitarbeiter) && data.mitarbeiter.length > 0){
        MA_DATA.length = 0;
        data.mitarbeiter.forEach(function(m){ MA_DATA.push(m); });
      }

      saveAuftraege();
      saveFusaTermine();
      saveMitarbeiter();

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
  if (collection === 'aufgaben' && window.__CCINTERN_COCKPIT_MOUNT__) {
    return;
  }
  fetch(apiBase + '/' + collection)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!Array.isArray(data)) return;
      // In-Memory aktualisieren + localStorage-Cache
      if (collection === 'auftraege') {
        if (
          window.__CCINTERN_COCKPIT_MOUNT__ &&
          window.CCIntern &&
          window.CCIntern.cockpitApi &&
          typeof window.CCIntern.cockpitApi.reloadAuftraegeFromApiIntoMemory === 'function'
        ) {
          window.CCIntern.cockpitApi.reloadAuftraegeFromApiIntoMemory(null).then(function () {
            auNrRecalculate();
            renderKanban();
            if (typeof renderAuftragVerwaltung === 'function') renderAuftragVerwaltung();
            if (typeof updateGlocke === 'function') {
              updateGlocke();
            }
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
              var mobDetail = document.getElementById('mob-auftrag-detail');
              if(mobDetail && mobDetail.style.display!=='none' && typeof MOB_AKTIV_AUF !== 'undefined' && MOB_AKTIV_AUF){
                renderChatBereich(MOB_AKTIV_AUF, 'mob-chat-container-'+MOB_AKTIV_AUF);
              }
            })();
          });
          return;
        }
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
        loadLager(function(){
        if (typeof renderLagerCC === 'function') renderLagerCC();
        if (typeof mobRenderLager === 'function') mobRenderLager();
        });
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

// ── Kommunikation (Auftrags-Kommentare / offene Fragen) für Desktop-Glocke ──
function ccNotifEscAttr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function ccNotifAktuellerUserId() {
  if (typeof window !== 'undefined' && window.CURRENT_USER_ID != null && String(window.CURRENT_USER_ID).trim()) {
    return String(window.CURRENT_USER_ID).trim();
  }
  if (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID != null && String(CURRENT_USER_ID).trim()) {
    return String(CURRENT_USER_ID).trim();
  }
  if (typeof ccKommentarAutorUuidFuerSpeichern === 'function') {
    try {
      var resolved = ccKommentarAutorUuidFuerSpeichern();
      if (resolved != null && String(resolved).trim()) return String(resolved).trim();
    } catch (e) { /* */ }
  }
  return '';
}

function ccNotifKommentarIstUngelesen(k, userId) {
  if (!k || !userId) return false;
  var uid = String(userId).trim();
  var autorId = k.autorMaId != null ? String(k.autorMaId).trim() : '';
  if (autorId && autorId === uid) return false;
  if (Array.isArray(k.seenBy)) {
    return !k.seenBy.some(function (seenId) {
      return seenId != null && String(seenId).trim() === uid;
    });
  }
  return true;
}

function ccNotifAuftragNachId(rawId) {
  var wanted = rawId == null ? '' : String(rawId).trim();
  if (!wanted || typeof AUFTRAEGE === 'undefined' || !Array.isArray(AUFTRAEGE)) return null;
  return AUFTRAEGE.find(function (a) {
    return a && [a.id, a.ccApiId, a.auftragsnummer].some(function (candidate) {
      return candidate != null && String(candidate).trim() === wanted;
    });
  }) || null;
}

function ccNotifChatPushIstUngelesen(n, fallback) {
  if (!n || !n.info) return !!fallback;
  var userId = ccNotifAktuellerUserId();
  if (!userId) return !!fallback;
  var a = ccNotifAuftragNachId(n.info.id);
  if (!a || !Array.isArray(a.kommentare)) return !!fallback;
  var pushedText = n.info.text != null ? String(n.info.text).trim() : '';
  var passend = a.kommentare.filter(function (k) {
    if (!k) return false;
    if (!pushedText) return true;
    return String(k.text || '').trim().indexOf(pushedText) === 0;
  });
  var pool = passend.length ? passend : a.kommentare;
  return pool.some(function (k) { return ccNotifKommentarIstUngelesen(k, userId); });
}

/** @returns {number} Ungelesene Auftrags-Kommentare für den angemeldeten Benutzer. */
function ccNotifAnzahlKommunikation() {
  var userId = ccNotifAktuellerUserId();
  if (!userId) return 0;
  var n = 0;
  if (typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE || !AUFTRAEGE.length) return 0;
  AUFTRAEGE.forEach(function (a) {
    var km = Array.isArray(a.kommentare) ? a.kommentare : [];
    km.forEach(function (k) {
      if (ccNotifKommentarIstUngelesen(k, userId)) n++;
    });
  });
  return n;
}

/**
 * @returns {string} HTML-Block: offene Fragen aus AUFTRAEGE (Klick → Auftrag + Chat),
 *  sonst Kurzhinweis wenn es Kommentare gibt (ohne offene Frage).
 */
function ccNotifBuildKommFragenHtml() {
  if (typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE || !AUFTRAEGE.length) return '';
  var offene = [];
  var totalKm = 0;
  var auftraegeMitKommentaren = [];
  AUFTRAEGE.forEach(function (a) {
    var km = a.kommentare || [];
    totalKm += km.length;
    if (km.length) {
      var letzter = km[km.length - 1] || {};
      auftraegeMitKommentaren.push({ a: a, k: letzter, anzahl: km.length });
    }
    km.forEach(function (k) {
      if (k && k.istFrage && !k.beantwortet) offene.push({ a: a, k: k });
    });
  });
  if (!offene.length) {
    if (totalKm < 1) return '';
    auftraegeMitKommentaren.sort(function (x, y) {
      return String(y.k && (y.k.ts || y.k.zeit) || '').localeCompare(String(x.k && (x.k.ts || x.k.zeit) || ''));
    });
    return (
      '<div style="padding:10px 12px;background:#F0F7FF;border-bottom:1px solid var(--border);">'
      + '<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:8px;">💬 Kommunikation in Aufträgen</div>'
      + auftraegeMitKommentaren.slice(0, 10).map(function (item) {
          return ccNotifKommAuftragRowHtml(item.a, item.k, item.anzahl);
        }).join('')
      + '</div>'
    );
  }
  return (
    '<div style="padding:10px 12px;background:#F0F7FF;border-bottom:1px solid var(--border);">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:8px;">'
    + '💬 Offene Fragen (Kommunikation)</div>'
    + offene
        .map(function (item) {
          var a = item.a;
          var k = item.k;
          var ts = k.ts
            ? String(k.ts)
                .substring(0, 16)
                .replace('T', ' ')
            : (k.zeit || '');
          var dataAu = ccNotifEscAttr(a.id);
          return (
            '<div class="cc-notif-conversation is-unread" role="button" tabindex="0" data-cc-au-id="' +
            dataAu +
            '" onclick="ccNotifOpenAuftragKomm(this.getAttribute(\'data-cc-au-id\'))" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();ccNotifOpenAuftragKomm(this.getAttribute(\'data-cc-au-id\'));}" style="padding:8px 10px;border-radius:8px;margin-bottom:6px;cursor:pointer;">'
            + '<div style="display:flex;align-items:center;gap:7px;"><div style="font-size:12px;font-weight:600;min-width:0;flex:1;">' +
            ccNotifEscAttr(a.kunde || '') +
            ' · ' +
            ccNotifEscAttr(a.id) +
            '</div><span class="cc-notif-state">Neu</span></div>'
            + '<div style="font-size:11px;color:var(--text2);margin-top:2px;">' +
            ccNotifEscAttr(k.text || '') +
            '</div>'
            + '<div style="font-size:10px;color:var(--text3);margin-top:2px;">' +
            ccNotifEscAttr(k.autor || '') +
            ' · ' +
            ccNotifEscAttr(ts) +
            '</div>'
            + '</div>'
          );
        })
        .join('') +
    '</div>'
  );
}

/**
 * Fallback-Zeile für persistierte Auftragskommentare, wenn keine Server-Push-Nachricht vorhanden ist.
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} k
 * @param {number} anzahl
 */
function ccNotifKommAuftragRowHtml(a, k, anzahl) {
  var rawId = a && (a.id || a.ccApiId || a.auftragsnummer) ? String(a.id || a.ccApiId || a.auftragsnummer) : '';
  if (!rawId) return '';
  var dataAu = ccNotifEscAttr(rawId);
  var auftragLabel = ccNotifEscAttr(a.auftragsnummer || a.id || 'Auftrag');
  var kunde = ccNotifEscAttr(a.kunde || a.kundenname || '');
  var text = ccNotifEscAttr(k && k.text ? k.text : 'Kommunikation öffnen');
  var userId = ccNotifAktuellerUserId();
  var unread = userId && Array.isArray(a.kommentare)
    ? a.kommentare.filter(function (item) { return ccNotifKommentarIstUngelesen(item, userId); }).length
    : 0;
  var stateClass = unread > 0 ? ' is-unread' : ' is-seen';
  var stateLabel = unread > 0 ? 'Neu · ' + unread : 'Gelesen';
  return (
    '<div class="cc-notif-conversation' + stateClass + '" role="button" tabindex="0" data-cc-au-id="' + dataAu + '" '
    + 'onclick="ccNotifOpenAuftragKomm(this.getAttribute(\'data-cc-au-id\'))" '
    + 'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();ccNotifOpenAuftragKomm(this.getAttribute(\'data-cc-au-id\'));}" '
    + 'style="padding:8px 10px;border-radius:8px;margin-bottom:6px;cursor:pointer;">'
    + '<div style="display:flex;align-items:center;gap:7px;"><div style="font-size:12px;font-weight:600;min-width:0;flex:1;">' + kunde + (kunde ? ' · ' : '') + auftragLabel + '</div>'
    + '<span class="cc-notif-state">' + stateLabel + '</span></div>'
    + '<div style="font-size:11px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + text + '</div>'
    + '<div style="font-size:10px;color:#007AFF;font-weight:600;margin-top:3px;">' + Number(anzahl || 0) + ' Nachricht(en) · Kommunikation öffnen →</div>'
    + '</div>'
  );
}

/**
 * @param {string} auId
 */
async function ccNotifOpenAuftragKomm(auId) {
  var requestedId = auId == null ? '' : String(auId).trim();
  if (!requestedId) return;
  var dd = document.getElementById('cc-notif-dropdown');
  if (dd) dd.style.display = 'none';
  if (typeof CC_NOTIF_OPEN !== 'undefined') CC_NOTIF_OPEN = false;

  function findAuftrag() {
    if (typeof AUFTRAEGE === 'undefined' || !Array.isArray(AUFTRAEGE)) return null;
    return AUFTRAEGE.find(function (a) {
      if (!a) return false;
      return [a.id, a.ccApiId, a.auftragsnummer].some(function (candidate) {
        return candidate != null && String(candidate).trim() === requestedId;
      });
    }) || null;
  }

  var auftrag = findAuftrag();
  if (!auftrag) {
    var api = typeof window !== 'undefined' ? window.CCIntern && window.CCIntern.cockpitApi : null;
    if (api && typeof api.reloadAuftraegeFromApiIntoMemory === 'function') {
      try {
        await api.reloadAuftraegeFromApiIntoMemory(null);
        auftrag = findAuftrag();
      } catch (reloadErr) {
        if (typeof console !== 'undefined' && console.warn) console.warn('[NOTIF_KOMM_RELOAD]', reloadErr);
      }
    }
  }
  var openId = auftrag && auftrag.id != null ? String(auftrag.id) : requestedId;
  try {
    if (typeof goPage === 'function') goPage('auftraege', null, 'Aufträge', 'Auftragsverwaltung');
  } catch (e1) {
    /* optional */
  }

  setTimeout(async function () {
    try {
      if (typeof openAuftragDetail === 'function') await Promise.resolve(openAuftragDetail(openId));
    } catch (e2) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[NOTIF_KOMM_OPEN]', e2);
    }
    [80, 350, 800].forEach(function (delay) {
      setTimeout(function () {
        var c = document.getElementById('chat-container-' + openId);
        if (!c && auftrag && auftrag.ccApiId) c = document.getElementById('chat-container-' + auftrag.ccApiId);
        if (!c) return;
        c.scrollIntoView({ behavior: delay === 80 ? 'auto' : 'smooth', block: 'center' });
        var input = c.querySelector('.chat-input-field');
        if (input && typeof input.focus === 'function') input.focus({ preventScroll: true });
      }, delay);
    });
  }, 60);
}

/** Desktop-Glocke nur für CC-Intern-Desktop, nicht Mitarbeiter-App-only / Invite. */
function ccDesktopKommunikationGlockeSichtbar() {
  if (typeof window !== 'undefined' && window.__CCINTERN_MITARBEITER_APP_BOOT__ === true) return false;
  if (window.CC_SHELL_UI_ACCESS && window.CC_SHELL_UI_ACCESS.isMitarbeiterAppOnlyShell === true) {
    return false;
  }
  return true;
}

// ── ccNotifBadgeUpdate ──
function ccNotifBadgeUpdate() {
  if (!ccDesktopKommunikationGlockeSichtbar()) return;
  var badge = document.getElementById('cc-notif-badge');
  if (!badge) return;
  var unread = CC_NOTIF_DATA.filter(function (n) {
    // Chat-Pushs werden über AUFTRAEGE.kommentare + seenBy gezählt, sonst doppelte Badge-Zahl.
    return n.action !== 'chat' && n.ts > CC_NOTIF_LAST_SEEN;
  }).length;
  var commN = ccNotifAnzahlKommunikation();
  var total = unread + commN;
  badge.textContent = total > 99 ? '99+' : String(total);
  badge.style.display = '';
  if (total > 0) {
    var btn = document.getElementById('cc-notif-btn');
    if (btn) {
      btn.style.animation = 'cc-bell-shake 0.4s ease';
      setTimeout(function () {
        btn.style.animation = '';
      }, 500);
    }
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
    CC_NOTIF_LAST_SEEN = new Date().toISOString();
    ccNotifBadgeUpdate();
  }
}

// ── ccNotifRender ──
function ccNotifRender() {
  var list = document.getElementById('cc-notif-list');
  if (!list) return;
  var commHtml = ccNotifBuildKommFragenHtml();
  if (!CC_NOTIF_DATA.length && !commHtml) {
    list.innerHTML =
      '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">Keine Benachrichtigungen</div>';
    return;
  }
  var serverHtml = CC_NOTIF_DATA.slice(0, 30).map(function(n) {
    var ts    = n.ts ? n.ts.substring(0, 16).replace('T', ' ') : '';
    var isNew = n.ts > CC_NOTIF_LAST_SEEN;
    var rowUnread = n.action === 'chat' ? ccNotifChatPushIstUngelesen(n, isNew) : isNew;
    var dotHtml = rowUnread
      ? '<div style="width:6px;height:6px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:5px;"></div>'
      : '<div style="width:6px;height:6px;border-radius:50%;background:#A8B4C0;flex-shrink:0;margin-top:5px;"></div>';
    var bodyHtml;
    if (n.action === 'chat' && n.info) {
      // Chat-Nachricht: eigenes Template
      var auId   = n.info.id || '';
      var fz     = ccNotifEscAttr(n.info.fz || auId);
      var autor  = ccNotifEscAttr(n.info.autor || '');
      var text   = ccNotifEscAttr(n.info.text || '');
      var kunde  = n.info.kunde ? ' · ' + ccNotifEscAttr(n.info.kunde) : '';
      bodyHtml = '<div style="font-size:12px;font-weight:600;color:var(--text);">💬 ' + fz + kunde + '</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:1px;">' + autor + ' hat geschrieben: &ldquo;' + text + '&rdquo;</div>'
        + '<div style="font-size:10px;color:var(--text3);margin-top:2px;">' + ts + '</div>';
    } else {
      var lbl   = ccNotifEscAttr(CC_NOTIF_LABELS[n.collection] || ('📌 ' + n.collection));
      var info  = ccNotifEscAttr(n.info ? (n.info.fz || n.info.id || '') : '');
      var kunde = n.info && n.info.kunde ? ' · ' + ccNotifEscAttr(n.info.kunde) : '';
      bodyHtml = '<div style="font-size:12px;font-weight:600;color:var(--text);">' + lbl + (info ? ' — ' + info : '') + kunde + '</div>'
        + '<div style="font-size:10px;color:var(--text3);margin-top:2px;">' + ts + '</div>';
    }
    var chatClickAttrs = '';
    var chatRowStyle = '';
    if (n.action === 'chat' && n.info && n.info.id) {
      chatClickAttrs = ' role="button" tabindex="0" data-cc-au-id="' + ccNotifEscAttr(n.info.id) + '"'
        + ' onclick="ccNotifOpenAuftragKomm(this.getAttribute(\'data-cc-au-id\'))"'
        + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();ccNotifOpenAuftragKomm(this.getAttribute(\'data-cc-au-id\'));}"';
      chatRowStyle = 'cursor:pointer;';
    }
    return '<div class="cc-notif-server-row ' + (rowUnread ? 'is-unread' : 'is-seen') + '"' + chatClickAttrs + ' style="padding:10px 14px;border-bottom:1px solid var(--border);'
      + chatRowStyle + 'display:flex;gap:10px;align-items:flex-start;">'
      + dotHtml
      + '<div style="flex:1;min-width:0;">' + bodyHtml + '</div>'
      + '<span class="cc-notif-state">' + (rowUnread ? 'Neu' : 'Gelesen') + '</span>'
    + '</div>';
  }).join('');
  list.innerHTML = commHtml + serverHtml;
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

document.addEventListener('click', function(e) {
  if (typeof CC_NOTIF_OPEN === 'undefined' || !CC_NOTIF_OPEN) return;
  var dd  = document.getElementById('cc-notif-dropdown');
  var btn = document.getElementById('cc-notif-btn');
  if (dd && btn && !dd.contains(e.target) && !btn.contains(e.target)) {
    CC_NOTIF_OPEN = false;
    dd.style.display = 'none';
  }
});
