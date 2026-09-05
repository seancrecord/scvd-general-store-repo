import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-07-28",
  what_was_wrong:
    "Five pages of the store's own back room had no way back to anything. Each rendered itself as the desk's tab, which draws the only link home as un-clickable bold, so landing on one left the keeper with the browser's back button.",
  how_long: "From the day each reading shipped.",
  found_by: "The keeper, unable to reach half his own office.",
  what_changed:
    "The navigation is now derived from one list rather than written per page, so a new page cannot be added without appearing in it. Four tests sweep every page: each reaches every other, each marks only itself, each keeps a way out.",
};
