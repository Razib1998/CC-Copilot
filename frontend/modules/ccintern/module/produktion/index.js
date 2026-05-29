// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/produktion/index.js
// ─────────────────────────────────────────────────────────────────────
// Produktion = Kanban-Board über AUFTRAEGE-Array.
// saveAuftraege() + loadAuftraege() sind bereits in index.html definiert.
//
// Dieser Block:
//   1. Sicherstellt dass loadAuftraege() beim Start aufgerufen wird
//   2. Wraps renderKanban → immer aktueller Stand
//   3. Feature: auftragDringend(id) — Dringend-Flag toggeln
//   4. Feature: auftragArchivieren(id) — Auftrag archivieren
//   5. Feature: auftragWiedervorlage(id, datum) — Wiedervorlage setzen
//   6. Feature: produktionStatusBadge() — Ampel-Übersicht im Dashboard
//
// Kalender: CC Cockpit liefert den Kalender — kein eigener Code hier
// Zugriffsrechte: CC Cockpit regelt Basis
// ══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Feature: Dringend-Flag toggeln ───────────────────────────────────
  function auftragDringend(id) {
    if (typeof AUFTRAEGE === 'undefined') return;
    var a = AUFTRAEGE.find(function (x) { return x.id === id; });
    if (!a) return;
    a.urgent = !a.urgent;
    if (typeof saveAuftraege === 'function') saveAuftraege();
    if (typeof renderKanban  === 'function') renderKanban();
    if (typeof showToast     === 'function') showToast(a.urgent ? '🔴 Dringend gesetzt: ' + id : '✓ Dringend aufgehoben: ' + id);
  }

  // ── Feature: Auftrag archivieren ─────────────────────────────────────
  function auftragArchivieren(id) {
    if (typeof AUFTRAEGE === 'undefined') return;
    var a = AUFTRAEGE.find(function (x) { return x.id === id; });
    if (!a) return;
    if (typeof ccInternConfirm !== 'function') return;
    ccInternConfirm('Auftrag "' + id + '" archivieren?\nEr bleibt im System, wird aber nicht mehr im Kanban angezeigt.', function() {
    a.archiv = true;
    a.archiviertAm = new Date().toLocaleDateString('de-DE');
    if (typeof saveAuftraege === 'function') saveAuftraege();
    if (typeof renderKanban  === 'function') renderKanban();
    if (typeof showToast     === 'function') showToast('📦 Archiviert: ' + id);
    });
  }

  // ── Feature: Wiedervorlage setzen ────────────────────────────────────
  function auftragWiedervorlage(id, datum) {
    if (typeof AUFTRAEGE === 'undefined') return;
    var a = AUFTRAEGE.find(function (x) { return x.id === id; });
    if (!a) return;
    a.wiedervorlage = datum || new Date().toISOString().slice(0, 10);
    if (typeof saveAuftraege === 'function') saveAuftraege();
    if (typeof showToast     === 'function') showToast('📅 Wiedervorlage: ' + id + ' → ' + a.wiedervorlage);
  }

  // ── Feature: Ampel-Badge für Dashboard ───────────────────────────────
  function produktionStatusBadge() {
    if (typeof AUFTRAEGE === 'undefined') return { total: 0, dringend: 0, heute: 0 };
    var heute = new Date().toLocaleDateString('de-DE');
    return {
      total:    AUFTRAEGE.filter(function (a) { return !a.archiv && a.step !== 'abgeschlossen'; }).length,
      dringend: AUFTRAEGE.filter(function (a) { return !a.archiv && a.urgent; }).length,
      heute:    AUFTRAEGE.filter(function (a) { return !a.archiv && (a.liefertermin === heute || a.montageDatum === heute); }).length,
    };
  }

  // ── Wraps installieren ────────────────────────────────────────────────
  function _installWraps() {
    // renderKanban: Dringend + Archivieren-Button einbauen
    var _origRenderKanban = window.renderKanban;
    window.renderKanban = function () {
      var result = typeof _origRenderKanban === 'function' ? _origRenderKanban() : undefined;
      // Buttons nachträglich in alle Kanban-Karten einbauen
      setTimeout(function () {
        document.querySelectorAll('[data-auftrags-id]').forEach(function (card) {
          var id = card.dataset.auftragsId;
          if (!id || card.querySelector('[data-action="prod-dringend"]')) return;

          var a = typeof AUFTRAEGE !== 'undefined'
            ? AUFTRAEGE.find(function (x) { return x.id === id; }) : null;
          if (!a) return;

          var btnBar = document.createElement('div');
          btnBar.style.cssText = 'display:flex;gap:4px;margin-top:6px;';

          var dringBtn = document.createElement('button');
          dringBtn.setAttribute('data-action', 'prod-dringend');
          dringBtn.dataset.id = id;
          dringBtn.style.cssText = 'flex:1;padding:4px;font-size:11px;border-radius:6px;cursor:pointer;border:1px solid '
            + (a.urgent ? 'var(--red)' : 'var(--border)') + ';background:'
            + (a.urgent ? 'var(--red-l)' : '#fff') + ';color:'
            + (a.urgent ? 'var(--red)' : 'var(--text2)') + ';';
          dringBtn.textContent = a.urgent ? '🔴 Dringend' : '⚡ Dringend';
          dringBtn.onclick = function (e) { e.stopPropagation(); auftragDringend(this.dataset.id); };

          var archBtn = document.createElement('button');
          archBtn.setAttribute('data-action', 'prod-archiv');
          archBtn.dataset.id = id;
          archBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:6px;cursor:pointer;'
            + 'border:1px solid var(--border);background:#fff;color:var(--text2);';
          archBtn.textContent = '📦';
          archBtn.title = 'Archivieren';
          archBtn.onclick = function (e) { e.stopPropagation(); auftragArchivieren(this.dataset.id); };

          btnBar.appendChild(dringBtn);
          btnBar.appendChild(archBtn);
          card.appendChild(btnBar);
        });
      }, 30);
      return result;
    };
  }

  // ── Desktop: laufende App-Sessions in ZEIT_AKTIV eintragen ──────────
  // Nur auf Desktop (nicht App), nur additiv (kein Überschreiben).
  function ccDesktopZeitAktivRestore() {
    // Nicht in der Mitarbeiter-App ausführen
    if (typeof window !== 'undefined' && (
      window.__CCINTERN_MITARBEITER_APP_BOOT__ === true ||
      (window.CC_SHELL_UI_ACCESS && window.CC_SHELL_UI_ACCESS.isMitarbeiterAppOnlyShell === true)
    )) return;

    var api = window.CCIntern && window.CCIntern.cockpitApi;
    if (!api || typeof api.fetchAlleAktiveAuftragArbeitszeiten !== 'function') return;

    api.fetchAlleAktiveAuftragArbeitszeiten().then(function (sessions) {
      if (!Array.isArray(sessions) || !sessions.length) return;
      if (typeof ZEIT_AKTIV === 'undefined') return;

      var changed = false;
      sessions.forEach(function (sess) {
        if (!sess || !sess.auftrag_id || !sess.schritt_key) return;
        if (sess.status === 'stopped') return;

        // Auftrag im RAM finden (ccApiId = Backend-UUID, id = lokale ID)
        var auftr = null;
        if (typeof AUFTRAEGE !== 'undefined') {
          auftr = AUFTRAEGE.find(function (a) {
            return a && (a.ccApiId === sess.auftrag_id || a.id === sess.auftrag_id);
          });
        }
        if (!auftr) return; // Auftrag nicht im RAM — überspringen

        var key = auftr.id + '_' + sess.schritt_key;
        if (ZEIT_AKTIV[key]) return; // bereits gesetzt — nicht überschreiben

        ZEIT_AKTIV[key] = {
          start: sess.started_at ? new Date(String(sess.started_at)) : new Date(),
          pauseSek: sess.pause_seconds || 0,
          paused: sess.status === 'paused',
          fromServer: true,
        };
        changed = true;
      });

      if (changed && typeof renderKanban === 'function') renderKanban();
    }).catch(function (e) {
      console.warn('[ProduktionDesktop] ccDesktopZeitAktivRestore', e);
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function init() {
    _installWraps();
    // loadAuftraege ist bereits in index.html — nur sicherstellen dass es aufgerufen wird
    if (typeof loadAuftraege === 'function') {
      loadAuftraege(function (loaded) {
        if (loaded && typeof renderKanban === 'function') renderKanban();
        ccDesktopZeitAktivRestore();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 200); });
  } else {
    setTimeout(init, 200);
  }

  // ── Globaler Export ───────────────────────────────────────────────────
  window.ProduktionService      = { statusBadge: produktionStatusBadge };
  window.auftragDringend        = auftragDringend;
  window.auftragArchivieren     = auftragArchivieren;
  window.auftragWiedervorlage   = auftragWiedervorlage;
  window.produktionStatusBadge  = produktionStatusBadge;

  console.info('[CC] produktion/index.js geladen — Dringend + Archivieren + Wiedervorlage');

})();
