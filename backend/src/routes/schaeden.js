import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireModule, requireRight } from '../middleware/require-rights.js';
import { createMulterMemory, writeUploadBufferSync, resolveUploadAbsolute } from '../lib/upload-storage.js';

const SCHAEDEN_STATUS = new Set(['offen', 'in_bearbeitung', 'erledigt']);
const WERKSTATT_STATUS = new Set(['offen', 'in_arbeit', 'fertig']);
const SCHADEN_TYP_SET = new Set(['Eigenschaden', 'Fremdschaden', 'Unklar']);
const SCHADEN_PRIO_SET = new Set(['normal', 'dringend']);
const SCHADEN_ABRECHNUNG_SET = new Set(['ausstehend', 'zur_abrechnung', 'abgerechnet']);
/** Alt-FUSA `abr` — in extra_json als `abrechnung_legacy`. */
const SCHADEN_ABRECHNUNG_LEGACY_SET = new Set([
  'nicht',
  'potenziell',
  'klaerung',
  'vormerken',
  'erstellt',
  'versendet',
  'bezahlt',
]);
const SCHADEN_KLAERUNG_SET = new Set(['offen', 'in_klaerung', 'geklaert']);
/** Reparatur-/Termin-Workflow (extra_json), Cockpit-intern, orientiert an Alt-Status. */
const SCHADEN_REPARATUR_PHASE_SET = new Set([
  'geplant',
  'termin_gesendet',
  'termin_vorschlag',
  'termin_bestaetigt',
  'in_reparatur',
  'reparatur_abgeschlossen',
]);

/**
 * @param {unknown} s
 */
export function normalizeSchadenStatus(s) {
  if (s == null || s === '') return 'offen';
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return SCHAEDEN_STATUS.has(t) ? t : null;
}

/**
 * @param {unknown} s
 */
function normalizeWerkstattStatus(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return WERKSTATT_STATUS.has(t) ? t : null;
}

/**
 * @param {string} p
 */
function mimeFromRelativePath(p) {
  const low = p.toLowerCase();
  if (low.endsWith('.png')) return 'image/png';
  if (low.endsWith('.webp')) return 'image/webp';
  if (low.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/**
 * extra_json-Felder aus DB-Zeile parsen.
 * @param {unknown} rawJson
 */
function parseExtraJson(rawJson) {
  if (rawJson == null || rawJson === '') return {};
  try { return JSON.parse(String(rawJson)); } catch { return {}; }
}

/**
 * @param {string} leg
 */
function triStateFromAbrechnungLegacy(leg) {
  if (leg === 'bezahlt') return 'abgerechnet';
  if (leg === 'nicht') return 'ausstehend';
  if (SCHADEN_ABRECHNUNG_LEGACY_SET.has(leg)) return 'zur_abrechnung';
  return 'ausstehend';
}

/**
 * @param {unknown} v
 * @param {number} max
 */
function pickStr(v, max) {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * @param {unknown} raw
 */
function normalizeTerminanfrage(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const out = {};
  const wk = pickStr(o.werkstatt, 120);
  if (wk) out.werkstatt = wk;
  const wd = pickStr(o.wunschdatum, 32);
  if (wd) out.wunschdatum = wd;
  const wz = pickStr(o.wunschzeit, 80);
  if (wz) out.wunschzeit = wz;
  const nz = pickStr(o.notiz, 4000);
  if (nz) out.notiz = nz;
  const aa = pickStr(o.angefragt_am, 32);
  if (aa) out.angefragt_am = aa;
  const az = pickStr(o.angefragt_zeit, 40);
  if (az) out.angefragt_zeit = az;
  const em = pickStr(o.empfaenger, 320);
  if (em) out.empfaenger = em;
  const wdf = pickStr(o.wunschdatum_fmt, 200);
  if (wdf) out.wunschdatum_fmt = wdf;
  return Object.keys(out).length ? out : null;
}

/**
 * @param {unknown} raw
 */
function normalizeSchadenDokumente(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const x of raw.slice(0, 40)) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const o = /** @type {Record<string, unknown>} */ (x);
    const id = pickStr(o.id, 48);
    const name = pickStr(o.name, 400);
    if (!id || !name) continue;
    out.push({
      id,
      name,
      typ: pickStr(o.typ, 80),
      url: pickStr(o.url, 2000),
      notiz: pickStr(o.notiz, 2000),
      created_at: pickStr(o.created_at, 40),
    });
  }
  return out;
}

/**
 * extra_json aus Request-Body validieren und normalisieren.
 * Gibt null zurück wenn kein extra-Feld gesendet wurde.
 * @param {Record<string, unknown>} body
 */
export function extractExtraFromBody(body) {
  const extra = {};
  let hasExtra = false;
  if (body.typ !== undefined) {
    const t = String(body.typ ?? '').trim();
    extra.typ = SCHADEN_TYP_SET.has(t) ? t : 'Unklar';
    hasExtra = true;
  }
  if (body.prioritaet !== undefined) {
    const p = String(body.prioritaet ?? '').trim();
    extra.prioritaet = SCHADEN_PRIO_SET.has(p) ? p : 'normal';
    hasExtra = true;
  }
  if (body.abrechnung_status !== undefined) {
    const a = String(body.abrechnung_status ?? '').trim();
    extra.abrechnung_status = SCHADEN_ABRECHNUNG_SET.has(a) ? a : 'ausstehend';
    hasExtra = true;
  }
  if (body.abrechnung_legacy !== undefined) {
    const a = String(body.abrechnung_legacy ?? '').trim();
    const leg = SCHADEN_ABRECHNUNG_LEGACY_SET.has(a) ? a : 'nicht';
    extra.abrechnung_legacy = leg;
    if (!Object.prototype.hasOwnProperty.call(body, 'abrechnung_status')) {
      extra.abrechnung_status = triStateFromAbrechnungLegacy(leg);
    }
    hasExtra = true;
  }
  if (body.wiedervorlage !== undefined) {
    const w = String(body.wiedervorlage ?? '').trim();
    extra.wiedervorlage = w || null;
    hasExtra = true;
  }
  if (body.melder_name !== undefined) {
    const m = String(body.melder_name ?? '').trim();
    extra.melder_name = m || null;
    hasExtra = true;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'terminanfrage')) {
    const tv = body.terminanfrage;
    if (tv == null || tv === '') extra.terminanfrage = null;
    else extra.terminanfrage = normalizeTerminanfrage(tv);
    hasExtra = true;
  }
  if (body.klaerung !== undefined) {
    const k = String(body.klaerung ?? '').trim();
    extra.klaerung = SCHADEN_KLAERUNG_SET.has(k) ? k : 'offen';
    hasExtra = true;
  }
  if (body.verursacher !== undefined) {
    extra.verursacher = pickStr(body.verursacher, 240);
    hasExtra = true;
  }
  if (body.fremd_art !== undefined) {
    extra.fremd_art = pickStr(body.fremd_art, 120);
    hasExtra = true;
  }
  if (body.haftung_notiz !== undefined) {
    extra.haftung_notiz = pickStr(body.haftung_notiz, 4000);
    hasExtra = true;
  }
  if (body.interne_notiz !== undefined) {
    extra.interne_notiz = pickStr(body.interne_notiz, 12000);
    hasExtra = true;
  }
  if (body.reparatur_phase !== undefined) {
    const p = String(body.reparatur_phase ?? '').trim();
    extra.reparatur_phase = SCHADEN_REPARATUR_PHASE_SET.has(p) ? p : 'geplant';
    hasExtra = true;
  }
  if (body.linked_auftrag_id !== undefined) {
    const u = pickStr(body.linked_auftrag_id, 48);
    extra.linked_auftrag_id = u;
    hasExtra = true;
  }
  if (body.meldedatum !== undefined) {
    extra.meldedatum = pickStr(body.meldedatum, 32);
    hasExtra = true;
  }
  if (body.schaden_dokumente !== undefined) {
    extra.schaden_dokumente = normalizeSchadenDokumente(body.schaden_dokumente);
    hasExtra = true;
  }
  if (body.werkstatt_response !== undefined) {
    extra.werkstatt_response =
      body.werkstatt_response && typeof body.werkstatt_response === 'object' && !Array.isArray(body.werkstatt_response)
        ? body.werkstatt_response
        : null;
    hasExtra = true;
  }
  return hasExtra ? extra : null;
}

/**
 * @param {object} row
 */
export function mapSchadenPublic(row) {
  if (!row || typeof row !== 'object') return null;
  const extra = parseExtraJson(row.extra_json);
  const fotoCountRaw = /** @type {any} */ (row).foto_count;
  const fotoCount = fotoCountRaw != null ? Number(fotoCountRaw) : 0;
  return {
    id: row.id,
    project_id: row.project_id,
    fahrzeug_id: row.fahrzeug_id,
    titel: row.titel,
    beschreibung: row.beschreibung ?? null,
    status: row.status,
    werkstatt_status: row.werkstatt_status != null ? String(row.werkstatt_status) : 'offen',
    bearbeitet_von: row.bearbeitet_von != null ? String(row.bearbeitet_von) : null,
    bearbeitet_am: row.bearbeitet_am != null ? String(row.bearbeitet_am) : null,
    created_at: row.created_at,
    fahrzeug_kennung: row.fahrzeug_kennung != null ? String(row.fahrzeug_kennung) : null,
    foto_count: Number.isFinite(fotoCount) && fotoCount >= 0 ? fotoCount : 0,
    // extra_json-Felder — flach im Public-Shape
    typ: typeof extra.typ === 'string' ? extra.typ : null,
    prioritaet: typeof extra.prioritaet === 'string' ? extra.prioritaet : 'normal',
    abrechnung_status: typeof extra.abrechnung_status === 'string' ? extra.abrechnung_status : 'ausstehend',
    abrechnung_legacy:
      typeof extra.abrechnung_legacy === 'string' && SCHADEN_ABRECHNUNG_LEGACY_SET.has(extra.abrechnung_legacy)
        ? extra.abrechnung_legacy
        : null,
    wiedervorlage: extra.wiedervorlage != null ? String(extra.wiedervorlage) : null,
    melder_name: extra.melder_name != null ? String(extra.melder_name) : null,
    terminanfrage: extra.terminanfrage ?? null,
    werkstatt_response: extra.werkstatt_response ?? null,
    klaerung:
      typeof extra.klaerung === 'string' && SCHADEN_KLAERUNG_SET.has(extra.klaerung) ? extra.klaerung : 'offen',
    verursacher: extra.verursacher != null ? String(extra.verursacher) : null,
    fremd_art: extra.fremd_art != null ? String(extra.fremd_art) : null,
    haftung_notiz: extra.haftung_notiz != null ? String(extra.haftung_notiz) : null,
    interne_notiz: extra.interne_notiz != null ? String(extra.interne_notiz) : null,
    reparatur_phase:
      typeof extra.reparatur_phase === 'string' && SCHADEN_REPARATUR_PHASE_SET.has(extra.reparatur_phase)
        ? extra.reparatur_phase
        : 'geplant',
    linked_auftrag_id: extra.linked_auftrag_id != null ? String(extra.linked_auftrag_id) : null,
    meldedatum: extra.meldedatum != null ? String(extra.meldedatum) : null,
    schaden_teil: extra.schaden_teil != null ? String(extra.schaden_teil) : null,
    upload_art: extra.upload_art != null ? String(extra.upload_art) : null,
    public_uploads: Array.isArray(extra.public_uploads) ? extra.public_uploads : [],
    schaden_dokumente: Array.isArray(extra.schaden_dokumente) ? extra.schaden_dokumente : [],
    repair_started_at: extra.repair_started_at != null ? String(extra.repair_started_at) : null,
    repair_started_by: extra.repair_started_by != null ? String(extra.repair_started_by) : null,
    repair_completed_at: extra.repair_completed_at != null ? String(extra.repair_completed_at) : null,
    repair_completed_by: extra.repair_completed_by != null ? String(extra.repair_completed_by) : null,
    repair_completed_note: extra.repair_completed_note != null ? String(extra.repair_completed_note) : null,
    repair_photo_ids: Array.isArray(extra.repair_photo_ids) ? extra.repair_photo_ids : [],
  };
}

const upload = createMulterMemory({
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
    cb(null, ok);
  },
});

/**
 * Legacy-Router: `GET|POST|PATCH /schaeden` (ohne `/api/v1`), Session + Modul «fusa».
 * Projektbezogene Schäden mit Header `x-project-id` und einheitlichem JSON: **`/api/v1/schaeden`** (`api-v1/schaeden.js`).
 *
 * @param {object} store
 */
export function createSchaedenRouter(store) {
  const router = Router();

  const schSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'schaeden', 'sehen'));
  const schErstellen = chainMiddleware(
    requireModule('fusa'),
    requireRight('fusa', 'schaeden', 'erstellen'),
  );
  const schBearbeiten = chainMiddleware(
    requireModule('fusa'),
    requireRight('fusa', 'schaeden', 'bearbeiten'),
  );
  const schUpload = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'schaeden', 'upload'));

  router.get('/', schSehen, async (req, res, next) => {
    try {
      const rows = await store.listSchaedenForUser(req.auth.userId);
      const schaeden = rows.map((r) => mapSchadenPublic(r)).filter(Boolean);
      return res.status(200).json({ schaeden });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/:schadenId/fotos', schSehen, async (req, res, next) => {
    try {
      const sid = typeof req.params.schadenId === 'string' ? req.params.schadenId.trim() : '';
      if (!sid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Schaden-ID.',
        });
      }
      const row = await store.getSchadenById(sid);
      if (!row) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Schaden nicht gefunden.',
        });
      }
      const fotosRows = await store.listSchadenFotos(sid);
      const fotos = fotosRows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        url: `/schaeden/${encodeURIComponent(sid)}/fotos/${encodeURIComponent(String(r.id))}/file`,
      }));
      return res.status(200).json({ fotos });
    } catch (e) {
      return next(e);
    }
  });

  function multerSchadenFoto(req, res, next) {
    upload.fields([
      { name: 'foto', maxCount: 1 },
      { name: 'file', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: err instanceof Error ? err.message : 'Upload ungültig.',
        });
      }
      next();
    });
  }

  router.post('/:schadenId/fotos', schUpload, multerSchadenFoto, async (req, res, next) => {
    try {
      const sid = typeof req.params.schadenId === 'string' ? req.params.schadenId.trim() : '';
      if (!sid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Schaden-ID.',
        });
      }
      const row = await store.getSchadenById(sid);
      if (!row) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Schaden nicht gefunden.',
        });
      }
      const files =
        req.files && typeof req.files === 'object'
          ? /** @type {Record<string, { buffer?: Buffer, originalname?: string }[]|undefined>} */ (req.files)
          : {};
      const f = (files.foto && files.foto[0]) || (files.file && files.file[0]);
      if (!f || !f.buffer || !Buffer.isBuffer(f.buffer)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Datei erforderlich (multipart-Feld „foto“ oder „file“, Bild jpeg/png/webp/gif).',
        });
      }
      const projectId = String(row.project_id || '').trim();
      if (!projectId) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Schaden hat keinen Projektkontext; Upload nicht möglich.',
        });
      }
      let rel;
      try {
        const w = writeUploadBufferSync({
          moduleKey: 'schaeden-fotos',
          projectId,
          resourceKey: 'schaden',
          buffer: f.buffer,
          originalName: f.originalname || 'foto.jpg',
        });
        rel = w.relativePath;
      } catch {
        return res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Foto konnte nicht gespeichert werden.',
        });
      }
      const id = randomUUID();
      try {
        await store.insertSchadenFoto({ id, schadenId: sid, filePath: rel });
      } catch {
        return res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Foto konnte nicht gespeichert werden.',
        });
      }
      const saved = await store.getSchadenFotoById(id);
      return res.status(201).json({
        foto: {
          id,
          created_at: saved && saved.created_at != null ? String(saved.created_at) : new Date().toISOString(),
          url: `/schaeden/${encodeURIComponent(sid)}/fotos/${encodeURIComponent(id)}/file`,
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/:schadenId/fotos/:fotoId/file', schSehen, async (req, res, next) => {
    try {
      const sid = typeof req.params.schadenId === 'string' ? req.params.schadenId.trim() : '';
      const fid = typeof req.params.fotoId === 'string' ? req.params.fotoId.trim() : '';
      if (!sid || !fid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Parameter.',
        });
      }
      const schRow = await store.getSchadenById(sid);
      if (!schRow) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Schaden nicht gefunden.',
        });
      }
      const foto = await store.getSchadenFotoById(fid);
      if (!foto || String(foto.schaden_id) !== sid) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Foto nicht gefunden.',
        });
      }
      const abs = resolveUploadAbsolute(String(foto.file_path || ''));
      if (!abs || !fs.existsSync(abs)) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Datei fehlt.',
        });
      }
      res.setHeader('Content-Type', mimeFromRelativePath(String(foto.file_path)));
      return res.sendFile(abs);
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/:schadenId/werkstatt', schBearbeiten, async (req, res, next) => {
    try {
      const userId = req.auth.userId;
      const sid = typeof req.params.schadenId === 'string' ? req.params.schadenId.trim() : '';
      if (!sid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Schaden-ID.',
        });
      }
      const row = await store.getSchadenById(sid);
      if (!row) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Schaden nicht gefunden.',
        });
      }
      const ws = normalizeWerkstattStatus(req.body?.werkstatt_status);
      if (ws == null) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld „werkstatt_status“ muss offen, in_arbeit oder fertig sein.',
        });
      }
      const updated = await store.updateSchadenWerkstatt(sid, ws, userId);
      if (!updated) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Schaden nicht gefunden.',
        });
      }
      if (typeof updated === 'object' && 'error' in updated && updated.error === 'INVALID_WERKSTATT_STATUS') {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültiger Werkstatt-Status.',
        });
      }
      return res.status(200).json({ schaden: mapSchadenPublic(updated) });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/:schadenId', schSehen, async (req, res, next) => {
    try {
      const sid = typeof req.params.schadenId === 'string' ? req.params.schadenId.trim() : '';
      if (!sid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Schaden-ID.',
        });
      }
      const row = await store.getSchadenById(sid);
      if (!row) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Schaden nicht gefunden.',
        });
      }
      return res.status(200).json({ schaden: mapSchadenPublic(row) });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/', schErstellen, async (req, res, next) => {
    try {
      const userId = req.auth.userId;
      const rawPid = req.body?.project_id;
      if (rawPid == null || rawPid === '' || typeof rawPid !== 'string' || !rawPid.trim()) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld "project_id" ist erforderlich.',
        });
      }
      const projectId = rawPid.trim();
      const project = await store.getProjectById(projectId);
      if (!project) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Projekt wurde nicht gefunden.',
        });
      }
      const rawFz = req.body?.fahrzeug_id;
      if (rawFz == null || rawFz === '' || typeof rawFz !== 'string' || !rawFz.trim()) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld "fahrzeug_id" ist erforderlich.',
        });
      }
      const fahrzeugId = rawFz.trim();
      const fz = await store.getFahrzeugById(fahrzeugId);
      if (!fz) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Fahrzeug nicht gefunden.',
        });
      }
      if (String(fz.project_id) !== projectId) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Fahrzeug gehört nicht zu diesem Projekt.',
        });
      }

      const titelRaw = req.body?.titel;
      if (typeof titelRaw !== 'string' || !titelRaw.trim()) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld "titel" ist erforderlich.',
        });
      }

      const beschreibungRaw = req.body?.beschreibung;
      let beschreibung = null;
      if (beschreibungRaw != null && beschreibungRaw !== '') {
        if (typeof beschreibungRaw !== 'string') {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Feld "beschreibung" muss Text sein.',
          });
        }
        beschreibung = beschreibungRaw.trim() || null;
      }

      const statusNorm = normalizeSchadenStatus(req.body?.status);
      if (statusNorm == null) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld "status" muss offen, in_bearbeitung oder erledigt sein.',
        });
      }
      const statusFinal = statusNorm;

      const extraFields = extractExtraFromBody(req.body || {});
      const extraJson = extraFields ? JSON.stringify(extraFields) : null;

      const id = randomUUID();
      try {
        await store.insertSchaden({
          id,
          projectId,
          fahrzeugId,
          titel: titelRaw.trim(),
          beschreibung,
          status: statusFinal,
          extraJson,
        });
      } catch {
        return res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Schaden konnte nicht angelegt werden.',
        });
      }
      const created = await store.getSchadenById(id);
      return res.status(201).json({ schaden: mapSchadenPublic(created) });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/:schadenId', schBearbeiten, async (req, res, next) => {
    try {
      const sid = typeof req.params.schadenId === 'string' ? req.params.schadenId.trim() : '';
      if (!sid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Schaden-ID.',
        });
      }
      const row = await store.getSchadenById(sid);
      if (!row) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Schaden nicht gefunden.',
        });
      }
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'titel')) {
        patch.titel = req.body.titel;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'beschreibung')) {
        patch.beschreibung = req.body.beschreibung;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
        const sn = normalizeSchadenStatus(req.body.status);
        if (sn == null) {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Feld "status" muss offen, in_bearbeitung oder erledigt sein.',
          });
        }
        patch.status = sn;
      }
      // extra_json-Felder (Typ, Priorität, Abrechnung, WV, Melder, Terminanfrage)
      const extraFields = extractExtraFromBody(req.body || {});
      if (extraFields !== null) {
        patch.extra = extraFields;
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message:
            'Mindestens ein Feld: titel, beschreibung, status, typ, prioritaet, abrechnung_status, abrechnung_legacy, wiedervorlage, melder_name, terminanfrage, klaerung, verursacher, fremd_art, haftung_notiz, interne_notiz, reparatur_phase, linked_auftrag_id, meldedatum, schaden_dokumente.',
        });
      }

      const updated = await store.updateSchaden(sid, patch);
      if (!updated) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Schaden nicht gefunden.',
        });
      }
      if (typeof updated === 'object' && updated.error) {
        const msg =
          updated.error === 'INVALID_TITEL'
            ? 'Feld "titel" ungültig.'
            : updated.error === 'INVALID_BESCHREIBUNG'
              ? 'Feld "beschreibung" ungültig.'
              : updated.error === 'INVALID_STATUS'
                ? 'Feld "status" ungültig.'
                : 'Validierung fehlgeschlagen.';
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: msg,
        });
      }
      return res.status(200).json({ schaden: mapSchadenPublic(updated) });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
