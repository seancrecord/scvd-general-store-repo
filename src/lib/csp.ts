/**
 * THE SCRIPT FENCE, ONE STRING (P7's own condition, extended by P8).
 *
 * The P7 ruling that let the store serve its first first-party script
 * attached a condition: shipping any script means shipping a CSP —
 * net risk down, not up. The storefront honoured it for /webmcp.js;
 * the till pages had been serving /till.js since rule 53 with no
 * fence at all, which was the same obligation unpaid. One constant
 * now, three doors (storefront, /try, the item pages), so the fence
 * cannot loosen on one page while a test watches another.
 *
 * 'self' only: the store's own scripts, nothing injected, nothing
 * embedded. JSON islands and JSON-LD blocks are data, not execution,
 * and pass untouched.
 */
export const FIRST_PARTY_SCRIPT_CSP =
  "script-src 'self'; object-src 'none'; base-uri 'none'";
