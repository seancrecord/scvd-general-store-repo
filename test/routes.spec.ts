import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "@/types";
import { mintCertificate } from "@/services/certificates";
import { verifyCertificateSignature } from "@/lib/signing";
import { isRecord } from "@/types";
import { getMenuItem } from "@/store";

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
    expect(html).toContain("a lucky");
    // Mobile rendering depends on the viewport meta tag.
    expect(html).toContain('name="viewport"');
  });

  it("welcomes crawlers and maps the human rooms", async () => {
    const robots = await SELF.fetch(`${BASE}/robots.txt`);
    expect(robots.status).toBe(200);
    const robotsText = await robots.text();
    expect(robotsText).toContain("Allow: /");
    expect(robotsText).not.toContain("Disallow");
    expect(robotsText).toContain(`Sitemap: ${BASE}/sitemap.xml`);

    const sitemap = await SELF.fetch(`${BASE}/sitemap.xml`);
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get("Content-Type")).toContain("application/xml");
    const xml = await sitemap.text();
    expect(xml).toContain(`<loc>${BASE}/</loc>`);
    expect(xml).toContain(`<loc>${BASE}/what</loc>`);
    expect(xml).toContain(`<loc>${BASE}/gazette</loc>`);
    // The API stays off the sitemap; llms.txt is its map.
    expect(xml).not.toContain("/api/");
  });

  it("serves the complete guide, shelf and all, at llms-full.txt", async () => {
    /*
     * Renamed 2026-08-27. The shelf WAS inline in llms.txt, all 27,000
     * characters of it, which is most of why that file was 90kB
     * against a 30,000-character convention. It now files under
     * /menu/llms.txt, and /llms-full.txt is the whole guide — the path
     * the convention reserves for exactly that.
     */
    const response = await SELF.fetch(`${BASE}/llms-full.txt`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("luckies");
    // Derived: luckies moved to $0.99 on 2026-08-28 and this line
    // asserted a typed $5. What it is really checking is that the
    // guide quotes the SHELF, so read the shelf.
    expect(text).toContain(
      `$${getMenuItem("luckies")?.price_usdc} minimum`,
    );
    expect(text).toContain("x402");
    expect(text).toContain("you get your money back");
  });

  it("serves the machine-readable menu with every shelf stocked", async () => {
    const response = await SELF.fetch(`${BASE}/menu.json`);
    expect(response.status).toBe(200);
    const body = await json(response);
    const items = body["items"] as Array<{ id: string }>;
    // CHEAP DOOR FIRST, then the S1 ladder — reordered 2026-07-29.
    // The old order buried settlement_attestation, the cheapest item in
    // the store at $0.004, in EIGHTH place behind a $15 human witness,
    // because the ladder ran in file order once past the penny shelf.
    // The one persona with observed traffic scans for the smallest
    // number it can settle without asking a human.
    expect(items.map((item) => item.id)).toEqual([
      // $0.001, the floor since 2026-08-26: the pre-transaction read
      // sits exactly where the smallest-number scanner looks first.
      "spot_check",
      "settlement_attestation",
      "small_blessing",
      // $0.006, third by price: the reconciliation is the attestation's
      // question one turn deeper, and lands beside it for the same
      // persona that made the cheap-door reorder worth doing.
      "settlement_reconciliation",
      // Two pennies, tied, in Penny Shelf file order: the fortune
      // (relisted 2026-09-02) ahead of the confession.
      "daily_fortune",
      "the_confession",
      "attestation_bundle",
      // A dime: the mandate rides the cheap-door region on purpose —
      // the thing you buy BEFORE anything goes wrong should be among
      // the first prices a scanning agent sees.
      "the_mandate",
      // A quarter (2026-09-02): the case file, between the dime and the
      // fifty-cent hello.
      "the_case_file",
      "hello",
      /*
       * THE $0.99 BLOCK, new on 2026-08-28 and the shelf's own rule
       * doing its job rather than a hand-placement. Five doors that a
       * stock x402 client could never buy — its default ceiling is $1
       * and it refuses locally, before signing — were repriced under
       * that ceiling. The ladder puts everything at or under a dollar
       * first, cheapest first, so they moved here on their own. All
       * five tie at $0.99 and hold LADDER order among themselves:
       * utility shelf in file order, then the novelty shelf.
       *
       * The cost, stated: a scanner now meets thirteen sub-dollar
       * doors before anything dearer, where it met eight. That is the
       * ladder's stated preference (the smallest number a
       * client-builder can settle should be easy to find), applied to
       * a shelf that changed under it.
       *
       * good_buyer JOINED THE BLOCK ON 2026-08-28 (#96) and leads it
       * by the same rule, not by preference: it sits earliest in the
       * utility shelf's file order among the $0.99 ties. Its price is
       * DERIVED from the same ceiling that created this block — one
       * cent under @x402/core's own cap — so if that constant ever
       * moves, this door moves out of the block with the rest rather
       * than being stranded here at a number somebody typed.
       */
      "good_buyer",
      "signature_agent_card",
      "the_statement",
      "luckies",
      "coffees_for_closers",
      // $1 ties hold LADDER order (stable sort): the anchor was listed
      // above the context anchor on the utility shelf, so it leads.
      "bitcoin_anchor",
      "context_anchor",
      // The third $1: the refresh sits after the anchors it followed
      // onto the utility shelf — same tie, same stable ladder order.
      "passport_refresh",
      "graffiti_on_a_train",
      "standing_watch",
      // $5 ties hold LADDER order too: the audit and the conformance
      // watch are listed right after the Night Watch on the utility
      // shelf — same ladder, adjacent rungs.
      "service_audit",
      "conformance_watch",
      // The on-page battery: two of its old shelf-mates (the card and
      // the statement) moved to the $0.99 block above, so it now
      // follows the conformance watch directly.
      "onpage_audit",
      /*
       * THE LAUNCH CHECK STAYED AT $5, and the reason is an economic
       * invariant rather than a preference. It pays out from the field
       * wallet on every check — it actually buys the door it walks —
       * and test/field-spend-invariant.spec.ts requires the price to
       * be at least 50x FIELD_SPEND_CAP_USD, because "slightly more"
       * is not a business once a facilitator fee and gas are counted.
       * $0.99 gave a ratio of 19.8. The floor that satisfies the
       * invariant is $2.50, which is ABOVE the stock client's ceiling
       * — so this door cannot be both sound and reachable by an
       * unconfigured buyer. It is disclosed instead, which is what
       * #52 part 1 was for.
       */
      "launch_check",
      // The Opening Day rides right behind the walk it bundles — $9,
      // listed after it on the utility shelf, same stable ladder.
      "opening_day",
      // The provenance check: $5, listed behind the bundle on the
      // utility shelf — same stable ladder.
      "provenance_check",
      "recurring_patronage",
      // The hosted profile's $19 slots between the patronages by
      // price — the ladder's stable sort, nothing hand-picked.
      "trust_profile",
      // The Operator's Statement ties the hosted profile at $21 and
      // follows it in the utility shelf's file order — the stable
      // ladder, nothing hand-picked.
      "operator_statement",
      "certificate_of_patronage",
      // The aura walk ($150, 2026-09-02) sits between the certificate
      // and the collab by price — the same stable ladder.
      "aura_walk",
      // The collab closes the ladder as the dearest thing here, and
      // the novelty shelf that used to trail it moved to the $0.99
      // block.
      "the_collab",
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
    expect(body["error"]).toContain("Don't have this... yet");
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
    expect(secondBody["message"]).toContain("Easy, friend");
    expect(secondBody["count"]).toBe(1);
  });
});

describe("waitlist and requests", () => {
  it("points a waitlist request at the shelf while stock remains", async () => {
    const response = await SELF.fetch(`${BASE}/api/waitlist/the_collab`, {
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
    expect(body["buy_url"]).toBe(`${BASE}/api/buy/the_collab`);
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

describe("keep's office", () => {
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
    expect(html).toContain("Keep's Office");
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
