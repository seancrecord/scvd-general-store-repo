# October 2 follow-through

The keeper approved the five-item ROI sequence. Status below separates a
released capability from adoption, live acceptance and a public report.

| Item | Result | Remaining boundary |
| --- | --- | --- |
| Accounting | #967 merged; authenticated books check no longer reports incomplete metric coverage. | It still reports counters one settlement above derived payer purchases. Do not change counters without transaction evidence. |
| Developer activation | npm `scvd-cli` 0.5.0 already published by run 37023037626. Fresh registry install passed dry-run, Claude/Cursor project configuration, repeat and conflict-preservation checks. Skill 3.19.3 published by run 37023795395 after dry-run 37023555386. | No native-host or buyer qualification. Skill publication receipt is #971; registry scanner disagreement remains visible. |
| Hugging Face | Public signed snapshot fields match the store; regenerated tables match both public configurations, including actual host observation dates. Both previews load. No second refresh needed. | Outer envelope bytes differ in timestamp/citation metadata. Timestamp proofs were not independently checked. |
| Partner pilot | BiX answered the enum question September 28. The October 1 follow-up already asks which integration/release decision the observation supports. | Wait for that answer before custom work or a paid canary. No duplicate message sent. Decision use and repeat demand remain unproven. |
| L13 | Counts-only authorization pairing added to the existing census and its admin/public readers. | Requires normal CI/release; no live measurement or weekly publication claimed by implementation. |

## Readback evidence

[Machine-readable readbacks](../research/roi-followthrough-2026-10-02/README.md)
retain npm, CLI activation, skill and HF results. npm tarball hashes/bytes,
source commit bindings and provenance payloads were checked; this pass did not
independently verify attestation signatures. All eleven source skill files
match registry hashes; the MPP reference's downloaded raw bytes match too.
ClawHub adds a separate `skill-card.md`, outside our source payload. Its overall
status and VirusTotal/LLM scans are clean, while Skillspector reports suspicious
with warnings. Publication success is not unanimous scanner clearance.

The authenticated accounting read also showed all three chain walks passing,
seven old holes backfilled, and no increases in the last raise. A delivery panel
with zero checked does not establish comprehensive delivery. The browser became
busy before transaction-level arithmetic could be inspected; no repair action
was pressed and no private records were copied into these public files.

## L13 contract

For every accepted USDC transfer chunk, query `AuthorizationUsed` on the same
chain, canonical USDC contract, block range and observed senders. A pair needs
matching transaction and block identities, adjacent global log indices, canonical
event shape and the existing receipt reader's payer/transfer interpretation.
The reader does not fetch a receipt or claim finality. It reuses the pair parser
only after establishing adjacency from mined, nonremoved log positions.

Each chain publishes paired-transfer count, exact USDC atomic amount, unpaired
count, unread count and companion-query count. Failures, suspected result caps,
missing metadata, duplicates and inconsistent forks stay unread. A completed
empty query means no pair established. Neither outcome proves `transfer()` use.
An EIP-3009 pair does not establish x402, a sale, a particular customer or agent.
The earlier roadmap wording overstated that inference and is corrected.

The companion budget equals the existing per-chain span budget; it does not
consume the transfer-call allowance. Queries remain in the existing six-span
batches and check the shared deadline before starting. Transport retries/timeouts
remain bounded by the existing RPC layer; the deadline is a scheduling budget,
not cancellation of an in-flight request. Raw wallet, host, transaction and block
identities remain in memory; persisted/public output contains counts only.
Older frozen readings remain unchanged and render pairing as not measured.
Weekly publication retains the existing explicit press and coverage checks.

## S8 advisories

Keep `discovery-info-fails-schema` and `offer-contradicts-challenge` visible as
advisories. The former identifies a discovery/schema mismatch; the latter an
offer without a matching challenge entry. They do not independently change the
readiness verdict. Folding them into v3 changes the battery's semantics and
remains a separate decision on observed cases. No version constants or historical
signed verdicts changed in this work.

## Partner references

- [BiX enum clarification, September 28](https://github.com/Merit-Systems/x402scan/issues/1197#issuecomment-5875854920): internal HOLD_PAPER/PROMOTE_PAPER intentionally become public HOLD/PROMOTE; missing forward profile becomes OBSERVE.
- [Existing bounded follow-up, October 1](https://github.com/Merit-Systems/x402scan/issues/1197#issuecomment-5935862366): fresh unpaid request observation and a request for the decision it supports. No paid-canary commitment.

## Local validation

The initial nine mechanism regressions failed against the original source before
implementation. The expanded census/mechanism/publication group passes 76 tests;
the existing shared authorization and settlement group passes 38. Type checking
and both Worker dry-run bundles pass. The four full CI shards and `check` remain
the merge gate; no focused run substitutes for that gate.
