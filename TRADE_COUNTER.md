# The Trade Counter — the shelf, sold on account to marketplaces

Opened 2026-09-03. Status: BUILT, first account LIVE (2026-09-05). The keeper's
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
- **Pass four (2026-09-04, "don't let me gate keep")** — the signer
  to paste in Node, Python and Go on `/trade` and `/trade.md`
  (`TRADE_SNIPPETS`); `npx scvd trade check|order <item>` signs
  against the sandbox with the secret it reads off the contract, never
  one it is told; `callback_url` on any order POSTs the signed delivery
  receipt once, after the response, with Web Bot Auth on the request,
  outcome written on the statement row; the statement API is signed
  over its JCS form with the published key; `docs/TRADE_OUTREACH.md`
  carries the target list and the letter. Rule 7 waived for the
  counter's copy by the keeper the same evening; the copy is inked.
- **Pass five (2026-09-04)** — recovery by `order_ref`
  (`GET /api/trade/{account}/claim`, signed) for the marketplace's
  customer who lost the receipt; the standard share ladder
  (`STANDARD_SHARE_LADDER`, printed on the contract; an account row may
  carry its own, the first account keeps its flat share) fed by a
  monthly live-delivery counter, with the trade price derived from
  the tier so the store nets the same at every step; the worked
  example with fixed inputs and every byte shown (`worked_example` on
  the contract, a section on `/trade.md`); the counter beside the
  rails on `/rails`, never inside them.
- **Pass six (2026-09-04, tightening)** — the check desk answers a
  per-account hourly budget (`TRADE_CHECK_DESK_HOURLY_BUDGET`) and then
  refuses as `desk_rate_limited`, so a partner who issued a weak
  provider key is not exposed by our helpfulness; the admin payout
  FORM is same-origin or refused (`cross_site_refused`), because a
  browser presents cached Basic Auth on a form from any origin and a
  forged payout would reopen credit. JSON from a script is unguarded
  by it, since a script carries no page's cached credentials.
- **Pass seven (2026-09-04, Hal's reply: "I will not send credentials
  while the door still returns 503")** — `account_not_provisioned`
  (503) is its own refusal, distinct from `counter_closed` (the replay
  store), and the contract prints `provisioned` and `door_status` per
  account. The check desk answers WITHOUT a secret: every check that
  needs none runs and is reported (headers, timestamp, nonce shape,
  signature shape, the sha256 of the signing string), the provider key
  and the HMAC are reported `unverifiable`, and `first_failure` names
  the missing secret only when the bytes are right — so a partner
  proves its signer in its own dialect before either side has issued
  anything. Each account row carries a `fixture` (door, one-field
  body, expected values on the 200) and the contract prints
  `response_invariants` as rows the suite holds against a real
  delivery. `pricing.settlement_currency` says once that the books
  are in USD and the store prints no sats figure (rule 45).
- **Pass eight (2026-09-04, Hal's answers)** — the ten answers
  recorded below and printed on the account row as `partner_terms`;
  a concrete `door` per item on the row, because their listing takes
  one endpoint URL per item; the settlement line names OpenNode
  Lightning on mainnet at 95% of a fixed sats price. The keeper's
  step corrected: Hal generates both secrets at listing creation and
  the keeper copies them in; nothing is minted here.
- **Pass nine (2026-09-04, "is this marketed correctly for other
  people outside Hal")** — the audit found the copy generic and
  consistent across every surface, with four gaps, now closed: who
  buys on account as six concrete rows (`TRADE_WHO_BUYS`) on the
  page, the JSON twin and the markdown; four FAQ entries a stranger
  asks first (a currency we do not take, a signing scheme they
  already have, volume terms, rotation by cutover); the FAQ as a
  FAQPage node beside the Service node; and `/scorers`, the room
  titled for marketplaces, now pointing at the counter. A test holds
  that no generic row names a partner.
- **Pass ten (2026-09-05, one pair per listing)** — Hal issues a
  provider key and a signing secret PER LISTING, shown once after
  each create. Secrets may now be keyed to an item as well as to the
  account (`TRADE_SECRET_<ID>__<ITEM>`, read before the account's
  own), the order door verifies against the item's pair, the check
  desk, the statement and the claim try every pair the account holds
  and say which one matched, and the contract prints `secret_scope`
  on the account row and `provisioned` on every item row. A partner
  that issues one pair for everything is unchanged.
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
503 `counter_closed`; money fails closed. An account whose secret is
not yet set answers 503 `account_not_provisioned` instead, so a
partner can tell the two apart.

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
   `TRADE_PROVIDER_KEY_<ID>` where their scheme sends one), with the
   values THEIR side issues — a marketplace that signs its own calls
   generates the secret; nothing is minted here. Rotation, where
   their side supports two active secrets: set
   `TRADE_SECRET_<ID>_PREVIOUS` to the outgoing value, the new value
   in service, unset the previous when they confirm. Where it is a
   cutover, they pause, the keeper sets, they resume.
4. Partner runs real calls in test; both sides read
   `/api/trade/ledger`.
5. Keeper flips `mode` to `live` in a commit when terms are settled.

## The first account: Hal's answers (2026-09-04)

`hal` (halmarket.dev), share 5%, LIVE since 2026-09-05 on the keeper's word, once the nine listings went live on Hal's side. Hal's owner answered the
ten questions the same day; every dialect field already matched
(seconds, a separate provider key, a 300-second window, a 32-hex
nonce), so nothing failed closed. The answers, and what each one
means on this side:

1. **Settlement** — Lightning via OpenNode on mainnet. The USDC path
   they mention is Base Sepolia test only, not a payout. Receiving
   sats is a treasury rail the keeper owns (which wallet, whose
   custody) before the flip to live.
2. **Two secrets, both generated by Hal, ONE PAIR PER LISTING**,
   shown once after each create (confirmed on the form 2026-09-05).
   NOTHING is minted on this side. The keeper creates a paused
   listing per item at `https://sell.halmarket.dev/services/new` and
   copies each pair into `TRADE_SECRET_HAL__<ITEM>` and
   `TRADE_PROVIDER_KEY_HAL__<ITEM>`; the order door for that item
   verifies against that pair. Confirms to Hal only the listing ids
   and `is_paused: true`.
3. **Timestamps** — unix seconds. Matches the row.
4. **Retries** — one POST, 30 s, no automatic retry; a real retry
   carries a fresh timestamp, nonce and signature and is a new order
   on Hal's side. Hal does not inject an `order_ref`, so each attempt
   is a fresh sale here too, which is the same answer. Our probes
   are bounded at 8 s (`PROBE_TIMEOUT_MS`), well inside their 30.
5. **Nonces** — holding ten minutes against their five is fine.
6. **Rotation** — a cutover: Hal replaces the secret and pauses the
   listing; the keeper sets the new value and Hal resumes.
   `TRADE_SECRET_HAL_PREVIOUS` stays unused for this account.
7. **Egress IPs** — none published; nothing here depends on one.
8. **Statement API** — none bilateral today. Reconciliation is Hal's
   seller dashboard against `GET /api/trade/hal/statement`, signed.
9. **Refunds** — a failed call (error status, timeout, invalid JSON,
   oversized body) refunds Hal's buyer and credits nothing; a valid
   JSON delivery finalises credit and fee; no clawback after delivery
   on either side. The direction this store accepts (rule 9): goods
   delivered and a response lost past 30 s is a delivery nobody pays
   for, and the statement row stands as test or is a letter.
10. **Sandbox** — none for sats. A paused listing plus the fixture on
    the account row cover preflight without spend; any paid canary
    uses real sats and needs explicit authorisation on both sides.

Two more from their side, both now rows: Hal needs a **fixed integer
sats price per listing** and does no conversion per call (the keeper
sets it from `trade_price_usd` at the day's rate, rounded up; the
statement bills USD; `pricing.settlement_currency` says so), and
**`endpoint_url` is concrete**, so it is one listing per item, each
pointing at the item's `door` printed on the account row.

All of this is public on the account row as `partner_terms`.

### The nine listings on Hal (created 2026-09-05, one pair per listing)

Seller-dashboard ids, in creation order, matched to items by that
order (the keeper's paste; confirm against the dashboard before
relying on the mapping for a dispute). Each listing's endpoint URL is
the item's `door` on the hal row; each pair is under
`TRADE_SECRET_HAL__<ITEM>` / `TRADE_PROVIDER_KEY_HAL__<ITEM>`.

| Item | Listing id |
|---|---|
| certificate_of_patronage | `4c94f7d6-7b01-4310-a7de-95df3e7b2a00` |
| context_anchor | `23b07a8a-ea0b-4255-8779-fcf16709feb4` |
| bitcoin_anchor | `337f84d2-029d-4aff-bb58-2e600b9d70aa` |
| signature_agent_card | `936dbccb-0963-4ef9-8f32-3b213faa1827` |
| onpage_audit | `22a55522-eac2-4bd1-afdc-24e96d673c9c` |
| service_audit | `7b1581ad-11f4-408a-ab1a-83b8502c5f7c` |
| passport_refresh | `c5860e61-29d9-49d7-99ca-5a6159435c2b` |
| good_buyer | `59f3e9bd-bd29-408c-8a3b-b54537671fae` |
| provenance_check | `4bf3c2c4-1df1-422b-8bf4-c93c5309b982` |

The listings went LIVE on Hal's side the same day, not paused. One
pair was saved as plain text by mistake, deployed, then rotated on
both sides the same hour; the burned value is out of service.
## What this is not

Not a rail (no money moves through this door). Not a discount
channel (trade prices sit above the front door by rule). Not an
escrow, a guarantor, or a dispute court between a partner and its
customer. Not a way to buy the keeper's hands.
