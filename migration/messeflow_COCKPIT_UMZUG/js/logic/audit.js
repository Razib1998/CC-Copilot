// ═══════════════════════════════════════════════════════
// VERLAUF / AUDIT-LOG (lokal, optional localStorage)
// ═══════════════════════════════════════════════════════

const MF_AUDIT_STORAGE = 'mf_audit_events_v1';
const MF_AUDIT_MAX = 500;

function mfAuditInit() {
  if (!MesseFlowState.auditLog) MesseFlowState.auditLog = [];
  try {
    const raw = localStorage.getItem(MF_AUDIT_STORAGE);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) {
      MesseFlowState.auditLog = arr.concat(MesseFlowState.auditLog || []);
    }
  } catch (e) { /* ignore */ }
}

function mfAuditPersist() {
  try {
    if (!MesseFlowState.auditLog) return;
    const slice = MesseFlowState.auditLog.slice(0, MF_AUDIT_MAX);
    localStorage.setItem(MF_AUDIT_STORAGE, JSON.stringify(slice));
  } catch (e) { /* ignore */ }
}

/**
 * @param {{ action: string, projectId?: string, wallId?: string, meta?: object, actorUserId?: string }} row
 */
function mfAudit(row) {
  const u = row.actorUserId
    ? (typeof USERS !== 'undefined' ? USERS.find(x => x.id === row.actorUserId) : null)
    : (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
  const entry = {
    id: 'a' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    ts: new Date().toISOString(),
    tsDisplay: typeof nowStr === 'function' ? nowStr() : new Date().toLocaleString('de-DE'),
    userId: u?.id || null,
    userName: u?.name || 'System',
    action: row.action,
    projectId: row.projectId || null,
    wallId: row.wallId || null,
    meta: row.meta && typeof row.meta === 'object' ? { ...row.meta } : null,
  };
  if (!MesseFlowState.auditLog) MesseFlowState.auditLog = [];
  MesseFlowState.auditLog.unshift(entry);
  if (MesseFlowState.auditLog.length > MF_AUDIT_MAX) MesseFlowState.auditLog.length = MF_AUDIT_MAX;
  mfAuditPersist();
}

function mfAuditForProject(projectId) {
  const list = MesseFlowState.auditLog || [];
  return list.filter(e => e.projectId === projectId);
}

window.mfAuditInit = mfAuditInit;
window.mfAudit = mfAudit;
window.mfAuditForProject = mfAuditForProject;
window.mfAuditPersist = mfAuditPersist;
