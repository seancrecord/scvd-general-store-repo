import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { STOREFRONT_ROOMS } from "@/store/rooms";

const BASE = "https://scvd.store";
const HTML = { headers: { Accept: "text/html" } };

/**
 * ROADMAP S2 — THE PASSPORT ON THE FRONT (the keeper's slot ruling,
 * 2026-09-01). Rule 43 / 54: a merchant shares a page that makes
 * them look observed, never approved. The colophon carries a date,
 * the gaps clause, a stale-after date and the link — and no verdict
 * word a badge would carry.
 */
describe("the passport room is on the storefront", () => {
  it("is in the derived room list and linked from the front", async () => {
    expect(STOREFRONT_ROOMS.map((room) => room.path)).toContain("/passport");
    const page = await (await SELF.fetch(`${BASE}/`, HTML)).text();
    expect(page).toContain('href="/passport"');
    expect(page).toContain("Was your x402 door observed?");
    expect(page).toContain("Not a badge, not a pass mark.");
    // Ahead of the shelves, with the other doors.
    expect(page.indexOf("Was your x402 door observed?")).toBeLessThan(
      page.indexOf("ON THE SHELVES"),
    );
  });
});

describe("a host's passport carries a share colophon", () => {
  const FORBIDDEN = ["preflight passed", "approved", "verified by", "certified", "✓"];

  it("in the JSON, outside the signed payload, derived from the summary", async () => {
    const body = (await (await SELF.fetch(`${BASE}/passport/scvd.store`)).json()) as {
      payload: { summary: { valid_until: string; observed_at: string | null } };
      colophon: string;
    };
    expect(body.colophon).toContain("Observed by scvd.store on ");
    expect(body.colophon).toContain("Gaps counted against the observer.");
    expect(body.colophon).toContain(`Stale after ${body.payload.summary.valid_until.slice(0, 10)}`);
    expect(body.colophon).toContain(`${BASE}/passport/scvd.store`);
    if (body.payload.summary.observed_at) {
      expect(body.colophon).toContain(body.payload.summary.observed_at.slice(0, 10));
    }
    for (const word of FORBIDDEN) {
      expect(body.colophon.toLowerCase()).not.toContain(word);
    }
  });

  it("offers the chip as something to paste, on the page and in the JSON (2026-09-03)", async () => {
    const body = (await (await SELF.fetch(`${BASE}/passport/scvd.store`)).json()) as {
      embed: { chip_svg: string; markdown: string; html: string; note: string };
    };
    expect(body.embed.chip_svg).toBe(`${BASE}/badges/passport/scvd.store.svg`);
    expect(body.embed.markdown).toContain(`(${BASE}/badges/passport/scvd.store.svg)`);
    expect(body.embed.markdown).toContain(`](${BASE}/passport/scvd.store)`);
    expect(body.embed.html).toContain(`<img src="${BASE}/badges/passport/scvd.store.svg"`);
    expect(body.embed.note).toContain("never stale-green");
    for (const word of FORBIDDEN) {
      expect(JSON.stringify(body.embed).toLowerCase()).not.toContain(word);
    }
    const page = await (await SELF.fetch(`${BASE}/passport/scvd.store`, HTML)).text();
    expect(page).toContain("To paste beside your door");
    expect(page).toContain(`/badges/passport/scvd.store.svg`);
    expect(page.indexOf("To paste beside your door")).toBeLessThan(page.indexOf("To share"));
    // The chip the snippet points at actually renders.
    const chip = await SELF.fetch(`${BASE}/badges/passport/scvd.store.svg`);
    expect(chip.status).toBe(200);
    expect(chip.headers.get("content-type")).toContain("svg");
  });

  it("on the page, as text to paste, with a markdown form", async () => {
    const page = await (await SELF.fetch(`${BASE}/passport/scvd.store`, HTML)).text();
    expect(page).toContain("To share");
    expect(page).toContain("A colophon, not a badge");
    expect(page).toContain("Observed by scvd.store on ");
    expect(page).toContain("Stale after ");
    expect(page).toContain(`](${BASE}/passport/scvd.store)`);
    const section = page.slice(page.indexOf("To share"));
    for (const word of FORBIDDEN) {
      expect(section.toLowerCase()).not.toContain(word);
    }
  });
});
