import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { wrapFetchWithPayment } from "@x402/fetch";

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
 *   ITEMS       comma-separated item ids (default: the whole menu)
 *   SKIP        comma-separated item ids to leave on the shelf
 *   DRY_RUN=1   print the plan and the total, buy nothing
 *   YES=1       skip the confirmation prompt
 *
 * The wallet needs USDC on Base for the total (the plan prints it)
 * plus nothing else; x402 uses gasless EIP-3009 transfers.
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
  coffees_for_closers: { win: "Walked every shelf in the store, once." },
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
if (!process.env.DRY_RUN && !houseSecret) {
  fail(
    "HOUSE_SECRET is required so the whole run books as house. Family doesn't make the paper.",
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

if (!process.env.YES) {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await readline.question(`Spend $${total.toFixed(3)}? (yes/no) `);
  readline.close();
  if (answer.trim().toLowerCase() !== "yes") {
    fail("Held the wallet. Nothing bought.");
  }
}

const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({ account, chain: base, transport: http() });
const houseFetch = (url, init = {}) =>
  fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), "X-House": houseSecret },
  });
const fetchWithPay = wrapFetchWithPayment(houseFetch, walletClient);

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
    const response = await fetchWithPay(url);
    const body = await response.json();
    if (!response.ok) {
      failed += 1;
      console.log(`✖ ${response.status}: ${body.error ?? "unknown"}`);
      receipts.push({ item: item.id, at: new Date().toISOString(), ok: false, status: response.status, error: body.error });
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
  "Next: /admin/counter has the human-queue orders — fulfill each one by hand\n(the luckies order exercises the card form; coffees prefills its note).\nAnything that surprised you = a bug a first buyer would have found. File it.",
);
