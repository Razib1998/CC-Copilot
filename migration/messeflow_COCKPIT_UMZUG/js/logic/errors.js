// ═══════════════════════════════════════════════════════
// Verständliche Fehlermeldungen (Mapping technisch → Nutzer)
// ═══════════════════════════════════════════════════════

const MF_ERROR_HINTS = [
  { test: /firma|company/i, text: 'Bitte zuerst eine Firma anlegen, bevor Sie einen Benutzer anlegen.' },
  { test: /network|fetch|failed to fetch/i, text: 'Netzwerkfehler. Prüfen Sie Ihre Verbindung oder den Prüf-Server und versuchen Sie es erneut.' },
  { test: /passwort|password/i, text: 'Passwort-Anforderungen nicht erfüllt oder falsch eingegeben.' },
  { test: /permission|zugriff|403/i, text: 'Sie haben für diese Aktion keine Berechtigung.' },
  { test: /ungültig|invalid/i, text: 'Eingabe oder Link ungültig – prüfen Sie Ihre Daten.' },
];

function mfExplainError(err) {
  const raw = err == null ? '' : String(err.message || err);
  for (const h of MF_ERROR_HINTS) {
    if (h.test.test(raw)) return `${raw ? raw + ' — ' : ''}${h.text}`;
  }
  return raw || 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.';
}

window.mfExplainError = mfExplainError;
