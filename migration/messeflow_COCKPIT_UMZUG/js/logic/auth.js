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
