import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-10-13",
  what_was_wrong:
    "The bounty picker treated exact USDC offers on the same chain as interchangeable and selected the cheapest before checking the payment mechanism. Bounty bty_af4ww9tx captured QuickNode's 100-unit Gateway/batched offer on Base, while our claim verifier requires an individual USDC Transfer from the payer to the captured recipient. The ordinary Base per-request offer quoted 1,000 units when rechecked. Our refusal guidance also incorrectly described price drift as the only possible cause of a transfer mismatch.",
  how_long:
    "The affected listing opened on 2026-10-12 at 20:54:19.529Z and remained open at the independent unpaid check on 2026-10-13 at 14:09Z. The wider number and history of affected listings have not been established.",
  found_by:
    "A walker's private clarification before spending, followed by an independent read of the public bounty, the live unpaid challenge and the claim verifier. No paid QuickNode purchase was performed in that check.",
  what_changed:
    "Posting filters ordinary EVM USDC payment modes and token identity before choosing a price, refusing unsupported-only offers without opening a bounty. The affected listing is withdrawn on public reads and automated claims; its original terms and any already-paid history remain intact. The withdrawal directs anyone who already spent money to keeper review, without promising payment. Public instructions rule out a manual-transfer workaround and explain the supported chain evidence. Regression tests reproduce the cheaper Gateway selection and verify withdrawal, preserved history and fresh-term replacement. A replacement bounty requires a separate posting against a fresh compatible quote; this correction does not claim a successful merchant purchase.",
};
