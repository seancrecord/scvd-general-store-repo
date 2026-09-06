import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { encodePngIndexed, fitCell, fitLine, renderCardPng, textWidth } from "@/lib/pixel-card";
import { cardLines } from "@/pages/passport-card";
import type { EndpointPassport } from "@/services/passport";

const BASE = "https://scvd.store";

const sample = {
  eyebrow: "scvd general store · oak city",
  title: "endpoint passport",
  host: "merchant.example",
  observed: "observed 2026-08-31",
  stale: "stale after 2026-09-14",
  footer: "gaps counted against the observer",
};

/**
 * THE SHARE CARD (2026-09-02). A pasted passport link unfurls into a
 * card drawn from the passport's own dates: who looked, when, which
 * host, when it goes stale. It is a colophon drawn large, and it must
 * never carry a verdict word — that would be the badge the house
 * refuses. The PNG is encoded by hand with no compressor, so the
 * bytes are exactly the pixels.
 */
describe("the PNG encoder", () => {
  it("emits a valid signature, IHDR, PLTE, IDAT and IEND for a tiny two-colour image", () => {
    const png = encodePngIndexed(2, 1, new Uint8Array([1, 0]), [[1, 2, 3], [4, 5, 6]], 1);
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const text = new TextDecoder("latin1").decode(png);
    expect(text).toContain("IHDR");
    expect(text).toContain("PLTE");
    expect(text).toContain("IDAT");
    expect([...png.slice(-8)]).toEqual([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    // width 2, height 1, 1-bit indexed
    expect([...png.slice(16, 24)]).toEqual([0, 0, 0, 2, 0, 0, 0, 1]);
    expect(png[24]).toBe(1);
    expect(png[25]).toBe(3);
  });

  it("draws a card of the declared size, light enough for every unfurler", () => {
    const png = renderCardPng(sample);
    expect([...png.slice(16, 24)]).toEqual([0, 0, 4, 176, 0, 0, 2, 118]); // 1200 x 630
    // Four bits a pixel for the sixteen-step ink ramp (2026-09-05):
    // anti-aliased type costs about four times a one-bit card and is
    // still far under what any unfurler will fetch.
    expect(png[24]).toBe(4);
    expect(png.length).toBeGreaterThan(300_000);
    expect(png.length).toBeLessThan(450_000);
  });

  it("shrinks a long host to fit rather than cutting it", () => {
    const usable = 1200 - 92 * 2;
    expect(fitCell("a.example", 9, usable)).toBe(9);
    expect(fitCell("a-very-long-subdomain.of-a-long-merchant-name.example", 9, usable)).toBeLessThan(9);
    // Whatever it settles on actually fits, which is the point of it —
    // shrinking to a floor and then cutting, rather than overrunning
    // the card the way a floor-only fit did.
    for (const host of ["a.example", "a-very-long-subdomain.of-a-long-merchant-name.example", "x".repeat(120)]) {
      const line = fitLine(host, 9, usable);
      expect(textWidth(line.text, { cell: line.cell })).toBeLessThanOrEqual(usable);
    }
    expect(fitLine("a.example", 9, usable).text).toBe("a.example");
    expect(fitLine("x".repeat(120), 9, usable).text.endsWith("-")).toBe(true);
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
    const content = cardLines(fake);
    expect(content).toEqual({
      eyebrow: "scvd general store · oak city",
      title: "endpoint passport",
      host: "merchant.example",
      observed: "observed 2026-08-31",
      stale: "stale after 2026-09-14",
      footer: "gaps counted against the observer",
    });
    const joined = Object.values(content).join(" ").toLowerCase();
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

describe("the mark, and the ground it sits on (2026-09-06)", () => {
  it("flattens the store's own dino path into fillable rings", async () => {
    const { flattenPath } = await import("@/lib/pixel-card");
    const { DINO_PATH } = await import("@/services/favicon");
    const rings = flattenPath(DINO_PATH, (x, y) => [x, y]);
    // The mark is five subpaths: the body, its details and two eyes.
    expect(rings.length).toBe(5);
    for (const ring of rings) expect(ring.length).toBeGreaterThan(8);
    // Curves are flattened, so a ring carries far more points than the
    // path has commands — a straight-line reading would be a wrong shape.
    expect(rings[0]!.length).toBeGreaterThan(100);
  });

  it("refuses a path command it cannot draw rather than guessing a shape", async () => {
    const { flattenPath } = await import("@/lib/pixel-card");
    // Arcs and quadratics are not implemented; a silent wrong shape on
    // the store's own mark is worse than a build that stops.
    expect(() => flattenPath("M0 0 A 5 5 0 0 1 10 10", (x, y) => [x, y])).toThrow();
  });

  it("draws on the dark ground the chip uses, not the old cream", async () => {
    const png = renderCardPng(sample);
    // The PLTE chunk's first entry is the field; it is dark now.
    const text = new TextDecoder("latin1").decode(png);
    const at = text.indexOf("PLTE") + 4;
    const [r, g, b] = [png[at]!, png[at + 1]!, png[at + 2]!];
    expect(r + g + b).toBeLessThan(120);
    // And the last entry is the warm ink it sets type in.
    const last = at + (16 - 1) * 3;
    expect(png[last]! + png[last + 1]! + png[last + 2]!).toBeGreaterThan(600);
  });
});
