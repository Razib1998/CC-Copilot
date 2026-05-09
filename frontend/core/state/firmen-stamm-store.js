/**
 * Zentrale Firmen-Liste: GET /api/v1/firmen einmal in CCState, keine parallelen Ladepfade pro View.
 */
import { apiFetch, formatApiErrorForUi } from '../auth/cc-auth-session.js';
import { API_ROUTES } from '../api/api-routes.js';
import CCState from './state.js';
import {
  buildNormalizedFirmenFromApi,
  buildFirmaDetailByListIdMap,
} from '../../modules/shared/ui/firmen-stamm-list.js';

/** @type {Promise<void>|null} */
let inflightLoad = null;

/**
 * @returns {{ rows: object[], error: string|null, version: number, loadState: 'idle'|'loading'|'ok'|'error' }}
 */
export function getFirmenStammStateSlice() {
  return CCState.get('firmenStamm');
}

/** @returns {object[]} Rohe API-Zeilen (Elemente von `data.firmen`). */
export function getFirmenStammRows() {
  const s = CCState.get('firmenStamm');
  return Array.isArray(s.rows) ? s.rows : [];
}

/** Normalisierte Liste (UI-Liste); abgeleitet aus zentral gespeicherten rows. */
export function getFirmenStammNormalizedList() {
  return buildNormalizedFirmenFromApi(getFirmenStammRows()).list;
}

/**
 * Detailzeile für Stammmaske aus Store (kein Modul-Map als Wahrheit).
 * @param {string} listId data-firma-id / Listen-ID
 * @returns {object|null}
 */
export function getFirmaDetailByListIdFromStammStore(listId) {
  const id = listId != null ? String(listId).trim() : '';
  if (!id) return null;
  const map = buildFirmaDetailByListIdMap(getFirmenStammNormalizedList());
  const raw = map.get(id);
  return raw && typeof raw === 'object' ? raw : null;
}

/**
 * Lädt GET /api/v1/firmen in den zentralen State (ein Inflight für parallele Aufrufe).
 * @param {{ force?: boolean }} [opts] force=true immer neu abrufen
 * @returns {Promise<ReturnType<typeof getFirmenStammStateSlice>>}
 */
export async function ensureFirmenStammLoaded(opts = {}) {
  const force = opts.force === true;
  let cur = CCState.get('firmenStamm');
  if (!force && cur.loadState === 'ok') return cur;
  if (inflightLoad) {
    await inflightLoad;
    return CCState.get('firmenStamm');
  }
  inflightLoad = (async () => {
    cur = CCState.get('firmenStamm');
    CCState.set('firmenStamm', {
      ...cur,
      loadState: 'loading',
    });
    try {
      const fr = await apiFetch(API_ROUTES.cockpit.firmen);
      const rows = Array.isArray(fr?.firmen) ? fr.firmen : [];
      cur = CCState.get('firmenStamm');
      CCState.set('firmenStamm', {
        rows,
        error: null,
        version: (Number(cur.version) || 0) + 1,
        loadState: 'ok',
      });
    } catch (e) {
      cur = CCState.get('firmenStamm');
      CCState.set('firmenStamm', {
        rows: Array.isArray(cur.rows) ? cur.rows : [],
        error: formatApiErrorForUi(e),
        version: (Number(cur.version) || 0) + 1,
        loadState: 'error',
      });
    }
  })();
  try {
    await inflightLoad;
  } finally {
    inflightLoad = null;
  }
  return CCState.get('firmenStamm');
}

/** Erzwingt neuen GET und aktualisiert den Store (z. B. nach POST/PATCH). */
export async function refreshFirmenStammFromApi() {
  return ensureFirmenStammLoaded({ force: true });
}
