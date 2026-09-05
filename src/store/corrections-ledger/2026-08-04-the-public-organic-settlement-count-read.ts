import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-04",
  what_was_wrong:
    "The public organic-settlement count read 22 when the honest number was 3. The other 19 were the store's own money: cross-model agent-UX test walkers (research into how cheaply-run agents handle x402 purchases) bought real items from freshly spun-up wallets that were not yet listed in the house register, so the till booked family purchases as market demand — the exact corruption the register exists to prevent, caused by our own instrument.",
  how_long:
    "Roughly a day across two test rounds (2026-08-03 to 2026-08-04), on every surface that shows the organic figure.",
  found_by:
    "The keeper, reading his own office and refusing the flattering number: he had 3 organic sales, the page said 22, and he asked for the correction rather than the credit.",
  what_changed:
    "Three mechanisms, no intentions. (1) Every walker wallet is now in the house register, and the pinned rule is LIST BEFORE FIRST PURCHASE — the same guard the store's own shopping script has always enforced for itself. (2) A reclassification ledger: the misbooked settles are subtracted from organic and added to house AT READ, with the raw counters left exactly as written, because an edited counter is an erasure and an adjustment beside it is a record; the stats now carry a reclassified_house field so the correction itself is visible, not silent. (3) This entry, and a test that walks the whole correction path — the lever refusing unlisted wallets, the snapshot freezing, the corrected figure at read, and the raw counter left untouched — so the mechanism fails the build before it can fail the books. The corrected organic count is the number the store stands on, and it is 3.",
};
