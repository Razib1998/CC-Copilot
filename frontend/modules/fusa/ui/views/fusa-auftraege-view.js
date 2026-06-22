/**
 * FUSA — Aufträge: GET `/api/v1/fusa/auftraege`, gefiltert nach aktivem Projekt.
 * Listen-UI/Detail-Overlay/Modal-Rahmen orientieren sich an `FUSA_UMZUG_FERTIG` (`#pg-auftraege`, `overlay`/`dpanel`);
 * Daten nur über Cockpit/FUSA-API (Liste, GET `/auftraege/:id`, Wizard).
 */
import { esc } from "../../fusa-ui-shared.js";
import {
  apiFetch,
  formatApiErrorForUi,
} from "../../../../core/auth/cc-auth-session.js";
import { loadMyRights, myRight } from "../../../../core/access/cc-my-rights.js";
import {
  renderFusaApiAuftraegeUmzugTableInnerHtml,
  formatFusaFahrzeugIdsShort,
} from "../../../shared/ui/auftraege-api-table.js";
import {
  resolveFusaAuftragUiStatus,
  fusaAuftragBadgeClassesForBucket,
} from "../../lib/fusa-auftrag-ui-status.js";
import {
  buildFusaAuftragWizardShellHtml,
  bootFusaAuftragWizard,
} from "./fusa-auftrag-wizard.js";
import { fetchFusaApiAuftraege } from "../../fusa-api-data-port.js";
import {
  getFusaAppProject,
  ensureFusaProjectSelection,
  loadFusaProjectContext,
} from "../../fusa-project-context.js";
import CCState from "../../../../core/state/state.js";
import { resolveAuftragKundenAnzeige } from "../../../shared/lib/firma-kunden-referenz.js";
import { API_ROUTES } from "../../../../core/api/api-routes.js";

/**
 * @param {unknown} v
 * @returns {string}
 */
function fmt(v) {
  if (v == null || v === "") return "—";
  const s = String(v).trim();
  return s || "—";
}

/**
 * KPI-Zähler — gleiche Logik wie Filter/Tabelle ({@link resolveFusaAuftragUiStatus}).
 * @param {object[]} rows
 */
function computeFusaUmzugAuftragKpis(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let aktiv = 0;
  let produktion = 0;
  let endet = 0;
  let abgeschlossen = 0;
  for (const a of list) {
    const { filterTab } = resolveFusaAuftragUiStatus(a);
    if (filterTab === "aktiv") aktiv += 1;
    else if (filterTab === "in_produktion") produktion += 1;
    else if (filterTab === "endet_bald") endet += 1;
    else if (filterTab === "abgeschlossen") abgeschlossen += 1;
  }
  return { aktiv, produktion, endet, abgeschlossen };
}

/** Auszug aus FUSA_UMZUG `_COCKPIT_UMZUG/ui/fusa.css` — nur Aufträge-relevante Regeln, unter `.fusa-umz-auf-scope` gekapselt. */
const FUSA_UMZUG_AUF_SCOPE_CSS = `<style>
.fusa-umz-auf-scope{--blue:#D4500A;--blue-d:#A83D08;--blue-l:#FFF0E6;--green:#2E7D32;--green-l:#E8F5E9;--amber:#E65100;--amber-l:#FFF3E0;--red:#C62828;--red-l:#FFEBEE;--purple:#4527A0;--purple-l:#EDE7F6;--teal:#00695C;--teal-l:#E0F2F1;--gray:#546E7A;--gray-l:#ECEFF1;--border:#DDE3E8;--text:#0F1923;--text2:#546E7A;--text3:#90A4AE;--bg:#F0F4F8;--card:#FFF;}
.fusa-umz-auf-scope .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
.fusa-umz-auf-scope .sc{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:15px 16px;display:flex;align-items:flex-start;gap:11px;}
.fusa-umz-auf-scope .sc-ico{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.fusa-umz-auf-scope .sc-n{font-size:22px;font-weight:700;letter-spacing:-.5px;line-height:1;}
.fusa-umz-auf-scope .sc-l{font-size:11px;color:var(--text2);margin-top:1px;}
.fusa-umz-auf-scope .panel{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;}
.fusa-umz-auf-scope .ph{padding:13px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.fusa-umz-auf-scope .ph-title{font-size:13px;font-weight:600;}
.fusa-umz-auf-scope .ph-right{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.fusa-umz-auf-scope .ph-tools{padding:10px 16px;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;align-items:center;gap:10px;}
.fusa-umz-auf-scope table{width:100%;border-collapse:collapse;font-size:12.5px;}
.fusa-umz-auf-scope thead th{padding:8px 13px;text-align:left;font-size:11px;font-weight:600;color:var(--text2);background:var(--gray-l);border-bottom:1px solid var(--border);white-space:nowrap;}
.fusa-umz-auf-scope tbody td{padding:10px 13px;border-bottom:1px solid var(--border);color:var(--text);vertical-align:middle;}
.fusa-umz-auf-scope tbody tr:last-child td{border-bottom:none;}
.fusa-umz-auf-scope tbody tr:hover td{background:#F7FAFC;cursor:pointer;}
.fusa-umz-auf-scope .tm{font-weight:500;}
.fusa-umz-auf-scope .ts{font-size:11px;color:var(--text2);margin-top:1px;}
.fusa-umz-auf-scope .bdg{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;}
.fusa-umz-auf-scope .bdg::before{content:'';width:5px;height:5px;border-radius:50%;flex-shrink:0;}
.fusa-umz-auf-scope .bb{background:var(--blue-l);color:var(--blue);} .fusa-umz-auf-scope .bb::before{background:var(--blue);}
.fusa-umz-auf-scope .bg{background:var(--green-l);color:var(--green);} .fusa-umz-auf-scope .bg::before{background:var(--green);}
.fusa-umz-auf-scope .ba{background:var(--amber-l);color:var(--amber);} .fusa-umz-auf-scope .ba::before{background:var(--amber);}
.fusa-umz-auf-scope .br{background:var(--red-l);color:var(--red);} .fusa-umz-auf-scope .br::before{background:var(--red);}
.fusa-umz-auf-scope .bp{background:var(--purple-l);color:var(--purple);} .fusa-umz-auf-scope .bp::before{background:var(--purple);}
.fusa-umz-auf-scope .bt{background:var(--teal-l);color:var(--teal);} .fusa-umz-auf-scope .bt::before{background:var(--teal);}
.fusa-umz-auf-scope .bgr{background:var(--gray-l);color:var(--gray);} .fusa-umz-auf-scope .bgr::before{background:var(--gray);}
.fusa-umz-auf-scope .tabs{display:flex;gap:2px;background:var(--gray-l);border-radius:7px;padding:3px;}
.fusa-umz-auf-scope .tab{padding:4px 12px;border-radius:5px;font-size:12px;font-weight:500;cursor:pointer;color:var(--text2);border:none;background:none;transition:all .12s;font-family:inherit;}
.fusa-umz-auf-scope .tab.active{background:#fff;color:var(--blue);box-shadow:0 1px 3px rgba(0,0,0,.08);}
.fusa-umz-auf-scope .btn{padding:6px 14px;border-radius:7px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid var(--border);background:#fff;color:var(--text);transition:all .12s;font-family:inherit;}
.fusa-umz-auf-scope .btn:hover{background:var(--gray-l);}
.fusa-umz-auf-scope .btn.p{background:var(--blue);color:#fff;border-color:var(--blue);}
.fusa-umz-auf-scope .btn.p:hover{background:var(--blue-d);}
.fusa-umz-auf-scope .btn.p.fusa-auf-neu-btn{padding:12px 20px;font-size:15px;border-radius:8px;}
.fusa-umz-auf-scope .srch{padding:6px 12px;border:1px solid var(--border);border-radius:7px;font-size:12px;min-width:180px;flex:1;max-width:320px;outline:none;background:var(--gray-l);color:var(--text);}
.fusa-umz-auf-scope .srch:focus{background:#fff;border-color:var(--blue);}
.fusa-umz-auf-scope .overlay{display:none;position:fixed;inset:0;z-index:10050;align-items:flex-start;justify-content:flex-end;}
.fusa-umz-auf-scope .overlay.fusa-auf-abnahme-overlay{z-index:10062;}
.fusa-umz-auf-scope .dpanel[data-fusa-auf-abnahme-panel]{width:min(920px,100%);}
.fusa-umz-auf-scope .overlay::before{content:'';position:absolute;inset:0;z-index:0;background:rgba(0,0,0,.28);backdrop-filter:blur(2px);pointer-events:none;}
.fusa-umz-auf-scope .overlay.open{display:flex;}
/* Kein transform auf .dpanel: sonst neuer Containing-Block / Compositing — in manchen Layouts blockiert das Klicks auf Buttons im Panel. */
.fusa-umz-auf-scope .dpanel{position:relative;z-index:2;pointer-events:auto;width:min(520px,100%);height:100vh;background:#fff;box-shadow:-6px 0 30px rgba(0,0,0,.12);display:flex;flex-direction:column;animation:fusaUmzSIn .18s ease;}
@keyframes fusaUmzSIn{from{opacity:.88;}to{opacity:1;}}
.fusa-umz-auf-scope .dp-hdr{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.fusa-umz-auf-scope .dp-t{font-size:15px;font-weight:600;}
.fusa-umz-auf-scope .dp-close{width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text2);}
.fusa-umz-auf-scope .dp-body{flex:1;overflow-y:auto;padding:0;min-height:0;}
.fusa-umz-auf-scope .dp-footer{padding:0;border-top:none;min-height:0;}
.fusa-umz-auf-scope .fusa-auf-detail-body .fusa-auf-detail-sec{padding:16px 20px;border-bottom:1px solid var(--border);}
.fusa-umz-auf-scope .fusa-auf-detail-body .fusa-auf-detail-sec:last-child{border-bottom:none;}
.fusa-umz-auf-scope .fusa-umz-neu-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.38);z-index:10060;backdrop-filter:blur(3px);align-items:center;justify-content:center;padding:16px;}
.fusa-umz-auf-scope .fusa-umz-neu-modal.open{display:flex;}
.fusa-umz-auf-scope .fusa-umz-neu-dialog{width:min(960px,calc(100vw - 32px));max-height:min(92vh,900px);min-height:0;display:flex;flex-direction:column;background:var(--card);border-radius:13px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.2);border:1px solid var(--border);}
.fusa-umz-auf-scope .fusa-auf-detail-doclist li:last-child{border-bottom:none;}
</style>`;

/**
 * @param {object} row
 * @returns {Record<string, unknown>}
 */
function parseFusaExtraFromRow(row) {
  const raw = row?.fusa_extra_json;
  if (raw == null || raw === "") return {};
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === "object" && !Array.isArray(o)
      ? /** @type {Record<string, unknown>} */ (o)
      : {};
  } catch {
    return {};
  }
}

/** Persistenz in `fusa_extra_json` (PATCH-Shallow-Merge). Vorlage: Alt `js/modules/fusa/logic/rechnungen.js` (`openAbnahme`, Signature-Pad, `printAbnahme`). */
const FUSA_EXTRA_ABNAHME_PROTOKOLL_KEY = "abnahme_protokoll";

/** Alt `rechnungen.js` — Abnahme-Checkliste (gleiche Prüfpunkte). */
const FUSA_ABNAHME_CHECKLIST_PUNKTE = [
  "Folie vollflächig und blasenfrei verklebt",
  "Alle Hebezeichen beklebt",
  "Fensterfolie / TÜV Aufkleber beklebt",
  "Alle Piktogramme beklebt",
  "Farben entsprechen Druckdatei / Freigabe",
  "Fahrzeug sauber und unbeschädigt übergeben",
  "QR-Code Aufkleber angebracht",
  "Fotos für Dokumentation erstellt",
];

/**
 * @typedef {{
 *   montage_datum: string,
 *   monteur1: string,
 *   monteur2: string,
 *   montagezeit: string,
 *   checklist: { ok: boolean, mangel: boolean, bemerkung: string }[],
 *   bemerkungen: string,
 *   status: 'ok'|'mangel'|'nein',
 *   signatur_monteur: string,
 *   signatur_werkstatt: string,
 *   signatur_cc: string,
 *   name_monteur: string,
 *   name_werkstatt: string,
 *   name_cc: string,
 *   datum_cc: string,
 *   datum_werkstatt: string,
 *   aktualisiert_iso: string,
 *   quelle: string,
 * }} FusaAbnahmeProtokollState
 */

/** @returns {FusaAbnahmeProtokollState} */
function defaultAbnahmeProtokollState() {
  const isoD = new Date().toISOString().slice(0, 10);
  return {
    montage_datum: isoD,
    monteur1: "",
    monteur2: "",
    montagezeit: "07:00",
    checklist: FUSA_ABNAHME_CHECKLIST_PUNKTE.map(() => ({
      ok: true,
      mangel: false,
      bemerkung: "",
    })),
    bemerkungen: "",
    status: "ok",
    signatur_monteur: "",
    signatur_werkstatt: "",
    signatur_cc: "",
    name_monteur: "",
    name_werkstatt: "",
    name_cc: "",
    datum_cc: "",
    datum_werkstatt: "",
    aktualisiert_iso: "",
    quelle: "cockpit_fusa_auftraege",
  };
}

/**
 * @param {Record<string, unknown>} ex
 * @returns {FusaAbnahmeProtokollState}
 */
function normalizeAbnahmeProtokollFromExtra(ex) {
  const base = defaultAbnahmeProtokollState();
  const raw = ex[FUSA_EXTRA_ABNAHME_PROTOKOLL_KEY];
  if (raw == null) return base;
  if (typeof raw === "string") {
    return { ...base, bemerkungen: String(raw) };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const st = { ...base };
  if (o.bemerkungen != null) st.bemerkungen = String(o.bemerkungen);
  else if (o.text != null) st.bemerkungen = String(o.text);
  if (o.status === "ok" || o.status === "mangel" || o.status === "nein")
    st.status = o.status;
  if (o.montage_datum != null)
    st.montage_datum = String(o.montage_datum).slice(0, 10);
  if (o.monteur1 != null) st.monteur1 = String(o.monteur1);
  if (o.monteur2 != null) st.monteur2 = String(o.monteur2);
  if (o.montagezeit != null) st.montagezeit = String(o.montagezeit);
  if (Array.isArray(o.checklist)) {
    st.checklist = FUSA_ABNAHME_CHECKLIST_PUNKTE.map((_, i) => {
      const row = o.checklist[i];
      if (!row || typeof row !== "object") return base.checklist[i];
      const r = /** @type {Record<string, unknown>} */ (row);
      return {
        ok: !!r.ok,
        mangel: !!r.mangel,
        bemerkung: r.bemerkung != null ? String(r.bemerkung) : "",
      };
    });
  }
  const sM = o.signatur_monteur != null ? String(o.signatur_monteur) : "";
  const sW = o.signatur_werkstatt != null ? String(o.signatur_werkstatt) : "";
  const sCc = o.signatur_cc != null ? String(o.signatur_cc) : "";
  st.signatur_monteur = sM;
  st.signatur_werkstatt = sW;
  st.signatur_cc = sCc || sM;
  if (o.name_monteur != null) st.name_monteur = String(o.name_monteur);
  if (o.name_werkstatt != null) st.name_werkstatt = String(o.name_werkstatt);
  if (o.name_cc != null) st.name_cc = String(o.name_cc);
  if (o.datum_cc != null) st.datum_cc = String(o.datum_cc);
  if (o.datum_werkstatt != null) st.datum_werkstatt = String(o.datum_werkstatt);
  if (o.aktualisiert_iso != null)
    st.aktualisiert_iso = String(o.aktualisiert_iso);
  if (o.quelle != null) st.quelle = String(o.quelle);
  return st;
}

/**
 * @param {Record<string, unknown>} ex
 * @returns {{ text: string, aktualisiert_iso: string }}
 */
function parseAbnahmeProtokollFromExtra(ex) {
  const st = normalizeAbnahmeProtokollFromExtra(ex);
  return { text: st.bemerkungen, aktualisiert_iso: st.aktualisiert_iso };
}

/**
 * @param {HTMLElement} scope
 */
function fusaAbnahmeUpdateMonteurMetaLine(scope) {
  const m1 = scope.querySelector("[data-fusa-ap-monteur1]");
  const m2 = scope.querySelector("[data-fusa-ap-monteur2]");
  const dat = scope.querySelector("[data-fusa-ap-datum]");
  const out = scope.querySelector("[data-fusa-ap-monteur-meta]");
  if (!(out instanceof HTMLElement)) return;
  const v1 = m1 instanceof HTMLInputElement ? m1.value.trim() : "";
  const v2 = m2 instanceof HTMLInputElement ? m2.value.trim() : "";
  const d = dat instanceof HTMLInputElement ? dat.value.trim() : "";
  const parts = [v1, v2].filter(Boolean);
  const names = parts.join(" & ");
  const df =
    d && /^\d{4}-\d{2}-\d{2}$/.test(d)
      ? d.split("-").reverse().join(".")
      : d || "—";
  out.textContent = names ? `${names} · ${df}` : `— · ${df}`;
}

/**
 * @param {object} auftrag
 * @param {FusaAbnahmeProtokollState} st
 * @returns {string}
 */
function buildAbnahmeProtokollMountHtml(auftrag, st) {
  const row =
    auftrag && typeof auftrag === "object"
      ? /** @type {Record<string, unknown>} */ (auftrag)
      : {};
  const ex = parseFusaExtraFromRow(row);
  const kampId = row.id != null ? String(row.id) : "—";
  const kunde =
    row.kunde_name != null && String(row.kunde_name).trim() !== ""
      ? String(row.kunde_name).trim()
      : "—";
  const fzKurz =
    row.fahrzeug_kurztext != null && String(row.fahrzeug_kurztext).trim() !== ""
      ? String(row.fahrzeug_kurztext).trim()
      : "";
  const fzLine = fzKurz || formatFusaFahrzeugIdsShort(row.fusa_fahrzeug_ids);
  const paket =
    ex.paket != null && String(ex.paket).trim() !== ""
      ? String(ex.paket).trim()
      : "—";
  const t0 = row.termin != null ? String(row.termin).trim().slice(0, 10) : "";
  const t1 =
    row.termin_ende != null ? String(row.termin_ende).trim().slice(0, 10) : "";
  const lz =
    t0 && t1
      ? `${formatDeDatumShort(t0)} – ${formatDeDatumShort(t1)}`
      : t0
        ? formatDeDatumShort(t0)
        : "—";
  const kz =
    ex.fahrzeug_kennzeichen != null ? String(ex.fahrzeug_kennzeichen) : "—";
  const fzTyp = ex.fahrzeugtyp != null ? String(ex.fahrzeugtyp) : "—";
  const depot = ex.depot != null ? String(ex.depot) : "—";
  const betr =
    ex.fahrzeug_betreiber != null ? String(ex.fahrzeug_betreiber) : "—";
  const heute = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const zeit = `${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
  const jahr = new Date().getFullYear();
  const safeK = kampId.replace(/[^a-zA-Z0-9]/g, "_");
  const protNr = `ABN-${safeK}-${jahr}`;
  const m1v = esc(st.monteur1);
  const m2v = esc(st.monteur2);
  const mzeit = esc(st.montagezeit);
  const md =
    st.montage_datum && /^\d{4}-\d{2}-\d{2}$/.test(st.montage_datum)
      ? st.montage_datum
      : new Date().toISOString().slice(0, 10);

  const chkRows = FUSA_ABNAHME_CHECKLIST_PUNKTE.map((punkt, i) => {
    const c = st.checklist[i] || { ok: true, mangel: false, bemerkung: "" };
    const okC = c.ok ? " checked" : "";
    const mC = c.mangel ? " checked" : "";
    const bg = i % 2 ? "background:#FAFAFA;" : "";
    return `<tr style="border-bottom:1px solid #F0F0F0;${bg}">
      <td style="padding:9px 12px;color:#333;">${esc(punkt)}</td>
      <td style="padding:9px 12px;text-align:center;"><input type="checkbox" data-fusa-ap-ok="${i}"${okC} style="width:16px;height:16px;accent-color:#0F6E56;cursor:pointer;" /></td>
      <td style="padding:9px 12px;text-align:center;"><input type="checkbox" data-fusa-ap-mangel="${i}"${mC} style="width:16px;height:16px;accent-color:#C62828;cursor:pointer;" /></td>
      <td style="padding:9px 12px;"><input type="text" data-fusa-ap-chk-bem="${i}" value="${esc(c.bemerkung)}" placeholder="—" style="width:100%;border:none;border-bottom:1px solid #ddd;padding:2px 4px;font-size:11px;font-family:inherit;background:transparent;outline:none;" /></td>
    </tr>`;
  }).join("");

  const okSel = st.status === "ok" ? " checked" : "";
  const mSel = st.status === "mangel" ? " checked" : "";
  const nSel = st.status === "nein" ? " checked" : "";

  return `<div data-fusa-auf-abnahme-print-root style="padding:28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;padding-bottom:16px;border-bottom:3px solid #E8A83A;">
        <div>
          <div style="font-size:21px;font-weight:800;color:#1C0F08;letter-spacing:-.5px;">CC Werbung GmbH</div>
          <div style="font-size:12px;color:#666;margin-top:2px;">Verkehrsmittelwerbung · Essen</div>
          <div style="font-size:11px;color:#999;margin-top:1px;">info@cc-werbung.de</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:19px;font-weight:700;color:#E8A83A;">ABNAHMEPROTOKOLL</div>
          <div style="font-size:11px;color:#666;margin-top:3px;">Beklebung / Folierung</div>
          <div style="background:#F0F4F8;border-radius:7px;padding:5px 12px;margin-top:5px;display:inline-block;">
            <div style="font-size:10px;color:#888;">Protokoll-Nr.</div>
            <div style="font-size:13px;font-weight:700;color:#1C0F08;">${esc(protNr)}</div>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
        <div style="background:#FFFBF5;border-radius:10px;padding:13px;border-left:4px solid #E8A83A;">
          <div style="font-size:10px;font-weight:700;color:#E8A83A;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Fahrzeug</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#888;padding:3px 0;width:110px;">Fahrzeugnummer</td><td style="font-weight:700;color:#1C0F08;">${esc(fzLine)}</td></tr>
            <tr><td style="color:#888;padding:3px 0;">Kennzeichen</td><td style="font-weight:600;">${esc(kz)}</td></tr>
            <tr><td style="color:#888;padding:3px 0;">Fahrzeugtyp</td><td>${esc(fzTyp)}</td></tr>
            <tr><td style="color:#888;padding:3px 0;">Depot / Standort</td><td>${esc(depot)}</td></tr>
            <tr><td style="color:#888;padding:3px 0;">Betreiber</td><td>${esc(betr)}</td></tr>
          </table>
        </div>
        <div style="background:#F5F9FF;border-radius:10px;padding:13px;border-left:4px solid #D4500A;">
          <div style="font-size:10px;font-weight:700;color:#D4500A;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Auftrag</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#888;padding:3px 0;width:110px;">Auftrag-Nr.</td><td style="font-weight:700;">${esc(kampId)}</td></tr>
            <tr><td style="color:#888;padding:3px 0;">Kunde</td><td style="font-weight:600;">${esc(kunde)}</td></tr>
            <tr><td style="color:#888;padding:3px 0;">Werbepaket</td><td>${esc(paket)}</td></tr>
            <tr><td style="color:#888;padding:3px 0;">Laufzeit</td><td>${esc(lz)}</td></tr>
            <tr><td style="color:#888;padding:3px 0;">Montagedatum</td>
              <td><input type="date" data-fusa-ap-datum value="${esc(md)}" style="border:1px solid #ddd;border-radius:5px;padding:2px 6px;font-size:12px;font-family:inherit;outline:none;" /></td></tr>
          </table>
        </div>
      </div>
      <div style="background:#F5FFF9;border-radius:10px;padding:13px;margin-bottom:18px;border-left:4px solid #0F6E56;">
        <div style="font-size:10px;font-weight:700;color:#0F6E56;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;">Montageteam</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div>
            <div style="font-size:11px;color:#888;margin-bottom:4px;">Monteur 1 *</div>
            <input data-fusa-ap-monteur1 type="text" value="${m1v}" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;" />
          </div>
          <div>
            <div style="font-size:11px;color:#888;margin-bottom:4px;">Monteur 2</div>
            <input data-fusa-ap-monteur2 type="text" value="${m2v}" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;" />
          </div>
          <div>
            <div style="font-size:11px;color:#888;margin-bottom:4px;">Montagezeit</div>
            <input data-fusa-ap-startzeit type="time" value="${mzeit}" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;" />
          </div>
        </div>
      </div>
      <div style="margin-bottom:18px;">
        <div style="font-size:11px;font-weight:700;color:#1C0F08;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #E8A83A;">Abnahme-Checkliste</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#F0F4F8;">
              <th style="padding:8px 12px;text-align:left;font-weight:600;color:#1C0F08;">Prüfpunkt</th>
              <th style="padding:8px 12px;text-align:center;width:60px;color:#1C0F08;font-weight:600;">OK ✓</th>
              <th style="padding:8px 12px;text-align:center;width:70px;color:#C62828;font-weight:600;">Mangel ✗</th>
              <th style="padding:8px 12px;text-align:left;color:#1C0F08;font-weight:600;">Bemerkung</th>
            </tr>
          </thead>
          <tbody>${chkRows}</tbody>
        </table>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:#1C0F08;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px;">Bemerkungen / Mängel</div>
        <textarea data-fusa-auf-abnahme-bemerkungen placeholder="Alle Mängel, Besonderheiten oder Hinweise…" style="width:100%;min-height:55px;padding:9px;border:1px solid #ddd;border-radius:8px;font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box;outline:none;">${esc(st.bemerkungen)}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:24px;">
        <label style="display:flex;align-items:center;gap:8px;padding:12px;border-radius:9px;cursor:pointer;border:2px solid #C8E6C9;background:#E8F5E9;">
          <input type="radio" name="fusa-ap-ergebnis" value="ok"${okSel} style="width:16px;height:16px;accent-color:#0F6E56;" />
          <div><div style="font-size:13px;font-weight:700;color:#085041;">✓ Abgenommen</div><div style="font-size:10px;color:#0F6E56;">Mängelfrei</div></div>
        </label>
        <label style="display:flex;align-items:center;gap:8px;padding:12px;border-radius:9px;cursor:pointer;border:2px solid #FFCDD2;background:#FEECEC;">
          <input type="radio" name="fusa-ap-ergebnis" value="mangel"${mSel} style="width:16px;height:16px;accent-color:#C62828;" />
          <div><div style="font-size:13px;font-weight:700;color:#7F0000;">⚠ Mit Mängeln</div><div style="font-size:10px;color:#B83030;">Nachbesserung</div></div>
        </label>
        <label style="display:flex;align-items:center;gap:8px;padding:12px;border-radius:9px;cursor:pointer;border:2px solid #FFCCBC;background:#FBE9E7;">
          <input type="radio" name="fusa-ap-ergebnis" value="nein"${nSel} style="width:16px;height:16px;accent-color:#E64A19;" />
          <div><div style="font-size:13px;font-weight:700;color:#BF360C;">✗ Nicht abgen.</div><div style="font-size:10px;color:#E64A19;">Wiederholen</div></div>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px;">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="font-size:10px;font-weight:700;color:#888;letter-spacing:.08em;text-transform:uppercase;">Monteur / CC Werbung</div>
            <button type="button" data-fusa-sig-clear="monteur" style="font-size:10px;border:none;background:none;color:#999;cursor:pointer;padding:0;">✕ Löschen</button>
          </div>
          <div data-fusa-sig-wrap="monteur" style="position:relative;border:2px solid #E8A83A;border-radius:10px;background:#FFFBF5;overflow:hidden;">
            <canvas data-fusa-sig-canvas="monteur" width="280" height="110" style="display:block;width:100%;touch-action:none;cursor:crosshair;"></canvas>
            <div data-fusa-sig-hint="monteur" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;opacity:.4;">
              <div style="font-size:22px;">✍️</div>
              <div style="font-size:11px;color:#854F0B;margin-top:4px;">Hier unterschreiben</div>
            </div>
          </div>
          <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;">
            <div data-fusa-ap-monteur-meta style="font-size:11px;font-weight:600;color:#1C0F08;">—</div>
            <div data-fusa-sig-status="monteur" style="font-size:10px;color:#999;">Nicht unterschrieben</div>
          </div>
        </div>
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="font-size:10px;font-weight:700;color:#888;letter-spacing:.08em;text-transform:uppercase;">Ruhrbahn Werkstattmeister</div>
            <button type="button" data-fusa-sig-clear="werkstatt" style="font-size:10px;border:none;background:none;color:#999;cursor:pointer;padding:0;">✕ Löschen</button>
          </div>
          <div data-fusa-sig-wrap="werkstatt" style="position:relative;border:2px solid #D4500A;border-radius:10px;background:#F5F9FF;overflow:hidden;">
            <canvas data-fusa-sig-canvas="werkstatt" width="280" height="110" style="display:block;width:100%;touch-action:none;cursor:crosshair;"></canvas>
            <div data-fusa-sig-hint="werkstatt" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;opacity:.4;">
              <div style="font-size:22px;">✍️</div>
              <div style="font-size:11px;color:#D4500A;margin-top:4px;">Hier unterschreiben</div>
            </div>
          </div>
          <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div style="flex:1;min-width:0;">
              <div data-fusa-ap-werkstatt-meta style="font-size:11px;color:#666;">Depot ${esc(depot)}</div>
              <input type="text" data-fusa-ap-werkstatt-name value="${esc(st.name_werkstatt)}" placeholder="Name Werkstattmeister" style="margin-top:5px;width:100%;box-sizing:border-box;font-size:11px;border:1px solid #E8E8E8;border-radius:5px;padding:4px 7px;font-family:inherit;outline:none;" />
            </div>
            <div data-fusa-sig-status="werkstatt" style="font-size:10px;color:#999;flex-shrink:0;">Nicht unterschrieben</div>
          </div>
        </div>
      </div>
      <div style="text-align:center;padding-top:12px;border-top:1px solid #E0E0E0;">
        <div style="font-size:10px;color:#bbb;">CC Werbung GmbH · ${esc(kampId)} · ${esc(heute)} ${esc(zeit)}</div>
      </div>
    </div>`;
}

/**
 * @param {HTMLElement} scope
 * @param {FusaAbnahmeProtokollState} [saved]
 * @returns {{ dispose: () => void, clear: (who: string) => void, getDataUrl: (who: string) => string|null, hasStroke: (who: string) => boolean }}
 */
function wireAbnahmeSignaturePads(scope, saved, opts) {
  const readOnly = !!(opts && opts.readOnly);
  const whoList = ["monteur", "werkstatt"];
  /** @type {Record<string, { drawing: boolean, hasData: boolean }>} */
  const sigState = {
    monteur: { drawing: false, hasData: false },
    werkstatt: { drawing: false, hasData: false },
  };
  const disposes = [];

  const applySavedToCanvas = (who, dataUrl) => {
    if (!dataUrl || typeof dataUrl !== "string") return;
    const canvas = scope.querySelector(`canvas[data-fusa-sig-canvas="${who}"]`);
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      sigState[who].hasData = true;
      const hint = scope.querySelector(`[data-fusa-sig-hint="${who}"]`);
      if (hint instanceof HTMLElement) hint.style.display = "none";
      const stEl = scope.querySelector(`[data-fusa-sig-status="${who}"]`);
      if (stEl instanceof HTMLElement) {
        stEl.textContent = "✓ Gespeicherte Unterschrift";
        stEl.style.color = "#0F6E56";
        stEl.style.fontWeight = "600";
      }
      const wrap = scope.querySelector(`[data-fusa-sig-wrap="${who}"]`);
      if (wrap instanceof HTMLElement) wrap.style.borderColor = "#0F6E56";
    };
    img.onerror = () => {};
    img.src = dataUrl;
  };

  if (saved) {
    if (saved.signatur_monteur)
      applySavedToCanvas("monteur", saved.signatur_monteur);
    if (saved.signatur_werkstatt)
      applySavedToCanvas("werkstatt", saved.signatur_werkstatt);
  }

  for (const who of whoList) {
    const canvas = scope.querySelector(`canvas[data-fusa-sig-canvas="${who}"]`);
    if (!(canvas instanceof HTMLCanvasElement)) continue;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.strokeStyle = "#1C0F08";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (readOnly) {
      canvas.style.cursor = "default";
      canvas.style.pointerEvents = "none";
      continue;
    }

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const ev = /** @type {MouseEvent|TouchEvent} */ (e);
      let cx;
      let cy;
      if ("touches" in ev && ev.touches[0]) {
        cx = ev.touches[0].clientX;
        cy = ev.touches[0].clientY;
      } else if ("clientX" in ev) {
        cx = ev.clientX;
        cy = ev.clientY;
      } else {
        return { x: 0, y: 0 };
      }
      return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
    };

    const onDown = (e) => {
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      sigState[who].drawing = true;
      const hint = scope.querySelector(`[data-fusa-sig-hint="${who}"]`);
      if (hint instanceof HTMLElement) hint.style.display = "none";
    };
    const onMove = (e) => {
      e.preventDefault();
      if (!sigState[who].drawing) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      sigState[who].hasData = true;
    };
    const onUp = (e) => {
      sigState[who].drawing = false;
      if (e && typeof e === "object" && "pointerId" in e) {
        try {
          canvas.releasePointerCapture(
            /** @type {PointerEvent} */ (e).pointerId,
          );
        } catch {
          /* ignore */
        }
      }
      if (sigState[who].hasData) {
        const status = scope.querySelector(`[data-fusa-sig-status="${who}"]`);
        if (status instanceof HTMLElement) {
          const time = new Date().toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          });
          status.textContent = `✓ Unterschrieben ${time}`;
          status.style.color = "#0F6E56";
          status.style.fontWeight = "600";
        }
        const wrap = canvas.parentElement;
        if (wrap instanceof HTMLElement) wrap.style.borderColor = "#0F6E56";
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);
    disposes.push(() => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onUp);
    });
  }

  const clear = (who) => {
    const canvas = scope.querySelector(`canvas[data-fusa-sig-canvas="${who}"]`);
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (sigState[who]) {
      sigState[who].hasData = false;
      sigState[who].drawing = false;
    }
    const hint = scope.querySelector(`[data-fusa-sig-hint="${who}"]`);
    if (hint instanceof HTMLElement) hint.style.display = "flex";
    const status = scope.querySelector(`[data-fusa-sig-status="${who}"]`);
    if (status instanceof HTMLElement) {
      status.textContent = "Nicht unterschrieben";
      status.style.color = "#999";
      status.style.fontWeight = "400";
    }
    const wrap = scope.querySelector(`[data-fusa-sig-wrap="${who}"]`);
    if (wrap instanceof HTMLElement) {
      wrap.style.borderColor = who === "monteur" ? "#E8A83A" : "#D4500A";
    }
  };

  const getDataUrl = (who) => {
    const canvas = scope.querySelector(`canvas[data-fusa-sig-canvas="${who}"]`);
    if (!(canvas instanceof HTMLCanvasElement) || !sigState[who]?.hasData)
      return null;
    return canvas.toDataURL("image/png");
  };

  const hasStroke = (who) => !!sigState[who]?.hasData;

  const dispose = () => {
    for (const d of disposes) d();
    disposes.length = 0;
  };

  return { dispose, clear, getDataUrl, hasStroke };
}

/**
 * @param {HTMLElement} abnahmeRoot — `[data-fusa-auf-abnahme-modal]`
 * @param {string} auftragId
 */
function printAbnahmeProtokollFromDom(abnahmeRoot, auftragId) {
  const content = abnahmeRoot.querySelector(
    "[data-fusa-auf-abnahme-print-root]",
  );
  if (!(content instanceof HTMLElement)) return;
  const sigApi = /** @type {any} */ (abnahmeRoot)._fusaSigApi;
  const getUrl = (w) =>
    sigApi && typeof sigApi.getDataUrl === "function"
      ? sigApi.getDataUrl(w)
      : null;
  const sigM = getUrl("monteur");
  const sigW = getUrl("werkstatt");
  if (!sigM && !sigW) {
    if (
      !window.confirm("Noch keine Unterschriften vorhanden. Trotzdem drucken?")
    )
      return;
  }
  const clone = content.cloneNode(true);
  for (const who of ["monteur", "werkstatt"]) {
    const sigData = who === "monteur" ? sigM : sigW;
    const canvas = clone.querySelector(`canvas[data-fusa-sig-canvas="${who}"]`);
    const hint = clone.querySelector(`[data-fusa-sig-hint="${who}"]`);
    if (hint instanceof HTMLElement) hint.remove();
    if (canvas && sigData) {
      const img = document.createElement("img");
      img.src = sigData;
      img.style.cssText =
        "display:block;width:100%;height:110px;object-fit:contain;";
      canvas.replaceWith(img);
    } else if (canvas) {
      const empty = document.createElement("div");
      empty.style.cssText =
        "height:110px;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:12px;";
      empty.textContent = "Keine Unterschrift";
      canvas.replaceWith(empty);
    }
  }
  clone
    .querySelectorAll(
      'input[type="text"],input[type="time"],input[type="date"]',
    )
    .forEach((inp) => {
      if (!(inp instanceof HTMLInputElement) || !inp.parentNode) return;
      const s = document.createElement("span");
      s.textContent = inp.value || "—";
      s.style.fontWeight = "600";
      inp.parentNode.replaceChild(s, inp);
    });
  clone.querySelectorAll("textarea").forEach((ta) => {
    if (!(ta instanceof HTMLTextAreaElement) || !ta.parentNode) return;
    const s = document.createElement("span");
    s.textContent = ta.value || "—";
    ta.parentNode.replaceChild(s, ta);
  });
  clone.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    if (!(cb instanceof HTMLInputElement) || !cb.parentNode) return;
    const s = document.createElement("span");
    s.textContent = cb.checked ? "☑" : "☐";
    s.style.fontSize = "15px";
    cb.parentNode.replaceChild(s, cb);
  });
  clone.querySelectorAll('input[type="radio"]').forEach((rb) => {
    if (!(rb instanceof HTMLInputElement) || !rb.parentNode) return;
    const s = document.createElement("span");
    s.textContent = rb.checked ? "◉" : "○";
    s.style.fontSize = "13px";
    rb.parentNode.replaceChild(s, rb);
  });
  const win = window.open("", "_blank", "width=794,height=1123");
  if (!win) {
    window.alert(
      "Pop-up blockiert — Druckfenster konnte nicht geöffnet werden.",
    );
    return;
  }
  const sc =
    "<scr" + "ipt>setTimeout(function(){window.print();},500);</scr" + "ipt>";
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Abnahmeprotokoll ${esc(
      auftragId,
    )}</title><style>@page{size:A4;margin:10mm}body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}button{display:none!important;}}</style></head><body>${clone.outerHTML}${sc}</body></html>`,
  );
  win.document.close();
}

/**
 * @param {HTMLElement} scope — print mount inner
 * @param {boolean} canBearbeiten
 * @param {{ getDataUrl?: (w: string) => string|null, hasStroke?: (w: string) => boolean }|null|undefined} sigApi
 * @returns {FusaAbnahmeProtokollState|null}
 */
function collectAbnahmeProtokollStateFromDom(scope, canBearbeiten, sigApi) {
  const ta = scope.querySelector("[data-fusa-auf-abnahme-bemerkungen]");
  const bemerkungen = ta instanceof HTMLTextAreaElement ? ta.value : "";
  const radios = scope.querySelectorAll('input[name="fusa-ap-ergebnis"]');
  let status = /** @type {'ok'|'mangel'|'nein'} */ ("ok");
  for (const r of radios) {
    if (
      r instanceof HTMLInputElement &&
      r.checked &&
      (r.value === "ok" || r.value === "mangel" || r.value === "nein")
    ) {
      status = /** @type {'ok'|'mangel'|'nein'} */ (r.value);
      break;
    }
  }
  const m1 = scope.querySelector("[data-fusa-ap-monteur1]");
  const m2 = scope.querySelector("[data-fusa-ap-monteur2]");
  const mt = scope.querySelector("[data-fusa-ap-startzeit]");
  const md = scope.querySelector("[data-fusa-ap-datum]");
  const monteur1 = m1 instanceof HTMLInputElement ? m1.value.trim() : "";
  const monteur2 = m2 instanceof HTMLInputElement ? m2.value.trim() : "";
  const montagezeit = mt instanceof HTMLInputElement ? mt.value.trim() : "";
  const montage_datum =
    md instanceof HTMLInputElement ? md.value.trim().slice(0, 10) : "";
  const checklist = FUSA_ABNAHME_CHECKLIST_PUNKTE.map((_, i) => {
    const okEl = scope.querySelector(`[data-fusa-ap-ok="${i}"]`);
    const mEl = scope.querySelector(`[data-fusa-ap-mangel="${i}"]`);
    const bEl = scope.querySelector(`[data-fusa-ap-chk-bem="${i}"]`);
    return {
      ok: okEl instanceof HTMLInputElement ? okEl.checked : true,
      mangel: mEl instanceof HTMLInputElement ? mEl.checked : false,
      bemerkung: bEl instanceof HTMLInputElement ? bEl.value.trim() : "",
    };
  });
  const api = sigApi && typeof sigApi.getDataUrl === "function" ? sigApi : null;
  const sM = api ? api.getDataUrl("monteur") : null;
  const sW = api ? api.getDataUrl("werkstatt") : null;
  const wnEl = scope.querySelector("[data-fusa-ap-werkstatt-name]");
  const name_werkstatt =
    wnEl instanceof HTMLInputElement ? wnEl.value.trim() : "";
  const nowIso = new Date().toISOString();
  const namesJoined = [monteur1, monteur2].filter(Boolean).join(" & ");
  return {
    montage_datum,
    monteur1,
    monteur2,
    montagezeit,
    checklist,
    bemerkungen,
    status,
    signatur_monteur: sM || "",
    signatur_werkstatt: sW || "",
    signatur_cc: sM || "",
    name_monteur: namesJoined,
    name_cc: monteur1 || namesJoined,
    name_werkstatt,
    datum_cc: "",
    datum_werkstatt: "",
    aktualisiert_iso: canBearbeiten ? nowIso : "",
    quelle: "cockpit_fusa_auftraege",
  };
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function abrechnungsartLabel(v) {
  const s = v != null ? String(v).trim() : "";
  const map = {
    monatlich: "Monatlich",
    quartalsweise: "Quartal",
    jaehrlich: "Jahr",
  };
  return map[s] || s || "—";
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function formatDeDatumShort(v) {
  const s = String(v ?? "").trim();
  const iso = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fmt(v);
  const [y, m, d] = iso.split("-");
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`;
}

/** Wie Alt `toast.js` / `dpSaveDoc` — max. 20 MB. */
const FUSA_AUF_DP_MAX_BYTES = 20 * 1024 * 1024;

/** Alt `DOC_TYPEN` (Keys/Labels/Icons/Farben). */
const FUSA_AUF_DP_TYP_ROWS = [
  {
    key: "vertrag",
    icon: "📋",
    label: "Vertrag",
    color: "#D4500A",
    bg: "#E6F1FB",
  },
  {
    key: "freigabe",
    icon: "✅",
    label: "Freigabe",
    color: "#0F6E56",
    bg: "#E1F5EE",
  },
  {
    key: "layout",
    icon: "🎨",
    label: "Layout/Druckdatei",
    color: "#854F0B",
    bg: "#FAEEDA",
  },
  {
    key: "rechnung",
    icon: "💶",
    label: "Rechnung",
    color: "#5B35B0",
    bg: "#EDE9FE",
  },
  {
    key: "foto",
    icon: "📷",
    label: "Montagefoto",
    color: "#0A5A8A",
    bg: "#E6F1FB",
  },
  {
    key: "sonstiges",
    icon: "📎",
    label: "Sonstiges",
    color: "#546E7A",
    bg: "#ECEFF1",
  },
];

/** @param {string} type */
function fusaAufDpTypLabel(type) {
  const t = String(type || "").trim();
  const hit = FUSA_AUF_DP_TYP_ROWS.find((x) => x.key === t);
  return hit ? hit.label : t || "Sonstiges";
}

/** @param {string} type */
function fusaAufDpTypIcon(type) {
  const t = String(type || "").trim();
  const hit = FUSA_AUF_DP_TYP_ROWS.find((x) => x.key === t);
  return hit ? hit.icon : "📎";
}

/**
 * @param {Record<string, unknown>} o
 * @returns {string}
 */
function formatFusaDocSizeDisplay(o) {
  const raw = o.size;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 1048576
      ? `${(raw / 1048576).toFixed(1)} MB`
      : raw > 1024
        ? `${Math.round(raw / 1024)} KB`
        : `${raw} B`;
  }
  if (raw != null && String(raw).trim() !== "") return String(raw).trim();
  return "—";
}

/**
 * @param {object} row
 * @returns {string}
 */
function parseFirstFahrzeugIdFromAuftragRow(row) {
  const raw = row?.fusa_fahrzeug_ids;
  if (raw == null || raw === "") return "";
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return "";
    try {
      const j = JSON.parse(s);
      if (Array.isArray(j) && j.length) {
        const first = j[0];
        return first != null ? String(first).trim() : "";
      }
    } catch {
      const first = s.split(",")[0].trim();
      return first;
    }
  }
  return "";
}

/**
 * @param {string} auftragId
 * @returns {string}
 */
function fusaAufDetailSafeId(auftragId) {
  return String(auftragId || "").replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Kurzes Feedback im Detail-Body (Alt-Toast-Äquivalent, kein „Funktion folgt“-Platzhalter).
 * @param {HTMLElement} body
 * @param {string} message
 * @param {number} [ms]
 */
function showFusaAufDetailTransient(body, message, ms = 3000) {
  const msg = String(message || "").trim();
  if (!msg) return;
  const prev = body.querySelector("[data-fusa-auf-detail-transient]");
  if (prev instanceof HTMLElement) prev.remove();
  const p = document.createElement("p");
  p.className = "ckp-mock-note";
  p.setAttribute("role", "status");
  p.setAttribute("data-fusa-auf-detail-transient", "");
  p.setAttribute("aria-live", "polite");
  p.textContent = msg;
  const actions = body.querySelector(".fusa-auf-detail-actions");
  if (actions instanceof HTMLElement) body.insertBefore(p, actions);
  else body.insertBefore(p, body.firstChild);
  p.scrollIntoView({ behavior: "smooth", block: "nearest" });
  window.setTimeout(() => {
    p.remove();
  }, ms);
}

/**
 * Alt `dpOpenFahrzeug`: mit Fahrzeug-ID → Modul Fahrzeuge; sonst Hinweis wie Alt-Toast.
 * @param {object|null|undefined} aufRow
 * @param {HTMLElement|null} bodyEl
 * @param {() => void} closeDetail
 */
function openFusaAufDpFahrzeugFromRow(aufRow, bodyEl, closeDetail) {
  if (!aufRow || typeof aufRow !== "object") {
    if (bodyEl) showFusaAufDetailTransient(bodyEl, "Auftrag nicht geladen.");
    return;
  }
  const row = /** @type {Record<string, unknown>} */ (aufRow);
  const fzId = parseFirstFahrzeugIdFromAuftragRow(row);
  const fzKurz =
    row.fahrzeug_kurztext != null && String(row.fahrzeug_kurztext).trim() !== ""
      ? String(row.fahrzeug_kurztext).trim()
      : "";
  const disp = fzKurz || formatFusaFahrzeugIdsShort(row.fusa_fahrzeug_ids);
  const empty = !disp || disp === "—";
  if (!fzId && empty) {
    if (bodyEl)
      showFusaAufDetailTransient(bodyEl, "⚠ Kein Fahrzeug zugeordnet");
    return;
  }
  if (fzId) {
    closeDetail();
    window.setTimeout(() => {
      const main = document.getElementById("cockpit-main");
      if (!(main instanceof HTMLElement)) return;
      const ghost = document.createElement("button");
      ghost.type = "button";
      ghost.setAttribute("data-ccw-open-fusa-view", "fusa_fahrzeuge");
      ghost.style.cssText =
        "position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
      main.appendChild(ghost);
      ghost.click();
      ghost.remove();
    }, 150);
    return;
  }
  if (bodyEl) showFusaAufDetailTransient(bodyEl, `Fahrzeug: ${disp}`);
}

/**
 * Auswahl wie Alt `dpSaveDoc`: letztes Grid-Element mit opacity !== '0.4' gewinnt (Default: sonstiges).
 * @param {HTMLElement} bodyEl
 * @returns {string}
 */
function readFusaAufDpSelectedTypFromGrid(bodyEl) {
  const grid = bodyEl.querySelector("[data-fusa-auf-dp-typgrid]");
  if (!grid) return "sonstiges";
  let typ = "sonstiges";
  for (const el of grid.querySelectorAll("[data-fusa-auf-dp-typ]")) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.style.opacity !== "0.4")
      typ = el.getAttribute("data-typ") || "sonstiges";
  }
  return typ;
}

/**
 * @param {HTMLElement} bodyEl
 * @param {string} typKey
 */
function applyFusaAufDpSelTyp(bodyEl, typKey) {
  const grid = bodyEl.querySelector("[data-fusa-auf-dp-typgrid]");
  if (!grid) return;
  const k = String(typKey || "").trim();
  for (const el of grid.querySelectorAll("[data-fusa-auf-dp-typ]")) {
    if (!(el instanceof HTMLElement)) continue;
    const isSel = el.getAttribute("data-typ") === k;
    el.style.opacity = isSel ? "1" : "0.4";
    el.style.borderWidth = isSel ? "2.5px" : "1.5px";
  }
}

/**
 * @param {HTMLElement} bodyEl
 */
function resetFusaAufDpUploadUi(bodyEl) {
  const tw = bodyEl.querySelector("[data-fusa-auf-dp-typwahl]");
  if (tw instanceof HTMLElement) tw.style.display = "none";
  const inp = bodyEl.querySelector("[data-fusa-auf-dp-file]");
  if (inp instanceof HTMLInputElement) inp.value = "";
  const save = bodyEl.querySelector("[data-fusa-auf-dp-save]");
  if (save instanceof HTMLElement) save.textContent = "Speichern";
  const dz = bodyEl.querySelector("[data-fusa-auf-detail-doczone]");
  if (dz instanceof HTMLElement) {
    dz.style.borderColor = "";
    dz.style.background = "";
  }
}

/**
 * @param {HTMLElement} bodyEl
 * @param {string} fileNameShort
 */
function showFusaAufDpTypwahlAfterFile(bodyEl, fileNameShort) {
  const tw = bodyEl.querySelector("[data-fusa-auf-dp-typwahl]");
  if (tw instanceof HTMLElement) tw.style.display = "block";
  const save = bodyEl.querySelector("[data-fusa-auf-dp-save]");
  const fn = String(fileNameShort || "").trim();
  const short = fn.length > 25 ? `${fn.slice(0, 25)}…` : fn;
  if (save instanceof HTMLElement)
    save.textContent = short ? `💾 Speichern: ${short}` : "Speichern";
  applyFusaAufDpSelTyp(bodyEl, "sonstiges");
}

/**
 * @param {boolean} canBearbeiten
 * @returns {string}
 */
function buildFusaAufDetailDocTypwahlBlockHtml(canBearbeiten) {
  if (!canBearbeiten) return "";
  const cells = FUSA_AUF_DP_TYP_ROWS.map(
    (
      t,
    ) => `<div role="button" tabindex="0" data-fusa-auf-dp-typ data-typ="${esc(t.key)}"
      style="padding:8px;border-radius:8px;border:1.5px solid ${t.bg};background:${t.bg};cursor:pointer;text-align:center;transition:all .12s;">
      <div style="font-size:18px;">${t.icon}</div>
      <div style="font-size:11px;font-weight:600;color:${t.color};margin-top:2px;">${esc(t.label)}</div>
    </div>`,
  ).join("");
  return `<input type="file" data-fusa-auf-dp-file multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx" style="display:none;" />
<div data-fusa-auf-dp-typwahl style="display:none;background:#fff;border:1px solid var(--border,#DDE3E8);border-radius:10px;padding:12px;margin-bottom:12px;">
  <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Dokumenttyp wählen:</div>
  <div data-fusa-auf-dp-typgrid style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">${cells}</div>
  <div style="display:flex;gap:8px;margin-top:10px;">
    <button type="button" class="btn p" data-fusa-auf-dp-save style="flex:1;font-family:inherit;">Speichern</button>
    <button type="button" class="btn" data-fusa-auf-dp-cancel style="font-family:inherit;">Abbrechen</button>
  </div>
</div>`;
}

/**
 * @param {object} row
 * @param {Record<string, string>} projectNameById
 * @param {boolean} [canBearbeiten]
 * @returns {Promise<string>}
 */
async function buildFusaAuftragDetailBodyHtml(
  row,
  projectNameById,
  canBearbeiten = false,
) {
  void projectNameById;
  const kundeRow = {
    ...(row && typeof row === "object" ? row : {}),
    firma_id: row.fusa_kunde_id ?? row.firma_id,
  };
  const apiKunde =
    row.kunde_name != null && String(row.kunde_name).trim() !== ""
      ? String(row.kunde_name).trim()
      : "";
  const kunde = apiKunde || (await resolveAuftragKundenAnzeige(kundeRow));

  const auftragNr = row.id != null ? String(row.id) : "—";
  const fzKurz =
    row.fahrzeug_kurztext != null && String(row.fahrzeug_kurztext).trim() !== ""
      ? String(row.fahrzeug_kurztext).trim()
      : "";
  const fzLine = fzKurz || formatFusaFahrzeugIdsShort(row.fusa_fahrzeug_ids);

  const st = fmt(row.status);
  const uiSt = resolveFusaAuftragUiStatus(row);
  const statusValHtml =
    st === "—"
      ? `<span class="fusa-auf-detail-kv__val fusa-auf-detail-kv__val--muted">—</span>`
      : `<span class="${fusaAuftragBadgeClassesForBucket(uiSt.bucket)}">${esc(st)}</span>`;
  const ex = parseFusaExtraFromRow(row);
  const paketShow =
    ex.paket != null && String(ex.paket).trim() !== ""
      ? String(ex.paket).trim()
      : "—";

  const lzMon =
    ex.laufzeit_monate != null &&
    String(ex.laufzeit_monate).trim() !== "" &&
    Number.isFinite(Number(ex.laufzeit_monate))
      ? Math.floor(Number(ex.laufzeit_monate))
      : NaN;
  const lzStr = Number.isFinite(lzMon) && lzMon >= 1 ? `${lzMon} Mon.` : "—";

  const pmPf = ex.preis_monat_pflicht;
  const summ =
    ex.summen && typeof ex.summen === "object"
      ? /** @type {Record<string, unknown>} */ (ex.summen)
      : null;
  const netSumm =
    summ && summ.netto_monat_gesamt != null
      ? Number(summ.netto_monat_gesamt)
      : NaN;
  const netPf =
    pmPf != null && Number.isFinite(Number(pmPf)) ? Number(pmPf) : NaN;
  const netMonat = Number.isFinite(netSumm) ? netSumm : netPf;
  const preisHtml = Number.isFinite(netMonat)
    ? `<strong class="fusa-auf-detail-price">€ ${netMonat.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/Mon.</strong>`
    : `<span class="fusa-auf-detail-kv__val fusa-auf-detail-kv__val--muted">—</span>`;

  const abrLab = abrechnungsartLabel(ex.abrechnungsart);
  const pill = (text) => {
    if (!text || text === "—")
      return `<span class="fusa-auf-detail-kv__val fusa-auf-detail-kv__val--muted">—</span>`;
    return `<span class="fusa-auf-detail-pill"><span class="fusa-auf-detail-pill__dot" aria-hidden="true"></span>${esc(text)}</span>`;
  };

  const av =
    ex.abrechnung_vorschau && typeof ex.abrechnung_vorschau === "object"
      ? /** @type {Record<string, unknown>} */ (ex.abrechnung_vorschau)
      : {};
  const vsN =
    av.naechste_periode != null ? String(av.naechste_periode).trim() : "";
  const vsF = av.folgeperiode != null ? String(av.folgeperiode).trim() : "";

  const docs = Array.isArray(ex.dokumente_meta)
    ? /** @type {unknown[]} */ (ex.dokumente_meta)
    : [];
  const nDocs = docs.length;
  let docListHtml = "";
  if (nDocs > 0) {
    docListHtml = `<ul class="fusa-auf-detail-doclist">${docs
      .map((d, idx) => {
        if (!d || typeof d !== "object") return "";
        const o = /** @type {Record<string, unknown>} */ (d);
        const n = o.name != null ? String(o.name) : "Datei";
        const typ = o.type != null ? String(o.type) : "sonstiges";
        const datum = o.datum != null ? String(o.datum) : "";
        const szLab = formatFusaDocSizeDisplay(o);
        const metaBits = [fusaAufDpTypLabel(typ), datum, szLab].filter(
          (x) => x && x !== "—",
        );
        const meta = metaBits.join(" · ");
        const del = canBearbeiten
          ? `<button type="button" data-fusa-auf-doc-del="${idx}" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text3,#90A4AE);padding:2px 6px;flex-shrink:0;" title="Löschen" aria-label="Dokument löschen">🗑</button>`
          : "";
        return `<li style="display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid var(--border,#DDE3E8);">
  <span style="font-size:18px;flex-shrink:0;" aria-hidden="true">${fusaAufDpTypIcon(typ)}</span>
  <div style="flex:1;min-width:0;">
    <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(n)}</div>
    <div class="fusa-auf-detail-kv__val--muted" style="font-size:11px;">${esc(meta)}</div>
  </div>${del}</li>`;
      })
      .filter(Boolean)
      .join("")}</ul>`;
  }

  const STRUCTURED_KEYS = new Set([
    "fahrzeugtyp",
    "paket",
    "depot",
    "laufzeit_monate",
    "abrechnungsart",
    "preis_monat_pflicht",
    "ansprechpartner",
    "montage_wunschtermin",
    "montage_wunschzeit",
    "werkstatt_label",
    "werkstatt_email",
    "notiz",
    "partnermodell",
    "dokumente_meta",
    "abrechnung_vorschau",
    "preispositionen",
    "summen",
    "entwurf",
    "beklebung_termin",
    "beklebungstermin_status",
    "montage_bestaetigt_termin",
    "abnahme_protokoll",
  ]);
  const restEx = {};
  for (const k of Object.keys(ex)) {
    if (!STRUCTURED_KEYS.has(k)) restEx[k] = ex[k];
  }
  const restKeys = Object.keys(restEx);
  const kv = (lab, valHtml) =>
    `<div class="fusa-auf-detail-kv"><span class="fusa-auf-detail-kv__lab">${esc(lab)}</span><span class="fusa-auf-detail-kv__val">${valHtml}</span></div>`;

  const restSection =
    restKeys.length === 0
      ? ""
      : `<section class="fusa-auf-detail-sec fusa-auf-detail-sec--rest">
  <h3 class="fusa-auf-detail-sec__title">Weitere Daten</h3>
  ${restKeys.map((k) => kv(k, esc(fmt(restEx[k])))).join("")}
</section>`;

  const bearb = canBearbeiten
    ? `<p class="fusa-auf-detail-bearb"><button type="button" class="fusa-auf-detail-bearb__btn" data-fusa-auf-detail-edit>Auftrag bearbeiten</button></p>`
    : "";

  return `<div class="fusa-auf-detail-body">
  ${bearb}
  <section class="fusa-auf-detail-sec">
    <h3 class="fusa-auf-detail-sec__title">Auftrag</h3>
    ${kv("Auftrag-Nr.", esc(auftragNr))}
    ${kv("Kunde", esc(kunde))}
    ${kv("Werbepaket", esc(paketShow))}
    ${kv("Fahrzeug", esc(fzLine))}
  </section>
  <section class="fusa-auf-detail-sec">
    <h3 class="fusa-auf-detail-sec__title">Laufzeit &amp; Abrechnung</h3>
    ${kv("Start", esc(formatDeDatumShort(row.termin)))}
    ${kv("Ende", esc(formatDeDatumShort(row.termin_ende)))}
    ${kv("Laufzeit", esc(lzStr))}
    ${kv("Abrechnung", pill(abrLab))}
    ${kv("Preis / Monat", preisHtml)}
  </section>
  <section class="fusa-auf-detail-sec">
    <h3 class="fusa-auf-detail-sec__title">Nächste Quartale</h3>
    <div class="fusa-auf-detail-qgrid">
      <div class="fusa-auf-detail-qcard fusa-auf-detail-qcard--next">
        <div class="fusa-auf-detail-qcard__k">Nächste Periode</div>
        <div class="fusa-auf-detail-qcard__v">${vsN ? esc(vsN) : "—"}</div>
      </div>
      <div class="fusa-auf-detail-qcard fusa-auf-detail-qcard--folge">
        <div class="fusa-auf-detail-qcard__k">Folgeperiode</div>
        <div class="fusa-auf-detail-qcard__v">${vsF ? esc(vsF) : "—"}</div>
      </div>
    </div>
  </section>
  <section class="fusa-auf-detail-sec">
    <h3 class="fusa-auf-detail-sec__title">Status</h3>
    ${kv("Auftragsstatus", statusValHtml)}
  </section>
  <section class="fusa-auf-detail-sec fusa-auf-detail-sec--docs">
    <h3 class="fusa-auf-detail-sec__title">Dokumente (${nDocs})</h3>
    <div class="fusa-auf-detail-doczone" data-fusa-auf-detail-doczone tabindex="0" role="region" aria-label="Datei-Upload" ${canBearbeiten ? "" : ' data-fusa-auf-detail-doczone-ro="1" style="opacity:.72;pointer-events:none;"'}>
      <div class="fusa-auf-detail-doczone__icon" aria-hidden="true">📎</div>
      <div class="fusa-auf-detail-doczone__t1">Datei hochladen</div>
      <div class="fusa-auf-detail-doczone__t2">Klicken oder Datei hierher ziehen</div>
      <div class="fusa-auf-detail-doczone__t3">PDF, Word, JPG, PNG — max. 20 MB</div>
    </div>
    ${buildFusaAufDetailDocTypwahlBlockHtml(canBearbeiten)}
    ${docListHtml}
    ${nDocs ? "" : '<p class="fusa-auf-detail-docempty">Noch keine Dokumente hochgeladen</p>'}
    <div class="fusa-auf-detail-actions">
      <div class="fusa-auf-detail-actions__row">
        <button type="button" class="fusa-auf-detail-actbtn" data-fusa-auf-detail-action="upload" title="Dokument hochladen"><span class="fusa-auf-detail-actbtn__ic" aria-hidden="true">📄</span> Dokument hochladen</button>
        <button type="button" class="fusa-auf-detail-actbtn" data-fusa-auf-detail-action="fahrzeug" title="Fahrzeugakte"><span class="fusa-auf-detail-actbtn__ic" aria-hidden="true">🚌</span> Fahrzeug</button>
        <button type="button" class="fusa-auf-detail-actbtn fusa-auf-detail-actbtn--warm" data-fusa-auf-detail-action="abnahme" title="Abnahmeprotokoll"><span class="fusa-auf-detail-actbtn__ic" aria-hidden="true">📋</span> Abnahmeprotokoll</button>
        <button type="button" class="fusa-auf-detail-actbtn fusa-auf-detail-actbtn--warm" data-fusa-auf-detail-action="freigeben" title="In CC Intern freigeben"><span class="fusa-auf-detail-actbtn__ic" aria-hidden="true">🚀</span> Freigeben</button>
      </div>
      <button type="button" class="fusa-auf-detail-rechnung" data-fusa-auf-detail-action="rechnung" title="Rechnung">Rechnung →</button>
    </div>
  </section>
  ${restSection}
</div>`;
}

/**
 * @returns {Promise<string>}
 */
export async function renderFusaAuftraegeViewHtml() {
  let auftragLoadErr = "";
  let projLoadErr = "";
  /** @type {{ id: string, name?: string|null }[]} */
  let projects = [];
  /** @type {object[]} */
  let auftraegeAll = [];

  let rightsBundle = null;
  try {
    rightsBundle = await loadMyRights();
  } catch {
    rightsBundle = null;
  }
  const canSee = myRight(rightsBundle, "fusa", "auftraege", "sehen");
  const canCreate = myRight(rightsBundle, "fusa", "auftraege", "erstellen");
  const canBearbeiten = myRight(
    rightsBundle,
    "fusa",
    "auftraege",
    "bearbeiten",
  );

  if (!canSee) {
    return `<div data-ccw-ro="fusa-auftraege">
  <section class="ckp-snapshot-ro-section">
    <p class="ckp-mock-note" role="status">Kein Recht zur Ansicht der Aufträge.</p>
  </section>
</div>`;
  }

  try {
    auftraegeAll = await fetchFusaApiAuftraege();
  } catch (e) {
    auftragLoadErr = formatApiErrorForUi(e);
    auftraegeAll = [];
  }

  try {
    const pr = await apiFetch(API_ROUTES.cockpit.projects);
    projects = Array.isArray(pr.projects)
      ? pr.projects.filter((p) => p && p.id != null)
      : [];
  } catch (e) {
    projLoadErr = formatApiErrorForUi(e);
  }

  await ensureFusaProjectSelection(projects);
  let ctx = getFusaAppProject();
  let pid = ctx && ctx.id ? String(ctx.id) : "";

  let filtered = pid
    ? auftraegeAll.filter((a) => a && String(a.project_id || "") === pid)
    : auftraegeAll;
  if (!filtered.length && auftraegeAll.length > 0 && projects.length > 0) {
    const idsFromApi = [
      ...new Set(
        auftraegeAll
          .map((a) =>
            a && a.project_id != null ? String(a.project_id).trim() : "",
          )
          .filter(Boolean),
      ),
    ];
    const fallbackPid = idsFromApi.find((pjid) =>
      projects.some((p) => String(p.id) === pjid),
    );
    if (fallbackPid && fallbackPid !== pid) {
      await loadFusaProjectContext(fallbackPid);
      ctx = getFusaAppProject();
      pid = ctx && ctx.id ? String(ctx.id) : "";
      filtered = pid
        ? auftraegeAll.filter((a) => a && String(a.project_id || "") === pid)
        : auftraegeAll;
    }
  }

  const nameById = Object.fromEntries(
    projects.map((p) => [
      String(p.id),
      p.name != null ? String(p.name) : String(p.id),
    ]),
  );
  const namesEncoded = encodeURIComponent(JSON.stringify(nameById));

  const umzKpi = computeFusaUmzugAuftragKpis(filtered);
  const kpiRow = `<div class="stats" style="grid-template-columns:repeat(4,1fr)">
  <div class="sc"><div class="sc-ico" style="background:var(--blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div><div class="sc-n" style="color:var(--blue)">${esc(String(umzKpi.aktiv))}</div><div class="sc-l">Aktiv</div></div></div>
  <div class="sc"><div class="sc-ico" style="background:var(--purple-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div><div class="sc-n" style="color:var(--purple)">${esc(String(umzKpi.produktion))}</div><div class="sc-l">In Produktion</div></div></div>
  <div class="sc"><div class="sc-ico" style="background:var(--amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div><div class="sc-n" style="color:var(--amber)">${esc(String(umzKpi.endet))}</div><div class="sc-l">Enden bald</div></div></div>
  <div class="sc"><div class="sc-ico" style="background:var(--green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div><div class="sc-n" style="color:var(--green)">${esc(String(umzKpi.abgeschlossen))}</div><div class="sc-l">Abgeschlossen</div></div></div>
</div>`;

  const searchField = auftragLoadErr
    ? ""
    : `<input id="fusa-auf-suche" type="search" class="srch" data-fusa-auf-suche placeholder="Auftrag, Kunde, Fahrzeug …" autocomplete="off" />`;

  const tabRow = auftragLoadErr
    ? ""
    : `<div class="tabs" role="tablist" aria-label="Aufträge filtern">
    <button type="button" class="tab active" data-fusa-umz-tab="" aria-selected="true">Alle</button>
    <button type="button" class="tab" data-fusa-umz-tab="aktiv" aria-selected="false">Aktiv</button>
    <button type="button" class="tab" data-fusa-umz-tab="in_produktion" aria-selected="false">In Produktion</button>
    <button type="button" class="tab" data-fusa-umz-tab="endet_bald" aria-selected="false">Endet bald</button>
    <button type="button" class="tab" data-fusa-umz-tab="abgeschlossen" aria-selected="false">Abgeschlossen</button>
  </div>`;

  const neuBtn = canCreate
    ? `<button type="button" class="btn p fusa-auf-neu-btn" data-fusa-auf-neu-open>Neuer Auftrag</button>`
    : "";

  const listBlock = auftragLoadErr
    ? `<p class="ckp-mock-note" role="status">Liste wegen Fehler nicht geladen.</p>`
    : `<div class="panel">
  <div class="ph">
    <div class="ph-title">Alle Aufträge</div>
    <div class="ph-right">${tabRow}</div>
  </div>
  <div class="ph-tools">${searchField}${neuBtn}</div>
  ${await renderFusaApiAuftraegeUmzugTableInnerHtml(filtered, nameById)}
</div>`;

  const formInner =
    canCreate || canBearbeiten
      ? `<div data-fusa-auf-wizard-mount style="flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;"></div>`
      : `<p class="ckp-mock-note" role="status">Kein Recht zum Anlegen oder Bearbeiten — <code>fusa.auftraege.erstellen</code> / <code>fusa.auftraege.bearbeiten</code>.</p>`;

  const neuDrawer = `<div class="fusa-umz-neu-modal" data-fusa-auf-neu-modal aria-hidden="true">
  <div class="fusa-umz-neu-dialog" data-fusa-auf-neu-dialog>
    <header class="fusa-auf-neu-head" style="flex-shrink:0;background:linear-gradient(135deg,#ea580c 0%,#c2410c 100%);padding:14px 18px 16px;display:flex;align-items:flex-start;gap:14px;">
      <div style="flex:1;min-width:0;">
        <h3 class="fusa-auf-neu-head__title" style="margin:0;color:#fff;font-size:18px;font-weight:800;letter-spacing:.02em;line-height:1.2;" data-fusa-auf-neu-title>Neuer Auftrag anlegen</h3>
        <p style="margin:6px 0 0;font-size:12px;font-weight:600;color:rgba(255,255,255,.92);line-height:1.35;">Mehrere Fahrzeuge · gleiche Laufzeit · individuelle Pakete</p>
      </div>
      <button type="button" class="fusa-auf-neu-x" data-fusa-auf-neu-close aria-label="Schließen" style="flex-shrink:0;width:40px;height:40px;margin:-4px -6px 0 0;border:none;border-radius:10px;background:rgba(255,255,255,.15);color:#fff;font-size:22px;line-height:1;cursor:pointer;font-weight:300;">×</button>
    </header>
    <div class="fusa-auf-neu-body" style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">${formInner}</div>
  </div>
</div>`;

  const detailModal = `<div class="overlay" data-fusa-auf-detail-modal data-fusa-detail-auftrag-id="" aria-hidden="true">
  <div class="dpanel" data-fusa-auf-detail-panel>
    <div class="dp-hdr">
      <div class="dp-t" data-fusa-auf-detail-title>Auftrag</div>
      <button type="button" class="dp-close" data-fusa-auf-detail-close aria-label="Schließen">×</button>
    </div>
    <div class="dp-body" data-fusa-auf-detail-body></div>
    <div class="dp-footer" aria-hidden="true"></div>
  </div>
</div>`;

  const abnahmeModal = `<div class="overlay fusa-auf-abnahme-overlay" data-fusa-auf-abnahme-modal data-fusa-abnahme-auftrag-id="" aria-hidden="true">
  <div class="dpanel" data-fusa-auf-abnahme-panel>
    <div class="dp-hdr" style="flex-wrap:wrap;gap:10px;align-items:flex-start;">
      <div style="flex:1;min-width:0;">
        <div class="dp-t">Abnahmeprotokoll</div>
        <div data-fusa-auf-abnahme-subtitle style="font-size:11px;color:var(--text2,#546E7A);margin-top:3px;line-height:1.35;">—</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
        <button type="button" class="btn p" data-fusa-auf-abnahme-print style="white-space:nowrap;">Drucken / PDF</button>
        <button type="button" class="dp-close" data-fusa-auf-abnahme-close aria-label="Schließen">×</button>
      </div>
    </div>
    <div class="dp-body" style="flex:1;min-height:0;display:flex;flex-direction:column;padding:0;">
      <div data-fusa-auf-abnahme-print-mount style="flex:1;min-height:0;overflow-y:auto;"></div>
      <p class="fusa-auf-detail-kv__val--muted" data-fusa-auf-abnahme-hint style="margin:0;padding:10px 20px;font-size:11px;line-height:1.4;border-top:1px solid var(--border,#DDE3E8);flex-shrink:0;"></p>
    </div>
    <div class="dp-footer" style="padding:12px 16px;border-top:1px solid var(--border,#DDE3E8);display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;flex-shrink:0;">
      <button type="button" class="btn" data-fusa-auf-abnahme-close>Schließen</button>
      <button type="button" class="btn" data-fusa-auf-abnahme-save style="background:#E8F5E9;border-color:#2E7D32;color:#1B5E20;">Beim Auftrag speichern</button>
      <button type="button" class="btn p" data-fusa-auf-abnahme-print>Drucken / PDF</button>
    </div>
  </div>
</div>`;

  return `${FUSA_UMZUG_AUF_SCOPE_CSS}
<div data-ccw-ro="fusa-auftraege" class="fusa-umz-auf-scope" data-fusa-proj-names="${namesEncoded}" data-fusa-can-bearbeiten="${canBearbeiten ? "1" : "0"}" data-fusa-umz-active-tab="">
  ${auftragLoadErr ? `<p class="ckp-api-error" role="alert">${esc(auftragLoadErr)}</p>` : ""}
  ${projLoadErr ? `<p class="ckp-api-error" role="alert">${esc(projLoadErr)}</p>` : ""}
  ${auftragLoadErr ? "" : kpiRow}
  ${listBlock}
  ${neuDrawer}
  ${detailModal}
  ${abnahmeModal}
</div>`;
}

/**
 * @param {HTMLElement} root
 */
function applyFusaAuftragRowFilters(root) {
  const qel = root.querySelector("[data-fusa-auf-suche]");
  const q =
    qel instanceof HTMLInputElement ? qel.value.trim().toLowerCase() : "";
  const tab = root.getAttribute("data-fusa-umz-active-tab") || "";
  for (const tr of root.querySelectorAll("tbody tr[data-fusa-auf-payload]")) {
    if (!(tr instanceof HTMLElement)) continue;
    let hay = "";
    try {
      hay = decodeURIComponent(
        tr.getAttribute("data-fusa-auf-search-hay") || "",
      );
    } catch {
      hay = "";
    }
    const umz = tr.getAttribute("data-fusa-umz-tab") || "none";
    const okSearch = !q || hay.includes(q);
    const okTab = !tab || umz === tab;
    tr.style.display = okSearch && okTab ? "" : "none";
  }
}

/**
 * @param {HTMLElement} root
 * @param {string} tabValue `''` = Alle, sonst aktiv|in_produktion|endet_bald|abgeschlossen
 */
function setUmzTabFilter(root, tabValue) {
  root.setAttribute("data-fusa-umz-active-tab", tabValue);
  for (const b of root.querySelectorAll("[data-fusa-umz-tab]")) {
    if (!(b instanceof HTMLButtonElement)) continue;
    const v = b.getAttribute("data-fusa-umz-tab") ?? "";
    const active = v === tabValue;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  }
  applyFusaAuftragRowFilters(root);
}

/**
 * Klickziel zu einem Element auflösen (Klicks auf Button-Text treffen oft einen Textknoten).
 * @param {EventTarget|null} n
 * @returns {Element|null}
 */
function clickTargetElement(n) {
  if (n instanceof Element) return n;
  if (n instanceof Text && n.parentElement) return n.parentElement;
  return null;
}

/**
 * Klickziel inkl. Shadow-DOM (`composedPath`), falls target kein Element ist.
 * @param {MouseEvent|PointerEvent|Event} ev
 * @returns {Element|null}
 */
function composedClickTargetFromEvent(ev) {
  const el = clickTargetElement(ev.target);
  if (el instanceof Element) return el;
  if (ev && typeof ev.composedPath === "function") {
    for (const x of ev.composedPath()) {
      if (x instanceof Element) return x;
    }
  }
  return null;
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachFusaAuftraegeViewHandlers(mount, onReload) {
  if (typeof document === "undefined" || !mount) return;
  /**
   * Cockpit-Shell setzt `data-ccw-ro="fusa-auftraege"` auch auf `.ccds-shell-root`.
   * `querySelector('[data-ccw-ro="fusa-auftraege"]')` trifft sonst zuerst die Shell — nicht die
   * innere `.fusa-umz-auf-scope` (Modal, Tabellen, `data-fusa-proj-names`). Handler müssen am
   * inneren Modul-Root hängen, sonst fehlen Delegation / Kontext (Detail-Buttons wirken „tot“).
   */
  const root =
    mount instanceof Element
      ? mount.querySelector(
          '.fusa-umz-auf-scope[data-ccw-ro="fusa-auftraege"]',
        ) ||
        mount.querySelector(".fusa-umz-auf-scope") ||
        mount.querySelector('[data-ccw-ro="fusa-auftraege"]')
      : null;
  if (!(root instanceof HTMLElement)) return;

  const reloadAfterCreate = async () => {
    const neuM = root.querySelector("[data-fusa-auf-neu-modal]");
    if (neuM instanceof HTMLElement) {
      neuM.classList.remove("open");
      neuM.setAttribute("aria-hidden", "true");
    }
    if (typeof onReload === "function") await onReload();
  };

  const modal = root.querySelector("[data-fusa-auf-detail-modal]");
  const bodyEl = root.querySelector("[data-fusa-auf-detail-body]");
  const neuModal = root.querySelector("[data-fusa-auf-neu-modal]");
  const neuDialog = root.querySelector("[data-fusa-auf-neu-dialog]");
  const abnahmeModal = root.querySelector("[data-fusa-auf-abnahme-modal]");

  const namesRaw = root.getAttribute("data-fusa-proj-names");
  /** @type {Record<string, string>} */
  let nameById = {};
  try {
    if (namesRaw) nameById = JSON.parse(decodeURIComponent(namesRaw));
  } catch {
    nameById = {};
  }

  function closeDetail() {
    if (!(modal instanceof HTMLElement)) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    const headTit = root.querySelector("[data-fusa-auf-detail-title]");
    if (headTit) headTit.textContent = "Auftrag";
  }

  function getWizardProjectId() {
    const ctx = getFusaAppProject();
    if (ctx && ctx.id && String(ctx.id).trim()) return String(ctx.id).trim();
    return "";
  }

  async function openNeu() {
    if (!(neuModal instanceof HTMLElement)) return;
    const tit = root.querySelector("[data-fusa-auf-neu-title]");
    if (tit) tit.textContent = "Neuer Auftrag anlegen";
    neuModal.classList.add("open");
    neuModal.setAttribute("aria-hidden", "false");
    const wMount = root.querySelector("[data-fusa-auf-wizard-mount]");
    if (!(wMount instanceof HTMLElement)) return;
    wMount.innerHTML = buildFusaAuftragWizardShellHtml();
    const wRoot = wMount.querySelector("[data-fusa-wiz-root]");
    if (wRoot instanceof HTMLElement) {
      const preFz =
        CCState.get("fusaAuftragNeuFahrzeugId") != null &&
        String(CCState.get("fusaAuftragNeuFahrzeugId")).trim()
          ? String(CCState.get("fusaAuftragNeuFahrzeugId")).trim()
          : "";
      const preNotiz =
        CCState.get("fusaAuftragNeuInternNotiz") != null &&
        String(CCState.get("fusaAuftragNeuInternNotiz")).trim()
          ? String(CCState.get("fusaAuftragNeuInternNotiz")).trim()
          : "";
      void bootFusaAuftragWizard(wRoot, {
        mode: "create",
        getProjectId: getWizardProjectId,
        getProjectLabel: () => {
          const pid = getWizardProjectId();
          return (pid && nameById[pid] ? String(nameById[pid]) : pid) || "";
        },
        onClose: closeNeu,
        onSaved: reloadAfterCreate,
        prefillFahrzeugId: preFz || undefined,
        prefillInternNotiz: preNotiz || undefined,
      });
      CCState.set("fusaAuftragNeuFahrzeugId", null);
      CCState.set("fusaAuftragNeuInternNotiz", null);
    }
  }

  /**
   * @param {string} auftragId
   */
  async function openWizardForEdit(auftragId) {
    const id = auftragId != null ? String(auftragId).trim() : "";
    if (!id || !(neuModal instanceof HTMLElement)) return;
    try {
      const d = await apiFetch(
        `${API_ROUTES.fusa.auftraege}/${encodeURIComponent(id)}`,
      );
      const row =
        d && typeof d === "object" && /** @type {any} */ (d).auftrag
          ? /** @type {any} */ (d).auftrag
          : null;
      const pid =
        row && row.project_id != null ? String(row.project_id).trim() : "";
      if (!row || !pid) throw new Error("Auftrag nicht gefunden.");
      await loadFusaProjectContext(pid);
    } catch (e) {
      window.alert(formatApiErrorForUi(e));
      return;
    }
    closeDetail();
    const tit = root.querySelector("[data-fusa-auf-neu-title]");
    if (tit) tit.textContent = "Auftrag bearbeiten";
    neuModal.classList.add("open");
    neuModal.setAttribute("aria-hidden", "false");
    const wMount = root.querySelector("[data-fusa-auf-wizard-mount]");
    if (!(wMount instanceof HTMLElement)) return;
    wMount.innerHTML = buildFusaAuftragWizardShellHtml();
    const wRoot = wMount.querySelector("[data-fusa-wiz-root]");
    if (wRoot instanceof HTMLElement) {
      void bootFusaAuftragWizard(wRoot, {
        mode: "edit",
        editAuftragId: id,
        getProjectId: getWizardProjectId,
        getProjectLabel: () => {
          const pid = getWizardProjectId();
          return (pid && nameById[pid] ? String(nameById[pid]) : pid) || "";
        },
        onClose: closeNeu,
        onSaved: reloadAfterCreate,
      });
    }
  }

  function closeNeu() {
    if (!(neuModal instanceof HTMLElement)) return;
    neuModal.classList.remove("open");
    neuModal.setAttribute("aria-hidden", "true");
  }

  const canBearbeitenFromDom =
    root.getAttribute("data-fusa-can-bearbeiten") === "1";

  /** Ausstehende Datei vor „Speichern“ (wie Alt `dpPendingFile`). */
  let dpPendingFile = /** @type {File|null} */ (null);

  /** Zuletzt geladener Abnahme-Zustand (Server) — für Signatur-Merge wenn Canvas noch leer. */
  /** @type {FusaAbnahmeProtokollState|null} */
  let abnahmeBaseline = null;
  let abnahmeSigCleared = { monteur: false, werkstatt: false };

  function closeAbnahmeProtokoll() {
    if (!(abnahmeModal instanceof HTMLElement)) return;
    const prev = /** @type {any} */ (abnahmeModal)._fusaSigApi;
    if (prev && typeof prev.dispose === "function") prev.dispose();
    /** @type {any} */ (abnahmeModal)._fusaSigApi = null;
    abnahmeBaseline = null;
    abnahmeSigCleared = { monteur: false, werkstatt: false };
    const mount = abnahmeModal.querySelector(
      "[data-fusa-auf-abnahme-print-mount]",
    );
    if (mount instanceof HTMLElement) mount.innerHTML = "";
    abnahmeModal.classList.remove("open");
    abnahmeModal.setAttribute("aria-hidden", "true");
  }

  function formatDeFromIsoShort(iso) {
    const s = String(iso || "").trim();
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  /**
   * @param {string} auftragId
   */
  async function openAbnahmeProtokollFromDetail(auftragId) {
    const aid = auftragId != null ? String(auftragId).trim() : "";
    if (!aid || !(abnahmeModal instanceof HTMLElement)) return;
    const prevApi = /** @type {any} */ (abnahmeModal)._fusaSigApi;
    if (prevApi && typeof prevApi.dispose === "function") prevApi.dispose();
    /** @type {any} */ (abnahmeModal)._fusaSigApi = null;
    abnahmeBaseline = null;
    abnahmeSigCleared = { monteur: false, werkstatt: false };

    abnahmeModal.setAttribute("data-fusa-abnahme-auftrag-id", aid);
    const mount = abnahmeModal.querySelector(
      "[data-fusa-auf-abnahme-print-mount]",
    );
    const hint = abnahmeModal.querySelector("[data-fusa-auf-abnahme-hint]");
    const saveBtn = abnahmeModal.querySelector("[data-fusa-auf-abnahme-save]");
    const sub = abnahmeModal.querySelector("[data-fusa-auf-abnahme-subtitle]");
    if (mount instanceof HTMLElement)
      mount.innerHTML =
        '<p class="ckp-mock-note" style="padding:16px 20px;">Lade Abnahmeprotokoll…</p>';
    if (saveBtn instanceof HTMLButtonElement) {
      saveBtn.style.display = canBearbeitenFromDom ? "" : "none";
      saveBtn.disabled = false;
    }
    if (hint instanceof HTMLElement) {
      hint.textContent = canBearbeitenFromDom
        ? "Änderungen mit „Beim Auftrag speichern“ übernehmen."
        : "Nur Ansicht — kein Recht zum Bearbeiten (`fusa.auftraege.bearbeiten`).";
    }
    try {
      const d = await apiFetch(
        `${API_ROUTES.fusa.auftraege}/${encodeURIComponent(aid)}`,
      );
      const auf =
        d && typeof d === "object" && /** @type {any} */ (d).auftrag != null
          ? /** @type {any} */ (d).auftrag
          : null;
      if (!auf || typeof auf !== "object")
        throw new Error("Auftrag nicht gefunden.");
      const ex = parseFusaExtraFromRow(auf);
      const st = normalizeAbnahmeProtokollFromExtra(ex);
      abnahmeBaseline = { ...st };
      if (mount instanceof HTMLElement) {
        mount.innerHTML = buildAbnahmeProtokollMountHtml(auf, st);
        if (!canBearbeitenFromDom) {
          for (const el of mount.querySelectorAll(
            "input, textarea, button[data-fusa-sig-clear]",
          )) {
            if (el instanceof HTMLTextAreaElement) el.readOnly = true;
            else if (el instanceof HTMLInputElement) {
              if (el.type === "checkbox" || el.type === "radio")
                el.disabled = true;
              else el.readOnly = true;
            } else if (el instanceof HTMLButtonElement) el.disabled = true;
          }
        }
        const sig = wireAbnahmeSignaturePads(mount, st, {
          readOnly: !canBearbeitenFromDom,
        });
        if (!canBearbeitenFromDom) {
          for (const b of mount.querySelectorAll("[data-fusa-sig-clear]")) {
            if (b instanceof HTMLElement) b.style.display = "none";
          }
        }
        /** @type {any} */ (abnahmeModal)._fusaSigApi = sig;
        fusaAbnahmeUpdateMonteurMetaLine(mount);
      }
      const rowR = /** @type {Record<string, unknown>} */ (auf);
      const kunde =
        rowR.kunde_name != null && String(rowR.kunde_name).trim() !== ""
          ? String(rowR.kunde_name).trim()
          : "—";
      const fzKurz =
        rowR.fahrzeug_kurztext != null &&
        String(rowR.fahrzeug_kurztext).trim() !== ""
          ? String(rowR.fahrzeug_kurztext).trim()
          : "";
      const fzLine =
        fzKurz || formatFusaFahrzeugIdsShort(rowR.fusa_fahrzeug_ids);
      if (sub instanceof HTMLElement) {
        sub.textContent = `${aid} · ${kunde} · ${fzLine || "—"}`;
      }
      if (hint instanceof HTMLElement) {
        const ts = formatDeFromIsoShort(st.aktualisiert_iso);
        const base = canBearbeitenFromDom
          ? "Änderungen mit „Beim Auftrag speichern“ übernehmen."
          : "Nur Ansicht — kein Recht zum Bearbeiten (`fusa.auftraege.bearbeiten`).";
        hint.textContent = ts ? `${base} Zuletzt: ${ts}` : base;
      }
    } catch (e) {
      window.alert(formatApiErrorForUi(e));
      abnahmeBaseline = null;
      if (mount instanceof HTMLElement) mount.innerHTML = "";
      return;
    }
    abnahmeModal.classList.add("open");
    abnahmeModal.setAttribute("aria-hidden", "false");
    try {
      window.dispatchEvent(
        new CustomEvent("fusa:auftrag:abnahme", {
          detail: { auftragId: aid, phase: "open" },
          bubbles: true,
        }),
      );
    } catch {
      /* ignore */
    }
  }

  async function saveAbnahmeProtokoll() {
    const aid =
      abnahmeModal instanceof HTMLElement
        ? abnahmeModal.getAttribute("data-fusa-abnahme-auftrag-id") || ""
        : "";
    const mount =
      abnahmeModal instanceof HTMLElement
        ? abnahmeModal.querySelector("[data-fusa-auf-abnahme-print-mount]")
        : null;
    const sigApi = /** @type {any} */ (
      abnahmeModal instanceof HTMLElement ? abnahmeModal._fusaSigApi : null
    );
    if (!aid || !(mount instanceof HTMLElement)) return;
    if (!canBearbeitenFromDom) return;
    const collected = collectAbnahmeProtokollStateFromDom(mount, true, sigApi);
    if (!collected) return;
    const sM =
      (sigApi && typeof sigApi.getDataUrl === "function"
        ? sigApi.getDataUrl("monteur")
        : null) ||
      (abnahmeSigCleared.monteur
        ? ""
        : abnahmeBaseline?.signatur_monteur || "");
    const sW =
      (sigApi && typeof sigApi.getDataUrl === "function"
        ? sigApi.getDataUrl("werkstatt")
        : null) ||
      (abnahmeSigCleared.werkstatt
        ? ""
        : abnahmeBaseline?.signatur_werkstatt || "");
    const nowIso = new Date().toISOString();
    const payload = {
      ...collected,
      text: collected.bemerkungen,
      signatur_monteur: sM || "",
      signatur_werkstatt: sW || "",
      signatur_cc: sM || "",
      datum_cc: sM ? nowIso : "",
      datum_werkstatt: sW ? nowIso : "",
      aktualisiert_iso: nowIso,
      quelle: "cockpit_fusa_auftraege",
    };
    try {
      await apiFetch(
        `${API_ROUTES.fusa.auftraege}/${encodeURIComponent(aid)}`,
        {
          method: "PATCH",
          body: {
            fusa_extra_json: {
              [FUSA_EXTRA_ABNAHME_PROTOKOLL_KEY]: payload,
            },
          },
        },
      );
      if (bodyEl instanceof HTMLElement) {
        showFusaAufDetailTransient(bodyEl, "Abnahmeprotokoll gespeichert.");
      }
      try {
        window.dispatchEvent(
          new CustomEvent("fusa:auftrag:abnahme", {
            detail: { auftragId: aid, phase: "saved" },
            bubbles: true,
          }),
        );
      } catch {
        /* ignore */
      }
      closeAbnahmeProtokoll();
    } catch (e) {
      window.alert(formatApiErrorForUi(e));
    }
  }

  root.addEventListener("click", async (ev) => {
    const t = composedClickTargetFromEvent(ev);
    if (!(t instanceof Element)) return;
    if (t.closest && t.closest("[data-fusa-auf-neu-open]")) {
      ev.preventDefault();
      void openNeu();
      return;
    }
    if (t.closest && t.closest("[data-fusa-auf-neu-close]")) {
      closeNeu();
      return;
    }
    const umzTabBtn = t.closest && t.closest("[data-fusa-umz-tab]");
    if (umzTabBtn instanceof HTMLButtonElement) {
      ev.preventDefault();
      setUmzTabFilter(root, umzTabBtn.getAttribute("data-fusa-umz-tab") ?? "");
      return;
    }
    if (
      modal instanceof HTMLElement &&
      modal.classList.contains("open") &&
      t.closest &&
      t.closest("[data-fusa-auf-detail-modal]")
    ) {
      return;
    }
    if (
      abnahmeModal instanceof HTMLElement &&
      abnahmeModal.classList.contains("open") &&
      t.closest &&
      t.closest("[data-fusa-auf-abnahme-modal]")
    ) {
      return;
    }
    const tr = t.closest && t.closest("tr[data-fusa-auf-payload]");
    if (!(tr instanceof HTMLTableRowElement)) return;
    const raw = tr.getAttribute("data-fusa-auf-payload");
    if (
      !raw ||
      !(modal instanceof HTMLElement) ||
      !(bodyEl instanceof HTMLElement)
    )
      return;
    let row;
    try {
      row = JSON.parse(decodeURIComponent(raw));
    } catch {
      return;
    }
    dpPendingFile = null;
    bodyEl.innerHTML = '<p class="ckp-mock-note">Lade Detail…</p>';
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    modal.setAttribute(
      "data-fusa-detail-auftrag-id",
      row.id != null ? String(row.id) : "",
    );
    const headTit = root.querySelector("[data-fusa-auf-detail-title]");
    if (headTit) {
      const idShow = row.id != null ? String(row.id) : "";
      headTit.textContent =
        idShow ||
        (row.title != null ? String(row.title).trim() : "") ||
        "Auftrag";
    }
    const idStr = row.id != null ? String(row.id).trim() : "";
    try {
      let detailRow = row;
      if (idStr) {
        const d = await apiFetch(
          `${API_ROUTES.fusa.auftraege}/${encodeURIComponent(idStr)}`,
        );
        const auf =
          d &&
          typeof d === "object" &&
          /** @type {Record<string, unknown>} */ (d).auftrag != null
            ? /** @type {Record<string, unknown>} */ (d).auftrag
            : null;
        if (auf && typeof auf === "object") {
          detailRow = /** @type {object} */ ({ ...row, ...auf });
        }
      }
      bodyEl.innerHTML = await buildFusaAuftragDetailBodyHtml(
        detailRow,
        nameById,
        canBearbeitenFromDom,
      );
    } catch (e) {
      try {
        const warn = idStr
          ? `<p class="ckp-mock-note" role="status">${esc(formatApiErrorForUi(e))} — Anzeige aus Liste.</p>`
          : "";
        bodyEl.innerHTML =
          warn +
          (await buildFusaAuftragDetailBodyHtml(
            row,
            nameById,
            canBearbeitenFromDom,
          ));
      } catch {
        bodyEl.innerHTML =
          '<p class="ckp-api-error" role="alert">Detail konnte nicht aufgebaut werden.</p>';
      }
    }
  });

  const searchEl = root.querySelector("[data-fusa-auf-suche]");
  if (searchEl instanceof HTMLInputElement) {
    searchEl.addEventListener("input", () => applyFusaAuftragRowFilters(root));
  }

  if (modal instanceof HTMLElement) {
    /**
     * @param {unknown[]} nextDocs
     */
    async function persistDokumenteAndRefresh(nextDocs) {
      const id = modal.getAttribute("data-fusa-detail-auftrag-id") || "";
      if (!id || !(bodyEl instanceof HTMLElement)) return;
      const patchRes = await apiFetch(
        `${API_ROUTES.fusa.auftraege}/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: { fusa_extra_json: { dokumente_meta: nextDocs } },
        },
      );
      const auf =
        patchRes &&
        typeof patchRes === "object" &&
        /** @type {any} */ (patchRes).auftrag != null
          ? /** @type {object} */ (/** @type {any} */ (patchRes).auftrag)
          : null;
      if (!auf) throw new Error("Speichern fehlgeschlagen.");
      bodyEl.innerHTML = await buildFusaAuftragDetailBodyHtml(
        auf,
        nameById,
        canBearbeitenFromDom,
      );
    }

    function triggerDocFilePicker() {
      if (!(bodyEl instanceof HTMLElement)) return;
      if (!canBearbeitenFromDom) {
        showFusaAufDetailTransient(bodyEl, "Kein Recht zum Bearbeiten.");
        return;
      }
      const inp = bodyEl.querySelector("[data-fusa-auf-dp-file]");
      if (inp instanceof HTMLInputElement) inp.click();
      else
        showFusaAufDetailTransient(
          bodyEl,
          "⚠ Bitte Auftrag öffnen um Dateien hochzuladen",
        );
    }

    /**
     * @param {FileList|null|undefined} fileList
     */
    function handleDroppedOrSelectedFiles(fileList) {
      if (!(bodyEl instanceof HTMLElement) || !canBearbeitenFromDom) return;
      const f = fileList && fileList[0];
      if (!(f instanceof File)) return;
      if (f.size > FUSA_AUF_DP_MAX_BYTES) {
        showFusaAufDetailTransient(bodyEl, "⚠ Datei zu groß (max. 20 MB)");
        return;
      }
      dpPendingFile = f;
      showFusaAufDpTypwahlAfterFile(bodyEl, f.name);
    }

    modal.addEventListener("change", (ev) => {
      const t = ev.target;
      if (
        !(t instanceof HTMLInputElement) ||
        !t.matches("[data-fusa-auf-dp-file]")
      )
        return;
      if (!(bodyEl instanceof HTMLElement) || !canBearbeitenFromDom) return;
      const files = t.files;
      if (!files || !files.length) return;
      handleDroppedOrSelectedFiles(files);
    });

    modal.addEventListener("dragover", (ev) => {
      const el = composedClickTargetFromEvent(ev);
      if (!(el instanceof Element)) return;
      const dz = el.closest("[data-fusa-auf-detail-doczone]");
      if (!(dz instanceof HTMLElement)) return;
      if (dz.getAttribute("data-fusa-auf-detail-doczone-ro") === "1") return;
      ev.preventDefault();
      try {
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
      } catch {
        /* ignore */
      }
      dz.style.borderColor = "var(--blue,#D4500A)";
      dz.style.background = "var(--blue-l,#FFF0E6)";
    });

    modal.addEventListener("dragleave", (ev) => {
      const el = composedClickTargetFromEvent(ev);
      if (!(el instanceof Element)) return;
      const dz = el.closest("[data-fusa-auf-detail-doczone]");
      if (!(dz instanceof HTMLElement)) return;
      const rt = ev.relatedTarget;
      if (rt instanceof Node && dz.contains(rt)) return;
      dz.style.borderColor = "";
      dz.style.background = "";
    });

    modal.addEventListener("drop", (ev) => {
      const el = composedClickTargetFromEvent(ev);
      if (!(el instanceof Element)) return;
      const dz = el.closest("[data-fusa-auf-detail-doczone]");
      if (!(dz instanceof HTMLElement)) return;
      if (dz.getAttribute("data-fusa-auf-detail-doczone-ro") === "1") return;
      ev.preventDefault();
      dz.style.borderColor = "";
      dz.style.background = "";
      const dt = ev.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;
      handleDroppedOrSelectedFiles(dt.files);
    });

    modal.addEventListener("click", (ev) => {
      const raw = ev.target;
      if (raw === modal) {
        closeDetail();
        dpPendingFile = null;
        return;
      }
      const el = composedClickTargetFromEvent(ev);
      if (!(el instanceof Element)) return;

      if (el.closest("[data-fusa-auf-detail-close]")) {
        ev.preventDefault();
        ev.stopPropagation();
        dpPendingFile = null;
        closeDetail();
        return;
      }

      const delBtn = el.closest("[data-fusa-auf-doc-del]");
      if (delBtn instanceof HTMLElement) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!canBearbeitenFromDom) return;
        const idx = Number(delBtn.getAttribute("data-fusa-auf-doc-del"));
        if (!Number.isFinite(idx)) return;
        void (async () => {
          const id = modal.getAttribute("data-fusa-detail-auftrag-id") || "";
          if (!id || !(bodyEl instanceof HTMLElement)) return;
          try {
            const d0 = await apiFetch(
              `${API_ROUTES.fusa.auftraege}/${encodeURIComponent(id)}`,
            );
            const auf0 =
              d0 &&
              typeof d0 === "object" &&
              /** @type {any} */ (d0).auftrag != null
                ? /** @type {object} */ (/** @type {any} */ (d0).auftrag)
                : null;
            if (!auf0) throw new Error("Auftrag nicht gefunden.");
            const ex0 = parseFusaExtraFromRow(auf0);
            const cur = Array.isArray(ex0.dokumente_meta)
              ? [...ex0.dokumente_meta]
              : [];
            if (idx < 0 || idx >= cur.length) return;
            const removed = cur[idx];
            const n =
              removed &&
              typeof removed === "object" &&
              /** @type {any} */ (removed).name != null
                ? String(/** @type {any} */ (removed).name)
                : "Datei";
            cur.splice(idx, 1);
            await persistDokumenteAndRefresh(cur);
            showFusaAufDetailTransient(bodyEl, `🗑 Gelöscht: ${n}`);
          } catch (e) {
            window.alert(formatApiErrorForUi(e));
          }
        })();
        return;
      }

      if (el.closest("[data-fusa-auf-dp-cancel]")) {
        ev.preventDefault();
        ev.stopPropagation();
        dpPendingFile = null;
        if (bodyEl instanceof HTMLElement) resetFusaAufDpUploadUi(bodyEl);
        return;
      }

      if (el.closest("[data-fusa-auf-dp-save]")) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!canBearbeitenFromDom || !(bodyEl instanceof HTMLElement)) return;
        void (async () => {
          const id = modal.getAttribute("data-fusa-detail-auftrag-id") || "";
          const f = dpPendingFile;
          if (!f) {
            showFusaAufDetailTransient(bodyEl, "⚠ Keine Datei gewählt");
            return;
          }
          if (f.size > FUSA_AUF_DP_MAX_BYTES) {
            showFusaAufDetailTransient(bodyEl, "⚠ Datei zu groß (max. 20 MB)");
            return;
          }
          const typ = readFusaAufDpSelectedTypFromGrid(bodyEl);
          try {
            const d0 = await apiFetch(
              `${API_ROUTES.fusa.auftraege}/${encodeURIComponent(id)}`,
            );
            const auf0 =
              d0 &&
              typeof d0 === "object" &&
              /** @type {any} */ (d0).auftrag != null
                ? /** @type {object} */ (/** @type {any} */ (d0).auftrag)
                : null;
            if (!auf0) throw new Error("Auftrag nicht gefunden.");
            const ex0 = parseFusaExtraFromRow(auf0);
            const cur = Array.isArray(ex0.dokumente_meta)
              ? [...ex0.dokumente_meta]
              : [];
            cur.push({
              name: f.name,
              type: typ,
              datum: new Date().toLocaleDateString("de-DE"),
              size: f.size,
            });
            await persistDokumenteAndRefresh(cur);
            dpPendingFile = null;
            const shortName =
              f.name.length > 30 ? `${f.name.slice(0, 30)}…` : f.name;
            showFusaAufDetailTransient(
              bodyEl,
              `✓ ${fusaAufDpTypLabel(typ)} gespeichert: ${shortName}`,
            );
          } catch (e) {
            window.alert(formatApiErrorForUi(e));
          }
        })();
        return;
      }

      const typPick = el.closest("[data-fusa-auf-dp-typ]");
      if (typPick instanceof HTMLElement) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!(bodyEl instanceof HTMLElement)) return;
        const k = typPick.getAttribute("data-typ") || "sonstiges";
        applyFusaAufDpSelTyp(bodyEl, k);
        return;
      }

      if (el.closest("[data-fusa-auf-detail-doczone]")) {
        ev.preventDefault();
        ev.stopPropagation();
        triggerDocFilePicker();
        return;
      }

      const actBtn = el.closest("[data-fusa-auf-detail-action]");
      if (actBtn instanceof HTMLElement) {
        ev.preventDefault();
        ev.stopPropagation();
        const k = actBtn.getAttribute("data-fusa-auf-detail-action") || "";
        if (k === "upload") {
          triggerDocFilePicker();
          return;
        }
        if (k === "fahrzeug") {
          void (async () => {
            const aid = modal.getAttribute("data-fusa-detail-auftrag-id") || "";
            if (!aid || !(bodyEl instanceof HTMLElement)) return;
            try {
              const d = await apiFetch(
                `${API_ROUTES.fusa.auftraege}/${encodeURIComponent(aid)}`,
              );
              const auf =
                d &&
                typeof d === "object" &&
                /** @type {any} */ (d).auftrag != null
                  ? /** @type {object} */ (/** @type {any} */ (d).auftrag)
                  : null;
              openFusaAufDpFahrzeugFromRow(auf, bodyEl, closeDetail);
            } catch (e) {
              window.alert(formatApiErrorForUi(e));
            }
          })();
          return;
        }
        if (k === "abnahme") {
          const aid = modal.getAttribute("data-fusa-detail-auftrag-id") || "";
          void openAbnahmeProtokollFromDetail(aid);
          return;
        }
        if (k === "freigeben") {
          const aid = modal.getAttribute("data-fusa-detail-auftrag-id") || "";
          if (!aid) return;
          if (bodyEl instanceof HTMLElement) {
            showFusaAufDetailTransient(bodyEl, "Freigabe wird vorbereitet…");
          }
          void (async () => {
            try {
              const result = await apiFetch(
                `${API_ROUTES.fusa.auftraege}/${encodeURIComponent(aid)}/freigeben`,
                {
                  method: "POST",
                },
              );
              const payload =
                result && typeof result === "object" ? result : {};
              const statusLabel =
                payload && typeof payload === "object" && payload.status != null
                  ? String(payload.status).trim()
                  : "";
              const ccinternId =
                payload &&
                typeof payload === "object" &&
                payload.ccintern_auftrag_id != null
                  ? String(payload.ccintern_auftrag_id).trim()
                  : "";
              closeDetail();
              document.dispatchEvent(
                new CustomEvent("ccw:cross-module-navigate", {
                  bubbles: true,
                  detail: {
                    module: "ccintern",
                    view: "cc_produktion",
                    ccinternAuftragId: ccinternId || null,
                    fusaAuftragId: aid || null,
                    status: statusLabel || null,
                  },
                }),
              );
            } catch (e) {
              window.alert(formatApiErrorForUi(e));
            }
          })();
          return;
        }
        if (k === "rechnung") {
          if (bodyEl instanceof HTMLElement)
            showFusaAufDetailTransient(bodyEl, "Rechnung wird erstellt…");
          return;
        }
        return;
      }

      if (el.closest("[data-fusa-auf-detail-edit]")) {
        ev.preventDefault();
        ev.stopPropagation();
        const aid = modal.getAttribute("data-fusa-detail-auftrag-id") || "";
        if (aid) void openWizardForEdit(aid);
        return;
      }
      if (el.closest("[data-fusa-auf-detail-panel]")) {
        ev.stopPropagation();
      }
    });
  }
  if (neuModal instanceof HTMLElement) {
    neuModal.addEventListener("click", (ev) => {
      if (ev.target === neuModal) closeNeu();
    });
  }
  if (neuDialog instanceof HTMLElement) {
    neuDialog.addEventListener("click", (ev) => {
      const el = composedClickTargetFromEvent(ev);
      if (el instanceof Element && el.closest("[data-fusa-auf-neu-close]")) {
        closeNeu();
        return;
      }
      ev.stopPropagation();
    });
  }

  if (abnahmeModal instanceof HTMLElement) {
    abnahmeModal.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      const wrap = t.closest("[data-fusa-auf-abnahme-print-mount]");
      if (!(wrap instanceof HTMLElement)) return;
      if (t.matches("[data-fusa-ap-ok]")) {
        const i = t.getAttribute("data-fusa-ap-ok");
        if (t.checked && i) {
          const mal = wrap.querySelector(`[data-fusa-ap-mangel="${i}"]`);
          if (mal instanceof HTMLInputElement) mal.checked = false;
        }
      }
      if (t.matches("[data-fusa-ap-mangel]")) {
        const i = t.getAttribute("data-fusa-ap-mangel");
        if (t.checked && i) {
          const ok = wrap.querySelector(`[data-fusa-ap-ok="${i}"]`);
          if (ok instanceof HTMLInputElement) ok.checked = false;
        }
      }
    });
    abnahmeModal.addEventListener("input", (ev) => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      const wrap = t.closest("[data-fusa-auf-abnahme-print-mount]");
      if (!(wrap instanceof HTMLElement)) return;
      if (
        t.matches(
          "[data-fusa-ap-monteur1], [data-fusa-ap-monteur2], [data-fusa-ap-datum]",
        )
      ) {
        fusaAbnahmeUpdateMonteurMetaLine(wrap);
      }
    });
    abnahmeModal.addEventListener("click", (ev) => {
      const raw = ev.target;
      if (raw === abnahmeModal) {
        closeAbnahmeProtokoll();
        return;
      }
      const el = composedClickTargetFromEvent(ev);
      if (!(el instanceof Element)) return;
      if (el.closest("[data-fusa-auf-abnahme-close]")) {
        ev.preventDefault();
        closeAbnahmeProtokoll();
        return;
      }
      const clr = el.closest("[data-fusa-sig-clear]");
      if (clr instanceof HTMLElement && canBearbeitenFromDom) {
        ev.preventDefault();
        const who = clr.getAttribute("data-fusa-sig-clear") || "";
        if (who === "monteur") abnahmeSigCleared.monteur = true;
        if (who === "werkstatt") abnahmeSigCleared.werkstatt = true;
        const api = /** @type {any} */ (abnahmeModal)._fusaSigApi;
        if (api && typeof api.clear === "function") api.clear(who);
        return;
      }
      if (el.closest("[data-fusa-auf-abnahme-print]")) {
        ev.preventDefault();
        const aid =
          abnahmeModal.getAttribute("data-fusa-abnahme-auftrag-id") || "";
        printAbnahmeProtokollFromDom(abnahmeModal, aid);
        return;
      }
      if (el.closest("[data-fusa-auf-abnahme-save]")) {
        ev.preventDefault();
        void saveAbnahmeProtokoll();
        return;
      }
      if (el.closest("[data-fusa-auf-abnahme-panel]")) {
        ev.stopPropagation();
      }
    });
  }

  setUmzTabFilter(root, "");

  if (CCState.get("fusaAuftragNeuOpenWizard")) {
    CCState.set("fusaAuftragNeuOpenWizard", false);
    void openNeu();
  }
}
