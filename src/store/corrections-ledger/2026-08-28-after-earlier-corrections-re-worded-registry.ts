import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-28",
  what_was_wrong:
    "After earlier corrections re-worded /registry's prose — signed offers are 'present and structurally valid,' never 'verifiable'; doors are 'answering a well-formed challenge,' never 'working' — the JSON-LD beside that prose kept publishing 'working doors serving verifiable signed offers (percent)' as a bare percentage. The code's own comment says the machine-readable half matters more, because indexers quote it verbatim and cannot see a caveat in a paragraph. It was the half left uncorrected.",
  how_long: "Since the prose corrections landed.",
  found_by: "The instrument audit, in-house.",
  what_changed:
    "The JSON-LD names use the corrected vocabulary and the percentage ships beside its numerator and denominator as their own properties, so no indexer has to quote a ratio without its population again. A test parses the served structured data, bans the retired words from every variableMeasured name, and requires the count and denominator properties beside the percent (test/registry-claim.spec.ts) — the machine half now has the guard the prose half always had.",
};
