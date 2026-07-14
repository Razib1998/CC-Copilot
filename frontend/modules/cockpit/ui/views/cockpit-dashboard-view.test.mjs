import test from 'node:test';
import assert from 'node:assert/strict';

import { selectDashboardUpcomingCalendarEvents } from './cockpit-dashboard-view.js';

function event(eventId, start, typ = 'sonstiges') {
  return { eventId, start, ende: start, typ };
}

test('dashboard shows today and the following six Berlin calendar days', () => {
  const events = [
    event('past', '2026-07-13T10:00:00+02:00'),
    event('today', '2026-07-14T08:00:00+02:00'),
    event('delivery', '2026-07-17T12:00:00+02:00', 'lieferung'),
    event('last-day', '2026-07-20T18:00:00+02:00', 'montage'),
    event('outside', '2026-07-21T08:00:00+02:00'),
  ];

  assert.deepEqual(
    selectDashboardUpcomingCalendarEvents(events, '2026-07-14', 7).map(e => e.eventId),
    ['today', 'delivery', 'last-day'],
  );
});

test('dashboard upcoming events are sorted chronologically across appointment types', () => {
  const events = [
    event('beklebung', '2026-07-16T14:00:00+02:00', 'montage'),
    event('general', '2026-07-14T09:30:00+02:00', 'sonstiges'),
    event('auftrag', '2026-07-15T07:00:00+02:00', 'auftrag'),
  ];

  assert.deepEqual(
    selectDashboardUpcomingCalendarEvents(events, '2026-07-14').map(e => e.eventId),
    ['general', 'auftrag', 'beklebung'],
  );
});
