import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { certificateSignatureForm } from "@/lib/signing";
import { signTradeRequest } from "@/lib/trade-auth";
import {
  recordTradeDelivery,
  recordTradePayout,
  tradeAccountSummary,
  tradeSettlementFor,
} from "@/services/trade-counter";
import { MENU_ITEMS, getMenuItem } from "@/store";
import {
  TRADE_DIALECTS,
  TRADE_ERRORS,
  TRADE_MIN_RETAIL_USD,
  TRADE_PARTNERS,
  TRADE_SHELF,
  TRADE_UPLIFT_BPS,
  getTradePartner,
  tradeNetUsd,
  tradePriceUsd,
  tradeShelf,
} from "@/store/trade-counter";
import { isRecord, type Certificate, type Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const HAL = getTradePartner("hal")!;
// The values vitest.config.ts binds; neither is a secret.
const SECRET = "test-trade-secret-hal";
const PREVIOUS = "test-trade-secret-hal-previous";
const PROVIDER_KEY = "test-trade-provider-key-hal";

/**
 * THE TRADE COUNTER, END TO END: a marketplace's signed instruction in,
 * the front door's goods out, and a certificate that tells the truth
 * about a payment this store never saw. The register is the product
 * (rule 9's amendment, rule 41, rules 45 and 52), so the assertions
 * that matter most are the ABSENCES on the certificate.
 */

async function clearPrefix(namespace: KVNamespace, prefix: string): Promise<void> {
  const rows = await namespace.list({ prefix });
  for (const key of rows.keys) await namespace.delete(key.name);
}

beforeEach(async () => {
  await clearPrefix(testEnv.ORDERS, KV_KEYS.tradeAllPrefix);
  await clearPrefix(testEnv.ORDERS, "trade_payout:");
  await clearPrefix(testEnv.COUNTERS, "trade_day:");
  await clearPrefix(testEnv.COUNTERS, "trade_order:");
});

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error("Expected a JSON object body");
  return body;
}

interface OrderOptions {
  secret?: string;
  provider_key?: string;
  now_ms?: number;
  nonce?: string;
  headers?: Record<string, string>;
  account?: string;
}

async function order(
  itemId: string,
  body: unknown,
  options: OrderOptions = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, string> }> {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const signInput: Parameters<typeof signTradeRequest>[0] = {
    dialect: TRADE_DIALECTS.hal,
    secret: options.secret ?? SECRET,
    provider_key: options.provider_key ?? PROVIDER_KEY,
    body: raw,
  };
  if (options.now_ms !== undefined) signInput.now_ms = options.now_ms;
  if (options.nonce !== undefined) signInput.nonce = options.nonce;
  const headers = { ...(await signTradeRequest(signInput)), ...(options.headers ?? {}) };
  const response = await SELF.fetch(
    `${BASE}/api/trade/${options.account ?? HAL.id}/${itemId}`,
    { method: "POST", headers, body: raw },
  );
  return { status: response.status, body: await json(response), headers };
}

function certificateOf(body: Record<string, unknown>): Certificate {
  const cert = body["certificate"];
  if (!isRecord(cert)) throw new Error("no certificate on the delivery");
  return cert as unknown as Certificate;
}

describe("a signed order delivers the front door's goods", () => {
  it("mints a certificate that says trade account and names NO chain", async () => {
    const { status, body } = await order("certificate_of_patronage", {
      agent_name: "Hal's customer",
      purpose: "to see what a trade receipt looks like",
    });
    expect(status).toBe(200);
    expect(body["item_id"]).toBe("certificate_of_patronage");
    expect(typeof body["deliverable"]).toBe("string");
    // The first account is in test mode until its terms are settled.
    expect(body["settled_via"]).toBe("trade_account_test");
    expect(body["paid_usdc"]).toBeUndefined();
    expect(body["signed_with"]).toBe("current");

    const trade = body["trade"];
    expect(isRecord(trade)).toBe(true);
    if (!isRecord(trade)) return;
    expect(trade["account"]).toBe("hal");
    const item = getMenuItem("certificate_of_patronage")!;
    expect(trade["trade_price_usd"]).toBe(tradePriceUsd(item, HAL.partner_share_bps));
    expect(trade["net_usd"]).toBe(
      tradeNetUsd(tradePriceUsd(item, HAL.partner_share_bps), HAL.partner_share_bps),
    );
    expect(String(trade["instruction_digest"])).toMatch(/^[0-9a-f]{64}$/);

    const cert = certificateOf(body);
    // THE ABSENCES ARE THE CLAIM.
    expect(cert.paid_usdc).toBeUndefined();
    expect(cert.asset).toBeUndefined();
    expect(cert.network).toBeUndefined();
    expect(cert.payer).toBeUndefined();
    expect(cert.settlement_tx).toBeUndefined();
    // And the four presences.
    expect(cert.settled_via).toBe("trade_account_test");
    expect(cert.trade_partner).toBe("hal");
    expect(cert.trade_price_usd).toBe(trade["trade_price_usd"]);
    expect(cert.trade_instruction).toBe(trade["instruction_digest"]);
    expect(cert.name).toBe("Hal's customer");
    expect(cert.purpose).toBe("to see what a trade receipt looks like");
    // The human's receipt line names the account, not a USDC figure.
    expect(String(body["show_your_human"])).toContain("trade account");
    expect(String(body["show_your_human"])).not.toContain("USDC");
    // No store credit: there is no paying wallet to credit.
    expect(body["store_credit"]).toBeUndefined();
  });

  it("signs the four trade fields: tamper one and the signature is invalid, not legacy", async () => {
    const { body } = await order("certificate_of_patronage", {});
    const cert = certificateOf(body);
    const signature = String(body["signature"]);
    const publicKey = String(body["public_key"]);
    expect(await certificateSignatureForm(cert, signature, publicKey)).toBe("current");
    const tampered: Certificate = { ...cert, trade_price_usd: 0.01 };
    expect(await certificateSignatureForm(tampered, signature, publicKey)).toBe("invalid");
    const relabelled: Certificate = { ...cert, trade_partner: "somebody_else" };
    expect(await certificateSignatureForm(relabelled, signature, publicKey)).toBe("invalid");
  });

  it("verifies free at /api/verify like every other certificate, and the receipt page says how it was paid for", async () => {
    const { body } = await order("certificate_of_patronage", {});
    const cert = certificateOf(body);
    const verify = await json(await SELF.fetch(`${BASE}/api/verify/${cert.cert_id}`));
    expect(verify["valid"]).toBe(true);
    const page = await (
      await SELF.fetch(`${BASE}/api/verify/${cert.cert_id}`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(page).toContain("Trade account");
    expect(page).toContain("test mode");
    expect(page).not.toContain("basescan.org");
  });

  it("books the delivery: one ledger row, counted on the public ledger and unbilled while in test", async () => {
    await order("certificate_of_patronage", { order_ref: "hal-order-77" });
    const rows = await testEnv.ORDERS.list({ prefix: KV_KEYS.tradeRowPrefix("hal") });
    expect(rows.keys.length).toBe(1);
    const row = JSON.parse((await testEnv.ORDERS.get(rows.keys[0]!.name)) ?? "{}") as Record<string, unknown>;
    expect(row["mode"]).toBe("test");
    expect(row["order_ref"]).toBe("hal-order-77");
    expect(row["item"]).toBe("certificate_of_patronage");

    const ledger = await json(await SELF.fetch(`${BASE}/api/trade/ledger`));
    const accounts = ledger["accounts"] as Record<string, unknown>[];
    const hal = accounts.find((entry) => entry["account"] === "hal")!;
    expect(hal["delivered_test"]).toBe(1);
    expect(hal["delivered_live"]).toBe(0);
    expect(hal["billed_usd"]).toBe(0);
    expect(hal["outstanding_usd"]).toBe(0);
    expect(hal["truncated"]).toBe(false);
  });

  it("carries an item's own input through: a context anchor with a summary", async () => {
    const { status, body } = await order("context_anchor", {
      inputs: { summary: "The agent was halfway through a migration." },
    });
    expect(status).toBe(200);
    expect(typeof body["anchor_id"]).toBe("string");
    expect(certificateOf(body).item).toBe("context_anchor");
  });
});

describe("the partner's own retry is honoured, once", () => {
  it("returns the original delivery for the same order_ref with a fresh nonce, and books nothing twice", async () => {
    const first = await order("context_anchor", {
      summary: "state",
      order_ref: "order-abc",
    });
    expect(first.status).toBe(200);
    const again = await order("context_anchor", {
      summary: "state",
      order_ref: "order-abc",
    });
    expect(again.status).toBe(200);
    expect(again.body["replayed_order_ref"]).toBe(true);
    expect(certificateOf(again.body).cert_id).toBe(certificateOf(first.body).cert_id);
    const rows = await testEnv.ORDERS.list({ prefix: KV_KEYS.tradeRowPrefix("hal") });
    expect(rows.keys.length).toBe(1);
  });
});

describe("every refusal, by name, delivered:false and billed:false", () => {
  async function expectRefusal(
    result: { status: number; body: Record<string, unknown> },
    status: number,
    code: string,
  ): Promise<void> {
    expect(result.status).toBe(status);
    expect(result.body["delivered"]).toBe(false);
    expect(result.body["billed"]).toBe(false);
    expect(result.body["code"]).toBe(code);
    expect(TRADE_ERRORS.some((row) => row.code === code && row.status === status)).toBe(true);
  }

  it("replays the same signed instruction: 409, nothing delivered", async () => {
    const nonce = "00112233445566778899aabbccddeeff";
    const first = await order("certificate_of_patronage", {}, { nonce });
    expect(first.status).toBe(200);
    const replay = await order("certificate_of_patronage", {}, { nonce });
    await expectRefusal(replay, 409, "replayed");
    const rows = await testEnv.ORDERS.list({ prefix: KV_KEYS.tradeRowPrefix("hal") });
    expect(rows.keys.length).toBe(1);
  });

  it("stale timestamp, wrong provider key, wrong secret", async () => {
    await expectRefusal(
      await order("certificate_of_patronage", {}, { now_ms: Date.now() - 6 * 60_000 }),
      401,
      "stale_timestamp",
    );
    await expectRefusal(
      await order("certificate_of_patronage", {}, { provider_key: "not-ours" }),
      401,
      "bad_provider_key",
    );
    await expectRefusal(
      await order("certificate_of_patronage", {}, { secret: "not-ours" }),
      401,
      "bad_signature",
    );
    const rows = await testEnv.ORDERS.list({ prefix: KV_KEYS.tradeRowPrefix("hal") });
    expect(rows.keys.length).toBe(0);
  });

  it("the previous secret still verifies during a rotation, and the response says which signed", async () => {
    const result = await order("certificate_of_patronage", {}, { secret: PREVIOUS });
    expect(result.status).toBe(200);
    expect(result.body["signed_with"]).toBe("previous");
  });

  it("an unknown account, an item not on the account, a malformed order", async () => {
    await expectRefusal(
      await order("certificate_of_patronage", {}, { account: "nobody" }),
      404,
      "unknown_account",
    );
    await expectRefusal(await order("hello", {}), 404, "not_at_the_counter");
    await expectRefusal(await order("context_anchor", {}), 400, "bad_request");
    await expectRefusal(await order("context_anchor", "not json"), 400, "bad_request");
    await expectRefusal(
      await order("service_audit", { url: "https://scvd.store/api/buy/hello" }),
      400,
      "target_refused",
    );
    await expectRefusal(
      await order("service_audit", { url: "https://127.0.0.1/door" }),
      400,
      "target_refused",
    );
  });

  it("a body over the limit is refused before it is read", async () => {
    const result = await order(
      "certificate_of_patronage",
      {},
      { headers: { "content-length": String(2 * 1024 * 1024) } },
    );
    await expectRefusal(result, 413, "body_too_large");
  });

  it("the daily cap", async () => {
    const day = new Date().toISOString().slice(0, 10);
    await testEnv.COUNTERS.put(KV_KEYS.tradeDay("hal", day), String(HAL.daily_cap));
    await expectRefusal(await order("certificate_of_patronage", {}), 429, "cap_reached");
  });

  it("never issues a 402: the payment gate does not see this door", async () => {
    const response = await SELF.fetch(`${BASE}/api/trade/hal/certificate_of_patronage`, {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
  });
});

describe("the nonce store is one writer, and answers the same twice", () => {
  it("claims once, refuses the second, and forgets after the ttl", async () => {
    const namespace = testEnv.TRADE_NONCES;
    expect(namespace, "the DO binding is provisioned in test").toBeDefined();
    if (!namespace) return;
    const stub = namespace.get(namespace.idFromName("spec-account"));
    expect(await stub.claim("nonce-1", 600)).toBe("fresh");
    expect(await stub.claim("nonce-1", 600)).toBe("seen");
    expect(await stub.claim("nonce-2", 600)).toBe("fresh");
    expect(await stub.size()).toBe(2);
  });
});

describe("the books, on a live account", () => {
  it("bills the trade price, nets the share, and the receivable falls as payouts are recorded", async () => {
    const live = { ...HAL, id: "spec_live", name: "Spec Live", mode: "live" as const };
    const item = getMenuItem("service_audit")!;
    const settlement = tradeSettlementFor(live, item, "a".repeat(64), "o-1");
    expect(settlement.mode).toBe("live");
    await recordTradeDelivery(testEnv, live, item, settlement, "cert_spec_1", {});
    await recordTradeDelivery(testEnv, live, item, { ...settlement, order_ref: "o-2" }, "cert_spec_2", {});
    let summary = await tradeAccountSummary(testEnv, live);
    expect(summary.delivered_live).toBe(2);
    expect(summary.billed_usd).toBe(Math.round(settlement.trade_price_usd * 200) / 100);
    expect(summary.net_usd).toBe(Math.round(settlement.net_usd * 200) / 100);
    expect(summary.outstanding_usd).toBe(summary.net_usd);

    await recordTradePayout(testEnv, live, settlement.net_usd, "statement-1");
    summary = await tradeAccountSummary(testEnv, live);
    expect(summary.paid_usd).toBe(settlement.net_usd);
    expect(summary.outstanding_usd).toBe(Math.round((summary.net_usd - settlement.net_usd) * 100) / 100);
    expect(summary.last_payout_at).not.toBeNull();
    await clearPrefix(testEnv.ORDERS, KV_KEYS.tradeRowPrefix("spec_live"));
    await clearPrefix(testEnv.ORDERS, KV_KEYS.tradePayoutPrefix("spec_live"));
  });

  it("the keeper's statement desk answers behind the password, and records a payout", async () => {
    const auth = { Authorization: `Basic ${btoa("keeper:test-admin-password")}` };
    const statement = await json(await SELF.fetch(`${BASE}/admin/trade.json`, { headers: auth }));
    expect(Array.isArray(statement["statements"])).toBe(true);
    const closed = await SELF.fetch(`${BASE}/admin/trade.json`);
    expect(closed.status).toBe(401);
    const recorded = await SELF.fetch(`${BASE}/admin/trade/hal/payout`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ amount_usd: 12.5, reference: "hal-statement-2026-09" }),
    });
    expect(recorded.status).toBe(200);
    const refused = await SELF.fetch(`${BASE}/admin/trade/hal/payout`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ amount_usd: -1 }),
    });
    expect(refused.status).toBe(400);
  });
});

describe("the margin is a rule, and the rule holds on every row", () => {
  it("nets at least retail plus the uplift after the partner's share, at every share the counter would open", () => {
    for (const { item } of tradeShelf()) {
      for (const share of [0, 500, 1500, 3000]) {
        const price = tradePriceUsd(item, share);
        const net = tradeNetUsd(price, share);
        const floor = Math.round(item.price_usdc * (1 + TRADE_UPLIFT_BPS / 10_000) * 100) / 100;
        expect(net, `${item.id} at ${share}bps nets ${net} against a floor of ${floor}`).toBeGreaterThanOrEqual(floor - 0.005);
        expect(price).toBeGreaterThan(item.price_usdc);
        // Cents exact, no dust.
        expect(Math.round(price * 100) / 100).toBe(price);
      }
    }
  });

  it("worked example: a $5 instrument at a 5% share lists at $6.32 and nets $6.00", () => {
    expect(tradePriceUsd({ price_usdc: 5 }, 500)).toBe(6.32);
    expect(tradeNetUsd(6.32, 500)).toBe(6);
  });

  it("the shelf is live instant items at or above the floor, and every account orders from it", () => {
    for (const entry of TRADE_SHELF) {
      const item = MENU_ITEMS.find((candidate) => candidate.id === entry.item_id);
      expect(item, `${entry.item_id} is not on the menu`).toBeDefined();
      expect(item!.fulfillment).toBe("instant");
      expect(item!.price_usdc).toBeGreaterThanOrEqual(TRADE_MIN_RETAIL_USD);
    }
    for (const partner of TRADE_PARTNERS) {
      for (const itemId of partner.items) {
        expect(TRADE_SHELF.some((entry) => entry.item_id === itemId), `${partner.id} orders ${itemId}, which is not at the counter`).toBe(true);
      }
      expect(partner.id).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe("the surfaces", () => {
  it("/health is the one line a reseller's contract asks for", async () => {
    const response = await SELF.fetch(`${BASE}/health`);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body["ok"]).toBe(true);
    expect(String(body["liveness"])).toContain("/.well-known/liveness.json");
  });

  it("/api/trade/contract derives every price from the menu and names every refusal the door can give", async () => {
    const terms = await json(await SELF.fetch(`${BASE}/api/trade/contract`));
    const shelf = terms["shelf"] as Record<string, unknown>[];
    expect(shelf.length).toBe(tradeShelf().length);
    for (const row of shelf) {
      const item = getMenuItem(String(row["item_id"]))!;
      expect(row["retail_usd"]).toBe(item.price_usdc);
      expect(row["trade_price_usd_at_example_share"]).toBe(tradePriceUsd(item, 500));
    }
    const codes = new Set((terms["errors"] as Record<string, unknown>[]).map((row) => String(row["code"])));
    for (const code of [
      "unknown_account", "counter_closed", "account_not_provisioned", "body_too_large", "missing_headers", "bad_provider_key",
      "bad_timestamp", "stale_timestamp", "bad_nonce", "bad_signature", "replayed",
      "not_at_the_counter", "bad_request", "target_refused", "cap_reached",
    ]) {
      expect(codes.has(code), `${code} is not a named refusal`).toBe(true);
    }
    const accounts = terms["accounts"] as Record<string, unknown>[];
    expect(accounts.map((row) => row["account"])).toContain("hal");
    // Pass seven: every account carries its provisioning state and a fixture.
    for (const row of accounts) {
      expect(row["provisioned"]).toBe(true);
      expect(row["door_status"]).toBe("open");
      const fixture = row["fixture"] as Record<string, unknown>;
      expect(String(fixture["door"])).toBe(`${BASE}/api/trade/${String(row["account"])}/${String(fixture["item_id"])}`);
      expect(fixture["expected_status"]).toBe(200);
      expect(Array.isArray(fixture["invariants"])).toBe(true);
    }
    expect(Array.isArray(terms["response_invariants"])).toBe(true);
    expect(String((terms["pricing"] as Record<string, unknown>)["settlement_currency"])).toContain("US dollars");
  });

  it("the account's fixture delivers exactly what it promises, and every printed invariant holds on the body", async () => {
    const terms = await json(await SELF.fetch(`${BASE}/api/trade/contract`));
    const row = (terms["accounts"] as Record<string, unknown>[]).find((entry) => entry["account"] === "hal")!;
    const fixture = row["fixture"] as Record<string, unknown>;
    const { status, body } = await order(String(fixture["item_id"]), String(fixture["body"]));
    expect(status).toBe(fixture["expected_status"]);
    const trade = body["trade"] as Record<string, unknown>;
    const expected = fixture["expected"] as Record<string, unknown>;
    expect(body["settled_via"]).toBe(expected["settled_via"]);
    expect(trade["account"]).toBe(expected["trade.account"]);
    expect(trade["trade_price_usd"]).toBe(expected["trade.trade_price_usd"]);
    expect(trade["net_usd"]).toBe(expected["trade.net_usd"]);
    expect(trade["order_ref"]).toBe(expected["trade.order_ref"]);
    // The invariant rows, one by one, against the same body.
    const cert = certificateOf(body);
    expect(body["item_id"]).toBe(fixture["item_id"]);
    expect(String(body["deliverable"]).length).toBeGreaterThan(0);
    expect(body["paid_usdc"]).toBeUndefined();
    expect(["current", "previous"]).toContain(body["signed_with"]);
    expect(String(trade["instruction_digest"])).toMatch(/^[0-9a-f]{64}$/);
    expect(cert.settled_via).toBe(body["settled_via"]);
    expect(cert.trade_partner).toBe("hal");
    expect(cert.trade_price_usd).toBe(trade["trade_price_usd"]);
    expect(cert.trade_instruction).toBe(trade["instruction_digest"]);
    for (const absent of ["paid_usdc", "asset", "network", "payer", "settlement_tx"]) {
      expect((cert as unknown as Record<string, unknown>)[absent], absent).toBeUndefined();
    }
    for (const present of ["signature", "public_key", "verify_url"]) {
      expect(body[present], present).toBeDefined();
    }
    // The printed paths are the paths this test walked: a new row without an assertion here fails.
    const paths = (fixture["invariants"] as Record<string, unknown>[]).map((entry) => String(entry["path"]));
    expect(paths).toEqual([
      "item_id", "deliverable", "settled_via", "paid_usdc", "trade.account", "trade.trade_price_usd",
      "trade.net_usd", "trade.instruction_digest", "trade.order_ref", "signed_with",
      "certificate.settled_via", "certificate.trade_partner", "certificate.trade_price_usd",
      "certificate.trade_instruction", "certificate.paid_usdc, .asset, .network, .payer, .settlement_tx",
      "signature, public_key, verify_url",
    ]);
    // Idempotent: the fixture sent twice is one delivery.
    const again = await order(String(fixture["item_id"]), String(fixture["body"]));
    expect(again.status).toBe(200);
    expect((again.body["trade"] as Record<string, unknown>)["instruction_digest"]).toBe(trade["instruction_digest"]);
  });

  it("/trade answers a person with the page and an agent with the five answers", async () => {
    const page = await (await SELF.fetch(`${BASE}/trade`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain("<h1>The Trade Counter</h1>");
    expect(page).toContain("/api/trade/contract");
    expect(page).toContain("sha256=");
    const body = await json(await SELF.fetch(`${BASE}/trade`));
    for (const key of ["what_this_is", "what_you_can_use_it_for", "price", "how_to_call", "errors", "security", "honest_limits"]) {
      expect(body[key], key).toBeDefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Round two: sandbox, check desk, statement, catalog, ceiling, books  */
/* ------------------------------------------------------------------ */

import {
  TRADE_SANDBOX_ID,
  TRADE_SANDBOX_PROVIDER_KEY,
  TRADE_SANDBOX_SECRET,
  TRADE_STATEMENT_DAYS,
} from "@/store/trade-counter";
import {
  reseatOutstanding,
  tradeOutstandingCents,
  tradeReceivableWatch,
} from "@/services/trade-counter";
import { sweepBooksInvariants } from "@/services/books-invariants";

async function sandboxSigned(
  itemId: string,
  body: unknown,
  path: "order" | "check" = "order",
  options: { now_ms?: number; secret?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const signInput: Parameters<typeof signTradeRequest>[0] = {
    dialect: TRADE_DIALECTS.canonical,
    secret: options.secret ?? TRADE_SANDBOX_SECRET,
    provider_key: TRADE_SANDBOX_PROVIDER_KEY,
    body: raw,
  };
  if (options.now_ms !== undefined) signInput.now_ms = options.now_ms;
  const headers = await signTradeRequest(signInput);
  const url =
    path === "order"
      ? `${BASE}/api/trade/${TRADE_SANDBOX_ID}/${itemId}`
      : `${BASE}/api/trade/${TRADE_SANDBOX_ID}/check`;
  const response = await SELF.fetch(url, { method: "POST", headers, body: raw });
  return { status: response.status, body: await json(response) };
}

describe("the sandbox: integration before the conversation", () => {
  it("delivers real goods on the published secret, marked test, booked nowhere", async () => {
    const { status, body } = await sandboxSigned("certificate_of_patronage", {});
    expect(status).toBe(200);
    expect(body["settled_via"]).toBe("trade_account_test");
    expect(certificateOf(body).trade_partner).toBe(TRADE_SANDBOX_ID);
    const ledger = await json(await SELF.fetch(`${BASE}/api/trade/ledger`));
    const row = (ledger["accounts"] as Record<string, unknown>[]).find((entry) => entry["account"] === TRADE_SANDBOX_ID)!;
    expect(row["billed_usd"]).toBe(0);
    expect(row["delivered_test"]).toBe(1);
  });

  it("is test-mode by construction: a published secret on a live account cannot exist", () => {
    for (const partner of TRADE_PARTNERS) {
      if (partner.sandbox) {
        expect(partner.mode, `${partner.id} publishes a secret and is not test`).toBe("test");
        expect(partner.credit_ceiling_usd).toBe(0);
      }
    }
  });

  it("prints its secret on the contract and the room, so nobody has to ask", async () => {
    const contract = await json(await SELF.fetch(`${BASE}/api/trade/contract`));
    const row = (contract["accounts"] as Record<string, unknown>[]).find((entry) => entry["account"] === TRADE_SANDBOX_ID)!;
    expect(row["published_secret"]).toBe(TRADE_SANDBOX_SECRET);
    const page = await (await SELF.fetch(`${BASE}/trade`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain(TRADE_SANDBOX_SECRET);
    expect(page).toContain("/api/trade/sandbox/check");
  });
});

describe("the check desk: every check reported, nothing delivered", () => {
  it("passes a good request, names the first failure on a bad one, and consumes no nonce", async () => {
    const good = await sandboxSigned("x", { summary: "s" }, "check");
    expect(good.status).toBe(200);
    expect(good.body["would_pass"]).toBe(true);
    expect(good.body["first_failure"]).toBeNull();
    const checks = good.body["checks"] as Record<string, unknown>;
    expect(checks["replay"]).toBe("fresh");
    expect((checks["signature"] as Record<string, unknown>)["verified_with"]).toBe("current");
    expect(String(good.body["expected_signature"])).toMatch(/^sha256=[0-9a-f]{64}$/);
    // Ask again with the same nonce: still fresh — the desk consumed nothing.
    const again = await sandboxSigned("x", { summary: "s" }, "check");
    expect((again.body["checks"] as Record<string, unknown>)["replay"]).toBe("fresh");

    const bad = await sandboxSigned("x", { summary: "s" }, "check", { secret: "wrong" });
    expect(bad.body["would_pass"]).toBe(false);
    expect(bad.body["first_failure"]).toBe("bad_signature");
    expect(((bad.body["checks"] as Record<string, unknown>)["signature"] as Record<string, unknown>)["verified_with"]).toBe("none");

    const stale = await sandboxSigned("x", {}, "check", { now_ms: Date.now() - 20 * 60_000 });
    expect(stale.body["first_failure"]).toBe("stale_timestamp");
    const ts = (stale.body["checks"] as Record<string, unknown>)["timestamp"] as Record<string, unknown>;
    expect(ts["within_window"]).toBe(false);
    expect(Number(ts["skew_seconds"])).toBeGreaterThan(1000);
    const rows = await testEnv.ORDERS.list({ prefix: KV_KEYS.tradeRowPrefix(TRADE_SANDBOX_ID) });
    expect(rows.keys.length).toBe(0);
  });

  it("does not reveal the expected signature on a real account", async () => {
    const raw = "{}";
    const headers = await signTradeRequest({ dialect: TRADE_DIALECTS.hal, secret: "guess", provider_key: PROVIDER_KEY, body: raw });
    const response = await SELF.fetch(`${BASE}/api/trade/hal/check`, { method: "POST", headers, body: raw });
    const body = await json(response);
    expect(body["expected_signature"]).toBeUndefined();
    expect(body["first_failure"]).toBe("bad_signature");
  });
});

describe("an account before its secret exists (pass seven)", () => {
  const withoutSecret = async (run: () => Promise<void>) => {
    const bag = testEnv as unknown as Record<string, unknown>;
    const saved = bag["TRADE_SECRET_HAL"];
    bag["TRADE_SECRET_HAL"] = "";
    try {
      await run();
    } finally {
      bag["TRADE_SECRET_HAL"] = saved;
    }
  };

  it("the signed doors answer 503 account_not_provisioned, never counter_closed", async () => {
    await withoutSecret(async () => {
      const refused = await order("certificate_of_patronage", { order_ref: "np-1" });
      expect(refused.status).toBe(503);
      expect(refused.body["code"]).toBe("account_not_provisioned");
      expect(refused.body["delivered"]).toBe(false);
      expect(refused.body["billed"]).toBe(false);
      const headers = await signTradeRequest({ dialect: TRADE_DIALECTS.hal, secret: "anything", provider_key: PROVIDER_KEY, body: "" });
      const statement = await SELF.fetch(`${BASE}/api/trade/hal/statement`, { headers });
      expect(statement.status).toBe(503);
      expect((await json(statement))["code"]).toBe("account_not_provisioned");
      const claim = await SELF.fetch(`${BASE}/api/trade/hal/claim?order_ref=np-1`, { headers });
      expect(claim.status).toBe(503);
      expect((await json(claim))["code"]).toBe("account_not_provisioned");
      const rows = await testEnv.ORDERS.list({ prefix: KV_KEYS.tradeRowPrefix("hal") });
      expect(rows.keys.length).toBe(0);
      // The contract says so, by account.
      const terms = await json(await SELF.fetch(`${BASE}/api/trade/contract`));
      const hal = (terms["accounts"] as Record<string, unknown>[]).find((entry) => entry["account"] === "hal")!;
      expect(hal["provisioned"]).toBe(false);
      expect(hal["door_status"]).toBe("awaiting_secret");
    });
  });

  it("the check desk still reports every check that needs no secret, and names the two it cannot run", async () => {
    await withoutSecret(async () => {
      const raw = JSON.stringify({ order_ref: "np-2" });
      const headers = await signTradeRequest({ dialect: TRADE_DIALECTS.hal, secret: "their-secret-we-do-not-hold", provider_key: "their-key", body: raw });
      const response = await SELF.fetch(`${BASE}/api/trade/hal/check`, { method: "POST", headers, body: raw });
      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body["account_provisioned"]).toBe(false);
      expect(String(body["note"])).toContain("account_not_provisioned");
      expect(body["would_pass"]).toBe(false);
      expect(body["first_failure"]).toBe("account_not_provisioned");
      const checks = body["checks"] as Record<string, unknown>;
      expect((checks["headers"] as Record<string, unknown>)["missing"]).toEqual([]);
      expect(checks["provider_key"]).toBe("unverifiable");
      expect((checks["timestamp"] as Record<string, unknown>)["within_window"]).toBe(true);
      expect((checks["nonce"] as Record<string, unknown>)["shape_ok"]).toBe(true);
      const signature = checks["signature"] as Record<string, unknown>;
      expect(signature["prefix_ok"]).toBe(true);
      expect(signature["hex_ok"]).toBe(true);
      expect(signature["verified_with"]).toBe("unverifiable");
      expect(String((body["signing_string"] as Record<string, unknown>)["sha256"])).toMatch(/^[0-9a-f]{64}$/);
      expect(body["expected_signature"]).toBeUndefined();

      // A byte-level fault is still named ahead of the missing secret.
      const stale = await signTradeRequest({ dialect: TRADE_DIALECTS.hal, secret: "x", provider_key: "k", body: raw, now_ms: Date.now() - 20 * 60_000 });
      const staleBody = await json(await SELF.fetch(`${BASE}/api/trade/hal/check`, { method: "POST", headers: stale, body: raw }));
      expect(staleBody["first_failure"]).toBe("stale_timestamp");
      const missing = await json(await SELF.fetch(`${BASE}/api/trade/hal/check`, { method: "POST", body: raw }));
      expect(missing["first_failure"]).toBe("missing_headers");
    });
  });
});

describe("the account's own statement, signed", () => {
  it("answers the account holder over the empty body, and refuses a replay", async () => {
    await order("certificate_of_patronage", { order_ref: "stmt-1" });
    const headers = await signTradeRequest({ dialect: TRADE_DIALECTS.hal, secret: SECRET, provider_key: PROVIDER_KEY, body: "" });
    const response = await SELF.fetch(`${BASE}/api/trade/hal/statement`, { headers });
    expect(response.status).toBe(200);
    const body = await json(response);
    const deliveries = body["deliveries"] as Record<string, unknown>[];
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]!["order_ref"]).toBe("stmt-1");
    expect((body["summary"] as Record<string, unknown>)["account"]).toBe("hal");
    const replay = await SELF.fetch(`${BASE}/api/trade/hal/statement`, { headers });
    expect(replay.status).toBe(409);
    const unsigned = await SELF.fetch(`${BASE}/api/trade/hal/statement`);
    expect(unsigned.status).toBe(401);
  });
});

describe("the catalog feed", () => {
  it("lists every shelf item with copy, specimen where one exists, class and price at the share", async () => {
    const feed = await json(await SELF.fetch(`${BASE}/api/trade/catalog`));
    const items = feed["items"] as Record<string, unknown>[];
    expect(items.length).toBe(tradeShelf().length);
    for (const row of items) {
      const item = getMenuItem(String(row["item_id"]))!;
      expect(row["description"]).toBe(item.description);
      expect(row["trade_price_usd"]).toBe(tradePriceUsd(item, 500));
      expect(typeof row["does_not_prove"]).toBe("string");
      expect(String(row["verify_url_template"])).toMatch(/^https:\/\/scvd\.store\/(api|case)\//);
    }
    const hal = await json(await SELF.fetch(`${BASE}/api/trade/catalog?account=hal`));
    expect(hal["account"]).toBe("hal");
    expect(hal["share_bps"]).toBe(HAL.partner_share_bps);
    expect((hal["items"] as unknown[]).length).toBe(HAL.items.length);
    expect((await SELF.fetch(`${BASE}/api/trade/catalog?account=nobody`)).status).toBe(404);
  });
});

describe("the credit ceiling and the books", () => {
  it("a live account at its ceiling is refused by name; a payout reopens it; the sweep agrees with the rows", async () => {
    const live = { ...HAL, id: "spec_ceiling", name: "Spec Ceiling", mode: "live" as const, credit_ceiling_usd: 10 };
    const item = getMenuItem("service_audit")!;
    const settlement = tradeSettlementFor(live, item, "b".repeat(64));
    await testEnv.COUNTERS.delete(KV_KEYS.tradeAccount(live.id));
    await recordTradeDelivery(testEnv, live, item, settlement, "cert_c1", {});
    await recordTradeDelivery(testEnv, live, item, settlement, "cert_c2", {});
    expect(await tradeOutstandingCents(testEnv, live)).toBe(Math.round(settlement.net_usd * 200));
    const { creditCeilingReached } = await import("@/services/trade-counter");
    expect(await creditCeilingReached(testEnv, live)).toBe(true);
    await recordTradePayout(testEnv, live, settlement.net_usd * 2, "paid-in-full");
    expect(await creditCeilingReached(testEnv, live)).toBe(false);
    expect(await reseatOutstanding(testEnv, live)).toBe(0);
    await clearPrefix(testEnv.ORDERS, KV_KEYS.tradeRowPrefix(live.id));
    await clearPrefix(testEnv.ORDERS, KV_KEYS.tradePayoutPrefix(live.id));
    await testEnv.COUNTERS.delete(KV_KEYS.tradeAccount(live.id));
    // Test-mode accounts are never refused on it.
    expect(await creditCeilingReached(testEnv, HAL)).toBe(false);
    const sweep = await sweepBooksInvariants(testEnv);
    expect(sweep.checked).toBe(6);
    expect(sweep.breaches.filter((line) => line.startsWith("trade-receivable"))).toEqual([]);
  });

  it("the aging watch names a live account whose oldest unpaid delivery has stood past the statement window", async () => {
    // No live accounts in the register today: the watch finds nothing and pages nobody.
    const aged = await tradeReceivableWatch(testEnv);
    expect(aged).toEqual([]);
    // And the summary's oldest_unpaid_at is the row the payouts do not reach.
    const live = { ...HAL, id: "spec_aging", name: "Spec Aging", mode: "live" as const };
    const item = getMenuItem("service_audit")!;
    const settlement = tradeSettlementFor(live, item, "c".repeat(64));
    const old = new Date(Date.now() - (TRADE_STATEMENT_DAYS + 5) * 86_400_000);
    await recordTradeDelivery(testEnv, live, item, settlement, "cert_a1", {}, old);
    await recordTradeDelivery(testEnv, live, item, settlement, "cert_a2", {});
    await recordTradePayout(testEnv, live, settlement.net_usd, "one-line");
    const summary = await tradeAccountSummary(testEnv, live);
    // The payout covered the oldest line; the newer one is the oldest unpaid.
    expect(summary.oldest_unpaid_at).not.toBe(old.toISOString());
    expect(summary.outstanding_usd).toBe(settlement.net_usd);
    await clearPrefix(testEnv.ORDERS, KV_KEYS.tradeRowPrefix(live.id));
    await clearPrefix(testEnv.ORDERS, KV_KEYS.tradePayoutPrefix(live.id));
    await testEnv.COUNTERS.delete(KV_KEYS.tradeAccount(live.id));
  });
});

describe("the surfaces, round two", () => {
  it("the delivery and the receipt page say who handles refunds", async () => {
    const { body } = await order("certificate_of_patronage", {});
    expect(String((body["trade"] as Record<string, unknown>)["refunds"])).toContain("Hal");
    const page = await (await SELF.fetch(`${BASE}/api/verify/${certificateOf(body).cert_id}`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain("Refunds go through the account holder");
  });

  it("the pages an integrator opens first name the counter", async () => {
    for (const path of ["/developers", "/operators", "/pricing"]) {
      const page = await (await SELF.fetch(`${BASE}${path}`, { headers: { Accept: "text/html" } })).text();
      expect(page, path).toContain('href="/trade"');
    }
    const item = await (await SELF.fetch(`${BASE}/menu/service_audit`, { headers: { Accept: "text/html" } })).text();
    expect(item).toContain("the trade counter");
    const itemJson = await json(await SELF.fetch(`${BASE}/menu/service_audit`));
    expect(isRecord(itemJson["trade_account"])).toBe(true);
    const penny = await json(await SELF.fetch(`${BASE}/menu/small_blessing`));
    expect(penny["trade_account"]).toBeUndefined();
    const front = await (await SELF.fetch(BASE, { headers: { Accept: "text/html" } })).text();
    expect(front).toContain('href="/trade"');
    const catalog = await (await SELF.fetch(`${BASE}/.well-known/api-catalog`)).text();
    expect(catalog).toContain("/api/trade/contract");
  });
});

describe("the markdown twin and the statement desk", () => {
  it("/trade.md is the room in markdown with the canonical pointing home, and /trade negotiates it", async () => {
    const twin = await SELF.fetch(`${BASE}/trade.md`);
    expect(twin.status).toBe(200);
    expect(twin.headers.get("content-type")).toContain("text/markdown");
    expect(twin.headers.get("link")).toContain(`<${BASE}/trade>; rel="canonical"`);
    const text = await twin.text();
    expect(text).toContain("# The Trade Counter");
    expect(text).toContain(TRADE_SANDBOX_SECRET);
    expect(text).toContain("/api/trade/contract");
    const negotiated = await SELF.fetch(`${BASE}/trade`, { headers: { Accept: "text/markdown" } });
    expect(negotiated.headers.get("content-type")).toContain("text/markdown");
    expect(await negotiated.text()).toBe(text);
    const page = await (await SELF.fetch(`${BASE}/trade`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain('type="text/markdown" href="https://scvd.store/trade.md"');
  });

  it("/admin/trade renders every account behind the password, and the form records a payout", async () => {
    const auth = { Authorization: `Basic ${btoa("keeper:test-admin-password")}` };
    const page = await SELF.fetch(`${BASE}/admin/trade`, { headers: auth });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("The trade counter, account by account");
    expect(html).toContain("<code>hal</code>");
    expect(html).toContain("<code>sandbox</code>");
    expect((await SELF.fetch(`${BASE}/admin/trade`)).status).toBe(401);
    const form = await SELF.fetch(`${BASE}/admin/trade/hal/payout`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
      body: "amount_usd=3.50&reference=form-test",
      redirect: "manual",
    });
    expect(form.status).toBe(303);
    expect(form.headers.get("location")).toBe("/admin/trade");
    const rows = await testEnv.ORDERS.list({ prefix: KV_KEYS.tradePayoutPrefix("hal") });
    expect(rows.keys.length).toBe(1);
  });
});

describe("pass four: signed statements, delivery receipts, the signer to paste", () => {
  it("the statement is signed over its JCS form with the published key, and verifies offline", async () => {
    await order("certificate_of_patronage", { order_ref: "signed-1" });
    const headers = await signTradeRequest({ dialect: TRADE_DIALECTS.hal, secret: SECRET, provider_key: PROVIDER_KEY, body: "" });
    const body = await json(await SELF.fetch(`${BASE}/api/trade/hal/statement`, { headers }));
    const { jcsCanonicalize } = await import("@/lib/jcs");
    const { verifyMessageSignature } = await import("@/lib/signing");
    const payload = body["signed_payload"] as Record<string, unknown>;
    expect(body["canonical_form"]).toBe(jcsCanonicalize(payload));
    expect(
      await verifyMessageSignature(jcsCanonicalize(payload), String(body["signature_jcs"]), String(body["public_key"])),
    ).toBe(true);
    // Tamper a row and the signature no longer covers it.
    const tampered = { ...payload, summary: { ...(payload["summary"] as Record<string, unknown>), outstanding_usd: 999 } };
    expect(
      await verifyMessageSignature(jcsCanonicalize(tampered), String(body["signature_jcs"]), String(body["public_key"])),
    ).toBe(false);
    expect((payload["deliveries"] as unknown[]).length).toBe(1);
  });

  it("a callback_url is validated like a probe target, and the receipt's outcome lands on the row", async () => {
    await expectRefusalShape(await order("certificate_of_patronage", { callback_url: "http://insecure.example/hook" }), 400, "target_refused");
    await expectRefusalShape(await order("certificate_of_patronage", { callback_url: "https://127.0.0.1/hook" }), 400, "target_refused");
    await expectRefusalShape(await order("certificate_of_patronage", { callback_url: "https://scvd.store/hook" }), 400, "target_refused");
    // A public host the test worker cannot reach: delivered anyway, outcome written down.
    const { status } = await order("certificate_of_patronage", {
      order_ref: "cb-1",
      callback_url: "https://callback.invalid/receipt",
    });
    expect(status).toBe(200);
    const rows = await testEnv.ORDERS.list({ prefix: KV_KEYS.tradeRowPrefix("hal") });
    expect(rows.keys.length).toBe(1);
    // The receipt rides waitUntil; give it a moment to write the outcome.
    let row: Record<string, unknown> = {};
    for (let attempt = 0; attempt < 20; attempt += 1) {
      row = JSON.parse((await testEnv.ORDERS.get(rows.keys[0]!.name)) ?? "{}") as Record<string, unknown>;
      if (typeof row["callback"] === "string") break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(String(row["callback"])).toMatch(/attempted once|delivered/);
  });

  it("the signer to paste is on the page and the twin in three languages, against the sandbox", async () => {
    const md = await (await SELF.fetch(`${BASE}/trade.md`)).text();
    for (const label of ["Node", "Python", "Go"]) expect(md).toContain(`**${label}**`);
    expect(md).toContain("```python");
    expect(md).toContain(TRADE_SANDBOX_SECRET);
    expect(md).toContain("npx scvd trade check");
    const page = await (await SELF.fetch(`${BASE}/trade`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain("<summary>Python</summary>");
    const contract = await json(await SELF.fetch(`${BASE}/api/trade/contract`));
    expect(((contract["how_to_call"] as Record<string, unknown>)["signers"] as unknown[]).length).toBe(3);
  });
});

async function expectRefusalShape(
  result: { status: number; body: Record<string, unknown> },
  status: number,
  code: string,
): Promise<void> {
  expect(result.status).toBe(status);
  expect(result.body["delivered"]).toBe(false);
  expect(result.body["billed"]).toBe(false);
  expect(result.body["code"]).toBe(code);
}

describe("pass five: recovery by order_ref, the share ladder, the worked example, the rails line", () => {
  it("recovers a delivery by order_ref for the account that ordered it, signed, and says not_found otherwise", async () => {
    const first = await order("certificate_of_patronage", { order_ref: "lost-receipt-9" });
    const certId = certificateOf(first.body).cert_id;
    const sign = () => signTradeRequest({ dialect: TRADE_DIALECTS.hal, secret: SECRET, provider_key: PROVIDER_KEY, body: "" });
    const found = await SELF.fetch(`${BASE}/api/trade/hal/claim?order_ref=lost-receipt-9`, { headers: await sign() });
    expect(found.status).toBe(200);
    const body = await json(found);
    expect((body["row"] as Record<string, unknown>)["cert_id"]).toBe(certId);
    expect((body["certificate"] as Record<string, unknown>)["cert_id"]).toBe(certId);
    expect(String(body["verify_url"])).toContain(certId);
    const missing = await SELF.fetch(`${BASE}/api/trade/hal/claim?order_ref=never-ordered`, { headers: await sign() });
    expect(missing.status).toBe(404);
    expect((await json(missing))["code"]).toBe("not_found");
    expect((await SELF.fetch(`${BASE}/api/trade/hal/claim?order_ref=lost-receipt-9`)).status).toBe(401);
  });

  it("the ladder raises the share with the month's live deliveries, and the store nets the same at every tier", async () => {
    const { STANDARD_SHARE_LADDER, effectiveShareBps } = await import("@/store/trade-counter");
    const laddered = { ...HAL, id: "spec_ladder", mode: "live" as const, share_ladder: STANDARD_SHARE_LADDER };
    expect(effectiveShareBps(laddered, 0)).toBe(500);
    expect(effectiveShareBps(laddered, 999)).toBe(500);
    expect(effectiveShareBps(laddered, 1000)).toBe(800);
    expect(effectiveShareBps(laddered, 25_000)).toBe(1200);
    expect(effectiveShareBps(HAL, 25_000)).toBe(HAL.partner_share_bps);
    const item = getMenuItem("service_audit")!;
    const netAt = (share: number) => tradeNetUsd(tradePriceUsd(item, share), share);
    for (const tier of STANDARD_SHARE_LADDER) {
      expect(netAt(tier.partner_share_bps)).toBeGreaterThanOrEqual(Math.round(item.price_usdc * 1.2 * 100) / 100 - 0.005);
    }
    // The month counter feeds the ladder: two live deliveries, then the share for the next.
    const { shareForNextDelivery, tradeMonthCount, utcMonth } = await import("@/services/trade-counter");
    await testEnv.COUNTERS.delete(KV_KEYS.tradeMonth(laddered.id, utcMonth()));
    const settlement = tradeSettlementFor(laddered, item, "d".repeat(64));
    await recordTradeDelivery(testEnv, laddered, item, settlement, "cert_l1", {});
    await recordTradeDelivery(testEnv, laddered, item, settlement, "cert_l2", {});
    expect(await tradeMonthCount(testEnv, laddered, utcMonth())).toBe(2);
    expect(await shareForNextDelivery(testEnv, laddered)).toBe(500);
    await testEnv.COUNTERS.put(KV_KEYS.tradeMonth(laddered.id, utcMonth()), "1000");
    expect(await shareForNextDelivery(testEnv, laddered)).toBe(800);
    await clearPrefix(testEnv.ORDERS, KV_KEYS.tradeRowPrefix(laddered.id));
    await testEnv.COUNTERS.delete(KV_KEYS.tradeMonth(laddered.id, utcMonth()));
    await testEnv.COUNTERS.delete(KV_KEYS.tradeAccount(laddered.id));
  });

  it("the worked example's bytes are the sandbox secret's HMAC, and the door refuses them as stale", async () => {
    const contract = await json(await SELF.fetch(`${BASE}/api/trade/contract`));
    const example = contract["worked_example"] as Record<string, unknown>;
    const headers = example["headers"] as Record<string, string>;
    const { hmacSha256Hex } = await import("@/lib/trade-auth");
    const expected = await hmacSha256Hex(TRADE_SANDBOX_SECRET, String(example["signing_string"]));
    expect(headers["X-Trade-Signature"]).toBe(`sha256=${expected}`);
    expect(String(example["signing_string"])).toBe(`${headers["X-Trade-Timestamp"]}.${headers["X-Trade-Nonce"]}.${example["body"]}`);
    const sent = await SELF.fetch(String(example["door"]), {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: String(example["body"]),
    });
    expect(sent.status).toBe(401);
    expect((await json(sent))["code"]).toBe("stale_timestamp");
    const md = await (await SELF.fetch(`${BASE}/trade.md`)).text();
    expect(md).toContain("## The worked example, every byte");
    expect(md).toContain(headers["X-Trade-Signature"]);
  });

  it("/rails carries the counter beside the rails, never inside them", async () => {
    const rails = await json(await SELF.fetch(`${BASE}/rails`));
    const counter = rails["trade_counter"] as Record<string, unknown>;
    expect(String(counter["what_this_is"])).toContain("Not a rail");
    const accounts = counter["accounts"] as Record<string, unknown>[];
    expect(accounts.map((row) => row["account"])).toContain("hal");
    const page = await (await SELF.fetch(`${BASE}/rails`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain("Not a rail: the trade counter");
  });
});

describe("pass six: tightening", () => {
  it("the check desk answers an account's hourly budget and then refuses by name", async () => {
    const { TRADE_CHECK_DESK_HOURLY_BUDGET } = await import("@/store/trade-counter");
    const hour = new Date().toISOString().slice(0, 13);
    await testEnv.COUNTERS.put(KV_KEYS.tradeDeskHour(TRADE_SANDBOX_ID, hour), String(TRADE_CHECK_DESK_HOURLY_BUDGET));
    const refused = await sandboxSigned("x", {}, "check");
    expect(refused.status).toBe(429);
    expect(refused.body["code"]).toBe("desk_rate_limited");
    expect(refused.body["delivered"]).toBe(false);
    await testEnv.COUNTERS.delete(KV_KEYS.tradeDeskHour(TRADE_SANDBOX_ID, hour));
    const answered = await sandboxSigned("x", {}, "check");
    expect(answered.status).toBe(200);
    expect(await testEnv.COUNTERS.get(KV_KEYS.tradeDeskHour(TRADE_SANDBOX_ID, hour))).toBe("1");
    await testEnv.COUNTERS.delete(KV_KEYS.tradeDeskHour(TRADE_SANDBOX_ID, hour));
  });

  it("the payout form refuses a cross-site submission and accepts the store's own page", async () => {
    const auth = { Authorization: `Basic ${btoa("keeper:test-admin-password")}` };
    const crossSite = await SELF.fetch(`${BASE}/admin/trade/hal/payout`, {
      method: "POST",
      headers: {
        ...auth,
        "content-type": "application/x-www-form-urlencoded",
        "sec-fetch-site": "cross-site",
        origin: "https://elsewhere.example",
      },
      body: "amount_usd=1&reference=csrf",
      redirect: "manual",
    });
    expect(crossSite.status).toBe(403);
    expect((await json(crossSite))["code"]).toBe("cross_site_refused");
    const own = await SELF.fetch(`${BASE}/admin/trade/hal/payout`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" },
      body: "amount_usd=1&reference=own-page",
      redirect: "manual",
    });
    expect(own.status).toBe(303);
    // A script with JSON is not a browser form and is not guarded by it.
    const script = await SELF.fetch(`${BASE}/admin/trade/hal/payout`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", origin: "https://elsewhere.example" },
      body: JSON.stringify({ amount_usd: 1, reference: "script" }),
    });
    expect(script.status).toBe(200);
    await clearPrefix(testEnv.ORDERS, KV_KEYS.tradePayoutPrefix("hal"));
  });
});
