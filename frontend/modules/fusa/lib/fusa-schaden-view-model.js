/**
 * Zentrales Mapping API → View-Modell für FUSA Schäden (keine UI-Strings außer Anzeige-Hilfen).
 * Rohfelder kommen aus `GET/POST/PATCH /schaeden` bzw. `mapSchadenPublic` im Backend.
 */

import {
  normalizeSchadenMeldungStatus,
  normalizeSchadenWerkstattStatus,
  schadenMeldungBadgeClass,
  schadenMeldungLabel,
  schadenRowSearchHaystack,
  schadenWerkstattBadgeClass,
  schadenWerkstattLabel,
  normalizeSchadenTyp,
  schadenTypLabel,
  schadenTypBadgeClass,
  normalizeSchadenPriorisierung,
  schadenDringendLabel,
  normalizeAbrechnungStatus,
  normalizeAbrechnungLegacy,
  schadenAbrechnungDisplayFromRow,
  normalizeKlaerung,
  klaerungLabel,
  normalizeReparaturPhase,
  schadenReparaturDisplayFromRow,
  schadenReparaturFilterKey,
  schadenTypFilterKey,
  schadenAbrechnungFilterKey,
} from './fusa-schaden-ui-status.js';

/**
 * @param {unknown} v
 */
function str(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @param {unknown} iso
 */
function formatDatumShort(iso) {
  const s = str(iso);
  if (!s) return '—';
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}

/**
 * @param {string} id
 */
export function schadenShortIdDisplay(id) {
  const s = str(id);
  if (!s) return '—';
  return s.length > 10 ? `${s.slice(0, 8)}…` : s;
}

/**
 * @param {Record<string, unknown>} o
 */
function fahrzeugDisplayFromRow(o) {
  const kn = str(o.fahrzeug_kennung);
  if (kn) return kn;
  const fid = str(o.fahrzeug_id);
  return fid || '—';
}

/**
 * @param {Record<string, unknown>|null|undefined} f
 */
export function mapSchadenFotoApiToViewModel(f) {
  if (!f || typeof f !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (f);
  const id = str(o.id);
  const url = str(o.url);
  if (!id || !url) return null;
  return {
    id,
    url,
    createdAtDisplay: formatDatumShort(o.created_at),
  };
}

/**
 * API-Zeile / Detail-Objekt → einheitliches View-Modell für Liste + Detail.
 * @param {Record<string, unknown>|null|undefined} row
 */
export function mapSchadenApiRowToViewModel(row) {
  if (!row || typeof row !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (row);
  const id = str(o.id);
  if (!id) return null;

  const status = normalizeSchadenMeldungStatus(o.status);
  const werkstatt_status = normalizeSchadenWerkstattStatus(o.werkstatt_status);

  const titelRaw = str(o.titel);
  const beschreibungRaw = str(o.beschreibung);

  const typ = normalizeSchadenTyp(o.typ);
  const prioritaet = normalizeSchadenPriorisierung(o.prioritaet);
  const abrechnungStatus = normalizeAbrechnungStatus(o.abrechnung_status);
  const abrechnungLegacy = normalizeAbrechnungLegacy(o.abrechnung_legacy);
  const wiedervorlageRaw = o.wiedervorlage != null ? String(o.wiedervorlage) : '';
  const melderName = o.melder_name != null ? String(o.melder_name) : '';
  const klaerung = normalizeKlaerung(o.klaerung);
  const verursacher = o.verursacher != null ? String(o.verursacher) : '';
  const fremdArt = o.fremd_art != null ? String(o.fremd_art) : '';
  const haftungNotiz = o.haftung_notiz != null ? String(o.haftung_notiz) : '';
  const interneNotiz = o.interne_notiz != null ? String(o.interne_notiz) : '';
  const reparaturPhase = normalizeReparaturPhase(o.reparatur_phase);
  const linkedAuftragId = o.linked_auftrag_id != null ? String(o.linked_auftrag_id) : '';
  const meldedatum = o.meldedatum != null ? String(o.meldedatum) : '';
  const fotoCount = o.foto_count != null ? Number(o.foto_count) : 0;
  const fc = Number.isFinite(fotoCount) && fotoCount >= 0 ? fotoCount : 0;

  const rowForUi = /** @type {Record<string, unknown>} */ ({
    status,
    werkstatt_status,
    prioritaet,
    reparatur_phase: reparaturPhase,
    typ,
    abrechnung_legacy: abrechnungLegacy || undefined,
    abrechnung_status: abrechnungStatus,
  });
  const repDisp = schadenReparaturDisplayFromRow(rowForUi);
  const abDisp = schadenAbrechnungDisplayFromRow(
    /** @type {Record<string, unknown>} */ ({
      abrechnung_legacy: abrechnungLegacy || undefined,
      abrechnung_status: abrechnungStatus,
    }),
  );

  return {
    id,
    projectId: str(o.project_id),
    fahrzeugId: str(o.fahrzeug_id),
    titel: titelRaw || '—',
    beschreibung: beschreibungRaw,
    beschreibungDisplay: beschreibungRaw || '—',
    /** Anzeige Kennung / ID */
    fahrzeugDisplay: fahrzeugDisplayFromRow(o),
    // Meldungsstatus
    status,
    werkstatt_status,
    meldungLabel: schadenMeldungLabel(o.status),
    werkstattLabel: schadenWerkstattLabel(o.werkstatt_status),
    meldungBadgeClass: schadenMeldungBadgeClass(o.status),
    werkstattBadgeClass: schadenWerkstattBadgeClass(o.werkstatt_status),
    // Neue Felder (extra_json)
    typ,
    typLabel: schadenTypLabel(typ),
    typBadgeClass: schadenTypBadgeClass(typ),
    prioritaet,
    dringend: prioritaet === 'dringend',
    dringendLabel: schadenDringendLabel(prioritaet),
    abrechnungStatus,
    abrechnungLegacy,
    abrechnungLabel: abDisp.label,
    abrechnungBadgeClass: abDisp.badgeClass,
    wiedervorlage: wiedervorlageRaw,
    wiedervorlageDisplay: wiedervorlageRaw || '—',
    melderName,
    klaerung,
    klaerungLabel: klaerungLabel(klaerung),
    verursacher,
    fremdArt,
    haftungNotiz,
    interneNotiz,
    reparaturPhase,
    reparaturLabel: repDisp.label,
    reparaturBadgeClass: repDisp.badgeClass,
    reparaturFilterKey: schadenReparaturFilterKey(rowForUi),
    typFilterKey: schadenTypFilterKey(typ),
    abrechnungFilterKey: schadenAbrechnungFilterKey(rowForUi),
    linkedAuftragId,
    meldedatum,
    fotoCount: fc,
    terminanfrage: o.terminanfrage ?? null,
    schadenDokumente: Array.isArray(o.schaden_dokumente) ? o.schaden_dokumente : [],
    // Zeitfelder
    created_at: str(o.created_at),
    createdAtDisplay: formatDatumShort(o.created_at),
    bearbeitetVon: o.bearbeitet_von != null ? String(o.bearbeitet_von) : '',
    bearbeitetAmDisplay: formatDatumShort(o.bearbeitet_am),
    shortIdDisplay: schadenShortIdDisplay(id),
    searchHaystack: schadenRowSearchHaystack(o),
    /** Backend liefert aktuell keine Anhänge außer Fotos */
    dateien: [],
  };
}

/**
 * @param {unknown} rows
 */
export function mapSchadenListApiToViewModels(rows) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {NonNullable<ReturnType<typeof mapSchadenApiRowToViewModel>>[]} */
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const vm = mapSchadenApiRowToViewModel(/** @type {Record<string, unknown>} */ (r));
    if (vm) out.push(vm);
  }
  return out;
}
