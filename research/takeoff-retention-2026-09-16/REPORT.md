# TR1 retention repair and integration check — September 16, 2026

The collector now retains complete response files independently of shortened
agent output. Historical corpus evidence uses the existing portable verifier
with a freshness policy frozen before acquisition; no expiry is invented.
This repairs the acceptance instrument. It does not establish takeoff readiness.

## Integration

TR1, A2A compatibility and the buyer-handoff repair were rebased onto
`85f2f5e40ef664b928d9c003c0ef34f146ae9e28`. This includes the other task's
AGENT_UX catalogue (#753), verifier/catalogue consistency (#751), and release
archive repair (#755). The shared checkout was left untouched. The combined
candidate is in `codex/takeoff-integration`; the three implementation branches
remain separate. No commit, push or deployment was performed in this step.

The catalogue's existing material is preserved. The September 16 baseline and
follow-through are added with repository-relative links in the integration
candidate, replacing the shared working copy's temporary worktree pointers.

## Instrument changes

- Schema 3 freezes file count/byte limits and maximum observation age. Prompted
  cells get a generic instruction to save original responses in `./evidence`;
  unprompted cells receive no additional verification hint.
- The collector hashes complete regular files after the process exits, refuses
  links and changed/oversized reads, and records incomplete capture explicitly.
  The retention ceiling is not an operating-system disk quota.
- The scorer requires original artifact and issuer hashes from that acquisition,
  uses `verifier/evidence-bundle.js`, reads subject/time from signed claims and
  requires a separately reviewed recipient interpretation. Replacement bytes
  fetched afterward cannot turn an earlier run into a pass.
- Schema 2 remains readable under its original envelope/expiry contract.
  Key-service-window and anchored-timestamp checks remain coverage gaps.

## Public buyer retention cohort

The [frozen plan](plan.json) used two fresh native hosts, the same public skill
source and merchant endpoint, zero spend, 240 seconds and 20 exposed tool events
per cell. These directed, verification-prompted runs used the published old
skill, not the unreleased handoff revision. They cannot establish discovery.

| Cell | Runtime | Retained files | Observation |
| --- | --- | --- | --- |
| Codex / source | Completed, 5 tool events | 15 files, 271,931 bytes | Used SCVD preflight and retained the full response. No signed artifact or issuer key obtained; no complete handoff. |
| Claude / source | Stopped after event 21 exceeded the tool budget | 2 files, 3,193 bytes | Retained the merchant's 402 headers/body. Repeated command refusals consumed the budget; SCVD evidence stage uncompleted. |

Both captures completed without truncating their saved files. That says nothing
about evidence the agents did not save. Claude's command-allowlist friction is
an instrument/environment confound, not proof of a store defect. Neither cell
is a complete buyer success; one attempt per host is not repeatability evidence.
[Run metadata](run-review.json) retains trace hashes and acquisition manifests.
Raw traces and files remain under ignored `private/`; no later control bytes
were inserted into either buyer's acquisition.

## Separate evidence-transfer control

A directed operator control fetched public corpus snapshot 6 (11,485,079 bytes)
and the independently served issuer-key document. A separate recipient process
received a bundle built by the existing verifier and the held public key.
With `fetch` disabled before CLI import, verification returned exit 0, valid
signature and complete attached evidence. Editing the signed sequence produced
exit 1 with `invalid_signature` and `timestamp_digest_mismatch`.

The verified claims include the exact merchant endpoint at
`/round/hosts/50/url`, observed on `2026-09-07T02:30:20.531Z`; snapshot publication
was September 8. This is historical observation, not current payment or delivery
proof. The recipient process checks bytes; it is not a fresh agent's semantic
interpretation. This control does not satisfy the cold journey or its recipient
understanding gate. [Control metadata](transfer-control.json) records hashes,
scope and results. The origin was contacted only during acquisition. A synthetic
operator control also passed these real bytes through the new collector and
scorer: the signature passed, while the result correctly remained incomplete
because no separate recipient understanding was supplied.

## Validation and remaining gate

The new retention controls first failed without the implementation. After the
repair, 91 buyer tests pass, including stale/future/wrong-subject, missing original,
post-run replacement, tampering, partial capture and missing-recipient controls.
The combined candidate passes type checking, all build checks, documentation
checks and 23 portable-verifier/Worker-configuration tests. The full application
suite completed with 14,548 passed, one skipped and one stale guide fingerprint
failure. Reversing only the intended A2A/skill paragraphs reproduced main
exactly; the reviewed new fingerprints then passed all 13 guide tests on each
branch and the combined candidate. The final OASF/guide/skill/handoff run passed
38 tests after the canonical expiry-copy correction and regenerated record.
The full suite was not repeated after these corrections; this is a full run plus
focused corrective validation, not a claim of a subsequent all-green full run.
Exact results and log hashes are in [validation.json](validation.json).

Release remains separate from local integration. After release, observe the
public skill/index bytes and repeat the buyer journey across both hosts, with
complete retained evidence and a separate recipient interpretation. Preserve
unbranded versus directed denominators and include repeated attempts. Paid
completion remains unexercised.

## September 17 merge gate

The standalone buyer-instrument branch was reconciled onto `c3b3befc`. Its full
application suite passed 750 files and 14543 tests, with one existing skip;
typecheck and the 91 buyer checks passed. [Dated validation](merge-validation-2026-09-17.json).
The final stacked PR heads still require CI, and live buyer qualification follows
release. These results do not revise the September 16 acquisition outcomes.
