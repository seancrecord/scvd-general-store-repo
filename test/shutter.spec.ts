import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * The shutter as a presence window (keeper's ruling 2026-07-25): the
 * human-labor shelf only sells within 48h of the keeper being seen at
 * the counter, and it starts CLOSED — no visit on record, no sale.
 * The lever still closes it early; machine shelves, stocked shelves,
 * and the preset lucky draw never close.
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
  it("starts closed: no visit on record means no human-labor sale", async () => {
    // Fresh KV, nobody seen at the counter yet.
    await testEnv.COUNTERS.delete("keeper_last_seen");
    await testEnv.COUNTERS.delete("shutter_override");
    const refused = await SELF.fetch(`${BASE}/api/buy/portrait`);
    expect(refused.status).toBe(503);
    expect(String((await json(refused))["error"])).toContain("keeper is away");
  });

  it("refuses human labor before money moves; machine shelves never close", async () => {
    await throwShutter("closed");

    const humanItem = await SELF.fetch(`${BASE}/api/buy/portrait`);
    expect(humanItem.status).toBe(503);
    const refusal = await json(humanItem);
    expect(String(refusal["error"])).toContain("keeper is away");
    expect(String(refusal["error"])).toContain("machine shelves never close");

    // Instant items sell straight through the closed shutter.
    const paidDibs = await buyPaid(`${BASE}/api/buy/dibs`);
    expect(paidDibs.status).toBe(200);

    // The menu says so, honestly.
    const menu = await json(await SELF.fetch(`${BASE}/menu.json`));
    const store = menu["store"] as Record<string, unknown>;
    expect(String(store["human_shelf"])).toContain("shuttered");

    await throwShutter("open");
    const reopened = await SELF.fetch(`${BASE}/api/buy/portrait`);
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

  it("presence window: the shelf closes 48h after the last visit; a visit reopens", async () => {
    // Wind the clock: last seen 3 days ago, well past the 48h window.
    const staleDate = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
    await testEnv.COUNTERS.put("keeper_last_seen", staleDate);

    const refused = await SELF.fetch(`${BASE}/api/buy/portrait`);
    expect(refused.status).toBe(503);

    // Opening the counter is proof of presence; the window restarts.
    const counter = await SELF.fetch(`${BASE}/admin/counter`, {
      headers: { Authorization: adminAuth.Authorization },
    });
    expect(counter.status).toBe(200);
    const reopened = await SELF.fetch(`${BASE}/api/buy/portrait`);
    expect(reopened.status).toBe(402);
  });
});
