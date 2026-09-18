# PS3 — Codex installation-path regression, September 17

Both targeted fresh Codex attempts passed with the unchanged frozen package.
The corrected absolute tarball command worked from the trial root and from
`consumer/`. Each reader executed its own consumer, returned the correct
unsupported result, retained scope/exclusions verbatim and denied payment
authorization. All 24 installed package files match the frozen tarball in
both installations. No workspace-boundary violation was observed.

This closes the remaining local PS3 correction check. The earlier revised
Codex cohort remains **7/8 strict passes**, and Claude remains **8/8**.
These **2/2 targeted passes** do not replace either cohort or turn the earlier
Codex result into a clean eight-of-eight result. All four scenarios were
previously exercised twice on each host; this follow-up targets the one
remaining installation-protocol defect using its unsupported scenario.

| Attempt | Requested and observed layout | Strict result | Time to completed response |
| --- | --- | --- | --- |
| unsupported-1 | Trial root | Pass | 87.083 seconds |
| unsupported-2 | Nested consumer | Pass | 74.048 seconds |

Times include host startup and model/tool latency, not only verification.
The requested model was `gpt-5.6-luna`; separate CLI sessions had no resume
or human rescue. The frozen protocol is in [protocol.json](readers/protocol.json).

The nested reader reported that its initial install tool call was refused
because the requested working directory did not yet exist. It created the
directory and recovered unaided. That refusal has reader commentary but no
command-execution event in the retained host stream; the scoring count of
zero failed command events must not be read as zero friction. A separate
git-status diagnostic suppressed its error. Successful consumer execution
is evidenced independently by the logger's exit status, source hash and
captured output. The root reader saved a byte-identical copy of its captured
API output; the nested consumer wrote the full API result directly.

## Evidence and reproduction

- [Scores](readers/scores.json), [manual reviews](readers/trace-review.json)
  and [installed file integrity](readers/installed-integrity.json).
- Each attempt directory retains its prompt, raw host stream, final answer,
  source, output and execution witness. Earlier failures remain in the
  [prior Codex record](../verifier-ps3-2026-09-17/RESULTS.md).
- [Verification record](verification.json) checks the frozen inputs and
  confirms all 90 original and 132 revised historical files are unchanged.
- Recompute scores from retained artifacts with
  `node research/verifier-ps3-codex-path-recheck-2026-09-17/score-readers.mjs`.
  This reuses the existing scorer and requires reviewed layout and exact
  installation-command checks in addition to the prior qualification rules.

These are bounded synthetic usability observations. Local traces and prompt
restrictions are not independent security attestation. Local PS3 qualification
does not establish registry installation or general reliability. Integration,
public wording approval and publication remain pending. No commit or PS4 work
occurred.
