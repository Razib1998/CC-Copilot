/**
 * FUSA-Auftragsregeln — zentrale fachliche Regeln (Cockpit-Backend, Source of Truth).
 * Inhaltlich aus Alt-FUSA constants/auftrag abgeleitet, nicht als Modul portiert.
 */

/** @typedef {{ id: number, key: string, label: string }} FahrzeugtypMeta */

/** @type {FahrzeugtypMeta[]} */
export const FAHRZEUGTYPEN = [
  { id: 1, key: 'solobus', label: 'Solobus' },
  { id: 2, key: 'gelenkbus', label: 'Gelenkbus' },
  { id: 3, key: 'ubahn_8', label: 'U-Bahn 8 Achsen' },
  { id: 4, key: 'stadtbahn_8', label: 'Stadtbahn 8 Achsen' },
];

/** Paketnamen je Fahrzeugtyp-ID (wie Alt-FUSA FAHRZEUGTYP_PAKETE). */
export const PAKETE_JE_TYP_ID = {
  1: [
    'Teilgestaltung ohne Heck',
    'Teilgestaltung',
    'Teilgestaltung + Dachkranz',
    'Teilgestaltung + Dachkranz Beschrift.',
    'Ganzgestaltung',
    'Heck Vollbeschriftung',
    'Heckfläche',
    'Traffic Banner Paket (3 Traffic Banner)',
  ],
  2: [
    'Teilgestaltung ohne Heck',
    'Teilgestaltung',
    'Teilgestaltung + Dachkranz',
    'Teilgestaltung + Dachkranz Beschrift.',
    'Ganzgestaltung',
    'Ganzgestaltung + Fenster',
    'Heck Vollbeschriftung',
    'Heckfläche',
    'Traffic Banner Paket (3 Traffic Banner)',
  ],
  3: [
    'Teilgestaltung',
    'Ganzgestaltung',
    'Ganzgestaltung + Fenster',
    'Trafficboard 2 qm',
    'Trafficboard 4 qm',
    'Trafficboard 9 qm',
  ],
  4: [
    'Teilgestaltung',
    'Ganzgestaltung',
    'Ganzgestaltung + Fenster',
    'Trafficboard 2 qm',
    'Trafficboard 4 qm',
    'Trafficboard 9 qm',
  ],
};

/** Monatlicher Netto-Grundpreis je Paket (€), inkl. Alt-Alias. */
export const PAKET_PREISE_MONAT_NETTO = {
  'Teilgestaltung ohne Heck': 680,
  Teilgestaltung: 820,
  'Teilgestaltung + Dachkranz': 980,
  'Teilgestaltung + Dachkranz Beschrift.': 1050,
  'Teilgestaltung + Dachkranz besch.': 1050,
  Ganzgestaltung: 1420,
  'Ganzgestaltung + Fenster': 1780,
  'Heck Vollbeschriftung': 380,
  Heckfläche: 280,
  'Trafficboard 2 qm': 290,
  'Trafficboard 4 qm': 420,
  'Trafficboard 9 qm': 680,
  'Traffic Banner Paket (3 Traffic Banner)': 520,
};

export const PAKET_INFO_EINZEILER = {
  'Trafficboard 2 qm': 'Dachfläche 2 m². Montage: ~1h.',
  'Trafficboard 4 qm': 'Dachfläche 4 m². Montage: ~1,5h.',
  'Trafficboard 9 qm': 'Dachfläche 9 m². Montage: ~2h.',
  'Traffic Banner Paket (3 Traffic Banner)': '3 Traffic Banner. Montage: ~2h.',
};

/** Betreiber → zulässige Depots. */
export const BETREIBER_DEPOTS = {
  'Ruhrbahn Essen': [
    'Essen Econova-Alee',
    'Essen Rurhallee',
    'Essen Schweriner Str.',
    'Essen Stadtmitte',
    'Mülheim Duisburgerstr.',
  ],
  'Bogestra AG': [
    'Essen Econova-Alee',
    'Essen Rurhallee',
    'Essen Schweriner Str.',
    'Essen Stadtmitte',
    'Mülheim Duisburgerstr.',
  ],
  'DVG Duisburg': [
    'Essen Econova-Alee',
    'Essen Rurhallee',
    'Essen Schweriner Str.',
    'Essen Stadtmitte',
    'Mülheim Duisburgerstr.',
  ],
  'Stadtwerke Essen': [
    'Essen Econova-Alee',
    'Essen Rurhallee',
    'Essen Schweriner Str.',
    'Essen Stadtmitte',
    'Mülheim Duisburgerstr.',
  ],
  Sonstiger: [
    'Essen Econova-Alee',
    'Essen Rurhallee',
    'Essen Schweriner Str.',
    'Essen Stadtmitte',
    'Mülheim Duisburgerstr.',
  ],
};

/** Depot → Anzeigename + Werkstatt-Mail. */
export const WERKSTATT_JE_DEPOT = {
  'Essen Econova-Alee': {
    label: 'Depot Essen Econova-Alee',
    mail: 'werkstatt.econova@ruhrbahn.de',
  },
  'Essen Rurhallee': {
    label: 'Depot Essen Rurhallee',
    mail: 'werkstatt.rurhallee@ruhrbahn.de',
  },
  'Essen Schweriner Str.': {
    label: 'Depot Essen Schweriner Str.',
    mail: 'werkstatt.schweriner@ruhrbahn.de',
  },
  'Essen Stadtmitte': {
    label: 'Depot Essen Stadtmitte',
    mail: 'werkstatt.stadtmitte@ruhrbahn.de',
  },
  'Mülheim Duisburgerstr.': {
    label: 'Depot Mülheim Duisburgerstr.',
    mail: 'werkstatt.muelheim@ruhrbahn.de',
  },
};

export const DEFAULT_MODELL_ID = 'modell-ruhrbahn';

export const PARTNER_MODELLE = [
  { id: 'modell-ruhrbahn', label: 'Ruhrbahn Standard', partner: 'Ruhrbahn', cc_pct: 22, partner_pct: 78 },
  { id: 'modell-dvg', label: 'DVG Duisburg', partner: 'DVG', cc_pct: 22, partner_pct: 78 },
  { id: 'modell-bogestra', label: 'Bogestra', partner: 'Bogestra', cc_pct: 25, partner_pct: 75 },
  { id: 'modell-eigen', label: 'Eigenvermarktung CC', partner: '—', cc_pct: 100, partner_pct: 0 },
];

/** UI-Slug → Fahrzeugtyp-Label (Alt FZ_TYP_MAP). */
export const FZ_TYP_SLUG_ZU_LABEL = {
  'fztyp-solo': 'Solobus',
  'fztyp-gelenk': 'Gelenkbus',
  'fztyp-ubahn': 'U-Bahn 8 Achsen',
  'fztyp-stadtbahn': 'Stadtbahn 8 Achsen',
};

const typIdByLabel = new Map(FAHRZEUGTYPEN.map((t) => [t.label.toLowerCase(), t.id]));

/**
 * @param {unknown} fahrzeugtyp
 * @returns {number | null}
 */
export function resolveFahrzeugtypId(fahrzeugtyp) {
  if (fahrzeugtyp == null) return null;
  const s = String(fahrzeugtyp).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 4) return n;
  const slugLabel = FZ_TYP_SLUG_ZU_LABEL[s.toLowerCase()];
  if (slugLabel) return typIdByLabel.get(slugLabel.toLowerCase()) ?? null;
  return typIdByLabel.get(s.toLowerCase()) ?? null;
}

/**
 * @param {number} typId
 * @param {string} paketName
 */
export function istPaketFuerTypErlaubt(typId, paketName) {
  const pakete = PAKETE_JE_TYP_ID[typId];
  if (!pakete) return false;
  const p = String(paketName || '').trim();
  return pakete.includes(p);
}

/**
 * @param {string} paketName
 */
export function preisMonatNettoFuerPaket(paketName) {
  const p = String(paketName || '').trim();
  if (!p) return null;
  const v = PAKET_PREISE_MONAT_NETTO[p];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Altlogik: Monatsende = Start + Laufzeit(Monate), dann ein Kalendertag zurück (inklusiver Zeitraum).
 * @param {string} startIso YYYY-MM-DD
 * @param {number} monate
 * @returns {string | null} YYYY-MM-DD
 */
export function enddatumNachStartUndMonaten(startIso, monate) {
  const start = parseIsoDateOnly(startIso);
  const m = Math.floor(Number(monate));
  if (!start || !Number.isFinite(m) || m < 1) return null;
  const d = new Date(Date.UTC(start.y, start.m - 1, start.d));
  d.setUTCMonth(d.getUTCMonth() + m);
  d.setUTCDate(d.getUTCDate() - 1);
  return formatIsoYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * @param {string} s
 * @returns {{ y: number, m: number, d: number } | null}
 */
function parseIsoDateOnly(s) {
  const t = String(s || '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!iso) return null;
  const y = Number(iso[1]);
  const m = Number(iso[2]);
  const d = Number(iso[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const trial = new Date(Date.UTC(y, m - 1, d));
  if (trial.getUTCFullYear() !== y || trial.getUTCMonth() !== m - 1 || trial.getUTCDate() !== d) return null;
  return { y, m, d };
}

function formatIsoYmd(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * @param {{
 *   startdatum: string,
 *   laufzeit_monate: number,
 *   fahrzeugtyp: unknown,
 *   paket: string,
 *   fahrzeuganzahl: number,
 * }} input
 */
export function kalkuliereAuftragsparameter(input) {
  const startdatum = String(input?.startdatum || '').trim();
  const laufzeit_monate = Math.floor(Number(input?.laufzeit_monate));
  const paket = String(input?.paket || '').trim();
  const fahrzeuganzahl = Math.max(1, Math.floor(Number(input?.fahrzeuganzahl) || 1));
  const typId = resolveFahrzeugtypId(input?.fahrzeugtyp);

  /** @type {string[]} */
  const gruende = [];
  if (!parseIsoDateOnly(startdatum)) gruende.push('startdatum_unparsbar');
  if (!Number.isFinite(laufzeit_monate) || laufzeit_monate < 1) gruende.push('laufzeit_ungueltig');
  if (typId == null) gruende.push('fahrzeugtyp_unbekannt');
  if (!paket) gruende.push('paket_fehlt');
  const paketOk = typId != null && istPaketFuerTypErlaubt(typId, paket);
  if (typId != null && paket && !paketOk) gruende.push('paket_nicht_erlaubt_fuer_typ');

  const enddatum = gruende.length === 0 ? enddatumNachStartUndMonaten(startdatum, laufzeit_monate) : null;
  if (!enddatum && !gruende.includes('startdatum_unparsbar') && startdatum) {
    gruende.push('enddatum_nicht_berechenbar');
  }

  const preis_monat = paketOk ? preisMonatNettoFuerPaket(paket) : null;
  if (paketOk && preis_monat == null) gruende.push('paketpreis_unbekannt');

  const gesamtpreis =
    preis_monat != null && Number.isFinite(laufzeit_monate) && laufzeit_monate >= 1
      ? Math.round(preis_monat * fahrzeuganzahl * laufzeit_monate * 100) / 100
      : null;

  const typMeta = typId != null ? FAHRZEUGTYPEN.find((t) => t.id === typId) : null;

  return {
    enddatum,
    preis_monat,
    gesamtpreis,
    erlaubte_konfiguration: {
      gueltig: gruende.length === 0,
      gruende,
      fahrzeugtyp_id: typId,
      fahrzeugtyp_label: typMeta?.label ?? null,
      fahrzeuganzahl,
      paket,
      laufzeit_monate: Number.isFinite(laufzeit_monate) ? laufzeit_monate : null,
    },
  };
}

function alleDepotNamenSortiert() {
  const set = new Set();
  for (const arr of Object.values(BETREIBER_DEPOTS)) {
    for (const x of arr) set.add(x);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * Rohdaten für GET form-meta (Preisfelder ggf. im Router redakten).
 */
/**
 * Anteil des Monatsnettowertes, der in den Internpool (CC+Partner) eingeht.
 * Referenz-Beispiel: Netto 280 → Intern 140 → CC/Partner 22/78 davon.
 */
export const INTERN_POOL_FAKTOR_VON_NETTO = 0.5;

/**
 * @param {unknown} x
 * @returns {number}
 */
function r2(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * @param {unknown} x
 * @param {number} def
 */
function nNum(x, def = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : def;
}

/**
 * @param {unknown} partnerModellId
 * @returns {(typeof PARTNER_MODELLE)[number]}
 */
export function findPartnerModell(partnerModellId) {
  const id = String(partnerModellId || '').trim() || DEFAULT_MODELL_ID;
  return PARTNER_MODELLE.find((p) => p.id === id) ?? PARTNER_MODELLE[0];
}

/**
 * Eine Preisposition (ein Fahrzeug) — zentrale Berechnung.
 *
 * @param {{
 *   fahrzeug_id: string,
 *   paket?: string,
 *   service_preis_monat?: number,
 *   ae_prozent?: number,
 *   rabatt_prozent?: number,
 * }} p
 * @param {string} partnerModellId
 * @param {string} fallbackPaket globales Paket
 */
export function berechneEinzelpreisposition(p, partnerModellId, fallbackPaket) {
  const paket = String(p.paket || fallbackPaket || '').trim();
  const listPreis = preisMonatNettoFuerPaket(paket);
  let service = nNum(p.service_preis_monat, NaN);
  if (!Number.isFinite(service) || service < 0) {
    service = listPreis != null ? listPreis : 0;
  }
  const ae = Math.min(100, Math.max(0, nNum(p.ae_prozent, 0)));
  const rabatt = Math.min(100, Math.max(0, nNum(p.rabatt_prozent, 0)));
  const afterRabatt = service * (1 - rabatt / 100);
  const netto_monat = r2(afterRabatt * (1 + ae / 100));
  const mod = findPartnerModell(partnerModellId);
  const intern_monat = r2(netto_monat * INTERN_POOL_FAKTOR_VON_NETTO);
  const cc_betrag = r2((intern_monat * nNum(mod.cc_pct, 0)) / 100);
  const partner_betrag = r2(intern_monat - cc_betrag);
  return {
    fahrzeug_id: String(p.fahrzeug_id || '').trim(),
    paket,
    service_preis_monat: r2(service),
    ae_prozent: ae,
    rabatt_prozent: rabatt,
    netto_monat,
    intern_monat,
    cc_betrag,
    partner_betrag,
    partner_modell_id: mod.id,
  };
}

/**
 * Vollkalkulation für Wizard/API: Positionen + Summen + Basis-Enddatum.
 * Eine fachliche Quelle — Frontend ruft nur diesen Endpunkt auf, keine zweite Rechenlogik.
 *
 * @param {Record<string, unknown>} body
 */
export function kalkuliereFusaAuftragPreisdetails(body) {
  const startdatum = String(body?.startdatum || '').trim();
  const laufzeit_monate = Math.floor(Number(body?.laufzeit_monate));
  const fahrzeugtyp = body?.fahrzeugtyp;
  const globalPaket = String(body?.paket || '').trim();
  const partnerModellId =
    String(body?.partner_modell_id || body?.partnermodell || '').trim() || DEFAULT_MODELL_ID;
  const posIn = Array.isArray(body?.positionen)
    ? body.positionen
    : Array.isArray(body?.preispositionen_input)
      ? body.preispositionen_input
      : [];

  const nPos = posIn.length;
  const fzAnzahlLegacy = Math.max(1, Math.floor(Number(body?.fahrzeuganzahl) || 1));
  const fzCount = nPos > 0 ? nPos : fzAnzahlLegacy;

  const paketFuerBasis =
    globalPaket || (nPos > 0 ? String(/** @type {any} */ (posIn[0])?.paket || '').trim() : '');

  const baseKalk = kalkuliereAuftragsparameter({
    startdatum,
    laufzeit_monate,
    fahrzeugtyp,
    paket: paketFuerBasis,
    fahrzeuganzahl: fzCount,
  });

  /** @type {Record<string, unknown>[]} */
  const positionen = [];
  let netSum = 0;
  let internSum = 0;
  let ccSum = 0;
  let partSum = 0;

  for (const raw of posIn) {
    if (!raw || typeof raw !== 'object') continue;
    const fid = String(/** @type {any} */ (raw).fahrzeug_id || '').trim();
    if (!fid) continue;
    const row = berechneEinzelpreisposition(/** @type {any} */ (raw), partnerModellId, globalPaket);
    positionen.push(row);
    netSum += /** @type {number} */ (row.netto_monat);
    internSum += /** @type {number} */ (row.intern_monat);
    ccSum += /** @type {number} */ (row.cc_betrag);
    partSum += /** @type {number} */ (row.partner_betrag);
  }

  const lz = Number.isFinite(laufzeit_monate) && laufzeit_monate >= 1 ? laufzeit_monate : 0;
  const summen = {
    fahrzeuge_anzahl: positionen.length || fzCount,
    laufzeit_monate: lz,
    netto_monat_gesamt: r2(netSum),
    intern_monat_gesamt: r2(internSum),
    cc_gesamt_monat: r2(ccSum),
    partner_gesamt_monat: r2(partSum),
    auftragswert_gesamt: lz > 0 ? r2(netSum * lz) : 0,
  };

  const preis_monat = positionen.length ? r2(netSum) : baseKalk.preis_monat;
  const gesamtpreis = positionen.length ? summen.auftragswert_gesamt : baseKalk.gesamtpreis;

  return {
    partner_modelle: PARTNER_MODELLE,
    enddatum: baseKalk.enddatum,
    preis_monat,
    gesamtpreis,
    erlaubte_konfiguration: baseKalk.erlaubte_konfiguration,
    positionen,
    summen,
  };
}

/**
 * Serverseitige Normalisierung: `preispositionen` + `summen` aus Eingaben neu berechnen.
 * Mutiert `extraObj`.
 *
 * @param {Record<string, unknown>} extraObj fusa_extra_json als Objekt
 * @param {{ termin?: string|null, startdatum?: string|null }} bodyHinweise
 */
export function applyServerPreisSnapshotToExtra(extraObj, bodyHinweise) {
  if (!extraObj || typeof extraObj !== 'object') return extraObj;
  const pos = extraObj.preispositionen;
  if (!Array.isArray(pos) || pos.length === 0) return extraObj;
  const start = String(bodyHinweise?.termin || bodyHinweise?.startdatum || '').trim();
  const lz = Math.floor(Number(extraObj.laufzeit_monate));
  const snap = kalkuliereFusaAuftragPreisdetails({
    startdatum: start,
    laufzeit_monate: lz,
    fahrzeugtyp: extraObj.fahrzeugtyp,
    paket: String(extraObj.paket || ''),
    partner_modell_id: String(extraObj.partnermodell || extraObj.partner_modell_id || DEFAULT_MODELL_ID),
    positionen: pos,
    fahrzeuganzahl: pos.length,
  });
  extraObj.preispositionen = snap.positionen;
  extraObj.summen = snap.summen;
  return extraObj;
}

/**
 * Pflichtregeln für finalen Auftrag (nicht Entwurf).
 *
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>|null} extraObj geparstes fusa_extra_json
 * @param {{ fahrzeugIdsCount: number }} ctx
 * @returns {string[]} Fehlercodes / kurze Keys
 */
export function validateFusaFinalOrderInput(body, extraObj, ctx) {
  /** @type {string[]} */
  const errs = [];
  if (!extraObj || typeof extraObj !== 'object') {
    errs.push('fusa_extra_json_ungueltig');
    return errs;
  }
  if (!String(extraObj.abrechnungsart || '').trim()) errs.push('abrechnungsart_pflicht');
  if (!String(extraObj.montage_wunschtermin || '').trim()) errs.push('montage_wunschtermin_pflicht');
  const arr = extraObj.preispositionen;
  if (!Array.isArray(arr) || arr.length === 0) errs.push('preispositionen_pflicht');
  if (ctx.fahrzeugIdsCount > 0 && Array.isArray(arr) && arr.length !== ctx.fahrzeugIdsCount) {
    errs.push('preispositionen_anzahl_fahrzeuge');
  }
  return errs;
}

export function buildFormMetaPayload() {
  const depotoptionen = alleDepotNamenSortiert();
  const pakete_je_typ = FAHRZEUGTYPEN.map((t) => ({
    fahrzeugtyp_id: t.id,
    fahrzeugtyp_label: t.label,
    pakete: (PAKETE_JE_TYP_ID[t.id] || []).map((name) => ({
      name,
      info_einzeilig: PAKET_INFO_EINZEILER[name] ?? null,
      preis_monat_netto: preisMonatNettoFuerPaket(name),
    })),
  }));

  return {
    fahrzeugtypen: FAHRZEUGTYPEN.map((t) => ({ id: t.id, key: t.key, label: t.label })),
    pakete_je_typ,
    depotoptionen,
    betreiber_depots: BETREIBER_DEPOTS,
    werkstatt_je_depot: WERKSTATT_JE_DEPOT,
    preisgrundlagen: {
      default_modell_id: DEFAULT_MODELL_ID,
      partner_modelle: PARTNER_MODELLE,
      paket_preise_monat_netto: { ...PAKET_PREISE_MONAT_NETTO },
    },
    fz_typ_slug_zu_label: FZ_TYP_SLUG_ZU_LABEL,
  };
}
