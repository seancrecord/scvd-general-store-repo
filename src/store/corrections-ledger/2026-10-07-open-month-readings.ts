import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-10-07",
  what_was_wrong:
    "The monthly corpus page called the latest available signed week a reading at month end even while the month was open. The growth desk compared a running month's totals with the previous complete month and could declare the growth hypothesis failed, or label instruments as falling, before the month ended.",
  how_long:
    "The monthly corpus wording dated from its September 3 introduction. The growth desk's month comparisons were present before the keeper identified the unfinished October comparison on October 6.",
  found_by:
    "The keeper questioned a failure verdict six days into October. Checking adjacent comparisons found the same period mismatch in instrument deltas and demand movements, and premature month-end wording on the public corpus page.",
  what_changed:
    "The growth desk labels the open month as month to date and withholds hypothesis verdicts, instrument deltas and rise/fall lists until the UTC month closes. Counts remain visible. The corpus page describes the latest available week, labels an open month, and returns month_complete in JSON and markdown, calculated outside the corpus cache. Signed snapshots and their counts are unchanged. Tests cover the open month, its final day and the UTC closing boundary.",
};
