import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireModule, requireRight } from '../middleware/require-rights.js';

/**
 * LEGACY — nur Markierung, keine Migration: Router und Store-Aufrufe (`listKunden`, `getKundeById`, `insertKunde`, `updateKunde`) arbeiten auf der Tabelle **kunden** (altes Projekt-Kundenmodell). Neue Entwicklung muss **firmen** bzw. `/api/v1/firmen` oder `/api/v1/stammdaten/kunden` verwenden (siehe `api-v1.js`). **projects.kunden_id** bleibt bis zu einer separaten Migration unverändert.
 */

/**
 * @param {object} row
 */
function mapKunde(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    name: row.name,
    ansprechpartner: row.ansprechpartner ?? null,
    telefon: row.telefon ?? null,
    email: row.email ?? null,
    adresse: row.adresse ?? null,
    created_at: row.created_at,
  };
}

/**
 * LEGACY: HTTP auf Tabelle `kunden` via Store — nicht für neue Features erweitern.
 *
 * @param {object} store
 */
export function createKundenRouter(store) {
  const router = Router();

  const kdSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'kunden', 'sehen'));
  const kdErstellen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'kunden', 'erstellen'));
  const kdBearbeiten = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'kunden', 'bearbeiten'));

  router.get('/', kdSehen, async (req, res, next) => {
    try {
      const rows = await store.listKunden();
      return sendSuccess(res, 200, { kunden: rows.map((r) => mapKunde(r)).filter(Boolean) });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/', kdErstellen, async (req, res, next) => {
    try {
      const nameRaw = req.body?.name;
      if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „name“ ist erforderlich.');
      }
      const opt = (v) => {
        if (v == null || v === '') return null;
        if (typeof v !== 'string') return undefined;
        const t = v.trim();
        return t === '' ? null : t;
      };
      const ap = opt(req.body?.ansprechpartner);
      const tel = opt(req.body?.telefon);
      const em = opt(req.body?.email);
      const adr = opt(req.body?.adresse);
      if (ap === undefined || tel === undefined || em === undefined || adr === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Optionale Felder müssen Text oder leer sein.');
      }
      const id = randomUUID();
      try {
        await store.insertKunde({
          id,
          name: nameRaw.trim(),
          ansprechpartner: ap,
          telefon: tel,
          email: em,
          adresse: adr,
        });
      } catch {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Kunde konnte nicht angelegt werden.');
      }
      const created = await store.getKundeById(id);
      return sendSuccess(res, 201, { kunde: mapKunde(created) });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/:kundeId', kdSehen, async (req, res, next) => {
    try {
      const kid = typeof req.params.kundeId === 'string' ? req.params.kundeId.trim() : '';
      if (!kid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Kunden-ID.');
      }
      const row = await store.getKundeById(kid);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Kunde nicht gefunden.');
      }
      return sendSuccess(res, 200, { kunde: mapKunde(row) });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/:kundeId', kdBearbeiten, async (req, res, next) => {
    try {
      const kid = typeof req.params.kundeId === 'string' ? req.params.kundeId.trim() : '';
      if (!kid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Kunden-ID.');
      }
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
        patch.name = req.body.name;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner')) {
        patch.ansprechpartner = req.body.ansprechpartner;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'telefon')) {
        patch.telefon = req.body.telefon;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email')) {
        patch.email = req.body.email;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'adresse')) {
        patch.adresse = req.body.adresse;
      }
      if (Object.keys(patch).length === 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Mindestens ein Feld: name, ansprechpartner, telefon, email, adresse.');
      }
      const updated = await store.updateKunde(kid, patch);
      if (!updated) {
        return sendError(res, 404, 'NOT_FOUND', 'Kunde nicht gefunden.');
      }
      if (typeof updated === 'object' && updated.error) {
        const msg =
          updated.error === 'INVALID_NAME'
            ? 'Feld „name“ ungültig.'
            : updated.error === 'INVALID_ANSPRECHPARTNER'
              ? 'Feld „ansprechpartner“ ungültig.'
              : updated.error === 'INVALID_TELEFON'
                ? 'Feld „telefon“ ungültig.'
                : updated.error === 'INVALID_EMAIL'
                  ? 'Feld „email“ ungültig.'
                  : updated.error === 'INVALID_ADRESSE'
                    ? 'Feld „adresse“ ungültig.'
                    : 'Validierung fehlgeschlagen.';
        return sendError(res, 400, 'VALIDATION_ERROR', msg);
      }
      return sendSuccess(res, 200, { kunde: mapKunde(updated) });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
