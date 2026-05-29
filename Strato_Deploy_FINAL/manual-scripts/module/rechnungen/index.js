// ══════════════════════════════════════════════════════════════════════
// CC INTERN — module/rechnungen/index.js  (API-Version)
// ─────────────────────────────────────────────────────────────────────
// FIX: window.CCIntern.auth.apiFetch statt DataService/SyncAdapter.
//
// Voraussetzung: views/rechnungen-view.js wird VOR diesem Modul geladen
//   → rechApiFetch, rechReloadListeFromApi, rechPostApi, rechPutApi,
//     rechDeleteApi sind global verfügbar.
//
// RECHNUNGEN ist var → window.RECHNUNGEN → direktes push/assign möglich.
// ══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var RE_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isRechnungUuid(id) {
    return id != null && RE_UUID_RE.test(String(id).trim());
  }

  /** @param {string} s */
  function mapUiRechnungStatusToApi(s) {
    var k = String(s || '')
      .trim()
      .toLowerCase();
    if (k === 'versendet' || k === 'geschrieben') return 'gesendet';
    if (k === 'ueberfaellig' || k === 'überfällig') return 'offen';
    if (k === 'entwurf') return 'offen';
    if (k === 'bezahlt') return 'bezahlt';
    if (k === 'storniert') return 'storniert';
    if (
      k === 'offen' ||
      k === 'in_pruefung' ||
      k === 'freigegeben' ||
      k === 'gesendet' ||
      k === 'teilbezahlt' ||
      k === 'bezahlt' ||
      k === 'storniert'
    ) {
      return k;
    }
    return 'offen';
  }

  /** @param {Record<string, unknown>} ui */
  function resolveAuftragIdForApi(ui) {
    var raw = ui.auftrag_id != null ? String(ui.auftrag_id).trim() : '';
    if (!raw && ui.auftragId != null) raw = String(ui.auftragId).trim();
    if (!raw) return '';
    if (RE_UUID_RE.test(raw)) return raw;
    if (typeof AUFTRAEGE !== 'undefined' && AUFTRAEGE && AUFTRAEGE.find) {
      var a = AUFTRAEGE.find(function (x) {
        return (
          x &&
          (String(x.id) === raw ||
            String(x.auftragsnummer || '') === raw ||
            String(x.ccApiId || '') === raw)
        );
      });
      if (a && a.ccApiId != null && RE_UUID_RE.test(String(a.ccApiId).trim())) {
        return String(a.ccApiId).trim();
      }
      if (a && a.id != null && RE_UUID_RE.test(String(a.id).trim())) return String(a.id).trim();
    }
    return raw;
  }

  /** @param {Record<string, unknown>} ui */
  function rechnungUiToApiBody(ui) {
    var auftragId = resolveAuftragIdForApi(ui);
    var status = mapUiRechnungStatusToApi(/** @type {string} */ (ui.status));
    var faRaw = ui.faellig_am != null ? String(ui.faellig_am) : ui.faellig != null ? String(ui.faellig) : '';
    var faellig_am = faRaw.trim() ? faRaw.trim().slice(0, 10) : null;
    var bezRaw = ui.bezahlt_am != null ? String(ui.bezahlt_am) : '';
    var bezahlt_am = bezRaw.trim() ? bezRaw.trim().slice(0, 10) : null;
    if (status === 'bezahlt' && !bezahlt_am) {
      bezahlt_am = new Date().toISOString().split('T')[0];
    }
    var bemerkung = ui.notiz != null ? String(ui.notiz).trim() : ui.bemerkung != null ? String(ui.bemerkung).trim() : '';
    var betreff = ui.betreff != null ? String(ui.betreff).trim() : '';
    var datum = ui.datum != null ? String(ui.datum).trim().slice(0, 10) : '';
    var angebot_id = ui.angebot_id != null ? String(ui.angebot_id).trim() : '';
    var positionen = Array.isArray(ui.positionen) ? ui.positionen : null;
    var netto = null;
    var brutto = null;
    if (positionen && positionen.length) {
      var n = positionen.reduce(function (s, p) {
        return s + (Number(p.menge) || 0) * (Number(p.ep) || 0);
      }, 0);
      netto = n;
      brutto = Math.round(n * 1.19 * 100) / 100;
    }
    /** @type {Record<string, unknown>} */
    var body = {
      auftrag_id: auftragId,
      status: status,
      faellig_am: faellig_am,
      bezahlt_am: bezahlt_am,
      bemerkung: bemerkung || null,
    };
    if (betreff) body.betreff = betreff;
    if (datum) body.datum = datum;
    if (angebot_id) body.angebot_id = angebot_id;
    if (positionen) body.positionen = positionen;
    if (netto != null) body.netto = netto;
    if (brutto != null) body.brutto = brutto;
    return body;
  }

  /** @param {Record<string, unknown>} r @param {unknown} saved */
  function mergeApiRechnungIntoRow(r, saved) {
    var pack = /** @type {{ rechnung?: Record<string, unknown> }} */ (saved);
    var rec = pack && pack.rechnung ? pack.rechnung : /** @type {Record<string, unknown>} */ (saved);
    if (!rec || typeof rec !== 'object') return;
    r.id = rec.id != null ? String(rec.id) : r.id;
    r.rechnungsnummer = rec.rechnungsnummer != null ? String(rec.rechnungsnummer) : r.rechnungsnummer;
    r.auftrag_id = rec.auftrag_id != null ? String(rec.auftrag_id) : r.auftrag_id;
    r.auftragId = r.auftrag_id || r.auftragId;
    r.status = rec.status != null ? String(rec.status) : r.status;
    r.faellig_am = rec.faellig_am != null ? String(rec.faellig_am) : r.faellig_am;
    r.faellig = r.faellig_am || r.faellig;
    r.bezahlt_am = rec.bezahlt_am != null ? String(rec.bezahlt_am) : r.bezahlt_am;
    r.bemerkung = rec.bemerkung != null ? String(rec.bemerkung) : r.bemerkung;
    if (rec.bemerkung != null && String(rec.bemerkung).trim() !== '') r.notiz = String(rec.bemerkung);
    r.kunde = rec.kunde != null ? String(rec.kunde) : r.kunde;
    r.auftragsnummer = rec.auftragsnummer != null ? String(rec.auftragsnummer) : r.auftragsnummer;
    if (rec.betreff != null) r.betreff = String(rec.betreff);
    if (rec.datum != null) r.datum = String(rec.datum);
    if (rec.angebot_id != null) r.angebot_id = String(rec.angebot_id);
    if (Array.isArray(rec.positionen)) r.positionen = rec.positionen;
    if (rec.netto != null) r.netto = Number(rec.netto);
    if (rec.brutto != null) r.brutto = Number(rec.brutto);
    r._apiSynced = true;
  }

  function flushRechnungenToApiThenCache() {
    var _orig =
      typeof window.__rechnungenOrigSave === 'function'
        ? window.__rechnungenOrigSave
        : null;
    if (!_orig) return Promise.resolve();

    var arr = window.RECHNUNGEN;
    if (!arr || !arr.length) {
      _orig.apply(null, []);
      return Promise.resolve();
    }

    var pending = arr.filter(function (r) {
      return r && !r._apiSynced;
    });
    if (!pending.length) {
      _orig.apply(null, []);
      return Promise.resolve();
    }

    var tasks = pending.map(function (r) {
      var body = rechnungUiToApiBody(/** @type {Record<string, unknown>} */ (r));
      if (!body.auftrag_id) {
        console.warn('[rechnungen/index] Sync übersprungen (kein auftrag_id / keine UUID):', r);
        r._apiLocalOnly = true;
        r._apiSynced = true;
        return Promise.resolve();
      }
      var idStr = r.id != null ? String(r.id).trim() : '';
      if (isRechnungUuid(idStr)) {
        return rechPutApi(idStr, body).then(function (saved) {
          mergeApiRechnungIntoRow(/** @type {Record<string, unknown>} */ (r), saved);
        });
      }
      return rechPostApi(body).then(function (saved) {
        mergeApiRechnungIntoRow(/** @type {Record<string, unknown>} */ (r), saved);
      });
    });

    return Promise.allSettled(tasks).then(function (results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          console.warn('[rechnungen/index] API-Sync Zeile fehlgeschlagen:', pending[i], results[i].reason);
        }
      }
      _orig.apply(null, []);
    });
  }

  var _origSaveRechnungen = typeof saveRechnungenData === 'function' ? saveRechnungenData : null;

  if (_origSaveRechnungen) {
    window.__rechnungenOrigSave = _origSaveRechnungen;
    saveRechnungenData = function () {
      flushRechnungenToApiThenCache();
    };
    console.log('[rechnungen/index] saveRechnungenData → API zuerst, dann Cache.');
  } else {
    console.warn('[rechnungen/index] saveRechnungenData nicht gefunden — POST-Wrap übersprungen.');
  }

  var _origSetRechnung = typeof setRechnung === 'function' ? setRechnung : null;

  if (_origSetRechnung) {
    setRechnung = function (auftragRefId, status) {
      var result = _origSetRechnung.apply(this, arguments);
      try {
        var auftragUuid = auftragRefId;
        if (typeof AUFTRAEGE !== 'undefined' && AUFTRAEGE && AUFTRAEGE.find) {
          var ax = AUFTRAEGE.find(function (x) {
            return x && String(x.id) === String(auftragRefId);
          });
          if (ax && ax.ccApiId != null && String(ax.ccApiId).trim() !== '') {
            auftragUuid = String(ax.ccApiId).trim();
          }
        }
        var rech = (window.RECHNUNGEN || []).find(function (r) {
          if (!r) return false;
          var aid = r.auftrag_id != null ? String(r.auftrag_id) : r.auftragId != null ? String(r.auftragId) : '';
          return aid && String(aid) === String(auftragUuid);
        });
        if (!rech || !isRechnungUuid(rech.id) || typeof rechPutApi !== 'function') {
          return result;
        }
        var apiStatus = mapUiRechnungStatusToApi(
          status === 'geschrieben' || status === 'versendet' ? 'gesendet' : String(status),
        );
        var merged = Object.assign({}, rech, { status: apiStatus });
        var body = rechnungUiToApiBody(/** @type {Record<string, unknown>} */ (merged));
        rechPutApi(String(rech.id).trim(), body)
          .then(function (saved) {
            mergeApiRechnungIntoRow(/** @type {Record<string, unknown>} */ (rech), saved);
            if (window.__rechnungenOrigSave) window.__rechnungenOrigSave.apply(null, []);
          })
          .catch(function (e) {
            console.warn('[rechnungen/index] setRechnung PUT Fehler:', e);
          });
      } catch (e2) {
        console.warn('[rechnungen/index] setRechnung API:', e2);
      }
      return result;
    };
    console.log('[rechnungen/index] setRechnung → Rechnung per auftrag_id, PUT mit UUID.');
  }

  function reCockpitRechnungenApiKontext() {
    return !!(
      typeof window !== 'undefined' &&
      window.__CCINTERN_COCKPIT_MOUNT__ &&
      window.CCIntern &&
      window.CCIntern.auth &&
      typeof window.CCIntern.auth.apiFetch === 'function'
    );
  }

  function init() {
    if (typeof rechReloadListeFromApi !== 'function') {
      console.warn('[rechnungen/index] rechReloadListeFromApi nicht gefunden — Init übersprungen.');
      return;
    }
    function persistCacheFromRam() {
      if (window.__rechnungenOrigSave) window.__rechnungenOrigSave.apply(null, []);
    }
    if (reCockpitRechnungenApiKontext()) {
      rechReloadListeFromApi()
        .then(function () {
          persistCacheFromRam();
        })
        .catch(function () {
          persistCacheFromRam();
        });
    } else {
      setTimeout(function () {
        rechReloadListeFromApi();
      }, 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, reCockpitRechnungenApiKontext() ? 0 : 600);
    });
  } else {
    setTimeout(init, reCockpitRechnungenApiKontext() ? 0 : 600);
  }

  window.RechnungenService = {
    reload: function () {
      return typeof rechReloadListeFromApi === 'function' ? rechReloadListeFromApi() : Promise.resolve();
    },
    post: function (body) {
      return typeof rechPostApi === 'function' ? rechPostApi(body) : Promise.reject('rechPostApi fehlt');
    },
    put: function (id, body) {
      return typeof rechPutApi === 'function' ? rechPutApi(id, body) : Promise.reject('rechPutApi fehlt');
    },
    delete: function (id) {
      return typeof rechDeleteApi === 'function' ? rechDeleteApi(id) : Promise.reject('rechDeleteApi fehlt');
    },
  };

  console.log('[rechnungen/index] API-Modul geladen. RechnungenService verfügbar.');
})();
