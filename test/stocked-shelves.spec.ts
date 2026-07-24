import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { stockUnit } from "@/services/stock";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * The fulfillment restructure, Class 1 and 2: stocked shelves fulfill
 * themselves from keeper-made units; the grudge register holds
 * instantly. a_secret stays manual by the keeper's ruling.
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
  it("the drawer gives what it gives, describe-only, no keeper present", async () => {
    await SELF.fetch(`${BASE}/admin/stock/the_drawer`, {
      method: "POST",
      headers: adminAuth,
      body: new URLSearchParams({
        description: "one brass hinge, painted over twice",
      }).toString(),
      redirect: "manual",
    });
    const body = await buyPaid(`${BASE}/api/buy/the_drawer`);
    expect(body["status"]).toBe("completed");
    expect(String(body["deliverable"])).toContain("one brass hinge");
    expect(String(body["deliverable"])).not.toContain("photograph");
  });

  it("jars stock on Tuesdays only, machine-enforced", async () => {
    const wednesday = new Date("2026-07-22T12:00:00Z"); // a Wednesday
    const refused = await stockUnit(
      testEnv,
      "jar_of_tuesday",
      { sealed_date: "2026-07-21" },
      wednesday,
    );
    expect("refused" in refused && refused.refused).toContain("Tuesdays");

    const tuesday = new Date("2026-07-21T12:00:00Z"); // a Tuesday
    const stocked = await stockUnit(
      testEnv,
      "jar_of_tuesday",
      { sealed_date: "2026-07-21" },
      tuesday,
    );
    expect("stocked" in stocked).toBe(true);

    const body = await buyPaid(`${BASE}/api/buy/jar_of_tuesday`);
    expect(body["status"]).toBe("completed");
    expect(String(body["deliverable"])).toContain("sealed 2026-07-21");
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

describe("the grudge register", () => {
  it("holds instantly, names the grievance, refuses nothing-named", async () => {
    const missing = await SELF.fetch(`${BASE}/api/buy/grudge`);
    expect(missing.status).toBe(400);

    const grievance = "A rate limit with no Retry-After header.";
    const body = await buyPaid(
      `${BASE}/api/buy/grudge?grievance=${encodeURIComponent(grievance)}`,
    );
    expect(String(body["deliverable"])).toContain(grievance);
    expect(String(body["deliverable"])).toContain("Sundays");

    // The register shows at the counter for Sunday reading.
    const counter = await SELF.fetch(`${BASE}/admin/counter`, {
      headers: { Authorization: adminAuth.Authorization },
    });
    const html = await counter.text();
    expect(html).toContain("Retry-After");
  });
});
