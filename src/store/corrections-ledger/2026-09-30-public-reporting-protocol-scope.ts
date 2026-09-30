import type { Correction } from "./types";
export const correction: Correction = {
  date: "2026-09-30",
  what_was_wrong:
    "Some reports described different populations as the same sales count. Monthly admin totals and the pulse omitted native MPP; the monthly rail series was x402-only without saying so; the stats method described per-item rows as uniformly raw even though native MPP house corrections were applied. A valid MPP reading could also cause stats to publish a network split after contradictory x402 counters had made that split unavailable. The rails chart included other recorded networks in its totals without drawing them. The pulse's percentage used recorded offers while its adjacent '1 in' explanation could use corrected offers. The store-month page linked dated JSON paths that returned 404.",
  how_long:
    "Present in the source reviewed September 29–30. The mixed-protocol scope errors matter once native MPP sales are recorded; the rate and dated-link defects predate this review. Their first deployed occurrences were not established by this pass.",
  found_by:
    "The keeper's request to review admin and public reporting; local fixtures reproduced the discrepancies, including a dated report whose advertised JSON link returned 404.",
  what_changed:
    "The September 29–30 source repairs add separate combined and native monthly totals while retaining the x402 funnel, preserve the network refusal on contradictory counters, draw the other-network bucket, use one denominator for both rate expressions, and repair the dated JSON route. New monthly signatures carry the additional totals. Older signed records remain byte-for-byte unchanged and are labelled as not retaining combined monthly sales. Monthly rail history stays explicitly x402-only and before later house reclassification. The public-reporting regressions in test/public-reporting-review.spec.ts witnessed the failures before their fixes. This entry records the source repair; deployment and live readback are tracked separately in ROADMAP.md.",
};
