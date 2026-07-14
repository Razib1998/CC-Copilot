/**
 * Read-only Detaildarstellung für CalendarEvent (Modal + reines HTML-Rendering).
 *
 * CC-Plattform Regel 4: sensible Felder (z. B. Preise, interne Notizen) dürfen erst mit
 * API-Anbindung erscheinen, wenn das Backend sie freigibt — nicht nur per ausgeblendetem Button.
 * @see ./ccw-calendar-plattform-regeln.js
 */

import { normalizeBeklebungsterminStatus } from './fusa-beklebung-kalender.js';

/** @typedef {import('./ccw-calendar-event-foundation.js').CalendarEvent} CalendarEvent */

const EM_DASH = '—';

/** @type {Record<string, string>} */
const TYP_LABEL_DE = {
  montage: 'Montage',
  demontage: 'Demontage',
  produktion: 'Produktion',
  druck: 'Druck',
  plot: 'Plot',
  laminat: 'Laminat',
  abnahme: 'Abnahme',
  werkstatt: 'Werkstatt',
  schaden: 'Schaden',
  kundentermin: 'Kundentermin',
  lieferung: 'Lieferung',
  besichtigung: 'Besichtigung',
  planung: 'Planung',
  intern: 'Intern',
  sonstiges: 'Sonstiges',
};

/** @type {Record<string, string>} */
const STATUS_LABEL_DE = {
  offen: 'Offen',
  geplant: 'Geplant',
  zugewiesen: 'Zugewiesen',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
  verschoben: 'Verschoben',
  abgesagt: 'Abgesagt',
  problem: 'Problem',
};

/** @type {Record<string, string>} */
const QUELLE_SYSTEM_LABEL_DE = {
  cc_intern: 'CC Intern',
  fusa: 'FUSA',
};

/** @type {Record<string, string>} */
const TRANSPORT_QUELLE_LABEL_DE = {
  snapshot: 'Snapshot',
  api: 'API',
};

/** @type {Record<string, string>} */
const OBJEKT_TYP_LABEL_DE = {
  fahrzeug: 'Fahrzeug',
  maschine: 'Maschine',
  auftrag: 'Auftrag',
  projekt: 'Projekt',
  schaden: 'Schaden',
};

/**
 * @param {unknown} v
 * @returns {string}
 */
function esc(v) {
  if (v == null || v === '') return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isEmptyish(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function formatCalendarEventTypForDisplay(v) {
  if (v == null || typeof v !== 'string' || v.trim() === '') return EM_DASH;
  const key = v.trim();
  return TYP_LABEL_DE[key] ?? key.replace(/_/g, ' ');
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function formatCalendarEventStatusForDisplay(v) {
  if (v == null || typeof v !== 'string' || v.trim() === '') return EM_DASH;
  const key = v.trim();
  return STATUS_LABEL_DE[key] ?? key.replace(/_/g, ' ');
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function formatQuelleSystem(v) {
  if (v == null || typeof v !== 'string' || v.trim() === '') return EM_DASH;
  const key = v.trim();
  return QUELLE_SYSTEM_LABEL_DE[key] ?? key;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function formatTransportQuelle(v) {
  if (v == null || typeof v !== 'string' || v.trim() === '') return EM_DASH;
  const key = v.trim();
  return TRANSPORT_QUELLE_LABEL_DE[key] ?? key;
}

/**
 * @param {CalendarEvent} e
 * @returns {string}
 */
function formatZeitraumForDetail(e) {
  const startIso = e.start;
  const endIso = e.ende;
  if (e.ganztag === true) {
    const opt = { dateStyle: 'medium' };
    try {
      const a = new Date(startIso);
      const b = new Date(endIso);
      if (Number.isNaN(a.getTime())) return EM_DASH;
      const s1 = a.toLocaleDateString('de-DE', opt);
      if (Number.isNaN(b.getTime())) return s1;
      const s2 = b.toLocaleDateString('de-DE', opt);
      if (s1 === s2) return s1;
      return `${s1} – ${s2}`;
    } catch {
      return EM_DASH;
    }
  }
  const opt = { dateStyle: 'short', timeStyle: 'short' };
  try {
    const a = new Date(startIso);
    const b = new Date(endIso);
    if (Number.isNaN(a.getTime())) return EM_DASH;
    const s1 = a.toLocaleString('de-DE', opt);
    if (Number.isNaN(b.getTime())) return s1;
    const s2 = b.toLocaleString('de-DE', opt);
    return `${s1} – ${s2}`;
  } catch {
    return EM_DASH;
  }
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function dashOr(v) {
  if (isEmptyish(v)) return EM_DASH;
  return esc(String(v));
}

/**
 * @param {...unknown} values
 * @returns {string}
 */
function firstDisplayValue(...values) {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

/**
 * Kurze Kennung für lange IDs (UUID) — voller Wert bleibt im `title`.
 * @param {string} id
 * @returns {string}
 */
function abbreviateIdForDisplay(id) {
  const s = String(id || '').trim();
  if (!s) return '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return `${s.slice(0, 8)}…${s.slice(-6)}`;
  }
  if (s.length <= 18) return s;
  return `${s.slice(0, 10)}…${s.slice(-6)}`;
}

/**
 * @param {{ kind: 'projekt'|'auftrag'; name: string; id: unknown }} p
 * @returns {string} HTML (bereits escaped)
 */
function entityReferenceCellHtml(p) {
  const kindDe = p.kind === 'projekt' ? 'Projekt' : 'Auftrag';
  const nameStr = String(p.name || '').trim();
  const idStr = p.id == null ? '' : String(p.id).trim();
  if (nameStr && idStr) {
    return `<div style="display:flex;flex-direction:column;gap:6px;line-height:1.45;">
      <span style="font-weight:600;font-size:14px;color:var(--fg,#111827);">${esc(nameStr)}</span>
      <span style="font-size:12px;color:var(--muted,#64748b);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;" title="${esc(idStr)}">${esc(kindDe)}-ID: ${esc(abbreviateIdForDisplay(idStr))}</span>
    </div>`;
  }
  if (idStr) {
    return `<div style="display:flex;flex-direction:column;gap:6px;line-height:1.45;">
      <span style="font-size:13px;color:var(--fg,#111827);">${esc(kindDe)} <span style="font-weight:400;color:var(--muted,#64748b);">(nur Kennung)</span></span>
      <code style="font-size:12px;line-height:1.4;color:#334155;background:#f1f5f9;padding:8px 10px;border-radius:8px;word-break:break-all;display:block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid var(--border,#e2e8f0);">${esc(idStr)}</code>
    </div>`;
  }
  if (nameStr) return `<span style="font-weight:600;font-size:14px;">${esc(nameStr)}</span>`;
  return esc(EM_DASH);
}

/**
 * @param {CalendarEvent} e
 * @returns {boolean}
 */
function shouldShowObjektRow(e) {
  const oid = e.objektId == null ? '' : String(e.objektId).trim();
  if (!oid) return false;
  if (e.objektTyp === 'auftrag' && oid === (e.auftragId == null ? '' : String(e.auftragId).trim())) return false;
  if (e.objektTyp === 'projekt' && oid === (e.projektId == null ? '' : String(e.projektId).trim())) return false;
  return true;
}

/**
 * @param {string[]} ids
 * @returns {string}
 */
function formatMitarbeiterList(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return EM_DASH;
  const parts = ids.map(x => (x == null ? '' : String(x).trim())).filter(Boolean);
  if (!parts.length) return EM_DASH;
  return esc(parts.join(', '));
}

/**
 * @param {CalendarEvent} e
 * @param {Record<string, unknown>} ex
 * @returns {string}
 */
function formatMitarbeiterDisplay(e, ex) {
  if (Array.isArray(e.mitarbeiterIds) && e.mitarbeiterIds.length > 0) {
    return formatMitarbeiterList(e.mitarbeiterIds);
  }
  const alt = firstDisplayValue(ex.mitarbeiter, ex.mitarbeiterName, ex.mitarbeiter_namen);
  return alt ? esc(alt) : EM_DASH;
}

/**
 * @param {CalendarEvent} e
 * @returns {string}
 */
function formatObjekt(e) {
  const typ = e.objektTyp;
  const id = e.objektId;
  const typEmpty = typ == null || typ === '';
  const idEmpty = isEmptyish(id);
  if (typEmpty && idEmpty) return EM_DASH;
  const typPart =
    !typEmpty && typeof typ === 'string' ? OBJEKT_TYP_LABEL_DE[typ] ?? typ : '';
  const idPart = !idEmpty ? String(id).trim() : '';
  if (typPart && idPart) return esc(`${typPart} · ${idPart}`);
  if (typPart) return esc(typPart);
  if (idPart) return esc(idPart);
  return EM_DASH;
}

/**
 * @param {CalendarEvent} e
 * @returns {'cockpit'|'cc-intern'|'fusa'|null}
 */
function inferCockpitKalenderQuelleSchluessel(e) {
  const ex = /** @type {Record<string, unknown>} */ (e);
  if (ex.cockpitSourceType === 'cockpit') return 'cockpit';
  if (ex.cockpitSourceType === 'cc-intern') return 'cc-intern';
  if (ex.cockpitSourceType === 'fusa') return 'fusa';
  if (e.quelleSystem === 'fusa') return 'fusa';
  const ot = e.objektTyp;
  if (ot === 'schaden' || ot === 'fahrzeug') return 'fusa';
  if (ot === 'auftrag' || ot === 'projekt') return 'cc-intern';
  if (e.auftragId != null && String(e.auftragId).trim() !== '') return 'cc-intern';
  if (e.quelleSystem === 'cc_intern') return 'cc-intern';
  return null;
}

/**
 * @param {CalendarEvent} e
 * @returns {string}
 */
function formatQuelleLine(e) {
  const ex = /** @type {Record<string, unknown>} */ (e);
  const key = inferCockpitKalenderQuelleSchluessel(e);
  if (key === 'cockpit') return 'Cockpit';

  const tr = formatTransportQuelle(e.transportQuelle);
  const trPart = tr !== EM_DASH ? ` · ${tr}` : '';

  if (key === 'fusa') return 'FUSA';
  if (key === 'cc-intern') return `CC Intern${trPart}`;

  if (typeof ex.cockpitSourceType === 'string' && String(ex.cockpitSourceType).trim() !== '') {
    return String(ex.cockpitSourceType).trim();
  }

  const a = formatQuelleSystem(e.quelleSystem);
  const b = formatTransportQuelle(e.transportQuelle);
  if (a === EM_DASH && b === EM_DASH) return EM_DASH;
  if (a === EM_DASH) return b;
  if (b === EM_DASH) return a;
  return `${a} · ${b}`;
}

/**
 * Lesbare Quellen-Zeile (HTML) für das Detail-Modal.
 * @param {CalendarEvent} e
 * @returns {string}
 */
function formatQuelleValueHtml(e) {
  const ex = /** @type {Record<string, unknown>} */ (e);
  const key = inferCockpitKalenderQuelleSchluessel(e);
  const trLabel = formatTransportQuelle(e.transportQuelle);
  const snapHint =
    e.transportQuelle === 'snapshot'
      ? 'Aktueller App-Stand (Snapshot) — keine zweite Kalender-Pflege neben dem Auftrag.'
      : trLabel !== EM_DASH
        ? `Technik: ${esc(trLabel)}`
        : '';

  if (key === 'cockpit') {
    return `<div style="line-height:1.45;">
      <span style="font-weight:600;font-size:14px;color:var(--fg,#111827);">Cockpit</span>
      <span style="display:block;font-size:12px;color:var(--muted,#64748b);margin-top:4px;">Termin aus dieser Cockpit-Ansicht bzw. lokal im Browser.</span>
    </div>`;
  }
  if (key === 'fusa') {
    return `<div style="line-height:1.45;">
      <span style="font-weight:600;font-size:14px;color:var(--fg,#111827);">FUSA</span>
      <span style="display:block;font-size:12px;color:var(--muted,#64748b);margin-top:4px;">Fuhrpark / Beklebung.</span>
      ${snapHint ? `<span style="display:block;font-size:12px;color:var(--muted,#64748b);margin-top:6px;">${snapHint}</span>` : ''}
    </div>`;
  }
  if (key === 'cc-intern') {
    return `<span style="font-weight:600;font-size:14px;color:var(--fg,#111827);">CC Intern</span>`;
  }

  if (typeof ex.cockpitSourceType === 'string' && String(ex.cockpitSourceType).trim() !== '') {
    return `<span style="font-size:14px;">${esc(String(ex.cockpitSourceType).trim())}</span>`;
  }

  const plain = formatQuelleLine(e);
  return `<span style="font-size:14px;line-height:1.45;">${esc(plain)}</span>`;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function formatBeklebungsterminStatusDe(raw) {
  const n = normalizeBeklebungsterminStatus(raw);
  if (n === 'geplant') return 'Geplant';
  if (n === 'bestaetigt') return 'Bestätigt';
  if (n === 'verschoben') return 'Verschoben';
  return EM_DASH;
}

/**
 * @param {string} label
 * @param {string} valueHtml
 * @returns {string}
 */
function rowHtml(label, valueHtml) {
  return `<div class="ccw-cal-detail-row" style="display:grid;grid-template-columns:minmax(7.5rem,11rem) 1fr;gap:10px 18px;padding:10px 0;border-bottom:1px solid var(--border,#e5e7eb);font-size:13px;font-family:system-ui,sans-serif;align-items:start;">
    <span class="ccw-cal-detail-label" style="font-weight:600;color:var(--muted,#64748b);line-height:1.35;padding-top:2px;">${esc(label)}</span>
    <span class="ccw-cal-detail-value" style="color:var(--fg,#111827);min-width:0;">${valueHtml}</span>
  </div>`;
}

/**
 * Reines HTML für den Dialog-Inhalt (kein DOM, kein State).
 *
 * @param {CalendarEvent} event
 * @returns {string}
 */
export function renderCalendarEventDetail(event) {
  if (!event || typeof event !== 'object') {
    return `<p>${esc('Keine Termindaten.')}</p>`;
  }

  const e = /** @type {CalendarEvent} */ (event);
  const ex = /** @type {Record<string, unknown>} */ (event);
  const titel = isEmptyish(e.titel) ? EM_DASH : esc(String(e.titel));
  const typOverride =
    typeof ex.cockpitLokalTypLabel === 'string' && String(ex.cockpitLokalTypLabel).trim() !== ''
      ? String(ex.cockpitLokalTypLabel).trim()
      : null;
  const typ = esc(typOverride ?? formatCalendarEventTypForDisplay(e.typ));
  const bekRoh = ex.cockpitFusaBeklebungsterminRoh;
  const status =
    typeof bekRoh === 'string' && bekRoh.trim() !== ''
      ? esc(formatBeklebungsterminStatusDe(bekRoh))
      : esc(formatCalendarEventStatusForDisplay(e.status));
  const zeitraum = esc(formatZeitraumForDetail(e));
  const projektName = typeof ex.cockpitProjektName === 'string' && ex.cockpitProjektName.trim() !== '' ? ex.cockpitProjektName.trim() : '';
  const projekt = entityReferenceCellHtml({ kind: 'projekt', name: projektName, id: e.projektId });
  const auftragName = typeof ex.cockpitAuftragName === 'string' && ex.cockpitAuftragName.trim() !== '' ? ex.cockpitAuftragName.trim() : '';
  const auftrag = entityReferenceCellHtml({ kind: 'auftrag', name: auftragName, id: e.auftragId });
  const kundeName = firstDisplayValue(ex.cockpitKundeName, ex.kunde, ex.kundenname, ex.firma, ex.firmaName);
  const kunde = kundeName ? esc(kundeName) : dashOr(e.kundeId);
  const mitarbeiter = formatMitarbeiterDisplay(e, ex);
  const verantwortlichRaw = firstDisplayValue(
    e.verantwortlichId,
    ex.verantwortlich,
    ex.verantwortlicher,
    ex.verantwortlicherName,
  );
  const verantwortlich = verantwortlichRaw ? esc(verantwortlichRaw) : EM_DASH;
  const fzDisp = firstDisplayValue(ex.cockpitFahrzeugDisplay, ex.fahrzeug, ex.fahrzeugName, ex.kennzeichen);
  const fahrzeug = fzDisp ? esc(fzDisp) : dashOr(e.fahrzeugId);
  const objekt = formatObjekt(e);
  const showObjekt = shouldShowObjektRow(e);
  const standortRaw = firstDisplayValue(e.standort, ex.standort, ex.depot, ex.ort);
  const standort = standortRaw ? esc(standortRaw) : EM_DASH;
  const quelleHtml = formatQuelleValueHtml(e);
  const ccSparteRaw =
    typeof ex.cockpitCcInternTerminSparte === 'string' ? String(ex.cockpitCcInternTerminSparte).trim().toLowerCase() : '';
  const ccAuftragFeld =
    ccSparteRaw === 'montage'
      ? 'Montage-Datum im Auftrag'
      : ccSparteRaw === 'lieferung'
        ? 'Lieferdatum im Auftrag'
        : '';
  const ccAuftragRow = ccAuftragFeld ? rowHtml('Im Auftrag', `<span style="font-size:14px;font-weight:600;color:var(--fg,#111827);">${esc(ccAuftragFeld)}</span>`) : '';
  const auftragRowLabel = ccSparteRaw === 'montage' || ccSparteRaw === 'lieferung' ? 'Auftrags-Nr.' : 'Auftrag';

  const notizRaw =
    typeof ex.cockpitLokalNotiz === 'string' && String(ex.cockpitLokalNotiz).trim() !== ''
      ? String(ex.cockpitLokalNotiz).trim()
      : '';
  const notizRow = notizRaw ? rowHtml('Notiz', esc(notizRaw)) : '';

  const objektRow = showObjekt ? rowHtml('Objekt', esc(objekt)) : '';

  const rows = [
    rowHtml('Titel', `<span style="font-size:14px;line-height:1.45;font-weight:500;">${titel}</span>`),
    rowHtml('Typ', `<span style="font-size:14px;">${typ}</span>`),
    ccAuftragRow,
    rowHtml('Status', `<span style="font-size:14px;">${status}</span>`),
    rowHtml('Zeitraum', `<span style="font-size:14px;font-variant-numeric:tabular-nums;">${zeitraum}</span>`),
    rowHtml('Projekt', projekt),
    rowHtml(auftragRowLabel, auftrag),
    rowHtml('Kunde', kunde),
    rowHtml('Mitarbeiter', mitarbeiter),
    rowHtml('Verantwortlich', verantwortlich),
    rowHtml('Fahrzeug', fahrzeug),
    objektRow,
    rowHtml('Standort', standort),
    rowHtml('Quelle', quelleHtml),
    notizRow,
  ].join('');

  return `<div class="ccw-cal-detail-inner" style="padding:4px 4px 0;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
      <h3 id="ccw-cal-detail-title" style="margin:0;font-size:16px;font-weight:600;font-family:system-ui,sans-serif;">Termin-Details</h3>
      <button type="button" data-ccw-cal-detail-close class="ccw-cal-detail-close" aria-label="Schließen"
        style="flex-shrink:0;padding:6px 12px;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--card,#fff);font-size:13px;cursor:pointer;font-family:system-ui,sans-serif;">Schließen</button>
    </div>
    <div style="margin:0;">${rows}</div>
  </div>`;
}

/** @type {HTMLElement|null} */
let activeOverlayEl = null;

/** @type {((ev: KeyboardEvent) => void) | null} */
let activeEscapeHandler = null;

/**
 * Allgemeine servergeführte Termine: Bearbeiten/Löschen (Cockpit-Kalender registriert Handler beim Mount).
 * @typedef {{ onSave: (p: { eventId: string; titel: string; startIso: string; endeIso: string; notiz: string }) => void; onDelete: (eventId: string) => void }} CockpitLocalGeneralEditHandlers
 */

/** @type {CockpitLocalGeneralEditHandlers | null} */
let cockpitLocalGeneralEditHandlers = null;

/**
 * @param {CockpitLocalGeneralEditHandlers | null} h
 */
export function registerCockpitLocalGeneralTerminEditHandlers(h) {
  cockpitLocalGeneralEditHandlers = h;
}

/**
 * @param {unknown} eventId
 */
function isCockpitGeneralLocalEventId(eventId) {
  return String(eventId || '').startsWith('ccw-cockpit-general-');
}

/**
 * @param {string} iso
 * @returns {string} datetime-local (Europe/Berlin)
 */
function formatDatetimeLocalBerlinFromIso(iso) {
  const ms = new Date(String(iso || '')).getTime();
  if (Number.isNaN(ms)) return '';
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(ms));
    const y = parts.find(p => p.type === 'year')?.value ?? '1970';
    const mo = parts.find(p => p.type === 'month')?.value ?? '01';
    const da = parts.find(p => p.type === 'day')?.value ?? '01';
    const h = parts.find(p => p.type === 'hour')?.value ?? '00';
    const mi = parts.find(p => p.type === 'minute')?.value ?? '00';
    return `${y}-${mo}-${da}T${h}:${mi}`;
  } catch {
    return '';
  }
}

/**
 * Formular: allgemeiner Termin (nur mit registrierten Handlern aktiv).
 *
 * @param {CalendarEvent} event
 * @returns {string}
 */
export function renderCalendarEventGeneralEdit(event) {
  if (!event || typeof event !== 'object') {
    return `<p>${esc('Keine Termindaten.')}</p>`;
  }
  const e = /** @type {CalendarEvent} */ (event);
  const ex = /** @type {Record<string, unknown>} */ (event);
  const titelRaw = String(e.titel ?? '').trim();
  const startVal = formatDatetimeLocalBerlinFromIso(String(e.start ?? ''));
  const endVal = formatDatetimeLocalBerlinFromIso(String(e.ende ?? ''));
  const notizRaw =
    typeof ex.cockpitLokalNotiz === 'string' && String(ex.cockpitLokalNotiz).trim() !== ''
      ? String(ex.cockpitLokalNotiz).trim()
      : '';
  const titelAttr = esc(titelRaw);
  const notizEsc = esc(notizRaw);

  return `<div class="ccw-cal-detail-inner" data-ccw-cal-general-edit="1" style="padding:4px 4px 0;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
      <h3 id="ccw-cal-detail-title" style="margin:0;font-size:16px;font-weight:600;font-family:system-ui,sans-serif;">Allgemeinen Termin bearbeiten</h3>
      <button type="button" data-ccw-cal-detail-close class="ccw-cal-detail-close" aria-label="Schließen"
        style="flex-shrink:0;padding:6px 12px;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--card,#fff);font-size:13px;cursor:pointer;font-family:system-ui,sans-serif;">Schließen</button>
    </div>
    <p style="margin:0 0 12px;font-size:12px;color:var(--muted,#64748b);">Zentral auf dem Server gespeichert — sichtbar im Kalender und Dashboard.</p>
    <form data-ccw-cal-general-edit-form style="display:flex;flex-direction:column;gap:10px;">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--muted,#64748b);">Titel
        <input name="titel" type="text" required autocomplete="off" value="${titelAttr}"
          style="padding:8px 10px;border-radius:8px;border:1px solid var(--border,#e5e7eb);font-size:14px;font-weight:400;color:var(--fg,#111827);" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--muted,#64748b);">Start
        <input name="start" type="datetime-local" required value="${esc(startVal)}"
          style="padding:8px 10px;border-radius:8px;border:1px solid var(--border,#e5e7eb);font-size:14px;font-weight:400;color:var(--fg,#111827);" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--muted,#64748b);">Ende
        <input name="ende" type="datetime-local" required value="${esc(endVal)}"
          style="padding:8px 10px;border-radius:8px;border:1px solid var(--border,#e5e7eb);font-size:14px;font-weight:400;color:var(--fg,#111827);" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--muted,#64748b);">Notiz (optional)
        <textarea name="notiz" rows="2" autocomplete="off"
          style="padding:8px 10px;border-radius:8px;border:1px solid var(--border,#e5e7eb);font-size:14px;font-weight:400;color:var(--fg,#111827);resize:vertical;">${notizEsc}</textarea>
      </label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
        <button type="submit" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--fg,#111827);color:#fff;font-size:13px;cursor:pointer;font-family:system-ui,sans-serif;">Speichern</button>
        <button type="button" data-ccw-cal-general-edit-cancel style="padding:8px 14px;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--card,#fff);font-size:13px;cursor:pointer;font-family:system-ui,sans-serif;">Abbrechen</button>
        <button type="button" data-ccw-cal-general-delete style="margin-left:auto;padding:8px 14px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;font-size:13px;cursor:pointer;font-family:system-ui,sans-serif;">Termin löschen</button>
      </div>
    </form>
  </div>`;
}

export function closeCalendarEventDetail() {
  if (activeEscapeHandler) {
    document.removeEventListener('keydown', activeEscapeHandler, true);
    activeEscapeHandler = null;
  }
  if (activeOverlayEl && activeOverlayEl.parentNode) {
    activeOverlayEl.parentNode.removeChild(activeOverlayEl);
  }
  activeOverlayEl = null;
}

/**
 * @param {CalendarEvent} event
 */
export function openCalendarEventDetail(event) {
  if (typeof document === 'undefined') return;

  closeCalendarEventDetail();

  const overlay = document.createElement('div');
  overlay.className = 'ccw-cal-detail-overlay';
  overlay.setAttribute('data-ccw-cal-detail-overlay', '');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(15,23,42,0.45);font-family:system-ui,sans-serif;';

  const panel = document.createElement('div');
  panel.className = 'ccw-cal-detail-panel';
  panel.setAttribute('data-ccw-cal-detail-panel', '');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'ccw-cal-detail-title');
  panel.style.cssText =
    'max-width:min(34rem,100%);max-height:min(90vh,100%);overflow:auto;background:var(--card,#fff);border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);padding:22px 24px;border:1px solid var(--border,#e5e7eb);';

  const useGeneralEdit =
    event && typeof event === 'object' && isCockpitGeneralLocalEventId(/** @type {CalendarEvent} */ (event).eventId) && cockpitLocalGeneralEditHandlers;

  panel.innerHTML = useGeneralEdit
    ? renderCalendarEventGeneralEdit(/** @type {CalendarEvent} */ (event))
    : renderCalendarEventDetail(/** @type {CalendarEvent} */ (event));

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  activeOverlayEl = overlay;

  overlay.addEventListener('click', ev => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (!t.closest('[data-ccw-cal-detail-panel]')) closeCalendarEventDetail();
  });

  const closeBtn = panel.querySelector('[data-ccw-cal-detail-close]');
  if (closeBtn instanceof HTMLElement) {
    closeBtn.addEventListener('click', () => closeCalendarEventDetail());
  }

  if (useGeneralEdit && cockpitLocalGeneralEditHandlers) {
    const handlers = cockpitLocalGeneralEditHandlers;
    const evRef = /** @type {CalendarEvent} */ (event);
    const eventId = String(evRef.eventId);

    const cancelEls = panel.querySelectorAll('[data-ccw-cal-general-edit-cancel]');
    cancelEls.forEach(el => {
      if (el instanceof HTMLElement) el.addEventListener('click', () => closeCalendarEventDetail());
    });

    const form = panel.querySelector('[data-ccw-cal-general-edit-form]');
    if (form instanceof HTMLFormElement) {
      form.addEventListener('submit', sev => {
        sev.preventDefault();
        const fd = new FormData(form);
        const titel = String(fd.get('titel') ?? '').trim();
        const startLocal = String(fd.get('start') ?? '');
        const endeLocal = String(fd.get('ende') ?? '');
        const notiz = String(fd.get('notiz') ?? '').trim();
        if (!titel) {
          if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
            globalThis.alert('Bitte einen Titel eingeben.');
          }
          return;
        }
        const startMs = new Date(startLocal).getTime();
        const endMs = new Date(endeLocal).getTime();
        if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
          if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
            globalThis.alert('Start und Ende müssen gültig sein; Ende muss nach Start liegen.');
          }
          return;
        }
        handlers.onSave({
          eventId,
          titel,
          startIso: new Date(startMs).toISOString(),
          endeIso: new Date(endMs).toISOString(),
          notiz,
        });
        closeCalendarEventDetail();
      });
    }

    const delBtn = panel.querySelector('[data-ccw-cal-general-delete]');
    if (delBtn instanceof HTMLElement) {
      delBtn.addEventListener('click', () => {
        if (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function') {
          if (!globalThis.confirm('Termin wirklich löschen?')) return;
        }
        handlers.onDelete(eventId);
        closeCalendarEventDetail();
      });
    }

    const titelInp = panel.querySelector('input[name="titel"]');
    if (titelInp instanceof HTMLElement) titelInp.focus();
  } else if (closeBtn instanceof HTMLElement) {
    closeBtn.focus();
  } else {
    panel.tabIndex = -1;
    panel.focus();
  }

  /** @param {KeyboardEvent} ev */
  const onEscape = ev => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeCalendarEventDetail();
    }
  };
  activeEscapeHandler = onEscape;
  document.addEventListener('keydown', onEscape, true);
}

/**
 * Tagesliste bei „+N“ in der Monatsansicht (nur Anzeige; Klick → Termin-Details).
 *
 * @param {string} ymd YYYY-MM-DD (Europe/Berlin)
 * @param {import('./ccw-calendar-event-foundation.js').CalendarEvent[]} events
 */
export function openCalendarDayListModal(ymd, events) {
  if (typeof document === 'undefined') return;
  const list = Array.isArray(events) ? events : [];
  closeCalendarEventDetail();

  const overlay = document.createElement('div');
  overlay.className = 'ccw-cal-detail-overlay';
  overlay.setAttribute('data-ccw-cal-daylist-overlay', '');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(15,23,42,0.45);font-family:system-ui,sans-serif;';

  let titleLine = ymd;
  try {
    const [y, m, d] = ymd.split('-').map(Number);
    titleLine = new Intl.DateTimeFormat('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    /* keep ymd */
  }

  const rows = list
    .map(e => {
      const id = e && e.eventId != null ? String(e.eventId) : '';
      const titel = esc(String(e?.titel || 'Termin'));
      const tf = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false });
      let zeit = '';
      try {
        const a = e?.start != null ? new Date(String(e.start)) : null;
        const b = e?.ende != null ? new Date(String(e.ende)) : null;
        if (a && !Number.isNaN(a.getTime())) {
          zeit = e?.ganztag === true ? 'Ganztägig' : b && !Number.isNaN(b.getTime()) ? `${tf.format(a)}–${tf.format(b)}` : tf.format(a);
        }
      } catch {
        zeit = '';
      }
      const z = zeit ? esc(zeit) : '';
      return `<li style="margin:0;padding:0;list-style:none;">
        <button type="button" data-ccw-cal-daylist-pick="${esc(id)}" style="width:100%;text-align:left;padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-size:13px;margin-bottom:6px;display:flex;flex-direction:column;align-items:flex-start;gap:2px;font-family:inherit;">
          <span style="font-weight:600;color:#1e293b;">${titel}</span>
          ${z ? `<span style="font-size:12px;color:#64748b;font-variant-numeric:tabular-nums;">${z}</span>` : ''}
        </button>
      </li>`;
    })
    .join('');

  const panel = document.createElement('div');
  panel.className = 'ccw-cal-detail-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.style.cssText =
    'max-width:min(26rem,100%);max-height:min(85vh,100%);overflow:auto;background:#fff;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);padding:20px;border:1px solid #e5e7eb;';
  panel.innerHTML = `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
    <h3 style="margin:0;font-size:16px;font-weight:600;color:#0f172a;">Termine</h3>
    <button type="button" data-ccw-cal-daylist-close style="flex-shrink:0;padding:6px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;cursor:pointer;">Schließen</button>
  </div>
  <p style="margin:0 0 12px;font-size:13px;color:#64748b;">${esc(titleLine)}</p>
  <ul style="margin:0;padding:0;">${rows || `<li style="color:#64748b;font-size:13px;">Keine Termine.</li>`}</ul>`;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  activeOverlayEl = overlay;

  overlay.addEventListener('click', ev => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const pick = t.closest('[data-ccw-cal-daylist-pick]');
    if (pick instanceof HTMLElement) {
      ev.preventDefault();
      const id = pick.getAttribute('data-ccw-cal-daylist-pick');
      const evObj = list.find(x => x && String(x.eventId) === String(id));
      closeCalendarEventDetail();
      if (evObj) openCalendarEventDetail(evObj);
      return;
    }
    if (!t.closest('.ccw-cal-detail-panel')) closeCalendarEventDetail();
  });

  const closeBtn = panel.querySelector('[data-ccw-cal-daylist-close]');
  if (closeBtn instanceof HTMLElement) {
    closeBtn.addEventListener('click', () => closeCalendarEventDetail());
  }

  /** @param {KeyboardEvent} ev */
  const onEscape = ev => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeCalendarEventDetail();
    }
  };
  activeEscapeHandler = onEscape;
  document.addEventListener('keydown', onEscape, true);
}
