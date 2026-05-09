// ════════════════════════════════════════════════════════════════════════════
// CC Intern ← MesseFlow  Bridge
// ════════════════════════════════════════════════════════════════════════════
//
//  MesseFlow  = Quelle  (window.MesseFlow Public API)
//  CC Intern  = Verarbeitung + Anzeige  (dieses Modul)
//
//  Ablauf:
//    1. MesseFlow.on('ready') → loadFromMesseFlow() + loadKalenderFromMesseFlow()
//    2. MesseFlow.on('auftragCreated/Updated/Deleted') → live spiegeln
//    3. window.CCIntern.getAuftraege() / getKalenderTermine() für Cockpit-Shell
//
//  Laden in Cockpit/index.html NACH messeflow-app.js:
//    <script src="../js/cc-intern-bridge.js"></script>
//
// ════════════════════════════════════════════════════════════════════════════

window.CCIntern = (function () {

  // ── interner State ────────────────────────────────────────────────────────
  var _state = {
    auftraege:       [],   // gemappte MesseFlow-Aufträge
    kalenderTermine: [],   // Kalender-Events aus MesseFlow
  };

  // ── interner Event-Bus (für Cockpit-Shell) ────────────────────────────────
  var _listeners = {};

  function _on(event, cb) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(cb);
  }
  function _off(event, cb) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(function (f) { return f !== cb; });
  }
  function _emit(event, data) {
    (_listeners[event] || []).forEach(function (cb) {
      try { cb(data); } catch (e) {
        console.warn('[CCIntern Bridge]', event, e);
      }
    });
  }

  // ── Mapping: MesseFlow-Auftrag → CC-Intern-Format ─────────────────────────
  //
  //  MesseFlow        CC Intern
  //  ───────────────────────────
  //  id             → id
  //  name           → name
  //  kunde          → kunde
  //  status         → status
  //  deadline       → terminEnde
  //  messe          → projektName
  //  stand          → standNr
  //  angebotsnummer → angebotsnummer
  //  waendeAnzahl   → positionen
  //  waendeStatus   → positionenDetail
  //
  function _mapAuftrag(a) {
    if (!a) return null;
    return {
      id:               a.id,
      name:             a.name             || '',
      kunde:            a.kunde            || '',
      status:           a.status           || 'Neu',
      terminEnde:       a.deadline         || null,
      projektName:      a.messe            || a.name || '',
      standNr:          a.stand            || '',
      angebotsnummer:   a.angebotsnummer   || '',
      prioritaet:       a.prioritaet       || 'Normal',
      positionen:       a.waendeAnzahl     || 0,
      positionenDetail: a.waendeStatus     || [],
      quelle:           'messeflow',
      _raw:             a,                    // Originalreferenz für Drilldown
    };
  }

  // ── Aufträge importieren ─────────────────────────────────────────────────

  /**
   * Alle Aufträge aus MesseFlow laden und in _state.auftraege spiegeln.
   * Bestehende Einträge werden aktualisiert, keine Duplikate.
   */
  function loadFromMesseFlow() {
    if (!window.MesseFlow) {
      console.info('[CCIntern Bridge] window.MesseFlow nicht verfügbar – übersprungen.');
      return;
    }

    var fresh;
    try {
      fresh = window.MesseFlow.getAuftraege();
    } catch (e) {
      console.warn('[CCIntern Bridge] getAuftraege() Fehler:', e);
      return;
    }

    if (!Array.isArray(fresh)) return;

    var updated = 0;
    var added   = 0;

    fresh.forEach(function (a) {
      var mapped = _mapAuftrag(a);
      if (!mapped) return;

      var idx = _state.auftraege.findIndex(function (x) { return x.id === mapped.id; });
      if (idx >= 0) {
        _state.auftraege[idx] = mapped;
        updated++;
      } else {
        _state.auftraege.push(mapped);
        added++;
      }
    });

    // Gelöschte entfernen: IDs die in _state sind, aber nicht mehr in fresh
    var freshIds = fresh.map(function (a) { return a.id; });
    _state.auftraege = _state.auftraege.filter(function (x) {
      return freshIds.indexOf(x.id) !== -1;
    });

    console.info('[CCIntern Bridge] Aufträge geladen: ' + fresh.length +
      ' (' + added + ' neu, ' + updated + ' aktualisiert)');

    _emit('auftraegeGeladen', { auftraege: _state.auftraege });
  }

  // ── Kalender importieren ──────────────────────────────────────────────────

  /**
   * Kalender-Termine aus MesseFlow laden.
   * Format bleibt wie von MesseFlow geliefert, quelle: 'messeflow' ist bereits gesetzt.
   */
  function loadKalenderFromMesseFlow() {
    if (!window.MesseFlow) return;

    var termine;
    try {
      termine = window.MesseFlow.getKalenderTermine();
    } catch (e) {
      console.warn('[CCIntern Bridge] getKalenderTermine() Fehler:', e);
      return;
    }

    if (!Array.isArray(termine)) return;

    // Alte MesseFlow-Termine ersetzen, andere Quellen behalten
    _state.kalenderTermine = _state.kalenderTermine.filter(function (t) {
      return t.quelle !== 'messeflow';
    });
    _state.kalenderTermine = _state.kalenderTermine.concat(termine);

    console.info('[CCIntern Bridge] Kalender-Termine geladen: ' + termine.length);
    _emit('kalenderGeladen', { termine: _state.kalenderTermine });
  }

  // ── Live-Sync: Event-Handler ─────────────────────────────────────────────

  /** Neuer Auftrag in MesseFlow → sofort in CC Intern einspeisen. */
  function handleCreate(a) {
    var mapped = _mapAuftrag(a);
    if (!mapped) return;

    // Doppelten Eintrag verhindern
    var exists = _state.auftraege.some(function (x) { return x.id === mapped.id; });
    if (!exists) {
      _state.auftraege.push(mapped);
      console.info('[CCIntern Bridge] Auftrag erstellt:', mapped.name);
      _emit('auftragErstellt', mapped);
    }
  }

  /** Auftrag geändert → bestehendes Objekt in-place ersetzen. */
  function handleUpdate(a) {
    var mapped = _mapAuftrag(a);
    if (!mapped) return;

    var idx = _state.auftraege.findIndex(function (x) { return x.id === mapped.id; });
    if (idx >= 0) {
      _state.auftraege[idx] = mapped;
    } else {
      // Auftrag war noch nicht lokal – einfach hinzufügen
      _state.auftraege.push(mapped);
    }
    console.info('[CCIntern Bridge] Auftrag aktualisiert:', mapped.name);
    _emit('auftragAktualisiert', mapped);
  }

  /** Auftrag gelöscht → aus CC Intern entfernen. */
  function handleDelete(a) {
    if (!a || !a.id) return;

    _state.auftraege = _state.auftraege.filter(function (x) { return x.id !== a.id; });

    // Zugehörige Kalender-Einträge ebenfalls entfernen
    _state.kalenderTermine = _state.kalenderTermine.filter(function (t) {
      return t.projektId !== a.id;
    });

    console.info('[CCIntern Bridge] Auftrag gelöscht:', a.name || a.id);
    _emit('auftragGeloescht', { id: a.id, name: a.name || '' });
  }

  // ── MesseFlow Event-Listener anmelden ────────────────────────────────────

  function _registerMesseFlowListeners() {
    if (!window.MesseFlow) return;
    window.MesseFlow.on('auftragCreated', handleCreate);
    window.MesseFlow.on('auftragUpdated', handleUpdate);
    window.MesseFlow.on('auftragDeleted', handleDelete);
    // Kalender nach jeder Änderung neu einlesen (einfach + robust)
    window.MesseFlow.on('auftragCreated', function () { loadKalenderFromMesseFlow(); });
    window.MesseFlow.on('auftragUpdated', function () { loadKalenderFromMesseFlow(); });
    window.MesseFlow.on('auftragDeleted', function () { loadKalenderFromMesseFlow(); });
  }

  // ── Initialisierung ──────────────────────────────────────────────────────

  /**
   * Bridge starten.
   * Wird automatisch aufgerufen sobald MesseFlow 'ready' feuert.
   * Falls MesseFlow bereits gebootet ist (z.B. Seite schon geladen), sofort laden.
   */
  function _init() {
    if (!window.MesseFlow) {
      // MesseFlow nicht geladen — sauber abbrechen
      console.info('[CCIntern Bridge] MesseFlow nicht gefunden. Bridge inaktiv.');
      return;
    }

    // Event-Listener für Live-Updates registrieren
    _registerMesseFlowListeners();

    // MesseFlow.on('ready') abonnieren für den Fall dass boot noch läuft
    window.MesseFlow.on('ready', function () {
      loadFromMesseFlow();
      loadKalenderFromMesseFlow();
    });

    // Falls MesseFlow bereits ready ist (z.B. bei Script-Nachladen), sofort laden
    // Erkennungszeichen: state.projects ist bereits befüllt
    try {
      var alreadyLoaded = window.MesseFlow.getAuftraege().length >= 0;
      if (alreadyLoaded) {
        loadFromMesseFlow();
        loadKalenderFromMesseFlow();
      }
    } catch (e) { /* MesseFlow noch nicht bereit – kein Problem */ }
  }

  // Bridge starten sobald DOM bereit ist
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    // DOM bereits geladen → sofort (aber async, damit messeflow-app.js fertig ist)
    setTimeout(_init, 0);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {

    /** Alle gemappten Aufträge (CC Intern Format). */
    getAuftraege: function () {
      return _state.auftraege.slice(); // Kopie, kein direkter Zugriff
    },

    /** Einzelnen Auftrag nach ID. */
    getAuftragById: function (id) {
      return _state.auftraege.find(function (x) { return x.id === id; }) || null;
    },

    /** Alle Kalender-Termine (alle Quellen, inkl. messeflow). */
    getKalenderTermine: function () {
      return _state.kalenderTermine.slice();
    },

    /** Kalender-Termine nur aus MesseFlow. */
    getKalenderTermineMesseFlow: function () {
      return _state.kalenderTermine.filter(function (t) {
        return t.quelle === 'messeflow';
      });
    },

    /** Manuell neu einlesen (z.B. nach Benutzer-Aktion). */
    refresh: function () {
      loadFromMesseFlow();
      loadKalenderFromMesseFlow();
    },

    // Event-Bus für Cockpit-Shell
    on:   _on,
    off:  _off,
    emit: _emit,
  };

}());
// ════════════════════════════════════════════════════════════════════════════
