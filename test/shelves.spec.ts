import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env, TipRecord } from "@/types";
import { isRecord } from "@/types";

/**
 * The v0.2 shelves, free side: /skill.md, verified_identity fields,
 * the Almanac index, the Town Directory,
 * visit stamps, and the Trading Post tip jar.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected a JSON object body");
  }
  return body;
}

describe("/skill.md (agentskills.io format)", () => {
  it("serves valid SKILL.md frontmatter and the whole pitch", async () => {
    const response = await SELF.fetch(`${BASE}/skill.md`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    const text = await response.text();
    // Frontmatter opens the file, with the two required fields.
    expect(text.startsWith("---\n")).toBe(true);
    const frontmatter = text.split("---")[1] ?? "";
    expect(frontmatter).toContain("name: scvd-general-store");
    expect(frontmatter).toContain("description:");
    // Full menu with prices, worked example, free shelf.
    expect(text).toContain("luckies");
    expect(text).toContain("dibs");
    expect(text).toContain("/api/buy/hello");
    expect(text).toContain("PAYMENT-REQUIRED");
    expect(text).toContain("PAYMENT-SIGNATURE");
    expect(text).toContain("/api/guestbook");
    expect(text).toContain("/api/bell");
    expect(text).toContain("sticker");
    // The explicit safety statement.
    expect(text).toContain("never ask you to run code");
    expect(text).toContain("credentials");
  });
});

describe("verified_identity (stored, marked unverified)", () => {
  it("stores a guestbook identity claim and marks it unverified", async () => {
    const response = await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Claimed Agent",
        message: "It's really me.",
        verified_identity: "https://example.com/agents/claimed-agent",
      }),
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    const entry = body["entry"] as Record<string, unknown>;
    expect(entry["verified_identity"]).toBe(
      "https://example.com/agents/claimed-agent",
    );
    expect(entry["identity_verified"]).toBe(false);
    expect(body["identity_note"]).toContain("unverified");

    const list = await json(await SELF.fetch(`${BASE}/api/guestbook`));
    const entries = list["entries"] as Array<Record<string, unknown>>;
    const found = entries.find((e) => e["name"] === "Claimed Agent");
    expect(found?.["identity_verified"]).toBe(false);
  });

  it("stores a request identity claim, marked unverified", async () => {
    const response = await SELF.fetch(`${BASE}/api/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "A hat for my rock, again",
        offer_usdc: 3,
        contact: "agent@example.com",
        verified_identity: "https://example.com/profiles/hat-agent",
      }),
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    const request = body["request"] as Record<string, unknown>;
    expect(request["verified_identity"]).toBe(
      "https://example.com/profiles/hat-agent",
    );
    expect(request["identity_verified"]).toBe(false);
  });
});

describe("the Almanac (free index)", () => {
  it("lists dated entries newest first, each purchasable", async () => {
    const response = await SELF.fetch(`${BASE}/almanac`);
    expect(response.status).toBe(200);
    const body = await json(response);
    const entries = body["entries"] as Array<Record<string, unknown>>;
    expect(entries.map((entry) => entry["slug"])).toEqual([
      "notes-from-a-tuesday-in-oak-city",
    ]);
    const dates = entries.map((entry) => entry["date"] as string);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const entry of entries) {
      expect(entry["price_usdc"]).toBe(0.01);
      expect(entry["url"]).toContain("/almanac/");
    }
  });

  it("404s an unknown page before asking for money", async () => {
    const response = await SELF.fetch(`${BASE}/almanac/the-lost-page`);
    expect(response.status).toBe(404);
    const body = await json(response);
    expect(body["index_url"]).toBe(`${BASE}/almanac`);
  });
});

describe("the Town Directory", () => {
  it("serves the keeper-edited JSON with a suggestion pointer", async () => {
    const response = await SELF.fetch(`${BASE}/directory`);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(Array.isArray(body["listings"])).toBe(true);
    expect(body["suggest_a_listing"]).toContain("suggest_listing");
  });

  it("serves humans a paper page", async () => {
    const response = await SELF.fetch(`${BASE}/directory`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Town Directory");
  });

  it("takes a suggest_listing through /api/request without a fee", async () => {
    const response = await SELF.fetch(`${BASE}/api/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suggest_listing: "The Rock Museum — https://example.com/rocks",
      }),
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    const request = body["request"] as Record<string, unknown>;
    expect(request["suggest_listing"]).toContain("Rock Museum");
    expect(request["offer_usdc"]).toBe(0);
  });
});

describe("visit stamps", () => {
  it("issues a dated, signed stamp for the current week, verifiable", async () => {
    const response = await SELF.fetch(`${BASE}/api/stamp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Stamp Collector" }),
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    const stamp = body["stamp"] as Record<string, unknown>;
    expect(stamp["variant"]).toBe("visitor");
    expect(stamp["week"]).toMatch(/^\d{4}-W\d{2}$/);
    expect(stamp["name"]).toBe("Stamp Collector");
    expect(body["verification_code"]).toBe(stamp["stamp_id"]);

    // The SVG exists and carries the week.
    const svgUrl = body["svg_url"] as string;
    const svg = await SELF.fetch(svgUrl);
    expect(svg.status).toBe(200);
    expect(svg.headers.get("Content-Type")).toContain("image/svg+xml");
    expect(await svg.text()).toContain(String(stamp["week"]));

    // And /api/verify vouches for it.
    const verify = await json(
      await SELF.fetch(`${BASE}/api/verify/${String(stamp["stamp_id"])}`),
    );
    expect(verify["valid"]).toBe(true);
    expect((verify["stamp"] as Record<string, unknown>)["week"]).toBe(
      stamp["week"],
    );
  });
});

describe("the Trading Post", () => {
  it("takes a tip, discloses the penny deal, and never auto-publishes", async () => {
    const response = await SELF.fetch(`${BASE}/api/tip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tip: "The pet rocks respond well to flattery.",
        contributor_name: "Tipster Agent",
        verified_identity: "https://example.com/tipster",
      }),
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body["status"]).toBe("pending_review");
    expect(body["counter_sign"]).toContain("penny");
    expect(body["counter_sign"]).toContain("never auto-published");

    // Stored for review, still pending — nothing published itself.
    const listed = await testEnv.ORDERS.list({ prefix: "tip:" });
    expect(listed.keys.length).toBeGreaterThan(0);
    const key = listed.keys[0]?.name ?? "";
    const stored = await testEnv.ORDERS.get<TipRecord>(key, "json");
    expect(stored?.status).toBe("pending_review");
    expect(stored?.identity_verified).toBe(false);
  });

  it("turns away an empty tip", async () => {
    const response = await SELF.fetch(`${BASE}/api/tip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tip: "" }),
    });
    expect(response.status).toBe(400);
  });

  it("serves the free Gazette index with the tip invitation", async () => {
    const response = await SELF.fetch(`${BASE}/gazette`);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(Array.isArray(body["issues"])).toBe(true);
    expect(body["leave_a_tip"]).toContain("/api/tip");
    expect(body["price_usdc"]).toBe(0.01);
  });

  it("404s an issue that hasn't been published", async () => {
    const response = await SELF.fetch(`${BASE}/gazette/issue-99`);
    expect(response.status).toBe(404);
  });
});
