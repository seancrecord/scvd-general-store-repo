# `scvd` — the command line for [scvd.store](https://scvd.store)

Check any x402 door, verify any issuer's signed offer or receipt, and
read the weekly signed corpus — from a terminal, in one line, with no
account and no key.

```
npm i -g scvd-cli
scvd preflight https://some-endpoint.example/api/thing
```

The package is `scvd-cli`; the installed command is `scvd`. npm's
typosquat guard refuses the bare name `scvd` outright ("too similar
to scss, save, send"), and it only polices package names, so the
command keeps the short one.

Zero dependencies. Node 18.17+. MIT.

> Published from CI with `npm publish --provenance`, so the tarball
> carries a signed attestation binding it to this repo and the commit
> it was built from — the same bar this store holds everybody else's
> artifacts to. No install needed either way: the whole tool is this
> one file, and `node cli/scvd.mjs preflight <url>` works from a clone.

<!--
  THE FIRST TARBALL COULD NOT TELL THE TRUTH, and it is worth knowing
  why before anyone writes another status line here.

  0.1.0 was published on 2026-08-28 carrying a README that said "not
  on npm yet" — accurately, at the moment it was built, since the
  publish is the thing that made it false. npm renders a version's
  README from inside its own tarball and versions are immutable, so
  that page said the package did not exist while the package existed,
  and no edit could reach it. 0.1.1 is the correction.

  The lesson is in the tense: this file is read from inside the
  artifact it describes, so it must not assert a publication STATE
  that the act of publishing changes. Say what the tool is and how it
  is built — both true in the tarball and on the registry page — and
  leave the published-or-not question to the constants in
  src/store/cli.ts, which every served surface reads and which can be
  edited after the fact.
-->

## What it does

| Command | What it asks the store |
| --- | --- |
| `scvd preflight <url>` | Does that x402 door answer a well-formed 402? One probe, every check named, testnet traps flagged. |
| `scvd conformance <file\|->` | Is that compact-JWS signed offer or receipt well-formed, correctly signed and unexpired? Any issuer's, including ones the store competes with. |
| `scvd receipt <file\|->` | Verify any issuer's receipt JSON and get back a signed verdict. |
| `scvd verify <id>` | Verify anything this store ever signed. Free, forever, including artifacts you did not buy. |
| `scvd corpus [--since <week>]` | The weekly signed census index; with `--since`, what moved since that week. |
| `scvd host <host>` | Every signed round that met a host, the gaps by reason, the tier with its fraction, and the citation for the latest row. |
| `scvd cite <host> [--week <week>]` | The citation for a host's row, as one line, as Markdown and as the JSON shape the store's citation watch reads. |
| `scvd reproduce <url> [--since <week>]` | Probe the door now and set the answer against the signed row: `same`, `moved`, `instrument_moved`, `not_comparable` or `no_such_round`, by the rule at `/criteria#result-class`. Exit 0 on same, 1 on moved, 3 when nothing was compared. |
| `scvd onpage <url>` | What that page serves a machine reader: title, description, canonical, headings, JSON-LD. |
| `scvd fresh-set` | This week's x402 doors that answered a conformant challenge. |
| `scvd corpus` | The weekly signed, Bitcoin-anchored census, whole. |
| `scvd menu` | What is on the shelf, and for how much. |
| `scvd catalog` | Every developer resource, from the RFC 9727 API catalog. |
| `scvd versions` | Every API version served, its status, and any announced sunset. |

`--json` on any command prints the store's own response verbatim. This
tool is a convenience over a public API, never a second source of
truth — every verdict it renders is one the store served and, where it
signs, one you can check offline with any ed25519 library.

## What it will never do

**It never asks for a credential.** No account, no API key, no wallet,
no seed phrase, no environment variable holding a secret. There is
nothing to issue and nothing to leak, and that is a property of the
store rather than a policy of this tool: free shelves are open, paid
ones take a signed x402 payment per request that settles
wallet-to-wallet.

**It cannot spend money.** It holds no key and signs nothing, so it
cannot complete a paid purchase even if you asked it to. Paid shelves
belong in an x402 client you already trust, or in the MCP server at
`https://scvd.store/mcp`.

**It stores nothing.** No config file, no cache, no telemetry.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The instrument ran and the answer was yes. |
| `1` | The instrument ran and the answer was no — a `not_ready` verdict, an invalid artifact, an id that does not verify. |
| `2` | You asked for something the store refused as malformed. |
| `3` | The store, or the network between you and it, did not answer. Also the probe-budget refusal. |

A `preflight` verdict of `unreachable` exits `0`, deliberately: it is a
statement about the network path at one moment and not a finding about
the endpoint, and a CI job that treated it as one would be drawing a
conclusion the evidence refuses.

## In a deploy

The same `preflight`, as a GitHub Action with the same exit law:
[`action/preflight`](https://github.com/seancrecord/scvd-general-store-repo/tree/main/action/preflight)
— `uses: seancrecord/scvd-general-store-repo/action/preflight@main`
with `urls`, one probe per door, `not_ready` fails the job and
`unreachable` does not unless the workflow says so.

## Pointing it somewhere else

```
SCVD_BASE_URL=https://staging.example scvd preflight https://...
scvd --base https://staging.example preflight https://...
```

## The rate limit, shown rather than swallowed

The free preflight is metered — it spends an outbound request to a
host you choose — and every answer carries the IETF `RateLimit`
fields. `scvd preflight` prints what is left and when the bucket
rolls, so a loop can pace itself instead of discovering the ceiling by
being refused. Checking many doors at once is better served by `scvd
fresh-set` or `scvd corpus`, which cost no probes at all.

## Links

- Developer documentation: <https://scvd.store/developers>
- OpenAPI 3.1 contract: <https://scvd.store/openapi.json>
- API catalog (RFC 9727): <https://scvd.store/.well-known/api-catalog>
- Versioning and deprecation policy: <https://scvd.store/deprecation>
- Source: [`cli/`](https://github.com/seancrecord/scvd-general-store-repo/tree/main/cli)
