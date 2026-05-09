/**
 * Persistente Warteschlange für Werkstatt-Hinweise zum Beklebungstermin (kein SMTP im Cockpit).
 * Ein Zeile = ein JSON-Objekt in `data/werkstatt-beklebung-mail-queue.jsonl` — später von einem Mail-Worker versendbar.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoBackendRoot = path.join(__dirname, '..', '..');
const dataDir = path.join(repoBackendRoot, 'data');
const queuePath = path.join(dataDir, 'werkstatt-beklebung-mail-queue.jsonl');

/**
 * @param {unknown} s
 */
function safeJsonParseObj(s) {
  try {
    const o = JSON.parse(String(s ?? ''));
    return o && typeof o === 'object' && !Array.isArray(o) ? /** @type {Record<string, unknown>} */ (o) : {};
  } catch {
    return {};
  }
}

/**
 * @param {unknown} v
 */
function toYmd(v) {
  if (v == null) return '';
  const t = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}

/**
 * @param {unknown} s
 */
function emailLooksPlausible(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s ?? '').trim());
}

/**
 * Nach erfolgreichem POST/PATCH: wenn Termin und/oder Werkstatt-Mail neu oder geändert → Outbox-Zeile.
 *
 * @param {{ vorherExtraStr: string|null|undefined, nachherRow: Record<string, unknown> }} p
 */
export function maybeEnqueueWerkstattBeklebungHinweis(p) {
  const row = p.nachherRow && typeof p.nachherRow === 'object' ? p.nachherRow : {};
  const next = safeJsonParseObj(row.fusa_extra_json);
  const prev = safeJsonParseObj(p.vorherExtraStr);
  const to = String(next.werkstatt_email ?? '').trim();
  const term = toYmd(next.beklebung_termin);
  if (!to || !emailLooksPlausible(to) || !term) return;
  const prevTerm = toYmd(prev.beklebung_termin);
  const prevTo = String(prev.werkstatt_email ?? '').trim();
  if (term === prevTerm && to === prevTo && prevTerm) return;

  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {
    /* ignore */
  }

  const title = row.title != null ? String(row.title) : '';
  const kunde = row.kunde_name != null ? String(row.kunde_name) : '';
  const depot = next.depot != null ? String(next.depot) : '';
  const wsLabel = next.werkstatt_label != null ? String(next.werkstatt_label) : '';
  let fzSummary = '';
  try {
    const a = JSON.parse(String(row.fusa_fahrzeug_ids ?? '[]'));
    fzSummary = Array.isArray(a) ? `${a.length} Fahrzeug(e) (IDs im Auftrag)` : '';
  } catch {
    fzSummary = '';
  }
  const subject = `[CC Cockpit] Beklebungstermin ${term} — ${title || 'Auftrag'}`;
  const body = [
    `Auftrag: ${title || '—'}`,
    `Kunde: ${kunde || '—'}`,
    `Fahrzeuge: ${fzSummary || '—'}`,
    `Depot: ${depot || '—'}`,
    `Werkstatt: ${wsLabel || '—'}`,
    '',
    `Geplanter Beklebungstermin: ${term}`,
    '',
    'Bitte den Termin bestätigen oder bei Bedarf verschieben und den Auftrag im System anpassen.',
  ].join('\n');

  const entry = {
    kind: 'werkstatt_beklebung_hinweis',
    ts: new Date().toISOString(),
    auftrag_id: row.id != null ? String(row.id) : '',
    to_email: to,
    subject,
    body_text: body,
    meta: {
      beklebung_termin: term,
      beklebungstermin_status: next.beklebungstermin_status != null ? String(next.beklebungstermin_status) : null,
      project_id: row.project_id != null ? String(row.project_id) : null,
    },
  };
  fs.appendFileSync(queuePath, `${JSON.stringify(entry)}\n`, 'utf8');
  console.log('[werkstatt-outbox] Beklebung-Hinweis eingereiht →', queuePath);
}
