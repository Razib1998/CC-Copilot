// ═══════════════════════════════════════════════════════════════════════════════
// MESSEFLOW STATE  ←  Quelle: Messeflow/DEV/state.js
// Ziel: messeflow-state.js (logic/)
//
// Enthält:
//   • Datenkonstanten:    FIRMS, MODULES, ROLES, USERS, MF_DEMO_PROJECTS
//   • State-Variablen:    currentUserId, activeProjId, role, notifOpen, state
//   • Helper-Getter:      getP(), getW(), nowStr()
//   • Alle State-Funktionen (Rechte, Team, Projekt, Datei-Workflow, ...)
//
// TODO Cockpit-Umzug:
//   - FIRMS / USERS werden aus dem CC-Cockpit-Datenmodell bezogen
//   - MF_DEMO_PROJECTS nur in DEV-Modus aktiv
//   - State-Variablen in das Cockpit-State-Management einbetten
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// FIRMS
// ═══════════════════════════════════════════════════════
/** Wird im Cockpit per `mfLoadCockpitData` aus GET /api/v1/firmen befüllt. */
let FIRMS = [];

const FIRMA_TYP_LABEL = { agentur: 'Agentur', produktion: 'Produktion', intern: 'Intern', partner: 'Partner', kunde: 'Kunde' };
const FIRMA_TYP_COLOR = { agentur: '#1e40af', produktion: '#166534', intern: '#78350f', partner: '#6b7280', kunde: '#0f766e' };
const FIRMA_TYP_BG    = { agentur: '#eff6ff', produktion: '#f0fdf4', intern: '#fffbeb', partner: '#f9fafb', kunde: '#ccfbf1' };

// ═══════════════════════════════════════════════════════
// MODULES (global – gilt für das gesamte CC-Intern-System)
// ═══════════════════════════════════════════════════════
const MODULES = [
  { id: 'messeflow',  name: 'MesseFlow',  icon: '📐', beschreibung: 'Messe-Projekte, Datei-Upload, Freigaben' },
  { id: 'crm',        name: 'CRM',        icon: '👤', beschreibung: 'Kunden- & Kontaktverwaltung'              },
  { id: 'angebote',   name: 'Angebote',   icon: '📋', beschreibung: 'Angebote & Aufträge'                      },
  { id: 'produktion', name: 'Produktion', icon: '🏭', beschreibung: 'Produktionssteuerung & Aufträge'          },
];

// ═══════════════════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════════════════
const MF_BUILTIN_ROLES = [
  {
    id: 'admin',
    label: 'Administrator',
    color: '#78350f',
    bg: '#fffbeb',
    permissions: {
      seeAll: true,           // Sieht alle Projekte
      editAll: true,          // Darf alles bearbeiten
      manageUsers: true,      // Darf Benutzer, Firmen und Zuweisungen verwalten
      seeInternalNotes: true, // Darf interne Notizen sehen
      editProduction: true,   // Darf Produktionsstatus bearbeiten
    }
  },
  {
    id: 'cc_intern',
    label: 'CC Intern',
    color: '#9333ea',
    bg: '#faf5ff',
    permissions: {
      seeAll: true,           // Sieht alle Projekte (wie Admin)
      editAll: true,          // Darf alles bearbeiten
      manageUsers: false,     // Keine Benutzerverwaltung (nur Admin)
      seeInternalNotes: true, // Darf interne Notizen sehen
      editProduction: true,   // Darf Produktionsstatus bearbeiten
    }
  },
  {
    id: 'zwischenhaendler',
    label: 'Zwischenhändler',
    color: '#0f766e',
    bg: '#f0fdfa',
    permissions: {
      seeAll: false,          // Sieht nur eigene/zugewiesene Projekte
      editAll: false,         // Keine globale Bearbeitung
      manageUsers: false,     // Keine Benutzerverwaltung
      seeInternalNotes: false,// Keine internen Notizen
      editProduction: false,  // Kein Produktions-Edit
    }
  },
  {
    id: 'agentur',
    label: 'Agentur',
    color: '#1e40af',
    bg: '#eff6ff',
    permissions: {
      seeAll: false,          // Sieht nur eigene Projekte
      editAll: false,         // Darf Dateien hochladen und Rückmeldungen
      manageUsers: false,     // Keine Benutzerverwaltung
      seeInternalNotes: false,// Darf keine internen Notizen sehen
      editProduction: false,  // Kein Produktions-Edit
    }
  },
  {
    id: 'produktion',
    label: 'Produktion',
    color: '#166534',
    bg: '#f0fdf4',
    permissions: {
      seeAll: false,          // Sieht NUR explizit freigegebene Aufträge
      editAll: false,         // Kein volles Edit
      manageUsers: false,     // Keine Benutzerverwaltung
      seeInternalNotes: false,// Keine internen Notizen für externe Firmen
      editProduction: true,   // Darf Produktionsstatus bearbeiten
    }
  },
];

/** Laufende Rollenliste = eingebaute MesseFlow-Rollen + optionale Cockpit-Rollenvorlagen. */
let ROLES = MF_BUILTIN_ROLES.slice();

// ═══════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════
const DEMO_PW_SALT = 'TUZfREVNT19TQUxUXzE2QiE=';
const DEMO_PW_HASH = '2e3664d2c8c14729121c102c0ee4a07a83761b1f6bd55bb4944f4eeb6a59a7f3';

/** Wird im Cockpit per `mfLoadCockpitData` aus `window.COCKPIT_USERS` bzw. GET /api/v1/users befüllt. */
let USERS = [];

// ═══════════════════════════════════════════════════════
// COCKPIT-INTEGRATION: FIRMS + USERS aus Cockpit-API laden
// ═══════════════════════════════════════════════════════
// Aufruf in messeflowCockpitBoot() nach API-Fetch:
//   const r = await fetch('/api/v1/users', { headers: { Authorization: 'Bearer ' + token } });
//   const r2 = await fetch('/api/v1/firmen', { headers: { Authorization: 'Bearer ' + token } });
//   mfLoadCockpitData(await r.json(), await r2.json());

/**
 * @param {Record<string, unknown>} u
 * @returns {Record<string, unknown>}
 */
function mfMapCockpitUserRow(u) {
  const gr = String(u.global_role || u.role || u.rolle || 'INTERN').toUpperCase();
  const isAdmin = gr === 'SUPER_ADMIN';
  const firmaFromApi =
    u.firma_id != null ? String(u.firma_id)
    : u.companyId != null ? String(u.companyId)
    : null;
  const fallbackFirma = Array.isArray(FIRMS) && FIRMS[0] ? String(FIRMS[0].id) : 'f_cc';
  return {
    id: String(u.id),
    name: u.name || u.username || u.email || String(u.id),
    email: u.email || '',
    firmaId: firmaFromApi || fallbackFirma,
    rolle: isAdmin ? 'admin' : 'cc_intern',
    aktiv: u.aktiv !== false,
    kontoStatus: 'aktiv',
    passwordSalt: null,
    passwordHash: null,
    zugriff: isAdmin ? 'freigeben' : 'bearbeiten',
    preiseSichtbar: isAdmin,
    module_permissions: { messeflow: true, crm: true, angebote: true, produktion: true },
  };
}

/**
 * Befüllt FIRMS und USERS aus Cockpit-API-Antworten (oder `window.COCKPIT_USERS`).
 * @param {{ users?: object[] }|null|undefined} usersResponse   — GET /api/v1/users (nach apiFetch)
 * @param {{ firmen?: object[] }|null|undefined} firmenResponse — GET /api/v1/firmen (nach apiFetch)
 */
function mfLoadCockpitData(usersResponse, firmenResponse) {
  let apiUsers = Array.isArray(usersResponse?.users) ? usersResponse.users : [];
  const apiFirmen = Array.isArray(firmenResponse?.firmen) ? firmenResponse.firmen : [];

  if (apiUsers.length === 0 && typeof window !== 'undefined' && Array.isArray(window.COCKPIT_USERS) && window.COCKPIT_USERS.length) {
    apiUsers = window.COCKPIT_USERS;
  }

  if (apiFirmen.length > 0) {
    FIRMS.length = 0;
    apiFirmen.forEach(f => {
      const rawTyp = f?.typ != null ? String(f.typ).trim().toLowerCase() : '';
      FIRMS.push({
        id: String(f.id),
        name: f.name || f.firmenname || String(f.id),
        typ: rawTyp || 'intern',
        ansprechpartnerUserId: f.ansprechpartner_id || null,
        zwischenhaendlerUserId: null,
      });
    });
  }

  if (apiUsers.length > 0) {
    USERS.length = 0;
    apiUsers.forEach(u => {
      USERS.push(mfMapCockpitUserRow(u));
    });
  }

  console.log('[MF] Cockpit-Daten geladen — Firmen:', FIRMS.length, '| Benutzer:', USERS.length);
}

/**
 * Ergänzt `ROLES` um Einträge aus GET /api/v1/role-templates (ohne die eingebauten MF-Rollen zu entfernen).
 * @param {{ templates?: object[] }|null|undefined} templatesResponse
 */
function mfLoadCockpitRoleTemplates(templatesResponse) {
  const templates = Array.isArray(templatesResponse?.templates) ? templatesResponse.templates : [];
  ROLES.length = 0;
  MF_BUILTIN_ROLES.forEach(r => ROLES.push(r));
  templates.forEach(t => {
    const id = String(t.id || '').trim();
    if (!id || ROLES.some(r => r.id === id)) return;
    ROLES.push({
      id,
      label: t.name || id,
      color: '#374151',
      bg: '#f3f4f6',
      permissions: {
        seeAll: false,
        editAll: false,
        manageUsers: false,
        seeInternalNotes: false,
        editProduction: false,
      },
    });
  });
}

if (typeof window !== 'undefined') {
  window.mfLoadCockpitData = mfLoadCockpitData;
  window.mfLoadCockpitRoleTemplates = mfLoadCockpitRoleTemplates;
}

// ═══════════════════════════════════════════════════════
// PROJEKT-RECHTE (vorbereitet – noch nicht vollständig aktiv)
// Struktur: user → projekt → rolle + rechte
// Beispiel: { userId: 'u2', projektId: 'p1', zugriff: 'lesen', preiseSichtbar: false }
// ═══════════════════════════════════════════════════════
// const PROJEKT_RECHTE = [];

// ═══════════════════════════════════════════════════════
// STATE (Produktion: leer solange MF_USE_DEMO_DATA === false in js/config.js)
// ═══════════════════════════════════════════════════════
const MF_DEMO_PROJECTS = [
  {
    id:'p1',
    name:'NRW Bank – Messe Frankfurt',
    kunde:'Tina Mendel / Bettina',
    deadline:'2025-06-15T10:00',
    status: 'Neu',
    hauptFirma: 'f1',
    beteiligteFirmen: ['f2', 'f3'],
    zugewieseneBenutzer: ['u1', 'u2', 'u3'],
    agentur_id: 'f1',
    zwischenhaendler_id: 'u2',
    produktion_ids: ['f4'],
    projektMitglieder: [
      { userId: 'u_celal',rolle: 'admin',            zugriff: 'freigeben',  preiseSichtbar: true  },
      { userId: 'u3',     rolle: 'admin',            zugriff: 'freigeben',  preiseSichtbar: true  },
      { userId: 'u2',     rolle: 'zwischenhaendler', zugriff: 'lesen',      preiseSichtbar: false },
      { userId: 'u1',     rolle: 'agentur',          zugriff: 'bearbeiten', preiseSichtbar: false },
      { userId: 'u5',     rolle: 'agentur',          zugriff: 'bearbeiten', preiseSichtbar: false },
    ],
    waende:[
      { id:'w1', name:'Wand A', datei:null, dateien:[],               bestellmass:'300 × 250 cm', dateiMass:'',             masseOk:false, abweichungOk:false, status:1 },
      { id:'w2', name:'Wand B', datei:'Wand_B_v1.pdf', dateien:[{ id:'f1', name:'Wand_B_v1.pdf', hochgeladenVon:'u5', hochgeladenAm:'01.05.2025 10:00', version:'v1', status:'Hochgeladen' }],    bestellmass:'400 × 250 cm', dateiMass:'380 × 250 cm', masseOk:false, abweichungOk:false, status:1 },
      { id:'w3', name:'Wand C', datei:'Wand_C_v2.pdf', dateien:[{ id:'f2', name:'Wand_C_v2.pdf', hochgeladenVon:'u5', hochgeladenAm:'01.05.2025 10:00', version:'v2', status:'Hochgeladen' }],    bestellmass:'200 × 250 cm', dateiMass:'201 × 250 cm', masseOk:false, abweichungOk:false, status:1 },
      { id:'w4', name:'Wand D', datei:'Wand_D_final.pdf', dateien:[{ id:'f3', name:'Wand_D_final.pdf', hochgeladenVon:'u5', hochgeladenAm:'01.05.2025 10:00', version:'final', status:'Hochgeladen' }], bestellmass:'200 × 250 cm', dateiMass:'200 × 250 cm', masseOk:false, abweichungOk:false, status:1 },
      { id:'w5', name:'Logos',  datei:'Logos_v3.pdf', dateien:[{ id:'f4', name:'Logos_v3.pdf', hochgeladenVon:'u5', hochgeladenAm:'01.05.2025 10:00', version:'v3', status:'Hochgeladen' }],     bestellmass:'40 × 20 cm',   dateiMass:'40 × 20 cm',   masseOk:true,  abweichungOk:false, status:1 },
    ],
  },
  {
    id:'p2',
    name:'AutoZulieferer Hannover',
    kunde:'AutoCorp GmbH',
    deadline:'2025-07-02T08:00',
    status: 'Neu',
    hauptFirma: 'f1',
    beteiligteFirmen: ['f2'],
    zugewieseneBenutzer: ['u1', 'u2'],
    agentur_id: 'f1',
    zwischenhaendler_id: 'u2',
    produktion_ids: [],
    projektMitglieder: [
      { userId: 'u_celal',rolle: 'admin',            zugriff: 'freigeben',  preiseSichtbar: true  },
      { userId: 'u3',     rolle: 'admin',            zugriff: 'freigeben',  preiseSichtbar: true  },
      { userId: 'u2',     rolle: 'zwischenhaendler', zugriff: 'lesen',    preiseSichtbar: false },
      { userId: 'u1',     rolle: 'agentur',        zugriff: 'bearbeiten', preiseSichtbar: false },
    ],
    waende:[
      { id:'w6', name:'Wand A', datei:null, dateien:[], bestellmass:'', dateiMass:'', masseOk:false, abweichungOk:false, status:1 },
      { id:'w7', name:'Wand B', datei:null, dateien:[], bestellmass:'', dateiMass:'', masseOk:false, abweichungOk:false, status:1 },
    ],
  },
];

const MF_DEMO_NOTIFS = [
  { id:'n1', proj:'p1', text:'NRW Bank – Wand B: Abweichung 200 mm erkannt', time:'vor 2h', read:false },
  { id:'n2', proj:'p1', text:'NRW Bank – Wand C: Toleranz-Warnung 30 mm', time:'vor 3h', read:false },
  { id:'n3', proj:'p1', text:'NRW Bank – Wand D hochgeladen', time:'vor 5h', read:true },
];

function mfBuildInitialState() {
  const demo = typeof window !== 'undefined' && window.MF_USE_DEMO_DATA === true;
  return {
    projects: demo ? JSON.parse(JSON.stringify(MF_DEMO_PROJECTS)) : [],
    notifs: demo ? JSON.parse(JSON.stringify(MF_DEMO_NOTIFS)) : [],
    auditLog: [],
  };
}

let currentUserId = '';
let activeProjId = null;
let notifOpen = false;
let role = USERS.find(u => u.id === currentUserId)?.rolle || 'admin';

let state = mfBuildInitialState();

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
const getP  = id => state.projects.find(p=>p.id===id);
const getW  = (p,id) => p.waende.find(w=>w.id===id);
const nowStr= () => { const n=new Date(); return n.toLocaleDateString('de-DE')+' '+n.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}); };

// Globaler Hard-Override: Konto „gesperrt“ — ignoriert Firmen-Standard & Zuweisungen
function isUserGesperrt(user) {
  return !!(user && user.status === 'gesperrt');
}

// Einladung / Aktivierung: kein App-Zugang bis Passwort gesetzt (eingeladen, abgelaufen, deaktiviert)
function userMayUseApp(user) {
  if (!user) return false;
  if (user.aktiv === false) return false;
  if (isUserGesperrt(user)) return false;
  if (user.kontoStatus === 'deaktiviert') return false;
  if (user.kontoStatus === 'eingeladen') return false;
  if (user.kontoStatus === 'einladung_abgelaufen') return false;
  return true;
}

function getEffectiveKontoStatus(user) {
  if (!user) return '—';
  if (isUserGesperrt(user)) return 'gesperrt';
  if (user.kontoStatus === 'deaktiviert') return 'deaktiviert';
  if (user.aktiv === false) return 'deaktiviert';
  if (user.kontoStatus === 'eingeladen') return 'eingeladen';
  if (user.kontoStatus === 'einladung_abgelaufen') return 'einladung_abgelaufen';
  if (user.kontoStatus === 'aktiv') return 'aktiv';
  return 'aktiv';
}

// ─────────────────────────────────────────────────────
// canSeeProject — ZENTRALE Sichtbarkeits-Funktion
// Einzige Stelle wo Projekt-Zugriff geprüft wird.
// Nimmt User-Objekt (nicht userId) und Projekt-Objekt.
// ─────────────────────────────────────────────────────
function canSeeProject(user, projekt) {
  // Cockpit-Embed: CC Intern / Cockpit steuert Zugriff bereits vor dem Mount.
  // MesseFlow darf hier keine zusätzliche Projekt-/Mitgliedschafts-Sperre erzwingen.
  if (typeof window !== 'undefined' && window.__MF_COCKPIT_EMBED) return true;

  if (!user || !userMayUseApp(user)) return false;
  if (isUserGesperrt(user)) return false;

  // Hard-Sperre auf Projekt-Ebene — überschreibt alles (außer Admin)
  if (projekt.sperren?.[user.id]) return false;

  // Admin: sieht immer alles
  if (user.rolle === 'admin') return true;

  // Direkte ID-basierte Zuweisungen (neue Felder aus applyStandardZuweisungen)
  if (
    projekt.agentur_ids?.includes(user.id)     ||
    projekt.koordinator_id === user.id          ||
    projekt.zwischenhaendler_id === user.id     ||
    projekt.intern_ids?.includes(user.id)       ||
    projekt.produktion_ids?.includes(user.id)
  ) return true;

  // Fallback: explizit als Projektmitglied eingetragen (ältere Projekte)
  if (projekt.projektMitglieder?.some(m => m.userId === user.id)) return true;

  return false;
}

// getVisibleProjects — dünner Wrapper, nutzt canSeeProject
function getVisibleProjects(userId) {
  if (typeof window !== 'undefined' && window.__MF_COCKPIT_EMBED) {
    return Array.isArray(state.projects) ? state.projects.slice() : [];
  }
  const user = USERS.find(u => u.id === userId);
  if (!user || !userMayUseApp(user) || isUserGesperrt(user)) return [];
  return state.projects.filter(p => canSeeProject(user, p));
}

// getCurrentUser — Hilfe für direkten Zugriff auf aktuellen User
function getCurrentUser() {
  return USERS.find(u => u.id === currentUserId) || null;
}

function canEditProject(userId, projectId) {
  const user = USERS.find(u => u.id === userId);
  if (!user || isUserGesperrt(user)) return false;
  const userPerm = ROLES.find(r => r.id === user.rolle)?.permissions || {};
  if (userPerm.editAll) return true;
  const m = getProjektMitglied(userId, projectId);
  if (m) return m.zugriff !== 'lesen';
  const projekt = state.projects.find(p => p.id === projectId);
  return projekt ? canSeeProject(user, projekt) : false;
}

function canViewFinance(userId, projektId) {
  return canSeePreise(userId, projektId);
}

function canChangeStatus(userId, projectId, newStatus) {
  const user = USERS.find(u => u.id === userId);
  if (!user || isUserGesperrt(user)) return false;
  const role = user.rolle;
  const allowedStatuses = {
    admin:            ["Neu", "Datei hochgeladen", "In Prüfung", "Freigegeben", "An Druck gesendet", "In Produktion", "Fertig", "Archiviert"],
    cc_intern:        ["Neu", "Datei hochgeladen", "In Prüfung", "Freigegeben", "An Druck gesendet", "In Produktion", "Fertig", "Archiviert"],
    zwischenhaendler: ["Freigegeben"],
    agentur:          ["In Prüfung", "Freigegeben"],
    produktion:       ["In Produktion", "Fertig"],
  };
  return allowedStatuses[role]?.includes(newStatus) || false;
}

function buildDefaultProjectAssignments(userId, project) {
  const user = USERS.find(u => u.id === userId);
  if (!user) return;
  project.hauptFirma = user.firmaId;
  project.beteiligteFirmen = [];
  project.zugewieseneBenutzer = ['u1', 'u2', 'u3', 'u4'];
}

// Festes internes Kernteam (wird bei Standard-Zuweisung immer gesetzt, nie weggelassen)
const FIXED_INTERN_IDS      = ['u_cc_intern', 'u3', 'u_celal']; // Anna (CC), Melanie, Celal
const FIXED_PRODUKTION_IDS  = ['u4'];

// Legacy / Excel-Import: externes Team wenn keine Agentur-Firma übergeben wird
const LEGACY_STD_AGENTUR_IDS    = ['u5'];
const LEGACY_STD_KOORDINATOR_ID = 'u1';
const LEGACY_STD_ZH_ID          = 'u2';

// ─────────────────────────────────────────────────────
// Externes Team aus Agentur-Firma (+ optional ZH-Override im Projekt-Modal)
// ─────────────────────────────────────────────────────
// forExcelImport: nur dann Legacy-Bettina / firmen-hinterlegter ZH automatisch setzen
function resolveExternesTeamFromAgenturFirma(firmaId, zwischenhaendlerOverride, forExcelImport = false) {
  const firma = FIRMS.find(f => f.id === firmaId && f.typ === 'agentur');
  let agenturUserIds = [];
  let koordinatorId = null;
  let zhId = null;

  if (firma) {
    agenturUserIds = USERS.filter(u =>
      u.firmaId === firmaId && u.rolle === 'agentur' && u.aktiv !== false && !isUserGesperrt(u)
    ).map(u => u.id);
    const ap = firma.ansprechpartnerUserId
      ? USERS.find(u => u.id === firma.ansprechpartnerUserId)
      : null;
    if (ap && ap.aktiv !== false && !isUserGesperrt(ap)) {
      koordinatorId = ap.id;
      if (ap.rolle === 'agentur' && !agenturUserIds.includes(ap.id))
        agenturUserIds.unshift(ap.id);
    }
    if (!koordinatorId && agenturUserIds.length) koordinatorId = agenturUserIds[0];
    if (!agenturUserIds.length && koordinatorId) agenturUserIds = [koordinatorId];
    if (forExcelImport) {
      const zhu = firma.zwischenhaendlerUserId
        ? USERS.find(u => u.id === firma.zwischenhaendlerUserId)
        : null;
      if (zhu && zhu.aktiv !== false && !isUserGesperrt(zhu)) zhId = firma.zwischenhaendlerUserId;
    }
  } else {
    agenturUserIds = [...LEGACY_STD_AGENTUR_IDS];
    koordinatorId = LEGACY_STD_KOORDINATOR_ID;
    if (forExcelImport) zhId = LEGACY_STD_ZH_ID;
  }

  if (zwischenhaendlerOverride &&
      USERS.find(u => u.id === zwischenhaendlerOverride && u.aktiv !== false && !isUserGesperrt(u))) {
    zhId = zwischenhaendlerOverride;
  }

  return {
    agenturUserIds: [...new Set(agenturUserIds.filter(Boolean))],
    koordinatorId,
    zhId: zhId || null,
  };
}

// ─────────────────────────────────────────────────────
// applyStandardZuweisungen
// - Internes Team: immer Anna, Melanie, Celal + Produktion (feste IDs)
// - Extern: aus Agentur-Firma (Ansprechpartner, Agentur-User, ZH auf Firma)
//   oder Legacy-Defaults (Excel-Import / alter Aufruf ohne Firma)
// - projektMitglieder wird aus den Feldern neu aufgebaut (extern konsistent)
// ─────────────────────────────────────────────────────
function applyStandardZuweisungen(projekt, externalAgenturFirmaId = null, zwischenhaendlerOverride = null, forExcelImport = false) {
  projekt.intern_ids = [...FIXED_INTERN_IDS];
  projekt.produktion_ids = [...FIXED_PRODUKTION_IDS];

  const ext = resolveExternesTeamFromAgenturFirma(
    externalAgenturFirmaId || null,
    zwischenhaendlerOverride || null,
    forExcelImport
  );

  if (externalAgenturFirmaId && FIRMS.some(f => f.id === externalAgenturFirmaId && f.typ === 'agentur')) {
    projekt.agentur_id = externalAgenturFirmaId;
    projekt.agentur_ids = ext.agenturUserIds;
    projekt.koordinator_id = ext.koordinatorId || ext.agenturUserIds[0] || null;
    projekt.zwischenhaendler_id = ext.zhId;
  } else {
    projekt.agentur_ids = [...LEGACY_STD_AGENTUR_IDS];
    projekt.koordinator_id = LEGACY_STD_KOORDINATOR_ID;
    projekt.zwischenhaendler_id = ext.zhId;
    const firstAg = USERS.find(u => u.id === projekt.agentur_ids[0]);
    projekt.agentur_id = firstAg?.firmaId || null;
  }

  projekt.projektMitglieder = [];
  const existingIds = new Set();

  const addMember = (userId, rolle, zugriff, preiseSichtbar = false) => {
    if (!userId || existingIds.has(userId)) return;
    const u = USERS.find(x => x.id === userId);
    if (!u || u.aktiv === false || isUserGesperrt(u)) return;
    projekt.projektMitglieder.push({ userId, rolle, zugriff, preiseSichtbar });
    existingIds.add(userId);
  };

  (projekt.agentur_ids || []).forEach(uid => addMember(uid, 'agentur', 'bearbeiten', false));
  if (projekt.koordinator_id) addMember(projekt.koordinator_id, 'agentur', 'bearbeiten', false);
  if (projekt.zwischenhaendler_id) addMember(projekt.zwischenhaendler_id, 'zwischenhaendler', 'bearbeiten', true);
  (projekt.intern_ids || []).forEach(uid => {
    const u = USERS.find(x => x.id === uid);
    if (u) addMember(uid, u.rolle, 'freigeben', true);
  });
  (projekt.produktion_ids || []).forEach(uid => addMember(uid, 'produktion', 'bearbeiten', false));
}

function findExistingProject(importData) {
  const { kunde, projektname, liefertermin } = importData;
  return state.projects.find(p =>
    p.kunde === kunde &&
    p.auftragsInfo?.projektname === projektname &&
    p.deadline === liefertermin
  );
}

function getProjektMitglied(userId, projektId) {
  const p = state.projects.find(p => p.id === projektId);
  if (!p || !p.projektMitglieder) return null;
  return p.projektMitglieder.find(m => m.userId === userId) || null;
}

function getProjektZugriff(userId, projektId) {
  const user = USERS.find(u => u.id === userId);
  if (isUserGesperrt(user)) return 'lesen';
  const m = getProjektMitglied(userId, projektId);
  if (m) return m.zugriff || 'lesen';
  if (ROLES.find(r => r.id === user?.rolle)?.permissions?.manageUsers) return 'freigeben';
  return 'lesen';
}

// ═══════════════════════════════════════════════════════
// PROJEKT-ZUGRIFFSRECHTE
// Struktur: p.zugriffsrechte = { userId: { sehen, upload, freigabe, angebote, preise } }
// Kein Eintrag → Default nach Rolle wird verwendet.
// ═══════════════════════════════════════════════════════

const DEFAULT_RECHTE = {
  admin:            { sehen: true,  upload: true,  freigabe: true,  angebote: true,  preise: true,  kommentieren: true,  loeschen: true,  exportieren: true,  einladen: true  },
  cc_intern:        { sehen: true,  upload: true,  freigabe: true,  angebote: true,  preise: false, kommentieren: true,  loeschen: true,  exportieren: true,  einladen: true  },
  zwischenhaendler: { sehen: true,  upload: true,  freigabe: true,  angebote: true,  preise: true,  kommentieren: true,  loeschen: false, exportieren: true,  einladen: false },
  agentur:          { sehen: true,  upload: true,  freigabe: false, angebote: false, preise: false, kommentieren: true,  loeschen: false, exportieren: false, einladen: false },
  produktion:       { sehen: true,  upload: true,  freigabe: false, angebote: false, preise: false, kommentieren: false, loeschen: false, exportieren: false, einladen: false },
};

const ALLE_RECHTE_AUS = { sehen: false, upload: false, freigabe: false, angebote: false, preise: false, kommentieren: false, loeschen: false, exportieren: false, einladen: false };

// Sperre für einen User auf einem Projekt setzen / lesen
function setProjSperre(projektId, userId, gesperrt) {
  const p = state.projects.find(x => x.id === projektId);
  if (!p) return;
  if (!p.sperren) p.sperren = {};
  if (gesperrt) p.sperren[userId] = true;
  else delete p.sperren[userId];
  if (typeof mfAudit === 'function') {
    mfAudit({
      action: gesperrt ? 'projekt_benutzer_gesperrt' : 'projekt_benutzer_entsperrt',
      projectId: projektId,
      meta: { zielUserId: userId },
    });
  }
}
function isProjGesperrt(projektId, userId) {
  const p = state.projects.find(x => x.id === projektId);
  return !!p?.sperren?.[userId];
}

// Effektive Rechte eines Users für ein Projekt
// Priorität: Konto gesperrt > Projekt-Sperre > manuelle Override > Rollen-Default
function getProjRechte(userId, projektId) {
  const user = USERS.find(u => u.id === userId);
  // Cockpit-Kontext: nicht in USERS gefundener User = gültiger Cockpit-User → Admin-Rechte
  if (!user) return { ...DEFAULT_RECHTE.admin };
  if (isUserGesperrt(user)) return { ...ALLE_RECHTE_AUS };
  if (user.aktiv === false) return { ...ALLE_RECHTE_AUS };
  // Projekt-Hard-Sperre → alles aus
  if (isProjGesperrt(projektId, userId)) return { ...ALLE_RECHTE_AUS };
  const p = state.projects.find(x => x.id === projektId);
  const override = p?.zugriffsrechte?.[userId];
  const defaults = DEFAULT_RECHTE[user.rolle] || DEFAULT_RECHTE.agentur;
  // 2. Manuelle Override → gemischt
  // 3. Rollen-Default
  return override ? { ...defaults, ...override } : { ...defaults };
}

// Einzelnes Recht setzen (legt Override an, ignoriert gesperrte User)
function setProjRecht(projektId, userId, recht, val) {
  const target = USERS.find(u => u.id === userId);
  if (isUserGesperrt(target)) return;
  if (isProjGesperrt(projektId, userId)) return; // Sperre hat Vorrang
  const p = state.projects.find(x => x.id === projektId);
  if (!p) return;
  if (!p.zugriffsrechte) p.zugriffsrechte = {};
  if (!p.zugriffsrechte[userId]) {
    const user = USERS.find(u => u.id === userId);
    p.zugriffsrechte[userId] = { ...(DEFAULT_RECHTE[user?.rolle] || DEFAULT_RECHTE.agentur) };
  }
  p.zugriffsrechte[userId][recht] = val;
  if (typeof mfAudit === 'function') {
    mfAudit({ action: 'projekt_recht_geaendert', projectId: projektId, meta: { zielUserId: userId, recht, val: !!val } });
  }
}

// Override entfernen → zurück zu Rollen-Default (hebt weder Projekt-Sperre noch Kontosperre auf)
function resetProjRechte(projektId, userId) {
  const p = state.projects.find(x => x.id === projektId);
  if (p?.zugriffsrechte) delete p.zugriffsrechte[userId];
  if (typeof mfAudit === 'function') {
    mfAudit({ action: 'projekt_recht_reset', projectId: projektId, meta: { zielUserId: userId } });
  }
}

// Alle User die Zugriff auf ein Projekt haben (für Zugriffsblock)
function getProjektZugangsUser(projekt) {
  const ids = new Set();
  // Aus Zuweisungsfeldern
  (projekt.agentur_ids||[]).forEach(id => ids.add(id));
  if (projekt.koordinator_id) ids.add(projekt.koordinator_id);
  if (projekt.zwischenhaendler_id) ids.add(projekt.zwischenhaendler_id);
  (projekt.intern_ids||[]).forEach(id => ids.add(id));
  (projekt.produktion_ids||[]).forEach(id => ids.add(id));
  // Aus projektMitglieder (Fallback)
  (projekt.projektMitglieder||[]).forEach(m => ids.add(m.userId));
  // Firma-basiert: alle User der zugewiesenen Firma
  if (projekt.agentur_id) {
    USERS.filter(u => u.firmaId === projekt.agentur_id && u.aktiv !== false).forEach(u => ids.add(u.id));
  }
  // Alle aktiven User zurückgeben die im USERS array existieren
  return [...ids].map(id => USERS.find(u => u.id === id)).filter(Boolean).filter(u => u.aktiv !== false);
}

// ─────────────────────────────────────────────────────
// canWork — darf Produktionsarbeit ausführen?
// (Druckfertig setzen, Nachbestellen, Produktionsansicht)
// ─────────────────────────────────────────────────────
function canWork(userId) {
  const user = USERS.find(u => u.id === userId);
  if (!user || user.aktiv === false || isUserGesperrt(user)) return false;
  return user.rolle === 'produktion';
}

// ─────────────────────────────────────────────────────
// canUpload — darf Dateien hochladen?
// Prüft Rolle UND Projekt-Zuweisung, damit Excel-Import
// und bestehende Projekte identisch behandelt werden.
// ─────────────────────────────────────────────────────
function canUpload(userId, projekt) {
  const user = USERS.find(u => u.id === userId);
  if (!user || user.aktiv === false || isUserGesperrt(user)) return false;

  // Admin darf immer
  if (user.rolle === 'admin') return true;

  if (projekt && !getProjRechte(userId, projekt.id).upload) return false;

  // Zwischenhändler: nur wenn er diesem Projekt zugewiesen ist
  if (user.rolle === 'zwischenhaendler') {
    if (!projekt) return false;
    return (
      projekt.zwischenhaendler_id === userId ||
      projekt.projektMitglieder?.some(m => m.userId === userId && m.rolle === 'zwischenhaendler')
    );
  }

  // Agentur: nur wenn sie diesem Projekt zugewiesen ist
  if (user.rolle === 'agentur') {
    if (!projekt) return false;
    return (
      projekt.agentur_ids?.includes(userId)      ||
      projekt.koordinator_id === userId          ||
      projekt.projektMitglieder?.some(m => m.userId === userId && m.rolle === 'agentur')
    );
  }

  // Koordinator (Messebauer / Ansprechpartner): gleiche Upload-Rechte wie Agentur
  if (projekt && projekt.koordinator_id === userId && user.rolle === 'agentur') return true;

  // Alle übrigen Rollen (z. B. cc_intern, produktion): oben bereits getProjRechte(...).upload geprüft
  return true;
}

function canSeePreise(userId, projektId) {
  const user = USERS.find(u => u.id === userId);
  if (!user || isUserGesperrt(user)) return false;
  return !!getProjRechte(userId, projektId).preise;
}

function addUserToProject(projektId, userId, rolle, zugriff, preiseSichtbar) {
  const p = state.projects.find(p => p.id === projektId);
  if (!p) return;
  if (!p.projektMitglieder) p.projektMitglieder = [];
  p.projektMitglieder = p.projektMitglieder.filter(m => m.userId !== userId);
  p.projektMitglieder.push({ userId, rolle, zugriff, preiseSichtbar: !!preiseSichtbar });
  if (typeof mfAudit === 'function') {
    mfAudit({ action: 'benutzer_zu_projekt', projectId: projektId, meta: { hinzugefuegtUserId: userId, rolle, zugriff } });
  }
}

function removeUserFromProject(projektId, userId) {
  const actor = USERS.find(u => u.id === currentUserId);
  if (!actor) return;
  const pr = getProjRechte(actor.id, projektId);
  if (actor.rolle !== 'admin' && !pr.loeschen) return;
  const p = state.projects.find(p => p.id === projektId);
  if (!p || !p.projektMitglieder) return;
  p.projektMitglieder = p.projektMitglieder.filter(m => m.userId !== userId);
  if (typeof mfAudit === 'function') {
    mfAudit({ action: 'benutzer_aus_projekt', projectId: projektId, meta: { entferntUserId: userId } });
  }
}

// ═══════════════════════════════════════════════════════
// MODULE-ZUGRIFF
// ═══════════════════════════════════════════════════════
function canAccessModule(userId, moduleId) {
  const user = USERS.find(u => u.id === userId);
  if (!user || user.aktiv === false) return false;
  if (isUserGesperrt(user)) return false;
  if (
    typeof window !== 'undefined'
    && window.__MF_COCKPIT_EMBED
    && moduleId === 'messeflow'
  ) {
    if (typeof window.mfCockpitMesseflowRight === 'function') {
      try {
        return !!window.mfCockpitMesseflowRight('sehen');
      } catch {
        /* Fallback: MesseFlow-intern */
      }
    }
    // Embed ohne explizite Rechtefunktion: Cockpit hat den Bereich bereits freigegeben.
    return true;
  }
  // Admins haben immer Zugriff auf alle Module
  if (ROLES.find(r => r.id === user.rolle)?.permissions?.manageUsers) return true;
  return user.module_permissions?.[moduleId] === true;
}

/** Cockpit: ccintern.messeflow.erstellen — sonst klassische MF-Rollen. */
function mfMayCreateMesseflowProject() {
  if (typeof window !== 'undefined' && window.__MF_COCKPIT_EMBED && typeof window.mfCockpitMesseflowRight === 'function') {
    try {
      return !!window.mfCockpitMesseflowRight('erstellen');
    } catch {
      return false;
    }
  }
  const me = USERS.find(u => u.id === currentUserId);
  return !!(me && (me.rolle === 'admin' || me.rolle === 'cc_intern' || me.rolle === 'zwischenhaendler'));
}

/** Excel/Datei-Import: upload oder bearbeiten oder erstellen (Cockpit). */
function mfMayImportMesseflowExcel() {
  if (typeof window !== 'undefined' && window.__MF_COCKPIT_EMBED && typeof window.mfCockpitMesseflowRight === 'function') {
    try {
      return !!(
        window.mfCockpitMesseflowRight('upload')
        || window.mfCockpitMesseflowRight('bearbeiten')
        || window.mfCockpitMesseflowRight('erstellen')
      );
    } catch {
      return false;
    }
  }
  return mfMayCreateMesseflowProject();
}

/** Mindestens ein Modul aktiv (Login nur mit Modul-Zugriff). Admins gelten als „hat Modul“. */
function userHasAnyModulePermission(user) {
  if (!user) return false;
  if (isUserGesperrt(user)) return false;
  if (ROLES.find(r => r.id === user.rolle)?.permissions?.manageUsers) return true;
  const mp = user.module_permissions;
  if (!mp || typeof mp !== 'object') return false;
  return !!(mp.messeflow || mp.crm || mp.angebote || mp.fusa || mp.produktion);
}

function updateUserModulePermission(userId, moduleId, value) {
  const user = USERS.find(u => u.id === userId);
  if (!user) return;
  if (!user.module_permissions) user.module_permissions = {};
  user.module_permissions[moduleId] = !!value;
  if (typeof mfAudit === 'function') {
    mfAudit({ action: 'modul_zugriff_geaendert', meta: { zielUserId: userId, moduleId, value: !!value } });
  }
}

// ═══════════════════════════════════════════════════════
// FIRMEN-VERWALTUNG
// ═══════════════════════════════════════════════════════
function addFirma(name, typ, meta = {}) {
  const id = 'f' + Date.now();
  FIRMS.push({
    id,
    name: name.trim(),
    typ,
    ansprechpartnerUserId: meta.ansprechpartnerUserId ?? null,
    zwischenhaendlerUserId: meta.zwischenhaendlerUserId ?? null,
  });
  return id;
}

function removeFirma(firmaId) {
  const inUse = USERS.some(u => u.firmaId === firmaId);
  if (inUse) return false; // Firma noch in Verwendung
  const idx = FIRMS.findIndex(f => f.id === firmaId);
  if (idx >= 0) FIRMS.splice(idx, 1);
  return true;
}

function updateProjectFirmas(projektId, agentur_id, zwischenhaendler_id, produktion_ids) {
  const p = state.projects.find(p => p.id === projektId);
  if (!p) return;
  p.agentur_id          = agentur_id          || null;
  p.zwischenhaendler_id = zwischenhaendler_id || null;
  p.produktion_ids      = Array.isArray(produktion_ids) ? produktion_ids : [];
}

function refreshProjectUI() {
  syncProjektStatusAlle();
  const visibleProjects = getVisibleProjects(currentUserId);
  renderSidebar();
  // Prüfen, ob aktives Projekt noch sichtbar ist
  if (activeProjId && !visibleProjects.some(p => p.id === activeProjId)) {
    // Wenn nicht, erstes sichtbares auswählen oder null
    activeProjId = visibleProjects.length > 0 ? visibleProjects[0].id : null;
  }
  renderView();
}

function deriveProjektStatus(project) {
  const waende = project?.waende || [];
  if (!waende.length) return 'Neu';

  // Wandstatus für die Projektaggregation:
  // - keine Datei -> "Datei fehlt"
  // - sonst Dateiflow-Status der aktuellen Datei
  const wandStatus = waende.map(w => {
    const f = getAktuelleDatei(w);
    if (!f || !w.datei) return 'Datei fehlt';
    return normalizeDateiWorkflowStatus(f.status) || 'In Prüfung';
  });

  const alle = (s) => wandStatus.every(x => x === s);
  const some = (s) => wandStatus.some(x => x === s);

  // A) Alle fehlen
  if (alle('Datei fehlt')) return 'Fehlt etwas';
  // Fertig / Produktion zuerst (eindeutige Endzustände)
  if (alle(DATEI_WORKFLOW.GELIEFERT)) return 'Fertig';
  if (alle(DATEI_WORKFLOW.WIRD_GEDRUCKT)) return 'In Produktion';
  // Sobald eine Wand an den Druch / Produktion übergeben: für alle sichtbar „An Druck gesendet“
  if (some(DATEI_WORKFLOW.CALDERA_GESENDET) || some(DATEI_WORKFLOW.WIRD_GEDRUCKT)) return 'An Druck gesendet';
  // Alle freigegeben (noch nicht gesendet)
  if (alle(DATEI_WORKFLOW.FREIGEGEBEN)) return 'Druckfertig';

  // B) Gemischt (Prüfung / Upload / Teil frei)
  return 'In Prüfung';
}

function getProjektStatusMeta(status) {
  const map = {
    'Fehlt etwas':       { bg:'#fef2f2', bd:'#fecaca', cl:'#b91c1c' },
    'Datei hochgeladen': { bg:'#f3f4f6', bd:'#d1d5db', cl:'#6b7280' },
    'In Prüfung':        { bg:'#fff7ed', bd:'#fdba74', cl:'#c2410c' },
    'Druckfertig':       { bg:'#eff6ff', bd:'#93c5fd', cl:'#1d4ed8' },
    'Freigegeben':       { bg:'#eff6ff', bd:'#93c5fd', cl:'#1d4ed8' },
    'An Druck gesendet': { bg:'#ede9fe', bd:'#a78bfa', cl:'#5b21b6' },
    'An Caldera gesendet': { bg:'#ede9fe', bd:'#a78bfa', cl:'#5b21b6' },
    'Wird gedruckt':     { bg:'#f0fdf4', bd:'#86efac', cl:'#166534' },
    'In Produktion':     { bg:'#f0fdf4', bd:'#86efac', cl:'#166534' },
    'Fertig':            { bg:'#14532d', bd:'#14532d', cl:'#ffffff' },
    'Neu':               { bg:'#f8fafc', bd:'#e2e8f0', cl:'#475569' },
  };
  return map[status] || map['Neu'];
}

function syncProjektStatusAlle() {
  state.projects.forEach(p => {
    p.status = deriveProjektStatus(p);
  });
}

function addFileToWall(projectId, wandId, fileData) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  const wand = project.waende.find(w => w.id === wandId);
  if (!wand) return;
  const vorher = getAktuelleDatei(wand);
  const ns = normalizeDateiWorkflowStatus(vorher?.status);
  if (vorher && [DATEI_WORKFLOW.CALDERA_GESENDET, DATEI_WORKFLOW.WIRD_GEDRUCKT, DATEI_WORKFLOW.GELIEFERT].includes(ns)) {
    if (typeof toast === 'function') {
      toast('Gesperrt', 'Diese Datei wurde bereits an den Druck übergeben – Ersetzen ist nicht möglich.', 'ty');
    }
    return;
  }
  if (!wand.dateien) wand.dateien = [];
  const prevName = getAktuelleDatei(wand)?.name || null;
  // Set all existing files to not current, and revoke freigabeAktiv if they were freigegeben
  wand.dateien.forEach(f => {
    f.isCurrentVersion = false;
    if (f.status === 'Freigegeben') {
      f.freigabeAktiv = false;
    }
  });
  const newFile = {
    id: 'f' + Date.now(),
    name: fileData.name,
    hochgeladenVon: currentUserId,
    hochgeladenAm: nowStr(),
    version: fileData.version || 'v1',
    status: DATEI_WORKFLOW.HOCHGELADEN,
    pruefStatus: fileData.pruefStatus || null,
    pruefDetails: fileData.pruefDetails || null,
    geprueftAm: fileData.geprueftAm || null,
    geprueftVonSystem: fileData.geprueftVonSystem || true,
    isCurrentVersion: true,
    freigabeAktiv: false,
  };
  wand.dateien.push(newFile);
  // Set the wall's current file to the latest
  wand.datei = newFile.name;
  // Markiere ältere freigegebene/geprüfte als veraltet
  markOlderVersionsAsOutdated(wand);
  // Reset wall status to "Nicht geprüft"
  wand.status = 8;
  // Recalc status after upload
  recalc(wand);
  // If project was in a later stage, reset to "In Prüfung"
  const advancedStatuses = ["Freigegeben", "In Produktion", "Fertig"];
  if (advancedStatuses.includes(project.status)) {
    project.status = "In Prüfung";
  }
  if (typeof mfAudit === 'function') {
    mfAudit({
      action: 'datei_hochgeladen',
      projectId,
      wallId: wandId,
      meta: { dateiNeu: newFile.name, dateiAlt: prevName },
    });
  }
  refreshProjectUI();
}

function markOlderVersionsAsOutdated(wand) {
  wand.dateien.forEach((file, index) => {
    if (index < wand.dateien.length - 1 && file.status !== DATEI_WORKFLOW.VERALTET) {
      file.status = DATEI_WORKFLOW.VERALTET;
    }
  });
}

const DATEI_WORKFLOW = {
  HOCHGELADEN: 'Hochgeladen',
  IN_PRUEFUNG: 'In Prüfung',
  /** Nach Upload + Prüfung ohne Druckrisiko (siehe syncDateiWorkflowByPruefung). */
  DRUCKPRUEFUNG_FREI: 'Druckprüfung freigegeben',
  /** Nach Upload mit bestätigten Druckrisiken (wand.druckFreigabe.risiko). */
  FREIGEGEBEN_EIGENE_VERANTWORTUNG: 'Freigegeben auf eigene Verantwortung',
  /** Upload ohne auswertbare Prüfung (z. B. Prüfserver offline). */
  NICHT_GEPRUEFT_HOCHGELADEN: 'Nicht geprüft hochgeladen',
  FREIGEGEBEN: 'Freigegeben',
  CALDERA_GESENDET: 'An Druck gesendet',
  WIRD_GEDRUCKT: 'Wird gedruckt',
  GELIEFERT: 'Geliefert',
  VERALTET: 'Veraltet',
};

/** Datei-Status, von denen Norbert/CC Intern zur Produktions-Freigabe übergehen darf. */
const DATEI_STATUS_VOR_MELANIE_FREIGABE = [
  DATEI_WORKFLOW.HOCHGELADEN,
  DATEI_WORKFLOW.IN_PRUEFUNG,
  DATEI_WORKFLOW.DRUCKPRUEFUNG_FREI,
  DATEI_WORKFLOW.FREIGEGEBEN_EIGENE_VERANTWORTUNG,
  DATEI_WORKFLOW.NICHT_GEPRUEFT_HOCHGELADEN,
];

/** Alte Demo-/Import-Werte → aktueller Workflow-String */
function normalizeDateiWorkflowStatus(s) {
  if (!s) return s;
  if (s === 'An Caldera gesendet') return DATEI_WORKFLOW.CALDERA_GESENDET;
  return s;
}

function istDateiDruckGesperrt(fileStatus) {
  const s = normalizeDateiWorkflowStatus(fileStatus);
  return [DATEI_WORKFLOW.CALDERA_GESENDET, DATEI_WORKFLOW.WIRD_GEDRUCKT, DATEI_WORKFLOW.GELIEFERT].includes(s);
}

function getAktuelleDatei(wand) {
  if (!wand?.dateien?.length) return null;
  return wand.dateien.find(f => f.isCurrentVersion) || wand.dateien[wand.dateien.length - 1];
}

function kannDateiFreigeben(userId) {
  const user = USERS.find(u => u.id === userId);
  if (!user || user.aktiv === false || isUserGesperrt(user)) return false;
  return ['admin', 'cc_intern', 'zwischenhaendler', 'agentur'].includes(user.rolle);
}

function kannCalderaSenden(userId) {
  const user = USERS.find(u => u.id === userId);
  if (!user || user.aktiv === false || isUserGesperrt(user)) return false;
  // "CC Intern (Melanie, Anna)" — kompatibel zu aktuellem User-Setup
  return (
    user.rolle === 'cc_intern' ||
    user.rolle === 'admin' ||
    user.id === 'u3' ||
    user.id === 'u_cc_intern'
  );
}

function setAktuellerDateiStatus(projectId, wandId, newStatus) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return false;
  const wand = project.waende.find(w => w.id === wandId);
  const file = getAktuelleDatei(wand);
  if (!wand || !file) return false;

  file.status = newStatus;
  if (newStatus === DATEI_WORKFLOW.WIRD_GEDRUCKT || newStatus === DATEI_WORKFLOW.GELIEFERT) {
    file.freigabeAktiv = true;
  }
  return true;
}

function freigebenDatei(projectId, wandId) {
  if (!kannDateiFreigeben(currentUserId)) return false;
  const p = state.projects.find(x => x.id === projectId);
  const w = p?.waende?.find(x => x.id === wandId);
  const f = getAktuelleDatei(w);
  if (!f) return false;
  if (!DATEI_STATUS_VOR_MELANIE_FREIGABE.includes(normalizeDateiWorkflowStatus(f.status))) return false;
  f.freigegebenAm = nowStr();
  const ok = setAktuellerDateiStatus(projectId, wandId, DATEI_WORKFLOW.FREIGEGEBEN);
  if (ok) {
    w.dateiStatus = DATEI_WORKFLOW.FREIGEGEBEN;
    if (typeof mfAudit === 'function') {
      mfAudit({
        action: 'datei_freigegeben',
        projectId,
        wallId: wandId,
        meta: { datei: f.name },
      });
    }
    refreshProjectUI();
  }
  return ok;
}

/**
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendeDateiAnCaldera(projectId, wandId) {
  if (!kannCalderaSenden(currentUserId)) return { ok: false, error: 'Keine Berechtigung für „An Caldera senden“.' };
  const p = state.projects.find(x => x.id === projectId);
  const w = p?.waende?.find(x => x.id === wandId);
  const f = getAktuelleDatei(w);
  if (!f || normalizeDateiWorkflowStatus(f.status) !== DATEI_WORKFLOW.FREIGEGEBEN) {
    return { ok: false, error: 'Nur freigegebene Dateien können an Caldera gesendet werden.' };
  }
  const store = typeof window !== 'undefined' && window.DATEI_STORE ? window.DATEI_STORE : null;
  const entry = store ? store[wandId] : null;
  const blob = entry && entry.blob;
  if (!blob) {
    return { ok: false, error: 'Datei nicht im Browser-Speicher – bitte erneut hochladen (dann erneut freigeben).' };
  }
  if (typeof window === 'undefined' || typeof window.__mfApiFetchFormData !== 'function') {
    return { ok: false, error: 'An Caldera senden ist nur in der Cockpit-App mit API verbunden.' };
  }
  const name = (blob && blob.name) || f.name || 'wand.pdf';
  const fd = new FormData();
  fd.append('datei', blob, name);
  const apiPath = `/api/v1/messeflow/projekte/${encodeURIComponent(projectId)}/waende/${encodeURIComponent(wandId)}/an-caldera-senden`;
  try {
    await window.__mfApiFetchFormData(apiPath, { method: 'POST', body: fd });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return { ok: false, error: msg };
  }
  f.calderaGesendetAm = nowStr();
  f.druckStartAm = nowStr();
  const ok = setAktuellerDateiStatus(projectId, wandId, DATEI_WORKFLOW.WIRD_GEDRUCKT);
  if (ok) {
    w.status = 5;
    w.dateiStatus = DATEI_WORKFLOW.WIRD_GEDRUCKT;
    if (typeof mfAudit === 'function') {
      mfAudit({
        action: 'caldera_gesendet',
        projectId,
        wallId: wandId,
        meta: { datei: f.name },
      });
    }
    refreshProjectUI();
    if (typeof window !== 'undefined' && typeof window.mfSaveState === 'function') {
      window.mfSaveState().catch(() => {});
    }
  }
  return ok ? { ok: true } : { ok: false, error: 'Status konnte nicht gesetzt werden.' };
}

function setDateiWirdGedruckt(projectId, wandId) {
  if (!kannCalderaSenden(currentUserId)) return false;
  const p = state.projects.find(x => x.id === projectId);
  const w = p?.waende?.find(x => x.id === wandId);
  const f = getAktuelleDatei(w);
  if (!f || normalizeDateiWorkflowStatus(f.status) !== DATEI_WORKFLOW.CALDERA_GESENDET) return false;
  f.druckStartAm = nowStr();
  const ok = setAktuellerDateiStatus(projectId, wandId, DATEI_WORKFLOW.WIRD_GEDRUCKT);
  if (ok) {
    w.status = 5;
    refreshProjectUI();
  }
  return ok;
}

function setDateiGeliefert(projectId, wandId, menge) {
  const user = USERS.find(u => u.id === currentUserId);
  if (!user || isUserGesperrt(user)) return false;
  if (!(user.rolle === 'produktion' || user.rolle === 'cc_intern' || user.id === 'u3' || user.id === 'u_cc_intern')) return false;
  const p = state.projects.find(x => x.id === projectId);
  const w = p?.waende?.find(x => x.id === wandId);
  const f = getAktuelleDatei(w);
  if (!f || f.status !== DATEI_WORKFLOW.WIRD_GEDRUCKT) return false;
  const m = Number(menge);
  if (!Number.isFinite(m) || m <= 0) return false;
  f.gelieferteMenge = m;
  f.geliefertAm = nowStr();
  const ok = setAktuellerDateiStatus(projectId, wandId, DATEI_WORKFLOW.GELIEFERT);
  if (ok) {
    w.status = 5;
    refreshProjectUI();
  }
  return true;
}

/** Nur Admins: Druck-Flow zurücksetzen (z. B. nach Fehlübertragung), danach wieder bearbeitbar. */
function adminResetDruckStatus(projectId, wandId) {
  // Cockpit übernimmt Auth – interner Role-Check entfernt
  const p = state.projects.find(x => x.id === projectId);
  const w = p?.waende?.find(x => x.id === wandId);
  const f = getAktuelleDatei(w);
  if (!w || !f) return false;
  if (!istDateiDruckGesperrt(f.status)) return false;
  f.status = DATEI_WORKFLOW.FREIGEGEBEN;
  delete f.calderaGesendetAm;
  delete f.druckStartAm;
  delete f.geliefertAm;
  delete f.gelieferteMenge;
  if (typeof recalc === 'function') recalc(w);
  if (typeof mfAudit === 'function') {
    mfAudit({
      action: 'druck_status_zurueckgesetzt',
      projectId,
      wallId: wandId,
      meta: { datei: f.name },
    });
  }
  refreshProjectUI();
  return true;
}

function syncDateiWorkflowByPruefung(projectId, wandId) {
  const p = state.projects.find(x => x.id === projectId);
  const w = p?.waende?.find(x => x.id === wandId);
  const f = getAktuelleDatei(w);
  if (!w || !f) return false;
  if (istDateiDruckGesperrt(f.status)) return false;

  const ns = normalizeDateiWorkflowStatus(f.status);
  const nachUploadAktualisierbar = [
    DATEI_WORKFLOW.HOCHGELADEN,
    DATEI_WORKFLOW.IN_PRUEFUNG,
    DATEI_WORKFLOW.DRUCKPRUEFUNG_FREI,
    DATEI_WORKFLOW.FREIGEGEBEN_EIGENE_VERANTWORTUNG,
    DATEI_WORKFLOW.NICHT_GEPRUEFT_HOCHGELADEN,
  ].includes(ns);
  if (!nachUploadAktualisierbar) return false;

  let nextStatus;
  if (w.druckFreigabe && w.druckFreigabe.risiko === true) {
    nextStatus = DATEI_WORKFLOW.FREIGEGEBEN_EIGENE_VERANTWORTUNG;
  } else if (w.pruefErgebnis || (w.dateiMass && String(w.dateiMass).trim())) {
    nextStatus = DATEI_WORKFLOW.DRUCKPRUEFUNG_FREI;
  } else {
    nextStatus = DATEI_WORKFLOW.NICHT_GEPRUEFT_HOCHGELADEN;
  }

  const ok = setAktuellerDateiStatus(projectId, wandId, nextStatus);
  if (ok) {
    w.dateiStatus = nextStatus;
    if (typeof recalc === 'function') recalc(w);
    refreshProjectUI();
  }
  return ok;
}

function addNachbestellung(projectId, wandId, menge) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  const wand = project.waende.find(w => w.id === wandId);
  if (!wand) return;
  if (!wand.produktionen) wand.produktionen = [];
  // Finde freigegebene Version
  const freigegebeneVersion = wand.dateien.find(f => f.freigabeAktiv);
  if (!freigegebeneVersion) {
    alert('Keine freigegebene Version vorhanden für Nachbestellung.');
    return;
  }
  const newProduktion = {
    id: 'prod' + Date.now(),
    menge: menge,
    erstelltAm: nowStr(),
    erstelltVon: currentUserId,
    status: 'offen',
    versionId: freigegebeneVersion.id,
  };
  wand.produktionen.push(newProduktion);
  refreshProjectUI();
}

window.FIRMS = FIRMS;
window.ROLES = ROLES;
window.USERS = USERS;
window.currentUserId = currentUserId;
window.role = role;
window.activeProjId = activeProjId;
window.notifOpen = notifOpen;
window.state = state;
window.getP = getP;
window.getW = getW;
window.nowStr = nowStr;
window.isUserGesperrt = isUserGesperrt;
window.userMayUseApp = userMayUseApp;
window.getEffectiveKontoStatus = getEffectiveKontoStatus;
window.canSeeProject = canSeeProject;
window.getVisibleProjects = getVisibleProjects;
window.getCurrentUser = getCurrentUser;
window.canEditProject = canEditProject;
window.canViewFinance = canViewFinance;
window.canChangeStatus = canChangeStatus;
window.buildDefaultProjectAssignments = buildDefaultProjectAssignments;
// buildProjektTeam — leitet team[] aus den Zuweisungsfeldern ab.
// Wird nach jeder Änderung an agentur_ids / intern_ids etc. aufgerufen.
function buildProjektTeam(projekt) {
  return [
    ...(projekt.agentur_ids    || []),
    projekt.koordinator_id     || null,
    projekt.zwischenhaendler_id|| null,
    ...(projekt.intern_ids     || []),
    ...(projekt.produktion_ids || []),
  ].filter(Boolean);
}

window.applyStandardZuweisungen = applyStandardZuweisungen;
window.buildProjektTeam = buildProjektTeam;
window.findExistingProject = findExistingProject;
window.getProjektMitglied = getProjektMitglied;
window.getProjektZugriff = getProjektZugriff;
window.DEFAULT_RECHTE = DEFAULT_RECHTE;
window.ALLE_RECHTE_AUS = ALLE_RECHTE_AUS;
window.setProjSperre = setProjSperre;
window.isProjGesperrt = isProjGesperrt;
window.getProjRechte = getProjRechte;
window.setProjRecht = setProjRecht;
window.resetProjRechte = resetProjRechte;
window.getProjektZugangsUser = getProjektZugangsUser;
window.canWork = canWork;
window.canUpload = canUpload;
window.canSeePreise = canSeePreise;
window.addUserToProject = addUserToProject;
window.removeUserFromProject = removeUserFromProject;
window.MODULES = MODULES;
window.mfMayCreateMesseflowProject = mfMayCreateMesseflowProject;
window.mfMayImportMesseflowExcel = mfMayImportMesseflowExcel;
window.canAccessModule = canAccessModule;
window.userHasAnyModulePermission = userHasAnyModulePermission;
window.adminResetDruckStatus = adminResetDruckStatus;
window.MesseFlowState = state;
window.DATEI_WORKFLOW = DATEI_WORKFLOW;
window.DATEI_STATUS_VOR_MELANIE_FREIGABE = DATEI_STATUS_VOR_MELANIE_FREIGABE;
window.normalizeDateiWorkflowStatus = normalizeDateiWorkflowStatus;
window.kannDateiFreigeben = kannDateiFreigeben;
window.kannCalderaSenden = kannCalderaSenden;
window.freigebenDatei = freigebenDatei;
window.sendeDateiAnCaldera = sendeDateiAnCaldera;
window.syncDateiWorkflowByPruefung = syncDateiWorkflowByPruefung;
window.setAktuellerDateiStatus = setAktuellerDateiStatus;
window.getAktuelleDatei = getAktuelleDatei;