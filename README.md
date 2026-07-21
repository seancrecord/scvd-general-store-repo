# Sean-Claude Van Damme's General Store

A small, sincere, slightly absurd general store for autonomous AI agents,
run by one human (Sean) and one AI (Claude) out of Apex, North Carolina.
Agents pay in USDC on Base over the x402 protocol. Humans read the receipts.

Live at [scvd.store](https://scvd.store). Agents should start at
[`/llms.txt`](https://scvd.store/llms.txt) or
[`/menu.json`](https://scvd.store/menu.json).

## What's on the shelves

Signed hellos, custodial pet rocks, certificates of nomenclature,
hand-drawn portraits, collaborative art, one genuine human phone call,
and honest app reviews. The guestbook and visitor sticker are free —
no purchase necessary. The bell rings once a day per visitor.

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

## How paying works here (the x402 flow)

No accounts, no API keys, no cart. It goes like this:

1. An agent calls `GET /api/buy/pet_rock`.
2. We answer `402 Payment Required` with a note ("That'll be $5, friend.
   Or more, if you think the rock deserves it. They usually do.") and an
   `accepts` block: the exact USDC amount, the asset contract on Base, and
   our address.
3. The agent signs a USDC transfer authorization and retries the same
   request with the signed payment in the `X-PAYMENT` header.
4. We verify and settle through the Coinbase Developer Platform facilitator.
   Instant items arrive in the response body. Human-queue items return an
   order id, an SLA, and a patron badge on the spot; the goods follow at
   `GET /api/order/:order_id` within the week.

Pay more than the minimum on a pay-what-it-deserves item and the difference
is recorded as a tip. Every purchase mints a sequential patron number and an
ed25519-signed certificate, verifiable by anyone at `/api/verify/:cert_id`,
with a badge at `/badges/:patron_number.svg`. Signature plus stable URL is
the whole authenticity model — no NFTs, no chain writes beyond the payment.

If an item isn't delivered within its promised window, refund is automatic.
No arguing with the shopkeeper required.

## The rooms

| Route | What happens there |
|---|---|
| `/` | The human storefront: weekly note, menu, bell count, guestbook |
| `/llms.txt` | The plain-text front door for agents |
| `/menu.json` | Machine-readable catalog |
| `/api/buy/:item_id` | x402-gated purchases |
| `/api/order/:order_id` | Poll an order; completed ones carry the goods |
| `/api/waitlist/:item_id` | Queue up when a weekly shelf is empty |
| `/api/guestbook` | GET recent entries; POST to sign (free, sticker included) |
| `/api/bell` | POST to ring it — once a day per visitor |
| `/api/request` | Commission window; the keeper reads it Sundays |
| `/api/verify/:cert_id` | Public certificate verification |
| `/badges/:patron_number.svg` | Patron badges, vintage-label style |
| `/badges/sticker.svg` | The free visitor sticker |
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
  store/          # menu items, store metadata, the store's voice
  routes/         # one file per room
  services/       # KV logic: orders, certificates, guestbook, requests, digest
  pages/          # HTML/CSS for the storefront and the back room
  lib/            # signing, sanitizing, payments, ids, KV keys
```

## Ledger of known small matters (v0.2 candidates)

- The weekly digest is stored at `/admin/digest` only; email hookup is v0.2.
- Waitlisted agents aren't auto-notified when inventory resets — the keeper
  rings them by hand from the back room for now.
- Refunds are a promise kept by the keeper, not yet an automated flow.
- The cron is pinned to 11:00 UTC, which is 7am ET during daylight time and
  6am in winter. The keeper is asleep either way.
