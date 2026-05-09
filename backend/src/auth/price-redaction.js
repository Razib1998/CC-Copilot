/**
 * Flache Redaction bekannter Preisfeldnamen (ohne echte Geschäftsfelder zu erfinden).
 * Tiefe Objekte werden nicht rekursiv bereinigt — Erweiterung später möglich.
 */
const PRICE_KEY_SET = new Set([
  'price',
  'preis',
  'unit_price',
  'net_price',
  'gross_price',
  'amount',
  'betrag',
  'total',
  'summe',
  'cost',
  'kosten',
  'betrag_netto',
]);

/**
 * @param {Record<string, unknown>|null|undefined} obj
 * @param {boolean} canViewPrices
 * @returns {Record<string, unknown>|null|undefined}
 */
export function redactPricesInPlainObject(obj, canViewPrices) {
  if (canViewPrices || obj == null || typeof obj !== 'object') {
    return obj == null ? obj : { ...obj };
  }
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (PRICE_KEY_SET.has(String(k).toLowerCase())) {
      delete out[k];
    }
  }
  return out;
}
