/**
 * Proxy zum MesseFlow-PDF-/Caldera-Hilfsdienst (Port 3030 o. ä.) — gleiche Origin wie Cockpit-API,
 * damit der Browser kein Cross-Origin fetch auf localhost:3030 braucht.
 *
 * Upstream: MESSEFLOW_PRUEF_SERVER_URL (Default http://127.0.0.1:3030)
 */
import path from 'node:path';
import { Blob } from 'node:buffer';
import multer from 'multer';
import { Router } from 'express';
import { sendError } from '../lib/api-v1-envelope.js';
import { messeflowProxyUploadPdf, messeflowProxyUploadExport } from '../lib/upload-storage.js';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireModule } from '../middleware/require-rights.js';

const uploadPdf = messeflowProxyUploadPdf;
const uploadAny = messeflowProxyUploadExport;

function messeflowPruefUpstreamBase() {
  const raw = process.env.MESSEFLOW_PRUEF_SERVER_URL || 'http://127.0.0.1:3030';
  return String(raw).trim().replace(/\/+$/, '');
}

/** @param {import('../auth/access-profile.js').AccessProfile | undefined} p */
function hasMesseflowDateiPruefRecht(p) {
  if (!p) return false;
  return (
    p.has('ccintern', 'messeflow', 'upload')
    || p.has('ccintern', 'messeflow', 'bearbeiten')
    || p.has('ccintern', 'messeflow', 'erstellen')
  );
}

/**
 * @param {import('express').Router} parent — bereits unter /api/v1 gemountet
 * @param {import('express').RequestHandler[]} apiAuthProfile
 */
export function registerMesseflowPruefProxyRoutes(parent, apiAuthProfile) {
  const r = Router();

  const ccinternMesseflowSehen = chainMiddleware(
    requireModule('ccintern'),
    (req, res, next) => {
      const p = req.accessProfile;
      if (!p) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
      }
      if (!p.has('ccintern', 'messeflow', 'sehen')) {
        return sendError(res, 403, 'RIGHT_FORBIDDEN', 'Kein Zugriff auf MesseFlow (ccintern.messeflow.sehen).');
      }
      return next();
    },
  );

  const ccinternMesseflowPdfPruefen = chainMiddleware(
    requireModule('ccintern'),
    (req, res, next) => {
      const p = req.accessProfile;
      if (!p) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
      }
      if (!hasMesseflowDateiPruefRecht(p)) {
        return sendError(
          res,
          403,
          'RIGHT_FORBIDDEN',
          'Keine Berechtigung für PDF-Prüfung / Export (upload, bearbeiten oder erstellen).',
        );
      }
      return next();
    },
  );

  r.get('/status', ...apiAuthProfile, ccinternMesseflowSehen, async (_req, res) => {
    const base = messeflowPruefUpstreamBase();
    try {
      const upstream = await fetch(`${base}/status`, { signal: AbortSignal.timeout(8000) });
      const text = await upstream.text();
      const ct = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
      res.status(upstream.status).setHeader('Content-Type', ct);
      return res.send(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 502, 'BAD_GATEWAY', `Prüf-Server nicht erreichbar (${base}): ${msg}`);
    }
  });

  r.post(
    '/pdf/pruefen',
    ...apiAuthProfile,
    ccinternMesseflowPdfPruefen,
    uploadPdf.single('datei'),
    async (req, res) => {
      if (!req.file || !req.file.buffer) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine Datei (multipart-Feld „datei“).');
      }
      const base = messeflowPruefUpstreamBase();
      const form = new FormData();
      const blob = new Blob([req.file.buffer], {
        type: req.file.mimetype && req.file.mimetype !== '' ? req.file.mimetype : 'application/pdf',
      });
      form.append('datei', blob, req.file.originalname || 'upload.pdf');
      try {
        const upstream = await fetch(`${base}/pdf/pruefen`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(120000),
        });
        const text = await upstream.text();
        const ct = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
        res.status(upstream.status).setHeader('Content-Type', ct);
        return res.send(text);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 502, 'BAD_GATEWAY', `Prüf-Server nicht erreichbar (${base}): ${msg}`);
      }
    },
  );

  r.post('/export/ordner', ...apiAuthProfile, ccinternMesseflowPdfPruefen, async (req, res) => {
    const base = messeflowPruefUpstreamBase();
    try {
      const upstream = await fetch(`${base}/export/ordner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(req.body && typeof req.body === 'object' ? req.body : {}),
        signal: AbortSignal.timeout(30000),
      });
      const text = await upstream.text();
      const ct = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
      res.status(upstream.status).setHeader('Content-Type', ct);
      return res.send(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 502, 'BAD_GATEWAY', msg);
    }
  });

  r.post(
    '/export/datei',
    ...apiAuthProfile,
    ccinternMesseflowPdfPruefen,
    uploadAny.any(),
    async (req, res) => {
      const base = messeflowPruefUpstreamBase();
      const form = new FormData();
      for (const f of req.files || []) {
        if (!f.buffer) continue;
        const blob = new Blob([f.buffer], {
          type: f.mimetype && f.mimetype !== '' ? f.mimetype : 'application/octet-stream',
        });
        form.append(f.fieldname, blob, f.originalname || f.fieldname);
      }
      for (const [k, v] of Object.entries(req.body || {})) {
        if (v != null && String(v) !== '') form.append(k, String(v));
      }
      try {
        const upstream = await fetch(`${base}/export/datei`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(120000),
        });
        const text = await upstream.text();
        const ct = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
        res.status(upstream.status).setHeader('Content-Type', ct);
        return res.send(text);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 502, 'BAD_GATEWAY', msg);
      }
    },
  );

  r.post('/montagehilfe', ...apiAuthProfile, ccinternMesseflowSehen, async (req, res) => {
    const base = messeflowPruefUpstreamBase();
    try {
      const upstream = await fetch(`${base}/montagehilfe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/pdf, application/json' },
        body: JSON.stringify(req.body && typeof req.body === 'object' ? req.body : {}),
        signal: AbortSignal.timeout(120000),
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/pdf');
      return res.send(buf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 502, 'BAD_GATEWAY', msg);
    }
  });

  r.use((err, req, res, next) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return sendError(res, 400, 'VALIDATION_ERROR', err.message);
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/nicht erlaubt|Nur PDF-Dateien/i.test(msg)) {
      return sendError(res, 400, 'VALIDATION_ERROR', msg);
    }
    return next(err);
  });

  parent.use('/messeflow/pruef-server', r);
}
