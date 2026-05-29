import { parseZuYyyymmdd } from './fusa-belegung-verfuegbarkeit.js';

/**
 * @param {number} n YYYYMMDD
 * @returns {string}
 */
function ymdNumToIso(n) {
  const d = n % 100;
  const m = Math.floor(n / 100) % 100;
  const y = Math.floor(n / 10000);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Auftrag termin / termin_ende → normierte ISO-Daten (YYYY-MM-DD) für fusa_belegungen.
 * @param {unknown} termin
 * @param {unknown} terminEnde optional; leer = wie termin (ein Tag)
 */
export function auftragTermineZuBelegungIso(termin, terminEnde) {
  const t0 = parseZuYyyymmdd(termin);
  if (t0 == null) {
    return {
      ok: false,
      code: 'INVALID_TERMIN',
      message:
        'Für Fahrzeugbelegung ist ein gültiges Startdatum (termin) erforderlich: YYYY-MM-DD oder TT.MM.JJJJ.',
    };
  }
  const endeRaw = terminEnde != null && String(terminEnde).trim() !== '' ? terminEnde : termin;
  const t1 = parseZuYyyymmdd(endeRaw);
  if (t1 == null) {
    return {
      ok: false,
      code: 'INVALID_TERMIN_ENDE',
      message:
        'Für Fahrzeugbelegung ist ein gültiges Enddatum (termin_ende) erforderlich: YYYY-MM-DD oder TT.MM.JJJJ.',
    };
  }
  if (t1 < t0) {
    return {
      ok: false,
      code: 'INVALID_RANGE',
      message: 'Enddatum (termin_ende) darf nicht vor dem Startdatum (termin) liegen.',
    };
  }
  return { ok: true, startdatum: ymdNumToIso(t0), enddatum: ymdNumToIso(t1) };
}
