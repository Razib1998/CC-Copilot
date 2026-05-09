import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { redactPricesInPlainObject } from '../auth/price-redaction.js';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireModule, requireRight } from '../middleware/require-rights.js';

/**
 * LEGACY: Tabelle **angebote** ist das alte Projekt-Angebotsmodell. Neue Entwicklung nutzt **fusa_angebote** oder **ccintern_angebote** (API unter `/api/v1/fusa/angebote` bzw. `/api/v1/ccintern/angebote`). Nicht für neue Features verwenden.
 */

const ANGEBOT_STATUS = new Set(['entwurf', 'versendet', 'angenommen', 'abgelehnt']);

/**
 * @param {unknown} s
 */
function normalizeAngebotStatus(s) {
  if (s == null || s === '') return 'entwurf';
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return ANGEBOT_STATUS.has(t) ? t : null;
}

/**
 * @param {object} row
 * @param {boolean} canViewPrices
 */
function mapAngebotPublic(row, canViewPrices) {
  if (!row || typeof row !== 'object') return null;
  return redactPricesInPlainObject(
    {
      id: row.id,
      project_id: row.project_id,
      titel: row.titel,
      angebotsnummer: row.angebotsnummer,
      status: row.status,
      betrag_netto: row.betrag_netto != null ? Number(row.betrag_netto) : null,
      notiz: row.notiz ?? null,
      erstellt_von: row.erstellt_von != null ? String(row.erstellt_von) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      project_name: row.project_name != null ? String(row.project_name) : null,
      kunde_name: row.kunde_name != null ? String(row.kunde_name) : null,
    },
    canViewPrices,
  );
}

/**
 * @param {unknown} v
 * @returns {number|null|undefined} undefined = ungültig
 */
function parseBetragNetto(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const x = Number.parseFloat(v.trim().replace(',', '.'));
    return Number.isFinite(x) ? x : undefined;
  }
  return undefined;
}

/**
 * LEGACY: HTTP auf Tabelle `angebote` via Store — nicht für neue Features erweitern.
 *
 * @param {object} store
 */
export function createAngeboteRouter(store) {
  const router = Router();

  const angSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'angebote', 'sehen'));
  const angErstellen = chainMiddleware(
    requireModule('fusa'),
    requireRight('fusa', 'angebote', 'erstellen'),
  );
  const angBearbeiten = chainMiddleware(
    requireModule('fusa'),
    requireRight('fusa', 'angebote', 'bearbeiten'),
  );

  router.get('/', angSehen, async (req, res, next) => {
    try {
      const rows = await store.listAngeboteForUser(req.auth.userId);
      const canView = req.accessProfile?.canViewPricesAnywhere() ?? false;
      const angebote = [];
      for (const r of rows) {
        const mapped = mapAngebotPublic(r, canView);
        if (mapped) angebote.push(mapped);
      }
      return res.status(200).json({ angebote });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/:angebotId', angSehen, async (req, res, next) => {
    try {
      const aid = typeof req.params.angebotId === 'string' ? req.params.angebotId.trim() : '';
      if (!aid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Angebots-ID.',
        });
      }
      const row = await store.getAngebotById(aid);
      if (!row) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Angebot nicht gefunden.',
        });
      }
      const canView = req.accessProfile?.canViewPricesAnywhere() ?? false;
      return res.status(200).json({ angebot: mapAngebotPublic(row, canView) });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/', angErstellen, async (req, res, next) => {
    try {
      const userId = req.auth.userId;
      const rawPid = req.body?.project_id;
      if (rawPid == null || typeof rawPid !== 'string' || !rawPid.trim()) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld „project_id“ ist erforderlich.',
        });
      }
      const projectId = rawPid.trim();
      const project = await store.getProjectById(projectId);
      if (!project) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Projekt nicht gefunden.',
        });
      }
      const titelRaw = req.body?.titel;
      if (typeof titelRaw !== 'string' || !titelRaw.trim()) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld „titel“ ist erforderlich.',
        });
      }

      let angebotsnummer =
        typeof req.body?.angebotsnummer === 'string' && req.body.angebotsnummer.trim()
          ? req.body.angebotsnummer.trim()
          : '';
      if (!angebotsnummer) {
        angebotsnummer = await store.nextAngebotsnummerFallback();
      }

      const st = normalizeAngebotStatus(req.body?.status);
      if (st == null) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld „status“ muss entwurf, versendet, angenommen oder abgelehnt sein.',
        });
      }

      const betragRaw = parseBetragNetto(req.body?.betrag_netto);
      if (betragRaw === undefined) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld „betrag_netto“ ungültig.',
        });
      }

      let notiz = null;
      const notizRaw = req.body?.notiz;
      if (notizRaw != null && notizRaw !== '') {
        if (typeof notizRaw !== 'string') {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Feld „notiz“ muss Text sein.',
          });
        }
        notiz = notizRaw.trim() || null;
      }

      const id = randomUUID();
      try {
        await store.insertAngebot({
          id,
          projectId,
          titel: titelRaw.trim(),
          angebotsnummer,
          status: st,
          betragNetto: betragRaw,
          notiz,
          erstelltVon: userId,
        });
      } catch {
        return res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Angebot konnte nicht angelegt werden.',
        });
      }
      const created = await store.getAngebotById(id);
      const canView = req.accessProfile?.canViewPricesAnywhere() ?? false;
      return res.status(201).json({ angebot: mapAngebotPublic(created, canView) });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/:angebotId', angBearbeiten, async (req, res, next) => {
    try {
      const aid = typeof req.params.angebotId === 'string' ? req.params.angebotId.trim() : '';
      if (!aid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Angebots-ID.',
        });
      }
      const existing = await store.getAngebotById(aid);
      if (!existing) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Angebot nicht gefunden.',
        });
      }
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'titel')) {
        patch.titel = req.body.titel;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'angebotsnummer')) {
        patch.angebotsnummer = req.body.angebotsnummer;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
        const st = normalizeAngebotStatus(req.body.status);
        if (st == null) {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Feld „status“ muss entwurf, versendet, angenommen oder abgelehnt sein.',
          });
        }
        patch.status = st;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'betrag_netto')) {
        patch.betrag_netto = req.body.betrag_netto;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notiz')) {
        patch.notiz = req.body.notiz;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Mindestens ein Feld: titel, angebotsnummer, status, betrag_netto, notiz.',
        });
      }

      if (patch.betrag_netto !== undefined) {
        const b = parseBetragNetto(patch.betrag_netto);
        if (b === undefined) {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Feld „betrag_netto“ ungültig.',
          });
        }
        patch.betrag_netto = b;
      }

      const updated = await store.updateAngebot(aid, patch);
      if (!updated) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Angebot nicht gefunden.',
        });
      }
      if (typeof updated === 'object' && updated.error) {
        const msg =
          updated.error === 'INVALID_TITEL'
            ? 'Feld „titel“ ungültig.'
            : updated.error === 'INVALID_ANGEBOTSNUMMER'
              ? 'Feld „angebotsnummer“ ungültig.'
              : updated.error === 'INVALID_STATUS'
                ? 'Feld „status“ ungültig.'
                : updated.error === 'INVALID_BETRAG'
                  ? 'Feld „betrag_netto“ ungültig.'
                  : updated.error === 'INVALID_NOTIZ'
                    ? 'Feld „notiz“ ungültig.'
                    : 'Validierung fehlgeschlagen.';
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: msg,
        });
      }

      const canView = req.accessProfile?.canViewPricesAnywhere() ?? false;
      return res.status(200).json({ angebot: mapAngebotPublic(updated, canView) });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
