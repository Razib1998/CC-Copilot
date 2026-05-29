/**
 * CC Intern — Cockpit-Backend (apiFetch) für Aufträge / optionale Reloads.
 * Wird von `cc-intern-cockpit-bridge.js` geladen; arbeitet mit `window.AUFTRAEGE`.
 *
 * Persistenz: nur `GET|POST|PUT|DELETE /api/v1/ccintern/auftraege` (+ Query `firma_id` aus `COCKPIT_FIRMA_ID`).
 * Zentrale Ein-/Ausgabe: `runLoadAuftraegeFromApi`, `runSaveAuftraege` — kein DataService/localStorage für Aufträge.
 * Kalender (Cockpit): `reloadCcInternKalenderFeed` → GET `/api/v1/stammdaten/kalender` mit `x-project-id`
 * (Projektliste vorher per `hydrateCockpitAccessibleProjectsAndEnsureContext`), siehe `window.ccInternApplyKalenderApiRows`.
 * Kein Zugriff auf Cockpit-Dashboard-Endpunkte; `COCKPIT_*` hier nur Firmen-ID fürs Backend, keine Dashboard-UI.
 */

import {
  apiFetch,
  apiFetchBlob,
  apiFetchFormData,
  getCurrentProjectId,
  hydrateCockpitAccessibleProjectsAndEnsureContext,
} from '../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../core/api/api-routes.js';
import CCState from '../../../core/state/state.js';

const BEM_TAG = '{"__ccintern_v1"';

/**
 * Checklisten-Datenfluss (Kurzfassung):
 * 1. Speichern: `uiToApiBody` packt den kompletten UI-Auftrag (`schritte[].checkliste`, `checklisten`) in `bemerkung` als JSON.
 * 2. `PUT /api/v1/ccintern/auftraege/:ccApiId` sendet diesen Body; bei Erfolg wirft `apiFetch` nicht → implizit 2xx.
 * 3. Danach: `reloadAuftraegeFromApiIntoMemory` leert das Array und lädt alle Zeilen neu vom Server — kein alter RAM-State bleibt absichtlich stehen.
 * 4. Laden: `apiRowToUi` parst `row.bemerkung` → `payload` wird mit `Object.assign` zur UI-Zeile; Checklisten kommen aus diesem Payload, nicht aus separaten API-Feldern.
 *
 * Audit (Filter `CC-INTERN-CL-AUDIT`): `sessionStorage.setItem('ccintern_cl_audit','1')`, Seite neu laden.
 * Ausschalten: `sessionStorage.removeItem('ccintern_cl_audit')`.
 */
function ccInternClAuditEnabled() {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ccintern_cl_audit') === '1';
  } catch {
    return false;
  }
}

/**
 * @param {string} bemerkungStr
 */
function summarizeChecklistenInBemerkung(bemerkungStr) {
  const s = bemerkungStr != null ? String(bemerkungStr) : '';
  const out = {
    bemerkungChars: s.length,
    parses: false,
    hasPayload: false,
    hasSchritte: false,
    schrittSteps: /** @type {string[]} */ ([]),
    stepChecklisten: /** @type {Record<string, { items: number; erledigt: number }>} */ ({}),
    legacyChecklistenItems: null,
  };
  if (!s.trim().startsWith(BEM_TAG)) return out;
  try {
    const parsed = JSON.parse(s);
    out.parses = true;
    const pl = parsed && parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : null;
    if (!pl) return out;
    out.hasPayload = true;
    const sch = pl.schritte;
    if (sch && typeof sch === 'object') {
      out.hasSchritte = true;
      out.schrittSteps = Object.keys(sch);
      out.schrittSteps.forEach(function (step) {
        const block = sch[step];
        const cl = block && Array.isArray(block.checkliste) ? block.checkliste : [];
        out.stepChecklisten[step] = {
          items: cl.length,
          erledigt: cl.filter(function (c) {
            return c && c.erledigt === true;
          }).length,
        };
      });
    }
    if (Array.isArray(pl.checklisten)) {
      out.legacyChecklistenItems = pl.checklisten.length;
    }
  } catch {
    out.parses = false;
  }
  return out;
}

/**
 * @param {string} displayId
 * @param {string} apiId
 * @param {Record<string, unknown>} body
 * @param {string} phase
 */
function logCcInternClAudit(displayId, apiId, body, phase) {
  if (!ccInternClAuditEnabled()) return;
  const bem = body && body.bemerkung != null ? String(body.bemerkung) : '';
  const sum = summarizeChecklistenInBemerkung(bem);
  console.info('[CC-INTERN-CL-AUDIT]', phase, {
    anzeigeId: displayId,
    ccApiId: apiId,
    bemerkung: sum,
    bemerkungPrefix180: bem.slice(0, 180),
  });
}

/**
 * Live-Objekt aus `AUFTRAEGE` (nicht aus bemerkung-String): wo Checklisten im RAM hängen.
 *
 * @param {unknown} a
 * @returns {Record<string, unknown>}
 */
export function summarizeSchritteFromAuftragObj(a) {
  if (!a || typeof a !== 'object') {
    return { ok: false, grund: 'kein_auftrag' };
  }
  const o = /** @type {Record<string, unknown>} */ (a);
  const sch = o.schritte;
  const stepKeys = sch && typeof sch === 'object' ? Object.keys(/** @type {object} */ (sch)) : [];
  /** @type {Record<string, { items: number; erledigt: number; text0?: string }>} */
  const stepChecklisten = {};
  stepKeys.forEach(function (step) {
    const block = /** @type {Record<string, unknown>} */ ((/** @type {object} */ (sch))[step]);
    const cl = block && Array.isArray(block.checkliste) ? /** @type {unknown[]} */ (block.checkliste) : [];
    const arr = cl;
    stepChecklisten[step] = {
      items: arr.length,
      erledigt: arr.filter(function (c) {
        return c && /** @type {{ erledigt?: boolean }} */ (c).erledigt === true;
      }).length,
      text0: arr[0] && /** @type {{ text?: unknown }} */ (arr[0]).text != null ? String(arr[0].text).slice(0, 48) : null,
    };
  });
  const leg = Array.isArray(o.checklisten) ? /** @type {unknown[]} */ (o.checklisten) : null;
  return {
    ok: true,
    anzeigeId: o.id,
    ccApiId: o.ccApiId,
    aktiverSchritt: o.step,
    hasSchritte: stepKeys.length > 0,
    schrittKeys: stepKeys,
    stepChecklisten,
    legacyChecklistenItems: leg ? leg.length : null,
    legacyErledigt: leg
      ? leg.filter(function (c) {
          return c && /** @type {{ erledigt?: boolean }} */ (c).erledigt === true;
        }).length
      : null,
  };
}

/**
 * @param {unknown} auftrag
 * @param {string} phase
 * @param {Record<string, unknown>} [extra]
 */
export function logCcInternChecklistAuditFromUi(auftrag, phase, extra) {
  if (!ccInternClAuditEnabled()) return;
  const sum = summarizeSchritteFromAuftragObj(auftrag);
  console.info('[CC-INTERN-CL-AUDIT]', phase, Object.assign({}, sum, extra || {}));
}

function isUuid(s) {
  return (
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  );
}

function nullableStr(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function isoOrNull(v) {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return t.length >= 10 ? t.slice(0, 10) : t;
}

/** ISO-Datum (YYYY-MM-DD) + optionale Uhrzeit → `YYYY-MM-DDTHH:mm:00` für `montage_datum` / Kalender-Sync. */
function montageDatumIsoForApi(montageDatum, montageZeit) {
  const day = isoOrNull(montageDatum);
  if (!day) return null;
  const z = montageZeit != null ? String(montageZeit).trim() : '';
  const m = z.match(/^(\d{1,2}):(\d{2})/);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && m) {
    const hh = String(m[1]).padStart(2, '0');
    return `${day}T${hh}:${m[2]}:00`;
  }
  return day;
}

function safeJsonClone(obj) {
  return JSON.parse(
    JSON.stringify(obj, function (key, val) {
      if (key.slice(0, 3) === '_cc') return undefined;
      if (key === 'ccApiId') return undefined;
      // RAM-only: darf nie in POST/PUT-Payload (File/Blob würden stringify sprengen oder leeren Müll erzeugen).
      if (key === '__pendingCcinternDateiUploads') return undefined;
      if (typeof Blob !== 'undefined' && val instanceof Blob) return undefined;
      if (typeof File !== 'undefined' && val instanceof File) return undefined;
      return val;
    }),
  );
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
function serializeBemerkungPayload(payload) {
  return JSON.stringify({ __ccintern_v1: 1, payload: payload || {} });
}

/**
 * @param {unknown} auftragLike
 * @returns {boolean}
 */
function hasChecklistenData(auftragLike) {
  if (!auftragLike || typeof auftragLike !== 'object') return false;
  const a = /** @type {Record<string, unknown>} */ (auftragLike);
  if (Array.isArray(a.checklisten) && a.checklisten.length > 0) return true;
  const schritte = a.schritte;
  if (!schritte || typeof schritte !== 'object') return false;
  return Object.keys(/** @type {object} */ (schritte)).some(function (key) {
    const block = /** @type {Record<string, unknown>} */ ((/** @type {object} */ (schritte))[key]);
    return !!(block && Array.isArray(block.checkliste) && block.checkliste.length > 0);
  });
}

/**
 * Echte Cockpit-User-UUID? (Kurzformen wie "ME" sind false.)
 * @param {unknown} s
 * @returns {boolean}
 */
function isLikelyCockpitUserUuid(/** @type {unknown} */ s) {
  if (s == null || s === '') return false;
  const t = String(s).trim();
  if (t.length < 32) return false;
  return /^[0-9a-f]{8}-[0-9a-f-]{3,}/i.test(t) || t.length === 32;
}

/**
 * Mappt Legacy-Mitarbeiter-Kürzel (AU_STEP_CONFIG, z. B. "ME") bzw. Namen
 * auf `users.id` über `MA_DATA` (Cockpit: `maId` = UUID, `av` = Initialen wie in der UI).
 * Kein Extra-Fetch: `loadCockpitData` füllt `MA_DATA` / `COCKPIT_USERS`.
 * @param {unknown} raw
 * @returns {string|null}
 */
function resolveCockpitMaIdToUserUuid(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === 'undefined' || s === '—') return null;
  if (isLikelyCockpitUserUuid(s)) return s;
  const w = typeof window !== 'undefined' ? /** @type {Window & { MA_DATA?: { id?: unknown; maId?: unknown; av?: unknown; n?: unknown }[]; MA_ID_MAP?: Record<string, unknown> }} */ (window) : null;
  if (!w) return s;
  const live = w.CCIntern && Array.isArray(w.CCIntern.__MA_DATA_LIVE) ? w.CCIntern.__MA_DATA_LIVE : null;
  const maArr = live && live.length ? live : w.MA_DATA;
  if (Array.isArray(maArr) && maArr.length) {
    const up = s.toUpperCase();
    for (let i = 0; i < maArr.length; i++) {
      const m = maArr[i];
      if (!m) continue;
      if (m.k != null && String(m.k).trim() !== '' && String(m.k).toUpperCase() === up) {
        const out = m.id != null ? String(m.id) : m.maId != null ? String(m.maId) : '';
        if (isLikelyCockpitUserUuid(out)) return out;
      }
    }
    for (let i2 = 0; i2 < maArr.length; i2++) {
      const m = maArr[i2];
      if (!m) continue;
      if (m.maId != null && String(m.maId) === s) {
        const out = m.id != null ? String(m.id) : String(m.maId);
        if (isLikelyCockpitUserUuid(out)) return out;
      }
    }
  }
  if (w.MA_ID_MAP && typeof w.MA_ID_MAP === 'object') {
    for (const k of Object.keys(w.MA_ID_MAP)) {
      if (k && k === s && w.MA_ID_MAP[k] != null) return String(w.MA_ID_MAP[k]);
    }
  }
  return s;
}

/**
 * In `bemerkung` persistieren: pro Schritt `maId` / `verantwortlicher` / `maIds` / `zusatzMa` als User-UUID,
 * damit Mitarbeiter-App (MOB_MA_ID) und API konsistent bleiben — nicht AU_STEP_CONFIG-Kürzel.
 * @param {Record<string, unknown>} payload
 */
function normalizeSchritteCockpitMaToUserUuid(/** @type {Record<string, unknown>} */ payload) {
  if (typeof window !== 'undefined' && /** @type {Window} */(window).__CCINTERN_MA_NORM_DEBUG) {
    const W = /** @type {Window} */(window);
    const live = W.CCIntern && Array.isArray(W.CCIntern.__MA_DATA_LIVE) ? W.CCIntern.__MA_DATA_LIVE : [];
    console.log('[ccintern] MA normalize (debug)', {
      inputProbe: 'ME',
      window_MA_DATA: W.MA_DATA,
      __MA_DATA_LIVE: live,
      resolveCockpitMaIdToUserUuid_ME: resolveCockpitMaIdToUserUuid('ME'),
    });
  }
  const schritte = payload.schritte;
  if (!schritte || typeof schritte !== 'object') return;
  const mapOne = (/** @type {unknown} */ v) => resolveCockpitMaIdToUserUuid(v);
  const mapArr = (/** @type {unknown} */ v) => {
    if (!Array.isArray(v)) return v;
    return v
      .map((x) => mapOne(x))
      .filter((x) => x != null && String(x) !== 'undefined' && String(x) !== '—');
  };
  for (const key of Object.keys(/** @type {object} */(schritte))) {
    const sch = /** @type {Record<string, unknown> | null} */ (/** @type {object} */(schritte)[key]);
    if (!sch || typeof sch !== 'object') continue;
    if (sch.verantwortlicher != null) sch.verantwortlicher = mapOne(sch.verantwortlicher);
    if (sch.werId != null) sch.werId = mapOne(sch.werId);
    if (sch.maId != null) sch.maId = mapOne(sch.maId);
    else if (sch.verantwortlicher != null) sch.maId = /** @type {string|null} */(sch.verantwortlicher);
    if (Array.isArray(sch.maIds)) sch.maIds = mapArr(sch.maIds);
    if (Array.isArray(sch.zusatzMa)) sch.zusatzMa = mapArr(sch.zusatzMa);
    if (Array.isArray(sch.teamMaIds)) sch.teamMaIds = mapArr(sch.teamMaIds);
  }
  for (const key2 of Object.keys(/** @type {object} */(schritte))) {
    const sch2 = /** @type {Record<string, unknown> | null} */ (/** @type {object} */(schritte)[key2]);
    if (!sch2 || typeof sch2 !== 'object') continue;
    const team = [];
    const seenT = Object.create(null);
    function pushTeam(v) {
      const x = v != null ? String(v).trim() : '';
      if (!x || x === 'undefined' || x === '—' || seenT[x]) return;
      seenT[x] = true;
      team.push(x);
    }
    pushTeam(sch2.maId);
    if (Array.isArray(sch2.maIds)) sch2.maIds.forEach(pushTeam);
    if (Array.isArray(sch2.zusatzMa)) sch2.zusatzMa.forEach(pushTeam);
    pushTeam(sch2.verantwortlicher);
    pushTeam(sch2.werId);
    sch2.teamMaIds = team.slice();
    if (!Array.isArray(sch2.maIds) || sch2.maIds.length === 0) sch2.maIds = team.slice();
    if (sch2.maId == null && team.length) sch2.maId = team[0];
  }
}

/**
 * @param {string} bemerkung
 * @returns {Record<string, unknown>}
 */
function parseChecklistenFromBemerkung(bemerkung) {
  const raw = bemerkung != null ? String(bemerkung) : '';
  if (!raw.trim().startsWith(BEM_TAG)) {
    console.log('PARSED CHECKLISTE', {});
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.__ccintern_v1 === 1 && parsed.payload && typeof parsed.payload === 'object') {
      console.log('PARSED CHECKLISTE', parsed.payload);
      return parsed.payload;
    }
  } catch {
    /* ignore */
  }
  console.log('PARSED CHECKLISTE', {});
  return {};
}

/**
 * Tiefe Kopie einer Checklisten-Zeilen-Liste (ohne File/Blob).
 * @param {unknown[]} arr
 * @returns {unknown[]}
 */
function ccInternCloneChecklisteItems(arr) {
  if (!Array.isArray(arr)) return [];
  try {
    return JSON.parse(JSON.stringify(arr));
  } catch {
    return arr.slice();
  }
}

/**
 * Wenn `schritte[a.step].checkliste` fehlt/leer, aber Legacy `checklisten` existiert,
 * einmalig in den aktuellen Schritt kopieren (kein DB-Migrate, nur RAM nach Load).
 * @param {Record<string, unknown>} a
 */
export function ccInternHydrateSchrittChecklisteFromLegacy(a) {
  if (!a || typeof a !== 'object') return;
  const step = a.step != null ? String(a.step) : '';
  if (!step || step === 'abgeschlossen') return;
  const steps = a.schritte;
  if (!steps || typeof steps !== 'object') return;
  const sch = /** @type {Record<string, unknown>} */ (/** @type {object} */ (steps))[step];
  if (!sch || typeof sch !== 'object') return;
  const cl = sch.checkliste;
  if (Array.isArray(cl) && cl.length) return;
  const leg = a.checklisten;
  if (!Array.isArray(leg) || !leg.length) return;
  sch.checkliste = ccInternCloneChecklisteItems(/** @type {unknown[]} */ (leg));
}

/**
 * `a.checklisten` aus allen Schritt-Checklisten ableiten (Legacy-Kopie, dedupliziert pro Schritt+Text).
 * Wird vor dem Serialisieren in `bemerkung` aufgerufen.
 * @param {Record<string, unknown>} a
 */
export function ccInternSyncLegacyChecklistenFromSchritte(a) {
  if (!a || typeof a !== 'object') return;
  const steps = a.schritte;
  if (!steps || typeof steps !== 'object') return;
  const seen = {};
  const flat = [];
  ['grafik', 'druck', 'laminat', 'montage', 'doku'].forEach(function (st) {
    const sch = /** @type {Record<string, unknown>} */ (/** @type {object} */ (steps))[st];
    if (!sch || !Array.isArray(sch.checkliste)) return;
    sch.checkliste.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      const t = /** @type {{ text?: unknown }} */ (it).text != null ? String(/** @type {{ text?: unknown }} */ (it).text) : '';
      const key = st + '|' + t;
      if (t && !seen[key]) {
        seen[key] = true;
        flat.push(it);
      }
    });
  });
  if (flat.length) {
    /** @type {Record<string, unknown>} */ (a).checklisten = flat;
  }
}

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
export function apiRowToUi(row) {
  const bemerkung = row.bemerkung != null ? String(row.bemerkung) : '';
  const payload = parseChecklistenFromBemerkung(bemerkung);
  console.log('AFTER LOAD', payload);
  const auftragsnummer = row.auftragsnummer || payload.id;
  const out = Object.assign({}, payload, {
    ccApiId: row.id,
    id: auftragsnummer || row.id,
    kunde: row.kunde != null ? row.kunde : payload.kunde,
    step: payload.step || row.schritt || 'draft',
    terminDatum:
      payload.terminDatum ||
      (row.lieferdatum ? String(row.lieferdatum).slice(0, 10) : '') ||
      '',
    montageDatum:
      payload.montageDatum ||
      (row.montage_datum ? String(row.montage_datum).slice(0, 10) : '') ||
      '',
    liefertermin: payload.liefertermin || '',
  });
  ccInternHydrateSchrittChecklisteFromLegacy(/** @type {Record<string, unknown>} */ (out));
  ccInternEnsureSchritteSkeletonFromApiRow(/** @type {Record<string, unknown>} */ (out));
  return out;
}

/** Workflow-Schritt-Aliase (minimal, wie Mobile `mobCanonicalWorkflowStep`). */
const CCINTERN_WORKFLOW_STEP_ALIASES = {
  digitaldruck: 'druck',
  plot: 'druck',
  plotten: 'druck',
  schnitt: 'laminat',
  laminieren: 'laminat',
};

/**
 * @param {unknown} stepRaw
 * @returns {string}
 */
function canonicalWorkflowStepForApi(stepRaw) {
  const s = stepRaw != null ? String(stepRaw).trim().toLowerCase() : '';
  if (!s || s === 'draft' || s === 'abgeschlossen') return s;
  return CCINTERN_WORKFLOW_STEP_ALIASES[s] || s;
}

/**
 * Wenn `row.schritt` gesetzt ist, aber `bemerkung` kein `schritte[step]` liefert:
 * minimalen Schritt-Skeleton anlegen, damit Produktions-Pool/MA-Zuordnung in der App greifen kann.
 * @param {Record<string, unknown>} out
 */
export function ccInternEnsureSchritteSkeletonFromApiRow(out) {
  if (!out || typeof out !== 'object') return;
  const stepRaw = out.step != null ? String(out.step) : '';
  if (!stepRaw || stepRaw === 'draft' || stepRaw === 'abgeschlossen') return;
  if (!out.schritte || typeof out.schritte !== 'object') {
    out.schritte = {};
  }
  const steps = /** @type {Record<string, unknown>} */ (/** @type {object} */ (out.schritte));
  const canon = canonicalWorkflowStepForApi(stepRaw);
  let found = false;
  const tryKeys = [stepRaw, canon];
  let ti;
  for (ti = 0; ti < tryKeys.length; ti++) {
    const k = tryKeys[ti];
    if (k && steps[k] && typeof steps[k] === 'object') {
      found = true;
      break;
    }
  }
  if (!found) {
    const keys = Object.keys(steps);
    for (ti = 0; ti < keys.length; ti++) {
      if (canonicalWorkflowStepForApi(keys[ti]) === canon) {
        found = true;
        break;
      }
    }
  }
  if (!found) {
    const sk = canon || stepRaw;
    steps[sk] = { status: 'offen' };
  }
}

/**
 * @param {Record<string, unknown>} a
 */
export function uiToApiBody(a) {
  if (ccInternClAuditEnabled()) {
    logCcInternChecklistAuditFromUi(a, 'uiToApiBody: RAM unmittelbar vor safeJsonClone', {});
  }
  const copy = safeJsonClone(a);
  normalizeSchritteCockpitMaToUserUuid(/** @type {Record<string, unknown>} */(copy));
  ccInternSyncLegacyChecklistenFromSchritte(/** @type {Record<string, unknown>} */(copy));
  if (ccInternClAuditEnabled()) {
    logCcInternChecklistAuditFromUi(copy, 'uiToApiBody: nach safeJsonClone (= Payload in bemerkung)', {});
  }
  const kunde = (copy.kunde && String(copy.kunde).trim()) || 'Unbekannt';
  const bemerkung = serializeBemerkungPayload(copy);
  const firmaIdRaw =
    typeof window !== 'undefined' ? window.COCKPIT_FIRMA_ID || window.__COCKPIT_FIRMA_ID : null;
  const firmaId =
    firmaIdRaw != null && String(firmaIdRaw).trim() !== '' ? String(firmaIdRaw).trim() : null;
  return {
    kunde,
    status: nullableStr(copy.statusText || copy.druckStatus || copy.status),
    schritt: nullableStr(copy.step || copy.schritt),
    prioritaet: nullableStr(copy.prioritaet),
    lieferdatum: isoOrNull(copy.terminDatum || copy.liefertermin),
    montage_datum: montageDatumIsoForApi(copy.montageDatum, copy.montageZeit),
    montageDatum: montageDatumIsoForApi(copy.montageDatum, copy.montageZeit),
    bemerkung,
    ...(firmaId ? { firma_id: firmaId } : {}),
  };
}

/** @param {number} page @param {number} limit */
function buildAuftraegeListQuery(page, limit) {
  let qs = '?page=' + encodeURIComponent(String(page)) + '&limit=' + encodeURIComponent(String(limit));
  if (typeof window !== 'undefined') {
    const fid = window.COCKPIT_FIRMA_ID || window.__COCKPIT_FIRMA_ID;
    if (fid != null && String(fid).trim() !== '') {
      qs += '&firma_id=' + encodeURIComponent(String(fid).trim());
    }
  }
  return qs;
}

/** @param {string} qs — nur für Aufrufer mit fertigem Query-String */
async function fetchAuftraegePage(qs) {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ccintern_debug_x_project_id') === '1') {
      console.log('PROJECT ID (ccintern GET auftraege):', getCurrentProjectId() || '(leer)');
    }
  } catch {
    /* ignore */
  }
  return apiFetch(API_ROUTES.ccintern.auftraege + qs);
}

async function fetchAllAuftraegeRowsRobust() {
  const maDiag =
    typeof window !== 'undefined' && window.__CCINTERN_MITARBEITER_APP_BOOT__ === true;
  const listPath = API_ROUTES.ccintern.auftraege + buildAuftraegeListQuery(1, 200);
  if (maDiag) {
    console.warn('[MA_AUFTRAEGE_GET]', {
      path: listPath,
      projectId: getCurrentProjectId() || null,
      firmaId: readOptionalCockpitFirmaIdForMitarbeiterApi() || null,
    });
  }
  try {
    const first = await fetchAuftraegePage(buildAuftraegeListQuery(1, 200));
    if (first && first.items != null && !Array.isArray(first.items)) {
      console.error('API DATA FEHLER', first);
      return [];
    }
    const items0 = first && Array.isArray(first.items) ? first.items : [];
    if (maDiag) {
      console.warn('[MA_AUFTRAEGE_RESPONSE]', {
        path: listPath,
        ok: true,
        count: items0.length,
        total: first && first.pagination && first.pagination.total != null ? first.pagination.total : items0.length,
        sampleIds: items0.slice(0, 8).map(function (r) {
          return r && (r.auftragsnummer || r.id);
        }),
      });
    }
    const pag0 = first && typeof first.pagination === 'object' ? first.pagination : {};
    const all = items0.slice();
    const total = pag0.total != null ? Number(pag0.total) : items0.length;
    let page = 2;
    for (; all.length < total && page < 200; page += 1) {
      const res = await fetchAuftraegePage(buildAuftraegeListQuery(page, 200));
      const items = res && Array.isArray(res.items) ? res.items : [];
      if (!Array.isArray(items)) {
        console.error('API DATA FEHLER', res);
        return all;
      }
      if (!items.length) break;
      all.push.apply(all, items);
    }
    return all;
  } catch (e) {
    if (maDiag) {
      console.warn('[MA_AUFTRAEGE_RESPONSE]', {
        path: listPath,
        ok: false,
        status: e && typeof e === 'object' && 'status' in e ? /** @type {{ status?: number }} */ (e).status : null,
        message: e instanceof Error ? e.message : String(e),
        code: e && typeof e === 'object' && 'code' in e ? /** @type {{ code?: string }} */ (e).code : null,
      });
    }
    console.error('[ccintern-cockpit-api] fetchAllAuftraegeRowsRobust', e);
    throw e;
  }
}

/**
 * Rohliste Auftragszeilen vom Backend (Pagination eingerechnet). Kein localStorage.
 * @returns {Promise<Array>}
 */
export async function loadAuftraege() {
  try {
    const rows = await fetchAllAuftraegeRowsRobust();
    if (!Array.isArray(rows)) {
      console.error('API DATA FEHLER', rows);
      return [];
    }
    return rows;
  } catch (e) {
    console.error('API DATA FEHLER', e);
    return [];
  }
}

/**
 * @param {string} von ISO YYYY-MM-DD
 * @param {string} bis ISO YYYY-MM-DD
 * @param {number} page
 * @param {number} limit
 */
async function fetchKalenderPage(von, bis, page, limit) {
  const ctx = await hydrateCockpitAccessibleProjectsAndEnsureContext();
  if (ctx.ok === false) {
    const err = new Error('Projekt-Kontext fehlt');
    // @ts-ignore
    err.code = 'PROJECT_CONTEXT_REQUIRED';
    throw err;
  }
  const pid = getCurrentProjectId();
  if (!pid) {
    const err = new Error('Projekt-Kontext fehlt');
    // @ts-ignore
    err.code = 'PROJECT_CONTEXT_REQUIRED';
    throw err;
  }
  let qs = '?page=' + encodeURIComponent(String(page)) + '&limit=' + encodeURIComponent(String(limit));
  if (typeof window !== 'undefined') {
    const fid = window.COCKPIT_FIRMA_ID || window.__COCKPIT_FIRMA_ID;
    if (fid != null && String(fid).trim() !== '') {
      qs += '&firma_id=' + encodeURIComponent(String(fid).trim());
    }
  }
  if (von) qs += '&von=' + encodeURIComponent(von);
  if (bis) qs += '&bis=' + encodeURIComponent(bis);
  qs += '&_ccKalCb=' + encodeURIComponent(String(Date.now()));
  return apiFetch(API_ROUTES.stammdaten.kalender + qs, {
    headers: { 'x-project-id': pid },
    cache: 'no-store',
  });
}

/**
 * @param {string} von ISO YYYY-MM-DD
 * @param {string} bis ISO YYYY-MM-DD
 */
export async function fetchAllKalenderTermine(von, bis) {
  const all = [];
  let page = 1;
  const limit = 200;
  for (;;) {
    const res = await fetchKalenderPage(von, bis, page, limit);
    const items = res && Array.isArray(res.termine) ? res.termine : [];
    const total = res != null && res.total != null ? Number(res.total) : items.length;
    for (let i = 0; i < items.length; i++) {
      all.push(items[i]);
    }
    if (all.length >= total || items.length < limit) break;
    page += 1;
    if (page > 200) break;
  }
  return all;
}

/**
 * Lädt den gemeinsamen Kalender-Feed und übergibt die Rohzeilen an `window.ccInternApplyKalenderApiRows`.
 * @param {(msg: string) => void} [showToast]
 * @returns {Promise<Error|null>}
 */
export async function reloadCcInternKalenderFeed(showToast) {
  if (skipKalenderFeedForMaAppOnly()) {
    return null;
  }
  if (!hasCockpitAuftraegeApi()) {
    if (typeof window !== 'undefined') {
      window.__CCINTERN_KALENDER_FEED_OK__ = false;
    }
    return null;
  }
  if (typeof window !== 'undefined') {
    window.__CCINTERN_KALENDER_FEED_OK__ = false;
    window.__CCINTERN_KALENDER_VIEW_ITEMS__ = [];
  }
  try {
    const now = new Date();
    const vonD = new Date(now);
    vonD.setDate(vonD.getDate() - 400);
    const bisD = new Date(now);
    bisD.setDate(bisD.getDate() + 730);
    const von = vonD.toISOString().slice(0, 10);
    const bis = bisD.toISOString().slice(0, 10);
    const rows = await fetchAllKalenderTermine(von, bis);
    try {
      if (
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem('ccintern_kalender_api_debug') === '1' &&
        typeof console !== 'undefined'
      ) {
        console.info('[KALENDER API RAW stammdaten/kalender]', { von, bis, count: rows.length, sample: rows[0] || null });
      }
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined' && typeof window.ccInternApplyKalenderApiRows === 'function') {
      window.ccInternApplyKalenderApiRows(rows);
    } else if (typeof window !== 'undefined') {
      window.__CCINTERN_KALENDER_FEED_OK__ = false;
    }
    return null;
  } catch (e) {
    console.error('[ccintern-cockpit-api] reloadCcInternKalenderFeed', e);
    if (typeof window !== 'undefined') {
      window.__CCINTERN_KALENDER_FEED_OK__ = false;
    }
    if (showToast) showToast('⚠ Kalender: ' + (e && e.message ? e.message : String(e)));
    return e instanceof Error ? e : new Error(String(e));
  }
}

function auftraegeTarget() {
  if (typeof window === 'undefined') return null;
  if (window._AUFTRAEGE_CANON && Array.isArray(window._AUFTRAEGE_CANON)) return window._AUFTRAEGE_CANON;
  if (window.AUFTRAEGE && Array.isArray(window.AUFTRAEGE)) return window.AUFTRAEGE;
  return null;
}

/**
 * Nach erfolgreichem API-Flush: INTERN-Aufgaben aus Workflow neu abgleichen + Mobile-Home refreshen.
 * Nutzt nur `sch.maId` / `sch.maIds` / `sch.teamMaIds` des aktuellen Schritts (keine Namens-Matches).
 */
function ccInternMobSyncAfterAuftraegeFlush() {
  const W = typeof globalThis !== 'undefined' ? globalThis : {};
  const arr = auftraegeTarget();
  if (!arr || !arr.length) {
    if (typeof W.mobRenderHome === 'function') W.mobRenderHome();
    return;
  }
  const seen = Object.create(null);
  const mids = [];
  function addMid(v) {
    if (v == null) return;
    const s = String(v).trim();
    if (!s || s === 'undefined' || seen[s]) return;
    seen[s] = true;
    mids.push(s);
  }
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (!a || a._ccDeleted || !a.schritte || typeof a.schritte !== 'object') continue;
    const stepRaw = a.step;
    if (stepRaw == null || String(stepRaw).trim() === '') continue;
    const sch = /** @type {Record<string, unknown> | null} */ (
      a.schritte[stepRaw] || a.schritte[String(stepRaw)]
    );
    if (!sch || typeof sch !== 'object') continue;
    addMid(sch.maId);
    if (Array.isArray(sch.maIds)) sch.maIds.forEach(addMid);
    if (Array.isArray(sch.teamMaIds)) sch.teamMaIds.forEach(addMid);
  }
  const syncFn = W.mobSynchronisiereInternAufgabenMitWorkflow;
  if (typeof syncFn === 'function') {
    for (let j = 0; j < mids.length; j++) syncFn(mids[j]);
  }
  if (typeof W.mobRenderHome === 'function') W.mobRenderHome();
}

/**
 * @param {(msg: string) => void} [showToast]
 * @returns {Promise<Error|null>}
 */
export async function reloadAuftraegeFromApiIntoMemory(showToast) {
  try {
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }
    const arr = auftraegeTarget();
    if (!arr) {
      const err = new Error('AUFTRAEGE nicht initialisiert');
      if (showToast) showToast('⚠ ' + err.message);
      return err;
    }
    const rows = await fetchAllAuftraegeRowsRobust();
    if (!Array.isArray(rows)) {
      console.error('API DATA FEHLER', rows);
      if (showToast) showToast('⚠ Aufträge: ungültige API-Antwort');
      return new Error('auftraege-invalid-response');
    }

    if (ccInternClAuditEnabled()) {
      console.info('[CC-INTERN-CL-AUDIT] reload aus API', { zeilen: rows.length, quelle: 'GET /api/v1/ccintern/auftraege' });
      rows.forEach(function (row) {
        if (!row || typeof row !== 'object') return;
        const bem = row.bemerkung != null ? String(row.bemerkung) : '';
        const sm = summarizeChecklistenInBemerkung(bem);
        if (sm.hasSchritte || sm.legacyChecklistenItems != null) {
          console.info('[CC-INTERN-CL-AUDIT] Server-Zeile (row.bemerkung)', {
            ccApiId: row.id,
            auftragsnummer: row.auftragsnummer,
            checklistenInBemerkung: sm,
          });
        }
      });
    }
    if (ccInternClAuditEnabled()) {
      console.info(
        '[CC-INTERN-CL-AUDIT] CHECKLISTE LOAD (Zeilen)',
        rows.length,
        '— Detail nur mit ccintern_cl_audit=1 in Zeilen-Loop',
      );
    }

    const ramBefore = arr.length;
    arr.length = 0;
    rows.forEach(function (row) {
      const ui = apiRowToUi(row);
      if (ccInternClAuditEnabled()) {
        const sm = summarizeSchritteFromAuftragObj(ui);
        if (sm.hasSchritte || sm.legacyChecklistenItems != null) {
          console.info('[CC-INTERN-CL-AUDIT] reload → RAM nach apiRowToUi (aus row.bemerkung / payload)', sm);
        }
      }
      arr.push(ui);
    });
    _pendingDirtyAuftragKeys.clear();

    // Kein lokales Re-Append: AUFTRAEGE spiegelt strikt den Backend-Stand.
    if (typeof window !== 'undefined' && window.__CCINTERN_MITARBEITER_APP_BOOT__ === true) {
      console.warn('[MA_AUFTRAEGE_AFTER_LOAD]', {
        ramBefore: ramBefore,
        ramAfter: arr.length,
        replaced: true,
        projectId: getCurrentProjectId() || null,
      });
      if (typeof window.maLogAuftraegeNachReload === 'function') {
        try {
          window.maLogAuftraegeNachReload(rows);
        } catch (eMaF) {
          console.warn('[MA_AUFTRAEGE_FILTER]', { error: eMaF instanceof Error ? eMaF.message : String(eMaF) });
        }
      }
    }
    if (typeof window.auNrRecalculate === 'function') window.auNrRecalculate();
    if (typeof window.renderAuftragVerwaltung === 'function') window.renderAuftragVerwaltung();
    if (typeof window.renderKanban === 'function') window.renderKanban();
    if (!skipKalenderFeedForMaAppOnly() && typeof window.ccInternRefreshKalenderFromApi === 'function') {
      try {
        await window.ccInternRefreshKalenderFromApi(null);
      } catch {
        /* Kalender optional */
      }
    }
    return null;
  } catch (e) {
    console.error('[ccintern-cockpit-api] reloadAuftraegeFromApiIntoMemory', e);
    if (showToast) showToast('⚠ Aufträge laden: ' + (e && e.message ? e.message : String(e)));
    return e instanceof Error ? e : new Error(String(e));
  }
}

/** Cockpit-Mount: Aufträge nur über dieses Modul (GET/POST/PUT/DELETE /api/v1/ccintern/auftraege). */
export function hasCockpitAuftraegeApi() {
  if (typeof window === 'undefined') return false;
  const api = window.CCIntern && window.CCIntern.cockpitApi;
  return !!(
    api &&
    typeof api.reloadAuftraegeFromApiIntoMemory === 'function' &&
    typeof api.scheduleSaveAuftraege === 'function'
  );
}

const NO_API_LOAD_MSG =
  'Aufträge: Kein Cockpit-API-Kontext — Laden nur über /api/v1/ccintern/auftraege möglich (kein localStorage).';
const NO_API_SAVE_MSG =
  'Aufträge: Kein Cockpit-API-Kontext — Speichern abgebrochen (kein localStorage-Fallback).';

/**
 * Einziger unterstützter Load-Pfad für Aufträge: API → RAM.
 * @param {(msg: string) => void} [showToast]
 * @param {(err: Error|null) => void} [callback]
 */
export async function runLoadAuftraegeFromApi(showToast, callback) {
  if (!hasCockpitAuftraegeApi()) {
    console.error('[ccintern-cockpit-api]', NO_API_LOAD_MSG);
    if (showToast) showToast('⚠ ' + NO_API_LOAD_MSG);
    if (callback) callback(new Error('no-cockpit-api'));
    return;
  }
  const err = await reloadAuftraegeFromApiIntoMemory(showToast || null);
  // Kein Auto-Archiv bei rechnung='geschrieben': Aufträge bleiben in „Aufträge“ sichtbar; Archiv nur manuell / eigene Funktion.
  if (callback) callback(err);
}

/**
 * Einziger unterstützter Save-Pfad für Aufträge: Debounce → Flush zur API.
 * @param {(msg: string) => void} [showToast]
 * @returns {boolean} false wenn kein API-Kontext
 */
/**
 * @param {(msg: string) => void} [showToast]
 * @param {unknown} [auftragIdHint] — nur diesen Auftrag flushen (Chat/Kommentar); ohne Hint alle Aufträge (Legacy).
 */
/** @returns {boolean} */
function ccInternIsMaAppOnlyBoot() {
  try {
    if (typeof window !== 'undefined' && window.__CCINTERN_MITARBEITER_APP_BOOT__ === true) return true;
    const ui = typeof window !== 'undefined' ? window.CC_SHELL_UI_ACCESS : null;
    if (ui && ui.isMitarbeiterAppOnlyShell === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Auftrag für nächsten Flush markieren (nur dieser wird PUT/POST — kein Full-RAM-Flush).
 * @param {unknown} auftragId
 */
export function touchAuftragDirty(auftragId) {
  addDirtyKeysForAuftragId(auftragId);
}

export function runSaveAuftraege(showToast, auftragIdHint) {
  if (!hasCockpitAuftraegeApi()) {
    console.error('[ccintern-cockpit-api]', NO_API_SAVE_MSG);
    if (showToast) showToast('⚠ ' + NO_API_SAVE_MSG);
    return false;
  }
  if (auftragIdHint != null && String(auftragIdHint).trim() !== '') {
    addDirtyKeysForAuftragId(auftragIdHint);
  } else if (!ccInternIsMaAppOnlyBoot()) {
    markAllAuftraegeDirtyForPersist();
  }
  if (_pendingDirtyAuftragKeys.size === 0) {
    if (ccInternIsMaAppOnlyBoot()) {
      console.warn('[MA_SAVE_SKIP]', {
        reason: 'kein-dirty-auftrag',
        hint: 'saveAuftraege(…, auftragId) oder touchAuftragDirty(id) vor dem Speichern',
      });
    }
    return false;
  }
  scheduleSaveAuftraege(showToast || null);
  return true;
}

let _saveTimer = null;
let _saving = false;

/** Nur diese Aufträge beim nächsten Flush per PUT/POST (verhindert stale RAM → Kommentar-Verlust). */
/** @type {Set<string>} */
let _pendingDirtyAuftragKeys = new Set();

/**
 * @param {unknown} auftragId
 * @returns {Record<string, unknown>|null}
 */
function findAuftragInRamByAnyId(auftragId) {
  const t = auftragId != null ? String(auftragId).trim() : '';
  if (!t) return null;
  const arr = auftraegeTarget();
  if (!arr || !arr.length) return null;
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (!a || a._ccDeleted) continue;
    if (String(a.id) === t || String(a.ccApiId) === t) return a;
    if (
      typeof window !== 'undefined' &&
      typeof window.mobAuftragIdsGleich === 'function' &&
      window.mobAuftragIdsGleich(a.id, t)
    ) {
      return a;
    }
  }
  return null;
}

/**
 * @param {unknown} auftragId
 */
function addDirtyKeysForAuftragId(auftragId) {
  const t = auftragId != null ? String(auftragId).trim() : '';
  if (!t) return;
  _pendingDirtyAuftragKeys.add(t);
  const a = findAuftragInRamByAnyId(t);
  if (a) {
    if (a.id != null && String(a.id).trim() !== '') _pendingDirtyAuftragKeys.add(String(a.id).trim());
    if (a.ccApiId != null && String(a.ccApiId).trim() !== '') {
      _pendingDirtyAuftragKeys.add(String(a.ccApiId).trim());
    }
  }
}

function markAllAuftraegeDirtyForPersist() {
  _pendingDirtyAuftragKeys.clear();
  const arr = auftraegeTarget();
  if (!arr) return;
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (!a || a._ccDeleted) continue;
    addDirtyKeysForAuftragId(a.id);
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} a
 */
function auftragMatchesPendingDirty(a) {
  if (!a) return false;
  if (_pendingDirtyAuftragKeys.size === 0) return false;
  const id = a.id != null ? String(a.id).trim() : '';
  const apiId = a.ccApiId != null ? String(a.ccApiId).trim() : '';
  if (id && _pendingDirtyAuftragKeys.has(id)) return true;
  if (apiId && _pendingDirtyAuftragKeys.has(apiId)) return true;
  return false;
}

/**
 * @param {Record<string, unknown>|null|undefined} a
 * @returns {object}
 */
export function chatDiagSnapshotFromAuftrag(a) {
  const km = a && Array.isArray(a.kommentare) ? a.kommentare : [];
  const last = km.length ? km[km.length - 1] : null;
  return {
    auftragId: a && a.id != null ? String(a.id) : '',
    ccApiId: a && a.ccApiId != null ? String(a.ccApiId) : '',
    schritt: a && (a.step != null || a.schritt != null) ? String(a.step || a.schritt) : '',
    kommentareLength: km.length,
    lastText: last && last.text != null ? String(last.text).slice(0, 160) : '',
    lastAutor: last && (last.autor != null || last.von != null) ? String(last.autor || last.von) : '',
    lastAutorMaId: last && last.autorMaId != null ? String(last.autorMaId) : '',
  };
}

/**
 * @param {string} bemerkungStr
 */
function chatDiagSnapshotFromBemerkung(bemerkungStr) {
  const payload = parseChecklistenFromBemerkung(bemerkungStr != null ? String(bemerkungStr) : '');
  const km = Array.isArray(payload.kommentare) ? payload.kommentare : [];
  const last = km.length ? km[km.length - 1] : null;
  return {
    kommentareLength: km.length,
    lastText: last && last.text != null ? String(last.text).slice(0, 160) : '',
    lastAutor: last && (last.autor != null || last.von != null) ? String(last.autor || last.von) : '',
    lastAutorMaId: last && last.autorMaId != null ? String(last.autorMaId) : '',
  };
}

/**
 * Kommentare zusammenführen: Server-Reihenfolge + lokale Nur-lokal-Zeilen; bei gleicher id Overlay (lokal).
 * @param {unknown[]} serverList
 * @param {unknown[]} localList
 * @returns {Record<string, unknown>[]}
 */
export function mergeCcInternKommentare(serverList, localList) {
  const server = Array.isArray(serverList) ? serverList : [];
  const local = Array.isArray(localList) ? localList : [];
  const localById = {};
  for (let i = 0; i < local.length; i++) {
    const lk = local[i];
    if (!lk || typeof lk !== 'object' || /** @type {{ id?: unknown }} */ (lk).id == null) continue;
    localById[String(/** @type {{ id?: unknown }} */ (lk).id)] = /** @type {Record<string, unknown>} */ (lk);
  }
  const out = [];
  const seen = {};
  for (let si = 0; si < server.length; si++) {
    const sk = server[si];
    if (!sk || typeof sk !== 'object' || /** @type {{ id?: unknown }} */ (sk).id == null) continue;
    const id = String(/** @type {{ id?: unknown }} */ (sk).id);
    seen[id] = true;
    const lk = localById[id];
    out.push(lk ? Object.assign({}, sk, lk) : /** @type {Record<string, unknown>} */ (sk));
  }
  for (let li = 0; li < local.length; li++) {
    const lk = local[li];
    if (!lk || typeof lk !== 'object' || /** @type {{ id?: unknown }} */ (lk).id == null) continue;
    const id = String(/** @type {{ id?: unknown }} */ (lk).id);
    if (seen[id]) continue;
    seen[id] = true;
    out.push(/** @type {Record<string, unknown>} */ (lk));
  }
  return out;
}

/**
 * @param {Record<string, unknown>|null|undefined} apiRow
 * @returns {Record<string, unknown>[]}
 */
function kommentareFromApiAuftragRow(apiRow) {
  if (!apiRow) return [];
  const payload = parseChecklistenFromBemerkung(
    apiRow.bemerkung != null ? String(apiRow.bemerkung) : '',
  );
  const km = payload.kommentare;
  return Array.isArray(km)
    ? /** @type {Record<string, unknown>[]} */ (km.map(function (k) {
        return k && typeof k === 'object' ? /** @type {Record<string, unknown>} */ (k) : null;
      }).filter(Boolean))
    : [];
}

/**
 * GET /api/v1/ccintern/auftraege/:ccApiId — aktuelle bemerkung vom Server.
 * @param {string} ccApiId
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function fetchCcInternAuftragApiRow(ccApiId) {
  const res = await apiFetch(
    API_ROUTES.ccintern.auftraege + '/' + encodeURIComponent(String(ccApiId)),
    { cache: 'no-store' },
  );
  const row = res && typeof res.auftrag === 'object' ? res.auftrag : null;
  return row ? /** @type {Record<string, unknown>} */ (row) : null;
}

/**
 * Vor PUT: Server-kommentare mit RAM mergen (optional neue Zeilen anhängen).
 * @param {Record<string, unknown>} a UI-Auftrag in AUFTRAEGE
 * @param {Record<string, unknown>[]} [appendKommentare] noch nicht in RAM (z. B. neue Nachricht)
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function ccInternMergeKommentareFromServerIntoAuftrag(a, appendKommentare) {
  if (!a) return [];
  const ccApiId = a.ccApiId != null && isUuid(String(a.ccApiId)) ? String(a.ccApiId).trim() : '';
  let serverKm = [];
  if (ccApiId) {
    try {
      const row = await fetchCcInternAuftragApiRow(ccApiId);
      serverKm = kommentareFromApiAuftragRow(row);
      console.warn('[CHAT_MERGE_GET]', {
        auftragId: a.id != null ? String(a.id) : '',
        ccApiId,
        serverKommentareLength: serverKm.length,
      });
    } catch (mergeGetErr) {
      console.warn('[CHAT_MERGE_GET_FAIL]', {
        auftragId: a.id != null ? String(a.id) : '',
        ccApiId,
        message: mergeGetErr instanceof Error ? mergeGetErr.message : String(mergeGetErr),
      });
    }
  }
  const localKm = Array.isArray(a.kommentare)
    ? /** @type {Record<string, unknown>[]} */ (a.kommentare.slice())
    : [];
  const pending = Array.isArray(appendKommentare) ? appendKommentare : [];
  const merged = mergeCcInternKommentare(serverKm, localKm.concat(pending));
  a.kommentare = merged;
  console.warn('[CHAT_MERGE_RESULT]', {
    auftragId: a.id != null ? String(a.id) : '',
    ccApiId: ccApiId || null,
    serverKommentareLength: serverKm.length,
    localKommentareLength: localKm.length,
    mergedKommentareLength: merged.length,
  });
  return merged;
}

/**
 * @param {Record<string, unknown>[]} arr
 */
function pickAuftraegeForFlush(arr) {
  const all = (arr || []).filter(function (x) {
    return x && !x._ccDeleted;
  });
  if (_pendingDirtyAuftragKeys.size === 0) return [];
  return all.filter(function (a) {
    return auftragMatchesPendingDirty(a);
  });
}

/**
 * Nach POST: Anzeige-ID des Auftrags wechselt oft (lokal → Auftragsnummer). INTERN_AUFGABEN.auftragId nachziehen.
 * @param {unknown} prevId
 * @param {unknown} nextId
 */
function remapInternAufgabenAuftragId(prevId, nextId) {
  if (prevId == null || nextId == null || String(prevId) === String(nextId)) return;
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const arr = g.INTERN_AUFGABEN;
  if (!Array.isArray(arr)) return;
  let touched = 0;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (x && String(x.auftragId) === String(prevId)) {
      x.auftragId = nextId;
      touched++;
    }
  }
  if (touched > 0 && typeof g.saveAufgaben === 'function') g.saveAufgaben();
}

/**
 * @param {(msg: string) => void} [showToast]
 */
export function scheduleSaveAuftraege(showToast) {
  const arr = auftraegeTarget();
  const hasNew =
    arr &&
    arr.some(function (a) {
      return (
        a &&
        !a._ccDeleted &&
        (!a.ccApiId || !isUuid(String(a.ccApiId)))
      );
    });
  if (hasNew) {
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }
    flushAuftraegeToApi(showToast);
    return;
  }
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function () {
    _saveTimer = null;
    flushAuftraegeToApi(showToast);
  }, 500);
}

/**
 * @param {(msg: string) => void} [showToast]
 */
async function flushAuftraegeToApi(showToast) {
  const arr = auftraegeTarget();
  // Gleiche Referenz wie `window.AUFTRAEGE` / `_AUFTRAEGE_CANON` (Esm hat kein globales AUFTRAEGE-Ident).
  if (ccInternClAuditEnabled()) {
    const a = (arr && Array.isArray(arr) ? arr : []) || [];
    console.log('FLUSH START', a.filter((x) => x && !x.ccApiId).map((x) => x.id));
  }
  if (!arr || !arr.length) {
    await reloadAuftraegeFromApiIntoMemory(showToast);
    return;
  }
  if (_saving) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      _saveTimer = null;
      flushAuftraegeToApi(showToast);
    }, 500);
    return;
  }
  _saving = true;
  /** Pro Flush-Lauf maximal eine Nutzer-Toast; verhindert Toast-Sturm bei mehreren fehlgeschlagenen Zeilen. */
  let anyFlushUserToast = false;
  function notifyFlushErr(/** @type {string} */ m) {
    if (!showToast || anyFlushUserToast) return;
    anyFlushUserToast = true;
    showToast(m);
  }
  const flushList = pickAuftraegeForFlush(arr);
  if (flushList.length === 0 && _pendingDirtyAuftragKeys.size > 0) {
    console.warn('[ccintern-cockpit-api] flush: dirty Auftrag nicht in RAM gefunden', {
      dirtyKeys: Array.from(_pendingDirtyAuftragKeys),
    });
  }
  if (flushList.length === 0) {
    if (ccInternIsMaAppOnlyBoot()) {
      console.warn('[MA_SAVE_FLUSH_SKIP]', { dirtyKeys: Array.from(_pendingDirtyAuftragKeys) });
    }
    _pendingDirtyAuftragKeys.clear();
    _saving = false;
    return;
  }
  try {
    for (let i = 0; i < flushList.length; i++) {
      const a = flushList[i];
      if (!a || a._ccDeleted) continue;
      normalizeSchritteCockpitMaToUserUuid(/** @type {Record<string, unknown>} */(a));
      const checklistenState = {
        schritte: a.schritte && typeof a.schritte === 'object' ? a.schritte : {},
        checklisten: Array.isArray(a.checklisten) ? a.checklisten : [],
      };
      if (ccInternClAuditEnabled()) {
        logCcInternChecklistAuditFromUi(a, 'flush: RAM direkt vor uiToApiBody (Loop)', { loopIndex: i });
      }
      const body = uiToApiBody(a);
      const bodyBemerkung = body && body.bemerkung != null ? String(body.bemerkung) : '';
      const chatInPayload = chatDiagSnapshotFromBemerkung(bodyBemerkung);
      const chatPutDiag = {
        ...chatDiagSnapshotFromAuftrag(a),
        kommentareInBemerkung: chatInPayload,
        dirtyKeys: Array.from(_pendingDirtyAuftragKeys),
      };
      console.warn('[CHAT_PUT_PAYLOAD]', chatPutDiag);
      if (ccInternIsMaAppOnlyBoot()) {
        console.warn('[MA_CHAT_PUT_PAYLOAD]', chatPutDiag);
      }
      if (!bodyBemerkung.trim() && hasChecklistenData(a)) {
        const fallbackPayload = safeJsonClone(a);
        body.bemerkung = serializeBemerkungPayload(fallbackPayload);
      }
      const checklistSummaryBeforePut = summarizeChecklistenInBemerkung(
        body && body.bemerkung != null ? String(body.bemerkung) : '',
      );
      if (ccInternClAuditEnabled()) {
        console.log('CHECKLISTE SAVE', checklistenState, body.bemerkung, checklistSummaryBeforePut);
        console.log('AFTER DELETE SAVE', checklistenState);
        const ramSum = summarizeSchritteFromAuftragObj(a);
        const bemSum = summarizeChecklistenInBemerkung(body.bemerkung != null ? String(body.bemerkung) : '');
        console.info('[CC-INTERN-CL-AUDIT]', 'flush: Abgleich RAM vs serialisierte bemerkung', {
          anzeigeId: a.id,
          ccApiId: a.ccApiId,
          ramStepChecklisten: ramSum.stepChecklisten,
          bemerkungStepChecklisten: bemSum.stepChecklisten,
          ramLegacyItems: ramSum.legacyChecklistenItems,
          bemerkungLegacyItems: bemSum.legacyChecklistenItems,
        });
      }
      const apiId = a.ccApiId;
      if (!apiId || !isUuid(String(apiId))) {
        if (a._ccPostInFlight) continue;
        a._ccPostInFlight = true;
        try {
          const prevDisplayId = a.id;
          logCcInternClAudit(String(a.id != null ? a.id : ''), '(POST neu)', body, 'POST vor Request');
          try {
            const res = await apiFetch(API_ROUTES.ccintern.auftraege, { method: 'POST', body });
            const row = res && typeof res.auftrag === 'object' ? res.auftrag : null;
            if (row) {
              a.ccApiId = row.id;
              if (row.auftragsnummer) a.id = row.auftragsnummer;
              remapInternAufgabenAuftragId(prevDisplayId, a.id);
              delete a._ccPendingCockpitSync;
              try {
                await flushPendingCcInternDateiUploadsForAuftrag(a, showToast);
              } catch (pendErr) {
                console.error('[ccintern-cockpit-api] Pending-Dateien nach POST', pendErr);
              }
            }
            if (!row) {
              console.error('[ccintern-cockpit-api] POST 2xx aber keine data.auftrag; RAM nicht als gespeichert markiert', {
                auftragId: a && a.id,
                response: res,
                payload: body,
              });
              notifyFlushErr('Auftrag konnte nicht gespeichert werden — ungültige Server-Antwort');
              const bad = new Error('POST: data.auftrag fehlt in der Antwort');
              // @ts-ignore
              bad._ccFlushAuftraegeUiShown = true;
              throw bad;
            }
            if (!a.ccApiId || !isUuid(String(a.ccApiId))) {
              console.error('[ccintern-cockpit-api] POST mit auftrag, aber ccApiId nach Mapping fehlt', {
                auftragId: a && a.id,
                ccApiId: a && a.ccApiId,
                rowId: row && row.id,
                rowAuftragsnummer: row && row.auftragsnummer,
                payload: body,
              });
              notifyFlushErr('Auftrag konnte nicht gespeichert werden — keine gültige Server-ID');
              const bad2 = new Error('POST: ccApiId fehlt nach Server-Antwort');
              // @ts-ignore
              bad2._ccFlushAuftraegeUiShown = true;
              throw bad2;
            }
          } catch (postErr) {
            if (postErr && /** @type {{ _ccFlushAuftraegeUiShown?: boolean }} */ (postErr)._ccFlushAuftraegeUiShown) {
              throw postErr;
            }
            // @ts-ignore
            const status = postErr && postErr.status != null ? postErr.status : '—';
            // @ts-ignore
            const respBody = postErr && postErr.body !== undefined ? postErr.body : null;
            console.error('[ccintern-cockpit-api] POST /api/v1/ccintern/auftraege fehlgeschlagen', {
              auftragId: a && a.id,
              payload: body,
              httpStatus: status,
              responseBody: respBody,
              error: postErr,
            });
            const line =
              (postErr && postErr.message ? String(postErr.message) : String(postErr || '')) || 'Unbekannter Fehler';
            if (showToast) {
              notifyFlushErr('Auftrag konnte nicht gespeichert werden — ' + line);
            } else if (typeof window !== 'undefined' && window.alert) {
              if (!anyFlushUserToast) {
                anyFlushUserToast = true;
                window.alert('Auftrag konnte nicht gespeichert werden — ' + line);
              }
            }
            // @ts-ignore
            postErr._ccFlushAuftraegeUiShown = true;
            throw postErr;
          }
        } finally {
          a._ccPostInFlight = false;
        }
      } else {
        try {
          logCcInternClAudit(String(a.id != null ? a.id : ''), String(apiId), body, 'PUT vor Request');
          const putRes = await apiFetch(API_ROUTES.ccintern.auftraege + '/' + encodeURIComponent(String(apiId)), {
            method: 'PUT',
            body,
          });
          const putAuftrag =
            putRes && typeof putRes.auftrag === 'object' ? putRes.auftrag : null;
          const echoBem =
            putAuftrag && putAuftrag.bemerkung != null ? String(putAuftrag.bemerkung) : '';
          console.warn('[CHAT_PUT_RESPONSE]', {
            auftragId: a.id,
            ccApiId: apiId,
            status: 200,
            kommentareInResponse: chatDiagSnapshotFromBemerkung(echoBem),
          });
          if (ccInternClAuditEnabled()) {
            const putAuftrag =
              putRes && typeof putRes.auftrag === 'object'
                ? putRes.auftrag
                : null;
            const echoBem =
              putAuftrag && putAuftrag.bemerkung != null ? String(putAuftrag.bemerkung) : '';
            console.info('[CC-INTERN-CL-AUDIT] PUT nach Response', {
              ccApiId: apiId,
              responseSuccess: !!(putRes && (putRes.ok === true || putRes.success === true)),
              responseDataBemerkungChars: echoBem.length,
              responseChecklisten: summarizeChecklistenInBemerkung(echoBem),
            });
          }
        } catch (putErr) {
          // @ts-ignore
          const status = putErr && putErr.status != null ? putErr.status : '—';
          // @ts-ignore
          const respBody = putErr && putErr.body !== undefined ? putErr.body : null;
          console.error('[ccintern-cockpit-api] PUT /api/v1/ccintern/auftraege fehlgeschlagen', {
            ccApiId: String(apiId),
            auftragId: a && a.id,
            payload: body,
            httpStatus: status,
            responseBody: respBody,
            error: putErr,
          });
          const line =
            (putErr && putErr.message ? String(putErr.message) : String(putErr || '')) || 'Unbekannter Fehler';
          if (showToast) {
            notifyFlushErr('Auftrag konnte nicht gespeichert werden — ' + line);
          } else if (typeof window !== 'undefined' && window.alert) {
            if (!anyFlushUserToast) {
              anyFlushUserToast = true;
              window.alert('Auftrag konnte nicht gespeichert werden — ' + line);
            }
          }
          // @ts-ignore
          putErr._ccFlushAuftraegeUiShown = true;
          throw putErr;
        }
      }
    }
    await reloadAuftraegeFromApiIntoMemory(showToast);
    if (_pendingDirtyAuftragKeys.size > 0) {
      const arrAfter = auftraegeTarget();
      const dirtySample = flushList[0] || null;
      const after =
        dirtySample && arrAfter
          ? arrAfter.find(function (x) {
              return (
                x &&
                (String(x.id) === String(dirtySample.id) ||
                  String(x.ccApiId) === String(dirtySample.ccApiId))
              );
            })
          : null;
      const chatAfterDiag = {
        ...(after ? chatDiagSnapshotFromAuftrag(after) : { hinweis: 'Auftrag nach Reload nicht gefunden' }),
        flushCount: flushList.length,
      };
      console.warn('[CHAT_GET_AFTER_SAVE]', chatAfterDiag);
      if (ccInternIsMaAppOnlyBoot()) {
        console.warn('[MA_CHAT_GET_AFTER_SAVE]', chatAfterDiag);
      }
    }
    if (typeof window !== 'undefined') {
      const rawKal = window.__CCINTERN_KALENDER_API_ROWS__;
      if (Array.isArray(rawKal) && typeof window.ccInternApplyKalenderApiRows === 'function') {
        window.ccInternApplyKalenderApiRows(rawKal);
        if (typeof window.buildCCCalendar === 'function') window.buildCCCalendar();
      }
    }
    try {
      ccInternMobSyncAfterAuftraegeFlush();
    } catch (syncEx) {
      console.warn('[ccintern-cockpit-api] mob sync after flush', syncEx);
    }
  } catch (e) {
    console.error('[ccintern-cockpit-api] flushAuftraegeToApi', e);
    if (e && /** @type {{ _ccFlushAuftraegeUiShown?: boolean }} */ (e)._ccFlushAuftraegeUiShown) {
      /* Toast bereits in POST/PUT-Handler */
    } else if (showToast && !anyFlushUserToast) {
      showToast('⚠ Aufträge speichern: ' + (e && e.message ? e.message : String(e)));
    } else if (!anyFlushUserToast && typeof window !== 'undefined' && window.alert) {
      window.alert('⚠ Aufträge speichern: ' + (e && e.message ? e.message : String(e)));
    }
  } finally {
    _saving = false;
    _pendingDirtyAuftragKeys.clear();
  }
}

/**
 * Sofort speichern (z. B. vor Tab-Schließen). Kein Debounce.
 * @param {(msg: string) => void} [showToast]
 * @param {unknown} [auftragIdHint]
 * @returns {Promise<void>}
 */
export function flushAuftraegeNow(showToast, auftragIdHint) {
  if (auftragIdHint != null && String(auftragIdHint).trim() !== '') {
    addDirtyKeysForAuftragId(auftragIdHint);
  }
  if (_pendingDirtyAuftragKeys.size === 0) {
    return Promise.resolve();
  }
  return flushAuftraegeToApi(showToast);
}

/**
 * Checklisten & andere kritische Felder: Debounce abbrechen und sofort alle Aufträge per PUT/POST flushen.
 * Verhindert Datenverlust, wenn der Tab geschlossen oder die Seite neu geladen wird, bevor der 500ms-Timer feuert.
 *
 * @param {(msg: string) => void} [showToast]
 * @param {unknown} [auftragIdHint]
 * @returns {Promise<void>}
 */
export function persistAuftraegeImmediate(showToast, auftragIdHint) {
  if (!hasCockpitAuftraegeApi()) return Promise.resolve();
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  return flushAuftraegeNow(showToast || null, auftragIdHint);
}

/**
 * @param {string} displayId
 * @param {(msg: string) => void} [showToast]
 */
export async function deleteAuftragByDisplayId(displayId, showToast) {
  const arr = auftraegeTarget();
  if (!arr) {
    if (showToast) showToast('Aufträge nicht initialisiert');
    return;
  }
  const a = arr.find(function (x) {
    return x && (String(x.id) === String(displayId) || String(x.ccApiId) === String(displayId));
  });
  if (!a) {
    if (showToast) showToast('Auftrag nicht gefunden');
    return;
  }
  if (!a.ccApiId || !isUuid(String(a.ccApiId))) {
    const msg =
      'Auftrag hat noch keine Server-ID — bitte speichern (API), danach löschen. Kein stillschweigendes Entfernen.';
    console.warn('[ccintern-cockpit-api] deleteAuftragByDisplayId:', msg, displayId);
    if (showToast) showToast('⚠ ' + msg);
    throw new Error(msg);
  }
  try {
    await apiFetch(API_ROUTES.ccintern.auftraege + '/' + encodeURIComponent(String(a.ccApiId)), { method: 'DELETE' });
    await reloadAuftraegeFromApiIntoMemory(showToast);
    if (showToast) showToast('🗑 ' + displayId + ' gelöscht');
  } catch (e) {
    console.error('[ccintern-cockpit-api] deleteAuftragByDisplayId', e);
    if (showToast) showToast('⚠ Löschen fehlgeschlagen: ' + (e && e.message ? e.message : String(e)));
    throw e;
  }
}

function cockpitMaInitials() {
  return '?';
}

/**
 * Kürzel aus dem CC-Intern-Mitarbeiterstamm: nur explizit gesetzter Kurz-Code
 * (Feld `position` in der API, typischerweise 1–4 Buchstaben wie SE, OK, ME).
 * Kein Ableiten aus Namen — siehe Stamm-Pflege in CC Intern.
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {string}
 */
function kuerzelFromMitarbeiterStammRow(row) {
  if (!row || typeof row !== 'object') return '';
  var p = row.position;
  if (p == null || !String(p).trim()) return '';
  var t = String(p).trim();
  if (/^[A-Za-zÄÖÜäöü]{1,5}$/.test(t)) return t.toUpperCase();
  return '';
}

/**
 * Avatar-Text in Listen/Karten: zuerst festes Kürzel k (CC-Intern-Mitarbeiter, position=Kurzcode),
 * sonst Anzeige-Initialen aus dem Namen — rein visuell; Workflow-Logik nutzt weiter m.k.
 * @param {unknown} n
 * @param {unknown} k
 * @returns {string}
 */
function maAvForCardDisplay(n, k) {
  var kc = k != null && String(k).trim() ? String(k).trim().toUpperCase() : '';
  if (kc) return kc.length <= 4 ? kc : kc.substring(0, 3);
  return cockpitMaInitials();
}

/**
 * @param {Record<string, unknown>} u
 * @param {number} idx
 */
function resolveUserDisplayName(u, idx) {
  var raw = u.name != null && String(u.name).trim() !== '' ? String(u.name).trim() : '';
  if (u.username != null && String(u.username).trim() !== '') {
    raw = raw || String(u.username).trim();
  }
  if (!raw || /^[0-9a-f]{8}-/i.test(raw)) {
    var em = u.email != null ? String(u.email).trim() : '';
    if (em && em.indexOf('@') > 0) {
      raw = em.split('@')[0];
    } else {
      raw = 'User ' + (idx + 1);
    }
  }
  return raw;
}

/**
 * Urlaubstage aus einem API-/Stamm-Objekt (einheitlich `urlaub` in MA_DATA; Aliase nur lesen).
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {number|null} null = nicht gesetzt
 */
function readUrlaubstageFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  var keys = [
    'urlaubstage',
    'urlaubJahr',
    'urlaubstageProJahr',
    'vacationDaysPerYear',
    'vacationDays',
    'urlaub',
  ];
  for (var i = 0; i < keys.length; i++) {
    var v = /** @type {unknown} */ (row[keys[i]]);
    if (v == null || v === '') continue;
    var n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (!Number.isFinite(n)) continue;
    if (n >= 0 && n <= 366) return n;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} row — z. B. Mitarbeiter-Stamm-Zeile
 * @param {Record<string, unknown>|null|undefined} [userRow] — gleicher user_id aus GET /users
 */
function readUrlaubstageFromSources(row, userRow) {
  var a = readUrlaubstageFromRow(row);
  if (a != null) return a;
  var b = readUrlaubstageFromRow(userRow || null);
  if (b != null) return b;
  return 28;
}

/**
 * @param {unknown[]} apiUsers
 * @returns {Record<string, unknown>[]}
 */
export function mapApiUsersToMaData(apiUsers) {
  var maCols = ['#1565C0', '#2E7D32', '#6A1B9A', '#C62828', '#00695C', '#E65100'];
  return apiUsers.map(function (u, idx) {
    var sid = String(u.id);
    var n = resolveUserDisplayName(u, idx);
    var kuerzel = u.kuerzel != null ? String(u.kuerzel).trim().toUpperCase() : '';
    var uUrl = readUrlaubstageFromRow(/** @type {Record<string, unknown>} */ (u));
    var urlDef = uUrl != null ? uUrl : 28;
    return {
      id: u.id,
      maId: sid,
      n: n,
      name: n,
      k: kuerzel || '',
      r: u.rolle || u.role || u.global_role || 'cc_intern',
      rolle: u.rolle || u.role || u.global_role || 'cc_intern',
      email: u.email || '',
      av: kuerzel || '?',
      col: maCols[idx % maCols.length],
      soll: typeof u.soll === 'number' && u.soll > 0 ? u.soll : 160,
      urlaub: urlDef,
      urlaubstage: urlDef,
    };
  });
}

/**
 * @param {Array<Record<string, unknown>>} items
 * @param {Record<string, Record<string, unknown>>} [usersById] user_id → User aus GET /users (für urlaub)
 */
function mapMitarbeiterApiItemsToMaData(items, usersById) {
  var maCols = ['#1565C0', '#2E7D32', '#6A1B9A', '#C62828', '#00695C', '#E65100'];
  if (!Array.isArray(items) || !items.length) return [];
  var byUser = usersById && typeof usersById === 'object' ? usersById : {};
  return items.map(function (row, idx) {
    var uid =
      row.user_id != null && String(row.user_id).trim() ? String(row.user_id).trim() : String(row.id != null ? row.id : 'ma-' + idx);
    var uJoin = byUser[uid];
    var n =
      row.user_name != null && String(row.user_name).trim()
        ? String(row.user_name).trim()
        : row.user_email && String(row.user_email).indexOf('@') > 0
          ? String(row.user_email).split('@')[0]
          : 'Mitarbeiter';
    var posRaw = row.position != null && String(row.position).trim() ? String(row.position).trim() : '';
    var k = kuerzelFromMitarbeiterStammRow(/** @type {Record<string, unknown>} */ (row));
    var r = posRaw;
    if (k && posRaw.toUpperCase() === k) {
      r = 'Mitarbeiter';
    } else if (!posRaw) {
      r = 'Mitarbeiter';
    }
    var sollFromRow =
      row.soll_stunden != null && Number(row.soll_stunden) > 0 ? Number(row.soll_stunden) : null;
    var sollFromUser =
      uJoin && uJoin.soll != null && Number(uJoin.soll) > 0 ? Number(uJoin.soll) : null;
    var ub = readUrlaubstageFromSources(/** @type {Record<string, unknown>} */ (row), uJoin);
    return {
      id: row.user_id != null && String(row.user_id).trim() ? row.user_id : row.id,
      mitarbeiter_id: row.id,
      maId: uid,
      n: n,
      name: n,
      k: k,
      r: r,
      rolle: 'cc_intern',
      email: row.user_email != null ? String(row.user_email) : '',
      av: maAvForCardDisplay(n, k),
      col: maCols[idx % maCols.length],
      soll: sollFromRow != null ? sollFromRow : sollFromUser != null ? sollFromUser : 160,
      urlaub: ub,
      urlaubstage: ub,
    };
  });
}

/**
 * Setzt `av` in jedem Stamm-Datensatz: Kürzel k oder sichtbare Initialen (Karten-UI).
 * @param {Record<string, unknown>[]|null|undefined} list
 */
function syncMaDataAvForCardDisplay(list) {
  if (!Array.isArray(list) || !list.length) return;
  for (var j = 0; j < list.length; j++) {
    var mx = list[j];
    if (mx) mx.av = maAvForCardDisplay(mx.n, mx.k);
  }
}

/**
 * Übernimmt vorherige `k`/`av` pro User-ID oder Anzeigename, wenn Stamm-API
 * kein Kurz-Code in `position` liefert (lokale Fortführung ohne Neuanlage).
 * @param {Record<string, unknown>[]} listOut
 * @param {Record<string, unknown>[]|null|undefined} previous
 */
function mergeKuerzelFromPreviousMaList(listOut, previous) {
  void previous;
  syncMaDataAvForCardDisplay(listOut);
}

/**
 * @param {unknown} s
 * @returns {boolean}
 */
function cockpitUserUuidLooksValid(s) {
  if (s == null || s === '') return false;
  var t = String(s).trim();
  if (t.length < 32) return false;
  return /^[0-9a-f]{8}-[0-9a-f-]{3,}/i.test(t) || t.length === 32;
}

/**
 * @param {Record<string, unknown>|null|undefined} m
 * @returns {string|null}
 */
function rowToCockpitUserUuid(m) {
  if (!m || typeof m !== 'object') return null;
  if (m.id != null && cockpitUserUuidLooksValid(String(m.id))) return String(m.id).trim();
  if (m.maId != null && cockpitUserUuidLooksValid(String(m.maId))) return String(m.maId).trim();
  return null;
}

/**
 * @returns {Array<Record<string, unknown>>}
 */
function maDataListForResolve() {
  try {
    if (typeof window !== 'undefined' && window.CCIntern && Array.isArray(window.CCIntern.__MA_DATA_LIVE)) {
      if (window.CCIntern.__MA_DATA_LIVE.length) return /** @type {Array<Record<string, unknown>>} */ (window.CCIntern.__MA_DATA_LIVE);
    }
    if (typeof window !== 'undefined' && Array.isArray(window.MA_DATA) && window.MA_DATA.length) {
      return /** @type {Array<Record<string, unknown>>} */ (window.MA_DATA);
    }
  } catch (eList) {
    void eList;
  }
  return [];
}

/**
 * Prüft Stamm nach ARCHITEKTUR_REGEL §14: ein Kürzel → höchstens eine user-UUID; Kürzel nie leer bei UUID-Zeilen.
 * @param {Array<Record<string, unknown>>|null|undefined} list
 */
export function warnMitarbeiterStammKonflikte(list) {
  if (!Array.isArray(list) || !list.length) return;
  /** @type {Record<string, string[]>} */
  var byK = {};
  var emptyKNames = [];
  var i;
  var m;
  var kk;
  var u;
  for (i = 0; i < list.length; i++) {
    m = list[i];
    if (!m || typeof m !== 'object') continue;
    u = rowToCockpitUserUuid(/** @type {Record<string, unknown>} */ (m));
    kk = m.k != null ? String(m.k).trim().toUpperCase() : '';
    if (u && !kk) {
      var lab = m.n != null ? String(m.n).trim() : m.name != null ? String(m.name).trim() : String(m.maId || '?');
      emptyKNames.push(lab);
    }
    if (!kk) continue;
    if (!byK[kk]) byK[kk] = [];
    byK[kk].push(u || '');
  }
  if (emptyKNames.length) {
    console.warn('[ccintern-cockpit-api] Mitarbeiter mit user-UUID aber leerem Kürzel (k/position):', emptyKNames.join(', '));
  }
  Object.keys(byK).forEach(function (key) {
    var arr = byK[key];
    var uniq = {};
    arr.forEach(function (x) {
      if (x) uniq[x] = true;
    });
    var ids = Object.keys(uniq);
    if (ids.length > 1) {
      console.warn('[ccintern-cockpit-api] Doppeltes Kürzel im Stamm:', key, '→ UUIDs:', ids.join(', '));
    }
  });
}

/**
 * Mappt Workflow-Kürzel, Tabellen-IDs oder Anzeigenamen auf Cockpit-user-UUID.
 * Kein stiller Erfolg bei Mehrdeutigkeit — dann `null` + Warnung.
 * Quelle: `window.CCIntern.__MA_DATA_LIVE` bzw. `window.MA_DATA` nach `reloadUsersFromApiIntoMaTarget`.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function maKuerzelOderIdZuUserUuid(raw) {
  if (raw == null || raw === '') return null;
  var orig = String(raw).trim();
  if (!orig || orig === 'undefined' || orig === '—') return null;
  if (cockpitUserUuidLooksValid(orig)) return orig;

  var s = orig;

  var list = maDataListForResolve();
  if (!list.length) {
    console.warn('MA Mapping fehlt:', orig);
    return null;
  }

  var i;
  var m;
  var hitU;
  for (i = 0; i < list.length; i++) {
    m = list[i];
    if (!m) continue;
    if (m.id != null && String(m.id) === s) {
      hitU = rowToCockpitUserUuid(/** @type {Record<string, unknown>} */ (m));
      if (hitU) return hitU;
    }
    if (m.mitarbeiter_id != null && String(m.mitarbeiter_id) === s) {
      hitU = rowToCockpitUserUuid(/** @type {Record<string, unknown>} */ (m));
      if (hitU) return hitU;
    }
    if (m.maId != null && String(m.maId) === s) {
      hitU = rowToCockpitUserUuid(/** @type {Record<string, unknown>} */ (m));
      if (hitU) return hitU;
    }
  }

  var up = s.toUpperCase();
  /** @type {string[]} */
  var kUuids = [];
  for (i = 0; i < list.length; i++) {
    m = list[i];
    if (!m) continue;
    var kRaw = m.k != null ? String(m.k).trim() : '';
    if (!kRaw || kRaw.toUpperCase() !== up) continue;
    hitU = rowToCockpitUserUuid(/** @type {Record<string, unknown>} */ (m));
    if (hitU) kUuids.push(hitU);
  }
  if (kUuids.length) {
    var seen = {};
    kUuids.forEach(function (x) {
      seen[x] = true;
    });
    var keys = Object.keys(seen);
    if (keys.length > 1) {
      console.warn('MA Mapping mehrdeutig: Kürzel', up, '→', keys.join(', '));
      return null;
    }
    return keys[0];
  }

  var looksLikeKuerzel = /^[A-ZÄÖÜ]{2,5}$/.test(up) && s.indexOf(' ') < 0 && s.indexOf('+') < 0;
  if (!looksLikeKuerzel) {
    var low = s.toLowerCase();
    /** @type {{ u: string; n: string }[]} */
    var nameHits = [];
    for (i = 0; i < list.length; i++) {
      m = list[i];
      if (!m || !m.n) continue;
      var nn = String(m.n).trim();
      if (!nn) continue;
      var nLow = nn.toLowerCase();
      var firstTok = nn.split(/\s+/).filter(Boolean)[0] || '';
      if (nLow === low || firstTok.toLowerCase() === low) {
        hitU = rowToCockpitUserUuid(/** @type {Record<string, unknown>} */ (m));
        if (hitU) nameHits.push({ u: hitU, n: nn });
      }
    }
    if (nameHits.length === 1) return nameHits[0].u;
    if (nameHits.length > 1) {
      var nu = {};
      nameHits.forEach(function (h) {
        nu[h.u] = true;
      });
      if (Object.keys(nu).length === 1) return nameHits[0].u;
      console.warn('MA Mapping mehrdeutig: Name', orig);
      return null;
    }
  }

  console.warn('MA Mapping fehlt:', orig);
  return null;
}

/**
 * /users ist die vollständige Quelle; /mitarbeiter liefert Zusatzfelder (Kürzel, Soll etc.).
 * Nach Merge: nur Einträge mit Stammzeile (mitarbeiter_id) oder gesetztem Kürzel k — App-only ohne beides entfällt.
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {Array<Record<string, unknown>>} apiUsers
 * @param {Record<string, Record<string, unknown>>} usersById
 * @returns {Array<Record<string, unknown>>}
 */
function mergeMaDataFromUsersAndMitarbeiter(items, apiUsers, usersById) {
  var usersList = Array.isArray(apiUsers) ? apiUsers : [];
  var usersCcIntern = usersList.filter(function (u) {
    if (!u || typeof u !== 'object') return false;
    var mods = Array.isArray(u.modules) ? u.modules : [];
    // Wenn der Server keine modules mitliefert: nicht künstlich aussortieren.
    if (!mods.length) return true;
    return mods.indexOf('ccintern') >= 0;
  });
  var base = mapApiUsersToMaData(usersCcIntern.length ? usersCcIntern : usersList);
  /** @type {Record<string, Record<string, unknown>>} */
  var byId = {};
  base.forEach(function (m) {
    if (!m || m.maId == null) return;
    byId[String(m.maId)] = m;
  });
  var stamm = mapMitarbeiterApiItemsToMaData(Array.isArray(items) ? items : [], usersById);
  stamm.forEach(function (s) {
    if (!s) return;
    var sid =
      s.maId != null && String(s.maId).trim() !== ''
        ? String(s.maId).trim()
        : s.id != null && String(s.id).trim() !== ''
          ? String(s.id).trim()
          : '';
    if (!sid) return;
    var b = byId[sid];
    if (!b) {
      base.push(s);
      byId[sid] = s;
      return;
    }
    // Stamm-Felder als Overlay auf vollständige User-Basis.
    if (s.mitarbeiter_id != null) b.mitarbeiter_id = s.mitarbeiter_id;
    if (s.k != null && String(s.k).trim() !== '') b.k = s.k;
    if (s.r != null && String(s.r).trim() !== '') b.r = s.r;
    if (s.soll != null && Number(s.soll) > 0) b.soll = Number(s.soll);
    if (s.urlaub != null && Number(s.urlaub) >= 0) b.urlaub = Number(s.urlaub);
    if (s.urlaubstage != null && Number(s.urlaubstage) >= 0) b.urlaubstage = Number(s.urlaubstage);
    if (s.col != null && String(s.col).trim() !== '') b.col = s.col;
  });
  mergeKuerzelFromPreviousMaList(base, null);
  return base.filter(function (m) {
    if (!m || typeof m !== 'object') return false;
    var mid = m.mitarbeiter_id != null ? String(m.mitarbeiter_id).trim() : '';
    if (mid) return true;
    var k = m.k != null ? String(m.k).trim() : '';
    return k !== '';
  });
}

/**
 * Optional `firma_id` aus Cockpit-UI — bei Superadmin o. Ä. muss sie mit GET/POST /mitarbeiter
 * identisch sein, sonst speichert die API in Firma A, Reload listet Firma B.
 */
function readOptionalCockpitFirmaIdForMitarbeiterApi() {
  try {
    if (typeof window === 'undefined') return '';
    var a = window.COCKPIT_FIRMA_ID;
    var b = window.__COCKPIT_FIRMA_ID;
    if (a != null && String(a).trim() !== '') return String(a).trim();
    if (b != null && String(b).trim() !== '') return String(b).trim();
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * Befüllt `MA_DATA` aus der vollständigen User-Liste + CC-Intern-Mitarbeiter-Stamm (Overlay),
 * Fallback: Benutzerliste GET /api/v1/users (Legacy / kleine Setups).
 *
 * @param {(msg: string) => void} [showToast]
 */
export async function reloadUsersFromApiIntoMaTarget(showToast) {
  try {
    /** @type {Record<string, unknown>[]} */
    var mapped = [];
    /** @type {Record<string, unknown>[]} */
    var apiUsers = [];

    var firmaQ = readOptionalCockpitFirmaIdForMitarbeiterApi();

    var items = /** @type {Array<Record<string, unknown>>} */ ([]);
    try {
      var qs = new URLSearchParams({ page: '1', limit: '200' });
      if (firmaQ) qs.set('firma_id', firmaQ);
      var maRes = await apiFetch('/api/v1/mitarbeiter?' + qs.toString());
      var raw = maRes && Array.isArray(maRes.items) ? maRes.items : [];
      items = /** @type {Array<Record<string, unknown>>} */ (raw);
    } catch (e) {
      console.warn('[ccintern-cockpit-api] GET /mitarbeiter', e);
    }

    /** @type {Record<string, Record<string, unknown>>} */
    var usersById = {};
    try {
      const usersRes = await apiFetch('/api/v1/users');
      var uList = Array.isArray(usersRes?.users) ? usersRes.users : [];
      apiUsers = uList;
      uList.forEach(function (u) {
        if (u && u.id != null) usersById[String(u.id).trim()] = /** @type {Record<string, unknown>} */ (u);
      });
    } catch (eU) {
      console.warn('[ccintern-cockpit-api] GET /users (Merge für MA_DATA.urlaub)', eU);
      apiUsers = [];
    }

    mapped = mergeMaDataFromUsersAndMitarbeiter(items, apiUsers, usersById);
    warnMitarbeiterStammKonflikte(mapped);

    var dest = window.CCIntern && window.CCIntern.__MA_DATA_LIVE;
    if (dest && Array.isArray(dest)) {
      dest.length = 0;
      mapped.forEach(function (m) {
        dest.push(m);
      });
    }
    window.MA_DATA = dest && Array.isArray(dest) && dest.length ? dest : mapped;
    window.COCKPIT_USERS = apiUsers;
    window.MA_ID_MAP = {};
    apiUsers.forEach(function (u, i) {
      if (!u || typeof u !== 'object') return;
      var label = resolveUserDisplayName(/** @type {Record<string, unknown>} */ (u), i);
      if (label) window.MA_ID_MAP[label] = u.id;
    });
    if (Array.isArray(window.MA_DATA)) {
      window.MA_DATA.forEach(function (m) {
        if (!m || typeof m !== 'object' || !m.k) return;
        var k = String(m.k).trim();
        if (k && m.id) window.MA_ID_MAP[k] = m.id;
      });
    }
    if (typeof window.renderMitarbeiter === 'function') window.renderMitarbeiter();
    return null;
  } catch (e) {
    console.error('[ccintern-cockpit-api] reloadUsersFromApiIntoMaTarget', e);
    if (showToast) showToast('⚠ Mitarbeiter laden: ' + (e && e.message ? e.message : String(e)));
    return e instanceof Error ? e : new Error(String(e));
  }
}

// ── Checklisten (Vorlagen) ↔ GET/POST/PUT/DELETE /api/v1/checklisten ─────────

/**
 * @param {unknown} e
 * @param {Record<string, unknown>} [extra]
 */
function logCockpitApiFailure(scope, e, extra) {
  const status = e && typeof e === 'object' && 'status' in e ? /** @type {{ status?: number }} */ (e).status : null;
  const requestUrl = e && typeof e === 'object' && 'requestUrl' in e ? /** @type {{ requestUrl?: string }} */ (e).requestUrl : null;
  const response = e && typeof e === 'object' && 'body' in e ? /** @type {{ body?: unknown }} */ (e).body : null;
  const msg = e instanceof Error ? e.message : String(e);
  console.error(scope, Object.assign({ requestUrl, status, response, message: msg }, extra || {}));
}

/**
 * apiFetch-Fehler für Mitarbeiter-Flows — immer loggen und weiterwerfen (nicht schlucken).
 * @param {unknown} err
 * @param {Record<string, unknown>} [extra]
 */
function logMitarbeiterSaveFailure(err, extra) {
  const e = err && typeof err === 'object' ? /** @type {Record<string, unknown>} */ (err) : null;
  const requestUrl = e && 'requestUrl' in e ? e.requestUrl : undefined;
  const status = e && 'status' in e ? e.status : undefined;
  const response =
    e && 'response' in e ? e.response : e && 'body' in e ? e.body : err;
  console.error('MITARBEITER SAVE FEHLER', Object.assign({ requestUrl, status, response }, extra || {}));
}

function firmaIdForCcInternApi() {
  if (typeof window !== 'undefined') {
    const w =
      window.COCKPIT_FIRMA_ID ||
      window.__COCKPIT_FIRMA_ID ||
      (typeof window.CCState !== 'undefined' &&
        window.CCState &&
        typeof window.CCState === 'object' &&
        /** @type {{ firmaId?: unknown }} */ (window.CCState).firmaId != null &&
        String(/** @type {{ firmaId?: unknown }} */ (window.CCState).firmaId).trim() !== ''
        ? String(/** @type {{ firmaId?: unknown }} */ (window.CCState).firmaId).trim()
        : null);
    if (w != null && String(w).trim() !== '') return String(w).trim();
  }
  try {
    const u = CCState.get('user');
    if (u && typeof u === 'object') {
      const cid = /** @type {{ company_id?: unknown }} */ (u).company_id;
      if (cid != null && String(cid).trim() !== '') return String(cid).trim();
    }
  } catch (_) {}
  try {
    const sel = CCState.get('cockpitFirmaSelectedId');
    if (sel != null && String(sel).trim() !== '') return String(sel).trim();
  } catch (_) {}
  try {
    const fs = CCState.get('firmenStamm');
    const rows = fs && Array.isArray(fs.rows) ? fs.rows : [];
    if (rows.length >= 1 && rows[0] && rows[0].id != null) {
      const id = String(rows[0].id).trim();
      if (id) return id;
    }
  } catch (_) {}
  return null;
}

/**
 * @param {unknown} res
 * @returns {Array<Record<string, unknown>>}
 */
function rowsFromChecklistenListResponse(res) {
  /** @type {unknown[]} */
  let rows = [];
  if (res == null || typeof res !== 'object') {
    console.error('CHECKLISTEN API FEHLER', res);
    return [];
  }
  const o = /** @type {{ items?: unknown; data?: { items?: unknown } }} */ (res);
  const fromItems = 'items' in o ? o.items : undefined;
  const fromNested =
    o.data != null && typeof o.data === 'object' ? /** @type {{ items?: unknown }} */ (o.data).items : undefined;
  if (fromItems !== undefined && !Array.isArray(fromItems)) {
    console.error('CHECKLISTEN API FEHLER', res);
    return [];
  }
  if (fromNested !== undefined && !Array.isArray(fromNested)) {
    console.error('CHECKLISTEN API FEHLER', res);
    return [];
  }
  if (Array.isArray(fromItems)) rows = fromItems;
  else if (Array.isArray(fromNested)) rows = fromNested;
  else {
    console.error('CHECKLISTEN API FEHLER', res);
    return [];
  }
  return /** @type {Array<Record<string, unknown>>} */ (rows);
}

/** @type {Map<string, Promise<Array<Record<string, unknown>>>>} */
const __checklistenZuordnungInflight = new Map();

/**
 * Rohdaten aus GET /api/v1/ccintern/checklisten-zuordnung (Envelope bereits durch `apiFetch` → `data`).
 * @param {unknown} res
 * @returns {Array<Record<string, unknown>>}
 */
function rowsFromChecklistenZuordnungResponse(res) {
  if (res == null || typeof res !== 'object') return [];
  const o = /** @type {{ items?: unknown; data?: { items?: unknown } }} */ (res);
  const fromItems = 'items' in o ? o.items : undefined;
  const fromNested =
    o.data != null && typeof o.data === 'object' ? /** @type {{ items?: unknown }} */ (o.data).items : undefined;
  if (Array.isArray(fromItems)) return /** @type {Array<Record<string, unknown>>} */ (fromItems.slice());
  if (Array.isArray(fromNested)) return /** @type {Array<Record<string, unknown>>} */ (fromNested.slice());
  return [];
}

/**
 * GET /api/v1/ccintern/checklisten-zuordnung?produkt_id=… (optional firma_id Query).
 * Cache: `window.CC_CHECKLISTEN_ZUORDNUNG_CACHE[produkt_id]`; keine parallelen Requests pro Produkt.
 * @param {unknown} produktId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchCcInternChecklistenZuordnung(produktId) {
  const pid = produktId != null ? String(produktId).trim() : '';
  if (!pid) return [];
  try {
    if (typeof window !== 'undefined' && window.CC_CHECKLISTEN_ZUORDNUNG_CACHE && typeof window.CC_CHECKLISTEN_ZUORDNUNG_CACHE === 'object') {
      const cached = /** @type {Record<string, unknown>} */ (window.CC_CHECKLISTEN_ZUORDNUNG_CACHE)[pid];
      if (Array.isArray(cached)) return /** @type {Array<Record<string, unknown>>} */ (cached.slice());
    }
    const existing = __checklistenZuordnungInflight.get(pid);
    if (existing) return existing;
    const p = (async function () {
      try {
        const fid = firmaIdForCcInternApi();
        let qs = '?produkt_id=' + encodeURIComponent(pid);
        if (fid) qs += '&firma_id=' + encodeURIComponent(fid);
        const res = await apiFetch('/api/v1/ccintern/checklisten-zuordnung' + qs);
        const rows = rowsFromChecklistenZuordnungResponse(res);
        if (typeof window !== 'undefined') {
          if (!window.CC_CHECKLISTEN_ZUORDNUNG_CACHE || typeof window.CC_CHECKLISTEN_ZUORDNUNG_CACHE !== 'object') {
            window.CC_CHECKLISTEN_ZUORDNUNG_CACHE = {};
          }
          /** @type {Record<string, unknown[]>} */ (window.CC_CHECKLISTEN_ZUORDNUNG_CACHE)[pid] = rows.slice();
        }
        return rows;
      } catch (err) {
        console.warn('[CL-ZUORDNUNG API FEHLER]', err);
        return [];
      }
    })().finally(function () {
      __checklistenZuordnungInflight.delete(pid);
    });
    __checklistenZuordnungInflight.set(pid, p);
    return p;
  } catch (err) {
    console.warn('[CL-ZUORDNUNG API FEHLER]', err);
    return [];
  }
}

function invalidateCcInternChecklistenZuordnungCache() {
  if (typeof window !== 'undefined') {
    window.CC_CHECKLISTEN_ZUORDNUNG_CACHE = {};
  }
  __checklistenZuordnungInflight.clear();
}

/**
 * GET /api/v1/ccintern/checklisten-zuordnung — alle Zuordnungen der Firma.
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchCcInternChecklistenZuordnungAll() {
  try {
    const fid = firmaIdForCcInternApi();
    let qs = '';
    if (fid) qs = '?firma_id=' + encodeURIComponent(fid);
    const res = await apiFetch('/api/v1/ccintern/checklisten-zuordnung' + qs);
    return rowsFromChecklistenZuordnungResponse(res);
  } catch (err) {
    console.warn('[CL-ZUORDNUNG API FEHLER] fetchCcInternChecklistenZuordnungAll', err);
    return [];
  }
}

/**
 * POST /api/v1/ccintern/checklisten-zuordnung
 * @param {{ produkt_id: string, schritt: string, checkliste_id: string, sortierung?: number, aktiv?: boolean }} body
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function createCcInternChecklistenZuordnung(body) {
  try {
    const pid = getCurrentProjectId();
    /** @type {Record<string, string>} */
    const extraHeaders = pid ? { 'x-project-id': pid } : {};
    const res = await apiFetch('/api/v1/ccintern/checklisten-zuordnung', {
      method: 'POST',
      body: body,
      headers: extraHeaders,
    });
    invalidateCcInternChecklistenZuordnungCache();
    const item =
      res && typeof res === 'object' && res.item != null && typeof res.item === 'object'
        ? /** @type {Record<string, unknown>} */ (res.item)
        : res && typeof res === 'object' && res.data != null && typeof res.data === 'object' && /** @type {{ item?: unknown }} */ (res.data).item != null
          ? /** @type {Record<string, unknown>} */ (/** @type {{ item: object }} */ (res.data).item)
          : null;
    return item;
  } catch (err) {
    console.warn('[CL-ZUORDNUNG API FEHLER] createCcInternChecklistenZuordnung', err);
    throw err;
  }
}

/**
 * DELETE /api/v1/ccintern/checklisten-zuordnung/:id
 * @param {string} zuordnungId
 * @returns {Promise<boolean>}
 */
export async function deleteCcInternChecklistenZuordnung(zuordnungId) {
  const zid = zuordnungId != null ? String(zuordnungId).trim() : '';
  if (!zid) return false;
  try {
    const pid = getCurrentProjectId();
    /** @type {Record<string, string>} */
    const extraHeaders = pid ? { 'x-project-id': pid } : {};
    await apiFetch('/api/v1/ccintern/checklisten-zuordnung/' + encodeURIComponent(zid), {
      method: 'DELETE',
      headers: extraHeaders,
    });
    invalidateCcInternChecklistenZuordnungCache();
    return true;
  } catch (err) {
    console.warn('[CL-ZUORDNUNG API FEHLER] deleteCcInternChecklistenZuordnung', err);
    throw err;
  }
}

/**
 * Aus POST /checklisten Antwort (evtl. doppelt gewrappt) die neue UUID ermitteln.
 * @param {unknown} created
 * @returns {string|null}
 */
function checklisteCreatedIdFromResponse(created) {
  if (!created || typeof created !== 'object') return null;
  const c = /** @type {Record<string, unknown>} */ (created);
  const data = c.data != null && typeof c.data === 'object' ? /** @type {Record<string, unknown>} */ (c.data) : null;
  const itemFromData =
    data != null && data.item != null && typeof data.item === 'object'
      ? /** @type {{ id?: unknown }} */ (data.item).id
      : null;
  const topItem =
    c.item != null && typeof c.item === 'object' ? /** @type {{ id?: unknown }} */ (c.item).id : null;
  const cand =
    (data != null && data.id != null ? data.id : null) ??
    itemFromData ??
    (c.id != null ? c.id : null) ??
    topItem;
  return cand != null && String(cand).trim() !== '' ? String(cand).trim() : null;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function mapChecklisteDetailToVorlage(row) {
  if (!row || typeof row !== 'object') return null;
  const einRaw = Array.isArray(row.eintraege) ? row.eintraege.slice() : [];
  einRaw.sort(function (a, b) {
    if (!a || typeof a !== 'object') return 1;
    if (!b || typeof b !== 'object') return -1;
    const ra = Number(a.reihenfolge);
    const rb = Number(b.reihenfolge);
    const na = Number.isFinite(ra) ? ra : 0;
    const nb = Number.isFinite(rb) ? rb : 0;
    if (na !== nb) return na - nb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  const punkte = einRaw.map(function (e) {
    if (!e || typeof e !== 'object') return { text: '', kat: 'pflicht', hinweis: '', erledigt: false };
    const ro = Number(e.reihenfolge);
    const eintragId = e.id != null && String(e.id).trim() !== '' ? String(e.id).trim() : '';
    return {
      text: e.text != null ? String(e.text) : '',
      kat: 'pflicht',
      hinweis: '',
      erledigt: Boolean(e.erledigt),
      eintragId,
      reihenfolge: Number.isFinite(ro) ? ro : 0,
    };
  });
  return {
    id: row.id != null ? String(row.id) : '',
    name: row.titel != null ? String(row.titel) : 'Checkliste',
    art: 'vorlage',
    ico: '📋',
    farbe: 'var(--blue)',
    aktiv: true,
    beschr: '',
    punkte,
  };
}

async function fetchAllChecklistenListRows() {
  const fid = firmaIdForCcInternApi();
  const all = /** @type {Array<Record<string, unknown>>} */ ([]);
  let page = 1;
  const limit = 100;
  for (;;) {
    let qs = '?page=' + encodeURIComponent(String(page)) + '&limit=' + encodeURIComponent(String(limit));
    if (fid) qs += '&firma_id=' + encodeURIComponent(fid);
    const res = await apiFetch('/api/v1/checklisten' + qs);
    const items = rowsFromChecklistenListResponse(res);
    for (let i = 0; i < items.length; i++) all.push(/** @type {Record<string, unknown>} */ (items[i]));
    const pag = res && typeof res.pagination === 'object' ? res.pagination : {};
    const total = pag.total != null ? Number(pag.total) : items.length;
    if (all.length >= total || items.length < limit) break;
    page += 1;
    if (page > 200) break;
  }
  return all;
}

/**
 * @param {string} id
 */
async function fetchChecklisteDetailForVorlage(id) {
  const fid = firmaIdForCcInternApi();
  let qs = '';
  if (fid) qs = '?firma_id=' + encodeURIComponent(fid);
  return apiFetch('/api/v1/checklisten/' + encodeURIComponent(id) + qs);
}

/**
 * Lädt Firmen-Checklisten vom Backend in `window.CL_VORLAGEN` (Vorlagen-UI-Format).
 * Zentrale Vorlagenquelle: nur diese API; `CL_VORLAGEN` ist der RAM-Cache für UI + Auftrags-Anlage (Kopie in Auftrag).
 * Backend: GET /api/v1/checklisten, Detail GET /api/v1/checklisten/:id
 * @param {(msg: string) => void} [showToast]
 * @returns {Promise<Error|null>}
 */
export async function reloadChecklistenVorlagenFromApi(showToast) {
  try {
    const list = await fetchAllChecklistenListRows();
    const details = await Promise.all(
      list.map(function (row) {
        const id = row && row.id != null ? String(row.id).trim() : '';
        if (!id) return Promise.resolve(null);
        return fetchChecklisteDetailForVorlage(id);
      }),
    );
    if (typeof window === 'undefined') return null;
    if (!Array.isArray(window.CL_VORLAGEN)) window.CL_VORLAGEN = [];
    window.CL_VORLAGEN.length = 0;
    details.forEach(function (d) {
      const v = mapChecklisteDetailToVorlage(/** @type {Record<string, unknown>|null} */ (d));
      if (v) window.CL_VORLAGEN.push(v);
    });
    return null;
  } catch (e) {
    logCockpitApiFailure('[ccintern-cockpit-api] reloadChecklistenVorlagenFromApi', e);
    if (showToast) showToast('⚠ Checklisten: ' + (e instanceof Error ? e.message : String(e)));
    return e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * Lädt eine einzelne Vorlage frisch von GET /api/v1/checklisten/:id und aktualisiert den Eintrag in `window.CL_VORLAGEN`.
 * Wichtig für die Checklisten-UI: Liste kommt von der API, Detail beim Klick immer konsistent mit DB.
 * @param {string} checklisteId
 * @param {(msg: string) => void} [showToast]
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function refreshChecklisteVorlageFromApi(checklisteId, showToast) {
  const id = checklisteId != null ? String(checklisteId).trim() : '';
  if (!id || !isUuid(id)) return null;
  try {
    const d = await fetchChecklisteDetailForVorlage(id);
    const mapped = mapChecklisteDetailToVorlage(/** @type {Record<string, unknown>|null} */ (d));
    if (!mapped || !mapped.id) return null;
    if (typeof window === 'undefined' || !Array.isArray(window.CL_VORLAGEN)) return mapped;
    const idx = window.CL_VORLAGEN.findIndex(function (x) {
      return x && String(x.id || '').trim() === id;
    });
    if (idx < 0) {
      window.CL_VORLAGEN.push(mapped);
      return mapped;
    }
    const prev = /** @type {Record<string, unknown>} */ (window.CL_VORLAGEN[idx]);
    const merged = Object.assign({}, prev, mapped);
    merged.punkte = Array.isArray(mapped.punkte) ? mapped.punkte.slice() : [];
    merged.name = mapped.name;
    merged.id = mapped.id;
    if (prev.ico != null && prev.ico !== '📋') merged.ico = prev.ico;
    if (prev.farbe) merged.farbe = prev.farbe;
    if (prev.beschr != null && String(prev.beschr).trim() !== '') merged.beschr = prev.beschr;
    if (typeof prev.aktiv === 'boolean') merged.aktiv = prev.aktiv;
    window.CL_VORLAGEN[idx] = merged;
    return merged;
  } catch (e) {
    logCockpitApiFailure('[ccintern-cockpit-api] refreshChecklisteVorlageFromApi', e, { checklisteId: id });
    if (showToast) showToast('⚠ Checkliste laden: ' + (e instanceof Error ? e.message : String(e)));
    return null;
  }
}

/**
 * @param {string} checklisteId
 * @param {(msg: string) => void} [showToast]
 */
export async function deleteChecklisteFromApi(checklisteId, showToast) {
  const id = checklisteId != null ? String(checklisteId).trim() : '';
  if (!isUuid(id)) return null;
  const fid = firmaIdForCcInternApi();
  try {
    const body = fid ? { firma_id: fid } : {};
    await apiFetch('/api/v1/checklisten/' + encodeURIComponent(id), { method: 'DELETE', body });
    return null;
  } catch (e) {
    logCockpitApiFailure('[ccintern-cockpit-api] deleteChecklisteFromApi', e, { checklisteId: id });
    if (showToast) showToast('⚠ Checkliste löschen: ' + (e instanceof Error ? e.message : String(e)));
    return e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * POST /api/v1/checklisten/:id/eintraege
 * @param {string} checklisteId
 * @param {{ text: string, erledigt?: boolean, reihenfolge?: number }} payload
 * @param {(msg: string) => void} [showToast]
 * @returns {Promise<Error|null>}
 */
export async function postChecklisteEintragFromApi(checklisteId, payload, showToast) {
  const id = checklisteId != null ? String(checklisteId).trim() : '';
  if (!isUuid(id)) return new Error('Checklisten-Eintrag: keine gültige Checklisten-ID.');
  const fid = firmaIdForCcInternApi();
  if (!fid) {
    const msg = 'Checklisten-Eintrag: firma_id fehlt (Cockpit-Kontext).';
    if (showToast) showToast('⚠ ' + msg);
    return new Error(msg);
  }
  const text = payload && payload.text != null ? String(payload.text).trim() : '';
  if (!text) return new Error('Checklisten-Eintrag: text fehlt.');
  try {
    const body = { firma_id: fid, text };
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'erledigt')) {
      body.erledigt = !!payload.erledigt;
    }
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'reihenfolge')) {
      const ro = Number(payload.reihenfolge);
      if (Number.isFinite(ro)) body.reihenfolge = ro;
    }
    await apiFetch('/api/v1/checklisten/' + encodeURIComponent(id) + '/eintraege', {
      method: 'POST',
      body,
    });
    return null;
  } catch (e) {
    logCockpitApiFailure('[ccintern-cockpit-api] postChecklisteEintragFromApi', e, { checklisteId: id });
    if (showToast) showToast('⚠ Eintrag anlegen: ' + (e instanceof Error ? e.message : String(e)));
    return e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * PUT /api/v1/checklisten/eintraege/:eintragId (Backend: kein PATCH)
 * @param {string} eintragId
 * @param {{ text?: string, erledigt?: boolean, reihenfolge?: number }} patch
 * @param {(msg: string) => void} [showToast]
 * @returns {Promise<Error|null>}
 */
export async function putChecklisteEintragFromApi(eintragId, patch, showToast) {
  const eid = eintragId != null ? String(eintragId).trim() : '';
  if (!eid) return new Error('Checklisten-Eintrag: keine Eintrag-ID.');
  const fid = firmaIdForCcInternApi();
  if (!fid) {
    const msg = 'Checklisten-Eintrag: firma_id fehlt (Cockpit-Kontext).';
    if (showToast) showToast('⚠ ' + msg);
    return new Error(msg);
  }
  try {
    const body = { firma_id: fid };
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'text')) {
      body.text = patch.text != null ? String(patch.text).trim() : '';
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'erledigt')) {
      body.erledigt = !!patch.erledigt;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'reihenfolge')) {
      const ro = Number(patch.reihenfolge);
      if (Number.isFinite(ro)) body.reihenfolge = ro;
    }
    if (Object.keys(body).length <= 1) {
      return new Error('Checklisten-Eintrag: kein gültiges Update-Feld.');
    }
    await apiFetch('/api/v1/checklisten/eintraege/' + encodeURIComponent(eid), {
      method: 'PUT',
      body,
    });
    return null;
  } catch (e) {
    logCockpitApiFailure('[ccintern-cockpit-api] putChecklisteEintragFromApi', e, { eintragId: eid });
    if (showToast) showToast('⚠ Eintrag speichern: ' + (e instanceof Error ? e.message : String(e)));
    return e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * DELETE /api/v1/checklisten/eintraege/:eintragId
 * @param {string} eintragId
 * @param {(msg: string) => void} [showToast]
 * @returns {Promise<Error|null>}
 */
export async function deleteChecklisteEintragFromApi(eintragId, showToast) {
  const eid = eintragId != null ? String(eintragId).trim() : '';
  if (!eid) return new Error('Checklisten-Eintrag: keine Eintrag-ID.');
  const fid = firmaIdForCcInternApi();
  if (!fid) {
    const msg = 'Checklisten-Eintrag löschen: firma_id fehlt (Cockpit-Kontext).';
    if (showToast) showToast('⚠ ' + msg);
    return new Error(msg);
  }
  try {
    await apiFetch('/api/v1/checklisten/eintraege/' + encodeURIComponent(eid), {
      method: 'DELETE',
      body: { firma_id: fid },
    });
    return null;
  } catch (e) {
    logCockpitApiFailure('[ccintern-cockpit-api] deleteChecklisteEintragFromApi', e, { eintragId: eid });
    if (showToast) showToast('⚠ Eintrag löschen: ' + (e instanceof Error ? e.message : String(e)));
    return e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * Synchronisiert `window.CL_VORLAGEN` mit /api/v1/checklisten (kein localStorage).
 * @param {(msg: string) => void} [showToast]
 * @returns {Promise<Error|null>}
 */
export async function saveChecklistenVorlagenToApi(showToast) {
  const fid = firmaIdForCcInternApi();
  if (!fid) {
    const msg = 'Checklisten speichern: firma_id fehlt (Cockpit-Kontext).';
    console.error('[ccintern-cockpit-api]', msg);
    if (showToast) showToast('⚠ ' + msg);
    return new Error(msg);
  }
  const list =
    typeof window !== 'undefined' && Array.isArray(window.CL_VORLAGEN) ? window.CL_VORLAGEN : [];
  try {
    for (let i = 0; i < list.length; i++) {
      const v = /** @type {Record<string, unknown>} */ (list[i]);
      if (!v || typeof v !== 'object') continue;
      let checklisteId = isUuid(String(v.id || '')) ? String(v.id).trim() : null;
      const titel = String(v.name || v.titel || 'Checkliste').trim() || 'Checkliste';
      const punkte = Array.isArray(v.punkte) ? v.punkte : [];

      if (!checklisteId) {
        const fidResolved = firmaIdForCcInternApi();
        if (!fidResolved) {
          console.error('FEHLENDE firma_id für Checkliste');
          throw new Error('firma_id fehlt');
        }
        const created = await apiFetch('/api/v1/checklisten', {
          method: 'POST',
          body: { titel, firma_id: fidResolved },
        });
        const newId = checklisteCreatedIdFromResponse(created);
        if (!newId) {
          console.error('[ccintern-cockpit-api] saveChecklistenVorlagenToApi: POST ohne id', created);
          throw new Error('Checkliste anlegen: API lieferte keine id');
        }
        checklisteId = newId;
        v.id = newId;
      } else {
        await apiFetch('/api/v1/checklisten/' + encodeURIComponent(checklisteId), {
          method: 'PUT',
          body: { titel, firma_id: fid },
        });
      }

      const detail = await fetchChecklisteDetailForVorlage(checklisteId);
      const existing = detail && Array.isArray(detail.eintraege) ? detail.eintraege : [];
      for (let j = 0; j < existing.length; j++) {
        const ex = /** @type {Record<string, unknown>} */ (existing[j]);
        const eid = ex && ex.id != null ? String(ex.id).trim() : '';
        if (!eid) continue;
        await apiFetch('/api/v1/checklisten/eintraege/' + encodeURIComponent(eid), {
          method: 'DELETE',
          body: { firma_id: fid },
        });
      }
      for (let k = 0; k < punkte.length; k++) {
        const p = /** @type {Record<string, unknown>} */ (punkte[k]);
        const text = p && p.text != null ? String(p.text).trim() : '';
        if (!text) continue;
        await apiFetch('/api/v1/checklisten/' + encodeURIComponent(checklisteId) + '/eintraege', {
          method: 'POST',
          body: {
            text,
            erledigt: !!(p && p.erledigt),
            firma_id: fid,
          },
        });
      }
    }
    await reloadChecklistenVorlagenFromApi(showToast);
    return null;
  } catch (e) {
    logCockpitApiFailure('[ccintern-cockpit-api] saveChecklistenVorlagenToApi', e);
    if (showToast) showToast('⚠ Checklisten speichern: ' + (e instanceof Error ? e.message : String(e)));
    return e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * @param {Record<string, unknown>} ma
 * @returns {string|null}
 */
function serverUserIdForMa(ma) {
  if (!ma || typeof ma !== 'object') return null;
  if (ma.ccApiId && isUuid(String(ma.ccApiId))) return String(ma.ccApiId);
  if (ma.id && isUuid(String(ma.id))) return String(ma.id);
  if (ma.maId && isUuid(String(ma.maId))) return String(ma.maId);
  return null;
}

/**
 * @param {Record<string, unknown>} ma
 */
function mapMaToApiGlobalRole(ma) {
  var g = String(ma.rolle || ma.r || 'INTERN').trim().toUpperCase();
  if (g === 'SUPER_ADMIN' || g === 'EXTERN' || g === 'INTERN') return g;
  return 'INTERN';
}

/**
 * @param {Record<string, unknown>} ma
 * @returns {{ soll: number, urlaub: number }}
 */
function mitarbeiterSollUrlaubForApi(ma) {
  var rawS = ma.soll;
  var sn = typeof rawS === 'number' ? rawS : parseInt(String(rawS != null ? rawS : ''), 10);
  var soll = !isNaN(sn) && sn >= 0 && sn <= 400 ? sn : 160;
  var uParsed = readUrlaubstageFromRow(/** @type {Record<string, unknown>} */ (ma));
  var urlaub = uParsed != null ? uParsed : 28;
  return { soll: soll, urlaub: urlaub };
}

function newPlaceholderMitarbeiterEmail() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'ccintern.ma.' + crypto.randomUUID() + '@cc-cockpit.local';
  }
  return 'ccintern.ma.' + String(Date.now()) + '.' + String(Math.random()).slice(2, 8) + '@cc-cockpit.local';
}

/** Einheitliche Fehlermeldung bei ungültigem oder doppeltem Kürzel (UI + API). */
export const MITARBEITER_KUERZEL_FEHLER = 'Kürzel bereits vergeben oder ungültig.';

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, norm: string }}
 */
export function normalizeMitarbeiterKuerzelForSave(raw) {
  var s = raw == null ? '' : String(raw).trim();
  if (!s) return { ok: false, norm: '' };
  var norm = s.toUpperCase();
  if (!/^[A-ZÄÖÜ]{2,5}$/.test(norm)) return { ok: false, norm };
  return { ok: true, norm };
}

/**
 * Roh-Kürzel aus `k` bzw. legacy `maId` (nur wenn kein UUID).
 * @param {Record<string, unknown>|null|undefined} ma
 * @returns {string}
 */
export function mitarbeiterKuerzelRawAusMa(ma) {
  if (!ma || typeof ma !== 'object') return '';
  var k = ma.k != null ? String(ma.k).trim() : '';
  if (k) return k;
  var mid = ma.maId != null ? String(ma.maId).trim() : '';
  if (mid && !isUuid(mid)) return mid;
  return '';
}

/**
 * Format 2–5 Buchstaben + Eindeutigkeit innerhalb der Liste (kein DB-Check).
 * @param {unknown[]|null|undefined} list
 * @param {{ validUserIds?: Set<string>, skipOrphanNotInUsers?: boolean }|null} [opts]
 * @returns {{ ok: boolean, message: string }}
 */
export function validateMitarbeiterKuerzelListe(list, opts) {
  if (!Array.isArray(list) || !list.length) return { ok: true, message: '' };
  var skip = opts && opts.skipOrphanNotInUsers;
  var vSet = opts && opts.validUserIds instanceof Set ? opts.validUserIds : null;
  /** @type {Record<string, boolean>} */
  var seen = Object.create(null);
  for (var i = 0; i < list.length; i++) {
    var ma = /** @type {Record<string, unknown>|null} */ (list[i]);
    if (!ma) continue;
    if (skip && vSet) {
      var sid0 = serverUserIdForMa(ma);
      if (sid0 && !vSet.has(sid0)) continue;
    }
    var raw = mitarbeiterKuerzelRawAusMa(ma);
    var chk = normalizeMitarbeiterKuerzelForSave(raw);
    if (!chk.ok) return { ok: false, message: MITARBEITER_KUERZEL_FEHLER };
    if (seen[chk.norm]) return { ok: false, message: MITARBEITER_KUERZEL_FEHLER };
    seen[chk.norm] = true;
  }
  return { ok: true, message: '' };
}

/**
 * Kürzel gegen bereits gespeicherte Mitarbeiter-Zeilen (andere user_id).
 * @param {unknown[]} list
 * @param {Array<Record<string, unknown>>} apiMitarbeiterRows
 * @param {{ validUserIds?: Set<string>, skipOrphanNotInUsers?: boolean }|null} [opts]
 * @returns {{ ok: boolean, message: string }}
 */
export function validateMitarbeiterKuerzelGegenApiStamm(list, apiMitarbeiterRows, opts) {
  var rows = Array.isArray(apiMitarbeiterRows) ? apiMitarbeiterRows : [];
  var skip = opts && opts.skipOrphanNotInUsers;
  var vSet = opts && opts.validUserIds instanceof Set ? opts.validUserIds : null;
  for (var i = 0; i < list.length; i++) {
    var ma = /** @type {Record<string, unknown>|null} */ (list[i]);
    if (!ma) continue;
    var sid = serverUserIdForMa(ma);
    if (skip && vSet && sid && !vSet.has(sid)) continue;
    var chk = normalizeMitarbeiterKuerzelForSave(mitarbeiterKuerzelRawAusMa(ma));
    if (!chk.ok) return { ok: false, message: MITARBEITER_KUERZEL_FEHLER };
    var norm = chk.norm;
    var j;
    var r;
    var p;
    var rid;
    for (j = 0; j < rows.length; j++) {
      r = rows[j];
      if (!r) continue;
      p = r.position != null ? String(r.position).trim().toUpperCase() : '';
      if (p !== norm) continue;
      rid = r.user_id != null ? String(r.user_id).trim() : '';
      if (!rid) continue;
      if (sid && rid === sid) continue;
      return { ok: false, message: MITARBEITER_KUERZEL_FEHLER };
    }
  }
  return { ok: true, message: '' };
}

/**
 * Wendet normalisiertes Kürzel auf jeden Eintrag an (`k`, optional `av`).
 * @param {unknown[]} list
 * @param {{ validUserIds?: Set<string>, skipOrphanNotInUsers?: boolean }|null} [opts]
 */
export function mitarbeiterKuerzelListeNormalisieren(list, opts) {
  if (!Array.isArray(list)) return;
  var skip = opts && opts.skipOrphanNotInUsers;
  var vSet = opts && opts.validUserIds instanceof Set ? opts.validUserIds : null;
  for (var i = 0; i < list.length; i++) {
    var ma = /** @type {Record<string, unknown>|null} */ (list[i]);
    if (!ma) continue;
    if (skip && vSet) {
      var sidN = serverUserIdForMa(ma);
      if (sidN && !vSet.has(sidN)) continue;
    }
    var chk = normalizeMitarbeiterKuerzelForSave(mitarbeiterKuerzelRawAusMa(ma));
    if (!chk.ok) continue;
    ma.k = chk.norm;
    ma.av = maAvForCardDisplay(ma.n, chk.norm);
  }
}

/**
 * @param {Record<string, unknown>} ma
 * @param {(msg: string) => void} [showToast]
 */
export async function deleteMitarbeiterFromApi(ma, showToast) {
  const id = serverUserIdForMa(ma);
  if (!id) return;
  try {
    await apiFetch(API_ROUTES.cockpit.users + '/' + encodeURIComponent(id), { method: 'DELETE' });
  } catch (err) {
    logMitarbeiterSaveFailure(err);
    if (showToast) showToast('⚠ Mitarbeiter löschen: ' + (err instanceof Error ? err.message : String(err)));
    throw err;
  }
}

/**
 * @param {unknown[]} maData
 * @param {(msg: string) => void} [showToast]
 */
export async function saveMitarbeiterToApi(maData, showToast) {
  if (!getCurrentProjectId()) {
    await hydrateCockpitAccessibleProjectsAndEnsureContext();
  }
  const pid = getCurrentProjectId();
  if (!pid) {
    console.error('Kein Projekt gesetzt beim Mitarbeiter speichern');
    throw new Error('Projekt fehlt');
  }
  const list = Array.isArray(maData) ? maData : [];
  const firmaPin =
    readOptionalCockpitFirmaIdForMitarbeiterApi() ||
    (firmaIdForCcInternApi() != null ? String(firmaIdForCcInternApi()).trim() : '');
  let apiUsers = [];
  try {
    const usersRes = await apiFetch(API_ROUTES.cockpit.users);
    apiUsers = Array.isArray(usersRes?.users) ? usersRes.users : [];
  } catch (err) {
    logMitarbeiterSaveFailure(err, { phase: 'GET /users' });
    if (showToast) showToast('⚠ Mitarbeiter: Benutzerliste nicht ladbar — ' + (err instanceof Error ? err.message : String(err)));
    throw err;
  }
  let apiMitarbeiter = [];
  try {
    var maListQs = new URLSearchParams({ page: '1', limit: '500' });
    if (firmaPin) maListQs.set('firma_id', firmaPin);
    const maRes = await apiFetch('/api/v1/mitarbeiter?' + maListQs.toString());
    apiMitarbeiter = Array.isArray(maRes?.items) ? maRes.items : [];
  } catch (err) {
    logMitarbeiterSaveFailure(err, { phase: 'GET /mitarbeiter', note: 'Fortsetzung mit leerer Liste' });
    apiMitarbeiter = [];
  }
  /** @type {Map<string, string>} */
  const mitarbeiterIdByUserId = new Map(
    apiMitarbeiter
      .filter(function (r) {
        return r && r.user_id != null && r.id != null && String(r.user_id).trim() !== '' && String(r.id).trim() !== '';
      })
      .map(function (r) {
        return [String(r.user_id).trim(), String(r.id).trim()];
      }),
  );
  /** @type {Set<string>} */
  const validUserIds = new Set(
    apiUsers
      .map(function (u) {
        return u && u.id != null ? String(u.id).trim() : '';
      })
      .filter(Boolean),
  );
  function isExistingMitarbeiterEntry(ma) {
    if (!ma || typeof ma !== 'object') return false;
    var hasMid =
      (ma.mitarbeiter_id != null && String(ma.mitarbeiter_id).trim() !== '') ||
      (ma.mitarbeiterId != null && String(ma.mitarbeiterId).trim() !== '') ||
      (ma.ccMitarbeiterId != null && String(ma.ccMitarbeiterId).trim() !== '');
    if (hasMid) return true;
    var mid = ma.maId != null ? String(ma.maId).trim() : '';
    if (!mid) return false;
    return !/^NEW_/i.test(mid);
  }
  let skippedOrphans = 0;
  async function persistMitarbeiterStamm(userId, ma) {
    const uid = userId != null ? String(userId).trim() : '';
    if (!uid) return;
    const posRaw =
      ma && typeof ma === 'object' && ma.k != null && String(ma.k).trim() !== '' ? ma.k : '';
    const position = String(posRaw || '').trim().toUpperCase();
    const existingMidRaw =
      (ma && typeof ma === 'object' && (ma.mitarbeiter_id || ma.mitarbeiterId || ma.ccMitarbeiterId)) ||
      mitarbeiterIdByUserId.get(uid) ||
      '';
    const existingMid = String(existingMidRaw || '').trim();
    const body = {
      user_id: uid,
      position: position || null,
      soll_stunden: ma && ma.soll != null ? Number(ma.soll) : null,
    };
    if (firmaPin) body.firma_id = firmaPin;
    if (existingMid) {
      await apiFetch('/api/v1/mitarbeiter/' + encodeURIComponent(existingMid), {
        method: 'PUT',
        body,
      });
      mitarbeiterIdByUserId.set(uid, existingMid);
      if (ma && typeof ma === 'object') ma.mitarbeiter_id = existingMid;
      return;
    }
    const created = await apiFetch('/api/v1/mitarbeiter', {
      method: 'POST',
      body,
    });
    const createdItem = created && created.item && typeof created.item === 'object' ? created.item : created;
    if (createdItem && createdItem.id != null) {
      const newMid = String(createdItem.id).trim();
      if (newMid) {
        mitarbeiterIdByUserId.set(uid, newMid);
        if (ma && typeof ma === 'object') ma.mitarbeiter_id = newMid;
      }
    }
  }
  // 1) User-Basisdaten immer zuerst sichern (soll/urlaub), unabhängig von Kürzel-/positions-Prüfungen.
  for (let i = 0; i < list.length; i++) {
    const ma = /** @type {Record<string, unknown>} */ (list[i]);
    if (!ma) continue;
    const sid = serverUserIdForMa(ma);
    if (!sid) {
      if (isExistingMitarbeiterEntry(ma)) {
        throw new Error('Mitarbeiter hat keine gültige User-ID. Urlaub kann nicht gespeichert werden.');
      }
      continue;
    }
    if (!validUserIds.has(sid)) {
      skippedOrphans++;
      console.warn('[ccintern-cockpit-api] saveMitarbeiterToApi skip user PATCH: user_id nicht in users', sid, ma);
      continue;
    }
    try {
      const su = mitarbeiterSollUrlaubForApi(ma);
      await apiFetch(API_ROUTES.cockpit.users + '/' + encodeURIComponent(sid), {
        method: 'PATCH',
        body: {
          name: String(ma.n || ma.name || '').trim() || null,
          soll: su.soll,
          urlaub: su.urlaub,
        },
      });
    } catch (err) {
      logMitarbeiterSaveFailure(err, { phase: 'PATCH /users', maIndex: i, ma });
      if (showToast) showToast('⚠ Mitarbeiter speichern: ' + (err instanceof Error ? err.message : String(err)));
      throw err;
    }
  }
  const kuerzelOpts = { skipOrphanNotInUsers: true, validUserIds };
  const listValidation = validateMitarbeiterKuerzelListe(list, kuerzelOpts);
  if (!listValidation.ok) {
    if (showToast) showToast('⚠ ' + listValidation.message);
    throw new Error(listValidation.message);
  }
  mitarbeiterKuerzelListeNormalisieren(list, kuerzelOpts);
  const apiValidation = validateMitarbeiterKuerzelGegenApiStamm(list, apiMitarbeiter, kuerzelOpts);
  if (!apiValidation.ok) {
    if (showToast) showToast('⚠ ' + apiValidation.message);
    throw new Error(apiValidation.message);
  }
  for (let i = 0; i < list.length; i++) {
    const ma = /** @type {Record<string, unknown>} */ (list[i]);
    if (!ma) continue;
    const sid = serverUserIdForMa(ma);
    const isEdit = !!(sid && validUserIds.has(sid));
    const mitarbeiterIdLog =
      ma && typeof ma === 'object'
        ? String(ma.mitarbeiter_id || ma.mitarbeiterId || ma.ccMitarbeiterId || '').trim()
        : '';
    const payloadLog = {
      n: ma.n,
      name: ma.name,
      k: ma.k,
      kuerzel: ma.kuerzel,
      email: ma.email,
      soll: ma.soll,
      rolle: ma.rolle,
      maId: ma.maId,
      mitarbeiter_id: mitarbeiterIdLog || undefined,
    };
    console.log('[mitarbeiter-save] payload', payloadLog);
    console.log('[mitarbeiter-save] isEdit', isEdit);
    console.log('[mitarbeiter-save] id', mitarbeiterIdLog || null);
    console.log('[mitarbeiter-save] user_id', sid || null);
    if (sid && !validUserIds.has(sid)) {
      skippedOrphans++;
      console.warn('[ccintern-cockpit-api] saveMitarbeiterToApi skip: user_id nicht in users', sid, ma);
      continue;
    }
    try {
      if (!sid) {
        if (isExistingMitarbeiterEntry(ma)) {
          throw new Error('Mitarbeiter hat keine gültige User-ID. Urlaub kann nicht gespeichert werden.');
        }
        const emailRaw =
          (ma.email != null && String(ma.email).trim()) || newPlaceholderMitarbeiterEmail();
        const name = String(ma.n || ma.name || '').trim();
        const global_role = mapMaToApiGlobalRole(ma);
        const su = mitarbeiterSollUrlaubForApi(ma);
        if (!firmaPin) {
          const msg =
            'Keine Firma gewählt — bitte im Cockpit oben eine Firma auswählen, dann erneut speichern.';
          if (showToast) showToast('⚠ ' + msg);
          throw new Error(msg);
        }
        const res = await apiFetch(API_ROUTES.cockpit.users, {
          method: 'POST',
          body: {
            email: emailRaw,
            name: name || null,
            global_role,
            company_id: firmaPin,
            modules: ['ccintern'],
            rights: {},
            soll: su.soll,
            urlaub: su.urlaub,
          },
        });
        const u = res && res.user ? res.user : null;
        if (u && u.id) {
          ma.id = u.id;
          ma.maId = u.id;
          ma.email = u.email || emailRaw;
          ma.n = u.name || name;
          ma.name = u.name || name;
          ma.ccApiId = u.id;
          ma.rolle = u.global_role || global_role;
          ma.r = u.global_role || global_role;
          await persistMitarbeiterStamm(u.id, ma);
        }
      } else {
        await persistMitarbeiterStamm(sid, ma);
      }
    } catch (err) {
      logMitarbeiterSaveFailure(err, { maIndex: i, ma });
      if (showToast) showToast('⚠ Mitarbeiter speichern: ' + (err instanceof Error ? err.message : String(err)));
      throw err;
    }
  }
  if (skippedOrphans > 0 && showToast) {
    showToast(
      '⚠ ' +
        skippedOrphans +
        ' Eintrag/Einträge ohne gültige users.id übersprungen (verwaiste Mitarbeiter-Stammdaten).',
    );
  }
  await reloadUsersFromApiIntoMaTarget(showToast);
}

/** Revokiert Blob-URLs aus vorherigem `fetchCcInternAuftragDateienUi`. */
export function revokeCcInternServerDateienBlobUrls(auftrag) {
  if (!auftrag || typeof auftrag !== 'object') return;
  const prev = /** @type {{ __ccinternDateiBlobUrls?: unknown }} */ (auftrag).__ccinternDateiBlobUrls;
  if (!Array.isArray(prev)) return;
  prev.forEach(function (u) {
    try {
      if (typeof u === 'string') URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
  });
  /** @type {{ __ccinternDateiBlobUrls?: unknown }} */ (auftrag).__ccinternDateiBlobUrls = [];
}

function ccInternTypToUiLabel(typ) {
  const t = String(typ || '').toLowerCase();
  const map = {
    layout_grafik: 'Layout / Grafik',
    druckdatei: 'Finale Druckdatei',
    kundenfreigabe: 'Kundenfreigabe',
    montagefoto: 'Montagefoto',
    entwurf: 'Entwurf',
    vorher: 'Vorher',
    nachher: 'Nachher',
  };
  return map[t] || String(typ || 'Datei');
}

/**
 * GET …/auftraege/:id/dateien — Rohzeilen aus API-Umschlag.
 * @param {string} ccApiId
 * @returns {Promise<any[]>}
 */
export async function fetchCcInternAuftragDateienMeta(ccApiId) {
  const id = ccApiId != null ? String(ccApiId).trim() : '';
  if (!id) return [];
  const path = `${API_ROUTES.ccintern.auftraege}/${encodeURIComponent(id)}/dateien`;
  const res = await apiFetch(path);
  return Array.isArray(res?.dateien) ? res.dateien : [];
}

/**
 * Lädt Metadaten + Binärinhalt (Blob-URLs für UI).
 * @param {string} ccApiId
 * @param {{ __ccinternDateiBlobUrls?: string[] } | null | undefined} auftragOpt
 * @returns {Promise<any[]>}
 */
export async function fetchCcInternAuftragDateienUi(ccApiId, auftragOpt) {
  revokeCcInternServerDateienBlobUrls(auftragOpt || null);
  const meta = await fetchCcInternAuftragDateienMeta(ccApiId);
  /** @type {string[]} */
  const blobUrls = [];
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < meta.length; i++) {
    const row = meta[i];
    if (!row || typeof row !== 'object') continue;
    const pub = row.public_url != null ? String(row.public_url) : '';
    if (!pub.startsWith('/')) continue;
    let blob;
    try {
      blob = await apiFetchBlob(pub);
    } catch {
      continue;
    }
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    const typRaw = row.typ != null ? String(row.typ) : '';
    out.push(
      Object.assign({}, row, {
        data: url,
        localUrl: url,
        typ: ccInternTypToUiLabel(typRaw),
        mimeType: row.mimetype != null ? String(row.mimetype) : '',
        name: row.originalname != null ? String(row.originalname) : String(row.filename || ''),
        size: Number(row.size || 0),
        _src: 'server',
        serverDateiId: row.id != null ? String(row.id) : '',
        apiTyp: typRaw,
      }),
    );
  }
  if (auftragOpt && typeof auftragOpt === 'object') auftragOpt.__ccinternDateiBlobUrls = blobUrls;
  return out;
}

/** Dateiname / Originalname für Merge-Dedupe (klein, getrimmt). */
export function ccInternNormDateiName(row) {
  if (!row || typeof row !== 'object') return '';
  const n = row.name != null ? String(row.name) : row.originalname != null ? String(row.originalname) : '';
  return n.trim().toLowerCase();
}

/** URL-/Data-Signatur (data:, blob:, …) für Dublettenabgleich. */
export function ccInternRowDateiUrlSig(row) {
  if (!row || typeof row !== 'object') return '';
  return String(row.dataUrl || row.data || row.localUrl || '').trim();
}

/** API-`typ` klein; Legacy: `ccinternApiTyp` oder aus Anzeige-`typ` ableiten. */
export function ccInternRowApiTypLower(row) {
  if (!row || typeof row !== 'object') return '';
  if (row.ccinternApiTyp != null && String(row.ccinternApiTyp).trim() !== '') {
    return String(row.ccinternApiTyp).trim().toLowerCase();
  }
  if (row.apiTyp != null && String(row.apiTyp).trim() !== '') return String(row.apiTyp).trim().toLowerCase();
  const tl = String(row.typ || '').toLowerCase();
  if (tl.includes('layout') && tl.includes('grafik')) return 'layout_grafik';
  if (tl.includes('finale') && tl.includes('druck')) return 'druckdatei';
  if (tl.includes('druckdatei') || (tl.includes('druck') && tl.includes('final'))) return 'druckdatei';
  if (tl.includes('nachher')) return 'nachher';
  if (tl.includes('vorher')) return 'vorher';
  if (tl.includes('montagefoto') || (tl.includes('montage') && tl.includes('foto'))) return 'montagefoto';
  return '';
}

export function ccInternRowPhaseLower(row) {
  if (!row || typeof row !== 'object') return '';
  const ph =
    row.ccinternPhase != null ? String(row.ccinternPhase) : row.phase != null ? String(row.phase) : '';
  return ph.trim().toLowerCase();
}

export function ccInternRowPositionLower(row) {
  if (!row || typeof row !== 'object') return '';
  const po =
    row.ccinternPosition != null ? String(row.ccinternPosition) : row.position != null ? String(row.position) : '';
  return po.trim().toLowerCase();
}

/**
 * `candidateRow` gilt als bereits durch `existingRow` abgedeckt, wenn eine der Regeln zutrifft:
 * gleiche serverDateiId, gleiche URL, gleicher Name+Größe, oder gleicher Name+API-Typ+Phase+Position+Größe.
 * @param {Record<string, unknown>} existingRow
 * @param {Record<string, unknown>} candidateRow
 * @returns {boolean}
 */
export function ccInternDateiRowIsDuplicateOf(existingRow, candidateRow) {
  if (!existingRow || !candidateRow || typeof existingRow !== 'object' || typeof candidateRow !== 'object') {
    return false;
  }
  const eSid = existingRow.serverDateiId != null ? String(existingRow.serverDateiId).trim() : '';
  const cSid = candidateRow.serverDateiId != null ? String(candidateRow.serverDateiId).trim() : '';
  if (eSid && cSid && eSid === cSid) return true;
  const u1 = ccInternRowDateiUrlSig(existingRow);
  const u2 = ccInternRowDateiUrlSig(candidateRow);
  if (u1 && u2 && u1 === u2) return true;
  const n1 = ccInternNormDateiName(existingRow);
  const n2 = ccInternNormDateiName(candidateRow);
  const s1 = Number(existingRow.size || 0);
  const s2 = Number(candidateRow.size || 0);
  if (n1 && n2 && n1 === n2 && s1 === s2 && s1 > 0) return true;
  const t1 = ccInternRowApiTypLower(existingRow);
  const t2 = ccInternRowApiTypLower(candidateRow);
  const ph1 = ccInternRowPhaseLower(existingRow);
  const ph2 = ccInternRowPhaseLower(candidateRow);
  const po1 = ccInternRowPositionLower(existingRow);
  const po2 = ccInternRowPositionLower(candidateRow);
  if (n1 && n2 && n1 === n2 && t1 && t2 && t1 === t2 && ph1 === ph2 && po1 === po2 && s1 === s2) return true;
  return false;
}

/**
 * Anzeige-Merge: Server-Zeilen zuerst, Legacy nur ergänzend ohne Dubletten zu Server (oder untereinander).
 * @param {unknown[]} serverRows UI-Zeilen von `fetchCcInternAuftragDateienUi`
 * @param {unknown[]} legacyRows Roh- oder UI-Zeilen (z. B. `a.dateien`, Planung)
 * @returns {any[]}
 */
export function mergeCcInternDateienDisplayRows(serverRows, legacyRows) {
  const srv = Array.isArray(serverRows) ? serverRows : [];
  const leg = Array.isArray(legacyRows) ? legacyRows : [];
  /** @type {any[]} */
  const out = [];
  let si;
  for (si = 0; si < srv.length; si++) {
    out.push(Object.assign({}, srv[si]));
  }
  let lj;
  for (lj = 0; lj < leg.length; lj++) {
    const c = leg[lj];
    if (!c || typeof c !== 'object') continue;
    let dup = false;
    let k;
    for (k = 0; k < out.length; k++) {
      if (ccInternDateiRowIsDuplicateOf(out[k], c)) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    out.push(Object.assign({}, c));
  }
  return out;
}

/**
 * Multipart-Upload einer Auftragsdatei (zentrale Route).
 * @param {string} ccApiId
 * @param {File} file
 * @param {{ typ: string, bereich?: string, phase?: string, position?: string }} fields
 */
export async function uploadCcInternAuftragDatei(ccApiId, file, fields) {
  const id = ccApiId != null ? String(ccApiId).trim() : '';
  if (!id || !file) throw new Error('uploadCcInternAuftragDatei: ccApiId oder Datei fehlt.');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('typ', fields.typ);
  if (fields.bereich) fd.append('bereich', fields.bereich);
  if (fields.phase) fd.append('phase', fields.phase);
  if (fields.position) fd.append('position', fields.position);
  const path = `${API_ROUTES.ccintern.auftraege}/${encodeURIComponent(id)}/dateien/upload`;
  return apiFetchFormData(path, { method: 'POST', body: fd });
}

/**
 * Nach erstem POST eines Auftrags: wartende lokale Dateien (RAM) zur API nachziehen.
 * @param {{ ccApiId?: unknown, __pendingCcinternDateiUploads?: unknown }} a
 * @param {(msg: string) => void} [showToast]
 */
export async function flushPendingCcInternDateiUploadsForAuftrag(a, showToast) {
  const cid = a && a.ccApiId != null ? String(a.ccApiId).trim() : '';
  const pendRaw = a && a.__pendingCcinternDateiUploads;
  const pend = Array.isArray(pendRaw) ? pendRaw : [];
  if (!cid || !pend.length) return;
  let ok = 0;
  /** @type {typeof pend} */
  const remaining = [];
  for (let i = 0; i < pend.length; i++) {
    const item = pend[i];
    const f = item && /** @type {{ file?: File }} */ (item).file;
    const typ =
      item && /** @type {{ typ?: string }} */ (item).typ != null
        ? String(/** @type {{ typ?: string }} */ (item).typ)
        : 'montagefoto';
    const phase =
      item && /** @type {{ phase?: string }} */ (item).phase != null
        ? String(/** @type {{ phase?: string }} */ (item).phase)
        : '';
    const position =
      item && /** @type {{ position?: string }} */ (item).position != null
        ? String(/** @type {{ position?: string }} */ (item).position)
        : '';
    if (!(f instanceof File)) continue;
    try {
      await uploadCcInternAuftragDatei(cid, f, {
        typ,
        phase: phase || undefined,
        position: position || undefined,
      });
      ok++;
    } catch (e) {
      console.warn('[ccintern-cockpit-api] Pending-Datei-Upload fehlgeschlagen (Auftrag bleibt gespeichert)', e);
      remaining.push(item);
    }
  }
  /** @type {{ __pendingCcinternDateiUploads?: unknown }} */ (a).__pendingCcinternDateiUploads = remaining;
  if (ok > 0 && showToast) showToast(ok + ' ausstehende Datei(en) zur Cloud synchronisiert.');
  if (remaining.length > 0 && showToast) {
    showToast(
      '⚠ ' +
        remaining.length +
        ' Datei(en) konnten nicht hochgeladen werden — Auftrag ist gespeichert; bitte erneut versuchen oder Datei prüfen.',
    );
  }
}

/**
 * @param {string} ccApiId
 * @param {string} dateiId
 */
export async function deleteCcInternAuftragDatei(ccApiId, dateiId) {
  const aid = ccApiId != null ? String(ccApiId).trim() : '';
  const did = dateiId != null ? String(dateiId).trim() : '';
  if (!aid || !did) throw new Error('deleteCcInternAuftragDatei: Parameter fehlen.');
  const path = `${API_ROUTES.ccintern.auftraege}/${encodeURIComponent(aid)}/dateien/${encodeURIComponent(did)}`;
  return apiFetch(path, { method: 'DELETE' });
}

// ── Urlaub / Abwesenheit (`GET|POST|PUT /api/v1/urlaub`) — firma-scoped, kein Pflicht-Projekt-Header ──

const API_V1_URLAUB = '/api/v1/urlaub';
const API_V1_CCINTERN_MITARBEITER_OP = '/api/v1/ccintern/mitarbeiter';

/**
 * @param {any} row
 * @returns {Record<string, unknown>|null}
 */
export function urlaubApiRowToUiRecord(row) {
  if (!row || typeof row !== 'object') return null;
  const typRaw = String(row.typ || 'urlaub');
  const be = String(row.bemerkung || '');
  let typLabel = 'Urlaub';
  if (typRaw === 'krank') typLabel = 'Krank';
  else if (typRaw === 'sonstig') {
    if (/Überstunden/i.test(be)) typLabel = 'Überstunden';
    else if (/Kurzabw/i.test(be)) typLabel = 'Kurzabwesenheit';
    else typLabel = 'Zeitausgleich';
  }
  let stunden;
  if (typLabel === 'Überstunden' || typLabel === 'Kurzabwesenheit') {
    const m = be.match(/(\d+(?:[.,]\d+)?)\s*h/i);
    stunden = m ? parseFloat(String(m[1]).replace(',', '.')) : undefined;
  }
  const von = String(row.von || '').slice(0, 10);
  const bis = String(row.bis || '').slice(0, 10);
  return {
    id: String(row.id || ''),
    maId: String(row.mitarbeiter_id || ''),
    ma: String(row.mitarbeiter_name || ''),
    typ: typLabel,
    von,
    bis,
    stunden,
    artLabel: typLabel === 'Kurzabwesenheit' ? 'Kurzabwesenheit' : undefined,
    notiz: be,
    status: String(row.status || 'offen'),
    erstellt: row.erstellt_am != null ? String(row.erstellt_am) : new Date().toISOString(),
  };
}

/**
 * POST/PUT /api/v1/urlaub: Feld `mitarbeiter_id` ist FK auf `users.id` (Backend: getUserById).
 * UI-`maId` kann Stamm-UUID, User-UUID oder Kürzel sein — wie Aufgaben-Matching.
 *
 * @param {unknown} maIdRaw
 * @returns {{ userId: string, stammMitarbeiterId: string|null, kuerzel: string|null, via: string }}
 */
export function resolveCcInternUserIdFromWorkflowMaKey(maIdRaw) {
  const raw = maIdRaw != null ? String(maIdRaw).trim() : '';
  if (!raw) {
    return { userId: '', stammMitarbeiterId: null, kuerzel: null, via: 'empty' };
  }
  const list = maDataListForResolve();
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m || typeof m !== 'object') continue;
    const userId = rowToCockpitUserUuid(m);
    const stammId = m.mitarbeiter_id != null ? String(m.mitarbeiter_id).trim() : '';
    const k = m.k != null ? String(m.k).trim() : '';
    if (stammId && stammId === raw && userId) {
      return { userId, stammMitarbeiterId: stammId, kuerzel: k || null, via: 'stamm_id_to_user' };
    }
    if (userId && (String(m.id).trim() === raw || String(m.maId).trim() === raw)) {
      return { userId, stammMitarbeiterId: stammId || null, kuerzel: k || null, via: 'user_id' };
    }
    if (k && k.toUpperCase() === raw.toUpperCase() && userId) {
      return { userId, stammMitarbeiterId: stammId || null, kuerzel: k, via: 'kuerzel_to_user' };
    }
  }
  if (cockpitUserUuidLooksValid(raw)) {
    return { userId: raw, stammMitarbeiterId: null, kuerzel: null, via: 'raw_uuid' };
  }
  return { userId: raw, stammMitarbeiterId: null, kuerzel: null, via: 'unresolved' };
}

/** Mitarbeiter-App-only: kein Desktop-Kalender (Recht ccintern.kalender.sehen fehlt oft). */
function skipKalenderFeedForMaAppOnly() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.__CCINTERN_MITARBEITER_APP_BOOT__ === true) return true;
    const ui = window.CC_SHELL_UI_ACCESS;
    if (ui && ui.isMitarbeiterAppOnlyShell === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * @param {Record<string, unknown>} a
 */
function uiUrlaubRecordToApiBody(a) {
  const ident = resolveCcInternUserIdFromWorkflowMaKey(a.maId);
  const mitarbeiter_id = ident.userId;
  const today = new Date().toISOString().slice(0, 10);
  let typ = 'urlaub';
  const typUi = String(a.typ || '');
  if (typUi === 'Krank') typ = 'krank';
  else if (typUi === 'Urlaub') typ = 'urlaub';
  else typ = 'sonstig';
  let von = isoOrNull(a.von);
  let bis = isoOrNull(a.bis);
  if (typUi === 'Überstunden') {
    von = today;
    bis = today;
  }
  if (!von || !bis) {
    von = today;
    bis = today;
  }
  let bemerkung = nullableStr(a.notiz);
  if (typUi === 'Überstunden') {
    const h = a.stunden != null ? String(a.stunden) : '0';
    bemerkung = `Überstunden ${h}h` + (bemerkung ? ' · ' + bemerkung : '');
  } else if (typUi === 'Kurzabwesenheit') {
    const h = a.stunden != null ? String(a.stunden) : '0';
    bemerkung = `Kurzabwesenheit ${h}h` + (bemerkung ? ' · ' + bemerkung : '');
  } else if (typUi === 'Zeitausgleich') {
    bemerkung = bemerkung || 'Zeitausgleich';
  }
  return {
    mitarbeiter_id,
    von,
    bis,
    typ,
    status: String(a.status || 'offen'),
    bemerkung,
  };
}

/**
 * @param {(msg: string) => void} [showToast]
 */
export async function reloadUrlaubFromApiIntoMemory(showToast) {
  if (typeof URLAUB_ANTRAEGE === 'undefined' || !Array.isArray(URLAUB_ANTRAEGE)) return;
  try {
    const data = await apiFetch(`${API_V1_URLAUB}?limit=500&page=1`);
    const rows = Array.isArray(data?.urlaub) ? data.urlaub : [];
    URLAUB_ANTRAEGE.length = 0;
    rows.forEach(function (r) {
      const u = urlaubApiRowToUiRecord(r);
      if (u && u.id) URLAUB_ANTRAEGE.push(u);
    });
  } catch (e) {
    console.error('[ccintern-cockpit-api] reloadUrlaub', e);
    if (showToast) showToast('⚠ Urlaub konnte nicht geladen werden.');
  }
}

/**
 * @param {Record<string, unknown>} a
 * @param {(msg: string) => void} [showToast]
 */
export async function postUrlaubAntragFromUi(a, showToast) {
  const ident = resolveCcInternUserIdFromWorkflowMaKey(a.maId);
  const body = uiUrlaubRecordToApiBody(a);
  const W = typeof window !== 'undefined' ? /** @type {Window & { MOB_MA_ID?: unknown; COCKPIT_FIRMA_ID?: unknown; CURRENT_USER_ID?: unknown }} */ (window) : null;
  console.warn('[MA_URLAUB_IDENT]', {
    uiMaId: a.maId,
    mob_ma_id: W && W.MOB_MA_ID != null ? W.MOB_MA_ID : null,
    user_id: ident.userId,
    stamm_mitarbeiter_id: ident.stammMitarbeiterId,
    kuerzel: ident.kuerzel,
    resolvedVia: ident.via,
    company_id: W && W.COCKPIT_FIRMA_ID != null ? W.COCKPIT_FIRMA_ID : null,
    currentUserId: W && W.CURRENT_USER_ID != null ? W.CURRENT_USER_ID : null,
  });
  console.warn('[MA_URLAUB_PAYLOAD]', body);
  console.warn('[MA_URLAUB_BACKEND_MATCH]', {
    backendExpects: 'users.id via store.getUserById(body.mitarbeiter_id)',
    sentMitarbeiter_id: body.mitarbeiter_id,
    resolvedVia: ident.via,
  });
  const data = await apiFetch(API_V1_URLAUB, { method: 'POST', body });
  const row = data && /** @type {{ urlaub?: unknown }} */ (data).urlaub;
  if (!row || typeof row !== 'object') throw new Error('Urlaub POST: leere Antwort');
  const u = urlaubApiRowToUiRecord(row);
  if (!u && showToast) showToast('⚠ Urlaub: Antwort ungültig.');
  return u;
}

/**
 * @param {Record<string, unknown>} a
 * @param {(msg: string) => void} [showToast]
 */
export async function putUrlaubAntragFromUi(a, showToast) {
  const id = String(a.id || '').trim();
  if (!isUuid(id)) throw new Error('Urlaub PUT: keine gültige API-ID.');
  const body = uiUrlaubRecordToApiBody(a);
  const data = await apiFetch(`${API_V1_URLAUB}/${encodeURIComponent(id)}`, { method: 'PUT', body });
  const row = data && /** @type {{ urlaub?: unknown }} */ (data).urlaub;
  if (!row || typeof row !== 'object') throw new Error('Urlaub PUT: leere Antwort');
  return urlaubApiRowToUiRecord(row);
}

/**
 * @param {string} id
 * @param {'genehmigt'|'abgelehnt'} newStatus
 * @param {(msg: string) => void} [showToast]
 */
export async function putUrlaubStatusById(id, newStatus, showToast) {
  if (typeof URLAUB_ANTRAEGE === 'undefined' || !Array.isArray(URLAUB_ANTRAEGE)) return null;
  const sid = String(id || '').trim();
  const a = URLAUB_ANTRAEGE.find(function (x) {
    return x && String(x.id) === sid;
  });
  if (!a) {
    if (showToast) showToast('⚠ Antrag nicht gefunden.');
    return null;
  }
  try {
    const next = Object.assign({}, a, { status: newStatus });
    const u = await putUrlaubAntragFromUi(next, showToast);
    if (u) Object.assign(a, u);
    return u;
  } catch (e) {
    console.error('[ccintern-cockpit-api] putUrlaubStatusById', e);
    if (showToast) showToast('⚠ Urlaub-Entscheidung konnte nicht gespeichert werden.');
    return null;
  }
}

// ── Materiallager (`GET|POST|PUT|DELETE /api/v1/lager`, `POST …/buchungen`) ──

const API_V1_LAGER = '/api/v1/lager';

/**
 * @param {any} row
 * @returns {Record<string, unknown>|null}
 */
export function lagerApiRowToCcItem(row) {
  if (!row || typeof row !== 'object' || row.id == null) return null;
  const id = String(row.id).trim();
  if (!isUuid(id)) return null;
  const menge = Number(row.menge || 0);
  const mindest = Number(row.mindestbestand || 0);
  let status = 'ok';
  if (menge <= 0) status = 'leer';
  else if (menge <= mindest) status = 'warn';
  const katRaw = row.kategorie != null ? String(row.kategorie).trim() : '';
  const anRaw = row.artikelnummer != null ? String(row.artikelnummer).trim() : '';
  const nrDisp = anRaw !== '' ? anRaw : '-';
  return {
    id,
    art: String(row.name || '').trim() || '—',
    kat: katRaw || 'folie',
    nr: nrDisp,
    eh: String(row.einheit || 'Stk').trim() || 'Stk',
    bestand: menge,
    mindest: mindest,
    status,
    bestellt: 0,
  };
}

/**
 * @param {(msg: string) => void} [showToast]
 * @returns {Promise<boolean>} true wenn GET erfolgreich (auch leere Liste)
 */
export async function reloadLagerFromApiIntoLagCc(showToast) {
  if (typeof window === 'undefined' || typeof window.LAGER_CC === 'undefined' || !Array.isArray(window.LAGER_CC)) {
    return false;
  }
  try {
    const data = await apiFetch(`${API_V1_LAGER}?limit=500&page=1`);
    const rows = Array.isArray(data?.lager) ? data.lager : [];
    window.LAGER_CC.length = 0;
    rows.forEach(function (r) {
      const it = lagerApiRowToCcItem(r);
      if (it) window.LAGER_CC.push(it);
    });
    window.__CCINTERN_LAGER_API_OK = true;
    return true;
  } catch (e) {
    console.error('[ccintern-cockpit-api] reloadLagerFromApiIntoLagCc', e);
    if (showToast) showToast('⚠ Lager konnte nicht geladen werden.');
    window.__CCINTERN_LAGER_API_OK = false;
    // Cockpit: keinen alten oder leeren DAL-Bestand vortäuschen — Liste leeren bis nächster erfolgreicher GET
    if (typeof window !== 'undefined' && window.__CCINTERN_COCKPIT_MOUNT__ && Array.isArray(window.LAGER_CC)) {
      window.LAGER_CC.length = 0;
    }
    return false;
  }
}

/**
 * @param {string} materialId
 * @param {'entnahme'|'zugang'|'korrektur'} typ
 * @param {number} menge
 * @param {(msg: string) => void} [showToast]
 * @param {{ mitarbeiter_id?: string|null; auftrag_id?: string|null; bemerkung?: string|null }} [opts]
 */
export async function postLagerBuchungAndRefresh(materialId, typ, menge, showToast, opts) {
  const mid = String(materialId || '').trim();
  if (!isUuid(mid)) throw new Error('Lager-Buchung: ungültige Material-ID.');
  const m = Number(menge);
  if (!Number.isFinite(m) || m <= 0) throw new Error('Lager-Buchung: Menge ungültig.');
  const t = String(typ || '').trim();
  if (t !== 'entnahme' && t !== 'zugang' && t !== 'korrektur') throw new Error('Lager-Buchung: typ ungültig.');
  const o = opts && typeof opts === 'object' ? opts : {};
  const body = {
    typ: t,
    menge: m,
    mitarbeiter_id: o.mitarbeiter_id != null ? String(o.mitarbeiter_id).trim() || null : null,
    auftrag_id: o.auftrag_id != null ? String(o.auftrag_id).trim() || null : null,
    bemerkung: o.bemerkung != null ? String(o.bemerkung).trim() || null : null,
  };
  await apiFetch(`${API_V1_LAGER}/${encodeURIComponent(mid)}/buchungen`, { method: 'POST', body });
  await reloadLagerFromApiIntoLagCc(showToast);
  if (typeof window !== 'undefined' && typeof window.renderLagerCC === 'function') window.renderLagerCC();
  if (typeof window !== 'undefined' && typeof window.mobRenderLager === 'function') window.mobRenderLager();
}

/**
 * @param {Record<string, unknown>} item — Felder art, eh, bestand, mindest, kat, id?
 * @param {boolean} isNew
 * @param {(msg: string) => void} [showToast]
 */
export async function upsertLagerCcItemToApi(item, isNew, showToast) {
  if (!item || typeof item !== 'object') throw new Error('upsertLagerCcItemToApi: item fehlt.');
  const name = String(item.art || '').trim();
  if (!name) throw new Error('upsertLagerCcItemToApi: name fehlt.');
  const einheit = String(item.eh || 'Stk').trim() || 'Stk';
  const menge = Number(item.bestand ?? 0);
  const mindestbestand = Number(item.mindest ?? 0);
  if (!Number.isFinite(menge) || menge < 0) throw new Error('upsertLagerCcItemToApi: bestand ungültig.');
  if (!Number.isFinite(mindestbestand) || mindestbestand < 0) throw new Error('upsertLagerCcItemToApi: mindest ungültig.');
  const kategorie = item.kat != null && String(item.kat).trim() !== '' ? String(item.kat).trim() : null;
  const nrUi = String(item.nr != null ? item.nr : '').trim();
  const artikelnummer = nrUi === '' || nrUi === '-' ? null : nrUi;
  const body = { name, einheit, menge, mindestbestand, kategorie, artikelnummer, lagerort: null };
  if (isNew) {
    await apiFetch(API_V1_LAGER, { method: 'POST', body });
  } else {
    const id = String(item.id || '').trim();
    if (!isUuid(id)) throw new Error('upsertLagerCcItemToApi: keine gültige id.');
    await apiFetch(`${API_V1_LAGER}/${encodeURIComponent(id)}`, { method: 'PUT', body });
  }
  await reloadLagerFromApiIntoLagCc(showToast);
  if (typeof window !== 'undefined' && typeof window.renderLagerCC === 'function') window.renderLagerCC();
  if (typeof window !== 'undefined' && typeof window.mobRenderLager === 'function') window.mobRenderLager();
}

/**
 * @param {string} id
 * @param {(msg: string) => void} [showToast]
 */
export async function deleteLagerMaterialByIdFromApi(id, showToast) {
  const mid = String(id || '').trim();
  if (!isUuid(mid)) throw new Error('deleteLagerMaterialByIdFromApi: ungültige id.');
  await apiFetch(`${API_V1_LAGER}/${encodeURIComponent(mid)}`, { method: 'DELETE' });
  await reloadLagerFromApiIntoLagCc(showToast);
  if (typeof window !== 'undefined' && typeof window.renderLagerCC === 'function') window.renderLagerCC();
  if (typeof window !== 'undefined' && typeof window.mobRenderLager === 'function') window.mobRenderLager();
}

// ── Mitarbeiter Tag-Status + Anwesenheit ───────────────────────────────

/**
 * @param {(msg: string) => void} [showToast]
 */
export async function reloadMitarbeiterTagStatusIntoMemory(showToast) {
  if (typeof window === 'undefined') return;
  window.MA_VERF = window.MA_VERF || {};
  const today = new Date().toISOString().slice(0, 10);
  const von = new Date();
  von.setDate(von.getDate() - 21);
  const datumVon = von.toISOString().slice(0, 10);
  try {
    const data = await apiFetch(
      `${API_V1_CCINTERN_MITARBEITER_OP}/status?datum_von=${encodeURIComponent(datumVon)}&datum_bis=${encodeURIComponent(today)}`,
    );
    const rows = Array.isArray(data?.status) ? data.status : [];
    rows.forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      const uid = String(r.user_id || '').trim();
      const d = String(r.datum || '').trim();
      const st = String(r.status || '').trim();
      if (!uid || !st || d !== today) return;
      window.MA_VERF[uid] = st;
    });
  } catch (e) {
    console.error('[ccintern-cockpit-api] reloadMitarbeiterTagStatus', e);
    if (showToast) showToast('⚠ Mitarbeiter-Status konnte nicht geladen werden.');
  }
}

/**
 * @param {string} userId
 * @param {string} status
 * @param {string|null} [datumIsoDay]
 * @param {(msg: string) => void} [showToast]
 */
export async function postMitarbeiterTagStatus(userId, status, datumIsoDay, showToast) {
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('postMitarbeiterTagStatus: user_id fehlt.');
  const datum = datumIsoDay && String(datumIsoDay).trim() ? String(datumIsoDay).slice(0, 10) : new Date().toISOString().slice(0, 10);
  await apiFetch(`${API_V1_CCINTERN_MITARBEITER_OP}/status`, {
    method: 'POST',
    body: { user_id: uid, status: String(status || 'verfuegbar'), datum },
  });
}

/**
 * @param {(msg: string) => void} [showToast]
 */
export async function reloadMitarbeiterAnwesenheitFromApiIntoMemory(showToast) {
  if (typeof MA_ANWESENHEIT === 'undefined' || !Array.isArray(MA_ANWESENHEIT)) return;
  const von = new Date();
  von.setFullYear(von.getFullYear() - 1);
  const datumVon = von.toISOString().slice(0, 10);
  try {
    const data = await apiFetch(
      `${API_V1_CCINTERN_MITARBEITER_OP}/anwesenheit?datum_von=${encodeURIComponent(datumVon)}`,
    );
    const rows = Array.isArray(data?.anwesenheit) ? data.anwesenheit : [];
    MA_ANWESENHEIT.length = 0;
    rows.forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      MA_ANWESENHEIT.push({
        id: String(r.id || ''),
        maId: String(r.user_id || ''),
        ma: String(r.mitarbeiter_name || ''),
        datum: String(r.datum || ''),
        start: r.start != null ? String(r.start) : '',
        end: r.ende != null ? String(r.ende) : '',
        dauer: r.dauer_minuten != null ? Number(r.dauer_minuten) : 0,
        typ: String(r.typ || 'anwesenheit'),
        notiz: r.notiz != null ? String(r.notiz) : '',
        erstellt: r.created_at != null ? String(r.created_at) : new Date().toISOString(),
      });
    });
  } catch (e) {
    console.error('[ccintern-cockpit-api] reloadMitarbeiterAnwesenheit', e);
    if (showToast) showToast('⚠ Anwesenheit konnte nicht geladen werden.');
  }
}

/**
 * @param {Record<string, unknown>} entry
 * @param {(msg: string) => void} [showToast]
 */
export async function postMitarbeiterAnwesenheitFromUi(entry, showToast) {
  const ident = resolveCcInternUserIdFromWorkflowMaKey(entry.maId);
  const user_id = ident.userId;
  const datum = isoOrNull(entry.datum);
  if (!user_id || !datum) throw new Error('postMitarbeiterAnwesenheitFromUi: maId/datum fehlt.');
  const body = {
    user_id,
    datum,
    start: nullableStr(entry.start),
    ende: nullableStr(entry.end != null ? entry.end : entry.ende),
    pause_minuten: 0,
    dauer_minuten: entry.dauer != null ? Math.round(Number(entry.dauer)) : null,
    typ: String(entry.typ || 'anwesenheit'),
    notiz: nullableStr(entry.notiz),
  };
  const data = await apiFetch(`${API_V1_CCINTERN_MITARBEITER_OP}/anwesenheit`, { method: 'POST', body });
  const row = data && /** @type {{ anwesenheit?: unknown }} */ (data).anwesenheit;
  if (!row || typeof row !== 'object') throw new Error('Anwesenheit POST: leere Antwort');
  return row;
}

const API_ARBEITSZEIT = `${API_V1_CCINTERN_MITARBEITER_OP}/arbeitszeit`;

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>|null}
 */
function arbeitszeitSessionFromEnvelope(data) {
  const session = data && /** @type {{ session?: unknown }} */ (data).session;
  if (!session || typeof session !== 'object') return null;
  return /** @type {Record<string, unknown>} */ (session);
}

/** GET /ccintern/mitarbeiter/arbeitszeit/aktiv — JWT-user, keine user_id im Body. */
export async function fetchArbeitszeitSessionAktiv() {
  const data = await apiFetch(`${API_ARBEITSZEIT}/aktiv`);
  const session = arbeitszeitSessionFromEnvelope(data);
  console.info('[ARBEITSZEIT_SESSION_GET]', session);
  return session;
}

/** POST /arbeitszeit/start */
export async function postArbeitszeitStart() {
  const data = await apiFetch(`${API_ARBEITSZEIT}/start`, { method: 'POST', body: {} });
  const session = arbeitszeitSessionFromEnvelope(data);
  if (!session) throw new Error('Arbeitszeit start: leere Session');
  console.info('[ARBEITSZEIT_START]', session);
  return session;
}

/** POST /arbeitszeit/pause */
export async function postArbeitszeitPause() {
  const data = await apiFetch(`${API_ARBEITSZEIT}/pause`, { method: 'POST', body: {} });
  const session = arbeitszeitSessionFromEnvelope(data);
  if (!session) throw new Error('Arbeitszeit pause: leere Session');
  console.info('[ARBEITSZEIT_PAUSE]', session);
  return session;
}

/** POST /arbeitszeit/weiter */
export async function postArbeitszeitWeiter() {
  const data = await apiFetch(`${API_ARBEITSZEIT}/weiter`, { method: 'POST', body: {} });
  const session = arbeitszeitSessionFromEnvelope(data);
  if (!session) throw new Error('Arbeitszeit weiter: leere Session');
  console.info('[ARBEITSZEIT_WEITER]', session);
  return session;
}

/**
 * POST /arbeitszeit/stop — erzeugt Anwesenheit serverseitig.
 * @returns {Promise<{ session: null, anwesenheit: Record<string, unknown>|null }>}
 */
export async function postArbeitszeitStop() {
  const data = await apiFetch(`${API_ARBEITSZEIT}/stop`, { method: 'POST', body: {} });
  const anw =
    data && typeof data === 'object' && /** @type {{ anwesenheit?: unknown }} */ (data).anwesenheit;
  const anwesenheit = anw && typeof anw === 'object' ? /** @type {Record<string, unknown>} */ (anw) : null;
  console.info('[ARBEITSZEIT_STOP]', { session: null, anwesenheit });
  return { session: null, anwesenheit };
}

const API_AUFTRAG_ARBEITSZEIT = `${API_V1_CCINTERN_MITARBEITER_OP}/auftrag-arbeitszeit`;

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>|null}
 */
function auftragArbeitsSessionFromEnvelope(data) {
  const session = data && /** @type {{ session?: unknown }} */ (data).session;
  if (!session || typeof session !== 'object') return null;
  return /** @type {Record<string, unknown>} */ (session);
}

/**
 * @param {string} auftragId ccintern_auftraege.id
 * @param {string} schrittKey
 */
function auftragArbeitsBody(auftragId, schrittKey) {
  return {
    auftrag_id: String(auftragId).trim(),
    schritt_key: String(schrittKey).trim(),
  };
}

/** GET /auftrag-arbeitszeit/alle-aktiv — alle laufenden Sessions für Desktop-Anzeige */
export async function fetchAlleAktiveAuftragArbeitszeiten() {
  try {
    const pid = getCurrentProjectId();
    const extraHeaders = pid ? { 'x-project-id': pid } : {};
    const fid = firmaIdForCcInternApi();
    const qs = fid ? '?firma_id=' + encodeURIComponent(fid) : '';
    const data = await apiFetch(`${API_AUFTRAG_ARBEITSZEIT}/alle-aktiv` + qs, { headers: extraHeaders });
    const d = data && typeof data === 'object' ? data : {};
    const raw = (d.data && Array.isArray(d.data.sessions)) ? d.data.sessions
      : Array.isArray(d.sessions) ? d.sessions : [];
    return raw.map((r) => auftragArbeitsSessionFromEnvelope({ data: { session: r } })).filter(Boolean);
  } catch (err) {
    console.warn('[ALLE_AKTIV_ARBEITSZEIT]', err);
    return [];
  }
}

/** GET /auftrag-arbeitszeit/aktiv */
export async function fetchAuftragArbeitszeitAktiv() {
  const data = await apiFetch(`${API_AUFTRAG_ARBEITSZEIT}/aktiv`);
  const session = auftragArbeitsSessionFromEnvelope(data);
  console.info('[AUFTRAG_ARBEITSZEIT_SESSION_GET]', session);
  return session;
}

/**
 * @param {string} auftragId
 * @param {string} schrittKey
 */
export async function postAuftragArbeitszeitStart(auftragId, schrittKey) {
  const data = await apiFetch(`${API_AUFTRAG_ARBEITSZEIT}/start`, {
    method: 'POST',
    body: auftragArbeitsBody(auftragId, schrittKey),
  });
  const session = auftragArbeitsSessionFromEnvelope(data);
  if (!session) throw new Error('Auftrag-Arbeitszeit start: leere Session');
  console.info('[AUFTRAG_ARBEITSZEIT_START]', session);
  return session;
}

/**
 * @param {string} auftragId
 * @param {string} schrittKey
 */
export async function postAuftragArbeitszeitPause(auftragId, schrittKey) {
  const data = await apiFetch(`${API_AUFTRAG_ARBEITSZEIT}/pause`, {
    method: 'POST',
    body: auftragArbeitsBody(auftragId, schrittKey),
  });
  const session = auftragArbeitsSessionFromEnvelope(data);
  if (!session) throw new Error('Auftrag-Arbeitszeit pause: leere Session');
  console.info('[AUFTRAG_ARBEITSZEIT_PAUSE]', session);
  return session;
}

/**
 * @param {string} auftragId
 * @param {string} schrittKey
 */
export async function postAuftragArbeitszeitWeiter(auftragId, schrittKey) {
  const data = await apiFetch(`${API_AUFTRAG_ARBEITSZEIT}/weiter`, {
    method: 'POST',
    body: auftragArbeitsBody(auftragId, schrittKey),
  });
  const session = auftragArbeitsSessionFromEnvelope(data);
  if (!session) throw new Error('Auftrag-Arbeitszeit weiter: leere Session');
  console.info('[AUFTRAG_ARBEITSZEIT_WEITER]', session);
  return session;
}

/**
 * @param {string} auftragId
 * @param {string} schrittKey
 */
export async function postAuftragArbeitszeitStop(auftragId, schrittKey) {
  const data = await apiFetch(`${API_AUFTRAG_ARBEITSZEIT}/stop`, {
    method: 'POST',
    body: auftragArbeitsBody(auftragId, schrittKey),
  });
  const session = auftragArbeitsSessionFromEnvelope(data);
  const zeitbuchung =
    data && typeof data.zeitbuchung === 'object' && data.zeitbuchung !== null
      ? /** @type {Record<string, unknown>} */ (data.zeitbuchung)
      : null;
  console.info('[AUFTRAG_ARBEITSZEIT_STOP]', { session, zeitbuchung });
  return { session, zeitbuchung };
}
