# Discovery and identity surfaces, checked for agreement

**Dated 2026-08-25.** A live fetch of every first-party discovery
and identity document this store publishes, plus the third-party
listings `/.well-known/trust.json` names, compared against the
code that writes each one. Written so the next reader does not
treat the self-row's "agree" as "the surfaces agree about
everything."

**What this is.** Gap-finding prompt 6 of the same series as
`docs/SILENT_DEFAULTS_2026-08.md` (prompt 1),
`docs/CLIENT_ABORTS_AND_PUBLISHED_COUNTS_2026-08.md` (prompts 2–3)
and `docs/LIBRARY_VS_STORE_2026-08.md` (prompt 4). Not payments —
the area the self-row was built to sweep, and the area it only
sweeps for *item ids*.

**What this is not.** A ruling. A fix. A claim that the self-row
is broken. The self-row did its job today: twenty-four paid ids
agree across every catalog-bearing first-party surface. The
disagreements live in the facts the self-row does not join.

**Rule of the reading.** Every first-party URL below was fetched
from `https://scvd.store` on 2026-08-25 with a browser UA (the
edge 403s a bare Python client). Every third-party URL is the
one in `EXTERNAL_RECORDS` (`src/store/trust-signals.ts:79–297`).
A claim is a file:line or a live body. The self-row already
exists (`src/discovery/self-row.ts`); this paper names what it
does not look at.

---

## The finding that is the point of the paper

The first-party *shelf* agrees. The first-party *identity* does
not, and almost no third-party listing still describes the store
that is running.

`selfRowFromCatalogs` (`src/discovery/self-row.ts:32`) joins
`route_identity` (item ids) and `service_identity` (the short
name). On today's fetch the twenty-four menu ids are the same
set on `/menu.json`, `/.well-known/x402.json`, `/openapi.json`,
`/llms.txt`, `/skill.md` and `/.well-known/a2a.json`. That is
the fold CI blocks the release on.

It does not join prices, rails, signing keys, dates, capabilities,
or anyone else's listing. Those are the disagreements below.
`menu.json` itself publishes `store.chains: ["base", "solana"]`
while the same response's sibling surfaces list Polygon as a
live rail. An analyst who reads only the catalog root, or only
Glama, or only the Bazaar mirror, is not reading the store.

---

## Surfaces fetched

First-party, all 200, 2026-08-25:

| Path | Writer | Bytes | What it is |
|---|---|---|---|
| `/.well-known/x402` | `src/routes/well-known.ts:213` | 2.9k | Thin indexer list. `version: 1`. |
| `/.well-known/x402.json` | `well-known.ts:241` | 127k | Full catalog. `x402Version: 2`. |
| `/.well-known/mcp` | `well-known.ts:568` | 1.2k | Pointer at `POST /mcp`. No shelf. |
| `/.well-known/did.json` | `src/routes/did.ts:36` | 1.8k | `did:web:scvd.store`. Current key only in `verificationMethod`. |
| `/.well-known/trust.json` | `well-known.ts:89` | 31k | Diligence document. Names the third-party list. |
| `/.well-known/a2a.json` | `well-known.ts:485` | 25k | A2A card. Same body at `agent-card.json` / `agent.json`. Not in the prompt; the self-inventory includes it. |
| `/.well-known/scvd-signing-key` | `src/routes/verify.ts:756` | 3.1k | Hex key + history. Adjacent; catalogs point here. |
| `/openapi.json` | `src/routes/openapi.ts:409` | 938k | OpenAPI 3.1. `info.version: 0.3.0`. |
| `/menu.json` | `src/routes/catalog.ts:99` | 117k | Canonical shelf. 24 items. |
| `/llms.txt` | `src/routes/llms.ts:1140` | 88k | Agent briefing. Catalog lines derived; translations are not. |
| `/agents.md` | `src/routes/agents-md.ts:120` | 10k | Operational manual. Points at `/menu.json`. No item ids. |
| `/skill.md` | `src/routes/skill.ts:56` | 26k | SKILL.md. Table derived; several prose lines are not. |
| `/sitemap.xml` | `src/routes/site-meta.ts:80` | 5.5k | Human rooms + `/menu/{id}` + directory. No machine doors. |

Also fetched, not in the prompt list: `/.well-known/liveness.json`
(signing-key sibling) and `POST /mcp` `tools/list` (10 tools).

Third-party, from `trust.json` `external_records`, same day:

| Registry | HTTP | What answered |
|---|---|---|
| x402scan | 200 | Title still "Sean-Claude Van Damme's General Store — x402 goods for AI agents". 20 `/api/buy/` ids, including retired ones. |
| agentic.market | 200 | "SCVD General Store". **Network: EIP155:137**. 18 endpoints. Price band $0.004–$25. |
| x402-list.com | 200 | Identity title current. **status: DEGRADED**, **endpoints: 15**, pay **$0.004 to $19.00**. |
| Smithery | 200 | "scvd.store - MCP". 97/100. Tool-count not visible in the HTML. |
| mcp.so | 200 | Rails current. Cheapest door still **"half a cent"**. |
| x402-bazaar.com | 200 | One resource: `small_blessing`. Store identity = that item. MCP tool `buy_small_blessing`. Base + Solana, no Polygon. Last updated 2026-08-19. |
| Glama | 200 | "quirky, human-run digital general store". **USDC on Base** only. Lists retired SKUs (daily fortune, dibs, quick_judgment, phantom, app review $50, phone call). |
| m8ven.ai | 200 | Score 89/100. **Declares 18 tools.** Live catalog is 10. |
| DeepWiki | 200 | Last indexed **11 August 2026**. "Payment Rails: Base & Solana". |
| AIR | 200 | Lookup shell; the id did not resolve in the HTML we received. |
| Cursor Directory | 429 | Vercel checkpoint. Not read. |
| mcpmarket.com | 429 | Same. Not read. |

The store's own environment cannot reach these hosts
(`trust-signals.ts:75–76`). Today's fetch is a keeper-side walk,
the same class as the `confirmed` dates on that list.

---

## What the self-row already joins — and stops

`OWNED_DISCOVERY_SURFACES` (`src/discovery/self-surfaces.ts:40–78`)
lists nine first-party doors. `carries_shelf: true` on six:
`menu.json`, `llms.txt`, `skill.md`, `openapi.json`,
`/.well-known/x402.json`, `/.well-known/a2a.json`.

The join (`src/discovery/self-coherence.ts:48–61`) extracts
`route_identity` and `service_identity` only
(`src/discovery/claims.ts`). `/.well-known/x402` (thin),
`/.well-known/mcp` and `/agents.md` are inventoried and then
excluded from the shelf join. `did.json`, `trust.json`,
`sitemap.xml` and every third-party URL are not in the inventory
at all.

A `discovery_coherence` envelope pointed at us that says `agree`
means: the paid ids match. It does not mean the rails match, the
name matches, the date matches, or Glama is describing this store.

On this branch, `freshness-coherence.ts` and
`capability-claims.ts` exist as the next batteries. They are not
the live fold. Today's production self-row is still ids.

---

## Matrix: facts asserted in more than one place

### 1. The name

| Surface | Value |
|---|---|
| `/.well-known/x402` `name` | `SCVD General Store` |
| `/.well-known/x402.json` `name` / `serviceName` | `SCVD General Store` |
| `/menu.json` `store.name` | `SCVD General Store` (override of `STORE_METADATA.name`, `catalog.ts:143`) |
| `/openapi.json` `info.title` | `SCVD General Store` |
| `/.well-known/a2a.json` `name` | `SCVD General Store` |
| `/.well-known/mcp` `title` | `SCVD General Store` |
| `/.well-known/mcp` `name` | `scvd-general-store` |
| `/skill.md` YAML `name` | `scvd-general-store` |
| `/skill.md` H1 | **`Sean-Claude Van Damme's General Store`** (`STORE_METADATA.name`, `skill.ts:77`) |
| `did:web` | `did:web:scvd.store` |
| x402scan `<title>` | Sean-Claude Van Damme's General Store — x402 goods for AI agents |
| agentic.market / bazaar | SCVD General Store |
| x402-list `<title>` | scvd.store — evidence observatory for the x402 economy |
| Glama / DeepWiki / m8ven | Sean-Claude Van Damme's General Store (or "scvd-store-MCP") |

`STORE_SERVICE_NAME` is the 32-character catalog name
(`src/store/metadata.ts:101`) because the full name is 37
characters and the x402 SDK drops it. The H1 on `/skill.md` is
the one first-party machine surface that still leads with the
full name. A reader who opens the skill and the x402 catalog
side by side is looking at two legal names for one till.

### 2. The rails

Live till: `acceptedNetworks()` (`src/lib/payments.ts:110–114`)
returned `eip155:8453`, `eip155:137`,
`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`. Polygon is on.

| Surface | What it says | Agree? |
|---|---|---|
| `/.well-known/x402` `networks` | all three | yes |
| `/.well-known/x402` `network` | `eip155:8453` only | singular, documented (`well-known.ts:221–224`) |
| `/.well-known/x402.json` | same pair | yes / singular |
| `/menu.json` `store.network` | `eip155:8453` | singular |
| `/menu.json` `store.chain` | `"base"` | predates the second rail (`metadata.ts:36–38`) |
| `/menu.json` `store.chains` | **`["base", "solana"]`** | **no Polygon** |
| `/llms.txt` English | Base, Polygon, Solana (`llms.ts:318`) | yes |
| `/llms.txt` ES / PT / JA / KO / ZH / RU | **"Base or Solana"** (`llms.ts:1111–1133`) | **no Polygon** |
| `/skill.md` YAML `compatibility` / `currency` | all three | yes |
| `/skill.md` buying walkthrough | **"Base entries first, Solana entries after"** (`skill.ts:227`) | **no Polygon** |
| `/skill.md` worked `@x402/fetch` example | Base scheme only (`skill.ts:241–244`) | sample, not a claim of exclusivity |
| `/agents.md` | all three, "Base then Polygon, Solana after" | yes |
| `/openapi.json` `info.description` | all three | yes |
| `/openapi.json` `info.x-guidance` | settlement_attestation is **"Base/Solana"** | **no Polygon** |
| `/.well-known/trust.json` `independently_checkable.settlement` | Base, Polygon, or Solana | yes |
| bazaar mirror | Base + Solana. No `137`. Last updated 2026-08-19 | **no Polygon** |
| Glama | "USDC on Base" | **Base only** |
| DeepWiki nav | "Payment Rails: Base & Solana" | **no Polygon** |
| agentic.market header | **`Network EIP155:137`** | **Polygon as the one network** |
| x402-list / mcp.so | Base / Polygon / Solana | yes |

The first-party disagreement that will travel furthest is
`menu.json` `store.chains`. That field is `STORE_METADATA.chains`
(`metadata.ts:39`), spread into the catalog root
(`catalog.ts:139`). It was last typed when there were two rails.
The 402, the x402 catalog `networks` array, and the English
briefing all say three. The field a resolver reads on the
canonical shelf says two.

### 3. The item list

Twenty-four paid ids on `/menu.json`, live:

`attestation_bundle`, `bitcoin_anchor`,
`certificate_of_patronage`, `coffees_for_closers`,
`conformance_watch`, `context_anchor`, `graffiti_on_a_train`,
`hello`, `launch_check`, `luckies`, `onpage_audit`,
`passport_refresh`, `recurring_patronage`, `service_audit`,
`settlement_attestation`, `settlement_reconciliation`,
`signature_agent_card`, `small_blessing`, `standing_watch`,
`the_collab`, `the_confession`, `the_mandate`, `the_statement`,
`trust_profile`.

| Surface | Paid ids | Extra |
|---|---|---|
| `/menu.json` | 24 | none |
| `/.well-known/x402` | 24 buy URLs | **6 almanac pages** |
| `/.well-known/x402.json` | 24 | same 6 almanac (`well-known.ts:263–272`). Gazette issues: none live, so none listed. |
| `/openapi.json` | 24 `/api/buy/{id}` paths | almanac/gazette paths when they exist |
| `/llms.txt` catalog lines | 24 | none |
| `/skill.md` table | 24 | none |
| `/.well-known/a2a.json` skills | 24 + `verify` | `verify` is free, named |
| `POST /mcp` `tools/list` | 24, clustered into 5 `buy_*` tools + `buy_simple` overlay | 4 free tools. `hello` is on both `buy_simple` and `buy_signed_record`; `small_blessing` on `buy_simple` and `buy_small_pleasure`. |
| `/.well-known/mcp` | **none** | pointer + 5 resource names |
| `/agents.md` | **none** | points at `/menu.json` |
| `/sitemap.xml` | 24 `/menu/{id}` | human rooms, directory slugs, `/gazette/founding`. **No** `/llms.txt`, `/menu.json`, well-known, `/openapi.json`. |

First-party catalogs agree on the 24. x402 surfaces *also* sell
the almanac; menu.json does not list those as items. That is a
real second shelf, not a drift — an indexer that treats
`/.well-known/x402` as "what they sell" counts 30; a reader of
`/menu.json` counts 24.

Third-party lists do not agree:

| Listing | `/api/buy/` ids found | Retired / invented | Missing current |
|---|---|---|---|
| x402scan | 20 | `daily_fortune`, `dibs`, `quick_judgment`, `thing` | `small_blessing`, `standing_watch`, `the_mandate`, `bitcoin_anchor`, `passport_refresh`, `trust_profile`, `coffees_for_closers` |
| agentic.market | 19 | `thing` | `attestation_bundle`, `launch_check`, `the_mandate`, `passport_refresh`, `trust_profile` |
| x402-list | 15 (stated) | — | `the_collab` not in the visible body; price cap implies it is out |
| bazaar (this URL) | 1 (`small_blessing`) | tool name `buy_small_blessing` | the other 23 |
| Glama | narrative list | phantom $0.25, daily fortune, dibs, quick_judgment $3, app review $50, portrait, phone call, keeper's name, unique secret | most of the current observation shelf |

`thing` is the placeholder in the `launch_check` example URL
(`skill.ts:192`). Two directories ingested the example as a SKU.

### 4. Prices

On the first-party catalogs, `price_usdc` / `price_tiers_usdc` /
`price_usdc_options` / the skill table / the A2A `$N` in each
skill description **agree** for every id. The self-row does not
check this; today's fetch did. No first-party price mismatch.

What disagrees is the *range* and the *cheapest-door* line:

| Surface | Claim | Code |
|---|---|---|
| `CHEAPEST_ON_THE_SHELF` / menu floor | **$0.004** (`settlement_attestation`) | `src/store/copy/position.ts:76` |
| `/skill.md` "cheapest door that needs no arguments" | **"half a cent"** = `small_blessing` $0.005 | `skill.ts:103–107`. True of that door. Not the shelf floor. |
| `/openapi.json` `x-guidance` | "$0.004–$25" | matches min/max of `MENU_ITEMS` |
| x402-list | **"$0.004 to $19.00"** | misses `the_collab` at $25 |
| agentic.market | "$0.004 – $25.00" | matches |
| mcp.so | **"cheapest thing on the shelf is half a cent"** | stale floor. The derived constant is $0.004 since 2026-08-24 |
| bazaar | $0.005 for the one resource it shows | correct for `small_blessing`; that price is also the store's identity on that page |

### 5. Signing keys

| Surface | What it publishes |
|---|---|
| `/.well-known/scvd-signing-key` | hex `8c22f61add…cb550`, in service 2026-07-31, one retired key |
| `/.well-known/did.json` | same key as JWK `x`, kid `did:web:scvd.store#key-2`. Retired key in `scvd.retired_keys`, **not** in `verificationMethod` |
| catalogs / trust / a2a | URL pointer only |

The hex and the JWK decode to the same 32 bytes. The comment on
the signing-key document (`verify.ts:811`) is true of the *current*
key. A reader who only resolves did:web and ignores `scvd.*` does
not see the retired key; that is intentional (`did-document.ts`
retired-keys note) and is the DID mutability problem the history
page exists to answer.

Pay-to addresses do **not** appear on `/menu.json` or
`/.well-known/x402.json`. The Bazaar mirror published both
(`0xDD35…bd0` Base, `DGxc…vMgE` Solana) from a live 402. An
analyst comparing catalogs will not find a payee to bind.

### 6. Endpoints and capabilities

| Fact | Surfaces that state it | Disagreement |
|---|---|---|
| MCP endpoint is `POST /mcp`, streamable HTTP | `/.well-known/mcp`, a2a `url` / `additionalInterfaces`, menu `store.mcp`, developers | none |
| A2A protocol | a2a card says it does **not** speak A2A; `preferredTransport: "MCP"` (`well-known.ts:469–477`) | honest. A strict A2A client that ignores the note will still POST JSON-RPC at `/mcp` and fail |
| Free preflight path | skill.md: `POST /api/preflight` (unversioned alias, `preflight.ts:138`). OpenAPI documents **`/api/preflight/v1` only**. `v2` exists in code (`PREFLIGHT_VERSION_NEXT`) and is **absent from OpenAPI** | versioned contract vs alias vs next battery |
| MCP prompts | well-known `capabilities.prompts: false` **and** `free_methods` includes `prompts/list`. Initialize advertises `prompts: { listChanged: false }`. `prompts/list` returns `[]` (`mcp.ts:666`) | the pointer says "no prompts"; the handshake and the free-method list say the method exists |
| OpenAPI documents | `/menu.json`, `/.well-known/x402`, `x402.json`, `mcp`, `agent-instructions`, `scvd-signing-key` | **does not document** `/skill.md`, `/agents.md`, `/llms.txt`, `/.well-known/did.json`, `/.well-known/trust.json`, `/sitemap.xml`, `/.well-known/a2a.json` |

### 7. Dates and version numbers

| Surface | Date / version | What it is |
|---|---|---|
| `/menu.json` `as_of` | **2026-08-21** | `catalogLastUpdated()` (`src/lib/freshness.ts:48`) |
| `/.well-known/x402.json` `as_of` | 2026-08-21 | same function |
| `/llms.txt` "Last checked by hand" | 2026-08-21 | same |
| `/sitemap.xml` `<lastmod>` on **every** URL | 2026-08-21 | same. One date stamped on 62 pages |
| a2a `version` | 2026-08-21 | `freshness().as_of` (`well-known.ts:500`) — a date in a version field |
| `/.well-known/x402` | `version: 1` | thin-document schema, not the protocol |
| `/.well-known/x402.json` | `x402Version: 2` | protocol |
| `/openapi.json` `info.version` | **`0.3.0`** | hand-typed (`openapi.ts:422`) |
| `/skill.md` `metadata.version` | **`3.7.0`** | `SKILL_VERSION` (`src/store/spec.ts:121`) |
| MCP `initialize` `serverInfo.version` | **`0.4.0`** | hand-typed (`mcp.ts:611`) |
| bazaar "Last updated" | 2026-08-19 | their crawl |
| DeepWiki "Last indexed" | 2026-08-11 | their crawl |
| `EXTERNAL_RECORDS[].confirmed` | 2026-07-27 … 2026-08-18 | keeper opened the URL |

Three first-party "version" fields are three different clocks.
None of them is derived from the others. An importer that sorts
by `info.version` will treat the OpenAPI document as older than
the skill and the MCP handshake as a fourth number.

`catalogLastUpdated()` reads **directory.json**, the trust-list
`last_checked` dates, and almanac entry dates
(`freshness.ts:48–54`). It does **not** read `MENU_ITEMS`,
`SKILL_VERSION`, or `STORE_METADATA`. A shelf change that does
not touch those three bodies leaves every `as_of` and every
sitemap `lastmod` where it was. Today's `as_of` is the trust-list
check of 2026-08-21. The 30-day `catalog_stale` guard
(`src/services/health.ts:87`) has not fired; it also would not
fire if the menu moved and those dates did not.

---

## Disagreements (first-party, named)

These are two of *our* documents stating a different value for
the same fact. Third-party drift is the next section.

1. **`menu.json` `store.chains` omits Polygon.** Live
   `acceptedNetworks()` includes `eip155:137`. `STORE_METADATA.chains`
   is still `["base", "solana"]` (`metadata.ts:39`). The catalog
   root a resolver reads first is the stale list.

2. **`/llms.txt` translations omit Polygon.** Six language
   blocks (`llms.ts:1111–1133`) still say Base or Solana. The
   English body, three lines above the translation heading, lists
   three rails. A non-English agent is being briefed on a
   two-rail store.

3. **`/skill.md` purchase walkthrough omits Polygon.**
   `skill.ts:227`: "Base entries first, Solana entries after."
   `/agents.md` on the same day: "Base then Polygon, Solana after."
   The skill is the file an agent is told to cache.

4. **`/skill.md` H1 is the long name.** Every other first-party
   machine title is `SCVD General Store`. The skill YAML name is
   the slug. Three spellings, one store.

5. **OpenAPI `x-guidance` still says settlement is Base/Solana.**
   `openapi.ts:442`. `trust.json` and the skill's attestation
   recipe say the identifier's shape picks Base, Polygon, or
   Solana.

6. **Three version numbers, none derived from each other.**
   OpenAPI `0.3.0`, skill `3.7.0`, MCP `0.4.0`, a2a `version`
   = `as_of` date. A reader comparing "which document is current"
   has no common axis.

7. **MCP prompts: the pointer and the handshake disagree.**
   `/.well-known/mcp` `capabilities.prompts: false`
   (`well-known.ts:591`) while `free_methods` includes
   `prompts/list` and `initialize` advertises a prompts
   capability. The method exists and returns an empty list.
   A scanner that believes the capability flag skips the method;
   a scanner that believes `free_methods` calls it and finds
   nothing. Both readings are in the same 1.2k document.

8. **x402 thin `version: 1` vs x402.json `x402Version: 2`.**
   Different fields, different meanings (document shape vs
   protocol). An indexer that compares the two keys as the same
   fact will report a protocol downgrade that is not one.

9. **`/sitemap.xml` `lastmod` is one date on every URL.**
   Including `/gazette/founding`, `/pulse`, and every `/menu/{id}`.
   It is `catalogLastUpdated()`, not a per-page clock. A crawler
   that treats `lastmod` as "this page changed" is being lied to
   in the small way: the stamp moved because a trust-list row
   was re-checked, not because `/what` changed.

---

## Third-party listings: the same facts, not our code

`EXTERNAL_RECORDS` already records several of these as known lag
(`trust-signals.ts` per-entry notes). Today's fetch is whether
the lag has cleared. It has not.

| Listing | `confirmed` in trust.json | Live disagreement with first-party |
|---|---|---|
| x402scan | 2026-07-27 | Title is the pre-repositioning goods-shop line. Item list includes four retired ids (`daily_fortune`, `dibs`, `quick_judgment`, `thing`) and misses seven current ones. |
| agentic.market | 2026-07-27 | Header network is **Polygon**. 18 endpoints vs 24 ids / 30 x402 resources. Trust copy still says "fourteen." Ingested `thing`. |
| x402-list | 2026-08-02 / 08-11 | **DEGRADED**, 15 endpoints, price ceiling **$19** (misses $25). Positioning title is current. |
| Glama | 2026-07-31 | Base-only. Narrative catalog is the **pre-curation shelf** (phantom, fortunes, dibs, judgments, $50 app review, phone call). "Quirky general store." |
| bazaar mirror | 2026-08-04 | Store = `small_blessing`. Tool `buy_small_blessing` (retired 2026-08-02). No Polygon. Crawl 2026-08-19. |
| mcp.so | 2026-08-10 | Rails current. Floor still **"half a cent."** |
| m8ven | 2026-08-18 | **18 tools.** Live `tools/list` is 10. Description is the old shop. Re-checks on push; the count has not moved. |
| DeepWiki | 2026-08-11 | Indexed 2026-08-11. Rails: Base & Solana. Full name. No observatory lead. |
| Smithery | 2026-08-11 | Trust copy still warns about "0 of 27" annotations. Today's HTML did not repeat that number; it also did not show 10. Unresolved without their scan JSON. |
| AIR | 2026-08-01 | Lookup page did not render the passport in this fetch. Score 470/1000 in our record is 24 days old. |
| Cursor Directory / mcpmarket | 2026-08-11 | **429.** Not confirmed today. |

Invisible to us, in the store's own sense: every one of these.
The Worker cannot fetch them. `confirmed` is a date a person
typed after opening a tab. Nothing in `health.ts` walks this
list. The freshness guard watches `as_of`, not Glama.

---

## Facts in only one place that another surface's reader would expect

The test is not "is it published somewhere." It is "would a
reader of *that* surface reasonably look *here*."

| Fact | Lives only (or first) on | A reader of … would expect it |
|---|---|---|
| Polygon is a live rail | x402 `networks`, English llms, skill YAML, agents.md, OpenAPI description | `/menu.json` `store.chains`, llms translations, skill walkthrough, OpenAPI `x-guidance` |
| Pay-to addresses | live 402 / Bazaar scrape | `/menu.json` store block, `/.well-known/x402.json` (they publish price and network, not payee) |
| Current + retired signing keys as bytes | `did.json` + `scvd-signing-key` | catalogs only link. Correct, as long as the link is followed. x402scan's own copy says it reads x402 + OpenAPI and never has to. |
| Almanac as a paid resource | x402 thin + x402.json only | `/menu.json` items, skill table, llms catalog, A2A skills. A buyer who only reads the menu cannot discover the almanac as a 402 door. |
| MCP tool names | `tools/list` / `mcp-tools.ts` | Bazaar still names `buy_small_blessing`. `/.well-known/mcp` lists resources, not tools. |
| Operator legal entity | `trust.json` `operator`, a2a `provider` | `/menu.json` `store` has location and refund policy, no LLC. |
| Preflight **v2** | code (`PREFLIGHT_VERSION_NEXT`) | `/openapi.json` paths. A contract reader sees v1 as the only battery. |
| `did:web` document | `/.well-known/did.json` | `/openapi.json` (signing-key is listed; did is not). |
| What a signature does not prove | `trust.json` / `/attestation` | x402.json *does* link `attestation` and `trust` (`well-known.ts:318, 328`). menu.json does too. The thin x402 document links `trust` and `did` but not `/attestation`. |
| Third-party listings and their known wrong readings | `trust.json` `external_records` only | `/llms.txt` and `/skill.md` do not warn that Glama/x402scan still sell retired SKUs. |
| `/gazette/founding` exists | sitemap (conditional, `site-meta.ts:108`) | x402 resources (no gazette issue listed). The founding edition is a room, not a 402 resource, and only the sitemap says it is there. |
| A2A is a discovery card, not a transport | a2a card `x_scvd_note` | OpenAPI does not list the card. An A2A crawler that never reads the note is the audience the note was written for. |

---

## What is supposed to keep each surface current

| Surface | Mechanism | Touches the shelf? | What it cannot see |
|---|---|---|---|
| `/menu.json` | Rendered from `MENU_ITEMS` per request (`catalog.ts:111`) | yes | `STORE_METADATA.chains` is a typed constant, not `acceptedNetworks()` |
| `/.well-known/x402.json` | `MENU_ITEMS` + live almanac + live gazette (`well-known.ts:245–305`) | yes | singular `network` is hardcoded Base |
| `/.well-known/x402` | `paidResourceUrls()` — same three sources | urls only | no prices, no `as_of` |
| `/llms.txt` catalog lines | `MENU_ITEMS` via `menuLine` (`llms.ts:21–37`) | yes | **translations are hand-typed** |
| `/skill.md` table + `shelfPrice()` | `MENU_ITEMS` (`skill.ts:20–51, 58`) | yes | **"half a cent"**, **"Base then Solana"**, launch_check "$5", the_statement "$2" are prose. The last two currently match; the first two do not stay true by construction |
| `/openapi.json` buy paths | `MENU_ITEMS` (`openapi.ts:312`) | yes | `info.version`, `x-guidance` are hand-typed |
| A2A skills | `MENU_ITEMS.map` (`well-known.ts:510`) | yes | prices are `item.price_usdc` (min), not tiers |
| MCP tools | `SHELF_CLUSTERS` + `unshelvedItemIds()` test (`mcp-tools.ts:758`) | yes, clustered | tool *count* on third parties has no feed |
| `/.well-known/mcp` | static pointer | no | will not grow a shelf; by design |
| `/agents.md` | static manual | no | will not grow a shelf; by design (`self-surfaces.ts:73–76`) |
| `/sitemap.xml` | `ROOMS` + directory + `MENU_ITEMS` + founding (`site-meta.ts:85–98`) | paths yes | **excludes every machine surface**, stated (`site-meta.ts:14–15`). `lastmod` is one derived date |
| `did.json` | `buildDidDocument()` from live secret + registry (`did-document.ts:26`) | n/a | current-state only in `verificationMethod` |
| `scvd-signing-key` | same derivation | n/a | — |
| `trust.json` | constants + `EXTERNAL_RECORDS` | n/a | **`confirmed` is hand-typed. No fetch. No cron.** |
| `as_of` / sitemap `lastmod` / llms "last checked" | `catalogLastUpdated()` from directory + trust-list + almanac | **not from the menu** | a new SKU does not bump the date |
| `catalog_stale` alert | `daysSinceUpdate() >= 30` (`health.ts:87`) | that date only | will not fire because Glama is wrong |
| Self-row / CI | item ids across six catalogs | ids only | prices, rails, keys, dates, third parties |
| Third-party listings | their crawler / our `confirmed` date | **no store-side mechanism** | the Worker cannot reach them |

### Surfaces with no mechanism

Named, not implied:

1. **Every third-party listing.** The comment on
   `EXTERNAL_RECORDS` (`trust-signals.ts:70–76`) is the mechanism:
   a person opens the URL. There is no other.

2. **`STORE_METADATA.chains`.** Typed. Not derived from
   `acceptedNetworks()`. This is how Polygon disappeared from
   `menu.json` while appearing on the 402.

3. **`/llms.txt` translation rails.** Six blocks, hand-maintained,
   already stale on the third rail.

4. **`/skill.md` walkthrough rails and "half a cent."**
   Adjacent to derived `shelfPrice()` calls, which makes the
   typed lines look derived.

5. **`/openapi.json` `info.version` and `x-guidance`.**
   The paths are derived; the elevator paragraph is not.

6. **MCP `serverInfo.version` (`0.4.0`).** No shared version
   constant with OpenAPI or the skill.

7. **`/.well-known/x402` `network` (singular).** Intentionally
   frozen on Base for parsers that learned one string. `networks`
   is the honest list. A parser that only reads `network` is
   the audience this paper keeps failing.

8. **`trust.json` `external_records[].confirmed`.** A date with
   no checker. Same class as the old "nine days old" line that
   `WHAT_IT_IS` had to stop claiming (`trust-signals.ts:375`).

---

## What an outside analyst would conclude wrongly

Reading only `/menu.json` `store.chains`: we accept Base and
Solana. Polygon 402s look like a surprise door.

Reading only `/skill.md`: the store's name is the long one; the
cheapest practice door is half a cent; the 402 offers Base then
Solana; `POST /api/preflight` is the conformance battery (the
line at `skill.ts:159` calls preflight "the published conformance
battery" — that sentence names the wrong desk).

Reading only `/.well-known/x402`: thirty resources, one network
string, no prices, document version 1. The richer catalog is
linked as `catalog` and is easy to miss if the parser stops at
`resources`.

Reading only `/openapi.json` `info.version`: the contract is
0.3.0 and settlement attestation is a two-rail instrument.

Reading only `/sitemap.xml`: the machine doors do not exist.
The comment says that is on purpose. A search-index auditor who
grades "are the API docs in the sitemap" will fail us for a
decision we documented.

Reading only Glama, x402scan, or the Bazaar mirror: we still sell
fortunes, dibs, a $50 app review, a phone call, and a lucky
named `thing`; we take USDC on Base; our MCP tool is
`buy_small_blessing`; we are a quirky shop. Those pages are in
`trust.json` as evidence we exist. They are also the pages an
agent will be handed if its directory of record is one of them.

Reading a `discovery_coherence` self-row of `agree`: the ids
match. That is all it said. This paper is the rest of the
sentence.

---

## Provenance

Gap-finding prompt 6, 2026-08-25, against live `scvd.store` and
this tree (`phase1/freshness-coherence` plus whatever `main` had
already deployed). Prompts 1–4:
`docs/SILENT_DEFAULTS_2026-08.md`,
`docs/CLIENT_ABORTS_AND_PUBLISHED_COUNTS_2026-08.md`,
`docs/LIBRARY_VS_STORE_2026-08.md`.

Cursor Directory and mcpmarket.com 429'd. AIR's lookup did not
render a passport in the HTML. Those three are not evidence of
agreement.

Nothing here is a keeper ruling. Re-fetch the URLs before acting;
if `store.chains` has been derived from `acceptedNetworks()` and
the translations name Polygon, the first-party half of this
paper is the thing that went stale. The third-party half goes
stale on their next crawl, which we will not see.
