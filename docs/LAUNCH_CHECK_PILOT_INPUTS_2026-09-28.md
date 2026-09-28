# Launch Check pilot inputs — September 28, 2026

The BiX pilot needs a POST body. The existing engine could fall back from GET
to POST, but always sent `{}`. The keeper approved adding request-body support
and proving it offline before coordinating any paid attempt.

This change adds an **internal engine option**, `LaunchCheckOptions.request`,
to `performLaunchCheck`, and an internal `runLaunchPilot` invocation through the
existing durable recovery binding. Public checkout, MCP purchase inputs and
Opening Day retain their existing behavior. There is no new HTTP endpoint,
SKU, payment rail, scheduled run or deployed pilot in this change.

## Named demand and source read

BiX [accepted the free check and supplied the request](https://github.com/Merit-Systems/x402scan/issues/1197#issuecomment-5867404582):
POST `https://creator.linkhco.com/paid/v1/creator-edge`, with exactly
`{"pair":"USDG","tax":1}`. The unsigned check and its limits were
[reported back](https://github.com/Merit-Systems/x402scan/issues/1197#issuecomment-5874641977).
The response enum clarification and paid qualification remain separate. On the
follow-through read, the issue still had four comments and no reply after our
results/enum question. No duplicate follow-up was sent.
See [the dated source read](SPEC_READS.md#2026-09-28--launch-check-pilot-request-inputs).

## Engine contract

An internal caller may pass `request: { method: "POST", body: serializedJson }`.
The body must encode a JSON object and fit `MAX_LAUNCH_REQUEST_BYTES`, exported
from `src/services/launch-check.ts`. Unsupported methods, malformed or non-object
JSON, extra request properties, and bodies over the UTF-8 byte ceiling fail
before any request, screening or signing. No raw input is put in these errors.

The engine copies the supplied string before the first await. It validates
without reserializing: whitespace, property order and Unicode bytes survive.
It sends explicit POST from the unpaid approach onward; a method refusal stops
the walk, rather than changing the agreed request. Quote, payment and replay
use the same URL, method, content type and body. The replay carries the same
payment authorization. Redirects remain manual and no fresh authorization or
additional retry is introduced.

Default calls still approach with GET and may fall back to an empty POST. Their
approach text now names the method that actually answered.

For explicit pilot inputs, `request_evidence` records the method, content type,
UTF-8 byte length and SHA-256 digest. It is included in both the durable
pre-presentation attempt callback and the final observation, hence in the
evidence hash and signature. Re-signing a retained attempt preserves it without
repeating the request. Older and default records omit this field; do not infer
the original body from its absence. Battery v4's payment and replay meanings
are unchanged; the optional field identifies the input to those stages.

The fingerprint is an SCVD observation, **not an EIP-3009 commitment to a request
body**, and does not prove the seller processed that body. The signed scope says
so. The field contains no raw body, but existing response evidence may echo
inputs. Only agreed synthetic/public inputs belong in a pilot; this option is
not a confidential-input or credential facility.

## Durable invocation

`runLaunchPilot(env, { id, url, request })` in `src/services/launch-pilot.ts`
routes to `PAID_RECOVERIES.getByName("launch-pilot:" + id)`. Calling this function
can spend the field wallet; it is not a preview. It has not been invoked against
a real partner. The only executions in this change use local fixture sellers.

The keeper assigns one fixed ID per agreed attempt. Reuse it after a timeout or
lost response. Neither the URL nor its body determines the object name: changed
inputs must reach the original journal and be refused, not create a fresh walk.
The RPC independently validates the public HTTPS target and exact POST input.
Missing storage, unsupported fields, credentials in URLs, private/own targets,
fragments, malformed JSON and missing explicit requests fail closed.

The journal snapshots the body before joining its existing queue and stores its
fingerprint in the durable identity. Matching concurrent calls receive one
original report. Changed URL, ID within an object, method or exact body bytes
cannot reuse the original identity. Raw input bodies are not added to that
identity. The pre-payment checkpoint keeps the fingerprint too. If the process
dies after that checkpoint, recovery signs the retained uncertainty and sends
no replacement payment. A missing identity alongside retained pilot evidence,
or a retained record whose request evidence no longer matches, is refused.

Public purchases keep their existing identity shape and dispatcher. There is no
new request parameter accepted through public checkout. The helper is an internal
operator integration point requiring the existing Worker binding; deployment
and a keeper-controlled invocation are still separate actions.

Proposed first pilot input (preparation only; the ID is not evidence of a run):

```json
{
  "id": "bix-creator-edge-2026-09-28-01",
  "url": "https://creator.linkhco.com/paid/v1/creator-edge",
  "request": { "method": "POST", "body": "{\"pair\":\"USDG\",\"tax\":1}" }
}
```

The money limit is still `FIELD_SPEND_CAP_USD` from `launch-check-terms.ts`;
the earlier observed quote of 0.005 USDC is not a new enforced ceiling. Agree
the existing instrument's spend limit, its single authorization and its one
replay presentation with the partner before an actual run. A new pilot ID is a
new potential spend, never a way to recover the old one.

## Validation and release boundary

The initial 13 new cases were run against unchanged engine code and all failed:
supplied inputs were ignored, explicit method refusals triggered fallback, and
invalid inputs were not refused before the walk. The expanded suite also checks
the exact BiX input, Unicode/whitespace, caller mutation, byte-limit boundaries,
signature tampering, retained-attempt recovery, durable-write failure, the
default fallback, screening, spend caps and redirects. All seller and screening
responses are local fixtures; no real field key or partner endpoint is used.

Validation completed in the isolated `codex/launch-check-request-body` checkout,
based on main `06953547`:

| Check | Result |
| --- | --- |
| Final `test/launch-check-request.spec.ts` | 21 passed, including the exact BiX body and the whitespace/Unicode variant |
| Nine focused suites: request, engine, exposure, challenge evidence, screen evidence, journal, paid recovery, replay evidence, payment binding | 473 passed; this run contained the earlier 20-case request suite, before adding the exact BiX variant |
| `npm run typecheck` on final source and tests | Passed |
| `npm run build:check` | Passed for both Workers and the MPP SDK bundle; dry runs only |
| `git diff --check` | Passed |

The initial focused run took approximately six minutes while unrelated suites ran on
the same machine. No timeout was raised and no test was skipped or loosened.
Full CI remains a merge gate. This build alone does not establish live BiX
compatibility, delivery, settlement, freshness, partner usefulness or repeat
demand.

Durable follow-through validation:

- Ten new journal cases failed before request-aware recovery was implemented.
- Removing the new RPC entry and orphaned-identity refusal made their three
  targeted controls fail. The implementation was then restored.
- The expanded ten-suite run passed all 498 assertions, but exited with ten
  unhandled rejections from the new tests passing pipeline-capable RPC thenables
  directly to Vitest rejection matchers. This was **not a clean test run**.
- The tests now await those RPC results into native Promises before checking
  rejection, matching the existing RPC-test pattern. The final three-suite run
  (pilot journal, legacy journal, exact request inputs) passed **54 tests with
  exit 0 and no unhandled rejections**. Production source did not change for that
  harness repair; the other seven suites' assertions had already passed.
- Final type checking and both Worker/MPP bundle dry runs passed. No timeout,
  assertion or production safeguard was relaxed. Full CI remains required before
  merge. The keeper subsequently authorized packaging this work into a PR.

Before a paid pilot: resolve the output-contract question with BiX and agree the
specific attempt and spend limit. The durable invocation now binds URL, method
and body to its retained identity. On uncertain delivery, retain/reconcile the
original attempt rather than launch a replacement.
The public purchase dispatcher must not receive this option until its input
validation, purchase digest and recovery identity all carry the same request.

No deployment, paid BiX attempt or additional outreach was performed for this
implementation.

## PR preparation, September 28

The isolated branch was advanced to main `12653aed` before preparing the PR;
the pilot changes applied without conflicts. The September 24 follow-through
and September 28 unpaid-check evidence folders are included in this review
package. Earlier captured source revisions and sent messages remain historical
records, not claims about the refreshed checkout.

Type checking and the build dry runs passed on this combined tree. Re-running
the evidence analyzer reproduced `analysis.json` without a difference. The
partner records were checked for quoted notification links and credential
tokens before staging; the original working checkout was left untouched.

The full local suite (`npm test -- --maxWorkers=2`, with a JSON reporter)
completed with exit 0: **15,719 passed, zero failed, one existing skipped test,
843 files passed**. The skipped case is the unchanged false-flag wording case
in `test/key-continuity.spec.ts`; this work introduced no skip. The full run
includes both new pilot suites and supersedes the earlier focused-run caveat
for this combined tree. Required CI checks still gate any merge.
