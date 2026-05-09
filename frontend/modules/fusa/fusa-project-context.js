/**
 * Gemeinsamer FUSA-/Cockpit-Projektkontext in CCState (`project`).
 * Lädt `GET /projects/:id` → `your_access` (Rechte kommen nur von der API).
 */
import { apiFetch, setSessionActiveProjectId, syncCockpitAccessibleProjectsCache } from '../../core/auth/cc-auth-session.js';
import CCState from '../../core/state/state.js';
import { API_ROUTES } from '../../core/api/api-routes.js';

/**
 * @returns {{ id: string, name?: string|null, your_access?: object|null }|null}
 */
export function getFusaAppProject() {
  const p = CCState.get('project');
  if (!p || typeof p !== 'object' || p.id == null || String(p.id).trim() === '') return null;
  return /** @type {{ id: string, name?: string|null, your_access?: object|null }} */ (p);
}

/**
 * @param {string} projectId
 * @returns {Promise<{ id: string, name: string|null, your_access: object|null }|null>}
 */
export async function loadFusaProjectContext(projectId) {
  const id = projectId != null ? String(projectId).trim() : '';
  if (!id) return null;
  try {
    const r = await apiFetch(`${API_ROUTES.cockpit.projects}/${encodeURIComponent(id)}`);
    const proj = r && r.project && typeof r.project === 'object' ? r.project : null;
    const ya = r && r.your_access && typeof r.your_access === 'object' ? r.your_access : null;
    if (!proj || proj.id == null) return null;
    const ctx = {
      id: String(proj.id),
      name: proj.name != null ? String(proj.name) : null,
      your_access: ya,
    };
    CCState.set('project', ctx);
    setSessionActiveProjectId(ctx.id);
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Wählt ein gültiges Projekt (erst gespeichertes, sonst erstes aus Liste).
 * @param {{ id: string }[]} projects
 * @returns {Promise<string|null>} gewählte project id
 */
/**
 * Rechte für FUSA-UI-Leisten (nur aus `your_access`, keine Client-Logik).
 * @returns {Record<string, boolean>}
 */
export function getFusaToolbarPermissions() {
  const ctx = getFusaAppProject();
  const ya = ctx && ctx.your_access && typeof ctx.your_access === 'object' ? ctx.your_access : null;
  return {
    canView: true,
    canEdit: !!(ya && ya.can_edit),
    canCreate: !!(ya && ya.can_create_auftraege),
  };
}

export async function ensureFusaProjectSelection(projects) {
  syncCockpitAccessibleProjectsCache(Array.isArray(projects) ? projects : []);
  const list = Array.isArray(projects) ? projects.filter(p => p && p.id != null) : [];
  if (!list.length) {
    CCState.set('project', null);
    setSessionActiveProjectId(null);
    return null;
  }
  const cur = getFusaAppProject();
  const curId = cur && cur.id ? String(cur.id) : '';
  const stillOk = curId && list.some(p => String(p.id) === curId);
  const pickId = stillOk ? curId : String(list[0].id);
  const ctx = await loadFusaProjectContext(pickId);
  if (!ctx || !ctx.id) {
    CCState.set('project', null);
    setSessionActiveProjectId(null);
    return null;
  }
  return String(ctx.id);
}

