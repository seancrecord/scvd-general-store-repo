# The Trade Counter — the shelf, sold on account to marketplaces

Opened 2026-09-03. Status: BUILT, first account in TEST. The keeper's
greenlight, verbatim: "make sure we get good margin and lets build it
out, make sure we have good marketable copy, we sell as a product,
nothing to do with hal we just take his need or problem and build it
then scale it out."

Room: `/trade`. Contract: `/api/trade/contract`. Catalog feed:
`/api/trade/catalog`. Ledger: `/api/trade/ledger`. Liveness: `/health`.
The door: `POST /api/trade/{account}/{item_id}`. The check desk:
`POST /api/trade/{account}/check`. The account's own statement:
`GET /api/trade/{account}/statement` (signed over the empty body).

## Round two (2026-09-03, "how do we make this better for everyone")

- **The sandbox** — account `sandbox`, dialect `canonical`, secret
  PUBLISHED on `/trade` and the contract. Real signatures, real goods
  marked test, booked nowhere, fifty a day. Test-mode by construction
  (a guard refuses a published secret on a live account).
- **The check desk** — every one of the four signature checks
  reported by name, the sha256 of the signing string we computed, and
  on the sandbox the signature we expected. Delivers nothing, consumes
  no nonce.
- **The statement API** — an account reads its own rows, both sides,
  signed like an order. Reconciliation is mechanical on both sides.
- **The catalog feed** — every shelf item with its copy, specimen,
  artifact class and price at the caller's share, derived from the
  rows our own shelf renders.
- **The credit ceiling** — `credit_ceiling_usd` per account, a running
  counter of unpaid net checked before delivery on live accounts,
  refused as `credit_ceiling_reached`, re-seated from the rows by the
  statement desk and compared by the books sweep (invariant six).
- **The aging watch** — Sunday press: any live account whose oldest
  unpaid delivery is older than `TRADE_STATEMENT_DAYS` pages the
  keeper by name (rule 41's other side).
- **Named where its reader looks** — `/developers`, `/operators`,
  `/pricing` (charter clause `trade_channel`), `/how-it-works`, the
  nine item pages, agents.md, the RFC 9727 api-catalog, the
  storefront. The delivery and the receipt page say refunds go
  through the account holder.
- **The markdown twin** — `/trade.md`, and `/trade` under
  `Accept: text/markdown`, rendered from the same constants as the
  page and the JSON twin; canonical points home.
- **The statement desk as a page** — `/admin/trade`: every account's
  summary, both sides of the rows, and a form per live account to
  record a payout by hand. `/admin/trade.json` for a script.
- **The letter to Hal** — `docs/TRADE_HAL_LETTER.md`, drafted for the
  keeper's hand with the ten questions in plain words.
- **House rule 60 and the feature register** — `src/store/features.ts`
  and `test/feature-surfaces.spec.ts`: one row per feature (room,
  doors, pages that must link it, one proposition sentence, one money
  sentence), held identical across the page, the JSON twin and
  llms.txt, with a typed schema.org node on the room and a ratchet
  that refuses any newer room or API path without a row.

## What it is

A platform that resells to agents — a marketplace, an aggregator, a
payments layer that hides x402 from its own users — lists our shelf
under its roof, collects its customer's money however it collects,
and orders from us by signed webhook. One door, one JSON body, one
HMAC-signed instruction per sale. We deliver the same signed goods
the front door sells and bill the account on a statement. The
customer never touches x402.

The signing scheme (HMAC-SHA256 over timestamp, nonce and the exact
body, a five-minute window, nonces never honoured twice) is the shape
Stripe, GitHub, Shopify and Twilio all use. What differs between
marketplaces is five details — header names, the order of the signed
string, seconds or milliseconds, the signature prefix, whether a
provider key travels alongside — and those are a **dialect row**, not
a branch. The first account arrived with its own dialect; the next
gets a row.

## Where it lives

| Piece | File |
|---|---|
| The lock: verification, dialects, the reference signer | `src/lib/trade-auth.ts` |
| The replay store (a Durable Object, and why) | `src/services/trade-nonces.ts` |
| Dialects, accounts, pricing rule, shelf, copy | `src/store/trade-counter.ts` |
| Secrets by name, input checks, cap, idempotency, ledger, statement | `src/services/trade-counter.ts` |
| The doors | `src/routes/trade-counter.ts` |
| The statement desk (keeper's password) | `src/routes/admin.ts` — `/admin/trade.json`, `POST /admin/trade/{account}/payout` |
| The honest certificate | `src/services/certificates.ts`, `src/lib/signing.ts` (four fields, appended), `src/types.ts` |
| Tests | `test/trade-auth.spec.ts`, `test/trade-counter.spec.ts` |

## The register tells the truth — the finding that shaped the build

Wired naively into the purchase flow, a trade sale would have minted
a certificate saying it settled on Base, because that is what
`mintCertificate` stamps whenever `paid_usdc` is positive. Base never
saw a trade sale. So a trade certificate carries **no** `paid_usdc`,
`asset`, `network`, `payer` or `settlement_tx`, and four fields that
say what happened instead:

- `settled_via`: `trade_account`, or `trade_account_test` while the
  account is in test
- `trade_partner`: the account id
- `trade_price_usd`: the listed trade price the account is billed at
- `trade_instruction`: sha256 of the exact string the partner signed

All four are signed (appended to `CERT_FIELDS`; tamper one and the
signature is `invalid`, not `legacy`). `/attestation` carries the
class (`trade_certificate`) with what it does and does not prove. The
receipt page says "Trade account — X collected its customer's
payment; none reached this store." Store credit does not accrue
(there is no paying wallet). Tax export skips them (no USDC moved).

## The nonce store is not KV, and the reason

The existing replay guard is read-then-write on KV and is safe only
because EIP-3009 nonces burn on-chain (test/replay-concurrency.spec.ts
pins that). A trade sale has no chain behind it: a captured request
replayed at a second edge inside KV's propagation window is two
deliveries for one instruction. So the nonce set is a Durable Object,
one per account, one writer, the same answer from every edge —
`TRADE_NONCES` in `wrangler.jsonc`, SQLite-backed, created by the
migration with no dashboard step. Unbound, every trade door answers
503 `counter_closed`; money fails closed.

## The margin, as a rule

    trade_price = ceil_to_cent( retail × (1 + uplift) ÷ (1 − partner_share) )

`TRADE_UPLIFT_BPS = 2000` (⚑ keeper dial). After the partner's share
the store nets retail plus 20%, never less than the front door would
have taken. A $5 instrument at a 5% share lists at $6.32 and nets
$6.00. Items under `TRADE_MIN_RETAIL_USD = 0.5` are not at the
counter (a partner settling in sats cannot split five percent of a
penny). Prices are printed per item at `/api/trade/contract`, at the
example share and at each account's own; a test holds the rule on
every row at every share the counter would open.

## The shelf at the counter

Instant items with self-contained inputs, at or above the floor:
`certificate_of_patronage`, `context_anchor`, `bitcoin_anchor`,
`signature_agent_card`, `onpage_audit`, `service_audit`,
`passport_refresh`, `good_buyer`, `provenance_check`. Inputs are
checked with the front door's own rules (`validateTradeInputs`
mirrors `routes/buy.ts`). Not at the counter: the penny shelf, the
human queue, stocked units, term watches, the settlement
observations. `/api/trade/contract` prints
`eligible_but_not_yet_shelved` so nothing qualifies quietly.

## The books

- One ledger row per delivery in `ORDERS` (`trade:{account}:…`),
  written AFTER the goods went out. Delivered-and-not-booked is the
  direction the store accepts (rule 9); the reverse never happens.
- The receivable is DERIVED from rows by a capped read that says
  `truncated` (rule 52). Test-mode rows are counted and not billed.
- `order_ref` idempotency: the same reference within a day returns
  the original delivery, unbilled twice. A partner that retries
  without one gets a fresh sale, and the terms say so.
- Daily cap per account (`daily_cap`): the blast-radius bound on a
  leaked secret, counted on KV, alerts once per day when tripped.
- Payouts are recorded by the keeper's hand (`POST
  /admin/trade/{account}/payout`); outstanding = net − paid, public.

## Opening an account — the keeper's hands

1. Partner writes to `POST /api/letter`: platform, dialect, items,
   expected volume.
2. Keeper adds a row to `TRADE_PARTNERS` (mode `test`), and a
   dialect row if theirs differs from `canonical` or `hal`.
3. `wrangler secret put TRADE_SECRET_<ID>` (and
   `TRADE_PROVIDER_KEY_<ID>` where their scheme sends one). Rotation:
   set `TRADE_SECRET_<ID>_PREVIOUS` to the outgoing value, the new
   value in service, unset the previous when they confirm.
4. Partner runs real calls in test; both sides read
   `/api/trade/ledger`.
5. Keeper flips `mode` to `live` in a commit when terms are settled.

## The first account, and what is still theirs to answer

`hal` (halmarket.dev), share 5%, settles in sats off-chain, in TEST.
Two dialect fields are their answer and fail closed if wrong:
`timestamp_unit` (a millisecond clock read as seconds is refused on
every call) and whether the provider key is a separate secret from
the signing secret (if it is one value, the header is a label and
the HMAC is the whole lock — the code already treats it that way).

Questions sent before the account goes live:

1. Settlement mode today — real Lightning on mainnet, or simulated?
   Same for any USDC payout path.
2. Are the provider key and the HMAC signing secret two values?
3. Timestamp units — unix seconds or milliseconds?
4. Retry behaviour on a 30s timeout: backoff, fresh nonce, and is
   there a stable order id we can key idempotency on? (`order_ref`
   is ours; theirs is welcome under any name.)
5. May nonces be held longer than the 5-minute window (we hold 10)?
6. Rotation: two active secrets during a handover, or a cutover?
7. Egress IPs, for an allowlist as a second layer.
8. A statement or per-order settlement API, so the weekly
   reconciliation is mechanical rather than trust.
9. Refunds and clawbacks: who refunds their customer, and does a
   refund reverse a statement line?
10. A test or sandbox mode on their side, matching ours.

## What this is not

Not a rail (no money moves through this door). Not a discount
channel (trade prices sit above the front door by rule). Not an
escrow, a guarantor, or a dispute court between a partner and its
customer. Not a way to buy the keeper's hands.
