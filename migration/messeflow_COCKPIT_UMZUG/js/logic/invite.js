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
