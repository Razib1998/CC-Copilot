function collectTeamUserIdsForDropdown() {
  const ids = new Set();
  const addTeam = (p) => {
    if (!p) return;
    (p.projektMitglieder || []).forEach(m => { if (m && m.userId) ids.add(m.userId); });
    (buildProjektTeam(p) || []).forEach(uid => { if (uid) ids.add(uid); });
  };
  if (typeof activeProjId !== 'undefined' && activeProjId) {
    addTeam(typeof getP === 'function' ? getP(activeProjId) : null);
  } else {
    const vis = typeof getVisibleProjects === 'function' ? getVisibleProjects(currentUserId) : [];
    vis.forEach(p => addTeam(p));
  }
  return [...ids].filter(id => {
    const usr = USERS.find(x => x.id === id);
    if (!usr || typeof isUserGesperrt === 'function' && isUserGesperrt(usr)) return false;
    return typeof userMayUseApp === 'function' ? userMayUseApp(usr) : usr.aktiv !== false;
  });
}

function mfSetMainChromeVisible(visible) {
  const shell = document.getElementById('shell');
  const top = document.getElementById('topbar');
  const toasts = document.getElementById('toasts');
  if (shell) shell.style.display = visible ? '' : 'none';
  if (top) top.style.display = visible ? '' : 'none';
  if (toasts) toasts.style.display = visible ? '' : 'none';
}

function mfHtmlEscape(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mfShowLoginGate(show) {
  const inv = document.getElementById('mf-invite-gate');
  if (inv && show) inv.style.display = 'none';
  const g = document.getElementById('mf-login-gate');
  if (g) g.style.display = show ? 'block' : 'none';
}

function mfNotifIdsCelalMelanie() {
  return ['u_celal', 'u3'].filter(id => USERS.some(u => u.id === id));
}
function mfNotifIdsProduktionProjekt(p) {
  const ids = new Set();
  (p.projektMitglieder || []).forEach(m => {
    const u = USERS.find(x => x.id === m.userId);
    if (u && u.rolle === 'produktion') ids.add(m.userId);
  });
  (p.produktion_ids || []).forEach(fid => {
    USERS.filter(u => u.firmaId === fid && u.rolle === 'produktion').forEach(u => ids.add(u.id));
  });
  return [...ids];
}
function mfNotifIdsAgenturProjekt(p) {
  const ids = new Set();
  (p.projektMitglieder || []).forEach(m => {
    const u = USERS.find(x => x.id === m.userId);
    if (u && u.rolle === 'agentur') ids.add(m.userId);
  });
  if (p.agentur_id) {
    USERS.filter(u => u.firmaId === p.agentur_id && u.rolle === 'agentur').forEach(u => ids.add(u.id));
  }
  return [...ids];
}

/** Alle Nutzer mit Projektzugang (für In-App-Benachrichtigungen). */
function mfNotifIdsAlleProjektBeteiligten(p) {
  if (!p) return [];
  const ids = new Set();
  if (typeof getProjektZugangsUser === 'function') {
    getProjektZugangsUser(p).forEach(u => { if (u && u.id) ids.add(u.id); });
  } else {
    (p.projektMitglieder || []).forEach(m => { if (m && m.userId) ids.add(m.userId); });
    if (p.zwischenhaendler_id) ids.add(p.zwischenhaendler_id);
    if (p.koordinator_id) ids.add(p.koordinator_id);
    (p.intern_ids || []).forEach(uid => ids.add(uid));
    if (p.agentur_id) {
      USERS.filter(u => u.firmaId === p.agentur_id && u.aktiv !== false).forEach(u => ids.add(u.id));
    }
  }
  (p.produktion_ids || []).forEach(fid => {
    USERS.filter(u => u.firmaId === fid && u.aktiv !== false).forEach(u => ids.add(u.id));
  });
  return [...ids].filter(id => {
    const u = USERS.find(x => x.id === id);
    return u && (typeof userMayUseApp === 'function' ? userMayUseApp(u) : u.aktiv !== false);
  });
}
window.mfNotifIdsAlleProjektBeteiligten = mfNotifIdsAlleProjektBeteiligten;

function mfPushNotifAndEmail(userIds, projId, text, wid, type, emailSubject) {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length) return;
  pushNotif(projId, text, wid, type, ids);
  ids.forEach(uid => {
    const u = USERS.find(x => x.id === uid);
    if (u && u.email && typeof mfSimulateEmailOutbox === 'function') {
      mfSimulateEmailOutbox({
        to: u.email,
        subject: emailSubject || 'MesseFlow Benachrichtigung',
        body: text + '\n\n—\nHinweis: In der Live-Version würde diese E-Mail automatisch versendet.\n',
      });
    }
  });
}

function mfRunDeadlineWarnings() {
  MesseFlowState.projects.forEach(p => {
    const key = 'mf_dl_warn_' + p.id;
    let dl = null;
    if (p.auftragsInfo && p.auftragsInfo.liefertermin) {
      const m = p.auftragsInfo.liefertermin.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (m) dl = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    } else if (p.deadline) dl = new Date(p.deadline);
    if (!dl || isNaN(+dl)) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dday = new Date(dl);
    dday.setHours(0, 0, 0, 0);
    const diff = Math.round((dday - today) / 86400000);
    if (diff < 0 || diff > 3) return;
    try {
      if (localStorage.getItem(key) === String(dday.toISOString())) return;
    } catch (e) { /* ignore */ }
    const txt = diff === 0 ? 'fällig heute' : diff === 1 ? 'fällig morgen' : `fällig in ${diff} Tagen`;
    mfPushNotifAndEmail(mfNotifIdsCelalMelanie(), p.id, `Liefertermin: „${p.name}“ ist ${txt}.`, null, 'status', 'MesseFlow: Liefertermin');
    try {
      localStorage.setItem(key, String(dday.toISOString()));
    } catch (e) { /* ignore */ }
  });
}

function downloadWandDatei(pid, wid) {
  const p = getP(pid);
  const w = getW(p, wid);
  const u = getCurrentUser();
  const f = getAktuelleDatei(w);
  if (!p || !w || !f || !w.datei) {
    toast('Kein Download', 'Es liegt keine Datei vor.', 'ty');
    return;
  }
  const DW = typeof DATEI_WORKFLOW !== 'undefined' ? DATEI_WORKFLOW : window.DATEI_WORKFLOW;
  if (u && u.rolle === 'produktion' && DW) {
    const prodFrei = [DW.FREIGEGEBEN, DW.CALDERA_GESENDET, DW.WIRD_GEDRUCKT, DW.GELIEFERT].includes(f.status);
    if (!prodFrei) {
      toast('Download nicht möglich', 'Die Produktion kann nur freigegebene Dateien herunterladen.', 'ty');
      return;
    }
  }
  const st = window.DATEI_STORE && window.DATEI_STORE[wid];
  if (!st || !st.blob) {
    toast('Datei nicht verfügbar', 'Die Datei liegt erst nach einem Upload in dieser Browser-Sitzung vor (Demo). Bitte erneut hochladen.', 'ty');
    return;
  }
  const url = URL.createObjectURL(st.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = st.name || f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  if (typeof mfAudit === 'function') {
    mfAudit({ action: 'datei_download', projectId: pid, wallId: wid, meta: { name: st.name || f.name } });
  }
  toast('Download', 'Datei wird heruntergeladen.', 'tg');
}
window.downloadWandDatei = downloadWandDatei;

function renderMfLoginOtpForm(pendingId, userName, waHref, hasEmail) {
  const inner = document.getElementById('mf-login-gate-inner');
  const hint = hasEmail
    ? '<p style="font-size:12px;color:var(--muted);margin:0 0 14px;line-height:1.5;">Ein Bestätigungscode wurde an Ihre hinterlegte E-Mail gesendet (in der Demo: Eintrag in der simulierten E-Mail-Warteschlange, localStorage).</p>'
    : '<p style="font-size:12px;color:var(--muted);margin:0 0 14px;line-height:1.5;">Für dieses Konto ist keine E-Mail hinterlegt. Nutzen Sie bei Bedarf den WhatsApp-Hinweis mit dem Code oder erhalten Sie Unterstützung durch die Administration.</p>';
  const waBtn = waHref
    ? `<div style="margin-top:4px;"><a class="btn ghost sm" style="text-decoration:none;display:inline-block;" href="${mfHtmlEscape(waHref)}" target="_blank" rel="noopener">💬 WhatsApp mit Code</a></div>`
    : '';
  inner.innerHTML = `
    <h1 style="font-size:20px;font-weight:800;color:#1e1b4b;margin:0 0 6px;">Neues Gerät bestätigen</h1>
    <p style="font-size:13px;color:var(--muted);margin:0 0 14px;line-height:1.5;">Geben Sie den 6-stelligen Code ein, den wir Ihnen gesendet haben.</p>
    <p style="font-size:13px;margin:0 0 12px;"><strong>${mfHtmlEscape(userName || '')}</strong></p>
    ${hint}
    ${waBtn}
    <div class="fg" style="margin-top:14px;margin-bottom:14px;">
      <label style="font-size:12px;">Sicherheitscode</label>
      <input id="mf-login-otp" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="one-time-code"
        placeholder="6 Ziffern"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:18px;letter-spacing:0.2em;">
    </div>
    <p id="mf-login-otp-err" style="display:none;font-size:13px;color:var(--red);margin:0 0 12px;"></p>
    <button type="button" class="btn primary" id="mf-login-otp-go" style="width:100%;padding:10px;">Bestätigen und anmelden</button>
    <p style="margin-top:14px;"><button type="button" class="btn ghost sm" id="mf-login-otp-back" style="padding:0;border:none;background:none;color:var(--blue);cursor:pointer;font:inherit;">← Zurück zur Anmeldung</button></p>`;
  document.getElementById('mf-login-otp-back').onclick = () => renderMfLoginForm('');
  document.getElementById('mf-login-otp-go').onclick = async () => {
    const errEl = document.getElementById('mf-login-otp-err');
    errEl.style.display = 'none';
    const code = document.getElementById('mf-login-otp').value;
    const r = typeof mfSubmitDeviceOtp === 'function' ? mfSubmitDeviceOtp(pendingId, code) : { ok: false, error: 'Bestätigung nicht verfügbar.' };
    if (!r.ok) {
      errEl.textContent = r.error || 'Code ungültig.';
      errEl.style.display = 'block';
      return;
    }
    mfShowLoginGate(false);
    mfSetMainChromeVisible(true);
    messeflowNormalBoot(r.user.id);
    if (typeof toast === 'function') toast('Angemeldet', `Willkommen, ${r.user.name}.`, 'tg');
  };
}

function renderMfLoginForm(errorText) {
  const inner = document.getElementById('mf-login-gate-inner');
  const errHtml = errorText ? `<p style="font-size:13px;color:var(--red);margin:0 0 12px;">${mfHtmlEscape(errorText)}</p>` : '';
  const fileProtoHint = window.location.protocol === 'file:'
    ? `<p style="font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin:0 0 14px;line-height:1.45;">
      Sie öffnen die App als lokale Datei (<code style="font-size:11px;">file:///</code>). Bitte stattdessen einen <strong>lokalen Server</strong> nutzen (z.&nbsp;B. VS&nbsp;Code „Live Server“ oder im Ordner <code style="font-size:11px;">npx --yes serve -p 5173</code>), sonst blockiert der Browser oft die Anmeldung.</p>`
    : '';
  inner.innerHTML = `
    <h1 style="font-size:20px;font-weight:800;color:#1e1b4b;margin:0 0 6px;">MesseFlow</h1>
    <p style="font-size:13px;color:var(--muted);margin:0 0 18px;line-height:1.5;">Anmelden mit E-Mail, Benutzer-ID oder Name.</p>
    ${fileProtoHint}
    ${errHtml}
    <form id="mf-login-form" novalidate style="margin:0;">
    <div class="fg" style="margin-bottom:10px;">
      <label style="font-size:12px;">Benutzername</label>
      <input id="mf-login-user" type="text" autocomplete="username" name="username"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:14px;"
        placeholder="z. B. celal@cc-werbung.de">
    </div>
    <div class="fg" style="margin-bottom:14px;">
      <label style="font-size:12px;">Passwort</label>
      <input id="mf-login-pass" type="password" autocomplete="current-password" name="password"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:14px;">
    </div>
    <button type="submit" class="btn primary" id="mf-login-submit" style="width:100%;padding:10px;">Anmelden</button>
    </form>
    <p style="font-size:12px;color:var(--muted);margin:14px 0 0;line-height:1.5;">
      <button type="button" class="btn ghost sm" id="mf-login-forgot" style="padding:0;border:none;background:none;color:var(--blue);cursor:pointer;font:inherit;">
        Passwort vergessen?
      </button>
    </p>
    <p style="font-size:11px;color:var(--muted);margin-top:12px;padding-top:12px;border-top:1px solid var(--line);">
      Demo-Zugang: z. B. <strong>celal@cc-werbung.de</strong> · Passwort <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">MesseFlowDemo#1</code>
    </p>`;
  const form = document.getElementById('mf-login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('mf-login-submit');
    if (btn && btn.disabled) return;
    const login = document.getElementById('mf-login-user').value.trim();
    const pw = document.getElementById('mf-login-pass').value;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Bitte warten…';
    }
    try {
      if (typeof mfTryLogin !== 'function') {
        throw new Error('Anmeldung nicht verfügbar. Bitte prüfen Sie, ob alle Skripte geladen sind (F12 → Konsole), und laden Sie die Seite neu.');
      }
      const res = await mfTryLogin(login, pw);
      if (res.needOtp && res.pendingId) {
        renderMfLoginOtpForm(res.pendingId, res.otpUserName, res.otpWaHref, res.otpHasEmail);
        return;
      }
      if (!res.ok) {
        renderMfLoginForm(res.error || 'Anmeldung fehlgeschlagen.');
        return;
      }
      mfShowLoginGate(false);
      mfSetMainChromeVisible(true);
      messeflowNormalBoot(res.user.id);
      if (typeof toast === 'function') toast('Angemeldet', `Willkommen, ${res.user.name}.`, 'tg');
    } catch (err) {
      const msg = (err && err.message) ? err.message : 'Anmeldung fehlgeschlagen.';
      if (typeof toast === 'function') toast('Anmeldung', msg, 'tr');
      renderMfLoginForm(msg);
    } finally {
      const b = document.getElementById('mf-login-submit');
      if (b && document.getElementById('mf-login-form')) {
        b.disabled = false;
        b.textContent = 'Anmelden';
      }
    }
  });
  document.getElementById('mf-login-forgot').onclick = () => renderMfForgotForm();
}

function renderMfForgotForm(msg, errMsg) {
  const inner = document.getElementById('mf-login-gate-inner');
  inner.innerHTML = `
    <h1 style="font-size:20px;font-weight:800;color:#1e1b4b;margin:0 0 6px;">Passwort vergessen</h1>
    <p style="font-size:13px;color:var(--muted);margin:0 0 18px;line-height:1.5;">
      Geben Sie die hinterlegte E-Mail ein. Sie erhalten einen sicheren Link zum Neusetzen (in der Demo: Hinweis + Link zum Kopieren).
    </p>
    ${errMsg ? `<p style="font-size:13px;color:var(--red);margin:0 0 12px;">${errMsg}</p>` : ''}
    ${msg ? `<p style="font-size:13px;color:var(--green);margin:0 0 12px;">${msg}</p>` : ''}
    <div class="fg" style="margin-bottom:14px;">
      <label style="font-size:12px;">E-Mail</label>
      <input id="mf-forgot-email" type="email" autocomplete="email"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:14px;">
    </div>
    <button type="button" class="btn primary" id="mf-forgot-submit" style="width:100%;padding:10px;">Link anfordern</button>
    <p style="margin-top:14px;"><button type="button" class="btn ghost sm" id="mf-forgot-back">Zurück zur Anmeldung</button></p>`;
  document.getElementById('mf-forgot-submit').onclick = () => {
    const em = document.getElementById('mf-forgot-email').value.trim();
    const res = mfRequestPasswordReset(em);
    if (!res.ok) {
      renderMfForgotForm('', res.error);
      return;
    }
    window.__mfLastPwdResetUrl = res.url;
    openModal('E-Mail (Demo)', `
      <p style="font-size:13px;color:var(--muted);line-height:1.55;margin-bottom:10px;">
        In Produktion würde eine E-Mail an <strong>${res.email}</strong> versendet. Hier der Link zum Zurücksetzen:
      </p>
      <div style="background:#f9fafb;border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-size:12px;font-family:monospace;word-break:break-all;">${res.url}</div>
      <div class="ma" style="margin-top:14px;">
        <button type="button" class="btn primary sm" onclick="navigator.clipboard.writeText(window.__mfLastPwdResetUrl||'').then(()=>toast('Kopiert','Link in Zwischenablage.','tg')).catch(()=>toast('Hinweis','Bitte manuell kopieren.','ty'))">Kopieren</button>
        <a class="btn ghost sm" style="text-decoration:none;" href="mailto:${encodeURIComponent(res.email)}?subject=${encodeURIComponent('Passwort MesseFlow')}&body=${encodeURIComponent('Link: ' + res.url)}">E-Mail-Programm öffnen</a>
        <button type="button" class="btn ghost sm" onclick="closeModal()">Schließen</button>
      </div>`);
    renderMfForgotForm('Wenn die E-Mail stimmt, ist der Ablauf gestartet – siehe Popup.');
  };
  document.getElementById('mf-forgot-back').onclick = () => renderMfLoginForm('');
}

async function runMfPasswordResetSetup(token) {
  const inner = document.getElementById('mf-login-gate-inner');
  const v = mfValidatePasswordResetToken(token);
  if (!v.ok) {
    const msg = v.reason === 'expired'
      ? 'Der Link ist abgelaufen. Bitte erneut „Passwort vergessen“ anfordern.'
      : v.reason === 'used'
        ? 'Dieser Link wurde bereits verwendet.'
        : v.reason === 'gesperrt' || v.reason === 'deaktiviert'
          ? 'Dieses Konto ist gesperrt oder deaktiviert.'
        : 'Dieser Link ist ungültig.';
    inner.innerHTML = `
      <h1 style="font-size:20px;font-weight:800;color:#1e1b4b;">Passwort zurücksetzen</h1>
      <p style="color:var(--red);font-size:14px;margin:12px 0;">${msg}</p>
      <button type="button" class="btn primary" onclick="mfShowLoginGate(true);renderMfForgotForm();">Neuen Link anfordern</button>`;
    return;
  }
  const u = USERS.find(x => x.id === v.userId);
  inner.innerHTML = `
    <h1 style="font-size:20px;font-weight:800;color:#1e1b4b;margin:0 0 6px;">Neues Passwort setzen</h1>
    <p style="font-size:13px;color:var(--muted);margin:0 0 14px;">${u ? u.name : ''} · neues Passwort wählen</p>
    <div class="fg" style="margin-bottom:10px;">
      <label style="font-size:12px;">Neues Passwort (mind. 8 Zeichen)</label>
      <input id="mf-rp1" type="password" autocomplete="new-password"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:14px;">
    </div>
    <div class="fg" style="margin-bottom:14px;">
      <label style="font-size:12px;">Passwort wiederholen</label>
      <input id="mf-rp2" type="password" autocomplete="new-password"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:14px;">
    </div>
    <p id="mf-rp-err" style="display:none;color:var(--red);font-size:13px;margin-bottom:10px;"></p>
    <button type="button" class="btn primary" id="mf-rp-go" style="width:100%;">Passwort speichern</button>`;
  document.getElementById('mf-rp-go').onclick = async () => {
    const err = document.getElementById('mf-rp-err');
    err.style.display = 'none';
    const res = await mfCompletePasswordReset(token, document.getElementById('mf-rp1').value, document.getElementById('mf-rp2').value);
    if (!res.ok) {
      err.textContent = res.error || 'Fehler';
      err.style.display = 'block';
      return;
    }
    history.replaceState({}, '', window.location.pathname);
    mfShowLoginGate(false);
    mfSetMainChromeVisible(true);
    messeflowNormalBoot(res.user.id);
    if (typeof toast === 'function') toast('Passwort gespeichert', 'Sie sind angemeldet.', 'tg');
  };
}

function refreshRoleSelVisibility() {
  const lo = document.getElementById('mf-logout-btn');
  const dv = document.getElementById('mf-devices-btn');
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (lo) lo.style.display = u ? '' : 'none';
  if (dv) dv.style.display = u ? '' : 'none';
}

function renderMfInviteError(title, message) {
  const inner = document.getElementById('mf-invite-gate-inner');
  inner.innerHTML = `
    <h1 style="font-size:20px;font-weight:800;color:#1e1b4b;margin:0 0 12px;">${title}</h1>
    <p style="font-size:14px;color:var(--muted);line-height:1.55;margin:0 0 20px;">${message}</p>
    <a class="btn primary" href="${window.location.pathname}" style="text-decoration:none;display:inline-block;">Zur Startseite</a>`;
}

async function runMfInviteSetup(token) {
  const inner = document.getElementById('mf-invite-gate-inner');
  const v = typeof validateInviteToken === 'function' ? validateInviteToken(token) : { ok: false };
  if (!v.ok) {
    const msg = v.reason === 'expired'
      ? 'Einladung abgelaufen – bitte neuen Link anfordern.'
      : v.reason === 'used'
        ? 'Dieser Link wurde bereits verwendet.'
        : v.reason === 'deaktiviert'
          ? 'Dieses Konto ist deaktiviert.'
          : 'Dieser Einladungslink ist ungültig.';
    renderMfInviteError('Einladung nicht möglich', msg);
    return;
  }
  const u = USERS.find(x => x.id === v.userId);
  if (!u) {
    renderMfInviteError('Fehler', 'Benutzer nicht gefunden.');
    return;
  }
  inner.innerHTML = `
    <h1 style="font-size:20px;font-weight:800;color:#1e1b4b;margin:0 0 6px;">Willkommen</h1>
    <p style="font-size:13px;color:var(--muted);margin:0 0 18px;line-height:1.5;">Zugang einrichten – Sie erhalten Zugang erst nach erfolgreicher Aktivierung.</p>
    <div class="fg" style="margin-bottom:10px;">
      <label style="font-size:12px;">Name</label>
      <input id="mf-inv-name" type="text" value="${(u.name || '').replace(/"/g, '&quot;')}"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:14px;">
    </div>
    <div class="fg" style="margin-bottom:10px;">
      <label style="font-size:12px;">E-Mail (optional)</label>
      <input id="mf-inv-email" type="email" value="${(u.email || '').replace(/"/g, '&quot;')}" placeholder="name@firma.de"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:14px;">
    </div>
    <div class="fg" style="margin-bottom:10px;">
      <label style="font-size:12px;">Neues Passwort (mind. 8 Zeichen)</label>
      <input id="mf-inv-pw1" type="password" autocomplete="new-password"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:14px;">
    </div>
    <div class="fg" style="margin-bottom:14px;">
      <label style="font-size:12px;">Passwort wiederholen</label>
      <input id="mf-inv-pw2" type="password" autocomplete="new-password"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:14px;">
    </div>
    <p id="mf-inv-err" style="display:none;font-size:13px;color:var(--red);margin:0 0 12px;"></p>
    <button type="button" class="btn primary" id="mf-inv-submit" style="width:100%;padding:10px;">Zugang aktivieren</button>`;

  document.getElementById('mf-inv-submit').onclick = async () => {
    const errEl = document.getElementById('mf-inv-err');
    errEl.style.display = 'none';
    const name = document.getElementById('mf-inv-name').value.trim();
    const email = document.getElementById('mf-inv-email').value.trim();
    const pass1 = document.getElementById('mf-inv-pw1').value;
    const pass2 = document.getElementById('mf-inv-pw2').value;
    const res = await activateUserWithInviteToken(token, { name, email, pass1, pass2 });
    if (!res.ok) {
      errEl.textContent = res.error || 'Fehler';
      errEl.style.display = 'block';
      return;
    }
    history.replaceState({}, '', window.location.pathname);
    document.getElementById('mf-invite-gate').style.display = 'none';
    mfSetMainChromeVisible(true);
    if (typeof mfEstablishUserSession === 'function') mfEstablishUserSession(res.user.id);
    else if (typeof mfSetSession === 'function') mfSetSession(res.user.id);
    messeflowNormalBoot(res.user.id);
    if (typeof toast === 'function') toast('Willkommen', `Zugang für ${res.user.name} ist aktiv.`, 'tg');
  };
}

function runMfMagicLoginSetup(token) {
  const inner = document.getElementById('mf-invite-gate-inner');
  if (typeof mfPeekMagicLogin !== 'function' || typeof mfGetOrCreateBrowserDeviceId !== 'function') {
    renderMfInviteError('Fehler', 'Anmelde-Modul nicht geladen. Bitte Seite neu laden.');
    return;
  }
  const peek = mfPeekMagicLogin(token);
  if (!peek.ok) {
    const msg = peek.reason === 'expired'
      ? 'Der Link ist abgelaufen (max. 15 Minuten). Bitte einen neuen Magic-Link anfordern.'
      : peek.reason === 'used'
        ? 'Dieser Link wurde bereits verwendet.'
        : peek.reason === 'deaktiviert'
          ? 'Dieses Konto ist deaktiviert.'
          : 'Dieser Anmeldelink ist ungültig.';
    renderMfInviteError('Anmeldung nicht möglich', msg);
    return;
  }
  const deviceId = mfGetOrCreateBrowserDeviceId();
  if (typeof mfIsTrustedDevice === 'function' && mfIsTrustedDevice(peek.userId, deviceId)) {
    const res = mfCompleteMagicLoginTrustedDevice(token);
    if (res.ok) {
      history.replaceState({}, '', window.location.pathname);
      document.getElementById('mf-invite-gate').style.display = 'none';
      mfSetMainChromeVisible(true);
      messeflowNormalBoot(res.user.id);
      if (typeof toast === 'function') toast('Angemeldet', `Willkommen, ${res.user.name}.`, 'tg');
      return;
    }
    renderMfInviteError('Anmeldung nicht möglich', res.error || 'Anmeldung fehlgeschlagen.');
    return;
  }
  const otp = mfMagicLoginStartOtp(token);
  if (!otp.ok) {
    renderMfInviteError('Anmeldung nicht möglich', otp.error || 'Code konnte nicht erzeugt werden.');
    return;
  }
  const hint = otp.hasEmail
    ? '<p style="font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.5;">Ein Code wurde an die hinterlegte E-Mail gesendet (Demo: simulierter Posteingang).</p>'
    : '<p style="font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.5;">Keine E-Mail hinterlegt – nutzen Sie bei Bedarf WhatsApp mit dem Code.</p>';
  const waBtn = otp.waHref
    ? `<a class="btn ghost sm" style="text-decoration:none;display:inline-block;margin-bottom:12px;" href="${mfHtmlEscape(otp.waHref)}" target="_blank" rel="noopener">💬 WhatsApp mit Code</a>`
    : '';
  inner.innerHTML = `
    <h1 style="font-size:20px;font-weight:800;color:#1e1b4b;margin:0 0 6px;">Neues Gerät</h1>
    <p style="font-size:13px;color:var(--muted);margin:0 0 14px;line-height:1.5;">Dieser Browser ist noch nicht als vertrauenswürdig gespeichert. Bitte den Sicherheitscode eingaben, den wir an <strong>${mfHtmlEscape(peek.user.name)}</strong> gesendet haben.</p>
    ${hint}
    ${waBtn}
    <div class="fg" style="margin-bottom:12px;">
      <label style="font-size:12px;">6-stelliger Code</label>
      <input id="mf-magic-otp" type="text" inputmode="numeric" maxlength="8" autocomplete="one-time-code"
        style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:18px;letter-spacing:0.2em;">
    </div>
    <p id="mf-magic-otp-err" style="display:none;font-size:13px;color:var(--red);margin:0 0 12px;"></p>
    <button type="button" class="btn primary" id="mf-magic-otp-go" style="width:100%;padding:10px;">Bestätigen und anmelden</button>
    <p style="margin-top:14px;"><a class="btn ghost sm" href="${mfHtmlEscape(window.location.pathname)}" style="text-decoration:none;display:inline-block;">Abbrechen</a></p>`;
  document.getElementById('mf-magic-otp-go').onclick = () => {
    const errEl = document.getElementById('mf-magic-otp-err');
    errEl.style.display = 'none';
    const code = document.getElementById('mf-magic-otp').value;
    const r = mfSubmitDeviceOtp(otp.pendingId, code);
    if (!r.ok) {
      errEl.textContent = r.error || 'Code ungültig.';
      errEl.style.display = 'block';
      return;
    }
    history.replaceState({}, '', window.location.pathname);
    document.getElementById('mf-invite-gate').style.display = 'none';
    mfSetMainChromeVisible(true);
    messeflowNormalBoot(r.user.id);
    if (typeof toast === 'function') toast('Angemeldet', `Willkommen, ${r.user.name}.`, 'tg');
  };
}

function refreshUserDropdown() {
  const sel = document.getElementById('role-sel');
  if (!sel) return;
  const ids = USERS.filter(usr => typeof userMayUseApp === 'function' ? userMayUseApp(usr) : usr.aktiv !== false)
    .map(usr => usr.id);
  const sorted = [...new Set(ids)].sort((a, b) => {
    const na = USERS.find(u => u.id === a)?.name || '';
    const nb = USERS.find(u => u.id === b)?.name || '';
    return na.localeCompare(nb, 'de');
  });
  const opts = sorted.map(id => {
    const u = USERS.find(x => x.id === id);
    if (!u) return '';
    const R = ROLES.find(r => r.id === u.rolle);
    const label = R ? `${u.name} (${R.label})` : `${u.name}`;
    return `<option value="${id}">${label}</option>`;
  }).join('');
  sel.innerHTML = opts || (() => {
    const u = getCurrentUser();
    return u ? `<option value="${u.id}">${u.name}</option>` : '';
  })();

  if (sorted.length && !sorted.includes(currentUserId)) {
    setUser(sorted[0]);
    return;
  }

  if (sorted.includes(currentUserId)) sel.value = currentUserId;

  const user = getCurrentUser();
  const rd = document.getElementById('role-display');
  const R = ROLES.find(r => r.id === role);
  if (rd && user) {
    rd.innerHTML = `<span>${user.name}</span><span style="color:${R ? R.color : '#000'};"> (${R ? R.label : role})</span>`;
    rd.style.background = R ? R.bg : '#fff';
    rd.style.borderColor = (R ? R.color : '#000') + '44';
  }
}
window.refreshUserDropdown = refreshUserDropdown;

function onProjectChange() {
  if (typeof refreshProjectUI === 'function') refreshProjectUI();
}
window.onProjectChange = onProjectChange;

function setUser(userId){
  const user = USERS.find(u => u.id === userId);
  if (!user) return;
  currentUserId = userId;
  role = user.rolle;
  window.currentUserId = currentUserId; // Alias – Cockpit nutzt MesseFlow.getCurrentUserId()
  window.role = role;                   // Alias – Cockpit nutzt MesseFlow.getCurrentRole()
  // MesseFlow-Namespace aktuell halten
  if (window.MesseFlowState) {
    window.MesseFlowState._currentUserId = currentUserId;
    window.MesseFlowState._role = role;
  }
  const rd=document.getElementById('role-display');
  const R=ROLES.find(r => r.id === role);
  rd.innerHTML=`<span>${user.name}</span><span style="color:${R ? R.color : '#000'};"> (${R ? R.label : role})</span>`;
  rd.style.background = R ? R.bg : '#fff';
  rd.style.borderColor = (R ? R.color : '#000') + '44';

  // Mobile-Optimierung für cc_intern
  document.body.classList.toggle('role-cc-intern', role === 'cc_intern');

  // Modul-Zugriffsprüfung
  if (!canAccessModule(userId, 'messeflow')) {
    renderSidebar();
    document.getElementById('view').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
        padding:80px 20px;text-align:center;color:var(--muted);">
        <div style="font-size:48px;margin-bottom:16px;">⛔</div>
        <div style="font-size:18px;font-weight:700;color:#374151;margin-bottom:8px;">Kein Zugriff auf MesseFlow</div>
        <div style="font-size:14px;max-width:380px;line-height:1.6;">
          ${user.name} hat keine Berechtigung für dieses Modul.<br>
          Bitte einen Administrator kontaktieren.
        </div>
      </div>`;
    refreshUserDropdown();
    if (typeof refreshRoleSelVisibility === 'function') refreshRoleSelVisibility();
    if (typeof mfRefreshModuleBar === 'function') mfRefreshModuleBar();
    if (typeof mfSaveState === 'function') mfSaveState();
    return;
  }

  refreshProjectUI();
  if (typeof refreshRoleSelVisibility === 'function') refreshRoleSelVisibility();
  if (typeof mfRefreshModuleBar === 'function') mfRefreshModuleBar();
    if (typeof mfSaveState === 'function') mfSaveState();
}

function selectProj(id){
  adminViewOpen = false;
  window.__mfActiveModule = 'messeflow';
  const user = getCurrentUser();
  const proj = MesseFlowState.projects.find(p => p.id === id);
  if(!proj || !canSeeProject(user, proj)){
    document.getElementById('view').innerHTML=`
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
        padding:80px 20px;text-align:center;color:var(--muted);">
        <div style="font-size:40px;margin-bottom:12px;">🔒</div>
        <div style="font-size:17px;font-weight:700;color:#374151;margin-bottom:6px;">Kein Zugriff</div>
        <div style="font-size:13px;color:var(--muted);">Dieses Projekt ist für Ihren Account nicht freigegeben.</div>
      </div>`;
    return;
  }
  activeProjId=id;
  refreshProjectUI();
}

window.__mfActiveModule = window.__mfActiveModule || 'messeflow';

function mfRenderModulePlaceholder(mid) {
  const map = { crm: 'CC Intern (CRM)', angebote: 'FUSA / Angebote' };
  const t = map[mid] || mid;
  return `<div style="padding:48px 20px;text-align:center;max-width:520px;margin:0 auto;">
    <div style="font-size:40px;margin-bottom:12px;">🚧</div>
    <div style="font-size:18px;font-weight:800;color:#1e1b4b;margin-bottom:8px;">${t}</div>
    <p style="font-size:14px;color:var(--muted);line-height:1.6;">Gleiche Datenbasis wie MesseFlow – Oberfläche folgt. Bitte oben <strong>MesseFlow</strong> wählen.</p>
  </div>`;
}

function mfRefreshModuleBar() {
  const bar = document.getElementById('mf-module-bar');
  if (!bar) return;
  if (typeof role !== 'undefined' && (role === 'zwischenhaendler' || role === 'produktion')) {
    bar.innerHTML = '';
    bar.style.display = 'none';
    return;
  }
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u || typeof canAccessModule !== 'function' || !canAccessModule(u.id, 'messeflow')) {
    bar.innerHTML = '';
    bar.style.display = 'none';
    return;
  }
  const mods = [];
  if (canAccessModule(u.id, 'messeflow')) mods.push({ id: 'messeflow', label: 'MesseFlow' });
  if (canAccessModule(u.id, 'crm')) mods.push({ id: 'crm', label: 'CC Intern' });
  if (canAccessModule(u.id, 'angebote')) mods.push({ id: 'angebote', label: 'FUSA' });
  const uniq = mods.filter((m, i, a) => a.findIndex(x => x.id === m.id) === i);
  if (uniq.length < 2) {
    bar.innerHTML = '';
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  const cur = window.__mfActiveModule || 'messeflow';
  bar.innerHTML = uniq.map(m => {
    const on = m.id === cur;
    return `<button type="button" class="mf-mod-btn${on ? ' mf-mod-btn--on' : ''}" onclick="mfSwitchAppModule('${m.id}')">${m.label}</button>`;
  }).join('');
}

function mfSwitchAppModule(mid) {
  window.__mfActiveModule = mid || 'messeflow';
  if (mid && mid !== 'messeflow') {
    if (typeof adminViewOpen !== 'undefined') adminViewOpen = false;
    if (typeof activeProjId !== 'undefined') activeProjId = null;
  }
  if (typeof renderSidebar === 'function') renderSidebar();
  if (typeof renderView === 'function') renderView();
}

window.mfRefreshModuleBar = mfRefreshModuleBar;
window.mfSwitchAppModule = mfSwitchAppModule;

// ═══════════════════════════════════════════════════════
// VIEW ROUTER
// ═══════════════════════════════════════════════════════
function renderView(){
  try {
    if(adminViewOpen && role==='admin'){ renderAdminView(); return; }
    const mod = window.__mfActiveModule || 'messeflow';
    if (mod !== 'messeflow' && role !== 'zwischenhaendler' && role !== 'produktion') {
      document.getElementById('view').innerHTML = mfRenderModulePlaceholder(mod);
      return;
    }
    if(role==='zwischenhaendler'){ renderBettinaView(); return; }
    if(role==='produktion')     { renderProduktionView(); return; }
    if(!activeProjId){ document.getElementById('view').innerHTML='<div style="color:var(--muted);text-align:center;padding:60px 0;font-size:15px;">← Projekt auswählen</div>'; return; }
    // Sicherheitsnetz: aktives Projekt nochmals auf Sichtbarkeit prüfen
    const _guardProj = MesseFlowState.projects.find(p => p.id === activeProjId);
    if(!_guardProj || !canSeeProject(getCurrentUser(), _guardProj)){
      activeProjId = null;
      document.getElementById('view').innerHTML='<div style="color:var(--muted);text-align:center;padding:60px 0;font-size:15px;">← Projekt auswählen</div>';
      return;
    }
    renderProjView();
  } finally {
    refreshUserDropdown();
    if (typeof mfRefreshModuleBar === 'function') mfRefreshModuleBar();
    if (typeof mfSaveState === 'function') mfSaveState();
  }
}

function toggleProdStufe(pid, stufenId){
  const p = getP(pid);
  const s = p.produktionsplan?.find(x=>x.id===stufenId);
  if(!s) return;
  s.erledigt = !s.erledigt;
  renderSidebar(); renderView();
  if(s.erledigt){
    const next = p.produktionsplan.find(x=>!x.erledigt);
    toast('✓ Abgeschlossen', `${s.label}${next?' → '+next.label+' als nächstes':''}`, 'tg');
    if(!next) toast('🎉 Fertig!', `${p.name} – Produktion vollständig abgeschlossen`, 'tg');
  }
}

// ═══════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════

// Agentur: Datei hochladen — Dateimaß direkt eingeben, automatischer Vergleich
// ═══════════════════════════════════════════════════════
// UPLOAD SYSTEM — race-condition-frei
// Alle Daten direkt am Button-Element gespeichert (kein globaler State).
// Jede Wand hat eigene IDs: upload-btn-{wid}, ffile-{wid}, fpx-b-{wid} etc.
// ═══════════════════════════════════════════════════════

function uploadDatei(pid, wid){
  const p=getP(pid), w=getW(p,wid);
  const fUp = typeof getAktuelleDatei === 'function' ? getAktuelleDatei(w) : null;
  if (fUp && typeof istDateiDruckGesperrt === 'function' && istDateiDruckGesperrt(fUp.status)) {
    toast('Gesperrt', 'Diese Datei wurde an den Druck übergeben – Upload und Ersetzen sind nicht möglich.', 'ty');
    return;
  }
  const bestellInfo = w.bestellmass
    ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:11px 14px;margin-bottom:12px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#166534;margin-bottom:3px;">Bestellmaß – bitte genau einhalten</div>
        <div style="font-size:20px;font-weight:800;color:#15803d;">${w.bestellmass}</div>
      </div>`
    : `<div style="background:#f9fafb;border:1px solid var(--line);border-radius:8px;padding:10px 13px;font-size:12px;color:var(--muted);margin-bottom:12px;">
        ℹ Kein Bestellmaß hinterlegt – bitte bei Norbert nachfragen.
      </div>`;

  openModal('Datei hochladen', `
    ${bestellInfo}
    <div class="fg">
      <label>PDF-Datei auswählen</label>
      <input id="ffile-${wid}" type="file" accept=".pdf"
        style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;background:#fafafa;"
        onchange="onDateiAusgewaehlt('${pid}','${wid}',this)">
    </div>
    <!-- Maßstab-Auswahl: sichtbar sobald Datei ausgewählt -->
    <div id="massstab-box-${wid}" style="display:none;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 13px;margin-bottom:8px;">
      <label style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#0369a1;display:block;margin-bottom:5px;">
        📐 Datei-Maßstab
        <span style="font-size:10px;font-weight:400;text-transform:none;color:var(--muted);margin-left:4px;">(wenn PDF verkleinert angelegt wurde)</span>
      </label>
      <select id="massstab-${wid}"
        style="width:100%;padding:7px 10px;border:1px solid #7dd3fc;border-radius:6px;font-size:13px;font-weight:700;background:#fff;color:#0c4a6e;"
        onchange="onMassstabGeaendert('${pid}','${wid}')">
        <option value="1">1 : 1 — Originalgröße (Standard)</option>
        <option value="2">1 : 2 — Datei ist halb so groß</option>
        <option value="5">1 : 5 — Datei ist 1/5 der Originalgröße</option>
        <option value="10">1 : 10 — Datei ist 1/10 der Originalgröße</option>
        <option value="custom">Eigener Faktor…</option>
      </select>
      <div id="massstab-custom-${wid}" style="display:none;margin-top:6px;">
        <input type="number" id="massstab-custom-val-${wid}" min="1" max="100" step="0.1"
          placeholder="z.B. 3 oder 7.5"
          style="width:100%;padding:7px 10px;border:1px solid #7dd3fc;border-radius:6px;font-size:13px;"
          oninput="onMassstabGeaendert('${pid}','${wid}')">
      </div>
      <div id="massstab-info-${wid}" style="margin-top:5px;font-size:11px;color:#0369a1;"></div>
    </div>
    <div id="pruef-ergebnis-${wid}" style="margin-bottom:8px;min-height:0;"></div>
    <div id="mass-anzeige-${wid}"   style="margin-bottom:8px;min-height:0;"></div>
    <div id="fpx-b-${wid}" style="display:none;"></div>
    <div id="fpx-h-${wid}" style="display:none;"></div>
    <div style="background:#f9fafb;border:1px solid var(--line);border-radius:7px;padding:9px 12px;font-size:12px;color:var(--muted);margin-bottom:4px;">
      System prüft automatisch: Maße · Schriften · Farbraum
    </div>
    <div class="ma" style="flex-direction:column;gap:8px;align-items:stretch;">
      <div style="display:flex;gap:8px;">
        <button id="upload-btn-${wid}" class="btn primary" style="flex:1;"
          onclick="confirmUpload('${pid}','${wid}',false)"
          disabled
          data-analysiert="nein"
          data-server-offline="nein">
          ⏳ Datei auswählen…
        </button>
        <button class="btn ghost" onclick="closeModal()">Abbrechen</button>
      </div>
      <!-- Risiko-Button: erscheint automatisch wenn Warnungen erkannt werden -->
      <button id="risiko-btn-${wid}" class="btn"
        style="display:none;background:#fef3c7;border:1px solid #f59e0b;color:#92400e;
               font-size:12px;padding:8px 14px;width:100%;text-align:center;border-radius:8px;"
        onclick="confirmUpload('${pid}','${wid}',true)">
        ⚠ Trotzdem hochladen – ich bin mir bewusst, auf eigenes Risiko
      </button>
    </div>`);
}

function getUploadBtn(wid){ return document.getElementById('upload-btn-'+wid); }

// ─── Ergebnis rendern (auch bei Maßstab-Wechsel wiederverwendbar) ─────────
function renderUploadErgebnis(pid, wid, e) {
  const btn = getUploadBtn(wid);
  const el  = document.getElementById('pruef-ergebnis-'+wid);
  const p0  = getP(pid), w0 = getW(p0, wid);

  // Maßstab-Faktor einrechnen: skaliertes Dateimaß = PDF-Maß × Faktor
  const _msFaktor = getMassstabFaktor(wid);
  const _rawB  = e.abmessungen?.breiteMm;
  const _rawH  = e.abmessungen?.hoeheMm;
  const _skalB = _rawB ? Math.round(_rawB * _msFaktor) : null;
  const _skalH = _rawH ? Math.round(_rawH * _msFaktor) : null;
  const fmasseStr = (_skalB && _skalH) ? `${_skalB} × ${_skalH} mm` : '';
  const vglModal  = (w0.bestellmass && fmasseStr) ? vergleicheMasse(w0.bestellmass, fmasseStr) : null;

  // ── Maß-Anzeige ───────────────────────────────────────────────────────────
  const massVglStufe = vglModal?.stufe || 'ok';
  const massFarbe = massVglStufe === 'ok' ? 'var(--green)' : massVglStufe === 'warnung' ? '#92400e' : 'var(--red)';
  const massBg    = massVglStufe === 'ok' ? '#f0fdf4' : massVglStufe === 'warnung' ? '#fffbeb' : '#fef2f2';
  const massBd    = massVglStufe === 'ok' ? '#86efac' : massVglStufe === 'warnung' ? '#fde68a' : '#fecaca';
  const massIcon  = massVglStufe === 'ok' ? '✓ ' : massVglStufe === 'warnung' ? '⚡ ' : '';

  const massAnzeige = document.getElementById('mass-anzeige-'+wid);
  if (massAnzeige) {
    if (e.abmessungen) {
      const massstabHinweis = _msFaktor !== 1
        ? `<div style="font-size:11px;color:#0369a1;margin-top:3px;">
             📏 PDF-Maß: ${_rawB} × ${_rawH} mm × <strong>${_msFaktor}</strong> = geprüft als ${_skalB} × ${_skalH} mm
           </div>`
        : `<div style="font-size:10px;color:var(--muted);">automatisch aus PDF-Metadaten ausgelesen</div>`;
      massAnzeige.innerHTML = `
        <div style="background:${massBg};border:1px solid ${massBd};border-radius:7px;
                    padding:8px 12px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">📐</span>
          <div>
            <div style="font-weight:700;font-size:14px;color:${massFarbe};">
              ${massIcon}Dateimaß erkannt: ${_msFaktor !== 1 ? `${_skalB} × ${_skalH} mm` : `${_rawB} × ${_rawH} mm`}
            </div>
            ${massstabHinweis}
          </div>
        </div>`;
      const infoEl = document.getElementById('massstab-info-'+wid);
      if (infoEl && _msFaktor !== 1) {
        infoEl.innerHTML = `PDF-Maß <strong>${_rawB} × ${_rawH} mm</strong> × ${_msFaktor} = <strong style="color:#0c4a6e;">${_skalB} × ${_skalH} mm</strong> (geprüftes Maß)`;
      }
      previewDpi(pid, wid);
    } else {
      massAnzeige.innerHTML = '<div style="background:#f9fafb;border:1px solid var(--line);border-radius:7px;padding:8px 12px;font-size:12px;color:var(--muted);">📐 Dateimaß konnte nicht erkannt werden (kein MediaBox-Eintrag).</div>';
    }
  }

  // ── Prüf-Zeilen aufbauen ───────────────────────────────────────────────────
  let hatEchteWarnung = false;

  const zeilen = (e.pruefung||[]).map(z => {
    let { status, titel, wert, detail } = z;

    // Maße-Zeile: eigener Client-Vergleich überschreibt Server
    const isMassZeile = (titel||'').toLowerCase().includes('maß') ||
                        (titel||'').toLowerCase().includes('abmessung') ||
                        (titel||'').toLowerCase().includes('format') ||
                        (titel||'').toLowerCase().includes('größe');
    if (isMassZeile && vglModal) {
      status = vglModal.stufe === 'ok' ? 'ok' : vglModal.stufe === 'warnung' ? 'warnung' : 'fehler';
      wert   = fmasseStr || wert;
      detail = vglModal.stufe === 'ok'
        ? 'Maße stimmen überein'
        : vglModal.stufe === 'warnung'
        ? `Geringe Abweichung (~${Math.abs(vglModal.dw||0)} mm)`
        : `Abweichung > 20 mm – bitte Datei korrigieren`;
    }

    // DPI-Zeile: Maßstab-Faktor einrechnen
    const isDpiZeile = (titel||'').toLowerCase().includes('dpi') ||
                       (titel||'').toLowerCase().includes('auflösung');
    if (isDpiZeile) {
      const rawDpiMatch = (wert||'').match(/(\d+(?:\.\d+)?)/);
      const rawDpi  = rawDpiMatch ? parseFloat(rawDpiMatch[1]) : null;
      const effDpi  = rawDpi ? Math.round(rawDpi * _msFaktor) : null;
      let dpiStatus = status, dpiWert = wert, dpiDetail = detail || '';
      if (_msFaktor !== 1 && effDpi !== null) {
        dpiStatus = effDpi >= 150 ? 'ok' : effDpi >= 100 ? 'warnung' : 'fehler';
        dpiWert   = `${rawDpi} dpi × ${_msFaktor} = ${effDpi} dpi effektiv`;
        dpiDetail = dpiStatus === 'ok'
          ? `Effektiv ${effDpi} DPI – ausreichend für Großformatdruck`
          : dpiStatus === 'warnung'
          ? `Effektiv ${effDpi} DPI – Auflösung knapp, bitte prüfen`
          : `Effektiv ${effDpi} DPI – zu niedrig für Großformatdruck`;
      }
      if (dpiStatus !== 'ok') hatEchteWarnung = true;
      const dpiIc = dpiStatus === 'ok' ? '✓' : dpiStatus === 'warnung' ? '⚡' : '✖';
      const dpiCl = dpiStatus === 'ok' ? 'var(--green)' : dpiStatus === 'warnung' ? '#92400e' : 'var(--red)';
      const dpiBg = dpiStatus === 'ok' ? 'background:#f0fdf4;' : dpiStatus === 'warnung' ? 'background:#fffbeb;' : 'background:#fef2f2;';
      return `<tr style="${dpiBg}">
        <td style="padding:5px 10px;font-size:12px;color:var(--muted);white-space:nowrap;width:90px;">${titel}</td>
        <td style="padding:5px 10px;font-size:13px;font-weight:700;color:${dpiCl};">${dpiIc} ${dpiWert}</td>
        <td style="padding:5px 10px;font-size:11px;color:#64748b;">${dpiDetail}</td>
      </tr>`;
    }

    if (status === 'warnung' || status === 'fehler') hatEchteWarnung = true;
    const ic = status==='ok'?'✓': status==='warnung'?'⚡':'✖';
    const cl = status==='ok'?'var(--green)': status==='warnung'?'#92400e':'var(--red)';
    const bg = status==='ok'?'': status==='warnung'?'background:#fffbeb;':'background:#fef2f2;';
    return `<tr style="${bg}">
      <td style="padding:5px 10px;font-size:12px;color:var(--muted);white-space:nowrap;width:90px;">${titel}</td>
      <td style="padding:5px 10px;font-size:13px;font-weight:700;color:${cl};">${ic} ${wert}</td>
      <td style="padding:5px 10px;font-size:11px;color:#64748b;">${detail||''}</td>
    </tr>`;
  }).join('');

  // ── Gesamt-Status berechnen (mit skalierten DPI) ───────────────────────────
  const clientPruefung = (e.pruefung||[]).map(z => {
    const t = (z.titel||'').toLowerCase();
    if ((t.includes('maß')||t.includes('abmessung')||t.includes('format')||t.includes('größe')) && vglModal) {
      return { ...z, status: vglModal.stufe === 'ok' ? 'ok' : vglModal.stufe === 'warnung' ? 'warnung' : 'fehler' };
    }
    if ((t.includes('dpi')||t.includes('auflösung')) && _msFaktor !== 1) {
      const m = (z.wert||'').match(/(\d+(?:\.\d+)?)/);
      const raw = m ? parseFloat(m[1]) : null;
      const eff = raw ? Math.round(raw * _msFaktor) : null;
      if (eff !== null) {
        return { ...z, status: eff >= 150 ? 'ok' : eff >= 100 ? 'warnung' : 'fehler' };
      }
    }
    return z;
  });
  const slotModal = clientPruefung.reduce((worst, z) => {
    if (z.status === 'fehler') return 'fehler';
    if (z.status === 'warnung' && worst !== 'fehler') return 'warnung';
    return worst;
  }, 'ok');

  const gesBg   = slotModal === 'ok' ? '#f0fdf4' : slotModal === 'warnung' ? '#fffbeb' : slotModal === 'fehler' ? '#fef2f2' : '#f9fafb';
  const gesBd   = slotModal === 'ok' ? '#86efac' : slotModal === 'warnung' ? '#fde68a' : slotModal === 'fehler' ? '#fecaca' : 'var(--line)';
  const gesCol  = slotModal === 'ok' ? 'var(--green)' : slotModal === 'warnung' ? '#92400e' : slotModal === 'fehler' ? 'var(--red)' : 'var(--muted)';
  const gesIcon = slotModal === 'ok' ? '✓' : slotModal === 'warnung' ? '⚡' : slotModal === 'fehler' ? '✖' : 'ℹ';
  const gesText = slotModal === 'ok' ? 'Datei OK – bereit für Upload'
    : slotModal === 'warnung' ? 'Warnung – bitte prüfen'
    : slotModal === 'fehler' ? 'Datei nicht OK – bitte korrigieren'
    : 'Nicht geprüft';

  if (el) el.innerHTML = `
    <div style="background:${gesBg};border:1px solid ${gesBd};border-radius:8px;padding:8px 12px;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:18px;">${gesIcon}</span>
      <div><div style="font-weight:700;font-size:13px;color:${gesCol};">${gesText}</div>
      <div style="font-size:11px;color:#64748b;">PDF ${e.version||''}${e.istPdfX?' · PDF/X ✓':''}</div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;">
      <thead><tr style="background:#f9fafb;">
        <th style="text-align:left;padding:5px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Check</th>
        <th style="text-align:left;padding:5px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Ergebnis</th>
        <th style="text-align:left;padding:5px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Detail</th>
      </tr></thead><tbody>${zeilen}</tbody>
    </table>
    ${e.empfehlung?`<div style="margin-top:8px;font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;">💡 ${e.empfehlung}</div>`:''}`;

  // ── Button-Sichtbarkeit ────────────────────────────────────────────────────
  const risikoBtn = document.getElementById(`risiko-btn-${wid}`);
  if (slotModal === 'fehler') {
    if (btn) { btn.disabled = true; btn.style.opacity = '0.35'; btn.style.cursor = 'not-allowed'; }
    if (risikoBtn) {
      risikoBtn.style.display = '';
      const wl = (e.pruefung||[]).filter(z=>z.status==='warnung'||z.status==='fehler').map(z=>`${z.titel}: ${z.wert}`).join(' · ');
      risikoBtn.textContent = `⚠ Trotzdem hochladen – auf eigenes Risiko (${wl || 'Fehler vorhanden'})`;
      risikoBtn.title = 'Datei hat Fehler – Upload auf eigenes Risiko';
    }
  } else if (slotModal === 'warnung') {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = ''; btn.textContent = '📤 Hochladen & prüfen'; }
    if (risikoBtn && hatEchteWarnung) {
      risikoBtn.style.display = '';
      const wl = (e.pruefung||[]).filter(z=>z.status==='warnung'||z.status==='fehler').map(z=>`${z.titel}: ${z.wert}`).join(' · ');
      risikoBtn.textContent = `⚠ Trotzdem hochladen – auf eigenes Risiko (${wl || 'Warnungen vorhanden'})`;
      risikoBtn.title = 'Kunde bestätigt: Datei wird trotz Warnungen hochgeladen';
    } else if (risikoBtn) { risikoBtn.style.display = 'none'; }
  } else {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = ''; btn.textContent = '📤 Hochladen & prüfen'; }
    if (risikoBtn) { risikoBtn.style.display = 'none'; }
  }
}
// ─────────────────────────────────────────────────────────────────────────

// ─── Maßstab-Faktor lesen ─────────────────────────────────────────────────
// Gibt numerischen Faktor zurück: 1 | 2 | 5 | 10 | eigener Wert
function getMassstabFaktor(wid) {
  const sel = document.getElementById('massstab-'+wid);
  if (!sel) return 1;
  if (sel.value === 'custom') {
    const v = parseFloat(document.getElementById('massstab-custom-val-'+wid)?.value);
    return (v && v > 0) ? v : 1;
  }
  return parseFloat(sel.value) || 1;
}

// ─── Maßstab geändert → Prüfung neu auswerten ────────────────────────────
function onMassstabGeaendert(pid, wid) {
  const sel = document.getElementById('massstab-'+wid);
  const customBox = document.getElementById('massstab-custom-'+wid);
  if (sel && customBox) {
    customBox.style.display = sel.value === 'custom' ? '' : 'none';
  }
  const faktor = getMassstabFaktor(wid);

  // Info-Zeile aktualisieren
  const infoEl = document.getElementById('massstab-info-'+wid);
  if (infoEl) {
    if (faktor === 1) {
      infoEl.textContent = '';
    } else {
      const btn = getUploadBtn(wid);
      const dm = btn?._dateiMasse;
      if (dm) {
        const skalB = Math.round(dm.breite * faktor);
        const skalH = Math.round(dm.hoehe  * faktor);
        infoEl.innerHTML = `Dateimaß <strong>${dm.breite} × ${dm.hoehe} mm</strong> × ${faktor} = <strong style="color:#0c4a6e;">${skalB} × ${skalH} mm</strong> (geprüftes Maß)`;
      } else {
        infoEl.textContent = `Faktor ×${faktor} – wird nach Analyse angewendet`;
      }
    }
  }

  // Ergebnis neu rendern wenn Datei bereits analysiert ist
  const btn = getUploadBtn(wid);
  if (btn && btn.dataset.analysiert === 'ja' && btn._fontErgebnis) {
    renderUploadErgebnis(pid, wid, btn._fontErgebnis);
  }
}
// ─────────────────────────────────────────────────────────────────────────

async function onDateiAusgewaehlt(pid, wid, input){
  const file = input.files[0];
  if(!file) return;

  const btn = getUploadBtn(wid);
  if(btn){
    btn._datei              = file;
    btn._previewUrl         = null;
    btn._fontErgebnis       = null;
    btn._dateiMasse         = null;
    btn.dataset.analysiert  = 'nein';
    btn.dataset.serverOffline = 'nein';
    btn.disabled            = true;
    btn.textContent         = '⏳ Analysiere…';
  }

  if(file.type.startsWith('image/') && btn){
    const reader = new FileReader();
    reader.onload = ev => { btn._previewUrl = ev.target.result; };
    reader.readAsDataURL(file);
  }

  // PDF-Vorschau mit PDF.js → Canvas → DataURL
  if(file.type === 'application/pdf' && btn){
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      // scale 0.5 → kleine Vorschau ~150-300KB Base64, reicht für Kachelung-SVG
      const viewport = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      btn._previewUrl = canvas.toDataURL('image/jpeg', 0.75);
    } catch(e) {
      console.warn('PDF-Vorschau fehlgeschlagen:', e);
    }
  }

  // Maßstab-Box einblenden
  const massstabBox = document.getElementById('massstab-box-'+wid);
  if(massstabBox) massstabBox.style.display = '';

  const el = document.getElementById('pruef-ergebnis-'+wid);
  if(el) el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:6px 0;">🔍 Analysiere Datei (Maße + Schriften + Farbraum)…</div>';

  try {
    const form = new FormData();
    form.append('datei', file, file.name);
    const res  = await fetch(CALDERA_SERVER+'/pdf/pruefen', {
      method:'POST', body:form, signal:AbortSignal.timeout(15000)
    });
    const data = await res.json();
    if(!data.ok) throw new Error(data.fehler || 'Prüfung fehlgeschlagen');
    const e = data.ergebnis;

    if(btn){
      btn._fontErgebnis       = e;
      btn._dateiMasse         = e.abmessungen
        ? { breite: e.abmessungen.breiteMm, hoehe: e.abmessungen.hoeheMm }
        : null;
      btn.dataset.analysiert  = 'ja';
      btn.dataset.serverOffline = 'nein';
    }

    renderUploadErgebnis(pid, wid, e);
  } catch(err){
    if(btn){
      btn.dataset.analysiert    = 'ja';
      btn.dataset.serverOffline = 'ja';
      btn.disabled              = false;
      btn.textContent           = '📤 Hochladen (ohne Prüfung)';
    }
    const explain = typeof mfExplainError === 'function' ? mfExplainError(err) : (err && err.message);
    if(el) el.innerHTML = `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:9px 13px;font-size:12px;color:#92400e;">
      ⚠ Prüf-Server nicht erreichbar – Datei kann trotzdem als „Nicht geprüft“ hochgeladen werden.<br>
      <span style="font-size:11px;color:var(--muted);">${explain}</span></div>`;
  }
}

function confirmUpload(pid, wid, isRisiko){
  const p0 = getP(pid), w0 = getW(p0, wid);
  const f0 = typeof getAktuelleDatei === 'function' ? getAktuelleDatei(w0) : null;
  if (f0 && typeof istDateiDruckGesperrt === 'function' && istDateiDruckGesperrt(f0.status)) {
    toast('Gesperrt', 'Diese Datei wurde an den Druck übergeben – Ersetzen ist nicht möglich.', 'ty');
    return;
  }
  const btn  = getUploadBtn(wid);
  const file = btn?._datei;
  if(!file){ toast('Fehler','Bitte zuerst eine Datei auswählen'); return; }

  // ── Risiko-Upload: Nutzer hat explizit bestätigt ──────────────────────────
  if (isRisiko) {
    const warnTypen = (btn?._fontErgebnis?.pruefung || [])
      .filter(z => z.status === 'warnung' || z.status === 'fehler')
      .map(z => `${z.titel}: ${z.wert}`).join(' · ');
    const ok = confirm(
      '⚠ Hochladen auf eigenes Risiko\n\n' +
      'Folgende Warnungen wurden erkannt:\n' +
      (warnTypen || '(Warnungen vorhanden)') + '\n\n' +
      'Die Datei wird trotzdem hochgeladen.\n' +
      'Der Auftraggeber bestätigt die Verantwortung für eventuelle Druckprobleme.\n\n' +
      'Trotzdem hochladen?'
    );
    if (!ok) return;
    if (btn) btn._risikoUpload = true;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const fontE         = btn._fontErgebnis   || null;
  const dateiMasse    = btn._dateiMasse      || null;
  const serverOffline = btn.dataset.serverOffline === 'ja';
  const analysiert    = btn.dataset.analysiert    === 'ja';
  const fmasse        = dateiMasse ? `${dateiMasse.breite} × ${dateiMasse.hoehe} mm` : '';
  const fpxB          = null; // Pixel-Felder entfernt
  const fpxH          = null;
  const p=getP(pid), w=getW(p,wid);

  if(!analysiert){
    toast('⏳ Bitte warten','Die Datei wird noch analysiert…','ty');
    return;
  }

  if(!serverOffline && fmasse && w.bestellmass){
    const vgl = vergleicheMasse(w.bestellmass, fmasse);
    if(vgl.stufe==='abweichung'){
      const weiter = confirm(
        '✖ Kritische Maßabweichung\n\n' +
        `Bestellmaß: ${w.bestellmass}\n` +
        `Dateimaß:   ${fmasse}\n\n` +
        'Abweichung > 20 mm – Wand wird als BLOCKIERT gesetzt.\n\n' +
        'Trotzdem hochladen (und Datei später korrigieren)?'
      );
      if(!weiter) return;
    }
  }

  w.dateiMass    = fmasse;
  w.masseOk      = false;
  w.abweichungOk = false;

  w.fontInfo = fontE ? {
    alleEingebettet:  fontE.alleEingebettet,
    nichtEingebettet: fontE.nichtEingebettet || [],
    status:           fontE.status,
    meldung:          fontE.meldung,
    istPdfX:          fontE.istPdfX,
    farbraum:         fontE.farbraum || null,
  } : null;

  if(fpxB && fpxH && w.bestellmass){
    const dpi = berechneDpi(fpxB, fpxH, w.bestellmass);
    w.dpiInfo = dpi ? { ...dpi, px_b:parseFloat(fpxB), px_h:parseFloat(fpxH) } : null;
  } else { w.dpiInfo = null; }

  dateiSpeichern(wid, file);

  w.pruefErgebnis = fontE ? {
    status:     fontE.status,
    pruefung:   fontE.pruefung || null,
    masseStr:   fontE.masseStr || null,
    geprueftAm: new Date().toLocaleTimeString('de-DE'),
  } : null;

  w.dateiPreview = btn._previewUrl || null;

  // Add file to dateien with prüf data
  addFileToWall(pid, wid, {
    name: file.name,
    version: 'v1',
    pruefStatus: fontE ? fontE.status : null,
    pruefDetails: fontE ? fontE.pruefung : null,
    geprueftAm: nowStr(),
    geprueftVonSystem: true,
    // Risiko-Upload: Nutzer hat explizit bestätigt trotz Warnungen
    risikoUpload:   btn?._risikoUpload === true,
    risikoBestaetigt: btn?._risikoUpload === true
      ? `${nowStr()} · ${getCurrentUser()?.name || 'Unbekannt'}`
      : null,
  });
  setAktuellerDateiStatus(pid, wid, DATEI_WORKFLOW.IN_PRUEFUNG);

  syncDateiWorkflowByPruefung(pid, wid);

  // Preview in localStorage sichern — damit Kachelung-Vorschau nach Reload bleibt
  if (typeof mfSaveState === 'function') mfSaveState();

  const warFreigegeben = p.freigegeben;
  checkAutoFreigabe(p);
  const neuFreigegeben = !warFreigegeben && p.freigegeben;

  closeModal();

  if(neuFreigegeben){
    toast('🏭 Produktionsbereit!', `${p.name} – alle Wände druckbereit. Produktionsplan gestartet.`, 'tg');
    pushNotif(p.id, `${p.name} – Automatisch freigegeben. Produktionsplan aktiv.`);
  }

  const statusFeedback = {
    1:{ msg:'Datei fehlt',                        cls:'' },
    2:{ msg:'Bestellmaß fehlt',                   cls:'' },
    8:{ msg:'Nicht geprüft – Server offline',     cls:'ty' },
    3:{ msg:'✓ Maß OK – Freigabe ausstehend',     cls:'tg' },
    7:{ msg:'⚡ Geringe Abweichung – prüfen',     cls:'ty' },
    6:{ msg:'✖ Blockiert – Maße korrigieren',     cls:'ty' },
    5:{ msg:'✓ Druckfertig',                      cls:'tg' },
  };
  const fb = statusFeedback[w.status] || { msg:'Hochgeladen', cls:'' };
  toast(w.name, fb.msg, fb.cls);
  const uploader = getCurrentUser();
  if (uploader && uploader.rolle === 'agentur') {
    mfPushNotifAndEmail(mfNotifIdsCelalMelanie(), pid, `${p.name} – ${w.name}: ${fb.msg} · Upload durch ${uploader.name}`, wid, 'status', 'MesseFlow: Datei-Upload');
  } else {
    pushNotif(pid, `${p.name} – ${w.name}: ${fb.msg}`, wid, 'status');
  }
  if (w.status === 6) {
    mfPushNotifAndEmail(mfNotifIdsAgenturProjekt(p), pid, `${p.name} – ${w.name}: Blockiert – bitte Maße oder Datei korrigieren.`, wid, 'status', 'MesseFlow: Blockierung');
  }
}

// ═══════════════════════════════════════════════════════
// TEMPORÄRER DATEI-SPEICHER
// Dateien liegen im RAM des Browsers (gehen bei Reload verloren).
// Zweck: Datei für "Erneut prüfen" verfügbar halten.
// ═══════════════════════════════════════════════════════
window.DATEI_STORE = {};

function dateiSpeichern(wid, file){
  window.DATEI_STORE[wid] = {
    blob:         file,
    name:         file.name,
    groesseKb:    Math.round(file.size / 1024),
    typ:          file.type,
    gespeichertAm: new Date().toLocaleTimeString('de-DE'),
  };
  const anzahl = Object.keys(window.DATEI_STORE).length;
  const badge  = document.getElementById('speicher-badge');
  if(badge){ badge.textContent=anzahl; badge.style.display=anzahl>0?'flex':'none'; }
}

function dateiLaden(wid){ return window.DATEI_STORE[wid] || null; }

function dateiVorhanden(wid){ return !!window.DATEI_STORE[wid]; }

function dateiLoeschen(wid){
  delete window.DATEI_STORE[wid];
  const anzahl = Object.keys(window.DATEI_STORE).length;
  const badge  = document.getElementById('speicher-badge');
  if(badge){ badge.textContent=anzahl; badge.style.display=anzahl>0?'flex':'none'; }
}

// ═══════════════════════════════════════════════════════
// PROJEKT-TEAM VERWALTUNG
// ═══════════════════════════════════════════════════════
function showAddUserToProjectModal(projId) {
  const userOptions = USERS
    .filter(u => u.aktiv !== false && u.status !== 'gesperrt')
    .map(u => {
      const rolleLabel = ROLES.find(r => r.id === u.rolle)?.label || u.rolle;
      return `<option value="${u.id}">${u.name} (${rolleLabel})</option>`;
    }).join('');

  const rolleOptions = ROLES.map(r => `<option value="${r.id}">${r.label}</option>`).join('');
  const zugriffOptions = ['lesen','bearbeiten','freigeben']
    .map(z => `<option value="${z}">${z.charAt(0).toUpperCase()+z.slice(1)}</option>`).join('');

  openModal('👥 Benutzer zum Projekt hinzufügen', `
    <div class="fg">
      <label>Benutzer</label>
      <select id="add-user-sel" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">
        ${userOptions}
      </select>
    </div>
    <div class="fg">
      <label>Rolle im Projekt</label>
      <select id="add-user-rolle" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;"
        onchange="updatePreisCheckVisibility(this.value)">
        ${rolleOptions}
      </select>
    </div>
    <div class="fg">
      <label>Zugriff</label>
      <select id="add-user-zugriff" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">
        ${zugriffOptions}
      </select>
    </div>
    <div class="fg" id="add-user-preise-row" style="display:flex;align-items:center;gap:8px;">
      <input type="checkbox" id="add-user-preise" style="width:16px;height:16px;">
      <label for="add-user-preise" style="margin:0;cursor:pointer;">Preise sichtbar</label>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:-4px;">Agentur und Kunde dürfen keine Preise sehen.</div>
    <div class="ma" style="margin-top:16px;">
      <button class="btn primary" onclick="confirmAddUserToProject('${projId}')">Hinzufügen</button>
      <button class="btn ghost" onclick="closeModal()">Abbrechen</button>
    </div>
  `);
  updatePreisCheckVisibility(ROLES[0]?.id || 'admin');
}

function updatePreisCheckVisibility(rolle) {
  const row = document.getElementById('add-user-preise-row');
  const cb  = document.getElementById('add-user-preise');
  if (!row || !cb) return;
  if (rolle === 'agentur' || rolle === 'kunde') {
    row.style.opacity = '0.4';
    row.style.pointerEvents = 'none';
    cb.checked = false;
  } else {
    row.style.opacity = '1';
    row.style.pointerEvents = '';
  }
}

function confirmAddUserToProject(projId) {
  const actor = USERS.find(u => u.id === currentUserId);
  if (!actor || (actor.rolle !== 'admin' && actor.rolle !== 'cc_intern')) {
    toast('Keine Berechtigung', 'Nur Administrator oder CC Intern kann Benutzer einem Projekt zuweisen.', 'ty');
    return;
  }
  const pr = typeof getProjRechte === 'function' ? getProjRechte(actor.id, projId) : {};
  if (actor.rolle !== 'admin' && !pr.einladen) {
    toast('Keine Berechtigung', '„Personen einladen“ ist für Sie in diesem Projekt nicht freigeschaltet.', 'ty');
    return;
  }
  const userId  = document.getElementById('add-user-sel').value;
  const rolle   = document.getElementById('add-user-rolle').value;
  const zugriff = document.getElementById('add-user-zugriff').value;
  const preise  = (rolle === 'agentur' || rolle === 'kunde')
    ? false
    : document.getElementById('add-user-preise').checked;

  addUserToProject(projId, userId, rolle, zugriff, preise);
  closeModal();
  const user = USERS.find(u => u.id === userId);
  toast('✓ Hinzugefügt', `${user?.name} wurde dem Projekt zugewiesen.`, 'tg');
  refreshProjectUI();
}

function removeUserFromProjectUI(projId, userId) {
  const actor = USERS.find(u => u.id === currentUserId);
  const pr = typeof getProjRechte === 'function' ? getProjRechte(actor.id, projId) : {};
  if (!actor || (actor.rolle !== 'admin' && !pr.loeschen)) {
    toast('Keine Berechtigung', 'Nur mit Freigabe „Entfernen“ oder als Administrator.', 'ty');
    return;
  }
  const user = USERS.find(u => u.id === userId);
  if (!confirm(`${user?.name} aus dem Projektteam entfernen?`)) return;
  removeUserFromProject(projId, userId);
  refreshProjectUI();
  toast('Entfernt', `${user?.name} wurde aus dem Projekt entfernt.`);
}

// ═══════════════════════════════════════════════════════
// PROJEKT-FIRMENZUORDNUNG (inline, Admin)
// ═══════════════════════════════════════════════════════
function saveProjAgentur(projId, val) {
  updateProjectFirmas(projId, val || null,
    getP(projId)?.zwischenhaendler_id,
    getP(projId)?.produktion_ids || []);
  toast('Gespeichert', 'Agentur aktualisiert', 'tg');
}

function saveProjZH(projId, val) {
  updateProjectFirmas(projId,
    getP(projId)?.agentur_id,
    val || null,
    getP(projId)?.produktion_ids || []);
  toast('Gespeichert', 'Zwischenhändler aktualisiert', 'tg');
}

function toggleProjProduktion(projId, firmaId, checked) {
  const p = getP(projId);
  if (!p) return;
  const ids = [...(p.produktion_ids || [])];
  if (checked && !ids.includes(firmaId)) ids.push(firmaId);
  if (!checked) ids.splice(ids.indexOf(firmaId), 1);
  updateProjectFirmas(projId, p.agentur_id, p.zwischenhaendler_id, ids);
  refreshProjectUI();
}

// Zeigt gespeicherte Dateien im Test-Modus Modal
function zeigeTestmodusInfo(){
  const eintraege = Object.entries(window.DATEI_STORE);
  if(!eintraege.length){ toast('Speicher leer','Keine Dateien im temporären Speicher'); return; }
  const liste = eintraege.map(([wid, d]) =>
    `<div style="padding:5px 0;border-bottom:1px solid var(--line);font-size:12px;">
      <strong>${d.name}</strong><br>
      <span style="color:var(--muted);">${d.groesseKb} KB · ${d.typ||'unbekannt'} · gespeichert ${d.gespeichertAm}</span>
    </div>`
  ).join('');
  openModal('🧪 Temporärer Speicher', `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 13px;margin-bottom:12px;font-size:12px;color:#92400e;">
      Dateien liegen im RAM. Bei Seiten-Reload gehen sie verloren.
    </div>
    <div style="max-height:240px;overflow-y:auto;">${liste}</div>
    <div style="font-size:11px;color:var(--muted);margin-top:10px;">
      ${eintraege.length} Datei${eintraege.length!==1?'en':''} · Speicher wird beim Schließen des Tabs geleert
    </div>
    <div class="ma" style="margin-top:12px;">
      <button class="btn ghost sm" onclick="closeModal()">Schließen</button>
    </div>`);
}

// Gespeicherte Datei erneut prüfen (ohne Modal neu öffnen)
async function dateiNochmalPruefen(pid, wid){
  const p = getP(pid), w = getW(p,wid);
  const fCh = typeof getAktuelleDatei === 'function' ? getAktuelleDatei(w) : null;
  if (fCh && typeof istDateiDruckGesperrt === 'function' && istDateiDruckGesperrt(fCh.status)) {
    toast('Gesperrt', 'Datei ist im Druck – erneute Prüfung ist nicht möglich.', 'ty');
    return;
  }
  const gespeichert = dateiLaden(wid);
  if(!gespeichert){ toast('Fehler','Datei nicht im Speicher – bitte erneut hochladen'); return; }
  const btn = document.getElementById(`repruefen-${wid}`);
  if(btn){ btn.disabled=true; btn.textContent='⏳ Prüfe…'; }

  try {
    const form = new FormData();
    form.append('datei', gespeichert.blob, gespeichert.name);
    const res  = await fetch(`${CALDERA_SERVER}/pdf/pruefen`, {
      method:'POST', body:form,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if(!data.ok) throw new Error(data.fehler);
    const e = data.ergebnis;

    w.pruefErgebnis = {
      status:      e.status,
      pruefung:    e.pruefung,
      masseStr:    e.masseStr,
      geprueftAm:  new Date().toLocaleTimeString('de-DE'),
    };
    if(e.abmessungen){
      w.dateiMass = `${e.abmessungen.breiteMm} × ${e.abmessungen.hoeheMm} mm`;
    }
    w.fontInfo = {
      alleEingebettet:  e.alleEingebettet,
      nichtEingebettet: e.nichtEingebettet || [],
      status:           e.status,
      meldung:          e.meldung,
      istPdfX:          e.istPdfX,
      farbraum:         e.farbraum || null,
    };

    recalc(w);
    syncDateiWorkflowByPruefung(pid, wid);
    const vglN = (w.bestellmass && w.dateiMass) ? vergleicheMasse(w.bestellmass, w.dateiMass) : null;
    const slotN = effektivePruefSlot(w, vglN);
    renderSidebar(); renderView();
    toast('🔍 Erneut geprüft', `${w.name}: ${slotN==='ok'?'✓ OK':slotN==='warnung'?'⚡ Warnung':'✖ Nicht OK'}`,
      slotN==='ok'?'tg':'ty');
    if(btn){ btn.disabled=false; btn.textContent='🔍 Erneut prüfen'; }

  } catch(err){
    toast('Prüfung fehlgeschlagen', err.message, 'ty');
    if(btn){ btn.disabled=false; btn.textContent='🔍 Erneut prüfen'; }
  }
}

// Live-DPI-Vorschau im Upload-Modal
function previewDpi(pid, wid){
  const w   = getW(getP(pid), wid);
  const b   = null; // Pixel-Felder entfernt
  const h   = null;
  const el  = document.getElementById('dpi-preview');
  if(!el) return;

  // Pixel-Felder entfernt → kein DPI-Preview
  if(!b || !h){
    el.innerHTML = '';
    return;
  }

  const mass = document.getElementById('fm')?.value || w.bestellmass;
  const dpi  = berechneDpi(b, h, mass);
  if(!dpi){
    el.innerHTML = '<span style="font-size:12px;color:var(--muted);">Auflösung: – (Maß wird für DPI benötigt)</span>';
    return;
  }

  const bg = dpi.stufe==='ok' ? 'var(--sg)' : dpi.stufe==='warnung' ? 'var(--sy)' : 'var(--sr)';
  const bd = dpi.stufe==='ok' ? '#86efac'   : dpi.stufe==='warnung' ? '#fde68a'   : '#fecaca';
  el.innerHTML = `<div style="background:${bg};border:1px solid ${bd};border-radius:7px;padding:8px 12px;font-size:13px;font-weight:700;color:${dpi.color};">
    ${dpi.label}
    <span style="font-size:11px;font-weight:400;color:inherit;margin-left:8px;">(B: ${dpi.dpi_b} DPI · H: ${dpi.dpi_h} DPI)</span>
  </div>`;

  // Wenn DPI zu niedrig → Risiko-Button einblenden (Rasterbilder mit schlechter Auflösung)
  if(dpi.stufe === 'warnung' || dpi.stufe === 'blockiert'){
    const risikoBtn = document.getElementById(`risiko-btn-${wid}`);
    if(risikoBtn) risikoBtn.style.display = '';
  }
}
function saveBestellmass(pid,wid,val){
  const p=getP(pid), w=getW(p,wid);
  w.bestellmass=val.trim();
  w.masseOk=false;
  w.abweichungOk=false;
  recalc(w);
  renderSidebar(); renderView();
}

// Norbert: Dateimaß eingeben (gemessen aus Datei/Upload)
function saveDateiMass(pid,wid,val){
  const p=getP(pid), w=getW(p,wid);
  w.dateiMass=val.trim();
  w.masseOk=false;
  w.abweichungOk=false;
  recalc(w);
  // Sofort prüfen und Hinweis geben
  if(w.status===6){
    toast('⚠ Abweichung',`${w.name}: Dateimaß weicht vom Bestellmaß ab`,'ty');
  }
  renderSidebar(); renderView();
}

// Norbert: Zurück an Agentur (bei kritischer Abweichung oder Warnung die nicht akzeptiert wird)
function zurückAnAgentur(pid,wid){
  openModal('Zurück an Agentur',`
    <div style="background:var(--sr);border:1px solid #fecaca;border-radius:8px;padding:11px 13px;margin-bottom:13px;">
      <div style="font-weight:700;color:var(--red);margin-bottom:3px;">Datei wird abgelehnt</div>
      <div id="zaa-info" style="font-size:13px;color:#7f1d1d;"></div>
    </div>
    <div class="fg"><label>Hinweis an Agentur (optional)</label>
      <textarea id="zaa-txt" placeholder="z.B. Breite muss genau 400 cm sein…"></textarea>
    </div>
    <div class="ma">
      <button class="btn sm" style="background:var(--sr);color:var(--red);border-color:#fecaca;"
        onclick="confirmZurück('${pid}','${wid}')">↩ Zurück an Agentur senden</button>
      <button class="btn ghost sm" onclick="closeModal()">Abbrechen</button>
    </div>`);
  const p=getP(pid), w=getW(p,wid);
  const vgl = vergleicheMasse(w.bestellmass, w.dateiMass);
  setTimeout(()=>{
    const el=document.getElementById('zaa-info');
    if(el) el.innerHTML=`Bestellmaß: <strong>${w.bestellmass}</strong> &nbsp;·&nbsp; Dateimaß: <strong>${w.dateiMass}</strong>${vgl&&vgl.maxDiff!==null?' &nbsp;·&nbsp; Δ max <strong>'+fmm(vgl.maxDiff)+'</strong>':''}`;
  },50);
}

function confirmZurück(pid,wid){
  const txt=document.getElementById('zaa-txt').value.trim();
  const p=getP(pid), w=getW(p,wid);
  w.datei=null; w.dateiMass=''; w.masseOk=false; w.abweichungOk=false;
  recalc(w);
  closeModal(); renderSidebar(); renderView();
  toast('↩ Zurück an Agentur',`${w.name} – neue Datei angefordert`,'ty');
  pushNotif(pid,`${p.name} – ${w.name}: Zurück an Agentur${txt?' – '+txt:''}`);
}

// Norbert: Maße bestätigen (nach erfolgreichem Abgleich)
function masseBestätigen(pid,wid){
  const p=getP(pid), w=getW(p,wid);
  if(!w.bestellmass||!w.bestellmass.trim()){ toast('Fehler','Bitte Bestellmaß eintragen'); return; }
  w.masseOk=true;
  recalc(w);
  const warFreigegeben2 = p.freigegeben;
  checkAutoFreigabe(p);
  if(!warFreigegeben2 && p.freigegeben){
    toast('🏭 Produktionsbereit!', `${p.name} – alle Wände druckbereit`, 'tg');
    pushNotif(p.id, `${p.name} – Automatisch freigegeben`);
  }
  renderSidebar(); renderView();
  toast('Maße bestätigt',`${w.name} → Grafikprüfung`,'tg');
  pushNotif(pid,`${p.name} – ${w.name}: Maße bestätigt → Grafikprüfung`);
}

// Melanie: Fehler melden
function fehlerMelden(pid,wid){
  openModal('Fehler melden',`
    <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">Was stimmt nicht? Kurze Beschreibung für die Agentur:</p>
    <div class="fg"><label>Fehlerbeschreibung</label><textarea id="fe" placeholder="z.B. Beschnitt fehlt, Auflösung zu gering…"></textarea></div>
    <div class="ma">
      <button class="btn" style="background:var(--sr);color:var(--red);border-color:#fecaca;" onclick="confirmFehler('${pid}','${wid}')">⚠ Fehler melden</button>
      <button class="btn ghost" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

function confirmFehler(pid,wid){
  const txt=document.getElementById('fe').value.trim();
  const p=getP(pid), w=getW(p,wid);
  w.status=2; // zurück zu "Datei da" — Agentur muss neu hochladen
  closeModal(); renderSidebar(); renderView();
  toast('Fehler gemeldet',`${w.name} – Agentur wird informiert`,'ty');
  pushNotif(pid,`${p.name} – ${w.name}: Fehler gemeldet${txt?': '+txt:''}`);
}

// ═══════════════════════════════════════════════════════
// NEW PROJECT
// ═══════════════════════════════════════════════════════

// Temporäre Positions-Liste im Modal
let _npPositionen = [];

function npOnAgenturFirmaChange(){
  const zhSel = document.getElementById('np-zh');
  if (zhSel) zhSel.value = '';
}

function openNewProjModal(){
  const me = USERS.find(u => u.id === currentUserId);
  if (!me || (me.rolle !== 'admin' && me.rolle !== 'cc_intern' && me.rolle !== 'zwischenhaendler')) {
    toast('Keine Berechtigung', 'Nur Administrator, CC Intern oder Zwischenhändler können ein neues Projekt anlegen.', 'ty');
    return;
  }
  _npPositionen = [{ id: 1, name:'Wand A', breite:'', hoehe:'', menge:1, einheit:'mm', material:'', bemerkung:'' }];

  const agenturOpts = FIRMS.filter(f => f.typ === 'agentur')
    .map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  const zhOpts = `<option value="">– keiner / aus Firma –</option>` +
    USERS.filter(u => u.rolle === 'zwischenhaendler' && u.aktiv !== false)
    .map(u => `<option value="${u.id}">${u.name}</option>`).join('');

  const sel = (id, opts, ph='') =>
    `<select id="${id}" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">${opts}</select>`;
  const inp = (id, ph, type='text', val='') =>
    `<input id="${id}" type="${type}" placeholder="${ph}" value="${val}"
      style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">`;
  const row2 = (a, b) =>
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${a}${b}</div>`;
  const fg = (label, html, req='') =>
    `<div class="fg" style="margin-bottom:10px;"><label style="font-size:12px;">${label}${req?'<span style="color:var(--red);"> *</span>':''}</label>${html}</div>`;

  const prioOpts   = ['Normal','Hoch','Dringend'].map(s=>`<option>${s}</option>`).join('');
  const einheitOpts = ['mm','cm','m'].map(s=>`<option>${s}</option>`).join('');
  const materialOpts = ['','Stoff/Keder','Digitaldruck/Plot','PVC-Plane','Forex/Platte','Acryl','Sonstiges']
    .map(s=>`<option value="${s}">${s||'– wählen –'}</option>`).join('');

  const html =
    `<div style="max-height:72vh;overflow-y:auto;padding-right:4px;">` +

    `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;` +
    `color:var(--muted);margin:0 0 10px;padding-bottom:5px;border-bottom:1px solid var(--line);">Grunddaten</div>` +

    row2(fg('Projektname', inp('np-n','z.B. NRW Bank – Messe Frankfurt'), true),
         fg('Auftraggeber / Kunde', inp('np-k','z.B. AutoCorp GmbH'), true)) +

    row2(fg('Bestelldatum', inp('np-bestell','', 'date', new Date().toISOString().slice(0,10))),
         fg('Lieferdatum / Deadline', inp('np-d','', 'date'), true)) +

    row2(fg('Agentur (Firma)', `<select id="np-agentur" onchange="npOnAgenturFirmaChange()"
          style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">`+
          `<option value="">– Firma wählen –</option>${agenturOpts}</select>`, true),
         fg('Zwischenhändler (optional)', sel('np-zh', zhOpts)+
         `<div style="font-size:10px;color:var(--muted);margin-top:4px;">Nur bei Bedarf wählen – keine automatische Vorgabe (außer Excel-Import).</div>`)) +

    row2(fg('Ansprechpartner', inp('np-ap','z.B. Max Mustermann')),
         fg('Messe / Standort', inp('np-messe','z.B. Messe München'))) +

    row2(fg('Halle / Stand', inp('np-stand','z.B. Halle B1 / Stand 42')),
         fg('Bemerkung', inp('np-bem','interne Notiz'))) +

    `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;` +
    `color:var(--muted);margin:14px 0 10px;padding-bottom:5px;border-bottom:1px solid var(--line);">Kaufmännisches</div>` +

    row2(fg('Angebotsnummer / Referenz', inp('np-anr','z.B. A-2025-042')),
         fg('Auftragswert (€)', inp('np-wert','0.00','number'))) +

    fg('Priorität', sel('np-prio', prioOpts)) +

    `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;` +
    `color:var(--muted);margin:14px 0 10px;padding-bottom:5px;border-bottom:1px solid var(--line);">` +
    `Positionen / W\u00e4nde <span style="color:var(--red);">*</span></div>` +

    `<div id="np-pos-list"></div>` +
    `<button class="btn ghost sm" onclick="npAddPosition()" style="margin-top:6px;width:100%;border-style:dashed;">+ Position hinzuf\u00fcgen</button>` +

    `</div>` +

    `<div class="ma" style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px;">` +
    `<button class="btn primary" onclick="confirmNewProj()">Projekt anlegen</button>` +
    `<button class="btn ghost" onclick="closeModal()">Abbrechen</button>` +
    `<span style="font-size:11px;color:var(--muted);margin-left:auto;">* Pflichtfeld</span>` +
    `</div>`;

  openModal('Neues Projekt', html, true);

  npRenderPositionen();
}

function npRenderPositionen() {
  const el = document.getElementById('np-pos-list');
  if (!el) return;
  const einheitOpts = (sel) => ['mm','cm','m'].map(e=>`<option ${e===sel?'selected':''}>${e}</option>`).join('');
  const materialOpts = (sel) => ['','Stoff/Keder','Digitaldruck/Plot','PVC-Plane','Forex/Platte','Acryl','Sonstiges']
    .map(m=>`<option value="${m}" ${m===sel?'selected':''}>${m||'– Material –'}</option>`).join('');

  el.innerHTML = _npPositionen.map((pos, i) => `
    <div style="background:#f9fafb;border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:700;color:var(--muted);">#${i+1}</span>
        <input type="text" value="${pos.name}" placeholder="Bezeichnung z.B. Wand A"
          onchange="_npPositionen[${i}].name=this.value"
          style="flex:1;padding:6px 9px;border:1px solid var(--line);border-radius:6px;font-size:13px;font-weight:600;">
        ${_npPositionen.length > 1
          ? `<button class="btn ghost sm" style="color:var(--red);font-size:11px;"
              onclick="_npPositionen.splice(${i},1);npRenderPositionen()">✕</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 60px 80px 1fr;gap:7px;align-items:end;">
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Breite</div>
          <input type="number" min="1" value="${pos.breite}" placeholder="z.B. 3000"
            onchange="_npPositionen[${i}].breite=this.value"
            style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:13px;">
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Höhe</div>
          <input type="number" min="1" value="${pos.hoehe}" placeholder="z.B. 2500"
            onchange="_npPositionen[${i}].hoehe=this.value"
            style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:13px;">
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Menge</div>
          <input type="number" min="1" value="${pos.menge}"
            onchange="_npPositionen[${i}].menge=parseInt(this.value)||1"
            style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:13px;">
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Einheit</div>
          <select onchange="_npPositionen[${i}].einheit=this.value"
            style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:13px;">
            ${einheitOpts(pos.einheit)}
          </select>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Material</div>
          <select onchange="_npPositionen[${i}].material=this.value"
            style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:13px;">
            ${materialOpts(pos.material)}
          </select>
        </div>
      </div>
      <div style="margin-top:7px;">
        <input type="text" value="${pos.bemerkung}" placeholder="Bemerkung (optional)"
          onchange="_npPositionen[${i}].bemerkung=this.value"
          style="width:100%;padding:5px 9px;border:1px solid var(--line);border-radius:6px;font-size:12px;color:var(--muted);">
      </div>
    </div>
  `).join('');
}

function npAddPosition() {
  _npPositionen.push({
    id: Date.now(), name:'', breite:'', hoehe:'', menge:1, einheit:'mm', material:'', bemerkung:''
  });
  npRenderPositionen();
  // Scroll zur neuen Position
  const list = document.getElementById('np-pos-list');
  if (list) list.lastElementChild?.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function confirmNewProj(){
  const me = USERS.find(u => u.id === currentUserId);
  if (!me || (me.rolle !== 'admin' && me.rolle !== 'cc_intern' && me.rolle !== 'zwischenhaendler')) {
    toast('Keine Berechtigung', 'Nur Administrator, CC Intern oder Zwischenhändler können ein neues Projekt anlegen.', 'ty');
    return;
  }
  const name  = document.getElementById('np-n')?.value.trim();
  const kunde = document.getElementById('np-k')?.value.trim();
  const dl    = document.getElementById('np-d')?.value;
  if (!name)  { toast('Fehler','Bitte Projektname eingeben'); return; }
  if (!kunde) { toast('Fehler','Bitte Kunde/Auftraggeber eingeben'); return; }
  if (!dl)    { toast('Fehler','Bitte Lieferdatum angeben'); return; }

  const valPos = _npPositionen.filter(p => p.name.trim());
  if (!valPos.length) { toast('Fehler','Mindestens eine Position mit Bezeichnung angeben'); return; }

  // Wände aus Positionen bauen (gleiche Struktur wie Excel-Import)
  const waende = valPos.map((pos, i) => {
    const b = parseFloat(pos.breite) || 0;
    const h = parseFloat(pos.hoehe)  || 0;
    const bestellmass = (b && h) ? `${b} × ${h} ${pos.einheit}` : '';
    return {
      id: 'w' + Date.now() + i,
      name: pos.name.trim(),
      datei: null, dateien: [],
      bestellmass,
      dateiMass: '', masseOk: false, abweichungOk: false, status: 1,
      menge: pos.menge || 1,
      einheit: pos.einheit,
      material: pos.material,
      bemerkung: pos.bemerkung,
    };
  });

  const agenturFirmaId = document.getElementById('np-agentur')?.value?.trim() || '';
  if (!agenturFirmaId) { toast('Fehler','Bitte Agentur-Firma wählen – das Projektteam wird daraus gebildet.'); return; }
  const zhOverride = document.getElementById('np-zh')?.value?.trim() || null;
  const wert      = parseFloat(document.getElementById('np-wert')?.value) || null;

  const newP = {
    id:    'p' + Date.now(),
    name,
    kunde,
    deadline: dl,
    status:   'Neu',
    prioritaet: document.getElementById('np-prio')?.value || 'Normal',
    waende,
    auftragsInfo: {
      bestelldatum:    document.getElementById('np-bestell')?.value || new Date().toISOString().slice(0,10),
      liefertermin:    dl,
      kunde,
      projektname:     name,
      ansprechpartner: document.getElementById('np-ap')?.value.trim() || '',
      messe:           document.getElementById('np-messe')?.value.trim() || '',
      stand:           document.getElementById('np-stand')?.value.trim() || '',
      bemerkung:       document.getElementById('np-bem')?.value.trim() || '',
      angebotsnummer:  document.getElementById('np-anr')?.value.trim() || '',
      _importiert:     new Date().toLocaleString('de-DE'),
    },
    finanz: {
      preis: wert,
      provisionBettina: null,
      rechnung: null,
      marge: null,
      interneNotizen: null,
    },
    hauptFirma: agenturFirmaId,
  };

  applyStandardZuweisungen(newP, agenturFirmaId, zhOverride);
  MesseFlowState.projects.push(newP);
  if (typeof mfAudit === 'function') {
    mfAudit({ action: 'projekt_angelegt', projectId: newP.id, meta: { name } });
  }
  closeModal();
  renderSidebar();
  selectProj(newP.id);
  toast('Projekt angelegt', name, 'tg');
}

// ═══════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════
// pushNotif — erweitert: optional wid für direktes Springen zur Wand
// type: 'info' | 'comment' | 'status'
function notifVisibleForCurrent(n) {
  if (!n.forUserIds || !n.forUserIds.length) return true;
  return n.forUserIds.includes(currentUserId);
}

function pushNotif(projId, text, wid=null, type='info', forUserIds=null){
  MesseFlowState.notifs.unshift({
    id:   'n'+Date.now(),
    proj: projId,
    wid:  wid || null,
    type: type,
    text,
    time: 'gerade eben',
    read: false,
    forUserIds: forUserIds && forUserIds.length ? forUserIds : null,
  });
  updateBadge(); renderNotifs();
}

function renderNotifs(){
  const el=document.getElementById('notif-list');
  const vis = MesseFlowState.notifs.filter(notifVisibleForCurrent);
  if(!vis.length){ el.innerHTML='<div class="n-empty">Keine Benachrichtigungen</div>'; return; }
  el.innerHTML=vis.slice(0,30).map(n=>{
    const icon = n.type==='comment' ? '💬' : n.type==='status' ? '🔔' : '📋';
    return `<div class="ni${n.read?'':' unread'}" onclick="openNotif('${n.id}')">
      <div class="ni-t">${icon} MesseFlow</div>
      <div class="ni-b">${n.text}</div>
      <div class="ni-d">${n.time}</div>
    </div>`;
  }).join('');
}

function updateBadge(){
  const b=document.getElementById('notif-badge');
  const c=MesseFlowState.notifs.filter(n=>notifVisibleForCurrent(n)&&!n.read).length;
  b.textContent=c; b.style.display=c>0?'flex':'none';
}

function toggleNotif(){
  notifOpen=!notifOpen;
  document.getElementById('notif-panel').classList.toggle('open',notifOpen);
  if(notifOpen) renderNotifs();
}

function openNotif(id){
  const n=MesseFlowState.notifs.find(x=>x.id===id);
  if(!n) return;
  n.read=true; updateBadge(); toggleNotif();
  if(n.proj){
    const user = getCurrentUser();
    const proj = MesseFlowState.projects.find(p => p.id === n.proj);
    if(!proj || !canSeeProject(user, proj)) return;
    activeProjId=n.proj;
    renderSidebar(); renderView();
    // Wenn Wand-ID vorhanden: nach kurzem Timeout zur Wand scrollen + hervorheben
    if(n.wid){
      setTimeout(()=>{
        const el=document.getElementById('wand-'+n.wid);
        if(el){
          el.scrollIntoView({behavior:'smooth',block:'center'});
          el.style.transition='box-shadow .3s';
          el.style.boxShadow='0 0 0 3px #3b82f6';
          setTimeout(()=>{ el.style.boxShadow=''; }, 2500);
          // Kommentarfeld fokussieren wenn vorhanden
          const ka=el.querySelector('.kommentar-anzeige');
          if(ka) ka.style.display='block';
        }
      }, 120);
    }
  }
}

function markAllRead(){ MesseFlowState.notifs.forEach(n=>{ if(notifVisibleForCurrent(n)) n.read=true; }); updateBadge(); renderNotifs(); }
// ═══════════════════════════════════════════════════════
// KOMMENTAR-SYSTEM
// ═══════════════════════════════════════════════════════
// Kommentar-Objekt: { id, autor, text, zeit, wid? }
// Gespeichert in p.kommentare[] (Projekt) und w.kommentare[] (Wand)

const ROLLEN_LABEL = {
  admin:            'Administrator',
  cc_intern:        'CC Intern',
  zwischenhaendler: 'Zwischenhändler',
  agentur:          'Agentur',
  produktion:       'Produktion',
};

// Neuen Kommentar auf Projekt-Ebene speichern
function addProjKommentar(pid){
  if (typeof getProjRechte === 'function' && !getProjRechte(currentUserId, pid).kommentieren) {
    toast('Keine Berechtigung', 'Kommentieren ist in diesem Projekt nicht freigeschaltet.', 'ty');
    return;
  }
  const ta = document.getElementById(`pk-input-${pid}`);
  const text = ta?.value.trim();
  if(!text) return;
  const p = getP(pid);
  if(!p.kommentare) p.kommentare = [];
  const autor = ROLLEN_LABEL[role] || role;
  const k = { id:'k'+Date.now(), autor, text, zeit: nowStr() };
  p.kommentare.unshift(k);
  ta.value = '';
  // Benachrichtigung für alle anderen Rollen
  pushNotif(pid, `${p.name}: Neuer Projektkommentar von ${autor}`, null, 'comment');
  renderView();
}

// Neuen Kommentar auf Wand-Ebene speichern
function addWandKommentar(pid, wid){
  if (typeof getProjRechte === 'function' && !getProjRechte(currentUserId, pid).kommentieren) {
    toast('Keine Berechtigung', 'Kommentieren ist in diesem Projekt nicht freigeschaltet.', 'ty');
    return;
  }
  const ta = document.getElementById(`wk-input-${wid}`);
  const text = ta?.value.trim();
  if(!text) return;
  const p = getP(pid), w = getW(p,wid);
  if(!w.kommentare) w.kommentare = [];
  const autor = ROLLEN_LABEL[role] || role;
  const k = { id:'k'+Date.now(), autor, text, zeit: nowStr() };
  w.kommentare.unshift(k);
  ta.value = '';
  // Benachrichtigung mit wid für direktes Springen
  pushNotif(pid, `${p.name} – ${w.name}: Neuer Kommentar von ${autor}`, wid, 'comment');
  renderView();
}

// Kommentar-Block für eine Wand rendern
function buildWandKommentare(p, w){
  const kList = (w.kommentare||[]).slice(0,10);
  const anzahl = w.kommentare?.length || 0;
  const darfKom = typeof getProjRechte === 'function' ? !!getProjRechte(currentUserId, p.id).kommentieren : true;

  const kHTML = kList.map(k => `
    <div style="padding:7px 0;border-bottom:1px solid var(--line);last-child:border:none;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
        <span style="font-size:12px;font-weight:700;color:var(--blue);">${k.autor}</span>
        <span style="font-size:10px;color:var(--muted);">${k.zeit}</span>
      </div>
      <div style="font-size:13px;color:#374151;line-height:1.4;">${k.text}</div>
    </div>`).join('');

  return `
    <div id="wand-kommentare-${w.id}" style="border-top:1px solid var(--line);padding:10px 16px;background:#fafafa;">
      <details ${anzahl>0?'open':''}>
        <summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--muted);list-style:none;display:flex;align-items:center;gap:6px;padding:2px 0;">
          <span>💬 Kommentare</span>
          ${anzahl>0?`<span style="background:#3b82f6;color:#fff;font-size:10px;padding:1px 6px;border-radius:999px;">${anzahl}</span>`:''}
        </summary>
        <div style="margin-top:8px;">
          ${kList.length ? `<div style="margin-bottom:8px;">${kHTML}</div>` : '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Noch keine Kommentare.</div>'}
          ${darfKom ? `<div style="display:flex;gap:6px;align-items:flex-end;">
            <textarea id="wk-input-${w.id}"
              placeholder="Kommentar schreiben…"
              rows="2"
              style="flex:1;padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-size:13px;resize:vertical;font-family:inherit;"
              onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){addWandKommentar('${p.id}','${w.id}');event.preventDefault();}"></textarea>
            <button class="btn primary sm" onclick="addWandKommentar('${p.id}','${w.id}')">Senden</button>
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:3px;">Tipp: Strg+Enter zum Senden</div>` : '<div style="font-size:11px;color:var(--muted);">Kommentieren nicht freigeschaltet.</div>'}
        </div>
      </details>
    </div>`;
}


document.addEventListener('click',e=>{
  if(notifOpen&&!document.getElementById('notif-panel').contains(e.target)
     &&!document.getElementById('notif-btn').contains(e.target)){
    notifOpen=false; document.getElementById('notif-panel').classList.remove('open');
  }
});

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
function messeflowNormalBoot(preferredUserId) {
  if (typeof mfAuditInit === 'function') mfAuditInit();
  MesseFlowState.projects.forEach(p => p.waende.forEach(w => recalc(w)));
  setUser(preferredUserId || 'u_celal');
  renderSidebar();
  updateBadge();
  const u = getCurrentUser();
  const first = MesseFlowState.projects.find(p => canSeeProject(u, p));
  if (first) selectProj(first.id);
  else {
    activeProjId = null;
    const view = document.getElementById('view');
    if (view) {
      const isInternalRole = (role === 'admin' || role === 'cc_intern');
      view.innerHTML = isInternalRole
        ? `<div style="color:var(--muted);text-align:center;padding:60px 0;font-size:15px;">← Kein Projekt vorhanden – legen Sie links ein neues Projekt an oder importieren Sie Excel.</div>`
        : `<div style="color:var(--muted);text-align:center;padding:60px 0;font-size:15px;">Bitte warten – Ihnen wird ein Projekt zugewiesen.</div>`;
    }
  }
  checkServerStatus();
  mfRunDeadlineWarnings();
  if (typeof refreshRoleSelVisibility === 'function') refreshRoleSelVisibility();

  // ── Test-Modus: Badge + Benutzer-Schnellwechsler einschalten ──
  if (window.MF_TEST_MODE === true) {
    const badge = document.getElementById('testmodus-badge');
    if (badge) {
      badge.style.display = '';
      badge.title = '🧪 Test-Modus: alle Rechte freigegeben · Sperren deaktiviert · Benutzer wechselbar';
      badge.textContent = '🧪 TEST-MODUS';
    }
    const sel = document.getElementById('role-sel');
    if (sel) {
      sel.style.display = '';
      refreshUserDropdown(); // Dropdown mit allen Benutzern befüllen
    }
  }
}

// ── Test-Modus: sofort beim Seitenstart zeigen (vor Login) ──────────────
(function mfTestModeEarlyInit() {
  if (window.MF_TEST_MODE !== true) return;
  // Badge sofort einblenden
  const badge = document.getElementById('testmodus-badge');
  if (badge) {
    badge.style.display = '';
    badge.style.background = '#fef3c7';
    badge.style.border = '1px solid #f59e0b';
    badge.style.color = '#92400e';
    badge.style.fontWeight = '700';
    badge.style.fontSize = '11px';
    badge.style.padding = '3px 9px';
    badge.style.borderRadius = '6px';
    badge.style.cursor = 'default';
    badge.textContent = '🧪 TEST-MODUS';
    badge.title = 'Alle Rechte freigegeben · Sperren deaktiviert · Benutzer wechselbar';
    badge.onclick = null; // kein Datei-Store-Info im Testmodus-Badge
  }
  // Schnellwechsler sofort einblenden (Inhalt kommt nach Login via refreshUserDropdown)
  const sel = document.getElementById('role-sel');
  if (sel) sel.style.display = '';
})();

(function messeflowEntry() {
  const params = new URLSearchParams(window.location.search);
  const oldInvite = params.get('invite');
  const token = params.get('einladung');
  const resetTok = params.get('passwort-reset');
  const magicLogin = params.get('magic-login');

  if (resetTok) {
    mfSetMainChromeVisible(false);
    mfShowLoginGate(true);
    void runMfPasswordResetSetup(resetTok);
    return;
  }

  if (magicLogin) {
    mfSetMainChromeVisible(false);
    document.getElementById('mf-invite-gate').style.display = 'block';
    void runMfMagicLoginSetup(magicLogin);
    return;
  }

  if (oldInvite) {
    mfSetMainChromeVisible(false);
    document.getElementById('mf-invite-gate').style.display = 'block';
    renderMfInviteError(
      'Link ungültig',
      'Alte Einladungslinks (?invite=…) werden nicht mehr unterstützt. Bitte neuen Token-Link von der Administration anfordern.'
    );
    return;
  }

  if (token) {
    mfSetMainChromeVisible(false);
    document.getElementById('mf-invite-gate').style.display = 'block';
    void runMfInviteSetup(token);
    return;
  }

  // ── TEST-MODUS: Kein Login nötig – direkt booten ────────────────────────
  if (window.MF_TEST_MODE === true) {
    mfShowLoginGate(false);
    mfSetMainChromeVisible(true);
    const sess0 = typeof mfGetSession === 'function' ? mfGetSession() : null;
    messeflowNormalBoot((sess0 && sess0.userId) || 'u_celal');
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const sess = typeof mfGetSession === 'function' ? mfGetSession() : null;
  if (!sess || !sess.userId) {
    mfSetMainChromeVisible(false);
    mfShowLoginGate(true);
    renderMfLoginForm('');
    return;
  }
  const su = USERS.find(u => u.id === sess.userId);
  const gate = typeof mfUserKannSichAnmelden === 'function' ? mfUserKannSichAnmelden(su) : { ok: !!su };
  if (!gate.ok) {
    mfClearSession();
    mfSetMainChromeVisible(false);
    mfShowLoginGate(true);
    renderMfLoginForm(mfLoginErrorDeutsch ? mfLoginErrorDeutsch(gate.reason) : 'Bitte erneut anmelden.');
    return;
  }

  messeflowNormalBoot(sess.userId);
})();

// ════════════════════════════════════════════════════════════════════════════
// MesseFlow Public API  (window.MesseFlow)
// ════════════════════════════════════════════════════════════════════════════
//
//  Standalone:   Seite lädt normal → messeflowEntry() bootet wie bisher
//  Eingebettet:  MesseFlow.init('#cockpit-slot', { userId: 'u_celal' })
//
// ════════════════════════════════════════════════════════════════════════════
window.MesseFlow = (function () {

  // ── interner Event-Bus ───────────────────────────────────────────────────
  var _listeners = {};
  function _on(event, cb) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(cb);
  }
  function _off(event, cb) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(function (f) { return f !== cb; });
  }
  function _emit(event, data) {
    (_listeners[event] || []).forEach(function (cb) {
      try { cb(data); } catch (e) { console.warn('[MesseFlow]', event, e); }
    });
  }

  // ── Hilfsfunktion: sauberes Auftrags-Objekt (kein UI-State, kein DOM) ───
  function _auftragSnapshot(p) {
    if (!p) return null;
    return {
      id:              p.id,
      name:            p.name,
      kunde:           (p.auftragsInfo && p.auftragsInfo.kunde) || p.kunde || '',
      status:          p.status || 'Neu',
      deadline:        (p.auftragsInfo && p.auftragsInfo.liefertermin) || p.deadline || null,
      messe:           (p.auftragsInfo && p.auftragsInfo.messe)        || '',
      stand:           (p.auftragsInfo && p.auftragsInfo.stand)        || '',
      angebotsnummer:  (p.auftragsInfo && p.auftragsInfo.angebotsnummer) || '',
      ansprechpartner: (p.auftragsInfo && p.auftragsInfo.ansprechpartner) || '',
      bemerkung:       (p.auftragsInfo && p.auftragsInfo.bemerkung)    || '',
      prioritaet:      p.prioritaet || 'Normal',
      waendeAnzahl:    (p.waende || []).length,
      waendeStatus:    (p.waende || []).map(function (w) {
        return { id: w.id, name: w.name, status: w.status };
      }),
    };
  }

  // ── PUBLIC: Aufträge lesen ───────────────────────────────────────────────

  /** Alle sichtbaren Aufträge zurückgeben (saubere Kopie, kein UI-State). */
  function getAuftraege() {
    return (MesseFlowState.projects || []).map(_auftragSnapshot);
  }

  /** Einzelnen Auftrag nach ID. Gibt null zurück wenn nicht gefunden. */
  function getAuftragById(id) {
    var p = (MesseFlowState.projects || []).find(function (x) { return x.id === id; });
    return _auftragSnapshot(p);
  }

  // ── PUBLIC: Aufträge schreiben ───────────────────────────────────────────

  /**
   * Neuen Auftrag anlegen.
   * @param {object} data  – { name, kunde, deadline, messe, stand, bemerkung, waende[] }
   *   waende[] optional: [{ name, bestellmass }]
   * @returns {object}  Snapshot des neuen Auftrags
   */
  function createAuftrag(data) {
    if (!data || !data.name) { throw new Error('[MesseFlow.createAuftrag] name ist Pflichtfeld'); }

    var waende = (data.waende || []).map(function (w, i) {
      return {
        id:           'w' + Date.now() + i,
        name:         w.name || ('Position ' + (i + 1)),
        datei:        null,
        dateien:      [],
        bestellmass:  w.bestellmass || '',
        dateiMass:    '',
        masseOk:      false,
        abweichungOk: false,
        status:       1,
      };
    });
    if (!waende.length) {
      waende = [{ id: 'w' + Date.now(), name: 'Wand A', datei: null, dateien: [],
                  bestellmass: '', dateiMass: '', masseOk: false, abweichungOk: false, status: 1 }];
    }

    var newP = {
      id:         'p' + Date.now(),
      name:       data.name,
      kunde:      data.kunde || '',
      deadline:   data.deadline || null,
      status:     'Neu',
      prioritaet: data.prioritaet || 'Normal',
      waende:     waende,
      auftragsInfo: {
        kunde:           data.kunde || '',
        projektname:     data.name,
        liefertermin:    data.deadline || '',
        messe:           data.messe || '',
        stand:           data.stand || '',
        ansprechpartner: data.ansprechpartner || '',
        angebotsnummer:  data.angebotsnummer || '',
        bemerkung:       data.bemerkung || '',
        _importiert:     new Date().toLocaleString('de-DE'),
      },
      finanz:            { preis: data.preis || null, provisionBettina: null, rechnung: null },
      hauptFirma:        data.hauptFirma || null,
      projektMitglieder: [],
    };

    // Standard-Zuweisungen anwenden (Norbert/Melanie immer dabei)
    if (typeof applyStandardZuweisungen === 'function') {
      applyStandardZuweisungen(newP, newP.hauptFirma, null);
    }

    MesseFlowState.projects.push(newP);
    if (typeof mfSaveState === 'function') mfSaveState();
    if (typeof mfAudit === 'function') {
      mfAudit({ action: 'api_auftrag_angelegt', projectId: newP.id, meta: { name: newP.name } });
    }
    if (typeof renderSidebar === 'function') renderSidebar();

    _emit('auftragCreated', _auftragSnapshot(newP));
    return _auftragSnapshot(newP);
  }

  /**
   * Auftrag aktualisieren.
   * @param {string} id        – Projekt-ID
   * @param {object} changes   – { name, kunde, deadline, status, bemerkung, ... }
   * @returns {object|null}    Snapshot nach Änderung, oder null wenn nicht gefunden
   */
  function updateAuftrag(id, changes) {
    var p = (MesseFlowState.projects || []).find(function (x) { return x.id === id; });
    if (!p) return null;

    // Flache Felder direkt übernehmen
    var direktFelder = ['name', 'kunde', 'deadline', 'status', 'prioritaet'];
    direktFelder.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(changes, k)) {
        p[k] = changes[k];
      }
    });

    // auftragsInfo-Felder mergen
    var infoFelder = ['liefertermin', 'messe', 'stand', 'ansprechpartner',
                      'angebotsnummer', 'bemerkung', 'kunde', 'projektname'];
    if (changes.deadline && !changes.liefertermin) changes.liefertermin = changes.deadline;
    if (changes.name     && !changes.projektname)  changes.projektname  = changes.name;
    if (!p.auftragsInfo) p.auftragsInfo = {};
    infoFelder.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(changes, k)) {
        p.auftragsInfo[k] = changes[k];
      }
    });

    if (typeof mfSaveState === 'function') mfSaveState();
    if (typeof mfAudit === 'function') {
      mfAudit({ action: 'api_auftrag_geaendert', projectId: id, meta: changes });
    }
    if (typeof refreshProjectUI === 'function') refreshProjectUI();
    if (typeof renderSidebar    === 'function') renderSidebar();

    _emit('auftragUpdated', _auftragSnapshot(p));
    return _auftragSnapshot(p);
  }

  /**
   * Auftrag löschen.
   * @param {string} id  – Projekt-ID
   * @returns {boolean}  true wenn gelöscht, false wenn nicht gefunden
   */
  function deleteAuftrag(id) {
    var idx = (MesseFlowState.projects || []).findIndex(function (x) { return x.id === id; });
    if (idx === -1) return false;

    var snapshot = _auftragSnapshot(MesseFlowState.projects[idx]);
    MesseFlowState.projects.splice(idx, 1);

    if (typeof mfSaveState === 'function') mfSaveState();
    if (typeof mfAudit === 'function') {
      mfAudit({ action: 'api_auftrag_geloescht', projectId: id, meta: { name: snapshot.name } });
    }
    // Wenn das gelöschte Projekt gerade aktiv war → nächstes zeigen
    if (typeof activeProjId !== 'undefined' && activeProjId === id) {
      if (typeof renderSidebar === 'function') renderSidebar();
      var next = MesseFlowState.projects[0];
      if (next && typeof selectProj === 'function') selectProj(next.id);
    } else {
      if (typeof renderSidebar === 'function') renderSidebar();
    }

    _emit('auftragDeleted', snapshot);
    return true;
  }

  // ── PUBLIC: Kalender-Termine ─────────────────────────────────────────────

  /** Alle Kalender-Einträge aus MesseFlow-Projekten (für Cockpit-Kalender). */
  function getKalenderTermine() {
    var termine = [];
    (MesseFlowState.projects || []).forEach(function (p) {
      if (p.ccinternAuftrag && p.ccinternAuftrag.kalenderEintrag) {
        termine.push(Object.assign({}, p.ccinternAuftrag.kalenderEintrag, {
          projektId:   p.id,
          projektName: p.name,
          quelle:      'messeflow',
        }));
      }
      // Liefertermin als Fallback
      var dl = (p.auftragsInfo && p.auftragsInfo.liefertermin) || p.deadline;
      if (dl && !(p.ccinternAuftrag && p.ccinternAuftrag.kalenderEintrag)) {
        termine.push({
          datum:       dl,
          titel:       p.name,
          typ:         'liefertermin',
          projektId:   p.id,
          projektName: p.name,
          quelle:      'messeflow',
        });
      }
    });
    return termine;
  }

  // ── PUBLIC: init ─────────────────────────────────────────────────────────

  /**
   * MesseFlow als Modul starten.
   *
   * Standalone (kein Aufruf nötig — messeflowEntry() läuft automatisch):
   *   keine Aktion nötig
   *
   * Eingebettet (Cockpit):
   *   MesseFlow.init('#cockpit-slot')
   *   MesseFlow.init('#cockpit-slot', { userId: 'u_celal', hideChrome: true })
   *
   * @param {string|Element} container  CSS-Selektor oder DOM-Element
   * @param {object}         opts
   *   opts.userId      – Benutzer-ID (default: aus Session oder 'u_celal')
   *   opts.hideChrome  – Topbar + Sidebar ausblenden (default: true)
   */
  function init(container, opts) {
    opts = opts || {};

    // Container auflösen
    var root = null;
    if (container) {
      root = typeof container === 'string'
        ? document.querySelector(container)
        : container;
    }
    if (!root) root = document.getElementById('app') || document.body;

    // #shell in Ziel-Container verschieben (wenn nicht schon dort)
    var shell = document.getElementById('shell');
    if (shell && shell.parentNode !== root) {
      root.appendChild(shell);
    }

    // Chrome ausblenden (Topbar / Sidebar) wenn als Modul
    if (opts.hideChrome !== false) {
      document.body.classList.add('mf-module-mode');
    }

    // Benutzer bestimmen
    var userId = opts.userId
      || (typeof mfGetSession === 'function' ? (mfGetSession() || {}).userId : null)
      || currentUserId
      || 'u_celal';

    mfShowLoginGate(false);
    mfSetMainChromeVisible(true); // Shell selbst einblenden (mf-module-mode blendet Topbar/Sidebar per CSS aus)
    messeflowNormalBoot(userId);

    _emit('ready', { container: root, userId: userId });
  }

  // ── PUBLIC: Debugging / Bridge ───────────────────────────────────────────

  /** Roher State-Snapshot (nur für Debugging / Bridge – nicht für Produktion). */
  function getState() {
    return { projects: MesseFlowState.projects, currentUserId: currentUserId };
  }

  // ── Cockpit: Session-Accessor ─────────────────────────────────────────────

  /**
   * Aktuell eingeloggten Benutzer zurückgeben.
   * Cockpit nutzt diese Methode statt window.currentUserId direkt zu lesen.
   * @returns {string} userId
   */
  function getCurrentUserId() {
    return currentUserId;
  }

  /**
   * Aktuelle Rolle des eingeloggten Benutzers.
   * Cockpit nutzt diese Methode statt window.role direkt zu lesen.
   * @returns {string} role
   */
  function getCurrentRole() {
    return role;
  }

  /**
   * Cockpit übergibt Session – MesseFlow übernimmt userId ohne eigenen Login.
   * Voraussetzung: hideChrome: true in init().
   * @param {string} userId
   */
  function setSessionFromCockpit(userId) {
    if (!userId) return;
    if (typeof setUser === 'function') {
      setUser(userId);
    } else {
      currentUserId = userId;
      window.currentUserId = userId;
    }
    console.info('[MesseFlow] Session vom Cockpit übernommen – userId:', userId);
  }

  // ── Exports ──────────────────────────────────────────────────────────────
  return {
    version:          '1.1',

    // Auftrags-CRUD
    getAuftraege:     getAuftraege,
    getAuftragById:   getAuftragById,
    createAuftrag:    createAuftrag,
    updateAuftrag:    updateAuftrag,
    deleteAuftrag:    deleteAuftrag,

    // Kalender
    getKalenderTermine: getKalenderTermine,

    // Modul-Init
    init:             init,

    // Event-Bus
    on:               _on,
    off:              _off,
    emit:             _emit,

    // Cockpit: Session-Accessor (statt window.currentUserId / window.role)
    getCurrentUserId:      getCurrentUserId,
    getCurrentRole:        getCurrentRole,
    setSessionFromCockpit: setSessionFromCockpit,

    // Debugging
    getState:         getState,

    // Rückwärtskompatibilität (alte API)
    getProjects:      getAuftraege,
  };

}());
// ════════════════════════════════════════════════════════════════════════════
