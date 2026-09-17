# Catalogue-entry cohort — frozen September 17, 2026, not run

This directory freezes the next buyer cohort after the
[September 17 post-merge qualification](../takeoff-postmerge-2026-09-17/REPORT.md)
and records the instrument changes it depends on. **No model was launched.**
There are no cells, traces, reviews or scores here. The keeper asked to plan
and validate the instrument before spending more model usage; that is what
this is. The September 17 cohort is untouched and is not rescored.

## What changed in the instrument (schema 4)

Continuation item 1 from the [handoff](../takeoff-postmerge-2026-09-17/HANDOFF.md)
asked to qualify generic native-host capability before a new acquisition,
without widening permissions. Item 2 asked for a real catalogue-entry lane
that retains returned candidates, selection and subsequent use, reusing the
ward's observation vocabulary rather than adding another checker.

- **Host capability probe.** `node scripts/buyer-cold-isolated.mjs --capability plan.json --out DIR --run`
  launches one generic session per host with the cohort's exact adapter and
  budgets. It names no service. The host must keep the bytes of the frozen
  public URL unchanged under `./evidence/public.bin` and verify four
  runner-minted ed25519 signatures, a random subset of them tampered. The
  runner fetches the reference bytes itself first; a host is launched only
  when there is something independent to compare against. The score reads
  retained bytes against that fetch, the reported results against a truth
  the host never saw, and requires a completed local command in the trace.
  Refusals are recorded as host limits. A schema-4 cohort refuses to start
  without a probe frozen from the same plan bytes, and records every cell of
  a host that did not pass as `capability_unqualified`, in the denominator.
- **Prompts state the host's real tools.** The Claude adapter's allowlist
  (`curl`, `node`) and the sentence telling the buyer what it can run derive
  from one list, so the prompt cannot promise a refused command and cannot
  widen the allowlist. The allowlist itself is unchanged from September 17.
- **Catalogue lane.** The buyer is told to save each catalogue response it
  relies on and to name its selection. A discovery pass on that lane needs
  the retained candidate file (hash in the capture manifest), the query,
  the returned count, the selection and whether SCVD was returned. The
  score carries `catalogue_observation` as `found` / `not_returned` /
  `unchecked` with `complete: false`; one query and page is never a
  complete read, so `catalogue_absence` stays `unverified`. Details and
  commands: [instrument contract](../BUYER_COLD.md).

Twenty-two new offline controls cover these rules and were observed failing
before the implementation (`npm run buyer:test`, 113 checks in total).

## The frozen plan

[plan.json](plan.json), hash in [freeze.json](freeze.json). Same merchant
subject, budgets, 14-day historical window and zero spend as September 17.
Eight cells, two repetitions per host and lane:

| Lane | Entry | Why |
| --- | --- | --- |
| `catalogue` | `https://registry.modelcontextprotocol.io/v0.1/servers` | The one public catalogue where SCVD is an observed entry (`store.scvd/general-store`, 0.2.3). A catalogue URL is an entry; SCVD's own listing URL would be a referral and would exclude discovery. |
| `directed` | the public focused skill source, as on September 17 | Repeats the referral lane on both hosts after the instrument confound is addressed, as item 3 requires ("repeat both hosts twice after a fix"). |

The capability URL is a pinned, immutable public file that names no
service. It was read once from the implementation session (2,189 bytes,
hash in `freeze.json`); the runner re-reads it at probe time and records
any mismatch rather than correcting it. Two RFC hosts were tried first and
were unreachable from this session's egress policy; that says nothing about
the keeper's machine.

## Dated registry reading, operator side

[registry-reading-2026-09-17.json](registry-reading-2026-09-17.json) retains
four read-only queries against the official MCP registry, with the raw
responses under [observations/](observations/). This is an operator reading
from the implementation session, not a buyer run and not a ward round.

| Query | Count | Next cursor | SCVD among the names |
| --- | --- | --- | --- |
| `search=scvd&limit=5` | 5 (one name, five versions) | yes | yes |
| `search=x402&limit=50` | 50 (18 names) | yes | no |
| `search=verification&limit=50` | 43 (17 names) | none | no |
| default first page | 30 (19 names) | yes | no |

The registry orders by name and paginates, and its search appears to match
the server name rather than the description. A buyer that searches for the
task (`x402`, `verification`) rather than the store's name gets pages that
do not contain SCVD; the `verification` result set was complete for that
query. This is a bounded observation about four queries on one day. It
does not establish absence from the catalogue, and it is not a reason to
rename the server; it is the hypothesis the catalogue lane will test.

## Live probe results, web sandbox, September 17

The keeper asked whether the probe could run from the terminal. It can for
the Claude host: this session is Claude Code on the web with a signed-in
`claude` CLI, so the probe ran here twice, with the unchanged allowlist.
[probe-web-2026-09-17.json](probe-web-2026-09-17.json) is the public record:
both scores, every command with its outcome, the launch arguments and
environment keys, the vectors' truth, and the hash of every private file.

| Probe | Result | Tool events | Refused | What the host did |
| --- | --- | --- | --- | --- |
| first (`private/probe-web-2026-09-17`) | pass | 11 | two compound `curl … ; echo` commands | `curl -o` into `./evidence`, then `node` with `crypto.verify` over an SPKI-wrapped raw key; all four vectors right |
| second, corrected vectors (`private/probe-web-2026-09-17-b`) | pass | 6 | one `cat` heredoc redirect | same path, straight through; wrote the report with `node` after the heredoc was refused |

Codex is not installed in this sandbox and is recorded `unavailable`. The
first probe exposed a defect in the instrument: one shared message under
deterministic ed25519 made the valid signatures identical bytes, and the
tampered ones too. The instrument now mints one message per vector; the
second probe ran on the corrected collector, whose hashes the record carries.
The first probe is retained as it was, not rescored.

What the traces say about the September 17 confound: told which tools it
had, this host used the permitted `node` path immediately. The refusals
here were compound commands and a heredoc, not `curl` or `node` themselves.
The host's own report blamed `curl` flag order for the first refusal; the
trace shows the refused commands were the compound ones. Its second report
listed no refusals while the trace shows one. Self-reports are statements.
Two other host facts are recorded and not relied on: `ls` and `echo` ran
without being on the allowlist, and a `curl … && echo` chain ran while the
`;`-chained form was refused.

**The buyer cohort did not run here.** The merchant subject is refused by
this sandbox's egress policy (CONNECT 403 from the agent proxy), so a buyer
cell launched here could only record an environment failure. The store, the
skill source and the MCP registry are reachable. Raw traces and retained
files stay under ignored `private/` and were handed to the keeper as an
archive whose file hashes match the public record.

## Before running

1. Merge the instrument; the plan hash binds to `plan.json` bytes only, but
   the probe and cohort freeze the collector bytes beside every acquisition.
2. Run the probe on the keeper's machine with both native hosts signed in
   (the web-sandbox probes qualify the Claude host in that launch context
   only; the cohort needs a probe from the machine that will run it):
   `node scripts/buyer-cold-isolated.mjs --capability research/takeoff-catalogue-2026-09-17/plan.json --out /private/tmp/buyer-probe-2026-09-XX --run`.
   Read `capability.json`. A host that fails is an instrument or host
   finding; changing the adapter is a new instrument hash, not a mid-cohort
   permission grant.
3. Only then: `--plan ... --out /private/tmp/buyer-cold-2026-09-XX --run --qualified /private/tmp/buyer-probe-2026-09-XX`.
4. Review, rescore with `--score`, hand signed evidence to fresh recipients as
   the [frozen contract](../takeoff-postmerge-2026-09-17/CONTRACT.md) requires,
   and keep native traces under an ignored `private/` directory.

The historical snapshot the September 17 buyers relied on was observed on
2026-09-07; under the frozen 14-day window it stops qualifying after
2026-09-21. A later run needs a newer signed snapshot or records the stage
incomplete. Do not widen the window to rescue it.

No payment, wallet access, directory signing, account creation or outbound
admission message is authorized by this freeze.
