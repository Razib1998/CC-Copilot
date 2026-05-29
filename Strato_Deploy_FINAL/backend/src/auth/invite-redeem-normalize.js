/**
 * Einladung → user_modules / user_rights beim Redeem.
 * Modul- und Bereichs-Schlüssel wie in access-profile.js (Case, ccintern_*-Präfixe).
 * Rechte 1:1 übernehmen; nur Boolean `true` → sehen (normalizeRightsJson).
 */
import {
  emptyRightsFlags,
  isValidModuleKey,
  mergeRightsOr,
  normalizeRightsJson,
} from './rights-spec.js';

/**
 * @param {unknown} raw
 * @returns {'cockpit'|'fusa'|'ccintern'|null}
 */
function normalizeInviteModuleKey(raw) {
  const m = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (m === 'cockpit' || m === 'fusa' || m === 'ccintern') return m;
  return null;
}

/**
 * @param {'cockpit'|'fusa'|'ccintern'} module
 * @param {unknown} rawBereich
 */
function normalizeInviteBereichKey(module, rawBereich) {
  const b = typeof rawBereich === 'string' ? rawBereich.trim() : '';
  if (!b) return '';
  const lower = b.toLowerCase();
  const prefix = `${module}_`;
  if (lower.startsWith(prefix)) return lower.slice(prefix.length);
  if (module === 'ccintern' && lower.startsWith('ccintern_')) return lower.slice('ccintern_'.length);
  return lower;
}

/**
 * @param {unknown} raw — DB-Spalte modules_json (String, Buffer oder selten schon Array)
 * @returns {string[]}
 */
export function parseInviteModulesFromRow(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    const out = [];
    for (const x of raw) {
      const nm = normalizeInviteModuleKey(x);
      if (nm) out.push(nm);
    }
    return out;
  }
  let s = typeof raw === 'string' ? raw : String(raw);
  if (!s.trim()) return [];
  try {
    let v = JSON.parse(s);
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v);
      } catch {
        /* einfach encodiert */
      }
    }
    if (!Array.isArray(v)) return [];
    const out = [];
    for (const x of v) {
      const nm = normalizeInviteModuleKey(x);
      if (nm) out.push(nm);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * @param {unknown} raw — rights_json
 * @returns {Record<string, Record<string, unknown>>}
 */
export function parseInviteRightsFromRow(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw) && raw !== null) {
    return /** @type {Record<string, Record<string, unknown>>} */ (raw);
  }
  const s = typeof raw === 'string' ? raw : String(raw);
  if (!s.trim()) return {};
  try {
    let o = JSON.parse(s);
    if (typeof o === 'string') {
      try {
        o = JSON.parse(o);
      } catch {
        return {};
      }
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    return /** @type {Record<string, Record<string, unknown>>} */ (o);
  } catch {
    return {};
  }
}

/**
 * cockpit / fusa / ccintern: Modulliste und Rechte für replaceUserAccessBundle aufbereiten.
 * @param {string[]} modulesAusInvite
 * @param {Record<string, Record<string, unknown>>} rightsAusInvite
 * @returns {{ modules: string[], rights: Record<string, Record<string, import('./rights-spec.js').RightsFlags>> }}
 */
export function normalizeInviteAccessForRedeem(modulesAusInvite, rightsAusInvite) {
  const modules = [];
  const seen = new Set();
  function addMod(m) {
    const x = typeof m === 'string' ? m.trim() : '';
    if (!x || !isValidModuleKey(x)) return;
    if (seen.has(x)) return;
    seen.add(x);
    modules.push(x);
  }
  if (Array.isArray(modulesAusInvite)) {
    for (const m of modulesAusInvite) {
      const nm = normalizeInviteModuleKey(m);
      if (nm) addMod(nm);
    }
  }
  const rIn = rightsAusInvite && typeof rightsAusInvite === 'object' && !Array.isArray(rightsAusInvite) ? rightsAusInvite : {};
  /** @type {Record<string, Record<string, import('./rights-spec.js').RightsFlags>>} */
  const rights = {};
  for (const modRaw of Object.keys(rIn)) {
    const mod = normalizeInviteModuleKey(modRaw);
    if (!mod || !isValidModuleKey(mod)) continue;
    const bereiche = rIn[modRaw];
    if (!bereiche || typeof bereiche !== 'object' || Array.isArray(bereiche)) continue;
    if (!rights[mod]) rights[mod] = {};
    let anyBereich = false;
    for (const bRaw of Object.keys(bereiche)) {
      const ber = normalizeInviteBereichKey(mod, bRaw);
      if (!ber) continue;
      const raw = bereiche[bRaw];
      const flags =
        raw === true || raw === 1
          ? normalizeRightsJson({ sehen: true })
          : normalizeRightsJson(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
      const prev = rights[mod][ber] || emptyRightsFlags();
      rights[mod][ber] = mergeRightsOr(prev, flags);
      const hatEtwas = Object.keys(flags).some((k) => Boolean(flags[/** @type {keyof typeof flags} */ (k)]));
      if (hatEtwas) anyBereich = true;
    }
    if (anyBereich) addMod(mod);
  }
  return { modules, rights };
}

/**
 * sqlite/mysql Row: Spaltennamen tolerant (Treiber/OS).
 * @param {Record<string, unknown>|null|undefined} inv
 * @param {string} canonical
 * @returns {unknown}
 */
export function inviteRowField(inv, canonical) {
  if (!inv || typeof inv !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(inv, canonical)) return inv[canonical];
  const low = canonical.toLowerCase();
  for (const k of Object.keys(inv)) {
    if (k.toLowerCase() === low) return inv[k];
  }
  return undefined;
}
