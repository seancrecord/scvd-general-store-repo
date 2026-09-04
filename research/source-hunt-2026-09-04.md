# The source hunt, 2026-09-04

What else could feed the wards, what it costs, and what could not be
answered from here. Read off in one sitting on the keeper's ask
("i dont know if we have enough sources... how much are the paid? i
could just fund it if its cheap for a few good ones").

## The one caveat that shapes everything below

**The build sandbox's egress is not the Worker's egress.** Most hosts
in this document answered `403` at the proxy's CONNECT, not at their
own door. A host marked unreachable here may well be perfectly
reachable from the deployed Worker, and a host marked reachable is
certainly reachable from both. So "unreachable" below means exactly
one thing: *no response shape could be captured at build time*, which
is a fact about where this was written and not about the directory.

That is why the roster in `src/services/ward-sources.ts` distinguishes
"no reader exists" from "a reader exists and has never got an answer",
and why the source register was built before the readers were. A feed
added on a guessed shape is invisible until something makes it
visible; `/sources` is that something.

## Verified free, reachable, and shipped

| source | what it is | shape |
|---|---|---|
| **x402-list.com** | Open x402 directory, continuously monitored | `GET /api/v1/services?per_page=100&page=N`, no auth, 200 req/min, `meta.total_pages`. **630 services over 7 pages** on 2026-09-04. Reader shipped. |
| **registry.modelcontextprotocol.io** | The official MCP registry | `GET /v0/servers?limit=100&cursor=…`, no auth, cursor-paginated. **90,845 rows across 909 pages**, walked to the end. (A first read cut off at 20,000 set the ward's pass ceiling at 400 pages — under half the registry; caught and fixed the same day.) Reader shipped as the MCP ward's walk. |

Two findings worth keeping from those reads:

**x402-list publishes provenance per row**, which nothing else free
does: `submitted` (472), `imported:bazaar` (155), `imported:x402scan`
(3). That is why it earned a reader over the other candidates — its
rows can be decomposed against frames we already hold instead of being
poured into the union as a lump. It is also the only free relief
available for x402scan, and three rows is a slice, not a substitute.

**x402-list's own two endpoints disagree with each other.** `/status`
answered with 659 services on the day `/services` answered with 630 —
a 29-row gap inside one directory, unexplained. We read `/services`
because it carries hosts and `/status` carries only slugs, and we
leave their discrepancy alone rather than picking the flattering
number. Worth remembering the next time we quote them.

**86% of MCP registry rows carry a remote URL** (1,037 of the first
1,200). The rest are npm and stdio servers with no network address —
real registrations that contribute no host. The ward publishes rows
and hosts as separate figures for exactly this reason: reporting only
hosts would inflate the share of the registry that is remotely
reachable.

## The paid two: still unpriced, and that is the finding

The keeper offered to fund these. **Neither price could be
determined**, and not for want of trying.

**402index.io** — self-describes as 15,000+ paid endpoints across
L402, x402 and MPP, which would make it the largest single frame
available to us, larger than fuchss. Its API docs at `/api-docs`
describe a free tier with L402 payments for higher limits, and it ships
an MCP server (`ryanthegentry/402index-mcp-server`) that would let a
paid read be captured by hand without writing a client first. The docs
page is egress-blocked from here and the price is not quoted in any
search result, on any mirror, or in the MCP server's published
description.

**x402scan.com** — a settlement indexer, the only candidate that
watches money move rather than doors exist. Resource enumeration is
paid; no figure is published anywhere reachable.

**What that means for funding.** The honest answer to "is it cheap?"
is that nobody outside these two companies appears to know, and the
wallet law's own $1-per-action threshold cannot be applied to a price
we have not seen. The unblock for both is unchanged and is a browser
job, not a build job: one hand-run read from the keeper's machine that
captures the price and the response shape in the same sitting. Until
then both stay named-and-unread on `/sources` with that stated, which
is at least now a page rather than a comment in a TypeScript file.

## x402 candidates, named on the roster, unread

All four are egress-blocked from here; all four need one hand-captured
read. Ranked by what they would actually add:

1. **endpoint.x402jp.com** — 19,366 routes across 1,031 hosts when it
   was read by hand on 2026-09-03. The best reason to build this one is
   not its size: its row for this store says 61 routes and a 2.5 USDC
   median against the 39 routes and 0.99 USDC our own well-known file
   serves. That gap is almost certainly the Bazaar's retention of every
   route that ever settled, which means every aggregator reading the
   Bazaar inherits it. Capturing this one buys a measurement of a
   defect that affects several sources at once.
2. **agent-tools.cloud** — 20k+ entries, but it aggregates x402scan,
   awesome-x402 and the Bazaar, two of which we already hold. Measure
   its marginal population against the union before building it.
3. **x402scout.com** — rescans every six hours. Its 0-100 trust scores
   are a standing verdict on operators and would be dropped at the
   parse, not carried and ignored; only the host list would enter.
4. **nohumans.directory** — probes every fifteen minutes, so its list
   is the freshest of the free frames and the one most likely to
   disagree with our weekly picture. Its prober already visits us; the
   relationship exists in one direction and has never been read in the
   other.

Also unbuilt and cheap: **awesome-x402** (`xpaysh/awesome-x402`) is a
static GitHub list, free, and needs no directory API at all.

## The MCP side: what we are missing

`registry/directory-blitz.md` already holds a handshake census of who
knocks on our MCP door. Read as a source list rather than as an
outreach list, it names far more than we read. Sorted by what it would
take to add each:

**Reachable and enumerable, shipped:** the official registry, as above.

**Read by hand with the keeper's key, and it does not fit:**
`glama.ai/api/mcp/v1/servers` — cursor-paginated (`pageInfo.endCursor`,
`?first=100&after=…`), 100 rows a page, `hasNextPage` running past the
first page. Rows are keyed by **repository and Glama page**, carry a
hosting attribute (`hosting:remote-capable` 34, `hosting:local-only`
42, `hosting:hybrid` 23 of the first 100) and a `qualityScore` — and
**no server host anywhere in the row**. The only network URLs are
env-var *defaults* (`localhost:11434`, `api.billingo.hu`), which are a
server's dependencies, not the server. The MCP ward's register is
keyed by host, so admitting Glama would mean inventing hosts from
repository names: a phantom row inflates the denominator every count
is quoted against. It is on the ward's roster as named-and-unread with
that reason; the score is a verdict on operators this store does not
republish. The key was used for two reads from a shell variable, is
written nowhere, and was pasted in a chat transcript — so it should be
rotated, and the replacement lives only as a Worker secret
(`GLAMA_API_KEY`) if a use for it is ever ruled.

**Named, unread, no shape captured** — all egress-blocked here:
`smithery.ai`, `pulsemcp.com`, `mcpcensus.com` (26k servers),
`mcpbeat.com` (pings every server every 15 minutes), `mcphq.ai`,
`mcpindex.ai`, `verifymcp.io`, `catalog.agentage.io`,
`proofbench.dev`, `donnees.hultra.link`.

**Two outside censuses of the same crowd**, both of which would be
frames rather than directories:
`thefomite.com/mcp-observatory` and `fetchgate.dev/tools/agent-census`
(JSON at `fetchgate.dev/v1/agent-census.json`). The second is already
machine-readable and is the cheapest of everything on this page to
add, if it is reachable from the Worker.

**A note on scope, and it is the important one.** None of these should
be folded into the x402 census. `population_known` is the denominator
under `coverage_pct`, and `coverage_pct` rides every corpus snapshot,
every brief and every ledger this store has sealed since July. Adding
MCP servers to it would not widen our coverage; it would retroactively
change what every published percentage was a percentage *of*, with no
correction possible, because the old rows keep their bytes while their
meaning moves underneath them. Hence a second ward with its own
register and no shared totals — `src/services/mcp-ward.ts`, room at
`/mcp-ward`.

## What the MCP ward deliberately does not do

It counts and it does not knock. Probing an MCP server means opening a
session and speaking the initialize handshake — a different battery, a
different consent posture, a different set of failure modes — and this
store has a published preflight battery for x402 doors and nothing of
the kind for MCP. Inventing a verdict to match the other ward's shape
would be the worst available kind of symmetry.

What it gets for free is what the population layer was built for:
mortality without a probe. A server that was listed and is now listed
nowhere is a delisting recorded having never spent a request on it.

## Next hands

Everything below is a browser job for the keeper, not a build:

- One read of `402index.io/api-docs` and of x402scan's pricing, in the
  same sitting, capturing **the price and the response shape**. Both
  roster entries dissolve the moment those exist.
- One read of `endpoint.x402jp.com/hosts`, saved as a fixture.
- A decision on whether a free `glama.ai` key is worth having.

Then the readers are an afternoon each, and each one lands on
`/sources` with its liveness derived rather than asserted.
