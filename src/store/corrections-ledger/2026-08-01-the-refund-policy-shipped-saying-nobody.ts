import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-01",
  what_was_wrong:
    "The refund policy shipped saying “nobody in the x402 ecosystem has shipped true conditional release yet,” and the store's own problem ledger said the same. False from the moment it was written: Boson Protocol's x402B — non-custodial contract escrow with on-chain dispute resolution, exactly the thing the sentence denied existed — had been on mainnet, including Base, since 2026-06-08, seven weeks before we wrote it.",
  how_long:
    "Under a day on the live policy — published in the early hours of 2026-08-01, corrected the same day. But the claim was born false, which is worse than going stale: nothing changed under us, we simply had not looked.",
  found_by:
    "An outside deep-research pass the keeper commissioned on the conditional-release problem, whose report named x402B as the shipping baseline — then verified by us against the live web before recording, because the vetting rule cuts both ways: the same pass that checks a report's claims against our code has to check our published claims against the report's findings.",
  what_changed:
    "The policy sentence now names the shipping alternative, dates it, and says why this store still does not run one (a contract to operate and arbitrate is infrastructure a one-person shop must not become) — the reader gets the real trade-off instead of a flattering absence. The mechanism: any published claim of the shape “nobody has built X” is a claim about the whole world at a moment, and it now ships with the date it was checked or it does not ship. The problem ledger's matching entry was corrected in the same pass.",
};
