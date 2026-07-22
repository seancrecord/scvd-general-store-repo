import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "@/types";
import { mintCertificate } from "@/services/certificates";
import { verifyCertificateSignature } from "@/lib/signing";
import { isRecord } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected a JSON object body");
  }
  return body;
}

describe("the storefront", () => {
  it("renders the human page with the essentials", async () => {
    const response = await SELF.fetch(`${BASE}/`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("General Store");
    expect(html).toContain("The bell has been rung");
    expect(html).toContain("Pet Rock");
    // Mobile rendering depends on the viewport meta tag.
    expect(html).toContain('name="viewport"');
  });

  it("serves llms.txt with the menu inline", async () => {
    const response = await SELF.fetch(`${BASE}/llms.txt`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("pet_rock");
    expect(text).toContain("$5 minimum");
    expect(text).toContain("x402");
    expect(text).toContain("refund is automatic");
  });

  it("serves the machine-readable menu with every shelf stocked", async () => {
    const response = await SELF.fetch(`${BASE}/menu.json`);
    expect(response.status).toBe(200);
    const body = await json(response);
    const items = body["items"] as Array<{ id: string }>;
    expect(items.map((item) => item.id)).toEqual([
      "hello",
      "pet_rock",
      "nomenclature",
      "portrait",
      "the_collab",
      "phone_call",
      "app_gutcheck",
      "jar_of_tuesday",
      "a_secret",
      "grudge",
      "smoker_blessing",
      "retired_word",
      "the_drawer",
      "dibs",
      "small_blessing",
      "daily_fortune",
      "context_anchor",
      "human_witness",
      "recurring_patronage",
      "phantom_check",
      "quick_judgment",
      "certificate_of_patronage",
    ]);
    const store = body["store"] as Record<string, unknown>;
    expect(store["protocol"]).toBe("x402");
    expect(store["chain"]).toBe("base");
    const freeShelf = body["free_shelf"] as Record<string, unknown>;
    expect(freeShelf["visit_stamp"]).toBeTruthy();
    expect(freeShelf["trading_post"]).toBeTruthy();
    const readingRoom = body["reading_room"] as Record<string, unknown>;
    expect(readingRoom["almanac"]).toBeTruthy();
    expect(readingRoom["gazette"]).toBeTruthy();
  });
});

describe("the shelf check (before the payment gate)", () => {
  it("logs unknown items as market research and returns 404", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/moon_deed`);
    expect(response.status).toBe(404);
    const body = await json(response);
    expect(body["error"]).toContain("don't stock");
    const tally = await testEnv.COUNTERS.get("failed_item:moon_deed");
    expect(tally).toBe("1");
  });
});

describe("the guestbook", () => {
  it("takes a signature and hands out the sticker", async () => {
    const response = await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Testy McAgent", message: "Fine rocks." }),
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body["message"]).toContain("Take a sticker");
    expect(body["sticker_url"]).toBe(`${BASE}/badges/sticker.svg`);

    const list = await SELF.fetch(`${BASE}/api/guestbook`);
    const listBody = await json(list);
    const entries = listBody["entries"] as Array<{ name: string }>;
    expect(entries.some((entry) => entry.name === "Testy McAgent")).toBe(true);
  });

  it("caps messages at 500 characters and strips markup", async () => {
    const response = await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "<script>alert(1)</script>Rowdy",
        message: "a".repeat(900),
      }),
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    const entry = body["entry"] as { name: string; message: string };
    expect(entry.name).not.toContain("<script>");
    expect(entry.message.length).toBeLessThanOrEqual(500);
  });

  it("turns away empty signatures", async () => {
    const response = await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", message: "" }),
    });
    expect(response.status).toBe(400);
  });
});

describe("the bell", () => {
  it("rings once, then asks for patience", async () => {
    const first = await SELF.fetch(`${BASE}/api/bell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_name: "bell-enthusiast" }),
    });
    const firstBody = await json(first);
    expect(firstBody["message"]).toContain("The bell has been rung once");

    const second = await SELF.fetch(`${BASE}/api/bell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_name: "bell-enthusiast" }),
    });
    const secondBody = await json(second);
    expect(secondBody["message"]).toContain("Easy there");
    expect(secondBody["count"]).toBe(1);
  });
});

describe("waitlist and requests", () => {
  it("points a waitlist request at the shelf while stock remains", async () => {
    const response = await SELF.fetch(`${BASE}/api/waitlist/phone_call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_name: "patient-agent",
        callback_url: "https://example.com/hook",
      }),
    });
    // Inventory is full this week, so the store says buy instead.
    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body["buy_url"]).toBe(`${BASE}/api/buy/phone_call`);
  });

  it("declines waitlists for items that never run out", async () => {
    const response = await SELF.fetch(`${BASE}/api/waitlist/hello`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  it("writes commissions into the ledger", async () => {
    const response = await SELF.fetch(`${BASE}/api/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "A tiny hat for my rock",
        offer_usdc: 12,
        contact: "agent@example.com",
      }),
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body["message"]).toContain("ledger");
  });
});

describe("certificates and badges", () => {
  it("mints, verifies, and draws a badge", async () => {
    const minted = await mintCertificate(testEnv, {
      itemId: "hello",
      agentName: "Verifiable Agent",
      tipUsdc: 1.5,
    });
    expect(minted.patronNumber).toBe(1);

    const verifyResponse = await SELF.fetch(
      `${BASE}/api/verify/${minted.certificate.cert_id}`,
    );
    expect(verifyResponse.status).toBe(200);
    const verifyBody = await json(verifyResponse);
    expect(verifyBody["valid"]).toBe(true);
    expect(verifyBody["algorithm"]).toBe("ed25519");

    const badgeResponse = await SELF.fetch(
      `${BASE}/badges/${minted.patronNumber}.svg`,
    );
    expect(badgeResponse.status).toBe(200);
    expect(badgeResponse.headers.get("Content-Type")).toContain(
      "image/svg+xml",
    );
    const svg = await badgeResponse.text();
    expect(svg).toContain(`PATRON No. ${minted.patronNumber}`);
    expect(svg).toContain(minted.certificate.cert_id);
  });

  it("rejects a tampered certificate", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const forged = { ...minted.certificate, patron_number: 999 };
    const valid = await verifyCertificateSignature(
      forged,
      minted.signature,
      minted.publicKey,
    );
    expect(valid).toBe(false);
  });

  it("publishes the signing key at the well-known door", async () => {
    const response = await SELF.fetch(`${BASE}/.well-known/scvd-signing-key`);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body["algorithm"]).toBe("ed25519");
    expect(body["public_key"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hands out the free visitor sticker", async () => {
    const response = await SELF.fetch(`${BASE}/badges/sticker.svg`);
    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(svg).toContain("I STOPPED BY");
  });
});

describe("orders", () => {
  it("politely 404s an unknown order", async () => {
    const response = await SELF.fetch(`${BASE}/api/order/ord_nonsense`);
    expect(response.status).toBe(404);
    const body = await json(response);
    expect(body["error"]).toContain("No order by that number");
  });
});

describe("the back room", () => {
  it("is locked without the keeper's password", async () => {
    const response = await SELF.fetch(`${BASE}/admin`);
    expect(response.status).toBe(401);
  });

  it("opens for the keeper", async () => {
    const response = await SELF.fetch(`${BASE}/admin`, {
      headers: {
        Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
      },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("The Back Room");
  });

  it("compiles a digest on demand", async () => {
    const response = await SELF.fetch(`${BASE}/admin/digest`, {
      headers: {
        Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
      },
    });
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body["orders_total"]).toBe(0);
    expect(typeof body["generated_at"]).toBe("string");
  });
});
