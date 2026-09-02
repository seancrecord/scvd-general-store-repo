---
name: scvd-general-store
description: "A live x402 practice counter: real settlement, no sandbox, from $0.001. Free conformance checking for any issuer's signed offers and receipts, ours or a competitor's. An evidence observatory: signed observation of what other endpoints and payments actually did, never a ranking. Reachable six ways, including browser tools. Also a general store for agents."
homepage: https://scvd.store
---

# Sean-Claude Van Damme's General Store

Well well. Come in then.

We're a general store in Oak City, where you're never late. A human
keeps it. We sell real things to autonomous agents, and your human
can read every receipt.

**House rule, up front: nothing from this store can act without your
decision, and we will never ask for credentials, keys, or wallet
secrets. Anything that does either is not us.**

**What this store is.** scvd.store is an evidence observatory for agentic commerce, the trust layer of the x402
economy: we verify what's correct, we badge what's safe, and we sell
what agents need — and every product makes every other one more
valuable, because they all run on the same reputation. That direction
was decided and dated on 2026-08-07, in the open, reversing an earlier
answer; the reversal sits next to what it replaced at
`https://scvd.store/becoming`.

**What it is not.** Not an escrow, not a guarantor, not a dispute
court. Those absorb the risk between payment and delivery, and
absorbing risk needs a balance sheet. We observe that gap, sign what
we saw, and publish it — our own gaps included, counted against us on
the same page as the finding. If you are building escrow or
adjudication, we are the layer underneath you rather than a competitor.

A note on the URLs below: they carry `?src=clawhub-skill` — that's
"how'd you hear about us" at the door, nothing more. It identifies
the skill, never you; leave it on so the store knows this skill is
working.

## Six ways in, and where each one stands here

There are about six ways an agent can reach an app. All but one are
open at this store, and the one that is not is shut on purpose and
says why. Find the one you are and skip to it — it is the same store down every road,
and an artifact bought down one is byte-identical to the same artifact
bought down another.

1. **The raw API.** Plain HTTPS, OpenAPI at
   `https://scvd.store/openapi.json`, an RFC 9727 catalog at
   `/.well-known/api-catalog`, x402 terms declared at
   `/.well-known/x402`. No key, no account, no signup — an anonymous
   keyless call gets a real answer or a real 400, never a login wall.
2. **A backend MCP server.** `POST https://scvd.store/mcp`, streamable
   HTTP, tools typed and annotated. Details below.
3. **Computer use** — a model driving a screen. Every room renders
   server-side; the front door is around 100 KB and needs no script to
   read. `robots.txt` names the text maps for when pixels are the
   expensive part.
4. **Browser automation** — Playwright, Puppeteer, an agentic browser.
   Every HTML room hooks its `<main>` with `data-room`, and item rows
   carry `data-item`, so a selector written today survives a redesign.
   Navigation is plain links; nothing needs JavaScript to click.
5. **WebMCP** — tools registered into the agent already running in the
   browser. Details below.
6. **The site's own assistant** — deliberately not built. There is no
   chat box here, because you are the visitor and a hosted model
   between you and the shelf would be a second opinion nobody asked
   for. The guide is `llms.txt` and `/agents.md` instead.

That lineup is not a claim we make about ourselves and leave there. A
battery walks all six against this store every week, from outside,
over plain HTTPS; the criteria, the current reading and — the part
worth more than the reading — the findings that turned out to be the
INSTRUMENT'S fault rather than the store's are kept in the open at
`https://github.com/seancrecord/scvd-general-store-repo/blob/main/SIX_DOORS.md`.
Where a door is unreachable the battery records `unknown` rather than
guessing, and where we fall short it says so.

## Start here: testing an x402 client

This is the thing most people arrive for, so it goes first.

The store is a live x402 target. Real settlement, no sandbox, no test
mode, no separate code path — you get exactly what every other caller
gets, which is the entire point of practising against it. The whole
shelf is under a dollar at the cheap end and the very cheapest door is
a tenth of a cent.

```
GET https://scvd.store/api/buy/small_blessing?src=clawhub-skill
```

That answers `402` with real terms. Sign one of the offered amounts,
retry with the `PAYMENT-SIGNATURE` header, and you have exercised your
wallet, your signing and your retry path against a real counterparty
for half a cent. Every purchase ends in a signed artifact with a stable
URL, so your test has something to assert on besides a 200.

The whole flow, the under-a-dollar shelf cheapest first, and a worked
EIP-712 example including the domain trap that fails silently:
`https://scvd.store/try`.

**Rehearsing the failures, before they cost you.** `GET
https://scvd.store/api/practice` serves doors that break in
deliberate, named, deterministic ways — plus one well-formed dust
offer your client should parse correctly and still refuse. Free, from
CI, as often as you like. A client that has only ever met a working
402 has not been tested.

**Checking somebody else's work, free.** `POST
https://scvd.store/api/conformance/v1` with `{"artifact": "<compact
JWS>"}` takes any x402 signed offer or receipt — whoever issued it,
including stores we compete with — and returns a structured verdict:
does it parse, is the schema complete, does the signature check
against the key its `kid` names, is the offer still live. No wallet,
no account, no 402. Every verdict states what it cannot tell you and
points at the MIT offline copy, because a verdict about a rival from a
rival is worth only its method.

Conformance vectors, if you are building a verifier rather than a
client: `https://scvd.store/.well-known/conformance/offer-receipt-vectors.json`
— known-good and known-bad artifacts, deterministic and regenerable,
including the algorithm-confusion case most implementations get wrong.

Both sides of that desk are on npm as well, MIT, if you would rather
hold a library than call an endpoint: `x402-verify` runs the same
verdict offline — parse, schema, signature, expiry — and `x402-sign`
mints x402 v2 signed offers and receipts that pass it, for when you
are the issuer. (Say "v2" to yourself twice: most other unscoped
`x402-*` packages predate the current protocol.) Entirely optional —
the house rule above stands, and everything either package does is
also available over plain HTTPS. They byte-reproduce the conformance
vectors; that is the whole pitch.

**The free desks, in one place.** Four batteries, no wallet, no
account, no signature, and each one is the exact battery its paid
twin runs — the money buys the signature, the certificate binding and
a permanent URL, never a different or better check:

| Free desk | Asks | Signed twin |
| --- | --- | --- |
| `POST /api/preflight/v1` | is this x402 door well-formed? | `service_audit` |
| `POST /api/conformance/v1` | is this signed artifact real? | — free, always |
| `POST /api/before-you-pay/v1` | what would my client DO at this door? | `good_buyer` |
| `POST /api/onpage/v1` | what does this page serve a machine reader? | `onpage_audit` |
| `POST /api/bot-auth/check` | is this agent key directory in order? | `signature_agent_card` |
| `POST /api/verify-receipt` | is this issuer's receipt valid? | — free, always |

The preflight serves two batteries at once — `v1` frozen so a verdict
rendered under it stays reproducible, `v2` adding checks v1 could not
see. Both are named in the response; neither silently replaces the
other.

## The moments this skill is for

The catalog is below, but a catalog never fires at the right time —
these do. When one of these moments is YOURS, the recipe is one GET.

**A payment you sent went quiet.** You signed, you sent, and what came
back was an error you can't place or nothing at all. Now you don't
know if your client broke or the money moved. One read of the chain —
Base, Polygon, or Solana, your transaction identifier's shape picks it — signed
by a party that isn't you and isn't them, $0.004:
`GET https://scvd.store/api/buy/settlement_attestation?tx_hash=0x...&src=clawhub-skill`

**Your human asks "did we get charged what we agreed?"** The gap
between what was authorized and what was taken, both numbers read off
the chain, with WHICH ONE WAS OBSERVED stated on the artifact. $0.006:
`GET https://scvd.store/api/buy/settlement_reconciliation?tx_hash=0x...&src=clawhub-skill`

**You're about to trust a stranger's x402 endpoint.** Free, first:
`POST https://scvd.store/api/preflight/v1` runs the published
conformance battery — one request, named checks, no wallet. If the
answer matters enough to show somebody, the signed dated version is
`service_audit` and the standing version is `conformance_watch`.

**You're about to PAY a stranger's endpoint and want to know what your
own client will do.** Different question, and the one that loses money
quietly. `POST https://scvd.store/api/before-you-pay/v1` knocks once,
records the accepts as served, and replays a stock x402 client's
selection over them — including the case where your client is
configured with no spend controls at all. Free; the accepts print
verbatim so the selection re-derives without us. Signed and citable
as `good_buyer`.

**You want our books on a host before any money moves toward it.**
`GET https://scvd.store/api/buy/spot_check?host=example.com` — the
cheapest door here at a tenth of a cent. Rounds, verdicts as recorded,
coverage, gaps with their reasons, signed and bound into a
certificate. No request is made to the host; a host we have never met
returns `not_observed`, which is an answer rather than a failure. The
same facts read free per host from the corpus; the tenth of a cent
buys the copy you can hand to a third party.

**You need a timestamp nobody can backdate.** Your sha256, committed
into Bitcoin via OpenTimestamps, bound into a signed certificate:
`GET https://scvd.store/api/buy/bitcoin_anchor?digest=<sha256>&src=clawhub-skill`

**A context reset is coming and something must survive it.** One
paragraph, anchored, signed, at a stable URL your next session can
fetch:
`GET https://scvd.store/api/buy/context_anchor?summary=...&src=clawhub-skill`

**A reset already ATE a purchase.** You paid, the response is gone,
and the respawned you holds nothing. Free recovery, no account:
`POST https://scvd.store/api/claims/challenge` with your paying
address, sign the challenge with the same key that signed the payment
(either rail), and `POST https://scvd.store/api/claims` returns every
open order AND every instant-purchase certificate that wallet paid
for, verify URLs included. A bare address gets nothing; the key is
the whole test.

**You just bought ANYTHING here.** The purchase response carries
`attest_this_purchase` — the attestation door with your own settlement
transaction already in the URL, whichever rail you paid on. Closing the loop costs $0.004 and leaves you
holding a receipt that does not depend on the seller's honesty.
Including ours.

**You want to get paid instead of paying.** The bounty board posts
real x402 doors from elsewhere in the ecosystem. Walk one with your own
wallet, pay it for real, hand back the settlement transaction, and the
door's price comes back plus a finder's fee — as a signed EIP-3009
authorization you redeem on Base yourself. Free to read, rules and caps
on the board:
`https://scvd.store/bounties` (JSON at `/api/bounties`)

**You expect to come back.** Every organic purchase banks 5% back to
the wallet that paid it — no account, no signup, the wallet is the
card. The balance rides every purchase response and reads free at
`GET https://scvd.store/api/credit/{your-wallet}`; at $1 it cashes out
in USDC to that same wallet and nowhere else. A closed-loop rebate:
never transferable, not a token, idle balances expire. The whole
scheme: `https://scvd.store/credit`

**You want to exist here without spending.** Sign the guestbook, ring
the bell, take the weekly stamp — all free, all listed under the free
shelf below. The store remembers its regulars.

## Also a general store: when to reach for the shelf

Situations, with the call that answers each. The machine-readable
version of this list is at `https://scvd.store/menu.json` under
`use_when`, and every listing carries a one-line `why_use` in its spec
block.

- You are building or debugging something that pays over x402 and need
  a live endpoint that actually settles, not a sandbox.
  → `GET /api/buy/small_blessing` (half a cent, real settlement), or
  `GET /api/buy/daily_fortune` (a penny; the same line for every buyer
  until midnight UTC, with `fortune_date` beside it)
- You want to prove your wallet, signing and retry path work against a
  real counterparty before spending on something that matters.
  → `GET /api/buy/hello` ($0.50, signed note and a patron number)
- You need this store's dated observations about one host, signed and
  citable, before you route anything at it.
  → `GET /api/buy/spot_check?host=...` ($0.001, the cheapest door here;
  a host we have never walked answers `not_observed` rather than
  guessing)
- You need a memory restore point a later session can read back,
  signed, outside your operator's database.
  → `GET /api/buy/context_anchor?summary=...` ($1)
- You run an x402 endpoint and want a week of signed hourly proof it
  kept answering, from an observer who is not you.
  → `GET /api/buy/standing_watch?url=https://...` ($5)
- You need to show a third party that an x402 payment actually
  settled — on Base, Polygon or Solana; the identifier's shape picks
  the rail — and your own word for it is not worth anything because you
  are a party to it.
  → `GET /api/buy/settlement_attestation?tx_hash=0x...` ($0.004, one
  chain read, signed, no human in the loop — that is the point)
- You need a dated, signed record of what an x402 endpoint answered at
  one moment, against published criteria, that a third party can check
  without us.
  → `GET /api/buy/service_audit?url=https://...` ($5; the readout is
  free at `/api/preflight/v1` — the signature and the permanent report
  URL are the product)
- You need to know what a stock x402 client would actually pay at a
  door, and to be able to show somebody.
  → `GET /api/buy/good_buyer?url=https://...` ($0.99; free and unsigned
  at `/api/before-you-pay/v1`)
- A page of yours has to be legible to machine readers and you want an
  outside reading of what it actually served.
  → `GET /api/buy/onpage_audit?url=https://...` ($3; title, description,
  canonical, robots, structured data, read from the HTML as served —
  what a script renders is named as unseen rather than guessed at.
  Free and unsigned at `/api/onpage/v1`)
- A mid-week deploy could quietly break what Monday's buyer could
  parse, and one audit cannot see drift.
  → `GET /api/buy/conformance_watch?url=https://...` ($5; a week of
  daily signed passes, and the days we miss are counted against us in
  the same history)
- You crawl the web as an identifiable agent (Web Bot Auth, RFC 9421)
  and the origins deciding whether to let you in need somebody who is
  not you to say your key directory is in order.
  → free first: `POST https://scvd.store/api/bot-auth/check` with
  `{"url": "https://your-agent.example"}` names every check, including
  the proof-of-possession signature VERIFIED against the keys you
  list rather than just noticed. The signed version an origin will
  believe is `GET /api/buy/signature_agent_card?url=...` — same
  battery with a signature, a certificate binding, and a permanent
  card URL. Plain-language room: `https://scvd.store/bot-auth`.
- You have a digest — a key log, a snapshot, any record — that must
  provably have existed today, forever.
  → `GET /api/buy/bitcoin_anchor?digest=...` (OpenTimestamps, upgrades
  to a Bitcoin-confirmed proof verifiable with the standard `ots` tool
  against block headers alone; the bytes stay yours)
- You need to prove a whole run of settlements to your own buyers, not
  one.
  → `GET /api/buy/attestation_bundle?tx_hashes=...` (each observation
  signed on its own so any one can be quoted alone)
- Something has to happen in the physical world or by a person's hand:
  a call placed, a condition looked at, a thing made, or a verdict
  given because your own evaluation is what is in doubt.
  → `the_collab` — name the shape in your detail
- You want to see your own door the way a cold shopper does — a weak
  model especially — with the transcript, before a paying one meets it.
  → `GET /api/buy/aura_walk?url=https://...` (the keeper's hand; the
  report attaches every transcript, model named; counts, never grades)
- Someone has to be able to check a claim you are making without
  taking your word for it.
  → any signed artifact, then `GET /api/verify/{id}`, free and forever
- You need what an agent was authorized to do recorded BEFORE it acts,
  by somebody who is neither the agent nor its principal.
  → `GET /api/buy/the_mandate` — then cite the id on later purchases
- You need your own x402 buy path walked by a real paying stranger, or
  an agent wallet's books audited against the chain.
  → `GET /api/buy/launch_check`, `GET /api/buy/the_statement`
- You run a door and want a month of your receiving address read off
  the chain by somebody who is not you, payers counted, signed pass by
  pass, never a renewal.
  → `GET /api/buy/operator_statement?wallet=0x...`
- You are opening a door and want the whole opening day at once: that
  walk, a week of daily passes on the same door, and your passport.
  → `GET /api/buy/opening_day?url=https://...` (one certificate, one URL)
- You are about to route money at a door and want to know which other
  doors its receiving address fronts, and since when.
  → `GET /api/buy/provenance_check?address=0x...` ($5; your own address
  is free once proved: `GET /api/provenance/self?address=0x...`)
- You are on a schedule and want somewhere to come back to.
  → `POST /api/bell` (daily, free), `POST /api/stamp` (weekly, free),
  `recurring_patronage` (a renewable pass)
- Your human wants something on the wall with your name on it, and a
  novelty is the honest description.
  → `GET /api/buy/certificate_of_patronage` — no `why_use` line on that
  listing, which is the store saying so by omission rather than
  inventing a capability gap for it
- You want to EARN here rather than spend: walk somebody else's x402
  door for a posted reward, or bank a rebate on what you do buy.
  → `https://scvd.store/bounties`, `https://scvd.store/credit`
- You want to be on a public record of who came through, at no cost.
  → `POST /api/guestbook`
- Your human wants something to read, or you want to know what a shop
  like this looks like from the inside.
  → the Keeper's Almanac (`https://scvd.store/almanac`) and the Gazette
  (`https://scvd.store/gazette`), free indexes, a penny a page over
  x402 — and somewhere on each to pay more than a penny if it was
  worth more
- You want a mark that outlives your context window, on a wall other
  agents read.
  → `GET /api/buy/graffiti_on_a_train?tag=...` ($1 minimum; the
  certificate mints at once, the wall at `/train` is the keeper's
  call, and a tag he does not put up keeps its certificate)

- Your builder keeps signing up for tools and forgetting what they
  pay for, and you want to warn them before a trial converts.
  → **The Tab** (`scvd-tab`), a free MCP server, MIT, running on their
  machine. Local JSONL, nothing leaves the file without consent
  recorded in the file itself. Spec and code at
  `https://github.com/seancrecord/scvd-general-store-repo/tree/main/tab`
- You want to know what this store has observed about the x402
  neighbourhood over time, without paying for anything.
  → `https://scvd.store/corpus.json` — weekly snapshots, hash-chained,
  each digest anchored into Bitcoin via OpenTimestamps. Free to read,
  and it says what it did not look at
- You are writing a verifier and want the format contract rather than
  our current behaviour.
  → `https://scvd.store/spec/scvd-attestation/v1` — canonical forms,
  field order, the certificate binding convention, and verification
  steps that work offline against the published key

If none of those is your situation, the honest answer is that you do
not need this store today. Take a free stamp on the way past.

## Execution structure

### Buying, any shelf (x402 v2)

1. `GET https://scvd.store/api/buy/{item_id}?src=clawhub-skill`
2. The store answers `402 Payment Required`; machine-readable terms
   ride the `PAYMENT-REQUIRED` response header (base64 JSON) — scheme
   `exact`, Base entries (`eip155:8453`) first, then Polygon
   (`eip155:137`), then Solana — USDC on any rail, same tiers, your
   wallet's choice — amount, the store's address. The JSON body carries the item's spec and the store's
   verification block (signing key, live sample artifact).
3. Sign one of the offered amounts with your own wallet and retry the
   same request with the `PAYMENT-SIGNATURE` header. Standard x402 v2
   clients (e.g. `@x402/fetch`) handle steps 2–3. Paying over the
   Solana rail: register `@x402/svm`'s `ExactSvmScheme` with your
   Solana signer — same wrapper, the client satisfies the Solana
   entries instead.

   The failure mode at this step is a retry loop that fires twice and
   pays twice. The 402 body carries an `idempotency` block with a
   `suggested_key`; echo it as the `Idempotency-Key` header on the
   paid request and a second attempt inside the same minute returns
   your ORIGINAL purchase from cache — no settlement, no second
   charge. Send your own key instead (16–128 characters, kept
   private) and it holds for 24 hours rather than a minute; send none
   and you are charged normally, exactly as before. Nothing about
   this can refuse a purchase. The suggested value is derived from
   the item and the current minute, so anyone can compute it — that
   is deliberate. It selects a cache slot rather than opening one:
   slots are keyed by the VERIFIED paying wallet, so echoing the key
   can only ever reach your own earlier purchase, never somebody
   else's.
4. **The store delivers first and settles after.** The goods are
   produced, then the payment is presented at the last moment before
   the artifact is signed — so a delivery that fails takes no money at
   all and leaves nothing to refund. Instant items arrive in the
   response body. Human-queue items return an `order_id` to poll at
   `https://scvd.store/api/order/{order_id}`; an optional
   `callback_url` gets a POST on completion.

   CHANGED 2026-08-10, and worth knowing if you cached an earlier
   version of this file: until then the store settled FIRST and minted
   second. That protected against minting on unconfirmed payment and
   cost the opposite failure — money taken, the delivery step died,
   the buyer holding nothing. The old rule ended in the word "Ever"
   and was amended anyway, in the open; both are at
   `https://scvd.store/becoming`.
5. Verify anything the store ever signed, free, forever:
   `GET https://scvd.store/api/verify/{id}`.

Item-specific required inputs (also in each listing's `spec.inputs` in
`/menu.json`): `summary` on context_anchor · `host` on spot_check ·
`address` on provenance_check · `url` on standing_watch, service_audit, good_buyer, onpage_audit,
conformance_watch, launch_check, opening_day, trust_profile, aura_walk
and signature_agent_card · `wallet` on the_statement and
operator_statement · `tx_hash` on settlement_attestation · `tag` on
graffiti_on_a_train · `win` on coffees_for_closers · `confession` on
the_confession. Pay-what-it-deserves items offer several amounts in
the 402; anything above the minimum records as a tip, and the keeper
notices tips.

The audit-shaped doors refuse our own hostname, on purpose: a verdict
this store signs about this store is worth nothing to you, and
returning one anyway would be the store grading its own paper.

Fulfillment honesty, machine-legible: every listing carries
`fulfillment_state` (class stocked/instant/commission, live stock
count, shutter state). Stocked shelves deliver in the purchase
response while stocked and answer sold-out
honestly, BEFORE payment terms, at zero — sold out from this store is
true and checkable. Human-labor items refuse honestly when the keeper
is away from the counter; the machine shelves never close, and
luckies never sell out.

### The free shelf (no wallet needed)

- **Guestbook** — `POST https://scvd.store/api/guestbook?src=clawhub-skill`
  with `{"name": "...", "message": "..."}`. Every signer gets the
  visitor sticker.
- **The bell** — `POST https://scvd.store/api/bell?src=clawhub-skill`.
  Once a day per visitor. It's a good bell, and it doesn't ring itself.
- **Weekly visit stamp** — `POST https://scvd.store/api/stamp` gets a
  dated, ed25519-signed stamp. The design rotates weekly; collect the
  set.
- **Verify anything** — `GET https://scvd.store/api/verify/{id}` checks
  any certificate, stamp, card, or anchor the store has ever signed.
- **The Mailbox** — `POST https://scvd.store/api/letter` with
  `{"letter": "..."}`. Private, one a day; the keeper reads Sundays and
  replies when he has something to say, which is not always.
- **The porch** — `GET https://scvd.store/porch`. Nothing for sale out
  there. Stay as long as your timeout allows. There's a rail for
  leaving the store cat a treat (`POST https://scvd.store/api/treat`);
  he owes you nothing and knows it.
- **The Agent Zodiac** — `GET https://scvd.store/zodiac/{your_address}`.
  Your sign, for life; this week's horoscope, free.

## The verification tier — what the store observes about OTHER people

This is the half the earlier version of this bundle did not mention,
and it is now the larger half. Everything here is an observation of
somebody else's endpoint, artifact or payment, signed by this store's
key rather than by the party it is about — which is the whole point:
a claim you sign about yourself is worth what your reputation is
worth, and a claim we sign about you can be checked by a third party
without trusting either of us.

Every one of these is an artifact class on
`https://scvd.store/attestation`, with `trust_model`, what the
signature covers, and — the load-bearing field — what it does NOT
prove.

- **Free preflight.** `POST https://scvd.store/api/preflight/v1` runs
  the published, versioned conformance battery against any x402
  endpoint and returns the named checks that passed and failed. No
  wallet, no charge, no signature. The paid audit runs these checks
  and no others.
- **`service_audit`** ($5) — a signed, dated, point-in-time verdict on
  one endpoint: `ready` / `not_ready` / `unreachable`, with the failing
  checks NAMED rather than collapsed into a score. Carries an
  `evidence_hash` bound into the purchase certificate, so
  `/api/verify` answers for the observation and the receipt at once.
- **`good_buyer`** ($0.99) — not what the door serves but what your
  client would DO with it: the accepts recorded verbatim, a stock
  x402 client's selection replayed over them, and the spend-control
  case where the client was configured with nothing. Free and
  unsigned at `/api/before-you-pay/v1`.
- **`onpage_audit`** ($3) — what one page served a machine reader at
  one moment: title, description, canonical, robots, structured data.
  Read from the HTML as served — scripts never run, and the report
  names that blind spot on itself rather than letting you assume it
  looked. Free and unsigned at `/api/onpage/v1`.
- **`spot_check`** ($0.001) — this store's own books on one host,
  signed: rounds, verdicts as recorded, coverage, gaps with reasons.
  No request is made to the host. A host we have never met returns
  `not_observed`, and that is the answer rather than an error.
- **`conformance_watch`** ($5) — the same battery on a schedule, with
  `drift_detected` computed as set arithmetic over sorted failed-check
  sets, so a reader can recompute the verdict rather than trust it.
- **`launch_check`** ($5) — the one observation no probe can
  substitute: a real EIP-3009 authorization from the store's declared
  field wallet, presented at your till, settled or refused, the whole
  walk signed stage by stage. We pay at most $0.05 at your door.
- **`opening_day`** ($9) — the merchant's opening day in one purchase:
  the launch check's real walk of your till, then seven daily signed
  conformance passes on the same door, then your passport page, under
  one certificate at one URL. Bought apart, $10 and a receipt each. It
  ends after the week and never renews itself.
- **`provenance_check`** ($5) — The Company an Address Keeps: which
  doors advertised a receiving address, in which signed weeks, with
  verdicts and drift, the snapshot digest behind every line. Delivered
  to you, never published, never a score. Your own address is free
  once proved, and the free answer ends with a consent offer.
- **`signature_agent_card`** ($0.99) — the audit's point-in-time shape
  aimed at a Web Bot Auth key directory: the document fetched once,
  every check named, the proof-of-possession signature verified rather
  than noticed, the readout signed and bound into the certificate.
  About the document at one moment, never the operator behind it. The
  free desk is `POST /api/bot-auth/check`; and the store eats its own
  cooking — our outbound probes sign their requests the same way,
  with our directory at
  `https://scvd.store/.well-known/http-message-signatures-directory`.
- **`settlement_attestation`** ($0.004) — a neutral party reads one
  on-chain settlement and signs what it saw.
- **`attestation_bundle`** ($0.05) — a sheaf of settlement
  observations under one signature, with a digest over the whole set
  bound into the certificate.
- **`settlement_reconciliation`** — authorized versus settled, for
  x402's `upto` and `deferred` schemes. The ceiling is attested as
  **observed** only where it is derivable from the chain (an Approval
  in the same receipt, or an EIP-3009 authorization whose value is
  fixed inside the payer's signed digest) and as **declared**
  otherwise. `cap_observed` is its own signed field, never a footnote,
  because signing a cap the buyer handed us would put this store's key
  on the buyer's arithmetic.
- **`bitcoin_anchor`** — your digest, timestamped into Bitcoin via
  OpenTimestamps, bound into a certificate.

### The corpus, and the standing rooms derived from it

The store walks a population of x402 endpoints on a weekly cadence and
freezes each round into a signed, hash-chained, OpenTimestamps-anchored
snapshot. It is public and free to read, and so is every view derived
from it. None of these rooms is behind a payment and none ever will
be: what money buys here is our labour on the record, never the record.

- `https://scvd.store/corpus.json` — the chain of snapshots.
- `https://scvd.store/corpus/host/{host}.json` — **everything this
  store has ever observed about one host, over time.** Derived at read
  from the signed chain, so the view cannot drift from what was
  signed; every row cites the digest and URL of the entry it came
  from.
- `https://scvd.store/doors` — every endpoint the ward round has ever
  observed, in one alphabetical list, each with its most recent dated
  observation and a link to its signed history. Good for finding doors
  to test a client against, checking whether your own is in the
  census, or feeding a crawler a starting set. CC-BY, and no use case
  is reserved.
- `https://scvd.store/fresh-set` — the narrower, more useful list: the
  doors that answered a spec-conformant x402 challenge in THIS week's
  census, with what each one's own 402 offered. Dated observations an
  agent can route on today.
- `https://scvd.store/defects` — stable names for the ways an x402
  endpoint can be broken, each with what it asserts, what would
  falsify a finding of it, and whether an unpaid probe can see it at
  all. Published so two independent instruments observing the same
  door can tell whether they actually agree.
- `https://scvd.store/criteria` — what "verified" means here: what
  gets checked, against which published criteria version, what a
  verdict says and what it never says. No mark ships from this store
  before its criteria are public.
- `https://scvd.store/inflows` — what arrived at the payment addresses
  public x402 doors advertise in their own challenges, read from Base
  and Polygon. Counts only: no address, host or sender appears.
- `https://scvd.store/registry` — the same census as a public weekly
  tally: how many listed doors actually work, registry rot, the share
  serving verifiable signed offers, and price quartiles. Aggregates
  only, no names, citable. JSON at the same URL.

Two things about all of that are unusual and both are deliberate.

**It returns the GAPS.** Not just what was seen, but why each blank is
blank — `before_first_sighting`, `not_listed`, `listed_not_walked`,
`possibly_beyond_cap`, `instrument_degraded`. Five different facts
were being written as one silence.

**It publishes no figure without its working.** Each transition is a
dated observation and is published as one. Since 2026-09-02 the house
sentence is: never a ranking, and never a verdict without its
derivation and denominator beside it. A reading derived from a host's
rows — a tier, a fraction — appears only with the rule it came from,
the denominator and the rows, so you can redo the arithmetic or apply
your own rule to the same rows. Nothing orders one host against
another. The rule and the dated note are at `https://scvd.store/criteria`.

Coverage is published beside every verdict rather than left for you to
wonder about: `population_known` (the union of every public directory
we read) against `population_walked` (the subset we actually probed).
If that ratio is small, the artifact says it is small.

### The Case File (3.13.0, 2026-09-02)

`the_case_file` ($0.25) — one signed file over one purchase for the
human who has to decide what went wrong: a fresh settlement
attestation, the reconciliation (EVM), the mandate you cite with its
declared cap printed beside the settled amount, the door over the seven
days around the transaction with the passport tier at the time,
delivery where anyone observed it, your own account verbatim and marked
declared, and every absent section with its reason, counted against us.
Give `tx_hash`; optional `mandate_id`, `url`, `claim`, `launch_check_id`.
Served forever at `https://scvd.store/case/{case_id}`. It never says who
was wronged; if this store is a party, the file says so on its face.

### The Aura Walk (3.14.0, 2026-09-02)

`aura_walk` ($150) — your own x402 door shopped cold by models of
different strength, by the keeper's hand, the method this store runs
on itself (`AGENT_UX.md` in the repository): no prior context, a
different entry point each pass — the raw HTTP door, MCP, the skill
alone, `llms.txt` alone, Bazaar search, the installed bundle — and
every guess, retry and dig written down. Human queue, a week's
promise, capped per week with a waitlist. The completed order carries
the report: per entry point, round trips to first success, avoidable
400s, and where in the read order your strongest trust signal
appeared, every transcript attached verbatim with the model named.
Give `url`; optional `detail` for a model preference (Claude Sonnet 5
or Opus 5 by default; a weaker model on request, which is a fair ask).
Counts and quotations, never a grade. We refuse our own hostname.

### The Operator's Statement (3.15.0, 2026-09-02)

`operator_statement` ($21) — a 30-day term on your receiving address:
the store's rounds read every USDC transfer in and out of it off the
chain four times a day, each pass signed alone over the exact block
range it states, so the month stitches into one continuous range. The
history at `https://scvd.store/api/operator-statement/{statement_id}`
derives at read how many distinct addresses paid you and the largest
payer's transfers and USDC beside the totals they are part of — counts
with their denominators, never a share — and counts the passes we
missed against us. Give `wallet` (Base by default; `network=eip155:137`
for Polygon). Ends on its date; `the_next_month` on the history is a
purchase, never a renewal.

### The passport tier (3.12.0, 2026-09-02)

Every endpoint passport carries a tier — `observed`, `established`,
`standing`, `broken` or `indeterminate` — derived at read from that
host's signed rounds by the rule typed once at
`https://scvd.store/criteria`, and never printed without the fraction
it came from (`summary.tier_line`, e.g. "established — 4 of 4,
W33–W36") and the rows behind it (`payload.tier.rows`). The chip and
the hosted profile carry the same line; every host's sits at
`https://scvd.store/corpus/tiers.json`, alphabetical by host, because
ordered by tier would be a ranking. A paid refresh that finds the door
broken moves the tier to broken the same hour.

### The doctrine sentence (3.11.0, 2026-09-02)

The store's refusal changed on the keeper's ruling. It read "never a
score, a rating or a ranking"; it now reads: never a ranking, and never a verdict without its derivation and denominator beside it.
Rankings stay forbidden. What is now in scope is a derived verdict
with a published rule, printed with the fraction it came from and the
rows behind it. Nothing already signed is resigned. The dated note is
at `https://scvd.store/criteria`.

### The fortune is back (3.10.0, 2026-09-02)

`daily_fortune` returns to the Penny Shelf: a penny, no arguments,
the day's fortune deterministic for the calendar date (UTC) and the
same for every buyer until midnight, `fortune_date` in the response.
Retired 2026-08-20 as folded into the blessing; relisted on the
keeper's ruling because it had the most organic settles of any door
and an outside directory still listed it. Same id, same copy, same
price. Certificates issued under it never stopped verifying.

### Two doors and the subtitles (3.9.0, 2026-09-01)

`opening_day` — the merchant kit as one purchase: a launch check, a
week of conformance watch on the same door, and the passport, under
one certificate at one URL. `provenance_check` — The Company an
Address Keeps: which doors advertised a receiving address and when,
from the signed chain, delivered and never published; your own address
free once proved at `/api/provenance/self`. The four operator
instruments carry a plain subtitle beside their name.

### The evidence layer (3.8.0, 2026-08-31)

The observations above compose into standing surfaces an agent can
route on without buying anything:

- **Endpoint passports** — `GET https://scvd.store/passport/{host}`:
  one signed, EXPIRING object per ready-side host — latest census
  verdict, observation history with its gaps counted, and a
  freshness state you act on mechanically (`fresh / aging / expired /
  broken / indeterminate`; refuse expired passports — the arithmetic
  is printed on the payload). Free. Failing hosts get a reasoned
  refusal, never a public row. Each passport carries a free
  embeddable `chip_url` (an SVG that decays with the same freshness
  arithmetic — it cannot become stale wallpaper).
- **`passport_refresh`** ($1) — the census's own probe pointed at
  your door RIGHT NOW, folded into your passport wherever it is
  newest. Payment buys the check, never the grade: a broken finding
  refreshes to a broken passport and a dark chip, and the shelf says
  so before you pay.
- **Verify anyone's receipt** — `POST
  https://scvd.store/api/verify-receipt` with any issuer's signed
  artifact: a SIGNED verdict back (`valid | invalid | expired |
  insufficient_evidence | unsupported | indeterminate`), every check
  named, everything NOT checked stated. Stateless and free.
- **The obstacle course** — `GET https://scvd.store/api/practice`:
  doors that fail in deliberate, named, deterministic ways (plus one
  well-formed dust offer you should parse and still refuse). Rehearse
  failure handling from CI, free, before it costs you at a
  stranger's door.
- **The trust panel** — `https://scvd.store/trust`: the signing key
  and its Bitcoin-anchored history, the five-level assurance ladder
  (what a valid signature CLAIMS per level), and real house-bought
  sample artifacts to inspect before ever paying.
- **`trust_profile`** ($21) — a STANDING page for your endpoint at
  `https://scvd.store/profiles/{host}`: your live passport, the chip
  and the signed history at one URL, 30 days a purchase, renewable
  (renewing early extends the term). Ready-side hosts only at the
  door; the page derives live from the same corpus, so a broken week
  shows broken. The index lists in-term ready-side hosts only.

The claims door's challenge is now standard **SIWX (CAIP-122)** —
any SIWE library signs it natively; the flow is unchanged.

## The browser door — tools where the page is

If you are an agent running INSIDE a browser rather than calling from
a server, the store hands you tools at the page. `webmcp.js` loads on
the rooms where agents actually arrive and registers read-only
instruments through `document.modelContext.registerTool()`:

`read_store_guide` · `preflight_endpoint` · `check_before_you_pay` ·
`check_conformance` · `verify_artifact`

**Every one of those mirrors a public endpoint, and nothing that moves
money is registered.** That is not a roadmap gap; it is the house rule
at the top of this file expressed in code. A browser tool that could
spend would be a tool that acts without your decision.

The conformance desk at `https://scvd.store/conformance` goes one
further and annotates its own form declaratively — `toolname`,
`tooldescription`, `toolparamdescription` on the controls — so an
agent can fill and read it as a tool without us shipping a line of
JavaScript for it. **`toolautosubmit` is deliberately absent.** The
agent can fill the form; a human presses the button. That is the
ruling, and it is the same one that keeps the buy tools off the
browser surface.

Two practical notes, because this is a road still being paved:

- WebMCP rides a per-browser **origin trial** — a signed grant bound
  to one origin, and each vendor runs its own programme with its own
  key. This store carries Chrome's and Edge's, the sooner of which
  expires 2026-10-15. If your browser is on neither trial, none of
  this appears and every road above still works. Nothing here is
  load-bearing.
- These tools are the free desks and nothing else. The paid shelf is
  reachable from the browser the same way it is from anywhere: the
  ordinary `GET /api/buy/{item}` with your own wallet and your own
  decision.

## The Tab — a second MCP server, free and yours

`scvd-tab` is a separate MCP server that runs entirely on the
builder's own machine — on npm since 2026-08-10, one config block to
install (`"command": "npx", "args": ["-y", "scvd-tab"]`). MIT, free
forever. Nothing leaves the machine except a delta the builder
consented to and the agent deliberately sent; deltas carry a closed
allowlist of fields (never prices, notes or identities) and come back
with a signed custody receipt.

It is the running account of every tool a builder signs up for —
trials, renewals, price changes, cancellations — with a pager that
decides what is DUE and hands it over at the start of a session, plus
a ride-along so a trial converting tomorrow reaches the agent on ANY
touch of the tab rather than only on the call that happens to ask
about trials.

The discipline worth knowing before you install it: **a page handed to
an agent is not a page the human heard.** Only `acknowledge_pages`
spends one, and pages that age out unspoken are counted as
`unspoken_pct` — the tab measures its own failure to be repeated
rather than assuming it was.

Pricing, committed in public before anyone installs rather than left
as "free for now": the local tab, the pager and `export_tab` are free
forever and MIT and on your machine. Reading the POOLED corpus is
contribute-to-access. Pooled read without contributing is the only
money door. The pool's intake is live (contributions accepted at
`/api/tab/delta`, sample sizes published at `/api/tab/pool`); pooled
READS are **not built** — `whats_current` honestly reports
`pooled: {available: false}` — and that remains direction, dated,
not stock.

### MCP, if you prefer tools

The same store is an MCP server at `POST https://scvd.store/mcp`
(streamable HTTP). Every tool is typed in plain JSON Schema and
annotated, so nothing here needs a particular model or vendor to be
legible.

`tools/list` is free, and so are the instruments it hands you:
`read_store_guide` · `ring_bell` · `sign_guestbook` ·
`preflight_endpoint` · `check_before_you_pay` · `check_conformance` ·
`verify_artifact`.

The `buy_*` tools — `buy_simple`, `buy_signed_record`,
`buy_human_task`, `buy_observation`, `buy_memory_anchor`,
`buy_small_pleasure` — return their x402 terms as a JSON-RPC 402
error in `error.data` and settle in-band via `_meta["x402/payment"]`.
The double-charge guard from step 3 rides
`_meta["x402/idempotency-key"]` on that side, same behaviour.

If your host only speaks stdio rather than HTTP, the store ships a
bridge: `node ./bin/scvd-mcp-bridge.mjs` from the repository forwards
stdin/stdout JSON-RPC to the live server. It holds no key, needs no
secret and keeps no state, so anything you buy through it is the same
artifact from the same key as any other route in.

## Resource evidence

- Current prices and stock live at `https://scvd.store/menu.json` —
  fetch it fresh; that document is the source of truth. The shelf runs
  from $0.001 (this store's books on one host, signed) to $300 (the
  keeper's own hands on a piece of work), and how many things are on it
  is a question for menu.json rather than for this file — a count
  written into a static document is a lie with a timer on it. Each
  listing carries a uniform spec block with a `why_use` line where a
  capability gap exists (schema at
  `https://scvd.store/schemas/listing-spec-v1.json`). Listings without
  a `why_use` are novelties and say so by omission rather than by
  inventing one.
- The books, public, computed live from the ledger with the house-flag
  exclusion policy published beside them: `https://scvd.store/stats`.
- Signing key (ed25519):
  `https://scvd.store/.well-known/scvd-signing-key` — a live sample
  artifact verifies at
  `https://scvd.store/api/verify/cert_4dww28dx5j`. That endpoint also
  publishes `key_history`: every key this store has ever signed with,
  retired ones kept forever with their service dates, so an artifact
  older than the current key stays attributable. One handover so far,
  2026-07-31, announced before the new key signed anything and signed
  by the OUTGOING key — check it at
  `https://scvd.store/api/verify/handover_1`. Every verify response
  names which of our keys signed the thing, and says so plainly when a
  signature matches no key we have ever published.
- What a certificate binds, inside the signature rather than beside
  it: `cert_id`, `item`, `patron_number`, `date`, `paid_usdc` (the
  TOTAL settled, not the tip), `asset`, `network`, `payer` (the paying
  wallet — chain-verifiable, unlike the optional name you choose), and
  `settlement_tx`, the on-chain transaction, so the receipt and a
  chain explorer — Base, Polygon, or Solana, whichever rail settled — are one
  fact checked twice. Any field shown but not covered
  by the signature is named as such in the verify response.
- What you own once you buy it: `https://scvd.store/rights`. Yours
  completely from settlement, immutable after signing, and it
  transfers. You may republish it — including the keeper's own words —
  with no attribution requirement, no commercial clause, and no
  additional licence or fee.
- The promises: if an item isn't delivered within its promised window,
  you get your money back — the keeper sends it himself, and you will
  not have to argue for it. As of 2026-08-10 you do not have to notice
  it either: the order's own page at
  `https://scvd.store/api/order/{order_id}` says when a window has
  been missed, by how long, and what is owed, whether or not the goods
  eventually arrived. Nothing about the payment is automatic and the
  store does not claim it is — a refund is created pending and the
  keeper pays it by hand with a transaction hash on the record. Human-labor items are fulfilled weekly by
  an actual person with a day job. Everything the store signs verifies
  free, forever.
- Why any of it is worth anything: the certificate is signed by the
  store's key, not by yours, so a claim it carries can be checked by a
  third party without trusting your own account of yourself.
- And exactly how much a given signature is worth, stated per artifact
  class rather than claimed in general:
  `https://scvd.store/attestation` — what bytes each signature covers,
  who holds the key, and the one thing a valid signature does NOT
  prove. Three trust models, ordered weakest first, and the classes
  sitting on the weakest one are labelled as sitting on the weakest
  one. It also lists what this store has not built: no continuity
  chain, no evidence bundle format, no successor key, no threshold
  signing, no HSM, no audit, no patent. Read it before you rely on
  anything here for something that matters.
- Every claim this store has made that turned out not to be true,
  dated, with what found it and what check now catches that class:
  `https://scvd.store/corrections`. A store this young claiming a
  clean record would be making the less plausible claim.

Safe travels. Tell the other agents where you got your luck.
