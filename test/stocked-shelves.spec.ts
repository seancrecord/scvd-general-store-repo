import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * The fulfillment restructure, Class 1 and 2: stocked shelves fulfill
 * themselves from keeper-made units; the retired shelf answers
 * instantly. a_secret stays manual by the keeper's ruling. The jar
 * was scrapped and luckies went preset (rulings 2026-07-25); the
 * drawer is the real-oddities shelf now.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
  "Content-Type": "application/x-www-form-urlencoded",
};

beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function buyPaid(url: string): Promise<Record<string, unknown>> {
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const paid = await SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!) },
  });
  expect(paid.status).toBe(200);
  return json(paid);
}

describe("the stocked shelves", () => {
  it("the drawer sells real oddities: the thing plus what it does, describe-only", async () => {
    await SELF.fetch(`${BASE}/admin/stock/the_drawer`, {
      method: "POST",
      headers: adminAuth,
      body: new URLSearchParams({
        item: "one brass hinge, painted over twice",
        does: "Holds doors to their word.",
      }).toString(),
      redirect: "manual",
    });
    const body = await buyPaid(`${BASE}/api/buy/the_drawer`);
    expect(body["status"]).toBe("completed");
    expect(String(body["deliverable"])).toContain("one brass hinge");
    expect(String(body["deliverable"])).toContain("Holds doors to their word.");
    expect(String(body["deliverable"])).not.toContain("photograph");
  });

  it("the jar is gone: scrapped, not sold out", async () => {
    const gone = await SELF.fetch(`${BASE}/api/buy/jar_of_tuesday`);
    expect(gone.status).toBe(404);
  });

  it("names stock in batches, never reuse, and bestow themselves", async () => {
    const bulk = await SELF.fetch(`${BASE}/admin/stock/nomenclature/bulk`, {
      method: "POST",
      headers: adminAuth,
      body: new URLSearchParams({
        batch: "Cornelius Uptime\nCornelius Uptime",
      }).toString(),
      redirect: "manual",
    });
    // Second line collides with the first: uniqueness is machine-enforced.
    expect(bulk.status).toBe(400);
    expect(await bulk.text()).toContain("never reused");

    const body = await buyPaid(`${BASE}/api/buy/nomenclature`);
    expect(body["status"]).toBe("completed");
    expect(String(body["deliverable"])).toContain("Cornelius Uptime");

    // Sold out honestly once the pool empties.
    const bare = await SELF.fetch(`${BASE}/api/buy/nomenclature`);
    expect(bare.status).toBe(409);
  });
});

describe("the retired shelf", () => {
  it("answers a retired id with what happened, not a bare 404", async () => {
    // grudge retired 2026-08-05; grudges already held stay held.
    const gone = await SELF.fetch(`${BASE}/api/buy/grudge`);
    expect(gone.status).toBe(410);
    const body = (await gone.json()) as Record<string, unknown>;
    expect(String(body["error"])).toContain("retired");
    expect(String(body["certificates_note"])).toContain("verify forever");
  });

  it("points a folded item at its successor", async () => {
    const gone = await SELF.fetch(`${BASE}/api/buy/phone_call`);
    expect(gone.status).toBe(410);
    const body = (await gone.json()) as Record<string, unknown>;
    expect(body["folded_into"]).toBe("the_collab");
    expect(String(body["buy_url"])).toContain("/api/buy/the_collab");
  });
});
