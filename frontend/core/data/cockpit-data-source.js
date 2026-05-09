/**
 * Zentrale Steuerung: **woher** Read-Only-Daten im Cockpit kommen.
 * Views und Listen entscheiden das nicht — nur diese Konstante (später ggf. Konfiguration).
 *
 * Phase 1: `dev-snapshot`, `fusa`, `cc-intern` — jeweils JSON unter `frontend/data/` (Simulation, keine API).
 */

/**
 * @typedef {'dev-snapshot' | 'fusa' | 'cc-intern' | 'api'} CockpitDataSourceId
 */

/** @type {CockpitDataSourceId} — Test CC-Intern-Simulation: `'cc-intern'`; alternativ `'dev-snapshot'` oder `'fusa'` */
export const COCKPIT_DATA_SOURCE = 'cc-intern';
