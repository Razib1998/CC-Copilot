// ═══════════════════════════════════════════════════════════════════════════════
// MESSEFLOW CONFIG  ←  Quelle: Messeflow/DEV/config.js
// Ziel: messeflow-config.js (logic/)
// Rolle: Alle Konfigurations-Konstanten der App.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// MesseFlow – ZENTRALE KONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
// Cockpit setzt vor dem Laden der Skripte `window.__mfResolveCockpitApiOrigin`
// (siehe `messeflow-cockpit-mount.js`) → gleiche Basis wie `getApiBaseUrl()` / `apiFetch`.
// Standalone: `window.location.origin` als Fallback.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @returns {string}
 */
function mfResolveAppOrigin() {
  if (typeof window !== 'undefined' && typeof window.__mfResolveCockpitApiOrigin === 'function') {
    try {
      const o = String(window.__mfResolveCockpitApiOrigin() || '').replace(/\/+$/, '');
      if (o) return o;
    } catch (_) {
      /* ignore */
    }
  }
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return String(window.location.origin).replace(/\/+$/, '');
  }
  return '';
}

const MF_APP_BASE_URL = mfResolveAppOrigin();

/**
 * PDF-Prüf-Server (Node `messeflow-server`, z. B. Port 3030) — **nicht** die Cockpit-REST-API.
 * Im Cockpit-Embed darf die API-Basis nicht als Prüf-URL dienen (liefert HTML → JSON-Parse-Fehler).
 */
const MF_PRUEF_SERVER_URL = (() => {
  if (typeof window !== 'undefined' && window.MF_COCKPIT_PRUEF_URL) {
    return String(window.MF_COCKPIT_PRUEF_URL).replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.__MF_COCKPIT_EMBED) {
    const api = MF_APP_BASE_URL.replace(/\/+$/, '');
    if (api.endsWith('/api/v1')) return `${api}/messeflow/pruef-server`;
    return `${api}/api/v1/messeflow/pruef-server`;
  }
  return MF_APP_BASE_URL;
})();

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
