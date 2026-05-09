// ═══════════════════════════════════════════════════════════════════════════════
// MESSEFLOW DASHBOARD VIEW  ←  Quellen: ui/adminView.js + ui/bettinaView.js
// Ziel: messeflow-dashboard-view.js (ui/)
//
// Enthält:
//   • Admin-Zentrale               openAdminView(), renderAdminView() & alle Untermasken
//   • Benutzer-Verwaltung          Admin-Benutzer anlegen, einladen, sperren
//   • Firmen-Verwaltung            Admin-Firmen-Liste, editieren
//   • Projekt-Übersicht (Admin)    Alle Projekte überblicken, freigeben
//   • Koordination-View (Bettina)  renderBettinaView() – Nur-Lese-Dashboard
//
// Zusammengeführt aus:
//   1. js/ui/adminView.js          – Admin-Zentrale (959 Zeilen)
//   2. js/ui/bettinaView.js        – Koordinations-Ansicht (95 Zeilen)
//
// TODO Cockpit-Umzug:
//   - openAdminView() → als Cockpit-Route einbinden
//   - Benutzer-/Firmen-Verwaltung → ggf. Cockpit-globale Nutzerverwaltung nutzen
//   - renderBettinaView() → als "Übersicht"-Tab im Cockpit-Dashboard
// ═══════════════════════════════════════════════════════════════════════════════


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/ui/adminView.js  —  Admin-Zentrale
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ═══════════════════════════════════════════════════════
// ADMIN-ZENTRALE — für alle Benutzer mit Rolle 'admin'
// ═══════════════════════════════════════════════════════

// ── Globale Routing-Flag ──
let adminViewOpen = false;

function openAdminView() {
  if (role !== 'admin') return;
  if (typeof window !== 'undefined') window.__mfActiveModule = 'messeflow';
  adminViewOpen = true;
  activeProjId = null;
  renderView();
}

function closeAdminView() {
  adminViewOpen = false;
  renderView();
}

function adminNewUserId() {
  return 'u' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}

/** Einheitliches neues Konto: Status „eingeladen“, kein Passwort. */
function adminBuildNewInvitedUser(name, firmaId, rolle, email) {
  return {
    id: adminNewUserId(),
    name: name.trim(),
    email: (email || '').trim(),
    firmaId,
    rolle,
    aktiv: true,
    kontoStatus: 'eingeladen',
    zugriff: rolle === 'admin' || rolle === 'cc_intern' ? 'freigeben' : 'bearbeiten',
    preiseSichtbar: rolle === 'admin' || rolle === 'zwischenhaendler',
    module_permissions: {
      messeflow: true,
      crm: rolle === 'admin' || rolle === 'cc_intern',
      angebote: rolle === 'admin' || rolle === 'cc_intern',
      produktion: rolle === 'admin' || rolle === 'cc_intern' || rolle === 'produktion',
    },
  };
}

function adminCopyInviteFromModal() {
  const el = document.getElementById('mf-invite-link-box');
  if (!el || !el.textContent) return;
  navigator.clipboard.writeText(el.textContent.trim()).then(() => {
    toast('Kopiert', 'Link in Zwischenablage.', 'tg');
  }).catch(() => {
    toast('Hinweis', 'Bitte Link im Kasten markieren und kopieren (Strg+C).', 'ty');
  });
}

/** Token-Link + Mail / WhatsApp (einheitlich für Firma + Benutzer). */
/** Magic-Link zur Anmeldung (15 Min., einmalig) – nur für aktive Konten mit Passwort. */
function openMagicLoginModal(userId) {
  const user = USERS.find(u => u.id === userId);
  if (!user) return;
  if (typeof mfUserNeedsInviteFlow === 'function' && mfUserNeedsInviteFlow(user)) {
    toast('Hinweis', 'Bitte zuerst den Einladungslink zur Kontoeinrichtung nutzen.', 'ty');
    return;
  }
  if (!user.passwordHash || !user.passwordSalt) {
    toast('Hinweis', 'Magic-Link setzt ein bestehendes Passwort voraus – zuerst Einladung nutzen.', 'ty');
    return;
  }
  if (user.kontoStatus === 'deaktiviert' || user.aktiv === false) {
    toast('Fehler', 'Deaktivierte Konten können keinen Magic-Link erhalten.'); return;
  }
  const token = typeof mfCreateMagicLoginToken === 'function' ? mfCreateMagicLoginToken(userId) : null;
  if (!token) { toast('Fehler', 'Magic-Link konnte nicht erzeugt werden.'); return; }
  const link = typeof mfBuildMagicLoginUrl === 'function' ? mfBuildMagicLoginUrl(token) : '';
  const mailBody = `Hallo ${user.name},\n\nhier ist Ihr einmaliger Anmeldelink zu MesseFlow (max. 15 Minuten gültig, nur einmal verwendbar):\n\n${link}\n\nWenn Sie dies nicht angefordert haben, ignorieren Sie die Nachricht.\n`;
  const mailHref = user.email
    ? `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent('MesseFlow – Anmeldelink')}&body=${encodeURIComponent(mailBody)}`
    : '';
  const waHref = `https://wa.me/?text=${encodeURIComponent('MesseFlow – Anmeldelink (15 Min., einmalig):\n' + link)}`;
  const emailDisabled = !user.email;
  const emailBtn = emailDisabled
    ? `<button type="button" class="btn ghost sm" style="opacity:0.55;cursor:not-allowed;" onclick="toast('Hinweis','E-Mail beim Benutzer hinterlegen, dann erneut öffnen.','ty')">📧 Per E-Mail</button>`
    : `<a class="btn ghost sm" style="text-decoration:none;display:inline-block;" href="${mailHref}">📧 Per E-Mail</a>`;
  openModal('Magic-Link Anmeldung', `
    <p style="font-size:13px;color:var(--muted);margin:0 0 10px;line-height:1.5;">
      Link für <strong>${user.name}</strong>: <strong>nur einmal verwendbar</strong>, höchstens <strong>15 Minuten</strong> gültig.
      Auf einem <strong>bekannten Gerät</strong> ist die Anmeldung direkt möglich; sonst Bestätigungscode per E-Mail/WhatsApp.</p>
    <div id="mf-magic-login-link-box" style="background:#f9fafb;border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-size:12px;
      font-family:monospace;word-break:break-all;user-select:all;cursor:text;">${link}</div>
    ${emailDisabled ? '<p style="font-size:11px;color:var(--muted);margin:10px 0 0;">E-Mail fehlt: „Per E-Mail“ ist deaktiviert.</p>' : ''}
    <div class="ma" style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;">
      <button class="btn primary sm" type="button" onclick="navigator.clipboard.writeText(document.getElementById('mf-magic-login-link-box').textContent.trim()).then(()=>toast('Kopiert','Link in Zwischenablage.','tg')).catch(()=>toast('Hinweis','Link manuell kopieren.','ty'))">📋 Link kopieren</button>
      ${emailBtn}
      <a class="btn ghost sm" style="text-decoration:none;display:inline-block;" href="${waHref}" target="_blank" rel="noopener">💬 WhatsApp</a>
      <button class="btn ghost sm" type="button" onclick="closeModal()">Schließen</button>
    </div>`);
}

function openEinladungsaktionenModal(userId) {
  const user = USERS.find(u => u.id === userId);
  if (!user) return;
  if (typeof mfUserIsLegacyKonto === 'function' && mfUserIsLegacyKonto(user) &&
      !(typeof mfUserNeedsInviteFlow === 'function' && mfUserNeedsInviteFlow(user))) {
    toast('Hinweis', 'Dieses Konto ist ein Legacy-Demo-Konto ohne Einladungsflow.', 'ty');
    return;
  }
  if (user.kontoStatus === 'deaktiviert' || user.aktiv === false) {
    toast('Fehler', 'Deaktivierte Konten können nicht eingeladen werden.'); return;
  }
  const token = typeof createInviteToken === 'function' ? createInviteToken(userId) : null;
  if (!token) { toast('Fehler', 'Einladung konnte nicht erzeugt werden.'); return; }
  const link = typeof buildEinladungsUrl === 'function' ? buildEinladungsUrl(token) : '';
  const mailBody = `Hallo ${user.name},\n\nbitte richten Sie Ihren Zugang zu MesseFlow ein (Link ist begrenzt gültig):\n\n${link}\n`;
  const mailHref = user.email
    ? `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent('Einladung MesseFlow')}&body=${encodeURIComponent(mailBody)}`
    : '';
  const waHref = `https://wa.me/?text=${encodeURIComponent('MesseFlow – Zugang einrichten:\n' + link)}`;
  const emailDisabled = !user.email;
  const emailBtn = emailDisabled
    ? `<button type="button" class="btn ghost sm" style="opacity:0.55;cursor:not-allowed;" onclick="toast('Hinweis','E-Mail beim Anlegen hinterlegen, dann Einladung erneut öffnen.','ty')">📧 Per E-Mail</button>`
    : `<a class="btn ghost sm" style="text-decoration:none;display:inline-block;" href="${mailHref}">📧 Per E-Mail</a>`;
  openModal('Einladung', `
    <p style="font-size:13px;color:var(--muted);margin:0 0 10px;line-height:1.5;">
      Teilen Sie den Link mit <strong>${user.name}</strong>. Er ist <strong>einmalig</strong> und nach ca.
      <strong>${typeof mfGetInviteTtlLabel === 'function' ? mfGetInviteTtlLabel() : '48 Std.'}</strong> abgelaufen.</p>
    <div id="mf-invite-link-box" style="background:#f9fafb;border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-size:12px;
      font-family:monospace;word-break:break-all;user-select:all;cursor:text;">${link}</div>
    ${emailDisabled ? '<p style="font-size:11px;color:var(--muted);margin:10px 0 0;">E-Mail fehlt: „Per E-Mail“ ist deaktiviert.</p>' : ''}
    <div class="ma" style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;">
      <button class="btn primary sm" type="button" onclick="adminCopyInviteFromModal()">📋 Link kopieren</button>
      ${emailBtn}
      <a class="btn ghost sm" style="text-decoration:none;display:inline-block;" href="${waHref}" target="_blank" rel="noopener">💬 WhatsApp</a>
      <button class="btn ghost sm" type="button" onclick="closeModal()">Schließen</button>
    </div>`);
}

function genInviteLink(userId) {
  openEinladungsaktionenModal(userId);
}

function showEinladungErstelltModal(userId) {
  toast('Einladung erstellt', 'Link unten kopieren oder senden.', 'tg');
  openEinladungsaktionenModal(userId);
}

function adminRegenerateInvite(userId) {
  openEinladungsaktionenModal(userId);
}

function adminToggleKontoSperre(userId) {
  const u = USERS.find(x => x.id === userId);
  if (!u) return;
  if (u.id === currentUserId) {
    toast('Hinweis', 'Das eigene Konto kann nicht gesperrt werden.', 'ty'); return;
  }
  const now = u.status === 'gesperrt';
  if (!now && !confirm(`Konto „${u.name}" sperren? Der Benutzer kann sich nicht mehr anmelden.`)) return;
  if (now && !confirm(`Sperre für „${u.name}" aufheben?`)) return;
  u.status = now ? undefined : 'gesperrt';
  toast(now ? 'Entsperrt' : 'Gesperrt', `${u.name}`, 'tg');
  if (typeof refreshUserDropdown === 'function') refreshUserDropdown();
  renderAdminView();
}

function adminDeactivateUserAccount(userId) {
  if (userId === currentUserId) {
    toast('Fehler', 'Das eigene Konto kann hier nicht deaktiviert werden.'); return;
  }
  const u = USERS.find(x => x.id === userId);
  if (!u) return;
  if (!confirm(`Benutzer „${u.name}" wirklich deaktivieren?`)) return;
  u.aktiv = false;
  u.kontoStatus = 'deaktiviert';
  if (typeof mfAudit === 'function') mfAudit({ action: 'benutzer_deaktiviert', meta: { userId, name: u.name } });
  toast('Gespeichert', `${u.name} wurde deaktiviert.`, 'tg');
  refreshProjectUI();
  renderAdminView();
}

// ── Inline-Aktionen (kein Modal-Refresh nötig, nur Toast) ──
function adminSetUserRolle(userId, val) {
  const u = USERS.find(x => x.id === userId);
  if (u) { u.rolle = val; refreshProjectUI(); toast('Gespeichert', `Rolle von ${u.name} aktualisiert.`, 'tg'); }
}
function adminSetUserFirma(userId, val) {
  const u = USERS.find(x => x.id === userId);
  if (u) { u.firmaId = val; refreshProjectUI(); toast('Gespeichert', `Firma von ${u.name} aktualisiert.`, 'tg'); }
}
function adminToggleAktiv(userId, checked) {
  const u = USERS.find(x => x.id === userId);
  if (!u) return;
  if (checked) {
    u.aktiv = true;
    if (u.passwordHash) u.kontoStatus = 'aktiv';
    else if (u.kontoStatus === 'deaktiviert' || u.kontoStatus === 'einladung_abgelaufen') u.kontoStatus = 'eingeladen';
  } else {
    u.aktiv = false;
    u.kontoStatus = 'deaktiviert';
  }
  refreshProjectUI();
}

// ── Neuen Benutzer anlegen ──
function adminCreateUser() {
  const name    = document.getElementById('an-name')?.value.trim();
  const email   = document.getElementById('an-email')?.value.trim() || '';
  const rolle   = document.getElementById('an-rolle')?.value;
  const firmaId = document.getElementById('an-firma')?.value;
  if (!name) { toast('Fehler', 'Bitte Name eingeben'); return; }
  if (!firmaId) { toast('Fehler', 'Bitte eine bestehende Firma auswählen – zuerst unter „Firmen“ eine Firma anlegen.'); return; }

  const em = email.trim().toLowerCase();
  if (em) {
    const dup = typeof mfFindUsersByEmail === 'function' ? mfFindUsersByEmail(em) : [];
    if (dup.length) {
      toast('Fehler', 'Diese E-Mail ist bereits vergeben. Bitte bestehenden Benutzer bearbeiten oder eine andere E-Mail wählen.');
      return;
    }
  }

  const newUser = adminBuildNewInvitedUser(name, firmaId, rolle, email);
  USERS.push(newUser);
  if (typeof mfAudit === 'function') mfAudit({ action: 'benutzer_angelegt', meta: { userId: newUser.id, name } });
  toast('✓ Benutzer angelegt', `${name} wurde erstellt (Status: eingeladen).`, 'tg');
  renderAdminView();
  setTimeout(() => openEinladungsaktionenModal(newUser.id), 400);
}

// ── Neue Firma anlegen (aus Firmen-Sektion) ──
function adminCreateFirma() {
  const name = document.getElementById('af-name')?.value.trim();
  const typ  = document.getElementById('af-typ')?.value;
  const apExisting = document.getElementById('af-ap-user')?.value || '';
  const apNewName = document.getElementById('af-ap-new')?.value.trim() || '';
  const apRolle = document.getElementById('af-ap-rolle')?.value || 'agentur';
  const zhUser = document.getElementById('af-zh-user')?.value || '';

  if (!name) { toast('Fehler', 'Bitte Firmenname eingeben'); return; }
  if (FIRMS.some(f => f.name.toLowerCase() === name.toLowerCase())) {
    toast('Fehler', 'Firma existiert bereits'); return;
  }
  if (typ === 'agentur' && !apExisting && !apNewName) {
    toast('Fehler', 'Agentur: Bitte Ansprechpartner wählen oder unter „Neu“ anlegen.'); return;
  }
  if (apExisting && apNewName) {
    toast('Fehler', 'Entweder bestehenden Ansprechpartner wählen oder neu anlegen – nicht beides.'); return;
  }

  const firmId = addFirma(name, typ, { zwischenhaendlerUserId: zhUser || null });
  let apId = null;

  if (apNewName) {
    const apEmail = document.getElementById('af-ap-email')?.value.trim() || '';
    const newUser = adminBuildNewInvitedUser(apNewName, firmId, apRolle, apEmail);
    USERS.push(newUser);
    apId = newUser.id;
  } else if (apExisting) {
    const u = USERS.find(x => x.id === apExisting);
    if (u) {
      u.firmaId = firmId;
      apId = u.id;
    }
  }

  const F = FIRMS.find(f => f.id === firmId);
  if (F) F.ansprechpartnerUserId = apId;

  toast('✓ Firma angelegt', apId ? `${name} · Ansprechpartner verknüpft` : name, 'tg');
  renderAdminView();
  if (typeof refreshUserDropdown === 'function') refreshUserDropdown();
  if (apId) setTimeout(() => openEinladungsaktionenModal(apId), 0);
}

// Einladung: neue Firma + neuer Ansprechpartner in einem Schritt (Name unter „Neu anlegen“ Pflicht)
function adminFirmaMitEinladungAnlegen() {
  const name = document.getElementById('af-name')?.value.trim();
  const typ = document.getElementById('af-typ')?.value;
  const apExisting = document.getElementById('af-ap-user')?.value || '';
  const apNewName = document.getElementById('af-ap-new')?.value.trim() || '';
  const apRolle = document.getElementById('af-ap-rolle')?.value || 'agentur';
  const zhUser = document.getElementById('af-zh-user')?.value || '';

  if (!apNewName) {
    toast('Fehler', 'Bitte zuerst den Namen des neuen Ansprechpartners eintragen.');
    return;
  }
  if (apExisting) {
    toast('Fehler', 'Bitte „Bestehenden Benutzer“ auf „– keiner –“ lassen – die Einladung legt nur neue Kontakte an.');
    return;
  }
  if (!name) {
    toast('Fehler', 'Bitte Firmenname eingeben.');
    return;
  }
  if (FIRMS.some(f => f.name.toLowerCase() === name.toLowerCase())) {
    toast('Fehler', 'Firma existiert bereits.');
    return;
  }

  const firmId = addFirma(name, typ, { zwischenhaendlerUserId: zhUser || null });
  const apEmail = document.getElementById('af-ap-email')?.value.trim() || '';
  const newUser = adminBuildNewInvitedUser(apNewName, firmId, apRolle, apEmail);
  USERS.push(newUser);
  const F = FIRMS.find(f => f.id === firmId);
  if (F) F.ansprechpartnerUserId = newUser.id;

  toast('Einladung erstellt', `${newUser.name} angelegt · Firma „${name}“.`, 'tg');
  renderAdminView();
  if (typeof refreshUserDropdown === 'function') refreshUserDropdown();
  setTimeout(() => {
    if (typeof adminUpdateFirmaEinladungBtnState === 'function') adminUpdateFirmaEinladungBtnState();
    openEinladungsaktionenModal(newUser.id);
  }, 0);
}

function adminUpdateFirmaEinladungBtnState() {
  const btn = document.getElementById('af-invite-btn');
  if (!btn) return;
  const newName = document.getElementById('af-ap-new')?.value.trim() || '';
  const firmName = document.getElementById('af-name')?.value.trim() || '';
  const existing = document.getElementById('af-ap-user')?.value || '';
  btn.disabled = !newName || !firmName || !!existing;
}

function adminDeleteFirma(firmaId) {
  const f = FIRMS.find(f => f.id === firmaId);
  if (!confirm(`Firma „${f?.name}" wirklich löschen?`)) return;
  if (!removeFirma(firmaId)) {
    toast('Fehler', 'Noch Benutzer dieser Firma vorhanden.'); return;
  }
  toast('Gelöscht', f?.name);
  renderAdminView();
}

// ── Projekt-Zuweisung (Agentur / Produktion) ──
function adminProjAgentur(projId, firmaId) {
  const p = getP(projId);
  if (!p) return;
  applyStandardZuweisungen(p, firmaId || null, null);
  toast('Gespeichert', 'Agentur-Zuweisung & Team aktualisiert.', 'tg');
  refreshProjectUI();
}

function adminProjProduktionTyp(projId, val) {
  const p = getP(projId);
  if (!p) return;
  if (val === 'intern') {
    // Digitaldruck/Plot → Melanie intern
    p.produktion_ids  = [];
    p.produktion_intern = true;
    p.intern_ids = [...new Set([...(p.intern_ids||[]), 'u3'])]; // Melanie
  } else if (val === '') {
    p.produktion_ids    = [];
    p.produktion_intern = false;
  } else {
    // Externe Firma (firmaId)
    p.produktion_ids    = [val];
    p.produktion_intern = false;
  }
  toast('Gespeichert', 'Produktions-Zuweisung aktualisiert.', 'tg');
  refreshProjectUI();
}

// ── Filter-State ──
let _azFilterUser  = 'alle';
let _azFilterFirma = 'alle';
let _azDetailOpen  = false;

// ── UI-Hilfsfunktionen ──
function _azInp(id, ph, type='text', extra='') {
  return `<input id="${id}" type="${type}" placeholder="${ph}" ${extra}
    style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;">`;
}
function _azStatusBadge(ks) {
  const m = {
    eingeladen:           { t:'eingeladen',  c:'#d97706', bg:'#fffbeb' },
    aktiv:                { t:'aktiv',       c:'#059669', bg:'#ecfdf5' },
    einladung_abgelaufen: { t:'abgelaufen',  c:'#dc2626', bg:'#fef2f2' },
    deaktiviert:          { t:'inaktiv',     c:'#6b7280', bg:'#f9fafb' },
    gesperrt:             { t:'gesperrt',    c:'#dc2626', bg:'#fef2f2' },
  }[ks] || { t: ks||'–', c:'#6b7280', bg:'#f9fafb' };
  return `<span style="background:${m.bg};color:${m.c};border:1px solid ${m.c}44;border-radius:999px;
    padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap;">${m.t}</span>`;
}
function _azModulBadges(u) {
  const mp = u.module_permissions || {};
  const b = [];
  if (mp.messeflow) b.push('<span style="background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;">MesseFlow</span>');
  if (mp.crm)       b.push('<span style="background:#f3e8ff;color:#7c3aed;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;">CC Intern</span>');
  if (mp.angebote || mp.fusa) b.push('<span style="background:#fef3c7;color:#b45309;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;">FUSA</span>');
  return b.length ? b.join(' ') : '<span style="color:#dc2626;font-size:10px;font-weight:700;">⚠ kein Modul</span>';
}
function _azFilterBar(filters, active, fn) {
  return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">` +
    filters.map(f => `<button onclick="${fn}('${f.v}')"
      style="padding:4px 12px;border-radius:999px;border:1px solid ${active===f.v?'#1e1b4b':'var(--line)'};
      background:${active===f.v?'#1e1b4b':'#fff'};color:${active===f.v?'#fff':'var(--text)'};
      font-size:12px;cursor:pointer;white-space:nowrap;min-height:32px;">${f.l}</button>`).join('') +
  `</div>`;
}
function _azDetailHeader(title, subtitle) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;
    border-bottom:1px solid var(--line);background:#fff;position:sticky;top:0;z-index:1;">
    <div>
      <div style="font-size:16px;font-weight:800;color:#1e1b4b;">${title}</div>
      ${subtitle ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${subtitle}</div>` : ''}
    </div>
    <button onclick="azCloseDetail()" style="background:none;border:none;font-size:22px;cursor:pointer;
      color:var(--muted);padding:4px 10px;line-height:1;min-height:44px;">✕</button>
  </div>`;
}
function _azBlock(title, content, color) {
  color = color || '#1e3a5f';
  return `<div style="border-bottom:1px solid var(--line);">
    <div style="background:${color}11;padding:9px 20px;font-size:11px;font-weight:800;
      text-transform:uppercase;letter-spacing:.07em;color:${color};">${title}</div>
    <div style="padding:14px 20px;">${content}</div>
  </div>`;
}

// ── Filter / Suche ──
function azSetFilterUser(v)  { _azFilterUser  = v; _azRenderUserList();  }
function azSetFilterFirma(v) { _azFilterFirma = v; _azRenderFirmaList(); }
function azSearch()          { _azRenderUserList(); _azRenderFirmaList(); }

function _azGetFilteredUsers() {
  const q = (document.getElementById('az-search')?.value || '').toLowerCase();
  return USERS.filter(u => {
    const ks = typeof getEffectiveKontoStatus === 'function' ? getEffectiveKontoStatus(u) : 'aktiv';
    const F  = FIRMS.find(f => f.id === u.firmaId);
    if (_azFilterUser === 'aktiv'      && ks !== 'aktiv') return false;
    if (_azFilterUser === 'gesperrt'   && ks !== 'gesperrt'   && u.status !== 'gesperrt') return false;
    if (_azFilterUser === 'eingeladen' && ks !== 'eingeladen') return false;
    if (_azFilterUser === 'extern'     && ['admin','cc_intern'].includes(u.rolle)) return false;
    if (_azFilterUser === 'intern'     && !['cc_intern','produktion'].includes(u.rolle)) return false;
    if (_azFilterUser === 'admin'      && u.rolle !== 'admin') return false;
    if (q && !`${u.name} ${u.email||''} ${F?.name||''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
function _azGetFilteredFirmen() {
  const q = (document.getElementById('az-search')?.value || '').toLowerCase();
  return FIRMS.filter(f => {
    if (_azFilterFirma !== 'alle' && f.typ !== _azFilterFirma) return false;
    if (q && !`${f.name} ${f.typ}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ── Listendarstellung ──
function _azRenderUserList() {
  const el = document.getElementById('az-user-list');
  if (!el) return;
  const users = _azGetFilteredUsers();
  const ct = document.getElementById('az-user-count');
  if (ct) ct.textContent = users.length;
  if (!users.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px;text-align:center;">Keine Benutzer gefunden.</div>';
    return;
  }
  el.innerHTML = users.map(u => {
    const F   = FIRMS.find(f => f.id === u.firmaId);
    const R   = ROLES.find(r => r.id === u.rolle);
    const ks  = typeof getEffectiveKontoStatus === 'function' ? getEffectiveKontoStatus(u) : 'aktiv';
    const isInt = ['admin','cc_intern'].includes(u.rolle);
    const intBadge = isInt
      ? `<span style="background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;margin-left:5px;">INTERN</span>`
      : `<span style="background:#f0fdf4;color:#15803d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;margin-left:5px;">EXTERN</span>`;
    return `<div onclick="azOpenUserDetail('${u.id}')"
      style="border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;
      transition:box-shadow .15s,border-color .15s;background:#fff;"
      onmouseenter="this.style.boxShadow='0 2px 12px rgba(0,0,0,.08)';this.style.borderColor='#a5b4fc'"
      onmouseleave="this.style.boxShadow='';this.style.borderColor='var(--line)'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${u.name}${intBadge}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.email||'–'}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${F?.name||'–'} · <span style="color:var(--text);">${R?.label||u.rolle}</span></div>
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:3px;">${_azModulBadges(u)}</div>
        </div>
        <div style="flex-shrink:0;">${_azStatusBadge(ks)}</div>
      </div>
    </div>`;
  }).join('');
}

function _azRenderFirmaList() {
  const el = document.getElementById('az-firma-list');
  if (!el) return;
  const firmen = _azGetFilteredFirmen();
  const ct = document.getElementById('az-firma-count');
  if (ct) ct.textContent = firmen.length;
  if (!firmen.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px;text-align:center;">Keine Firmen gefunden.</div>';
    return;
  }
  el.innerHTML = firmen.map(f => {
    const nutzerAnz = USERS.filter(u => u.firmaId === f.id).length;
    const c = FIRMA_TYP_COLOR[f.typ]||'#666', bg = FIRMA_TYP_BG[f.typ]||'#f9fafb';
    const badge = `<span style="background:${bg};color:${c};border:1px solid ${c}44;border-radius:999px;
      padding:2px 9px;font-size:11px;font-weight:700;">${FIRMA_TYP_LABEL[f.typ]||f.typ}</span>`;
    const extras = [];
    if (f.provision) extras.push(`Provision: ${f.provision}%`);
    if (f.kundennummer) extras.push(`KD-Nr: ${f.kundennummer}`);
    return `<div onclick="azOpenFirmaDetail('${f.id}')"
      style="border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;
      transition:box-shadow .15s,border-color .15s;background:#fff;"
      onmouseenter="this.style.boxShadow='0 2px 12px rgba(0,0,0,.08)';this.style.borderColor='#a5b4fc'"
      onmouseleave="this.style.boxShadow='';this.style.borderColor='var(--line)'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;">${f.name}</div>
          <div style="margin-top:5px;">${badge}</div>
          ${extras.length ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">${extras.join(' · ')}</div>` : ''}
        </div>
        <div style="flex-shrink:0;font-size:12px;color:var(--muted);text-align:right;">
          ${nutzerAnz} Benutzer
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Slide-In ──
function azCloseDetail() {
  const panel   = document.getElementById('az-detail');
  const overlay = document.getElementById('az-detail-overlay');
  if (panel)   panel.style.transform   = 'translateX(100%)';
  if (overlay) overlay.style.display   = 'none';
  _azDetailOpen = false;
}
function _azShowDetail(html) {
  const panel   = document.getElementById('az-detail');
  const overlay = document.getElementById('az-detail-overlay');
  const content = document.getElementById('az-detail-content');
  if (!panel || !content) return;
  content.innerHTML = html;
  overlay.style.display = 'block';
  requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; });
  _azDetailOpen = true;
}

// ── Benutzer-Detail (6 Blöcke) ──
function azOpenUserDetail(userId) {
  const u = USERS.find(x => x.id === userId);
  if (!u) return;
  const F  = FIRMS.find(f => f.id === u.firmaId);
  const R  = ROLES.find(r => r.id === u.rolle);
  const ks = typeof getEffectiveKontoStatus === 'function' ? getEffectiveKontoStatus(u) : 'aktiv';
  const mp = u.module_permissions || {};
  const noMod = !mp.messeflow && !mp.crm && !mp.angebote;

  // Block 1
  const firmaOpts = FIRMS.map(f => `<option value="${f.id}" ${u.firmaId===f.id?'selected':''}>${f.name}</option>`).join('');
  const b1 = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div><label style="font-size:11px;color:var(--muted);font-weight:700;display:block;margin-bottom:4px;">NAME</label>
        <input id="azd-name" value="${u.name.replace(/"/g,'&quot;')}"
          style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;"></div>
      <div><label style="font-size:11px;color:var(--muted);font-weight:700;display:block;margin-bottom:4px;">E-MAIL</label>
        <input id="azd-email" value="${(u.email||'').replace(/"/g,'&quot;')}"
          style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;"></div>
    </div>
    <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div><label style="font-size:11px;color:var(--muted);font-weight:700;display:block;margin-bottom:4px;">FIRMA</label>
        <select id="azd-firma" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">${firmaOpts}</select></div>
      <div><label style="font-size:11px;color:var(--muted);font-weight:700;display:block;margin-bottom:4px;">STATUS</label>
        <div style="padding:8px 0;">${_azStatusBadge(ks)}</div></div>
    </div>`;

  // Block 2
  const b2 = `<div style="display:flex;flex-direction:column;gap:6px;">` +
    ROLES.map(r => `<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;
      border:1px solid ${u.rolle===r.id?'#1e1b4b':'var(--line)'};border-radius:8px;cursor:pointer;
      font-size:13px;background:${u.rolle===r.id?'#eef2ff':'#fff'};min-height:40px;">
      <input type="radio" name="azd-rolle" value="${r.id}" ${u.rolle===r.id?'checked':''}
        style="accent-color:#1e1b4b;"> ${r.label}</label>`).join('') + `</div>`;

  // Block 3
  const b3 = `
    ${noMod ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;
      font-size:12px;color:#dc2626;margin-bottom:10px;">⚠ Kein Modul aktiv – Benutzer kann sich nicht anmelden!</div>` : ''}
    <div style="display:flex;flex-direction:column;gap:10px;">
      <label style="display:flex;align-items:center;gap:12px;font-size:13px;cursor:pointer;min-height:36px;">
        <input type="checkbox" id="azd-mod-mf" ${mp.messeflow?'checked':''}
          style="accent-color:#0369a1;width:17px;height:17px;" onchange="_azCheckModulWarn()">
        <span style="background:#e0f2fe;color:#0369a1;border-radius:4px;padding:2px 10px;font-weight:700;font-size:12px;">MesseFlow</span></label>
      <label style="display:flex;align-items:center;gap:12px;font-size:13px;cursor:pointer;min-height:36px;">
        <input type="checkbox" id="azd-mod-cc" ${mp.crm?'checked':''}
          style="accent-color:#7c3aed;width:17px;height:17px;" onchange="_azCheckModulWarn()">
        <span style="background:#f3e8ff;color:#7c3aed;border-radius:4px;padding:2px 10px;font-weight:700;font-size:12px;">CC Intern</span></label>
      <label style="display:flex;align-items:center;gap:12px;font-size:13px;cursor:pointer;min-height:36px;">
        <input type="checkbox" id="azd-mod-fusa" ${(mp.angebote||mp.fusa)?'checked':''}
          style="accent-color:#b45309;width:17px;height:17px;" onchange="_azCheckModulWarn()">
        <span style="background:#fef3c7;color:#b45309;border-radius:4px;padding:2px 10px;font-weight:700;font-size:12px;">FUSA</span></label>
    </div>
    <div id="azd-mod-warn" style="display:${noMod?'block':'none'};background:#fef2f2;border:1px solid #fecaca;
      border-radius:8px;padding:8px 12px;font-size:12px;color:#dc2626;margin-top:10px;">Mindestens 1 Modul aktivieren!</div>`;

  // Block 4
  const userProjs = MesseFlowState.projects.filter(p => p.projektMitglieder?.some(m => m.userId === userId));
  const b4 = (userProjs.length
    ? userProjs.map(p => {
        const m = p.projektMitglieder.find(x => x.userId === userId);
        const tags = [];
        if (m) {
          if (m.zugriff) tags.push(m.zugriff);
          if (m.preiseSichtbar) tags.push('Preise sehen');
        }
        return `<div style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
          <div style="font-weight:700;font-size:13px;">${p.name}</div>
          <div style="font-size:11px;color:var(--muted);">${p.kunde}</div>
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">${tags.map(t =>
            `<span style="background:#f1f5f9;color:#334155;border-radius:4px;padding:1px 7px;font-size:11px;">${t}</span>`).join('')}</div>
        </div>`;
      }).join('')
    : `<div style="color:var(--muted);font-size:13px;margin-bottom:10px;">Keine Projektzuweisungen.</div>`) +
    `<button class="btn ghost sm" style="width:100%;margin-top:4px;"
      onclick="toast('Info','Projekt-Zuweisung in den Projektdetails verwalten.','ty')">+ Projekt hinzufügen</button>`;

  // Block 5
  const canInvite = !(typeof mfUserIsLegacyKonto==='function' && mfUserIsLegacyKonto(u)
    && !(typeof mfUserNeedsInviteFlow==='function' && mfUserNeedsInviteFlow(u)));
  const canMagicLogin = u.passwordHash && u.passwordSalt && u.aktiv !== false && u.kontoStatus !== 'deaktiviert'
    && !(typeof mfUserNeedsInviteFlow === 'function' && mfUserNeedsInviteFlow(u));
  const isGesperrt = u.status === 'gesperrt' || ks === 'gesperrt';
  const b5 = `<div style="margin-bottom:10px;">${_azStatusBadge(ks)}</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${canInvite ? `<button class="btn ghost sm" style="text-align:left;min-height:40px;"
        onclick="openEinladungsaktionenModal('${u.id}')">🔗 Einladung / Link neu senden</button>` : ''}
      ${canMagicLogin ? `<button class="btn ghost sm" style="text-align:left;min-height:40px;"
        onclick="openMagicLoginModal('${u.id}')">🔑 Magic-Link Anmeldung (15 Min.)</button>` : ''}
      ${u.id!==currentUserId ? `<button class="btn ghost sm" style="text-align:left;min-height:40px;"
        onclick="adminToggleKontoSperre('${u.id}');setTimeout(()=>azOpenUserDetail('${u.id}'),200)">
        ${isGesperrt?'✓ Zugang aktivieren':'🔒 Zugang sperren'}</button>` : ''}
      ${u.id!==currentUserId ? `<button class="btn ghost sm" style="color:var(--red);text-align:left;min-height:40px;"
        onclick="adminDeactivateUserAccount('${u.id}')">Deaktivieren</button>` : ''}
    </div>`;

  // Block 6 — Audit-Log (mfAudit / MesseFlowState.auditLog)
  const logs = (MesseFlowState.auditLog || []).filter(e => {
    if (e.userId === userId) return true;
    const m = e.meta || {};
    if (m.userId === userId || m.entferntUserId === userId || m.zielUserId === userId || m.hinzugefuegtUserId === userId) return true;
    return false;
  }).slice(0, 20);
  const b6 = logs.length
    ? `<div style="font-size:12px;">` + logs.map(e =>
        `<div style="padding:6px 0;border-bottom:1px solid var(--line);">
          <div style="font-weight:600;">${e.action || '–'}</div>
          <div style="color:var(--muted);font-size:11px;">${e.tsDisplay || (e.ts ? new Date(e.ts).toLocaleString('de-DE') : '–')} · ${e.userName || '–'}</div>
        </div>`).join('') + '</div>'
    : `<div style="color:var(--muted);font-size:13px;">Noch keine Protokolleinträge.</div>`;

  _azShowDetail(
    _azDetailHeader(u.name, `${R?.label||u.rolle} · ${F?.name||'–'}`) +
    _azBlock('Block 1 – Stammdaten', b1) +
    _azBlock('Block 2 – Systemrolle', b2) +
    _azBlock('Block 3 – Modul-Zugriff', b3, '#0369a1') +
    _azBlock('Block 4 – Projekt-Zugriff', b4) +
    _azBlock('Block 5 – Einladung / Login', b5) +
    _azBlock('Block 6 – Protokoll / Historie', b6, '#4b5563') +
    `<div style="padding:16px 20px;border-top:1px solid var(--line);background:#fff;position:sticky;bottom:0;">
      <button class="btn primary" style="width:100%;min-height:44px;" onclick="azSaveUserDetail('${u.id}')">Änderungen speichern</button>
    </div>`
  );
}

function _azCheckModulWarn() {
  const ok = document.getElementById('azd-mod-mf')?.checked
          || document.getElementById('azd-mod-cc')?.checked
          || document.getElementById('azd-mod-fusa')?.checked;
  const w = document.getElementById('azd-mod-warn');
  if (w) w.style.display = ok ? 'none' : 'block';
}

function azSaveUserDetail(userId) {
  const u = USERS.find(x => x.id === userId);
  if (!u) return;
  const mf   = document.getElementById('azd-mod-mf')?.checked;
  const cc   = document.getElementById('azd-mod-cc')?.checked;
  const fusa = document.getElementById('azd-mod-fusa')?.checked;
  if (!mf && !cc && !fusa) { toast('Fehler','Mindestens 1 Modul muss aktiv sein.'); return; }
  const name  = document.getElementById('azd-name')?.value.trim();
  if (!name) { toast('Fehler','Name darf nicht leer sein.'); return; }
  u.name  = name;
  u.email = document.getElementById('azd-email')?.value.trim() || u.email;
  const firma = document.getElementById('azd-firma')?.value;
  if (firma) u.firmaId = firma;
  const rolle = document.querySelector('input[name="azd-rolle"]:checked')?.value;
  if (rolle) u.rolle = rolle;
  if (!u.module_permissions) u.module_permissions = {};
  u.module_permissions.messeflow = !!mf;
  u.module_permissions.crm       = !!cc;
  u.module_permissions.angebote  = !!fusa;
  if (typeof mfAudit==='function') mfAudit({ action:'benutzer_bearbeitet', meta:{ userId, name } });
  toast('Gespeichert', `${name} aktualisiert.`, 'tg');
  if (typeof refreshProjectUI==='function') refreshProjectUI();
  renderAdminView();
  setTimeout(() => azOpenUserDetail(userId), 150);
}

// ── Neuer Benutzer (Slide-In) ──
function azOpenNewUserSlide() {
  const rolleOpts = ROLES.map(r => `<option value="${r.id}">${r.label}</option>`).join('');
  const firmaOpts = '<option value="">– Firma wählen –</option>' +
    FIRMS.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  _azShowDetail(
    _azDetailHeader('+ Benutzer einladen', 'Konto anlegen → Einladungslink wird erzeugt') +
    `<div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
      <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">NAME *</label>
        ${_azInp('an-name','z.B. Max Mustermann')}</div>
      <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">E-MAIL (optional)</label>
        ${_azInp('an-email','name@firma.de','email')}</div>
      <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">ROLLE</label>
        <select id="an-rolle" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">${rolleOpts}</select></div>
      <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">FIRMA *</label>
        <select id="an-firma" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">${firmaOpts}</select></div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;font-size:12px;color:#1d4ed8;">
        ℹ Nach dem Anlegen wird automatisch ein Einladungslink erzeugt.</div>
      <button class="btn primary" style="min-height:44px;" onclick="adminCreateUser()">Benutzer anlegen + Einladungslink</button>
    </div>`
  );
}

// ── Neue Firma (Slide-In) ──
function azOpenNewFirmaSlide() {
  const typOpts = ['agentur','produktion','intern','partner','kunde']
    .map(t => `<option value="${t}">${FIRMA_TYP_LABEL[t]||t}</option>`).join('');
  const apOpts = '<option value="">– keiner –</option>' +
    USERS.filter(u => u.aktiv!==false).map(u =>
      `<option value="${u.id}">${u.name} (${ROLES.find(r=>r.id===u.rolle)?.label||u.rolle})</option>`).join('');
  const apRolleOpts = ['agentur','zwischenhaendler','produktion'].map(rid => {
    const L = ROLES.find(r => r.id===rid);
    return `<option value="${rid}">${L?L.label:rid}</option>`;
  }).join('');
  _azShowDetail(
    _azDetailHeader('+ Firma anlegen', 'Neue Firma + optionaler Ansprechpartner') +
    `<div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
      <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">FIRMENNAME *</label>
        ${_azInp('af-name','z.B. Agentur Müller','text','oninput="adminUpdateFirmaEinladungBtnState()"')}</div>
      <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">TYP</label>
        <select id="af-typ" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">${typOpts}</select></div>
      <div style="border-top:1px solid var(--line);padding-top:14px;">
        <div style="font-size:12px;font-weight:700;margin-bottom:10px;">Ansprechpartner</div>
        <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">BESTEHENDEN ZUWEISEN</label>
        <select id="af-ap-user" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;margin-bottom:12px;"
          oninput="adminUpdateFirmaEinladungBtnState()">${apOpts}</select>
        <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">ODER NEU ANLEGEN (Name)</label>
        ${_azInp('af-ap-new','Name des Ansprechpartners','text','oninput="adminUpdateFirmaEinladungBtnState()"')}
        <div style="margin-top:8px;">${_azInp('af-ap-email','E-Mail (optional)','email')}</div>
        <div style="margin-top:10px;"><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">ROLLE</label>
          <select id="af-ap-rolle" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">${apRolleOpts}</select></div>
      </div>
      <input type="hidden" id="af-zh-user" value="">
      <div style="display:flex;gap:8px;">
        <button class="btn primary" style="flex:1;min-height:44px;" onclick="adminCreateFirma()">Firma anlegen</button>
        <button class="btn ghost sm" id="af-invite-btn" disabled style="min-height:44px;"
          onclick="adminFirmaMitEinladungAnlegen()">+ Einladungslink</button>
      </div>
    </div>`
  );
  setTimeout(() => adminUpdateFirmaEinladungBtnState(), 50);
}

// ── Firma-Detail (3 Blöcke) ──
function azOpenFirmaDetail(firmaId) {
  const f = FIRMS.find(x => x.id === firmaId);
  if (!f) return;
  const nutzer  = USERS.filter(u => u.firmaId === firmaId);
  const projekte = MesseFlowState.projects.filter(p =>
    p.agentur_id === firmaId ||
    p.agentur_ids?.includes(firmaId) ||
    nutzer.some(u => p.zwischenhaendler_id === u.id)
  );
  const c = FIRMA_TYP_COLOR[f.typ]||'#666', bg = FIRMA_TYP_BG[f.typ]||'#f9fafb';
  const typBadge = `<span style="background:${bg};color:${c};border:1px solid ${c}44;border-radius:999px;
    padding:2px 9px;font-size:12px;font-weight:700;">${FIRMA_TYP_LABEL[f.typ]||f.typ}</span>`;
  const typOpts = ['intern','agentur','produktion','partner','kunde'].map(t =>
    `<option value="${t}" ${f.typ===t?'selected':''}>${FIRMA_TYP_LABEL[t]||t}</option>`).join('');

  const b1 = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div><label style="font-size:11px;color:var(--muted);font-weight:700;display:block;margin-bottom:4px;">FIRMENNAME</label>
        <input id="azfd-name" value="${f.name.replace(/"/g,'&quot;')}"
          style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;"></div>
      <div><label style="font-size:11px;color:var(--muted);font-weight:700;display:block;margin-bottom:4px;">TYP</label>
        <select id="azfd-typ" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;">${typOpts}</select></div>
      <div><label style="font-size:11px;color:var(--muted);font-weight:700;display:block;margin-bottom:4px;">KUNDENNUMMER</label>
        <input id="azfd-kd" value="${f.kundennummer||''}"
          style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;"></div>
      <div><label style="font-size:11px;color:var(--muted);font-weight:700;display:block;margin-bottom:4px;">PROVISION %</label>
        <input id="azfd-prov" type="number" min="0" max="100" value="${f.provision||''}"
          style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;box-sizing:border-box;"></div>
    </div>`;

  const b2 = (nutzer.length
    ? nutzer.map(u => {
        const R  = ROLES.find(r => r.id === u.rolle);
        const ks = typeof getEffectiveKontoStatus==='function' ? getEffectiveKontoStatus(u) : 'aktiv';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);">
          <div>
            <div style="font-weight:600;font-size:13px;">${u.name}</div>
            <div style="font-size:11px;color:var(--muted);">${u.email||'–'} · ${R?.label||u.rolle}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">${_azStatusBadge(ks)}
            <button class="btn ghost sm" style="min-height:36px;" onclick="azOpenUserDetail('${u.id}')">→</button>
          </div>
        </div>`;
      }).join('')
    : `<div style="color:var(--muted);font-size:13px;margin-bottom:10px;">Noch keine Benutzer.</div>`) +
    `<button class="btn ghost sm" style="width:100%;margin-top:10px;min-height:40px;"
      onclick="azOpenNewUserSlide()">+ Ansprechpartner hinzufügen</button>`;

  const b3 = projekte.length
    ? projekte.map(p => `<div style="padding:8px 0;border-bottom:1px solid var(--line);">
        <div style="font-weight:600;font-size:13px;">${p.name}</div>
        <div style="font-size:11px;color:var(--muted);">${p.kunde} · ${p.status||'–'}</div>
      </div>`).join('')
    : `<div style="color:var(--muted);font-size:13px;">Keine Projekte verknüpft.</div>`;

  _azShowDetail(
    _azDetailHeader(f.name, typBadge) +
    _azBlock('Block 1 – Firmendaten', b1) +
    _azBlock('Block 2 – Ansprechpartner', b2) +
    _azBlock('Block 3 – Zugewiesene Projekte (nur Anzeige)', b3, '#4b5563') +
    `<div style="padding:16px 20px;border-top:1px solid var(--line);background:#fff;position:sticky;bottom:0;display:flex;gap:8px;">
      <button class="btn primary" style="flex:1;min-height:44px;" onclick="azSaveFirmaDetail('${f.id}')">Änderungen speichern</button>
      ${!USERS.some(u=>u.firmaId===f.id) ? `<button class="btn ghost sm" style="color:var(--red);min-height:44px;"
        onclick="adminDeleteFirma('${f.id}')">Löschen</button>` : ''}
    </div>`
  );
}

function azSaveFirmaDetail(firmaId) {
  const f = FIRMS.find(x => x.id === firmaId);
  if (!f) return;
  const name = document.getElementById('azfd-name')?.value.trim();
  if (!name) { toast('Fehler','Firmenname darf nicht leer sein.'); return; }
  f.name = name;
  f.typ  = document.getElementById('azfd-typ')?.value || f.typ;
  f.kundennummer = document.getElementById('azfd-kd')?.value.trim() || '';
  const prov = parseFloat(document.getElementById('azfd-prov')?.value);
  f.provision = isNaN(prov) ? undefined : prov;
  if (typeof mfAudit==='function') mfAudit({ action:'firma_bearbeitet', meta:{ firmaId, name } });
  toast('Gespeichert', `${name} aktualisiert.`, 'tg');
  if (typeof refreshUserDropdown==='function') refreshUserDropdown();
  renderAdminView();
  setTimeout(() => azOpenFirmaDetail(firmaId), 150);
}

// ── Haupt-Render ──
function renderAdminView() {
  if (role !== 'admin') return;

  const userFilters = [
    {v:'alle',l:'Alle'},{v:'aktiv',l:'Aktiv'},{v:'gesperrt',l:'Gesperrt'},
    {v:'eingeladen',l:'Eingeladen'},{v:'extern',l:'Extern'},{v:'intern',l:'Intern'},{v:'admin',l:'Admin'},
  ];
  const firmaFilters = [
    {v:'alle',l:'Alle'},{v:'intern',l:'Intern'},{v:'agentur',l:'Agentur'},
    {v:'produktion',l:'Produktion'},{v:'partner',l:'Partner'},{v:'kunde',l:'Kunde'},
  ];

  document.getElementById('view').innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden;position:relative;">

      <!-- TOP-BAR -->
      <div style="display:flex;align-items:center;gap:10px;padding:12px 20px;
        border-bottom:1px solid var(--line);background:#fff;flex-wrap:wrap;flex-shrink:0;z-index:10;">
        <div style="font-size:17px;font-weight:800;color:#1e1b4b;white-space:nowrap;">⚙ Admin-Zentrale</div>
        <input id="az-search" type="search" placeholder="Benutzer / Firma / E-Mail suchen…"
          oninput="azSearch()"
          style="flex:1;min-width:140px;padding:8px 12px;border:1px solid var(--line);
          border-radius:8px;font-size:13px;height:38px;box-sizing:border-box;">
        <button class="btn primary sm" style="white-space:nowrap;min-height:38px;"
          onclick="azOpenNewUserSlide()">+ Benutzer einladen</button>
        <button class="btn ghost sm" style="white-space:nowrap;min-height:38px;"
          onclick="azOpenNewFirmaSlide()">+ Firma anlegen</button>
        <button class="btn ghost sm" style="white-space:nowrap;min-height:38px;"
          onclick="adminViewOpen=false;refreshProjectUI();">← Projekte</button>
      </div>

      <!-- HAUPTBEREICH: 2-spaltig -->
      <div id="az-main" style="display:flex;flex:1;overflow:hidden;">

        <!-- LINKS: Benutzerliste -->
        <div style="flex:1;overflow-y:auto;padding:16px 12px 16px 20px;min-width:0;border-right:1px solid var(--line);">
          <div style="font-size:13px;font-weight:700;color:#1e1b4b;margin-bottom:10px;">
            👤 Benutzer
            <span id="az-user-count" style="font-weight:400;color:var(--muted);font-size:12px;margin-left:6px;">${USERS.length}</span>
          </div>
          ${_azFilterBar(userFilters, _azFilterUser, 'azSetFilterUser')}
          <div id="az-user-list"></div>
        </div>

        <!-- RECHTS: Firmenliste -->
        <div style="flex:1;overflow-y:auto;padding:16px 20px 16px 12px;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:#1e1b4b;margin-bottom:10px;">
            🏢 Firmen
            <span id="az-firma-count" style="font-weight:400;color:var(--muted);font-size:12px;margin-left:6px;">${FIRMS.length}</span>
          </div>
          ${_azFilterBar(firmaFilters, _azFilterFirma, 'azSetFilterFirma')}
          <div id="az-firma-list"></div>
        </div>

      </div>

      <!-- SLIDE-IN OVERLAY -->
      <div id="az-detail-overlay" onclick="if(event.target===this)azCloseDetail()"
        style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.28);z-index:200;"></div>
      <div id="az-detail"
        style="position:fixed;top:0;right:0;width:460px;max-width:100vw;height:100vh;
        background:#fff;box-shadow:-4px 0 32px rgba(0,0,0,.14);
        transform:translateX(100%);transition:transform .25s ease;z-index:201;
        display:flex;flex-direction:column;overflow:hidden;">
        <div id="az-detail-content" style="flex:1;overflow-y:auto;"></div>
      </div>

    </div>`;

  _azRenderUserList();
  _azRenderFirmaList();
}

window.adminViewOpen      = adminViewOpen;
window.openAdminView      = openAdminView;
window.closeAdminView     = closeAdminView;
window.renderAdminView    = renderAdminView;
window.genInviteLink      = genInviteLink;
window.openEinladungsaktionenModal = openEinladungsaktionenModal;
window.openMagicLoginModal = openMagicLoginModal;
window.adminRegenerateInvite = adminRegenerateInvite;
window.adminDeactivateUserAccount = adminDeactivateUserAccount;
window.adminToggleKontoSperre = adminToggleKontoSperre;
window.adminSetUserRolle  = adminSetUserRolle;
window.adminSetUserFirma  = adminSetUserFirma;
window.adminToggleAktiv   = adminToggleAktiv;
window.adminCreateUser    = adminCreateUser;
window.adminCreateFirma   = adminCreateFirma;
window.adminFirmaMitEinladungAnlegen = adminFirmaMitEinladungAnlegen;
window.adminUpdateFirmaEinladungBtnState = adminUpdateFirmaEinladungBtnState;
window.adminCopyInviteFromModal = adminCopyInviteFromModal;
window.adminDeleteFirma   = adminDeleteFirma;
window.adminProjAgentur   = adminProjAgentur;
window.adminProjProduktionTyp = adminProjProduktionTyp;
// Neue Admin-Zentrale UI
window.azSetFilterUser    = azSetFilterUser;
window.azSetFilterFirma   = azSetFilterFirma;
window.azSearch           = azSearch;
window.azOpenUserDetail   = azOpenUserDetail;
window.azOpenFirmaDetail  = azOpenFirmaDetail;
window.azCloseDetail      = azCloseDetail;
window.azSaveUserDetail   = azSaveUserDetail;
window.azSaveFirmaDetail  = azSaveFirmaDetail;
window.azOpenNewUserSlide = azOpenNewUserSlide;
window.azOpenNewFirmaSlide = azOpenNewFirmaSlide;
window._azCheckModulWarn  = _azCheckModulWarn;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUELLE: js/ui/bettinaView.js  —  Koordinations-Ansicht (Nur-Lese-Übersicht)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ═══════════════════════════════════════════════════════
function renderBettinaView(){
  const rows=getVisibleProjects(currentUserId).map(p=>{
    const amp=projAmpel(p);
    const st = getProjektStatusMeta(p.status || 'Neu');
    let dlStr = '–';
    if (p.auftragsInfo && p.auftragsInfo.liefertermin) {
      dlStr = p.auftragsInfo.liefertermin;
    } else if (p.deadline) {
      const dl = new Date(p.deadline);
      if (!isNaN(+dl)) dlStr = dl.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
    }
    const druckf=p.waende.filter(w=>w.status===5).length;

    const wandRows=p.waende.map(w=>{
      const dot=ST_DOT[w.status];
      return `<tr>
        <td style="padding:6px 12px 6px 24px;font-size:13px;color:var(--muted);">${w.name}</td>
        <td style="padding:6px 12px;">
          <span class="ampel ${dot}" style="display:inline-block;vertical-align:middle;margin-right:6px;"></span>
          <span style="font-size:12px;${w.status===6?'color:var(--red);font-weight:700;':w.status===7?'color:var(--yellow);font-weight:700;':w.status===9?'color:#5b21b6;font-weight:700;':''}">${ST_LABELS[w.status]}</span>
        </td>
        <td style="padding:6px 12px;font-size:12px;color:var(--muted);">${w.datei||'–'}</td>
        <td style="padding:6px 12px;font-size:12px;">
          ${(()=>{
            if(!w.bestellmass) return '<span style="color:var(--muted)">–</span>';
            const vgl = (w.bestellmass&&w.dateiMass) ? vergleicheMasse(w.bestellmass,w.dateiMass) : null;
            const diff = vgl&&vgl.maxDiff!==null ? ` <span style="color:${vgl.stufe==='ok'?'var(--green)':vgl.stufe==='warnung'?'var(--yellow)':'var(--red)'};font-weight:700;">Δ ${fmm(vgl.maxDiff)}</span>` : '';
            return `${w.bestellmass}${w.dateiMass?' / '+w.dateiMass:''}${diff}`;
          })()}
        </td>
      </tr>`;
    }).join('');

    return `
      <tr onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'" style="cursor:pointer;">
        <td style="padding:11px 12px;">
          <span class="ampel ${amp}" style="display:inline-block;vertical-align:middle;margin-right:7px;"></span>
          <span class="bv-proj-name">${p.name}</span>
          <div class="bv-proj-deadline">${p.kunde} · Deadline: ${dlStr}</div>
          <div style="display:inline-block;margin-top:4px;font-size:10px;font-weight:700;color:${st.cl};background:${st.bg};border:1px solid ${st.bd};border-radius:999px;padding:2px 7px;">${p.status || 'Neu'}</div>
        </td>
        <td style="padding:11px 12px;text-align:center;">
          <span style="font-size:13px;font-weight:700;color:${amp==='gruen'?'var(--green)':amp==='gelb'?'var(--yellow)':'var(--red)'};">${druckf} / ${p.waende.length}</span>
          <div style="font-size:11px;color:var(--muted);">druckfertig</div>
        </td>
        <td style="padding:11px 12px;text-align:right;">
          <span style="font-size:11px;color:var(--muted);">▼ Details</span>
        </td>
      </tr>
      <tr style="display:none;">
        <td colspan="3" style="padding:0;">
          <table style="width:100%;border-collapse:collapse;background:#fafafa;">
            <tr style="background:#f3f4f6;">
              <th style="text-align:left;padding:6px 12px 6px 24px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Wand</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Status</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Datei</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Maße</th>
            </tr>
            ${wandRows}
          </table>
        </td>
      </tr>`;
  }).join('');

  document.getElementById('view').innerHTML=`
    <div class="status-banner" style="margin-bottom:0;">
      <div class="sb-title" style="font-size:18px;margin-bottom:4px;">Übersicht – alle Projekte</div>
      <div style="font-size:13px;color:var(--muted);">Nur-Lese-Ansicht · Bettina (Koordination)</div>
    </div>

    <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;">
      <div style="padding:12px 14px;background:#fafafa;border-bottom:1px solid var(--line);display:flex;gap:16px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;"><span class="ampel gruen"></span>Druckfertig</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;"><span class="ampel gelb"></span>In Bearbeitung</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;"><span class="ampel rot"></span>Fehlt etwas</div>
      </div>
      <table id="bettina-view" class="bv-table" style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th>Projekt / Auftraggeber</th>
          <th style="text-align:center;">Fortschritt</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="role-notice rn-bettina" style="margin-top:4px;">
      📋 <strong>Koordination:</strong> Nur Statusübersicht. Klick auf Projekt-Zeile für Details.
    </div>
  `;
}

window.renderBettinaView = renderBettinaView;

