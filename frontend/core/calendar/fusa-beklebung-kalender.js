/**
 * FUSA-Aufträge im Kalender: ein Beklebungstag aus `fusa_extra_json.beklebung_termin` —
 * nicht aus `termin` / `termin_ende` (Werbelaufzeit).
 *
 * Felder in `fusa_extra_json`:
 * - `beklebung_termin`: ISO `YYYY-MM-DD` — einzige Kalenderdatums-Quelle
 * - `beklebungstermin_status` (fachlich auch „Beklebungstermin-Status“): nur `geplant` | `bestaetigt` | `verschoben` (Synonym: `bestätigt`)
 * - `werkstatt_label`, `werkstatt_email` (Metadaten, nicht für das Datum)
 * - `montage_wunschtermin`: optional, kein Kalender-Ersatz für `beklebung_termin`
 */

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function parseFusaExtraJson(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' ? /** @type {Record<string, unknown>} */ (o) : {};
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, unknown>} row — Rohzeile API / DB-Shape (snake_case)
 * @returns {boolean}
 */
export function isFusaAuftragKalenderKandidat(row) {
  if (!row || typeof row !== 'object') return false;
  const o = /** @type {Record<string, unknown>} */ (row);
  const orig = o.fusa_original_id != null && String(o.fusa_original_id).trim() !== '';
  const kunde = o.fusa_kunde_id != null && String(o.fusa_kunde_id).trim() !== '';
  const fz = o.fusa_fahrzeug_ids != null && String(o.fusa_fahrzeug_ids).trim() !== '' && String(o.fusa_fahrzeug_ids).trim() !== '[]';
  const ex = o.fusa_extra_json != null && String(o.fusa_extra_json).trim() !== '' && String(o.fusa_extra_json).trim() !== '{}';
  return Boolean(orig || kunde || fz || ex);
}

/**
 * @param {unknown} v
 * @returns {string|null} YYYY-MM-DD oder null
 */
function toYmd(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeBeklebungsterminStatus(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (s === 'bestätigt') return 'bestaetigt';
  return s;
}

/**
 * Kalender sichtbar für geplant / bestätigt / verschoben (nicht für leeres Datum, nicht für `offen`).
 * @param {unknown} raw
 */
export function beklebungsterminZeigtImKalender(raw) {
  const n = normalizeBeklebungsterminStatus(raw);
  return n === 'geplant' || n === 'bestaetigt' || n === 'verschoben';
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function beklebungsterminIstBestaetigt(raw) {
  return normalizeBeklebungsterminStatus(raw) === 'bestaetigt';
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
function beklebungStatusKurzlabel(raw) {
  const n = normalizeBeklebungsterminStatus(raw);
  if (n === 'geplant') return 'Montage geplant';
  if (n === 'verschoben') return 'Montage verschoben';
  if (n === 'bestaetigt') return 'Montage bestätigt';
  return null;
}

/**
 * Liefert für FUSA-Aufträge **nur** einen Kalendereintrag aus `beklebung_termin` + zulässigem Status.
 * Ohne gültigen Beklebungstag/-status: `null` (kein Ersatz aus Werbe-`termin` / anderen Datumsfeldern).
 *
 * @param {Record<string, unknown>} row
 * @returns {{ termin: string, terminEnde: string, beklebungStatusLabel: string|null } | null}
 */
export function getFusaKalenderTerminFuerKernel(row) {
  if (!isFusaAuftragKalenderKandidat(row)) return null;
  const extra = parseFusaExtraJson(/** @type {Record<string, unknown>} */ (row).fusa_extra_json);
  const st = extra.beklebungstermin_status ?? extra.beklebungsterminStatus;
  if (!beklebungsterminZeigtImKalender(st)) return null;
  const bekRaw = extra.beklebung_termin ?? extra.beklebungTermin;
  if (bekRaw == null || String(bekRaw).trim() === '') return null;
  const bekTrim = String(bekRaw).trim();
  const hasClock =
    bekTrim.includes('T') || /\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(bekTrim);
  if (hasClock) {
    const ds = new Date(bekTrim);
    if (Number.isNaN(ds.getTime())) return null;
    const endRaw = extra.beklebung_termin_ende ?? extra.beklebungTerminEnde;
    let de =
      endRaw != null && String(endRaw).trim() !== '' ? new Date(String(endRaw).trim()) : null;
    if (!de || Number.isNaN(de.getTime()) || de.getTime() <= ds.getTime()) {
      de = new Date(ds.getTime() + 60 * 60 * 1000);
    }
    const label = beklebungStatusKurzlabel(st);
    return { termin: ds.toISOString(), terminEnde: de.toISOString(), beklebungStatusLabel: label };
  }
  const d = toYmd(bekTrim);
  if (!d) return null;
  const label = beklebungStatusKurzlabel(st);
  return { termin: d, terminEnde: d, beklebungStatusLabel: label };
}
