/**
 * Cockpit — Kalender: reine Anzeige, alle Projekte, Filter nur clientseitig auf geladener Liste.
 * Datenquelle: API (`getCalendarFeedFromApi`) → Unified-Map (MASTER §26).
 * Äußerer Rahmen wie andere Cockpit-Snapshot-Views (`section` + `h2` 15px).
 *
 * CC-Plattform (Kalender_Regeln_CC_Plattform): `core/calendar/ccw-calendar-plattform-regeln.js`
 * — keine eigene Wahrheit, kein Writeback, UI-Filter kein Ersatz für serverseitige Rechte
 * (`_user` / API später Regel 4). Darstellung: immer Wochenraster (keine Listen-Hauptansicht).
 */

import { buildValidatedCalendarEventsFromStateSnapshot } from '../../../../core/calendar/ccw-calendar-unified-map.js';
import { cockpitKalenderRasterListenTitel } from '../../../../core/calendar/ccw-calendar-event-mapper.js';
import {
  createDefaultKalenderFilterState,
  filterCalendarEvents,
  applyViewModeToFilterState,
  shiftAnchorDate,
  isTodayInsideCurrentRange,
  berlinTodayYmd,
  KALENDER_KATEGORIE_IDS,
  KALENDER_KATEGORIE_TYPEN,
  formatKalenderKwToolbarParts,
  allKalenderKategorienAktiv,
} from '../../../../core/calendar/ccw-calendar-event-filter.js';
import {
  CCW_APP_SHELL_PLACEHOLDER_PROJECT,
  getCalendarFeedFromApi,
  patchCockpitKalenderEventTimeInBackend,
  patchCockpitKalenderProjectDeadlineInBackend,
} from '../../../../core/data/dev-calendar-read-model.js';
import {
  cockpitKalenderWeekDragPersistPlan,
  cockpitKalenderWeekEventIsTimedDraggable,
} from '../../../../core/calendar/ccw-kalender-week-drag-persist.js';
import {
  openCalendarEventDetail,
  openCalendarDayListModal,
  registerCockpitLocalGeneralTerminEditHandlers,
} from '../../../../core/calendar/ccw-calendar-event-detail.js';
import { attachCockpitKalenderWeekDragHandlersImpl } from './cockpit-kalender-week-drag.js';
import { detectKalenderKonflikte } from '../../../../core/calendar/ccw-calendar-event-konflikt.js';

/** @typedef {import('../../../../core/calendar/ccw-calendar-event-foundation.js').CalendarEvent} CalendarEvent */
/** @typedef {import('../../../../core/calendar/ccw-calendar-event-filter.js').KalenderFilterState} KalenderFilterState */

/** Letzter Feed für Projektlabels */
let kalenderProjectsCache = /** @type {object[] | null} */ (null);

/**
 * Fusion aus API-Feed + Client-Zeit-Overrides (keine lokalen allgemeinen Termine im Raster).
 * Invalidierung bei Feed-/Lokal-/Override-Änderung — nicht bei reinem Wochenwechsel.
 *
 * @type {{
 *   projects: object[];
 *   auftraege: object[];
 *   generalFp: string;
 *   overridesFp: string;
 *   allValidated: CalendarEvent[];
 * } | null}
 */
let kalenderFusionCache = null;

/** Letzter Rohstring (localStorage) für allgemeine Termine — vermeidet JSON.parse bei jedem Render. */
let kalenderLastLocalGeneralRaw = /** @type {string|null} */ (null);

/** Filter-State (Modul-Scope, kein globaler Store). Standard: alle fünf Kategorien aktiv. */
let kalenderFilterState = createDefaultKalenderFilterState();
kalenderFilterState.kategorien = allKalenderKategorienAktiv();

/** Zuordnung Tabellenzeile → Event (nur aktuell gerenderte Zeilen; kein „offenes Event“-State). */
let kalenderRowEventsById = new Map();

/** Monatsansicht: YMD → Termine des Tages (für „+N“-Modal). */
let kalenderMonthDayPeek = new Map();

/** Clientseitige Zeitkorrekturen nach Drag & Drop (eventId → ISO start/ende), bis API/Reload. */
let kalenderClientTimeOverrides = new Map();

/** @type {AbortController|null} */
let kalenderRowDetailListenersAbort = null;

/** @type {AbortController|null} */
let kalenderWeekDragListenersAbort = null;

/** @type {AbortController|null} */
let kalenderGeneralSlotListenersAbort = null;

/** Lokale allgemeine Cockpit-Termine (localStorage; kein Backend). */
const COCKPIT_LOCAL_GENERAL_STORAGE_KEY = 'ccw-cockpit-general-termine-v1';

/**
 * @param {string} action create | update | delete | drag
 * @param {'ok'|'fail'} status
 * @param {Record<string, unknown>} [extra]
 */
function cockpitKalenderGeneralDebug(action, status, extra) {
  if (typeof localStorage === 'undefined' || localStorage.getItem('ccwDebugKalender') !== '1') return;
  if (typeof console === 'undefined' || !console.debug) return;
  console.debug('[ccw-kal][general]', { action, status, ...(extra && typeof extra === 'object' ? extra : {}) });
}

function migrateCockpitLocalGeneralTermineFromSessionStorageOnce() {
  if (typeof sessionStorage === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const legacy = sessionStorage.getItem(COCKPIT_LOCAL_GENERAL_STORAGE_KEY);
    if (!legacy || !String(legacy).trim()) return;
    const cur = localStorage.getItem(COCKPIT_LOCAL_GENERAL_STORAGE_KEY);
    if (!cur || !String(cur).trim()) {
      localStorage.setItem(COCKPIT_LOCAL_GENERAL_STORAGE_KEY, legacy);
    }
    sessionStorage.removeItem(COCKPIT_LOCAL_GENERAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @typedef {object} CockpitLocalGeneralTermin
 * @property {string} id
 * @property {'general'} type
 * @property {'cockpit'} sourceType
 * @property {string} titel — alternativ gespeichertes Feld `title` wird beim Laden übernommen
 * @property {string} startIso — alternativ numerische `start` (ms) wird in ISO umgewandelt
 * @property {string} endeIso — alternativ numerische `end` (ms) wird in ISO umgewandelt
 * @property {string} [notiz]
 */

/** @type {CockpitLocalGeneralTermin[]} */
let cockpitLocalGeneralTermine = [];

/** Letzter API-Feed (z. B. für Drag/PATCH-Vergleiche; Kalender-Render lädt immer neu vom Server). */
let cockpitKalenderFeedSnapshot = /** @type {{ projects: object[]; auftraege: object[] } | null} */ (null);

function loadCockpitLocalGeneralTermineFromBrowser() {
  if (typeof localStorage === 'undefined') return;
  migrateCockpitLocalGeneralTermineFromSessionStorageOnce();
  const raw = localStorage.getItem(COCKPIT_LOCAL_GENERAL_STORAGE_KEY) ?? '';
  if (raw === kalenderLastLocalGeneralRaw) return;
  try {
    if (!raw.trim()) {
      cockpitLocalGeneralTermine = [];
    } else {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        cockpitLocalGeneralTermine = [];
      } else {
        /** @type {CockpitLocalGeneralTermin[]} */
        const next = [];
        for (const row of parsed) {
          if (!row || typeof row !== 'object') continue;
          const id = row.id != null ? String(row.id).trim() : '';
          const titel =
            row.titel != null && String(row.titel).trim() !== ''
              ? String(row.titel).trim()
              : row.title != null && String(row.title).trim() !== ''
                ? String(row.title).trim()
                : '';
          let startIso = row.startIso != null ? String(row.startIso).trim() : '';
          let endeIso = row.endeIso != null ? String(row.endeIso).trim() : '';
          if (!startIso && typeof row.start === 'number' && Number.isFinite(row.start)) {
            startIso = new Date(row.start).toISOString();
          }
          if (!endeIso && typeof row.end === 'number' && Number.isFinite(row.end)) {
            endeIso = new Date(row.end).toISOString();
          }
          if (!id || !titel || !startIso || !endeIso) continue;
          const ds = new Date(startIso).getTime();
          const de = new Date(endeIso).getTime();
          if (Number.isNaN(ds) || Number.isNaN(de) || de <= ds) continue;
          const notiz = row.notiz != null ? String(row.notiz) : '';
          next.push({
            id,
            type: 'general',
            sourceType: 'cockpit',
            titel,
            startIso,
            endeIso,
            ...(notiz.trim() !== '' ? { notiz: notiz.trim() } : {}),
          });
        }
        cockpitLocalGeneralTermine = next;
      }
    }
  } catch {
    cockpitLocalGeneralTermine = [];
  } finally {
    kalenderLastLocalGeneralRaw = raw;
  }
}

/**
 * @returns {boolean}
 */
function persistCockpitLocalGeneralTermineToBrowser() {
  if (typeof localStorage === 'undefined') return false;
  try {
    const payload = JSON.stringify(cockpitLocalGeneralTermine);
    localStorage.setItem(COCKPIT_LOCAL_GENERAL_STORAGE_KEY, payload);
    kalenderLastLocalGeneralRaw = payload;
    return true;
  } catch {
    return false;
  }
}

/**
 * Persistenz asynchron (blockiert Speichern-Klick / Paint nicht).
 * @param {() => void} [onFailure] z. B. Rollback + erneuter Render
 * @param {() => void} [onSuccess] z. B. Debug „ok“ erst nach erfolgreichem localStorage
 */
function persistCockpitLocalGeneralTermineToBrowserAsync(onFailure, onSuccess) {
  const run = () => {
    if (persistCockpitLocalGeneralTermineToBrowser()) {
      if (typeof onSuccess === 'function') onSuccess();
      return;
    }
    if (typeof onFailure === 'function') onFailure();
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(run);
  else setTimeout(run, 0);
}

/**
 * @param {CockpitLocalGeneralTermin} t
 * @returns {object}
 */
function buildRawCalendarEventFromLocalGeneral(t) {
  return {
    eventId: `ccw-cockpit-general-${t.id}`,
    quelleSystem: 'cc_intern',
    transportQuelle: 'snapshot',
    projektId: null,
    auftragId: null,
    kundeId: null,
    titel: t.titel,
    typ: 'intern',
    status: 'geplant',
    start: t.startIso,
    ende: t.endeIso,
    ganztag: false,
    mitarbeiterIds: [],
    verantwortlichId: null,
    objektTyp: null,
    objektId: null,
    fahrzeugId: null,
    standort: null,
    readOnly: true,
  };
}

/**
 * @param {string} eventId
 * @returns {boolean}
 */
function isCockpitLocalGeneralEventId(eventId) {
  return String(eventId || '').startsWith('ccw-cockpit-general-');
}

/**
 * @param {string} eventId
 * @returns {string|null}
 */
function cockpitGeneralLocalIdFromEventId(eventId) {
  const s = String(eventId || '');
  if (!s.startsWith('ccw-cockpit-general-')) return null;
  return s.slice('ccw-cockpit-general-'.length) || null;
}

function newCockpitGeneralTerminId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `g-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * @param {string} ymd
 * @param {number} clientY
 * @param {HTMLElement} scrollEl
 * @returns {{ startMs: number, endMs: number } | null}
 */
function pickWeekSlotStartEndFromPointer(ymd, clientY, scrollEl) {
  const col = scrollEl.querySelector(`.ccw-cockpit-kal20-day-col[data-ccw-kal-ymd="${ymd}"]`);
  if (!(col instanceof HTMLElement)) return null;
  const bodyEl = col.querySelector('.ccw-cockpit-kal20-day-body');
  if (!(bodyEl instanceof HTMLElement)) return null;

  const rowH = KAL20_ROW_HEIGHT_PX;
  const rowCount = KAL20_END_HOUR_EXCLUSIVE - KAL20_START_HOUR;
  const bodyH = parseFloat(bodyEl.style.height || '') || rowCount * rowH;
  const br = bodyEl.getBoundingClientRect();
  const px = Math.max(0, Math.min(bodyH, ((clientY - br.top) / Math.max(1, br.height)) * bodyH));

  const pxPerMin = rowH / 60;
  const minutesFromGridTop = px / pxPerMin;
  const minFromMidnight = KAL20_START_HOUR * 60 + minutesFromGridTop;
  const snapMid = Math.round(minFromMidnight / 30) * 30;

  let startMs = gridBerlinMidnightMs(ymd) + snapMid * 60000;
  let endMs = startMs + 30 * 60000;

  const gridStartMs = gridBerlinWallHourMs(ymd, KAL20_START_HOUR);
  const gridEndMs = gridBerlinWallHourMs(ymd, KAL20_END_HOUR_EXCLUSIVE);
  if (startMs < gridStartMs) startMs = gridStartMs;
  if (endMs > gridEndMs) endMs = gridEndMs;
  if (endMs <= startMs) return null;

  return { startMs, endMs };
}

/**
 * @param {number} ms
 * @returns {string} datetime-local (nahe liegende Darstellung aus Europe/Berlin-Wandzeit)
 */
function formatDatetimeLocalFromBerlinWallMs(ms) {
  const parts = GRID_BERLIN_DATETIME_LOCAL_FMT.formatToParts(new Date(ms));
  const y = parts.find(p => p.type === 'year')?.value ?? '1970';
  const mo = parts.find(p => p.type === 'month')?.value ?? '01';
  const da = parts.find(p => p.type === 'day')?.value ?? '01';
  const h = parts.find(p => p.type === 'hour')?.value ?? '00';
  const mi = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${y}-${mo}-${da}T${h}:${mi}`;
}

function renderGeneralTerminDockHtml() {
  return `<div class="ccw-cockpit-kal-general-dock" data-ccw-kal-general-dock hidden>
  <div class="ccw-cockpit-kal-general-dock__panel" role="dialog" aria-modal="true" aria-labelledby="ccw-kal-gen-title" data-ccw-kal-general-panel>
    <h4 id="ccw-kal-gen-title" class="ccw-cockpit-kal-general-dock__title">Allgemeiner Termin</h4>
    <p class="ccw-cockpit-kal-general-dock__hint">Lokal im Browser (localStorage), ohne Backend. Typ: allgemein.</p>
    <form class="ccw-cockpit-kal-general-form" data-ccw-kal-general-form>
      <div class="ccw-cockpit-kal-general-form__row">
        <label for="ccw-kal-gen-titel">Titel</label>
        <input id="ccw-kal-gen-titel" name="titel" type="text" required autocomplete="off" />
      </div>
      <div class="ccw-cockpit-kal-general-form__row">
        <label for="ccw-kal-gen-start">Start</label>
        <input id="ccw-kal-gen-start" name="start" type="datetime-local" required />
      </div>
      <div class="ccw-cockpit-kal-general-form__row">
        <label for="ccw-kal-gen-ende">Ende</label>
        <input id="ccw-kal-gen-ende" name="ende" type="datetime-local" required />
      </div>
      <div class="ccw-cockpit-kal-general-form__row">
        <label for="ccw-kal-gen-notiz">Notiz (optional)</label>
        <textarea id="ccw-kal-gen-notiz" name="notiz" rows="2" autocomplete="off"></textarea>
      </div>
      <div class="ccw-cockpit-kal-general-form__actions">
        <button type="submit" class="ccw-cockpit-kal-general-form__submit">Speichern</button>
        <button type="button" class="ccw-cockpit-kal-general-form__cancel" data-ccw-kal-general-cancel>Abbrechen</button>
      </div>
    </form>
  </div>
</div>`;
}

export function ccwInvalidateKalenderEventCache() {
  lastKalenderRenderPerf = null;
  kalenderFusionCache = null;
  kalenderLastLocalGeneralRaw = null;
  kalenderProjectsCache = null;
  cockpitKalenderFeedSnapshot = null;
  kalenderFilterState = createDefaultKalenderFilterState();
  kalenderFilterState.kategorien = allKalenderKategorienAktiv();
  kalenderRowEventsById = new Map();
  kalenderClientTimeOverrides = new Map();
}

/** @deprecated Nutzung über DOM-Sync; nur für Kompatibilität. */
export function ccwSetCockpitKalenderProjectFilterId(id) {
  kalenderFilterState.projektId =
    id == null || id === '' || id === '__all__' ? null : String(id);
}

/**
 * @param {ParentNode} container
 * @returns {string[]}
 */
function readKalenderChipValuesFromContainer(container) {
  return [...container.querySelectorAll('[data-ccw-kal-chip][aria-checked="true"]')]
    .map(c => (c instanceof HTMLElement ? c.getAttribute('data-ccw-kal-chip-value') : null))
    .filter(v => v != null && v !== '');
}

/** Liest Kategorie-Chips unter `[data-ccw-kal-filter-bar]` (optional, falls DOM und State divergieren). */
export function ccwSyncKalenderFiltersFromDom(root) {
  if (!root || typeof root.querySelector !== 'function') return;
  const bar = root.querySelector('[data-ccw-kal-filter-bar]');
  if (!bar) return;
  const host = bar.querySelector('[data-ccw-kal-filter-chips="kategorie"]');
  if (!host) return;
  const vals = readKalenderChipValuesFromContainer(host);
  if (vals.includes('alle')) {
    kalenderFilterState.kategorien = allKalenderKategorienAktiv();
  } else {
    kalenderFilterState.kategorien = vals.filter(v => KALENDER_KATEGORIE_IDS.includes(/** @type {any} */ (v)));
  }
}

/**
 * @param {string} value `alle` oder Kategorie-ID
 */
export function ccwKalenderToggleKategorieChip(value) {
  const v = String(value);
  const fs = kalenderFilterState;
  if (!Array.isArray(fs.kategorien)) fs.kategorien = allKalenderKategorienAktiv();
  const allIds = allKalenderKategorienAktiv();
  if (v === 'alle') {
    const allOn = allIds.every(id => fs.kategorien.includes(id));
    fs.kategorien = allOn ? [] : allKalenderKategorienAktiv();
    return;
  }
  if (!KALENDER_KATEGORIE_IDS.includes(/** @type {any} */ (v))) return;
  const i = fs.kategorien.indexOf(v);
  if (i >= 0) fs.kategorien.splice(i, 1);
  else fs.kategorien.push(v);
}

/** Setzt `filterState` auf Standardwerte inkl. `search` (ohne Snapshot neu zu laden). */
export function ccwResetKalenderFiltersToDefaults() {
  kalenderFilterState = createDefaultKalenderFilterState();
  kalenderFilterState.kategorien = allKalenderKategorienAktiv();
}

/**
 * Nur noch Kalenderwoche; Parameter bleibt aus Kompatibilität.
 * @param {'day'|'week'|'month'} [_mode]
 */
export function ccwSetKalenderViewMode(mode) {
  const m = mode === 'month' ? 'month' : 'week';
  applyViewModeToFilterState(kalenderFilterState, m, kalenderFilterState.anchorDate);
}

/**
 * Zeitraum-Navigation: eine KW zurück / heute / eine KW vor.
 * @param {-1|0|1} direction
 */
export function ccwKalenderNavigate(direction) {
  const mode = kalenderFilterState.viewMode === 'month' ? 'month' : 'week';
  const next = shiftAnchorDate(kalenderFilterState.anchorDate, mode, direction);
  applyViewModeToFilterState(kalenderFilterState, mode, next);
}

/** `anchorDate` → Mo–So (Europe/Berlin). */
function syncKalenderZeitraumFromAnchorAndViewMode() {
  if (!Array.isArray(kalenderFilterState.kategorien)) {
    kalenderFilterState.kategorien = allKalenderKategorienAktiv();
  }
  const mode = kalenderFilterState.viewMode === 'month' ? 'month' : 'week';
  applyViewModeToFilterState(kalenderFilterState, mode, kalenderFilterState.anchorDate);
}

/**
 * Event-Delegation für Zeilen mit `data-event-id` unter `[data-ccw-ro="cockpit-kalender"]`.
 * @param {ParentNode|null|undefined} root
 */
export function attachCockpitKalenderRowDetailHandlers(root) {
  if (typeof document === 'undefined' || !root || typeof root.addEventListener !== 'function') return;
  if (kalenderRowDetailListenersAbort) kalenderRowDetailListenersAbort.abort();
  kalenderRowDetailListenersAbort = new AbortController();
  const sig = kalenderRowDetailListenersAbort.signal;

  registerCockpitLocalGeneralTerminEditHandlers({
    onSave: ({ eventId, titel, startIso, endeIso, notiz }) => {
      const lid = cockpitGeneralLocalIdFromEventId(eventId);
      if (!lid) return;
      const idx = cockpitLocalGeneralTermine.findIndex(t => t.id === lid);
      if (idx < 0) return;
      const prev = { ...cockpitLocalGeneralTermine[idx] };
      const next = { ...prev, titel, startIso, endeIso };
      if (notiz.trim() !== '') next.notiz = notiz.trim();
      else delete next.notiz;
      cockpitLocalGeneralTermine[idx] = next;
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('ccw-kalender-rerender-request', { bubbles: true }));
      }
      persistCockpitLocalGeneralTermineToBrowserAsync(
        () => {
        cockpitKalenderGeneralDebug('update', 'fail', { id: lid });
        cockpitLocalGeneralTermine[idx] = prev;
        if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
          globalThis.alert('Speichern fehlgeschlagen (Browser-Speicher voll oder blockiert?).');
        }
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('ccw-kalender-rerender-request', { bubbles: true }));
        }
        },
        () => cockpitKalenderGeneralDebug('update', 'ok', { id: lid }),
      );
    },
    onDelete: eventId => {
      const lid = cockpitGeneralLocalIdFromEventId(eventId);
      if (!lid) return;
      const idx = cockpitLocalGeneralTermine.findIndex(t => t.id === lid);
      if (idx < 0) return;
      const removed = cockpitLocalGeneralTermine[idx];
      cockpitLocalGeneralTermine.splice(idx, 1);
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('ccw-kalender-rerender-request', { bubbles: true }));
      }
      persistCockpitLocalGeneralTermineToBrowserAsync(
        () => {
        cockpitKalenderGeneralDebug('delete', 'fail', { id: lid });
        cockpitLocalGeneralTermine.splice(idx, 0, removed);
        if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
          globalThis.alert('Löschen konnte nicht gespeichert werden (Browser-Speicher). Bitte Seite neu laden.');
        }
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('ccw-kalender-rerender-request', { bubbles: true }));
        }
        },
        () => cockpitKalenderGeneralDebug('delete', 'ok', { id: lid }),
      );
    },
  });

  if (typeof sig.addEventListener === 'function') {
    sig.addEventListener('abort', () => registerCockpitLocalGeneralTerminEditHandlers(null), { once: true });
  }

  function openKalenderEventByIdFromDom(id) {
    const cal = kalenderRowEventsById.get(id);
    if (!cal) return;
    if (isCockpitLocalGeneralEventId(id)) {
      const lid = cockpitGeneralLocalIdFromEventId(id);
      const loc = lid ? cockpitLocalGeneralTermine.find(t => t.id === lid) : null;
      /** @type {Record<string, unknown>} */
      const payload = { ...cal };
      payload.cockpitLokalTypLabel = 'Allgemeiner Termin (lokal)';
      if (loc && loc.notiz && String(loc.notiz).trim() !== '') {
        payload.cockpitLokalNotiz = String(loc.notiz).trim();
      }
      openCalendarEventDetail(/** @type {CalendarEvent} */ (payload));
      return;
    }
    openCalendarEventDetail(cal);
  }

  root.addEventListener(
    'click',
    ev => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (!t.closest('[data-ccw-ro="cockpit-kalender"]')) return;
      const moreEl = typeof t.closest === 'function' ? t.closest('[data-ccw-kal-day-more]') : null;
      if (moreEl instanceof HTMLElement) {
        ev.preventDefault();
        const ymd = moreEl.getAttribute('data-ccw-kal-day-more');
        const list = ymd ? kalenderMonthDayPeek.get(ymd) : null;
        if (ymd && Array.isArray(list) && list.length) openCalendarDayListModal(ymd, list);
        return;
      }
      const block = t.closest('.ccw-cockpit-kal20-evt[data-event-id]');
      if (block) {
        const id = block.getAttribute('data-event-id');
        if (!id) return;
        openKalenderEventByIdFromDom(id);
        return;
      }
      const tr = t.closest('tr[data-event-id]');
      if (!tr || !(tr instanceof HTMLTableRowElement)) return;
      const id = tr.getAttribute('data-event-id');
      if (!id) return;
      openKalenderEventByIdFromDom(id);
    },
    { signal: sig },
  );

  root.addEventListener(
    'keydown',
    ev => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (!t.closest('[data-ccw-ro="cockpit-kalender"]')) return;
      const block = t.closest('.ccw-cockpit-kal20-evt[data-event-id]');
      if (block) {
        ev.preventDefault();
        const id = block.getAttribute('data-event-id');
        if (!id) return;
        openKalenderEventByIdFromDom(id);
        return;
      }
      if (!(t instanceof HTMLTableRowElement)) return;
      if (!t.hasAttribute('data-event-id')) return;
      ev.preventDefault();
      const id = t.getAttribute('data-event-id');
      if (!id) return;
      openKalenderEventByIdFromDom(id);
    },
    { signal: sig },
  );
}

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCockpitKalenderGeneralFingerprint() {
  return cockpitLocalGeneralTermine
    .map(t => `${t.id}\t${t.startIso}\t${t.endeIso}\t${String(t.titel || '')}`)
    .join('\n');
}

function buildCockpitKalenderOverridesFingerprint() {
  if (kalenderClientTimeOverrides.size === 0) return '';
  return [...kalenderClientTimeOverrides.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([k, v]) => `${k}:${v.start}:${v.ende}`)
    .join('|');
}

const GRID_BERLIN = 'Europe/Berlin';
/** Anweisung 20: 07:00–18:00 sichtbar, 60px/Zeile, 12 Stunden. */
const KAL20_START_HOUR = 7;
const KAL20_END_HOUR_EXCLUSIVE = 19;
const KAL20_ROW_COUNT = KAL20_END_HOUR_EXCLUSIVE - KAL20_START_HOUR;
const KAL20_BLOCK_MIN_PX = 28;
const KAL20_ROW_HEIGHT_PX = 60;

/** Einmalig — vermeidet `Intl`-Konstruktor im Hot-Path pro Eventblock. */
const KAL20_BLOCK_TIME_FMT = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Modul-einmalig — Berlin-Zeitzone (kein `new Intl.DateTimeFormat` pro Aufruf in Hot-Paths). */
const GRID_BERLIN_YMD_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: GRID_BERLIN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const GRID_BERLIN_WALL_HM_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: GRID_BERLIN,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const GRID_BERLIN_DATETIME_LOCAL_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: GRID_BERLIN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const GRID_BERLIN_WEEKDAY_SHORT_GB = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  timeZone: GRID_BERLIN,
});
const GRID_BERLIN_WEEKDAY_SHORT_US = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: GRID_BERLIN,
});

/** In-Memory LRU-artig (Insert-Reihenfolge), Keys siehe Phase-1D-Doku. */
const BERLIN_TZ_CACHE_CAP = 700;

/** Key: `Date.getTime()` (ms) → `YYYY-MM-DD` Berlin */
const BERLIN_CACHE_YMD_FROM_TIME = new Map();
/** Key: `ymd` → UTC-ms „aligned“ (Mittags-Anker für `gridBerlinYmdToUtcMsAligned`) */
const BERLIN_CACHE_YMD_ALIGNED_MS = new Map();
/** Key: `ymd` → UTC-ms lokale Mitternacht Berlin */
const BERLIN_CACHE_YMD_MIDNIGHT_MS = new Map();
/** Key: Wandzeit-ms → Minuten seit Mitternacht Berlin */
const BERLIN_CACHE_MINUTES_SINCE_MIDNIGHT = new Map();

/**
 * @param {Map<any, any>} map
 * @param {any} key
 * @param {any} val
 */
function berlinTzCacheSet(map, key, val) {
  map.set(key, val);
  while (map.size > BERLIN_TZ_CACHE_CAP) {
    const first = map.keys().next().value;
    map.delete(first);
  }
}

/** Berlin-TZ-Maps bleiben bei Event-Invalidierung bestehen (technische Helper, kein Event-Cache). */

/** Nur bei `ccwDebugKalender`: kumulierte ms in `perf.phases['00_berlin_time']`. */
let kalenderBerlinTimeAccum = /** @type {((dt: number) => void) | null} */ (null);

/**
 * Letztes Debug-Profiling (nur bei `ccwDebugKalender`).
 * `domInsertMs` optional: Shell kann `kalenderRenderPerfRecordDomInsertMs(ms)` nach `innerHTML` aufrufen.
 * @type {{ t0: number, fusionCacheHit: boolean, viewMode: string, phases: Record<string, number>, domInsertMs?: number, weekDebugOverlapMs?: number, weekDebugHtmlMs?: number } | null}
 */
export let lastKalenderRenderPerf = null;

/** Nur Messung: Summen für Wochenraster (Overlap-Lanes vs. Block-HTML), siehe CURSOR_ANWEISUNG_KALENDER_PERF_DEBUG.md */
const kalenderWeekPerfAccum = { overlap: 0, html: 0 };

/**
 * Optional: von der Shell nach `innerHTML` aufrufen, damit `06_dom_insert` im Kompakt-Log gefüllt wird.
 * @param {number} ms
 */
export function kalenderRenderPerfRecordDomInsertMs(ms) {
  if (!lastKalenderRenderPerf || typeof ms !== 'number' || Number.isNaN(ms)) return;
  lastKalenderRenderPerf.domInsertMs = Math.round(ms * 100) / 100;
}

/**
 * @param {number} v
 * @returns {string}
 */
function kalenderPerfFmtMsCol(v) {
  if (v == null || Number.isNaN(v)) return '   —   ';
  const n = Math.round(Number(v) * 100) / 100;
  const s = String(n);
  const pad = Math.max(1, 6 - s.length);
  return `${' '.repeat(pad)}${s} ms`;
}

function flushKalenderWeekPerfDebugCompactLog() {
  const dbg =
    typeof localStorage !== 'undefined' && localStorage.getItem('ccwDebugKalender') === '1';
  if (!dbg || !lastKalenderRenderPerf || lastKalenderRenderPerf.viewMode !== 'week') return;
  if (typeof console === 'undefined' || !console.log) return;

  const p = lastKalenderRenderPerf.phases || {};
  const f00 = p['00_berlin_time'];
  const f01 = p['04_filter'];
  const f02 = p['05_sort'];
  const f03 = p['week_partition'];
  const f04 = lastKalenderRenderPerf.weekDebugOverlapMs;
  const f05 = lastKalenderRenderPerf.weekDebugHtmlMs;
  const f06 = lastKalenderRenderPerf.domInsertMs;
  const total = Math.round((performance.now() - lastKalenderRenderPerf.t0) * 100) / 100;
  const hit = lastKalenderRenderPerf.fusionCacheHit ? 'HIT' : 'MISS';

  console.log(
    [
      '[ccw-kal] perf ─────────────────────────────',
      `  fusionCache   : ${hit}`,
      `  viewMode      : week`,
      `  00_berlin_time:${kalenderPerfFmtMsCol(f00)}`,
      `  01_filter     :${kalenderPerfFmtMsCol(f01)}`,
      `  02_sort       :${kalenderPerfFmtMsCol(f02)}`,
      `  03_partition  :${kalenderPerfFmtMsCol(f03)}`,
      `  04_overlap    :${kalenderPerfFmtMsCol(f04)}`,
      `  05_html_build :${kalenderPerfFmtMsCol(f05)}`,
      `  06_dom_insert :${kalenderPerfFmtMsCol(f06)}`,
      '  ─────────────────────────────',
      `  GESAMT        :${kalenderPerfFmtMsCol(total)}`,
    ].join('\n'),
  );
}

function scheduleKalenderWeekPerfDebugCompactLog() {
  setTimeout(flushKalenderWeekPerfDebugCompactLog, 0);
}

/** @type {Record<string, string>} */
const KATEGORIE_LABEL = {
  montage: 'Montage',
  grafik: 'Grafik',
  buero: 'Büro',
  planung: 'Planung',
  ausliefern: 'Ausliefern',
};

/**
 * @param {string} typ
 * @returns {keyof typeof KATEGORIE_LABEL}
 */
function eventTypToKategorieId(typ) {
  const t = String(typ || '')
    .trim()
    .toLowerCase();
  for (const kid of KALENDER_KATEGORIE_IDS) {
    const arr = KALENDER_KATEGORIE_TYPEN[kid];
    if (arr.includes(t)) return kid;
  }
  return 'ausliefern';
}

/**
 * Kategorie für Raster; optional Debug: `globalThis.__CCW_LOG_KAL_KAT__ = true`
 * → console.log(event.typ, kategorie, titel).
 * @param {CalendarEvent} ev
 * @param {'grid-allday'|'grid-timed'} ctx
 */
function kategorieIdForKal20Render(ev, ctx) {
  const kid = eventTypToKategorieId(ev.typ);
  if (typeof globalThis !== 'undefined' && globalThis.__CCW_LOG_KAL_KAT__ === true) {
    console.log('[ccw-kal20-kat]', ctx, 'event.typ=', ev.typ, '→ kategorie=', kid, '|', ev.titel);
  }
  return kid;
}

/**
 * @param {Date} d
 * @returns {string}
 */
function gridBerlinYmdFromDate(d) {
  const useHook = !!kalenderBerlinTimeAccum;
  const __m0 = useHook ? performance.now() : 0;
  try {
    const t = d.getTime();
    if (Number.isNaN(t)) {
      const parts = GRID_BERLIN_YMD_FMT.formatToParts(d);
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const day = parts.find(p => p.type === 'day').value;
      return `${y}-${m}-${day}`;
    }
    const cached = BERLIN_CACHE_YMD_FROM_TIME.get(t);
    if (cached !== undefined) return cached;
    const parts = GRID_BERLIN_YMD_FMT.formatToParts(d);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const ymd = `${y}-${m}-${day}`;
    berlinTzCacheSet(BERLIN_CACHE_YMD_FROM_TIME, t, ymd);
    return ymd;
  } finally {
    if (useHook) kalenderBerlinTimeAccum(performance.now() - __m0);
  }
}

/**
 * @param {string} ymd
 * @returns {number}
 */
function gridBerlinYmdToUtcMsAligned(ymd) {
  const hit = BERLIN_CACHE_YMD_ALIGNED_MS.get(ymd);
  if (hit !== undefined) return hit;
  const [y, mo, da] = ymd.split('-').map(Number);
  let ms = Date.UTC(y, mo - 1, da, 12, 0, 0);
  for (let i = 0; i < 48; i++) {
    if (gridBerlinYmdFromDate(new Date(ms)) === ymd) {
      berlinTzCacheSet(BERLIN_CACHE_YMD_ALIGNED_MS, ymd, ms);
      return ms;
    }
    if (gridBerlinYmdFromDate(new Date(ms)) < ymd) ms += 3600000;
    else ms -= 3600000;
  }
  berlinTzCacheSet(BERLIN_CACHE_YMD_ALIGNED_MS, ymd, ms);
  return ms;
}

/**
 * @param {string} ymd
 * @param {1|-1} dir
 * @returns {string}
 */
function gridStepBerlinDay(ymd, dir) {
  let ms = gridBerlinYmdToUtcMsAligned(ymd);
  ms += dir * 3600000;
  for (let h = 0; h < 30; h++) {
    const cur = gridBerlinYmdFromDate(new Date(ms));
    if (cur !== ymd) return cur;
    ms += dir * 3600000;
  }
  return gridBerlinYmdFromDate(new Date(ms));
}

/**
 * @param {string} von
 * @param {string} bis
 * @returns {string[]}
 */
function gridEnumerateYmdRange(von, bis) {
  const out = [];
  let d = von;
  for (let guard = 0; guard < 14 && d <= bis; guard++) {
    out.push(d);
    if (d === bis) break;
    d = gridStepBerlinDay(d, 1);
  }
  return out;
}

/**
 * @param {string} ymd
 * @returns {number}
 */
function gridBerlinMidnightMs(ymd) {
  const hit = BERLIN_CACHE_YMD_MIDNIGHT_MS.get(ymd);
  if (hit !== undefined) return hit;
  let ms = gridBerlinYmdToUtcMsAligned(ymd);
  while (gridBerlinYmdFromDate(new Date(ms - 60000)) === ymd) ms -= 60000;
  berlinTzCacheSet(BERLIN_CACHE_YMD_MIDNIGHT_MS, ymd, ms);
  return ms;
}

/**
 * @param {number} ms
 * @returns {number}
 */
function gridBerlinMinutesSinceMidnight(ms) {
  const useHook = !!kalenderBerlinTimeAccum;
  const __m0 = useHook ? performance.now() : 0;
  try {
    const cached = BERLIN_CACHE_MINUTES_SINCE_MIDNIGHT.get(ms);
    if (cached !== undefined) return cached;
    const parts = GRID_BERLIN_WALL_HM_FMT.formatToParts(new Date(ms));
    const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
    const out = h * 60 + m;
    berlinTzCacheSet(BERLIN_CACHE_MINUTES_SINCE_MIDNIGHT, ms, out);
    return out;
  } finally {
    if (useHook) kalenderBerlinTimeAccum(performance.now() - __m0);
  }
}

/**
 * @param {string} ymd
 * @param {number} hour 0–23
 * @returns {number}
 */
function gridBerlinWallHourMs(ymd, hour) {
  const mid = gridBerlinMidnightMs(ymd);
  return mid + hour * 3600000;
}

/**
 * @param {CalendarEvent} ev
 * @param {string} ymd
 * @returns {{ startMs: number, endMs: number } | null}
 */
function gridTimedSegmentOnDay(ev, ymd) {
  if (ev.ganztag === true) return null;
  const evStart = new Date(ev.start).getTime();
  const evEnd = new Date(ev.ende).getTime();
  if (Number.isNaN(evStart) || Number.isNaN(evEnd)) return null;
  const dayStart = gridBerlinMidnightMs(ymd);
  const dayEnd = gridBerlinMidnightMs(gridStepBerlinDay(ymd, 1)) - 1;
  const segStart = Math.max(evStart, dayStart);
  const segEnd = Math.min(evEnd, dayEnd);
  if (segEnd < dayStart || segStart > dayEnd) return null;
  if (segEnd <= segStart) return null;
  return { startMs: segStart, endMs: segEnd };
}

/**
 * @param {number} startMs
 * @param {number} endMs
 * @param {string} ymd
 * @returns {{ topPx: number, heightPx: number, beforeGrid: boolean, afterGrid: boolean }}
 */
function gridLayoutTimedBlock(startMs, endMs, ymd) {
  const rowH = KAL20_ROW_HEIGHT_PX;
  const maxBody = KAL20_ROW_COUNT * rowH;
  const gridStart = gridBerlinWallHourMs(ymd, KAL20_START_HOUR);
  const gridEnd = gridBerlinWallHourMs(ymd, KAL20_END_HOUR_EXCLUSIVE);
  const beforeGrid = startMs < gridStart;
  const afterGrid = endMs > gridEnd;
  const pxPerMin = rowH / 60;

  if (startMs >= gridEnd) {
    return {
      topPx: Math.max(0, maxBody - KAL20_BLOCK_MIN_PX),
      heightPx: KAL20_BLOCK_MIN_PX,
      beforeGrid: false,
      afterGrid: true,
    };
  }

  const clipStart = Math.max(startMs, gridStart);
  const clipEnd = Math.min(endMs, gridEnd);
  let topPx = ((clipStart - gridStart) / 60000) * pxPerMin;
  let heightPx = ((clipEnd - clipStart) / 60000) * pxPerMin;

  if (beforeGrid) {
    topPx = 0;
    if (endMs <= gridStart) heightPx = KAL20_BLOCK_MIN_PX;
    else heightPx = Math.max(KAL20_BLOCK_MIN_PX, ((Math.min(endMs, gridEnd) - gridStart) / 60000) * pxPerMin);
  }
  if (afterGrid && clipEnd > clipStart) {
    heightPx = Math.max(KAL20_BLOCK_MIN_PX, ((clipEnd - clipStart) / 60000) * pxPerMin);
  }
  if (clipEnd <= clipStart && !beforeGrid) {
    topPx = Math.max(0, maxBody - KAL20_BLOCK_MIN_PX);
    heightPx = KAL20_BLOCK_MIN_PX;
  }

  heightPx = Math.max(KAL20_BLOCK_MIN_PX, heightPx);
  topPx = Math.min(Math.max(0, topPx), maxBody - KAL20_BLOCK_MIN_PX);
  heightPx = Math.min(heightPx, maxBody - topPx);
  return { topPx, heightPx, beforeGrid, afterGrid };
}

/**
 * @param {Array<CalendarEvent & { startMs: number, endMs: number, startMin: number, endMin: number, lane?: number, lanes?: number }>} segs
 * @returns {typeof segs}
 */
function gridAssignOverlapLanesSegs(segs) {
  const n = segs.length;
  if (n === 0) return segs;
  if (n === 1) {
    segs[0].lane = 0;
    segs[0].lanes = 1;
    return segs;
  }
  /** @type {number[]} */
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((ai, bi) => {
    const a = segs[ai];
    const b = segs[bi];
    return a.startMin - b.startMin || a.endMin - b.endMin;
  });
  /** @type {number[]} */
  const laneEnd = [];
  for (let oi = 0; oi < order.length; oi++) {
    const seg = segs[order[oi]];
    let li = 0;
    while (li < laneEnd.length && laneEnd[li] > seg.startMin) li++;
    if (li >= laneEnd.length) laneEnd.push(seg.endMin);
    else laneEnd[li] = seg.endMin;
    seg.lane = li;
  }
  const L = Math.max(1, laneEnd.length);
  for (let i = 0; i < n; i++) segs[i].lanes = L;
  return segs;
}

/**
 * @param {CalendarEvent} ev
 * @param {string} ymdVon
 * @param {string} ymdBis
 * @returns {boolean}
 */
function gridAllDayTouchesWeek(ev, ymdVon, ymdBis) {
  if (ev.ganztag !== true) return false;
  const a = gridBerlinYmdFromDate(new Date(ev.start));
  const b = gridBerlinYmdFromDate(new Date(ev.ende));
  const start = a <= b ? a : b;
  const end = a <= b ? b : a;
  return start <= ymdBis && end >= ymdVon;
}

/**
 * Zeitgebundene Segmente pro Wochentag — YMD-Schnitt, einmal `gridTimedSegmentOnDay` pro (Event, Tag).
 * Tages-Spalten/Overlap arbeiten nur auf diesen Listen (kein erneuter Segmentaufruf in der Spalte).
 *
 * @param {CalendarEvent[]} events
 * @param {string[]} days Mo…So
 * @returns {Array<Array<{ ev: CalendarEvent, startMs: number, endMs: number }>>}
 */
function gridPartitionTimedSegmentsByWeekDays(events, days) {
  /** @type {Array<Array<{ ev: CalendarEvent, startMs: number, endMs: number }>>} */
  const byDay = days.map(() => []);
  for (const ev of events) {
    if (ev.ganztag === true) continue;
    const evStart = new Date(ev.start).getTime();
    const evEnd = new Date(ev.ende).getTime();
    if (Number.isNaN(evStart) || Number.isNaN(evEnd)) continue;
    const lo = gridBerlinYmdFromDate(new Date(ev.start));
    const hi = gridBerlinYmdFromDate(new Date(ev.ende));
    const loOrd = lo <= hi ? lo : hi;
    const hiOrd = lo <= hi ? hi : lo;
    for (let di = 0; di < days.length; di++) {
      const ymd = days[di];
      if (ymd < loOrd) continue;
      if (ymd > hiOrd) break;
      const seg = gridTimedSegmentOnDay(ev, ymd);
      if (!seg) continue;
      byDay[di].push({ ev, startMs: seg.startMs, endMs: seg.endMs });
    }
  }
  return byDay;
}

/**
 * @param {string} ymd
 * @returns {string} z. B. Mo, Di (Europe/Berlin)
 */
function gridBerlinWeekdayShortMoSo(ymd) {
  const ms = gridBerlinYmdToUtcMsAligned(ymd);
  const w = GRID_BERLIN_WEEKDAY_SHORT_GB.format(new Date(ms));
  const map = { Mon: 'Mo', Tue: 'Di', Wed: 'Mi', Thu: 'Do', Fri: 'Fr', Sat: 'Sa', Sun: 'So' };
  return map[w] || w.slice(0, 2);
}

/**
 * @param {string} ymd
 * @returns {number} Mo = 1 … So = 7
 */
function gridBerlinWeekdayMon1Sun7(ymd) {
  const ms = gridBerlinYmdToUtcMsAligned(ymd);
  const w = GRID_BERLIN_WEEKDAY_SHORT_US.format(new Date(ms));
  /** @type {Record<string, number>} */
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[w] ?? 1;
}

/**
 * @param {string} ymd
 * @returns {{ first: string, last: string }}
 */
function gridMonthFirstLastYmd(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  const pad = n => String(n).padStart(2, '0');
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dims = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const dim = dims[m - 1];
  return { first: `${y}-${pad(m)}-01`, last: `${y}-${pad(m)}-${pad(dim)}` };
}

/**
 * @param {CalendarEvent} ev
 * @param {string} ymd
 */
function eventTouchesBerlinDay(ev, ymd) {
  if (!ev || ev.start == null || String(ev.start).trim() === '') return false;
  const t0 = new Date(ev.start).getTime();
  if (Number.isNaN(t0)) return false;
  const lo = gridBerlinYmdFromDate(new Date(ev.start));
  let hi = lo;
  if (ev.ende != null && String(ev.ende).trim() !== '') {
    const e = gridBerlinYmdFromDate(new Date(ev.ende));
    hi = e >= lo ? e : lo;
  }
  return ymd >= lo && ymd <= hi;
}

/** Max. sichtbare Mini-Termine pro Monatszelle; Rest als „+N“. */
const MONTH_CELL_MAX_VISIBLE = 3;

/**
 * @param {CalendarEvent[]} events
 * @param {KalenderFilterState} fs
 * @param {Set<string>} konflikteSet
 */
function renderMonthGridHtml(events, fs, konflikteSet) {
  kalenderMonthDayPeek = new Map();
  const anchor = fs.anchorDate || fs.zeitraumVon || berlinTodayYmd();
  const { first, last } = gridMonthFirstLastYmd(anchor);
  const wd1 = gridBerlinWeekdayMon1Sun7(first);
  let gridStart = first;
  for (let i = 1; i < wd1; i++) gridStart = gridStepBerlinDay(gridStart, -1);
  const wdL = gridBerlinWeekdayMon1Sun7(last);
  let gridEnd = last;
  for (let i = wdL; i < 7; i++) gridEnd = gridStepBerlinDay(gridEnd, 1);

  /** @type {string[]} */
  const cells = [];
  let d = gridStart;
  for (let guard = 0; guard < 50; guard++) {
    cells.push(d);
    if (d === gridEnd) break;
    d = gridStepBerlinDay(d, 1);
  }

  const todayY = berlinTodayYmd();
  const weekdayRow = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
    .map(w => `<div class="ccw-cockpit-kal20-month-dow">${esc(w)}</div>`)
    .join('');

  const cellHtml = cells
    .map((ymd, idx) => {
      const inMonth = ymd >= first && ymd <= last;
      const isToday = ymd === todayY;
      const di = idx % 7;
      const isWeekend = di >= 5;
      const parts = ymd.split('-');
      const dayNum = parts[2] || '';
      const dayEvents = events.filter(e => eventTouchesBerlinDay(e, ymd));
      kalenderMonthDayPeek.set(ymd, dayEvents);

      const visible = dayEvents.slice(0, MONTH_CELL_MAX_VISIBLE);
      const moreCount = dayEvents.length - visible.length;

      const evLines = visible
        .map(ev => {
          const kid = kategorieIdForKal20Render(ev, 'grid-timed');
          const titel = String(cockpitKalenderRasterListenTitel(ev) || '').slice(0, 42);
          const lab = titel || 'Termin';
          const kP = kalenderKonfliktBlockParts(ev.eventId, konflikteSet, lab);
          return `<div role="button" tabindex="0" class="ccw-cockpit-kal20-evt ccw-cockpit-kal20-month-evt ckp-cal-block ckp-cal-block--timed ckp-cal-block--kat-${esc(kid)} ccw-cockpit-kal20-evt--kat-${esc(kid)}${kP.cls}" data-event-id="${esc(ev.eventId)}" aria-label="${esc(kP.aria)}"><span class="ccw-cockpit-kal20-month-evt__t">${esc(titel)}</span></div>`;
        })
        .join('');

      const moreBtn =
        moreCount > 0
          ? `<button type="button" class="ccw-cockpit-kal20-month-more" data-ccw-kal-day-more="${esc(ymd)}" aria-label="${esc(String(moreCount))} weitere Termine anzeigen">${esc(`+${moreCount}`)}</button>`
          : '';

      const cellCls = [
        'ccw-cockpit-kal20-month-cell',
        inMonth ? 'ccw-cockpit-kal20-month-cell--in-month' : 'ccw-cockpit-kal20-month-cell--pad',
        isToday ? 'ccw-cockpit-kal20-month-cell--today' : '',
        isWeekend ? 'ccw-cockpit-kal20-month-cell--weekend' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `<div class="${cellCls}" data-ccw-kal-ymd="${esc(ymd)}">
      <div class="ccw-cockpit-kal20-month-daynum">${esc(dayNum)}</div>
      <div class="ccw-cockpit-kal20-month-evts">${evLines}${moreBtn}</div>
    </div>`;
    })
    .join('');

  return `<div class="ccw-cockpit-kal20-body ccw-cockpit-kal20-body--month">
    <div class="ccw-cockpit-kal20-month-wrap">
      <div class="ccw-cockpit-kal20-month-dow-row">${weekdayRow}</div>
      <div class="ccw-cockpit-kal20-month-grid">${cellHtml}</div>
    </div>
  </div>`;
}

/**
 * @param {string|undefined} eventId
 * @param {Set<string>} konflikteSet
 * @param {string} baseAria
 */
function kalenderKonfliktBlockParts(eventId, konflikteSet, baseAria) {
  const k = eventId != null && konflikteSet.has(String(eventId));
  if (!k) {
    return { cls: '', icon: '', aria: baseAria };
  }
  return {
    cls: ' ccw-cockpit-kal20-evt--konflikt',
    icon: '<span class="ccw-cockpit-kal20-evt__warn" aria-hidden="true">\u26A0</span>',
    aria: `${baseAria} — Konflikt: Doppelbuchung`,
  };
}

function gridAllDaySpanInWeek(ev, days) {
  if (ev.ganztag !== true) return null;
  const a = gridBerlinYmdFromDate(new Date(ev.start));
  const b = gridBerlinYmdFromDate(new Date(ev.ende));
  const lo = a <= b ? a : b;
  const hi = a <= b ? b : a;
  let di0 = -1;
  let di1 = -1;
  days.forEach((ymd, i) => {
    if (ymd >= lo && ymd <= hi) {
      if (di0 < 0) di0 = i;
      di1 = i;
    }
  });
  if (di0 < 0) return null;
  return { di0, di1 };
}

/**
 * @param {CalendarEvent[]} events
 * @param {KalenderFilterState} fs
 * @param {Set<string>} konflikteSet
 * @param {((label: string) => void) | null | undefined} [perfMark]
 */
function renderWeekGridHtml(events, fs, konflikteSet, perfMark) {
  const von = fs.zeitraumVon;
  const bis = fs.zeitraumBis;
  if (!von || !bis || von > bis) {
    return `<div class="ccw-cockpit-kal20-body"><p class="ccw-cockpit-kal-week-fallback">Kein gültiger Wochenzeitraum.</p></div>`;
  }
  const days = gridEnumerateYmdRange(von, bis);
  if (days.length !== 7) {
    return `<div class="ccw-cockpit-kal20-body"><p class="ccw-cockpit-kal-week-fallback">Raster nur für eine 7-Tage-Woche.</p></div>`;
  }

  kalenderWeekPerfAccum.overlap = 0;
  kalenderWeekPerfAccum.html = 0;

  if (typeof perfMark === 'function') perfMark('week_visible_range');

  const todayY = berlinTodayYmd();
  const rowH = KAL20_ROW_HEIGHT_PX;
  const bodyH = KAL20_ROW_COUNT * rowH;
  const nowMs = Date.now();
  const showNowLine = days.includes(todayY);

  const headers = days
    .map((ymd, di) => {
      const wd = gridBerlinWeekdayShortMoSo(ymd);
      const parts = ymd.split('-');
      const dd = parts[2] || '';
      const isToday = ymd === todayY;
      const isWeekend = di >= 5;
      const numCls = isToday ? 'ccw-cockpit-kal20-wday-num ccw-cockpit-kal20-wday-num--today' : 'ccw-cockpit-kal20-wday-num';
      const wkCls = isWeekend ? ' ccw-cockpit-kal20-dayhead--weekend' : '';
      return `<div class="ccw-cockpit-kal20-dayhead${isToday ? ' ccw-cockpit-kal20-dayhead--today' : ''}${wkCls}" data-ccw-kal-ymd="${esc(ymd)}" style="grid-column:${di + 2};grid-row:1"><div class="ccw-cockpit-kal20-wday-name">${esc(wd)}</div><div class="${numCls}">${esc(dd)}</div></div>`;
    })
    .join('');

  /** @type {CalendarEvent[]} */
  const allDayInWeek = events.filter(ev => gridAllDayTouchesWeek(ev, von, bis));
  allDayInWeek.sort((a, b) => {
    const aa = gridBerlinYmdFromDate(new Date(a.start));
    const bb = gridBerlinYmdFromDate(new Date(b.start));
    const c = aa.localeCompare(bb);
    if (c !== 0) return c;
    return String(cockpitKalenderRasterListenTitel(a) || '').localeCompare(
      String(cockpitKalenderRasterListenTitel(b) || ''),
      'de',
    );
  });

  const alldayBars = allDayInWeek
    .map(ev => {
      const span = gridAllDaySpanInWeek(ev, days);
      if (!span) return '';
      const { di0, di1 } = span;
      const w = di1 - di0 + 1;
      const leftPct = (di0 / 7) * 100;
      const widthPct = (w / 7) * 100;
      const kid = kategorieIdForKal20Render(ev, 'grid-allday');
      const listenTitel = cockpitKalenderRasterListenTitel(ev);
      const lab = `Ganztägig: ${String(listenTitel || '').slice(0, 80)}`;
      const kP = kalenderKonfliktBlockParts(ev.eventId, konflikteSet, lab);
      return `<div role="button" tabindex="0" class="ccw-cockpit-kal20-evt ccw-cockpit-kal20-evt--allday ccw-cockpit-kal20-allday-span ckp-cal-block ckp-cal-block--allday ckp-cal-block--kat-${esc(kid)} ccw-cockpit-kal20-evt--kat-${esc(kid)}${kP.cls}" data-event-id="${esc(ev.eventId)}" aria-label="${esc(kP.aria)}" style="margin-left:${leftPct}%;width:calc(${widthPct}% - 10px)">${kP.icon}<span class="ccw-cockpit-kal20-evt__title">${esc(listenTitel)}</span></div>`;
    })
    .join('');

  const alldayBgs = days
    .map(ymd => {
      const isToday = ymd === todayY;
      return `<div class="ccw-cockpit-kal20-allday-bg${isToday ? ' ccw-cockpit-kal20-allday-bg--today' : ''}" data-ccw-kal-ymd="${esc(ymd)}"></div>`;
    })
    .join('');

  const timeRows = [];
  for (let h = KAL20_START_HOUR; h < KAL20_END_HOUR_EXCLUSIVE; h++) {
    timeRows.push(
      `<div class="ccw-cockpit-kal20-time-slot"><span class="ccw-cockpit-kal20-time-label">${esc(String(h).padStart(2, '0'))}:00</span></div>`,
    );
  }
  const timeColHtml = `<div class="ccw-cockpit-kal20-time-col" style="grid-column:1;grid-row:1" aria-hidden="true">${timeRows.join('')}</div>`;

  if (typeof perfMark === 'function') perfMark('week_head_allday_timecol');
  const timedSegsByDay = gridPartitionTimedSegmentsByWeekDays(events, days);
  if (typeof perfMark === 'function') perfMark('week_partition');

  const hourLinesOnce = Array.from({ length: KAL20_ROW_COUNT }, () => '<div class="ccw-cockpit-kal20-hour-line"></div>').join('');
  const emaxMin = KAL20_ROW_COUNT * 60;

  /** @type {string[]} */
  const dayCols = [];
  for (let di = 0; di < 7; di++) {
    const ymd = days[di];
    const isToday = ymd === todayY;
    const gridStartMs = gridBerlinWallHourMs(ymd, KAL20_START_HOUR);
    const gridEndMs = gridBerlinWallHourMs(ymd, KAL20_END_HOUR_EXCLUSIVE);

    const rawDay = timedSegsByDay[di];
    /** @type {Array<CalendarEvent & { startMs: number, endMs: number, startMin: number, endMin: number, lane?: number, lanes?: number }>} */
    let segs = [];
    if (rawDay.length) {
      for (const row of rawDay) {
        const { ev, startMs: segStartMs, endMs: segEndMs } = row;
        const visStart = Math.max(segStartMs, gridStartMs);
        const visEnd = Math.min(segEndMs, gridEndMs);
        let startMin = (visStart - gridStartMs) / 60000;
        let endMin = (visEnd - gridStartMs) / 60000;
        if (visEnd <= visStart) {
          if (segStartMs >= gridEndMs) {
            startMin = emaxMin - 0.001;
            endMin = emaxMin;
          } else if (segEndMs <= gridStartMs) {
            startMin = 0;
            endMin = 0.001;
          } else {
            continue;
          }
        } else {
          startMin = Math.max(0, startMin);
          endMin = Math.min(emaxMin, Math.max(startMin + 1 / 60, endMin));
        }
        segs.push({ ev, startMs: segStartMs, endMs: segEndMs, startMin, endMin });
      }
    }

    let blocksHtml = '';
    if (segs.length) {
      const __ov0 = typeof perfMark === 'function' ? performance.now() : 0;
      const withLanes = gridAssignOverlapLanesSegs(segs);
      if (typeof perfMark === 'function') kalenderWeekPerfAccum.overlap += performance.now() - __ov0;

      const __hb0 = typeof perfMark === 'function' ? performance.now() : 0;
      const parts = [];
      for (let si = 0; si < withLanes.length; si++) {
        const s = withLanes[si];
        const Ln = s.lanes ?? 1;
        const lane = s.lane ?? 0;
        const layout = gridLayoutTimedBlock(s.startMs, s.endMs, ymd);
        const gapY = layout.heightPx > 14 ? 2 : 0;
        const topPx = gapY ? layout.topPx + 1 : layout.topPx;
        const heightPx = Math.max(4, layout.heightPx - gapY);
        const w = 100 / Ln;
        const left = (100 / Ln) * lane;
        const t0d = new Date(s.startMs);
        const t1d = new Date(s.endMs);
        const timeStr = `${KAL20_BLOCK_TIME_FMT.format(t0d)}\u2013${KAL20_BLOCK_TIME_FMT.format(t1d)}`;
        let extra = '';
        if (layout.beforeGrid) extra += ' · vor 07:00';
        if (layout.afterGrid) extra += ' · nach 19:00';
        const kid = kategorieIdForKal20Render(s.ev, 'grid-timed');
        const aria = `${String(cockpitKalenderRasterListenTitel(s.ev) || '')}, ${ymd}, ${timeStr}${extra}`;
        const kP = kalenderKonfliktBlockParts(s.ev.eventId, konflikteSet, aria);
        const canWeekDrag = cockpitKalenderWeekEventIsTimedDraggable(s.ev, isCockpitLocalGeneralEventId);
        const dragAttr = canWeekDrag ? '1' : '0';
        const dragDisabledCls = canWeekDrag ? '' : ' ccw-cockpit-kal20-evt--drag-disabled';
        parts.push(
          `<div role="button" tabindex="0" class="ccw-cockpit-kal20-evt ccw-cockpit-kal20-evt--timed ckp-cal-block ckp-cal-block--timed ckp-cal-block--kat-${esc(kid)} ccw-cockpit-kal20-evt--kat-${esc(kid)}${kP.cls}${dragDisabledCls}" data-ccw-kal-draggable="${esc(dragAttr)}" data-event-id="${esc(s.ev.eventId)}" aria-label="${esc(kP.aria)}" style="top:${topPx}px;height:${heightPx}px;left:${left}%;width:calc(${w}% - 10px);">${kP.icon}<span class="ckp-cal-block__title ccw-cockpit-kal20-evt__title">${esc(cockpitKalenderRasterListenTitel(s.ev))}</span></div>`,
        );
      }
      blocksHtml = parts.join('');
      if (typeof perfMark === 'function') kalenderWeekPerfAccum.html += performance.now() - __hb0;
    }

    let nowLineHtml = '';
    if (showNowLine && isToday) {
      const mins = gridBerlinMinutesSinceMidnight(nowMs) - KAL20_START_HOUR * 60;
      const pxPerMin = rowH / 60;
      const topNow = mins * pxPerMin;
      if (topNow >= 0 && topNow <= bodyH) {
        nowLineHtml = `<div id="ccw-cockpit-kal20-now-line" class="ccw-cockpit-kal20-now-line" style="top:${topNow}px" aria-hidden="true"><span class="ccw-cockpit-kal20-now-dot"></span></div>`;
      }
    }

    const wkCol = di >= 5 ? ' ccw-cockpit-kal20-day-col--weekend' : '';
    dayCols.push(`<div class="ccw-cockpit-kal20-day-col${isToday ? ' ccw-cockpit-kal20-day-col--today' : ''}${wkCol}" data-ccw-kal-ymd="${esc(ymd)}" style="grid-column:${di + 2};grid-row:1">
      <div class="ccw-cockpit-kal20-day-body" style="height:${bodyH}px" data-ccw-kal20-day-body="1">
        <div class="ccw-cockpit-kal20-hour-lines" aria-hidden="true">${hourLinesOnce}</div>
        <div class="ccw-cockpit-kal20-blocks-layer">${blocksHtml}</div>
        ${nowLineHtml}
      </div>
    </div>`);
  }

  if (typeof perfMark === 'function') perfMark('week_overlap_columns_html');
  if (typeof perfMark === 'function') perfMark('week_shell_wrap');

  const gridMeta = `data-ccw-kal20-week-grid="1" data-start-hour="${String(KAL20_START_HOUR)}" data-end-hour-exclusive="${String(KAL20_END_HOUR_EXCLUSIVE)}" data-row-px="${String(rowH)}" style="--kal20-row-height:${rowH}px"`;

  return `<div class="ccw-cockpit-kal20-body">
    <div class="ccw-cockpit-kal20-week-grid-wrap" ${gridMeta}>
      <div class="ccw-cockpit-kal20-week-grid ccw-cockpit-kal20-week-grid--head">
        <div class="ccw-cockpit-kal20-corner" style="grid-column:1;grid-row:1" aria-hidden="true"></div>
        ${headers}
        <div class="ccw-cockpit-kal20-allday-label" style="grid-column:1;grid-row:2">Ganztägig</div>
        <div class="ccw-cockpit-kal20-allday-merge" style="grid-column:2 / span 7;grid-row:2">
          <div class="ccw-cockpit-kal20-allday-bgs" aria-hidden="true">${alldayBgs}</div>
          <div class="ccw-cockpit-kal20-allday-stack">${alldayBars}</div>
        </div>
      </div>
      <div class="ccw-cockpit-kal20-scroll">
        <div class="ccw-cockpit-kal20-week-grid ccw-cockpit-kal20-week-grid--time">
          ${timeColHtml}
          ${dayCols.join('')}
        </div>
      </div>
    </div>
  </div>`;
}

/**
 * Toolbar: Heute, ‹ ›, Datum/KW, Woche/Monat (ruhig, ohne Kategorie-Filter).
 * @param {KalenderFilterState} fs
 */
function renderViewSwitcherHeadlineHtml(fs) {
  const { kwBold, kwSub } = formatKalenderKwToolbarParts(fs);
  const todayInRange = isTodayInsideCurrentRange(fs);
  const todayAria = todayInRange
    ? 'Heute — aktueller Zeitraum enthält den heutigen Tag'
    : 'Heute — zum heutigen Datum springen';
  const navBack = fs.viewMode === 'month' ? 'Einen Monat zurück' : 'Eine Woche zurück';
  const navFwd = fs.viewMode === 'month' ? 'Einen Monat vor' : 'Eine Woche vor';
  const wActive = fs.viewMode !== 'month' ? ' ccw-cockpit-kal20-view-btn--active' : '';
  const mActive = fs.viewMode === 'month' ? ' ccw-cockpit-kal20-view-btn--active' : '';
  const viewSwitch = `<div class="ccw-cockpit-kal20-view-switch" role="group" aria-label="Ansicht">
    <button type="button" class="ccw-cockpit-kal20-view-btn${wActive}" data-ccw-kal-view="week">Woche</button>
    <button type="button" class="ccw-cockpit-kal20-view-btn${mActive}" data-ccw-kal-view="month">Monat</button>
  </div>`;
  return `<div class="ccw-cockpit-kal20-toolbar">
    <div class="ccw-cockpit-kal20-toolbar-row">
      <div class="ccw-cockpit-kal20-nav-block" role="group" aria-label="Kalender">
        <button type="button" class="ccw-cockpit-kal20-btn-heute" data-ccw-kal-nav="today" aria-label="${esc(todayAria)}">Heute</button>
        <button type="button" class="ccw-cockpit-kal20-btn-arrow" data-ccw-kal-nav="prev" aria-label="${esc(navBack)}">‹</button>
        <button type="button" class="ccw-cockpit-kal20-btn-arrow" data-ccw-kal-nav="next" aria-label="${esc(navFwd)}">›</button>
        <span class="ccw-cockpit-kal20-kw-wrap"><span class="ccw-cockpit-kal20-kw-bold">${esc(kwBold)}</span><span class="ccw-cockpit-kal20-kw-sub"> ${esc(kwSub)}</span></span>
        <button type="button" class="ccw-cockpit-kal20-btn-general-neu" data-ccw-kal-general-neu aria-label="Neuen allgemeinen Termin anlegen"><span aria-hidden="true">+</span> Neu</button>
      </div>
      ${viewSwitch}
    </div>
  </div>`;
}

/**
 * @param {string} viewToolbar
 */
function renderKalenderHeaderShell(viewToolbar) {
  return `<div class="ccw-cockpit-kal-header ccw-cockpit-kal20-header">${viewToolbar}</div>`;
}

/**
 * Dezenter Hinweis bei 0 Terminen — ersetzt nie das Raster, nur Zusatzinfo.
 *
 * @param {string} title
 * @param {string} description
 * @returns {string}
 */
function renderKalenderEmptyHintBannerHtml(title, description) {
  return `<div class="ccw-cockpit-kal-empty-hint" role="status" aria-live="polite">
    <p class="ccw-cockpit-kal-empty-hint__title">${esc(title)}</p>
    <p class="ccw-cockpit-kal-empty-hint__text">${esc(description)}</p>
  </div>`;
}

/**
 * @param {Set<string>} konflikteSet
 */
function renderKalenderFooterHtml(konflikteSet) {
  const n = konflikteSet.size;
  if (n === 0) return '';
  return `<div class="ccw-cockpit-kal20-footer"><span class="ccw-cockpit-kal20-foot-konflikt" role="status">\u26A0 ${esc(String(n))} Konflikt${n === 1 ? '' : 'e'} erkannt (Doppelbuchung)</span></div>`;
}

function wrapKalenderSection(mainRowInnerHtml) {
  return `<section data-ccw-ro="cockpit-kalender" class="ccw-cockpit-kal20-section">
    <p class="ccw-cockpit-kal20-intro">Termine im Raster: <strong>GET /api/v1/stammdaten/kalender</strong> (ohne Cache). Lokale allgemeine Termine werden nicht mehr eingemischt. Verschieben nur mit passendem Persistenzweg.</p>
    <div id="ccw-cockpit-kal-dynamic" class="ccw-cockpit-kal-dynamic-root" data-ccw-kal-dynamic="1">
    ${mainRowInnerHtml}
    ${renderGeneralTerminDockHtml()}
    </div>
  </section>`;
}

/**
 * Position der Jetzt-Linie im Wochenraster (z. B. minütlich).
 * @param {ParentNode|null|undefined} root
 */
export function updateCockpitKalenderNowLine(root) {
  if (!root || typeof root.querySelector !== 'function') return;
  const line = root.querySelector('#ccw-cockpit-kal20-now-line');
  if (!line || !(line instanceof HTMLElement)) return;
  const grid = line.closest('[data-ccw-kal20-week-grid="1"]');
  if (!grid || !(grid instanceof HTMLElement)) return;
  const rowH = parseFloat(grid.getAttribute('data-row-px') || '60', 10) || 60;
  const startH = parseInt(grid.getAttribute('data-start-hour') || '7', 10) || 7;
  const endExc = parseInt(grid.getAttribute('data-end-hour-exclusive') || '19', 10) || 19;
  const bodyH = (endExc - startH) * rowH;
  const mins = gridBerlinMinutesSinceMidnight(Date.now()) - startH * 60;
  const pxPerMin = rowH / 60;
  const topNow = mins * pxPerMin;
  if (topNow < 0 || topNow > bodyH) {
    line.style.display = 'none';
    return;
  }
  line.style.display = '';
  line.style.top = `${topNow}px`;
}

/**
 * Nach erfolgreichem Backend-PATCH: Feed neu vom Server laden (Auftrag ist führend).
 * @param {string|undefined|null} eventId
 */
function bustCockpitKalenderBackendTruthCache(eventId) {
  cockpitKalenderFeedSnapshot = null;
  kalenderFusionCache = null;
  if (eventId != null && String(eventId).trim() !== '') {
    kalenderClientTimeOverrides.delete(String(eventId));
  }
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('ccw-kalender-rerender-request', { bubbles: true }));
  }
}

/**
 * @param {CalendarEvent} ev
 * @param {number} newStartMs
 * @param {number} newEndMs
 */
async function commitCockpitKalenderTimeMove(ev, newStartMs, newEndMs) {
  const kalDragDbg =
    typeof localStorage !== 'undefined' && localStorage.getItem('ccwDebugKalender') === '1';
  const startIso = new Date(newStartMs).toISOString();
  const endIso = new Date(newEndMs).toISOString();

  if (isCockpitLocalGeneralEventId(String(ev.eventId))) {
    const lid = cockpitGeneralLocalIdFromEventId(String(ev.eventId));
    if (!lid) return;
    const idx = cockpitLocalGeneralTermine.findIndex(t => t.id === lid);
    if (idx < 0) return;
    if (kalDragDbg && typeof console !== 'undefined' && console.debug) {
      console.debug('[ccw-kal][drag]', 'commit_ok', {
        source: 'local-general',
        eventId: ev.eventId,
        oldStart: ev.start,
        oldEnde: ev.ende,
        startIso,
        endIso,
      });
    }
    const prevStart = cockpitLocalGeneralTermine[idx].startIso;
    const prevEnde = cockpitLocalGeneralTermine[idx].endeIso;
    cockpitLocalGeneralTermine[idx] = {
      ...cockpitLocalGeneralTermine[idx],
      startIso,
      endeIso: endIso,
    };
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('ccw-kalender-rerender-request', { bubbles: true }));
    }
    persistCockpitLocalGeneralTermineToBrowserAsync(
      () => {
        cockpitKalenderGeneralDebug('drag', 'fail', { eventId: ev.eventId });
        cockpitLocalGeneralTermine[idx] = {
          ...cockpitLocalGeneralTermine[idx],
          startIso: prevStart,
          endeIso: prevEnde,
        };
        if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
          globalThis.alert('Verschieben konnte nicht gespeichert werden (Browser-Speicher).');
        }
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('ccw-kalender-rerender-request', { bubbles: true }));
        }
      },
      () => cockpitKalenderGeneralDebug('drag', 'ok', { eventId: ev.eventId, startIso, endIso }),
    );
    return;
  }

  const plan = cockpitKalenderWeekDragPersistPlan(ev);
  if (plan.kind === 'none') {
    if (kalDragDbg && typeof console !== 'undefined' && console.debug) {
      console.debug('[ccw-kal][drag]', 'commit_skip', {
        reason: plan.reason,
        eventId: ev.eventId,
        typ: ev.typ,
        objektTyp: ev.objektTyp,
      });
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
      globalThis.alert(
        'Dieser Termin kann hier nicht verschoben werden (kein bekannter Persistenzweg / keine Datenbasis).',
      );
    }
    return;
  }

  if (plan.kind === 'client_session_overlay') {
    if (kalDragDbg && typeof console !== 'undefined' && console.debug) {
      console.debug('[ccw-kal][drag]', 'commit_client_overlay', { eventId: ev.eventId, note: plan.reason, startIso, endIso });
    }
    kalenderClientTimeOverrides.set(String(ev.eventId), { start: startIso, ende: endIso });
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('ccw-kalender-rerender-request', { bubbles: true }));
    }
    return;
  }

  if (plan.kind === 'projekt_deadline') {
    if (kalDragDbg && typeof console !== 'undefined' && console.debug) {
      console.debug('[ccw-kal][drag]', 'commit_api_attempt', {
        route: 'projekt_deadline',
        eventId: ev.eventId,
        projectId: plan.projectId,
        startIso,
        endIso,
      });
    }
    const patched = await patchCockpitKalenderProjectDeadlineInBackend({
      projectId: plan.projectId,
      deadline: startIso,
    });
    if (!patched) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[CCW-Kalender] PATCH Projekt-Deadline fehlgeschlagen — Anzeige unverändert.');
      }
      if (kalDragDbg && typeof console !== 'undefined' && console.debug) {
        console.debug('[ccw-kal][drag]', 'commit_error', { eventId: ev.eventId, projectId: plan.projectId });
      }
      if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
        globalThis.alert('Projekt-Deadline konnte nicht gespeichert werden. Die Ansicht bleibt unverändert.');
      }
      return;
    }
    if (kalDragDbg && typeof console !== 'undefined' && console.debug) {
      console.debug('[ccw-kal][drag]', 'commit_ok', { route: 'projekt_deadline', eventId: ev.eventId, startIso, endIso });
    }
    bustCockpitKalenderBackendTruthCache(ev.eventId);
    return;
  }

  const auftragId = plan.auftragId;
  if (kalDragDbg && typeof console !== 'undefined' && console.debug) {
    console.debug('[ccw-kal][drag]', 'commit_api_attempt', {
      route: 'auftrag_termin',
      eventId: ev.eventId,
      auftragId,
      typ: ev.typ,
      objektTyp: ev.objektTyp,
      startIso,
      endIso,
    });
  }

  const ccSparteRaw =
    /** @type {any} */ (ev).cockpitCcInternTerminSparte != null
      ? String(/** @type {any} */ (ev).cockpitCcInternTerminSparte).trim()
      : '';
  const ccInternTerminSparte =
    ccSparteRaw === 'montage' || ccSparteRaw === 'lieferung' ? /** @type {'montage'|'lieferung'} */ (ccSparteRaw) : null;

  const patched = await patchCockpitKalenderEventTimeInBackend({
    eventId: String(ev.eventId),
    auftragId,
    start: startIso,
    ende: endIso,
    ccInternTerminSparte,
  });
  if (!patched) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[CCW-Kalender] PATCH Terminzeit fehlgeschlagen — Anzeige unverändert.');
    }
    if (kalDragDbg && typeof console !== 'undefined' && console.debug) {
      console.debug('[ccw-kal][drag]', 'commit_error', { eventId: ev.eventId, auftragId });
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
      globalThis.alert('Terminzeit konnte nicht gespeichert werden. Die Ansicht bleibt unverändert.');
    }
    return;
  }

  if (kalDragDbg && typeof console !== 'undefined' && console.debug) {
    console.debug('[ccw-kal][drag]', 'commit_ok', { route: 'auftrag_termin', eventId: ev.eventId, auftragId, startIso, endIso });
  }
  bustCockpitKalenderBackendTruthCache(ev.eventId);
}

/**
 * Pointer-Drag nur Wochenraster (`.ccw-cockpit-kal20-evt--timed`), Snap 30 Min.
 * @param {ParentNode|null|undefined} root
 */
export function attachCockpitKalenderWeekDragHandlers(root) {
  if (typeof document === 'undefined' || !root || typeof root.addEventListener !== 'function') return;
  if (kalenderWeekDragListenersAbort) kalenderWeekDragListenersAbort.abort();
  kalenderWeekDragListenersAbort = new AbortController();
  attachCockpitKalenderWeekDragHandlersImpl(
    root,
    {
      getEventById: id => kalenderRowEventsById.get(id),
      isDraggable: ev => cockpitKalenderWeekEventIsTimedDraggable(ev, isCockpitLocalGeneralEventId),
      commitMove: commitCockpitKalenderTimeMove,
      debugLog:
        typeof localStorage !== 'undefined' && localStorage.getItem('ccwDebugKalender') === '1'
          ? (phase, data) => {
              if (typeof console !== 'undefined' && console.debug) console.debug('[ccw-kal][drag]', phase, data);
            }
          : undefined,
      isMonthView: () => kalenderFilterState.viewMode === 'month',
      isYmdInCurrentWeek: ymd => {
        const von = kalenderFilterState.zeitraumVon;
        const bis = kalenderFilterState.zeitraumBis;
        if (!von || !bis) return false;
        return ymd >= von && ymd <= bis;
      },
      getStartHour: () => KAL20_START_HOUR,
      getEndHourExclusive: () => KAL20_END_HOUR_EXCLUSIVE,
      getRowHeightPx: () => KAL20_ROW_HEIGHT_PX,
      gridBerlinMidnightMs,
      gridBerlinWallHourMs,
      gridBerlinYmdFromDate: ms => gridBerlinYmdFromDate(new Date(ms)),
    },
    { signal: kalenderWeekDragListenersAbort.signal },
  );
}

/**
 * Wochenraster: Klick auf freie Fläche → allgemeinen Termin anlegen (lokal, localStorage).
 * @param {ParentNode|null|undefined} root
 */
export function attachCockpitKalenderGeneralSlotHandlers(root) {
  if (typeof document === 'undefined' || !root || typeof root.addEventListener !== 'function') return;
  if (kalenderGeneralSlotListenersAbort) kalenderGeneralSlotListenersAbort.abort();
  kalenderGeneralSlotListenersAbort = new AbortController();
  const sig = kalenderGeneralSlotListenersAbort.signal;

  function getGeneralDockEls() {
    const dock = root.querySelector('[data-ccw-kal-general-dock]');
    const form = root.querySelector('[data-ccw-kal-general-form]');
    if (!(dock instanceof HTMLElement) || !(form instanceof HTMLFormElement)) return null;
    const titelEl = /** @type {HTMLInputElement|null} */ (form.querySelector('[name="titel"]'));
    const startEl = /** @type {HTMLInputElement|null} */ (form.querySelector('[name="start"]'));
    const endeEl = /** @type {HTMLInputElement|null} */ (form.querySelector('[name="ende"]'));
    const notizEl = /** @type {HTMLTextAreaElement|null} */ (form.querySelector('[name="notiz"]'));
    return { dock, form, titelEl, startEl, endeEl, notizEl };
  }

  function closeDock() {
    const els = getGeneralDockEls();
    if (!els) return;
    els.dock.hidden = true;
    els.form.reset();
  }

  /**
   * @param {number} startMs
   * @param {number} endMs
   */
  function openDock(startMs, endMs) {
    const els = getGeneralDockEls();
    if (!els || !(els.titelEl && els.startEl && els.endeEl)) return;
    els.titelEl.value = '';
    els.startEl.value = formatDatetimeLocalFromBerlinWallMs(startMs);
    els.endeEl.value = formatDatetimeLocalFromBerlinWallMs(endMs);
    if (els.notizEl) els.notizEl.value = '';
    els.dock.hidden = false;
    els.titelEl.focus();
  }

  function openGeneralDockDefaultSlot() {
    const fs = kalenderFilterState;
    const von = fs.zeitraumVon;
    const bis = fs.zeitraumBis;
    let ymd = berlinTodayYmd();
    if (von && bis && (ymd < von || ymd > bis)) ymd = von;
    const gridStart = gridBerlinWallHourMs(ymd, KAL20_START_HOUR);
    const gridEnd = gridBerlinWallHourMs(ymd, KAL20_END_HOUR_EXCLUSIVE);
    const now = Date.now();
    const minMid = gridBerlinMinutesSinceMidnight(now);
    const inVisibleDay =
      ymd === berlinTodayYmd() &&
      minMid >= KAL20_START_HOUR * 60 &&
      minMid < KAL20_END_HOUR_EXCLUSIVE * 60;
    let startMs;
    if (inVisibleDay) {
      const snapMid = Math.ceil(minMid / 30) * 30;
      startMs = gridBerlinMidnightMs(ymd) + snapMid * 60000;
    } else {
      startMs = gridStart;
    }
    if (startMs < gridStart) startMs = gridStart;
    let endMs = startMs + 30 * 60000;
    if (endMs > gridEnd) {
      endMs = gridEnd;
      startMs = Math.max(gridStart, endMs - 30 * 60000);
    }
    if (endMs <= startMs) return;
    openDock(startMs, endMs);
  }

  root.addEventListener(
    'click',
    ev => {
      const neuBtn = ev.target instanceof Element ? ev.target.closest('[data-ccw-kal-general-neu]') : null;
      if (neuBtn && root.contains(neuBtn)) {
        ev.preventDefault();
        openGeneralDockDefaultSlot();
        return;
      }
      if (kalenderFilterState.viewMode === 'month') return;
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (!t.closest('[data-ccw-ro="cockpit-kalender"]')) return;
      const scrollEl = root.querySelector('.ccw-cockpit-kal20-scroll');
      if (!(scrollEl instanceof HTMLElement)) return;
      if (t.closest('.ccw-cockpit-kal20-evt')) return;
      if (t.closest('a,button,select,textarea,input,label')) return;
      const body = t.closest('.ccw-cockpit-kal20-day-body');
      if (!(body instanceof HTMLElement)) return;
      const col = body.closest('.ccw-cockpit-kal20-day-col');
      const ymd = col instanceof HTMLElement ? col.getAttribute('data-ccw-kal-ymd') : null;
      if (!ymd) return;
      const von = kalenderFilterState.zeitraumVon;
      const bis = kalenderFilterState.zeitraumBis;
      if (!von || !bis || ymd < von || ymd > bis) return;
      const slot = pickWeekSlotStartEndFromPointer(ymd, ev.clientY, scrollEl);
      if (!slot) return;
      ev.preventDefault();
      openDock(slot.startMs, slot.endMs);
    },
    { signal: sig },
  );

  root.addEventListener(
    'submit',
    sev => {
      if (!(sev.target instanceof HTMLFormElement)) return;
      if (!sev.target.matches('[data-ccw-kal-general-form]')) return;
      if (!sev.target.closest('[data-ccw-ro="cockpit-kalender"]')) return;
      sev.preventDefault();
      const els = getGeneralDockEls();
      if (!els || !(els.titelEl && els.startEl && els.endeEl)) return;
      const titel = els.titelEl.value.trim();
      if (!titel) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
          globalThis.alert('Bitte einen Titel eingeben.');
        }
        cockpitKalenderGeneralDebug('create', 'fail', { reason: 'empty_title' });
        return;
      }
      const startMs = new Date(els.startEl.value).getTime();
      const endMs = new Date(els.endeEl.value).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
          globalThis.alert('Start und Ende müssen gültig sein; Ende muss nach Start liegen.');
        }
        cockpitKalenderGeneralDebug('create', 'fail', { reason: 'invalid_time' });
        return;
      }
      const id = newCockpitGeneralTerminId();
      /** @type {CockpitLocalGeneralTermin} */
      const row = {
        id,
        type: 'general',
        sourceType: 'cockpit',
        titel,
        startIso: new Date(startMs).toISOString(),
        endeIso: new Date(endMs).toISOString(),
      };
      const nz = els.notizEl && els.notizEl.value.trim() !== '' ? els.notizEl.value.trim() : '';
      if (nz) row.notiz = nz;
      cockpitLocalGeneralTermine.push(row);
      closeDock();
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('ccw-kalender-rerender-request', { bubbles: true }));
      }
      persistCockpitLocalGeneralTermineToBrowserAsync(
        () => {
        cockpitKalenderGeneralDebug('create', 'fail', { id });
        const i = cockpitLocalGeneralTermine.findIndex(t => t.id === id);
        if (i >= 0) cockpitLocalGeneralTermine.splice(i, 1);
        if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
          globalThis.alert('Speichern fehlgeschlagen (Browser-Speicher). Der Termin wurde verworfen.');
        }
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('ccw-kalender-rerender-request', { bubbles: true }));
        }
        },
        () => cockpitKalenderGeneralDebug('create', 'ok', { id }),
      );
    },
    { signal: sig, capture: true },
  );

  root.addEventListener(
    'click',
    ev => {
      const btn = ev.target instanceof Element ? ev.target.closest('[data-ccw-kal-general-cancel]') : null;
      if (btn && root.contains(btn)) {
        ev.preventDefault();
        closeDock();
      }
    },
    { signal: sig },
  );
}

/**
 * Gemeinsame Pipeline: Toolbar, Hinweise, Wochen-/Monatsraster, Footer (ohne äußere Section/Dock-Wrapper).
 * @param {object|null|undefined} _user — reserviert; im Snapshot-Modus keine Rechtefilter
 * @returns {Promise<{ bodyInner: string, fusionCacheHit: boolean, viewMode: 'week'|'month' }>}
 */
async function buildCockpitKalenderViewBodyHtml(_user) {
  const __kalDbg =
    typeof localStorage !== 'undefined' && localStorage.getItem('ccwDebugKalender') === '1';
  lastKalenderRenderPerf = null;

  /** @type {{ t0: number, lap: (k: string) => void, runWeekHtml?: (fn: (weekLap: (k: string) => void) => string) => string, phases: Record<string, number> } | null} */
  let perf = null;
  if (__kalDbg && typeof performance !== 'undefined') {
    const phases = /** @type {Record<string, number>} */ ({});
    const t0 = performance.now();
    let L = t0;
    perf = {
      t0,
      phases,
      lap(k) {
        const n = performance.now();
        phases[k] = Math.round((n - L) * 100) / 100;
        L = n;
      },
      /**
       * Wochenraster: `week_*`-Teilphasen + Rollup `08_render_week_grid_html` ohne Doppelzählung der Hauptsequenz-L.
       * @param {(weekLap: (k: string) => void) => string} fn
       */
      runWeekHtml(fn) {
        const tw0 = performance.now();
        let wL = tw0;
        const weekLap = /** @param {string} k */ k => {
          const n = performance.now();
          phases[k] = Math.round((n - wL) * 100) / 100;
          wL = n;
        };
        const html = fn(weekLap);
        const tw1 = performance.now();
        phases['08_render_week_grid_html'] = Math.round((tw1 - tw0) * 100) / 100;
        L = tw1;
        return html;
      },
    };
  }

  if (perf) {
    perf.phases['00_berlin_time'] = 0;
    kalenderBerlinTimeAccum = dt => {
      perf.phases['00_berlin_time'] = Math.round(((perf.phases['00_berlin_time'] || 0) + dt) * 100) / 100;
    };
  }

  try {
  kalenderFusionCache = null;
  loadCockpitLocalGeneralTermineFromBrowser();
  if (perf) perf.lap('01_session');

  /** @type {object[]} */
  let projects;
  /** @type {object[]} */
  let auftraege;

  /** Immer Server-Stand vor dem Rendern — kein synchrones „Snapshot zuerst“ (sonst bleiben alte Termine sichtbar). */
  const feed = await getCalendarFeedFromApi(CCW_APP_SHELL_PLACEHOLDER_PROJECT);
  kalenderProjectsCache = feed && Array.isArray(feed.projects) ? feed.projects : [];
  projects = kalenderProjectsCache;
  auftraege = feed && Array.isArray(feed.auftraege) ? feed.auftraege : [];
  cockpitKalenderFeedSnapshot = { projects, auftraege };

  try {
    const root = typeof document !== 'undefined' ? document.getElementById('cockpit-root') : null;
    const activeModule = root?.getAttribute('data-app-module') ?? null;
    const activeView = root?.getAttribute('data-active-view') ?? null;
    console.log('[KALENDER_FRONTEND_IST]', {
      phase: 'nach getCalendarFeedFromApi',
      responseAuftraegeLength: auftraege.length,
      ersteTitel: auftraege.slice(0, 5).map((a) => a?.name ?? a?.title ?? null),
      kalenderTyp: 'cockpit-kalender-view Wochenraster (renderCcwCockpitKalenderViewHtml)',
      activeModule,
      activeView,
      feedNull: feed == null,
    });
  } catch {
    /* ignore */
  }

  if (perf) perf.lap('02_feed');

  const generalFp = buildCockpitKalenderGeneralFingerprint();
  const overridesFp = buildCockpitKalenderOverridesFingerprint();
  let kalenderFusionHit = false;

  /** @type {CalendarEvent[]} */
  let allValidated;

  if (
    kalenderFusionCache &&
    kalenderFusionCache.projects === projects &&
    kalenderFusionCache.auftraege === auftraege &&
    kalenderFusionCache.generalFp === generalFp &&
    kalenderFusionCache.overridesFp === overridesFp
  ) {
    allValidated = kalenderFusionCache.allValidated;
    kalenderFusionHit = true;
  } else {
    const apiValidated = buildValidatedCalendarEventsFromStateSnapshot({
      projects,
      auftraege,
    });

    const mergedSource = [...apiValidated];

    allValidated = mergedSource.map(ev => {
      if (isCockpitLocalGeneralEventId(String(ev.eventId))) return ev;
      const o = kalenderClientTimeOverrides.get(String(ev.eventId));
      if (!o) return ev;
      return { ...ev, start: o.start, ende: o.ende };
    });

    kalenderFusionCache = {
      projects,
      auftraege,
      generalFp,
      overridesFp,
      allValidated,
    };
  }

  try {
    const root = typeof document !== 'undefined' ? document.getElementById('cockpit-root') : null;
    console.log('[KALENDER_FRONTEND_IST]', {
      phase: 'nach Mapping',
      finalEventsLength: allValidated.length,
      gefilterteEventsLength: filterCalendarEvents(allValidated, kalenderFilterState).length,
      fusionCacheHit: kalenderFusionHit,
      lokaleGeneralTermine: cockpitLocalGeneralTermine.length,
      ersteFinalTitel: allValidated.slice(0, 5).map((ev) => ev?.titel ?? null),
      kalenderViewMode: kalenderFilterState.viewMode,
      activeModule: root?.getAttribute('data-app-module') ?? null,
      activeView: root?.getAttribute('data-active-view') ?? null,
    });
  } catch {
    /* ignore */
  }

  if (perf) perf.lap('03_fusion');

  syncKalenderZeitraumFromAnchorAndViewMode();

  /** @type {CalendarEvent[]} */
  let events = filterCalendarEvents(allValidated, kalenderFilterState);
  if (perf) perf.lap('04_filter');

  try {
    const finalEvents = events;
    console.log(
      '[KALENDER_FINAL_EVENTS]',
      finalEvents.map((e) => ({
        id: e.eventId ?? e.id,
        title: e.title ?? e.titel,
        source: e.source ?? e._source ?? e.typ,
        start: e.start ?? e.von,
      })),
    );
  } catch {
    /* ignore */
  }

  events.sort((a, b) => {
    const ta = new Date(a.start).getTime();
    const tb = new Date(b.start).getTime();
    const na = Number.isNaN(ta);
    const nb = Number.isNaN(tb);
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return ta - tb;
  });

  if (perf) perf.lap('05_sort');

  const konflikteSet = detectKalenderKonflikte(events);
  if (perf) perf.lap('07_overlap_konflikte_pairscan');

  const viewToolbar = renderViewSwitcherHeadlineHtml(kalenderFilterState);
  const footerHtml = renderKalenderFooterHtml(konflikteSet);

  /** Raster immer zeigen — Hinweis nur ergänzend, nie statt Kalender. */
  let emptyHintHtml = '';
  if (!allValidated.length) {
    emptyHintHtml = renderKalenderEmptyHintBannerHtml(
      'Keine Termine vorhanden',
      'Aktuell sind keine Termine im System vorhanden. Kalender bleibt offen — hier klicken, um einen allgemeinen Termin anzulegen.',
    );
  } else if (!events.length) {
    emptyHintHtml = renderKalenderEmptyHintBannerHtml(
      'Keine Termine gefunden',
      'Keine Termine im gewählten Zeitraum oder Filter. Kalender bleibt offen.',
    );
  }

  if (perf) perf.lap('06_conflicts_prepare');

  kalenderRowEventsById = new Map(events.map(ev => [String(ev.eventId), ev]));
  if (perf) perf.lap('09_map_build');

  const vm = kalenderFilterState.viewMode === 'month' ? 'month' : 'week';
  let mainBody;
  if (vm === 'month') {
    mainBody = renderMonthGridHtml(events, kalenderFilterState, konflikteSet);
    if (perf) perf.lap('08_render_week_grid_html');
  } else {
    mainBody =
      perf && typeof perf.runWeekHtml === 'function'
        ? perf.runWeekHtml(wk => renderWeekGridHtml(events, kalenderFilterState, konflikteSet, wk))
        : renderWeekGridHtml(events, kalenderFilterState, konflikteSet, null);
  }

  const bodyInner = `${renderKalenderHeaderShell(viewToolbar)}${emptyHintHtml}${mainBody}${footerHtml}`;

  if (perf) {
    lastKalenderRenderPerf = {
      t0: perf.t0,
      phases: perf.phases,
      fusionCacheHit: kalenderFusionHit,
      viewMode: vm,
      ...(vm === 'week'
        ? {
            weekDebugOverlapMs: kalenderWeekPerfAccum.overlap,
            weekDebugHtmlMs: kalenderWeekPerfAccum.html,
          }
        : {}),
    };
    if (vm === 'week') {
      scheduleKalenderWeekPerfDebugCompactLog();
    }
  }

  return { bodyInner, fusionCacheHit: kalenderFusionHit, viewMode: vm };
  } finally {
    kalenderBerlinTimeAccum = null;
  }
}

/**
 * Nur Inhalt für `#ccw-cockpit-kal-dynamic` (Toolbar + Raster + Footer + Dock) — gleiche Pipeline wie Full-View.
 * @param {object|null|undefined} _user
 * @returns {Promise<string>}
 */
export async function renderCcwCockpitKalenderDynamicMountHtml(_user) {
  const { bodyInner } = await buildCockpitKalenderViewBodyHtml(_user);
  return `${bodyInner}${renderGeneralTerminDockHtml()}`;
}

/**
 * @param {object|null|undefined} _user — reserviert; im Snapshot-Modus keine Rechtefilter
 * @returns {Promise<string>}
 */
export async function renderCcwCockpitKalenderViewHtml(_user) {
  const { bodyInner } = await buildCockpitKalenderViewBodyHtml(_user);
  return wrapKalenderSection(bodyInner);
}
