import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Env } from "@/types";
import { isRecord } from "@/types";
import {
  installFacilitatorMock,
  TEST_WEBHOOK_URL,
  type FacilitatorMockState,
} from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

let facilitator: FacilitatorMockState;

beforeAll(() => {
  facilitator = installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected a JSON object body");
  }
  return body;
}

async function buyPaid(
  itemId: string,
  tierIndex = 0,
  query = "",
): Promise<Response> {
  const challenge = await SELF.fetch(`${BASE}/api/buy/${itemId}${query}`);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const accepted = required.accepts[tierIndex];
  if (!accepted) {
    throw new Error(`No tier ${tierIndex} offered for ${itemId}`);
  }
  return SELF.fetch(`${BASE}/api/buy/${itemId}${query}`, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
}

describe("the 402 challenge (x402 v2)", () => {
  it("answers an unpaid buy with a well-formed v2 challenge", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/pet_rock`);
    expect(response.status).toBe(402);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const required = decodePaymentRequired(response);
    expect(required.x402Version).toBe(2);
    // Three pay-what-it-deserves tiers: $5, $10, $25 in USDC atomic units.
    expect(required.accepts.map((a) => a.amount)).toEqual([
      "5000000",
      "10000000",
      "25000000",
    ]);
    for (const requirement of required.accepts) {
      expect(requirement.scheme).toBe("exact");
      expect(requirement.network).toBe("eip155:8453");
      expect(requirement.payTo).toBe(testEnv.PAY_TO_ADDRESS);
      // USDC on Base mainnet.
      expect(requirement.asset).toBe(
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      );
    }

    const body = await json(response);
    expect(body["error"]).toContain("if you think the rock deserves it");
    expect(body["min_price_usdc"]).toBe(5);
  });

  it("shows humans with browsers to the front porch", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/pet_rock`, {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (a curious human)",
      },
    });
    expect(response.status).toBe(402);
    const html = await response.text();
    expect(html).toContain("That shelf is for agents");
  });
});

describe("paid purchases", () => {
  it("delivers an instant item after settlement, with badge and receipt", async () => {
    const response = await buyPaid("hello", 0, "?agent_name=First%20Agent");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("PAYMENT-RESPONSE")).toBeTruthy();

    const body = await json(response);
    expect(body["deliverable"]).toContain("Customer no. 1");
    expect(body["paid_usdc"]).toBe(0.5);
    expect(body["tip_usdc"]).toBe(0);
    expect(body["patron_number"]).toBe(1);
    expect(body["badge_url"]).toBe(`${BASE}/badges/1.svg`);

    // The badge exists and the certificate verifies.
    const badge = await SELF.fetch(`${BASE}/badges/1.svg`);
    expect(badge.status).toBe(200);
    const cert = body["certificate"] as { cert_id: string };
    const verify = await json(
      await SELF.fetch(`${BASE}/api/verify/${cert.cert_id}`),
    );
    expect(verify["valid"]).toBe(true);
  });

  it("queues a human item and records a generous tier as a tip", async () => {
    // Tier 1 on pet_rock = $10 against a $5 minimum: $5 tip.
    const response = await buyPaid("pet_rock", 1);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body["status"]).toBe("queued");
    expect(body["paid_usdc"]).toBe(10);
    expect(body["tip_usdc"]).toBe(5);
    expect(body["message"]).toContain("give him the week");

    const orderId = body["order_id"] as string;
    const poll = await json(await SELF.fetch(`${BASE}/api/order/${orderId}`));
    expect(poll["status"]).toBe("queued");
    expect(poll["sla_hours"]).toBe(168);
  });

  it("mints nothing when settlement fails", async () => {
    const patronsBefore = await testEnv.COUNTERS.get("patron_number");
    const ordersBefore = await testEnv.ORDERS.list({ prefix: "order:" });
    facilitator.settleShouldFail = true;
    try {
      const instant = await buyPaid("hello");
      expect(instant.status).toBe(402);
      const queued = await buyPaid("pet_rock");
      expect(queued.status).toBe(402);
    } finally {
      facilitator.settleShouldFail = false;
    }
    const patronsAfter = await testEnv.COUNTERS.get("patron_number");
    expect(patronsAfter).toBe(patronsBefore);
    const ordersAfter = await testEnv.ORDERS.list({ prefix: "order:" });
    expect(ordersAfter.keys.length).toBe(ordersBefore.keys.length);
  });

  it("turns away an invalid payment", async () => {
    facilitator.verifyShouldFail = true;
    try {
      const response = await buyPaid("hello");
      expect(response.status).toBe(402);
    } finally {
      facilitator.verifyShouldFail = false;
    }
  });
});

describe("weekly inventory", () => {
  it("sells out, points to the waitlist, and takes waitlist entries", async () => {
    for (let i = 0; i < 3; i += 1) {
      const sale = await buyPaid("phone_call");
      expect(sale.status).toBe(200);
    }
    const soldOut = await SELF.fetch(`${BASE}/api/buy/phone_call`);
    expect(soldOut.status).toBe(409);
    const body = await json(soldOut);
    expect(body["error"]).toContain("Shelf's empty");

    const waitlist = await SELF.fetch(`${BASE}/api/waitlist/phone_call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_name: "patient-agent" }),
    });
    expect(waitlist.status).toBe(201);
  });

  it("declines waitlist entries while the shelf is stocked", async () => {
    const response = await SELF.fetch(`${BASE}/api/waitlist/app_gutcheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body["buy_url"]).toBe(`${BASE}/api/buy/app_gutcheck`);
  });
});

describe("the keeper's completion flow", () => {
  const auth = {
    Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
  };

  it("completes an order, delivers on poll, and fires the webhook", async () => {
    const purchase = await json(
      await buyPaid(
        "portrait",
        0,
        `?callback_url=${encodeURIComponent(TEST_WEBHOOK_URL)}`,
      ),
    );
    const orderId = purchase["order_id"] as string;

    const complete = await SELF.fetch(
      `${BASE}/admin/orders/${orderId}/complete`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          deliverable: "One portrait, drawn with feeling: https://scvd.store/art/1",
        }).toString(),
        redirect: "manual",
      },
    );
    expect([200, 302]).toContain(complete.status);

    const poll = await json(await SELF.fetch(`${BASE}/api/order/${orderId}`));
    expect(poll["status"]).toBe("completed");
    expect(poll["deliverable"]).toContain("drawn with feeling");

    expect(facilitator.webhookCalls.length).toBe(1);
    const hook = facilitator.webhookCalls[0];
    expect(hook?.url).toBe(TEST_WEBHOOK_URL);
    const hookBody = hook?.body as Record<string, unknown>;
    expect(hookBody["order_id"]).toBe(orderId);
    expect(hookBody["status"]).toBe("completed");
  });

  it("updates the weekly note and resets inventory from the back room", async () => {
    const noteResponse = await SELF.fetch(`${BASE}/admin/note`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        week_note: "Fresh rocks in. The good gray kind.",
      }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(noteResponse.status);
    // The readerboard sets the note word by word, so match per word.
    const storefront = await (await SELF.fetch(`${BASE}/`)).text();
    expect(storefront).toContain("gray");
    expect(storefront).toContain("rocks");

    const reset = await SELF.fetch(`${BASE}/admin/inventory/reset`, {
      method: "POST",
      headers: auth,
      redirect: "manual",
    });
    expect([200, 302]).toContain(reset.status);
  });

  it("deletes a guestbook entry from the back room", async () => {
    await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Spam Bot", message: "Buy my thing" }),
    });
    const listed = await testEnv.GUESTBOOK.list({ prefix: "entry:" });
    const kvKey = listed.keys[0]?.name ?? "";
    expect(kvKey).toBeTruthy();

    const remove = await SELF.fetch(`${BASE}/admin/guestbook/delete`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ kv_key: kvKey }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(remove.status);
    const after = await testEnv.GUESTBOOK.list({ prefix: "entry:" });
    expect(after.keys.length).toBe(0);
  });
});
