// ═══════════════════════════════════════════════════════════════════════════════
// MesseFlow — direkter Prüfserver-Client (Port 3030)
// Cockpit-Frontend (:3000) → Prüfsystem (:3030). Keine Ersetzung bestehender Proxy-Logik.
// ═══════════════════════════════════════════════════════════════════════════════

/** Basis-URL des laufenden MesseFlow-Prüfsystems (siehe pruefserver/). */
const PRUEFSERVER_BASE_URL = 'http://localhost:3030';

/**
 * Sendet eine PDF-Datei an den Prüfserver und liefert die JSON-Antwort.
 * @param {File|Blob} datei
 * @returns {Promise<Record<string, unknown>>}
 */
async function pruefePdfDatei(datei) {
  if (datei == null || (typeof Blob !== 'undefined' && !(datei instanceof Blob))) {
    const msg = 'pruefePdfDatei: Parameter „datei“ muss ein File oder Blob sein.';
    console.error('[pruefePdfDatei]', msg);
    throw new TypeError(msg);
  }

  const url = `${String(PRUEFSERVER_BASE_URL).replace(/\/+$/, '')}/pdf/pruefen`;
  const body = new FormData();
  body.append('datei', datei);

  let res;
  try {
    res = await fetch(url, { method: 'POST', body });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[pruefePdfDatei] Netzwerkfehler', url, err);
    throw err;
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    console.error('[pruefePdfDatei] Kein gültiges JSON', { status: res.status, snippet: text.slice(0, 400) });
    throw new Error(`Prüfserver antwortete ohne gültiges JSON (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    console.error('[pruefePdfDatei] HTTP-Fehler', res.status, data);
  }

  return data;
}

if (typeof window !== 'undefined') {
  window.PRUEFSERVER_BASE_URL = PRUEFSERVER_BASE_URL;
  window.pruefePdfDatei = pruefePdfDatei;
}
