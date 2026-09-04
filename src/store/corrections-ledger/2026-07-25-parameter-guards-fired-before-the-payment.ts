import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-07-25",
  what_was_wrong:
    "Parameter guards fired BEFORE the payment gate, so an indexer asking a paid route what it cost got a 400 error instead of a price — and concluded we were not an x402 endpoint at all.",
  how_long: "Since the affected items were listed.",
  found_by:
    "A directory's probe report: three of six endpoints answered. The three that did not were ours to fix.",
  what_changed:
    "Guards moved behind the gate, and a test now asserts that an UNSIGNED request to any paid route gets a 402 with the terms stated rather than a 400. The store cannot again refuse to quote a price to something trying to read one.",
};
