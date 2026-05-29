import { randomUUID } from 'node:crypto';

/**
 * Kalendertage im Zeitraum [von, bis] als YYYY-MM-DD (lokales Datum).
 * @param {string} vonStr
 * @param {string} bisStr
 * @returns {string[]}
 */
export function eachUrlaubCalendarDayInclusive(vonStr, bisStr) {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(vonStr || '').trim());
  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(bisStr || '').trim());
  if (!m1 || !m2) return [];
  const a = new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
  const b = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  if (a > b) return [];
  const out = [];
  const cur = new Date(a);
  while (cur <= b) {
    const y = cur.getFullYear();
    const mo = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${mo}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** @param {any} row */
export function parseUrlaubKalenderTerminIds(row) {
  if (!row) return [];
  const raw = row.kalender_termin_ids != null ? String(row.kalender_termin_ids).trim() : '';
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) {
        return [...new Set(j.map((x) => String(x || '').trim()).filter(Boolean))];
      }
    } catch {
      /* ignorieren */
    }
  }
  const one = row.kalender_termin_id != null ? String(row.kalender_termin_id).trim() : '';
  return one ? [one] : [];
}

/**
 * @param {any} storeArg
 * @param {string} firmaId
 * @param {any} urlaubRow
 */
export async function deleteAllKalenderTermineForUrlaubAntrag(storeArg, firmaId, urlaubRow) {
  const ids = parseUrlaubKalenderTerminIds(urlaubRow);
  for (const tid of ids) {
    await storeArg.deleteKalenderTermin(tid, firmaId);
  }
}

/**
 * Pro Urlaubstag ein Kurz-Termin 07:00–07:15, typ urlaub, quelle ccintern.
 * @param {any} storeArg
 * @param {{ firmaId: string; mitarbeiterId: string; von: string; bis: string; bemerkung: string|null; erstelltVon: string|null; mitarbeiterName?: string|null }} p
 */
export async function createGenehmigteUrlaubKalenderTermine(storeArg, p) {
  const days = eachUrlaubCalendarDayInclusive(p.von, p.bis);
  const u = await storeArg.getUserById(p.mitarbeiterId);
  const display =
    p.mitarbeiterName != null && String(p.mitarbeiterName).trim() !== ''
      ? String(p.mitarbeiterName).trim()
      : u && u.name != null && String(u.name).trim() !== ''
        ? String(u.name).trim()
        : 'Mitarbeiter';
  const titel = `Urlaub – ${display}`;
  const ids = [];
  const mitarbeiterIdsJson = JSON.stringify([p.mitarbeiterId]);
  for (const day of days) {
    const start = `${day}T07:00:00`;
    const ende = `${day}T07:15:00`;
    const id = randomUUID();
    await storeArg.insertKalenderTermin({
      id,
      titel,
      start,
      ende,
      ganztag: false,
      typ: 'urlaub',
      quelle: 'ccintern',
      mitarbeiter_ids: mitarbeiterIdsJson,
      auftrag_id: null,
      fusa_auftrag_id: null,
      farbe: '#10b981',
      notiz: p.bemerkung,
      firma_id: p.firmaId,
      erstellt_von: p.erstelltVon,
    });
    ids.push(id);
  }
  return {
    kalender_termin_id: ids.length ? ids[0] : null,
    kalender_termin_ids: ids.length ? JSON.stringify(ids) : null,
  };
}

/**
 * Alter Urlaubs-„Block“ im Kalender: ganztägig oder mehrtägig / Dauer > 24h.
 * @param {any} row — Zeile kalender_termine
 */
export function isUrlaubLegacyBlockKalenderTermin(row) {
  if (!row || String(row.typ || '').trim() !== 'urlaub') return false;
  const g = row.ganztag;
  if (g === 1 || g === true || g === '1') return true;
  const startRaw = row.start != null ? String(row.start).trim() : '';
  const endeRaw = row.ende != null && String(row.ende).trim() !== '' ? String(row.ende).trim() : '';
  const m1 = /^(\d{4})-(\d{2})-(\d{2})/.exec(startRaw);
  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(endeRaw || startRaw);
  if (!m1 || !m2) return false;
  const d1 = `${m1[1]}-${m1[2]}-${m1[3]}`;
  const d2 = `${m2[1]}-${m2[2]}-${m2[3]}`;
  if (d2 > d1) return true;
  const t1 = Date.parse(startRaw);
  const t2 = Date.parse(endeRaw || startRaw);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return false;
  if (t2 - t1 > 86400000) return true;
  return false;
}
