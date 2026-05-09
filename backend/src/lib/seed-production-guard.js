/**
 * Verhindert versehentliches Ausführen von Dev-Seeds in Produktion.
 * Freigabe nur mit explizitem Flag (bewusst).
 * @returns {{ isProduction: boolean, allowProdSeed: boolean }}
 */
export function assertSeedSafeEnvironment(scriptLabel) {
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const allowProdSeed = String(process.env.ALLOW_DEV_SEEDS_IN_PRODUCTION || '').trim() === '1';
  if (isProduction && !allowProdSeed) {
    console.error(
      `[${scriptLabel}] Abbruch: NODE_ENV=production. Diese Skripte sind für lokale/Dev-Daten gedacht. ` +
        'Nicht in Produktion ausführen — oder nach Prüfung ALLOW_DEV_SEEDS_IN_PRODUCTION=1 setzen.',
    );
    process.exit(1);
  }
  return { isProduction, allowProdSeed };
}
