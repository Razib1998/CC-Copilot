// ═══════════════════════════════════════════════════════════════════════════
// MesseFlow – KONFIGURATION FÜR CC COCKPIT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️  DIESE DATEI: Für den Einbau ins neue CC Cockpit vorbereitet
//     DEV-Flags sind auf PRODUKTION gesetzt (false)
//     Nur MF_APP_BASE_URL anpassen wenn Domain sich ändert
// ═══════════════════════════════════════════════════════════════════════════

const MF_APP_BASE_URL = 'https://messe.cc-werbung-data.de';

const MF_PRUEF_SERVER_URL = MF_APP_BASE_URL;

// ── PRODUKTION: alle Test-Flags auf false ────────────────────────────────
const MF_USE_DEMO_DATA    = false;  // ← PRODUKTION: keine Demo-Daten
const MF_SKIP_DEVICE_OTP  = false;  // ← PRODUKTION: OTP aktiv
const MF_TEST_MODE        = false;  // ← PRODUKTION: kein Test-Modus

const MF_INVITE_TTL_MINUTES = 48 * 60; // 48 Stunden

if (typeof window !== 'undefined') {
  window.MF_APP_BASE_URL      = MF_APP_BASE_URL;
  window.MF_PRUEF_SERVER_URL  = MF_PRUEF_SERVER_URL;
  window.MF_USE_DEMO_DATA     = MF_USE_DEMO_DATA;
  window.MF_INVITE_TTL_MINUTES= MF_INVITE_TTL_MINUTES;
  window.MF_SKIP_DEVICE_OTP   = MF_SKIP_DEVICE_OTP;
  window.MF_TEST_MODE         = MF_TEST_MODE;
}

function mfBuildAppUrlWithQuery(params) {
  const origin = String(typeof window !== 'undefined' && window.MF_APP_BASE_URL
    ? window.MF_APP_BASE_URL : MF_APP_BASE_URL).replace(/\/$/, '');
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
