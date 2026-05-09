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
  return String(v).trim();
}

/**
 * @param {unknown} raw
 * @returns {boolean|undefined}
 */
function parseBoolStrict(raw) {
  if (raw === true || raw === false) return raw;
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'ja') return true;
  if (s === 'false' || s === '0' || s === 'nein') return false;
  return undefined;
}

/**
 * @param {object} row
 */
function mapEintrag(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    checkliste_id: row.checkliste_id,
    text: row.text,
    erledigt: Boolean(Number(row.erledigt)),
    reihenfolge: Number(row.reihenfolge) || 0,
  };
}

/**
 * @param {object} row
 * @param {object[]|null|undefined} eintraege — wenn gesetzt, unter `eintraege` mitschicken
 */
function mapCheckliste(row, eintraege) {
  if (!row || typeof row !== 'object') return null;
  const out = {
    id: row.id,
    titel: row.titel,
    firma_id: row.firma_id,
    auftrag_id: row.auftrag_id ?? null,
    erstellt_von: row.erstellt_von ?? null,
    created_at: row.created_at,
  };
  if (eintraege != null) {
    out.eintraege = eintraege.map((e) => mapEintrag(e)).filter(Boolean);
  }
  return out;
}

/**
 * @param {object} store
 * @param {{ resolveFirmaIdForRequest: (req: import('express').Request) => Promise<string|null> }} opts
 */
export function createChecklistenRouter(store, opts) {
  const resolveFirmaIdForRequest = opts?.resolveFirmaIdForRequest;
  if (typeof resolveFirmaIdForRequest !== 'function') {
    throw new Error('createChecklistenRouter: opts.resolveFirmaIdForRequest fehlt');
  }

  const router = Router();

  const clSehen = chainMiddleware(requireModule('ccintern'), requireRight('ccintern', 'checklisten', 'sehen'));
  const clErstellen = chainMiddleware(requireModule('ccintern'), requireRight('ccintern', 'checklisten', 'erstellen'));
  const clBearbeiten = chainMiddleware(requireModule('ccintern'), requireRight('ccintern', 'checklisten', 'bearbeiten'));

  function parsePagination(pageRaw, limitRaw) {
    const page = Math.max(1, parseInt(String(pageRaw || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(limitRaw || '50'), 10) || 50));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  }

  /**
   * @param {string} firmaId
   */
  async function validateOptionalAuftragId(firmaId, auftragIdRaw) {
    if (auftragIdRaw == null || String(auftragIdRaw).trim() === '') return { ok: true, auftragId: null };
    const aid = String(auftragIdRaw).trim();
    const auftrag = await store.getCcInternAuftragById(aid, firmaId);
    if (!auftrag) {
      return { ok: false, status: 400, error: 'auftrag_id unbekannt oder gehört nicht zur Firma.' };
    }
    return { ok: true, auftragId: aid };
  }

  router.put('/eintraege/:eintragId', clBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const bodyFirma = requiredTrimmed(req.body?.firma_id);
      if (bodyFirma && bodyFirma !== firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id stimmt nicht mit dem Anfragekontext überein.');
      }
      const eintragId = requiredTrimmed(req.params.eintragId);
      if (!eintragId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Eintrag-ID.');
      const cur = await store.getChecklisteEintragByIdAndFirma(eintragId, firmaId);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Checklisten-Eintrag nicht gefunden.');

      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body, 'text')) {
        const text = requiredTrimmed(req.body?.text);
        if (!text) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "text" ist erforderlich.');
        patch.text = text;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'erledigt')) {
        const b = parseBoolStrict(req.body?.erledigt);
        if (b === undefined) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "erledigt" muss ein Boolean sein.');
        patch.erledigt = b;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'reihenfolge')) {
        const ro = Number(req.body?.reihenfolge);
        if (!Number.isFinite(ro)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "reihenfolge" muss eine Zahl sein.');
        }
        patch.reihenfolge = ro;
      }
      if (!Object.keys(patch).length) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine gültigen Felder zum Aktualisieren.');
      }

      const updated = await store.updateChecklisteEintrag(eintragId, firmaId, patch);
      return sendSuccess(res, 200, mapEintrag(updated));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.delete('/eintraege/:eintragId', clBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const bodyFirma = requiredTrimmed(req.body?.firma_id);
      if (bodyFirma && bodyFirma !== firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id stimmt nicht mit dem Anfragekontext überein.');
      }
      const eintragId = requiredTrimmed(req.params.eintragId);
      if (!eintragId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Eintrag-ID.');
      const cur = await store.getChecklisteEintragByIdAndFirma(eintragId, firmaId);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Checklisten-Eintrag nicht gefunden.');
      await store.deleteChecklisteEintrag(eintragId, firmaId);
      return sendSuccess(res, 200, { deleted: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/', clSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const total = await store.countChecklistenByFirma(firmaId);
      const rows = await store.listChecklistenByFirma(firmaId, { offset, limit });
      return sendSuccess(res, 200, {
        items: rows.map((r) => mapCheckliste(r, null)).filter(Boolean),
        pagination: { page, limit, total },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/', clErstellen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const bodyFirma = requiredTrimmed(req.body?.firma_id);
      if (bodyFirma && bodyFirma !== firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id stimmt nicht mit dem Anfragekontext überein.');
      }
      const titel = requiredTrimmed(req.body?.titel);
      if (!titel) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" ist erforderlich.');
      const firma = await store.getFirmaById(firmaId);
      if (!firma) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id ungültig.');

      const vAuf = await validateOptionalAuftragId(firmaId, req.body?.auftrag_id);
      if (!vAuf.ok) return sendError(res, vAuf.status, 'VALIDATION_ERROR', vAuf.error);

      const id = randomUUID();
      const created = await store.insertCheckliste({
        id,
        titel,
        firma_id: firmaId,
        auftrag_id: vAuf.auftragId,
        erstellt_von: req.auth?.userId ?? null,
      });
      return sendSuccess(res, 201, mapCheckliste(created, null));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/:id', clSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Checklisten-ID.');
      const row = await store.getChecklisteById(id, firmaId);
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Checkliste nicht gefunden.');
      const eintraege = await store.listChecklistenEintraegeForCheckliste(id);
      return sendSuccess(res, 200, mapCheckliste(row, eintraege));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.put('/:id', clBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const bodyFirma = requiredTrimmed(req.body?.firma_id);
      if (bodyFirma && bodyFirma !== firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id stimmt nicht mit dem Anfragekontext überein.');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Checklisten-ID.');
      const cur = await store.getChecklisteById(id, firmaId);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Checkliste nicht gefunden.');

      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body, 'titel')) {
        const titel = requiredTrimmed(req.body?.titel);
        if (!titel) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" darf nicht leer sein.');
        patch.titel = titel;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'auftrag_id')) {
        const vAuf = await validateOptionalAuftragId(firmaId, req.body?.auftrag_id);
        if (!vAuf.ok) return sendError(res, vAuf.status, 'VALIDATION_ERROR', vAuf.error);
        patch.auftrag_id = vAuf.auftragId;
      }

      if (!Object.keys(patch).length) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine gültigen Felder zum Aktualisieren.');
      }

      const updated = await store.updateCheckliste(id, firmaId, patch);
      return sendSuccess(res, 200, mapCheckliste(updated, null));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.delete('/:id', clBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Checklisten-ID.');
      const cur = await store.getChecklisteById(id, firmaId);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Checkliste nicht gefunden.');
      await store.deleteCheckliste(id, firmaId);
      return sendSuccess(res, 200, { deleted: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/:id/eintraege', clBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const bodyFirma = requiredTrimmed(req.body?.firma_id);
      if (bodyFirma && bodyFirma !== firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id stimmt nicht mit dem Anfragekontext überein.');
      }
      const checklisteId = requiredTrimmed(req.params.id);
      if (!checklisteId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Checklisten-ID.');
      const liste = await store.getChecklisteById(checklisteId, firmaId);
      if (!liste) return sendError(res, 404, 'NOT_FOUND', 'Checkliste nicht gefunden.');

      const text = requiredTrimmed(req.body?.text);
      if (!text) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "text" ist erforderlich.');

      let erledigt = false;
      if (Object.prototype.hasOwnProperty.call(req.body, 'erledigt')) {
        const b = parseBoolStrict(req.body?.erledigt);
        if (b === undefined) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "erledigt" muss ein Boolean sein.');
        erledigt = b;
      }

      let reihenfolge = await store.nextChecklisteEintragReihenfolge(checklisteId);
      if (Object.prototype.hasOwnProperty.call(req.body, 'reihenfolge')) {
        const ro = Number(req.body?.reihenfolge);
        if (!Number.isFinite(ro)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "reihenfolge" muss eine Zahl sein.');
        }
        reihenfolge = ro;
      }

      const eid = randomUUID();
      const created = await store.insertChecklisteEintrag({
        id: eid,
        checkliste_id: checklisteId,
        text,
        erledigt,
        reihenfolge,
      });
      return sendSuccess(res, 201, mapEintrag(created));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  return router;
}
