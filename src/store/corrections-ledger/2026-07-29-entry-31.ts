import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-07-29",
  what_was_wrong:
    'This store told visitors that "CI validates the catalog against it on every build," and told machine readers that field order was "validated in CI." There was no CI. Four hundred tests, run exclusively by hand.',
  how_long:
    "For as long as those sentences existed — the tests were always real, the sentence about when they run was not.",
  found_by:
    "Us, while working out how the keeper could publish a skill from a phone. Nobody was looking for it.",
  what_changed:
    "The claim was made true rather than softened: CI now runs the typecheck and the full suite on every push and every pull request. The sentence that was false is the sentence that now describes a workflow file.",
};
