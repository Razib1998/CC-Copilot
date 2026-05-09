// ════════════════════════════════════════════════════════════════════
// CC INTERN — Anfragen / Schnellanfragen
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/anfragen-view.js
// Enthält:  renderAnfragen, anfNeuModal, anfCalcUndRender, anfSenden
//
// TODO [Cockpit]: renderAnfragen() → API GET /inquiries (Endpunkt noch nicht gebaut)
// TODO [Cockpit]: anfSpeichern() → API POST /inquiries
// ════════════════════════════════════════════════════════════════════

function anfModalClose(){ document.getElementById('anfModal').classList.remove('open'); }

function anfNeuModal(){
  anfAktivId=null;
  ANF_AKTIV_VORLAGE=null;
  anfParams={
    leistung:'fahrzeug', b:0, h:0, stueck:1,
    grafik_std:1, montage_std:null, aufwand:'einfach', liefertage:5,
    mit_reinigung:false, mit_vorbereitung:false, anfahrt:'zone1',
    mit_demontage:'', mit_altfolie:false, mit_plot:false, mit_daten:false,
    mat_reflex:false, mat_lochfolie:false,
    mit_laminat:true, laminat_fix:false,
    hoehe:'', rabatt:0,
  };
  anfInitLeistungButtons(); // aus CC_LEISTUNGEN befüllen
  anfResetForm();
  anfInitVorlagen();
  anfSelLeistung('fahrzeug','🚗 PKW / Fahrzeug');
  anfSelFzgGroesse('pkw-mittel');
  anfSelAufwand('einfach');
  anfSelLieferzeit(5);
  anfSelAnfahrt('zone1');
  anfCalcUndRender();
  document.getElementById('anfModal').classList.add('open');
}

function anfInitLeistungButtons(){
  var container = document.getElementById('anf-leistung-btns');
  if(!container || container.children.length > 0) return; // nur einmal
  CC_LEISTUNGEN.forEach(function(l){
    var lbl = document.createElement('label');
    lbl.id = 'anfl-'+l.id;
    lbl.style.cssText='padding:9px 14px;border-radius:9px;border:2px solid var(--border);background:#fff;cursor:pointer;text-align:center;';
    lbl.innerHTML='<input type="radio" name="anf-leistung" style="display:none;">'
      +'<span style="font-size:16px;">'+l.ico+'</span> '
      +'<span style="font-size:12px;font-weight:600;color:var(--text2);">'+l.label.split('/')[0].trim()+'</span>';
    lbl.onclick = (function(lid, llabel){ return function(){ anfSelLeistung(lid, llabel); }; })(l.id, l.ico+' '+l.label);
    container.appendChild(lbl);
  });
}

function anfResetForm(){
  ['anf-kunde','anf-kontakt','anf-beschr','anf-notiz'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('anf-b').value='';
  document.getElementById('anf-h').value='';
  document.getElementById('anf-stueck').value='1';
  document.getElementById('anf-rabatt-inp').value='0';
  // Materialoptionen zurücksetzen
  ['anf-cb-reflex','anf-cb-lochfolie'].forEach(function(id){
    var cb=document.getElementById(id); if(cb) cb.checked=false;
  });
  var cbLam=document.getElementById('anf-cb-laminat');
  if(cbLam){ cbLam.checked=true; cbLam.disabled=false; cbLam.parentElement.style.opacity='1'; }
  var lh=document.getElementById('anf-laminat-hinweis');
  if(lh) lh.style.display='none';
  [1,2,3,4,5].forEach(n=>{
    const b=document.getElementById('anfac-body-'+n);
    const a=document.getElementById('anfac-arrow-'+n);
    if(n===1){ b&&b.classList.remove('ac-closed'); a&&a.classList.add('open'); }
    else { b&&b.classList.add('ac-closed'); a&&a.classList.remove('open'); }
  });
}

function anfInitVorlagen(){
  const grid=document.getElementById('anf-vorlagen-grid'); if(!grid) return;
  grid.innerHTML=ANF_VORLAGEN.map((v,i)=>{
    const isActive = i === ANF_AKTIV_VORLAGE;
    return `<button type="button" id="anf-vorl-btn-${i}" onclick="anfLadeVorlage(${i})"
      style="padding:9px 7px;border-radius:9px;border:1.5px solid ${isActive?'var(--green)':'var(--border)'};background:${isActive?'var(--green-l)':'#fff'};cursor:pointer;text-align:center;transition:all .12s;"
      onmouseover="if(${i}!==ANF_AKTIV_VORLAGE){this.style.borderColor='var(--green)';this.style.background='var(--green-l)';}"
                +'onmouseout="this.style.borderColor=\'#DDE3E8\'">' 
      <div style="font-size:18px;margin-bottom:3px;">${v.ico}</div>
      <div style="font-size:11px;font-weight:${isActive?'700':'600'};line-height:1.2;color:${isActive?'var(--green)':'inherit'};">${v.name}</div>
    </button>`;
  }).join('');
}

function anfLadeVorlage(idx){
  const v=ANF_VORLAGEN[idx]; if(!v) return;
  ANF_AKTIV_VORLAGE = idx;
  anfInitVorlagen(); // Grid neu rendern → aktive Vorlage markiert
  // Maße skalieren je Fahrzeuggröße (nur Fahrzeug-Vorlagen)
  const scaled = anfMaesseSkalieren(v);
  document.getElementById('anf-b').value=scaled.b;
  document.getElementById('anf-h').value=scaled.h;
  document.getElementById('anf-stueck').value=v.stueck||1;
  document.getElementById('anf-beschr').value=v.beschr||'';
  anfParams.b=scaled.b; anfParams.h=scaled.h; anfParams.stueck=v.stueck||1;
  anfParams.mindest_override = (v.mindest_override !== undefined) ? v.mindest_override : null;
  anfParams.material      = v.material     || null;
  anfParams.laminat       = v.laminat      || null;
  anfParams.ohne_druck    = v.ohne_druck   || false;
  anfParams.zuschlag_pct  = v.zuschlag_pct || 0;
  anfParams.datei_hinweis = v.datei_hinweis || false;
  anfParams.laminat_fix   = v.laminat_fix  || false;
  // Laminat: bei Digitaldruck standardmäßig an, bei Plot immer aus
  anfParams.mit_laminat   = v.ohne_druck ? false : true;
  // Checkbox aktualisieren
  const cbLam = document.getElementById('anf-cb-laminat');
  if(cbLam){
    cbLam.checked   = anfParams.mit_laminat;
    cbLam.disabled  = anfParams.laminat_fix || v.ohne_druck;
    cbLam.parentElement.style.opacity = (anfParams.laminat_fix || v.ohne_druck) ? '0.45' : '1';
  }
  const lamHinweis = document.getElementById('anf-laminat-hinweis');
  if(lamHinweis) lamHinweis.style.display = 'none';
  // Grafik-Stunden aus Vorlage (alt: grafik-Stufe → Stunden mappen)
  const grafikStdMap={einfach:1, mittel:2, komplex:4};
  const gStd = v.grafik_std || grafikStdMap[v.grafik||'einfach'] || 1;
  anfParams.grafik_std = gStd;
  const gStdEl = document.getElementById('anf-grafik-std');
  if(gStdEl) gStdEl.value = gStd;
  anfParams.montage_std = v.montage_std || null;
  const mStdEl = document.getElementById('anf-montage-std');
  if(mStdEl) mStdEl.value = v.montage_std || '';
  anfParams.mit_reinigung=v.mit_reinigung||false;
  anfParams.mit_vorbereitung=v.mit_vorbereitung||false;
  if(v.mit_reinigung){ const cb=document.getElementById('anf-cb-reinigung'); if(cb) cb.checked=true; }
  anfSelLeistung(v.leistung,'');
  anfSelAufwand(v.aufwand||'einfach');
  anfSelLieferzeit(v.liefertage||5);
  anfSelAnfahrt(v.anfahrt||'zone1');
  // Sektionen 2, 3, 4, 5 öffnen — damit Maße, Kalkulation und Preis sofort sichtbar
  [2,3,4,5].forEach(n=>{
    const b=document.getElementById('anfac-body-'+n);
    const a=document.getElementById('anfac-arrow-'+n);
    b&&b.classList.remove('ac-closed'); a&&a.classList.add('open');
  });
  anfCalcUndRender();
  const cfg = ANF_FZG_CONFIG[ANF_FZG_GROESSE]||ANF_FZG_CONFIG['pkw-mittel'];
  showToast('✓ '+v.name+' · '+scaled.b+'×'+scaled.h+'m ('+cfg.label+')');
}

function anfMaesseSkalieren(v){
  if(!v || v.leistung !== 'fahrzeug') return { b:v.b, h:v.h };
  const cfg = ANF_FZG_CONFIG[ANF_FZG_GROESSE] || ANF_FZG_CONFIG['pkw-mittel'];
  return {
    b: Math.round(v.b * cfg.bFaktor * 100) / 100,
    h: Math.round(v.h * cfg.hFaktor * 100) / 100,
  };
}

function anfSelFzgGroesse(key){
  ANF_FZG_GROESSE = key;
  // Button-Styles aktualisieren
  document.querySelectorAll('#anf-fzg-btns button').forEach(function(b){
    var isActive = b.id === 'anf-fzg-'+key;
    b.style.borderColor  = isActive ? 'var(--blue)'   : 'var(--border)';
    b.style.background   = isActive ? 'var(--blue-l)' : '#fff';
    b.style.color        = isActive ? 'var(--blue)'   : '';
    b.style.fontWeight   = isActive ? '700'           : '400';
  });
  // Wenn Vorlage aktiv → Maße sofort neu skalieren
  if(ANF_AKTIV_VORLAGE !== null){
    const v = ANF_VORLAGEN[ANF_AKTIV_VORLAGE];
    if(v && v.leistung === 'fahrzeug'){
      const scaled = anfMaesseSkalieren(v);
      document.getElementById('anf-b').value = scaled.b;
      document.getElementById('anf-h').value = scaled.h;
      anfParams.b = scaled.b;
      anfParams.h = scaled.h;
    }
  }
  anfCalcUndRender();
}

function anfFzgGroesseBlock(leistung){
  var block = document.getElementById('anf-fzg-groesse-block');
  if(block) block.style.display = (leistung === 'fahrzeug') ? '' : 'none';
}

function anfSelLeistung(key,label){
  anfParams.leistung=key;
  document.querySelectorAll('[id^="anfl-"]').forEach(el=>{
    el.style.borderColor='var(--border)'; el.style.background='#fff';
    const d=el.querySelector('div:last-child'); if(d) d.style.color='var(--text2)';
  });
  const sel=document.getElementById('anfl-'+key);
  if(sel){ sel.style.borderColor='var(--green)'; sel.style.background='var(--green-l)';
    const d=sel.querySelector('div:last-child'); if(d) d.style.color='var(--green)'; }
  if(label) { const s=document.getElementById('anfac-sub-2'); if(s) s.textContent=label; }
  // Fahrzeuggröße-Block ein/ausblenden
  anfFzgGroesseBlock(key);
  // Material-Empfehlung
  const emp=MAT_EMPFEHLUNG[key];
  const mv=document.getElementById('anf-mat-vorschlag');
  const mt=document.getElementById('anf-mat-vorschlag-text');
  if(mv&&mt&&emp){ mv.style.display='block';
    mt.textContent=emp.material+(emp.laminat&&emp.laminat!=='ohne Laminat'?' + '+emp.laminat:'')+' — '+emp.hinweis; }
  anfCalcUndRender();
}

function anfSelGrafik(stufe){
  // Nur noch Stunden aus Staffel setzen wenn kein manueller Wert
  const stdMap={einfach:1, mittel:2, komplex:4};
  const std = stdMap[stufe] || 1;
  anfParams.grafik_std = std;
  const el = document.getElementById('anf-grafik-std');
  if(el && el.value==='') el.value = std;
  anfCalcUndRender();
}

function anfSelAufwand(a){
  anfParams.aufwand=a;
  const styles={ einfach:{b:'var(--green)',bg:'var(--green-l)',c:'var(--green)'},
    mittel:{b:'var(--amber)',bg:'var(--amber-l)',c:'var(--amber)'},
    schwer:{b:'var(--red)',bg:'#FEECEC',c:'var(--red)'} };
  ['einfach','mittel','schwer'].forEach(v=>{
    const el=document.getElementById('anf-aufwand-'+v); if(!el) return;
    const on=v===a;
    el.style.borderColor=on?styles[v].b:'var(--border)';
    el.style.background=on?styles[v].bg:'#fff';
    el.style.color=on?styles[v].c:'var(--text2)';
    el.style.fontWeight=on?'700':'400';
  });
  anfCalcUndRender();
}

function anfSelLieferzeit(tage){
  anfParams.liefertage=tage;
  document.querySelectorAll('#anf-liefer-btns button').forEach(b=>{
    b.style.borderColor='var(--border)'; b.style.background='#fff';
    b.style.color='var(--text2)'; b.style.fontWeight='400';
  });
  const el=document.getElementById('anf-lief-'+tage);
  if(el){ el.style.borderColor='var(--green)'; el.style.background='var(--green-l)';
    el.style.color='var(--green)'; el.style.fontWeight='700'; }
  anfCalcUndRender();
}

function anfSelAnfahrt(zone){
  anfParams.anfahrt=zone;
  document.querySelectorAll('[id^="anf-anfahrt-"]').forEach(b=>{
    b.style.borderColor='var(--border)'; b.style.background='#fff';
    b.style.color='var(--text2)'; b.style.fontWeight='400';
  });
  const el=document.getElementById('anf-anfahrt-'+zone);
  if(el){ el.style.borderColor='var(--blue)'; el.style.background='var(--blue-l)';
    el.style.color='var(--blue)'; el.style.fontWeight='600'; }
  anfCalcUndRender();
}

function anfToggle(key, val){
  anfParams[key]=val;
  anfCalcUndRender();
}

function anfToggleLaminat(cb){
  if(anfParams.laminat_fix){ cb.checked=true; return; } // Vollfolierung: nicht abschaltbar
  anfParams.mit_laminat = cb.checked;
  const hinweis = document.getElementById('anf-laminat-hinweis');
  if(hinweis) hinweis.style.display = cb.checked ? 'none' : 'block';
  anfCalcUndRender();
}

function anfToggleDemontage(sel){ anfParams.mit_demontage=sel.value; anfCalcUndRender(); }

function anfToggleHoehe(sel){ anfParams.hoehe=sel.value; anfCalcUndRender(); }

function anfCalcUndRender(){
  anfParams.b        = parseFloat(document.getElementById('anf-b')?.value||0);
  anfParams.h        = parseFloat(document.getElementById('anf-h')?.value||0);
  anfParams.stueck   = parseInt(document.getElementById('anf-stueck')?.value||1);
  anfParams.rabatt   = parseInt(document.getElementById('anf-rabatt-inp')?.value||0);
  anfParams.grafik_std  = parseFloat(document.getElementById('anf-grafik-std')?.value||1);
  const mStdEl = document.getElementById('anf-montage-std');
  anfParams.montage_std = mStdEl && mStdEl.value!=='' ? parseFloat(mStdEl.value) : null;

  const r = berechneAngebot(anfParams);
  const fmt = v => '€ '+v.toFixed(2);
  const zel = id => document.getElementById(id);

  // ── Flächen-Info ──
  const fi=zel('anf-flaeche-info');
  if(fi){
    if(r.flaeche>0){
      fi.style.display='block';
      fi.textContent=anfParams.b+'m × '+anfParams.h+'m × '+anfParams.stueck+' Stk = '
        +r.flaeche.toFixed(2)+' m²'+(r.flaeche<2?' ⚠ Kleinfläche (+20% Aufschlag)':'');
    } else {
      fi.style.display='none';
    }
  }

  // ── Gruppenfarben ──
  const gf = {
    material:'var(--blue)',laminat:'var(--teal)',druck:'var(--blue)',
    grafik:'var(--purple)',montage:'var(--amber)',demontage:'var(--red)',
    reinigung:'var(--teal)',anfahrt:'var(--gray)',produktion:'var(--teal)',
    hoehe:'var(--amber)',express:'var(--red)',aufschlag:'var(--gray)',
    mindest:'var(--amber)',
  };

  function renderItems(items){
    return items.map(item=>`
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:.5px solid var(--border);">
        <div>
          <span style="font-size:12px;">${item.label}</span>
          ${item.detail?'<div style="font-size:10px;color:var(--text3);">'+item.detail+'</div>':''}
        </div>
        <span style="font-size:13px;font-weight:600;color:${gf[item.gruppe]||'var(--text)'};">${fmt(item.preis)}</span>
      </div>`).join('');
  }

  function sectionHdr(label, summe, col){
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0 4px;margin-top:8px;">
      <span style="font-size:10px;font-weight:700;color:${col};text-transform:uppercase;letter-spacing:.07em;">${label}</span>
      <span style="font-size:12px;font-weight:700;color:${col};">${fmt(summe)}</span>
    </div>`;
  }

  // ── Kalkulations-Tabelle: 3 Sektionen ──
  const kr = zel('anf-kalk-rows');
  if(kr){
    const basisItems    = r.items.filter(i=>i.typ==='basis');
    const optionItems   = r.items.filter(i=>i.typ==='option');
    const zuschlagItems = r.items.filter(i=>i.typ==='zuschlag');

    let html = '';

    // Basispreis
    if(basisItems.length){
      html += sectionHdr('Basispreis', r.summeBasis, 'var(--blue)');
      html += renderItems(basisItems);
    }

    // Optionen & Zuschläge (immer sichtbar)
    html += sectionHdr('Optionen & Leistungen', r.summeOptionen, 'var(--purple)');
    html += renderItems(optionItems);

    // Zuschläge
    if(zuschlagItems.length){
      html += sectionHdr('Zuschläge', r.summeZuschlaege, 'var(--amber)');
      html += renderItems(zuschlagItems);
    }

    // Trennlinie + Summe
    html += `<div style="border-top:2px solid var(--border);margin-top:8px;padding-top:8px;">`;
    if(r.rabattWert > 0)
      html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--green);">
        <span>Rabatt ${(r.effRabatt*100).toFixed(0)}%</span><span>− ${fmt(r.rabattWert)}</span></div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;">
      <span style="font-size:13px;font-weight:700;">Netto gesamt</span>
      <span style="font-size:15px;font-weight:800;color:var(--green);">${fmt(r.summeNetto)}</span></div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:11px;color:var(--text2);">
      <span>zzgl. 19% MwSt.</span><span>${fmt(r.mwst)}</span></div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;background:var(--blue-l);border-radius:6px;padding:6px 8px;margin-top:4px;">
      <span style="font-size:13px;font-weight:700;color:var(--blue);">Brutto</span>
      <span style="font-size:16px;font-weight:800;color:var(--blue);">${fmt(r.brutto)}</span></div>`;
    html += `</div>`;

    // ── Margen-Anzeige ──
    const gewinnFarbe = r.gewinnPct >= 40 ? 'var(--green)' : r.gewinnPct >= 20 ? 'var(--amber)' : 'var(--red)';
    html += `<div style="margin-top:10px;padding:12px;background:#0A1929;border-radius:8px;">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">Margenübersicht</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div style="background:rgba(255,255,255,.05);border-radius:6px;padding:8px;">
          <div style="font-size:10px;color:rgba(255,255,255,.4);">Gesamtkosten (gesch.)</div>
          <div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.7);">${fmt(r.gesamtkosten)}</div>
        </div>
        <div style="background:rgba(255,255,255,.05);border-radius:6px;padding:8px;">
          <div style="font-size:10px;color:rgba(255,255,255,.4);">Verkaufspreis (Netto)</div>
          <div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.85);">${fmt(r.summeNetto)}</div>
        </div>
        <div style="background:rgba(255,255,255,.05);border-radius:6px;padding:8px;">
          <div style="font-size:10px;color:rgba(255,255,255,.4);">Gewinn</div>
          <div style="font-size:14px;font-weight:700;color:${gewinnFarbe};">${fmt(r.gewinnEuro)}</div>
        </div>
        <div style="background:rgba(255,255,255,.08);border-radius:6px;padding:8px;border:1px solid ${gewinnFarbe}40;">
          <div style="font-size:10px;color:rgba(255,255,255,.4);">Marge</div>
          <div style="font-size:18px;font-weight:800;color:${gewinnFarbe};">${r.gewinnPct} %</div>
        </div>
      </div>
    </div>`;

    kr.innerHTML = html;
  }

  // ── Summen ──
  if(zel('anf-netto-display'))  zel('anf-netto-display').textContent=fmt(r.summeNetto);
  if(zel('anf-mwst-display'))   zel('anf-mwst-display').textContent=fmt(r.mwst);
  if(zel('anf-brutto-display')) zel('anf-brutto-display').textContent=fmt(r.brutto);
  if(zel('anfac-sub-5'))        zel('anfac-sub-5').textContent='Netto '+fmt(r.summeNetto)+' · Brutto '+fmt(r.brutto);

  // ── Grafik-Preis-Hint ──
  const gHint = zel('anf-grafik-preis-hint');
  if(gHint){ const gStd=parseFloat(zel('anf-grafik-std')?.value||1); gHint.textContent=fmt(gStd*KALK.grafik.std_pro_h); }

  // ── Rabatt-Warnung ──
  const rw=zel('anf-rabatt-warn');
  if(rw){
    if(r.rabattFreigabe){ rw.style.display='block'; rw.textContent='⚠ Rabatt über 10% — Freigabe durch Celal erforderlich!'; }
    else rw.style.display='none';
  }

  // ── Banner ──
  if(zel('anf-banner-netto'))   zel('anf-banner-netto').textContent=fmt(r.summeNetto);
  if(zel('anf-banner-brutto'))  zel('anf-banner-brutto').textContent=fmt(r.brutto);
  if(zel('anf-banner-mindest')) zel('anf-banner-mindest').textContent='Min. € '+r.mindest;
}

function anfFileSet(inp,slotId,nameId){
  const slot=document.getElementById(slotId);
  const nameEl=document.getElementById(nameId);
  if(inp.files.length&&slot&&nameEl){
    slot.style.borderColor='var(--green)'; slot.style.borderStyle='solid';
    nameEl.textContent='✓ '+inp.files[0].name.substring(0,28);
  }
}

function anfUpdateSub(){
  const k=document.getElementById('anf-kunde')?.value||'';
  if(k){ const s=document.getElementById('anfac-sub-2'); if(s) s.textContent=k; }
}

function anfAcToggle(n){
  const body=document.getElementById('anfac-body-'+n);
  const arrow=document.getElementById('anfac-arrow-'+n);
  if(!body||!arrow) return;
  const closed=body.classList.contains('ac-closed');
  body.classList.toggle('ac-closed',!closed);
  arrow.classList.toggle('open',closed);
}

function anfSenden(kanal){
  const kunde=document.getElementById('anf-kunde')?.value?.trim()||'Kunde';
  const kontakt=document.getElementById('anf-kontakt')?.value?.trim()||'';
  const r=berechneAngebot(anfParams);
  const beschr=document.getElementById('anf-beschr')?.value||anfParams.leistung;
  const hinweisZeile = anfParams.datei_hinweis
    ? '\nHinweis: Fertige Dateiübernahme – kein Entwurf enthalten.\n' : '\n';
  const text='Angebot CC Werbung GmbH\n\nFür: '+kunde+'\nLeistung: '+beschr+'\nFläche: '+r.flaeche.toFixed(2)+' m²\nLieferzeit: '+anfParams.liefertage+' Werktage'
    +hinweisZeile
    +'\nNetto: € '+r.summeNetto.toFixed(2)+'\nBrutto (inkl. 19% MwSt.): € '+r.brutto.toFixed(2)+'\n\n'
    +'Angebot ansehen:\nhttps://cc-werbung.de/angebot/[ID]\n\nCC Werbung GmbH';
  if(kanal==='whatsapp'){
    const tel=kontakt.replace(/\D/g,'');
    window.open('https://wa.me/'+(tel||'')+'?text='+encodeURIComponent(text),'_blank');
    showToast('💬 WhatsApp geöffnet');
  } else {
    window.open('mailto:'+kontakt+'?subject='+encodeURIComponent('Angebot CC Werbung – '+beschr)+'&body='+encodeURIComponent(text),'_blank');
    showToast('📤 E-Mail geöffnet');
  }
}

function anfSpeichernEntwurf(){ showToast('💾 Entwurf gespeichert'); anfModalClose(); }

function anfSpeichern(){
  const kunde  = document.getElementById('anf-kunde')?.value?.trim();
  const kontakt= document.getElementById('anf-kontakt')?.value?.trim()||'';
  if(!kunde){ showToast('⚠ Bitte Kundenname eingeben'); return; }

  const r=berechneAngebot(anfParams);
  const leistungLabels={fahrzeug:'🚗 PKW / Fahrzeug',fenster:'🪟 Fenster',schild:'📋 Schild',druck:'🖨️ Druck',aufkleber:'🏷 Aufkleber',sonstiges:'⭐ Sonstiges'};
  const id='ANF-2026-00'+anfNr++;

  ANF_DATEN.unshift({
    id, kunde, kontakt,
    kanal:   anfParams.kanal||'Telefon',
    leistung:anfParams.leistung,
    leistungLabel:leistungLabels[anfParams.leistung]||anfParams.leistung,
    beschr:  document.getElementById('anf-beschr')?.value||'',
    params:  {...anfParams},
    notiz:   document.getElementById('anf-notiz')?.value||'',
    // netto/brutto werden NICHT gespeichert — immer live aus berechneAngebot(params)
    status:'offen',
    erstellt:new Date().toLocaleDateString('de-DE'),
  });

  // ── Kunde automatisch ins CRM aufnehmen (falls noch nicht vorhanden) ──
  var crmNeuAngelegt = false;
  var crmKey = kunde.split(' ')[0]; // Kurzschlüssel = erster Teil des Namens
  // Eindeutigkeit sicherstellen: falls Key schon belegt, Suffix anhängen
  if(CRM_KUNDEN[crmKey] && CRM_KUNDEN[crmKey].name.toLowerCase() !== kunde.toLowerCase()){
    crmKey = crmKey + '_' + anfNr;
  }
  // Nur anlegen wenn kein Eintrag mit exakt diesem Namen existiert
  var existiert = Object.values(CRM_KUNDEN).some(function(k){
    return k.name.toLowerCase() === kunde.toLowerCase();
  });
  if(!existiert){
    var isMail  = kontakt.includes('@');
    var isTel   = !isMail && kontakt.length > 0;
    CRM_KUNDEN[crmKey] = {
      name:            kunde,
      ap:              '—',
      apFunktion:      '—',
      tel:             isTel  ? kontakt : '—',
      mail:            isMail ? kontakt : '—',
      adresse:         '—', plz:'—', stadt:'—',
      branche:         'Neu',
      umsatz:          '—',
      auftragsvolumen: 0,
      fahrzeuge:       0,
      status:          'Angebot',
      letzterKontakt:  new Date().toLocaleDateString('de-DE'),
      naechsteAktion:  'Angebot '+id+' nachfassen',
      notiz:           'Über Schnell-Angebot '+id+' angelegt. Leistung: '+(leistungLabels[anfParams.leistung]||anfParams.leistung),
    };
    crmNeuAngelegt = true;
  }

  anfModalClose();
  renderAnfragen();
  anfOpenDetail(id);

  var msg = '✓ '+id+' · '+kunde+' · € '+r.summeNetto.toFixed(0);
  if(crmNeuAngelegt) msg += ' · Kunde im CRM angelegt';
  showToast(msg);
}

function renderAnfragen(){
  const el=document.getElementById('anf-liste'); if(!el) return;
  const offen=ANF_DATEN.filter(a=>a.status==='offen').length;
  const ang=ANF_DATEN.filter(a=>a.status==='angebot').length;
  const gew=ANF_DATEN.filter(a=>a.status==='gewonnen').length;
  const so=document.getElementById('anf-stat-offen');if(so)so.textContent=offen;
  const sa=document.getElementById('anf-stat-angebot');if(sa)sa.textContent=ang;
  const sg=document.getElementById('anf-stat-gewonnen');if(sg)sg.textContent=gew;
  const stCol={offen:'var(--amber)',angebot:'var(--blue)',gewonnen:'var(--green)',abgelehnt:'var(--red)'};
  const stLbl={offen:'Offen',angebot:'Angebot',gewonnen:'Gewonnen ✓',abgelehnt:'Abgelehnt'};
  el.innerHTML=ANF_DATEN.map(a=>{
    const col=stCol[a.status]||'var(--gray)'; const lbl=stLbl[a.status]||a.status;
    const isActive=anfAktivId===a.id;
    // Preis immer live aus Kalkulation — niemals aus gespeichertem Wert
    const r=a.params ? berechneAngebot(a.params) : null;
    const nettoAnz = r ? '€ '+r.summeNetto.toFixed(0) : '—';
    return '<div onclick="anfOpenDetail(\''+a.id+'\')" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;background:'+(isActive?'var(--green-l)':'#fff')+';transition:background .1s;">'
      +'<div style="width:36px;height:36px;border-radius:9px;background:'+(isActive?'var(--green)':'var(--green-l)')+';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">'+a.leistungLabel.split(' ')[0]+'</div>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:11px;font-weight:700;color:var(--text3);">'+a.id+' · '+a.erstellt+'</div>'
        +'<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+a.kunde+'</div>'
        +'<div style="font-size:11px;color:var(--text2);">'+a.leistungLabel+(a.params&&a.params.b?' · '+a.params.b+'×'+a.params.h+'m':'')+'</div>'
      +'</div>'
      +'<div style="text-align:right;flex-shrink:0;">'
        +'<div style="font-size:14px;font-weight:700;color:var(--green);">'+nettoAnz+'</div>'
        +'<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:'+col+'20;color:'+col+';font-weight:600;">'+lbl+'</span>'
      +'</div>'
    +'</div>';
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--text3);">Noch keine Anfragen</div>';
}

function anfOpenDetail(id){
  anfAktivId=id;
  const a=ANF_DATEN.find(x=>x.id===id); if(!a) return;
  renderAnfragen();
  const body=document.getElementById('anf-detail-body');
  const badge=document.getElementById('anf-gen-badge');
  if(!body) return;
  const stCol={offen:'var(--amber)',angebot:'var(--blue)',gewonnen:'var(--green)',abgelehnt:'var(--red)'};
  const stLbl={offen:'Offen',angebot:'Angebot erstellt',gewonnen:'Gewonnen ✓',abgelehnt:'Abgelehnt'};
  const col=stCol[a.status]||'var(--gray)';
  if(badge){ badge.style.display='block';
    badge.innerHTML='<span class="bdg" style="background:'+col+'20;color:'+col+';">'+stLbl[a.status]+'</span>'; }

  // Preis immer live aus Kalkulation — kein Fallback auf gespeicherten Wert
  const r=a.params ? berechneAngebot(a.params) : {items:[],summeNetto:0,mwst:0,brutto:0,flaeche:0};

  body.innerHTML=
    '<div style="padding:14px 16px;background:var(--gray-l);border-bottom:1px solid var(--border);">'
    +'<div style="font-size:20px;font-weight:700;margin-bottom:2px;">'+a.kunde+'</div>'
    +'<div style="font-size:13px;color:var(--text2);">'+a.leistungLabel+' · '+a.kanal+'</div>'
    +'<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;">'
    +(r.flaeche>0?'<span class="bdg bgr">'+r.flaeche.toFixed(2)+' m²</span>':'')
    +(a.params?.aufwand?'<span class="bdg bgr">'+a.params.aufwand+'</span>':'')
    +(a.params?.liefertage?'<span class="bdg bgr">'+a.params.liefertage+' Tage</span>':'')
    +(a.beschr?'<span style="font-size:11px;color:var(--text3);">'+a.beschr+'</span>':'')
    +'</div></div>'
    // Kalkulation
    +'<div style="padding:12px 16px;border-bottom:1px solid var(--border);">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text2);letter-spacing:.06em;margin-bottom:6px;">Kalkulation</div>'
    +r.items.map(item=>'<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:.5px solid var(--border);">'
      +'<span>'+item.label+'</span><span style="font-weight:600;">€ '+item.preis.toFixed(2)+'</span></div>').join('')
    +'<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:8px 0 2px;border-top:1.5px solid var(--border);margin-top:4px;">'
    +'<span>Netto</span><span style="color:var(--green);">€ '+r.summeNetto.toFixed(2)+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);">'
    +'<span>+ MwSt. 19%</span><span>€ '+r.mwst.toFixed(2)+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;">'
    +'<span>Brutto</span><span style="color:var(--blue);">€ '+r.brutto.toFixed(2)+'</span></div>'
    +'</div>'
    // Aktionen
    +'<div style="padding:14px 16px;display:flex;flex-direction:column;gap:7px;">'
    +'<div style="display:flex;gap:6px;">'
    +'<button data-aid="'+a.id+'" onclick="anfSendenDirect(this.dataset.aid,\'whatsapp\')" style="flex:1;padding:10px;background:#25D366;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">💬 WhatsApp</button>'
    +'<button data-aid="'+a.id+'" onclick="anfSendenDirect(this.dataset.aid,\'email\')" style="flex:1;padding:10px;background:var(--blue);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">📤 E-Mail</button>'
    +'</div>'
    +'<button data-aid="'+a.id+'" onclick="anfKundenansicht(this.dataset.aid)" style="width:100%;padding:10px;background:var(--purple);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">👁 Kundenansicht öffnen</button>'
    +'<button data-aid="'+a.id+'" onclick="anfZuAngebot(this.dataset.aid)" style="width:100%;padding:10px;background:var(--blue);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">⚡→📄 In vollständiges Angebot umwandeln</button>'
    +'<div style="display:flex;gap:6px;">'
    +'<button data-aid="'+a.id+'" onclick="anfStatus(this.dataset.aid,\'gewonnen\')" style="flex:1;padding:9px;background:var(--green-l);color:var(--green);border:1.5px solid var(--green);border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;">✓ Gewonnen</button>'
    +'<button data-aid="'+a.id+'" onclick="anfStatus(this.dataset.aid,\'abgelehnt\')" style="flex:1;padding:9px;background:#FEECEC;color:var(--red);border:1.5px solid var(--red);border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;">✕ Abgelehnt</button>'
    +'</div></div>';
}

function anfSendenDirect(id,kanal){
  const a=ANF_DATEN.find(x=>x.id===id); if(!a) return;
  const r=a.params?berechneAngebot(a.params):{summeNetto:a.netto||0,brutto:(a.netto||0)*1.19,flaeche:0};
  const text='Angebot CC Werbung GmbH\n\nFür: '+a.kunde+'\nLeistung: '+a.leistungLabel+'\n'
    +(a.beschr?a.beschr+'\n':'')+(r.flaeche>0?'Fläche: '+r.flaeche.toFixed(2)+' m²\n':'')
    +'Lieferzeit: '+(a.params?.liefertage||5)+' Werktage\n\n'
    +'Netto: € '+r.summeNetto.toFixed(2)+'\nBrutto (inkl. 19% MwSt.): € '+r.brutto.toFixed(2)+'\n\n'
    +'Angebot annehmen: https://cc-werbung.de/angebot/'+a.id+'\n\nCC Werbung GmbH';
  if(kanal==='whatsapp'){
    window.open('https://wa.me/'+(a.kontakt||'').replace(/\D/g,'')+'?text='+encodeURIComponent(text),'_blank');
    showToast('💬 WhatsApp · '+a.id);
  } else {
    window.open('mailto:'+a.kontakt+'?subject='+encodeURIComponent('Angebot CC Werbung – '+a.id)+'&body='+encodeURIComponent(text),'_blank');
    showToast('📤 E-Mail · '+a.id);
  }
  a.status='angebot'; renderAnfragen();
}

function anfKundenansicht(id){
  const a=ANF_DATEN.find(x=>x.id===id); if(!a) return;
  const r=a.params?berechneAngebot(a.params):{items:[],summeNetto:a.netto||0,mwst:(a.netto||0)*0.19,brutto:(a.netto||0)*1.19,flaeche:0};
  const today=new Date().toLocaleDateString('de-DE');
  const gueltig=new Date(); gueltig.setDate(gueltig.getDate()+14);
  const html='<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angebot '+a.id+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,sans-serif;background:#F5F5F7;color:#1D1D1F;max-width:520px;margin:0 auto;padding:20px 16px 60px;}.header{background:linear-gradient(135deg,#1D3557,#457B9D);border-radius:16px;padding:24px 20px;color:#fff;margin-bottom:16px;text-align:center;}.logo{font-size:20px;font-weight:700;margin-bottom:4px;}.card{background:#fff;border-radius:14px;padding:18px;margin-bottom:12px;box-shadow:0 2px 10px rgba(0,0,0,.06);}.sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#86868B;margin-bottom:10px;}.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F2F2F7;font-size:14px;}.row:last-child{border-bottom:none;}.total{display:flex;justify-content:space-between;padding:8px 0;font-size:15px;font-weight:700;border-top:2px solid #1D3557;margin-top:6px;}.btn-a{width:100%;padding:16px;background:#34C759;color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;margin-bottom:8px;}.btn-b{width:100%;padding:12px;background:#fff;color:#007AFF;border:1.5px solid #007AFF;border-radius:14px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;}.btn-c{width:100%;padding:10px;background:#fff;color:#FF3B30;border:1.5px solid #FF3B30;border-radius:14px;font-size:13px;cursor:pointer;}.result{display:none;padding:20px;border-radius:14px;text-align:center;margin-top:12px;}.result.show{display:block;}.ta{width:100%;padding:10px;border:1.5px solid #007AFF;border-radius:10px;font-size:14px;min-height:70px;font-family:inherit;margin:8px 0;}</style></head>'
    +'<body><div class="header"><div class="logo">CC Werbung GmbH</div><div style="font-size:12px;opacity:.7;">Werbetechnik · Folierung · Beschriftung</div></div>'
    +'<div class="card"><div class="sec">Angebot</div>'
    +'<div class="row"><span style="color:#86868B;">Nr.</span><span style="font-weight:600;">'+a.id+'</span></div>'
    +'<div class="row"><span style="color:#86868B;">Für</span><span style="font-weight:600;">'+a.kunde+'</span></div>'
    +'<div class="row"><span style="color:#86868B;">Leistung</span><span>'+a.leistungLabel+(a.beschr?' – '+a.beschr.substring(0,50):'')+'</span></div>'
    +(r.flaeche>0?'<div class="row"><span style="color:#86868B;">Fläche</span><span>'+r.flaeche.toFixed(2)+' m²</span></div>':'')
    +'<div class="row"><span style="color:#86868B;">Lieferzeit</span><span>'+(a.params?.liefertage||5)+' Werktage</span></div>'
    +'<div class="row"><span style="color:#86868B;">Datum</span><span>'+today+'</span></div>'
    +'<div class="row"><span style="color:#86868B;">Gültig bis</span><span>'+gueltig.toLocaleDateString('de-DE')+'</span></div>'
    +'</div>'
    +'<div class="card"><div class="sec">Leistungsumfang</div>'
    +r.items.map(i=>'<div class="row"><span>'+i.label+'</span><span style="font-weight:600;">€ '+i.preis.toFixed(2)+'</span></div>').join('')
    +'</div>'
    +'<div class="card"><div class="sec">Preisübersicht</div>'
    +'<div class="row"><span style="color:#86868B;">Netto</span><span style="color:#2E7D32;font-weight:700;">€ '+r.summeNetto.toFixed(2)+'</span></div>'
    +'<div class="row"><span style="color:#86868B;">+ MwSt. 19%</span><span>€ '+r.mwst.toFixed(2)+'</span></div>'
    +'<div class="total"><span>Brutto gesamt</span><span style="color:#1D3557;">€ '+r.brutto.toFixed(2)+'</span></div>'
    +'</div>'
    +'<div class="card" id="aktionen"><div class="sec">Ihr Angebot</div>'
    +'<button class="btn-a" onclick="aktion(\'annehmen\')">✓ Angebot annehmen</button>'
    +'<button class="btn-b" onclick="aktion(\'aendern\')">✏ Änderung anfragen</button>'
    +'<button class="btn-c" onclick="aktion(\'ablehnen\')">✕ Ablehnen</button>'
    +'</div>'
    +'<div class="result" id="res-a" style="background:#E8F5E9;"><div style="font-size:36px;">🎉</div><div style="font-size:18px;font-weight:700;color:#2E7D32;margin:8px 0;">Vielen Dank!</div><div style="font-size:13px;color:#555;">Auftrag bestätigt. Wir melden uns in Kürze.</div></div>'
    +'<div class="result" id="res-b" style="background:#EEF4FF;"><div style="font-size:13px;font-weight:700;color:#007AFF;margin-bottom:8px;">Änderung anfragen</div><textarea class="ta" id="ae" placeholder="Bitte beschreiben Sie die Änderung…"></textarea><button onclick="aeSend()" style="width:100%;padding:10px;background:#007AFF;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">Senden</button></div>'
    +'<div style="text-align:center;font-size:11px;color:#86868B;margin-top:20px;">CC Werbung GmbH · Mülheim · info@cc-werbung.de</div>'
    +'<scr'+'ipt>function aktion(t){document.getElementById("aktionen").style.display="none";if(t==="annehmen")document.getElementById("res-a").classList.add("show");if(t==="aendern")document.getElementById("res-b").classList.add("show");if(t==="ablehnen")document.body.innerHTML="<div style=\'padding:40px;text-align:center;\'><div style=\'font-size:36px;\'>😔</div><div style=\'font-size:16px;font-weight:600;margin-top:8px;\'>Abgelehnt</div></div>";}function aeSend(){var t=document.getElementById("ae").value;if(!t.trim())return;document.getElementById("res-b").innerHTML="<div style=\'font-size:30px;\'>✅</div><div style=\'font-size:16px;font-weight:700;color:#007AFF;margin-top:6px;\'>Gesendet!</div>";}<\/scr'+'ipt><'+'/body><'+'/html>';
  const w=window.open('','_blank','width=580,height=900');
  w.document.write(html); w.document.close();
  showToast('👁 Kundenansicht · '+a.id);
}

function anfAngebotErstellen(id){
  const a=ANF_DATEN.find(x=>x.id===id); if(!a) return;
  a.status='angebot'; renderAnfragen(); anfOpenDetail(id);
}

function anfStatus(id,s){
  const a=ANF_DATEN.find(x=>x.id===id); if(!a) return;
  a.status=s; renderAnfragen();
  showToast(s==='gewonnen'?'🎉 '+id+' gewonnen!':'✕ '+id+' abgelehnt');
}

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

