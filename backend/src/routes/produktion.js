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
 * Leer oder gültiger Zeitstempel (parsbar); `undefined` = ungültig bei nicht-leerem Input.
 * @param {unknown} raw
 * @returns {string|null|undefined}
 */
function optionalDateTime(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t).toISOString();
}

/** @param {unknown} v */
function produktionDbAbgeschlossenAmLeer(v) {
  if (v == null) return true;
  return String(v).trim() === '';
}

/**
 * @param {unknown} raw
 * @param {{ defaultIfOmitted?: number }} [opts]
 * @returns {number|undefined}
 */
function parseFortschrittStrict(raw, opts = {}) {
  const def = opts.defaultIfOmitted;
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    if (def !== undefined) return def;
    return undefined;
  }
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}

/**
 * @param {object} row
 */
function mapProduktionAuftrag(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    auftrag_id: row.auftrag_id,
    schritt: row.schritt,
    fortschritt: Number(row.fortschritt) || 0,
    verantwortlich: row.verantwortlich ?? null,
    notiz: row.notiz ?? null,
    gestartet_am: row.gestartet_am ?? null,
    abgeschlossen_am: row.abgeschlossen_am ?? null,
    firma_id: row.firma_id,
  };
}

/**
 * @param {object} store
 * @param {{ resolveFirmaIdForRequest: (req: import('express').Request) => Promise<string|null> }} opts
 */
export function createProduktionRouter(store, opts) {
  const resolveFirmaIdForRequest = opts?.resolveFirmaIdForRequest;
  if (typeof resolveFirmaIdForRequest !== 'function') {
    throw new Error('createProduktionRouter: opts.resolveFirmaIdForRequest fehlt');
  }

  const router = Router();

  const prodSehen = chainMiddleware(requireModule('ccintern'), requireRight('ccintern', 'produktion', 'sehen'));
  const prodBearbeiten = chainMiddleware(requireModule('ccintern'), requireRight('ccintern', 'produktion', 'bearbeiten'));

  function parsePagination(pageRaw, limitRaw) {
    const page = Math.max(1, parseInt(String(pageRaw || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(limitRaw || '50'), 10) || 50));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  }

  router.get('/', prodSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const auftragId = requiredTrimmed(req.query?.auftrag_id) || null;
      const verantwortlich = requiredTrimmed(req.query?.verantwortlich) || null;
      const total = await store.countProduktionAuftraegeByFirma(firmaId, { auftragId, verantwortlich });
      const rows = await store.listProduktionAuftraegeByFirma(firmaId, { offset, limit, auftragId, verantwortlich });
      return sendSuccess(res, 200, {
        items: rows.map((r) => mapProduktionAuftrag(r)).filter(Boolean),
        pagination: { page, limit, total },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/', prodBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const bodyFirma = requiredTrimmed(req.body?.firma_id);
      if (bodyFirma && bodyFirma !== firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id stimmt nicht mit dem Anfragekontext überein.');
      }

      const auftragId = requiredTrimmed(req.body?.auftrag_id);
      if (!auftragId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "auftrag_id" ist erforderlich.');
      const auftrag = await store.getCcInternAuftragById(auftragId, firmaId);
      if (!auftrag) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id unbekannt oder gehört nicht zur Firma.');
      }
      if (String(auftrag.firma_id || '').trim() !== String(firmaId).trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Auftrag passt nicht zur gewählten Firma.');
      }

      const schritt = requiredTrimmed(req.body?.schritt);
      if (!schritt) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "schritt" ist erforderlich.');

      const fort = parseFortschrittStrict(req.body?.fortschritt, { defaultIfOmitted: 0 });
      if (fort === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "fortschritt" muss eine Ganzzahl zwischen 0 und 100 sein.');
      }

      let verantwortlich = null;
      if (req.body?.verantwortlich != null && String(req.body.verantwortlich).trim() !== '') {
        const vid = requiredTrimmed(req.body.verantwortlich);
        if (!(await store.getUserById(vid))) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'verantwortlich: Benutzer nicht gefunden.');
        }
        verantwortlich = vid;
      }

      const notizRaw = req.body?.notiz;
      const notiz = notizRaw == null || String(notizRaw).trim() === '' ? null : String(notizRaw);

      let gestartet_am = null;
      if (Object.prototype.hasOwnProperty.call(req.body, 'gestartet_am')) {
        const g = optionalDateTime(req.body?.gestartet_am);
        if (g === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "gestartet_am" ist kein gültiger Zeitstempel.');
        }
        gestartet_am = g;
      }
      let abgeschlossen_am = null;
      if (Object.prototype.hasOwnProperty.call(req.body, 'abgeschlossen_am')) {
        const a = optionalDateTime(req.body?.abgeschlossen_am);
        if (a === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "abgeschlossen_am" ist kein gültiger Zeitstempel.');
        }
        abgeschlossen_am = a;
      }

      if (
        String(schritt).trim().toLowerCase() === 'abgeschlossen' &&
        produktionDbAbgeschlossenAmLeer(abgeschlossen_am) &&
        !Object.prototype.hasOwnProperty.call(req.body, 'abgeschlossen_am')
      ) {
        abgeschlossen_am = new Date().toISOString();
      }

      const id = randomUUID();
      const created = await store.insertProduktionAuftrag({
        id,
        auftrag_id: auftragId,
        schritt,
        fortschritt: fort,
        verantwortlich,
        notiz,
        gestartet_am,
        abgeschlossen_am,
        firma_id: firmaId,
      });
      return sendSuccess(res, 201, mapProduktionAuftrag(created));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/:id', prodSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige ID.');
      const row = await store.getProduktionAuftragById(id, firmaId);
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Produktionsauftrag nicht gefunden.');
      return sendSuccess(res, 200, mapProduktionAuftrag(row));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.patch('/:id', prodBearbeiten, async (req, res, next) => {
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
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige ID.');
      const cur = await store.getProduktionAuftragById(id, firmaId);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Produktionsauftrag nicht gefunden.');

      /** @type {Record<string, unknown>} */
      const patch = {};

      if (Object.prototype.hasOwnProperty.call(req.body, 'auftrag_id')) {
        const aid = requiredTrimmed(req.body?.auftrag_id);
        if (!aid) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "auftrag_id" darf nicht leer sein.');
        const auftrag = await store.getCcInternAuftragById(aid, firmaId);
        if (!auftrag) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id unbekannt oder gehört nicht zur Firma.');
        }
        if (String(auftrag.firma_id || '').trim() !== String(firmaId).trim()) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Auftrag passt nicht zur gewählten Firma.');
        }
        patch.auftrag_id = aid;
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'schritt')) {
        const s = requiredTrimmed(req.body?.schritt);
        if (!s) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "schritt" darf nicht leer sein.');
        patch.schritt = s;
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'fortschritt')) {
        const fort = parseFortschrittStrict(req.body?.fortschritt);
        if (fort === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "fortschritt" muss eine Ganzzahl zwischen 0 und 100 sein.');
        }
        patch.fortschritt = fort;
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'verantwortlich')) {
        const v = req.body?.verantwortlich;
        if (v == null || String(v).trim() === '') {
          patch.verantwortlich = null;
        } else {
          const vid = requiredTrimmed(v);
          if (!(await store.getUserById(vid))) {
            return sendError(res, 400, 'VALIDATION_ERROR', 'verantwortlich: Benutzer nicht gefunden.');
          }
          patch.verantwortlich = vid;
        }
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'notiz')) {
        const n = req.body?.notiz;
        patch.notiz = n == null || String(n).trim() === '' ? null : String(n);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'gestartet_am')) {
        const g = optionalDateTime(req.body?.gestartet_am);
        if (g === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "gestartet_am" ist kein gültiger Zeitstempel.');
        }
        patch.gestartet_am = g;
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'abgeschlossen_am')) {
        const a = optionalDateTime(req.body?.abgeschlossen_am);
        if (a === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "abgeschlossen_am" ist kein gültiger Zeitstempel.');
        }
        patch.abgeschlossen_am = a;
      }

      if (!Object.keys(patch).length) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine gültigen Felder zum Aktualisieren.');
      }

      const zielSchritt = String(patch.schritt !== undefined ? patch.schritt : cur.schritt || '')
        .trim()
        .toLowerCase();
      if (
        zielSchritt === 'abgeschlossen' &&
        produktionDbAbgeschlossenAmLeer(cur.abgeschlossen_am) &&
        !Object.prototype.hasOwnProperty.call(req.body, 'abgeschlossen_am')
      ) {
        patch.abgeschlossen_am = new Date().toISOString();
      }

      const updated = await store.updateProduktionAuftrag(id, firmaId, patch);

      try {
        const schrittFinal = String(updated?.schritt || '')
          .trim()
          .toLowerCase();
        if (schrittFinal === 'abgeschlossen') {
          const auftragIdFinal = String(updated?.auftrag_id || '').trim();
          if (
            auftragIdFinal &&
            typeof store.listCcInternRechnungenByFirma === 'function' &&
            typeof store.insertCcInternRechnung === 'function' &&
            typeof store.getLastCcInternRechnungsnummerForYear === 'function'
          ) {
            const existing = await store.listCcInternRechnungenByFirma(firmaId, {
              offset: 0,
              limit: 10000,
              status: null,
            });
            const hasRechnung =
              Array.isArray(existing) &&
              existing.some((row) => String(row?.auftrag_id || '').trim() === auftragIdFinal);
            if (!hasRechnung) {
              const year = new Date().getFullYear();
              const last = await store.getLastCcInternRechnungsnummerForYear(year);
              const reNum = String(last?.rechnungsnummer || '');
              const m = reNum.match(new RegExp(`^RE-${year}-(\\d{3})$`));
              const nextSeq = (m ? Number.parseInt(m[1], 10) : 0) + 1;
              const rechnungsnummer = `RE-${year}-${String(nextSeq).padStart(3, '0')}`;
              const uid = typeof req.auth?.userId === 'string' ? req.auth.userId.trim() : null;
              await store.insertCcInternRechnung({
                id: randomUUID(),
                rechnungsnummer,
                auftrag_id: auftragIdFinal,
                status: 'offen',
                faellig_am: null,
                bezahlt_am: null,
                bemerkung: 'Automatisch angelegt (Produktion: Schritt abgeschlossen).',
                firma_id: firmaId,
                erstellt_von: uid,
              });
            }
          }
        }
      } catch (eAuto) {
        console.error('[produktion] auto ccintern_rechnungen nach abgeschlossen', eAuto);
      }

      return sendSuccess(res, 200, mapProduktionAuftrag(updated));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  return router;
}
