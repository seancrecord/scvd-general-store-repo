import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-07-26",
  what_was_wrong:
    'Every surface of this store said refunds were "automatic." The code never did it. A refund here was always a person keeping his word, which is a fine promise and a different one.',
  how_long: "Live on every surface for five days.",
  found_by:
    "An outside model, repeating our own wording back to us. Nobody here noticed.",
  what_changed:
    "The wording now says what the code does. More importantly: every claim the store makes about itself is walked by a test in CI, so a promise the code cannot keep fails the build instead of shipping. That test exists because of this entry.",
};
