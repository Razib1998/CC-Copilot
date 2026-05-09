/**
 * Cockpit — gemeinsame Konstanten für Rollen-/Rechte-UI (ohne Rechte-Matrix).
 * Listen- und Detail-UI: {@link ./cockpit-rollen-view.js}.
 */

/** Rechte-Kategorien (später Backend; hier nur Labels). */
export const COCKPIT_ROLES_RIGHT_CATEGORIES = Object.freeze([
  'canView',
  'canCreate',
  'canEdit',
  'canDelete',
  'canUpload',
  'canApprove',
  'canSeePrices',
]);
