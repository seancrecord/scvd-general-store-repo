import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-07-30",
  what_was_wrong:
    'The listing spec told buyers a lucky was "graded honestly, by a person." No person grades a lucky. The animal, the note and the strength all come from a hash of the certificate id, and the code that does it says so in its own comment: "the keeper does nothing per order." The true part — that he wrote the herd and weighted the odds — was real; the per-charm human judgement was not. It rode into the OpenAPI summary, menu.json, the x402 discovery document and skill.md.',
  how_long: "Live on every machine surface for five days.",
  found_by:
    "Nobody, for five days. Then by scoping an unrelated feature: a maker's mark for the shelves where a buyer cannot tell whether a person or a script made the pick. Asking who made the pick is what surfaced a shelf whose answer had been written down wrong.",
  what_changed:
    "The line says what the code does. The structural half is the point: a maker's mark is now a signed certificate field derived from one table keyed by item, so a shelf cannot describe its own provenance, and a test walks all three copy maps — the OpenAPI summary, the listing spec and the storefront returns — failing the build if any of them claims a person on a shelf whose fulfilment path has none. The claim and the code are tied together now; they were not before, which is why they drifted.",
};
