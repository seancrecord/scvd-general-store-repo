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
   Foundation. A screen pointed there would have reported that our rail
   went quiet in April, which is the most expensive wrong answer
   available. The live repository is `x402-foundation/x402`.

   ***This is not a new finding, and the first draft of this section was
   wrong twice.*** It named `docs/PROTOCOL_EXPANSION_2026-08.md` as
   carrying a stale citation — that file does not mention the mirror at
   all — and then counted "nine files" that name it. Read rather than
   grepped, almost every one of those is the npm package
   `@coinbase/x402`, which is current and correct and must not be
   touched. More to the point, **`docs/SPEC_READS.md` had already caught
   this**, under its own heading: *"THE x402 SPEC HAD ALREADY MOVED, AND
   TWO ROWS POINTED AT A FORK … The repository is
   `github.com/x402-foundation/x402`; `coinbase/x402` is now a
   development fork."* The house knew. What remains is one spec link
   inside a later dated log entry (2026-09-11) that reached for the old
   URL again — and a dated log entry is history, corrected by appending,
   never by editing. **P6 is withdrawn as a finding**; the recurrence is
   worth a line to the keeper, not a rewrite.
2. **Git declares no breaking changes.** Over 90 days x402 carried zero
   `feat!:` subjects and zero `BREAKING CHANGE` trailers. Every level
   and consequence on a layer-3 row is **derived by our script**, and
   the screen marks them so. `breaking: false` here means *not
   declared*, never *not breaking*.

---

## 1. A shipped instrument was wrong, the screen found it, and it is fixed

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

## 2. Eleven vocabulary citations pointed at an expired draft

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

**Corrected 2026-09-14, on acting: three of these were already ours.**
This section first read four MUST-level requirements as candidate new
classes. They entered the core draft *before* our 2026-09-03 read date,
which is precisely why the vocabulary already covers three of them —
checked by opening the file rather than grepping it:

| PR | Date | The requirement | Covered by |
|---|---|---|---|
| [#285](https://github.com/tempoxyz/mpp-specs/pull/285) | 2026-06-19 | Challenge ids must be non-empty | `mpp-challenge-id` — *"any non-empty opaque string"* |
| [#323](https://github.com/tempoxyz/mpp-specs/pull/323) | 2026-08-18 | Challenge binding verification required | `mpp-request-not-canonical` — *"hashes the request for challenge binding"* |
| [#334](https://github.com/tempoxyz/mpp-specs/pull/334) | 2026-08-24 | Use `payment-expired` for expired challenges | `mpp-challenge-expired-at-issue` — *"refuses the credential as `payment-expired`"* |
| [#321](https://github.com/tempoxyz/mpp-specs/pull/321) | 2026-08-18 | MUST NOT grant partial access on verification failure | **nothing** — and it may not be reachable read-only: observing it means presenting a bad credential and seeing whether partial content comes back, which is an active probe, not a read |

Plus [#328](https://github.com/tempoxyz/mpp-specs/pull/328), an
alternate payment credential header in the core draft — a change to
what `src/lib/mpp-challenge.ts` has to parse.

**DONE 2026-09-14, and not the way this section first proposed it.**
The proposal was "re-cite the eleven classes to `-01`". Carried out
literally that is a *false* citation: each `sourced_by` reads "read at
main **2026-09-03**", a dated read that was accurate — on 3 September
the file genuinely was `-00`. Swapping the number while keeping the
date would claim we read a revision six days before it existed, in a
repository whose whole thesis is checkable provenance.

What was done instead: the rename diff was actually read
(`git show 63c6461 -- specs/core/`), and it touches **four lines** —
`docname` and `version` in the front matter, nothing normative. The
eleven citations now name `-01`, carry today's read date, and record
the renewal and the diff that justifies keeping the substance. Only
#321 remains genuinely uncovered, with its observability question
open.

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
| **P1** | **DONE 2026-09-14.** `SPEC_SCHEMES` sourced to `specs/schemes/` at HEAD; `nonstandard-scheme` now fires only outside that list and names the list in its detail; the new `spec-scheme-not-exact` carries what was true in the old advisory without the accusation. Red witnessed on all four cases before green. Neither advisory folds into a verdict, so no door's `ready` moves and nothing signed changes meaning. Denominator in §6. | done | §1 |
| **P2** | **DONE 2026-09-14**, as a re-read rather than a find-and-replace — see §2. Only #321 stays open. | done | §2 |
| **P3** | **Four candidate defect classes from WebBotAuth**, with #130's borrowed test vectors run through the conformance desk | Small | §4 |
| **P4** | **Read x402 #3067 (§8 discovery) and #3083 (settlement pending)** against our preflight and our flow audit | An hour each | §3 |
| **P5** | **Re-check AP2 directly** before any D5 work; if confirmed quiet, re-point the instrument at `dev.ucp.common.payment.*` | An hour | §4 |
| ~~P6~~ | **WITHDRAWN** — `docs/SPEC_READS.md` had already recorded the move; the rest are the npm package. One dated log entry reached for the old URL again, which is a line to the keeper, not a rewrite. | — | §0 |
| **P7** | When lane-B commerce is written, **UCP first, ACP dormant-watch** | A sentence | §4 |

---

## 6. The denominator for P1, and the part of it we cannot recover

The advisory was wrong from 2026-08-03 to 2026-09-14. Counting who
wore it is the honest half of the fix, and the count comes with a hole
we have to own.

**In the published corpus (`scvd.store/corpus.json`, read today): ten
hosts carry `nonstandard-scheme`.**

    api.onesource.io                     mcp.barker.money
    x402.api.browser-use.com             x402-paid-service.iholt.workers.dev
    api.vaults.fyi                       cashflow.genesisconductor.io
    agent402.tools                       asia-pulse.com
    app.heinrichstech.com                x402.fairseal.io

**How many of those ten were scored wrongly is not recoverable from the
published record.** The corpus retains the advisory *name* and not its
detail, and the scheme string — the thing that decides whether a row
was a real `gokite-aa`-class finding or a spec-legal `upto` — lived
only in the detail sentence. Ten is therefore an upper bound on the
harm and a lower bound on nothing.

Two consequences, neither of them a rewrite:

1. **Nothing signed is being re-signed.** Those rows were scored under
   the battery as it stood, and they stand as history — the same rule
   the v2 fold was held to. The advisory never folded into a verdict,
   so no `ready` moved then and none moves now.
2. **The instrument that was supposed to be a time series could not
   answer its own question.** The 2026-08-03 comment calls the weekly
   ward round "the store's own time series on fragmentation." A series
   that records *that* a door was non-standard but not *what it
   offered* cannot distinguish fragmentation from our own blind spot —
   which is exactly the distinction it existed to measure. Retaining
   the scheme value in a structured field is the follow-up; it is a
   change to what the corpus stores, so it is a proposal, not a fix
   made in passing.

---

## 7. A note on this document's own accuracy

Three claims in the first draft of this read were wrong, and all three
failed the same way: written from a grep, not from opening the file.

- §0 named `PROTOCOL_EXPANSION_2026-08.md` as citing the frozen mirror.
  It does not mention it.
- §0 then counted "nine files" citing the mirror. Almost all are the
  npm package `@coinbase/x402`, which is current.
- §2 offered four MUST-level requirements as candidate new classes.
  Three were already covered, and were covered *because* they predate
  our read date.

None of the three changed what the screen found — §1 stands, and it is
the finding that mattered — but a document that asks a reader to check
its claims has to survive its own author checking them. Recorded here
rather than quietly amended, on the same principle as the rest of the
file: the gaps get counted against the observer.

---

## 8. What this screen did not see

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
