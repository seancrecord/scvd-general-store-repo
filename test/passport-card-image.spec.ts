import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { encodePng, fitCell, renderCardPng } from "@/lib/pixel-card";
import { cardLines } from "@/pages/passport-card";
import type { EndpointPassport } from "@/services/passport";

const BASE = "https://scvd.store";

/**
 * THE SHARE CARD (2026-09-02). A pasted passport link unfurls into a
 * card drawn from the passport's own dates: who looked, when, which
 * host, when it goes stale. It is a colophon drawn large, and it must
 * never carry a verdict word — that would be the badge the house
 * refuses. The PNG is encoded by hand with no compressor, so the
 * bytes are exactly the pixels.
 */
describe("the PNG encoder", () => {
  it("emits a valid signature, IHDR, IDAT and IEND for a tiny image", () => {
    const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 0, 255, 0]));
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const text = new TextDecoder("latin1").decode(png);
    expect(text).toContain("IHDR");
    expect(text).toContain("IDAT");
    expect([...png.slice(-8)]).toEqual([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    // width 2, height 1, 8-bit truecolour
    expect([...png.slice(16, 24)]).toEqual([0, 0, 0, 2, 0, 0, 0, 1]);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(2);
  });

  it("draws a card of the declared size", () => {
    const png = renderCardPng([{ text: "hello", cell: 8 }]);
    expect([...png.slice(16, 24)]).toEqual([0, 0, 4, 176, 0, 0, 2, 118]); // 1200 x 630
    expect(png.length).toBeGreaterThan(1200 * 630 * 3);
  });

  it("shrinks a long host to fit rather than cutting it", () => {
    expect(fitCell("a.example", 9)).toBe(9);
    expect(fitCell("a-very-long-subdomain.of-a-long-merchant-name.example", 9)).toBeLessThan(9);
    expect(fitCell("x".repeat(400), 9)).toBe(3);
  });
});

describe("the card's lines are a colophon, never a badge", () => {
  const fake = {
    payload: {
      host: "Merchant.Example",
      summary: { observed_at: "2026-08-31T11:00:00.000Z", valid_until: "2026-09-14T11:00:00.000Z", decision: "READY", verdict: "ready" },
    },
  } as unknown as EndpointPassport;

  it("names who looked, when, the host and the stale date, and nothing about the verdict", () => {
    const lines = cardLines(fake).map((line: { text: string }) => line.text);
    expect(lines).toEqual([
      "observed by scvd.store",
      "on 2026-08-31",
      "merchant.example",
      "stale after 2026-09-14",
      "gaps counted against the observer",
    ]);
    const joined = lines.join(" ").toLowerCase();
    for (const word of ["ready", "not_ready", "passed", "verified", "approved"]) {
      expect(joined).not.toContain(word);
    }
  });
});

describe("the card door", () => {
  it("serves a PNG for a host with a passport, cached a day", async () => {
    const response = await SELF.fetch(`${BASE}/passport/card/scvd.store.png`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("max-age=86400");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("draws nothing for a host nobody observed", async () => {
    const response = await SELF.fetch(`${BASE}/passport/card/never-observed.example.png`);
    expect(response.status).toBe(404);
  });

  it("is the host page's own social image, and is shown on the page", async () => {
    const page = await (await SELF.fetch(`${BASE}/passport/scvd.store`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain(`<meta property="og:image" content="${BASE}/passport/card/scvd.store.png">`);
    expect(page).toContain(`<meta name="twitter:image" content="${BASE}/passport/card/scvd.store.png">`);
    expect(page).toContain(`<img src="${BASE}/passport/card/scvd.store.png"`);
    // Every other page keeps the dino.
    const home = await (await SELF.fetch(`${BASE}/corpus`, { headers: { Accept: "text/html" } })).text();
    expect(home).toContain(`<meta property="og:image" content="${BASE}/og.png">`);
  });
});
