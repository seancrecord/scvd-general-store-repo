import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-31",
  what_was_wrong:
    "The skill bundle published to ClawHub — the copy that gets INSTALLED into somebody else's agent — priced `service_audit` at $0.10 when it has cost $5 the whole time that document has existed, and `trust_profile` at $19 after the keeper repriced it to $21. It also described the shelf as running '$0.005 to $50' when it runs $0.001 to $300, and its frontmatter advertised entry 'from $0.004' when the cheapest door is $0.001. Two failures with different shapes and the second is the worse one. The `service_audit` price was wrong in the bundle's FIRST COMMIT: nothing ever compared it to the shelf, so it was never right. The `trust_profile` price was correct when written and went stale two days later when the keeper's 2026-08-29 repricing reached the shelf, the room and the JSON, and not the bundle. A wrong price here fails silently in the worst direction: an agent budgets a tenth of what the 402 will ask, declines the purchase it meant to make, and concludes this store is unaffordable. We would never hear about it, and we cannot edit the copy already installed.",
  how_long:
    "`service_audit`: four days, 2026-08-27 to 2026-08-31, the entire life of the document. `trust_profile`: two days, from the 2026-08-29 repricing. Neither was found by anyone using them.",
  found_by:
    "The store's own keeper, asking for the skill to be brought current — not by a check, because no check existed. Every guard on this document asked whether a thing was NAMED: the item ids, the credentials promise, the position sentence, the key registry. Not one of them looked at a number beside a name, so the bundle was free to advertise the right door at the wrong price indefinitely, and did.",
  what_changed:
    "test/skill-prices.spec.ts, shipped 2026-08-31, reads every price the bundle quotes beside a menu item and fails the build when it disagrees with MENU_ITEMS, plus the stated shelf range and the frontmatter's entry price against the real ends of the shelf. It was written before the fix and run red against the live document first — it reproduced both errors and one the overhaul had missed. Two of its three findings that day were the READER'S fault rather than the document's: a $0.004 attributed across a list boundary to the next bullet's item, and an amount the store PAYS at your till read as the item's price. Both are now regression cases in the same file, alongside the two real errors reduced to the sentences that carried them, so a future tightening that narrows the reader past what it exists to catch fails and names what it lost.",
};
