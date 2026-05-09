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
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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

  const fotoBlock =
    fotoVms.length === 0
      ? `<p class="ckp-mock-note" role="status">Keine Fotos vorhanden.</p>`
      : `<div class="fusa-sch-gallery" data-fusa-sch-gallery>${fotoVms
          .map(fv => {
            const u = fv.url;
            return `<figure class="fusa-sch-gal-item"><img alt="Schadenfoto" data-fusa-sch-foto-url="${esc(u)}" /></figure>`;
          })
          .join('')}</div>`;

  const actionsWs = canWs
    ? `<div class="fusa-sch-detail-ws">
  <button type="button" class="ckp-api-auftrag-submit fusa-sch-ws-btn" data-fusa-sch-ws="in_arbeit">In Arbeit</button>
  <button type="button" class="ckp-api-auftrag-submit fusa-sch-ws-btn" data-fusa-sch-ws="fertig">Fertig</button>
</div>`
    : `<p class="ckp-mock-note" role="status">Kein Recht zur Werkstatt-Aktion — <code>fusa.schaeden.bearbeiten</code>.</p>`;

  const fotoActions = canUploadPhotos
    ? `<div class="fusa-sch-foto-actions">
  <input type="file" accept="image/*" capture="environment" hidden data-fusa-sch-foto-capture />
  <input type="file" accept="image/*" hidden data-fusa-sch-foto-files multiple />
  <button type="button" class="ckp-api-auftrag-submit fusa-sch-foto-btn" data-fusa-sch-foto-trigger="capture">📸 Foto aufnehmen</button>
  <button type="button" class="ckp-api-auftrag-submit fusa-sch-foto-btn" data-fusa-sch-foto-trigger="files">📁 Datei wählen</button>
</div>`
    : `<p class="ckp-mock-note" role="status">Kein Recht zum Hochladen — <code>fusa.schaeden.upload</code>.</p>`;

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
.fusa-sch-detail{max-width:100%;padding-bottom:24px;}
@media (min-width:900px){.fusa-sch-detail{max-width:560px;margin:0 auto;}}
.fusa-sch-detail-ws{display:flex;flex-direction:column;gap:10px;margin:16px 0;}
.fusa-sch-ws-btn{width:100%;min-height:48px;font-size:1.05rem;padding:12px 16px;}
@media (min-width:900px){.fusa-sch-ws-btn{min-height:44px;font-size:1rem;}}
.fusa-sch-foto-actions{display:flex;flex-direction:column;gap:10px;margin:12px 0 16px;}
.fusa-sch-foto-btn{width:100%;min-height:48px;font-size:1rem;}
@media (min-width:900px){.fusa-sch-foto-btn{min-height:40px;}}
.fusa-sch-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:8px;}
.fusa-sch-gal-item{margin:0;}
.fusa-sch-gal-item img{width:100%;height:140px;object-fit:cover;border-radius:8px;background:#eee;}
</style>
  <button type="button" class="ckp-mock-note" data-fusa-schaden-back style="border:none;background:none;cursor:pointer;text-decoration:underline;padding:0;margin-bottom:12px;font:inherit;color:inherit;">← Zurück</button>
  ${fallbackBanner}
  <h2 class="ckp-api-auftrag-form__title" style="margin-top:0;">${esc(vm.titel)}</h2>
  <p><strong>Schaden-ID:</strong> ${esc(vm.id)}</p>
  <p><strong>Fahrzeug:</strong> ${esc(vm.fahrzeugDisplay)}</p>
  <p><strong>Beschreibung:</strong> ${esc(vm.beschreibungDisplay)}</p>
  <p><strong>Status (Meldung):</strong> ${esc(vm.meldungLabel)}</p>
  <p><strong>Werkstatt:</strong> ${esc(vm.werkstattLabel)}</p>
  <p><strong>Erfasst:</strong> ${esc(vm.createdAtDisplay)}</p>
  ${bearbeitetBlock}
  ${extraFelder}
  ${terminanfrageBlock}
  ${actionsWs}
  <h3 class="ckp-snapshot-ro-section-title" style="margin-top:20px;">Fotos</h3>
  ${fotoActions}
  <p class="ckp-api-error" data-fusa-sch-detail-msg hidden role="alert"></p>
  ${fotoBlock}
  ${dateienBlock}
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
  