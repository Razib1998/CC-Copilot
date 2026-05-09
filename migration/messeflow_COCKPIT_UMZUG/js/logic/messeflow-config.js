// ═══════════════════════════════════════════════════════════════════════════════
// MESSEFLOW CONFIG  ←  Quelle: Messeflow/DEV/config.js
// Ziel: messeflow-config.js (logic/)
// Rolle: Alle Konfigurations-Konstanten der App.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// MesseFlow – ZENTRALE KONFIGURATION (Strato / Produktion)
// ═══════════════════════════════════════════════════════════════════════════
// Hier nur diese Werte anpassen:
//
//   MF_APP_BASE_URL     → öffentliche HTTPS-URL der App (Einladung, Passwort-Reset)
//   MF_USE_DEMO_DATA    → false = leere Projekte/Notifications (Produktion)
//                         true  = Demo-Projekte nur zum lokalen Testen
//
// Optional: MF_PRUEF_SERVER_URL – nur wenn der PDF-Prüf-Server auf einer ANDEREN
//           Basis-URL läuft als die App. Sonst weglassen (= gleiche Basis wie MF_APP_BASE_URL).
//
//   MF_INVITE_TTL_MINUTES → Gültigkeit Einladungslink (Standard: 48 Stunden)
// ═══════════════════════════════════════════════════════════════════════════

const MF_APP_BASE_URL = 'http://messe.cc-werbung-data.de:3030';

// ── COCKPIT-INTEGRATION ──────────────────────────────────────────────────────
// Im Cockpit-Betrieb kann MF_PRUEF_SERVER_URL überschrieben werden:
//   window.MF_COCKPIT_PRUEF_URL = 'http://localhost:5371';  ← vor Script-Load setzen
// Fallback: gleiche Basis wie App (Standalone-Betrieb)
// ─────────────────────────────────────────────────────────────────────────────

/** PDF-/API-Server (fetch …/status, …/pdf/pruefen). Im Cockpit: Cockpit-Backend-URL. */
const MF_PRUEF_SERVER_URL = (typeof window !== 'undefined' && window.MF_COCKPIT_PRUEF_URL)
  ? window.MF_COCKPIT_PRUEF_URL
  : MF_APP_BASE_URL;

// localStorage-Keys — alle mit Präfix mf_ (kein Konflikt mit fusa_, cc_, ckp_):
//   mf_session_v1, mf_invite_tokens_v1, mf_audit_events_v1,
//   mf_pwd_reset_v1, mf_invite_ttl_minutes, mf_invite_ttl_days,
//   mf_pwd_reset_ttl_hours — KEIN Namespace-Konflikt bestätigt.

/** true nur lokal zum Testen – auf Strato immer false lassen */
const MF_USE_DEMO_DATA = false;

/** true = Geräte-OTP (6-stelliger Code) beim Login überspringen – NUR zum lokalen Testen, auf Strato immer false! */
const MF_SKIP_DEVICE_OTP = true;

/** Einladungslink: Standard 48 Stunden (überschreibbar per localStorage mf_invite_ttl_minutes) */
const MF_INVITE_TTL_MINUTES = 48 * 60;

if (typeof window !== 'undefined') {
  window.MF_APP_BASE_URL = MF_APP_BASE_URL;
  window.MF_PRUEF_SERVER_URL = MF_PRUEF_SERVER_URL;
  window.MF_USE_DEMO_DATA = MF_USE_DEMO_DATA;
  window.MF_INVITE_TTL_MINUTES = MF_INVITE_TTL_MINUTES;
  window.MF_SKIP_DEVICE_OTP = MF_SKIP_DEVICE_OTP;
}

/**
 * Baut die vollständige URL zur index.html inkl. Query-Parametern (Einladung, Passwort-Reset).
 * @param {Record<string, string>} params z. B. { einladung: '…' } oder { 'passwort-reset': '…' }
 */
function mfBuildAppUrlWithQuery(params) {
  const origin = String(typeof window !== 'undefined' && window.MF_APP_BASE_URL ? window.MF_APP_BASE_URL : MF_APP_BASE_URL)
    .replace(/\/$/, '');
  try {
    const u = new URL('index.html', origin + '/');
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v != null && v !== '') u.searchParams.set(k, String(v));
    });
    return u.href;
  } catch (e) {
    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => q.set(k, String(v)));
    return `${origin}/index.html?${q.toString()}`;
  }
}

if (typeof window !== 'undefined') {
  window.mfBuildAppUrlWithQuery = mfBuildAppUrlWithQuery;
}
