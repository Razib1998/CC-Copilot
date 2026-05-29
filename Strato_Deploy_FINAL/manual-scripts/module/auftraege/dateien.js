// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/auftraege/dateien.js
// ─────────────────────────────────────────────────────────────────────
// Erweiterung für Datei-Management pro Auftrag.
// Basis: prodAddDatei, detailFotoUpload, ccDeleteUpload in index.html.
//
// Neue Features:
//   1. Drag & Drop Upload-Zone im Auftragsdetail
//   2. Dateienliste nach Typ filtern (Alle / Bilder / PDFs / Sonstiges)
//   3. Datei umbenennen (rename inline)
//   4. Hooks in auftragDetailModuleInit
// ══════════════════════════════════════════════════════════════════════

window.AuftragDateien = (function() {
  'use strict';

  // ── Drag & Drop für Upload-Zone initialisieren ──────────────────────
  function initDragDrop(auftragId) {
    // Wird nach openAuftragDetail aufgerufen — DOM ist bereit
    var zone = document.getElementById('dp-files-zone-' + auftragId);
    if (!zone) return;

    // Drag-Overlay einfügen falls noch nicht vorhanden
    if (zone.querySelector('.ddrop-overlay')) return;

    var overlay = document.createElement('div');
    overlay.className = 'ddrop-overlay';
    overlay.style.cssText = [
      'display:none',
      'position:absolute',
      'inset:0',
      'border-radius:8px',
      'border:2.5px dashed var(--blue)',
      'background:rgba(0,122,255,.08)',
      'z-index:10',
      'align-items:center',
      'justify-content:center',
      'font-size:15px',
      'font-weight:700',
      'color:var(--blue)',
      'pointer-events:none',
    ].join(';');
    overlay.innerHTML = '📂 Datei hier ablegen';

    // Zone braucht relative Positionierung
    if (getComputedStyle(zone).position === 'static') {
      zone.style.position = 'relative';
    }
    zone.appendChild(overlay);

    // ── Event-Listener ──────────────────────────────────────────────
    var _counter = 0; // verhindert Flackern durch Kind-Elemente

    zone.addEventListener('dragenter', function(e) {
      e.preventDefault();
      _counter++;
      overlay.style.display = 'flex';
      zone.style.boxShadow  = '0 0 0 3px rgba(0,122,255,.25)';
    });

    zone.addEventListener('dragleave', function(e) {
      _counter--;
      if (_counter <= 0) {
        _counter = 0;
        overlay.style.display = 'none';
        zone.style.boxShadow  = '';
      }
    });

    zone.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    zone.addEventListener('drop', function(e) {
      e.preventDefault();
      _counter = 0;
      overlay.style.display = 'none';
      zone.style.boxShadow  = '';

      var allFiles = Array.from(e.dataTransfer.files || []);
      if (!allFiles.length) return;

      // Bilder → detailFotoUpload (komprimiert + speichert dataUrl)
      // Sonstiges → prodAddDatei (speichert Metadaten)
      var imgFiles   = allFiles.filter(function(f) { return f.type.startsWith('image/'); });
      var otherFiles = allFiles.filter(function(f) { return !f.type.startsWith('image/'); });

      if (imgFiles.length && typeof detailFotoUpload === 'function') {
        detailFotoUpload(auftragId, { target: { files: imgFiles } });
      }
      if (otherFiles.length && typeof prodAddDatei === 'function') {
        prodAddDatei(auftragId, { target: { files: otherFiles } });
      }
    });

    // ── Filter-Tabs über der Dateiliste einbauen ──────────────────
    _injectFilterTabs(auftragId, zone);
  }

  // ── Filter-Tabs: Alle / Bilder / PDF / Sonstiges ────────────────────
  function _injectFilterTabs(auftragId, zone) {
    if (zone.querySelector('.ccdat-filter-tabs')) return;

    var tabBar = document.createElement('div');
    tabBar.className = 'ccdat-filter-tabs';
    tabBar.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;';
    tabBar.innerHTML = _tab(auftragId, 'alle', '📋 Alle', true)
      + _tab(auftragId, 'bilder', '🖼 Bilder', false)
      + _tab(auftragId, 'pdf',    '📄 PDF',    false)
      + _tab(auftragId, 'sonst',  '📎 Sonstiges', false);

    // Tabs VOR der Dateiliste einfügen (die erste div.border ist die Tabelle oder Leer-Meldung)
    var firstChild = zone.querySelector('div[style*="grid-template-columns"], div[style*="border-radius:8px"]');
    if (firstChild) {
      zone.insertBefore(tabBar, firstChild);
    } else {
      zone.insertBefore(tabBar, zone.firstChild);
    }
  }

  function _tab(aid, val, lbl, active) {
    var bg  = active ? 'var(--blue)' : 'var(--gray-l)';
    var col = active ? '#fff'        : 'var(--text2)';
    return '<button id="ccdat-tab-' + aid + '-' + val + '" '
      + 'onclick="AuftragDateien.setFilter(\'' + aid + '\',\'' + val + '\')" '
      + 'style="font-size:10px;padding:3px 10px;border:1px solid var(--border);border-radius:6px;'
      + 'background:' + bg + ';color:' + col + ';cursor:pointer;font-weight:600;transition:background .12s;">'
      + lbl + '</button>';
  }

  // ── Filter anwenden: Zeilen ein-/ausblenden ─────────────────────────
  function setFilter(auftragId, typ) {
    window._ccDateiFilter = window._ccDateiFilter || {};
    window._ccDateiFilter[auftragId] = typ;

    // Tabs updaten
    ['alle', 'bilder', 'pdf', 'sonst'].forEach(function(v) {
      var btn = document.getElementById('ccdat-tab-' + auftragId + '-' + v);
      if (!btn) return;
      var active = v === typ;
      btn.style.background = active ? 'var(--blue)' : 'var(--gray-l)';
      btn.style.color      = active ? '#fff'        : 'var(--text2)';
    });

    // Dateirows ein-/ausblenden (grid-rows in der Dateiliste)
    var zone = document.getElementById('dp-files-zone-' + auftragId);
    if (!zone) return;

    // Tabellenzeilen: alle div.children ab dem Wrapper
    var listWrap = zone.querySelector('[style*="border:1px solid var(--border);border-radius:0 0 8px 8px"]');
    if (!listWrap) return;

    Array.prototype.forEach.call(listWrap.children, function(row) {
      if (typ === 'alle') {
        row.style.display = '';
        return;
      }
      // Typ ermitteln: Dateiname aus dem Title-Attribut oder dem ersten span-text
      var nameEl = row.querySelector('div[title]');
      var name   = nameEl ? nameEl.getAttribute('title').toLowerCase() : '';
      var mime   = ''; // nicht direkt zugänglich — verwende Extension
      var ext    = name.split('.').pop();
      var isImg  = ['jpg','jpeg','png','gif','webp','svg','bmp','tiff'].indexOf(ext) >= 0;
      var isPdf  = ext === 'pdf';

      var show = typ === 'bilder' ? isImg
               : typ === 'pdf'    ? isPdf
               : /* sonst */       !isImg && !isPdf;

      row.style.display = show ? '' : 'none';
    });
  }

  // ── Datei umbenennen (inline rename) ───────────────────────────────
  function renameInline(auftragId, src, idx, currentName) {
    if (typeof ccInternPromptText !== 'function') return;
    ccInternPromptText('Datei umbenennen', 'Neuer Dateiname', currentName, function(name) {
    if (!name || name.trim() === currentName) return;
    var a = (typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE : []).find(function(x) { return x.id === auftragId; });
    if (!a) return;

    if (src === 'a' && a.dateien && a.dateien[idx]) {
      a.dateien[idx].name = name.trim();
    } else if (src === 'p' && a.prod && a.prod.dateien && a.prod.dateien[idx]) {
      a.prod.dateien[idx].name = name.trim();
    }

    _save();
    if (typeof openAuftragDetail === 'function') openAuftragDetail(auftragId);
    });
  }

  function _save() {
    if (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService) {
      window.CCIntern.DataService.save('cc_intern_auftraege_v1', AUFTRAEGE);
    } else if (typeof saveAuftraege === 'function') {
      saveAuftraege();
    }
  }

  // ── auftragDetailModuleInit Hook — nach DOMContentLoaded registrieren ─
  // (Erst nach DOMContentLoaded, damit function-Declarations aus Inline-Script
  //  nicht den Hook überschreiben)
  function _installHook() {
    var _prev = window.auftragDetailModuleInit;
    window.auftragDetailModuleInit = function(id) {
      if (typeof _prev === 'function') _prev(id);
      setTimeout(function() { initDragDrop(id); }, 30);
    };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _installHook);
  } else {
    _installHook();
  }

  // Globale Shortcuts für onclick-Handler
  window.AuftragDateien = {
    initDragDrop: initDragDrop,
    setFilter:    setFilter,
    renameInline: renameInline,
  };

  console.info('[CC] auftraege/dateien.js geladen — Drag & Drop + Filter');

  return window.AuftragDateien;
})();
