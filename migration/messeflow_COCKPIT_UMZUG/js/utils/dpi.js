// ─── DPI-BERECHNUNG ─────────────────────────────────────
// dpi = pixel / (mm / 25.4)
// Gibt { dpi, stufe:'ok'|'warnung'|'blockiert', label } zurück oder null wenn nicht berechenbar.
function berechneDpi(pxBreite, pxHoehe, bestellmass){
  const px_b = parseFloat(pxBreite);
  const px_h = parseFloat(pxHoehe);
  const mass  = parseMass(bestellmass);
  if(!mass || isNaN(px_b) || isNaN(px_h) || px_b <= 0 || px_h <= 0) return null;

  const dpi_b = px_b / (mass.w / 25.4);  // mm → inch: /25.4
  const dpi_h = px_h / (mass.h / 25.4);
  const dpi   = Math.round(Math.min(dpi_b, dpi_h)); // niedrigster Wert ist maßgeblich

  let stufe, label, color;
  if(dpi >= 100)      { stufe='ok';        label=`✓ ${dpi} DPI – druckbereit`;  color='var(--green)'; }
  else if(dpi >= 70)  { stufe='warnung';   label=`⚡ ${dpi} DPI – Warnung`;     color='var(--yellow)'; }
  else                { stufe='blockiert'; label=`✖ ${dpi} DPI – zu niedrig`;   color='var(--red)'; }

  return { dpi, dpi_b: Math.round(dpi_b), dpi_h: Math.round(dpi_h), stufe, label, color };
}

window.berechneDpi = berechneDpi;
