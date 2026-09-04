import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-07-28",
  what_was_wrong:
    'The census page told the keeper that "the decline reasons are on the desk." There was no desk. The reasons had been recorded since the instrument went in and nothing anywhere rendered them.',
  how_long: "From the day the census shipped until somebody went looking.",
  found_by:
    "The keeper, following our own instruction and hitting nothing.",
  what_changed:
    "The decline desk was built, and a test now asserts that every page promising a link actually links somewhere that exists. A sentence pointing at a page nobody built now fails the build.",
};
