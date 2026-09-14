# THE FIRST PROTOCOL SCREEN — read of 2026-09-14

The machine output is `screen.md` (240 merges in a 90-day first window:
22 ACT, 64 READ, 154 LOG) and `merges.json`. This file is the human
read: what the screen is actually good for, what it found, and what it
changes. Source: [scout.nekuda.ai](https://scout.nekuda.ai/), somebody
else's reading of six repositories, re-checkable at every PR link.

Prior art this updates: `docs/PROTOCOL_EXPANSION_2026-08.md`, the
2026-08-30 read of the whole agentic-payment surface. Nothing below
overturns its door-sizing. Two of its verdicts now have cadence
evidence behind them that they did not have two weeks ago, and one of
its lanes has a problem.

---

## 0. What this instrument is, and what it is not

**It is not a payment-methods screen.** The keeper's ask was "look at
all the payment methods here." Scout watches six standards — AP2, ACP,
UCP, A2A, WebMCP, WebBotAuth — and **none of them is x402, and none is
MPP**. Our own rail and the second wire are both invisible to it. Read
against the five layers in `PROTOCOL_EXPANSION_2026-08.md §1`, scout
covers layers 1, 2 and 5 and skips layer 3, which is the layer we are
on. A quiet week on scout is not a quiet week on our wire and must
never be written down as one.

**It is an adjacency screen**, and a good one. It answers: what did the
standards *next to us* do to the surfaces we have shipped, and to the
lanes we have only sized? That question was previously answered by a
person reading release notes when they remembered to. Now it is a
script with a denominator.

Worth running weekly: **yes**, at about five minutes of reading. The
first run paid for the build twice over (§2 and §3 below). The honest
extension is in §6.

---

## 1. Cadence — the commerce layer has a winner, and it is not the one we sized against

| Protocol | Layer | 90d merges | 30d | breaking 90d | last merge |
|---|---|---|---|---|---|
| UCP (Google) | 2 commerce | 108 | 38 | 17 | 2026-09-10 |
| A2A (Linux Foundation) | 3 transport | 54 | 19 | 0 | 2026-09-10 |
| WebBotAuth (Cloudflare + IETF) | 5 identity | 45 | 14 | 6 | 2026-09-10 |
| WebMCP (Google + Microsoft) | 4 browser | 32 | 20 | 3 | 2026-09-14 |
| **ACP (OpenAI + Stripe)** | 2 commerce | **1** | **0** | 0 | **2026-07-18 (58d)** |
| **AP2 (Google + FIDO)** | 1 authorization | **0 observed** | 0 | 0 | **none observed** |

`PROTOCOL_EXPANSION_2026-08.md` D6 treats ACP and UCP as one row —
"NO as a merchant, YES as a subject the observatory reads." That row
now needs an order inside it. On merge cadence, **UCP is where the
commerce layer is being built and ACP is where it is being left
alone**: 108 merges to 1, 17 breaking changes to none, over the same
90 days. UCP also stood up a **Payments Technical Council with eight
inaugural members** on 2026-09-08 (#809) — the payments half of the
commerce layer acquiring formal governance, under Google, while
OpenAI/Stripe's spec repo sits still.

**What this does and does not license.** It licenses ordering: when the
lane-B commerce battery is written (ROADMAP L3), write it against UCP
first. It does **not** license "ACP is dead." A specification can be
quiet because it is finished, and ACP's product surface — Instant
Checkout in ChatGPT — ships from Stripe and OpenAI infrastructure that
has no reason to appear in a spec repo's merge log. **The screen sees
merges, not adoption.** Anyone quoting the 108-to-1 has to carry that
sentence with it.

---

## 2. The finding that costs us something: AP2, our highest-value lane, has gone quiet in the place we were going to read

`PROTOCOL_EXPANSION_2026-08.md` D5 is unambiguous: AP2 mandates are
**"BUILD — as an INSTRUMENT, not a rail. Highest-value lane in this
file."** Zero regulatory delta, no funds held, low-medium door cost,
and it answers the question `the_mandate` already answers in our own
home-grown way.

Two facts arrived this week:

1. **Scout carries AP2 as a tracked protocol and shows zero merges for
   it** — not "few," zero, against 823 across the other five. A direct
   look at `github.com/google-agentic-commerce/AP2` shows its most
   recent commit on `main` dated **2026-04-29** ("fix: remove uvlock",
   #246), roughly four and a half months ago.
2. **UCP #741 (2026-08-25, breaking) moved AP2's mandates inside UCP.**
   Payment constructs — "payment authentication, **AP2 mandates**,
   split payments, and all related JSON schema references" — moved from
   `dev.ucp.shopping.*` to `dev.ucp.common.payment.*`, with
   `dev.ucp.shopping.ap2_mandate` becoming `dev.ucp.common.payment.*`.
   UCP #424 split card credentials into `pan_credential` and
   `network_token_credential`; #746 made token binding
   vertical-agnostic; #712 simplified payment schedule terms. All
   breaking, all inside 30 days.

**The consequence for D5 is concrete and it is not "drop the lane."**
The instrument was always going to parse presented mandate chains. The
question a screen can answer is *whose schema is the live one*, and the
answer moved: **the actively-versioned, breaking-change-carrying home
of AP2 mandate schemas is now the UCP repo, not the AP2 repo.** An
instrument built against the AP2 repo's schemas would be built against
an artifact nobody has touched since April, while the thing real
implementers integrate against changes under a different namespace
every few weeks.

**Caveat, held firmly:** finding (1) rests on a page read, not a git
clone, and FIDO Alliance specification work does not necessarily happen
in a GitHub repo — AP2 was donated to FIDO, and a standards body's
deliverables can move to a member-only track and look exactly like a
dead repo from outside. **Before a line of D5 code: clone the AP2 repo
and check `git log` directly, and check whether FIDO publishes the
mandate spec elsewhere.** The screen has raised a question, not settled
one. It is on KEEPER_LIST, not in this file, as a decision.

---

## 3. The finding that pays for itself: WebBotAuth is writing our defect vocabulary for free

Four breaking merges in Cloudflare's `web-bot-auth` inside 90 days, and
every one of them is the **same shape as `advertised-version-unpayable`**
— a rule tightening such that artifacts that verified yesterday fail
today, silently, on both sides:

| PR | Date | The rule it added |
|---|---|---|
| [#114](https://github.com/cloudflare/web-bot-auth/pull/114) | 2026-07-21 | Signature replay: **enforce covered components** — a signature that does not cover the right components was accepted and is now refused |
| [#125](https://github.com/cloudflare/web-bot-auth/pull/125) | 2026-08-13 | Rust verifier **fails closed on expired signatures** |
| [#127](https://github.com/cloudflare/web-bot-auth/pull/127) | 2026-08-18 | **Reject signatures with future `created` timestamps** — fail-closed before cryptographic verification, new `SignatureCreatedInFuture` error and `is_created_in_future` advisory |
| [#130](https://github.com/cloudflare/web-bot-auth/pull/130) | 2026-08-26 | **`content-digest` now required** in signed directory responses: "existing signatures that omit it will fail verification against the updated spec" — **and it ships a JSON test-vector file plus a generator script** |

We sell a conformance desk that checks any issuer's signed offers and
receipts, and a named defect vocabulary (v15). Four fail-closed rules
for signed-artifact verification, each written up with its failure
mode, each sourced to a public spec merge, and one of them arriving
with **test vectors we can run**, is the cheapest inventory on this
page. The vocabulary's own rule holds — one class per check that can
fail, sourced — and these come pre-sourced.

`#127` is the most interesting: **a future `created` timestamp,
rejected before crypto**. Our own batteries check expiry. A clock
skewed the *other* way is the mirror case and the write-up is already
done for us.

This is a `defect-vocabulary` proposal, not a build. It goes to the
keeper as "four candidate classes, sourced, with one set of borrowed
test vectors" — his yes / no / later.

---

## 4. The finding that is a clean bill of health, and why that is worth the five minutes

The screen put **WebMCP #281 in the ACT band** — breaking, on a surface
we have shipped. Read in full, it is not ours: the "observed tool
collection struct" with its `origin` field is what a **user agent**
maintains in its observation tool map. We are a page that *exposes*
tools, not a browser that *observes* them. **Scoring note for next
week: a WebMCP merge on the UA side can land in ACT wrongly; the band
is a prompt to read, not a verdict.**

Underneath it, three WebMCP breaking changes in 90 days —
#241 (`inputSchema` string → object), #246 (`executeTool()` input
string → object), #281 — plus #217 adding `consequentialHint` to
`ToolAnnotations` on 2026-09-03, "for tools that perform significant,
real-world, or non-reversible actions (e.g. booking flights,
**transferring money**)".

`src/routes/webmcp.ts` is already on the current shape of all four:
object `inputSchema`, two-headed `document.modelContext` /
`navigator.modelContext` detection, `consequentialHint: false` on the
free quote and **`consequentialHint: true` on buyer-signed completion**,
adopted 2026-09-08 — five days after the spec merged it.

Nothing to do. That is the point: the screen's job on a good week is to
cost five minutes and find nothing, and a screen that can only ever
justify itself by finding work will manufacture work.

---

## 5. What this does to the queue

Nothing jumps ROADMAP NOW. Every row below is a proposal for the
keeper's yes / no / later, in the order the screen would rank them.

| # | Proposal | Size | Rests on |
|---|---|---|---|
| P1 | **Four candidate defect classes from WebBotAuth**, sourced to #114/#125/#127/#130, with #130's test vectors run through the conformance desk as a first check | Small — vocabulary work we already do, with the research done by someone else | §3 |
| P2 | **Re-check AP2 directly** (clone, `git log`, and look for FIDO's published track) before any D5 work; if it is confirmed quiet, re-point D5's subject at `dev.ucp.common.payment.*` in the UCP repo | An hour of reading. Blocks a lane the August file calls the highest-value in it | §2 |
| P3 | **When lane-B commerce is written (L3), UCP first, ACP as dormant-watch** — a one-line ordering inside D6, with the "merges are not adoption" caveat attached | A sentence today, an ordering later | §1 |
| P4 | **Extend the screen to layer 3** — the same library, pointed at the x402 and MPP repos directly, so the instrument finally covers our own rail | Medium; §6 | §6 |

---

## 6. The gap in this instrument, named

The screen cannot see x402, MPP, Circle Gateway, or Tempo. It watches
the neighbours and is blind to the street we live on. That is a
property of scout, not of the screen: `scripts/lib/protocol-screen.mjs`
takes a protocol map and scores it against `SURFACES`, and nothing in
the scoring depends on where the merges came from.

Pointing the same scorer at the GitHub APIs for `x402-foundation/x402`
and the MPP spec repos would make this an actual payment-methods
screen — the thing the keeper asked for — rather than an adjacency
screen that happens to be useful. That is P4, and it is the only item
here that is a build rather than a read.

Until it exists, every artifact derived from this screen carries the
line the runner already prints: **x402 — our own rail. Scout does not
track it; nothing here is evidence about it.**
