import { Router } from 'express';
import { sendError, sendSuccess } from '../../lib/api-v1-envelope.js';
import { chainMiddleware } from '../../middleware/project-access.js';
import { requireModule, requireRight } from '../../middleware/require-rights.js';

const SCHRITT_SET = new Set(['grafik', 'druck', 'laminat', 'montage', 'doku']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
 * @param {unknown} row
 */
function mapZuordnungRow(row) {
  if (!row || typeof row !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (row);
  return {
    id: o.id != null ? String(o.id) : '',
    firma_id: o.firma_id != null ? String(o.firma_id) : '',
    produkt_id: o.produkt_id != null ? String(o.produkt_id) : '',
    schritt: o.schritt != null ? String(o.schritt) : '',
    checkliste_id: o.checkliste_id != null ? String(o.checkliste_id) : '',
    sortierung: Number(o.sortierung) || 0,
    aktiv: Boolean(Number(o.aktiv)),
    created_at: o.created_at != null ? String(o.created_at) : '',
    updated_at: o.updated_at != null && String(o.updated_at).trim() !== '' ? String(o.updated_at) : null,
  };
}

/**
 * @param {object} store
 * @param {{ resolveFirmaIdForRequest: (req: import('express').Request) => Promise<string|null> }} opts
 */
export function createCcInternChecklistenZuordnungRouter(store, opts) {
  const resolveFirmaIdForRequest = opts?.resolveFirmaIdForRequest;
  if (typeof resolveFirmaIdForRequest !== 'function') {
    throw new Error('createCcInternChecklistenZuordnungRouter: opts.resolveFirmaIdForRequest fehlt');
  }

  const clSehen = chainMiddleware(requireModule('ccintern'), requireRight('ccintern', 'checklisten', 'sehen'));
  const clBearbeiten = chainMiddleware(requireModule('ccintern'), requireRight('ccintern', 'checklisten', 'bearbeiten'));

  const router = Router();

  router.get('/', clSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const bodyFirma = requiredTrimmed(req.query?.firma_id);
      if (bodyFirma && bodyFirma !== firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id stimmt nicht mit dem Anfragekontext überein.');
      }

      const produktRaw = requiredTrimmed(req.query?.produkt_id);
      if (produktRaw.length > 96) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'produkt_id zu lang.');
      }

      let rows;
      if (produktRaw) {
        rows = await store.listCcInternChecklistenZuordnungForProdukt(firmaId, produktRaw);
      } else {
        rows = await store.listCcInternChecklistenZuordnung(firmaId);
      }

      const items = (Array.isArray(rows) ? rows : [])
        .map((r) => mapZuordnungRow(r))
        .filter((x) => x && SCHRITT_SET.has(x.schritt));

      return sendSuccess(res, 200, { items });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/', clBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const bodyFirma = requiredTrimmed(req.body?.firma_id);
      if (bodyFirma && bodyFirma !== firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id im Body weicht vom Anfragekontext ab.');
      }

      const produkt_id = requiredTrimmed(req.body?.produkt_id);
      if (!produkt_id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "produkt_id" ist erforderlich.');
      }
      if (produkt_id.length > 96) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'produkt_id zu lang.');
      }

      const schritt = requiredTrimmed(req.body?.schritt);
      if (!schritt || !SCHRITT_SET.has(schritt)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "schritt" muss grafik, druck, laminat, montage oder doku sein.');
      }

      const checkliste_id = requiredTrimmed(req.body?.checkliste_id);
      if (!checkliste_id || !UUID_RE.test(checkliste_id)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "checkliste_id" ist eine gültige UUID.');
      }

      const cl = await store.getChecklisteById(checkliste_id, firmaId);
      if (!cl) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Checkliste nicht gefunden oder gehört nicht zur Firma.');
      }

      let sortierung = 0;
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'sortierung')) {
        const n = Number(req.body?.sortierung);
        if (!Number.isFinite(n)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "sortierung" muss eine Zahl sein.');
        }
        sortierung = Math.trunc(n);
      }

      /** @type {{ produkt_id: string; schritt: string; checkliste_id: string; sortierung: number; aktiv?: boolean }} */
      const rowIn = { produkt_id, schritt, checkliste_id, sortierung };
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'aktiv')) {
        const b = parseBoolStrict(req.body?.aktiv);
        if (b === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "aktiv" muss ein Boolean sein.');
        }
        rowIn.aktiv = b;
      }

      // Upsert: existierende Kombination zurückgeben statt Duplikat anlegen
      if (typeof store.findCcInternChecklistenZuordnungByKey === 'function') {
        const existing = await store.findCcInternChecklistenZuordnungByKey(
          firmaId, produkt_id, schritt, checkliste_id,
        );
        if (existing) {
          const mappedExisting = mapZuordnungRow(existing);
          if (mappedExisting) return sendSuccess(res, 200, { item: mappedExisting });
        }
      }

      const created = await store.createCcInternChecklistenZuordnung(firmaId, rowIn);
      const mapped = mapZuordnungRow(created);
      if (!mapped) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Zuordnung konnte nicht geladen werden.');
      }
      return sendSuccess(res, 201, { item: mapped });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/:id', clBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const bodyFirma = requiredTrimmed(req.body?.firma_id);
      if (bodyFirma && bodyFirma !== firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id im Body weicht vom Anfragekontext ab.');
      }

      const zid = requiredTrimmed(req.params?.id);
      if (!zid || !UUID_RE.test(zid)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Zuordnungs-ID.');
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      /** @type {Record<string, unknown>} */
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(body, 'produkt_id')) {
        const p = requiredTrimmed(body.produkt_id);
        if (!p) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'produkt_id darf nicht leer sein.');
        }
        if (p.length > 96) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'produkt_id zu lang.');
        }
        patch.produkt_id = p;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'schritt')) {
        const st = requiredTrimmed(body.schritt);
        if (!st || !SCHRITT_SET.has(st)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "schritt" muss grafik, druck, laminat, montage oder doku sein.');
        }
        patch.schritt = st;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'checkliste_id')) {
        const cid = requiredTrimmed(body.checkliste_id);
        if (!cid || !UUID_RE.test(cid)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "checkliste_id" ist eine gültige UUID.');
        }
        const cl = await store.getChecklisteById(cid, firmaId);
        if (!cl) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Checkliste nicht gefunden oder gehört nicht zur Firma.');
        }
        patch.checkliste_id = cid;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'sortierung')) {
        const n = Number(body.sortierung);
        if (!Number.isFinite(n)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "sortierung" muss eine Zahl sein.');
        }
        patch.sortierung = Math.trunc(n);
      }
      if (Object.prototype.hasOwnProperty.call(body, 'aktiv')) {
        const b = parseBoolStrict(body.aktiv);
        if (b === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "aktiv" muss ein Boolean sein.');
        }
        patch.aktiv = b;
      }

      if (!Object.keys(patch).length) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Mindestens ein Feld zum Aktualisieren ist erforderlich.');
      }

      const updated = await store.updateCcInternChecklistenZuordnung(zid, firmaId, patch);
      const mapped = mapZuordnungRow(updated);
      if (!mapped) {
        return sendError(res, 404, 'NOT_FOUND', 'Zuordnung nicht gefunden.');
      }
      return sendSuccess(res, 200, { item: mapped });
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/:id', clBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const bodyFirma = requiredTrimmed(req.body?.firma_id);
      if (bodyFirma && bodyFirma !== firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id im Body weicht vom Anfragekontext ab.');
      }

      const zid = requiredTrimmed(req.params?.id);
      if (!zid || !UUID_RE.test(zid)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Zuordnungs-ID.');
      }

      const ok = await store.deleteCcInternChecklistenZuordnung(zid, firmaId);
      if (!ok) {
        return sendError(res, 404, 'NOT_FOUND', 'Zuordnung nicht gefunden.');
      }
      return sendSuccess(res, 200, { deleted: true, id: zid });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
