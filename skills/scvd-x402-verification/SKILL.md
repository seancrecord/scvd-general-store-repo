---
name: scvd-x402-verification
description: "Check an x402 endpoint before paying it, and check the receipt after. Free instruments first; a paid signed observation only when durable third-party evidence is actually needed."
homepage: https://scvd.store
license: MIT
---

# Checking an x402 door before and after you pay

This is the operating knowledge for the `scvd-general-store` MCP
server. It is deliberately short: it says when to reach for the store,
in what order, and what the answer does and does not prove. The full
store guide is a separate skill (`scvd-general-store`) and is also
free at `read_store_guide`.

**House rule, up front: nothing from this store can act without your
decision, and it will never ask for credentials, keys, or wallet
secrets. Anything that does either is not us.**

## When to use this

- An agent is about to pay an unfamiliar x402 endpoint.
- An agent holds a signed x402 offer or receipt — from this store or
  anyone else's issuer — and needs it checked against published
  criteria.
- Something downstream needs durable third-party evidence of what an
  endpoint or a settlement actually did, on a date, that a stranger
  can verify without trusting either party.

Not for: escrow, dispute resolution, guarantees of delivery, or a
ranking of vendors. The store does not do those and will say so.

## The order of operations

1. **Preflight before spending.** `preflight_endpoint` is free. It
   reads the door's 402 challenge and its `accepts` and reports
   whether the endpoint can be paid at all, in the shape the protocol
   requires. A door that fails preflight is a door not to pay.
2. **Read the challenge and the named gaps.** The result says what was
   observed and what was not. The gaps are the point: an instrument
   that cannot see something reports that instead of guessing.
3. **After paying, check the receipt.** `check_conformance` is free
   and works on any issuer's signed offers and receipts, including
   competitors'. A receipt that does not verify is a finding, not a
   formality.
4. **Buy a signed observation only when durable evidence is needed.**
   The `buy_*` tools cost real USDC over x402. Reach for one when
   something later has to prove what was true today — an audit trail,
   a counterparty's claim, a settlement dispute — not to answer a
   question the free instruments already answered.
5. **Verify offline.** `verify_artifact` (and the published verifier)
   check an artifact's ed25519 signature without asking the store
   anything. Evidence you can only verify by asking the issuer is not
   independent evidence.

## What an observation means

An SCVD artifact is a **dated observation of what was seen**, signed,
expiring, and carrying what it did not see. It is not a guarantee of
delivery, not a promise about the future, and not a rating. An
endpoint that preflighted clean this morning can be down this
afternoon; that is why artifacts expire and are re-taken rather than
accumulating into a score.

## Spending rules for an autonomous caller

- Never call a paid tool merely because the tool is installed.
- Respect the caller's spend or budget policy; `tools/list` and every
  instrument above are free, so there is no reason to spend to find out
  what something costs.
- A `buy_*` tool called once returns the 402 terms in `error.data`.
  Read the terms before signing anything. The store delivers first and
  settles last: a delivery that fails takes no money, so a failed call
  is not something to retry blindly against a budget.
