// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/dashboard/index.js
// ─────────────────────────────────────────────────────────────────────
// Dashboard: alle Kennzahlen live aus den echten Datenarrays.
//
// Datenquellen (aus index.html):
//   ANGEBOTE / ANF_DATEN  — Angebote + Schnellanfragen
//   AUFTRAEGE             — Aufträge + Kanban
//   URLAUB_ANTRAEGE       — Urlaubsanträge
//   LAGER_CC              — Materiallager
//   MA_DATA               — Mitarbeiterstammdaten
//   MA_ANWESENHEIT        — Zeiterfassung
//
// IDs in index.html (pg-dashboard):
//   #db-stat-angebote         — Zahl offene Angebote
//   #db-stat-angebote-vol     — Volumen-Text
//   #db-stat-auftraege        — Zahl aktive Aufträge
//   #db-stat-auftraege-dringend — "X dringend"
//   #db-stat-dringend         — Zahl Produktion dringend
//   #db-stat-dringend-info    — Info-Text
//   #db-stat-urlaub           — Zahl offene Urlaubsanträge
//   #db-stat-urlaub-info      — Info-Text
//   #db-auftraege-tbody       — Letzte 5 Aufträge
//   #db-angebote-tbody        — Offene Angebote (max 5)
//   #db-team-heute            — MA-Avatare + aktuelle Aufgabe
//   #db-urlaub-liste          — Anträge offen/genehmigt
// ══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Helfer: Schritt-Label & Badge-Klasse ─────────────────────────────
  var STEP_BADGE = {
    grafik:       { cls: 'bp', label: 'Grafik' },
    druck:        { cls: 'bp', label: 'Druck' },
    laminat:      { cls: 'bt', label: 'Laminat' },
    montage:      { cls: 'bb', label: 'Montage' },
    doku:         { cls: 'bg', label: 'Doku' },
    abgeschlossen:{ cls: 'bg', label: 'Fertig' },
  };

  function _stepBadge(step) {
    var s = STEP_BADGE[step] || { cls: 'ba', label: step || '—' };
    return '<span class="bdg ' + s.cls + '">' + s.label + '</span>';
  }

  function _statusBadge(a) {
    if (a.step === 'abgeschlossen') return '<span class="bdg bg">Fertig</span>';
    if (a.urgent)                   return '<span class="bdg br">Dringend</span>';
    return '<span class="bdg ba">In Arbeit</span>';
  }

  function _fmtEuro(n) {
    if (!n || isNaN(n)) return '—';
    return '€ ' + Number(n).toLocaleString('de-DE');
  }

  function _fmtDatum(str) {
    if (!str) return '—';
    try {
      var d = new Date(str);
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return str; }
  }

  function _dashboardMaMatchesSchritt(uid, kuerzel, sch) {
    if (!sch || !uid) return false;
    function eq(x, y) {
      return (
        x != null &&
        y != null &&
        String(x).trim() !== '' &&
        String(x).trim() === String(y).trim()
      );
    }
    var ids = [];
    if (sch.maId != null) ids.push(String(sch.maId).trim());
    if (sch.verantwortlicher != null) ids.push(String(sch.verantwortlicher).trim());
    if (sch.werId != null) ids.push(String(sch.werId).trim());
    if (Array.isArray(sch.maIds)) {
      sch.maIds.forEach(function (x) {
        if (x != null) ids.push(String(x).trim());
      });
    }
    if (Array.isArray(sch.teamMaIds)) {
      sch.teamMaIds.forEach(function (x) {
        if (x != null) ids.push(String(x).trim());
      });
    }
    if (Array.isArray(sch.zusatzMa)) {
      sch.zusatzMa.forEach(function (x) {
        if (x != null) ids.push(String(x).trim());
      });
    }
    var ku = kuerzel != null ? String(kuerzel).trim() : '';
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!id) continue;
      if (eq(id, uid)) return true;
      if (ku && (eq(id, ku) || id.toUpperCase() === ku.toUpperCase())) return true;
    }
    return false;
  }

  /**
   * @param {string} uid
   * @param {string} kuerzel
   * @param {unknown[]} arr
   * @returns {string|null}
   */
  function _dashboardWorkflowZeileFuerMa(uid, kuerzel, arr) {
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i];
      if (!a || String(a.step || '').trim() === 'abgeschlossen') continue;
      var st = String(a.step || '').trim();
      if (!st) continue;
      var sch = a.schritte && typeof a.schritte === 'object' ? a.schritte[st] : null;
      if (!sch) continue;
      if (sch.fertig === true || String(sch.status || '').trim() === 'abgeschlossen') continue;
      if (!_dashboardMaMatchesSchritt(uid, kuerzel, sch)) continue;
      var lb = STEP_BADGE[st] ? STEP_BADGE[st].label : st;
      var aid = a.id != null ? String(a.id) : '—';
      var kd = a.kunde != null ? String(a.kunde) : '—';
      return lb + ' · ' + aid + ' · ' + kd.replace(/</g, '&lt;');
    }
    return null;
  }

  // ── renderDashboard ───────────────────────────────────────────────────
  function renderDashboard() {
    /** Nur die Dashboard-Seite — keine globalen getElementById, keine Updates wenn andere .pg aktiv (Cockpit). */
    var host = document.querySelector('.cc-intern-root') || document.body;
    var root = host.querySelector('#pg-dashboard');
    if (!root) return;
    if (!root.classList.contains('active')) return;

    function _txt(id, val) {
      var el = root.querySelector('#' + id);
      if (el) el.textContent = val;
    }

    // ── 1. Angebote-Stat ─────────────────────────────────────────────
    var angebote = typeof ANGEBOTE !== 'undefined' ? ANGEBOTE : [];
    var offeneAng = angebote.filter(function (a) {
      return a.status !== 'Gewonnen' && a.status !== 'Verloren' && a.status !== 'Archiviert';
    });
    var volumen = offeneAng.reduce(function (s, a) {
      return s + (parseFloat(a.gesamt || a.wert || a.betrag || 0) || 0);
    }, 0);
    _txt('db-stat-angebote', offeneAng.length);
    _txt('db-stat-angebote-vol', volumen > 0 ? _fmtEuro(volumen) + ' Volumen' : '—');

    // ── 2. Aufträge-Stat ─────────────────────────────────────────────
    var auftraege = typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE : [];
    var aktiveAuf = auftraege.filter(function (a) { return a.step !== 'abgeschlossen' && !a.archiv; });
    var dringendAuf = aktiveAuf.filter(function (a) { return a.urgent; });
    _txt('db-stat-auftraege', aktiveAuf.length);
    _txt('db-stat-auftraege-dringend', dringendAuf.length > 0 ? dringendAuf.length + ' dringend' : 'Kein dringend');

    // ── 3. Produktion dringend ───────────────────────────────────────
    var heute    = new Date().toISOString().slice(0, 10);
    var dringend = aktiveAuf.filter(function (a) { return a.urgent || (a.lieferdatum && a.lieferdatum <= heute); });
    _txt('db-stat-dringend', dringend.length || 0);

    // ── 4. Urlaub-Stat ───────────────────────────────────────────────
    var urlaub = typeof URLAUB_ANTRAEGE !== 'undefined' ? URLAUB_ANTRAEGE : [];
    var offeneUrl = urlaub.filter(function (a) { return a.status === 'offen'; });
    _txt('db-stat-urlaub', offeneUrl.length);
    _txt('db-stat-urlaub-info', offeneUrl.length > 0
      ? offeneUrl.length + ' warten auf Genehmigung'
      : 'Alle genehmigt ✓');

    // ── 5. Aufträge-Tabelle (letzte 5 aktive) ───────────────────────
    var tbody = root.querySelector('#db-auftraege-tbody');
    if (tbody) {
      if (!aktiveAuf.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:16px;font-size:12px;">Keine aktiven Aufträge</td></tr>';
      } else {
        var letzten5 = aktiveAuf.slice(-5).reverse();
        tbody.innerHTML = letzten5.map(function (a) {
          var sub = a.fahrzeug || a.projekt || '';
          return '<tr onclick="openAuftragDetail(\'' + a.id + '\')" style="cursor:pointer;">'
            + '<td><div class="tm">' + (a.id || '—') + '</div>'
            + (sub ? '<div class="ts">' + sub + '</div>' : '')
            + '</td>'
            + '<td>' + (a.kunde || '—') + '</td>'
            + '<td>' + _stepBadge(a.step) + '</td>'
            + '<td>' + _statusBadge(a) + '</td>'
            + '<td>' + (a.lieferdatum ? _fmtDatum(a.lieferdatum) : (a.termin || '—')) + '</td>'
            + '</tr>';
        }).join('');
      }
    }

    // ── 6. Angebote-Tabelle (offen, max 5) ──────────────────────────
    var atbody = root.querySelector('#db-angebote-tbody');
    if (atbody) {
      if (!offeneAng.length) {
        atbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px;font-size:12px;">Keine offenen Angebote</td></tr>';
      } else {
        atbody.innerHTML = offeneAng.slice(0, 5).map(function (a) {
          var wert = parseFloat(a.gesamt || a.wert || a.betrag || 0) || 0;
          var col  = a.status === 'Angenommen' ? 'var(--green)' : 'var(--blue)';
          return '<tr>'
            + '<td class="tm">' + (a.id || a.angebotId || '—') + '</td>'
            + '<td>' + (a.kunde || a.kundeName || '—') + '</td>'
            + '<td style="font-weight:600;color:' + col + '">' + (wert > 0 ? _fmtEuro(wert) : '—') + '</td>'
            + '<td><span class="bdg ba">' + (a.status || '—') + '</span></td>'
            + '</tr>';
        }).join('');
      }
    }

    // ── 7. Team heute ────────────────────────────────────────────────
    var teamEl = root.querySelector('#db-team-heute');
    if (teamEl) {
      var ma = typeof MA_DATA !== 'undefined' ? MA_DATA : [];
      if (!ma.length) {
        teamEl.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px;">Keine Mitarbeiter</div>';
      } else {
        // Team: zuerst AUFTRAEGE-Workflow (aktueller Schritt), sonst INTERN_AUFGABEN
        var aufgaben = typeof INTERN_AUFGABEN !== 'undefined' ? INTERN_AUFGABEN : [];
        var wfPool = auftraege.filter(function (a) {
          return a && String(a.step || '').trim() !== 'abgeschlossen';
        });
        teamEl.innerHTML = ma.map(function (m) {
          var uid = (m.id != null && String(m.id).trim() !== '') ? String(m.id).trim() : String(m.maId || '').trim();
          var ku = m.k != null ? String(m.k).trim() : '';
          var wfLine = _dashboardWorkflowZeileFuerMa(uid, ku, wfPool);
          var meineAufg = aufgaben.filter(function (g) {
            return uid && (g.maId === uid || (g.maIds && g.maIds.indexOf(uid) !== -1))
              && g.status !== 'fertig';
          });
          var aufgText = wfLine
            ? wfLine
            : meineAufg.length > 0
              ? (meineAufg[0].titel || meineAufg[0].schritt || 'Aufgabe offen')
              : '<span style="color:var(--green)">✓ Keine offenen Aufgaben</span>';
          return '<div style="display:flex;align-items:center;gap:10px;">'
            + '<div style="width:30px;height:30px;border-radius:50%;background:' + (m.col || '#888') + ';'
            + 'display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0;">'
            + (m.av || m.maId) + '</div>'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="font-size:12px;font-weight:600;">' + m.n
            + ' <span style="color:var(--text2);font-weight:400;">· ' + (m.r || '') + '</span></div>'
            + '<div style="font-size:11px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
            + aufgText + '</div>'
            + '</div></div>';
        }).join('');
      }
    }

    // ── 8. Urlaub & Abwesenheit ──────────────────────────────────────
    var urlEl = root.querySelector('#db-urlaub-liste');
    if (urlEl) {
      var relevant = urlaub.filter(function (a) {
        return a.status === 'offen' || a.status === 'genehmigt';
      }).slice(0, 5);

      if (!relevant.length) {
        urlEl.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px;">Keine Anträge vorhanden</div>';
      } else {
        urlEl.innerHTML = relevant.map(function (a) {
          var isOffen = a.status === 'offen';
          var bg    = isOffen ? 'var(--amber-l)' : 'var(--green-l)';
          var col   = isOffen ? 'var(--amber)'   : 'var(--green)';
          var datum = a.typ === 'Überstunden'
            ? (a.stunden || '—') + ' Std.'
            : (a.von && a.bis ? _fmtDatum(a.von) + ' – ' + _fmtDatum(a.bis) : '—');
          return '<div style="background:' + bg + ';border-radius:8px;padding:10px 12px;'
            + 'display:flex;justify-content:space-between;align-items:center;">'
            + '<span style="font-size:12px;font-weight:600;color:' + col + ';">'
            + (a.ma || a.maId) + ' · ' + (a.typ || 'Urlaub')
            + (isOffen ? ' <span style="font-weight:400;font-size:10px;">(offen)</span>' : '')
            + '</span>'
            + '<span style="font-size:11px;color:var(--text2);">' + datum + '</span>'
            + '</div>';
        }).join('');
      }
    }
  }

  // ── Wraps installieren ────────────────────────────────────────────────
  function _installWraps() {
    // goPage('dashboard') → renderDashboard
    var _origGoPage = window.goPage;
    window.goPage = function (id) {
      var result = typeof _origGoPage === 'function' ? _origGoPage.apply(this, arguments) : undefined;
      if (id === 'dashboard') {
        setTimeout(renderDashboard, 60);
      }
      return result;
    };

    // saveAuftraege wrappen → Dashboard im Hintergrund aktualisieren
    var _origSaveAuf = window.saveAuftraege;
    if (typeof _origSaveAuf === 'function') {
      window.saveAuftraege = function () {
        var r = _origSaveAuf.apply(this, arguments);
        var dash = document.querySelector('.cc-intern-root #pg-dashboard') || document.getElementById('pg-dashboard');
        if (dash && dash.classList.contains('active')) {
          setTimeout(renderDashboard, 150);
        }
        return r;
      };
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function init() {
    _installWraps();
    // Beim ersten Laden Dashboard befüllen (Seite ist direkt aktiv)
    setTimeout(renderDashboard, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 200); });
  } else {
    setTimeout(init, 200);
  }

  // ── Globaler Export ───────────────────────────────────────────────────
  window.renderDashboard   = renderDashboard;
  window.DashboardService  = { render: renderDashboard };

  console.info('[CC] dashboard/index.js geladen — Live-Stats + Aufträge + Angebote + Team + Urlaub');

})();
