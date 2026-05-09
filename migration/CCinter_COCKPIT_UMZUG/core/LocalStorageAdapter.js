// ══════════════════════════════════════════════════════════════════════
// CC INTERN — LocalStorageAdapter
// ─────────────────────────────────────────────────────────────────────
// Aktiver Adapter für lokale Entwicklung / Demo-Betrieb.
// Speichert alle Daten im Browser-localStorage.
//
// Interface:
//   load(key, fallback)  → Wert oder fallback
//   save(key, data)      → true/false
//   reset(key)           → void
//   loadAsync(key, fallback, callback)  → callback(err, data)
//
// Umschaltung auf ApiAdapter:
//   window.CCIntern.DataService.setAdapter(window.CCIntern.ApiAdapter);
// ══════════════════════════════════════════════════════════════════════

window.CCIntern = window.CCIntern || {};

window.CCIntern.LocalStorageAdapter = {

  load: function(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch(e) {
      return fallback;
    }
  },

  save: function(key, data) {
    try {
      var toSave = data;

      // AUFTRAEGE: Checklisten + Bild-DataURLs auslagern, um localStorage-Limit zu schonen.
      // Checklisten werden aus CL_VORLAGEN regeneriert (spart ~300 KB).
      // Bilder werden in eigene Keys cc_dat_{auftragId}_{idx} ausgelagert (verhindert QuotaExceeded).
      if (key && key.indexOf('auftraege') >= 0 && Array.isArray(data)) {
        toSave = data.map(function(a) {
          var copy = Object.assign({}, a, { schritte: {}, dateien: [] });

          // Checklisten aus schritte entfernen
          if (a.schritte) {
            Object.keys(a.schritte).forEach(function(s) {
              var sch = a.schritte[s];
              if (!sch) { copy.schritte[s] = sch; return; }
              copy.schritte[s] = Object.assign({}, sch, { checkliste: [] });
            });
          }

          // Bild-DataURLs aus dateien auslagern
          if (Array.isArray(a.dateien)) {
            copy.dateien = a.dateien.map(function(f, idx) {
              var entry = Object.assign({}, f);
              var rawData = entry.dataUrl || entry.data || '';
              if (rawData && rawData.length > 500) {
                var imgKey = 'cc_dat_' + a.id + '_' + idx;
                try { localStorage.setItem(imgKey, rawData); } catch(imgErr) {
                  console.warn('ccImgStore: Bild konnte nicht gespeichert werden:', imgKey);
                }
                entry.imgKey  = imgKey;
                entry.dataUrl = '';   // nicht inline speichern
                entry.data    = '';
              }
              return entry;
            });
          }

          return copy;
        });
      }

      var json = JSON.stringify(toSave);
      if (json.length > 3500000) {
        console.warn('LocalStorageAdapter: Datenmenge ' + Math.round(json.length / 1024) + ' KB — localStorage-Limit beachten');
      }
      localStorage.setItem(key, json);
      return true;
    } catch(e) {
      console.error('LocalStorageAdapter FEHLER:', e.name, e.message);
      if (typeof showToast === 'function') {
        showToast('⚠ Speicherfehler: ' + e.message);
      }
      return false;
    }
  },

  reset: function(key) {
    try {
      localStorage.removeItem(key);
    } catch(e) {
      console.warn('LocalStorageAdapter.reset FEHLER:', e.message);
    }
  },

  // Callback-basierter Load — gleiche Signatur wie ApiAdapter.loadAsync
  loadAsync: function(key, fallback, callback) {
    var data = this.load(key, fallback);
    if (callback) callback(null, data);
  }

};
