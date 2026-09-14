# THE FIRST PROTOCOL SCREEN — read of 2026-09-14

Machine output: `screen.md` (612 rows in a 90-day first window — 90 ACT,
198 READ, 324 LOG) and `merges.json`. This file is the human read.

Two sources, and the difference between them is load-bearing:

| Layer | Protocols | Source | What it gives us |
|---|---|---|---|
| 1, 2, 5 | AP2, ACP, UCP, A2A, WebMCP, WebBotAuth | [scout.nekuda.ai](https://scout.nekuda.ai/) | Somebody else's reading, with a human-set `breaking` flag and a written impact line |
| 3, 4 | **x402, MPP, Tempo TIPs** | the repositories' own git history | First-hand commits. No breaking flag exists to read; consequence is derived from whether the commit touched `specs/` |

Prior art this updates: `docs/PROTOCOL_EXPANSION_2026-08.md` (2026-08-30).

---

## 0. The headline: our own rail is the busiest thing on the board

| Protocol | Layer | 90d | 30d | spec commits 90d | last |
|---|---|---|---|---|---|
| **x402** | 3 — ours | **267** | **105** | **41** | 2026-09-11 |
| UCP | 2 | 108 | 38 | — | 2026-09-10 |
| Tempo TIPs | 4 | 58 | 21 | 58 | 2026-09-10 |
| A2A | 3 | 54 | 19 | — | 2026-09-10 |
| **MPP** | 3 — second wire | **47** | **20** | **27** | 2026-09-10 |
| WebBotAuth | 5 | 45 | 14 | — | 2026-09-10 |
| WebMCP | 4 | 32 | 20 | — | 2026-09-14 |
| ACP | 2 | 1 | 0 | — | 2026-07-18 (58d) |
| AP2 | 1 | 0 observed | 0 | — | none observed |

The adjacency screen was measuring the neighbours while the loudest
construction was on our own street: **x402 merged almost as much in the
last 30 days (105) as UCP did in 90 (108)**, and 41 of its 90-day
commits touched the specification we implement, sell readings of, and
verify other people's doors against.

**Two source corrections before anything below is quoted.**

1. **`coinbase/x402` is not the x402 repository any more.** Its tip is
   2026-04-21, `chore: bump main to match foundation repo (#93)` — a
   mirror that stopped tracking when the protocol moved to the x402
   Foundation. Our own `docs/PROTOCOL_EXPANSION_2026-08.md` and
   `docs/SPEC_READS.md` still cite spec files by their `coinbase/`
   path. A screen pointed there would have reported that our rail went
   quiet in April, which is the most expensive wrong answer available.
   The live repository is `x402-foundation/x402`.
2. **Git declares no breaking changes.** Over 90 days x402 carried zero
   `feat!:` subjects and zero `BREAKING CHANGE` trailers. Every level
   and consequence on a layer-3 row is **derived by our script**, and
   the screen marks them so. `breaking: false` here means *not
   declared*, never *not breaking*.

---

## 1. A shipped instrument is now wrong, and the screen found it

`src/services/preflight.ts:1019`:

```
const scheme = String(entry["scheme"] ?? "");
if (scheme && scheme !== "exact") {
  advisories.push({ name: "nonstandard-scheme", detail: `accepts offers scheme "${scheme}" rather than the spec's "exact"...` });
}
```

The reasoning above it, dated 2026-08-03, is sound for what it saw:
the ecosystem was forking at the scheme identifier, Kite answered
`gokite-aa`, and the only verified volume settled under `exact`.

**`specs/schemes/` in the live x402 tree today holds four first-class
scheme families:** `exact`, `upto`, `auth-capture`, `batch-settlement`.
They are not vendor drift. They are the specification, worked on
continuously through the window — `auth-capture` reached v1.1 (#3197,
#3283, #3354), `batch-settlement` gained an SVM specification (#2698)
and response validation (#3251), `upto` gained SVM payment flows
(#3094) and a delegated receiver authorizer (#3346), and #3145 expanded
`scheme_exact.md` itself with `upfront` payment flows.

**So a door correctly advertising `upto` or `auth-capture` gets told by
our free instrument that a generic client will not recognise it — "fine
for clients built to this vendor's stack, a silent dead end for
everyone else."** That sentence is now false about three-quarters of
the specification's scheme families, and it is the headline free
instrument saying it.

This is precisely the failure the MPP battery was built to prevent, and
the keeper already ruled on the principle (2026-09-04, V3 decision 3):
*a door speaking another wire read as a broken x402 door was a verdict
on our reader wearing a finding about their door.* Same mistake, one
layer down — not another protocol, another **scheme within our own**.

**The distinction this run forces into the open:** the standing intake
rule in `PAYMENT_RAILS.md` governs the **till** — what we will accept
payment in, and it grows only on a named counterparty. It must not
govern the **battery** — what we can correctly read. A reader that does
not know a scheme does not decline it, it *misjudges* it, and publishes
the misjudgement over our signature. Scheme coverage in the battery is
not a rail decision and should never have been gated like one.

**Proposed (P1):** teach the advisory the specification's own scheme
list, sourced to `specs/schemes/`, keep `nonstandard-scheme` for what
really is outside it (`gokite-aa` still qualifies), and record the
denominator — how many doors we have scored against the narrow test —
because prior verdicts carrying this advisory wrongly are ours to count,
not to quietly correct.

---

## 2. Eleven vocabulary citations point at an expired draft

`src/store/defect-vocabulary.ts` sources **11 MPP classes** to
`draft-httpauth-payment-00`.

On 2026-09-09, MPP #351 — *"fix: renew IETF draft from Datatracker
expiry"* — renamed that file:

```
R099  specs/core/draft-httpauth-payment-00.md → specs/core/draft-httpauth-payment-01.md
```

A 99%-similarity rename, so the substance is intact; the draft had
**expired at the IETF Datatracker** and was renewed. But the path our
classes cite no longer exists, and the version they name is superseded.
`docs/MPP_READ_ONLY_2026-09.md` and `PAYMENT_RAILS.md` carry the same
`-00` citations.

Worse for the battery than the rename: **four MUST-level requirements
entered the core draft inside the window**, each of which is a check
that can fail, which is exactly what our vocabulary is made of.

| PR | Date | The requirement |
|---|---|---|
| [#285](https://github.com/tempoxyz/mpp-specs/pull/285) | 2026-06-19 | Challenge ids must be non-empty |
| [#321](https://github.com/tempoxyz/mpp-specs/pull/321) | 2026-08-18 | MUST NOT grant partial access on verification failure |
| [#323](https://github.com/tempoxyz/mpp-specs/pull/323) | 2026-08-18 | Challenge binding verification required |
| [#334](https://github.com/tempoxyz/mpp-specs/pull/334) | 2026-08-24 | Use `payment-expired` for expired challenges |

Plus [#328](https://github.com/tempoxyz/mpp-specs/pull/328), an
alternate payment credential header in the core draft — a change to
what `src/lib/mpp-challenge.ts` has to parse.

**Proposed (P2):** re-cite the eleven classes to `-01`, read the rename
diff for substantive change, and size the four MUST-level checks as new
sourced classes. The MPP battery's own rule — one class per check that
can fail, sourced to the draft — makes this mechanical rather than a
judgement call.

---

## 3. Two more on our rail worth a human's eye

**`docs(specs): correct v2 §8 discovery fields to match the wire
format`** ([#3067](https://github.com/x402-foundation/x402/pull/3067),
2026-08-31, `specs/x402-specification-v2.md`). The specification's
discovery section did not match the wire, and the wire won. Our
preflight reads discovery fields and our `.well-known/x402.json` serves
them. Whether we were built against the wrong §8 or the right wire is a
half-hour read with a definite answer.

**`feat: add settlement pending state`**
([#3083](https://github.com/x402-foundation/x402/pull/3083),
2026-08-17) — touching `scheme_exact_evm.md`, `scheme_upto_evm.md` and
`scheme_batch_settlement_evm.md` together. A settlement state that did
not exist when our flow audit ran (`PAYMENT_RAILS.md` Part A, 08-03).
The question: does a `pending` settle read as success, as failure, or
as something rows A.1.3 and A.1.4 never contemplated?

Also noted, not sized: `specs/extensions/` now carries
`http-message-signatures.md` — x402's own RFC 9421 extension, the same
machinery the WebBotAuth findings below are about — plus
`extension-offer-and-receipt.md`, which is the conformance desk's exact
subject. `builder_code`, `payment_identifier` and `auth-capture` appear
nowhere in our tree.

---

## 4. The neighbours (unchanged from the adjacency read)

**AP2 — the August file's "highest-value lane" — has gone quiet in the
place we were going to read it.** Zero merges observed; its repository's
last commit on `main` reads 2026-04-29. Meanwhile UCP #741 (breaking,
2026-08-25) moved AP2's mandates into `dev.ucp.common.payment.*`, where
they are versioned continuously. The lane is not dead; its **subject
moved**. Against the layer-3 numbers above the contrast is stark: 0
commits on the authorization layer, 267 on the payment wire.
*Caveat held:* that rests on a page read, not a clone, and a FIDO
deliverable can move to a member-only track and look exactly like a dead
repo from outside. **Clone it and read `git log` before a line of D5 code.**

**WebBotAuth is writing defect classes for free.** Four breaking merges
in 90 days, each a fail-closed rule of the `advertised-version-unpayable`
shape: covered-components replay ([#114](https://github.com/cloudflare/web-bot-auth/pull/114), 07-21),
expired signatures ([#125](https://github.com/cloudflare/web-bot-auth/pull/125), 08-13),
future `created` timestamps ([#127](https://github.com/cloudflare/web-bot-auth/pull/127), 08-18),
and `content-digest` now required ([#130](https://github.com/cloudflare/web-bot-auth/pull/130), 08-26,
**which ships JSON test vectors and a generator**).

**UCP 108 merges to ACP's 1**, 17 breaking to none, plus a Payments
Technical Council of eight seated 09-08. When lane-B commerce is
written, UCP first; ACP becomes a dormant-watch. *Merges are not
adoption* — ACP's product ships from infrastructure with no reason to
appear in a spec repo's log.

**WebMCP broke three times and we were already current** — object
schemas, two-headed `modelContext` detection, and `consequentialHint`
adopted 09-08, five days after #217 merged. #281 belongs to the user
agent's observation map, not to a page exposing tools. Nothing to do.

---

## 5. What this does to the queue

Nothing jumps ROADMAP NOW on its own. Ranked as the screen would rank
them; each is a yes / no / later.

| # | Proposal | Size | § |
|---|---|---|---|
| **P1** | **Teach the preflight advisory the spec's own scheme list** (`exact`, `upto`, `auth-capture`, `batch-settlement`), keep `nonstandard-scheme` for what is genuinely outside it, and count the doors scored under the narrow test. A shipped free instrument is issuing a wrong advisory today. | Small, and the denominator work is the honest half | §1 |
| **P2** | **Re-cite the eleven MPP classes to `draft-httpauth-payment-01`**, read the rename diff, and size the four new MUST-level checks as sourced classes | Small–medium | §2 |
| **P3** | **Four candidate defect classes from WebBotAuth**, with #130's borrowed test vectors run through the conformance desk | Small | §4 |
| **P4** | **Read x402 #3067 (§8 discovery) and #3083 (settlement pending)** against our preflight and our flow audit | An hour each | §3 |
| **P5** | **Re-check AP2 directly** before any D5 work; if confirmed quiet, re-point the instrument at `dev.ucp.common.payment.*` | An hour | §4 |
| **P6** | **Correct our own citations**: `coinbase/x402` → `x402-foundation/x402` across docs | Minutes | §0 |
| **P7** | When lane-B commerce is written, **UCP first, ACP dormant-watch** | A sentence | §4 |

---

## 6. What this screen did not see

- **scout** is somebody else's reading. Absent from scout is
  unobserved, not absent. It reports merges, not adoption.
- **git** declares no breaking flag; every layer-3 level and
  consequence here is derived by our script, not stated by the
  maintainer. A commit is not a release — this screen reads neither
  tags nor releases.
- **Tempo is scoped to `tips/` on purpose.** Its node carried 548
  commits in the window, of consensus, precompiles and reth bumps that
  we neither run nor read. Admitting them would have made the screen
  look thorough and been unreadable. 58 TIP commits are in frame; the
  rest are declared out.
- **The window is the clone.** Layer 3 was read from 2026-06-16 forward.
  First-appearance dates for scheme families cannot be read off this
  clone — the boundary is not an origin.
- **Facilitators, Circle Gateway and the CDP Bazaar index** have no
  source here at all. Bazaar is now a spec'd x402 extension
  (`specs/extensions/bazaar.md`); our registration state in it is still
  only observable by asking CDP, which `scripts/bazaar-check.mjs` does
  separately.
