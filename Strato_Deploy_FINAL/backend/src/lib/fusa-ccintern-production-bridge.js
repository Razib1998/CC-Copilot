import { randomUUID } from 'node:crypto';
import { syncFusaTerminAndLinkedCcIntern } from './auftrag-kalender-sync.js';

const DEFAULT_CCINTERN_SCHRITT = 'grafik';

function requiredTrimmed(v) {
  if (v == null) return '';
  return String(v).trim();
}

function nullableTrimmed(v) {
  const s = requiredTrimmed(v);
  return s || null;
}

async function nextCcInternAuftragsnummer(store) {
  const year = new Date().getFullYear();
  const last = await store.getLastCcInternAuftragsnummerForYear(year);
  const m = String(last?.auftragsnummer || '').match(new RegExp(`^AU-${year}-(\\d{3})$`));
  const nextNr = (m ? Number.parseInt(m[1], 10) : 0) + 1;
  return `AU-${year}-${String(nextNr).padStart(3, '0')}`;
}

/**
 * Creates or completes the CC Intern preparation side for a FUSA Auftrag.
 *
 * Idempotent by `(fusa_auftrag_id, firma_id)`:
 * - creates a linked `ccintern_auftraege` row if missing
 * - ensures it has a workflow step for later staff assignment
 * - syncs FUSA/CC Intern calendar dates
 *
 * Production rows are created only by the explicit CC Intern handoff action.
 *
 * @param {{
 *   store: any;
 *   fusaAuftrag: Record<string, unknown>;
 *   actorUserId: string;
 * }} input
 */
export async function ensureCcInternProductionForFusaAuftrag(input) {
  const store = input?.store;
  const fusaAuftrag = input?.fusaAuftrag;
  const actorUserId = requiredTrimmed(input?.actorUserId);
  const fusaAuftragId = requiredTrimmed(fusaAuftrag?.id);
  const firmaId = requiredTrimmed(fusaAuftrag?.fusa_kunde_id);

  if (!store || !fusaAuftragId) {
    return { status: 'skipped', reason: 'missing_fusa_auftrag', linked: null, production: null };
  }
  if (!firmaId) {
    return { status: 'skipped', reason: 'missing_fusa_kunde_id', linked: null, production: null };
  }
  if (!actorUserId) {
    return { status: 'skipped', reason: 'missing_actor_user', linked: null, production: null };
  }

  let linked = await store.getCcInternAuftragByFusaAuftragId(fusaAuftragId, firmaId);
  let ccinternCreated = false;

  if (!linked) {
    const id = randomUUID();
    const kunde =
      requiredTrimmed(fusaAuftrag.kunde_name) ||
      requiredTrimmed(fusaAuftrag.title) ||
      `FUSA ${String(fusaAuftragId).slice(0, 8)}`;

    await store.insertCcInternAuftrag({
      id,
      auftragsnummer: await nextCcInternAuftragsnummer(store),
      kunde,
      status: 'vorbereitung',
      schritt: DEFAULT_CCINTERN_SCHRITT,
      prioritaet: null,
      lieferdatum: nullableTrimmed(fusaAuftrag.termin_ende),
      montage_datum: nullableTrimmed(fusaAuftrag.termin),
      bemerkung: `Automatisch aus FUSA-Auftrag ${fusaAuftragId}`,
      fusa_auftrag_id: fusaAuftragId,
      quelle: 'fusa',
      erstellt_von: actorUserId,
      firma_id: firmaId,
    });
    linked = await store.getCcInternAuftragById(id, firmaId);
    ccinternCreated = true;
  } else if (!requiredTrimmed(linked.schritt)) {
    linked = await store.updateCcInternAuftrag(linked.id, firmaId, {
      schritt: DEFAULT_CCINTERN_SCHRITT,
      status: nullableTrimmed(linked.status) || 'vorbereitung',
      quelle: 'fusa',
      fusa_auftrag_id: fusaAuftragId,
    });
  }

  await syncFusaTerminAndLinkedCcIntern({
    store,
    fusaAuftrag,
    linkedCcInternAuftrag: linked || null,
    actorUserId,
  });

  return {
    status: ccinternCreated ? 'created' : 'linked',
    ccinternCreated,
    productionCreated: false,
    linked: linked || null,
    production: null,
  };
}
