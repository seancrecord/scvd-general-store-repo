import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-09-04",
  what_was_wrong:
    "The source register at /sources, and the ward page beside it, said the CDP discovery feed had never answered this store: status never_answered, roster_disagrees true, and on the keeper's page the line \"Not answering: discovery.\" The feed had answered every one of the five rounds the register read. In W32 through W34 its paging served page one to every offset and the round kept 100 rows; in W35 and W36 it answered all sixty pages the read asked for, 6,000 rows, and declared more. The census rightly refused both as short lists, since a listing cut short cannot tell a delisting from a next page, and wrote null. The register, built the same day, had two words for a null, stale and never_answered, and neither means answered short. So a feed that had outgrown our read was published as a feed that was down, and the keeper read it as one.",
  how_long:
    "The register opened on 2026-09-04 and carried the word for part of that day. The read it described had been short for five rounds: page one only from W32, and capped at 6,000 rows of a larger listing from W35. Every round said coverage_suspect and its row count, so the shortfall was on the record the whole time; the word for it was not.",
  found_by:
    "The keeper, pressing /admin/ward after the sweep shipped, pasted the line and asked whether everything else was done. Reading the five rounds back showed listed_resources at exactly 100 and exactly 6,000, the two shapes of a read that stopped, under a status that said nothing had ever come back.",
  what_changed:
    "The census writes WHY beside every null (per_source[].why: unreadable, capped or pagination), and the register gained a fifth status the same day, partial, for a feed that answered and whose short list the census refused; /sources and /admin/ward say it in words. The read itself no longer caps: the long walk's start firing was given a 300-page cap the same day, and past that the walk reads the feed across hourly firings on a stored cursor until the feed's own declared total is reached, so a listing of any size is read whole a few hours into the week. The walk's roster is capped at 2,000 feed doors, where the KV value that holds a week's evidence would otherwise fail near 3,900, and the round says when that binds; the census still counts every host the feed named. test/long-walk.spec.ts reads a feed larger than one pass over two firings and holds the cap announced; test/population.spec.ts holds that the reason rides beside the null and never beside an answer.",
};
