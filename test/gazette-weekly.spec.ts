import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assembleDraft,
  getDraft,
  publishEdition,
} from "@/services/gazette-weekly";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * The Gazette's weekly edition press: logbook with manners. Facts
 * only, house never reported, emptiness reported, keeper's pen before
 * print, THE_NINETY gate on auto-assembly.
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

async function payFor(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const challenge = await SELF.fetch(url, { headers });
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  return SELF.fetch(url, {
    headers: {
      ...headers,
      "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!),
    },
  });
}

describe("THE_NINETY gate", () => {
  it("auto-assembly declines a week that earned nothing; hand-set does not", async () => {
    expect(await assembleDraft(testEnv)).toBeNull();
    expect(await getDraft(testEnv)).toBeNull();
    // The keeper's hand-set lever ignores the gate.
    const handSet = await assembleDraft(testEnv, true);
    expect(handSet).not.toBeNull();
    expect(handSet!.markdown).toContain("Bell did not ring.");
    // Clear the desk for the real test below.
    await testEnv.ORDERS.delete("gazette_draft");
  });
});

describe("the edition itself", () => {
  it("reports facts exactly, reports emptiness, never reports the house", async () => {
    const organic = await payFor(`${BASE}/api/buy/small_blessing`);
    expect(organic.status).toBe(200);
    const house = await payFor(`${BASE}/api/buy/dibs`, {
      "X-House": "test-house-secret",
    });
    expect(house.status).toBe(200);
    await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A Passing Reader", message: "Fine paper you have here." }),
    });
    await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letter: "Private words for the keeper.", from_name: "Paper Test" }),
    });
    await SELF.fetch(`${BASE}/api/buy/weather_from_next_thursday`);

    // 3 organic events (settle + signature + letter): the gate opens.
    const draft = await assembleDraft(testEnv);
    expect(draft).not.toBeNull();
    const page = draft!.markdown;

    // Facts, exact.
    expect(page).toContain("1 purchase settled: small_blessing (1)");
    expect(page).toContain("1 new signature");
    expect(page).toContain("A Passing Reader");
    expect(page).toContain("1 letter arrived. Contents remain letters.");
    expect(page).toContain(
      '"weather_from_next_thursday" was asked for once. Store had none.',
    );
    // Every section present; emptiness reported, not skipped.
    expect(page).toContain("## CORRECTIONS");
    expect(page).toContain("The record stands uncorrected.");
    expect(page).toContain("No confession reached the counter.");
    expect(page).toContain("## LOOKING AHEAD");
    expect(page).toContain("Weekly shelves restock Monday.");
    // The house never makes the paper.
    expect(page).not.toContain("dibs");
    // The letter's contents never make anything.
    expect(page).not.toContain("Private words");
  });

  it("publishes onto the Gazette rack through the keeper's pen, slots stripped", async () => {
    const draft = await getDraft(testEnv);
    expect(draft).not.toBeNull();
    const edition = await publishEdition(testEnv, draft!.markdown);
    expect(edition.issue_number).toBe(1);
    expect(edition.markdown).not.toContain("[Weather line");
    expect(edition.markdown).not.toContain("[Mina");
    expect(edition.markdown).not.toContain("[Owen");
    expect(edition.markdown).not.toContain("[Inez");
    expect(edition.markdown).not.toContain("[Keeper");

    // One rack: the free Gazette index lists it; a penny buys it.
    const index = await json(await SELF.fetch(`${BASE}/gazette`));
    const issues = index["issues"] as Array<Record<string, unknown>>;
    expect(issues[0]?.["url"]).toBe(`${BASE}/gazette/issue-1`);
    const copy = await payFor(`${BASE}/gazette/issue-1`);
    expect(copy.status).toBe(200);
    expect(copy.headers.get("Cache-Control")).toBe("no-store");
    const text = await copy.text();
    expect(text).toContain("The Gazette · Edition No. 1");
    expect(text).toContain("small_blessing (1)");
  });

  it("carries a filed correction into the next draft, in register", async () => {
    const filed = await SELF.fetch(`${BASE}/admin/gazette/correction`, {
      method: "POST",
      headers: adminAuth,
      body: new URLSearchParams({
        correction:
          "Edition No. 1 reported the bell rang twelve times. The correct total was eleven. We regret the extra ring.",
      }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(filed.status);
    const draft = await assembleDraft(testEnv, true);
    expect(draft!.markdown).toContain("The correct total was eleven.");
    expect(draft!.markdown).not.toContain("The record stands uncorrected.");
  });
});
