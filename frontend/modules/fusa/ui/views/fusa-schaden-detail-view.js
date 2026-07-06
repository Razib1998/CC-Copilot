/**
 * FUSA — Schaden-Detail: Werkstatt, Fotos, Anzeige nur aus Cockpit-API.
 * View-Modell: `mapSchadenApiRowToViewModel` (keine Rohfelder im HTML).
 */
import { esc } from '../../fusa-ui-shared.js';
import {
  apiFetch,
  apiFetchFormData,
  formatApiErrorForUi,
  getAccessToken,
  getApiBaseUrl,
  getCurrentProjectId,
} from '../../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../../core/api/api-routes.js';
import { loadMyRights, myRight } from '../../../../core/access/cc-my-rights.js';
import CCState from '../../../../core/state/state.js';
import { mapSchadenApiRowToViewModel, mapSchadenFotoApiToViewModel } from '../../lib/fusa-schaden-view-model.js';

/**
 * @param {string} relUrl
 */
async function fetchAuthedImageObjectUrl(relUrl) {
  const token = getAccessToken();
  const p = relUrl.startsWith('/') ? relUrl : `/${relUrl}`;
  const url = `${getApiBaseUrl()}${p}`;
  const projectId = getCurrentProjectId();
  /** @type {Record<string, string>} */
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (projectId && p.startsWith('/api/v1/')) headers['x-project-id'] = projectId;
  const res = await fetch(url, {
    headers,
  });
  if (!res.ok) throw new Error(`Bild ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Detailzeile aus API; bei Fehler `/schaeden/:id` Fallback über `GET /schaeden` (gleiche API).
 * @param {string} schadenId
 * @returns {Promise<string>}
 */
export async function renderFusaSchadenDetailHtml(schadenId) {
  const sid = String(schadenId || '').trim();
  if (!sid) {
    return `<div data-ccw-ro="fusa-schaeden"><p class="ckp-api-error" role="alert">Ungültige Schaden-ID.</p></div>`;
  }

  let detailErr = '';
  /** @type {Record<string, unknown>|null} */
  let schadenRow = null;
  let usedListFallback = false;

  try {
    const dr = await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`);
    schadenRow = dr && typeof dr === 'object' && dr.schaden && typeof dr.schaden === 'object' ? /** @type {Record<string, unknown>} */ (dr.schaden) : null;
  } catch (e) {
    detailErr = formatApiErrorForUi(e);
  }

  if (!schadenRow) {
    try {
      const lr = await apiFetch(API_ROUTES.fusa.schaeden);
      const arr = Array.isArray(lr.schaeden) ? lr.schaeden : [];
      const hit = arr.find(x => x && typeof x === 'object' && String(/** @type {any} */ (x).id) === sid);
      if (hit) {
        schadenRow = /** @type {Record<string, unknown>} */ (hit);
        usedListFallback = true;
        detailErr = '';
      }
    } catch (e2) {
      if (!detailErr) detailErr = formatApiErrorForUi(e2);
    }
  }

  if (!schadenRow) {
    const msg = detailErr || 'Schaden nicht gefunden.';
    return `<div data-ccw-ro="fusa-schaeden" class="fusa-sch-detail">
  <p class="ckp-api-error" role="alert">${esc(msg)}</p>
  <button type="button" class="ckp-api-auftrag-submit" data-fusa-schaden-back style="margin-top:12px;">Zurück zur Liste</button>
</div>`;
  }

  const vm = mapSchadenApiRowToViewModel(schadenRow);
  if (!vm) {
    return `<div data-ccw-ro="fusa-schaeden" class="fusa-sch-detail">
  <p class="ckp-api-error" role="alert">Schaden-Daten ungültig.</p>
  <button type="button" class="ckp-api-auftrag-submit" data-fusa-schaden-back style="margin-top:12px;">Zurück zur Liste</button>
</div>`;
  }

  let myRights = null;
  try {
    myRights = await loadMyRights();
  } catch {
    myRights = null;
  }
  const canWs = myRight(myRights, 'fusa', 'schaeden', 'bearbeiten');
  const canUploadPhotos = myRight(myRights, 'fusa', 'schaeden', 'upload');

  /** @type {object[]} */
  let fotosRaw = [];
  try {
    const fr = await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}/fotos`);
    fotosRaw = Array.isArray(fr.fotos) ? fr.fotos : [];
  } catch {
    fotosRaw = [];
  }

  const fotoVms = fotosRaw.map(f => mapSchadenFotoApiToViewModel(f && typeof f === 'object' ? /** @type {Record<string, unknown>} */ (f) : {})).filter(Boolean);

  /** @type {Array<Record<string, unknown>>} */
  let historyRows = [];
  try {
    const hr = await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}/history`);
    historyRows = Array.isArray(hr.history) ? hr.history : [];
  } catch {
    historyRows = [];
  }

  const fallbackBanner = usedListFallback
    ? `<p class="ckp-mock-note" role="status" data-fusa-sch-detail-fallback>Detailabruf war nicht möglich — Anzeige aus der Schadenliste (eingeschränkt).</p>`
    : '';

  const bearbeitetBlock =
    vm.bearbeitetVon || vm.bearbeitetAmDisplay !== '—'
      ? `<p><strong>Bearbeitung (Werkstatt):</strong> ${esc(vm.bearbeitetVon || '—')} · ${esc(vm.bearbeitetAmDisplay)}</p>`
      : '';

  const extraFelder = (() => {
    const zeilen = [];
    if (vm.typLabel && vm.typLabel !== '—') zeilen.push(`<p><strong>Typ:</strong> ${esc(vm.typLabel)}</p>`);
    if (vm.klaerungLabel) zeilen.push(`<p><strong>Klärungsstatus:</strong> ${esc(vm.klaerungLabel)}</p>`);
    if (vm.dringendLabel && vm.dringendLabel !== '—') zeilen.push(`<p><strong>Priorität:</strong> ${esc(vm.dringendLabel)}</p>`);
    if (vm.reparaturLabel) zeilen.push(`<p><strong>Reparatur (Alt-Logik):</strong> ${esc(vm.reparaturLabel)}</p>`);
    if (vm.abrechnungLabel && vm.abrechnungLabel !== '—') zeilen.push(`<p><strong>Abrechnung:</strong> ${esc(vm.abrechnungLabel)}</p>`);
    if (vm.wiedervorlage) zeilen.push(`<p><strong>Wiedervorlage:</strong> ${esc(vm.wiedervorlageDisplay)}</p>`);
    if (vm.melderName) zeilen.push(`<p><strong>Gemeldet von:</strong> ${esc(vm.melderName)}</p>`);
    if (vm.meldedatum) zeilen.push(`<p><strong>Meldedatum:</strong> ${esc(vm.meldedatum)}</p>`);
    if (vm.verursacher) zeilen.push(`<p><strong>Verursacher:</strong> ${esc(vm.verursacher)}</p>`);
    if (vm.fremdArt) zeilen.push(`<p><strong>Art Fremdschaden:</strong> ${esc(vm.fremdArt)}</p>`);
    if (vm.haftungNotiz) zeilen.push(`<p><strong>Haftungsnotiz:</strong> ${esc(vm.haftungNotiz)}</p>`);
    if (vm.interneNotiz) zeilen.push(`<p><strong>Interne Notiz:</strong> ${esc(vm.interneNotiz)}</p>`);
    if (vm.linkedAuftragId) zeilen.push(`<p><strong>Verknüpfter Auftrag:</strong> ${esc(vm.linkedAuftragId)}</p>`);
    return zeilen.join('');
  })();

  const terminanfrageBlock = (() => {
    const ta = vm.terminanfrage;
    if (!ta || typeof ta !== 'object') return '';
    const t = /** @type {Record<string, unknown>} */ (ta);
    const zeilen = [
      t.werkstatt ? `<p><strong>Werkstatt:</strong> ${esc(String(t.werkstatt))}</p>` : '',
      t.wunschdatum ? `<p><strong>Wunschdatum:</strong> ${esc(String(t.wunschdatum_fmt || t.wunschdatum))}</p>` : '',
      t.wunschzeit ? `<p><strong>Uhrzeit:</strong> ${esc(String(t.wunschzeit))}</p>` : '',
      t.notiz ? `<p><strong>Notiz:</strong> ${esc(String(t.notiz))}</p>` : '',
      t.angefragt_am ? `<p><strong>Angefragt am:</strong> ${esc(String(t.angefragt_am))}${t.angefragt_zeit != null ? ` · ${esc(String(t.angefragt_zeit))}` : ''}</p>` : '',
      t.empfaenger ? `<p><strong>Empfänger:</strong> ${esc(String(t.empfaenger))}</p>` : '',
    ]
      .filter(Boolean)
      .join('');
    if (!zeilen) return '';
    return `<details style="margin:14px 0 10px;" open>
  <summary style="font-weight:600;cursor:pointer;list-style:none;padding:4px 0;">🔧 Terminanfrage</summary>
  <div style="padding:8px 0 4px 4px;">${zeilen}</div>
</details>`;
  })();

  const historyBlock = (() => {
    if (!historyRows.length) return '<p class="ckp-mock-note" role="status">Noch keine Termin-Historie vorhanden.</p>';
    function label(type) {
      if (type === 'repair_request_email_created') return 'E-Mail vorbereitet';
      if (type === 'repair_request_email_sent') return 'E-Mail gesendet';
      if (type === 'repair_request_email_failed') return 'E-Mail fehlgeschlagen';
      if (type === 'workshop_accepted') return 'Werkstatt hat akzeptiert';
      if (type === 'workshop_counter_proposed') return 'Werkstatt schlägt neuen Termin vor';
      if (type === 'workshop_declined') return 'Werkstatt hat abgelehnt';
      if (type === 'admin_appointment_confirmed') return 'Admin hat Termin bestätigt';
      if (type === 'admin_appointment_cancelled') return 'Admin hat Terminanfrage zurückgenommen';
      if (type === 'admin_repair_started') return 'Reparatur / Auftrag gestartet';
      if (type === 'admin_repair_completed') return 'Admin hat Reparatur abgeschlossen';
      if (type === 'admin_workshop_status_changed') return 'Werkstattstatus geändert';
      if (type === 'staff_repair_started') return 'Monteur hat Reparatur gestartet';
      if (type === 'staff_repair_completed') return 'Monteur hat Reparatur abgeschlossen';
      return String(type || 'Ereignis');
    }
    return `<div style="display:flex;flex-direction:column;gap:10px;">${historyRows
      .map((r) => {
        const ev = r.event && typeof r.event === 'object' ? /** @type {Record<string, unknown>} */ (r.event) : {};
        const type = String(r.event_type || '');
        const detail =
          type === 'workshop_counter_proposed'
            ? `${ev.proposed_date ? `Vorschlag: ${esc(String(ev.proposed_date))}` : ''}${ev.proposed_time ? ` · ${esc(String(ev.proposed_time))}` : ''}${ev.note ? `<br>Notiz: ${esc(String(ev.note))}` : ''}`
            : type === 'workshop_accepted' || type === 'workshop_declined'
              ? `${ev.note ? `Notiz: ${esc(String(ev.note))}` : ''}`
              : ev.toEmail
                ? `Empfänger: ${esc(String(ev.toEmail))}`
                : ev.error
                  ? `Fehler: ${esc(String(ev.error))}`
                  : '';
        return `<div style="border-left:3px solid #D4500A;padding:2px 0 2px 10px;">
          <div style="font-weight:700;color:#1e293b;">${esc(label(type))}</div>
          <div style="font-size:12px;color:#64748b;">${esc(String(r.created_at || ''))}${r.created_by_type ? ` · ${esc(String(r.created_by_type))}` : ''}</div>
          ${detail ? `<div style="font-size:12px;color:#334155;margin-top:3px;">${detail}</div>` : ''}
        </div>`;
      })
      .join('')}</div>`;
  })();

  const repairPhotoIds = new Set(Array.isArray(vm.repairPhotoIds) ? vm.repairPhotoIds.map(x => String(x)) : []);
  const repairFotoVms = fotoVms.filter(fv => repairPhotoIds.has(String(fv.id)));
  const schadenFotoVms = fotoVms.filter(fv => !repairPhotoIds.has(String(fv.id)));
  const staffEvents = historyRows.filter((r) => {
    const t = String(r.event_type || '');
    return t === 'staff_repair_started' || t === 'staff_repair_completed';
  });

  function galleryHtml(list, emptyText, caption) {
    return list.length === 0
      ? `<div class="fusa-sch-empty-photo" role="status">
  <div class="fusa-sch-empty-photo__icon">📷</div>
  <div>
    <strong>Keine Fotos vorhanden</strong>
    <span>${esc(emptyText)}</span>
  </div>
</div>`
      : `<div class="fusa-sch-gallery" data-fusa-sch-gallery>${list
          .map(fv => {
            const u = fv.url;
            return `<figure class="fusa-sch-gal-item">
  <img alt="${esc(caption)}" data-fusa-sch-foto-url="${esc(u)}" />
  <figcaption>${esc(caption)}</figcaption>
</figure>`;
          })
          .join('')}</div>`;
  }

  function displayDateTime(v) {
    const s = String(v || '').trim();
    if (!s) return '—';
    if (s.length >= 16) return s.slice(0, 16).replace('T', ' ');
    return s;
  }

  const staffDetailsBlock = (() => {
    const rows = [
      ['Gestartet von', vm.repairStartedBy || '—'],
      ['Gestartet am', displayDateTime(vm.repairStartedAt)],
      ['Abgeschlossen von', vm.repairCompletedBy || '—'],
      ['Abgeschlossen am', displayDateTime(vm.repairCompletedAt)],
      ['Notiz', vm.repairCompletedNote || '—'],
      ['Nachher-Fotos', String(repairFotoVms.length)],
    ];
    const eventRows = staffEvents
      .map((r) => {
        const ev = r.event && typeof r.event === 'object' ? /** @type {Record<string, unknown>} */ (r.event) : {};
        return `<div class="fusa-sch-staff-event">
          <strong>${esc(String(r.event_type || '') === 'staff_repair_completed' ? 'Reparatur abgeschlossen' : 'Reparatur gestartet')}</strong>
          <span>${esc(displayDateTime(r.created_at))}${ev.staff_name ? ` · ${esc(String(ev.staff_name))}` : ''}</span>
          ${ev.note ? `<p>${esc(String(ev.note))}</p>` : ''}
        </div>`;
      })
      .join('');
    return `<div class="fusa-sch-staff-grid">
      ${rows.map(([k, v]) => `<div class="fusa-sch-info"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}
    </div>
    ${eventRows ? `<div class="fusa-sch-staff-events">${eventRows}</div>` : '<p class="ckp-mock-note" role="status">Noch keine Monteur-Aktion gespeichert.</p>'}`;
  })();

  const fotoActions = canUploadPhotos
    ? `<div class="fusa-sch-foto-actions">
  <input type="file" accept="image/*" capture="environment" hidden data-fusa-sch-foto-capture />
  <input type="file" accept="image/*" hidden data-fusa-sch-foto-files multiple />
  <button type="button" class="fusa-sch-photo-btn" data-fusa-sch-foto-trigger="capture">📸 Foto aufnehmen</button>
  <button type="button" class="fusa-sch-photo-btn fusa-sch-photo-btn--secondary" data-fusa-sch-foto-trigger="files">📁 Datei wählen</button>
</div>`
    : `<p class="ckp-mock-note" role="status">Kein Recht zum Hochladen — <code>fusa.schaeden.upload</code>.</p>`;

  const evidenceBlock = `<section class="fusa-sch-card fusa-sch-evidence">
    <div class="fusa-sch-card-head">
      <div>
        <h3>Reparatur-Nachweis</h3>
        <p>Vorher-/Nachher-Vergleich, Monteurangaben und Verlauf.</p>
      </div>
      <div class="fusa-sch-proof-kpis">
        <span>${schadenFotoVms.length} vorher</span>
        <span>${repairFotoVms.length} nachher</span>
      </div>
    </div>
    ${fotoActions}
    <p class="ckp-api-error" data-fusa-sch-detail-msg hidden role="alert"></p>
    <div class="fusa-sch-tabs" role="tablist" aria-label="Reparatur-Nachweis">
      <button type="button" class="fusa-sch-tab is-active" data-fusa-sch-evidence-tab="overview">Übersicht</button>
      <button type="button" class="fusa-sch-tab" data-fusa-sch-evidence-tab="before">Vorher</button>
      <button type="button" class="fusa-sch-tab" data-fusa-sch-evidence-tab="staff">Monteur</button>
      <button type="button" class="fusa-sch-tab" data-fusa-sch-evidence-tab="after">Nachher</button>
      <button type="button" class="fusa-sch-tab" data-fusa-sch-evidence-tab="history">Verlauf</button>
    </div>
    <div class="fusa-sch-tab-panel is-active" data-fusa-sch-evidence-panel="overview">
      <div class="fusa-sch-compare-grid">
        <div>
          <h4>Schadensfotos vorher</h4>
          ${galleryHtml(schadenFotoVms.slice(0, 4), 'Wenn der Fahrer ein Schadensfoto hochgeladen hat, erscheint es hier.', 'Schadensfoto vorher')}
        </div>
        <div>
          <h4>Nachher-Fotos Reparatur</h4>
          ${galleryHtml(repairFotoVms.slice(0, 4), 'Wenn der Monteur nach der Reparatur Fotos hochlädt, erscheinen sie hier.', 'Nachher-Foto Reparatur')}
        </div>
      </div>
    </div>
    <div class="fusa-sch-tab-panel" data-fusa-sch-evidence-panel="before">
      ${galleryHtml(schadenFotoVms, 'Wenn der Fahrer ein Schadensfoto hochgeladen hat, erscheint es hier.', 'Schadensfoto vorher')}
    </div>
    <div class="fusa-sch-tab-panel" data-fusa-sch-evidence-panel="staff">
      ${staffDetailsBlock}
    </div>
    <div class="fusa-sch-tab-panel" data-fusa-sch-evidence-panel="after">
      ${galleryHtml(repairFotoVms, 'Wenn der Monteur nach der Reparatur Fotos hochlädt, erscheinen sie hier.', 'Nachher-Foto Reparatur')}
    </div>
    <div class="fusa-sch-tab-panel" data-fusa-sch-evidence-panel="history">
      ${historyBlock}
    </div>
  </section>`;

  const actionsWs = canWs
    ? `<div class="fusa-sch-detail-ws" aria-label="Werkstattstatus ändern">
  <button type="button" class="fusa-sch-action-btn fusa-sch-action-btn--work" data-fusa-sch-ws="in_arbeit">In Arbeit setzen</button>
  <button type="button" class="fusa-sch-action-btn fusa-sch-action-btn--done" data-fusa-sch-ws="fertig">Als fertig markieren</button>
</div>`
    : `<p class="ckp-mock-note" role="status">Kein Recht zur Werkstatt-Aktion — <code>fusa.schaeden.bearbeiten</code>.</p>`;

  const dokList = Array.isArray(vm.schadenDokumente) ? vm.schadenDokumente : [];
  const dokRows =
    dokList.length === 0
      ? `<tr><td colspan="4" class="ckp-snapshot-ro-empty-cell">Keine Einträge.</td></tr>`
      : dokList
          .map((raw, idx) => {
            const d = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
            const did = d.id != null ? String(d.id) : `idx-${idx}`;
            return `<tr>
    <td class="ckp-snapshot-ro-td">${esc(String(d.name || '—'))}</td>
    <td class="ckp-snapshot-ro-td">${esc(String(d.typ || '—'))}</td>
    <td class="ckp-snapshot-ro-td">${d.url ? `<a href="${esc(String(d.url))}" target="_blank" rel="noopener">Link</a>` : '—'}</td>
    <td class="ckp-snapshot-ro-td">${canWs ? `<button type="button" class="btn" style="font-size:11px;" data-fusa-sch-dok-del="${esc(did)}">Entfernen</button>` : '—'}</td>
  </tr>`;
          })
          .join('');
  const dateienBlock = `<h3 class="ckp-snapshot-ro-section-title" style="margin-top:20px;">Dokumente / Verweise</h3>
  <p class="ckp-mock-note" role="status">Einträge werden in <code>extra_json.schaden_dokumente</code> gespeichert (kein Datei-Upload).</p>
  <table class="ckp-snapshot-ro-table" style="margin-top:10px;max-width:100%;">
    <thead><tr><th class="ckp-snapshot-ro-th">Name</th><th class="ckp-snapshot-ro-th">Typ</th><th class="ckp-snapshot-ro-th">URL</th><th class="ckp-snapshot-ro-th"></th></tr></thead>
    <tbody data-fusa-sch-dok-tbody>${dokRows}</tbody>
  </table>
  ${
    canWs
      ? `<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;max-width:480px;">
    <input type="text" data-fusa-sch-dok-name placeholder="Bezeichnung *" class="ckp-api-auftrag-form__row" style="width:100%;padding:8px;border-radius:8px;border:1px solid #cbd5e1;" />
    <input type="text" data-fusa-sch-dok-typ placeholder="Typ (optional)" style="width:100%;padding:8px;border-radius:8px;border:1px solid #cbd5e1;" />
    <input type="url" data-fusa-sch-dok-url placeholder="https://… (optional)" style="width:100%;padding:8px;border-radius:8px;border:1px solid #cbd5e1;" />
    <button type="button" class="ckp-api-auftrag-submit" data-fusa-sch-dok-add>Verweis speichern</button>
  </div>`
      : `<p class="ckp-mock-note" role="status">Kein Recht zum Bearbeiten der Dokumentliste.</p>`
  }`;

  return `<div data-ccw-ro="fusa-schaeden" class="fusa-sch-detail" data-fusa-sch-detail-id="${esc(sid)}">
<style>
.fusa-sch-detail{--fsd-card:var(--card,#fff);--fsd-soft:#f8fafc;--fsd-soft2:#eef2f7;--fsd-border:var(--border,#DDE3E8);--fsd-text:var(--text,#0F1923);--fsd-muted:var(--text2,#546E7A);--fsd-muted2:var(--text3,#90A4AE);--fsd-accent:#14b8a6;--fsd-accent-text:#06211e;max-width:1120px;margin:0 auto;padding:10px 18px 32px;color:var(--fsd-text);}
html[data-theme='dark'] .fusa-sch-detail{--fsd-card:#101a29;--fsd-soft:#0b1422;--fsd-soft2:#172234;--fsd-border:#26364d;--fsd-text:#f8fafc;--fsd-muted:#aab7ca;--fsd-muted2:#96a4b8;--fsd-accent:#19b8a8;--fsd-accent-text:#06211e;}
.fusa-sch-back{border:1px solid var(--fsd-border);background:var(--fsd-card);color:var(--fsd-muted);border-radius:10px;cursor:pointer;padding:9px 12px;margin-bottom:14px;font:inherit;font-weight:700;box-shadow:0 1px 2px rgba(15,23,42,.06);}
.fusa-sch-back:hover{color:var(--fsd-text);border-color:var(--fsd-accent);}
.fusa-sch-hero{background:linear-gradient(180deg,#fff,#f8fafc);border:1px solid var(--fsd-border);border-radius:16px;padding:18px;box-shadow:0 14px 32px rgba(15,23,42,.08);margin-bottom:14px;}
html[data-theme='dark'] .fusa-sch-hero{background:linear-gradient(180deg,#182437,#111a29);border-color:#2f4058;box-shadow:0 16px 40px rgba(0,0,0,.18);}
.fusa-sch-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;}
.fusa-sch-eyebrow{color:var(--fsd-muted);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;}
.fusa-sch-title{font-size:28px;line-height:1.12;margin:0;color:var(--fsd-text);}
.fusa-sch-sub{margin:8px 0 0;color:var(--fsd-muted);font-size:14px;}
.fusa-sch-badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}
.fusa-sch-badge{border:1px solid var(--fsd-border);background:var(--fsd-soft);color:var(--fsd-text);border-radius:999px;padding:7px 11px;font-size:12px;font-weight:800;white-space:nowrap;}
.fusa-sch-badge--warn{background:#fff7ed;border-color:#fdba74;color:#9a3412;}
html[data-theme='dark'] .fusa-sch-badge{border-color:#3d4f68;background:#0c1624;color:#dce7f5;}
html[data-theme='dark'] .fusa-sch-badge--warn{background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.42);color:#fbbf24;}
.fusa-sch-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:14px;align-items:start;}
.fusa-sch-card{background:var(--fsd-card);border:1px solid var(--fsd-border);border-radius:14px;padding:16px;box-shadow:0 10px 26px rgba(15,23,42,.08);}
html[data-theme='dark'] .fusa-sch-card{border-color:#2c3c52;box-shadow:0 10px 26px rgba(0,0,0,.14);}
.fusa-sch-card + .fusa-sch-card{margin-top:14px;}
.fusa-sch-card h3{margin:0 0 12px;color:var(--fsd-text);font-size:16px;}
.fusa-sch-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px;}
.fusa-sch-card-head h3{margin:0 0 4px;}
.fusa-sch-card-head p{margin:0;color:var(--fsd-muted2);font-size:13px;}
.fusa-sch-proof-kpis{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}
.fusa-sch-proof-kpis span{border:1px solid var(--fsd-border);background:var(--fsd-soft);color:var(--fsd-text);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;white-space:nowrap;}
.fusa-sch-desc{background:var(--fsd-soft);border:1px solid var(--fsd-border);border-radius:12px;padding:14px;color:var(--fsd-text);line-height:1.55;white-space:pre-wrap;}
.fusa-sch-info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
.fusa-sch-info{background:var(--fsd-soft);border:1px solid var(--fsd-border);border-radius:12px;padding:11px 12px;min-width:0;}
.fusa-sch-info span{display:block;color:var(--fsd-muted2);font-size:12px;margin-bottom:4px;}
.fusa-sch-info strong{display:block;color:var(--fsd-text);font-size:14px;word-break:break-word;}
.fusa-sch-extra{margin-top:12px;display:grid;gap:8px;color:var(--fsd-muted);}
.fusa-sch-extra p{margin:0;background:var(--fsd-soft);border:1px solid var(--fsd-border);border-radius:10px;padding:9px 11px;}
.fusa-sch-detail-ws{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;}
.fusa-sch-action-btn,.fusa-sch-photo-btn{border:0;border-radius:12px;min-height:46px;padding:12px 14px;font:inherit;font-weight:900;color:var(--fsd-accent-text);background:var(--fsd-accent);cursor:pointer;}
.fusa-sch-action-btn--done{background:#22c55e;color:#052414;}
.fusa-sch-action-btn--work{background:#14b8a6;}
.fusa-sch-foto-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0;}
.fusa-sch-photo-btn--secondary{background:var(--fsd-soft);color:var(--fsd-text);border:1px solid var(--fsd-border);}
.fusa-sch-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:10px;}
.fusa-sch-gal-item{margin:0;background:var(--fsd-soft);border:1px solid var(--fsd-border);border-radius:14px;overflow:hidden;}
.fusa-sch-gal-item img{display:block;width:100%;height:190px;object-fit:cover;background:var(--fsd-soft2);}
.fusa-sch-gal-item figcaption{padding:8px 10px;color:var(--fsd-muted);font-size:12px;font-weight:700;}
.fusa-sch-tabs{display:flex;gap:8px;overflow-x:auto;padding:6px;margin:12px 0;background:var(--fsd-soft);border:1px solid var(--fsd-border);border-radius:14px;}
.fusa-sch-tab{border:0;border-radius:10px;background:transparent;color:var(--fsd-muted);font:inherit;font-size:13px;font-weight:900;padding:9px 12px;white-space:nowrap;cursor:pointer;}
.fusa-sch-tab.is-active{background:var(--fsd-accent);color:var(--fsd-accent-text);}
.fusa-sch-tab-panel{display:none;}
.fusa-sch-tab-panel.is-active{display:block;}
.fusa-sch-compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start;}
.fusa-sch-compare-grid h4,.fusa-sch-tab-panel h4{margin:0 0 8px;font-size:14px;color:var(--fsd-text);}
.fusa-sch-staff-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
.fusa-sch-staff-events{display:grid;gap:10px;margin-top:14px;}
.fusa-sch-staff-event{border-left:3px solid var(--fsd-accent);background:var(--fsd-soft);border-radius:10px;padding:10px 12px;color:var(--fsd-text);}
.fusa-sch-staff-event strong{display:block;color:var(--fsd-text);}
.fusa-sch-staff-event span{display:block;color:var(--fsd-muted2);font-size:12px;margin-top:2px;}
.fusa-sch-staff-event p{margin:6px 0 0;color:var(--fsd-text);font-size:13px;white-space:pre-wrap;}
.fusa-sch-empty-photo{display:flex;gap:12px;align-items:center;background:var(--fsd-soft);border:1px dashed var(--fsd-border);border-radius:14px;padding:16px;color:var(--fsd-muted);}
.fusa-sch-empty-photo__icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--fsd-soft2);font-size:22px;flex:0 0 auto;}
.fusa-sch-empty-photo strong{display:block;color:var(--fsd-text);margin-bottom:3px;}
.fusa-sch-empty-photo span{display:block;font-size:13px;}
@media (max-width:900px){.fusa-sch-layout{grid-template-columns:1fr}.fusa-sch-title{font-size:23px}.fusa-sch-hero-top,.fusa-sch-card-head{flex-direction:column}.fusa-sch-badges,.fusa-sch-proof-kpis{justify-content:flex-start}.fusa-sch-info-grid,.fusa-sch-detail-ws,.fusa-sch-foto-actions,.fusa-sch-compare-grid,.fusa-sch-staff-grid{grid-template-columns:1fr}}
</style>
  <button type="button" class="fusa-sch-back" data-fusa-schaden-back>← Zurück zur Übersicht</button>
  ${fallbackBanner}
  <section class="fusa-sch-hero">
    <div class="fusa-sch-hero-top">
      <div>
        <div class="fusa-sch-eyebrow">Schaden / Werkstatt</div>
        <h2 class="fusa-sch-title">${esc(vm.titel)}</h2>
        <p class="fusa-sch-sub">${esc(vm.fahrzeugDisplay)} · erfasst ${esc(vm.createdAtDisplay)}</p>
      </div>
      <div class="fusa-sch-badges">
        <span class="fusa-sch-badge">${esc(vm.meldungLabel)}</span>
        <span class="fusa-sch-badge fusa-sch-badge--warn">Werkstatt: ${esc(vm.werkstattLabel)}</span>
      </div>
    </div>
  </section>
  <div class="fusa-sch-layout">
    <main>
      <section class="fusa-sch-card">
        <h3>Beschreibung</h3>
        <div class="fusa-sch-desc">${esc(vm.beschreibungDisplay)}</div>
      </section>
      ${evidenceBlock}
      <section class="fusa-sch-card">
        ${dateienBlock}
      </section>
    </main>
    <aside>
      <section class="fusa-sch-card">
        <h3>Informationen</h3>
        <div class="fusa-sch-info-grid">
          <div class="fusa-sch-info"><span>Fahrzeug</span><strong>${esc(vm.fahrzeugDisplay)}</strong></div>
          <div class="fusa-sch-info"><span>Erfasst</span><strong>${esc(vm.createdAtDisplay)}</strong></div>
          <div class="fusa-sch-info"><span>Status</span><strong>${esc(vm.meldungLabel)}</strong></div>
          <div class="fusa-sch-info"><span>Werkstatt</span><strong>${esc(vm.werkstattLabel)}</strong></div>
        </div>
        <div class="fusa-sch-extra">
          ${bearbeitetBlock}
          ${extraFelder}
        </div>
      </section>
      <section class="fusa-sch-card">
        <h3>Werkstatt</h3>
        ${actionsWs}
      </section>
      ${terminanfrageBlock ? `<section class="fusa-sch-card">${terminanfrageBlock}</section>` : ''}
    </aside>
  </div>
</div>`;
}

/**
 * @param {HTMLElement} mount
 * @param {string} text
 */
function flashSchadenDetailNote(mount, text) {
  const prev = mount.querySelector('[data-fusa-sch-detail-flash]');
  if (prev instanceof HTMLElement) prev.remove();
  const p = document.createElement('p');
  p.className = 'ckp-mock-note';
  p.setAttribute('data-fusa-sch-detail-flash', '');
  p.setAttribute('role', 'status');
  p.textContent = String(text || '').trim() || 'Funktion folgt noch.';
  const ref = mount.querySelector('[data-fusa-sch-dok-add]') || mount.querySelector('[data-fusa-sch-detail-msg]');
  if (ref instanceof HTMLElement) ref.insertAdjacentElement('beforebegin', p);
  else {
    const root = mount.querySelector('.fusa-sch-detail');
    if (root instanceof HTMLElement) root.appendChild(p);
  }
  window.setTimeout(() => {
    p.remove();
  }, 4000);
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachFusaSchadenDetailHandlers(mount, onReload) {
  if (typeof document === 'undefined' || !mount) return;

  const back = mount.querySelector('[data-fusa-schaden-back]');
  if (back instanceof HTMLElement) {
    back.addEventListener('click', () => {
      CCState.set('fusaSchadenDetailId', null);
      if (typeof onReload === 'function') void onReload();
    });
  }

  mount.querySelectorAll('[data-fusa-sch-evidence-tab]').forEach(btn => {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.addEventListener('click', () => {
      const key = String(btn.getAttribute('data-fusa-sch-evidence-tab') || '').trim();
      if (!key) return;
      mount.querySelectorAll('[data-fusa-sch-evidence-tab]').forEach(x => {
        if (x instanceof HTMLElement) x.classList.toggle('is-active', x === btn);
      });
      mount.querySelectorAll('[data-fusa-sch-evidence-panel]').forEach(panel => {
        if (panel instanceof HTMLElement) {
          panel.classList.toggle('is-active', panel.getAttribute('data-fusa-sch-evidence-panel') === key);
        }
      });
    });
  });

  const root = mount.querySelector('[data-fusa-sch-detail-id]');
  const sid = root instanceof HTMLElement ? String(root.getAttribute('data-fusa-sch-detail-id') || '').trim() : '';
  if (!sid) return;

  const msgEl = mount.querySelector('[data-fusa-sch-detail-msg]');

  async function fetchSchadenDokumente() {
    const d = await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`);
    const row = d && typeof d === 'object' && /** @type {any} */ (d).schaden ? /** @type {any} */ (d).schaden : null;
    const arr = row && Array.isArray(row.schaden_dokumente) ? row.schaden_dokumente : [];
    return /** @type {object[]} */ (arr);
  }

  mount.querySelector('[data-fusa-sch-dok-add]')?.addEventListener('click', async () => {
    const nEl = mount.querySelector('[data-fusa-sch-dok-name]');
    const tEl = mount.querySelector('[data-fusa-sch-dok-typ]');
    const uEl = mount.querySelector('[data-fusa-sch-dok-url]');
    const name = nEl instanceof HTMLInputElement ? nEl.value.trim() : '';
    if (!name) {
      flashSchadenDetailNote(mount, 'Bitte eine Bezeichnung eingeben.');
      return;
    }
    const typ = tEl instanceof HTMLInputElement ? tEl.value.trim() : '';
    const url = uEl instanceof HTMLInputElement ? uEl.value.trim() : '';
    try {
      const docs = await fetchSchadenDokumente();
      const nid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dok-${Date.now()}`;
      docs.push({
        id: nid,
        name,
        typ: typ || null,
        url: url || null,
        created_at: new Date().toISOString(),
      });
      await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`, { method: 'PATCH', body: { schaden_dokumente: docs } });
      if (nEl instanceof HTMLInputElement) nEl.value = '';
      if (tEl instanceof HTMLInputElement) tEl.value = '';
      if (uEl instanceof HTMLInputElement) uEl.value = '';
      if (typeof onReload === 'function') await onReload();
    } catch (e) {
      flashSchadenDetailNote(mount, formatApiErrorForUi(e));
    }
  });

  mount.querySelectorAll('[data-fusa-sch-dok-del]').forEach(btn => {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.addEventListener('click', async () => {
      const did = String(btn.getAttribute('data-fusa-sch-dok-del') || '').trim();
      if (!did || !window.confirm('Eintrag entfernen?')) return;
      try {
        const docs = (await fetchSchadenDokumente()).filter(x => {
          if (!x || typeof x !== 'object') return true;
          const id = /** @type {any} */ (x).id != null ? String(/** @type {any} */ (x).id) : '';
          return id !== did;
        });
        await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`, { method: 'PATCH', body: { schaden_dokumente: docs } });
        if (typeof onReload === 'function') await onReload();
      } catch (e) {
        flashSchadenDetailNote(mount, formatApiErrorForUi(e));
      }
    });
  });

  mount.querySelectorAll('[data-fusa-sch-ws]').forEach(btn => {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.addEventListener('click', async () => {
      const v = btn.getAttribute('data-fusa-sch-ws');
      if (v !== 'in_arbeit' && v !== 'fertig') return;
      if (msgEl instanceof HTMLElement) {
        msgEl.textContent = '';
        msgEl.hidden = true;
      }
      try {
        await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}/werkstatt`, {
          method: 'PATCH',
          body: { werkstatt_status: v },
        });
        if (typeof onReload === 'function') await onReload();
      } catch (e) {
        const t = formatApiErrorForUi(e);
        if (msgEl instanceof HTMLElement) {
          msgEl.textContent = t;
          msgEl.hidden = false;
        }
      }
    });
  });

  // Foto-Trigger: Kamera / Datei-Auswahl
  mount.querySelectorAll('[data-fusa-sch-foto-trigger]').forEach(btn => {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-fusa-sch-foto-trigger');
      const sel = mode === 'capture'
        ? mount.querySelector('[data-fusa-sch-foto-capture]')
        : mount.querySelector('[data-fusa-sch-foto-files]');
      if (sel instanceof HTMLInputElement) sel.click();
    });
  });

  // Foto-Upload nach Dateiauswahl
  mount.querySelectorAll('[data-fusa-sch-foto-capture],[data-fusa-sch-foto-files]').forEach(inp => {
    if (!(inp instanceof HTMLInputElement)) return;
    inp.addEventListener('change', async () => {
      const files = Array.from(inp.files || []);
      if (!files.length) return;
      inp.value = '';
      if (msgEl instanceof HTMLElement) { msgEl.textContent = ''; msgEl.hidden = true; }
      for (const file of files) {
        try {
          const fd = new FormData();
          fd.append('foto', file);
          await apiFetchFormData(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}/fotos`, { method: 'POST', body: fd });
        } catch (e) {
          const t = formatApiErrorForUi(e);
          if (msgEl instanceof HTMLElement) { msgEl.textContent = t; msgEl.hidden = false; }
        }
      }
      if (typeof onReload === 'function') await onReload();
    });
  });

  // Foto-Gallery: authentifizierte Bild-URLs nachladen
  mount.querySelectorAll('[data-fusa-sch-foto-url]').forEach(img => {
    if (!(img instanceof HTMLImageElement)) return;
    const relUrl = img.getAttribute('data-fusa-sch-foto-url') || '';
    if (!relUrl) return;
    fetchAuthedImageObjectUrl(relUrl)
      .then(objUrl => { img.src = objUrl; })
      .catch(() => { img.alt = 'Foto nicht ladbar'; });
  });
}
  
