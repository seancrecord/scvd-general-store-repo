# Public takeoff qualification — September 17, 2026

The three prepared changes are merged and deployed. Public protocol and skill
installation checks pass. Two of four referral journeys pass the frozen buyer
contract, both on Codex; no unbranded search journey passes. **Takeoff readiness
remains open.** These are controlled, explicitly verification-prompted trials on
one merchant endpoint, not organic adoption or paid-delivery evidence.

## Released work

The keeper authorized the prepared merges and then public qualification.

| Work | Merged pull request | Merge commit |
| --- | --- | --- |
| Cold-buyer retention, verification and baseline | [#763](https://github.com/seancrecord/scvd-general-store-repo/pull/763) | `e2627657ffad04c9ec618999e41f816358150b6b` |
| Canonical A2A v1 with bounded legacy compatibility | [#764](https://github.com/seancrecord/scvd-general-store-repo/pull/764) | `30e9e00be2789a454d471ae0eeefb26d5572ad36` |
| Canonical skill, HTTP fallback and evidence handoff | [#767](https://github.com/seancrecord/scvd-general-store-repo/pull/767) | `f1a75e2263efa481a6a9903bd106f8a9c64ce4af` |

All required PR checks passed before merging. The final #767 merge tree matched
the locally checked main join exactly (`6a08e939454d0d7dd14e916aeb14953a9d7e9b8e`).
Both production Worker builds succeeded. The post-merge main CI run was cancelled
after the independent verifier PR #762 merged at 15:51:58 UTC; that cancelled run
is not a test pass. The merged PR's full gate had already passed. Release
validation details are retained with the September 16 repair report.

The #762 follow-up changed `mcp-verifier.ts`, not the public HTTP preflight or
focused skill used here. This was a live production run across a concurrent
deployment, not a claim of an immutable production revision. Each buyer's
original public responses and hashes remain the evidence for what it saw.

## Public release checks

- The pinned official A2A client completed three public v1 tasks and their
  retrieval/terminal-cancellation checks. Bounded legacy 0.3 also passed.
  [Protocol evidence](../../docs/A2A_V1_COMPAT_2026-09.md#september-17-public-protocol-qualification).
- The focused public skill, GitHub source and served index matched the merged
  source at 15:42:58 UTC. The OASF response matched the canonical draft. An
  earlier read during deployment missed the new index entry and is retained.
- A clean public installation using `skills@1.5.26` under Node 24.19.0 succeeded
  for Codex and Claude Code. Both installed files matched the served source.
  No global installation or preinstallation into buyer sessions occurred.

These are directed checks, not evidence of unprompted discovery, organic use,
paid fulfillment, external directory admission or directory signing.

## Frozen acceptance contract

Two repetitions per native host and lane: Codex (`gpt-5.6-luna`) and Claude Code
(`sonnet`, resolved to `claude-sonnet-5`); unbranded intent search and referral to
the public focused skill. Verification was explicitly prompted in every cell.
Each fresh context had 240 seconds, 20 counted tool events, 4 MiB of trace output,
and 32 MiB/32 retained files. Historical evidence was bounded to 14 days. Output
tokens were advisory, not a hard cap. Tool events do not count origin requests.

The subject was `https://lionx402.com/api/x402/wallet-screen-json`. No funds,
wallet access, account creation, outbound messages or paid requests were allowed.
The plan and all buyer prompts were frozen before the first run. No mid-run hints,
permission changes or replacement artifact fetches were used.

Full qualification requires two completed journeys in every required host/lane
cell. Directed entry excludes discovery. A successful referral cannot close an
unbranded discovery miss. A correct payment stop is not a paid completion.

## Buyer results

| Host and lane | Completed qualification | Observed stopping point |
| --- | --- | --- |
| Codex, unbranded search | 0 of 2 | Both completed without selecting SCVD; merchant metadata and other public references occupied the investigation. |
| Claude Code, unbranded search | 0 of 2 | One completed without selecting SCVD; one hit the tool guard while debugging permissions. The capped run remains incomplete. |
| Codex, public-skill referral | 2 of 2 | Both used HTTP preflight, retained the original signed historical snapshot and separately fetched key, verified locally, and handed evidence to fresh recipients who understood the signed scope. |
| Claude Code, public-skill referral | 0 of 2 | Both used HTTP preflight and retained the signed original/key, but stopped at field comparisons without cryptographic verification. Both overstated the scope of an absent signed offer. |

The machine score separates three completed discovery misses from one incomplete
discovery run. Both Claude referral rows fail the decision stage and leave the
verification stage incomplete. This is not a claim that their signatures failed:
the existing verifier checks all four retained referral originals successfully.
All four are the same immutable corpus snapshot, with the exact requested subject
observed on `2026-09-07T02:30:20.531Z`. The snapshot was published September 8.
It declares no evidence expiry; the 14-day limit is this experiment's frozen
historical-age policy, not a store guarantee.

All four referred buyers acquired the same 7,172-byte focused skill. None needed
a preinstalled SCVD connection to run preflight. All four retained a complete
11,485,079-byte signed snapshot and separately acquired key. The first Codex run
also downloaded the full index instead of the linked compact index; it stayed
within the capture budget, but that avoidable work is visible in its trace.

The native Claude allowlist permitted `curl` and `node`. Several chosen Python,
shell-redirection or decoding commands were denied. Simple public fetches and
reads succeeded; neither referred Claude buyer tried the permitted Node crypto
path or installed the public verifier. Those facts support a host/agent-choice
confound, not a blanket claim that Claude cannot verify or that SCVD is broken.
The unbranded second Claude run reached 21 exposed tool events before the
20-event guard terminated it; the runner is explicit that it stops after seeing
an over-budget event.

Both Claude referral reports converted “no signed offer observed on this
challenge” into a broader statement that the buyer has no committed terms.
The instrument expressly cannot establish that broader absence. The second
also conflated six chain rounds with the five-round coverage denominator.
These are interpretation failures worth measuring separately from installation,
transport, artifact integrity and payment.

No run was coached, retried with a different prompt, or rescued with a replacement
fetch after completion. The result cannot establish absence from a registry: the
agents chose mostly merchant-specific search queries. It shows SCVD was not
selected in these bounded journeys.

Four fresh recipient contexts received each referral buyer's exact signed
original, separately captured issuer key and final report. Public verifier
modules were supplied as explicitly labeled review machinery. No parent verdict
or replacement network fetch was supplied. All four recipients independently
verified the signature; the two Codex handoffs met the recipient-understanding
gate. A Claude-handoff recipient wrongly treated its later successful check as
contradicting the buyer's truthful statement that the buyer had not verified it.
That distinction is retained in the review; later verification never upgrades
an unperformed buyer step.

The recipient input was deliberately the signed-evidence subset, not every
unsigned live/host response. Recipient objections that other report details
could not be checked from that subset are valid scope limits, not proof the
original buyer lacked those files. The parent checks issuer acquisition from
the retained buyer trace; the offline recipient cannot authenticate a past HTTPS
retrieval merely from a saved key document. Bitcoin anchoring and historical key
authorization were not independently qualified.

## Evidence and reproduction

[Continuation brief](HANDOFF.md) contains the next bounded work, authority,
concurrent-task notes and safe checkout instructions. A durable hash-verified
private copy is retained at `~/scvd-takeoff-handoff-2026-09-17/`, outside the
temporary worktree and public Git history.

- [Frozen plan](plan.json), [freeze record](freeze.json) and
  [acceptance contract](CONTRACT.md). The freeze's `acquisition_started: false`
  describes its creation time; it is not rewritten after the run.
- [Recomputed score](score.json), [dated independent reviews](run-review.json)
  and [file provenance](provenance.json).
- [Public byte checks](public-release.json), [installation](install.json), and
  [merge/deployment record](merges.json). Both public release attempts are kept
  in their own directories.
- The complete local acquisition is `private/cohort/` (ignored by Git), including
  native traces, 124 retained buyer files and the four recipient traces. All 218
  local evidence files are listed in the provenance record. These private traces
  include host/session metadata and are not published in this report.

Every retained buyer file and review reference was hash-checked before the local
copy was made. Rescore the local copy with the existing instrument:

```sh
node scripts/buyer-cold-isolated.mjs --score research/takeoff-postmerge-2026-09-17/private/cohort
```

The public summaries do not replace the original traces. A reader without the
private local acquisition cannot reproduce the full semantic trace review.

## What to do next

1. **Qualify the test host before changing product code.** Add a generic
   capability check for public-response retention and local signature processing,
   and state available local tools without naming SCVD. Freeze a new cohort
   after that check. Keep this cohort and its denials intact; do not rescore it
   as if different permissions had existed.
2. **Run a real catalogue-entry buyer lane.** Give a fresh buyer the public
   catalogue, not SCVD's listing URL; retain the actual returned candidates and
   selection. Reuse `ourSearchReading()` for outside catalogue observation.
   A merchant-focused search miss alone does not justify building another
   discovery checker or rewriting every marketplace wrapper.
3. **Repair only repeated evidence-use failures.** Check the exact signed
   subject/time and distinguish snapshot date from observation date. Require
   scope-limited absence language, explicit denominators and actual local
   verification. Keep recipient verification distinct from what the buyer did.
   Change the canonical skill/tool description if a fresh, capable host still
   fails; repeat both hosts twice after a measured repair.
4. **Continue admission work independently.** Existing requests keep their
   identity. The prepared GitHub/AGNTCY packages and public OASF correction are
   ready for the outstanding human/external steps. Merchant and platform flows
   remain behind dependable buyer completion.

The next acceptance gate is repeated buyer and recipient completion across the
required hosts and real entry lanes. More listings, protocol checks or a second
passing Codex referral do not replace that gate.

## Admission work

The [admission package](../distribution-admission-2026-09-16/README.md) records
drafts, known submissions and bounded external observations. MCP Registry 0.2.3
was externally observed; Agent Finder PR #34 remains an existing request, not a
reason to duplicate it. GitHub discussion searches did not establish an earlier
SCVD admission request; private or off-platform history remains unknown.
AGNTCY participation guidance is open, but shared-node write access remains
unverified. Corrected OASF bytes are public; a new directory signature/CID and
external publication remain outstanding. No admission message or signing action
was performed by this qualification.
