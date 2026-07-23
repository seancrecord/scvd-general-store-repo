import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { renderPatronBadge } from "@/services/badge-svg";
import type { Env } from "@/types";
import { isRecord } from "@/types";
import {
  installFacilitatorMock,
  type FacilitatorMockState,
} from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";

/**
 * Prompt C: Bazaar discovery, replay guard, Penny Shelf, utility items,
 * discovery surfaces, and the house tradition.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

let facilitator: FacilitatorMockState;

beforeAll(() => {
  facilitator = installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected a JSON object body");
  }
  return body;
}

async function payFor(url: string, tierIndex = 0): Promise<Response> {
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const accepted = required.accepts[tierIndex];
  if (!accepted) {
    throw new Error(`No tier ${tierIndex} offered for ${url}`);
  }
  return SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
}

const adminAuth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

describe("Bazaar discovery (extensions.bazaar)", () => {
  it("declares discovery metadata on buy-route 402 challenges", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(challenge.status).toBe(402);
    const required = decodePaymentRequired(challenge);
    expect(required.resource.url).toBe(`${BASE}/api/buy/hello`);

    const bazaar = required.extensions?.["bazaar"] as Record<string, unknown>;
    expect(bazaar).toBeTruthy();
    const info = bazaar["info"] as Record<string, unknown>;
    const input = info["input"] as Record<string, unknown>;
    // Enriched with the live method by the server extension.
    expect(input["method"]).toBe("GET");
    expect(input["type"]).toBe("http");
    const output = info["output"] as Record<string, unknown>;
    expect(output["example"]).toBeTruthy();
  });

  it("requires the summary parameter in context_anchor's schema", async () => {
    const challenge = await SELF.fetch(
      `${BASE}/api/buy/context_anchor?summary=state`,
    );
    const required = decodePaymentRequired(challenge);
    const bazaar = required.extensions?.["bazaar"] as Record<string, unknown>;
    expect(JSON.stringify(bazaar)).toContain('"summary"');
  });

  it("surfaces facilitator EXTENSION-RESPONSES in the admin books", async () => {
    const paid = await payFor(`${BASE}/api/buy/hello`);
    expect(paid.status).toBe(200);

    const admin = await SELF.fetch(`${BASE}/admin/books`, {
      headers: adminAuth,
    });
    const html = await admin.text();
    expect(html).toContain("Bazaar ledger");
    expect(html).toContain("bazaar: accepted");
    expect(html).toContain("/api/buy/hello");
  });
});

describe("replay guard", () => {
  it("refuses a payment nonce that already settled", async () => {
    const url = `${BASE}/api/buy/hello`;
    const challenge = await SELF.fetch(url);
    const required = decodePaymentRequired(challenge);
    const accepted = required.accepts[0];
    if (!accepted) {
      throw new Error("No payment option offered");
    }
    const nonce = `0x${"ee".repeat(32)}`;
    const header = buildPaymentSignature(accepted, nonce);

    const first = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(first.status).toBe(200);

    const patronsBefore = await testEnv.COUNTERS.get("patron_number");
    const replay = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(replay.status).toBe(402);
    const body = await json(replay);
    expect(body["error"]).toContain("once already");
    expect(await testEnv.COUNTERS.get("patron_number")).toBe(patronsBefore);
  });
});

describe("the Penny Shelf", () => {
  it("sells a half-cent blessing, never the same slip twice in a row", async () => {
    const first = await payFor(`${BASE}/api/buy/small_blessing`);
    expect(first.status).toBe(200);
    const firstBody = await json(first);
    expect(typeof firstBody["deliverable"]).toBe("string");
    expect(firstBody["paid_usdc"]).toBe(0.005);
    expect(typeof firstBody["patron_number"]).toBe("number");

    const second = await payFor(`${BASE}/api/buy/small_blessing`);
    const secondBody = await json(second);
    expect(secondBody["deliverable"]).not.toBe(firstBody["deliverable"]);
  });

  it("offers half a cent in atomic units on the 402", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
    const required = decodePaymentRequired(challenge);
    expect(required.accepts.map((accept) => accept.amount)).toEqual(["5000"]);
  });

  it("serves the same fortune to everyone all day", async () => {
    const first = await json(await payFor(`${BASE}/api/buy/daily_fortune`));
    const second = await json(await payFor(`${BASE}/api/buy/daily_fortune`));
    expect(first["deliverable"]).toBe(second["deliverable"]);
    expect(first["fortune_date"]).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("context_anchor", () => {
  it("turns away an anchor with no summary before any money moves", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/context_anchor`);
    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body["error"]).toContain("summary");
  });

  it("signs, stores, and reads back a state summary", async () => {
    const summary = "I am test-agent; resume the ledger audit at step 3.";
    const paid = await payFor(
      `${BASE}/api/buy/context_anchor?summary=${encodeURIComponent(summary)}&agent_name=test-agent`,
    );
    expect(paid.status).toBe(200);
    const body = await json(paid);
    const anchorUrl = body["anchor_url"] as string;
    expect(anchorUrl).toContain("/api/anchor/anchor_");

    const readBack = await json(await SELF.fetch(anchorUrl));
    expect(readBack["valid"]).toBe(true);
    const anchor = readBack["anchor"] as Record<string, unknown>;
    expect(anchor["summary"]).toBe(summary);
    expect(anchor["agent_name"]).toBe("test-agent");

    // /api/verify knows anchors too.
    const anchorId = body["anchor_id"] as string;
    const verify = await json(await SELF.fetch(`${BASE}/api/verify/${anchorId}`));
    expect(verify["valid"]).toBe(true);
  });
});

describe("recurring_patronage", () => {
  it("opens a 30-day pass and renews it by pass_id", async () => {
    const opened = await json(await payFor(`${BASE}/api/buy/recurring_patronage`));
    const passId = opened["pass_id"] as string;
    const firstExpiry = opened["expires_at"] as string;
    expect(opened["renewed"]).toBe(false);

    const passPage = await json(
      await SELF.fetch(`${BASE}/api/patronage/${passId}`),
    );
    expect(passPage["current"]).toBe(true);
    const monthly = passPage["monthly_note"] as Record<string, unknown>;
    expect(typeof monthly["note"]).toBe("string");
    expect(typeof monthly["signature"]).toBe("string");

    const renewed = await json(
      await payFor(`${BASE}/api/buy/recurring_patronage?pass_id=${passId}`),
    );
    expect(renewed["renewed"]).toBe(true);
    expect(renewed["pass_id"]).toBe(passId);
    expect(
      Date.parse(renewed["expires_at"] as string),
    ).toBeGreaterThan(Date.parse(firstExpiry));
  });
});

describe("settlement finality on the new shelves", () => {
  it("mints nothing anywhere when settlement fails", async () => {
    const patronsBefore = await testEnv.COUNTERS.get("patron_number");
    const anchorsBefore = await testEnv.PATRONS.list({ prefix: "anchor:" });
    facilitator.settleShouldFail = true;
    try {
      for (const url of [
        `${BASE}/api/buy/small_blessing`,
        `${BASE}/api/buy/daily_fortune`,
        `${BASE}/api/buy/context_anchor?summary=state`,
        `${BASE}/api/buy/human_witness`,
        `${BASE}/almanac/notes-from-a-tuesday-in-oak-city`,
      ]) {
        const response = await payFor(url);
        expect(response.status).toBe(402);
      }
    } finally {
      facilitator.settleShouldFail = false;
    }
    expect(await testEnv.COUNTERS.get("patron_number")).toBe(patronsBefore);
    const anchorsAfter = await testEnv.PATRONS.list({ prefix: "anchor:" });
    expect(anchorsAfter.keys.length).toBe(anchorsBefore.keys.length);
  });
});

describe("discovery surfaces", () => {
  it("serves both well-known x402 documents", async () => {
    const minimal = await json(await SELF.fetch(`${BASE}/.well-known/x402`));
    expect(minimal["version"]).toBe(1);
    const resources = minimal["resources"] as string[];
    expect(resources).toContain(`${BASE}/api/buy/hello`);
    expect(resources).toContain(
      `${BASE}/almanac/notes-from-a-tuesday-in-oak-city`,
    );

    const full = await json(await SELF.fetch(`${BASE}/.well-known/x402.json`));
    expect(full["x402Version"]).toBe(2);
    expect(full["network"]).toBe("eip155:8453");
    expect((full["resources"] as unknown[]).length).toBeGreaterThan(19);
  });

  it("serves OpenAPI 3.1 and links it from the homepage", async () => {
    const openapi = await json(await SELF.fetch(`${BASE}/openapi.json`));
    expect(openapi["openapi"]).toBe("3.1.0");
    const paths = openapi["paths"] as Record<string, unknown>;
    expect(paths["/api/buy/{item_id}"]).toBeTruthy();
    expect(paths["/gazette/issue-{issue_number}"]).toBeTruthy();

    const home = await (await SELF.fetch(`${BASE}/`)).text();
    expect(home).toContain("/openapi.json");
  });

  it("negotiates markdown on the menu and item routes", async () => {
    const menuMd = await SELF.fetch(`${BASE}/menu.json`, {
      headers: { Accept: "text/markdown" },
    });
    expect(menuMd.headers.get("Content-Type")).toContain("text/markdown");
    expect(await menuMd.text()).toContain("| id | item | price |");

    const itemJson = await json(await SELF.fetch(`${BASE}/menu/luckies`));
    expect(itemJson["id"]).toBe("luckies");
    expect(itemJson["buy_url"]).toBe(`${BASE}/api/buy/luckies`);

    const itemMd = await SELF.fetch(`${BASE}/menu/luckies`, {
      headers: { Accept: "text/markdown" },
    });
    expect(itemMd.headers.get("Content-Type")).toContain("text/markdown");
    expect(await itemMd.text()).toContain("# a lucky (custodial)");

    const missing = await SELF.fetch(`${BASE}/menu/moon_deed`);
    expect(missing.status).toBe(404);
  });
});

describe("the house tradition", () => {
  it("stamps every response", async () => {
    for (const path of ["/", "/menu.json", "/no-such-aisle"]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.headers.get("X-House-Rule")).toBe("Argue properly. --7");
    }
  });

  it("marks badges divisible by seven", () => {
    const marked = renderPatronBadge({
      patronNumber: 21,
      date: "2026-07-22T00:00:00.000Z",
      verifyUrl: `${BASE}/api/verify/cert_test`,
    });
    // The seven moved to the lower-left corner when the seal took the right.
    expect(marked).toContain('x="30" y="276"');
    const plain = renderPatronBadge({
      patronNumber: 22,
      date: "2026-07-22T00:00:00.000Z",
      verifyUrl: `${BASE}/api/verify/cert_test`,
    });
    expect(plain).not.toContain('x="30" y="276"');
  });
});
