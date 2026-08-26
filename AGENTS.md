# AGENTS.md

Guidance for AI coding agents working in this repo. Kept deliberately
short: research on these files shows unnecessary requirements *harm*
agent performance, so this is the minimum that is actually load-bearing.
Human-facing product docs live elsewhere (see `PROBLEMS.md`,
`AT_SCALE.md`, and the historical record under `docs/archive/`).
Before working, read `HOUSE_RULES.md` (the standing rules; rule 29
requires this) and `KEEPER_LIST.md` (the keeper's one desk file —
what is open, what is decided, what only he can rule on).

## What this is

`scvd.store` — **an evidence observatory for agentic commerce**, run by one
human on Cloudflare Workers (Hono + TypeScript). The store's one real
product is *independent signed observation*: conformance audits,
endpoint watches, settlement attestations, Bitcoin-anchored
timestamps. Every product ends in an ed25519-signed artifact a third
party can verify without trusting us — and every instrument publishes
the gaps it could not see, counted against itself.

Not an escrow, a guarantor, or a dispute court: those absorb risk and
need a balance sheet. We observe the gap and sign what we saw.

It is also a general store selling small signed goods over x402 (USDC
on Base or Solana), which is where most of the shelf still lives.

## Commands

- Install: `npm install`
- Test (full suite, required before any commit): `npm test`
- Typecheck: `npm run typecheck`
- Bundle check (catches build-only breakage tests miss): `npm run build:check`
- Local dev: `npm run dev`

Run `npm run typecheck && npm test` before committing. `npm run
build:check` when touching imports, config, or non-`.ts` modules — the
Workers build and the vitest pool disagree on some things (e.g. `.md`
imports), and a green test suite can still fail the real deploy.

## Layout

- `src/index.ts` — app entry, route mounting, global `onError`, crons.
- `src/routes/` — HTTP + MCP endpoints (one concern per file).
- `src/services/` — stateful operations over KV (orders, certs, etc.).
- `src/store/` — copy, menu, and standing docs as data/text.
- `src/lib/` — signing, payments, metrics, x402 plumbing.
- `test/` — vitest specs (cloudflare:test pool); one spec per behavior.

## Code style

- Match the surrounding file's voice and comment density. This codebase
  comments the *why*, especially the non-obvious decision behind a line.
- TypeScript strict; no `any` on a new path without a stated reason.
- Prefer the existing helper over a new dependency. New deps on a
  secret-handling or signing path are a supply-chain decision, not a
  convenience — see `AT_SCALE.md` rule 6.
- DO NOT interpolate `env` or secrets into any response, log line, or
  error. `onError` returns fixed prose on purpose.
- DO NOT hand-type a value that lives in code elsewhere (counts,
  versions, field lists). Derive it or make the tool refuse — this is
  `AT_SCALE.md` rule 1, and it broke five things in one day once.
- Agent-authored text (tags, letters, confessions, summaries) is stored
  as written, escaped everywhere it renders, and never interpreted.

## Testing

- **`npm run typecheck` is the typecheck. `npm run build:check` is NOT.**
  build:check is `wrangler deploy --dry-run`, which bundles with esbuild
  and strips types without checking them — it will happily bundle a
  reference to a variable that does not exist. Run `tsc --noEmit`
  before claiming a change typechecks. (Learned 2026-08-02 the
  expensive way: a deleted variable still referenced at another call
  site passed build:check twice and was caught by a test.)
- `vitest` does not typecheck either. Green tests plus a green bundle
  still leaves type errors sitting in the tree.
- Every behavior change ships with a test that would fail without it.
- A test asserting a fix must be shown to FAIL without the fix —
  `git stash` the source change, run it, confirm red, restore. A test
  that passes both ways proves nothing and looks like proof.
- **Before concluding a defence does not exist, `grep -rn` the concept
  across `src/` — before, not after.** Reading the file where it
  *should* be and not finding it is not evidence: on 2026-08-02 a
  careful read of `replay-guard.ts` concluded cross-nonce
  double-charging was undefended, while the defence sat in
  `lib/idempotency.ts` and had shipped the day before with a test
  asserting exactly that case. Absence in the files you opened is not
  absence.
- The suite (large; `npm test` is the count that's never stale) can
  TIME OUT under load: a handful of unrelated tests fail at ~15s on
  assertions that take
  milliseconds alone. Before treating that as a regression, re-run.
  **Same tests failing twice = deterministic, and yours. Different
  tests or none = load.** Observed 2026-08-02. Do NOT "fix" it by
  raising timeouts — that hides a real regression next time.
- A test whose verdict can move with the wall clock is not a test.
  Inject the clock on BOTH sides: `anchor-submit` read a fake clock for
  its due-check and the real one for the row it wrote, so it passed all
  evening and failed after midnight with no code change.
- A 402-issuing path needs `installFacilitatorMock()` in the spec, or
  it 500s instead of 402ing (a recurring gotcha).
- Test the instrument, not just the output — a null result from a
  probe that cannot run is not evidence of absence (`AT_SCALE.md` rule 5).
- KV persists across tests in a file. A spec over an append-only
  surface (the anchor log, the porch counters) clears its own prefix in
  `beforeEach`, or it passes alone and fails in the suite.
- A tamper-evidence claim is tested by TAMPERING, not by checking the
  happy path twice. `test/verifier-anchor.spec.ts` is the pattern: edit
  a snapshot, edit-and-rehash one, delete an entry, and desynchronize
  the published canonical form from the snapshot beside it.

## Security constraints (hard)

- The store never asks anyone to run code, install anything, or hand
  over credentials or key material. Do not add a flow that does.
- `SIGNING_KEY` (ed25519 seed), `CDP_API_KEY_SECRET`, `ADMIN_PASSWORD`,
  `PAY_TO_ADDRESS` are Worker secrets — never in the repo, never echoed.
- Money fails closed; decoration fails open. Nothing that moves money
  gets a silent fallback (`AT_SCALE.md` rule 7).

## Commits & branches

- Work on the designated feature branch; never commit straight to `main`
  without cause. The established flow: commit to the branch, merge to
  `main` (which deploys), push both.
- End commit messages with the `Co-Authored-By` / `Claude-Session`
  footer already used throughout the history.
- Commit or push only when the task asks for it.
