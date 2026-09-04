import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createPublicClient, http, formatUnits } from "viem";
import { base, polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { DEFAULT_MAX_AMOUNT_PER_PAYMENT } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm";

/**
 * The EVM rails, one map: same buyer key, same ExactEvmScheme, same
 * EIP-3009 gasless transfer — only the chain, its native USDC, and
 * the CAIP-2 name differ. Adding an EVM rail here is the whole job
 * (the third-rail ruling: EVM chains get parity by parameterization).
 */
const EVM_RAILS = {
  base: {
    label: "Base",
    network: "eip155:8453",
    chain: base,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  polygon: {
    label: "Polygon",
    network: "eip155:137",
    chain: polygon,
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
};
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

/**
 * The keeper's shopping run: buy every item on the shelf once, as the
 * house, so a first buyer never finds a surprise the keeper didn't
 * find first. Everything books house-flagged (X-House header), pays
 * the MINIMUM tier, and writes receipts to shopping-run-receipts.json
 * (gitignored; contains cert ids, order ids, and verify results).
 *
 * The client's per-payment spend ceiling is pinned to each item's listed
 * price (see fetchWithPayFor): the stock @x402/fetch default is $1 and
 * silently refuses anything dearer.
 *
 * Usage:
 *   BUYER_PRIVATE_KEY=0x... HOUSE_SECRET=... node scripts/shopping-run.mjs
 * Over the Solana rail (registration runs; see PAYMENT_RAILS.md):
 *   RAIL=solana SOLANA_BUYER_KEY=<base58 secret> node scripts/shopping-run.mjs
 * Over the Polygon rail (same EVM wallet as Base, USDC on Polygon):
 *   RAIL=polygon BUYER_PRIVATE_KEY=0x... node scripts/shopping-run.mjs
 * Options (env):
 *   STORE_URL   default https://scvd.store
 *   ITEMS       comma-separated item ids (default: THE WHOLE MENU —
 *               which is a real bill. For a single diagnostic buy,
 *               always scope it: ITEMS=small_blessing npm run shop
 *   SKIP        comma-separated item ids to leave on the shelf
 *   DRY_RUN=1   print the plan and the total, buy nothing
 *   YES=1       skip the confirmation prompt
 *
 * The wallet needs USDC on the chosen rail for the total (the plan prints it)
 * plus nothing else; x402 uses gasless EIP-3009 transfers.
 *
 * Heads-up: the human-labor shelf is presence-gated (48h window).
 * Open /admin/counter right before the run or those items answer 503.
 */

const STORE_URL = process.env.STORE_URL ?? "https://scvd.store";
/** The client's stock per-payment cap, as the package writes it ("$1"). Never retyped. */
const CLIENT_DEFAULT_CAP = String(DEFAULT_MAX_AMOUNT_PER_PAYMENT);
const RECEIPTS_FILE = "shopping-run-receipts.json";

/** Item-specific required/useful parameters. The spec's inputs, honored. */
const ITEM_PARAMS = {
  context_anchor: {
    summary:
      "House shopping run: the keeper walking his own shelves so a first buyer never trips first.",
  },
  phantom_check: { url: `${STORE_URL}/` },
  graffiti_on_a_train: { tag: "the keeper walked past and left this" },
  // The founding fifty cents, 2026-07-22. A real settled transfer to
  // the store's own wallet, so a correct attestation must come back
  // SETTLED — anything else means the RPC path is broken, which is the
  // one failure mode no test in this repo can reach.
  settlement_attestation: {
    tx_hash:
      "0x47c8fee81e6d11bf07c9580b0d3aea3fabb9c2a9fe7aee3ae6f2f8391450bc9c",
  },
  coffees_for_closers: { win: "Walked every shelf in the store, once." },
  grudge: { grievance: "House test: a rate limit that shall remain nameless." },
  the_confession: {
    confession: "The keeper skipped the full walkthrough on opening week.",
  },
  quick_judgment: {
    detail: "House test: does the judgment pipeline hold end to end?",
  },
  phone_call: { detail: "House test call, keeper to himself. No dial needed." },
  human_witness: { detail: "House test: witness the store's own front door." },
  app_gutcheck: { detail: "House test: review the store itself." },
  nomenclature: {},
  // A house watch needs a real, non-self host (the Worker cannot fetch
  // its own hostname). The protocol's public site, one week, hourly —
  // negligible traffic, and the history doubles as a live demo.
  standing_watch: { url: "https://www.x402.org/" },
  /**
   * The verification tier's newer doors, added 2026-08-19 after the
   * first full house run bought 16 items and failed exactly seven —
   * these, every one a 400 for a missing required param, because this
   * table predated the doors. The trust shelf, unlisted in the Bazaar
   * for want of a parameter. Same precedents as above: the founding
   * transaction for the chain readers, the protocol's public site for
   * the URL doors (an honest not-ready verdict is still a complete
   * house test), and a fixed house digest for the anchor.
   */
  settlement_reconciliation: {
    tx_hash:
      "0x47c8fee81e6d11bf07c9580b0d3aea3fabb9c2a9fe7aee3ae6f2f8391450bc9c",
  },
  service_audit: { url: "https://www.x402.org/" },
  conformance_watch: { url: "https://www.x402.org/" },
  signature_agent_card: { url: "https://www.x402.org/" },
  onpage_audit: { url: "https://www.x402.org/" },
  bitcoin_anchor: {
    // sha256 of the UTF-8 string "scvd.store house shopping run — the
    // keeper walking his own shelves" — recompute it yourself; the
    // anchor proves the digest's existence, the preimage is this line.
    digest:
      "7524e7e1affc183e5075a2588268cc986831c4ae9cd8e0469ad3cb0b49f0e814",
    label: "house shopping run",
  },
  /**
   * The bundle needs 2-20 DISTINCT settled Base hashes and the store
   * refuses duplicates, so a hardcoded pair would rot. Pass your own —
   * any two settled transactions (the certs from a previous run each
   * carry one):
   *   BUNDLE_TX_HASHES=0xaaa...,0xbbb... npm run shop
   * Without it, attestation_bundle answers 400 and the run records
   * that honestly, same as before.
   */
  ...(process.env.BUNDLE_TX_HASHES
    ? { attestation_bundle: { tx_hashes: process.env.BUNDLE_TX_HASHES } }
    : {}),
};

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

/**
 * THE RAIL SWITCH (2026-08-04): RAIL=solana buys over the second rail
 * — same store, same 402, the Solana entries in accepts[]. Because
 * discovery indexing is settlement-triggered and chain-agnostic (one
 * settle per endpoint admits it, PAYMENT_RAILS.md), a Solana
 * registration run tests the new rail AND registers endpoints in one
 * purchase each.
 *
 * Key formats accepted, because wallets export differently:
 *   SOLANA_BUYER_KEY       base58 secret key (Solflare/Phantom export)
 *   SOLANA_BUYER_KEY_FILE  JSON byte-array file (solana-keygen output)
 */
const RAIL =
  process.env.RAIL === "solana"
    ? "solana"
    : EVM_RAILS[process.env.RAIL ?? "base"]
      ? (process.env.RAIL ?? "base")
      : fail(
          `RAIL must be one of ${[...Object.keys(EVM_RAILS), "solana"].join(", ")} — got "${process.env.RAIL}".`,
        );
/** The chosen EVM rail's config, or null when the rail is Solana. */
const evmRail = EVM_RAILS[RAIL] ?? null;
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

const privateKey = process.env.BUYER_PRIVATE_KEY;
const houseSecret = process.env.HOUSE_SECRET;
if (!process.env.DRY_RUN && evmRail && !privateKey) {
  fail(
    "BUYER_PRIVATE_KEY is required (0x-prefixed). Use the funded burner, never the till.",
  );
}
if (
  !process.env.DRY_RUN &&
  RAIL === "solana" &&
  !process.env.SOLANA_BUYER_KEY &&
  !process.env.SOLANA_BUYER_KEY_FILE
) {
  fail(
    "RAIL=solana needs SOLANA_BUYER_KEY (base58 secret, the wallet app's export) or SOLANA_BUYER_KEY_FILE (solana-keygen JSON). Use the funded test wallet, never the till.",
  );
}

let solanaSigner = null;
if (!process.env.DRY_RUN && RAIL === "solana") {
  const { createKeyPairSignerFromBytes, getBase58Encoder } = await import(
    "@solana/kit"
  );
  const rawBytes = process.env.SOLANA_BUYER_KEY
    ? new Uint8Array(getBase58Encoder().encode(process.env.SOLANA_BUYER_KEY))
    : Uint8Array.from(
        JSON.parse(readFileSync(process.env.SOLANA_BUYER_KEY_FILE, "utf8")),
      );
  solanaSigner = await createKeyPairSignerFromBytes(rawBytes);
}

/**
 * A listed house wallet is family by its own address, so the secret is
 * belt-and-braces rather than the only strap. This exists because a
 * buy that books as ORGANIC would be recorded as the store's first
 * outside sale, which would be false, and rule 13 does not bend for
 * convenience. Base58 is case-sensitive, so the Solana comparison is
 * exact where the EVM one lowercases.
 */
const houseWallets = JSON.parse(
  readFileSync(new URL("../src/store/house-wallets.json", import.meta.url)),
).wallets;
const buyerAddress =
  RAIL === "solana"
    ? (solanaSigner?.address ?? null)
    : privateKey
      ? privateKeyToAccount(privateKey).address.toLowerCase()
      : null;
const listedHouseWallet = houseWallets.find((entry) =>
  RAIL === "solana"
    ? entry.address === buyerAddress
    : entry.address.toLowerCase() === buyerAddress,
);
if (!process.env.DRY_RUN && !houseSecret && !listedHouseWallet) {
  fail(
    `This wallet (${buyerAddress}) is not in src/store/house-wallets.json, so the run would book as an ORGANIC sale — the store's first, and false.\n` +
      "  Fix it either way: add the address to that file and deploy, or pass HOUSE_SECRET=<secret>.",
  );
}
if (listedHouseWallet) {
  console.log(
    `\nHouse wallet recognised: ${listedHouseWallet.who} (${listedHouseWallet.address}). This run books as house.`,
  );
}

const menuResponse = await fetch(`${STORE_URL}/menu.json`);
if (!menuResponse.ok) {
  fail(`Couldn't read the menu (${menuResponse.status}). Is the store up?`);
}
const menu = await menuResponse.json();
const only = process.env.ITEMS?.split(",").map((s) => s.trim());
const skip = new Set(process.env.SKIP?.split(",").map((s) => s.trim()) ?? []);
const items = menu.items.filter(
  (item) => (!only || only.includes(item.id)) && !skip.has(item.id),
);
if (items.length === 0) {
  fail("Nothing to buy after ITEMS/SKIP filters.");
}

const total = items.reduce((sum, item) => sum + item.price_usdc, 0);
console.log(`\nThe shopping run — ${items.length} items, minimum tiers:\n`);
for (const item of items) {
  const params = ITEM_PARAMS[item.id]
    ? ` (params: ${Object.keys(ITEM_PARAMS[item.id]).join(", ") || "none"})`
    : "";
  console.log(
    `  ${item.id.padEnd(26)} $${String(item.price_usdc).padEnd(6)} ${item.fulfillment}${params}`,
  );
}
console.log(
  `\n  Total: $${total.toFixed(3)} USDC on ${evmRail?.label ?? "Solana"}, all house-flagged.`,
);
console.log(
  "  Human-queue items will stack orders at /admin/counter for you to self-fulfill\n  (that IS the other half of the test: work the counter like a stranger paid).",
);
console.log(
  `  Spend ceiling: pinned per purchase to the item's listed price. (The client's stock default is ${CLIENT_DEFAULT_CAP} per payment and refuses anything dearer, unsigned.)\n`,
);

if (process.env.DRY_RUN) {
  console.log("DRY_RUN set: bought nothing. Remove it to run for real.");
  process.exit(0);
}

// Know thy wallet before the till does: whose key, and is it funded?
const buyerAccount = evmRail ? privateKeyToAccount(privateKey) : null;
let balanceUsdc = null;
if (evmRail) {
  const publicClient = createPublicClient({
    chain: evmRail.chain,
    transport: http(),
  });
  const balanceRaw = await publicClient
    .readContract({
      address: evmRail.usdc,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [buyerAccount.address],
    })
    .catch(() => null);
  balanceUsdc = balanceRaw === null ? null : Number(formatUnits(balanceRaw, 6));
} else {
  // SPL balance: sum the wallet's USDC token accounts, public RPC.
  const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const rpcUrl =
    process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  balanceUsdc = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        buyerAddress,
        { mint: SOLANA_USDC_MINT },
        { encoding: "jsonParsed" },
      ],
    }),
  })
    .then((r) => r.json())
    .then((body) =>
      (body.result?.value ?? []).reduce(
        (sum, acct) =>
          sum +
          Number(
            acct.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0,
          ),
        0,
      ),
    )
    .catch(() => null);
}
const railLabel = evmRail?.label ?? "Solana";
console.log(`  Buyer wallet: ${buyerAddress} (${railLabel})`);
console.log(
  balanceUsdc === null
    ? `  USDC balance on ${railLabel}: (couldn't read; RPC hiccup, proceeding blind)`
    : `  USDC balance on ${railLabel}: $${balanceUsdc.toFixed(3)}`,
);
if (
  balanceUsdc !== null &&
  balanceUsdc < total &&
  !process.env.SKIP_BALANCE_CHECK
) {
  fail(
    `That wallet holds $${balanceUsdc.toFixed(3)} USDC on ${railLabel} but the run needs $${total.toFixed(3)}. ` +
      `Check: is this the wallet you funded, and is the USDC on ${railLabel} (not another chain)?`,
  );
}

if (!process.env.YES) {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await readline.question(`Spend $${total.toFixed(3)}? (yes/no) `);
  readline.close();
  if (answer.trim().toLowerCase() !== "yes") {
    fail("Held the wallet. Nothing bought.");
  }
}

// Diagnostic tap: notice whether a signed payment actually rode the retry.
// IMPORTANT: the x402 wrapper retries with a fully-built Request OBJECT as
// the first argument (no init). Any wrapper that rebuilds headers from init
// silently strips PAYMENT-SIGNATURE off the retry — twice now this comment
// is a headstone. Normalize through new Request() and mutate ITS headers.
let lastRequestPaid = false;
const houseFetch = (input, init) => {
  const request = new Request(input, init);
  // Only when we have one: setting it to "undefined" would send a
  // header that says house and proves nothing.
  if (houseSecret) {
    request.headers.set("X-House", houseSecret);
  }
  lastRequestPaid = request.headers.has("PAYMENT-SIGNATURE");
  return fetch(request);
};
// x402 v2.19 client shape: schemes registered per network, signer inside.
// Registering ONLY the chosen rail's scheme is what selects the rail: the
// client can only satisfy accepts[] entries whose network it holds a
// scheme for, so RAIL=solana pays the Solana offer or fails loudly —
// never silently falls back to Base.
const schemes = [];
if (evmRail) {
  schemes.push({
    network: evmRail.network,
    client: new ExactEvmScheme(buyerAccount),
  });
} else {
  const { ExactSvmScheme } = await import("@x402/svm/exact/client");
  schemes.push({
    network: SOLANA_MAINNET,
    client: new ExactSvmScheme(solanaSigner),
  });
}
/**
 * THE CLIENT'S OWN CEILING, SET ON PURPOSE (2026-09-04, CV's field
 * notes). @x402/fetch ships with spendControls ON and a per-payment
 * cap — DEFAULT_MAX_AMOUNT_PER_PAYMENT, imported below rather than
 * retyped — and this runner never set one. So the store's own
 * reference client refused the store's own $5 service_audit outright,
 * before signing anything, with a one-line error this loop cut to 120
 * characters. An integrator who copied this file as their starter
 * would hit the identical wall on anything over a dollar and probably
 * not know why (docs/SPEND_CAP_RULINGS_2026-08.md is the store's own
 * paper on exactly this, written about OTHER people's clients).
 *
 * The ceiling is not disabled; it is pinned, per purchase, to the
 * shelf price of the item in hand. That keeps the control doing real
 * work — a 402 that quotes more than the listed price is refused
 * unsigned, which is a store-side bug this runner should surface, not
 * pay — and on a pay-what-it's-worth door it selects the minimum tier
 * by construction rather than by accept order.
 */
function fetchWithPayFor(item) {
  return wrapFetchWithPaymentFromConfig(houseFetch, {
    schemes,
    spendControls: { maxAmountPerPayment: item.price_usdc },
  });
}

const receipts = existsSync(RECEIPTS_FILE)
  ? JSON.parse(readFileSync(RECEIPTS_FILE, "utf8"))
  : [];

let bought = 0;
let failed = 0;
for (const item of items) {
  const params = new URLSearchParams({
    agent_name: "the keeper, walking his own shelves",
    source: "shopping-run",
    ...(ITEM_PARAMS[item.id] ?? {}),
  });
  const url = `${STORE_URL}/api/buy/${item.id}?${params}`;
  process.stdout.write(`→ ${item.id} ... `);
  try {
    lastRequestPaid = false;
    const response = await fetchWithPayFor(item)(url);
    const body = await response.json();
    if (!response.ok) {
      failed += 1;
      const diagnosis =
        response.status === 402
          ? lastRequestPaid
            ? `a signed payment was offered and DECLINED (usually: not enough USDC on ${railLabel} in this wallet, or the authorization failed verification)`
            : "the client never attached a payment to the retry (client-side problem, tell the shoptender)"
          : "unexpected status";
      // Full forensics: the decline body says WHY, when anyone asks it to.
      const declineDetail = JSON.stringify(body).slice(0, 600);
      const paymentResponseHeader =
        response.headers.get("PAYMENT-RESPONSE") ??
        response.headers.get("X-PAYMENT-RESPONSE");
      console.log(`✖ ${response.status}: ${body.error ?? "unknown"}`);
      console.log(`    diagnosis: ${diagnosis}`);
      console.log(`    decline body: ${declineDetail}`);
      if (paymentResponseHeader) {
        console.log(`    payment-response header: ${paymentResponseHeader.slice(0, 300)}`);
      }
      receipts.push({
        item: item.id,
        at: new Date().toISOString(),
        ok: false,
        status: response.status,
        payment_attached: lastRequestPaid,
        error: body.error,
        decline_body: body,
        payment_response_header: paymentResponseHeader,
      });
      continue;
    }
    // The signed RECEIPT rides the settlement response's
    // PAYMENT-RESPONSE header (extensions["offer-receipt"].info
    // .receipt.signature). Captured on success so a receipt-path
    // test is one shopping run, not a custom script.
    let receiptJws = null;
    try {
      const prHeader =
        response.headers.get("PAYMENT-RESPONSE") ??
        response.headers.get("X-PAYMENT-RESPONSE");
      if (prHeader) {
        const decodedPr = JSON.parse(
          Buffer.from(prHeader, "base64").toString("utf8"),
        );
        receiptJws =
          decodedPr?.extensions?.["offer-receipt"]?.info?.receipt
            ?.signature ?? null;
      }
    } catch {
      receiptJws = null;
    }
    const certId = body.certificate?.cert_id ?? body.cert_id;
    const verify = certId
      ? await (await fetch(`${STORE_URL}/api/verify/${certId}`)).json()
      : null;
    bought += 1;
    console.log(
      `✔ $${body.paid_usdc} patron #${body.patron_number}` +
        (body.order_id ? ` order ${body.order_id}` : "") +
        (verify ? ` verify:${verify.valid ? "valid" : "INVALID"}` : ""),
    );
    if (receiptJws) {
      console.log(`    receipt JWS captured (${receiptJws.length} chars) — in ${RECEIPTS_FILE} as receipt_jws`);
    }
    receipts.push({
      item: item.id,
      at: new Date().toISOString(),
      ok: true,
      receipt_jws: receiptJws,
      paid_usdc: body.paid_usdc,
      patron_number: body.patron_number,
      cert_id: certId,
      order_id: body.order_id,
      /**
       * THE IDENTIFIERS THAT LIVE ONLY IN THE RESPONSE — a watch id, a
       * statement url, a mandate id, a check id. The store spreads
       * them FLAT into the body (fulfillment.ts spreads goods.extras),
       * so there is no `extras` key to grab: this file kept the
       * receipt and the cert and let every one of these scroll off the
       * terminal. A standing watch bought by the house was
       * unrecoverable the moment it did. CV hit exactly that on
       * 2026-08-21 and had to buy the watch a second time to get its
       * id back.
       *
       * Everything the body carried beyond the fields already named
       * above, kept verbatim. A NEW identifier invented next month is
       * kept by this line without anybody remembering to add it —
       * which is the property the old code lacked.
       */
      response_extras: Object.fromEntries(
        Object.entries(body).filter(
          ([key]) =>
            ![
              "message",
              "item_id",
              "deliverable",
              "paid_usdc",
              "tip_usdc",
              "certificate",
              "cert_id",
              "order_id",
              "patron_number",
            ].includes(key),
        ),
      ),
      verify_valid: verify?.valid,
      deliverable: body.deliverable,
    });
  } catch (error) {
    failed += 1;
    console.log(`✖ ${String(error).slice(0, 120)}`);
    if (/spendControls/.test(String(error))) {
      // The client refused to sign: every accept in the 402 was above
      // the ceiling pinned to this item's listed price. Nothing was
      // signed and nothing moved. Since the ceiling IS the shelf price,
      // this means the store quoted more than it lists — ours to fix.
      console.log(
        `    diagnosis: the client's spend ceiling ($${item.price_usdc}, this item's listed price) refused every accept in the 402 before signing — the store quoted more than the shelf says. Nothing signed, nothing moved. File it.`,
      );
    }
    receipts.push({ item: item.id, at: new Date().toISOString(), ok: false, error: String(error) });
  }
  writeFileSync(RECEIPTS_FILE, JSON.stringify(receipts, null, 2));
  // Patron numbers claim by readback; give KV a beat between buys.
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

console.log(
  `\nDone: ${bought} bought, ${failed} failed. Receipts in ${RECEIPTS_FILE}.`,
);
console.log(
  "Next: /admin/counter has the human-queue orders — fulfill each one by hand.\n(Luckies and coffees are instant now; nothing waits on you for those.)\nAnything that surprised you = a bug a first buyer would have found. File it.",
);
