import { randomUUID } from 'node:crypto';
import { syncFusaTerminAndLinkedCcIntern } from './auftrag-kalender-sync.js';

const DEFAULT_PRODUKTION_SCHRITT = 'grafik';

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
 * Creates or completes the CC Intern/production side for a FUSA Auftrag.
 *
 * Idempotent by `(fusa_auftrag_id, firma_id)`:
 * - creates a linked `ccintern_auftraege` row if missing
 * - ensures it has a production workflow step
 * - ensures one `produktion_auftraege` row exists
 * - syncs FUSA/CC Intern calendar dates
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
      status: 'offen',
      schritt: DEFAULT_PRODUKTION_SCHRITT,
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
      schritt: DEFAULT_PRODUKTION_SCHRITT,
      status: nullableTrimmed(linked.status) || 'offen',
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

  let production = null;
  let productionCreated = false;
  const linkedId = requiredTrimmed(linked?.id);
  if (linkedId && typeof store.countProduktionAuftraegeByFirma === 'function') {
    const count = await store.countProduktionAuftraegeByFirma(firmaId, { auftragId: linkedId });
    if (Number(count || 0) > 0) {
      const rows =
        typeof store.listProduktionAuftraegeByFirma === 'function'
          ? await store.listProduktionAuftraegeByFirma(firmaId, { auftragId: linkedId, offset: 0, limit: 1 })
          : [];
      production = Array.isArray(rows) && rows.length ? rows[0] : null;
    } else if (typeof store.insertProduktionAuftrag === 'function') {
      production = await store.insertProduktionAuftrag({
        auftrag_id: linkedId,
        schritt: requiredTrimmed(linked?.schritt) || DEFAULT_PRODUKTION_SCHRITT,
        fortschritt: 0,
        verantwortlich: null,
        notiz: `Automatisch aus FUSA-Auftrag ${fusaAuftragId}`,
        gestartet_am: null,
        abgeschlossen_am: null,
        firma_id: firmaId,
      });
      productionCreated = true;
    }
  }

  return {
    status: ccinternCreated ? 'created' : 'linked',
    ccinternCreated,
    productionCreated,
    linked: linked || null,
    production: production || null,
  };
}
