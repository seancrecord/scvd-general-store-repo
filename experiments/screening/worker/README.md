# Isolated screening Worker — qualification implementation

This Worker has not been deployed. Its public HTTP handler always returns
404, and its provider/policy configuration is empty by default. It is not a
paid product, does not sign observations, and has no settlement hooks.

## What is implemented

`rpc-reader.ts` is a runnable HTTPS JSON-RPC adapter for the existing Base
oracle. It imports the source chain and pure oracle wire helpers from the
store. Configuration supplies exactly two distinct provider/operator/budget
labels and HTTPS endpoints; it never imports the payout ladder or discovers
provider credentials from another configuration. Labels and different hostnames
do not themselves prove independent accounts or quota reservations.

Durable admission precedes all network work. Each provider supplies its chain
handshake and safe head. The reader selects the lower head and follows the
higher head's parent hashes to the same block, within an explicit ancestry
limit. Every parent must match the requested hash, preceding height and time
order. Both witnesses then call the exact oracle/calldata with
`{blockHash, requireCanonical:true}`. A hash, parent, timestamp or answer
disagreement is unavailable. There is no third provider, retry or latest fallback.

The pair runs concurrently where possible under one deadline, including
admission. Responses are streamed under a byte cap, redirects are refused,
and JSON-RPC envelopes/ABI booleans are checked strictly. Reports retain public
block evidence, raw booleans, witness labels and attempted method/credit/byte
counts. They omit URLs and provider error text. The record is an unsigned
observation of provider responses, not an independently verified state proof.
Selector support and actual hosted-account behavior still require qualification.

Maximum reserved units per provider are derived by `allowance()` from its
configured method weights: handshake, safe-head read, maximum parent walk,
and oracle call. Each actual attempt checks that allowance before I/O. The
weights are configuration, not verified provider billing. Unused credits are
conservatively retained after success/failure; there is no credit refund loop.

## Durable coordination and recovery

`BudgetStore` uses a SQLite-backed Durable Object. Pair credits, free/paid
request limits, caller counts and active leases are reserved in a synchronous
transaction, then confirmed durable before the reader starts network work.
The internal `ScreeningReader` always routes to the same provider-pair object;
callers cannot choose a fresh object or a new policy version to reset capacity.
The persisted policy must match configuration exactly. Changing limits or
provider definitions needs a reviewed migration, not an automatic reset.

Free traffic preserves paid credits, concurrent slots and caller-entry space.
Reservation IDs are deduplicated while active and for their accounting window;
this is not the store's paid-delivery idempotency contract. Completed entries
are removed at rollover; active entries survive. Spending/caller accounting
resets by the configured window, while active concurrency never does.

Completion uses a separate random lease token and is idempotent. A deadline
aborts transport but releases its slot only after pending operations finish.
Late admission is released without starting RPC. `waitUntil` carries cleanup;
cleanup failure conservatively leaves the lease active. Reconstructing the
object preserves reservations and credits. A crash or lost completion can
therefore strand capacity: this increment deliberately does not expire leases
by time or automatically erase them after restart. `RECOVERY.md` now specifies
the implemented private operator review: durable admission hold, current
revision, both-provider/executor evidence references, atomic slot release and
retained audit receipt. It records an operator attestation, not machine-verified
termination. Private document retention now binds bounded immutable UTF-8
materials to the exact case, hashes their bytes and checks them at approval.
The unmounted `../operator/` gateway now reuses the existing administrator
login and includes a local review UI with explicit evidence selection,
confirmation and exact retries after inspection. Production mounting/binding
and UI qualification, independent backup/retention policy and deployed alert
integration remain launch work. Local attention readings and the unscheduled
monitor adapter are implemented; see `OPERATIONS.md`. There is no public reset method. Tests reconstruct against real local SQLite;
they do not prove cloud failover or production provider cancellation behavior.

## Configuration and access boundary

`SCREENING_BUDGET_POLICY` is the budget policy JSON; `SCREENING_READER_POLICY`
is the reader policy JSON. `SCREENING_PROVIDERS` holds the two provider entries,
including authenticated URLs, and must be provisioned as a secret when used.
No credentials are included here. `worker-configuration.d.ts` is generated
from the isolated Wrangler configuration. The installed runtime supports
compatibility date August 22, 2026; this Worker pins that tested date.

`ScreeningReader.observe` is an internal service entrypoint. Its service caller
is trusted to select the tier, opaque caller ID and unique request ID. Public
paid-tier authorization, caller-identity policy, signed retention/recovery and
settlement are not implemented. No production service binding points here.
The shared budget object and provider account limits remain separate boundaries.

`ScreeningRecovery` is a separate private entrypoint for the operator service.
The reader exposes no recovery method. Both entrypoints use the same fixed
provider-pair coordination identity; neither a caller nor a policy version
can select a fresh object to bypass an existing hold or budget.

## Local checks

From the repository root:

```sh
node_modules/.bin/tsc --noEmit -p experiments/screening/worker/tsconfig.json
node_modules/.bin/vitest run --config experiments/screening/worker/vitest.config.ts
node_modules/.bin/wrangler deploy --dry-run --config experiments/screening/worker/wrangler.jsonc --outdir .build-check
```

The Workers tests require a local loopback test server. Fixtures use synthetic
URLs and injected responses, with the real local Durable Object storage API.
`fixtures.ts` contains test allowances, not proposed production prices/limits.
The original payout tests separately verify the pure helper extraction.

Two negative-control runs intentionally fail the original assertions without
editing source or installed packages:

```sh
SCVD_SCREENING_GUARD_MUTATION=agreement node_modules/.bin/vitest run --config experiments/screening/worker/vitest.mutation.config.ts -t 'refuses disagree'
SCVD_SCREENING_GUARD_MUTATION=reserve node_modules/.bin/vitest run --config experiments/screening/worker/vitest.mutation.config.ts -t 'serializes simultaneous'
```

Each must fail on its assertion, not on setup or runtime startup. The normal
configuration applies neither mutation. No new npm dependency is installed.

## Operational readings

`ScreeningMonitor.attention()` is a separate read-only service entrypoint on
the fixed budget object. It exposes timestamped operational conditions without
provider calls, document reads, lease tokens or recovery authority. The operator
gateway offers the same reading behind its existing gate. `OPERATIONS.md`
records the unscheduled alert adapter, remaining delivery/watchdog work and
independent backup/retention acceptance. None of those integrations is live.

## Private snapshot export

`ScreeningBackup` is a separately bindable private service for consistent
snapshot capture and bounded pages. It includes sensitive raw lease/caller
and evidence records, and is absent from buyer/recovery/monitoring interfaces.
One replaceable staging copy stays frozen across live state changes. Offline
restore creates a quarantined SQLite archive with no live budget tables or
activation method. `../backup/README.md` documents the manifest trust boundary,
plaintext-output limit and remaining independent encrypted-storage gates.

The offline age seal/copy-check/open tools now have synthetic qualification;
`../backup/ENCRYPTED_CUSTODY.md` records their private working-file requirements
and current custody status. The private B2 destination and dedicated key now
exist; a synthetic encrypted sample completed authenticated B2 API readback
and exact five-row recovery September 13 using a scoped one-day credential.
No operational state transfer or automatic backup occurred.

## September 13 — host collector ready for deployment qualification

The private snapshot connection, host collector, B2 adapter and one-run/freshness
CLI now have local tests. They are not mounted or scheduled. Source capture
remains on the separate backup authority, and no recovery/admission operation
is available to the collector. Unknown upload outcomes keep the pending snapshot
frozen. [Host collector operations](../backup/HOST_COLLECTOR.md) records the
credential contract, storage cap, crash handling, proposed cadence and remaining
source/deployment/independent-monitor gates. The earlier manual B2 recovery test
remains the only live transfer qualification.
