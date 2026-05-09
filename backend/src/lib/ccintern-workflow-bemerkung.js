/**
 * CC-Intern: Workflow-Zuweisungen aus `ccintern_auftraege.bemerkung` (JSON __ccintern_v1).
 * Spiegelt die kanonischen Schritt-Aliase aus der Mitarbeiter-App (mobCanonicalWorkflowStep).
 */

const BEM_PREFIX = '{"__ccintern_v1"';

/**
 * @param {unknown} step
 * @returns {string}
 */
export function canonicalWorkflowStep(step) {
  if (step == null) return '';
  const s = String(step).trim().toLowerCase();
  const map = {
    entwurf: 'grafik',
    beklebung: 'montage',
    digitaldruck: 'druck',
    plot: 'druck',
    plotten: 'druck',
    schnitt: 'laminat',
    laminieren: 'laminat',
  };
  return map[s] || s;
}

/**
 * @param {string|null|undefined} bemerkung
 * @returns {Record<string, unknown>|null}
 */
export function parseCcinternBemerkungPayload(bemerkung) {
  const raw = bemerkung != null ? String(bemerkung) : '';
  if (!raw.trim().startsWith(BEM_PREFIX)) return null;
  try {
    const o = JSON.parse(raw);
    if (o && o.__ccintern_v1 === 1 && o.payload && typeof o.payload === 'object') {
      return /** @type {Record<string, unknown>} */ (o.payload);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {Record<string, unknown>|null|undefined} payload
 * @returns {Record<string, unknown>|null}
 */
function getSchritte(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const s = payload.schritte;
  if (!s || typeof s !== 'object') return null;
  return /** @type {Record<string, unknown>} */ (s);
}

/**
 * @param {Record<string, unknown>} schritte
 * @param {unknown} stepRaw
 * @returns {Record<string, unknown>|null}
 */
export function findSchrittObjektFuerSchritt(schritte, stepRaw) {
  if (!schritte || stepRaw == null) return null;
  const tryKeys = [stepRaw, canonicalWorkflowStep(stepRaw)];
  for (let i = 0; i < tryKeys.length; i++) {
    const k = tryKeys[i];
    if (k && schritte[String(k)]) {
      const o = schritte[String(k)];
      return o && typeof o === 'object' ? /** @type {Record<string, unknown>} */ (o) : null;
    }
  }
  const c = canonicalWorkflowStep(stepRaw);
  const keys = Object.keys(schritte);
  for (let j = 0; j < keys.length; j++) {
    if (canonicalWorkflowStep(keys[j]) === c) {
      const o = schritte[keys[j]];
      return o && typeof o === 'object' ? /** @type {Record<string, unknown>} */ (o) : null;
    }
  }
  return null;
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function uuidOrIdEq(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim() === String(b).trim();
}

/**
 * @param {Record<string, unknown>|null|undefined} sch
 * @param {string} userId
 * @returns {boolean}
 */
export function userIdAssignedToSchrittObjekt(sch, userId) {
  if (!sch || typeof sch !== 'object') return false;
  const uid = String(userId || '').trim();
  if (!uid) return false;
  if (uuidOrIdEq(sch.maId, uid)) return true;
  if (uuidOrIdEq(sch.werId, uid)) return true;
  if (uuidOrIdEq(sch.verantwortlicher, uid)) return true;
  const arrs = ['maIds', 'teamMaIds', 'zusatzMa'];
  for (let i = 0; i < arrs.length; i++) {
    const k = arrs[i];
    const v = sch[k];
    if (!Array.isArray(v)) continue;
    for (let j = 0; j < v.length; j++) {
      if (uuidOrIdEq(v[j], uid)) return true;
    }
  }
  return false;
}

/**
 * @param {string|null|undefined} bemerkung
 * @param {unknown} produktionSchrittName
 * @param {string} userId
 * @returns {boolean}
 */
export function userAssignedToProduktionSchrittInBemerkung(bemerkung, produktionSchrittName, userId) {
  const payload = parseCcinternBemerkungPayload(bemerkung);
  const schritte = getSchritte(payload);
  if (!schritte) return false;
  const sch = findSchrittObjektFuerSchritt(schritte, produktionSchrittName);
  return userIdAssignedToSchrittObjekt(sch, userId);
}

/**
 * @param {string|null|undefined} bemerkung
 * @param {string} userId
 * @returns {boolean}
 */
export function userReferencedInAnyWorkflowSchritt(bemerkung, userId) {
  const payload = parseCcinternBemerkungPayload(bemerkung);
  const schritte = getSchritte(payload);
  if (!schritte) return false;
  const keys = Object.keys(schritte);
  for (let i = 0; i < keys.length; i++) {
    const o = schritte[keys[i]];
    if (!o || typeof o !== 'object') continue;
    if (userIdAssignedToSchrittObjekt(/** @type {Record<string, unknown>} */ (o), userId)) return true;
  }
  return false;
}

/**
 * Aktueller Pool-Schritt: bevorzugt Payload `step`, sonst DB-Spalte `schritt`.
 * @param {string|null|undefined} bemerkung
 * @param {string|null|undefined} dbSchritt
 * @returns {string}
 */
export function workflowCurrentStepFromAuftragRow(bemerkung, dbSchritt) {
  const payload = parseCcinternBemerkungPayload(bemerkung);
  if (payload && payload.step != null && String(payload.step).trim() !== '') {
    return String(payload.step).trim();
  }
  return dbSchritt != null ? String(dbSchritt).trim() : '';
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function serializeCcinternBemerkungFromPayload(payload) {
  return JSON.stringify({ __ccintern_v1: 1, payload: payload || {} });
}
