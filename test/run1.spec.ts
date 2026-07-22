import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { readMonthLedger, listPayers } from "@/lib/metrics";
import { renderPatronBadge } from "@/services/badge-svg";
import { replyToLetter } from "@/services/letters";
import { seasonEntry, signForAddress } from "@/services/zodiac";
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

  it("assigns a sign for life and a page for the week", async () => {
    const address = "0x137aE5e3c7ed176744226F67223de50CA3A19e5A";
    const first = await json(await SELF.fetch(`${BASE}/zodiac/${address}`));
    const second = await json(await SELF.fetch(`${BASE}/zodiac/${address}`));
    expect(first["sign"]).toBe(second["sign"]);
    expect(first["forecast"]).toBe(second["forecast"]);
    // Case-insensitive: the address is the identity, not its spelling.
    const sign = signForAddress(address);
    expect(signForAddress(address.toLowerCase()).id).toBe(sign.id);
    // The page is a pure (sign, week) lookup.
    expect(seasonEntry(sign.id, 1)).toEqual(seasonEntry(sign.id, 1));
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

  it("phantom_check schedules the walk, then signs what it saw", async () => {
    const paid = await payFor(
      `${BASE}/api/buy/phantom_check?url=https://phantom.example.net/door`,
    );
    expect(paid.status).toBe(200);
    const body = await json(paid);
    const checkId = String(body["check_id"]);
    const pickupUrl = String(body["pickup_url"]);
    expect(String(body["deliverable"])).toContain("walk past");

    // Before the hour comes: still scheduled, nothing observed.
    const early = await json(await SELF.fetch(pickupUrl));
    expect(early["status"]).toBe("scheduled");

    // Six hours pass (the ledger's clock is ours to wind in tests).
    const key = `phantom:${checkId}`;
    const record = (await testEnv.ORDERS.get(key, "json")) as Record<
      string,
      unknown
    >;
    record["due_at"] = new Date(Date.now() - 1000).toISOString();
    await testEnv.ORDERS.put(key, JSON.stringify(record));

    // The pickup resolves a due check on read. The test fetch mock
    // rejects unknown hosts — the unreachable case, which is a finding.
    const late = await json(await SELF.fetch(pickupUrl));
    expect(late["status"]).toBe("observed");
    const observation = late["observation"] as Record<string, unknown>;
    expect(observation["reachable"]).toBe(false);
    expect(late["signature"]).toBeTruthy();
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

describe("the Mailbox", () => {
  it("takes a letter, keeps it private, and enforces one a day", async () => {
    const post = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        letter: "Dear keeper: the fog was right about the second coffee.",
        from_name: "Correspondent One",
      }),
    });
    expect(post.status).toBe(201);
    const body = await json(post);
    expect(String(body["message"])).toContain("Letter's in the box");
    const pickupUrl = String(body["pickup_url"]);

    // The pickup shows status only — the letter itself never comes back out.
    const pickup = await json(await SELF.fetch(pickupUrl));
    expect(pickup["status"]).toBe("received");
    expect(JSON.stringify(pickup)).not.toContain("second coffee");

    // One a day per correspondent.
    const again = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        letter: "P.S. I forgot to mention the train.",
        from_name: "Correspondent One",
      }),
    });
    expect(again.status).toBe(429);
  });

  it("serves the keeper's signed reply and counts on the storefront", async () => {
    const post = await json(
      await SELF.fetch(`${BASE}/api/letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter: "Is the drawer ever empty?",
          from_name: "Correspondent Two",
        }),
      }),
    );
    const letterId = String(post["letter_id"]);
    const replied = await replyToLetter(
      testEnv,
      letterId,
      "The drawer is never empty. It is occasionally shy.",
    );
    expect(replied?.status).toBe("replied");

    const pickup = await json(
      await SELF.fetch(`${BASE}/api/letter/${letterId}`),
    );
    expect(pickup["status"]).toBe("replied");
    expect(String(pickup["reply"])).toContain("occasionally shy");
    expect(pickup["reply_signature"]).toBeTruthy();

    // The storefront shows the counter and nothing else.
    const storefront = await (await SELF.fetch(`${BASE}/`)).text();
    expect(storefront).toContain("Mailbox:");
    expect(storefront).not.toContain("Is the drawer ever empty?");
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
    // Test-suite traffic carries no referrer or UA, so it lands unknown.
    expect(ledger.channels["unknown"]).toBeGreaterThanOrEqual(1);

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
