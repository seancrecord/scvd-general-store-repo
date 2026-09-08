# A2A live compliance check — 2026-09-06

Read on September 6 in America/New_York; raw timestamps are September 7
UTC. This is an unsigned operational reading of our own public endpoint.
No payment, deployment, outreach or third-party agent task was performed.

## Repair follow-through — merged and deployed 2026-09-07

The keeper asked how to close the gaps in the same sitting. The repair is
on `codex/a2a-compliance`; the original live readings below remain unchanged.

- Request validation is generated from the official 0.3.0 schema; malformed
  parts, missing message fields and invalid task-query shapes are JSON-RPC
  refusals. The advertised version derives from the schema's version default.
- Both completed and failed Tasks carry contextId. A caller's message context
  is preserved; otherwise the server generates one.
- One Durable Object per task holds its result for 24 hours. The result and
  cleanup alarm commit together before a successful response. Retrieval
  checks expiry independently of cleanup. Known terminal cancellation returns
  -32002; an unknown/expired ID returns -32001; unavailable storage is -32603.
  The returned metadata states expiresAt. No input message or history is held;
  the result may contain the underlying instrument's observed inputs.
- Requests are bounded while streaming, and retained results have a byte cap.
  The live values are on GET /a2a. Task IDs grant access to results; that fact
  and retention appear on the card, the task document and /privacy.
- Streaming, push, incompatible output modes and attempts to restart terminal
  tasks are refused explicitly. Streaming and push remain declared off.

`npm run a2a:check` is a named CI step: it verifies generated validators,
checks the live gate against good and captured-bad fixtures, then exercises
the Worker and storage. Restoring only the old handlers with a targeted git
stash made 17 tests fail; the fixes were restored afterwards. The original
schema's rejection of the captured successful Task is itself a regression
fixture, so a more permissive schema cannot quietly erase the defect.

Validation after the repair: the 31 Worker/storage tests and four live-gate
fixture tests pass; the 83 related card, guide and discovery-surface tests
pass; typecheck and both Worker deployment dry runs pass. The full suite
completed with 562 files passing and 15 failing (5,513 tests passed, 179
failed, one skipped). All failing files are the separate buyer-audit specs
that were already untracked when this work started. A representative failure,
`buyer-boundary-optional.spec.ts`'s invalid-callback case, also fails in an
isolated copy of unchanged HEAD with that same test. This establishes that
failure predates the repair; it does not assert that every buyer-audit
failure was independently reproduced. The full suite is not green.

Release validation after updating the branch to main `d108b861`: a clean
copy of exactly the staged PR contents passes the full suite (564 files,
5,727 tests passed, one skipped), typecheck, the A2A gate, both Worker
builds, the scalability audit and the claims register. The unrelated
untracked buyer-audit experiments were not copied into that release check.

Main then advanced to `9031884c` during validation. The integration preserves
both specification-read entries and passes 565 tracked test files (5,748
tests passed, one skipped), typecheck, both builds and the remaining local
CI commands. Only the exact untracked buyer-experiment paths were excluded.
The Linux-specific startup script also passes with the installed Mac binary
substituted in a temporary copy; the repository script remains unchanged.

The keeper forwarded the store's null-kind alert at 00:20:58.409 UTC.
The saved `scvd-audit-null-part` request began at 00:20:58.396 UTC, 13 ms
earlier, tying that alert to this audit's intentional malformed-input probe.

`npm run a2a:live` is the post-deployment gate. It checks the three card URLs,
one successful free readiness task, exact retrieval, terminal cancellation,
unknown ID and malformed parts; exit 1 on a failure or incomplete run. It
will not follow a card to another origin's task endpoint. It is not scheduled.
Running it before deployment on 2026-09-07 00:32 UTC failed exactly the five
expected checks; `research/a2a-2026-09-06/predeploy-gate.json` is that record.

Deploy through the normal reviewed release, including the new
`v3-a2a-tasks` SQLite migration. Like the existing recovery migration, it
requires a deployment, not a version upload alone.

During PR #556, a preview upload of the tested bundle reproduced error
10211: Cloudflare requires the Durable Object migration to be applied by
a non-versioned deployment. No preview version or production deployment
was created by that diagnostic attempt.

After deployment, run:

```sh
npm run a2a:live -- --out=/tmp/scvd-a2a-postdeploy.json
npx --yes @a2a-compliance/cli@0.3.3 run https://scvd.store --json
```

The official-schema/lifecycle gate must pass; the external CLI remains an
additional reading with the limits documented below. No result here claims
that production is repaired before those deployment and live-check steps.

## Result

The published CLI passes its mandatory gate. The live endpoint does **not**
yet meet the declared A2A 0.3.0 contract. Both statements have evidence:

- `@a2a-compliance/cli@0.3.3 run https://scvd.store --json`: exit 0,
  `MANDATORY`, 16 pass / 20 checks, 0 fail, 3 warn, 1 skip.
- The separate `card` command: exit 0, 6 pass / 6, `FULL_FEATURED`.
  That is the card-only grade, not a grade of the task endpoint.
- All three published cards (`/.well-known/a2a.json`,
  `/.well-known/agent-card.json`, `/.well-known/agent.json`) answer with
  the same card. The first two pass the official 0.3.0 structural schema;
  the third was compared equal to the canonical card. `/a2a.json` is 404;
  it is not a published alias in the router and is not required by A2A.
- A valid `message/send` for `get_endpoint_readiness` returns a completed
  Task, but omits required `contextId`. The official schema rejects it.
  The checker's Task schema accepts it because its contextId is optional.
- `tasks/get` on that exact new Task ID immediately returns `-32001`.
  `tasks/cancel` on it does the same. The implementation deliberately
  retains no task state, while A2A 0.3.0 §11.1.2 requires retrieval and
  cancellation. Unknown-ID rejection alone does not test that lifecycle.
- A request containing `message.parts: [null]` returns HTTP 500 with the
  store's generic error body, not a JSON-RPC invalid-params error.
  `dataPartOf` indexes the null value after a type assertion.

The corresponding source is `src/services/a2a-evidence.ts`; the route is
`src/routes/a2a.ts`. Existing tests cover unknown task IDs, not retrieval
of a task just created at audit time. The local repair is described above;
repair acceptance belongs on ROADMAP, not the keeper desk.

## The checker has limits of its own

The npm registry resolved CLI, core and schemas to 0.3.3. They were installed
in a temporary directory with lifecycle scripts disabled. Runtime: Node
24.19.0. The dependency lock with registry integrity hashes is retained.

The published core recognizes only exact strings `0.3` and `1.0`, warns
on our valid `0.3.0`, and labels its fallback `1.0`. Its mapping calls
`tasks/send` 0.3 and `message/send` 1.0. The official 0.3.0 specification
uses `message/send`. Do not change our declared version to quiet this.
The current GitHub README describes newer version-aware behavior than
this npm build implements; pin the executable, not the README's claims.

Its other warnings are a generic send probe refused with `-32602` and
streaming disabled (`-32601`). Its generic send did not obtain a successful
Task. Push is skipped because our card declares it off. No authentication
checks appear for the unauthenticated card. The exit code treats a MUST
warning as non-failing. A zero exit is therefore insufficient as our CI gate.

The CLI always discovers `/.well-known/agent-card.json` from the origin,
even if given an alias URL. Alias verification above used direct GETs and
schema validation, not repeated CLI calls pretending to check each alias.

## Reproduce and evidence

On a supported Node runtime:

```sh
npx --yes @a2a-compliance/cli@0.3.3 run https://scvd.store --json
npx --yes @a2a-compliance/cli@0.3.3 card https://scvd.store --json
curl -sS https://scvd.store/a2a -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"a2a-audit","parts":[{"kind":"data","data":{"task":"get_endpoint_readiness","host":"a2a-audit.invalid"}}]}}}'
```

Validate the result against the official `Task` definition, then send
`tasks/get` and `tasks/cancel` with `params.id` equal to that result's ID.
For the malformed-input case, replace the message's parts with `[null]`.

Raw reports, exact requests/responses, the official schema and package lock
are in `research/a2a-2026-09-06/`. Official structural validation used Ajv
with formats disabled; this was not a comprehensive format, security,
authentication, multi-transport or A2A 1.0 audit. The schema SHA-256 is in
`live-probes.json`. This snapshot says nothing about a later deployment.

## Does the desk extend here?

Yes, as an A2A battery under the existing L11 cross-protocol desk.
This is desk reasoning prompted by the keeper, not observed paid demand.
Start with fetched cards and declared endpoint facts; return dated,
signed checks with the exact protocol and instrument versions, request
and response digests, criteria, per-check outcomes and gaps. Keep card
validity, live method behavior and task lifecycle distinct. Preserve the
x402 verdict's meaning. No operator rankings or blanket compliance badge.

Active `message/send`, cancellation and push-configuration probes can do
work on another agent. They need a named operator-authorized fixture and
bounded plan; a public card is not evidence that arbitrary tasks are free
or read-only. Card URLs need the existing public-target safeguards,
redirect/DNS checks, timeouts and byte caps. The Node CLI's suitability as
a hosted Workers dependency has not been tested.

Reuse an external instrument only after checking its version mapping and
schema strictness against official fixtures. Our successful-task failure
is a useful negative control: a future gate must fail on these captured
bytes before we trust its pass. The official TCK and Inspector remain
follow-up tools; neither was executed in this audit.

## Source correction

The README's near-zero claim links to
[A2A issue #1755](https://github.com/a2aproject/A2A/issues/1755), opened
April 15, 2026 by `baronsengir007`, disclosed as an OpenClaw autonomous
research agent. It reports 50 advertised agents, about 0–2 valid cards,
and zero successful `tasks/send` calls. This is an issue author's sample,
not established as a protocol-maintainer statement or an ecosystem-wide
rate. The raw experiment was not independently reproduced, and a legacy
method failure alone does not establish noncompliance with every version.

Primary reads: [official 0.3.0 specification](https://a2a-protocol.org/v0.3.0/specification/)
§§5, 6.1, 7.3–7.4 and 11.1.2;
[versioned schema](https://raw.githubusercontent.com/a2aproject/A2A/v0.3.0/specification/json/a2a.json);
[checker README](https://github.com/UltraSkye/a2a-compliance), plus the
installed package source. Recorded in `docs/SPEC_READS.md` per rule 61.


### Release follow-through, 2026-09-07

PR #556 merged as `d99d8ccb4589b78f63c1909c1cad938365ccd37e`; both
production builds completed. The live gate passed 14/14 at
2026-09-07T02:15:52Z. The pinned external CLI also exited zero. Earlier
references to a pending deployment describe the pre-release state.
The customer-facing extension is now the separate authorized pilot in
`docs/A2A_REPAIR_KIT_2026-09-07.md`.
