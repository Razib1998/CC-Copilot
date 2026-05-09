import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireModule, requireRight } from '../middleware/require-rights.js';

/**
 * @param {unknown} v
 */
function requiredTrimmed(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

/**
 * @param {unknown} raw
 * @returns {string|null|undefined} ISO date YYYY-MM-DD or null; undefined = invalid if non-empty
 */
function optionalIsoDate(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return undefined;
}

/**
 * @param {unknown} raw
 */
function optionalNumber(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * @param {object} row
 */
function mapMitarbeiter(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    user_id: row.user_id,
    firma_id: row.firma_id,
    vertrag_typ: row.vertrag_typ ?? null,
    soll_stunden: row.soll_stunden != null ? Number(row.soll_stunden) : null,
    eintrittsdatum: row.eintrittsdatum ?? null,
    austrittsdatum: row.austrittsdatum ?? null,
    position: row.position ?? null,
    created_at: row.created_at,
    user_email: row.user_email ?? null,
    user_name: row.user_name ?? null,
  };
}

/**
 * @param {object} store
 * @param {{ resolveFirmaIdForRequest: (req: import('express').Request) => Promise<string|null> }} opts
 */
export function createMitarbeiterRouter(store, opts) {
  const resolveFirmaIdForRequest = opts?.resolveFirmaIdForRequest;
  if (typeof resolveFirmaIdForRequest !== 'function') {
    throw new Error('createMitarbeiterRouter: opts.resolveFirmaIdForRequest fehlt');
  }

  const router = Router();

  const mitSehen = chainMiddleware(requireModule('ccintern'), requireRight('ccintern', 'mitarbeiter', 'sehen'));
  const mitErstellen = chainMiddleware(requireModule('ccintern'), requireRight('ccintern', 'mitarbeiter', 'erstellen'));
  const mitBearbeiten = chainMiddleware(requireModule('ccintern'), requireRight('ccintern', 'mitarbeiter', 'bearbeiten'));

  const KUERZEL_FEHLER = 'Kürzel bereits vergeben oder ungültig.';

  /**
   * @param {unknown} raw
   * @returns {{ ok: boolean, norm: string }}
   */
  function normalizeMitarbeiterKuerzel(raw) {
    const s = requiredTrimmed(raw);
    if (!s) return { ok: false, norm: '' };
    const norm = s.toUpperCase();
    if (!/^[A-ZÄÖÜ]{2,5}$/.test(norm)) return { ok: false, norm };
    return { ok: true, norm };
  }

  /**
   * @param {string} firmaId
   * @param {string} norm
   * @param {string} [excludeMitarbeiterId]
   */
  async function findMitarbeiterPositionConflict(firmaId, norm, excludeMitarbeiterId) {
    const total = await store.countMitarbeiterByFirma(firmaId);
    const pageSize = 200;
    for (let offset = 0; offset < total; offset += pageSize) {
      const rows = await store.listMitarbeiterByFirma(firmaId, { offset, limit: pageSize });
      for (const r of rows) {
        if (!r) continue;
        const p = r.position != null ? String(r.position).trim().toUpperCase() : '';
        if (p !== norm) continue;
        if (excludeMitarbeiterId && String(r.id) === String(excludeMitarbeiterId)) continue;
        return r;
      }
    }
    return null;
  }

  function parsePagination(pageRaw, limitRaw) {
    const page = Math.max(1, parseInt(String(pageRaw || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(limitRaw || '50'), 10) || 50));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  }

  router.get('/', mitSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const total = await store.countMitarbeiterByFirma(firmaId);
      const rows = await store.listMitarbeiterByFirma(firmaId, { offset, limit });
      return sendSuccess(res, 200, {
        items: rows.map((r) => mapMitarbeiter(r)).filter(Boolean),
        pagination: { page, limit, total },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/:id', mitSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Mitarbeiter-ID.');
      const row = await store.getMitarbeiterById(id, firmaId);
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Mitarbeiter nicht gefunden.');
      return sendSuccess(res, 200, { item: mapMitarbeiter(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/', mitErstellen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const userId = requiredTrimmed(req.body?.user_id);
      if (!userId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "user_id" ist erforderlich.');
      }
      const user = await store.getUserById(userId);
      if (!user) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'user_id unbekannt.');
      }
      const firma = await store.getFirmaById(firmaId);
      if (!firma) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id ungültig.');
      }
      const dup = await store.getMitarbeiterByUserAndFirma(userId, firmaId);
      const ein = optionalIsoDate(req.body?.eintrittsdatum);
      const aus = optionalIsoDate(req.body?.austrittsdatum);
      if (ein === undefined || aus === undefined) {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'eintrittsdatum / austrittsdatum müssen leer oder YYYY-MM-DD sein.',
        );
      }
      const soll = optionalNumber(req.body?.soll_stunden);
      if (soll === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'soll_stunden muss eine Zahl sein.');
      }
      const posNormCheck = normalizeMitarbeiterKuerzel(req.body?.position);
      if (!posNormCheck.ok) {
        return sendError(res, 400, 'VALIDATION_ERROR', KUERZEL_FEHLER);
      }
      const excludeForPos = dup ? String(dup.id) : '';
      const conflictPost = await findMitarbeiterPositionConflict(firmaId, posNormCheck.norm, excludeForPos);
      if (conflictPost) {
        return sendError(res, 409, 'CONFLICT', KUERZEL_FEHLER);
      }
      if (dup) {
        const updated = await store.updateMitarbeiter(dup.id, firmaId, {
          user_id: userId,
          vertrag_typ: requiredTrimmed(req.body?.vertrag_typ) || null,
          soll_stunden: soll,
          eintrittsdatum: ein,
          austrittsdatum: aus,
          position: posNormCheck.norm,
        });
        return sendSuccess(res, 200, { item: mapMitarbeiter(updated) });
      }
      const id = randomUUID();
      const created = await store.insertMitarbeiter({
        id,
        user_id: userId,
        firma_id: firmaId,
        vertrag_typ: requiredTrimmed(req.body?.vertrag_typ) || null,
        soll_stunden: soll,
        eintrittsdatum: ein,
        austrittsdatum: aus,
        position: posNormCheck.norm,
      });
      return sendSuccess(res, 201, { item: mapMitarbeiter(created) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.put('/:id', mitBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Mitarbeiter-ID.');
      const cur = await store.getMitarbeiterById(id, firmaId);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Mitarbeiter nicht gefunden.');

      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body, 'user_id')) {
        const uid = requiredTrimmed(req.body?.user_id);
        if (!uid) return sendError(res, 400, 'VALIDATION_ERROR', 'user_id darf nicht leer sein.');
        const user = await store.getUserById(uid);
        if (!user) return sendError(res, 400, 'VALIDATION_ERROR', 'user_id unbekannt.');
        const other = await store.getMitarbeiterByUserAndFirma(uid, firmaId);
        if (other && String(other.id) !== String(id)) {
          return sendError(
            res,
            409,
            'CONFLICT',
            'Benutzer ist in dieser Firma bereits einem anderen Mitarbeiter-Eintrag zugeordnet.',
          );
        }
        patch.user_id = uid;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'vertrag_typ')) {
        patch.vertrag_typ = requiredTrimmed(req.body?.vertrag_typ) || null;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'soll_stunden')) {
        const soll = optionalNumber(req.body?.soll_stunden);
        if (soll === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'soll_stunden muss eine Zahl sein.');
        }
        patch.soll_stunden = soll;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'eintrittsdatum')) {
        const ein = optionalIsoDate(req.body?.eintrittsdatum);
        if (ein === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'eintrittsdatum muss leer oder YYYY-MM-DD sein.');
        }
        patch.eintrittsdatum = ein;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'austrittsdatum')) {
        const aus = optionalIsoDate(req.body?.austrittsdatum);
        if (aus === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'austrittsdatum muss leer oder YYYY-MM-DD sein.');
        }
        patch.austrittsdatum = aus;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'position')) {
        const posPut = normalizeMitarbeiterKuerzel(req.body?.position);
        if (!posPut.ok) {
          return sendError(res, 400, 'VALIDATION_ERROR', KUERZEL_FEHLER);
        }
        const conflictPut = await findMitarbeiterPositionConflict(firmaId, posPut.norm, id);
        if (conflictPut) {
          return sendError(res, 409, 'CONFLICT', KUERZEL_FEHLER);
        }
        patch.position = posPut.norm;
      }

      if (!Object.keys(patch).length) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine gültigen Felder zum Aktualisieren.');
      }

      const updated = await store.updateMitarbeiter(id, firmaId, patch);
      return sendSuccess(res, 200, { item: mapMitarbeiter(updated) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.delete('/:id', mitBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Mitarbeiter-ID.');
      const cur = await store.getMitarbeiterById(id, firmaId);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Mitarbeiter nicht gefunden.');
      await store.deleteMitarbeiter(id, firmaId);
      return sendSuccess(res, 200, { deleted: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  return router;
}
