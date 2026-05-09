// ═══════════════════════════════════════════════════════
// PROJEKT VIEW (Agentur / Norbert / Melanie)
// ═══════════════════════════════════════════════════════
function renderProjView(){
  const p=getP(activeProjId);
  if(!p) return;

  // ── Liefertermin-Box ──────────────────────────────
  // Quelle: auftragsInfo.liefertermin (Excel-Import, TT.MM.JJJJ)
  //      oder p.deadline (manuell angelegtes Projekt)
  // Anzeige: nur TT.MM.JJJJ + Noch X Tage (kein Wochentag, keine Uhrzeit)

  // Datum für Box bestimmen
  let dlDateStr = '';   // Anzeige-String TT.MM.JJJJ
  let dlDate    = null; // Date-Objekt für Diff-Berechnung

  if(p.auftragsInfo?.liefertermin){
    // Aus Excel importiert — bereits TT.MM.JJJJ
    dlDateStr = p.auftragsInfo.liefertermin;
    // Rück-parsen für Diff: TT.MM.JJJJ → Date
    const m = dlDateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if(m) dlDate = new Date(Date.UTC(+m[3], +m[2]-1, +m[1]));
  } else if(p.deadline){
    dlDate = new Date(p.deadline);
    // Nur TT.MM.JJJJ ausgeben, kein Wochentag/Uhrzeit
    const dd   = String(dlDate.getDate()).padStart(2,'0');
    const mm   = String(dlDate.getMonth()+1).padStart(2,'0');
    const yyyy = dlDate.getFullYear();
    dlDateStr = `${dd}.${mm}.${yyyy}`;
  }

  // Tage-Differenz
  let diffTxt = '';
  const urgent = false; // wird unten gesetzt
  let isUrgent = false;
  if(dlDate && !isNaN(dlDate)){
    const today = new Date(); today.setHours(0,0,0,0);
    const dlDay = new Date(dlDate); dlDay.setHours(0,0,0,0);
    const diff  = Math.round((dlDay - today) / 86400000);
    if(diff === 0)      diffTxt = 'Heute';
    else if(diff === 1) diffTxt = 'Morgen';
    else if(diff > 1)   diffTxt = `Noch ${diff} Tage`;
    else                diffTxt = `Überfällig seit ${Math.abs(diff)} Tag${Math.abs(diff)!==1?'en':''}`;
    isUrgent = diff <= 3;
  }

  const st = getProjektStatusMeta(p.status || 'Neu');
  const obCls = 'ob-blue';
  const obTxt = (() => {
    const s = p.status || 'Neu';
    if (s === 'Fehlt etwas') return '⚠ Fehlt etwas';
    if (s === 'Datei hochgeladen') return '📄 Datei hochgeladen';
    if (s === 'In Prüfung') return '🔎 Prüfung läuft';
    if (s === 'Druckfertig') return '✅ Druckfertig';
    if (s === 'Freigegeben') return '✅ Freigegeben';
    if (s === 'An Druck gesendet' || s === 'An Caldera gesendet') return '🖨 An Druck gesendet';
    if (s === 'In Produktion') return '🏭 Wird gedruckt';
    if (s === 'Fertig') return '✓ Fertig';
    return 'Neu';
  })();

  // Fortschritt: nur druckbereite (≥3, kein 6) + druckfertige (5)
  const druckbereit = p.waende.filter(w => w.status >= 3 && w.status !== 6).length;
  const druckfertig = p.waende.filter(w => w.status === 5).length;
  const gesamt=p.waende.length;
  const pct=gesamt>0?Math.round(druckbereit/gesamt*100):0;
  const progLabel = p.freigegeben
    ? `Produktionsplan: ${p.produktionsplan?.filter(s=>s.erledigt).length||0} / ${p.produktionsplan?.length||0} Schritte`
    : `${druckbereit} / ${gesamt} druckbereit`;

  // Role notice
  const notices={
    agentur: `<div class="role-notice rn-agentur" style="flex-direction:column;align-items:flex-start;gap:4px;">
      <div>🏢 <strong>Ihre Aufgabe:</strong> Datei hochladen – fertig.</div>
      <div style="font-size:12px;color:#1e40af;">📐 Bitte Datei im richtigen Maß hochladen (siehe Bestellmaß in der jeweiligen Zeile). Das System prüft automatisch.</div>
    </div>`,
    zwischenhaendler: `<div class="role-notice" style="background:#f0fdfa;border:1px solid #99f6e4;color:#0f766e;border-radius:8px;padding:10px 14px;">📋 <strong>Koordination:</strong> Statusübersicht für Ihre Projekte. Keine Bearbeitungsrechte.</div>`,
    admin:      `<div class="role-notice rn-norbert">📐 <strong>Ihre Aufgabe:</strong> Dateimaß eintragen → System vergleicht automatisch → Sie entscheiden.</div>`,
    cc_intern:  `<div class="role-notice rn-cc-intern">🏭 <strong>CC Intern:</strong> Aufträge steuern · Status setzen · Produktion freigeben · Fertig melden.</div>`,
    produktion: `<div class="role-notice rn-melanie">🎨 <strong>Ihre Aufgabe:</strong> Daten prüfen und Wände als druckfertig freigeben.</div>`,
  };

  const flaechenHTML=p.waende.map(w=>renderWandCard(p,w)).join('');

  document.getElementById('view').innerHTML=`
    <div class="status-banner">
      <div class="sb-top">
        <div>
          <div class="sb-title">${p.name}</div>
          <span class="overall-badge ${obCls}">${obTxt}</span>
          <div style="font-size:12px;color:var(--muted);">${p.kunde}</div>
          ${p.auftragsInfo ? `<div style="display:flex;gap:0;flex-direction:column;margin-top:8px;gap:3px;">
            ${p.auftragsInfo.bestelldatum?`<div style="font-size:12px;"><span style="color:var(--muted);min-width:100px;display:inline-block;">Bestellung:</span> <strong>${p.auftragsInfo.bestelldatum}</strong></div>`:''}
            ${p.auftragsInfo.liefertermin?`<div style="font-size:12px;"><span style="color:var(--muted);min-width:100px;display:inline-block;">Liefertermin:</span> <strong>${p.auftragsInfo.liefertermin}</strong></div>`:''}
            ${p.auftragsInfo.versandart?`<div style="font-size:12px;"><span style="color:var(--muted);min-width:100px;display:inline-block;">Versand:</span> <strong>${p.auftragsInfo.versandart}</strong></div>`:''}
          </div>` : ''}
          ${canViewFinance(currentUserId, p.id) && p.finanz ? `<div style="display:flex;gap:0;flex-direction:column;margin-top:8px;gap:3px;border-top:1px solid var(--line);padding-top:8px;margin-top:12px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:2px;">Finanzdaten</div>
            ${p.finanz.preis?`<div style="font-size:12px;"><span style="color:var(--muted);min-width:100px;display:inline-block;">Preis:</span> <strong>${p.finanz.preis}</strong></div>`:''}
            ${p.finanz.provisionBettina?`<div style="font-size:12px;"><span style="color:var(--muted);min-width:100px;display:inline-block;">Provision ZH:</span> <strong>${p.finanz.provisionBettina}</strong></div>`:''}
            ${p.finanz.rechnung?`<div style="font-size:12px;"><span style="color:var(--muted);min-width:100px;display:inline-block;">Rechnung:</span> <strong>${p.finanz.rechnung}</strong></div>`:''}
            ${p.finanz.marge?`<div style="font-size:12px;"><span style="color:var(--muted);min-width:100px;display:inline-block;">Marge:</span> <strong>${p.finanz.marge}</strong></div>`:''}
            ${p.finanz.interneNotizen?`<div style="font-size:12px;"><span style="color:var(--muted);min-width:100px;display:inline-block;">Interne Notizen:</span> <strong>${p.finanz.interneNotizen}</strong></div>`:''}
          </div>` : ''}
        </div>
        <div class="deadline-box${isUrgent?' urgent':''}">
          <div class="dl-label">Liefertermin</div>
          <div class="dl-time">${dlDateStr || '–'}</div>
          ${diffTxt ? `<div class="dl-diff">${diffTxt}</div>` : ''}
        </div>
        <div class="status-box">
          <div class="sb-label">Projektstatus</div>
          <div style="font-size:13px;font-weight:700;color:${st.cl};padding:8px 10px;border:1px solid ${st.bd};border-radius:7px;background:${st.bg};">
            ${p.status || 'Neu'}
          </div>
        </div>
      </div>
      <div class="prog-row">
        <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:${p.freigegeben?'var(--blue)':'var(--green)'}"></div></div>
        <span class="prog-label">${progLabel}</span>
      </div>
    </div>

    ${notices[role]||''}

    ${p.freigegeben && p.produktionsplan ? buildProdPlan(p) : ''}

    <div class="flaechen-grid">${flaechenHTML}</div>

    ${role === 'admin' ? buildFirmenzuordnung(p) : ''}

    ${buildZugriffsBlock(p)}

    <div id="mf-projekt-team">${role === 'admin' ? buildProjektTeamAnzeige(p) : ''}</div>

    <div id="mf-projekt-verlauf">${buildProjektVerlauf(p)}</div>

    ${buildProjKommentare(p)}

    ${(role === 'cc_intern' || role === 'admin') ? buildCcInternAuftragPanel(p) : ''}

    ${(role === 'cc_intern' || role === 'admin') ? buildZusatzbestellungBlock(p) : ''}
  `;
}

// ── CC-Intern-Auftrag Panel ──────────────────────────────────────────────────
// Zeigt den verknüpften CC-Intern-Auftrag (nach Caldera-Übergabe).
// Intern: voller Status + Lieferung + Fotos
// Extern: nur einfacher Status sichtbar
// ─────────────────────────────────────────────────────────────────────────────
function buildCcInternAuftragPanel(p) {
  const a = p.ccinternAuftrag;
  const isIntern = (role === 'cc_intern' || role === 'admin');

  // ── Kein Auftrag → nur zeigen wenn alle Wände exportiert ──────────────────
  if (!a) {
    if (!isIntern) return '';
    const exportierbar = p.waende.filter(w => w.status >= 3 && w.status !== 6 && w.datei);
    const alleEx = exportierbar.length > 0 && exportierbar.every(w => w._calderaExportiert);
    if (!alleEx) return '';
    return `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:var(--r);
                  padding:14px 16px;margin-top:12px;">
        <div style="font-size:13px;font-weight:700;color:#15803d;margin-bottom:4px;">
          ✅ Alle Dateien in Caldera – CC-Intern-Auftrag wird automatisch angelegt
        </div>
        <div style="font-size:12px;color:var(--muted);">Nächster Export-Abschluss löst die Übergabe aus.</div>
      </div>`;
  }

  // ── Externer Status (einfach, für alle Rollen) ────────────────────────────
  const statusExtern = a.statusExtern || mfCcExternStatus(a.statusIntern || a.status || 'Übergeben');
  const externMeta = {
    'Zum Druck':     { cl: '#92400e', bg: '#fef3c7', bd: '#f59e0b', icon: '🖨' },
    'Wird gedruckt': { cl: '#6b21a8', bg: '#faf5ff', bd: '#d8b4fe', icon: '🖨' },
    'Unterwegs':     { cl: '#92400e', bg: '#fff7ed', bd: '#fdba74', icon: '🚚' },
    'Geliefert':     { cl: '#166534', bg: '#f0fdf4', bd: '#86efac', icon: '✅' },
  };
  const exm = externMeta[statusExtern] || { cl: '#374151', bg: '#f9fafb', bd: '#e5e7eb', icon: '📦' };

  // Nur externer Status für nicht-interne Nutzer
  if (!isIntern) {
    return `
      <div style="background:${exm.bg};border:1px solid ${exm.bd};border-radius:var(--r);
                  padding:12px 16px;margin-top:12px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">${exm.icon}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:${exm.cl};">${statusExtern}</div>
          ${a.lieferung?.geliefertAm
            ? `<div style="font-size:11px;color:var(--muted);">
                Geliefert am ${new Date(a.lieferung.geliefertAm).toLocaleDateString('de-DE')}
               </div>` : ''}
        </div>
      </div>`;
  }

  // ── Interner Vollblick (cc_intern / admin) ────────────────────────────────
  const statusIntern = a.statusIntern || a.status || 'Übergeben';
  const sm    = (typeof MF_CC_STATUS_META !== 'undefined' && MF_CC_STATUS_META[statusIntern])
              || { cl: '#374151', bg: '#f9fafb', bd: '#e5e7eb' };
  const next  = (typeof mfCcNextStatus === 'function') ? mfCcNextStatus(statusIntern) : null;

  const liefDatum = a.liefertermin
    ? new Date(a.liefertermin).toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'})
    : '–';
  const erstelltDatum = a.createdAt
    ? new Date(a.createdAt).toLocaleString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
    : '';

  // Status-Fortschrittsleiste (intern)
  const statusKette = (typeof MF_CC_STATUS_INTERN !== 'undefined') ? MF_CC_STATUS_INTERN : [];
  const aktIdx = statusKette.indexOf(statusIntern);
  const statusBarHTML = statusKette.map((s, i) => {
    const done    = i < aktIdx;
    const current = i === aktIdx;
    return `<div style="flex:1;text-align:center;font-size:10px;padding:4px 2px;
                border-radius:4px;font-weight:${current?'700':'400'};
                background:${current ? sm.bg : done ? '#f0fdf4' : '#f8fafc'};
                color:${current ? sm.cl : done ? '#16a34a' : 'var(--muted)'};
                border:1px solid ${current ? sm.bd : done ? '#86efac' : 'var(--line)'};">
              ${done ? '✓' : ''} ${s}
            </div>`;
  }).join('');

  // Lieferfotos-Galerie
  const fotos = a.lieferung?.fotos || [];
  const fotosHTML = fotos.length > 0 ? `
    <div style="margin-top:10px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:6px;">
        Liefernachweis · ${fotos.length} Foto${fotos.length !== 1 ? 's' : ''}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${fotos.map(f => `
          <div style="position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--line);">
            ${f.datenUrl
              ? `<img src="${f.datenUrl}" alt="${mfHtmlEscape(f.dateiname)}"
                  style="width:90px;height:70px;object-fit:cover;display:block;">`
              : `<div style="width:90px;height:70px;background:#f8fafc;display:flex;align-items:center;
                             justify-content:center;font-size:24px;">🖼</div>`}
            <div style="font-size:10px;color:var(--muted);padding:2px 5px;
                        background:rgba(255,255,255,.9);position:absolute;bottom:0;left:0;right:0;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${new Date(f.zeitpunkt).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  // Lieferstatus-Block (intern)
  const lieferungHTML = `
    <div style="margin-bottom:14px;padding:12px 14px;border-radius:8px;
                background:${a.lieferung?.geliefertAm ? '#f0fdf4' : '#fff7ed'};
                border:1px solid ${a.lieferung?.geliefertAm ? '#86efac' : '#fdba74'};">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:${statusIntern==='Unterwegs'||statusIntern==='Geliefert'?'10px':'0'};">
        <span style="font-size:14px;">${a.lieferung?.geliefertAm ? '✅' : '🚚'}</span>
        <div>
          <div style="font-size:13px;font-weight:700;">Lieferung</div>
          ${a.lieferung?.geliefertAm
            ? `<div style="font-size:12px;color:#166534;">
                Geliefert am ${new Date(a.lieferung.geliefertAm).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                ${a.lieferung.geliefertVon
                  ? ` · von <strong>${(USERS||[]).find(u=>u.id===a.lieferung.geliefertVon)?.name || a.lieferung.geliefertVon}</strong>`
                  : ''}
               </div>`
            : `<div style="font-size:12px;color:var(--muted);">Noch nicht geliefert</div>`}
        </div>

        ${statusIntern === 'Unterwegs' ? `
          <!-- Mobile: Großer GELIEFERT-Button wenn "Unterwegs" -->
          <label style="margin-left:auto;cursor:pointer;">
            <input type="file" accept="image/*" capture="environment" multiple style="display:none;"
              onchange="mfCcLieferFotoUpload('${p.id}', this)">
            <span class="btn sm ghost" style="pointer-events:none;">📷 Fotos hinzufügen</span>
          </label>
          <button class="btn primary"
            style="background:#16a34a;border-color:#16a34a;font-size:14px;padding:8px 18px;"
            onclick="mfCcSetGeliefert('${p.id}',currentUserId,[]);renderView();
                     toast('✅ Geliefert','Auftrag als geliefert markiert.','tg');">
            ✅ Geliefert
          </button>` : ''}

        ${statusIntern === 'Geliefert' ? `
          <!-- Fotos nachträglich hinzufügen -->
          <label style="margin-left:auto;cursor:pointer;">
            <input type="file" accept="image/*" capture="environment" multiple style="display:none;"
              onchange="mfCcLieferFotoUpload('${p.id}', this)">
            <span class="btn sm ghost" style="pointer-events:none;">📷 Weiteres Foto</span>
          </label>` : ''}
      </div>
      ${fotosHTML}
    </div>`;

  return `
    <div style="background:#fff;border:2px solid #c7d2fe;border-radius:var(--r);
                padding:16px;margin-top:14px;box-shadow:var(--shadow);">

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        <div style="font-size:15px;font-weight:700;color:#3730a3;">🏭 CC-Intern Auftrag</div>
        <code style="font-size:13px;font-weight:700;background:#ede9fe;color:#4c1d95;
                     padding:3px 10px;border-radius:6px;">${a.id}</code>
        <!-- Interner Status -->
        <span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px;
                     background:${sm.bg};color:${sm.cl};border:1px solid ${sm.bd};">
          ${statusIntern}
        </span>
        <!-- Externer Status (was Kunden sehen) -->
        <span style="font-size:11px;padding:2px 10px;border-radius:999px;
                     background:${exm.bg};color:${exm.cl};border:1px solid ${exm.bd};"
              title="Sichtbar für externe Nutzer">
          ${exm.icon} ${statusExtern}
        </span>
        <div style="margin-left:auto;font-size:11px;color:var(--muted);">
          ${erstelltDatum} · ${a.sourceId}
        </div>
      </div>

      <!-- Fortschrittsleiste intern -->
      <div style="display:flex;gap:3px;margin-bottom:14px;overflow-x:auto;">
        ${statusBarHTML}
      </div>

      <!-- Kerndaten -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;
                  font-size:12px;margin-bottom:14px;padding:10px 12px;
                  background:#f8fafc;border-radius:8px;border:1px solid var(--line);">
        <div><span style="color:var(--muted);">Kunde</span><br><strong>${mfHtmlEscape(a.kunde)}</strong></div>
        <div><span style="color:var(--muted);">Liefertermin</span><br><strong>${liefDatum}</strong></div>
        <div><span style="color:var(--muted);">Bezeichnung</span><br><strong>${mfHtmlEscape(a.bezeichnung)}</strong></div>
        <div><span style="color:var(--muted);">Priorität</span><br><strong>${a.prioritaet||'–'}</strong></div>
        ${a.veranstaltung?`<div><span style="color:var(--muted);">Veranstaltung</span><br><strong>${mfHtmlEscape(a.veranstaltung)}</strong></div>`:''}
        ${a.stand?`<div><span style="color:var(--muted);">Stand</span><br><strong>${mfHtmlEscape(a.stand)}</strong></div>`:''}
        ${a.auftragswert?`<div><span style="color:var(--muted);">Auftragswert</span><br><strong>${a.auftragswert} €</strong></div>`:''}
      </div>

      <!-- Positionen -->
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:6px;">
        Positionen (${a.positionen.length})
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:14px;">
        ${a.positionen.map(pos => `
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;
                      padding:6px 10px;background:#f8fafc;
                      border:1px solid var(--line);border-radius:6px;flex-wrap:wrap;">
            <span style="font-weight:600;min-width:80px;">${mfHtmlEscape(pos.bezeichnung)}</span>
            <span style="color:var(--muted);">${mfHtmlEscape(pos.bestellmass)}</span>
            <span style="color:var(--muted);">${mfHtmlEscape(pos.material)}</span>
            ${pos.menge>1?`<span style="color:var(--muted);">×${pos.menge}</span>`:''}
            ${pos.datei
              ? `<span style="margin-left:auto;font-size:11px;color:var(--green);font-weight:600;">✓ ${mfHtmlEscape(pos.datei)}</span>`
              : '<span style="margin-left:auto;font-size:11px;color:var(--muted);">– keine Datei</span>'}
          </div>`).join('')}
      </div>

      <!-- Lieferung + Fotos -->
      ${lieferungHTML}

      <!-- Kalender -->
      ${a.kalenderEintrag ? `
        <div style="font-size:12px;color:#1e40af;background:#eff6ff;border:1px solid #93c5fd;
                    border-radius:6px;padding:8px 12px;margin-bottom:12px;
                    display:flex;align-items:center;gap:8px;">
          <span>📅</span>
          <span>Kalender aus <strong>${a.kalenderEintrag.ccInternId}</strong>
          · Liefertermin: <strong>${a.kalenderEintrag.liefertermin
            ? new Date(a.kalenderEintrag.liefertermin).toLocaleDateString('de-DE') : '–'}</strong></span>
        </div>` : ''}

      <!-- Workflow-Aktionen (Status weiterschalten) -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px;">
        ${next && next !== 'Geliefert' ? `
          <button class="btn sm primary"
            onclick="mfUpdateCcInternStatus('${p.id}','${next}');renderView();">
            ▶ ${next}
          </button>` : ''}
        ${next === 'Geliefert' ? `
          <!-- "Unterwegs" → "Geliefert": wird im Lieferungs-Block oben als großer Button gezeigt -->` : ''}
        ${statusIntern === 'Geliefert' ? `
          <span style="font-size:13px;color:#166534;font-weight:700;">✅ Abgeschlossen</span>` : ''}
        <span style="margin-left:auto;font-size:10px;color:var(--muted);">
          ${a.sourceSystem} · ${a.sourceId}
        </span>
      </div>
    </div>`;
}

window.buildCcInternAuftragPanel = buildCcInternAuftragPanel;

function buildProjektVerlauf(p) {
  if (typeof mfAuditForProject !== 'function') return '';
  const rows = mfAuditForProject(p.id).slice(0, 50);
  if (!rows.length) {
    return `
      <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:16px;margin-top:14px;">
        <div style="font-size:14px;font-weight:700;margin-bottom:6px;">📜 Verlauf</div>
        <div style="font-size:12px;color:var(--muted);">Noch keine protokollierten Aktionen für dieses Projekt.</div>
      </div>`;
  }
  const label = (a) => ({
    datei_hochgeladen: 'Datei hochgeladen / ersetzt',
    datei_freigegeben: 'Datei freigegeben',
    datei_download: 'Datei heruntergeladen',
    caldera_gesendet: 'An Druck gesendet (Caldera)',
    druck_status_zurueckgesetzt: 'Druck-Status zurückgesetzt (Admin)',
    benutzer_aus_projekt: 'Benutzer aus Projekt entfernt',
    projekt_angelegt: 'Projekt angelegt',
    benutzer_angelegt: 'Benutzer angelegt (Admin)',
    benutzer_deaktiviert: 'Benutzer deaktiviert',
    benutzer_zu_projekt: 'Benutzer zum Projekt hinzugefügt',
    projekt_recht_geaendert: 'Projekt-Recht geändert',
    projekt_recht_reset: 'Projekt-Rechte zurückgesetzt',
    modul_zugriff_geaendert: 'Modul-Zugriff geändert',
    login: 'Anmeldung',
    logout: 'Abmeldung',
    projekt_benutzer_gesperrt: 'Benutzer im Projekt gesperrt',
    projekt_benutzer_entsperrt: 'Projekt-Sperre aufgehoben',
  }[a] || a);
  const detail = (e) => {
    if (e.action === 'datei_hochgeladen' && e.meta) {
      const n = e.meta.dateiNeu || '';
      const o = e.meta.dateiAlt;
      return o ? `${n} (vorher: ${o})` : n;
    }
    if (e.meta?.datei) return e.meta.datei;
    return e.meta ? JSON.stringify(e.meta) : '';
  };
  const lines = rows.map(e => `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid var(--line);font-size:11px;white-space:nowrap;color:var(--muted);vertical-align:top;">${e.tsDisplay || e.ts || ''}</td>
    <td style="padding:8px 10px;border-bottom:1px solid var(--line);font-size:12px;vertical-align:top;white-space:nowrap;">${e.userName || '—'}</td>
    <td style="padding:8px 10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:top;">
      <strong>${label(e.action)}</strong>${e.wallId ? ` <span style="color:var(--muted);font-size:11px;">(${e.wallId})</span>` : ''}
      ${detail(e) ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${detail(e)}</div>` : ''}
    </td>
  </tr>`).join('');
  return `
    <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:16px;margin-top:14px;">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px;">📜 Verlauf</div>
      <div style="overflow-x:auto;max-height:360px;overflow-y:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#f9fafb;font-size:10px;text-transform:uppercase;color:var(--muted);">
            <th style="padding:6px 10px;text-align:left;border-bottom:2px solid var(--line);">Zeit</th>
            <th style="padding:6px 10px;text-align:left;border-bottom:2px solid var(--line);">Wer</th>
            <th style="padding:6px 10px;text-align:left;border-bottom:2px solid var(--line);">Was</th>
          </tr></thead>
          <tbody>${lines}</tbody>
        </table>
      </div>
    </div>`;
}

function buildProdPlan(p){
  const plan = p.produktionsplan;
  const done = plan.filter(s=>s.erledigt).length;
  const pct  = Math.round(done/plan.length*100);

  const steps = plan.map((s,i) => {
    const canToggle = canEditProject(currentUserId, p.id);
    const prevDone  = i===0 || plan[i-1].erledigt;
    const isActive  = !s.erledigt && prevDone;
    const bg = s.erledigt ? '#f0fdf4' : isActive ? '#eff6ff' : '#fafafa';
    const border = s.erledigt ? '#86efac' : isActive ? '#93c5fd' : 'var(--line)';
    const leftBorder = s.erledigt ? 'var(--green)' : isActive ? 'var(--blue)' : '#e5e7eb';
    return `
      <div style="background:${bg};border:1px solid ${border};border-left:4px solid ${leftBorder};
        border-radius:9px;padding:10px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:18px;">${s.icon}</span>
        <div style="flex:1;min-width:100px;">
          <div style="font-weight:700;font-size:13px;${s.erledigt?'text-decoration:line-through;color:var(--muted);':''}">${s.label}</div>
          <div style="font-size:11px;color:var(--muted);">${s.rolle} · ${s.start}${s.end&&s.end!==s.start?' – '+s.end:''}</div>
        </div>
        <span style="font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;
          background:${s.erledigt?'var(--sg)':isActive?'var(--sb)':'#f9fafb'};
          color:${s.erledigt?'var(--green)':isActive?'var(--blue)':'var(--muted)'};
          border:1px solid ${s.erledigt?'#86efac':isActive?'#93c5fd':'var(--line)'};">
          ${s.erledigt?'✓ Erledigt':isActive?'▶ Aktiv':'Wartend'}
        </span>
        ${canToggle&&isActive ? `<button class="btn sm success" onclick="toggleProdStufe('${p.id}','${s.id}')">✓ Abschließen</button>` : ''}
        ${canToggle&&s.erledigt ? `<button class="btn sm ghost" onclick="toggleProdStufe('${p.id}','${s.id}')">↩</button>` : ''}
      </div>`;
  }).join('');

  return `
    <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:16px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        <div style="font-size:15px;font-weight:700;">🏭 Produktionsplan</div>
        <div style="flex:1;background:var(--line);border-radius:999px;height:6px;overflow:hidden;min-width:80px;">
          <div style="width:${pct}%;background:var(--blue);height:100%;transition:width .3s;"></div>
        </div>
        <span style="font-size:12px;color:var(--muted);white-space:nowrap;">${done} / ${plan.length} Schritte</span>
        ${p.freigabeDatum?`<span style="font-size:11px;color:var(--green);">Freigegeben: ${p.freigabeDatum}</span>`:''}
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;">${steps}</div>
    </div>
    ${(typeof getProjRechte === 'function' && getProjRechte(currentUserId, p.id).exportieren) ? buildCalderaExport(p) : ''}`;
}

// Projekt-Kommentar-Block für renderProjView
function buildProjKommentare(p){
  const kList = (p.kommentare||[]).slice(0,15);
  const anzahl = p.kommentare?.length || 0;
  const darfKom = typeof getProjRechte === 'function' ? !!getProjRechte(currentUserId, p.id).kommentieren : true;

  const kHTML = kList.map(k => `
    <div style="padding:8px 0;border-bottom:1px solid var(--line);">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
        <span style="font-size:12px;font-weight:700;color:var(--blue);">${k.autor}</span>
        <span style="font-size:10px;color:var(--muted);">${k.zeit}</span>
      </div>
      <div style="font-size:13px;color:#374151;line-height:1.4;">${k.text}</div>
    </div>`).join('');

  return `
    <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:16px;margin-top:4px;">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px;">
        💬 Projektkommentare
        ${anzahl>0?`<span style="background:#3b82f6;color:#fff;font-size:11px;padding:2px 8px;border-radius:999px;margin-left:6px;">${anzahl}</span>`:''}
      </div>
      ${kList.length ? `<div style="margin-bottom:12px;">${kHTML}</div>` : '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">Noch keine Projektkommentare.</div>'}
      ${darfKom ? `<div style="display:flex;gap:8px;align-items:flex-end;">
        <textarea id="pk-input-${p.id}"
          placeholder="Projektkommentar schreiben… (für alle sichtbar)"
          rows="2"
          style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;resize:vertical;font-family:inherit;"
          onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){addProjKommentar('${p.id}');event.preventDefault();}"></textarea>
        <button class="btn primary sm" onclick="addProjKommentar('${p.id}')">Senden</button>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:3px;">Strg+Enter zum Senden · sichtbar für alle Rollen</div>` : '<div style="font-size:12px;color:var(--muted);">Kommentieren ist für Ihr Konto in diesem Projekt nicht freigeschaltet.</div>'}
    </div>`;
}

function buildFirmenzuordnung(p) {
  const firmaBadge = (firmaId) => {
    const f = FIRMS.find(x => x.id === firmaId);
    if (!f) return '<span style="color:var(--muted);">–</span>';
    const c = FIRMA_TYP_COLOR[f.typ]||'#666', bg = FIRMA_TYP_BG[f.typ]||'#f9f9f9';
    return `<span style="background:${bg};color:${c};border:1px solid ${c}44;border-radius:6px;padding:3px 8px;font-size:12px;font-weight:600;">${f.name}</span>`;
  };

  const agenturOpts = `<option value="">– keine –</option>` +
    FIRMS.filter(f => f.typ === 'agentur')
      .map(f => `<option value="${f.id}" ${p.agentur_id===f.id?'selected':''}>${f.name}</option>`).join('');

  const zhOpts = `<option value="">– keiner –</option>` +
    USERS.filter(u => u.rolle === 'zwischenhaendler' && u.aktiv !== false)
      .map(u => `<option value="${u.id}" ${p.zwischenhaendler_id===u.id?'selected':''}>${u.name}</option>`).join('');

  const prodFirmen = FIRMS.filter(f => f.typ === 'produktion');
  const prodRows = prodFirmen.map(f => {
    const checked = p.produktion_ids?.includes(f.id) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:3px 0;">
      <input type="checkbox" ${checked} onchange="toggleProjProduktion('${p.id}','${f.id}',this.checked)">
      ${f.name}
    </label>`;
  }).join('') || '<span style="font-size:12px;color:var(--muted);">Keine Produktionsfirmen angelegt</span>';

  return `
    <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:16px;margin-top:4px;">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px;">🏢 Firmenzuordnung</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:5px;">Agentur</div>
          <select onchange="saveProjAgentur('${p.id}',this.value)"
            style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">
            ${agenturOpts}
          </select>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:5px;">Zwischenhändler</div>
          <select onchange="saveProjZH('${p.id}',this.value)"
            style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">
            ${zhOpts}
          </select>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:5px;">Produktion</div>
          <div style="display:flex;flex-direction:column;gap:2px;">${prodRows}</div>
        </div>
      </div>
    </div>`;
}

function buildProjektTeamAnzeige(p) {
  // Team aus Zuweisungsfeldern ableiten (nicht aus projektMitglieder)
  const teamIds = buildProjektTeam(p);
  if (!teamIds.length) return '';

  const rows = teamIds.map(uid => {
    const user = USERS.find(u => u.id === uid);
    if (!user) return '';
    const rolleLabel = ROLES.find(r => r.id === user.rolle)?.label || user.rolle;
    const istKoordinator = p.koordinator_id === uid;
    const istZH          = p.zwischenhaendler_id === uid;
    const istIntern      = p.intern_ids?.includes(uid);
    const aufgabe = istKoordinator ? 'Koordinator'
                  : istZH         ? 'Zwischenhändler'
                  : istIntern     ? 'CC Intern'
                  : rolleLabel;
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid var(--line);">${user.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--line);color:var(--muted);font-size:12px;">${aufgabe}</td>
    </tr>`;
  }).join('');

  return `
    <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:16px;margin-top:4px;">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px;">👥 Projektteam</div>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${rows}</tbody>
      </table>
      <div style="font-size:11px;color:var(--muted);margin-top:8px;">Team wird automatisch aus der Firmenzuordnung abgeleitet.</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════
// ZUGRIFFSBLOCK — kompakt, inline, direkt im Projekt
// ═══════════════════════════════════════════════════════
// Tabellen-Open-State merken damit nach Checkbox-Änderung nicht zugeklappt wird
const _zugriffsOpen = {};

function toggleZugriffsTabelle(projId) {
  const tableId = 'ztable-' + projId;
  const btnId   = 'ztoggle-' + projId;
  const t = document.getElementById(tableId);
  const b = document.getElementById(btnId);
  if (!t) return;
  const nowOpen = t.style.display === 'none';
  t.style.display = nowOpen ? 'block' : 'none';
  _zugriffsOpen[projId] = nowOpen;
  if (b) b.textContent = nowOpen ? 'Schließen' : 'Zugriff anpassen';
}

function zugriffsRechtAendern(projId, userId, feld, val) {
  setProjRecht(projId, userId, feld, val);
  // Override-Indikator des Users aktualisieren ohne ganzen View neu zu rendern
  const indId = 'zind-' + projId + '-' + userId;
  const el = document.getElementById(indId);
  if (el) el.textContent = '✎';
}

function zugriffsSperre(projId, userId, sperren) {
  setProjSperre(projId, userId, sperren);
  // Tabellen-Zeile im DOM direkt neu rendern (nur diese Zeile via Re-Render des Blocks)
  const p = getP(projId);
  if (!p) return;
  // Den gesamten Zugriffsblock neu rendern (einfachste sichere Methode)
  const blockEl = document.getElementById('ztable-' + projId);
  if (blockEl) {
    const newHtml = buildZugriffsBlock(p);
    const wrapper = blockEl.closest('[id^="zblock-"], div[style*="border-radius"]');
    if (wrapper) {
      const isOpen = blockEl.style.display !== 'none';
      wrapper.outerHTML = newHtml;
      // Tabelle wieder öffnen wenn sie offen war
      if (isOpen) {
        const newTable = document.getElementById('ztable-' + projId);
        const newBtn   = document.getElementById('ztoggle-' + projId);
        if (newTable) newTable.style.display = 'block';
        if (newBtn)   newBtn.textContent = 'Schließen';
      }
      return;
    }
  }
  // Fallback
  renderProjView();
}

function zugriffsReset(projId, userId) {
  resetProjRechte(projId, userId);
  // Checkboxen des Users auf Default zurücksetzen
  const user = USERS.find(u => u.id === userId);
  if (!user) return;
  const defaults = DEFAULT_RECHTE[user.rolle] || {};
  ['sehen','upload','freigabe','angebote','preise','kommentieren','loeschen','exportieren','einladen'].forEach(f => {
    const cb = document.getElementById('zcb-' + projId + '-' + userId + '-' + f);
    if (cb) cb.checked = !!defaults[f];
  });
  const indId = 'zind-' + projId + '-' + userId;
  const el = document.getElementById(indId);
  if (el) el.textContent = '';
  const resetBtn = document.getElementById('zreset-' + projId + '-' + userId);
  if (resetBtn) resetBtn.style.display = 'none';
}

function buildZugriffsBlock(p) {
  const currentUser = getCurrentUser();
  if (!currentUser) return '';
  if (currentUser.rolle !== 'admin' && currentUser.rolle !== 'cc_intern') return '';

  // Alle aktiven User holen — für bestehende Projekte ohne agentur_ids-Felder
  // nutzen wir projektMitglieder als Quelle, sonst getProjektZugangsUser
  let users = getProjektZugangsUser(p);
  // Fallback: wenn keine User aus den neuen Feldern, alle aktiven User zeigen
  if (!users.length) {
    users = USERS.filter(u => u.aktiv !== false);
  }
  if (!users.length) return '';

  const FELDER = ['sehen','upload','freigabe','angebote','preise','kommentieren','loeschen','exportieren','einladen'];
  const FELD_LABELS = {
    sehen:'Sehen', upload:'Upload', freigabe:'Freigeben', angebote:'Angebote', preise:'Preise sehen',
    kommentieren:'Kommentieren', loeschen:'Entfernen', exportieren:'Export', einladen:'Einladen',
  };

  const tableRows = users.map(u => {
    const kontoGesperrt = u.status === 'gesperrt';
    const gesperrt   = isProjGesperrt(p.id, u.id);
    const effGesperrt = kontoGesperrt || gesperrt;
    const rechte     = getProjRechte(u.id, p.id);
    const R          = ROLES.find(r => r.id === u.rolle);
    const hasOverride = !effGesperrt && !!p.zugriffsrechte?.[u.id];

    const rowBg = effGesperrt ? 'background:#fef2f2;' : '';

    const cells = FELDER.map(f => {
      const cbId = `zcb-${p.id}-${u.id}-${f}`;
      return `<td style="padding:10px;border-bottom:1px solid var(--line);text-align:center;${rowBg}">
        <input type="checkbox" id="${cbId}" ${rechte[f]?'checked':''}
          ${effGesperrt ? 'disabled' : `onchange="zugriffsRechtAendern('${p.id}','${u.id}','${f}',this.checked)"`}
          style="width:17px;height:17px;cursor:${effGesperrt?'not-allowed':'pointer'};accent-color:var(--blue);opacity:${effGesperrt?'.3':'1'};">
      </td>`;
    }).join('');

    // Sperr-Toggle (nur Projekt-Ebene; globale Kontosperre in Benutzerverwaltung)
    const sperrBtn = kontoGesperrt
      ? `<span style="font-size:11px;color:#991b1b;font-weight:600;white-space:nowrap;">🔒 Konto gesperrt</span>`
      : gesperrt
      ? `<button class="btn sm" style="font-size:11px;background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;white-space:nowrap;"
           onclick="zugriffsSperre('${p.id}','${u.id}',false)" title="Projekt-Sperre aufheben">
           🔒 Gesperrt – Aufheben
         </button>`
      : `<button class="btn ghost sm" style="font-size:11px;color:var(--red);white-space:nowrap;"
           onclick="zugriffsSperre('${p.id}','${u.id}',true)" title="Zugriff auf diesem Projekt komplett sperren">
           Sperren
         </button>`;

    const statusLabel = kontoGesperrt
      ? 'Manuell gesperrt (Konto) – Firmenrechte ignoriert'
      : gesperrt
      ? 'Manuell gesperrt (Projekt)'
      : (R?.label || u.rolle);

    return `<tr style="${rowBg}">
      <td style="padding:10px;border-bottom:1px solid var(--line);white-space:nowrap;${rowBg}">
        <div style="font-weight:600;font-size:13px;${effGesperrt?'color:var(--red);':''}">
          ${effGesperrt ? '🔒 ' : ''}${u.name}
          <span id="zind-${p.id}-${u.id}" style="font-size:10px;color:#92400e;font-weight:700;margin-left:4px;">${hasOverride?'✎':''}</span>
        </div>
        <div style="font-size:11px;color:${effGesperrt?'var(--red)':R?.color||'var(--muted)'};">
          ${statusLabel}
        </div>
      </td>
      ${cells}
      <td style="padding:10px;border-bottom:1px solid var(--line);text-align:right;min-width:120px;${rowBg}">
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
          ${sperrBtn}
          ${!effGesperrt && hasOverride
            ? `<button id="zreset-${p.id}-${u.id}" class="btn ghost sm"
                style="font-size:11px;color:var(--muted);"
                onclick="zugriffsReset('${p.id}','${u.id}')">↺ Reset</button>`
            : !effGesperrt
            ? `<span style="font-size:11px;color:var(--muted);">Standard</span>`
            : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  const isOpen = !!_zugriffsOpen[p.id];

  return `
    <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:16px;margin-top:4px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:${isOpen?'14':'0'}px;">
        <div style="font-size:14px;font-weight:700;">🔐 Zugriff</div>
        <div style="flex:1;">
          <span style="font-size:12px;background:#f0fdf4;border:1px solid #86efac;color:#166534;
            border-radius:999px;padding:2px 10px;font-weight:600;">✓ Standard aktiv (über Firma)</span>
          <span style="font-size:12px;color:var(--muted);margin-left:8px;">${users.length} Benutzer</span>
        </div>
        <button id="ztoggle-${p.id}" class="btn ghost sm" style="white-space:nowrap;"
          onclick="toggleZugriffsTabelle('${p.id}')">
          ${isOpen ? 'Schließen' : 'Zugriff anpassen'}
        </button>
      </div>
      <div id="ztable-${p.id}" style="display:${isOpen?'block':'none'};">
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;min-width:920px;">
            <thead>
              <tr style="background:#f9fafb;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">
                <th style="padding:8px 10px;text-align:left;border-bottom:2px solid var(--line);min-width:130px;">Benutzer</th>
                ${FELDER.map(f=>`<th style="padding:8px 10px;text-align:center;border-bottom:2px solid var(--line);">${FELD_LABELS[f]}</th>`).join('')}
                <th style="padding:8px 10px;border-bottom:2px solid var(--line);text-align:right;min-width:130px;">Aktionen</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--line);">
          ✎ = manuell überschrieben &nbsp;·&nbsp; ↺ Reset = nur zurück auf Firmen-Standard (<strong>hebt weder Projekt- noch Kontosperre</strong> auf) &nbsp;·&nbsp; 🔒 Projekt = gesperrt nur hier &nbsp;·&nbsp; Kontosperre = Benutzerverwaltung
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════
// ZUSATZBESTELLUNG
// ═══════════════════════════════════════════════════════

const MF_MATERIALIEN = [
  'Folie matt', 'Folie glänzend', 'Mesh', 'Textil', 'PVC Banner',
  'Aufkleber', 'Hartschaum', 'Alu-Dibond', 'Leinwand', 'Papier',
];

function buildZusatzbestellungBlock(p) {
  const zusatz = p.waende.filter(w => w.istZusatzbestellung);
  return `
    <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:16px;margin-top:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:${zusatz.length ? '12px' : '0'};">
        <div style="font-size:15px;font-weight:700;">➕ Zusatzbestellung</div>
        <button class="btn primary sm" onclick="openZusatzbestellungModal('${p.id}')">+ Positionen hinzufügen</button>
      </div>
      ${zusatz.length ? `<div style="font-size:12px;color:var(--muted);">${zusatz.length} Zusatzposition(en) bereits in den Wänden oben eingetragen.</div>` : ''}
    </div>`;
}

function openZusatzbestellungModal(pid) {
  // Startzeile mit einer leeren Position
  window._zsb_pid = pid;
  window._zsb_count = 1;
  openModal('Zusatzbestellung – Positionen hinzufügen', _buildZsbModalContent(1), true);
}

function _buildZsbModalContent(count) {
  const matOptions = MF_MATERIALIEN.map(m => `<option value="${m}">`).join('');
  const rows = Array.from({ length: count }, (_, i) => `
    <div id="zsb-pos-${i}" style="background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:10px;position:relative;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="background:#3b82f6;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">#${i + 1}</span>
        <input type="text" id="zsb-name-${i}" placeholder="z.B. Wand A, Banner Eingang …"
          style="flex:1;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-family:inherit;"
          value="${i === 0 ? '' : ''}">
        ${count > 1 ? `<button type="button" onclick="removeZsbPos(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;line-height:1;padding:2px 6px;" title="Entfernen">✕</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 80px 90px;gap:8px;margin-bottom:8px;">
        <div>
          <label style="font-size:11px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:3px;">Breite</label>
          <input type="number" id="zsb-breite-${i}" placeholder="z.B. 3000" min="1"
            style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:11px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:3px;">Höhe</label>
          <input type="number" id="zsb-hoehe-${i}" placeholder="z.B. 2500" min="1"
            style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:11px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:3px;">Menge</label>
          <input type="number" id="zsb-menge-${i}" value="1" min="1"
            style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:11px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:3px;">Einheit</label>
          <select id="zsb-einheit-${i}"
            style="width:100%;padding:7px 8px;border:1px solid var(--line);border-radius:7px;font-size:13px;background:#fff;">
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div>
          <label style="font-size:11px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:3px;">Material</label>
          <input type="text" id="zsb-material-${i}" list="zsb-mat-list-${i}" placeholder="– Material wählen oder eingeben –"
            style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;font-family:inherit;">
          <datalist id="zsb-mat-list-${i}">${matOptions}</datalist>
        </div>
        <div>
          <label style="font-size:11px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:3px;">Bemerkung (optional)</label>
          <input type="text" id="zsb-bemerkung-${i}" placeholder="z.B. doppelseitig, laminiert …"
            style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;font-family:inherit;">
        </div>
      </div>
    </div>`).join('');

  return `
    <div style="max-height:65vh;overflow-y:auto;padding-right:4px;" id="zsb-list">${rows}</div>
    <button type="button" onclick="addZsbPos()"
      style="width:100%;margin:10px 0;padding:9px;border:2px dashed #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;">
      + Position hinzufügen
    </button>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn ghost sm" onclick="closeModal()">Abbrechen</button>
      <button class="btn primary" onclick="saveZusatzbestellung()">✓ Positionen anlegen</button>
    </div>`;
}

function addZsbPos() {
  window._zsb_count = (window._zsb_count || 1) + 1;
  document.getElementById('modal-c').innerHTML = _buildZsbModalContent(window._zsb_count);
}

function removeZsbPos(idx) {
  const el = document.getElementById(`zsb-pos-${idx}`);
  if (el) el.remove();
}

function saveZusatzbestellung() {
  const pid = window._zsb_pid;
  if (!pid) return;
  const count = window._zsb_count || 1;
  const positionen = [];
  for (let i = 0; i < count; i++) {
    const el = document.getElementById(`zsb-pos-${i}`);
    if (!el) continue; // entfernte Positionen überspringen
    const name     = (document.getElementById(`zsb-name-${i}`)?.value || '').trim();
    const breite   = (document.getElementById(`zsb-breite-${i}`)?.value || '').trim();
    const hoehe    = (document.getElementById(`zsb-hoehe-${i}`)?.value || '').trim();
    const menge    = document.getElementById(`zsb-menge-${i}`)?.value || '1';
    const einheit  = document.getElementById(`zsb-einheit-${i}`)?.value || 'mm';
    const material = (document.getElementById(`zsb-material-${i}`)?.value || '').trim();
    const bemerkung= (document.getElementById(`zsb-bemerkung-${i}`)?.value || '').trim();
    if (!name && !breite && !hoehe) continue; // komplett leere Zeilen ignorieren
    positionen.push({ name, breite, hoehe, menge, einheit, material, bemerkung });
  }
  if (!positionen.length) {
    toast('Hinweis', 'Bitte mindestens eine Position ausfüllen.', 'ty');
    return;
  }
  const added = addZusatzbestellungPositionen(pid, positionen);
  closeModal();
  toast('✓ Zusatzbestellung', `${added} Position(en) angelegt und in den Workflow eingereiht.`, 'tg');
}

window.renderProjView = renderProjView;
window.buildFirmenzuordnung = buildFirmenzuordnung;
window.buildProjektTeamAnzeige = buildProjektTeamAnzeige;
window.buildZugriffsBlock = buildZugriffsBlock;
window.toggleZugriffsTabelle = toggleZugriffsTabelle;
window.zugriffsRechtAendern = zugriffsRechtAendern;
window.zugriffsReset = zugriffsReset;
window.zugriffsSperre = zugriffsSperre;
window.openZusatzbestellungModal = openZusatzbestellungModal;
window.addZsbPos = addZsbPos;
window.removeZsbPos = removeZsbPos;
window.saveZusatzbestellung = saveZusatzbestellung;
