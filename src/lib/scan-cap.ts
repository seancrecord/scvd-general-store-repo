/**
 * THE DEEPER SCAN (2026-09-28). The census and the recount both walk
 * the raw `evt:` rows newest-first and stop at a cap, so a keeper
 * reading either page on a loud day sees only the newest slice: on
 * 2026-09-28 the default reached back 46 minutes, and the 11,000
 * organic 402s that had just been booked lay entirely beyond it —
 * every one with a row, none within reach of the only two pages that
 * name a client. `?rows=N` on either page asks for a deeper scan, and
 * this is the one place that says how deep it may go.
 *
 * The ceiling is a subrequest budget, not a taste: each 1,000 rows is
 * one list call plus ten bulk reads of a hundred keys, so the deepest
 * scan costs about 330 subrequests against the Worker's thousand.
 * Any number the query cannot be read as, or is not positive, gets
 * the default: a page that silently read nothing would be worse than
 * one that read the usual slice.
 */
export const DEFAULT_SCAN_CAP = 3000;
export const DEEPEST_SCAN_CAP = 30_000;

export function scanCapFrom(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) {
    return DEFAULT_SCAN_CAP;
  }
  const asked = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(asked) || asked <= 0) {
    return DEFAULT_SCAN_CAP;
  }
  return Math.min(asked, DEEPEST_SCAN_CAP);
}

/** The prose a capped scan appends, so the knob is on the page, not in the source. */
export function deeperScanNote(capped: boolean): string {
  return capped
    ? ` Ask for more with ?rows=N, up to ${DEEPEST_SCAN_CAP.toLocaleString("en-US")}.`
    : "";
}
