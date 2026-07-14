import test from 'node:test';
import assert from 'node:assert/strict';

import { buildValidatedCalendarEventsFromStateSnapshot } from './ccw-calendar-unified-map.js';
import {
  createCockpitGeneralCalendarTermin,
  deleteCockpitGeneralCalendarTermin,
  updateCockpitGeneralCalendarTermin,
} from '../data/dev-calendar-read-model.js';

test('server appointment keeps calendar identity and is not treated as an order', () => {
  const events = buildValidatedCalendarEventsFromStateSnapshot({
    projects: [{ id: 'auftraege-kalender', name: 'Kalender' }],
    auftraege: [
      {
        id: 'server-termin-1',
        name: 'Kundentermin',
        projektId: 'auftraege-kalender',
        projectId: 'auftraege-kalender',
        typ: 'Sonstiges',
        termin: '2026-07-14T08:00:00.000Z',
        terminEnde: '2026-07-14T09:00:00.000Z',
        calendarTerminId: 'server-termin-1',
        calendarTerminTyp: 'allgemein',
        calendarTerminQuelle: 'manuell',
        calendarTerminNotiz: 'Besprechung',
        calendarTerminGanztag: false,
        calendarTerminStandalone: true,
      },
    ],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, 'ccw-cockpit-general-server-termin-1');
  assert.equal(events[0].auftragId, null);
  assert.equal(events[0].titel, 'Kundentermin');
  assert.equal(events[0].cockpitLokalNotiz, 'Besprechung');
  assert.equal(events[0].cockpitCalendarServerManaged, true);
});

test('calendar appointment linked to an order retains its order persistence path', () => {
  const events = buildValidatedCalendarEventsFromStateSnapshot({
    projects: [{ id: 'auftraege-kalender', name: 'Kalender' }],
    auftraege: [
      {
        id: 'calendar-row-1',
        name: 'Montage AU-10',
        projektId: 'auftraege-kalender',
        projectId: 'auftraege-kalender',
        typ: 'Montage',
        termin: '2026-07-14T10:00:00.000Z',
        terminEnde: '2026-07-14T11:00:00.000Z',
        auftragId: 'auftrag-10',
        calendarTerminId: 'calendar-row-1',
        calendarTerminTyp: 'montage',
        calendarTerminQuelle: 'ccintern',
        calendarTerminStandalone: false,
      },
    ],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].auftragId, 'auftrag-10');
  assert.equal(events[0].cockpitCalendarTerminId, 'calendar-row-1');
});

test('general appointment CRUD uses the shared server calendar route', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const method = init.method || 'GET';
    const data = method === 'DELETE' ? { deleted: true } : { termin: { id: 'server-1' } };
    return new Response(JSON.stringify({ success: true, data }), {
      status: method === 'POST' ? 201 : 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await createCockpitGeneralCalendarTermin({
      titel: 'Besprechung',
      start: '2026-07-14T08:00:00.000Z',
      ende: '2026-07-14T09:00:00.000Z',
      notiz: 'Raum 1',
    });
    await updateCockpitGeneralCalendarTermin({
      id: 'server-1',
      titel: 'Besprechung neu',
      start: '2026-07-14T09:00:00.000Z',
      ende: '2026-07-14T10:00:00.000Z',
      notiz: '',
    });
    await deleteCockpitGeneralCalendarTermin('server-1');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests.map(r => r.init.method), ['POST', 'PUT', 'DELETE']);
  assert.match(requests[0].url, /\/api\/v1\/stammdaten\/kalender$/);
  assert.match(requests[1].url, /\/api\/v1\/stammdaten\/kalender\/server-1$/);
  assert.match(requests[2].url, /\/api\/v1\/stammdaten\/kalender\/server-1$/);
  const createBody = JSON.parse(String(requests[0].init.body));
  assert.equal(createBody.typ, 'allgemein');
  assert.equal(createBody.quelle, 'manuell');
  assert.equal(createBody.notiz, 'Raum 1');
  assert.deepEqual(createBody.mitarbeiter_ids, []);
});
