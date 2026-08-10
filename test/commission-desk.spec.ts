import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { CommissionRequest, Env } from "@/types";
import { isRecord } from "@/types";
import { COMMISSION_RUNGS, QUOTE_EXPIRY_DAYS } from "@/store/commission-desk";
import {
  installFacilitatorMock,
  type FacilitatorMockState,
} from "./helpers/facilitator-mock";
import { markKeeperPresent } from "./helpers/keeper";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";

/**
 * THE COMMISSION DESK (keeper's ruling C2, 2026-08-10): bespoke work
 * moves request → quote → agreed price, `the_collab` first through
 * the door, declines answered in PUBLIC. The money-side law under
 * test: a rung route's price is static, payment is honoured only
 * against a live quote at exactly that rung, and every refusal
 * happens before the facilitator is asked to move anything.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

let facilitator: FacilitatorMockState;

beforeAll(async () => {
  facilitator = installFacilitatorMock();
  await markKeeperPresent(testEnv);
});

const auth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected a JSON object body");
  }
  return body;
}

async function writeIn(description: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}/api/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description,
      offer_usdc: 40,
      contact: "secret-contact@example.com",
    }),
  });
  expect(response.status).toBe(201);
  const body = await json(response);
  const request = body["request"] as { id: string };
  return request.id;
}

async function quoteViaAdmin(
  id: string,
  usdc: number,
  windowHours: number,
  note?: string,
): Promise<Response> {
  return SELF.fetch(`${BASE}/admin/commission/${id}/quote`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      usdc: String(usdc),
      window_hours: String(windowHours),
      ...(note ? { note } : {}),
    }).toString(),
    redirect: "manual",
  });
}

async function payRung(rung: number, commissionId: string): Promise<Response> {
  const url = `${BASE}/api/commission/pay/${rung}?commission=${commissionId}`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const accepted = required.accepts[0];
  if (!accepted) throw new Error(`No offer on the $${rung} rung`);
  return SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
}

describe("the write-in door points at the desk", () => {
  it("hands the requester their status_url and the desk's terms", async () => {
    const id = await writeIn("A hand-painted conformance report");
    const body = await json(
      await SELF.fetch(`${BASE}/api/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Another ask",
          offer_usdc: 10,
          contact: "someone@example.com",
        }),
      }),
    );
    expect(body["status_url"]).toContain("/api/commission/");
    expect(String(body["how_the_desk_answers"])).toContain("published rung");

    const status = await json(
      await SELF.fetch(`${BASE}/api/commission/${id}`),
    );
    expect(status["status"]).toBe("requested");
    expect(status["description"]).toBe("A hand-painted conformance report");
    // The reply channel stays between the ledger and the keeper.
    expect(JSON.stringify(status)).not.toContain("secret-contact");
  });

  it("answers an unknown id honestly", async () => {
    const response = await SELF.fetch(`${BASE}/api/commission/req_nope`);
    expect(response.status).toBe(404);
  });
});

describe("the keeper's quote", () => {
  it("refuses a price off the ladder, and the request stays unquoted", async () => {
    const id = await writeIn("Something worth an odd number");
    const offLadder = await quoteViaAdmin(id, 37, 72);
    expect(offLadder.status).toBe(409);
    expect(await offLadder.text()).toContain("not on the ladder");

    const status = await json(
      await SELF.fetch(`${BASE}/api/commission/${id}`),
    );
    expect(status["status"]).toBe("requested");
  });

  it("refuses a quote with no usable window", async () => {
    const id = await writeIn("Work with no clock on it");
    const noWindow = await quoteViaAdmin(id, 50, 0);
    expect(noWindow.status).toBe(409);
    expect(await noWindow.text()).toContain("window");
  });

  it("puts a live quote on the record: rung, window, expiry, pay_url", async () => {
    const id = await writeIn("A standing witness at the demo");
    const quoted = await quoteViaAdmin(id, 50, 96, "Thursday works.");
    expect([200, 302]).toContain(quoted.status);

    const status = await json(
      await SELF.fetch(`${BASE}/api/commission/${id}`),
    );
    expect(status["status"]).toBe("quoted");
    const quote = status["quote"] as Record<string, unknown>;
    expect(quote["usdc"]).toBe(50);
    expect(quote["window_hours"]).toBe(96);
    expect(quote["note"]).toBe("Thursday works.");
    expect(String(quote["pay_url"])).toContain(
      `/api/commission/pay/50?commission=${id}`,
    );
    // The expiry is the spec's default, derived — never a stored guess.
    const expires = Date.parse(String(quote["expires_at"]));
    const quotedAt = Date.parse(String(quote["quoted_at"]));
    expect(expires - quotedAt).toBe(QUOTE_EXPIRY_DAYS * 24 * 3600_000);
  });
});

describe("the rung routes", () => {
  it("quotes the rung's static price in the 402, one per published rung", async () => {
    for (const rung of COMMISSION_RUNGS) {
      const challenge = await SELF.fetch(`${BASE}/api/commission/pay/${rung}`);
      expect(challenge.status).toBe(402);
      const required = decodePaymentRequired(challenge);
      // One tier: a quote is a price, not a menu of prices.
      const baseEntries = required.accepts.filter(
        (a) => a.network === "eip155:8453",
      );
      expect(baseEntries.map((a) => a.amount)).toEqual([
        String(rung * 1_000_000),
      ]);
      const body = await json(challenge);
      expect(String(body["error"])).toContain("live quote");
    }
  });

  it("is not a door off the ladder", async () => {
    const response = await SELF.fetch(`${BASE}/api/commission/pay/37`);
    // No route config exists for an unpublished rung, so the gate has
    // nothing to sell — the handler's own guards answer instead.
    expect(response.status).not.toBe(200);
  });
});

describe("payment against the quote", () => {
  it("refuses a signed payment with no commission id, before any money moves", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/commission/pay/25`);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const settlesBefore = facilitator.settleCalls;
    const response = await SELF.fetch(`${BASE}/api/commission/pay/25`, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    expect(response.status).toBe(400);
    expect(facilitator.settleCalls).toBe(settlesBefore);
  });

  it("refuses payment on an unquoted request, unpaid", async () => {
    const id = await writeIn("Eager money for unquoted work");
    const settlesBefore = facilitator.settleCalls;
    const response = await payRung(25, id);
    expect(response.status).toBe(409);
    expect(String((await json(response))["error"])).toContain("not quoted");
    expect(facilitator.settleCalls).toBe(settlesBefore);
  });

  it("refuses payment at the wrong rung and names the right one", async () => {
    const id = await writeIn("Quoted at one hundred");
    await quoteViaAdmin(id, 100, 48);
    const settlesBefore = facilitator.settleCalls;
    const response = await payRung(25, id);
    expect(response.status).toBe(409);
    const body = await json(response);
    expect(String(body["error"])).toContain("$100");
    expect(facilitator.settleCalls).toBe(settlesBefore);
  });

  it("refuses an expired quote, unpaid — expiry is derived at read, not stored", async () => {
    const id = await writeIn("A quote left too long on the counter");
    await quoteViaAdmin(id, 25, 24);
    // Age the quote by hand: a past instant stays past whatever the
    // wall clock does, so this cannot rot the way a fake-now can.
    const key = `request:${id}`;
    const row = (await testEnv.ORDERS.get(key, "json")) as CommissionRequest;
    row.quote_expires_at = "2020-01-01T00:00:00.000Z";
    await testEnv.ORDERS.put(key, JSON.stringify(row));

    const status = await json(
      await SELF.fetch(`${BASE}/api/commission/${id}`),
    );
    expect(status["status"]).toBe("expired");

    const settlesBefore = facilitator.settleCalls;
    const response = await payRung(25, id);
    expect(response.status).toBe(409);
    expect(String((await json(response))["error"])).toContain("expired");
    expect(facilitator.settleCalls).toBe(settlesBefore);
  });

  it("a failed settlement leaves the quote live and binds no order", async () => {
    const id = await writeIn("Money that will not clear");
    await quoteViaAdmin(id, 25, 48);
    facilitator.settleShouldFail = true;
    try {
      const response = await payRung(25, id);
      expect(response.status).toBe(402);
    } finally {
      facilitator.settleShouldFail = false;
    }
    const status = await json(
      await SELF.fetch(`${BASE}/api/commission/${id}`),
    );
    expect(status["status"]).toBe("quoted");
  });

  it("pays a live quote: order minted under the quote's OWN window, request accepted", async () => {
    const id = await writeIn("The real one, at fifty");
    await quoteViaAdmin(id, 50, 96);
    const response = await payRung(50, id);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body["commission_id"]).toBe(id);
    expect(body["commission_status"]).toBe("accepted");
    expect(body["paid_usdc"]).toBe(50);
    expect(body["tip_usdc"]).toBe(0);
    // The per-quote window IS the desk; 168h flat is what it retires.
    expect(body["sla_hours"]).toBe(96);

    const orderId = String(body["order_id"]);
    const order = await json(await SELF.fetch(`${BASE}/api/order/${orderId}`));
    expect(order["item_id"]).toBe("the_collab");
    expect(order["sla_hours"]).toBe(96);

    const status = await json(
      await SELF.fetch(`${BASE}/api/commission/${id}`),
    );
    expect(status["status"]).toBe("accepted");
    expect(String(status["order_url"])).toContain(orderId);

    // A paid ending cannot be re-quoted into a different one.
    const requote = await quoteViaAdmin(id, 100, 24);
    expect(requote.status).toBe(409);
  });
});

describe("the public decline", () => {
  it("refuses a decline with no reply — the reply is the ruling's point", async () => {
    const id = await writeIn("Declined without a word");
    const response = await SELF.fetch(`${BASE}/admin/commission/${id}/decline`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ reply: "  " }).toString(),
      redirect: "manual",
    });
    expect(response.status).toBe(409);
    const status = await json(
      await SELF.fetch(`${BASE}/api/commission/${id}`),
    );
    expect(status["status"]).toBe("requested");
  });

  it("publishes the decline with the reply, and never the contact", async () => {
    const id = await writeIn("Something the store does not do");
    const declined = await SELF.fetch(`${BASE}/admin/commission/${id}/decline`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        reply: "Out of scope for this desk — we observe, we do not escrow.",
      }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(declined.status);

    const page = await json(
      await SELF.fetch(`${BASE}/api/commission/declined`),
    );
    const entries = page["declined"] as Array<Record<string, unknown>>;
    const mine = entries.find((entry) => entry["id"] === id);
    expect(mine).toBeTruthy();
    expect(String(mine?.["reply"])).toContain("we do not escrow");
    expect(JSON.stringify(page)).not.toContain("secret-contact");

    // And a declined ending stays an ending: the rung refuses it.
    const settlesBefore = facilitator.settleCalls;
    const response = await payRung(25, id);
    expect(response.status).toBe(409);
    expect(facilitator.settleCalls).toBe(settlesBefore);
  });
});
