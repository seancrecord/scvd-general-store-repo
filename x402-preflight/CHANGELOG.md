# scvd-preflight — changelog

Versions are immutable once published. Minor versions add functions and
never change an existing function's result shape or an exit code; a
change to either is a major.

## 0.2.0 — 2026-09-19

Ships `fixtures/exit-law.json`: the deploy gate's exit law as data —
eleven exit cases and four worst-outcome cases, keyed by the per-door
outcomes and the `fail_on` set, with the exit code as an integer. This
package's tests read it, and so do the Python and Go ports, so the
three clients agree by construction rather than by three hand-typed
copies. No function, result shape or exit code changed; a consumer can
now assert its own gate against the same table we do.

## 0.1.0 — 2026-09-03

First publish, roadmap C5: the preflight Action's file as a package.
`preflightOne`, `preflightMany`, `failedChecks`, `remediation`,
`exitCodeFor`, `worstOutcome`, `renderLines`, and the `scvd-preflight`
command with the Action's exit law. Three recorded reports as
fixtures. Zero dependencies.
