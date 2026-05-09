/**
 * Einheitliche Upload-Ablage (Phase A6): uploads/<modul>/<project_id>/<resource>/<dateiname>
 * Keine ../ Pfade; Dateinamen mit UUID-Präfix (kein Überschreiben).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoBackendRoot = path.join(__dirname, '..', '..');

/** Max. Größe Proxy PDF/Export (MesseFlow Prüfserver) */
export const MESSEFLOW_PROXY_MAX_BYTES = 95 * 1024 * 1024;

/**
 * @returns {string} Absoluter Pfad zum Wurzelordner `uploads`
 */
export function getUploadsRoot() {
  const env = String(process.env.UPLOADS_ROOT || '').trim();
  if (env) return path.resolve(env);
  return path.join(repoBackendRoot, 'data', 'uploads');
}

/**
 * Segmente für Unterordner (modul, project_id, resource): keine Pfad-Sonderzeichen.
 * @param {unknown} s
 * @param {string} fallback
 */
export function sanitizePathSegment(s, fallback = 'x') {
  let t = String(s ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 128);
  if (!t || t === '.' || t.includes('..')) t = fallback;
  return t;
}

/**
 * Nur Basename; Erweiterung erhalten; UUID voranstellen.
 * @param {unknown} originalName
 */
export function safeStoredFilename(originalName) {
  const base = path.basename(String(originalName || 'upload.bin'));
  const ext = path.extname(base) || '';
  let stem = path.basename(base, ext).replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '');
  stem = stem.slice(0, 128);
  if (!stem) stem = 'file';
  return `${randomUUID()}-${stem}${ext}`;
}

/**
 * Relativer POSIX-Pfad unterhalb von uploads/ (ohne führenden Slash).
 * @param {string} moduleKey z. B. schaeden-fotos
 * @param {string} projectId
 * @param {string} resourceKey z. B. schaden, wand, auftrag
 * @param {string} filename bereits gesicherter Dateiname
 */
export function joinUploadRelative(moduleKey, projectId, resourceKey, filename) {
  const m = sanitizePathSegment(moduleKey, 'mod');
  const p = sanitizePathSegment(projectId, 'proj');
  const r = sanitizePathSegment(resourceKey, 'res');
  const f = path.basename(String(filename || 'file')).replace(/[/\\]/g, '');
  if (!f || f.includes('..')) throw new Error('INVALID_UPLOAD_FILENAME');
  return [m, p, r, f].join('/');
}

/**
 * Schreibt Buffer synchron unter getUploadsRoot().
 * @param {{ moduleKey: string, projectId: string, resourceKey: string, buffer: Buffer, originalName?: unknown }} opts
 * @returns {{ relativePath: string, absolutePath: string, storedFilename: string }}
 */
export function writeUploadBufferSync(opts) {
  const { moduleKey, projectId, resourceKey, buffer } = opts;
  const storedFilename = safeStoredFilename(opts.originalName);
  const relativePath = joinUploadRelative(moduleKey, projectId, resourceKey, storedFilename);
  const root = path.resolve(getUploadsRoot());
  const abs = path.join(root, ...relativePath.split('/'));
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(abs, buffer);
  return { relativePath, absolutePath: abs, storedFilename };
}

/**
 * Relativen DB-Pfad (Slash-getrennt) zu absolutem Pfad; verhindert Escape aus uploads/.
 * @param {string} relativeFromDb
 * @returns {string|null}
 */
export function resolveUploadAbsolute(relativeFromDb) {
  const raw = String(relativeFromDb || '').trim();
  const segments = raw.split(/[/\\]+/).filter(Boolean);
  if (segments.some((s) => s === '..')) return null;
  const parts = segments.filter((x) => x !== '.');
  const root = path.resolve(getUploadsRoot());
  const abs = path.resolve(root, ...parts);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) return null;
  return abs;
}

/**
 * @param {import('multer').Options} opts
 */
export function createMulterMemory(opts = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: opts.limits ?? { fileSize: 100 * 1024 * 1024 },
    fileFilter: opts.fileFilter,
  });
}

/** MesseFlow → Caldera: große PDFs im RAM */
export const messeflowCalderaMulter = createMulterMemory({
  limits: { fileSize: 100 * 1024 * 1024 },
});

/**
 * Nur PDF (MIME oder Dateiendung .pdf).
 * @type {import('multer').Options['fileFilter']}
 */
export function messeflowPdfFileFilter(_req, file, cb) {
  const mt = (file.mimetype || '').toLowerCase().trim();
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (mt === 'application/pdf' || ext === '.pdf') {
    return cb(null, true);
  }
  const err = new Error('Nur PDF-Dateien sind erlaubt (application/pdf oder .pdf).');
  return cb(err);
}

const EXPORT_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/tiff']);
const EXPORT_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.tiff', '.tif']);

/**
 * @type {import('multer').Options['fileFilter']}
 */
export function messeflowExportFileFilter(_req, file, cb) {
  const mt = (file.mimetype || '').toLowerCase().trim();
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (EXPORT_MIME.has(mt) || EXPORT_EXT.has(ext)) {
    return cb(null, true);
  }
  const err = new Error(
    'Dateityp nicht erlaubt. Erlaubt: PDF, PNG, JPEG, WebP, TIFF (MIME oder passende Dateiendung).',
  );
  return cb(err);
}

export const messeflowProxyUploadPdf = createMulterMemory({
  limits: { fileSize: MESSEFLOW_PROXY_MAX_BYTES },
  fileFilter: messeflowPdfFileFilter,
});

export const messeflowProxyUploadExport = createMulterMemory({
  limits: { fileSize: MESSEFLOW_PROXY_MAX_BYTES },
  fileFilter: messeflowExportFileFilter,
});
