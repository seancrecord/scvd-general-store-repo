import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createOrder } from "@/services/orders";
import { createLucky } from "@/services/luckies";
import { getMenuItem } from "@/store";
import { HERD, HERD_PROVENANCE, LUCKY_NOTES } from "@/store/luckies";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * The lucky shelf, preset since the keeper's ruling 2026-07-25: the
 * store draws from the herd at purchase (animal, lucky note, uneven
 * strength), never sells out, and the keeper does nothing. The card
 * is still the record: signed, verifiable, re-inked when a write-in
 * honestly moves the status. The manual carding path stays for
 * orders queued before the ruling.
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

  it("draws from the herd instantly and never sells out", async () => {
    const url = `${BASE}/api/buy/luckies`;
    const buyOnce = async (): Promise<Record<string, unknown>> => {
      const challenge = await SELF.fetch(url);
      expect(challenge.status).toBe(402);
      const required = decodePaymentRequired(challenge);
      const paid = await SELF.fetch(url, {
        headers: {
          "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!),
        },
      });
      expect(paid.status).toBe(200);
      return json(paid);
    };

    const body = await buyOnce();
    // Instant: no order, no queue, the lucky rides the response.
    expect(body["order_id"]).toBeUndefined();
    expect(String(body["deliverable"])).toContain("Drawn from the herd");

    const record = await json(
      await SELF.fetch(String(body["record_url"])),
    );
    const lucky = record["lucky"] as Record<string, unknown>;
    // The draw is preset: species name only, herd provenance, a note
    // from the pool, a strength off the honest scale.
    expect(HERD).toContain(lucky["name"]);
    expect(lucky["provenance"]).toBe(HERD_PROVENANCE);
    expect(LUCKY_NOTES).toContain(lucky["power"]);
    expect(["strong", "solid", "still proving itself"]).toContain(
      lucky["strength"],
    );
    expect(lucky["order_id"]).toBe("instant");

    const card = await SELF.fetch(String(body["card_url"]));
    expect(card.status).toBe(200);
    expect(await card.text()).toContain(String(lucky["name"]));

    const verified = await json(
      await SELF.fetch(`${BASE}/api/verify/${String(body["lucky_id"])}`),
    );
    expect(verified["valid"]).toBe(true);

    // Never sold out: the second draw works too. The herd holds.
    const again = await buyOnce();
    expect(again["lucky_id"]).not.toBe(body["lucky_id"]);
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

  it("hand-carding is retired: the custom-lucky door is gone", async () => {
    // 2026-08-05, keeper's ruling: the herd is preset and draws at
    // purchase; the legacy hand-carding path was standing maintenance
    // for a flow that no longer exists.
    const orderId = await queueLuckiesOrder();
    const response = await completeLucky(orderId, {
      lucky_name: "the brass washer",
      provenance: "Found heads-up in the gravel lot, kept since.",
      power: "Keeps deploys boring on Fridays.",
      strength: "strong",
    });
    expect(response.status).toBe(404);
  });

  it("benches for real: re-signed record, re-inked card", async () => {
    const record = await createLucky(testEnv, {
      name: "the acorn cap",
      provenance: "Off the porch rail, autumn before last.",
      power: "Settles flaky tests when held nearby.",
      strength: "still proving itself",
      orderId: "instant",
      certId: "cert_testlucky2",
      patronNumber: 78,
    });
    const luckyId = record.lucky.lucky_id;

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

  it("tells the truth about cards that don't exist", async () => {
    const missing = await SELF.fetch(`${BASE}/luckies/lucky_nonexistent.svg`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("No lucky by that id in custody.");

    const record = await SELF.fetch(`${BASE}/api/lucky/lucky_nonexistent`);
    expect(record.status).toBe(404);
  });
});
