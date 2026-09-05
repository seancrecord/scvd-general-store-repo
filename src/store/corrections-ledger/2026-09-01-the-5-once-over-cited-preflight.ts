import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-09-01",
  what_was_wrong:
    "The $5 Once-Over cited preflight-v1 as its headline battery while the weekly census had applied preflight-v2 since 2026-08-24. Same GET, same bytes, different headline: a door with a dollar-typed amount (or any other v2-only fold) could buy a signed ready the same week the corpus called it not_ready. The paid report already computed the v2 score and hid it in also_under as DISAGREED — so the contradiction was visible inside the artifact and still published as ready on the face a buyer hands to a stranger. Same class as 0.14: the check existed; the flagship record did not consume it.",
  how_long:
    "From the Once-Over's listing through 2026-09-01. Every report signed before this date still cites preflight-v1 and keeps that citation forever; we do not resign old artifacts.",
  found_by:
    "The store's own roadmap, as N1 / leftover #82, after the census citation was corrected on 2026-08-26 and the paid headline was left on the loose battery.",
  what_changed:
    "AUDIT_CRITERIA_VERSION is now PREFLIGHT_BATTERY_NEXT, the same string the census cites. The paid headline and the sample headline are the v2 set; also_under carries the frozen v1 overlap. A dated note on /criteria records the instrument change. test/battery-inside-the-bytes.spec.ts fails the build if the two producers part again, and test/service-audit.spec.ts fails the paid door on a v1-only fixture (dollar-typed amount) so deleting the fold turns a signed ready green in a test that watched it happen.",
};
