import { randomUUID } from 'node:crypto';

function clean(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function hasTermin(v) {
  return clean(v) != null;
}

/**
 * Einheitliche Start-Logik: Spalte `termin` hat Vorrang, sonst `fusa_extra_json.beklebung_termin`.
 * @param {Record<string, unknown>} fusaAuftrag
 * @returns {string|null}
 */
function effectiveFusaTerminStart(fusaAuftrag) {
  const direct = clean(fusaAuftrag?.termin);
  if (hasTermin(direct)) return direct;
  const rawEx = fusaAuftrag?.fusa_extra_json;
  if (rawEx == null || String(rawEx).trim() === '') return null;
  try {
    const o = JSON.parse(String(rawEx));
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const b = clean(/** @type {Record<string, unknown>} */ (o).beklebung_termin);
    return hasTermin(b) ? b : null;
  } catch {
    return null;
  }
}

function titelFusa(fusaAuftrag) {
  const kunde = clean(fusaAuftrag?.kunde_name);
  const title = clean(fusaAuftrag?.title);
  if (kunde) return `Beklebung · ${kunde}`;
  if (title) return `Beklebung · ${title}`;
  return 'Beklebung';
}

function titelCcIntern(ccAuftrag) {
  const kunde = clean(ccAuftrag?.kunde);
  const nr = clean(ccAuftrag?.auftragsnummer);
  if (kunde && nr) return `${kunde} · ${nr} · Montage`;
  if (kunde) return `${kunde} · Montage`;
  if (nr) return `${nr} · Montage`;
  return 'Montage';
}

/**
 * CC-Intern-Montage im Kalender: feste 1h-Dauer ab Start.
 * `lieferdatum` wird hier nicht als Ende verwendet (kann vor Montage liegen und würde die Anzeige zerstören).
 * @param {string} startStr
 * @returns {string}
 */
export function endeMontageEineStundeNachStart(startStr) {
  const raw = String(startStr || '').trim();
  if (!raw) return raw;
  const withTime =
    raw.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
  const d = new Date(withTime);
  if (Number.isNaN(d.getTime())) return raw;
  d.setTime(d.getTime() + 60 * 60 * 1000);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${da}T${h}:${mi}:${s}`;
}

/**
 * @param {{
 *   store: any,
 *   fusaAuftrag: any,
 *   linkedCcInternAuftrag: any | null,
 *   actorUserId?: string | null,
 * }} ctx
 */
export async function syncFusaTerminAndLinkedCcIntern(ctx) {
  const store = ctx.store;
  const fusaAuftrag = ctx.fusaAuftrag || {};
  const linked = ctx.linkedCcInternAuftrag || null;
  const actor = clean(ctx.actorUserId);
  const fusaAuftragId = clean(fusaAuftrag.id);
  if (!fusaAuftragId) return { ok: false, reason: 'missing_fusa_auftrag_id' };

  const firmaId = clean(linked?.firma_id) || clean(fusaAuftrag.fusa_kunde_id);
  if (!firmaId) return { ok: false, reason: 'missing_firma_id' };

  const terminStart = effectiveFusaTerminStart(fusaAuftrag);
  const terminEnde = clean(fusaAuftrag.termin_ende);
  const existing = await store.getKalenderTerminByQuelleAndFusaAuftragId(firmaId, 'fusa', fusaAuftragId);

  if (hasTermin(terminStart)) {
    const payload = {
      titel: titelFusa(fusaAuftrag),
      start: terminStart,
      ende: terminEnde,
      ganztag: false,
      typ: 'beklebung',
      quelle: 'fusa',
      mitarbeiter_ids: '[]',
      auftrag_id: clean(linked?.id),
      fusa_auftrag_id: fusaAuftragId,
      farbe: '#2563eb',
      notiz: null,
      firma_id: firmaId,
      erstellt_von: actor,
    };
    if (existing) {
      await store.updateKalenderTermin(existing.id, firmaId, payload);
    } else {
      await store.insertKalenderTermin({ id: randomUUID(), ...payload });
    }
  } else if (existing) {
    await store.deleteKalenderTermin(existing.id, firmaId);
  }

  if (linked) {
    const patch = {
      montage_datum: terminStart,
      lieferdatum: terminEnde,
    };
    await store.updateCcInternAuftrag(linked.id, linked.firma_id, patch);
    const refreshed = await store.getCcInternAuftragById(linked.id, linked.firma_id);
    if (refreshed) {
      await syncCcInternMontageTermin({
        store,
        ccinternAuftrag: refreshed,
        actorUserId: actor,
      });
    }
  }

  return { ok: true };
}

/**
 * @param {{
 *   store: any,
 *   ccinternAuftrag: any,
 *   actorUserId?: string | null,
 * }} ctx
 */
export async function syncCcInternMontageTermin(ctx) {
  const store = ctx.store;
  const row = ctx.ccinternAuftrag || {};
  const actor = clean(ctx.actorUserId);
  const auftragId = clean(row.id);
  const firmaId = clean(row.firma_id);
  if (!auftragId || !firmaId) return { ok: false, reason: 'missing_ids' };

  const start = clean(row.montage_datum);
  const existing = await store.getKalenderTerminByQuelleAndAuftragId(firmaId, 'ccintern', auftragId);

  if (hasTermin(start)) {
    const ende = endeMontageEineStundeNachStart(start);
    const payload = {
      titel: titelCcIntern(row),
      start,
      ende,
      ganztag: false,
      typ: 'montage',
      quelle: 'ccintern',
      mitarbeiter_ids: '[]',
      auftrag_id: auftragId,
      fusa_auftrag_id: clean(row.fusa_auftrag_id),
      farbe: '#16a34a',
      notiz: null,
      firma_id: firmaId,
      erstellt_von: actor,
    };
    if (existing) {
      await store.updateKalenderTermin(existing.id, firmaId, payload);
    } else {
      await store.insertKalenderTermin({ id: randomUUID(), ...payload });
    }
  } else if (existing) {
    await store.deleteKalenderTermin(existing.id, firmaId);
  }

  return { ok: true };
}
