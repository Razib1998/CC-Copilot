// ════════════════════════════════════════════════════════════════════
// CC INTERN — Rechnungen / Lexware-Tel
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/rechnungen-view.js
// Enthält:  telCheckOpen, telCalc, telAktion
//
// FIX [Cockpit]: window.CCIntern.auth.apiFetch + x-project-id Header
// FIX [Cockpit]: Gleicher Fix wie schnell-anfragen / angebote
// ════════════════════════════════════════════════════════════════════

// ─── API-Helfer: window.CCIntern.auth.apiFetch (kein dynamisches import()) ──
function rechApiFetch(path, options) {
  var auth = window.CCIntern && window.CCIntern.auth;
  if (!auth || typeof auth.apiFetch !== 'function') {
    return Promise.reject(new Error('[rechnungen] apiFetch nicht verfügbar (window.CCIntern.auth fehlt).'));
  }
  function runFetch() {
    var projectId = auth.getCurrentProjectId ? auth.getCurrentProjectId() : null;
    var headers = Object.assign({}, options && options.headers);
    if (projectId) headers['x-project-id'] = projectId;
    return auth.apiFetch(path, Object.assign({}, options, { headers: headers }));
  }
  if (!auth.getCurrentProjectId || !auth.getCurrentProjectId()) {
    var hydrate = auth.hydrateCockpitAccessibleProjectsAndEnsureContext;
    return (typeof hydrate === 'function' ? hydrate() : Promise.resolve()).then(runFetch);
  }
  return runFetch();
}

// GET /api/v1/ccintern/rechnungen → Liste laden und RECHNUNGEN befüllen
function rechReloadListeFromApi() {
  console.log('[rechnungen-view] rechReloadListeFromApi start');
  return rechApiFetch('/api/v1/ccintern/rechnungen', { method: 'GET' })
    .then(function (raw) {
      var rows = raw.rechnungen || [];
      console.log('[rechnungen-view] API:', rows.length, 'Einträge geladen');
      if (window.RECHNUNGEN) {
        window.RECHNUNGEN.length = 0;
        rows.forEach(function (r) {
          r._apiSynced = true;
          if (r.faellig_am && !r.faellig) r.faellig = r.faellig_am;
          window.RECHNUNGEN.push(r);
        });
      }
      if (typeof renderRechnungen === 'function') renderRechnungen();
      else if (typeof loadRechnungen === 'function') loadRechnungen();
    })
    .catch(function (e) { console.warn('[rechnungen-view] rechReloadListeFromApi Fehler:', e); });
}

// POST /api/v1/ccintern/rechnungen → neue Rechnung anlegen
function rechPostApi(body) {
  return rechApiFetch('/api/v1/ccintern/rechnungen', { method: 'POST', body: body });
}

// PUT /api/v1/ccintern/rechnungen/:id → Rechnung bearbeiten
function rechPutApi(id, body) {
  return rechApiFetch(
    '/api/v1/ccintern/rechnungen/' + encodeURIComponent(String(id)),
    { method: 'PUT', body: body }
  );
}

// DELETE /api/v1/ccintern/rechnungen/:id → Rechnung löschen
function rechDeleteApi(id) {
  return rechApiFetch(
    '/api/v1/ccintern/rechnungen/' + encodeURIComponent(String(id)),
    { method: 'DELETE' }
  );
}

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

// ── Rechnungsstatus am Auftrag (Kanban / Detail) ───────────────────
function setRechnung(id, status){
  var a = typeof AUFTRAEGE !== 'undefined' && AUFTRAEGE.find ? AUFTRAEGE.find(function(x){ return x.id === id; }) : null;
  if(!a) return;
  a.rechnung = status;
  if(typeof renderKanban === 'function') renderKanban();
  if(typeof renderAuftragVerwaltung === 'function') renderAuftragVerwaltung();
  var lbl = (typeof RE_STATUS_LABELS !== 'undefined' && RE_STATUS_LABELS[status]) ? RE_STATUS_LABELS[status] : status;
  showToast('💶 '+id+' → '+lbl);
  if(typeof saveAuftraege === 'function') saveAuftraege();
}

