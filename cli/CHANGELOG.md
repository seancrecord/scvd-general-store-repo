# scvd-cli — changelog

Versions are immutable once published; a wrong README ships with its
version forever (0.1.1 exists because of that). Minor versions add
commands and never change an existing command's output shape or exit
code; a change to either is a major.

## 0.2.0 — 2026-09-03

Added, on the roadmap's C5 row:

- `scvd look <url>` — what the store holds about a door: one live
  preflight beside the signed history, the tier with its fraction,
  and now against held. Exits 1 on a `not_ready` door, like `preflight`.
- `scvd before-you-pay <url> [--cap <usd>]` — will a stock x402 client
  pay that door, and which accept would it sign. A dry run: nothing is
  signed, nothing is paid. Exits 1 on `would_throw`, the buyer's own
  refusal; `cannot_simulate` is a finding about the door and exits 0.
- `scvd month [YYYY-MM]` — the state of x402 for one month: the closing
  week beside every round's door-weeks, defects by name, the months held.
- `scvd feeds` — the four Atom feeds by address.
- Every command that renders a preflight report prints the store's
  `remediation` rows as `FIX` lines: the defect class, its definition
  URL, what the operator does, what the buyer does. Printed, never
  derived here; absent on older servers and on a clean door.
- A refusal that carries `next_action` prints it.

Unchanged: every 0.1 command, its output and its exit codes; zero
dependencies; no credential, key or wallet, ever.

## 0.1.1 — 2026-08-28

The README correction. 0.1.0's README said the package was not yet
published, and the publish made that false; versions are immutable,
so 0.1.1 carries the corrected README and nothing else.

## 0.1.0 — 2026-08-28

First publish: preflight, conformance, receipt, verify, onpage,
fresh-set, corpus, menu, catalog, versions.
