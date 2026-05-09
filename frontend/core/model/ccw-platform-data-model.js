/**
 * @file CC Cockpit — Plattform-Datenmodell (fachliche Referenz, Phase „Anweisung 1“).
 *
 * Nur Struktur / Begriffe — keine Rechteauswertung, keine API, keine UI.
 * Zentrale Zuordnung von Rechten, Modulen und Apps erfolgt ausschließlich über {@link PROJECT_ACCESS}.
 * Rolle, Einladung, Gerät und Session bleiben getrennte Entitäten (keine Vermischung der Lebenszyklen).
 *
 * Hinweis: Read-Only-DEV (`dev-snapshot.json`, siehe `frontend/data/DEV-SNAPSHOT-FORMAT.md`) nutzt
 * kalenderorientierte `projects[]`-Objekte; die hier definierte {@link PROJECT}-Entität ist die
 * verbindliche Plattform-Sicht und kann später per Persistenz/Adapter abgebildet werden.
 */

/** @typedef {string} EntityIdString Eindeutige ID (String), Format Sache des Backends. */
/** @typedef {string|null} NullableProjectId `null` = firmenweiter Zugang ohne Projektbezug. */

/**
 * Projekt (eigene Entität; Referenz für `projectId` in {@link PROJECT_ACCESS} und {@link INVITATION}).
 *
 * @typedef {object} PROJECT
 * @property {EntityIdString} id
 * @property {EntityIdString} companyId Zugehörige Firma.
 * @property {string} name
 * @property {string} status z. B. Entwurf, aktiv, archiviert — Werte Backend/Enum.
 * @property {string} createdAt ISO-8601
 *
 * (Bewusst nicht modelliert in dieser Version: description, type, startDate, endDate.)
 */

/**
 * Zentrale Steuerung: Firma, optional Projekt, Rolle, Module, Apps, Rechte.
 * Mit `projectId` gesetzt = projektspezifischer Zugang; ohne bzw. `null` = firmenweiter Zugang.
 *
 * @typedef {object} PROJECT_ACCESS
 * @property {EntityIdString} id
 * @property {EntityIdString} userId
 * @property {EntityIdString} companyId
 * @property {NullableProjectId} projectId Optional — `null`/fehlend = firmenweit.
 * @property {EntityIdString} roleId
 *
 * @property {boolean} hasCcInternAccess
 * @property {boolean} hasFusaAccess
 * @property {boolean} hasMesseFlowAccess
 * @property {boolean} hasCockpitAccess
 *
 * @property {boolean} hasCcInternAppAccess
 * @property {boolean} hasFusaWerkstattAppAccess
 *
 * @property {boolean} canView
 * @property {boolean} canCreate
 * @property {boolean} canEdit
 * @property {boolean} canDelete
 * @property {boolean} canUpload
 * @property {boolean} canApprove
 * @property {boolean} canSeePrices
 *
 * @property {string} createdAt ISO-8601
 * @property {string} updatedAt ISO-8601
 */

/**
 * Geplante Rechte nach Einladungsannahme — fachlich an {@link PROJECT_ACCESS} angelehnt,
 * ohne zusätzliche Rechteebenen außerhalb davon.
 *
 * @typedef {object} InvitationIntendedAccess
 * @property {boolean} [hasCcInternAccess]
 * @property {boolean} [hasFusaAccess]
 * @property {boolean} [hasMesseFlowAccess]
 * @property {boolean} [hasCockpitAccess]
 * @property {boolean} [hasCcInternAppAccess]
 * @property {boolean} [hasFusaWerkstattAppAccess]
 * @property {boolean} [canView]
 * @property {boolean} [canCreate]
 * @property {boolean} [canEdit]
 * @property {boolean} [canDelete]
 * @property {boolean} [canUpload]
 * @property {boolean} [canApprove]
 * @property {boolean} [canSeePrices]
 */

/**
 * Einladung (eigener Datensatz; nicht mit {@link ROLE} oder {@link DEVICE} verwechseln).
 *
 * **inviteCode:** verbindlicher Standard **6-stellig** (kein 4-stelliger Standard).
 *
 * @typedef {object} INVITATION
 * @property {EntityIdString} id
 * @property {string} email
 * @property {string} [phone] Optional.
 * @property {EntityIdString} companyId
 * @property {NullableProjectId} [projectId] Optional.
 * @property {EntityIdString} roleId
 * @property {InvitationIntendedAccess} intendedAccess
 * @property {string} token z. B. sicherer Annahme-Link-Token (Backend-Format).
 * @property {string} inviteCode **Genau 6 Zeichen** (Standard; z. B. numerisch — Produkt festlegen).
 * @property {string} status z. B. pending, accepted, expired, revoked.
 * @property {EntityIdString} createdBy User-Id des Einladenden.
 * @property {string} createdAt ISO-8601
 * @property {string} expiresAt ISO-8601
 * @property {string|null} [acceptedAt] ISO-8601 wenn angenommen.
 * @property {string|null} [acceptedVia] z. B. `email`, `link`, `app` — Werte Backend.
 */

/**
 * @typedef {object} USER
 * @property {EntityIdString} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 * @property {string} [phone]
 * @property {string} status
 * @property {string} passwordHash
 * @property {number} tokenVersion Invalidierung alter Tokens bei Passwort-/Security-Events.
 * @property {string} createdAt ISO-8601
 * @property {string|null} [lastLoginAt] ISO-8601
 */

/**
 * @typedef {object} COMPANY
 * @property {EntityIdString} id
 * @property {string} name
 * @property {string} type
 * @property {string} status
 * @property {string} [address]
 * @property {string} [contactPerson]
 * @property {string} [email]
 * @property {string} [phone]
 */

/**
 * @typedef {object} ROLE
 * @property {EntityIdString} id
 * @property {string} name
 * @property {string} [description]
 */

/**
 * Session / ausgestelltes Token (Server-seitig typ. nur Hash gespeichert).
 *
 * @typedef {object} SESSION
 * @property {EntityIdString} id
 * @property {EntityIdString} userId
 * @property {string} tokenHash
 * @property {string} [deviceType]
 * @property {string} [deviceName]
 * @property {string} [ipAddress]
 * @property {string} lastActiveAt ISO-8601
 * @property {string} expiresAt ISO-8601
 * @property {boolean} isActive
 */

/**
 * Registriertes Gerät (getrennt von SESSION; Gerät kann mehrere Sessions im Lebenslauf haben).
 *
 * @typedef {object} DEVICE
 * @property {EntityIdString} id
 * @property {EntityIdString} userId
 * @property {string} name
 * @property {string} type
 * @property {string} [lastSeenAt] ISO-8601
 * @property {boolean} isActive
 */

export {};
