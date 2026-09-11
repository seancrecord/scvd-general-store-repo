# github/agentfinder-catalog#34 — the replacement (for CV, 2026-09-11)

The PR as opened fails the catalog's own validator before a reviewer
reads it: `metadata.sourceSet` is `scvd-general-store-repo` and their
`scripts/generate_ai_catalog.py --check` requires `owner/repo`
(regex `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`). Three more things in the
same file: the description says "from $0.004" where the SKILL.md it
points at says $0.001; the `mcp-server` tag is on a skill entry, and
the MCP server is a separate entry with its own media type; and the
PR carries one entry where three are drafted. Everything below is
copy-paste.

## 1. Replace the file

`catalog/seancrecord/scvd-general-store.json` — overwrite with
`registry/agentfinder/catalog/seancrecord/scvd-general-store.json`
from this repo (validated against their validator, offline, 2026-09-10).

## 2. Add the other two files

Copy, same directory:

- `registry/agentfinder/catalog/seancrecord/x402-before-you-pay.json`
- `registry/agentfinder/catalog/seancrecord/scvd-general-store-mcp.json`

## 3. Validate before pushing

```bash
python3 -m json.tool catalog/seancrecord/scvd-general-store.json
python3 -m json.tool catalog/seancrecord/x402-before-you-pay.json
python3 -m json.tool catalog/seancrecord/scvd-general-store-mcp.json
python3 scripts/generate_ai_catalog.py
python3 scripts/generate_ai_catalog.py --check
git add catalog/ ai-catalog.json
git commit -m "Fix sourceSet, add the before-you-pay skill and the MCP server"
git push
```

The generator needs network (it reads GitHub's MCP feed). If the
fork workflow cannot push the regenerated `ai-catalog.json`, their
README says a follow-up PR on their side regenerates it after merge;
that is not a refusal.

## 4. Retitle and replace the body

**Title:** `Add SCVD General Store (two skills, one MCP server)`

**Body:**

---

Adds three augments from [seancrecord/scvd-general-store-repo](https://github.com/seancrecord/scvd-general-store-repo) (MIT), the repository behind [scvd.store](https://scvd.store), an evidence observatory for agentic commerce: independent verification of x402 endpoints, payments and receipts.

**Entries**

| file | media type | definition |
|---|---|---|
| `scvd-general-store.json` | `application/ai-skill` | [`skills/scvd-general-store/SKILL.md`](https://github.com/seancrecord/scvd-general-store-repo/blob/main/skills/scvd-general-store/SKILL.md) — how an agent reads, verifies and buys at the store |
| `x402-before-you-pay.json` | `application/ai-skill` | [`examples/claude-code/SKILL.md`](https://github.com/seancrecord/scvd-general-store-repo/blob/main/examples/claude-code/SKILL.md) — read a 402's terms and run the free preflight before paying any x402 endpoint |
| `scvd-general-store-mcp.json` | `application/mcp-server+json` | [`store.scvd/general-store` on the official MCP registry](https://registry.modelcontextprotocol.io/v0/servers/store.scvd%2Fgeneral-store/versions/0.2.3), streamable HTTP at `https://scvd.store/mcp` |

**What a Copilot user gets from these**

- Before paying an x402 endpoint: `POST https://scvd.store/api/before-you-pay/v1` with the URL says whether a stock client would sign, which offer it would pick, and what the door's shape looks like. Free, no key.
- Conformance checks for any issuer's signed x402 offers and receipts, ours or a competitor's: `POST https://scvd.store/api/conformance/v1`. Free.
- A weekly, Bitcoin-anchored corpus of observed endpoint readiness (CC BY 4.0), per host at `/corpus/host/{host}.json`.
- A live practice counter for x402 clients with real settlement from $0.001, and paid signed audits, watches and settlement attestations from $0.004.

**What they do not do**

The skills instruct an agent to call public HTTPS endpoints and to read their answers; they declare no environment variables, no binaries and no install steps. Nothing asks for credentials, keys or wallet secrets, and nothing pays without a signed payment the agent's operator chose to make. The MCP server's `tools/list`, `initialize` and resource reads are free and unauthenticated; the `buy_*` tools answer with HTTP 402 x402 terms and settle only in band.

**Validation**

- Every URL is public; each `metadata.repoPath` exists on `main` in the named `sourceSet`.
- `python3 scripts/generate_ai_catalog.py --check` passes locally on all three files.
- The MCP entry's `version` and description repeat the registry's latest published version verbatim; a test in the source repository (`scripts/agentfinder-check.test.mjs`) refuses drift between these files and the manifests they describe.

Notes for the reviewer: the MCP entry uses the `urn:ai:registry.modelcontextprotocol.io:<namespace>:<name>` identifier shape your generator emits for feed rows, so that if GitHub's MCP feed later carries this server the generator dedupes to one row. Happy to switch it to the `urn:ai:github.com:...` shape if you prefer contributor entries uniform.

---

## 5. Why the sentence about money is worded that way

The catalog reviewers are reading for two things a store of this
kind trips on: whether an augment asks for secrets, and whether it
moves money on its own. Both answers are no, and the body says so in
one paragraph rather than leaving a reviewer to infer it from a
SKILL.md. The "$0.001" is the practice counter's floor and the
"$0.004" is the cheapest paid artifact; the original PR collapsed
the two into one wrong number.
