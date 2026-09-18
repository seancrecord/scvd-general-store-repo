# Takeoff-readiness pickup for Codex — September 17, 2026, evening

**Native follow-through:** [NATIVE_HANDOFF.md](NATIVE_HANDOFF.md) records the
subsequent native probes: Claude passed, Codex failed, and the buyer cohort
remains unlaunched. Start there for the current blocker; the record below
preserves this handoff's original state.

Read the repository's current `AGENTS.md`, `HOUSE_RULES.md`, `KEEPER_LIST.md`
and `ROADMAP.md` first. This is a continuation brief, not an amendment to
them. It follows the [morning handoff](../takeoff-postmerge-2026-09-17/HANDOFF.md),
whose objective, rules and "do not" list still hold. Nothing here was run
on the keeper's machine; this session was Claude Code on the web.

## State of the record

- [#770](https://github.com/seancrecord/scvd-general-store-repo/pull/770)
  (takeoff qualification and handoff): merged at `4f20ab85` after every
  required check passed. The September 17 cohort, its score and its private
  originals are untouched.
- [#769](https://github.com/seancrecord/scvd-general-store-repo/pull/769)
  (verifier activation and progressive skill milestone): merged by the keeper
  at `3194d4d7`. Its own continuation is
  [`docs/PACKAGE_SKILL_HANDOFF_2026-09-17.md`](../../docs/PACKAGE_SKILL_HANDOFF_2026-09-17.md),
  with publication steps that are that task's, not this one's.
- [#771](https://github.com/seancrecord/scvd-general-store-repo/pull/771)
  (MPP certificate reconciliation): merged at `7d4562e5`. Unrelated to this task.
- This work: branch `claude/gracious-noether-u0fyg2`, three commits rebased
  onto `3194d4d7`, merged through its own PR with the full gate.

## What this session did

Handoff items 1 and 2, instrument only, no product code, no payment, no
directory action, no outbound message.

1. **Schema 4 of the cold-buyer instrument** (`scripts/lib/buyer-cold.mjs`,
   `scripts/buyer-cold-isolated.mjs`; contract in
   [`research/BUYER_COLD.md`](../BUYER_COLD.md)):
   - a generic **host capability probe** that must pass, per host, from the
     same frozen plan before a cohort spends usage (`--capability … --run`,
     then `--plan … --run --qualified PROBE_DIR`); cells of a host that did
     not pass are recorded `capability_unqualified`, unlaunched, in the
     denominator;
   - prompts **state the host's real tools**, derived from the same list the
     Claude adapter builds its allowlist from (`HOST_TOOLS`: `curl`, `node`,
     unchanged);
   - the **catalogue lane retains what the catalogue returned**: a discovery
     pass needs the retained candidate file from the capture manifest, the
     query, the returned count and the selection; the score carries
     `catalogue_observation` (`found` / `not_returned` / `unchecked`,
     `complete: false`) and `catalogue_absence` stays `unverified`.
     `ourSearchReading()` is untouched; no second checker was written.
   - a proxied launch context passes its egress route and CA bundle to the
     child; keys, tokens and parent session ids still do not.
   - 23 new offline controls, observed red before the implementation;
     `npm run buyer:test` is 114 checks.
2. **A frozen, unrun catalogue-entry cohort**: [`plan.json`](plan.json),
   [`freeze.json`](freeze.json), [`README.md`](README.md). Eight cells: the
   official MCP registry list surface as the catalogue entry, and the public
   skill source as the referral lane, two repetitions per host. Same merchant
   subject, budgets and 14-day window as September 17. Zero spend.
3. **Two live capability probes for the Claude host**, run from this web
   sandbox with the unchanged allowlist: both pass. Public record with every
   private file's hash: [`probe-web-2026-09-17.json`](probe-web-2026-09-17.json).
   The private originals went to the keeper as an archive
   (`scvd-probe-web-2026-09-17-private.tar.gz`, sha256
   `f3af6157a898afcb70271cf69958a6eb9aa9d0f0579e55e6429154d4656d76ff`) to be
   kept beside `~/scvd-takeoff-handoff-2026-09-17/`. Codex was `unavailable`
   in the sandbox (no CLI). The first probe exposed and the instrument fixed
   a vector defect (one shared message under deterministic ed25519); the
   second probe ran on the corrected collector.
4. **A dated operator reading of the MCP registry**
   ([`registry-reading-2026-09-17.json`](registry-reading-2026-09-17.json)):
   a `scvd` query returns `store.scvd/general-store`; `x402`, `verification`
   and the default page do not, and the `verification` set was complete for
   that query. The registry appears to match on server name. Bounded to four
   queries on one day; not absence, not a reason to rename anything. It is the
   hypothesis the catalogue lane tests.

## What the probes say about the September 17 confound

Told which tools it had, the host used `curl -o` into `./evidence` and
`node` crypto over an SPKI-wrapped raw key straight away, the permitted path
neither September 17 Claude buyer tried. Refusals were compound commands
(`;` or newline chained) and a `cat` heredoc, not `curl` or `node`. Recorded
and not relied on: `ls` and `echo` ran without being on the allowlist; a
`curl … && echo` chain ran while the `;` form was refused; both host
self-reports misdescribed their own refusals, and the trace is the record.

## Next bounded work, in order

1. **Probe both native hosts on the keeper's machine** from this exact plan:
   `node scripts/buyer-cold-isolated.mjs --capability research/takeoff-catalogue-2026-09-17/plan.json --out /private/tmp/buyer-probe-YYYY-MM-DD --run`.
   A probe qualifies the launch context that will run the cells; the web
   sandbox probes do not stand in for it. A failing host is an instrument or
   host finding. Changing an allowlist is an adapter change with a new
   instrument hash, never a mid-cohort grant.
2. **Run the cohort** only with a passed probe for both hosts:
   `node scripts/buyer-cold-isolated.mjs --plan research/takeoff-catalogue-2026-09-17/plan.json --out /private/tmp/buyer-cold-YYYY-MM-DD --run --qualified /private/tmp/buyer-probe-YYYY-MM-DD`.
   The merchant subject was egress-denied from the web sandbox; confirm it
   answers from the native machine before launching. The September 7
   historical observation leaves the frozen 14-day window after September 21;
   a later run needs a newer signed snapshot or records the stage incomplete.
   Do not widen the window.
3. **Review every cell** (`review.json` per the contract in `BUYER_COLD.md`),
   including `discovery.catalogue` for catalogue cells with the retained
   candidate file, and hand any usable signed evidence to fresh recipients as
   the [frozen contract](../takeoff-postmerge-2026-09-17/CONTRACT.md) requires.
   Rescore with `--score`. Keep native traces under ignored `private/` and a
   durable hash-verified copy outside the worktree, as before.
4. **Repair only repeated buyer failures on a qualified host** (morning
   handoff item 3), then repeat both hosts twice. Keep external admission
   separate (item 4); recheck dated external status before acting.

Do not rerun the September 17 cohort to improve its score, fetch replacement
evidence into any finished acquisition, tune prompts or permissions mid-run,
infer paid completion from a 402, or count a recipient supplied with review
machinery as unprompted discovery.

## Authority and cost

The keeper authorized merging this work and asked for it to run; the web
sandbox could run only the Claude probe. No payment, wallet or private-key
access, directory signing, account creation or outbound admission message was
authorized or performed. Native cohort runs consume model usage on both
hosts: roughly two probe sessions plus eight bounded buyer cells. At the end
of this session no buyer, probe or recipient process was running.
