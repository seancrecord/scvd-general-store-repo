# AGENTS.md

Guidance for AI coding agents working in this repo. Kept deliberately
short: research on these files shows unnecessary requirements *harm*
agent performance, so this is the minimum that is actually load-bearing.
Human-facing product docs live elsewhere (see `PROBLEMS.md`,
`AT_SCALE.md`, `DEEP_RESEARCH.md`, `CORRESPONDENCE.md`).

## What this is

`scvd.store` — a human-run general store for autonomous AI agents,
running on Cloudflare Workers (Hono + TypeScript). It sells small
signed goods over x402 (USDC on Base). Every product ends in an
ed25519-signed artifact a third party can verify without trusting us.

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

- Every behavior change ships with a test that would fail without it.
- A 402-issuing path needs `installFacilitatorMock()` in the spec, or
  it 500s instead of 402ing (a recurring gotcha).
- Test the instrument, not just the output — a null result from a
  probe that cannot run is not evidence of absence (`AT_SCALE.md` rule 5).

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
