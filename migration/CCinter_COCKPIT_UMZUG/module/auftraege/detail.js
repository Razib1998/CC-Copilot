// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/auftraege/detail.js
// ─────────────────────────────────────────────────────────────────────
// Erweiterungsblock für openAuftragDetail (index.html).
// Dieses File ergänzt NEUE Funktionalität — die bestehende Funktion
// in index.html wird NICHT angefasst (kein Breaking Change).
//
// Enthält:
//   renderAbnahmeBlock(a)          → HTML-String für Abnahme-Sektion
//   abnahmeBestaetigen(id)         → Abnahme final bestätigen
//   abnahmeFotoUpload(id, event)   → Fotos zur Abnahme hochladen
//   abnahmeFieldSave(input)        → Einzelfeld in a.abnahme speichern
//   abnahmeNotizSave(id, val)      → Abnahme-Notiz speichern
// ══════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────
// Datenmodell-Init (wird von renderAbnahmeBlock aufgerufen)
// a.abnahme = {
//   status  : 'offen' | 'fotos_ok' | 'abgenommen',
//   kontakt : '',    // Ansprechpartner beim Kunden
//   datum   : '',    // ISO-Datum der Abnahme
//   notiz   : '',    // Freitext
//   fotos   : []     // [{name, dataUrl, mimeType, size, ts}]
// }
// ─────────────────────────────────────────────────────────────────────

// ── Abnahme-Block HTML generieren ────────────────────────────────────
function renderAbnahmeBlock(a) {
  // Nur für doku- und abgeschlossen-Aufträge relevant, aber wir zeigen
  // den Block immer — zugeklappt wenn nicht doku/abgeschlossen.
  var isDoku = (a.step === 'doku' || a.step === 'abgeschlossen');

  // Datenmodell sicherstellen (non-destructive)
  if (!a.abnahme) a.abnahme = {};
  var ab = a.abnahme;
  if (!ab.status)  ab.status  = 'offen';
  if (!ab.fotos)   ab.fotos   = [];
  if (!ab.kontakt) ab.kontakt = '';
  if (!ab.datum)   ab.datum   = '';
  if (!ab.notiz)   ab.notiz   = '';

  // Status-Badge
  var statusCfg = {
    'offen':      { lbl: '– Offen',           bg: 'var(--gray-l)',  tc: 'var(--text3)' },
    'fotos_ok':   { lbl: '📷 Fotos vorhanden', bg: '#FFF8E1',        tc: '#E65100' },
    'abgenommen': { lbl: '✅ Abgenommen',       bg: '#E8F5E9',        tc: '#2E7D32' },
  };
  var sc = statusCfg[ab.status] || statusCfg['offen'];

  // Fotos-Gallery
  var fotosHTML = '';
  if (ab.fotos.length) {
    fotosHTML = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">';
    ab.fotos.forEach(function(f, fi) {
      var dk = 'abn_' + a.id + '_' + fi;
      if (!window._dpDateien) window._dpDateien = {};
      window._dpDateien[dk] = { url: f.dataUrl || '', name: f.name || ('Abnahme-Foto ' + (fi + 1)) };
      if (f.dataUrl) {
        fotosHTML += '<div style="position:relative;">'
          + '<img src="' + f.dataUrl + '" data-dk="' + dk + '" '
          + 'onclick="(function(k){var d=window._dpDateien[k];if(d&&d.url)ccLightbox(d.url,d.name);})(this.dataset.dk)" '
          + 'style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid var(--border);cursor:zoom-in;display:block;">'
          + '<button onclick="abnahmeFotoLoeschen(\'' + a.id + '\',' + fi + ')" '
          + 'style="position:absolute;top:-5px;right:-5px;background:#FF3B30;color:#fff;border:none;border-radius:50%;'
          + 'width:18px;height:18px;font-size:11px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>'
          + '</div>';
      }
    });
    fotosHTML += '</div>';
  } else {
    fotosHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Noch keine Abnahme-Fotos hochgeladen</div>';
  }

  // Datums-Formatierung für Anzeige
  var datumFmt = ab.datum
    ? ab.datum.substring(0, 10).split('-').reverse().join('.')
    : '';

  // Abnahme bestätigen — Button nur wenn nicht schon abgenommen
  var btnBestaetigen = ab.status !== 'abgenommen'
    ? '<button onclick="abnahmeBestaetigen(\'' + a.id + '\')" '
      + 'style="padding:8px 18px;background:#2E7D32;color:#fff;border:none;border-radius:8px;'
      + 'font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">'
      + '✅ Abnahme bestätigen</button>'
    : '<div style="padding:8px 14px;background:#E8F5E9;border-radius:8px;font-size:13px;'
      + 'font-weight:700;color:#2E7D32;display:inline-flex;align-items:center;gap:6px;">'
      + '✅ Abnahme bestätigt' + (datumFmt ? ' · ' + datumFmt : '') + '</div>';

  // Akkordeon — offen wenn doku/abgeschlossen, sonst zugeklappt
  var isOpen = isDoku;
  var bodyStyle = isOpen ? '' : 'display:none;';

  return '<div class="dp-section" style="background:' + (ab.status === 'abgenommen' ? '#F0FBF0' : '#FFF') + ';">'

    // ── Header mit Toggle ──────────────────────────────────────
    + '<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;" '
    + 'onclick="(function(btn){var b=document.getElementById(\'dp-abn-body-' + a.id + '\');'
    + 'var open=b.style.display!==\'none\';b.style.display=open?\'none\':\'block\';'
    + 'btn.querySelector(\'span\').style.transform=open?\'rotate(0deg)\':\'rotate(180deg)\';})(this)">'
      + '<div style="display:flex;align-items:center;gap:8px;">'
        + '<div class="dp-slbl" style="margin-bottom:0;">📋 Abnahme & Dokumentation</div>'
        + '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;'
        + 'background:' + sc.bg + ';color:' + sc.tc + ';">' + sc.lbl + '</span>'
      + '</div>'
      + '<button style="background:none;border:none;cursor:pointer;padding:0 4px;pointer-events:none;">'
        + '<span style="font-size:13px;color:var(--text3);display:inline-block;'
        + 'transform:rotate(' + (isOpen ? '180' : '0') + 'deg);transition:transform .22s;">▼</span>'
      + '</button>'
    + '</div>'

    // ── Body ──────────────────────────────────────────────────
    + '<div id="dp-abn-body-' + a.id + '" style="margin-top:10px;' + bodyStyle + '">'

      // Kontaktperson + Datum
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">'
        + '<div>'
          + '<div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;margin-bottom:3px;">👤 Kontaktperson</div>'
          + '<input type="text" value="' + _escHtml(ab.kontakt) + '" placeholder="Name des Abnehmers…" '
          + 'data-au-id="' + a.id + '" data-abn-field="kontakt" '
          + 'style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid var(--border);'
          + 'border-radius:7px;font-size:12px;font-family:inherit;" '
          + 'onblur="abnahmeFieldSave(this)" onkeydown="if(event.key===\'Enter\')this.blur()">'
        + '</div>'
        + '<div>'
          + '<div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;margin-bottom:3px;">📅 Abnahmedatum</div>'
          + '<input type="date" value="' + (ab.datum ? ab.datum.substring(0, 10) : '') + '" '
          + 'data-au-id="' + a.id + '" data-abn-field="datum" '
          + 'style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid var(--border);'
          + 'border-radius:7px;font-size:12px;font-family:inherit;" '
          + 'onchange="abnahmeFieldSave(this)">'
        + '</div>'
      + '</div>'

      // Notiz
      + '<div style="margin-bottom:12px;">'
        + '<div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;margin-bottom:3px;">💬 Abnahme-Notiz</div>'
        + '<textarea rows="3" placeholder="Mängel, Besonderheiten, Kundenhinweise…" '
        + 'data-au-id="' + a.id + '" data-abn-field="notiz" '
        + 'style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);'
        + 'border-radius:7px;font-size:12px;font-family:inherit;resize:vertical;" '
        + 'onblur="abnahmeNotizSave(\'' + a.id + '\',this.value)">'
        + _escHtml(ab.notiz)
        + '</textarea>'
      + '</div>'

      // Fotos
      + '<div style="margin-bottom:14px;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'
          + '<div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;">📷 Abnahme-Fotos</div>'
          + '<span style="font-size:10px;color:var(--text2);">' + ab.fotos.length + ' Foto(s)</span>'
        + '</div>'
        + fotosHTML
        + '<label style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:7px 12px;'
          + 'background:var(--blue-l);border-radius:8px;cursor:pointer;font-size:12px;color:var(--blue);font-weight:600;">'
          + '📷 Foto hinzufügen'
          + '<input type="file" accept="image/*" capture="environment" multiple style="display:none;" '
          + 'data-aid="' + a.id + '" onchange="abnahmeFotoUpload(this.dataset.aid, event)">'
        + '</label>'
      + '</div>'

      // Abnahme bestätigen
      + '<div style="display:flex;align-items:center;gap:10px;padding-top:4px;border-top:1px solid var(--border);">'
        + btnBestaetigen
        + (ab.status === 'abgenommen' && ab.kontakt
            ? '<div style="font-size:11px;color:var(--text2);">👤 ' + _escHtml(ab.kontakt) + '</div>'
            : '')
      + '</div>'

    + '</div>' // dp-abn-body
  + '</div>';  // dp-section
}

// ─────────────────────────────────────────────────────────────────────
// Hilfsfunktion: HTML-Escaping (verhindert XSS in Eingabefeldern)
// ─────────────────────────────────────────────────────────────────────
function _escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────────
// Einzelfeld in a.abnahme speichern (kontakt, datum)
// ─────────────────────────────────────────────────────────────────────
function abnahmeFieldSave(input) {
  var id    = input.dataset.auId;
  var field = input.dataset.abnField;
  var val   = input.value;
  if (!id || !field) return;

  var a = (typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE : []).find(function(x) { return x.id === id; });
  if (!a) return;
  if (!a.abnahme) a.abnahme = { status: 'offen', fotos: [], kontakt: '', datum: '', notiz: '' };

  a.abnahme[field] = val;

  if (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService) {
    window.CCIntern.DataService.save('cc_intern_auftraege_v1', AUFTRAEGE);
  } else if (typeof saveAuftraege === 'function') {
    saveAuftraege();
  }
}

// ─────────────────────────────────────────────────────────────────────
// Abnahme-Notiz speichern (textarea hat kein data-abn-field — extra fn)
// ─────────────────────────────────────────────────────────────────────
function abnahmeNotizSave(id, val) {
  var a = (typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE : []).find(function(x) { return x.id === id; });
  if (!a) return;
  if (!a.abnahme) a.abnahme = { status: 'offen', fotos: [], kontakt: '', datum: '', notiz: '' };
  a.abnahme.notiz = val;

  if (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService) {
    window.CCIntern.DataService.save('cc_intern_auftraege_v1', AUFTRAEGE);
  } else if (typeof saveAuftraege === 'function') {
    saveAuftraege();
  }
}

// ─────────────────────────────────────────────────────────────────────
// Abnahme bestätigen → Status = 'abgenommen', Datum auto-setzen, neu rendern
// ─────────────────────────────────────────────────────────────────────
function abnahmeBestaetigen(id) {
  var a = (typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE : []).find(function(x) { return x.id === id; });
  if (!a) return;
  if (!a.abnahme) a.abnahme = { fotos: [], kontakt: '', datum: '', notiz: '' };

  a.abnahme.status = 'abgenommen';
  if (!a.abnahme.datum) {
    a.abnahme.datum = new Date().toISOString().substring(0, 10);
  }

  if (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService) {
    window.CCIntern.DataService.save('cc_intern_auftraege_v1', AUFTRAEGE);
  } else if (typeof saveAuftraege === 'function') {
    saveAuftraege();
  }

  // Abnahme-Block im DOM sofort aktualisieren (kein Full-Rerender nötig)
  var bodyEl = document.getElementById('dp-abn-body-' + id);
  if (bodyEl) {
    // Einfacher Status-Update ohne Full-Rerender
    var sc = { lbl: '✅ Abgenommen', bg: '#E8F5E9', tc: '#2E7D32' };
    var section = bodyEl.parentElement;
    if (section) {
      section.style.background = '#F0FBF0';
      // Badge aktualisieren
      var badge = section.querySelector('[style*="border-radius:20px"]');
      if (badge) {
        badge.textContent = sc.lbl;
        badge.style.background = sc.bg;
        badge.style.color = sc.tc;
      }
    }
    // Bestätigungs-Button durch Status-Anzeige ersetzen
    var btn = bodyEl.querySelector('button[onclick*="abnahmeBestaetigen"]');
    if (btn) {
      var div = document.createElement('div');
      var datumFmt = a.abnahme.datum ? a.abnahme.datum.split('-').reverse().join('.') : '';
      div.style.cssText = 'padding:8px 14px;background:#E8F5E9;border-radius:8px;font-size:13px;font-weight:700;color:#2E7D32;display:inline-flex;align-items:center;gap:6px;';
      div.textContent = '✅ Abnahme bestätigt' + (datumFmt ? ' · ' + datumFmt : '');
      btn.parentNode.replaceChild(div, btn);
    }
    if (typeof showToast === 'function') showToast('✅ Abnahme bestätigt!');
  } else {
    // Fallback: vollständig neu öffnen
    if (typeof openAuftragDetail === 'function') openAuftragDetail(id);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Abnahme-Foto hochladen → komprimieren, in a.abnahme.fotos eintragen
// ─────────────────────────────────────────────────────────────────────
function abnahmeFotoUpload(id, event) {
  var a = (typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE : []).find(function(x) { return x.id === id; });
  if (!a) return;
  if (!a.abnahme) a.abnahme = { status: 'offen', fotos: [], kontakt: '', datum: '', notiz: '' };
  if (!a.abnahme.fotos) a.abnahme.fotos = [];

  var files = event.target.files;
  if (!files || !files.length) return;

  var total = files.length;
  var done  = 0;

  Array.prototype.forEach.call(files, function(file) {
    var compress = typeof ccCompressImage === 'function' ? ccCompressImage : null;

    function onData(dataUrl) {
      a.abnahme.fotos.push({
        name:     file.name,
        dataUrl:  dataUrl,
        mimeType: file.type || 'image/jpeg',
        size:     file.size || 0,
        ts:       new Date().toISOString(),
      });

      // Status auf fotos_ok setzen wenn noch nicht abgenommen
      if (a.abnahme.status === 'offen') a.abnahme.status = 'fotos_ok';

      done++;
      if (done === total) {
        if (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService) {
          window.CCIntern.DataService.save('cc_intern_auftraege_v1', AUFTRAEGE);
        } else if (typeof saveAuftraege === 'function') {
          saveAuftraege();
        }
        // Detail neu rendern (einfachste Art um Gallery zu aktualisieren)
        if (typeof openAuftragDetail === 'function') openAuftragDetail(id);
        if (typeof showToast === 'function') showToast('📷 ' + done + ' Abnahme-Foto(s) gespeichert');
      }
    }

    if (compress) {
      compress(file, function(dataUrl) { onData(dataUrl); });
    } else {
      var reader = new FileReader();
      reader.onload = function(e) { onData(e.target.result); };
      reader.readAsDataURL(file);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// Abnahme-Foto löschen
// ─────────────────────────────────────────────────────────────────────
function abnahmeFotoLoeschen(id, idx) {
  var a = (typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE : []).find(function(x) { return x.id === id; });
  if (!a || !a.abnahme || !a.abnahme.fotos) return;

  a.abnahme.fotos.splice(idx, 1);

  // Status zurücksetzen wenn keine Fotos mehr und noch nicht abgenommen
  if (!a.abnahme.fotos.length && a.abnahme.status === 'fotos_ok') {
    a.abnahme.status = 'offen';
  }

  if (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService) {
    window.CCIntern.DataService.save('cc_intern_auftraege_v1', AUFTRAEGE);
  } else if (typeof saveAuftraege === 'function') {
    saveAuftraege();
  }

  if (typeof openAuftragDetail === 'function') openAuftragDetail(id);
}
