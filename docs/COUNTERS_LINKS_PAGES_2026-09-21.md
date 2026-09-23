# Counters, links, pages — the plan after the September read

**Status: BUILT 2026-09-21, the same day it was proposed, and merged
as #883 on 2026-09-22. The four rulings in section 6 were
taken by the keeper in session (R1 yes with did:key beside, R2 the
Durable Object, R3 publish enveloped, R4 drafted, then inked by the
keeper 2026-09-23 with its mechanism sentence narrowed to the routes
the register actually covers) and each
phase shipped as its own commit; what each commit holds is in its
message. Two things the build changed against this plan: the host
page was not registered as a room (its path varies per host, so the
room's deeper rung could never fire there; the derived next step is
rendered on the page directly), and the cold pass runs on a schedule
as a workflow that keeps its output as a run artifact for the keeper
to promote, never committing transcripts. One cost to know, which stopped being a
cost before the branch merged: admitting buy_mandate first moved the
MCP catalog byte ceiling from 152,000 to 165,000, and measuring it
found every tool repeating the same 6 KB of errors and security
prose. Rather than pay that, the branch trimmed it — the refusal
vocabulary and the two shared invariants now live once on /mcp.md and
each tool carries the code, the charged flag and a URL. tools/list is
122,916 bytes with buy_mandate on the shelf and the ceiling is back at
152,000. Merged as #883 on 2026-09-22.** Originally dated 2026-09-21
as PROPOSED.

## 1. Why

Two pitches arrived in September: publish the buyer data, make the
verify page a storefront, flip `aura_walk` inward, run price
experiments, cut the catalogue, define the mandate; then, treat the
verify endpoint as a landing page with five audiences, and move the
billboard to the corpus host pages, which carry sixty times the
receipt traffic.

The read against the repo and the live counters (this session):

- **The 53× on `corpus:host` is population, not interest.** Hosts per
  weekly round: W33 60, W35 972, W37 2,767, W38 5,021; the sitemap now
  lists 6,328 host pages in three formats. September's 69,359 organic
  reads is ~11 per page, ~3–4 per format. August's 1,306 landed on a
  corpus a few hundred pages wide. Reads per page fell.
- **The buyer-signals numbers quoted in the pitch are three days old
  and capped.** `recordPageRead` shipped 2026-09-18 (`d704f8c`).
  7,211 "agent" JSON reads on ~6,300 host pages is one read of each
  JSON twin — the index walk the signals page's own gloss describes.
  "299 hosts re-read" is 299 of the first 400 subjects the map keyed
  (`SUBJECT_MAP_CAP`, `src/services/buyer-signals.ts:82`), not of
  6,300; overflow lands in `other` and the page does not say so.
- **Two instruments class one request two ways.** `/observatory`
  excludes only the names in `INFRASTRUCTURE_UA_HINTS`
  (`src/lib/channel.ts:60`); 43 crawlers named in `src/lib/crawlers.ts`
  (PetalBot, Amazonbot, Applebot, Meta, OAI-SearchBot, every
  user-initiated fetcher) count as organic direct there and as
  `crawler` on `/admin/signals` (`buyer-signals.ts:299-313`).
- **Referrer is dead for agents.** 67,093 of 69,359 reads are
  "direct" (UA, no referrer). It cannot separate typed, linked and
  swept. Concentration (reads per host, and the same host in more
  than one format) is the breakthrough metric; a sweep reads each
  format once and moves on.
- **Retention is real and skewed.** 111 organic settles from 22
  distinct buyers is a mean of five; the August consolidation record
  had one wallet at 21 settles. "Repeat buying exists and is skewed"
  is the honest line until the till's per-buyer distribution is read.

The August paper on published counts
(`docs/CLIENT_ABORTS_AND_PUBLISHED_COUNTS_2026-08.md`) filed thirteen
defects of exactly this kind and is still headed "nothing here is
shipped." Rule 43 already says no ratio without its denominator. The
doctrine exists; the mechanism does not. That is the first project,
and every other item here reads its numbers through it.

## 2. What already stands (do not rebuild)

- `/stats`, `/pulse`, `/rails`, `/observatory` publish live aggregates
  with prose caveats, a floors note and a crawler-correction
  timestamp (`src/services/pulse.ts:479`, `src/services/observatory.ts`).
- `enrich402Body` (`src/lib/payment-gate.ts:329-551`) already carries
  `buyer_guidance`, a `verification` block, the listing spec and a
  sample; the MCP unpaid `error.data` (`src/routes/mcp.ts:1120-1191`)
  carries a subset; the verify JSON carries `store_identity`,
  `replay_url` and `citeBlock`; the 404 carries `where_to_look_next`
  (`src/index.ts:338-347`). The host JSON twin carries `feed_url`,
  `/criteria`, per-row `entry_url`/`verify_url` and a cite block
  (`src/routes/corpus.ts:353-400`).
- `USE_WHEN` (`src/store/spec.ts:596-694`), `ROOMS[].deeper`
  (`src/store/rooms.ts`), `attest_this_purchase`
  (`src/services/fulfillment.ts:824-835`) and passport `MOVES_FIELD`
  are the four existing "next step" mechanisms, each single-hop and
  each hand-placed.
- `receiptPageHtml` (`src/routes/verify.ts:384-500`) renders purchase
  certificates for a browser; every other artifact type answers a
  browser with JSON. `/bell` has a room (2026-09-15); the stamp is a
  signed artifact; the guestbook and patronage records are JSON only.
- `declare-door` is free, consent-shaped and linked from `/operators`,
  `/llms.txt` and the OpenAPI — not from the host page. The corpus
  host page's operator section is four doors: preflight, the JSON
  twin, the feed, the notice desk (`src/routes/corpus.ts:726`).
- The mandate (`src/services/mandates.ts`, `src/routes/mandate.ts`):
  signed record, free permanent URL, evidence hash bound into the
  certificate, citation refused before charge if unresolvable, free
  second-party ed25519 attestation. It is the 17th of 21 ids inside
  `buy_observation` (`src/lib/mcp-tools.ts:261`), whose purpose string
  never says "authorization"; no schema, no spec doc.
- The pricing charter's `one_price` clause forbids A/B tests on a
  price, ever (`src/store/pricing-charter.ts:34`); rule 43 forbids
  ranking actors; `aura_walk` refuses our own hostname
  (`src/store/menu.ts:74`); `purpose` is optional on every item and
  never required (`src/lib/bazaar-discovery.ts:74-79`).

## 3. Phase A — the counter envelope (first; everything reads through it)

**A1. The envelope type.** `src/lib/counter-envelope.ts`: every
published number leaves the server as
`{ value, unit, instrument, population, window, exclusions[], floor?, cap? }`.
`instrument` names the code path that wrote the counter; `population`
is the denominator in words and, where one exists, as a number;
`window` is the month or the all-time span; `exclusions` is the list
(house, infrastructure, reclassified); `floor`/`cap` repeat the
porch's per-minute floor and the map's key cap wherever they apply.
The HTML and markdown twins print the same five things beside the
number (rule 43: "printed on every rendering with the fraction it
came from").

**A2. The register and the guard.** `src/store/published-counts.ts`: one
row per number the public routes serve, in the pattern of
`PUBLISHED_DATASETS` and the features table. `test/published-counts.spec.ts`
walks `/stats`, `/pulse.json`, `/rails`, `/observatory`,
`/coverage.json`, `/corpus.json` and fails on any numeric leaf that
is not inside an envelope and not on the register. The thirteen
August items become the first thirteen rows; the three below are
fourteen to sixteen.

**A3. One classifier.** `readerClass` in `buyer-signals.ts` and the
channel split in `channel.ts` collapse into one function in
`src/lib/channel.ts`, deriving its crawler set from `crawlers.ts`
(training + search crawlers → `infrastructure`; social unfurlers →
`infrastructure`). The user-initiated fetchers (Claude-User,
ChatGPT-User, Perplexity-User, MistralAI-User, Meta-ExternalFetcher,
Amzn-User, Diffbot-User, DuckAssistBot) become their own organic
channel, `fetcher`, beside `direct`: a person asked a model to read
the page, which is neither a crawl nor a typed URL. `crawlers.ts`
gains the two named subsets so nothing is typed twice. Test: every
name in `NAMED_AI_CRAWLERS ∪ SEARCH_CRAWLERS` classes the same way on
both instruments; a curl UA still classes organic.

**A4. The cap says so, and the histogram.** `bumpMap` keeps its
`other` bucket but the signals page and the envelope print
`cap: {keys: 400, overflow: N}` beside every capped map. The subject
map gains the format: key `${subject}:${format}`. From it, a
published histogram on `/observatory` for the `corpus:host` surface:
subjects read in 1 / 2 / 3 formats this month, and subjects at or
over a repeat threshold — fractions over the month's subject count,
hosts never named (`open-for-business.ts:256` holds). Storage: the
per-subject maps move off KV read-modify-write (last-write-wins, one
write per second per key, the reason the floor and the cap exist)
to a Durable Object counter with a single writer; the porch's
bounded surface counters stay where they are. This is ruling R2.

**A5. Reader class on the public observatory.** From the unified
classifier and the pages map: `corpus:host` by format × reader class
(browser / agent / fetcher / crawler), bucketed, enveloped, no hosts.
This is the composition number the September read lacked, served
without the keeper's login.

## 4. Phase B — the derived link set (four JSON consumers, then the pages)

**B1. `src/lib/store-links.ts`.** One builder,
`storeLinks(base, { item?, host?, certId? })`, returning
`{ store: {name, homepage, llms, menu, openapi, skill, developers},
   next: [{item, why, url}], verify_url_template, cite? }`. `next` is
derived, never typed: items sharing a `USE_WHEN` entry with the
current item; `ROOMS[].deeper` for the current path; the settlement
hop `attest_this_purchase` for a settled tx; for a host page, the
instrument the host's own tier and defects pick (`spot_check` when
the door answers, `launch_check` when it does not, `passport_refresh`
when the passport is stale) — a derived verdict on a thing at a date,
inside rule 43. Every URL is absolute and stable across republishes
(the host pages are served immutable; an index stores bodies and
drops headers).

**B2. The four consumers.** `enrich402Body`, the MCP unpaid
`error.data` (which also gains the listing spec it drops today), the
verify JSON (every artifact branch, beside `store_identity`), and the
host JSON twin. The 404/500 `where_to_look_next` and `menu_url` are
re-pointed at the same builder so the error paths and the success
paths agree.

**B3. The sweep test.** `test/store-links.spec.ts`: the same link set
byte-equal across the four envelopes for one item, one host, one
certificate; every URL answers on the router; rule 44's surface sweep
lists the four.

## 5. Phase C — the pages (one project, two routes)

**C1. Every artifact renders for a human.** `verify.ts`: the HTML
branch extends to stamps, anchors, cards, packs, luckies, gazette
issues, phantom checks and handovers, over one template: a one-line
"what you are looking at", the item as a link, the verdict, the
evidence sections that exist today, and one CTA block chosen by
audience, all from `storeLinks`:
- buyer (read inside the hour, or `purpose` present): `next` items,
  the bell room, the stamp, the guestbook;
- counterparty (the item is an observation on a third party): the
  attestation page first, then "get your own" → `launch_check`,
  `standing_watch`, `conformance_watch`;
- developer: `/developers`, `/openapi.json`, `/skill.md`, the free
  preflight and verify desks, moved from the footer into the body.
The audience is a rendering choice from facts on the certificate and
the request, never stored.

**C2. Guestbook and patronage pages.** `GET /guestbook` and
`GET /guestbook/{entry_id}` (HTML + markdown twins, JSON stays at
`/api/guestbook`), and `GET /patronage/{pass_id}` rendering the
record with its badge and its renew door. Each carries `storeLinks`.

**C3. The corpus host page as the funnel it already is.**
`/corpus/host/` joins `ROOMS` with a derived `deeper` (B1), the
operator section gains `declare-door` (free, consent-shaped) and the
standing-note door, and one line above it: "This page exists because
the store's walk met this host on {date}; the JSON twin is the same
facts for a machine." "Claim this page" is not built: the chip is
earned by observation (`src/pages/passport-card.ts:495-497`).

**C4. `purpose` says what it is for.** The sentence "signed onto your
certificate verbatim and printed on the receipt" goes into every
`buy_*` tool description and into `buyer_guidance`. The field stays
optional everywhere (ruling R4 declines the alternative).

## 6. Rulings (KEEPER_LIST before code)

- **R1. Sign the issuer.** Add `issuer` to `CERT_FIELDS`
  (`src/lib/signing.ts:53-160`) as `did:web:scvd.store`, with the
  store's DID document also listing a domain-independent
  `did:key` under `alsoKnownAs`, so identity survives a domain move
  while the old document is served. The verify URL stays derived from
  issuer + `cert_id`, never signed. `LEGACY_FIELDS_ADDED_SINCE`
  carries the cut; nothing is resigned. The projection already signs
  `issuer_did` (`src/services/attestation-projection.ts:101`) — this
  makes the certificate match it.
- **R2. Where per-subject signals live.** A Durable Object counter for
  the buyer-signals maps, or KV with the cap raised and the overflow
  printed. Recommended: the Durable Object; the floors note exists
  because KV cannot count under contention.
- **R3. Per-item settle counts, public.** `till_by_item`
  (`src/services/stats.ts:234`) is marked "not published — the public
  books are aggregates by rule." Publishing it is the derivation the
  next catalogue cut needs, but it reverses a stated line and is the
  keeper's ink. Recommended: publish, enveloped, with the
  reclassification caveat the comment already states.
- **R4. Rule 43 extended to counters.** Proposed sentence, the
  keeper's to draft: "Every published count ships with its
  instrument, its population, its window, its exclusions, and any cap
  or floor that bounded it, on every rendering." Also declined here:
  a required `purpose` on any item (it would refuse purchases before
  charge for every agent that omits it, against `one_price`'s
  one-contract shape).

## 7. Phase D — after A–C, in this order

- **D1. The Sunday digest gains a store-buyers section.** The existing
  cron (`0 11 * * SUN`, `src/index.ts:547-690`) appends organic
  settles, declines, rails and the concentration histogram for the
  week to the signed digest, enveloped. Per-item rows only under R3.
- **D2. The mandate as a primitive.** Its own MCP tool
  (`buy_mandate`), `schemas/scvd-mandate-v1.json`, a one-page spec
  another issuer could implement (`docs/MANDATE_SPEC.md`: record,
  attestation payload string, what it does not prove), and the
  README moves it up. Cap and expiry stay declared, never enforced.
- **D3. A scheduled cold pass.** A weekly GitHub Actions workflow over
  `npm run buyer:cold` writing per-cell facts with denominators to
  `research/cold-pass-{week}/` — model × journey × outcome, transcripts
  scrubbed of wallets as today. Never a ranking; no row orders one
  model against another. Needs the funded wallets under the wallet
  law (KEEPER_LIST).
- **D4. A read-spike tier on `/admin/outreach`.** Derived from the
  subject map: hosts whose reads in more than one format rose this
  week. Keeper-facing only; every send stays under rule 30 (a press,
  a fact re-verified live, one link, no price, one note per host
  ever). The note states an observation about the door, never that
  "someone is evaluating you."

## 8. Rules this obeys

Rule 43 (verdict on a thing at a date; denominators beside numbers;
no ranking); rule 44 (the surface sweep — B3 lists the four
envelopes); rule 30 (no send without a press — D4); the pricing
charter's `one_price` (no price experiment anywhere in this plan);
derive-or-refuse (nothing in B1 or the register is typed twice);
"hosts are never named" on public surfaces (A4, A5).

## 9. Acceptance

- A: `test/published-counts.spec.ts` fails on a bare number on any of
  the six public routes; one UA classes identically on both
  instruments; the signals page prints its caps; `/observatory` serves
  the `corpus:host` reader-class split and the format histogram with
  their denominators.
- B: one link set byte-equal across the 402, the MCP error data, the
  verify JSON and the host JSON twin; every `next` entry derived from
  a named source; every URL answers.
- C: a browser gets HTML for every artifact type at `/api/verify/`;
  guestbook and patronage pages render; the host page shows the
  derived deeper rung and the declare-door door; the store's own cold
  read of each page shows the audience block chosen from certificate
  facts alone.
- D: the digest's new section carries envelopes; `buy_mandate`
  appears in `tools/list` with the schema URL; the cold-pass workflow
  writes one dated directory per week; the outreach tier never sends.

## 10. What not to build

- No A/B test on any price, no per-wallet or per-origin variation; a
  dated, uniform, announced price change with its before/after volume
  is the only elasticity record this store can honestly publish.
- No per-framework or per-model leaderboard; per-cell facts with
  denominators only.
- No "claim this page" ownership step; no verified-seller badge; no
  ordered directory of declared hosts.
- No required `purpose`.
- No unique-visitor count, no cookie, no IP retention, to get the
  concentration number: the histogram is derived from per-subject
  reads with no per-visitor row.
- No verify URL inside the signed bytes; the issuer, not the location.
