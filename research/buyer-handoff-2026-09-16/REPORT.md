# TR3 — buyer skill entry and evidence handoff

2026-09-16. Local implementation on `codex/buyer-evidence-handoff`, based on
`origin/main` at `38702413`. Nothing committed, pushed or deployed. This is a
bounded repair of the gaps exposed by TR1, not a takeoff-readiness declaration.
The shared checkout and its concurrent `AGENT_UX.md` work were left alone.

## What changed

- The existing Agent Skills discovery index now includes the focused
  `scvd-x402-verification` skill. Its served bytes, name, description and digest
  derive from the installable file. No second skill catalogue or checker.
- The skill supplies the MCP address and a concrete free HTTP fallback. It
  distinguishes unsigned readiness from payment/delivery proof, coverage gaps
  from evidence absence, free historical evidence from a fresh paid observation,
  and a hosted verification lookup from a local cryptographic check.
- Preflight's existing ladder supplies item inputs and connection links from
  `buyerLinks()`. The existing `signed_copy_of_this_reading` field is preserved
  for callers but explicitly names a **fresh probe**, not a retroactive signature
  on the earlier reading. The unsigned result and spend boundary are explicit.
- The guide shows how to retain the observation core bound by the purchase
  certificate, use the existing portable verifier with a separately established
  key, and distinguish missing evidence from a pass. It retains `audit_id` and
  every observation field; the whole HTTP wrapper is not the certificate binding.
- The secondary Worker needed the same Markdown module support as the main
  Worker. The dry-run bundle caught that dependency, and both now build.

The focused skill's frontmatter description remains unchanged, so its OASF
record does not need a second metadata edit. The separate verifier-semantics
workstream and A2A worktree were not changed.

## Public entry evidence

[The retained entry checks](public-entry-check.json) distinguish origin content
from tool failures. At 19:15 UTC, the focused skills.sh candidate served missing
listing content under HTTP 200 on the `www` URL. Native clients later reported
404 on the non-`www` referral. This establishes a current unusable listing path,
not that a previously working listing was removed. The general-store listing
and the focused GitHub source were available.

Both the published source and the final candidate installed successfully into
fresh temporary projects for Codex and Claude Code using `skills@1.5.26`, with
`--copy`, no global installation, and `DISABLE_TELEMETRY=1`. All installed bytes
matched their respective sources. See [installation evidence](install-check.json).
These test installations were not distribution submissions or organic demand.

## Repeated public buyer runs

The [plan](public-entry-plan.json) was frozen before four fresh native runs:
Codex and Claude, each with the skills.sh referral and the public raw GitHub
source. All runs used the same merchant endpoint, zero spend, 240-second wall
limit, 20 exposed tool events, 4 MB retained output and advisory 2,500 output
tokens. The existing TR1 runner and adapters were reused unchanged.

These were **directed-entry** tests against the currently published instructions.
They neither test unprompted discovery nor expose the unreleased candidate.
All four processes completed without reaching the outer budgets.

| Run | Tool events | Independently reviewed observation |
| --- | ---: | --- |
| Codex / listing | 17 | Recovered through GitHub. Called preflight, which timed out, then before-you-pay, which returned ready/L3a. No signed SCVD artifact verified. |
| Codex / source | 15 | Used HTTP v2 preflight, found historical evidence for the exact endpoint, then obtained a successful local digest/signature check of corpus snapshot 6 after two canonicalization failures. |
| Claude / listing | 10 | Inspected the merchant challenge but never reached an SCVD instrument. Overstated absence of signed evidence. |
| Claude / source | 14 | Read the skill but did not find an HTTP preflight fallback with MCP unavailable. Read corpus HTML without following signed records, then wrongly concluded evidence could not be obtained without paying. |

[Reviewed run metadata and trace hashes](public-run-review.json) link to retained
agent finals, which are untrusted claims rather than acceptance verdicts. Raw
traces, prompts, launch records and runner snapshots remain under ignored
`private/public-entry-runs/`; they are local review material, not public PR data.

The Codex source run is useful progress, **not a complete recipient handoff**.
Its [retained verification event](corpus-verification-trace.json) records matching
SHA-256 and Ed25519 results against a separately fetched issuer key. The full
snapshot printed earlier in its trace was truncated at the native host's output
limit and cannot be parsed; no complete portable artifact and separate recipient
review were retained. We did not fetch replacement bytes afterward and claim
that they were the original run's evidence.

Claude's repeated local decode attempts also encountered the native host's
restricted command allowlist. Those refusals are an environment/instrument
confound, not proof of an SCVD defect. The HTTP fallback gap and unsupported
absence claims are still visible. A future harness revision should separate
these factors before making comparative reliability claims.

No run establishes a full cold-stranger acceptance pass, paid completion,
organic adoption or broad takeoff readiness. One attempt per entry/host is not
repeatability qualification.

## Before/after instruction checks

A separate supplied-document exercise froze the old and candidate skills and a
common hypothetical ready/L3a, `never_met`, zero-budget scenario. Each host ran
once per version; a final wording revision ran once more on each host. These six
runs used fresh processes, no tools, no network action and no payments. They are
interpretation checks, not actual installation, discovery or merchant evidence.
All completed within the 120-second bound, with zero tool calls.

- Both agents given the published skill repeated its false claim that
  `verify_artifact` is offline.
- Both agents given either revised version correctly identified it as a hosted
  lookup and described separate local verification with an independently held key.
- The final versions both retained the exact report metadata exclusions and
  treated missing linked evidence as incomplete. The deterministic integration
  test verifies the binding against an actual fixture audit, rather than trusting
  the agents' paraphrases.
- Codex's final interpretation explicitly proposed the free corpus before a paid
  audit. Claude still merged the hypothetical history lookup with corpus coverage
  and said independent evidence could not be reached on zero budget. That remains
  an unresolved stranger-flow finding, despite explicit guidance in the skill.

The [first comparison](instruction-runs.json) and [final candidate checks](instruction-runs-final.json)
retain frozen prompts' hashes, source hashes, results and runtime metadata.
The revision was informed by the first outcomes; this is exploratory repair,
not a preregistered estimate of model performance.

## Validation

[Validation record](validation.json), with command output under `validation/`:

- Four focused assertions failed on the original implementation before the fixes.
- The real audit-core extraction test also failed with the original skill, then
  passed with the repair. The original text was temporarily substituted and the
  candidate restored automatically; no shared work was stashed or overwritten.
- 62 application tests passed across skill indexing, handoff, preflight, service
  audits and OASF metadata.
- 23 existing portable-verifier and Worker configuration tests passed.
- `npm run typecheck`, `npm run build:check` and `git diff --check` passed.
- Tampering with the observation and recomputing its attachment checksum failed
  verification. A valid certificate with missing report bytes stayed incomplete.
- The full application suite has not run; it remains required before any commit.

## Independent surface states

| Surface | Implemented | Externally observed | Usable by a stranger | Unknown / unverified |
| --- | --- | --- | --- | --- |
| Focused GitHub skill source | Existing public file; revision local | Published source fetched and installed | Installation works; directed use mixed | Final revision in production |
| Focused skill in canonical index | Local implementation and byte/digest tests pass | Final route not deployed | Local HTTP route works | Public index and fresh-agent use |
| Explicit preflight/evidence handoff | Local implementation and actual-byte tests pass | Existing public response only | Interpretation improved; corpus gap remains | Deployed buyer and recipient journey |
| Focused skills.sh listing | Repository skill exists | Missing-content listing observed | This referral is unreliable | Admission/listing availability and history |

## Next integration and qualification

1. Keep TR1, A2A compatibility and this repair as separate reviewable slices.
   Refresh their bases before PR preparation and reconcile the concurrent
   `AGENT_UX.md` changes. Do not overwrite that document from this worktree.
2. Repair the acceptance instrument's retention/format gap before calling the
   historical-evidence path a pass: retain original corpus bytes outside truncated
   tool output, use the existing portable verifier, and retain a recipient check.
   The current scorer expects an expiring signed envelope; historical corpus
   snapshots need their supported format and an explicit freshness policy, not an
   invented expiry. Keep this as instrument work, not another product verifier.
3. Run the full required integration checks before committing. After an authorized
   release, observe the deployed skill index and digest, install from that public
   lane, and repeat the zero-spend buyer journey across both hosts. Include repeat
   attempts and a recipient check of retained bytes. Keep prompted entry separate
   from unbranded discovery.
4. Continue GitHub MCP / AGNTCY admission work independently. No submission or
   publication was attempted here; a local repair does not establish admission.

The paid purchase path remains unexercised. A historical signed observation can
satisfy a bounded evidence task without spending, but cannot prove current paid
delivery. Preserve that distinction in both acceptance and product copy.

## Rebase and integration follow-through, September 16

Rebased onto `85f2f5e4`, preserving the merged AGENT_UX catalogue and verifier
metadata work. The guide fingerprint was refreshed after a reversal control
proved that only the intended A2A and skill-index paragraphs changed; the
handoff branch and combined candidate each pass all 13 guide tests.

The admission-package review also found a false universal-expiry claim in
`src/lib/oasf-record.ts`. Its canonical wording now separates the signed date,
gaps and any declared expiry from signature validity. The unconditional
expiring annotation was removed and `registry/agntcy/record.json` regenerated
with the existing cut command. No record was signed or published; the earlier
CID/signature remains historical and cannot cover the changed bytes.

The [retention/integration follow-through](../takeoff-retention-2026-09-16/REPORT.md)
records current validation and the two additional public runs. Those runs used
the published old skill and remain incomplete. Local fixes still do not qualify
the deployed buyer/recipient journey.

## September 17 merge validation

The frozen combined TR1/TR2/TR3 tree passed the full suite: 752 files,
14,561 tests passed and one existing skip. Typecheck and both Worker bundle
checks passed. The earlier run mixed OASF wording changed during execution;
its two drift failures are retained as an invalid validation attempt, not a
pass. This clean rerun kept source fixed throughout. [Validation record](merge-validation-2026-09-17.json).

The canonical OASF description now states the observation/expiry distinction
declaratively; no new directory signature or publication was performed.
Public release-byte checks, independent A2A qualification and the frozen
eight-attempt buyer cohort follow merge. No cold-journey pass is claimed here.

The first TR3 CI quality run caught a separate offline-bundler gap: the
inventory canonicalizer loader could not import Markdown. Existing evidence
tests reproduced it before the fix. The loader now accepts text modules, and
the historical report reuses it. All 57 offline evidence tests and 91 buyer
tests pass; typecheck and the Worker bundle pass. Application source is
unchanged since the passing full suite; final-head CI gates this correction.
