# The quote stamp, and the data stance restated — September 21

*Ruled and built 2026-09-21. The keeper's question was whether the
store's rule against cookies and IPs was costing it the free-to-paid
funnel, and whether a "signature-bound quote timestamp" was worth
approving. The answers were: keep the rule, state it as three lines,
and build the stamp. This is what shipped against that.*

## The ruling

The published stance (`/.well-known/trust.json`, `data_handling`) said
two things: no cookies, and IPs not stored. The first was true. The
second was true of every visit, price check and purchase, and false of
two doors: the bell and the letterbox keyed a nameless visitor's
one-a-day line on the raw connecting address, written into a KV key
that lived a day. The admin login throttle also holds a failure count
per address for minutes, by design, and names the addresses to the
keeper while a guessing run is in progress.

The stance now reads as three lines, in the same field:

1. No identity is kept across requests, ever.
2. An address may be used at a door for a throttle or a one-a-day
   line and is not kept past its window.
3. A key issued for one exchange may be echoed back inside that
   exchange.

The third line is the one that unlocks the funnel, and it is the one
that needed the ruling.

## What the stamp is

Every x402 offer the store quotes now carries `extra.quotedAt`, the
ISO instant the 402 was minted. x402 v2 clients echo the accepted
offer back whole on the paid retry, so the instant comes back with the
payment. The till reads it and books:

| row | field | meaning |
|---|---|---|
| challenge | `quoted_at` | the instant this 402 was minted |
| settle, decline | `quoted_at` | the instant of the 402 the echoed terms name |
| settle, decline | `quote_to_pay_ms` | how long the buyer took to answer it |

The buyer-signals page (`/admin/signals`, keeper only) adds one
section: quote to payment, bucketed by door (under 5s, 30s, 2m, 10m,
over; `unstamped` for a client that rebuilt `accepted` by hand and
dropped the field, or a UCP checkout that carries no x402 echo).

It is a time and not a random id on purpose. The challenge row's own
`at` is the issue instant, so a settle carrying the instant joins to
its challenge with no new key; and the 402 stays deterministic under
one clock, which `test/doors-parity.spec.ts` relies on (it freezes the
clock and asserts the two Workers answer byte for byte).

## What it is not

Not an identity. It names no wallet, no session and no visitor. Two
knocks in one millisecond carry one stamp; two purchases carry
unrelated ones; nothing joins a stamp to anything but the quote and
the payment that answered it. A buyer who edits it corrupts nothing
but its own latency row.

## Why the money path is unchanged

- The SDK's matcher (`paymentRequirementsMatchAccepted` in
  `@x402/core`) requires the server's `extra` to be a *subset* of the
  echoed one. The retry's freshly built requirements carry no stamp
  (the route config is static), so an echo that carries one still
  matches. Nothing about matching changed.
- The signature covers the EIP-3009 authorization, not `accepted`, so
  nothing about verification changed.
- The facilitator never sees the field. `KvWarmFacilitatorClient`
  strips it from the payload before verify and settle, so the bytes
  CDP receives are the bytes it received before this shipped. The
  facilitator mock now captures both payloads and the spec asserts
  the absence.
- The store's own decline diagnosis compares the echo against the
  offer *as the SDK built it*, before the stamp goes on, so a decline
  is never explained as a disagreement over the stamp.
- The certificate's `quote` hash covers scheme, network, asset, payTo
  and amount, never `extra`; the replay kit still recovers terms.
- The signed offers (JWS) commit to the same five terms; unchanged.

## The bell and the letterbox

A nameless ringer or correspondent is now keyed under
`v:<16 hex>` = the first sixteen hex characters of
`sha256("visitor:<day>:<address>")`. Same one-a-day line, expires with
the day's key, never published, never joined to anything. The trust
page says "digest" and not "anonymous" because the IPv4 space is small
enough that a holder of the digest and a candidate address could
confirm the pair. The admin throttle is left as it was: it is a
security instrument, and the restated line covers it.

## Tests

- `test/quote-stamp.spec.ts`: the stamp on both doors; a stock
  `@x402/fetch` client echoes it, the settle row books `quoted_at` and
  a `quote_to_pay_ms` of exactly seven seconds under a fake clock, the
  latency signal bumps, and the facilitator's verify and settle
  payloads carry no stamp; a hand-rolled retry that dropped it still
  settles and books `unstamped`; a decline books the quote it
  followed; the readers alone.
- `test/visitor-day-key.spec.ts`: one ring and one letter a day from
  an address, over HTTP and MCP, with no KV key containing the
  address and one containing the digest.
- `test/conventional-urls.spec.ts`: the restated lines on the trust
  page.

All eight behavioural cases were run red with the source changes
stashed and green with them restored.

## What this does not do

It does not join a free instrument call to the 402 that followed it.
That join needs a key that spans two exchanges (an MCP session id, or
the field study's enrolment id), and the third line above permits a
key *inside* one exchange only. The handoff on `/admin/instruments`
remains the user-agent floor it always was. Extending the third line
to an MCP session id is a separate ruling.
