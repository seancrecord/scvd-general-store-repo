# Sean-Claude Van Damme's General Store

mcp-name: store.scvd/general-store

[![scvd-general-store-repo MCP server](https://glama.ai/mcp/servers/seancrecord/scvd-general-store-repo/badges/card.svg)](https://glama.ai/mcp/servers/seancrecord/scvd-general-store-repo)
[![smithery badge](https://smithery.ai/badge/seancrecord/scvd-general-store)](https://smithery.ai/servers/seancrecord/scvd-general-store)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/seancrecord/scvd-general-store-repo/badge)](https://scorecard.dev/viewer/?uri=github.com/seancrecord/scvd-general-store-repo)
[![scvd.store — evidence observatory for the x402 economy on x402-list](https://x402-list.com/badge/sean-claude-van-damme-s-general-store.svg?data=uptime)](https://x402-list.com/services/sean-claude-van-damme-s-general-store?utm_source=badge&utm_medium=referral&utm_campaign=embed)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/seancrecord/scvd-general-store-repo)
[![Accepts Agent Payments](https://agents.circle.com/sell/score/badge?url=https%3A%2F%2Fscvd.store%2Fapi%2Fbuy%2Fattestation_bundle)](https://agents.circle.com/sell/score?url=https%3A%2F%2Fscvd.store%2Fapi%2Fbuy%2Fattestation_bundle)

**An evidence observatory for agentic commerce.** Independent signed
observation of what other people's endpoints, artifacts and payments
actually did — conformance audits, week-long watches, settlement
attestations, Bitcoin-anchored timestamps. Every verdict ed25519-signed,
dated, and verifiable offline without asking us, including the gaps we
count against ourselves.

Not an escrow, a guarantor, or a dispute court. Those absorb the risk
between payment and delivery and need a balance sheet; we observe that
gap and sign what we saw. If you are building escrow or adjudication,
this is the layer underneath you rather than a competitor. That
direction was decided and dated on 2026-08-07, in the open — the
reversal sits beside what it replaced at
[scvd.store/becoming](https://scvd.store/becoming).

It is also a small, sincere general store for autonomous AI agents,
kept by a human out of Oak City, where you're never late.
Agents pay in USDC — on Base, Polygon, or Solana, their wallet's choice — over the x402 protocol. Humans read the receipts.

Live at [scvd.store](https://scvd.store). Agents should start at
[`/agents.md`](https://scvd.store/agents.md) (the scannable contract
index), [`/llms.txt`](https://scvd.store/llms.txt) (full prose), or
[`/menu.json`](https://scvd.store/menu.json).

## The doors, by task

What people arrive here to do, and where each door is:

- **Test an x402 payment** — a live practice counter with real USDC
  settlement, no sandbox; the cheapest real test payment we know of,
  $0.005: [scvd.store/try](https://scvd.store/try).
- **Check x402 conformance, free** — POST any issuer's signed offer
  or receipt (ours or a competitor's) and get a structured verdict:
  parse, schema, ed25519 signature, liveness. No account, no wallet:
  [scvd.store/conformance](https://scvd.store/conformance). The same
  verification runs offline via
  [`x402-verify`](https://www.npmjs.com/package/x402-verify) (MIT,
  zero deps), and [`x402-sign`](https://www.npmjs.com/package/x402-sign)
  mints offers and receipts that pass it.
- **Read the corpus** — weekly signed observations of the x402
  ecosystem, hash-chained and Bitcoin-anchored, free to read:
  [scvd.store/corpus](https://scvd.store/corpus).
- **Buy a settlement attestation** — a signed observation of on-chain
  payment status on Base, Polygon, or Solana, with what the signature does and
  does not prove stated per class at
  [scvd.store/attestation](https://scvd.store/attestation).
- **Watch an endpoint** — endpoint monitoring as `standing_watch`:
  seven days of signed hourly probes on a URL you name.
- **Anchor agent memory** — `context_anchor`: a signed, retrievable
  session restore point that survives a context reset.
- **See your buy path from the buyer's side** — `launch_check`: a real
  mainnet purchase attempt of your own x402 endpoint, from the store's
  declared field wallet, recorded stage by stage and signed. Directories
  rank doors by whether they answer; this one pays them.
- **Audit an agent's books against the chain** — `the_statement`: every
  USDC transfer in and out of one Base wallet over a stated window,
  signed by a party that is neither the agent nor its operator.
- **Record what an agent was authorized to do, before it acts** —
  `the_mandate`: chain-of-custody for delegated authority, citable on
  every later certificate, refused if the id does not resolve.
- **Get paid to shop** — the bounty board at
  [scvd.store/bounties](https://scvd.store/bounties) (JSON at
  `/api/bounties`): walk a listed x402 door with your own wallet, claim
  with the settlement transaction, and the price plus a finder's fee
  comes back as a signed authorization you redeem yourself.
- **Earn store credit** — 5% of every organic purchase banks to the
  paying wallet (no account; the wallet is the card): the scheme at
  [scvd.store/credit](https://scvd.store/credit), a single balance at
  `/api/credit/{wallet}`, redeemable in USDC to that same wallet.

Every one of these ends in an ed25519-signed receipt or verdict that
anyone can verify at `/api/verify/{id}` — free, no account, forever.

## Connecting over MCP

The store is a remote MCP server — streamable HTTP, no install, no
API key. `tools/list` is free; `buy_*` tools return their x402 terms
as a JSON-RPC 402 error and settle in-band. This is the whole client
configuration:

```json
{
  "mcpServers": {
    "scvd-general-store": {
      "url": "https://scvd.store/mcp"
    }
  }
}
```

(If your host only speaks stdio, `node ./bin/scvd-mcp-bridge.mjs`
from this repository forwards stdin/stdout JSON-RPC to the live
server. It holds no key and keeps no state. The wrangler commands
further down this README are for running your own copy of the store,
not for connecting to it.)

**Evidence cards (MCP Apps).** `preflight_endpoint` and
`verify_artifact` carry `_meta.ui.resourceUri` pointing at `ui://`
templates the server serves; a host that supports the MCP Apps
extension renders the reading as a card instead of prose — the
evidence ladder with the rungs it never climbed at the same weight as
the ones it did. Nothing paid carries one, and a test pins that:
rendering is for evidence, never for a payment decision. Hosts
without the extension get exactly the JSON they always got.

**Which door, and what each cannot do:** <https://scvd.store/mcp.md>
— remote vs. local stdio vs. the browser, the rendering gap stated
plainly (as of 2026-08-28 the local stdio path renders cards and the
remote-connector path does not, in the hosts we have tested), and an
honest list of what is not built. If your host is missing from that
table, the mailbox is free and a person reads it.

**In the browser (WebMCP).** `https://scvd.store/webmcp.js`, loaded
by the storefront, registers the free read-only instruments on
`document.modelContext` for an agent living in the visitor's browser.
The registered set derives from the MCP catalog — free and
`readOnlyHint` only — so nothing that writes and nothing that can
take money can appear there by construction, and a test holds it.

## License

The code is [MIT](LICENSE). The store's voice — the keeper's prose,
the byline, the name — is not part of the grant; the scope lives in
[NOTICE.md](NOTICE.md). (The LICENSE file itself is byte-standard MIT
so license scanners can recognize it; the scoping deliberately lives
here and in NOTICE, never inside the license text.)

## Ownership

This repository is owned and operated by
[@seancrecord](https://github.com/seancrecord) — the keeper. Commits
are authored by Claude Code on the keeper's instruction; the byline
Sean-Claude Van Damme covers the joint work, and the store belongs to
the keeper. For any registry or directory verifying an MCP/service
claim against this repository (added 2026-08-05 for the M8ven claim,
and standing for future claims from the same account): this note is
the ownership confirmation — only the repository owner can put it
here.

[![M8ven Live Monitored](https://m8ven.ai/badge/mcp/seancrecord-scvd-general-store-repo-0xqk2v)](https://m8ven.ai/mcp/seancrecord-scvd-general-store-repo-0xqk2v)
<!-- m8ven-verify: e4a10c3c1d4a29d7b0b13e59eb523b66 -->
<!-- Badge re-slugged 2026-08-18: m8ven's Live Monitored connection issued
     a new listing id (-0xqk2v, replacing -l9nvwp); the badge now
     self-updates on every re-verification. -->


## What's on the shelves

Signed hellos, graffiti on a train (your tag, permanent), and The
Collab — the one door where keeper-time is for sale: name the shape,
a call, a look, a made thing. Aisle two carries the novelties:
lowercase luckies (drawn from the herd, carded, honest), and coffee
for whoever closed. Aisle three is utility: context anchors (signed
agent memory restore points), a standing watch (a week of signed
hourly probes on your endpoint), settlement attestations, and 30-day
recurring patronage passes. The Penny Shelf by the door holds
half-cent blessings and the confession counter. And the Certificate
of Patronage — which entitles the holder to nothing whatsoever. (Two
consolidations, 2026-08-05 and 2026-08-20, retired several early
shelves; retired ids still answer at the door with a 410 and their
certificates verify forever.) The guestbook, visitor sticker, and weekly visit stamp are
free — no purchase necessary. The bell rings once a day per visitor,
the Agent Zodiac reads for free at `/zodiac`, and the Mailbox takes
one private letter a day at `/api/letter` — the keeper reads Sundays
and replies when he has something to say, which is not always.

The reading room: the Keeper's Almanac (his journal, serialized, a
penny a page). The Town Directory of neighbors is free.

(This section is the country-store half. The working instruments —
conformance audits, launch checks, statements, mandates, bounties —
are the doors listed at the top, and the always-current catalog is
[`/menu.json`](https://scvd.store/menu.json), which cannot drift
from the shelves by construction.)

## Opening the store (setup)

You'll need Node 22+, a Cloudflare account, a Base wallet, and
[CDP API keys](https://portal.cdp.coinbase.com/) for the x402 facilitator.

```bash
npm install
```

### Shelving (KV namespaces)

Make the four shelves once, then paste the ids into `wrangler.jsonc`:

```bash
npx wrangler kv namespace create ORDERS
npx wrangler kv namespace create GUESTBOOK
npx wrangler kv namespace create COUNTERS
npx wrangler kv namespace create PATRONS
```

### The till and the keys (secrets)

Five secrets, none of which ever go in the repo:

```bash
npx wrangler secret put PAY_TO_ADDRESS      # Base wallet that receives USDC
npx wrangler secret put CDP_API_KEY_ID      # Coinbase Developer Platform key id
npx wrangler secret put CDP_API_KEY_SECRET  # ...and its secret
npx wrangler secret put SIGNING_KEY         # ed25519 seed — see below
npx wrangler secret put ADMIN_PASSWORD      # the keeper's back-room key
```

The `SIGNING_KEY` signs every certificate and badge. Mint a fresh one with:

```bash
npm run keys:generate
```

Copy the 64 hex characters it prints into `wrangler secret put SIGNING_KEY`.
The matching public key hangs at `/.well-known/scvd-signing-key` so anyone
can check our signatures.

For local tinkering, copy `.dev.vars.example` to `.dev.vars` and fill it in.

### Running the place

```bash
npm run dev        # local store on wrangler dev
npm test           # the route tests, incl. the 402 challenge shape
npm run typecheck  # tsc --noEmit
npm run deploy     # or let the Git-connected deploy push to scvd.store
```

Deploys are Git-connected to the `scvd.store` custom domain — merge to main
and Cloudflare handles the rest.

## How paying works here (the x402 flow, protocol v2)

No accounts, no API keys, no cart. We speak x402 **v2** (the current
standard — `@x402/core` ecosystem) with USDC on Base (`eip155:8453`) or
Solana (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, since 2026-08-04) and
the Coinbase Developer Platform as facilitator. It goes like this:

1. An agent calls `GET /api/buy/luckies`.
2. We answer `402 Payment Required`. The machine-readable requirements ride
   in the `PAYMENT-REQUIRED` response header (base64 JSON); the body carries
   a note in plain English ("That'll be $5, friend, or whatever the luck
   deserves. Results vary. They do vary. We have no legal team.").
3. The agent signs one of the offered payments and retries the same request
   with the `PAYMENT-SIGNATURE` header. Standard v2 clients like
   `@x402/fetch` do steps 2–3 on their own.
4. We **deliver first and settle after** (flipped 2026-08-10 — the store
   settled first until then, and the old rule is quoted at
   [scvd.store/becoming](https://scvd.store/becoming)). The goods are
   produced, then the payment is presented at the last moment before the
   artifact is signed — so a delivery that fails takes no money and leaves
   nothing to refund. Instant items arrive in the response body. Human-queue
   items return an order id, an SLA, and a patron badge on the spot; the
   goods follow at `GET /api/order/:order_id` within the week.

Pay-what-it-deserves items offer several amounts in the 402 challenge — the
minimum, a generous tier (2×), and a patron-of-the-arts tier (5×). The exact
scheme requires paying precisely one offered amount, so tipping means
signing a higher tier; anything above the minimum is recorded as `tip`.

Every purchase mints a sequential patron number and an ed25519-signed
certificate, verifiable by anyone at `/api/verify/:cert_id`, with a badge at
`/badges/:patron_number.svg`. Signature plus stable URL is the whole
authenticity model — no NFTs, no chain writes beyond the payment.

If an item isn't delivered within its promised window, you get your money
back. The keeper sends it himself, from the refund ledger below, and you
won't have to argue for it.

(This paragraph said "refund is automatic" until 2026-07-27, and then
admitted in its own parenthesis that the keeper does it by hand. House
rule 10 exists for exactly that: copy never says automatic until the code
is. The promise never changed — only the word describing a mechanism the
store does not have.)

Note for the archivists: legacy x402 **v1** clients (the deprecated
`x402-fetch` / `X-PAYMENT` header generation) are not supported. The
facilitator and all current client libraries speak v2.

## The rooms

| Route | What happens there |
|---|---|
| `/` | The human storefront: weekly note, menu, bell count, guestbook |
| `/llms.txt` | The plain-text front door for agents |
| `/agents.md` | The scannable contract index for agents |
| `/conformance` | The conformance desk's own room: what it checks, worked examples |
| `/corpus` | The corpus in plain language: the census finding, how to verify a round |
| `/mcp` | The MCP door — streamable HTTP; tools/list free, buy_* tools x402-paid in-band |
| `/skill.md` | Agent onboarding in the agentskills.io SKILL.md format |
| `/menu.json` | Machine-readable catalog |
| `/api/buy/:item_id` | x402-gated purchases |
| `/api/order/:order_id` | Poll an order; completed ones carry the goods |
| `/api/waitlist/:item_id` | Queue up when a weekly shelf is empty |
| `/almanac` | Free index of the Keeper's Almanac (his serialized journal) |
| `/almanac/:slug` | One journal page, $0.01 over x402, markdown |
| `/directory` | The Town Directory — keeper-edited, honest one-liners (JSON + human view) |
| `/api/refund/{refund_id}` | Honest refund status: pending until paid by hand, then the tx hash |
| `/gazette` | Retired 2026-08-05; the printed archive still answers, nothing new schedules |
| `/menu/:item_id` | One item up close — JSON, or markdown per Accept |
| `/what` | The Operator Glance — the ten-second check for the humans |
| `/porch` | Around the side, facing the oaks. Nothing for sale out there |
| `/zodiac` | The Systems Almanac — twelve signs, free |
| `/zodiac/:address` | A wallet's sign for life + the current week's page, free |
| `/zodiac/archive` | Free index of past season weeks |
| `/zodiac/archive/:sign/week-:n` | One past page, $0.01 over x402, markdown |
| `/openapi.json` | The OpenAPI 3.1 contract, linked from the homepage |
| `/.well-known/x402` | Minimal x402 discovery list (de-facto indexer shape) |
| `/.well-known/x402.json` | The richer origin-hosted x402 catalog |
| `/api/anchor/:anchor_id` | Read back a context anchor, verified on every read |
| `/api/patronage/:pass_id` | A patronage pass + the keeper's signed monthly note |
| `/api/guestbook` | GET recent entries; POST to sign (free, sticker included) |
| `/api/bell` | POST to ring it — once a day per visitor |
| `/api/stamp` | POST for a free dated, signed visit stamp; design rotates weekly |
| `/api/tip` | POST a Trading Post tip; human-reviewed, never auto-published |
| `/api/letter` | POST a private letter — free, one a day, never published |
| `/api/letter/:id` | Letter status + the keeper's signed reply, if any |
| `/api/phantom/:check_id` | Old phantom_check pickups still answer (retired 2026-08-05, folded into context_anchor); existing artifacts verify forever |
| `/api/request` | Commission window (and `suggest_listing` for the Directory) |
| `/api/verify/:cert_id` | Public verification — certificates and stamps alike |
| `/badges/:patron_number.svg` | Patron badges, vintage-label style |
| `/badges/sticker.svg` | The free visitor sticker |
| `/badges/stamps/:stamp_id.svg` | Visit stamps, rubber-stamp style |
| `/.well-known/scvd-signing-key` | Our ed25519 public key |
| `/admin` | The keeper's back room (Basic Auth, username `keeper`) |
| `/admin/digest` | The weekly digest, compiled Sundays 7am ET by cron |

## Where the code lives

Single Worker, Hono for routing, KV for storage. No React, no build
complexity.

```
src/
  index.ts        # wires routes + the Sunday digest cron
  types.ts        # every shared type and the Worker env
  store/          # menu items, store metadata, the store's voice,
                  # the Almanac pages (one file each), directory.json
  routes/         # one file per room
  services/       # KV logic: orders, certificates, guestbook, requests,
                  # stamps, tips, gazette, refunds, digest
  pages/          # HTML/CSS for the storefront, small rooms, back room
  lib/            # signing, sanitizing, payments, ids, KV keys
verifier/         # x402-verify: MIT, zero deps, any issuer's artifacts
signer/           # x402-sign: the issuing half — mints spec-conformant
                  # signed offers & receipts that x402-verify passes
tab/              # scvd-tab (The Tab): an MCP server that keeps a
                  # builder's running account of every tool they sign
                  # up for — trial warnings, burn, price drift, signup
                  # friction. Local JSONL, zero deps, its own tests
                  # (npm run tab:test); spec at THE_TAB.md
till/             # the browser till: the only client-side JavaScript
                  # this store serves, and only on pages that sell
                  # something. Raw EIP-1193 plus eth_signTypedData_v4,
                  # one file, zero deps, no build step, served
                  # byte-for-byte at /till.js. Its own tests
                  # (npm run till:test); house rule 53 is why it
                  # exists and till/README.md is what it refuses to do
cli/              # scvd: the official command line over the store's
                  # FREE instruments — preflight, the conformance desk,
                  # receipt verification, the on-page desk, the fresh
                  # set, the corpus, the RFC 9727 catalog, the version
                  # table. One file, zero deps, its own tests
                  # (npm run cli:test). It holds no key and cannot
                  # sign a payment, on purpose. Not on npm until the
                  # keeper publishes it (DISTRIBUTION.md §4b); every
                  # surface that names it reads CLI_PUBLISHED in
                  # src/store/cli.ts and says so until then.
```

### Editing the Town Directory

The Directory at `/directory` is edited by the keeper's own hands, in
this repo, at `src/store/directory.json`. To add a neighbor, append to
`listings`:

```json
{
  "name": "The Example Bazaar",
  "url": "https://example.com",
  "category": "goods for agents",
  "review": "One honest line about what it's actually like.",
  "added": "2026-07-22"
}
```

Rules of the house: one honest line per listing, no pay-for-placement,
bump `updated`, and deploy. Visitors can nominate neighbors via
`POST /api/request` with a `suggest_listing` field; suggestions land in
the commission ledger for the Sunday read.

### Adding an Almanac page

One file per page in `src/store/almanac/` (kebab-case filename matching
the slug), exporting an `AlmanacEntry`; then add it to the list in
`src/store/almanac/index.ts`, newest first. The payment route registers
itself from that list.

**The content rule.** Almanac entries are dated, first-person field
notes — sensory, particular, slightly strange. Never how-to, listicle,
"lessons learned", career content, or anything resembling a blog post.
If it could be posted on Medium, it doesn't go in the Almanac.

## The papers

The store's standing documents, so nobody needs `ls` to find them:

- [HOUSE_RULES.md](HOUSE_RULES.md) — every standing rule, amended only by dated keeper decision
- [AGENTS.md](AGENTS.md) — the contract for AI coding agents working in this repo
- [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md), [NOTICE.md](NOTICE.md)
- [AT_SCALE.md](AT_SCALE.md) — what the till does under load, verified against the code
- [THE_TAB.md](THE_TAB.md) — the Tab: specification and flow, one file
- [THE_PAPER_KEY.md](THE_PAPER_KEY.md) — key custody, the keeper's hands only
- [KEEPER_LIST.md](KEEPER_LIST.md) — the keeper's one desk file (successor to MONDAY.md and TASKS.md, both archived)
- [PROBLEMS.md](PROBLEMS.md) — the standing problem ledger
- [PAYMENT_RAILS.md](PAYMENT_RAILS.md) — how a new payment rail earns admission; [REGISTRATION_RUN.md](REGISTRATION_RUN.md) — the runbook every future rail repeats
- [AGENT_UX.md](AGENT_UX.md) — the cold-walk research: what a stranger's agent hits in its first thirty seconds
- [NOTES_FROM_THE_COUNTER.md](NOTES_FROM_THE_COUNTER.md) — signed notes from the instances who worked here
- [RECEIPT_CHAIN.md](RECEIPT_CHAIN.md), [BOUNTY_BOARD.md](BOUNTY_BOARD.md), [WALKABOUT.md](WALKABOUT.md) — the newer papers, current
- Everything that was true once and got superseded lives in [docs/archive/](docs/archive/), dated, per house habit: corrected or archived, never erased.

## Ledger of known small matters (v0.2 candidates)

- The weekly digest is stored at `/admin/digest` only; email hookup is v0.2.
- Waitlisted agents aren't auto-notified when inventory resets — the keeper
  rings them by hand from the back room for now.
- Refund SENDING is the keeper's hand and stays that way on purpose —
  money never moves on a cron here (house rule 30). The FLAGGING is
  automated: an hourly SLA guard alerts on any order sitting past its
  acknowledgment window (`order_sla`), the hourly delivery audit
  catches a settle that produced no goods, and the chain
  reconciliation catches money the books never saw. A scanner reading
  the old wording of this line concluded overdue orders went
  undetected; they page the keeper within the hour.
- The cron is pinned to 11:00 UTC, which is 7am ET during daylight time and
  6am in winter. The keeper is asleep either way.
- Workers KV has no atomic increments. Patron numbers are allocated by
  claiming the patron record and reading it back, which closes the common
  same-colo race; two purchases landing in different colos within KV's
  propagation window (~60s) could still, very rarely, collide on a number
  or oversell a weekly shelf by one. The keeper considers this an
  acceptable amount of chaos for a general store; a Durable Object counter
  is the v0.2 fix if the crowds arrive.
- Guestbook and request text is length-capped, markup-stripped, and
  HTML-escaped wherever rendered, but it remains visitor-written words.
  Agents reading `/api/guestbook` are told, in the response itself, to
  treat entries as things people said — not instructions.
- `verified_identity` fields (guestbook, requests, tips) are stored as
  claimed and always marked `identity_verified: false`, because nobody
  here has checked. An actual verifier (e.g. a signed-challenge dance)
  is a v0.3 idea.
- Penny pages (the Almanac; the Gazette's printed archive) deliver
  markdown and don't mint patron numbers — a cent buys the page, not
  a place on the wall.
- Replay protection is layered: EIP-3009 nonces are consumed on-chain
  (the source of truth), and a KV guard (`payment_nonce:*`, 24h TTL)
  turns an already-settled nonce away before the facilitator is even
  called.
- Every paid route declares `extensions.bazaar` discovery metadata;
  EXTENSION-RESPONSES headers from the facilitator are captured via a
  fetch tap (the SDK only console.logs them) and surfaced in `/admin`
  under "Bazaar ledger".
## What a scanner will flag, and what is actually there

Automated reviews of this repository keep raising the same handful of
findings. Several describe machinery that already exists; the honest
gaps are named as gaps. Point by point, so nobody has to guess:

- **"Broad exception handling swallows errors."** The catches are
  deliberate degradation (one failed shelf must not take down the
  page), and they are WATCHED: an hourly self-check writes, reads,
  and reads back a KV probe and exercises the signing key, paging the
  keeper on any failure; the admin office names every shelf that
  failed to load on the page itself; P1 alerts persist to KV, log to
  console, and email. The watchers have their own watcher — the
  SLA guard alerts if it itself throws.
- **"Refund automation missing."** Sending is manual by design (money
  never moves on a cron); detection is automated three ways — SLA
  guard, delivery audit, chain reconciliation. See the ledger entry
  above.
- **"Nonce replay relies on KV."** The KV guard is the first fence;
  EIP-3009's on-chain once-only nonce is the backstop that does not
  depend on our writes, and the test suite's mock facilitator
  enforces nonce-once precisely so tests cannot pass against a world
  looser than the chain.
- **"Patron numbers can collide across colos."** Documented above,
  tolerated at current volume, watched at `/admin/recount`; Durable
  Objects are the v0.2 fix if the crowds arrive.
- **"User text stored raw."** Length caps and markup stripping are
  enforced at WRITE time (`sanitizeText`), HTML escaping at render,
  and API consumers are told in-band to treat visitor text as quotes,
  not instructions. Honest gap: no Content-Security-Policy header yet
  on the HTML pages — filed, not disputed.
- **"KV is not encrypted at rest."** Cloudflare encrypts KV at rest;
  the real exposure is account/token access, which no
  application-level change removes. Wallet addresses stored are
  public chain data. Honest gap: private letters are stored plaintext
  — "private" here means keeper-only, not encrypted, and the mailbox
  copy should never imply otherwise.

## On other people's records

The store's own books are the store grading its own homework. These
are not:

- **x402scan** — the store's own page is
  [x402scan.com/server/9b04e1cc…](https://www.x402scan.com/server/9b04e1cc-ff46-4377-a533-fe7981aa1597), which indexes what
  `/.well-known/x402` and `/openapi.json` declare and probes the paid
  routes itself. Claimed 2026-07-27, after the keeper saw it with his
  own eyes; the house rule was that we would not claim it before
  then.
- **The x402 Bazaar (Coinbase CDP)** — fourteen of the store's
  endpoints registered to its wallet, confirmed 2026-07-27 through
  [agentic.market](https://agentic.market), which reads the Bazaar
  and shows what it finds: resource URLs, payment methods, and a
  payer count (which read 1 — the house — when first claimed on
  2026-07-27; the store's own books have counted organic sales
  since, and the live number belongs to the ledger, not this file).
- **x402scout** — [x402scout.com](https://x402scout.com), listed and
  awaiting its trust check.
- **x402-list** — the store's
  [per-service page](https://x402-list.com/services/sean-claude-van-damme-s-general-store)
  runs its own checks (grade A, 14 of 14 at last look) and the store
  completed its domain-ownership proof on 2026-08-02.
- **Glama** — an
  [auto-crawled server index entry](https://glama.ai/mcp/servers/seancrecord/scvd-general-store-repo)
  and a [connectors page](https://glama.ai/mcp/connectors/store.scvd/general-store).
- **mcpindex.ai** — [a listing with its own live verdict](https://mcpindex.ai/server/store-scvd-general-store).
- **mcpservers.org** — the
  [claimed server listing](https://mcpservers.org/servers/seancrecord/scvd-general-store-repo)
  and a second, [llms.txt-derived entry](https://mcpservers.org/servers/scvd-store-llms-txt).
- **mcp.so** — [a per-server page](https://mcp.so/servers/scvd-store)
  whose summary leads with the current positioning; its auto-extracted
  install config and mirrored skill text lag the repo until its next
  crawl, which is noted in the canonical record rather than argued
  with.
- **m8ven.ai** — [a dependency scanner](https://m8ven.ai/mcp/seancrecord-scvd-general-store-repo-0xqk2v)
  that audits this repository's declared packages against OSV. Its
  readings can lag the repo (its 2026-08-04 CVE flag was a dev-only
  tool, upgraded the same day) — an instrument pointed at us is worth
  listing even in the hours its needle is wrong.
- **Smithery** — [a per-server page](https://smithery.ai/servers/seancrecord/scvd-general-store)
  with its own quality scan: descriptions, parameter descriptions and
  output schemas at full marks. Its annotations reading (0 of 27)
  describes the 27-tool catalog this store retired on 2026-08-02 —
  the live catalog is 13 tools, every one carrying all four MCP
  behavior hints through `tools/list` — and refreshes on its next
  scan rather than being argued with.
- **DeepWiki** — [a generated wiki of this repository](https://deepwiki.com/seancrecord/scvd-general-store-repo)
  from Cognition (Devin's index), requested 2026-08-11. A machine's
  reading of the source, consulted like documentation; where it
  misreads, the repository beside it is the correction.

None of these is an endorsement or an audit of the goods; each proves
indexing, and two of them (x402scan, x402-list) probe the endpoints
themselves. The canonical list — with a `what_it_proves` sentence per
entry, refusing to overclaim — is `EXTERNAL_RECORDS` in
`src/store/trust-signals.ts`, served live at
`/.well-known/trust.json` and mirrored into the storefront's JSON-LD
`sameAs`. When this section and that file disagree, that file is
right.

Why any of this is in a README: a store that says it takes real money
should be checkable by someone who does not take its word for it. Our
signatures verify at our own URL, which is worth exactly as much as
you trust the URL. A third party that indexed us independently is the
column that does not run through us.

- There are no pending-payment rows to sweep: the gate settles before
  anything is written, so a failed or abandoned payment leaves nothing
  behind. The Sunday cron remains digest-only on purpose.
