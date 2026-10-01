# Empty source-review directories — October 1

The [closed qualification](../research/buyer-setup-qualification-2026-10-01/REPORT.md) spent six failed downloads on an absent source directory and six more on the same downloads after creation. Setup guidance was already present. The installed-report gate remained incomplete; no buyers launched.

A new explicit `package_source_directories: true` condition requires the existing package-review condition. The runner derives unique parent directories from `packageReviewSources(plan)` and creates only empty directories before starting each online qualification or buyer process. The prompt names the prepared paths; the completed run record carries `prepared_source_directories`. Symlinked, non-directory or populated destinations fail before launch. No source bytes, key, signature answer, review decision or generated report is supplied by this setup step.

The agent still fetches and inspects source, chooses whether to proceed, installs the exact pinned package if it chooses, and performs verification within the same budgets. Permissions, models, scoring and the offline recipient are unchanged. Omitted conditions preserve existing prompts and workspace behavior. The full-plan and instrument bindings require fresh qualification for this change; prior attempts remain closed.

Four controls failed before implementation: invalid conditions, missing prompt disclosure, absent directories at child start, and accepted unsafe/prepopulated destinations. The old-plan binding control already passed. All five controls now pass as part of 90 qualification tests. Eight archived online qualification/buyer prompts reproduce byte for byte without the new condition. Native benefit remains unmeasured until a separately frozen acquisition passes qualification and runs buyers.

## Separate native qualification

The [new frozen qualification](../research/source-directories-qualification-2026-10-01/REPORT.md) is closed: Codex and offline capability passed; Claude hit the same 20-call cap after 21 observed calls. All six source downloads succeeded, but compound-command refusals and source inspection still consumed calls. Installation succeeded; no installed CLI report or completed final remained. No buyers launched. A same-session host-output read outside the neutral workspace is recorded separately. This establishes the empty-directory behavior, not native buyer reliability.
