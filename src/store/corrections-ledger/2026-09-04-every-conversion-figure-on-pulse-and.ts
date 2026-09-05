import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-09-04",
  what_was_wrong:
    "Every conversion figure on /pulse and /stats was computed against an organic ask count that subtracted only the machines that named themselves. The census had computed the other kind since July — clients that touch four or more doors inside a minute are walking the catalog whatever their user-agent says — and published them on the office wall as undeclared_walkers, a report and not a correction. So September's standing correction removed 2 rows of 7,017; August's per-door visits sat between 70 and 101 for a half-cent blessing and a $25 collaboration alike; and 48,566 all-time asks stood against 97 wallets ever opened, a ratio that held at a quarter of a percent across months whose volumes differed sevenfold. The published corrected figures were ceilings and said so, but they were far higher ceilings than the store already knew how to draw.",
  how_long:
    "From the day the standing correction shipped (2026-09-02) until today, and in spirit from the day the census first listed undeclared walkers (2026-07-26) — the rule existed, the books did not use it.",
  found_by:
    "The keeper, asking what was upstream of a funnel row that read 77 asks and 0 sales. The answer came off the store's own public surfaces — /pulse, /observatory — and one directory's probe counter, which alone runs ninety unpaid 402 handshakes a day against these doors.",
  what_changed:
    "The walk rule moved into one module (lib/walkers.ts) that the census, the monthly reclassification walk and the funnel all import, so the three cannot disagree about who walked. The reclassification walk now moves a walker's asks out of organic as a second, separately-published half — known_machinery_by_behaviour beside known_machinery_by_user_agent — so a reader can see which part of the correction is a name a machine gave itself and which part is what it did. The funnel reports asks_walked and leaves them out of every organic figure. Payments are never reclassified by behaviour: a crawler that pays is a customer, the rule the counters have always used. Tests hold the rule in one place and the three surfaces to it.",
};
