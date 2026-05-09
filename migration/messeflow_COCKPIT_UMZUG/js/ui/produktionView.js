// ═══════════════════════════════════════════════════════
// PRODUKTION VIEW
// ═══════════════════════════════════════════════════════
function renderProduktionView(){
  const cards=[];
  getVisibleProjects(currentUserId).forEach(p=>{
    p.waende.filter(w=>getAktuelleDatei(w)).forEach(w=>{
      cards.push({proj:p.name, wand:w, status:p.status, fileStatus:getAktuelleDatei(w)?.status||'–'});
    });
  });

  document.getElementById('view').innerHTML=`
    <div class="status-banner">
      <div class="sb-title" style="font-size:18px;">Druckfertige Daten</div>
      <div style="font-size:13px;color:var(--muted);">Live-Status aller Dateien im Produktionsfluss</div>
    </div>
    <div class="role-notice rn-produktion">🏭 <strong>Produktion:</strong> Status live einsehbar · Geliefert wird am Ende bestätigt.</div>
    ${cards.length===0
      ? '<div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:32px;text-align:center;color:var(--muted);">Noch keine druckfertigen Daten vorhanden.</div>'
      : cards.map(c=>`
        <div class="prod-card">
          <div>
            <div class="pc-name">${c.wand.name}</div>
            <div class="pc-file">${c.proj} · ${c.status || 'Neu'}</div>
          </div>
          <div class="pc-file">📄 ${c.wand.datei||'–'}</div>
          <div class="pc-masse">📐 ${c.wand.bestellmass||'–'}</div>
          <span class="st-pill" style="margin-left:auto;background:#f8fafc;border:1px solid var(--line);color:#334155;">${c.fileStatus}</span>
        </div>`).join('')
    }
  `;
}

window.renderProduktionView = renderProduktionView;

