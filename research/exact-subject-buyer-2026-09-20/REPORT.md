# Exact-subject buyer cohort — September 20, 2026

**1 complete journey / 4: 1 interpretation failure and 2 incomplete journeys.**
Every buyer retained signed snapshot bytes and a separately fetched key. Both
Codex buyers correctly separated the exact signed observation from unsigned
context, but one offline handoff was interrupted by host sleep. Claude's first
buyer verified the snapshot and then incorrectly said it contained no endpoint
observations. Its recipient found the signed row. The second Claude buyer was
interrupted before completing verification or a final report.

Buyer reliability remains open. These results neither replace earlier cohorts
nor establish the required two complete journeys per host/lane.

## Frozen scope and released surfaces

This separate directed, prompted, zero-spend cohort followed the guide in
[PR #862](https://github.com/seancrecord/scvd-general-store-repo/pull/862) and the
unsigned-history labels in [PR #863](https://github.com/seancrecord/scvd-general-store-repo/pull/863).
The [release readback](../buyer-signed-scope-2026-09-20/release-readback.json)
confirmed live guide bytes, default/stable host JSON, HTML, Markdown, OpenAPI and
the correction. The [final repair checks](../buyer-signed-scope-2026-09-20/hosted-validation.json)
passed all required gates: 798 files, 15,183 tests passed, one skipped, none failed.

The [plan](plan.json) and [freeze](freeze.json) precede qualification. Acquisition
source is `8202a9a3eb30395bd7a45b88a331f810d5cfc44c`; plan SHA-256 is
`f8148b806ad5a28ad2a7e51ed013a8c0106a4c4c42bedcb8187e6086da99c0f0`.
The focused live guide, raw GitHub entry and canonical source matched at freeze.
The two Codex buyers retained the same guide bytes. Both Claude buyers used
WebFetch, whose returned summaries are retained in their traces; those summaries
are not byte-for-byte copies of the guide, even when a full-text response was
requested. No controller evidence was supplied to buyers.

Target: `https://lionx402.com/api/x402/wallet-screen-json`.
Models remain Codex `gpt-5.6-luna` and Claude `sonnet`; the Claude traces report
`claude-sonnet-5`. Codex traces do not independently identify a resolved model.
All three [qualification checks](qualification.json) passed: both online buyer
hosts and the separate offline recipient. Host configuration and full traces
remain private and are bound by hashes.

Budgets remain 240 seconds and 20 observed tool calls per buyer, with 32 MiB and
32 retained files. Recipients have 180 seconds and 12 calls, receive every captured
file plus the verbatim buyer report, and use the frozen `x402-verify@1.7.0` review
modules. One attempt per eligible buyer; no retry or limit extension. Token targets
are advisory, and tool events do not count origin requests.

The fourteen-day age ceiling is unchanged, but available evidence changed:
snapshot 8 contains the September 14 observation at `01:30:09.376Z`, published
September 20 at `11:00:28.668Z`. Its age window ends September 28 at
`01:30:09.376Z`. Publication does not refresh an observation. The earlier September
7 row's September 21 limit remains unchanged. This uncontrolled cohort tests the
combined released surface with newer evidence; it cannot isolate a wording effect.

The results branch integrates main through
`633d490ae96238491767abe31dea0e56910f548a` only after acquisition; the exact integration
revision is also recorded in validation. Its directory-listing changes do not
change the frozen acquisition. No product or harness code is changed by this report.

## Results

| Cell | Buyer runtime | Retention | Offline recipient | Journey |
| --- | --- | --- | --- | --- |
| codex-directed-r1 | completed, 11 calls | 27 files; complete | 4 calls; timing interruption before final | incomplete |
| claude-directed-r1 | completed, 8 calls | 6 files; complete | completed, 6 calls; correct signed scope | fail |
| codex-directed-r2 | completed, 6 calls | 20 files; complete | completed, 8 calls; correct signed scope | pass |
| claude-directed-r2 | 13 calls; timing interruption | 6 files; complete | ineligible; not launched | incomplete |

[Run records](runs.json), [independent reviews](reviews.json) and the
[scorer output](score.json) separate retention, interpretation and completion.
All originals pass [controller verification](controller-verification.json), with
one exact-subject row at `/round/hosts/52`. The fourth buyer retained that snapshot
under `/latest` in the complete `/corpus.json` response. The controller reads that
nested envelope from retained bytes; it adds no replacement response and does not
complete the buyer's unfinished work.

### Codex r1: correct buyer, interrupted handoff

The buyer used `verify-source --subject`, retained the complete original and key,
and reported one signed September 14 observation with zero omitted rows. Its
final answer and `run-log.md` distinguish unsigned history/current readings,
published-key consistency, and untested settlement/delivery. The note's request
ordering is imperfect, but it does not misattribute unsigned history to the
snapshot. Registry installation was unpinned; its resolved version was not
retained as evidence.

The offline recipient independently verified the signature and selected the
correct row/date. A 539.796-second callback gap then stopped it before a final
interpretation. This is incomplete recipient acceptance, not an invalid signature
or an observed product failure. Its single attempt remains consumed.

### Claude r1: false absence inside a verified snapshot

The buyer read a WebFetch summary of the guide, retained the signed original and
key, and verified Ed25519 over `JSON.stringify(snapshot)` using Node crypto. It
tried several candidate messages rather than using the documented verifier. Its
own inspection listed `round` among the snapshot keys, but it never inspected the
exact endpoint row inside that object.

Its final answer says the snapshot contains only round metadata and no per-host
verdict. That is false: the retained signed `snapshot.round.hosts` contains the
exact endpoint, September 14 observation date, verdict and advisories. The final
answer correctly labels the host-history summary unsigned, but misstates what the
original itself contains. This is a buyer interpretation failure. The trace has
eight tool calls, although the final report lists seven.

The separate recipient verified the original and digest, found the exact signed
row, and distinguished the four unsigned historical rows from the one verified
snapshot. Its successful interpretation does not erase the buyer's error.

### Codex r2: complete journey

The buyer installed the documented `x402-verify@1.6.0`, confirmed `--subject`, and
used it to verify the original with one exact match and zero omissions. Its final
answer and saved decision/provenance notes separate signed observation time,
publication time, unsigned current responses and unproven identity/payment claims.
It also compared the current public pay-to digest with the signed historical row
without claiming that made the current response signed. Its provenance table
labels the local help output with the README source URL; the retained trace
identifies it as local CLI output. That bookkeeping error does not change the
original snapshot/key or the signed-scope conclusion.

The recipient independently verified the original through the supplied bundle
API, inspected the signed row, and correctly explained undeclared expiry, age,
unsigned context and issuer-identity limits. The frozen scorer applies the
fourteen-day ceiling; the recipient correctly said its supplied prompt did not
state a numeric threshold. All required stages completed within their limits.

### Claude r2: interrupted before native verification

The buyer recovered from a refused compound command, retained the full corpus
response and separate key, and found the exact September 14 row. It had not
completed signature verification or a final report when a 35.781-second callback
gap triggered the timing guard. No recipient was launched. The retained nested
snapshot verifies independently, but cannot turn this interrupted attempt into
native acceptance.

## Execution conditions

Native sessions ran serially; this controller started its full repository tests
only after the last recipient. The [execution record](execution-conditions.json)
contains 229 process samples and no observed vitest/workerd competition. Those
samples cover only those processes, and contain gaps; they do not prove an idle
machine throughout.

The original `caffeinate -i` wrapper prevents idle sleep, but did not prevent the
Mac's recorded lid-close/deep-idle sleep. Power events overlap the fourth buyer's
35.781-second gap and the first recipient's 539.796-second gap. The harness stopped
both as `timing_interrupted`, preserving their partial evidence. It cannot enforce
a wall deadline while the host itself is suspended; the long recipient elapsed
time is recorded rather than treated as a granted extension.

After diagnosing the sleep events, the two still-unlaunched recipients used
`caffeinate -is` on AC power. Both completed without recorded timing interruptions.
This is an explicitly changed execution condition within the cohort, not a
replacement for the interrupted attempts. No permanent power setting changed.
The report does not claim comparable uninterrupted runtime conditions across all
four journeys.

## What follows

Retention is working in this cohort. Exact-subject CLI use produced correct signed
scope in both Codex buyer handoffs, but one lost full acceptance to host sleep.
Claude's remaining completed failure is different from the earlier multi-week
signature overclaim: it incorrectly declared the nested signed evidence absent.
The WebFetch summary and skipped nested-row inspection are observed route choices,
not a proven causal explanation.

Before another native experiment, establish an awake execution environment for
the entire bounded window. A follow-up product hypothesis is to make the signed
`round.hosts` location and exact-subject result available at the point of reading
without relying on a long guide surviving summarization. Inspect existing compact
surfaces before adding another one. A source read found the existing compact
`verify-source --subject` selector in `verifier/evidence-cli.mjs`, the guide
contract, and the host response's `evidence_scope` in `src/routes/corpus.ts`.
That existing scope field is a bounded place to clarify the nested row location;
the evidence does not yet call for a new verifier or endpoint. Any repair still needs a failing regression,
normal release gates and a separate freeze/qualification. These closed attempts
must not be retried or pooled with earlier cohorts to satisfy the milestone.

[#803](https://github.com/seancrecord/scvd-general-store-repo/issues/803) remains
open. Unbranded discovery, paid delivery, merchant proof, platform consumption and
organic demand were not established by this directed zero-spend run.

## Retention and validation

Raw traces, launch settings, captures, complete recipient inventories and source
snapshots remain in the ignored sibling `../exact-subject-buyer-20260920.local/`
and a private keeper backup. [File identities](private-evidence-hashes.json) bind
public references to that retained bundle; raw host context is not republished.
The acquisition score is preserved separately from the reviewed score.
[Validation](validation.json) records report checks and the required full-suite
outcomes separately from native results.

Hosted report validation on September 21 exposed an existing calendar-dependent
receipt-page assertion: the weekly note now contains an apostrophe, and the test
compared its raw text against correctly escaped HTML. The unchanged test failed
locally too. This PR corrects the assertion to match the exact certificate note
in its HTML form; production behavior and native cohort results are unchanged.
The failing run and subsequent checks are recorded in validation.
