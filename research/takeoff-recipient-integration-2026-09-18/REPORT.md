# Integrated buyer-to-recipient instrument — September 18

**Implementation and local controls, not a new acceptance result.** No native
agent, buyer cohort, recipient or paid request was launched for this change.
The [operating guide](../../docs/BUYER_HARNESS.md) provides the readable entry
point. The [next plan](plan.json) is a draft pending merged-source qualification.

This combines the all-file handoff preparer from #802 with the timing and
recipient adapter from merged #799. It preserves both older acquisition records,
source captures, reviewed scores and their limitations. Schema 5's fixed signed
pair is still available for historical previews; schema 6 makes the new scope
explicit rather than changing an old frozen protocol.

## What changed

- Schema 6 requires `all-retained-and-buyer-report`. Every captured file is
  supplied unchanged, without a reviewer selecting a subset or assigning an
  authenticated role. Citation status is explicitly unclassified, not falsely
  marked uncited. Capture gaps remain in the manifest.
- The capability phase separately exercises the offline recipient adapter on
  fresh local signature vectors and byte retention. That result must pass before
  buyer acquisition. Online buyer qualification cannot stand in for it.
- Before acquisition, the protocol binds the exact recipient prompt, plan,
  instrument, host context, capability record, input names and timing policy.
  A changed binding refuses the later recipient launch.
- `--recipient COHORT --cell ID` previews the frozen prompt and limits. Adding
  `--run` checks eligibility and the current host context, then atomically reserves
  that cell's one attempt before preparing or launching anything.
- Source byte mismatches stop preparation. The exact pre-launch handoff stays
  beside the launch record; the recipient works in a separate temporary copy.
  A crash or preparation failure retains the reservation and cannot be retried
  under that cell. Preserve failures; start a separately justified experiment.
- Launches reuse `recipientLaunch()` and `runChild()` with their frozen limits,
  offline settings, interruption detection, stop-request time and close time.
  Model-output text is evidence to review, never an automatic acceptance verdict.
- Schema 6 acceptance requires a completed recipient runtime and final trace,
  bound by review hashes to its exact buyer record and input manifest. A stopped,
  transplanted or unfinished recipient cannot support a
  full pass even when an earlier signature check succeeded.

## Local validation

The integration controls use synthetic local child processes, not model hosts.
They exercise an actual offline-adapter launch path, fresh signature vectors,
byte copying, prompt/budget binding, host drift, qualification failures,
interrupted buyers, changed source and protocol files, preservation outside the
writable workspace, a duplicate launch, and hash-bound recipient completion.

Failing-before controls removed the buyer eligibility guard (two expected
failures), restored online network settings (one expected failure), and removed
the final recipient scoring gate (one expected failure). A changed-buyer
regression also failed before the recipient source binding was added. Restoring
the earlier automatic "uncited" label failed the new classification check. Restoring
the fixes returns the focused suite to green. The focused suite passed 203 checks, including 19 integration controls. The full
Worker suite passed 15,047 tests with one skipped and no failures. Typecheck and
both bundle checks passed. Detailed results are recorded in `validation.json`.

## Next experiment

Question: after the published guidance corrections and this integrated handoff,
can both buyer hosts produce appropriately bounded interpretations that a fresh
offline recipient independently verifies and understands?

The draft keeps the prior buyer model choices, directed skill entry, merchant,
zero-spend limit, retention limits and 14-day historical window. Recipient limits
are explicit and taken from the already introduced schema-5 protocol. This is
referred usability, not organic discovery or paid completion. Local tests do
not qualify native hosts. Merge the instrument, review the draft, run one new
capability phase, and only then acquire a new cohort. Run recipients serially
once for each eligible buyer. Do not alter any earlier plan or score.

Network settings disable sandbox network access and web search through the
existing adapter. These controls and the local-crypto probe are not a proof
against every possible sandbox escape. Timing gaps invalidate a run; they do
not diagnose sleep or grant extra time. No operational limits were increased.

## Reconciliation with the published preparer

PR #810 (`947122fa`) supplies the frozen-cohort preparer checks and shared
inventory prompt. The combined controller calls that exact preparer contract,
including its protocol and parsed-plan bindings; it keeps schema 6's unclassified
all-file inventory, separate offline qualification and single-attempt runtime.
Schema 5 can still describe either preparer scope. New live controller runs
require schema 6, so those compatibility paths do not bypass its acceptance gate.

The combined focused suite passes 215 checks. Removing the controller's frozen
handoff argument makes the integration assertion fail; restoring it passes.
The standalone unclassified prompt also failed its regression assertion before
the shared helper received that classification. The combined full Worker suite
passed 15,047 tests with one skipped and no failures. Typecheck, both
bundle checks and documentation checks passed (the latter with stale-document
advisories). Evidence is recorded separately in `validation.json`.

Before any new native acquisition, a readback at 2026-09-18 16:47 UTC captured
HTTP 200 responses from the live menu, guide, store skill, buyer entry skill and
its source-pinned counterpart. The buyer entry matched source revision
`2dd2af818e0b7dd0a497f145bf2d754ff88e574b` byte for byte. The menu included the
bare-host example, and the buyer entry retained independent issuer-key guidance.
The existing six-door probe successfully read MCP tools/list (20 tools) and the
current public registry description. Its only regression was the WebMCP origin
trial approaching its October 15 expiry, reported as partial rather than expired.
These are public-surface observations, not evidence of buyer understanding or a
claim that the full origin-trial browser path was exercised. Raw readback bytes
remain in the local acquisition directory; `public-readback.json` records hashes.
