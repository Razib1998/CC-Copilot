'use strict';

/** Bis zu dieser Größe: komplette Datei als Latin1 scannen (bessere DPI-/Bild-Erkennung bei Großformat-PDFs). */
const FULL_SCAN_MAX_BYTES = 40 * 1024 * 1024;
/** Kopf/Tail nur bei sehr großen Dateien (> FULL_SCAN_MAX_BYTES). */
const HEAD_CHUNK = 14 * 1024 * 1024;
const TAIL_SCAN = 1024 * 1024;
/** Nach /Subtype /Image: Fenster für /Width /Height (PDF-Objektdictionaries). */
const IMAGE_OBJ_WINDOW = 24 * 1024;
const INDIRECT_BLOCK = 20 * 1024;

/**
 * @param {Buffer} bytes
 * @returns {string}
 */
function buildPdfLatin1Scan(bytes) {
  if (!bytes || !bytes.length) return '';
  if (bytes.length <= FULL_SCAN_MAX_BYTES) {
    return bytes.toString('latin1');
  }
  const head = bytes.subarray(0, Math.min(bytes.length, HEAD_CHUNK)).toString('latin1');
  const tailStart = Math.max(HEAD_CHUNK, bytes.length - TAIL_SCAN);
  const tail = bytes.subarray(tailStart).toString('latin1');
  return head + tail;
}

/**
 * @param {string} pdfText
 * @param {number} objNum
 * @returns {string|null}
 */
function resolveIndirectObjectBlock(pdfText, objNum) {
  if (!Number.isFinite(objNum) || objNum < 1) return null;
  const re = new RegExp(`\\b${objNum}\\s+\\d+\\s+obj\\s*`, 'm');
  const m = re.exec(pdfText);
  if (!m) return null;
  return pdfText.slice(m.index, m.index + INDIRECT_BLOCK);
}

/**
 * @param {string} dictSlice
 * @param {string} pdfText
 * @returns {{ w: number, h: number }|null}
 */
function readImageWidthHeight(dictSlice, pdfText) {
  const s = dictSlice.slice(0, IMAGE_OBJ_WINDOW);
  const num = '(\\d+(?:\\.\\d+)?)';
  /** Kein Treffer bei `/Width 12 0 R` (indirekte Referenz). */
  const notRef = '(?!\\s+\\d+\\s+R)';
  const wDir = new RegExp(`/Width\\s+${num}${notRef}\\b`).exec(s);
  const hDir = new RegExp(`/Height\\s+${num}${notRef}\\b`).exec(s);
  if (wDir && hDir) {
    const w = Math.round(parseFloat(wDir[1]));
    const h = Math.round(parseFloat(hDir[1]));
    if (w > 0 && h > 0) return { w, h };
  }

  const wRef = /\/Width\s+(\d+)\s+\d+\s+R\b/.exec(s);
  if (wRef) {
    const block = resolveIndirectObjectBlock(pdfText, parseInt(wRef[1], 10));
    if (block) {
      const w2 = new RegExp(`/Width\\s+${num}\\b`).exec(block);
      const h2 = new RegExp(`/Height\\s+${num}\\b`).exec(block);
      if (w2 && h2) {
        const w = Math.round(parseFloat(w2[1]));
        const h = Math.round(parseFloat(h2[1]));
        if (w > 0 && h > 0) return { w, h };
      }
    }
  }

  const hRef = /\/Height\s+(\d+)\s+\d+\s+R\b/.exec(s);
  if (hRef) {
    const block = resolveIndirectObjectBlock(pdfText, parseInt(hRef[1], 10));
    if (block) {
      const w2 = new RegExp(`/Width\\s+${num}\\b`).exec(block);
      const h2 = new RegExp(`/Height\\s+${num}\\b`).exec(block);
      if (w2 && h2) {
        const w = Math.round(parseFloat(w2[1]));
        const h = Math.round(parseFloat(h2[1]));
        if (w > 0 && h > 0) return { w, h };
      }
    }
  }

  return null;
}

/**
 * Pixelmaße pro Bild-Dictionary (heuristisch: erstes /Width-/Height-Paar im Fenster).
 * @param {string} pdfText
 * @returns {{ w: number, h: number }[]}
 */
function extractImagePixelSizes(pdfText) {
  const out = [];
  const reSubtypeImage = /\/Subtype\s*\/Image\b/gi;
  let m;
  while ((m = reSubtypeImage.exec(pdfText)) !== null) {
    const slice = pdfText.slice(m.index, m.index + IMAGE_OBJ_WINDOW * 2);
    const pair = readImageWidthHeight(slice, pdfText);
    if (pair) out.push(pair);
  }
  return out;
}

/**
 * @param {string} pdfText
 * @param {number|null|undefined} breiteMm
 * @param {number|null|undefined} hoeheMm
 */
function analyzeDpiFromImages(pdfText, breiteMm, hoeheMm) {
  const pixelPairs = extractImagePixelSizes(pdfText);
  const mmOk =
    typeof breiteMm === 'number'
    && typeof hoeheMm === 'number'
    && breiteMm > 0
    && hoeheMm > 0
    && Number.isFinite(breiteMm)
    && Number.isFinite(hoeheMm);

  if (!pixelPairs.length || !mmOk) {
    return {
      anzahlMitGroesse: 0,
      dpiMin: null,
      dpiFinal: null,
      dpiGeprueft: false,
      dpiStatus: 'ok',
      dpiText: null,
    };
  }

  let globalMin = Infinity;
  for (const { w, h } of pixelPairs) {
    const dpiX = (w / breiteMm) * 25.4;
    const dpiY = (h / hoeheMm) * 25.4;
    const localMin = Math.min(dpiX, dpiY);
    if (Number.isFinite(localMin)) globalMin = Math.min(globalMin, localMin);
  }

  if (!Number.isFinite(globalMin)) {
    return {
      anzahlMitGroesse: pixelPairs.length,
      dpiMin: null,
      dpiFinal: null,
      dpiGeprueft: false,
      dpiStatus: 'ok',
      dpiText: null,
    };
  }

  const dpiFinal = Math.round(globalMin);
  let dpiStatus = 'ok';
  let dpiText = 'Auflösung gut';
  if (dpiFinal < 150) {
    dpiStatus = 'fehler';
    dpiText = `Auflösung zu gering (${dpiFinal} DPI)`;
  } else if (dpiFinal < 300) {
    dpiStatus = 'hinweis';
    dpiText = `Auflösung mittel (${dpiFinal} DPI)`;
  }

  return {
    anzahlMitGroesse: pixelPairs.length,
    dpiMin: globalMin,
    dpiFinal,
    dpiGeprueft: true,
    dpiStatus,
    dpiText,
  };
}

/**
 * @param {string} pdfText
 */
function analyzeBilder(pdfText, dpiBlock) {
  const reSubtypeImage = /\/Subtype\s*\/Image\b/gi;
  const matches = pdfText.match(reSubtypeImage);
  const anzahlBilder = matches ? matches.length : 0;
  const bilderGefunden = anzahlBilder > 0;
  const hasWidth = /\/Width\b/.test(pdfText);
  const hasHeight = /\/Height\b/.test(pdfText);
  const hinweis = bilderGefunden
    ? dpiBlock.dpiGeprueft && dpiBlock.dpiFinal != null
      ? `Mindest-DPI bezogen auf Seite 1 (MediaBox): ${dpiBlock.dpiFinal} DPI. ${dpiBlock.dpiText}`
      : 'Bilder erkannt, aber keine auswertbaren /Width-/Height-Paare im Scan — DPI nicht berechenbar.'
    : 'Keine eingebetteten Bilder (/Subtype /Image) im gescannten Bereich erkannt.';

  return {
    bilderGefunden,
    anzahlBilder,
    hatWidthHeight: !!(hasWidth && hasHeight),
    dpiGeprueft: dpiBlock.dpiGeprueft,
    dpiMin: dpiBlock.dpiMin,
    dpiFinal: dpiBlock.dpiFinal,
    dpiStatus: dpiBlock.dpiStatus,
    dpiText: dpiBlock.dpiText,
    hinweis,
  };
}

/**
 * @param {string} pdfText
 */
function analyzeFarbraum(pdfText) {
  const cmyk = /\/DeviceCMYK\b/i.test(pdfText);
  const rgb = /\/DeviceRGB\b/i.test(pdfText);
  const icc = /\/ICCBased\b/i.test(pdfText);
  const sonderfarben = /\/Separation\b/i.test(pdfText);
  const grau = /\/DeviceGray\b/i.test(pdfText);

  let status = 'hinweis';
  let hinweisText = 'Farbraum nicht sicher erkennbar';
  if (cmyk) {
    status = 'ok';
    hinweisText = 'CMYK-Farbraum erkannt';
  }
  if (rgb) {
    hinweisText = 'RGB-Farbraum erkannt';
    if (!cmyk) status = 'hinweis';
    else {
      status = 'hinweis';
      hinweisText = 'CMYK und RGB im Dokument erkannt';
    }
  }
  if (!cmyk && !rgb && !icc && !sonderfarben && !grau) {
    status = 'hinweis';
    hinweisText = 'Farbraum nicht sicher erkennbar';
  } else if (icc && !cmyk && !rgb) {
    status = 'hinweis';
    hinweisText = 'ICC-basierter Farbraum erkannt';
  }

  return {
    cmyk,
    rgb,
    icc,
    sonderfarben,
    grau,
    status,
    hinweisText,
  };
}

/**
 * @param {string} pdfText
 */
function analyzeSchriften(pdfText) {
  const fontsGefunden = /\/Font\b/.test(pdfText);
  const fontFile =
    /\/FontFile\b/.test(pdfText)
    || /\/FontFile2\b/.test(pdfText)
    || /\/FontFile3\b/.test(pdfText);
  const eingebettetHinweis = fontsGefunden && !fontFile;
  const status = fontFile ? 'ok' : fontsGefunden ? 'hinweis' : 'hinweis';
  const hinweis = fontsGefunden
    ? fontFile
      ? 'Schriften grob erkannt (Font-Streams sichtbar).'
      : 'Schriften erkannt, keine Font-File-Streams im Scan (Einbettung unsicher).'
    : 'Keine /Font-Einträge im gescannten Bereich gefunden.';
  return {
    fontsGefunden,
    eingebettetHinweis,
    status,
    hinweis,
  };
}

/**
 * @param {ReturnType<typeof analyzeFarbraum>} farb
 * @param {ReturnType<typeof analyzeSchriften>} schr
 * @param {ReturnType<typeof analyzeDpiFromImages>} dpiBlock
 * @param {ReturnType<typeof analyzeBilder>} bildanalyse
 * @returns {{ fehler: string[], hinweise: string[] }}
 */
function buildFehlerUndHinweise(farb, schr, dpiBlock, bildanalyse) {
  const fehler = [];
  const hinweise = [];

  if (farb.rgb) {
    fehler.push('RGB-Farbraum für Druck ungeeignet');
  }
  if (!farb.cmyk && !farb.rgb) {
    hinweise.push('Farbraum nicht eindeutig erkannt');
  }

  /** Nicht eingebettet: Fonts gefunden, aber kein FontFile-Stream im Scan. */
  if (schr.fontsGefunden && schr.eingebettetHinweis) {
    fehler.push('Schriften nicht eingebettet');
  }

  if (dpiBlock.dpiGeprueft && dpiBlock.dpiStatus === 'fehler' && dpiBlock.dpiText) {
    fehler.push(dpiBlock.dpiText);
  }
  if (dpiBlock.dpiGeprueft && dpiBlock.dpiStatus === 'hinweis' && dpiBlock.dpiText) {
    hinweise.push(dpiBlock.dpiText);
  }

  if (bildanalyse.bilderGefunden && !dpiBlock.dpiGeprueft) {
    hinweise.push('Bilder erkannt, DPI nicht bewertbar (keine Pixelmaße im Scan)');
  }

  return {
    fehler: [...new Set(fehler)],
    hinweise: [...new Set(hinweise)],
  };
}

/**
 * Weiche Hinweise für UI-Liste (ohne harte fehler[]-Duplikate).
 * @param {ReturnType<typeof analyzeFarbraum>} farb
 * @param {ReturnType<typeof analyzeSchriften>} schr
 * @param {ReturnType<typeof analyzeBilder>} bildanalyse
 * @returns {string[]}
 */
function buildZusaetzlicheHinweise(farb, schr, bildanalyse) {
  const h = [];
  if (farb.rgb && farb.cmyk) {
    h.push('CMYK und RGB im Dokument gemischt');
  }
  if (farb.status === 'hinweis' && farb.hinweisText.includes('nicht sicher')) {
    h.push('Farbraum nicht sicher erkennbar');
  }
  return [...new Set(h)];
}

/**
 * UI erwartet { status, modus, meldung } (messeflow-detail-view).
 * @param {ReturnType<typeof analyzeFarbraum>} farb
 */
function farbraumForUi(farb) {
  let modus = 'unbekannt';
  if (farb.cmyk && farb.rgb) modus = 'gemischt';
  else if (farb.cmyk) modus = 'cmyk';
  else if (farb.rgb) modus = 'rgb';
  else if (farb.icc || farb.sonderfarben || farb.grau) modus = 'sonder';

  const status =
    farb.rgb && !farb.cmyk ? 'warnung'
      : farb.cmyk ? 'ok'
        : 'warnung';
  return {
    status,
    modus,
    meldung: farb.hinweisText,
    cmyk: farb.cmyk,
    rgb: farb.rgb,
    icc: farb.icc,
    sonderfarben: farb.sonderfarben,
    grau: farb.grau,
  };
}

/**
 * @param {Buffer} bytes
 * @param {number} [breiteMm]
 * @param {number} [hoeheMm]
 */
function analyzePdfBuffer(bytes, breiteMm, hoeheMm) {
  const pdfText = buildPdfLatin1Scan(bytes);
  const dpiBlock = analyzeDpiFromImages(pdfText, breiteMm, hoeheMm);
  const bildanalyse = analyzeBilder(pdfText, dpiBlock);
  const farbraumGrob = analyzeFarbraum(pdfText);
  const schriften = analyzeSchriften(pdfText);

  const { fehler, hinweise: harteHinweise } = buildFehlerUndHinweise(
    farbraumGrob,
    schriften,
    dpiBlock,
    bildanalyse,
  );
  const weiche = buildZusaetzlicheHinweise(farbraumGrob, schriften, bildanalyse);
  const hinweise = [...new Set([...harteHinweise, ...weiche])];

  const farbraumUi = farbraumForUi(farbraumGrob);

  const alleEingebettet =
    !schriften.eingebettetHinweis && (!schriften.fontsGefunden || schriften.status === 'ok');
  const nichtEingebettet = schriften.eingebettetHinweis
    ? ['Möglicherweise nicht eingebettete Schriften (heuristisch)']
    : [];

  let ampel = 'gruen';
  if (fehler.length > 0) ampel = 'rot';
  else if (hinweise.length > 0) ampel = 'gelb';

  return {
    bildanalyse,
    farbraumUi,
    schriften,
    hinweise,
    fehler,
    ampel,
    dpiBlock,
    alleEingebettet,
    nichtEingebettet,
  };
}

module.exports = {
  analyzePdfBuffer,
  buildPdfLatin1Scan,
};
