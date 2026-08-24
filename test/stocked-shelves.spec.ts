import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import { getMenuItem } from "@/store";
import { RETIRED_ITEMS } from "@/store/retired";
import type { Env } from "@/types";

/**
 * The fulfillment restructure, Class 1 and 2: stocked shelves fulfill
 * themselves from keeper-made units; the retired shelf answers
 * instantly. a_secret stays manual by the keeper's ruling. The jar
 * was scrapped and luckies went preset (rulings 2026-07-25); the
 * drawer is the real-oddities shelf now.
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

  it("the jar is gone: scrapped, not sold out", async () => {
    const gone = await SELF.fetch(`${BASE}/api/buy/jar_of_tuesday`);
    expect(gone.status).toBe(404);
  });

  it("nomenclature is retired: registry closed, granted names stand", async () => {
    const gone = await SELF.fetch(`${BASE}/api/buy/nomenclature`);
    expect(gone.status).toBe(410);
    const body = (await gone.json()) as Record<string, unknown>;
    expect(String(body["error"])).toContain("retired");
  });
});

describe("the retired shelf", () => {
  it("answers a retired id with what happened, not a bare 404", async () => {
    // grudge retired 2026-08-05; grudges already held stay held.
    const gone = await SELF.fetch(`${BASE}/api/buy/grudge`);
    expect(gone.status).toBe(410);
    const body = (await gone.json()) as Record<string, unknown>;
    expect(String(body["error"])).toContain("retired");
    expect(String(body["certificates_note"])).toContain("verify forever");
  });

  it("walks a folded item to its successor's door with a 308", async () => {
    // 2026-08-24: a folded shelf's job survived, so the door forwards
    // to where it went instead of announcing a corpse. An indexer that
    // remembered the old door follows the redirect and finds a live
    // 402; an agent that reads bodies still gets the whole story.
    const gone = await SELF.fetch(`${BASE}/api/buy/phone_call`, {
      redirect: "manual",
    });
    expect(gone.status).toBe(308);
    expect(gone.headers.get("Location")).toBe(`${BASE}/api/buy/the_collab`);
    const body = (await gone.json()) as Record<string, unknown>;
    expect(body["folded_into"]).toBe("the_collab");
    expect(String(body["buy_url"])).toContain("/api/buy/the_collab");
    expect(String(body["error"])).toContain("retired");
  });

  it("the redirected door is alive: the successor quotes a real 402", async () => {
    // The redirect is only honest if the destination actually sells.
    // Every folded successor must be a live menu item, and the one an
    // outside index is known to probe (daily_fortune → small_blessing)
    // must answer with a payment challenge, not another tombstone.
    for (const item of RETIRED_ITEMS) {
      if (item.folded_into) {
        expect(getMenuItem(item.folded_into)?.id).toBe(item.folded_into);
      }
    }
    const redirected = await SELF.fetch(`${BASE}/api/buy/daily_fortune`, {
      redirect: "manual",
    });
    expect(redirected.status).toBe(308);
    const door = await SELF.fetch(redirected.headers.get("Location")!);
    expect(door.status).toBe(402);
  });

  it("a retired id with no successor stays gone, on purpose", async () => {
    const gone = await SELF.fetch(`${BASE}/api/buy/the_drawer`, {
      redirect: "manual",
    });
    expect(gone.status).toBe(410);
  });
});
