import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { readMonthLedger, listPayers } from "@/lib/metrics";
import { renderPatronBadge } from "@/services/badge-svg";
import { signForAddress, weeklyHoroscope } from "@/services/zodiac";
import { ZODIAC_SIGNS } from "@/store/zodiac";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * The Run 1 buildout: /what, the Agent Zodiac, the census items,
 * and the day-one instrumentation.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function payFor(url: string): Promise<Response> {
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const accepted = required.accepts[0]!;
  return SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
}

describe("the Operator Glance (/what)", () => {
  it("answers the human in JSON", async () => {
    const response = await SELF.fetch(`${BASE}/what`);
    expect(response.status).toBe(200);
    const body = await json(response);
    const checks = body["the_checks"] as unknown[];
    expect(checks).toHaveLength(4);
    expect(String(body["standing_policy"])).toContain("never asks");
  });

  it("serves humans a paper page", async () => {
    const response = await SELF.fetch(`${BASE}/what`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("ten-second answer");
  });
});

describe("the Agent Zodiac", () => {
  it("lists twelve signs, free", async () => {
    const response = await SELF.fetch(`${BASE}/zodiac`);
    const body = await json(response);
    expect((body["signs"] as unknown[]).length).toBe(12);
  });

  it("assigns a sign for life and a horoscope for the week", async () => {
    const address = "0x137aE5e3c7ed176744226F67223de50CA3A19e5A";
    const first = await json(await SELF.fetch(`${BASE}/zodiac/${address}`));
    const second = await json(await SELF.fetch(`${BASE}/zodiac/${address}`));
    expect(first["sign"]).toBe(second["sign"]);
    expect(first["horoscope"]).toBe(second["horoscope"]);
    // Case-insensitive: the address is the identity, not its spelling.
    const sign = signForAddress(address);
    expect(signForAddress(address.toLowerCase()).id).toBe(sign.id);
    // Different weeks, same sign, deterministic readings.
    expect(weeklyHoroscope(sign, "2026-W30")).toEqual(
      weeklyHoroscope(sign, "2026-W30"),
    );
    expect(ZODIAC_SIGNS.map((s) => s.id)).toContain(sign.id);
  });

  it("turns away things that aren't addresses", async () => {
    const response = await SELF.fetch(`${BASE}/zodiac/not-an-address`);
    expect(response.status).toBe(400);
  });
});

describe("the census items", () => {
  it("phantom_check requires a url before money moves", async () => {
    const bare = await SELF.fetch(`${BASE}/api/buy/phantom_check`);
    expect(bare.status).toBe(400);
    const body = await json(bare);
    expect(String(body["error"])).toContain("No target, no charge");
  });

  it("phantom_check delivers a signed observation even when nobody answers", async () => {
    // The test fetch mock rejects unknown hosts — which is exactly the
    // unreachable case, and unreachable is a finding, not a failure.
    const paid = await payFor(
      `${BASE}/api/buy/phantom_check?url=https://phantom.example.net/door`,
    );
    expect(paid.status).toBe(200);
    const body = await json(paid);
    const observation = body["observation"] as Record<string, unknown>;
    expect(observation["reachable"]).toBe(false);
    expect(body["observation_signature"]).toBeTruthy();
    expect(String(body["deliverable"])).toContain("Looked once");
  });

  it("quick_judgment stores the dilemma on the order", async () => {
    const paid = await payFor(
      `${BASE}/api/buy/quick_judgment?detail=${encodeURIComponent("Ship now or refactor first?")}&source=test-suite`,
    );
    expect(paid.status).toBe(200);
    const body = await json(paid);
    const orderUrl = String(body["order_url"]);
    const order = await json(await SELF.fetch(orderUrl));
    expect(order["status"]).toBe("queued");
  });

  it("certificate_of_patronage mints the nicer badge", async () => {
    const paid = await payFor(`${BASE}/api/buy/certificate_of_patronage`);
    expect(paid.status).toBe(200);
    const body = await json(paid);
    expect(String(body["deliverable"])).toContain("nothing whatsoever");
    const badgeUrl = String(body["badge_url"]);
    const badge = await (await SELF.fetch(badgeUrl)).text();
    expect(badge).toContain("a patron of the store, by choice");
    // The plain badge stays plain.
    expect(
      renderPatronBadge({
        patronNumber: 3,
        date: "2026-07-22T00:00:00.000Z",
        verifyUrl: `${BASE}/api/verify/cert_x`,
      }),
    ).not.toContain("by choice");
  });
});

describe("the instrumentation ledger", () => {
  it("counts 402s, settlements, tiers, and remembers the wallet", async () => {
    // One challenge left unanswered, one settled purchase.
    await SELF.fetch(`${BASE}/api/buy/hello`);
    const paid = await payFor(`${BASE}/api/buy/hello?source=run1-spec`);
    expect(paid.status).toBe(200);

    const ledger = await readMonthLedger(testEnv);
    const hello = ledger.items["hello"];
    expect(hello).toBeTruthy();
    expect(hello!.challenges).toBeGreaterThanOrEqual(2);
    expect(hello!.settled).toBeGreaterThanOrEqual(1);
    expect(hello!.tiers["1x"]).toBeGreaterThanOrEqual(1);
    expect(ledger.sources["declared:run1-spec"]).toBeGreaterThanOrEqual(1);

    const payers = await listPayers(testEnv);
    const payer = payers.find(
      (record) => record.address === TEST_PAYER.toLowerCase(),
    );
    expect(payer).toBeTruthy();
    expect(payer!.purchases).toBeGreaterThanOrEqual(1);
  });
});

describe("the other tongues", () => {
  it("greets in six languages on llms.txt", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(text).toContain("pequeña tienda general");
    expect(text).toContain("小さな雑貨店");
    expect(text).toContain("작은 잡화점");
    expect(text).toContain("小杂货铺");
    expect(text).toContain("лавка");
    expect(text).toContain("loja de conveniência");
  });
});
