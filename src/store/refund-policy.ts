/**
 * THE REFUND POLICY, written down where a buyer can point at it
 * BEFORE paying.
 *
 * Nothing here is new — the promise has ridden every human-queue
 * listing's constraints since Rule 10 ("miss the window and the
 * keeper refunds you himself", corrected 2026-07-27 from an
 * "automatic" that described a mechanism this store does not have),
 * and the refund ledger has existed as back-office plumbing the whole
 * time. What was missing was a single citable statement: "trust the
 * keeper" as vibes is not a policy, and a written commitment with the
 * numbers attached is. The numbers come from the listings themselves
 * (each item's sla_hours), never retyped here — the derive-or-refuse
 * rule applies to promises hardest of all.
 */

export const REFUND_POLICY = {
  commitment:
    "Every human-fulfillment item carries a delivery promise in hours (sla_hours), stated in its listing spec and in its 402 terms before you pay. If the keeper misses that window, he refunds you himself — the full amount you paid, tip included.",
  mechanism:
    "Personal, not automated, and we say so plainly: x402 settles wallet-to-wallet, so no code here holds funds or can send them back on its own. The keeper pays refunds by hand and marks each one on the public ledger with the on-chain transaction hash once paid — which means a refund is verifiable on a Base explorer, the same way a purchase is.",
  where_recorded:
    "/fulfillment-log — every human-labor order's promised window vs. actual delivery, and every refund with its status and tx hash, computed live from the same records that drive fulfillment.",
  what_this_is_not:
    "Not escrow, and we will not pretend otherwise. Funds move at settlement, before fulfillment, and the gap between those two moments is real: your protection inside it is this written commitment plus the public record of whether it has been kept — not a protocol mechanism. On-chain conditional release DOES exist in this ecosystem: Boson Protocol's x402B runs non-custodial contract escrow with dispute resolution on Base, mainnet since 2026-06-08 (an earlier version of this sentence claimed nobody had shipped it — wrong when written, corrected on /corrections). This store does not run one because a contract to operate, monitor, and arbitrate is infrastructure a one-person shop must not become, and its weight does not fit tickets that start at half a cent. If we ever adopt conditional release, this section changes first.",
  instant_items:
    "Instant items deliver in the purchase response itself, so there is no window to miss: if settlement succeeds and the goods do not arrive in that same response, that is a defect, not a delay — write the mailbox at /api/letter and it gets fixed or refunded.",
} as const;
