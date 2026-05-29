/**
 * CC Intern — Mitarbeiter Quick-Status (pro Tag) + Anwesenheitseinträge.
 * Mount: `/api/v1/ccintern/mitarbeiter`
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../../lib/api-v1-envelope.js';

const STATUS_SET = new Set(['verfuegbar', 'homeoffice', 'abwesend', 'krank', 'urlaub']);
const ANW_TYP = new Set(['anwesenheit', 'kurzabwesenheit']);

/**
 * @param {unknown} v
 */
function requiredTrimmed(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @param {unknown} v
 */
function nullableTrimmed(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
}

/**
 * @param {import('express').Request} req
 * @returns {any}
 */
function accessProfile(req) {
  return req.accessProfile;
}

/**
 * @param {any} p
 */
function isSuper(p) {
  return !!(p && typeof p.isSuperAdmin === 'function' && p.isSuperAdmin());
}

/**
 * @param {any} p
 */
function canMitarbeiterSehen(p) {
  return !!(p && p.has('ccintern', 'mitarbeiter', 'sehen'));
}

/**
 * @param {any} p
 */
function canMitarbeiterBearbeiten(p) {
  return !!(p && p.has('ccintern', 'mitarbeiter', 'bearbeiten'));
}

/**
 * @param {any} p
 */
function canMaAppSehen(p) {
  return !!(p && p.has('ccintern', 'mitarbeiterapp', 'sehen'));
}

/**
 * @param {any} p
 */
function canMaAppSchreiben(p) {
  return !!(p && p.has('ccintern', 'mitarbeiterapp', 'erstellen'));
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireMaOperativSehen(req, res, next) {
  const p = accessProfile(req);
  if (!p) return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
  if (isSuper(p) || canMitarbeiterSehen(p) || canMaAppSehen(p)) return next();
  return sendError(res, 403, 'FORBIDDEN', 'Kein Zugriff.');
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireMaOperativWrite(req, res, next) {
  const p = accessProfile(req);
  if (!p) return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
  if (isSuper(p) || canMitarbeiterBearbeiten(p) || canMaAppSchreiben(p)) return next();
  return sendError(res, 403, 'FORBIDDEN', 'Kein Zugriff.');
}

/**
 * @param {import('express').Request} req
 */
function effectiveProjectId(req) {
  const h = nullableTrimmed(req.get('x-project-id'));
  if (h) return h;
  return nullableTrimmed(req.body?.project_id);
}

/**
 * @param {any} row
 */
function mapStatusRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    project_id: row.project_id ?? null,
    user_id: row.user_id,
    status: row.status,
    datum: row.datum,
    mitarbeiter_name: row.mitarbeiter_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

/**
 * @param {any} row
 */
function mapAnwRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    project_id: row.project_id ?? null,
    user_id: row.user_id,
    datum: row.datum,
    start: row.start ?? null,
    ende: row.ende ?? null,
    pause_minuten: Number(row.pause_minuten ?? 0),
    dauer_minuten: row.dauer_minuten != null ? Number(row.dauer_minuten) : null,
    typ: row.typ,
    notiz: row.notiz ?? null,
    mitarbeiter_name: row.mitarbeiter_name ?? null,
    created_at: row.created_at,
  };
}

/**
 * @param {unknown} store
 * @param {{ resolveFirmaIdForRequest: (req: import('express').Request) => Promise<string|null> }} opts
 */
export function createCcInternMitarbeiterOperativRouter(store, opts) {
  const resolveFirmaIdForRequest = opts?.resolveFirmaIdForRequest;
  if (typeof resolveFirmaIdForRequest !== 'function') {
    throw new Error('createCcInternMitarbeiterOperativRouter: opts.resolveFirmaIdForRequest fehlt');
  }

  const router = Router();

  router.get('/status', requireMaOperativSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const authUid = requiredTrimmed(req.auth?.userId);
      let userId = nullableTrimmed(req.query?.user_id);
      const datumVon = nullableTrimmed(req.query?.datum_von);
      const datumBis = nullableTrimmed(req.query?.datum_bis);
      const p = accessProfile(req);
      if (!isSuper(p) && !canMitarbeiterSehen(p) && canMaAppSehen(p)) {
        userId = authUid || null;
      }
      const rows = await store.listCcInternMitarbeiterStatusByFirma(firmaId, {
        user_id: userId,
        datum_von: datumVon,
        datum_bis: datumBis,
      });
      return sendSuccess(res, 200, {
        status: rows.map(mapStatusRow).filter(Boolean),
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/status', requireMaOperativWrite, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const authUid = requiredTrimmed(req.auth?.userId);
      let userId = requiredTrimmed(req.body?.user_id);
      if (!userId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "user_id" ist erforderlich.');
      const p = accessProfile(req);
      if (!isSuper(p) && !canMitarbeiterBearbeiten(p)) {
        if (!canMaAppSchreiben(p)) {
          return sendError(res, 403, 'FORBIDDEN', 'Kein Zugriff.');
        }
        if (userId !== authUid) {
          return sendError(res, 403, 'FORBIDDEN', 'Nur eigener Status erlaubt.');
        }
      }
      if (!(await store.getUserById(userId))) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Benutzer nicht gefunden.');
      }
      const status = requiredTrimmed(req.body?.status);
      if (!STATUS_SET.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
      }
      const datum =
        nullableTrimmed(req.body?.datum) || new Date().toISOString().slice(0, 10);
      const projectId = effectiveProjectId(req);
      const row = await store.upsertCcInternMitarbeiterTagStatus({
        id: randomUUID(),
        project_id: projectId,
        user_id: userId,
        firma_id: firmaId,
        status,
        datum,
      });
      if (!row) return sendError(res, 500, 'INTERNAL_ERROR', 'Speichern fehlgeschlagen.');
      return sendSuccess(res, 200, { status: mapStatusRow(row) });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/anwesenheit', requireMaOperativSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const authUid = requiredTrimmed(req.auth?.userId);
      let userId = nullableTrimmed(req.query?.user_id);
      const datumVon = nullableTrimmed(req.query?.datum_von);
      const datumBis = nullableTrimmed(req.query?.datum_bis);
      const p = accessProfile(req);
      if (!isSuper(p) && !canMitarbeiterSehen(p) && canMaAppSehen(p)) {
        userId = authUid || null;
      }
      const rows = await store.listCcInternMitarbeiterAnwesenheitByFirma(firmaId, {
        user_id: userId,
        datum_von: datumVon,
        datum_bis: datumBis,
        limit: 3000,
      });
      return sendSuccess(res, 200, {
        anwesenheit: rows.map(mapAnwRow).filter(Boolean),
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/anwesenheit', requireMaOperativWrite, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const authUid = requiredTrimmed(req.auth?.userId);
      let userId = requiredTrimmed(req.body?.user_id);
      if (!userId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "user_id" ist erforderlich.');
      const p = accessProfile(req);
      if (!isSuper(p) && !canMitarbeiterBearbeiten(p)) {
        if (!canMaAppSchreiben(p)) {
          return sendError(res, 403, 'FORBIDDEN', 'Kein Zugriff.');
        }
        if (userId !== authUid) {
          return sendError(res, 403, 'FORBIDDEN', 'Nur eigene Anwesenheit erlaubt.');
        }
      }
      if (!(await store.getUserById(userId))) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Benutzer nicht gefunden.');
      }
      const datum = nullableTrimmed(req.body?.datum);
      if (!datum) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "datum" ist erforderlich.');
      const typRaw = nullableTrimmed(req.body?.typ) || 'anwesenheit';
      if (!ANW_TYP.has(typRaw)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger typ (anwesenheit/kurzabwesenheit).');
      }
      const start = nullableTrimmed(req.body?.start);
      const ende = nullableTrimmed(req.body?.ende ?? req.body?.end);
      const pauseMin = Math.max(0, Math.round(Number(req.body?.pause_minuten ?? 0) || 0));
      const dauerMinRaw = req.body?.dauer_minuten ?? req.body?.dauer;
      const dauerMin =
        dauerMinRaw != null && String(dauerMinRaw).trim() !== '' ? Math.round(Number(dauerMinRaw)) : null;
      const notiz = nullableTrimmed(req.body?.notiz);
      const projectId = effectiveProjectId(req);
      const id = randomUUID();
      const row = await store.insertCcInternMitarbeiterAnwesenheit({
        id,
        project_id: projectId,
        user_id: userId,
        firma_id: firmaId,
        datum,
        start,
        ende,
        pause_minuten: pauseMin,
        dauer_minuten: dauerMin,
        typ: typRaw,
        notiz,
      });
      if (!row) return sendError(res, 500, 'INTERNAL_ERROR', 'Speichern fehlgeschlagen.');
      return sendSuccess(res, 201, { anwesenheit: mapAnwRow(row) });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
