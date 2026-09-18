#!/usr/bin/env node
/**
 * THE UCP LAUNCH QUALIFICATION: one item, one rail, real money, the
 * whole loop, recorded.
 *
 *   UCP_BUYER_KEY=0x… node scripts/ucp-live.mjs \
 *     --base https://scvd.store --item hello --rail eip155:8453 \
 *     --out research/ucp-launch-2026-09-18 [--input name=value …] [--keep-response]
 *
 * What it proves, in the order the launch acceptance bar states it:
 *
 *   profile advertises dev.ucp.shopping.checkout
 *     ⇕ Create quotes the item on the rail, carrying the exact x402
 *       requirements to sign
 *     ⇕ Complete, with a real signed payment, returns the checkout
 *       completed with its order
 *     ⇕ Get Checkout shows completed + the same order
 *     ⇕ Get Order returns the same durable order with its settlement
 *     ⇕ the identical Complete sent again — first with its response
 *       deliberately dropped unread, then again after the order was
 *       read — returns the same order and the same settlement, so
 *       nothing was charged twice
 *
 * What it does NOT prove, and says so in the report: that the chain
 * moved USDC exactly once. The store's answer is the same order and
 * the same transaction for every retry, and an EIP-3009 nonce cannot
 * be spent twice on-chain; the script does not read the chain. A
 * settlement attestation on the recorded transaction is the
 * independent read (the store's own /api/buy/settlement_attestation,
 * or any explorer).
 *
 * WHAT IT RECORDS. Every response body, verbatim, to <out>/responses,
 * each with the schema id the conformance gate validates it against —
 * so `npm run ucp:conformance` reads the qualification's own documents
 * on every run from then on, not builders. The signed credential is
 * never written: only its sha256, so the record can be matched to a
 * payment without carrying a spent authorization around.
 *
 * ONE RAIL AT A TIME. EVM rails sign with viem + @x402/evm. Solana is
 * refused here until the Base loop has been proved end to end; adding
 * it is a signer, not a different loop.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SCHEMA = {
  profile: "https://ucp.dev/schemas/profile.json#/$defs/business_schema",
  lookup: "https://ucp.dev/schemas/shopping/catalog_lookup.json#/$defs/lookup_response",
  checkout: "https://ucp.dev/schemas/shopping/checkout.json",
  order: "https://ucp.dev/schemas/shopping/order.json",
};

/** The documents a run records, in order, with the schema each must satisfy. */
export const RECORDED = [
  ["profile", SCHEMA.profile, "GET /.well-known/ucp"],
  ["catalog_lookup", SCHEMA.lookup, "POST /ucp/v1/catalog/lookup"],
  ["checkout_create", SCHEMA.checkout, "POST /ucp/v1/checkout-sessions"],
  ["checkout_complete", SCHEMA.checkout, "POST /ucp/v1/checkout-sessions/{id}/complete"],
  ["checkout_get", SCHEMA.checkout, "GET /ucp/v1/checkout-sessions/{id}"],
  ["order_get", SCHEMA.order, "GET /ucp/v1/orders/{id}"],
  ["checkout_complete_replay", SCHEMA.checkout, "POST /ucp/v1/checkout-sessions/{id}/complete"],
  ["order_get_after_replay", SCHEMA.order, "GET /ucp/v1/orders/{id}"],
];

const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

/**
 * Drive the loop. `sign(requirements, resource)` returns the x402
 * payment payload for the frozen requirements; `fetcher` is fetch or a
 * stand-in. Nothing here is Node-specific, so the test can run it
 * against a fake store without a key or a network.
 */
export async function qualifyUcpCheckout({
  base,
  item,
  rail,
  inputs = {},
  sign,
  fetcher = fetch,
  loseResponse = true,
  now = () => new Date(),
}) {
  const origin = new URL(base).origin;
  const checks = [];
  const responses = {};
  const add = (id, pass, detail) => {
    checks.push({ id, status: pass ? "pass" : "fail", ...(detail !== undefined ? { detail } : {}) });
    return pass;
  };
  const record = (name, served_at, status, body) => {
    const entry = RECORDED.find((row) => row[0] === name);
    responses[name] = { served_at, recorded_at: now().toISOString(), status, schema: entry?.[1], body };
    return body;
  };
  const request = async (path, init = {}) => {
    const response = await fetcher(new URL(path, origin), {
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { unparseable: text.slice(0, 2048) };
    }
    return { status: response.status, body };
  };
  const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });

  const report = {
    instrument: "scripts/ucp-live.mjs",
    base: origin,
    item,
    rail,
    started_at: now().toISOString(),
  };

  try {
    // 1. The profile advertises what this loop is about to use.
    const profile = record("profile", "GET /.well-known/ucp", ...Object.values(await request("/.well-known/ucp")));
    const capabilities = Object.keys(profile?.ucp?.capabilities ?? {});
    add("profile:advertises-checkout", capabilities.includes("dev.ucp.shopping.checkout"), capabilities);
    add("profile:advertises-order", capabilities.includes("dev.ucp.shopping.order"));
    const handlers = profile?.ucp?.payment_handlers?.["store.scvd.payment.usdc"] ?? [];
    add("profile:rail-declared", handlers.some((h) => h?.config?.network === rail), handlers.map((h) => h?.config?.network));
    const status = profile?.["store.scvd"]?.status ?? {};
    add("profile:item-open", status.checkout === "live" && (typeof status.items === "string" || (Array.isArray(status.items) && status.items.includes(item))), status);
    if (checks.some((c) => c.status === "fail")) throw new Error("The profile does not offer this item on this rail; nothing was paid.");

    // 2. The catalog names the variant Create will be asked for.
    const lookup = record("catalog_lookup", "POST /ucp/v1/catalog/lookup", ...Object.values(await post("/ucp/v1/catalog/lookup", { ids: [item] })));
    const variant = lookup?.products?.[0]?.variants?.[0]?.id;
    add("lookup:variant", typeof variant === "string" && variant.length > 0, variant);
    if (typeof variant !== "string") throw new Error("Lookup returned no variant; nothing was paid.");

    // 3. Create: quoted on the rail, with the exact requirements to sign.
    const created = await post("/ucp/v1/checkout-sessions", {
      line_items: [{ item: { id: variant }, quantity: 1 }],
      "store.scvd": { network: rail, ...(Object.keys(inputs).length ? { inputs } : {}) },
    });
    const checkout = record("checkout_create", "POST /ucp/v1/checkout-sessions", created.status, created.body);
    add("create:201", created.status === 201, created.status);
    add("create:ready", checkout?.status === "ready_for_complete", checkout?.status);
    const quoted = checkout?.ucp?.payment_handlers?.["store.scvd.payment.usdc"]?.[0];
    const requirements = quoted?.config?.x402_requirements;
    add("create:quoted-on-rail", quoted?.config?.network === rail, quoted?.config?.network);
    add("create:requirements", !!requirements && requirements.network === rail && requirements.amount === quoted?.config?.amount_atomic, requirements);
    if (!requirements || created.status !== 201) throw new Error("No signable quote; nothing was paid.");
    report.checkout_id = checkout.id;
    report.amount_atomic = quoted.config.amount_atomic;

    // 4. Sign once. The credential is the same bytes for every Complete below.
    const completeUrl = `${origin}/ucp/v1/checkout-sessions/${checkout.id}/complete`;
    const payload = await sign(requirements, { url: completeUrl, description: `UCP checkout ${checkout.id}`, mimeType: "application/json" });
    const credential = { type: "x402", ...payload };
    report.credential_sha256 = sha256(credential);
    report.payer = payload?.payload?.authorization?.from ?? null;
    const completion = {
      payment: { instruments: [{ id: "pi_1", handler_id: quoted.id, type: "x402", selected: true, credential }] },
    };
    const completeBody = JSON.stringify(completion);

    // 5. The lost response: sent, answered, never read.
    if (loseResponse) {
      const lost = await fetcher(new URL(completeUrl), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: completeBody,
      });
      report.lost_response_status = lost.status;
      await lost.body?.cancel?.();
      add("complete:lost-response-sent", lost.status === 200 || lost.status === 402 || lost.status === 409 || lost.status === 503, lost.status);
    }

    // 6. The identical Complete: the order, from a platform that never saw the first answer.
    const completed = await post(`/ucp/v1/checkout-sessions/${checkout.id}/complete`, completion);
    const done = record("checkout_complete", "POST /ucp/v1/checkout-sessions/{id}/complete", completed.status, completed.body);
    add("complete:200", completed.status === 200, { status: completed.status, messages: done?.messages });
    add("complete:completed", done?.status === "completed", done?.status);
    add("complete:order", typeof done?.order?.id === "string" && typeof done?.order?.permalink_url === "string", done?.order);
    if (completed.status !== 200 || done?.status !== "completed") throw new Error("Complete did not complete; read the recorded response before paying again.");
    report.order_id = done.order.id;

    // 7. Get Checkout agrees.
    const read = await request(`/ucp/v1/checkout-sessions/${checkout.id}`);
    const again = record("checkout_get", "GET /ucp/v1/checkout-sessions/{id}", read.status, read.body);
    add("get-checkout:completed", again?.status === "completed" && again?.order?.id === done.order.id, again?.order);

    // 8. Get Order: the durable order, with its settlement.
    const orderPath = new URL(done.order.permalink_url).pathname;
    add("order:permalink-on-origin", new URL(done.order.permalink_url).origin === origin, done.order.permalink_url);
    const fetched = await request(orderPath);
    const order = record("order_get", "GET /ucp/v1/orders/{id}", fetched.status, fetched.body);
    add("order:200", fetched.status === 200, fetched.status);
    add("order:same-id", order?.id === done.order.id && order?.checkout_id === checkout.id, { id: order?.id, checkout_id: order?.checkout_id });
    const settlement = order?.["store.scvd"]?.settlement;
    add("order:settlement", typeof settlement?.transaction === "string" && settlement?.network === rail, settlement);
    add("order:fulfilled", order?.line_items?.[0]?.status === "fulfilled" || order?.line_items?.[0]?.status === "processing", order?.line_items?.[0]?.status);
    report.transaction = settlement?.transaction ?? null;

    // 9. Replay after everything was read: same order, same settlement, nothing new.
    const replayed = await post(`/ucp/v1/checkout-sessions/${checkout.id}/complete`, completion);
    const replay = record("checkout_complete_replay", "POST /ucp/v1/checkout-sessions/{id}/complete", replayed.status, replayed.body);
    add("replay:200", replayed.status === 200, { status: replayed.status, messages: replay?.messages });
    add("replay:same-order", replay?.status === "completed" && replay?.order?.id === done.order.id, replay?.order);
    const refetched = await request(orderPath);
    const orderAfter = record("order_get_after_replay", "GET /ucp/v1/orders/{id}", refetched.status, refetched.body);
    add("replay:same-settlement", orderAfter?.["store.scvd"]?.settlement?.transaction === settlement?.transaction, orderAfter?.["store.scvd"]?.settlement);
    add("replay:same-document", sha256(orderAfter) === sha256(order), { before: sha256(order), after: sha256(orderAfter) });
  } catch (error) {
    report.stopped = error instanceof Error ? error.message : String(error);
  }

  report.finished_at = now().toISOString();
  report.checks = checks;
  report.pass = checks.length > 0 && checks.every((c) => c.status === "pass") && !report.stopped;
  report.charged_once = {
    store_side: report.pass,
    on_chain: "not observed by this script: read the recorded transaction on the rail's explorer or through a settlement attestation",
  };
  return { pass: report.pass, checks, responses, report };
}

/** Write a run to disk in the layout the conformance gate reads. */
export function writeRun(outDir, { responses, report }) {
  mkdirSync(join(outDir, "responses"), { recursive: true });
  for (const [name, entry] of Object.entries(responses)) {
    writeFileSync(join(outDir, "responses", `${name}.json`), JSON.stringify(entry, null, 2) + "\n");
  }
  writeFileSync(join(outDir, "REPORT.json"), JSON.stringify(report, null, 2) + "\n");
}

function parseArgs(argv) {
  const args = { base: "https://scvd.store", item: "hello", rail: "eip155:8453", inputs: {}, loseResponse: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--base") args.base = next();
    else if (arg === "--item") args.item = next();
    else if (arg === "--rail") args.rail = next();
    else if (arg === "--out") args.out = next();
    else if (arg === "--keep-response") args.loseResponse = false;
    else if (arg === "--input") {
      const [name, ...rest] = String(next()).split("=");
      args.inputs[name] = rest.join("=");
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.out) args.out = `research/ucp-launch-${new Date().toISOString().slice(0, 10)}`;
  return args;
}

/** An EVM signer over viem and @x402/evm: the same client a buyer would run. */
async function evmSigner(privateKey, rail) {
  const { privateKeyToAccount } = await import("viem/accounts");
  const { x402Client } = await import("@x402/core/client");
  const { ExactEvmScheme } = await import("@x402/evm");
  const account = privateKeyToAccount(privateKey);
  const client = x402Client.fromConfig({ schemes: [], spendControls: false }).register(rail, new ExactEvmScheme(account));
  return {
    address: account.address,
    sign: (requirements, resource) => client.createPaymentPayload({ x402Version: 2, resource, accepts: [requirements] }),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.rail.startsWith("eip155:")) {
    console.error(`This driver signs EVM rails only for now; ${args.rail} needs its own signer. Prove Base first.`);
    process.exit(2);
  }
  const key = process.env.UCP_BUYER_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error("Set UCP_BUYER_KEY to the buyer's EVM private key (0x + 64 hex). It is never written to disk.");
    process.exit(2);
  }
  const signer = await evmSigner(key, args.rail);
  console.log(`Qualifying ${args.item} on ${args.rail} at ${args.base} as ${signer.address}; recording to ${args.out}`);
  const run = await qualifyUcpCheckout({ ...args, sign: signer.sign });
  writeRun(args.out, run);
  for (const check of run.checks) console.log(`  ${check.status === "pass" ? "ok  " : "FAIL"} ${check.id}${check.status === "fail" && check.detail !== undefined ? `  ${JSON.stringify(check.detail).slice(0, 300)}` : ""}`);
  if (run.report.stopped) console.error(`\nStopped: ${run.report.stopped}`);
  console.log(`\n${run.pass ? "PASS" : "FAIL"} — order ${run.report.order_id ?? "(none)"}, transaction ${run.report.transaction ?? "(none)"}`);
  console.log(`Recorded ${Object.keys(run.responses).length} responses; validate them with: npm run ucp:conformance`);
  process.exit(run.pass ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
