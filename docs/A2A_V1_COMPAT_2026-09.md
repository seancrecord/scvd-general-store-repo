# A2A v1 over the existing evidence tasks

September 16, 2026. TR2 implementation in `codex/a2a-v1-compat`, based on
`origin/main` at `6d29feb5`. Locally verified; not committed, merged or deployed.

The buyer should be able to delegate a preflight, receipt check or readiness
lookup through an ordinary A2A client and retrieve the evidence it returned.
A v1-looking card above a 0.3-only endpoint could not provide that. The build
adds a v1 binding over the same evidence handlers and retained task records.
It does not add another verification engine or paid product.

## The compatibility contract

`A2A-Version: 1.0` selects v1 on `/a2a` and each of the three card aliases.
A missing or empty header selects 0.3, as the versioned specification requires.
Explicit `0.3` works too; patch components are ignored. Unsupported versions
return `VersionNotSupported` (`-32009`), without running a task. The response
names its selected version, and card/document responses vary on that header.
Query-string version negotiation is not implemented.

The v1 card prefers JSON-RPC 1.0 and lists the explicitly supported JSON-RPC
0.3 interface at the same URL. It contains v1 fields only. The legacy card
keeps the 0.3 shape and existing ownership proof. Neither card represents MCP
or x402 as A2A bindings. MCP and paid checkout retain their own discovery doors.

| Operation | v1 | Legacy 0.3 |
| --- | --- | --- |
| Execute | `SendMessage` → `{ task: Task }` | `message/send` → `Task` |
| Retrieve | `GetTask` → `Task` | `tasks/get` → `Task` |
| Cancel terminal task | `CancelTask` → `-32002` | `tasks/cancel` → `-32002` |
| Message role | `ROLE_USER` | `user`, with `kind: message` |
| JSON part | `{ data: {...} }` | `{ kind: data, data: {...} }` |
| Completed state | `TASK_STATE_COMPLETED` | `completed` |

Both dialects return exactly the same evidence content and task identity.
Storage remains an immutable, expiring result, persisted before success is
returned. The task ID grants retrieval access. Request history is not stored.
A context ID inconsistent with an existing task is rejected; terminal tasks
cannot restart. Signature validity still does not establish settlement or
delivery. A free preflight still produces an unsigned reading.

The supported inbound task contract is one JSON object in a data part, or
one text part containing that object, from a user-role message. The v1 adapter
checks envelope, message, part and configuration shape before invoking the
existing handler. It refuses ambiguous parts, mixed dialects, invalid history
limits, incompatible output modes and unsupported capabilities explicitly.
V1 structured errors use typed `Any` objects instead of legacy arbitrary data.

No streaming, push, async execution, task enumeration, tenant routing,
extended cards or conversational continuation is implemented. This is a
bounded task binding, not a claim of full A2A certification. In particular,
`ListTasks` is explicitly refused: there is no task-listing product, and task
IDs remain the retrieval boundary. These limits are published by `GET /a2a`.

## Independent evidence and regressions

The pinned authoritative definition is the official `v1.0.0` proto retained
under `research/a2a-v1-2026-09-16/`. The independent test client is the official
`@a2a-js/sdk@1.1.0`, pinned as a **development dependency** with legacy
compatibility disabled. No SDK dependency is imported by the Worker runtime.
The small adapter is deliberately called a bounded parser, not a regenerated
or official v1 schema validator.

The corrected regression harness was run against the original source, then
the implementation was restored byte-for-byte. It failed on card negotiation,
unsupported versions, method names and message/result behavior. The separate browser
regression demonstrated a 405 preflight response. Failure logs are retained.
The replacement tests remove the old expectation that mixing v1 fields into
a 0.3 card counts as v1 support.

Validation retained in the research directory:

- 144 focused Worker tests passed across ten files: v1, legacy cards and
  lifecycle, the paid audit instrument, storage, browser access, MCP discovery
  and served-document guards.
- The official client exercised discovery, task creation and retrieval
  through the full Worker. A controlled public 402 used the real `/a2a` route
  in the test isolate so only its outbound network response could be mocked;
  the test counted one unpaid probe and preserved the reading's limits.
- A standalone Node process used the official client over local HTTPS:
  all three tasks, exact retrieval and expected terminal cancellation errors.
  Its preflight case deliberately checked private-target refusal; its receipt
  case used the repository's public signature fixture. The raw exchanges are
  in `native-client.json`.
- Typecheck, the full repository dry-run bundle check, frozen legacy validator
  freshness, and the existing legacy live-checker tests passed.

The generated 0.3 validator and paid `a2a-instrument` source are unchanged.
Existing paid repair-kit artifacts are not reinterpreted as v1 audits. The
whole application test suite was not run; full CI remains an integration gate.

## Reproduce and integrate

Run `npm ci`, `npm run a2a:check`, `npx vitest run test/cors-discovery.spec.ts`,
`npm run typecheck` and `npm run build:check`. The latter is a dry run.

`npm run a2a:v1:live -- https://YOUR-EXPLICIT-TARGET` performs free evidence
operations through the official client. There is no default production target.
The runner refuses an advertised endpoint on another origin and supplies no
payment. A local run must use HTTPS because the store redirects plain HTTP;
trust its explicit local test certificate rather than disabling TLS checks.

Integration order:

1. Review and integrate this isolated branch alongside TR1, then run required
   full CI before any merge/deploy action is approved.
2. After deployment, retain independent-client exchanges against the public
   card and task endpoint. Until then, **externally observed = unverified**.
3. Re-run the cold-buyer scenario through a public A2A discovery lane. Give
   the stranger its ordinary buyer task, not a hidden card URL or tool hint.
   Preserve discovery misses and incorrect evidence interpretations. This
   directed protocol smoke does not count as a cold-stranger pass.
4. Continue TR3 with the failures observed by TR1, including the missing
   candidate skill page and the distinction between preflight readiness and
   evidence sufficient for a spending decision.

No production change, purchase, registry submission or paid stranger run was
performed. **Implemented: locally verified. Usable by a stranger: unverified.**
The governing takeoff test remains discovery → appropriate use before spending
→ useful evidence → independent verification, without SCVD-specific coaching.

## Sources

- [Pinned A2A v1.0.0 specification](https://a2a-protocol.org/v1.0.0/specification/),
  especially version negotiation, JSON-RPC bindings, field naming and errors.
- [Official v1.0.0 proto](https://raw.githubusercontent.com/a2aproject/A2A/v1.0.0/specification/a2a.proto).
- [Official JavaScript SDK](https://github.com/a2aproject/a2a-js), with the exact
  installed client and integrity pin recorded in `package-lock.json`.

## September 17 merge gate

Reconciled onto `c3b3befc`, the standalone slice passed the full application
suite: 751 files, 14557 tests and one existing skip. Typecheck, dry-run
builds and generated legacy-runner checks passed. [Dated validation](../research/a2a-v1-2026-09-16/merge-validation-2026-09-17.json).
Final stacked-head CI remains the merge gate; the earlier local-only protocol
observations do not establish a deployed or cold-stranger pass.

## September 17 public protocol qualification

Merged in [PR #764](https://github.com/seancrecord/scvd-general-store-repo/pull/764)
after all PR gates passed. At 15:08 UTC the official v1 client completed the
three free task/lifecycle cases against `https://scvd.store`: private-target
refusal, receipt verification and unknown-endpoint readiness. Every task was
retrievable and terminal cancellation was refused. [Exact exchanges](../research/a2a-v1-2026-09-16/postmerge-2026-09-17-live.json).

The existing [legacy checker](../research/a2a-v1-2026-09-16/postmerge-2026-09-17-legacy.json)
also passed against production, covering the unversioned 0.3 cards and a free
readiness task, retrieval and malformed requests. These are directed protocol
observations, not cold discovery, signed-evidence acquisition, paid delivery or
comprehensive certification. Cold-stranger qualification remains open.
