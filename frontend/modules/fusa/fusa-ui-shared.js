/**

 * Gemeinsame FUSA-UI-Hilfen — nur Darstellung, keine Rechteberechnung.

 * `permissions` stammt immer aus `getFusaEffectivePermissions` / init-Pipeline.

 */



export function esc(s) {

  if (s == null || s === '') return '';

  return String(s)

    .replace(/&/g, '&amp;')

    .replace(/</g, '&lt;')

    .replace(/>/g, '&gt;')

    .replace(/"/g, '&quot;');

}



/**

 * @param {Record<string, boolean>} permissions — effektive FUSA-Feinrechte

 */

export function renderFusaActionToolbarHtml(permissions) {

  const p = permissions || {};

  const parts = [];

  if (p.canEdit) {

    parts.push(

      '<button type="button" class="btn secondary sm" disabled aria-disabled="true">Bearbeiten</button>',

    );

  }

  if (p.canCreate) {

    parts.push(

      '<button type="button" class="btn primary sm" disabled aria-disabled="true">Neu anlegen</button>',

    );

  }

  if (p.canDelete) {

    parts.push(

      '<button type="button" class="btn ghost sm" disabled aria-disabled="true">Löschen</button>',

    );

  }

  if (p.canUpload) {

    parts.push(

      '<button type="button" class="btn secondary sm" disabled aria-disabled="true">Datei hochladen</button>',

    );

  }

  if (p.canApprove) {

    parts.push(

      '<button type="button" class="btn primary sm" disabled aria-disabled="true">Freigeben</button>',

    );

  }

  const readOnlyStrip =

    p.canView && !p.canEdit && !p.canCreate

      ? `<p class="ccw-fusa-readonly-hint" role="status" style="margin:10px 0 0;font-size:13px;color:var(--muted,#64748b);border:1px solid var(--line,#e2e8f0);border-radius:8px;padding:8px 12px;background:#f8fafc;">Nur Lesezugriff — Anlegen oder Bearbeiten ist für diesen Kontext nicht freigeschaltet.</p>`

      : '';

  if (!parts.length && !readOnlyStrip) return '';

  const bar = parts.length

    ? `<div class="ccw-fusa-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;">${parts.join('')}</div>`

    : '';

  return `${bar}${readOnlyStrip}`;

}



/**

 * @param {Record<string, boolean>} permissions

 * @param {string} label

 * @param {string} amountDisplay — bereits formatierter Betrag (nur wenn erlaubt verwenden)

 */

export function renderPriceLineHtml(permissions, label, amountDisplay) {

  if (!permissions?.canSeePrices) return '';

  return `<p class="ccw-fusa-price-line" style="margin:8px 0;font-size:14px;">${esc(label)}: <strong>${esc(amountDisplay)}</strong></p>`;

}



/** Einheitlicher Leerzustand — Seite bleibt sichtbar (Toolbar + dieser Block). */

export function renderFusaEmptyStateHtml(message = 'Keine Daten vorhanden') {

  return `<div class="ccw-fusa-empty empty" role="status">${esc(message)}</div>`;

}

