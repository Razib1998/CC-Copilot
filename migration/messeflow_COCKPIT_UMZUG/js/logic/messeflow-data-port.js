// ═══════════════════════════════════════════════════════════════════════════════
// MESSEFLOW DATA PORT  ←  Quellen: js/logic/*.js + js/api/server.js
// Ziel: messeflow-data-port.js (logic/)
//
// Enthält ALLE:
//   • localStorage-Zugriffe        (Session, Invite-Tokens, Audit-Log, Geräte)
//   • API-Calls / fetch()          (Server-Prüfung, PDF-Prüf-Server)
//   • Daten-Transformationen       (Auth, Devices, Invite, Audit, Errors)
//   • Übergabe-Logik               (CC-Intern-Auftrag, Caldera-Export-Trigger)
//   • Status- und Freigabe-Logik   (Produktionsplan, Auto-Freigabe)
//
// Zusammengeführt aus (in Ladereihenfolge der index.html):
//   1. js/logic/invite.js          – Token, Passwort, Einladungslink
//   2. js/logic/devices.js         – Geräte-OTP, localStorage-Session
//   3. js/logic/auth.js            – Login, Session, Passwort-Reset
//   4. js/logic/audit.js           – Audit-Log (localStorage)
//   5. js/logic/errors.js          – Fehlermeldungen / Mapping
//   6. js/logic/status.js          – Status-Konstanten + recalc()
//   7. js/logic/freigabe.js        – Produktionsplan, Auto-Freigabe
//   8. js/logic/uebergabe.js       – CC-Intern-Auftrag anlegen
//   9. js/api/server.js            – PDF-Prüf-Server-Kommunikation
//
// TODO Cockpit-Umzug:
//   - fetch()-Calls auf Cockpit-Backend-URL umstellen
//   - localStorage-Keys prüfen (kein Namespace-Konflikt mit Cockpit)
//   - mfSaveState() mit Cockpit-Persistenz verknüpfen
// ═══════════════════════════════════════════════════════════════════════════════


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/logic/invite.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ═══════════════════════════════════════════════════════
// EINLADUNGEN — Token (einmalig, TTL), kein Direktlogin per User-ID
// ═══════════════════════════════════════════════════════

const MF_INVITE_STORAGE_KEY = 'mf_invite_tokens_v1';

function mfGetInviteTtlMs() {
  try {
    const minW = typeof window !== 'undefined' && window.MF_INVITE_TTL_MINUTES;
    const minLs = localStorage.getItem('mf_invite_ttl_minutes');
    const mins = Number(minW || minLs);
    if (Number.isFinite(mins) && mins >= 1 && mins <= 10080) return mins * 60 * 1000;
    const dayW = typeof window !== 'undefined' && window.MF_INVITE_TTL_DAYS;
    const dayLs = localStorage.getItem('mf_invite_ttl_days');
    const days = Number(dayW || dayLs);
    if (Number.isFinite(days) && days >= 1 && days <= 365) return days * 24 * 60 * 60 * 1000;
  } catch (e) { /* ignore */ }
  return 48 * 60 * 60 * 1000;
}

/** Anzeige-Hilfe für Admin-Modal */
function mfGetInviteTtlLabel() {
  const ms = mfGetInviteTtlMs();
  const h48 = 48 * 60 * 60 * 1000;
  if (ms === h48) return '48 Std.';
  if (ms < h48) {
    const m = Math.round(ms / 60000);
    return `${m} Min.`;
  }
  const d = Math.round(ms / (24 * 60 * 60 * 1000) * 10) / 10;
  return d >= 1 && d < 2 ? '1 Tag' : `${d} Tage`;
}

function mfLoadTokenStore() {
  try {
    const raw = localStorage.getItem(MF_INVITE_STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}

function mfSaveTokenStore(store) {
  try {
    localStorage.setItem(MF_INVITE_STORAGE_KEY, JSON.stringify(store));
  } catch (e) { /* ignore */ }
}

function mfGenToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

function mfMarkInviteExpiredForUser(userId) {
  const u = USERS.find(x => x.id === userId);
  if (u && u.kontoStatus === 'eingeladen') u.kontoStatus = 'einladung_abgelaufen';
}

function mfUserNeedsInviteFlow(u) {
  if (!u) return false;
  return u.kontoStatus === 'eingeladen' || u.kontoStatus === 'einladung_abgelaufen';
}

function mfUserIsLegacyKonto(u) {
  if (!u) return true;
  if (u.kontoStatus === 'eingeladen' || u.kontoStatus === 'einladung_abgelaufen' || u.kontoStatus === 'deaktiviert')
    return false;
  if (u.kontoStatus === 'aktiv') return false;
  return !u.kontoStatus;
}

/**
 * Neues Token für einen Benutzer (löscht offene Token desselben Users).
 * Setzt kontoStatus auf 'eingeladen', aktualisiert einladungLetzteAm.
 * @returns {string|null} Rohtoken oder null (z. B. Benutzer unbekannt)
 */
function createInviteToken(userId) {
  const u = USERS.find(x => x.id === userId);
  if (!u) return null;
  if (u.passwordHash && typeof mfUserNeedsInviteFlow === 'function' && !mfUserNeedsInviteFlow(u)) return null;
  if (u.kontoStatus === 'aktiv' && u.passwordHash) return null;

  const store = mfLoadTokenStore();
  Object.keys(store).forEach(k => {
    const r = store[k];
    if (r && r.userId === userId && !r.used) delete store[k];
  });

  const token = mfGenToken();
  store[token] = { userId, exp: Date.now() + mfGetInviteTtlMs(), used: false };
  mfSaveTokenStore(store);

  u.kontoStatus = 'eingeladen';
  u.einladungLetzteAm = new Date().toISOString();
  return token;
}

/**
 * @returns {{ ok: boolean, userId?: string, reason?: string }}
 */
function validateInviteToken(token) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'invalid' };
  const store = mfLoadTokenStore();
  const rec = store[token];
  if (!rec) return { ok: false, reason: 'invalid' };
  if (rec.used) return { ok: false, reason: 'used' };
  if (rec.exp < Date.now()) {
    mfMarkInviteExpiredForUser(rec.userId);
    delete store[token];
    mfSaveTokenStore(store);
    return { ok: false, reason: 'expired' };
  }
  const u = USERS.find(x => x.id === rec.userId);
  if (!u) return { ok: false, reason: 'invalid' };
  if (typeof isUserGesperrt === 'function' && isUserGesperrt(u)) return { ok: false, reason: 'deaktiviert' };
  if (u.kontoStatus === 'deaktiviert' || u.aktiv === false) return { ok: false, reason: 'deaktiviert' };
  return { ok: true, userId: rec.userId };
}

function consumeInviteToken(token) {
  const store = mfLoadTokenStore();
  const rec = store[token];
  if (!rec) return false;
  rec.used = true;
  mfSaveTokenStore(store);
  return true;
}

function buildEinladungsUrl(token) {
  if (typeof mfBuildAppUrlWithQuery === 'function') {
    return mfBuildAppUrlWithQuery({ einladung: token });
  }
  const base = window.location.href.split(/[?#]/)[0];
  return `${base}?einladung=${encodeURIComponent(token)}`;
}

function mfGenerateSaltB64() {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  return btoa(String.fromCharCode(...s));
}

async function mfHashPassword(password, saltB64) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Passwort sicher setzen; Token verbrauchen; Konto aktivieren.
 * @returns {{ ok: boolean, error?: string, user?: object }}
 */
async function activateUserWithInviteToken(token, { name, email, pass1, pass2 }) {
  const v = validateInviteToken(token);
  if (!v.ok) {
    const map = { invalid: 'Ungültiger Link.', used: 'Dieser Link wurde bereits verwendet.',
      expired: 'Einladung abgelaufen – bitte neuen Link anfordern.',
      deaktiviert: 'Dieses Konto ist deaktiviert.' };
    return { ok: false, error: map[v.reason] || 'Einladung ungültig.' };
  }

  const u = USERS.find(x => x.id === v.userId);
  if (!u) return { ok: false, error: 'Benutzer nicht gefunden.' };

  const n = (name || '').trim();
  if (!n) return { ok: false, error: 'Bitte Namen angeben.' };

    const em = (email || '').trim();
  const p1 = pass1 || '';
  const p2 = pass2 || '';
  if (p1.length < 8) return { ok: false, error: 'Passwort mindestens 8 Zeichen.' };
  if (p1 !== p2) return { ok: false, error: 'Passwörter stimmen nicht überein.' };

  const lower = n.toLowerCase().replace(/\s+/g, '');
  const bad = [lower, (u.name || '').toLowerCase().replace(/\s+/g, ''), 'celal', 'passwort', 'password'];
  if (bad.some(b => b.length >= 4 && p1.toLowerCase().includes(b))) {
    return { ok: false, error: 'Passwort darf nicht vom Namen abgeleitet werden oder zu einfach sein.' };
  }

  try {
    const salt = mfGenerateSaltB64();
    const hash = await mfHashPassword(p1, salt);
    u.name = n;
    if (em) u.email = em;
    u.passwordSalt = salt;
    u.passwordHash = hash;
    u.kontoStatus = 'aktiv';
    consumeInviteToken(token);
    return { ok: true, user: u };
  } catch (e) {
    return { ok: false, error: 'Passwort konnte nicht gespeichert werden. Bitte erneut versuchen.' };
  }
}

async function mfVerifyPassword(password, saltB64, hashHex) {
  if (!password || !saltB64 || !hashHex || typeof mfHashPassword !== 'function') return false;
  try {
    const h = await mfHashPassword(password, saltB64);
    return h === hashHex;
  } catch (e) {
    return false;
  }
}

window.mfGetInviteTtlMs = mfGetInviteTtlMs;
window.mfGetInviteTtlLabel = mfGetInviteTtlLabel;
window.mfHashPassword = mfHashPassword;
window.mfVerifyPassword = mfVerifyPassword;
window.mfGenToken = mfGenToken;
window.mfGenerateSaltB64 = mfGenerateSaltB64;
window.createInviteToken = createInviteToken;
window.validateInviteToken = validateInviteToken;
window.consumeInviteToken = consumeInviteToken;
window.buildEinladungsUrl = buildEinladungsUrl;
window.activateUserWithInviteToken = activateUserWithInviteToken;
window.mfUserNeedsInviteFlow = mfUserNeedsInviteFlow;
window.mfUserIsLegacyKonto = mfUserIsLegacyKonto;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/logic/devices.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ═══════════════════════════════════════════════════════
// GERÄTE, MAGIC-LOGIN, SESSION-TOKENS (Demo: localStorage)
// Magic-Link: 15 Min, einmalig · Vertrauenswürdige Geräte · OTP bei neuem Gerät
// ═══════════════════════════════════════════════════════

const MF_BROWSER_DEVICE_KEY = 'mf_browser_device_id_v1';
const MF_SECURITY_KEY = 'mf_security_v1';
const MF_MAGIC_LOGIN_TTL_MS = 15 * 60 * 1000;
const MF_DEVICE_OTP_TTL_MS = 10 * 60 * 1000;
const MF_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function mfDefaultSecurity() {
  return { magic: {}, pending: {}, sessions: {}, trusted: {} };
}

function mfLoadSecurity() {
  try {
    const raw = localStorage.getItem(MF_SECURITY_KEY);
    if (!raw) return mfDefaultSecurity();
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return mfDefaultSecurity();
    return {
      magic: o.magic && typeof o.magic === 'object' ? o.magic : {},
      pending: o.pending && typeof o.pending === 'object' ? o.pending : {},
      sessions: o.sessions && typeof o.sessions === 'object' ? o.sessions : {},
      trusted: o.trusted && typeof o.trusted === 'object' ? o.trusted : {},
    };
  } catch (e) {
    return mfDefaultSecurity();
  }
}

function mfSaveSecurity(sec) {
  try {
    localStorage.setItem(MF_SECURITY_KEY, JSON.stringify(sec));
  } catch (e) { /* ignore */ }
}

function mfPruneSecurity(sec) {
  const now = Date.now();
  Object.keys(sec.magic).forEach(k => {
    const m = sec.magic[k];
    if (m && !m.used && m.exp < now) delete sec.magic[k];
  });
  Object.keys(sec.pending).forEach(k => {
    const p = sec.pending[k];
    if (p && p.exp < now) delete sec.pending[k];
  });
  Object.keys(sec.sessions).forEach(k => {
    const s = sec.sessions[k];
    if (s && s.exp < now) delete sec.sessions[k];
  });
}

function mfGenTokenSecure() {
  if (typeof mfGenToken === 'function') return mfGenToken();
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

function mfGenOtp6() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

function mfGenPendingId() {
  return mfGenTokenSecure().slice(0, 24);
}

function mfGetOrCreateBrowserDeviceId() {
  try {
    let id = localStorage.getItem(MF_BROWSER_DEVICE_KEY);
    if (id && typeof id === 'string' && id.length >= 16) return id;
    id = 'd_' + mfGenTokenSecure().slice(0, 40);
    localStorage.setItem(MF_BROWSER_DEVICE_KEY, id);
    return id;
  } catch (e) {
    return 'd_ephem_' + String(Date.now());
  }
}

function mfClientUa() {
  try {
    return String(navigator.userAgent || '').slice(0, 400);
  } catch (e) {
    return '';
  }
}

function mfDeviceFriendlyLabel(ua) {
  const u = (ua || '').toLowerCase();
  let browser = 'Browser';
  if (u.includes('edg/')) browser = 'Microsoft Edge';
  else if (u.includes('chrome') && !u.includes('chromium')) browser = 'Chrome';
  else if (u.includes('firefox')) browser = 'Firefox';
  else if (u.includes('safari') && !u.includes('chrome')) browser = 'Safari';
  let os = '';
  if (u.includes('windows')) os = 'Windows';
  else if (u.includes('mac os')) os = 'macOS';
  else if (u.includes('android')) os = 'Android';
  else if (u.includes('iphone') || u.includes('ipad')) os = 'iOS / iPadOS';
  return os ? `${browser} · ${os}` : browser;
}

function mfIsTrustedDevice(userId, deviceId) {
  if (!userId || !deviceId) return false;
  const sec = mfLoadSecurity();
  const t = sec.trusted[userId] && sec.trusted[userId][deviceId];
  return !!(t && t.trusted !== false);
}

function mfTrustDeviceRecord(userId, deviceId) {
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  if (!sec.trusted[userId]) sec.trusted[userId] = {};
  const now = new Date().toISOString();
  const prev = sec.trusted[userId][deviceId];
  sec.trusted[userId][deviceId] = {
    trusted: true,
    created_at: prev && prev.created_at ? prev.created_at : now,
    last_used: now,
    ua: mfClientUa(),
  };
  mfSaveSecurity(sec);
}

function mfUpdateDeviceLastUsed(userId, deviceId) {
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  const rec = sec.trusted[userId] && sec.trusted[userId][deviceId];
  if (!rec) return;
  rec.last_used = new Date().toISOString();
  mfSaveSecurity(sec);
}

/**
 * Öffentliche Geräteliste für „Meine Geräte“.
 * @returns {Array<{ deviceId: string, label: string, last_used: string, created_at: string, isCurrent: boolean }>}
 */
function mfListTrustedDevicesForUser(userId) {
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  const map = sec.trusted[userId] || {};
  const current = mfGetOrCreateBrowserDeviceId();
  return Object.keys(map)
    .filter(did => map[did] && map[did].trusted !== false)
    .map(deviceId => ({
      deviceId,
      label: mfDeviceFriendlyLabel(map[deviceId].ua),
      last_used: map[deviceId].last_used || map[deviceId].created_at || '–',
      created_at: map[deviceId].created_at || '–',
      isCurrent: deviceId === current,
    }))
    .sort((a, b) => String(b.last_used).localeCompare(String(a.last_used)));
}

function mfRemoveTrustedDevice(userId, deviceId) {
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  if (sec.trusted[userId] && sec.trusted[userId][deviceId]) {
    delete sec.trusted[userId][deviceId];
    if (!Object.keys(sec.trusted[userId]).length) delete sec.trusted[userId];
  }
  Object.keys(sec.sessions).forEach(tok => {
    const s = sec.sessions[tok];
    if (s && s.userId === userId && s.deviceId === deviceId) delete sec.sessions[tok];
  });
  mfSaveSecurity(sec);
}

function mfRevokeAllSessionsAndDevicesForUser(userId) {
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  Object.keys(sec.sessions).forEach(tok => {
    if (sec.sessions[tok] && sec.sessions[tok].userId === userId) delete sec.sessions[tok];
  });
  delete sec.trusted[userId];
  Object.keys(sec.pending).forEach(k => {
    const p = sec.pending[k];
    if (p && p.userId === userId) delete sec.pending[k];
  });
  mfSaveSecurity(sec);
}

function mfRegisterSessionToken(userId, deviceId) {
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  Object.keys(sec.sessions).forEach(tok => {
    const s = sec.sessions[tok];
    if (s && s.userId === userId && s.deviceId === deviceId) delete sec.sessions[tok];
  });
  const sessionToken = mfGenTokenSecure();
  sec.sessions[sessionToken] = {
    userId,
    deviceId,
    createdAt: new Date().toISOString(),
    exp: Date.now() + MF_SESSION_TTL_MS,
  };
  mfSaveSecurity(sec);
  return sessionToken;
}

function mfDeleteSessionToken(sessionToken) {
  if (!sessionToken) return;
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  if (sec.sessions[sessionToken]) {
    delete sec.sessions[sessionToken];
    mfSaveSecurity(sec);
  }
}

function mfSessionTokenIsValid(sessionToken, userId, deviceId) {
  if (!sessionToken || !userId || !deviceId) return false;
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  const s = sec.sessions[sessionToken];
  if (!s || s.userId !== userId || s.deviceId !== deviceId) return false;
  if (s.exp < Date.now()) {
    delete sec.sessions[sessionToken];
    mfSaveSecurity(sec);
    return false;
  }
  return true;
}

/**
 * Session lesen + serverseitigen Token prüfen (inkl. Legacy ohne sessionToken → abmelden).
 * @returns {{ userId: string, sessionToken?: string, deviceId?: string, exp: number } | null}
 */
function mfSessionReadValid() {
  try {
    const raw = localStorage.getItem('mf_session_v1');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.userId) return null;
    if (s.exp && Date.now() > s.exp) {
      localStorage.removeItem('mf_session_v1');
      return null;
    }
    if (!s.sessionToken || !s.deviceId) {
      localStorage.removeItem('mf_session_v1');
      return null;
    }
    if (!mfSessionTokenIsValid(s.sessionToken, s.userId, s.deviceId)) {
      localStorage.removeItem('mf_session_v1');
      return null;
    }
    mfUpdateDeviceLastUsed(s.userId, s.deviceId);
    return s;
  } catch (e) {
    return null;
  }
}

function mfSessionWrite(userId, sessionToken, deviceId) {
  const exp = Date.now() + MF_SESSION_TTL_MS;
  try {
    localStorage.setItem('mf_session_v1', JSON.stringify({ userId, sessionToken, deviceId, exp }));
  } catch (e) { /* ignore */ }
}

function mfSessionClearLocal() {
  try {
    localStorage.removeItem('mf_session_v1');
  } catch (e) { /* ignore */ }
}

/**
 * Nach erfolgreicher Anmeldung (Passwort, Magic, OTP, Einladung): Gerät vertrauen + neue Session.
 */
function mfEstablishUserSession(userId) {
  const deviceId = mfGetOrCreateBrowserDeviceId();
  mfTrustDeviceRecord(userId, deviceId);
  const sessionToken = mfRegisterSessionToken(userId, deviceId);
  mfSessionWrite(userId, sessionToken, deviceId);
}

function mfLogoutCurrentSession() {
  try {
    const raw = localStorage.getItem('mf_session_v1');
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.sessionToken) mfDeleteSessionToken(s.sessionToken);
    }
  } catch (e) { /* ignore */ }
  mfSessionClearLocal();
}

function mfLogoutAllDevicesForUser(userId) {
  mfRevokeAllSessionsAndDevicesForUser(userId);
  try {
    const raw = localStorage.getItem('mf_session_v1');
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.userId === userId) mfSessionClearLocal();
    }
  } catch (e) { /* ignore */ }
}

// ── Magic Login (15 Min, einmalig) ──────────────────────

function mfCreateMagicLoginToken(userId) {
  const u = typeof USERS !== 'undefined' ? USERS.find(x => x.id === userId) : null;
  if (!u) return null;
  if (!u.passwordHash || !u.passwordSalt) return null;
  if (typeof mfUserNeedsInviteFlow === 'function' && mfUserNeedsInviteFlow(u)) return null;
  if (u.kontoStatus === 'deaktiviert' || u.aktiv === false) return null;
  if (typeof mfUserKannSichAnmelden === 'function') {
    const gate = mfUserKannSichAnmelden(u);
    if (!gate.ok) return null;
  }

  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  Object.keys(sec.magic).forEach(k => {
    const m = sec.magic[k];
    if (m && m.userId === userId && !m.used) delete sec.magic[k];
  });
  const token = mfGenTokenSecure();
  sec.magic[token] = {
    userId,
    exp: Date.now() + MF_MAGIC_LOGIN_TTL_MS,
    used: false,
    deviceId: null,
  };
  mfSaveSecurity(sec);
  return token;
}

function mfPeekMagicLogin(token) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'invalid' };
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  const m = sec.magic[token];
  if (!m) return { ok: false, reason: 'invalid' };
  if (m.used) return { ok: false, reason: 'used' };
  if (m.exp < Date.now()) {
    delete sec.magic[token];
    mfSaveSecurity(sec);
    return { ok: false, reason: 'expired' };
  }
  const u = typeof USERS !== 'undefined' ? USERS.find(x => x.id === m.userId) : null;
  if (!u) return { ok: false, reason: 'invalid' };
  if (typeof isUserGesperrt === 'function' && isUserGesperrt(u)) return { ok: false, reason: 'deaktiviert' };
  if (u.aktiv === false || u.kontoStatus === 'deaktiviert') return { ok: false, reason: 'deaktiviert' };
  if (typeof mfUserKannSichAnmelden === 'function') {
    const gate = mfUserKannSichAnmelden(u);
    if (!gate.ok) return { ok: false, reason: gate.reason || 'invalid' };
  }
  if (!m.deviceId) {
    m.deviceId = mfGetOrCreateBrowserDeviceId();
    mfSaveSecurity(sec);
  }
  return { ok: true, userId: m.userId, user: u };
}

function mfConsumeMagicLogin(token) {
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  const m = sec.magic[token];
  if (!m || m.used || m.exp < Date.now()) return false;
  m.used = true;
  mfSaveSecurity(sec);
  return true;
}

function mfBuildMagicLoginUrl(token) {
  if (typeof mfBuildAppUrlWithQuery === 'function') {
    return mfBuildAppUrlWithQuery({ 'magic-login': token });
  }
  const base = window.location.href.split(/[?#]/)[0];
  return `${base}?magic-login=${encodeURIComponent(token)}`;
}

function mfSendDeviceOtpToUser(user, code, contextLine) {
  const line = contextLine || 'Neues Gerät – Bestätigungscode für MesseFlow';
  const body = `Guten Tag ${user.name},\n\n${line}:\n\n${code}\n\nDer Code ist nur wenige Minuten gültig. Wenn Sie das nicht waren, ignorieren Sie die Nachricht.\n`;
  if (typeof mfSimulateEmailOutbox === 'function') {
    mfSimulateEmailOutbox({
      to: user.email || '—',
      subject: 'MesseFlow – Sicherheitscode',
      body,
    });
  }
  const wa = `https://wa.me/?text=${encodeURIComponent(`MesseFlow – Sicherheitscode: ${code}\n\n${line}`)}`;
  return { waHref: wa, email: user.email };
}

/**
 * Magic-Link: bekanntes Gerät → sofort einloggen.
 * @returns {{ ok: true, user: object } | { ok: false, error: string }}
 */
function mfCompleteMagicLoginTrustedDevice(token) {
  const p = mfPeekMagicLogin(token);
  if (!p.ok) {
    const map = {
      invalid: 'Dieser Anmeldelink ist ungültig.',
      used: 'Dieser Link wurde bereits verwendet.',
      expired: 'Der Link ist abgelaufen (max. 15 Minuten). Bitte neuen Link anfordern.',
      deaktiviert: 'Dieses Konto ist deaktiviert.',
      not_found: 'Kein Konto gefunden.',
      wrong_password: 'Anmeldung nicht möglich.',
      einladung: 'Konto noch nicht freigeschaltet.',
      kein_passwort: 'Kein Passwort hinterlegt.',
      kein_modul: 'Kein Modul freigeschaltet.',
      gesperrt: 'Konto gesperrt.',
    };
    return { ok: false, error: map[p.reason] || 'Anmeldung nicht möglich.' };
  }
  const deviceId = mfGetOrCreateBrowserDeviceId();
  if (!mfIsTrustedDevice(p.userId, deviceId)) {
    return { ok: false, error: 'Intern: Gerät nicht vertrauenswürdig.' };
  }
  if (!mfConsumeMagicLogin(token)) {
    return { ok: false, error: 'Link konnte nicht verwendet werden.' };
  }
  mfEstablishUserSession(p.userId);
  if (typeof mfAudit === 'function') mfAudit({ action: 'login', actorUserId: p.userId, meta: { via: 'magic_link' } });
  return { ok: true, user: p.user };
}

/**
 * Unbekanntes Gerät: OTP starten (Magic-Link bleibt unverbraucht bis OTP ok).
 * @returns {{ ok: true, pendingId: string, userName: string, waHref?: string, hasEmail: boolean } | { ok: false, error: string }}
 */
function mfMagicLoginStartOtp(token) {
  const p = mfPeekMagicLogin(token);
  if (!p.ok) {
    return { ok: false, error: 'Link ungültig oder abgelaufen.' };
  }
  const deviceId = mfGetOrCreateBrowserDeviceId();
  if (mfIsTrustedDevice(p.userId, deviceId)) {
    return { ok: false, error: 'Gerät ist bereits vertrauenswürdig – bitte Seite neu laden.' };
  }
  const code = mfGenOtp6();
  const pendingId = mfGenPendingId();
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  sec.pending[pendingId] = {
    type: 'magic',
    userId: p.userId,
    deviceId,
    code,
    exp: Date.now() + MF_DEVICE_OTP_TTL_MS,
    magicToken: token,
  };
  mfSaveSecurity(sec);
  const ch = mfSendDeviceOtpToUser(
    p.user,
    code,
    'Sie melden sich über einen Magic-Link von einem neuen Gerät an'
  );
  return {
    ok: true,
    pendingId,
    userName: p.user.name,
    waHref: ch.waHref,
    hasEmail: !!(p.user.email && String(p.user.email).trim()),
  };
}

/**
 * Passwort korrekt, Gerät neu: OTP starten.
 */
function mfPasswordLoginStartOtp(userId) {
  const u = typeof USERS !== 'undefined' ? USERS.find(x => x.id === userId) : null;
  if (!u) return { ok: false, error: 'Benutzer nicht gefunden.' };
  const deviceId = mfGetOrCreateBrowserDeviceId();
  const code = mfGenOtp6();
  const pendingId = mfGenPendingId();
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  sec.pending[pendingId] = {
    type: 'password',
    userId,
    deviceId,
    code,
    exp: Date.now() + MF_DEVICE_OTP_TTL_MS,
    magicToken: null,
  };
  mfSaveSecurity(sec);
  const ch = mfSendDeviceOtpToUser(
    u,
    code,
    'Anmeldung von einem neuen Gerät'
  );
  return {
    ok: true,
    pendingId,
    userName: u.name,
    waHref: ch.waHref,
    hasEmail: !!(u.email && String(u.email).trim()),
  };
}

/**
 * OTP nach Magic-Link oder Passwort-Login bestätigen.
 */
function mfSubmitDeviceOtp(pendingId, codeIn) {
  const sec = mfLoadSecurity();
  mfPruneSecurity(sec);
  const rec = sec.pending[pendingId];
  if (!rec) return { ok: false, error: 'Code abgelaufen oder ungültig. Bitte erneut anmelden.' };
  if (rec.exp < Date.now()) {
    delete sec.pending[pendingId];
    mfSaveSecurity(sec);
    return { ok: false, error: 'Code abgelaufen. Bitte erneut anmelden.' };
  }
  const code = String(codeIn || '').replace(/\D/g, '').slice(0, 6);
  if (code !== rec.code) return { ok: false, error: 'Code ist falsch.' };

  if (rec.type === 'magic') {
    const p = mfPeekMagicLogin(rec.magicToken);
    if (!p.ok) {
      delete sec.pending[pendingId];
      mfSaveSecurity(sec);
      return { ok: false, error: 'Magic-Link nicht mehr gültig. Bitte neuen Link anfordern.' };
    }
    if (!mfConsumeMagicLogin(rec.magicToken)) {
      delete sec.pending[pendingId];
      mfSaveSecurity(sec);
      return { ok: false, error: 'Link konnte nicht abgeschlossen werden.' };
    }
  }

  delete sec.pending[pendingId];
  mfSaveSecurity(sec);

  const u = typeof USERS !== 'undefined' ? USERS.find(x => x.id === rec.userId) : null;
  if (!u) return { ok: false, error: 'Benutzer nicht gefunden.' };

  mfEstablishUserSession(rec.userId);
  if (typeof mfAudit === 'function') {
    mfAudit({
      action: 'login',
      actorUserId: rec.userId,
      meta: { via: rec.type === 'magic' ? 'magic_link_otp' : 'password_otp' },
    });
  }
  return { ok: true, user: u };
}

/**
 * Für Passwort-Login: braucht dieses Gerät eine OTP-Stufe?
 */
function mfPasswordLoginNeedsDeviceOtp(userId) {
  if (window.MF_SKIP_DEVICE_OTP === true) return false;
  const deviceId = mfGetOrCreateBrowserDeviceId();
  return !mfIsTrustedDevice(userId, deviceId);
}

function mfOpenMyDevicesModal() {
  const sess = mfSessionReadValid();
  if (!sess || !sess.userId) {
    if (typeof toast === 'function') toast('Hinweis', 'Bitte zuerst anmelden.', 'ty');
    return;
  }
  const uid = sess.userId;
  const rows = mfListTrustedDevicesForUser(uid);
  const rowHtml = rows.length
    ? rows.map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);">
        <div>
          <div style="font-weight:600;font-size:13px;">${r.isCurrent ? 'Dieses Gerät · ' : ''}${mfHtmlEscapeDevices(r.label)}</div>
          <div style="font-size:11px;color:var(--muted);">Zuletzt: ${mfHtmlEscapeDevices(r.last_used)}</div>
        </div>
        ${r.isCurrent ? '<span style="font-size:11px;color:var(--muted);">Aktiv</span>' : `<button type="button" class="btn ghost sm" data-mf-dev="${encodeURIComponent(r.deviceId)}" onclick="mfUiRemoveOneDevice(decodeURIComponent(this.getAttribute('data-mf-dev')))">Entfernen</button>`}
      </div>`).join('')
    : '<p style="font-size:13px;color:var(--muted);">Keine gespeicherten Geräte.</p>';

  const html = `
    <p style="font-size:13px;color:var(--muted);margin:0 0 12px;line-height:1.5;">
      Hier sehen Sie Geräte, an denen Sie sich ohne erneute Bestätigung anmelden können. Entfernen Sie Einträge, die Sie nicht mehr nutzen.
    </p>
    <div style="max-height:280px;overflow:auto;margin-bottom:14px;">${rowHtml}</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button type="button" class="btn primary sm" onclick="mfUiLogoutAllDevices()">Auf allen Geräten abmelden</button>
      <button type="button" class="btn ghost sm" onclick="closeModal()">Schließen</button>
    </div>`;

  if (typeof openModal === 'function') openModal('Meine Geräte', html, false);
}

function mfHtmlEscapeDevices(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function mfUiRemoveOneDevice(deviceId) {
  const sess = mfSessionReadValid();
  if (!sess || !sess.userId) return;
  mfRemoveTrustedDevice(sess.userId, deviceId);
  if (deviceId === sess.deviceId) {
    if (typeof mfAudit === 'function') mfAudit({ action: 'logout' });
    mfLogoutCurrentSession();
    closeModal();
    window.location.href = window.location.pathname;
    return;
  }
  if (typeof toast === 'function') toast('Gespeichert', 'Gerät entfernt.', 'tg');
  closeModal();
  mfOpenMyDevicesModal();
}

function mfUiLogoutAllDevices() {
  const sess = mfSessionReadValid();
  if (!sess || !sess.userId) return;
  if (!confirm('Wirklich auf allen Geräten abmelden? Sie müssen sich danach überall neu anmelden.')) return;
  if (typeof mfAudit === 'function') mfAudit({ action: 'logout_all_devices', actorUserId: sess.userId });
  mfLogoutAllDevicesForUser(sess.userId);
  closeModal();
  window.location.href = window.location.pathname;
}

window.mfGetOrCreateBrowserDeviceId = mfGetOrCreateBrowserDeviceId;
window.mfIsTrustedDevice = mfIsTrustedDevice;
window.mfEstablishUserSession = mfEstablishUserSession;
window.mfSessionReadValid = mfSessionReadValid;
window.mfLogoutCurrentSession = mfLogoutCurrentSession;
window.mfLogoutAllDevicesForUser = mfLogoutAllDevicesForUser;
window.mfCreateMagicLoginToken = mfCreateMagicLoginToken;
window.mfPeekMagicLogin = mfPeekMagicLogin;
window.mfCompleteMagicLoginTrustedDevice = mfCompleteMagicLoginTrustedDevice;
window.mfMagicLoginStartOtp = mfMagicLoginStartOtp;
window.mfPasswordLoginStartOtp = mfPasswordLoginStartOtp;
window.mfSubmitDeviceOtp = mfSubmitDeviceOtp;
window.mfPasswordLoginNeedsDeviceOtp = mfPasswordLoginNeedsDeviceOtp;
window.mfBuildMagicLoginUrl = mfBuildMagicLoginUrl;
window.mfListTrustedDevicesForUser = mfListTrustedDevicesForUser;
window.mfRemoveTrustedDevice = mfRemoveTrustedDevice;
window.mfOpenMyDevicesModal = mfOpenMyDevicesModal;
window.mfUiRemoveOneDevice = mfUiRemoveOneDevice;
window.mfUiLogoutAllDevices = mfUiLogoutAllDevices;
window.MF_MAGIC_LOGIN_TTL_MS = MF_MAGIC_LOGIN_TTL_MS;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/logic/auth.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ═══════════════════════════════════════════════════════
// LOGIN, SESSION, PASSWORT-RESET (Demo: alles clientseitig)
// ═══════════════════════════════════════════════════════

const MF_SESSION_KEY = 'mf_session_v1';
const MF_PWD_RESET_KEY = 'mf_pwd_reset_v1';

function mfPwdResetTtlMs() {
  try {
    const h = Number(window.MF_PWD_RESET_TTL_HOURS || localStorage.getItem('mf_pwd_reset_ttl_hours'));
    if (Number.isFinite(h) && h >= 1 && h <= 168) return h * 3600000;
  } catch (e) { /* ignore */ }
  return 24 * 3600000;
}

function mfLoadPwdResetStore() {
  try {
    const raw = localStorage.getItem(MF_PWD_RESET_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}

function mfSavePwdResetStore(store) {
  try {
    localStorage.setItem(MF_PWD_RESET_KEY, JSON.stringify(store));
  } catch (e) { /* ignore */ }
}

function mfGetSession() {
  if (typeof mfSessionReadValid === 'function') return mfSessionReadValid();
  return null;
}

/** @deprecated Nutzer bevorzugt mfEstablishUserSession – behält Kompatibilität für ältere Aufrufe. */
function mfSetSession(userId) {
  if (typeof mfEstablishUserSession === 'function') mfEstablishUserSession(userId);
}

function mfClearSession() {
  if (typeof mfLogoutCurrentSession === 'function') mfLogoutCurrentSession();
  else {
    try {
      localStorage.removeItem(MF_SESSION_KEY);
    } catch (e) { /* ignore */ }
  }
}

function mfLogout() {
  if (typeof mfAudit === 'function') mfAudit({ action: 'logout' });
  mfClearSession();
  window.location.href = window.location.pathname;
}

function mfFindUsersByEmail(email) {
  const e = (email || '').trim().toLowerCase();
  if (!e) return [];
  return USERS.filter(u => (u.email || '').trim().toLowerCase() === e);
}

function mfFindUserForLogin(loginRaw) {
  const q = (loginRaw || '').trim();
  if (!q) return null;
  const low = q.toLowerCase();
  let u = USERS.find(x => x.id === q);
  if (u) return u;
  u = USERS.find(x => (x.email || '').trim().toLowerCase() === low);
  if (u) return u;
  return USERS.find(x => (x.name || '').trim().toLowerCase() === low) || null;
}

function mfUserKannSichAnmelden(u) {
  if (!u) return { ok: false, reason: 'not_found' };
  if (u.aktiv === false) return { ok: false, reason: 'deaktiviert' };
  if (typeof isUserGesperrt === 'function' && isUserGesperrt(u))
    return { ok: false, reason: 'gesperrt' };
  if (typeof userMayUseApp === 'function' && !userMayUseApp(u))
    return { ok: false, reason: 'einladung' };
  if (typeof userHasAnyModulePermission === 'function' && !userHasAnyModulePermission(u))
    return { ok: false, reason: 'kein_modul' };
  if (!u.passwordHash || !u.passwordSalt) return { ok: false, reason: 'kein_passwort' };
  return { ok: true };
}

function mfLoginRequiresSecureContext() {
  if (window.MF_SKIP_DEVICE_OTP === true) return false;
  try {
    return !window.crypto || !window.crypto.subtle;
  } catch (e) {
    return true;
  }
}

function mfLoginErrorDeutsch(reason) {
  const map = {
    not_found: 'Kein Konto gefunden. Prüfen Sie E-Mail oder Benutzer-ID und versuchen Sie es erneut.',
    wrong_password: 'Passwort ist falsch.',
    unsicherer_kontext:
      'Anmeldung ist nur über eine sichere Verbindung möglich. Bitte die Seite mit https://… aufrufen (nicht http://).',
    deaktiviert: 'Dieses Konto ist deaktiviert. Bitte die Administration kontaktieren.',
    gesperrt: 'Dieses Konto ist gesperrt. Bitte die Administration kontaktieren.',
    einladung: 'Zugang noch nicht freigeschaltet. Bitte den Einladungslink nutzen und ein Passwort setzen.',
    kein_passwort: 'Für dieses Konto wurde noch kein Passwort gesetzt. Bitte Einladungslink abwarten oder neue Einladung anfordern.',
    kein_modul: 'Für dieses Konto ist kein Modul freigeschaltet. Bitte die Administration kontaktieren.',
  };
  return map[reason] || 'Anmeldung nicht möglich.';
}

async function mfTryLogin(login, password) {
  if (mfLoginRequiresSecureContext()) {
    return { ok: false, error: mfLoginErrorDeutsch('unsicherer_kontext') };
  }
  const u = mfFindUserForLogin(login);
  const gate = mfUserKannSichAnmelden(u);
  if (!gate.ok) return { ok: false, error: mfLoginErrorDeutsch(gate.reason) };
  const match = await mfVerifyPassword(password, u.passwordSalt, u.passwordHash);
  if (!match) return { ok: false, error: mfLoginErrorDeutsch('wrong_password') };

  if (typeof mfPasswordLoginNeedsDeviceOtp === 'function' && mfPasswordLoginNeedsDeviceOtp(u.id)) {
    const otp = typeof mfPasswordLoginStartOtp === 'function' ? mfPasswordLoginStartOtp(u.id) : null;
    if (!otp || !otp.ok) {
      return { ok: false, error: (otp && otp.error) || 'Bestätigungscode konnte nicht gesendet werden.' };
    }
    return {
      ok: false,
      needOtp: true,
      pendingId: otp.pendingId,
      otpUserName: otp.userName,
      otpWaHref: otp.waHref,
      otpHasEmail: otp.hasEmail,
    };
  }

  if (typeof mfEstablishUserSession === 'function') mfEstablishUserSession(u.id);
  else mfSetSession(u.id);
  if (typeof mfAudit === 'function') mfAudit({ action: 'login', actorUserId: u.id, meta: { via: 'password' } });
  return { ok: true, user: u };
}

/**
 * Passwort zurücksetzen anstoßen (Demo: Link wird nicht wirklich per SMTP versendet).
 * @returns {{ ok: boolean, error?: string, token?: string, url?: string, email?: string }}
 */
function mfRequestPasswordReset(email) {
  const list = mfFindUsersByEmail(email);
  if (!list.length)
    return { ok: false, error: 'Wenn diese E-Mail bei uns hinterlegt ist, erhalten Sie gleich einen Hinweis zum Zurücksetzen.' };
  const u = list[0];
  const gate = mfUserKannSichAnmelden(u);
  if (!gate.ok) {
    if (gate.reason === 'einladung')
      return { ok: false, error: 'Dieses Konto wurde noch nicht aktiviert. Bitte den Einladungslink nutzen und zuerst ein Passwort setzen.' };
    if (gate.reason === 'deaktiviert' || gate.reason === 'gesperrt')
      return { ok: false, error: 'Für dieses Konto kann kein Zurücksetzen angefordert werden. Bitte die Administration kontaktieren.' };
    if (gate.reason === 'kein_passwort')
      return { ok: false, error: 'Dieses Konto hat noch kein Passwort – nutzen Sie bitte den Einladungslink aus der Einladung.' };
    return { ok: false, error: 'Zurücksetzen ist für dieses Konto nicht möglich.' };
  }

  const store = mfLoadPwdResetStore();
  Object.keys(store).forEach(k => {
    const r = store[k];
    if (r && r.userId === u.id && !r.used) delete store[k];
  });
  const token = mfGenToken();
  store[token] = { userId: u.id, exp: Date.now() + mfPwdResetTtlMs(), used: false };
  mfSavePwdResetStore(store);

  const url = typeof mfBuildAppUrlWithQuery === 'function'
    ? mfBuildAppUrlWithQuery({ 'passwort-reset': token })
    : `${window.location.href.split(/[?#]/)[0]}?passwort-reset=${encodeURIComponent(token)}`;

  mfSimulateEmailOutbox({
    to: u.email,
    subject: 'MesseFlow – Passwort zurücksetzen',
    body: `Guten Tag ${u.name},\n\nbitte setzen Sie Ihr Passwort über diesen Link (nur begrenzt gültig):\n\n${url}\n\nWenn Sie diese E-Mail nicht angefordert haben, ignorieren Sie sie.\n`,
  });

  return { ok: true, token, url, email: u.email };
}

function mfValidatePasswordResetToken(token) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'invalid' };
  const store = mfLoadPwdResetStore();
  const rec = store[token];
  if (!rec) return { ok: false, reason: 'invalid' };
  if (rec.used) return { ok: false, reason: 'used' };
  if (rec.exp < Date.now()) {
    delete store[token];
    mfSavePwdResetStore(store);
    return { ok: false, reason: 'expired' };
  }
  const u = USERS.find(x => x.id === rec.userId);
  if (!u) return { ok: false, reason: 'invalid' };
  if (typeof isUserGesperrt === 'function' && isUserGesperrt(u)) return { ok: false, reason: 'gesperrt' };
  if (u.aktiv === false || u.kontoStatus === 'deaktiviert') return { ok: false, reason: 'deaktiviert' };
  return { ok: true, userId: rec.userId };
}

function mfConsumePasswordResetToken(token) {
  const store = mfLoadPwdResetStore();
  const rec = store[token];
  if (!rec) return false;
  rec.used = true;
  mfSavePwdResetStore(store);
  return true;
}

async function mfCompletePasswordReset(token, pass1, pass2) {
  const v = mfValidatePasswordResetToken(token);
  if (!v.ok) {
    const map = {
      invalid: 'Der Link ist ungültig.',
      used: 'Dieser Link wurde bereits verwendet.',
      expired: 'Der Link ist abgelaufen. Bitte „Passwort vergessen“ erneut nutzen.',
      deaktiviert: 'Dieses Konto ist deaktiviert.',
      gesperrt: 'Dieses Konto ist gesperrt.',
    };
    return { ok: false, error: map[v.reason] || 'Zurücksetzen nicht möglich.' };
  }
  const u = USERS.find(x => x.id === v.userId);
  if (!u) return { ok: false, error: 'Benutzer nicht gefunden.' };
  const p1 = pass1 || '';
  const p2 = pass2 || '';
  if (p1.length < 8) return { ok: false, error: 'Passwort mindestens 8 Zeichen.' };
  if (p1 !== p2) return { ok: false, error: 'Passwörter stimmen nicht überein.' };
  try {
    const salt = mfGenerateSaltB64();
    const hash = await mfHashPassword(p1, salt);
    u.passwordSalt = salt;
    u.passwordHash = hash;
    if (u.kontoStatus === 'eingeladen' || u.kontoStatus === 'einladung_abgelaufen') u.kontoStatus = 'aktiv';
    mfConsumePasswordResetToken(token);
    if (typeof mfEstablishUserSession === 'function') mfEstablishUserSession(u.id);
    else mfSetSession(u.id);
    return { ok: true, user: u };
  } catch (e) {
    return { ok: false, error: 'Passwort konnte nicht gespeichert werden.' };
  }
}

function mfSimulateEmailOutbox(msg) {
  try {
    const row = { ts: new Date().toISOString(), ...msg };
    const raw = localStorage.getItem('mf_email_outbox_v1');
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return;
    arr.unshift(row);
    localStorage.setItem('mf_email_outbox_v1', JSON.stringify(arr.slice(0, 40)));
  } catch (e) { /* ignore */ }
}

window.mfGetSession = mfGetSession;
window.mfSetSession = mfSetSession;
window.mfClearSession = mfClearSession;
window.mfLogout = mfLogout;
window.mfFindUserForLogin = mfFindUserForLogin;
window.mfTryLogin = mfTryLogin;
window.mfLoginErrorDeutsch = mfLoginErrorDeutsch;
window.mfRequestPasswordReset = mfRequestPasswordReset;
window.mfValidatePasswordResetToken = mfValidatePasswordResetToken;
window.mfCompletePasswordReset = mfCompletePasswordReset;
window.mfSimulateEmailOutbox = mfSimulateEmailOutbox;
window.mfPwdResetTtlMs = mfPwdResetTtlMs;
window.mfUserKannSichAnmelden = mfUserKannSichAnmelden;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/logic/audit.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ═══════════════════════════════════════════════════════
// VERLAUF / AUDIT-LOG (lokal, optional localStorage)
// ═══════════════════════════════════════════════════════

const MF_AUDIT_STORAGE = 'mf_audit_events_v1';
const MF_AUDIT_MAX = 500;

function mfAuditInit() {
  if (!MesseFlowState.auditLog) MesseFlowState.auditLog = [];
  try {
    const raw = localStorage.getItem(MF_AUDIT_STORAGE);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) {
      MesseFlowState.auditLog = arr.concat(MesseFlowState.auditLog || []);
    }
  } catch (e) { /* ignore */ }
}

function mfAuditPersist() {
  try {
    if (!MesseFlowState.auditLog) return;
    const slice = MesseFlowState.auditLog.slice(0, MF_AUDIT_MAX);
    localStorage.setItem(MF_AUDIT_STORAGE, JSON.stringify(slice));
  } catch (e) { /* ignore */ }
}

/**
 * @param {{ action: string, projectId?: string, wallId?: string, meta?: object, actorUserId?: string }} row
 */
function mfAudit(row) {
  const u = row.actorUserId
    ? (typeof USERS !== 'undefined' ? USERS.find(x => x.id === row.actorUserId) : null)
    : (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
  const entry = {
    id: 'a' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    ts: new Date().toISOString(),
    tsDisplay: typeof nowStr === 'function' ? nowStr() : new Date().toLocaleString('de-DE'),
    userId: u?.id || null,
    userName: u?.name || 'System',
    action: row.action,
    projectId: row.projectId || null,
    wallId: row.wallId || null,
    meta: row.meta && typeof row.meta === 'object' ? { ...row.meta } : null,
  };
  if (!MesseFlowState.auditLog) MesseFlowState.auditLog = [];
  MesseFlowState.auditLog.unshift(entry);
  if (MesseFlowState.auditLog.length > MF_AUDIT_MAX) MesseFlowState.auditLog.length = MF_AUDIT_MAX;
  mfAuditPersist();
}

function mfAuditForProject(projectId) {
  const list = MesseFlowState.auditLog || [];
  return list.filter(e => e.projectId === projectId);
}

window.mfAuditInit = mfAuditInit;
window.mfAudit = mfAudit;
window.mfAuditForProject = mfAuditForProject;
window.mfAuditPersist = mfAuditPersist;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/logic/errors.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/logic/status.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATUS
// ═══════════════════════════════════════════════════════
// 1 Datei fehlt
// 2 Bestellmaß fehlt (wirklich kein Bestellmaß hinterlegt)
// 8 Nicht geprüft (Datei + Bestellmaß vorhanden, aber kein Dateimaß erkannt)
// 3 Maß OK (Dateimaß stimmt mit Bestellmaß überein → freigeben)
// 7 Prüfen / Warnung (Abweichung 5–20 mm)
// 6 Blockiert (Abweichung >20 mm, Font-Fehler, DPI zu niedrig)
// 4 Warten auf Freigabe
// 5 Druckfertig
// 9 An Druck gesendet (Datei-Workflow Caldera)
const ST_LABELS = {
  1:'Datei fehlt',
  2:'Bestellmaß fehlt',
  8:'Nicht geprüft',
  3:'✓ Maß OK',
  7:'⚡ Prüfen',
  6:'✖ Blockiert',
  4:'Warten auf Freigabe',
  5:'Druckfertig',
  9:'An Druck gesendet',
};
const ST_CLASS = {1:'st-1',2:'st-2',8:'st-8',3:'st-3',7:'st-7',6:'st-6',4:'st-4',5:'st-5',9:'st-9'};
const ST_DOT   = {1:'rot',2:'gelb',8:'gelb',3:'gruen',7:'gelb',6:'rot',4:'gelb',5:'gruen',9:'lila'};

// Ampel for overall project
function projAmpel(p){
  if(p.waende.every(w=>w.status===5)) return 'gruen';
  if(p.waende.some(w=>w.status===6))  return 'rot';
  if(p.waende.some(w=>w.status===1))  return 'rot';   // Datei fehlt = rot
  if(p.waende.some(w=>w.status===9))  return 'lila';
  return 'gelb'; // inkl. status 8 (nicht geprüft) = gelb
}

// Auto-status — single source of truth
// Strikte Trennung: Bestellmaß ≠ Dateimaß ≠ Prüfstatus
function recalc(w){
  const getF = window.getAktuelleDatei;
  const DW = window.DATEI_WORKFLOW;
  if (getF && DW && w.datei) {
    const f = getF(w);
    if (f && f.status) {
      const ns = typeof window.normalizeDateiWorkflowStatus === 'function'
        ? window.normalizeDateiWorkflowStatus(f.status)
        : f.status;
      if ([DW.CALDERA_GESENDET, DW.WIRD_GEDRUCKT, DW.GELIEFERT].includes(ns)) {
        w.status = ns === DW.CALDERA_GESENDET ? 9 : 5;
        return;
      }
    }
  }

  // 1. Keine Datei → Datei fehlt
  if(!w.datei){ w.status=1; return; }

  // 2. Kein Bestellmaß hinterlegt → Bestellmaß fehlt
  const hasBestellmass = !!(w.bestellmass && w.bestellmass.trim());
  if(!hasBestellmass){ w.status=2; return; }

  const hasDateiMass = !!(w.dateiMass && w.dateiMass.trim());

  // 3. Maß-Abweichungscheck (nur wenn Dateimaß vom Backend erkannt)
  if(hasDateiMass){
    const vgl = vergleicheMasse(w.bestellmass, w.dateiMass);
    if(vgl.stufe==='abweichung' && !w.abweichungOk){ w.status=6; return; }
    if(vgl.stufe==='warnung'    && !w.abweichungOk){ w.status=7; return; }
  }

  // 4. DPI-Prüfung
  if(w.dpiInfo){
    if(w.dpiInfo.stufe === 'blockiert'){ w.status=6; return; }
    if(w.dpiInfo.stufe === 'warnung'  ){ w.status=7; return; }
  }

  // 5. Font-Prüfung
  if(w.fontInfo && w.fontInfo.status === 'blockiert'){ w.status=6; return; }
  if(w.fontInfo && w.fontInfo.status === 'warnung'  ){ w.status=7; return; }

  // 6. Kein Dateimaß erkannt → Nicht geprüft
  //    (Datei + Bestellmaß vorhanden, aber Backend hat kein Maß geliefert)
  if(!hasDateiMass){ w.status=8; return; }

  // 7. Maß OK → Norbert gibt frei
  if(!w.masseOk){ w.status=3; return; }
  if(w.status<4){ w.status=4; return; }
  // 4→5 nur durch Melanie
}

// Prüf-Anzeige (Karte + Upload-Modal): „Datei OK“ nur bei bestandenen Pflichtchecks
function effektivePruefSlot(w, vgl) {
  if (vgl && (vgl.stufe === 'abweichung' || vgl.stufe === 'unlesbar')) return 'fehler';
  if (w.status === 6) return 'fehler';

  const pr = w.pruefErgebnis;
  if (!pr) {
    if (w.status === 7) return 'warnung';
    return 'none';
  }

  // DPI-Zeilen ignorieren — Server kann Vektor/Raster nicht zuverlässig
  // unterscheiden; DPI-Warnung ist nur informativ, blockiert Workflow nicht
  const zeilen = (pr.pruefung || []).filter(z => {
    const t = String(z.titel || '').toLowerCase();
    return !t.includes('dpi') && !t.includes('auflösung');
  });
  const anyFehler = zeilen.some(z => {
    const s = String(z.status || '').toLowerCase();
    return s === 'fehler' || s === 'error';
  });
  const anyWarn = zeilen.some(z => {
    const s = String(z.status || '').toLowerCase();
    return s === 'warnung' || s === 'warning';
  });

  if (anyFehler) return 'fehler';

  if (w.status === 7) return 'warnung';
  if (vgl && vgl.stufe === 'warnung') return 'warnung';
  if (anyWarn) return 'warnung';

  // Wenn keine nicht-DPI Fehler/Warnungen → OK
  // (Server-Status ignorieren da DPI den Gesamt-Status verfälscht haben kann)
  if (zeilen.length > 0) return 'ok';

  // Keine pruefung-Zeilen → Fallback auf Server-Status
  const ps = String(pr.status || '').toLowerCase();
  if (ps === 'ok') return 'ok';
  if (ps === 'warnung' || ps === 'warning') return 'warnung';
  return 'none';
}

window.ST_LABELS = ST_LABELS;
window.ST_CLASS = ST_CLASS;
window.ST_DOT = ST_DOT;
window.projAmpel = projAmpel;
window.recalc = recalc;
window.effektivePruefSlot = effektivePruefSlot;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/logic/freigabe.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── PRODUKTIONSPLAN ────────────────────────────────────
// Standard-Workflow nach vollständiger Freigabe aller Wände
const PROD_STUFEN = [
  { id:'druck',    label:'Druck',    icon:'🖨',  dauer:2, rolle:'Produktion' },
  { id:'laminat',  label:'Laminat',  icon:'🧴',  dauer:1, rolle:'Produktion' },
  { id:'plot',     label:'Plot',     icon:'✂️',  dauer:1, rolle:'Grafik'     },
  { id:'montage',  label:'Montage',  icon:'🔧',  dauer:1, rolle:'Norbert'    },
  { id:'abnahme',  label:'Abnahme',  icon:'✅',  dauer:1, rolle:'Melanie'    },
];

// Wird nach jeder Status-Änderung einer Wand aufgerufen.
// Wenn alle INTERN-Wände druckbereit (status >= 3, kein 6) → Auto-Freigabe.
function checkAutoFreigabe(p){
  if(p.freigegeben) return; // bereits freigegeben
  const intern = p.waende;
  if(!intern.length) return;
  const alleOk = intern.every(w => w.status >= 3 && w.status !== 6 && w.status !== 8);
  if(!alleOk) return;

  // ✓ Alle Wände druckbereit → Auftrag freigeben
  p.freigegeben = true;
  p.freigabeDatum = new Date().toLocaleDateString('de-DE');

  // Produktionsplan erzeugen (falls noch keiner vorhanden)
  if(!p.produktionsplan){
    const heute = new Date();
    let offset = 0;
    p.produktionsplan = PROD_STUFEN.map(s => {
      const start = new Date(heute); start.setDate(start.getDate() + offset);
      const end   = new Date(start); end.setDate(end.getDate() + s.dauer);
      offset += s.dauer;
      return {
        id:       s.id,
        label:    s.label,
        icon:     s.icon,
        rolle:    s.rolle,
        dauer:    s.dauer,
        start:    start.toLocaleDateString('de-DE'),
        end:      end.toLocaleDateString('de-DE'),
        erledigt: false,
      };
    });
  }
}

window.PROD_STUFEN = PROD_STUFEN;
window.checkAutoFreigabe = checkAutoFreigabe;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/logic/uebergabe.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ═══════════════════════════════════════════════════════
// MESSEFLOW → CC INTERN ÜBERGABE
// ═══════════════════════════════════════════════════════
//
// FLOW (ein durchgehender Auftrag, kein zweites System):
//
//   MesseFlow-Projekt
//     └─ Alle Wände an Caldera exportiert  ← TRIGGER
//          └─ ccinternAuftrag angelegt (am Projekt gespeichert)
//               └─ kalenderEintrag daraus erzeugt
//                    └─ Lieferung + Fotos direkt am Auftrag
//
// STATUS: intern (detailliert) vs. extern (einfach)
//   intern: Übergeben → In Bearbeitung → Druck läuft →
//           Fertig produziert → Verpackt → Unterwegs → Geliefert
//   extern: Zum Druck → Wird gedruckt → Unterwegs → Geliefert
//
// VERKNÜPFUNG (in project.ccinternAuftrag):
//   sourceSystem  = 'messeflow'
//   sourceId      = MesseFlow-Projekt-ID
//   id            = CC-JJJJ-NNNN
//
// FOTOS: direkt am Auftrag in lieferung.fotos[]
//   { ccinternOrderId, zeitpunkt, hochgeladenVon, typ, dateiname, datenUrl }
// ═══════════════════════════════════════════════════════

// ── Status-Definitionen ──────────────────────────────────────────────────────

/** Interner CC-Workflow: detaillierte Produktionsschritte */
const MF_CC_STATUS_INTERN = [
  'Übergeben',        // von MesseFlow übergeben
  'In Bearbeitung',   // cc_intern nimmt den Auftrag an
  'Druck läuft',      // in Caldera / am Drucker
  'Fertig produziert',// Druck abgeschlossen
  'Verpackt',         // bereit für Versand
  'Unterwegs',        // beim Kunden / Montage unterwegs
  'Geliefert',        // abgeschlossen
];

/**
 * Externer Status — was Agentur / Zwischenhändler / Produktion sehen.
 * Einfache, klare Begriffe — keine internen Details.
 */
const MF_CC_STATUS_EXTERN_MAP = {
  'Übergeben':         'Zum Druck',
  'In Bearbeitung':    'Wird gedruckt',
  'Druck läuft':       'Wird gedruckt',
  'Fertig produziert': 'Wird gedruckt',
  'Verpackt':          'Unterwegs',
  'Unterwegs':         'Unterwegs',
  'Geliefert':         'Geliefert',
};

/** Farb-Metadaten für interne Status-Badges */
const MF_CC_STATUS_META = {
  'Übergeben':         { cl: '#92400e', bg: '#fef3c7', bd: '#f59e0b' },
  'In Bearbeitung':    { cl: '#1e40af', bg: '#eff6ff', bd: '#93c5fd' },
  'Druck läuft':       { cl: '#6b21a8', bg: '#faf5ff', bd: '#d8b4fe' },
  'Fertig produziert': { cl: '#065f46', bg: '#ecfdf5', bd: '#6ee7b7' },
  'Verpackt':          { cl: '#1e40af', bg: '#eff6ff', bd: '#93c5fd' },
  'Unterwegs':         { cl: '#92400e', bg: '#fff7ed', bd: '#fdba74' },
  'Geliefert':         { cl: '#166534', bg: '#f0fdf4', bd: '#86efac' },
};

window.MF_CC_STATUS_INTERN      = MF_CC_STATUS_INTERN;
window.MF_CC_STATUS_EXTERN_MAP  = MF_CC_STATUS_EXTERN_MAP;
window.MF_CC_STATUS_META        = MF_CC_STATUS_META;

// ── ID-Generator ─────────────────────────────────────────────────────────────

/**
 * Erzeugt die nächste interne CC-Auftrags-ID: CC-JJJJ-NNNN
 * Ableitung aus vorhandenen IDs — kein separater Zähler im State nötig.
 */
function mfNextCcInternId() {
  const year = new Date().getFullYear();
  let max = 0;
  (MesseFlowState.projects || []).forEach(p => {
    const id = p.ccinternAuftrag?.id;
    if (id) {
      const m = id.match(/^CC-(\d{4})-(\d+)$/);
      if (m && parseInt(m[1]) === year) max = Math.max(max, parseInt(m[2]));
    }
  });
  return `CC-${year}-${String(max + 1).padStart(4, '0')}`;
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Externen Status aus internem ableiten.
 */
function mfCcExternStatus(internStatus) {
  return MF_CC_STATUS_EXTERN_MAP[internStatus] || internStatus;
}

/**
 * Nächster interner Status in der Kette (oder null wenn letzter).
 */
function mfCcNextStatus(aktuellerStatus) {
  const idx = MF_CC_STATUS_INTERN.indexOf(aktuellerStatus);
  if (idx < 0 || idx >= MF_CC_STATUS_INTERN.length - 1) return null;
  return MF_CC_STATUS_INTERN[idx + 1];
}

/**
 * Prüft ob ALLE exportierbaren Wände eines Projekts nach Caldera übertragen wurden.
 */
function mfAlleWaendeExportiert(projektId) {
  const p = getP(projektId);
  if (!p) return false;
  const exportierbar = p.waende.filter(w => w.status >= 3 && w.status !== 6 && w.datei);
  if (exportierbar.length === 0) return false;
  return exportierbar.every(w => w._calderaExportiert === true);
}

/**
 * Baut das Positionen-Array für den CC-Intern-Auftrag aus MesseFlow-Wänden.
 * Alle Wände mit Datei ODER Bestellmaß werden übernommen.
 */
function mfBuildCcInternPositionen(p) {
  return p.waende
    .filter(w => w.datei || w.bestellmass)
    .map(w => ({
      wandId:       w.id,
      bezeichnung:  w.name,
      bestellmass:  w.bestellmass   || '–',
      material:     w.material      || '–',
      menge:        w.menge         || 1,
      // Dateien — verknüpft, nicht kopiert
      datei:        w.datei         || null,
      dateien:      (w.dateien || []).map(d => ({
        id:      d.id,
        name:    d.name,
        version: d.version,
        status:  d.status,
      })),
      // Caldera-Dateiname (wie beim Export)
      calderaPfad:  (typeof calderaPdfName === 'function') ? calderaPdfName(p, w) : null,
      _exportiert:  w._calderaExportiert || false,
    }));
}

/**
 * Erzeugt den Kalender-Eintrag aus dem CC-Intern-Auftrag.
 * Reihenfolge: MesseFlow → CC-Intern-Auftrag → Kalender (NICHT direkt aus MesseFlow)
 */
function mfBuildKalenderEintrag(ccAuftrag) {
  return {
    id:           'kal_' + ccAuftrag.id,
    titel:        ccAuftrag.bezeichnung,
    kunde:        ccAuftrag.kunde,
    liefertermin: ccAuftrag.liefertermin,
    veranstaltung:ccAuftrag.veranstaltung || null,
    // Verknüpfung
    ccInternId:   ccAuftrag.id,
    sourceSystem: ccAuftrag.sourceSystem,
    sourceId:     ccAuftrag.sourceId,
    erstellt:     new Date().toISOString(),
  };
}

// ── Auftrag anlegen ──────────────────────────────────────────────────────────

/**
 * Legt den CC-Intern-Auftrag an einem MesseFlow-Projekt an.
 * Wird automatisch nach vollständigem Caldera-Export aufgerufen.
 * Gibt false zurück wenn bereits vorhanden.
 *
 * VOLLSTÄNDIGES SCHEMA:
 * {
 *   id, createdAt,
 *   sourceSystem, sourceId,          // Verknüpfung zu MesseFlow
 *   kunde, bezeichnung, liefertermin,
 *   prioritaet, auftragswert,
 *   veranstaltung, stand,
 *   positionen[],                    // Wände mit Maßen + Dateien
 *   statusIntern,                    // interner Workflow-Status
 *   statusExtern,                    // vereinfachter externer Status
 *   lieferung: {                     // Lieferstatus + Fotos
 *     geliefertAm, geliefertVon,
 *     fotos[]                        // Liefernachweis direkt am Auftrag
 *   },
 *   kalenderEintrag,                 // aus diesem Auftrag abgeleitet
 *   notizen
 * }
 */
function mfCreateCcInternAuftrag(projektId) {
  const p = getP(projektId);
  if (!p) return false;
  if (p.ccinternAuftrag) return false; // kein Doppel-Anlegen

  const id         = mfNextCcInternId();
  const positionen = mfBuildCcInternPositionen(p);
  const initStatus = 'Übergeben';

  const auftrag = {
    id,
    createdAt: new Date().toISOString(),

    // ── Verknüpfung zu MesseFlow ───────────────────────────────────────────
    sourceSystem: 'messeflow',
    sourceId:     p.id,

    // ── Kerndaten aus MesseFlow (übernommen, nicht dupliziert) ─────────────
    kunde:         p.auftragsInfo?.kunde        || p.kunde || '–',
    bezeichnung:   p.auftragsInfo?.projektname  || p.name  || '–',
    liefertermin:  p.deadline                   || null,
    prioritaet:    p.prioritaet                 || 'Normal',
    auftragswert:  p.finanz?.preis              || null,
    veranstaltung: p.auftragsInfo?.messe        || null,
    stand:         p.auftragsInfo?.stand        || null,

    // ── Positionen (Wände mit Maßen + Dateien) ────────────────────────────
    positionen,

    // ── Status (intern detailliert / extern vereinfacht) ──────────────────
    statusIntern: initStatus,
    statusExtern: mfCcExternStatus(initStatus),

    // ── Lieferung + Lieferfotos (direkt am Auftrag, kein separates Modul) ─
    lieferung: {
      geliefertAm:  null,
      geliefertVon: null,   // userId
      fotos:        [],     // Liefernachweis-Fotos (schema siehe mfCcAddLieferfoto)
      notiz:        null,
    },

    // ── Kalender wird AUS diesem Auftrag gespeist ─────────────────────────
    // Quelle: CC-Intern-Auftrag → Kalender (NICHT direkt MesseFlow → Kalender)
    kalenderEintrag: null,

    notizen: '',
  };

  // Kalender-Eintrag aus Auftrag ableiten
  auftrag.kalenderEintrag = mfBuildKalenderEintrag(auftrag);

  // Am Projekt speichern (verknüpft, nicht isoliert)
  p.ccinternAuftrag = auftrag;
  if (typeof mfSaveState === 'function') mfSaveState();

  // Audit-Log
  if (typeof mfAuditLog === 'function') {
    mfAuditLog(projektId, 'ccintern_uebergabe', { ccId: id, positionen: positionen.length });
  }

  return auftrag;
}

// ── Status-Steuerung ─────────────────────────────────────────────────────────

/**
 * Setzt den internen CC-Status und leitet daraus den externen ab.
 * Erlaubte Werte: MF_CC_STATUS_INTERN[]
 */
function mfUpdateCcInternStatus(projektId, neuerStatus) {
  const p = getP(projektId);
  if (!p?.ccinternAuftrag) return false;
  p.ccinternAuftrag.statusIntern = neuerStatus;
  p.ccinternAuftrag.statusExtern = mfCcExternStatus(neuerStatus);
  // Rückwärtskompatibilität
  p.ccinternAuftrag.status = neuerStatus;
  if (typeof mfSaveState === 'function') mfSaveState();
  if (typeof mfAuditLog === 'function') {
    mfAuditLog(projektId, 'ccintern_status', {
      statusIntern: neuerStatus,
      statusExtern: mfCcExternStatus(neuerStatus),
    });
  }
  return true;
}

// ── Lieferung ────────────────────────────────────────────────────────────────

/**
 * Fügt ein Lieferfoto direkt am CC-Intern-Auftrag hinzu.
 * Fotos landen NICHT separat — sie sind Teil des Auftrags.
 *
 * Foto-Schema:
 * {
 *   id:              'lf_' + timestamp,
 *   ccinternOrderId: 'CC-2026-0001',
 *   dateiname:       'foto.jpg',
 *   datenUrl:        'data:image/jpeg;base64,...',  // oder Server-URL
 *   zeitpunkt:       ISO-String,
 *   hochgeladenVon:  userId,
 *   typ:             'liefernachweis'
 * }
 */
function mfCcAddLieferfoto(projektId, fotoData) {
  const p = getP(projektId);
  if (!p?.ccinternAuftrag) return false;
  const foto = {
    id:              'lf_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    ccinternOrderId: p.ccinternAuftrag.id,
    dateiname:       fotoData.dateiname  || 'foto.jpg',
    datenUrl:        fotoData.datenUrl   || null,   // base64 oder Server-URL
    zeitpunkt:       new Date().toISOString(),
    hochgeladenVon:  fotoData.userId     || (typeof currentUserId !== 'undefined' ? currentUserId : null),
    typ:             'liefernachweis',
  };
  p.ccinternAuftrag.lieferung.fotos.push(foto);
  if (typeof mfSaveState === 'function') mfSaveState();
  return foto;
}

/**
 * Setzt den Auftrag auf "Geliefert" — mit optionalen Fotos.
 * Keine Unterschrift, kein Kommentar-Zwang.
 * Foto-Upload: optional, direkt am Auftrag gespeichert.
 */
function mfCcSetGeliefert(projektId, userId, optFotos) {
  const p = getP(projektId);
  if (!p?.ccinternAuftrag) return false;

  const a   = p.ccinternAuftrag;
  const now = new Date().toISOString();

  a.statusIntern           = 'Geliefert';
  a.statusExtern           = 'Geliefert';
  a.status                 = 'Geliefert';
  a.lieferung.geliefertAm  = now;
  a.lieferung.geliefertVon = userId || (typeof currentUserId !== 'undefined' ? currentUserId : null);

  // Fotos direkt anhängen (optionaler Array von Foto-Objekten)
  if (Array.isArray(optFotos) && optFotos.length > 0) {
    optFotos.forEach(f => mfCcAddLieferfoto(projektId, { ...f, userId }));
  }

  if (typeof mfSaveState === 'function') mfSaveState();
  if (typeof mfAuditLog === 'function') {
    mfAuditLog(projektId, 'ccintern_geliefert', {
      geliefertVon: a.lieferung.geliefertVon,
      fotos:        a.lieferung.fotos.length,
    });
  }

  return true;
}

// ── Lesefunktionen ───────────────────────────────────────────────────────────

function mfGetCcInternAuftrag(projektId) {
  return getP(projektId)?.ccinternAuftrag || null;
}

// ── Trigger ──────────────────────────────────────────────────────────────────

/**
 * TRIGGER — wird nach jedem erfolgreichen Caldera-Export aufgerufen.
 * Legt automatisch den CC-Intern-Auftrag an, sobald ALLE Wände exportiert sind.
 * Kein manueller Button nötig. Der Caldera-Export ist der einzige Trigger.
 */
function mfUebergabePruefen(projektId) {
  if (!mfAlleWaendeExportiert(projektId)) return;
  if (mfGetCcInternAuftrag(projektId)) return; // bereits vorhanden

  const auftrag = mfCreateCcInternAuftrag(projektId);
  if (!auftrag) return;

  if (typeof toast === 'function') {
    toast(
      '🏭 CC-Intern Auftrag angelegt',
      `${auftrag.id} — alle Wände übergeben. Produktion kann starten.`,
      'tg'
    );
  }
  if (typeof renderView === 'function') renderView();
}

// ── UI-Hilfsfunktion: Lieferfotos verarbeiten (Mobile + Desktop) ─────────────

/**
 * Verarbeitet File-Input-Events für Lieferfotos.
 * Auf Mobile: capture="environment" öffnet direkt die Kamera.
 * Fotos werden als base64 geladen und direkt am Auftrag gespeichert.
 */
function mfCcLieferFotoUpload(projektId, inputEl) {
  const files = inputEl?.files;
  if (!files || !files.length) return;

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      mfCcAddLieferfoto(projektId, {
        dateiname: file.name,
        datenUrl:  e.target.result,
      });
      if (typeof renderView === 'function') renderView();
    };
    reader.readAsDataURL(file);
  });
}

// ── Window-Exports ────────────────────────────────────────────────────────────
window.mfNextCcInternId       = mfNextCcInternId;
window.mfCcExternStatus       = mfCcExternStatus;
window.mfCcNextStatus         = mfCcNextStatus;
window.mfAlleWaendeExportiert = mfAlleWaendeExportiert;
window.mfCreateCcInternAuftrag= mfCreateCcInternAuftrag;
window.mfGetCcInternAuftrag   = mfGetCcInternAuftrag;
window.mfUpdateCcInternStatus = mfUpdateCcInternStatus;
window.mfCcAddLieferfoto      = mfCcAddLieferfoto;
window.mfCcSetGeliefert       = mfCcSetGeliefert;
window.mfCcLieferFotoUpload   = mfCcLieferFotoUpload;
window.mfUebergabePruefen     = mfUebergabePruefen;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/api/server.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── CALDERA BACKEND-KONFIGURATION ──────────────────────
// Standard-URL kommt aus js/config.js (MF_PRUEF_SERVER_URL / MF_APP_BASE_URL).
// Kann vom Nutzer überschrieben werden (localStorage mf_server_url).
function mfDefaultPruefServerUrl() {
  try {
    if (typeof window !== 'undefined' && window.MF_PRUEF_SERVER_URL) {
      return String(window.MF_PRUEF_SERVER_URL).replace(/\/+$/, '');
    }
    if (typeof window !== 'undefined' && window.MF_APP_BASE_URL) {
      return String(window.MF_APP_BASE_URL).replace(/\/+$/, '');
    }
  } catch (e) { /* ignore */ }
  return 'http://localhost:3030';
}

let CALDERA_SERVER = (()=>{
  try { return localStorage.getItem('mf_server_url') || mfDefaultPruefServerUrl(); }
  catch(e){ return mfDefaultPruefServerUrl(); }
})();
const CALDERA_BASE = '(Caldera / Hotfolder)'; // nur für Anzeige im Export — kein lokaler UNC-Pfad

function setServerUrl(url){
  url = (url||'').trim().replace(/\/+$/, ''); // trailing slash entfernen
  if(!url) return;
  CALDERA_SERVER = url;
  try { localStorage.setItem('mf_server_url', url); } catch(e){}
  checkServerStatus();
  toast('Server-URL gespeichert', url, 'tg');
}

function openServerConfig(){
  openModal('⚙ Server-Konfiguration', `
    <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;">
      <div style="font-weight:700;margin-bottom:6px;">📡 Wie starte ich den Prüf-Server?</div>
      <div style="font-size:12px;line-height:1.7;color:#1e40af;">
        1. <strong>Node.js installieren</strong> (falls nicht vorhanden): nodejs.org<br>
        2. Im Ordner <code style="background:#dbeafe;padding:1px 5px;border-radius:3px;">messeflow-server/</code> öffnen<br>
        3. Einmalig: <code style="background:#dbeafe;padding:1px 5px;border-radius:3px;">npm install</code><br>
        4. Starten: <code style="background:#dbeafe;padding:1px 5px;border-radius:3px;">node server.js</code><br>
        5. Server läuft dann auf <strong>Port 3030</strong>
      </div>
    </div>
    <div class="fg">
      <label>Server-URL</label>
      <input id="server-url-input" type="text"
        value="${CALDERA_SERVER}"
        placeholder="${mfDefaultPruefServerUrl().replace(/"/g, '&quot;')}"
        style="font-family:monospace;font-size:13px;">
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:12px;">
      Selber Rechner: <code>http://localhost:3030</code> &nbsp;·&nbsp;
      LAN: <code>http://192.168.2.XX:3030</code>
    </div>
    <div id="server-test-result" style="min-height:32px;margin-bottom:10px;"></div>
    <div class="ma">
      <button class="btn primary" onclick="testAndSaveServerUrl()">🔌 Verbinden & testen</button>
      <button class="btn ghost" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function testAndSaveServerUrl(){
  const input = document.getElementById('server-url-input');
  const url   = (input?.value||'').trim().replace(/\/+$/,'');
  if(!url){ toast('Fehler','Bitte URL eingeben'); return; }
  const el = document.getElementById('server-test-result');
  if(el) el.innerHTML = '<div style="font-size:12px;color:var(--muted);">🔌 Verbinde…</div>';
  try {
    const res  = await fetch(`${url}/status`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    if(el) el.innerHTML = `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:7px;padding:8px 12px;font-size:12px;color:var(--green);">
      ✓ Server erreichbar · ${data.server||'MesseFlow Server'} · Caldera: ${data.calderaErreichbar?'✓ erreichbar':'⚠ nicht erreichbar'}
    </div>`;
    setServerUrl(url);
    setTimeout(closeModal, 1200);
  } catch(err){
    if(el) el.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:7px;padding:8px 12px;font-size:12px;color:var(--red);">
      ✗ Nicht erreichbar: ${err.message}<br>
      <span style="color:var(--muted);">Server läuft? Port 3030 geöffnet? CORS aktiv?</span>
    </div>`;
  }
}

async function checkServerStatus(){
  const el = document.getElementById('server-status-indicator');
  if(!el) return;
  el.innerHTML = '<span style="color:var(--muted);font-size:11px;">⏳</span>';
  try {
    const res  = await fetch(`${CALDERA_SERVER}/status`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    el.innerHTML = `<span style="color:var(--green);font-size:11px;cursor:pointer;" onclick="openServerConfig()" title="Server erreichbar – klicken zum Konfigurieren">✓ Server online</span>`;
  } catch(e){
    el.innerHTML = `<span style="color:var(--red);font-size:11px;cursor:pointer;" onclick="openServerConfig()" title="Server nicht erreichbar – klicken zum Einrichten">⚠ Server offline – klicken</span>`;
  }
}

function calderaOrdnerName(p){
  const clean  = s => (s||'').replace(/[^a-zA-Z0-9äöüÄÖÜß\-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  const kunde  = clean(p.auftragsInfo?.kunde || p.kunde || 'Unbekannt');
  const projekt= clean(p.auftragsInfo?.projektname || '');
  return projekt ? `${kunde}_${projekt}` : kunde;
}

// Caldera-Dateiname (NUR für Export/Druckfreigabe — nicht beim Upload):
// Kunde_Projekt_Motiv_B{Breite}_H{Hoehe}mm.pdf
// Maße aus geprüftem Dateimaß (dateiMass) bevorzugt, sonst Bestellmaß.
// Originalname (w.datei) bleibt im System unverändert.
function calderaPdfName(p, w){
  const clean   = s => (s||'').replace(/[^a-zA-Z0-9äöüÄÖÜß\-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  const kunde   = clean(p.auftragsInfo?.kunde || p.kunde || 'Unbekannt');
  const projekt = clean(p.auftragsInfo?.projektname || '');
  const motiv   = clean(w.name);
  // Maße: geprüftes Dateimaß bevorzugen, dann Bestellmaß
  const massQuelle = (w.dateiMass && w.dateiMass.trim()) ? w.dateiMass : w.bestellmass;
  const parsed  = parseMass(massQuelle);
  const b = parsed ? Math.round(parsed.w) : 0;
  const h = parsed ? Math.round(parsed.h) : 0;
  const massPart = b && h ? `_B${b}_H${h}mm` : '';
  return projekt
    ? `${kunde}_${projekt}_${motiv}${massPart}.pdf`
    : `${kunde}_${motiv}${massPart}.pdf`;
}

// ── Einzelne Wand exportieren (simuliert Datei-Upload ans Backend) ──
async function exportWandZuCaldera(pid, wid){
  if (typeof getProjRechte === 'function' && typeof currentUserId !== 'undefined') {
    if (!getProjRechte(currentUserId, pid).exportieren) {
      toast('Keine Berechtigung', 'Export ist für Ihr Konto in diesem Projekt nicht freigeschaltet.', 'ty');
      return;
    }
  }
  const p = getP(pid), w = getW(p, wid);
  const btn = document.getElementById(`caldera-btn-${wid}`);
  const stat= document.getElementById(`caldera-stat-${wid}`);
  if(btn) { btn.disabled = true; btn.textContent = '⏳ Exportiere…'; }

  try {
    // 1. Ordner anlegen
    const ordnerRes = await fetch(`${CALDERA_SERVER}/export/ordner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kunde:   p.auftragsInfo?.kunde || p.kunde || '',
        projekt: p.auftragsInfo?.projektname || '',
      }),
    });
    if(!ordnerRes.ok) throw new Error('Ordner konnte nicht angelegt werden');

    // 2. Datei senden
    // Da wir im Browser keine echte Datei haben (nur einen Namen),
    // senden wir die Metadaten als JSON — der Server legt eine Platzhalter-Datei an.
    // In einer echten Integration: echte PDF-Binärdaten hier übergeben.
    const parsed = parseMass(w.bestellmass);
    const form   = new FormData();
    // Platzhalter-Blob mit Dateiname (echte PDF käme von Datei-Upload / PDF-Generator)
    const blob   = new Blob([`[Platzhalterdatei für ${w.name} – echte PDF einbinden]`], {type:'application/pdf'});
    form.append('datei',   blob, w.datei || calderaPdfName(p, w));
    form.append('kunde',   p.auftragsInfo?.kunde || p.kunde || '');
    form.append('projekt', p.auftragsInfo?.projektname || '');
    form.append('motiv',   w.name);
    form.append('breite',  parsed ? Math.round(parsed.w) : 0);
    form.append('hoehe',   parsed ? Math.round(parsed.h) : 0);

    const dateiRes = await fetch(`${CALDERA_SERVER}/export/datei`, {
      method: 'POST',
      body: form,
    });
    const result = await dateiRes.json();
    if(!result.ok) throw new Error(result.fehler || 'Export fehlgeschlagen');

    // Erfolg
    w._calderaExportiert = true;
    if(stat) stat.innerHTML = `<span style="color:var(--green);font-size:12px;font-weight:700;">✓ Exportiert: ${result.dateiName}</span>`;
    if(btn)  { btn.textContent = '✓ Erneut exportieren'; btn.disabled = false; }
    toast('📂 Caldera', `${w.name} exportiert → ${result.ordner}`, 'tg');

    // ── ÜBERGABE-CHECK ───────────────────────────────────────────────────────
    // Wenn alle exportierbaren Wände dieses Projekts jetzt übertragen sind,
    // wird automatisch der CC-Intern-Auftrag angelegt.
    // Trigger: letzter erfolgreicher Caldera-Export → mfUebergabePruefen()
    if (typeof mfUebergabePruefen === 'function') mfUebergabePruefen(pid);
    // ────────────────────────────────────────────────────────────────────────

    renderView();

  } catch(err){
    if(stat) stat.innerHTML = `<span style="color:var(--red);font-size:12px;">✗ Fehler: ${err.message}</span>`;
    if(btn)  { btn.textContent = '📂 Exportieren'; btn.disabled = false; }
    toast('Export fehlgeschlagen', err.message + ' – Server läuft? (port 3030)', 'ty');
  }
}

// ── Alle druckbereiten Wände auf einmal exportieren ──
async function exportAlleZuCaldera(pid){
  if (typeof getProjRechte === 'function' && typeof currentUserId !== 'undefined') {
    if (!getProjRechte(currentUserId, pid).exportieren) {
      toast('Keine Berechtigung', 'Export ist für Ihr Konto in diesem Projekt nicht freigeschaltet.', 'ty');
      return;
    }
  }
  const p = getP(pid);
  const bereit = p.waende.filter(w => w.status >= 3 && w.status !== 6 && w.datei);
  if(!bereit.length){ toast('Nichts zu exportieren','Keine druckbereiten Dateien'); return; }
  for(const w of bereit){
    await exportWandZuCaldera(pid, w.id);
  }
}

// ── Server-Status prüfen ──
async function checkCalderaServer(pid){
  const el = document.getElementById(`caldera-server-status-${pid}`);
  if(el) el.innerHTML = '<span style="color:var(--muted);font-size:12px;">🔄 Prüfe…</span>';
  try {
    const res  = await fetch(`${CALDERA_SERVER}/status`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if(el) el.innerHTML = data.calderaErreichbar
      ? `<span style="color:var(--green);font-size:12px;">✓ Server OK · Caldera-Pfad erreichbar</span>`
      : `<span style="color:var(--yellow);font-size:12px;">⚡ Server OK · Caldera-Pfad nicht erreichbar (${data.calderaPath})</span>`;
  } catch(e){
    if(el) el.innerHTML = `<span style="color:var(--red);font-size:12px;">✗ Server nicht erreichbar (${CALDERA_SERVER}) – <a href="README" target="_blank" style="color:var(--red);">Einrichtung</a></span>`;
  }
}

function buildCalderaExport(p){
  const ordner  = calderaOrdnerName(p);
  const pfadAnz = CALDERA_BASE + ordner + '\\';
  const bereit  = p.waende.filter(w => w.status >= 3 && w.status !== 6 && w.datei);
  const nochNicht= p.waende.filter(w => w.status === 6);

  const dateienHTML = bereit.map(w => {
    const pdfName = calderaPdfName(p, w);
    const exportiert = w._calderaExportiert;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;
        border:1px solid ${exportiert?'#86efac':'var(--line)'};border-radius:7px;flex-wrap:wrap;">
      <span style="font-size:16px;">📄</span>
      <div style="flex:1;min-width:120px;">
        <div style="font-size:13px;font-weight:600;">${pdfName}</div>
        <div style="font-size:11px;color:var(--muted);">Original: ${w.datei} · ${w.bestellmass||'–'}</div>
        <div id="caldera-stat-${w.id}">
          ${exportiert ? '<span style="color:var(--green);font-size:12px;font-weight:700;">✓ Bereits exportiert</span>' : ''}
        </div>
      </div>
      <button id="caldera-btn-${w.id}" class="btn sm ${exportiert?'ghost':'primary'}"
        onclick="exportWandZuCaldera('${p.id}','${w.id}')">
        ${exportiert ? '📂 Erneut exportieren' : '📂 Exportieren'}
      </button>
    </div>`;
  }).join('');

  return `
    <div style="background:#f0f7ff;border:1px solid #93c5fd;border-radius:var(--r);padding:16px;margin-top:4px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        <div style="font-size:15px;font-weight:700;">📂 Caldera Job-Ordner</div>
        <div id="caldera-server-status-${p.id}">
          <span style="font-size:12px;color:var(--muted);">Server-Status unbekannt</span>
        </div>
        <button class="btn sm ghost" style="margin-left:auto;" onclick="checkCalderaServer('${p.id}')">🔄 Status prüfen</button>
      </div>

      <div style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:9px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <code style="font-size:12px;font-family:monospace;color:var(--muted);flex:1;word-break:break-all;">${pfadAnz}</code>
        <span style="font-size:11px;background:var(--sb);color:var(--blue);padding:2px 8px;border-radius:999px;border:1px solid #93c5fd;">Auto-Export via Backend</span>
      </div>

      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:7px;">
        Dateien – ${bereit.length} druckbereit
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
        ${bereit.length
          ? dateienHTML
          : '<div style="color:var(--muted);font-size:13px;padding:6px 0;">Noch keine druckbereiten Dateien.</div>'}
      </div>

      ${nochNicht.length ? `
        <div style="font-size:12px;color:var(--red);margin-bottom:10px;">
          ✖ ${nochNicht.length} Wand${nochNicht.length!==1?'e':''} blockiert – nicht exportierbar
        </div>` : ''}

      ${bereit.length > 1 ? `
        <button class="btn primary sm" style="width:100%;" onclick="exportAlleZuCaldera('${p.id}')">
          📂 Alle ${bereit.length} Dateien automatisch exportieren
        </button>` : ''}

      <div style="margin-top:10px;font-size:11px;color:var(--muted);">
        Kein manuelles Kopieren – Backend schreibt direkt in den Netzwerkordner.
        Mitarbeiter öffnet Ordner in Caldera, prüft und startet Druck bewusst.
      </div>
    </div>`;
}

function copyCalderaPath(pid){
  const p = getP(pid);
  const pfad = CALDERA_BASE + calderaOrdnerName(p) + '\\';
  navigator.clipboard.writeText(pfad).then(()=>toast('Kopiert','Pfad in Zwischenablage','tg'));
}

window.CALDERA_SERVER = CALDERA_SERVER;
window.CALDERA_BASE = CALDERA_BASE;

window.setServerUrl = setServerUrl;
window.openServerConfig = openServerConfig;
window.testAndSaveServerUrl = testAndSaveServerUrl;
window.checkServerStatus = checkServerStatus;

window.calderaOrdnerName = calderaOrdnerName;
window.calderaPdfName = calderaPdfName;

window.exportWandZuCaldera = exportWandZuCaldera;
window.exportAlleZuCaldera = exportAlleZuCaldera;
window.checkCalderaServer = checkCalderaServer;

window.buildCalderaExport = buildCalderaExport;
window.copyCalderaPath = copyCalderaPath;
