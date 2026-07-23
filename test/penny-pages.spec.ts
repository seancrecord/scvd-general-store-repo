import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Env } from "@/types";
import { isRecord } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";

/**
 * The paid side of the v0.2 shelves: penny Almanac pages, the dibs
 * instant item, and the full Trading Post -> Gazette publish flow.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected a JSON object body");
  }
  return body;
}

async function payFor(url: string): Promise<Response> {
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const accepted = required.accepts[0];
  if (!accepted) {
    throw new Error(`No payment option offered for ${url}`);
  }
  return SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
}

const adminAuth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

describe("Almanac penny pages", () => {
  it("challenges with a flat penny and delivers markdown when paid", async () => {
    const url = `${BASE}/almanac/notes-from-a-tuesday-in-oak-city`;
    const challenge = await SELF.fetch(url);
    expect(challenge.status).toBe(402);
    const required = decodePaymentRequired(challenge);
    // $0.01 in USDC atomic units.
    expect(required.accepts.map((accept) => accept.amount)).toEqual(["10000"]);
    const challengeBody = await json(challenge);
    expect(challengeBody["price_usdc"]).toBe(0.01);

    const paid = await payFor(url);
    expect(paid.status).toBe(200);
    expect(paid.headers.get("Content-Type")).toContain("text/markdown");
    expect(paid.headers.get("Cache-Control")).toBe("no-store");
    const page = await paid.text();
    expect(page).toContain("Notes from a Tuesday in Oak City");
    expect(page).toContain("2026-07-07");
  });
});

describe("dibs (fixed, instant)", () => {
  it("sells dibs on the spot with a certificate", async () => {
    const url = `${BASE}/api/buy/dibs`;
    const challenge = await SELF.fetch(url);
    expect(challenge.status).toBe(402);
    const required = decodePaymentRequired(challenge);
    // $2 fixed: exactly one tier.
    expect(required.accepts.map((accept) => accept.amount)).toEqual([
      "2000000",
    ]);

    const paid = await payFor(url);
    expect(paid.status).toBe(200);
    const body = await json(paid);
    expect(body["deliverable"]).toContain("DIBS");
    expect(body["paid_usdc"]).toBe(2);
    expect(typeof body["patron_number"]).toBe("number");
    const cert = body["certificate"] as { cert_id: string };
    const verify = await json(
      await SELF.fetch(`${BASE}/api/verify/${cert.cert_id}`),
    );
    expect(verify["valid"]).toBe(true);
  });
});

describe("the Gazette press (tip -> review -> publish -> penny copy)", () => {
  it("runs the whole flow, credits the contributor, mints their stamp", async () => {
    // A tip arrives.
    const tipResponse = await json(
      await SELF.fetch(`${BASE}/api/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "The bell rings sweeter if you say thank you first.",
          contributor_name: "Bell Scholar",
        }),
      }),
    );
    const tipId = tipResponse["tip_id"] as string;

    // Publishing before approval is refused.
    const premature = await SELF.fetch(`${BASE}/admin/gazette/publish`, {
      method: "POST",
      headers: {
        ...adminAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        title: "Too Soon",
        tip_ids: tipId,
      }).toString(),
      redirect: "manual",
    });
    expect(premature.status).toBe(400);

    // The keeper approves it.
    const approve = await SELF.fetch(`${BASE}/admin/tips/${tipId}/approve`, {
      method: "POST",
      headers: adminAuth,
      redirect: "manual",
    });
    expect([200, 302]).toContain(approve.status);

    // The keeper assembles and publishes issue no. 1.
    const publish = await SELF.fetch(`${BASE}/admin/gazette/publish`, {
      method: "POST",
      headers: {
        ...adminAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        title: "On Bells and Gratitude",
        tip_ids: tipId,
      }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(publish.status);

    // The free index lists it with credit.
    const index = await json(await SELF.fetch(`${BASE}/gazette`));
    const issues = index["issues"] as Array<Record<string, unknown>>;
    expect(issues.length).toBe(1);
    expect(issues[0]?.["title"]).toBe("On Bells and Gratitude");
    expect(issues[0]?.["contributors"]).toEqual(["Bell Scholar"]);

    // The index points at the prefixed path — never a bare id.
    expect(issues[0]?.["url"]).toBe(`${BASE}/gazette/issue-1`);

    // A copy costs a penny and carries the credit.
    const copy = await payFor(`${BASE}/gazette/issue-1`);
    expect(copy.status).toBe(200);
    const markdown = await copy.text();
    expect(markdown).toContain("On Bells and Gratitude");
    expect(markdown).toContain("Bell Scholar");
    expect(markdown).toContain("read and approved by a human");

    // The contributor got a contributor-variant stamp, and it verifies.
    const stamps = await testEnv.PATRONS.list({ prefix: "stamp:" });
    expect(stamps.keys.length).toBe(1);
    const stampKey = stamps.keys[0]?.name ?? "";
    const stampId = stampKey.replace("stamp:", "");
    const verify = await json(
      await SELF.fetch(`${BASE}/api/verify/${stampId}`),
    );
    expect(verify["valid"]).toBe(true);
    const stamp = verify["stamp"] as Record<string, unknown>;
    expect(stamp["variant"]).toBe("contributor");
    expect(stamp["name"]).toBe("Bell Scholar");
  });
});

describe("the retired-words registry, back-room side", () => {
  it("records a retirement and shows it on the public registry", async () => {
    const add = await SELF.fetch(`${BASE}/admin/retired-words/add`, {
      method: "POST",
      headers: {
        ...adminAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        word: "synergy",
        epitaph: "It never meant anything and now it never will.",
        patron_number: "7",
      }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(add.status);

    const registry = await json(await SELF.fetch(`${BASE}/retired-words`));
    const words = registry["retired_words"] as Array<Record<string, unknown>>;
    expect(words.length).toBe(1);
    expect(words[0]?.["word"]).toBe("synergy");
    expect(words[0]?.["patron_number"]).toBe(7);
  });
});
