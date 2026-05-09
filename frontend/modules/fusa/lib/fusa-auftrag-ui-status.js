/**
 * Zentrale UI-Statuslogik für FUSA-Aufträge (Liste, KPI, Filter, Badges, Detail).
 *
 * **Priorität der Quellen** (von oben nach unten; erste passende Regel gewinnt):
 * 1. Top-Level `status` — Abgeschlossen-Whitelist
 * 2. `fusa_extra_json.entwurf === true` oder Status „Entwurf“
 * 3. Top-Level `status` — In Produktion (Substring-Liste, z. B. „In Produktion“, „Montage“)
 * 4. Top-Level `status` — expliziter Text „endet bald“ / „Endet bald“
 * 5. Enddatum (`termin_ende` / Extra-Felder) — **0…90 Tage** ab heute (lokal), wenn nicht abgeschlossen/Entwurf
 * 6. Top-Level `status` — Aktiv-Whitelist (Wizard final: `Aktiv`)
 * 7. Sonst → `unknown` (nur Filter „Alle“)
 *
 * **Filter-Tab-Schlüssel** (`filterTab`): `aktiv` | `in_produktion` | `endet_bald` | `abgeschlossen` | `entwurf` | `unknown`
 * — KPI und Zeilenfilter nutzen **dieselbe** {@link resolveFusaAuftragUiStatus}-Ausgabe.
 *
 * @module fusa-auftrag-ui-status
 */

/** @typedef {'aktiv'|'in_produktion'|'endet_bald'|'abgeschlossen'|'entwurf'|'unknown'} FusaAuftragUiBucket */

const NORM = s => String(s ?? '').trim().toLowerCase();

/** DB/API-Statuswerte → abgeschlossen (exakt nach Normalisierung, ohne Substring-Fallen). */
const STATUS_ABGESCHLOSSEN = new Set(
  [
    'abgeschlossen',
    'beendet',
    'erledigt',
    'storniert',
    'archiviert',
    'abgelehnt',
    'geschlossen',
    'aufgehoben',
  ].map(NORM),
);

/** Produktion / Montage (Substring auf normalisiertem String). */
const SUBSTR_IN_PRODUKTION = ['in produktion', 'produktion', 'in montage', 'montage', 'beklebung', 'werbung aktiv'];

/** Aktiv / laufend (Wizard-Default „Aktiv“ + übliche Varianten). */
const STATUS_AKTIV = new Set(
  ['aktiv', 'laufend', 'läuft', 'genehmigt', 'freigegeben', 'buchbar', 'gebucht'].map(NORM),
);

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function parseExtra(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? /** @type {Record<string, unknown>} */ (o) : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} ymd
 * @returns {Date|null} lokales Datum 00:00
 */
function parseLocalYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim().slice(0, 10));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

/**
 * @param {Record<string, unknown>} extra
 * @param {object} row
 * @returns {string} '' oder YYYY-MM-DD
 */
function resolveEnddatumYmd(row, extra) {
  const te = row?.termin_ende != null ? String(row.termin_ende).trim().slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(te)) return te;
  const keys = ['auftragsende_ymd', 'enddatum', 'laufzeit_ende', 'termin_ende'];
  for (const k of keys) {
    const v = extra[k];
    if (v == null) continue;
    const s = String(v).trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }
  return '';
}

/**
 * Endet innerhalb der nächsten `tage` (inkl. heute), Enddatum strictly >= heute 00:00.
 * @param {string} endYmd
 * @param {Date} now
 * @param {number} tage
 */
function endetInnerhalbTagen(endYmd, now, tage) {
  const end = parseLocalYmd(endYmd);
  if (!end) return false;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const limit = new Date(startToday);
  limit.setDate(limit.getDate() + tage);
  return end >= startToday && end <= limit;
}

/**
 * @param {FusaAuftragUiBucket} bucket
 * @returns {string} CSS-Klassen wie FUSA-UMZUG (`bdg …`)
 */
export function fusaAuftragBadgeClassesForBucket(bucket) {
  switch (bucket) {
    case 'abgeschlossen':
      return 'bdg bg';
    case 'in_produktion':
      return 'bdg bp';
    case 'endet_bald':
      return 'bdg ba';
    case 'aktiv':
      return 'bdg bb';
    case 'entwurf':
      return 'bdg bgr';
    default:
      return 'bdg bgr';
  }
}

/**
 * @param {object|null|undefined} row API-Zeile / gemergter Auftrag
 * @param {{ now?: Date, endetBaldTage?: number }|undefined} [opt]
 * @returns {{
 *   bucket: FusaAuftragUiBucket,
 *   filterTab: FusaAuftragUiBucket,
 *   statusRaw: string,
 *   enddatumYmd: string,
 *   endetNachDatum: boolean,
 *   reasons: string[],
 * }}
 */
export function resolveFusaAuftragUiStatus(row, opt) {
  const now = opt?.now instanceof Date ? opt.now : new Date();
  const endetBaldTage = opt?.endetBaldTage != null && Number.isFinite(Number(opt.endetBaldTage)) ? Math.max(1, Number(opt.endetBaldTage)) : 90;
  const reasons = [];

  const r = row && typeof row === 'object' ? row : {};
  const extra = parseExtra(r.fusa_extra_json);
  const statusRaw = r.status != null && String(r.status).trim() !== '' ? String(r.status).trim() : '';
  const n = NORM(statusRaw);
  const enddatumYmd = resolveEnddatumYmd(r, extra);
  const entwurfExtra = extra.entwurf === true;
  const entwurfStatus = n === 'entwurf' || /\bentwurf\b/.test(n);

  /** @type {FusaAuftragUiBucket} */
  let bucket = 'unknown';

  if (n && STATUS_ABGESCHLOSSEN.has(n)) {
    bucket = 'abgeschlossen';
    reasons.push('status:abgeschlossen_set');
  } else if (entwurfExtra || entwurfStatus) {
    bucket = 'entwurf';
    reasons.push(entwurfExtra ? 'extra:entwurf' : 'status:entwurf');
  } else if (n && SUBSTR_IN_PRODUKTION.some(s => n.includes(s))) {
    bucket = 'in_produktion';
    reasons.push('status:in_produktion_substr');
  } else if (n && ((n.includes('endet') && n.includes('bald')) || n.includes('endet bald'))) {
    bucket = 'endet_bald';
    reasons.push('status:endet_bald_text');
  } else if (enddatumYmd && endetInnerhalbTagen(enddatumYmd, now, endetBaldTage)) {
    bucket = 'endet_bald';
    reasons.push(`datum:end<=${endetBaldTage}d`);
  } else if (n && STATUS_AKTIV.has(n)) {
    bucket = 'aktiv';
    reasons.push('status:aktiv_set');
  } else if (n) {
    bucket = 'unknown';
    reasons.push('status:unbekannt');
  } else {
    bucket = 'unknown';
    reasons.push('status:leer');
  }

  /** @type {FusaAuftragUiBucket} */
  const filterTab = bucket;

  return { bucket, filterTab, reasons };
}