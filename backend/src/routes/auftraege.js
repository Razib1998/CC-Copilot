/**
 * FUSA-Aufträge (native Cockpit): POST/PATCH laufen nur mit FUSA-Rechten.
 * Persistenz: fusa_kunde_id = Firmen-Stamm (firma_id / fusa_kunde_id im Body).
 * FUSA-Listen-API (store.listFusaApiAuftraege): siehe Kommentar dort — nicht nur fusa_original_id.
 *
 * Fahrzeugbezug: `fusa_fahrzeug_ids` (JSON-Array) und Zeilen in `fusa_belegungen` werden beim Anlegen
 * gemeinsam geschrieben — gleiche Fahrzeugmenge, gleicher Zeitraum (termin / termin_ende). Verfügbarkeit
 * liest aus `fusa_belegungen`.
 *
 * PATCH: `fusa_extra_json` optional — flaches Zusammenführen (Shallow-Merge) mit bestehendem JSON;
 * `null` leert die Spalte. Einzel-Keys mit Wert `null` im Patch-Objekt entfernen den Key.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { redactPricesInPlainObject } from '../auth/price-redaction.js';
import { applyServerPreisSnapshotToExtra, validateFusaFinalOrderInput } from '../lib/fusa-auftragsregeln.js';
import { maybeEnqueueWerkstattBeklebungHinweis } from '../lib/werkstatt-beklebung-outbox.js';
import { syncFusaTerminAndLinkedCcIntern } from '../lib/auftrag-kalender-sync.js';
import { ensureCcInternProductionForFusaAuftrag } from '../lib/fusa-ccintern-production-bridge.js';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireModule, requireRight } from '../middleware/require-rights.js';
import { sendSuccess, sendError } from '../lib/api-v1-envelope.js';

function optionalString(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? null : t;
}

/**
 * Serialisiert fusa_fahrzeug_ids für die DB (JSON-Array von ID-Strings).
 * @param {unknown} raw
 * @returns {{ ok: true, value: string | null } | { ok: false, message: string }}
 */
function normalizeFusaFahrzeugIdsInput(raw) {
  if (raw == null || raw === '') return { ok: true, value: null };
  let list;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return { ok: true, value: null };
    try {
      const parsed = JSON.parse(t);
      if (!Array.isArray(parsed)) {
        return { ok: false, message: 'Feld "fusa_fahrzeug_ids" muss ein JSON-Array sein.' };
      }
      list = parsed;
    } catch {
      return { ok: false, message: 'Feld "fusa_fahrzeug_ids" ist kein gültiges JSON.' };
    }
  } else {
    return { ok: false, message: 'Feld "fusa_fahrzeug_ids" muss ein Array oder JSON-Array-Text sein.' };
  }
  const ids = [];
  for (const x of list) {
    if (x == null) continue;
    const s = typeof x === 'string' ? x.trim() : String(x).trim();
    if (!s) {
      return { ok: false, message: 'Feld "fusa_fahrzeug_ids" enthält eine leere ID.' };
    }
    ids.push(s);
  }
  if (ids.length === 0) return { ok: true, value: null };
  return { ok: true, value: JSON.stringify(ids) };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: string | null } | { ok: false, message: string }}
 */
function normalizeFusaExtraJsonInput(raw) {
  if (raw == null || raw === '') return { ok: true, value: null };
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return { ok: true, value: null };
    try {
      JSON.parse(t);
      return { ok: true, value: t };
    } catch {
      return { ok: false, message: 'Feld "fusa_extra_json" ist kein gültiges JSON.' };
    }
  }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    try {
      return { ok: true, value: JSON.stringify(raw) };
    } catch {
      return { ok: false, message: 'Feld "fusa_extra_json" konnte nicht serialisiert werden.' };
    }
  }
  return { ok: false, message: 'Feld "fusa_extra_json" muss ein Objekt oder JSON-Text sein.' };
}

/**
 * Shallow-Merge für PATCH: bestehende DB-Zeichenkette mit Patch-Objekt/-JSON zusammenführen.
 * @param {string|null|undefined} existingDbValue
 * @param {unknown} patchBody Objekt oder JSON-Text (kein null — null von außen separat behandeln)
 * @returns {{ ok: true, value: string|null } | { ok: false, message: string }}
 */
function mergeFusaExtraJsonForPatch(existingDbValue, patchBody) {
  let base = {};
  const ex = existingDbValue != null && String(existingDbValue).trim() !== '' ? String(existingDbValue).trim() : '';
  if (ex) {
    try {
      const p = JSON.parse(ex);
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        base = { ...p };
      } else {
        return { ok: false, message: 'Bestehendes fusa_extra_json ist kein JSON-Objekt.' };
      }
    } catch {
      return { ok: false, message: 'Bestehendes fusa_extra_json ist beschädigt (kein gültiges JSON).' };
    }
  }
  const patchNorm = normalizeFusaExtraJsonInput(patchBody);
  if (!patchNorm.ok) {
    return { ok: false, message: patchNorm.message };
  }
  let overlay = {};
  if (patchNorm.value) {
    try {
      overlay = JSON.parse(patchNorm.value);
      if (typeof overlay !== 'object' || overlay === null || Array.isArray(overlay)) {
        return { ok: false, message: 'PATCH fusa_extra_json muss ein JSON-Objekt sein.' };
      }
    } catch {
      return { ok: false, message: 'PATCH fusa_extra_json ist kein gültiges JSON.' };
    }
  }
  const merged = { ...base, ...overlay };
  for (const k of Object.keys(overlay)) {
    if (overlay[k] === null) {
      delete merged[k];
    }
  }
  const keys = Object.keys(merged);
  if (keys.length === 0) {
    return { ok: true, value: null };
  }
  return { ok: true, value: JSON.stringify(merged) };
}

async function assertFahrzeugIdsInProject(store, projectId, idsJson) {
  if (idsJson == null || idsJson === '') return null;
  let arr;
  try {
    arr = JSON.parse(idsJson);
  } catch {
    return 'Feld "fusa_fahrzeug_ids" ist beschädigt.';
  }
  if (!Array.isArray(arr)) return 'Feld "fusa_fahrzeug_ids" muss ein Array sein.';
  for (const vid of arr) {
    if (vid == null || String(vid).trim() === '') {
      return 'Feld "fusa_fahrzeug_ids" enthält eine leere ID.';
    }
    const fv = await store.getFahrzeugById(String(vid).trim());
    if (!fv) {
      return `Fahrzeug "${String(vid).trim()}" wurde nicht gefunden.`;
    }
    if (String(fv.project_id || '') !== String(projectId || '')) {
      return `Fahrzeug "${String(vid).trim()}" gehört nicht zum gewählten Projekt.`;
    }
  }
  return null;
}

function mapAuftragResponse(row, canViewPrices) {
  return redactPricesInPlainObject(
    {
      id: row.id,
      title: row.title,
      project_id: row.project_id ?? null,
      status: row.status ?? null,
      termin: row.termin ?? null,
      termin_ende: row.termin_ende ?? null,
      created_at: row.created_at,
      kunde_name: row.kunde_name != null ? String(row.kunde_name) : null,
      kunde_ansprechpartner: row.kunde_ansprechpartner != null ? String(row.kunde_ansprechpartner) : null,
      fusa_original_id: row.fusa_original_id != null ? String(row.fusa_original_id) : null,
      fusa_kunde_id: row.fusa_kunde_id != null ? String(row.fusa_kunde_id) : null,
      fusa_fahrzeug_ids: row.fusa_fahrzeug_ids != null ? String(row.fusa_fahrzeug_ids) : null,
      fusa_extra_json: row.fusa_extra_json != null ? String(row.fusa_extra_json) : null,
    },
    canViewPrices,
  );
}

export function createAuftraegeRouter(store, options = {}) {
  const router = Router();

  const aufSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'auftraege', 'sehen'));
  const aufErstellen = chainMiddleware(
    requireModule('fusa'),
    requireRight('fusa', 'auftraege', 'erstellen'),
  );
  const aufBearbeiten = chainMiddleware(
    requireModule('fusa'),
    requireRight('fusa', 'auftraege', 'bearbeiten'),
  );

  const useApiV1Envelope = Boolean(options && options.useApiV1Envelope);

  /**
   * @param {import('express').Response} res
   * @param {number} status
   * @param {Record<string, unknown>} body
   */
  function jsonOut(res, status, body) {
    if (useApiV1Envelope) {
      if (status >= 400) {
        const code = body && typeof body.error === 'string' ? body.error : 'API_ERROR';
        const msg = body && typeof body.message === 'string' ? body.message : '';
        return sendError(res, status, code, msg);
      }
      return sendSuccess(res, status, body);
    }
    return res.status(status).json(body);
  }

  router.get('/', aufSehen, async (req, res, next) => {
    try {
      const rows = await store.listAuftraegeForUser(req.auth.userId);
      const canView = req.accessProfile?.canViewPricesAnywhere() ?? false;
      const auftraege = rows.map((a) => mapAuftragResponse(a, canView));
      return jsonOut(res, 200, { auftraege });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/', aufErstellen, async (req, res, next) => {
    try {
      const userId = req.auth.userId;

      const istEntwurf =
        req.body?.ist_entwurf === true ||
        req.body?.entwurf === true ||
        String(req.body?.status || '')
          .trim()
          .toLowerCase() === 'entwurf';

      let title = req.body?.title;
      if (typeof title !== 'string' || !title.trim()) {
        if (istEntwurf) {
          title = 'Entwurf';
        } else {
          return jsonOut(res, 400, {
            error: 'VALIDATION_ERROR',
            message: 'Feld "title" ist erforderlich (nicht-leerer Text).',
          });
        }
      }

      const rawPid = req.body?.project_id;
      if (rawPid == null || rawPid === '') {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Feld "project_id" ist erforderlich.',
        });
      }
      if (typeof rawPid !== 'string' || !rawPid.trim()) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Feld "project_id" muss ein nicht-leerer Text sein.',
        });
      }
      const projectId = rawPid.trim();
      const project = await store.getProjectById(projectId);
      if (!project) {
        return jsonOut(res, 404, {
          error: 'NOT_FOUND',
          message: 'Projekt wurde nicht gefunden.',
        });
      }

      const statusRaw = optionalString(req.body?.status);
      if (statusRaw === undefined && req.body?.status != null) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Feld "status" muss ein Text sein.',
        });
      }

      const terminRaw = optionalString(req.body?.termin);
      if (terminRaw === undefined && req.body?.termin != null) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Feld "termin" muss ein Text sein.',
        });
      }
      const hasTerminEndeSnake = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'termin_ende');
      const hasTerminEndeCamel = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'terminEnde');
      const terminEndeInput = hasTerminEndeSnake ? req.body?.termin_ende : req.body?.terminEnde;
      const terminEndeRaw = optionalString(terminEndeInput);
      if (terminEndeRaw === undefined && terminEndeInput != null) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Feld "termin_ende" muss ein Text sein.',
        });
      }

      /** FUSA-Kunde = Firmen-Stamm: bevorzugt explizites fusa_kunde_id, sonst firma_id (Formular). */
      const fusaKundeExplicit = optionalString(req.body?.fusa_kunde_id);
      if (fusaKundeExplicit === undefined && req.body?.fusa_kunde_id != null) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Feld "fusa_kunde_id" muss ein Text sein.',
        });
      }
      const firmaFromForm = optionalString(req.body?.firma_id);
      if (firmaFromForm === undefined && req.body?.firma_id != null) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Feld "firma_id" muss ein Text sein.',
        });
      }
      let fusaKundeId = fusaKundeExplicit ?? firmaFromForm;
      if (!fusaKundeId) {
        if (!istEntwurf) {
          return jsonOut(res, 400, {
            error: 'VALIDATION_ERROR',
            message: 'Feld "firma_id" oder "fusa_kunde_id" ist erforderlich (Firmen-Stamm / FUSA-Kunde).',
          });
        }
        fusaKundeId = null;
      } else {
        const firmaRow = await store.getFirmaById(fusaKundeId);
        if (!firmaRow) {
          return jsonOut(res, 400, {
            error: 'VALIDATION_ERROR',
            message: 'Die gewählte Firma / der FUSA-Kunde wurde im Stamm nicht gefunden.',
          });
        }
      }

      const fusaOriginalRaw = optionalString(req.body?.fusa_original_id);
      if (fusaOriginalRaw === undefined && req.body?.fusa_original_id != null) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Feld "fusa_original_id" muss ein Text sein.',
        });
      }

      const fzNorm = normalizeFusaFahrzeugIdsInput(
        Object.prototype.hasOwnProperty.call(req.body ?? {}, 'fusa_fahrzeug_ids')
          ? req.body?.fusa_fahrzeug_ids
          : undefined,
      );
      if (!fzNorm.ok) {
        return jsonOut(res, 400, { error: 'VALIDATION_ERROR', message: fzNorm.message });
      }

      const extraNorm = normalizeFusaExtraJsonInput(
        Object.prototype.hasOwnProperty.call(req.body ?? {}, 'fusa_extra_json')
          ? req.body?.fusa_extra_json
          : undefined,
      );
      if (!extraNorm.ok) {
        return jsonOut(res, 400, { error: 'VALIDATION_ERROR', message: extraNorm.message });
      }

      if (!istEntwurf && (extraNorm.value == null || String(extraNorm.value).trim() === '')) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'fusa_extra_json ist für den finalen Auftrag erforderlich.',
        });
      }

      if (fzNorm.value != null && String(fzNorm.value).trim() !== '' && String(fzNorm.value).trim() !== '[]') {
        const fzErr = await assertFahrzeugIdsInProject(store, projectId, fzNorm.value);
        if (fzErr) {
          return jsonOut(res, 400, { error: 'VALIDATION_ERROR', message: fzErr });
        }
      }

      /** @type {string|null} */
      let extraStrToSave = extraNorm.value;
      if (istEntwurf && (extraStrToSave == null || String(extraStrToSave).trim() === '')) {
        extraStrToSave = JSON.stringify({ entwurf: true });
      }
      if (extraStrToSave && !istEntwurf) {
        try {
          const eo = JSON.parse(extraStrToSave);
          if (!eo || typeof eo !== 'object') {
            return jsonOut(res, 400, {
              error: 'VALIDATION_ERROR',
              message: 'fusa_extra_json muss ein JSON-Objekt sein.',
            });
          }
          let fzCount = 0;
          try {
            const a = JSON.parse(String(fzNorm.value || '[]'));
            fzCount = Array.isArray(a) ? a.length : 0;
          } catch {
            fzCount = 0;
          }
          const valErrs = validateFusaFinalOrderInput(req.body, eo, { fahrzeugIdsCount: fzCount });
          if (valErrs.length) {
            return jsonOut(res, 400, {
              error: 'VALIDATION_ERROR',
              message: `Finaler Auftrag unvollständig: ${valErrs.join(', ')}`,
              details: valErrs,
            });
          }
          applyServerPreisSnapshotToExtra(eo, {
            termin: terminRaw,
            startdatum: terminRaw,
          });
          eo.entwurf = false;
          extraStrToSave = JSON.stringify(eo);
        } catch {
          return jsonOut(res, 400, {
            error: 'VALIDATION_ERROR',
            message: 'fusa_extra_json konnte nicht verarbeitet werden.',
          });
        }
      } else if (extraStrToSave && istEntwurf) {
        try {
          const eo = JSON.parse(extraStrToSave);
          if (eo && typeof eo === 'object') {
            eo.entwurf = true;
            extraStrToSave = JSON.stringify(eo);
          }
        } catch {
          return jsonOut(res, 400, {
            error: 'VALIDATION_ERROR',
            message: 'fusa_extra_json ist kein gültiges JSON.',
          });
        }
      }

      if (
        !istEntwurf &&
        fzNorm.value != null &&
        String(fzNorm.value).trim() !== '' &&
        String(fzNorm.value).trim() !== '[]' &&
        (!terminRaw || !terminEndeRaw)
      ) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Mit gewählten Fahrzeugen sind termin und termin_ende erforderlich.',
        });
      }

      const statusOut =
        istEntwurf
          ? statusRaw && String(statusRaw).trim()
            ? String(statusRaw).trim()
            : 'Entwurf'
          : statusRaw;

      const id = randomUUID();
      let ins;
      try {
        ins = await store.insertAuftragWithFusaBelegungen({
          id,
          title: title.trim(),
          projectId,
          status: statusOut,
          termin: terminRaw,
          terminEnde: terminEndeRaw,
          fusaOriginalId: fusaOriginalRaw,
          fusaKundeId,
          fusaFahrzeugIds: fzNorm.value,
          fusaExtraJson: extraStrToSave ?? extraNorm.value,
        });
      } catch {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Auftrag konnte nicht gespeichert werden.',
        });
      }
      if (!ins || typeof ins !== 'object' || !('ok' in ins) || !ins.ok) {
        const code = ins && typeof ins === 'object' && 'code' in ins ? String(ins.code) : '';
        const msg =
          ins && typeof ins === 'object' && 'message' in ins && typeof ins.message === 'string'
            ? ins.message
            : 'Auftrag konnte nicht gespeichert werden.';
        if (code === 'BELEGUNG_KONFLIKT') {
          return jsonOut(res, 409, {
            error: 'BELEGUNG_KONFLIKT',
            message: msg,
            konflikt: 'konflikt' in ins && ins.konflikt && typeof ins.konflikt === 'object' ? ins.konflikt : undefined,
          });
        }
        if (code === 'FUSA_VERFUEGBARKEIT') {
          return jsonOut(res, 400, {
            error: 'FUSA_VERFUEGBARKEIT',
            message: msg,
            konflikt: 'konflikt' in ins && ins.konflikt && typeof ins.konflikt === 'object' ? ins.konflikt : undefined,
          });
        }
        if (code === 'INVALID_TERMIN' || code === 'INVALID_TERMIN_ENDE' || code === 'INVALID_RANGE') {
          return jsonOut(res, 400, { error: 'VALIDATION_ERROR', message: msg });
        }
        if (code === 'INVALID_FAHRZEUG_IDS') {
          return jsonOut(res, 400, { error: 'VALIDATION_ERROR', message: msg });
        }
        return jsonOut(res, 400, { error: 'VALIDATION_ERROR', message: msg });
      }

      const row = await store.getAuftragById(id);
      if (!row) {
        return jsonOut(res, 500, {
          error: 'INTERNAL_ERROR',
          message: 'Auftrag nach dem Anlegen nicht gefunden.',
        });
      }

      if (!istEntwurf) {
        try {
          maybeEnqueueWerkstattBeklebungHinweis({ vorherExtraStr: null, nachherRow: /** @type {Record<string, unknown>} */ (row) });
        } catch {
          /* Outbox darf Speichern nicht blockieren */
        }
      }
      try {
        await ensureCcInternProductionForFusaAuftrag({
          store,
          fusaAuftrag: row,
          actorUserId: userId,
        });
      } catch {
        /* Automatische CC-Intern/Produktion-Brücke darf Auftrag speichern nicht blockieren */
      }

      const canView = req.accessProfile?.canViewPricesAnywhere() ?? false;
      return jsonOut(res, 201, {
        auftrag: mapAuftragResponse(row, canView),
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/:auftragId', aufSehen, async (req, res, next) => {
    try {
      const auftragId = req.params.auftragId;
      if (typeof auftragId !== 'string' || !auftragId.trim()) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Auftrags-ID.',
        });
      }
      const row = await store.getAuftragById(auftragId.trim());
      if (!row) {
        return jsonOut(res, 404, {
          error: 'NOT_FOUND',
          message: 'Auftrag wurde nicht gefunden.',
        });
      }
      const canView = req.accessProfile?.canViewPricesAnywhere() ?? false;
      return jsonOut(res, 200, {
        auftrag: mapAuftragResponse(row, canView),
      });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/:auftragId', aufBearbeiten, async (req, res, next) => {
    try {
      const auftragId = req.params.auftragId;
      if (typeof auftragId !== 'string' || !auftragId.trim()) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Auftrags-ID.',
        });
      }
      const existing = await store.getAuftragById(auftragId.trim());
      if (!existing) {
        return jsonOut(res, 404, {
          error: 'NOT_FOUND',
          message: 'Auftrag wurde nicht gefunden.',
        });
      }
      const projectId = existing.project_id;
      if (projectId == null || String(projectId).trim() === '') {
        return jsonOut(res, 403, {
          error: 'FORBIDDEN',
          message: 'Auftrag ohne Projektbezug kann nicht bearbeitet werden.',
        });
      }
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'title')) {
        patch.title = req.body.title;
      }
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'status')) {
        patch.status = req.body.status;
      }
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'termin')) {
        patch.termin = req.body.termin;
      }
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'termin_ende')) {
        patch.termin_ende = req.body.termin_ende;
      } else if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'terminEnde')) {
        patch.termin_ende = req.body.terminEnde;
      }
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'fusa_fahrzeug_ids')) {
        const fzNorm = normalizeFusaFahrzeugIdsInput(req.body?.fusa_fahrzeug_ids);
        if (!fzNorm.ok) {
          return jsonOut(res, 400, { error: 'VALIDATION_ERROR', message: fzNorm.message });
        }
        patch.fusa_fahrzeug_ids = fzNorm.value;
      }
      const hasFusaKundeKey = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'fusa_kunde_id');
      const hasFirmaKey = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'firma_id');
      if (hasFusaKundeKey || hasFirmaKey) {
        const fusaKundeExplicitPatch = optionalString(req.body?.fusa_kunde_id);
        if (fusaKundeExplicitPatch === undefined && req.body?.fusa_kunde_id != null) {
          return jsonOut(res, 400, {
            error: 'VALIDATION_ERROR',
            message: 'Feld "fusa_kunde_id" muss ein Text sein.',
          });
        }
        const firmaPatch = optionalString(req.body?.firma_id);
        if (firmaPatch === undefined && req.body?.firma_id != null) {
          return jsonOut(res, 400, {
            error: 'VALIDATION_ERROR',
            message: 'Feld "firma_id" muss ein Text sein.',
          });
        }
        const kundeIdPatch = hasFusaKundeKey ? fusaKundeExplicitPatch : firmaPatch;
        if (kundeIdPatch) {
          const firmaRow = await store.getFirmaById(kundeIdPatch);
          if (!firmaRow) {
            return jsonOut(res, 400, {
              error: 'VALIDATION_ERROR',
              message: 'Die gewählte Firma / der FUSA-Kunde wurde im Stamm nicht gefunden.',
            });
          }
        }
        patch.fusa_kunde_id = kundeIdPatch;
      }
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'fusa_extra_json')) {
        const rawExtra = req.body?.fusa_extra_json;
        if (rawExtra === null) {
          patch.fusa_extra_json = null;
        } else {
          const merged = mergeFusaExtraJsonForPatch(existing.fusa_extra_json, rawExtra);
          if (!merged.ok) {
            return jsonOut(res, 400, { error: 'VALIDATION_ERROR', message: merged.message });
          }
          let exStr = merged.value;
          if (exStr) {
            try {
              const eo = JSON.parse(exStr);
              if (
                eo &&
                typeof eo === 'object' &&
                Array.isArray(eo.preispositionen) &&
                eo.preispositionen.length > 0
              ) {
                const trPatch = Object.prototype.hasOwnProperty.call(patch, 'termin')
                  ? optionalString(req.body?.termin)
                  : undefined;
                applyServerPreisSnapshotToExtra(eo, {
                  termin: trPatch ?? existing.termin,
                  startdatum: trPatch ?? existing.termin,
                });
                exStr = JSON.stringify(eo);
              }
            } catch {
              return jsonOut(res, 400, {
                error: 'VALIDATION_ERROR',
                message: 'fusa_extra_json nach Merge nicht verarbeitbar.',
              });
            }
          }
          patch.fusa_extra_json = exStr;
        }
      }
      if (Object.keys(patch).length === 0) {
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message:
            'Mindestens eines der Felder title, status, termin, termin_ende, fusa_fahrzeug_ids, fusa_extra_json, firma_id, fusa_kunde_id ist erforderlich.',
        });
      }

      let mergedFzIds = existing.fusa_fahrzeug_ids != null ? String(existing.fusa_fahrzeug_ids) : null;
      if (Object.prototype.hasOwnProperty.call(patch, 'fusa_fahrzeug_ids')) {
        mergedFzIds = patch.fusa_fahrzeug_ids;
      }
      const fzErrAssert = await assertFahrzeugIdsInProject(store, projectId, mergedFzIds);
      if (fzErrAssert) {
        return jsonOut(res, 400, { error: 'VALIDATION_ERROR', message: fzErrAssert });
      }

      const updated = await store.updateAuftragPatchWithBelegung(auftragId.trim(), patch);
      if (updated && typeof updated === 'object' && 'error' in updated) {
        const code = updated.error;
        if (code === 'INVALID_TITLE') {
          return jsonOut(res, 400, {
            error: 'VALIDATION_ERROR',
            message: 'Feld "title" muss ein nicht-leerer Text sein.',
          });
        }
        if (code === 'INVALID_STATUS') {
          return jsonOut(res, 400, {
            error: 'VALIDATION_ERROR',
            message: 'Ungültiger Wert für status.',
          });
        }
        if (code === 'INVALID_FAHRZEUG_IDS') {
          return jsonOut(res, 400, {
            error: 'VALIDATION_ERROR',
            message:
              'message' in updated && typeof updated.message === 'string'
                ? updated.message
                : 'Ungültige fusa_fahrzeug_ids.',
          });
        }
        if (code === 'BELEGUNG_KONFLIKT') {
          return jsonOut(res, 409, {
            error: 'BELEGUNG_KONFLIKT',
            message:
              'message' in updated && typeof updated.message === 'string'
                ? updated.message
                : 'Belegungskonflikt.',
            konflikt:
              'konflikt' in updated && updated.konflikt && typeof updated.konflikt === 'object'
                ? updated.konflikt
                : undefined,
          });
        }
        if (code === 'FUSA_VERFUEGBARKEIT') {
          return jsonOut(res, 400, {
            error: 'FUSA_VERFUEGBARKEIT',
            message:
              'message' in updated && typeof updated.message === 'string'
                ? updated.message
                : 'Fahrzeug nicht buchbar.',
            konflikt:
              'konflikt' in updated && updated.konflikt && typeof updated.konflikt === 'object'
                ? updated.konflikt
                : undefined,
          });
        }
        const msg400 =
          'message' in updated && typeof updated.message === 'string'
            ? updated.message
            : 'Auftrag konnte nicht aktualisiert werden.';
        return jsonOut(res, 400, {
          error: 'VALIDATION_ERROR',
          message: msg400,
        });
      }
      if (!updated || (typeof updated === 'object' && 'error' in updated)) {
        return jsonOut(res, 500, {
          error: 'INTERNAL_ERROR',
          message: 'Auftrag konnte nicht aktualisiert werden.',
        });
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'fusa_extra_json')) {
        try {
          const updatedRow = await store.getAuftragById(auftragId.trim());
          maybeEnqueueWerkstattBeklebungHinweis({
            vorherExtraStr: typeof existing.fusa_extra_json === 'string' ? existing.fusa_extra_json : null,
            nachherRow: /** @type {Record<string, unknown>} */ (updatedRow || {}),
          });
        } catch {
          /* Outbox darf PATCH nicht blockieren */
        }
      }

      try {
        const patchedRow = await store.getAuftragById(auftragId.trim());
        if (patchedRow) {
          const linked = await store.getCcInternAuftragByFusaAuftragId(
            patchedRow.id,
            patchedRow.fusa_kunde_id || undefined,
          );
          await syncFusaTerminAndLinkedCcIntern({
            store,
            fusaAuftrag: patchedRow,
            linkedCcInternAuftrag: linked || null,
            actorUserId: req.auth?.userId ?? null,
          });
        }
      } catch {
        /* Sync darf PATCH nicht blockieren */
      }

      const patchedFinal = await store.getAuftragById(auftragId.trim());
      if (!patchedFinal) {
        return jsonOut(res, 500, { error: 'INTERNAL_ERROR', message: 'Auftrag nach Update nicht gefunden.' });
      }
      const canViewPatch = req.accessProfile?.canViewPricesAnywhere() ?? false;
      return jsonOut(res, 200, {
        auftrag: mapAuftragResponse(patchedFinal, canViewPatch),
      });
    } catch (e) {
      return next(e);
    }
  });

  /** Physisches Löschen: entfernt den Auftrag und bereinigt FUSA-Verknüpfungen. */
  router.delete('/:auftragId', aufBearbeiten, async (req, res, next) => {
    try {
      const auftragId = String(req.params.auftragId || '').trim();
      if (!auftragId) {
        return jsonOut(res, 400, { error: 'VALIDATION_ERROR', message: 'Ungültige Auftrags-ID.' });
      }
      const existing = await store.getAuftragById(auftragId);
      if (!existing) {
        return jsonOut(res, 404, { error: 'NOT_FOUND', message: 'Auftrag wurde nicht gefunden.' });
      }
      if (existing.project_id == null || String(existing.project_id).trim() === '') {
        return jsonOut(res, 403, {
          error: 'FORBIDDEN',
          message: 'Auftrag ohne Projektbezug kann nicht gelöscht werden.',
        });
      }
      if (typeof store.deleteFusaAuftragHard !== 'function') {
        return jsonOut(res, 500, { error: 'INTERNAL_ERROR', message: 'Löschen wird vom Store nicht unterstützt.' });
      }
      const ok = await store.deleteFusaAuftragHard(auftragId);
      if (!ok) {
        return jsonOut(res, 500, { error: 'INTERNAL_ERROR', message: 'Auftrag konnte nicht gelöscht werden.' });
      }
      return jsonOut(res, 200, { deleted: true, id: auftragId });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
     
