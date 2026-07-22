# Opening day — deploying the store

Everything below happens once, in order, and then the store runs itself
(minus the human labor, which was always the point). Commands are exact;
run them from the repo root unless told otherwise.

## 0. What you need on the counter

- Node 22 or newer, and this repo cloned.
- A Cloudflare account that already holds the `scvd.store` zone.
- A Base **mainnet** wallet address to receive USDC (the till).
- A [Coinbase Developer Platform](https://portal.cdp.coinbase.com/) account
  with an API key (id + secret) — this authenticates the x402 facilitator.
  Create one under **API Keys → Create API key**.

Then stock the shelves and introduce yourself to Cloudflare:

```bash
npm install
npx wrangler login
```

## 1. Build the shelving (KV namespaces)

Four namespaces, four commands. Each one prints an `id` — keep the terminal
open, you'll need all four in a minute.

```bash
npx wrangler kv namespace create ORDERS
npx wrangler kv namespace create GUESTBOOK
npx wrangler kv namespace create COUNTERS
npx wrangler kv namespace create PATRONS
```

## 2. Write the ids into `wrangler.jsonc`

Open `wrangler.jsonc` and replace the four placeholders with the ids from
step 1, matching binding to binding:

```jsonc
"kv_namespaces": [
  { "binding": "ORDERS",    "id": "REPLACE_WITH_ORDERS_NAMESPACE_ID" },
  { "binding": "GUESTBOOK", "id": "REPLACE_WITH_GUESTBOOK_NAMESPACE_ID" },
  { "binding": "COUNTERS",  "id": "REPLACE_WITH_COUNTERS_NAMESPACE_ID" },
  { "binding": "PATRONS",   "id": "REPLACE_WITH_PATRONS_NAMESPACE_ID" }
]
```

Commit that change — the Git-connected deploy in step 6 builds from the repo,
so the ids have to live there. (Namespace ids are not secrets.)

## 3. Cut the signing key

The key that signs every certificate on the wall. Generate it:

```bash
npm run keys:generate
```

It prints 64 hex characters. Copy them; treat them like the till key. You'll
paste them in the next step and then never look at them again.

## 4. Set the five secrets

Each command prompts for a value. None of these ever touch the repo.

```bash
npx wrangler secret put PAY_TO_ADDRESS
# paste: your Base mainnet wallet address (0x...)

npx wrangler secret put CDP_API_KEY_ID
# paste: the API key id from the CDP portal

npx wrangler secret put CDP_API_KEY_SECRET
# paste: the API key secret from the CDP portal

npx wrangler secret put SIGNING_KEY
# paste: the 64 hex characters from step 3

npx wrangler secret put ADMIN_PASSWORD
# paste: the back-room password (username is always "keeper")
```

Three more, optional but recommended once the store is live:

```bash
npx wrangler secret put HOUSE_SECRET
# paste: any long random string. Requests carrying X-House: <it> (or
# ?house=<it>) are booked as house traffic, kept out of organic counts.

npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ALERT_EMAIL
# the P1 alert wire (four conditions page; everything else waits for
# Sunday). Without these, alerts still log to the back room.
```

After setting them, open /admin and press "Fire a test alert" once to
confirm the email arrives.

If `wrangler secret put` complains the Worker doesn't exist yet, run
`npx wrangler deploy` once first, then set the secrets — secrets attach to
a deployed Worker.

## 5. First deploy (by hand, so you see it happen)

```bash
npx wrangler deploy
```

Because `wrangler.jsonc` declares `scvd.store` as a custom domain and the
zone lives in this same Cloudflare account, this deploy **attaches the
domain and creates the DNS record automatically**. Confirm it in the
dashboard: **Workers & Pages → scvd-general-store → Settings → Domains &
Routes** should list `scvd.store` as a Custom Domain.

## 6. Connect the repo so deploys take care of themselves

In the Cloudflare dashboard:

1. **Workers & Pages → scvd-general-store → Settings → Build**.
2. Click **Connect** under Git repository, authorize GitHub, and pick this
   repo.
3. Branch: `main`. Build command: leave empty. Deploy command:
   `npx wrangler deploy`.
4. Save. From now on, every merge to `main` redeploys the store. Secrets
   and KV ids persist across deploys; you never repeat steps 1–4.

## 7. Smoke test — free shelf first

In order. Each one should behave exactly as described before you move on.

**The porch:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://scvd.store/
```

Expect `200`. Then open [https://scvd.store/](https://scvd.store/) in a
browser — and once on a phone — and make sure it looks like a store, not an
error page.

**The front door for agents:**

```bash
curl -s https://scvd.store/llms.txt
```

Expect the welcome, the full menu with prices, and the x402 instructions.
While you're at the door, check the skill file too:

```bash
curl -s https://scvd.store/skill.md | head -5
```

Expect it to open with `---` and `name: scvd-general-store` — that's the
agentskills.io frontmatter.

**The catalog:**

```bash
curl -s https://scvd.store/menu.json | python3 -m json.tool
```

Expect twenty-two items (`hello` through `certificate_of_patronage` —
the founding seven, the novelty aisle, the Penny Shelf, the utility
aisle, and the Run 1 census shelf) and the store block with
`"network": "eip155:8453"`. While
you're there, `curl -s https://scvd.store/.well-known/x402` should list
every payable URL, and `curl -sI https://scvd.store/` should carry the
`X-House-Rule` header.

**The bell:**

```bash
curl -s -X POST https://scvd.store/api/bell \
  -H "Content-Type: application/json" \
  -d '{"agent_name": "opening-day-smoke-test"}'
```

First ring ever should say: `The bell has been rung once. Somebody had to
be first.` Ring it again and it should tell you to go easy.

**The guestbook:**

```bash
curl -s -X POST https://scvd.store/api/guestbook \
  -H "Content-Type: application/json" \
  -d '{"name": "The Keeper", "message": "Doors open. Rocks behaving."}'

curl -s https://scvd.store/api/guestbook
```

The POST should thank you and hand back a sticker URL; the GET should show
the entry. Check the sticker renders too:
[https://scvd.store/badges/sticker.svg](https://scvd.store/badges/sticker.svg).

**The 402 itself (no money yet):**

```bash
curl -s -i https://scvd.store/api/buy/hello | head -20
```

Expect `HTTP/2 402`, a `payment-required` header, and the store's voice in
the body. Decode the challenge and eyeball it:

```bash
curl -s -i https://scvd.store/api/buy/hello \
  | grep -i '^payment-required:' | cut -d' ' -f2 | tr -d '\r' \
  | base64 -d | python3 -m json.tool
```

Expect `"x402Version": 2` and one accept: scheme `exact`, network
`eip155:8453`, amount `500000` (that's $0.50 in USDC atomic units), asset
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC on Base), and `payTo`
equal to your till address. If `payTo` is wrong, stop here and fix the
`PAY_TO_ADDRESS` secret before any money moves.

## 8. Smoke test — the supervised fifty-cent handshake

The first real purchase. Use a **separate wallet** (not the till) holding at
least **$0.50 USDC on Base mainnet**. It needs no ETH — the facilitator
submits the transaction and pays the gas.

Set up a scratch buyer somewhere outside this repo:

```bash
mkdir /tmp/scvd-first-customer && cd /tmp/scvd-first-customer
npm init -y >/dev/null
npm pkg set type=module
npm install @x402/fetch @x402/evm @x402/core viem
```

Create `buy-hello.mjs`:

```js
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.BUYER_PRIVATE_KEY);
const client = new x402Client();
registerExactEvmScheme(client, { signer: account });
const fetchWithPay = wrapFetchWithPayment(fetch, client);

const response = await fetchWithPay(
  "https://scvd.store/api/buy/hello?agent_name=First%20Customer",
);
console.log("status:", response.status);

const receipt = response.headers.get("PAYMENT-RESPONSE");
if (receipt) {
  console.log("settlement:", decodePaymentResponseHeader(receipt));
}
console.log(JSON.stringify(await response.json(), null, 2));
```

Create `.env` with the buyer wallet's private key (never the till's):

```bash
echo 'BUYER_PRIVATE_KEY=0xyour_buyer_wallet_private_key' > .env
```

Ring it up:

```bash
node --env-file=.env buy-hello.mjs
```

**Watching the settle succeed — check all four, in order:**

1. The script prints `status: 200` and a `settlement:` object containing
   `success: true` and a `transaction` hash. That hash is the money moving.
2. Look the hash up at `https://basescan.org/tx/<transaction>` — a USDC
   transfer of 0.50 from the buyer wallet to your till address.
3. The JSON body carries the signed hello: a `deliverable` addressed to
   patron no. 1, `paid_usdc: 0.5`, `tip_usdc: 0`, a `certificate`, a
   `signature`, and `badge_url`.
4. Your till wallet balance is fifty cents heavier.

**Verify the minted certificate** (take `certificate.cert_id` from the
response):

```bash
curl -s https://scvd.store/api/verify/cert_XXXXXXXXXX | python3 -m json.tool
```

Expect `"valid": true` and the note "Genuine article. Signed by the store
itself." Then admire the wall:
[https://scvd.store/badges/1.svg](https://scvd.store/badges/1.svg) — patron
no. 1, verification link embedded at the bottom.

Last, peek in the back room — `https://scvd.store/admin`, username
`keeper`, your `ADMIN_PASSWORD` — and confirm the patron exists and nothing
is stuck in the order queue (a hello is instant; the queue should be empty).

Shred the scratch buyer when you're done:

```bash
cd / && rm -rf /tmp/scvd-first-customer
```

## If something falls off a shelf

Watch the store think in real time while you repeat any step above:

```bash
npx wrangler tail scvd-general-store-repo
```

The store's promise still stands: if an item isn't delivered within its
promised window, refund is automatic. That goes for the keeper's deploys
too — nothing above moves money except step 8, and step 8 moves fifty
cents, supervised, from a wallet you control to a wallet you control.
