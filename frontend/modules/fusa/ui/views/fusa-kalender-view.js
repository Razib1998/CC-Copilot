/**

 * FUSA — Kalender-View (Liste). Unified-Map unter `frontend/core/calendar/`.

 *

 * Abhängigkeit: `../../fusa-ui-shared.js` (= `frontend/modules/fusa/fusa-ui-shared.js`)

 * — bitte aus DEV übernehmen, wenn die View eingebunden wird (noch nicht im Zielrepo).

 */

import { esc, renderFusaActionToolbarHtml, renderFusaEmptyStateHtml } from '../../fusa-ui-shared.js';
import { loadMyRights, myRight } from '../../../../core/access/cc-my-rights.js';

import { buildUnifiedCcwCalendarEventsFromAppState, buildUnifiedCcwCalendarEventsFromStateSnapshot } from '../../../../core/calendar/ccw-calendar-unified-map.js';
import { getCalendarFeedFromApi } from '../../../../core/data/dev-calendar-read-model.js';



/**

 * Kalender-Events: nur Unified-Map aus dem zentralen Auftrags-Feed.

 * @param {string} projectId

 * @param {import('../../fusa-data-port.js').FusaDataPort} dataPort

 */

async function loadFusaKalenderEvents(projectId, dataPort) {
  let unifiedAll = buildUnifiedCcwCalendarEventsFromAppState();

  const apiFeed = await getCalendarFeedFromApi(projectId);

  let effectiveProjectId = projectId;

  if (apiFeed) {

    unifiedAll = buildUnifiedCcwCalendarEventsFromStateSnapshot({

      projects: apiFeed.projects,

      auftraege: apiFeed.auftraege,

    });

    effectiveProjectId = apiFeed.effectiveProjectId;

  }

  const fromUnified = unifiedAll.filter(ev => ev.projectId === effectiveProjectId);



  if (fromUnified.length > 0) {

    return fromUnified;

  }
  return [];

}



/** Entfernt Einträge mit ungültigen Zeiten (API-Fallback, kaputte Payloads) — Unified-Map liefert hier i. d. R. schon valide ISO. */

function sanitizeFusaKalenderEvents(events) {

  if (!Array.isArray(events)) return [];

  return events.filter(ev => {

    if (!ev || typeof ev !== 'object') return false;

    if (ev.id == null || String(ev.id).trim() === '') return false;

    const s = ev.start;

    const e = ev.end;

    if (s == null || e == null || String(s).trim() === '' || String(e).trim() === '') return false;

    const t0 = new Date(s).getTime();

    const t1 = new Date(e).getTime();

    if (!Number.isFinite(t0) || !Number.isFinite(t1)) return false;

    if (t1 < t0) return false;

    return true;

  });

}



function formatDeRange(startIso, endIso) {

  const opt = { dateStyle: 'short', timeStyle: 'short' };

  try {

    const a = new Date(startIso);

    const b = new Date(endIso);

    if (Number.isNaN(a.getTime())) return '—';

    const s1 = a.toLocaleString('de-DE', opt);

    if (Number.isNaN(b.getTime())) return s1;

    const s2 = b.toLocaleString('de-DE', opt);

    return `${s1} – ${s2}`;

  } catch {

    return '—';

  }

}



function resourceText(r) {

  if (!r || typeof r !== 'object') return '—';

  const bits = [];

  if (r.fahrzeugId) bits.push(`Fzg. ${r.fahrzeugId}`);

  if (r.mitarbeiterId) bits.push(`MA ${r.mitarbeiterId}`);

  return bits.length ? bits.join(', ') : '—';

}



/**

 * @param {string|null} projectId

 * @param {Record<string, boolean>} permissions

 * @param {import('../../fusa-data-port.js').FusaDataPort} dataPort

 */

export async function renderFusaKalenderView(projectId, permissions, dataPort) {

  let my = null;
  try {
    my = await loadMyRights();
  } catch {
    my = null;
  }
  const pIn = permissions || {};
  const effectivePerms = my
    ? {
        canView: myRight(my, 'fusa', 'kalender', 'sehen'),
        canEdit: myRight(my, 'fusa', 'kalender', 'bearbeiten'),
        canCreate: myRight(my, 'fusa', 'kalender', 'erstellen'),
        canDelete: myRight(my, 'fusa', 'kalender', 'loeschen'),
        canUpload: myRight(my, 'fusa', 'kalender', 'upload'),
        canApprove: myRight(my, 'fusa', 'kalender', 'freigeben'),
      }
    : { ...pIn };
  const toolbar = renderFusaActionToolbarHtml(effectivePerms);



  if (!projectId) {

    return `<div class="ccw-fusa-view" data-fusa-view="kalender">${toolbar}</div>`;

  }



  const events = sanitizeFusaKalenderEvents(await loadFusaKalenderEvents(projectId, dataPort));



  if (!events.length) {

    return `<div class="ccw-fusa-view" data-fusa-view="kalender">

      ${toolbar}

      ${renderFusaEmptyStateHtml()}

    </div>`;

  }



  const body = events

    .map(ev => {

      return `<tr data-ccw-cal-event-id="${esc(ev.id)}">

        <td>${esc(formatDeRange(ev.start, ev.end))}</td>

        <td>${esc(ev.title)}</td>

        <td>${esc(ev.type)}</td>

        <td>${esc(resourceText(ev.resource))}</td>

      </tr>`;

    })

    .join('');



  return `<div class="ccw-fusa-view" data-fusa-view="kalender">

    ${toolbar}

    <p style="margin:8px 0 4px;font-size:12px;color:var(--muted,#6b7280);line-height:1.45;">

      Chronologische Liste — Quelle: zentrale Unified-Map (App-State + optionale FUSA-Aufträge); falls leer, Fallback auf Port/API. Andere Module können später dieselbe Map nutzen.

    </p>

    <div style="overflow-x:auto;margin-top:8px;">

      <table class="ccw-fusa-table" style="width:100%;border-collapse:collapse;font-size:13px;">

        <thead>

          <tr style="text-align:left;border-bottom:1px solid var(--border,#e5e7eb);">

            <th scope="col">Zeitraum</th>

            <th scope="col">Titel</th>

            <th scope="col">Typ</th>

            <th scope="col">Ressource</th>

          </tr>

        </thead>

        <tbody>${body}</tbody>

      </table>

    </div>

  </div>`;

}

