/**
 * Read-only Filter auf validierten CalendarEvent[] — pure Funktionen, kein State.
 *
 * Debug: In der Browser-Konsole `globalThis.__CCW_DEBUG_KALENDER_FILTER__ = true` setzen,
 * dann loggt `filterCalendarEvents` Eingang/Stichprobe (typ, Start, Zeitraum-Treffer).
 */

/** @typedef {import('./ccw-calendar-event-foundation.js').CalendarEvent} CalendarEvent */

/**
 * Kalender-Kategorien (Anweisung 20) — UI-Chips, nicht identisch mit `CalendarEvent.typ`.
 * @typedef {'montage'|'grafik'|'buero'|'planung'|'ausliefern'} KalenderKategorieId
 */

/**
 * @typedef {object} KalenderFilterState
 * @property {string|null} zeitraumVon — ISO-Datum YYYY-MM-DD
 * @property {string|null} zeitraumBis — ISO-Datum YYYY-MM-DD
 * @property {string[]} kategorien — aktive Kategorie-IDs (`KalenderKategorieId`); leer = keine Termine
 * @property {string[]} typen — unbenutzt (Kompatibilität)
 * @property {string[]} status — unbenutzt (Kompatibilität)
 * @property {string[]} mitarbeiterIds — unbenutzt (Kompatibilität)
 * @property {string|null} projektId — unbenutzt (Kompatibilität)
 * @property {string} search — unbenutzt (Kompatibilität)
 * @property {'week'|'month'} viewMode — Woche Mo–So oder voller Monat
 * @property {string} anchorDate — Bezugsdatum YYYY-MM-DD (Europe/Berlin), mit viewMode → von/bis
 */

/** @type {'week'} */
const DEFAULT_VIEW_MODE = 'week';

/** @type {Readonly<KalenderKategorieId[]>} */
export const KALENDER_KATEGORIE_IDS = Object.freeze(
  /** @type {const} */ (['montage', 'grafik', 'buero', 'planung', 'ausliefern']),
);

/** Standard: alle Kategorie-Chips aktiv (neues `KalenderFilterState`, Reset). */
export function allKalenderKategorienAktiv() {
  return [...KALENDER_KATEGORIE_IDS];
}

/**
 * @type {Readonly<Record<KalenderKategorieId, readonly string[]>>}
 */
export const KALENDER_KATEGORIE_TYPEN = Object.freeze({
  montage: Object.freeze(['montage', 'demontage', 'abnahme']),
  grafik: Object.freeze(['druck', 'plot', 'laminat', 'werkstatt']),
  buero: Object.freeze(['intern', 'kundentermin', 'besichtigung']),
  planung: Object.freeze(['planung', 'produktion']),
  ausliefern: Object.freeze(['lieferung', 'schaden', 'sonstiges']),
});

const BERLIN_TZ = 'Europe/Berlin';

const _BERLIN_YMD_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BERLIN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const _BERLIN_WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: BERLIN_TZ,
  weekday: 'short',
});

/** Toolbar: wie zuvor ohne timeZone (UTC-Date-Komponenten → de-DE Anzeige). */
const _KAL_TOOLBAR_MONTH_LONG_FMT = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const _KAL_TOOLBAR_DAY_SHORT_FMT = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const _KAL_TOOLBAR_DAY_LONG_FMT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const BERLIN_FILTER_YMD_CACHE_MAX = 600;
/** Key: `Date.getTime()` → Berlin-`YYYY-MM-DD` (deterministisch, kein Leeren bei Kalender-Invalidierung). */
const _berlinYmdCache = new Map();

/**
 * @param {number} ms
 * @param {string} ymd
 */
function berlinFilterYmdCacheSet(ms, ymd) {
  _berlinYmdCache.set(ms, ymd);
  while (_berlinYmdCache.size > BERLIN_FILTER_YMD_CACHE_MAX) {
    const first = _berlinYmdCache.keys().next().value;
    _berlinYmdCache.delete(first);
  }
}

/**
 * Kalendertag in Europe/Berlin als YYYY-MM-DD.
 * @param {Date} d
 * @returns {string}
 */
function berlinYmdFromDate(d) {
  const ms = d.getTime();
  if (Number.isNaN(ms)) {
    const parts = _BERLIN_YMD_FMT.formatToParts(d);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${day}`;
  }
  const cached = _berlinYmdCache.get(ms);
  if (cached !== undefined) return cached;
  const parts = _BERLIN_YMD_FMT.formatToParts(d);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const ymd = `${y}-${m}-${day}`;
  berlinFilterYmdCacheSet(ms, ymd);
  return ymd;
}

/**
 * UTC-Zeitstempel, der in Berlin auf den Zielkalendertag fällt (für Wochentags-/Tagesarithmetik).
 * @param {string} ymd
 * @returns {number}
 */
function berlinYmdToUtcMsAligned(ymd) {
  const [y, mo, da] = ymd.split('-').map(Number);
  let ms = Date.UTC(y, mo - 1, da, 12, 0, 0);
  for (let i = 0; i < 48; i++) {
    if (berlinYmdFromDate(new Date(ms)) === ymd) return ms;
    if (berlinYmdFromDate(new Date(ms)) < ymd) ms += 3600000;
    else ms -= 3600000;
  }
  return ms;
}

/**
 * ISO-8601 Wochentag für den Berlin-Kalendertag: Mo = 1 … So = 7.
 * @param {string} ymd
 * @returns {number}
 */
function berlinWeekdayMon1Sun7(ymd) {
  const ms = berlinYmdToUtcMsAligned(ymd);
  const w = _BERLIN_WEEKDAY_FMT.format(new Date(ms));
  /** @type {Record<string, number>} */
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[w] ?? 1;
}

/**
 * @param {string} ymd
 * @param {1|-1} dir
 * @returns {string}
 */
function stepBerlinCalendarDay(ymd, dir) {
  let ms = berlinYmdToUtcMsAligned(ymd);
  ms += dir * 3600000;
  for (let h = 0; h < 30; h++) {
    const cur = berlinYmdFromDate(new Date(ms));
    if (cur !== ymd) return cur;
    ms += dir * 3600000;
  }
  return berlinYmdFromDate(new Date(ms));
}

/**
 * @param {string} ymd
 * @param {number} delta
 * @returns {string}
 */
export function addBerlinCalendarDays(ymd, delta) {
  let cur = ymd;
  const sign = delta >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(delta); i++) {
    cur = stepBerlinCalendarDay(cur, sign);
  }
  return cur;
}

/**
 * @param {string} ymd
 * @param {number} delta Monate (+/-)
 * @returns {string}
 */
function addBerlinCalendarMonths(ymd, delta) {
  const [y0, m0, d0] = ymd.split('-').map(Number);
  let y = y0;
  let m = m0 - 1 + delta;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  const dim = daysInGregorianMonth(y, m + 1);
  const d = Math.min(d0, dim);
  const pad = /** @param {number} n */ n => String(n).padStart(2, '0');
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/**
 * @param {number} y
 * @param {number} m 1–12
 * @returns {number}
 */
function daysInGregorianMonth(y, m) {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const d = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d[m - 1];
}

/**
 * @param {string} ymdToday Berlin YYYY-MM-DD
 * @returns {{ first: string, last: string }}
 */
function berlinMonthFirstLast(ymdToday) {
  const [y, m] = ymdToday.split('-').map(Number);
  const pad = n => String(n).padStart(2, '0');
  const first = `${y}-${pad(m)}-01`;
  const dim = daysInGregorianMonth(y, m);
  const last = `${y}-${pad(m)}-${pad(dim)}`;
  return { first, last };
}

/**
 * ISO-Kalenderwoche und ISO-Jahr zum gregorianischen Datum (gleiche Y-M-D-Zahlen wie Berlin-Kalendertag).
 * @param {number} y
 * @param {number} m
 * @param {number} d
 * @returns {{ week: number, isoYear: number }}
 */
function isoWeekAndYear(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const isoYear = date.getUTCFullYear();
  const w1 = new Date(Date.UTC(isoYear, 0, 4));
  const day1 = (w1.getUTCDay() + 6) % 7;
  w1.setUTCDate(w1.getUTCDate() - day1);
  const week = 1 + Math.floor((date.getTime() - w1.getTime()) / 604800000);
  return { week, isoYear };
}

/**
 * @param {unknown} s
 * @returns {boolean}
 */
function isValidYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

/**
 * Heutiger Kalendertag Europe/Berlin als YYYY-MM-DD.
 * @returns {string}
 */
export function berlinTodayYmd() {
  return berlinYmdFromDate(new Date());
}

/**
 * Berlin-Kalendertag (YYYY-MM-DD) des Event-Starts, oder null bei fehlendem/ungültigem Start.
 * Nutzt dieselbe `berlinYmdFromDate`-Logik wie die übrige Kalender-Zeitrechnung.
 *
 * @param {CalendarEvent|null|undefined} event
 * @returns {string|null}
 */
export function berlinYmdOfEventStart(event) {
  if (event == null || typeof event !== 'object') return null;
  const start = event.start;
  if (start == null || String(start).trim() === '') return null;
  const d = new Date(String(start));
  if (Number.isNaN(d.getTime())) return null;
  return berlinYmdFromDate(d);
}

/**
 * Ob der Event-Start am heutigen Kalendertag (Europe/Berlin) liegt.
 *
 * @param {CalendarEvent|null|undefined} event
 * @returns {boolean}
 */
export function isEventStartOnBerlinToday(event) {
  const y = berlinYmdOfEventStart(event);
  if (y == null) return false;
  return y === berlinTodayYmd();
}

/**
 * Liegt das heutige Datum (Europe/Berlin) innerhalb von `zeitraumVon` … `zeitraumBis` (inkl.)?
 *
 * @param {KalenderFilterState|null|undefined} filterState
 * @returns {boolean}
 */
export function isTodayInsideCurrentRange(filterState) {
  if (filterState == null || typeof filterState !== 'object') return false;
  const von = filterState.zeitraumVon;
  const bis = filterState.zeitraumBis;
  if (!isValidYmd(von) || !isValidYmd(bis)) return false;
  const v = String(von).trim();
  const b = String(bis).trim();
  const today = berlinTodayYmd();
  return today >= v && today <= b;
}

/**
 * Verschiebt das Bezugsdatum für die Zeitraum-Navigation (kein DOM).
 *
 * @param {string|null|undefined} anchorDate YYYY-MM-DD
 * @param {'day'|'week'|'month'} viewMode
 * @param {-1|0|1} direction — 0 = heute (Berlin)
 * @returns {string} YYYY-MM-DD
 */
export function shiftAnchorDate(anchorDate, viewMode, direction) {
  const base = isValidYmd(anchorDate) ? String(anchorDate).trim() : berlinTodayYmd();

  if (direction === 0) return berlinTodayYmd();
  if (direction !== -1 && direction !== 1) return base;

  if (viewMode === 'month') {
    return addBerlinCalendarMonths(base, direction);
  }
  return addBerlinCalendarDays(base, direction * 7);
}

/**
 * Setzt `viewMode`, `anchorDate`, `zeitraumVon` und `zeitraumBis` am übergebenen State (kein DOM).
 * Kalendertage nach Europe/Berlin; Woche Mo–So nach ISO 8601.
 *
 * @param {KalenderFilterState} filterState
 * @param {'day'|'week'|'month'} viewMode
 * @param {string|null|undefined} anchorDate YYYY-MM-DD (Europe/Berlin)
 */
export function applyViewModeToFilterState(filterState, viewMode, anchorDate) {
  const fs = filterState;
  const ymdRef = isValidYmd(anchorDate) ? String(anchorDate).trim() : berlinTodayYmd();

  if (viewMode === 'month') {
    const { first, last } = berlinMonthFirstLast(ymdRef);
    fs.viewMode = 'month';
    fs.anchorDate = ymdRef;
    fs.zeitraumVon = first;
    fs.zeitraumBis = last;
    return;
  }

  const wd = berlinWeekdayMon1Sun7(ymdRef);
  const von = addBerlinCalendarDays(ymdRef, -(wd - 1));
  const bis = addBerlinCalendarDays(von, 6);

  fs.viewMode = 'week';
  fs.anchorDate = ymdRef;
  fs.zeitraumVon = von;
  fs.zeitraumBis = bis;
}

/**
 * Lesbare Überschrift für den aktuellen Modus (Anzeige).
 *
 * @param {KalenderFilterState} filterState
 * @returns {string}
 */
export function formatKalenderViewHeadline(filterState) {
  const fs = filterState || {};
  const von = fs.zeitraumVon;
  if (von == null || typeof von !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(von.trim())) return '';
  const [y, m, d] = von.split('-').map(Number);
  const { week, isoYear } = isoWeekAndYear(y, m, d);
  return `KW ${week} / ${isoYear}`;
}

/**
 * Toolbar-Zeile wie Mockup: fett „KW n“, grau „DD. – DD. Monat JJJJ“ (Mo–So).
 *
 * @param {KalenderFilterState} filterState
 * @returns {{ kwBold: string, kwSub: string }}
 */
export function formatKalenderKwToolbarParts(filterState) {
  const fs = filterState || {};
  const von = fs.zeitraumVon;
  const bis = fs.zeitraumBis;
  if (
    von == null ||
    bis == null ||
    typeof von !== 'string' ||
    typeof bis !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(von.trim()) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(bis.trim())
  ) {
    return { kwBold: '', kwSub: '' };
  }
  if (fs.viewMode === 'month') {
    const [y, m] = von.split('-').map(Number);
    const title = _KAL_TOOLBAR_MONTH_LONG_FMT.format(new Date(Date.UTC(y, m - 1, 15)));
    const { week, isoYear } = isoWeekAndYear(y, m, 1);
    return {
      kwBold: title,
      kwSub: `KW ${week} · ${isoYear}`,
    };
  }
  const [y1, m1, d1] = von.split('-').map(Number);
  const { week, isoYear } = isoWeekAndYear(y1, m1, d1);
  const [y2, m2, d2] = bis.split('-').map(Number);
  const left = _KAL_TOOLBAR_DAY_SHORT_FMT.format(new Date(Date.UTC(y1, m1 - 1, d1)));
  const right = _KAL_TOOLBAR_DAY_LONG_FMT.format(new Date(Date.UTC(y2, m2 - 1, d2)));
  return {
    kwBold: `KW ${week}`,
    kwSub: `${left} – ${right}`,
  };
}

/**
 * @returns {KalenderFilterState}
 */
export function createDefaultKalenderFilterState() {
  const today = berlinTodayYmd();
  const fs = {
    zeitraumVon: null,
    zeitraumBis: null,
    kategorien: allKalenderKategorienAktiv(),
    typen: [],
    status: [],
    mitarbeiterIds: [],
    projektId: null,
    search: '',
    viewMode: DEFAULT_VIEW_MODE,
    anchorDate: today,
  };
  applyViewModeToFilterState(fs, DEFAULT_VIEW_MODE, today);
  return fs;
}

/**
 * Erste UTC-ms des Berlin-Kalendertags ymd (inkl.).
 * `zeitraumVon`/`Bis` sind Berlin-YYYY-MM-DD — nicht als UTC-Mitternacht interpretieren.
 * @param {string} ymd
 * @returns {number|null}
 */
function berlinYmdStartUtcMs(ymd) {
  if (!isValidYmd(ymd)) return null;
  const d = String(ymd).trim();
  let ms = berlinYmdToUtcMsAligned(d);
  for (const step of [3600000, 60000, 1000, 1]) {
    while (berlinYmdFromDate(new Date(ms - step)) === d) ms -= step;
  }
  return ms;
}

/**
 * Erste UTC-ms des Berlin-Kalendertags `ymd` (für Kalenderkern / Auftrags-Mapping).
 * @param {string} ymd
 * @returns {number|null}
 */
export function kalenderBerlinYmdStartUtcMs(ymd) {
  return berlinYmdStartUtcMs(ymd);
}

/**
 * Reines Kalenderdatum ohne Uhrzeit aus dem Auftrag: neutraler Anzeige-Start (09:00 Europe/Berlin),
 * damit nicht `Date.UTC(Y,M,D)` + 1h → fälschlich 02:00–03:00 MESZ entsteht.
 * @param {string} ymd `YYYY-MM-DD`
 * @returns {number|null}
 */
export function kalenderBerlinDateOnlyNeutralSlotUtcMs(ymd) {
  const day0 = berlinYmdStartUtcMs(ymd);
  if (day0 == null) return null;
  return day0 + 9 * 3600000;
}

/**
 * Letzte UTC-ms des Berlin-Kalendertags ymd (inkl.).
 * @param {string} ymd
 * @returns {number|null}
 */
function berlinYmdEndUtcMs(ymd) {
  if (!isValidYmd(ymd)) return null;
  const d = String(ymd).trim();
  const next = stepBerlinCalendarDay(d, 1);
  const nextStart = berlinYmdStartUtcMs(next);
  return nextStart != null ? nextStart - 1 : null;
}

/**
 * Liegt der Termin im Mo–So-Zeitraum (Berlin-Kalendertage von/bis inkl.)?
 * @param {CalendarEvent} e
 * @param {string} vonYmd
 * @param {string} bisYmd
 */
function eventInBerlinZeitraum(e, vonYmd, bisYmd) {
  const v = String(vonYmd).trim();
  const b = String(bisYmd).trim();
  if (e.ganztag === true) {
    const y = berlinYmdFromDate(new Date(e.start));
    if (!isValidYmd(y)) return false;
    return y >= v && y <= b;
  }
  const vonStartMs = berlinYmdStartUtcMs(v);
  const bisEndMs = berlinYmdEndUtcMs(b);
  if (vonStartMs == null || bisEndMs == null) return false;
  const startMs = new Date(e.start).getTime();
  if (Number.isNaN(startMs)) return false;
  return startMs >= vonStartMs && startMs <= bisEndMs;
}

/**
 * @param {CalendarEvent[]} events
 * @returns {string[]}
 */
export function extractMitarbeiterFromEvents(events) {
  const set = new Set();
  for (const e of events) {
    if (!e || !Array.isArray(e.mitarbeiterIds)) continue;
    for (const id of e.mitarbeiterIds) {
      if (id != null && String(id).trim() !== '') set.add(String(id).trim());
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * Eine lineare Passierung O(n); Sets für O(1)-Lookups pro Event.
 *
 * @param {CalendarEvent[]} events
 * @param {KalenderFilterState} filterState
 * @returns {CalendarEvent[]}
 */
export function filterCalendarEvents(events, filterState) {
  if (!Array.isArray(events)) return [];
  const fs = filterState || createDefaultKalenderFilterState();

  const activeKat = Array.isArray(fs.kategorien) ? fs.kategorien : [];
  const katSet = new Set(
    activeKat.filter(k => KALENDER_KATEGORIE_IDS.includes(/** @type {KalenderKategorieId} */ (k))),
  );
  if (katSet.size === 0) return [];

  /** @type {Set<string>} */
  const allowedTyps = new Set();
  for (const kid of katSet) {
    const arr = KALENDER_KATEGORIE_TYPEN[/** @type {KalenderKategorieId} */ (kid)];
    if (arr) for (const t of arr) allowedTyps.add(t);
  }

  const vonStr = fs.zeitraumVon;
  const bisStr = fs.zeitraumBis;
  const useZeitraum = isValidYmd(vonStr) && isValidYmd(bisStr);

  /** @type {CalendarEvent[]} */
  const out = [];
  for (const e of events) {
    if (!e) continue;
    const typNorm = String(e.typ ?? '')
      .trim()
      .toLowerCase();
    if (!allowedTyps.has(typNorm)) continue;
    if (useZeitraum && !eventInBerlinZeitraum(e, /** @type {string} */ (vonStr), /** @type {string} */ (bisStr)))
      continue;
    out.push(e);
  }

  if (typeof globalThis !== 'undefined' && globalThis.__CCW_DEBUG_KALENDER_FILTER__ === true) {
    console.log('[ccw-calendar-event-filter] filterCalendarEvents', {
      inCount: events.length,
      outCount: out.length,
      kategorien: [...activeKat],
      zeitraum: { von: vonStr, bis: bisStr, useZeitraum },
      allowedTyps: [...allowedTyps],
      sampleIn: events.slice(0, 5).map(ev => ({
        typ: ev.typ,
        typNorm: String(ev.typ ?? '')
          .trim()
          .toLowerCase(),
        start: ev.start,
        ganztag: ev.ganztag,
        inRange: useZeitraum ? eventInBerlinZeitraum(ev, String(vonStr), String(bisStr)) : null,
        typOk: allowedTyps.has(
          String(ev.typ ?? '')
            .trim()
            .toLowerCase(),
        ),
      })),
    });
  }

  return out;
}
