# COMPETITIVE.md — the map, and the rule that keeps it real

Opened 2026-07-30, the night after a competitor's product scored our
own address and taught us something we could not see from inside.

## THE RULE, FIRST, BECAUSE IT IS THE WHOLE VALUE OF THIS FILE

**No company enters this document from memory.**

Not mine, not a model's, not a half-remembered launch post. A
landscape written from recall is fiction with a confident voice: this
space moves weekly, an assistant's training has a cutoff, and a
plausible-sounding list of competitors is exactly the artifact that
gets believed and never checked. The store has already been bitten
three times by claims that sounded true and had nothing behind them —
the automatic refunds, the decline reasons "on the desk," the CI we
told visitors we had.

An entry needs one of exactly two things:

1. **A receipt.** We paid them, and we have the transaction. This is
   the strong form, and it is what `/neighbours` publishes.
2. **A dated use.** We used the service, it did the thing, and the
   date is recorded. The trust list's `relation: "used"` class.

Anything else is a QUESTION, and questions live in the "open" section
at the bottom with a name against them. A question is not a finding.

**Who does the field work:** CV has network access and a wallet; the
build environment does not (outbound to most hosts is blocked, which
is why the ClawHub registry, our own domain, and every competitor's
API are all unreachable from where this file was written). Any row
that needs somebody to go and look is CV's, or the keeper's.

---

## THE THREE MAPS, KEPT APART

Collapsing these is how positioning documents become useless. They
answer different questions and the same company can appear in more
than one.

### 1. DIRECT — services selling to agents, for money, over x402

The people a buyer might choose *instead of* us.

| Service | What we know | Evidence | Date |
|---|---|---|---|
| 402sentinel | Sells risk scoring on payment addresses. We paid $0.002 to score our own; it returned `review`, 63/100, on address age and payer concentration. Correct on every point. | receipt, `/neighbours` | 2026-07-29 |

**That is the entire verified direct-competitor set.** One row. It
looks thin because it is honest, and a thin true map beats a full
invented one — but the thinness is itself a finding worth sitting
with: after eight days in this market we have paid exactly one company
that competes with us.

### 2. INFRASTRUCTURE — services we route through or are listed by

Not competitors. Failure modes. If one of these goes down or changes
policy, our store changes shape whether we agree or not.

| Service | Relationship | Evidence | Date |
|---|---|---|---|
| x402scan | Probes our published routes and reports what failed. Found thirty-two real complaints on the first pass. | used, trust list | 2026-07-27 |
| agentic.market | Reads the Bazaar, shows computed quality signals. Told us something true we had not noticed. | used, trust list | 2026-07-27 |
| x402scout | Probes submitted endpoints; ours answered three of six, which found a real bug. | used, trust list | 2026-07-27 |

The unlisted members of this map are the ones that matter most and are
easiest to forget, because we never chose them consciously: the CDP
facilitator, Base, USDC's issuer, Cloudflare. See "the big-player
question" below.

### 3. PARALLEL — the same shape, a different market

The keeper's instinct, and the most underrated of the three. Not who
competes with us; **who has already solved the problem we are
solving, somewhere else.** A general store selling verifiable goods to
machines has structural analogues in businesses that look nothing like
it: certificate authorities, escrow, bonded couriers, assay offices,
notaries, seed banks, tool libraries.

The question a parallel answers is not "what do they charge" but
"what did they learn that we are about to learn expensively." Nobody
has to be in this market for their answer to apply.

**Status: empty, deliberately.** This is positioning work in the
keeper's voice, and it is the one section that should NOT be filled by
an assistant listing plausible analogues. Filling it is a
conversation, not a task.

---

## THE BIG-PLAYER QUESTION

The keeper's idea: name the large companies in our stack as a trust
signal.

**There is an honest version and a dishonest one, and they use nearly
identical words.**

DISHONEST: "Powered by Coinbase. Built on Base. Secured by
Cloudflare." Every one of those is technically defensible and all
three imply a relationship that does not exist. Nobody at any of those
companies has heard of this store. That is borrowed credibility, it is
the exact move the trust list's scope guard exists to prevent, and an
agent doing diligence will find no corroboration on the other end —
which costs us more than the sentence ever earned.

HONEST: **a dependency disclosure.** Not "these companies vouch for
us" but "here is what this store rests on, and here is what breaks if
each one does." That is a genuine trust signal, because it is
information a careful buyer needs and almost nobody volunteers:

- the CDP facilitator verifies and settles every payment — if it is
  down, nothing here can be bought, and no amount of our code fixes it
- Base carries the money; USDC is the only asset we price in
- Cloudflare Workers is the whole store, one Worker
- our ed25519 key signs every artifact, and if it is lost, every
  certificate we ever issued becomes unverifiable

Each of those is checkable from outside — the 402s carry the network
and the facilitator, the signing key is published, the Worker answers
on our domain. **Nothing there needs anyone's permission to say, and
none of it claims an endorsement.**

The difference in one line: *we depend on them; they have never heard
of us; both facts are published.*

**Proposed build, keeper's nod required:** a `/stack` document, signed,
in the same family as `/house-ledger.json` — what we rest on, what
fails when each does, and what a buyer loses in each case. It is the
supply-chain mirror of the house ledger: the ledger says what we
control, the stack says what we don't.

---

## WHAT WOULD ACTUALLY CHANGE OUR BEHAVIOUR

A competitive map is worth building only for questions whose answers
change a decision. These are those questions; the rest is scenery.

1. **Is anyone else selling to agents and actually being paid by
   strangers?** If yes, the store's zero-organic-settle number is a
   product problem. If no, it is a market timing fact and the 60-day
   line stands as written. *Nobody has answered this. It is the single
   highest-value question in this file.*
2. **Does anyone publish a house-wallet declaration or equivalent?**
   If not, `/house-ledger.json` is a differentiator rather than table
   stakes, and worth saying out loud once.
3. **What does the field charge for verification-shaped goods?** We
   priced from the desk. One paid data point exists ($0.002 at
   402sentinel, which is well under our cheapest item).
4. **Who else is a human-in-the-loop store rather than an API?** That
   is the actual claim — the labour of a named person — and we have
   never checked whether it is unusual.

## OPEN, WITH A NAME AGAINST EACH

- **CV** — does our skill surface for the searches an agent would
  actually run on ClawHub, and at what rank? 239 downloads to 4
  arrivals has always been read as "catalogued faster than used," and
  nobody has checked the simpler explanation.
- **CV** — who else is in the ClawHub registry doing x402 or
  verification work? Registry browsing is impossible from the build
  environment.
- **Keeper** — the parallel-companies section. Conversation, not task.
- **Keeper** — ruling on `/stack`.
