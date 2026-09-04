import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-28",
  what_was_wrong:
    "The 2026-08-26 correction on this page promised 'a test that holds the citation to account… so a row can never again name criteria the code does not apply.' The test that shipped compared the battery's check list to a function that returned that same list — a constant checked against itself. Deleting the checks from the probe would have left it green. The promise in this record was not kept by the mechanism that shipped beside it, which is the worst place in the store for that to be true.",
  how_long: "Since that correction shipped, 2026-08-26 to 2026-08-28.",
  found_by:
    "The instrument audit, reading the test the correction cites against the code it claims to hold.",
  what_changed:
    "The citation is held by behavior now: a stubbed door with an unpayable payTo, a decimal amount, and a testnet network must each come back not_ready through the census's own probeHost (test/census-folds-the-trio.spec.ts) — the same red-test shape that already held the rail fold — so deleting a fold turns a door's verdict green in a test that watched it happen, not a list equal to itself. Rule 46 gets this entry as another face: a guard comparing a constant to itself is a guard that argues for the lie, and it argues hardest when it stands inside a correction.",
};
