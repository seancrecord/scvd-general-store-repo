import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qualifyUcpCheckout, RECORDED, signerFor } from "./ucp-live.mjs";

/** The rail the profile advertises for Solana, spelled once. */
const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/**
 * THE QUALIFICATION DRIVER AGAINST A FAKE STORE, so the instrument is
 * tested before it is pointed at real money. The fake implements the
 * loop the way the real store does — one settle per checkout, the
 * identical Complete recognised, a different one refused — and the
 * defective variants below are the ways a store could fail the bar.
 */

const BASE = "https://scvd.store";
const ORDER = "ord_fixture123456";
const REQUIREMENTS = {
  scheme: "exact",
  network: "eip155:8453",
  asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  amount: "1000",
  payTo: "0x1111111111111111111111111111111111111111",
  maxTimeoutSeconds: 300,
  extra: { name: "USD Coin", version: "2" },
};

function fakeStore(defects = {}) {
  let settles = 0;
  let completedWith = null;
  let transaction = null;
  const order = () => ({
    ucp: { version: "2026-08-25" },
    id: ORDER,
    checkout_id: "chk_fixture123456",
    permalink_url: `${BASE}/ucp/v1/orders/${ORDER}`,
    currency: "USD",
    line_items: [{ id: "li_1", item: { id: "gid://scvd.store/Variant/hello", title: "Hello", price: 1 }, quantity: { original: 1, total: 1, fulfilled: 1 }, totals: [], status: "fulfilled" }],
    totals: [],
    fulfillment: { events: [] },
    "store.scvd": { settlement: { network: "eip155:8453", transaction } },
  });
  const checkout = (status, extra = {}) => ({
    ucp: { version: "2026-08-25", payment_handlers: { "store.scvd.payment.usdc": [{ id: "scvd-usdc-base", config: { network: "eip155:8453", amount_atomic: "1000", x402_requirements: REQUIREMENTS } }] } },
    id: "chk_fixture123456",
    status,
    ...(status === "completed" ? { order: { id: ORDER, permalink_url: `${BASE}/ucp/v1/orders/${ORDER}` } } : {}),
    ...extra,
  });
  const fetcher = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const method = init.method ?? "GET";
    if (path === "/.well-known/ucp") {
      return Response.json({
        ucp: {
          capabilities: defects.noCapability ? {} : { "dev.ucp.shopping.checkout": [{}], "dev.ucp.shopping.order": [{}] },
          payment_handlers: { "store.scvd.payment.usdc": [{ config: { network: "eip155:8453" } }] },
        },
        "store.scvd": { status: { checkout: "live", items: ["hello"] } },
      });
    }
    if (path === "/ucp/v1/catalog/lookup") return Response.json({ products: [{ variants: [{ id: "gid://scvd.store/Variant/hello" }] }] });
    if (path === "/ucp/v1/checkout-sessions" && method === "POST") return Response.json(checkout("ready_for_complete"), { status: 201 });
    if (path === "/ucp/v1/checkout-sessions/chk_fixture123456/complete") {
      const credential = JSON.parse(init.body).payment.instruments[0].credential;
      const fingerprint = JSON.stringify(credential);
      if (completedWith === null || defects.settlesEveryTime) {
        settles += 1;
        completedWith = fingerprint;
        transaction = defects.settlesEveryTime ? `0x${settles.toString(16).padStart(64, "0")}` : `0x${"ab".repeat(32)}`;
        return Response.json(checkout("completed"));
      }
      if (completedWith === fingerprint) return Response.json(checkout("completed"));
      return Response.json(checkout("completed", { messages: [{ type: "error", code: "checkout_not_payable" }] }), { status: 409 });
    }
    if (path === "/ucp/v1/checkout-sessions/chk_fixture123456") return Response.json(checkout(completedWith ? "completed" : "ready_for_complete"));
    if (path === `/ucp/v1/orders/${ORDER}`) return Response.json(order());
    return Response.json({ messages: [{ code: "not_found" }] }, { status: 404 });
  };
  return { fetcher, settled: () => settles };
}

const sign = async (requirements, resource) => ({
  x402Version: 2,
  resource,
  accepted: requirements,
  payload: { signature: "0xsig", authorization: { from: "0x2222222222222222222222222222222222222222", nonce: "0x01" } },
});

test("a store that settles once and recognises the identical Complete passes the bar, and every recorded document names its schema", async () => {
  const store = fakeStore();
  const run = await qualifyUcpCheckout({ base: BASE, item: "hello", rail: "eip155:8453", sign, fetcher: store.fetcher, now: () => new Date("2026-09-18T12:00:00Z") });
  assert.equal(run.pass, true, JSON.stringify(run.checks.filter((c) => c.status === "fail")));
  assert.equal(store.settled(), 1);
  assert.equal(run.report.order_id, ORDER);
  assert.equal(run.report.transaction, `0x${"ab".repeat(32)}`);
  assert.deepEqual(Object.keys(run.responses), RECORDED.map((row) => row[0]));
  for (const [name, entry] of Object.entries(run.responses)) assert.ok(entry.schema?.startsWith("https://ucp.dev/schemas/"), name);
  // The credential is never in the record; its fingerprint is.
  assert.match(run.report.credential_sha256, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(run).includes("0xsig"), false, "the signed credential must never be in the record; only its fingerprint is");
});

test("a store that charges again on the identical Complete fails on the settlement, not silently", async () => {
  const store = fakeStore({ settlesEveryTime: true });
  const run = await qualifyUcpCheckout({ base: BASE, item: "hello", rail: "eip155:8453", sign, fetcher: store.fetcher });
  assert.equal(run.pass, false);
  assert.ok(run.checks.some((c) => c.id === "replay:same-settlement" && c.status === "fail"));
  assert.ok(store.settled() > 1);
});

test("a profile that advertises no checkout stops the run before anything is signed", async () => {
  let signed = 0;
  const store = fakeStore({ noCapability: true });
  const run = await qualifyUcpCheckout({ base: BASE, item: "hello", rail: "eip155:8453", sign: async (...args) => { signed += 1; return sign(...args); }, fetcher: store.fetcher });
  assert.equal(run.pass, false);
  assert.equal(signed, 0);
  assert.equal(store.settled(), 0);
  assert.match(run.report.stopped, /nothing was paid/);
});

/**
 * THE SIGNER, PER RAIL, FROM THROWAWAY KEYS. No network, no wallet and
 * no money: what is under test is that the driver builds the right
 * buyer for the rail it was asked for, and refuses in words a reader
 * can act on when it cannot. Solana joined the driver on 2026-09-19,
 * once the launch advertised every rail.
 */
test("builds an EVM buyer for an eip155 rail, deterministically", async () => {
  const key = `0x${"01".repeat(32)}`;
  const a = await signerFor("eip155:8453", { secret: key });
  const b = await signerFor("eip155:137", { secret: key });
  assert.match(a.address, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(a.address, b.address, "one key is one payer, whichever EVM rail it pays on");
  assert.equal(typeof a.sign, "function");
});

test("builds a Solana buyer from the wallet app's own export shape, and it is the keypair it was handed", async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  // What Phantom, Solflare and solana-keygen all export: 32 seed bytes
  // followed by the 32 public bytes.
  const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const sixtyFour = Buffer.concat([seed, pub]);

  const dir = mkdtempSync(join(tmpdir(), "ucp-live-signer-"));
  const file = join(dir, "buyer.json");
  writeFileSync(file, JSON.stringify([...sixtyFour]));
  try {
    const fromFile = await signerFor(SOLANA, { secretFile: file });
    const { getBase58Encoder, getBase58Decoder } = await import("@solana/kit");
    assert.equal(fromFile.address, getBase58Decoder().decode(pub), "the address is the public half it was given");
    assert.equal(typeof fromFile.sign, "function");

    // And the same keypair as the base58 secret a wallet app puts on the clipboard.
    const fromSecret = await signerFor(SOLANA, { secret: getBase58Decoder().decode(sixtyFour) });
    assert.equal(fromSecret.address, fromFile.address);
    assert.ok(getBase58Encoder(), "base58 round trip available");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses a rail it cannot sign, and a key of the wrong shape, without echoing the key", async () => {
  const seedPhrase = "test test test test test test test test test test test junk";
  await assert.rejects(
    () => signerFor("eip155:8453", { secret: seedPhrase }),
    (error) => {
      assert.match(error.message, /64 hex|seed phrase/i);
      assert.ok(!error.message.includes(seedPhrase), "the refusal names the shape, never the secret");
      return true;
    },
  );
  await assert.rejects(() => signerFor("eip155:8453", {}), /UCP_BUYER_KEY/);
  await assert.rejects(() => signerFor(SOLANA, {}), /base58|UCP_BUYER_KEY_FILE/);
  await assert.rejects(() => signerFor("cosmos:cosmoshub-4", { secret: `0x${"01".repeat(32)}` }), /No signer for cosmos/);
});
