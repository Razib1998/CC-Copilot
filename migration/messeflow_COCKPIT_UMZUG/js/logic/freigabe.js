// ─── PRODUKTIONSPLAN ────────────────────────────────────
// Standard-Workflow nach vollständiger Freigabe aller Wände
const PROD_STUFEN = [
  { id:'druck',    label:'Druck',    icon:'🖨',  dauer:2, rolle:'Produktion' },
  { id:'laminat',  label:'Laminat',  icon:'🧴',  dauer:1, rolle:'Produktion' },
  { id:'plot',     label:'Plot',     icon:'✂️',  dauer:1, rolle:'Grafik'     },
  { id:'montage',  label:'Montage',  icon:'🔧',  dauer:1, rolle:'Norbert'    },
  { id:'abnahme',  label:'Abnahme',  icon:'✅',  dauer:1, rolle:'Melanie'    },
];

// Wird nach jeder Status-Änderung einer Wand aufgerufen.
// Wenn alle INTERN-Wände druckbereit (status >= 3, kein 6) → Auto-Freigabe.
function checkAutoFreigabe(p){
  if(p.freigegeben) return; // bereits freigegeben
  const intern = p.waende;
  if(!intern.length) return;
  const alleOk = intern.every(w => w.status >= 3 && w.status !== 6 && w.status !== 8);
  if(!alleOk) return;

  // ✓ Alle Wände druckbereit → Auftrag freigeben
  p.freigegeben = true;
  p.freigabeDatum = new Date().toLocaleDateString('de-DE');

  // Produktionsplan erzeugen (falls noch keiner vorhanden)
  if(!p.produktionsplan){
    const heute = new Date();
    let offset = 0;
    p.produktionsplan = PROD_STUFEN.map(s => {
      const start = new Date(heute); start.setDate(start.getDate() + offset);
      const end   = new Date(start); end.setDate(end.getDate() + s.dauer);
      offset += s.dauer;
      return {
        id:       s.id,
        label:    s.label,
        icon:     s.icon,
        rolle:    s.rolle,
        dauer:    s.dauer,
        start:    start.toLocaleDateString('de-DE'),
        end:      end.toLocaleDateString('de-DE'),
        erledigt: false,
      };
    });
  }
}

window.PROD_STUFEN = PROD_STUFEN;
window.checkAutoFreigabe = checkAutoFreigabe;
