// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/auftraege/kommunikation.js
// ─────────────────────────────────────────────────────────────────────
// Erweitert renderChatBereich (index.html) via function-wrapping.
// Kein Ersetzen — Ergebnis ist rückwärtskompatibel.
//
// Neue Features:
//   1. Chat-Filter: Alle / Nur Fragen / Offene Fragen
//   2. Zitieren: Text einer Nachricht in Eingabefeld übernehmen
//   3. Nachricht löschen (mit Bestätigung)
//   4. Ungelesen-Badge: offene Fragen werden hervorgehoben
//   5. Lesebestätigung: letzte Nachricht + Zeitstempel
// ══════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Chat-Filter Zustand ─────────────────────────────────────────────
  window._chatFilter = {};

  // ── renderChatBereich wird in _installWraps() gewrappt ──────────────
  // (nach DOMContentLoaded, damit function-Declaration nicht überschreibt)
  function _installWraps() {
    var _origRender = window.renderChatBereich;
    window.renderChatBereich = function(auftragId, containerId) {
      if (typeof _origRender === 'function') _origRender(auftragId, containerId);
      var el = document.getElementById(containerId);
      if (!el) return;
      _enhanceChat(auftragId, el);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _installWraps);
  } else {
    _installWraps();
  }

  // ── Chat-DOM nach Original-Render erweitern ─────────────────────────
  function _enhanceChat(auftragId, el) {
    var a = _findAuftrag(auftragId);
    if (!a) return;

    var kommentare = a.kommentare || [];
    var chatWrap   = document.getElementById('chat-wrap-' + auftragId);
    var inpEl      = document.getElementById('chat-inp-' + auftragId);
    if (!chatWrap || !inpEl) return;

    // ── Filter-Tabs über dem Chat einfügen (einmalig) ──────────────
    var header = el.querySelector('[style*="KOMMUNIKATION"]');
    if (header && !header.querySelector('.cc-chat-filters')) {
      var offenFragen = kommentare.filter(function(k) { return k.istFrage && !k.beantwortet; }).length;
      var filterBar = document.createElement('div');
      filterBar.className = 'cc-chat-filters';
      filterBar.style.cssText = 'display:flex;gap:4px;padding:6px 10px;background:#F0F4F8;border-bottom:1px solid var(--border);';

      var curFilter = window._chatFilter[auftragId] || 'alle';
      filterBar.innerHTML =
        _ftab(auftragId, 'alle',    '💬 Alle ' + kommentare.length, curFilter === 'alle')
        + _ftab(auftragId, 'fragen', '❓ Fragen', curFilter === 'fragen')
        + (offenFragen > 0
            ? _ftab(auftragId, 'offen', '⚠ Offen (' + offenFragen + ')', curFilter === 'offen', true)
            : '');

      header.insertAdjacentElement('afterend', filterBar);
    }

    // ── Filter anwenden: Nachrichten-Rows ein-/ausblenden ───────────
    _applyFilter(auftragId, chatWrap);

    // ── "Zitieren"-Button zu jeder Nachricht hinzufügen ─────────────
    _addQuoteButtons(auftragId, chatWrap, inpEl);

    // ── Löschen-Button hinzufügen ────────────────────────────────────
    _addDeleteButtons(auftragId, chatWrap, kommentare);
  }

  function _ftab(auftragId, val, lbl, active, warn) {
    var bg  = warn  ? (active ? '#E65100' : '#FFF3E0') : (active ? 'var(--blue)' : 'var(--gray-l)');
    var col = warn  ? (active ? '#fff'    : '#E65100') : (active ? '#fff'        : 'var(--text2)');
    return '<button id="ccht-f-' + auftragId + '-' + val + '" '
      + 'onclick="AuftragKommunikation.setFilter(\'' + auftragId + '\',\'' + val + '\')" '
      + 'style="font-size:10px;padding:3px 9px;border:1px solid var(--border);border-radius:5px;'
      + 'background:' + bg + ';color:' + col + ';cursor:pointer;font-weight:600;white-space:nowrap;">'
      + lbl + '</button>';
  }

  // ── Filter auf Chat-Rows anwenden ────────────────────────────────────
  function _applyFilter(auftragId, chatWrap) {
    var filter    = window._chatFilter[auftragId] || 'alle';
    var a         = _findAuftrag(auftragId);
    var kommentare = (a && a.kommentare) || [];
    var rows      = chatWrap.querySelectorAll('.chat-msg-row');

    rows.forEach(function(row, i) {
      var k = kommentare[i]; // Reihenfolge entspricht DOM-Reihenfolge
      if (!k) { row.style.display = ''; return; }
      var show = filter === 'alle'   ? true
               : filter === 'fragen' ? !!k.istFrage
               : filter === 'offen'  ? (k.istFrage && !k.beantwortet)
               : true;
      row.style.display = show ? '' : 'none';
    });
  }

  // ── Zitieren-Buttons ─────────────────────────────────────────────────
  function _addQuoteButtons(auftragId, chatWrap, inpEl) {
    var rows = chatWrap.querySelectorAll('.chat-msg-row');
    rows.forEach(function(row, i) {
      if (row.querySelector('.cc-chat-quote-btn')) return; // schon vorhanden
      var bubble = row.querySelector('.chat-bubble');
      if (!bubble) return;

      var btn = document.createElement('button');
      btn.className = 'cc-chat-quote-btn';
      btn.title = 'Zitieren';
      btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;'
        + 'color:var(--text3);padding:1px 4px;opacity:0;transition:opacity .15s;margin-left:4px;';
      btn.textContent = '↩';
      btn.dataset.idx = i;

      btn.addEventListener('click', function() {
        zitieren(auftragId, parseInt(this.dataset.idx), inpEl);
      });

      bubble.style.position = 'relative';
      bubble.appendChild(btn);

      // Hover-Sichtbarkeit
      row.addEventListener('mouseenter', function() { btn.style.opacity = '1'; });
      row.addEventListener('mouseleave', function() { btn.style.opacity = '0'; });
    });
  }

  // ── Löschen-Buttons ──────────────────────────────────────────────────
  function _addDeleteButtons(auftragId, chatWrap, kommentare) {
    var ichName  = typeof ccAktivMA === 'function' ? ccAktivMA().name : '';
    var rows     = chatWrap.querySelectorAll('.chat-msg-row');

    rows.forEach(function(row, i) {
      if (row.querySelector('.cc-chat-del-btn')) return;
      var k = kommentare[i];
      // Nur eigene Nachrichten löschen
      if (!k || (k.autor || k.von) !== ichName) return;

      var bubble = row.querySelector('.chat-bubble');
      if (!bubble) return;

      var btn = document.createElement('button');
      btn.className = 'cc-chat-del-btn';
      btn.title = 'Nachricht löschen';
      btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;'
        + 'color:#FF3B30;padding:1px 4px;opacity:0;transition:opacity .15s;';
      btn.textContent = '🗑';
      btn.dataset.idx = i;

      btn.addEventListener('click', function() {
        loeschen(auftragId, parseInt(this.dataset.idx));
      });

      bubble.appendChild(btn);
      row.addEventListener('mouseenter', function() { btn.style.opacity = '1'; });
      row.addEventListener('mouseleave', function() { btn.style.opacity = '0'; });
    });
  }

  // ── Öffentliche Funktionen ───────────────────────────────────────────

  function setFilter(auftragId, typ) {
    window._chatFilter[auftragId] = typ;

    // Tab-Styles updaten
    ['alle', 'fragen', 'offen'].forEach(function(v) {
      var btn = document.getElementById('ccht-f-' + auftragId + '-' + v);
      if (!btn) return;
      var active = v === typ;
      var isWarn = v === 'offen';
      btn.style.background = isWarn ? (active ? '#E65100' : '#FFF3E0') : (active ? 'var(--blue)' : 'var(--gray-l)');
      btn.style.color      = isWarn ? (active ? '#fff'    : '#E65100') : (active ? '#fff'        : 'var(--text2)');
    });

    // Filter anwenden ohne Re-Render
    var chatWrap = document.getElementById('chat-wrap-' + auftragId);
    if (chatWrap) _applyFilter(auftragId, chatWrap);
  }

  function zitieren(auftragId, idx, inpEl) {
    var a = _findAuftrag(auftragId);
    if (!a || !a.kommentare || !a.kommentare[idx]) return;
    var k = a.kommentare[idx];
    var quotedText = '↩ ' + (k.autor || k.von || 'MA') + ': "' + k.text.substring(0, 60) + (k.text.length > 60 ? '…' : '') + '" — ';
    if (inpEl) {
      inpEl.value = quotedText;
      inpEl.focus();
      inpEl.setSelectionRange(inpEl.value.length, inpEl.value.length);
    }
  }

  function loeschen(auftragId, idx) {
    var a = _findAuftrag(auftragId);
    if (!a || !a.kommentare || !a.kommentare[idx]) return;
    var k = a.kommentare[idx];
    if (!confirm('Nachricht löschen?\n"' + k.text.substring(0, 80) + '"')) return;

    a.kommentare.splice(idx, 1);
    _save();

    // Chat neu rendern
    ['chat-container-' + auftragId, 'mob-chat-container-' + auftragId].forEach(function(cid) {
      if (document.getElementById(cid)) {
        window.renderChatBereich(auftragId, cid);
      }
    });
  }

  // ── Hilfsfunktionen ──────────────────────────────────────────────────
  function _findAuftrag(id) {
    return (typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE : []).find(function(x) { return x.id === id; }) || null;
  }
  function _save() {
    if (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService) {
      window.CCIntern.DataService.save('cc_intern_auftraege_v1', AUFTRAEGE);
    } else if (typeof saveAuftraege === 'function') {
      saveAuftraege();
    }
  }

  // Globaler Namespace
  window.AuftragKommunikation = {
    setFilter: setFilter,
    zitieren:  zitieren,
    loeschen:  loeschen,
  };

  console.info('[CC] auftraege/kommunikation.js geladen — Filter + Zitieren + Löschen');

})();
