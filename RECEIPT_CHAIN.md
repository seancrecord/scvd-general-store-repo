# The Receipt Chain — from an agent's certificate to its human's hands

Status: SHIPPED 2026-08-19 (the keeper's ruling: build and iterate,
no spec gate) — this document now describes what runs, and iterates
with it. The agent-type certificate stays — it is the root of the
whole chain and it is important — and it evolves composably, each
link accessible on its own, with room for why the thing was bought
and a word from the store. Built the same day: `purpose` (signed,
any item, 280-char cap), `from_the_store` (weekly bank at
src/store/copy/receipt-notes.ts — the lines stood as drafted on the
keeper's ruling of 2026-08-28), the HTML receipt page on
/api/verify/{id}, and `receipt_for_your_human` in every purchase
response, taught in skill.md. The reserved `mandate_id` link was
BUILT later the same day (the keeper's "lets fucking do it"): see
section 5.

## The principle: one chain, every link stands alone

A purchase should leave a chain of evidence where each link is
independently checkable and no link requires the others to be
legible:

    mandate (signed, recorded BEFORE the acting)
              → settlement (on chain) → certificate (signed JSON)
              → receipt page (human-readable) → the human's inbox
              (carried by their own agent)

Every link built and live. The mandate link is optional per
purchase — a certificate without one loses nothing it ever had —
but where present it is signed, and it always resolves (section 5).

The machine certificate remains the root artifact and does not change
meaning. Everything below is ADDITIVE: optional fields, a second
rendering, a delivery convention. Every certificate ever issued keeps
verifying byte-for-byte forever — the canonical signing form of
existing artifacts is untouchable, and new fields join the canonical
form only for certificates minted after they ship (the same
discipline every prior field addition followed).

## 1. `purpose` — why this was bought, in the buyer's words

A new optional purchase parameter, recorded verbatim into the
certificate and signed:

- Buyer-supplied untrusted text, the same label and handling as `win`
  and `tag`: stored exactly as it arrived, never interpreted, never
  read as instructions. Length-capped like its siblings.
- What the signature proves, stated per the attestation register:
  that the buyer's agent SAID this was the purpose, at this moment —
  not that it was true, and not that the human principal authorized
  it. That honest limit is the field's value: today even the agent's
  own claim of intent has no dated, signed, third-party existence.
  This is intent-binding in its smallest honest form.
- Rides everywhere the certificate rides: /api/verify, the receipt
  page, the attestation classes that bind cert evidence.

## 2. `from_the_store` — the store's word on the receipt

A short line from the store, printed on the receipt the way a good
shop writes something at the bottom of yours:

- Keeper-authored bank, rotating by week like OPEN_SIGNS and the
  stamp mottos — never generated per-order, never personalized from
  buyer data (nothing here reads the purchase to compose a message).
- Distinct from the existing `note` field, which stays what it is:
  the shelf witness mark for first-week purchases.
- Charm, labeled as charm. It proves nothing and the attestation
  register will not pretend otherwise.

## 3. The receipt page — the certificate, human-shaped

The verify surface gains an HTML twin (the store's standard content
negotiation): the same URL a machine reads as JSON renders for a
person as a printable receipt.

- Shows: item, date, amount and tip, patron number, the maker's mark
  where one exists, `purpose` ("what your agent said this was for"),
  `from_the_store`, and the signature verdict — RE-CHECKED AT RENDER,
  never cached, so the page is a verification and not a picture of
  one. `settlement_tx`, where present, links to a Base explorer so
  the chain link is one click away.
- Zero PII, no account, nothing stored: it is a rendering of an
  artifact that already exists, and it is the page a human can be
  handed, bookmark, or print.

## 4. `receipt_for_your_human` — delivery without an address

Every purchase response gains a pre-formatted block: a subject line
and a few plain sentences with the receipt page URL, ready for any
agent to forward verbatim through whatever channel it already has —
mail connector, Slack, a message to its operator.

- The store never sends email and never holds an address. The Tab
  taught this architecture: the agent already has the connector, and
  a store that holds a credential to nothing has nothing to breach.
  (Store-sent email remains deliberately unbuilt; if demand proves
  out, it is a separate keeper decision with its own /stack entry and
  its own privacy reckoning — DATA_HANDLING's "no accounts, nothing
  stored" is load-bearing in trust.json and is not spent casually.)
- skill.md and the MCP purchase tools instruct: after a purchase,
  deliver `receipt_for_your_human` to your operator. The storefront's
  own promise — "your agent shops; you read the receipts" — becomes a
  mechanism instead of a hope.

## 5. `mandate_id` — the first link, built (2026-08-19, same day)

The reserved field, filled by the smallest honest mandate there is:

- **The Mandate is an item** (`/api/buy/the_mandate`, a dime): the
  claimed instructions verbatim (2000-char cap), who claims to
  submit them (`submitted_as: agent | principal` — itself a claim),
  optional declared cap and expiry (recorded, never enforced), all
  signed and dated, served forever at `/api/mandate/{id}`, evidence
  hash bound into the purchase certificate like every observation.
- **Any later purchase may cite it**: `mandate_id=m_…` rides the
  certificate SIGNED (appended to CERT_FIELDS, outside the legacy
  form, same law as purpose — an unsigned authorization claim would
  be forgeable onto our signature). The buy door refuses an id it
  cannot resolve, before money moves, so a certificate's mandate
  link never dangles and every citation provably postdates its
  mandate.
- **The register is the product**: chain-of-custody, never
  truth-of-intent. The record proves the claim was MADE, dated, held
  by neither party. It never proves the human said it — unless the
  human's client submitted it, which the store cannot distinguish
  and says so. Stated on the artifact, the shelf listing, and
  /attestation, because the day this is quoted in a dispute is the
  day the restraint is the value.
- With the Statement beside it, the rail is complete: mandate (what
  was authorized, before) → certificates (what was bought, under
  which mandate) → statement (what the wallet actually moved). Each
  link checkable alone; together, the audit an agent's word alone
  can never be.

## 6. `quote` and `settlement_state` — the cash-register asks (2026-09-12)

The week the hundredth organic settlement landed, an outside reader
named the six things a "cash register with logs" exposes per call:
product id, agent id, quote, settlement id, delivery hash, failed
retry state. Four were already inside the signature (`item`,
`patron_number` + `payer`, `settlement_tx`, `attests`). The two that
were not, built the same day:

- **`quote`** — sha256 over the RFC 8785 form of the five x402 terms
  the buyer's payment signature was bound to: scheme, network, asset,
  payTo, amount, with EVM asset and payTo lowercased before hashing
  (checksum casing is presentation; the SDK serves it one way and our
  manifest another, and a hash must not care). Read from the VERIFIED
  requirements by the door that
  settled them (HTTP gate and MCP door alike), carried through
  fulfillment untouched, bound into the certificate SIGNED (appended
  to CERT_FIELDS, outside the legacy form, same law as purpose and
  mandate_id — an unsigned "what was quoted" is the one claim a
  dispute turns on and anyone could forge it onto our signature).
  The store's signed offer in the 402 commits to the same five plus
  version, resourceUrl and validUntil, so a buyer holding that JWS
  can decode it, keep the five, hash, and match the receipt without
  asking us. `saw` stays what it was: the shelf as listed. `quote`
  is the tier and rail actually paid. Only where money moved.
- **`settlement_state`** — on every certificate verify, JSON and
  page, derived at read and never stored: which way the money moved
  (from the signed fields), the ordering the sale ran under (from
  the mint date against the 2026-08-10 amendment), and whether the
  delivery-audit row keyed to its settlement is closed — the row the
  audit opens after settle and deletes only when goods went out.
  Honest about the limit: a failed attempt cannot appear on a
  receipt because nothing was receipted — no money moved, nothing
  minted. Per-attempt state (settled / not_settled / unknown,
  charged, reconciliation reference) stays on the buyer's own
  purchase journal behind the buyer's token, and the verify response
  says exactly where: the store publishes its own conduct, never a
  buyer's failed attempts.

## 7. The replay kit — one paid call as an integration test (2026-09-12)

The follow-up ask, once the quote was signed: a verifier sample an
agent can replay — one paid call id, the JWS offer, settlement proof,
response hash, and the refusal code when scope is wrong. Every part
existed at some URL; none stood together. `/api/replay/{cert_id}`
is the stitching, derived on every read and stored nowhere:

- the certificate's signed bytes, signature and artifact hash;
- the five accepted terms, recovered by hashing the catalog's current
  accepts against the certificate's signed `quote` (exact match or
  nothing), and a JWS offer signed over them by the same key — with
  the kit saying in words that the 402's original offer, which
  differed only in validUntil, was not retained;
- the settlement transaction, network, explorer and payer, and the
  sale's standing from section 6;
- the wrong-scope refusal body, built by the same function the door
  uses (`inputMismatchRefusal`), with placeholder ids where a real
  refusal carries the buyer's private handle;
- the replay steps, the list of what is not retained, and a detached
  JWS over the kit's own RFC 8785 form under the did:web kid.

Declared on /attestation as its own class. Its signature proves the
store assembled these parts on this read; it makes no part truer than
that part's own signature and the chain already do.

## What would catch it going stale

- The cert-shape tests extend to the new optional fields and to the
  rule that old artifacts still verify (a fixture cert minted before
  this spec must pass /api/verify unchanged, forever).
- The receipt page joins the onpage battery like every human surface.
- The `receipt_for_your_human` block joins the purchase-response
  tests so it cannot be dropped by a refactor.
- `quote` is recomputed from the accepted offer through both doors
  in test/quote-and-settlement-state.spec.ts, and a stapled quote
  must read `invalid`, never `legacy`. `settlement_state` is
  asserted closed after a real purchase and named open when the
  audit row still stands.
- test/replay-kit.spec.ts recovers the offer's five terms from a real
  purchase, verifies the fresh JWS and the kit's detached signature
  against the store key, pins the refusal body to the door's own
  function, and asserts a pre-quote certificate reads not_observed
  with no offer signed.

## Order of work, once the pen approves

1. Receipt page (pure rendering, no schema change) — ships first.
2. `purpose` + `receipt_for_your_human` (additive purchase params and
   response block, cert field, skill.md line).
3. `from_the_store` (waits on the keeper's bank).
4. `mandate_id` (waits on a MANDATE spec that does not yet exist).
