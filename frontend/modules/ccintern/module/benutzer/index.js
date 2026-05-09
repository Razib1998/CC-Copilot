// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/benutzer/index.js
// ─────────────────────────────────────────────────────────────────────
// Benutzer- und Rollenverwaltung — Vorbereitung für CC Cockpit.
//
// CC Cockpit übernimmt die vollständige Benutzerverwaltung in Phase 2.
// Dieser Block liefert die Infrastruktur vorab:
//
//   1. CC_ROLLEN — Rollendefinitionen mit Rechte-Matrix
//   2. CC_BENUTZER — Benutzerregister (abgeleitet aus MA_DATA)
//   3. Feature: hatRecht(recht, maId) — Zugriffscheck für UI-Elemente
//   4. Feature: hatRolle(rolle, maId) — Rollencheck
//   5. Feature: benutzerInfo(maId)    — Benutzer-Infoobjekt
//   6. Feature: benutzerAktivieren/Deaktivieren(maId)
//   7. Persistenz via DataService
//   8. Globaler Export: window.CC.Rollen + window.CC.Benutzer
//
// UI-Seiten (pg-benutzer, pg-rollen) werden von CC Cockpit geliefert.
// Dieses Modul stellt nur die Datenschicht bereit.
//
// Kalender: CC Cockpit — kein Code hier
// Zugriffsrechte: CC Cockpit Basis — nur CC-Intern-Feinschliff hier
// ══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var KEY_BENUTZER = 'cc_intern_benutzer_v1';
  var KEY_ROLLEN   = 'cc_intern_rollen_v1';

  // ── Rollendefinitionen ────────────────────────────────────────────────
  // rechte: Array von Rechte-Strings die diese Rolle hat
  var ROLLEN_DEFAULT = [
    {
      id:     'admin',
      name:   'Administrator',
      farbe:  '#1565C0',
      rechte: [
        'benutzer.lesen', 'benutzer.schreiben', 'benutzer.loeschen',
        'rollen.lesen', 'rollen.schreiben',
        'auftraege.lesen', 'auftraege.schreiben', 'auftraege.loeschen',
        'anfragen.lesen', 'anfragen.schreiben', 'anfragen.loeschen',
        'angebote.lesen', 'angebote.schreiben', 'angebote.loeschen',
        'lager.lesen', 'lager.schreiben',
        'urlaub.lesen', 'urlaub.schreiben', 'urlaub.entscheiden',
        'mitarbeiter.lesen', 'mitarbeiter.schreiben',
        'rechnungen.lesen', 'rechnungen.schreiben',
        'checklisten.lesen', 'checklisten.schreiben',
        'crm.lesen', 'crm.schreiben',
        'kunden.lesen', 'kunden.schreiben',
      ],
    },
    {
      id:     'geschaeftsfuehrung',
      name:   'Geschäftsführung',
      farbe:  '#1565C0',
      rechte: [
        'auftraege.lesen', 'auftraege.schreiben', 'auftraege.loeschen',
        'anfragen.lesen', 'anfragen.schreiben',
        'angebote.lesen', 'angebote.schreiben',
        'lager.lesen', 'lager.schreiben',
        'urlaub.lesen', 'urlaub.schreiben', 'urlaub.entscheiden',
        'mitarbeiter.lesen', 'mitarbeiter.schreiben',
        'rechnungen.lesen', 'rechnungen.schreiben',
        'checklisten.lesen', 'checklisten.schreiben',
        'crm.lesen', 'crm.schreiben',
        'kunden.lesen', 'kunden.schreiben',
      ],
    },
    {
      id:     'buero',
      name:   'Büro / Verwaltung',
      farbe:  '#7C3AED',
      rechte: [
        'auftraege.lesen', 'auftraege.schreiben',
        'anfragen.lesen', 'anfragen.schreiben',
        'angebote.lesen', 'angebote.schreiben',
        'lager.lesen',
        'urlaub.lesen',
        'mitarbeiter.lesen',
        'rechnungen.lesen', 'rechnungen.schreiben',
        'checklisten.lesen',
        'crm.lesen', 'crm.schreiben',
        'kunden.lesen', 'kunden.schreiben',
      ],
    },
    {
      id:     'monteur',
      name:   'Monteur / Produktion',
      farbe:  '#059669',
      rechte: [
        'auftraege.lesen',
        'checklisten.lesen',
        'lager.lesen',
        'urlaub.lesen',
      ],
    },
    {
      id:     'lager',
      name:   'Lager',
      farbe:  '#D97706',
      rechte: [
        'lager.lesen', 'lager.schreiben',
        'auftraege.lesen',
      ],
    },
  ];

  // Aktive Listen (werden beim Init gefüllt)
  var CC_ROLLEN   = [];
  var CC_BENUTZER = [];

  // ── DataService-Zugriff ──────────────────────────────────────────────
  function ds() {
    return (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService)
      ? window.CCIntern.DataService : null;
  }

  // ── Rollen laden/speichern ────────────────────────────────────────────
  function saveRollen() {
    var svc = ds();
    if (!svc) return;
    svc.save(KEY_ROLLEN, CC_ROLLEN);
  }

  function loadRollen() {
    var svc = ds();
    if (!svc) { _initRollenDefault(); return; }
    var data = svc.load(KEY_ROLLEN, null);
    if (data && Array.isArray(data) && data.length > 0) {
      CC_ROLLEN.length = 0;
      data.forEach(function (r) { CC_ROLLEN.push(r); });
    } else {
      _initRollenDefault();
    }
  }

  function _initRollenDefault() {
    CC_ROLLEN.length = 0;
    ROLLEN_DEFAULT.forEach(function (r) { CC_ROLLEN.push(JSON.parse(JSON.stringify(r))); });
    saveRollen();
  }

  // ── Benutzer laden/speichern ──────────────────────────────────────────
  function saveBenutzer() {
    var svc = ds();
    if (!svc) return;
    svc.save(KEY_BENUTZER, CC_BENUTZER);
  }

  function loadBenutzer() {
    var svc = ds();
    if (!svc) { _syncBenutzerFromMA(); return; }
    var data = svc.load(KEY_BENUTZER, null);
    if (data && Array.isArray(data) && data.length > 0) {
      CC_BENUTZER.length = 0;
      data.forEach(function (b) { CC_BENUTZER.push(b); });
      // Neue MA aus MA_DATA ergänzen
      _syncBenutzerFromMA(true);
    } else {
      _syncBenutzerFromMA();
    }
  }

  // Benutzer aus MA_DATA ableiten / synchronisieren
  function _syncBenutzerFromMA(onlyNew) {
    if (typeof MA_DATA === 'undefined') return;
    MA_DATA.forEach(function (ma) {
      var existing = CC_BENUTZER.find(function (b) { return b.maId === ma.maId; });
      if (existing) {
        // Name/Rolle aus MA_DATA aktuell halten
        existing.name = ma.n;
        existing.av   = ma.av;
        existing.col  = ma.col;
        return;
      }
      // Rolle ableiten aus MA-Rolle
      var rolleId = 'monteur';
      if ((ma.r || '').toLowerCase().indexOf('geschäftsführ') !== -1) rolleId = 'geschaeftsfuehrung';
      else if ((ma.r || '').toLowerCase().indexOf('büro') !== -1)     rolleId = 'buero';
      else if ((ma.r || '').toLowerCase().indexOf('lager') !== -1)    rolleId = 'lager';

      CC_BENUTZER.push({
        maId:   ma.maId,
        name:   ma.n,
        av:     ma.av,
        col:    ma.col || '#888',
        rolle:  rolleId,
        aktiv:  true,
        erstellt: new Date().toISOString().slice(0, 10),
      });
    });
    if (!onlyNew) saveBenutzer();
  }

  // ── Feature: Zugriffscheck ────────────────────────────────────────────
  function hatRecht(recht, maId) {
    var id  = maId || (typeof MOB_MA_ID !== 'undefined' ? MOB_MA_ID : null);
    if (!id) return false;
    var ben = CC_BENUTZER.find(function (b) { return b.maId === id; });
    if (!ben || !ben.aktiv) return false;
    var rolle = CC_ROLLEN.find(function (r) { return r.id === ben.rolle; });
    if (!rolle) return false;
    // Admin hat immer alles
    if (ben.rolle === 'admin') return true;
    return (rolle.rechte || []).indexOf(recht) !== -1;
  }

  // ── Feature: Rollencheck ─────────────────────────────────────────────
  function hatRolle(rolleId, maId) {
    var id  = maId || (typeof MOB_MA_ID !== 'undefined' ? MOB_MA_ID : null);
    if (!id) return false;
    var ben = CC_BENUTZER.find(function (b) { return b.maId === id; });
    return !!(ben && ben.aktiv && ben.rolle === rolleId);
  }

  // ── Feature: Benutzer-Info ────────────────────────────────────────────
  function benutzerInfo(maId) {
    var id  = maId || (typeof MOB_MA_ID !== 'undefined' ? MOB_MA_ID : null);
    if (!id) return null;
    var ben   = CC_BENUTZER.find(function (b) { return b.maId === id; });
    if (!ben) return null;
    var rolle = CC_ROLLEN.find(function (r) { return r.id === ben.rolle; });
    return {
      maId:  ben.maId,
      name:  ben.name,
      av:    ben.av,
      col:   ben.col,
      rolle: rolle ? rolle.name : ben.rolle,
      aktiv: ben.aktiv,
    };
  }

  // ── Feature: Benutzer aktivieren / deaktivieren ───────────────────────
  function benutzerAktivieren(maId) {
    var ben = CC_BENUTZER.find(function (b) { return b.maId === maId; });
    if (!ben) return;
    ben.aktiv = true;
    saveBenutzer();
    if (typeof showToast === 'function') showToast('✓ Benutzer aktiviert: ' + ben.name);
  }

  function benutzerDeaktivieren(maId) {
    var ben = CC_BENUTZER.find(function (b) { return b.maId === maId; });
    if (!ben) return;
    ben.aktiv = false;
    saveBenutzer();
    if (typeof showToast === 'function') showToast('⊘ Benutzer deaktiviert: ' + ben.name);
  }

  // ── Feature: Rolle zuweisen ───────────────────────────────────────────
  function benutzerRolleSetzen(maId, rolleId) {
    var ben   = CC_BENUTZER.find(function (b) { return b.maId === maId; });
    var rolle = CC_ROLLEN.find(function (r) { return r.id === rolleId; });
    if (!ben || !rolle) return;
    ben.rolle = rolleId;
    saveBenutzer();
    if (typeof showToast === 'function') showToast('✓ Rolle gesetzt: ' + ben.name + ' → ' + rolle.name);
  }

  // ── UI: Elemente per Recht ein-/ausblenden ────────────────────────────
  // Verwendung: <button data-recht="auftraege.loeschen">Löschen</button>
  function _applyRechteUI() {
    var aktuellerMA = typeof MOB_MA_ID !== 'undefined' ? MOB_MA_ID : null;
    if (!aktuellerMA) return;

    document.querySelectorAll('[data-recht]').forEach(function (el) {
      var recht = el.getAttribute('data-recht');
      if (!recht) return;
      var ok = hatRecht(recht, aktuellerMA);
      el.style.display  = ok ? '' : 'none';
      el.disabled       = !ok;
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function init() {
    loadRollen();
    loadBenutzer();

    // goPage wrappen: nach jedem Seitenwechsel data-recht UI anwenden
    var _origGoPage = window.goPage;
    window.goPage = function (id) {
      var result = typeof _origGoPage === 'function' ? _origGoPage.apply(this, arguments) : undefined;
      setTimeout(_applyRechteUI, 80);
      return result;
    };

    setTimeout(_applyRechteUI, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 280); });
  } else {
    setTimeout(init, 280);
  }

  // ── Globaler Export ───────────────────────────────────────────────────
  // CC Cockpit kann über window.CC.Rollen / window.CC.Benutzer zugreifen
  if (!window.CC) window.CC = {};
  window.CC.Rollen   = CC_ROLLEN;
  window.CC.Benutzer = CC_BENUTZER;

  window.BenutzerService = {
    rollen:             CC_ROLLEN,
    benutzer:           CC_BENUTZER,
    hatRecht:           hatRecht,
    hatRolle:           hatRolle,
    benutzerInfo:       benutzerInfo,
    benutzerAktivieren: benutzerAktivieren,
    benutzerDeaktivieren: benutzerDeaktivieren,
    benutzerRolleSetzen:  benutzerRolleSetzen,
    saveRollen:         saveRollen,
    saveBenutzer:       saveBenutzer,
  };

  window.hatRecht              = hatRecht;
  window.hatRolle              = hatRolle;
  window.benutzerInfo          = benutzerInfo;
  window.benutzerAktivieren    = benutzerAktivieren;
  window.benutzerDeaktivieren  = benutzerDeaktivieren;
  window.benutzerRolleSetzen   = benutzerRolleSetzen;

  console.info('[CC] benutzer/index.js geladen — Rollen-Matrix + Rechtechecks + Benutzerregister');

})();
