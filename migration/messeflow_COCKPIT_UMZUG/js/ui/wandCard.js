// ═══════════════════════════════════════════════════════
// WAND CARD
// ═══════════════════════════════════════════════════════
function renderWandCard(p,w){
  const mitglied = getProjektMitglied(currentUserId, p.id);
  const projektRolle = mitglied?.rolle || role;
  const projektZugriff = getProjektZugriff(currentUserId, p.id);

  const canEdit = canEditProject(currentUserId, p.id);

  const hasBestellmass = !!(w.bestellmass && w.bestellmass.trim());
  const hasDateiMass   = !!(w.dateiMass   && w.dateiMass.trim());

  // ── Numerischer Vergleich ──
  const vgl = (hasBestellmass && hasDateiMass) ? vergleicheMasse(w.bestellmass, w.dateiMass) : null;

  // ── Differenz-Panel (vereinfacht) ──
  let diffPanel = '';
  if(vgl && w.datei){
    const stufe = vgl.stufe;
    const configs = {
      ok:        { bg:'#f0fdf4', border:'#86efac', text:'#166534', title:'✓ Maße stimmen überein' },
      warnung:   { bg:'#fffbeb', border:'#fde68a', text:'#92400e', title:'⚡ Geringe Abweichung' },
      abweichung:{ bg:'#fef2f2', border:'#fecaca', text:'#7f1d1d', title:'⚠ Abweichung kritisch (>20 mm)' },
      unlesbar:  { bg:'#f9fafb', border:'#e5e7eb', text:'#6b7280', title:'ℹ Maße nicht lesbar – bitte manuell prüfen' },
    };
    const cfg = configs[stufe];

    // Einfacher Klartext-Hinweis: zu groß / zu klein
    let richtungHint = '';
    if(vgl.dw !== null && (stufe === 'abweichung' || stufe === 'warnung')){
      const b = parseMass(w.bestellmass), d = parseMass(w.dateiMass);
      if(b && d){
        const dateiKleiner = (d.w < b.w || d.h < b.h);
        const dateiGroesser= (d.w > b.w || d.h > b.h);
        if(dateiKleiner && !dateiGroesser)      richtungHint = '→ Datei ist zu klein';
        else if(dateiGroesser && !dateiKleiner) richtungHint = '→ Datei ist zu groß';
        else                                    richtungHint = '→ Abweichung in Breite und Höhe';
      }
    }

    diffPanel = `
      <div style="background:${cfg.bg};border:1px solid ${cfg.border};border-radius:9px;
        padding:10px 14px;margin-bottom:2px;color:${cfg.text};display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="font-weight:700;font-size:13px;white-space:nowrap;">${cfg.title}</div>
        <div style="font-size:13px;">
          <strong>${w.bestellmass}</strong> → <strong>${w.dateiMass}</strong>
        </div>
        ${richtungHint ? `<div style="font-size:12px;font-weight:700;">${richtungHint}</div>` : ''}
      </div>`;
  }

  // ── Datei (einfach) ──
  const aktuelleDatei = getAktuelleDatei(w);
  const DW = typeof DATEI_WORKFLOW !== 'undefined' ? DATEI_WORKFLOW : window.DATEI_WORKFLOW;
  const _isProd = (getCurrentUser()?.rolle === 'produktion');
  const prodFrei = aktuelleDatei && DW && [DW.FREIGEGEBEN, DW.CALDERA_GESENDET, DW.WIRD_GEDRUCKT, DW.GELIEFERT].includes(aktuelleDatei.status);
  const kannDl = aktuelleDatei && dateiVorhanden(w.id) && (!_isProd || prodFrei);
  const dateiHintProd = _isProd && aktuelleDatei && !prodFrei
    ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">Nach Freigabe downloadbar</div>` : '';
  // Risiko-Badge: wenn Datei trotz Warnungen hochgeladen wurde
  const risikoBadge = aktuelleDatei?.risikoUpload
    ? `<span style="font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;
                    border:1px solid #f59e0b;border-radius:4px;padding:1px 6px;white-space:nowrap;"
            title="Hochgeladen auf eigenes Risiko · ${aktuelleDatei.risikoBestaetigt||''}">⚠ Eigenes Risiko</span>`
    : '';

  const dateiCol = aktuelleDatei
    ? `<div class="file-chip" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
        📄 ${aktuelleDatei.name}
        ${risikoBadge}
        ${kannDl ? `<button type="button" class="btn ghost sm" onclick="downloadWandDatei('${p.id}','${w.id}')">⬇ Download</button>` : ''}
       </div>${dateiHintProd}`
    : `<span class="fc-col-val missing">Keine Datei</span>`;

  // ── Bestellmaß ──
  const bestellCol = hasBestellmass
    ? `<span class="fc-col-val">${w.bestellmass}</span>`
    : `<span class="fc-col-val missing">Nicht eingetragen</span>`;

  // ── Dateimaß ──
  let dateiMassDisplay;
  if(!w.datei) {
    dateiMassDisplay = `<span class="fc-col-val missing">–</span>`;
  } else if(hasDateiMass){
    const farbe = !vgl ? '' : vgl.stufe==='ok' ? 'color:var(--green);font-weight:600;' : vgl.stufe==='warnung' ? 'color:var(--yellow);font-weight:600;' : 'color:var(--red);font-weight:700;';
    dateiMassDisplay = `<span class="fc-col-val" style="${farbe}">${w.dateiMass}</span>`;
  } else {
    dateiMassDisplay = `<span class="fc-col-val missing">Noch nicht eingetragen</span>`;
  }

  // ── Datei-Workflow (ohne Dropdown) ──
  let aktion = '';
  const slot = effektivePruefSlot(w, vgl);
  const normWorkflow = aktuelleDatei && typeof window.normalizeDateiWorkflowStatus === 'function'
    ? window.normalizeDateiWorkflowStatus(aktuelleDatei.status)
    : aktuelleDatei?.status;
  const workflowStatus = aktuelleDatei ? normWorkflow : '—';
  const dateiDruckGesperrt = aktuelleDatei && typeof window.istDateiDruckGesperrt === 'function'
    ? window.istDateiDruckGesperrt(aktuelleDatei.status)
    : false;
  const user = getCurrentUser();
  const isKunde = user?.rolle === 'zwischenhaendler';
  const isCcIntern = user?.rolle === 'cc_intern' || user?.rolle === 'admin' || user?.id === 'u3' || user?.id === 'u_cc_intern' || user?.id === 'u_celal';
  const isProduktion = user?.rolle === 'produktion';
  const canLiefern = (isProduktion || isCcIntern) && projektZugriff !== 'lesen' && canEdit;

  if(!dateiDruckGesperrt && canUpload(currentUserId, p) && projektZugriff!=='lesen' && canEdit){
    if(!aktuelleDatei){
      aktion = `<button class="btn primary sm" onclick="uploadDatei('${p.id}','${w.id}')">📤 Datei hochladen</button>`;
    } else {
      aktion = `<button class="btn ghost sm" onclick="uploadDatei('${p.id}','${w.id}')">📤 Datei ersetzen</button>`;
    }
  }

  if(aktuelleDatei && !dateiDruckGesperrt && workflowStatus === DATEI_WORKFLOW.HOCHGELADEN){
    syncDateiWorkflowByPruefung(p.id, w.id);
  }

  if(aktuelleDatei && !dateiDruckGesperrt && [DATEI_WORKFLOW.IN_PRUEFUNG, DATEI_WORKFLOW.HOCHGELADEN].includes(workflowStatus)){
    if(slot === 'ok'){
      if((isKunde || isCcIntern) && projektZugriff !== 'lesen' && canEdit){
        aktion += `${aktion ? '<br>' : ''}<button class="btn green-btn sm" onclick="freigebenDateiUI('${p.id}','${w.id}')">✅ Freigeben</button>`;
      }
    } else {
      aktion += `${aktion ? '<br>' : ''}<span style="font-size:12px;color:var(--red);font-weight:700;">Datei nicht OK</span>`;
    }
  }

  const rawFileStatus = getAktuelleDatei(w)?.status || workflowStatus;
  const statusNachSync = typeof window.normalizeDateiWorkflowStatus === 'function'
    ? window.normalizeDateiWorkflowStatus(rawFileStatus)
    : rawFileStatus;
  const statusAnzeige = statusNachSync;
  const statusPillStyle = statusAnzeige === DATEI_WORKFLOW.CALDERA_GESENDET
    ? 'background:#ede9fe;border:1px solid #a78bfa;color:#5b21b6;font-weight:700;'
    : 'background:#f8fafc;border:1px solid var(--line);color:#334155;';
  if(aktuelleDatei && statusNachSync === DATEI_WORKFLOW.FREIGEGEBEN && isCcIntern && projektZugriff !== 'lesen' && canEdit){
    aktion += `${aktion ? '<br>' : ''}<button class="btn primary sm" onclick="sendeDateiAnCalderaUI('${p.id}','${w.id}')">🖨 An Caldera senden</button>`;
  }
  if(aktuelleDatei && statusNachSync === DATEI_WORKFLOW.CALDERA_GESENDET && isCcIntern && projektZugriff !== 'lesen' && canEdit){
    aktion += `${aktion ? '<br>' : ''}<button class="btn primary sm" onclick="setDateiWirdGedrucktUI('${p.id}','${w.id}')">🖨 Wird gedruckt</button>`;
  }
  if(dateiDruckGesperrt && role === 'admin' && projektZugriff !== 'lesen'){
    aktion += `${aktion ? '<br>' : ''}<button type="button" class="btn ghost sm" onclick="adminResetDruckStatusUI('${p.id}','${w.id}')">↩ Druck-Status zurücksetzen</button>`;
  }
  if(aktuelleDatei && statusNachSync === DATEI_WORKFLOW.WIRD_GEDRUCKT){
    aktion += `${aktion ? '<br>' : ''}<span style="font-size:12px;color:var(--blue);font-weight:700;">🖨 Wird gedruckt</span>`;
    if(canLiefern){
      aktion += `${aktion ? '<br>' : ''}<button class="btn primary sm" onclick="dateiGeliefertUI('${p.id}','${w.id}')">Geliefert</button>`;
    }
  }
  if(aktuelleDatei && statusNachSync === DATEI_WORKFLOW.GELIEFERT){
    const menge = aktuelleDatei.gelieferteMenge ? ` · Menge: ${aktuelleDatei.gelieferteMenge}` : '';
    aktion += `${aktion ? '<br>' : ''}<span style="font-size:12px;color:var(--green);font-weight:700;">✓ Geliefert${menge}</span>`;
  }

  // Norbert: Dateimaß-Anzeige (wird automatisch vom Backend erkannt — keine manuelle Eingabe)
  let dateiMassInput = '';
  if(projektZugriff==='freigeben' && w.datei && hasBestellmass && !hasDateiMass){
    dateiMassInput = `
      <div class="fc-col" style="min-width:175px;">
        <div class="fc-col-label">Dateimaß</div>
        <div style="font-size:12px;color:var(--muted);padding:4px 0;">
          ⏳ Wird beim Upload automatisch erkannt
        </div>
      </div>`;
  }

  const cardBorder = w.status===6 ? 'border-color:#fecaca;border-left:4px solid var(--red);'
                   : w.status===7 ? 'border-color:#fde68a;border-left:4px solid var(--yellow);'
                   : w.status===3 ? 'border-color:#86efac;border-left:4px solid var(--green);'
                   : w.status===9 ? 'border-color:#c4b5fd;border-left:4px solid #7c3aed;'
                   : '';

  // ── Prüfergebnis-Badge (effektiver Status inkl. Maße & Prüfzeilen) ──
  const pruefBadge = (() => {
    const imSpeicher = dateiVorhanden(w.id);
    if(!w.datei) return '';
    const slot = effektivePruefSlot(w, vgl);
    const pr = w.pruefErgebnis;
    const bg  = slot === 'none' ? '#f9fafb' : slot === 'ok' ? 'var(--sg)' : slot === 'warnung' ? 'var(--sy)' : 'var(--sr)';
    const bd  = slot === 'none' ? 'var(--line)' : slot === 'ok' ? '#86efac' : slot === 'warnung' ? '#fde68a' : '#fecaca';
    const cl  = slot === 'none' ? 'var(--muted)' : slot === 'ok' ? 'var(--green)' : slot === 'warnung' ? '#92400e' : 'var(--red)';
    const ic  = slot === 'none' ? 'ℹ' : slot === 'ok' ? '✓' : slot === 'warnung' ? '⚡' : '✖';
    const txt = slot === 'none'
      ? 'Nicht geprüft'
      : slot === 'ok'
        ? 'Datei OK'
        : slot === 'warnung'
          ? 'Warnung'
          : 'Datei nicht OK';
    const zeit = pr?.geprueftAm ? ` · ${pr.geprueftAm}` : '';
    return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
      <div style="background:${bg};border:1px solid ${bd};border-radius:6px;
        padding:4px 9px;font-size:12px;font-weight:700;color:${cl};white-space:nowrap;">
        ${ic} ${txt}${zeit}
      </div>
      ${imSpeicher && projektZugriff !== 'lesen' && !dateiDruckGesperrt
        ? `<button id="repruefen-${w.id}" class="btn ghost sm" style="font-size:11px;"
            onclick="dateiNochmalPruefen('${p.id}','${w.id}')">🔍 Erneut prüfen</button>`
        : ''}
      ${!imSpeicher && w.datei
        ? `<span style="font-size:10px;color:var(--muted);">(Datei neu hochladen für erneute Prüfung)</span>`
        : ''}
    </div>`;
  })();
  const fontBadge = w.fontInfo ? (() => {
    const f = w.fontInfo;
    const bg = f.status==='ok' ? 'var(--sg)' : f.status==='warnung' ? 'var(--sy)' : 'var(--sr)';
    const bd = f.status==='ok' ? '#86efac'   : f.status==='warnung' ? '#fde68a'   : '#fecaca';
    const cl = f.status==='ok' ? 'var(--green)' : f.status==='warnung' ? 'var(--yellow)' : 'var(--red)';
    const ic = f.status==='ok' ? '✓' : f.status==='warnung' ? '⚡' : '✖';
    const tip = f.nichtEingebettet?.length
      ? `Nicht eingebettet: ${f.nichtEingebettet.join(', ')}`
      : f.meldung;
    return `<div style="background:${bg};border:1px solid ${bd};border-radius:6px;
      padding:4px 9px;font-size:12px;font-weight:700;color:${cl};white-space:nowrap;"
      title="${tip}">
      ${ic} Schriften${f.istPdfX?' · PDF/X':''}
    </div>`;
  })() : '';

  // ── DPI-Badge ──
  const dpiBadge = w.dpiInfo ? (() => {
    const d = w.dpiInfo;
    const bg = d.stufe==='ok' ? 'var(--sg)' : d.stufe==='warnung' ? 'var(--sy)' : 'var(--sr)';
    const bd = d.stufe==='ok' ? '#86efac'   : d.stufe==='warnung' ? '#fde68a'   : '#fecaca';
    return `<div style="background:${bg};border:1px solid ${bd};border-radius:6px;
      padding:4px 9px;font-size:12px;font-weight:700;color:${d.color};white-space:nowrap;">
      ${d.label}
    </div>`;
  })() : '';
  return `
    <div id="wand-${w.id}" class="flaeche-card" style="${cardBorder}">
      ${diffPanel ? `<div style="padding:12px 16px 0;">${diffPanel}</div>` : ''}
      <div class="fc-body">
        <div class="fc-name">${w.name}</div>
        <div class="fc-col">
          <div class="fc-col-label">Datei-Status</div>
          <span class="st-pill" style="${statusPillStyle}">${statusAnzeige}</span>
        </div>
        <div class="fc-col">
          <div class="fc-col-label">Datei</div>
          ${dateiCol}
        </div>
        ${pruefBadge ? `<div class="fc-col">
          <div class="fc-col-label">Prüfung</div>
          ${pruefBadge}
        </div>` : ''}
        ${dpiBadge ? `<div class="fc-col">
          <div class="fc-col-label">Auflösung</div>
          ${dpiBadge}
        </div>` : ''}
        ${fontBadge ? `<div class="fc-col">
          <div class="fc-col-label">Schriften</div>
          ${fontBadge}
        </div>` : ''}
        ${w.fontInfo?.farbraum ? (() => {
          const f = w.fontInfo.farbraum;
          const bg = f.status==='ok' ? 'var(--sg)' : 'var(--sy)';
          const bd = f.status==='ok' ? '#86efac'   : '#fde68a';
          const cl = f.status==='ok' ? 'var(--green)' : 'var(--yellow)';
          const ic = f.modus==='cmyk' ? '✓' : '⚡';
          const label = f.modus==='cmyk' ? 'CMYK ✓'
                      : f.modus==='rgb'  ? 'RGB → CMYK'
                      : f.modus==='gemischt' ? 'CMYK+RGB'
                      : f.modus.toUpperCase();
          return `<div class="fc-col">
            <div class="fc-col-label">Farbraum</div>
            <div style="background:${bg};border:1px solid ${bd};border-radius:6px;
              padding:4px 9px;font-size:12px;font-weight:700;color:${cl};white-space:nowrap;"
              title="${f.meldung}">
              ${ic} ${label}
            </div>
          </div>`;
        })() : ''}
        <div class="fc-col">
          <div class="fc-col-label">Bestellmaß</div>
          ${bestellCol}
        </div>
        <div class="fc-col">
          <div class="fc-col-label">Dateimaß</div>
          ${dateiMassDisplay}
        </div>
        ${dateiMassInput}
        ${aktion ? `<div class="fc-actions" style="margin-left:auto;">${aktion}</div>` : ''}
      </div>

      ${/* Nur Speicher-Hinweis unter der Karte — Details stehen oben bei „Prüfung“ */ ''}
      ${w.datei ? (() => {
        const speicherInfo = dateiVorhanden(w.id)
          ? `<span style="font-size:11px;color:var(--muted);">Datei im Speicher · ${window.DATEI_STORE[w.id]?.gespeichertAm || ''}</span>`
          : `<span style="font-size:11px;color:var(--muted);">⚠ Datei nicht im Speicher (Seite neu geladen?)</span>`;
        return `<div style="border-top:1px solid var(--line);padding:8px 16px;background:#fafafa;">${speicherInfo}</div>`;
      })() : ''}
      ${hasBestellmass && (projektZugriff==='freigeben' || projektRolle==='produktion') ? buildKachelungPanel(p,w) : ''}
      ${buildWandKommentare(p,w)}
    </div>`;
}

function dateiGeliefertUI(pid, wid){
  const mengeRaw = prompt('Gelieferte Menge eingeben (z. B. Bahnen/Stück):', '1');
  if(mengeRaw === null) return;
  const menge = Number(String(mengeRaw).replace(',', '.'));
  if(!Number.isFinite(menge) || menge <= 0){
    toast('Ungültige Menge', 'Bitte eine Zahl größer 0 eingeben.', 'ty');
    return;
  }
  const ok = setDateiGeliefert(pid, wid, menge);
  if(!ok){
    toast('Nicht möglich', 'Nur Dateien im Status „Wird gedruckt“ können geliefert werden.', 'ty');
    return;
  }
  const p = getP(pid), w = getW(p, wid);
  toast('✓ Geliefert', `${w.name} · Menge ${menge}`, 'tg');
}

function freigebenDateiUI(pid, wid){
  const ok = freigebenDatei(pid, wid);
  if(!ok){
    toast('Freigabe nicht möglich', 'Datei muss in Prüfung und OK sein.', 'ty');
    return;
  }
  const p = getP(pid), w = getW(p, wid);
  toast('✅ Freigegeben', `${w.name} wurde freigegeben.`, 'tg');
  if (typeof mfPushNotifAndEmail === 'function' && typeof mfNotifIdsProduktionProjekt === 'function') {
    const ids = mfNotifIdsProduktionProjekt(p);
    mfPushNotifAndEmail(ids, pid, `${p.name} – ${w.name}: Datei wurde freigegeben.`, wid, 'status', 'MesseFlow: Freigabe');
  }
}

function sendeDateiAnCalderaUI(pid, wid){
  const ok = sendeDateiAnCaldera(pid, wid);
  if(!ok){
    toast('Senden nicht möglich', 'Nur freigegebene Dateien können gesendet werden.', 'ty');
    return;
  }
  const p = getP(pid), w = getW(p, wid);
  toast('🖨 An Druck gesendet', `${w.name}`, 'tg');
  if (typeof pushNotif === 'function' && typeof mfNotifIdsAlleProjektBeteiligten === 'function') {
    const ids = mfNotifIdsAlleProjektBeteiligten(p);
    const msg = `Wand ${w.name} – Projekt ${p.name} wurde an Caldera zum Druck gesendet`;
    if (ids.length) pushNotif(pid, msg, wid, 'status', ids);
  }
}

function setDateiWirdGedrucktUI(pid, wid){
  const ok = setDateiWirdGedruckt(pid, wid);
  if(!ok){
    toast('Nicht möglich', 'Status kann nur nach „An Druck gesendet“ gesetzt werden.', 'ty');
    return;
  }
  const p = getP(pid), w = getW(p, wid);
  toast('🖨 Wird gedruckt', `${w.name}`, 'tg');
}

function adminResetDruckStatusUI(pid, wid){
  const ok = typeof adminResetDruckStatus === 'function' && adminResetDruckStatus(pid, wid);
  if(!ok){
    toast('Nicht möglich', 'Nur Celal kann den Druck-Status zurücksetzen.', 'ty');
    return;
  }
  toast('Zurückgesetzt', 'Die Datei kann wieder bearbeitet werden.', 'tg');
}

// ═══════════════════════════════════════════════════════
// KACHELUNG + MATERIALAUSWAHL
// ═══════════════════════════════════════════════════════
const ROLLEN = [
  { breite: 1050, label: '105 cm' },
  { breite: 1370, label: '137 cm' },
];
const SICHERHEITSRAND = 20; // mm
const UEBERLAPPUNG    = 20; // mm

function berechneKachelung(gesamtBreiteMm, gesamtHoeheMm){
  if(!gesamtBreiteMm || !gesamtHoeheMm || gesamtBreiteMm <= 0 || gesamtHoeheMm <= 0) return null;

  const varianten = ROLLEN.map(r => {
    const nutzBreite   = r.breite - SICHERHEITSRAND - UEBERLAPPUNG;
    const anzahlBahnen = Math.ceil(gesamtBreiteMm / nutzBreite);
    const bahnBreite   = gesamtBreiteMm / anzahlBahnen;
    const materialMm   = anzahlBahnen * r.breite;
    const materialM    = (materialMm / 1000).toFixed(2);
    // Laufmeter praxisnah: Bahnen × Höhe in m
    const hoeheM       = gesamtHoeheMm / 1000;
    const laufmeterGes = anzahlBahnen * hoeheM;
    const laufmeterStr = `${anzahlBahnen} Bahnen × ${hoeheM.toFixed(1)} m = ${laufmeterGes.toFixed(1)} m Folie`;
    return {
      rollenBreite:  r.breite,
      rollenLabel:   r.label,
      nutzBreite:    Math.round(nutzBreite),
      anzahlBahnen,
      bahnBreite:    Math.round(bahnBreite),
      ueberlappung:  UEBERLAPPUNG,
      materialMm,
      materialM,
      hoeheM:        hoeheM.toFixed(2),
      laufmeterGes:  laufmeterGes.toFixed(1),
      laufmeterStr,
    };
  });

  // Empfehlung: weniger Bahnen bevorzugen; bei Gleichstand → weniger Material
  varianten.sort((a,b) =>
    a.anzahlBahnen !== b.anzahlBahnen
      ? a.anzahlBahnen - b.anzahlBahnen
      : a.materialMm - b.materialMm
  );

  return {
    empfohlen:   varianten[0],
    alternativ:  varianten.length > 1 ? varianten[1] : null,
    alle:        varianten,
    gesamtBreite: gesamtBreiteMm,
    gesamtHoehe:  gesamtHoeheMm,
  };
}

function bahnName(kunde, projekt, motiv, nr){
  const clean = s => (s||'Unbekannt').replace(/[^a-zA-Z0-9äöüÄÖÜß]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  const nn = String(nr).padStart(2,'0');
  return `${clean(kunde)}_${clean(projekt)}_${clean(motiv)}_Bahn_${nn}.pdf`;
}

function setKachelungMaterial(pid, wid, rollenBreite){
  const p = getP(pid), w = getW(p, wid);
  if(!p || !w) return;
  w.kachelungRollenBreite = rollenBreite;
  renderView();
}

function buildKachelungPanel(p, w){
  const mass = parseMass(w.bestellmass);
  if(!mass) return '';
  const k = berechneKachelung(mass.w, mass.h);
  if(!k) return '';

  const rollenBreite = k.alle.some(v => v.rollenBreite === w.kachelungRollenBreite)
    ? w.kachelungRollenBreite
    : k.empfohlen.rollenBreite;
  const e = k.alle.find(v => v.rollenBreite === rollenBreite) || k.empfohlen;
  const kunde   = p.auftragsInfo?.kunde || p.kunde || '';
  const projekt = p.auftragsInfo?.projektname || '';
  const hoeheM = (mass.h / 1000).toFixed(1);

  const materialCards = k.alle.map(v => {
    const aktiv = v.rollenBreite === rollenBreite;
    return `<button class="btn" style="flex:1;min-width:220px;text-align:left;padding:10px 12px;border-radius:10px;
      border:${aktiv?'2px solid #22c55e':'1px solid var(--line)'};
      background:${aktiv?'#f0fdf4':'#f8fafc'};
      color:${aktiv?'#166534':'#334155'};"
      onclick="setKachelungMaterial('${p.id}','${w.id}',${v.rollenBreite})">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <span style="font-size:14px;font-weight:800;">${v.rollenLabel} Folie</span>
        ${aktiv ? '<span style="margin-left:auto;font-size:12px;font-weight:700;">✓</span>' : ''}
      </div>
      <div style="font-size:12px;line-height:1.35;">
        ${v.anzahlBahnen} Bahnen à ~${v.bahnBreite} mm × ${hoeheM} m<br>
        = ${v.laufmeterGes} m Folie
      </div>
    </button>`;
  }).join('');

  // Bahnen-Liste
  const bahnen = Array.from({length: e.anzahlBahnen}, (_,i) => {
    const nr    = i + 1;
    const name  = bahnName(kunde, projekt, w.name, nr);
    const seite = nr===1 ? ' <span style="color:var(--blue);font-size:10px;">(links)</span>'
                : nr===e.anzahlBahnen ? ' <span style="color:var(--blue);font-size:10px;">(rechts)</span>'
                : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:#fff;
        border:1px solid var(--line);border-radius:6px;font-size:12px;">
      <span style="background:#eff6ff;color:var(--blue);font-weight:700;padding:2px 6px;border-radius:4px;min-width:26px;text-align:center;">${String(nr).padStart(2,'0')}</span>
      <span style="flex:1;font-family:monospace;font-size:11px;color:var(--muted);">${name}</span>
      ${seite}
    </div>`;
  }).join('');

  // ── Vorschau: echtes Seitenverhältnis 1:1 (Breite:Höhe = Wand-Breite:Wand-Höhe) ──
  // Maximaler Rahmen: 280×220px — das längste Maß bestimmt die Seite
  const MAX_SVG_W = 280;
  const MAX_SVG_H = 220;
  const wandRatio = mass.w / mass.h; // > 1 = quer, < 1 = hoch
  let svgW, svgH;
  if (wandRatio >= MAX_SVG_W / MAX_SVG_H) {
    // Wand ist breiter als der Rahmen → Breite = Max, Höhe proportional
    svgW = MAX_SVG_W;
    svgH = Math.round(MAX_SVG_W / wandRatio);
  } else {
    // Wand ist höher → Höhe = Max, Breite proportional
    svgH = MAX_SVG_H;
    svgW = Math.round(MAX_SVG_H * wandRatio);
  }
  svgW = Math.max(60, svgW);
  svgH = Math.max(40, svgH);
  const bahnSvgW = svgW / e.anzahlBahnen;
  const hasPreview = !!(w.dateiPreview);

  // Hintergrund: echtes Motiv (DataURL von PDF.js) oder Platzhalter
  const hintergrund = hasPreview
    ? `<image href="${w.dateiPreview}" x="0" y="0" width="${svgW}" height="${svgH}"
         preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#e2e8f0"/>
       <text x="${svgW/2}" y="${svgH/2}" text-anchor="middle" dominant-baseline="middle"
         font-size="11" fill="#94a3b8">Motiv-Vorschau</text>
       <text x="${svgW/2}" y="${svgH/2+16}" text-anchor="middle"
         font-size="9" fill="#cbd5e1">(PDF hochladen für echte Vorschau)</text>`;

  // Bahnen als halbtransparente Trennlinien — kein farbiges Fill über dem Bild
  const bahnOverlays = Array.from({length: e.anzahlBahnen}, (_,i) => {
    const x  = i * bahnSvgW;
    const nr = String(i+1).padStart(2,'0');
    const isErste  = i === 0;
    const isLetzte = i === e.anzahlBahnen - 1;

    // Trennlinie rechts (nicht bei letzter Bahn)
    const linie = !isLetzte
      ? `<line x1="${(x+bahnSvgW).toFixed(1)}" y1="0" x2="${(x+bahnSvgW).toFixed(1)}" y2="${svgH}"
           stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-dasharray="4,3"/>`
      : '';

    // Halbtransparentes Label-Feld oben in jeder Bahn
    const labelY = 6;
    const labelH = 28;
    return `
      ${linie}
      <rect x="${x.toFixed(1)}" y="${labelY}" width="${bahnSvgW.toFixed(1)}" height="${labelH}"
        fill="rgba(0,0,0,0.45)" rx="2"/>
      <text x="${(x+bahnSvgW/2).toFixed(1)}" y="${labelY+11}" text-anchor="middle"
        font-size="11" font-weight="700" fill="#ffffff">${nr}</text>
      <text x="${(x+bahnSvgW/2).toFixed(1)}" y="${labelY+22}" text-anchor="middle"
        font-size="8" fill="#e2e8f0">~${e.bahnBreite}mm</text>
      ${isErste  ? `<rect x="${x.toFixed(1)}" y="0" width="${bahnSvgW.toFixed(1)}" height="${svgH}" fill="rgba(5,150,105,0.08)" stroke="rgba(5,150,105,0.6)" stroke-width="2"/>` : ''}
      ${isLetzte ? `<rect x="${x.toFixed(1)}" y="0" width="${bahnSvgW.toFixed(1)}" height="${svgH}" fill="rgba(5,150,105,0.08)" stroke="rgba(5,150,105,0.6)" stroke-width="2"/>` : ''}
    `;
  }).join('');

  // Maß-Beschriftung an den Seiten (mm-Angaben)
  const massLabel = `
    <text x="${svgW/2}" y="${svgH-3}" text-anchor="middle"
      font-size="8" fill="rgba(255,255,255,0.75)" font-weight="bold">
      ← ${Math.round(mass.w)} mm →
    </text>`;

  const svgEl = `
    <div style="width:100%;max-width:${svgW}px;">
      <svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}"
        xmlns="http://www.w3.org/2000/svg"
        style="max-width:100%;height:auto;display:block;border:1px solid #93c5fd;border-radius:6px;overflow:hidden;">
        ${hintergrund}
        ${bahnOverlays}
        <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="none" stroke="#3b82f6" stroke-width="2"/>
        <text x="3" y="${svgH-4}" font-size="8" fill="rgba(255,255,255,0.8)" font-weight="bold">← links</text>
        <text x="${svgW-3}" y="${svgH-4}" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.8)" font-weight="bold">rechts →</text>
        ${massLabel}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:3px;padding:0 2px;">
        <span>${Math.round(mass.w)} mm breit</span>
        <span>${Math.round(mass.h)} mm hoch</span>
      </div>
    </div>`;

  return `
    <div style="background:#f0f7ff;border:1px solid #93c5fd;border-left:4px solid var(--blue);
      border-radius:9px;padding:14px 16px;margin-top:8px;">

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <div style="font-size:14px;font-weight:700;">📐 Kachelung & Material</div>
        <span style="font-size:11px;color:var(--muted);">${Math.round(mass.w)} × ${Math.round(mass.h)} mm</span>
        <span style="font-size:11px;color:var(--muted);margin-left:auto;">Vorschlag – finale Kachelung in Caldera</span>
      </div>

      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        ${materialCards}
      </div>

      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        <div>
          ${svgEl}
          <div style="font-size:11px;font-weight:700;color:#1e40af;margin-top:4px;text-align:center;">
            Klebung: Links → Rechts
          </div>
        </div>
        <div style="flex:1;min-width:180px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:5px;">Bahnen (${e.anzahlBahnen})</div>
          <div style="display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto;">
            ${bahnen}
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding-top:10px;border-top:1px solid #bfdbfe;">
        <button class="btn sm primary" onclick="downloadMontagehilfe('${p.id}','${w.id}')">
          📄 Montagehilfe PDF
        </button>
        <span style="font-size:11px;color:var(--muted);">
          ⚠ Kachelung erfolgt final in Caldera. Werte dienen nur als Vorschlag.
        </span>
      </div>
    </div>`;
}

// Montagehilfe via Backend herunterladen
async function downloadMontagehilfe(pid, wid){
  const p = getP(pid), w = getW(p, wid);
  const mass = parseMass(w.bestellmass);
  if(!mass){ toast('Fehler','Kein Bestellmaß eingetragen'); return; }
  const k = berechneKachelung(mass.w, mass.h);
  if(!k){ toast('Fehler','Kachelung konnte nicht berechnet werden'); return; }
  const rollenBreite = k.alle.some(v => v.rollenBreite === w.kachelungRollenBreite)
    ? w.kachelungRollenBreite
    : k.empfohlen.rollenBreite;
  const selected = k.alle.find(v => v.rollenBreite === rollenBreite) || k.empfohlen;

  try {
    const res = await fetch(`${CALDERA_SERVER}/montagehilfe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kunde:        p.auftragsInfo?.kunde || p.kunde || '',
        projekt:      p.auftragsInfo?.projektname || '',
        motiv:        w.name,
        gesamtBreite: mass.w,
        gesamtHoehe:  mass.h,
        kachelung:    selected,
      }),
    });

    if(!res.ok){ const e = await res.json(); throw new Error(e.fehler || 'Server-Fehler'); }

    // PDF als Download anbieten
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Montagehilfe_${w.name.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast('📄 Montagehilfe',`${w.name} – PDF heruntergeladen`,'tg');

  } catch(err){
    // Fallback wenn Server nicht läuft: HTML-Druckansicht öffnen
    toast('Server offline','Montagehilfe als Druckansicht geöffnet (Fallback)','ty');
    oeffneMontagehilfeDruck(p, w, k);
  }
}

// Fallback: Druckansicht im Browser wenn Backend nicht verfügbar
function oeffneMontagehilfeDruck(p, w, k){
  const rollenBreite = k.alle.some(v => v.rollenBreite === w.kachelungRollenBreite)
    ? w.kachelungRollenBreite
    : k.empfohlen.rollenBreite;
  const e    = k.alle.find(v => v.rollenBreite === rollenBreite) || k.empfohlen;
  const mass = parseMass(w.bestellmass);
  const svgW = 500, svgH = Math.round(svgW * mass.h / mass.w);
  const bw   = svgW / e.anzahlBahnen;
  const hasPreview = !!(w.dateiPreview);

  // Motiv als Hintergrund — DataURL direkt eingebettet
  const hintergrund = hasPreview
    ? `<image href="${w.dateiPreview}" x="0" y="0" width="${svgW}" height="${svgH}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#e2e8f0"/>
       <text x="${svgW/2}" y="${svgH/2}" text-anchor="middle" font-size="14" fill="#94a3b8">Motiv-Vorschau</text>`;

  const bahnenSvg = Array.from({length:e.anzahlBahnen},(_,i)=>{
    const x=i*bw, nr=String(i+1).padStart(2,'0');
    const isErste  = i === 0;
    const isLetzte = i === e.anzahlBahnen - 1;
    const linie = !isLetzte ? `<line x1="${(x+bw).toFixed(1)}" y1="0" x2="${(x+bw).toFixed(1)}" y2="${svgH}" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-dasharray="6,4"/>` : '';
    return `${linie}
      <rect x="${x.toFixed(1)}" y="4" width="${bw.toFixed(1)}" height="30" fill="rgba(0,0,0,0.5)" rx="2"/>
      <text x="${(x+bw/2).toFixed(1)}" y="16" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${nr}</text>
      <text x="${(x+bw/2).toFixed(1)}" y="28" text-anchor="middle" font-size="9" fill="#ddd">~${e.bahnBreite}mm</text>
      ${isErste  ? `<text x="${x+4}" y="${svgH-6}" font-size="9" fill="rgba(255,255,255,0.9)">← LINKS</text>` : ''}
      ${isLetzte ? `<text x="${(x+bw-4).toFixed(1)}" y="${svgH-6}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.9)">RECHTS →</text>` : ''}`;
  }).join('');

  const bahnListe = Array.from({length:e.anzahlBahnen},(_,i)=>{
    const nr=String(i+1).padStart(2,'0');
    const name=bahnName(p.auftragsInfo?.kunde||p.kunde||'',p.auftragsInfo?.projektname||'',w.name,i+1);
    const seite = i===0?' (links)':i===e.anzahlBahnen-1?' (rechts)':'';
    return `<tr><td style="padding:4px 8px;font-weight:700;color:#1e40af;width:40px;">${nr}</td><td style="padding:4px 8px;font-family:monospace;font-size:11px;">${name}${seite}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Montagehilfe – ${w.name}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;max-width:720px;margin:0 auto;color:#1e293b;}
      h1{font-size:20px;margin:0 0 2px;}
      h2{font-size:13px;color:#64748b;font-weight:normal;margin:0 0 16px;}
      table{border-collapse:collapse;width:100%;margin-bottom:14px;}
      td,th{padding:6px 10px;border:1px solid #e2e8f0;font-size:13px;}
      th{background:#f8fafc;font-weight:600;text-align:left;}
      svg{width:100%;height:auto;display:block;border:2px solid #3b82f6;border-radius:4px;margin-bottom:8px;}
      .bahn-table{width:100%;border-collapse:collapse;margin-top:10px;}
      .bahn-table td{padding:3px 8px;border:1px solid #e2e8f0;font-size:12px;}
      .klebung{font-size:12px;color:#475569;margin-bottom:10px;font-weight:600;}
      .warnung{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;font-size:11px;margin-top:12px;color:#92400e;}
      @media print{.no-print{display:none}body{padding:10px}}
    </style>
  </head><body>
    <button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">🖨 Drucken</button>
    <h1>Montagehilfe – ${w.name}</h1>
    <h2>${p.auftragsInfo?.kunde||p.kunde||''} · ${p.auftragsInfo?.projektname||p.name||''}</h2>
    <table>
      <tr><th>Maß gesamt</th><td><strong>${Math.round(mass.w)} × ${Math.round(mass.h)} mm</strong></td><th>Folie</th><td>${e.rollenLabel}</td></tr>
      <tr><th>Anzahl Bahnen</th><td>${e.anzahlBahnen}</td><th>Bahnbreite (ca.)</th><td>~${e.bahnBreite} mm</td></tr>
      <tr><th>Überlappung</th><td>${e.ueberlappung} mm</td><th>Material</th><td><strong>${e.laufmeterStr}</strong></td></tr>
    </table>
    <div class="klebung">📌 Klebung: Links → Rechts &nbsp;·&nbsp; ↑ OBEN beachten</div>
    <svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
      ${hintergrund}
      ${bahnenSvg}
      <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="none" stroke="#1e40af" stroke-width="2"/>
    </svg>
    <table class="bahn-table">
      <thead><tr style="background:#f8fafc;"><th style="width:40px;">Bahn</th><th>Dateiname</th></tr></thead>
      <tbody>${bahnListe}</tbody>
    </table>
    <div class="warnung">⚠ Kachelung erfolgt final in Caldera. Darstellung dient nur zur Orientierung.</div>
  </body></html>`;

  const win = window.open('','_blank','width=760,height=900');
  win.document.write(html);
  win.document.close();
}

window.renderWandCard = renderWandCard;
window.dateiGeliefertUI = dateiGeliefertUI;
window.setKachelungMaterial = setKachelungMaterial;
window.freigebenDateiUI = freigebenDateiUI;
window.sendeDateiAnCalderaUI = sendeDateiAnCalderaUI;
window.setDateiWirdGedrucktUI = setDateiWirdGedrucktUI;
window.adminResetDruckStatusUI = adminResetDruckStatusUI;
