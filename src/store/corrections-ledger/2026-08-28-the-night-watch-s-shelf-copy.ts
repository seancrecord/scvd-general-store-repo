import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-28",
  what_was_wrong:
    "The Night Watch's shelf copy said the hourly probe tries the handle so that 'a buyer could pay.' It never checked that: the watch runs the v1 structural battery — 402, header, version, accepts — and no payability check at all. A door with a name for a payTo, a dollar-typed amount, or a testnet network read ready in 168 signed rows while the store's own free preflight v2 called the same door not ready by any reading a buyer would accept. The signed rows were honest — they cited preflight-v1 all along; the shelf was not.",
  how_long: "Since the watch was listed with that sentence.",
  found_by:
    "The instrument audit, diffing the shelf copy against the battery the rows actually cite.",
  what_changed:
    "The copy says what v1 checks — shape, not payability — and points payability at the free v2 preflight by name. Words follow facts; whether the watch should fold the payability battery is a criteria decision that stays the keeper's, and until he makes it the shelf no longer makes it for him. The standing guard is the battery citation inside every signed row, which a test holds inside the signed bytes (test/battery-inside-the-bytes.spec.ts): the shelf can no longer outrun a citation any buyer can check against the row they hold.",
};
