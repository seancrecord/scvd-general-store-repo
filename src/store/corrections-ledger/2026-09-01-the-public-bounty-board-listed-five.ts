import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-09-01",
  what_was_wrong:
    "The public bounty board listed five doors as open that had expired unclaimed on 2026-08-27. A bounty's stored status is written at two moments — 'open' at posting, 'paid' at claim — and nothing ever wrote 'expired', so the board and its JSON repeated the stored word while the claim door, which checks the clock, would have refused every one of them. A shopper who read /bounties on any of those five days, paid one of the doors with their own wallet and claimed, would have lost the door's price and been told the bounty had expired. The room and the JSON also carried no count, so nothing on the front could say whether there was anything to walk.",
  how_long:
    "Five days, 2026-08-27 through 2026-09-01, the whole span between the first board's expiry and its next read. No claim was attempted in that window, which is the only reason nobody was refused.",
  found_by:
    "A read of the live board during the keeper's own question about why the board was not being found — not by a test, because the listing had no test for a record aged past its expiry.",
  what_changed:
    "The board derives each bounty's status from its expiry at read time, through the same check the claim door applies, and publishes open_count beside the list. The storefront strip reads the same figure live and says how many doors are open and what is left of the week's budget, or says the board is between postings; it never prints a count from copy. test/bounty-board.spec.ts ages a record past its expiry in KV exactly as the live ones were and fails if any face — the JSON, the room, or the claim door — disagrees with the others. Reposting bounties weekly remains the keeper's press.",
};
