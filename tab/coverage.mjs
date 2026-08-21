import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { defaultTabPath, sidecarPath } from "./store.mjs";

/**
 * THE COVERAGE LEDGER — how the tab measures what it CANNOT see.
 * (Lived in tools.mjs until the sweep tally arrived; the record and
 * its reader are their own concern, and both tools.mjs and sweep.mjs
 * need them. tools.mjs re-exports recordCoverage, so nothing calling
 * it moved.)
 *
 * The sweep reports back: which addresses it read, how far it got,
 * and — the load-bearing one — money-shaped mail it could not
 * attribute to any tool. That last number is a direct measurement of
 * the blind spot, requiring no bank and no knowledge of what was
 * missed: if fourteen letters carried a price and matched nothing,
 * the gap is fourteen, not a shrug.
 *
 * Stored as a plain KEY, not an event: it describes the INSTRUMENT,
 * not the builder's commerce, and mixing the two would let a broken
 * sweep look like a cancelled tool.
 */
export function recordCoverage(input, path = defaultTabPath()) {
  /**
   * APPENDED, NOT OVERWRITTEN (red team F2). The first cut kept a
   * single slot — a gauge with no history, which cannot answer the
   * only question the keeper asked of it: is the number moving toward
   * 2%? Coverage is a time series or it is decoration.
   */
  const record = {
    at: new Date().toISOString(),
    addresses_swept: Array.isArray(input?.addresses_swept)
      ? input.addresses_swept
      : [],
    /**
     * The sweep's WINDOW, which F1 proved load-bearing: unattributed
     * money means nothing without the span it was seen over.
     */
    window_from: input?.window_from ?? null,
    window_to: input?.window_to ?? new Date().toISOString(),
    matched: Number.isFinite(input?.matched) ? input.matched : 0,
    /** Attributed spend IN THIS WINDOW, for a like-for-like ratio. */
    attributed_amount: Number(input?.attributed_amount) || 0,
    unmatched_transactional: Array.isArray(input?.unmatched_transactional)
      ? input.unmatched_transactional.map((row) => ({
          amount: Number(row?.amount) || 0,
          currency: String(row?.currency ?? "USD"),
          sender: String(row?.sender ?? "").slice(0, 120),
        }))
      : [],
    /**
     * THE DENOMINATOR, and the reason this pair exists at all.
     *
     * A sweep that filters before it counts reports a flattering
     * gap: drop the unparseable mail on the floor, and
     * `variability_pct` measures the extractor's confidence rather
     * than the tab's coverage. The counting obligation was a
     * paragraph in a doc, which is another way of saying it was
     * nothing.
     *
     * So it becomes arithmetic the sweep has to satisfy:
     *
     *   scanned = matched + unmatched_transactional + not_transactional
     *
     * Anything left over is `unclassified` — mail the sweep LOOKED AT
     * and never placed in any bucket. It is published rather than
     * absorbed, because that residue is exactly the pre-filter hole.
     * A sweep that declines to report `scanned` gets null, and the
     * refusal to count is itself the finding.
     */
    scanned: Number.isFinite(input?.scanned) ? input.scanned : null,
    not_transactional: Number.isFinite(input?.not_transactional)
      ? input.not_transactional
      : 0,
  };
  /**
   * UNCLAMPED. The residue can be NEGATIVE — buckets summing past
   * scanned means the sweep counted a message twice or misstated its
   * denominator — and Math.max(0, …) used to absorb exactly that
   * defect and then report books_balanced:true over it (dark team
   * 2026-08-21). A negative residue is published as its own finding.
   */
  record.unclassified =
    record.scanned === null
      ? null
      : record.scanned -
        record.matched -
        record.unmatched_transactional.length -
        record.not_transactional;
  const coveragePath = sidecarPath(path, ".coverage.jsonl");
  mkdirSync(dirname(coveragePath), { recursive: true }); // F4: fresh install
  appendFileSync(coveragePath, `${JSON.stringify(record)}\n`, "utf8");
  return {
    recorded: true,
    unattributed_count: record.unmatched_transactional.length,
    scanned: record.scanned,
    unclassified: record.unclassified,
    books_balanced: record.scanned !== null && record.unclassified === 0,
    note:
      record.scanned === null
        ? "Recorded, but the sweep did not say how many messages it looked at — so the gap it reports cannot be checked against anything. Pass `scanned` and `not_transactional`: every message the sweep read belongs in exactly one bucket, and a denominator nobody states is a denominator nobody can audit."
        : record.unclassified < 0
          ? `Recorded, and the books do NOT balance: the buckets sum to ${-record.unclassified} MORE than scanned. A message was counted twice, or scanned is understated — either way the denominator is wrong and every percentage built on it is too.`
          : record.unclassified > 0
            ? `Recorded. ${record.unclassified} message${record.unclassified === 1 ? "" : "s"} were read and never placed in any bucket — that residue is published, not absorbed, because it is exactly where a pre-filter hides.`
            : "Recorded and the books balance: every message the sweep read is accounted for in one bucket. Coverage is appended beside the tab, never mixed into it, so the gap can be watched over time.",
  };
}

/** Every sweep ever reported, oldest first. */
export function readCoverageHistory(path) {
  try {
    return readFileSync(sidecarPath(path, ".coverage.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
