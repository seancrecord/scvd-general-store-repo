# scvd-preflight (Go) — changelog

Versions are immutable once published. Minor versions add functions and
never change an existing function's result shape or an exit code; a
change to either is a major.

## 0.1.0 — 2026-09-15

First publish: the npm package `scvd-preflight` ported to Go. `One`,
`Many`, `FailedChecks`, `Remediation`, `ExitCodeFor`, `WorstOutcome`,
`RenderLines`, and the `cmd/scvd-preflight` command with the same exit
law.

`Report.Raw` keeps the whole decoded body beside the named fields, so a
field this client does not name is not a field it loses.

Tested against the same recorded reports as the JavaScript client, read
from `../x402-preflight/fixtures` rather than copied. Output and exit
codes verified identical to the JavaScript command for the same door.
Standard library only.
