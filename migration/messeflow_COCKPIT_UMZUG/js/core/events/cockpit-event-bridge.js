// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – Event Bridge  (§8 + §27 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  Verbindet modul-interne Events (emitModuleEvent) mit der Cockpit-Shell.
//  Alle Listener hier registrieren – keine Direktkopplungen zwischen Modulen.
//  Laden NACH module-events.js.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Warten bis module-events bereit ist ──────────────────────────────────
  function _init() {
    if (typeof onModuleEvent !== 'function') {
      setTimeout(_init, 50);
      return;
    }

    // ── MODULE_ENTRY ────────────────────────────────────────────────────────
    onModuleEvent(MODULE_EVENT_TYPE.MODULE_ENTRY, function (ev) {
      console.log('[CockpitBridge] Modul-Einstieg:', ev);
      _updateShellState({ activeModule: ev.moduleId || 'messeflow' });
    });

    // ── PROJECT_CHANGED ─────────────────────────────────────────────────────
    onModuleEvent(MODULE_EVENT_TYPE.PROJECT_CHANGED, function (ev) {
      console.log('[CockpitBridge] Projekt gewechselt:', ev.projectId);
      _updateShellState({ activeProjId: ev.projectId });
      // Deep-Link-State aktualisieren
      _syncDeepLink({ project: ev.projectId });
    });

    // ── FILE_UPLOADED ───────────────────────────────────────────────────────
    onModuleEvent(MODULE_EVENT_TYPE.FILE_UPLOADED, function (ev) {
      console.log('[CockpitBridge] Datei hochgeladen:', ev.fileName, 'Projekt:', ev.projectId);
    });

    // ── APPROVAL_NEEDED ─────────────────────────────────────────────────────
    onModuleEvent(MODULE_EVENT_TYPE.APPROVAL_NEEDED, function (ev) {
      console.log('[CockpitBridge] Freigabe erforderlich:', ev);
      _notifyShell('approval', ev);
    });

    // ── INVITE_CREATED ──────────────────────────────────────────────────────
    onModuleEvent(MODULE_EVENT_TYPE.INVITE_CREATED, function (ev) {
      console.log('[CockpitBridge] Einladung erstellt:', ev.inviteId);
    });

    // ── STATUS_GEAENDERT ────────────────────────────────────────────────────
    onModuleEvent(MODULE_EVENT_TYPE.STATUS_GEAENDERT, function (ev) {
      console.log('[CockpitBridge] Status geändert:', ev.status, 'Projekt:', ev.projectId);
      _updateShellState({ lastStatusChange: ev });
    });

    // ── EMBED_TEST_STARTED ──────────────────────────────────────────────────
    onModuleEvent(MODULE_EVENT_TYPE.EMBED_TEST_STARTED, function (ev) {
      console.log('[CockpitBridge] Embed-Test gestartet:', ev);
    });

    // Wildcard-Log (nur DEV)
    if (typeof window !== 'undefined' && window.MF_TEST_MODE) {
      onModuleEvent('*', function (ev) {
        console.debug('[CockpitBridge][*]', ev.type, ev);
      });
    }

    console.log('[CockpitBridge] Initialisiert – alle Listener aktiv');
  }

  // ── Shell-State aktualisieren ────────────────────────────────────────────
  function _updateShellState(patch) {
    if (typeof window.CCWState !== 'undefined' && typeof window.CCWState.set === 'function') {
      Object.entries(patch).forEach(function (kv) {
        window.CCWState.set(kv[0], kv[1]);
      });
    } else {
      // Fallback: direkt auf window schreiben (Legacy)
      Object.assign(window, patch);
    }
  }

  // ── Deep-Link synchronisieren (§4 Master) ───────────────────────────────
  function _syncDeepLink(params) {
    try {
      var url = new URL(window.location.href);
      Object.entries(params).forEach(function (kv) {
        if (kv[1]) { url.searchParams.set(kv[0], kv[1]); }
        else       { url.searchParams.delete(kv[0]); }
      });
      history.replaceState(null, '', url.toString());
    } catch (e) { /* kein History-Support */ }
  }

  // ── Shell-Benachrichtigung ───────────────────────────────────────────────
  function _notifyShell(type, data) {
    if (typeof window.CCW !== 'undefined' && typeof window.CCW.notify === 'function') {
      window.CCW.notify(type, data);
    }
  }

  _init();
})();
