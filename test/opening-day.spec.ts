import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MENU_ITEMS, getMenuItem } from "@/store/menu";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { readConformanceWatch } from "@/services/conformance-watch";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const SHOP = "https://opening.example";
const TARGET = `${SHOP}/api/buy/thing`;
const TEST_FIELD_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SELLER_PAY_TO = "0x1111111111111111111111111111111111111111";
const SELLER_TX = "0x" + "ab".repeat(32);

beforeAll(() => {
  installFacilitatorMock();
});

afterEach(() => {
  delete (testEnv as unknown as Record<string, unknown>).FIELD_WALLET_KEY;
  vi.unstubAllGlobals();
  installFacilitatorMock();
});

/** A seller that serves a payable 402 and settles the first payment. */
function fakeSeller(): typeof fetch {
  const spent = new Set<string>();
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const payment = headers.get("PAYMENT-SIGNATURE");
    const challenge = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "5000",
          asset: USDC_BASE,
          payTo: SELLER_PAY_TO,
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2" },
        },
      ],
    };
    if (!payment) {
      return new Response("{}", {
        status: 402,
        headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
      });
    }
    const payload = JSON.parse(atob(payment)) as {
      payload: { authorization: Record<string, string> };
    };
    const nonce = payload.payload.authorization["nonce"] ?? "";
    if (spent.has(nonce)) {
      return new Response("{}", { status: 402 });
    }
    spent.add(nonce);
    return new Response(JSON.stringify({ goods: "thing" }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "PAYMENT-RESPONSE": btoa(
          JSON.stringify({ success: true, transaction: SELLER_TX, network: "eip155:8453" }),
        ),
      },
    });
  }) as typeof fetch;
}

/**
 * ROADMAP S3 — THE OPENING DAY (the keeper's price and name,
 * 2026-09-01). The merchant kit as a bundle, not a brand: one launch
 * check, seven days of conformance watch on the same door, and the
 * passport page, under one certificate and one URL. No second
 * battery, no new primitive, and it never renews itself.
 */
describe("The Opening Day on the shelf", () => {
  it("is nine dollars, a seven-day term, url required, priced under the two apart", () => {
    const item = getMenuItem("opening_day")!;
    expect(item.price_usdc).toBe(9);
    expect(item.cadence).toBe("term");
    expect(item.term_days).toBe(7);
    expect(item.reads).toBe("subject_purchase");
    expect(item.subtitle).toContain("one URL");
    expect(buyInputSchema(item).required).toContain("url");
    const apart =
      getMenuItem("launch_check")!.price_usdc + getMenuItem("conformance_watch")!.price_usdc;
    expect(item.price_usdc).toBeLessThan(apart);
    expect(item.description).toContain("Not a badge");
    expect(JSON.stringify(item.constraints)).toContain("never renews itself");
  });

  it("sits behind the launch check on the ladder and in the MCP cluster", async () => {
    const ids = MENU_ITEMS.map((entry) => entry.id);
    expect(ids.indexOf("opening_day")).toBe(ids.indexOf("launch_check") + 1);
  });

  it("refuses to sell while the field wallet is unprovisioned, like the walk it bundles", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/opening_day?url=${encodeURIComponent(TARGET)}`,
      { headers: { "PAYMENT-SIGNATURE": "not-a-real-signature" } },
    );
    expect(response.status).toBe(503);
  });

  it("refuses our own hostname and a missing url before money", async () => {
    testEnv.FIELD_WALLET_KEY = TEST_FIELD_KEY;
    const own = await SELF.fetch(
      `${BASE}/api/buy/opening_day?url=${encodeURIComponent(`${BASE}/api/buy/hello`)}`,
      { headers: { "PAYMENT-SIGNATURE": "x" } },
    );
    expect(own.status).toBe(400);
    const missing = await SELF.fetch(`${BASE}/api/buy/opening_day`, {
      headers: { "PAYMENT-SIGNATURE": "x" },
    });
    expect(missing.status).toBe(400);
  });
});

describe("The Opening Day, delivered", () => {
  it("walks the door, opens the week, names the passport, and one URL serves the three", async () => {
    testEnv.FIELD_WALLET_KEY = TEST_FIELD_KEY;
    const seller = fakeSeller();
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith(SHOP)) return seller(input as never, init as never);
        if (String(init?.body ?? "").includes("0xdf592f7d")) {
          return new Response(JSON.stringify({ result: `0x${"0".repeat(64)}` }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return inner(input as never, init as never);
      }) as typeof fetch,
    );
    const target = encodeURIComponent(TARGET);
    const challenge = await SELF.fetch(`${BASE}/api/buy/opening_day?url=${target}`);
    expect(challenge.status).toBe(402);
    const headerName = [...challenge.headers.keys()].find(
      (name) => name.toLowerCase() === "payment-required",
    )!;
    const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
      accepts: Array<Record<string, unknown>>;
    };
    expect(required.accepts[0]!["amount"]).toBe("9000000");
    const paid = await SELF.fetch(`${BASE}/api/buy/opening_day?url=${target}`, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0] as never) },
    });
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;

    // The walk, signed and bound.
    expect(body.launch_check.verdict).toBe("settled");
    expect(body.launch_check.check_id).toMatch(/^lcheck_/);
    expect(body.launch_check.check_url).toBe(`/api/launch-check/${body.launch_check.check_id}`);
    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${body.certificate.cert_id}`)
    ).json()) as Record<string, any>;
    expect(verify.valid).toBe(true);
    expect(verify.certificate.attests).toBe(body.check.evidence_hash);

    // The week, opened on the same door, bounded.
    expect(body.conformance_watch.watch_id).toMatch(/^cwatch_/);
    const history = await readConformanceWatch(testEnv, body.conformance_watch.watch_id);
    expect(history?.url).toBe(TARGET);
    expect(history?.complete).toBe(false);
    expect(Date.parse(history!.ends_at) - Date.now()).toBeGreaterThan(6 * 24 * 3600_000);

    // The passport, by host.
    expect(body.passport_url).toBe("/passport/opening.example");

    // One URL names the three, JSON and page, with no evidence of its own.
    expect(body.opening_day_url).toBe(`/api/opening-day/${body.certificate.cert_id}`);
    const one = (await (await SELF.fetch(`${BASE}${body.opening_day_url}`)).json()) as Record<string, any>;
    expect(one.host).toBe("opening.example");
    expect(one.certificate).toBe(`${BASE}/api/verify/${body.certificate.cert_id}`);
    expect(one.launch_check).toBe(`${BASE}/api/launch-check/${body.launch_check.check_id}`);
    expect(one.conformance_watch).toBe(`${BASE}/api/conformance-watch/${body.conformance_watch.watch_id}`);
    expect(one.passport).toBe(`${BASE}/passport/opening.example`);
    expect(String(one.what_this_is)).toContain("not a badge");
    const page = await (
      await SELF.fetch(`${BASE}${body.opening_day_url}`, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("The three records");
    expect(page).toContain(one.conformance_watch);
    // And the deliverable says the week never renews itself.
    expect(String(body.deliverable ?? JSON.stringify(body))).toContain("never renews itself");
  });

  it("an unknown certificate id is a 404 naming the item", async () => {
    const response = await SELF.fetch(`${BASE}/api/opening-day/cert_nope`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toContain("/api/buy/opening_day");
  });
});
