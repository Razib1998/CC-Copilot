/**

 * FUSA-Daten-Port — **nur** echte API (`createApiFusaDataPort`) oder **bewusst leere** Rückgaben.

 * Kein Lesen aus `state.projects` / Messeflow-Demo mehr.

 *

 * ─── Port-Vertrag — gleiche Rückgabetypen, Methoden liefern Promises ───

 *

 * @see fusa-api-data-port.js für Live-HTTP.

 */



/**

 * @typedef {object} FusaProjectBasics

 * @property {string} id

 * @property {string} [name]

 * @property {string} [status]

 * @property {string} [kunde]

 * @property {number} wallCount

 * @property {string} [firmaId] geplanter Anker zum zentralen Kundenstamm (Firmen-ID wie in firmenStamm)

 */



/**

 * @typedef {object} FusaAuftragRow

 * @property {string} id

 * @property {string} [name]

 * @property {string} [typ]

 * @property {string} [status]

 * @property {'auftraege'|'orders'} source

 * @property {string} [termin]

 * @property {string} [terminEnde]

 * @property {number|null} [betragCent]

 * @property {string} [abrechnungStatus]

 * @property {string} [firmaId] zentrale Kundenreferenz (Firmen-ID wie in firmenStamm); wenn gesetzt, UI nur über Stamm

 * @property {string} [kunde_name] optionales API-Anzeigefeld bis vollständige firmaId-Migration

 */



/**

 * @typedef {object} FusaWallRow

 * @property {string} id

 * @property {string} [name]

 * @property {number} [status]

 */



/**

 * @typedef {object} FusaDocumentCategory

 * @property {string} id

 * @property {string} label

 */



/**

 * @typedef {object} FusaDocumentListFilter

 * @property {string} [categoryId]

 * @property {string} [wallId]

 * @property {string} [auftragId]

 * @property {string} [fahrzeugId]

 */



/**

 * @typedef {object} FusaDocumentRow

 * @property {string} id

 * @property {string} name

 * @property {string} [categoryId]

 * @property {string} [categoryLabel]

 * @property {string} projectId

 * @property {string} [wallId]

 * @property {string} [wallName]

 * @property {'projekt'|'wand'|'auftrag'|'fahrzeug'} scopeType

 * @property {string|null} [auftragId]

 * @property {string|null} [fahrzeugId]

 * @property {string} [version]

 * @property {string} [workflowStatus]

 * @property {string} [uploadedAt]

 * @property {string} [uploadedByUserId]

 */



/**

 * @typedef {object} FusaCalendarRange

 * @property {string} [fromIso]

 * @property {string} [toIso]

 */



/**

 * @typedef {import('../../core/calendar/ccw-calendar-kernel.js').CcwCalendarEvent} CcwCalendarEvent

 */



/**

 * @typedef {object} FusaQuarterlyBillingQuery

 * @property {number} [year]

 * @property {number} [quarter]

 */



/**

 * @typedef {object} FusaQuarterlyPositionRow

 * @property {string} id

 * @property {string} positionLabel

 * @property {string} assignmentLabel

 * @property {string|null} abrechnungStatus

 * @property {number|null} betragCent

 */



/**

 * @typedef {object} FusaQuarterlyBilling

 * @property {string} projectId

 * @property {number} year

 * @property {number} quarter

 * @property {string} periodLabel

 * @property {string} periodFromIso

 * @property {string} periodToIso

 * @property {FusaQuarterlyPositionRow[]} positions

 * @property {number|null} summeCent

 * @property {'demo_unfiltered'|'period_filtered'} [dataScope]

 * @property {string} [dataScopeNote]

 */



/**

 * @typedef {object} FusaDataPort

 * @property {(projectId: string) => Promise<FusaProjectBasics | null>} getProjectBasics

 * @property {(projectId: string) => Promise<FusaAuftragRow[]>} listAuftraegeForProject

 * @property {(projectId: string) => Promise<{ openWallCount: number, blockedWallCount: number }>} getWallStats

 * @property {(projectId: string) => Promise<FusaWallRow[]>} listWallsForProject

 * @property {() => Promise<FusaDocumentCategory[]>} listDocumentCategories

 * @property {(projectId: string, filter?: FusaDocumentListFilter | null) => Promise<FusaDocumentRow[]>} listDocumentsForProject

 * @property {(projectId: string, documentId: string) => Promise<FusaDocumentRow | null>} getDocumentById

 * @property {(projectId: string, range?: FusaCalendarRange | null) => Promise<CcwCalendarEvent[]>} listCalendarEventsForProject

 * @property {(projectId: string, query?:FusaQuarterlyBillingQuery | null) => Promise<FusaQuarterlyBilling | null>} getQuarterlyBillingForProject

 */



/** Leerer Port — kein Messeflow-State, keine Demo. */

export function createEmptyFusaDataPort() {

  const emptyStats = () => Promise.resolve({ openWallCount: 0, blockedWallCount: 0 });

  return {

    async getProjectBasics() {

      return null;

    },

    async listAuftraegeForProject() {

      return [];

    },

    async getWallStats() {

      return emptyStats();

    },

    async listWallsForProject() {

      return [];

    },

    async listDocumentCategories() {

      return [];

    },

    async listDocumentsForProject() {

      return [];

    },

    async getDocumentById() {

      return null;

    },

    async listCalendarEventsForProject() {

      return [];

    },

    async getQuarterlyBillingForProject() {

      return null;

    },

  };

}

