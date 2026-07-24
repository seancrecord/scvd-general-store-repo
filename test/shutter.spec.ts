import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * The shutter: the store never promises labor nobody is there to do.
 * Manual lever + the 14-day dead-man rule; machine shelves and
 * stocked luckies never close.
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

async function throwShutter(state: "closed" | "open"): Promise<void> {
  await SELF.fetch(`${BASE}/admin/shutter`, {
    method: "POST",
    headers: adminAuth,
    body: new URLSearchParams({ state }).toString(),
    redirect: "manual",
  });
}

describe("the shutter", () => {
  it("refuses human labor before money moves; machine shelves never close", async () => {
    await throwShutter("closed");

    const humanItem = await SELF.fetch(`${BASE}/api/buy/portrait`);
    expect(humanItem.status).toBe(503);
    const refusal = await json(humanItem);
    expect(String(refusal["error"])).toContain("keeper is away");
    expect(String(refusal["error"])).toContain("machine shelves never close");

    // Instant items sell straight through the closed shutter.
    const challenge = await SELF.fetch(`${BASE}/api/buy/dibs`);
    expect(challenge.status).toBe(402);
    const paid = await SELF.fetch(`${BASE}/api/buy/dibs`, {
      headers: {
        "PAYMENT-SIGNATURE": buildPaymentSignature(
          decodePaymentRequired(challenge).accepts[0]!,
        ),
      },
    });
    expect(paid.status).toBe(200);

    // The menu says so, honestly.
    const menu = await json(await SELF.fetch(`${BASE}/menu.json`));
    const store = menu["store"] as Record<string, unknown>;
    expect(String(store["human_shelf"])).toContain("shuttered");

    await throwShutter("open");
    const reopened = await SELF.fetch(`${BASE}/api/buy/portrait`);
    expect(reopened.status).toBe(402);
  });

  it("stocked luckies sell through a closed shutter; a bare shelf doesn't", async () => {
    await throwShutter("closed");

    // Bare shelf: luckies would need the keeper's hands, so refuse.
    const bare = await SELF.fetch(`${BASE}/api/buy/luckies`);
    expect(bare.status).toBe(503);

    // Stock one; the shelf fulfills itself, keeper not required.
    await SELF.fetch(`${BASE}/admin/luckies/stock`, {
      method: "POST",
      headers: adminAuth,
      body: new URLSearchParams({
        lucky_name: "the shutter key",
        provenance: "Cut for a door this store never installed.",
        power: "Opens nothing; reminds you the store stays honest while away.",
        strength: "fair",
      }).toString(),
      redirect: "manual",
    });
    const challenge = await SELF.fetch(`${BASE}/api/buy/luckies`);
    expect(challenge.status).toBe(402);
    const paid = await SELF.fetch(`${BASE}/api/buy/luckies`, {
      headers: {
        "PAYMENT-SIGNATURE": buildPaymentSignature(
          decodePaymentRequired(challenge).accepts[0]!,
        ),
      },
    });
    const body = await json(paid);
    expect(body["status"]).toBe("completed");

    await throwShutter("open");
  });

  it("dead-man rule: an unvisited counter shutters by itself; a visit reopens", async () => {
    // Wind the clock: last seen 15 days ago.
    const staleDate = new Date(Date.now() - 15 * 86400 * 1000).toISOString();
    await testEnv.COUNTERS.put("keeper_last_seen", staleDate);

    const refused = await SELF.fetch(`${BASE}/api/buy/portrait`);
    expect(refused.status).toBe(503);

    // Opening the counter is proof of presence; the shelf reopens.
    await SELF.fetch(`${BASE}/admin/counter`, {
      headers: { Authorization: adminAuth.Authorization },
    });
    const reopened = await SELF.fetch(`${BASE}/api/buy/portrait`);
    expect(reopened.status).toBe(402);
  });
});
