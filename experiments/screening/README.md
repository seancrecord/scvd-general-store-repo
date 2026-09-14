# Bounded oracle protocol probe

This is a keyless research instrument, not the screening product reader.
It reads the existing oracle deployment/selector and Base chain identifier
from source, and allows only the existing official public Base endpoint.
It never loads Worker secrets or product/payout provider configuration.

Run from the repository root:

```sh
node --test experiments/screening/provider-probe.test.mjs
node experiments/screening/provider-probe.mjs <new-result.json>
```

At most seven sequential read requests: chain handshake, latest/safe/finalized
blocks, hash-selected safe/finalized zero-address calls, and an unknown-hash
call. Each request has a five-second timeout and a 256 KiB response cap;
there are no redirects, retries, transactions or automatic fallbacks. The
instrument stops on an unsuccessful chain handshake. Results preserve
transport failures rather than interpreting them as unsupported capability.

Even an entirely successful sample reports `qualified_for_product: false`.
It cannot establish historical state correctness with a changing known
answer, noncanonical-block rejection, two-provider agreement, independent
quotas, terms or a latency distribution. The September 11 report keeps the
sandbox transport failure and the subsequent network-enabled sample separate.

## Provider protocol qualification harness

`qualify-provider.mjs` exports `qualifyProvider({witnessId, rpc, fixture,
timeoutMs})`. The transport and independently established fixture are supplied
by the caller. It loads no endpoints, credentials or payout defaults. Run
all fixture tests from the repository root with:

```sh
node --test experiments/screening/*.test.mjs
```

The fixture names a chain, contract, calldata, historical hash/result,
known noncanonical hash/result and rejection code, and unknown hash/rejection
code. `qualify-provider.test.mjs` is the executable synthetic example. Six
bounded sequential requests establish the chain, a known historical answer,
a different latest answer, unknown-hash rejection, an accessible fork with
canonicality disabled and rejection of that same fork with it enabled.
No retries or selector fallback are allowed. Missing positive controls,
unsupported calls, ignored selectors and timeouts leave the cases failed.

An injected transport must honor AbortSignal, bound response bytes and avoid
redirects before it is used with a hosted account. The harness bounds waiting
and stops after failure; it cannot cancel a transport that ignores the signal.
Reports retain validated words and numeric error codes, never provider error
messages or authenticated URLs. Fixture inputs must contain public data only.

Passing sets `protocol_cases_passed`, never `qualified_for_product`. Fixture
provenance, the actual Base oracle deployment/ABI, safe-head age and retention,
the fixed two-provider agreement policy, isolated quotas, admission/load
limits and source/RPC terms still need their own evidence. A controlled-node
fixture pass does not qualify a hosted provider account.

## Two-witness agreement and admission model

`pair-policy.mjs` adds `createFixtureBudget` and `createFixturePairReader`.
The test file supplies a synthetic chain, contract and method: it does not
duplicate or qualify the live Base deployment. The reader pins one input
block and exactly two configured witnesses before starting them concurrently.
Both completed receipts must bind the same chain, contract, calldata and
block, claim canonical safe coverage, and carry identical strict ABI booleans.
Disagreement, missing evidence, stale/future blocks and timeout return
unavailable. There is no third witness, retry, network fallback or payment hook.

This model accepts receipts from injected adapters; it does not itself
perform RPC handshakes, choose the safe block, establish ancestry or verify
the adapters' metadata. Those remain the live adapter's qualification work.
Success is always `observed_unsigned` with `production_ready: false`.

The budget reserves both providers' configured maximum observation credits
atomically before either adapter starts. It caps total/free request counts,
per-caller requests, caller storage, provider credits and concurrent reads.
Paid capacity has reserved credits and slots; free caller entries also cannot
consume the paid caller-entry allowance. Failed reads retain their credit
charge. A timeout aborts both adapters but does not release the slot until
both actually settle, even when one fails early. Window rollover resets
spending and caller entries while preserving outstanding concurrency;
clock reversal refuses admission. Tests inject both clock and timer behavior.

These are single-process, in-memory fixture budgets. Restart/multiple Worker
instances are not coordinated; provider hard caps, durable atomic admission,
authenticated paid-tier selection and stable caller identity are not built.
The configured credit cost is an assumed worst-case adapter allowance, not
a measured bill or an enforcement boundary inside an arbitrary callback.
Live transport must account for every head/identity/call request within it.
Distinct operator/account labels cannot prove independent real quotas.

The tests include guard-removal negative controls for agreement and the paid
credit reserve. Full screening fixture coverage runs with the command above.
The September 11 work record retains test names, counts and source hashes.

## Subsequent implementation: isolated Worker

`worker/README.md` documents the runnable RPC adapter and SQLite-backed
durable admission built after these fixture models. It includes bounded
safe-head ancestry reads, streamed JSON-RPC responses, paired allowances,
durable leases and internal service wiring. The isolated Worker is disabled
by empty configuration and its public handler returns 404. It has not been
deployed or qualified against authenticated provider accounts. The existing
payout gate now shares only the pure oracle helpers; its retry policy stays
separate. Use the Worker-specific commands for its runtime tests.
