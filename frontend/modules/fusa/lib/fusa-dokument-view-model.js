/**
 * API → View-Modell: Metadaten aus `GET /auftraege` → `fusa_extra_json.dokumente_meta` (keine Dummy-Dateien).
 */

import { dokumentTypBadgeClass, normalizeDokumentTyp } from './fusa-dokument-ui-status.js';

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
 * @param {string} name
 */
function fileExtension(name) {
  const n = str(name);
  const i = n.lastIndexOf('.');
  if (i <= 0 || i === n.length - 1) return '';
  return n.slice(i + 1).toLowerCase();
}

/**
 * @param {string} name
 */
function fileIconLabel(name) {
  const n = str(name).toLowerCase();
  if (n.endsWith('.pdf')) return '📄';
  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(n)) return '🖼️';
  return '📎';
}

/**
 * @param {Record<string, unknown>} auftragRow
 */
export function parseFusaExtraJson(auftragRow) {
  if (!auftragRow || typeof auftragRow !== 'object') return {};
  const raw = /** @type {Record<string, unknown>} */ (auftragRow).fusa_extra_json;
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return /** @type {Record<string, unknown>} */ (raw);
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      return j && typeof j === 'object' && !Array.isArray(j) ? /** @type {Record<string, unknown>} */ (j) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * @param {Record<string, unknown>} meta
 * @param {Record<string, unknown>} auftragRow
 * @param {number} indexInAuftrag
 */
export function mapDokumentMetaToViewModel(meta, auftragRow, indexInAuftrag) {
  if (!meta || typeof meta !== 'object') return null;
  const m = /** @type {Record<string, unknown>} */ (meta);
  const a = auftragRow && typeof auftragRow === 'object' ? /** @type {Record<string, unknown>} */ (auftragRow) : {};
  const auftragId = str(a.id);
  if (!auftragId) return null;

  const name = str(m.name) || str(m.filename) || str(m.title) || 'Ohne Namen';
  const typRaw = m.typ ?? m.type ?? m.kategorie ?? m.category;
  const typ = normalizeDokumentTyp(typRaw);
  const badgeClass = dokumentTypBadgeClass(typ);

  const auftragTitle = str(a.title) || auftragId;
  const auftragRef = `${auftragId} · ${auftragTitle}`.length > 80 ? `${auftragId} · ${auftragTitle.slice(0, 70)}…` : `${auftragId} · ${auftragTitle}`;

  const von = str(m.von ?? m.uploadedBy ?? m.uploaded_by ?? m.erstellt_von ?? m.created_by) || '—';
  const datumRaw = m.datum ?? m.uploadedAt ?? m.uploaded_at ?? m.created_at ?? m.erstellt_am;
  const erstelltAm = formatDatumShort(datumRaw);

  const sizeNum = Number(m.size ?? m.groesse ?? m.bytes);
  const sizeDisplay =
    Number.isFinite(sizeNum) && sizeNum > 0
      ? sizeNum > 1024
        ? `${Math.round(sizeNum / 1024)} KB`
        : `${Math.round(sizeNum)} B`
      : '—';

  const fileUrl = str(m.url ?? m.file_url ?? m.download_url ?? m.href);
  const mimeType = str(m.mime_type ?? m.mimeType ?? m.content_type);
  const status = str(m.status ?? m.sichtbarkeit);
  const visibility = str(m.sichtbarkeit ?? m.visibility);

  const rowId = `${auftragId}::${indexInAuftrag}`;
  const hay = [name, typ, auftragRef, von, erstelltAm, fileUrl, mimeType, status, visibility, auftragId]
    .join(' ')
    .toLowerCase();

  return {
    rowId,
    auftragId,
    auftragRef,
    name,
    typ,
    typBadgeClass: badgeClass,
    von,
    erstelltAm,
    sizeDisplay,
    fileUrl,
    hasDownloadUrl: Boolean(fileUrl),
    mimeType: mimeType || '—',
    extension: fileExtension(name) || '—',
    status: status || '—',
    visibility: visibility || '—',
    iconLabel: fileIconLabel(name),
    searchHaystack: hay,
    projectId: str(a.project_id),
  };
}

/**
 * Flacht alle `dokumente_meta`-Einträge der Aufträge eines Projekts.
 * @param {unknown[]} auftraege
 * @param {string} projectId
 */
export function flattenDokumenteFromAuftraege(auftraege, projectId) {
  const pid = str(projectId);
  const list = Array.isArray(auftraege) ? auftraege : [];
  /** @type {NonNullable<ReturnType<typeof mapDokumentMetaToViewModel>>[]} */
  const out = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    if (pid && str(r.project_id) !== pid) continue;
    const ex = parseFusaExtraJson(r);
    const docs = Array.isArray(ex.dokumente_meta) ? ex.dokumente_meta : [];
    let idx = 0;
    for (const d of docs) {
      const vm = mapDokumentMetaToViewModel(d && typeof d === 'object' ? /** @type {Record<string, unknown>} */ (d) : {}, r, idx);
      if (vm) out.push(vm);
      idx += 1;
    }
  }
  return out;
}
