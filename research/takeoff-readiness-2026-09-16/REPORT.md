# Buyer-first takeoff baseline — September 16, 2026

TR1 implements a repeatable cold-buyer instrument. This baseline does **not**
establish takeoff readiness. The useful early distinction is between an
agent inspecting the merchant itself and choosing an independent observer.

## Scope and provenance

Implementation branch: `codex/takeoff-cold-buyers`, based on `6d29feb5`.
The shared checkout's unrelated changes were preserved. No commit, push,
deploy, purchase, directory submission or external message was made.

The [frozen plan](plan.json) assigns one attempt to each of six cells: two
native hosts × unbranded public search, public MCP catalogue, and a directed
candidate public SCVD skill listing. That candidate URL was not confirmed
as an externally published skill before the plan was frozen. Every cell evaluates the same public merchant
endpoint, with a four-minute wall limit, twenty exposed tool events,
4,000,000 retained output bytes and an advisory 2,500 output-token target.
All cells explicitly request verification where signed evidence is
available; none measures spontaneous verification. These single attempts
are a first baseline, not the two-repetition qualification gate.

The first acquisition failed to start Codex inside the parent sandbox and
reported Claude unavailable in that launch context. It is retained as
cohort A, with all six planned cells incomplete. Cohort B was a fresh retry
from an approved launch context where both native hosts were available.
It preserves exactly the same task assignments; neither run overwrites the
other. Runtime availability is not a product verdict.

Codex CLI: 0.153.4, requested `gpt-5.6-luna`; this event stream does not
supply a resolved model identifier. Claude CLI: 2.1.273, requested `sonnet`;
resolved model identifiers are retained in each run. Public search and
fetch can use host-side processing and are not equivalent to raw HTTP.

## Results

No complete SCVD evidence journey passed. Cohort B contains four bounded
SCVD discovery misses and two directed attempts: one incomplete journey
and one failed decision interpretation. Four native processes completed;
two hit the tool threshold. Those are distinct from product-stage results.
Cohort A retains all six initial infrastructure failures as incomplete.
See [cohort A score](score-a.json), [cohort B score](score-b.json), and
[acquisition hashes and runtime details](provenance.json).

| Cohort B cell | Observed outcome | Full SCVD journey |
| --- | --- | --- |
| Codex public search | Inspected merchant; no SCVD selection | Fail: bounded discovery miss |
| Codex catalogue | Selected merchant; hit tool threshold | Fail: bounded discovery miss |
| Codex directed | Used SCVD preflight; correctly limited its meaning | Incomplete: signed verification unexercised |
| Claude public search | Inspected merchant; no SCVD selection | Fail: bounded discovery miss |
| Claude catalogue | Selected merchant; command denials and tool cap | Fail: bounded discovery miss, host confounding |
| Claude directed | Missing candidate skill; fallback pages and merchant quote | Fail: conclusion exceeded evidence |

## Findings from reviewed runs

1. **Unbranded Codex search did not select SCVD.** It searched for the
   merchant, fetched the merchant's challenge and documentation, and gave
   a bounded unpaid-use assessment. This is a SCVD discovery miss under
   this task and budget, not proof that SCVD is absent from any index.
2. **Codex catalogue use also stayed with the merchant.** It initially
   selected a related x402 service, corrected that choice to the merchant's
   own MCP listing, connected to the merchant MCP, and verified a free
   merchant-signed sample. It exceeded the tool threshold before producing
   its final answer. Merchant-signed data is not an SCVD observation.
3. **Claude search also stayed with the merchant.** It retained actual
   search results, an unsigned merchant quote and a free sample, but made
   no SCVD call. Its final generalization about prepayment signature
   unavailability goes beyond the bounded evidence it collected.
4. **Claude catalogue use hit host restrictions.** It selected the merchant
   listing, then repeatedly encountered local command permission denials
   and reached the tool threshold. Those denials are not origin failures
   or evidence of merchant rate limiting.
5. **Directed Codex use reached SCVD preflight.** It formed and submitted
   the correct free HTTP request, received an unsigned `ready`/L3a readout,
   and accurately explained that challenge shape proves neither delivery
   nor reliability. It did not follow `next_steps.signed_report`, obtain
   an SCVD certificate, reproduce the method offline, or complete an
   independent recipient check. The complete preflight response is retained.

6. **Directed Claude use did not reach SCVD verification.** It followed the
   missing-skill page's alternatives, read general SCVD material, and
   inspected the merchant quote. It disclosed that local decode commands
   were blocked, but still concluded that the buyer could transact and
   that no merchant-specific verification trail existed. Neither follows
   from a limited unpaid inspection. This is an interpretation failure;
   it does not show that an SCVD endpoint is defective.

The directed Codex result narrows the next buyer-flow investigation: public referral
can lead to correct preflight use, but the transition to independently
verifiable evidence was not completed. The first two results also suggest
that a buyer can satisfy the task through direct merchant inspection
without seeking an independent observer. This is a hypothesis from a small
cohort; changing a description without testing that hypothesis would be
premature.

A separate [reviewer follow-up](listing-followup.json), never supplied to
the agents, checked the candidate skills.sh entry. It redirected to `www`
and returned HTTP 200 with a rendered “404 / isn’t available in this
repository” page, suggesting `scvd-general-store`. The local verification
skill exists in source; this candidate public listing is not currently
usable as that skill's content. It is not evidence that a previously
published listing was removed, or that all distribution lanes fail.

## Instrument and validation

The schema-2 runner freezes assignments before execution, starts neutral
native sessions, records host/context controls and raw events, stops bounded
runs, and retains unavailable/capped attempts. The scorer separates six
stages, recomputes original-artifact signatures with the existing verifier,
checks subject/freshness/issuer binding, and requires an evidence-bound
independent review. The existing buyer-wave scorer now rescans schema-2
cold evidence instead of trusting a cached score. Older cohorts keep their
original schema and scope. See [the run guide](../BUYER_COLD.md).

Validation: 79 buyer tests passed; typecheck and bundle check passed.
The broad application test suite was not run; no commit or merge is being
made. Full merge gates still apply before integration.
[Negative controls](negative-controls.json) retain six deliberate guard
removals, each caught by its regression. Additional fixes were observed
red before green: bounded discovery misses, wrong issuer origin, malformed
transcripts/event shapes, preserved source snapshots, partial progress after a cap, and refusing cached cold passes.

Collector source hashes were frozen at acquisition. Exact source snapshots
matching every pre-run hash are retained alongside the raw evidence. Subsequent scorer
hardening preserves those raw runs and reports the current scorer hash
separately; no prompt or cell assignment was changed after observing an
outcome. Scores are reviewed interpretations of retained evidence, not
self-awarded model outcomes.

## Limits that remain visible

- Zero USDC was authorized or spent. Paid evidence, settlement/recovery,
  delivery and wallet behavior were not exercised.
- Directed success here means an HTTP API call. Native SCVD MCP installation
  and A2A interoperability are separate, untested paths.
- Codex JSONL records native search actions but omits their result bodies.
  Search candidates and tool rejection explanations in agent messages are
  attributed as agent reports. Retained direct HTTP tool responses provide
  stronger evidence of what actually answered.
- The CLI controls and exposed trace support bounded context isolation;
  they cannot establish the absence of pretrained knowledge or all hidden
  host context. Host metadata can contain account information, so full raw
  acquisitions stay in the ignored `private/` evidence directory beside
  this report. Public scores reference those local retained files; cloning
  the tracked report alone does not reproduce the private acquisition.
- The tool guard stops after an over-budget event is observed. It cannot
  retract already dispatched/batched requests. Token targets are advisory.
- The current signature scorer supports a standalone envelope with signed
  subject/time/expiry fields. Other schemas and hash-bound reports need
  their own contract-aware adapter and remain incomplete, not invalid.
- No catalogue-completeness or organic-adoption claim follows from this
  cohort. No new Bazaar checker was introduced.

Canonical A2A v1 plus bounded explicit 0.3 compatibility is the keeper's
approved TR2 posture. This build changes the acceptance instrument; it does
not migrate the production A2A implementation. TR3 follows the measured
buyer-flow gaps. Feature order remains in `ROADMAP.md`.
