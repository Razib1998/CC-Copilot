/**
 * Kalender-Feed — Cockpit/FUSA: nur Zeilen aus GET `/api/v1/stammdaten/kalender`
 * (keine synthetischen Termine aus `/ccintern/auftraege`, kein bemerkung-/RAM-Fallback).
 * @see ../calendar/ccw-calendar-unified-map.js
 */
import {
  apiFetch,
  hydrateCockpitAccessibleProjectsAndEnsureContext,
  getCurrentProjectId,
} from '../auth/cc-auth-session.js';
import { API_ROUTES } from '../api/api-routes.js';

export const CCW_APP_SHELL_PLACEHOLDER_PROJECT = 'ccw-app-shell-placeholder-project';

/**
 * @param {string} requestedProjectId
 * @returns {Promise<{ projects: object[], auftraege: object[], effectiveProjectId: string } | null>}
 */
const AUFTRAEGE_KALENDER_PROJECT_ID = 'auftraege-kalender';

/**
 * @param {string} von
 * @param {string} bis
 * @param {number} page
 * @param {number} limit
 */
async function fetchKalenderPageForCockpitFeed(von, bis, page, limit) {
  const pid = getCurrentProjectId();
  let qs = '?page=' + encodeURIComponent(String(page)) + '&limit=' + encodeURIComponent(String(limit));
  if (typeof window !== 'undefined') {
    const fid = window.COCKPIT_FIRMA_ID || window.__COCKPIT_FIRMA_ID;
    if (fid != null && String(fid).trim() !== '') {
      qs += '&firma_id=' + encodeURIComponent(String(fid).trim());
    }
  }
  if (von) qs += '&von=' + encodeURIComponent(von);
  if (bis) qs += '&bis=' + encodeURIComponent(bis);
  /* Kein HTTP-/Service-Worker-Cache für Kalenderliste (sonst alte Termine nach DB-Bereinigung). */
  qs += '&_ccKalCb=' + encodeURIComponent(String(Date.now()));
  /** @type {Record<string, string>} */
  const headers = {};
  if (pid) headers['x-project-id'] = String(pid).trim();
  return apiFetch(API_ROUTES.stammdaten.kalender + qs, {
    headers,
    cache: 'no-store',
  });
}

/**
 * @returns {Promise<object[]>}
 */
async function fetchAllStammdatenKalenderRows() {
  await hydrateCockpitAccessibleProjectsAndEnsureContext();
  if (!getCurrentProjectId()) return [];

  const now = new Date();
  const vonD = new Date(now);
  vonD.setDate(vonD.getDate() - 400);
  const bisD = new Date(now);
  bisD.setDate(bisD.getDate() + 730);
  const von = vonD.toISOString().slice(0, 10);
  const bis = bisD.toISOString().slice(0, 10);

  /** @type {object[]} */
  const all = [];
  let page = 1;
  const limit = 200;
  for (;;) {
    const res = await fetchKalenderPageForCockpitFeed(von, bis, page, limit);
    const items = res && Array.isArray(res.termine) ? res.termine : [];
    const total = res != null && res.total != null ? Number(res.total) : items.length;
    for (const row of items) {
      if (row && typeof row === 'object') all.push(row);
    }
    if (all.length >= total || items.length < limit) break;
    page += 1;
    if (page > 200) break;
  }
  return all;
}

/**
 * API-Zeile kalender_termine → eine Zeile für `buildCcwProjectCalendarEvents` (Feld `termin` / `typ`).
 * @param {object} row
 * @param {string} projectId
 * @returns {object|null}
 */
function kalenderApiRowToCalendarAuftragLike(row, projectId) {
  if (!row || typeof row !== 'object' || row.id == null) return null;
  const id = String(row.id).trim();
  const start = row.start != null ? String(row.start).trim() : '';
  if (!id || !start) return null;

  const typRaw = row.typ != null ? String(row.typ).trim().toLowerCase() : '';
  let typ = 'Sonstiges';
  let calendarCcInternTerminSparte = /** @type {'montage'|'lieferung'|undefined} */ (undefined);
  if (typRaw === 'montage') {
    typ = 'Montage';
    calendarCcInternTerminSparte = 'montage';
  } else if (typRaw === 'lieferung') {
    typ = 'Lieferung';
    calendarCcInternTerminSparte = 'lieferung';
  } else if (typRaw === 'beklebung') {
    typ = 'Montage';
  } else if (typRaw === 'urlaub') {
    typ = 'Urlaub';
  }

  const titel = row.titel != null ? String(row.titel).trim() : 'Termin';
  const quelleRaw = row.quelle != null ? String(row.quelle).trim().toLowerCase() : '';
  const quelleSystem = quelleRaw === 'fusa' ? 'fusa' : 'cc_intern';
  const auftragUuid = row.auftrag_id != null ? String(row.auftrag_id).trim() : '';
  const endeRaw = row.ende != null && String(row.ende).trim() !== '' ? String(row.ende).trim() : '';

  return {
    id,
    name: titel,
    title: titel,
    projektId: projectId,
    projectId,
    status: row.status ?? null,
    typ,
    termin: start,
    terminEnde: endeRaw || null,
    auftragsnummer: row.auftragsnummer != null ? String(row.auftragsnummer).trim() : '',
    projektName: 'Kalender',
    calendarCcInternTerminSparte,
    quelleSystem,
    origin: quelleRaw === 'fusa' ? 'fusa' : 'ccintern',
    ...(auftragUuid ? { auftragId: auftragUuid } : {}),
    fusa_auftrag_id: row.fusa_auftrag_id != null ? String(row.fusa_auftrag_id).trim() : null,
    calendarTerminId: id,
    calendarTerminTyp: typRaw || 'allgemein',
    calendarTerminQuelle: quelleRaw || 'manuell',
    calendarTerminNotiz: row.notiz != null ? String(row.notiz) : '',
    calendarTerminGanztag: row.ganztag === true,
    calendarTerminStandalone: !auftragUuid && !(row.fusa_auftrag_id != null && String(row.fusa_auftrag_id).trim() !== ''),
  };
}

/**
 * Servergeführter allgemeiner Kalendertermin. Alle Schreiboperationen benutzen dieselbe
 * Stammdaten-Route wie der Kalender-Feed; localStorage ist keine Fachdatenquelle.
 *
 * @param {{ titel: string, start: string, ende: string, notiz?: string }} payload
 */
export async function createCockpitGeneralCalendarTermin(payload) {
  const data = await apiFetch(API_ROUTES.stammdaten.kalender, {
    method: 'POST',
    body: {
      titel: String(payload.titel || '').trim(),
      start: String(payload.start || '').trim(),
      ende: String(payload.ende || '').trim(),
      notiz: payload.notiz != null && String(payload.notiz).trim() !== '' ? String(payload.notiz).trim() : null,
      ganztag: false,
      typ: 'allgemein',
      quelle: 'manuell',
      mitarbeiter_ids: [],
    },
  });
  return data && typeof data === 'object' ? data.termin ?? null : null;
}

/**
 * @param {{ id: string, titel: string, start: string, ende: string, notiz?: string }} payload
 */
export async function updateCockpitGeneralCalendarTermin(payload) {
  const id = String(payload.id || '').trim();
  if (!id) throw new Error('Termin-ID fehlt.');
  const data = await apiFetch(`${API_ROUTES.stammdaten.kalender}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: {
      titel: String(payload.titel || '').trim(),
      start: String(payload.start || '').trim(),
      ende: String(payload.ende || '').trim(),
      notiz: payload.notiz != null && String(payload.notiz).trim() !== '' ? String(payload.notiz).trim() : null,
      ganztag: false,
      typ: 'allgemein',
      quelle: 'manuell',
      mitarbeiter_ids: [],
    },
  });
  return data && typeof data === 'object' ? data.termin ?? null : null;
}

/** @param {string} id */
export async function deleteCockpitGeneralCalendarTermin(id) {
  const terminId = String(id || '').trim();
  if (!terminId) throw new Error('Termin-ID fehlt.');
  await apiFetch(`${API_ROUTES.stammdaten.kalender}/${encodeURIComponent(terminId)}`, {
    method: 'DELETE',
  });
  return true;
}

export async function getCalendarFeedFromApi(requestedProjectId) {
  try {
    const rows = await fetchAllStammdatenKalenderRows();
    const auftraege = rows
      .map(r => kalenderApiRowToCalendarAuftragLike(/** @type {object} */ (r), AUFTRAEGE_KALENDER_PROJECT_ID))
      .filter(Boolean);

    try {
      const debug =
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ccintern_kalender_api_debug') === '1') ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('ccwDebugKalender') === '1');
      if (debug && typeof console !== 'undefined' && console.info) {
        console.info('[KALENDER FEED stammdaten/kalender]', { rowCount: rows.length, auftragLikeCount: auftraege.length });
      }
    } catch {
      /* ignore */
    }

    const projectsClean = [
      {
        id: AUFTRAEGE_KALENDER_PROJECT_ID,
        name: 'Kalender',
        created_at: null,
        deadline: null,
      },
    ];
    const effectiveProjectId =
      requestedProjectId === CCW_APP_SHELL_PLACEHOLDER_PROJECT
        ? AUFTRAEGE_KALENDER_PROJECT_ID
        : requestedProjectId || AUFTRAEGE_KALENDER_PROJECT_ID;

    return {
      projects: projectsClean,
      auftraege,
      effectiveProjectId,
    };
  } catch {
    return null;
  }
}

/**
 * Persistiert eine Terminverschiebung (best-effort).
 * Wenn das Backend den Endpunkt noch nicht unterstützt: `false`, ohne Fehler zu werfen.
 *
 * @param {{ eventId: string, auftragId?: string|null, start: string, ende: string, ccInternTerminSparte?: 'montage'|'lieferung'|null }} payload
 * @returns {Promise<boolean>} `true` wenn HTTP-PATCH als erfolgreich gewertet wurde
 */
export async function patchCockpitKalenderEventTimeInBackend(payload) {
  const auftragId = payload.auftragId != null && String(payload.auftragId).trim() !== '' ? String(payload.auftragId).trim() : '';
  if (!auftragId) return false;
  try {
    const startIso = payload.start != null ? String(payload.start).trim() : '';
    const ccSparte =
      /** @type {any} */ (payload).ccInternTerminSparte === 'montage' ||
      /** @type {any} */ (payload).ccInternTerminSparte === 'lieferung'
        ? /** @type {'montage'|'lieferung'} */ (/** @type {any} */ (payload).ccInternTerminSparte)
        : null;
    if (ccSparte) {
      const cur = await apiFetch(`/api/v1/ccintern/auftraege/${encodeURIComponent(auftragId)}`);
      const d =
        cur &&
        typeof cur === 'object' &&
        /** @type {any} */ ((cur).ok === true || (cur).success === true) &&
        /** @type {any} */ (cur).data
          ? /** @type {Record<string, unknown>} */ (/** @type {any} */ (cur).data)
          : null;
      if (!d || d.kunde == null || String(d.kunde).trim() === '') return false;
      const qRaw = d.quelle != null ? String(d.quelle).trim() : '';
      const quelle = qRaw === 'fusa' || qRaw === 'manuell' ? qRaw : 'manuell';
      /** @type {Record<string, unknown>} */
      const body = {
        kunde: String(d.kunde).trim(),
        status: d.status ?? null,
        schritt: d.schritt ?? null,
        prioritaet: d.prioritaet ?? null,
        bemerkung: d.bemerkung ?? null,
        quelle,
        fusa_auftrag_id: d.fusa_auftrag_id ?? null,
        lieferdatum: d.lieferdatum ?? null,
        montage_datum: d.montage_datum ?? null,
      };
      if (ccSparte === 'montage') {
        body.montage_datum = startIso || null;
      } else {
        body.lieferdatum = startIso || null;
      }
      await apiFetch(`/api/v1/ccintern/auftraege/${encodeURIComponent(auftragId)}`, {
        method: 'PUT',
        body,
      });
      return true;
    }

    const ymd = startIso.length >= 10 ? startIso.slice(0, 10) : '';
    let body = {
      termin: payload.start,
      termin_ende: payload.ende,
    };
    try {
      const cur = await apiFetch(`/auftraege/${encodeURIComponent(auftragId)}`);
      const row = cur && typeof cur === 'object' && /** @type {any} */ (cur).auftrag ? /** @type {any} */ (cur).auftrag : null;
      if (row && isFusaAuftragKalenderKandidat(/** @type {Record<string, unknown>} */ (row))) {
        /** Kalender-Verschiebung = neuer Wunsch-/Verschoben-Termin in fusa_extra_json, nicht Werbelaufzeit. */
        /** Kalender bleibt sichtbar: `verschoben` + neues `beklebung_termin` (kein Ausblenden). */
        body = {
          fusa_extra_json: {
            beklebungstermin_status: 'verschoben',
            ...(ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? { beklebung_termin: ymd } : {}),
          },
        };
      }
    } catch {
      /* ohne Detail-PATCH mit klassischem termin weiterversuchen */
    }
    await apiFetch(`/auftraege/${encodeURIComponent(auftragId)}`, {
      method: 'PATCH',
      body,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown>} row
 */
function isFusaAuftragKalenderKandidat(row) {
  const ex = row.fusa_extra_json;
  if (ex == null || String(ex).trim() === '') return false;
  try {
    const o = JSON.parse(String(ex));
    return o && typeof o === 'object' && !Array.isArray(o);
  } catch {
    return false;
  }
}

/**
 * Projekt-Liefertermin/Deadline (Kalender-Kern `…::deadline`) — ISO-String oder null zum Leeren.
 *
 * @param {{ projectId: string; deadline: string | null }} payload
 * @returns {Promise<boolean>}
 */
export async function patchCockpitKalenderProjectDeadlineInBackend(payload) {
  const projectId =
    payload.projectId != null && String(payload.projectId).trim() !== '' ? String(payload.projectId).trim() : '';
  if (!projectId) return false;
  try {
    await apiFetch(`/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      body: { deadline: payload.deadline },
    });
    return true;
  } catch {
    return false;
  }
}
