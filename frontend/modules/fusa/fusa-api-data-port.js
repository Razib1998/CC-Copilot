/**
 * FUSA-Daten-Port über dasselbe Session-`apiFetch` wie das Cockpit.
 *
 * **Aufträge (Listen):** {@link fetchFusaApiAuftraege} → `GET /api/v1/fusa/auftraege`
 * **Rechnungen (Listen):** {@link fetchFusaApiRechnungen} → `GET /api/v1/fusa/rechnungen`
 * (kein paralleles `GET /auftraege`, kein Dateizugriff, kein Migrationsordner zur Laufzeit).
 * Migrations-/Export-Doku liegt außerhalb des Cockpit-Repos und wird hier nicht eingelesen.
 */
import { apiFetch } from '../../core/auth/cc-auth-session.js';
import {
  getFusaKalenderTerminFuerKernel,
  isFusaAuftragKalenderKandidat,
  parseFusaExtraJson,
} from '../../core/calendar/fusa-beklebung-kalender.js';

/**
 * @param {unknown} rawIds
 * @param {Map<string, { kennzeichen?: string; label?: string; name?: string }>} fzById
 * @returns {string}
 */
function fahrzeugKennungenForKalender(rawIds, fzById) {
  if (!fzById || fzById.size === 0) return '';
  let ids = [];
  try {
    const p = typeof rawIds === 'string' ? JSON.parse(rawIds) : rawIds;
    ids = Array.isArray(p) ? p.map(x => String(x).trim()).filter(Boolean) : [];
  } catch {
    return '';
  }
  const parts = [];
  for (const id of ids) {
    const f = fzById.get(String(id));
    const lab =
      f && (f.kennzeichen != null || f.label != null || f.name != null)
        ? String(f.kennzeichen || f.label || f.name).trim()
        : '';
    if (lab) parts.push(lab);
  }
  return parts.join(', ');
}

/**
 * GET `/api/v1/fusa/auftraege` — nur FUSA-importierte Aufträge (Backend).
 * @returns {Promise<object[]>}
 */
export async function fetchFusaApiAuftraege() {
  const r = await apiFetch('/api/v1/fusa/auftraege');
  if (!r || typeof r !== 'object') return [];
  const top = /** @type {any} */ (r).auftraege;
  const nested =
    /** @type {any} */ (r).data && typeof /** @type {any} */ (r).data === 'object'
      ? /** @type {any} */ (r).data.auftraege
      : null;
  const rows = Array.isArray(top) ? top : Array.isArray(nested) ? nested : null;
  return Array.isArray(rows) ? rows : [];
}

/**
 * GET `/api/v1/fusa/rechnungen` — importierte FUSA-Rechnungen (Backend).
 * @returns {Promise<object[]>}
 */
export async function fetchFusaApiRechnungen() {
  const r = await apiFetch('/api/v1/fusa/rechnungen');
  return Array.isArray(r?.data?.rechnungen) ? r.data.rechnungen : [];
}

/**
 * @param {object} row
 * @param {Map<string, { kennzeichen?: string; label?: string; name?: string }>} [fzById]
 * @returns {import('./fusa-data-port.js').FusaAuftragRow}
 */
function mapAuftragToFusaRow(row, fzById) {
  if (!row || typeof row !== 'object') {
    return {
      id: '',
      name: '',
      typ: '',
      status: '',
      source: 'auftraege',
      termin: null,
      terminEnde: null,
      betragCent: null,
      abrechnungStatus: null,
    };
  }
  const firmaRaw = row.firma_id != null ? String(row.firma_id).trim() : '';
  const firmaCamel = row.firmaId != null ? String(row.firmaId).trim() : '';
  const firmaFusa = row.fusa_kunde_id != null ? String(row.fusa_kunde_id).trim() : '';
  const firmaId = firmaRaw || firmaCamel || firmaFusa || undefined;
  const kunde_name =
    row.kunde_name != null && String(row.kunde_name).trim() !== ''
      ? String(row.kunde_name).trim()
      : undefined;
  const rowRec = /** @type {Record<string, unknown>} */ (row && typeof row === 'object' ? row : {});
  const isFusaCand = isFusaAuftragKalenderKandidat(rowRec);
  const fusaKal = isFusaCand ? getFusaKalenderTerminFuerKernel(rowRec) : null;
  const terminKern = fusaKal?.termin ?? row.termin_start ?? row.termin ?? null;
  const terminEndeKern = fusaKal?.terminEnde ?? row.termin_ende ?? row.terminEnde ?? null;

  const extra = parseFusaExtraJson(row.fusa_extra_json ?? row.extra_json ?? null);
  const betragCent =
    row.betrag_cent != null ? Number(row.betrag_cent) :
    row.betragCent != null ? Number(row.betragCent) : null;
  const abrechnungStatus =
    extra?.abrechnungStatus ?? row.abrechnung_status ?? row.abrechnungStatus ?? null;

  return {
    id:   String(row.id ?? row._id ?? '').trim(),
    name: String(row.name ?? row.titel ?? row.auftrag_name ?? '').trim() || '—',
    typ:  String(row.typ ?? extra?.typ ?? '').trim(),
    status: String(row.status ?? '').trim(),
    source: 'auftraege',
    termin:     terminKern     != null ? String(terminKern)     : null,
    terminEnde: terminEndeKern != null ? String(terminEndeKern) : null,
    betragCent: Number.isFinite(betragCent) ? betragCent : null,
    abrechnungStatus: abrechnungStatus != null ? String(abrechnungStatus) : null,
    ...(firmaId !== undefined   ? { firmaId }   : {}),
    ...(kunde_name !== undefined ? { kunde_name } : {}),
    fahrzeugKennungen: fahrzeugKennungenForKalender(row.fahrzeug_ids ?? row.fahrzeugIds ?? null, fzById ?? new Map()),
  };
}