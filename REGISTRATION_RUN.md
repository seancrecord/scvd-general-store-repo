# The registration run — one settle per endpoint, over the Solana rail

The run that does two jobs at once (CV's batching call, 2026-08-04):
every settled payment REGISTERS its endpoint in CDP discovery (the
only admission mechanism that exists — no API, no form; see
PAYMENT_RAILS.md "How CDP discovery actually admits an endpoint"),
and every Solana-rail settle EXERCISES the second rail end-to-end
with real money. 22 of 24 menu items are currently invisible to
every Bazaar-fed surface (Agentic Market shows 2). This run fixes
that and live-tests the rail in the same ~24 purchases.

Runner: CV. Hands with network and the funded Solana test wallet.

## Gate zero, before ANY purchase — the wallet is listed and DEPLOYED

The buyer wallet's public address must be in
`src/store/house-wallets.json` AND that change must be LIVE on
scvd.store before the first settle. This has been violated three
times, each costing a public correction; the script refuses unlisted
wallets, but the refusal is the backstop, not the plan. Verify:

    curl -s https://scvd.store/menu.json >/dev/null  # store up
    # then confirm the address appears in the deployed register —
    # the shopkeeper (Claude) lists it and the keeper merges BEFORE
    # this run starts. If you are reading this and the address is not
    # in house-wallets.json on the MAIN branch: stop here.

Also confirm the rail is live: the 402 must offer Solana —

    curl -s -D - -o /dev/null "https://scvd.store/api/buy/small_blessing" \
      | grep -i payment-required | cut -d' ' -f2 | base64 -d | grep -c solana

Nonzero = door open. Zero = SOLANA_PAY_TO not deployed yet; stop.

## Setup

From a pulled repo root (`git pull origin main` first):

    npm ci                       # @x402/svm + @solana/kit ride the lockfile
    export SOLANA_BUYER_KEY=...  # base58 secret from the wallet app's export
                                 # (Solflare/Phantom "export private key").
                                 # solana-keygen JSON instead? use
                                 # SOLANA_BUYER_KEY_FILE=path/to/keypair.json

Key handling per the standing rule: by env/file on the runner's
machine, never pasted into chat, never committed. The wallet needs
USDC on Solana for the plan total (the script prints it and checks
the balance via public RPC; SOLANA_RPC_URL overrides the endpoint).
No SOL needed for the transfers themselves — the facilitator is the
fee payer.

## The run, staged

**Stage 0 — one diagnostic buy, then stop and verify:**

    DRY_RUN=1 RAIL=solana node scripts/shopping-run.mjs   # read the plan
    RAIL=solana ITEMS=small_blessing node scripts/shopping-run.mjs

Before proceeding, verify ALL of on that one purchase:
1. The script printed `verify:valid` and a receipt JWS was captured.
2. The cert records the rail: fetch the verify URL and check
   `certificate.network` is `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
   — NOT `eip155:8453`. A Base value here means the client fell back
   somehow; stop and report, because every later conclusion about
   the rail depends on this field being right.
3. The settlement tx is a Solana signature (base58, not 0x…), and it
   confirms on a Solana explorer with a USDC transfer to
   `DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE`.
4. `/stats` house count went up by one; organic did NOT move.

Per the verdict protocol (AGENT_UX.md): the cert object and the
payer row are the instruments; the script's own success line is
testimony.

**Stage 1 — the instant shelf** (cheap, no keeper labor):

    RAIL=solana SKIP=phone_call,human_witness,app_gutcheck,portrait,the_collab,quick_judgment \
      node scripts/shopping-run.mjs

Notes riding along:
- `standing_watch` buys a real 7-day watch of x402.org — fine, that
  history doubles as a live demo of the product.
- 1.5s between buys is built in; patron numbers claim by readback.
- Any 402 on the retry: the script prints whether a signed payment
  was attached and the decline body. A Solana-side decline is NEW
  INFORMATION about the rail — capture the whole output.

**Stage 2 — the human shelf** (keeper's call on timing, real orders):

    RAIL=solana ITEMS=phone_call,human_witness,app_gutcheck,portrait,the_collab,quick_judgment \
      node scripts/shopping-run.mjs

Every one lands a REAL order on /admin/counter with a REAL SLA clock
that does not know it's family. The keeper self-fulfills promptly or
gets paged by his own store. `human_witness` consumes a unit of real
weekly inventory — run it early in the inventory week. The
human-labor shelf is presence-gated: the keeper opens /admin/counter
right before this stage or these answer 503.

## After the run

1. `npm run agentic:check` (with CDP keys) — the CDP column should
   now show every purchased endpoint cataloged. Same-day Agentic
   Market lag is expected; note what it shows anyway.
2. Recheck the market listing over the next several days. The 8/1→8/4
   shrink (15 endpoints → 2) suggests their mirror prunes by RECENCY,
   not membership — if the count decays again within days, that
   hypothesis is confirmed and staleness becomes a standing item (the
   ward round will watch it; this is the Night Watch thesis pointed
   at our own listing).
3. Report the money block per the logging spec: balances before/after,
   offered vs paid per item, tx signatures — and the two-column
   claimed-vs-verified table. The Solana cap meter will read ~the run
   total (it counts house money too — the bound is about
   reconciliation coverage, not organics); if it pages the keeper
   mid-run, that is the meter working, not a failure.
4. File anything that surprised you. A registration run that finds a
   bug is a cold-walk that got paid for.
