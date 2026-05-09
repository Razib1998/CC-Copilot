/**
 * Wandelt `modules_csv` (z. B. aus `GROUP_CONCAT(um.module)`) in ein Modul-String-Array um.
 * @param {string|null|undefined} csv
 * @returns {string[]}
 */
export function parseModulesCsv(csv) {
  if (csv == null || csv === '') return [];
  return String(csv)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
