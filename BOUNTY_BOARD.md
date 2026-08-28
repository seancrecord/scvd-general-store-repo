# The Bounty Board — paid mystery shoppers for the x402 economy

Status: BUILT 2026-08-19 (the keeper's ruling stands: build and
iterate, no spec gate) — this document describes what runs and
iterates with it.

## The idea, which is older than the internet

Every real-world chain pays mystery shoppers: strangers who buy,
keep the receipt, and report what the store actually did. Nobody has
done it for the agent economy — and the agent economy needs it more,
because its directories list doors by whether they ANSWER, while our
field run proved 71% of doors that answer still refuse a real
buyer's money. Probes can't see that. Settlement indexers only see
successes. The only way to know a door works is to walk through it
with money — and paying strangers to walk multiplies the store's own
walkabout beyond what one wallet can cover.

## Where it lives

The public room is `https://scvd.store/bounties` — open bounties, the
three-step walk, and the rules in full, crawlable. The same board as
JSON, for polling, is `https://scvd.store/api/bounties`; claims go to
`POST /api/bounty-claim`. This file stays the law: the room derives
its rules from the same strings the API serves, so neither can
describe a board the other does not run.

## The loop

1. **The keeper posts bounties** — doors HE picks (from the ward
   round's universe, never self-nominated: a seller cannot farm its
   own door onto the board). At posting, the store reads the door's
   402 itself and captures the terms: payTo, price, block height.
2. **A shopper walks the door** with their own wallet: pays it for
   real, keeps what it returns.
3. **The shopper claims**: POST the settlement transaction hash,
   their paying wallet, an address to be paid at, and (optionally)
   what they observed — status codes, whether a PAYMENT-RESPONSE
   receipt came back, what was delivered.
4. **The store verifies THE CHAIN'S PART mechanically** before a
   cent moves: the receipt is real and succeeded, the USDC transfer
   inside it runs from the claimed payer to the captured payTo for
   exactly the captured amount, it postdates the bounty, and the
   transaction has never been claimed before. The payout address is
   sanctions-screened, fail closed, same rule 3 as every outbound
   dollar here.
5. **The payout is a signed authorization, not a broadcast**: the
   store signs an EIP-3009 TransferWithAuthorization from the field
   wallet to the shopper for the reward, and the SHOPPER redeems it
   on chain (any relayer, or their own transaction — USDC's
   transferWithAuthorization is submittable by anyone). The store
   holds no gas, broadcasts nothing, and the payout instrument is
   itself a verifiable artifact with an expiry.

## The honest register (the part that keeps this ours)

- What the store verified is the SETTLEMENT: money moved from that
  shopper to that door for that price. That part is chain-proven and
  is what the reward pays for.
- The shopper's observations are a CLAIM, recorded verbatim and
  labeled untrusted — the store did not see their HTTP transcript
  and never pretends it did. Crowd rows enter the corpus at their
  own evidence tier: "settled (chain-verified, crowd-walked)" below
  "settled and delivered (house-walked)". Two tiers, both true,
  never blended.
- No scores on shoppers, no scores on doors (rule 43). A door that
  refused a shopper's money is a dated observation, not a grade.

## The dials (all in code, all keeper-settable)

- Reward per bounty: the door's captured price back plus the finder's
  fee; total capped at BOUNTY_MAX_REWARD_USD ($0.25 default).
- Weekly budget: BOUNTY_WEEKLY_BUDGET_USD ($10 default, walkabout
  scale) — the board refuses new claims past it and says so.
- One bounty per domain per week; one payout per transaction hash,
  ever; authorizations expire (7 days) so unredeemed rewards return
  to the budget by themselves.
- FIELD_WALLET_KEY gates all payouts; unset, the board is read-only
  and says so plainly.
- Every outbound payout address screened against the on-chain
  sanctions oracle, fail closed — the payer is a named US LLC.

## What the store buys with the budget

Settlement-verified rows for the Fresh Set at a scale one wallet
cannot walk, from buyers who are not us — which is itself the
stronger evidence class. Ten dollars a week buys what no competitor
has at any price: the map of which doors take money, drawn by
strangers' money, verified on chain, published with its method.
