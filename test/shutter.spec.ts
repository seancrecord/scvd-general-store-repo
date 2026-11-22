import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * The shutter is the keeper's lever and nothing else (keeper's ruling
 * 2026-11-22). From 2026-07-25 it was a 48h presence window that also
 * closed itself, which on 2026-11-20 shut two doors while the keeper
 * was working elsewhere in the back room. Now only the lever closes
 * the human-labor shelf; machine shelves, stocked shelves, and the
 * preset lucky draw never close.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
  "Content-Type": "application/x-www-form-urlencoded",
};

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
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

async function buyPaid(url: string): Promise<Response> {
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  return SELF.fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!),
    },
  });
}

describe("the shutter", () => {
  it("stays open with no visit on record: no timer closes it", async () => {
    await testEnv.COUNTERS.delete("keeper_last_seen");
    await testEnv.COUNTERS.delete("shutter_override");
    const open = await SELF.fetch(`${BASE}/api/buy/the_collab`);
    expect(open.status).toBe(402);
  });

  it("refuses human labor before money moves; machine shelves never close", async () => {
    await throwShutter("closed");

    const humanItem = await SELF.fetch(`${BASE}/api/buy/the_collab`);
    expect(humanItem.status).toBe(503);
    const refusal = await json(humanItem);
    expect(String(refusal["error"])).toContain("keeper is away");
    expect(String(refusal["error"])).toContain("machine shelves never close");

    // Instant items sell straight through the closed shutter.
    const paidDibs = await buyPaid(`${BASE}/api/buy/small_blessing`);
    expect(paidDibs.status).toBe(200);

    // The menu says so, honestly.
    const menu = await json(await SELF.fetch(`${BASE}/menu.json`));
    const store = menu["store"] as Record<string, unknown>;
    expect(String(store["human_shelf"])).toContain("shuttered");

    await throwShutter("open");
    const reopened = await SELF.fetch(`${BASE}/api/buy/the_collab`);
    expect(reopened.status).toBe(402);
  });

  it("luckies draw through a closed shutter and never sell out", async () => {
    await throwShutter("closed");

    const paid = await buyPaid(`${BASE}/api/buy/luckies`);
    expect(paid.status).toBe(200);
    const body = await json(paid);
    expect(String(body["deliverable"])).toContain("Drawn from the herd");

    await throwShutter("open");
  });

  it("stays open long after the last visit; only the lever closes it", async () => {
    await testEnv.COUNTERS.delete("shutter_override");
    // Last seen thirty days ago: the old 48h window would have shut.
    const staleDate = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    await testEnv.COUNTERS.put("keeper_last_seen", staleDate);
    expect((await SELF.fetch(`${BASE}/api/buy/the_collab`)).status).toBe(402);
    expect((await SELF.fetch(`${BASE}/api/buy/aura_walk`)).status).toBe(402);

    await throwShutter("closed");
    expect((await SELF.fetch(`${BASE}/api/buy/the_collab`)).status).toBe(503);
    await throwShutter("open");
    expect((await SELF.fetch(`${BASE}/api/buy/the_collab`)).status).toBe(402);
  });
});
