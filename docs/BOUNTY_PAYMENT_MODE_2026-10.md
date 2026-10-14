# Bounty payment-mode correction — October 13, 2026

Authorized by the keeper after a private pre-spend clarification. The keeper
confirmed sending the clarification reply and authorized PR, merge and
related release follow-through on October 13. No additional correspondence
is sent as part of the code repair.

## Observed

At 14:09Z the public board listed `bty_af4ww9tx` as open at 100 atomic
units on Base, for `https://x402.quicknode.com/arc-testnet`. The unpaid
challenge offered ordinary Base USDC at 1,000 units and GatewayWalletBatched
at 100. Both declared `scheme: exact` and the same USDC asset. The bounty
picker sorted them by price without reading the payment metadata; the
claim verifier required an individual payer-to-recipient USDC Transfer.
No merchant payment or signature was made. This establishes a mismatch
in the board, not failed delivery by QuickNode.

## Repair

- Filter EVM token identity and ordinary payment metadata before price
  selection. Missing optional metadata retains legacy behavior. Explicit
  alternate signing domains/contracts and non-EIP-3009 transfer methods
  are outside this posting instrument's supported scope.
- Refuse unsupported-only quotes without a listing. An explicitly
  requested rail never silently falls back to another rail.
- Withdraw the known affected id through a dated register on public reads
  and automated claims. Keep captured terms and paid history unchanged;
  route prior spending to keeper review without promising reimbursement.
- Use a fresh id and quote for a replacement. The withdrawn id no longer
  blocks posting a replacement for the domain in the same week.
- Publish the correction and explain payment mode, chain evidence, and
  why an unrelated manual transfer is not a commissioned purchase.

## Verification

`test/bounty-payment-mode.spec.ts` was first run against unchanged source:
12 assertions failed, including selecting 100 instead of 1,000 and opening
Gateway-only bounties. The withdrawal test separately failed because the
affected record still counted as open. Checks are run with
`CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` so the local development
wallet does not override the tests' intentionally absent field wallet.

Validation completed: all 137 tests across the ten bounty specs passed;
all 32 correction/public-forwarding tests passed; `npm run typecheck`
and `npm run build:check` passed. The production builds were dry runs,
not deployments. Missing dependency source-map warnings did not prevent
test execution. Revalidated on current main in the isolated release checkout:
174 tests across the same thirteen specs passed, along with typecheck and
all production dry-run builds. The full CI suite remains required before merge.

## Release and replacement

These are local changes until released through the repository's PR/CI
gate. Do not deploy the unrelated changes currently in the shared checkout.
After release, confirm the affected id reads `withdrawn` on `/api/bounties`
and the reason appears on `/bounties`. Then use the authenticated existing
`POST /admin/bounties` action with the same target URL, Base rail, and the
original reward. Derive the reward from the retained original listing;
the server must capture the new price from the live compatible offer.
Read back the new id, amount, recipient and rail before telling a walker
to proceed. Do not edit the old captured amount in storage.

The scope does not add Gateway claim evidence or assert that every old
listing has been checked. Wider historical exposure remains unmeasured.
