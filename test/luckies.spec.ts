import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createOrder, getOrder } from "@/services/orders";
import { getMenuItem } from "@/store";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { Env } from "@/types";

/**
 * The lucky shelf: cards replace photographs. The keeper picks the
 * object; the card is the record, signed, verifiable, re-inked when
 * a write-in honestly moves the status.
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

async function queueLuckiesOrder(): Promise<string> {
  const item = getMenuItem("luckies");
  if (!item) {
    throw new Error("luckies fell off the shelf");
  }
  const order = await createOrder(testEnv, {
    item,
    paidUsdc: 5,
    tipUsdc: 0,
    patronNumber: 77,
    certId: "cert_testlucky1",
  });
  return order.order_id;
}

async function completeLucky(
  orderId: string,
  fields: Record<string, string>,
): Promise<Response> {
  return SELF.fetch(`${BASE}/admin/orders/${orderId}/complete-lucky`, {
    method: "POST",
    headers: adminAuth,
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

describe("the lucky shelf", () => {
  it("shelf copy: the card is the record, no photograph claimed", async () => {
    const item = getMenuItem("luckies");
    expect(item).toBeDefined();
    expect(item?.description).not.toContain("photograph");
    expect(item?.description).toContain("signed card");
    expect(item?.sample_url).toBe("/luckies/sample.svg");

    const menu = await json(await SELF.fetch(`${BASE}/menu.json`));
    const items = menu["items"] as Array<Record<string, unknown>>;
    const listed = items.find((entry) => entry["id"] === "luckies");
    expect(listed?.["sample_url"]).toBe(`${BASE}/luckies/sample.svg`);
  });

  it("hangs an honest specimen card by the shelf", async () => {
    const response = await SELF.fetch(`${BASE}/luckies/sample.svg`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    const svg = await response.text();
    expect(svg).toContain("SPECIMEN");
    expect(svg).toContain("the specimen");
    // The specimen claims nothing it can't back: no verify link.
    expect(svg).not.toContain("/api/verify/");
  });

  it("picks, cards, and verifies a real lucky", async () => {
    const orderId = await queueLuckiesOrder();
    const completed = await completeLucky(orderId, {
      lucky_name: "the brass washer",
      provenance: "Found heads-up in the gravel lot, kept since.",
      power: "Keeps deploys boring on Fridays.",
      strength: "strong",
    });
    expect([200, 302]).toContain(completed.status);

    const order = await getOrder(testEnv, orderId);
    expect(order?.status).toBe("completed");
    const luckyId = order?.deliverable?.match(/lucky_[a-z0-9]+/)?.[0];
    expect(luckyId).toBeDefined();
    expect(order?.deliverable).toContain(`${BASE}/luckies/${luckyId}.svg`);

    const card = await SELF.fetch(`${BASE}/luckies/${luckyId}.svg`);
    expect(card.status).toBe(200);
    const svg = await card.text();
    expect(svg).toContain("the brass washer");
    expect(svg).toContain("STRONG");
    expect(svg).toContain("IN SERVICE");
    expect(svg).not.toContain("SPECIMEN");

    const record = await json(await SELF.fetch(`${BASE}/api/lucky/${luckyId}`));
    const lucky = record["lucky"] as Record<string, unknown>;
    expect(lucky["name"]).toBe("the brass washer");
    expect(lucky["strength"]).toBe("strong");
    expect(record["card_url"]).toBe(`${BASE}/luckies/${luckyId}.svg`);

    const verified = await json(
      await SELF.fetch(`${BASE}/api/verify/${luckyId}`),
    );
    expect(verified["valid"]).toBe(true);
    expect(String(verified["note"])).toContain("Genuine lucky");
  });

  it("benches for real: re-signed record, re-inked card", async () => {
    const orderId = await queueLuckiesOrder();
    await completeLucky(orderId, {
      lucky_name: "the acorn cap",
      provenance: "Off the porch rail, autumn before last.",
      power: "Settles flaky tests when held nearby.",
      strength: "faint",
    });
    const order = await getOrder(testEnv, orderId);
    const luckyId = order?.deliverable?.match(/lucky_[a-z0-9]+/)?.[0] ?? "";

    const moved = await SELF.fetch(`${BASE}/admin/luckies/move`, {
      method: "POST",
      headers: adminAuth,
      body: new URLSearchParams({
        lucky_id: luckyId,
        status: "benched",
        status_note: "Three write-ins, zero luck. Benched fairly.",
      }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(moved.status);

    const svg = await (await SELF.fetch(`${BASE}/luckies/${luckyId}.svg`)).text();
    expect(svg).toContain("BENCHED");
    expect(svg).toContain("Benched fairly.");

    const verified = await json(
      await SELF.fetch(`${BASE}/api/verify/${luckyId}`),
    );
    expect(verified["valid"]).toBe(true);
    const lucky = verified["lucky"] as Record<string, unknown>;
    expect(lucky["status"]).toBe("benched");
  });

  it("refuses a lucky without its parts", async () => {
    const orderId = await queueLuckiesOrder();
    const response = await completeLucky(orderId, {
      lucky_name: "the unnamed",
      provenance: "Nowhere yet.",
      power: "",
      strength: "strong",
    });
    expect(response.status).toBe(400);
  });

  it("tells the truth about cards that don't exist", async () => {
    const missing = await SELF.fetch(`${BASE}/luckies/lucky_nonexistent.svg`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("No lucky by that id in custody.");

    const record = await SELF.fetch(`${BASE}/api/lucky/lucky_nonexistent`);
    expect(record.status).toBe(404);
  });
});
