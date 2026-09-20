# Free signed-history buyer cohort — September 19, 2026

**1 complete journey / 4: 2 interpretation failures and 1 incomplete attempt.**
All four buyers retained the full signed original and a separately fetched key.
All three eligible offline recipients completed verification and correctly
separated the one signed observation from unsigned history and current readings.
Buyer reliability remains open: the target is two complete journeys per host/lane.

This is a new, directed, prompted, zero-spend cohort after
[PR #848](https://github.com/seancrecord/scvd-general-store-repo/pull/848).
It does not establish unbranded discovery, paid fulfillment, organic demand or a
causal effect of one repair. Earlier cohorts keep their scores and denominators.

## Frozen scope

[Plan](plan.json) and [freeze](freeze.json) were recorded before qualification.
Source: `89268979dcce9019855b77d34ffc40255c11956a`. Plan SHA-256:
`46cbfa32c0681c633cc74a82e3fdcb7706b6ebf17df7901c3c870791ca011460`. The live focused skill, raw GitHub entry and
merged source matched byte for byte at the freeze. Buyers also retained that same
skill. The canonical preflight responses captured by all four carry the new free
signed-history route. Neither product code nor the instrument changed during this
experiment.

The results branch integrates main through `acdfb855953dfc260bde3145c88c308c823222df`.
PRs #847, #849 and #844 merged after the native window. In particular,
[PR #849](https://github.com/seancrecord/scvd-general-store-repo/pull/849)
adds the read-only verifier projection and OpenAPI follow-through for free history.
This cohort captured direct HTTP preflight and the frozen skill; it does not
qualify those later changes. The experimental revision and captured bytes remain
unchanged; integration checks are recorded separately.

Subject: `https://lionx402.com/api/x402/wallet-screen-json`.
The public skill URL was supplied explicitly. Buyer models remain Codex
`gpt-5.6-luna` and Claude `sonnet` (both Claude traces resolve to
`claude-sonnet-5`). Codex traces do not independently report a resolved model ID.
Offline recipients use `gpt-5.6-luna` and the frozen
`x402-verify@1.7.0` modules. The host versions and qualification records
are retained privately; public [qualification](qualification.json) binds the
plan, instrument and host-context hashes.

Buyer limits remain 240 seconds, 20 observed tool calls,
32 MiB and 32 retained files.
Recipient limits remain 180 seconds and
12 calls, with all retained files and the verbatim buyer report
supplied unclassified. One attempt per eligible cell; no retry or cap extension.
This controller ran native sessions serially with the host kept awake and started
its own heavy tests only after the last recipient finished. A later process check
found a separate task's test process had started at 16:11:59 UTC, overlapping the
second buyer pair and recipient window. The initial pre-launch check had found
none. Exact contention was not measured; no timing interruption was recorded.
The intended no-competing-load condition was therefore not established throughout.
[Load limitation](load-limit.json) records the deviation without replacing results. Output-token targets
are advisory; observed tool events are not origin-request counts.

The fourteen-day observation-age rule is unchanged. The September 7 observation
leaves the window on September 21 at 02:30:20.531 UTC. Snapshot publication on
September 18 does not reset it. No payment, registration, external message or
replacement evidence was used.

## Results

| Cell | Buyer runtime | Retention | Offline recipient | Journey |
| --- | --- | --- | --- | --- |
| codex-directed-r1 | completed, 12 calls | 16 files; complete capture | Completed, 9 calls | fail |
| claude-directed-r1 | completed, 16 calls | 10 files; complete capture | Completed, 8 calls | fail |
| codex-directed-r2 | completed, 10 calls | 32 files; complete capture | Completed, 8 calls | pass |
| claude-directed-r2 | failed, 21 calls | 10 files; complete capture | Ineligible; not launched | incomplete |

[Runtime summaries](runs.json), [hash-bound reviews](reviews.json), and
[scorer output](score.json) keep the component outcomes separate.

### Codex r1: correct final summary, incorrect companion note

The buyer independently verified the snapshot, found the exact September 7 row,
and completed its final report with one signed observation and appropriate
payment/delivery limits. Its retained `08-verification.md`, however, says:
“The snapshot itself notes the host history has two unprobed gaps and is
indeterminate.” Those claims are in unsigned host history; the signed snapshot
does not contain that tier or host-history account.

This is an interpretation failure in the supplied handoff, not a signature
failure or a claim that the final response itself invented three signed rows.
The offline recipient correctly separated the signed row from unsigned history.
That recipient success does not remove the incorrect companion claim. The
review cites the original note so this judgment can be examined.

### Claude r1: one verified row becomes three in the conclusion

The buyer fetched the original and key, recomputed the digest, and recovered from
wrong candidate signed messages to a successful signature over the snapshot.
It inspected the exact target row. Its final conclusion nevertheless claimed
“three independent signed historical observations.” Only one supplied snapshot
was authenticated. The recipient explicitly identified W35 and W36 as unsigned
history rows whose cited snapshots were absent from this inventory.

This is the same kind of signed-scope overclaim seen in an earlier cohort,
now occurring after successful retention. It remains a buyer interpretation
failure even though its recipient understood the boundary.

### Codex r2: complete journey

The buyer retained the original, key, DID document and verification output. It
installed the publicly documented `x402-verify@1.6.0` example in its scratch
workspace and used `verify-source --subject`. The output selected one signed
observation and separated September 7 observation from September 18 publication.
The final report kept unsigned history, current structural checks, issuer-key
consistency and untested payment/delivery distinct.

An intermediate command compared an address digest with a snapshot digest;
the buyer corrected that distinction before its final report. The complete
capture reached the allowed file count without dropping files. Its recipient
used the supplied frozen modules, independently verified the original, reported
no declared expiry, and correctly explained issuer-identity and evidence limits.
This earns the cohort's one complete journey. The buyer-selected registry version
is recorded as observed; no new publication or fresh package-provenance audit
is claimed here.

### Claude r2: retained originals, stopped during verification

The buyer spent calls on repeated file inspection and a refused initial compound
command. It retained the signed snapshot and separate key, then tried the wrong
candidate signature messages. The first over-budget tool event stopped it before
a successful native verification result or final report. No recipient was
launched for this ineligible buyer. Independent controller verification of its
retained original succeeds, but cannot replace its unfinished work.

## What the evidence supports

[Controller verification](controller-verification.json) checks each retained
original against its separately captured public key and finds one exact subject
row. It adds no replacement bytes and is not native acceptance. Each recipient
used the supplied library example; this cohort does not establish native use of
the pinned recipient CLI. Native CLI use was observed in the second Codex buyer.

Free-evidence retention succeeded in every planned buyer attempt. The result is
consistent with the routing clarification helping, but this small uncontrolled
cohort cannot attribute the improvement to that change. Signed-scope explanation
and navigation efficiency remain the measured friction. A later repair should
use the existing exact-subject verifier output and clearly separate a verified
row from unsigned history; do not widen caps, sign unsigned context by association,
or rerun these cells until they pass.

A source read confirms that the focused guide currently shows generic
`verify-source original.json --public-key ...` without `--subject`. The complete
buyer found the existing exact-subject option in the published verifier material.
The next bounded repair hypothesis is to put that existing command at the point
where a buyer has retained the original, with its exact signed row and separate
unsigned context visible together. Also inspect the host-history context labels.
This is a hypothesis from the traces, not a controlled causal finding.
Any change needs its own failing regression, normal release gate, new freeze and
fresh qualification. No further native cohort follows automatically. Merchant
proof and platform consumption remain behind the buyer milestone
[#803](https://github.com/seancrecord/scvd-general-store-repo/issues/803).

## Retention and validation

Raw captures, traces, exact prompts, host context, launch metadata and complete
recipient inventories remain in the ignored sibling directory
`../free-history-buyer-20260919.local/` and its private backup. Public references
and hashes require that retained bundle to resolve; raw native host context is
not republished. The original pre-review acquisition score is retained separately.

The controller's 236 offline checks passed before qualification. The experiment
changes no product or instrument code. [Validation](validation.json) records
report checks and the required full-suite outcomes separately from native results.
