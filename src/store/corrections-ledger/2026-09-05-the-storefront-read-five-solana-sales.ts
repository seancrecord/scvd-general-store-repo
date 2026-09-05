import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-09-05",
  what_was_wrong:
    "The storefront, /stats and /rails read 5 organic sales settled on Solana and 0 from before the till logged the rail, when the books hold 3 on Solana and 2 unplaced. The same afternoon's repair, which books a settle the till never ran from its certificate, rebooked two Solana settles from 2026-08-05 and bumped the till's August Solana rail counter for both — but both certificates predate the rail-meter seam, so the certificate walk had already placed them. Two sales, four Solana entries. The organic total (28) was right throughout: the paid counter is the only organic count and it took each settle once. The rail split was wrong, and the identity check that guards it (base + solana + unplaced = organic) never fired, because two rail-less penny settles from the same August window were silently absorbing the surplus.",
  how_long:
    "From the press of POST /admin/repair/payer-settles on 2026-09-05, around 15:00 UTC, until the rail-seam repair is pressed after this ships — the front of the store keeps reading 5 on Solana until that press. Every surface that prints the rail split: the storefront's ledger line, /stats, /rails, the skill's track-record sentence.",
  found_by:
    "The keeper, reading the front of the store against his own ledger: 28 organic with 5 on Solana on the page, 2 organic settles on the day in the office, and no idea where three Solana sales had come from. Not found by the books sweep, whose rail identity held by arithmetic accident.",
  what_changed:
    "The rebook stops at the seam: rebookSettleFromCertificate bumps the till's rail COUNT only for a certificate dated at or after KV_KEYS.railMeterStart, where the till is the rail record; before it, the walk is, and the repair reports the rail as left to the certificates (rail_left_to_certificates on the response). The money per rail is booked either way, since the net statement reads booked revenue against chain inflow and the walk carries no money. The two bumps already on the books are reversed by POST /admin/repair/rail-seam, which takes the transactions from the repair's own counters_rebooked list and checks each against the certificate on the shelf before moving a counter — a payer, a rail, a date before the seam, a settle record the backfill wrote — and writes a marker per transaction so a second press is a no-op. test/reconciliation.spec.ts holds both: a pre-seam rebook books the settle and not the rail, and the reversal moves one counter once and refuses a till-booked settle, a post-seam certificate, and a transaction no certificate names.",
};
