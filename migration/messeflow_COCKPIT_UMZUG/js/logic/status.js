// STATUS
// ═══════════════════════════════════════════════════════
// 1 Datei fehlt
// 2 Bestellmaß fehlt (wirklich kein Bestellmaß hinterlegt)
// 8 Nicht geprüft (Datei + Bestellmaß vorhanden, aber kein Dateimaß erkannt)
// 3 Maß OK (Dateimaß stimmt mit Bestellmaß überein → freigeben)
// 7 Prüfen / Warnung (Abweichung 5–20 mm)
// 6 Blockiert (Abweichung >20 mm, Font-Fehler, DPI zu niedrig)
// 4 Warten auf Freigabe
// 5 Druckfertig
// 9 An Druck gesendet (Datei-Workflow Caldera)
const ST_LABELS = {
  1:'Datei fehlt',
  2:'Bestellmaß fehlt',
  8:'Nicht geprüft',
  3:'✓ Maß OK',
  7:'⚡ Prüfen',
  6:'✖ Blockiert',
  4:'Warten auf Freigabe',
  5:'Druckfertig',
  9:'An Druck gesendet',
};
const ST_CLASS = {1:'st-1',2:'st-2',8:'st-8',3:'st-3',7:'st-7',6:'st-6',4:'st-4',5:'st-5',9:'st-9'};
const ST_DOT   = {1:'rot',2:'gelb',8:'gelb',3:'gruen',7:'gelb',6:'rot',4:'gelb',5:'gruen',9:'lila'};

// Ampel for overall project
function projAmpel(p){
  if(p.waende.every(w=>w.status===5)) return 'gruen';
  if(p.waende.some(w=>w.status===6))  return 'rot';
  if(p.waende.some(w=>w.status===1))  return 'rot';   // Datei fehlt = rot
  if(p.waende.some(w=>w.status===9))  return 'lila';
  return 'gelb'; // inkl. status 8 (nicht geprüft) = gelb
}

// Auto-status — single source of truth
// Strikte Trennung: Bestellmaß ≠ Dateimaß ≠ Prüfstatus
function recalc(w){
  const getF = window.getAktuelleDatei;
  const DW = window.DATEI_WORKFLOW;
  if (getF && DW && w.datei) {
    const f = getF(w);
    if (f && f.status) {
      const ns = typeof window.normalizeDateiWorkflowStatus === 'function'
        ? window.normalizeDateiWorkflowStatus(f.status)
        : f.status;
      if ([DW.CALDERA_GESENDET, DW.WIRD_GEDRUCKT, DW.GELIEFERT].includes(ns)) {
        w.status = ns === DW.CALDERA_GESENDET ? 9 : 5;
        return;
      }
    }
  }

  // 1. Keine Datei → Datei fehlt
  if(!w.datei){ w.status=1; return; }

  // 2. Kein Bestellmaß hinterlegt → Bestellmaß fehlt
  const hasBestellmass = !!(w.bestellmass && w.bestellmass.trim());
  if(!hasBestellmass){ w.status=2; return; }

  const hasDateiMass = !!(w.dateiMass && w.dateiMass.trim());

  // 3. Maß-Abweichungscheck (nur wenn Dateimaß vom Backend erkannt)
  if(hasDateiMass){
    const vgl = vergleicheMasse(w.bestellmass, w.dateiMass);
    if(vgl.stufe==='abweichung' && !w.abweichungOk){ w.status=6; return; }
    if(vgl.stufe==='warnung'    && !w.abweichungOk){ w.status=7; return; }
  }

  // 4. DPI-Prüfung
  if(w.dpiInfo){
    if(w.dpiInfo.stufe === 'blockiert'){ w.status=6; return; }
    if(w.dpiInfo.stufe === 'warnung'  ){ w.status=7; return; }
  }

  // 5. Font-Prüfung
  if(w.fontInfo && w.fontInfo.status === 'blockiert'){ w.status=6; return; }
  if(w.fontInfo && w.fontInfo.status === 'warnung'  ){ w.status=7; return; }

  // 6. Kein Dateimaß erkannt → Nicht geprüft
  //    (Datei + Bestellmaß vorhanden, aber Backend hat kein Maß geliefert)
  if(!hasDateiMass){ w.status=8; return; }

  // 7. Maß OK → Norbert gibt frei
  if(!w.masseOk){ w.status=3; return; }
  if(w.status<4){ w.status=4; return; }
  // 4→5 nur durch Melanie
}

// Prüf-Anzeige (Karte + Upload-Modal): „Datei OK“ nur bei bestandenen Pflichtchecks
function effektivePruefSlot(w, vgl) {
  if (vgl && (vgl.stufe === 'abweichung' || vgl.stufe === 'unlesbar')) return 'fehler';
  if (w.status === 6) return 'fehler';

  const pr = w.pruefErgebnis;
  if (!pr) {
    if (w.status === 7) return 'warnung';
    return 'none';
  }

  // DPI-Zeilen ignorieren — Server kann Vektor/Raster nicht zuverlässig
  // unterscheiden; DPI-Warnung ist nur informativ, blockiert Workflow nicht
  const zeilen = (pr.pruefung || []).filter(z => {
    const t = String(z.titel || '').toLowerCase();
    return !t.includes('dpi') && !t.includes('auflösung');
  });
  const anyFehler = zeilen.some(z => {
    const s = String(z.status || '').toLowerCase();
    return s === 'fehler' || s === 'error';
  });
  const anyWarn = zeilen.some(z => {
    const s = String(z.status || '').toLowerCase();
    return s === 'warnung' || s === 'warning';
  });

  if (anyFehler) return 'fehler';

  if (w.status === 7) return 'warnung';
  if (vgl && vgl.stufe === 'warnung') return 'warnung';
  if (anyWarn) return 'warnung';

  // Wenn keine nicht-DPI Fehler/Warnungen → OK
  // (Server-Status ignorieren da DPI den Gesamt-Status verfälscht haben kann)
  if (zeilen.length > 0) return 'ok';

  // Keine pruefung-Zeilen → Fallback auf Server-Status
  const ps = String(pr.status || '').toLowerCase();
  if (ps === 'ok') return 'ok';
  if (ps === 'warnung' || ps === 'warning') return 'warnung';
  return 'none';
}

window.ST_LABELS = ST_LABELS;
window.ST_CLASS = ST_CLASS;
window.ST_DOT = ST_DOT;
window.projAmpel = projAmpel;
window.recalc = recalc;
window.effektivePruefSlot = effektivePruefSlot;
