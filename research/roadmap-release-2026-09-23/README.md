# Roadmap batch release — September 23, 2026

[PR #900](https://github.com/seancrecord/scvd-general-store-repo/pull/900)
merged at 19:42:39 UTC as `00aad2937844f0218869d99085385fef371c696d`. Both
[production Worker builds](production-builds.json) succeeded. The PR's
[complete CI](pr-ci.json) passed 15,495 tests across 829 files,
with 1 skipped and 0 failed. The [initial post-merge CI snapshot](main-ci-at-readback.json) was still running
at readback. Its [completed run](main-ci-completed.json) subsequently passed all
four test shards and the required check: [recounted artifacts](main-ci-qualification.json)
contain 15,495 passes, 1 skip and 0 failures across
829 files. The [merge tree equals the fully tested PR tree](merge-tree.json).

## Released surface readback

[Exact responses and measurements](readback.json) are retained as losslessly
compressed bytes. The source constants supply the warning limit and reward
thresholds; the reader refuses to overwrite an acquisition.

| Check | Result |
| --- | --- |
| Public OpenAPI | 687,898 bytes, down 13,003 from the retained pre-release response |
| Warning headroom | 12,102 bytes below the unchanged 700,000-byte limit |
| Expanded contracts | Equal before/after; all 20 frozen schema use sites also agree |
| Paths | 185, unchanged |
| Paywall guide | JSON and Markdown match the implemented wallet streak, UTC-day cadence, milestone, gap reset and same-day limit |

The public response is larger than the local fixture by the saved almanac
content already reconciled in the implementation record. Component reuse saves
the same bytes in both. No warning budget, payment contract or reward changed.

Replay all public retained hashes, response comparisons and cold-workflow summaries
offline from the recorded source (or this documentation-only follow-up):

```sh
node research/roadmap-release-2026-09-23/verify.mjs
```

## Separately shipped buyer guidance

The nested-row guidance shipped in #899. The [five-view readback](guidance-readback.json)
preceded #900 and is retained here unchanged: normal/stable JSON, HTML and both
Markdown paths answered 200 with the same signed-row, exact-query and subject
selector explanation. [Copy provenance](retained-followthrough.json) binds
these responses and earlier PR observations to their original bytes.

This closes the guidance's release check, not TR3. A new awake buyer cohort,
its frozen plan and fresh host/recipient qualification remain necessary. Earlier
cohort outcomes are unchanged. The VQ4 original-report gaps are also unchanged.

## Workflow and live-door qualifications

The [PR-branch cold workflow](pr-cold-workflow.json) passed the actual hosted
artifact check before merge. The [production workflow](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35911139078)
also passed on the merge revision. Its retained text and JSON reconstruct exactly
from one acquisition at 2026-09-23T19:47:51.522Z. The first knock was 266 ms,
reported cold, followed by 6 comparable warm replies
(median 47 ms); 7/7
replies answered. The burst returned 35/35 payment
quotes. The isolate-age marker says the deploy had landed; this is not a
cryptographic revision binding or a causal speed comparison.
[Offline verification and artifact hashes](verification.json).

The [post-release six-door sweep](doors-after.json) completed in the
[retained execution window](doors-after-execution.json): 27 criteria
met and 1 partial, none unmet or unknown. All raw-API criteria
now pass, including the OpenAPI warning budget and document/door agreement on
five rails. The sole remaining partial is the already-tracked Edge token expiry.
The command exits 1 for that advance warning; it is not described as an all-green
sweep. Its output does not enumerate refused URLs; the earlier refusal inventory
is preserved separately and is not promoted to a fresh per-URL observation.

The [pre-release sweep](doors-before.json) completed over the public sitemap;
its [limits](doors-before-qualification.json) retain five refused pages and the
OpenAPI size / Edge-token warnings. Earlier bounded attempts remain incomplete.
No sweep used `--record` or changed the human baseline. The Edge grant expires
October 15 and renewal was already on KEEPER_LIST; it is an advance warning.

These are dated public observations, not cryptographic attestations of the
answering Worker revision. There was no purchase, bell ring, counter write,
new paid qualification or native buyer experiment in the release readback.

## Publication boundary

The [content review](publication-review.json) documents the public response-body
captures retained for exact replay. The raw HTTP sweep trace and sampled block
page remain private; the public record retains their scoped findings and hashes.
The trace was removed from the unpublished commit before pushing, so it is not
part of this PR history. Request headers, caller network metadata and raw native
agent traces are not published.
