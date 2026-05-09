// ─── CALDERA BACKEND-KONFIGURATION ──────────────────────
// Standard-URL kommt aus js/config.js (MF_PRUEF_SERVER_URL / MF_APP_BASE_URL).
// Kann vom Nutzer überschrieben werden (localStorage mf_server_url).
function mfDefaultPruefServerUrl() {
  try {
    if (typeof window !== 'undefined' && window.MF_PRUEF_SERVER_URL) {
      return String(window.MF_PRUEF_SERVER_URL).replace(/\/+$/, '');
    }
    if (typeof window !== 'undefined' && window.MF_APP_BASE_URL) {
      return String(window.MF_APP_BASE_URL).replace(/\/+$/, '');
    }
  } catch (e) { /* ignore */ }
  return 'http://localhost:3030';
}

let CALDERA_SERVER = (()=>{
  try { return localStorage.getItem('mf_server_url') || mfDefaultPruefServerUrl(); }
  catch(e){ return mfDefaultPruefServerUrl(); }
})();
const CALDERA_BASE = '(Caldera / Hotfolder)'; // nur für Anzeige im Export — kein lokaler UNC-Pfad

function setServerUrl(url){
  url = (url||'').trim().replace(/\/+$/, ''); // trailing slash entfernen
  if(!url) return;
  CALDERA_SERVER = url;
  try { localStorage.setItem('mf_server_url', url); } catch(e){}
  checkServerStatus();
  toast('Server-URL gespeichert', url, 'tg');
}

function openServerConfig(){
  openModal('⚙ Server-Konfiguration', `
    <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;">
      <div style="font-weight:700;margin-bottom:6px;">📡 Wie starte ich den Prüf-Server?</div>
      <div style="font-size:12px;line-height:1.7;color:#1e40af;">
        1. <strong>Node.js installieren</strong> (falls nicht vorhanden): nodejs.org<br>
        2. Im Ordner <code style="background:#dbeafe;padding:1px 5px;border-radius:3px;">messeflow-server/</code> öffnen<br>
        3. Einmalig: <code style="background:#dbeafe;padding:1px 5px;border-radius:3px;">npm install</code><br>
        4. Starten: <code style="background:#dbeafe;padding:1px 5px;border-radius:3px;">node server.js</code><br>
        5. Server läuft dann auf <strong>Port 3030</strong>
      </div>
    </div>
    <div class="fg">
      <label>Server-URL</label>
      <input id="server-url-input" type="text"
        value="${CALDERA_SERVER}"
        placeholder="${mfDefaultPruefServerUrl().replace(/"/g, '&quot;')}"
        style="font-family:monospace;font-size:13px;">
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:12px;">
      Selber Rechner: <code>http://localhost:3030</code> &nbsp;·&nbsp;
      LAN: <code>http://192.168.2.XX:3030</code>
    </div>
    <div id="server-test-result" style="min-height:32px;margin-bottom:10px;"></div>
    <div class="ma">
      <button class="btn primary" onclick="testAndSaveServerUrl()">🔌 Verbinden & testen</button>
      <button class="btn ghost" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function testAndSaveServerUrl(){
  const input = document.getElementById('server-url-input');
  const url   = (input?.value||'').trim().replace(/\/+$/,'');
  if(!url){ toast('Fehler','Bitte URL eingeben'); return; }
  const el = document.getElementById('server-test-result');
  if(el) el.innerHTML = '<div style="font-size:12px;color:var(--muted);">🔌 Verbinde…</div>';
  try {
    const res  = await fetch(`${url}/status`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    if(el) el.innerHTML = `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:7px;padding:8px 12px;font-size:12px;color:var(--green);">
      ✓ Server erreichbar · ${data.server||'MesseFlow Server'} · Caldera: ${data.calderaErreichbar?'✓ erreichbar':'⚠ nicht erreichbar'}
    </div>`;
    setServerUrl(url);
    setTimeout(closeModal, 1200);
  } catch(err){
    if(el) el.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:7px;padding:8px 12px;font-size:12px;color:var(--red);">
      ✗ Nicht erreichbar: ${err.message}<br>
      <span style="color:var(--muted);">Server läuft? Port 3030 geöffnet? CORS aktiv?</span>
    </div>`;
  }
}

async function checkServerStatus(){
  const el = document.getElementById('server-status-indicator');
  if(!el) return;
  el.innerHTML = '<span style="color:var(--muted);font-size:11px;">⏳</span>';
  try {
    const res  = await fetch(`${CALDERA_SERVER}/status`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    el.innerHTML = `<span style="color:var(--green);font-size:11px;cursor:pointer;" onclick="openServerConfig()" title="Server erreichbar – klicken zum Konfigurieren">✓ Server online</span>`;
  } catch(e){
    el.innerHTML = `<span style="color:var(--red);font-size:11px;cursor:pointer;" onclick="openServerConfig()" title="Server nicht erreichbar – klicken zum Einrichten">⚠ Server offline – klicken</span>`;
  }
}

function calderaOrdnerName(p){
  const clean  = s => (s||'').replace(/[^a-zA-Z0-9äöüÄÖÜß\-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  const kunde  = clean(p.auftragsInfo?.kunde || p.kunde || 'Unbekannt');
  const projekt= clean(p.auftragsInfo?.projektname || '');
  return projekt ? `${kunde}_${projekt}` : kunde;
}

// Caldera-Dateiname (NUR für Export/Druckfreigabe — nicht beim Upload):
// Kunde_Projekt_Motiv_B{Breite}_H{Hoehe}mm.pdf
// Maße aus geprüftem Dateimaß (dateiMass) bevorzugt, sonst Bestellmaß.
// Originalname (w.datei) bleibt im System unverändert.
function calderaPdfName(p, w){
  const clean   = s => (s||'').replace(/[^a-zA-Z0-9äöüÄÖÜß\-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  const kunde   = clean(p.auftragsInfo?.kunde || p.kunde || 'Unbekannt');
  const projekt = clean(p.auftragsInfo?.projektname || '');
  const motiv   = clean(w.name);
  // Maße: geprüftes Dateimaß bevorzugen, dann Bestellmaß
  const massQuelle = (w.dateiMass && w.dateiMass.trim()) ? w.dateiMass : w.bestellmass;
  const parsed  = parseMass(massQuelle);
  const b = parsed ? Math.round(parsed.w) : 0;
  const h = parsed ? Math.round(parsed.h) : 0;
  const massPart = b && h ? `_B${b}_H${h}mm` : '';
  return projekt
    ? `${kunde}_${projekt}_${motiv}${massPart}.pdf`
    : `${kunde}_${motiv}${massPart}.pdf`;
}

// ── Einzelne Wand exportieren (simuliert Datei-Upload ans Backend) ──
async function exportWandZuCaldera(pid, wid){
  if (typeof getProjRechte === 'function' && typeof currentUserId !== 'undefined') {
    if (!getProjRechte(currentUserId, pid).exportieren) {
      toast('Keine Berechtigung', 'Export ist für Ihr Konto in diesem Projekt nicht freigeschaltet.', 'ty');
      return;
    }
  }
  const p = getP(pid), w = getW(p, wid);
  const btn = document.getElementById(`caldera-btn-${wid}`);
  const stat= document.getElementById(`caldera-stat-${wid}`);
  if(btn) { btn.disabled = true; btn.textContent = '⏳ Exportiere…'; }

  try {
    // 1. Ordner anlegen
    const ordnerRes = await fetch(`${CALDERA_SERVER}/export/ordner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kunde:   p.auftragsInfo?.kunde || p.kunde || '',
        projekt: p.auftragsInfo?.projektname || '',
      }),
    });
    if(!ordnerRes.ok) throw new Error('Ordner konnte nicht angelegt werden');

    // 2. Datei senden
    // Da wir im Browser keine echte Datei haben (nur einen Namen),
    // senden wir die Metadaten als JSON — der Server legt eine Platzhalter-Datei an.
    // In einer echten Integration: echte PDF-Binärdaten hier übergeben.
    const parsed = parseMass(w.bestellmass);
    const form   = new FormData();
    // Platzhalter-Blob mit Dateiname (echte PDF käme von Datei-Upload / PDF-Generator)
    const blob   = new Blob([`[Platzhalterdatei für ${w.name} – echte PDF einbinden]`], {type:'application/pdf'});
    form.append('datei',   blob, w.datei || calderaPdfName(p, w));
    form.append('kunde',   p.auftragsInfo?.kunde || p.kunde || '');
    form.append('projekt', p.auftragsInfo?.projektname || '');
    form.append('motiv',   w.name);
    form.append('breite',  parsed ? Math.round(parsed.w) : 0);
    form.append('hoehe',   parsed ? Math.round(parsed.h) : 0);

    const dateiRes = await fetch(`${CALDERA_SERVER}/export/datei`, {
      method: 'POST',
      body: form,
    });
    const result = await dateiRes.json();
    if(!result.ok) throw new Error(result.fehler || 'Export fehlgeschlagen');

    // Erfolg
    w._calderaExportiert = true;
    if(stat) stat.innerHTML = `<span style="color:var(--green);font-size:12px;font-weight:700;">✓ Exportiert: ${result.dateiName}</span>`;
    if(btn)  { btn.textContent = '✓ Erneut exportieren'; btn.disabled = false; }
    toast('📂 Caldera', `${w.name} exportiert → ${result.ordner}`, 'tg');

    // ── ÜBERGABE-CHECK ───────────────────────────────────────────────────────
    // Wenn alle exportierbaren Wände dieses Projekts jetzt übertragen sind,
    // wird automatisch der CC-Intern-Auftrag angelegt.
    // Trigger: letzter erfolgreicher Caldera-Export → mfUebergabePruefen()
    if (typeof mfUebergabePruefen === 'function') mfUebergabePruefen(pid);
    // ────────────────────────────────────────────────────────────────────────

    renderView();

  } catch(err){
    if(stat) stat.innerHTML = `<span style="color:var(--red);font-size:12px;">✗ Fehler: ${err.message}</span>`;
    if(btn)  { btn.textContent = '📂 Exportieren'; btn.disabled = false; }
    toast('Export fehlgeschlagen', err.message + ' – Server läuft? (port 3030)', 'ty');
  }
}

// ── Alle druckbereiten Wände auf einmal exportieren ──
async function exportAlleZuCaldera(pid){
  if (typeof getProjRechte === 'function' && typeof currentUserId !== 'undefined') {
    if (!getProjRechte(currentUserId, pid).exportieren) {
      toast('Keine Berechtigung', 'Export ist für Ihr Konto in diesem Projekt nicht freigeschaltet.', 'ty');
      return;
    }
  }
  const p = getP(pid);
  const bereit = p.waende.filter(w => w.status >= 3 && w.status !== 6 && w.datei);
  if(!bereit.length){ toast('Nichts zu exportieren','Keine druckbereiten Dateien'); return; }
  for(const w of bereit){
    await exportWandZuCaldera(pid, w.id);
  }
}

// ── Server-Status prüfen ──
async function checkCalderaServer(pid){
  const el = document.getElementById(`caldera-server-status-${pid}`);
  if(el) el.innerHTML = '<span style="color:var(--muted);font-size:12px;">🔄 Prüfe…</span>';
  try {
    const res  = await fetch(`${CALDERA_SERVER}/status`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if(el) el.innerHTML = data.calderaErreichbar
      ? `<span style="color:var(--green);font-size:12px;">✓ Server OK · Caldera-Pfad erreichbar</span>`
      : `<span style="color:var(--yellow);font-size:12px;">⚡ Server OK · Caldera-Pfad nicht erreichbar (${data.calderaPath})</span>`;
  } catch(e){
    if(el) el.innerHTML = `<span style="color:var(--red);font-size:12px;">✗ Server nicht erreichbar (${CALDERA_SERVER}) – <a href="README" target="_blank" style="color:var(--red);">Einrichtung</a></span>`;
  }
}

function buildCalderaExport(p){
  const ordner  = calderaOrdnerName(p);
  const pfadAnz = CALDERA_BASE + ordner + '\\';
  const bereit  = p.waende.filter(w => w.status >= 3 && w.status !== 6 && w.datei);
  const nochNicht= p.waende.filter(w => w.status === 6);

  const dateienHTML = bereit.map(w => {
    const pdfName = calderaPdfName(p, w);
    const exportiert = w._calderaExportiert;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;
        border:1px solid ${exportiert?'#86efac':'var(--line)'};border-radius:7px;flex-wrap:wrap;">
      <span style="font-size:16px;">📄</span>
      <div style="flex:1;min-width:120px;">
        <div style="font-size:13px;font-weight:600;">${pdfName}</div>
        <div style="font-size:11px;color:var(--muted);">Original: ${w.datei} · ${w.bestellmass||'–'}</div>
        <div id="caldera-stat-${w.id}">
          ${exportiert ? '<span style="color:var(--green);font-size:12px;font-weight:700;">✓ Bereits exportiert</span>' : ''}
        </div>
      </div>
      <button id="caldera-btn-${w.id}" class="btn sm ${exportiert?'ghost':'primary'}"
        onclick="exportWandZuCaldera('${p.id}','${w.id}')">
        ${exportiert ? '📂 Erneut exportieren' : '📂 Exportieren'}
      </button>
    </div>`;
  }).join('');

  return `
    <div style="background:#f0f7ff;border:1px solid #93c5fd;border-radius:var(--r);padding:16px;margin-top:4px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        <div style="font-size:15px;font-weight:700;">📂 Caldera Job-Ordner</div>
        <div id="caldera-server-status-${p.id}">
          <span style="font-size:12px;color:var(--muted);">Server-Status unbekannt</span>
        </div>
        <button class="btn sm ghost" style="margin-left:auto;" onclick="checkCalderaServer('${p.id}')">🔄 Status prüfen</button>
      </div>

      <div style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:9px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <code style="font-size:12px;font-family:monospace;color:var(--muted);flex:1;word-break:break-all;">${pfadAnz}</code>
        <span style="font-size:11px;background:var(--sb);color:var(--blue);padding:2px 8px;border-radius:999px;border:1px solid #93c5fd;">Auto-Export via Backend</span>
      </div>

      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:7px;">
        Dateien – ${bereit.length} druckbereit
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
        ${bereit.length
          ? dateienHTML
          : '<div style="color:var(--muted);font-size:13px;padding:6px 0;">Noch keine druckbereiten Dateien.</div>'}
      </div>

      ${nochNicht.length ? `
        <div style="font-size:12px;color:var(--red);margin-bottom:10px;">
          ✖ ${nochNicht.length} Wand${nochNicht.length!==1?'e':''} blockiert – nicht exportierbar
        </div>` : ''}

      ${bereit.length > 1 ? `
        <button class="btn primary sm" style="width:100%;" onclick="exportAlleZuCaldera('${p.id}')">
          📂 Alle ${bereit.length} Dateien automatisch exportieren
        </button>` : ''}

      <div style="margin-top:10px;font-size:11px;color:var(--muted);">
        Kein manuelles Kopieren – Backend schreibt direkt in den Netzwerkordner.
        Mitarbeiter öffnet Ordner in Caldera, prüft und startet Druck bewusst.
      </div>
    </div>`;
}

function copyCalderaPath(pid){
  const p = getP(pid);
  const pfad = CALDERA_BASE + calderaOrdnerName(p) + '\\';
  navigator.clipboard.writeText(pfad).then(()=>toast('Kopiert','Pfad in Zwischenablage','tg'));
}

window.CALDERA_SERVER = CALDERA_SERVER;
window.CALDERA_BASE = CALDERA_BASE;

window.setServerUrl = setServerUrl;
window.openServerConfig = openServerConfig;
window.testAndSaveServerUrl = testAndSaveServerUrl;
window.checkServerStatus = checkServerStatus;

window.calderaOrdnerName = calderaOrdnerName;
window.calderaPdfName = calderaPdfName;

window.exportWandZuCaldera = exportWandZuCaldera;
window.exportAlleZuCaldera = exportAlleZuCaldera;
window.checkCalderaServer = checkCalderaServer;

window.buildCalderaExport = buildCalderaExport;
window.copyCalderaPath = copyCalderaPath;
