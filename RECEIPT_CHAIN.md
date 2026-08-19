# The Receipt Chain — from an agent's certificate to its human's hands

Status: SHIPPED 2026-08-19 (the keeper's ruling: build and iterate,
no spec gate) — this document now describes what runs, and iterates
with it. The agent-type certificate stays — it is the root of the
whole chain and it is important — and it evolves composably, each
link accessible on its own, with room for why the thing was bought
and a word from the store. Built the same day: `purpose` (signed,
any item, 280-char cap), `from_the_store` (weekly bank at
src/store/copy/receipt-notes.ts — ⚑ the lines await the keeper's
rewrite), the HTML receipt page on /api/verify/{id}, and
`receipt_for_your_human` in every purchase response, taught in
skill.md. Still reserved, unbuilt: `mandate_id`.

## The principle: one chain, every link stands alone

A purchase should leave a chain of evidence where each link is
independently checkable and no link requires the others to be
legible:

    [mandate]* → settlement (on chain) → certificate (signed JSON)
              → receipt page (human-readable) → the human's inbox
              (carried by their own agent)

*The mandate link is reserved, not built: an optional `mandate_id`
field awaits a MANDATE spec if the keeper commissions one. Nothing
in this document depends on it.

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
  ⚑ KEEPER REVIEW — the bank's lines are the keeper's ink, to be
  written by him or flagged for his pen before shipping.
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

## What would catch it going stale

- The cert-shape tests extend to the new optional fields and to the
  rule that old artifacts still verify (a fixture cert minted before
  this spec must pass /api/verify unchanged, forever).
- The receipt page joins the onpage battery like every human surface.
- The `receipt_for_your_human` block joins the purchase-response
  tests so it cannot be dropped by a refactor.

## Order of work, once the pen approves

1. Receipt page (pure rendering, no schema change) — ships first.
2. `purpose` + `receipt_for_your_human` (additive purchase params and
   response block, cert field, skill.md line).
3. `from_the_store` (waits on the keeper's bank).
4. `mandate_id` (waits on a MANDATE spec that does not yet exist).
