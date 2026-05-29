/**
 * CC Intern — Mitarbeiter Quick-Status (pro Tag) + Anwesenheitseinträge.
 * Mount: `/api/v1/ccintern/mitarbeiter`
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../../lib/api-v1-envelope.js';
import {
  arbeitszeitSessionLogFields,
  formatArbeitszeitDeHm,
  mapArbeitszeitSessionRow,
  netDurationMinutes,
  pauseMinutesFromSession,
} from '../../lib/arbeitszeit-session.js';
import { canonicalWorkflowStep } from '../../lib/ccintern-workflow-bemerkung.js';
import {
  auftragArbeitsSessionLogFields,
  mapAuftragArbeitsSessionRow,
} from '../../lib/auftrag-arbeitszeit-session.js';
import { persistAuftragZeitbuchungOnStop } from '../../lib/ccintern-auftrag-zeiten.js';

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

  /**
   * Laufende Tages-Arbeitszeit-Session (nur JWT-user_id, optional x-project-id).
   * @param {import('express').Request} req
   * @returns {Promise<{ userId: string, projectId: string|null }|null>}
   */
  async function arbeitszeitAuthContext(req) {
    const userId = requiredTrimmed(req.auth?.userId);
    if (!userId) return null;
    const firmaId = await resolveFirmaIdForRequest(req);
    if (!firmaId) return null;
    if (!(await store.getUserById(userId))) return null;
    return { userId, projectId: effectiveProjectId(req), firmaId };
  }

  router.get('/arbeitszeit/aktiv', requireMaOperativSehen, async (req, res, next) => {
    try {
      const ctx = await arbeitszeitAuthContext(req);
      if (!ctx) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const row = await store.getCcInternArbeitszeitSessionByUserProject(ctx.userId, ctx.projectId);
      const session = mapArbeitszeitSessionRow(row);
      console.info('[ARBEITSZEIT_SESSION_GET]', arbeitszeitSessionLogFields(session));
      return sendSuccess(res, 200, { session });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/arbeitszeit/start', requireMaOperativWrite, async (req, res, next) => {
    try {
      const ctx = await arbeitszeitAuthContext(req);
      if (!ctx) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      let row = await store.getCcInternArbeitszeitSessionByUserProject(ctx.userId, ctx.projectId);
      if (!row) {
        const id = randomUUID();
        const startedAt = new Date().toISOString();
        try {
          row = await store.insertCcInternArbeitszeitSession({
            id,
            user_id: ctx.userId,
            project_id: ctx.projectId,
            status: 'running',
            started_at: startedAt,
            pause_seconds: 0,
            pause_started_at: null,
          });
        } catch (insertErr) {
          row = await store.getCcInternArbeitszeitSessionByUserProject(ctx.userId, ctx.projectId);
          if (!row) throw insertErr;
        }
      }
      const session = mapArbeitszeitSessionRow(row);
      console.info('[ARBEITSZEIT_START]', arbeitszeitSessionLogFields(session));
      return sendSuccess(res, 200, { session });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/arbeitszeit/pause', requireMaOperativWrite, async (req, res, next) => {
    try {
      const ctx = await arbeitszeitAuthContext(req);
      if (!ctx) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const row = await store.getCcInternArbeitszeitSessionByUserProject(ctx.userId, ctx.projectId);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Keine aktive Arbeitszeit-Session.');
      }
      let updated = row;
      if (row.status !== 'paused') {
        updated = await store.updateCcInternArbeitszeitSession(row.id, {
          status: 'paused',
          pause_started_at: new Date().toISOString(),
        });
      }
      const session = mapArbeitszeitSessionRow(updated);
      console.info('[ARBEITSZEIT_PAUSE]', arbeitszeitSessionLogFields(session));
      return sendSuccess(res, 200, { session });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/arbeitszeit/weiter', requireMaOperativWrite, async (req, res, next) => {
    try {
      const ctx = await arbeitszeitAuthContext(req);
      if (!ctx) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const row = await store.getCcInternArbeitszeitSessionByUserProject(ctx.userId, ctx.projectId);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Keine aktive Arbeitszeit-Session.');
      }
      let updated = row;
      if (row.status === 'paused') {
        const now = new Date();
        let pauseSec = Math.max(0, Math.floor(Number(row.pause_seconds ?? 0) || 0));
        if (row.pause_started_at) {
          const ps = new Date(row.pause_started_at);
          if (!Number.isNaN(ps.getTime())) {
            pauseSec += Math.max(0, Math.floor((now.getTime() - ps.getTime()) / 1000));
          }
        }
        updated = await store.updateCcInternArbeitszeitSession(row.id, {
          status: 'running',
          pause_seconds: pauseSec,
          pause_started_at: null,
        });
      }
      const session = mapArbeitszeitSessionRow(updated);
      console.info('[ARBEITSZEIT_WEITER]', arbeitszeitSessionLogFields(session));
      return sendSuccess(res, 200, { session });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/arbeitszeit/stop', requireMaOperativWrite, async (req, res, next) => {
    try {
      const ctx = await arbeitszeitAuthContext(req);
      if (!ctx) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const row = await store.getCcInternArbeitszeitSessionByUserProject(ctx.userId, ctx.projectId);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Keine aktive Arbeitszeit-Session.');
      }
      const now = new Date();
      const sessionMapped = mapArbeitszeitSessionRow(row);
      const dauerMin = netDurationMinutes(sessionMapped, now);
      const pauseMin = pauseMinutesFromSession(sessionMapped, now);
      const started = new Date(row.started_at);
      if (Number.isNaN(started.getTime())) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Session (started_at).');
      }
      const datum = now.toISOString().slice(0, 10);
      const anwId = randomUUID();
      const anwRow = await store.insertCcInternMitarbeiterAnwesenheit({
        id: anwId,
        project_id: ctx.projectId,
        user_id: ctx.userId,
        firma_id: ctx.firmaId,
        datum,
        start: formatArbeitszeitDeHm(started),
        ende: formatArbeitszeitDeHm(now),
        pause_minuten: pauseMin,
        dauer_minuten: dauerMin,
        typ: 'anwesenheit',
        notiz: null,
      });
      await store.deleteCcInternArbeitszeitSession(row.id);
      console.info('[ARBEITSZEIT_STOP]', {
        ...arbeitszeitSessionLogFields(sessionMapped, now),
        dauer_minuten: dauerMin,
        pause_minuten: pauseMin,
        anwesenheit_id: anwId,
      });
      return sendSuccess(res, 200, {
        session: null,
        anwesenheit: mapAnwRow(anwRow),
      });
    } catch (e) {
      return next(e);
    }
  });

  /**
   * @param {import('express').Request} req
   * @returns {Promise<{ userId: string, firmaId: string }|null>}
   */
  async function auftragArbeitsJwtContext(req) {
    const userId = requiredTrimmed(req.auth?.userId);
    if (!userId) return null;
    const firmaId = await resolveFirmaIdForRequest(req);
    if (!firmaId) return null;
    if (!(await store.getUserById(userId))) return null;
    return { userId, firmaId };
  }

  /**
   * @param {string} firmaId
   * @param {string} userId
   * @param {string} auftragId
   * @param {string} schrittKey
   */
  async function assertMayStartAuftragArbeits(firmaId, userId, auftragId, schrittKey) {
    const auftrag = await store.getCcInternAuftragById(auftragId, firmaId);
    if (!auftrag) return { ok: false, code: 404, msg: 'Auftrag nicht gefunden.' };
    const may = await store.userMayReportZeitForCcAuftrag(firmaId, userId, auftragId);
    if (!may) return { ok: false, code: 403, msg: 'Keine Berechtigung für diesen Auftrag.' };
    if (!schrittKey) return { ok: false, code: 400, msg: 'Feld „schritt_key“ ist erforderlich.' };
    return { ok: true, auftrag };
  }

  router.get('/auftrag-arbeitszeit/alle-aktiv', requireMaOperativSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt.');
      }
      const rows = await store.listCcInternAuftragArbeitsSessionsAllActive(firmaId);
      const sessions = (Array.isArray(rows) ? rows : [])
        .map((r) => mapAuftragArbeitsSessionRow(r))
        .filter(Boolean);
      return sendSuccess(res, 200, { sessions });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/auftrag-arbeitszeit/aktiv', requireMaOperativSehen, async (req, res, next) => {
    try {
      const ctx = await auftragArbeitsJwtContext(req);
      if (!ctx) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const row = await store.getCcInternAuftragArbeitsSessionActiveByUser(ctx.userId);
      const session = mapAuftragArbeitsSessionRow(row);
      console.info('[AUFTRAG_ARBEITSZEIT_SESSION_GET]', auftragArbeitsSessionLogFields(session));
      return sendSuccess(res, 200, { session });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/auftrag-arbeitszeit/start', requireMaOperativWrite, async (req, res, next) => {
    try {
      const ctx = await auftragArbeitsJwtContext(req);
      if (!ctx) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const auftragId = requiredTrimmed(req.body?.auftrag_id);
      const schrittRaw = requiredTrimmed(req.body?.schritt_key);
      if (!auftragId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „auftrag_id“ ist erforderlich.');
      }
      const schrittKey = canonicalWorkflowStep(schrittRaw);
      const gate = await assertMayStartAuftragArbeits(ctx.firmaId, ctx.userId, auftragId, schrittKey);
      if (!gate.ok) {
        return sendError(res, gate.code, gate.code === 403 ? 'FORBIDDEN' : gate.code === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR', gate.msg);
      }

      let active = await store.getCcInternAuftragArbeitsSessionActiveByUser(ctx.userId);
      if (active) {
        const same =
          String(active.auftrag_id) === auftragId &&
          canonicalWorkflowStep(active.schritt_key) === schrittKey;
        if (same) {
          if (active.status === 'paused') {
            let pauseSec = Math.max(0, Math.floor(Number(active.pause_seconds ?? 0) || 0));
            if (active.pause_started_at) {
              const ps = new Date(active.pause_started_at);
              if (!Number.isNaN(ps.getTime())) {
                pauseSec += Math.max(0, Math.floor((Date.now() - ps.getTime()) / 1000));
              }
            }
            active = await store.updateCcInternAuftragArbeitsSession(active.id, {
              status: 'running',
              pause_seconds: pauseSec,
              pause_started_at: null,
            });
          }
          const session = mapAuftragArbeitsSessionRow(active);
          console.info('[AUFTRAG_ARBEITSZEIT_START]', auftragArbeitsSessionLogFields(session));
          return sendSuccess(res, 200, { session });
        }
        await store.stopCcInternAuftragArbeitsSessionsForUser(ctx.userId);
      }

      const id = randomUUID();
      const startedAt = new Date().toISOString();
      let row;
      try {
        row = await store.insertCcInternAuftragArbeitsSession({
          id,
          user_id: ctx.userId,
          auftrag_id: auftragId,
          schritt_key: schrittKey,
          status: 'running',
          started_at: startedAt,
          pause_seconds: 0,
          pause_started_at: null,
        });
      } catch (insertErr) {
        row = await store.getCcInternAuftragArbeitsSessionActiveByUser(ctx.userId);
        if (!row) throw insertErr;
      }
      const session = mapAuftragArbeitsSessionRow(row);
      console.info('[AUFTRAG_ARBEITSZEIT_START]', auftragArbeitsSessionLogFields(session));
      return sendSuccess(res, 200, { session });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/auftrag-arbeitszeit/pause', requireMaOperativWrite, async (req, res, next) => {
    try {
      const ctx = await auftragArbeitsJwtContext(req);
      if (!ctx) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const auftragId = requiredTrimmed(req.body?.auftrag_id);
      const schrittKey = canonicalWorkflowStep(requiredTrimmed(req.body?.schritt_key));
      const row = await store.getCcInternAuftragArbeitsSessionActiveByUser(ctx.userId);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Keine aktive Auftrags-Arbeit.');
      }
      if (auftragId && String(row.auftrag_id) !== auftragId) {
        return sendError(res, 409, 'CONFLICT', 'Anderer Auftrag ist aktiv.');
      }
      if (schrittKey && canonicalWorkflowStep(row.schritt_key) !== schrittKey) {
        return sendError(res, 409, 'CONFLICT', 'Anderer Schritt ist aktiv.');
      }
      let updated = row;
      if (row.status !== 'paused') {
        updated = await store.updateCcInternAuftragArbeitsSession(row.id, {
          status: 'paused',
          pause_started_at: new Date().toISOString(),
        });
      }
      const session = mapAuftragArbeitsSessionRow(updated);
      console.info('[AUFTRAG_ARBEITSZEIT_PAUSE]', auftragArbeitsSessionLogFields(session));
      return sendSuccess(res, 200, { session });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/auftrag-arbeitszeit/weiter', requireMaOperativWrite, async (req, res, next) => {
    try {
      const ctx = await auftragArbeitsJwtContext(req);
      if (!ctx) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const auftragId = requiredTrimmed(req.body?.auftrag_id);
      const schrittKey = canonicalWorkflowStep(requiredTrimmed(req.body?.schritt_key));
      const row = await store.getCcInternAuftragArbeitsSessionActiveByUser(ctx.userId);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Keine aktive Auftrags-Arbeit.');
      }
      if (auftragId && String(row.auftrag_id) !== auftragId) {
        return sendError(res, 409, 'CONFLICT', 'Anderer Auftrag ist aktiv.');
      }
      if (schrittKey && canonicalWorkflowStep(row.schritt_key) !== schrittKey) {
        return sendError(res, 409, 'CONFLICT', 'Anderer Schritt ist aktiv.');
      }
      let updated = row;
      if (row.status === 'paused') {
        const now = new Date();
        let pauseSec = Math.max(0, Math.floor(Number(row.pause_seconds ?? 0) || 0));
        if (row.pause_started_at) {
          const ps = new Date(row.pause_started_at);
          if (!Number.isNaN(ps.getTime())) {
            pauseSec += Math.max(0, Math.floor((now.getTime() - ps.getTime()) / 1000));
          }
        }
        updated = await store.updateCcInternAuftragArbeitsSession(row.id, {
          status: 'running',
          pause_seconds: pauseSec,
          pause_started_at: null,
        });
      }
      const session = mapAuftragArbeitsSessionRow(updated);
      console.info('[AUFTRAG_ARBEITSZEIT_WEITER]', auftragArbeitsSessionLogFields(session));
      return sendSuccess(res, 200, { session });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/auftrag-arbeitszeit/stop', requireMaOperativWrite, async (req, res, next) => {
    try {
      const ctx = await auftragArbeitsJwtContext(req);
      if (!ctx) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const auftragId = requiredTrimmed(req.body?.auftrag_id);
      const schrittKey = canonicalWorkflowStep(requiredTrimmed(req.body?.schritt_key));
      const row = await store.getCcInternAuftragArbeitsSessionActiveByUser(ctx.userId);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Keine aktive Auftrags-Arbeit.');
      }
      if (auftragId && String(row.auftrag_id) !== auftragId) {
        return sendError(res, 409, 'CONFLICT', 'Anderer Auftrag ist aktiv.');
      }
      if (schrittKey && canonicalWorkflowStep(row.schritt_key) !== schrittKey) {
        return sendError(res, 409, 'CONFLICT', 'Anderer Schritt ist aktiv.');
      }
      const now = new Date();
      let pauseSec = Math.max(0, Math.floor(Number(row.pause_seconds ?? 0) || 0));
      if (row.status === 'paused' && row.pause_started_at) {
        const ps = new Date(row.pause_started_at);
        if (!Number.isNaN(ps.getTime())) {
          pauseSec += Math.max(0, Math.floor((now.getTime() - ps.getTime()) / 1000));
        }
      }
      const updated = await store.updateCcInternAuftragArbeitsSession(row.id, {
        status: 'stopped',
        pause_seconds: pauseSec,
        pause_started_at: null,
      });
      const session = mapAuftragArbeitsSessionRow(updated);
      console.info('[AUFTRAG_ARBEITSZEIT_STOP]', auftragArbeitsSessionLogFields(session));

      console.info('[AUFTRAG_ZEIT_STOP_START]', {
        user_id: ctx.userId,
        auftrag_id: updated.auftrag_id,
        schritt_key: updated.schritt_key,
      });
      const user = await store.getUserById(ctx.userId);
      const booking = await persistAuftragZeitbuchungOnStop(store, {
        firmaId: ctx.firmaId,
        sessionRow: updated,
        user,
        now,
      });
      if (booking.ok) {
        console.info('[AUFTRAG_ZEIT_STOP_SERVER_OK]', {
          auftrag_id: updated.auftrag_id,
          user_id: ctx.userId,
          dauer_minuten: booking.entry?.dauer,
          zeiten_count: booking.zeitenCount,
        });
        console.info('[MITARBEITER_AUFTRAGSZEIT_SOURCE]', {
          source: 'ccintern_auftraege.bemerkung.__ccintern_v1.payload.zeiten',
        });
      } else {
        console.warn('[AUFTRAG_ZEIT_STOP_SERVER_OK]', { ok: false, reason: booking.reason });
      }

      return sendSuccess(res, 200, {
        session,
        zeitbuchung: booking.ok ? booking.entry : null,
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
