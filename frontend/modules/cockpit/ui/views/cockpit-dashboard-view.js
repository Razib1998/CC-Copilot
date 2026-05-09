/**
 * Cockpit-Dashboard — Übersicht aus API / gleicher Kalender-Pipeline.
 */
import { apiFetch, formatApiErrorForUi, syncCockpitAccessibleProjectsCache } from '../../../../core/auth/cc-auth-session.js';
import { buildValidatedCalendarEventsFromStateSnapshot } from '../../../../core/calendar/ccw-calendar-unified-map.js';
import { cockpitKalenderRasterListenTitel } from '../../../../core/calendar/ccw-calendar-event-mapper.js';
import { isEventStartOnBerlinToday } from '../../../../core/calendar/ccw-calendar-event-filter.js';
import { openCalendarEventDetail } from '../../../../core/calendar/ccw-calendar-event-detail.js';
import { canonicalInvitationStatus } from './cockpit-einladungen-view.js';

/** @typedef {import('../../../../core/calendar/ccw-calendar-event-foundation.js').CalendarEvent} CalendarEvent */

/** @type {Map<string, CalendarEvent>} */
let dashboardCalDetailById = new Map();

/** @type {AbortController | null} */
let dashboardClickAbort = null;

const _DASH_DE_TIME_FMT = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  minute: '2-digit',
});

const _DASH_DE_TODAY_LABEL_FMT = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object} u
 * @returns {{ name: string, rolle: string }}
 */
function userNameAndRole(u) {
  if (!u || typeof u !== 'object') return { name: '', rolle: '' };
  const name =
    u.name != null && String(u.name).trim() !== ''
      ? String(u.name).trim()
      : u.displayName != null && String(u.displayName).trim() !== ''
        ? String(u.displayName).trim()
        : u.email != null && String(u.email).trim() !== ''
          ? String(u.email).trim()
          : u.id != null && String(u.id).trim() !== ''
            ? String(u.id).trim()
            : '';
  const rolleRaw = u.rolle ?? u.role ?? u.rolleName;
  const rolle = rolleRaw != null && String(rolleRaw).trim() !== '' ? String(rolleRaw).trim() : '';
  return { name, rolle };
}

/**
 * @param {string|null|undefined} iso
 * @returns {string}
 */
function formatDeTimeIfPresent(iso) {
  if (iso == null || String(iso).trim() === '') return '';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '';
  return _DASH_DE_TIME_FMT.format(d);
}

function berlinTodayLabel() {
  return _DASH_DE_TODAY_LABEL_FMT.format(new Date());
}

/** Max. Projekte für Einladungs-Aggregation — vermeidet Minuten-Latenz bei vielen Projekten (vorher strikt sequentiell). */
const DASHBOARD_INVITES_PROJECT_CAP = 40;

async function loadDashboardInvitesAggregated() {
  const all = [];
  try {
    const { projects } = await apiFetch('/projects');
    const list = (projects || []).filter(p => p?.id).slice(0, DASHBOARD_INVITES_PROJECT_CAP);
    const batches = await Promise.all(
      list.map(async p => {
        try {
          const r = await apiFetch(`/projects/${encodeURIComponent(String(p.id))}/invites`);
          return Array.isArray(r.invites) ? r.invites : [];
        } catch {
          return [];
        }
      }),
    );
    for (const invites of batches) {
      for (const inv of invites) {
        if (inv && typeof inv === 'object') all.push(inv);
      }
    }
  } catch {
    /* */
  }
  return all;
}

/**
 * @returns {Promise<string>}
 */
export async function renderCockpitDashboardViewHtml() {
  dashboardCalDetailById = new Map();

  let fetchErr = '';
  /** @type {object[]} */
  let projects = [];
  /** @type {object[]} */
  let topAuftraegeRaw = [];
  /** @type {object[]} */
  let apiUsers = [];
  try {
    const pr = await apiFetch('/projects');
    projects = Array.isArray(pr.projects) ? pr.projects : [];
    syncCockpitAccessibleProjectsCache(projects);
  } catch (e) {
    fetchErr = formatApiErrorForUi(e);
  }
  try {
    const ar = await apiFetch('/auftraege');
    topAuftraegeRaw = Array.isArray(ar.auftraege) ? ar.auftraege : [];
  } catch (e) {
    if (!fetchErr) fetchErr = formatApiErrorForUi(e);
  }
  try {
    const ur = await apiFetch('/users');
    apiUsers = Array.isArray(ur?.data?.users ?? ur?.users) ? (ur?.data?.users ?? ur?.users ?? []) : [];
  } catch (e) {
    if (!fetchErr) fetchErr = formatApiErrorForUi(e);
  }

  const topAuftraege = topAuftraegeRaw.map(a => {
    if (!a || typeof a !== 'object' || a.id == null) return null;
    const title = a.title != null && String(a.title).trim() !== '' ? String(a.title).trim() : String(a.id);
    const pid = a.project_id != null ? String(a.project_id) : '';
    return {
      id: a.id,
      name: title,
      title,
      projektId: pid,
      projectId: pid,
      status: a.status ?? null,
      termin: a.termin ?? null,
      terminEnde: a.termin ?? null,
    };
  });
  const topAuftraegeClean = /** @type {object[]} */ (topAuftraege.filter(Boolean));

  const snapshotUsers = apiUsers;
  const snapshotInvitations = await loadDashboardInvitesAggregated();
  const kpiEinladungenOffen = snapshotInvitations.filter(
    inv => canonicalInvitationStatus(inv) === 'offen',
  ).length;

  /** @type {CalendarEvent[]} */
  let todayEvents = [];
  try {
    const allCal = buildValidatedCalendarEventsFromStateSnapshot({
      projects,
      auftraege: topAuftraegeClean,
    });
    todayEvents = allCal.filter(isEventStartOnBerlinToday);
    for (const ev of todayEvents) {
      if (ev && ev.eventId) dashboardCalDetailById.set(String(ev.eventId), ev);
    }
  } catch {
    todayEvents = [];
  }

  const kpiTermine = todayEvents.length;
  const kpiUser = snapshotUsers.length;

  const dashLink = (key, label) =>
    `<button type="button" class="ckp-dash-all" data-nav-key="${esc(key)}">${esc(label)}</button>`;

  const terminRows =
    todayEvents.length === 0
      ? `<p class="ckp-dash-empty">Keine Daten vorhanden</p>`
      : `<ul class="ckp-dash-list ckp-dash-list--termin" role="list">
${todayEvents
  .slice(0, 12)
  .map(ev => {
    const id = ev.eventId ? String(ev.eventId) : '';
    const t = formatDeTimeIfPresent(ev.start);
    const timeLabel = t || '—';
    const titleRaw = cockpitKalenderRasterListenTitel(ev);
    const title = titleRaw !== '' ? titleRaw : '—';
    const interactive = id !== '';
    const barColors = ['orange', 'blue', 'green'];
    const barColor = barColors[todayEvents.indexOf(ev) % barColors.length];
    return `<li class="ckp-dash-termin-row${interactive ? ' ckp-dash-termin-row--action' : ''}"${interactive ? ' tabindex="0" role="button"' : ''} data-event-id="${esc(id)}">
  <span class="ckp-dash-termin-bar ckp-dash-termin-bar--${barColor}" aria-hidden="true"></span>
  <span class="ckp-dash-termin-time">${esc(timeLabel)}</span>
  <span class="ckp-dash-termin-info"><span class="ckp-dash-termin-title">${esc(title)}</span></span>
</li>`;
  })
  .join('\n')}
</ul>`;

  const avatarColors = ['blue', 'purple', 'green', 'orange', 'red'];

  const userRows =
    snapshotUsers.length === 0
      ? `<p class="ckp-dash-empty">Keine Daten vorhanden</p>`
      : `<ul class="ckp-dash-list" role="list">
${snapshotUsers
  .slice(0, 8)
  .map((u, idx) => {
    const { name, rolle } = userNameAndRole(u);
    const nameDisp = name || '—';
    const rolleDisp = rolle || '—';
    const initials = nameDisp
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('');
    const avColor = avatarColors[idx % avatarColors.length];
    return `<li class="ckp-dash-row ckp-dash-row--h">
  <span class="ckp-dash-avatar ckp-dash-avatar--${avColor}" aria-hidden="true">${esc(initials || '?')}</span>
  <div class="ckp-dash-row-info">
    <span class="ckp-dash-row__title">${esc(nameDisp)}</span>
    <span class="ckp-dash-row__sub">${esc(rolleDisp)}</span>
  </div>
</li>`;
  })
  .join('\n')}
</ul>`;

  const invitationPanelBody =
    snapshotInvitations.length === 0
      ? `<p class="ckp-dash-empty">Keine Einladungen (API)</p>`
      : `<p class="ckp-dash-inv-summary">${esc(String(snapshotInvitations.length))} Einladungen gesamt, ${esc(String(kpiEinladungenOffen))} offen.</p>
<ul class="ckp-dash-list" role="list">
${snapshotInvitations
  .slice(0, 6)
  .map(inv => {
    const em =
      inv.email != null && String(inv.email).trim() !== ''
        ? String(inv.email).trim()
        : '—';
    const st = canonicalInvitationStatus(inv);
    return `<li class="ckp-dash-row ckp-dash-row--h">
  <div class="ckp-dash-row-info">
    <span class="ckp-dash-row__title">${esc(em)}</span>
    <span class="ckp-dash-row__sub">${esc(st)}</span>
  </div>
</li>`;
  })
  .join('\n')}
</ul>`;

  return `<div class="ckp-dash" data-ccw-ro="cockpit-dashboard">
  ${fetchErr ? `<p class="ckp-api-error" role="alert">${esc(fetchErr)}</p>` : ''}
  <div class="ckp-dash-header">
    <div>
      <p class="ckp-dash-title">Übersicht</p>
      <p class="ckp-dash-sub">Daten aus API (read-only)</p>
    </div>
    <p class="ckp-dash-date">${esc(berlinTodayLabel())}</p>
  </div>

  <div class="ckp-dash-kpi" role="group" aria-label="Kennzahlen">
    <button type="button" class="ckp-dash-kpi-card ckp-dash-kpi-card--nav" data-nav-key="kalender">
      <span class="ckp-dash-kpi-icon ckp-dash-kpi-icon--green" aria-hidden="true">📅</span>
      <span class="ckp-dash-kpi-value">${kpiTermine}</span>
      <span class="ckp-dash-kpi-label">Termine heute</span>
    </button>
    <button type="button" class="ckp-dash-kpi-card ckp-dash-kpi-card--nav" data-nav-key="users" data-ccw-user-filter-status="aktiv">
      <span class="ckp-dash-kpi-icon ckp-dash-kpi-icon--purple" aria-hidden="true">👥</span>
      <span class="ckp-dash-kpi-value">${kpiUser}</span>
      <span class="ckp-dash-kpi-label">Aktive Benutzer</span>
    </button>
  </div>

  <div class="ckp-dash-grid" aria-label="Dashboard-Bereiche">
    <section class="ckp-dash-panel ckp-dash-panel--termine" aria-labelledby="ckp-dash-term">
      <div class="ckp-dash-panel__head">
        <h3 class="ckp-dash-panel__title" id="ckp-dash-term">Termine heute</h3>
        ${dashLink('kalender', 'Zum Kalender')}
      </div>
      <div class="ckp-dash-panel__body ckp-dash-panel__body--termine">${terminRows}</div>
    </section>
    <div class="ckp-dash-stack">
      <section class="ckp-dash-panel" aria-labelledby="ckp-dash-user">
        <div class="ckp-dash-panel__head">
          <h3 class="ckp-dash-panel__title" id="ckp-dash-user">Benutzer (API)</h3>
          <span class="ckp-dash-panel__links">
            ${dashLink('users', 'Alle anzeigen')}
            <button type="button" class="ckp-dash-all" data-nav-key="users" data-ccw-user-filter-access="cc_intern_app">CC Intern App</button>
          </span>
        </div>
        <div class="ckp-dash-panel__body ckp-dash-panel__body--scroll">${userRows}</div>
      </section>
      <section class="ckp-dash-panel" aria-labelledby="ckp-dash-inv">
        <div class="ckp-dash-panel__head">
          <h3 class="ckp-dash-panel__title" id="ckp-dash-inv">Einladungen</h3>
          <span class="ckp-dash-panel__links">
            <button type="button" class="ckp-dash-all" data-nav-key="einladungen">Alle anzeigen</button>
            <button type="button" class="ckp-dash-all" data-nav-key="einladungen" data-ccw-invitation-filter-status="abgelaufen">Abgelaufen</button>
            <button type="button" class="ckp-dash-all" data-nav-key="einladungen" data-ccw-invitation-filter-status="widerrufen">Widerrufen</button>
          </span>
        </div>
        <div class="ckp-dash-panel__body ckp-dash-panel__body--scroll">${invitationPanelBody}</div>
      </section>
      <section class="ckp-dash-panel" aria-labelledby="ckp-dash-sys">
        <h3 class="ckp-dash-panel__title" id="ckp-dash-sys">System-Status</h3>
        <div class="ckp-dash-panel__body ckp-dash-sys">
          <div class="ckp-dash-sys-row"><span>Datenquelle</span><span>API</span></div>
          <div class="ckp-dash-sys-row"><span>Backend</span><span>verbunden</span></div>
          <div class="ckp-dash-sys-row"><span>API</span><span>aktiv</span></div>
        </div>
      </section>
    </div>
  </div>
</div>`;
}

/**
 * @param {ParentNode|null|undefined} root
 */
export function attachCockpitDashboardHandlers(root) {
  if (typeof document === 'undefined' || !root || typeof root.addEventListener !== 'function') return;
  if (dashboardClickAbort) dashboardClickAbort.abort();
  dashboardClickAbort = new AbortController();
  const sig = dashboardClickAbort.signal;

  /** Kalender-Detail: `openCalendarEventDetail` erwartet ein CalendarEvent-Objekt — Auflösung per eventId über `dashboardCalDetailById`. */
  function openById(id) {
    if (!id) return;
    const cal = dashboardCalDetailById.get(id);
    if (cal) openCalendarEventDetail(cal);
  }

  root.addEventListener(
    'click',
    ev => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      const host = t.closest('[data-ccw-ro="cockpit-dashboard"]');
      if (!host) return;
      const row = t.closest('.ckp-dash-termin-row[data-event-id]');
      if (row) {
        const id = row.getAttribute('data-event-id');
        if (id) openById(id);
      }
    },
    { signal: sig },
  );

  root.addEventListener(
    'keydown',
    ev => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (!t.closest('[data-ccw-ro="cockpit-dashboard"]')) return;
      if (!t.classList.contains('ckp-dash-termin-row')) return;
      const id = t.getAttribute('data-event-id');
      if (!id) return;
      ev.preventDefault();
      openById(id);
    },
    { signal: sig },
  );
}
