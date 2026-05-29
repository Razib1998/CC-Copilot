// ═══════════════════════════════════════════════════════════════════════════════
// MESSEFLOW DASHBOARD VIEW  ←  Quelle: ui/bettinaView.js (Koordination)
//
// Benutzer-, Firmen- und Rechteverwaltung erfolgt ausschließlich im CC Cockpit.
// Diese Datei enthält nur die Nur-Lese-Koordinationsübersicht für die Rolle
// „Zwischenhändler“ (renderView-Router in messeflow-main-view.js).
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Koordinations-Ansicht: sichtbare Projekte mit Wandstatus (nur Lesen).
 * Voraussetzung: ST_LABELS / ST_DOT (messeflow-data-port.js), projAmpel, getProjektStatusMeta, …
 */
function renderBettinaView() {
  const rows = getVisibleProjects(currentUserId).map(p => {
    const amp = projAmpel(p);
    const st = getProjektStatusMeta(p.status || 'Neu');
    let dlStr = '–';
    if (p.auftragsInfo && p.auftragsInfo.liefertermin) {
      dlStr = p.auftragsInfo.liefertermin;
    } else if (p.deadline) {
      const dl = new Date(p.deadline);
      if (!isNaN(+dl)) dlStr = dl.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    const druckf = p.waende.filter(w => w.status === 5).length;

    const wandRows = p.waende.map(w => {
      const dot = ST_DOT[w.status];
      return `<tr>
        <td style="padding:6px 12px 6px 24px;font-size:13px;color:var(--muted);">${w.name}</td>
        <td style="padding:6px 12px;">
          <span class="ampel ${dot}" style="display:inline-block;vertical-align:middle;margin-right:6px;"></span>
          <span style="font-size:12px;${w.status === 6 ? 'color:var(--red);font-weight:700;' : w.status === 7 ? 'color:var(--yellow);font-weight:700;' : w.status === 9 ? 'color:#5b21b6;font-weight:700;' : ''}">${ST_LABELS[w.status]}</span>
        </td>
        <td style="padding:6px 12px;font-size:12px;color:var(--muted);">${w.datei || '–'}</td>
        <td style="padding:6px 12px;font-size:12px;">
          ${(() => {
            if (!w.bestellmass) return '<span style="color:var(--muted)">–</span>';
            const vgl = (w.bestellmass && w.dateiMass) ? vergleicheMasse(w.bestellmass, w.dateiMass) : null;
            const diff = vgl && vgl.maxDiff !== null ? ` <span style="color:${vgl.stufe === 'ok' ? 'var(--green)' : vgl.stufe === 'warnung' ? 'var(--yellow)' : 'var(--red)'};font-weight:700;">Δ ${fmm(vgl.maxDiff)}</span>` : '';
            return `${w.bestellmass}${w.dateiMass ? ' / ' + w.dateiMass : ''}${diff}`;
          })()}
        </td>
      </tr>`;
    }).join('');

    return `
      <tr onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'" style="cursor:pointer;">
        <td style="padding:11px 12px;">
          <span class="ampel ${amp}" style="display:inline-block;vertical-align:middle;margin-right:7px;"></span>
          <span class="bv-proj-name">${p.name}</span>
          <div class="bv-proj-deadline">${p.kunde} · Deadline: ${dlStr}</div>
          <div style="display:inline-block;margin-top:4px;font-size:10px;font-weight:700;color:${st.cl};background:${st.bg};border:1px solid ${st.bd};border-radius:999px;padding:2px 7px;">${p.status || 'Neu'}</div>
        </td>
        <td style="padding:11px 12px;text-align:center;">
          <span style="font-size:13px;font-weight:700;color:${amp === 'gruen' ? 'var(--green)' : amp === 'gelb' ? 'var(--yellow)' : 'var(--red)'};">${druckf} / ${p.waende.length}</span>
          <div style="font-size:11px;color:var(--muted);">druckfertig</div>
        </td>
        <td style="padding:11px 12px;text-align:right;">
          <span style="font-size:11px;color:var(--muted);">▼ Details</span>
        </td>
      </tr>
      <tr style="display:none;">
        <td colspan="3" style="padding:0;">
          <table style="width:100%;border-collapse:collapse;background:#fafafa;">
            <tr style="background:#f3f4f6;">
              <th style="text-align:left;padding:6px 12px 6px 24px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Wand</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Status</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Datei</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Maße</th>
            </tr>
            ${wandRows}
          </table>
        </td>
      </tr>`;
  }).join('');

  document.getElementById('view').innerHTML = `
    <div class="status-banner" style="margin-bottom:0;">
      <div class="sb-title" style="font-size:18px;margin-bottom:4px;">Übersicht – alle Projekte</div>
      <div style="font-size:13px;color:var(--muted);">Nur-Lese-Ansicht · Koordination</div>
    </div>

    <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;">
      <div style="padding:12px 14px;background:#fafafa;border-bottom:1px solid var(--line);display:flex;gap:16px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;"><span class="ampel gruen"></span>Druckfertig</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;"><span class="ampel gelb"></span>In Bearbeitung</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;"><span class="ampel rot"></span>Fehlt etwas</div>
      </div>
      <table id="bettina-view" class="bv-table" style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th>Projekt / Auftraggeber</th>
          <th style="text-align:center;">Fortschritt</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="role-notice rn-bettina" style="margin-top:4px;">
      📋 <strong>Koordination:</strong> Nur Statusübersicht. Klick auf Projekt-Zeile für Details.
    </div>
  `;
}

window.renderBettinaView = renderBettinaView;
