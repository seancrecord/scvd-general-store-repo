# Native MPP on the commission rungs — September 19, 2026

The last paid door family on x402 alone. The Commission Desk's rungs
(`GET /api/commission/pay/{rung}?commission={id}`) pay a live keeper quote
at exactly the rung's price, against a request the keeper quoted there;
the route fixes the price and the desk's admission fixes which quote it
honours, and every refusal is refused unpaid. This release, the same night
as [the publication doors](MPP_PUBLICATIONS_2026-09-19.md), offers the
native lane on the rungs.

## What changed

- **A rung is a native door.** `nativeCommissionDoor` in
  `lib/mpp-checkout-capability.ts` recognises a published rung by the
  desk's own path parser and names the desk's item; the unpaid GET answers
  with one challenge at the rung beside the x402 offer, bound to the URL
  asked (query included, so a credential for one quote's URL does not
  open another's) and the purchase key. An off-ladder rung is no door.
- **The desk's admission, after verification, before settlement.** The
  desk already treats a native credential as buying, so its labor and quote
  checks run under `purchaseAdmission` exactly where the native lane runs
  them for the shelf: after the credential verifies, before any submission.
  No quote id, an unquoted or expired request, a request quoted at another
  rung: each is refused unpaid, and the quote stays live.
- **The record.** The purchase carries the desk's item at the quote and the
  accepted commission terms, as the x402 gate writes them; the order is
  created and the desk's request accepted through the same fulfilment. The
  native ledger books the sale under the desk's item beside the shelf's
  rows.
- **Discovery.** The payment guide names the rungs from the same enabled
  answer (`nativeCommissionEnabled`). The rungs have no OpenAPI operation
  of their own, so nothing changes there.

## What would catch it going stale

- `test/mpp-native-commission.spec.ts`: every published rung quotes one
  challenge at its price bound to the URL and key, and an off-ladder rung
  none; the stock client pays a live quote natively and the order, the
  desk's acceptance, the record at the quote, the ledger row and the
  inspection agree, and the same credential again is the same order; a
  credential without the quote id, one for a request quoted at another
  rung, and one minted for another quote's URL are refused unpaid with the
  quote still live; the guide names the lane only when enabled.
- `test/commission-desk.spec.ts`, `test/commission-paid-recovery.spec.ts`:
  the x402 lane on the desk, unchanged.

## Not in this release

Other networks and assets, and a live purchase. With this, every paid
door the store serves over HTTP offers the native lane: the shelf, the
publications and the desk.
