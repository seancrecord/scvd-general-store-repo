# Workspace repair qualification — September 17, 2026

The merged isolation adapter and the workspace repair in PR #783 were tested
together. Both native hosts inherit the session cache settings and can write
there. The buyer cohort remains gated: Codex passed the separate generic
capability probe, but Claude did not complete it. No buyer cell ran here.

## Scope and frozen attempts

[freeze.json](freeze.json) records the exact instrument and unchanged
[plan.json](plan.json). The plan retains the earlier models, eight proposed
buyer cells, zero spend, budgets and 14-day historical-observation window.
This acquisition authorizes one generic capability probe and one initial
cache control per host, with zero buyer cells. The capability prompt, tool
permissions and application code were not changed during acquisition.

| Native host | Generic capability | Initial cache control | Corrected cache control |
| --- | --- | --- | --- |
| Codex | Pass | Incomplete: control compared path aliases as strings | Pass |
| Claude | Incomplete: stopped after a refused compound command | Incomplete: same alias error | Pass |

The original [qualification](qualification.json) and
[initial cache results](cache-control.json) remain unchanged. The corrected
control has its own [prelaunch freeze](cache-control-v2-freeze.json),
[source](cache-control.mjs) and [results](cache-control-v2.json).

## What the capability attempts actually showed

Codex retained the exact public file, matched its independent SHA-256 and
verified all four fresh signature vectors with OpenSSL. It first encountered
an unavailable Python crypto package, a Ruby crypto limitation and a refused
cleanup command; those attempts remain in its trace. The compact scorer's
empty `denied` list does not include every refusal reported elsewhere in the
trace. The completed local command and retained report support the pass.

Claude attempted one compound shell command: `curl ... && shasum ...`.
The native tool refused it under the existing permissions. The adapter
allows `curl` and `node`; it does not grant `shasum`. Claude then asserted
that all Bash commands, including Node, were unavailable, and stopped
without retaining a public response or checking signatures. That broader
assertion is unsupported: the later, separately declared cache controls
executed Node through the same adapter and permissions. The compact
`denied: ["curl"]` records the command's first word, not proof that a
standalone curl invocation would be refused. No permission was widened and
this capability attempt was not retried or replaced.

## Cache control correction

The initial control correctly observed both configured environment values
inside each native shell. Its write condition was wrong: the launcher used
macOS's `/var/...` spelling and Node's working directory used `/private/var/...`.
The strings differed although both parent directories resolved to the same
filesystem location. Both agents declined the write as instructed. This was
an error in the control, not evidence that the cache was unwritable.

Before the second control, the parent independently reproduced both alias
comparisons and rejected an unrelated directory. The new frozen prompt
compares canonical parent directories and requires the `npm-cache` basename.
One new attempt per host then wrote a fresh nonce in the configured cache;
the parent read the actual file independently. Both environment settings,
the native command, retained report and file contents agreed. Both completed
in one tool call without reaching a cap. Initial traces, source and scores
were preserved rather than rescored into passes.

These controls do not install a package or invoke npm inside an agent. The
offline runner tests separately exercise the real npm CLI's cache resolution.
Together they establish configuration propagation and native filesystem
access, not a completed purchase, evidence task or general host reliability.

## Narrow public-guidance correction

The focused skill said its corpus instructions were “below,” while the
actual export and size-limit procedure lives in the verifier README. The
skill now links directly to the existing `large-corpus-snapshots-130`
section. That exact rendered anchor was observed on GitHub during this work.
The installable file is also imported as the served skill; no second copy or
package release is required. This record does not claim deployment or an
improvement in buyer interpretation before merge and a separate public read.

The paid/free boundaries, verification procedure, tool descriptions and
discovery metadata are otherwise unchanged. No new sentence claims that a
shape audit proves delivery, or that a valid signature proves factual truth.

## Validation and preservation

After integrating PR #781 with #783: all 140 buyer-instrument controls and
typecheck passed. The guidance change passed the 17 affected Worker tests,
the repository's four skill-bundle controls, typecheck and bundle check.
The generic skill-creator validator rejects the pre-existing `homepage`
frontmatter extension on both the unchanged baseline and edited file; this
link correction does not remove that metadata. Full CI remains the merge gate.

[provenance.json](provenance.json) inventories every retained private file by
hash and length. Raw traces, native launch metadata, original control source
and instrument snapshots remain under ignored `private/`, with a verified
backup at `~/scvd-takeoff-handoff-2026-09-17/workspace-qualification-2026-09-17/`.
No process from this acquisition remains running.

## Next gate

Keep the buyer cohort unlaunched under this qualification. The next issue is
Claude's handling of the rejected compound command, not another corpus
signature or a broader claim about shell availability. Any further host or
instruction repair needs its own declared boundary and qualification;
retain this incomplete attempt. Do not keep rerunning the same probe until
it passes, widen a frozen permission or freshness cap, or promote cache
controls to buyer completions. The previous buyer results remain unchanged.

The earlier September 7 observation leaves the frozen freshness window after
`2026-09-21T02:30:20.531Z`. A later buyer must use newer evidence or report
incompleteness; this acquisition does not extend that window.
