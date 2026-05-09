/**
 * Drag & Drop nur Wochenraster: zeitgebundene Termine, Snap 30 Min, Dauer erhalten.
 * Keine Monats-/Listen-Logik, kein Resize, kein Ganztägig-Ziel.
 *
 * @typedef {import('../../../../core/calendar/ccw-calendar-event-foundation.js').CalendarEvent} CalendarEvent
 */

const DRAG_THRESHOLD_PX = 6;

/**
 * @param {EventTarget|null} t
 * @returns {Element|null}
 */
function pointerEventTargetElement(t) {
  if (t instanceof Element) return t;
  if (t instanceof Text && t.parentElement) return t.parentElement;
  return null;
}

/**
 * @param {HTMLElement} el
 * @returns {string|null|undefined}
 */
function readKalDraggableValue(el) {
  const a = el.getAttribute('data-ccw-kal-draggable');
  if (a != null && String(a).trim() !== '') return String(a).trim();
  const d = el.dataset.ccwKalDraggable;
  return d;
}

/**
 * @typedef {object} CockpitKalenderWeekDragDeps
 * @property {(id: string) => CalendarEvent|undefined} getEventById
 * @property {(ev: CalendarEvent) => boolean} isDraggable
 * @property {(ev: CalendarEvent, newStartMs: number, newEndMs: number) => void | Promise<void>} commitMove
 * @property {() => boolean} isMonthView
 * @property {(ymd: string) => boolean} isYmdInCurrentWeek
 * @property {() => number} getStartHour
 * @property {() => number} getEndHourExclusive
 * @property {() => number} getRowHeightPx
 * @property {(ymd: string) => number} gridBerlinMidnightMs
 * @property {(ymd: string, hour: number) => number} gridBerlinWallHourMs
 * @property {(ms: number) => string} gridBerlinYmdFromDate
 * @property {((phase: string, data: Record<string, unknown>) => void) | undefined} debugLog
 */

/**
 * @param {ParentNode} root
 * @param {CockpitKalenderWeekDragDeps} deps
 * @param {{ signal: AbortSignal }} opts
 */
export function attachCockpitKalenderWeekDragHandlersImpl(root, deps, opts) {
  if (typeof document === 'undefined' || !root || typeof root.addEventListener !== 'function') return;

  function getScrollEl() {
    const el = root.querySelector('.ccw-cockpit-kal20-scroll');
    return el instanceof HTMLElement ? el : null;
  }

  /** @type {AbortController|null} */
  let sessionAc = null;

  /** @type {AbortController|null} */
  let escapeAc = null;

  /** @type {HTMLElement|null} */
  let dragTargetColEl = null;

  /** @type {HTMLElement|null} */
  let dragTargetBodyEl = null;

  /** @type {{ el: HTMLElement, ev: CalendarEvent, ghost: HTMLElement|null, pointerId: number, sx: number, sy: number, dragging: boolean, scrollEl: HTMLElement } | null} */
  let dragState = null;

  function abortEscapeListeners() {
    if (escapeAc) {
      escapeAc.abort();
      escapeAc = null;
    }
  }

  function abortSessionListeners() {
    abortEscapeListeners();
    if (sessionAc) {
      sessionAc.abort();
      sessionAc = null;
    }
  }

  function clearDragTargetHighlight() {
    if (dragTargetColEl) {
      dragTargetColEl.classList.remove('ccw-cockpit-kal20-day-col--drag-target');
      dragTargetColEl = null;
    }
    if (dragTargetBodyEl) {
      dragTargetBodyEl.classList.remove('ccw-cockpit-kal20-day-body--drag-target');
      dragTargetBodyEl = null;
    }
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  function updateDragTargetHighlight(clientX, clientY) {
    if (!dragState?.dragging || !dragState.scrollEl) return;
    const { scrollEl } = dragState;
    const stack = document.elementsFromPoint(clientX, clientY);
    let bodyHit = null;
    for (const node of stack) {
      if (!(node instanceof Element)) continue;
      if (!root.contains(node)) continue;
      if (node.closest('.ccw-cockpit-kal20-week-grid--head')) continue;
      const b = node.closest('.ccw-cockpit-kal20-day-body');
      if (b instanceof HTMLElement && scrollEl.contains(b)) {
        bodyHit = b;
        break;
      }
    }
    const nextBody = bodyHit instanceof HTMLElement ? bodyHit : null;
    const nextCol =
      nextBody && nextBody.closest('.ccw-cockpit-kal20-day-col') instanceof HTMLElement
        ? /** @type {HTMLElement} */ (nextBody.closest('.ccw-cockpit-kal20-day-col'))
        : null;
    if (nextBody === dragTargetBodyEl && nextCol === dragTargetColEl) return;
    clearDragTargetHighlight();
    if (nextCol && nextBody && scrollEl.contains(nextBody)) {
      const ymd = nextCol.getAttribute('data-ccw-kal-ymd');
      if (ymd && deps.isYmdInCurrentWeek(ymd)) {
        nextCol.classList.add('ccw-cockpit-kal20-day-col--drag-target');
        nextBody.classList.add('ccw-cockpit-kal20-day-body--drag-target');
        dragTargetColEl = nextCol;
        dragTargetBodyEl = nextBody;
      }
    }
  }

  function cleanupVisual() {
    clearDragTargetHighlight();
    if (dragState?.ghost && dragState.ghost.parentNode) {
      dragState.ghost.parentNode.removeChild(dragState.ghost);
    }
    if (dragState?.el) {
      dragState.el.classList.remove('ccw-cockpit-kal20-evt--dragging');
      try {
        if (dragState.el.hasPointerCapture(dragState.pointerId)) {
          dragState.el.releasePointerCapture(dragState.pointerId);
        }
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * @param {KeyboardEvent} ke
   */
  function onKeyEscape(ke) {
    if (ke.key !== 'Escape' || !dragState?.dragging) return;
    ke.preventDefault();
    ke.stopPropagation();
    if (typeof deps.debugLog === 'function') {
      deps.debugLog('drag_cancel_escape', { eventId: dragState.ev.eventId });
    }
    cleanupVisual();
    abortSessionListeners();
    dragState = null;
  }

  /**
   * @param {HTMLElement} scrollEl
   * @param {string} ymd
   * @param {number} clientY
   * @param {CalendarEvent} ev
   */
  function computeSnap(scrollEl, ymd, clientY, ev) {
    const col = scrollEl.querySelector(`.ccw-cockpit-kal20-day-col[data-ccw-kal-ymd="${ymd}"]`);
    if (!(col instanceof HTMLElement)) return null;
    const bodyEl = col.querySelector('.ccw-cockpit-kal20-day-body');
    if (!(bodyEl instanceof HTMLElement)) return null;

    const rowH = deps.getRowHeightPx();
    const rowCount = deps.getEndHourExclusive() - deps.getStartHour();
    const bodyH = parseFloat(bodyEl.style.height || '') || rowCount * rowH;
    const br = bodyEl.getBoundingClientRect();
    const px = Math.max(0, Math.min(bodyH, ((clientY - br.top) / Math.max(1, br.height)) * bodyH));

    const pxPerMin = rowH / 60;
    const minutesFromGridTop = px / pxPerMin;
    const minFromMidnight = deps.getStartHour() * 60 + minutesFromGridTop;
    const snapMid = Math.round(minFromMidnight / 30) * 30;

    const newStartMs = deps.gridBerlinMidnightMs(ymd) + snapMid * 60000;
    const origStartMs = new Date(ev.start).getTime();
    const origEndMs = new Date(ev.ende).getTime();
    if (Number.isNaN(origStartMs) || Number.isNaN(origEndMs)) return null;
    const dur = origEndMs - origStartMs;
    const newEndMs = newStartMs + dur;

    const gridStartMs = deps.gridBerlinWallHourMs(ymd, deps.getStartHour());
    const gridEndMs = deps.gridBerlinWallHourMs(ymd, deps.getEndHourExclusive());
    if (newStartMs < gridStartMs || newEndMs > gridEndMs) return null;

    const origYmd = deps.gridBerlinYmdFromDate(origStartMs);
    if (origYmd === ymd && newStartMs === origStartMs) return null;

    return { newStartMs, newEndMs };
  }

  /**
   * @param {PointerEvent} e
   */
  function onPointerDown(e) {
    if (e.button !== 0) return;
    const startTarget = pointerEventTargetElement(e.target);
    if (!startTarget) return;
    if (!startTarget.closest('[data-ccw-ro="cockpit-kalender"]')) return;
    if (deps.isMonthView()) return;

    const scrollEl = getScrollEl();
    if (!scrollEl) return;

    const el = startTarget.closest('.ccw-cockpit-kal20-evt--timed');
    if (!(el instanceof HTMLElement) || !scrollEl.contains(el)) return;

    const dragVal = readKalDraggableValue(el);
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('ccwDebugKalender') === '1' &&
      typeof console !== 'undefined' &&
      console.debug
    ) {
      console.debug('[ccw-kal][drag-check]', el, el.dataset.ccwKalDraggable, dragVal);
    }
    if (dragVal === '0') return;

    const id = el.getAttribute('data-event-id');
    if (!id) return;
    const ev = deps.getEventById(id);
    if (!ev || ev.ganztag === true) return;
    if (typeof deps.isDraggable === 'function' && !deps.isDraggable(ev)) return;

    const origStartMs = new Date(ev.start).getTime();
    const origEndMs = new Date(ev.ende).getTime();
    if (Number.isNaN(origStartMs) || Number.isNaN(origEndMs)) return;

    dragState = {
      el,
      ev,
      ghost: null,
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      dragging: false,
      scrollEl,
    };

    sessionAc = new AbortController();
    const sig = sessionAc.signal;
    document.addEventListener('pointermove', onPointerMove, { signal: sig, capture: true });
    document.addEventListener('pointerup', onPointerUp, { signal: sig, capture: true });
    document.addEventListener('pointercancel', onPointerUp, { signal: sig, capture: true });
  }

  /**
   * @param {PointerEvent} e
   */
  function onPointerMove(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const dx = e.clientX - dragState.sx;
    const dy = e.clientY - dragState.sy;
    const dist = Math.hypot(dx, dy);
    if (!dragState.dragging) {
      if (dist < DRAG_THRESHOLD_PX) return;
      dragState.dragging = true;
      dragState.el.classList.add('ccw-cockpit-kal20-evt--dragging');
      try {
        dragState.el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const r = dragState.el.getBoundingClientRect();
      const ghost = /** @type {HTMLElement} */ (dragState.el.cloneNode(true));
      ghost.classList.add('ccw-cockpit-kal20-evt--drag-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;pointer-events:none;z-index:10001;box-sizing:border-box;margin:0;`;
      document.body.appendChild(ghost);
      dragState.ghost = ghost;
      escapeAc = new AbortController();
      document.addEventListener('keydown', onKeyEscape, { signal: escapeAc.signal, capture: true });
      if (typeof deps.debugLog === 'function') {
        deps.debugLog('drag_start', {
          eventId: dragState.ev.eventId,
          typ: dragState.ev.typ,
          objektTyp: dragState.ev.objektTyp,
          auftragId: dragState.ev.auftragId,
        });
      }
    }
    if (dragState.ghost) {
      const w = dragState.ghost.offsetWidth || 120;
      dragState.ghost.style.left = `${e.clientX - w / 2}px`;
      dragState.ghost.style.top = `${e.clientY - 10}px`;
      updateDragTargetHighlight(e.clientX, e.clientY);
    }
  }

  /**
   * @param {PointerEvent} e
   */
  function onPointerUp(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) {
      clearDragTargetHighlight();
      cleanupVisual();
      abortSessionListeners();
      dragState = null;
      return;
    }

    const { el, ev, dragging, ghost, scrollEl } = dragState;

    if (!dragging) {
      abortSessionListeners();
      dragState = null;
      return;
    }

    clearDragTargetHighlight();

    el.addEventListener(
      'click',
      ce => {
        ce.preventDefault();
        ce.stopPropagation();
      },
      { once: true, capture: true },
    );

    try {
      const stack = document.elementsFromPoint(e.clientX, e.clientY);
      let bodyHit = null;
      for (const node of stack) {
        if (!(node instanceof Element)) continue;
        if (!root.contains(node)) continue;
        if (node.closest('.ccw-cockpit-kal20-week-grid--head')) continue;
        const b = node.closest('.ccw-cockpit-kal20-day-body');
        if (b instanceof HTMLElement && scrollEl.contains(b)) {
          bodyHit = b;
          break;
        }
      }
      if (bodyHit) {
        const col = bodyHit.closest('.ccw-cockpit-kal20-day-col');
        const ymd = col instanceof HTMLElement ? col.getAttribute('data-ccw-kal-ymd') : null;
        if (ymd && deps.isYmdInCurrentWeek(ymd)) {
          const snap = computeSnap(scrollEl, ymd, e.clientY, ev);
          if (snap) {
            const origStart = new Date(ev.start).getTime();
            const origEnd = new Date(ev.ende).getTime();
            if (typeof deps.debugLog === 'function') {
              deps.debugLog('drag_drop', {
                eventId: ev.eventId,
                ymd,
                oldStartMs: origStart,
                oldEndMs: origEnd,
                newStartMs: snap.newStartMs,
                newEndMs: snap.newEndMs,
                typ: ev.typ,
                objektTyp: ev.objektTyp,
                auftragId: ev.auftragId,
              });
            }
            void Promise.resolve(deps.commitMove(ev, snap.newStartMs, snap.newEndMs)).catch(err => {
              console.warn('[CCW-Kalender] commitMove', err);
              if (typeof deps.debugLog === 'function') {
                deps.debugLog('commit_error', { eventId: ev.eventId, message: String(err) });
              }
            });
          }
        }
      }
    } finally {
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      el.classList.remove('ccw-cockpit-kal20-evt--dragging');
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragState = null;
      abortSessionListeners();
    }
  }

  root.addEventListener('pointerdown', onPointerDown, { signal: opts.signal, capture: true });
}
