// ════════════════════════════════════════════════════════════════════
// CC INTERN — Mitarbeiter-App / Mobil
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html (Inline-<script>-Block)
// Ziel:     CC inter/COCKPIT_Daten/_COCKPIT_UMZUG/views/mitarbeiter-app-view.js
// Enthält:  mobAufgabenNacherzeugen
//
// TODO [Cockpit]: mobAufgabenNacherzeugen() → API GET /orders (gefiltert nach MA)
// TODO [Cockpit]: Mobile-Auth-Rolle prüfen: nur eigene Schritte sichtbar
// ════════════════════════════════════════════════════════════════════

function mobAufgabenNacherzeugen(){
  var isVorlagenView = (typeof currentPage !== 'undefined' && currentPage === 'checklisten');
  if(isVorlagenView) return;
  var vorher = INTERN_AUFGABEN.length;
  function auftragHatPersistierteCheckliste(a){
    if(!a || typeof a!=='object') return false;
    if(Array.isArray(a.checklisten) && a.checklisten.length>0) return true;
    var schritte = a.schritte || {};
    return ['grafik','druck','laminat','montage','doku'].some(function(step){
      var sch = schritte[step];
      return !!(sch && Array.isArray(sch.checkliste) && sch.checkliste.length>0);
    });
  }

  // Req. 1: Checklisten in Schritte einbauen (Migration) + Legacy
  var needSave = false;
  AUFTRAEGE.forEach(function(a){
    if(auftragHatPersistierteCheckliste(a)){
      console.log('REBUILD BLOCKED - USER DATA EXISTS');
      return;
    }
    // Schritt-Checklisten nachrüsten
    ['grafik','druck','laminat','montage','doku'].forEach(function(step){
      var sch = a.schritte && a.schritte[step];
      if(sch && sch.dauer > 0 && (!sch.checkliste || !sch.checkliste.length)){
        schrittMigrieren(sch, step);
        sch.checkliste = clChecklistenFuerSchritt(a, step);
        if(sch.checkliste.length) needSave = true;
      }
    });
    // Legacy auftrag.checklisten
    if(!a.checklisten || !a.checklisten.length){
      a.checklisten = clChecklistenFuerAuftrag(a);
      if(a.checklisten.length) needSave = true;
    }
  });
  if(needSave) saveAuftraege();

  AUFTRAEGE.forEach(function(a){
    if(a.step === 'abgeschlossen') return;
    // Prüfen ob schon Aufgaben existieren
    var hatAufgaben = INTERN_AUFGABEN.some(function(g){ return g.auftragId === a.id; });
    if(hatAufgaben) return;

    // Schritte mit dauer=0 → Default-Werte aus AU_STEP_CONFIG einsetzen
    var schritte = a.schritte || {};
    var defaultsGesetzt = false;
    ['grafik','druck','laminat','montage','doku'].forEach(function(s){
      var sch = schritte[s];
      if(!sch) return;
      if((sch.dauer||0) <= 0){
        var def = AU_STEP_CONFIG && AU_STEP_CONFIG[s] ? AU_STEP_CONFIG[s].defaultDauer : 0;
        if(def > 0){ sch.dauer = def; defaultsGesetzt = true; }
      }
    });
    if(defaultsGesetzt){ needSave = true; }

    // Prüfen ob nun Schritte mit Dauer vorhanden
    var hatSchritteMitDauer = Object.keys(schritte).some(function(s){
      return schritte[s] && schritte[s].dauer > 0;
    });
    if(!hatSchritteMitDauer) return;
    // Aufgaben erzeugen
    auftragAufgabenErzeugen(a.id);
  });
  var nachher = INTERN_AUFGABEN.length;
  if(nachher > vorher || needSave){
    if(nachher > vorher)
      console.log('Aufgaben nacherzeugt: '+(nachher-vorher)+' neue Aufgaben für bestehende Aufträge');
    saveAufgaben();
    if(needSave) saveAuftraege();
  }
}

