/**
 * Gemeinsame Hilfen für Kundenbezug über **firmaId** (dieselbe ID wie in `firmenStamm` /
 * `firmaListRowDomId` aus der Firmen-Stammliste, i. d. R. API `firmen.id`).
 *
 * Datenquelle: nur `firmenStamm` über den Store — keine parallele Kunden-Wahrheit.
 * Vor erstem Lesen in UI-Kontexten `ensureFirmenStammLoaded()` aufrufen (die Funktionen
 * hier rufen ihn selbst auf).
 *
 * Geplante Verbraucher (ohne Umbau in diesem Schritt):
 * - FUSA/CC Intern **Aufträge**: Anzeige/Auswahl Kunde → `firmaId` am Auftrag
 * - **Angebote** (später): Anker `firmaId`
 * - **CRM** (später): Anker `firmaId`
 */
import {
  ensureFirmenStammLoaded,
  getFirmenStammRows,
} from '../../../core/state/firmen-stamm-store.js';
import { buildNormalizedFirmenFromApi, firmaListRowDomId } from '../ui/firmen-stamm-list.js';

/**
 * @param {string|null|undefined} firmaId
 * @returns {Promise<object|null>} normalisierte Firmenzeile oder null
 */
export async function resolveFirmaById(firmaId) {
  const id = firmaId != null ? String(firmaId).trim() : '';
  if (!id) return null;
  await ensureFirmenStammLoaded();
  const list = buildNormalizedFirmenFromApi(getFirmenStammRows()).list;
  for (const c of list) {
    if (firmaListRowDomId(c) === id) return c;
  }
  return null;
}

/**
 * @param {string|null|undefined} firmaId
 * @returns {Promise<string>}
 */
export async function resolveFirmenLabel(firmaId) {
  const id = firmaId != null ? String(firmaId).trim() : '';
  const c = await resolveFirmaById(firmaId);
  if (!c) return id || '—';
  const n = c.name != null && String(c.name).trim() !== '' ? String(c.name).trim() : '';
  const name = n || firmaListRowDomId(c) || id || '—';
  const kn =
    c.kundennummer != null && String(c.kundennummer).trim() !== '' && c.kundennummer !== '—'
      ? String(c.kundennummer).trim()
      : '';
  const alt =
    c.altnummer != null && String(c.altnummer).trim() !== '' && c.altnummer !== '—'
      ? String(c.altnummer).trim()
      : '';
  const main = kn ? `${kn} – ${name}` : name;
  return alt ? `${main} · Alt: ${alt}` : main;
}

/**
 * Kunden-Spalte im Auftrag: bei gesetztem **firmaId** (oder API `firma_id`) nur Anzeige aus dem
 * zentralen Stamm; sonst weiterhin freier API-Text `kunde_name` (keine erzwungene Migration).
 *
 * @param {object|null|undefined} auftrag Rohdatensatz wie GET `/auftraege`-Zeile
 * @returns {Promise<string>}
 */
export async function resolveAuftragKundenAnzeige(auftrag) {
  const a = auftrag && typeof auftrag === 'object' ? auftrag : {};
  const fid =
    (a.firmaId != null && String(a.firmaId).trim()) ||
    (a.firma_id != null && String(a.firma_id).trim()) ||
    '';
  if (fid) return resolveFirmenLabel(fid);
  const kn = a.kunde_name != null && String(a.kunde_name).trim() !== '' ? String(a.kunde_name).trim() : '';
  return kn || '—';
}

/**
 * Optionen für Kunden-`<select>`: `value` = Firmen-ID (wie `firmaListRowDomId`).
 * @returns {Promise<{ value: string, label: string }[]>}
 */
export async function buildFirmenSelectOptions() {
  await ensureFirmenStammLoaded();
  const list = buildNormalizedFirmenFromApi(getFirmenStammRows()).list;
  /** @type {{ value: string, label: string }[]} */
  const out = [];
  for (const c of list) {
    const value = firmaListRowDomId(c);
    if (!value) continue;
    const name = c.name != null && String(c.name).trim() !== '' ? String(c.name).trim() : value;
    const kn =
      c.kundennummer != null && String(c.kundennummer).trim() !== '' && c.kundennummer !== '—'
        ? String(c.kundennummer).trim()
        : '';
    const alt =
      c.altnummer != null && String(c.altnummer).trim() !== '' && c.altnummer !== '—'
        ? String(c.altnummer).trim()
        : '';
    const main = kn ? `${kn} – ${name}` : name;
    const label = alt ? `${main} · Alt: ${alt}` : main;
    out.push({ value, label });
  }
  return out;
}
