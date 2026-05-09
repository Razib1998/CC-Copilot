/**
 * Read-only: DEV-Snapshot → Eingabe für buildUnifiedCcwCalendarEventsFromStateSnapshot.
 * Keine Mutation der Quelldaten.
 *
 * @see frontend/data/DEV-SNAPSHOT-FORMAT.md — verbindliches Phase-1-Format für dev-snapshot.json
 */

/**
 * @param {unknown} dev
 * @returns {{ projects: object[], auftraege: object[] }}
 */
export function mapDevSnapshotToCalendarInput(dev) {
  if (!dev || typeof dev !== 'object') {
    return { projects: [], auftraege: [] };
  }
  const o = /** @type {Record<string, unknown>} */ (dev);
  return {
    projects: Array.isArray(o.projects) ? o.projects : [],
    auftraege: Array.isArray(o.auftraege) ? o.auftraege : [],
  };
}
