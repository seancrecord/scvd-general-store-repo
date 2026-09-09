import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { markdownCell } from "@/routes/pricing";

const BASE = "https://scvd.store";

/**
 * THE PRICE LIST IS THE SHELF, NOT A COPY OF IT (2026-09-09). A reader
 * comparing options asked /pricing.md for prices and found the rules
 * by which they are set — true, and not what it came for. The rows
 * are now derived from MENU_ITEMS at render time, and this holds them
 * to it: one row per priced door, the same count the frontmatter
 * prints, and no plan or tier invented to look like other people's
 * pricing pages.
 */
describe("the price list on /pricing.md", () => {
  it("lists every priced door, once, at the shelf's own count", async () => {
    const response = await SELF.fetch(`${BASE}/pricing.md`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const body = await response.text();

    expect(body).toContain("## The price list");
    expect(body).toContain("| Door | Price (USDC) | Cadence | What it is |");
    expect(body).toContain("no plans and no tiers");

    const priced = MENU_ITEMS.filter((item) => item.price_usdc > 0);
    const rows = body.split("\n").filter((line) => line.startsWith("| ["));
    expect(rows.length).toBe(priced.length);
    for (const item of priced) {
      expect(body, `${item.id} is priced and not on the list`).toContain(`\`${item.id}\``);
    }

    // The frontmatter's count and the table cannot disagree.
    const counted = Number(/^priced_doors:\s*(\d+)$/m.exec(body)?.[1]);
    expect(counted).toBe(rows.length);

    // Free doors are not rows: nothing priced at zero appears as one.
    for (const item of MENU_ITEMS.filter((entry) => entry.price_usdc === 0)) {
      expect(rows.some((row) => row.includes(`\`${item.id}\``))).toBe(false);
    }
  });

  it("is the same document /pricing serves to a markdown reader", async () => {
    const twin = await (await SELF.fetch(`${BASE}/pricing.md`)).text();
    const negotiated = await (
      await SELF.fetch(`${BASE}/pricing`, { headers: { Accept: "text/markdown" } })
    ).text();
    expect(negotiated).toBe(twin);
  });
});

/**
 * ONE TABLE CELL CANNOT BREAK ITS ROW (2026-09-09, CodeQL on PR #598).
 * The helper escaped pipes and not backslashes, so a backslash in the
 * text un-escaped the pipe this inserts. Order is the whole fix.
 */
describe("a markdown table cell", () => {
  it("escapes backslashes before pipes, so neither is left live", () => {
    expect(markdownCell("a|b")).toBe("a\\|b");
    // a\|b -> a\\\|b : the text's backslash doubled, then the pipe escaped.
    expect(markdownCell("a\\|b")).toBe("a\\\\\\|b");
    expect(markdownCell("back\\slash")).toBe("back\\\\slash");
    expect(markdownCell("  plain   text ")).toBe("plain text");
  });
});
