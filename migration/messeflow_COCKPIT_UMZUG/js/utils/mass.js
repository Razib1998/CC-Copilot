// ─── MASS PARSER ────────────────────────────────────────
// Parst "300 × 250 cm" oder "3000 × 2500 mm" → {w, h, unit:'cm'|'mm'}
// Gibt null zurück wenn nicht parsebar.
function parseMass(str){
  if(!str||!str.trim()) return null;
  // Normalize separators: ×, x, X, *, by
  const s = str.trim().replace(/×|x|X|\*/g,'×');
  // Match: number [optional space] unit? × number [optional space] unit?
  const re = /(\d+(?:[.,]\d+)?)\s*(cm|mm)?\s*×\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)?/i;
  const m = s.match(re);
  if(!m) return null;
  const w = parseFloat(m[1].replace(',','.'));
  const h = parseFloat(m[3].replace(',','.'));
  // Determine unit: explicit wins, default cm
  const unit = (m[2]||m[4]||'cm').toLowerCase();
  // Normalize to mm
  const factor = unit==='cm' ? 10 : 1;
  return { w: w*factor, h: h*factor };
}

// ─── DIFFERENZ BERECHNEN ────────────────────────────────
// Gibt {dw, dh, maxDiff, stufe: 'ok'|'warnung'|'abweichung'|'unlesbar'} zurück
function vergleicheMasse(bestellmass, dateiMass){
  const b = parseMass(bestellmass);
  const d = parseMass(dateiMass);
  if(!b || !d) return { dw:null, dh:null, maxDiff:null, stufe:'unlesbar' };
  const dw = Math.abs(b.w - d.w);
  const dh = Math.abs(b.h - d.h);
  const maxDiff = Math.max(dw, dh);
  let stufe;
  if(maxDiff <= 5)       stufe = 'ok';
  else if(maxDiff <= 20) stufe = 'warnung';
  else                   stufe = 'abweichung';
  return { dw, dh, maxDiff, stufe };
}

// Format mm nicely
function fmm(mm){ return mm===0 ? '0 mm' : `${mm % 1 === 0 ? mm : mm.toFixed(1)} mm`; }

window.parseMass = parseMass;
window.vergleicheMasse = vergleicheMasse;
window.fmm = fmm;
