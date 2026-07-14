import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';
import { logAudit } from '../lib/audit-log.js';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireModule, requireRight } from '../middleware/require-rights.js';

const DETAIL_SCALAR_KEYS = new Set([
  'wagennummer',
  'typ_kategorie',
  'hersteller',
  'modell',
  'antrieb',
  'baujahr',
  'erstzulassung',
  'ausmusterung_geplant',
  'betreiber',
  'depot',
  'linien',
  'notiz',
  'zustaendig_cc',
  'werkstatt_mail',
  'laufzeit_pct',
  'laufzeit_bis',
  'auftrag_preis',
  'auftrag_start',
  'auftrag_ende',
  'montage_datum',
  'monteure',
]);

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function sanitizeDetailsPayload(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = /** @type {Record<string, unknown>} */ (raw);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of DETAIL_SCALAR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    const v = src[k];
    if (v == null || v === '') continue;
    if (typeof v === 'string') out[k] = v.length > 8000 ? v.slice(0, 8000) : v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  if (Array.isArray(src.werbeflaechen)) {
    const arr = src.werbeflaechen
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
      .slice(0, 64);
    if (arr.length) out.werbeflaechen = arr;
  }
  if (typeof src.eigenwerbung === 'boolean') out.eigenwerbung = src.eigenwerbung;
  if (Array.isArray(src.historie)) out.historie = src.historie.slice(0, 500);
  if (Array.isArray(src.fotos)) out.fotos = src.fotos.slice(0, 200);
  if (Array.isArray(src.schaeden)) out.schaeden = src.schaeden.slice(0, 500);
  if (Array.isArray(src.dokumente)) {
    out.dokumente = src.dokumente
      .slice(0, 120)
      .map(x => {
        if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
        const o = /** @type {Record<string, unknown>} */ (x);
        return {
          name: typeof o.name === 'string' ? o.name.slice(0, 512) : '',
          typ: typeof o.typ === 'string' ? o.typ.slice(0, 120) : '',
          datum: typeof o.datum === 'string' ? o.datum.slice(0, 40) : '',
          von: typeof o.von === 'string' ? o.von.slice(0, 160) : '',
        };
      })
      .filter(Boolean);
  }
  return out;
}

/**
 * @param {object} row
 */
/**
 * @param {object} row
 * @returns {Record<string, unknown>}
 */
function parseExistingDetails(row) {
  if (!row || typeof row !== 'object') return {};
  try {
    if (row.details_json != null && String(row.details_json).trim()) {
      const d = JSON.parse(String(row.details_json));
      return d && typeof d === 'object' && !Array.isArray(d) ? { ...d } : {};
    }
  } catch {
    /* ignore */
  }
  return {};
}

function mapFahrzeugPublic(row) {
  if (!row || typeof row !== 'object') return null;
  /** @type {Record<string, unknown>} */
  let d = {};
  try {
    if (row.details_json != null && String(row.details_json).trim()) {
      d = JSON.parse(String(row.details_json));
    }
  } catch {
    d = {};
  }
  const out = {
    id: row.id,
    project_id: row.project_id,
    kennung: row.kennung,
    typ: row.typ,
    kennzeichen: row.kennzeichen ?? null,
    status: row.status ?? null,
    created_at: row.created_at,
  };
  for (const k of DETAIL_SCALAR_KEYS) {
    if (d[k] !== undefined && d[k] !== null && d[k] !== '') out[k] = d[k];
  }
  if (Array.isArray(d.werbeflaechen)) out.werbeflaechen = d.werbeflaechen;
  if (typeof d.eigenwerbung === 'boolean') out.eigenwerbung = d.eigenwerbung;
  if (Array.isArray(d.historie)) out.historie = d.historie;
  if (Array.isArray(d.fotos)) out.fotos = d.fotos;
  if (Array.isArray(d.schaeden)) out.schaeden = d.schaeden;
  if (Array.isArray(d.dokumente)) out.dokumente = d.dokumente;
  const mod = d.modell != null ? String(d.modell) : '';
  if (mod) out.subtyp = mod;
  return out;
}

/**
 * @param {object} store
 */
export function createFahrzeugeRouter(store) {
  const router = Router();

  const fzSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'fahrzeuge', 'sehen'));
  const fzErstellen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'fahrzeuge', 'erstellen'));
  const fzBearbeiten = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'fahrzeuge', 'bearbeiten'));

  router.get('/', fzSehen, async (req, res, next) => {
    try {
      const rows = await store.listFahrzeugeForUser(req.auth.userId);
      const fahrzeuge = rows.map((r) => mapFahrzeugPublic(r)).filter(Boolean);
      return sendSuccess(res, 200, { fahrzeuge });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/:fahrzeugId', fzSehen, async (req, res, next) => {
    try {
      const fid = typeof req.params.fahrzeugId === 'string' ? req.params.fahrzeugId.trim() : '';
      if (!fid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Fahrzeug-ID.');
      }
      const row = await store.getFahrzeugById(fid);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Fahrzeug nicht gefunden.');
      }
      return sendSuccess(res, 200, { fahrzeug: mapFahrzeugPublic(row) });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/', fzErstellen, async (req, res, next) => {
    try {
      const userId = req.auth.userId;
      const rawPid = req.body?.project_id;
      if (rawPid == null || rawPid === '' || typeof rawPid !== 'string' || !rawPid.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "project_id" ist erforderlich.');
      }
      const projectId = rawPid.trim();
      const project = await store.getProjectById(projectId);
      if (!project) {
        return sendError(res, 404, 'NOT_FOUND', 'Projekt wurde nicht gefunden.');
      }

      const kennungRaw = req.body?.kennung;
      const typRaw = req.body?.typ;
      if (typeof kennungRaw !== 'string' || !kennungRaw.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "kennung" ist erforderlich.');
      }
      if (typeof typRaw !== 'string' || !typRaw.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "typ" ist erforderlich.');
      }

      const kennzeichenRaw = req.body?.kennzeichen;
      const statusRaw = req.body?.status;
      const kennzeichen =
        kennzeichenRaw == null || kennzeichenRaw === ''
          ? null
          : typeof kennzeichenRaw === 'string'
            ? kennzeichenRaw.trim() || null
            : undefined;
      if (kennzeichen === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "kennzeichen" muss Text sein oder leer bleiben.');
      }
      const status =
        statusRaw == null || statusRaw === ''
          ? null
          : typeof statusRaw === 'string'
            ? statusRaw.trim() || null
            : undefined;
      if (status === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "status" muss Text sein oder leer bleiben.');
      }

      const detailsClean = sanitizeDetailsPayload(req.body?.details);
      const detailsJson = Object.keys(detailsClean).length ? JSON.stringify(detailsClean) : null;

      const id = randomUUID();
      try {
        await store.insertFahrzeug({
          id,
          projectId,
          kennung: kennungRaw.trim(),
          typ: typRaw.trim(),
          kennzeichen,
          status,
          detailsJson,
        });
      } catch {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Fahrzeug konnte nicht angelegt werden.');
      }
      const created = await store.getFahrzeugById(id);
      return sendSuccess(res, 201, { fahrzeug: mapFahrzeugPublic(created) });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/:fahrzeugId', fzBearbeiten, async (req, res, next) => {
    try {
      const fid = typeof req.params.fahrzeugId === 'string' ? req.params.fahrzeugId.trim() : '';
      if (!fid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Fahrzeug-ID.');
      }
      const row = await store.getFahrzeugById(fid);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Fahrzeug nicht gefunden.');
      }

      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'kennung')) {
        patch.kennung = req.body.kennung;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'typ')) {
        patch.typ = req.body.typ;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'kennzeichen')) {
        patch.kennzeichen = req.body.kennzeichen;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
        patch.status = req.body.status;
      }
      const hasDetailsPatch = Object.prototype.hasOwnProperty.call(req.body || {}, 'details');

      if (Object.keys(patch).length === 0 && !hasDetailsPatch) {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Mindestens ein Feld: kennung, typ, kennzeichen, status oder details.',
        );
      }

      /** @type {object|null} */
      let rowOut = row;

      if (Object.keys(patch).length > 0) {
        const updated = await store.updateFahrzeug(fid, patch);
        if (!updated) {
          return sendError(res, 404, 'NOT_FOUND', 'Fahrzeug nicht gefunden.');
        }
        if (typeof updated === 'object' && 'error' in updated && updated.error) {
          const msg =
            updated.error === 'INVALID_KENNUNG'
              ? 'Feld "kennung" ungültig.'
              : updated.error === 'INVALID_TYP'
                ? 'Feld "typ" ungültig.'
                : updated.error === 'INVALID_KENNZEICHEN'
                  ? 'Feld "kennzeichen" ungültig.'
                  : updated.error === 'INVALID_STATUS'
                    ? 'Feld "status" ungültig.'
                    : 'Validierung fehlgeschlagen.';
          return sendError(res, 400, 'VALIDATION_ERROR', msg);
        }
        rowOut = updated;
      }

      if (hasDetailsPatch) {
        const inc = req.body.details;
        if (inc !== undefined && inc !== null && (typeof inc !== 'object' || Array.isArray(inc))) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "details" muss ein Objekt oder null sein.');
        }
        if (inc === null) {
          const cleared = await store.setFahrzeugDetailsJson(fid, null);
          rowOut = cleared || rowOut;
        } else if (inc && typeof inc === 'object') {
          const merged = { ...parseExistingDetails(rowOut), ...inc };
          const clean = sanitizeDetailsPayload(merged);
          const nextJson = Object.keys(clean).length ? JSON.stringify(clean) : null;
          const after = await store.setFahrzeugDetailsJson(fid, nextJson);
          rowOut = after || rowOut;
        }
      }

      const finalRow = await store.getFahrzeugById(fid);
      const pid = String((finalRow || rowOut)?.project_id || '').trim() || null;
      await logAudit(store, {
        user: req.auth,
        modul: 'fusa',
        action: 'PATCH',
        resource_type: 'fahrzeug',
        resource_id: fid,
        project_id: pid,
        payload: {
          scalar_keys: Object.keys(patch),
          details: hasDetailsPatch,
        },
      });
      return sendSuccess(res, 200, { fahrzeug: mapFahrzeugPublic(finalRow || rowOut) });
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/:fahrzeugId', fzBearbeiten, async (req, res, next) => {
    try {
      const fid = typeof req.params.fahrzeugId === 'string' ? req.params.fahrzeugId.trim() : '';
      if (!fid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Fahrzeug-ID.');
      }
      if (typeof store.deleteFahrzeugCascade !== 'function') {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Löschen wird vom Store nicht unterstützt.');
      }
      const result = await store.deleteFahrzeugCascade(fid);
      if (!result || result.ok !== true) {
        const code = result?.code || 'DELETE_FAILED';
        const msg = result?.message || 'Fahrzeug konnte nicht gelöscht werden.';
        if (code === 'NOT_FOUND') return sendError(res, 404, 'NOT_FOUND', msg);
        if (code === 'VALIDATION_ERROR') return sendError(res, 400, 'VALIDATION_ERROR', msg);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
      await logAudit(store, {
        user: req.auth,
        modul: 'fusa',
        action: 'DELETE',
        resource_type: 'fahrzeug',
        resource_id: fid,
        project_id: null,
        payload: null,
      });
      return sendSuccess(res, 200, {
        deleted: true,
        id: fid,
        cascade: {
          deleted_auftraege: Number(result.deletedAuftraege || 0),
          updated_auftraege: Number(result.updatedAuftraege || 0),
          deleted_schaeden: Number(result.deletedSchaeden || 0),
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
