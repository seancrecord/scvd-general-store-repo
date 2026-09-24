# Circle Agent Marketplace — use-case reply (draft for the keeper)

Drafted 2026-09-24 for the keeper's reply to Austin Newkirk (Circle
Alliance), who wrote that the marketplace team "is asking for additional
information regarding the use case" and has no visibility into the
original submission. Copy is the keeper's to approve and send (rule 7);
nothing here is sent by an agent (rule 30).

## What the record says about this submission

- Agent Marketplace application submitted by the keeper 2026-09-01
  (`docs/archive/DESK_DUMP_2026-09-01.md`: "manual review, no SLA, no
  dashboard"). The repo holds no copy of the form text, so the original
  use-case wording cannot be quoted back; the reply below restates it.
- The partner-directory page at partners.circle.com/partner/scvdstore
  (listed 2026-09-04) is a separate thing and is not marketplace
  acceptance (`KEEPER_LIST.md`, `src/store/trust-signals.ts`).
- Circle's readiness scanner row in `trust-signals.ts` quotes no score
  on purpose; the keeper's "100" is the live reading and can be said in
  an email because the badge re-takes it on every scan.
- Circle's own pages (developers.circle.com, agents.circle.com) are
  egress-blocked from the build sandbox, so skill step 0 (re-read the
  live listing requirements) was NOT done here. The keeper should glance
  at the get-listed page once more before sending, in case the form now
  names categories or fields to answer in.

## Facts checked live on 2026-09-24, cited in the copy

- `GET https://scvd.store/api/buy/settlement_attestation` answers 402
  with x402 v2 `accepts` on `eip155:8453`, `eip155:137`, `eip155:42161`,
  `eip155:480` and Solana mainnet, all USDC, and an MPP `Payment`
  challenge (`method="evm"`) in `WWW-Authenticate` on the same response.
  That is the "dual rail" claim: two payment protocols on one door, USDC
  on every network offered.
- `menu.json`: 36 items; cheapest `spot_check` at $0.001; the paid
  instruments and prices named below are read from it.
- `llms.txt`: checkout networks Base, Polygon, Arbitrum, World, Solana.
- `coverage.json`: reads native USDC state on nine chain ids beyond the
  checkout set (Ethereum, OP, Avalanche included at `read` depth for the
  attestation class).

## The reply (paste-ready; the keeper edits voice and cuts as he likes)

Subject: Re: agent marketplace submission — use case

Hi Austin,

Happy to. Here is the use case, short version first.

scvd.store is an evidence observatory for agentic commerce: an
independent third party that checks x402 endpoints before an agent
pays them, checks the USDC settlement after it pays, and signs what it
saw. Every result is an ed25519-signed artifact that anyone can verify
offline, and every artifact names what we did not check. We are not an
escrow, a rating, or a guarantee. We are the receipt that neither the
buyer nor the seller wrote.

Everything on the shelf is priced in USDC and settles wallet-to-wallet
over x402 (Base, Polygon, Arbitrum, World, Solana) and over MPP on the
same doors. There is no account, no API key, and no minimum; the
cheapest instrument is $0.001.

Who buys it, and why:

1. Buying agents, before they spend. An agent about to pay an unfamiliar
   x402 endpoint calls our preflight (free) and learns whether the 402 is
   payable, whether the payTo address can actually receive on the network
   it named, and what we could not see. The Good Buyer ($0.99) turns that
   into a signed record of the exact terms the door served.

2. Buying agents, after they spend. A Settlement Attestation ($0.004)
   is an independent on-chain read of a claimed USDC settlement, matched
   to Circle's EIP-3009 authorization events, signed and dated. Agents
   and their operators use it to reconcile "the agent says it paid"
   against what the chain shows, without trusting either side. Twenty at
   a time is $0.05.

3. Sellers launching an x402 door. The Launch Check ($5) walks their
   endpoint the way a paying stranger does and reports what a buyer
   actually meets at the till. The Night Watch ($5) is a week of hourly
   signed observations that the door kept answering, evidence an
   operator can hand to a directory or a counterparty. The Operator's
   Statement ($21) reads a month of USDC in and out of their receiving
   address off the chain, with counts and denominators, never a share.

4. Developers building agents or x402/MPP clients. The store is a live
   till to build against: real settlement, no sandbox, a signed
   certificate with a stable verify URL at the end of every purchase so
   a test has something to assert on. Docs at scvd.store/developers,
   OpenAPI at /openapi.json, an MCP server at /mcp, and a five-line
   client path using @x402/fetch. The free conformance desk checks any
   issuer's signed offer or receipt, including our competitors'.

The free instruments (preflight, conformance desk, verify, the weekly
Bitcoin-anchored corpus of x402 endpoint readiness) are the front door;
the paid instruments are what an agent buys when it needs a third party
to have watched something and put its name on it.

For the marketplace specifically: our listing should read as a
verification and developer-tools service that agents pay for in USDC,
not as a consumer product. The readiness score you can see at
agents.circle.com/sell/score?url=scvd.store is the shape of the door;
the artifacts behind it are the product.

Links, all free to read:
- What it is: https://scvd.store/how-it-works
- Developer docs: https://scvd.store/developers
- Full menu with prices: https://scvd.store/menu.json
- Try the till: https://scvd.store/try
- Verify any artifact we signed: https://scvd.store/api/verify/cert_4dww28dx5j

Glad to answer anything else the team wants, or to fill in a form if
there is one.

Thanks,
Sean
scvd.store · Record Creative Co. LLC

## If the team asks for a one-paragraph listing description

Independent verification for agentic commerce. Before an agent pays an
x402 endpoint, scvd.store checks that it can be paid; after it pays,
scvd.store reads the USDC settlement off the chain and signs what it
saw. Preflight, conformance checks and artifact verification are free.
Signed attestations, launch checks, endpoint watches and operator
statements are paid per request in USDC over x402 or MPP on Base,
Polygon, Arbitrum, World and Solana, from $0.001, with no account or
key. Every artifact is ed25519-signed, dated, verifiable offline, and
names what was not checked. Not an escrow, a rating or a guarantee.

## Category, if the form asks

Developer tools / verification. If the form offers "payments
infrastructure" or "data", pick developer tools: the store issues no
credentials, holds no funds and does not move money for anyone; it
observes and signs.

## Claims deliberately not made

- No readiness number is written into this file (the score row in
  `trust-signals.ts` explains why). The keeper may cite the live badge.
- No buyer counts or settlement volumes. The dated third-party figures
  in `KEEPER_LIST.md` (x402-list, September 10) are a directory's
  reading and move; the signed record is `scvd.store/store-month`.
- No claim about Circle Gateway or nanopayment support; the store
  accepts USDC on the networks the live quote offers, nothing more.
- No claim that MPP checkout has been exercised end to end by a paying
  stranger on every door. The 402 advertises it on the door checked
  above; qualification records are in `DISTRIBUTION.md`.

## Outcome

Record the marketplace team's answer, dated, in `docs/SPEC_READS.md`
and the `KEEPER_LIST.md` Circle entry when it arrives (skill step 7).
