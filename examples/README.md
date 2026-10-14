# Examples — an agent is about to pay; it checks first

One operational workflow, written eight ways, one per framework a
developer copies from. Every example does the same four things and
differs only in how the framework spells "tool":

1. **read the door's 402** — `GET` the URL, decode `PAYMENT-REQUIRED`,
   and hold the terms you were served: network, asset, recipient
   (`payTo`), amount in atomic units;
2. **one POST to the store's free dry run** — `/api/before-you-pay/v1`
   answers whether a stock x402 client would sign, which accept it
   would pick, and carries the free preflight whole as `the_door`:
   `ready` / `not_ready` / `unreachable`, every check and advisory
   named;
3. **read the defect state** — the failed checks by name, the
   advisories outside the verdict, the client's own refusal text;
4. **decide** — `pay` / `do_not_pay` / `cannot_tell`, each `because`
   line naming the check, the advisory or the policy field it came
   from, with `does_not_establish` on every answer.

Nothing in this directory signs or pays. The payment step is your
x402 client and your wallet; these examples say whether to reach it.

## Layout

| Path | What it is |
| --- | --- |
| `shared/decide.mjs` | The walk and the decision, zero dependencies, Node 18+. `readChallenge`, `preflight`, `beforeYouPay`, `decide`, `beforeYouPayWalk`. |
| `shared/decide.py` | The same, standard library only, Python 3.9+. |
| `fixtures/` | Five readings recorded from the store's own battery and dry run over synthetic doors, plus `expected.json`: the decision each must derive under each policy. |
| `openai-agents/agent.mjs` | OpenAI Agents SDK: a local tool, and the store's free verifier MCP door (`/mcp/verifier`) as a hosted MCP tool. |
| `vercel-ai-sdk/agent.mjs` | Vercel AI SDK `tool()` + `generateText`. |
| `langgraph/agent.mjs` | LangChain / LangGraph prebuilt ReAct agent. |
| `crewai/agent.py` | CrewAI `@tool`, one agent, one task. |
| `pydantic-ai/agent.py` | PydanticAI `Agent` with a typed result. |
| `autogen/agent.py` | AutoGen AgentChat `AssistantAgent` with a function tool. |
| `claude-code/SKILL.md`, `claude-code/x402-before-you-pay.mdc` | A Claude Code skill and the same rule for Cursor. |
| `copilot/copilot-instructions.md` | Repository instructions for GitHub Copilot. |
| `x402-preflight-on-deploy.yml` | The preflight as a CI step after every deploy (older; see the README). |
| `corpus-recompute.ipynb` | Python 3 + Node 22 notebook, run from this checkout. Fetches and authenticates the signed chain using the existing verifier; derives catalog agreement, freshness and comparable changes with their denominators. |
| `corpus-listing-evidence.mjs` | Local, read-only Node 22 adapter. Authenticates one supplied snapshot and selects exactly one URL/method observation for reuse with its date, source pointer and limits. |

## Choose the job

| Your next decision | Existing tool or guide | Evidence to retain |
| --- | --- | --- |
| Inspect an x402 endpoint before deciding to pay | Preflight clients: [JavaScript](../x402-preflight/README.md), [Python](../x402-preflight-py/README.md), [Go](../x402-preflight-go/README.md); framework examples below | Exact URL, method, reading date, named checks and gaps; readiness is not delivery |
| Verify a signed artifact locally | [x402-verify](../verifier/README.md), including supported formats and evidence bundles | Original artifact, public-key source, verification result and unsupported checks |
| Read or compare historical observations | [Corpus client](../corpus-client/README.md), [reproduction notebook](corpus-recompute.ipynb), [public corpus](https://scvd.store/corpus) | Signed originals and denominators; distinguish host observation time from snapshot time |
| Attach evidence to a listing or support decision | [Local listing adapter](corpus-listing-evidence.mjs), instructions below | Exact endpoint/method, original snapshot digest and row pointer; projection remains unsigned |
| Cite an aggregate finding | [Existing weekly brief](https://scvd.store/corpus/brief), [dated reproducible analysis](../research/competitive-corpus-2026-09-28/FINDINGS.md) | Dated source, comparable population, exclusions and scope |

These are source guides. A prepared source version can be newer than the
published package; check the registry version before using a new API.

## Reuse corpus evidence

Open [the notebook](corpus-recompute.ipynb) from a repository checkout with
Python 3 and Node 22. It downloads the public originals within explicit size
and pagination bounds, then uses the repository's JavaScript verifier so
Python serialization differences cannot change the signed bytes. It needs no
Python package installation. It checks digest, signature and chain linkage;
it does not independently establish key identity or verify Bitcoin timestamps.

For one listing, save an original snapshot from the [corpus index](https://scvd.store/corpus/index.json)
and the [public verification key](https://scvd.store/.well-known/scvd-signing-key).
Pass their local paths and the exact recorded endpoint and method:

```sh
node examples/corpus-listing-evidence.mjs SNAPSHOT_JSON PUBLIC_KEY_JSON EXACT_URL METHOD
```

The uppercase arguments are placeholders. The adapter makes no network request
and no payment. It refuses an invalid signature/digest, an absent exact match
or duplicate matches. Its single-snapshot check does not verify the chain or
Bitcoin proof. The public key must come from a source you trust.

A [filled historical example](../research/competitive-corpus-2026-09-28/partner-listing-evidence.json)
shows catalog disagreement alongside a ready x402 reading. Preserve
`observed_at`, `snapshot_captured_at`, `source.digest`, `source.row_pointer`
and the gaps when reusing it. Unknown dates remain unknown. A newer snapshot
must not make an older observation appear current.

## Run one

Each agent takes the door's URL as its only argument and needs the
framework installed plus a model key; the header of each file says
which. The shared walk alone needs nothing:

```sh
node -e 'import("./examples/shared/decide.mjs").then(async m => console.log(JSON.stringify((await m.beforeYouPayWalk(process.argv[1])).decision, null, 2)))' -- https://door.example/api/paid-answer
```

The store cannot preflight its own hostname (a Worker cannot fetch
itself), so point the examples at a door that is not `scvd.store`. To
see the terms half against deterministic doors, `readChallenge` works
on the store's practice course: `https://scvd.store/api/practice/testnet-network`
serves a testnet offer, `…/api/practice/two-surfaces` a header and a
body that disagree; `GET https://scvd.store/api/practice` lists them.

## What CI runs, and what it does not

- `npm run examples:test` runs `shared/decide.test.mjs` (Node's own
  runner) and `shared/test_decide.py` (unittest) against the recorded
  readings and `fixtures/expected.json`. Both languages assert the same
  file, so they cannot drift apart without the build going red. No
  network.
- `test/examples.spec.ts` holds the recorded readings to the live
  battery's shape (the report keys, the check names, the versions), so
  a battery change fails here until the fixtures are re-cut; and holds
  every framework file to the shared module and the free doors it
  names.
- The framework files themselves are **not executed in CI**: each
  needs its framework and a model key, and installing eight of them is
  a supply chain this repository does not want. They are syntax-checked
  (`node --check`, `py_compile`) and text-checked; run them yourself
  with the commands in their headers.

## How to read a decision

- `cannot_tell` is unknown, never a defect: an unreachable probe, a
  fact the reading does not carry (a recipient you did not pass, an
  asset whose USD amount cannot be resolved).
- `do_not_pay` names its evidence: the failed checks, the client's own
  `throws_with`, a `testnet-network` advisory, or the policy field.
- `pay` is a derivation from a `ready` door, a `would_sign` client and
  your policy. It is never a score, and never proof of delivery: the
  `does_not_establish` list rides on every answer so a pass is not read
  as "this merchant delivers".

## Policy fields

`{ allowed_networks?: string[], allowed_recipients?: string[], max_amount_usd?: number }`.
Networks are CAIP-2 (`eip155:8453`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`).
Recipients compare case-insensitively. A cap with no resolvable USD
amount is `cannot_tell`, not a refusal.
