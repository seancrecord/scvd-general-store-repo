# THE DIRECTORY BLITZ — every venue worth a listing, one page

> NOTE 2026-08-19: partially superseded — ClawHub is at v3.x per
> registry/clawhub/published.json (the "republish to 2.0.0 pending"
> line below is history), and DISTRIBUTION.md now lives in
> docs/archive/. Procedure stands; counts and versions do not.

Surveyed 2026-07-23. Keeper's word: "don't mind just blasting out
everywhere." Doctrine still applies per docs/archive/DISTRIBUTION.md: as ourselves,
once per venue, never bump, free listings only, nothing that wants a
token or credentials. Every prober that starts hitting the store gets
its UA added to the infrastructure classifier so the books stay honest
(watch /admin window-shoppers after each submission).

## Already standing (no action)

- **x402 Bazaar (Coinbase CDP)** — listed automatically at first settle;
  every buy route carries discovery extensions.
- **x402scan** — passive: indexes /.well-known/x402(.json), which we
  serve. "On x402scan" stays unclaimed until seen.
- **ClawHub** — scvd-general-store, standing. The published version
  lives in registry/clawhub/published.json (the only status source —
  a number copied here went stale twice; 3.4.0 as of 08-20, with a
  3.4.1 republish queued on the keeper).
- **awesome-x402** — RESUBMITTED 2026-07-27 to the live list:
  xpaysh/awesome-x402 PR #1024 (open, mergeable). The 07-22 PR went
  to brooks091/awesome-x402, a dead fork of it (0 stars, no
  maintainer, last upstream commit 2025-11) — left open, nobody home.
  Entry copy re-cut per the claims audit in awesome-x402-submission.md.
- **Agentic.market** — draft ready, GATED by the keeper's own rule until
  organic mcp + bazaar settles both show in /admin.

## Submit now (keeper hands, ~15 minutes total)

### 1. nohumans.directory — curl POST (command already in hand)
Probes every 15 min; verified after 3 passes; on-chain-proven buyer
reports. SAVE THE claim_token FROM THE RESPONSE — shown once, it is
the only edit key. After verification, the badge at
`https://nohumans.directory/badge/{id}.svg` can hang in the README.

### 2. x402scout.com — free form or POST /register
"Canonical registry, trust scores 0-100, MCP-native, rescans every 6h."
Form on the homepage: Service URL `https://scvd.store/api/buy/hello`,
Category: closest fit (their list: Agent/Compute/Data/.../Utility/Other
— "Other" is honest), Name: Sean-Claude Van Damme's General Store.
Free; scanned within 6 hours.

### 3. x402-list.com — check first, then /submit or claim
They AUTO-IMPORT from the Bazaar and x402scan, so the store may already
be in as `imported:bazaar`. Search the directory for "scvd" or
"Van Damme" first:
- If present as imported: claim it via the owner-update flow at
  `/services/{slug}/update` (an imported listing is not an operator
  endorsement until claimed).
- If absent: submit at https://x402-list.com/submit.

### 4. agent-tools.cloud — verify presence, self-submit if absent
Aggregates x402scan, awesome-x402, CDP Bazaar + self-submissions;
20k+ entries, liveness-probed, refreshed every 6h. The store likely
flows in from the Bazaar on its own; check their x402 directory for
scvd.store, use the provider self-submission only if missing.

### 5. endpoint.x402jp.com — already listed, row is stale; find the refresh path (read 2026-09-03)
A crawler-built index of x402 hosts ranked by catalogued paid routes
(`/hosts`; 19,366 routes across 1,031 hosts on the day it was read,
median 5 routes a host, 282 hosts with one). Nobody submitted us; the
store is row 50. Its own caption is our argument: "a host's route
count reflects the granularity of its route expansion, not the
operator's size" — the top rows are single wrappers slicing one
dataset into a thousand per-query URLs.

The row it shows for scvd.store does not match what we serve, and the
gap is the reason to open it:

| | x402jp row | `/.well-known/x402`, same day |
|---|---|---|
| routes | 61 | 39 |
| median price | 2.5 USDC | 0.99 USDC |
| category | Compute | (our tags say verification, evidence, x402) |

Sixty-one is well past what the well-known file lists, so the
likeliest source is the CDP Bazaar, which keeps every route that ever
settled — retired doors (phantom_check and its kin) included — and
may count method variants separately. Whatever feeds them feeds every
other aggregator that reads the Bazaar, so this is one row of a wider
picture: a buyer scanning the index sees a store bigger and roughly
two and a half times dearer than the one at the counter.

Keeper's hand, in order. The site is unreachable from the coding
sandbox (egress-blocked), so all three are a browser job:
1. LOOK for a claim, refresh, or "report a listing" path on the host
   page, and for any methodology or about page that names the source
   (Bazaar, x402scan, well-known crawl). Free listings only; nothing
   that wants a token or credentials.
2. If it re-reads `/.well-known/x402`, no press is needed beyond
   asking; if it reads the Bazaar, the fix is upstream and the note
   goes to PROBLEMS.md as a Bazaar-retention finding, not to them.
3. Watch /admin window-shoppers for its prober UA afterwards, same as
   every other venue, and add it to the infrastructure classifier.

Sampling frame, separately: 1,031 hosts is a ready-made denominator
for the weekly round, and an outside frame beats our own. The
read-off is in `research/x402-pulse.md` under 2026-09-03 (duplicate
hosts under two domains, a name-squat, a self-claimed count the
crawler could not find).

## MCP registries — DONE (keeper, 2026-07-29)

Submitted. Nothing below is an open action; it is kept as the record
of what was checked before submitting.

## What was verified first

The store's MCP door is a streamable-HTTP endpoint without a server
card (SEP-2127 is still a draft; the store skipped the card on
purpose). The official MCP Registry, Smithery, and PulseMCP each have
their own manifest expectations — verify each one's requirements
against what we actually serve before submitting; do not build a
server card just to get listed unless the keeper decides it's worth it.

## After each submission

1. Watch /admin window-shoppers for the venue's prober UA; report it so
   the infrastructure classifier learns it (keeps organic 402 counts
   honest — nohumans probes every 15 min, x402scout every 6h, x402-list
   monitors uptime continuously).
2. One line in PROJECT_LOG with the date and any claim tokens' location
   (tokens themselves go in the back office, never this repo).
3. The ?src= venue-marker table in /admin shows which papers pull.

## Handshake census — who knocked on the MCP door, 2026-09 (added 2026-09-02)

The door records the `clientInfo.name` every MCP client announces
(the modern revision carries it in `_meta` instead; counted the same).
One month read off the live table, matched to a website where one
could be found. Two outside censuses keep live versions of this same
crowd and were the source for most rows —
[thefomite.com/mcp-observatory](https://thefomite.com/mcp-observatory)
and [fetchgate.dev/tools/agent-census](https://fetchgate.dev/tools/agent-census)
(JSON at `fetchgate.dev/v1/agent-census.json`). Handshake counts are a
floor: concurrent handshakes can lose one.

### Already a trust signal (src/store/trust-signals.ts)

| Handshake name | Site | Page |
|---|---|---|
| glama, glama-mcp-inspector | glama.ai | server + connectors pages |
| smithery-probe | smithery.ai | server page |
| agent-tools.cloud | agent-tools.cloud | service page |
| mcpindex-trust | mcpindex.ai | verdict page |
| x402-observer | x402.fuchss.app | provider page |
| verifymcp-probe | verifymcp.io | store + tab pages, scored (2026-09-02) |
| agentage-mcp-catalog-health | catalog.agentage.io | store + tab pages (2026-09-02) |

### Seen, no page of ours to link

| Handshake name | Site | What it is |
|---|---|---|
| mcpcensus | mcpcensus.com | Health + ownership lookup, 26k servers; returns both our servers to a search, no per-server page found. Crawler page: radixia.ai/census/crawler |
| spanly-health-monitor | spanly.com | MCP observability vendor; `/scan/?url=` lists our tools on demand, keeps nothing |
| sasame-audit | srl-sasame.com | SaSame Observatory: ten-criterion readiness standard, signed "MCP-Ready" certificates, paid alerts. Lookup under the Smithery name returned nothing; retry under the registry name |

### Not yet opened (in handshake order)

| Handshake name | Handshakes | Site | What it is |
|---|---|---|---|
| glimind-probe | 286 | glimind.com | Reliability feed for agent tools; badges, alerts. HTTP crawler is `SentinelOracle`, liveness-only; opt-out at glimind.com/opt-out |
| mcpbeat | 158 | mcpbeat.com | Directory that pings every server every 15 min and publishes status pages; bot page mcpbeat.com/bot/ |
| proofbench-probe | 11 | proofbench.dev/about/probe | MCP registry health probe |
| mcp-checker | 7 | mcpplaygroundonline.com/mcp-checker | Probable match: free spec + health check for a server URL |
| factanker-probe | 7 | factanker.com | Itself a registry-lookup MCP server in the official registry; why it probes is unclear |
| orank-scanner | 7 | orank.ai | Probable match: agent-readiness scoring; thin public detail |
| mcpscan | 6 | modc2.com/mcpscan | MCP index crawler (not mcpscan.ai, not the hergertsynthora endpoint from the August field run) |
| golemreach-trust | 2 | golemreach.com/trust/bot | Liveness + trust monitor |
| mcphq-probe | 2 | mcphq.ai | Directory ranked by installs |
| hultra-link | 2 | donnees.hultra.link/sondes.md | "Link", a verified directory of agent-callable capabilities; publishes what broke since yesterday |
| agent-almanac-snapshot | 1 | agentalmanac.org | Already on this desk (submit returned 500) |

### Named in the public censuses, no site of their own

mcpwatch ("longitudinal MCP security research"), reliability-bureau-spike,
measure-mcp-schema, agent-world-probe ("research; MCP census"),
mcp-observatory (github.com/yhouta/mcp-observatory, a transparency
log), mcpgrade (a CLI scorecard, no hosted directory).

### Unresolved

acton-skill-extractor / acton-probe, avp1-scan, mcp-ledger-probe,
endpointaudit, centinela, zowza-indexer, otter. The two census pages
above are where to look; both were unreachable from the build sandbox.

### Not sites

claude-code, claude-ai, anthropicclaudeai, mcp, other: real clients,
nothing to list.

Fetchgate's table also names crawlers that arrive by user-agent rather
than MCP handshake and are absent from ours: zevruna.com,
mcpwitness.com, mcpqueen.com, toll402.com, clearedindex.com,
aive.global, lastseen.dev, station70.com, discover.paygent.net.

