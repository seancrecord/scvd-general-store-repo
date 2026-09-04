# The delegated agent — SCVD as a specialist another agent hands work to (2026-09-03)

The keeper's memo of 2026-09-03 evening, filed as a plan: each of its
ten parts against what already stands in the tree, what is missing,
and the three moves it names first. The lens is the same one he set
that afternoon — value or potential value if the market takes off —
and the thesis is his sentence: the strongest discovery is
task-native. An agent needs to inspect an x402 endpoint, verify a
receipt, reconcile a payment, or obtain signed bounded evidence, and
SCVD is the obvious callable tool, dataset, package or specialist
agent for that task. Never a trust score, never a recommendation,
never a chat agent that duplicates the site.

## The next three moves, in his order

| # | Move | What stands | What is missing | Size |
| --- | --- | --- | --- | --- |
| A1 | **A dependency-quality verification package.** | `x402-verify` 1.0.2 on npm, zero dependencies, `did:web` resolution, key history, README, `x402-sign` beside it. Its API is the primitives (`parseJws`, `verifyEd25519`, `resolveDidWeb`, `validateReceiptPayload`, `isOfferLive`). | The one-call shape his memo shows: `verifyReceipt({ receipt, issuerKeyUrl })` returning `{ valid, scope, doesNotEstablish, verificationUrl }` — the bounded-evidence shape as the package's front door, built on the primitives that exist; fixtures for valid and invalid inputs in the package; a CHANGELOG with dates; a stable versioning line in the README. Whether it ships as `x402-verify` 1.1 or a scoped `@scvd/x402-receipt-verify` is decision 2 below. | Small |
| A2 | **An A2A evidence agent: three read-only tasks and a card.** | An A2A card at `/.well-known/a2a.json` that describes the store's doors as a discovery document; MCP with the same three tasks as tools; rule 57 on every probe door. No task endpoint. | `/.well-known/agent-card.json` in task language — `preflight_endpoint`, `verify_receipt`, `get_endpoint_readiness` — and one explicit A2A task endpoint (`POST /a2a`) that accepts those three, runs them on the existing services, and returns the bounded artifact shape: task, observed_at, result, scope, does_not_establish, verification_url, artifact_url, key_url. Deterministic, free, no conversation. The query nouns on the card are the plain ones (x402 endpoint preflight, x402 receipt verification, x402 endpoint-readiness dataset), never house names. | Medium |
| A3 | **A focused ChatGPT app.** | A plugin was submitted 2026-09-03 as "SCVD General Store", free tools only in the demo prompts, in review (DISTRIBUTION §5b). | His memo says not to submit the store as an eighteen-tool marketplace; submit "SCVD x402 Verifier" with five tools: `preflight_x402_endpoint`, `verify_x402_receipt`, `lookup_endpoint_readiness`, `get_defect_definition`, `verify_scvd_artifact`. That is a second MCP surface (or a tool subset served at `/mcp/verifier`) and a resubmission, which is his press (rule 30). Decision 1 below. | Small code, his press |

## The rest of the memo, against the tree

| Part | What stands | What is missing | Filed as |
| --- | --- | --- | --- |
| 3. Discovery set | `/.well-known/x402.json`, `/.well-known/api-catalog`, `/.well-known/agent-instructions`, `/.well-known/a2a.json`, `/agents.md`, `/llms.txt`, `/openapi.json`, `/mcp`, `/skill.md`, `/corpus`; the mirrors and versions watched weekly (V4). | `/.well-known/agent-card.json` (A2) and `/.well-known/ai-catalog.json` naming every record from one document; an AWS Agent Registry entry once the card exists (his press). | C3 |
| 4. Make yourself a dependency | `x402-verify`, `x402-sign`, `scvd-cli`, `scvd-tab`, the preflight Action, the ClawHub skill. | `x402-preflight` as a package (the Action's `preflight.mjs` is already dependency-free; the package is the same file with a README and fixtures); `scvd-corpus-client` as the CLI's library half; `scvd-defects` (the vocabulary and its fixtures as a package); an MCP starter template. Each with a tiny README, one copy-paste example, fixtures, a licence, a versioning line. | C5 |
| 5. The failure-path default | Every defect class has a definition page with scope and detection rule; fixtures live in the tree; free inspection doors exist. | Per defect family, the four artifacts together: the definition page gains a remediation and links to a code example (TypeScript, Python), a fixture served at a public URL, and the tool route. The remediation line is C1; the served fixtures are C7; the code examples ride C2. | C1, C2, C7 |
| 6. Runtime handoffs | Rule 57 errors on every probe door; the CLI's exit law; the Action prints every check by name. | Error bodies that carry `documentation_url` (the defect page), `verification_url` and `next_action` on the doors, the CLI and the Action — only where SCVD is a legitimate remedy, never on unrelated errors. Rides C1. | C1 |
| 7. Framework examples | Built 2026-09-03 (roadmap C2, row under DONE): `examples/`. | One `examples/` directory: OpenAI Agents (tool schema + remote MCP), Vercel AI SDK, LangChain/LangGraph, CrewAI, PydanticAI, AutoGen, a Claude Code / Cursor skill file, a Copilot-friendly README; each operational ("an agent is about to pay; it calls preflight; it reads network, asset, recipient and the defect state; it decides"), each tested in CI against fixtures. | C2 |
| 8. Feed coding agents | Root README, package READMEs, `skill.md`, `agents.md`, `llms.txt`, raw Markdown everywhere. | A `CHANGELOG.md` per package with date, impact, migration; canonical task phrasing early in every README; descriptive file names (`verify-x402-receipt.ts`); explicit install plus minimum example in every package. Rides A1 and C5. | A1, C5 |
| 9. The corpus as an operational feed | `/corpus.json`, `/corpus/{n}.json`, `/corpus/round/{week}`, `/corpus/host/{host}.json`, `/corpus/diff.json`, `/corpus/month/{YYYY-MM}`, the four Atom feeds (V2). | `/corpus/latest.json` as a stable alias; `/corpus/changes/{week}.json` naming additions, removals, recoveries, changed payment routes and changed defect state in plain fields with a plain-English changelog; `ETag`, `Last-Modified` and conditional GET on the corpus routes; a "subscribe" example (every Monday: fetch, verify, diff, alert only if a door you use changed state). | C6 |
| What not to chase | — | More generic directories; a marketplace identity; "trust layer" positioning; an A2A chat agent; paid mentions; awesome-list follow-ups; a giant overlapping tool catalog. Recorded so the next intake does not reopen them. | — |

## Decisions only the keeper can make

1. **The ChatGPT submission.** A plugin named "SCVD General Store" is in
   review as of today. The memo says submit "SCVD x402 Verifier" with
   five read-only tools instead. Withdraw and resubmit, let the review
   run and submit the verifier as a second plugin, or keep the one in
   review. Press is his either way; the tool subset is a small build
   once he chooses.
2. **Package naming.** The verification front door as `x402-verify`
   1.1 (the name already on npm, unscoped, 1.0.2) or as a new scoped
   `@scvd/x402-receipt-verify`. Recommendation: 1.1 of the name that
   exists, so the install line people already have keeps working, and
   the scoped name only if the `@scvd` scope is wanted for the family.
3. **The A2A task endpoint's shape.** JSON-RPC per the A2A spec's
   `message/send`, or the plain POST the memo sketches. Recommendation:
   the spec's shape at `/a2a`, with the memo's artifact as the task's
   result, so a framework's A2A client works without a custom adapter.
4. **AWS Agent Registry.** Worth an entry once the card exists; the
   listing is his press.

## Order, and what is queued

A1, A2, A3 are queued on ROADMAP NOW in the memo's order; the rest
sits under LATER as C1–C7 (the channel list of the same evening)
with the memo's parts mapped onto them. One PR at a time; draft copy
in chat.
