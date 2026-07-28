import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";

/** USDC on Base mainnet; the store's till takes nothing else. */
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
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
 * Usage:
 *   BUYER_PRIVATE_KEY=0x... HOUSE_SECRET=... node scripts/shopping-run.mjs
 * Options (env):
 *   STORE_URL   default https://scvd.store
 *   ITEMS       comma-separated item ids (default: THE WHOLE MENU —
 *               which is a real bill. For a single diagnostic buy,
 *               always scope it: ITEMS=small_blessing npm run shop
 *   SKIP        comma-separated item ids to leave on the shelf
 *   DRY_RUN=1   print the plan and the total, buy nothing
 *   YES=1       skip the confirmation prompt
 *
 * The wallet needs USDC on Base for the total (the plan prints it)
 * plus nothing else; x402 uses gasless EIP-3009 transfers.
 *
 * Heads-up: the human-labor shelf is presence-gated (48h window).
 * Open /admin/counter right before the run or those items answer 503.
 */

const STORE_URL = process.env.STORE_URL ?? "https://scvd.store";
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
};

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const privateKey = process.env.BUYER_PRIVATE_KEY;
const houseSecret = process.env.HOUSE_SECRET;
if (!process.env.DRY_RUN && !privateKey) {
  fail(
    "BUYER_PRIVATE_KEY is required (0x-prefixed). Use the funded burner, never the till.",
  );
}
/**
 * A listed house wallet is family by its own address, so the secret is
 * belt-and-braces rather than the only strap. This exists because a
 * buy that books as ORGANIC would be recorded as the store's first
 * outside sale, which would be false, and rule 13 does not bend for
 * convenience.
 */
const houseWallets = JSON.parse(
  readFileSync(new URL("../src/store/house-wallets.json", import.meta.url)),
).wallets;
const buyerAddress = privateKey
  ? privateKeyToAccount(privateKey).address.toLowerCase()
  : null;
const listedHouseWallet = houseWallets.find(
  (entry) => entry.address.toLowerCase() === buyerAddress,
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
console.log(`\n  Total: $${total.toFixed(3)} USDC on Base, all house-flagged.`);
console.log(
  "  Human-queue items will stack orders at /admin/counter for you to self-fulfill\n  (that IS the other half of the test: work the counter like a stranger paid).\n",
);

if (process.env.DRY_RUN) {
  console.log("DRY_RUN set: bought nothing. Remove it to run for real.");
  process.exit(0);
}

// Know thy wallet before the till does: whose key, and is it funded?
const buyerAccount = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: base, transport: http() });
const balanceRaw = await publicClient
  .readContract({
    address: USDC_ADDRESS,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [buyerAccount.address],
  })
  .catch(() => null);
const balanceUsdc =
  balanceRaw === null ? null : Number(formatUnits(balanceRaw, 6));
console.log(`  Buyer wallet: ${buyerAccount.address}`);
console.log(
  balanceUsdc === null
    ? "  USDC balance on Base: (couldn't read; RPC hiccup, proceeding blind)"
    : `  USDC balance on Base: $${balanceUsdc.toFixed(3)}`,
);
if (
  balanceUsdc !== null &&
  balanceUsdc < total &&
  !process.env.SKIP_BALANCE_CHECK
) {
  fail(
    `That wallet holds $${balanceUsdc.toFixed(3)} USDC on Base but the run needs $${total.toFixed(3)}. ` +
      "Check: is this the wallet you funded, and is the USDC on the BASE network (not mainnet/other chains)?",
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
// x402 v2.19 client shape: schemes registered per network, EVM signer inside.
const fetchWithPay = wrapFetchWithPaymentFromConfig(houseFetch, {
  schemes: [
    { network: "eip155:8453", client: new ExactEvmScheme(buyerAccount) },
  ],
});

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
    const response = await fetchWithPay(url);
    const body = await response.json();
    if (!response.ok) {
      failed += 1;
      const diagnosis =
        response.status === 402
          ? lastRequestPaid
            ? "a signed payment was offered and DECLINED (usually: not enough USDC on Base in this wallet, or the authorization failed verification)"
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
    receipts.push({
      item: item.id,
      at: new Date().toISOString(),
      ok: true,
      paid_usdc: body.paid_usdc,
      patron_number: body.patron_number,
      cert_id: certId,
      order_id: body.order_id,
      verify_valid: verify?.valid,
      deliverable: body.deliverable,
    });
  } catch (error) {
    failed += 1;
    console.log(`✖ ${String(error).slice(0, 120)}`);
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
