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
