# PS7 — MPP portfolio integration

Built and tested locally on September 28, on top of PS6's merged
[PR #928](https://github.com/seancrecord/scvd-general-store-repo/pull/928),
commit `4365135593193f8f01d4769f724e32aac8c2430b`. At the initial local
validation recorded below, PS7 had not been committed or merged. Skill 3.19.3 is prepared in source; the retained ClawHub publication
receipt remains 3.19.2. No package or skill publication was performed here.
Buyer/model qualification remains deferred per the keeper's direction.

## Entry inventory and remaining deltas

V3's parsers, batteries, MPP census retention and protocol-specific passport
history already shipped. Its fresh signed census qualification is recorded in
[the September 23 read](../research/roadmap-next-2026-09-23/README.md).
PS6 supplies the common inspection view. This phase reconciles those builds:

| Surface | Remaining delta and result |
| --- | --- |
| Hosted preflight and JavaScript library | Reuse PS6's inspection contract and recorded cases. No new engine, parser, verdict or export. |
| CLI | Guide callers to `scvd inspect` when installed help exposes it; `scvd preflight` and the Action keep their x402 gate and exits. Existing package payloads are unchanged. |
| MCP/WebMCP | Reuse the canonical preflight catalogue and schema from PS6. No new tool or browser handler. |
| Installed general skill | Correct the fresh timestamp path to `inspection.observed_at`; explain unverified terms, separate MPP readings, legacy fallback, installed capabilities and historical gaps. Regenerate its ClawHub payload. |
| Focused verification skill and hosted guides | Carry the same scoped reading instructions. Hosted general guides share one version-derived paragraph. The paid audit's extra discovery-surface observations are distinguished from its shared readiness battery. |
| Live/history summary | Explicitly label the existing verdict and comparison as x402-specific. Keep the complete live preflight, including both protocol readings and gaps, under `now.the_door`. |
| Corpus/history | Existing V3 code already preserves MPP measurements and unmeasured legacy rows. Update the guide; no schema, signed-row or verifier changes. |
| Root README | Expose the inspection workflow and label the deploy gate as x402-specific. |

An MPP-only response can still have the historical x402 `not_ready` verdict;
the summary now names that scope. Mixed responses retain both readings and
their limitations. Missing historical MPP measurements remain unmeasured.
No signed bytes are rewritten and no MPP checkout, session or renewal behavior
is introduced.

## Validation and release state

Both new summary assertions failed against the prior source: MPP-only and
mixed responses had no x402 scope in their headline. After the change, 121
tests passed across 12 affected suites, including the look/reproduction,
inspection, MPP census/passport/surface reads, and installed/hosted skill
integration. The existing census suite also verifies signed retention and
tampering. Skill graph/copy checks passed with four Node tests; typecheck and
both Worker bundles plus the MPP SDK build check passed. The full pre-commit
run exposed two guide fingerprint changes. Reversing only PS7's wording
reproduced both prior pins (14/14 guide tests); the reviewed new pins also
pass 14/14. The completed full run had 15,713 passing tests, one skipped,
and only those two fingerprint failures across 848 files. The final typecheck,
audit, claims and chain-reference guards passed. Fresh full CI remains the
merge gate.

[Validation record](../research/mpp-portfolio-2026-09-28/verification.json).
The generated skill tree retains the same reachable files; its publication
receipt is not advanced by a local build.

| Layer | Evidence |
| --- | --- |
| Built | PS6 merged; PS7 source and focused checks complete locally. |
| Deployed | After PS6 merge, the public HTTP and MCP metadata both returned matching `inspection-v1` schemas. This is an unsigned metadata read, not a live endpoint probe or a new browser-registration check. That read predates PS7 deployment. |
| Published | PS6's prepared npm package versions and PS7's skill revision have separate publication gates. No registry release or fresh registry installation is claimed by this phase. |
| Outside-tested | Existing V3 evidence remains dated as recorded. No new buyer/model qualification, paid attempt or outside-client acceptance exercise. |

[PS6 deployed schema readback](../research/mpp-portfolio-2026-09-28/ps6-readback.json)
retains the actual schema excerpts and response hashes. PS7 release requires
its own merge CI and deployment readback; ClawHub publication and outside
qualification remain separate.

## Release closeout — September 29 UTC

[PR #933](https://github.com/seancrecord/scvd-general-store-repo/pull/933)
merged at `c0d419b4e1a9b79c3c214fcb8244afe4a5033972` after all four test
shards and `check` passed. Both merged-commit Cloudflare builds passed.
The unsigned public guide readback at 00:37 UTC confirmed `/skill.md`
version 3.19.3 and the PS7 inspection guidance on it and `/llms-full.txt`.
The focused verification skill matched merged source exactly and retained
the newer report instructions from main. The PR records the release closeout.
These guide reads were not endpoint probes, buyer qualification or registry
publication. Earlier local-validation statements above retain their dated scope.
