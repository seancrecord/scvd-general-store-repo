import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { fraction } from "@/pages/admin/reading-limits";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const BROWSER = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
  Accept: "text/html",
};

/**
 * A READING THAT NAMES NO BLINDNESS CLAIMS TO SEE EVERYTHING.
 *
 * Three pages had the habit — the funnel off its service's own list,
 * the market, the protocols page. Ten others asserted counts about
 * other people's doors, about who ever tried, about who the buyers
 * are, with nothing at all about what the instrument is blind to.
 *
 * The store's whole product is signed observation that publishes the
 * gaps it could not see. A back-room page is not the product, but a
 * keeper reasoning off a page with no stated limits is reasoning off
 * an account that looks complete and is not.
 *
 * This list is the pages that make a claim about a population. It is
 * deliberately not every page: the back shelf is levers and the files
 * are files, and a "what this cannot see" on those would be
 * decoration, which is worse than nothing because it is the shape of
 * disclosure without the substance.
 */
const MUST_NAME_LIMITS = [
  "/admin/ward",
  "/admin/mcp-ward",
  "/admin/census",
  "/admin/recount",
  "/admin/buyers",
  "/admin/funnel",
  "/admin/protocols",
] as const;

describe("readings that count a population say what they cannot see", () => {
  for (const href of MUST_NAME_LIMITS) {
    it(`${href} names its blindness`, async () => {
      const html = await (await SELF.fetch(`${BASE}${href}`, { headers: BROWSER })).text();
      expect(html, `${href} renders no limits block`).toContain("What this cannot see");
      // A heading with nothing under it is the shape of disclosure
      // without the substance.
      const block = html.slice(html.indexOf("What this cannot see"));
      expect(block.slice(0, 600), `${href} has an empty limits block`).toContain("<li>");
    });
  }

  it("prints a rate as the fraction it came from, never as a bare percentage", () => {
    // "40% disclose" off five calls and off five hundred are different
    // facts wearing the same number — the disclosure page's rule, now
    // everybody's.
    expect(fraction(2, 5)).toBe("2 of 5 (40%)");
    expect(fraction(200, 500)).toBe("200 of 500 (40%)");
    // A denominator of zero is said, not divided by.
    expect(fraction(0, 0)).toBe("0 of 0");
  });
});
