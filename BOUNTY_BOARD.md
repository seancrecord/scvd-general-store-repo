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
3. **The shopper claims**: POST the settlement transaction id (a 0x
   hash on Base or Polygon, a base58 signature on Solana), their
   paying wallet in that rail's own shape, a 0x address to be paid
   at, and (optionally) what they observed — status codes, whether a
   PAYMENT-RESPONSE receipt came back, what was delivered.
4. **The store verifies THE CHAIN'S PART mechanically** before a
   cent moves, on the door's own rail: on Base and Polygon the
   receipt is real and succeeded and the USDC Transfer log inside it
   runs from the claimed payer to the captured payTo for exactly the
   captured amount; on Solana the transaction did not fail, is past
   the finality window, and its pre/post USDC token balances credit
   the captured payTo exactly the captured amount and debit the
   payer at least it. On every rail it postdates the bounty and the
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

## The rails (2026-09-05)

Doors on Base, Polygon and Solana can be posted. When a door quotes
more than one, the store captures an EVM rail first (Base before
Polygon) and Solana only when the door offers nothing else. A Solana
bounty keeps two clocks on its record: `opened_slot`, the Solana
height a claimed settlement must postdate, and `opened_block`, the
Base height at the same instant, because the payout scans Base from
it. The paid claim keeps `settled_slot`, and the corpus row prints it
as a slot, never as a block.

**The reward pays in Base USDC to a 0x address on every rail, Solana
included.** That is not parity left undone; it is SOLANA_PARITY.md
gap 4, which stands: the payout here is an authorization the
recipient redeems, and SPL USDC has no such instrument. A shopper who
walks a Solana door names any 0x address for the reward — the claim
form already takes `payout_to` apart from `payer`.

## What the room publishes besides the listings (2026-09-08)

The board described how to walk a door and how to claim, and said
nothing about the expensive half: what happens when a claim is refused
AFTER a stranger's own money has already left their wallet. Three
things now stand beside the listings, served identically by the room,
the JSON board and the claim door's own GET — an agent that reads
anything before it POSTs reads them.

- **Before you spend your own money.** Every check that is free and
  goes before the first irreversible act, each line naming a field on
  `/api/bounties`: the derived `status`, the door's live 402 against
  the captured `amount_usd` and `network`, `payouts_enabled`,
  `spent_this_week_usd` against `weekly_budget_usd`, a 0x address ready
  for `payout_to`.
- **A walk, end to end.** The four commands, ids marked as the
  examples they are — read the board, walk the door (no command of
  ours: it is their wallet), POST the claim, and the one nobody had
  ever written down, the `transferWithAuthorization` call that turns
  the signed reward into money. The redemption is the walker's own
  send; the store still broadcasts nothing.
- **Why a claim is refused.** Every refusal the claim door can produce,
  in the order it checks them, with what each costs: which ones are
  taken before anything is held, which release the settlement so it
  stays claimable, and the one that never comes back (a settlement
  someone already claimed). The catalogue lives in
  `src/services/bounty-board.ts` beside the checks it describes, and
  each row carries the refusal as the door actually words it.
  `test/bounty-board.spec.ts` drives every row against the live
  claim door and fails if any published row matches nothing the store
  says — a reworded refusal goes red in CI rather than quietly false on
  the public page. Same rule as the expiry correction: one clock, and
  one wording, behind every face.

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
- One bounty per domain per week; one payout per transaction id,
  ever (Solana signatures are keyed behind a `sol:` prefix, as
  written — base58 is case-sensitive); authorizations expire (7 days) so unredeemed rewards return
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
