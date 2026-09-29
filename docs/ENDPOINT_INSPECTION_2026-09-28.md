# PS6 — endpoint inspection

Built and tested locally on September 28, after [PR #920](https://github.com/seancrecord/scvd-general-store-repo/pull/920)
merged at `aed49b8841018b97f08cc893a84c70fce3a69fbf`. PS6 then merged in
[PR #928](https://github.com/seancrecord/scvd-general-store-repo/pull/928) at
`4365135593193f8f01d4769f724e32aac8c2430b`, with every required CI check passing.
Registry publication remains separate. Prepared package versions: `scvd-preflight` 0.3.0
and `scvd-cli` 0.4.0. No buyer or model qualification was run, per the keeper.

## The change

The existing unpaid preflight now returns an additive `inspection-v1` block.
It reuses the captured response, parsed accepts, MPP summaries and frozen
batteries. It does not introduce a second probe engine, signature verifier,
checkout path or new MCP tool.

The block separates response reachability and method; the set of protocols
observed; selected advertised terms; existing structural findings by battery;
observation time; body/header coverage; and unperformed checks. Advertised
terms are unverified and omit extensions. Each protocol publishes its total,
shown entries and omitted count under the shared summary cap. These summaries
are not complete payment instructions or signature-bound terms.

Unknown protocols remain outside the reader. No response or an unresolved
method yields unobserved protocols, never proof of absence. Incomplete headers
and bodies carry gaps. The existing `bodyOverLimit` signal is reported as such;
this work does not claim to change the underlying response-read resource bound.

Signatures remain `not_checked`, even when an offer passes structural checks.
No artifact or payment is signed, no payment credential is submitted, and
settlement and delivery are unmeasured. The existing optional Web Bot Auth
request identity and Solana rail reading are unchanged. No new outbound
request or key resolution was added.

## Entry points and exits

- HTTP v1/v2 retain their batteries and x402-specific verdicts. The new block
  rides the existing report; older reports are not rewritten.
- `preflight_endpoint` retains its v1 battery. MCP and the derived WebMCP
  catalogue expose the same inspection schema. Its display card labels the
  x402 verdict and shows the actual observation time and protocol set.
- `inspectOne` calls hosted v2 once, preserves its whole response, and adds
  the recognized inspection and a separate inspection exit code.
- `scvd inspect <url>` uses that same reader and exit policy. `--json`
  preserves the server response; text quotes untrusted values safely.

Inspection exit `0` means a response was observed, including MPP-only,
unknown and partial readings with explicit gaps. It does not mean safe or
ready to pay. Exit `2` means a request refusal; `3` means no usable observation
(network/store/budget failure, unresolved method or unsupported/missing data).
Existing preflight/Action exits are unchanged, including the CLI's existing
JSON-mode status-based behavior. The shared reader is vendored byte-for-byte
into the standalone CLI; a regression test prevents drift.

## Evidence and remaining gates

The synthetic inputs reuse `test/fixtures/mpp` headers. Seven retained
inspection projections cover x402-only, MPP-only, mixed, unknown, unreachable,
over-limit body and unresolved method. Tests also exercise a truncated MPP
header, a fake signature, term overflow, malformed/legacy/future reports and
terminal control characters. Fixed clocks drive both observation and expiry.
Each fixture is replayed through HTTP, MCP, the library and CLI; differences
between v1 and v2 scoring remain named rather than normalized away.

New hosted assertions failed before implementation. CLI and card changes
were stashed separately to witness their new checks fail, then restored.
Focused service/client suites, type checking and Worker bundling passed.
Fresh offline tarball installs passed JavaScript, strict TypeScript and CLI
consumer checks. [Retained validation record](../research/endpoint-inspection-2026-09-28/verification.json).

Completion review also exercised saved reports with unknown structural fields
and numeric x402 terms: the renderer ignores unvalidated additions, and the
reader now enforces its string-or-null x402 declaration. Both regressions
failed before the fixes. [Final build and fresh package checks](../research/endpoint-inspection-2026-09-28/completion.json)
record the finished package bytes; the earlier validation record is retained.

The full local suite ran before commit: 15,670 passed, four failed and one
skipped. The failures identified a missing discovery phrase, a stale generated
OASF record (two assertions), and an example guard that needed to accept the
new optional block on historical reports. The fixes preserve old recorded
bytes; the completion record names the follow-up checks.

The first PR CI run exposed an existing wall-clock race in a budget test;
freezing both sides fixed it without changing the rate limiter. All four
shards and the aggregate check passed before merge. An unsigned post-merge
HTTP/MCP metadata read returned matching `inspection-v1` schemas;
[release evidence](../research/mpp-portfolio-2026-09-28/README.md). This does not
claim a fresh live endpoint probe. Registry publication and fresh registry
installs remain separate. WebMCP catalogue
derivation is covered here; no new live-browser registration claim is made.
The agent-explanation acceptance exercise remains deferred, not passed.

PS7's remaining MPP guide and summary deltas are now built locally;
[entry inventory and release state](MPP_PORTFOLIO_INTEGRATION_2026-09-28.md).
It reuses these parsers and preserves historical signed observations.
