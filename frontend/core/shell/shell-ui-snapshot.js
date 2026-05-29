/**
 * Minimaler Snapshot für `sidebar.js` / andere Module ohne Import von `cockpit-shell.js`
 * (Zirkularität vermeiden). Wird bei jedem `deriveShellUiAccess` aus my-rights gesetzt.
 */

/** @type {null | { isMitarbeiterAppOnlyShell?: boolean }} */
let shellUiAccessSnapshot = null;

/** @param {null | { isMitarbeiterAppOnlyShell?: boolean }} ui */
export function setShellUiAccessSnapshot(ui) {
  shellUiAccessSnapshot = ui;
}

export function getShellUiAccessSnapshot() {
  return shellUiAccessSnapshot;
}
