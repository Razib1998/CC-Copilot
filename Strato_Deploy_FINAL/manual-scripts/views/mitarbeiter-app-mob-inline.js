// AUTO: migration index.html lines 13450-15235
// ── State ──────────────────────────────────────
var MOB_MA_ID   =
  (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('mob_ma_id')) || null; // null = Login nötig
var MOB_TIMER   = null;   // setInterval handle
var MOB_START   = null;   // Date wenn läuft
var MOB_PAUSE   = 0;      // akkumulierte Pausensekunden
var MOB_PAUSED  = false;
var MOB_PAUSE_START = null;
var MOB_TIMER_MA_ID = null; // Besitzer des aktuell laufenden Anwesenheitstimers
/** Eigenes Intervall für „Läuft gerade“ (#mob-lauft-timer) — unabhängig von Arbeitszeit-Pause (MOB_TIMER). */
var MOB_AUFTRAG_UI_IV = null;
var MOB_AKTIV_TAB = 'home';
var MOB_AKTIV_AUF = null; // aktuell geöffneter Auftrag

/** Echter App-only-Login (kein Desktop-Test-Dropdown). */
function mobIsRealMaAppSession() {
  try {
    if (typeof window !== 'undefined') {
      if (window.__CCINTERN_MITARBEITER_APP_BOOT__ === true) return true;
      if (window.CC_SHELL_UI_ACCESS && window.CC_SHELL_UI_ACCESS.isMitarbeiterAppOnlyShell === true) return true;
    }
  } catch (e) {}
  return false;
}

function mobNormalizeEmail(em) {
  return String(em || '').trim().toLowerCase();
}

/**
 * Eingeloggten Cockpit-User → MA_DATA-Eintrag (für MOB_MA_ID / Aufgabenfilter).
 * @param {string|null|undefined} cockpitUserId
 * @returns {{ userId: string, email: string, name: string, matched: object|null, matchVia: string, workingMaId: string, matchedName: string, matchedKuerzel: string, ok: boolean }}
 */
function mobResolveLoggedInMitarbeiter(cockpitUserId) {
  var userId = cockpitUserId != null ? String(cockpitUserId).trim() : '';
  if (!userId && typeof window !== 'undefined' && window.CURRENT_USER_ID != null) {
    userId = String(window.CURRENT_USER_ID).trim();
  }
  var email = '';
  var name = '';
  if (typeof window !== 'undefined' && window.CURRENT_USER_NAME != null) {
    name = String(window.CURRENT_USER_NAME).trim();
  }
  if (typeof window !== 'undefined' && window.COCKPIT_USERS && Array.isArray(window.COCKPIT_USERS)) {
    for (var ui = 0; ui < window.COCKPIT_USERS.length; ui++) {
      var u = window.COCKPIT_USERS[ui];
      if (!u || u.id == null || String(u.id).trim() !== userId) continue;
      if (u.email != null && String(u.email).trim() !== '') email = String(u.email).trim();
      if (u.name != null && String(u.name).trim() !== '') name = String(u.name).trim();
      break;
    }
  }
  var matched = null;
  var matchVia = '';
  if (typeof MA_DATA !== 'undefined' && MA_DATA && MA_DATA.length && userId) {
    var j;
    var m;
    for (j = 0; j < MA_DATA.length; j++) {
      m = MA_DATA[j];
      if (!m) continue;
      if (m.id != null && String(m.id).trim() === userId) {
        matched = m;
        matchVia = 'user_id';
        break;
      }
      if (m.user_id != null && String(m.user_id).trim() === userId) {
        matched = m;
        matchVia = 'user_id';
        break;
      }
    }
    if (!matched && email) {
      var emL = mobNormalizeEmail(email);
      for (j = 0; j < MA_DATA.length; j++) {
        m = MA_DATA[j];
        if (!m || !m.email) continue;
        if (mobNormalizeEmail(m.email) === emL) {
          matched = m;
          matchVia = 'email';
          break;
        }
      }
    }
    if (!matched && name) {
      var nL = name.toLowerCase();
      for (j = 0; j < MA_DATA.length; j++) {
        m = MA_DATA[j];
        if (!m || !m.n) continue;
        if (String(m.n).trim().toLowerCase() === nL) {
          matched = m;
          matchVia = 'name';
          break;
        }
      }
    }
    if (!matched && typeof maDataFindByWorkflowKey === 'function') {
      var hit = maDataFindByWorkflowKey(userId);
      if (hit) {
        matched = hit;
        matchVia = 'workflow_key';
      }
    }
    if (!matched && email && typeof maDataFindByWorkflowKey === 'function') {
      var local = email.split('@')[0];
      if (local) {
        hit = maDataFindByWorkflowKey(local);
        if (hit) {
          matched = hit;
          matchVia = 'email_local';
        }
      }
    }
  }
  if (!matched && userId && typeof window !== 'undefined' && window.COCKPIT_USERS && Array.isArray(window.COCKPIT_USERS)) {
    for (var cu = 0; cu < window.COCKPIT_USERS.length; cu++) {
      var row = window.COCKPIT_USERS[cu];
      if (!row || row.id == null || String(row.id).trim() !== userId) continue;
      var disp =
        row.name != null && String(row.name).trim() !== ''
          ? String(row.name).trim()
          : name || (email && email.indexOf('@') > 0 ? email.split('@')[0] : 'Mitarbeiter');
      var k0 = row.kuerzel != null ? String(row.kuerzel).trim().toUpperCase() : '';
      matched = {
        id: row.id,
        maId: String(row.id),
        n: disp,
        name: disp,
        k: k0,
        email: row.email != null ? String(row.email) : email,
        av: k0 || '?',
        col: '#1565C0',
      };
      matchVia = 'cockpit_users';
      break;
    }
  }
  // Führend: users.id (wie Desktop / ARCHITEKTUR_REGEL §14) — kein Stamm-UUID/Kürzel als MOB_MA_ID.
  var workingMaId = '';
  if (matched) {
    if (matched.id != null && String(matched.id).trim() !== '') {
      workingMaId = String(matched.id).trim();
    } else if (matched.maId != null && String(matched.maId).trim() !== '') {
      workingMaId = String(matched.maId).trim();
    } else if (matched.k != null && String(matched.k).trim() !== '') {
      workingMaId = String(matched.k).trim().toUpperCase();
    } else if (matched.mitarbeiter_id != null && String(matched.mitarbeiter_id).trim() !== '') {
      workingMaId = String(matched.mitarbeiter_id).trim();
    }
  } else if (userId) {
    workingMaId = userId;
  }
  var matchedName = matched ? String(matched.n || matched.name || '').trim() : name;
  var matchedKuerzel = matched && matched.k != null ? String(matched.k).trim() : '';
  return {
    userId: userId,
    email: email,
    name: name,
    matched: matched,
    matchVia: matchVia,
    workingMaId: workingMaId,
    matchedName: matchedName,
    matchedKuerzel: matchedKuerzel,
    ok: !!(userId && workingMaId),
  };
}

/** Nur Diagnose-Logs: Stamm-`mitarbeiter_id` aus MA_DATA (API nutzt `postUrlaubAntragFromUi` → users.id). */
function mobMaStammIdForApi() {
  var mid = MOB_MA_ID;
  if (mid == null || String(mid).trim() === '') return '';
  var m = typeof maByID === 'function' ? maByID(String(mid).trim()) : null;
  if (m && m.mitarbeiter_id != null && String(m.mitarbeiter_id).trim() !== '') {
    return String(m.mitarbeiter_id).trim();
  }
  if (typeof maDataFindByWorkflowKey === 'function') {
    var hit = maDataFindByWorkflowKey(String(mid).trim());
    if (hit && hit.mitarbeiter_id != null && String(hit.mitarbeiter_id).trim() !== '') {
      return String(hit.mitarbeiter_id).trim();
    }
  }
  return String(mid).trim();
}

/** Nur geänderten Auftrag speichern (gleicher Pfad wie Desktop: persistAuftraegeImmediate / runSaveAuftraege mit auftragId). */
function mobSaveAuftrag(auId, showToast){
  if(auId == null || String(auId).trim() === '') return Promise.resolve();
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if(api && typeof api.persistAuftraegeImmediate === 'function'){
    return api.persistAuftraegeImmediate(showToast || null, auId);
  }
  if(typeof saveAuftraege === 'function'){
    saveAuftraege(showToast || null, auId);
  }
  return Promise.resolve();
}

function mobSyncMaAppTestBarVisibility() {
  var row = typeof document !== 'undefined' ? document.getElementById('cc-mob-testrow') : null;
  if (!(row instanceof HTMLElement)) return;
  if (mobIsRealMaAppSession()) {
    row.style.display = 'none';
    row.setAttribute('aria-hidden', 'true');
  } else {
    row.style.display = '';
    row.removeAttribute('aria-hidden');
  }
}

// ── Init beim Seitenwechsel ──────────────────────
function mobInit(){
  mobUhrStart();
  mobDatum();
  mobSyncMaAppTestBarVisibility();
  if (mobIsRealMaAppSession()) {
    if (typeof ccMobTestClear === 'function') ccMobTestClear();
    var appUid =
      typeof window !== 'undefined' && window.CURRENT_USER_ID != null
        ? String(window.CURRENT_USER_ID).trim()
        : '';
    if (appUid && typeof mobApplyCockpitUser === 'function') {
      mobApplyCockpitUser(appUid);
    }
    if (MOB_MA_ID) {
      mobZeitRestore();
      mobRenderHome();
      mobTab('home');
      return;
    }
    mobZeigeLogin();
    return;
  }
  if (typeof ccMobTestRestoreFromSession === 'function') {
    ccMobTestRestoreFromSession();
  }
  if (!MOB_MA_ID) {
    var tId = (typeof ccMobTestGetActiveId === 'function' && ccMobTestGetActiveId()) || '';
    if (tId) {
      MOB_MA_ID = tId;
      try { sessionStorage.setItem('mob_ma_id', tId); } catch (e) {}
    }
  }
  if(!MOB_MA_ID){
    mobZeigeLogin(); return;
  }
  mobSetMA(MOB_MA_ID);
  mobZeitRestore(); // Timer-Status nach Reload wiederherstellen
  mobRenderHome();
  mobTab('home');
  setTimeout(function () { if (typeof window.ccMobTestBarPopulate === 'function') { window.ccMobTestBarPopulate(0); } }, 0);
}

// ── Login: MA-Auswahl beim ersten Start ─────────
function mobZeigeLogin(){
  var hEl=document.getElementById('mob-hallo');
  if (mobIsRealMaAppSession()) {
    if (hEl) hEl.textContent = 'Mitarbeiter-Zuordnung fehlt';
    var homeDivApp = document.getElementById('mob-auftraege');
    if (homeDivApp) {
      homeDivApp.innerHTML =
        '<div style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 2px 8px rgba(0,0,0,.06);">'
        + '<p style="margin:0;font-size:14px;color:#1C1C1E;line-height:1.45;">Dein Zugang konnte keinem Mitarbeiter-Stammdatensatz zugeordnet werden. Bitte Administrator kontaktieren (Stamm / Kürzel / user_id).</p>'
        + '<p style="margin:10px 0 0;font-size:12px;color:#8E8E93;">Konsole: <code>[MA-APP USER MATCH FEHLT]</code></p>'
        + '</div>';
    }
    return;
  }
  if(hEl) hEl.textContent='Wer bist du? 👋';
  var avEl=document.getElementById('mob-avatar');
  if(avEl){ avEl.textContent='?'; avEl.style.background='rgba(255,255,255,.2)'; }
  var homeDiv=document.getElementById('mob-auftraege');
  if(!homeDiv) return;
  homeDiv.innerHTML='<div style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 2px 8px rgba(0,0,0,.06);">'
    +'<div style="font-size:12px;font-weight:700;color:#8E8E93;letter-spacing:.07em;text-transform:uppercase;margin-bottom:12px;">Mitarbeiter wählen</div>'
    +MA_DATA.map(function(m){
      return '<div onclick="mobSetMA(\''+m.maId+'\');mobRenderHome();" '
        +'style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:12px;cursor:pointer;margin-bottom:6px;'
        +'border:1.5px solid #E5E5EA;" '
        +'onmouseover="this.style.background=\'#F2F2F7\'" onmouseout="this.style.background=\'#fff\'">'
        +'<div style="width:36px;height:36px;border-radius:50%;background:'+m.col+';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;">'+m.av+'</div>'
        +'<div><div style="font-size:14px;font-weight:600;color:#1C1C1E;">'+m.n+'</div>'
        +'<div style="font-size:11px;color:#8E8E93;">'+m.r+'</div></div>'
        +'</div>';
    }).join('')
  +'</div>';
}

// ── Datum ────────────────────────────────────────
function mobDatum(){
  var tage=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  var d=new Date();
  var s=tage[d.getDay()]+', '+d.getDate()+'.'+(d.getMonth()+1)+'.'+d.getFullYear();
  var el=document.getElementById('mob-datum'); if(el) el.textContent=s;
}

// ── Workflow ↔ INTERN_AUFGABEN (Referenz: Produktions-Kanban + aktueller Schritt) ──
// Desktop „Produktion“ (renderKanban): eine Karte pro Auftrag in Spalte a.step, nur !a.archiv.
// maAufgaben() filtert INTERN nur über maAufgabeIstFuerMa (g.maId / g.maIds) — ohne
// schritte[a.step].wer / mobSchrittIstFuerMa. Legacy-Zeilen ohne MA-Ids erscheinen dort nicht,
// während Desktop-Produktion & mobDesktopProduktionTaskKeysFuerMa den MA am Schritt sehen.
// mobil: mobInternAufgabenListeFuerMa = maAufgaben-Logik + eingeschränkter Schritt-Fallback
// (nur wenn die INTERN-Zeile keine maId/maIds trägt), plus toleranter Auftrags-Match.
// Regel mobil: nur Zeilen für den aktuellen Workflow-Schritt + Auftrag im Produktions-Pool.
// Abgleich NICHT nur mit rohem String (API/Altbestand: Case, Aliase wie beklebung↔montage).

/** Kanonischer CC-Intern-Produktionsschritt (STEP_LABELS-Keys): Aliase aus UI/API zusammenführen. */
function mobCanonicalWorkflowStep(step){
  if(step == null) return '';
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

/** Schritt-Objekt zu Auftrag + Schrittbezeichnung (toleriert abweichende schritte-Keys / Schreibweise). */
function mobSchrittObjektFuerAuftragUndStep(a, stepRaw){
  if(!a || !a.schritte || stepRaw == null) return null;
  var tryKeys = [stepRaw, mobCanonicalWorkflowStep(stepRaw)];
  var i, k, keys;
  for(i = 0; i < tryKeys.length; i++){
    k = tryKeys[i];
    if(k && a.schritte[k]) return a.schritte[k];
  }
  var c = mobCanonicalWorkflowStep(stepRaw);
  keys = Object.keys(a.schritte);
  for(i = 0; i < keys.length; i++){
    if(mobCanonicalWorkflowStep(keys[i]) === c) return a.schritte[keys[i]];
  }
  return null;
}

/** Auftrags-Id und INTERN.auftragId tolerant vergleichen (Zahl vs. String aus API/Keys). */
function mobAuftragIdsGleich(aid1, aid2){
  if(aid1 == null || aid2 == null) return false;
  return aid1 == aid2 || String(aid1) === String(aid2);
}

/** Auftrag in RAM (id / ccApiId / auftragsnummer-tolerant). */
function mobFindAuftragInRam(auId){
  if(auId == null || typeof AUFTRAEGE === 'undefined' || !Array.isArray(AUFTRAEGE) || !AUFTRAEGE.length) return null;
  var key = String(auId).trim();
  if(!key) return null;
  var found = AUFTRAEGE.find(function(x){
    return x && mobAuftragIdsGleich(x.id, auId);
  });
  if(found) return found;
  return AUFTRAEGE.find(function(x){
    if(!x || !x.ccApiId) return false;
    return String(x.ccApiId) === key;
  }) || null;
}

/** Stamm-, User-UUID und Kürzel für Schritt-Zuordnung (MOB_MA_ID kann Stamm-UUID sein). */
function mobWorkflowMaMatchKeys(maId){
  var keys = [];
  var seen = {};
  function add(k){
    var s = k != null ? String(k).trim() : '';
    if(!s || seen[s]) return;
    seen[s] = true;
    keys.push(s);
  }
  add(maId);
  if(typeof ccInternCollectMaMatchKeys === 'function'){
    var ext = ccInternCollectMaMatchKeys(maId);
    if(ext && ext.length){
      for(var ei = 0; ei < ext.length; ei++) add(ext[ei]);
    }
  } else if(typeof maByID === 'function'){
    var m = maByID(maId);
    if(m){
      add(m.id);
      add(m.maId);
      add(m.mitarbeiter_id);
      if(m.k) add(String(m.k).trim().toUpperCase());
    }
  }
  try {
    if(typeof window !== 'undefined' && window.CURRENT_USER_ID != null){
      add(window.CURRENT_USER_ID);
    }
  } catch(eUid){ void eUid; }
  return keys;
}

/** Diagnose: warum ein Auftrag in mobMeineWorkflowAufgaben enthalten ist oder nicht. */
function maAssignMatchEvaluate(a, maId){
  if(!a) return { included: false, reason: 'no-auftrag' };
  var pool = !!mobAuftragIstCcInternProduktionsPool(a);
  if(!pool){
    var reason = 'not-in-pool';
    if(a.archiv) reason = 'archiv';
    else if(!a.step || mobCanonicalWorkflowStep(a.step) === '') reason = 'no-step';
    else if(!a.schritte || typeof a.schritte !== 'object') reason = 'no-schritte';
    else reason = 'no-schritt-objekt';
    return {
      auftragId: a.id,
      ccApiId: a.ccApiId || null,
      included: false,
      reason: reason,
      step: a.step,
      schritteKeys: a.schritte ? Object.keys(a.schritte) : [],
    };
  }
  var sch = mobSchrittObjektFuerAuftragUndStep(a, a.step);
  var roh = (sch && typeof ccInternSchrittSammleMitarbeiterRohwerte === 'function')
    ? ccInternSchrittSammleMitarbeiterRohwerte(sch) : [];
  var match = !!(typeof mobAuftragSchrittIstFuerMa === 'function' && mobAuftragSchrittIstFuerMa(a, a.step, maId));
  return {
    auftragId: a.id,
    ccApiId: a.ccApiId || null,
    included: match,
    reason: match ? 'step-match' : 'step-no-match',
    mobMaId: maId,
    matchKeys: mobWorkflowMaMatchKeys(maId),
    step: a.step,
    schRohwerte: roh,
    schMaId: sch && sch.maId != null ? sch.maId : null,
    schWer: sch && sch.wer != null ? sch.wer : null,
    schMaIds: sch && Array.isArray(sch.maIds) ? sch.maIds : [],
    kommentareLength: Array.isArray(a.kommentare) ? a.kommentare.length : 0,
  };
}

function mobTaskStatusNorm(status){
  var s = status != null ? String(status).trim() : '';
  if(s === 'erledigt') return 'fertig';
  if(s === 'in_bearbeitung') return 'in_arbeit';
  if(s === 'offen' || s === 'in_arbeit' || s === 'fertig') return s;
  return 'offen';
}

function mobTaskIstFertig(task){
  return mobTaskStatusNorm(task && task.status) === 'fertig';
}

/** CC-Intern Cockpit-Einbettung: Mobile-Aufgaben nur aus AUFTRAEGE/Schritten, nicht aus INTERN_AUFGABEN. */
function mobCcinternCockpitMount(){
  try {
    return typeof window !== 'undefined' && window.__CCINTERN_COCKPIT_MOUNT__ === true;
  } catch (e) {
    return false;
  }
}

function mobWorkflowSchrittReihenfolge(){
  return ['grafik', 'druck', 'laminat', 'montage', 'doku'];
}

function mobMaNameTokens(maId){
  if(maId == null || String(maId).trim() === '') return [];
  var out = [];
  var seen = {};
  function add(v){
    if(v == null) return;
    var s = String(v).trim();
    if(!s) return;
    var key = s.toLowerCase();
    if(seen[key]) return;
    seen[key] = true;
    out.push(s);
  }
  var m = typeof maByID === 'function' ? maByID(maId) : null;
  if(m){
    add(m.k);
    add(m.av);
    add(m.n);
    if(m.n){
      var first = String(m.n).trim().split(/\s+/)[0];
      add(first);
    }
  }
  add(maId);
  return out;
}

function mobStringMatchesMaFallback(raw, maId){
  var s = raw != null ? String(raw).trim() : '';
  if(!s || maId == null || String(maId).trim() === '') return false;
  if(mobMaIdGleichCompat(s, maId)) return true;
  var toks = mobMaNameTokens(maId);
  var low = s.toLowerCase();
  for(var i=0;i<toks.length;i++){
    var t = String(toks[i] || '').trim();
    if(!t) continue;
    if(low === t.toLowerCase()) return true;
  }
  return false;
}

function mobSchrittIstErledigtFuerWorkflow(sch){
  if(!sch || typeof sch !== 'object') return false;
  if(sch.done === true || sch.fertig === true) return true;
  var st = String(sch.status || '').trim().toLowerCase();
  return st === 'abgeschlossen' || st === 'erledigt' || st === 'fertig' || st === 'done';
}

function mobWorkflowStartFreigabe(auId, stepRaw, maId){
  var empty = { ok:false, grund:'Wartet auf vorherige Schritte', fehlende:[] };
  if(!auId || !stepRaw || !maId) return empty;
  if(typeof AUFTRAEGE === 'undefined' || !Array.isArray(AUFTRAEGE)) return empty;
  var a = AUFTRAEGE.find(function(x){ return x && mobAuftragIdsGleich(x.id, auId); });
  if(!a) return empty;
  var stepCanon = mobCanonicalWorkflowStep(stepRaw);
  var currentCanon = mobCanonicalWorkflowStep(a.step || '');
  var istAktuellerSchritt = !!stepCanon && stepCanon === currentCanon;
  var sch = mobSchrittObjektFuerAuftragUndStep(a, stepRaw);
  var mitarbeiterIstDiesemSchrittZugeordnet = !!(typeof mobAuftragSchrittIstFuerMa === 'function' && mobAuftragSchrittIstFuerMa(a, stepRaw, maId));
  var order = mobWorkflowSchrittReihenfolge();
  var idx = order.indexOf(stepCanon);
  var fehlende = [];
  if(idx > 0){
    for(var i=0;i<idx;i++){
      var prevKey = order[i];
      var prevSch = mobSchrittObjektFuerAuftragUndStep(a, prevKey);
      if(!mobSchrittIstErledigtFuerWorkflow(prevSch)){
        var lbl = (typeof STEP_LABELS !== 'undefined' && STEP_LABELS[prevKey] && STEP_LABELS[prevKey].title) ? STEP_LABELS[prevKey].title : prevKey;
        fehlende.push(lbl);
      }
    }
  }
  var vorherigeErledigt = fehlende.length === 0;
  var ok = istAktuellerSchritt && vorherigeErledigt && mitarbeiterIstDiesemSchrittZugeordnet;
  var grund = '';
  if(!mitarbeiterIstDiesemSchrittZugeordnet) grund = 'Kein Zugriff für diesen Schritt';
  else if(!istAktuellerSchritt) grund = 'Wartet auf vorherige Schritte';
  else if(!vorherigeErledigt) grund = 'Wartet auf vorherige Schritte: ' + fehlende.join(' / ');
  return {
    ok: ok,
    grund: grund || '',
    fehlende: fehlende,
    istAktuellerSchritt: istAktuellerSchritt,
    vorherigeErledigt: vorherigeErledigt,
    mitarbeiterIstDiesemSchrittZugeordnet: mitarbeiterIstDiesemSchrittZugeordnet,
  };
}

/** Alle INTERN-Zeilen dieses MAs zu Auftrag + Schritt (kanonischer Schrittvergleich). */
function mobInternAufgabenZeilenFuerMaUndSchritt(auId, stepRaw){
  if(!MOB_MA_ID) return [];
  var sc = mobCanonicalWorkflowStep(stepRaw || '');
  if(mobCcinternCockpitMount()){
    var rows = typeof mobMeineWorkflowAufgaben === 'function' ? mobMeineWorkflowAufgaben(MOB_MA_ID) : [];
    return rows.filter(function(g){
      return g && mobAuftragIdsGleich(g.auftragId, auId) && mobCanonicalWorkflowStep(g.schritt) === sc && mobMaAufgabeIstFuerMa(g, MOB_MA_ID);
    });
  }
  if(typeof INTERN_AUFGABEN === 'undefined' || !INTERN_AUFGABEN.length) return [];
  return INTERN_AUFGABEN.filter(function(g){
    return g && mobAuftragIdsGleich(g.auftragId, auId) && mobCanonicalWorkflowStep(g.schritt) === sc && mobMaAufgabeIstFuerMa(g, MOB_MA_ID);
  });
}

/** Nach Auftrags-Start/Stop: Home, Tab Aufgaben, offene Aufgaben-Detailansicht. */
function mobRefreshNachInternZeit(auId){
  if(typeof renderMitarbeiter === 'function') renderMitarbeiter();
  mobRenderHome();
  if(typeof MOB_AKTIV_TAB !== 'undefined' && MOB_AKTIV_TAB === 'aufgaben') mobRenderAlle();
  var openId = window.__MOB_OPEN_AUFG_ID__;
  if(openId){
    var og = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(openId) : null;
    if(og && mobAuftragIdsGleich(og.auftragId, auId)) mobRenderAufgabeDetailById(openId);
  }
}

/**
 * Auftrags-Zeiterfassung (ZEIT_AKTIV / zeitStart) + eigene INTERN-Aufgabe(n) des MA auf in_arbeit.
 * Nur Zeilen mit mobMaAufgabeIstFuerMa — Team bleibt unverändert.
 */
function mobInternZeitStart(auId, stepRaw){
  var gate = mobWorkflowStartFreigabe(auId, stepRaw, MOB_MA_ID);
  if(!gate.ok){
    if(typeof showToast === 'function') showToast('⛔ ' + (gate.grund || 'Wartet auf vorherige Schritte'));
    return false;
  }
  if(typeof zeitStart === 'function') zeitStart(auId, stepRaw);
  if(mobCcinternCockpitMount()){
    var a = typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, auId); }) : null;
    var sch = a && mobSchrittObjektFuerAuftragUndStep(a, stepRaw);
    if(sch && !mobSchrittIstErledigtFuerWorkflow(sch)){
      sch.status = 'in_bearbeitung';
      mobSaveAuftrag(auId);
    }
    mobRefreshNachInternZeit(auId);
    return true;
  }
  var rows = mobInternAufgabenZeilenFuerMaUndSchritt(auId, stepRaw);
  var changed = false;
  rows.forEach(function(g){
    if(mobTaskIstFertig(g)) return;
    g.status = 'in_arbeit';
    changed = true;
  });
  if(changed && typeof saveAufgaben === 'function') saveAufgaben();
  mobRefreshNachInternZeit(auId);
  return true;
}

/** Stop: nur Timer stoppen; Aufgaben-Status bleibt in_arbeit (Regel). */
function mobInternZeitStop(auId, stepRaw){
  mobStopAuftragsZeitFallsLaeuft(auId, stepRaw);
  mobRefreshNachInternZeit(auId);
}

/** Laufende Auftragszeit zu Auftrag + Schritt stoppen (Schritt kanonisch vergleichen). */
function mobStopAuftragsZeitFallsLaeuft(auId, stepRaw){
  if(typeof ZEIT_AKTIV === 'undefined' || !ZEIT_AKTIV || typeof zeitStop !== 'function') return;
  var sc = mobCanonicalWorkflowStep(stepRaw || '');
  var parseFn = (typeof window !== 'undefined' && typeof window.zeitAktivParseAnyKey === 'function')
    ? window.zeitAktivParseAnyKey
    : null;
  var mob = (typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && String(MOB_MA_ID).trim() !== '')
    ? String(MOB_MA_ID).trim()
    : '';
  Object.keys(ZEIT_AKTIV).forEach(function(k){
    var parsed = parseFn ? parseFn(k) : null;
    if(!parsed) return;
    if(mob && parsed.maId !== mob) return;
    if(!mob && parsed.maId != null) return;
    if(!mobAuftragIdsGleich(parsed.auId, auId)) return;
    if(mobCanonicalWorkflowStep(parsed.step) !== sc) return;
    zeitStop(parsed.auId, parsed.step);
  });
}

function mobIstAuftragsZeitAktivFuerSchritt(auId, stepRaw){
  if(typeof ZEIT_AKTIV === 'undefined' || !ZEIT_AKTIV) return false;
  var sc = mobCanonicalWorkflowStep(stepRaw || '');
  var parseFn = (typeof window !== 'undefined' && typeof window.zeitAktivParseAnyKey === 'function')
    ? window.zeitAktivParseAnyKey
    : null;
  var mob = (typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && String(MOB_MA_ID).trim() !== '')
    ? String(MOB_MA_ID).trim()
    : '';
  return Object.keys(ZEIT_AKTIV).some(function(k){
    var parsed = parseFn ? parseFn(k) : null;
    if(!parsed) return false;
    if(mob && parsed.maId !== mob) return false;
    if(!mob && parsed.maId != null) return false;
    return mobAuftragIdsGleich(parsed.auId, auId) && mobCanonicalWorkflowStep(parsed.step) === sc;
  });
}

/** Kürzel/Name → user-UUID; zuerst `cockpitApi` (ccintern-cockpit-api), sonst globales Fallback aus Auftrags-View. */
function mobMaKuerzelOderIdZuUserUuid(raw){
  try {
    var api = typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi;
    if (api && typeof api.maKuerzelOderIdZuUserUuid === 'function') {
      return api.maKuerzelOderIdZuUserUuid(raw);
    }
  } catch (eMob) {
    void eMob;
  }
  if (typeof maKuerzelOderIdZuUserUuid === 'function') return maKuerzelOderIdZuUserUuid(raw);
  return null;
}

function mobRenderAufgabeDetailById(aufgId){
  var g = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(aufgId) : null;
  if(!g) return;
  mobRenderAufgabeDetail(g, { compact: !!window.__MOB_AUFG_DETAIL_COMPACT__ });
}

function mobTeamInfoFuerAufgabe(g){
  if(!g) return { teamText: '', statusHtml: '' };
  var a = mobAuftragFuerInternZeile(g);
  var sch = mobSchrittObjektFuerAuftragUndStep(a, g.schritt);
  var stepKey = mobCanonicalWorkflowStep(g.schritt || '');
  function toUuidOrToken(v){
    var s = v != null ? String(v).trim() : '';
    if(!s) return '';
    if(typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(s)) return s;
    var r = mobMaKuerzelOderIdZuUserUuid(s);
    if(r && typeof maIstCockpitUserUuid === 'function' && maIstCockpitUserUuid(String(r).trim())) return String(r).trim();
    return s;
  }
  var responsibleId = toUuidOrToken(
    g.verantwortlicher || g.werId || (sch && (sch.verantwortlicher || sch.werId || sch.maId)) || g.maId
  );
  var pool = [];
  if(Array.isArray(g.teamMaIds)) pool = pool.concat(g.teamMaIds);
  if(Array.isArray(g.maIds)) pool = pool.concat(g.maIds);
  if(g.maId) pool.push(g.maId);
  if(sch){
    if(sch.verantwortlicher) pool.push(sch.verantwortlicher);
    if(sch.werId) pool.push(sch.werId);
    if(sch.maId) pool.push(sch.maId);
    if(Array.isArray(sch.maIds)) pool = pool.concat(sch.maIds);
  }
  var ids = [];
  var seen = {};
  function pushId(raw){
    var id = toUuidOrToken(raw);
    if(!id || seen[id]) return;
    seen[id] = true;
    ids.push(id);
  }
  if(responsibleId) pushId(responsibleId);
  pool.forEach(pushId);
  if(!ids.length && g.maId) pushId(g.maId);

  var taskRows;
  if(mobCcinternCockpitMount() && typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID && typeof mobAufgabenTabWorkflowZeilen === 'function'){
    taskRows = mobAufgabenTabWorkflowZeilen(MOB_MA_ID).filter(function(x){
      return x && mobAuftragIdsGleich(x.auftragId, g.auftragId) && mobCanonicalWorkflowStep(x.schritt) === stepKey;
    });
  } else {
    taskRows = (typeof INTERN_AUFGABEN !== 'undefined' ? INTERN_AUFGABEN : []).filter(function(x){
      return x && mobAuftragIdsGleich(x.auftragId, g.auftragId) && mobCanonicalWorkflowStep(x.schritt) === stepKey;
    });
  }
  var rank = { offen: 1, fertig: 2, in_arbeit: 3 };
  var statusById = {};
  taskRows.forEach(function(row){
    var rid = toUuidOrToken(row.maId || (Array.isArray(row.maIds) && row.maIds[0]) || '');
    if(!rid) return;
    var st = mobTaskStatusNorm(row.status);
    if(!statusById[rid] || (rank[st] || 0) > (rank[statusById[rid]] || 0)) statusById[rid] = st;
  });
  function labelFor(id){
    var m = typeof maByID === 'function' ? maByID(id) : null;
    if(m && m.k != null && String(m.k).trim() !== '') return String(m.k).trim().toUpperCase();
    if(m && m.n) return String(m.n);
    return String(id);
  }
  var teamText = 'Team: ' + ids.map(function(id){
    var lbl = labelFor(id);
    if(responsibleId && id === responsibleId) return lbl + ' verantwortlich';
    return lbl;
  }).join(' · ');
  var statusHtml = ids.map(function(id){
    var st = statusById[id] || 'offen';
    var col = st === 'fertig' ? '#34C759' : (st === 'in_arbeit' ? '#FF9500' : '#8E8E93');
    var txt = st === 'fertig' ? 'erledigt' : (st === 'in_arbeit' ? 'läuft' : 'offen');
    return '<span style="font-size:10px;color:'+col+';">'+labelFor(id)+' '+txt+'</span>';
  }).join(' <span style="color:#C7C7CC;">·</span> ');
  return { teamText: teamText, statusHtml: statusHtml };
}

/** Parent-Auftrag zu einer INTERN-Zeile (nicht nur === auf id). */
function mobAuftragFuerInternZeile(g){
  if(!g || typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE.length) return null;
  var gid = g.auftragId;
  var i, x;
  for(i = 0; i < AUFTRAEGE.length; i++){
    x = AUFTRAEGE[i];
    if(mobAuftragIdsGleich(x.id, gid)) return x;
  }
  return null;
}

/** Hat die INTERN-Zeile explizite MA-Zuweisung (maId / maIds)? */
function mobMaAufgabenZeileHatMaIdFelder(g){
  if(!g) return false;
  if(g.maId != null && String(g.maId).trim() !== '' && String(g.maId) !== 'undefined') return true;
  if(g.maIds && g.maIds.length){
    var i, m;
    for(i = 0; i < g.maIds.length; i++){
      m = g.maIds[i];
      if(m != null && String(m).trim() !== '' && String(m) !== 'undefined') return true;
    }
  }
  return false;
}

/**
 * MA gehört zur INTERN-Zeile: wie maAufgabeIstFuerMa, oder (nur Legacy) Zeile ohne maId/maIds
 * und MA ist laut schritte am aktuellen Auftragsschritt vorgesehen — gleiche Semantik wie mobSchrittIstFuerMa.
 */
function mobMaIdGleichCompat(a, b){
  if(a == null || b == null) return false;
  if(String(a).trim() === String(b).trim()) return true;
  // Desktop-Referenzfunktion nutzen, wenn verfügbar (UUID/Kürzel/Legacy-ID tolerant).
  if(typeof maIdGleich === 'function') return maIdGleich(a, b);
  // Fallback ohne Detail-View: über MA-Stamm auf gleiche Person auflösen.
  if(typeof maDataFindByWorkflowKey === 'function'){
    var aM = maDataFindByWorkflowKey(String(a));
    var bM = maDataFindByWorkflowKey(String(b));
    if(aM && bM){
      var aUid = aM.id != null ? String(aM.id).trim() : '';
      var bUid = bM.id != null ? String(bM.id).trim() : '';
      if(aUid && bUid && aUid === bUid) return true;
      if(aM.maId != null && bM.maId != null && String(aM.maId).trim() === String(bM.maId).trim()) return true;
      if(aM.k && bM.k && String(aM.k).trim().toUpperCase() === String(bM.k).trim().toUpperCase()) return true;
    }
  }
  return false;
}

function mobMaAufgabeIstFuerMa(g, maId){
  if(!g || maId == null || String(maId).trim() === '') return false;
  if(typeof maAufgabeIstFuerMa === 'function') return maAufgabeIstFuerMa(g, maId);
  var target = String(maId).trim();
  if (g.maId != null && mobMaIdGleichCompat(g.maId, target)) return true;
  if (Array.isArray(g.maIds)) {
    for (var i = 0; i < g.maIds.length; i++) {
      if (g.maIds[i] != null && mobMaIdGleichCompat(g.maIds[i], target)) return true;
    }
  }
  if (Array.isArray(g.teamMaIds)) {
    for (var ti = 0; ti < g.teamMaIds.length; ti++) {
      if (g.teamMaIds[ti] != null && mobMaIdGleichCompat(g.teamMaIds[ti], target)) return true;
    }
  }
  return false;
}

// ══ Mobile: Glocke / ungelesene Auftrags-Kommentare (AUFTRAEGE.kommentare + seenBy) ══

function mobUuidEqualsBadge(a, b){
  if(a == null || b == null) return false;
  return String(a).trim() === String(b).trim();
}

function mobCollectMaTokensFromObj(obj, acc){
  if(!obj || typeof obj !== 'object' || !acc) return;
  function addOne(v){
    if(v == null) return;
    var s = String(v).trim();
    if(!s || s === 'undefined') return;
    acc[s] = true;
  }
  addOne(obj.werId);
  addOne(obj.verantwortlicher);
  addOne(obj.maId);
  if(Array.isArray(obj.maIds)) obj.maIds.forEach(addOne);
  if(Array.isArray(obj.teamMaIds)) obj.teamMaIds.forEach(addOne);
}

/** MA ist am Auftrag beteiligt (Stammdaten-Felder + Schritte + optional INTERN-Zeilen). */
function mobAuftragHatMaBeteiligung(a, maId){
  if(!a || !maId) return false;
  var my = String(maId).trim();
  var acc = {};
  mobCollectMaTokensFromObj(a, acc);
  if(a.schritte && typeof a.schritte === 'object'){
    Object.keys(a.schritte).forEach(function(sk){
      mobCollectMaTokensFromObj(a.schritte[sk], acc);
    });
  }
  var tok;
  for(tok in acc){
    if(!Object.prototype.hasOwnProperty.call(acc, tok)) continue;
    if(mobUuidEqualsBadge(tok, my)) return true;
    var r = mobMaKuerzelOderIdZuUserUuid(tok);
    if(r && mobUuidEqualsBadge(r, my)) return true;
  }
  if(!mobCcinternCockpitMount() && typeof INTERN_AUFGABEN !== 'undefined' && INTERN_AUFGABEN.length){
    return INTERN_AUFGABEN.some(function(g){
      return g && mobAuftragIdsGleich(g.auftragId, a.id) && mobMaAufgabeIstFuerMa(g, my);
    });
  }
  return false;
}

/** Ungelesen für Badge: nur autorMaId + seenBy (keine Namens-Rückschlüsse). */
function mobKommentarIstUngelesenFuerMa(k, maId){
  if(!k || !maId) return false;
  var t = String(maId).trim();
  var aut = k.autorMaId != null && String(k.autorMaId).trim() !== '' ? String(k.autorMaId).trim() : '';
  if(aut && mobUuidEqualsBadge(aut, t)) return false;
  if(!Array.isArray(k.seenBy)) return true;
  var i, s;
  for(i = 0; i < k.seenBy.length; i++){
    s = k.seenBy[i];
    if(s != null && mobUuidEqualsBadge(String(s).trim(), t)) return false;
  }
  return true;
}

function mobCountUngeleseneNachrichten(){
  if(typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE.length) return 0;
  if(typeof MOB_MA_ID === 'undefined' || !MOB_MA_ID) return 0;
  var my = String(MOB_MA_ID).trim();
  var cnt = 0;
  var dedupe = {};
  AUFTRAEGE.forEach(function(a){
    if(!a || a.archiv) return;
    if(!mobAuftragHatMaBeteiligung(a, my)) return;
    (a.kommentare || []).forEach(function(k){
      if(!k) return;
      if(!mobKommentarIstUngelesenFuerMa(k, my)) return;
      var kid = k.id || String(k.ts || '') + '|' + String(k.text || '').slice(0, 40);
      var dk = String(a.id || '') + '|' + kid;
      if(dedupe[dk]) return;
      dedupe[dk] = true;
      cnt++;
    });
  });
  return cnt;
}

function mobUpdateNachrichtenBadge(){
  var n = typeof mobCountUngeleseneNachrichten === 'function' ? mobCountUngeleseneNachrichten() : 0;
  var mobBadge = document.getElementById('mob-fragen-badge');
  if(mobBadge){
    mobBadge.textContent = n > 99 ? '99+' : String(n);
    mobBadge.style.display = n > 0 ? '' : 'none';
  }
}

/** Auftrag mit den dringendsten ungelesenen Kommentaren (für MA laut seenBy). */
function mobAuftragIdMitUngelesenenKommentarenPrioritaet(){
  if(typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE.length) return null;
  if(typeof MOB_MA_ID === 'undefined' || !MOB_MA_ID) return null;
  var my = String(MOB_MA_ID).trim();
  var best = { id: null, unread: 0, latestTs: '' };
  AUFTRAEGE.forEach(function(a){
    if(!a || a.archiv) return;
    if(!mobAuftragHatMaBeteiligung(a, my)) return;
    var unread = 0;
    var latestIso = '';
    (a.kommentare || []).forEach(function(k){
      if(!k) return;
      if(!mobKommentarIstUngelesenFuerMa(k, my)) return;
      unread++;
      var t = (k.ts || k.zeit || '').toString();
      if(t > latestIso) latestIso = t;
    });
    if(unread === 0) return;
    if(unread > best.unread || (unread === best.unread && latestIso > best.latestTs)){
      best = { id: a.id, unread: unread, latestTs: latestIso };
    }
  });
  return best.id != null ? String(best.id) : null;
}

/** Nach Chat-Render: zur Kommunikation scrollen + Eingabefeld fokussieren. */
function mobScrollDetailZuKommunikation(){
  var anchor = document.getElementById('mob-auftrag-kommunikation');
  if(anchor){
    try {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (eSc) {
      anchor.scrollIntoView(true);
    }
  }
  var auId = typeof MOB_AKTIV_AUF !== 'undefined' && MOB_AKTIV_AUF != null ? String(MOB_AKTIV_AUF) : '';
  if(!auId) return;
  setTimeout(function(){
    var inp = document.getElementById('chat-inp-' + auId);
    if(inp){
      try {
        inp.focus();
      } catch (eF) {
        void eF;
      }
    }
  }, 420);
}

/**
 * Header-Glocke: ungelesene Auftrags-Kommentare öffnen → Auftrag-Detail, Scroll zur Kommunikation.
 * Fallback: offene Fragen-Block / Tab Aufgaben.
 */
function mobGlockeNachrichtenOeffnen(){
  if(typeof MOB_MA_ID === 'undefined' || !MOB_MA_ID){
    if(typeof showToast === 'function') showToast('Bitte zuerst Mitarbeiter wählen');
    return;
  }
  var n = typeof mobCountUngeleseneNachrichten === 'function' ? mobCountUngeleseneNachrichten() : 0;
  var auId = typeof mobAuftragIdMitUngelesenenKommentarenPrioritaet === 'function' ? mobAuftragIdMitUngelesenenKommentarenPrioritaet() : null;
  if(n > 0 && auId){
    if(typeof mobTab === 'function') mobTab('home');
    if(typeof mobOpenAuftragDetail === 'function'){
      mobOpenAuftragDetail(auId, { focusKommunikation: true });
    }
    return;
  }
  if(typeof countOffeneFragen === 'function' && countOffeneFragen() > 0){
    if(typeof mobTab === 'function') mobTab('home');
    setTimeout(function(){
      var el = document.getElementById('mob-offene-fragen-block');
      if(el && el.style.display !== 'none'){
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e1) {
          el.scrollIntoView(true);
        }
      } else if(typeof showToast === 'function'){
        showToast('Offene Fragen — bitte Karte oben antippen');
      }
    }, 80);
    return;
  }
  if(typeof mobTab === 'function') mobTab('aufgaben');
  if(typeof mobRenderAlle === 'function') mobRenderAlle();
  if(typeof showToast === 'function') showToast('Keine ungelesenen Nachrichten');
}

try {
  window.mobUpdateNachrichtenBadge = mobUpdateNachrichtenBadge;
  window.mobCountUngeleseneNachrichten = mobCountUngeleseneNachrichten;
  window.mobGlockeNachrichtenOeffnen = mobGlockeNachrichtenOeffnen;
} catch (eMobBadgeExp) {}

/** Basisliste Home/Aufgaben: INTERN für diesen MA (inkl. Schritt-Fallback für Zeilen ohne maId). */
function mobInternAufgabenListeFuerMa(maId){
  if(!maId || typeof INTERN_AUFGABEN === 'undefined' || !INTERN_AUFGABEN.length) return [];
  return INTERN_AUFGABEN.filter(function(g){
    if(!g) return false;
    return mobMaAufgabeIstFuerMa(g, maId);
  });
}

/** Konsole: Kette für einen Auftrag (Support). z. B. mobDiagnoseProduktionsAusschluss('okan-id','AU-1') */
function mobDiagnoseProduktionsAusschluss(maId, auId){
  if(typeof console === 'undefined' || !console.log) return;
  var a = typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, auId); }) : null;
  var lines = typeof INTERN_AUFGABEN !== 'undefined' ? INTERN_AUFGABEN.filter(function(g){ return mobAuftragIdsGleich(g.auftragId, auId); }) : [];
  console.log('[mobDiagnose] AUFTRAG', a ? { id: a.id, fz: a.fz, archiv: !!a.archiv, step: a.step, status: a.status, schritteKeys: Object.keys(a.schritte || {}) } : null);
  if(!lines.length) console.log('[mobDiagnose] Keine INTERN_AUFGABEN mit auftragId', auId);
  lines.forEach(function(g){
    var pool = !!mobAuftragIstCcInternProduktionsPool(a);
    var stepMatch = !!(a && mobCanonicalWorkflowStep(g.schritt) === mobCanonicalWorkflowStep(a.step));
    var maStrict = typeof maAufgabeIstFuerMa === 'function' && maAufgabeIstFuerMa(g, maId);
    var maMob = mobMaAufgabeIstFuerMa(g, maId);
    var wf = mobInternAufgabePasstZuProduktionsWorkflow(g);
    console.log('[mobDiagnose] INTERN', g.id, {
      auftragId: g.auftragId, schritt: g.schritt, status: g.status, maId: g.maId, maIds: g.maIds,
      zeileHatMaIds: mobMaAufgabenZeileHatMaIdFelder(g), maAufgabeIstFuerMa: maStrict, mobMaAufgabeIstFuerMa: maMob,
      pool: pool, stepMatch: stepMatch, mobInternPasst: wf,
    });
  });
}

/** Wie Kanban-Karten: aktiv, nicht archiviert, Schritt-Datensatz zum aktuellen a.step (mobSchrittObjekt…). */
function mobAuftragIstCcInternProduktionsPool(a){
  if(!a || a.archiv) return false;
  var stepC = mobCanonicalWorkflowStep(a.step);
  if(stepC === '') return false;
  if(!a.schritte || typeof a.schritte !== 'object') return false;
  // Kein harter STEP_LABELS-Zwang: Import-/API-Schritte können fehlen, solange schritte[…] auflösbar ist.
  return !!mobSchrittObjektFuerAuftragUndStep(a, a.step);
}

/** INTERN-Zeile gehört zur aktuellen Säule des Auftrags (kanonischer Schrittvergleich). */
function mobInternAufgabePasstZuProduktionsWorkflow(g){
  if(!g) return false;
  var a = mobAuftragFuerInternZeile(g);
  if(!mobAuftragIstCcInternProduktionsPool(a)) return false;
  return mobCanonicalWorkflowStep(g.schritt) === mobCanonicalWorkflowStep(a.step);
}

function mobFilterMaAufgabenNurProduktion(liste){
  if(!liste || !liste.length) return [];
  return liste.filter(function(g){
    if(!g) return false;
    if(mobTaskIstFertig(g)){
      var a = mobAuftragFuerInternZeile(g);
      if(!a || a.archiv) return false;
      var st = mobCanonicalWorkflowStep(g.schritt);
      return !!st;
    }
    return mobInternAufgabePasstZuProduktionsWorkflow(g);
  });
}

/** Referenz: Aufträge, in denen der MA am aktuellen Schritt laut schritte[a.step] vorgesehen ist (wie Karte in Spalte a.step). */
function mobDesktopProduktionTaskKeysFuerMa(maId){
  if(!maId || typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE.length) return [];
  return AUFTRAEGE.filter(function(a){
    if(!mobAuftragIstCcInternProduktionsPool(a)) return false;
    var sch = mobSchrittObjektFuerAuftragUndStep(a, a.step);
    return typeof mobSchrittIstFuerMa === 'function' && mobSchrittIstFuerMa(sch, maId);
  }).map(function(a){ return a.id + '@' + mobCanonicalWorkflowStep(a.step); }).sort();
}

function mobSchrittMaIdsResolved(sch){
  if(!sch) return [];
  if(typeof ccInternSchrittSammleMitarbeiterRohwerte === 'function'){
    return ccInternSchrittSammleMitarbeiterRohwerte(sch);
  }
  var maIds = [];
  function addId(v){
    var s = v != null ? String(v).trim() : '';
    if(!s || s === 'undefined') return;
    if(maIds.indexOf(s) >= 0) return;
    maIds.push(s);
  }
  addId(sch.verantwortlicher);
  addId(sch.werId);
  addId(sch.maId);
  if(Array.isArray(sch.maIds)) sch.maIds.forEach(addId);
  if(Array.isArray(sch.teamMaIds)) sch.teamMaIds.forEach(addId);
  if(Array.isArray(sch.zusatzMa)) sch.zusatzMa.forEach(addId);
  var hasVal = maIds && maIds.some(function(x){
    return x!=null && String(x).trim()!=='' && String(x)!=='undefined';
  });
  if(!hasVal) return [];
  return maIds || [];
}

/**
 * Schritt-Zuordnung wie Desktop (`ccInternAggregiereAktuelleAufgabenProMa` / ccInternSchrittIstFuerMitarbeiterCompat):
 * maId, verantwortlicher, werId, maIds, teamMaIds, zusatzMa, Namen, wer-Listen, …
 */
function mobSchrittIstFuerMa(sch, targetMaId){
  if(!sch || targetMaId==null || String(targetMaId).trim()==='') return false;
  if(typeof ccInternSchrittIstFuerMitarbeiterCompat === 'function'){
    return ccInternSchrittIstFuerMitarbeiterCompat(sch, targetMaId);
  }
  var target = String(targetMaId).trim();
  if (sch.maId != null && mobMaIdGleichCompat(sch.maId, target)) return true;
  if (Array.isArray(sch.maIds)) {
    for (var i = 0; i < sch.maIds.length; i++) {
      if (sch.maIds[i] != null && mobMaIdGleichCompat(sch.maIds[i], target)) return true;
    }
  }
  if (Array.isArray(sch.teamMaIds)) {
    for (var j = 0; j < sch.teamMaIds.length; j++) {
      if (sch.teamMaIds[j] != null && mobMaIdGleichCompat(sch.teamMaIds[j], target)) return true;
    }
  }
  return false;
}

function mobAuftragSchrittIstFuerMa(a, stepRaw, maId){
  if(!a || !stepRaw || maId == null || String(maId).trim() === '') return false;
  var sch = mobSchrittObjektFuerAuftragUndStep(a, stepRaw);
  if(sch && mobSchrittIstFuerMa(sch, maId)) return true;
  var stepCanon = mobCanonicalWorkflowStep(stepRaw || '');
  if(!mobCcinternCockpitMount() && typeof INTERN_AUFGABEN !== 'undefined' && Array.isArray(INTERN_AUFGABEN)){
    var hasIa = INTERN_AUFGABEN.some(function(g){
      if(!g || !mobAuftragIdsGleich(g.auftragId, a.id)) return false;
      if(mobCanonicalWorkflowStep(g.schritt || '') !== stepCanon) return false;
      return mobMaAufgabeIstFuerMa(g, maId);
    });
    if(hasIa) return true;
  }
  return false;
}

/** Tab „Aufgaben“: MA ist Team/Zuständigkeit am Schritt oder hat den Schritt abgeschlossen (Verlauf). */
function mobSchrittBeziehtMitarbeiter(sch, maId){
  if(!sch || maId == null || String(maId).trim() === '') return false;
  if(typeof mobSchrittIstFuerMa === 'function' && mobSchrittIstFuerMa(sch, maId)) return true;
  if(sch.erledigtVonMaId != null && mobMaIdGleichCompat(sch.erledigtVonMaId, maId)) return true;
  return false;
}

/** Auftrag im Pool und MA hat INTERN-Zeile oder Vorkommen in schritte (Team / erledigtVon). */
function mobAuftragHatMitarbeiterBezug(a, maId){
  if(!a || !maId || !mobAuftragIstCcInternProduktionsPool(a)) return false;
  if(!mobCcinternCockpitMount() && typeof INTERN_AUFGABEN !== 'undefined' && Array.isArray(INTERN_AUFGABEN)){
    var hasIa = INTERN_AUFGABEN.some(function(g){
      return g && mobAuftragIdsGleich(g.auftragId, a.id) && mobMaAufgabeIstFuerMa(g, maId);
    });
    if(hasIa) return true;
  }
  var keys = a.schritte && typeof a.schritte === 'object' ? Object.keys(a.schritte) : [];
  var i, sk, sch;
  for(i = 0; i < keys.length; i++){
    sk = keys[i];
    sch = a.schritte[sk];
    if(!sch || typeof sch !== 'object') continue;
    if(typeof schrittMigrieren === 'function') schrittMigrieren(sch, sk);
    if(mobSchrittBeziehtMitarbeiter(sch, maId)) return true;
  }
  return false;
}

/** Tab „Aufgaben“: keine Pflicht g.schritt === a.step (erledigte Schritte / Weitergabe bleiben sichtbar). */
function mobFilterAufgabenTabProduktion(liste){
  if(!liste || !liste.length) return [];
  return liste.filter(function(g){
    if(!g) return false;
    var a = mobAuftragFuerInternZeile(g);
    if(!a || a.archiv) return false;
    if(!mobAuftragIstCcInternProduktionsPool(a)) return false;
    var st = mobCanonicalWorkflowStep(g.schritt || '');
    return !!st;
  });
}

function mobMobWeitergabeUntertitel(a, completedStepCanon){
  if(!a || !completedStepCanon) return '';
  var sk = mobCanonicalWorkflowStep(completedStepCanon);
  var SL = typeof STEP_LABELS !== 'undefined' ? STEP_LABELS : {};
  var sl = SL[sk] || { title: sk, next: null, nextLabel: '' };
  var nextKey = sl.next != null ? mobCanonicalWorkflowStep(sl.next) : '';
  var nextTitle = sl.nextLabel || (nextKey && SL[nextKey] && SL[nextKey].title) || nextKey || '';
  return (sl.title || sk) + ' abgeschlossen → weitergegeben an ' + (nextTitle || '—');
}

var MOB_RS_TAB = String.fromCharCode(30);

function mobParseApiTabSyntheticId(aufgId){
  var RS = MOB_RS_TAB;
  var s = String(aufgId || '');
  if(s.indexOf('API-TAB' + RS) !== 0) return null;
  var parts = s.split(RS);
  if(parts.length < 4) return null;
  return { auftragId: parts[1], schritt: parts[2], maId: parts[3] };
}

function mobParseApiPassivSyntheticId(aufgId){
  var RS = MOB_RS_TAB;
  var s = String(aufgId || '');
  if(s.indexOf('API-PASSIV' + RS) === 0){
    var parts = s.split(RS);
    if(parts.length >= 4) return { auftragId: parts[1], schritt: parts[2], maId: parts.slice(3).join(RS) };
  }
  if(s.indexOf('API-PASSIV-') !== 0) return null;
  var rest = s.substring('API-PASSIV-'.length);
  var tokens = rest.split('-');
  if(tokens.length < 3) return null;
  var stepSet = {};
  var stepKeys = (typeof STEP_LABELS !== 'undefined' && STEP_LABELS && typeof STEP_LABELS === 'object') ? Object.keys(STEP_LABELS) : [];
  stepKeys.forEach(function(k){ stepSet[mobCanonicalWorkflowStep(k)] = true; });
  if(!Object.keys(stepSet).length){
    ['entwurf', 'druck', 'produktion', 'montage', 'lieferung', 'abgeschlossen'].forEach(function(k){ stepSet[k] = true; });
  }
  var i;
  for(i = tokens.length - 2; i >= 1; i--){
    var stepRaw = tokens[i];
    var stepCanon = mobCanonicalWorkflowStep(stepRaw);
    if(!stepCanon || !stepSet[stepCanon]) continue;
    var auftragId = tokens.slice(0, i).join('-');
    var maId = tokens.slice(i + 1).join('-');
    if(auftragId && maId) return { auftragId: auftragId, schritt: stepCanon, maId: maId };
  }
  return null;
}

function mobInternMiniAufgabeAnlegen(a, st, maId){
  if(mobCcinternCockpitMount()) return false;
  if(!a || !st || !maId) return false;
  var stCanon = mobCanonicalWorkflowStep(st);
  var stableId = 'IA-MOBSYNC-' + a.id + '-' + stCanon + '-' + String(maId);
  if(INTERN_AUFGABEN.some(function(x){ return x.id === stableId; })) return true;
  var sch = mobSchrittObjektFuerAuftragUndStep(a, st);
  if(!sch) return false;
  var hatPassende = INTERN_AUFGABEN.some(function(g){
    return mobAuftragIdsGleich(g.auftragId, a.id) && mobCanonicalWorkflowStep(g.schritt) === stCanon && !mobTaskIstFertig(g) && mobMaAufgabeIstFuerMa(g, maId);
  });
  if(hatPassende) return false;

  var ma = typeof maByID === 'function' ? maByID(maId) : null;
  if(!ma) ma = { n: String(maId), maId: maId };
  var stepLabel = (typeof STEP_LABELS !== 'undefined' && STEP_LABELS[stCanon] && STEP_LABELS[stCanon].title) ? STEP_LABELS[stCanon].title : st;
  var heuteIso = new Date().toISOString();
  var heuteDay = heuteIso.split('T')[0];
  var basisDatumGlobal = a.terminDatum || a.liefertermin || heuteDay;
  if(!basisDatumGlobal || basisDatumGlobal === 'undefined' || String(basisDatumGlobal).length < 8){
    basisDatumGlobal = heuteDay;
  }
  var basisDatum = basisDatumGlobal;
  if(stCanon === 'montage'){
    var md = (a.montageDatum && String(a.montageDatum).substring(0, 10)) || '';
    if(md && /^\d{4}-\d{2}-\d{2}$/.test(md)) basisDatum = md;
  }
  var maIdsResolved = mobSchrittMaIdsResolved(sch).filter(function(x){
    return x != null && String(x).trim() !== '' && String(x) !== 'undefined';
  });
  if(!maIdsResolved.length) maIdsResolved = [maId];

  var gesamtDauer = sch.dauer && sch.dauer > 0 ? sch.dauer : 0.5;
  var checkliste = typeof clChecklistenFuerSchritt === 'function' ? clChecklistenFuerSchritt(a, stCanon) : [];

  INTERN_AUFGABEN.push({
    id: stableId,
    auftragId: a.id,
    fz: a.fz || a.id,
    kunde: a.kunde || '—',
    schritt: stCanon,
    typ: sch.typ || 'single',
    titel: stepLabel + ' — ' + (a.fz || a.id),
    maId: maId,
    ma: ma.n,
    maIds: [maId],
    teamMaIds: maIdsResolved,
    dauer: gesamtDauer,
    dauerGesamt: sch.dauer && sch.dauer > 0 ? sch.dauer : gesamtDauer,
    tagBlock: null,
    datum: basisDatum,
    status: 'offen',
    erstellt: heuteIso,
    checkliste: checkliste || [],
  });
  if(typeof saveAufgaben === 'function') saveAufgaben();
  return true;
}

function mobSynchronisiereInternAufgabenMitWorkflow(maId){
  if(mobCcinternCockpitMount()) return;
  if(!maId || typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE.length) return;
  AUFTRAEGE.forEach(function(a){
    if(!mobAuftragIstCcInternProduktionsPool(a)) return;
    var st = a.step;
    var stC = mobCanonicalWorkflowStep(st);
    var sch = mobSchrittObjektFuerAuftragUndStep(a, st);
    if(!sch || sch.fertig) return;
    if(!mobSchrittIstFuerMa(sch, maId)) return;
    var hatPassende = INTERN_AUFGABEN.some(function(g){
      return mobAuftragIdsGleich(g.auftragId, a.id) && mobCanonicalWorkflowStep(g.schritt) === stC && !mobTaskIstFertig(g) && mobMaAufgabeIstFuerMa(g, maId);
    });
    if(hatPassende) return;
    if(typeof auftragAufgabenErzeugen === 'function'){
      auftragAufgabenErzeugen(a.id);
    }
    hatPassende = INTERN_AUFGABEN.some(function(g){
      return mobAuftragIdsGleich(g.auftragId, a.id) && mobCanonicalWorkflowStep(g.schritt) === stC && !mobTaskIstFertig(g) && mobMaAufgabeIstFuerMa(g, maId);
    });
    if(!hatPassende) mobInternMiniAufgabeAnlegen(a, st, maId);
  });
}

/**
 * Wenn Desktop-Produktion für den MA Aufträge sieht, aber INTERN keine passende Zeile
 * (z. B. auftragAufgabenErzeugen überspringt Schritte mit dauer 0 — dann fehlt die Karte
 * trotz Zuständigkeit am aktuellen Schritt), fehlende IA-MOBSYNC-Zeilen nachziehen.
 */
function mobNachbessernInternAusDesktopKeys(maId){
  if(mobCcinternCockpitMount()) return;
  if(!maId || typeof AUFTRAEGE === 'undefined' || !AUFTRAEGE.length) return;
  if(typeof mobDesktopProduktionTaskKeysFuerMa !== 'function' || typeof mobInternMiniAufgabeAnlegen !== 'function') return;
  var keys = mobDesktopProduktionTaskKeysFuerMa(maId);
  if(!keys || !keys.length) return;
  keys.forEach(function(key){
    var at = key.indexOf('@');
    if(at < 0) return;
    var auId = key.slice(0, at);
    var a = AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, auId); });
    if(!a) return;
    var sch = mobSchrittObjektFuerAuftragUndStep(a, a.step);
    if(!sch || sch.fertig) return;
    mobInternMiniAufgabeAnlegen(a, a.step, maId);
  });
}

function mobMeineWorkflowAufgaben(maId){
  if(!maId || typeof AUFTRAEGE === 'undefined' || !Array.isArray(AUFTRAEGE)) return [];
  var dbg = false;
  try{
    dbg = typeof localStorage !== 'undefined' && localStorage.getItem('ccintern_mob_gate_debug') === '1';
  }catch(e){}
  var basis = [];
  AUFTRAEGE.forEach(function(a){
    if(!mobAuftragIstCcInternProduktionsPool(a)) return;
    var stepRaw = a.step;
    var stepCanon = mobCanonicalWorkflowStep(stepRaw || '');
    var sch = mobSchrittObjektFuerAuftragUndStep(a, stepRaw);
    var match = typeof mobAuftragSchrittIstFuerMa === 'function' && mobAuftragSchrittIstFuerMa(a, stepRaw, maId);
    if(dbg && typeof console !== 'undefined' && console.log){
      console.log('[ccintern_mob_gate_debug]', {
        auftrag: a.id,
        step: stepCanon || stepRaw || '',
        schWer: sch && sch.wer != null ? sch.wer : null,
        schMaId: sch && sch.maId != null ? sch.maId : null,
        schMaIds: sch && Array.isArray(sch.maIds) ? sch.maIds : [],
        schTeamMaIds: sch && Array.isArray(sch.teamMaIds) ? sch.teamMaIds : [],
        schRohwerte: (typeof ccInternSchrittSammleMitarbeiterRohwerte === 'function' && sch) ? ccInternSchrittSammleMitarbeiterRohwerte(sch) : [],
        aktuelleMaId: maId,
        match: match,
      });
    }
    if(!match) return;
    var existing = null;
    if(!mobCcinternCockpitMount()){
      existing = (typeof INTERN_AUFGABEN !== 'undefined' && Array.isArray(INTERN_AUFGABEN))
        ? INTERN_AUFGABEN.find(function(g){
            return g
              && mobAuftragIdsGleich(g.auftragId, a.id)
              && mobCanonicalWorkflowStep(g.schritt) === stepCanon
              && mobMaAufgabeIstFuerMa(g, maId);
          })
        : null;
    }
    if(existing){
      basis.push(existing);
      return;
    }
    // Reine API-Auftragsansicht: keine INTERN-Dummy-/Fallback-Erzeugung.
    basis.push({
      id: 'API-' + String(a.id) + '-' + String(stepCanon || stepRaw || 'step') + '-' + String(maId),
      auftragId: a.id,
      fz: a.fz || a.id,
      kunde: a.kunde || '—',
      schritt: stepCanon || stepRaw || '',
      status: sch && sch.status ? mobTaskStatusNorm(sch.status) : 'offen',
      datum: a.terminDatum || a.liefertermin || '',
      maId: maId,
      maIds: [maId],
      teamMaIds: mobSchrittMaIdsResolved(sch),
      checkliste: Array.isArray(sch && sch.checkliste) ? sch.checkliste : [],
      dauer: sch && sch.dauer ? sch.dauer : 0,
      erstellt: a.erstellt || a.created_at || '',
    });
  });
  var gefiltert = mobFilterMaAufgabenNurProduktion(basis);
  if (typeof console !== 'undefined' && console.log) {
    if (typeof window.__MOB_PROD_DEBUG_LOGS === 'undefined') window.__MOB_PROD_DEBUG_LOGS = 0;
    if (window.__MOB_PROD_DEBUG_LOGS < 4) {
      window.__MOB_PROD_DEBUG_LOGS++;
      var desk = mobDesktopProduktionTaskKeysFuerMa(maId);
      var mob = gefiltert.map(function(g){ return g.auftragId + '@' + g.schritt + ':' + (g.id || ''); }).sort();
      console.log('DESKTOP PRODUKTION Task-Keys (AUFTRÄGE, MA am aktuellen Schritt)', desk);
      console.log('MOBILE HOME/AUFGABEN Task-Keys (INTERN, nur aktueller Schritt)', mob);
    }
  }
  var normalized = gefiltert.map(function(g){
    if(!g) return g;
    var ns = mobTaskStatusNorm(g.status);
    if(g.status !== ns) g.status = ns;
    return g;
  });
  var dedup = {};
  var out = [];
  var rank = { in_arbeit: 3, offen: 2, fertig: 1 };
  normalized.forEach(function(g){
    if(!g) return;
    var stepKey = mobCanonicalWorkflowStep(g.schritt || '');
    var key = String(g.auftragId) + '|' + stepKey + '|' + String(maId || g.maId || '');
    var prev = dedup[key];
    if(!prev){
      dedup[key] = g;
      out.push(g);
      return;
    }
    var rPrev = rank[mobTaskStatusNorm(prev.status)] || 0;
    var rNow = rank[mobTaskStatusNorm(g.status)] || 0;
    if(rNow > rPrev){
      dedup[key] = g;
      var i = out.indexOf(prev);
      if(i >= 0) out[i] = g;
    }
  });
  return out;
}

/**
 * Tab „Aufgaben“: aktive Schritte + erledigte eigene/Team-Schritte + INTERN-Zeilen (nicht nur a.step).
 * Dedupe logisch pro Auftrag|Schritt; echte INTERN-Zeilen schlagen API-Platzhalter.
 */
function mobAufgabenTabWorkflowZeilen(maId){
  if(!maId || typeof AUFTRAEGE === 'undefined' || !Array.isArray(AUFTRAEGE)) return [];
  var out = [];
  var seenLogical = {};
  function isApiPlaceholder(id){
    var idS = String(id || '');
    return idS.indexOf('API-') === 0 && idS.indexOf('API-TAB') !== 0;
  }
  function isSyntheticTab(id){
    return String(id || '').indexOf('API-TAB') === 0;
  }
  function pushRow(g){
    if(!g) return;
    var lk = String(g.auftragId || '') + '|' + mobCanonicalWorkflowStep(g.schritt || '');
    var prev = seenLogical[lk];
    if(!prev){
      seenLogical[lk] = g;
      out.push(g);
      return;
    }
    var prevLo = isApiPlaceholder(prev.id) || isSyntheticTab(prev.id);
    var newLo = isApiPlaceholder(g.id) || isSyntheticTab(g.id);
    if(!newLo && prevLo){
      var ix = out.indexOf(prev);
      if(ix >= 0) out[ix] = g;
      seenLogical[lk] = g;
    }
  }
  mobMeineWorkflowAufgaben(maId).forEach(pushRow);
  if(!mobCcinternCockpitMount() && typeof INTERN_AUFGABEN !== 'undefined' && Array.isArray(INTERN_AUFGABEN)){
    INTERN_AUFGABEN.forEach(function(g){
      if(!g || !mobMaAufgabeIstFuerMa(g, maId)) return;
      var a = mobAuftragFuerInternZeile(g);
      if(!mobAuftragIstCcInternProduktionsPool(a)) return;
      pushRow(g);
    });
  }
  var RS = MOB_RS_TAB;
  AUFTRAEGE.forEach(function(a){
    if(!mobAuftragIstCcInternProduktionsPool(a)) return;
    if(!mobAuftragHatMitarbeiterBezug(a, maId)) return;
    var keys = a.schritte && typeof a.schritte === 'object' ? Object.keys(a.schritte) : [];
    var ik, skRaw, sch, stepCanon, exists, schSt, done, synId, gSyn;
    for(ik = 0; ik < keys.length; ik++){
      skRaw = keys[ik];
      sch = a.schritte[skRaw];
      if(!sch || typeof sch !== 'object') continue;
      if(typeof schrittMigrieren === 'function') schrittMigrieren(sch, skRaw);
      if(!mobSchrittBeziehtMitarbeiter(sch, maId)) continue;
      stepCanon = mobCanonicalWorkflowStep(skRaw);
      if(!stepCanon) continue;
      exists = out.some(function(g2){
        return mobAuftragIdsGleich(g2.auftragId, a.id) && mobCanonicalWorkflowStep(g2.schritt) === stepCanon;
      });
      if(exists) continue;
      schSt = String(sch.status || '').toLowerCase();
      done = schSt === 'abgeschlossen' || sch.fertig;
      if(!done && mobCanonicalWorkflowStep(a.step) !== stepCanon) continue;
      if(!done && typeof mobSchrittIstFuerMa === 'function' && !mobSchrittIstFuerMa(sch, maId)) continue;
      synId = 'API-TAB' + RS + String(a.id) + RS + stepCanon + RS + String(maId);
      gSyn = {
        id: synId,
        auftragId: a.id,
        fz: a.fz || a.id,
        kunde: a.kunde || '—',
        schritt: stepCanon,
        status: done ? 'fertig' : mobTaskStatusNorm(sch.status || 'offen'),
        datum: a.terminDatum || a.liefertermin || '',
        maId: maId,
        maIds: [maId],
        teamMaIds: mobSchrittMaIdsResolved(sch),
        dauer: sch.dauer || 0,
        erledigtTs: sch.erledigtAm ? String(sch.erledigtAm) : undefined,
        mobWeitergabeLabel: done ? mobMobWeitergabeUntertitel(a, stepCanon) : '',
      };
      pushRow(gSyn);
    }
  });
  return mobFilterAufgabenTabProduktion(out);
}

/**
 * Aufgabenzeile für Detail/Material/Status: Cockpit-Mount → nur synthetische + API-TAB-Zeilen aus
 * mobAufgabenTabWorkflowZeilen (AUFTRAEGE), sonst INTERN_AUFGABEN.
 */
function mobFindAufgabeZeileById(aufgId){
  var id = aufgId != null ? String(aufgId) : '';
  if(!id) return null;
  if(mobCcinternCockpitMount() && typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && String(MOB_MA_ID).trim() !== ''){
    var ma = String(MOB_MA_ID).trim();
    var resolveByAuftragUndSchritt = function(a, stepRaw, opt){
      if(!a || !stepRaw) return null;
      var stepCanon = mobCanonicalWorkflowStep(stepRaw);
      if(!stepCanon) return null;
      var sch = mobSchrittObjektFuerAuftragUndStep(a, stepCanon);
      var done = false;
      var status = 'offen';
      if(sch){
        var schSt = String(sch.status || '').toLowerCase();
        done = schSt === 'abgeschlossen' || sch.fertig;
        status = done ? 'fertig' : mobTaskStatusNorm(sch.status || 'offen');
      } else if(opt && opt.forcePassiv){
        status = 'offen';
      } else {
        return null;
      }
      return {
        id: id,
        auftragId: a.id,
        fz: a.fz || a.id,
        kunde: a.kunde || a.kundenname || a.firma || a.firmenname || '—',
        schritt: stepCanon,
        status: status,
        datum: a.terminDatum || a.liefertermin || '',
        maId: ma,
        maIds: mobSchrittMaIdsResolved(sch),
        teamMaIds: mobSchrittMaIdsResolved(sch),
        checkliste: Array.isArray(sch && sch.checkliste) ? sch.checkliste : [],
        dauer: sch && sch.dauer ? sch.dauer : 0,
        erledigtTs: sch && sch.erledigtAm ? String(sch.erledigtAm) : undefined,
        mobWeitergabeLabel: done ? mobMobWeitergabeUntertitel(a, stepCanon) : '',
        _mobPassivBeteiligung: !!(opt && opt.forcePassiv),
        _istTeam: !!(opt && opt.forcePassiv),
      };
    };
    var ppass = typeof mobParseApiPassivSyntheticId === 'function' ? mobParseApiPassivSyntheticId(id) : null;
    if(ppass && ppass.auftragId && mobMaIdGleichCompat(ppass.maId, ma)){
      var aPass = typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, ppass.auftragId); }) : null;
      if(aPass && mobAuftragIstCcInternProduktionsPool(aPass)){
        var gPass = resolveByAuftragUndSchritt(aPass, ppass.schritt, { forcePassiv: true });
        if(gPass) return gPass;
      }
    }
    var rows = mobAufgabenTabWorkflowZeilen(ma);
    var hit = rows.find(function(x){ return x && String(x.id) === id; });
    if(hit) return hit;
    var ptab = typeof mobParseApiTabSyntheticId === 'function' ? mobParseApiTabSyntheticId(id) : null;
    if(ptab && ptab.auftragId && mobMaIdGleichCompat(ptab.maId, ma)){
      var a = typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, ptab.auftragId); }) : null;
      if(a && mobAuftragIstCcInternProduktionsPool(a)){
        var gTab = resolveByAuftragUndSchritt(a, ptab.schritt, null);
        if(gTab) return gTab;
      }
    }
    var aById = typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, id); }) : null;
    if(aById && mobAuftragIstCcInternProduktionsPool(aById) && mobAuftragHatMitarbeiterBezug(aById, ma)){
      var stepById = mobCanonicalWorkflowStep(aById.step || '');
      var gById = resolveByAuftragUndSchritt(aById, stepById, {
        forcePassiv: !mobAuftragSchrittIstFuerMa(aById, stepById, ma),
      });
      if(gById) return gById;
    }
  }
  if(typeof INTERN_AUFGABEN !== 'undefined' && Array.isArray(INTERN_AUFGABEN)){
    return INTERN_AUFGABEN.find(function(x){ return x && String(x.id) === id; }) || null;
  }
  return null;
}

/** Home: nur aktive Aufgaben am aktuellen Pool-Schritt für diesen MA (schritt offen / in Arbeit). */
function mobHomeWorkflowZeilenFromTab(tabListe, maId){
  return (tabListe || []).filter(function(g){
    if(mobTaskIstFertig(g)) return false;
    var a = mobAuftragFuerInternZeile(g);
    if(!a) return false;
    if(mobCanonicalWorkflowStep(g.schritt) !== mobCanonicalWorkflowStep(a.step)) return false;
    var sch = mobSchrittObjektFuerAuftragUndStep(a, a.step);
    if(!sch) return false;
    var ss = String(sch.status || '').trim().toLowerCase();
    if(ss === 'abgeschlossen' || sch.fertig) return false;
    return typeof mobSchrittIstFuerMa === 'function' && mobSchrittIstFuerMa(sch, maId);
  });
}

function mobHomeWorkflowZeilen(maId){
  return mobHomeWorkflowZeilenFromTab(mobAufgabenTabWorkflowZeilen(maId), maId);
}

function mobErledigtTsFuerInternZeile(g, maIdOpt){
  if(!g) return '';
  if(g.erledigtTs) return String(g.erledigtTs);
  var a = typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, g.auftragId); }) : null;
  if(a){
    var schR = mobSchrittObjektFuerAuftragUndStep(a, g.schritt);
    if(schR && schR.erledigtAm) return String(schR.erledigtAm);
  }
  var mid = maIdOpt != null ? maIdOpt : (typeof MOB_MA_ID !== 'undefined' ? MOB_MA_ID : '');
  if(!a || !Array.isArray(a.zeiten) || !a.zeiten.length || !mid) return '';
  var stepC = mobCanonicalWorkflowStep(g.schritt || '');
  var match = a.zeiten.slice().reverse().find(function(z){
    if(!z) return false;
    if(mobCanonicalWorkflowStep(z.step || '') !== stepC) return false;
    if(z.maId == null || z.maId === '') return false;
    return mobMaIdGleichCompat(z.maId, mid);
  });
  if(!match) return '';
  var iso = (match.erstellt || match.ts || '').toString();
  return iso && iso.indexOf('T') > 0 ? iso : '';
}

// ── Mobile Auftrags-Detail (Overlay #mob-auftrag-detail / #mob-detail-inner) ──
function mobFindBesteInternAufgabeFuerAuftrag(auId, schrittOpt){
  var a = typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, auId); }) : null;
  if(!a) return null;
  if(mobCcinternCockpitMount() && typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID){
    var tab = mobAufgabenTabWorkflowZeilen(MOB_MA_ID);
    var pool = tab.filter(function(g){
      return g && mobAuftragIdsGleich(g.auftragId, auId) && mobInternAufgabePasstZuProduktionsWorkflow(g);
    });
    if(schrittOpt){
      var optC = mobCanonicalWorkflowStep(schrittOpt);
      var byS = pool.filter(function(g){ return mobCanonicalWorkflowStep(g.schritt) === optC; });
      return byS.length ? byS[0] : null;
    }
    return pool[0] || null;
  }
  var candidates = INTERN_AUFGABEN.filter(function(g){
    if(!mobAuftragIdsGleich(g.auftragId, auId)) return false;
    if(typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID && !mobMaAufgabeIstFuerMa(g, MOB_MA_ID)) return false;
    if(!mobInternAufgabePasstZuProduktionsWorkflow(g)) return false;
    return true;
  });
  if(schrittOpt){
    var optC = mobCanonicalWorkflowStep(schrittOpt);
    var byS = candidates.filter(function(g){ return mobCanonicalWorkflowStep(g.schritt) === optC; });
    if(byS.length) return byS[0];
    var loose = INTERN_AUFGABEN.filter(function(g){
      if(!mobAuftragIdsGleich(g.auftragId, auId)) return false;
      if(typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID && !mobMaAufgabeIstFuerMa(g, MOB_MA_ID)) return false;
      return mobCanonicalWorkflowStep(g.schritt) === optC;
    });
    if(loose.length) return loose[0];
    return null;
  }
  return candidates[0] || null;
}

function mobOpenAuftragDetailShell(){
  var hc = document.getElementById('mob-home-content');
  var zb = document.getElementById('mob-zeiterfassung-block');
  var fq = document.getElementById('mob-offene-fragen-block');
  if(hc) hc.style.display = 'none';
  if(zb) zb.style.display = 'none';
  if(fq) fq.style.display = 'none';
  ['aufgaben','fotos','lager','urlaub'].forEach(function(t){
    var td = document.getElementById('mob-tab-'+t);
    if(td) td.style.display = 'none';
  });
  var det = document.getElementById('mob-auftrag-detail');
  if(det){
    det.style.display = '';
    try{ det.scrollIntoView({ behavior: 'smooth', block: 'start' }); }catch(e){}
  }
}

function mobCloseAuftragDetail(){
  var det = document.getElementById('mob-auftrag-detail');
  if(det) det.style.display = 'none';
  MOB_AKTIV_AUF = null;
  var prev = (typeof window.MOB_DETAIL_PREV_TAB !== 'undefined' && window.MOB_DETAIL_PREV_TAB) ? window.MOB_DETAIL_PREV_TAB : 'home';
  window.MOB_DETAIL_PREV_TAB = null;
  if(typeof mobTab === 'function') mobTab(prev);
}

function mobOpenAuftragDetailFromFotoEvent(ev, auId){
  if(ev && ev.target && ev.target.closest){
    if(ev.target.closest('label') || ev.target.closest('input')) return;
  }
  mobOpenAuftragDetail(auId);
}

function mobOpenAuftragDetailCard(ev, auId, schritt){
  if(ev && ev.target && ev.target.closest){ if(ev.target.closest('button')) return; }
  mobOpenAuftragDetail(auId, { schritt: schritt || null });
}

/**
 * Aktuelle Aufträge vom Server nachladen (Kommunikation Desktop ↔ App).
 * @param {() => void} done
 */
function mobReloadAuftraegeThen(done){
  var api = typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi;
  if (api && typeof api.reloadAuftraegeFromApiIntoMemory === 'function') {
    api.reloadAuftraegeFromApiIntoMemory(null).then(function(){ done(); }).catch(function(){ done(); });
    return;
  }
  done();
}

function mobOpenAuftragDetail(auId, opt){
  if(!auId) return;
  opt = opt || {};
  mobReloadAuftraegeThen(function(){ mobOpenAuftragDetailAfterReload(auId, opt); });
}

function mobOpenAuftragDetailAfterReload(auId, opt){
  opt = opt || {};
  var a = AUFTRAEGE.find(function(x){ return x.id === auId; });
  if(!a) return;
  window.MOB_DETAIL_PREV_TAB = (typeof MOB_AKTIV_TAB !== 'undefined' && MOB_AKTIV_TAB) ? MOB_AKTIV_TAB : 'home';
  mobOpenAuftragDetailShell();
  MOB_AKTIV_AUF = auId;
  var g = mobFindBesteInternAufgabeFuerAuftrag(auId, opt.schritt || null);
  if(g){
    var sch = a.schritte && a.schritte[g.schritt];
    if(sch && (!sch.checkliste || !sch.checkliste.length)){
      var tpl = typeof clChecklistenFuerSchritt === 'function' ? clChecklistenFuerSchritt(a, g.schritt) : [];
      if(tpl && tpl.length){ sch.checkliste = tpl; mobSaveAuftrag(auId); }
    }
    // Explizit voller Screen (z. B. Deep-Link / Fallback ohne Tab-Kontext)
    window.__MOB_OPEN_AUFG_ID__ = g.id;
    mobRenderAufgabeDetail(g, { compact: false });
    if(opt.focusKommunikation){
      setTimeout(function(){ if(typeof mobScrollDetailZuKommunikation === 'function') mobScrollDetailZuKommunikation(); }, 60);
      setTimeout(function(){ if(typeof mobScrollDetailZuKommunikation === 'function') mobScrollDetailZuKommunikation(); }, 380);
    }
    return;
  }
  window.__MOB_OPEN_AUFG_ID__ = null;
  mobRenderDetail(auId);
  if(opt.focusKommunikation){
    setTimeout(function(){ if(typeof mobScrollDetailZuKommunikation === 'function') mobScrollDetailZuKommunikation(); }, 60);
    setTimeout(function(){ if(typeof mobScrollDetailZuKommunikation === 'function') mobScrollDetailZuKommunikation(); }, 380);
  }
}

/** Tab „Fotos“: nur Foto-Bereich (mobMobFotoHtmlBereich), ohne Arbeitszeit/Material/Workflow. */
function mobRenderFotoView(a){
  if(!a) return;
  if (typeof console !== 'undefined' && console.log) {
    console.log('ACTIVE DETAIL PATH: mobRenderFotoView', a.id);
  }
  window.__MOB_ACTIVE_DETAIL_PATH__ = 'mobRenderFotoView';
  window.__MOB_ACTIVE_DETAIL_PATH_AT__ = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  window.__MOB_OPEN_AUFG_ID__ = null;
  var inner0 = document.getElementById('mob-detail-inner');
  if (inner0) {
    inner0.innerHTML = '<div style="padding:24px;text-align:center;color:#8E8E93;font-size:13px;line-height:1.5;">Lade Fotos…</div>';
  }
  mobMobFetchServerDateienUiPromise(a).then(function(){
    mobRenderFotoViewPaint(a);
  }).catch(function(){
    mobRenderFotoViewPaint(a);
  });
}

function mobRenderFotoViewPaint(a){
  if (!a) return;
  var sl = STEP_LABELS[a.step]||{title:a.step,col:'#888'};
  var nr = (a.auftragsnummer != null && String(a.auftragsnummer).trim() !== '') ? String(a.auftragsnummer).trim() : String(a.id || '');
  var html = '<div style="padding:16px;padding-bottom:28px;">'
    +'<div style="margin-bottom:14px;">'
      +'<button type="button" onclick="mobCloseAuftragDetail()" '
      +'style="border:none;background:#F2F2F7;border-radius:12px;padding:10px 14px;font-size:14px;font-weight:700;color:#007AFF;cursor:pointer;width:100%;text-align:left;">← Zurück zu Fotos</button>'
    +'</div>'
    +'<div style="margin-bottom:14px;">'
      +'<div style="font-size:13px;font-weight:800;color:#1C1C1E;">'+mobDetEsc(nr)+'</div>'
      +'<div style="font-size:12px;color:#3C3C43;margin-top:4px;">'+mobDetEsc(String(a.kunde||'—'))+'</div>'
      +'<div style="font-size:11px;font-weight:600;color:'+sl.col+';margin-top:6px;">Aktueller Schritt: '+mobDetEsc(String(sl.title||''))+'</div>'
    +'</div>'
    + mobMobFotoHtmlBereich(a, a.step)
    +'</div>';
  var inner = document.getElementById('mob-detail-inner');
  if(inner) inner.innerHTML = html;
  var _mobFv = document.getElementById('mob-detail-inner');
  if (_mobFv) {
    _mobFv.setAttribute('data-mob-active-detail-path', 'mobRenderFotoView');
    _mobFv.setAttribute('data-mob-active-detail-path-at', String(window.__MOB_ACTIVE_DETAIL_PATH_AT__));
  }
}

function mobOpenFotoView(auftragId){
  if(!auftragId) return;
  var a = AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, auftragId); });
  if(!a){
    if(typeof showToast === 'function') showToast('Auftrag nicht gefunden');
    return;
  }
  window.MOB_DETAIL_PREV_TAB = 'fotos';
  window.__MOB_OPEN_AUFG_ID__ = null;
  mobOpenAuftragDetailShell();
  MOB_AKTIV_AUF = auftragId;
  mobRenderFotoView(a);
}

function mobOpenAuftragDetailFromTask(g, openOpt){
  if(!g) return;
  openOpt = openOpt || {};
  var a = AUFTRAEGE.find(function(x){ return x.id === g.auftragId; });
  if(a){
    var sch = a.schritte && a.schritte[g.schritt];
    if(sch && (!sch.checkliste || !sch.checkliste.length)){
      var tpl = typeof clChecklistenFuerSchritt === 'function' ? clChecklistenFuerSchritt(a, g.schritt) : [];
      if(tpl && tpl.length){ sch.checkliste = tpl; mobSaveAuftrag(g.auftragId); }
    }
  }
  var compact = false;
  if (openOpt.compact === true) compact = true;
  else if (openOpt.compact === false) compact = false;
  else compact = !!window.__MOB_AUFG_DETAIL_COMPACT__;
  window.__MOB_AUFG_DETAIL_COMPACT__ = compact;

  window.MOB_DETAIL_PREV_TAB = (typeof MOB_AKTIV_TAB !== 'undefined' && MOB_AKTIV_TAB) ? MOB_AKTIV_TAB : 'home';
  mobOpenAuftragDetailShell();
  MOB_AKTIV_AUF = g.auftragId;
  window.__MOB_OPEN_AUFG_ID__ = g.id;
  mobRenderAufgabeDetail(g, { compact: compact });
}

/** Home-Tab: 3-Punkte auf Übersichtskarte → voller Detailscreen (Workflow, Verlauf, Kommunikation, Material, Fotos, …). */
function mobOpenMobFullDetailFromHomeByAufgabeId(aufgId){
  var g = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(aufgId) : null;
  if(!g){
    var parsed = typeof mobParseApiTabSyntheticId === 'function' ? mobParseApiTabSyntheticId(aufgId) : null;
    if(parsed && parsed.auftragId){
      mobOpenAuftragDetail(parsed.auftragId, { schritt: parsed.schritt });
      return;
    }
    if(typeof showToast === 'function') showToast('Aufgabe nicht verfügbar');
    return;
  }
  mobOpenAuftragDetailFromTask(g, { compact: false });
}

/** Tab Aufgaben: Kartenklick springt in Home und öffnet dort die Detailansicht. */
function mobOpenMobTaskCompactDetailFromAufgabenById(aufgId){
  var g = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(aufgId) : null;
  if(!g){
    var parsed = typeof mobParseApiTabSyntheticId === 'function' ? mobParseApiTabSyntheticId(aufgId) : null;
    if(parsed && parsed.auftragId){
      mobTab('home');
      mobOpenAuftragDetail(parsed.auftragId, { schritt: parsed.schritt });
      return;
    }
    if(typeof showToast === 'function') showToast('Aufgabe nicht mehr verfügbar');
    return;
  }
  // Aufgaben-Tab bleibt reine Liste/Planung; Details laufen zentral über Home.
  mobTab('home');
  mobOpenAuftragDetailFromTask(g, { compact: false });
}

/** @deprecated Nur noch mobOpenMobTaskCompactDetailFromAufgabenById / mobOpenMobFullDetailFromHomeByAufgabeId verwenden. */
function mobOpenAuftragDetailFromTaskById(aufgId){
  mobOpenMobTaskCompactDetailFromAufgabenById(aufgId);
}

// ── Mitarbeiter setzen ───────────────────────────
function mobSetMA(maId){
  // Laufenden Timer des bisherigen MA persistieren (läuft im Hintergrund weiter), nicht mobZeitStop.
  if(MOB_START && typeof mobZeitPersistState === 'function'){
    mobZeitPersistState();
  }
  clearInterval(MOB_TIMER); MOB_TIMER = null;
  MOB_START = null; MOB_PAUSE = 0; MOB_PAUSED = false; MOB_PAUSE_START = null;
  MOB_TIMER_MA_ID = null;
  MOB_MA_ID = maId;
  sessionStorage.setItem('mob_ma_id', maId);
  if(!MOB_AUFTRAG_UI_IV){
    MOB_AUFTRAG_UI_IV = setInterval(mobAuftragLaufzeitTick, 1000);
  }
  var ma = maByID(maId) || {n:'Unbekannt', av:'??', col:'#888'};
  var hEl=document.getElementById('mob-hallo');
  if(hEl) hEl.textContent='Hallo, '+ma.n+' 👋';
  var avEl=document.getElementById('mob-avatar');
  if(avEl){ avEl.textContent=ma.av; avEl.style.background=ma.col+'55'; }
  var datEl=document.getElementById('mob-datum');
  if(datEl) mobDatum();
  mobZeitRestore();
  if(!MOB_START){
    clearInterval(MOB_TIMER); MOB_TIMER = null;
    var mobUh = document.getElementById('mob-uhr');
    if(mobUh) mobUh.textContent='00:00:00';
    var mobSta = document.getElementById('mob-start-btn');
    var mobPau = document.getElementById('mob-pause-btn');
    var mobInf = document.getElementById('mob-zeit-info');
    if(mobSta){ mobSta.textContent='▶ Start'; mobSta.style.background='#34C759'; }
    if(mobPau) mobPau.style.display='none';
    if(mobInf) mobInf.style.display='none';
    mobZeitApplyButtonLayout();
  }
  mobRenderHome();
  if(MOB_AKTIV_TAB==='aufgaben') mobRenderAlle();
}

function mobWechselMA(){
  if (mobIsRealMaAppSession()) return;
  var picker=document.getElementById('mob-ma-picker');
  if(!picker) return;
  if(picker.style.display==='block'){ picker.style.display='none'; return; }
  picker.innerHTML=MA_DATA.map(function(m){
    return '<div onclick="mobSetMA(\''+m.maId+'\');document.getElementById(\'mob-ma-picker\').style.display=\'none\';" '
      +'style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-radius:8px;'+(m.maId===MOB_MA_ID?'background:#F2F2F7;':'')+';" '
      +'onmouseover="this.style.background=\'#F2F2F7\'" onmouseout="this.style.background=\''+(m.maId===MOB_MA_ID?'#F2F2F7':'transparent')+'\'">'
      +'<div style="width:32px;height:32px;border-radius:50%;background:'+m.col+';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;">'+m.av+'</div>'
      +'<div><div style="font-size:13px;font-weight:600;">'+m.n+'</div><div style="font-size:11px;color:#8E8E93;">'+m.r+'</div></div>'
      +(m.maId===MOB_MA_ID?'<span style="margin-left:auto;color:#007AFF;font-size:16px;">✓</span>':'')
      +'</div>';
  }).join('')
  // Trennlinie + Abmelden
  +'<div style="border-top:1px solid #E5E5EA;margin:4px 0;"></div>'
  +'<div onclick="mobAbmelden()" style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-radius:8px;color:#FF3B30;" '
    +'onmouseover="this.style.background=\'#FFF2F2\'" onmouseout="this.style.background=\'transparent\'">'
    +'<div style="width:32px;height:32px;border-radius:50%;background:#FF3B3018;display:flex;align-items:center;justify-content:center;font-size:16px;">🚪</div>'
    +'<div style="font-size:13px;font-weight:600;">Abmelden</div>'
  +'</div>';
  picker.style.display='block';
  setTimeout(function(){
    document.addEventListener('click', function closePicker(e){
      if(!picker.contains(e.target) && e.target.id!=='mob-avatar'){
        picker.style.display='none';
        document.removeEventListener('click', closePicker);
      }
    });
  }, 100);
}

function mobAbmelden(){
  if (typeof ccMobTestClear === 'function') { ccMobTestClear(); }
  sessionStorage.removeItem('mob_ma_id');
  MOB_MA_ID = null;
  document.getElementById('mob-ma-picker').style.display='none';
  mobZeigeLogin();
  var hEl=document.getElementById('mob-hallo');
  if(hEl) hEl.textContent='Wer bist du? 👋';
  var avEl=document.getElementById('mob-avatar');
  if(avEl){ avEl.textContent='?'; avEl.style.background='rgba(255,255,255,.2)'; }
}

// ── Uhr (Anzeige-Uhr, immer läuft) ─────────────
function mobUhrStart(){
  setInterval(function(){
    var now=new Date();
    var h=String(now.getHours()).padStart(2,'0');
    var m=String(now.getMinutes()).padStart(2,'0');
    var s=String(now.getSeconds()).padStart(2,'0');
    // Kleine Uhrzeit oben rechts im Zeiterfassungs-Block
    var uhrEl=document.getElementById('mob-uhr-aktuell');
    if(uhrEl) uhrEl.textContent=h+':'+m+':'+s;
    // Stoppuhr (mob-uhr) NICHT überschreiben — die wird nur von mobZeitTick gesteuert
  }, 1000);
}

function mobZeitApplyButtonLayout(){
  var row=document.getElementById('mob-zeit-btn-row');
  var btn=document.getElementById('mob-start-btn');
  var pBtn=document.getElementById('mob-pause-btn');
  if(row){
    row.style.display='flex';
    row.style.gap='10px';
  }
  if(btn){
    btn.style.flex = MOB_PAUSED ? '2 1 0%' : '1 1 0%';
  }
  if(pBtn){
    pBtn.textContent='⏸ Pause';
    pBtn.style.display='none';
    pBtn.style.alignItems='center';
    pBtn.style.justifyContent='center';
    pBtn.style.gap='6px';
    if(MOB_START){
      pBtn.style.display='flex';
      if(MOB_PAUSED){
        pBtn.style.flex='1 1 0%';
        pBtn.style.minWidth='132px';
      } else {
        pBtn.style.flex='0 0 auto';
        pBtn.style.minWidth='96px';
      }
    }
  }
}

// ── Zeiterfassung Start/Stop ─────────────────────
// ── A) Anwesenheitszeit (Arbeitsbeginn/Feierabend) ──────────────
// Gespeichert in MA_ANWESENHEIT[] → cc_intern_anwesenheit_v1
// GETRENNT von Auftragszeiten (AUFTRAEGE[x].zeiten)
function mobZeitPersistState(){
  var ownerId = MOB_TIMER_MA_ID || (MOB_MA_ID ? String(MOB_MA_ID).trim() : '');
  if(!ownerId || !MOB_START) return;
  var pauseNow = MOB_PAUSE;
  if(MOB_PAUSED && MOB_PAUSE_START){
    pauseNow += Math.floor((new Date()-MOB_PAUSE_START)/1000);
  }
  try {
    sessionStorage.setItem(
      'mob_timer_' + ownerId,
      JSON.stringify({
        start: MOB_START.toISOString(),
        maId: ownerId,
        paused: !!MOB_PAUSED,
        pauseSeconds: Math.max(0, Number(pauseNow) || 0),
        pauseStartedAt: (MOB_PAUSED && MOB_PAUSE_START) ? MOB_PAUSE_START.toISOString() : null,
      }),
    );
  } catch (e) {}
}

function mobZeitEffektivePauseSekunden(now){
  var total = Number(MOB_PAUSE) || 0;
  if(MOB_PAUSED && MOB_PAUSE_START){
    total += Math.floor(((now || new Date())-MOB_PAUSE_START)/1000);
  }
  return Math.max(0, total);
}

function mobZeitToggle(){
  if(MOB_START && !MOB_PAUSED){
    mobZeitStop();
  } else if(MOB_PAUSED){
    MOB_PAUSE += Math.floor((new Date()-MOB_PAUSE_START)/1000);
    MOB_PAUSED=false; MOB_PAUSE_START=null;
    var btn=document.getElementById('mob-start-btn');
    var pBtn=document.getElementById('mob-pause-btn');
    if(btn){btn.textContent='⏹ Stop';btn.style.background='#FF3B30';}
    if(pBtn) pBtn.style.display='';
    clearInterval(MOB_TIMER);
    MOB_TIMER=setInterval(mobZeitTick,1000);
    mobZeitPersistState();
    mobZeitApplyButtonLayout();
    mobZeitTick();
  } else {
    MOB_START=new Date(); MOB_PAUSE=0; MOB_PAUSED=false;
    MOB_TIMER_MA_ID = MOB_MA_ID ? String(MOB_MA_ID) : null;
    var btn=document.getElementById('mob-start-btn');
    var pBtn=document.getElementById('mob-pause-btn');
    if(btn){btn.textContent='⏹ Stop';btn.style.background='#FF3B30';}
    if(pBtn) pBtn.style.display='';
    MOB_TIMER=setInterval(mobZeitTick,1000);
    var info=document.getElementById('mob-zeit-info');
    if(info){info.style.display='block';info.textContent='Gestartet '+MOB_START.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});}
    // Im gemeinsamen DAL speichern — Desktop sieht es in MA_ANWESENHEIT
    mobZeitPersistState();
    mobZeitApplyButtonLayout();
  }
}

function mobZeitPause(){
  if(!MOB_START||MOB_PAUSED) return;
  MOB_PAUSED=true; MOB_PAUSE_START=new Date();
  clearInterval(MOB_TIMER); MOB_TIMER=null;
  mobZeitPersistState();
  var btn=document.getElementById('mob-start-btn');
  if(btn){btn.textContent='▶ Weiter';btn.style.background='#34C759';}
  var info=document.getElementById('mob-zeit-info');
  if(info) info.textContent='Pausiert seit '+MOB_PAUSE_START.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  mobZeitApplyButtonLayout();
  mobZeitTick();
}

function mobZeitStop(){
  if(!MOB_START) return;
  clearInterval(MOB_TIMER); MOB_TIMER=null;
  var endTime = new Date();
  var sek = Math.floor((endTime-MOB_START)/1000)-mobZeitEffektivePauseSekunden(endTime);
  var min = Math.floor(sek/60);
  var ma  = maByID(MOB_MA_ID)||{n:MOB_MA_ID};
  var heute = endTime.toISOString().split('T')[0];
  var startStr = MOB_START.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  var endStr   = endTime.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});

  // A) Anwesenheitszeit → MA_ANWESENHEIT (gemeinsam, Desktop sieht es)
  var anwEntry = {
    maId:    MOB_MA_ID,
    ma:      ma.n,
    datum:   heute,
    start:   startStr,
    end:     endStr,
    dauer:   min,
    typ:     'anwesenheit',
    erstellt:endTime.toISOString(),
  };
  MA_ANWESENHEIT.push(anwEntry);
  var api = window.__CCINTERN_COCKPIT_MOUNT__ && window.CCIntern && window.CCIntern.cockpitApi ? window.CCIntern.cockpitApi : null;
  if (api && typeof api.postMitarbeiterAnwesenheitFromUi === 'function') {
    api.postMitarbeiterAnwesenheitFromUi(anwEntry, typeof showToast === 'function' ? showToast : null).then(function () {
      saveAnwesenheit();
    }).catch(function (e) {
      console.error('[mob] Anwesenheit API', e);
      saveAnwesenheit();
    });
  } else {
    saveAnwesenheit();
  }

  // Timer-State löschen
  var timerOwnerId = MOB_TIMER_MA_ID || (MOB_MA_ID ? String(MOB_MA_ID) : '');
  if (timerOwnerId) {
    try { sessionStorage.removeItem('mob_timer_' + timerOwnerId); } catch (e) {}
  }

  MOB_START=null; MOB_PAUSE=0; MOB_PAUSED=false; MOB_TIMER_MA_ID = null;
  var btn=document.getElementById('mob-start-btn');
  var pBtn=document.getElementById('mob-pause-btn');
  if(btn){btn.textContent='▶ Start';btn.style.background='#34C759';}
  if(pBtn) pBtn.style.display='none';
  var info=document.getElementById('mob-zeit-info');
  if(info) info.style.display='none';
  showToast('✓ Anwesenheit gespeichert · '+Math.floor(min/60)+'h '+(min%60)+'min');

  // Desktop Mitarbeiter-Ansicht aktualisieren
  if(typeof renderMitarbeiter==='function') renderMitarbeiter();
  mobZeitApplyButtonLayout();
}

// Timer nach Reload wiederherstellen
function mobZeitRestore(){
  if(!MOB_MA_ID) return;
  var mid = String(MOB_MA_ID).trim();
  var raw = null;
  try {
    raw = sessionStorage.getItem('mob_timer_' + mid);
  } catch (e) {
    raw = null;
  }
  var saved = null;
  if (raw) {
    try {
      saved = JSON.parse(raw);
    } catch (e2) {
      saved = null;
    }
  }
  if(!saved||!saved.start || !saved.maId || String(saved.maId).trim() !== mid) return;
  MOB_START = new Date(saved.start);
  console.log('MOB_START restored:', MOB_START, 'saved.start:', saved.start);
  if (isNaN(MOB_START.getTime())) {
    MOB_START = null;
    return;
  }
  if (MOB_START.getTime() > Date.now()) {
    MOB_START = null;
    return;
  }
  MOB_PAUSE = Math.max(0, Number(saved.pauseSeconds) || 0);
  MOB_PAUSED = !!saved.paused;
  MOB_PAUSE_START = null;
  if(MOB_PAUSED && saved.pauseStartedAt){
    var pAt = new Date(saved.pauseStartedAt);
    if(pAt instanceof Date && !Number.isNaN(pAt.getTime())) MOB_PAUSE_START = pAt;
  }
  if(MOB_PAUSED && !MOB_PAUSE_START) MOB_PAUSE_START = new Date();
  MOB_TIMER_MA_ID = String(MOB_MA_ID).trim();
  var btn=document.getElementById('mob-start-btn');
  var pBtn=document.getElementById('mob-pause-btn');
  if(btn){
    if(MOB_PAUSED){
      btn.textContent='▶ Weiter';btn.style.background='#34C759';
    } else {
      btn.textContent='⏹ Stop';btn.style.background='#FF3B30';
    }
  }
  if(pBtn) pBtn.style.display='';
  if(!MOB_PAUSED){
    clearInterval(MOB_TIMER);
    MOB_TIMER = setInterval(mobZeitTick,1000);
  }
  var info=document.getElementById('mob-zeit-info');
  if(info){
    info.style.display='block';
    if(MOB_PAUSED && MOB_PAUSE_START){
      info.textContent='Pausiert seit '+MOB_PAUSE_START.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
    } else {
      info.textContent='Läuft seit '+MOB_START.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
    }
  }
  mobZeitApplyButtonLayout();
  mobZeitTick();
}

/** Nur Auftrags-Stoppuhr (#mob-lauft-timer); läuft auch bei pausierter Arbeitszeit (MOB_TIMER gestoppt). */
function mobAuftragLaufzeitTick(){
  if(typeof ZEIT_AKTIV === 'undefined' || !ZEIT_AKTIV) return;
  var laufendeKey = Object.keys(ZEIT_AKTIV).find(function(k){
    var parseFn = (typeof window !== 'undefined' && typeof window.zeitAktivParseAnyKey === 'function')
      ? window.zeitAktivParseAnyKey
      : null;
    var parsed = parseFn ? parseFn(k) : null;
    if(!parsed) return false;
    var mob = (typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && String(MOB_MA_ID).trim() !== '')
      ? String(MOB_MA_ID).trim()
      : '';
    if(mob && parsed.maId !== mob) return false;
    if(!mob && parsed.maId != null) return false;
    var auftragId = parsed.auId;
    var meineAufgaben = mobFilterMaAufgabenNurProduktion(mobHomeWorkflowZeilen(MOB_MA_ID));
    return meineAufgaben.some(function(g){ return mobAuftragIdsGleich(g.auftragId, auftragId); });
  });
  if(laufendeKey){
    var lEntry = ZEIT_AKTIV[laufendeKey];
    if(lEntry){
      var lSek=Math.floor((new Date()-lEntry.start)/1000);
      var lH=Math.floor(lSek/3600), lM=Math.floor((lSek%3600)/60), lS=lSek%60;
      var lt=document.getElementById('mob-lauft-timer');
      if(lt) lt.textContent=String(lH).padStart(2,'0')+':'+String(lM).padStart(2,'0')+':'+String(lS).padStart(2,'0');
    }
  }
}

function mobZeitTick(){
  if(!MOB_START) return;
  var pauseSek = mobZeitEffektivePauseSekunden();
  var sek = Math.max(0, Math.floor((Date.now() - MOB_START.getTime()) / 1000) - pauseSek);
  var h=Math.floor(sek/3600);
  var m=Math.floor((sek%3600)/60);
  var s=sek%60;
  var el=document.getElementById('mob-uhr');
  if(el) el.textContent=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

// ── Home: Aufträge dieses MA ─────────────────────
function mobRenderHome(){
  // Home: nur aktive Aufträge am aktuellen Schritt; Verlauf/Fertig aus Tab-Liste (MA weiter beteiligt)
  var tabAlle = mobAufgabenTabWorkflowZeilen(MOB_MA_ID);
  var offeneAufgaben = mobHomeWorkflowZeilenFromTab(tabAlle, MOB_MA_ID);
  var el = document.getElementById('mob-auftraege'); if(!el) return;

  var heute = new Date().toISOString().split('T')[0];

  // ── A) Warnungen ─────────────────────────────────────────────────
  var ueberfaellig = offeneAufgaben.filter(function(g){
    var a = AUFTRAEGE.find(function(x){ return x.id===g.auftragId; });
    return a && a.terminDatum && a.terminDatum < heute && a.step !== 'abgeschlossen' && !mobTaskIstFertig(g);
  });
  var heuteFaellig = offeneAufgaben.filter(function(g){
    var a = AUFTRAEGE.find(function(x){ return x.id===g.auftragId; });
    return a && a.terminDatum && a.terminDatum === heute && a.step !== 'abgeschlossen' && !mobTaskIstFertig(g);
  });

  var warnHtml = '';
  if(ueberfaellig.length){
    warnHtml += '<div class="mob-warn-banner red">'
      +'<span style="font-size:16px;flex-shrink:0;margin-top:1px;">🔴</span>'
      +'<div><div style="font-size:12px;font-weight:700;color:#c0392b;">'+ueberfaellig.length+' Auftrag'+(ueberfaellig.length>1?'räge':'')+' überfällig!</div>'
      +'<div style="font-size:11px;color:#c0392b;opacity:.85;margin-top:2px;">'+ueberfaellig.map(function(g){return g.auftragId;}).join(', ')+' '+( ueberfaellig.length===1?'war':'waren')+' bereits fällig</div></div>'
      +'</div>';
  }
  if(heuteFaellig.length){
    warnHtml += '<div class="mob-warn-banner yellow">'
      +'<span style="font-size:16px;flex-shrink:0;margin-top:1px;">⚠️</span>'
      +'<div><div style="font-size:12px;font-weight:700;color:#856404;">'+heuteFaellig.length+' Auftrag'+(heuteFaellig.length>1?'räge':'')+' heute fällig</div>'
      +'<div style="font-size:11px;color:#856404;opacity:.85;margin-top:2px;">'+heuteFaellig.map(function(g){return g.auftragId;}).join(', ')+' bis heute fertigstellen</div></div>'
      +'</div>';
  }

  // ── B) Stats-Zeile ───────────────────────────────────────────────
  var offenCount    = offeneAufgaben.filter(function(g){ return g.status==='offen'; }).length;
  var inArbeitCount = offeneAufgaben.filter(function(g){ return g.status==='in_arbeit'; }).length;

  var statsHtml = '<div class="mob-stat-row">'
    +'<div class="mob-stat-card"><div class="mob-stat-num" style="color:#007AFF;">'+offenCount+'</div><div class="mob-stat-lbl">Offen</div></div>'
    +'<div class="mob-stat-card"><div class="mob-stat-num" style="color:#FF9500;">'+inArbeitCount+'</div><div class="mob-stat-lbl">In Arbeit</div></div>'
    +'<div class="mob-stat-card"><div class="mob-stat-num" style="color:#8E8E93;">'+offeneAufgaben.length+'</div><div class="mob-stat-lbl">Aktiv gesamt</div></div>'
    +'</div>';

  // ── C) LÄUFT GERADE ──────────────────────────────────────────────
  var lauftHtml = '';
  var laufendeKey = Object.keys(ZEIT_AKTIV).find(function(k){
    var parseFn = (typeof window !== 'undefined' && typeof window.zeitAktivParseAnyKey === 'function')
      ? window.zeitAktivParseAnyKey
      : null;
    var parsed = parseFn ? parseFn(k) : null;
    if(!parsed) return false;
    var mob = (typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && String(MOB_MA_ID).trim() !== '')
      ? String(MOB_MA_ID).trim()
      : '';
    if(mob && parsed.maId !== mob) return false;
    if(!mob && parsed.maId != null) return false;
    var auftragId = parsed.auId;
    return offeneAufgaben.some(function(g){ return mobAuftragIdsGleich(g.auftragId, auftragId); });
  });
  if(laufendeKey){
    var lpFn = (typeof window !== 'undefined' && typeof window.zeitAktivParseAnyKey === 'function')
      ? window.zeitAktivParseAnyKey
      : null;
    var lparsed = lpFn ? lpFn(laufendeKey) : null;
    var lAuftragId = lparsed ? lparsed.auId : (function(){
      var lParts = laufendeKey.split('_');
      return lParts[0];
    })();
    var lSchritt = lparsed ? lparsed.step : (function(){
      var lParts = laufendeKey.split('_');
      return lParts.slice(1).join('_');
    })();
    var lAuftrag = AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, lAuftragId); });
    var lAufg = offeneAufgaben.find(function(g){ return mobAuftragIdsGleich(g.auftragId, lAuftragId) && g.schritt===lSchritt; });
    var lSl = STEP_LABELS[lSchritt]||{col:'#34C759',title:lSchritt};
    var lEntry = ZEIT_AKTIV[laufendeKey];
    var lSek = lEntry ? Math.floor((new Date()-lEntry.start)/1000) : 0;
    var lH=Math.floor(lSek/3600), lM=Math.floor((lSek%3600)/60), lS=lSek%60;
    var lTimer=String(lH).padStart(2,'0')+':'+String(lM).padStart(2,'0')+':'+String(lS).padStart(2,'0');
    var lNextSl = lAuftrag&&STEP_LABELS[lAuftrag.step]&&STEP_LABELS[lAuftrag.step].next ? STEP_LABELS[STEP_LABELS[lAuftrag.step].next] : null;
    var lNrAnzeige = lAuftrag
      ? ((lAuftrag.auftragsnummer != null && String(lAuftrag.auftragsnummer).trim() !== '')
        ? String(lAuftrag.auftragsnummer).trim()
        : String(lAuftrag.id || lAuftragId || ''))
      : String(lAuftragId || '');
    lauftHtml = '<div class="mob-sec-label">▶ LÄUFT GERADE</div>'
      +'<div class="mob-lauft-card" style="margin-bottom:10px;cursor:default;">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">'
          +'<div>'
            +'<div style="font-size:13px;font-weight:800;color:#1C1C1E;">'+mobDetEsc(lAufg&&lAufg.kunde||lAuftrag&&lAuftrag.kunde||'—')+(lAufg&&lAufg.fz?' · '+lAufg.fz:lAuftrag&&lAuftrag.fz?' · '+lAuftrag.fz:'')+'</div>'
            +'<div style="font-size:11px;color:#5A7BA8;margin-top:2px;">'+mobDetEsc(lNrAnzeige)+'</div>'
          +'</div>'
          +'<div style="text-align:right;">'
            +'<div style="display:flex;align-items:center;gap:4px;background:#34C759;color:#fff;font-size:9px;font-weight:800;border-radius:6px;padding:2px 7px;letter-spacing:.06em;">'
              +'<div style="width:6px;height:6px;background:#fff;border-radius:50%;"></div>LÄUFT'
            +'</div>'
            +'<div id="mob-lauft-timer" style="font-size:14px;font-weight:700;color:#1C7A3A;font-variant-numeric:tabular-nums;margin-top:4px;">'+lTimer+'</div>'
          +'</div>'
        +'</div>'
        +'<div style="display:flex;align-items:center;gap:8px;">'
          +'<div style="background:#34C759;color:#fff;font-size:10px;font-weight:700;border-radius:20px;padding:3px 10px;">'+lSl.title+'</div>'
          +(lNextSl&&lAuftrag&&lAuftrag.step===lSchritt
            ?'<button onclick="event.stopPropagation();mobStepWeiter(\''+lAuftragId+'\')" '
              +'style="margin-left:auto;background:#1C1C1E;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;">Fertig →</button>'
            :'<button onclick="event.stopPropagation();mobInternZeitStop(\''+lAuftragId+'\',\''+lSchritt+'\');" '
              +'style="margin-left:auto;background:#FF3B30;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;">Stop</button>'
          )
        +'</div>'
      +'</div>';
  }

  // ── D) Aufträge (neue Card-Optik) ────────────────────────────────
  var heuteAufg   = offeneAufgaben.filter(function(g){ return g.datum===heute; });
  var kommendAufg = offeneAufgaben.filter(function(g){ return g.datum && g.datum > heute; });
  var ohneAufg    = offeneAufgaben.filter(function(g){ return !g.datum || g.datum < heute; });

  var renderAufgabe = function(g, istHeute){
    var sl      = STEP_LABELS[g.schritt]||{col:'#888',title:g.schritt};
    var a       = AUFTRAEGE.find(function(x){ return x.id===g.auftragId; });
    var laeuft  = a && mobIstAuftragsZeitAktivFuerSchritt(g.auftragId, g.schritt);
    var gebucht = a ? (a.zeiten||[]).filter(function(z){return z.step===g.schritt;}).reduce(function(s,z){return s+z.dauer;},0) : 0;
    var istUeberf = a&&a.terminDatum&&a.terminDatum < heute && !mobTaskIstFertig(g);
    var termin  = a&&a.terminDatum ? a.terminDatum.split('-').reverse().join('.') : '';
    var nextSl  = a&&STEP_LABELS[a.step]&&STEP_LABELS[a.step].next ? STEP_LABELS[STEP_LABELS[a.step].next] : null;

    // Farbe für linken Balken + Step-Tag
    var barCol = istUeberf ? '#FF3B30' : (istHeute ? '#FF9500' : sl.col);
    var tagBg  = istUeberf ? '#FFEBEB' : (istHeute ? '#FFF3E0' : '#EAF4FF');
    var tagCol = istUeberf ? '#FF3B30' : (istHeute ? '#FF9500' : '#007AFF');

    // Chat-Badge: unbeantw. Fragen + Gesamtnachrichten zählen
    var chatNachr = a ? (a.kommentare||[]).filter(function(k){ return k.istFrage&&!k.beantwortet; }).length : 0;
    var chatGesamt = a ? (a.kommentare||[]).length : 0;

    // Checkliste-Fortschritt (kompakt)
    var checks = g.checkliste||[];
    if(!checks.length && a) checks = (function(){ var cl=clChecklistenFuerSchritt(a,g.schritt); return cl&&cl.length?cl:[];})();
    var clDone=checks.filter(function(c){return c.erledigt;}).length;
    var clTotal=checks.length;
    var clPct=clTotal?Math.round(clDone/clTotal*100):0;
    var clCol=clPct===100?'#34C759':clPct>50?'#FF9500':'#007AFF';
    var teamInfo = mobTeamInfoFuerAufgabe(g);
    var startGate = mobWorkflowStartFreigabe(g.auftragId, g.schritt, MOB_MA_ID);

    return '<div class="mob-aufg-card" style="cursor:default;">'
      // Linker farbiger Balken
      +'<div class="mob-aufg-bar" style="background:'+barCol+';"></div>'
      // Body
      +'<div class="mob-aufg-body">'
        // Zeile 1: ID + Chat-Badge | Step-Tag + Datum
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px;">'
          +'<div class="mob-aufg-id">'+g.auftragId
            +(chatGesamt>0?' <span style="background:'+(chatNachr>0?'#FF9500':'#5856D6')+';color:#fff;font-size:9px;font-weight:800;border-radius:10px;padding:1px 6px;vertical-align:middle;">💬'+(chatNachr>0?' ❓'+chatNachr:''+chatGesamt)+'</span>':'')
            +(laeuft?' <span style="background:#34C759;color:#fff;font-size:9px;font-weight:800;border-radius:10px;padding:1px 5px;vertical-align:middle;">● Läuft</span>':'')
          +'</div>'
          +'<div style="text-align:right;flex-shrink:0;margin-left:8px;">'
            +'<span class="mob-step-tag" style="background:'+tagBg+';color:'+tagCol+';">'+sl.title+'</span>'
            +(termin?'<div style="font-size:10px;color:'+(istUeberf?'#FF3B30':istHeute?'#FF9500':'#C7C7CC')+';margin-top:3px;">'+(istUeberf?'🔴 Überfällig':istHeute?'⚠ Heute':termin)+'</div>':'')
          +'</div>'
        +'</div>'
        // Zeile 2: Kunde · FZ
        +'<div class="mob-aufg-sub">'+(g.kunde||a&&a.kunde||'—')+(g.fz?' · '+g.fz:a&&a.fz?' · '+a.fz:'')+'</div>'
        +(teamInfo.teamText ? '<div style="margin-top:4px;font-size:10px;color:#6B7280;">'+teamInfo.teamText+'</div>' : '')
        +(teamInfo.statusHtml ? '<div style="margin-top:2px;font-size:10px;line-height:1.35;">'+teamInfo.statusHtml+'</div>' : '')
        // Checkliste-Balken wenn vorhanden
        +(clTotal>0?'<div style="margin-top:6px;margin-bottom:2px;height:3px;background:#E5E5EA;border-radius:2px;overflow:hidden;"><div style="height:100%;width:'+clPct+'%;background:'+clCol+';border-radius:2px;"></div></div>':'')
        // Buttons (Touch: .ma-more-btn 48px, Start flex, Schritt .ma-step-btn)
        +'<div class="ma-btn-row">'
          +(laeuft
            ?'<button type="button" class="ma-start-btn" onclick="event.stopPropagation();mobInternZeitStop(\''+g.auftragId+'\',\''+g.schritt+'\');" '
              +'style="background:#FF3B30;">⏹ Stop</button>'
            :'<button type="button" class="ma-start-btn" onclick="event.stopPropagation();mobInternZeitStart(\''+g.auftragId+'\',\''+g.schritt+'\');" '
              +(startGate.ok
                ?'style="background:'+barCol+';"'
                :'disabled aria-disabled="true" title="'+mobDetEsc(startGate.grund || 'Wartet auf vorherige Schritte')+'" style="background:#C7C7CC;cursor:not-allowed;opacity:.8;"')
              +'>'
              +(startGate.ok ? '▶ Start' : '⏳ Wartet')
              +'</button>'
          )
          +'<button type="button" class="ma-more-btn" onclick="event.stopPropagation();mobOpenMobFullDetailFromHomeByAufgabeId(\''+mobEscJsSingleQuoted(g.id)+'\')" title="Vollständige Details">'
            +'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" stroke-width="2.5"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>'
          +'</button>'
        +'</div>'
        +(!laeuft && !startGate.ok
          ?'<div style="margin-top:6px;padding:6px 10px;background:#FFF8E1;border-radius:8px;font-size:11px;color:#FF9500;text-align:center;">⏳ '+mobDetEsc(startGate.grund || 'Wartet auf vorherige Schritte')+'</div>'
          :'')
        // Weiter-Button
        +(function(){
          if(!nextSl||!a||mobCanonicalWorkflowStep(a.step)!==mobCanonicalWorkflowStep(g.schritt)) return '';
          var sch2 = mobSchrittObjektFuerAuftragUndStep(a, g.schritt); if(sch2) schrittMigrieren(sch2,g.schritt);
          var darfAbschliessen = typeof mobAuftragSchrittIstFuerMa === 'function'
            && mobAuftragSchrittIstFuerMa(a, g.schritt, MOB_MA_ID);
          if(!darfAbschliessen){
            var nur = sch2 && (sch2.verantwortlicherName || sch2.verantwortlicher);
            var hinweis = nur
              ? ('⛔ Nur '+mobDetEsc(String(nur))+' darf abschließen')
              : '⛔ Kein Zugriff für diesen Schritt';
            return '<div style="margin-top:6px;padding:6px 10px;background:#FFF3E0;border-radius:8px;font-size:11px;color:#FF9500;text-align:center;">'+hinweis+'</div>';
          }
          return '<button type="button" class="ma-step-btn ma-step-btn--block" onclick="event.stopPropagation();mobStepWeiter(\''+g.auftragId+'\')" '
            +'style="margin-top:6px;">'
            +'✓ '+sl.title+' fertig → '+nextSl.title+'</button>';
        })()
      +'</div>'
    +'</div>';
  };

  // Alles zusammenbauen
  var html = warnHtml + statsHtml + lauftHtml;

  if(heuteAufg.length){
    html += '<div class="mob-sec-label">📋 HEUTE ('+heuteAufg.length+')</div>';
    html += heuteAufg.map(function(g){ return renderAufgabe(g,true); }).join('');
  }
  if(kommendAufg.length){
    html += '<div class="mob-sec-label" style="margin-top:10px;">📅 GEPLANT ('+kommendAufg.length+')</div>';
    html += kommendAufg.map(function(g){ return renderAufgabe(g,false); }).join('');
  }
  if(ohneAufg.length){
    html += '<div class="mob-sec-label" style="margin-top:10px;">📋 MEINE AUFTRÄGE ('+ohneAufg.length+')</div>';
    html += ohneAufg.map(function(g){ return renderAufgabe(g,false); }).join('');
  }
  if(!heuteAufg.length && !kommendAufg.length && !ohneAufg.length){
    html += '<div style="background:#fff;border-radius:16px;padding:20px;text-align:center;color:#8E8E93;font-size:14px;">Keine offenen Aufgaben 🎉</div>';
  }
  el.innerHTML = html;
  if(typeof mobUpdateNachrichtenBadge === 'function') mobUpdateNachrichtenBadge();
}

// ── Verbindungstest: Desktop ↔ App ──────────────────────────────
function ccVerbindungsTest(){
  var heute = new Date().toISOString().split('T')[0];
  var lines = [];

  lines.push('=== CC INTERN VERBINDUNGSTEST ===');
  lines.push('Datum: '+heute);
  lines.push('Eingeloggter MA: '+(MOB_MA_ID||'KEINER'));
  lines.push('');

  // 1. AUFTRAEGE
  lines.push('── AUFTRÄGE ('+AUFTRAEGE.length+') ──');
  AUFTRAEGE.forEach(function(a){
    var sch = a.schritte||{};
    var maListe = ['grafik','druck','laminat','montage','doku'].filter(function(s){
      return sch[s]&&sch[s].maId&&sch[s].dauer>0;
    }).map(function(s){
      return s+':'+sch[s].maId+'('+sch[s].dauer+'h)';
    }).join(', ');
    lines.push('  '+a.id+' | '+a.fz+' | Step:'+a.step+' | Termin:'+(a.terminDatum||'KEIN DATUM')+' | MA:['+maListe+']');
  });
  lines.push('');

  // 2. INTERN_AUFGABEN
  lines.push('── INTERNE AUFGABEN ('+INTERN_AUFGABEN.length+') ──');
  if(!INTERN_AUFGABEN.length){
    lines.push('  ⚠ LEER — Aufgaben wurden noch nicht erzeugt!');
    lines.push('  → Neuen Auftrag anlegen und prüfen ob auftragAufgabenErzeugen() läuft');
  } else {
    INTERN_AUFGABEN.slice(0,8).forEach(function(g){
      lines.push('  '+g.id+' | '+g.schritt+' | MA:'+g.maId+' | '+g.dauer+'h | '+g.datum+' | '+g.status);
    });
  }
  lines.push('');

  // 3. MEINE AUFGABEN
  var meine = mobMeineWorkflowAufgaben(MOB_MA_ID);
  lines.push('── MEINE AUFGABEN (MA='+MOB_MA_ID+') → '+meine.length+' ──');
  if(!meine.length && INTERN_AUFGABEN.length){
    // Zeige welche maIds in Aufgaben vorhanden sind
    var vorhandeneIds = {};
    INTERN_AUFGABEN.forEach(function(g){ if(g.maId) vorhandeneIds[g.maId]=true; });
    lines.push('  ⚠ Keine Aufgaben für MA "'+MOB_MA_ID+'"');
    lines.push('  Vorhandene MA-IDs in Aufgaben: '+Object.keys(vorhandeneIds).join(', '));
    lines.push('  → Stimmt deine MA-ID? Profil antippen → anderer MA?');
  } else {
    meine.slice(0,5).forEach(function(g){
      lines.push('  '+g.id+' | '+g.titel+' | '+g.datum+' | '+g.status);
    });
  }
  lines.push('');

  // 4. Session / API-Hinweis
  lines.push('── SESSION / API ──');
  lines.push('  mob_ma_id: '+((typeof sessionStorage !== 'undefined' && sessionStorage.getItem('mob_ma_id'))||'NICHT GESETZT'));
  lines.push('  Aufgaben: nur RAM/API (cc_intern_aufgaben_v1)');
  lines.push(
    '  auftraege: ' +
      (window.__CCINTERN_COCKPIT_MOUNT__
        ? 'Cockpit → /api/v1/ccintern/auftraege (nicht localStorage-geführt)'
        : 'kein Cockpit — Aufträge nur mit API-Kontext persistierbar'),
  );

  // Ausgabe als Alert + Console
  var report = lines.join('\n');
  console.log(report);

  // Overlay anzeigen
  var ov = document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
  ov.innerHTML='<div style="background:#0A1929;border-radius:16px;padding:20px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
      +'<span style="font-size:14px;font-weight:700;color:#fff;">🔧 Verbindungstest</span>'
      +'<button onclick="this.parentElement.parentElement.parentElement.remove()" style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:14px;">×</button>'
    +'</div>'
    +'<pre style="font-size:10px;color:#34C759;line-height:1.6;white-space:pre-wrap;font-family:monospace;">'+report+'</pre>'
  +'</div>';
  document.body.appendChild(ov);
}

// ── Test-Auftrag direkt anlegen ──────────────────────────────────
function ccTestAuftragAnlegen(){
  showToast('ℹ️ Test-Auftrag ist deaktiviert. Bitte echte Aufträge über Backend/FUSA freigeben.');
}
function mobAufgabeToggle(aufgId){
  var g = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(aufgId) : null;
  if(!g) return;
  mobOpenAuftragDetailFromTask(g, { compact: !!window.__MOB_AUFG_DETAIL_COMPACT__ });
}

// ── Sichere Einbettung in innerHTML / onclick (verhindert abgeschnittenes Detail bei Apostroph, <, riesigen data-URLs) ──
function mobDetEsc(s){
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function mobEscJsSingleQuoted(s){
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

// ── Desktop-Parität: Workflow-Übersicht + Zeiten-Verlauf (nur Lesen, gleiche Daten wie openAuftragDetail) ──
function mobWorkflowStatusHtmlForAuftrag(a){
  if(!a || !a.schritte) return '';
  var steps = ['grafik','druck','laminat','montage','doku'];
  var rows = '';
  steps.forEach(function(s){
    var sch = a.schritte[s];
    if(sch && typeof schrittMigrieren === 'function') schrittMigrieren(sch, s);
    var schStatus = sch ? (sch.status || 'offen') : 'offen';
    var SL = STEP_LABELS[s] || { title: s, col: '#888' };
    var col = SL.col;
    var isDone = schStatus === 'abgeschlossen';
    var isCurr = (s === a.step && schStatus !== 'abgeschlossen');
    var sm = isDone ? { lbl: '✓ Fertig', bg: col + '22', tc: col }
      : schStatus === 'in_bearbeitung' ? { lbl: '▶ In Arbeit', bg: col + '18', tc: col }
      : { lbl: '– Offen', bg: '#F2F2F7', tc: '#8E8E93' };
    var verant = sch ? (sch.verantwortlicherName || (String(sch.wer || '').split('+')[0] || '—').trim() || '—') : '—';
    var zus = (sch && sch.zusatzMaNames && sch.zusatzMaNames.length) ? (' · +' + sch.zusatzMaNames.join(', ')) : '';
    var clDone = sch && sch.checkliste ? sch.checkliste.filter(function(c){ return c.erledigt; }).length : 0;
    var clTot = sch && sch.checkliste ? sch.checkliste.length : 0;
    rows += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #ECECEC;background:' + (isCurr ? '#EAF4FF' : '#fff') + ';">'
      + '<div style="width:9px;height:9px;border-radius:50%;background:' + (isDone ? col : (isCurr ? col : '#DDD')) + ';flex-shrink:0;"></div>'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:12px;font-weight:' + (isCurr ? '800' : '600') + ';color:' + (isDone || isCurr ? col : '#8E8E93') + ';">' + mobDetEsc(SL.title) + '</div>'
        + '<div style="font-size:10px;color:#8E8E93;margin-top:2px;">👤 <strong style="color:#3C3C43;">' + mobDetEsc(verant) + '</strong>' + mobDetEsc(zus)
        + (sch && sch.zeit ? ' · ✓ ' + sch.zeit : '')
        + (clTot ? ' · 📋 ' + clDone + '/' + clTot : '')
        + '</div>'
      + '</div>'
      + '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:' + sm.bg + ';color:' + sm.tc + ';flex-shrink:0;">' + mobDetEsc(sm.lbl) + '</span>'
    + '</div>';
  });
  return '<div style="background:#fff;border-radius:12px;border:1px solid #E5E5EA;margin-bottom:16px;overflow:hidden;">'
    + '<div style="font-size:10px;font-weight:700;color:#8E8E93;padding:10px 12px 4px;text-transform:uppercase;letter-spacing:.04em;">Workflow-Status</div>'
    + rows
  + '</div>';
}

function mobVerlaufHtmlForAuftrag(a){
  if(!a) return '';
  var zeiten = (a.zeiten || []).slice().reverse().filter(function(z){
    return typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null && z.maId === MOB_MA_ID;
  });
  if(!zeiten.length) {
    return '<div style="font-size:12px;color:#8E8E93;padding:10px 12px;">Noch keine Zeitbuchungen</div>';
  }
  var groups = {};
  var order = [];
  zeiten.forEach(function(z){
    var dk = '—';
    if(z.start && String(z.start).length >= 10) {
      dk = z.start.indexOf('.') >= 0 ? String(z.start).substring(0, 10) : String(z.start).substring(0, 10);
    }
    if (!groups[dk]) { groups[dk] = []; order.push(dk); }
    groups[dk].push(z);
  });
  var WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var body = order.map(function(dk){
    var entries = groups[dk];
    var totalMin = entries.reduce(function(s, z){ return s + (z.dauer || 0); }, 0);
    var dayLbl = dk;
    try {
      var p = dk.split('.');
      if (p.length === 3) {
        var wd = new Date(+p[2], +p[1] - 1, +p[0]).getDay();
        dayLbl = WOCHENTAGE[wd] + '. · ' + dk;
      }
    } catch (e1) {}
    return '<div style="margin-bottom:8px;border-radius:10px;overflow:hidden;border:1px solid #E5E5EA;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#F0F4F8;">'
        + '<span style="font-size:11px;font-weight:700;color:#1C1C1E;">📅 ' + dayLbl + '</span>'
        + '<span style="font-size:11px;font-weight:800;color:#007AFF;">Σ ' + formatMinuten(totalMin) + '</span>'
      + '</div>'
      + entries.map(function(z, zi){
        var col = STEP_LABELS[z.step] ? STEP_LABELS[z.step].col : '#8E8E93';
        var title = STEP_LABELS[z.step] ? STEP_LABELS[z.step].title : (z.step || '—');
        var tStart = z.start && z.start.length > 10 ? z.start.substring(11, 16) : (z.start || '');
        var tEnd = z.end && z.end.length > 10 ? z.end.substring(11, 16) : (z.end || '');
        var timeStr = tStart + (tEnd ? ' – ' + tEnd : '');
        var border = zi < entries.length - 1 ? 'border-bottom:1px solid #ECECEC;' : '';
        return '<div style="display:flex;gap:0;align-items:stretch;' + border + '">'
          + '<div style="width:3px;background:' + col + ';flex-shrink:0;"></div>'
          + '<div style="display:flex;align-items:center;flex:1;padding:7px 10px;gap:6px;background:#fff;">'
            + '<div style="flex:1;min-width:0;">'
              + '<span style="font-size:11px;font-weight:700;color:' + col + ';">' + mobDetEsc(title) + '</span>'
              + '<span style="font-size:10px;color:#8E8E93;"> · 👤 ' + mobDetEsc(z.wer || '—') + '</span>'
            + '</div>'
            + '<div style="text-align:right;flex-shrink:0;">'
              + '<div style="font-size:10px;color:#8E8E93;">' + timeStr + '</div>'
              + '<div style="font-size:11px;font-weight:700;color:' + col + ';">' + formatMinuten(z.dauer || 0) + '</div>'
            + '</div>'
          + '</div>'
        + '</div>';
      }).join('')
    + '</div>';
  }).join('');
  return '<div style="background:#fff;border-radius:12px;border:1px solid #E5E5EA;margin-bottom:16px;overflow:hidden;">'
    + '<div style="font-size:10px;font-weight:700;color:#8E8E93;padding:10px 12px 4px;text-transform:uppercase;letter-spacing:.04em;">Arbeits-Verlauf</div>'
    + body
  + '</div>';
}

// Auftrag-Detail mit Aufgaben-Kontext (INTERN_AUFGABEN + AUFTRAEGE kombiniert)
// renderOpt.compact === true → Tab „Aufgaben“: kompakter Arbeitsscreen (ohne Workflow-Übersicht, Verlauf, Dateien/Fotos/Material/Chat als Blöcke).
function mobRenderAufgabeDetail(g, renderOpt){
  if (typeof console !== 'undefined' && console.log) {
    console.log('ACTIVE DETAIL PATH: mobRenderAufgabeDetail', g && g.id, g && g.auftragId, g);
  }
  window.__MOB_ACTIVE_DETAIL_PATH__ = 'mobRenderAufgabeDetail';
  window.__MOB_ACTIVE_DETAIL_PATH_AT__ = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  renderOpt = renderOpt || {};
  var compact;
  if (typeof renderOpt.compact === 'boolean') {
    compact = renderOpt.compact;
    window.__MOB_AUFG_DETAIL_COMPACT__ = compact;
  } else {
    compact = !!window.__MOB_AUFG_DETAIL_COMPACT__;
  }
  var skipFotoRefetch = !!(renderOpt && renderOpt.__mobPhotoCacheRefresh);
  var a   = AUFTRAEGE.find(function(x){ return x.id===g.auftragId; });
  if (a && !compact && !skipFotoRefetch) {
    mobMobFetchServerDateienUiPromise(a).then(function(){
      if (window.__MOB_ACTIVE_DETAIL_PATH__ !== 'mobRenderAufgabeDetail') return;
      if (String(window.__MOB_OPEN_AUFG_ID__ || '') !== String(g.id || '')) return;
      var g2 = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(g.id) : g;
      if (!g2) return;
      mobRenderAufgabeDetail(g2, { compact: false, __mobPhotoCacheRefresh: true });
    }).catch(function(){});
  }
  var sl  = STEP_LABELS[g.schritt]||{col:'#888',title:g.schritt};
  var laeuft = a && mobIstAuftragsZeitAktivFuerSchritt(g.auftragId, g.schritt);
  var gStatus = mobTaskStatusNorm(g.status);
  var stCol  = {offen:'#FF9500',in_arbeit:'#007AFF',fertig:'#34C759'}[gStatus]||'#8E8E93';
  var startGate = mobWorkflowStartFreigabe(g.auftragId, g.schritt, MOB_MA_ID);

  // Einzige Quelle: AUFTRAEGE.schritte[step].checkliste
  var sch = a && a.schritte && a.schritte[g.schritt];
  if(sch && schrittMigrieren) schrittMigrieren(sch, g.schritt);
  if(sch && (!sch.checkliste || !sch.checkliste.length)){
    var tpl = clChecklistenFuerSchritt(a, g.schritt);
    if(tpl.length){ sch.checkliste = tpl; mobSaveAuftrag(g.auftragId); }
  }
  var checks = (sch && sch.checkliste) ? sch.checkliste : [];
  var done   = checks.filter(function(c){return c.erledigt;}).length;
  var pct    = checks.length ? Math.round(done/checks.length*100) : 0;
  var barCol = pct===100?'#34C759':pct>50?'#FF9500':'#007AFF';

  var html = '<div style="padding:16px 16px 24px;" data-mob-detail-mode="'+(compact?'compact':'full')+'">'

    // ── Header ──────────────────────────────────────────
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:10px;font-weight:700;color:'+sl.col+';text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px;">'+sl.title+'</div>'
        +'<div style="font-size:20px;font-weight:800;color:#1C1C1E;line-height:1.2;">'+(g.fz||g.titel||'—')+'</div>'
        +'<div style="font-size:12px;color:#8E8E93;margin-top:3px;">'
          +(g.kunde||'—')+' · '+g.auftragId
          +(g.datum?' · 📅 '+g.datum:'')
          +(g.dauer?' · ⏱ '+g.dauer+'h':'')
        +'</div>'
        +(a&&a.paket?'<div style="font-size:11px;color:#8E8E93;margin-top:2px;">'+a.paket+(a.depot?' · '+a.depot:'')+'</div>':'')
      +'</div>'
      +'<button onclick="mobCloseAuftragDetail()" '
        +'style="flex-shrink:0;border:none;background:#F2F2F7;border-radius:50%;width:34px;height:34px;font-size:20px;cursor:pointer;color:#8E8E93;margin-left:10px;">×</button>'
    +'</div>'

    // ── Status-Buttons ───────────────────────────────────
    +'<div style="display:flex;gap:8px;margin-bottom:16px;">'
    +['offen','in_arbeit','fertig'].map(function(s){
      var on  = gStatus===s;
      var lbl = {offen:'Offen',in_arbeit:'▶ In Arbeit',fertig:'✓ Erledigt'}[s];
      var c   = {offen:'#FF9500',in_arbeit:'#007AFF',fertig:'#34C759'}[s];
      var dis = (s === 'in_arbeit' && !startGate.ok) ? ' disabled aria-disabled="true" title="'+mobDetEsc(startGate.grund || 'Wartet auf vorherige Schritte')+'"' : '';
      return '<button onclick="mobAufgabeStatusSetzen(\''+g.id+'\',\''+s+'\')" '+dis+' '
        +'style="flex:1;padding:10px 4px;border-radius:10px;border:2px solid '+(on?c:'#E5E5EA')+';'
        +'background:'+(on?c+'18':'#fff')+';color:'+(on?c:'#8E8E93')+';'
        +(s === 'in_arbeit' && !startGate.ok ? 'opacity:.5;cursor:not-allowed;' : '')
        +'font-size:11px;font-weight:'+(on?'700':'500')+';'+(s === 'in_arbeit' && !startGate.ok ? '' : 'cursor:pointer;')+'">'+lbl+'</button>';
    }).join('')
    +'</div>'

    // ── Workflow gesamt (wie Desktop „Workflow-Status“) + Hinweis — nur voller Modus (Home → ⋯) ──
    +(!compact && a ? mobWorkflowStatusHtmlForAuftrag(a) : '')
    +(!compact && a && g && g.schritt !== a.step ? '<div style="padding:10px 12px;background:#FFF8E1;border-radius:10px;border:1px solid #FFE082;margin-bottom:14px;font-size:12px;color:#856404;line-height:1.45;">'
      +'ℹ Der Auftrag steht auf <strong>'+((STEP_LABELS[a.step]&&STEP_LABELS[a.step].title)||a.step)+'</strong>. '
      +'Diese Karte betrifft deine Aufgabe <strong>'+sl.title+'</strong>. Zeiterfassung und Checkliste gelten für <strong>'+sl.title+'</strong>; „Weiter“ schaltet die <strong>Auftrags-Workflowstufe</strong> weiter.</div>' : '')

    // ── Auftrag-Infos ────────────────────────────────────
    +(a?'<div style="background:#F9F9F9;border-radius:12px;padding:12px 14px;margin-bottom:16px;">'
      +'<div style="font-size:10px;font-weight:700;color:#8E8E93;text-transform:uppercase;margin-bottom:8px;">AUFTRAGSINFO</div>'
      +(a.terminDatum?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #F0F0F0;">'
        +'<span style="font-size:12px;color:#8E8E93;">Starttermin</span>'
        +'<span style="font-size:12px;font-weight:600;color:#1C1C1E;">'+a.terminDatum.split('-').reverse().join('.')+'</span></div>':'')
      +(a.liefertermin?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #F0F0F0;">'
        +'<span style="font-size:12px;color:#8E8E93;">Liefertermin</span>'
        +'<span style="font-size:12px;font-weight:600;color:#1C1C1E;">'+String(a.liefertermin).substring(0,10).split('-').reverse().join('.')+'</span></div>':'')
      +(a.depot?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #F0F0F0;">'
        +'<span style="font-size:12px;color:#8E8E93;">Depot</span>'
        +'<span style="font-size:12px;font-weight:600;color:#1C1C1E;">'+a.depot+'</span></div>':'')
      +(a.urgent?'<div style="padding:4px 0;"><span style="font-size:11px;font-weight:700;color:#FF3B30;">🔴 DRINGEND</span></div>':'')
      +(a.prod&&a.prod.planung&&a.prod.planung.notiz?'<div style="padding:6px 0;font-size:12px;color:#3C3C43;">💬 '+a.prod.planung.notiz+'</div>':'')
    +'</div>':'')

    // ── Material / Auftrag-Info ─────────────────────────
    +(a&&(a.material||a.laminat||a.notizMontage||a.depot||a.montageDatum||a.leistungId||a.produktId)
      ?'<div style="background:#F0F7FF;border-radius:12px;padding:12px 14px;margin-bottom:16px;border-left:3px solid #007AFF;">'
        +'<div style="font-size:10px;font-weight:700;color:#007AFF;text-transform:uppercase;margin-bottom:8px;">PRODUKTION & MONTAGE</div>'
        +(a.leistungId?(function(){ var lc=ccLeistungById(a.leistungId); return lc?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #D4E8FF;">'
          +'<span style="font-size:12px;color:#5A7BA8;">Leistung</span>'
          +'<span style="font-size:12px;font-weight:600;color:#1C1C1E;max-width:65%;text-align:right;">'+(lc.ico?' '+lc.ico+' ':'')+lc.label+'</span></div>':'';})():'')
        +(a.produktId?(function(){ var pc=ccProduktById(a.produktId); return pc?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #D4E8FF;">'
          +'<span style="font-size:12px;color:#5A7BA8;">Produkt</span>'
          +'<span style="font-size:12px;font-weight:600;color:#1C1C1E;max-width:65%;text-align:right;">'+pc.label+'</span></div>':'';})():'')
        +(a.material?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #D4E8FF;">'
          +'<span style="font-size:12px;color:#5A7BA8;">Folie</span>'
          +'<span style="font-size:12px;font-weight:600;color:#1C1C1E;max-width:65%;text-align:right;">'+a.material+'</span></div>':'')
        +(a.laminat?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #D4E8FF;">'
          +'<span style="font-size:12px;color:#5A7BA8;">Laminat</span>'
          +'<span style="font-size:12px;font-weight:600;color:#1C1C1E;max-width:65%;text-align:right;">'+a.laminat+'</span></div>':'')
        +(a.depot?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #D4E8FF;">'
          +'<span style="font-size:12px;color:#5A7BA8;">Depot</span>'
          +'<span style="font-size:12px;font-weight:600;color:#1C1C1E;">'+a.depot+'</span></div>':'')
        +(a.montageDatum?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #D4E8FF;">'
          +'<span style="font-size:12px;color:#5A7BA8;">Montage</span>'
          +'<span style="font-size:12px;font-weight:600;color:#E65100;">'+a.montageDatum.split('-').reverse().join('.')+(a.montageZeit?' · '+a.montageZeit:'')+'</span></div>':'')
        +(a.notizMontage?'<div style="padding:5px 0;font-size:12px;color:#3C3C43;">📋 '+a.notizMontage+'</div>':'')
      +'</div>':'')
    +(a&&(a.flaeche||a.stueck||a.format||a.netto)?'<div style="background:#F9FBFF;border-radius:12px;padding:12px 14px;margin-bottom:16px;border:1px solid #D4E8FF;">'
      +'<div style="font-size:10px;font-weight:700;color:#007AFF;text-transform:uppercase;margin-bottom:8px;">Produktionsdaten</div>'
      +(a.flaeche?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E8EEF9;"><span style="font-size:12px;color:#5A7BA8;">Fläche (m²)</span><span style="font-size:12px;font-weight:600;">'+a.flaeche+'</span></div>':'')
      +(a.stueck?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E8EEF9;"><span style="font-size:12px;color:#5A7BA8;">Stück</span><span style="font-size:12px;font-weight:600;">'+a.stueck+'</span></div>':'')
      +(a.format?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E8EEF9;"><span style="font-size:12px;color:#5A7BA8;">Format</span><span style="font-size:12px;font-weight:600;">'+a.format+'</span></div>':'')
      +(a.netto?'<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="font-size:12px;color:#5A7BA8;">Netto (€)</span><span style="font-size:12px;font-weight:600;">'+a.netto+'</span></div>':'')
    +'</div>':'')

    // ── Bilder / Dateien ───────────────────────────────── (nur voller Modus)
    +(!compact && a?(function(){
      var alleDateien = mobMobListDateiRowsForUi(a).slice();
      var bilder = alleDateien.filter(function(f){
        return ((f.mimeType||'').startsWith('image/') || (f.dataUrl||f.data||'').startsWith('data:image')) && (f.dataUrl||f.data);
      });
      if(!bilder.length) return '';
      return '<div style="background:#FFF;border-radius:12px;padding:12px 14px;margin-bottom:16px;border:1px solid #E5E5EA;">'
        +'<div style="font-size:10px;font-weight:700;color:#8E8E93;text-transform:uppercase;margin-bottom:10px;">📎 DATEIEN & BILDER ('+bilder.length+')</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:8px;">'
        +bilder.map(function(f){
          var src = f.dataUrl||f.data||'';
          var label = f.typ||f.name||'Bild';
          return '<div style="position:relative;width:90px;height:90px;border-radius:10px;overflow:hidden;border:2px solid #E5E5EA;" onclick="ccLightbox(\''+mobEscJsSingleQuoted(src)+'\',\''+mobEscJsSingleQuoted(label)+'\')">'
            +'<img src="'+src+'" style="width:100%;height:100%;object-fit:cover;">'
            +'<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.55);padding:3px 5px;font-size:9px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+mobDetEsc(label)+'</div>'
            +'</div>';
        }).join('')
        +'</div></div>';
    })():'')

    // ── Zeiterfassung ────────────────────────────────────
    +(a?(function(){
      var soll = g.dauer||0;
      var gebuchtMin = (a.zeiten||[]).filter(function(z){return z.maId===MOB_MA_ID;}).reduce(function(s,z){return s+z.dauer;},0);
      var sollMin    = soll * 60;
      var pct        = sollMin>0 ? Math.min(100, Math.round(gebuchtMin/sollMin*100)) : 0;
      var barCol     = pct>=100?'#FF3B30':pct>=75?'#FF9500':'#34C759';
      return '<div style="background:#0A1929;border-radius:14px;padding:14px 16px;margin-bottom:16px;">'
        +'<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;margin-bottom:10px;">ZEITERFASSUNG — '+sl.title.toUpperCase()+'</div>'
        // Soll vs Ist
        +(sollMin>0
          ?'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
            +'<span style="font-size:11px;color:rgba(255,255,255,.5);">Soll: <b style="color:#fff;">'+soll+'h</b></span>'
            +'<span style="font-size:11px;color:rgba(255,255,255,.5);">Ist: <b style="color:'+barCol+';">'+formatMinuten(gebuchtMin)+'</b></span>'
          +'</div>'
          +'<div style="height:4px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;margin-bottom:12px;">'
            +'<div style="height:100%;width:'+pct+'%;background:'+barCol+';border-radius:2px;"></div>'
          +'</div>'
          :'')
        +'<div class="ma-btn-row" style="margin-top:0;">'
        +(laeuft
          ?'<button type="button" class="ma-start-btn" onclick="mobInternZeitStop(\''+g.auftragId+'\',\''+g.schritt+'\')" style="background:#FF3B30;">⏹ Stop</button>'
          :'<button type="button" class="ma-start-btn" onclick="mobInternZeitStart(\''+g.auftragId+'\',\''+g.schritt+'\')" '
            +(startGate.ok ? 'style="background:#34C759;"' : 'disabled aria-disabled="true" title="'+mobDetEsc(startGate.grund || 'Wartet auf vorherige Schritte')+'" style="background:#C7C7CC;cursor:not-allowed;opacity:.8;"')
            +'>'
            +(startGate.ok ? '▶ Start Arbeit' : '⏳ Wartet auf vorherige Schritte')
            +'</button>')
        +'</div>'
        +(!laeuft && !startGate.ok
          ?'<div style="margin-top:8px;font-size:11px;color:#FF9500;">'+mobDetEsc(startGate.grund || 'Wartet auf vorherige Schritte')+'</div>'
          :'')
        +(gebuchtMin>0
          ?'<div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,.35);">⏱ Gesamt dieser Schritt: '+formatMinuten(gebuchtMin)+'</div>'
          :'')
      +'</div>';
    })():'')

    // ── Arbeits-Verlauf (wie Desktop „⏱ Arbeits-Verlauf“) — nur voller Modus ──
    +(!compact && a ? mobVerlaufHtmlForAuftrag(a) : '')

    // ── Weiter-Button ────────────────────────────────────
    +(a&&a.step!=='abgeschlossen'&&STEP_LABELS[a.step]&&STEP_LABELS[a.step].next
      ?'<button type="button" class="ma-step-btn ma-step-btn--block" onclick="mobStepWeiter(\''+g.auftragId+'\')" style="margin-bottom:16px;">→ Weiter: '+(STEP_LABELS[a.step].nextLabel||'Nächster Schritt')+'</button>'
      :'')

    // ── Checkliste ───────────────────────────────────────
    +(checks.length
      ?(function(){
        // Pflicht-Punkte zählen extra
        var pflichtTotal = checks.filter(function(c){return c.kat==='pflicht';}).length;
        var pflichtDone  = checks.filter(function(c){return c.kat==='pflicht'&&c.erledigt;}).length;
        var fotoTotal    = checks.filter(function(c){return c.kat==='foto';}).length;
        var fotoDone     = checks.filter(function(c){return c.kat==='foto'&&c.erledigt;}).length;

        // Kategorien-Sektionen
        var katDef = [
          {id:'pflicht', ico:'🔴', label:'Pflicht',  bg:'#FEECEC', col:'#FF3B30'},
          {id:'foto',    ico:'📷', label:'Fotos',    bg:'#EEF4FF', col:'#007AFF'},
          {id:'optional',ico:'⚪', label:'Optional', bg:'#F2F2F7', col:'#8E8E93'},
        ];

        var sektionen = katDef.map(function(k){
          var items = checks.map(function(c,ci){return {c:c,ci:ci};}).filter(function(x){return (x.c.kat||'pflicht')===k.id;});
          if(!items.length) return '';
          var kDone  = items.filter(function(x){return x.c.erledigt;}).length;
          var kTotal = items.length;
          return '<div style="margin-bottom:12px;">'
            +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'
              +'<span style="font-size:11px;">'+k.ico+'</span>'
              +'<span style="font-size:10px;font-weight:700;color:'+k.col+';text-transform:uppercase;letter-spacing:.05em;flex:1;">'+k.label+'</span>'
              +'<span style="font-size:10px;font-weight:700;color:'+(kDone===kTotal?'#34C759':k.col)+';">'+kDone+'/'+kTotal+(kDone===kTotal?' ✓':'')+'</span>'
            +'</div>'
            +items.map(function(x){
              var c=x.c; var ci=x.ci;
              return '<label style="display:flex;align-items:flex-start;gap:12px;padding:13px 12px;'
                +'background:'+(c.erledigt?'#F0FFF4':'#FAFAFA')+';'
                +'border-radius:12px;margin-bottom:5px;cursor:pointer;'
                +'border:1.5px solid '+(c.erledigt?'#34C75955':'#F0F0F0')+';'
                +'box-shadow:0 1px 3px rgba(0,0,0,.04);">'
                +'<input type="checkbox" '+(c.erledigt?'checked':'')+' '
                +'onchange="mobAufgCheckToggle(\''+g.id+'\','+ci+',this.checked)" '
                +'style="width:24px;height:24px;accent-color:#34C759;cursor:pointer;flex-shrink:0;margin-top:0;">'
                +'<div style="flex:1;min-width:0;">'
                  +'<div style="font-size:13px;font-weight:'+(c.erledigt?'400':'600')+';line-height:1.4;'
                    +(c.erledigt?'text-decoration:line-through;color:#B0B0B8;':'color:#1C1C1E;')+'">'+mobDetEsc(c.text)+'</div>'
                  +(c.hinweis?'<div style="font-size:11px;color:#8E8E93;margin-top:3px;line-height:1.3;">ℹ '+mobDetEsc(c.hinweis)+'</div>':'')
                +'</div>'
                +(c.erledigt?'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="3" style="flex-shrink:0;margin-top:2px;"><polyline points="20 6 9 17 4 12"/></svg>':'')
              +'</label>';
            }).join('')
          +'</div>';
        }).join('');

        return '<div style="margin-bottom:16px;">'
          // Header + Gesamtfortschritt
          +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
            +'<div style="font-size:12px;font-weight:800;color:#1C1C1E;flex:1;">📋 Checkliste · '+sl.title+'</div>'
            +'<div style="font-size:11px;font-weight:700;color:'+barCol+';">'+done+'/'+checks.length+'</div>'
          +'</div>'
          // Fortschrittsbalken
          +'<div style="height:7px;background:#E5E5EA;border-radius:4px;margin-bottom:14px;overflow:hidden;">'
            +'<div style="height:100%;width:'+pct+'%;background:'+(pct===100?'#34C759':pct>60?'#FF9500':'#007AFF')+';border-radius:4px;transition:width .4s;"></div>'
          +'</div>'
          // Pflicht-Kurzstatus-Zeile
          +(pflichtTotal>0
            ?'<div style="display:flex;gap:8px;margin-bottom:12px;">'
              +'<div style="flex:1;background:'+(pflichtDone===pflichtTotal?'#E8F9EF':'#FEECEC')+';border-radius:10px;padding:8px 10px;text-align:center;">'
                +'<div style="font-size:16px;font-weight:800;color:'+(pflichtDone===pflichtTotal?'#34C759':'#FF3B30')+';">'+pflichtDone+'/'+pflichtTotal+'</div>'
                +'<div style="font-size:9px;font-weight:700;color:'+(pflichtDone===pflichtTotal?'#34C759':'#FF3B30')+';">PFLICHT</div>'
              +'</div>'
              +(fotoTotal>0
                ?'<div style="flex:1;background:'+(fotoDone===fotoTotal?'#E8F9EF':'#EEF4FF')+';border-radius:10px;padding:8px 10px;text-align:center;">'
                  +'<div style="font-size:16px;font-weight:800;color:'+(fotoDone===fotoTotal?'#34C759':'#007AFF')+';">'+fotoDone+'/'+fotoTotal+'</div>'
                  +'<div style="font-size:9px;font-weight:700;color:'+(fotoDone===fotoTotal?'#34C759':'#007AFF')+';">FOTOS</div>'
                +'</div>'
                :'')
            +'</div>'
            :'')
          // Kategorien
          +sektionen
        +'</div>';
      })()
      :'<div style="padding:14px;background:#F2F2F7;border-radius:12px;text-align:center;font-size:13px;color:#8E8E93;margin-bottom:16px;">Keine Checkliste für diesen Schritt</div>'
    )

    // ── Fotos — nur voller Modus (VORHER/NACHHER × Positionen; Tab „Fotos“ = Schnellzugriff) ──
    +(compact ? '' : mobMobFotoHtmlBereich(a, g.schritt))

    // ── Notizen ────────────────────────────────────────── (nur voller Modus)
    +(!compact && a&&(a.prod&&a.prod.planung&&a.prod.planung.notiz||a.notizProduktion||a.notizBesonderheiten)
      ?'<div style="background:#FFFBF0;border-radius:12px;padding:12px 14px;margin-bottom:16px;border-left:3px solid #FF9500;">'
        +'<div style="font-size:10px;font-weight:700;color:#FF9500;text-transform:uppercase;margin-bottom:6px;">NOTIZEN</div>'
        +(a.notizProduktion?'<div style="font-size:12px;color:#3C3C43;margin-bottom:4px;">📋 '+a.notizProduktion+'</div>':'')
        +(a.notizBesonderheiten?'<div style="font-size:12px;color:#3C3C43;margin-bottom:4px;">⚠ '+a.notizBesonderheiten+'</div>':'')
        +(a.prod&&a.prod.planung&&a.prod.planung.notiz?'<div style="font-size:12px;color:#3C3C43;">💬 '+a.prod.planung.notiz+'</div>':'')
      +'</div>'
      :'')

    // ── Material-Verbrauch ─────────────────────────────────────── (nur voller Modus)
    +(function(){
      if(!a || compact) return '';
      var isDruck   = g.schritt === 'druck';
      var eintraege = (a.materialVerbrauch||[]);

      // Schnellauswahl-Buttons (Folie) aus MAT_BIBLIOTHEK (optional — fehlende Bib verursachte vorher Abbruch des gesamten Detail-HTML)
      var folieOpts = [];
      if (typeof MAT_BIBLIOTHEK !== 'undefined' && MAT_BIBLIOTHEK) {
        folieOpts = (MAT_BIBLIOTHEK.folien || []).concat(MAT_BIBLIOTHEK.druckmaterialien || []);
      }
      var datalistHtml = '<datalist id="mob-mat-datalist">'
        + folieOpts.map(function(f){ return '<option value="'+mobDetEsc(String(f))+'">'; }).join('')
        +'</datalist>';

      return '<div style="margin-bottom:16px;">'
        // Abschnitt-Titel
        +'<div style="font-size:11px;font-weight:700;color:#1C1C1E;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">📦 Material-Verbrauch</div>'

        // ── Eingabe-Block ────────────────────────────────────────
        +'<div style="background:#F2F2F7;border-radius:14px;padding:14px;margin-bottom:10px;">'
          +'<div style="font-size:10px;font-weight:700;color:#8E8E93;text-transform:uppercase;margin-bottom:10px;">VERBRAUCH EINTRAGEN</div>'

          // Für DRUCK: Maschinen-Auswahl
          +(isDruck
            ?'<div style="margin-bottom:10px;">'
              +'<div style="font-size:11px;font-weight:600;color:#3C3C43;margin-bottom:6px;">Druckmaschine</div>'
              +'<div style="display:flex;gap:8px;">'
                +'<button id="mob-mat-maschine-800" onclick="document.getElementById(\'mob-mat-maschine\').value=\'HP Latex 800\';'
                  +'this.style.background=\'#007AFF\';this.style.color=\'#fff\';'
                  +'var b=document.getElementById(\'mob-mat-maschine-560\');b.style.background=\'#E5E5EA\';b.style.color=\'#3C3C43\';" '
                  +'style="flex:1;padding:11px 8px;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;background:#E5E5EA;color:#3C3C43;transition:all .15s;">HP 800</button>'
                +'<button id="mob-mat-maschine-560" onclick="document.getElementById(\'mob-mat-maschine\').value=\'HP Latex 560\';'
                  +'this.style.background=\'#007AFF\';this.style.color=\'#fff\';'
                  +'var b=document.getElementById(\'mob-mat-maschine-800\');b.style.background=\'#E5E5EA\';b.style.color=\'#3C3C43\';" '
                  +'style="flex:1;padding:11px 8px;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;background:#E5E5EA;color:#3C3C43;transition:all .15s;">HP 560</button>'
              +'</div>'
              +'<input type="hidden" id="mob-mat-maschine">'
            +'</div>'
            :'')

          // Material / Folie Eingabefeld
          +'<div style="margin-bottom:8px;">'
            +'<div style="font-size:11px;font-weight:600;color:#3C3C43;margin-bottom:5px;">'+(isDruck?'Tatsächliche Folie / Druckmaterial':'Material / Folie')+'</div>'
            +'<input id="mob-mat-folie" type="text" '
              +'placeholder="'+(isDruck?'z.B. ORAJET 3551 weiß glänzend 137cm':'z.B. ORAGUARD 200M matt 137cm')+'" '
              +'list="mob-mat-datalist" autocomplete="off" '
              +'style="width:100%;padding:12px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:13px;background:#fff;-webkit-appearance:none;">'
            +datalistHtml
          +'</div>'

          // Menge + Einheit
          +'<div style="display:flex;gap:8px;margin-bottom:8px;">'
            +'<div style="flex:1;">'
              +'<div style="font-size:11px;font-weight:600;color:#3C3C43;margin-bottom:5px;">Menge</div>'
              +'<input id="mob-mat-menge" type="number" step="0.1" min="0" placeholder="z.B. 4.5" '
                +'style="width:100%;padding:12px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:13px;background:#fff;">'
            +'</div>'
            +'<div style="width:100px;">'
              +'<div style="font-size:11px;font-weight:600;color:#3C3C43;margin-bottom:5px;">Einheit</div>'
              +'<select id="mob-mat-einheit" style="width:100%;padding:12px 8px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:13px;background:#fff;-webkit-appearance:none;text-align:center;">'
                +'<option value="m²">m²</option>'
                +'<option value="lfm">lfm</option>'
                +'<option value="Stk">Stk</option>'
                +'<option value="kg">kg</option>'
              +'</select>'
            +'</div>'
          +'</div>'

          // Für DRUCK: Druckdatei-Feld
          +(isDruck
            ?'<div style="margin-bottom:8px;">'
              +'<div style="font-size:11px;font-weight:600;color:#3C3C43;margin-bottom:5px;">Druckdatei / Job-Name</div>'
              +'<input id="mob-mat-datei" type="text" placeholder="z.B. Bus_Mustermann_v2_FINAL" '
                +'style="width:100%;padding:12px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:13px;background:#fff;">'
            +'</div>'
            // Für andere Schritte: Notiz-Feld
            :'<div style="margin-bottom:8px;">'
              +'<div style="font-size:11px;font-weight:600;color:#3C3C43;margin-bottom:5px;">Notiz (optional)</div>'
              +'<input id="mob-mat-notiz" type="text" placeholder="z.B. Restrolle, anderes Format verwendet …" '
                +'style="width:100%;padding:12px;border:1.5px solid #E5E5EA;border-radius:10px;font-size:13px;background:#fff;">'
            +'</div>')

          // Speichern-Button
          +'<button onclick="mobMatEintragen(\''+g.id+'\')" '
            +'style="width:100%;padding:14px;background:#34C759;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;margin-top:2px;">✓ Eintragen</button>'
        +'</div>'

        // ── Liste eingetragener Materialien ──────────────────────
        +(eintraege.length
          ?'<div>'
            +eintraege.map(function(e,ei){
              var stepLbl=(STEP_LABELS[e.schritt]&&STEP_LABELS[e.schritt].title)||e.schritt||'';
              var stepCol=(STEP_LABELS[e.schritt]&&STEP_LABELS[e.schritt].col)||'#888';
              var ts=e.ts?e.ts.substring(0,16).replace('T',' '):'';
              return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#fff;border-radius:12px;border:1px solid #E5E5EA;margin-bottom:6px;">'
                +'<div style="flex:1;min-width:0;">'
                  +'<div style="font-size:13px;font-weight:600;color:#1C1C1E;margin-bottom:2px;line-height:1.3;">'+mobDetEsc(e.material)+'</div>'
                  +'<div style="font-size:11px;color:#8E8E93;line-height:1.4;">'
                    +(e.menge&&e.menge!=='—'?'<b style="color:#3C3C43;">'+mobDetEsc(e.menge)+' '+mobDetEsc(e.einheit)+'</b> · ':'')
                    +(e.maschine?'🖨 <b style="color:#007AFF;">'+mobDetEsc(e.maschine)+'</b> · ':'')
                    +(stepLbl?'<span style="font-size:10px;font-weight:700;color:'+stepCol+';">'+mobDetEsc(stepLbl.toUpperCase())+'</span> · ':'')
                    +(e.ma?mobDetEsc(e.ma)+' · ':'')
                    +mobDetEsc(ts)
                  +'</div>'
                  +(e.datei?'<div style="font-size:11px;color:#007AFF;margin-top:3px;">🖨 '+mobDetEsc(e.datei)+'</div>':'')
                  +(e.notiz?'<div style="font-size:11px;color:#8E8E93;margin-top:2px;">💬 '+mobDetEsc(e.notiz)+'</div>':'')
                +'</div>'
                +'<button onclick="mobMatEntfernen(\''+g.id+'\','+ei+')" '
                  +'style="flex-shrink:0;border:none;background:none;color:#FF3B30;font-size:20px;cursor:pointer;padding:0 2px;line-height:1;">×</button>'
              +'</div>';
            }).join('')
          +'</div>'
          :'<div style="font-size:12px;color:#C7C7CC;padding:2px 0 4px;text-align:center;">Noch kein Material eingetragen</div>'
        )
      +'</div>';
    })()

  // ── KOMMUNIKATION / CHAT ────────────────────────────────────── (nur voller Modus)
  +(!compact && a ? '<div id="mob-auftrag-kommunikation" style="scroll-margin-top:72px;margin-bottom:14px;">'
      +'<div id="mob-aufg-chat-container-'+g.id+'" style="background:#fff;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.06);"></div>'
    +'</div>' : '')

  +'</div>';

  try {
    document.getElementById('mob-detail-inner').innerHTML = html;
    var _mobDi = document.getElementById('mob-detail-inner');
    if (_mobDi) {
      _mobDi.setAttribute('data-mob-active-detail-path', 'mobRenderAufgabeDetail');
      _mobDi.setAttribute('data-mob-active-detail-path-at', String(window.__MOB_ACTIVE_DETAIL_PATH_AT__));
      _mobDi.setAttribute('data-mob-detail-mode', compact ? 'compact' : 'full');
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('mobRenderAufgabeDetail innerHTML', err);
    document.getElementById('mob-detail-inner').innerHTML = '<div style="padding:16px;font-size:14px;color:#FF3B30;">Anzeigefehler beim Aufbau der Detailseite. Bitte Seite neu laden oder Support informieren.</div>';
    var _mobDiErr = document.getElementById('mob-detail-inner');
    if (_mobDiErr) _mobDiErr.setAttribute('data-mob-active-detail-path', 'mobRenderAufgabeDetail:innerHTML-error');
  }
  // Chat: dieselbe RAM-Quelle wie Desktop (`a.kommentare` aus reload → bemerkung-Payload)
  if(a && !compact) renderChatBereich(a.id, 'mob-aufg-chat-container-'+g.id);
  else if(typeof mobUpdateNachrichtenBadge === 'function') mobUpdateNachrichtenBadge();
}

function mobAufgabeStatusSetzen(aufgId, status){
  var g = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(aufgId) : null;
  if(!g) return;
  var ns = mobTaskStatusNorm(status);
  if(ns === 'in_arbeit' || ns === 'fertig'){
    var gate = mobWorkflowStartFreigabe(g.auftragId, g.schritt, MOB_MA_ID);
    if(!gate.ok){
      if(typeof showToast === 'function') showToast('⛔ ' + (gate.grund || 'Wartet auf vorherige Schritte'));
      return;
    }
  }
  if(ns === 'fertig' || ns === 'offen') mobStopAuftragsZeitFallsLaeuft(g.auftragId, g.schritt);

  if(mobCcinternCockpitMount()){
    var a = typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, g.auftragId); }) : null;
    var sch = a && mobSchrittObjektFuerAuftragUndStep(a, g.schritt);
    if(!a || !sch){
      if(typeof showToast === 'function') showToast('Aufgabe bitte im Auftrag bearbeiten');
      return;
    }
    var stepKey = mobCanonicalWorkflowStep(g.schritt || '');
    if(ns === 'fertig'){
      sch.status = 'abgeschlossen';
      sch.fertig = true;
      if(typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID){
        sch.erledigtVonMaId = MOB_MA_ID;
        var meName = '';
        if(typeof MA_DATA !== 'undefined' && Array.isArray(MA_DATA)){
          var mm = MA_DATA.find(function(m){ return m && mobMaIdGleichCompat(m.maId, MOB_MA_ID); });
          if(mm) meName = String(mm.n || mm.name || '').trim();
        }
        if(!meName && typeof maByID === 'function'){
          var mb = maByID(MOB_MA_ID);
          if(mb) meName = String(mb.n || mb.name || '').trim();
        }
        sch.erledigtVonName = meName || '';
        sch.erledigtAm = new Date().toISOString();
      }
    } else if(ns === 'in_arbeit'){
      sch.status = 'in_bearbeitung';
      sch.fertig = false;
      delete sch.erledigtAm;
      delete sch.erledigtVonMaId;
      delete sch.erledigtVonName;
    } else {
      sch.status = 'offen';
      sch.fertig = false;
      delete sch.erledigtAm;
      delete sch.erledigtVonMaId;
      delete sch.erledigtVonName;
    }
    if(typeof schrittMigrieren === 'function') schrittMigrieren(sch, stepKey);
    mobSaveAuftrag(g.auftragId);
    g.status = ns;
    if(g.status === 'fertig' && !g.erledigtTs) g.erledigtTs = sch.erledigtAm || new Date().toISOString();
    if(g.status !== 'fertig') delete g.erledigtTs;
  } else {
    g.status = ns;
    if(g.status === 'fertig' && !g.erledigtTs){
      g.erledigtTs = new Date().toISOString();
    }
    if(g.status !== 'fertig'){
      delete g.erledigtTs;
    }
    if(typeof saveAufgaben === 'function') saveAufgaben();
  }
  if(typeof renderMitarbeiter === 'function') renderMitarbeiter();
  mobRenderAufgabeDetail(g);
  mobRenderHome();
  if(typeof MOB_AKTIV_TAB !== 'undefined' && MOB_AKTIV_TAB === 'aufgaben') mobRenderAlle();
  if(typeof showToast === 'function') showToast('✓ '+({offen:'Offen',in_arbeit:'In Arbeit',fertig:'Erledigt'}[g.status]||g.status));
}

// ── Material-Verbrauch: Eintragen ─────────────────────────────
function mobMatEintragen(aufgId){
  var g = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(aufgId) : null;
  if(!g) return;
  var a = AUFTRAEGE.find(function(x){ return x.id===g.auftragId; });
  if(!a) return;
  if(!a.materialVerbrauch) a.materialVerbrauch=[];

  var maName = '';
  var maObj  = typeof maByID === 'function' ? maByID(MOB_MA_ID) : null;
  if(maObj) maName = maObj.n || maObj.name || '';

  var isDruck = g.schritt === 'druck';
  var folie   = (document.getElementById('mob-mat-folie')  ||{}).value || '';
  var menge   = (document.getElementById('mob-mat-menge')  ||{}).value || '';
  var einheit = (document.getElementById('mob-mat-einheit')||{}).value || 'm²';

  if(!folie){ showToast('⚠ Bitte Material eingeben'); return; }

  var eintrag = {
    material: folie,
    menge:    menge || '—',
    einheit:  einheit,
    schritt:  g.schritt,
    maId:     MOB_MA_ID,
    ma:       maName,
    ts:       new Date().toISOString(),
  };

  if(isDruck){
    var maschine = (document.getElementById('mob-mat-maschine')||{}).value || '';
    var datei    = (document.getElementById('mob-mat-datei')   ||{}).value || '';
    if(maschine) eintrag.maschine = maschine;
    if(datei)    eintrag.datei    = datei;
  } else {
    var notiz = (document.getElementById('mob-mat-notiz')||{}).value || '';
    if(notiz) eintrag.notiz = notiz;
  }

  a.materialVerbrauch.push(eintrag);
  mobSaveAuftrag(a.id);

  // Felder leeren
  ['mob-mat-folie','mob-mat-menge','mob-mat-datei','mob-mat-notiz'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value='';
  });
  // Maschinen-Buttons zurücksetzen
  ['mob-mat-maschine-800','mob-mat-maschine-560'].forEach(function(id){
    var btn = document.getElementById(id);
    if(btn){ btn.style.background='#E5E5EA'; btn.style.color='#3C3C43'; }
  });
  var mEl = document.getElementById('mob-mat-maschine');
  if(mEl) mEl.value='';

  showToast('✓ Material eingetragen');
  mobRenderAufgabeDetail(g);
}

// ── Material-Verbrauch: Löschen ────────────────────────────────
function mobMatEntfernen(aufgId, idx){
  var g = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(aufgId) : null;
  if(!g) return;
  var a = AUFTRAEGE.find(function(x){ return x.id===g.auftragId; });
  if(!a || !a.materialVerbrauch) return;
  a.materialVerbrauch.splice(idx, 1);
  mobSaveAuftrag(a.id);
  mobRenderAufgabeDetail(g);
}

function mobRenderDetail(auId){
  if (typeof console !== 'undefined' && console.log) {
    console.log('ACTIVE DETAIL PATH: mobRenderDetail', auId);
  }
  window.__MOB_ACTIVE_DETAIL_PATH__ = 'mobRenderDetail';
  window.__MOB_ACTIVE_DETAIL_PATH_AT__ = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var a=AUFTRAEGE.find(function(x){return x.id===auId;});
  if(!a) {
    var _mobNoA = document.getElementById('mob-detail-inner');
    if (_mobNoA) _mobNoA.setAttribute('data-mob-active-detail-path', 'mobRenderDetail:no-auftrag');
    return;
  }
  window.__MOB_OPEN_AUFG_ID__ = null;
  MOB_AKTIV_AUF = auId;
  mobMobFetchServerDateienUiPromise(a).then(function(){
    if (MOB_AKTIV_AUF === auId && window.__MOB_ACTIVE_DETAIL_PATH__ === 'mobRenderDetail') mobRenderDetailInner(auId);
  }).catch(function(){});
  mobRenderDetailInner(auId);
}

function mobRenderDetailInner(auId){
  var a=AUFTRAEGE.find(function(x){return x.id===auId;});
  if(!a) return;
  // Arbeitszeit-Block ausblenden wenn Detail geöffnet
  var _zb=document.getElementById('mob-zeiterfassung-block');
  if(_zb) _zb.style.display='none';
  var sl=STEP_LABELS[a.step]||{title:a.step,col:'#888'};
  var steps=['grafik','druck','laminat','montage','doku','abgeschlossen'];
  var curIdx=steps.indexOf(a.step);

  // Fortschrittsbalken
  var progPct=Math.round((curIdx/(steps.length-1))*100);

  // Zeiterfassung für diesen Auftrag
  var key=(typeof window !== 'undefined' && typeof window.zeitAktivKey === 'function')
    ? window.zeitAktivKey(auId, a.step)
    : (auId+'_'+a.step);
  var laeuft=!!ZEIT_AKTIV[key];

  // Req. 1: Schritt-eigene Checkliste (kanonisch); Legacy nur nach Hydration
  var schAkt = a.schritte && a.schritte[a.step];
  if(schAkt) schrittMigrieren(schAkt, a.step);
  var capiMob = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if (capiMob && typeof capiMob.ccInternHydrateSchrittChecklisteFromLegacy === 'function') {
    capiMob.ccInternHydrateSchrittChecklisteFromLegacy(a);
  }
  var startGateDetail = mobWorkflowStartFreigabe(auId, a.step, MOB_MA_ID);
  var useSchrittMob = !!(schAkt && Array.isArray(schAkt.checkliste) && schAkt.checkliste.length);
  var checks = useSchrittMob ? schAkt.checkliste : (a.checklisten||[]);

  var html='<div style="padding:16px;">'
    // Header
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
    +'<div><div style="font-size:13px;font-weight:700;color:'+sl.col+';">'+a.id+'</div>'
    +'<div style="font-size:18px;font-weight:800;color:#1C1C1E;">'+a.fz+'</div>'
    +'<div style="font-size:12px;color:#8E8E93;">'+a.paket+' · '+a.depot+'</div></div>'
    +'<button onclick="mobCloseAuftragDetail()" style="border:none;background:#F2F2F7;border-radius:50%;width:32px;height:32px;font-size:18px;cursor:pointer;color:#8E8E93;">×</button>'
    +'</div>'

    // Fortschritt
    +'<div style="margin-bottom:14px;">'
    +'<div style="display:flex;justify-content:space-between;margin-bottom:5px;">'
    +'<span style="font-size:11px;font-weight:700;color:'+sl.col+';">'+sl.title+'</span>'
    +'<span style="font-size:11px;color:#8E8E93;">'+progPct+'%</span></div>'
    +'<div style="height:6px;background:#E5E5EA;border-radius:3px;overflow:hidden;">'
    +'<div style="height:100%;width:'+progPct+'%;background:'+sl.col+';border-radius:3px;transition:width .3s;"></div>'
    +'</div></div>'

    // Produktionsschritte
    +'<div style="display:flex;gap:4px;margin-bottom:14px;overflow-x:auto;padding-bottom:4px;">'
    +steps.filter(function(s){return s!=='abgeschlossen';}).map(function(s,i){
      var isDone=steps.indexOf(a.step)>i;
      var isCurr=a.step===s;
      var sc=STEP_LABELS[s]||{title:s,col:'#888'};
      return '<div style="flex:0 0 auto;padding:5px 10px;border-radius:20px;font-size:10px;font-weight:700;'
        +'background:'+(isDone?sc.col:isCurr?sc.col+'22':'#F2F2F7')+';'
        +'color:'+(isDone?'#fff':isCurr?sc.col:'#8E8E93')+';white-space:nowrap;">'+sc.title+'</div>';
    }).join('')
    +'</div>'

    // Zeiterfassung für diesen Schritt
    +'<div style="background:#0A1929;border-radius:12px;padding:14px;margin-bottom:14px;">'
    +'<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4);margin-bottom:8px;">ZEITERFASSUNG — '+sl.title.toUpperCase()+'</div>'
    +'<div class="ma-btn-row" style="margin-top:0;">'
    +(laeuft
      ?'<button type="button" class="ma-start-btn" onclick="mobInternZeitStop(\''+auId+'\',\''+a.step+'\');mobRenderDetail(\''+auId+'\')" style="background:#FF3B30;">⏹ Stop</button>'
      :'<button type="button" class="ma-start-btn" onclick="mobInternZeitStart(\''+auId+'\',\''+a.step+'\');mobRenderDetail(\''+auId+'\')" '
        +(startGateDetail.ok
          ?'style="background:#34C759;"'
          :'disabled aria-disabled="true" title="'+mobDetEsc(startGateDetail.grund || 'Wartet auf vorherige Schritte')+'" style="background:#C7C7CC;cursor:not-allowed;opacity:.8;"')
        +'>'
        +(startGateDetail.ok ? '▶ Start Arbeit' : '⏳ Wartet auf vorherige Schritte')
        +'</button>'
    )
    +'</div></div>'
    +(!laeuft && !startGateDetail.ok
      ?'<div style="margin:-8px 0 12px;padding:8px 10px;background:#FFF8E1;border-radius:8px;font-size:11px;color:#FF9500;line-height:1.35;">'+mobDetEsc(startGateDetail.grund || 'Wartet auf vorherige Schritte')+'</div>'
      :'')

    // Schritt weiterschieben
    +(a.step!=='abgeschlossen'&&STEP_LABELS[a.step]&&STEP_LABELS[a.step].next
      ?'<button type="button" class="ma-step-btn ma-step-btn--block" onclick="mobStepWeiter(\''+auId+'\')" style="margin-bottom:14px;">→ Weiter: '+STEP_LABELS[a.step].nextLabel+'</button>'
      :'')

    // Produkt & Leistung Info
    +((a.leistungId||a.produktId||a.material||a.laminat||a.montageDatum)
      ?(function(){
        var lc = a.leistungId ? ccLeistungById(a.leistungId) : null;
        var pc = a.produktId  ? ccProduktById(a.produktId)  : null;
        var rows = '';
        if(lc) rows += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E5E5EA;"><span style="font-size:12px;color:#8E8E93;">Leistung</span><span style="font-size:12px;font-weight:600;color:#1C1C1E;max-width:60%;text-align:right;">'+(lc.ico?lc.ico+' ':'')+lc.label+'</span></div>';
        if(pc) rows += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E5E5EA;"><span style="font-size:12px;color:#8E8E93;">Produkt</span><span style="font-size:12px;font-weight:600;color:#1C1C1E;max-width:60%;text-align:right;">'+pc.label+'</span></div>';
        if(a.material) rows += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E5E5EA;"><span style="font-size:12px;color:#8E8E93;">Folie</span><span style="font-size:12px;font-weight:600;color:#1C1C1E;max-width:60%;text-align:right;">'+a.material+'</span></div>';
        if(a.laminat)  rows += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E5E5EA;"><span style="font-size:12px;color:#8E8E93;">Laminat</span><span style="font-size:12px;font-weight:600;color:#1C1C1E;max-width:60%;text-align:right;">'+a.laminat+'</span></div>';
        if(a.montageDatum) rows += '<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="font-size:12px;color:#8E8E93;">Montage</span><span style="font-size:12px;font-weight:700;color:#E65100;">'+a.montageDatum.split('-').reverse().join('.')+(a.montageZeit?' · '+a.montageZeit:'')+'</span></div>';
        if(!rows) return '';
        return '<div style="background:#F0F7FF;border-radius:12px;padding:12px 14px;margin-bottom:14px;border-left:3px solid #007AFF;">'
          +'<div style="font-size:10px;font-weight:700;color:#007AFF;text-transform:uppercase;margin-bottom:8px;">PRODUKTION & MONTAGE</div>'
          +rows+'</div>';
      })():'')

    // Dateien / Bilder aus Auftrag
    +(function(){
      var alleDateien = mobMobListDateiRowsForUi(a).slice();
      var bilder = alleDateien.filter(function(f){
        return ((f.mimeType||'').startsWith('image/') || (f.dataUrl||f.data||'').startsWith('data:image')) && (f.dataUrl||f.data);
      });
      if(!bilder.length) return '';
      return '<div style="background:#FFF;border-radius:12px;padding:12px 14px;margin-bottom:14px;border:1px solid #E5E5EA;">'
        +'<div style="font-size:10px;font-weight:700;color:#8E8E93;text-transform:uppercase;margin-bottom:10px;">📎 BILDER ('+bilder.length+')</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:8px;">'
        +bilder.map(function(f){
          var src = f.dataUrl||f.data||'';
          var label = f.typ||f.name||'Bild';
          return '<div style="position:relative;width:88px;height:88px;border-radius:10px;overflow:hidden;border:2px solid #E5E5EA;" onclick="ccLightbox(\''+src+'\',\''+label+'\')">'
            +'<img src="'+src+'" style="width:100%;height:100%;object-fit:cover;">'
            +'<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.55);padding:3px 5px;font-size:9px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+label+'</div>'
            +'</div>';
        }).join('')
        +'</div></div>';
    })()

    // Fotos (VORHER/NACHHER × Positionen, auftragsbezogen)
    +mobMobFotoHtmlBereich(a, a.step)

    // Checkliste
    +(checks.length
      ?'<div style="margin-bottom:14px;">'
        +'<div style="font-size:11px;font-weight:700;color:#3C3C43;margin-bottom:8px;">CHECKLISTE ('
          +checks.filter(function(c){return c.erledigt;}).length+'/'+checks.length+')</div>'
        +'<div style="height:4px;background:#E5E5EA;border-radius:2px;margin-bottom:10px;overflow:hidden;">'
          +'<div style="height:100%;width:'+Math.round(checks.filter(function(c){return c.erledigt;}).length/checks.length*100)+'%;background:#34C759;border-radius:2px;"></div>'
        +'</div>'
        +checks.map(function(c,ci){
          return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:'+(c.erledigt?'#F6FFF8':'#F9F9F9')+';border-radius:10px;margin-bottom:6px;">'
            +'<input type="checkbox" '+(c.erledigt?'checked':'')+' onchange="mobCheckToggle(\''+auId+'\','+ci+',this.checked)" style="width:20px;height:20px;accent-color:#34C759;cursor:pointer;flex-shrink:0;margin-top:1px;">'
            +'<div>'
              +'<div style="font-size:13px;'+(c.erledigt?'text-decoration:line-through;color:#8E8E93;':'color:#1C1C1E;')+'">'+c.text+'</div>'
              +(c.hinweis?'<div style="font-size:11px;color:#8E8E93;margin-top:2px;">'+c.hinweis+'</div>':'')
            +'</div>'
            +'</div>';
        }).join('')
      +'</div>'
      :'<div style="padding:12px;background:#F2F2F7;border-radius:10px;text-align:center;font-size:12px;color:#8E8E93;margin-bottom:14px;">Keine Checkliste für diesen Auftrag</div>'
    )

    // Chat-Bereich Placeholder (wird nach innerHTML gesetzt)
    +'<div id="mob-auftrag-kommunikation" style="scroll-margin-top:72px;margin-bottom:14px;">'
      +'<div id="mob-chat-container-'+auId+'" style="background:#fff;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.06);"></div>'
    +'</div>'

    +'</div>';

  document.getElementById('mob-detail-inner').innerHTML=html;
  var _mobDi2 = document.getElementById('mob-detail-inner');
  if (_mobDi2) {
    _mobDi2.setAttribute('data-mob-active-detail-path', 'mobRenderDetail');
    _mobDi2.setAttribute('data-mob-active-detail-path-at', String(window.__MOB_ACTIVE_DETAIL_PATH_AT__));
  }
  renderChatBereich(auId, 'mob-chat-container-'+auId);
}

/**
 * STEP_LABELS-Key + Schritt-Objekt zum aktuellen a.step (API kann Aliase / andere schritte-Keys nutzen).
 * @param {Record<string, unknown>|null|undefined} a
 * @returns {{ key: string, sl: { title?: string, next?: string|null, nextLabel?: string|null }|null, sch: Record<string, unknown>|null }}
 */
function mobStepLabelsEntryForAuftrag(a){
  var empty = { key: '', sl: null, sch: null };
  if (!a || typeof STEP_LABELS === 'undefined') return empty;
  var schResolved = typeof mobSchrittObjektFuerAuftragUndStep === 'function' ? mobSchrittObjektFuerAuftragUndStep(a, a.step) : null;
  var order = ['grafik', 'druck', 'laminat', 'montage', 'doku', 'abgeschlossen'];
  var i;
  var stepRaw = a.step;
  for (i = 0; i < order.length; i++) {
    var k = order[i];
    if (mobCanonicalWorkflowStep(k) !== mobCanonicalWorkflowStep(stepRaw)) continue;
    var sl = STEP_LABELS[k];
    var sch = schResolved || (typeof schrittDaten === 'function' ? schrittDaten(a, k) : null);
    return { key: k, sl: sl || null, sch: sch };
  }
  var sl0 = STEP_LABELS[stepRaw];
  var sch0 = schResolved || (typeof schrittDaten === 'function' ? schrittDaten(a, stepRaw) : null);
  return { key: stepRaw != null ? String(stepRaw) : '', sl: sl0 || null, sch: sch0 };
}

// ── Schritt weiterschalten (Req. 4+6+7) ─────────────────────────────
function mobStepWeiter(auId){
  var a=AUFTRAEGE.find(function(x){return x.id===auId;}); if(!a) return;
  var tie = mobStepLabelsEntryForAuftrag(a);
  var sl = tie.sl;
  if(!sl||!sl.next) return;
  var sch = tie.sch;
  var stepKey = tie.key;
  if(sch) schrittMigrieren(sch, stepKey);

  // Gleiche Freigabelogik wie Sichtbarkeit/Start.
  var gate = mobWorkflowStartFreigabe(auId, stepKey, MOB_MA_ID);
  if(!gate.ok){
    showToast('⛔ ' + (gate.grund || 'Kein Zugriff für diesen Schritt'));
    return;
  }

  mobMobMontageFotoPflichtLogVorAbschluss(a, stepKey);

  // Checklisten: nur Hinweis, kein Block (Pflichtfotos separat über schrittAbschliessbar)
  var check = typeof schrittAbschliessbar === 'function' ? schrittAbschliessbar(a, stepKey) : { ok: true };
  if(!check.ok){
    if(!confirm('⚠ ' + check.grund + '\n\nTrotzdem abschließen?')) return;
  }
  var offeneCl =
    typeof window !== 'undefined' && typeof window.ccInternZaehleOffeneChecklistenpunkte === 'function'
      ? window.ccInternZaehleOffeneChecklistenpunkte(a, stepKey)
      : 0;
  if (offeneCl > 0) {
    if (!confirm('Es sind noch Checklistenpunkte offen. Auftrag trotzdem fortsetzen?')) return;
  }

  if(!confirm('Schritt "'+sl.title+'" abschließen?')) return;

  // Zeiterfassung stoppen falls läuft (Schritt tolerant matchen)
  mobStopAuftragsZeitFallsLaeuft(auId, stepKey);

  // Req. 7: aktuellen Workflow-Schritt abschließen (nicht den ganzen Auftrag)
  var jetzt = new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})
    +' '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  var isoAm = new Date().toISOString();
  if(sch){
    sch.status='abgeschlossen'; sch.fertig=true; sch.zeit=jetzt;
    if(MOB_MA_ID){
      sch.erledigtVonMaId = MOB_MA_ID;
      var meName = '';
      if(typeof MA_DATA !== 'undefined' && Array.isArray(MA_DATA)){
        var mm = MA_DATA.find(function(m){ return m && mobMaIdGleichCompat(m.maId, MOB_MA_ID); });
        if(mm) meName = String(mm.n || mm.name || '').trim();
      }
      if(!meName && typeof maByID === 'function'){
        var mb = maByID(MOB_MA_ID);
        if(mb) meName = String(mb.n || mb.name || '').trim();
      }
      sch.erledigtVonName = meName || '';
      sch.erledigtAm = isoAm;
    }
  }

  // Auftrag → nächster Schritt; interne Aufgaben-Zeilen nur für den abgeschlossenen Schritt
  var currentStepCanon = mobCanonicalWorkflowStep(stepKey);
  var wgTxt = mobMobWeitergabeUntertitel(a, currentStepCanon);
  if(!mobCcinternCockpitMount()){
    INTERN_AUFGABEN.forEach(function(g){
      if(!mobAuftragIdsGleich(g.auftragId, auId)) return;
      if(mobCanonicalWorkflowStep(g.schritt) !== currentStepCanon) return;
      g.status = 'fertig';
      if(!g.erledigtTs) g.erledigtTs = isoAm;
      g.mobWeitergabeLabel = wgTxt;
    });
  }
  a.step = sl.next;

  // Nächsten Schritt auf in_bearbeitung (toleranter Key-Match wie mobSchrittObjektFuerAuftragUndStep)
  if(sl.next && sl.next!=='abgeschlossen'){
    var ns = typeof mobSchrittObjektFuerAuftragUndStep === 'function' ? mobSchrittObjektFuerAuftragUndStep(a, sl.next) : null;
    if(ns){
      schrittMigrieren(ns, sl.next);
      if(ns.status==='offen') ns.status='in_bearbeitung';
    }
  }
  if(sl.next==='abgeschlossen') a.rechnung='offen';

  if(!mobCcinternCockpitMount() && typeof saveAufgaben === 'function') saveAufgaben();
  mobSaveAuftrag(auId);
  if (!mobCcinternCockpitMount() && typeof mobSynchronisiereInternAufgabenMitWorkflow === 'function' && MOB_MA_ID) {
    mobSynchronisiereInternAufgabenMitWorkflow(MOB_MA_ID);
  }
  if (!mobCcinternCockpitMount() && typeof mobNachbessernInternAusDesktopKeys === 'function' && MOB_MA_ID) {
    mobNachbessernInternAusDesktopKeys(MOB_MA_ID);
  }
  renderKanban();
  mobRenderDetail(auId);
  mobRenderHome();
  if(typeof MOB_AKTIV_TAB !== 'undefined' && MOB_AKTIV_TAB === 'aufgaben') mobRenderAlle();
  showToast('✓ '+sl.title+' abgeschlossen → '+(sl.nextLabel || sl.next || ''));
}

/*
  Ziel später (Server-Ablage, noch nicht angebunden):
  SERVER/
    01_KUNDEN/
      Kunde/
        PROJEKTE/
          AUFTRAGSNUMMER/
            04_FOTOS/
              01_VORHER/
                01_FRONT/
                02_SEITE_1/
                03_SEITE_2/
                04_HECK/
              02_NACHHER/
                01_FRONT/
                02_SEITE_1/
                03_SEITE_2/
                04_HECK/
*/

/** Fahrzeug-Ansichten: feste Positionen (Mitarbeiter-App). Optional später: detail, schaden, innen. */
var MOB_FOTO_POSITION_KEYS = ['front', 'seite1', 'seite2', 'heck'];
var MOB_FOTO_POSITION_LABELS = { front: 'Front', seite1: 'Seite 1', seite2: 'Seite 2', heck: 'Heck' };
var MOB_FOTO_PHASE_KEYS = ['vorher', 'nachher'];
var MOB_FOTO_PHASE_LABELS = { vorher: 'VORHER', nachher: 'NACHHER', entwurf: 'ENTWURF' };

/** Zentraler Cache: Anzeige-Auftrags-ID → Zeilen aus GET …/dateien (Blob-URLs nur kurzfristig). */
if (typeof window !== 'undefined' && !window.__mobServerDateienUi) window.__mobServerDateienUi = {};

function mobMobCacheKey(a){
  if (!a || a.id == null) return '';
  return String(a.id);
}

function mobMobGetServerRows(a){
  var k = mobMobCacheKey(a);
  var g = typeof window !== 'undefined' ? window.__mobServerDateienUi : null;
  if (g && k && Array.isArray(g[k])) return g[k];
  return Array.isArray(a.__mobServerDateienUi) ? a.__mobServerDateienUi : [];
}

/**
 * Zeilen für App-Foto-UI: wie Desktop — wenn GET …/dateien Zeilen liefert, nur diese;
 * sonst lokale `a.dateien` / planung.dateien (z. B. frisch aus bemerkung-Payload) normalisieren.
 */
function mobMobNormalizeLocalDateienRows(a){
  if (!a || typeof a !== 'object') return [];
  var raw = []
    .concat(Array.isArray(a.dateien) ? a.dateien : [])
    .concat(
      Array.isArray(a.prod && a.prod.planung && a.prod.planung.dateien) ? a.prod.planung.dateien : [],
    );
  var out = [];
  var i;
  var d;
  var url;
  var apiTyp;
  var tl;
  for (i = 0; i < raw.length; i++) {
    d = raw[i];
    if (!d || typeof d !== 'object') continue;
    url = String(d.dataUrl || d.data || d.localUrl || '').trim();
    if (!url) continue;
    apiTyp =
      d.ccinternApiTyp != null && String(d.ccinternApiTyp).trim() !== ''
        ? String(d.ccinternApiTyp).trim().toLowerCase()
        : '';
    if (!apiTyp) {
      tl = String(d.typ || '').toLowerCase();
      if (tl.indexOf('layout') >= 0 && tl.indexOf('grafik') >= 0) apiTyp = 'layout_grafik';
      else if (tl.indexOf('finale') >= 0 && tl.indexOf('druck') >= 0) apiTyp = 'druckdatei';
      else if (tl.indexOf('druckdatei') >= 0 || (tl.indexOf('druck') >= 0 && tl.indexOf('final') >= 0))
        apiTyp = 'druckdatei';
      else if (tl.indexOf('nachher') >= 0) apiTyp = 'nachher';
      else if (tl.indexOf('vorher') >= 0) apiTyp = 'vorher';
      else if (tl.indexOf('montagefoto') >= 0 || (tl.indexOf('montage') >= 0 && tl.indexOf('foto') >= 0))
        apiTyp = 'montagefoto';
    }
    if (!apiTyp) continue;
    var phase = d.ccinternPhase != null ? String(d.ccinternPhase).trim() : '';
    var position = d.ccinternPosition != null ? String(d.ccinternPosition).trim() : '';
    var typUi =
      apiTyp === 'layout_grafik'
        ? 'Layout / Grafik'
        : apiTyp === 'druckdatei'
          ? 'Finale Druckdatei'
          : apiTyp === 'montagefoto'
            ? 'Montagefoto'
            : apiTyp === 'vorher' || apiTyp === 'nachher'
              ? apiTyp.charAt(0).toUpperCase() + apiTyp.slice(1)
              : apiTyp;
    out.push({
      data: url,
      localUrl: url,
      dataUrl: url,
      typ: typUi,
      mimeType: d.mimeType != null ? String(d.mimeType) : '',
      name: d.name != null ? String(d.name) : '',
      size: Number(d.size || 0),
      _src: 'local-datei',
      apiTyp: apiTyp,
      phase: phase,
      position: position,
    });
  }
  return out;
}

function mobMobListDateiRowsForUi(a){
  var srv = mobMobGetServerRows(a);
  var leg = mobMobNormalizeLocalDateienRows(a);
  var api =
    typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi
      ? window.CCIntern.cockpitApi
      : null;
  if (api && typeof api.mergeCcInternDateienDisplayRows === 'function') {
    return api.mergeCcInternDateienDisplayRows(srv, leg);
  }
  if (srv && srv.length) return srv;
  return leg;
}

function mobMobSetServerRows(a, rows){
  var arr = Array.isArray(rows) ? rows : [];
  var k = mobMobCacheKey(a);
  if (typeof window !== 'undefined'){
    if (!window.__mobServerDateienUi) window.__mobServerDateienUi = {};
    window.__mobServerDateienUi[k] = arr;
  }
  a.__mobServerDateienUi = arr;
}

/**
 * GET …/auftraege/:ccApiId/dateien als UI-Zeilen (inkl. Blob-URLs).
 * @param {{ ccApiId?: unknown, id?: unknown }} a
 * @returns {Promise<any[]>}
 */
function mobMobFetchServerDateienUiPromise(a){
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  var cid =
    a &&
    a.ccApiId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(a.ccApiId).trim())
      ? String(a.ccApiId).trim()
      : '';
  if (!cid || !api || typeof api.fetchCcInternAuftragDateienUi !== 'function'){
    return Promise.resolve(mobMobGetServerRows(a));
  }
  return api
    .fetchCcInternAuftragDateienUi(cid, a)
    .then(function(rows){
      mobMobSetServerRows(a, rows);
      return mobMobGetServerRows(a);
    })
    .catch(function(){
      return mobMobGetServerRows(a);
    });
}

function mobMontageAuftragsfotosPflichtSnapshot(a){
  var fehlend = [];
  var need = [];
  var ph, pos, k;
  for (var pi = 0; pi < MOB_FOTO_PHASE_KEYS.length; pi++){
    ph = MOB_FOTO_PHASE_KEYS[pi];
    for (var pj = 0; pj < MOB_FOTO_POSITION_KEYS.length; pj++){
      pos = MOB_FOTO_POSITION_KEYS[pj];
      need.push(ph + '|' + pos);
    }
  }
  var have = {};
  var srv = a ? mobMobListDateiRowsForUi(a) : [];
  if (srv.length){
    srv.forEach(function(row){
      if (!row || typeof row !== 'object') return;
      for (var pi = 0; pi < MOB_FOTO_PHASE_KEYS.length; pi++){
        ph = MOB_FOTO_PHASE_KEYS[pi];
        for (var pj = 0; pj < MOB_FOTO_POSITION_KEYS.length; pj++){
          pos = MOB_FOTO_POSITION_KEYS[pj];
          if (mobMobDateiRowMatchesSlot(row, ph, pos)){
            k = ph + '|' + pos;
            have[k] = true;
          }
        }
      }
    });
  }
  for (var ni = 0; ni < need.length; ni++){
    k = need[ni];
    if (!have[k]) fehlend.push(k);
  }
  return { ok: fehlend.length === 0, fehlend: fehlend };
}

/** Nur Konsolen-Log: Montage später mit Vorher/Nachher × 4 Positionen — noch nicht blockierend. */
function mobMobMontageFotoPflichtLogVorAbschluss(a, stepKey){
  if (!a) return;
  if (mobCanonicalWorkflowStep(stepKey || '') !== 'montage') return;
  var r = mobMontageAuftragsfotosPflichtSnapshot(a);
  if (typeof console !== 'undefined' && console.log){
    console.log('[mobMontageFotoPflicht vorbereitet, nicht blockierend]', String(a.id || ''), r.ok ? 'vollständig' : 'fehlt', (r.fehlend || []).join(', '));
  }
}

function mobMobFotoKundenfelder(a){
  if (!a) return { auftragId: '', auftragsnummer: '', kundeId: '', kundeName: '' };
  var auftragsnummer = (a.auftragsnummer != null && String(a.auftragsnummer).trim() !== '')
    ? String(a.auftragsnummer).trim()
    : String(a.id || '');
  var kundeId = '';
  if (a.kundeId != null && String(a.kundeId).trim() !== '') kundeId = String(a.kundeId).trim();
  else if (a.firmaId != null && String(a.firmaId).trim() !== '') kundeId = String(a.firmaId).trim();
  else if (a.firmenId != null && String(a.firmenId).trim() !== '') kundeId = String(a.firmenId).trim();
  var kundeName = String(a.kunde || a.kundenname || a.firma || '').trim();
  return { auftragId: a.id, auftragsnummer: auftragsnummer, kundeId: kundeId, kundeName: kundeName };
}

function mobMobFotoMitarbeiterMeta(){
  var mid = typeof MOB_MA_ID !== 'undefined' ? MOB_MA_ID : '';
  var name = '';
  if (mid && typeof maByID === 'function'){
    var mb = maByID(mid);
    if (mb) name = String(mb.n || mb.name || '').trim();
  }
  return { mitarbeiterId: mid, mitarbeiterName: name };
}

/**
 * Foto-Upload im Fotos-Tab: Sichtbarkeit = Berechtigung.
 * Wenn ein Auftrag im Fotos-Tab für den MA sichtbar ist, ist Upload erlaubt.
 */
function mobFotoUploadErlaubt(auftrag, schritt, aktuelleMaId){
  if (!auftrag || aktuelleMaId == null || String(aktuelleMaId).trim() === '') return false;
  return typeof mobAuftragHatMitarbeiterBezug === 'function'
    ? !!mobAuftragHatMitarbeiterBezug(auftrag, aktuelleMaId)
    : false;
}

function mobMobFotoThumbBadge(f){
  if (!f || typeof f !== 'object') return '';
  var parts = [];
  if (f.phase){
    var ph = String(f.phase).toLowerCase();
    parts.push(MOB_FOTO_PHASE_LABELS[ph] || f.phase);
  }
  if (f.position && MOB_FOTO_POSITION_LABELS[f.position]){
    parts.push(MOB_FOTO_POSITION_LABELS[f.position]);
  }
  return parts.join(' · ');
}

function mobMobFotoIstEntwurfFoto(f){
  if (!f || typeof f !== 'object') return false;
  if (String(f.fotoTyp || '').toLowerCase() === 'entwurf') return true;
  if (String(f.phase || '').toLowerCase() === 'entwurf') return true;
  if (String(f.position || '').toLowerCase() === 'entwurf') return true;
  return false;
}

/** Roh-`typ` aus GET …/dateien (nicht UI-Label aus `row.typ`). */
function mobMobDateiApiTypLower(row){
  if (!row || typeof row !== 'object') return '';
  var raw = row.apiTyp != null ? String(row.apiTyp) : '';
  return raw.trim().toLowerCase();
}

function mobMobEffectivePhaseLower(row){
  var ph = String(row.phase != null ? row.phase : '').trim().toLowerCase();
  if (ph) return ph;
  var t = mobMobDateiApiTypLower(row);
  if (t === 'vorher' || t === 'nachher' || t === 'entwurf') return t;
  return '';
}

function mobMobEffectivePositionLower(row){
  return String(row.position != null ? row.position : '').trim().toLowerCase();
}

/**
 * ENTWURF-Bucket: Layout/Druckdatei-Typen oder explizit phase entwurf (GET …/dateien, keine a.fotos).
 * Keine Vorher/Nachher-Zuordnung hier.
 */
function mobMobDateiRowIstEntwurfBucket(row){
  if (!row || typeof row !== 'object') return false;
  var phE = mobMobEffectivePhaseLower(row);
  if (phE === 'vorher' || phE === 'nachher') return false;
  if (phE === 'entwurf') return true;
  var t = mobMobDateiApiTypLower(row);
  if (t === 'layout_grafik' || t === 'druckdatei' || t === 'entwurf') return true;
  return false;
}

/** Liegt die Zeile in einem VORHER/NACHHER-Positionsslot? (für Montage-Strip ohne Doppelung) */
function mobMobDateiRowIstStrukturierterVorNachSlot(row){
  var phE = mobMobEffectivePhaseLower(row);
  if (phE !== 'vorher' && phE !== 'nachher') return false;
  var po = mobMobEffectivePositionLower(row);
  return MOB_FOTO_POSITION_KEYS.indexOf(po) >= 0;
}

/** Server-API-Zeile (`fetchCcInternAuftragDateienUi`) → Slot (phase/position UI). */
function mobMobDateiRowMatchesSlot(row, phaseSlot, posSlot){
  var ph = String(phaseSlot || '').toLowerCase();
  var po = String(posSlot || '').toLowerCase();
  if (ph === 'entwurf' && po === 'entwurf') return mobMobDateiRowIstEntwurfBucket(row);
  if (ph === 'vorher' || ph === 'nachher'){
    if (!mobMobDateiRowIstStrukturierterVorNachSlot(row)) return false;
    return mobMobEffectivePhaseLower(row) === ph && mobMobEffectivePositionLower(row) === po;
  }
  return false;
}

function mobMobIstFahrzeugLeistung(a){
  return !!(a && (a.leistungId === 'fahrzeug' || a.leistungId === 'bus_bahn'));
}

/** History-Sync für Vollbild: ein pushState-Eintrag pro Overlay (Hardware-Zurück schließt nur das Bild). */
if (typeof window !== 'undefined' && typeof window.__mobImgFsHistoryPushed === 'undefined') {
  window.__mobImgFsHistoryPushed = false;
}
if (typeof window !== 'undefined' && typeof window.__mobImgFsFromPopstate === 'undefined') {
  window.__mobImgFsFromPopstate = false;
}

function closeImageFullscreen(){
  if (typeof document === 'undefined') return;
  var ex = document.getElementById('imgFullscreen');
  var hadPushed =
    typeof window !== 'undefined' &&
    !!window.__mobImgFsHistoryPushed &&
    !window.__mobImgFsFromPopstate;
  if (ex) ex.remove();
  if (typeof window !== 'undefined') window.__mobImgFsHistoryPushed = false;
  if (hadPushed) {
    try {
      history.back();
    } catch (eB) {
      /* ignore */
    }
  }
}

if (typeof window !== 'undefined' && !window.__mobImgFsPopstateBound) {
  window.__mobImgFsPopstateBound = true;
  window.addEventListener('popstate', function mobImgFsOnPopstate(){
    if (typeof window === 'undefined') return;
    window.__mobImgFsFromPopstate = true;
    try {
      closeImageFullscreen();
    } finally {
      window.__mobImgFsFromPopstate = false;
    }
  });
}

/** Vollbild-Foto (WhatsApp-ähnlich): Overlay #imgFullscreen; Zurück-Taste / Klick schließen ohne Seitenwechsel. */
function openImageFullscreen(url){
  if (!url || typeof document === 'undefined') return;
  if (document.getElementById('imgFullscreen')) closeImageFullscreen();
  var pushedOk = false;
  try {
    history.pushState({ img: true }, '');
    pushedOk = true;
  } catch (eP) {
    /* ignore */
  }
  if (typeof window !== 'undefined') window.__mobImgFsHistoryPushed = pushedOk;
  var ov = document.createElement('div');
  ov.id = 'imgFullscreen';
  ov.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;z-index:9999;';
  var im = document.createElement('img');
  im.alt = '';
  im.src = url;
  im.style.cssText = 'max-width:100%;max-height:100%;';
  ov.appendChild(im);
  ov.onclick = function(){
    closeImageFullscreen();
  };
  document.body.appendChild(ov);
}
if (typeof window !== 'undefined') {
  window.openImageFullscreen = openImageFullscreen;
  window.closeImageFullscreen = closeImageFullscreen;
}

// ── MA-App: Hintergrund-Sync (Aufträge + Kommentare alle 60s) ──────────
// Lädt Aufträge automatisch neu → Kommentare kommen aus bemerkung-JSON mit.
// Guard verhindert doppelte Registrierung bei mehrfachem Modul-Load.
if (typeof window !== 'undefined' && !window.__mobHintergrundSyncAktiv) {
  window.__mobHintergrundSyncAktiv = true;
  var _mobSyncIv = null;

  /** Schneller Fingerabdruck: Anzahl Aufträge + Gesamtzahl Kommentare. */
  function _mobSyncFingerprint() {
    var aufl = (typeof AUFTRAEGE !== 'undefined' && Array.isArray(AUFTRAEGE)) ? AUFTRAEGE : [];
    var km = 0;
    aufl.forEach(function(a) { km += Array.isArray(a && a.kommentare) ? a.kommentare.length : 0; });
    return aufl.length + ':' + km;
  }

  /** Nach Poll: UI aktualisieren wenn sich etwas geändert hat. */
  function _mobSyncNachReload(fpVorher) {
    if (_mobSyncFingerprint() === fpVorher) return;
    // Badge immer aktualisieren
    if (typeof mobUpdateNachrichtenBadge === 'function') { try { mobUpdateNachrichtenBadge(); } catch(e){} }
    if (typeof mobSidebarBadge === 'function') { try { mobSidebarBadge(); } catch(e){} }
    // Home-View nur neu rendern wenn aktiv
    if (typeof MOB_AKTIV_TAB !== 'undefined' && MOB_AKTIV_TAB === 'home') {
      if (typeof mobRenderHome === 'function') { try { mobRenderHome(); } catch(e){} }
    }
    // Toast: ungelesene Kommentare oder allgemeine Aktualisierung
    if (typeof showToast === 'function') {
      var ungelesen = typeof mobCountUngeleseneNachrichten === 'function' ? mobCountUngeleseneNachrichten() : 0;
      if (ungelesen > 0) {
        showToast('📬 ' + ungelesen + ' ungelesene Nachricht' + (ungelesen === 1 ? '' : 'en'));
      } else {
        showToast('🔄 Aufträge aktualisiert');
      }
    }
  }

  /** Einmaliger Sync-Durchlauf (nur wenn MA eingeloggt). */
  function _mobHintergrundSync() {
    if (typeof MOB_MA_ID === 'undefined' || !MOB_MA_ID) return;
    var fp = _mobSyncFingerprint();
    mobReloadAuftraegeThen(function() { _mobSyncNachReload(fp); });
  }

  // Polling alle 60 Sekunden
  _mobSyncIv = setInterval(_mobHintergrundSync, 60000);

  // Sofort-Reload wenn Tab wieder in den Vordergrund kommt
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') _mobHintergrundSync();
    });
  }
}

function mobMobRowIsImageUrl(row){
  if (!row || typeof row !== 'object') return false;
  var mt = String(row.mimeType || '').toLowerCase();
  if (mt.indexOf('image/') === 0) return true;
  var u = String(row.data || row.localUrl || row.dataUrl || '');
  return u.indexOf('data:image') === 0;
}

function mobMobRowImageDataUrl(row){
  if (!row || !mobMobRowIsImageUrl(row)) return '';
  return String(row.data || row.localUrl || row.dataUrl || '');
}

/** Nicht-Bild (z. B. PDF) mit darstellbarer URL — für Link-Zeile unter den Thumbnails. */
function mobMobRowDocUrl(row){
  if (!row || typeof row !== 'object') return '';
  if (mobMobRowIsImageUrl(row)) return '';
  var u = String(row.data || row.localUrl || row.dataUrl || '').trim();
  return u || '';
}

function mobMobAttrEscImgSrc(u){
  return String(u || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function mobMobUrlsForTyp(a, typLower){
  var rows = a ? mobMobListDateiRowsForUi(a) : [];
  var tWant = String(typLower || '').toLowerCase();
  var urls = [];
  var seen = {};
  var i;
  var r;
  var u;
  var t;
  for (i = 0; i < rows.length; i++){
    r = rows[i];
    if (!r) continue;
    t = mobMobDateiApiTypLower(r);
    if (t !== tWant) continue;
    if (tWant === 'montagefoto' && mobMobDateiRowIstStrukturierterVorNachSlot(r)) continue;
    u = mobMobRowImageDataUrl(r);
    if (!u || seen[u]) continue;
    seen[u] = true;
    urls.push(u);
  }
  return urls;
}

/** Letztes passendes Bild pro Slot (API-Reihenfolge: neu hinten) — erneuter Upload ersetzt die Vorschau. */
function mobMobUrlsForSlot(a, ph, pos){
  var rows = a ? mobMobListDateiRowsForUi(a) : [];
  var i;
  var r;
  var u;
  for (i = rows.length - 1; i >= 0; i--){
    r = rows[i];
    if (!r || !mobMobDateiRowMatchesSlot(r, ph, pos)) continue;
    u = mobMobRowImageDataUrl(r);
    if (u) return [u];
  }
  return [];
}

function mobMobFotoThumbImgOnclickAttr(u){
  return (
    'onclick="event.preventDefault();event.stopPropagation();openImageFullscreen(\'' +
    mobEscJsSingleQuoted(u) +
    '\')"'
  );
}

/** Eine oder mehrere Vorschaubilder (GET …/dateien, nur Bild-MIME / data:image). */
function mobMobThumbStripHtml(urls){
  if (!urls || !urls.length) return '';
  var sty1 =
    'width:100%;height:70px;object-fit:cover;border-radius:6px;margin-top:10px;cursor:pointer;';
  var styN =
    'flex:0 0 auto;min-width:72px;width:120px;height:70px;object-fit:cover;border-radius:6px;margin-top:10px;cursor:pointer;';
  if (urls.length === 1){
    var u0 = urls[0];
    return (
      '<img src="' +
      mobMobAttrEscImgSrc(u0) +
      '" alt="" style="' +
      sty1 +
      '" ' +
      mobMobFotoThumbImgOnclickAttr(u0) +
      '>'
    );
  }
  var parts = [];
  var si;
  for (si = 0; si < urls.length; si++){
    var u = urls[si];
    if (!u) continue;
    parts.push(
      '<img src="' +
        mobMobAttrEscImgSrc(u) +
        '" alt="" style="' +
        styN +
        '" ' +
        mobMobFotoThumbImgOnclickAttr(u) +
        '>',
    );
  }
  if (!parts.length) return '';
  return (
    '<div style="display:flex;gap:4px;margin-top:0;overflow-x:auto;width:100%;-webkit-overflow-scrolling:touch;">' +
    parts.join('') +
    '</div>'
  );
}

/** PDF/Dokument-Links unter der Bildreihe (data:- oder blob:-URL). */
function mobMobDocLinksForTypHtml(a, typLower){
  var rows = a ? mobMobListDateiRowsForUi(a) : [];
  var tWant = String(typLower || '').toLowerCase();
  var parts = [];
  var seen = {};
  var i;
  var r;
  var u;
  var nm;
  for (i = 0; i < rows.length; i++) {
    r = rows[i];
    if (!r) continue;
    if (mobMobDateiApiTypLower(r) !== tWant) continue;
    if (tWant === 'montagefoto' && mobMobDateiRowIstStrukturierterVorNachSlot(r)) continue;
    u = mobMobRowDocUrl(r);
    if (!u || seen[u]) continue;
    seen[u] = true;
    nm = r.name != null && String(r.name).trim() ? String(r.name).trim() : 'Datei';
    parts.push(
      '<a href="' +
        mobMobAttrEscImgSrc(u) +
        '" download="' +
        mobMobAttrEscImgSrc(nm) +
        '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:6px 8px;background:#E8E8ED;border-radius:6px;font-size:10px;font-weight:600;color:#3C3C43;text-decoration:none;">📄 ' +
        mobDetEsc(nm) +
        '</a>',
    );
  }
  if (!parts.length) return '';
  return '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + parts.join('') + '</div>';
}

/** Obere Reihe wie Desktop: Layout / Grafik, Finale Druckdatei, Montagefoto (gleiche mobFotoHochladen-Parameter). */
function mobMobFotoOberreiheHtml(auId, sch, darf, a){
  var urlsLayout = mobMobUrlsForTyp(a, 'layout_grafik');
  var urlsDruck = mobMobUrlsForTyp(a, 'druckdatei');
  var urlsMont = mobMobUrlsForTyp(a, 'montagefoto');
  var cell = 'flex:1 1 100px;min-width:0;display:flex;flex-direction:column;align-items:stretch;';
  var btnLayout = !darf
    ? '<div style="' +
      cell +
      '"><span style="display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:8px;background:#F2F2F7;font-size:11px;font-weight:700;color:#C7C7CC;">Layout / Grafik</span>' +
      mobMobThumbStripHtml(urlsLayout) +
      mobMobDocLinksForTypHtml(a, 'layout_grafik') +
      '</div>'
    : '<div style="' +
      cell +
      '"><label style="display:flex;flex-direction:column;align-items:stretch;padding:8px 12px;border-radius:8px;background:#F3E5F5;font-size:11px;font-weight:700;color:#6A1B9A;cursor:pointer;border:1px solid rgba(106,27,154,.18);">'
      + '<span>🎨 Layout / Grafik</span>'
      + '<input type="file" accept="image/*,application/pdf,.pdf" multiple style="display:none;"'
      + ' onchange="mobFotoHochladen(this,\''+mobEscJsSingleQuoted(auId)+'\',\''+mobEscJsSingleQuoted(sch)+'\',\'entwurf\',\'entwurf\',\'layout\')"></label>'
      + mobMobThumbStripHtml(urlsLayout) +
      mobMobDocLinksForTypHtml(a, 'layout_grafik') +
      '</div>';
  var btnFin = !darf
    ? '<div style="' +
      cell +
      '"><span style="display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:8px;background:#F2F2F7;font-size:11px;font-weight:700;color:#C7C7CC;">Finale Druckdatei</span>' +
      mobMobThumbStripHtml(urlsDruck) +
      mobMobDocLinksForTypHtml(a, 'druckdatei') +
      '</div>'
    : '<div style="' +
      cell +
      '"><label style="display:flex;flex-direction:column;align-items:stretch;padding:8px 12px;border-radius:8px;background:#F3E5F5;font-size:11px;font-weight:700;color:#6A1B9A;cursor:pointer;border:1px solid rgba(106,27,154,.18);">'
      + '<span>🖨 Finale Druckdatei</span>'
      + '<input type="file" accept="image/*,application/pdf,.pdf" multiple style="display:none;"'
      + ' onchange="mobFotoHochladen(this,\''+mobEscJsSingleQuoted(auId)+'\',\''+mobEscJsSingleQuoted(sch)+'\',\'entwurf\',\'entwurf\',\'druckdatei\')"></label>'
      + mobMobThumbStripHtml(urlsDruck) +
      mobMobDocLinksForTypHtml(a, 'druckdatei') +
      '</div>';
  var btnMont = !darf
    ? '<div style="' +
      cell +
      '"><span style="display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:8px;background:#F2F2F7;font-size:11px;font-weight:700;color:#C7C7CC;">Montagefoto</span>' +
      mobMobThumbStripHtml(urlsMont) +
      mobMobDocLinksForTypHtml(a, 'montagefoto') +
      '</div>'
    : '<div style="' +
      cell +
      '"><label style="display:flex;flex-direction:column;align-items:stretch;padding:8px 12px;border-radius:8px;background:#FFF3E0;font-size:11px;font-weight:700;color:#E65100;cursor:pointer;border:1px solid rgba(230,81,0,.25);">'
      + '<span>📷 Montagefoto</span>'
      + '<input type="file" accept="image/*" capture="environment" style="display:none;"'
      + ' onchange="mobFotoHochladen(this,\''+mobEscJsSingleQuoted(auId)+'\',\''+mobEscJsSingleQuoted(sch)+'\',\'\',\'\')"'
      + '></label>'
      + mobMobThumbStripHtml(urlsMont) +
      mobMobDocLinksForTypHtml(a, 'montagefoto') +
      '</div>';
  return '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px;">'
    + btnLayout
    + btnFin
    + btnMont
    + '</div>';
}

/** Vorher/Nachher wie Desktop: zwei Grids (mobil 2 Spalten), Abstand dazwischen; mobFotoHochladen(phase,position) unverändert. */
function mobMobFotoVorherNachherGridHtml(auId, sch, darf, a){
  if (!mobMobIstFahrzeugLeistung(a)) return '';
  var stVor =
    'min-width:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px 6px;font-size:10px;font-weight:700;background:#E8F5E9;border-radius:8px;color:#1B5E20;border:1px solid #A5D6A7;line-height:1.25;';
  var stNach =
    'min-width:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px 6px;font-size:10px;font-weight:700;background:#ffe5cc;border-radius:8px;color:#a65300;border:1px solid #ffb380;line-height:1.25;';
  var gridSt = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;';
  function slot(ph, pos, lbl, isNach){
    var st =
      (isNach ? stNach : stVor) +
      (darf ? 'cursor:pointer;' : 'opacity:.55;cursor:default;') +
      'display:flex;flex-direction:column;align-items:stretch;';
    var urls = mobMobUrlsForSlot(a, ph, pos);
    var thumbs = mobMobThumbStripHtml(urls);
    if (!darf) {
      return '<div style="'+st+'"><div style="text-align:center;margin-bottom:4px;">'+lbl+'</div>'+thumbs+'</div>';
    }
    return (
      '<div style="' +
      st +
      '"><label style="display:flex;flex-direction:column;align-items:stretch;margin:0;cursor:pointer;">' +
      '<div style="text-align:center;margin-bottom:4px;">' +
      lbl +
      '</div>' +
      '<input type="file" accept="image/*" capture="environment" style="display:none;"' +
      ' data-ccintern-phase="' +
      ph +
      '" data-ccintern-position="' +
      pos +
      '"' +
      ' onchange="mobFotoHochladen(this,\'' +
      mobEscJsSingleQuoted(auId) +
      '\',\'' +
      mobEscJsSingleQuoted(sch) +
      '\',\'' +
      ph +
      '\',\'' +
      pos +
      '\')"' +
      '></label>' +
      thumbs +
      '</div>'
    );
  }
  return (
    '<div style="' +
    gridSt +
    '">' +
    slot('vorher','front','📷 Vorher Front (hoch)', false) +
    slot('vorher','seite1','📷 Vorher Seite 1 (quer)', false) +
    slot('vorher','seite2','📷 Vorher Seite 2 (quer)', false) +
    slot('vorher','heck','📷 Vorher Heck (hoch)', false) +
    '</div>' +
    '<div style="height:10px;"></div>' +
    '<div style="' +
    gridSt +
    '">' +
    slot('nachher','front','📷 Nachher Front (hoch)', true) +
    slot('nachher','seite1','📷 Nachher Seite 1 (quer)', true) +
    slot('nachher','seite2','📷 Nachher Seite 2 (quer)', true) +
    slot('nachher','heck','📷 Nachher Heck (hoch)', true) +
    '</div>'
  );
}

/** Auftragsbezogener Foto-Bereich — Desktop angeglichen: obere Flex-Reihe + Vorher/Nachher je 2-Spalten-Grid (nur Fahrzeug). */
function mobMobFotoHtmlBereich(a, schritt){
  if (!a) return '';
  var auId = a.id;
  var sch = schritt != null && String(schritt).trim() !== '' ? schritt : a.step;
  var darf = mobFotoUploadErlaubt(a, sch, MOB_MA_ID);
  var hinweis = !darf
    ? '<div style="font-size:11px;color:#FF9500;margin-bottom:8px;line-height:1.35;">⛔ Mitarbeiter nicht aktiv für diesen Schritt</div>'
    : '';
  return '<div style="margin-bottom:14px;">'
    + '<div style="font-size:11px;font-weight:700;color:#3C3C43;margin-bottom:8px;">Fotos</div>'
    + hinweis
    + mobMobFotoOberreiheHtml(auId, sch, darf, a)
    + mobMobFotoVorherNachherGridHtml(auId, sch, darf, a)
    + '</div>';
}

// ── Foto hochladen ───────────────────────────────
/**
 * Multipart-Felder für POST …/dateien/upload (Backend: typ + optional phase/position).
 * Entwurf: layout_grafik vs druckdatei anhand Datei; Vorher/Nachher: typ + phase + position.
 */
function mobMobUploadFelderFromSlot(phaseOk, posOk, file){
  if (phaseOk === 'entwurf' && posOk === 'entwurf'){
    var typUp = 'layout_grafik';
    if (file && (file.type === 'application/pdf' || /\.pdf$/i.test(String(file.name || '')))) typUp = 'druckdatei';
    return { typ: typUp, phase: 'entwurf', position: 'entwurf' };
  }
  if ((phaseOk === 'vorher' || phaseOk === 'nachher') && posOk){
    return { typ: phaseOk, phase: phaseOk, position: posOk };
  }
  return { typ: 'montagefoto' };
}

function mobFotoHochladen(inp, auId, schritt, phase, position, entwurfTypHint){
  if (!inp || !inp.files || !inp.files[0]) return;
  var a = AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, auId); });
  if (!a) return;
  var schEff = schritt != null && String(schritt).trim() !== '' ? schritt : a.step;
  if (!mobFotoUploadErlaubt(a, schEff, MOB_MA_ID)){
    if (typeof console !== 'undefined' && console.warn) console.warn('Foto-Upload blockiert', { auftragId: auId, schritt: schEff, ma: MOB_MA_ID });
    if (typeof showToast === 'function') showToast('⛔ Mitarbeiter nicht aktiv für diesen Schritt');
    inp.value = '';
    return;
  }
  var phaseOk = null;
  var posOk = null;
  var pStr = phase != null ? String(phase).toLowerCase() : '';
  var poStr = position != null ? String(position).toLowerCase() : '';
  if (pStr === 'entwurf' && poStr === 'entwurf'){
    phaseOk = 'entwurf';
    posOk = 'entwurf';
  } else {
    if (MOB_FOTO_PHASE_KEYS.indexOf(pStr) >= 0) phaseOk = pStr;
    if (MOB_FOTO_POSITION_KEYS.indexOf(poStr) >= 0) posOk = poStr;
  }
  var file = inp.files[0];
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  var cid =
    a.ccApiId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(a.ccApiId).trim())
      ? String(a.ccApiId).trim()
      : '';
  var felder;
  if (phaseOk === 'entwurf' && posOk === 'entwurf'){
    var hint = entwurfTypHint != null ? String(entwurfTypHint).toLowerCase() : '';
    if (hint === 'layout' || hint === 'layout_grafik'){
      felder = { typ: 'layout_grafik', phase: 'entwurf', position: 'entwurf' };
    } else if (hint === 'druckdatei' || hint === 'pdf' || hint === 'datei'){
      felder = { typ: 'druckdatei', phase: 'entwurf', position: 'entwurf' };
    } else {
      felder = mobMobUploadFelderFromSlot(phaseOk, posOk, file);
    }
  } else {
    felder = mobMobUploadFelderFromSlot(phaseOk, posOk, file);
  }

  function nachApiRefresh(){
    inp.value = '';
    function mobNachUploadDetailOffen(){
      var detEl = document.getElementById('mob-auftrag-detail');
      return (
        detEl &&
        detEl.style.display !== 'none' &&
        typeof MOB_AKTIV_AUF !== 'undefined' &&
        mobAuftragIdsGleich(MOB_AKTIV_AUF, auId)
      );
    }
    /** Nach Upload: Cache ist bereits per mobMobFetchServerDateienUiPromise aktuell — nur UI neu malen (kein erneuter GET im Aufgaben-Detail). */
    function mobNachUploadRefreshOpenDetail(){
      if (!mobNachUploadDetailOffen()) return;
      var aLoc = AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, auId); });
      if (!aLoc) return;
      if (window.__MOB_ACTIVE_DETAIL_PATH__ === 'mobRenderDetail') {
        mobRenderDetail(auId);
      } else if (window.__MOB_ACTIVE_DETAIL_PATH__ === 'mobRenderFotoView') {
        mobRenderFotoViewPaint(aLoc);
      } else if (window.__MOB_OPEN_AUFG_ID__) {
        var gRw = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(window.__MOB_OPEN_AUFG_ID__) : null;
        if (gRw) mobRenderAufgabeDetail(gRw, { __mobPhotoCacheRefresh: true });
      }
    }

    mobNachUploadRefreshOpenDetail();

    if (typeof MOB_AKTIV_TAB !== 'undefined' && MOB_AKTIV_TAB === 'fotos') {
      mobRenderFotos(function(){
        mobNachUploadRefreshOpenDetail();
      });
    } else if (typeof MOB_AKTIV_TAB !== 'undefined' && MOB_AKTIV_TAB === 'aufgaben') {
      mobRenderAlle();
    } else {
      mobRenderHome();
    }
    if (typeof showToast === 'function') showToast('📷 Foto gespeichert');
  }

  if (!cid || !api || typeof api.uploadCcInternAuftragDatei !== 'function'){
    if (typeof showToast === 'function') showToast('⚠ Auftrag muss gespeichert sein (API-ID)');
    inp.value = '';
    return;
  }

  function runUpload(blobFile){
    api.uploadCcInternAuftragDatei(cid, blobFile, felder).then(function(){
      return typeof api.reloadAuftraegeFromApiIntoMemory === 'function'
        ? api.reloadAuftraegeFromApiIntoMemory(null)
        : Promise.resolve(null);
    }).then(function(){
      var fresh = AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, auId); });
      return fresh ? mobMobFetchServerDateienUiPromise(fresh) : Promise.resolve(null);
    }).then(function(){
      nachApiRefresh();
    }).catch(function(err){
      if (typeof console !== 'undefined' && console.warn) console.warn(err);
      if (typeof showToast === 'function') showToast('⚠ Upload fehlgeschlagen');
      inp.value = '';
    });
  }

  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)){
    runUpload(file);
    return;
  }
  ccCompressImage(file, function(data, mime){
    try {
      fetch(data)
        .then(function(r){ return r.blob(); })
        .then(function(blob){
          var fn = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
          runUpload(new File([blob], fn, { type: mime || 'image/jpeg' }));
        })
        .catch(function(){
          if (typeof showToast === 'function') showToast('⚠ Upload-Vorbereitung fehlgeschlagen');
          inp.value = '';
        });
    } catch (e) {
      inp.value = '';
    }
  });
}

// ── Foto Vollbild ────────────────────────────────
// ══ ZENTRALE LIGHTBOX ════════════════════════════════════════════
// Verwendet überall im System — kein window.open (Popup-Blocker!)
function ccLightbox(src, name){
  if(!src) return;
  // Altes Overlay entfernen falls vorhanden
  var alt = document.getElementById('cc-lightbox-ov');
  if(alt) alt.remove();

  var ov = document.createElement('div');
  ov.id = 'cc-lightbox-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:99999;'
    +'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;'
    +'touch-action:manipulation;-webkit-tap-highlight-color:transparent;';

  var isImg = /\.(jpg|jpeg|png|gif|webp|svg|bmp)/i.test(name||'') || src.startsWith('data:image');
  var isPdf = /\.pdf$/i.test(name||'') || src.startsWith('data:application/pdf');

  ov.innerHTML =
    // Schließen-Button
    '<button id="cc-lb-close" '
      +'style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,.55);'
      +'border:none;color:#fff;border-radius:50%;width:44px;height:44px;font-size:26px;'
      +'cursor:pointer;z-index:2;line-height:1;backdrop-filter:blur(4px);">×</button>'
    // Dateiname
    +(name ? '<div style="position:absolute;bottom:56px;left:0;right:0;text-align:center;'
        +'color:rgba(255,255,255,.7);font-size:12px;padding:0 60px;'
        +'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+name+'</div>' : '')
    // Inhalt
    +(isImg
      ? '<img src="'+src+'" style="width:100vw;height:100vh;object-fit:contain;'
          +'display:block;" onclick="event.stopPropagation()">'
      : isPdf
        ? '<embed src="'+src+'" type="application/pdf" style="width:100vw;height:100vh;border-radius:0;">'
        : '<div style="background:#fff;border-radius:12px;padding:32px;text-align:center;">'
            +'<div style="font-size:48px;margin-bottom:12px;">📎</div>'
            +'<div style="font-size:14px;color:#333;">'+( name||'Datei')+'</div>'
            +'<a href="'+src+'" download="'+(name||'datei')+'" style="display:inline-block;margin-top:16px;'
              +'padding:8px 20px;background:#1565C0;color:#fff;border-radius:8px;text-decoration:none;'
              +'font-size:13px;font-weight:600;">⬇ Herunterladen</a>'
          +'</div>')
    // Download-Link (bei Bildern und PDFs)
    +(isImg||isPdf
      ? '<a href="'+src+'" download="'+(name||'datei')+'" '
          +'style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);'
          +'padding:7px 18px;background:rgba(255,255,255,.18);color:#fff;'
          +'border-radius:20px;text-decoration:none;font-size:12px;backdrop-filter:blur(4px);white-space:nowrap;">⬇ Download</a>'
      : '');

  ov.onclick = function(e){ if(e.target===ov) ov.remove(); };
  // Close-Button verdrahten
  var closeBtn = ov.querySelector('#cc-lb-close');
  if(closeBtn) closeBtn.onclick = function(){ ov.remove(); };
  // Escape-Taste schließt Lightbox
  var escHandler = function(e){ if(e.key==='Escape'){ ov.remove(); document.removeEventListener('keydown',escHandler); }};
  document.addEventListener('keydown', escHandler);
  document.body.appendChild(ov);
}

function mobFotoVoll(auId, idx){
  var a = AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, auId); });
  if (!a || !a.fotos) return;
  var f = a.fotos[idx];
  if (!f || typeof f !== 'object') return;
  var src = f.data || f.localUrl;
  if (!src) return;
  var cap = mobMobFotoThumbBadge(f);
  ccLightbox(src, f.dateiname || f.name || cap || ('Foto '+(idx+1)));
}
// ── Aufgaben-Checkliste abhaken — schreibt in AUFTRAEGE.schritte ─────
function mobAufgCheckToggle(aufgId, idx, val){
  var g = typeof mobFindAufgabeZeileById === 'function' ? mobFindAufgabeZeileById(aufgId) : null;
  if(!g) return;
  var a = AUFTRAEGE.find(function(x){ return x.id===g.auftragId; });
  var sch = a && a.schritte && a.schritte[g.schritt];
  var checks = (sch && sch.checkliste) ? sch.checkliste : null;
  if(!checks || !checks[idx]) return;
  checks[idx].erledigt = val;
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if (a && api && typeof api.logCcInternChecklistAuditFromUi === 'function') {
    api.logCcInternChecklistAuditFromUi(a, 'UI (Mob Aufgabe): schritte.checkliste nach Toggle', {
      aufgId: aufgId,
      schritt: g.schritt,
      idx: idx,
      val: val,
    });
  }
  var after = function(){
    mobRenderAufgabeDetail(g);
    var pflicht = checks.filter(function(c){return (c.kat||'pflicht')==='pflicht';});
    var pflichtDone = pflicht.filter(function(c){return c.erledigt;}).length;
    if(val && pflicht.length > 0 && pflichtDone === pflicht.length){
      showToast('✅ Alle Pflicht-Punkte erledigt!');
    }
    mobRenderHome();
  };
  mobSaveAuftrag(g.auftragId, typeof showToast === 'function' ? showToast : null).then(after).catch(after);
  return;
}

// ── Checkliste abhaken in mobRenderDetail (Req. 1: Schritt-Checkliste) ──
function mobCheckToggle(auId, idx, val){
  var a=AUFTRAEGE.find(function(x){return x.id===auId;}); if(!a) return;
  var capiH = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if (capiH && typeof capiH.ccInternHydrateSchrittChecklisteFromLegacy === 'function') {
    capiH.ccInternHydrateSchrittChecklisteFromLegacy(a);
  }
  var schAkt = a.schritte && a.schritte[a.step];
  if(schAkt) schrittMigrieren(schAkt, a.step);
  if(schAkt && schAkt.checkliste && schAkt.checkliste.length){
    if(schAkt.checkliste[idx]) schAkt.checkliste[idx].erledigt=val;
  } else if(a.checklisten && a.checklisten[idx]){
    a.checklisten[idx].erledigt=val;
  }
  var api = typeof window !== 'undefined' ? (window.CCIntern && window.CCIntern.cockpitApi) : null;
  if (api && typeof api.logCcInternChecklistAuditFromUi === 'function') {
    api.logCcInternChecklistAuditFromUi(a, 'UI (Mob Detail): checkliste nach Toggle', { auId: auId, idx: idx, val: val });
  }
  mobSaveAuftrag(auId, typeof showToast === 'function' ? showToast : null).then(function(){
    mobRenderDetail(auId);
  }).catch(function(){ mobRenderDetail(auId); });
}

// ── Tab wechseln ────────────────────────────────
function mobTab(tab){
  MOB_AKTIV_TAB=tab;

  // Offenes Auftrags-Detail beim Tab-Wechsel schließen (Sichtbarkeit steuert mobOpen… / mobClose…)
  var detClose = document.getElementById('mob-auftrag-detail');
  if(detClose) detClose.style.display = 'none';
  MOB_AKTIV_AUF = null;
  window.MOB_DETAIL_PREV_TAB = null;
  window.__MOB_AUFG_DETAIL_COMPACT__ = false;
  window.__MOB_OPEN_AUFG_ID__ = null;

  // Nav-Buttons färben + aktiven Pill hervorheben
  ['home','aufgaben','fotos','lager','urlaub'].forEach(function(t){
    var navBtn=document.getElementById('mob-nav-'+t);
    if(!navBtn) return;
    navBtn.style.color=(t===tab)?'#007AFF':'#8E8E93';
    var pill=navBtn.querySelector('div');
    if(pill) pill.style.background=(t===tab)?'#EAF4FF':'transparent';
  });

  // Home-Inhalte — mob-auftrag-detail nicht hier toggeln (bleibt geschlossen bis Klick)
  var homeShow = (tab==='home');
  var hcTab = document.getElementById('mob-home-content');
  if(hcTab) hcTab.style.display = homeShow ? '' : 'none';
  var zbTab = document.getElementById('mob-zeiterfassung-block');
  if(zbTab) zbTab.style.display = homeShow ? '' : 'none';

  // Tab-Divs
  ['aufgaben','fotos','lager','urlaub'].forEach(function(t){
    var td=document.getElementById('mob-tab-'+t);
    if(td) td.style.display=(t===tab)?'':'none';
  });

  // Render je Tab
  if(tab==='aufgaben') mobRenderAlle();
  if(tab==='fotos')    mobRenderFotos();
  if(tab==='lager')    mobRenderLager();
  if(tab==='urlaub')   mobRenderUrlaub();
  if(typeof mobUpdateNachrichtenBadge === 'function') mobUpdateNachrichtenBadge();
}

// ── Tab: Meine Aufgaben ─────────────────────────
function mobRenderAlle(){
  var el=document.getElementById('mob-alle-auftraege'); if(!el) return;
  var alle = mobAufgabenTabWorkflowZeilen(MOB_MA_ID).slice();
  var seenPassive = {};
  alle.forEach(function(g){
    seenPassive[String(g.auftragId || '') + '|' + mobCanonicalWorkflowStep(g.schritt || '')] = true;
  });
  AUFTRAEGE.forEach(function(a){
    if(!a || a.archiv) return;
    if(!mobAuftragIstCcInternProduktionsPool(a)) return;
    if(!mobAuftragHatMitarbeiterBezug(a, MOB_MA_ID)) return;
    var stepCanon = mobCanonicalWorkflowStep(a.step || '');
    if(!stepCanon || stepCanon === 'abgeschlossen') return;
    if(mobAuftragSchrittIstFuerMa(a, a.step, MOB_MA_ID)) return;
    var k = String(a.id || '') + '|' + stepCanon;
    if(seenPassive[k]) return;
    var sch = mobSchrittObjektFuerAuftragUndStep(a, a.step);
    alle.push({
      id: 'API-PASSIV' + MOB_RS_TAB + String(a.id) + MOB_RS_TAB + stepCanon + MOB_RS_TAB + String(MOB_MA_ID || ''),
      auftragId: a.id,
      fz: a.fz || '',
      kunde: a.kunde || a.kundenname || a.firma || a.firmenname || '—',
      schritt: stepCanon,
      status: sch ? mobTaskStatusNorm(sch.status || 'offen') : 'offen',
      datum: a.terminDatum || a.liefertermin || '',
      maId: MOB_MA_ID,
      maIds: mobSchrittMaIdsResolved(sch),
      teamMaIds: mobSchrittMaIdsResolved(sch),
      dauer: sch && sch.dauer ? sch.dauer : 0,
      _mobPassivBeteiligung: true,
    });
    seenPassive[k] = true;
  });
  if(!alle.length){
    el.innerHTML='<div style="background:#fff;border-radius:14px;padding:20px;text-align:center;color:#8E8E93;font-size:13px;">Keine Aufgaben zugewiesen</div>';
    if(typeof mobUpdateNachrichtenBadge === 'function') mobUpdateNachrichtenBadge();
    return;
  }

  var heute = new Date().toISOString().split('T')[0];
  function mobAufgabenTabMaKurz(v){
    if(v == null || String(v).trim() === '') return '';
    var m = typeof maByID === 'function' ? maByID(v) : null;
    if(m && m.av) return String(m.av).trim().toUpperCase();
    if(m && m.k) return String(m.k).trim().toUpperCase();
    if(m && m.n){
      return String(m.n).split(' ').map(function(p){ return p ? p[0] : ''; }).join('').slice(0, 2).toUpperCase();
    }
    return String(v).trim().slice(0, 2).toUpperCase();
  }
  function mobAufgabenTabTeamKompass(g, au){
    var sch = au && au.schritte ? mobSchrittObjektFuerAuftragUndStep(au, g.schritt) : null;
    var respId =
      (sch && (sch.verantwortlicher || sch.werId || sch.maId)) ||
      g.verantwortlicher || g.werId || g.maId || '';
    var respLabel = mobAufgabenTabMaKurz(respId) || '—';
    var ids = [];
    function addId(v){
      if(v == null || String(v).trim() === '') return;
      var s = String(v).trim();
      if(ids.indexOf(s) >= 0) return;
      ids.push(s);
    }
    if(Array.isArray(sch && sch.zusatzMa)) (sch.zusatzMa || []).forEach(addId);
    if(Array.isArray(sch && sch.maIds)) (sch.maIds || []).forEach(addId);
    if(Array.isArray(g.teamMaIds)) g.teamMaIds.forEach(addId);
    if(Array.isArray(g.maIds)) g.maIds.forEach(addId);
    addId(g.maId);
    ids = ids.filter(function(x){ return !mobMaIdGleichCompat(x, respId); });
    var teamTokens = ids.map(mobAufgabenTabMaKurz).filter(Boolean);
    var teamText = '👥 —';
    if(teamTokens.length){
      var visible = teamTokens.slice(0, 2).join(', ');
      var rest = teamTokens.length > 2 ? ' +' + (teamTokens.length - 2) : '';
      teamText = '👥 ' + visible + rest;
    }
    return {
      responsible: '👤 ' + respLabel + ' verantwortlich',
      team: teamText,
    };
  }
  function mobAufgabenTabErledigtTs(g, au){
    if(g && g.erledigtTs) return String(g.erledigtTs);
    if(au && g && g.schritt){
      var schE = mobSchrittObjektFuerAuftragUndStep(au, g.schritt);
      if(schE && schE.erledigtAm) return String(schE.erledigtAm);
    }
    if(!au || !Array.isArray(au.zeiten)) return '';
    var stepC = mobCanonicalWorkflowStep(g && g.schritt ? g.schritt : '');
    var z = au.zeiten.slice().reverse().find(function(x){
      if(!x) return false;
      if(mobCanonicalWorkflowStep(x.step || '') !== stepC) return false;
      if(x.maId == null || x.maId === '') return false;
      return mobMaIdGleichCompat(x.maId, MOB_MA_ID);
    });
    if(!z) return '';
    var ts = (z.erstellt || z.ts || '').toString();
    return ts && ts.indexOf('T') > 0 ? ts : '';
  }
  var renderTaskCard = function(g, isDone){
    var status = mobTaskStatusNorm(g.status);
    var skCanon = mobCanonicalWorkflowStep(g && g.schritt ? g.schritt : '');
    var sl    = STEP_LABELS[skCanon]||{col:'#888',title:g.schritt};
    var au    = AUFTRAEGE.find(function(x){ return x.id===g.auftragId; });
    var team = mobAufgabenTabTeamKompass(g, au);
    var isUeberf= !!(g.datum && g.datum<heute && status!=='fertig');
    var termin = g.datum || (au && au.terminDatum) || '';
    var isPassiv =
      !!(g && g._mobPassivBeteiligung) ||
      !!(au && mobAuftragHatMitarbeiterBezug(au, MOB_MA_ID) && !mobAuftragSchrittIstFuerMa(au, g.schritt, MOB_MA_ID));
    var stCol = isDone ? '#34C759' : (status === 'in_arbeit' ? '#007AFF' : (isUeberf ? '#FF3B30' : '#FF9500'));
    var stLbl = isDone ? (g.mobWeitergabeLabel ? 'Weitergabe' : 'Erledigt') : (status === 'in_arbeit' ? 'In Arbeit' : (isUeberf ? 'Überfällig' : 'Offen'));
    var doneTs = isDone ? mobAufgabenTabErledigtTs(g, au) : '';
    var doneLabel = '';
    if(doneTs){
      var d = new Date(doneTs);
      if(!isNaN(d.getTime())) doneLabel = d.toLocaleDateString('de-DE') + ' · ' + d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
    }

    return '<div onclick="mobOpenMobTaskCompactDetailFromAufgabenById(\''+mobEscJsSingleQuoted(g.id)+'\')" '
      +'style="background:#fff;border-radius:12px;margin-bottom:10px;padding:11px 12px;min-height:106px;'
      +'box-shadow:0 1px 5px rgba(0,0,0,.06);border:1px solid #ECECF1;cursor:pointer;">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:2px;">'
          +'<div style="min-width:0;">'
            +'<div style="font-size:13px;font-weight:800;color:#1C1C1E;line-height:1.25;">'+mobDetEsc(String(g.kunde||au&&au.kunde||au&&au.kundenname||au&&au.firma||au&&au.firmenname||'—'))+'</div>'
            +'<div style="font-size:12px;color:#3C3C43;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35;margin-top:1px;">'+mobDetEsc(String((au&&au.auftragsnummer)||g.auftragId||''))+'</div>'
            +'<div style="font-size:10px;color:#6B7280;margin-top:5px;font-weight:600;line-height:1.25;">'+(g.mobWeitergabeLabel ? ('↪ '+g.mobWeitergabeLabel) : ('⚙ '+sl.title))+'</div>'
            +'<div style="font-size:10px;color:#7B8190;margin-top:3px;line-height:1.25;">📅 '+(termin ? termin.split('-').reverse().join('.') : 'kein Termin')+'</div>'
            +(isPassiv && !isDone ? '<div style="font-size:10px;color:#8E8E93;margin-top:4px;">Nur beteiligt (aktueller Schritt nicht bei dir)</div>' : '')
          +'</div>'
          +'<span style="flex-shrink:0;font-size:10px;font-weight:800;padding:3px 9px;border-radius:999px;letter-spacing:.01em;'
            +'background:'+stCol+'1A;color:'+stCol+';border:1px solid '+stCol+'33;">'+stLbl+'</span>'
        +'</div>'
        +'<div style="margin-top:7px;padding-top:7px;border-top:1px solid #F2F2F7;">'
          +'<div style="font-size:10px;color:#6B7280;line-height:1.35;">'+team.responsible+'</div>'
          +'<div style="margin-top:2px;font-size:10px;color:#6B7280;line-height:1.35;">'+team.team+'</div>'
        +'</div>'
        +(doneLabel?'<div style="margin-top:6px;font-size:10px;color:#34C759;line-height:1.3;">Erledigt: '+doneLabel+'</div>':'')
      +'</div>'
    +'</div>';
  };

  var offeneRaw = alle.filter(function(g){ return mobTaskStatusNorm(g.status) !== 'fertig'; });
  var offeneMap = {};
  offeneRaw.forEach(function(g){
    if(!g) return;
    var k = String(g.auftragId || '') + '|' + mobCanonicalWorkflowStep(g.schritt || '');
    var prev = offeneMap[k];
    if(!prev){
      offeneMap[k] = g;
      return;
    }
    var prevPassiv = !!prev._mobPassivBeteiligung;
    var nowPassiv = !!g._mobPassivBeteiligung;
    if(prevPassiv && !nowPassiv) offeneMap[k] = g;
  });
  var offene = Object.keys(offeneMap).map(function(k){ return offeneMap[k]; });
  offene.sort(function(a,b){
    var as = mobTaskStatusNorm(a.status);
    var bs = mobTaskStatusNorm(b.status);
    var aprio = (a.datum && a.datum < heute && as !== 'fertig') ? 0 : (as === 'in_arbeit' ? 1 : 2);
    var bprio = (b.datum && b.datum < heute && bs !== 'fertig') ? 0 : (bs === 'in_arbeit' ? 1 : 2);
    if(aprio !== bprio) return aprio - bprio;
    return String(a.datum || '').localeCompare(String(b.datum || ''));
  });
  var sichtbareAuftragIdsOben = {};
  offene.forEach(function(g){
    if(!g || g.auftragId == null) return;
    sichtbareAuftragIdsOben[String(g.auftragId)] = true;
  });
  var erledigt = alle.filter(function(g){
    if(mobTaskStatusNorm(g.status) !== 'fertig') return false;
    return !sichtbareAuftragIdsOben[String(g.auftragId || '')];
  });
  erledigt.sort(function(a,b){
    var aTs = (a.erledigtTs || '').toString();
    var bTs = (b.erledigtTs || '').toString();
    return bTs.localeCompare(aTs);
  });
  var erledigtHeute = erledigt.filter(function(g){
    var ts = (g.erledigtTs || '').toString();
    return ts && ts.indexOf(heute) === 0;
  });
  var erledigtVerlauf = erledigt.filter(function(g){
    var ts = (g.erledigtTs || '').toString();
    if(!ts) return true;
    return ts.indexOf(heute) !== 0;
  });

  var sec = function(title, icon, list){
    if(!list.length) return '';
    return '<div class="mob-sec-label" style="margin-top:12px;margin-bottom:6px;">'+icon+' '+title+' ('+list.length+')</div>'+list.map(function(g){
      return renderTaskCard(g, title.indexOf('ERLEDIGT') === 0);
    }).join('');
  };
  el.innerHTML =
    sec('OFFENE AUFGABEN', '📋', offene) +
    sec('ERLEDIGT HEUTE', '✅', erledigtHeute) +
    sec('VERLAUF', '🗂', erledigtVerlauf);
  if(typeof mobUpdateNachrichtenBadge === 'function') mobUpdateNachrichtenBadge();
}

// ── Tab: Fotos ───────────────────────────────────
function mobRenderFotos(doneAfterPaint){
  var el=document.getElementById('mob-foto-auftrag-liste'); if(!el) return;
  var isCockpit = mobCcinternCockpitMount();
  var ids = AUFTRAEGE.filter(function(a){
    if(!a || a.archiv) return false;
    if(!mobAuftragIstCcInternProduktionsPool(a)) return false;
    if(!mobAuftragHatMitarbeiterBezug(a, MOB_MA_ID)) return false;
    if(!isCockpit) return true;
    var ccid = a.ccApiId != null ? String(a.ccApiId).trim() : '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ccid);
  }).map(function(a){ return String(a.id); });
  if(!ids.length){
    el.innerHTML = '<div style="padding:20px;text-align:center;color:#8E8E93;font-size:13px;line-height:1.45;">Keine Aufträge mit Mitarbeiterbezug für Fotos.</div>';
    if (typeof doneAfterPaint === 'function') doneAfterPaint();
    return;
  }
  el.innerHTML = '<div style="padding:24px;text-align:center;color:#8E8E93;font-size:13px;line-height:1.5;">Lade Fotos…</div>';
  Promise.all(ids.map(function(id){
    var a = AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, id); });
    return a ? mobMobFetchServerDateienUiPromise(a) : Promise.resolve(null);
  })).then(function(){
    mobRenderFotosPaint(ids);
    if (typeof doneAfterPaint === 'function') doneAfterPaint();
  }).catch(function(){
    mobRenderFotosPaint(ids);
    if (typeof doneAfterPaint === 'function') doneAfterPaint();
  });
}

function mobRenderFotosPaint(ids){
  var el=document.getElementById('mob-foto-auftrag-liste'); if(!el) return;
  el.innerHTML = ids.map(function(id){
    var a = AUFTRAEGE.find(function(x){ return mobAuftragIdsGleich(x.id, id); });
    if(!a) return '';
    var sl = STEP_LABELS[a.step]||{title:a.step,col:'#888'};
    var nr = (a.auftragsnummer != null && String(a.auftragsnummer).trim() !== '') ? String(a.auftragsnummer).trim() : String(a.id || '');
    var nFotos = mobMobListDateiRowsForUi(a).length;
    return '<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:0 2px 6px rgba(0,0,0,.05);">'
      +'<div style="font-size:13px;font-weight:700;color:#1C1C1E;">'+mobDetEsc(String(a.kunde||'—'))+'</div>'
      +'<div style="font-size:12px;color:#3C3C43;margin-top:4px;">'+mobDetEsc(nr)+'</div>'
      +'<div style="font-size:11px;color:'+sl.col+';font-weight:600;margin-top:6px;">Aktueller Schritt: '+mobDetEsc(String(sl.title||''))+'</div>'
      +(nFotos ? '<div style="margin-top:6px;font-size:11px;color:#34C759;font-weight:600;">'+nFotos+' Datei(en) vom Server</div>' : '')
      +'<button type="button" onclick="mobOpenFotoView(\''+mobEscJsSingleQuoted(id)+'\')" '
      +'style="margin-top:10px;width:100%;padding:12px;background:#007AFF;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">Fotos öffnen</button>'
      +'</div>';
  }).join('');
}

// ── Tab: Lager ───────────────────────────────────
function mobRenderLager(){
  var el=document.getElementById('mob-lager-liste'); if(!el) return;

  // Kategorie-Filter Tabs
  var aktivKat = window.MOB_LAGER_KAT || 'alle';
  var gefiltert = aktivKat==='alle' ? LAGER_CC : LAGER_CC.filter(function(x){return x.kat===aktivKat;});

  var katTabs = ['alle','folie','laminat','reinigung','werkzeug','farbe'];
  var katLabels = {alle:'Alle',folie:'Folien',laminat:'Laminat',reinigung:'Reinigung',werkzeug:'Werkzeug',farbe:'HP Farben'};

  el.innerHTML = '<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:12px;">'
    +katTabs.map(function(k){
      var akt = k===aktivKat;
      return '<button onclick="window.MOB_LAGER_KAT=\''+k+'\';mobRenderLager();" '
        +'style="flex-shrink:0;padding:5px 12px;border-radius:20px;border:none;font-size:12px;font-weight:600;cursor:pointer;'
        +(akt?'background:#007AFF;color:#fff;':'background:#F2F2F7;color:#8E8E93;')+'">'+katLabels[k]+'</button>';
    }).join('')
  +'</div>'
  +gefiltert.map(function(item,i){
    var col=item.status==='ok'?'#34C759':item.status==='warn'?'#FF9500':'#FF3B30';
    var pct=Math.min(100,Math.round(item.bestand/Math.max(item.mindest*2,1)*100));
    return '<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:8px;box-shadow:0 2px 6px rgba(0,0,0,.06);">'
      // Artikel + Status
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-size:13px;font-weight:700;color:#1C1C1E;line-height:1.3;">'+item.art+'</div>'
          +'<div style="font-size:11px;color:#8E8E93;margin-top:1px;">Nr: '+item.nr+'</div>'
          +((item.bestellt||0)>0?'<div style="margin-top:3px;"><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:#007AFF18;color:#007AFF;">'+item.bestellt+' '+item.eh+' bestellt</span></div>':'')
        +'</div>'
        +'<span style="flex-shrink:0;margin-left:8px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;'
          +'background:'+col+'18;color:'+col+';">'
          +(item.status==='ok'?'✓ OK':item.status==='warn'?'⚠ Nachbestellen':'✗ Leer')
        +'</span>'
      +'</div>'
      // Bestand-Balken
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
        +'<div style="flex:1;height:6px;background:#F2F2F7;border-radius:3px;overflow:hidden;">'
          +'<div style="height:100%;width:'+pct+'%;background:'+col+';border-radius:3px;transition:width .3s;"></div>'
        +'</div>'
        +'<span style="font-size:13px;font-weight:800;color:'+col+';white-space:nowrap;">'+item.bestand+' '+item.eh+'</span>'
      +'</div>'
      // Min-Info + Buttons
      +'<div style="display:flex;align-items:center;gap:8px;">'
        +'<span style="font-size:11px;color:#8E8E93;flex:1;">Mindest: '+item.mindest+' '+item.eh+'</span>'
        +'<button onclick="mobLagerModal(\''+mobEscJsSingleQuoted(String(item.id||''))+'\',\'verbrauch\')" '
          +'style="padding:8px 14px;background:#FF3B30;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">− Verbrauch</button>'
        +'<button onclick="mobLagerModal(\''+mobEscJsSingleQuoted(String(item.id||''))+'\',\'zugang\')" '
          +'style="padding:8px 14px;background:#34C759;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">+ Zugang</button>'
      +'</div>'
    +'</div>';
  }).join('');
}

// Mobiles Eingabe-Modal statt prompt() — erster Parameter: Material-UUID (`item.id`), Fallback Suche nach `nr`.
function mobLagerModal(materialIdOrNr, typ){
  var key=String(materialIdOrNr||'');
  var item=LAGER_CC.find(function(x){return x&&String(x.id||'')===key;});
  if(!item) item=LAGER_CC.find(function(x){return x&&String(x.nr||'')===key;});
  if(!item) return;
  var istVerbrauch = typ==='verbrauch';
  var ov = document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:flex-end;';
  ov.innerHTML='<div style="width:100%;background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 32px;">'
    +'<div style="font-size:16px;font-weight:800;color:#1C1C1E;margin-bottom:4px;">'+(istVerbrauch?'− Verbrauch buchen':'+ Zugang buchen')+'</div>'
    +'<div style="font-size:13px;color:#8E8E93;margin-bottom:6px;">'+item.art+'</div>'
    +'<div style="font-size:13px;color:#3C3C43;margin-bottom:16px;">Aktuell: <strong>'+item.bestand+' '+item.eh+'</strong></div>'
    +'<label style="font-size:12px;font-weight:600;color:#3C3C43;display:block;margin-bottom:6px;">Menge in '+item.eh+'</label>'
    +'<input id="mob-lager-inp" type="number" min="0.1" step="0.5" value="1" '
      +'style="width:100%;padding:14px;font-size:20px;font-weight:700;text-align:center;border:2px solid '+(istVerbrauch?'#FF3B30':'#34C759')+';border-radius:12px;box-sizing:border-box;margin-bottom:16px;">'
    +'<div style="display:flex;gap:10px;">'
      +'<button onclick="this.closest(\'div[style*=fixed]\').remove()" '
        +'style="flex:1;padding:14px;background:#F2F2F7;color:#8E8E93;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;">Abbrechen</button>'
      +'<button id="mob-lager-ok" '
        +'style="flex:2;padding:14px;background:'+(istVerbrauch?'#FF3B30':'#34C759')+';color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;">'
        +(istVerbrauch?'− Buchen':'+ Zugang')+'</button>'
    +'</div>'
  +'</div>';
  document.body.appendChild(ov);
  setTimeout(function(){ var inp=document.getElementById('mob-lager-inp'); if(inp){inp.focus();inp.select();} },100);
  document.getElementById('mob-lager-ok').onclick=function(){
    var menge=parseFloat(document.getElementById('mob-lager-inp').value);
    if(isNaN(menge)||menge<=0){ showToast('⚠ Ungültige Menge'); return; }
    var api = window.__CCINTERN_LAGER_API_OK === true && window.CCIntern && window.CCIntern.cockpitApi ? window.CCIntern.cockpitApi : null;
    if (api && typeof api.postLagerBuchungAndRefresh === 'function') {
      var mid = item && item.id != null ? String(item.id).trim() : '';
      if (!mid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mid)) {
        showToast('⚠ Keine Backend-ID für diesen Artikel — Buchung nicht möglich.');
        return;
      }
      var typApi = istVerbrauch ? 'entnahme' : 'zugang';
      var opts = {};
      try {
        var rawMa = typeof MOB_MA_ID !== 'undefined' && MOB_MA_ID != null ? String(MOB_MA_ID).trim() : '';
        var uid = rawMa && typeof mobMaKuerzelOderIdZuUserUuid === 'function' ? mobMaKuerzelOderIdZuUserUuid(rawMa) : null;
        if (uid && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(uid).trim())) {
          opts.mitarbeiter_id = String(uid).trim();
        }
      } catch (eMobL) {
        void eMobL;
      }
      api
        .postLagerBuchungAndRefresh(mid, typApi, menge, typeof showToast === 'function' ? showToast : null, opts)
        .then(function () {
          ov.remove();
          if (typeof showToast === 'function') {
            showToast(istVerbrauch ? '📦 ' + menge + ' ' + item.eh + ' verbraucht' : '✅ +' + menge + ' ' + item.eh + ' Zugang');
          }
        })
        .catch(function () {
          if (typeof showToast === 'function') showToast('⚠ Lager-Buchung fehlgeschlagen.');
        });
      return;
    }
    if (typeof window !== 'undefined' && window.__CCINTERN_COCKPIT_MOUNT__) {
      if (typeof showToast === 'function') showToast('⚠ Lager-Buchung nur mit Server möglich — bitte Verbindung prüfen.');
      return;
    }
    if(istVerbrauch){
      item.bestand=Math.max(0,Math.round((item.bestand-menge)*10)/10);
    } else {
      item.bestand=Math.round((item.bestand+menge)*10)/10;
    }
    item.status=item.bestand<=0?'leer':item.bestand<=item.mindest?'warn':'ok';
    saveLager();
    mobRenderLager();
    if(typeof renderLagerCC==='function') renderLagerCC();
    ov.remove();
    showToast(istVerbrauch?'📦 '+menge+' '+item.eh+' verbraucht':'✅ +'+menge+' '+item.eh+' Zugang');
  };
}

// Alte prompt-Funktionen — intern jetzt über mobLagerModal (bevorzugt Material-UUID als erster Parameter).
function mobLagerBuchen(nr, art, e){ if(e) e.stopPropagation(); mobLagerModal(nr,'verbrauch'); }
function mobLagerAuffuellen(nr, art, e){ if(e) e.stopPropagation(); mobLagerModal(nr,'zugang'); }

// ── Tab: Urlaub ──────────────────────────────────
function mobRenderUrlaub(){
  var ma = maByID(MOB_MA_ID)||{urlaub:28, soll:160, n:MOB_MA_ID||'?'};
  var infoEl = document.getElementById('mob-urlaub-info'); if(!infoEl) return;

  // Urlaubstage berechnen
  var anspruch = ma.urlaub || 28;
  var meineAntraege = URLAUB_ANTRAEGE.filter(function(a){ return a.maId===MOB_MA_ID; });
  var genutzt = 0;
  meineAntraege.forEach(function(a){
    if(a.typ==='Urlaub' && (a.status==='genehmigt'||a.status==='offen') && a.von && a.bis){
      var d = Math.round((new Date(a.bis)-new Date(a.von))/(86400000))+1;
      genutzt += d;
    }
  });
  var rest = Math.max(0, anspruch - genutzt);
  var pct  = Math.round(rest/anspruch*100);
  var barC = rest > anspruch*0.5 ? '#34C759' : rest > anspruch*0.25 ? '#FF9500' : '#FF3B30';

  infoEl.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">'
      +'<div style="text-align:center;padding:10px;background:#F2F2F7;border-radius:12px;">'
        +'<div style="font-size:22px;font-weight:800;color:#1C1C1E;">'+anspruch+'</div>'
        +'<div style="font-size:10px;color:#8E8E93;">Anspruch</div></div>'
      +'<div style="text-align:center;padding:10px;background:#FF950018;border-radius:12px;">'
        +'<div style="font-size:22px;font-weight:800;color:#FF9500;">'+genutzt+'</div>'
        +'<div style="font-size:10px;color:#8E8E93;">Genutzt</div></div>'
      +'<div style="text-align:center;padding:10px;background:'+barC+'18;border-radius:12px;">'
        +'<div style="font-size:22px;font-weight:800;color:'+barC+';">'+rest+'</div>'
        +'<div style="font-size:10px;color:#8E8E93;">Rest 2026</div></div>'
    +'</div>'
    +'<div style="height:6px;background:#F2F2F7;border-radius:3px;overflow:hidden;">'
      +'<div style="height:100%;width:'+pct+'%;background:'+barC+';border-radius:3px;"></div>'
    +'</div>';

  // Antragsliste für diesen MA
  var listEl = document.getElementById('mob-urlaub-liste');
  if(!listEl){
    listEl = document.createElement('div');
    listEl.id = 'mob-urlaub-liste';
    infoEl.insertAdjacentElement('afterend', listEl);
  }
  if(!meineAntraege.length){
    listEl.innerHTML='';
  } else {
    var stMap = {
      offen:      {c:'#FF9500', l:'Offen'},
      genehmigt:  {c:'#34C759', l:'Genehmigt ✓'},
      abgelehnt:  {c:'#FF3B30', l:'Abgelehnt'},
    };
    // Neueste zuerst
    var sorted = meineAntraege.slice().sort(function(a,b){ return (b.erstellt||'').localeCompare(a.erstellt||''); });
    listEl.innerHTML =
      '<div style="font-size:10px;font-weight:700;color:#8E8E93;letter-spacing:.07em;margin:14px 0 8px;">MEINE ANTRÄGE</div>'
      +sorted.map(function(a){
        var st = stMap[a.status]||{c:'#8E8E93',l:a.status};
        var wann = a.typ==='Überstunden'
          ? (a.stunden+'h Überstunden')
          : a.typ==='Kurzabwesenheit'
            ? ((a.artLabel||a.kurzArt||'Kurzabwesenheit')+' · '+a.stunden+'h · '+(a.von?a.von.split('-').reverse().join('.'):''))
            : (a.von+' – '+a.bis);
        return '<div style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;'
          +'box-shadow:0 1px 4px rgba(0,0,0,.06);display:flex;justify-content:space-between;align-items:center;">'
          +'<div>'
            +'<div style="font-size:13px;font-weight:700;color:#1C1C1E;">'+a.typ+'</div>'
            +'<div style="font-size:11px;color:#8E8E93;margin-top:2px;">'+wann+'</div>'
            +(a.notiz?'<div style="font-size:11px;color:#8E8E93;font-style:italic;">'+a.notiz+'</div>':'')
          +'</div>'
          +'<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;'
            +'background:'+st.c+'18;color:'+st.c+';">'+st.l+'</span>'
        +'</div>';
      }).join('');
  }

  // Heute vorausfüllen
  var today = new Date().toISOString().split('T')[0];
  var vonEl = document.getElementById('mob-url-von');
  var bisEl = document.getElementById('mob-url-bis');
  if(vonEl&&!vonEl.value) vonEl.value=today;
  if(bisEl&&!bisEl.value) bisEl.value=today;
}

function mobUrlTypChanged(){
  var typ = document.getElementById('mob-url-typ').value;
  var istStd  = typ === 'Überstunden';
  var istKurz = typ === 'Kurzabwesenheit';
  document.getElementById('mob-url-datum-block').style.display = (istStd||istKurz) ? 'none' : 'grid';
  document.getElementById('mob-url-std-block').style.display   = istStd  ? 'block' : 'none';
  document.getElementById('mob-url-kurz-block').style.display  = istKurz ? 'block' : 'none';
  // Button-Text anpassen
  var btn = document.getElementById('mob-url-send-btn');
  if(btn) btn.textContent = istKurz ? '✓ Eintragen' : 'Antrag absenden';
  // Datum für Kurzabwesenheit vorausfüllen
  if(istKurz){
    var today = new Date().toISOString().split('T')[0];
    var kd = document.getElementById('mob-url-kurz-datum');
    if(kd && !kd.value) kd.value = today;
  }
}

function mobKurzStdAendern(delta){
  var inp = document.getElementById('mob-url-kurz-std');
  var val = parseFloat(inp.value)||0.5;
  val = Math.max(0.5, Math.min(8, Math.round((val+delta)*2)/2));
  inp.value = val;
}

function mobUrlStdAendern(delta){
  var inp = document.getElementById('mob-url-std');
  var val = parseFloat(inp.value)||0;
  val = Math.max(0.5, Math.round((val+delta)*2)/2);
  inp.value = val;
}

function mobUrlaubSenden(){
  var typ   = document.getElementById('mob-url-typ').value;
  var notiz = document.getElementById('mob-url-notiz').value;
  var ma    = maByID(MOB_MA_ID)||{n:MOB_MA_ID};
  var maUrlaubKey = MOB_MA_ID;
  var id    = 'URL-'+new Date().getFullYear()+'-'+String(URLAUB_ANTRAEGE.length+1).padStart(3,'0');
  var api   = window.__CCINTERN_COCKPIT_MOUNT__ && window.CCIntern && window.CCIntern.cockpitApi ? window.CCIntern.cockpitApi : null;
  console.warn('[MA_URLAUB_SUBMIT]', {
    typ: typ,
    mobMaId: MOB_MA_ID,
    maUrlaubKey: maUrlaubKey,
    cockpitMount: !!window.__CCINTERN_COCKPIT_MOUNT__,
    hasApi: !!(api && typeof api.postUrlaubAntragFromUi === 'function'),
  });

  function mobUrlaubFinishUi(){
    document.getElementById('mob-url-notiz').value='';
    document.getElementById('mob-url-std').value='1';
    document.getElementById('mob-url-kurz-std').value='0.5';
    var kd = document.getElementById('mob-url-kurz-datum'); if(kd) kd.value='';
    if(typeof renderUrlaubAntraege==='function') renderUrlaubAntraege();
    mobRenderUrlaub();
    mobRenderHome();
  }

  if(typ === 'Überstunden'){
    var std = parseFloat(document.getElementById('mob-url-std').value)||0;
    if(std <= 0){ showToast('⚠ Bitte Stunden eingeben'); return; }
    var recUe = {
      id:id, maId:maUrlaubKey, ma:ma.n,
      typ:typ, stunden:std, von:'', bis:'', notiz:notiz,
      status:'offen', erstellt:new Date().toISOString()
    };
    URLAUB_ANTRAEGE.push(recUe);
    if (api && typeof api.postUrlaubAntragFromUi === 'function') {
      console.warn('[MA_URLAUB_REQUEST]', { method: 'POST', path: '/api/v1/urlaub', body: recUe });
      api.postUrlaubAntragFromUi(recUe, showToast).then(function (u) {
        console.warn('[MA_URLAUB_RESPONSE]', { ok: true, id: u && u.id ? u.id : null, status: u && u.status ? u.status : null });
        if (u) Object.assign(recUe, u);
        saveUrlaub();
        showToast('✓ Antrag gesendet · Überstunden '+std+'h');
        mobUrlaubFinishUi();
      }).catch(function (e) {
        console.warn('[MA_URLAUB_ERROR]', {
          status: e && e.status != null ? e.status : null,
          message: e instanceof Error ? e.message : String(e),
          body: e && e.body !== undefined ? e.body : null,
        });
        console.error('[mob] Urlaub API', e);
        showToast('⚠ Antrag konnte nicht gespeichert werden.');
        mobUrlaubFinishUi();
      });
      return;
    }
    console.warn('[MA_URLAUB_ERROR]', { reason: 'no-cockpit-api', silentLocalFallback: true });
    if (typeof showToast === 'function') showToast('⚠ Urlaub: Kein API-Kontext — nicht gespeichert.');
    mobUrlaubFinishUi();
  } else if(typ === 'Kurzabwesenheit'){
    var elKd = document.getElementById('mob-url-kurz-datum');
    var kDatum = elKd ? elKd.value : '';
    var elKs = document.getElementById('mob-url-kurz-std');
    var kStd   = parseFloat((elKs && elKs.value) || '0');
    if(!kDatum){ showToast('⚠ Bitte Datum auswählen'); return; }
    if(!kStd || kStd <= 0){ showToast('⚠ Bitte Fehlzeit eingeben'); return; }
    var recKurz = {
      id:id, maId:maUrlaubKey, ma:ma.n,
      typ:'Kurzabwesenheit', artLabel:'Kurzabwesenheit',
      stunden: kStd, von: kDatum, bis: kDatum, notiz: notiz,
      status:'genehmigt', erstellt:new Date().toISOString()
    };
    URLAUB_ANTRAEGE.push(recKurz);
    var anwRow = {
      maId:    maUrlaubKey,
      ma:      ma.n,
      datum:   kDatum,
      start:   '—',
      end:     '—',
      dauer:   -(kStd * 60),
      typ:     'kurzabwesenheit',
      notiz:   notiz||'Kurzabwesenheit',
      erstellt:new Date().toISOString()
    };
    MA_ANWESENHEIT.push(anwRow);
    if (api && typeof api.postUrlaubAntragFromUi === 'function' && typeof api.postMitarbeiterAnwesenheitFromUi === 'function') {
      console.warn('[MA_URLAUB_REQUEST]', { method: 'POST', path: '/api/v1/urlaub', body: recKurz });
      api.postUrlaubAntragFromUi(recKurz, showToast).then(function (u) {
        console.warn('[MA_URLAUB_RESPONSE]', { ok: true, id: u && u.id ? u.id : null });
        if (u) Object.assign(recKurz, u);
        return api.postMitarbeiterAnwesenheitFromUi(anwRow, showToast);
      }).then(function () {
        saveUrlaub();
        saveAnwesenheit();
        showToast('✓ Eingetragen · '+kStd+'h · '+kDatum.split('-').reverse().join('.'));
        mobUrlaubFinishUi();
      }).catch(function (e) {
        console.warn('[MA_URLAUB_ERROR]', { status: e && e.status != null ? e.status : null, message: e instanceof Error ? e.message : String(e) });
        console.error('[mob] Kurzabwesenheit API', e);
        showToast('⚠ Speichern fehlgeschlagen.');
        mobUrlaubFinishUi();
      });
      return;
    }
    console.warn('[MA_URLAUB_ERROR]', { reason: 'no-cockpit-api', silentLocalFallback: true });
    if (typeof showToast === 'function') showToast('⚠ Kurzabwesenheit: Kein API-Kontext — nicht gespeichert.');
    mobUrlaubFinishUi();
  } else {
    var von = document.getElementById('mob-url-von').value;
    var bis = document.getElementById('mob-url-bis').value;
    if(!von||!bis){ showToast('⚠ Bitte Datum auswählen'); return; }
    if(von>bis){ showToast('⚠ Von muss vor Bis liegen'); return; }
    var recStd = {
      id:id, maId:maUrlaubKey, ma:ma.n,
      typ:typ, von:von, bis:bis, notiz:notiz,
      status:'offen', erstellt:new Date().toISOString()
    };
    URLAUB_ANTRAEGE.push(recStd);
    if (api && typeof api.postUrlaubAntragFromUi === 'function') {
      console.warn('[MA_URLAUB_REQUEST]', { method: 'POST', path: '/api/v1/urlaub', body: recStd });
      api.postUrlaubAntragFromUi(recStd, showToast).then(function (u) {
        console.warn('[MA_URLAUB_RESPONSE]', { ok: true, id: u && u.id ? u.id : null, status: u && u.status ? u.status : null });
        if (u) Object.assign(recStd, u);
        saveUrlaub();
        showToast('✓ Antrag gesendet · '+typ+' · '+von+' – '+bis);
        mobUrlaubFinishUi();
      }).catch(function (e) {
        console.warn('[MA_URLAUB_ERROR]', {
          status: e && e.status != null ? e.status : null,
          message: e instanceof Error ? e.message : String(e),
          body: e && e.body !== undefined ? e.body : null,
        });
        console.error('[mob] Urlaub API', e);
        showToast('⚠ Antrag konnte nicht gespeichert werden.');
        mobUrlaubFinishUi();
      });
      return;
    }
    console.warn('[MA_URLAUB_ERROR]', { reason: 'no-cockpit-api', silentLocalFallback: true });
    if (typeof showToast === 'function') showToast('⚠ Urlaub: Kein API-Kontext — nicht gespeichert.');
    mobUrlaubFinishUi();
  }
}

/** Desktop-Test: MA-Simulation (kein Login-Wechsel). sessionStorage-Key: ccintern_ma_test_override */
var CCINTERN_MA_TEST_STORAGE = 'ccintern_ma_test_override';

function ccMobTestRestoreFromSession() {
  if (mobIsRealMaAppSession()) {
    if (typeof ccMobTestClear === 'function') ccMobTestClear();
    return;
  }
  try {
    var s = sessionStorage.getItem(CCINTERN_MA_TEST_STORAGE);
    if (s && String(s).trim() !== '' && s !== '__cockpit__') {
      var t = String(s).trim();
      window.__CCINTERN_MA_TEST_USER__ = t;
      window.__TEST_USER__ = t;
    }
  } catch (e) {}
}

function ccMobTestClear() {
  try {
    window.__CCINTERN_MA_TEST_USER__ = '';
    window.__TEST_USER__ = '';
  } catch (e0) {}
  try { sessionStorage.removeItem(CCINTERN_MA_TEST_STORAGE); } catch (e) {}
}

function ccMobTestGetActiveId() {
  if (mobIsRealMaAppSession()) return '';
  var g = (typeof window !== 'undefined' && (window.__CCINTERN_MA_TEST_USER__ || window.__TEST_USER__)) || '';
  g = String(g).trim();
  if (g) { return g; }
  try {
    var s = sessionStorage.getItem(CCINTERN_MA_TEST_STORAGE);
    if (s && String(s).trim() !== '' && s !== '__cockpit__') { return String(s).trim(); }
  } catch (e) {}
  return '';
}

function ccMobTestUserSelect(val) {
  if (val == null || val === '' || val === '__cockpit__') {
    ccMobTestClear();
    if (typeof window.mobApplyCockpitUser === 'function' && window.CURRENT_USER_ID) {
      window.mobApplyCockpitUser(window.CURRENT_USER_ID);
    } else if (typeof mobInit === 'function') { mobInit(); }
  } else {
    var id = String(val).trim();
    window.__CCINTERN_MA_TEST_USER__ = id;
    window.__TEST_USER__ = id;
    try { sessionStorage.setItem(CCINTERN_MA_TEST_STORAGE, id); } catch (e) {}
    try { sessionStorage.setItem('mob_ma_id', id); } catch (e2) {}
    MOB_MA_ID = id;
    if (typeof mobSetMA === 'function' && document.getElementById('mob-hallo')) { mobSetMA(id); }
  }
  if (typeof ccMobTestBarSync === 'function') { ccMobTestBarSync(); }
}
window.ccMobTestUserSelect = ccMobTestUserSelect;
window.ccMobTestRestoreFromSession = ccMobTestRestoreFromSession;
window.ccMobTestClear = ccMobTestClear;
window.ccMobTestGetActiveId = ccMobTestGetActiveId;

function ccMobTestBarSync() {
  var sel = document.getElementById('cc-mob-test-select');
  if (!sel) { return; }
  var t = (typeof ccMobTestGetActiveId === 'function' && ccMobTestGetActiveId()) || '';
  if (t) {
    var has = [].some.call(sel.options, function (o) { return o.value === t; });
    if (!has) { var o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o); }
    sel.value = t;
  } else { sel.value = '__cockpit__'; }
}
window.ccMobTestBarSync = ccMobTestBarSync;

function ccMobTestBarPopulate(tryIndex) {
  mobSyncMaAppTestBarVisibility();
  if (mobIsRealMaAppSession()) return;
  var idx = (tryIndex | 0) + 1;
  if (idx > 24) { return; }
  var sel = document.getElementById('cc-mob-test-select');
  if (!sel) { return; }
  if (typeof MA_DATA === 'undefined' || !MA_DATA.length) {
    setTimeout(function () { ccMobTestBarPopulate(idx); }, 400);
    return;
  }
  var cur = (typeof ccMobTestGetActiveId === 'function' && ccMobTestGetActiveId()) || '';
  function escV(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
  function escT(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  sel.innerHTML = '<option value="__cockpit__">— Eingeloggter User (Cockpit) —</option>'
    + MA_DATA.map(function (m) {
      var id = m.maId != null ? String(m.maId) : String(m.id || '');
      if (!id) { return ''; }
      return '<option value="' + escV(id) + '">' + escT(m.n || m.name || id) + '</option>';
    }).join('');
  if (cur) {
    var hasC = [].some.call(sel.options, function (o) { return o.value === cur; });
    if (!hasC) { var optC = document.createElement('option'); optC.value = cur; optC.textContent = cur; sel.appendChild(optC); }
    sel.value = cur;
  } else { sel.value = '__cockpit__'; }
}
window.ccMobTestBarPopulate = ccMobTestBarPopulate;

function mobReapplyCockpitOrTestMa() {
  mobSyncMaAppTestBarVisibility();
  if (mobIsRealMaAppSession()) {
    if (typeof ccMobTestClear === 'function') ccMobTestClear();
    if (window.CURRENT_USER_ID && typeof window.mobApplyCockpitUser === 'function') {
      window.mobApplyCockpitUser(window.CURRENT_USER_ID);
    }
    if (typeof maRunBootDiagnose === 'function') {
      maRunBootDiagnose();
    }
    if (
      typeof window !== 'undefined' &&
      window.__MOB_PENDING_COCKPIT_USER_ID__ &&
      typeof window.mobApplyCockpitUser === 'function'
    ) {
      window.mobApplyCockpitUser(window.__MOB_PENDING_COCKPIT_USER_ID__);
    }
    return;
  }
  if (typeof ccMobTestRestoreFromSession === 'function') { ccMobTestRestoreFromSession(); }
  if (window.CURRENT_USER_ID && typeof window.mobApplyCockpitUser === 'function') {
    window.mobApplyCockpitUser(window.CURRENT_USER_ID);
  } else if (typeof ccMobTestGetActiveId === 'function' && ccMobTestGetActiveId() && typeof mobSetMA === 'function' && document.getElementById('mob-hallo')) {
    var tid = ccMobTestGetActiveId();
    try { sessionStorage.setItem('mob_ma_id', tid); } catch (e) {}
    MOB_MA_ID = tid;
    mobSetMA(tid);
  }
  if (typeof ccMobTestBarPopulate === 'function') { ccMobTestBarPopulate(); }
}
window.mobReapplyCockpitOrTestMa = mobReapplyCockpitOrTestMa;

/** Nach Cockpit-Login: gleiche MA-ID wie CURRENT_USER → Mitarbeiter-App ohne erneute Auswahl */
function mobApplyCockpitUser(cockpitUserId) {
  mobSyncMaAppTestBarVisibility();
  var appOnly = mobIsRealMaAppSession();
  if (appOnly) {
    if (typeof ccMobTestClear === 'function') ccMobTestClear();
    try { sessionStorage.removeItem('mob_ma_id'); } catch (eClr) {}
    MOB_MA_ID = null;
  } else if (typeof ccMobTestRestoreFromSession === 'function') {
    ccMobTestRestoreFromSession();
    var tId = (typeof ccMobTestGetActiveId === 'function' && ccMobTestGetActiveId()) || '';
    if (tId) {
      try { sessionStorage.setItem('mob_ma_id', tId); } catch (e) {}
      MOB_MA_ID = tId;
      if (typeof mobSetMA === 'function' && document.getElementById('mob-hallo')) { mobSetMA(tId); }
      if (typeof ccMobTestBarSync === 'function') { ccMobTestBarSync(); }
      return;
    }
  }
  if (cockpitUserId == null || String(cockpitUserId).trim() === '') return;
  if (typeof MA_DATA === 'undefined' || !MA_DATA.length) {
    if (typeof window !== 'undefined') {
      window.__MOB_PENDING_COCKPIT_USER_ID__ = String(cockpitUserId).trim();
    }
    return;
  }
  if (typeof window !== 'undefined') {
    window.__MOB_PENDING_COCKPIT_USER_ID__ = '';
  }
  var res = mobResolveLoggedInMitarbeiter(cockpitUserId);
  if (typeof console !== 'undefined' && console.warn) {
    var matchDiag = {
      userId: res.userId,
      email: res.email,
      name: res.name,
      matchVia: res.matchVia,
      matchedMitarbeiterId: res.matched && res.matched.mitarbeiter_id != null ? String(res.matched.mitarbeiter_id) : null,
      workingMaId: res.workingMaId,
      matchedName: res.matchedName,
      matchedKuerzel: res.matchedKuerzel,
      ok: res.ok,
      appOnly: appOnly,
    };
    console.warn('[MA_BOOT_MATCH]', matchDiag);
    if (typeof console.log === 'function') {
      console.log('[MA-APP USER MATCH]', matchDiag);
    }
  }
  if (appOnly && (!res.ok || !res.matched)) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[MA-APP USER MATCH FEHLT]', {
        userId: res.userId,
        email: res.email,
        name: res.name,
      });
    }
    MOB_MA_ID = null;
    mobZeigeLogin();
    return;
  }
  if (!res.workingMaId) return;
  var mid = res.workingMaId;
  try { sessionStorage.setItem('mob_ma_id', mid); } catch (e) {}
  MOB_MA_ID = mid;
  if (typeof mobSetMA === 'function' && document.getElementById('mob-hallo')) {
    mobSetMA(mid);
  }
  if (typeof ccMobTestBarSync === 'function') { ccMobTestBarSync(); }
}
window.mobApplyCockpitUser = mobApplyCockpitUser;

/** Nach GET Aufträge: Filter-Diagnose für Mitarbeiter-App (MOB_MA_ID / Response). */
function maLogAuftraegeNachReload(apiRows) {
  if (!mobIsRealMaAppSession()) return;
  var rows = Array.isArray(apiRows) ? apiRows : [];
  var ram = typeof AUFTRAEGE !== 'undefined' && Array.isArray(AUFTRAEGE) ? AUFTRAEGE : [];
  var meine =
    typeof mobMeineWorkflowAufgaben === 'function' && MOB_MA_ID
      ? mobMeineWorkflowAufgaben(MOB_MA_ID)
      : [];
  var meineIds = {};
  meine.forEach(function (g) {
    if (g && g.auftragId != null) meineIds[String(g.auftragId)] = true;
  });
  console.warn('[MA_AUFTRAEGE_FILTER]', {
    mobMaId: MOB_MA_ID,
    maStammId: mobMaStammIdForApi(),
    matchKeys: typeof mobWorkflowMaMatchKeys === 'function' ? mobWorkflowMaMatchKeys(MOB_MA_ID) : [],
    apiRowCount: rows.length,
    ramCount: ram.length,
    ramIdsSample: ram.slice(0, 12).map(function (a) {
      return a && (a.id || a.auftragsnummer);
    }),
    meineAufgabenCount: meine.length,
    meineAuftragIds: meine.slice(0, 12).map(function (g) {
      return g && g.auftragId;
    }),
  });
  var assignSamples = [];
  var ai;
  for (ai = 0; ai < ram.length && assignSamples.length < 8; ai++) {
    var ax = ram[ai];
    if (!ax) continue;
    var ev = typeof maAssignMatchEvaluate === 'function' ? maAssignMatchEvaluate(ax, MOB_MA_ID) : null;
    if (!ev) continue;
    if (!ev.included || !meineIds[String(ax.id)]) assignSamples.push(ev);
  }
  if (assignSamples.length) {
    console.warn('[MA_ASSIGN_MATCH]', { samples: assignSamples });
  }
  ram.slice(0, 6).forEach(function (a) {
    if (!a || typeof maAssignMatchEvaluate !== 'function') return;
    var diag = maAssignMatchEvaluate(a, MOB_MA_ID);
    console.warn('[MA_ASSIGN_MATCH]', diag);
  });
}
window.maLogAuftraegeNachReload = maLogAuftraegeNachReload;
window.mobFindAuftragInRam = mobFindAuftragInRam;
window.maAssignMatchEvaluate = maAssignMatchEvaluate;

/**
 * Login/Reload-Diagnose (nur Mitarbeiter-App-only).
 * Konsole: [MA_BOOT_AUTH] [MA_BOOT_RIGHTS] [MA_BOOT_MATCH] [MA_BOOT_PROJECT]
 */
function maRunBootDiagnose() {
  if (!mobIsRealMaAppSession()) return;
  var tok = '';
  try {
    if (typeof localStorage !== 'undefined') {
      tok = localStorage.getItem('cc_cockpit_access_token') || '';
    }
  } catch (eTok) {
    void eTok;
  }
  var authMod = typeof window !== 'undefined' && window.CCIntern && window.CCIntern.auth;
  var projectId = '';
  try {
    if (authMod && typeof authMod.getCurrentProjectId === 'function') {
      projectId = authMod.getCurrentProjectId() || '';
    }
  } catch (ePid) {
    void ePid;
  }
  if (!projectId) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        projectId = sessionStorage.getItem('cc_cockpit_active_project_id') || '';
      }
    } catch (eSs) {
      void eSs;
    }
  }
  var ui = typeof window !== 'undefined' && window.CC_SHELL_UI_ACCESS ? window.CC_SHELL_UI_ACCESS : null;
  console.warn('[MA_BOOT_AUTH]', {
    currentUserId: typeof window !== 'undefined' && window.CURRENT_USER_ID != null ? String(window.CURRENT_USER_ID) : null,
    currentUserName: typeof window !== 'undefined' && window.CURRENT_USER_NAME != null ? String(window.CURRENT_USER_NAME) : null,
    accessTokenPresent: !!(tok && String(tok).trim()),
    mobMaId: MOB_MA_ID,
    maDataLen: typeof MA_DATA !== 'undefined' && MA_DATA ? MA_DATA.length : 0,
    cockpitMount: !!(typeof window !== 'undefined' && window.__CCINTERN_COCKPIT_MOUNT__),
  });
  console.warn('[MA_BOOT_RIGHTS]', {
    isMitarbeiterAppOnlyShell: ui && ui.isMitarbeiterAppOnlyShell === true,
    canSeeMitarbeiterApp: ui && ui.canSeeMitarbeiterApp === true,
    canSeeCcInternDesktop: ui && ui.canSeeCcInternDesktop === true,
  });
  console.warn('[MA_BOOT_PROJECT]', {
    projectId: projectId || null,
    xProjectIdSet: !!(projectId && String(projectId).trim()),
    company_id:
      typeof window !== 'undefined' && window.COCKPIT_FIRMA_ID != null
        ? String(window.COCKPIT_FIRMA_ID)
        : null,
  });
  if (!authMod || typeof authMod.apiFetch !== 'function') return;
  authMod
    .apiFetch('/auth/me')
    .then(function (meRes) {
      console.warn('[MA_BOOT_AUTH]', {
        meStatus: 'ok',
        email: meRes && meRes.user && meRes.user.email ? String(meRes.user.email) : null,
        company_id: meRes && meRes.user && meRes.user.company_id != null ? String(meRes.user.company_id) : null,
      });
    })
    .catch(function (eMe) {
      console.warn('[MA_BOOT_AUTH]', {
        meStatus: 'error',
        status: eMe && eMe.status != null ? eMe.status : null,
        message: eMe instanceof Error ? eMe.message : String(eMe),
      });
    });
  authMod
    .apiFetch('/auth/my-rights')
    .then(function (mr) {
      console.warn('[MA_BOOT_RIGHTS]', { myRightsStatus: 'ok', hasBundle: !!(mr && typeof mr === 'object') });
    })
    .catch(function (eMr) {
      console.warn('[MA_BOOT_RIGHTS]', {
        myRightsStatus: 'error',
        status: eMr && eMr.status != null ? eMr.status : null,
        message: eMr instanceof Error ? eMr.message : String(eMr),
      });
    });
}
window.maRunBootDiagnose = maRunBootDiagnose;

/** Referenz: „Minus“ oben — hier: zurück zur Desktop-Übersicht (Dashboard) */
function mobShellMinimize() {
  if (typeof goPage === 'function') {
    goPage('dashboard', null, 'Dashboard', 'CC Intern Übersicht');
  }
}
window.mobShellMinimize = mobShellMinimize;

/** Cockpit-API (ESM) ruft nach Auftrag-Flush per globalThis darauf zu. */
try {
  window.mobSynchronisiereInternAufgabenMitWorkflow = mobSynchronisiereInternAufgabenMitWorkflow;
} catch (eMobSyncExp) {}

/**
 * Gezielte Konsole-Prüfung: fehlender Auftrag / fehlendes MA in INTERN-Sync.
 * AUFTRAG: primär `a.id` (z. B. AU-2026-030); optional `a.nr` falls die API liefert.
 * MA: Name-Substring in `m.n` (ggf. m.name) oder exaktes Kürzel `m.k` (z. B. OK).
 *
 *   ccInternDebugMitarbeiterAuftrag('AU-2026-030', 'Okan');
 *   ccInternDebugMitarbeiterAuftrag('AU-2026-030', 'OK');
 */
function ccInternDebugMitarbeiterAuftrag(auKey, nameOrKuerzel) {
  if (typeof console === 'undefined' || !console.log) return;
  if (auKey == null || String(auKey).trim() === '') {
    console.warn('[ccInternDebugMitarbeiterAuftrag] Bitte Au-Key angeben, z. B. AU-2026-030');
    return;
  }
  var keyS = String(auKey).trim();
  var a = null;
  if (typeof AUFTRAEGE !== 'undefined' && AUFTRAEGE && AUFTRAEGE.length) {
    a = AUFTRAEGE.find(function (x) {
      if (!x) return false;
      if (x.id != null && String(x.id) === keyS) return true;
      if (x.nr != null && String(x.nr) === keyS) return true;
      return false;
    });
  }
  if (!a) {
    console.warn('[ccInternDebugMitarbeiterAuftrag] Kein AUFTRAG für', keyS, '(Suche: id + nr?)');
    return;
  }
  var m = null;
  var sub = (nameOrKuerzel == null) ? '' : String(nameOrKuerzel).trim();
  if (sub && typeof MA_DATA !== 'undefined' && MA_DATA && MA_DATA.length) {
    var subLow = sub.toLowerCase();
    m = MA_DATA.find(function (x) {
      if (!x) return false;
      if (x.k != null && String(x.k).trim() !== '' && String(x.k).toUpperCase() === sub.toUpperCase()) return true;
      if (x.n && String(x.n).toLowerCase().indexOf(subLow) >= 0) return true;
      if (x.name && String(x.name).toLowerCase().indexOf(subLow) >= 0) return true;
      return false;
    });
  }
  if (!m && sub) {
    console.warn('[ccInternDebugMitarbeiterAuftrag] Kein Mitarbeiter zu', nameOrKuerzel);
  }
  var sch = (typeof mobSchrittObjektFuerAuftragUndStep === 'function')
    ? mobSchrittObjektFuerAuftragUndStep(a, a.step)
    : null;
  var out = {
    auftragId: a.id,
    auftragNr: a.nr,
    stepRaw: a.step,
    stepCanon: (typeof mobCanonicalWorkflowStep === 'function') ? mobCanonicalWorkflowStep(a.step) : '',
    pool: (typeof mobAuftragIstCcInternProduktionsPool === 'function') ? mobAuftragIstCcInternProduktionsPool(a) : null,
    schritt: sch,
    schrittFertig: sch ? sch.fertig : null,
    mitarbeiter: m,
    resolvedMaIds: (typeof mobSchrittMaIdsResolved === 'function' && sch) ? mobSchrittMaIdsResolved(sch) : null,
    istFuerMa: (typeof mobSchrittIstFuerMa === 'function' && sch && m) ? mobSchrittIstFuerMa(sch, m.maId) : null,
    wer: sch && sch.wer,
    maId: m && m.maId,
    k: m && m.k
  };
  console.log('[ccInternDebugMitarbeiterAuftrag]', out);
  return out;
}
window.ccInternDebugMitarbeiterAuftrag = ccInternDebugMitarbeiterAuftrag;