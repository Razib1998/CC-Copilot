/**
 * FUSA — nativer Auftrags-Wizard (Form-Meta, Kalkulation, Verfügbarkeit, POST/PATCH /auftraege).
 * Modi: Neu (`create`) und Bearbeiten (`edit`, gleiche Maske).
 * Kein Legacy-State, keine Alt-FUSA-Logik als Wahrheit — nur Cockpit-APIs.
 *
 * **Entwurf vs. final (Backend `routes/auftraege.js`):**
 * - Entwurf: `POST /auftraege` mit `ist_entwurf: true` oder `entwurf: true` oder `status: 'Entwurf'` —
 *   Server setzt u. a. `fusa_extra_json.entwurf: true`, lockert Pflichtregeln.
 * - Final: `ist_entwurf: false`, `status: 'Aktiv'` (Wizard), `fusa_extra_json.entwurf: false` (Server bei Validierung).
 * - Bearbeiten Entwurf: `PATCH /auftraege/:id` mit `status: 'Entwurf'` und `fusa_extra_json` inkl. `entwurf: true`.
 * - `fusa_extra_json` wird per Shallow-Merge gemerged; `dokumente_meta` wird beim Speichern aus dem geladenen Auftrag mitgegeben, damit Metadaten nicht verloren gehen.
 */
import { esc } from '../../fusa-ui-shared.js';
import { apiFetch, formatApiErrorForUi } from '../../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../../core/api/api-routes.js';
import { buildFirmenSelectOptions, resolveFirmenLabel } from '../../../shared/lib/firma-kunden-referenz.js';
import { loadMyRights, myFusaPreiseSehenAny } from '../../../../core/access/cc-my-rights.js';

/**
 * API liefert `buchbar` und Alias `erlaubt` — beide false blockiert Auswahl.
 * @param {{ buchbar?: boolean|null, erlaubt?: boolean|null }|null|undefined} row
 */
function fahrzeugApiIstBuchbar(row) {
  if (!row) return true;
  if (row.buchbar === false) return false;
  if (row.erlaubt === false) return false;
  return true;
}

/**
 * @param {string} startYmd
 * @param {string} endYmd
 * @returns {number}
 */
function schaetzeLaufzeitMonateAusZeitraum(startYmd, endYmd) {
  const s = String(startYmd || '').slice(0, 10);
  const e = String(endYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return 12;
  const d0 = new Date(`${s}T12:00:00`);
  const d1 = new Date(`${e}T12:00:00`);
  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime()) || d1 < d0) return 12;
  const days = Math.ceil((d1.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const m = Math.max(1, Math.round(days / 30.44));
  return Math.min(120, m);
}

/**
 * @param {string} startYmd
 * @param {number} months
 * @returns {string}
 */
function addMonthsToYmd(startYmd, months) {
  const s = String(startYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, mo, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + Math.max(1, months));
  const y2 = dt.getUTCFullYear();
  const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(dt.getUTCDate()).padStart(2, '0');
  return `${y2}-${m2}-${d2}`;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function parseJsonObjLoose(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? /** @type {Record<string, unknown>} */ (o) : {};
  } catch {
    return {};
  }
}

/**
 * @returns {string}
 */
export function buildFusaAuftragWizardShellHtml() {
  return `<div class="fusa-wiz fusa-wiz--vertrieb" data-fusa-wiz-root style="display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;width:100%;">
  <form class="fusa-wiz__layout" data-fusa-wiz-form autocomplete="off" style="display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;width:100%;">
    <input type="hidden" data-fusa-wiz-lz value="24" />
    <input type="hidden" id="fusa-wiz-end" data-fusa-wiz-end value="" />
    <div class="fusa-wiz__scroll">
      <div class="fusa-wiz__alert fusa-wiz__alert--meta" data-fusa-wiz-meta-err hidden role="alert"></div>

      <div class="fusa-wiz__kpi-bar" aria-live="polite">
        <div class="fusa-wiz__kpi-cell"><span class="fusa-wiz__kpi-lab">Fahrzeuge</span><span class="fusa-wiz__kpi-val" data-fusa-wiz-kpi-fz>0</span></div>
        <div class="fusa-wiz__kpi-cell"><span class="fusa-wiz__kpi-lab">Laufzeit</span><span class="fusa-wiz__kpi-val fusa-wiz__kpi-val--sm" data-fusa-wiz-kpi-lz-text>—</span></div>
        <div class="fusa-wiz__kpi-cell"><span class="fusa-wiz__kpi-lab">Ges. Netto / Monat</span><span class="fusa-wiz__kpi-val" data-fusa-wiz-kpi-monat>—</span></div>
        <div class="fusa-wiz__kpi-cell"><span class="fusa-wiz__kpi-lab">Auftragswert</span><span class="fusa-wiz__kpi-val" data-fusa-wiz-kpi-gesamt>—</span></div>
      </div>

      <section class="fusa-wiz__sec">
        <h2 class="fusa-wiz__sec-title">1 — KUNDE &amp; AUFTRAGSZEITRAUM</h2>
        <p class="fusa-wiz__hint fusa-wiz__hint--kalk" data-fusa-wiz-kalk-inline aria-live="polite" style="margin-bottom:10px;"></p>
        <div class="fusa-wiz__grid fusa-wiz__grid--3">
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Kunde <span class="fusa-wiz__req">*</span></span><select id="fusa-wiz-firma" data-fusa-wiz-firma class="fusa-wiz__inp fusa-wiz__firma-select" required></select></label>
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Ansprechpartner</span><input id="fusa-wiz-ap" data-fusa-wiz-ap class="fusa-wiz__inp" type="text" autocomplete="off" placeholder="Name" /></label>
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Auftragsname <span class="fusa-wiz__req">*</span></span><input id="fusa-wiz-title" data-fusa-wiz-title class="fusa-wiz__inp" type="text" required autocomplete="off" placeholder="z. B. Sommer 2026" /></label>
        </div>
        <div class="fusa-wiz__grid fusa-wiz__grid--3" style="margin-top:12px;">
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Auftragsbeginn <span class="fusa-wiz__req">*</span></span><input id="fusa-wiz-start" data-fusa-wiz-start class="fusa-wiz__inp" type="date" required /></label>
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Laufzeit <span class="fusa-wiz__req">*</span></span><select id="fusa-wiz-lz-select" data-fusa-wiz-lz-select class="fusa-wiz__inp">
            <option value="6">6 Monate</option><option value="12">12 Monate</option><option value="18">18 Monate</option>
            <option value="24" selected>24 Monate</option><option value="30">30 Monate</option><option value="36">36 Monate</option>
            <option value="48">48 Monate</option><option value="60">60 Monate</option>
          </select></label>
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Auftragsende</span><input class="fusa-wiz__inp fusa-wiz__readonly" type="text" readonly data-fusa-wiz-end-disp value="—" aria-live="polite" /></label>
        </div>
        <div class="fusa-wiz__mini" style="margin-top:8px;">Auftrag-Nr (intern): <input type="text" readonly class="fusa-wiz__readonly fusa-wiz__inp fusa-wiz__inp--inline" data-fusa-wiz-auftrag-nr value="" placeholder="wird vergeben" aria-label="Interne Auftragsnummer" style="max-width:220px;" /> · Projekt: <strong data-fusa-wiz-projekt-ro>—</strong></div>
      </section>

      <section class="fusa-wiz__sec">
        <h2 class="fusa-wiz__sec-title">2 — FAHRZEUGTYP &amp; WERBEPAKET</h2>
        <div class="fusa-wiz__grid fusa-wiz__grid--2">
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Fahrzeugtyp <span class="fusa-wiz__req">*</span></span><select id="fusa-wiz-typ" data-fusa-wiz-typ class="fusa-wiz__inp" required><option value="">— wählen —</option></select></label>
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Depot / Standort <span class="fusa-wiz__req">*</span></span><select id="fusa-wiz-depot" data-fusa-wiz-depot class="fusa-wiz__inp" required><option value="">— wählen —</option></select></label>
        </div>
        <p class="fusa-wiz__sub">Werbepaket wählen <span class="fusa-wiz__req">*</span></p>
        <div class="fusa-wiz-paket-chips" data-fusa-wiz-paket-chips></div>
        <p class="fusa-wiz__hint fusa-wiz__hint--paket" data-fusa-wiz-paket-info hidden></p>
      </section>

      <section class="fusa-wiz__sec">
        <h2 class="fusa-wiz__sec-title">3 — FAHRZEUGE AUSWÄHLEN</h2>
        <p class="fusa-wiz__hint" data-fusa-wiz-fz-hint></p>
        <p class="fusa-wiz__fz-sel" data-fusa-wiz-fz-sel hidden aria-live="polite"></p>
        <div class="fusa-wiz__alert fusa-wiz__alert--inline" data-fusa-wiz-fz-err hidden role="alert"></div>
        <div data-fusa-wiz-fz-list class="fusa-wiz-fz-list"></div>
      </section>

      <section class="fusa-wiz__sec">
        <h2 class="fusa-wiz__sec-title">4 — PAKETE &amp; PREISE JE FAHRZEUG</h2>
        <div class="fusa-wiz__preis-box-head">
          <div class="fusa-wiz__global-flags fusa-wiz__global-flags--end">
            <label class="fusa-wiz__flag-lab"><input type="checkbox" data-fusa-wiz-same-paket /> Gleiches Paket für alle</label>
            <label class="fusa-wiz__flag-lab"><input type="checkbox" data-fusa-wiz-same-preis /> Gleicher Preis für alle</label>
          </div>
        </div>
        <div class="fusa-wiz__preis-box">
          <div class="fusa-wiz__preis-box-row"><span class="fusa-wiz__lab">Paket</span> <strong class="fusa-wiz__paket-highlight" data-fusa-wiz-sec4-paket-name>—</strong></div>
          <label class="fusa-wiz__field fusa-wiz__field--full" style="margin-top:8px;"><span class="fusa-wiz__lab">Partnermodell</span><select id="fusa-wiz-partner" data-fusa-wiz-partner class="fusa-wiz__inp"></select></label>
        </div>
        <div data-fusa-wiz-preis-table-wrap class="fusa-wiz-preis-wrap" style="margin-top:10px;"></div>
        <div data-fusa-wiz-preis-totals class="fusa-wiz-preis-totals" aria-live="polite"></div>
      </section>

      <section class="fusa-wiz__sec">
        <h2 class="fusa-wiz__sec-title">5 — MONTAGETERMIN &amp; WERKSTATT</h2>
        <div class="fusa-wiz__grid fusa-wiz__grid--2">
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Gewünschter Beklebungstermin <span class="fusa-wiz__req">*</span></span><input id="fusa-wiz-montage" data-fusa-wiz-montage class="fusa-wiz__inp" type="date" required /></label>
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Wunschzeit</span>
            <select id="fusa-wiz-zeit" data-fusa-wiz-zeit class="fusa-wiz__inp">
              <option value="">— wählen —</option>
              <option value="vormittags">Vormittags</option>
              <option value="nachmittags">Nachmittags</option>
              <option value="ganztags">Ganztags</option>
            </select>
          </label>
        </div>
        <p class="fusa-wiz__hint" data-fusa-wiz-werk-hint style="margin-top:6px;">Werkstatt wird automatisch per E-Mail informiert.</p>
        <div class="fusa-wiz__grid fusa-wiz__grid--2" style="margin-top:10px;">
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Depot / Werkstatt</span><input id="fusa-wiz-ws-label" data-fusa-wiz-ws-label type="text" readonly class="fusa-wiz__readonly fusa-wiz__inp" placeholder="Wird automatisch aus Depot übernommen" /></label>
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Werkstatt E-Mail</span><input id="fusa-wiz-ws-mail" data-fusa-wiz-ws-mail type="text" readonly class="fusa-wiz__readonly fusa-wiz__inp" placeholder="Automatisch je nach Depot" /></label>
        </div>
      </section>

      <section class="fusa-wiz__sec fusa-wiz__sec--last">
        <h2 class="fusa-wiz__sec-title">6 — ABRECHNUNG</h2>
        <div class="fusa-wiz__grid fusa-wiz__grid--2">
          <label class="fusa-wiz__field"><span class="fusa-wiz__lab">Abrechnungsart <span class="fusa-wiz__req">*</span></span><select id="fusa-wiz-abr" data-fusa-wiz-abr class="fusa-wiz__inp" required>
            <option value="">— wählen —</option>
            <option value="monatlich">Monatlich</option>
            <option value="quartalsweise">Quartal</option>
            <option value="jaehrlich">Jahr</option>
          </select></label>
          <div class="fusa-wiz__field fusa-wiz__field--full"><span class="fusa-wiz__lab">Interne Notiz</span><textarea id="fusa-wiz-notiz" data-fusa-wiz-notiz class="fusa-wiz__inp" rows="3" placeholder="optional" autocomplete="off"></textarea></div>
        </div>
        <p class="fusa-wiz__mini" style="margin-top:10px;">Erfasst: <span data-fusa-wiz-ref-created>—</span> · ID: <span data-fusa-wiz-ref-id>—</span></p>
      </section>
    </div>

    <footer class="fusa-wiz__foot">
      <div class="fusa-wiz__alert fusa-wiz__alert--save" data-fusa-wiz-save-err hidden role="alert"></div>
      <div class="fusa-wiz__foot-summary" data-fusa-wiz-footer-summary>—</div>
      <div class="fusa-wiz__foot-btns">
        <button type="button" class="fusa-wiz__btn fusa-wiz__btn--ghost" data-fusa-wiz-cancel>Abbrechen</button>
        <button type="button" class="fusa-wiz__btn fusa-wiz__btn--ghost" data-fusa-wiz-draft>Als Entwurf speichern</button>
        <button type="submit" class="fusa-wiz__btn fusa-wiz__btn--primary" data-fusa-wiz-submit disabled>Auftrag anlegen</button>
      </div>
    </footer>
  </form>
</div>
<style>
.fusa-wiz--vertrieb .fusa-wiz__scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 12px 18px 20px; }
.fusa-wiz--vertrieb .fusa-wiz__layout { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.fusa-wiz--vertrieb .fusa-wiz__alert { font-size: 12px; line-height: 1.45; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--ccds-border, #e2e8f0); margin: 0 0 10px; color: var(--ccds-text, #0f172a); background: #fffbeb; }
.fusa-wiz--vertrieb .fusa-wiz__alert--inline { margin: 0 0 8px; background: #fffbeb; }
.fusa-wiz--vertrieb .fusa-wiz__alert--meta { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
.fusa-wiz--vertrieb .fusa-wiz__alert--save { background: #fef2f2; border-color: #fecaca; color: #991b1b; margin: 0 0 8px; }
.fusa-wiz__kpi-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #1e293b; border-radius: 8px; overflow: hidden; margin-bottom: 18px; }
@media (max-width: 720px) { .fusa-wiz__kpi-bar { grid-template-columns: 1fr 1fr; } }
.fusa-wiz__kpi-cell { background: #0f172a; padding: 10px 12px; color: #f8fafc; }
.fusa-wiz__kpi-lab { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 4px; }
.fusa-wiz__kpi-val { font-size: 15px; font-weight: 800; color: #fff; }
.fusa-wiz__kpi-val--sm { font-size: 13px; font-weight: 700; line-height: 1.35; }
.fusa-wiz__sec { margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid var(--ccds-border, #e2e8f0); }
.fusa-wiz__sec--last { border-bottom: none; margin-bottom: 8px; padding-bottom: 8px; }
.fusa-wiz__sec-title { margin: 0 0 14px; font-size: 13px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #ea580c; }
.fusa-wiz__grid { display: grid; gap: 12px 16px; align-items: end; }
.fusa-wiz__grid--3 { grid-template-columns: repeat(3, 1fr); }
.fusa-wiz__grid--2 { grid-template-columns: repeat(2, 1fr); }
@media (max-width: 720px) { .fusa-wiz__grid--3, .fusa-wiz__grid--2 { grid-template-columns: 1fr; } }
.fusa-wiz__field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.fusa-wiz__field--full { grid-column: 1 / -1; }
.fusa-wiz__lab { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.03em; }
.fusa-wiz__inp { width: 100%; max-width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--ccds-border, #e2e8f0); }
.fusa-wiz__inp--inline { display: inline-block; vertical-align: middle; }
.fusa-wiz__req { color: #b91c1c; font-weight: 700; }
.fusa-wiz__readonly { background: #f1f5f9 !important; color: #475569; }
.fusa-wiz__mini { font-size: 11px; color: #64748b; }
.fusa-wiz__sub { font-size: 11px; font-weight: 700; color: #64748b; margin: 12px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }
.fusa-wiz__hint { margin: 0; font-size: 12px; color: #64748b; line-height: 1.45; }
.fusa-wiz__hint--kalk { min-height: 0; }
.fusa-wiz__hint--loading { color: #94a3b8; font-style: normal; }
.fusa-wiz__hint--paket { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-weight: 600; }
.fusa-wiz__preis-box-head { display: flex; justify-content: flex-end; margin-bottom: 8px; }
.fusa-wiz__global-flags--end { margin: 0; justify-content: flex-end; }
.fusa-wiz__preis-box { background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%); border: 1px solid #fdba74; border-radius: 10px; padding: 12px 14px 14px; }
.fusa-wiz__preis-box-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.fusa-wiz__paket-highlight { font-size: 15px; color: #c2410c; }
.fusa-wiz__firma-select { min-height: 40px; }
.fusa-wiz__foot { flex-shrink: 0; border-top: 1px solid var(--ccds-border, #e2e8f0); padding: 12px 18px 16px; background: #fafafa; }
.fusa-wiz__foot-summary { font-size: 12px; font-weight: 700; color: #166534; background: #dcfce7; border: 1px solid #86efac; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; line-height: 1.45; }
.fusa-wiz__foot-btns { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; align-items: center; }
.fusa-wiz__btn { font: inherit; font-size: 13px; font-weight: 700; padding: 10px 16px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; }
.fusa-wiz__btn--ghost { background: #fff; border-color: #cbd5e1; color: #0f172a; }
.fusa-wiz__btn--ghost:hover { background: #f8fafc; }
.fusa-wiz__btn--primary { background: linear-gradient(180deg, #fb923c 0%, #ea580c 100%); color: #fff; border-color: #c2410c; box-shadow: 0 2px 6px rgba(234,88,12,.35); }
.fusa-wiz__btn--primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
.fusa-wiz__global-flags { display: flex; flex-wrap: wrap; gap: 14px 18px; font-size: 12px; font-weight: 600; color: #334155; }
.fusa-wiz__flag-lab { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.fusa-wiz__paket-btn { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--ccds-border, #e2e8f0); background: #fff; cursor: pointer; font-size: 12px; font-weight: 600; color: #0f172a; max-width: 280px; }
.fusa-wiz__paket-btn:hover { border-color: #fdba74; background: #fffbeb; }
.fusa-wiz__paket-btn--active { background: #ffedd5; border-color: #fb923c; color: #9a3412; box-shadow: 0 0 0 1px #fb923c; }
.fusa-wiz__paket-btn-name { line-height: 1.3; }
.fusa-wiz__paket-btn-preis { font-size: 11px; font-weight: 600; color: #64748b; }
.fusa-wiz__paket-btn--active .fusa-wiz__paket-btn-preis { color: #9a3412; }
.fusa-wiz-paket-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 8px; align-items: stretch; }
.fusa-wiz-fz-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 10px; margin: 0 2px 4px; border: 1px solid transparent; border-radius: 8px; font-size: 13px; cursor: pointer; transition: background 0.12s ease, border-color 0.12s ease; }
.fusa-wiz-fz-row:hover { background: #f8fafc; border-color: #e2e8f0; }
.fusa-wiz-fz-row--on { background: #fff7ed; border-color: #fdba74; }
.fusa-wiz-fz-row--blocked { cursor: default; opacity: 0.9; }
.fusa-wiz-fz-row--blocked:hover { background: transparent; border-color: transparent; }
.fusa-wiz-fz-row--blocked input[type="checkbox"] { cursor: not-allowed; }
.fusa-wiz-fz-row__body { flex: 1; min-width: 0; }
.fusa-wiz-fz-row__main { display: block; font-weight: 700; color: #0f172a; }
.fusa-wiz-fz-row__typ { font-size: 11px; font-weight: 600; color: #64748b; margin-left: 6px; }
.fusa-wiz-fz-row__sub { display: block; font-size: 11px; color: #64748b; margin-top: 2px; }
.fusa-wiz-fz-row__warn { display: block; font-size: 11px; font-weight: 600; color: #b91c1c; margin-top: 4px; line-height: 1.35; }
.fusa-wiz-fz-row__unsicher { display: block; font-size: 10px; font-weight: 600; color: #b45309; margin-top: 3px; line-height: 1.35; }
.fusa-wiz__fz-sel { margin: 8px 0; font-size: 12px; font-weight: 700; color: #0f172a; }
.fusa-wiz-fz-list { max-height: 280px; overflow: auto; border: 1px solid var(--ccds-border, #e2e8f0); border-radius: 8px; padding: 6px 4px 8px; background: var(--ccds-card, #fff); }
.fusa-wiz-fz-list .fusa-wiz__fz-empty { padding: 20px 14px; text-align: center; color: #64748b; font-size: 12px; line-height: 1.5; }
.fusa-wiz--vertrieb textarea[data-fusa-wiz-notiz] { width: 100%; max-width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; resize: vertical; min-height: 72px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--ccds-border, #e2e8f0); }
.fusa-wiz-preis-wrap { overflow: auto; border: 1px solid var(--ccds-border, #e2e8f0); border-radius: 8px; margin-bottom: 10px; background: #fff; }
.fusa-wiz-preis-totals { font-size: 12px; font-weight: 600; color: #0f172a; line-height: 1.55; padding: 8px 4px; }
.fusa-wiz-preis-table { width: 100%; border-collapse: collapse; font-size: 11px; min-width: 860px; }
.fusa-wiz-preis-table th, .fusa-wiz-preis-table td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: middle; }
.fusa-wiz-preis-table th { background: #f8fafc; font-weight: 700; color: #475569; white-space: nowrap; }
.fusa-wiz-preis-table input.fusa-wiz__pi { width: 100%; max-width: 88px; font-size: 11px; padding: 4px 6px; border-radius: 6px; border: 1px solid #e2e8f0; }
.fusa-wiz-preis-table input[data-fusa-wiz-ae-fz],
.fusa-wiz-preis-table input[data-fusa-wiz-rb-fz] { min-width: 60px; box-sizing: border-box; }
.fusa-wiz-preis-table select.fusa-wiz__psel { max-width: 200px; font-size: 11px; padding: 4px 6px; border-radius: 6px; }
</style>`;
}

/**
 * @param {HTMLElement} mount
 * @param {{
 *   getProjectId: () => string,
 *   getProjectLabel?: () => string,
 *   onClose: () => void,
 *   onSaved: () => Promise<void>,
 *   mode?: 'create' | 'edit',
 *   editAuftragId?: string|null,
 *   prefillFahrzeugId?: string|null,
 *   prefillFahrzeugIds?: string[]|null,
 *   prefillInternNotiz?: string|null,
 * }} ctx
 */
export async function bootFusaAuftragWizard(mount, ctx) {
  if (!(mount instanceof HTMLElement)) return;

  const rights = await loadMyRights();
  const preiseOk = myFusaPreiseSehenAny(rights);

  /** @type {Record<string, unknown>|null} */
  let formMeta = null;
  /** @type {Record<string, unknown>|null} */
  let lastKalk = null;
  /** @type {string[]} */
  let selectedFz = [];
  /** @type {ReturnType<typeof setTimeout>|null} */
  let tKalk = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let tAll = null;
  const q = (sel) => mount.querySelector(sel);

  const elFirma = /** @type {HTMLSelectElement|null} */ (q('[data-fusa-wiz-firma]'));
  const elTitle = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-title]'));
  const elAp = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-ap]'));
  const elStart = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-start]'));
  const elLz = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-lz]'));
  const elLzSelect = /** @type {HTMLSelectElement|null} */ (q('[data-fusa-wiz-lz-select]'));
  const elEnd = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-end]'));
  const elEndDisp = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-end-disp]'));
  const elTyp = /** @type {HTMLSelectElement|null} */ (q('[data-fusa-wiz-typ]'));
  const elDepot = /** @type {HTMLSelectElement|null} */ (q('[data-fusa-wiz-depot]'));
  const elPaketChips = q('[data-fusa-wiz-paket-chips]');
  const elPaketInfo = q('[data-fusa-wiz-paket-info]');
  const elSec4PaketName = q('[data-fusa-wiz-sec4-paket-name]');
  const elKalkInline = q('[data-fusa-wiz-kalk-inline]');
  const elFzList = q('[data-fusa-wiz-fz-list]');
  const elFzHint = q('[data-fusa-wiz-fz-hint]');
  const elFzErr = q('[data-fusa-wiz-fz-err]');
  const elMontage = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-montage]'));
  const elZeit = /** @type {HTMLSelectElement|null} */ (q('[data-fusa-wiz-zeit]'));
  const elWsLabel = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-ws-label]'));
  const elWsMail = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-ws-mail]'));
  const elAbr = /** @type {HTMLSelectElement|null} */ (q('[data-fusa-wiz-abr]'));
  const elNotiz = /** @type {HTMLTextAreaElement|null} */ (q('[data-fusa-wiz-notiz]'));
  const elMetaErr = q('[data-fusa-wiz-meta-err]');
  const elSaveErr = q('[data-fusa-wiz-save-err]');
  const elForm = /** @type {HTMLFormElement|null} */ (q('[data-fusa-wiz-form]'));
  const elProjektRo = q('[data-fusa-wiz-projekt-ro]');
  const elRefCreated = q('[data-fusa-wiz-ref-created]');
  const elRefId = q('[data-fusa-wiz-ref-id]');
  const elFooterSummary = q('[data-fusa-wiz-footer-summary]');
  const elPartner = /** @type {HTMLSelectElement|null} */ (q('[data-fusa-wiz-partner]'));
  const elPreisWrap = q('[data-fusa-wiz-preis-table-wrap]');
  const elPreisTotals = q('[data-fusa-wiz-preis-totals]');
  const elSamePaket = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-same-paket]'));
  const elSamePreis = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-same-preis]'));

  let selectedPaket = '';
  let saving = false;
  let savingDraft = false;
  const editAuftragId = ctx.editAuftragId != null && String(ctx.editAuftragId).trim() ? String(ctx.editAuftragId).trim() : '';
  const isEdit = ctx.mode === 'edit' && !!editAuftragId;
  /** @type {string[]} */
  const prefillFzIds = (() => {
    const one = ctx.prefillFahrzeugId != null && String(ctx.prefillFahrzeugId).trim() ? [String(ctx.prefillFahrzeugId).trim()] : [];
    if (one.length) return one;
    if (Array.isArray(ctx.prefillFahrzeugIds)) {
      return ctx.prefillFahrzeugIds.map(x => String(x).trim()).filter(Boolean);
    }
    return [];
  })();
  const prefillInternNotiz =
    ctx.prefillInternNotiz != null && String(ctx.prefillInternNotiz).trim()
      ? String(ctx.prefillInternNotiz).trim()
      : '';
  if (!isEdit && prefillInternNotiz && elNotiz) {
    elNotiz.value = prefillInternNotiz;
  }
  const SUBMIT_LABEL = 'Auftrag anlegen';
  /** Nach Hydration aus gespeicherten summen/positionen kein sofortiges runKalkulation() — nur bei Useränderung. */
  let skipInitialKalkAfterHydrate = false;
  /** Aus `fusa_extra_json` beim Edit: Werkstatt-Beklebung nicht durch Wizard-Speichern verlieren. */
  let preservedWerkstattBeklebung = {};
  /** Aus `fusa_extra_json` beim Edit: `dokumente_meta` explizit mitschicken (PATCH-Merge). */
  let preservedDokumenteMeta = /** @type {unknown[]|null} */ (null);
  /**
   * @param {string} montYmd
   * @param {Record<string, unknown>} preserved
   * @returns {Record<string, string>}
   */
  function resolveBeklebungFelderFuerExtra(montYmd, preserved) {
    if (!montYmd || !/^\d{4}-\d{2}-\d{2}$/.test(montYmd)) return {};
    const prevT =
      preserved.beklebung_termin != null ? String(preserved.beklebung_termin).trim().slice(0, 10) : '';
    const prevS = String(
      preserved.beklebungstermin_status != null ? preserved.beklebungstermin_status : '',
    )
      .trim()
      .toLowerCase();
    const psB = prevS === 'bestaetigt' || prevS === 'bestätigt';
    let st = 'geplant';
    if (psB && prevT === montYmd) st = 'bestaetigt';
    else if (psB && prevT && prevT !== montYmd) st = 'verschoben';
    else if (prevS === 'verschoben') st = 'verschoben';
    else if (prevS === 'geplant') st = 'geplant';
    return { beklebung_termin: montYmd, beklebungstermin_status: st };
  }
  /** @type {Record<string, { paket?: string, service?: number, ae?: number, rabatt?: number }>} */
  let posByFz = {};
  /** @type {Record<string, { kennung?: string, typ?: string }>} */
  let fzMetaById = {};
  /** @type {Record<string, { buchbar?: boolean, erlaubt?: boolean|null, konflikt_hinweis?: string, sperrgrund_text?: string, flaechen_pruefung_unsicher?: boolean }>} */
  let fzFlaechenById = {};

  function syncPosByFzKeys() {
    const next = {};
    for (const fid of selectedFz) {
      next[fid] = { ...(posByFz[fid] || {}) };
      if (!next[fid].paket && selectedPaket) next[fid].paket = selectedPaket;
      if (next[fid].ae == null || Number.isNaN(next[fid].ae)) next[fid].ae = 0;
      if (next[fid].rabatt == null || Number.isNaN(next[fid].rabatt)) next[fid].rabatt = 0;
    }
    posByFz = next;
  }

  /**
   * @param {string} ymd
   * @returns {string}
   */
  function formatDeShortFromYmd(ymd) {
    const s = String(ymd || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
    const d = new Date(`${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' });
  }

  /** Laufzeit (Monate) + Auftragsende aus Start und Dropdown — Quelle für API-Enddatum. */
  function applyLaufzeitEndeAuswahl() {
    const monthsRaw =
      elLzSelect && elLzSelect.value
        ? parseInt(String(elLzSelect.value), 10)
        : elLz && elLz.value
          ? parseInt(String(elLz.value), 10)
          : 24;
    const m = Number.isFinite(monthsRaw) && monthsRaw >= 1 ? monthsRaw : 24;
    if (elLz) elLz.value = String(m);
    const s = elStart && elStart.value ? elStart.value.trim().slice(0, 10) : '';
    const endYmd = s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? addMonthsToYmd(s, m) : '';
    if (elEnd) elEnd.value = endYmd;
    if (elEndDisp instanceof HTMLInputElement) {
      elEndDisp.value = endYmd ? formatDeShortFromYmd(endYmd) : '—';
    }
  }

  /** @returns {Record<string, unknown>|undefined} */
  function buildAbrechnungVorschauExtra() {
    return undefined;
  }

  /** Monatlicher Netto-Gesamtwert aus letzter Kalkulation (für `preis_monat_pflicht` im Extra-JSON). */
  function extraPreisMonatPflicht() {
    const summ = lastKalk && lastKalk.summen && typeof lastKalk.summen === 'object' ? lastKalk.summen : null;
    const v = summ && summ.netto_monat_gesamt != null ? Number(summ.netto_monat_gesamt) : NaN;
    return Number.isFinite(v) ? v : undefined;
  }

  function syncProjektRo() {
    if (!(elProjektRo instanceof HTMLElement)) return;
    const p =
      typeof ctx.getProjectLabel === 'function'
        ? String(ctx.getProjectLabel() || '').trim()
        : ctx.getProjectId().trim();
    elProjektRo.textContent = p || '—';
  }

  function syncSec4PaketName() {
    if (!(elSec4PaketName instanceof HTMLElement)) return;
    elSec4PaketName.textContent = selectedPaket.trim() || '—';
  }

  function updateVorschauPlatzhalter() {
    /* Vorschau-Zeilen entfallen im Vertriebs-Overlay; Logik kann später angebunden werden. */
  }

  function fillPartnerSelect() {
    if (!elPartner) return;
    const pm =
      formMeta && formMeta.preisgrundlagen && Array.isArray(formMeta.preisgrundlagen.partner_modelle)
        ? formMeta.preisgrundlagen.partner_modelle
        : [];
    elPartner.innerHTML = pm
      .map(m => {
        const id = m && m.id != null ? String(m.id) : '';
        const lab = m && m.label != null ? String(m.label) : id;
        if (!id) return '';
        return `<option value="${esc(id)}">${esc(lab)}</option>`;
      })
      .join('');
    const def = formMeta && formMeta.preisgrundlagen && formMeta.preisgrundlagen.default_modell_id;
    if (def) {
      const ds = String(def);
      if ([...elPartner.options].some(o => o.value === ds)) elPartner.value = ds;
    }
  }

  function fmtEuro(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return `${x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }

  function renderPreisTable() {
    if (!elPreisWrap) return;
    if (!selectedFz.length) {
      elPreisWrap.innerHTML =
        '<p class="fusa-wiz__hint" style="padding:10px 12px;margin:0;">Fahrzeuge auswählen — dann erscheinen die Preiszeilen.</p>';
      if (elPreisTotals instanceof HTMLElement) elPreisTotals.textContent = '';
      return;
    }
    if (!preiseOk) {
      elPreisWrap.innerHTML =
        '<p class="fusa-wiz__hint" style="padding:10px 12px;margin:0;">Preisfelder sind ohne Recht <code>fusa.preise</code> nicht editierbar.</p>';
      if (elPreisTotals instanceof HTMLElement) elPreisTotals.textContent = '';
      return;
    }
    const typLab = elTyp && elTyp.value ? elTyp.value.trim() : '';
    const block = paketBlockForTyp(typLab);
    const pakete = block && Array.isArray(block.pakete) ? block.pakete : [];
    const posRows = lastKalk && Array.isArray(lastKalk.positionen) ? lastKalk.positionen : [];
    const depotLab = elDepot && elDepot.value ? elDepot.value.trim() : '';
    const rows = selectedFz
      .map(fid => {
        const p = posRows.find(x => x && String(x.fahrzeug_id) === fid) || {};
        const meta = fzMetaById[fid] || {};
        const kenn = meta.kennung != null ? String(meta.kennung) : fid.slice(0, 8);
        const rowDepot =
          meta.depot != null && String(meta.depot).trim() ? String(meta.depot).trim() : depotLab || '—';
        const st = posByFz[fid] || {};
        const pakVal = st.paket || selectedPaket || (p.paket != null ? String(p.paket) : '');
        const svcRaw = st.service != null && Number.isFinite(st.service) ? st.service : p.service_preis_monat;
        const svcStr = svcRaw != null && Number.isFinite(Number(svcRaw)) ? String(svcRaw) : '';
        const ae = st.ae != null ? st.ae : p.ae_prozent ?? 0;
        const rb = st.rabatt != null ? st.rabatt : p.rabatt_prozent ?? 0;
        const pakOpts = pakete
          .map(pk => {
            const n = pk && pk.name != null ? String(pk.name) : '';
            if (!n) return '';
            const sel = n === pakVal ? ' selected' : '';
            return `<option value="${esc(n)}"${sel}>${esc(n)}</option>`;
          })
          .join('');
        return `<tr data-fusa-wiz-preis-row="${esc(fid)}">
          <td><strong>${esc(kenn)}</strong></td>
          <td>${esc(rowDepot)}</td>
          <td><select class="fusa-wiz__psel" data-fusa-wiz-pak-fz="${esc(fid)}">${pakOpts}</select></td>
          <td><input class="fusa-wiz__pi" type="number" min="0" step="0.01" data-fusa-wiz-svc-fz="${esc(fid)}" value="${esc(svcStr)}" /></td>
          <td><input class="fusa-wiz__pi" type="number" min="0" max="100" step="0.1" data-fusa-wiz-ae-fz="${esc(fid)}" value="${esc(String(ae))}" /></td>
          <td><input class="fusa-wiz__pi" type="number" min="0" max="100" step="0.1" data-fusa-wiz-rb-fz="${esc(fid)}" value="${esc(String(rb))}" /></td>
          <td>${fmtEuro(p.netto_monat)}</td>
          <td>${fmtEuro(p.intern_monat)}</td>
          <td>${fmtEuro(p.cc_betrag)}</td>
          <td>${fmtEuro(p.partner_betrag)}</td>
        </tr>`;
      })
      .join('');
    elPreisWrap.innerHTML = `<table class="fusa-wiz-preis-table"><thead><tr>
      <th>Fahrzeug</th><th>Depot</th><th>Paket</th><th>Service / Monat</th><th>AE %</th><th>Rabatt %</th>
      <th>Netto / Monat</th><th>Intern / Monat</th><th>CC</th><th>Partner</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
    elPreisWrap.querySelectorAll('[data-fusa-wiz-pak-fz]').forEach(el => {
      el.addEventListener('change', () => {
        const id = el.getAttribute('data-fusa-wiz-pak-fz');
        if (!id || !posByFz[id]) return;
        posByFz[id].paket = el instanceof HTMLSelectElement ? el.value.trim() : '';
        scheduleKalkUndFahrzeuge();
      });
    });
    elPreisWrap.querySelectorAll('[data-fusa-wiz-svc-fz]').forEach(el => {
      el.addEventListener('input', () => {
        const id = el.getAttribute('data-fusa-wiz-svc-fz');
        if (!id) return;
        if (!posByFz[id]) posByFz[id] = {};
        const v = el instanceof HTMLInputElement ? Number.parseFloat(el.value.replace(',', '.')) : NaN;
        posByFz[id].service = Number.isFinite(v) ? v : undefined;
        scheduleKalkOnly();
      });
    });
    elPreisWrap.querySelectorAll('[data-fusa-wiz-ae-fz]').forEach(el => {
      el.addEventListener('input', () => {
        const id = el.getAttribute('data-fusa-wiz-ae-fz');
        if (!id) return;
        if (!posByFz[id]) posByFz[id] = {};
        const v = el instanceof HTMLInputElement ? Number.parseFloat(el.value.replace(',', '.')) : NaN;
        posByFz[id].ae = Number.isFinite(v) ? v : 0;
        scheduleKalkOnly();
      });
    });
    elPreisWrap.querySelectorAll('[data-fusa-wiz-rb-fz]').forEach(el => {
      el.addEventListener('input', () => {
        const id = el.getAttribute('data-fusa-wiz-rb-fz');
        if (!id) return;
        if (!posByFz[id]) posByFz[id] = {};
        const v = el instanceof HTMLInputElement ? Number.parseFloat(el.value.replace(',', '.')) : NaN;
        posByFz[id].rabatt = Number.isFinite(v) ? v : 0;
        scheduleKalkOnly();
      });
    });
    if (elPreisTotals instanceof HTMLElement) {
      const s = lastKalk && lastKalk.summen && typeof lastKalk.summen === 'object' ? lastKalk.summen : null;
      if (!s) {
        elPreisTotals.textContent = '';
      } else {
        elPreisTotals.innerHTML = `Σ Netto / Monat: <strong>${fmtEuro(s.netto_monat_gesamt)}</strong> · Intern / Monat: ${fmtEuro(s.intern_monat_gesamt)} · CC: ${fmtEuro(s.cc_gesamt_monat)} · Partner: ${fmtEuro(s.partner_gesamt_monat)} · <strong>Auftragswert Zeitraum: ${fmtEuro(s.auftragswert_gesamt)}</strong>`;
      }
    }
  }

  function canSubmitWizard() {
    if (!ctx.getProjectId().trim()) return false;
    const firma_id = elFirma && elFirma.value ? elFirma.value.trim() : '';
    const title = elTitle && elTitle.value ? elTitle.value.trim() : '';
    const termin = elStart && elStart.value ? elStart.value.trim() : '';
    const termin_ende = elEnd && elEnd.value ? elEnd.value.trim() : '';
    const typ = elTyp && elTyp.value ? elTyp.value.trim() : '';
    const depot = elDepot && elDepot.value ? elDepot.value.trim() : '';
    const paket = selectedPaket.trim();
    const lzRaw = elLz && elLz.value ? parseInt(String(elLz.value), 10) : NaN;
    const mont = elMontage && elMontage.value ? elMontage.value.trim() : '';
    const abr = elAbr && elAbr.value ? elAbr.value.trim() : '';

    if (!firma_id || !title || !termin || !termin_ende || !typ || !depot || !paket) return false;
    if (!mont || !abr) return false;
    if (!Number.isFinite(lzRaw) || lzRaw < 1) return false;
    if (termin.slice(0, 10) > termin_ende.slice(0, 10)) return false;
    if (selectedFz.length === 0) return false;
    const ek = lastKalk && lastKalk.erlaubte_konfiguration;
    if (ek && typeof ek === 'object' && ek.gueltig === false) return false;
    const summ = lastKalk && lastKalk.summen;
    const netGes = summ && summ.netto_monat_gesamt != null ? Number(summ.netto_monat_gesamt) : NaN;
    if (!summ || !Number.isFinite(netGes)) return false;
    const posLen = lastKalk && Array.isArray(lastKalk.positionen) ? lastKalk.positionen.length : 0;
    if (posLen !== selectedFz.length) return false;
    for (const fid of selectedFz) {
      const fl = fzFlaechenById[fid];
      if (fl && fl.buchbar === false) return false;
    }
    return true;
  }

  function syncSubmitEnabled() {
    const btn = q('[data-fusa-wiz-submit]');
    const cancel = q('[data-fusa-wiz-cancel]');
    const draft = q('[data-fusa-wiz-draft]');
    if (!(btn instanceof HTMLButtonElement)) return;
    if (saving || savingDraft) {
      btn.disabled = true;
      btn.textContent = saving || savingDraft ? 'Wird gespeichert…' : SUBMIT_LABEL;
      if (cancel instanceof HTMLButtonElement) cancel.disabled = true;
      if (draft instanceof HTMLButtonElement) draft.disabled = true;
      return;
    }
    btn.textContent = SUBMIT_LABEL;
    if (cancel instanceof HTMLButtonElement) cancel.disabled = false;
    if (draft instanceof HTMLButtonElement) {
      draft.disabled = !ctx.getProjectId().trim();
    }
    btn.disabled = !canSubmitWizard();
  }

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  if (elStart) elStart.value = todayIso();
  if (elLzSelect && !elLzSelect.value) elLzSelect.value = '24';
  applyLaufzeitEndeAuswahl();

  /** Firmen — alphabetisch wie in Listen, stabile Auswahl über value */
  if (elFirma) {
    try {
      const opts = await buildFirmenSelectOptions();
      opts.sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }));
      elFirma.innerHTML =
        opts.length === 0
          ? '<option value="">Keine Firmen im Stamm</option>'
          : `<option value="">Firma wählen…</option>${opts.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}`;
    } catch {
      elFirma.innerHTML = '<option value="">Firmen konnten nicht geladen werden</option>';
    }
    elFirma.addEventListener('change', () => {
      syncSubmitEnabled();
    });
  }

  /** Form-Meta */
  try {
    const data = await apiFetch(API_ROUTES.fusa.auftraegeFormMeta);
    /** Nach `unwrapEnvelope`: Payload = `{ form_meta: … }` (nicht `{ data: { form_meta } }`). */
    let fm = null;
    if (data && typeof data === 'object') {
      const d = /** @type {any} */ (data);
      if (d.form_meta != null && typeof d.form_meta === 'object') {
        fm = d.form_meta;
      } else if (d.data != null && typeof d.data === 'object' && d.data.form_meta != null && typeof d.data.form_meta === 'object') {
        fm = d.data.form_meta;
      }
    }
    formMeta = fm != null && typeof fm === 'object' ? fm : null;
    if (!formMeta || typeof formMeta !== 'object') throw new Error('Ungültige form-meta Antwort.');
    if (elMetaErr instanceof HTMLElement) {
      elMetaErr.hidden = true;
      elMetaErr.textContent = '';
    }
  } catch (e) {
    if (elMetaErr instanceof HTMLElement) {
      elMetaErr.hidden = false;
      const st = e && typeof e === 'object' && 'status' in e ? /** @type {any} */ (e).status : undefined;
      elMetaErr.textContent =
        st === 404
          ? 'Stammdaten (form-meta) nicht erreichbar (HTTP 404). Typische Ursache: Backend läuft noch mit älterem Code — bitte Node-Prozess neu starten, damit GET /api/v1/fusa/auftraege/form-meta registriert ist.'
          : formatApiErrorForUi(e);
    }
    formMeta = null;
  }

  function fillTypDepotFromMeta() {
    if (!elTyp || !elDepot) return;
    if (!formMeta) {
      elTyp.innerHTML = '<option value="">— Stammdaten nicht geladen —</option>';
      elDepot.innerHTML = '<option value="">— Stammdaten nicht geladen —</option>';
      return;
    }
    const typen = Array.isArray(formMeta.fahrzeugtypen) ? formMeta.fahrzeugtypen : [];
    elTyp.innerHTML =
      `<option value="">— Typ wählen —</option>` +
      typen
        .map(t => {
          const lab = t && t.label != null ? String(t.label) : '';
          if (!lab) return '';
          return `<option value="${esc(lab)}">${esc(lab)}</option>`;
        })
        .join('');
    const depots = Array.isArray(formMeta.depotoptionen) ? formMeta.depotoptionen : [];
    elDepot.innerHTML =
      `<option value="">— Depot wählen —</option>` +
      depots.map(d => `<option value="${esc(String(d))}">${esc(String(d))}</option>`).join('');
  }
  fillTypDepotFromMeta();
  fillPartnerSelect();

  async function hydrateFromExistingAuftragIfEdit() {
    if (!isEdit) return;
    try {
      const ar = await apiFetch(`${API_ROUTES.fusa.auftraege}/${encodeURIComponent(editAuftragId)}`);
      const row =
        ar && typeof ar === 'object' && /** @type {any} */ (ar).auftrag && typeof /** @type {any} */ (ar).auftrag === 'object'
          ? /** @type {any} */ (ar).auftrag
          : null;
      if (!row) throw new Error('Auftrag nicht geladen.');
      const extra = parseJsonObjLoose(row.fusa_extra_json);
      preservedDokumenteMeta = Array.isArray(extra.dokumente_meta) ? [...extra.dokumente_meta] : null;
      preservedWerkstattBeklebung = {};
      if (extra.beklebungstermin_status != null && String(extra.beklebungstermin_status).trim() !== '') {
        preservedWerkstattBeklebung.beklebungstermin_status = extra.beklebungstermin_status;
      }
      if (extra.beklebung_termin != null && String(extra.beklebung_termin).trim() !== '') {
        preservedWerkstattBeklebung.beklebung_termin = extra.beklebung_termin;
      }
      if (extra.montage_bestaetigt_termin != null && String(extra.montage_bestaetigt_termin).trim() !== '') {
        preservedWerkstattBeklebung.montage_bestaetigt_termin = extra.montage_bestaetigt_termin;
      }
      if (elTitle && row.title != null) elTitle.value = String(row.title);
      if (elFirma && row.fusa_kunde_id != null && String(row.fusa_kunde_id).trim()) {
        const fid = String(row.fusa_kunde_id).trim();
        if ([...elFirma.options].some(o => o.value === fid)) elFirma.value = fid;
      }
      const apEx = extra.ansprechpartner != null ? String(extra.ansprechpartner).trim() : '';
      const apRow = row.kunde_ansprechpartner != null ? String(row.kunde_ansprechpartner).trim() : '';
      if (elAp) elAp.value = apEx || apRow;
      const t0 = row.termin != null ? String(row.termin).trim().slice(0, 10) : '';
      const t1 = row.termin_ende != null ? String(row.termin_ende).trim().slice(0, 10) : '';
      if (elStart && t0) elStart.value = t0;
      if (elEnd && t1) elEnd.value = t1;
      const lzStored = Math.floor(Number(extra.laufzeit_monate));
      const lzGuess = t0 && t1 ? schaetzeLaufzeitMonateAusZeitraum(t0, t1) : 24;
      const lzUse = Number.isFinite(lzStored) && lzStored >= 1 ? lzStored : lzGuess;
      if (elLz) elLz.value = String(lzUse);
      if (elLzSelect && [...elLzSelect.options].some(o => o.value === String(lzUse))) elLzSelect.value = String(lzUse);
      else if (elLzSelect) elLzSelect.value = '24';
      if (elEndDisp instanceof HTMLInputElement && t1 && /^\d{4}-\d{2}-\d{2}$/.test(t1.slice(0, 10))) {
        elEndDisp.value = formatDeShortFromYmd(t1.slice(0, 10));
      }
      const typEx = extra.fahrzeugtyp != null ? String(extra.fahrzeugtyp).trim() : '';
      if (elTyp && typEx && [...elTyp.options].some(o => o.value === typEx)) elTyp.value = typEx;
      const depEx = extra.depot != null ? String(extra.depot).trim() : '';
      if (elDepot && depEx && [...elDepot.options].some(o => o.value === depEx)) elDepot.value = depEx;
      const pm =
        extra.partnermodell != null
          ? String(extra.partnermodell).trim()
          : extra.partner_modell_id != null
            ? String(extra.partner_modell_id).trim()
            : '';
      fillPartnerSelect();
      if (elPartner && pm && [...elPartner.options].some(o => o.value === pm)) elPartner.value = pm;
      /** @type {string[]} */
      let fzIds = [];
      try {
        const raw = row.fusa_fahrzeug_ids != null ? String(row.fusa_fahrzeug_ids) : '';
        const j = raw ? JSON.parse(raw) : [];
        if (Array.isArray(j)) fzIds = j.map(x => (x != null ? String(x).trim() : '')).filter(Boolean);
      } catch {
        fzIds = [];
      }
      selectedFz = fzIds;
      const pp = Array.isArray(extra.preispositionen) ? /** @type {any[]} */ (extra.preispositionen) : [];
      posByFz = {};
      for (const pr of pp) {
        if (!pr || typeof pr !== 'object') continue;
        const fid = pr.fahrzeug_id != null ? String(pr.fahrzeug_id).trim() : '';
        if (!fid) continue;
        posByFz[fid] = {
          paket: pr.paket != null ? String(pr.paket) : '',
          service:
            pr.service_preis_monat != null && Number.isFinite(Number(pr.service_preis_monat))
              ? Number(pr.service_preis_monat)
              : undefined,
          ae: pr.ae_prozent != null && Number.isFinite(Number(pr.ae_prozent)) ? Number(pr.ae_prozent) : 0,
          rabatt: pr.rabatt_prozent != null && Number.isFinite(Number(pr.rabatt_prozent)) ? Number(pr.rabatt_prozent) : 0,
        };
      }
      syncPosByFzKeys();
      const pakEx = extra.paket != null ? String(extra.paket).trim() : '';
      renderPaketChips(pakEx);
      const summ = extra.summen && typeof extra.summen === 'object' ? /** @type {any} */ (extra.summen) : null;
      if (summ && pp.length > 0) {
        lastKalk = {
          enddatum: t1 || undefined,
          positionen: pp,
          summen: summ,
          preis_monat:
            summ.netto_monat_gesamt != null && Number.isFinite(Number(summ.netto_monat_gesamt))
              ? Number(summ.netto_monat_gesamt)
              : null,
          gesamtpreis:
            summ.auftragswert_gesamt != null && Number.isFinite(Number(summ.auftragswert_gesamt))
              ? Number(summ.auftragswert_gesamt)
              : null,
          erlaubte_konfiguration: { gueltig: true },
          preise_verdeckt: !preiseOk,
        };
        skipInitialKalkAfterHydrate = true;
      } else {
        skipInitialKalkAfterHydrate = false;
      }
      const bekT = extra.beklebung_termin != null ? String(extra.beklebung_termin).trim().slice(0, 10) : '';
      const mont = extra.montage_wunschtermin != null ? String(extra.montage_wunschtermin).trim().slice(0, 10) : '';
      if (elMontage) {
        if (bekT && /^\d{4}-\d{2}-\d{2}$/.test(bekT)) elMontage.value = bekT;
        else if (mont) elMontage.value = mont;
        else if (t0) elMontage.value = t0;
        const st = row.status != null ? String(row.status).toLowerCase() : '';
        const entwurf = extra.entwurf === true || st.includes('entwurf');
        if (entwurf) elMontage.removeAttribute('required');
      }
      if (elZeit && extra.montage_wunschzeit != null) elZeit.value = String(extra.montage_wunschzeit);
      if (elWsLabel && extra.werkstatt_label != null) elWsLabel.value = String(extra.werkstatt_label);
      if (elWsMail && extra.werkstatt_email != null) elWsMail.value = String(extra.werkstatt_email);
      const abr = extra.abrechnungsart != null ? String(extra.abrechnungsart).trim() : '';
      if (elAbr && abr && [...elAbr.options].some(o => o.value === abr)) elAbr.value = abr;
      if (elNotiz && extra.notiz != null) elNotiz.value = String(extra.notiz);
      const aufNrEl = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-auftrag-nr]'));
      if (aufNrEl && row.id != null) aufNrEl.value = String(row.id);
      if (elRefCreated instanceof HTMLElement) {
        const ca = row.created_at != null ? String(row.created_at).trim() : '';
        elRefCreated.textContent = ca ? (ca.length >= 16 ? ca.slice(0, 16).replace('T', ' ') : ca) : '—';
      }
      if (elRefId instanceof HTMLElement && row.id != null) elRefId.textContent = String(row.id);
    } catch (e) {
      skipInitialKalkAfterHydrate = false;
      if (elMetaErr instanceof HTMLElement) {
        elMetaErr.hidden = false;
        elMetaErr.textContent = formatApiErrorForUi(e);
      }
    }
  }

  await hydrateFromExistingAuftragIfEdit();
  if (!isEdit) renderPaketChips();
  else if (!selectedPaket) renderPaketChips();

  syncProjektRo();
  applyLaufzeitEndeAuswahl();
  syncSec4PaketName();
  syncSubmitEnabled();

  function werkstattFromDepot(depotName) {
    const ws = formMeta && typeof formMeta === 'object' ? formMeta.werkstatt_je_depot : null;
    if (!ws || typeof ws !== 'object' || !depotName) return { label: '', mail: '' };
    const row = /** @type {any} */ (ws)[depotName];
    if (!row || typeof row !== 'object') return { label: '', mail: '' };
    return {
      label: row.label != null ? String(row.label) : '',
      mail: row.mail != null ? String(row.mail) : '',
    };
  }

  function syncWerkstattFields() {
    const dep = elDepot && elDepot.value ? elDepot.value.trim() : '';
    const w = werkstattFromDepot(dep);
    if (elWsLabel) elWsLabel.value = w.label || dep;
    if (elWsMail) elWsMail.value = w.mail || '';
  }

  function paketBlockForTyp(typLabel) {
    const blocks = formMeta && Array.isArray(formMeta.pakete_je_typ) ? formMeta.pakete_je_typ : [];
    return blocks.find(b => b && String(b.fahrzeugtyp_label || '') === typLabel) || null;
  }

  /**
   * @param {string} [preferredPaketName] gespeichertes Paket beim Edit wieder markieren
   */
  function renderPaketChips(preferredPaketName) {
    if (!elPaketChips) return;
    const typ = elTyp && elTyp.value ? elTyp.value.trim() : '';
    elPaketChips.innerHTML = '';
    selectedPaket = '';
    setPaketInfo('');
    const pref = preferredPaketName != null ? String(preferredPaketName).trim() : '';
    if (!typ || !formMeta) {
      elPaketChips.innerHTML = '<span class="fusa-wiz__hint">Fahrzeugtyp wählen — dann stehen die Werbepakete zur Auswahl.</span>';
      syncSec4PaketName();
      return;
    }
    const block = paketBlockForTyp(typ);
    const pakete = block && Array.isArray(block.pakete) ? block.pakete : [];
    if (!pakete.length) {
      elPaketChips.innerHTML = '<span class="fusa-wiz__hint">Keine Pakete für diesen Typ hinterlegt.</span>';
      syncSec4PaketName();
      return;
    }
    const names = pakete.map(p => (p && p.name != null ? String(p.name) : '')).filter(Boolean);
    const matchPref = pref && names.includes(pref);
    for (const p of pakete) {
      const name = p && p.name != null ? String(p.name) : '';
      if (!name) continue;
      const preis =
        preiseOk && p && p.preis_monat_netto != null && Number.isFinite(Number(p.preis_monat_netto))
          ? `${Number(p.preis_monat_netto).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} € / Monat (netto)`
          : '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fusa-wiz__paket-btn';
      btn.setAttribute('data-fusa-wiz-paket', name);
      if (matchPref && name === pref) {
        btn.classList.add('fusa-wiz__paket-btn--active');
        selectedPaket = name;
      }
      const nm = document.createElement('span');
      nm.className = 'fusa-wiz__paket-btn-name';
      nm.textContent = name;
      btn.appendChild(nm);
      if (preis) {
        const pr = document.createElement('span');
        pr.className = 'fusa-wiz__paket-btn-preis';
        pr.textContent = preis;
        btn.appendChild(pr);
      }
      elPaketChips.appendChild(btn);
    }
    if (selectedPaket) setPaketInfo(selectedPaket);
    syncSec4PaketName();
  }

  function setPaketInfo(name) {
    if (!elPaketInfo) return;
    if (!name || !formMeta) {
      elPaketInfo.textContent = '';
      elPaketInfo.hidden = true;
      return;
    }
    const block = paketBlockForTyp(elTyp?.value?.trim() || '');
    const pakete = block && Array.isArray(block.pakete) ? block.pakete : [];
    const hit = pakete.find(p => p && String(p.name) === name);
    const info = hit && hit.info_einzeilig != null ? String(hit.info_einzeilig).trim() : '';
    if (info) {
      elPaketInfo.textContent = info;
      elPaketInfo.hidden = false;
    } else {
      elPaketInfo.textContent = '';
      elPaketInfo.hidden = true;
    }
  }

  function updateFzSelectionSummary() {
    const el = q('[data-fusa-wiz-fz-sel]');
    if (!(el instanceof HTMLElement)) return;
    if (!formMeta) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    const n = selectedFz.length;
    if (n === 0) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = `${n} Fahrzeug${n === 1 ? '' : 'e'} ausgewählt`;
  }

  function updateFooterSummary() {
    if (!(elFooterSummary instanceof HTMLElement)) return;
    const n = selectedFz.length;
    const summ = lastKalk && lastKalk.summen && typeof lastKalk.summen === 'object' ? lastKalk.summen : null;
    const net = summ && summ.netto_monat_gesamt != null ? Number(summ.netto_monat_gesamt) : NaN;
    const intern = summ && summ.intern_monat_gesamt != null ? Number(summ.intern_monat_gesamt) : NaN;
    const pv = lastKalk && lastKalk.preise_verdeckt === true;
    if (n === 0) {
      elFooterSummary.textContent = 'Keine Fahrzeuge gewählt.';
      return;
    }
    let t = `✓ ${n} Fahrzeug${n === 1 ? '' : 'e'}`;
    const pos = lastKalk && Array.isArray(lastKalk.positionen) ? lastKalk.positionen : [];
    let svcSum = 0;
    let svcOk = pos.length > 0;
    for (const pr of pos) {
      const v = pr && pr.service_preis_monat != null ? Number(pr.service_preis_monat) : NaN;
      if (!Number.isFinite(v)) {
        svcOk = false;
        break;
      }
      svcSum += v;
    }
    if (!pv && svcOk && Number.isFinite(svcSum)) t += ` · Service ${fmtEuro(svcSum)}/Mo.`;
    if (!pv && Number.isFinite(net)) t += ` · Netto nach Abzügen ${fmtEuro(net)}/Mo.`;
    if (!pv && Number.isFinite(intern)) t += ` · Intern ${fmtEuro(intern)}/Mo.`;
    elFooterSummary.textContent = t;
  }

  function updateKpiStrip() {
    const kfz = q('[data-fusa-wiz-kpi-fz]');
    if (!kfz) return;
    const klzText = q('[data-fusa-wiz-kpi-lz-text]');
    const kmon = q('[data-fusa-wiz-kpi-monat]');
    const kges = q('[data-fusa-wiz-kpi-gesamt]');
    const n = selectedFz.length;
    if (kfz) kfz.textContent = String(n);
    const lz = elLz && elLz.value ? Math.max(1, parseInt(String(elLz.value), 10) || 24) : 24;
    const endY = elEnd && elEnd.value ? elEnd.value.trim().slice(0, 10) : '';
    if (klzText) {
      klzText.textContent =
        endY && /^\d{4}-\d{2}-\d{2}$/.test(endY) ? `${lz} Monate bis ${formatDeShortFromYmd(endY)}` : `${lz} Monate`;
    }
    const pk = lastKalk && typeof lastKalk === 'object';
    const summ = pk && lastKalk.summen && typeof lastKalk.summen === 'object' ? lastKalk.summen : null;
    const pmRaw =
      summ && summ.netto_monat_gesamt != null
        ? Number(summ.netto_monat_gesamt)
        : pk && lastKalk.preis_monat != null
          ? Number(lastKalk.preis_monat)
          : NaN;
    const gesRaw =
      summ && summ.auftragswert_gesamt != null
        ? Number(summ.auftragswert_gesamt)
        : pk && lastKalk.gesamtpreis != null
          ? Number(lastKalk.gesamtpreis)
          : NaN;
    const pv = pk && lastKalk.preise_verdeckt === true;
    if (kmon) {
      if (pv || !Number.isFinite(pmRaw)) kmon.textContent = '—';
      else kmon.textContent = `${pmRaw.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    }
    if (kges) {
      if (pv || !Number.isFinite(gesRaw)) kges.textContent = '—';
      else kges.textContent = `${gesRaw.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    }
    updateFooterSummary();
  }

  async function runKalkulation() {
    lastKalk = null;
    applyLaufzeitEndeAuswahl();
    if (elKalkInline) {
      elKalkInline.textContent = '';
      elKalkInline.classList.remove('fusa-wiz__hint--loading');
    }
    const start = elStart && elStart.value ? elStart.value.trim() : '';
    const lzRaw = elLz && elLz.value ? parseInt(String(elLz.value), 10) : NaN;
    const lz = Number.isFinite(lzRaw) && lzRaw >= 1 ? lzRaw : 0;
    const typ = elTyp && elTyp.value ? elTyp.value.trim() : '';
    const paket = selectedPaket.trim();
    const fzCount = Math.max(1, selectedFz.length);
    const showLoader = !!(start && lz && typ && paket);
    if (showLoader && elKalkInline) {
      elKalkInline.textContent = 'Berechne Auftragsende und Kennzahlen…';
      elKalkInline.classList.add('fusa-wiz__hint--loading');
    }
    if (!start || !lz || !typ || !paket) {
      updateKpiStrip();
      renderPreisTable();
      syncSubmitEnabled();
      if (elKalkInline) elKalkInline.classList.remove('fusa-wiz__hint--loading');
      return;
    }
    try {
      syncPosByFzKeys();
      const partnerId = elPartner && elPartner.value ? elPartner.value.trim() : '';
      const positionen = selectedFz.map(fid => ({
        fahrzeug_id: fid,
        paket: posByFz[fid]?.paket || paket,
        service_preis_monat: posByFz[fid]?.service,
        ae_prozent: posByFz[fid]?.ae,
        rabatt_prozent: posByFz[fid]?.rabatt,
      }));
      const body = {
        startdatum: start,
        laufzeit_monate: lz,
        fahrzeugtyp: typ,
        paket,
        fahrzeuganzahl: fzCount,
        partner_modell_id: partnerId || undefined,
        positionen,
      };
      const pid = ctx.getProjectId().trim();
      const res = await apiFetch(API_ROUTES.fusa.auftraegeKalkulation, {
        method: 'POST',
        body,
        headers: { 'x-project-id': pid },
      });
      const k = res?.kalkulation ?? null;
      lastKalk = k != null && typeof k === 'object' ? k : null;
      if (elKalkInline) {
        elKalkInline.classList.remove('fusa-wiz__hint--loading');
        if (lastKalk) {
          const ek = lastKalk.erlaubte_konfiguration;
          if (ek && typeof ek === 'object' && ek.gueltig === false && Array.isArray(ek.gruende)) {
            elKalkInline.textContent = `Hinweis: ${ek.gruende.join(', ')}`;
          } else {
            elKalkInline.textContent = '';
          }
        }
      }
    } catch (e) {
      lastKalk = null;
      if (elKalkInline) {
        elKalkInline.classList.remove('fusa-wiz__hint--loading');
        elKalkInline.textContent = formatApiErrorForUi(e);
      }
    }
    updateKpiStrip();
    renderPreisTable();
    syncSubmitEnabled();
  }

  async function runVerfuegbareFahrzeuge() {
    if (!elFzList || !elFzHint) return;
    const pid = ctx.getProjectId().trim();
    const start = elStart && elStart.value ? elStart.value.trim() : '';
    const end = elEnd && elEnd.value ? elEnd.value.trim() : '';
    const typ = elTyp && elTyp.value ? elTyp.value.trim() : '';
    const depot = elDepot && elDepot.value ? elDepot.value.trim() : '';
    const paket = selectedPaket.trim();
    if (elFzErr instanceof HTMLElement) {
      elFzErr.hidden = true;
      elFzErr.textContent = '';
    }
    if (!pid || !start || !end || !typ || !depot) {
      elFzList.innerHTML =
        '<p class="fusa-wiz__hint" style="padding:10px 12px;margin:0;">Projekt, Zeitraum, Fahrzeugtyp und Depot — danach erscheint die Fahrzeugliste.</p>';
      elFzHint.textContent = '';
      updateFzSelectionSummary();
      syncSubmitEnabled();
      return;
    }
    elFzHint.textContent = 'Suche freie Fahrzeuge für Zeitraum und Auswahl…';
    try {
      /** @type {Record<string, unknown>} */
      const body = {
        project_id: pid,
        startdatum: start,
        enddatum: end,
        fahrzeugtyp: typ,
        depot,
      };
      if (paket) body.paket = paket;
      if (isEdit && editAuftragId) body.exclude_auftrag_id = editAuftragId;
      if (elSamePaket && !elSamePaket.checked) {
        syncPosByFzKeys();
        /** @type {Record<string, string>} */
        const ppm = {};
        for (const fid of selectedFz) {
          const pRow = posByFz[fid]?.paket || paket;
          if (fid && pRow) ppm[fid] = String(pRow);
        }
        if (Object.keys(ppm).length) body.paket_pro_fahrzeug = ppm;
      }
      /** POST + JSON; `x-project-id` = Wizard-Projekt (nicht nur Cockpit-Auswahl), damit Header zu `project_id` im Body passt. */
      const data = await apiFetch(API_ROUTES.fusa.auftraegeVerfuegbareFahrzeuge, {
        method: 'POST',
        body,
        headers: { 'x-project-id': pid },
      });
      /** Nach `unwrapEnvelope`: Nutzdaten direkt mit `fahrzeuge` (nicht `data.fahrzeuge`). */
      let fzPayload = null;
      if (data && typeof data === 'object') {
        const d = /** @type {any} */ (data);
        if (Array.isArray(d.fahrzeuge)) {
          fzPayload = d;
        } else if (d.data && typeof d.data === 'object' && Array.isArray(d.data.fahrzeuge)) {
          fzPayload = d.data;
        }
      }
      const list = fzPayload && Array.isArray(fzPayload.fahrzeuge) ? fzPayload.fahrzeuge : [];
      fzMetaById = Object.fromEntries(
        list
          .map(f => {
            if (!f || f.id == null) return null;
            const id = String(f.id);
            const depRow = f.depot != null ? String(f.depot).trim() : '';
            return /** @type {[string, { kennung?: unknown, typ?: unknown, depot?: string }]} */ ([
              id,
              { kennung: f.kennung, typ: f.typ, depot: depRow },
            ]);
          })
          .filter(Boolean),
      );
      fzFlaechenById = Object.fromEntries(
        list
          .map(f => {
            if (!f || f.id == null) return null;
            const id = String(f.id);
            const buchbar = fahrzeugApiIstBuchbar(f);
            const st =
              f.sperrgrund_text != null && String(f.sperrgrund_text).trim()
                ? String(f.sperrgrund_text).trim()
                : f.konflikt_hinweis != null
                  ? String(f.konflikt_hinweis).trim()
                  : '';
            return [
              id,
              {
                buchbar,
                erlaubt: f.erlaubt == null ? null : Boolean(f.erlaubt),
                konflikt_hinweis: f.konflikt_hinweis != null ? String(f.konflikt_hinweis) : '',
                sperrgrund_text: st,
                flaechen_pruefung_unsicher: !!f.flaechen_pruefung_unsicher,
              },
            ];
          })
          .filter(Boolean),
      );
      const vorherSel = selectedFz.slice();
      selectedFz = selectedFz.filter(id => {
        const hit = list.find(x => x && String(x.id) === id);
        return hit && fahrzeugApiIstBuchbar(hit);
      });
      if (vorherSel.length !== selectedFz.length) {
        syncPosByFzKeys();
      }
      if (!isEdit && prefillFzIds.length) {
        for (const pz of prefillFzIds) {
          const hit = list.find(x => x && String(x.id) === pz);
          if (hit && fahrzeugApiIstBuchbar(hit) && !selectedFz.includes(pz)) {
            selectedFz.push(pz);
          }
        }
        if (prefillFzIds.length) syncPosByFzKeys();
      }
      const nOk = list.filter(f => f && fahrzeugApiIstBuchbar(f)).length;
      const nBlock = list.filter(f => f && !fahrzeugApiIstBuchbar(f)).length;
      elFzHint.textContent =
        list.length === 0
          ? 'Keine Fahrzeuge für Typ und Standort gefunden.'
          : `${list.length} Fahrzeug${list.length === 1 ? '' : 'e'} passen zu Typ/Depot${
              paket && nBlock > 0
                ? ` — ${nOk} buchbar, ${nBlock} nicht buchbar (Grund je Zeile; nicht wählbar).`
                : ' — Mehrfachauswahl möglich.'
            }`;
      if (list.length === 0) {
        elFzList.innerHTML =
          '<div class="fusa-wiz__fz-empty">Keine passenden Fahrzeuge für diesen Fahrzeugtyp und Standort. Prüfen Sie Stammdaten.</div>';
        selectedFz = [];
        fzMetaById = {};
        fzFlaechenById = {};
        posByFz = {};
        updateKpiStrip();
        updateFzSelectionSummary();
        renderPreisTable();
        return;
      }
      elFzList.innerHTML = list
        .map(f => {
          const id = f && f.id != null ? String(f.id) : '';
          const k = f && f.kennung != null ? String(f.kennung) : '—';
          const kz = f && f.kennzeichen != null ? String(f.kennzeichen) : '';
          const tip = f && f.typ != null && String(f.typ).trim() !== '' ? String(f.typ).trim() : '';
          const buchbar = fahrzeugApiIstBuchbar(f);
          const chk = buchbar && selectedFz.includes(id) ? ' checked' : '';
          const dis = buchbar ? '' : ' disabled';
          const rowCls = buchbar ? 'fusa-wiz-fz-row' : 'fusa-wiz-fz-row fusa-wiz-fz-row--blocked';
          const typHtml = tip ? `<span class="fusa-wiz-fz-row__typ">${esc(tip)}</span>` : '';
          const khRaw =
            f && f.sperrgrund_text != null && String(f.sperrgrund_text).trim()
              ? String(f.sperrgrund_text).trim()
              : f && f.konflikt_hinweis != null
                ? String(f.konflikt_hinweis).trim()
                : '';
          const warn =
            f && !buchbar && khRaw ? `<span class="fusa-wiz-fz-row__warn">${esc(khRaw)}</span>` : '';
          const uns =
            f && f.flaechen_pruefung_unsicher && buchbar
              ? `<span class="fusa-wiz-fz-row__unsicher">Hinweis: Bestehende Belegung ohne sicher zuordenbares Paket — bitte Daten prüfen.</span>`
              : '';
          return `<label class="${rowCls}"><input type="checkbox" data-fusa-wiz-fz-cb value="${esc(id)}"${chk}${dis} /><span class="fusa-wiz-fz-row__body"><span class="fusa-wiz-fz-row__main"><strong>${esc(k)}</strong>${typHtml}</span><span class="fusa-wiz-fz-row__sub">${esc(kz || '—')}</span>${warn}${uns}</span></label>`;
        })
        .join('');
      elFzList.querySelectorAll('[data-fusa-wiz-fz-cb]').forEach(cb => {
        cb.addEventListener('change', () => {
          selectedFz = [...elFzList.querySelectorAll('[data-fusa-wiz-fz-cb]:checked')].map(
            /** @param {Element} x */ x =>
              x instanceof HTMLInputElement && x.value ? x.value : '',
          ).filter(Boolean);
          syncPosByFzKeys();
          elFzList.querySelectorAll('.fusa-wiz-fz-row').forEach(lab => {
            const inner = lab.querySelector('[data-fusa-wiz-fz-cb]');
            if (inner instanceof HTMLInputElement) lab.classList.toggle('fusa-wiz-fz-row--on', inner.checked);
          });
          updateKpiStrip();
          updateFzSelectionSummary();
          syncSubmitEnabled();
          scheduleKalkOnly();
          renderPreisTable();
        });
      });
      elFzList.querySelectorAll('.fusa-wiz-fz-row').forEach(lab => {
        const inner = lab.querySelector('[data-fusa-wiz-fz-cb]');
        if (inner instanceof HTMLInputElement) lab.classList.toggle('fusa-wiz-fz-row--on', inner.checked);
      });
      updateFzSelectionSummary();
      syncSubmitEnabled();
    } catch (e) {
      elFzHint.textContent = '';
      fzFlaechenById = {};
      if (elFzErr instanceof HTMLElement) {
        elFzErr.hidden = false;
        const st = e && typeof e === 'object' && 'status' in e ? Number(/** @type {{ status?: number }} */ (e).status) : NaN;
        elFzErr.textContent = formatApiErrorForUi(e);
        if (st === 404) {
          const span = document.createElement('span');
          span.className = 'fusa-wiz__hint';
          span.style.display = 'block';
          span.style.marginTop = '6px';
          span.textContent =
            'HTTP 404: Liegt die Anfrage am Frontend-Port (z. B. 5370)? Meta cc-api-base muss auf das Backend zeigen (typ. http://localhost:5371). Sonst: Backend neu starten, Route prüfen, oder project_id ungültig.';
          elFzErr.appendChild(span);
        }
      }
      elFzList.innerHTML = '';
      updateFzSelectionSummary();
    }
    updateKpiStrip();
    syncSubmitEnabled();
  }

  function scheduleKalkOnly() {
    if (tKalk) clearTimeout(tKalk);
    tKalk = setTimeout(() => {
      tKalk = null;
      void runKalkulation();
    }, 280);
  }

  function scheduleKalkUndFahrzeuge() {
    if (tAll) clearTimeout(tAll);
    tAll = setTimeout(() => {
      tAll = null;
      void runKalkulation()
        .then(() => runVerfuegbareFahrzeuge())
        .finally(() => syncSubmitEnabled());
    }, 350);
  }

  if (elPaketChips) {
    elPaketChips.addEventListener('click', ev => {
      const b = ev.target && /** @type {HTMLElement} */ (ev.target).closest('[data-fusa-wiz-paket]');
      if (!(b instanceof HTMLButtonElement)) return;
      const name = b.getAttribute('data-fusa-wiz-paket') || '';
      selectedPaket = name;
      for (const c of elPaketChips.querySelectorAll('[data-fusa-wiz-paket]')) {
        if (c instanceof HTMLButtonElement) c.classList.toggle('fusa-wiz__paket-btn--active', c === b);
      }
      syncSubmitEnabled();
      setPaketInfo(name);
      syncSec4PaketName();
      scheduleKalkUndFahrzeuge();
    });
  }

  if (elStart) {
    const onZeitraum = () => {
      applyLaufzeitEndeAuswahl();
      updateVorschauPlatzhalter();
      scheduleKalkUndFahrzeuge();
      syncSubmitEnabled();
    };
    elStart.addEventListener('input', onZeitraum);
    elStart.addEventListener('change', onZeitraum);
  }
  if (elLzSelect) {
    const onLz = () => {
      applyLaufzeitEndeAuswahl();
      updateVorschauPlatzhalter();
      scheduleKalkUndFahrzeuge();
      syncSubmitEnabled();
    };
    elLzSelect.addEventListener('input', onLz);
    elLzSelect.addEventListener('change', onLz);
  }
  if (elTyp) {
    elTyp.addEventListener('change', () => {
      renderPaketChips();
      selectedFz = [];
      posByFz = {};
      fzFlaechenById = {};
      scheduleKalkUndFahrzeuge();
      syncSubmitEnabled();
      renderPreisTable();
    });
  }
  if (elPartner) {
    elPartner.addEventListener('change', () => {
      scheduleKalkOnly();
    });
  }
  if (elSamePaket) {
    elSamePaket.addEventListener('change', () => {
      if (elSamePaket.checked && selectedPaket) {
        for (const fid of selectedFz) {
          if (!posByFz[fid]) posByFz[fid] = {};
          posByFz[fid].paket = selectedPaket;
        }
      }
      scheduleKalkUndFahrzeuge();
    });
  }
  if (elSamePreis) {
    elSamePreis.addEventListener('change', () => {
      if (!elSamePreis.checked || selectedFz.length === 0) return;
      const first = selectedFz[0];
      const v = posByFz[first]?.service;
      if (v == null || !Number.isFinite(v)) return;
      for (const fid of selectedFz) {
        if (!posByFz[fid]) posByFz[fid] = {};
        posByFz[fid].service = v;
      }
      scheduleKalkOnly();
    });
  }
  if (elMontage) elMontage.addEventListener('change', () => syncSubmitEnabled());
  if (elAbr) {
    elAbr.addEventListener('change', () => {
      updateVorschauPlatzhalter();
      syncSubmitEnabled();
    });
  }
  if (elTitle) {
    elTitle.addEventListener('input', () => syncSubmitEnabled());
  }
  if (elDepot) {
    const onDepot = () => {
      syncWerkstattFields();
      scheduleKalkUndFahrzeuge();
      syncSubmitEnabled();
    };
    elDepot.addEventListener('change', onDepot);
  }

  syncWerkstattFields();
  if (skipInitialKalkAfterHydrate) {
    void runVerfuegbareFahrzeuge().finally(() => syncSubmitEnabled());
  } else {
    void runKalkulation()
      .then(() => runVerfuegbareFahrzeuge())
      .finally(() => syncSubmitEnabled());
  }

  const cancelBtn = q('[data-fusa-wiz-cancel]');
  if (cancelBtn) cancelBtn.addEventListener('click', () => ctx.onClose());

  function resetWizardNachNeuanlage() {
    if (!elForm) return;
    elForm.reset();
    if (elStart) elStart.value = todayIso();
    if (elLzSelect) elLzSelect.value = '24';
    applyLaufzeitEndeAuswahl();
    if (elAbr) elAbr.value = '';
    if (elNotiz) elNotiz.value = '';
    updateVorschauPlatzhalter();
    const aufNrEl2 = /** @type {HTMLInputElement|null} */ (q('[data-fusa-wiz-auftrag-nr]'));
    if (aufNrEl2) aufNrEl2.value = '';
    selectedFz = [];
    posByFz = {};
    fzMetaById = {};
    selectedPaket = '';
    renderPaketChips();
    lastKalk = null;
    fillPartnerSelect();
    renderPreisTable();
    void runVerfuegbareFahrzeuge().finally(() => syncSubmitEnabled());
    syncProjektRo();
    if (elRefCreated instanceof HTMLElement) elRefCreated.textContent = '—';
    if (elRefId instanceof HTMLElement) elRefId.textContent = '—';
    preservedDokumenteMeta = null;
  }

  async function persistEntwurf() {
    if (elSaveErr instanceof HTMLElement) {
      elSaveErr.hidden = true;
      elSaveErr.textContent = '';
    }
    const project_id = ctx.getProjectId().trim();
    if (!project_id) {
      if (elSaveErr instanceof HTMLElement) {
        elSaveErr.hidden = false;
        elSaveErr.textContent = 'Bitte ein Projekt in der Ansicht oben wählen.';
      }
      return;
    }
    const titleRaw = elTitle && elTitle.value ? elTitle.value.trim() : '';
    if (!titleRaw) {
      if (elSaveErr instanceof HTMLElement) {
        elSaveErr.hidden = false;
        elSaveErr.textContent = 'Bitte eine Bezeichnung eingeben.';
      }
      return;
    }
    savingDraft = true;
    syncSubmitEnabled();
    try {
      applyLaufzeitEndeAuswahl();
      const firma_id = elFirma && elFirma.value ? elFirma.value.trim() : '';
      const title = titleRaw || 'Entwurf';
      const termin = elStart && elStart.value ? elStart.value.trim() : '';
      const termin_ende = elEnd && elEnd.value ? elEnd.value.trim() : '';
      const typ = elTyp && elTyp.value ? elTyp.value.trim() : '';
      const depot = elDepot && elDepot.value ? elDepot.value.trim() : '';
      const paket = selectedPaket.trim();
      const lz = elLz && elLz.value ? parseInt(String(elLz.value), 10) : null;
      const ap = elAp && elAp.value ? elAp.value.trim() : '';
      const montage = elMontage && elMontage.value ? elMontage.value.trim() : '';
      const zeit = elZeit && elZeit.value ? elZeit.value.trim() : '';
      const wsLabel = elWsLabel && elWsLabel.value ? elWsLabel.value.trim() : '';
      const wsMail = elWsMail && elWsMail.value ? elWsMail.value.trim() : '';
      const abrechnungsart = elAbr && elAbr.value ? elAbr.value.trim() : '';
      const notiz = elNotiz && elNotiz.value ? elNotiz.value.trim() : '';
      const partnermodell = elPartner && elPartner.value ? elPartner.value.trim() : '';
      const kunde_name = firma_id ? await resolveFirmenLabel(firma_id) : '';
      const montYmd =
        montage && /^\d{4}-\d{2}-\d{2}$/.test(montage.slice(0, 10)) ? montage.slice(0, 10) : '';
      const bekFelder = resolveBeklebungFelderFuerExtra(montYmd, preservedWerkstattBeklebung);
      const pmPflicht = extraPreisMonatPflicht();
      const av = buildAbrechnungVorschauExtra();
      /** @type {Record<string, unknown>} */
      const draftExtra = {
        entwurf: true,
        fahrzeugtyp: typ || undefined,
        paket: paket || undefined,
        depot: depot || undefined,
        laufzeit_monate: lz != null && Number.isFinite(lz) ? lz : undefined,
        ansprechpartner: ap || undefined,
        montage_wunschtermin: montage || undefined,
        montage_wunschzeit: zeit || undefined,
        werkstatt_label: wsLabel || undefined,
        werkstatt_email: wsMail || undefined,
        abrechnungsart: abrechnungsart || undefined,
        notiz: notiz || undefined,
        partnermodell: partnermodell || undefined,
        preis_monat_pflicht: pmPflicht,
        abrechnung_vorschau: av,
        preispositionen:
          lastKalk && Array.isArray(lastKalk.positionen) && lastKalk.positionen.length
            ? lastKalk.positionen
            : undefined,
        summen: lastKalk && lastKalk.summen ? lastKalk.summen : undefined,
        ...preservedWerkstattBeklebung,
        ...bekFelder,
        ...(preservedDokumenteMeta != null ? { dokumente_meta: preservedDokumenteMeta } : {}),
      };
      if (!montYmd) {
        delete draftExtra.beklebung_termin;
        delete draftExtra.beklebungstermin_status;
      }
      if (isEdit) {
        await apiFetch(`${API_ROUTES.fusa.auftraege}/${encodeURIComponent(editAuftragId)}`, {
          method: 'PATCH',
          body: {
            title,
            status: 'Entwurf',
            ...(firma_id ? { firma_id } : {}),
            ...(termin ? { termin } : {}),
            ...(termin_ende ? { termin_ende } : {}),
            ...(selectedFz.length ? { fusa_fahrzeug_ids: selectedFz } : {}),
            fusa_extra_json: draftExtra,
          },
        });
      } else {
        await apiFetch(API_ROUTES.fusa.auftraege, {
          method: 'POST',
          body: {
            project_id,
            title,
            status: 'Entwurf',
            ist_entwurf: true,
            ...(firma_id ? { firma_id, kunde_name } : {}),
            ...(termin ? { termin } : {}),
            ...(termin_ende ? { termin_ende } : {}),
            ...(selectedFz.length ? { fusa_fahrzeug_ids: selectedFz } : {}),
            fusa_extra_json: draftExtra,
          },
        });
      }
      await ctx.onSaved();
      if (!isEdit) resetWizardNachNeuanlage();
      if (isEdit) ctx.onClose();
    } catch (e) {
      if (elSaveErr instanceof HTMLElement) {
        elSaveErr.hidden = false;
        elSaveErr.textContent = formatApiErrorForUi(e);
      }
    } finally {
      savingDraft = false;
      syncSubmitEnabled();
    }
  }

  const draftBtn = q('[data-fusa-wiz-draft]');
  if (draftBtn) {
    draftBtn.addEventListener('click', async () => {
      await persistEntwurf();
    });
  }

  if (elForm) {
    elForm.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (elSaveErr instanceof HTMLElement) {
        elSaveErr.hidden = true;
        elSaveErr.textContent = '';
      }
      const project_id = ctx.getProjectId().trim();
      const firma_id = elFirma && elFirma.value ? elFirma.value.trim() : '';
      const title = elTitle && elTitle.value ? elTitle.value.trim() : '';
      const termin = elStart && elStart.value ? elStart.value.trim() : '';
      const termin_ende = elEnd && elEnd.value ? elEnd.value.trim() : '';
      const typ = elTyp && elTyp.value ? elTyp.value.trim() : '';
      const depot = elDepot && elDepot.value ? elDepot.value.trim() : '';
      const paket = selectedPaket.trim();

      if (!project_id) {
        if (elSaveErr instanceof HTMLElement) {
          elSaveErr.hidden = false;
          elSaveErr.textContent = 'Bitte ein Projekt in der Ansicht oben wählen.';
        }
        return;
      }
      if (!firma_id || !title || !termin || !termin_ende || !typ || !depot || !paket) {
        if (elSaveErr instanceof HTMLElement) {
          elSaveErr.hidden = false;
          elSaveErr.textContent = 'Bitte alle Pflichtfelder inkl. Kunde, Zeitraum, Typ, Depot und Paket ausfüllen.';
        }
        return;
      }
      if (selectedFz.length === 0) {
        if (elSaveErr instanceof HTMLElement) {
          elSaveErr.hidden = false;
          elSaveErr.textContent = 'Bitte mindestens ein verfügbares Fahrzeug auswählen.';
        }
        return;
      }
      const ek = lastKalk && lastKalk.erlaubte_konfiguration;
      if (ek && typeof ek === 'object' && ek.gueltig === false) {
        if (elSaveErr instanceof HTMLElement) {
          elSaveErr.hidden = false;
          elSaveErr.textContent = 'Kalkulation ist ungültig — bitte Eingaben prüfen.';
        }
        return;
      }

      const ap = elAp && elAp.value ? elAp.value.trim() : '';
      const montage = elMontage && elMontage.value ? elMontage.value.trim() : '';
      const zeit = elZeit && elZeit.value ? elZeit.value.trim() : '';
      const wsLabel = elWsLabel && elWsLabel.value ? elWsLabel.value.trim() : '';
      const wsMail = elWsMail && elWsMail.value ? elWsMail.value.trim() : '';
      const lz = elLz && elLz.value ? parseInt(String(elLz.value), 10) : null;
      const abrechnungsart = elAbr && elAbr.value ? elAbr.value.trim() : '';
      const notiz = elNotiz && elNotiz.value ? elNotiz.value.trim() : '';

      const partnermodell = elPartner && elPartner.value ? elPartner.value.trim() : '';
      const montYmdFinal =
        montage && /^\d{4}-\d{2}-\d{2}$/.test(montage.slice(0, 10)) ? montage.slice(0, 10) : '';
      const bekFinal = resolveBeklebungFelderFuerExtra(montYmdFinal, preservedWerkstattBeklebung);
      const pmPflichtSave = extraPreisMonatPflicht();
      const avSave = buildAbrechnungVorschauExtra();
      const fusa_extra_json = {
        fahrzeugtyp: typ,
        paket,
        depot,
        laufzeit_monate: lz,
        ansprechpartner: ap || undefined,
        montage_wunschtermin: montage || undefined,
        montage_wunschzeit: zeit || undefined,
        werkstatt_label: wsLabel || undefined,
        werkstatt_email: wsMail || undefined,
        abrechnungsart: abrechnungsart || undefined,
        notiz: notiz || undefined,
        partnermodell: partnermodell || undefined,
        preis_monat_pflicht: pmPflichtSave,
        abrechnung_vorschau: avSave,
        preispositionen:
          lastKalk && Array.isArray(lastKalk.positionen) && lastKalk.positionen.length
            ? lastKalk.positionen
            : undefined,
        summen: lastKalk && lastKalk.summen && typeof lastKalk.summen === 'object' ? lastKalk.summen : undefined,
        entwurf: false,
        ...preservedWerkstattBeklebung,
        ...bekFinal,
        ...(preservedDokumenteMeta != null ? { dokumente_meta: preservedDokumenteMeta } : {}),
      };

      const submitBtn = q('[data-fusa-wiz-submit]');
      saving = true;
      syncSubmitEnabled();
      try {
        const kunde_name = await resolveFirmenLabel(firma_id);
        /** @type {Record<string, unknown>} */
        const patchBody = {
          title,
          firma_id,
          termin,
          termin_ende,
          fusa_fahrzeug_ids: selectedFz,
          fusa_extra_json,
          status: 'Aktiv',
        };
        if (isEdit) {
          await apiFetch(`${API_ROUTES.fusa.auftraege}/${encodeURIComponent(editAuftragId)}`, {
            method: 'PATCH',
            body: patchBody,
          });
        } else {
          await apiFetch(API_ROUTES.fusa.auftraege, {
            method: 'POST',
            body: {
              project_id,
              title,
              firma_id,
              kunde_name,
              termin,
              termin_ende,
              fusa_fahrzeug_ids: selectedFz,
              fusa_extra_json,
              ist_entwurf: false,
              status: 'Aktiv',
            },
          });
        }
        if (!isEdit) resetWizardNachNeuanlage();
        await ctx.onSaved();
        if (isEdit) ctx.onClose();
      } catch (e) {
        const ex = /** @type {{ status?: number, body?: { message?: string } }} */ (e);
        const st = ex.status;
        const body = ex.body;
        let msg = formatApiErrorForUi(e);
        if (st === 409 && body && typeof body.message === 'string') msg = body.message;
        if (elSaveErr instanceof HTMLElement) {
          elSaveErr.hidden = false;
          elSaveErr.textContent = msg;
        }
      } finally {
        saving = false;
        syncSubmitEnabled();
      }
    });
  }
}
