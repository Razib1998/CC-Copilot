'use strict';

const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const { analyzePdfBuffer } = require('./pdf-checks');

const PORT = Number(process.env.PORT) || 3030;
const PT_TO_MM = 0.3528;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 95 * 1024 * 1024 },
});

const app = express();

// CORS zuerst — vor allen Routes (inkl. POST /pdf/pruefen), damit der Browser die Antwort lesen darf.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.disable('x-powered-by');

app.get('/status', (_req, res) => {
  res.json({ ok: true, service: 'messeflow-pruefserver' });
});

app.post('/pdf/pruefen', upload.single('datei'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        ok: false,
        status: 'fehler',
        hinweise: [],
        fehler: ['Keine Datei (multipart-Feld „datei“).'],
      });
    }

    const bytes = req.file.buffer;

    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (!pages.length) {
      return res.status(400).json({
        ok: false,
        status: 'fehler',
        hinweise: [],
        fehler: ['PDF enthält keine Seiten.'],
      });
    }

    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    const mmW = width * PT_TO_MM;
    const mmH = height * PT_TO_MM;
    const breiteMm = Math.round(mmW);
    const hoeheMm = Math.round(mmH);

    const checks = analyzePdfBuffer(bytes, breiteMm, hoeheMm);
    const fehler = checks.fehler;
    const hinweise = checks.hinweise;

    const farbUi = checks.farbraumUi;
    const schr = checks.schriften;
    const dpiB = checks.dpiBlock;

    const dpiRowStatus =
      dpiB.dpiGeprueft && dpiB.dpiStatus === 'fehler'
        ? 'fehler'
        : dpiB.dpiGeprueft && dpiB.dpiStatus === 'hinweis'
          ? 'warnung'
          : 'ok';

    const schriftStatus =
      fehler.some((f) => f.includes('Schriften'))
        ? 'fehler'
        : schr.status === 'ok'
          ? 'ok'
          : 'warnung';

    const farbRowStatus =
      fehler.some((f) => f.includes('RGB'))
        ? 'fehler'
        : farbUi.status;

    const pruefung = [
      {
        titel: 'Maß / Format',
        wert: `${breiteMm} × ${hoeheMm} mm`,
        detail: 'MediaBox Seite 1 (pdf-lib, pt → mm)',
        status: 'ok',
      },
      {
        titel: 'DPI / Raster',
        wert: dpiB.dpiGeprueft && dpiB.dpiFinal != null
          ? `${dpiB.dpiFinal} DPI`
          : checks.bildanalyse.bilderGefunden
            ? `${checks.bildanalyse.anzahlBilder} Bild(er), DPI n.b.`
            : '—',
        detail:
          dpiB.dpiGeprueft && dpiB.dpiText
            ? dpiB.dpiText
            : checks.bildanalyse.hinweis,
        status: dpiRowStatus,
      },
      {
        titel: 'Farbraum',
        wert:
          farbUi.modus === 'cmyk'
            ? 'CMYK'
            : farbUi.modus === 'rgb'
              ? 'RGB'
              : farbUi.modus === 'gemischt'
                ? 'CMYK+RGB'
                : farbUi.modus === 'sonder'
                  ? 'ICC/Separation/Graustufen'
                  : 'Unbekannt',
        detail: farbUi.meldung,
        status: farbRowStatus,
      },
      {
        titel: 'Schriften',
        wert: schr.fontsGefunden ? (schr.eingebettetHinweis ? 'Einbettung unsicher' : 'Font-Streams sichtbar') : '—',
        detail: schr.hinweis,
        status: schriftStatus,
      },
    ];

    const ergebnis = {
      status: fehler.length === 0 ? 'ok' : 'fehler',
      masseStr: `${breiteMm} × ${hoeheMm} mm`,
      abmessungen: {
        breiteMm,
        hoeheMm,
      },
      dpi:
        dpiB.dpiGeprueft && dpiB.dpiFinal != null
          ? {
              wert: dpiB.dpiFinal,
              status: dpiB.dpiStatus,
              text: dpiB.dpiText,
            }
          : null,
      ampel: checks.ampel,
      farbraum: farbUi,
      bildanalyse: checks.bildanalyse,
      schriften: schr,
      alleEingebettet: checks.alleEingebettet,
      nichtEingebettet: checks.nichtEingebettet,
      meldung: 'Grobprüfung (Latin1-Heuristik + pdf-lib). Keine Druckvorstufen-Garantie.',
      istPdfX: false,
      pruefung,
    };

    return res.json({
      ok: fehler.length === 0,
      status: 'geprueft',
      hinweise,
      fehler,
      ergebnis,
    });
  } catch (err) {
    console.error('[pdf/pruefen]', err);
    return res.status(500).json({
      ok: false,
      status: 'fehler',
      hinweise: [],
      fehler: ['PDF konnte nicht analysiert werden.'],
    });
  }
});

app.use((err, _req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      ok: false,
      status: 'fehler',
      hinweise: [],
      fehler: [err.message],
    });
  }
  return res.status(500).json({
    ok: false,
    status: 'fehler',
    hinweise: [],
    fehler: [err.message || 'Interner Fehler'],
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`messeflow-pruefserver listening on http://0.0.0.0:${PORT}`);
});
