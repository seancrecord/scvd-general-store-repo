# Screening operator review — local qualification

The authenticated gateway and browser review UI are implemented and locally
tested. Neither is mounted on the production store; no service binding is
configured. The UI reuses the existing login. The qualification Worker's
public HTTP handler still returns 404.

## Access boundary

The gateway reuses `src/lib/admin-auth.ts`, extracted without policy changes
from the existing admin router. Username, Basic authentication, per-address
throttling, failed-login reporting and successful-login clearing are shared.
The admin router re-exports its existing threshold names for compatibility.
Do not copy the password into a new account or add a second identity source.

Construction requires explicit `enabled: true` and a trusted function that
returns the private `ScreeningRecovery` service binding from deployment
configuration. The default factory is disabled. Missing administrator secret,
missing binding or a request outside the configured HTTPS store origin closes
the gateway. Binding lookup occurs after successful authentication. The
request cannot select a service, provider pair, budget or operator identity.
The gateway has no buyer-tier or outbound-payment operation.

Each action sets `operator` to the same `ADMIN_USERNAME` used by the login.
Client-supplied operator fields and unknown top-level fields are refused.
The private service remains authoritative for nested document/reference
validation, current revisions, evidence freshness and exact reservation state.
Authentication establishes which administrator acts; it does not prove that a
human reviewed evidence or that a provider's assertions are true.

## Reads and actions

Paths derive from `OPERATOR_PATH` in `gateway.ts`, currently under
`/admin/screening`. The gateway provides:

- `GET` at the base path and `GET /client.js`: authenticated HTML and browser
  module, behind the same gate as every private read.
- `GET /contract`: authenticated operator label, exact `RECOVERY_ACK`, recovery,
  evidence and upload limits, and action header/value. The UI reads these
  rather than duplicating the server constants.
- `GET /attention`: timestamped operational conditions and pair capacity.
  It is read-only and does not establish provider health or work termination.
- `GET /overview` and `GET /history?after=…`: current reservations and bounded
  audit pages. Invalid, duplicate or unknown history parameters are refused.
- `GET /cases/:caseId`, `/cases/:caseId/evidence`, and
  `/cases/:caseId/evidence/:reference`: review, metadata list and one private
  document respectively. Evidence content remains untrusted JSON data.
- `POST /begin`, `/evidence`, `/commit`, `/cancel`: the corresponding private
  service operation, using its input shape **without** the operator field.

Mutations require an exact matching `Origin`, the action header/value from
`OPERATOR_ACTION_HEADER` and `OPERATOR_ACTION_VALUE`, and JSON content type.
A command-line client must provide the same context explicitly. Contradictory
or cross-site fetch metadata is rejected, including same-site sibling origins.
No form submission, cross-origin CORS permission or method override is offered.
Credentials still must pass the shared login gate. The recovery acknowledgement
must be supplied by the caller; the server never fills in consent on its behalf.

Uploads are counted while streaming, with a deadline and cancellation on
failure. `OPERATOR_LIMITS` derives its byte bound from the evidence limit plus
JSON escaping and envelope allowance. A false or absent Content-Length cannot
bypass the actual-byte check. Invalid UTF-8/JSON is refused. These are testable
bounds, not a claim that Basic authentication alone prevents every resource
exhaustion attack. Do not put provider URLs, secrets or private keys in uploads.

Every response, including authentication failures and private document reads,
carries no-store, nosniff and a restrictive content policy. The HTML uses a
fresh script/style nonce and allows connections only to its own origin.
Evidence renders through plain text nodes, never HTML. Service exceptions
return fixed unavailable prose. A reported unavailable action may have committed before a
response was lost: inspect and retry the exact original operation as described
in `../worker/RECOVERY.md`; do not create a fresh decision to hide uncertainty.

## Browser review workflow

Choose the exact active reservations and explicitly hold admissions. Read the
case, its revision and still-active targets before uploading current, redacted
executor/provider documents. Supply their actual UTC observation times; the
UI does not substitute the upload time for when a claim was observed. Uploads
retain immutable references and clear prior confirmation.

Read each retained document and explicitly select it for its role. The browser
recomputes its SHA-256 digest before displaying it and checks the returned
case, role, scope and timestamp against metadata. This verifies byte identity,
not authorship or the truth of a termination claim. Approval requires every
required role, fresh evidence, unchanged targets and a separate confirmation
of the exact server acknowledgement. Cancel has its own confirmation; the two
choices cannot be checked together. The server rechecks the revision and all
evidence when recording a decision.

The “Reload current state” button clears confirmation and document selections.
There is no automatic approval, polling, retry or adoption of a newer revision.
An uncertain action response freezes its original body and pauses other
mutations. Use that reload button to inspect the stored case; only then can
an explicit retry send the identical original body. Setting an attempt aside
requires an inspected open case and clears all consent. Successful recovery
keeps the final case and receipt visible even after admissions reopen.

The pending body exists only in this tab's memory. Closing or fully reloading
the page loses it; a browser leave warning is provided, not durable retention.
Use the in-page reload during uncertainty. If that memory is lost, inspect the
stored case/history through the runbook before making another decision. Reads
that cannot load the case keep retry disabled; no missing or unreadable case
is treated as permission to release capacity. Documents remain in the private
store; they are not saved in browser storage.

`client.txt` is the actual JavaScript module, served unchanged and imported by
Node tests. A narrowly scoped Wrangler Text rule bundles only this file where
it is imported. It introduces no dependency. Reads run concurrently where
independent, fetch and body parsing share a bounded deadline, and history is
loaded on demand. These choices make no claim about production p95.

## Integration still required

Mount the gateway in the existing store/admin host with its existing secret
and counter namespace, and bind only the private recovery entrypoint. Keep it
out of the buyer and public-discovery surfaces. Mount this router once: it
already applies the shared authentication gate; nesting it under another copy
would compare credentials and update counters twice. No mount or binding is
added by this qualification code.

Before activating recovery, qualify the UI on its deployed authenticated host
and binding, qualify real provider/executor evidence, and establish independent
backup, retention policy and operational alerts.
The service's revision check is the final defense against a review changing
between display and action. The UI must handle a refusal by showing the new
state; it must not automatically adopt a new revision and resubmit consent.

The existing per-address login throttle and failed-login reporting are reused;
they are not a new account-wide rate limiter. Screening hold/capacity alerts
now have locally tested readings and a monitor adapter; deployed scheduling,
channel delivery and independent monitor freshness checks remain open. No production latency claim, deployed login, real
recovery, provider qualification or notification was exercised here. No npm
verify/sign/CLI/Tab release is required for this internal operator UI.

## Local evidence

`test/screening-operator.spec.ts` checks authentication, throttling, identity,
origin/context guards, bounded uploads, private response headers and the absent
production mount. Existing admin throttle/navigation tests cover the extraction.
`../worker/operator.spec.ts` carries an authenticated request through the real
local SQLite recovery store, retaining evidence and replaying a decision while
preserving spent credits. This does not test a deployed service binding.

The normal checks are root typecheck and those three store test files, plus the
isolated Worker suite/typecheck from `../worker/README.md`. Negative controls
remove one guard only in a test build; the original assertion must fail:

```sh
SCVD_OPERATOR_GUARD_MUTATION=authentication node_modules/.bin/vitest run --config experiments/screening/operator/vitest.mutation.config.ts test/screening-operator.spec.ts -t 'every read and action requires the existing admin login'
SCVD_OPERATOR_GUARD_MUTATION=upload_limit node_modules/.bin/vitest run --config experiments/screening/operator/vitest.mutation.config.ts test/screening-operator.spec.ts -t 'completed oversized JSON is refused before parsing'
```

The browser controller tests load those same served bytes:

```sh
node --test experiments/screening/operator/client.test.mjs
SCVD_REVIEW_UI_MUTATION=ack node --test --test-name-pattern='approval needs every document' experiments/screening/operator/client.test.mjs
SCVD_REVIEW_UI_MUTATION=retry node --test --test-name-pattern='explicit retry after inspection preserves' experiments/screening/operator/client.test.mjs
```

The latter two commands must fail the original assertion. Local Chrome
walkthroughs additionally exercised the rendered UI against a loopback-only
synthetic API: literal evidence, fresh confirmation, an uncertain successful
response, inspection and exact replay. They do not establish deployed Basic
authentication, provider termination or a real service binding. Results are in
`../../../research/qualification-2026-09-11/review-ui/validation.json`.

## Operational attention

The UI loads a dated attention reading alongside the review state. A missing
or stale reading is shown as unavailable, and does not manufacture consent or
block an otherwise valid case review. `monitor.ts` supplies the unscheduled
adapter to the existing deduplicated alert channel. Its service binding should
use the separate read-only `ScreeningMonitor` entrypoint. No email or schedule
is activated here. Conditions, capacity limits, monitor failure visibility and
independent backup acceptance are in `../worker/OPERATIONS.md`.

Private backup/export has a separate service authority; this gateway and its
review UI expose no backup routes or raw lease tokens. Local snapshot and
offline restore verification are in `../backup/README.md`. Selecting encrypted
independent storage and qualifying live collection remain separate work.

The offline age seal/copy-check/open tools now have synthetic qualification;
`../backup/ENCRYPTED_CUSTODY.md` records their private working-file requirements
and pending independent-account/recovery-key choices. No live transfer occurred.

## September 13 — host collector ready for deployment qualification

The private snapshot connection, host collector, B2 adapter and one-run/freshness
CLI now have local tests. They are not mounted or scheduled. Source capture
remains on the separate backup authority, and no recovery/admission operation
is available to the collector. Unknown upload outcomes keep the pending snapshot
frozen. [Host collector operations](../backup/HOST_COLLECTOR.md) records the
credential contract, storage cap, crash handling, proposed cadence and remaining
source/deployment/independent-monitor gates. The earlier manual B2 recovery test
remains the only live transfer qualification.
