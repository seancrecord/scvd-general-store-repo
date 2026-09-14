# Does `ready` mean the same thing on a non-`exact` door?

**Asked 2026-09-14, after the scheme advisory was narrowed. Answered
the same day. Short answer: yes — and `ready` was shallower than it
looked in one specific place, which is now named.**

## The question

Narrowing `nonstandard-scheme` fixed what the battery was *saying*. It
did not establish that the battery's *verdict* was right. No check
branches on scheme, so every check written with `exact` in mind runs
unchanged against `upto` (amount is a ceiling), `auth-capture` (a
lifecycle with capture, void, refund and reclaim) and
`batch-settlement` (settlement returns a commitment identifier, not a
transaction hash).

## The answer, check by check

The verdict-moving checks read the **scheme-independent envelope**, and
the specification is explicit that the envelope is the same for every
scheme. `x402-specification-v2.md` §4 marks `scheme`, `network`,
`amount`, `asset` and `payTo` Required on `PaymentRequirements` with no
per-scheme variation, and `scheme_batch_settlement.md` reaches for
`PaymentRequirements.amount` by that name.

| Check | Verdict-moving | Holds across schemes? |
|---|---|---|
| `status-402` | yes (v1 core) | Transport. Scheme-independent. |
| `payment-required-header` | yes (v1 core) | Envelope. Scheme-independent. |
| `x402-version` | yes (v1 core) | Envelope. Scheme-independent. |
| `accepts` | yes (v1 core) | Requires exactly §4's five Required fields. **Correct for all four families.** |
| `amount-not-atomic` | yes (v2) | §4: amounts are atomic-unit integer strings for every scheme. Under `upto` and `auth-capture` the value *means* a ceiling rather than a price, but the encoding it tests is identical. **Correct.** |
| `transfer-method-signable` | yes (v2) | Reads `extra.assetTransferMethod`, which §6.1 makes a protocol-reserved key across mechanisms. **Correct.** |

**No verdict is wrong on a non-`exact` door.** Nothing to fix, and that
is worth writing down as plainly as a defect would be.

## What `ready` did not cover, and now says

§6.1 defines `extra.paymentFlow`, and adds it for exactly the reason
this battery exists:

> When the resolved payment flow is not `authorization`,
> `PaymentRequired` `accepts[].extra.paymentFlow` MUST be present **so
> clients can reason about pre-handler fund commitment without
> scheme-specific knowledge.**

The flow decides when money moves relative to the handler:

- **`authorization`** — verify → handler → settle. A failed handler
  leaves the client uncharged. The spec says clients SHOULD prefer it.
- **`upfront`** / **`escrow`** — the payment commits *first*. On a
  handler failure the client is, in `scheme_exact.md`'s own words,
  "charged with nothing delivered; this specification defines no
  refund, and any remedy is the resource server's own arrangement."

**We already knew.** `src/lib/client-simulator.ts` has dropped
`upfront` and `escrow` entries whenever an `authorization` entry
survives beside them, since it was written. This store's own buying has
never landed on one.

**And we did not tell anyone.** The free preflight — the headline
instrument, the mouth of the funnel, the thing other people's buyers
run before spending — read `extra.name` and `extra.version` out of that
same object and stepped over `paymentFlow`. We knew enough to protect
ourselves and published nothing about it.

That is the finding. Not a wrong verdict: an asymmetry between what our
own client refuses and what our public instrument mentions.

## What shipped

- `PRE_HANDLER_PAYMENT_FLOWS`, `readPaymentFlow` and
  `settlesBeforeHandler` in `src/lib/value-checks.ts`, where both
  readers can reach them. `client-simulator.ts` now calls the shared
  reader rather than its own copy — one law, one spelling.
- Advisory **`settles-before-delivery`** on the preflight battery,
  naming the flow, what it costs a buyer, and the spec's own
  preference for `authorization` when a door offers both.

**Advisory, not a fold.** A door may have good reason to settle
upfront — the spec's own example is a handler that can outrun its
validity window — and scoring an operator for truthfully declaring
their flow would repeat the mistake the scheme advisory just made. The
buyer is told; no verdict moves; nothing already signed changes
meaning.

## What this still does not check

- **Absence draws no conclusion.** §6.1 says omitting the key means the
  mechanism default, and resolving mechanism defaults needs a registry
  this store does not keep. A missing `paymentFlow` reads as unknown,
  not as safe — a named gap rather than a quiet pass.
- **The MUST is not enforced.** §6.1 requires the key to be *present*
  when the resolved flow is not `authorization`. Catching a door that
  omits it while defaulting to `escrow` needs that same registry.
- **Scheme-internal MUSTs are unread.** `upto` carries its own Core
  Properties — single-use authorization, replay protection per network
  — and this battery checks none of them. `ready` means the envelope is
  payable-shaped, not that a scheme's own rules were verified. That is
  true for `exact` too, and truer the further a door gets from it.
