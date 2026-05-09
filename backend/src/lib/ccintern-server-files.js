/**
 * Physische Ablage CC-Intern Auftragsdateien unter
 * SERVER_ROOT/01_KUNDEN/{Kunde}/PROJEKTE/{Auftrag}/{LAYOUT|DRUCKDATEI|MONTAGE|VORHER|NACHHER|…}/
 * Keine Pfade vom Client übernehmen — nur serverseitig aus Auftrag, typ, phase, position.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizePathSegment } from './upload-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..', '..');

/** Basis wie Spezifikation (kann leer sein → Fallback unterhalb Repo). */
const CCINTERN_SERVER_ROOT = process.env.CCINTERN_SERVER_ROOT;

/**
 * @returns {string} Absoluter Pfad zum SERVER-Stammordner
 */
export function getCcInternServerRoot() {
  const env = String(CCINTERN_SERVER_ROOT || '').trim();
  console.log('[ccintern-server-files] CCINTERN_SERVER_ROOT (ENV):', CCINTERN_SERVER_ROOT ?? '(nicht gesetzt)');
  if (env) {
    const resolved = path.resolve(env);
    console.log('[ccintern-server-files] SERVER ROOT (aus ENV):', resolved);
    return resolved;
  }
  const fallback = path.resolve(backendRoot, '..', 'SERVER');
  console.log('[ccintern-server-files] SERVER ROOT (Fallback):', fallback);
  return fallback;
}

/**
 * Zielordner unter …/PROJEKTE/{Auftrag}/
 * @param {string} typ — layout_grafik | druckdatei | montagefoto | …
 * @param {string|null|undefined} phase
 */
export function ccInternDateiFolderFromTypPhase(typ, phase) {
  const t = String(typ || '')
    .trim()
    .toLowerCase();
  const ph = String(phase ?? '')
    .trim()
    .toLowerCase();
  if (t === 'layout_grafik') return 'LAYOUT';
  if (t === 'druckdatei') return 'DRUCKDATEI';
  if (t === 'montagefoto') return 'MONTAGE';
  if (ph === 'vorher') return 'VORHER';
  if (ph === 'nachher') return 'NACHHER';
  if (t === 'kundenfreigabe') return 'KUNDENFREIGABE';
  if (t === 'entwurf') return 'LAYOUT';
  return 'SONST';
}

/**
 * @deprecated Nur für Alt-Pfade; neue Ablage: {@link ccInternDateiFolderFromTypPhase}.
 * @param {string} typ
 */
export function ccInternFotoOrdnerFromTyp(typ) {
  const t = String(typ || '')
    .trim()
    .toLowerCase();
  if (t === 'vorher' || t === 'nachher') return ccInternDateiFolderFromTypPhase(t, t);
  return ccInternDateiFolderFromTypPhase(typ, '');
}

/**
 * @param {string} typ — layout_grafik | druckdatei | …
 * @param {string|null|undefined} position
 * @param {string} mimetype
 * @param {unknown} originalName
 */
export function ccInternDateiStableFilename(typ, position, mimetype, originalName) {
  const t = String(typ || '')
    .trim()
    .toLowerCase();
  const pos = String(position ?? '')
    .trim()
    .toLowerCase();
  const mt = String(mimetype || '').toLowerCase();
  let ext = '.jpg';
  if (mt.includes('pdf')) ext = '.pdf';
  else if (mt.includes('png')) ext = '.png';
  else if (mt.includes('jpeg') || mt.includes('jpg')) ext = '.jpg';
  if (pos === 'front') return `Front${ext}`;
  if (pos === 'seite1') return `Seite1${ext}`;
  if (pos === 'seite2') return `Seite2${ext}`;
  if (pos === 'heck') return `Heck${ext}`;
  if (pos === 'entwurf' && t === 'layout_grafik') return `Layout${ext}`;
  if (pos === 'entwurf' && t === 'druckdatei') return `Druckdatei${ext}`;
  if (t === 'kundenfreigabe') return `Kundenfreigabe${ext}`;
  const o = String(originalName || '');
  const fromOrig = path.extname(o).toLowerCase();
  if (fromOrig && fromOrig.length <= 8) return `${Date.now()}${fromOrig}`;
  return `${Date.now()}${ext}`;
}

/**
 * Ob für (typ, phase, position) höchstens eine DB-Zeile / ein fester Dateiname existiert (Überschreiben).
 * @param {string} typ
 * @param {string|null|undefined} phase
 * @param {string|null|undefined} position
 */
export function ccInternDateiUsesStableSlot(typ, phase, position) {
  const t = String(typ || '')
    .trim()
    .toLowerCase();
  const ph = String(phase ?? '')
    .trim()
    .toLowerCase();
  const pos = String(position ?? '')
    .trim()
    .toLowerCase();
  if (['front', 'seite1', 'seite2', 'heck'].includes(pos)) return true;
  if ((t === 'layout_grafik' || t === 'druckdatei') && ph === 'entwurf' && pos === 'entwurf') return true;
  if (t === 'kundenfreigabe') return true;
  return false;
}

/**
 * Relativen Pfad aus DB zu absolutem Pfad unter SERVER; verhindert Path-Traversal.
 * @param {string} relativeFromDb — z. B. 01_KUNDEN/X/PROJEKTE/Y/FOTOS/Z/datei.ext
 * @returns {string|null}
 */
export function resolveCcInternServerAbsolute(relativeFromDb) {
  const raw = String(relativeFromDb || '').trim();
  const segments = raw.split(/[/\\]+/).filter(Boolean);
  if (segments.some((s) => s === '..')) return null;
  const parts = segments.filter((x) => x !== '.');
  const root = path.resolve(getCcInternServerRoot());
  const abs = path.resolve(root, ...parts);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) return null;
  return abs;
}

/**
 * @param {{
 *   kundeDisplay: string,
 *   auftragLabel: string,
 *   typ: string,
 *   phase?: string|null,
 *   position?: string|null,
 *   mimetype?: string,
 *   buffer: Buffer,
 *   originalName?: unknown,
 * }} opts
 * @returns {{ serverPath: string, absolutePath: string, storedFilename: string }}
 */
export function writeCcInternServerDateiSync(opts) {
  const kundeSeg = sanitizePathSegment(opts.kundeDisplay || 'UNBEKANNT', 'KUNDE');
  const projSeg = sanitizePathSegment(opts.auftragLabel || 'PROJEKT', 'PROJEKT');
  const folder = ccInternDateiFolderFromTypPhase(opts.typ, opts.phase);
  const storedFilename = ccInternDateiStableFilename(
    opts.typ,
    opts.position,
    opts.mimetype || 'image/jpeg',
    opts.originalName,
  );
  const relParts = ['01_KUNDEN', kundeSeg, 'PROJEKTE', projSeg, folder, storedFilename];
  const root = path.resolve(getCcInternServerRoot());
  const abs = path.join(root, ...relParts);
  const dir = path.dirname(abs);
  console.log('[ccintern-server-files] SAVE PATH:', abs);
  console.log('[ccintern-server-files] DIR:', dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(abs, opts.buffer);
  console.log('[ccintern-server-files] GESCHRIEBEN:', abs, '|', opts.buffer.length, 'Bytes');
  const serverPath = relParts.join('/');
  return { serverPath, absolutePath: abs, storedFilename };
}
