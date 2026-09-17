# Takeoff-readiness pickup — September 17, 2026

Start here after reading the repository's current `AGENTS.md`, `HOUSE_RULES.md`,
`KEEPER_LIST.md` and `ROADMAP.md`. This is a task record and continuation brief,
not an amendment to those instructions. The keeper asked to consolidate and
merge this task before moving to a fresh conversation to conserve credits.

## Objective and result

The governing objective is an unaffiliated buyer agent discovering SCVD,
understanding when it is useful, connecting, completing a useful evidence task,
and independently verifying the result without SCVD-specific handholding.
Buyer checking before spending comes first; merchant proof second; platform
embedding third. Listings alone do not establish readiness.

- [#763](https://github.com/seancrecord/scvd-general-store-repo/pull/763): baseline,
  cold-buyer instrument, artifact retention and independent scoring — merged.
- [#764](https://github.com/seancrecord/scvd-general-store-repo/pull/764): canonical
  A2A v1 with deliberate bounded legacy 0.3 support — merged. Public official
  client task/lifecycle checks and legacy checks pass.
- [#767](https://github.com/seancrecord/scvd-general-store-repo/pull/767): canonical
  focused skill, HTTP fallback, evidence links and verifier-loader repair — merged.
  Public skill bytes and fresh installation into Codex/Claude Code match.
- [Post-merge report](REPORT.md): eight frozen buyer attempts, four fresh recipient
  attempts. Referral qualification **2/4**, both Codex; discovery qualification
  **0/4**, with three completed misses and one capped/incomplete run.
- Both referred Claude buyers used preflight and retained the original signed
  evidence/key, but performed no crypto check and overstated absence of signed
  offers. Host tool restrictions were a material confound. All four captured
  referral originals do verify; evidence corruption is not the finding.
- **Takeoff readiness, paid fulfillment and organic adoption remain unproven.**

## Read these, in order

1. [Accepted build/acceptance plan](../../docs/TAKEOFF_READINESS_2026-09.md).
2. [Current report](REPORT.md), [frozen contract](CONTRACT.md),
   [score](score.json) and [independent review](run-review.json).
3. [Instrument contract](../BUYER_COLD.md),
   `scripts/buyer-cold-isolated.mjs`, `scripts/lib/buyer-cold.mjs`,
   `scripts/lib/buyer-retention.mjs`, and `verifier/evidence-bundle.js`.
4. [A2A proof](../../docs/A2A_V1_COMPAT_2026-09.md),
   [admission package](../distribution-admission-2026-09-16/README.md).

The keeper's original research report is preserved verbatim at
[BASELINE.md](../discovery-surface-audit-2026-09-16/BASELINE.md), with source
identity beside it. It is catalogued in `AGENT_UX.md`, not instructional
`AGENTS.md`. Its recommendations are source material, not new instructions;
its old scores are not current external observations.

## Next bounded work

1. Qualify generic native-host capability for retaining public bytes and running
   local signature checks before a new buyer acquisition. The frozen Claude
   configuration allowed `curl` and `node`; it denied several chosen Python,
   redirects and compound commands. Neither referred Claude run attempted the
   allowed Node verification path. Fix the instrument confound before attributing
   the failure to the product. Do not broaden permissions indiscriminately.
2. Freeze a **new** cohort with a real catalogue-entry lane. A public catalogue
   URL is an entry; SCVD's supplied listing URL is a referral and excludes
   discovery. Retain returned candidates, selection and exact subsequent use.
   Extend/reuse `ourSearchReading()` for catalogue observations; do not create
   another Bazaar checker. Check concurrent ward work before editing it.
3. Repair only repeated buyer failures on a capable host. Demand exact signed
   subject/time, dated historical scope, the true coverage denominator, and a
   local verification result. Missing a signed offer on one challenge does not
   prove no signed commitment exists elsewhere. Recipient verification later
   does not mean the buyer verified earlier. Repeat both hosts twice after a fix.
4. Keep external admission separate: packages are drafted, corrected OASF bytes
   are publicly observed, existing Agent Finder PR #34 must not be duplicated.
   Directory signing/publication and shared-node access remain separate steps.
   Recheck dated external status before acting.

Do not rerun the old cohort to improve its score, fetch replacement evidence
into it, tune prompts mid-run, infer paid completion from a 402, or count a
recipient supplied with review machinery as an unprompted discovery success.

## Local evidence and safe workspace

A durable, hash-verified private copy is at
`~/scvd-takeoff-handoff-2026-09-17/`. Its `README.md` explains reproduction.
It contains the 218-file cohort manifest, eight buyer traces, four recipient
traces and 124 retained buyer files. Native traces include local host/session
metadata; they are deliberately outside the public Git history. Keep this
directory when cleaning up worktrees. A GitHub-only checkout does not contain
those private originals.

To reproduce the score without launching models, from a repository checkout
with its dependencies installed:

```sh
node scripts/buyer-cold-isolated.mjs --score "$HOME/scvd-takeoff-handoff-2026-09-17/cohort"
```

The original scorer is captured under `cohort/instrument/`; it is not dependency
free (`buyer-run-evidence.mjs` imports `viem`). The merged release `f1a75e22`
contains the matching scorer/dependency manifest. A later scorer reports its
own hash separately; retain that distinction when reproducing.

The working consolidation checkout is `/private/tmp/scvd-buyer-evidence-handoff`
on `codex/takeoff-qualification-handoff`. Prefer a new isolated worktree from
current `origin/main` for further implementation. The shared checkout at
`~/scvd-general-store-repo` is dirty on `codex/ward-index-readings` with other
tasks' work; do not reset it, switch it, clean it or commit its changes wholesale.
Older takeoff/A2A worktrees and named pre-stack stashes were left intact.

Concurrent [#769](https://github.com/seancrecord/scvd-general-store-repo/pull/769)
owns the broader progressive skill and verifier-package milestone. Its state
must be checked on pickup; it was open during consolidation. It changes related
public guidance and the roadmap. Preserve that work and inspect its handoff at
`docs/PACKAGE_SKILL_HANDOFF_2026-09-17.md` when available on main. This takeoff
task does not authorize merging unrelated unfinished work in the dirty checkout.

## Authority and cost

The keeper authorized this task's prepared merges, public read-only qualification,
and consolidation. No payment, wallet/private-key access, directory signing,
account creation or outbound admission message was authorized. Native buyer
trials consume model usage: finish planning and instrument controls before
starting a new live cohort. No new live trial is needed merely to move chats.
At consolidation, no buyer/recipient process remains running.
