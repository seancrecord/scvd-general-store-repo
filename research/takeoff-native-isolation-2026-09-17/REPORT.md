# Native isolation and buyer qualification — September 17, 2026

**The repaired native hosts qualified, but the buyer cohort is not takeoff-ready.**
The corrected score is **0/4 catalogue journeys** and **1/4 referred journeys**
complete. All eight attempts remain in the denominator. Seven ended normally;
one hit its fixed time cap. Two retained signed artifact/key pairs were each
verified by a fresh offline recipient, without repairing the buyer's report.

| Buyer cell | Reviewed outcome | What happened |
| --- | --- | --- |
| Codex catalogue 1 | discovery fail | Selected a contact-checking service from the first 30 registry rows. |
| Claude catalogue 1 | discovery fail; scope fail | Selected the merchant itself; overstated protocol conformance. |
| Codex directed 1 | complete | Free preflight, retained signed historical snapshot and separate key, local package verification, accurate scope, fresh recipient. |
| Claude directed 1 | scope fail; signed evidence incomplete | Read unsigned history but did not follow the signed snapshot; overstated what requires payment. |
| Codex catalogue 2 | discovery fail | Again selected the contact-checking service from the first 30 rows. |
| Claude catalogue 2 | discovery fail; scope fail | Selected the merchant; incorrectly generalized that x402 quotes cannot be signed. |
| Codex directed 2 | incomplete | Signature check succeeded, then time/file retention caps prevented a complete handoff. |
| Claude directed 2 | scope fail; verification pass | Retained and verified snapshot/key, but conflated a paid shape audit with delivery evidence and overstated the number of independently verified rounds. |

[Corrected score](score.json), [same reviews with original scorer](score-original-scorer.json),
[review notes](reviews.json), [qualification record](qualification.json) and
[private-file provenance](provenance.json) retain the basis and gaps.

Three referred buyers executed successful cryptographic checks. Two retained
eligible complete original/key pairs, and both fresh recipients independently
recomputed the signature and identified the exact September 7 subject row.
The second Claude buyer's verification pass does not erase its interpretation
failure. The second Codex buyer's in-trace success does not erase incomplete
retention or its time cap.

## Boundary and method

This follows [the native failure record](../takeoff-catalogue-2026-09-17/NATIVE_HANDOFF.md)
merged in [#777](https://github.com/seancrecord/scvd-general-store-repo/pull/777).
That failed Codex probe remains failed. This acquisition used the same
schema-4 plan bytes, model requests, prompts, permissions, budgets and
14-day historical freshness policy, under a separately frozen adapter.
[freeze.json](freeze.json) was written before either host ran.

A local request-construction capture exposed 142 skill entries under the
old adapter. Disabling plugins alone still exposed 142. Documented per-skill
disables reduced that to zero; the repaired runner's inventory produced the
same zero-entry result. The capture used the real native exec path with a
localhost unauthenticated provider returning an error, without inference.
It tests request construction, not the production provider's full envelope.
Raw bodies and paths remain private. [Primary reads](../../docs/SPEC_READS.md#september-17--native-isolation-repair).

The adapter inventories local user, legacy/system and admin skill paths,
follows symlinks with cycle/bounds checks, and disables them per launch.
Plugins are separately disabled. No global settings or installed skills
changed. Qualification now binds the exact plan, seven instrument files,
CLI versions, allowed environment and skill inventory. A changed/missing
binding refuses a later acquisition before creating its output directory.
This is a check on a frozen launch context, not a claim about every hidden
host behavior or future CLI version.

Exactly one new native capability attempt ran per host. Both passed public
byte retention and the four generic signature vectors. Codex CLI 0.153.4
(requested `gpt-5.6-luna`) used two commands and correctly decoded the signature
for OpenSSL. Claude Code 2.1.274 (requested `sonnet`, resolved
`claude-sonnet-5`) used seven commands and Node crypto. Neither had a denied
command or budget stop. Different random vectors and model nondeterminism
prevent attributing the new Codex pass to removed skill metadata. No prompt
coached the previous signature mistake.

An operator's unpaid merchant precheck returned 402. It is not buyer evidence.
The eight cells then ran sequentially from that qualified context. The runner
kept the acquisition instrument unchanged throughout; reviews and later
recipient sessions supplied no feedback to active buyers.

## Scoring correction

During review, two regression tests showed that schema 4 did not inherit two
schema-3 checks: portable evidence was rejected as lacking a freshness policy,
while partial retention could pass through the standalone-envelope path.
The tests were observed red before the fix. Acquisition continued under its
frozen source; the correction was applied only after all eight cells ended.

The original end-of-run score, a full-review score using the original frozen
scorer, and a corrected full-review score are retained separately. Scorer
hashes distinguish them. The correction changes how captured evidence is
judged; it is not a new buyer attempt or evidence of product improvement.
While consolidation was running, the same correction merged independently in
[PR #779](https://github.com/seancrecord/scvd-general-store-repo/pull/779).
This branch adopts that implementation and its broader regression coverage.
An [integration recheck](integration.json) reproduces every archived scored
result; only the scorer source hash differs. The recorded local corrected
score and its frozen source remain unchanged.

The new scorer boundary also means this old qualification cannot authorize
a new acquisition with current source. Future runs need a newly frozen probe.

## Interpretation limits

All discovery results concern the actual bounded pages/queries retained by
buyers. They do not prove registry absence. Self-reports about permissions,
protocol conformance or signatures were checked against actual commands and
bytes. Claude's nominal curl/node policy sometimes allowed other compound
shell commands and sometimes refused them. Those are host observations;
permissions were never widened during the cohort.

A recipient supplied with disclosed review machinery is an offline
interpretation check, not unprompted discovery, an installed-package test,
or a substitute for an unperformed buyer verification. Only original
buyer-captured artifacts and separately acquired issuer keys were eligible;
no later network fetch repaired a finished acquisition.

Signature validity authenticates bytes against the supplied key. It does not
independently prove issuer identity, observation truth, payment, settlement,
delivery, reliability or Bitcoin anchoring. The signed September 7 observation
is historical; the 14-day review ceiling is not an issuer expiry. The subject
and period are narrow, and these commissioned runs do not measure adoption.

## Findings to carry forward

**Discovery is a bounded distribution finding.** All four catalogue journeys
retained the actual candidate lists and selected other services. The default
30-row page and Claude's x402/wallet/merchant searches did not return SCVD.
Neither buyer used the known store name to manufacture discovery. The prior
operator registry reading found SCVD by name; this cohort does not contradict
that. Do not rename, republish or send admission messages from this result.

**Scope interpretation remains fragile.** Both Claude referred reports
misstated a paid/free boundary, but by different routes: the first skipped
the free signed snapshot and overgeneralized authenticity limits; the second
verified it but included `service_audit` as delivery evidence. The retained
preflight already says that audit does not prove delivery and separately
names the Night Watch for paid observation. These are real reader failures,
not proof that the verifier or merchant failed. Review the exact sentences
and distinguish shared surface wording from model generalization before
changing the product. The buyer and recipient reports retain their errors.

**Capture constraints matter independently of crypto.** Both Codex referred
runs recovered from a default npm-cache EPERM by using a temporary cache.
The first kept package/export files outside the capture directory and retained
originals. The second installed dependency files inside it, kept a duplicated
large corpus/bundle/payload, and ran out of time while compressing. Its capture
hit the 32-file limit and refused symlink/deep dependency entries; the separate
issuer key and portable bundle were not captured. The compressed original
survived losslessly. No missing file was fetched or copied in afterward.
Do not raise a frozen cap retrospectively or count a future retention repair
as completion of this attempt.

**Recipient inputs are narrower than the buyer's whole workspace.** Each
recipient got the exact original signed response, exact independent key,
buyer final report and two disclosed public verifier modules. The unsigned
host summary/live preflight were not supplied. Both correctly limited the
signed proof to one historical row. The first recipient's claim that the
bundle API could not reproduce evidence completeness without the buyer's CLI
bundle is too strong: the parent independently reproduced it from the original.
Its core signature, subject, date and delivery interpretation still passed.
This is a reviewed scope check with a stated caveat, not a spotless reader score.

## Pickup

This bounded acquisition is complete. No probe, buyer or recipient remains
running. No product endpoint, package version, payment flow or published skill
changed in this work. PS1–PS4 releases remain the separate completed milestone;
TR3 stranger qualification stays open, and PS5/platform expansion is not started.

The next useful step is a narrowly specified interpretation/retention repair,
with a new freeze and red-first acceptance case derived from these retained
failures. Establish the repeated cause before editing the skill or changing
capture policy. If a repair is justified, qualify both hosts under the new
instrument and repeat both hosts twice; keep this cohort and its scores intact.
Do not rerun until green. Catalogue discovery/admission is a separate workstream
and remains subject to the keeper's existing boundaries.

For any later live cohort, the September 7 observation leaves the frozen
14-day window after `2026-09-21T02:30:20.531Z`. Use newer evidence or record incompleteness;
do not widen freshness. The source change to the scorer intentionally makes
this qualification ineligible for a new acquisition under current source.

## Preservation and validation

The private backup directory is
`~/scvd-takeoff-handoff-2026-09-17/native-isolation-cohort-2026-09-17/`.
Its `private/` tree is byte-for-byte verified against [provenance.json](provenance.json).
Public records and a manifest accompany it. Keep raw traces/request bodies
private because they contain native host/session metadata. Earlier acquisitions
and backups are unchanged. The raw `cohort/score.json` is the end-of-acquisition
score with reviews available at that instant; use the separately labeled
full-review scores for comparison. No original score was overwritten.

Validation: isolation/qualification regressions were observed red before the
repair; the two schema-4 scoring regressions were also observed red before the
later scoring fix. The pre-integration 134 buyer controls, typecheck and Workers/MPP dry-run
build checks pass; [validation.json](validation.json) records the final
integrated checks and full-suite result. The document/whitespace checks pass. Full-suite and CI
results are recorded with the merge receipt; all CI shards must pass before
merge. The first sandboxed full-suite launch was refused a localhost listener;
the native launch is separately retained and is the relevant test run.

The later integration of distribution PR #778 and scoped MPP activation #780
preserves their changes and both workstreams’ roadmap entries. Separate
[combined-branch checks](main-integration.json) passed; the earlier full local
suite does not include those upstream changes. Full CI remains the merge gate.
